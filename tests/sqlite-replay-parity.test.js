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

async function execSqlite(sqliteFilePath, sql) {
  return execFileAsync('sqlite3', [sqliteFilePath, sql]);
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
      agentEvidenceSpine: store.getAgentEvidenceSpine('app-engineering', {
        source_kind: 'workspace_file',
        output_candidate: 'true',
        newest_first: 'true',
        limit: '1'
      }),
      sourceMatrix: store.getAgentEvidenceSourceStatusMatrix({
        newest_first: 'true',
        limit: '3'
      }),
      filteredSourceMatrix: store.getAgentEvidenceSourceStatusMatrix({
        mapped: 'true',
        source_kind: 'workspace_file',
        evidence_role: 'agent_output',
        output_candidate: 'true',
        source_status: 'degraded',
        newest_first: 'true',
        limit: '1'
      }),
      unmappedSourceMatrix: store.getAgentEvidenceSourceStatusMatrix({
        mapped: 'false',
        source_kind: 'tmux_observation',
        evidence_role: 'runtime_unmapped',
        source_status: 'observed',
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
      selectedEvidenceRecord: store.getEvidenceRecord(outputRecord.evidence_id),
      replayWindow: store.getEvidenceReplayWindow(outputRecord.evidence_id),
      provenanceBundle: store.getEvidenceProvenanceBundle(outputRecord.evidence_id)
    },
    root
  );
}

function projectRuntimeSourceGapAggregateProbe(store) {
  const mappedWindowFilters = {
    mapped: 'true',
    source_kind: 'workspace_file',
    evidence_role: 'agent_output',
    source_status: 'degraded',
    observed_since: '2026-03-09T18:04:30.000Z',
    observed_until: '2026-03-09T18:05:30.000Z',
    newest_first: 'true',
    limit: '1'
  };
  const unmappedWindowFilters = {
    mapped: 'false',
    source_kind: 'tmux_observation',
    evidence_role: 'runtime_unmapped',
    source_status: 'observed',
    observed_since: '2026-03-09T18:05:45.000Z',
    observed_until: '2026-03-09T18:05:55.000Z',
    newest_first: 'true',
    limit: '1'
  };

  return {
    mappedSummary: store.getRuntimeSourceGapsSummary(mappedWindowFilters),
    unmappedSummary: store.getRuntimeSourceGapsSummary(unmappedWindowFilters),
    mappedAgentSummary: store.getRuntimeSourceGapAgentSummary(mappedWindowFilters),
    unmappedAgentSummary: store.getRuntimeSourceGapAgentSummary(unmappedWindowFilters),
    mappedLifecycle: store.getRuntimeSourceGapLifecycle(mappedWindowFilters),
    unmappedLifecycle: store.getRuntimeSourceGapLifecycle(unmappedWindowFilters),
    mappedTrend: store.getRuntimeSourceGapTrend(mappedWindowFilters),
    unmappedTrend: store.getRuntimeSourceGapTrend(unmappedWindowFilters)
  };
}

function assertRuntimeSourceGapAggregateIsSafe(projection, root) {
  const serialized = JSON.stringify(projection);
  for (const forbidden of [
    'evidence_id',
    'evidence_ref',
    'metadata',
    'degraded_reasons',
    root,
    '/app/',
    'tmux://',
    'unmapped-sqlite-parity'
  ]) {
    assert.equal(serialized.includes(forbidden), false, `leaked ${forbidden}`);
  }
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
  const jsonlBoundaryManifest = jsonlReloaded.getStorageReplayBoundaryManifest();
  const sqliteBoundaryManifest = sqliteReloaded.getStorageReplayBoundaryManifest();
  const jsonlIndexHealth = await jsonlReloaded.getStorageIndexHealth();
  const sqliteIndexHealth = await sqliteReloaded.getStorageIndexHealth();

  assert.deepEqual(sqliteProjection, jsonlProjection);
  assert.equal(
    jsonlProjection.selectedEvidenceRecord.append_index,
    jsonlProjection.replayWindow.center.append_index
  );
  assert.equal(
    jsonlProjection.filteredCheckpointLog[0].append_index,
    jsonlProjection.selectedEvidenceRecord.append_index
  );
  assert.deepEqual(sqliteManifest, jsonlManifest);
  assert.deepEqual(sqliteBoundaryManifest, jsonlBoundaryManifest);
  assert.deepEqual(jsonlBoundaryManifest, {
    record_count: 20,
    append_order_bounds: {
      first_append_index: 1,
      last_append_index: 20,
      expected_record_count: 20,
      count_consistent: true
    },
    canonical_record_hash: jsonlManifest.canonical_record_hash
  });
  assert.deepEqual(
    {
      ...jsonlIndexHealth,
      backend: '<backend>',
      record_index_count: '<sidecar>',
      record_evidence_ref_count: '<sidecar>',
      record_index_drift_count: '<sidecar>',
      record_evidence_ref_drift_count: '<sidecar>',
      evidence_query_probe_count: '<sidecar>',
      evidence_query_probe_drift_count: '<sidecar>',
      evidence_query_probe_status: '<sidecar>',
      sidecar_status: '<sidecar>'
    },
    {
      ...sqliteIndexHealth,
      backend: '<backend>',
      record_index_count: '<sidecar>',
      record_evidence_ref_count: '<sidecar>',
      record_index_drift_count: '<sidecar>',
      record_evidence_ref_drift_count: '<sidecar>',
      evidence_query_probe_count: '<sidecar>',
      evidence_query_probe_drift_count: '<sidecar>',
      evidence_query_probe_status: '<sidecar>',
      sidecar_status: '<sidecar>'
    }
  );
  assert.equal(jsonlIndexHealth.backend, 'jsonl');
  assert.equal(jsonlIndexHealth.sidecar_status, 'not_applicable');
  assert.equal(sqliteIndexHealth.backend, 'sqlite');
  assert.equal(sqliteIndexHealth.sidecar_status, 'complete');
  assert.equal(sqliteIndexHealth.record_index_count, sqliteIndexHealth.record_count);
  assert.equal(sqliteIndexHealth.record_evidence_ref_count > 0, true);
  assert.equal(sqliteIndexHealth.record_index_drift_count, 0);
  assert.equal(sqliteIndexHealth.record_evidence_ref_drift_count, 0);
  assert.equal(sqliteIndexHealth.evidence_query_probe_status, 'complete');
  assert.equal(sqliteIndexHealth.evidence_query_probe_count > 10, true);
  assert.equal(sqliteIndexHealth.evidence_query_probe_drift_count, 0);
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
      runtime_gap_summary: {
        total_count: 8,
        mapped_count: 6,
        unmapped_count: 2,
        source_kind_buckets: {
          workspace_file: 4,
          workspace_root: 2,
          tmux_observation: 2
        },
        source_status_buckets: {
          degraded: 4,
          missing: 2,
          observed: 2
        },
        latest_observed_at: '2026-03-09T18:05:50.000Z',
        latest_collected_at: '2026-03-09T18:07:00.000Z'
      },
      evidence_summary: {
        evidence_record_count: 12,
        source_kind_buckets: {
          workspace_root: 4,
          workspace_file: 4,
          tmux_observation: 4
        },
        source_category_buckets: {
          workspace: 8,
          runtime: 4
        },
        evidence_role_buckets: {
          workspace_presence: 4,
          inbound_task: 2,
          agent_output: 2,
          runtime_activity: 2,
          runtime_unmapped: 2
        },
        source_status_buckets: {
          observed: 6,
          degraded: 4,
          missing: 2
        },
        output_candidate_count: 4,
        unmapped_count: 2,
        latest_observed_at: '2026-03-09T18:05:50.000Z',
        latest_collected_at: '2026-03-09T18:07:00.000Z'
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
  assert.deepEqual(
    jsonlProjection.filteredSourceMatrix.agents.map((agent) => agent.agent_id),
    [
      'team-lead',
      'market-intel',
      'product-pmf',
      'tokenomics',
      'protocol-engineering',
      'app-engineering',
      'growth-revenue'
    ]
  );
  assert.equal(jsonlProjection.filteredSourceMatrix.agent_count, 7);
  assert.equal(jsonlProjection.filteredSourceMatrix.returned_limit, 1);
  assert.equal(jsonlProjection.filteredSourceMatrix.total_count, 2);
  assert.equal(jsonlProjection.filteredSourceMatrix.mapped_count, 2);
  assert.equal(jsonlProjection.filteredSourceMatrix.unmapped_count, 0);
  assert.deepEqual(
    jsonlProjection.filteredSourceMatrix.agents.find(
      (agent) => agent.agent_id === 'app-engineering'
    ).sources,
    [
      {
        source_kind: 'workspace_file',
        evidence_count: 2,
        source_status_buckets: {
          observed: 0,
          degraded: 2,
          missing: 0,
          error: 0
        },
        evidence_role_buckets: {
          workspace_presence: 0,
          inbound_task: 0,
          agent_output: 2,
          agent_plan: 0,
          runtime_activity: 0,
          runtime_presence: 0,
          runtime_unmapped: 0,
          task_reference: 0
        },
        output_candidate_buckets: {
          true: 2,
          false: 0
        },
        latest_observed_at: '2026-03-09T18:05:00.000Z',
        latest_collected_at: '2026-03-09T18:07:00.000Z'
      }
    ]
  );
  assert.deepEqual(
    jsonlProjection.filteredSourceMatrix.agents.find(
      (agent) => agent.agent_id === 'protocol-engineering'
    ).sources,
    [
      {
        source_kind: 'workspace_file',
        evidence_count: 0,
        source_status_buckets: {
          observed: 0,
          degraded: 0,
          missing: 0,
          error: 0
        },
        evidence_role_buckets: {
          workspace_presence: 0,
          inbound_task: 0,
          agent_output: 0,
          agent_plan: 0,
          runtime_activity: 0,
          runtime_presence: 0,
          runtime_unmapped: 0,
          task_reference: 0
        },
        output_candidate_buckets: {
          true: 0,
          false: 0
        },
        latest_observed_at: null,
        latest_collected_at: null
      }
    ]
  );
  assert.deepEqual(jsonlProjection.unmappedSourceMatrix.unmapped_evidence_summary, {
    total_count: 2,
    sources: [
      {
        source_kind: 'tmux_observation',
        evidence_count: 2,
        source_status_buckets: {
          observed: 2,
          degraded: 0,
          missing: 0,
          error: 0
        },
        evidence_role_buckets: {
          workspace_presence: 0,
          inbound_task: 0,
          agent_output: 0,
          agent_plan: 0,
          runtime_activity: 0,
          runtime_presence: 0,
          runtime_unmapped: 2,
          task_reference: 0
        },
        output_candidate_buckets: {
          true: 0,
          false: 2
        },
        latest_observed_at: '2026-03-09T18:05:50.000Z',
        latest_collected_at: '2026-03-09T18:07:00.000Z'
      }
    ]
  });
  for (const projection of [
    jsonlProjection.sourceMatrix,
    jsonlProjection.filteredSourceMatrix,
    jsonlProjection.unmappedSourceMatrix,
    sqliteProjection.sourceMatrix,
    sqliteProjection.filteredSourceMatrix,
    sqliteProjection.unmappedSourceMatrix
  ]) {
    const serialized = JSON.stringify(projection);
    assert.equal(serialized.includes(root), false);
    assert.equal(serialized.includes('tmux://'), false);
    assert.equal(serialized.includes('metadata'), false);
    assert.equal(serialized.includes('degraded_reasons'), false);
  }
  assert.deepEqual(jsonlProjection.replayWindow.window, { before: 2, after: 2 });
  assert.equal(jsonlProjection.replayWindow.before.length, 2);
  assert.equal(jsonlProjection.replayWindow.after.length, 2);
  for (const projection of [jsonlProjection.replayWindow, sqliteProjection.replayWindow]) {
    const serialized = JSON.stringify(projection);
    assert.equal(serialized.includes(root), false);
    assert.equal(serialized.includes('tmux://'), false);
    assert.equal(serialized.includes('collector_snapshot_id'), false);
    assert.equal(serialized.includes('correlation_id'), false);
    assert.equal(serialized.includes('metadata'), false);
    assert.equal(serialized.includes('degraded_reasons'), false);
  }
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

test('JSONL and SQLite stores replay runtime source-gap aggregates with parity', async (t) => {
  if (!(await hasSqlite3())) {
    t.skip('sqlite3 binary not found; SQLite runtime source-gap parity skipped explicitly');
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
  const jsonlProjection = projectRuntimeSourceGapAggregateProbe(jsonlReloaded);
  const sqliteProjection = projectRuntimeSourceGapAggregateProbe(sqliteReloaded);

  assert.deepEqual(sqliteProjection, jsonlProjection);
  assert.equal(jsonlProjection.mappedSummary.total_count, 2);
  assert.equal(jsonlProjection.mappedSummary.returned_limit, 1);
  assert.equal(jsonlProjection.mappedSummary.mapped_count, 2);
  assert.equal(jsonlProjection.mappedSummary.unmapped_count, 0);
  assert.equal(jsonlProjection.mappedSummary.source_status_buckets.degraded, 2);
  assert.equal(jsonlProjection.mappedSummary.first_observed_at, '2026-03-09T18:05:00.000Z');
  assert.equal(jsonlProjection.mappedSummary.last_collected_at, '2026-03-09T18:07:00.000Z');
  assert.equal(jsonlProjection.unmappedSummary.total_count, 2);
  assert.equal(jsonlProjection.unmappedSummary.mapped_count, 0);
  assert.equal(jsonlProjection.unmappedSummary.unmapped_count, 2);
  assert.equal(jsonlProjection.unmappedSummary.source_status_buckets.observed, 2);

  assert.deepEqual(jsonlProjection.mappedAgentSummary.groups, [
    {
      agent_id: 'app-engineering',
      source_kind: 'workspace_file',
      record_count: 2,
      mapped_count: 2,
      unmapped_count: 0,
      output_candidate_buckets: { true: 2, false: 0 },
      evidence_role_buckets: { agent_output: 2 },
      source_status_buckets: { degraded: 2 },
      first_observed_at: '2026-03-09T18:05:00.000Z',
      last_observed_at: '2026-03-09T18:05:00.000Z',
      first_collected_at: '2026-03-09T18:06:00.000Z',
      last_collected_at: '2026-03-09T18:07:00.000Z'
    }
  ]);
  assert.deepEqual(jsonlProjection.unmappedAgentSummary.groups, [
    {
      agent_id: null,
      source_kind: 'tmux_observation',
      record_count: 2,
      mapped_count: 0,
      unmapped_count: 2,
      output_candidate_buckets: { true: 0, false: 2 },
      evidence_role_buckets: { runtime_unmapped: 2 },
      source_status_buckets: { observed: 2 },
      first_observed_at: '2026-03-09T18:05:50.000Z',
      last_observed_at: '2026-03-09T18:05:50.000Z',
      first_collected_at: '2026-03-09T18:06:00.000Z',
      last_collected_at: '2026-03-09T18:07:00.000Z'
    }
  ]);
  assert.equal(jsonlProjection.mappedLifecycle.total_count, 2);
  assert.equal(jsonlProjection.mappedLifecycle.groups[0].lifecycle_state, 'continuing');
  assert.equal(jsonlProjection.mappedLifecycle.groups[0].snapshot_count, 2);
  assert.equal(jsonlProjection.unmappedLifecycle.total_count, 2);
  assert.equal(jsonlProjection.unmappedLifecycle.groups[0].lifecycle_state, 'observed_unmapped');
  assert.equal(jsonlProjection.unmappedLifecycle.groups[0].agent_id, null);
  assert.deepEqual(jsonlProjection.mappedTrend, {
    bucket: 'hour',
    total_count: 2,
    total_buckets: 1,
    returned_limit: 1,
    buckets: [
      {
        bucket_start: '2026-03-09T18:00:00.000Z',
        total_count: 2,
        mapped_count: 2,
        unmapped_count: 0,
        output_candidate_buckets: { true: 2, false: 0 },
        source_kind_buckets: { workspace_file: 2 },
        evidence_role_buckets: { agent_output: 2 },
        source_status_buckets: { degraded: 2 }
      }
    ]
  });
  assert.deepEqual(jsonlProjection.unmappedTrend.buckets, [
    {
      bucket_start: '2026-03-09T18:00:00.000Z',
      total_count: 2,
      mapped_count: 0,
      unmapped_count: 2,
      output_candidate_buckets: { true: 0, false: 2 },
      source_kind_buckets: { tmux_observation: 2 },
      evidence_role_buckets: { runtime_unmapped: 2 },
      source_status_buckets: { observed: 2 }
    }
  ]);
  assertRuntimeSourceGapAggregateIsSafe(jsonlProjection, root);
  assertRuntimeSourceGapAggregateIsSafe(sqliteProjection, root);
});

test('SQLite sidecar evidence coverage matches read filters without public raw refs', async (t) => {
  if (!(await hasSqlite3())) {
    t.skip('sqlite3 binary not found; SQLite sidecar coverage skipped explicitly');
    return;
  }

  const root = await createHarnessRoot();
  const sqliteFilePath = path.join(root, 'prototype-store.sqlite');
  const store = await createPrototypeStore({ sqliteFilePath });

  await appendCanonicalRecords(store, root);

  const filters = {
    mapped: 'true',
    source_kind: 'workspace_file',
    evidence_role: 'agent_output',
    source_status: 'degraded',
    output_candidate: 'true',
    collector_snapshot_id: 'collector-snapshot:2026-03-09T18:07:00.000Z',
    newest_first: 'true',
    limit: 10
  };
  const filteredEvidence = store.listEvidenceRecords(filters);
  assert.equal(filteredEvidence.length, 1);

  const { stdout } = await execSqlite(
    sqliteFilePath,
    [
      'SELECT',
      'COUNT(*) AS evidence_records,',
      'COUNT(record_evidence_refs.evidence_ref) AS evidence_refs',
      'FROM record_index',
      'LEFT JOIN record_evidence_refs ON record_evidence_refs.seq = record_index.seq',
      "WHERE record_index.kind = 'evidence_record'",
      'AND record_index.agent_id IS NOT NULL',
      "AND record_index.source_kind = 'workspace_file'",
      "AND record_index.evidence_role = 'agent_output'",
      "AND record_index.source_status = 'degraded'",
      'AND record_index.output_candidate = 1',
      "AND record_index.collector_snapshot_id = 'collector-snapshot:2026-03-09T18:07:00.000Z';"
    ].join(' ')
  );

  assert.equal(stdout.trim(), '1|1');

  const health = await store.getStorageIndexHealth();
  const sourceMatrix = store.getAgentEvidenceSourceStatusMatrix(filters);
  const serializedPublicReadiness = JSON.stringify({ health, sourceMatrix });

  assert.equal(health.record_index_count, store.getStorageReplayManifest().record_count);
  assert.equal(health.record_evidence_ref_count, 20);
  assert.equal(serializedPublicReadiness.includes(root), false);
  assert.equal(serializedPublicReadiness.includes('/app/outbox.md'), false);
  assert.equal(serializedPublicReadiness.includes('tmux://'), false);
});
