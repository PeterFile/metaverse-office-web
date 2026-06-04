const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { mkdtemp, readFile, unlink, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const test = require('node:test');

const taskEvidenceSource = require('../src/collectors/task-evidence-source');
const { PrototypeStore, createPrototypeStore } = require('../src/store/prototype-store');

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

function createHermesRuntimeCollectorReport() {
  return {
    collected_at: '2026-03-09T18:07:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 1,
      heartbeat_count: 0,
      tmux_observed_count: 0,
      workspace_observed_count: 0,
      reboot_recommended_count: 0
    },
    evidence_coverage: {
      evidence_ref_count: 2,
      covered_agent_count: 1,
      low_confidence_agent_ids: [],
      source_kind_buckets: {
        workspace_file: 0,
        workspace_root: 0,
        tmux_observation: 0,
        hermes_profile: 1,
        hermes_session: 1
      },
      agent_items: [
        {
          agent_id: 'app-engineering',
          evidence_ref_count: 2,
          source_kinds: ['hermes_profile', 'hermes_session'],
          latest_evidence_at: '2026-03-09T18:06:45.000Z',
          confidence_level: 'high'
        }
      ]
    },
    runtime_source_evidence: {
      unmapped_tmux_sessions: [],
      unmapped_hermes_sources: [
        {
          source_kind: 'hermes_profile',
          evidence_ref: 'hermes://profile/unmapped-worker',
          profile_id: 'unmapped-worker',
          session_ref: null,
          observed_at: '2026-03-09T18:06:40.000Z',
          status: 'observed',
          degraded_reasons: [],
          source_provenance: {
            source_format: 'json_array',
            source_index: 0,
            source_input_ordinal: 2,
            source_file_ordinal: 3
          }
        }
      ]
    },
    items: [
      {
        agent_id: 'app-engineering',
        session_ref: '5-web3-app-engineering',
        evidence_refs: [
          'hermes://profile/app-profile',
          'hermes://session/5-web3-app-engineering'
        ],
        workspace_observations: [],
        tmux_observations: [],
        hermes_runtime_observations: [
          {
            source_kind: 'hermes_profile',
            agent_id: 'app-engineering',
            profile_id: 'app-profile',
            session_ref: null,
            evidence_ref: 'hermes://profile/app-profile',
            status: 'observed',
            last_observed_at: '2026-03-09T18:06:30.000Z',
            degraded_reasons: [],
            source_provenance: {
              source_format: 'json_array',
              source_index: 0,
              source_input_ordinal: 1,
              source_file_ordinal: 1
            },
            metadata: {
              noisy_runtime_payload: 'must not persist'
            }
          },
          {
            source_kind: 'hermes_session',
            agent_id: null,
            profile_id: null,
            session_ref: '5-web3-app-engineering',
            evidence_ref: 'hermes://session/5-web3-app-engineering',
            status: 'degraded',
            last_observed_at: '2026-03-09T18:06:45.000Z',
            degraded_reasons: ['Hermes session stale'],
            source_provenance: {
              source_format: 'jsonl',
              source_index: 2,
              line: 4,
              source_input_ordinal: 1,
              source_file_ordinal: 2
            },
            metadata: {
              noisy_runtime_payload: 'must not persist'
            }
          }
        ],
        source_health: {
          hermes_profile: {
            status: 'observed',
            profile_id: 'app-profile',
            evidence_ref: 'hermes://profile/app-profile',
            last_observed_at: '2026-03-09T18:06:30.000Z',
            degraded_reasons: []
          },
          hermes_session: {
            status: 'degraded',
            expected_session_ref: '5-web3-app-engineering',
            evidence_ref: 'hermes://session/5-web3-app-engineering',
            last_observed_at: '2026-03-09T18:06:45.000Z',
            degraded_reasons: ['Hermes session stale']
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
          received_at: '2026-03-09T18:07:00.000Z',
          current_state: 'coding',
          active_task: 'Verify Hermes runtime source persistence',
          last_meaningful_output_at: null,
          last_file_write_at: null,
          current_blocker: '',
          confidence_level: 'high',
          reboot_recommended: false
        }
      }
    ]
  };
}

test('agent evidence spine aggregates bounded safe projections with exact filters', async () => {
  const store = new PrototypeStore({ filePath: await createStoreFile() });
  await store.load();
  await store.appendCollectorReport(createCollectorReport());

  const spine = store.getAgentEvidenceSpine('app-engineering', {
    source_kind: 'workspace_file',
    output_candidate: 'true',
    newest_first: 'true',
    limit: '1'
  });

  assert.equal(spine.agent_id, 'app-engineering');
  assert.equal(spine.returned_limit, 1);
  assert.equal(spine.evidence_summary.total_count, 1);
  assert.equal(spine.evidence_summary.source_kind_buckets.workspace_file, 1);
  assert.deepEqual(spine.recent_evidence, [
    {
      observed_at: '2026-03-09T18:05:20.000Z',
      collected_at: '2026-03-09T18:06:00.000Z',
      source_kind: 'workspace_file',
      evidence_role: 'agent_output',
      source_status: 'degraded',
      output_candidate: true,
      collector_snapshot_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
      correlation_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
      unmapped: false
    }
  ]);
  assert.deepEqual(spine.source_gaps.items, [
    {
      observed_at: '2026-03-09T18:05:20.000Z',
      collected_at: '2026-03-09T18:06:00.000Z',
      agent_id: 'app-engineering',
      source_kind: 'workspace_file',
      evidence_role: 'agent_output',
      source_status: 'degraded',
      output_candidate: true,
      collector_snapshot_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
      correlation_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
      unmapped: false
    }
  ]);
  assert.equal(spine.source_health.agent_items.length, 1);
  assert.equal(spine.source_health.agent_items[0].agent_id, 'app-engineering');
  assert.equal(Object.hasOwn(spine.source_health, 'runtime_source_evidence'), false);

  const serialized = JSON.stringify(spine);
  assert.equal(serialized.includes('/tmp/store-contract'), false);
  assert.equal(serialized.includes('tmux://'), false);
  assert.equal(serialized.includes('hermes://'), false);
  assert.equal(serialized.includes('runtime_source_evidence'), false);
  assert.equal(serialized.includes('metadata'), false);
  assert.equal(serialized.includes('degraded_reasons'), false);
});

test('prototype store summarizes the canonical seven-agent evidence spine without assigning unmapped evidence', async () => {
  const store = new PrototypeStore({ filePath: await createStoreFile() });
  await store.load();
  await store.appendCollectorReport(createCollectorReport());
  await store.appendCollectorReport(createHermesRuntimeCollectorReport());

  const summary = store.getAgentEvidenceSpineSummary({
    output_candidate: 'false',
    newest_first: 'true',
    limit: '1'
  });

  assert.deepEqual(
    summary.agents.map((agent) => agent.agent_id),
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
  assert.equal(summary.agent_count, 7);
  assert.equal(summary.returned_limit, 1);
  assert.equal(summary.total_count, 4);
  assert.equal(summary.mapped_count, 3);
  assert.equal(summary.unmapped_count, 1);

  const appSummary = summary.agents.find((agent) => agent.agent_id === 'app-engineering');
  assert.equal(appSummary.evidence_count, 3);
  assert.equal(appSummary.source_kind_buckets.workspace_root, 1);
  assert.equal(appSummary.source_kind_buckets.workspace_file, 0);
  assert.equal(appSummary.source_kind_buckets.hermes_profile, 1);
  assert.equal(appSummary.source_kind_buckets.hermes_session, 1);
  assert.equal(appSummary.output_candidate_buckets.false, 3);
  assert.equal(appSummary.latest_observed_at, '2026-03-09T18:06:45.000Z');
  assert.equal(appSummary.latest_collected_at, '2026-03-09T18:07:00.000Z');

  assert.deepEqual(summary.unmapped_evidence_summary, {
    total_count: 1,
    source_kind_buckets: {
      workspace_root: 0,
      workspace_file: 0,
      tmux_observation: 0,
      hermes_profile: 1,
      hermes_session: 0,
      kanban_fixture: 0,
      linear_fixture: 0,
      slack_fixture: 0,
      task_fixture: 0
    },
    evidence_role_buckets: {
      workspace_presence: 0,
      inbound_task: 0,
      agent_output: 0,
      agent_plan: 0,
      runtime_activity: 0,
      runtime_presence: 0,
      runtime_unmapped: 1,
      task_reference: 0
    },
    source_status_buckets: {
      observed: 1,
      degraded: 0,
      missing: 0,
      error: 0
    },
    latest_observed_at: '2026-03-09T18:06:40.000Z',
    latest_collected_at: '2026-03-09T18:07:00.000Z'
  });

  assert.equal(
    summary.agents.reduce((total, agent) => total + agent.evidence_count, 0),
    summary.mapped_count
  );

  const serialized = JSON.stringify(summary);
  assert.equal(serialized.includes('evidence_id'), false);
  assert.equal(serialized.includes('evidence_ref'), false);
  assert.equal(serialized.includes('collector_snapshot_id'), false);
  assert.equal(serialized.includes('correlation_id'), false);
  assert.equal(serialized.includes('/tmp/store-contract'), false);
  assert.equal(serialized.includes('tmux://'), false);
  assert.equal(serialized.includes('hermes://'), false);
  assert.equal(serialized.includes('metadata'), false);
  assert.equal(serialized.includes('degraded_reasons'), false);
});

test('prototype store keeps non-seeded evidence out of canonical agent evidence summary', async () => {
  const store = new PrototypeStore({ filePath: await createStoreFile() });
  await store.load();
  const report = createCollectorReport();
  report.items[0].agent_id = 'unmapped';
  report.items[0].heartbeat.agent_id = 'unmapped';
  await store.appendCollectorReport(report);

  const summary = store.getAgentEvidenceSpineSummary();

  assert.equal(summary.agent_count, 7);
  assert.equal(summary.mapped_count, 0);
  assert.equal(summary.unmapped_count, 3);
  assert.equal(
    summary.agents.reduce((total, agent) => total + agent.evidence_count, 0),
    0
  );
  assert.deepEqual(
    summary.agents.map((agent) => agent.agent_id),
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

  const unmappedOnlySummary = store.getAgentEvidenceSpineSummary({ mapped: 'false' });
  assert.equal(unmappedOnlySummary.total_count, 3);
  assert.equal(unmappedOnlySummary.mapped_count, 0);
  assert.equal(unmappedOnlySummary.unmapped_count, 3);
  assert.equal(
    unmappedOnlySummary.agents.reduce((total, agent) => total + agent.evidence_count, 0),
    0
  );

  const mappedOnlySummary = store.getAgentEvidenceSpineSummary({ mapped: 'true' });
  assert.equal(mappedOnlySummary.total_count, 0);
  assert.equal(mappedOnlySummary.mapped_count, 0);
  assert.equal(mappedOnlySummary.unmapped_count, 0);
});

test('agent evidence source matrix keeps canonical agents stable and unmapped evidence separate', async () => {
  const store = new PrototypeStore({ filePath: await createStoreFile() });
  await store.load();
  await store.appendCollectorReport(createCollectorReport());
  await store.appendCollectorReport(createHermesRuntimeCollectorReport());

  const matrix = store.getAgentEvidenceSourceStatusMatrix({
    source_kind: 'hermes_profile',
    newest_first: 'true',
    limit: '1'
  });

  assert.deepEqual(
    matrix.agents.map((agent) => agent.agent_id),
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
  assert.equal(matrix.agent_count, 7);
  assert.equal(matrix.returned_limit, 1);
  assert.equal(matrix.total_count, 2);
  assert.equal(matrix.mapped_count, 1);
  assert.equal(matrix.unmapped_count, 1);

  const appMatrix = matrix.agents.find((agent) => agent.agent_id === 'app-engineering');
  assert.deepEqual(appMatrix.sources, [
    {
      source_kind: 'hermes_profile',
      evidence_count: 1,
      source_status_buckets: {
        observed: 1,
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
        runtime_presence: 1,
        runtime_unmapped: 0,
        task_reference: 0
      },
      output_candidate_buckets: {
        true: 0,
        false: 1
      },
      latest_observed_at: '2026-03-09T18:06:30.000Z',
      latest_collected_at: '2026-03-09T18:07:00.000Z'
    }
  ]);
  assert.deepEqual(matrix.unmapped_evidence_summary.sources, [
    {
      source_kind: 'hermes_profile',
      evidence_count: 1,
      source_status_buckets: {
        observed: 1,
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
        runtime_unmapped: 1,
        task_reference: 0
      },
      output_candidate_buckets: {
        true: 0,
        false: 1
      },
      latest_observed_at: '2026-03-09T18:06:40.000Z',
      latest_collected_at: '2026-03-09T18:07:00.000Z'
    }
  ]);

  assert.ok(
    matrix.agents.every((agent) =>
      agent.sources.every((source) => source.source_kind === 'hermes_profile')
    )
  );

  const serialized = JSON.stringify(matrix);
  assert.equal(serialized.includes('evidence_id'), false);
  assert.equal(serialized.includes('evidence_ref'), false);
  assert.equal(serialized.includes('collector_snapshot_id'), false);
  assert.equal(serialized.includes('correlation_id'), false);
  assert.equal(serialized.includes('/tmp/store-contract'), false);
  assert.equal(serialized.includes('tmux://'), false);
  assert.equal(serialized.includes('hermes://'), false);
  assert.equal(serialized.includes('metadata'), false);
  assert.equal(serialized.includes('degraded_reasons'), false);
});

test('agent evidence source matrix does not promote non-seeded agent evidence', async () => {
  const store = new PrototypeStore({ filePath: await createStoreFile() });
  await store.load();
  const report = createCollectorReport();
  report.items[0].agent_id = 'unmapped';
  report.items[0].heartbeat.agent_id = 'unmapped';
  await store.appendCollectorReport(report);

  const matrix = store.getAgentEvidenceSourceStatusMatrix({ mapped: 'false' });

  assert.equal(matrix.agent_count, 7);
  assert.equal(matrix.mapped_count, 0);
  assert.equal(matrix.unmapped_count, 3);
  assert.equal(
    matrix.agents.reduce(
      (total, agent) =>
        total + agent.sources.reduce((sourceTotal, source) => sourceTotal + source.evidence_count, 0),
      0
    ),
    0
  );
  assert.equal(matrix.unmapped_evidence_summary.total_count, 3);
});

test('agent evidence source matrix counts unknown unmapped source kinds without rendering them', async () => {
  const storeFile = await createStoreFile();
  const unknownSourceKind = 'tmux://secret/path';
  await writeFile(
    storeFile,
    [
      {
        kind: 'evidence_record',
        payload: {
          evidence_id: 'ev_unmapped_hermes_profile_1',
          agent_id: null,
          source_kind: 'hermes_profile',
          evidence_role: 'runtime_unmapped',
          evidence_ref: 'hermes://profile/unmapped',
          source_status: 'observed',
          output_candidate: false,
          observed_at: '2026-03-09T18:06:40.000Z',
          collected_at: '2026-03-09T18:07:00.000Z',
          collector_snapshot_id: 'collector-snapshot:2026-03-09T18:07:00.000Z',
          correlation_id: 'collector-snapshot:2026-03-09T18:07:00.000Z',
          degraded_reasons: [],
          metadata: {}
        }
      },
      {
        kind: 'evidence_record',
        payload: {
          evidence_id: 'ev_unmapped_unknown_source_kind_1',
          agent_id: null,
          source_kind: unknownSourceKind,
          evidence_role: 'runtime_unmapped',
          evidence_ref: '/tmp/source-matrix-secret.md',
          source_status: 'observed',
          output_candidate: false,
          observed_at: '2026-03-09T18:06:45.000Z',
          collected_at: '2026-03-09T18:07:00.000Z',
          collector_snapshot_id: 'collector-snapshot:2026-03-09T18:07:00.000Z',
          correlation_id: 'collector-snapshot:2026-03-09T18:07:00.000Z',
          degraded_reasons: [],
          metadata: {}
        }
      }
    ].map((record) => JSON.stringify(record)).join('\n') + '\n'
  );

  const store = await createPrototypeStore({ filePath: storeFile });
  const matrix = store.getAgentEvidenceSourceStatusMatrix({ mapped: 'false' });

  assert.equal(matrix.total_count, 2);
  assert.equal(matrix.mapped_count, 0);
  assert.equal(matrix.unmapped_count, 2);
  assert.equal(matrix.unmapped_evidence_summary.total_count, 2);
  assert.deepEqual(
    matrix.unmapped_evidence_summary.sources.map((source) => source.source_kind),
    ['hermes_profile']
  );
  assert.ok(
    matrix.agents.every((agent) =>
      agent.sources.every((source) => source.source_kind !== unknownSourceKind)
    )
  );
  assert.equal(JSON.stringify(matrix).includes(unknownSourceKind), false);
});

test('agent evidence spine returns null for unknown agents', async () => {
  const store = new PrototypeStore({ filePath: await createStoreFile() });
  await store.load();

  assert.equal(store.getAgentEvidenceSpine('missing-agent'), null);
});

function createTieTimestampCollectorReport(collectedAt) {
  const report = JSON.parse(JSON.stringify(createCollectorReport()));
  report.collected_at = collectedAt;
  report.items[0].workspace_observations[0].last_modified_at = '2026-03-09T18:05:00.000Z';
  report.items[0].tmux_observations[0].pane_activity_at = '2026-03-09T18:05:00.000Z';
  report.items[0].source_health.workspace_root.last_observed_at = '2026-03-09T18:05:00.000Z';
  report.items[0].source_health.workspace_files.last_observed_at = '2026-03-09T18:05:00.000Z';
  report.items[0].source_health.tmux_session.last_observed_at = '2026-03-09T18:05:00.000Z';
  return report;
}

class FailingCollectorBatchRecordLog {
  constructor({ failOnKind }) {
    this.failOnKind = failOnKind;
    this.records = [];
  }

  async loadRecords() {
    return this.records;
  }

  async appendRecord(record) {
    if (record.kind === this.failOnKind) {
      throw new Error(`injected append failure for ${record.kind}`);
    }

    this.records.push(record);
  }

  async appendRecords(records) {
    if (records.some((record) => record.kind === this.failOnKind)) {
      throw new Error(`injected append failure for ${this.failOnKind}`);
    }

    this.records.push(...records);
  }
}

function projectReplayContract(store) {
  const now = '2026-03-09T18:10:00.000Z';

  return {
    counts: store.getCounts(),
    appAgent: store.getAgentDetail('app-engineering', { limit: 5, now }),
    protocolAgent: store.getAgentDetail('protocol-engineering', { limit: 5, now }),
    latestCollectorReport: store.getLatestCollectorReport(),
    evidenceRecords: store.listEvidenceRecords(),
    evidenceRecordsSummary: store.getEvidenceRecordsSummary({ output_candidate: 'false', limit: 1 }),
    replayCheckpointSummary: store.getReplayCheckpointSummary(),
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
  assert.equal(
    afterReload.latestCollectorEvidenceCoverage.collector_snapshot_id,
    'collector-snapshot:2026-03-09T18:06:00.000Z'
  );
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

test('prototype store exposes sanitized replay checkpoint summary that survives reload', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });

  await store.appendEvent(createEvent());
  await store.appendHeartbeat(createHeartbeat());
  await store.appendCollectorReport(createCollectorReport());

  const summary = store.getReplayCheckpointSummary();
  assert.deepEqual(summary, {
    record_count: 9,
    record_kind_buckets: {
      event: 3,
      heartbeat: 2,
      evidence_record: 3,
      collector_snapshot: 1
    },
    agent_count: 7,
    event_count: 3,
    heartbeat_count: 2,
    evidence_record_count: 3,
    collector_snapshot_count: 1,
    latest_event: {
      event_id: 'evt_collector_app-engineering_state_change_observed_normal_2026-03-09T18_06_00_000Z',
      ts: '2026-03-09T18:06:00.000Z',
      agent_id: 'app-engineering',
      event_type: 'agent_state_changed',
      correlation_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
      source_kind: 'tmux_observation'
    },
    latest_heartbeat: {
      agent_id: 'app-engineering',
      received_at: '2026-03-09T18:06:00.000Z'
    },
    latest_evidence_record: {
      observed_at: '2026-03-09T18:05:30.000Z',
      collected_at: '2026-03-09T18:06:00.000Z',
      agent_id: 'app-engineering',
      source_kind: 'tmux_observation',
      evidence_role: 'runtime_activity',
      source_status: 'observed',
      output_candidate: true,
      collector_snapshot_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
      correlation_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
      unmapped: false
    },
    latest_collector_snapshot: {
      collector_snapshot_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
      collected_at: '2026-03-09T18:06:00.000Z',
      actor_id: 'team-lead',
      item_count: 1
    }
  });
  assert.equal(Object.hasOwn(summary.latest_evidence_record, 'evidence_id'), false);
  assert.equal(JSON.stringify(summary).includes('/tmp/store-contract'), false);
  assert.equal(JSON.stringify(summary).includes('store-contract'), false);
  assert.equal(JSON.stringify(summary).includes('tmux://'), false);
  assert.equal(JSON.stringify(summary).includes('5-web3-app-engineering'), false);

  const reloadedStore = await createPrototypeStore({ filePath: storeFile });
  assert.deepEqual(reloadedStore.getReplayCheckpointSummary(), summary);
});

test('prototype store exposes deterministic sanitized storage replay manifest', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });

  await store.appendEvent(createEvent());
  await store.appendHeartbeat(createHeartbeat());
  await store.appendCollectorReport(createCollectorReport());

  const manifest = store.getStorageReplayManifest();
  assert.deepEqual(manifest, {
    record_count: 9,
    record_kind_buckets: {
      event: 3,
      heartbeat: 2,
      evidence_record: 3,
      collector_snapshot: 1
    },
    evidence_summary: {
      evidence_record_count: 3,
      source_kind_buckets: {
        workspace_root: 1,
        workspace_file: 1,
        tmux_observation: 1
      },
      source_category_buckets: {
        workspace: 2,
        runtime: 1
      },
      evidence_role_buckets: {
        workspace_presence: 1,
        agent_output: 1,
        runtime_activity: 1
      },
      source_status_buckets: {
        observed: 2,
        degraded: 1
      },
      output_candidate_count: 2,
      unmapped_count: 0,
      latest_observed_at: '2026-03-09T18:05:30.000Z',
      latest_collected_at: '2026-03-09T18:06:00.000Z'
    },
    canonical_record_hash:
      'fa36a558fa37a6ac5e6b02f86374f65d7723af1baca8066348cac08d1367aad7'
  });
  assert.match(manifest.canonical_record_hash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(manifest).includes('/tmp/store-contract'), false);
  assert.equal(JSON.stringify(manifest).includes('store-contract'), false);
  assert.equal(JSON.stringify(manifest).includes('tmux://'), false);
  assert.equal(JSON.stringify(manifest).includes('Hermes'), false);
  assert.equal(JSON.stringify(manifest).includes('profile'), false);
  assert.equal(JSON.stringify(manifest).includes('session'), false);
  assert.equal(JSON.stringify(manifest).includes('ev_collector'), false);
  assert.equal(JSON.stringify(manifest).includes('metadata'), false);
  assert.equal(JSON.stringify(manifest).includes('degraded_reasons'), false);

  const reloadedStore = await createPrototypeStore({ filePath: storeFile });
  assert.deepEqual(reloadedStore.getStorageReplayManifest(), manifest);

  const makeRawManifestStore = async ({
    rawKind,
    evidenceRef,
    tmuxRef,
    metadataValue,
    localUserPath,
    localVolumePath,
    tokenValue,
    webhookValue
  }) => {
    const rawStoreFile = await createStoreFile();
    const records = [
      {
        kind: 'event',
        payload: {
          event_id: 'evt_storage_manifest_projection',
          ts: '2026-03-09T18:07:00.000Z',
          agent_id: 'app-engineering',
          event_type: 'review_started',
          correlation_id: 'corr-storage-manifest',
          source_kind: 'controller_event',
          evidence_refs: [evidenceRef, tmuxRef, localUserPath, localVolumePath],
          metadata: { canary: metadataValue, token: tokenValue, webhook: webhookValue }
        }
      },
      {
        kind: 'evidence_record',
        payload: {
          observed_at: '2026-03-09T18:07:10.000Z',
          collected_at: '2026-03-09T18:07:20.000Z',
          agent_id: 'app-engineering',
          source_kind: 'workspace_file',
          evidence_role: 'agent_output',
          source_status: 'degraded',
          output_candidate: true,
          collector_snapshot_id: 'collector-snapshot:2026-03-09T18:07:20.000Z',
          correlation_id: 'corr-storage-manifest',
          evidence_ref: evidenceRef,
          metadata: { canary: metadataValue, token: tokenValue, webhook: webhookValue },
          degraded_reasons: [tmuxRef, localUserPath, localVolumePath]
        }
      },
      {
        kind: 'collector_snapshot',
        payload: {
          collected_at: '2026-03-09T18:07:20.000Z',
          actor_id: 'team-lead',
          items: [
            {
              evidence_refs: [evidenceRef, tmuxRef, localUserPath, localVolumePath],
              source_health: {
                workspace_root: {
                  status: 'degraded',
                  path: localVolumePath,
                  degraded_reasons: [metadataValue, tokenValue, webhookValue]
                }
              }
            }
          ]
        }
      },
      {
        kind: rawKind,
        payload: {
          evidence_ref: evidenceRef,
          payload: { nested_path: localUserPath },
          metadata: { canary: metadataValue, token: tokenValue, webhook: webhookValue }
        }
      }
    ];
    await writeFile(rawStoreFile, records.map((record) => JSON.stringify(record)).join('\n') + '\n');
    return createPrototypeStore({ filePath: rawStoreFile });
  };

  const unsafeA = await makeRawManifestStore({
    rawKind: '/tmp/manifest-kind-a',
    evidenceRef: '/tmp/manifest-a/outbox.md',
    tmuxRef: 'tmux://manifest-a/0.1',
    metadataValue: 'metadata-a',
    localUserPath: '/Users/alice/manifest-a/secret.md',
    localVolumePath: '/Volumes/HDD/manifest-a/secret.md',
    tokenValue: 'token=manifest-a-secret',
    webhookValue: 'https://hooks.example.test/manifest-a'
  });
  const unsafeB = await makeRawManifestStore({
    rawKind: 'tmux://manifest-kind-b/0.1',
    evidenceRef: '/tmp/manifest-b/outbox.md',
    tmuxRef: 'tmux://manifest-b/0.1',
    metadataValue: 'metadata-b',
    localUserPath: '/Users/bob/manifest-b/secret.md',
    localVolumePath: '/Volumes/HDD/manifest-b/secret.md',
    tokenValue: 'token=manifest-b-secret',
    webhookValue: 'https://hooks.example.test/manifest-b'
  });
  const unsafeManifestA = unsafeA.getStorageReplayManifest();
  assert.deepEqual(unsafeManifestA.record_kind_buckets, {
    event: 1,
    evidence_record: 1,
    collector_snapshot: 1,
    unknown: 1
  });
  assert.deepEqual(unsafeManifestA.evidence_summary, {
    evidence_record_count: 1,
    source_kind_buckets: {
      workspace_file: 1
    },
    source_category_buckets: {
      workspace: 1
    },
    evidence_role_buckets: {
      agent_output: 1
    },
    source_status_buckets: {
      degraded: 1
    },
    output_candidate_count: 1,
    unmapped_count: 0,
    latest_observed_at: '2026-03-09T18:07:10.000Z',
    latest_collected_at: '2026-03-09T18:07:20.000Z'
  });
  assert.equal(unsafeB.getStorageReplayManifest().canonical_record_hash, unsafeManifestA.canonical_record_hash);
  const unsafeSerialized = JSON.stringify(unsafeManifestA);
  assert.equal(unsafeSerialized.includes('/tmp/manifest'), false);
  assert.equal(unsafeSerialized.includes('/Users/'), false);
  assert.equal(unsafeSerialized.includes('/Volumes/'), false);
  assert.equal(unsafeSerialized.includes('tmux'), false);
  assert.equal(unsafeSerialized.includes('tmux://manifest'), false);
  assert.equal(unsafeSerialized.includes('Hermes'), false);
  assert.equal(unsafeSerialized.includes('profile'), false);
  assert.equal(unsafeSerialized.includes('session'), false);
  assert.equal(unsafeSerialized.includes('metadata-a'), false);
  assert.equal(unsafeSerialized.includes('token='), false);
  assert.equal(unsafeSerialized.includes('webhook'), false);
  assert.equal(unsafeSerialized.includes('hooks.example.test'), false);
  assert.equal(unsafeSerialized.includes('evidence_ref'), false);
  assert.equal(unsafeSerialized.includes('payload'), false);
  assert.equal(unsafeSerialized.includes('degraded_reasons'), false);
});

test('JSONL prototype store reports storage index-health as not applicable', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });

  await store.appendEvent(createEvent());
  await store.appendHeartbeat(createHeartbeat());
  await store.appendCollectorReport(createCollectorReport());

  const health = await store.getStorageIndexHealth();
  assert.deepEqual(health, {
    backend: 'jsonl',
    status: 'ok',
    record_count: 9,
    record_index_count: null,
    record_evidence_ref_count: null,
    sidecar_status: 'not_applicable',
    record_kind_buckets: {
      event: 3,
      heartbeat: 2,
      evidence_record: 3,
      collector_snapshot: 1
    },
    latest_record_ts: '2026-03-09T18:06:00.000Z'
  });
  assert.equal(JSON.stringify(health).includes('/tmp/store-contract'), false);
  assert.equal(JSON.stringify(health).includes('store-contract'), false);
  assert.equal(JSON.stringify(health).includes('tmux://'), false);
  assert.equal(JSON.stringify(health).includes('payload'), false);
  assert.equal(JSON.stringify(health).includes('metadata'), false);
});

test('JSONL storage index-health buckets unknown record kinds without leaking raw semantics', async () => {
  const storeFile = await createStoreFile();
  const records = [
    {
      kind: 'event',
      payload: createEvent()
    },
    {
      kind: 'agent_productivity:/tmp/index-health-kind',
      payload: {
        ts: '2026-03-09T18:07:00.000Z',
        evidence_ref: 'tmux://index-health/0.1',
        metadata: {
          token: 'index-health-secret',
          webhook: 'https://hooks.example.test/index-health',
          liveness: 'observed',
          productivity: 'active',
          severity: 'green'
        }
      }
    }
  ];
  await writeFile(storeFile, records.map((record) => JSON.stringify(record)).join('\n') + '\n');
  const store = await createPrototypeStore({ filePath: storeFile });

  const health = await store.getStorageIndexHealth();
  assert.deepEqual(health, {
    backend: 'jsonl',
    status: 'ok',
    record_count: 2,
    record_index_count: null,
    record_evidence_ref_count: null,
    sidecar_status: 'not_applicable',
    record_kind_buckets: {
      event: 1,
      unknown: 1
    },
    latest_record_ts: '2026-03-09T18:04:00.000Z'
  });
  const serialized = JSON.stringify(health);
  for (const unsafeFragment of [
    '/tmp',
    'tmux://',
    'payload',
    'metadata',
    'token',
    'webhook',
    'liveness',
    'productivity',
    'severity'
  ]) {
    assert.equal(serialized.includes(unsafeFragment), false, unsafeFragment);
  }
});

test('prototype store exposes bounded sanitized replay checkpoint log that survives reload', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });

  await store.appendEvent(createEvent());
  await store.appendHeartbeat(createHeartbeat());
  await store.appendCollectorReport(createCollectorReport());

  const log = store.listReplayCheckpointLog({ limit: '3' });
  assert.deepEqual(log, [
    {
      append_index: 7,
      record_kind: 'evidence_record',
      checkpoint: {
        observed_at: '2026-03-09T18:05:20.000Z',
        collected_at: '2026-03-09T18:06:00.000Z',
        agent_id: 'app-engineering',
        source_kind: 'workspace_file',
        evidence_role: 'agent_output',
        source_status: 'degraded',
        output_candidate: true,
        collector_snapshot_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
        correlation_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
        unmapped: false
      }
    },
    {
      append_index: 8,
      record_kind: 'evidence_record',
      checkpoint: {
        observed_at: '2026-03-09T18:05:30.000Z',
        collected_at: '2026-03-09T18:06:00.000Z',
        agent_id: 'app-engineering',
        source_kind: 'tmux_observation',
        evidence_role: 'runtime_activity',
        source_status: 'observed',
        output_candidate: true,
        collector_snapshot_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
        correlation_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
        unmapped: false
      }
    },
    {
      append_index: 9,
      record_kind: 'collector_snapshot',
      checkpoint: {
        collector_snapshot_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
        collected_at: '2026-03-09T18:06:00.000Z',
        actor_id: 'team-lead',
        item_count: 1
      }
    }
  ]);
  assert.equal(JSON.stringify(log).includes('/tmp/store-contract'), false);
  assert.equal(JSON.stringify(log).includes('store-contract'), false);
  assert.equal(JSON.stringify(log).includes('tmux://'), false);
  assert.equal(JSON.stringify(log).includes('5-web3-app-engineering'), false);

  const reloadedStore = await createPrototypeStore({ filePath: storeFile });
  assert.deepEqual(reloadedStore.listReplayCheckpointLog({ limit: '3' }), log);
});

test('prototype store bounds replay checkpoint log record kinds', async () => {
  const storeFile = await createStoreFile();
  await writeFile(
    storeFile,
    `${JSON.stringify({
      kind: '/tmp/store-contract/raw-kind',
      payload: {
        evidence_ref: 'tmux://5-web3-app-engineering/0.1',
        metadata: {
          local_path: '/tmp/store-contract/raw-payload'
        }
      }
    })}\n`
  );

  const store = await createPrototypeStore({ filePath: storeFile });
  assert.deepEqual(store.listReplayCheckpointLog({ limit: '1' }), [
    {
      append_index: 1,
      record_kind: 'unknown',
      checkpoint: null
    }
  ]);
});

test('prototype store filters replay checkpoint log by exact evidence provenance before limit', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });

  await store.appendEvent(createEvent());
  await store.appendHeartbeat(createHeartbeat());
  await store.appendCollectorReport(createCollectorReport());

  const tmuxRecord = store
    .listEvidenceRecords({ source_kind: 'tmux_observation', limit: '10' })
    .find((record) => record.agent_id === 'app-engineering');
  assert.ok(tmuxRecord);

  const byEvidenceId = store.listReplayCheckpointLog({
    evidence_id: tmuxRecord.evidence_id,
    limit: '1'
  });
  assert.deepEqual(byEvidenceId, [
    {
      append_index: 8,
      record_kind: 'evidence_record',
      checkpoint: {
        observed_at: '2026-03-09T18:05:30.000Z',
        collected_at: '2026-03-09T18:06:00.000Z',
        agent_id: 'app-engineering',
        source_kind: 'tmux_observation',
        evidence_role: 'runtime_activity',
        source_status: 'observed',
        output_candidate: true,
        collector_snapshot_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
        correlation_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
        unmapped: false
      }
    }
  ]);
  assert.equal(Object.hasOwn(byEvidenceId[0].checkpoint, 'evidence_id'), false);

  const bySourceKind = store.listReplayCheckpointLog({
    source_kind: 'workspace_file',
    limit: '1'
  });
  assert.deepEqual(
    bySourceKind.map((item) => [item.append_index, item.checkpoint.source_kind]),
    [[7, 'workspace_file']]
  );

  const bySnapshotAndCorrelation = store.listReplayCheckpointLog({
    collector_snapshot_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
    correlation_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
    record_kind: 'evidence_record',
    limit: '2'
  });
  assert.deepEqual(
    bySnapshotAndCorrelation.map((item) => [item.append_index, item.checkpoint.source_kind]),
    [
      [7, 'workspace_file'],
      [8, 'tmux_observation']
    ]
  );

  assert.deepEqual(
    store.listReplayCheckpointLog({
      evidence_id: tmuxRecord.evidence_id.slice(0, -2),
      limit: '10'
    }),
    []
  );
});

test('prototype store exposes bounded replay window around selected evidence', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });
  const leakCanaries = [
    '/tmp/store-contract',
    'tmux://5-web3-app-engineering/0.1',
    'collector-snapshot:2026-03-09T18:06:00.000Z',
    'corr-store-contract',
    'metadata',
    'payload',
    'token=replay-window',
    'https://hooks.slack.com/services/replay-window'
  ];
  const report = createCollectorReport();
  report.items[0].evidence_refs.push(
    'token=replay-window',
    'https://hooks.slack.com/services/replay-window'
  );

  await store.appendEvent(createEvent());
  await store.appendHeartbeat(createHeartbeat());
  await store.appendCollectorReport(report);

  const evidenceRecord = store.listEvidenceRecords({
    evidence_ref: '/tmp/store-contract/outbox.md'
  })[0];
  const replayWindow = store.getEvidenceReplayWindow(evidenceRecord.evidence_id);

  assert.equal(store.getEvidenceReplayWindow('missing-evidence-id'), null);
  assert.equal(replayWindow.center.evidence_id, evidenceRecord.evidence_id);
  assert.deepEqual(replayWindow.window, { before: 2, after: 2 });
  assert.deepEqual(
    replayWindow.before.map((item) => item.append_index),
    [replayWindow.center.append_index - 2, replayWindow.center.append_index - 1]
  );
  assert.deepEqual(
    replayWindow.after.map((item) => item.append_index),
    [replayWindow.center.append_index + 1, replayWindow.center.append_index + 2]
  );
  assert.deepEqual(replayWindow.center.source_summary, {
    kind: 'workspace_file',
    status: 'degraded',
    role: 'agent_output',
    output_candidate: true,
    mapped: true,
    time: {
      observed_at: '2026-03-09T18:05:20.000Z',
      collected_at: '2026-03-09T18:06:00.000Z'
    }
  });

  const capped = store.getEvidenceReplayWindow(evidenceRecord.evidence_id, {
    before: '99',
    after: '99'
  });
  assert.equal(capped.window.before, 10);
  assert.equal(capped.window.after, 10);
  assert.equal(capped.before.length <= 10, true);
  assert.equal(capped.after.length <= 10, true);

  const serialized = JSON.stringify(replayWindow);
  assert.equal(serialized.includes('evidence_ref'), false);
  assert.equal(serialized.includes('collector_snapshot_id'), false);
  assert.equal(serialized.includes('correlation_id'), false);
  assert.equal(serialized.includes('evt_store_contract_review_started'), false);
  assert.equal(serialized.includes('review_started'), false);
  assert.equal(serialized.includes('controller_event'), false);
  assert.equal(serialized.includes('degraded_reasons'), false);
  for (const canary of leakCanaries) {
    assert.equal(serialized.includes(canary), false, canary);
  }
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

test('JSONL prototype store replays canonical task evidence records as read-only evidence', async () => {
  const storeFile = await createStoreFile();
  const taskEvidence = taskEvidenceSource.projectTaskEvidenceRecords(
    [
      {
        task_ref: 'TASK-129',
        source_kind: 'kanban_fixture',
        observed_at: '2026-05-20T01:02:03.000Z',
        correlation_id: 'corr-task-129',
        agent_id: 'app-engineering',
        title: '/tmp/store-contract/raw-task-title'
      }
    ],
    {
      collected_at: '2026-05-20T01:04:00.000Z',
      collector_snapshot_id: 'task-evidence:2026-05-20T01:04:00.000Z'
    }
  );

  await writeFile(
    storeFile,
    `${JSON.stringify({ kind: 'evidence_record', payload: taskEvidence.records[0] })}\n`
  );

  const store = await createPrototypeStore({ filePath: storeFile });
  const records = store.listEvidenceRecords({ source_kind: 'kanban_fixture' });

  assert.deepEqual(records, taskEvidence.records);
  assert.deepEqual(store.getCounts(), {
    agent_count: 7,
    event_count: 0,
    heartbeat_count: 0
  });
  assert.deepEqual(store.getEvidenceRecordsSummary({ evidence_role: 'task_reference' }), {
    total_count: 1,
    returned_limit: 50,
    mapped_count: 1,
    unmapped_count: 0,
    output_candidate_buckets: {
      true: 0,
      false: 1
    },
    source_kind_buckets: {
      workspace_root: 0,
      workspace_file: 0,
      tmux_observation: 0,
      hermes_profile: 0,
      hermes_session: 0,
      kanban_fixture: 1,
      linear_fixture: 0,
      slack_fixture: 0,
      task_fixture: 0
    },
    evidence_role_buckets: {
      workspace_presence: 0,
      inbound_task: 0,
      agent_output: 0,
      agent_plan: 0,
      runtime_activity: 0,
      runtime_presence: 0,
      runtime_unmapped: 0,
      task_reference: 1
    },
    source_status_buckets: {
      observed: 1,
      degraded: 0,
      missing: 0,
      error: 0
    },
    collector_snapshot_id_buckets: {
      'task-evidence:2026-05-20T01:04:00.000Z': 1
    },
    first_observed_at: '2026-05-20T01:02:03.000Z',
    last_observed_at: '2026-05-20T01:02:03.000Z',
    first_collected_at: '2026-05-20T01:04:00.000Z',
    last_collected_at: '2026-05-20T01:04:00.000Z'
  });
});

test('input-proof summary only exposes bounded proof counts and ordinal buckets', async () => {
  const storeFile = await createStoreFile();
  const unsafeRecord = {
    evidence_id: 'ev_input_proof_unsafe',
    observed_at: '2026-05-20T01:02:03.000Z',
    collected_at: '2026-05-20T01:04:00.000Z',
    agent_id: 'app-engineering',
    source_kind: 'hermes_session',
    evidence_ref: 'hermes://session/raw-secret-session',
    evidence_role: 'runtime_presence',
    source_status: 'observed',
    output_candidate: false,
    collector_snapshot_id: 'collector-snapshot:2026-05-20T01:04:00.000Z',
    correlation_id: 'collector-snapshot:2026-05-20T01:04:00.000Z',
    degraded_reasons: ['raw degraded reason'],
    metadata: {
      session_ref: 'raw-secret-session',
      local_path: '/tmp/input-proof-secret',
      token: 'token=input-proof-secret',
      source_provenance: {
        source_format: 'jsonl',
        source_index: 2,
        line: 7,
        source_input_ordinal: 3,
        source_file_ordinal: 4,
        raw_path: '/tmp/input-proof-secret.jsonl'
      }
    }
  };
  const noProofRecord = {
    ...unsafeRecord,
    evidence_id: 'ev_input_proof_missing',
    evidence_ref: '/tmp/input-proof-secret/no-proof.md',
    source_kind: 'workspace_file',
    evidence_role: 'agent_output',
    metadata: {
      local_path: '/tmp/input-proof-secret/no-proof.md'
    }
  };

  await writeFile(
    storeFile,
    [
      { kind: 'evidence_record', payload: unsafeRecord },
      { kind: 'evidence_record', payload: noProofRecord }
    ]
      .map((record) => JSON.stringify(record))
      .join('\n') + '\n'
  );

  const store = await createPrototypeStore({ filePath: storeFile });
  const summary = store.getEvidenceInputProofSummary({ evidence_ref: unsafeRecord.evidence_ref });

  assert.deepEqual(summary, {
    total_count: 1,
    returned_limit: 50,
    proof_count: 1,
    missing_proof_count: 0,
    source_format_buckets: {
      json_array: 0,
      jsonl: 1
    },
    source_index_buckets: {
      '2': 1
    },
    line_buckets: {
      '7': 1
    },
    source_input_ordinal_buckets: {
      '3': 1
    },
    source_file_ordinal_buckets: {
      '4': 1
    }
  });

  const serialized = JSON.stringify(summary);
  for (const unsafeFragment of [
    'evidence_id',
    'evidence_ref',
    'metadata',
    'degraded_reasons',
    '/tmp/input-proof-secret',
    'hermes://',
    'raw-secret-session',
    'token=input-proof-secret'
  ]) {
    assert.equal(serialized.includes(unsafeFragment), false, unsafeFragment);
  }

  assert.deepEqual(store.getEvidenceInputProofSummary({ evidence_id: 'missing', limit: 2 }), {
    total_count: 0,
    returned_limit: 2,
    proof_count: 0,
    missing_proof_count: 0,
    source_format_buckets: {
      json_array: 0,
      jsonl: 0
    },
    source_index_buckets: {},
    line_buckets: {},
    source_input_ordinal_buckets: {},
    source_file_ordinal_buckets: {}
  });
});

test('prototype store does not expose half collector snapshots when a derived append fails', async () => {
  const recordLog = new FailingCollectorBatchRecordLog({ failOnKind: 'evidence_record' });
  const store = new PrototypeStore({
    filePath: '/tmp/failing-collector-batch.jsonl',
    recordLog
  });
  await store.load();
  await store.appendEvent(createEvent());

  const beforeCounts = store.getCounts();
  const beforeEvents = store.listEvents({ limit: 10 });

  await assert.rejects(
    store.appendCollectorReport(createCollectorReport()),
    /injected append failure for evidence_record/
  );

  assert.deepEqual(store.getCounts(), beforeCounts);
  assert.deepEqual(store.listEvents({ limit: 10 }), beforeEvents);
  assert.deepEqual(store.listEvidenceRecords(), []);
  assert.equal(store.getLatestCollectorReport(), null);
  assert.equal(recordLog.records.filter((record) => record.kind === 'evidence_record').length, 0);
  assert.equal(recordLog.records.filter((record) => record.kind === 'collector_snapshot').length, 0);
});

test('prototype store persists Hermes runtime source facts as read-only evidence records', async () => {
  const jsonlStoreFile = await createStoreFile();
  const sqliteStoreFile = await createSqliteStoreFile();
  const jsonlStore = await createPrototypeStore({ filePath: jsonlStoreFile });
  const sqliteStore = await createPrototypeStore({ sqliteFilePath: sqliteStoreFile });
  const report = createHermesRuntimeCollectorReport();

  await jsonlStore.appendEvent(createEvent());
  await jsonlStore.appendHeartbeat(createHeartbeat());
  await jsonlStore.appendCollectorReport(report);
  await sqliteStore.appendEvent(createEvent());
  await sqliteStore.appendHeartbeat(createHeartbeat());
  await sqliteStore.appendCollectorReport(report);

  assert.deepEqual(jsonlStore.getCounts(), {
    agent_count: 7,
    event_count: 1,
    heartbeat_count: 1
  });

  const hermesRecords = jsonlStore.listEvidenceRecords({
    evidence_role: 'runtime_presence'
  });
  assert.deepEqual(
    hermesRecords.map((record) => record.evidence_ref),
    ['hermes://profile/app-profile', 'hermes://session/5-web3-app-engineering']
  );
  assert.deepEqual(
    hermesRecords.map((record) => record.source_kind),
    ['hermes_profile', 'hermes_session']
  );
  assert.deepEqual(
    hermesRecords.map((record) => record.output_candidate),
    [false, false]
  );
  assert.deepEqual(
    hermesRecords.map((record) => record.agent_id),
    ['app-engineering', 'app-engineering']
  );
  assert.equal(hermesRecords[0].observed_at, '2026-03-09T18:06:30.000Z');
  assert.equal(hermesRecords[1].source_status, 'degraded');
  assert.deepEqual(hermesRecords[1].degraded_reasons, ['Hermes session stale']);
  assert.deepEqual(hermesRecords[0].metadata, {
    profile_id: 'app-profile',
    session_ref: null,
    source_health_key: 'hermes_profile',
    source_provenance: {
      source_format: 'json_array',
      source_index: 0,
      source_input_ordinal: 1,
      source_file_ordinal: 1
    }
  });
  assert.equal(Object.hasOwn(hermesRecords[0].metadata, 'noisy_runtime_payload'), false);
  assert.equal(Object.hasOwn(hermesRecords[0], 'noisy_runtime_payload'), false);

  const unmappedRecords = jsonlStore.listEvidenceRecords({
    evidence_role: 'runtime_unmapped',
    source_kind: 'hermes_profile'
  });
  assert.equal(unmappedRecords.length, 1);
  assert.equal(unmappedRecords[0].agent_id, null);
  assert.equal(unmappedRecords[0].output_candidate, false);
  assert.deepEqual(unmappedRecords[0].metadata, {
    profile_id: 'unmapped-worker',
    session_ref: null,
    source_health_key: 'runtime_source_evidence.unmapped_hermes_sources',
    source_provenance: {
      source_format: 'json_array',
      source_index: 0,
      source_input_ordinal: 2,
      source_file_ordinal: 3
    }
  });

  assert.equal(
    jsonlStore.getLatestCollectorSourceHealth({ source_kind: 'hermes_profile' }).summary
      .source_kind_buckets.hermes_profile.observed,
    1
  );
  assert.equal(
    jsonlStore.getLatestCollectorSourceHealth({ source_kind: 'hermes_session' }).agent_items[0]
      .source_health.hermes_session.status,
    'degraded'
  );
  assert.deepEqual(
    jsonlStore.getLatestCollectorSourceHealth().runtime_source_evidence.unmapped_hermes_sources,
    [
      {
        source_kind: 'hermes_profile',
        status: 'observed',
        observed_count: 0,
        last_observed_at: '2026-03-09T18:06:40.000Z'
      }
    ]
  );
  assert.equal(
    jsonlStore.getLatestCollectorSourceHealth().agent_items[0].latest_evidence_at,
    '2026-03-09T18:06:45.000Z'
  );
  assert.deepEqual(jsonlStore.getLatestCollectorEvidenceCoverage().source_kind_buckets, {
    workspace_file: 0,
    workspace_root: 0,
    tmux_observation: 0,
    hermes_profile: 1,
    hermes_session: 1
  });

  const reloadedJsonlStore = await createPrototypeStore({ filePath: jsonlStoreFile });
  const reloadedSqliteStore = await createPrototypeStore({ sqliteFilePath: sqliteStoreFile });
  assert.deepEqual(reloadedJsonlStore.listEvidenceRecords(), jsonlStore.listEvidenceRecords());
  assert.deepEqual(projectReplayContract(reloadedSqliteStore), projectReplayContract(reloadedJsonlStore));

  const records = (await readFile(jsonlStoreFile, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(records.filter((record) => record.kind === 'evidence_record').length, 3);
});

test('prototype store persists task evidence observations as bounded read-only evidence records', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });
  const report = createCollectorReport();

  report.items[0].evidence_refs.push('task://kanban_fixture/TASK-200');
  report.items[0].task_evidence_observations = [
    {
      status: 'observed',
      task_ref: 'TASK-200',
      source_kind: 'kanban_fixture',
      observed_at: '2026-05-20T01:00:00.000Z',
      correlation_id: 'corr-task',
      agent_id: 'app-engineering',
      evidence_ref: 'task://kanban_fixture/TASK-200',
      fact_id: 'fixture-row-200',
      source_index: 0,
      source_provenance: {
        source_format: 'json_array',
        source_index: 0,
        source_input_ordinal: 1,
        source_file_ordinal: 1
      },
      local_path: '/tmp/task-evidence-secret',
      raw_payload: 'token=task-secret'
    }
  ];
  report.runtime_source_evidence.unmapped_task_evidence = [
    {
      status: 'observed',
      task_ref: 'TASK-201',
      source_kind: 'linear_fixture',
      observed_at: '2026-05-20T01:01:00.000Z',
      correlation_id: 'corr-unmapped',
      evidence_ref: 'task://linear_fixture/TASK-201',
      source_provenance: {
        source_format: 'jsonl',
        source_index: 0,
        line: 1,
        source_input_ordinal: 1,
        source_file_ordinal: 1
      },
      local_path: '/tmp/task-evidence-unmapped-secret',
      raw_payload: 'token=unmapped-task-secret'
    }
  ];

  await store.appendCollectorReport(report);

  const latestReport = store.getLatestCollectorReport();
  assert.deepEqual(latestReport.items[0].task_evidence_observations, [
    {
      status: 'observed',
      task_ref: 'TASK-200',
      source_kind: 'kanban_fixture',
      observed_at: '2026-05-20T01:00:00.000Z',
      correlation_id: 'corr-task',
      agent_id: 'app-engineering',
      evidence_ref: 'task://kanban_fixture/TASK-200',
      fact_id: 'fixture-row-200',
      source_index: 0,
      source_provenance: {
        source_format: 'json_array',
        source_index: 0,
        source_input_ordinal: 1,
        source_file_ordinal: 1
      }
    }
  ]);
  assert.deepEqual(latestReport.runtime_source_evidence.unmapped_task_evidence, [
    {
      status: 'observed',
      task_ref: 'TASK-201',
      source_kind: 'linear_fixture',
      observed_at: '2026-05-20T01:01:00.000Z',
      correlation_id: 'corr-unmapped',
      evidence_ref: 'task://linear_fixture/TASK-201',
      source_provenance: {
        source_format: 'jsonl',
        source_index: 0,
        line: 1,
        source_input_ordinal: 1,
        source_file_ordinal: 1
      }
    }
  ]);
  assert.equal(JSON.stringify(latestReport).includes('/tmp/task-evidence-secret'), false);
  assert.equal(JSON.stringify(latestReport).includes('token='), false);

  const sourceHealth = store.getLatestCollectorSourceHealth();
  assert.deepEqual(sourceHealth.runtime_source_evidence.unmapped_task_evidence, [
    {
      source_kind: 'linear_fixture',
      status: 'observed',
      observed_count: 1,
      latest_observed_at: '2026-05-20T01:01:00.000Z'
    }
  ]);
  assert.deepEqual(
    store.getLatestCollectorSourceHealth({ source_kind: 'linear_fixture' }).runtime_source_evidence
      .unmapped_task_evidence,
    [
      {
        source_kind: 'linear_fixture',
        status: 'observed',
        observed_count: 1,
        latest_observed_at: '2026-05-20T01:01:00.000Z'
      }
    ]
  );
  assert.deepEqual(
    store.getLatestCollectorSourceHealth({ source_kind: 'kanban_fixture' }).runtime_source_evidence
      .unmapped_task_evidence,
    []
  );
  assert.deepEqual(
    store.getLatestCollectorSourceHealth({ status: 'missing' }).runtime_source_evidence
      .unmapped_task_evidence,
    []
  );
  const serializedSourceHealth = JSON.stringify(sourceHealth.runtime_source_evidence);
  assert.equal(serializedSourceHealth.includes('task://linear_fixture/TASK-201'), false);
  assert.equal(serializedSourceHealth.includes('TASK-201'), false);
  assert.equal(serializedSourceHealth.includes('corr-unmapped'), false);
  assert.equal(serializedSourceHealth.includes('/tmp/task-evidence-unmapped-secret'), false);
  assert.equal(serializedSourceHealth.includes('token='), false);

  const taskRecords = store.listEvidenceRecords({ evidence_role: 'task_reference' });
  assert.deepEqual(
    taskRecords.map((record) => ({
      agent_id: record.agent_id,
      source_kind: record.source_kind,
      evidence_ref: record.evidence_ref,
      evidence_role: record.evidence_role,
      source_status: record.source_status,
      output_candidate: record.output_candidate,
      correlation_id: record.correlation_id,
      observed_at: record.observed_at,
      metadata: record.metadata
    })),
    [
      {
        agent_id: 'app-engineering',
        source_kind: 'kanban_fixture',
        evidence_ref: 'task://kanban_fixture/TASK-200',
        evidence_role: 'task_reference',
        source_status: 'observed',
        output_candidate: false,
        correlation_id: 'corr-task',
        observed_at: '2026-05-20T01:00:00.000Z',
        metadata: {
          task_ref: 'TASK-200',
          source_index: 0,
          source_health_key: 'task_evidence',
          fact_id: 'fixture-row-200',
          source_provenance: {
            source_format: 'json_array',
            source_index: 0,
            source_input_ordinal: 1,
            source_file_ordinal: 1
          }
        }
      },
      {
        agent_id: null,
        source_kind: 'linear_fixture',
        evidence_ref: 'task://linear_fixture/TASK-201',
        evidence_role: 'task_reference',
        source_status: 'observed',
        output_candidate: false,
        correlation_id: 'corr-unmapped',
        observed_at: '2026-05-20T01:01:00.000Z',
        metadata: {
          task_ref: 'TASK-201',
          source_index: 0,
          source_health_key: 'runtime_source_evidence.unmapped_task_evidence',
          source_provenance: {
            source_format: 'jsonl',
            source_index: 0,
            line: 1,
            source_input_ordinal: 1,
            source_file_ordinal: 1
          }
        }
      }
    ]
  );
  const bundle = store.getEvidenceProvenanceBundle(taskRecords[0].evidence_id);
  assert.deepEqual(bundle.input_proof, {
    source_format: 'json_array',
    source_index: 0,
    source_input_ordinal: 1,
    source_file_ordinal: 1
  });
  assert.equal(JSON.stringify(bundle).includes('source_provenance'), false);
  assert.equal(JSON.stringify(bundle).includes('metadata'), false);
  assert.equal(JSON.stringify(taskRecords).includes('/tmp/task-evidence-secret'), false);
  assert.equal(JSON.stringify(taskRecords).includes('token='), false);
  assert.equal(store.getEvidenceRecordsSummary().source_kind_buckets.kanban_fixture, 1);
  assert.equal(store.getEvidenceRecordsSummary().source_kind_buckets.linear_fixture, 1);
  assert.equal(store.getEvidenceRecordsSummary({ mapped: 'false' }).unmapped_count, 1);
  assert.deepEqual(store.listRuntimeSourceGaps({ source_kind: 'linear_fixture' }), []);
});

test('prototype store sanitizes unsafe task evidence identifiers and warnings before persistence', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });
  const report = createCollectorReport();

  report.items[0].task_evidence_observations = [
    {
      status: 'degraded',
      task_ref: 'TASK-202',
      source_kind: 'kanban_fixture',
      observed_at: '2026-05-20T01:02:00.000Z',
      correlation_id: 'corr-safe-202',
      fact_id: 'github_pat_unsafeFactIdCanary',
      warnings: [
        '/tmp/private/token=unsafe-warning',
        'agent_id suppressed',
        'https://hooks.slack.com/services/unsafe-warning'
      ]
    },
    {
      status: 'observed',
      task_ref: 'ghp_unsafeTaskRefCanary',
      source_kind: 'kanban_fixture',
      observed_at: '2026-05-20T01:03:00.000Z',
      correlation_id: 'corr-unsafe-task-ref'
    },
    {
      status: 'observed',
      task_ref: 'TASK-203',
      source_kind: 'linear_fixture',
      observed_at: '2026-05-20T01:04:00.000Z',
      correlation_id: 'sk-1234567890abcdef'
    }
  ];
  report.runtime_source_evidence.unmapped_task_evidence = [
    {
      status: 'degraded',
      task_ref: 'TASK-204',
      source_kind: 'slack_fixture',
      observed_at: '2026-05-20T01:05:00.000Z',
      correlation_id: 'corr-safe-204',
      fact_id: 'xoxb-unsafeFactIdCanary',
      degraded_reasons: ['token=unsafe-degraded-reason', 'agent_id suppressed']
    }
  ];

  await store.appendCollectorReport(report);

  const latestReport = store.getLatestCollectorReport();
  assert.deepEqual(latestReport.items[0].task_evidence_observations, [
    {
      status: 'degraded',
      task_ref: 'TASK-202',
      source_kind: 'kanban_fixture',
      observed_at: '2026-05-20T01:02:00.000Z',
      correlation_id: 'corr-safe-202',
      agent_id: 'app-engineering',
      evidence_ref: 'task://kanban_fixture/TASK-202',
      warnings: ['agent_id suppressed']
    }
  ]);
  assert.deepEqual(latestReport.runtime_source_evidence.unmapped_task_evidence, [
    {
      status: 'degraded',
      task_ref: 'TASK-204',
      source_kind: 'slack_fixture',
      observed_at: '2026-05-20T01:05:00.000Z',
      correlation_id: 'corr-safe-204',
      evidence_ref: 'task://slack_fixture/TASK-204',
      warnings: ['agent_id suppressed']
    }
  ]);

  const taskRecords = store
    .listEvidenceRecords({ evidence_role: 'task_reference' })
    .filter((record) => ['kanban_fixture', 'slack_fixture'].includes(record.source_kind));
  assert.deepEqual(
    taskRecords.map((record) => ({
      source_kind: record.source_kind,
      evidence_ref: record.evidence_ref,
      correlation_id: record.correlation_id,
      degraded_reasons: record.degraded_reasons,
      metadata: record.metadata
    })),
    [
      {
        source_kind: 'kanban_fixture',
        evidence_ref: 'task://kanban_fixture/TASK-202',
        correlation_id: 'corr-safe-202',
        degraded_reasons: ['agent_id suppressed'],
        metadata: {
          task_ref: 'TASK-202',
          source_index: 0,
          source_health_key: 'task_evidence',
          warnings: ['agent_id suppressed']
        }
      },
      {
        source_kind: 'slack_fixture',
        evidence_ref: 'task://slack_fixture/TASK-204',
        correlation_id: 'corr-safe-204',
        degraded_reasons: ['agent_id suppressed'],
        metadata: {
          task_ref: 'TASK-204',
          source_index: 0,
          source_health_key: 'runtime_source_evidence.unmapped_task_evidence',
          warnings: ['agent_id suppressed']
        }
      }
    ]
  );
  assert.deepEqual(store.listRuntimeSourceGaps({ source_kind: 'kanban_fixture' }), []);
  assert.deepEqual(store.listRuntimeSourceGaps({ source_kind: 'slack_fixture' }), []);

  const serialized = JSON.stringify({ latestReport, taskRecords });
  for (const canary of [
    'github_pat_',
    'ghp_unsafeTaskRefCanary',
    'sk-1234567890abcdef',
    'xoxb-',
    '/tmp/private',
    'token=',
    'hooks.slack.com'
  ]) {
    assert.equal(serialized.includes(canary), false, `${canary} should not be persisted`);
  }
});

test('prototype store does not classify dotted task refs as workspace output evidence', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });
  const report = createCollectorReport();
  const item = report.items[0];

  report.summary.heartbeat_count = 0;
  report.summary.tmux_observed_count = 0;
  report.summary.workspace_observed_count = 0;
  report.evidence_coverage = {
    evidence_ref_count: 1,
    covered_agent_count: 1,
    low_confidence_agent_ids: [],
    source_kind_buckets: {
      workspace_file: 0,
      workspace_root: 0,
      tmux_observation: 0,
      task_evidence: 1
    },
    agent_items: [
      {
        agent_id: 'app-engineering',
        evidence_ref_count: 1,
        source_kinds: ['task_evidence'],
        latest_evidence_at: '2026-05-20T01:06:00.000Z',
        confidence_level: 'high'
      }
    ]
  };
  item.evidence_refs = ['task://kanban_fixture/TASK.400'];
  item.workspace_observations = [];
  item.tmux_observations = [];
  item.heartbeat = {
    ...item.heartbeat,
    current_state: 'coding',
    active_task: 'Review dotted task evidence',
    last_meaningful_output_at: null,
    last_file_write_at: null
  };
  item.task_evidence_observations = [
    {
      status: 'observed',
      task_ref: 'TASK.400',
      source_kind: 'kanban_fixture',
      observed_at: '2026-05-20T01:06:00.000Z',
      correlation_id: 'corr.task.400',
      evidence_ref: 'task://kanban_fixture/TASK.400'
    }
  ];

  await store.appendCollectorReport(report);

  assert.deepEqual(store.getCounts(), {
    agent_count: 7,
    event_count: 0,
    heartbeat_count: 0
  });
  assert.deepEqual(store.listEvents({ agent_id: 'app-engineering', limit: 5 }), []);
  assert.equal(store.getLatestCollectorReport().summary.heartbeat_count, 0);
  assert.deepEqual(
    store.listEvidenceRecords({ source_kind: 'kanban_fixture' }).map((record) => ({
      evidence_ref: record.evidence_ref,
      output_candidate: record.output_candidate,
      correlation_id: record.correlation_id
    })),
    [
      {
        evidence_ref: 'task://kanban_fixture/TASK.400',
        output_candidate: false,
        correlation_id: 'corr.task.400'
      }
    ]
  );
});

test('evidence coverage fallback aggregate preserves Hermes buckets', async () => {
  const storeFile = await createStoreFile();
  await writeFile(
    storeFile,
    JSON.stringify({
      kind: 'collector_snapshot',
      payload: {
        collected_at: '2026-03-09T18:08:00.000Z',
        actor_id: 'team-lead',
        items: [],
        evidence_coverage: {
          evidence_ref_count: 1,
          covered_agent_count: 1,
          low_confidence_agent_ids: [],
          source_kind_buckets: {
            workspace_file: 0,
            workspace_root: 0,
            tmux_observation: 0,
            hermes_profile: 1
          },
          agent_items: [
            {
              agent_id: 'missing-agent',
              evidence_ref_count: 1,
              source_kinds: ['hermes_profile'],
              latest_evidence_at: '2026-03-09T18:07:30.000Z',
              confidence_level: 'high'
            }
          ]
        }
      }
    }) + '\n',
    'utf8'
  );

  const store = await createPrototypeStore({ filePath: storeFile });

  assert.deepEqual(store.getLatestCollectorEvidenceCoverage().source_kind_buckets, {
    workspace_file: 0,
    workspace_root: 0,
    tmux_observation: 0,
    hermes_profile: 1
  });
});

test('JSONL prototype store filters evidence records by exact drilldown fields', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });

  await store.appendCollectorReport(createCollectorReport());

  const outboxRecord = store.listEvidenceRecords({
    evidence_ref: '/tmp/store-contract/outbox.md'
  })[0];
  assert.deepEqual(store.getEvidenceRecord(outboxRecord.evidence_id), outboxRecord);
  assert.equal(store.getEvidenceRecord('missing-evidence-id'), null);
  assert.deepEqual(
    store
      .listEvidenceRecords({
        evidence_id: outboxRecord.evidence_id,
        source_kind: 'workspace_file',
        newest_first: 'true',
        limit: 1
      })
      .map((record) => record.evidence_ref),
    ['/tmp/store-contract/outbox.md']
  );
  assert.deepEqual(
    store.listEvidenceRecords({
      evidence_id: outboxRecord.evidence_id.slice(0, -2),
      source_kind: 'workspace_file'
    }),
    []
  );
  assert.deepEqual(store.listEvidenceRecords({ evidence_id: 'missing-evidence-id' }), []);
  assert.equal(store.listEvidenceRecords({ evidence_id: '', limit: 1 }).length, 1);

  assert.deepEqual(
    store
      .listEvidenceRecords({ evidence_ref: '/tmp/store-contract/outbox.md' })
      .map((record) => record.evidence_ref),
    ['/tmp/store-contract/outbox.md']
  );
  assert.deepEqual(
    store.listEvidenceRecords({ source_status: 'degraded' }).map((record) => record.evidence_ref),
    ['/tmp/store-contract/outbox.md']
  );
  assert.deepEqual(
    store
      .listEvidenceRecords({
        collector_snapshot_id: 'collector-snapshot:2026-03-09T18:06:00.000Z'
      })
      .map((record) => record.evidence_ref),
    [
      '/tmp/store-contract',
      '/tmp/store-contract/outbox.md',
      'tmux://5-web3-app-engineering/0.1'
    ]
  );
  assert.deepEqual(
    store
      .listEvidenceRecords({ correlation_id: 'collector-snapshot:2026-03-09T18:06:00.000Z' })
      .map((record) => record.evidence_ref),
    [
      '/tmp/store-contract',
      '/tmp/store-contract/outbox.md',
      'tmux://5-web3-app-engineering/0.1'
    ]
  );
  assert.deepEqual(
    store
      .listEvidenceRecords({ evidence_ref: '/tmp/store-contract' })
      .map((record) => record.evidence_ref),
    ['/tmp/store-contract']
  );
  assert.deepEqual(store.listEvidenceRecords({ evidence_ref: 'store-contract' }), []);
  assert.deepEqual(store.listEvidenceRecords({ source_status: 'missing' }), []);
  assert.equal(store.listEvidenceRecords({ evidence_ref: '', limit: 1 }).length, 1);
});

test('JSONL prototype store filters evidence records by mapped agent presence', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });

  await store.appendCollectorReport({
    ...createCollectorReport(),
    runtime_source_evidence: {
      unmapped_tmux_sessions: [
        {
          session_name: 'unmapped-session',
          pane_refs: ['tmux://unmapped-session/0.0'],
          observed_count: 1,
          status: 'observed',
          last_observed_at: '2026-03-09T18:05:50.000Z',
          degraded_reasons: []
        }
      ]
    }
  });

  assert.deepEqual(
    store.listEvidenceRecords({ mapped: 'true' }).map((record) => record.evidence_ref),
    [
      '/tmp/store-contract',
      '/tmp/store-contract/outbox.md',
      'tmux://5-web3-app-engineering/0.1'
    ]
  );
  assert.deepEqual(
    store.listEvidenceRecords({ mapped: 'false' }).map((record) => record.evidence_ref),
    ['tmux://unmapped-session/0.0']
  );
  assert.deepEqual(store.listEvidenceRecords({ mapped: 'false', agent_id: 'app-engineering' }), []);
  assert.equal(store.listEvidenceRecords({ mapped: '', limit: 2 }).length, 2);
  assert.equal(store.listEvidenceRecords({ mapped: 'maybe', limit: 2 }).length, 2);
});

test('evidence-records schema exposes only static safe contract metadata', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });

  await store.appendCollectorReport(createCollectorReport());

  const schema = store.getEvidenceRecordsSchema();
  assert.deepEqual(schema.limit, {
    default: 50,
    max: 200
  });
  assert.deepEqual(schema.boolean_filters, ['output_candidate', 'mapped', 'newest_first']);
  assert.deepEqual(schema.supported_filters, [
    'evidence_id',
    'agent_id',
    'source_kind',
    'evidence_role',
    'output_candidate',
    'evidence_ref',
    'source_status',
    'collector_snapshot_id',
    'correlation_id',
    'mapped',
    'observed_since',
    'observed_until',
    'collected_since',
    'collected_until',
    'newest_first',
    'limit'
  ]);
  assert.deepEqual(schema.source_kinds, [
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
  assert.deepEqual(schema.evidence_roles, [
    'workspace_presence',
    'inbound_task',
    'agent_output',
    'agent_plan',
    'runtime_activity',
    'runtime_presence',
    'runtime_unmapped',
    'task_reference'
  ]);
  assert.deepEqual(schema.source_statuses, ['observed', 'degraded', 'missing', 'error']);
  assert.equal(
    schema.route_write_boundary,
    'read-only schema catalog; does not collect, read runtime sources, append records, or expose control-plane actions'
  );

  const evidenceId = store.listEvidenceRecords()[0].evidence_id;
  const serialized = JSON.stringify(schema);
  assert.equal(serialized.includes('/tmp/store-contract'), false);
  assert.equal(serialized.includes('tmux://'), false);
  assert.equal(serialized.includes('collector-snapshot:'), false);
  assert.equal(serialized.includes(evidenceId), false);
  assert.equal(serialized.includes('metadata'), false);
});

test('prototype store summarizes evidence records with list filter semantics before limit', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });

  await store.appendCollectorReport({
    ...createCollectorReport(),
    runtime_source_evidence: {
      unmapped_tmux_sessions: [
        {
          session_name: 'unmapped-session',
          pane_refs: ['tmux://unmapped-session/0.0'],
          observed_count: 1,
          status: 'observed',
          last_observed_at: '2026-03-09T18:05:50.000Z',
          degraded_reasons: []
        }
      ]
    }
  });

  const filters = {
    output_candidate: 'false',
    newest_first: 'true',
    limit: 1
  };

  assert.equal(store.listEvidenceRecords(filters).length, 1);
  assert.deepEqual(store.getEvidenceRecordsSummary(filters), {
    total_count: 2,
    returned_limit: 1,
    mapped_count: 1,
    unmapped_count: 1,
    output_candidate_buckets: {
      true: 0,
      false: 2
    },
    source_kind_buckets: {
      workspace_root: 1,
      workspace_file: 0,
      tmux_observation: 1,
      hermes_profile: 0,
      hermes_session: 0,
      kanban_fixture: 0,
      linear_fixture: 0,
      slack_fixture: 0,
      task_fixture: 0
    },
    evidence_role_buckets: {
      workspace_presence: 1,
      inbound_task: 0,
      agent_output: 0,
      agent_plan: 0,
      runtime_activity: 0,
      runtime_presence: 0,
      runtime_unmapped: 1,
      task_reference: 0
    },
    source_status_buckets: {
      observed: 2,
      degraded: 0,
      missing: 0,
      error: 0
    },
    collector_snapshot_id_buckets: {
      'collector-snapshot:2026-03-09T18:06:00.000Z': 2
    },
    first_observed_at: '2026-03-09T18:05:20.000Z',
    last_observed_at: '2026-03-09T18:05:50.000Z',
    first_collected_at: '2026-03-09T18:06:00.000Z',
    last_collected_at: '2026-03-09T18:06:00.000Z'
  });

  assert.deepEqual(store.getEvidenceRecordsSummary({ agent_id: 'missing-agent' }), {
    total_count: 0,
    returned_limit: 50,
    mapped_count: 0,
    unmapped_count: 0,
    output_candidate_buckets: {
      true: 0,
      false: 0
    },
    source_kind_buckets: {
      workspace_root: 0,
      workspace_file: 0,
      tmux_observation: 0,
      hermes_profile: 0,
      hermes_session: 0,
      kanban_fixture: 0,
      linear_fixture: 0,
      slack_fixture: 0,
      task_fixture: 0
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
    source_status_buckets: {
      observed: 0,
      degraded: 0,
      missing: 0,
      error: 0
    },
    collector_snapshot_id_buckets: {},
    first_observed_at: null,
    last_observed_at: null,
    first_collected_at: null,
    last_collected_at: null
  });
});

test('prototype store returns safe evidence facet buckets before limit truncation', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });

  await store.appendCollectorReport({
    ...createCollectorReport(),
    runtime_source_evidence: {
      unmapped_tmux_sessions: [
        {
          session_name: 'unmapped-session',
          pane_refs: ['tmux://unmapped-session/0.0'],
          observed_count: 1,
          status: 'observed',
          last_observed_at: '2026-03-09T18:05:50.000Z',
          degraded_reasons: []
        }
      ]
    }
  });

  const facets = store.getEvidenceRecordFacets({
    output_candidate: 'false',
    newest_first: 'true',
    limit: 1
  });
  assert.deepEqual(facets, {
    total_count: 2,
    returned_limit: 1,
    source_kind_buckets: {
      workspace_root: 1,
      workspace_file: 0,
      tmux_observation: 1,
      hermes_profile: 0,
      hermes_session: 0,
      kanban_fixture: 0,
      linear_fixture: 0,
      slack_fixture: 0,
      task_fixture: 0
    },
    evidence_role_buckets: {
      workspace_presence: 1,
      inbound_task: 0,
      agent_output: 0,
      agent_plan: 0,
      runtime_activity: 0,
      runtime_presence: 0,
      runtime_unmapped: 1,
      task_reference: 0
    },
    source_status_buckets: {
      observed: 2,
      degraded: 0,
      missing: 0,
      error: 0
    },
    output_candidate_buckets: {
      true: 0,
      false: 2
    },
    mapped_buckets: {
      mapped: 1,
      unmapped: 1
    },
    agent_id_buckets: {
      'team-lead': 0,
      'market-intel': 0,
      'product-pmf': 0,
      tokenomics: 0,
      'protocol-engineering': 0,
      'app-engineering': 1,
      'growth-revenue': 0,
      unmapped: 1
    }
  });

  const serializedFacets = JSON.stringify(facets);
  assert.equal(serializedFacets.includes('/tmp/store-contract'), false);
  assert.equal(serializedFacets.includes('tmux://'), false);
  assert.equal(serializedFacets.includes('metadata'), false);
  assert.equal(serializedFacets.includes('degraded_reasons'), false);

  assert.deepEqual(
    store.getEvidenceRecordFacets({ mapped: 'false', agent_id: 'app-engineering' }),
    {
      total_count: 0,
      returned_limit: 50,
      source_kind_buckets: {
        workspace_root: 0,
        workspace_file: 0,
        tmux_observation: 0,
        hermes_profile: 0,
        hermes_session: 0,
        kanban_fixture: 0,
        linear_fixture: 0,
        slack_fixture: 0,
        task_fixture: 0
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
      source_status_buckets: {
        observed: 0,
        degraded: 0,
        missing: 0,
        error: 0
      },
      output_candidate_buckets: {
        true: 0,
        false: 0
      },
      mapped_buckets: {
        mapped: 0,
        unmapped: 0
      },
      agent_id_buckets: {
        'team-lead': 0,
        'market-intel': 0,
        'product-pmf': 0,
        tokenomics: 0,
        'protocol-engineering': 0,
        'app-engineering': 0,
        'growth-revenue': 0,
        unmapped: 0
      }
    }
  );
});

test('prototype store omits non-seeded evidence agent ids from facet buckets', async () => {
  const storeFile = await createStoreFile();
  await writeFile(
    storeFile,
    `${JSON.stringify({
      kind: 'evidence_record',
      payload: {
        evidence_id: 'ev_external_agent_workspace_file_1',
        agent_id: 'external-agent',
        source_kind: '/tmp/store-contract/source-kind.md',
        evidence_role: 'tmux://facet-role/0.0',
        evidence_ref: '/tmp/store-contract/external-output.md',
        source_status: 'token=facet-status-secret',
        output_candidate: true,
        observed_at: '2026-03-09T18:05:20.000Z',
        collected_at: '2026-03-09T18:06:00.000Z',
        collector_snapshot_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
        correlation_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
        degraded_reasons: [],
        metadata: {}
      }
    })}\n`
  );

  const store = await createPrototypeStore({ filePath: storeFile });
  const facets = store.getEvidenceRecordFacets({ mapped: 'true' });

  assert.equal(facets.total_count, 1);
  assert.equal(facets.mapped_buckets.mapped, 1);
  assert.equal(Object.hasOwn(facets.agent_id_buckets, 'external-agent'), false);
  assert.equal(Object.hasOwn(facets.source_kind_buckets, '/tmp/store-contract/source-kind.md'), false);
  assert.equal(Object.hasOwn(facets.evidence_role_buckets, 'tmux://facet-role/0.0'), false);
  assert.equal(Object.hasOwn(facets.source_status_buckets, 'token=facet-status-secret'), false);
  const serializedFacets = JSON.stringify(facets);
  assert.equal(serializedFacets.includes('/tmp/store-contract'), false);
  assert.equal(serializedFacets.includes('tmux://'), false);
  assert.equal(serializedFacets.includes('facet-status-secret'), false);
  assert.deepEqual(facets.source_kind_buckets, {
    workspace_root: 0,
    workspace_file: 0,
    tmux_observation: 0,
    hermes_profile: 0,
    hermes_session: 0,
    kanban_fixture: 0,
    linear_fixture: 0,
    slack_fixture: 0,
    task_fixture: 0
  });
  assert.deepEqual(facets.evidence_role_buckets, {
    workspace_presence: 0,
    inbound_task: 0,
    agent_output: 0,
    agent_plan: 0,
    runtime_activity: 0,
    runtime_presence: 0,
    runtime_unmapped: 0,
    task_reference: 0
  });
  assert.deepEqual(facets.source_status_buckets, {
    observed: 0,
    degraded: 0,
    missing: 0,
    error: 0
  });
  assert.deepEqual(facets.agent_id_buckets, {
    'team-lead': 0,
    'market-intel': 0,
    'product-pmf': 0,
    tokenomics: 0,
    'protocol-engineering': 0,
    'app-engineering': 0,
    'growth-revenue': 0,
    unmapped: 0
  });
});

test('prototype store lists compact runtime source gaps without normal observed mapped evidence', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });
  const leakCanaries = [
    '/Users/cwp/private/live-evidence-secret.md',
    'token=live-evidence-secret',
    'POST /control-plane/dispatch'
  ];
  const report = createCollectorReport();
  report.items[0].evidence_refs.push(...leakCanaries);

  await store.appendCollectorReport({
    ...report,
    runtime_source_evidence: {
      unmapped_tmux_sessions: [
        {
          session_name: 'unmapped-session',
          pane_refs: ['tmux://unmapped-session/0.0'],
          observed_count: 1,
          status: 'observed',
          last_observed_at: '2026-03-09T18:05:50.000Z',
          degraded_reasons: []
        }
      ]
    }
  });

  const gaps = store.listRuntimeSourceGaps({ newest_first: 'true' });

  assert.deepEqual(
    gaps.map((gap) => ({
      agent_id: gap.agent_id,
      source_kind: gap.source_kind,
      evidence_role: gap.evidence_role,
      source_status: gap.source_status,
      output_candidate: gap.output_candidate,
      unmapped: gap.unmapped
    })),
    [
      {
        agent_id: null,
        source_kind: 'tmux_observation',
        evidence_role: 'runtime_unmapped',
        source_status: 'observed',
        output_candidate: false,
        unmapped: true
      },
      {
        agent_id: 'app-engineering',
        source_kind: 'workspace_file',
        evidence_role: 'agent_output',
        source_status: 'degraded',
        output_candidate: true,
        unmapped: false
      }
    ]
  );
  assert.equal(gaps.some((gap) => gap.source_status === 'observed' && gap.unmapped === false), false);
  assert.equal(gaps.some((gap) => Object.hasOwn(gap, 'evidence_id')), false);
  assert.equal(gaps.some((gap) => Object.hasOwn(gap, 'evidence_ref')), false);
  assert.equal(gaps.some((gap) => Object.hasOwn(gap, 'metadata')), false);
  assert.equal(gaps.some((gap) => Object.hasOwn(gap, 'degraded_reasons')), false);
  const serializedGaps = JSON.stringify(gaps);
  for (const canary of leakCanaries) {
    assert.equal(serializedGaps.includes(canary), false, `leaked canary: ${canary}`);
  }
});

test('prototype store projects evidence provenance bundles without raw refs or control-plane canaries', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });
  const leakCanaries = [
    '/Users/cwp/private/provenance-secret.md',
    'token=provenance-secret',
    'POST /control-plane/dispatch'
  ];
  const report = createCollectorReport();
  report.items[0].evidence_refs.push(...leakCanaries);

  await store.appendCollectorReport(report);

  const outboxRecord = store.listEvidenceRecords({
    evidence_ref: '/tmp/store-contract/outbox.md'
  })[0];
  const provenanceBundle = store.getEvidenceProvenanceBundle(outboxRecord.evidence_id);
  const serializedBundle = JSON.stringify(provenanceBundle);

  assert.deepEqual(provenanceBundle.source_summary, {
    kind: 'workspace_file',
    status: 'degraded',
    role: 'agent_output',
    output_candidate: true,
    mapped: true,
    time: {
      observed_at: '2026-03-09T18:05:20.000Z',
      collected_at: '2026-03-09T18:06:00.000Z'
    }
  });
  assert.equal(Object.hasOwn(provenanceBundle, 'input_proof'), false);
  assert.equal(serializedBundle.includes('/tmp/store-contract'), false);
  assert.equal(serializedBundle.includes('evidence_ref'), false);
  assert.equal(serializedBundle.includes('metadata'), false);
  assert.equal(serializedBundle.includes('degraded_reasons'), false);
  for (const canary of leakCanaries) {
    assert.equal(serializedBundle.includes(canary), false, `leaked canary: ${canary}`);
  }
});

test('prototype store projects bounded evidence source context for one evidence id', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });
  const leakCanaries = [
    '/Users/cwp/private/source-context-secret.md',
    '/tmp/store-contract',
    'tmux://5-web3-app-engineering/0.1',
    'hermes://profile/source-context-secret',
    'hermes://session/source-context-secret',
    'session-secret',
    'profile-secret',
    'payload_dump',
    'metadata_dump',
    'token=source-context-secret',
    'https://hooks.slack.com/services/source-context'
  ];
  const report = createCollectorReport();
  report.items[0].evidence_refs.push(...leakCanaries);

  await store.appendCollectorReport(report);

  assert.equal(store.getEvidenceSourceContext('missing-evidence-id'), null);

  const outboxRecord = store.listEvidenceRecords({
    evidence_ref: '/tmp/store-contract/outbox.md'
  })[0];
  const context = store.getEvidenceSourceContext(outboxRecord.evidence_id);
  const serializedContext = JSON.stringify(context);

  assert.equal(context.evidence_id, outboxRecord.evidence_id);
  assert.deepEqual(context.disclosure, {
    decision: 'allow',
    reason_code: 'mapped_stale',
    mapping: 'mapped',
    freshness: 'stale'
  });
  assert.deepEqual(context.source_summary, {
    kind: 'workspace_file',
    status: 'degraded',
    role: 'agent_output',
    output_candidate: true,
    mapped: true,
    time: {
      observed_at: '2026-03-09T18:05:20.000Z',
      collected_at: '2026-03-09T18:06:00.000Z'
    }
  });
  assert.deepEqual(context.record, {
    observed_at: '2026-03-09T18:05:20.000Z',
    collected_at: '2026-03-09T18:06:00.000Z',
    agent_id: 'app-engineering',
    source_kind: 'workspace_file',
    evidence_role: 'agent_output',
    source_status: 'degraded',
    output_candidate: true,
    unmapped: false
  });
  assert.equal(context.source_gaps.items.length, 1);
  assert.equal(context.source_gaps.items[0].source_kind, 'workspace_file');
  assert.equal(Object.hasOwn(context.source_gaps.summary, 'collector_snapshot_id_buckets'), false);
  assert.equal(Object.hasOwn(context.source_gaps.items[0], 'collector_snapshot_id'), false);
  assert.equal(Object.hasOwn(context.source_gaps.items[0], 'correlation_id'), false);
  assert.equal(context.source_health.agent_items.length, 1);
  assert.equal(context.source_health.agent_items[0].agent_id, 'app-engineering');
  assert.equal(Object.hasOwn(context.source_health, 'collector_snapshot_id'), false);
  assert.equal(Object.hasOwn(context.source_health.agent_items[0], 'collector_snapshot_id'), false);
  assert.equal(Object.hasOwn(context.source_health, 'runtime_source_evidence'), false);
  assert.equal(Object.hasOwn(context, 'input_proof'), false);
  assert.equal(serializedContext.includes('collector_snapshot_id'), false);
  assert.equal(serializedContext.includes('correlation_id'), false);
  assert.equal(serializedContext.includes('evidence_ref'), false);
  assert.equal(serializedContext.includes('metadata'), false);
  assert.equal(serializedContext.includes('degraded_reasons'), false);
  assert.equal(serializedContext.includes('payload'), false);
  for (const canary of leakCanaries) {
    assert.equal(serializedContext.includes(canary), false, `leaked canary: ${canary}`);
  }
});

test('prototype store keeps unmapped runtime source context unmapped', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });

  await store.appendCollectorReport({
    ...createCollectorReport(),
    runtime_source_evidence: {
      unmapped_tmux_sessions: [
        {
          session_name: 'unmapped-source-context',
          pane_refs: ['tmux://unmapped-source-context/0.0'],
          observed_count: 1,
          status: 'observed',
          last_observed_at: '2026-03-09T18:05:50.000Z',
          degraded_reasons: ['token=unmapped-source-context']
        }
      ]
    }
  });

  const unmappedRecord = store.listEvidenceRecords({ mapped: 'false' })[0];
  const context = store.getEvidenceSourceContext(unmappedRecord.evidence_id);

  assert.equal(context.record.agent_id, null);
  assert.equal(context.record.unmapped, true);
  assert.equal(context.source_summary.mapped, false);
  assert.deepEqual(context.source_health.agent_items, []);
  assert.deepEqual(
    context.source_gaps.items.map((item) => ({
      agent_id: item.agent_id,
      source_kind: item.source_kind,
      evidence_role: item.evidence_role,
      source_status: item.source_status,
      unmapped: item.unmapped
    })),
    [
      {
        agent_id: null,
        source_kind: 'tmux_observation',
        evidence_role: 'runtime_unmapped',
        source_status: 'observed',
        unmapped: true
      }
    ]
  );
  assert.equal(JSON.stringify(context).includes('tmux://unmapped-source-context'), false);
  assert.equal(JSON.stringify(context).includes('token=unmapped-source-context'), false);
  assert.deepEqual(context.disclosure, {
    decision: 'allow',
    reason_code: 'unmapped_current',
    mapping: 'unmapped',
    freshness: 'current'
  });
});

test('prototype store projects sanitized Hermes input proof in provenance bundles', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });

  await store.appendCollectorReport(createHermesRuntimeCollectorReport());

  const sessionRecord = store.listEvidenceRecords({
    source_kind: 'hermes_session',
    evidence_role: 'runtime_presence'
  })[0];
  const provenanceBundle = store.getEvidenceProvenanceBundle(sessionRecord.evidence_id);
  const serializedBundle = JSON.stringify(provenanceBundle);

  assert.deepEqual(provenanceBundle.input_proof, {
    source_format: 'jsonl',
    source_index: 2,
    line: 4,
    source_input_ordinal: 1,
    source_file_ordinal: 2
  });
  assert.equal(serializedBundle.includes('source_provenance'), false);
  assert.equal(serializedBundle.includes('metadata'), false);
});

test('prototype store bounds provenance source summaries for unmapped missing fields', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });

  await store.appendCollectorReport({
    ...createCollectorReport(),
    runtime_source_evidence: {
      unmapped_tmux_sessions: [
        {
          session_name: 'unmapped-session',
          pane_refs: ['tmux://unmapped-session/0.0'],
          observed_count: 1,
          status: 'observed',
          last_observed_at: null,
          degraded_reasons: ['tmux socket token=secret']
        }
      ]
    }
  });

  const unmappedRecord = store.listEvidenceRecords({ mapped: 'false' })[0];
  const provenanceBundle = store.getEvidenceProvenanceBundle(unmappedRecord.evidence_id);

  assert.deepEqual(provenanceBundle.source_summary, {
    kind: 'tmux_observation',
    status: 'observed',
    role: 'runtime_unmapped',
    output_candidate: false,
    mapped: false,
    time: {
      observed_at: null,
      collected_at: '2026-03-09T18:06:00.000Z'
    }
  });
  assert.equal(JSON.stringify(provenanceBundle).includes('token=secret'), false);
  assert.equal(JSON.stringify(provenanceBundle).includes('tmux://unmapped-session'), false);
});

test('prototype store drops unsafe provenance source summary enum values', async () => {
  const storeFile = await createStoreFile();
  const unsafeSourceKind = 'https://hooks.slack.com/services/provenance-webhook';
  const unsafeSourceStatus = 'token=provenance-status-secret';
  const unsafeEvidenceRole = 'POST /control-plane/dispatch tmux://unsafe-role/0.0';
  const unsafeObservedAt = '/tmp/provenance-unsafe/observed-token.txt';
  const unsafeCollectedAt = 'https://hooks.slack.com/services/provenance-time-token';
  const unsafeEvidenceRef = '/tmp/provenance-unsafe/evidence.md';
  const unsafeInputProofFormat = 'https://hooks.slack.com/services/provenance-input-proof';
  await writeFile(
    storeFile,
    `${JSON.stringify({
      kind: 'evidence_record',
      payload: {
        evidence_id: 'unsafe-provenance-record',
        observed_at: unsafeObservedAt,
        collected_at: unsafeCollectedAt,
        agent_id: null,
        source_kind: unsafeSourceKind,
        evidence_ref: unsafeEvidenceRef,
        evidence_role: unsafeEvidenceRole,
        source_status: unsafeSourceStatus,
        output_candidate: false,
        collector_snapshot_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
        correlation_id: 'corr-unsafe-provenance',
        degraded_reasons: [unsafeSourceStatus],
        metadata: {
          raw_role: unsafeEvidenceRole,
          source_provenance: {
            source_format: unsafeInputProofFormat,
            source_index: 0,
            line: 1,
            source_input_ordinal: 1,
            source_file_ordinal: 1
          }
        }
      }
    })}\n`,
    'utf8'
  );

  const store = await createPrototypeStore({ filePath: storeFile });
  const provenanceBundle = store.getEvidenceProvenanceBundle('unsafe-provenance-record');
  const serializedBundle = JSON.stringify(provenanceBundle);

  assert.deepEqual(provenanceBundle.source_summary, {
    kind: null,
    status: null,
    role: null,
    output_candidate: false,
    mapped: false,
    time: {
      observed_at: null,
      collected_at: null
    }
  });
  assert.equal(provenanceBundle.record.observed_at, null);
  assert.equal(provenanceBundle.record.collected_at, null);
  assert.equal(provenanceBundle.record.source_kind, null);
  assert.equal(provenanceBundle.record.source_status, null);
  assert.equal(provenanceBundle.record.evidence_role, null);
  assert.equal(provenanceBundle.anchors.source, null);
  assert.equal(Object.hasOwn(provenanceBundle, 'input_proof'), false);
  for (const canary of [
    unsafeSourceKind,
    unsafeSourceStatus,
    unsafeEvidenceRole,
    unsafeObservedAt,
    unsafeCollectedAt,
    unsafeEvidenceRef,
    unsafeInputProofFormat
  ]) {
    assert.equal(serializedBundle.includes(canary), false, `leaked canary: ${canary}`);
  }
});

test('prototype store summarizes runtime source gaps before limit truncation', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });

  await store.appendCollectorReport({
    ...createCollectorReport(),
    runtime_source_evidence: {
      unmapped_tmux_sessions: [
        {
          session_name: 'unmapped-session',
          pane_refs: ['tmux://unmapped-session/0.0'],
          observed_count: 1,
          status: 'observed',
          last_observed_at: '2026-03-09T18:05:50.000Z',
          degraded_reasons: []
        }
      ]
    }
  });

  const summary = store.getRuntimeSourceGapsSummary({ newest_first: 'true', limit: '1' });

  assert.equal(summary.total_count, 2);
  assert.equal(summary.returned_limit, 1);
  assert.equal(summary.mapped_count, 1);
  assert.equal(summary.unmapped_count, 1);
  assert.deepEqual(summary.output_candidate_buckets, { true: 1, false: 1 });
  assert.equal(summary.source_kind_buckets.workspace_file, 1);
  assert.equal(summary.source_kind_buckets.tmux_observation, 1);
  assert.equal(summary.evidence_role_buckets.agent_output, 1);
  assert.equal(summary.evidence_role_buckets.runtime_unmapped, 1);
  assert.equal(summary.source_status_buckets.degraded, 1);
  assert.equal(summary.source_status_buckets.observed, 1);
  assert.deepEqual(summary.collector_snapshot_id_buckets, {
    'collector-snapshot:2026-03-09T18:06:00.000Z': 2
  });
  assert.equal(summary.first_observed_at, '2026-03-09T18:05:20.000Z');
  assert.equal(summary.last_observed_at, '2026-03-09T18:05:50.000Z');
  assert.equal(summary.first_collected_at, '2026-03-09T18:06:00.000Z');
  assert.equal(summary.last_collected_at, '2026-03-09T18:06:00.000Z');

  const unmappedSummary = store.getRuntimeSourceGapsSummary({ mapped: 'false' });
  assert.equal(unmappedSummary.total_count, 1);
  assert.equal(unmappedSummary.mapped_count, 0);
  assert.equal(unmappedSummary.unmapped_count, 1);
});

test('prototype store trends runtime source gaps with safe count buckets only', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });
  const firstReport = createCollectorReport();
  const secondReport = createCollectorReport();
  secondReport.collected_at = '2026-03-09T19:06:00.000Z';
  secondReport.items[0].workspace_observations[0].last_modified_at =
    '2026-03-09T19:05:20.000Z';
  secondReport.items[0].source_health.workspace_files.last_observed_at =
    '2026-03-09T19:05:20.000Z';
  secondReport.items[0].source_health.workspace_files.degraded_reasons = [
    '/tmp/source-gap-trend/secret.md',
    'token=source-gap-trend-secret'
  ];
  secondReport.items[0].evidence_refs.push('/tmp/source-gap-trend/secret.md');

  await store.appendCollectorReport(firstReport);
  await store.appendCollectorReport(secondReport);

  const trend = store.getRuntimeSourceGapTrend({ newest_first: 'true', limit: '1' });

  assert.deepEqual(trend, {
    bucket: 'hour',
    total_count: 2,
    total_buckets: 2,
    returned_limit: 1,
    buckets: [
      {
        bucket_start: '2026-03-09T19:00:00.000Z',
        total_count: 1,
        mapped_count: 1,
        unmapped_count: 0,
        output_candidate_buckets: { true: 1, false: 0 },
        source_kind_buckets: { workspace_file: 1 },
        evidence_role_buckets: { agent_output: 1 },
        source_status_buckets: { degraded: 1 }
      }
    ]
  });

  const dailyTrend = store.getRuntimeSourceGapTrend({ bucket: 'day' });
  assert.equal(dailyTrend.bucket, 'day');
  assert.equal(dailyTrend.total_count, 2);
  assert.equal(dailyTrend.total_buckets, 1);
  assert.equal(dailyTrend.buckets[0].bucket_start, '2026-03-09T00:00:00.000Z');
  assert.equal(dailyTrend.buckets[0].total_count, 2);

  const serializedTrend = JSON.stringify(trend);
  assert.equal(serializedTrend.includes('evidence_id'), false);
  assert.equal(serializedTrend.includes('evidence_ref'), false);
  assert.equal(serializedTrend.includes('metadata'), false);
  assert.equal(serializedTrend.includes('degraded_reasons'), false);
  assert.equal(serializedTrend.includes('/tmp/source-gap-trend'), false);
  assert.equal(serializedTrend.includes('token=source-gap-trend-secret'), false);
});

test('prototype store groups runtime source gaps by agent and source without raw refs', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });
  const leakCanaries = ['/tmp/store-contract/outbox.md', 'tmux://unmapped-session/0.0'];

  await store.appendCollectorReport({
    ...createCollectorReport(),
    runtime_source_evidence: {
      unmapped_tmux_sessions: [
        {
          session_name: 'unmapped-session',
          pane_refs: ['tmux://unmapped-session/0.0'],
          observed_count: 1,
          status: 'observed',
          last_observed_at: '2026-03-09T18:05:50.000Z',
          degraded_reasons: []
        }
      ]
    }
  });

  const summary = store.getRuntimeSourceGapAgentSummary({ newest_first: 'true', limit: '1' });

  assert.deepEqual(summary, {
    total_count: 2,
    total_groups: 2,
    returned_limit: 1,
    groups: [
      {
        agent_id: null,
        source_kind: 'tmux_observation',
        record_count: 1,
        mapped_count: 0,
        unmapped_count: 1,
        output_candidate_buckets: { true: 0, false: 1 },
        evidence_role_buckets: { runtime_unmapped: 1 },
        source_status_buckets: { observed: 1 },
        first_observed_at: '2026-03-09T18:05:50.000Z',
        last_observed_at: '2026-03-09T18:05:50.000Z',
        first_collected_at: '2026-03-09T18:06:00.000Z',
        last_collected_at: '2026-03-09T18:06:00.000Z'
      }
    ]
  });
  assert.deepEqual(store.getRuntimeSourceGapAgentSummary({ source_kind: 'kanban_fixture' }), {
    total_count: 0,
    total_groups: 0,
    returned_limit: 50,
    groups: []
  });

  const serializedSummary = JSON.stringify(summary);
  for (const canary of leakCanaries) {
    assert.equal(serializedSummary.includes(canary), false, `leaked canary: ${canary}`);
  }
  assert.equal(serializedSummary.includes('evidence_id'), false);
  assert.equal(serializedSummary.includes('evidence_ref'), false);
  assert.equal(serializedSummary.includes('metadata'), false);
});

test('prototype store keeps literal unmapped agent groups separate from null source gaps', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });
  const report = createCollectorReport();
  report.evidence_coverage.agent_items[0].agent_id = 'unmapped';
  report.items[0].agent_id = 'unmapped';
  report.items[0].heartbeat.agent_id = 'unmapped';
  report.items[0].source_health.tmux_session.status = 'degraded';
  report.items[0].source_health.tmux_session.degraded_reasons = ['tmux source degraded'];

  await store.appendCollectorReport({
    ...report,
    runtime_source_evidence: {
      unmapped_tmux_sessions: [
        {
          session_name: 'literal-collision-session',
          pane_refs: ['tmux://literal-collision-session/0.0'],
          observed_count: 1,
          status: 'observed',
          last_observed_at: '2026-03-09T18:05:50.000Z',
          degraded_reasons: []
        }
      ]
    }
  });

  const summary = store.getRuntimeSourceGapAgentSummary({ source_kind: 'tmux_observation' });

  assert.equal(summary.total_count, 2);
  assert.equal(summary.total_groups, 2);
  assert.deepEqual(
    summary.groups.map((group) => ({
      agent_id: group.agent_id,
      source_kind: group.source_kind,
      mapped_count: group.mapped_count,
      unmapped_count: group.unmapped_count
    })),
    [
      {
        agent_id: null,
        source_kind: 'tmux_observation',
        mapped_count: 0,
        unmapped_count: 1
      },
      {
        agent_id: 'unmapped',
        source_kind: 'tmux_observation',
        mapped_count: 1,
        unmapped_count: 0
      }
    ]
  );
});

test('prototype store derives compact runtime source gap lifecycle across snapshots', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });
  const firstReport = createCollectorReport();
  const secondReport = createCollectorReport();
  secondReport.collected_at = '2026-03-09T18:07:00.000Z';
  secondReport.items[0].workspace_observations[0].last_modified_at =
    '2026-03-09T18:06:40.000Z';
  secondReport.items[0].source_health.workspace_files.status = 'observed';
  secondReport.items[0].source_health.workspace_files.last_observed_at =
    '2026-03-09T18:06:40.000Z';
  secondReport.items[0].source_health.workspace_files.degraded_reasons = [];
  secondReport.items[0].source_health.tmux_session.status = 'missing';
  secondReport.items[0].source_health.tmux_session.degraded_reasons = [
    '/tmp/lifecycle/tmux-secret',
    'token=lifecycle-secret'
  ];
  secondReport.items[0].evidence_refs.push('/tmp/lifecycle/tmux-secret');

  await store.appendCollectorReport(firstReport);
  await store.appendCollectorReport({
    ...secondReport,
    runtime_source_evidence: {
      unmapped_tmux_sessions: [
        {
          session_name: 'unmapped-session',
          pane_refs: ['tmux://unmapped-session/0.0'],
          observed_count: 1,
          status: 'observed',
          last_observed_at: '2026-03-09T18:06:50.000Z',
          degraded_reasons: ['token=lifecycle-secret']
        }
      ]
    }
  });

  const lifecycle = store.getRuntimeSourceGapLifecycle({ newest_first: 'true', limit: '2' });

  assert.deepEqual(lifecycle, {
    total_count: 5,
    total_groups: 3,
    returned_limit: 2,
    groups: [
      {
        agent_id: null,
        source_kind: 'tmux_observation',
        evidence_role: 'runtime_unmapped',
        record_count: 1,
        current_status: 'observed',
        lifecycle_state: 'observed_unmapped',
        first_observed_at: '2026-03-09T18:06:50.000Z',
        last_observed_at: '2026-03-09T18:06:50.000Z',
        first_collected_at: '2026-03-09T18:07:00.000Z',
        last_collected_at: '2026-03-09T18:07:00.000Z',
        snapshot_count: 1,
        source_status_buckets: { observed: 1 }
      },
      {
        agent_id: 'app-engineering',
        source_kind: 'workspace_file',
        evidence_role: 'agent_output',
        record_count: 2,
        current_status: 'observed',
        lifecycle_state: 'resolved',
        first_observed_at: '2026-03-09T18:05:20.000Z',
        last_observed_at: '2026-03-09T18:06:40.000Z',
        first_collected_at: '2026-03-09T18:06:00.000Z',
        last_collected_at: '2026-03-09T18:07:00.000Z',
        snapshot_count: 2,
        source_status_buckets: { degraded: 1, observed: 1 }
      }
    ]
  });

  const tmuxLifecycle = store.getRuntimeSourceGapLifecycle({
    source_kind: 'tmux_observation',
    mapped: 'true'
  });
  assert.equal(tmuxLifecycle.groups[0].lifecycle_state, 'opened');
  assert.equal(tmuxLifecycle.groups[0].current_status, 'missing');

  const serializedLifecycle = JSON.stringify(lifecycle);
  assert.equal(lifecycle.groups.every((group) => Number.isSafeInteger(group.record_count)), true);
  for (const canary of ['/tmp/lifecycle', 'token=lifecycle-secret', 'tmux://unmapped-session']) {
    assert.equal(serializedLifecycle.includes(canary), false, `leaked canary: ${canary}`);
  }
  assert.equal(serializedLifecycle.includes('evidence_id'), false);
  assert.equal(serializedLifecycle.includes('evidence_ref'), false);
  assert.equal(serializedLifecycle.includes('metadata'), false);
  assert.equal(serializedLifecycle.includes('degraded_reasons'), false);
  assert.equal(serializedLifecycle.includes('collector_snapshot_id'), false);
});

test('prototype store groups evidence refs with evidence-record filters before group limit', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });

  await store.appendCollectorReport(createCollectorReport());
  await store.appendCollectorReport({
    ...createCollectorReport(),
    collected_at: '2026-03-09T18:07:00.000Z',
    runtime_source_evidence: {
      unmapped_tmux_sessions: [
        {
          session_name: 'unmapped-session',
          pane_refs: ['tmux://unmapped-session/0.0'],
          observed_count: 1,
          status: 'observed',
          last_observed_at: '2026-03-09T18:06:50.000Z',
          degraded_reasons: []
        }
      ]
    }
  });

  assert.deepEqual(
    store.getEvidenceRefRollup({
      agent_id: 'app-engineering',
      limit: 2
    }),
    {
      total_count: 6,
      total_groups: 3,
      returned_limit: 2,
      groups: [
        {
          evidence_ref: null,
          evidence_ref_key: 'ref_group_001',
          evidence_ref_label: 'workspace_root observed evidence',
          record_count: 2,
          mapped_count: 2,
          unmapped_count: 0,
          agent_id_buckets: {
            'app-engineering': 2
          },
          source_kind_buckets: {
            workspace_root: 2
          },
          source_status_buckets: {
            observed: 2
          }
        },
        {
          evidence_ref: null,
          evidence_ref_key: 'ref_group_002',
          evidence_ref_label: 'workspace_file degraded evidence',
          record_count: 2,
          mapped_count: 2,
          unmapped_count: 0,
          agent_id_buckets: {
            'app-engineering': 2
          },
          source_kind_buckets: {
            workspace_file: 2
          },
          source_status_buckets: {
            degraded: 2
          }
        }
      ]
    }
  );
  assert.deepEqual(
    store.getEvidenceRefRollup({
      mapped: 'false',
      source_kind: 'tmux_observation',
      limit: 10
    }),
    {
      total_count: 1,
      total_groups: 1,
      returned_limit: 10,
      groups: [
        {
          evidence_ref: null,
          evidence_ref_key: 'ref_group_001',
          evidence_ref_label: 'tmux_observation observed evidence',
          record_count: 1,
          mapped_count: 0,
          unmapped_count: 1,
          agent_id_buckets: {
            unmapped: 1
          },
          source_kind_buckets: {
            tmux_observation: 1
          },
          source_status_buckets: {
            observed: 1
          }
        }
      ]
    }
  );
  const serializedRollup = JSON.stringify(
    store.getEvidenceRefRollup({
      evidence_ref: '/tmp/store-contract/outbox.md',
      limit: 10
    })
  );
  assert.equal(serializedRollup.includes('/tmp/store-contract/outbox.md'), false);
  assert.equal(serializedRollup.includes('tmux://unmapped-session/0.0'), false);
  assert.equal(serializedRollup.includes('ref_group_001'), true);
});

test('prototype store ref rollup redacts unsafe source bucket keys and labels', async () => {
  const storeFile = await createStoreFile();
  const unsafeRef = '/tmp/ref-rollup-secret.md?token=ref-rollup-token';
  const unsafeOnlyRef = 'tmux://secret-session/0.1';
  const unsafeSourceKind = '/tmp/ref-rollup-kind-token';
  const unsafeSourceStatus = 'https://hooks.slack.com/services/T000/B000/ref-rollup-webhook';
  await writeFile(
    storeFile,
    [
      {
        kind: 'evidence_record',
        payload: {
          evidence_id: 'ev_ref_rollup_safe_bucket_1',
          agent_id: 'app-engineering',
          source_kind: 'workspace_file',
          evidence_role: 'agent_output',
          evidence_ref: unsafeRef,
          source_status: 'observed',
          output_candidate: true,
          observed_at: '2026-03-09T18:06:40.000Z',
          collected_at: '2026-03-09T18:07:00.000Z',
          collector_snapshot_id: 'collector-snapshot:2026-03-09T18:07:00.000Z',
          correlation_id: 'collector-snapshot:2026-03-09T18:07:00.000Z',
          degraded_reasons: [],
          metadata: {}
        }
      },
      {
        kind: 'evidence_record',
        payload: {
          evidence_id: 'ev_ref_rollup_unsafe_bucket_1',
          agent_id: 'app-engineering',
          source_kind: unsafeSourceKind,
          evidence_role: 'runtime_unmapped',
          evidence_ref: unsafeRef,
          source_status: unsafeSourceStatus,
          output_candidate: false,
          observed_at: '2026-03-09T18:06:45.000Z',
          collected_at: '2026-03-09T18:07:00.000Z',
          collector_snapshot_id: 'collector-snapshot:2026-03-09T18:07:00.000Z',
          correlation_id: 'collector-snapshot:2026-03-09T18:07:00.000Z',
          degraded_reasons: [],
          metadata: {}
        }
      },
      {
        kind: 'evidence_record',
        payload: {
          evidence_id: 'ev_ref_rollup_unsafe_bucket_2',
          agent_id: null,
          source_kind: unsafeSourceKind,
          evidence_role: 'runtime_unmapped',
          evidence_ref: unsafeOnlyRef,
          source_status: unsafeSourceStatus,
          output_candidate: false,
          observed_at: '2026-03-09T18:06:50.000Z',
          collected_at: '2026-03-09T18:07:00.000Z',
          collector_snapshot_id: 'collector-snapshot:2026-03-09T18:07:00.000Z',
          correlation_id: 'collector-snapshot:2026-03-09T18:07:00.000Z',
          degraded_reasons: [],
          metadata: {}
        }
      }
    ].map((record) => JSON.stringify(record)).join('\n') + '\n'
  );

  const store = await createPrototypeStore({ filePath: storeFile });
  const rollup = store.getEvidenceRefRollup({ limit: 10 });

  assert.deepEqual(rollup, {
    total_count: 3,
    total_groups: 2,
    returned_limit: 10,
    groups: [
      {
        evidence_ref: null,
        evidence_ref_key: 'ref_group_001',
        evidence_ref_label: 'workspace_file observed evidence',
        record_count: 2,
        mapped_count: 2,
        unmapped_count: 0,
        agent_id_buckets: {
          'app-engineering': 2
        },
        source_kind_buckets: {
          workspace_file: 1
        },
        source_status_buckets: {
          observed: 1
        }
      },
      {
        evidence_ref: null,
        evidence_ref_key: 'ref_group_002',
        evidence_ref_label: 'unknown_source unknown_status evidence',
        record_count: 1,
        mapped_count: 0,
        unmapped_count: 1,
        agent_id_buckets: {
          unmapped: 1
        },
        source_kind_buckets: {},
        source_status_buckets: {}
      }
    ]
  });

  const serializedRollup = JSON.stringify(rollup);
  for (const canary of [
    unsafeRef,
    unsafeOnlyRef,
    unsafeSourceKind,
    unsafeSourceStatus,
    'ref-rollup-token',
    'ref-rollup-webhook',
    'secret-session'
  ]) {
    assert.equal(serializedRollup.includes(canary), false, `leaked canary: ${canary}`);
  }
});

test('JSONL prototype store filters evidence records by observed and collected windows before limit', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });
  const report = createCollectorReport();
  report.items[0].source_health.workspace_root.last_observed_at = null;

  await store.appendCollectorReport(report);
  await store.appendCollectorReport(createHermesRuntimeCollectorReport());

  assert.deepEqual(
    store
      .listEvidenceRecords({
        observed_since: '2026-03-09T18:05:21.000Z',
        observed_until: '2026-03-09T18:06:35.000Z',
        newest_first: 'true',
        limit: 1
      })
      .map((record) => record.evidence_ref),
    ['hermes://profile/app-profile']
  );
  assert.deepEqual(
    store
      .listEvidenceRecords({
        collected_since: '2026-03-09T18:07:00.000Z',
        collected_until: '2026-03-09T18:07:00.000Z'
      })
      .map((record) => record.evidence_ref),
    [
      'hermes://profile/app-profile',
      'hermes://session/5-web3-app-engineering',
      'hermes://profile/unmapped-worker'
    ]
  );
  assert.deepEqual(
    store
      .listEvidenceRecords({
        observed_since: 'not-a-date',
        observed_until: '',
        collected_since: ' ',
        collected_until: '2026-13-99',
        limit: 1
      })
      .map((record) => record.evidence_ref),
    ['/tmp/store-contract']
  );
  assert.deepEqual(
    store
      .listEvidenceRecords({
        source_kind: 'workspace_root',
        observed_since: '2026-03-09T18:00:00.000Z'
      })
      .map((record) => record.evidence_ref),
    []
  );
});

test('prototype store orders newest evidence records by observed, collected, and deterministic tie key', async () => {
  const jsonlStoreFile = await createStoreFile();
  const sqliteStoreFile = await createSqliteStoreFile();
  const jsonlStore = await createPrototypeStore({ filePath: jsonlStoreFile });
  const sqliteStore = await createPrototypeStore({ sqliteFilePath: sqliteStoreFile });

  await jsonlStore.appendCollectorReport(
    createTieTimestampCollectorReport('2026-03-09T18:06:00.000Z')
  );
  await jsonlStore.appendCollectorReport(
    createTieTimestampCollectorReport('2026-03-09T18:07:00.000Z')
  );
  await sqliteStore.appendCollectorReport(
    createTieTimestampCollectorReport('2026-03-09T18:06:00.000Z')
  );
  await sqliteStore.appendCollectorReport(
    createTieTimestampCollectorReport('2026-03-09T18:07:00.000Z')
  );

  const orderedRefs = jsonlStore
    .listEvidenceRecords({ newest_first: 'true' })
    .map((record) => `${record.collected_at}|${record.evidence_ref}`);

  assert.deepEqual(orderedRefs, [
    '2026-03-09T18:07:00.000Z|tmux://5-web3-app-engineering/0.1',
    '2026-03-09T18:07:00.000Z|/tmp/store-contract/outbox.md',
    '2026-03-09T18:07:00.000Z|/tmp/store-contract',
    '2026-03-09T18:06:00.000Z|tmux://5-web3-app-engineering/0.1',
    '2026-03-09T18:06:00.000Z|/tmp/store-contract/outbox.md',
    '2026-03-09T18:06:00.000Z|/tmp/store-contract'
  ]);

  const reloadedJsonlStore = await createPrototypeStore({ filePath: jsonlStoreFile });
  const reloadedSqliteStore = await createPrototypeStore({ sqliteFilePath: sqliteStoreFile });
  assert.deepEqual(
    reloadedJsonlStore
      .listEvidenceRecords({ newest_first: 'true' })
      .map((record) => `${record.collected_at}|${record.evidence_ref}`),
    orderedRefs
  );
  assert.deepEqual(
    reloadedSqliteStore
      .listEvidenceRecords({ newest_first: 'true' })
      .map((record) => `${record.collected_at}|${record.evidence_ref}`),
    orderedRefs
  );
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

test('JSONL prototype store hard-fails malformed JSONL with bounded redacted details', async () => {
  const storeFile = await createStoreFile();
  const rawLineCanary =
    '{"kind":"event","payload":{"secret":"ghp_1234567890abcdefghijklmnopqrstuvwxyz","webhook":"https://hooks.slack.com/services/T000/B000/XXXXXXXXXXXXXXXXXXXXXXXX"}}';
  await writeFile(
    storeFile,
    [
      JSON.stringify({ kind: 'event', payload: createEvent() }),
      `${rawLineCanary}{`
    ].join('\n') + '\n',
    'utf8'
  );

  await assert.rejects(
    () => createPrototypeStore({ filePath: storeFile }),
    (error) => {
      assert.equal(error.name, 'SyntaxError');
      assert.match(error.message, /JSONL parse error/);
      assert.match(error.message, /line 2/);
      assert.equal(error.message.includes(rawLineCanary), false);
      assert.equal(error.message.includes(storeFile), false);
      assert.equal(error.message.includes('ghp_1234567890abcdefghijklmnopqrstuvwxyz'), false);
      assert.equal(error.message.includes('hooks.slack.com/services'), false);
      return true;
    }
  );
});

test('prototype store summarizes bounded collector snapshot history with exact filters', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });
  const firstReport = createCollectorReport();
  const secondReport = createCollectorReport();
  secondReport.collected_at = '2026-03-09T18:07:00.000Z';
  secondReport.items[0].source_health.workspace_files.status = 'observed';
  secondReport.items[0].source_health.workspace_files.degraded_reasons = [];

  await store.appendCollectorReport(firstReport);
  await store.appendCollectorReport(secondReport);

  const bounded = store.getCollectorSnapshotHistorySummary({ limit: 1 });
  assert.equal(bounded.total_count, 2);
  assert.equal(bounded.returned_limit, 1);
  assert.deepEqual(bounded.items.map((item) => item.collector_snapshot_id), [
    'collector-snapshot:2026-03-09T18:07:00.000Z'
  ]);
  assert.deepEqual(bounded.source_kind_buckets, {
    workspace_root: 1,
    workspace_files: 1,
    tmux_session: 1,
    hermes_profile: 0,
    hermes_session: 0
  });
  assert.deepEqual(bounded.status_buckets, {
    observed: 3,
    degraded: 0,
    missing: 0,
    error: 0
  });
  assert.equal(bounded.items[0].matched_agent_count, 1);
  assert.equal(Object.hasOwn(bounded.items[0], 'items'), false);

  assert.deepEqual(
    store
      .getCollectorSnapshotHistorySummary({
        collector_snapshot_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
        agent_id: 'app-engineering',
        source_kind: 'workspace_file',
        status: 'degraded',
        collected_since: '2026-03-09T18:06:00.000Z',
        collected_until: '2026-03-09T18:06:00.000Z'
      })
      .items.map((item) => item.collector_snapshot_id),
    ['collector-snapshot:2026-03-09T18:06:00.000Z']
  );

  const reloadedStore = await createPrototypeStore({ filePath: storeFile });
  assert.deepEqual(
    reloadedStore.getCollectorSnapshotHistorySummary({ source_kind: 'workspace_file' }),
    store.getCollectorSnapshotHistorySummary({ source_kind: 'workspace_file' })
  );
});

test('prototype store projects collector source health for requested snapshot id', async () => {
  const storeFile = await createStoreFile();
  const store = await createPrototypeStore({ filePath: storeFile });
  const firstReport = createCollectorReport();
  const secondReport = createCollectorReport();
  secondReport.collected_at = '2026-03-09T18:07:00.000Z';
  secondReport.items[0].source_health.workspace_files.status = 'observed';
  secondReport.items[0].source_health.workspace_files.degraded_reasons = [];

  await store.appendCollectorReport(firstReport);
  await store.appendCollectorReport(secondReport);

  const historical = store.getLatestCollectorSourceHealth({
    collector_snapshot_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
    source_kind: 'workspace_file',
    status: 'degraded'
  });
  assert.equal(historical.collector_snapshot_id, 'collector-snapshot:2026-03-09T18:06:00.000Z');
  assert.deepEqual(historical.agent_items.map((item) => item.agent_id), ['app-engineering']);
  assert.equal(
    historical.agent_items[0].collector_snapshot_id,
    'collector-snapshot:2026-03-09T18:06:00.000Z'
  );
  assert.equal(historical.agent_items[0].source_health.workspace_files.status, 'degraded');
  assert.equal(Object.hasOwn(historical.agent_items[0], 'workspace_root'), false);
  assert.equal(Object.hasOwn(historical.agent_items[0], 'session_ref'), false);
  assert.equal(Object.hasOwn(historical.agent_items[0], 'evidence_refs'), false);
  assert.equal(
    Object.hasOwn(historical.agent_items[0].source_health.workspace_files, 'degraded_reasons'),
    false
  );
  assert.equal(JSON.stringify(historical).includes('/tmp/store-contract'), false);
  assert.equal(JSON.stringify(historical).includes('tmux://'), false);

  const latest = store.getLatestCollectorSourceHealth({
    source_kind: 'workspace_file',
    status: 'observed'
  });
  assert.equal(latest.collector_snapshot_id, 'collector-snapshot:2026-03-09T18:07:00.000Z');
  assert.deepEqual(latest.agent_items.map((item) => item.agent_id), ['app-engineering']);

  assert.equal(
    store.getLatestCollectorSourceHealth({
      collector_snapshot_id: 'collector-snapshot:unknown'
    }),
    null
  );
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

test('SQLite prototype store reports sanitized storage index-health without side effects', async () => {
  const sqliteStoreFile = await createSqliteStoreFile();
  const store = await createPrototypeStore({ sqliteFilePath: sqliteStoreFile });

  await store.appendEvent(createEvent());
  await store.appendHeartbeat(createHeartbeat());
  await store.appendCollectorReport(createCollectorReport());

  const before = store.getStorageReplayManifest();
  const health = await store.getStorageIndexHealth();
  assert.deepEqual(health, {
    backend: 'sqlite',
    status: 'ok',
    record_count: 9,
    record_index_count: 9,
    record_evidence_ref_count: 6,
    sidecar_status: 'complete',
    record_kind_buckets: {
      event: 3,
      heartbeat: 2,
      evidence_record: 3,
      collector_snapshot: 1
    },
    latest_record_ts: '2026-03-09T18:06:00.000Z'
  });
  assert.deepEqual(store.getStorageReplayManifest(), before);
  assert.equal(JSON.stringify(health).includes(sqliteStoreFile), false);
  assert.equal(JSON.stringify(health).includes('/tmp/store-contract'), false);
  assert.equal(JSON.stringify(health).includes('store-contract'), false);
  assert.equal(JSON.stringify(health).includes('tmux://'), false);
  assert.equal(JSON.stringify(health).includes('payload'), false);

  await execSqlite(sqliteStoreFile, 'DELETE FROM record_evidence_refs;');
  assert.deepEqual(await store.getStorageIndexHealth(), {
    ...health,
    status: 'degraded',
    record_evidence_ref_count: 0,
    sidecar_status: 'stale'
  });

  await execSqlite(
    sqliteStoreFile,
    [
      'DELETE FROM record_evidence_refs;',
      'INSERT INTO record_evidence_refs(seq, evidence_ref)',
      'SELECT records.seq, json_each.value FROM records, json_each(',
      "CASE WHEN json_type(payload_json, '$.evidence_refs') = 'array'",
      "THEN json_extract(payload_json, '$.evidence_refs')",
      "ELSE json_array(json_extract(payload_json, '$.evidence_ref')) END",
      ') WHERE json_each.value IS NOT NULL;',
      "UPDATE record_index SET evidence_role = NULL WHERE kind = 'evidence_record';"
    ].join(' ')
  );
  assert.deepEqual(await store.getStorageIndexHealth(), {
    ...health,
    status: 'degraded',
    sidecar_status: 'stale'
  });

  await unlink(sqliteStoreFile);
  assert.deepEqual(await store.getStorageIndexHealth(), {
    ...health,
    status: 'degraded',
    record_index_count: null,
    record_evidence_ref_count: null,
    sidecar_status: 'stale'
  });
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

test('SQLite prototype store migrates and backfills evidence-record lookup sidecar columns', async () => {
  const sqliteStoreFile = await createSqliteStoreFile();
  const store = await createPrototypeStore({ sqliteFilePath: sqliteStoreFile });

  await store.appendCollectorReport(createCollectorReport());

  await execSqlite(sqliteStoreFile, 'DROP TABLE record_index;');
  await execSqlite(
    sqliteStoreFile,
    [
      'CREATE TABLE record_index (',
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
      'FOREIGN KEY(seq) REFERENCES records(seq)',
      ');'
    ].join(' ')
  );

  const reloadedStore = await createPrototypeStore({ sqliteFilePath: sqliteStoreFile });
  assert.equal(
    reloadedStore.listEvidenceRecords({
      evidence_role: 'agent_output',
      source_status: 'degraded',
      collector_snapshot_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
      output_candidate: 'true',
      limit: 1
    })[0].evidence_ref,
    '/tmp/store-contract/outbox.md'
  );

  const { stdout: indexStdout } = await execSqlite(
    sqliteStoreFile,
    [
      "SELECT name FROM sqlite_master WHERE type = 'index'",
      "AND name IN ('idx_record_index_evidence_role','idx_record_index_source_status','idx_record_index_collector_snapshot_id','idx_record_index_evidence_query','idx_record_index_observed_at','idx_record_index_collected_at','idx_record_index_output_candidate')",
      'ORDER BY name;'
    ].join(' ')
  );
  assert.deepEqual(indexStdout.trim().split('\n'), [
    'idx_record_index_collected_at',
    'idx_record_index_collector_snapshot_id',
    'idx_record_index_evidence_query',
    'idx_record_index_evidence_role',
    'idx_record_index_observed_at',
    'idx_record_index_output_candidate',
    'idx_record_index_source_status'
  ]);

  const { stdout: evidenceIndexStdout } = await execSqlite(
    sqliteStoreFile,
    [
      'SELECT evidence_role, source_status, collector_snapshot_id,',
      'source_kind, output_candidate, observed_at, collected_at',
      'FROM record_index',
      "WHERE evidence_id LIKE 'ev_collector-snapshot_2026-03-09T18_06_00_000Z_app-engineering_workspace_file%'"
    ].join(' ')
  );
  assert.equal(
    evidenceIndexStdout.trim(),
    'agent_output|degraded|collector-snapshot:2026-03-09T18:06:00.000Z|workspace_file|1|2026-03-09T18:05:20.000Z|2026-03-09T18:06:00.000Z'
  );
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
