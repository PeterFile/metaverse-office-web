const { execFile } = require('node:child_process');
const { createHash } = require('node:crypto');
const { appendFile, mkdir, readFile } = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');

const {
  OFFICE_ZONES,
  SEED_AGENTS,
  deriveAgentOverviewSeverity,
  deriveLocationForEvent,
  deriveLocationForState,
  deriveStalenessSeverity,
  getAgentById,
  getWatchEdges,
  MEANINGFUL_OUTPUT_EVENT_TYPES,
  validateEventPayload
} = require('../domain');
const {
  createEvidenceCoverageLedger,
  createSharedArtifactRollup
} = require('../collectors/controller-snapshot');

const COLLECTOR_ALERT_SOURCE = 'controller_snapshot';
const COLLECTOR_SNAPSHOT_RECORD_KIND = 'collector_snapshot';
const EVIDENCE_RECORD_KIND = 'evidence_record';
const INBOUND_WORKSPACE_FILES = new Set(['inbox.md']);
const AGENT_OUTPUT_WORKSPACE_ROLES = new Set(['agent_output', 'agent_plan']);
const NON_OUTPUT_WORKSPACE_ROLES = new Set(['inbound_task', 'workspace_presence']);
const EVIDENCE_RECORD_SOURCE_KINDS = Object.freeze([
  'workspace_root',
  'workspace_file',
  'tmux_observation',
  'hermes_profile',
  'hermes_session',
  'kanban_fixture',
  'linear_fixture',
  'slack_fixture',
  'task_fixture'
]);
const TASK_EVIDENCE_SOURCE_KINDS = new Set([
  'kanban_fixture',
  'linear_fixture',
  'slack_fixture',
  'task_fixture'
]);
const SAFE_TASK_EVIDENCE_VALUE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const TASK_EVIDENCE_WARNING_CODES = new Set(['agent_id suppressed']);
const UNSAFE_TASK_EVIDENCE_VALUE_PATTERNS = Object.freeze([
  /^xox[a-z]-/i,
  /^gh[opusr]_/i,
  /^github_pat_/i,
  /^sk-[A-Za-z0-9_-]{16,}$/i,
  /(?:^|[?&])(?:access_)?token=/i,
  /^[/~]/,
  /^[A-Za-z]:[\\/]/,
  /^https?:\/\/.+(?:hooks\.slack\.com|webhook|webhooks)/i
]);
const EVIDENCE_RECORD_ROLES = Object.freeze([
  'workspace_presence',
  'inbound_task',
  'agent_output',
  'agent_plan',
  'runtime_activity',
  'runtime_presence',
  'runtime_unmapped',
  'task_reference'
]);
const EVIDENCE_RECORD_SOURCE_STATUSES = Object.freeze(['observed', 'degraded', 'missing', 'error']);
const RUNTIME_SOURCE_GAP_STATUSES = Object.freeze(['degraded', 'missing', 'error']);
const execFileAsync = promisify(execFile);
const SEVERITY_RANK = Object.freeze({
  normal: 0,
  yellow: 1,
  orange: 2,
  red: 3
});
const ACTIVE_INCIDENT_STATUSES_BY_KIND = Object.freeze({
  peer_watch_alert: Object.freeze(['open']),
  handoff: Object.freeze(['waiting', 'started']),
  reboot: Object.freeze(['waiting', 'started', 'requested'])
});
const LIFECYCLE_INCIDENT_KINDS = new Set(['handoff', 'reboot']);
const INTERACTION_EVENT_DESCRIPTORS = Object.freeze({
  agent_asked_question: Object.freeze({
    interaction_type: 'question_reply',
    phase: 'start'
  }),
  agent_replied: Object.freeze({
    interaction_type: 'question_reply',
    phase: 'end'
  }),
  review_started: Object.freeze({
    interaction_type: 'review',
    phase: 'start'
  }),
  review_completed: Object.freeze({
    interaction_type: 'review',
    phase: 'end'
  }),
  agent_handoff_started: Object.freeze({
    interaction_type: 'handoff',
    phase: 'start'
  }),
  agent_handoff_completed: Object.freeze({
    interaction_type: 'handoff',
    phase: 'end'
  }),
  peer_watch_alert_raised: Object.freeze({
    interaction_type: 'peer_watch',
    phase: 'start'
  }),
  peer_watch_alert_resolved: Object.freeze({
    interaction_type: 'peer_watch',
    phase: 'end'
  }),
  meeting_started: Object.freeze({
    interaction_type: 'meeting',
    phase: 'start'
  }),
  meeting_ended: Object.freeze({
    interaction_type: 'meeting',
    phase: 'end'
  })
});

class JsonlRecordLog {
  constructor({ filePath }) {
    this.filePath = filePath;
  }

  async loadRecords() {
    await mkdir(path.dirname(this.filePath), { recursive: true });

    let content = '';
    try {
      content = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    if (!content.trim()) {
      return [];
    }

    const records = [];
    const lines = content.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line.trim()) {
        continue;
      }
      try {
        records.push(JSON.parse(line));
      } catch {
        throw new SyntaxError(`JSONL parse error: SyntaxError at line ${index + 1}`);
      }
    }
    return records;
  }

  async appendRecord(record) {
    await appendFile(this.filePath, `${JSON.stringify(record)}\n`, 'utf8');
  }

  async appendRecords(records) {
    if (records.length === 0) {
      return;
    }

    await appendFile(
      this.filePath,
      records.map((record) => JSON.stringify(record)).join('\n') + '\n',
      'utf8'
    );
  }
}

class SqliteRecordLog {
  constructor({ sqliteFilePath, sqliteBinPath = 'sqlite3' }) {
    this.filePath = sqliteFilePath;
    this.sqliteBinPath = sqliteBinPath;
  }

  async loadRecords() {
    await this.#ensureReady();
    const { stdout } = await this.#exec([
      this.filePath,
      '-json',
      'SELECT kind,payload_json FROM records ORDER BY seq;'
    ]);
    const rows = stdout.trim() ? JSON.parse(stdout) : [];
    return rows.map((row) => ({
      kind: row.kind,
      payload: JSON.parse(row.payload_json)
    }));
  }

  async appendRecord(record) {
    await this.#ensureReady();
    await this.appendRecords([record]);
  }

  async appendRecords(records) {
    await this.#ensureReady();
    if (records.length === 0) {
      return;
    }

    const statements = ['BEGIN IMMEDIATE;'];
    for (const record of records) {
      const kindHex = Buffer.from(record.kind, 'utf8').toString('hex');
      const payloadHex = Buffer.from(JSON.stringify(record.payload), 'utf8').toString('hex');
      const seqSql = '(SELECT seq FROM records ORDER BY seq DESC LIMIT 1)';
      statements.push(
        'INSERT INTO records(kind,payload_json)',
        `VALUES (CAST(X'${kindHex}' AS TEXT), CAST(X'${payloadHex}' AS TEXT));`,
        this.#createSidecarInsertSql(seqSql, record)
      );
    }
    statements.push('COMMIT;');

    await this.#exec([this.filePath, statements.join(' ')]);
  }

  async #ensureReady() {
    if (this.ready) {
      return;
    }

    try {
      await this.#exec(['--version']);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`sqlite3 binary not found: ${this.sqliteBinPath}`);
      }
      throw error;
    }

    await mkdir(path.dirname(this.filePath), { recursive: true });
    await this.#exec([
      this.filePath,
      [
        'PRAGMA journal_mode=WAL;',
        'CREATE TABLE IF NOT EXISTS records (',
        'seq INTEGER PRIMARY KEY AUTOINCREMENT,',
        'kind TEXT NOT NULL,',
        'payload_json TEXT NOT NULL,',
        'appended_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
        ');',
        'CREATE TRIGGER IF NOT EXISTS records_no_update',
        'BEFORE UPDATE ON records',
        'BEGIN',
        "SELECT RAISE(ABORT, 'records are append-only; UPDATE is not allowed');",
        'END;',
        'CREATE TRIGGER IF NOT EXISTS records_no_delete',
        'BEFORE DELETE ON records',
        'BEGIN',
        "SELECT RAISE(ABORT, 'records are append-only; DELETE is not allowed');",
        'END;',
        'CREATE TABLE IF NOT EXISTS record_index (',
        'seq INTEGER PRIMARY KEY,',
        'kind TEXT NOT NULL,',
        'event_id TEXT,',
        'evidence_id TEXT,',
        'agent_id TEXT,',
        'correlation_id TEXT,',
        'source_kind TEXT,',
        'ts TEXT,',
        'collected_at TEXT,',
        'observed_at TEXT,',
        'output_candidate INTEGER,',
        'evidence_role TEXT,',
        'source_status TEXT,',
        'collector_snapshot_id TEXT,',
        'FOREIGN KEY(seq) REFERENCES records(seq)',
        ');',
        'CREATE TABLE IF NOT EXISTS record_evidence_refs (',
        'seq INTEGER NOT NULL,',
        'evidence_ref TEXT NOT NULL,',
        'PRIMARY KEY(seq, evidence_ref),',
        'FOREIGN KEY(seq) REFERENCES records(seq)',
        ');',
        'CREATE INDEX IF NOT EXISTS idx_record_index_kind_seq',
        'ON record_index(kind, seq);',
        'CREATE INDEX IF NOT EXISTS idx_record_index_event_id',
        'ON record_index(event_id);',
        'CREATE INDEX IF NOT EXISTS idx_record_index_agent_id',
        'ON record_index(agent_id);',
        'CREATE INDEX IF NOT EXISTS idx_record_index_correlation_id',
        'ON record_index(correlation_id);',
        'CREATE INDEX IF NOT EXISTS idx_record_index_source_kind',
        'ON record_index(source_kind);',
        'CREATE INDEX IF NOT EXISTS idx_record_index_ts',
        'ON record_index(ts);',
        'CREATE INDEX IF NOT EXISTS idx_record_evidence_refs_ref',
        'ON record_evidence_refs(evidence_ref);'
      ].join(' ')
    ]);
    await this.#ensureRecordIndexColumns();
    await this.#ensureEvidenceLookupIndexes();
    await this.#backfillSidecars();
    this.ready = true;
  }

  async #ensureRecordIndexColumns() {
    const { stdout } = await this.#exec([
      this.filePath,
      '-json',
      'PRAGMA table_info(record_index);'
    ]);
    const rows = stdout.trim() ? JSON.parse(stdout) : [];
    const columns = new Set(rows.map((row) => row.name));
    const missingColumns = [
      ['evidence_role', 'TEXT'],
      ['source_status', 'TEXT'],
      ['collector_snapshot_id', 'TEXT']
    ].filter(([name]) => !columns.has(name));

    if (missingColumns.length === 0) {
      return;
    }

    await this.#exec([
      this.filePath,
      missingColumns
        .map(([name, type]) => `ALTER TABLE record_index ADD COLUMN ${name} ${type};`)
        .join(' ')
    ]);
  }

  async #ensureEvidenceLookupIndexes() {
    await this.#exec([
      this.filePath,
      [
        'CREATE INDEX IF NOT EXISTS idx_record_index_evidence_role',
        'ON record_index(evidence_role);',
        'CREATE INDEX IF NOT EXISTS idx_record_index_source_status',
        'ON record_index(source_status);',
        'CREATE INDEX IF NOT EXISTS idx_record_index_collector_snapshot_id',
        'ON record_index(collector_snapshot_id);',
        'CREATE INDEX IF NOT EXISTS idx_record_index_output_candidate',
        'ON record_index(output_candidate);',
        'CREATE INDEX IF NOT EXISTS idx_record_index_collected_at',
        'ON record_index(collected_at);',
        'CREATE INDEX IF NOT EXISTS idx_record_index_observed_at',
        'ON record_index(observed_at);',
        'CREATE INDEX IF NOT EXISTS idx_record_index_evidence_query',
        'ON record_index(kind, agent_id, source_kind, evidence_role, output_candidate, source_status, collector_snapshot_id, correlation_id, seq);'
      ].join(' ')
    ]);
  }

  async #backfillSidecars() {
    const { stdout } = await this.#exec([
      this.filePath,
      '-json',
      [
        'SELECT seq,kind,payload_json FROM records',
        'ORDER BY seq;'
      ].join(' ')
    ]);
    const rows = stdout.trim() ? JSON.parse(stdout) : [];

    for (const row of rows) {
      await this.#exec([
        this.filePath,
        [
          'BEGIN IMMEDIATE;',
          `DELETE FROM record_evidence_refs WHERE seq = ${row.seq};`,
          this.#createSidecarInsertSql(String(row.seq), {
            kind: row.kind,
            payload: JSON.parse(row.payload_json)
          }),
          'COMMIT;'
        ].join(' ')
      ]);
    }
  }

  #createSidecarInsertSql(seqSql, record) {
    const index = createSqliteRecordIndex(record);
    const values = [
      seqSql,
      sqlText(index.kind),
      sqlText(index.event_id),
      sqlText(index.evidence_id),
      sqlText(index.agent_id),
      sqlText(index.correlation_id),
      sqlText(index.source_kind),
      sqlText(index.ts),
      sqlText(index.collected_at),
      sqlText(index.observed_at),
      sqlInteger(index.output_candidate),
      sqlText(index.evidence_role),
      sqlText(index.source_status),
      sqlText(index.collector_snapshot_id)
    ];
    const evidenceRefInserts = index.evidence_refs.map((evidenceRef) =>
      [
        'INSERT OR IGNORE INTO record_evidence_refs(seq,evidence_ref)',
        `VALUES (${seqSql}, ${sqlText(evidenceRef)});`
      ].join(' ')
    );

    return [
      'INSERT OR REPLACE INTO record_index(',
      'seq,kind,event_id,evidence_id,agent_id,correlation_id,source_kind,ts,collected_at,observed_at,output_candidate,evidence_role,source_status,collector_snapshot_id',
      `) VALUES (${values.join(', ')});`,
      ...evidenceRefInserts
    ].join(' ');
  }

  #exec(args) {
    return execFileAsync(this.sqliteBinPath, args, { maxBuffer: 16 * 1024 * 1024 });
  }
}

function createSqliteRecordIndex(record) {
  const payload = record.payload || {};
  const evidenceRefs = normalizeEvidenceRefs(
    record.kind === EVIDENCE_RECORD_KIND
      ? [payload.evidence_ref]
      : payload.evidence_refs
  );

  return {
    kind: record.kind,
    event_id: payload.event_id || null,
    evidence_id: payload.evidence_id || null,
    agent_id: payload.agent_id || null,
    correlation_id: payload.correlation_id || null,
    source_kind: payload.source_kind || null,
    ts: payload.ts || payload.received_at || null,
    collected_at: payload.collected_at || null,
    observed_at: payload.observed_at || null,
    output_candidate:
      typeof payload.output_candidate === 'boolean' ? payload.output_candidate : null,
    evidence_role: payload.evidence_role || null,
    source_status: payload.source_status || null,
    collector_snapshot_id: payload.collector_snapshot_id || null,
    evidence_refs: evidenceRefs
  };
}

function sqlText(value) {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  const hex = Buffer.from(String(value), 'utf8').toString('hex');
  return `CAST(X'${hex}' AS TEXT)`;
}

function sqlInteger(value) {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  return value ? '1' : '0';
}

class PrototypeStore {
  constructor({ filePath, recordLog }) {
    this.filePath = filePath;
    this.recordLog = recordLog || new JsonlRecordLog({ filePath });
    this.records = [];
    this.events = [];
    this.heartbeats = [];
    this.evidenceRecords = [];
    this.collectorReports = [];
    this.latestCollectorReport = null;
  }

  async load() {
    this.records = [];
    this.events = [];
    this.heartbeats = [];
    this.evidenceRecords = [];
    this.collectorReports = [];
    this.latestCollectorReport = null;

    for (const record of await this.recordLog.loadRecords()) {
      this.#applyRecord(record);
    }
  }

  async appendEvent(event) {
    const record = { kind: 'event', payload: event };
    await this.#appendRecord(record);
    return event;
  }

  async appendHeartbeat(heartbeat) {
    const record = { kind: 'heartbeat', payload: heartbeat };
    await this.#appendRecord(record);
    return heartbeat;
  }

  async appendCollectorReport(report) {
    const normalizedReport = normalizeCollectorReport(report, this.latestCollectorReport);
    const previousAgentProjections = new Map(
      this.listAgents().map((agent) => [agent.agent_id, agent])
    );
    const collectorActivityEvents = createCollectorActivityEvents({
      report: normalizedReport,
      previousAgentProjections
    });
    const collectorEvents = createCollectorSupervisionEvents({
      report: normalizedReport,
      existingEvents: this.events
    });
    const items = [];
    const records = [
      ...collectorActivityEvents,
      ...collectorEvents
    ].map((event) => ({
      kind: 'event',
      payload: event
    }));
    let appendedHeartbeatCount = 0;

    for (const item of normalizedReport.items || []) {
      if (!hasCollectorOutputEvidence(item)) {
        items.push(item);
        continue;
      }

      const heartbeat = item.heartbeat;
      records.push({
        kind: 'heartbeat',
        payload: heartbeat
      });
      appendedHeartbeatCount += 1;
      items.push({
        ...item,
        heartbeat
      });
    }

    const storedReport = {
      ...normalizedReport,
      summary: {
        ...(normalizedReport.summary || {}),
        heartbeat_count: appendedHeartbeatCount
      },
      items
    };

    for (const evidenceRecord of createCollectorEvidenceRecords(storedReport)) {
      const record = {
        kind: EVIDENCE_RECORD_KIND,
        payload: evidenceRecord
      };
      records.push(record);
    }

    const snapshotRecord = {
      kind: COLLECTOR_SNAPSHOT_RECORD_KIND,
      payload: storedReport
    };
    records.push(snapshotRecord);
    await this.#appendRecords(records);

    return this.latestCollectorReport;
  }

  async #appendRecord(record) {
    await this.recordLog.appendRecord(record);
    this.#applyRecord(record);
  }

  async #appendRecords(records) {
    if (records.length === 0) {
      return;
    }

    if (typeof this.recordLog.appendRecords === 'function') {
      await this.recordLog.appendRecords(records);
    } else {
      for (const record of records) {
        await this.recordLog.appendRecord(record);
      }
    }

    for (const record of records) {
      this.#applyRecord(record);
    }
  }

  #applyRecord(record) {
    this.records.push(record);

    if (record.kind === 'event') {
      this.events.push(record.payload);
      return;
    }

    if (record.kind === 'heartbeat') {
      this.heartbeats.push(record.payload);
      return;
    }

    if (record.kind === EVIDENCE_RECORD_KIND) {
      this.evidenceRecords.push(record.payload);
      return;
    }

    if (record.kind === COLLECTOR_SNAPSHOT_RECORD_KIND) {
      if (record.payload) {
        this.collectorReports.push(record.payload);
      }
      this.latestCollectorReport = record.payload || null;
    }
  }

  getLatestCollectorReport() {
    return this.latestCollectorReport;
  }

  getLatestCollectorEvidenceCoverage(filters = {}) {
    return projectCollectorEvidenceCoverage(this.getLatestCollectorReport(), filters);
  }

  getLatestCollectorSourceHealth(filters = {}) {
    return projectCollectorSourceHealth(
      findCollectorReportByIdOrLatest(this.collectorReports, this.getLatestCollectorReport(), filters),
      filters
    );
  }

  getCollectorSnapshotHistorySummary(filters = {}) {
    return projectCollectorSnapshotHistorySummary(this.collectorReports, filters);
  }

  getCollectorSnapshotDiff(filters = {}) {
    return projectCollectorSnapshotDiff(this.collectorReports, filters);
  }

  getReplayCheckpointSummary() {
    return projectReplayCheckpointSummary({
      records: this.records,
      counts: this.getCounts(),
      events: this.events,
      heartbeats: this.heartbeats,
      evidenceRecords: this.evidenceRecords,
      collectorReports: this.collectorReports
    });
  }

  getStorageReplayManifest() {
    return projectStorageReplayManifest(this.records);
  }

  listReplayCheckpointLog(filters = {}) {
    return projectReplayCheckpointLog({
      records: this.records,
      limit: parseLimit(filters.limit),
      filters
    });
  }

  listEvidenceRecords(filters = {}) {
    const { records, limit, newestFirst } = this.#filterEvidenceRecords(filters);

    return (newestFirst ? records.slice().sort(compareEvidenceRecordRecency) : records)
      .slice(0, limit)
      .map(cloneEvidenceRecord);
  }

  getEvidenceRecord(evidenceId) {
    const normalizedEvidenceId = normalizeFilterValue(evidenceId);
    if (!normalizedEvidenceId) {
      return null;
    }

    const record = this.evidenceRecords.find(
      (evidenceRecord) => evidenceRecord.evidence_id === normalizedEvidenceId
    );
    return record ? cloneEvidenceRecord(record) : null;
  }

  getEvidenceProvenanceBundle(evidenceId) {
    const record = this.getEvidenceRecord(evidenceId);
    if (!record) {
      return null;
    }

    return projectEvidenceProvenanceBundle(record);
  }

  getEvidenceSourceContext(evidenceId) {
    const record = this.getEvidenceRecord(evidenceId);
    if (!record) {
      return null;
    }

    const sourceFilters = {
      evidence_id: record.evidence_id,
      source_kind: record.source_kind,
      source_status: record.source_status,
      collector_snapshot_id: record.collector_snapshot_id,
      limit: 1
    };
    const healthFilters = {
      collector_snapshot_id: record.collector_snapshot_id,
      agent_id: record.agent_id,
      source_kind: record.source_kind,
      status: record.source_status,
      limit: 1
    };
    const sourceHealth =
      record.agent_id === null
        ? null
        : projectEvidenceSourceContextCollectorHealth(
            findCollectorReportByIdOrLatest(
              this.collectorReports,
              this.getLatestCollectorReport(),
              healthFilters
            ),
            healthFilters
          );

    return projectEvidenceSourceContext({
      record,
      sourceHealth: projectEvidenceSourceContextHealth(
        sourceHealth || createEmptyEvidenceSourceContextHealth(healthFilters)
      ),
      sourceGapsSummary: this.getRuntimeSourceGapsSummary(sourceFilters),
      sourceGapItems: this.listRuntimeSourceGaps(sourceFilters)
    });
  }

  listRuntimeSourceGaps(filters = {}) {
    const { records, limit, newestFirst } = this.#filterEvidenceRecords(filters);
    const gapRecords = records.filter(isRuntimeSourceGapRecord);

    return (newestFirst ? gapRecords.slice().sort(compareEvidenceRecordRecency) : gapRecords)
      .slice(0, limit)
      .map(projectRuntimeSourceGapRecord);
  }

  getRuntimeSourceGapsSummary(filters = {}) {
    const { records, limit } = this.#filterEvidenceRecords(filters);
    const gapRecords = records.filter(isRuntimeSourceGapRecord);
    const summary = {
      total_count: gapRecords.length,
      returned_limit: limit,
      mapped_count: 0,
      unmapped_count: 0,
      output_candidate_buckets: {
        true: 0,
        false: 0
      },
      source_kind_buckets: createZeroBuckets(EVIDENCE_RECORD_SOURCE_KINDS),
      evidence_role_buckets: createZeroBuckets(EVIDENCE_RECORD_ROLES),
      source_status_buckets: createZeroBuckets(EVIDENCE_RECORD_SOURCE_STATUSES),
      collector_snapshot_id_buckets: {},
      first_observed_at: null,
      last_observed_at: null,
      first_collected_at: null,
      last_collected_at: null
    };

    for (const record of gapRecords) {
      if (typeof record.agent_id === 'string' && record.agent_id.length > 0) {
        summary.mapped_count += 1;
      } else if (record.agent_id === null) {
        summary.unmapped_count += 1;
      }

      summary.output_candidate_buckets[String(record.output_candidate === true)] += 1;
      incrementBucket(summary.source_kind_buckets, record.source_kind);
      incrementBucket(summary.evidence_role_buckets, record.evidence_role);
      incrementBucket(summary.source_status_buckets, record.source_status);
      incrementBucket(summary.collector_snapshot_id_buckets, record.collector_snapshot_id);
      summary.first_observed_at = getEarliestEvidenceRecordIsoValue(
        summary.first_observed_at,
        record.observed_at
      );
      summary.last_observed_at = getLatestEvidenceRecordIsoValue(
        summary.last_observed_at,
        record.observed_at
      );
      summary.first_collected_at = getEarliestEvidenceRecordIsoValue(
        summary.first_collected_at,
        record.collected_at
      );
      summary.last_collected_at = getLatestEvidenceRecordIsoValue(
        summary.last_collected_at,
        record.collected_at
      );
    }

    return summary;
  }

  getEvidenceRecordFacets(filters = {}) {
    const { records, limit } = this.#filterEvidenceRecords(filters);
    const facets = createEmptyEvidenceRecordFacets(limit);

    for (const record of records) {
      incrementKnownBucket(facets.source_kind_buckets, record.source_kind);
      incrementKnownBucket(facets.evidence_role_buckets, record.evidence_role);
      incrementKnownBucket(facets.source_status_buckets, record.source_status);
      facets.output_candidate_buckets[String(record.output_candidate === true)] += 1;

      if (typeof record.agent_id === 'string' && record.agent_id.length > 0) {
        facets.mapped_buckets.mapped += 1;
        if (Object.hasOwn(facets.agent_id_buckets, record.agent_id)) {
          facets.agent_id_buckets[record.agent_id] += 1;
        }
      } else if (record.agent_id === null) {
        facets.mapped_buckets.unmapped += 1;
        facets.agent_id_buckets.unmapped += 1;
      }
    }

    facets.total_count = records.length;
    return facets;
  }

  getRuntimeSourceGapAgentSummary(filters = {}) {
    const { records, limit } = this.#filterEvidenceRecords(filters);
    const gapRecords = records.filter(isRuntimeSourceGapRecord);
    const groups = new Map();

    for (const record of gapRecords) {
      const groupKey = JSON.stringify([record.agent_id, record.source_kind || null]);
      if (!groups.has(groupKey)) {
        groups.set(groupKey, createRuntimeSourceGapAgentGroup(record));
      }

      addRuntimeSourceGapRecordToAgentGroup(groups.get(groupKey), record);
    }

    const sortedGroups = Array.from(groups.values())
      .map(sortRuntimeSourceGapAgentGroupBuckets)
      .sort(compareRuntimeSourceGapAgentGroups);

    return {
      total_count: gapRecords.length,
      total_groups: sortedGroups.length,
      returned_limit: limit,
      groups: sortedGroups.slice(0, limit)
    };
  }

  getRuntimeSourceGapLifecycle(filters = {}) {
    const { records, limit, newestFirst } = this.#filterEvidenceRecords(filters);
    const groups = new Map();

    for (const record of records.filter(isRuntimeSourceLifecycleRecord)) {
      const groupKey = JSON.stringify([
        record.agent_id,
        record.source_kind || null,
        record.evidence_role || null
      ]);
      if (!groups.has(groupKey)) {
        groups.set(groupKey, createRuntimeSourceGapLifecycleGroup(record));
      }

      addRuntimeSourceRecordToLifecycleGroup(groups.get(groupKey), record);
    }

    const lifecycleGroups = Array.from(groups.values())
      .filter((group) => group.has_lifecycle_signal)
      .map(projectRuntimeSourceGapLifecycleGroup)
      .sort((left, right) =>
        newestFirst
          ? compareRuntimeSourceGapLifecycleGroupsByRecency(left, right)
          : compareRuntimeSourceGapLifecycleGroups(left, right)
      );

    return {
      total_count: lifecycleGroups.reduce((total, group) => total + group.record_count, 0),
      total_groups: lifecycleGroups.length,
      returned_limit: limit,
      groups: lifecycleGroups.map(omitRuntimeSourceGapLifecycleRecordCount).slice(0, limit)
    };
  }

  getRuntimeSourceGapTrend(filters = {}) {
    const { records, limit, newestFirst } = this.#filterEvidenceRecords(filters);
    const bucket = normalizeRuntimeSourceGapTrendBucket(filters.bucket);
    const gapRecords = records.filter(isRuntimeSourceGapRecord);
    const buckets = new Map();

    for (const record of gapRecords) {
      const bucketStart = getRuntimeSourceGapTrendBucketStart(record, bucket);
      if (!bucketStart) {
        continue;
      }

      if (!buckets.has(bucketStart)) {
        buckets.set(bucketStart, createRuntimeSourceGapTrendBucket(bucketStart));
      }

      addRuntimeSourceGapRecordToTrendBucket(buckets.get(bucketStart), record);
    }

    const sortedBuckets = Array.from(buckets.values())
      .map(sortRuntimeSourceGapTrendBucket)
      .sort((left, right) =>
        newestFirst
          ? compareStringsAsc(right.bucket_start, left.bucket_start)
          : compareStringsAsc(left.bucket_start, right.bucket_start)
      );

    return {
      bucket,
      total_count: gapRecords.length,
      total_buckets: sortedBuckets.length,
      returned_limit: limit,
      buckets: sortedBuckets.slice(0, limit)
    };
  }

  getEvidenceRecordsSummary(filters = {}) {
    const { records, limit } = this.#filterEvidenceRecords(filters);
    const summary = {
      total_count: records.length,
      returned_limit: limit,
      mapped_count: 0,
      unmapped_count: 0,
      output_candidate_buckets: {
        true: 0,
        false: 0
      },
      source_kind_buckets: createZeroBuckets(EVIDENCE_RECORD_SOURCE_KINDS),
      evidence_role_buckets: createZeroBuckets(EVIDENCE_RECORD_ROLES),
      source_status_buckets: createZeroBuckets(EVIDENCE_RECORD_SOURCE_STATUSES),
      collector_snapshot_id_buckets: {},
      first_observed_at: null,
      last_observed_at: null,
      first_collected_at: null,
      last_collected_at: null
    };

    for (const record of records) {
      if (typeof record.agent_id === 'string' && record.agent_id.length > 0) {
        summary.mapped_count += 1;
      } else if (record.agent_id === null) {
        summary.unmapped_count += 1;
      }

      summary.output_candidate_buckets[String(record.output_candidate === true)] += 1;
      incrementBucket(summary.source_kind_buckets, record.source_kind);
      incrementBucket(summary.evidence_role_buckets, record.evidence_role);
      incrementBucket(summary.source_status_buckets, record.source_status);
      incrementBucket(summary.collector_snapshot_id_buckets, record.collector_snapshot_id);
      summary.first_observed_at = getEarliestEvidenceRecordIsoValue(
        summary.first_observed_at,
        record.observed_at
      );
      summary.last_observed_at = getLatestEvidenceRecordIsoValue(
        summary.last_observed_at,
        record.observed_at
      );
      summary.first_collected_at = getEarliestEvidenceRecordIsoValue(
        summary.first_collected_at,
        record.collected_at
      );
      summary.last_collected_at = getLatestEvidenceRecordIsoValue(
        summary.last_collected_at,
        record.collected_at
      );
    }

    return summary;
  }

  getEvidenceRefRollup(filters = {}) {
    const { records, limit } = this.#filterEvidenceRecords(filters);
    const groups = new Map();

    for (const record of records) {
      const evidenceRef = record.evidence_ref;
      if (typeof evidenceRef !== 'string' || evidenceRef.length === 0) {
        continue;
      }

      if (!groups.has(evidenceRef)) {
        groups.set(evidenceRef, {
          evidence_ref: evidenceRef,
          record_count: 0,
          mapped_count: 0,
          unmapped_count: 0,
          agent_id_buckets: {},
          source_kind_buckets: {},
          source_status_buckets: {}
        });
      }

      const group = groups.get(evidenceRef);
      group.record_count += 1;

      if (typeof record.agent_id === 'string' && record.agent_id.length > 0) {
        group.mapped_count += 1;
        incrementBucket(group.agent_id_buckets, record.agent_id);
      } else if (record.agent_id === null) {
        group.unmapped_count += 1;
        incrementBucket(group.agent_id_buckets, 'unmapped');
      }

      incrementBucket(group.source_kind_buckets, record.source_kind);
      incrementBucket(group.source_status_buckets, record.source_status);
    }

    const sortedGroups = Array.from(groups.values())
      .map(sortEvidenceRefRollupBuckets)
      .sort(compareEvidenceRefRollupGroups);

    return {
      total_count: records.length,
      total_groups: sortedGroups.length,
      returned_limit: limit,
      groups: sortedGroups.slice(0, limit)
    };
  }

  #filterEvidenceRecords(filters = {}) {
    const evidenceId = normalizeFilterValue(filters.evidence_id);
    const agentId = normalizeFilterValue(filters.agent_id);
    const sourceKind = normalizeFilterValue(filters.source_kind);
    const evidenceRole = normalizeFilterValue(filters.evidence_role);
    const outputCandidate = normalizeOptionalBoolean(filters.output_candidate);
    const evidenceRef = normalizeFilterValue(filters.evidence_ref);
    const sourceStatus = normalizeFilterValue(filters.source_status);
    const collectorSnapshotId = normalizeFilterValue(filters.collector_snapshot_id);
    const correlationId = normalizeFilterValue(filters.correlation_id);
    const mapped = normalizeOptionalBoolean(filters.mapped);
    const observedSince = parseOptionalTimestampFilter(filters.observed_since);
    const observedUntil = parseOptionalTimestampFilter(filters.observed_until);
    const collectedSince = parseOptionalTimestampFilter(filters.collected_since);
    const collectedUntil = parseOptionalTimestampFilter(filters.collected_until);
    const newestFirst = normalizeOptionalBoolean(filters.newest_first) === true;
    const limit = parseLimit(filters.limit);

    const records = this.evidenceRecords
      .filter((record) => !evidenceId || record.evidence_id === evidenceId)
      .filter((record) => !agentId || record.agent_id === agentId)
      .filter(
        (record) =>
          mapped === null ||
          (mapped
            ? typeof record.agent_id === 'string' && record.agent_id.length > 0
            : record.agent_id === null)
      )
      .filter((record) => !sourceKind || record.source_kind === sourceKind)
      .filter((record) => !evidenceRole || record.evidence_role === evidenceRole)
      .filter((record) => outputCandidate === null || record.output_candidate === outputCandidate)
      .filter((record) => !evidenceRef || record.evidence_ref === evidenceRef)
      .filter((record) => !sourceStatus || record.source_status === sourceStatus)
      .filter(
        (record) => !collectorSnapshotId || record.collector_snapshot_id === collectorSnapshotId
      )
      .filter((record) => !correlationId || record.correlation_id === correlationId)
      .filter((record) =>
        matchesTimestampWindow(record.observed_at, observedSince, observedUntil)
      )
      .filter((record) =>
        matchesTimestampWindow(record.collected_at, collectedSince, collectedUntil)
      );

    return { records, limit, newestFirst };
  }

  getCounts() {
    return {
      agent_count: SEED_AGENTS.length,
      event_count: this.events.length,
      heartbeat_count: this.heartbeats.length
    };
  }

  listAgents() {
    const projections = new Map(
      SEED_AGENTS.map((agent) => [agent.agent_id, createBaseProjection(agent)])
    );

    for (const record of this.records) {
      const snapshot = projections.get(record.payload.agent_id);
      if (!snapshot) {
        continue;
      }

      if (record.kind === 'event') {
        applyEvent(snapshot, record.payload);
        continue;
      }

      if (record.kind === 'heartbeat') {
        applyHeartbeat(snapshot, record.payload);
      }
    }

    return SEED_AGENTS.map((agent) => projections.get(agent.agent_id));
  }

  getAgent(agentId) {
    return this.listAgents().find((agent) => agent.agent_id === agentId) || null;
  }

  getAgentDetail(agentId, filters = {}) {
    const agent = this.getAgent(agentId);
    if (!agent) {
      return null;
    }

    const recentLimit = parseLimit(filters.limit || 5);

    return {
      ...agent,
      latest_heartbeat: this.getLatestHeartbeat(agentId),
      open_peer_watch_alerts: this.listOpenPeerWatchAlerts({
        target_agent_id: agentId,
        limit: recentLimit
      }),
      recent_events: this.listAgentEvents(agentId, {
        limit: recentLimit
      }),
      recent_interactions: this.listAgentInteractions(agentId, {
        limit: recentLimit,
        now: filters.now
      }),
      recent_incidents: this.listIncidents({
        agent_id: agentId,
        limit: recentLimit,
        now: filters.now
      }),
      recent_handoffs: this.listHandoffs({
        agent_id: agentId,
        limit: recentLimit
      }),
      recent_reboots: this.listReboots({
        agent_id: agentId,
        limit: recentLimit
      })
    };
  }

  getAgentEvidenceSpine(agentId, filters = {}) {
    const agent = this.getAgent(agentId);
    if (!agent) {
      return null;
    }

    const limit = parseLimit(filters.limit);
    const recordFilters = {
      agent_id: agentId,
      source_kind: filters.source_kind,
      evidence_role: filters.evidence_role,
      output_candidate: filters.output_candidate,
      source_status: filters.source_status,
      collector_snapshot_id: filters.collector_snapshot_id,
      correlation_id: filters.correlation_id,
      mapped: filters.mapped,
      observed_since: filters.observed_since,
      observed_until: filters.observed_until,
      collected_since: filters.collected_since,
      collected_until: filters.collected_until,
      newest_first: filters.newest_first,
      limit
    };
    const sourceHealth =
      normalizeOptionalBoolean(filters.mapped) === false
        ? projectCollectorSourceHealth(null, filters)
        : this.getLatestCollectorSourceHealth({
            collector_snapshot_id: filters.collector_snapshot_id,
            agent_id: agentId,
            source_kind: filters.source_kind,
            status: filters.source_status || filters.status,
            limit
          });

    return {
      agent_id: agentId,
      returned_limit: limit,
      evidence_summary: this.getEvidenceRecordsSummary(recordFilters),
      recent_evidence: this.listEvidenceRecords(recordFilters).map(projectAgentEvidenceSpineRecord),
      source_gaps: {
        summary: this.getRuntimeSourceGapsSummary(recordFilters),
        items: this.listRuntimeSourceGaps(recordFilters)
      },
      source_health: projectAgentEvidenceSpineSourceHealth(sourceHealth, filters) || {
        collected_at: null,
        collector_snapshot_id: null,
        actor_id: null,
        summary: createSourceHealthSummary([], resolveSourceHealthKeys(filters.source_kind), null),
        agent_items: []
      }
    };
  }

  getAgentEvidenceSpineSummary(filters = {}) {
    const recordFilters = { ...filters };
    delete recordFilters.mapped;
    const { records, limit } = this.#filterEvidenceRecords(recordFilters);
    const mapped = normalizeOptionalBoolean(filters.mapped);
    const agentIds = new Set(SEED_AGENTS.map((agent) => agent.agent_id));
    const agents = SEED_AGENTS.map(createAgentEvidenceSpineSummaryAgent);
    const agentsById = new Map(agents.map((agent) => [agent.agent_id, agent]));
    const unmappedEvidenceSummary = createUnmappedAgentEvidenceSummary();
    let mappedCount = 0;
    let totalCount = 0;

    for (const record of records) {
      const agentSummary = agentsById.get(record.agent_id);
      if ((mapped === true && !agentSummary) || (mapped === false && agentSummary)) {
        continue;
      }

      totalCount += 1;
      if (agentSummary) {
        mappedCount += 1;
        addEvidenceRecordToAgentEvidenceSummary(agentSummary, record);
        continue;
      }

      if (record.agent_id === null || !agentIds.has(record.agent_id)) {
        addEvidenceRecordToUnmappedAgentEvidenceSummary(unmappedEvidenceSummary, record);
      }
    }

    return {
      agent_count: agents.length,
      returned_limit: limit,
      total_count: totalCount,
      mapped_count: mappedCount,
      unmapped_count: unmappedEvidenceSummary.total_count,
      agents,
      unmapped_evidence_summary: unmappedEvidenceSummary
    };
  }

  getAgentWorkflow(agentId, filters = {}) {
    const limit = filters.limit === undefined ? null : filters.limit;
    const window = filters.window || '60m';
    const detail = this.getAgentDetail(agentId, {
      limit,
      now: filters.now
    });

    if (!detail) {
      return null;
    }

    const incidents = this.listIncidents({
      agent_id: agentId,
      window,
      limit,
      now: filters.now
    });
    const interactions = this.listAgentInteractions(agentId, {
      window,
      limit,
      now: filters.now
    });
    const timeline = this.listTimeline({
      agent_id: agentId,
      window,
      limit,
      now: filters.now
    });
    const summary = createWorkflowSummary({
      incidents,
      interactions,
      timeline
    });

    return {
      agent_id: agentId,
      detail,
      summary,
      correlation_ids: normalizeStringValues([
        ...incidents.map((incident) => incident.correlation_id),
        ...interactions.map((interaction) => interaction.correlation_id),
        ...timeline.map((event) => event.correlation_id)
      ]),
      counterparty_agent_ids: getWorkflowCounterpartyAgentIds({
        agentId,
        incidents,
        interactions,
        timeline
      }),
      incidents,
      interactions,
      timeline
    };
  }

  getLatestHeartbeat(agentId) {
    return this.heartbeats
      .filter((heartbeat) => heartbeat.agent_id === agentId)
      .slice()
      .sort((left, right) => getHeartbeatSortMs(right) - getHeartbeatSortMs(left))[0] || null;
  }

  listEvents(filters = {}) {
    const limit = parseLimit(filters.limit);

    return this.events
      .filter((event) => matchesEventFilters(event, filters))
      .slice()
      .sort((left, right) => Date.parse(right.ts) - Date.parse(left.ts))
      .slice(0, limit);
  }

  listAgentEvents(agentId, filters = {}) {
    return this.listEvents({ ...filters, agent_id: agentId });
  }

  listInteractions(filters = {}) {
    return listInteractionItems(this.events, filters);
  }

  listAgentInteractions(agentId, filters = {}) {
    return this.listInteractions({ ...filters, agent_id: agentId });
  }

  listTimeline(filters = {}) {
    return listTimelineItems(this.events, filters);
  }

  listMemoryArtifacts(filters = {}) {
    return listMemoryArtifactItems({
      events: this.events,
      latestCollectorReport: this.latestCollectorReport,
      filters
    });
  }

  getAccountabilityReplay(filters = {}) {
    const normalizedFilters = normalizeAccountabilityReplayFilters(filters);
    const evidenceRecord = this.getEvidenceRecord(normalizedFilters.evidence_id);
    const hasUnknownEvidenceId = normalizedFilters.evidence_id && !evidenceRecord;
    const replayFilters = resolveAccountabilityReplayEvidenceAnchor(
      normalizedFilters,
      evidenceRecord
    );
    const events = hasUnknownEvidenceId ? [] : this.listTimeline(replayFilters);
    const interactions = hasUnknownEvidenceId ? [] : this.listInteractions(replayFilters);
    const memoryArtifacts = hasUnknownEvidenceId
      ? []
      : listAccountabilityReplayArtifacts({
          store: this,
          filters: replayFilters,
          events,
          interactions
        });
    const ledger = createAccountabilityReplayLedger({
      events,
      interactions,
      memoryArtifacts,
      eventIds: new Set(this.events.map((event) => event.event_id))
    });
    const replayAudit = createAccountabilityReplayAudit({
      filters: normalizedFilters,
      evidenceRecord,
      events,
      interactions,
      memoryArtifacts,
      ledger
    });

    return {
      generated_at: normalizedFilters.now || new Date().toISOString(),
      query: createAccountabilityReplayQuery(normalizedFilters),
      accountability: createAccountabilityReplaySummary({
        filters: normalizedFilters,
        events,
        interactions,
        memoryArtifacts,
        ledger
      }),
      ...(replayAudit ? { replay_audit: replayAudit } : {}),
      ledger,
      events,
      interactions,
      memory_artifacts: memoryArtifacts
    };
  }

  listPeerWatchAlerts(filters = {}) {
    if (filters.status === 'open') {
      return this.listOpenPeerWatchAlerts(filters);
    }

    const limit = parseOptionalLimit(filters.limit);

    return applyOptionalLimit(
      this.events
        .filter((event) => event.event_type.startsWith('peer_watch_alert_'))
        .map((event) => createPeerWatchAlertRecord(event))
        .filter((alert) => matchesPeerWatchAlertFilters(alert, filters))
        .slice()
        .sort((left, right) => Date.parse(right.ts) - Date.parse(left.ts)),
      limit
    );
  }

  listOpenPeerWatchAlerts(filters = {}) {
    const limit = parseOptionalLimit(filters.limit);

    return applyOptionalLimit(
      deriveOpenPeerWatchAlerts(this.events)
        .filter((alert) => matchesPeerWatchAlertFilters(alert, {
          ...filters,
          status: 'open'
        }))
        .slice()
        .sort((left, right) => Date.parse(right.ts) - Date.parse(left.ts)),
      limit
    );
  }

  listHandoffs(filters = {}) {
    const limit = parseOptionalLimit(filters.limit);

    return applyOptionalLimit(
      this.events
        .filter((event) => event.event_type.startsWith('agent_handoff_'))
        .filter((event) => {
          if (filters.agent_id && event.agent_id !== filters.agent_id) {
            return false;
          }

          if (
            filters.correlation_id &&
            event.correlation_id !== filters.correlation_id
          ) {
            return false;
          }

          return true;
        })
        .slice()
        .sort((left, right) => Date.parse(right.ts) - Date.parse(left.ts))
        .map((event) => ({
          handoff_id: event.event_id,
          ts: event.ts,
          agent_id: event.agent_id,
          actor_id: event.actor_id,
          phase: event.event_type.endsWith('_completed') ? 'completed' : 'started',
          status: event.event_type.endsWith('_completed') ? 'completed' : 'started',
          severity: event.severity,
          summary: event.summary,
          counterparty_agent_ids: event.counterparty_agent_ids,
          evidence_refs: event.evidence_refs,
          correlation_id: event.correlation_id,
          source_kind: event.source_kind
        })),
      limit
    );
  }

  listReboots(filters = {}) {
    const limit = parseOptionalLimit(filters.limit);

    return applyOptionalLimit(
      this.events
        .filter((event) => event.event_type.startsWith('agent_reboot_'))
        .filter((event) => {
          if (filters.agent_id && event.agent_id !== filters.agent_id) {
            return false;
          }

          if (filters.severity && event.severity !== filters.severity) {
            return false;
          }

          if (
            filters.correlation_id &&
            event.correlation_id !== filters.correlation_id
          ) {
            return false;
          }

          return true;
        })
        .slice()
        .sort((left, right) => Date.parse(right.ts) - Date.parse(left.ts))
        .map((event) => ({
          reboot_id: event.event_id,
          ts: event.ts,
          agent_id: event.agent_id,
          actor_id: event.actor_id,
          phase: event.event_type.endsWith('_completed') ? 'completed' : 'requested',
          status: event.event_type.endsWith('_completed') ? 'completed' : 'requested',
          severity: event.severity,
          summary: event.summary,
          counterparty_agent_ids: event.counterparty_agent_ids,
          evidence_refs: event.evidence_refs,
          correlation_id: event.correlation_id,
          source_kind: event.source_kind
        })),
      limit
    );
  }

  listIncidents(filters = {}) {
    const limit = parseOptionalLimit(filters.limit);
    const durationMs = filters.window ? parseWindow(filters.window) : null;
    const nowMs = filters.status === 'open' || durationMs !== null ? parseNowMs(filters.now) : null;
    const incidents = [];

    if (!filters.kind || filters.kind === 'peer_watch_alert') {
      const peerWatchAlerts = filters.status === 'open'
        ? this.listOpenPeerWatchAlerts({
          agent_id: filters.agent_id,
          severity: filters.severity,
          correlation_id: filters.correlation_id,
          limit: null
        })
        : this.listPeerWatchAlerts({
          agent_id: filters.agent_id,
          severity: filters.severity,
          status: filters.status,
          correlation_id: filters.correlation_id,
          limit: null
        });

      incidents.push(...peerWatchAlerts.map(createIncidentFromPeerWatchAlert));
    }

    if (!filters.kind || filters.kind === 'handoff') {
      incidents.push(
        ...this.listHandoffs({
          agent_id: filters.agent_id,
          correlation_id: filters.status === 'open' ? null : filters.correlation_id,
          limit: null
        }).map(createIncidentFromHandoff)
      );
    }

    if (!filters.kind || filters.kind === 'reboot') {
      incidents.push(
        ...this.listReboots({
          agent_id: filters.agent_id,
          severity: filters.status === 'open' ? null : filters.severity,
          correlation_id: filters.status === 'open' ? null : filters.correlation_id,
          limit: null
        }).map(createIncidentFromReboot)
      );
    }

    const openLifecycleCandidates = filters.status === 'open'
      ? incidents.filter((incident) => matchesIncidentOpenLifecycleWindow(incident, { nowMs }))
      : incidents;
    const incidentCandidates = filters.status === 'open'
      ? selectOpenIncidentLifecycleItems(openLifecycleCandidates)
      : incidents;

    return applyOptionalLimit(
      incidentCandidates
        .filter((incident) => matchesIncidentFilters(incident, filters, { durationMs, nowMs }))
        .sort((left, right) => {
          const rightTs = getIncidentSortMs(right);
          const leftTs = getIncidentSortMs(left);

          if (rightTs !== leftTs) {
            return rightTs - leftTs;
          }

          return right.incident_id.localeCompare(left.incident_id);
        }),
      limit
    );
  }

  getCorrelationDrilldown(correlationId, filters = {}) {
    const baseFilters = {
      correlation_id: correlationId,
      window: filters.window,
      now: filters.now
    };
    const allIncidents = this.listIncidents({ ...baseFilters, limit: null });
    const openIncidents = this.listIncidents({ ...baseFilters, status: 'open', limit: null });
    const allInteractions = listInteractionItems(this.events, baseFilters, null);
    const allTimeline = listTimelineItems(this.events, { ...baseFilters, limit: null });

    if (
      allIncidents.length === 0 &&
      allInteractions.length === 0 &&
      allTimeline.length === 0
    ) {
      return null;
    }

    const limit =
      filters.limit === null || filters.limit === undefined || filters.limit === ''
        ? null
        : filters.limit;
    const interactionLimit = limit === null ? null : parseLimit(limit);
    const closureLedger = createCorrelationClosureLedger({
      incidents: allIncidents,
      openIncidents,
      interactions: allInteractions,
      limit: interactionLimit
    });
    const timestamps = collectCorrelationTimestamps({
      incidents: allIncidents,
      interactions: allInteractions,
      timeline: allTimeline
    });

    return {
      correlation_id: correlationId,
      participant_agent_ids: normalizeAgentIds([
        ...allIncidents.flatMap(getIncidentParticipantAgentIds),
        ...allInteractions.flatMap((interaction) => interaction.participant_agent_ids || []),
        ...allTimeline.flatMap(getTimelineParticipantAgentIds)
      ]),
      evidence_refs: normalizeEvidenceRefs(
        [
          ...allIncidents.flatMap((incident) => incident.evidence_refs || []),
          ...allInteractions.flatMap((interaction) => interaction.evidence_refs || []),
          ...allTimeline.flatMap((event) => event.evidence_refs || [])
        ].sort()
      ),
      first_ts: timestamps[0] || null,
      last_ts: timestamps[timestamps.length - 1] || null,
      incident_count: allIncidents.length,
      interaction_count: allInteractions.length,
      event_count: allTimeline.length,
      closure_ledger: closureLedger,
      incidents: this.listIncidents({ ...baseFilters, limit }),
      interactions: listInteractionItems(this.events, baseFilters, interactionLimit),
      timeline: listTimelineItems(this.events, { ...baseFilters, limit })
    };
  }

  getOfficeOverview({ now }) {
    const generatedAt = now;
    const overviewAgents = this.listAgents().map((agent) => {
      const severityView = deriveAgentOverviewSeverity({
        now: generatedAt,
        reportedSeverity: agent.severity,
        lastMeaningfulOutputAt: agent.last_meaningful_output_at
      });

      return {
        ...agent,
        ...severityView
      };
    });

    const occupantsByZone = new Map(OFFICE_ZONES.map((zone) => [zone.zone_id, []]));
    const severityBuckets = {
      normal: 0,
      yellow: 0,
      orange: 0,
      red: 0
    };

    let blockedCount = 0;
    let rebootRecommendedCount = 0;

    for (const agent of overviewAgents) {
      severityBuckets[agent.effective_severity] += 1;

      if (agent.current_state === 'blocked') {
        blockedCount += 1;
      }

      if (agent.reboot_recommended) {
        rebootRecommendedCount += 1;
      }

      if (!occupantsByZone.has(agent.current_location)) {
        occupantsByZone.set(agent.current_location, []);
      }

      occupantsByZone.get(agent.current_location).push(createZoneOccupant(agent));
    }

    return {
      generated_at: generatedAt,
      summary: {
        agent_count: overviewAgents.length,
        blocked_count: blockedCount,
        reboot_recommended_count: rebootRecommendedCount,
        severity_buckets: severityBuckets
      },
      zones: OFFICE_ZONES.map((zone) => ({
        ...zone,
        occupants: occupantsByZone.get(zone.zone_id) || []
      })),
      watch_edges: getWatchEdges(),
      agents: overviewAgents
    };
  }

  getOfficeOperations(filters = {}) {
    const generatedAt = filters.now;
    const latestEventsByAgentId = buildLatestEventsByAgentId(this.events);
    const limit =
      filters.limit === null || filters.limit === undefined || filters.limit === ''
        ? null
        : parseLimit(filters.limit);

    const items = applyOptionalLimit(
      this.listAgents()
        .filter((agent) => matchesOfficeOperationAgentId(agent, filters.agent_id))
        .filter((agent) => matchesOfficeOperationState(agent, filters.state))
        .map((agent) => createOfficeOperationItem({
          agent,
          latestEvent: latestEventsByAgentId.get(agent.agent_id) || null,
          now: generatedAt
        }))
        .filter((item) => matchesOfficeOperationSeverity(item, filters.severity))
        .sort(compareOfficeOperations),
      limit
    );

    return {
      generated_at: generatedAt,
      summary: createOfficeOperationsSummary(items),
      items
    };
  }
}

function createZoneOccupant(agent) {
  return {
    agent_id: agent.agent_id,
    display_name: agent.display_name,
    kind: agent.kind,
    current_state: agent.current_state,
    active_task: agent.active_task,
    effective_severity: agent.effective_severity
  };
}

function createOfficeOperationItem({ agent, latestEvent, now }) {
  const severityView = deriveAgentOverviewSeverity({
    now,
    reportedSeverity: agent.severity,
    lastMeaningfulOutputAt: agent.last_meaningful_output_at
  });

  return {
    agent_id: agent.agent_id,
    display_name: agent.display_name,
    kind: agent.kind,
    current_state: agent.current_state,
    active_task: agent.active_task,
    current_blocker: agent.current_blocker,
    current_location: agent.current_location,
    reported_severity: severityView.reported_severity,
    effective_severity: severityView.effective_severity,
    derived_staleness: severityView.derived_staleness,
    reboot_recommended: agent.reboot_recommended,
    last_event_at: agent.last_event_at,
    last_heartbeat_at: agent.last_heartbeat_at,
    last_meaningful_output_at: agent.last_meaningful_output_at,
    correlation_id: latestEvent ? latestEvent.correlation_id : null,
    latest_event: latestEvent
      ? {
          event_id: latestEvent.event_id,
          actor_id: latestEvent.actor_id,
          event_type: latestEvent.event_type,
          ts: latestEvent.ts,
          summary: latestEvent.summary,
          source_kind: latestEvent.source_kind,
          evidence_refs: latestEvent.evidence_refs,
          counterparty_agent_ids: latestEvent.counterparty_agent_ids
        }
      : null
  };
}

function matchesOfficeOperationState(agent, state) {
  if (typeof state === 'string' && state.length > 0) {
    return agent.current_state === state;
  }

  return agent.current_state !== 'idle' && agent.current_state !== 'sleeping';
}

function matchesOfficeOperationAgentId(agent, agentId) {
  if (typeof agentId === 'string' && agentId.length > 0) {
    return agent.agent_id === agentId;
  }

  return true;
}

function matchesOfficeOperationSeverity(item, severity) {
  if (typeof severity === 'string' && severity.length > 0) {
    return item.effective_severity === severity;
  }

  return true;
}

function buildLatestEventsByAgentId(events) {
  const latestEventsByAgentId = new Map();

  for (const event of events) {
    const previous = latestEventsByAgentId.get(event.agent_id) || null;
    if (!previous || compareEventsByTsDesc(event, previous) < 0) {
      latestEventsByAgentId.set(event.agent_id, event);
    }
  }

  return latestEventsByAgentId;
}

function createOfficeOperationsSummary(items) {
  const severityBuckets = {
    normal: 0,
    yellow: 0,
    orange: 0,
    red: 0
  };
  const stateBuckets = {};

  let blockedCount = 0;
  let rebootRecommendedCount = 0;

  for (const item of items) {
    severityBuckets[item.effective_severity] += 1;
    stateBuckets[item.current_state] = (stateBuckets[item.current_state] || 0) + 1;

    if (item.current_state === 'blocked') {
      blockedCount += 1;
    }

    if (item.reboot_recommended) {
      rebootRecommendedCount += 1;
    }
  }

  return {
    item_count: items.length,
    blocked_count: blockedCount,
    reboot_recommended_count: rebootRecommendedCount,
    state_buckets: stateBuckets,
    severity_buckets: severityBuckets
  };
}

function createWorkflowSummary({ incidents = [], interactions = [], timeline = [] }) {
  const severityBuckets = createSeverityBuckets();
  const incidentKindBuckets = {};
  const interactionTypeBuckets = {};
  const eventTypeBuckets = {};
  let latestActivityAt = null;

  for (const incident of incidents) {
    incrementBucket(incidentKindBuckets, incident.kind);
    incrementSeverityBucket(severityBuckets, incident.severity);
    latestActivityAt = getLatestIsoValue(latestActivityAt, incident.ts);
  }

  for (const interaction of interactions) {
    incrementBucket(interactionTypeBuckets, interaction.interaction_type);
    incrementSeverityBucket(severityBuckets, interaction.severity);
    latestActivityAt = getLatestIsoValue(
      latestActivityAt,
      interaction.ended_at || interaction.started_at
    );
  }

  for (const event of timeline) {
    incrementBucket(eventTypeBuckets, event.event_type);
    incrementSeverityBucket(severityBuckets, event.severity);
    latestActivityAt = getLatestIsoValue(latestActivityAt, event.ts);
  }

  return {
    incident_count: incidents.length,
    interaction_count: interactions.length,
    event_count: timeline.length,
    incident_kind_buckets: incidentKindBuckets,
    interaction_type_buckets: interactionTypeBuckets,
    event_type_buckets: eventTypeBuckets,
    severity_buckets: severityBuckets,
    latest_activity_at: latestActivityAt
  };
}

function normalizeAccountabilityReplayFilters(filters = {}) {
  return {
    event_id: normalizeOptionalString(filters.event_id),
    evidence_id: normalizeOptionalString(filters.evidence_id),
    evidence_ref: normalizeOptionalString(filters.evidence_ref),
    correlation_id: normalizeOptionalString(filters.correlation_id),
    agent_id: normalizeOptionalString(filters.agent_id),
    source_kind: normalizeOptionalString(filters.source_kind),
    artifact_kind: normalizeOptionalString(filters.artifact_kind),
    limit: parseLimit(
      filters.limit === null || filters.limit === undefined || filters.limit === ''
        ? 10
        : filters.limit
    ),
    window: normalizeOptionalString(filters.window) || '60m',
    now: normalizeOptionalString(filters.now)
  };
}

function resolveAccountabilityReplayEvidenceAnchor(filters, evidenceRecord) {
  if (!filters.evidence_id || !evidenceRecord) {
    return filters;
  }

  return {
    ...filters,
    evidence_ref: filters.evidence_ref || evidenceRecord.evidence_ref,
    correlation_id: filters.correlation_id || evidenceRecord.correlation_id,
    agent_id: filters.agent_id || evidenceRecord.agent_id
  };
}

function normalizeOptionalString(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function createAccountabilityReplayQuery(filters) {
  const query = {};

  if (filters.event_id) {
    query.event_id = filters.event_id;
  }
  if (filters.evidence_id) {
    query.evidence_id = filters.evidence_id;
  }
  if (filters.evidence_ref) {
    query.evidence_ref = filters.evidence_ref;
  }
  if (filters.correlation_id) {
    query.correlation_id = filters.correlation_id;
  }
  if (filters.agent_id) {
    query.agent_id = filters.agent_id;
  }
  if (filters.source_kind) {
    query.source_kind = filters.source_kind;
  }
  if (filters.artifact_kind) {
    query.artifact_kind = filters.artifact_kind;
  }

  query.limit = filters.limit;
  query.window = filters.window;
  return query;
}

function listAccountabilityReplayArtifacts({ store, filters, events = [], interactions = [] }) {
  const artifacts = store.listMemoryArtifacts({
    window: filters.window,
    agent_id: filters.agent_id,
    correlation_id: filters.correlation_id,
    artifact_ref: filters.evidence_ref,
    source_kind: filters.source_kind,
    artifact_kind: filters.artifact_kind,
    limit: filters.event_id ? null : filters.limit,
    now: filters.now
  });

  if (!filters.event_id) {
    return artifacts;
  }

  const activityEvidenceRefs = new Set(
    normalizeEvidenceRefs([
      ...events.flatMap((event) => event.evidence_refs || []),
      ...interactions.flatMap((interaction) => interaction.evidence_refs || [])
    ])
  );

  return applyOptionalLimit(
    artifacts.filter((artifact) => activityEvidenceRefs.has(artifact.artifact_ref)),
    filters.limit
  );
}

function createAccountabilityReplaySummary({
  filters,
  events = [],
  interactions = [],
  memoryArtifacts = [],
  ledger = []
}) {
  return {
    basis: 'event_log_and_existing_read_models',
    bounded_by: {
      limit: filters.limit,
      window: filters.window
    },
    event_count: events.length,
    interaction_count: interactions.length,
    artifact_count: memoryArtifacts.length,
    participant_agent_ids: normalizeAgentIds([
      ...events.flatMap(getTimelineParticipantAgentIds),
      ...interactions.flatMap((interaction) => interaction.participant_agent_ids || []),
      ...memoryArtifacts.flatMap((artifact) => artifact.agent_ids || [])
    ]),
    actor_ids: normalizeAgentIds(events.map((event) => event.actor_id)),
    evidence_refs: normalizeEvidenceRefs([
      ...events.flatMap((event) => event.evidence_refs || []),
      ...interactions.flatMap((interaction) => interaction.evidence_refs || []),
      ...memoryArtifacts.map((artifact) => artifact.artifact_ref)
    ]).sort(),
    source_kind_buckets: createAccountabilitySourceKindBuckets({
      events,
      interactions,
      memoryArtifacts
    }),
    first_ts: ledger[0]?.ts || null,
    last_ts: ledger[ledger.length - 1]?.ts || null
  };
}

function createAccountabilityReplayAudit({
  filters,
  evidenceRecord,
  events = [],
  interactions = [],
  memoryArtifacts = [],
  ledger = []
}) {
  if (!filters.evidence_id) {
    return null;
  }

  const anchorEventIds = normalizeStringValues(
    ledger.flatMap((entry) => entry.basis_event_ids || [])
  );
  const evidenceIdStatus = !evidenceRecord
    ? 'unknown_evidence_id'
    : anchorEventIds.length > 0
      ? 'event_backed'
      : 'collector_only';

  return {
    evidence_id_status: evidenceIdStatus,
    event_count: events.length,
    interaction_count: interactions.length,
    artifact_count: memoryArtifacts.length,
    ledger_entry_count: ledger.length,
    anchor_event_count: anchorEventIds.length,
    anchor_event_ids: anchorEventIds
  };
}

function createAccountabilitySourceKindBuckets({ events = [], interactions = [], memoryArtifacts = [] }) {
  const buckets = {};

  for (const event of events) {
    incrementBucket(buckets, event.source_kind);
  }
  for (const interaction of interactions) {
    incrementBucket(buckets, interaction.source_kind);
  }
  for (const artifact of memoryArtifacts) {
    for (const sourceKind of artifact.source_kinds || []) {
      incrementBucket(buckets, sourceKind);
    }
  }

  return buckets;
}

function createAccountabilityReplayLedger({
  events = [],
  interactions = [],
  memoryArtifacts = [],
  eventIds = new Set()
}) {
  return [
    ...events.map(createAccountabilityEventLedgerEntry),
    ...interactions.map((interaction) => createAccountabilityInteractionLedgerEntry({ interaction, eventIds })),
    ...memoryArtifacts.map((artifact) =>
      createAccountabilityArtifactLedgerEntry({ artifact, eventIds })
    )
  ].sort(compareAccountabilityLedgerEntries);
}

function createAccountabilityEventLedgerEntry(event) {
  return {
    entry_type: 'event',
    entry_id: event.event_id,
    ts: event.ts,
    basis_event_ids: [event.event_id],
    agent_id: event.agent_id,
    actor_id: event.actor_id,
    source_kind: event.source_kind,
    evidence_refs: normalizeEvidenceRefs(event.evidence_refs),
    correlation_id: event.correlation_id || null,
    summary: event.summary
  };
}

function createAccountabilityInteractionLedgerEntry({ interaction, eventIds }) {
  return {
    entry_type: 'interaction',
    entry_id: interaction.interaction_id,
    ts: interaction.ended_at || interaction.started_at,
    basis_event_ids: canonicalizeAccountabilityReplayBasisEventIds(
      interaction.related_event_ids,
      eventIds
    ),
    agent_id: interaction.participant_agent_ids[0] || undefined,
    source_kind: interaction.source_kind || null,
    evidence_refs: normalizeEvidenceRefs(interaction.evidence_refs),
    correlation_id: interaction.correlation_id || null,
    summary: interaction.summary
  };
}

function createAccountabilityArtifactLedgerEntry({ artifact, eventIds }) {
  const latestEventId =
    canonicalizeAccountabilityReplayBasisEventIds([artifact.latest_event_id], eventIds)[0] || null;

  return {
    entry_type: 'memory_artifact',
    entry_id: artifact.artifact_ref,
    ts: artifact.last_seen_at,
    basis_event_ids: latestEventId ? [latestEventId] : [],
    source_kinds: normalizeStringValues(artifact.source_kinds),
    evidence_refs: [artifact.artifact_ref],
    correlation_ids: normalizeStringValues(artifact.correlation_ids),
    summary: artifact.latest_summary || 'collector-only artifact without event id',
    provenance: latestEventId
      ? 'event_backed_artifact'
      : 'collector_observation_without_event_id'
  };
}

function canonicalizeAccountabilityReplayBasisEventIds(values, eventIds) {
  if (!Array.isArray(values)) {
    return [];
  }

  const basisEventIds = new Set();
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }

    const eventId = value.trim();
    if (eventId.length === 0 || !eventIds.has(eventId)) {
      continue;
    }

    basisEventIds.add(eventId);
  }

  return Array.from(basisEventIds).sort();
}

function compareAccountabilityLedgerEntries(left, right) {
  const tsDelta = Date.parse(left.ts || 0) - Date.parse(right.ts || 0);
  if (tsDelta !== 0) {
    return tsDelta;
  }

  const typeDelta =
    getAccountabilityLedgerEntryTypeRank(left.entry_type) -
    getAccountabilityLedgerEntryTypeRank(right.entry_type);
  if (typeDelta !== 0) {
    return typeDelta;
  }

  return left.entry_id.localeCompare(right.entry_id);
}

function getAccountabilityLedgerEntryTypeRank(entryType) {
  if (entryType === 'event') {
    return 0;
  }
  if (entryType === 'interaction') {
    return 1;
  }

  return 2;
}

function createSeverityBuckets() {
  return {
    normal: 0,
    yellow: 0,
    orange: 0,
    red: 0
  };
}

function incrementBucket(buckets, key) {
  if (typeof key !== 'string' || key.length === 0) {
    return;
  }

  buckets[key] = (buckets[key] || 0) + 1;
}

function incrementKnownBucket(buckets, key) {
  if (typeof key !== 'string' || !Object.hasOwn(buckets, key)) {
    return;
  }

  buckets[key] += 1;
}

function createZeroBuckets(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function createEmptyEvidenceRecordFacets(limit) {
  return {
    total_count: 0,
    returned_limit: limit,
    source_kind_buckets: createZeroBuckets(EVIDENCE_RECORD_SOURCE_KINDS),
    evidence_role_buckets: createZeroBuckets(EVIDENCE_RECORD_ROLES),
    source_status_buckets: createZeroBuckets(EVIDENCE_RECORD_SOURCE_STATUSES),
    output_candidate_buckets: {
      true: 0,
      false: 0
    },
    mapped_buckets: {
      mapped: 0,
      unmapped: 0
    },
    agent_id_buckets: {
      ...createZeroBuckets(SEED_AGENTS.map((agent) => agent.agent_id)),
      unmapped: 0
    }
  };
}

function createAgentEvidenceSpineSummaryAgent(agent) {
  return {
    agent_id: agent.agent_id,
    evidence_count: 0,
    output_candidate_buckets: {
      true: 0,
      false: 0
    },
    source_kind_buckets: createZeroBuckets(EVIDENCE_RECORD_SOURCE_KINDS),
    evidence_role_buckets: createZeroBuckets(EVIDENCE_RECORD_ROLES),
    source_status_buckets: createZeroBuckets(EVIDENCE_RECORD_SOURCE_STATUSES),
    source_gap_buckets: createZeroBuckets(RUNTIME_SOURCE_GAP_STATUSES),
    latest_observed_at: null,
    latest_collected_at: null
  };
}

function createUnmappedAgentEvidenceSummary() {
  return {
    total_count: 0,
    source_kind_buckets: createZeroBuckets(EVIDENCE_RECORD_SOURCE_KINDS),
    evidence_role_buckets: createZeroBuckets(EVIDENCE_RECORD_ROLES),
    source_status_buckets: createZeroBuckets(EVIDENCE_RECORD_SOURCE_STATUSES),
    latest_observed_at: null,
    latest_collected_at: null
  };
}

function addEvidenceRecordToAgentEvidenceSummary(summary, record) {
  summary.evidence_count += 1;
  summary.output_candidate_buckets[String(record.output_candidate === true)] += 1;
  incrementKnownBucket(summary.source_kind_buckets, record.source_kind);
  incrementKnownBucket(summary.evidence_role_buckets, record.evidence_role);
  incrementKnownBucket(summary.source_status_buckets, record.source_status);
  incrementKnownBucket(summary.source_gap_buckets, record.source_status);
  summary.latest_observed_at = getLatestEvidenceRecordIsoValue(
    summary.latest_observed_at,
    record.observed_at
  );
  summary.latest_collected_at = getLatestEvidenceRecordIsoValue(
    summary.latest_collected_at,
    record.collected_at
  );
}

function addEvidenceRecordToUnmappedAgentEvidenceSummary(summary, record) {
  summary.total_count += 1;
  incrementKnownBucket(summary.source_kind_buckets, record.source_kind);
  incrementKnownBucket(summary.evidence_role_buckets, record.evidence_role);
  incrementKnownBucket(summary.source_status_buckets, record.source_status);
  summary.latest_observed_at = getLatestEvidenceRecordIsoValue(
    summary.latest_observed_at,
    record.observed_at
  );
  summary.latest_collected_at = getLatestEvidenceRecordIsoValue(
    summary.latest_collected_at,
    record.collected_at
  );
}

function sortEvidenceRefRollupBuckets(group) {
  return {
    ...group,
    agent_id_buckets: sortBucketKeys(group.agent_id_buckets),
    source_kind_buckets: sortBucketKeys(group.source_kind_buckets),
    source_status_buckets: sortBucketKeys(group.source_status_buckets)
  };
}

function sortBucketKeys(buckets) {
  return Object.fromEntries(Object.entries(buckets).sort(([left], [right]) => compareStringsAsc(left, right)));
}

function createRuntimeSourceGapAgentGroup(record) {
  return {
    agent_id: record.agent_id || null,
    source_kind: record.source_kind || null,
    record_count: 0,
    mapped_count: 0,
    unmapped_count: 0,
    output_candidate_buckets: {
      true: 0,
      false: 0
    },
    evidence_role_buckets: {},
    source_status_buckets: {},
    first_observed_at: null,
    last_observed_at: null,
    first_collected_at: null,
    last_collected_at: null
  };
}

function addRuntimeSourceGapRecordToAgentGroup(group, record) {
  group.record_count += 1;

  if (typeof record.agent_id === 'string' && record.agent_id.length > 0) {
    group.mapped_count += 1;
  } else if (record.agent_id === null) {
    group.unmapped_count += 1;
  }

  group.output_candidate_buckets[String(record.output_candidate === true)] += 1;
  incrementBucket(group.evidence_role_buckets, record.evidence_role);
  incrementBucket(group.source_status_buckets, record.source_status);
  group.first_observed_at = getEarliestEvidenceRecordIsoValue(group.first_observed_at, record.observed_at);
  group.last_observed_at = getLatestEvidenceRecordIsoValue(group.last_observed_at, record.observed_at);
  group.first_collected_at = getEarliestEvidenceRecordIsoValue(group.first_collected_at, record.collected_at);
  group.last_collected_at = getLatestEvidenceRecordIsoValue(group.last_collected_at, record.collected_at);
}

function sortRuntimeSourceGapAgentGroupBuckets(group) {
  return {
    ...group,
    evidence_role_buckets: sortBucketKeys(group.evidence_role_buckets),
    source_status_buckets: sortBucketKeys(group.source_status_buckets)
  };
}

function compareRuntimeSourceGapAgentGroups(left, right) {
  const countComparison = right.record_count - left.record_count;
  if (countComparison !== 0) {
    return countComparison;
  }

  const unmappedComparison = Number(left.agent_id !== null) - Number(right.agent_id !== null);
  if (unmappedComparison !== 0) {
    return unmappedComparison;
  }

  const sourceComparison = compareStringsAsc(left.source_kind || '', right.source_kind || '');
  if (sourceComparison !== 0) {
    return sourceComparison;
  }

  return compareStringsAsc(left.agent_id || '', right.agent_id || '');
}

function isRuntimeSourceLifecycleRecord(record) {
  return !(record.evidence_role === 'task_reference' && TASK_EVIDENCE_SOURCE_KINDS.has(record.source_kind));
}

function createRuntimeSourceGapLifecycleGroup(record) {
  return {
    agent_id: record.agent_id || null,
    source_kind: projectKnownEvidenceValue(record.source_kind, EVIDENCE_RECORD_SOURCE_KINDS),
    evidence_role: projectKnownEvidenceValue(record.evidence_role, EVIDENCE_RECORD_ROLES),
    first_observed_at: null,
    last_observed_at: null,
    first_collected_at: null,
    last_collected_at: null,
    snapshot_ids: new Set(),
    source_status_buckets: {},
    records: [],
    has_lifecycle_signal: false
  };
}

function addRuntimeSourceRecordToLifecycleGroup(group, record) {
  group.records.push(record);
  group.has_lifecycle_signal ||= isRuntimeSourceGapRecord(record);
  if (record.collector_snapshot_id) {
    group.snapshot_ids.add(record.collector_snapshot_id);
  }

  incrementAllowedBucket(
    group.source_status_buckets,
    record.source_status,
    EVIDENCE_RECORD_SOURCE_STATUSES
  );
  group.first_observed_at = getEarliestEvidenceRecordIsoValue(group.first_observed_at, record.observed_at);
  group.last_observed_at = getLatestEvidenceRecordIsoValue(group.last_observed_at, record.observed_at);
  group.first_collected_at = getEarliestEvidenceRecordIsoValue(group.first_collected_at, record.collected_at);
  group.last_collected_at = getLatestEvidenceRecordIsoValue(group.last_collected_at, record.collected_at);
}

function projectRuntimeSourceGapLifecycleGroup(group) {
  const recordsByRecency = group.records.slice().sort(compareRuntimeSourceLifecycleRecordRecency);
  const currentRecord = recordsByRecency[0] || null;

  return {
    record_count: group.records.length,
    agent_id: group.agent_id,
    source_kind: group.source_kind,
    evidence_role: group.evidence_role,
    current_status: projectKnownEvidenceValue(
      currentRecord?.source_status,
      EVIDENCE_RECORD_SOURCE_STATUSES
    ),
    lifecycle_state: deriveRuntimeSourceGapLifecycleState(recordsByRecency),
    first_observed_at: group.first_observed_at,
    last_observed_at: group.last_observed_at,
    first_collected_at: group.first_collected_at,
    last_collected_at: group.last_collected_at,
    snapshot_count: group.snapshot_ids.size,
    source_status_buckets: sortBucketKeys(group.source_status_buckets)
  };
}

function omitRuntimeSourceGapLifecycleRecordCount(group) {
  const { record_count, ...publicGroup } = group;
  return publicGroup;
}

function deriveRuntimeSourceGapLifecycleState(recordsByRecency) {
  const currentRecord = recordsByRecency[0] || null;
  if (
    currentRecord?.agent_id === null &&
    currentRecord.evidence_role === 'runtime_unmapped' &&
    currentRecord.source_status === 'observed'
  ) {
    return 'observed_unmapped';
  }

  if (currentRecord?.source_status === 'observed') {
    return 'resolved';
  }

  const previousRecord = recordsByRecency[1] || null;
  return previousRecord && RUNTIME_SOURCE_GAP_STATUSES.includes(previousRecord.source_status)
    ? 'continuing'
    : 'opened';
}

function compareRuntimeSourceGapLifecycleGroupsByRecency(left, right) {
  const lastCollectedComparison =
    getEvidenceRecordTimestamp(right.last_collected_at) -
    getEvidenceRecordTimestamp(left.last_collected_at);
  if (lastCollectedComparison !== 0) {
    return lastCollectedComparison;
  }

  const lastObservedComparison =
    getEvidenceRecordTimestamp(right.last_observed_at) -
    getEvidenceRecordTimestamp(left.last_observed_at);
  if (lastObservedComparison !== 0) {
    return lastObservedComparison;
  }

  return compareRuntimeSourceGapLifecycleGroups(left, right);
}

function compareRuntimeSourceLifecycleRecordRecency(left, right) {
  const collectedComparison =
    getEvidenceRecordTimestamp(right.collected_at) - getEvidenceRecordTimestamp(left.collected_at);
  if (collectedComparison !== 0) {
    return collectedComparison;
  }

  const observedComparison =
    getEvidenceRecordTimestamp(right.observed_at) - getEvidenceRecordTimestamp(left.observed_at);
  if (observedComparison !== 0) {
    return observedComparison;
  }

  return compareStringsAsc(getEvidenceRecordTieKey(left), getEvidenceRecordTieKey(right));
}

function compareRuntimeSourceGapLifecycleGroups(left, right) {
  const sourceComparison = compareStringsAsc(left.source_kind || '', right.source_kind || '');
  if (sourceComparison !== 0) {
    return sourceComparison;
  }

  const roleComparison = compareStringsAsc(left.evidence_role || '', right.evidence_role || '');
  if (roleComparison !== 0) {
    return roleComparison;
  }

  return compareStringsAsc(left.agent_id || '', right.agent_id || '');
}

function normalizeRuntimeSourceGapTrendBucket(value) {
  return value === 'day' ? 'day' : 'hour';
}

function getRuntimeSourceGapTrendBucketStart(record, bucket) {
  const timestamp = getEvidenceRecordTimestamp(record.observed_at || record.collected_at);
  if (timestamp === 0) {
    return null;
  }

  const date = new Date(timestamp);
  date.setUTCMinutes(0, 0, 0);
  if (bucket === 'day') {
    date.setUTCHours(0, 0, 0, 0);
  }

  return date.toISOString();
}

function createRuntimeSourceGapTrendBucket(bucketStart) {
  return {
    bucket_start: bucketStart,
    total_count: 0,
    mapped_count: 0,
    unmapped_count: 0,
    output_candidate_buckets: {
      true: 0,
      false: 0
    },
    source_kind_buckets: {},
    evidence_role_buckets: {},
    source_status_buckets: {}
  };
}

function addRuntimeSourceGapRecordToTrendBucket(bucket, record) {
  bucket.total_count += 1;

  if (typeof record.agent_id === 'string' && record.agent_id.length > 0) {
    bucket.mapped_count += 1;
  } else if (record.agent_id === null) {
    bucket.unmapped_count += 1;
  }

  bucket.output_candidate_buckets[String(record.output_candidate === true)] += 1;
  incrementAllowedBucket(bucket.source_kind_buckets, record.source_kind, EVIDENCE_RECORD_SOURCE_KINDS);
  incrementAllowedBucket(bucket.evidence_role_buckets, record.evidence_role, EVIDENCE_RECORD_ROLES);
  incrementAllowedBucket(
    bucket.source_status_buckets,
    record.source_status,
    EVIDENCE_RECORD_SOURCE_STATUSES
  );
}

function sortRuntimeSourceGapTrendBucket(bucket) {
  return {
    ...bucket,
    source_kind_buckets: sortBucketKeys(bucket.source_kind_buckets),
    evidence_role_buckets: sortBucketKeys(bucket.evidence_role_buckets),
    source_status_buckets: sortBucketKeys(bucket.source_status_buckets)
  };
}

function incrementAllowedBucket(buckets, key, allowedKeys) {
  if (!allowedKeys.includes(key)) {
    return;
  }

  incrementBucket(buckets, key);
}

function compareEvidenceRefRollupGroups(left, right) {
  const countComparison = right.record_count - left.record_count;
  if (countComparison !== 0) {
    return countComparison;
  }

  return compareStringsAsc(left.evidence_ref, right.evidence_ref);
}

function incrementSeverityBucket(buckets, severity) {
  if (typeof severity !== 'string' || !Object.prototype.hasOwnProperty.call(buckets, severity)) {
    return;
  }

  buckets[severity] += 1;
}

function getLatestIsoValue(currentValue, nextValue) {
  if (compareIsoAsc(currentValue, nextValue) >= 0) {
    return currentValue;
  }

  return nextValue || currentValue || null;
}

function compareOfficeOperations(left, right) {
  const severityDelta =
    SEVERITY_RANK[right.effective_severity] - SEVERITY_RANK[left.effective_severity];
  if (severityDelta !== 0) {
    return severityDelta;
  }

  const rebootDelta = Number(right.reboot_recommended) - Number(left.reboot_recommended);
  if (rebootDelta !== 0) {
    return rebootDelta;
  }

  const blockedDelta = Number(right.current_state === 'blocked') - Number(left.current_state === 'blocked');
  if (blockedDelta !== 0) {
    return blockedDelta;
  }

  const activityDelta = getOfficeOperationActivitySortMs(right) - getOfficeOperationActivitySortMs(left);
  if (activityDelta !== 0) {
    return activityDelta;
  }

  return (
    left.display_name.localeCompare(right.display_name) ||
    left.agent_id.localeCompare(right.agent_id)
  );
}

function getOfficeOperationActivitySortMs(item) {
  return Math.max(
    Date.parse(item.last_event_at || 0) || 0,
    Date.parse(item.last_heartbeat_at || 0) || 0,
    Date.parse(item.last_meaningful_output_at || 0) || 0
  );
}

function compareEventsByTsDesc(left, right) {
  const tsDelta = Date.parse(right.ts || 0) - Date.parse(left.ts || 0);
  if (tsDelta !== 0) {
    return tsDelta;
  }

  return String(right.event_id || '').localeCompare(String(left.event_id || ''));
}

function createBaseProjection(agent) {
  return {
    ...agent,
    current_location: deriveLocationForState(agent, agent.current_state),
    severity: 'normal',
    last_event_id: null,
    last_event_at: null,
    last_heartbeat_at: null,
    last_meaningful_output_at: null,
    last_file_write_at: null,
    current_blocker: '',
    confidence_level: null,
    reboot_recommended: false
  };
}

function applyEvent(snapshot, event) {
  snapshot.current_state = event.current_state;
  snapshot.active_task = event.active_task;
  snapshot.current_location = isCollectorDerivedPeerWatchEvent(event)
    ? deriveLocationForState(snapshot, event.current_state)
    : deriveLocationForEvent(snapshot, event.event_type, event.current_state);
  snapshot.last_event_id = event.event_id;
  snapshot.last_event_at = event.ts;
  snapshot.severity = shouldEventResetSeverity(event)
    ? 'normal'
    : mergeSeverity(snapshot.severity, event.severity);

  if (MEANINGFUL_OUTPUT_EVENT_TYPES.has(event.event_type) && shouldEventAdvanceMeaningfulOutput(event)) {
    snapshot.last_meaningful_output_at = event.ts;
  }

  if (event.event_type === 'agent_wrote_file') {
    snapshot.last_file_write_at = event.ts;
  }

  if (event.event_type === 'peer_watch_alert_raised' && event.current_state === 'blocked') {
    snapshot.current_blocker = getEventCurrentBlocker(event) || event.summary;
  }

  if (event.event_type === 'peer_watch_alert_resolved') {
    snapshot.current_blocker = '';
  }

  if (event.event_type === 'agent_reboot_requested') {
    snapshot.reboot_recommended = true;
  }

  if (event.event_type === 'agent_reboot_completed') {
    snapshot.reboot_recommended = false;
  }
}

function applyHeartbeat(snapshot, heartbeat) {
  snapshot.current_state = heartbeat.current_state;
  snapshot.active_task = heartbeat.active_task;
  snapshot.current_location =
    heartbeat.current_location || deriveLocationForState(snapshot, heartbeat.current_state);
  snapshot.last_heartbeat_at = heartbeat.received_at || null;
  snapshot.last_meaningful_output_at = heartbeat.last_meaningful_output_at;
  snapshot.last_file_write_at = heartbeat.last_file_write_at;
  snapshot.current_blocker = heartbeat.current_blocker;
  snapshot.confidence_level = heartbeat.confidence_level;
  snapshot.reboot_recommended = heartbeat.reboot_recommended;

  if (heartbeat.reboot_recommended) {
    snapshot.severity = mergeSeverity(snapshot.severity, 'orange');
  }
}

function createCollectorSupervisionEvents({ report, existingEvents }) {
  const events = [];
  const openAlerts = buildOpenCollectorAlertIndex(existingEvents);

  for (const item of report.items || []) {
    if (!hasCollectorOutputEvidence(item)) {
      continue;
    }

    const previousEvent = openAlerts.get(item.agent_id) || null;
    const currentAlert = createCollectorAlertCandidate({ report, item });

    if (previousEvent && currentAlert) {
      const previousSignature = previousEvent.metadata.collector_alert_signature;
      const currentSignature = currentAlert.metadata.collector_alert_signature;

      if (previousSignature === currentSignature) {
        continue;
      }

      events.push(createCollectorResolutionEvent({ previousEvent, report, item }));
      const raisedEvent = createCollectorRaisedEvent({ report, item, alert: currentAlert });
      events.push(raisedEvent);
      openAlerts.set(item.agent_id, raisedEvent);
      continue;
    }

    if (previousEvent && !currentAlert) {
      events.push(createCollectorResolutionEvent({ previousEvent, report, item }));
      openAlerts.delete(item.agent_id);
      continue;
    }

    if (!previousEvent && currentAlert) {
      const raisedEvent = createCollectorRaisedEvent({ report, item, alert: currentAlert });
      events.push(raisedEvent);
      openAlerts.set(item.agent_id, raisedEvent);
    }
  }

  return events;
}

function hasCollectorOutputEvidence(item) {
  const heartbeat = item?.heartbeat || null;
  const observedAt = normalizeCollectorTimestamp(heartbeat?.last_file_write_at);

  return Boolean(
    deriveCollectorStateEvidence(item) ||
      (observedAt && deriveCollectorFileWriteEvidence(item, observedAt))
  );
}

function createCollectorActivityEvents({ report, previousAgentProjections }) {
  const events = [];

  for (const item of report.items || []) {
    const previousProjection = previousAgentProjections.get(item.agent_id) || null;
    const fileWriteEvent = createCollectorFileWriteEvent({
      report,
      item,
      previousProjection
    });
    if (fileWriteEvent) {
      events.push(fileWriteEvent);
    }

    const stateChangedEvent = createCollectorStateChangedEvent({
      report,
      item,
      previousProjection
    });
    if (stateChangedEvent) {
      events.push(stateChangedEvent);
    }
  }

  return events;
}

function createCollectorStateChangedEvent({ report, item, previousProjection }) {
  const heartbeat = item.heartbeat || null;
  const agent = getAgentById(item.agent_id);

  if (!heartbeat || !agent || !heartbeat.current_state) {
    return null;
  }

  const previousState = previousProjection ? previousProjection.current_state : null;
  if (previousState === heartbeat.current_state) {
    return null;
  }

  const evidence = deriveCollectorStateEvidence(item);
  if (!evidence) {
    return null;
  }

  const derivedStaleness = deriveStalenessSeverity({
    now: report.collected_at,
    lastMeaningfulOutputAt: heartbeat.last_meaningful_output_at
  });

  return validateCollectorEvent(
    {
      event_id: createCollectorEventId({
        report,
        agentId: item.agent_id,
        family: 'state_change',
        phase: 'observed',
        severity: 'normal'
      }),
      ts: report.collected_at,
      agent_id: item.agent_id,
      agent_role: agent.role_slug,
      event_type: 'agent_state_changed',
      current_state: heartbeat.current_state,
      active_task: heartbeat.active_task,
      summary: previousState
        ? `Collector observed state change ${previousState} -> ${heartbeat.current_state}`
        : `Collector observed state ${heartbeat.current_state}`,
      severity: 'normal',
      correlation_id: createCollectorCorrelationId(report.collected_at),
      counterparty_agent_ids: [],
      evidence_refs: evidence.evidence_refs,
      source_kind: evidence.source_kind,
      metadata: {
        ...createCollectorMetadataBase({
          report,
          item,
          derivedStaleness
        }),
        collector_activity_family: 'state_change',
        previous_state: previousState,
        observed_state: heartbeat.current_state
      }
    },
    report.actor_id
  );
}

function createCollectorFileWriteEvent({ report, item, previousProjection }) {
  const heartbeat = item.heartbeat || null;
  const agent = getAgentById(item.agent_id);
  const observedAt = normalizeCollectorTimestamp(heartbeat && heartbeat.last_file_write_at);

  if (!heartbeat || !agent || !observedAt) {
    return null;
  }

  const previousFileWriteAt = normalizeCollectorTimestamp(
    previousProjection && previousProjection.last_file_write_at
  );
  if (
    previousFileWriteAt &&
    Date.parse(observedAt) <= Date.parse(previousFileWriteAt)
  ) {
    return null;
  }

  const evidence = deriveCollectorFileWriteEvidence(item, observedAt);
  if (!evidence) {
    return null;
  }

  const derivedStaleness = deriveStalenessSeverity({
    now: report.collected_at,
    lastMeaningfulOutputAt: heartbeat.last_meaningful_output_at
  });

  return validateCollectorEvent(
    {
      event_id: createCollectorEventId({
        report,
        agentId: item.agent_id,
        family: 'file_write',
        phase: 'observed',
        severity: 'normal'
      }),
      ts: observedAt,
      agent_id: item.agent_id,
      agent_role: agent.role_slug,
      event_type: 'agent_wrote_file',
      current_state: heartbeat.current_state,
      active_task: heartbeat.active_task,
      summary: `Collector observed workspace write to ${evidence.file_name}`,
      severity: 'normal',
      correlation_id: createCollectorCorrelationId(report.collected_at),
      counterparty_agent_ids: [],
      evidence_refs: evidence.evidence_refs,
      source_kind: 'workspace_file',
      metadata: {
        ...createCollectorMetadataBase({
          report,
          item,
          derivedStaleness
        }),
        collector_activity_family: 'file_write',
        previous_last_file_write_at: previousFileWriteAt,
        observed_file_path: evidence.file_path,
        observed_file_name: evidence.file_name,
        observed_last_file_write_at: observedAt
      }
    },
    report.actor_id
  );
}

function deriveCollectorStateEvidence(item) {
  const tmuxObservation = getLatestCollectorTmuxObservation(item);
  const tmuxObservationRef = getCollectorTmuxArtifactRef(item, tmuxObservation);
  if (tmuxObservationRef) {
    return {
      source_kind: 'tmux_observation',
      evidence_refs: [tmuxObservationRef]
    };
  }

  const tmuxRef = normalizeEvidenceRefs(item.evidence_refs).find(isValidTmuxRef);
  if (tmuxRef) {
    return {
      source_kind: 'tmux_observation',
      evidence_refs: [tmuxRef]
    };
  }

  const workspaceObservation = getLatestCollectorWorkspaceFileObservation(item);
  if (workspaceObservation) {
    return {
      source_kind: 'workspace_file',
      evidence_refs: [workspaceObservation.path]
    };
  }

  const workspaceFileRef = normalizeEvidenceRefs(item.evidence_refs).find(isAgentOutputWorkspaceFileRef);
  if (workspaceFileRef) {
    return {
      source_kind: 'workspace_file',
      evidence_refs: [workspaceFileRef]
    };
  }

  return null;
}

function deriveCollectorFileWriteEvidence(item, observedAt) {
  const workspaceObservation = getLatestCollectorWorkspaceFileObservation(item, observedAt);
  if (workspaceObservation) {
    return {
      file_path: workspaceObservation.path,
      file_name: workspaceObservation.file_name,
      evidence_refs: [workspaceObservation.path]
    };
  }

  const workspaceFileRef = normalizeEvidenceRefs(item.evidence_refs).find(isAgentOutputWorkspaceFileRef);
  if (workspaceFileRef) {
    return {
      file_path: workspaceFileRef,
      file_name: path.basename(workspaceFileRef),
      evidence_refs: [workspaceFileRef]
    };
  }

  return null;
}

function getLatestCollectorTmuxObservation(item) {
  const observations = Array.isArray(item.tmux_observations) ? item.tmux_observations.slice() : [];
  if (observations.length === 0) {
    return null;
  }

  observations.sort(
    (left, right) =>
      Date.parse(right.pane_activity_at || 0) - Date.parse(left.pane_activity_at || 0)
  );
  return observations[0] || null;
}

function getLatestCollectorWorkspaceFileObservation(item, observedAt = null) {
  const observations = (Array.isArray(item.workspace_observations) ? item.workspace_observations : [])
    .filter(isCollectorAgentOutputWorkspaceObservation)
    .slice()
    .sort(
      (left, right) =>
        Date.parse(right.last_modified_at || 0) - Date.parse(left.last_modified_at || 0)
    );

  if (observations.length === 0) {
    return null;
  }

  if (observedAt) {
    const exactMatch = observations.find((observation) => observation.last_modified_at === observedAt);
    if (exactMatch) {
      return exactMatch;
    }
  }

  return observations[0] || null;
}

function isTmuxRef(ref) {
  return typeof ref === 'string' && ref.startsWith('tmux://');
}

function isValidTmuxRef(ref) {
  return isTmuxRef(ref) && !/\/(null|undefined)\.(null|undefined)$/.test(ref);
}

function isProtocolEvidenceRef(ref) {
  return typeof ref === 'string' && (ref.startsWith('task://') || ref.startsWith('hermes://'));
}

function isWorkspaceFileRef(ref) {
  return (
    typeof ref === 'string' &&
    !isTmuxRef(ref) &&
    !isProtocolEvidenceRef(ref) &&
    path.extname(ref).length > 0
  );
}

function isAgentOutputWorkspaceFileRef(ref) {
  return isWorkspaceFileRef(ref) && !INBOUND_WORKSPACE_FILES.has(path.basename(ref));
}

function isCollectorAgentOutputWorkspaceObservation(observation) {
  if (!observation || observation.kind !== 'workspace_file') {
    return false;
  }

  if (AGENT_OUTPUT_WORKSPACE_ROLES.has(observation.evidence_role)) {
    return true;
  }

  if (NON_OUTPUT_WORKSPACE_ROLES.has(observation.evidence_role)) {
    return false;
  }

  return !INBOUND_WORKSPACE_FILES.has(observation.file_name || path.basename(observation.path || ''));
}

function normalizeCollectorTimestamp(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
}

function buildOpenCollectorAlertIndex(events) {
  const openAlerts = new Map();

  for (const event of events) {
    if (!isCollectorDerivedPeerWatchEvent(event)) {
      continue;
    }

    if (event.event_type === 'peer_watch_alert_raised') {
      openAlerts.set(event.agent_id, event);
      continue;
    }

    if (event.event_type === 'peer_watch_alert_resolved') {
      openAlerts.delete(event.agent_id);
    }
  }

  return openAlerts;
}

function createCollectorAlertCandidate({ report, item }) {
  const heartbeat = item.heartbeat || null;
  const agent = getAgentById(item.agent_id);

  if (!heartbeat || !agent) {
    return null;
  }

  const derivedStaleness = deriveStalenessSeverity({
    now: report.collected_at,
    lastMeaningfulOutputAt: heartbeat.last_meaningful_output_at
  });
  const metadataBase = createCollectorMetadataBase({
    report,
    item,
    derivedStaleness
  });

  if (heartbeat.current_state === 'blocked' || heartbeat.reboot_recommended) {
    return {
      agent_id: item.agent_id,
      agent_role: agent.role_slug,
      current_state: heartbeat.current_state,
      active_task: heartbeat.active_task,
      summary: createCollectorBlockedSummary({ heartbeat }),
      severity: 'orange',
      counterparty_agent_ids: deriveCollectorCounterpartyAgentIds({
        actorId: report.actor_id,
        item
      }),
      evidence_refs: normalizeEvidenceRefs(item.evidence_refs),
      metadata: {
        ...metadataBase,
        collector_alert_family: 'blocked',
        collector_alert_signature: createCollectorAlertSignature({
          family: 'blocked',
          severity: 'orange',
          heartbeat
        })
      }
    };
  }

  if (derivedStaleness.severity === 'yellow' || derivedStaleness.severity === 'orange') {
    return {
      agent_id: item.agent_id,
      agent_role: agent.role_slug,
      current_state: heartbeat.current_state,
      active_task: heartbeat.active_task,
      summary: createCollectorStalenessSummary({ derivedStaleness }),
      severity: derivedStaleness.severity,
      counterparty_agent_ids: deriveCollectorCounterpartyAgentIds({
        actorId: report.actor_id,
        item
      }),
      evidence_refs: normalizeEvidenceRefs(item.evidence_refs),
      metadata: {
        ...metadataBase,
        collector_alert_family: 'staleness',
        collector_alert_signature: createCollectorAlertSignature({
          family: 'staleness',
          severity: derivedStaleness.severity,
          heartbeat
        })
      }
    };
  }

  return null;
}

function createCollectorRaisedEvent({ report, item, alert }) {
  return validateCollectorEvent(
    {
      event_id: createCollectorEventId({
        report,
        agentId: item.agent_id,
        family: alert.metadata.collector_alert_family,
        phase: 'raised',
        severity: alert.severity
      }),
      ts: report.collected_at,
      agent_id: alert.agent_id,
      agent_role: alert.agent_role,
      event_type: 'peer_watch_alert_raised',
      current_state: alert.current_state,
      active_task: alert.active_task,
      summary: alert.summary,
      severity: alert.severity,
      correlation_id: createCollectorCorrelationId(report.collected_at),
      counterparty_agent_ids: alert.counterparty_agent_ids,
      evidence_refs: alert.evidence_refs,
      source_kind: 'controller_event',
      metadata: alert.metadata
    },
    report.actor_id
  );
}

function createCollectorResolutionEvent({ previousEvent, report, item }) {
  const heartbeat = item.heartbeat || {};
  const family = previousEvent.metadata.collector_alert_family;
  const derivedStaleness = deriveStalenessSeverity({
    now: report.collected_at,
    lastMeaningfulOutputAt: heartbeat.last_meaningful_output_at
  });

  return validateCollectorEvent(
    {
      event_id: createCollectorEventId({
        report,
        agentId: item.agent_id,
        family,
        phase: 'resolved',
        severity: previousEvent.severity
      }),
      ts: report.collected_at,
      agent_id: item.agent_id,
      agent_role: previousEvent.agent_role,
      event_type: 'peer_watch_alert_resolved',
      current_state: heartbeat.current_state,
      active_task: heartbeat.active_task,
      summary: createCollectorResolvedSummary({
        family,
        heartbeat
      }),
      severity: previousEvent.severity,
      correlation_id: createCollectorCorrelationId(report.collected_at),
      counterparty_agent_ids: deriveCollectorCounterpartyAgentIds({
        actorId: report.actor_id,
        item
      }),
      evidence_refs: normalizeEvidenceRefs(item.evidence_refs),
      source_kind: 'controller_event',
      metadata: {
        ...createCollectorMetadataBase({
          report,
          item,
          derivedStaleness
        }),
        collector_alert_family: family,
        collector_alert_signature: createCollectorResolutionSignature({
          family,
          previousEvent,
          heartbeat
        }),
        resolution_reason: 'snapshot_condition_cleared',
        resolved_alert_event_id: previousEvent.event_id,
        resolved_alert_signature: previousEvent.metadata.collector_alert_signature
      }
    },
    report.actor_id
  );
}

function createCollectorMetadataBase({ report, item, derivedStaleness }) {
  const heartbeat = item.heartbeat || {};
  const supervision = item.supervision || {};

  return {
    collector_derived: true,
    collector_source: COLLECTOR_ALERT_SOURCE,
    collected_at: report.collected_at,
    watch_target: supervision.watch_target || null,
    watched_by: Array.isArray(supervision.watched_by) ? supervision.watched_by.slice() : [],
    current_blocker: heartbeat.current_blocker || '',
    reboot_recommended: Boolean(heartbeat.reboot_recommended),
    confidence_level: heartbeat.confidence_level || null,
    last_meaningful_output_at: heartbeat.last_meaningful_output_at || null,
    last_file_write_at: heartbeat.last_file_write_at || null,
    derived_staleness: derivedStaleness
  };
}

function normalizeCollectorReport(report = {}, previousReport = null) {
  const previousItemsByAgentId = new Map(
    (previousReport?.items || []).map((item) => [item.agent_id, item])
  );
  const normalizedItems = (report.items || []).map((item) =>
    normalizeCollectorReportItem(item, previousItemsByAgentId.get(item.agent_id) || null)
  );
  const normalizedRuntimeSourceEvidence = normalizeCollectorRuntimeSourceEvidence(
    report.runtime_source_evidence
  );

  return {
    ...report,
    ...(normalizedRuntimeSourceEvidence
      ? { runtime_source_evidence: normalizedRuntimeSourceEvidence }
      : {}),
    shared_artifacts: createSharedArtifactRollup(normalizedItems),
    items: normalizedItems
  };
}

function normalizeCollectorReportItem(item = {}, previousItem = null) {
  const normalizedEvidenceRefs = normalizeEvidenceRefs(item.evidence_refs);
  const currentStableTmuxRefs = normalizedEvidenceRefs.filter(isValidTmuxRef);
  const previousStableTmuxRefs = normalizeEvidenceRefs(previousItem?.evidence_refs).filter(isValidTmuxRef);
  const previousTmuxRefByPaneId = buildPreviousTmuxRefByPaneId(previousItem, previousStableTmuxRefs);

  const rawTmuxObservations = item.tmux_observations || [];
  const normalizedTmuxObservations = rawTmuxObservations.map((observation, index) =>
    normalizeCollectorTmuxObservation(observation, {
      currentStableTmuxRef: currentStableTmuxRefs[index] || null,
      previousStableTmuxRefByPaneId: previousTmuxRefByPaneId
    })
  );

  const normalizedTmuxEvidenceRefs = normalizedTmuxObservations
    .map((observation) => observation.artifact_ref)
    .filter(isValidTmuxRef);
  const nonTmuxEvidenceRefs = normalizedEvidenceRefs.filter((ref) => !isTmuxRef(ref));
  const passthroughTmuxEvidenceRefs =
    rawTmuxObservations.length === 0 ? currentStableTmuxRefs : [];
  const hasTaskEvidenceObservations = Array.isArray(item.task_evidence_observations);
  const itemTaskEvidenceAgentId = normalizeTaskEvidenceValue(item.agent_id);
  const normalizedTaskEvidenceObservations = hasTaskEvidenceObservations
    ? item.task_evidence_observations
        .map((observation) =>
          projectSanitizedTaskEvidenceObservation(observation, { agentId: itemTaskEvidenceAgentId })
        )
        .filter(Boolean)
    : [];

  return {
    ...item,
    evidence_refs: normalizeEvidenceRefs([
      ...nonTmuxEvidenceRefs,
      ...normalizedTmuxEvidenceRefs,
      ...passthroughTmuxEvidenceRefs
    ]),
    tmux_observations: normalizedTmuxObservations,
    ...(hasTaskEvidenceObservations
      ? { task_evidence_observations: normalizedTaskEvidenceObservations }
      : {})
  };
}

function normalizeCollectorRuntimeSourceEvidence(runtimeSourceEvidence) {
  if (
    !runtimeSourceEvidence ||
    typeof runtimeSourceEvidence !== 'object' ||
    Array.isArray(runtimeSourceEvidence)
  ) {
    return runtimeSourceEvidence || null;
  }

  const hasUnmappedTaskEvidence = Array.isArray(runtimeSourceEvidence.unmapped_task_evidence);
  return {
    ...runtimeSourceEvidence,
    ...(hasUnmappedTaskEvidence
      ? {
          unmapped_task_evidence: runtimeSourceEvidence.unmapped_task_evidence
            .map((observation) => projectSanitizedTaskEvidenceObservation(observation))
            .filter(Boolean)
        }
      : {})
  };
}

function projectSanitizedTaskEvidenceObservation(observation, options = {}) {
  const taskEvidence = normalizeTaskEvidenceObservation(observation);
  if (!taskEvidence) {
    return null;
  }

  return {
    status: taskEvidence.status,
    task_ref: taskEvidence.task_ref,
    source_kind: taskEvidence.source_kind,
    observed_at: taskEvidence.observed_at,
    correlation_id: taskEvidence.correlation_id,
    ...(options.agentId ? { agent_id: options.agentId } : {}),
    evidence_ref: taskEvidence.evidence_ref,
    ...(taskEvidence.fact_id ? { fact_id: taskEvidence.fact_id } : {}),
    ...(Number.isSafeInteger(taskEvidence.source_index)
      ? { source_index: taskEvidence.source_index }
      : {}),
    ...(taskEvidence.warnings.length > 0 ? { warnings: taskEvidence.warnings.slice() } : {}),
    ...(taskEvidence.source_provenance
      ? { source_provenance: taskEvidence.source_provenance }
      : {})
  };
}

function createCollectorEvidenceRecords(report = {}) {
  const records = [];
  const seen = new Set();
  const collectedAt = normalizeCollectorTimestamp(report.collected_at) || report.collected_at || null;
  const collectorSnapshotId = createCollectorCorrelationId(collectedAt || 'unknown');

  const appendRecord = (record) => {
    if (!record.evidence_ref || !record.source_kind) {
      return;
    }

    const dedupeKey = [
      record.agent_id || '',
      record.source_kind,
      record.evidence_ref,
      record.evidence_role || '',
      ...createCollectorEvidenceRecordDedupeDisambiguator(record)
    ].join('|');
    if (seen.has(dedupeKey)) {
      return;
    }

    seen.add(dedupeKey);
    records.push({
      evidence_id: createEvidenceRecordId({
        collectorSnapshotId,
        agentId: record.agent_id,
        sourceKind: record.source_kind,
        evidenceRef: record.evidence_ref,
        index: records.length + 1
      }),
      observed_at: record.observed_at || null,
      collected_at: collectedAt,
      agent_id: record.agent_id || null,
      source_kind: record.source_kind,
      evidence_ref: record.evidence_ref,
      evidence_role: record.evidence_role || null,
      source_status: record.source_status || null,
      output_candidate: Boolean(record.output_candidate),
      collector_snapshot_id: collectorSnapshotId,
      correlation_id: record.correlation_id || collectorSnapshotId,
      degraded_reasons: normalizeStringValues(record.degraded_reasons),
      metadata: record.metadata || {}
    });
  };

  for (const item of Array.isArray(report.items) ? report.items : []) {
    const sourceHealth = item.source_health || {};
    const workspaceRootHealth = sourceHealth.workspace_root || null;
    if (workspaceRootHealth?.path) {
      appendRecord({
        observed_at: normalizeCollectorTimestamp(workspaceRootHealth.last_observed_at),
        agent_id: item.agent_id,
        source_kind: 'workspace_root',
        evidence_ref: workspaceRootHealth.path,
        evidence_role: 'workspace_presence',
        source_status: workspaceRootHealth.status || null,
        output_candidate: false,
        degraded_reasons: workspaceRootHealth.degraded_reasons,
        metadata: {
          path: workspaceRootHealth.path,
          source_health_key: 'workspace_root'
        }
      });
    }

    for (const observation of Array.isArray(item.workspace_observations) ? item.workspace_observations : []) {
      if (!observation?.path) {
        continue;
      }

      const sourceKind =
        observation.kind === 'workspace_root' ? 'workspace_root' : 'workspace_file';
      const fileName = observation.file_name || path.basename(observation.path);
      const evidenceRole =
        observation.evidence_role ||
        deriveWorkspaceEvidenceRecordRole({
          sourceKind,
          fileName
        });
      const health =
        sourceKind === 'workspace_root' ? sourceHealth.workspace_root : sourceHealth.workspace_files;

      appendRecord({
        observed_at: normalizeCollectorTimestamp(
          observation.last_modified_at || observation.last_observed_at || health?.last_observed_at
        ),
        agent_id: item.agent_id,
        source_kind: sourceKind,
        evidence_ref: observation.path,
        evidence_role: evidenceRole,
        source_status: health?.status || null,
        output_candidate: AGENT_OUTPUT_WORKSPACE_ROLES.has(evidenceRole),
        degraded_reasons: health?.degraded_reasons,
        metadata: {
          file_name: fileName,
          path: observation.path,
          source_health_key: sourceKind === 'workspace_root' ? 'workspace_root' : 'workspace_files'
        }
      });
    }

    for (const sourceRecord of Array.isArray(item.workspace_source_records)
      ? item.workspace_source_records
      : []) {
      if (
        sourceRecord?.kind !== 'workspace_file' ||
        !sourceRecord.path ||
        !isNegativeWorkspaceSourceStatus(sourceRecord.status)
      ) {
        continue;
      }

      const fileName = sourceRecord.file_name || path.basename(sourceRecord.path);
      appendRecord({
        observed_at: null,
        agent_id: item.agent_id,
        source_kind: 'workspace_file',
        evidence_ref: sourceRecord.path,
        evidence_role: deriveWorkspaceEvidenceRecordRole({
          sourceKind: 'workspace_file',
          fileName
        }),
        source_status: sourceRecord.status,
        output_candidate: false,
        degraded_reasons: createNegativeWorkspaceSourceReasons(sourceRecord),
        metadata: {
          file_name: fileName,
          path: sourceRecord.path,
          source_health_key: 'workspace_files'
        }
      });
    }

    for (const observation of Array.isArray(item.tmux_observations) ? item.tmux_observations : []) {
      const evidenceRef = observation?.artifact_ref || deriveTmuxArtifactRef(observation);
      if (!evidenceRef) {
        continue;
      }

      appendRecord({
        observed_at: normalizeCollectorTimestamp(observation.pane_activity_at),
        agent_id: item.agent_id,
        source_kind: 'tmux_observation',
        evidence_ref: evidenceRef,
        evidence_role: 'runtime_activity',
        source_status: sourceHealth.tmux_session?.status || null,
        output_candidate: true,
        degraded_reasons: sourceHealth.tmux_session?.degraded_reasons,
        metadata: {
          session_name: observation.session_name || null,
          window_index: observation.window_index || null,
          pane_index: observation.pane_index || null,
          pane_id: observation.pane_id || null,
          pane_current_command: observation.pane_current_command || null,
          source_health_key: 'tmux_session'
        }
      });
    }

    const hermesRuntimeObservations = Array.isArray(item.hermes_runtime_observations)
      ? item.hermes_runtime_observations
      : [];

    for (const observation of hermesRuntimeObservations) {
      if (!isHermesRuntimeSourceKind(observation?.source_kind) || !observation.evidence_ref) {
        continue;
      }

      const health = sourceHealth[observation.source_kind] || null;
      appendRecord({
        observed_at: normalizeCollectorTimestamp(
          observation.last_observed_at || observation.observed_at || health?.last_observed_at
        ),
        agent_id: item.agent_id,
        source_kind: observation.source_kind,
        evidence_ref: observation.evidence_ref,
        evidence_role: 'runtime_presence',
        source_status: observation.status || health?.status || null,
        output_candidate: false,
        degraded_reasons:
          Array.isArray(observation.degraded_reasons) && observation.degraded_reasons.length > 0
            ? observation.degraded_reasons
            : health?.degraded_reasons,
        metadata: createHermesEvidenceRecordMetadata({
          observation,
          sourceHealth: health,
          sourceHealthKey: observation.source_kind
        })
      });
    }

    const taskEvidenceObservations = Array.isArray(item.task_evidence_observations)
      ? item.task_evidence_observations
      : [];

    for (const [sourceIndex, observation] of taskEvidenceObservations.entries()) {
      const taskEvidence = normalizeTaskEvidenceObservation(observation);
      if (!taskEvidence) {
        continue;
      }

      appendRecord({
        observed_at: taskEvidence.observed_at,
        agent_id: item.agent_id,
        source_kind: taskEvidence.source_kind,
        evidence_ref: taskEvidence.evidence_ref,
        evidence_role: 'task_reference',
        source_status: taskEvidence.status,
        output_candidate: false,
        correlation_id: taskEvidence.correlation_id,
        degraded_reasons: taskEvidence.warnings,
        dedupe_disambiguator: ['task_evidence', sourceIndex, taskEvidence.correlation_id || ''],
        metadata: createTaskEvidenceRecordMetadata({
          observation: taskEvidence,
          sourceHealthKey: 'task_evidence',
          sourceIndex
        })
      });
    }
  }

  for (const session of report.runtime_source_evidence?.unmapped_tmux_sessions || []) {
    for (const paneRef of normalizeEvidenceRefs(session.pane_refs)) {
      appendRecord({
        observed_at: normalizeCollectorTimestamp(session.last_observed_at),
        agent_id: null,
        source_kind: 'tmux_observation',
        evidence_ref: paneRef,
        evidence_role: 'runtime_unmapped',
        source_status: session.status || 'observed',
        output_candidate: false,
        degraded_reasons: session.degraded_reasons,
        metadata: {
          session_name: session.session_name || null,
          observed_count: normalizeCount(session.observed_count),
          source_health_key: 'runtime_source_evidence.unmapped_tmux_sessions'
        }
      });
    }
  }

  const unmappedHermesSources = Array.isArray(
    report.runtime_source_evidence?.unmapped_hermes_sources
  )
    ? report.runtime_source_evidence.unmapped_hermes_sources
    : [];

  for (const [sourceIndex, source] of unmappedHermesSources.entries()) {
    if (!isHermesRuntimeSourceKind(source?.source_kind) || !source.evidence_ref) {
      continue;
    }

    appendRecord({
      observed_at: normalizeCollectorTimestamp(source.observed_at || source.last_observed_at),
      agent_id: null,
      source_kind: source.source_kind,
      evidence_ref: source.evidence_ref,
      evidence_role: 'runtime_unmapped',
      source_status: source.status || 'observed',
      output_candidate: false,
      degraded_reasons: source.degraded_reasons,
      dedupe_disambiguator: ['unmapped_hermes_source', sourceIndex],
      metadata: createHermesEvidenceRecordMetadata({
        observation: source,
        sourceHealth: null,
        sourceHealthKey: 'runtime_source_evidence.unmapped_hermes_sources'
      })
    });
  }

  const unmappedTaskEvidence = Array.isArray(report.runtime_source_evidence?.unmapped_task_evidence)
    ? report.runtime_source_evidence.unmapped_task_evidence
    : [];

  for (const [sourceIndex, source] of unmappedTaskEvidence.entries()) {
    const taskEvidence = normalizeTaskEvidenceObservation(source);
    if (!taskEvidence) {
      continue;
    }

    appendRecord({
      observed_at: taskEvidence.observed_at,
      agent_id: null,
      source_kind: taskEvidence.source_kind,
      evidence_ref: taskEvidence.evidence_ref,
      evidence_role: 'task_reference',
      source_status: taskEvidence.status,
      output_candidate: false,
      correlation_id: taskEvidence.correlation_id,
      degraded_reasons: taskEvidence.warnings,
      dedupe_disambiguator: ['unmapped_task_evidence', sourceIndex, taskEvidence.correlation_id || ''],
      metadata: createTaskEvidenceRecordMetadata({
        observation: taskEvidence,
        sourceHealthKey: 'runtime_source_evidence.unmapped_task_evidence',
        sourceIndex
      })
    });
  }

  return records;
}

function createCollectorEvidenceRecordDedupeDisambiguator(record) {
  if (!Array.isArray(record.dedupe_disambiguator)) {
    return [];
  }

  return record.dedupe_disambiguator.map((part) => `${part ?? ''}`);
}

function isNegativeWorkspaceSourceStatus(status) {
  return status === 'missing' || status === 'error';
}

function createNegativeWorkspaceSourceReasons(sourceRecord) {
  if (sourceRecord.status === 'error') {
    return [sourceRecord.error || 'workspace file stat error'];
  }

  return ['missing workspace file'];
}

function isHermesRuntimeSourceKind(sourceKind) {
  return sourceKind === 'hermes_profile' || sourceKind === 'hermes_session';
}

function normalizeTaskEvidenceObservation(observation) {
  if (!observation || typeof observation !== 'object' || Array.isArray(observation)) {
    return null;
  }

  const sourceKind = TASK_EVIDENCE_SOURCE_KINDS.has(observation.source_kind)
    ? observation.source_kind
    : null;
  const taskRef = normalizeTaskEvidenceValue(observation.task_ref);
  const observedAt = normalizeCollectorTimestamp(observation.observed_at);
  const correlationId = normalizeTaskEvidenceValue(observation.correlation_id);

  if (!sourceKind || !taskRef || !observedAt || !correlationId) {
    return null;
  }

  return {
    status: normalizeTaskEvidenceStatus(observation.status),
    task_ref: taskRef,
    source_kind: sourceKind,
    observed_at: observedAt,
    correlation_id: correlationId,
    evidence_ref: `task://${sourceKind}/${taskRef}`,
    fact_id: normalizeTaskEvidenceValue(observation.fact_id),
    source_index: Number.isSafeInteger(observation.source_index) ? observation.source_index : null,
    warnings: normalizeTaskEvidenceWarnings(observation.warnings || observation.degraded_reasons),
    source_provenance: normalizeHermesSourceProvenance(observation.source_provenance)
  };
}

function normalizeTaskEvidenceValue(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!SAFE_TASK_EVIDENCE_VALUE_PATTERN.test(trimmed) || isUnsafeTaskEvidenceValue(trimmed)) {
    return null;
  }

  return trimmed;
}

function isUnsafeTaskEvidenceValue(value) {
  return UNSAFE_TASK_EVIDENCE_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function normalizeTaskEvidenceWarnings(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(
      values
        .filter((value) => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => TASK_EVIDENCE_WARNING_CODES.has(value))
    )
  ).sort();
}

function normalizeTaskEvidenceStatus(status) {
  return EVIDENCE_RECORD_SOURCE_STATUSES.includes(status) ? status : 'observed';
}

function createTaskEvidenceRecordMetadata({ observation, sourceHealthKey, sourceIndex }) {
  const metadata = {
    task_ref: observation.task_ref,
    source_index: Number.isSafeInteger(observation.source_index)
      ? observation.source_index
      : sourceIndex,
    source_health_key: sourceHealthKey
  };

  if (observation.fact_id) {
    metadata.fact_id = observation.fact_id;
  }
  if (observation.warnings.length > 0) {
    metadata.warnings = observation.warnings.slice();
  }
  if (observation.source_provenance) {
    metadata.source_provenance = observation.source_provenance;
  }

  return metadata;
}

function createHermesEvidenceRecordMetadata({ observation, sourceHealth, sourceHealthKey }) {
  const sourceProvenance = normalizeHermesSourceProvenance(observation.source_provenance);
  return {
    profile_id: observation.profile_id || sourceHealth?.profile_id || null,
    session_ref:
      observation.session_ref ||
      sourceHealth?.session_ref ||
      sourceHealth?.expected_session_ref ||
      null,
    source_health_key: sourceHealthKey,
    ...(sourceProvenance ? { source_provenance: sourceProvenance } : {})
  };
}

function normalizeHermesSourceProvenance(sourceProvenance) {
  if (!sourceProvenance || typeof sourceProvenance !== 'object' || Array.isArray(sourceProvenance)) {
    return null;
  }

  if (!['json_array', 'jsonl'].includes(sourceProvenance.source_format)) {
    return null;
  }

  if (!Number.isSafeInteger(sourceProvenance.source_index) || sourceProvenance.source_index < 0) {
    return null;
  }

  const normalized = {
    source_format: sourceProvenance.source_format,
    source_index: sourceProvenance.source_index
  };
  if (sourceProvenance.source_format === 'jsonl') {
    if (!Number.isSafeInteger(sourceProvenance.line) || sourceProvenance.line < 1) {
      return null;
    }
    normalized.line = sourceProvenance.line;
  }
  if (
    Number.isSafeInteger(sourceProvenance.source_input_ordinal) &&
    sourceProvenance.source_input_ordinal > 0
  ) {
    normalized.source_input_ordinal = sourceProvenance.source_input_ordinal;
  }
  if (
    Number.isSafeInteger(sourceProvenance.source_file_ordinal) &&
    sourceProvenance.source_file_ordinal > 0
  ) {
    normalized.source_file_ordinal = sourceProvenance.source_file_ordinal;
  }

  return normalized;
}

function deriveWorkspaceEvidenceRecordRole({ sourceKind, fileName }) {
  if (sourceKind === 'workspace_root') {
    return 'workspace_presence';
  }

  if (fileName === 'inbox.md') {
    return 'inbound_task';
  }

  return fileName === 'todo.md' ? 'agent_plan' : 'agent_output';
}

function createEvidenceRecordId({ collectorSnapshotId, agentId, sourceKind, evidenceRef, index }) {
  return [
    'ev',
    sanitizeEventIdPart(collectorSnapshotId),
    sanitizeEventIdPart(agentId || 'runtime'),
    sanitizeEventIdPart(sourceKind),
    sanitizeEventIdPart(evidenceRef),
    index
  ].join('_');
}

function cloneEvidenceRecord(record) {
  return {
    ...record,
    degraded_reasons: Array.isArray(record.degraded_reasons) ? record.degraded_reasons.slice() : [],
    metadata: record.metadata && typeof record.metadata === 'object' ? { ...record.metadata } : {}
  };
}

function projectReplayCheckpointSummary({
  records,
  counts,
  events,
  heartbeats,
  evidenceRecords,
  collectorReports
}) {
  return {
    record_count: records.length,
    record_kind_buckets: createRecordKindBuckets(records),
    agent_count: counts.agent_count,
    event_count: counts.event_count,
    heartbeat_count: counts.heartbeat_count,
    evidence_record_count: evidenceRecords.length,
    collector_snapshot_count: collectorReports.length,
    latest_event: projectReplayCheckpointEvent(events.at(-1)),
    latest_heartbeat: projectReplayCheckpointHeartbeat(heartbeats.at(-1)),
    latest_evidence_record: projectReplayCheckpointEvidenceRecord(evidenceRecords.at(-1)),
    latest_collector_snapshot: projectReplayCheckpointCollectorSnapshot(collectorReports.at(-1))
  };
}

function projectStorageReplayManifest(records) {
  const canonicalRecords = records.map((record) => ({
    kind: projectReplayCheckpointRecordKind(record),
    checkpoint: projectReplayCheckpointRecord(record)
  }));

  return {
    record_count: canonicalRecords.length,
    record_kind_buckets: createRecordKindBuckets(canonicalRecords),
    canonical_record_hash: createHash('sha256')
      .update(stableStringify(canonicalRecords))
      .digest('hex')
  };
}

function projectReplayCheckpointLog({ records, limit, filters = {} }) {
  const requestedRecordKind =
    typeof filters.record_kind === 'string' && filters.record_kind.trim().length > 0
      ? filters.record_kind.trim()
      : null;
  const exactFilters = {
    evidence_id: normalizeFilterValue(filters.evidence_id),
    collector_snapshot_id: normalizeFilterValue(filters.collector_snapshot_id),
    correlation_id: normalizeFilterValue(filters.correlation_id),
    source_kind: normalizeFilterValue(filters.source_kind)
  };
  const entries = records
    .map((record, index) => ({ record, appendIndex: index + 1 }))
    .filter(({ record }) => (
      requestedRecordKind === null ||
      projectReplayCheckpointRecordKind(record) === requestedRecordKind
    ))
    .filter(({ record }) => matchesReplayCheckpointLogFilters(record, exactFilters));
  const startIndex = Math.max(0, entries.length - limit);
  return entries.slice(startIndex).map(({ record, appendIndex }) => ({
    append_index: appendIndex,
    record_kind: projectReplayCheckpointRecordKind(record),
    checkpoint: projectReplayCheckpointRecord(record)
  }));
}

function matchesReplayCheckpointLogFilters(record, filters) {
  return (
    matchesReplayCheckpointLogField(record, 'evidence_id', filters.evidence_id) &&
    matchesReplayCheckpointLogField(
      record,
      'collector_snapshot_id',
      filters.collector_snapshot_id
    ) &&
    matchesReplayCheckpointLogField(record, 'correlation_id', filters.correlation_id) &&
    matchesReplayCheckpointLogField(record, 'source_kind', filters.source_kind)
  );
}

function matchesReplayCheckpointLogField(record, field, expected) {
  if (!expected) {
    return true;
  }

  const payload = record && record.payload ? record.payload : null;
  if (!payload) {
    return false;
  }

  if (field === 'collector_snapshot_id' && record.kind === COLLECTOR_SNAPSHOT_RECORD_KIND) {
    return createCollectorCorrelationId(payload.collected_at) === expected;
  }

  return payload[field] === expected;
}

function projectReplayCheckpointRecordKind(record) {
  if (
    record.kind === 'event' ||
    record.kind === 'heartbeat' ||
    record.kind === EVIDENCE_RECORD_KIND ||
    record.kind === COLLECTOR_SNAPSHOT_RECORD_KIND
  ) {
    return record.kind;
  }

  return 'unknown';
}

function projectReplayCheckpointRecord(record) {
  if (record.kind === 'event') {
    return projectReplayCheckpointEvent(record.payload);
  }

  if (record.kind === 'heartbeat') {
    return projectReplayCheckpointHeartbeat(record.payload);
  }

  if (record.kind === EVIDENCE_RECORD_KIND) {
    return projectReplayCheckpointEvidenceRecord(record.payload);
  }

  if (record.kind === COLLECTOR_SNAPSHOT_RECORD_KIND) {
    return projectReplayCheckpointCollectorSnapshot(record.payload);
  }

  return null;
}

function createRecordKindBuckets(records) {
  const buckets = {};
  for (const record of records) {
    incrementBucket(buckets, record.kind);
  }
  return buckets;
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function projectReplayCheckpointEvent(event) {
  if (!event) {
    return null;
  }

  return {
    event_id: event.event_id,
    ts: event.ts,
    agent_id: event.agent_id,
    event_type: event.event_type,
    correlation_id: event.correlation_id || null,
    source_kind: event.source_kind || null
  };
}

function projectReplayCheckpointHeartbeat(heartbeat) {
  if (!heartbeat) {
    return null;
  }

  return {
    agent_id: heartbeat.agent_id,
    received_at: heartbeat.received_at
  };
}

function projectReplayCheckpointEvidenceRecord(record) {
  if (!record) {
    return null;
  }

  return {
    observed_at: record.observed_at,
    collected_at: record.collected_at,
    agent_id: record.agent_id,
    source_kind: record.source_kind,
    evidence_role: record.evidence_role,
    source_status: record.source_status,
    output_candidate: record.output_candidate === true,
    collector_snapshot_id: record.collector_snapshot_id,
    correlation_id: record.correlation_id,
    unmapped: record.agent_id === null
  };
}

function projectReplayCheckpointCollectorSnapshot(report) {
  if (!report) {
    return null;
  }

  return {
    collector_snapshot_id: createCollectorCorrelationId(report.collected_at),
    collected_at: report.collected_at,
    actor_id: report.actor_id,
    item_count: Array.isArray(report.items) ? report.items.length : 0
  };
}

function projectEvidenceProvenanceBundle(record) {
  const sourceFields = projectEvidenceSourceFields(record);
  const timeFields = projectEvidenceTimeFields(record);
  const inputProof = projectEvidenceInputProof(record);
  const bundle = {
    evidence_id: record.evidence_id,
    source_summary: projectEvidenceSourceSummary(record, sourceFields, timeFields),
    record: {
      observed_at: timeFields.observed_at,
      collected_at: timeFields.collected_at,
      agent_id: record.agent_id,
      source_kind: sourceFields.kind,
      evidence_role: sourceFields.role,
      source_status: sourceFields.status,
      output_candidate: record.output_candidate === true,
      collector_snapshot_id: record.collector_snapshot_id,
      correlation_id: record.correlation_id,
      unmapped: record.agent_id === null
    },
    anchors: {
      snapshot: createEvidenceSnapshotAnchor(record, sourceFields),
      source: createEvidenceSourceAnchor(record, sourceFields),
      replay: createEvidenceReplayAnchor(record)
    }
  };

  if (inputProof) {
    bundle.input_proof = inputProof;
  }

  return bundle;
}

function projectEvidenceSourceContext({ record, sourceHealth, sourceGapsSummary, sourceGapItems }) {
  const sourceFields = projectEvidenceSourceFields(record);
  const timeFields = projectEvidenceTimeFields(record);

  return {
    evidence_id: record.evidence_id,
    disclosure: projectEvidenceSourceContextDisclosure(record, sourceFields),
    source_summary: projectEvidenceSourceSummary(record, sourceFields, timeFields),
    record: {
      observed_at: timeFields.observed_at,
      collected_at: timeFields.collected_at,
      agent_id: record.agent_id,
      source_kind: sourceFields.kind,
      evidence_role: sourceFields.role,
      source_status: sourceFields.status,
      output_candidate: record.output_candidate === true,
      unmapped: record.agent_id === null
    },
    source_health: sourceHealth,
    source_gaps: {
      summary: projectEvidenceSourceContextGapsSummary(sourceGapsSummary),
      items: sourceGapItems.map(projectEvidenceSourceContextGapItem)
    }
  };
}

function projectEvidenceSourceContextDisclosure(record, sourceFields) {
  const mapped = typeof record.agent_id === 'string' && record.agent_id.length > 0;
  const mapping = mapped ? 'mapped' : 'unmapped';
  const freshness = projectEvidenceSourceContextFreshness(sourceFields.status);

  return {
    decision: 'allow',
    reason_code: `${mapping}_${freshness}`,
    mapping,
    freshness
  };
}

function projectEvidenceSourceContextFreshness(status) {
  if (status === 'observed') {
    return 'current';
  }

  if (RUNTIME_SOURCE_GAP_STATUSES.includes(status)) {
    return 'stale';
  }

  return 'unknown';
}

function projectEvidenceSourceContextGapsSummary(summary = {}) {
  const { collector_snapshot_id_buckets, ...publicSummary } = summary;
  return publicSummary;
}

function projectEvidenceSourceContextGapItem(item) {
  return {
    observed_at: projectEvidenceTimestampValue(item.observed_at),
    collected_at: projectEvidenceTimestampValue(item.collected_at),
    agent_id: item.agent_id,
    source_kind: projectKnownEvidenceValue(item.source_kind, EVIDENCE_RECORD_SOURCE_KINDS),
    evidence_role: projectKnownEvidenceValue(item.evidence_role, EVIDENCE_RECORD_ROLES),
    source_status: projectKnownEvidenceValue(item.source_status, EVIDENCE_RECORD_SOURCE_STATUSES),
    output_candidate: item.output_candidate === true,
    unmapped: item.agent_id === null
  };
}

function projectEvidenceInputProof(record) {
  return normalizeHermesSourceProvenance(record?.metadata?.source_provenance);
}

function projectEvidenceSourceFields(record) {
  return {
    kind: projectKnownEvidenceValue(record.source_kind, EVIDENCE_RECORD_SOURCE_KINDS),
    status: projectKnownEvidenceValue(record.source_status, EVIDENCE_RECORD_SOURCE_STATUSES),
    role: projectKnownEvidenceValue(record.evidence_role, EVIDENCE_RECORD_ROLES)
  };
}

function projectEvidenceTimeFields(record) {
  return {
    observed_at: projectEvidenceTimestampValue(record.observed_at),
    collected_at: projectEvidenceTimestampValue(record.collected_at)
  };
}

function projectEvidenceTimestampValue(value) {
  if (!isValidEvidenceRecordIsoValue(value)) {
    return null;
  }

  return new Date(Date.parse(value)).toISOString();
}

function projectKnownEvidenceValue(value, allowedValues) {
  return typeof value === 'string' && allowedValues.includes(value) ? value : null;
}

function projectEvidenceSourceSummary(
  record,
  sourceFields = projectEvidenceSourceFields(record),
  timeFields = projectEvidenceTimeFields(record)
) {
  return {
    kind: sourceFields.kind,
    status: sourceFields.status,
    role: sourceFields.role,
    output_candidate: record.output_candidate === true,
    mapped: typeof record.agent_id === 'string' && record.agent_id.length > 0,
    time: {
      observed_at: timeFields.observed_at,
      collected_at: timeFields.collected_at
    }
  };
}

function createEvidenceSnapshotAnchor(record, sourceFields = projectEvidenceSourceFields(record)) {
  if (!record.collector_snapshot_id) {
    return null;
  }

  const params = new URLSearchParams({ collector_snapshot_id: record.collector_snapshot_id });
  if (sourceFields.kind) {
    params.set('source_kind', sourceFields.kind);
  }

  return {
    collector_snapshot_id: record.collector_snapshot_id,
    route: `/collectors/controller-snapshot/source-health?${params.toString()}`
  };
}

function createEvidenceSourceAnchor(record, sourceFields = projectEvidenceSourceFields(record)) {
  if (!sourceFields.kind) {
    return null;
  }

  return {
    evidence_id: record.evidence_id,
    source_kind: sourceFields.kind,
    evidence_role: sourceFields.role,
    source_status: sourceFields.status,
    route: `/evidence-records/${encodeURIComponent(record.evidence_id)}`
  };
}

function createEvidenceReplayAnchor(record) {
  if (!record.evidence_id) {
    return null;
  }

  const params = new URLSearchParams({ evidence_id: record.evidence_id });
  return {
    evidence_id: record.evidence_id,
    correlation_id: record.correlation_id || null,
    route: `/accountability/replay?${params.toString()}`
  };
}

function isRuntimeSourceGapRecord(record) {
  if (record.evidence_role === 'task_reference' && TASK_EVIDENCE_SOURCE_KINDS.has(record.source_kind)) {
    return false;
  }

  if (RUNTIME_SOURCE_GAP_STATUSES.includes(record.source_status)) {
    return true;
  }

  return (
    record.source_status === 'observed' &&
    record.agent_id === null &&
    record.evidence_role === 'runtime_unmapped'
  );
}

function projectRuntimeSourceGapRecord(record) {
  return {
    observed_at: record.observed_at,
    collected_at: record.collected_at,
    agent_id: record.agent_id,
    source_kind: record.source_kind,
    evidence_role: record.evidence_role,
    source_status: record.source_status,
    output_candidate: record.output_candidate === true,
    collector_snapshot_id: record.collector_snapshot_id,
    correlation_id: record.correlation_id,
    unmapped: record.agent_id === null
  };
}

function projectAgentEvidenceSpineRecord(record) {
  return {
    observed_at: projectEvidenceTimestampValue(record.observed_at),
    collected_at: projectEvidenceTimestampValue(record.collected_at),
    source_kind: projectKnownEvidenceValue(record.source_kind, EVIDENCE_RECORD_SOURCE_KINDS),
    evidence_role: projectKnownEvidenceValue(record.evidence_role, EVIDENCE_RECORD_ROLES),
    source_status: projectKnownEvidenceValue(record.source_status, EVIDENCE_RECORD_SOURCE_STATUSES),
    output_candidate: record.output_candidate === true,
    collector_snapshot_id: record.collector_snapshot_id || null,
    correlation_id: record.correlation_id || null,
    unmapped: record.agent_id === null
  };
}

function projectAgentEvidenceSpineSourceHealth(sourceHealth, filters = {}) {
  if (!sourceHealth) {
    return null;
  }

  const sourceHealthKeys = resolveSourceHealthKeys(normalizeFilterValue(filters.source_kind));
  const status = normalizeSourceHealthStatus(
    normalizeFilterValue(filters.source_status || filters.status)
  );

  return {
    collected_at: sourceHealth.collected_at || null,
    collector_snapshot_id: sourceHealth.collector_snapshot_id || null,
    actor_id: sourceHealth.actor_id || null,
    summary:
      sourceHealth.summary ||
      createSourceHealthSummary(
        [],
        resolveSourceHealthKeys(filters.source_kind),
        normalizeSourceHealthStatus(normalizeFilterValue(filters.source_status || filters.status))
      ),
    agent_items: Array.isArray(sourceHealth.agent_items)
      ? sourceHealth.agent_items.map((item) => ({
          agent_id: item.agent_id,
          collector_snapshot_id: item.collector_snapshot_id || null,
          source_health: projectSourceHealth(item.source_health, sourceHealthKeys, status),
          evidence_count: normalizeCount(item.evidence_ref_count),
          latest_evidence_at: item.latest_evidence_at || null
        }))
      : []
  };
}

function projectEvidenceSourceContextCollectorHealth(report, filters = {}) {
  if (!report || !Array.isArray(report.items)) {
    return null;
  }

  const agentId = normalizeFilterValue(filters.agent_id);
  const requestedSourceKind = normalizeFilterValue(filters.source_kind);
  const sourceHealthKeys = resolveSourceHealthKeys(requestedSourceKind);
  const requestedStatus = normalizeFilterValue(filters.source_status || filters.status);
  const status = normalizeSourceHealthStatus(requestedStatus);
  const hasUnknownStatus = Boolean(requestedStatus) && !status;
  const limit = parseLimit(filters.limit);
  const evidenceCoverageRows = new Map(
    (report.evidence_coverage?.agent_items || [])
      .filter(isEvidenceCoverageAgentItem)
      .map((item) => [item.agent_id, item])
  );
  const selectedItems = hasUnknownStatus
    ? []
    : report.items
        .filter((item) => item && typeof item.agent_id === 'string' && item.agent_id.length > 0)
        .filter((item) => !agentId || item.agent_id === agentId)
        .filter(
          (item) => sourceHealthKeys.length > 0 && matchesSourceHealthStatus(item, sourceHealthKeys, status)
        )
        .slice(0, limit);

  return {
    collected_at: report.collected_at || null,
    summary: createSourceHealthSummary(selectedItems, sourceHealthKeys, status),
    agent_items: selectedItems.map((item) =>
      projectEvidenceSourceContextHealthAgentItem({
        item,
        sourceHealthKeys,
        status,
        evidenceCoverageRow: evidenceCoverageRows.get(item.agent_id) || null
      })
    )
  };
}

function projectEvidenceSourceContextHealthAgentItem({
  item,
  sourceHealthKeys,
  status,
  evidenceCoverageRow
}) {
  const evidenceRefs = normalizeEvidenceRefs(item.evidence_refs);

  return {
    agent_id: item.agent_id,
    source_health: projectEvidenceSourceContextSourceHealth(item.source_health, sourceHealthKeys, status),
    evidence_count: evidenceCoverageRow
      ? normalizeCount(evidenceCoverageRow.evidence_ref_count)
      : evidenceRefs.length,
    latest_evidence_at: evidenceCoverageRow?.latest_evidence_at || deriveLatestCollectorEvidenceAt(item)
  };
}

function projectEvidenceSourceContextSourceHealth(sourceHealth = {}, sourceHealthKeys, statusFilter = null) {
  const projected = {};

  for (const key of sourceHealthKeys) {
    const health = sourceHealth[key];
    if (!health || (statusFilter && health.status !== statusFilter)) {
      continue;
    }
    projected[key] = health;
  }

  return projected;
}

function createEmptyEvidenceSourceContextHealth(filters = {}) {
  return {
    collected_at: null,
    summary: createSourceHealthSummary(
      [],
      resolveSourceHealthKeys(filters.source_kind),
      normalizeSourceHealthStatus(normalizeFilterValue(filters.status))
    ),
    agent_items: []
  };
}

function projectEvidenceSourceContextHealth(sourceHealth) {
  return {
    collected_at: sourceHealth.collected_at || null,
    summary: sourceHealth.summary,
    agent_items: Array.isArray(sourceHealth.agent_items)
      ? sourceHealth.agent_items.map((item) => ({
          agent_id: item.agent_id,
          source_health: projectEvidenceSourceContextHealthEntries(item.source_health),
          evidence_count: normalizeCount(item.evidence_count ?? item.evidence_ref_count),
          latest_evidence_at: item.latest_evidence_at || null
        }))
      : []
  };
}

function projectEvidenceSourceContextHealthEntries(sourceHealth = {}) {
  const projected = {};

  if (sourceHealth.workspace_root) {
    projected.workspace_root = {
      status: normalizeSourceHealthStatus(sourceHealth.workspace_root.status),
      last_observed_at: normalizeCollectorTimestamp(sourceHealth.workspace_root.last_observed_at) || null
    };
  }

  if (sourceHealth.workspace_files) {
    projected.workspace_files = {
      status: normalizeSourceHealthStatus(sourceHealth.workspace_files.status),
      observed_count: normalizeCount(sourceHealth.workspace_files.observed_count),
      missing_count: normalizeCount(sourceHealth.workspace_files.missing_count),
      error_count: normalizeCount(sourceHealth.workspace_files.error_count),
      last_observed_at: normalizeCollectorTimestamp(sourceHealth.workspace_files.last_observed_at) || null
    };
  }

  if (sourceHealth.tmux_session) {
    projected.tmux_session = {
      status: normalizeSourceHealthStatus(sourceHealth.tmux_session.status),
      observed_count: normalizeCount(sourceHealth.tmux_session.observed_count),
      last_observed_at: normalizeCollectorTimestamp(sourceHealth.tmux_session.last_observed_at) || null
    };
  }

  if (sourceHealth.hermes_profile) {
    projected.hermes_profile = {
      status: normalizeSourceHealthStatus(sourceHealth.hermes_profile.status),
      last_observed_at: normalizeCollectorTimestamp(sourceHealth.hermes_profile.last_observed_at) || null
    };
  }

  if (sourceHealth.hermes_session) {
    projected.hermes_session = {
      status: normalizeSourceHealthStatus(sourceHealth.hermes_session.status),
      last_observed_at: normalizeCollectorTimestamp(sourceHealth.hermes_session.last_observed_at) || null
    };
  }

  return projected;
}

function buildPreviousTmuxRefByPaneId(previousItem = null, previousStableTmuxRefs = []) {
  const mapping = new Map();
  const previousObservations = previousItem?.tmux_observations || [];

  for (let index = 0; index < previousObservations.length; index += 1) {
    const observation = previousObservations[index];
    const stableRef =
      observation?.artifact_ref || previousStableTmuxRefs[index] || deriveTmuxArtifactRef(observation) || null;

    if (observation?.pane_id && stableRef) {
      mapping.set(observation.pane_id, stableRef);
    }
  }

  return mapping;
}

function normalizeCollectorTmuxObservation(
  observation = {},
  { currentStableTmuxRef = null, previousStableTmuxRefByPaneId = new Map() } = {}
) {
  const previousStableTmuxRef = observation.pane_id
    ? previousStableTmuxRefByPaneId.get(observation.pane_id) || null
    : null;
  const parsedStableRef = parseTmuxRef(currentStableTmuxRef || previousStableTmuxRef);

  const paneActivityAt = normalizeCollectorTimestamp(observation.pane_activity_at);
  const sessionName = observation.session_name || parsedStableRef?.session_name || null;
  const windowIndex = normalizeTmuxCoordinate(observation.window_index) || parsedStableRef?.window_index || null;
  const paneIndex = normalizeTmuxCoordinate(observation.pane_index) || parsedStableRef?.pane_index || null;
  const paneId = observation.pane_id || parsedStableRef?.pane_id || null;
  const artifactRef =
    deriveTmuxArtifactRef({
      session_name: sessionName,
      window_index: windowIndex,
      pane_index: paneIndex,
      pane_id: paneId
    }) ||
    currentStableTmuxRef ||
    previousStableTmuxRef ||
    null;

  return {
    ...observation,
    session_name: sessionName,
    window_index: windowIndex,
    pane_index: paneIndex,
    pane_id: paneId,
    pane_activity_at: paneActivityAt,
    artifact_ref: artifactRef
  };
}

function normalizeTmuxCoordinate(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = `${value}`.trim();
  if (!normalized || normalized === 'null' || normalized === 'undefined') {
    return null;
  }

  return normalized;
}

function parseTmuxRef(ref) {
  if (!isTmuxRef(ref)) {
    return null;
  }

  const body = ref.slice('tmux://'.length);
  const slashIndex = body.lastIndexOf('/');
  if (slashIndex === -1) {
    return {
      session_name: null,
      window_index: null,
      pane_index: null,
      pane_id: body || null
    };
  }

  const sessionName = body.slice(0, slashIndex) || null;
  const coordinates = body.slice(slashIndex + 1);
  const dotIndex = coordinates.indexOf('.');
  if (dotIndex === -1) {
    return {
      session_name: sessionName,
      window_index: null,
      pane_index: null,
      pane_id: null
    };
  }

  return {
    session_name: sessionName,
    window_index: normalizeTmuxCoordinate(coordinates.slice(0, dotIndex)),
    pane_index: normalizeTmuxCoordinate(coordinates.slice(dotIndex + 1)),
    pane_id: null
  };
}

function deriveCollectorCounterpartyAgentIds({ actorId, item }) {
  const watchedBy =
    item.supervision && Array.isArray(item.supervision.watched_by) ? item.supervision.watched_by : [];

  return Array.from(
    new Set(
      watchedBy.filter(
        (agentId) =>
          typeof agentId === 'string' &&
          agentId.length > 0 &&
          agentId !== actorId &&
          agentId !== item.agent_id
      )
    )
  );
}

function normalizeEvidenceRefs(evidenceRefs) {
  if (!Array.isArray(evidenceRefs)) {
    return [];
  }

  return Array.from(new Set(evidenceRefs.filter((ref) => typeof ref === 'string' && ref.length > 0)));
}

function normalizeStringValues(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(new Set(values.filter((value) => typeof value === 'string' && value.length > 0)))
    .sort();
}

function normalizeAgentIds(agentIds) {
  if (!Array.isArray(agentIds)) {
    return [];
  }

  return Array.from(
    new Set(agentIds.filter((agentId) => typeof agentId === 'string' && agentId.length > 0))
  ).sort();
}

function createCollectorBlockedSummary({ heartbeat }) {
  if (heartbeat.current_blocker) {
    return `Collector observed blocked execution: ${heartbeat.current_blocker}`;
  }

  if (heartbeat.reboot_recommended) {
    return 'Collector recommends reboot based on current supervision evidence';
  }

  return 'Collector observed a supervision alert';
}

function createCollectorStalenessSummary({ derivedStaleness }) {
  return `Collector observed ${derivedStaleness.severity} staleness since ${derivedStaleness.last_meaningful_output_at}`;
}

function createCollectorResolvedSummary({ family, heartbeat }) {
  if (family === 'staleness' && heartbeat.last_meaningful_output_at) {
    return `Collector cleared staleness after meaningful output at ${heartbeat.last_meaningful_output_at}`;
  }

  if (family === 'blocked' && !heartbeat.current_blocker) {
    return 'Collector cleared blocked execution after new snapshot evidence';
  }

  return 'Collector cleared the previous supervision alert';
}

function projectCollectorEvidenceCoverage(report, filters = {}) {
  const coverage = report?.evidence_coverage || null;
  if (!coverage || !Array.isArray(coverage.agent_items)) {
    return null;
  }

  const agentId = normalizeFilterValue(filters.agent_id);
  const sourceKind = normalizeFilterValue(filters.source_kind);
  const confidenceLevel = normalizeFilterValue(filters.confidence_level);
  const limit = parseLimit(filters.limit);
  const filteredAgentRows = coverage.agent_items
    .filter(isEvidenceCoverageAgentItem)
    .filter((item) => !agentId || item.agent_id === agentId)
    .filter((item) => !sourceKind || normalizeStringValues(item.source_kinds).includes(sourceKind))
    .filter((item) => !confidenceLevel || item.confidence_level === confidenceLevel)
    .slice(0, limit);
  const aggregate = createEvidenceCoverageAggregate(report, filteredAgentRows);

  return {
    collected_at: report.collected_at || null,
    collector_snapshot_id: createCollectorCorrelationId(
      normalizeCollectorTimestamp(report.collected_at) || report.collected_at || 'unknown'
    ),
    actor_id: report.actor_id || null,
    evidence_ref_count: aggregate.evidence_ref_count,
    covered_agent_count: aggregate.covered_agent_count,
    low_confidence_agent_ids: aggregate.low_confidence_agent_ids,
    source_kind_buckets: aggregate.source_kind_buckets,
    agent_items: aggregate.agent_items.map(projectEvidenceCoverageAgentItem)
  };
}

function projectCollectorSourceHealth(report, filters = {}) {
  if (!report || !Array.isArray(report.items)) {
    return null;
  }

  const agentId = normalizeFilterValue(filters.agent_id);
  const requestedSourceKind = normalizeFilterValue(filters.source_kind);
  const sourceHealthKeys = resolveSourceHealthKeys(requestedSourceKind);
  const requestedStatus = normalizeFilterValue(filters.status);
  const status = normalizeSourceHealthStatus(requestedStatus);
  const hasUnknownStatus = Boolean(requestedStatus) && !status;
  const limit = parseLimit(filters.limit);
  const collectorSnapshotId = createCollectorCorrelationId(
    normalizeCollectorTimestamp(report.collected_at) || report.collected_at || 'unknown'
  );
  const evidenceCoverageRows = new Map(
    (report.evidence_coverage?.agent_items || [])
      .filter(isEvidenceCoverageAgentItem)
      .map((item) => [item.agent_id, item])
  );
  const selectedItems = hasUnknownStatus
    ? []
    : report.items
        .filter((item) => item && typeof item.agent_id === 'string' && item.agent_id.length > 0)
        .filter((item) => !agentId || item.agent_id === agentId)
        .filter(
          (item) => sourceHealthKeys.length > 0 && matchesSourceHealthStatus(item, sourceHealthKeys, status)
        )
        .slice(0, limit);

  return {
    collected_at: report.collected_at || null,
    collector_snapshot_id: collectorSnapshotId,
    actor_id: report.actor_id || null,
    summary: createSourceHealthSummary(selectedItems, sourceHealthKeys, status),
    runtime_source_evidence: cloneRuntimeSourceEvidence(report.runtime_source_evidence, {
      sourceKind: requestedSourceKind,
      status: hasUnknownStatus ? '__unknown_status__' : status
    }),
    agent_items: selectedItems.map((item) =>
      projectSourceHealthAgentItem({
        item,
        collectorSnapshotId,
        sourceHealthKeys,
        status,
        evidenceCoverageRow: evidenceCoverageRows.get(item.agent_id) || null
      })
    )
  };
}

function findCollectorReportByIdOrLatest(reports, latestReport, filters = {}) {
  const collectorSnapshotId = normalizeFilterValue(filters.collector_snapshot_id);
  if (!collectorSnapshotId) {
    return latestReport;
  }

  return (
    reports.find(
      (report) =>
        createCollectorCorrelationId(
          normalizeCollectorTimestamp(report?.collected_at) || report?.collected_at || 'unknown'
        ) === collectorSnapshotId
    ) || null
  );
}

function projectCollectorSnapshotHistorySummary(reports = [], filters = {}) {
  const collectorSnapshotId = normalizeFilterValue(filters.collector_snapshot_id);
  const agentId = normalizeFilterValue(filters.agent_id);
  const sourceKind = normalizeFilterValue(filters.source_kind);
  const sourceHealthKeys = resolveSourceHealthKeys(sourceKind);
  const requestedStatus = normalizeFilterValue(filters.status);
  const status = normalizeSourceHealthStatus(requestedStatus);
  const hasUnknownStatus = Boolean(requestedStatus) && !status;
  const collectedSince = parseOptionalTimestampFilter(filters.collected_since);
  const collectedUntil = parseOptionalTimestampFilter(filters.collected_until);
  const limit = parseLimit(filters.limit);
  const rows = hasUnknownStatus
    ? []
    : reports
        .map((report) =>
          projectCollectorSnapshotHistoryItem(report, {
            agentId,
            sourceHealthKeys,
            status
          })
        )
        .filter(Boolean)
        .filter((item) => !collectorSnapshotId || item.collector_snapshot_id === collectorSnapshotId)
        .filter((item) =>
          matchesTimestampWindow(item.collected_at, collectedSince, collectedUntil)
        )
        .sort(compareCollectorSnapshotHistoryRecency);
  const items = rows.slice(0, limit);
  const aggregate = createCollectorSnapshotHistoryAggregate(items);

  return {
    total_count: rows.length,
    returned_limit: limit,
    source_kind_buckets: aggregate.source_kind_buckets,
    status_buckets: aggregate.status_buckets,
    items
  };
}

function projectCollectorSnapshotDiff(reports = [], filters = {}) {
  const pair = selectCollectorSnapshotDiffReports(reports, filters);
  if (!pair) {
    return null;
  }

  const { fromReport, toReport } = pair;
  const limit = parseLimit(filters.limit);
  const fromHealth = createCollectorSnapshotDiffHealthAggregate(fromReport);
  const toHealth = createCollectorSnapshotDiffHealthAggregate(toReport);
  const agentChanges = createCollectorSnapshotDiffAgentChanges(fromReport, toReport);

  return {
    from_collector_snapshot_id: createCollectorSnapshotId(fromReport),
    to_collector_snapshot_id: createCollectorSnapshotId(toReport),
    from_collected_at: fromReport.collected_at || null,
    to_collected_at: toReport.collected_at || null,
    summary_delta: createCollectorSnapshotSummaryDelta(fromReport, toReport),
    source_health_delta: {
      source_kind_buckets: subtractBuckets(toHealth.source_kind_buckets, fromHealth.source_kind_buckets),
      status_buckets: subtractBuckets(toHealth.status_buckets, fromHealth.status_buckets)
    },
    agent_change_count: agentChanges.length,
    returned_limit: limit,
    agent_changes: agentChanges.slice(0, limit)
  };
}

function selectCollectorSnapshotDiffReports(reports = [], filters = {}) {
  if (reports.length < 2) return null;
  const fromId = normalizeFilterValue(filters.from_collector_snapshot_id || filters.from);
  const toId = normalizeFilterValue(filters.to_collector_snapshot_id || filters.to);
  if (Boolean(fromId) !== Boolean(toId)) return null;
  const findIndex = (id) => reports.findIndex((report) => createCollectorSnapshotId(report) === id);
  const toIndex = toId ? findIndex(toId) : reports.length - 1;
  const fromIndex = fromId ? findIndex(fromId) : toIndex - 1;
  return toIndex >= 0 && fromIndex >= 0
    ? { fromReport: reports[fromIndex], toReport: reports[toIndex] }
    : null;
}

function createCollectorSnapshotId(report) {
  return createCollectorCorrelationId(
    normalizeCollectorTimestamp(report?.collected_at) || report?.collected_at || 'unknown'
  );
}

function createCollectorSnapshotSummaryDelta(fromReport, toReport) {
  const fromSummary = fromReport.summary || {};
  const toSummary = toReport.summary || {};
  return Object.fromEntries([
    'agent_count',
    'heartbeat_count',
    'tmux_observed_count',
    'workspace_observed_count',
    'reboot_recommended_count'
  ].map((field) => [field, normalizeCount(toSummary[field]) - normalizeCount(fromSummary[field])]));
}

function createCollectorSnapshotDiffHealthAggregate(report) {
  return createCollectorSnapshotHistoryAggregateFromReportItems(report.items || [], {
    sourceHealthKeys: SOURCE_HEALTH_KEYS,
    status: null
  });
}

function subtractBuckets(toBuckets, fromBuckets) {
  return Object.fromEntries(
    Object.keys(toBuckets).map((key) => [key, normalizeCount(toBuckets[key]) - normalizeCount(fromBuckets?.[key])])
  );
}

function createCollectorSnapshotDiffAgentChanges(fromReport, toReport) {
  const toItemMap = (report) => new Map(
    (report.items || [])
      .filter((item) => item && typeof item.agent_id === 'string' && item.agent_id.length > 0)
      .map((item) => [item.agent_id, item])
  );
  const fromItems = toItemMap(fromReport);
  const toItems = toItemMap(toReport);
  return normalizeAgentIds([...fromItems.keys(), ...toItems.keys()])
    .map((agentId) => createCollectorSnapshotDiffAgentChange(
      agentId,
      fromItems.get(agentId) || null,
      toItems.get(agentId) || null
    ))
    .filter(Boolean);
}

function createCollectorSnapshotDiffAgentChange(agentId, fromItem, toItem) {
  const changeType = !fromItem ? 'added' : !toItem ? 'removed' : 'changed';
  const sourceHealthStatusChanges = createSourceHealthStatusChanges(fromItem, toItem);
  const heartbeatChanged = createCollectorHeartbeatDiffSignature(fromItem) !==
    createCollectorHeartbeatDiffSignature(toItem);
  if (changeType === 'changed' && !heartbeatChanged && Object.keys(sourceHealthStatusChanges).length === 0) return null;
  return { agent_id: agentId, change_type: changeType, heartbeat_changed: heartbeatChanged, source_health_status_changes: sourceHealthStatusChanges };
}

function createSourceHealthStatusChanges(fromItem, toItem) {
  const changes = {};
  for (const key of SOURCE_HEALTH_KEYS) {
    const fromStatus = normalizeSourceHealthStatus(fromItem?.source_health?.[key]?.status);
    const toStatus = normalizeSourceHealthStatus(toItem?.source_health?.[key]?.status);
    if (fromStatus !== toStatus) changes[key] = { from: fromStatus, to: toStatus };
  }
  return changes;
}

function createCollectorHeartbeatDiffSignature(item) {
  const heartbeat = item?.heartbeat || null;
  return heartbeat ? [
    heartbeat.current_state || '',
    heartbeat.active_task || '',
    heartbeat.last_meaningful_output_at || '',
    heartbeat.last_file_write_at || '',
    heartbeat.current_blocker || '',
    heartbeat.confidence_level || '',
    heartbeat.reboot_recommended ? '1' : '0'
  ].join('|') : '';
}

function projectCollectorSnapshotHistoryItem(report, { agentId, sourceHealthKeys, status }) {
  if (!report || !Array.isArray(report.items)) {
    return null;
  }

  const selectedItems = report.items
    .filter((item) => item && typeof item.agent_id === 'string' && item.agent_id.length > 0)
    .filter((item) => !agentId || item.agent_id === agentId)
    .filter((item) => matchesSourceHealthStatus(item, sourceHealthKeys, status));

  if (selectedItems.length === 0) {
    return null;
  }

  const aggregate = createCollectorSnapshotHistoryAggregateFromReportItems(selectedItems, {
    sourceHealthKeys,
    status
  });
  const summary = report.summary || {};

  return {
    collector_snapshot_id: createCollectorCorrelationId(
      normalizeCollectorTimestamp(report.collected_at) || report.collected_at || 'unknown'
    ),
    collected_at: report.collected_at || null,
    actor_id: report.actor_id || null,
    agent_count: normalizeCount(summary.agent_count),
    heartbeat_count: normalizeCount(summary.heartbeat_count),
    tmux_observed_count: normalizeCount(summary.tmux_observed_count),
    workspace_observed_count: normalizeCount(summary.workspace_observed_count),
    reboot_recommended_count: normalizeCount(summary.reboot_recommended_count),
    matched_agent_count: selectedItems.length,
    source_kind_buckets: aggregate.source_kind_buckets,
    status_buckets: aggregate.status_buckets
  };
}

function createCollectorSnapshotHistoryAggregate(items) {
  const aggregate = createEmptyCollectorSnapshotHistoryAggregate();

  for (const item of items) {
    mergeBuckets(aggregate.source_kind_buckets, item.source_kind_buckets);
    mergeBuckets(aggregate.status_buckets, item.status_buckets);
  }

  return aggregate;
}

function createCollectorSnapshotHistoryAggregateFromReportItems(items, { sourceHealthKeys, status }) {
  const aggregate = createEmptyCollectorSnapshotHistoryAggregate();

  for (const item of items) {
    const sourceHealth = item.source_health || {};
    for (const key of sourceHealthKeys) {
      const sourceStatus = normalizeSourceHealthStatus(sourceHealth[key]?.status);
      if (!sourceStatus || (status && sourceStatus !== status)) {
        continue;
      }

      aggregate.source_kind_buckets[key] += 1;
      aggregate.status_buckets[sourceStatus] += 1;
    }
  }

  return aggregate;
}

function createEmptyCollectorSnapshotHistoryAggregate() {
  return {
    source_kind_buckets: Object.fromEntries(SOURCE_HEALTH_KEYS.map((key) => [key, 0])),
    status_buckets: createEmptySourceHealthStatusBucket()
  };
}

function mergeBuckets(target, source) {
  for (const key of Object.keys(target)) {
    target[key] += normalizeCount(source?.[key]);
  }
}

function compareCollectorSnapshotHistoryRecency(left, right) {
  return Date.parse(right.collected_at || '') - Date.parse(left.collected_at || '');
}

const SOURCE_HEALTH_KEY_BY_SOURCE_KIND = Object.freeze({
  workspace_root: 'workspace_root',
  workspace_file: 'workspace_files',
  workspace_files: 'workspace_files',
  tmux_observation: 'tmux_session',
  tmux_session: 'tmux_session',
  hermes_profile: 'hermes_profile',
  hermes_session: 'hermes_session'
});
const SOURCE_HEALTH_KEYS = Object.freeze([
  'workspace_root',
  'workspace_files',
  'tmux_session',
  'hermes_profile',
  'hermes_session'
]);
const SOURCE_HEALTH_STATUSES = Object.freeze(['observed', 'degraded', 'missing', 'error']);

function resolveSourceHealthKeys(sourceKind) {
  if (!sourceKind) {
    return SOURCE_HEALTH_KEYS.slice();
  }

  const sourceHealthKey = SOURCE_HEALTH_KEY_BY_SOURCE_KIND[sourceKind];
  return sourceHealthKey ? [sourceHealthKey] : [];
}

function matchesSourceHealthStatus(item, sourceHealthKeys, status) {
  const sourceHealth = item.source_health || {};
  return sourceHealthKeys.some((key) => {
    const health = sourceHealth[key] || null;
    if (!health) {
      return false;
    }

    return !status || health.status === status;
  });
}

function createSourceHealthSummary(items, sourceHealthKeys, statusFilter = null) {
  const sourceKindBuckets = Object.fromEntries(
    SOURCE_HEALTH_KEYS.map((key) => [key, createEmptySourceHealthStatusBucket()])
  );
  const statusBuckets = createEmptySourceHealthStatusBucket();

  for (const item of items) {
    const sourceHealth = item.source_health || {};
    for (const key of sourceHealthKeys) {
      const status = normalizeSourceHealthStatus(sourceHealth[key]?.status);
      if (!status || (statusFilter && status !== statusFilter)) {
        continue;
      }

      sourceKindBuckets[key][status] += 1;
      statusBuckets[status] += 1;
    }
  }

  return {
    agent_count: items.length,
    source_kind_buckets: sourceKindBuckets,
    status_buckets: statusBuckets
  };
}

function createEmptySourceHealthStatusBucket() {
  return Object.fromEntries(SOURCE_HEALTH_STATUSES.map((status) => [status, 0]));
}

function normalizeSourceHealthStatus(status) {
  return SOURCE_HEALTH_STATUSES.includes(status) ? status : null;
}

function projectSourceHealthAgentItem({
  item,
  collectorSnapshotId,
  sourceHealthKeys,
  status,
  evidenceCoverageRow
}) {
  const evidenceRefs = normalizeEvidenceRefs(item.evidence_refs);

  return {
    agent_id: item.agent_id,
    collector_snapshot_id: collectorSnapshotId,
    source_health: projectSourceHealth(item.source_health, sourceHealthKeys, status),
    evidence_ref_count: evidenceCoverageRow
      ? normalizeCount(evidenceCoverageRow.evidence_ref_count)
      : evidenceRefs.length,
    latest_evidence_at: evidenceCoverageRow?.latest_evidence_at || deriveLatestCollectorEvidenceAt(item)
  };
}

function projectSourceHealth(sourceHealth = {}, sourceHealthKeys, statusFilter = null) {
  const projected = {};

  for (const key of sourceHealthKeys) {
    const health = sourceHealth[key];
    if (!health || (statusFilter && health.status !== statusFilter)) {
      continue;
    }

    projected[key] = cloneSourceHealthEntry(health);
  }

  return projected;
}

function cloneSourceHealthEntry(health) {
  return {
    status: normalizeSourceHealthStatus(health.status),
    last_observed_at: normalizeCollectorTimestamp(health.last_observed_at) || null,
    ...(Number.isFinite(health.observed_count)
      ? { observed_count: health.observed_count }
      : {})
  };
}

function cloneUnmappedTmuxSessions(sessions, filters = {}) {
  if (!Array.isArray(sessions)) {
    return [];
  }

  const sourceHealthKeys = resolveSourceHealthKeys(filters.sourceKind);
  if (filters.sourceKind && !sourceHealthKeys.includes('tmux_session')) {
    return [];
  }

  return sessions
    .map((session) => ({
      status: normalizeSourceHealthStatus(session.status) || 'observed',
      observed_count: normalizeCount(session.observed_count),
      last_observed_at: normalizeCollectorTimestamp(session.last_observed_at) || null
    }))
    .filter((session) => !filters.status || session.status === filters.status);
}

function summarizeUnmappedTaskEvidence(sources, filters = {}) {
  if (!Array.isArray(sources)) {
    return [];
  }

  const summaries = new Map();
  for (const source of sources) {
    const taskEvidence = normalizeTaskEvidenceObservation(source);
    if (!taskEvidence) {
      continue;
    }
    if (!matchesRuntimeSourceEvidenceFilters(taskEvidence, filters)) {
      continue;
    }

    const key = `${taskEvidence.source_kind}|${taskEvidence.status}`;
    const existing = summaries.get(key) || {
      source_kind: taskEvidence.source_kind,
      status: taskEvidence.status,
      observed_count: 0,
      latest_observed_at: null
    };
    existing.observed_count += 1;
    existing.latest_observed_at = maxCollectorIsoTimestamp([
      existing.latest_observed_at,
      taskEvidence.observed_at
    ]);
    summaries.set(key, existing);
  }

  return Array.from(summaries.values()).sort((left, right) => {
    const sourceKindOrder =
      EVIDENCE_RECORD_SOURCE_KINDS.indexOf(left.source_kind) -
      EVIDENCE_RECORD_SOURCE_KINDS.indexOf(right.source_kind);
    if (sourceKindOrder !== 0) {
      return sourceKindOrder;
    }

    return EVIDENCE_RECORD_SOURCE_STATUSES.indexOf(left.status) -
      EVIDENCE_RECORD_SOURCE_STATUSES.indexOf(right.status);
  });
}

function matchesRuntimeSourceEvidenceFilters(source, filters = {}) {
  if (filters.sourceKind && source.source_kind !== filters.sourceKind) {
    return false;
  }

  if (filters.status && source.status !== filters.status) {
    return false;
  }

  return true;
}

function cloneRuntimeSourceEvidence(runtimeSourceEvidence = {}, filters = {}) {
  return {
    unmapped_tmux_sessions: cloneUnmappedTmuxSessions(
      runtimeSourceEvidence?.unmapped_tmux_sessions,
      filters
    ),
    ...(Array.isArray(runtimeSourceEvidence?.unmapped_hermes_sources)
      ? {
          unmapped_hermes_sources: runtimeSourceEvidence.unmapped_hermes_sources
            .map((source) => ({
              source_kind: projectKnownEvidenceValue(source.source_kind, EVIDENCE_RECORD_SOURCE_KINDS),
              status: normalizeSourceHealthStatus(source.status),
              observed_count: normalizeCount(source.observed_count),
              last_observed_at:
                normalizeCollectorTimestamp(source.last_observed_at || source.observed_at) || null
            }))
            .filter((source) => matchesRuntimeSourceEvidenceFilters(source, filters))
        }
      : {}),
    ...(Array.isArray(runtimeSourceEvidence?.unmapped_task_evidence)
      ? {
          unmapped_task_evidence: summarizeUnmappedTaskEvidence(
            runtimeSourceEvidence.unmapped_task_evidence,
            filters
          )
        }
      : {})
  };
}

function deriveLatestCollectorEvidenceAt(item = {}) {
  return maxCollectorIsoTimestamp([
    ...(Array.isArray(item.workspace_observations) ? item.workspace_observations : [])
      .map((observation) => observation.last_modified_at),
    ...(Array.isArray(item.tmux_observations) ? item.tmux_observations : [])
      .map((observation) => observation.pane_activity_at),
    ...(Array.isArray(item.hermes_runtime_observations) ? item.hermes_runtime_observations : [])
      .map((observation) => observation.last_observed_at || observation.observed_at),
    item.heartbeat?.last_meaningful_output_at,
    item.heartbeat?.last_file_write_at
  ]);
}

function maxCollectorIsoTimestamp(values = []) {
  const timestamps = values
    .filter((value) => typeof value === 'string' && value.length > 0)
    .filter((value) => !Number.isNaN(Date.parse(value)));

  if (timestamps.length === 0) {
    return null;
  }

  return timestamps.sort((left, right) => Date.parse(right) - Date.parse(left))[0];
}

function createEvidenceCoverageAggregate(report, agentRows) {
  const itemsByAgentId = new Map(
    (Array.isArray(report?.items) ? report.items : [])
      .filter((item) => item && typeof item.agent_id === 'string')
      .map((item) => [item.agent_id, item])
  );
  const selectedItems = [];

  for (const row of agentRows) {
    const item = itemsByAgentId.get(row.agent_id);
    if (!item) {
      return createEvidenceCoverageAggregateFromRows(agentRows);
    }

    selectedItems.push(item);
  }

  return createEvidenceCoverageLedger(selectedItems);
}

function createEvidenceCoverageAggregateFromRows(agentRows) {
  const sourceKindBuckets = {
    workspace_file: 0,
    workspace_root: 0,
    tmux_observation: 0
  };
  let evidenceRefCount = 0;
  let coveredAgentCount = 0;
  const lowConfidenceAgentIds = [];

  for (const row of agentRows) {
    const rowEvidenceRefCount = normalizeCount(row.evidence_ref_count);
    evidenceRefCount += rowEvidenceRefCount;

    if (rowEvidenceRefCount > 0) {
      coveredAgentCount += 1;
    }

    if (row.confidence_level !== 'high' || rowEvidenceRefCount === 0) {
      lowConfidenceAgentIds.push(row.agent_id);
    }

    for (const sourceKind of normalizeStringValues(row.source_kinds)) {
      if (
        isHermesRuntimeSourceKind(sourceKind) &&
        !Object.prototype.hasOwnProperty.call(sourceKindBuckets, sourceKind)
      ) {
        sourceKindBuckets[sourceKind] = 0;
      }

      if (Object.prototype.hasOwnProperty.call(sourceKindBuckets, sourceKind)) {
        sourceKindBuckets[sourceKind] += 1;
      }
    }
  }

  return {
    evidence_ref_count: evidenceRefCount,
    covered_agent_count: coveredAgentCount,
    low_confidence_agent_ids: lowConfidenceAgentIds,
    source_kind_buckets: sourceKindBuckets,
    agent_items: agentRows.map(projectEvidenceCoverageAgentItem)
  };
}

function projectEvidenceCoverageAgentItem(item) {
  return {
    agent_id: item.agent_id,
    evidence_ref_count: normalizeCount(item.evidence_ref_count),
    source_kinds: normalizeStringValues(item.source_kinds),
    latest_evidence_at: item.latest_evidence_at || null,
    confidence_level: item.confidence_level || null
  };
}

function isEvidenceCoverageAgentItem(item) {
  return item && typeof item.agent_id === 'string' && item.agent_id.length > 0;
}

function normalizeFilterValue(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOptionalTimestampFilter(value) {
  const normalized = normalizeFilterValue(value);
  if (!normalized) {
    return null;
  }

  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function matchesTimestampWindow(value, since, until) {
  if (since === null && until === null) {
    return true;
  }

  const timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  return (since === null || timestamp >= since) && (until === null || timestamp <= until);
}

function compareEvidenceRecordRecency(left, right) {
  const observedComparison =
    getEvidenceRecordTimestamp(right.observed_at) - getEvidenceRecordTimestamp(left.observed_at);
  if (observedComparison !== 0) {
    return observedComparison;
  }

  const collectedComparison =
    getEvidenceRecordTimestamp(right.collected_at) - getEvidenceRecordTimestamp(left.collected_at);
  if (collectedComparison !== 0) {
    return collectedComparison;
  }

  return compareStringsAsc(getEvidenceRecordTieKey(left), getEvidenceRecordTieKey(right));
}

function getEvidenceRecordTimestamp(value) {
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getEarliestEvidenceRecordIsoValue(currentValue, nextValue) {
  if (!isValidEvidenceRecordIsoValue(nextValue)) {
    return currentValue;
  }
  if (!isValidEvidenceRecordIsoValue(currentValue)) {
    return nextValue;
  }

  return Date.parse(currentValue) <= Date.parse(nextValue) ? currentValue : nextValue;
}

function getLatestEvidenceRecordIsoValue(currentValue, nextValue) {
  if (!isValidEvidenceRecordIsoValue(nextValue)) {
    return currentValue;
  }
  if (!isValidEvidenceRecordIsoValue(currentValue)) {
    return nextValue;
  }

  return Date.parse(currentValue) >= Date.parse(nextValue) ? currentValue : nextValue;
}

function isValidEvidenceRecordIsoValue(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function getEvidenceRecordTieKey(record) {
  return [
    record?.evidence_id,
    record?.collector_snapshot_id,
    record?.agent_id,
    record?.source_kind,
    record?.evidence_ref,
    record?.evidence_role,
    record?.correlation_id
  ]
    .map((value) => (typeof value === 'string' ? value : ''))
    .join('\u0000');
}

function compareStringsAsc(left, right) {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function normalizeOptionalBoolean(value) {
  if (value === true || value === false) {
    return value;
  }

  const normalized = normalizeFilterValue(value);
  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  return null;
}

function normalizeCount(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function createCollectorAlertSignature({ family, severity, heartbeat }) {
  return [
    family,
    severity,
    heartbeat.current_state || '',
    heartbeat.last_meaningful_output_at || '',
    heartbeat.current_blocker || '',
    heartbeat.reboot_recommended ? '1' : '0'
  ].join('|');
}

function createCollectorResolutionSignature({ family, previousEvent, heartbeat }) {
  return [
    'resolved',
    family,
    previousEvent.metadata.collector_alert_signature,
    heartbeat.current_state || '',
    heartbeat.last_meaningful_output_at || '',
    heartbeat.current_blocker || '',
    heartbeat.reboot_recommended ? '1' : '0'
  ].join('|');
}

function createCollectorCorrelationId(collectedAt) {
  return `collector-snapshot:${collectedAt}`;
}

function createCollectorEventId({ report, agentId, family, phase, severity }) {
  return [
    'evt',
    'collector',
    sanitizeEventIdPart(agentId),
    sanitizeEventIdPart(family),
    sanitizeEventIdPart(phase),
    sanitizeEventIdPart(severity),
    sanitizeEventIdPart(report.collected_at)
  ].join('_');
}

function sanitizeEventIdPart(value) {
  return `${value}`.replace(/[^a-zA-Z0-9_-]+/g, '_');
}

function validateCollectorEvent(event, actorId) {
  const validation = validateEventPayload(event, { actorId });
  if (validation.ok) {
    return validation.value;
  }

  const error = new Error(
    `collector supervision event validation failed: ${validation.errors.join('; ')}`
  );
  error.details = validation.errors;
  throw error;
}

function isCollectorDerivedPeerWatchEvent(event) {
  return (
    event &&
    event.event_type &&
    event.event_type.startsWith('peer_watch_alert_') &&
    event.metadata &&
    event.metadata.collector_derived === true
  );
}

function shouldEventAdvanceMeaningfulOutput(event) {
  return !isCollectorDerivedPeerWatchEvent(event);
}

function shouldEventResetSeverity(event) {
  return (
    event.event_type === 'peer_watch_alert_resolved' ||
    event.event_type === 'agent_reboot_completed'
  );
}

function deriveInteractions(events) {
  const orderedEvents = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => getInteractionDescriptor(event))
    .sort((left, right) => {
      const leftTs = Date.parse(left.event.ts);
      const rightTs = Date.parse(right.event.ts);

      if (leftTs !== rightTs) {
        return leftTs - rightTs;
      }

      return left.index - right.index;
    });
  const interactions = [];
  const openPairs = new Map();

  for (const { event } of orderedEvents) {
    const descriptor = getInteractionDescriptor(event);
    const pairKey = createInteractionPairKey(event, descriptor);

    if (descriptor.phase === 'start') {
      if (!pairKey) {
        interactions.push(createInteractionRecord({ startEvent: event, endEvent: null }));
        continue;
      }

      if (!openPairs.has(pairKey)) {
        openPairs.set(pairKey, []);
      }

      openPairs.get(pairKey).push(event);
      continue;
    }

    const openStarts = pairKey ? openPairs.get(pairKey) : null;
    if (openStarts && openStarts.length > 0) {
      const startEvent = openStarts.shift();
      if (openStarts.length === 0) {
        openPairs.delete(pairKey);
      }

      interactions.push(createInteractionRecord({ startEvent, endEvent: event }));
      continue;
    }

    interactions.push(createInteractionRecord({ startEvent: null, endEvent: event }));
  }

  for (const openStarts of openPairs.values()) {
    for (const startEvent of openStarts) {
      interactions.push(createInteractionRecord({ startEvent, endEvent: null }));
    }
  }

  return interactions;
}

function deriveOpenPeerWatchAlerts(events) {
  const openAlertsByEventId = new Map();
  const openKeysByEventId = new Map();

  const orderedEvents = events
    .filter((event) => event.event_type.startsWith('peer_watch_alert_'))
    .slice()
    .sort((left, right) => Date.parse(left.ts) - Date.parse(right.ts));

  for (const event of orderedEvents) {
    if (event.event_type === 'peer_watch_alert_raised') {
      const alert = createPeerWatchAlertRecord(event);
      const key = createPeerWatchAlertKey(event);
      openAlertsByEventId.set(event.event_id, alert);
      openKeysByEventId.set(event.event_id, key);
      continue;
    }

    const resolvedAlertEventId =
      event.metadata && typeof event.metadata.resolved_alert_event_id === 'string'
        ? event.metadata.resolved_alert_event_id
        : null;

    if (resolvedAlertEventId && openAlertsByEventId.has(resolvedAlertEventId)) {
      openAlertsByEventId.delete(resolvedAlertEventId);
      openKeysByEventId.delete(resolvedAlertEventId);
      continue;
    }

    const resolvedKey = createPeerWatchAlertKey(event);
    for (const [eventId, key] of openKeysByEventId.entries()) {
      if (key === resolvedKey) {
        openKeysByEventId.delete(eventId);
        openAlertsByEventId.delete(eventId);
      }
    }
  }

  return Array.from(openAlertsByEventId.values());
}

function getInteractionDescriptor(event) {
  return INTERACTION_EVENT_DESCRIPTORS[event.event_type] || null;
}

function createInteractionPairKey(event, descriptor) {
  if (
    !descriptor ||
    typeof event.correlation_id !== 'string' ||
    event.correlation_id.trim().length === 0
  ) {
    return null;
  }

  const participants = getInteractionParticipantAgentIds(event);
  if (participants.length === 0) {
    return null;
  }

  return [
    descriptor.interaction_type,
    event.correlation_id,
    participants.join('|')
  ].join('::');
}

function getInteractionParticipantAgentIds(event) {
  return Array.from(
    new Set(
      [event.agent_id, event.actor_id, ...(event.counterparty_agent_ids || [])]
        .filter((agentId) => typeof agentId === 'string' && agentId.length > 0)
        .sort()
    )
  );
}

function createInteractionRecord({ startEvent, endEvent }) {
  const sourceEvent = startEvent || endEvent;
  const sourceDescriptor = getInteractionDescriptor(sourceEvent);
  const relatedEvents = [startEvent, endEvent].filter(Boolean);
  const summarySourceEvent =
    (endEvent && endEvent.summary ? endEvent : null) ||
    (startEvent && startEvent.summary ? startEvent : null) ||
    sourceEvent;
  const severity = relatedEvents.reduce(
    (currentSeverity, event) => mergeSeverity(currentSeverity, event.severity),
    'normal'
  );
  const participants = Array.from(
    new Set(
      relatedEvents
        .flatMap((event) => getInteractionParticipantAgentIds(event))
        .sort()
    )
  );

  return {
    interaction_id: `interaction:${sourceEvent.event_id}`,
    interaction_type: sourceDescriptor.interaction_type,
    correlation_id: sourceEvent.correlation_id,
    started_at: startEvent ? startEvent.ts : endEvent.ts,
    ended_at: endEvent ? endEvent.ts : null,
    participant_agent_ids: participants,
    trigger_event_id: sourceEvent.event_id,
    before_state: startEvent ? startEvent.current_state : null,
    after_state: endEvent ? endEvent.current_state : null,
    severity,
    evidence_refs: normalizeEvidenceRefs(relatedEvents.flatMap((event) => event.evidence_refs)),
    source_kind: summarySourceEvent.source_kind,
    summary: summarySourceEvent.summary,
    related_event_ids: relatedEvents.map((event) => event.event_id)
  };
}

function getInteractionSortMs(interaction) {
  return Date.parse(interaction.ended_at || interaction.started_at);
}

function getHeartbeatSortMs(heartbeat) {
  return Date.parse(heartbeat.received_at || 0);
}

function mergeSeverity(currentSeverity, nextSeverity) {
  const currentRank = SEVERITY_RANK[currentSeverity] || 0;
  const nextRank = SEVERITY_RANK[nextSeverity] || 0;
  return nextRank >= currentRank ? nextSeverity : currentSeverity;
}

function getEventCurrentBlocker(event) {
  if (!event.metadata || typeof event.metadata.current_blocker !== 'string') {
    return '';
  }

  return event.metadata.current_blocker;
}

function createPeerWatchAlertRecord(event) {
  const evidenceRefs = normalizeEvidenceRefs(event.evidence_refs);
  const watcherAgentIds = Array.from(
    new Set(
      (event.counterparty_agent_ids || []).filter(
        (agentId) => typeof agentId === 'string' && agentId.length > 0
      )
    )
  );

  return {
    alert_id: event.event_id,
    ts: event.ts,
    agent_id: event.agent_id,
    target_agent_id: event.agent_id,
    actor_id: event.actor_id,
    observer_agent_id: event.actor_id,
    watcher_agent_ids: watcherAgentIds,
    severity: event.severity,
    status: event.event_type.endsWith('_resolved') ? 'resolved' : 'open',
    current_state: event.current_state,
    active_task: event.active_task,
    summary: event.summary,
    evidence_refs: evidenceRefs,
    evidence_count: evidenceRefs.length,
    correlation_id: event.correlation_id,
    source_kind: event.source_kind,
    metadata: event.metadata || {}
  };
}

function createIncidentFromPeerWatchAlert(alert) {
  return {
    incident_id: alert.alert_id,
    kind: 'peer_watch_alert',
    ts: alert.ts,
    agent_id: alert.target_agent_id,
    actor_id: alert.observer_agent_id,
    status: alert.status,
    severity: alert.severity,
    summary: alert.summary,
    correlation_id: alert.correlation_id,
    evidence_refs: normalizeEvidenceRefs(alert.evidence_refs),
    counterparty_agent_ids: Array.isArray(alert.watcher_agent_ids)
      ? alert.watcher_agent_ids.slice()
      : [],
    source_kind: alert.source_kind
  };
}

function createIncidentFromHandoff(handoff) {
  return {
    incident_id: handoff.handoff_id,
    kind: 'handoff',
    ts: handoff.ts,
    agent_id: handoff.agent_id,
    actor_id: handoff.actor_id,
    status: handoff.status || handoff.phase,
    severity: handoff.severity,
    summary: handoff.summary,
    correlation_id: handoff.correlation_id,
    evidence_refs: normalizeEvidenceRefs(handoff.evidence_refs),
    counterparty_agent_ids: Array.isArray(handoff.counterparty_agent_ids)
      ? handoff.counterparty_agent_ids.slice()
      : [],
    source_kind: handoff.source_kind
  };
}

function createIncidentFromReboot(reboot) {
  return {
    incident_id: reboot.reboot_id,
    kind: 'reboot',
    ts: reboot.ts,
    agent_id: reboot.agent_id,
    actor_id: reboot.actor_id,
    status: reboot.status || reboot.phase,
    severity: reboot.severity,
    summary: reboot.summary,
    correlation_id: reboot.correlation_id,
    evidence_refs: normalizeEvidenceRefs(reboot.evidence_refs),
    counterparty_agent_ids: Array.isArray(reboot.counterparty_agent_ids)
      ? reboot.counterparty_agent_ids.slice()
      : [],
    source_kind: reboot.source_kind
  };
}

function matchesPeerWatchAlertFilters(alert, filters = {}) {
  const targetAgentId = filters.target_agent_id || filters.agent_id;

  if (filters.severity && alert.severity !== filters.severity) {
    return false;
  }

  if (filters.status && alert.status !== filters.status) {
    return false;
  }

  if (targetAgentId && alert.target_agent_id !== targetAgentId) {
    return false;
  }

  if (
    filters.watcher_agent_id &&
    !alert.watcher_agent_ids.includes(filters.watcher_agent_id)
  ) {
    return false;
  }

  if (
    filters.observer_agent_id &&
    alert.observer_agent_id !== filters.observer_agent_id
  ) {
    return false;
  }

  if (
    filters.correlation_id &&
    alert.correlation_id !== filters.correlation_id
  ) {
    return false;
  }

  return true;
}

function matchesIncidentFilters(incident, filters = {}, { durationMs = null, nowMs = null } = {}) {
  if (filters.kind && incident.kind !== filters.kind) {
    return false;
  }

  if (filters.agent_id && incident.agent_id !== filters.agent_id) {
    return false;
  }

  if (filters.severity && incident.severity !== filters.severity) {
    return false;
  }

  if (
    filters.status &&
    !matchesIncidentStatusFilter(incident, filters.status)
  ) {
    return false;
  }

  if (filters.correlation_id && incident.correlation_id !== filters.correlation_id) {
    return false;
  }

  if (
    durationMs !== null &&
    nowMs !== null &&
    getIncidentSortMs(incident) < nowMs - durationMs
  ) {
    return false;
  }

  return true;
}

function matchesIncidentStatusFilter(incident, status) {
  if (status !== 'open') {
    return incident.status === status;
  }

  const activeStatuses = ACTIVE_INCIDENT_STATUSES_BY_KIND[incident.kind];
  if (!activeStatuses) {
    return incident.status === status;
  }

  return activeStatuses.includes(incident.status);
}

function getOpenLifecycleIncidentTieRank(incident) {
  return matchesIncidentStatusFilter(incident, 'open') ? 0 : 1;
}

function matchesIncidentOpenLifecycleWindow(incident, { durationMs = null, nowMs = null } = {}) {
  if (nowMs === null) {
    return true;
  }

  const incidentMs = getIncidentSortMs(incident);
  if (!Number.isFinite(incidentMs) || incidentMs > nowMs) {
    return false;
  }

  return durationMs === null || nowMs - incidentMs <= durationMs;
}

function selectOpenIncidentLifecycleItems(incidents) {
  const openLifecycleIncidents = [];
  const passthroughIncidents = [];
  const orderedIncidents = incidents
    .map((incident, index) => ({ incident, index }))
    .sort((left, right) => {
      const leftMs = getIncidentSortMs(left.incident);
      const rightMs = getIncidentSortMs(right.incident);
      if (leftMs !== rightMs) {
        return leftMs - rightMs;
      }

      const leftRank = getOpenLifecycleIncidentTieRank(left.incident);
      const rightRank = getOpenLifecycleIncidentTieRank(right.incident);
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return left.index - right.index;
    });

  for (const { incident } of orderedIncidents) {
    if (!LIFECYCLE_INCIDENT_KINDS.has(incident.kind)) {
      passthroughIncidents.push(incident);
      continue;
    }

    if (matchesIncidentStatusFilter(incident, 'open')) {
      const duplicateOpenIndex = findOpenLifecycleDuplicateIndex(openLifecycleIncidents, incident);
      if (duplicateOpenIndex !== -1) {
        openLifecycleIncidents.splice(duplicateOpenIndex, 1, incident);
      } else {
        openLifecycleIncidents.push(incident);
      }
      continue;
    }

    const openIndex = findLifecycleOpenIncidentIndex(openLifecycleIncidents, incident);
    if (openIndex !== -1) {
      openLifecycleIncidents.splice(openIndex, 1);
    }
  }

  return [...passthroughIncidents, ...openLifecycleIncidents];
}

function findOpenLifecycleDuplicateIndex(openIncidents, nextIncident) {
  const correlationKey = getIncidentCorrelationKey(nextIncident);
  if (correlationKey.length === 0) {
    return -1;
  }

  const counterpartyIds = getIncidentCounterpartyIds(nextIncident);
  return openIncidents.findIndex((incident) => (
    incident.kind === nextIncident.kind &&
    incident.agent_id === nextIncident.agent_id &&
    getIncidentCorrelationKey(incident) === correlationKey &&
    areDuplicateOpenLifecycleCounterpartyIds(getIncidentCounterpartyIds(incident), counterpartyIds)
  ));
}

function areDuplicateOpenLifecycleCounterpartyIds(left, right) {
  return agentIdListsEqual(left, right) || left.length === 0 || right.length === 0;
}

function findLifecycleOpenIncidentIndex(openIncidents, closingIncident) {
  const sameAgentKindCandidates = openIncidents
    .map((incident, index) => ({ incident, index }))
    .filter(({ incident }) => (
      incident.kind === closingIncident.kind &&
      incident.agent_id === closingIncident.agent_id
    ));

  if (sameAgentKindCandidates.length === 0) {
    return -1;
  }

  const closingCorrelationKey = getIncidentCorrelationKey(closingIncident);
  const matchingCorrelationCandidates = sameAgentKindCandidates.filter(
    ({ incident }) => getIncidentCorrelationKey(incident) === closingCorrelationKey
  );
  if (matchingCorrelationCandidates.length > 0) {
    return selectLifecycleCandidateIndex(matchingCorrelationCandidates, closingIncident);
  }

  const driftCorrelationCandidates = sameAgentKindCandidates.filter(({ incident }) => {
    const candidateCorrelationKey = getIncidentCorrelationKey(incident);
    return candidateCorrelationKey.length === 0 || closingCorrelationKey.length === 0;
  });

  return selectLifecycleCandidateIndex(driftCorrelationCandidates, closingIncident);
}

function selectLifecycleCandidateIndex(candidates, closingIncident) {
  const closingCounterpartyIds = getIncidentCounterpartyIds(closingIncident);
  if (closingCounterpartyIds.length > 0) {
    const exactCounterpartyCandidates = candidates.filter(
      ({ incident }) => agentIdListsEqual(getIncidentCounterpartyIds(incident), closingCounterpartyIds)
    );
    if (exactCounterpartyCandidates.length === 1) {
      return exactCounterpartyCandidates[0].index;
    }
    if (exactCounterpartyCandidates.length > 1) {
      return -1;
    }

    const compatibleCounterpartyCandidates = candidates.filter(({ incident }) => {
      const candidateCounterpartyIds = getIncidentCounterpartyIds(incident);
      return areLifecycleCounterpartyIdsCompatible(candidateCounterpartyIds, closingCounterpartyIds);
    });
    if (compatibleCounterpartyCandidates.length === 1) {
      return compatibleCounterpartyCandidates[0].index;
    }

    return -1;
  }

  if (candidates.length !== 1) {
    return -1;
  }

  return candidates[0].index;
}

function getIncidentCorrelationKey(incident) {
  return typeof incident.correlation_id === 'string' && incident.correlation_id.length > 0
    ? incident.correlation_id
    : '';
}

function getIncidentCounterpartyKey(incident) {
  return getIncidentCounterpartyIds(incident).join('|');
}

function getIncidentCounterpartyIds(incident) {
  return normalizeAgentIds(incident.counterparty_agent_ids || []);
}

function agentIdListsEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((agentId, index) => agentId === right[index]);
}

function areLifecycleCounterpartyIdsCompatible(left, right) {
  return (
    left.length === 0 ||
    right.length === 0 ||
    isAgentIdSubset(left, right) ||
    isAgentIdSubset(right, left)
  );
}

function isAgentIdSubset(left, right) {
  const rightIds = new Set(right);
  return left.every((agentId) => rightIds.has(agentId));
}

function createPeerWatchAlertKey(event) {
  return [
    event.agent_id,
    event.actor_id,
    event.correlation_id,
    normalizeEvidenceRefs(event.counterparty_agent_ids).sort().join('|')
  ].join('::');
}

function matchesEventFilters(event, filters = {}) {
  if (filters.event_id && event.event_id !== filters.event_id) {
    return false;
  }

  if (filters.agent_id && event.agent_id !== filters.agent_id) {
    return false;
  }

  if (filters.event_type && event.event_type !== filters.event_type) {
    return false;
  }

  if (filters.severity && event.severity !== filters.severity) {
    return false;
  }

  if (filters.source_kind && event.source_kind !== filters.source_kind) {
    return false;
  }

  if (filters.evidence_ref && !normalizeEvidenceRefs(event.evidence_refs).includes(filters.evidence_ref)) {
    return false;
  }

  if (filters.correlation_id && event.correlation_id !== filters.correlation_id) {
    return false;
  }

  return true;
}

function getIncidentSortMs(incident) {
  return Date.parse(incident.ts || 0);
}

function listInteractionItems(events, filters = {}, limit = parseLimit(filters.limit)) {
  const durationMs = filters.window ? parseWindow(filters.window) : null;
  const nowMs = durationMs === null ? null : parseNowMs(filters.now);

  const items = deriveInteractions(events)
    .filter((interaction) => {
      if (
        filters.agent_id &&
        !interaction.participant_agent_ids.includes(filters.agent_id)
      ) {
        return false;
      }

      if (
        filters.counterparty_agent_id &&
        !interaction.participant_agent_ids.includes(filters.counterparty_agent_id)
      ) {
        return false;
      }

      if (
        filters.interaction_type &&
        interaction.interaction_type !== filters.interaction_type
      ) {
        return false;
      }

      if (filters.severity && interaction.severity !== filters.severity) {
        return false;
      }

      if (
        filters.correlation_id &&
        interaction.correlation_id !== filters.correlation_id
      ) {
        return false;
      }

      if (
        filters.event_id &&
        interaction.trigger_event_id !== filters.event_id &&
        !(interaction.related_event_ids || []).includes(filters.event_id)
      ) {
        return false;
      }

      if (
        filters.evidence_ref &&
        !normalizeEvidenceRefs(interaction.evidence_refs).includes(filters.evidence_ref)
      ) {
        return false;
      }

      if (
        durationMs !== null &&
        nowMs !== null &&
        getInteractionSortMs(interaction) < nowMs - durationMs
      ) {
        return false;
      }

      return true;
    })
    .sort((left, right) => {
      const rightTs = getInteractionSortMs(right);
      const leftTs = getInteractionSortMs(left);

      if (rightTs !== leftTs) {
        return rightTs - leftTs;
      }

      return right.interaction_id.localeCompare(left.interaction_id);
    });

  return limit === null ? items : items.slice(0, limit);
}

function listTimelineItems(events, filters = {}) {
  const durationMs = filters.window ? parseWindow(filters.window) : null;
  const nowMs = durationMs === null ? null : parseNowMs(filters.now);
  const limit =
    filters.limit === null || filters.limit === undefined || filters.limit === ''
      ? null
      : parseLimit(filters.limit);

  return events
    .filter((event) => {
      if (!matchesEventFilters(event, filters)) {
        return false;
      }

      if (durationMs !== null && nowMs !== null && Date.parse(event.ts) < nowMs - durationMs) {
        return false;
      }

      return true;
    })
    .slice()
    .sort((left, right) => Date.parse(left.ts) - Date.parse(right.ts))
    .slice(limit === null ? 0 : -limit)
    .map(createTimelineItem);
}

function createTimelineItem(event) {
  return {
    event_id: event.event_id,
    ts: event.ts,
    agent_id: event.agent_id,
    actor_id: event.actor_id,
    event_type: event.event_type,
    severity: event.severity,
    current_state: event.current_state,
    location: event.location,
    summary: event.summary,
    correlation_id: event.correlation_id,
    counterparty_agent_ids: event.counterparty_agent_ids,
    evidence_refs: event.evidence_refs,
    source_kind: event.source_kind
  };
}

function getIncidentParticipantAgentIds(incident) {
  return normalizeAgentIds([
    incident.agent_id,
    incident.actor_id,
    ...((incident && incident.counterparty_agent_ids) || [])
  ]);
}

function getTimelineParticipantAgentIds(event) {
  return normalizeAgentIds([
    event.agent_id,
    event.actor_id,
    ...((event && event.counterparty_agent_ids) || [])
  ]);
}

function getWorkflowCounterpartyAgentIds({
  agentId,
  incidents = [],
  interactions = [],
  timeline = []
}) {
  return normalizeAgentIds([
    ...incidents.flatMap((incident) => incident.counterparty_agent_ids || []),
    ...interactions.flatMap((interaction) => interaction.participant_agent_ids || []),
    ...timeline.flatMap((event) => event.counterparty_agent_ids || [])
  ]).filter(
    (counterpartyAgentId) =>
      counterpartyAgentId !== agentId && counterpartyAgentId !== 'team-lead'
  );
}

function listMemoryArtifactItems({ events = [], latestCollectorReport = null, filters = {} }) {
  const durationMs = filters.window ? parseWindow(filters.window) : null;
  const nowMs = durationMs === null ? null : parseNowMs(filters.now);
  const limit =
    filters.limit === null || filters.limit === undefined || filters.limit === ''
      ? null
      : parseLimit(filters.limit);
  const collectorObservations = buildCollectorObservationMap(latestCollectorReport);
  const artifactMap = new Map();

  for (const event of events) {
    if (!matchesMemoryArtifactEventFilters(event, filters)) {
      continue;
    }

    const eventTs = Date.parse(event.ts || 0);
    if (durationMs !== null && nowMs !== null && eventTs < nowMs - durationMs) {
      continue;
    }

    for (const artifactRef of normalizeEvidenceRefs(event.evidence_refs)) {
      const collectorObservation = collectorObservations.get(artifactRef) || null;
      const matchingCollectorObservationEntries = collectorObservation
        ? listMatchingCollectorObservationEntries({
            artifactRef,
            collectorObservation,
            filters,
            durationMs,
            nowMs
          })
        : [];
      const collectorArtifactKind =
        matchingCollectorObservationEntries.length > 0 ? collectorObservation.artifact_kind : null;
      const artifactKind = deriveArtifactKind(artifactRef, collectorArtifactKind);
      if (!matchesMemoryArtifactFilters({ artifactRef, event, artifactKind, filters })) {
        continue;
      }

      const collectorLastModifiedAt = getCollectorObservationLastSeenAt(matchingCollectorObservationEntries);
      const fileName = deriveArtifactFileName(
        artifactRef,
        matchingCollectorObservationEntries.length > 0 ? collectorObservation : null
      );
      const key = artifactRef;
      const existing = artifactMap.get(key) || {
        artifact_ref: artifactRef,
        artifact_kind: artifactKind,
        file_name: fileName,
        first_seen_at: event.ts,
        last_seen_at: event.ts,
        mention_count: 0,
        agent_ids: new Set(),
        correlation_ids: new Set(),
        source_kinds: new Set(),
        latest_summary: event.summary,
        latest_event_type: event.event_type,
        latest_event_id: event.event_id,
        latest_event_ts: event.ts,
        collector_last_modified_at: collectorLastModifiedAt
      };

      if (
        collectorLastModifiedAt &&
        (!existing.collector_last_modified_at ||
          Date.parse(collectorLastModifiedAt) > Date.parse(existing.collector_last_modified_at))
      ) {
        existing.collector_last_modified_at = collectorLastModifiedAt;
      }

      existing.artifact_kind = rankArtifactKind(existing.artifact_kind, artifactKind);
      if (!existing.file_name || existing.file_name === existing.artifact_ref) {
        existing.file_name = fileName;
      }
      existing.first_seen_at = compareIsoAsc(existing.first_seen_at, event.ts) <= 0 ? existing.first_seen_at : event.ts;
      existing.last_seen_at = compareIsoAsc(existing.last_seen_at, event.ts) >= 0 ? existing.last_seen_at : event.ts;
      existing.mention_count += 1;
      existing.agent_ids.add(event.agent_id);
      if (event.actor_id) {
        existing.agent_ids.add(event.actor_id);
      }
      for (const counterpartyAgentId of event.counterparty_agent_ids || []) {
        existing.agent_ids.add(counterpartyAgentId);
      }
      if (event.correlation_id) {
        existing.correlation_ids.add(event.correlation_id);
      }
      existing.source_kinds.add(event.source_kind);
      if (Date.parse(event.ts || 0) >= Date.parse(existing.latest_event_ts || 0)) {
        existing.latest_event_ts = event.ts;
        existing.latest_summary = event.summary;
        existing.latest_event_type = event.event_type;
        existing.latest_event_id = event.event_id;
      }
      if (!existing.collector_last_modified_at && collectorLastModifiedAt) {
        existing.collector_last_modified_at = collectorLastModifiedAt;
      }

      artifactMap.set(key, existing);
    }
  }

  for (const [artifactRef, collectorObservation] of collectorObservations.entries()) {
    const matchingObservationEntries = listMatchingCollectorObservationEntries({
      artifactRef,
      collectorObservation,
      filters,
      durationMs,
      nowMs
    });
    if (matchingObservationEntries.length === 0) {
      continue;
    }

    const firstSeenAt = matchingObservationEntries.reduce(
      (earliest, entry) => (compareIsoAsc(earliest, entry.observed_at) <= 0 ? earliest : entry.observed_at),
      matchingObservationEntries[0].observed_at
    );
    const lastSeenAt = matchingObservationEntries.reduce(
      (latest, entry) => (compareIsoAsc(latest, entry.observed_at) >= 0 ? latest : entry.observed_at),
      matchingObservationEntries[0].observed_at
    );

    const existing = artifactMap.get(artifactRef);
    if (!existing && hasMemoryArtifactEventFacetFilters(filters)) {
      continue;
    }

    if (existing) {
      existing.artifact_kind = rankArtifactKind(existing.artifact_kind, collectorObservation.artifact_kind);
      existing.first_seen_at = compareIsoAsc(existing.first_seen_at, firstSeenAt) <= 0 ? existing.first_seen_at : firstSeenAt;
      existing.last_seen_at = compareIsoAsc(existing.last_seen_at, lastSeenAt) >= 0 ? existing.last_seen_at : lastSeenAt;
      existing.mention_count += matchingObservationEntries.length;
      for (const participantAgentId of matchingObservationEntries.flatMap((entry) => entry.participant_agent_ids || [])) {
        existing.agent_ids.add(participantAgentId);
      }
      for (const correlationId of matchingObservationEntries.flatMap((entry) => (entry.correlation_id ? [entry.correlation_id] : []))) {
        existing.correlation_ids.add(correlationId);
      }
      for (const sourceKind of matchingObservationEntries.flatMap((entry) => (entry.source_kind ? [entry.source_kind] : []))) {
        existing.source_kinds.add(sourceKind);
      }
      if (
        !existing.collector_last_modified_at ||
        Date.parse(lastSeenAt) > Date.parse(existing.collector_last_modified_at)
      ) {
        existing.collector_last_modified_at = lastSeenAt;
      }
      if (!existing.file_name || existing.file_name === existing.artifact_ref) {
        existing.file_name = collectorObservation.file_name || deriveFileNameFromRef(artifactRef);
      }
      artifactMap.set(artifactRef, existing);
      continue;
    }

    artifactMap.set(artifactRef, {
      artifact_ref: artifactRef,
      artifact_kind: collectorObservation.artifact_kind,
      file_name: collectorObservation.file_name || deriveFileNameFromRef(artifactRef),
      first_seen_at: firstSeenAt,
      last_seen_at: lastSeenAt,
      mention_count: matchingObservationEntries.length,
      agent_ids: new Set(matchingObservationEntries.flatMap((entry) => entry.participant_agent_ids || [])),
      correlation_ids: new Set(
        matchingObservationEntries.flatMap((entry) => (entry.correlation_id ? [entry.correlation_id] : []))
      ),
      source_kinds: new Set(
        matchingObservationEntries.flatMap((entry) => (entry.source_kind ? [entry.source_kind] : []))
      ),
      latest_summary: null,
      latest_event_type: null,
      latest_event_ts: lastSeenAt,
      collector_last_modified_at: lastSeenAt
    });
  }

  const items = Array.from(artifactMap.values())
    .filter((artifact) => !filters.source_kind || artifact.source_kinds.has(filters.source_kind))
    .map((artifact) => ({
      artifact_ref: artifact.artifact_ref,
      artifact_kind: artifact.artifact_kind,
      file_name: artifact.file_name,
      first_seen_at: artifact.first_seen_at,
      last_seen_at: artifact.last_seen_at,
      mention_count: artifact.mention_count,
      agent_ids: Array.from(artifact.agent_ids).sort(),
      correlation_ids: Array.from(artifact.correlation_ids).sort(),
      source_kinds: Array.from(artifact.source_kinds).sort(),
      latest_summary: artifact.latest_summary,
      latest_event_type: artifact.latest_event_type,
      ...(artifact.latest_event_id
        ? {
            latest_event_id: artifact.latest_event_id,
            replay_checkpoint: {
              event_id: artifact.latest_event_id,
              event_type: artifact.latest_event_type,
              summary: artifact.latest_summary,
              last_seen_at: artifact.latest_event_ts
            }
          }
        : {}),
      collector_last_modified_at: artifact.collector_last_modified_at
    }))
    .sort((left, right) => {
      const lastSeenDelta = Date.parse(right.last_seen_at || 0) - Date.parse(left.last_seen_at || 0);
      if (lastSeenDelta !== 0) {
        return lastSeenDelta;
      }

      if (right.mention_count !== left.mention_count) {
        return right.mention_count - left.mention_count;
      }

      return left.artifact_ref.localeCompare(right.artifact_ref);
    });

  return applyOptionalLimit(items, limit);
}

function buildCollectorObservationMap(report) {
  const observations = new Map();
  const correlationId = createCollectorCorrelationId(report?.collected_at);

  for (const item of report?.items || []) {
    for (const workspaceObservation of item.workspace_observations || []) {
      if (!workspaceObservation?.path || workspaceObservation.kind !== 'workspace_file') {
        continue;
      }

      mergeCollectorObservation(observations, workspaceObservation.path, {
        artifact_kind: 'workspace_file',
        file_name: workspaceObservation.file_name || deriveFileNameFromRef(workspaceObservation.path),
        last_modified_at: workspaceObservation.last_modified_at || null,
        observed_agent_id: item.agent_id,
        participant_agent_ids: normalizeAgentIds([item.agent_id, report?.actor_id]),
        correlation_id: correlationId,
        source_kind: 'workspace_file'
      });
    }

    const itemTmuxObservations = item.tmux_observations || [];

    for (const tmuxObservation of itemTmuxObservations) {
      const tmuxRef = getCollectorTmuxArtifactRef(item, tmuxObservation, tmuxObservation?.artifact_ref || null);
      if (!tmuxRef) {
        continue;
      }

      mergeCollectorObservation(observations, tmuxRef, {
        artifact_kind: 'tmux_observation',
        file_name: tmuxObservation.pane_title || tmuxObservation.pane_current_command || tmuxRef,
        last_modified_at: tmuxObservation.pane_activity_at || null,
        observed_agent_id: item.agent_id,
        participant_agent_ids: normalizeAgentIds([item.agent_id, report?.actor_id]),
        correlation_id: correlationId,
        source_kind: 'tmux_observation'
      });
    }
  }

  return observations;
}

function mergeCollectorObservation(observations, artifactRef, nextObservation) {
  const existing = observations.get(artifactRef);
  const entry = {
    observed_agent_id: nextObservation.observed_agent_id || null,
    participant_agent_ids: normalizeAgentIds(nextObservation.participant_agent_ids || []),
    correlation_id: nextObservation.correlation_id || null,
    source_kind: nextObservation.source_kind || null,
    observed_at: nextObservation.last_modified_at || null
  };

  if (!existing) {
    observations.set(artifactRef, {
      artifact_kind: nextObservation.artifact_kind,
      file_name: nextObservation.file_name,
      last_modified_at: nextObservation.last_modified_at,
      entries: [entry]
    });
    return;
  }

  existing.artifact_kind = rankArtifactKind(existing.artifact_kind, nextObservation.artifact_kind);
  if (!existing.file_name || existing.file_name === artifactRef) {
    existing.file_name = nextObservation.file_name;
  }
  if (
    nextObservation.last_modified_at &&
    (!existing.last_modified_at || Date.parse(nextObservation.last_modified_at) > Date.parse(existing.last_modified_at))
  ) {
    existing.last_modified_at = nextObservation.last_modified_at;
  }
  existing.entries = [...(existing.entries || []), entry];
  observations.set(artifactRef, existing);
}

function matchesMemoryArtifactEventFilters(event, filters = {}) {
  if (filters.event_type && event.event_type !== filters.event_type) {
    return false;
  }

  if (filters.severity && event.severity !== filters.severity) {
    return false;
  }

  if (filters.correlation_id && event.correlation_id !== filters.correlation_id) {
    return false;
  }

  return true;
}

function matchesMemoryArtifactFilters({ artifactRef, event, artifactKind, filters }) {
  if (filters.agent_id) {
    const participantAgentIds = normalizeAgentIds([
      event.agent_id,
      event.actor_id,
      ...(event.counterparty_agent_ids || [])
    ]);

    if (!participantAgentIds.includes(filters.agent_id)) {
      return false;
    }
  }

  if (filters.correlation_id && event.correlation_id !== filters.correlation_id) {
    return false;
  }

  if (filters.artifact_kind && artifactKind !== filters.artifact_kind) {
    return false;
  }

  if (filters.artifact_ref && artifactRef !== filters.artifact_ref) {
    return false;
  }

  return true;
}

function hasMemoryArtifactEventFacetFilters(filters = {}) {
  return Boolean(filters.event_type || filters.severity);
}

function listMatchingCollectorObservationEntries({
  artifactRef,
  collectorObservation,
  filters,
  durationMs = null,
  nowMs = null
}) {
  if (filters.artifact_ref && artifactRef !== filters.artifact_ref) {
    return [];
  }

  if (filters.artifact_kind && collectorObservation.artifact_kind !== filters.artifact_kind) {
    return [];
  }

  return (collectorObservation.entries || [])
    .map((entry) => ({
      ...entry,
      observed_at: entry.observed_at || collectorObservation.last_modified_at || null
    }))
    .filter((entry) => {
      if (filters.agent_id) {
        const participantAgentIds = normalizeAgentIds(entry.participant_agent_ids || []);
        if (!participantAgentIds.includes(filters.agent_id)) {
          return false;
        }
      }

      if (filters.correlation_id && entry.correlation_id !== filters.correlation_id) {
        return false;
      }

      if (durationMs !== null && nowMs !== null && Date.parse(entry.observed_at || 0) < nowMs - durationMs) {
        return false;
      }

      return true;
    });
}

function deriveArtifactKind(artifactRef, collectorArtifactKind = null) {
  if (collectorArtifactKind) {
    return collectorArtifactKind;
  }

  if (artifactRef.startsWith('tmux://')) {
    return 'tmux_observation';
  }

  if (/\/(inbox|outbox|todo)\.md$/i.test(artifactRef)) {
    return 'workspace_file';
  }

  return 'evidence_ref';
}

function getCollectorObservationLastSeenAt(entries = []) {
  if (entries.length === 0) {
    return null;
  }

  return entries.reduce(
    (latest, entry) => (compareIsoAsc(latest, entry.observed_at) >= 0 ? latest : entry.observed_at),
    entries[0].observed_at
  );
}

function rankArtifactKind(left, right) {
  const rank = {
    evidence_ref: 0,
    workspace_file: 1,
    tmux_observation: 2
  };

  return rank[right] > rank[left] ? right : left;
}

function deriveArtifactFileName(artifactRef, collectorObservation) {
  return collectorObservation?.file_name || deriveFileNameFromRef(artifactRef);
}

function deriveFileNameFromRef(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return 'unknown';
  }

  if (value.startsWith('tmux://')) {
    const segments = value.replace(/^tmux:\/\//, '').split('/');
    return segments[segments.length - 1] || value;
  }

  const parts = value.split('/').filter(Boolean);
  return parts[parts.length - 1] || value;
}

function deriveTmuxArtifactRef(tmuxObservation) {
  if (
    tmuxObservation?.session_name &&
    tmuxObservation.window_index !== undefined &&
    tmuxObservation.window_index !== null &&
    tmuxObservation.window_index !== 'null' &&
    tmuxObservation.window_index !== 'undefined' &&
    tmuxObservation.pane_index !== undefined &&
    tmuxObservation.pane_index !== null &&
    tmuxObservation.pane_index !== 'null' &&
    tmuxObservation.pane_index !== 'undefined'
  ) {
    return `tmux://${tmuxObservation.session_name}/${tmuxObservation.window_index}.${tmuxObservation.pane_index}`;
  }

  if (tmuxObservation?.pane_id) {
    return `tmux://${tmuxObservation.pane_id}`;
  }

  return null;
}

function getCollectorTmuxArtifactRef(item, tmuxObservation, fallbackTmuxRef = null) {
  if (fallbackTmuxRef) {
    return fallbackTmuxRef;
  }

  const observationRef = deriveTmuxArtifactRef(tmuxObservation);
  if (observationRef) {
    return observationRef;
  }

  return normalizeEvidenceRefs(item?.evidence_refs).find(isValidTmuxRef) || null;
}

function compareIsoAsc(left, right) {
  return Date.parse(left || 0) - Date.parse(right || 0);
}

function createCorrelationClosureLedger({ incidents = [], openIncidents = [], interactions = [], limit = null }) {
  const openIncidentIds = new Set(openIncidents.map((incident) => incident.incident_id));
  const openEntries = openIncidents.map((incident) => createIncidentClosureEntry(incident, 'open'));
  const closedEntries = incidents
    .filter((incident) => !openIncidentIds.has(incident.incident_id))
    .filter((incident) => incident.status === 'resolved' || incident.status === 'completed')
    .map((incident) => createIncidentClosureEntry(incident, 'closed'));
  const activeEntries = interactions
    .filter((interaction) => !interaction.ended_at)
    .map(createActiveInteractionClosureEntry);
  const entries = [...openEntries, ...activeEntries, ...closedEntries].sort((left, right) => {
    const rightTs = Date.parse(right.ts || 0);
    const leftTs = Date.parse(left.ts || 0);

    if (rightTs !== leftTs) {
      return rightTs - leftTs;
    }

    return right.entry_id.localeCompare(left.entry_id);
  });
  const visibleEntries = limit === null ? entries : entries.slice(0, limit);

  return {
    state: openEntries.length > 0
      ? 'open'
      : activeEntries.length > 0
        ? 'active'
        : closedEntries.length > 0
          ? 'closed'
          : 'unknown',
    basis: 'filtered_correlation_slice',
    open_count: openEntries.length,
    active_count: activeEntries.length,
    closed_count: closedEntries.length,
    entry_count: entries.length,
    last_transition_ts: entries[0]?.ts || null,
    entries: visibleEntries
  };
}

function createIncidentClosureEntry(incident, state) {
  return {
    entry_id: `incident:${incident.incident_id}`,
    state,
    kind: incident.kind,
    status: incident.status,
    ts: incident.ts,
    agent_id: incident.agent_id,
    actor_id: incident.actor_id || null,
    summary: incident.summary,
    correlation_id: incident.correlation_id,
    evidence_refs: normalizeEvidenceRefs(incident.evidence_refs),
    source_kind: incident.source_kind,
    incident_id: incident.incident_id
  };
}

function createActiveInteractionClosureEntry(interaction) {
  return {
    entry_id: interaction.interaction_id,
    state: 'active',
    kind: interaction.interaction_type,
    status: 'active',
    ts: interaction.started_at,
    agent_id: interaction.participant_agent_ids[0] || '',
    actor_id: null,
    summary: interaction.summary,
    correlation_id: interaction.correlation_id,
    evidence_refs: normalizeEvidenceRefs(interaction.evidence_refs),
    source_kind: interaction.source_kind,
    interaction_id: interaction.interaction_id,
    related_event_ids: normalizeStringValues(interaction.related_event_ids)
  };
}

function collectCorrelationTimestamps({ incidents = [], interactions = [], timeline = [] }) {
  return Array.from(
    new Set(
      [
        ...incidents.map((incident) => incident.ts),
        ...interactions.flatMap((interaction) =>
          [interaction.started_at, interaction.ended_at].filter(Boolean)
        ),
        ...timeline.map((event) => event.ts)
      ].filter((ts) => typeof ts === 'string' && ts.length > 0)
    )
  ).sort((left, right) => Date.parse(left) - Date.parse(right));
}

function parseLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }

  return Math.min(parsed, 200);
}

function parseOptionalLimit(value) {
  return value === null ? null : parseLimit(value);
}

function applyOptionalLimit(items, limit) {
  return limit === null ? items : items.slice(0, limit);
}

function parseWindow(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return 60 * 60 * 1000;
  }

  const match = value.match(/^(\d+)([mh])$/);
  if (!match) {
    return 60 * 60 * 1000;
  }

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2];
  return unit === 'h' ? amount * 60 * 60 * 1000 : amount * 60 * 1000;
}

function parseNowMs(value) {
  const parsed = typeof value === 'string' ? Date.parse(value) : Date.now();
  return Number.isFinite(parsed) ? parsed : null;
}

async function createPrototypeStore({ filePath, sqliteFilePath, sqliteBinPath } = {}) {
  const recordLog = sqliteFilePath
    ? new SqliteRecordLog({ sqliteFilePath, sqliteBinPath })
    : new JsonlRecordLog({ filePath });
  const store = new PrototypeStore({
    filePath: sqliteFilePath || filePath,
    recordLog
  });
  await store.load();
  return store;
}

module.exports = {
  PrototypeStore,
  createPrototypeStore,
  parseWindow,
  parseLimit
};
