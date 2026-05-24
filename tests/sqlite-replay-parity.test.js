const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { mkdir, mkdtemp, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { promisify } = require('node:util');

const { createPrototypeStore } = require('../src/store/prototype-store');

const execFileAsync = promisify(execFile);

async function hasSqlite3() {
  try {
    await execFileAsync('sqlite3', ['--version']);
    return true;
  } catch {
    return false;
  }
}

async function createHarnessRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-sqlite-parity-'));
  await mkdir(path.join(root, 'app'), { recursive: true });
  await writeFile(path.join(root, 'app', 'inbox.md'), 'inbox\n', 'utf8');
  await writeFile(path.join(root, 'app', 'outbox.md'), 'outbox\n', 'utf8');
  return root;
}

function createEvent(root) {
  return {
    event_id: 'evt_sqlite_replay_parity_review_started',
    ts: '2026-03-09T18:04:00.000Z',
    agent_id: 'app-engineering',
    actor_id: 'team-lead',
    agent_role: 'app-engineering',
    event_type: 'review_started',
    current_state: 'reviewing',
    active_task: 'Verify SQLite replay parity',
    location: 'review-zone',
    summary: 'Lead started SQLite replay parity review',
    severity: 'yellow',
    correlation_id: 'corr-sqlite-replay-parity',
    counterparty_agent_ids: ['protocol-engineering'],
    evidence_refs: [path.join(root, 'app', 'outbox.md')],
    source_kind: 'controller_event',
    metadata: {
      parity_fixture: true
    }
  };
}

function createHeartbeat(root) {
  return {
    agent_id: 'protocol-engineering',
    actor_id: 'team-lead',
    received_at: '2026-03-09T18:05:00.000Z',
    current_state: 'coding',
    active_task: 'Review SQLite replay persistence',
    last_meaningful_output_at: '2026-03-09T18:04:30.000Z',
    last_file_write_at: '2026-03-09T18:04:20.000Z',
    current_blocker: '',
    confidence_level: 'high',
    reboot_recommended: false,
    evidence_refs: [path.join(root, 'app', 'inbox.md')]
  };
}

function createCollectorReport(root, collectedAt) {
  const appRoot = path.join(root, 'app');
  const inboxPath = path.join(appRoot, 'inbox.md');
  const outboxPath = path.join(appRoot, 'outbox.md');

  return {
    collected_at: collectedAt,
    actor_id: 'team-lead',
    summary: {
      agent_count: 2,
      heartbeat_count: 1,
      tmux_observed_count: 1,
      workspace_observed_count: 2,
      reboot_recommended_count: 0
    },
    evidence_coverage: {
      evidence_ref_count: 3,
      covered_agent_count: 1,
      low_confidence_agent_ids: ['protocol-engineering'],
      source_kind_buckets: {
        workspace_file: 2,
        workspace_root: 0,
        tmux_observation: 1
      },
      agent_items: [
        {
          agent_id: 'app-engineering',
          evidence_ref_count: 3,
          source_kinds: ['workspace_file', 'tmux_observation'],
          latest_evidence_at: '2026-03-09T18:05:30.000Z',
          confidence_level: 'high'
        },
        {
          agent_id: 'protocol-engineering',
          evidence_ref_count: 0,
          source_kinds: [],
          latest_evidence_at: null,
          confidence_level: 'low'
        }
      ]
    },
    runtime_source_evidence: {
      unmapped_tmux_sessions: [
        {
          session_name: 'unmapped-sqlite-parity',
          pane_refs: ['tmux://unmapped-sqlite-parity/0.0'],
          observed_count: 1,
          status: 'observed',
          last_observed_at: '2026-03-09T18:05:50.000Z',
          degraded_reasons: []
        }
      ]
    },
    items: [
      {
        agent_id: 'app-engineering',
        evidence_refs: [inboxPath, outboxPath, 'tmux://5-web3-app-engineering/0.1'],
        workspace_observations: [
          {
            path: inboxPath,
            file_name: 'inbox.md',
            kind: 'workspace_file',
            last_modified_at: '2026-03-09T18:04:00.000Z'
          },
          {
            path: outboxPath,
            file_name: 'outbox.md',
            kind: 'workspace_file',
            evidence_role: 'agent_output',
            last_modified_at: '2026-03-09T18:05:00.000Z'
          }
        ],
        tmux_observations: [
          {
            session_name: '5-web3-app-engineering',
            window_index: '0',
            pane_index: '1',
            pane_id: '%11',
            pane_current_command: 'nvim',
            pane_activity_at: '2026-03-09T18:05:30.000Z'
          }
        ],
        source_health: {
          workspace_root: {
            status: 'observed',
            path: appRoot,
            last_observed_at: '2026-03-09T18:03:00.000Z',
            degraded_reasons: []
          },
          workspace_files: {
            status: 'degraded',
            expected_files: ['inbox.md', 'outbox.md', 'todo.md'],
            observed_count: 2,
            missing_count: 1,
            error_count: 0,
            last_observed_at: '2026-03-09T18:05:00.000Z',
            degraded_reasons: ['missing workspace files: todo.md']
          },
          tmux_session: {
            status: 'observed',
            expected_session_ref: '5-web3-app-engineering',
            observed_count: 1,
            last_observed_at: '2026-03-09T18:05:30.000Z',
            degraded_reasons: []
          }
        },
        heartbeat: {
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          received_at: collectedAt,
          current_state: 'coding',
          active_task: 'Validate SQLite replay parity',
          current_location: 'desk-app-engineering',
          last_meaningful_output_at: '2026-03-09T18:05:00.000Z',
          last_file_write_at: '2026-03-09T18:05:00.000Z',
          current_blocker: '',
          confidence_level: 'high',
          reboot_recommended: false,
          evidence_refs: [outboxPath, 'tmux://5-web3-app-engineering/0.1']
        }
      },
      {
        agent_id: 'protocol-engineering',
        evidence_refs: [],
        workspace_observations: [],
        tmux_observations: [],
        source_health: {
          workspace_root: {
            status: 'missing',
            path: path.join(root, 'protocol'),
            last_observed_at: null,
            degraded_reasons: ['workspace root not observed']
          },
          workspace_files: {
            status: 'missing',
            expected_files: ['inbox.md', 'outbox.md', 'todo.md'],
            observed_count: 0,
            missing_count: 3,
            error_count: 0,
            last_observed_at: null,
            degraded_reasons: ['missing workspace files: inbox.md, outbox.md, todo.md']
          }
        }
      }
    ]
  };
}

function redact(value, root) {
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, root));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, redact(entry, root)])
    );
  }

  if (typeof value === 'string') {
    return value.replaceAll(root, '<tmp>');
  }

  return value;
}

async function appendCanonicalRecords(store, root) {
  await store.appendEvent(createEvent(root));
  await store.appendHeartbeat(createHeartbeat(root));
  await store.appendCollectorReport(createCollectorReport(root, '2026-03-09T18:06:00.000Z'));
  await store.appendCollectorReport(createCollectorReport(root, '2026-03-09T18:07:00.000Z'));
}

function projectParityReadModels(store, root) {
  const outputRecord = store.listEvidenceRecords({
    source_kind: 'workspace_file',
    evidence_role: 'agent_output',
    newest_first: 'true',
    limit: 1
  })[0];

  return redact(
    {
      filteredEvidenceRecords: store.listEvidenceRecords({
        mapped: 'true',
        output_candidate: 'true',
        observed_since: '2026-03-09T18:04:30.000Z',
        observed_until: '2026-03-09T18:05:30.000Z',
        newest_first: 'true',
        limit: 3
      }),
      newestEvidenceOrder: store
        .listEvidenceRecords({
          newest_first: 'true',
          limit: 8
        })
        .map((record) => ({
          observed_at: record.observed_at,
          collected_at: record.collected_at,
          evidence_ref: record.evidence_ref,
          source_kind: record.source_kind
        })),
      runtimeSourceGapsSummary: store.getRuntimeSourceGapsSummary({
        newest_first: 'true',
        limit: '1'
      }),
      filteredCheckpointLog: store.listReplayCheckpointLog({
        record_kind: 'evidence_record',
        collector_snapshot_id: 'collector-snapshot:2026-03-09T18:07:00.000Z',
        correlation_id: 'collector-snapshot:2026-03-09T18:07:00.000Z',
        source_kind: 'workspace_file',
        limit: '1'
      }),
      provenanceBundle: store.getEvidenceProvenanceBundle(outputRecord.evidence_id)
    },
    root
  );
}

test('JSONL and SQLite stores replay evidence read models with parity', async (t) => {
  if (!(await hasSqlite3())) {
    t.skip('sqlite3 binary not found; SQLite replay parity skipped explicitly');
    return;
  }

  const root = await createHarnessRoot();
  const jsonlStore = await createPrototypeStore({
    filePath: path.join(root, 'prototype-store.jsonl')
  });
  const sqliteStore = await createPrototypeStore({
    sqliteFilePath: path.join(root, 'prototype-store.sqlite')
  });

  await appendCanonicalRecords(jsonlStore, root);
  await appendCanonicalRecords(sqliteStore, root);

  const jsonlReloaded = await createPrototypeStore({
    filePath: path.join(root, 'prototype-store.jsonl')
  });
  const sqliteReloaded = await createPrototypeStore({
    sqliteFilePath: path.join(root, 'prototype-store.sqlite')
  });
  const jsonlProjection = projectParityReadModels(jsonlReloaded, root);
  const sqliteProjection = projectParityReadModels(sqliteReloaded, root);
  const jsonlManifest = jsonlReloaded.getStorageReplayManifest();
  const sqliteManifest = sqliteReloaded.getStorageReplayManifest();

  assert.deepEqual(sqliteProjection, jsonlProjection);
  assert.deepEqual(sqliteManifest, jsonlManifest);
  assert.deepEqual(
    {
      ...jsonlManifest,
      canonical_record_hash: '<sha256>'
    },
    {
      record_count: 20,
      record_kind_buckets: {
        event: 3,
        heartbeat: 3,
        evidence_record: 12,
        collector_snapshot: 2
      },
      canonical_record_hash: '<sha256>'
    }
  );
  assert.match(jsonlManifest.canonical_record_hash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(jsonlManifest).includes(root), false);
  assert.equal(JSON.stringify(jsonlManifest).includes('tmux://'), false);
  assert.equal(JSON.stringify(jsonlManifest).includes('metadata'), false);
  assert.equal(JSON.stringify(jsonlManifest).includes('degraded_reasons'), false);
  assert.deepEqual(
    jsonlProjection.newestEvidenceOrder.map(
      (record) => `${record.collected_at}|${record.source_kind}|${record.evidence_ref}`
    ),
    [
      '2026-03-09T18:07:00.000Z|tmux_observation|tmux://unmapped-sqlite-parity/0.0',
      '2026-03-09T18:06:00.000Z|tmux_observation|tmux://unmapped-sqlite-parity/0.0',
      '2026-03-09T18:07:00.000Z|tmux_observation|tmux://5-web3-app-engineering/0.1',
      '2026-03-09T18:06:00.000Z|tmux_observation|tmux://5-web3-app-engineering/0.1',
      '2026-03-09T18:07:00.000Z|workspace_file|<tmp>/app/outbox.md',
      '2026-03-09T18:06:00.000Z|workspace_file|<tmp>/app/outbox.md',
      '2026-03-09T18:07:00.000Z|workspace_file|<tmp>/app/inbox.md',
      '2026-03-09T18:06:00.000Z|workspace_file|<tmp>/app/inbox.md'
    ]
  );
  assert.equal(
    JSON.stringify(jsonlProjection.provenanceBundle).includes(root),
    false
  );
  assert.equal(
    JSON.stringify(sqliteProjection.provenanceBundle).includes(root),
    false
  );
  assert.deepEqual(jsonlProjection.filteredCheckpointLog, [
    {
      append_index: 16,
      record_kind: 'evidence_record',
      checkpoint: {
        observed_at: '2026-03-09T18:05:00.000Z',
        collected_at: '2026-03-09T18:07:00.000Z',
        agent_id: 'app-engineering',
        source_kind: 'workspace_file',
        evidence_role: 'agent_output',
        source_status: 'degraded',
        output_candidate: true,
        collector_snapshot_id: 'collector-snapshot:2026-03-09T18:07:00.000Z',
        correlation_id: 'collector-snapshot:2026-03-09T18:07:00.000Z',
        unmapped: false
      }
    }
  ]);
  assert.equal(
    Object.hasOwn(jsonlProjection.filteredCheckpointLog[0].checkpoint, 'evidence_id'),
    false
  );
  assert.deepEqual(jsonlProjection.provenanceBundle.source_summary, {
    kind: 'workspace_file',
    status: 'degraded',
    role: 'agent_output',
    output_candidate: true,
    mapped: true,
    time: {
      observed_at: '2026-03-09T18:05:00.000Z',
      collected_at: '2026-03-09T18:07:00.000Z'
    }
  });
  assert.deepEqual(sqliteProjection.provenanceBundle.source_summary, {
    kind: 'workspace_file',
    status: 'degraded',
    role: 'agent_output',
    output_candidate: true,
    mapped: true,
    time: {
      observed_at: '2026-03-09T18:05:00.000Z',
      collected_at: '2026-03-09T18:07:00.000Z'
    }
  });
});
