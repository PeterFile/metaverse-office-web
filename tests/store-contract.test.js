const assert = require('node:assert/strict');
const { mkdtemp, readFile, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createPrototypeStore } = require('../src/store/prototype-store');

async function createStoreFile() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-store-contract-'));
  return path.join(root, 'prototype-store.jsonl');
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
