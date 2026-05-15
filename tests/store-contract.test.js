const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { mkdtemp, readFile, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const test = require('node:test');

const { createPrototypeStore } = require('../src/store/prototype-store');

const execFileAsync = promisify(execFile);

async function createStoreFile() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-store-contract-'));
  return path.join(root, 'prototype-store.jsonl');
}

async function createSqliteStoreFile() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-store-contract-sqlite-'));
  return path.join(root, 'prototype-store.sqlite');
}

async function execSqlite(sqliteFilePath, sql) {
  return execFileAsync('sqlite3', [sqliteFilePath, sql]);
}

function createEvent() {
  return {
    event_id: 'evt_store_contract_review_started',
    ts: '2026-03-09T18:04:00.000Z',
    agent_id: 'app-engineering',
    actor_id: 'team-lead',
    agent_role: 'app-engineering',
    event_type: 'review_started',
    current_state: 'reviewing',
    active_task: 'Verify store replay contract',
    location: 'review-zone',
    summary: 'Lead started JSONL replay parity review',
    severity: 'yellow',
    correlation_id: 'corr-store-contract',
    counterparty_agent_ids: ['protocol-engineering'],
    evidence_refs: ['/tmp/store-contract/review-start.md'],
    source_kind: 'controller_event',
    metadata: {
      contract_fixture: true
    }
  };
}

function createHeartbeat() {
  return {
    agent_id: 'protocol-engineering',
    actor_id: 'team-lead',
    received_at: '2026-03-09T18:05:00.000Z',
    current_state: 'coding',
    active_task: 'Review replay persistence',
    last_meaningful_output_at: '2026-03-09T18:04:30.000Z',
    last_file_write_at: '2026-03-09T18:04:20.000Z',
    current_blocker: '',
    confidence_level: 'high',
    reboot_recommended: false
  };
}

function createCollectorReport() {
  return {
    collected_at: '2026-03-09T18:06:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 1,
      heartbeat_count: 1,
      tmux_observed_count: 1,
      workspace_observed_count: 1,
      reboot_recommended_count: 0
    },
    evidence_coverage: {
      evidence_ref_count: 2,
      covered_agent_count: 1,
      low_confidence_agent_ids: [],
      source_kind_buckets: {
        workspace_file: 1,
        workspace_root: 0,
        tmux_observation: 1
      },
      agent_items: [
        {
          agent_id: 'app-engineering',
          evidence_ref_count: 2,
          source_kinds: ['tmux_observation', 'workspace_file'],
          latest_evidence_at: '2026-03-09T18:05:30.000Z',
          confidence_level: 'high'
        }
      ]
    },
    runtime_source_evidence: {
      unmapped_tmux_sessions: []
    },
    items: [
      {
        agent_id: 'app-engineering',
        evidence_refs: [
          '/tmp/store-contract/outbox.md',
          'tmux://5-web3-app-engineering/0.1'
        ],
        workspace_observations: [
          {
            path: '/tmp/store-contract/outbox.md',
            file_name: 'outbox.md',
            kind: 'workspace_file',
            evidence_role: 'agent_output',
            last_modified_at: '2026-03-09T18:05:20.000Z'
          }
        ],
        tmux_observations: [
          {
            session_name: '5-web3-app-engineering',
            window_index: '0',
            pane_index: '1',
            pane_id: '%11',
            pane_title: 'Verify store replay contract',
            pane_current_command: 'nvim',
            pane_active: true,
            pane_dead: false,
            pane_activity_at: '2026-03-09T18:05:30.000Z'
          }
        ],
        source_health: {
          workspace_root: {
            status: 'observed',
            path: '/tmp/store-contract',
            last_observed_at: '2026-03-09T18:05:20.000Z',
            degraded_reasons: []
          },
          workspace_files: {
            status: 'degraded',
            expected_files: ['inbox.md', 'outbox.md', 'todo.md'],
            observed_count: 1,
            missing_count: 2,
            error_count: 0,
            last_observed_at: '2026-03-09T18:05:20.000Z',
            degraded_reasons: ['missing workspace files: inbox.md, todo.md']
          },
          tmux_session: {
            status: 'observed',
            expected_session_ref: '5-web3-app-engineering',
            observed_count: 1,
            last_observed_at: '2026-03-09T18:05:30.000Z',
            degraded_reasons: []
          }
        },
        supervision: {
          watch_target: 'growth-revenue',
          watched_by: ['protocol-engineering', 'team-lead'],
          needs_attention: false
        },
        heartbeat: {
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          received_at: '2026-03-09T18:06:00.000Z',
          current_state: 'coding',
          active_task: 'Verify store replay contract',
          last_meaningful_output_at: '2026-03-09T18:05:30.000Z',
          last_file_write_at: '2026-03-09T18:05:20.000Z',
          current_blocker: '',
          confidence_level: 'high',
          reboot_recommended: false
        }
      }
    ]
  };
}

function projectReplayContract(store) {
  const now = '2026-03-09T18:10:00.000Z';

  return {
    counts: store.getCounts(),
    appAgent: store.getAgentDetail('app-engineering', { limit: 5, now }),
    protocolAgent: store.getAgentDetail('protocol-engineering', { limit: 5, now }),
    latestCollectorReport: store.getLatestCollectorReport(),
    evidenceRecords: store.listEvidenceRecords(),
    latestCollectorSourceHealth: store.getLatestCollectorSourceHealth(),
    latestCollectorEvidenceCoverage: store.getLatestCollectorEvidenceCoverage(),
    events: store.listEvents({
      agent_id: 'app-engineering',
      limit: 10
    }),
    timeline: store.listTimeline({
      correlation_id: 'corr-store-contract',
      window: '15m',
      limit: 10,
      now
    }),
    interactions: store.listInteractions({
      correlation_id: 'corr-store-contract',
      window: '15m',
      limit: 10,
      now
    }),
    accountabilityReplay: store.getAccountabilityReplay({
      correlation_id: 'corr-store-contract',
      window: '15m',
      limit: 10,
      now
    })
  };
}

test('JSONL prototype store replays event, heartbeat, and collector snapshot read models', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });

  await store.appendEvent(createEvent());
  await store.appendHeartbeat(createHeartbeat());
  await store.appendCollectorReport(createCollectorReport());

  const beforeReload = projectReplayContract(store);
  const reloadedStore = await createPrototypeStore({ filePath: storeFile });
  const afterReload = projectReplayContract(reloadedStore);

  assert.deepEqual(afterReload, beforeReload);
  assert.equal(afterReload.latestCollectorReport.collected_at, '2026-03-09T18:06:00.000Z');
  assert.equal(afterReload.latestCollectorSourceHealth.agent_items[0].agent_id, 'app-engineering');
  assert.equal(afterReload.events[0].event_type, 'agent_state_changed');
  assert.ok(
    afterReload.timeline.some((event) => event.event_id === 'evt_store_contract_review_started')
  );
  assert.ok(
    afterReload.accountabilityReplay.ledger.some(
      (entry) => entry.entry_id === 'evt_store_contract_review_started'
    )
  );

  const records = (await readFile(storeFile, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  const recordKinds = records.map((record) => record.kind);
  assert.equal(recordKinds[recordKinds.length - 1], 'collector_snapshot');
  assert.ok(records.some((record) => record.kind === 'event'));
  assert.ok(records.some((record) => record.kind === 'heartbeat'));
  assert.equal(records.filter((record) => record.kind === 'collector_snapshot').length, 1);
  assert.ok(
    records.some(
      (record) =>
        record.kind === 'event' && record.payload.event_id === 'evt_store_contract_review_started'
    )
  );
  assert.ok(
    records.some(
      (record) => record.kind === 'heartbeat' && record.payload.agent_id === 'protocol-engineering'
    )
  );
});

test('JSONL prototype store appends and replays collector evidence records without changing counts', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });

  await store.appendEvent(createEvent());
  await store.appendHeartbeat(createHeartbeat());
  await store.appendCollectorReport(createCollectorReport());

  assert.deepEqual(store.getCounts(), {
    agent_count: 7,
    event_count: 3,
    heartbeat_count: 2
  });

  const evidenceRecords = store.listEvidenceRecords();
  assert.equal(evidenceRecords.length, 3);
  assert.deepEqual(
    evidenceRecords.map((record) => record.source_kind).sort(),
    ['tmux_observation', 'workspace_file', 'workspace_root']
  );

  const workspaceOutputRecord = evidenceRecords.find(
    (record) => record.evidence_ref === '/tmp/store-contract/outbox.md'
  );
  assert.equal(workspaceOutputRecord.evidence_role, 'agent_output');
  assert.equal(workspaceOutputRecord.output_candidate, true);
  assert.equal(workspaceOutputRecord.source_status, 'degraded');
  assert.deepEqual(workspaceOutputRecord.degraded_reasons, [
    'missing workspace files: inbox.md, todo.md'
  ]);

  const workspaceRootRecord = evidenceRecords.find(
    (record) => record.evidence_ref === '/tmp/store-contract'
  );
  assert.equal(workspaceRootRecord.evidence_role, 'workspace_presence');
  assert.equal(workspaceRootRecord.output_candidate, false);
  assert.equal(workspaceRootRecord.source_status, 'observed');

  const tmuxRecord = evidenceRecords.find((record) => record.source_kind === 'tmux_observation');
  assert.equal(tmuxRecord.evidence_ref, 'tmux://5-web3-app-engineering/0.1');
  assert.equal(tmuxRecord.output_candidate, true);
  assert.equal(tmuxRecord.collector_snapshot_id, 'collector-snapshot:2026-03-09T18:06:00.000Z');

  const reloadedStore = await createPrototypeStore({ filePath: storeFile });
  assert.deepEqual(reloadedStore.listEvidenceRecords(), evidenceRecords);
  assert.deepEqual(reloadedStore.getCounts(), store.getCounts());

  const records = (await readFile(storeFile, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(records.filter((record) => record.kind === 'evidence_record').length, 3);
});

test('JSONL prototype store loads old record kinds without evidence records', async () => {
  const storeFile = await createStoreFile();
  await writeFile(
    storeFile,
    [
      JSON.stringify({ kind: 'event', payload: createEvent() }),
      JSON.stringify({ kind: 'heartbeat', payload: createHeartbeat() }),
      JSON.stringify({ kind: 'collector_snapshot', payload: createCollectorReport() })
    ].join('\n') + '\n',
    'utf8'
  );

  const store = await createPrototypeStore({ filePath: storeFile });

  assert.deepEqual(store.listEvidenceRecords(), []);
  assert.equal(store.getLatestCollectorReport().collected_at, '2026-03-09T18:06:00.000Z');
  assert.deepEqual(store.getCounts(), {
    agent_count: 7,
    event_count: 1,
    heartbeat_count: 1
  });
});

test('SQLite prototype store replays the same contract as JSONL and survives reload', async () => {
  const jsonlStoreFile = await createStoreFile();
  const sqliteStoreFile = await createSqliteStoreFile();
  const jsonlStore = await createPrototypeStore({ filePath: jsonlStoreFile });
  const sqliteStore = await createPrototypeStore({ sqliteFilePath: sqliteStoreFile });

  await jsonlStore.appendEvent(createEvent());
  await jsonlStore.appendHeartbeat(createHeartbeat());
  await jsonlStore.appendCollectorReport(createCollectorReport());

  await sqliteStore.appendEvent(createEvent());
  await sqliteStore.appendHeartbeat(createHeartbeat());
  await sqliteStore.appendCollectorReport(createCollectorReport());

  assert.deepEqual(projectReplayContract(sqliteStore), projectReplayContract(jsonlStore));

  const reloadedSqliteStore = await createPrototypeStore({ sqliteFilePath: sqliteStoreFile });
  assert.deepEqual(projectReplayContract(reloadedSqliteStore), projectReplayContract(jsonlStore));
});

test('SQLite prototype store persists record kinds in append order', async () => {
  const sqliteStoreFile = await createSqliteStoreFile();
  const store = await createPrototypeStore({ sqliteFilePath: sqliteStoreFile });

  await store.appendEvent(createEvent());
  await store.appendHeartbeat(createHeartbeat());
  await store.appendCollectorReport(createCollectorReport());

  const { stdout } = await execSqlite(
    sqliteStoreFile,
    "SELECT kind FROM records ORDER BY seq;"
  );
  const recordKinds = stdout.trim().split('\n');

  assert.equal(recordKinds.at(-1), 'collector_snapshot');
  assert.ok(recordKinds.includes('event'));
  assert.ok(recordKinds.includes('heartbeat'));
  assert.equal(recordKinds.filter((kind) => kind === 'evidence_record').length, 3);
});

test('SQLite prototype store creates derived sidecar indexes and backfills existing records', async () => {
  const sqliteStoreFile = await createSqliteStoreFile();
  const eventPayload = JSON.stringify(createEvent()).replaceAll("'", "''");
  const heartbeatPayload = JSON.stringify(createHeartbeat()).replaceAll("'", "''");

  await execSqlite(
    sqliteStoreFile,
    [
      'CREATE TABLE records (',
      'seq INTEGER PRIMARY KEY AUTOINCREMENT,',
      'kind TEXT NOT NULL,',
      'payload_json TEXT NOT NULL,',
      'appended_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
      ');',
      `INSERT INTO records(kind,payload_json) VALUES ('event', '${eventPayload}');`,
      `INSERT INTO records(kind,payload_json) VALUES ('heartbeat', '${heartbeatPayload}');`
    ].join(' ')
  );

  const store = await createPrototypeStore({ sqliteFilePath: sqliteStoreFile });
  assert.deepEqual(store.getCounts(), {
    agent_count: 7,
    event_count: 1,
    heartbeat_count: 1
  });

  const { stdout: tableStdout } = await execSqlite(
    sqliteStoreFile,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('record_index','record_evidence_refs') ORDER BY name;"
  );
  assert.deepEqual(tableStdout.trim().split('\n'), ['record_evidence_refs', 'record_index']);

  const { stdout: indexStdout } = await execSqlite(
    sqliteStoreFile,
    [
      "SELECT name FROM sqlite_master WHERE type = 'index'",
      "AND name IN ('idx_record_index_event_id','idx_record_index_agent_id','idx_record_index_correlation_id','idx_record_index_source_kind','idx_record_evidence_refs_ref')",
      'ORDER BY name;'
    ].join(' ')
  );
  assert.deepEqual(indexStdout.trim().split('\n'), [
    'idx_record_evidence_refs_ref',
    'idx_record_index_agent_id',
    'idx_record_index_correlation_id',
    'idx_record_index_event_id',
    'idx_record_index_source_kind'
  ]);

  const { stdout: indexedEventStdout } = await execSqlite(
    sqliteStoreFile,
    [
      'SELECT record_index.kind, record_index.event_id, record_index.agent_id,',
      'record_index.correlation_id, record_index.source_kind, record_evidence_refs.evidence_ref',
      'FROM record_index',
      'JOIN record_evidence_refs ON record_evidence_refs.seq = record_index.seq',
      "WHERE record_index.kind = 'event';"
    ].join(' ')
  );
  assert.equal(
    indexedEventStdout.trim(),
    'event|evt_store_contract_review_started|app-engineering|corr-store-contract|controller_event|/tmp/store-contract/review-start.md'
  );

  await execSqlite(sqliteStoreFile, 'DELETE FROM record_evidence_refs;');
  await createPrototypeStore({ sqliteFilePath: sqliteStoreFile });
  const { stdout: backfillCountStdout } = await execSqlite(
    sqliteStoreFile,
    'SELECT (SELECT COUNT(*) FROM record_index), (SELECT COUNT(*) FROM record_evidence_refs);'
  );
  assert.equal(backfillCountStdout.trim(), '2|1');
});

test('SQLite prototype store populates sidecars when appending collector evidence records', async () => {
  const sqliteStoreFile = await createSqliteStoreFile();
  const store = await createPrototypeStore({ sqliteFilePath: sqliteStoreFile });

  await store.appendEvent(createEvent());
  await store.appendHeartbeat(createHeartbeat());
  await store.appendCollectorReport(createCollectorReport());

  const { stdout: evidenceIndexStdout } = await execSqlite(
    sqliteStoreFile,
    [
      'SELECT record_index.kind, record_index.evidence_id, record_index.agent_id,',
      'record_index.source_kind, record_index.output_candidate, record_evidence_refs.evidence_ref',
      'FROM record_index',
      'JOIN record_evidence_refs ON record_evidence_refs.seq = record_index.seq',
      "WHERE record_index.kind = 'evidence_record'",
      'ORDER BY record_index.seq;'
    ].join(' ')
  );
  assert.deepEqual(evidenceIndexStdout.trim().split('\n'), [
    'evidence_record|ev_collector-snapshot_2026-03-09T18_06_00_000Z_app-engineering_workspace_root__tmp_store-contract_1|app-engineering|workspace_root|0|/tmp/store-contract',
    'evidence_record|ev_collector-snapshot_2026-03-09T18_06_00_000Z_app-engineering_workspace_file__tmp_store-contract_outbox_md_2|app-engineering|workspace_file|1|/tmp/store-contract/outbox.md',
    'evidence_record|ev_collector-snapshot_2026-03-09T18_06_00_000Z_app-engineering_tmux_observation_tmux_5-web3-app-engineering_0_1_3|app-engineering|tmux_observation|1|tmux://5-web3-app-engineering/0.1'
  ]);
});

test('SQLite prototype store records are append-only', async () => {
  const sqliteStoreFile = await createSqliteStoreFile();
  const store = await createPrototypeStore({ sqliteFilePath: sqliteStoreFile });

  await store.appendEvent(createEvent());

  await assert.rejects(
    execSqlite(sqliteStoreFile, "UPDATE records SET kind = 'heartbeat' WHERE seq = 1;"),
    /records are append-only/
  );
  await assert.rejects(
    execSqlite(sqliteStoreFile, 'DELETE FROM records WHERE seq = 1;'),
    /records are append-only/
  );
});

test('SQLite prototype store preserves payload text through reload', async () => {
  const sqliteStoreFile = await createSqliteStoreFile();
  const store = await createPrototypeStore({ sqliteFilePath: sqliteStoreFile });
  const event = {
    ...createEvent(),
    event_id: 'evt_payload_integrity',
    summary: "single quote ' newline\nemoji 😀 backslash \\",
    evidence_refs: ['quoted "evidence_ref"', "single ' ref"],
    metadata: {
      text: "single quote ' newline\nemoji 😀 backslash \\"
    }
  };

  await store.appendEvent(event);

  const reloadedStore = await createPrototypeStore({ sqliteFilePath: sqliteStoreFile });
  assert.deepEqual(reloadedStore.listEvents({ event_id: 'evt_payload_integrity', limit: 1 })[0], event);
});

test('SQLite prototype store hard-fails when sqlite binary is missing', async () => {
  const sqliteStoreFile = await createSqliteStoreFile();

  await assert.rejects(
    createPrototypeStore({
      sqliteFilePath: sqliteStoreFile,
      sqliteBinPath: '/definitely/missing/sqlite3'
    }),
    /sqlite3.*not found|missing sqlite/i
  );
});
