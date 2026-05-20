const assert = require('node:assert/strict');
const { chmod, mkdir, mkdtemp, readFile, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { SEED_AGENTS } = require('../src/domain');
const {
  collectControllerSnapshot,
  createControllerSnapshotCollector,
  createHermesRuntimeSourcesReader,
  createHermesRuntimeSourcesFileReader
} = require('../src/collectors/controller-snapshot');
const { createPrototypeStore } = require('../src/store/prototype-store');

function createCollectorReport({ collectedAt, items, evidenceCoverage }) {
  return {
    collected_at: collectedAt,
    actor_id: 'team-lead',
    summary: {
      agent_count: items.length,
      heartbeat_count: items.length,
      tmux_observed_count: items.filter((item) => item.tmux_observations.length > 0).length,
      workspace_observed_count: items.filter((item) => item.workspace_observations.length > 0).length,
      reboot_recommended_count: items.filter((item) => item.heartbeat.reboot_recommended).length
    },
    ...(evidenceCoverage ? { evidence_coverage: evidenceCoverage } : {}),
    items
  };
}

function createReportItem({
  collectedAt,
  agentId,
  evidenceRefs,
  currentState,
  activeTask,
  lastMeaningfulOutputAt,
  lastFileWriteAt,
  currentBlocker = '',
  rebootRecommended = false,
  confidenceLevel = 'high'
}) {
  const agent = SEED_AGENTS.find((candidate) => candidate.agent_id === agentId);

  return {
    agent_id: agentId,
    evidence_refs: evidenceRefs.slice(),
    workspace_observations: evidenceRefs
      .filter((ref) => !ref.startsWith('tmux://'))
      .map((ref) => ({
        path: ref,
        file_name: path.basename(ref),
        kind: 'workspace_file',
        last_modified_at: lastFileWriteAt
      })),
    tmux_observations: evidenceRefs
      .filter((ref) => ref.startsWith('tmux://'))
      .map((ref) => ({
        session_name: ref.replace(/^tmux:\/\/([^/]+)\/.*$/, '$1'),
        window_index: '0',
        pane_index: '0',
        pane_id: '%1',
        pane_title: activeTask,
        pane_current_command: currentState === 'blocked' ? 'bash' : 'nvim',
        pane_active: true,
        pane_dead: currentState === 'blocked',
        pane_activity_at: lastMeaningfulOutputAt
      })),
    supervision: {
      watch_target: agent.watch_target,
      watched_by: agent.watched_by.slice(),
      needs_attention: currentState === 'blocked' || rebootRecommended
    },
    heartbeat: {
      agent_id: agentId,
      actor_id: 'team-lead',
      received_at: collectedAt,
      current_state: currentState,
      active_task: activeTask,
      last_meaningful_output_at: lastMeaningfulOutputAt,
      last_file_write_at: lastFileWriteAt,
      current_blocker: currentBlocker,
      confidence_level: confidenceLevel,
      reboot_recommended: rebootRecommended
    }
  };
}

test('collector derives evidence-backed heartbeats from workspace and tmux metadata', async () => {
  const appAgent = SEED_AGENTS.find((agent) => agent.agent_id === 'app-engineering');
  const growthAgent = SEED_AGENTS.find((agent) => agent.agent_id === 'growth-revenue');
  const statsByPath = new Map([
    [path.join(appAgent.workspace_root, 'todo.md'), { mtime: '2026-03-09T18:04:00.000Z' }],
    [path.join(appAgent.workspace_root, 'outbox.md'), { mtime: '2026-03-09T18:03:00.000Z' }],
    [path.join(growthAgent.workspace_root, 'inbox.md'), { mtime: '2026-03-09T17:59:00.000Z' }]
  ]);

  const report = await collectControllerSnapshot({
    agents: [appAgent, growthAgent],
    collectedAt: '2026-03-09T18:05:00.000Z',
    readPathStat: async (targetPath) => statsByPath.get(targetPath) || null,
    listTmuxPanes: async () => [
      {
        session_name: appAgent.session_ref,
        window_index: '0',
        pane_index: '1',
        pane_id: '%11',
        pane_title: 'Implement HTTP handlers',
        pane_current_command: 'nvim',
        pane_active: true,
        pane_dead: false,
        pane_activity_at: '2026-03-09T18:04:30.000Z'
      },
      {
        session_name: growthAgent.session_ref,
        window_index: '0',
        pane_index: '0',
        pane_id: '%15',
        pane_title: 'stalled shell',
        pane_current_command: 'bash',
        pane_active: true,
        pane_dead: true,
        pane_activity_at: '2026-03-09T17:58:00.000Z'
      }
    ]
  });

  assert.equal(report.collected_at, '2026-03-09T18:05:00.000Z');
  assert.equal(report.summary.agent_count, 2);
  assert.equal(report.summary.tmux_observed_count, 2);
  assert.equal(report.summary.reboot_recommended_count, 1);
  assert.deepEqual(report.shared_artifacts, []);

  const appEngineering = report.items.find((item) => item.agent_id === 'app-engineering');
  assert.equal(appEngineering.heartbeat.current_state, 'coding');
  assert.equal(appEngineering.heartbeat.active_task, 'Implement HTTP handlers');
  assert.equal(appEngineering.heartbeat.last_file_write_at, '2026-03-09T18:04:00.000Z');
  assert.equal(appEngineering.heartbeat.last_meaningful_output_at, '2026-03-09T18:04:30.000Z');
  assert.equal(appEngineering.heartbeat.confidence_level, 'high');
  assert.equal(appEngineering.heartbeat.reboot_recommended, false);
  assert.ok(appEngineering.evidence_refs.includes(path.join(appAgent.workspace_root, 'todo.md')));
  assert.ok(appEngineering.evidence_refs.includes(`tmux://${appAgent.session_ref}/0.1`));
  assert.equal(appEngineering.supervision.watch_target, 'growth-revenue');

  const growthRevenue = report.items.find((item) => item.agent_id === 'growth-revenue');
  assert.equal(growthRevenue.heartbeat.current_state, 'blocked');
  assert.equal(growthRevenue.heartbeat.current_blocker, 'tmux pane marked dead');
  assert.equal(growthRevenue.heartbeat.reboot_recommended, true);
  assert.equal(growthRevenue.heartbeat.last_file_write_at, null);
  assert.equal(growthRevenue.heartbeat.last_meaningful_output_at, '2026-03-09T17:58:00.000Z');
  assert.equal(growthRevenue.heartbeat.confidence_level, 'high');
  assert.equal(growthRevenue.supervision.needs_attention, true);
});

test('collector rolls up shared artifacts referenced by multiple agents in the same snapshot', async () => {
  const sharedWorkspaceRoot = '/tmp/shared-snapshot-workspace';
  const appAgent = {
    ...SEED_AGENTS.find((agent) => agent.agent_id === 'app-engineering'),
    workspace_root: sharedWorkspaceRoot
  };
  const growthAgent = {
    ...SEED_AGENTS.find((agent) => agent.agent_id === 'growth-revenue'),
    workspace_root: sharedWorkspaceRoot
  };

  const report = await collectControllerSnapshot({
    agents: [appAgent, growthAgent],
    collectedAt: '2026-03-09T18:05:00.000Z',
    readPathStat: async (targetPath) => {
      if (targetPath === sharedWorkspaceRoot) {
        return { mtime: '2026-03-09T18:00:00.000Z' };
      }

      if (targetPath === path.join(sharedWorkspaceRoot, 'todo.md')) {
        return { mtime: '2026-03-09T18:04:00.000Z' };
      }

      return null;
    },
    listTmuxPanes: async () => []
  });

  assert.deepEqual(report.shared_artifacts, [
    {
      artifact_ref: path.join(sharedWorkspaceRoot, 'todo.md'),
      artifact_kind: 'workspace_file',
      file_name: 'todo.md',
      agent_ids: ['app-engineering', 'growth-revenue'],
      agent_count: 2,
      mention_count: 2,
      last_seen_at: '2026-03-09T18:04:00.000Z',
      source_kinds: ['workspace_file']
    }
  ]);
  assert.ok(
    report.items.every((item) => item.evidence_refs.includes(path.join(sharedWorkspaceRoot, 'todo.md')))
  );
});

test('collector reports evidence coverage across workspace roots, files, and tmux refs', async () => {
  const appAgent = {
    ...SEED_AGENTS.find((agent) => agent.agent_id === 'app-engineering'),
    workspace_root: '/tmp/evidence-coverage/app-engineering'
  };
  const growthAgent = {
    ...SEED_AGENTS.find((agent) => agent.agent_id === 'growth-revenue'),
    workspace_root: '/tmp/evidence-coverage/growth-revenue'
  };
  const marketAgent = {
    ...SEED_AGENTS.find((agent) => agent.agent_id === 'market-intel'),
    workspace_root: '/tmp/evidence-coverage/market-intel'
  };
  const appTodoRef = path.join(appAgent.workspace_root, 'todo.md');
  const statsByPath = new Map([
    [appAgent.workspace_root, { mtime: '2026-03-09T18:00:00.000Z' }],
    [appTodoRef, { mtime: '2026-03-09T18:04:00.000Z' }],
    [marketAgent.workspace_root, { mtime: '2026-03-09T18:02:00.000Z' }]
  ]);

  const report = await collectControllerSnapshot({
    agents: [appAgent, growthAgent, marketAgent],
    collectedAt: '2026-03-09T18:05:00.000Z',
    readPathStat: async (targetPath) => statsByPath.get(targetPath) || null,
    listTmuxPanes: async () => [
      {
        session_name: appAgent.session_ref,
        window_index: '0',
        pane_index: '1',
        pane_id: '%11',
        pane_title: 'Implement evidence coverage ledger',
        pane_current_command: 'nvim',
        pane_active: true,
        pane_dead: false,
        pane_activity_at: '2026-03-09T18:04:30.000Z'
      }
    ]
  });

  assert.deepEqual(report.evidence_coverage, {
    evidence_ref_count: 4,
    covered_agent_count: 2,
    low_confidence_agent_ids: ['growth-revenue', 'market-intel'],
    source_kind_buckets: {
      workspace_file: 1,
      workspace_root: 2,
      tmux_observation: 1
    },
    agent_items: [
      {
        agent_id: 'app-engineering',
        evidence_ref_count: 3,
        source_kinds: ['tmux_observation', 'workspace_file', 'workspace_root'],
        latest_evidence_at: '2026-03-09T18:04:30.000Z',
        confidence_level: 'high'
      },
      {
        agent_id: 'growth-revenue',
        evidence_ref_count: 0,
        source_kinds: [],
        latest_evidence_at: null,
        confidence_level: 'low'
      },
      {
        agent_id: 'market-intel',
        evidence_ref_count: 1,
        source_kinds: ['workspace_root'],
        latest_evidence_at: '2026-03-09T18:02:00.000Z',
        confidence_level: 'medium'
      }
    ]
  });
  assert.deepEqual(report.shared_artifacts, []);
});

test('collector reports source health for missing tmux sessions and unmapped tmux evidence', async () => {
  const appAgent = {
    ...SEED_AGENTS.find((agent) => agent.agent_id === 'app-engineering'),
    workspace_root: '/tmp/source-health/app-engineering'
  };
  const statsByPath = new Map([
    [appAgent.workspace_root, { mtime: '2026-03-09T18:00:00.000Z' }],
    [path.join(appAgent.workspace_root, 'inbox.md'), { mtime: '2026-03-09T18:01:00.000Z' }]
  ]);

  const report = await collectControllerSnapshot({
    agents: [appAgent],
    collectedAt: '2026-03-09T18:05:00.000Z',
    readPathStat: async (targetPath) => statsByPath.get(targetPath) || null,
    listTmuxPanes: async () => [
      {
        session_name: 'unseeded-runtime-session',
        window_index: '0',
        pane_index: '0',
        pane_id: '%99',
        pane_title: 'outside seeded roster',
        pane_current_command: 'bash',
        pane_active: true,
        pane_dead: false,
        pane_activity_at: '2026-03-09T18:04:00.000Z'
      }
    ]
  });

  const appEngineering = report.items[0];
  assert.deepEqual(appEngineering.source_health, {
    workspace_root: {
      status: 'observed',
      path: appAgent.workspace_root,
      last_observed_at: '2026-03-09T18:00:00.000Z',
      degraded_reasons: []
    },
    workspace_files: {
      status: 'degraded',
      expected_files: ['inbox.md', 'outbox.md', 'todo.md'],
      observed_count: 1,
      missing_count: 2,
      error_count: 0,
      last_observed_at: '2026-03-09T18:01:00.000Z',
      degraded_reasons: ['missing workspace files: outbox.md, todo.md']
    },
    tmux_session: {
      status: 'missing',
      expected_session_ref: appAgent.session_ref,
      observed_count: 0,
      last_observed_at: null,
      degraded_reasons: ['tmux session not observed']
    }
  });
  assert.deepEqual(report.runtime_source_evidence, {
    unmapped_tmux_sessions: [
      {
        session_name: 'unseeded-runtime-session',
        observed_count: 1,
        last_observed_at: '2026-03-09T18:04:00.000Z',
        pane_refs: ['tmux://unseeded-runtime-session/0.0']
      }
    ]
  });
});

test('collector treats inbox-only workspace evidence as inbound presence, not agent output', async () => {
  const appAgent = {
    ...SEED_AGENTS.find((agent) => agent.agent_id === 'app-engineering'),
    workspace_root: '/tmp/inbound-only/app-engineering'
  };
  const inboxRef = path.join(appAgent.workspace_root, 'inbox.md');
  const statsByPath = new Map([
    [appAgent.workspace_root, { mtime: '2026-03-09T18:00:00.000Z' }],
    [inboxRef, { mtime: '2026-03-09T18:04:00.000Z' }]
  ]);

  const report = await collectControllerSnapshot({
    agents: [appAgent],
    collectedAt: '2026-03-09T18:05:00.000Z',
    readPathStat: async (targetPath) => statsByPath.get(targetPath) || null,
    listTmuxPanes: async () => []
  });

  const item = report.items[0];
  assert.equal(item.heartbeat.current_state, 'idle');
  assert.equal(item.heartbeat.active_task, 'No evidence captured');
  assert.equal(item.heartbeat.last_meaningful_output_at, null);
  assert.equal(item.heartbeat.last_file_write_at, null);
  assert.equal(
    item.workspace_observations.find((observation) => observation.path === appAgent.workspace_root)
      .evidence_role,
    'workspace_presence'
  );
  assert.equal(
    item.workspace_observations.find((observation) => observation.path === inboxRef).evidence_role,
    'inbound_task'
  );
  assert.ok(item.evidence_refs.includes(appAgent.workspace_root));
  assert.ok(item.evidence_refs.includes(inboxRef));
  assert.deepEqual(report.evidence_coverage.source_kind_buckets, {
    workspace_file: 1,
    workspace_root: 1,
    tmux_observation: 0
  });
  assert.equal(item.source_health.workspace_files.observed_count, 1);
  assert.equal(item.source_health.workspace_files.missing_count, 2);

  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-store-'));
  const store = await createPrototypeStore({ filePath: path.join(root, 'prototype-store.jsonl') });
  await store.appendCollectorReport(report);

  const evidenceRecords = store.listEvidenceRecords();
  assert.equal(evidenceRecords.length, 4);
  assert.deepEqual(
    evidenceRecords.map((record) => ({
      evidence_ref: record.evidence_ref,
      evidence_role: record.evidence_role,
      source_status: record.source_status,
      output_candidate: record.output_candidate
    })),
    [
      {
        evidence_ref: appAgent.workspace_root,
        evidence_role: 'workspace_presence',
        source_status: 'observed',
        output_candidate: false
      },
      {
        evidence_ref: inboxRef,
        evidence_role: 'inbound_task',
        source_status: 'degraded',
        output_candidate: false
      },
      {
        evidence_ref: path.join(appAgent.workspace_root, 'outbox.md'),
        evidence_role: 'agent_output',
        source_status: 'missing',
        output_candidate: false
      },
      {
        evidence_ref: path.join(appAgent.workspace_root, 'todo.md'),
        evidence_role: 'agent_plan',
        source_status: 'missing',
        output_candidate: false
      }
    ]
  );
  assert.deepEqual(store.listEvents({ agent_id: 'app-engineering' }), []);
  assert.deepEqual(store.getCounts(), {
    agent_count: 7,
    event_count: 0,
    heartbeat_count: 0
  });
  assert.equal(store.getAgent('app-engineering').current_state, 'idle');
  assert.equal(store.getAgent('app-engineering').last_meaningful_output_at, null);
  assert.equal(store.getAgent('app-engineering').last_file_write_at, null);
});

test('collector treats injected Hermes runtime facts as source evidence only', async () => {
  const appAgent = {
    ...SEED_AGENTS.find((agent) => agent.agent_id === 'app-engineering'),
    workspace_root: '/tmp/hermes-runtime-source/app-engineering'
  };
  const readHermesRuntimeSources = async () => [
    {
      source_kind: 'hermes_profile',
      agent_id: 'app-engineering',
      profile_id: 'app-profile',
      status: 'observed',
      last_observed_at: '2026-03-09T18:02:00.000Z',
      metadata: { pid: 123 }
    },
    {
      source_kind: 'hermes_session',
      session_ref: appAgent.session_ref,
      evidence_ref: `hermes://session/${appAgent.session_ref}`,
      status: 'degraded',
      observed_at: '2026-03-09T18:03:00.000Z',
      degraded_reasons: ['session heartbeat stale']
    },
    {
      source_kind: 'hermes_profile',
      profile_id: 'unmapped-worker',
      status: 'observed',
      observed_at: '2026-03-09T18:04:00.000Z'
    },
    {
      source_kind: 'tmux_observation',
      evidence_ref: 'tmux://noise/0.0'
    },
    {
      source_kind: 'hermes_session',
      status: 'observed'
    },
    null
  ];

  const report = await collectControllerSnapshot({
    agents: [appAgent],
    collectedAt: '2026-03-09T18:05:00.000Z',
    readPathStat: async () => null,
    listTmuxPanes: async () => [],
    readHermesRuntimeSources
  });

  const item = report.items[0];
  assert.equal(item.heartbeat.current_state, 'idle');
  assert.equal(item.heartbeat.active_task, 'No evidence captured');
  assert.equal(item.heartbeat.last_meaningful_output_at, null);
  assert.equal(item.heartbeat.last_file_write_at, null);
  assert.deepEqual(item.hermes_runtime_observations, [
    {
      source_kind: 'hermes_profile',
      agent_id: 'app-engineering',
      profile_id: 'app-profile',
      session_ref: null,
      evidence_ref: 'hermes://profile/app-profile',
      status: 'observed',
      last_observed_at: '2026-03-09T18:02:00.000Z',
      degraded_reasons: [],
      metadata: { pid: 123 }
    },
    {
      source_kind: 'hermes_session',
      agent_id: null,
      profile_id: null,
      session_ref: appAgent.session_ref,
      evidence_ref: `hermes://session/${appAgent.session_ref}`,
      status: 'degraded',
      last_observed_at: '2026-03-09T18:03:00.000Z',
      degraded_reasons: ['session heartbeat stale'],
      metadata: {}
    }
  ]);
  assert.deepEqual(item.source_health.hermes_profile, {
    status: 'observed',
    profile_id: 'app-profile',
    evidence_ref: 'hermes://profile/app-profile',
    last_observed_at: '2026-03-09T18:02:00.000Z',
    degraded_reasons: []
  });
  assert.deepEqual(item.source_health.hermes_session, {
    status: 'degraded',
    expected_session_ref: appAgent.session_ref,
    evidence_ref: `hermes://session/${appAgent.session_ref}`,
    last_observed_at: '2026-03-09T18:03:00.000Z',
    degraded_reasons: ['session heartbeat stale']
  });
  assert.ok(item.evidence_refs.includes('hermes://profile/app-profile'));
  assert.ok(item.evidence_refs.includes(`hermes://session/${appAgent.session_ref}`));
  assert.ok(item.heartbeat.evidence_refs.includes('hermes://profile/app-profile'));
  assert.ok(item.supervision.evidence_refs.includes(`hermes://session/${appAgent.session_ref}`));
  assert.deepEqual(report.evidence_coverage.source_kind_buckets, {
    workspace_file: 0,
    workspace_root: 0,
    tmux_observation: 0,
    hermes_profile: 1,
    hermes_session: 1
  });
  assert.deepEqual(report.runtime_source_evidence.unmapped_hermes_sources, [
    {
      source_kind: 'hermes_profile',
      evidence_ref: 'hermes://profile/unmapped-worker',
      profile_id: 'unmapped-worker',
      session_ref: null,
      observed_at: '2026-03-09T18:04:00.000Z',
      status: 'observed',
      degraded_reasons: []
    }
  ]);

  const collector = createControllerSnapshotCollector({
    agents: [appAgent],
    readPathStat: async () => null,
    listTmuxPanes: async () => [],
    readHermesRuntimeSources
  });
  const factoryReport = await collector.collectSnapshot({
    collectedAt: '2026-03-09T18:05:00.000Z'
  });

  assert.deepEqual(factoryReport.items[0].hermes_runtime_observations, item.hermes_runtime_observations);
});

test('collector treats injected task evidence facts as evidence only', async () => {
  const appAgent = {
    ...SEED_AGENTS.find((agent) => agent.agent_id === 'app-engineering'),
    workspace_root: '/tmp/task-evidence-source/app-engineering'
  };

  const report = await collectControllerSnapshot({
    agents: [appAgent],
    collectedAt: '2026-05-20T02:00:00.000Z',
    readPathStat: async () => null,
    listTmuxPanes: async () => [],
    readTaskEvidenceCandidates: async () => ({
      candidates: [
        {
          task_ref: 'TASK-200',
          source_kind: 'kanban_fixture',
          observed_at: '2026-05-20T01:00:00.000Z',
          correlation_id: 'corr-task',
          agent_id: 'app-engineering',
          id: 'fixture-row-200'
        },
        {
          task_ref: 'TASK-201',
          source_kind: 'linear_fixture',
          observed_at: '2026-05-20T01:01:00.000Z',
          correlation_id: 'corr-unmapped'
        }
      ],
      rejected: []
    })
  });

  const item = report.items[0];
  assert.equal(item.heartbeat.current_state, 'idle');
  assert.equal(item.heartbeat.active_task, 'No evidence captured');
  assert.equal(item.heartbeat.last_meaningful_output_at, null);
  assert.equal(item.heartbeat.last_file_write_at, null);
  assert.deepEqual(item.task_evidence_observations, [
    {
      status: 'observed',
      task_ref: 'TASK-200',
      source_kind: 'kanban_fixture',
      observed_at: '2026-05-20T01:00:00.000Z',
      correlation_id: 'corr-task',
      agent_id: 'app-engineering',
      evidence_ref: 'task://kanban_fixture/TASK-200',
      fact_id: 'fixture-row-200',
      source_index: 0
    }
  ]);
  assert.ok(item.evidence_refs.includes('task://kanban_fixture/TASK-200'));
  assert.ok(item.heartbeat.evidence_refs.includes('task://kanban_fixture/TASK-200'));
  assert.ok(item.supervision.evidence_refs.includes('task://kanban_fixture/TASK-200'));
  assert.deepEqual(report.evidence_coverage.source_kind_buckets, {
    workspace_file: 0,
    workspace_root: 0,
    tmux_observation: 0,
    task_evidence: 1
  });
  assert.deepEqual(report.runtime_source_evidence.unmapped_task_evidence, [
    {
      status: 'observed',
      task_ref: 'TASK-201',
      source_kind: 'linear_fixture',
      observed_at: '2026-05-20T01:01:00.000Z',
      correlation_id: 'corr-unmapped',
      evidence_ref: 'task://linear_fixture/TASK-201',
      source_index: 1
    }
  ]);

  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes('dispatch'), false);
});

test('collector rejects invalid task evidence input before producing a snapshot', async () => {
  await assert.rejects(
    collectControllerSnapshot({
      agents: [SEED_AGENTS.find((agent) => agent.agent_id === 'app-engineering')],
      collectedAt: '2026-05-20T02:00:00.000Z',
      readPathStat: async () => null,
      listTmuxPanes: async () => [],
      readTaskEvidenceCandidates: async () => ({
        candidates: [],
        rejected: [
          {
            status: 'invalid',
            index: null,
            missing_fields: ['file'],
            error: '/tmp/private/token=task-secret'
          }
        ]
      })
    }),
    (error) => {
      assert.match(error.message, /Invalid task evidence input: 1 rejected task evidence record/);
      assert.equal(error.message.includes('/tmp/private'), false);
      assert.equal(error.message.includes('token='), false);
      return true;
    }
  );
});

test('collector degrades duplicate Hermes runtime mappings without promoting unsafe facts', async () => {
  const appAgent = {
    ...SEED_AGENTS.find((agent) => agent.agent_id === 'app-engineering'),
    workspace_root: '/tmp/hermes-duplicate-runtime-source/app-engineering'
  };

  const report = await collectControllerSnapshot({
    agents: [appAgent],
    collectedAt: '2026-03-09T18:05:00.000Z',
    readPathStat: async () => null,
    listTmuxPanes: async () => [],
    readHermesRuntimeSources: async () => [
      {
        source_kind: 'hermes_profile',
        agent_id: 'app-engineering',
        profile_id: 'app-profile-primary',
        observed_at: '2026-03-09T18:01:00.000Z'
      },
      {
        source_kind: 'hermes_profile',
        agent_id: 'app-engineering',
        profile_id: 'app-profile-shadow',
        observed_at: '2026-03-09T18:02:00.000Z'
      },
      {
        source_kind: 'hermes_session',
        session_ref: appAgent.session_ref,
        evidence_ref: `hermes://session/${appAgent.session_ref}`,
        observed_at: '2026-03-09T18:03:00.000Z'
      },
      {
        source_kind: 'hermes_session',
        session_ref: appAgent.session_ref,
        evidence_ref: `hermes://session/${appAgent.session_ref}#duplicate`,
        observed_at: '2026-03-09T18:04:00.000Z'
      }
    ]
  });

  const item = report.items[0];
  assert.equal(item.heartbeat.last_meaningful_output_at, null);
  assert.deepEqual(item.hermes_runtime_observations, []);
  assert.deepEqual(item.source_health.hermes_profile, {
    status: 'degraded',
    profile_id: 'app-engineering',
    evidence_ref: null,
    last_observed_at: '2026-03-09T18:02:00.000Z',
    degraded_reasons: ['Hermes profile duplicate mapping']
  });
  assert.deepEqual(item.source_health.hermes_session, {
    status: 'degraded',
    expected_session_ref: appAgent.session_ref,
    evidence_ref: null,
    last_observed_at: '2026-03-09T18:04:00.000Z',
    degraded_reasons: ['Hermes session duplicate mapping']
  });
  assert.deepEqual(
    report.runtime_source_evidence.unmapped_hermes_sources.map((source) => [
      source.source_kind,
      source.evidence_ref,
      source.status,
      source.degraded_reasons
    ]),
    [
      ['hermes_profile', 'hermes://profile/app-profile-primary', 'degraded', ['Hermes profile duplicate mapping']],
      ['hermes_profile', 'hermes://profile/app-profile-shadow', 'degraded', ['Hermes profile duplicate mapping']],
      ['hermes_session', `hermes://session/${appAgent.session_ref}`, 'degraded', ['Hermes session duplicate mapping']],
      ['hermes_session', `hermes://session/${appAgent.session_ref}#duplicate`, 'degraded', ['Hermes session duplicate mapping']]
    ]
  );

  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-hermes-duplicate-'));
  const store = await createPrototypeStore({ filePath: path.join(root, 'prototype-store.jsonl') });
  await store.appendCollectorReport(report);
  const unsafeRecords = store.listEvidenceRecords({ source_status: 'degraded' });
  assert.deepEqual(
    unsafeRecords.map((record) => ({
      agent_id: record.agent_id,
      evidence_role: record.evidence_role,
      output_candidate: record.output_candidate,
      evidence_ref: record.evidence_ref
    })),
    report.runtime_source_evidence.unmapped_hermes_sources.map((source) => ({
      agent_id: null,
      evidence_role: 'runtime_unmapped',
      output_candidate: false,
      evidence_ref: source.evidence_ref
    }))
  );
});

test('collector keeps shared Hermes runtime refs out of shared artifact rollups', async () => {
  const appAgent = {
    ...SEED_AGENTS.find((agent) => agent.agent_id === 'app-engineering'),
    workspace_root: '/tmp/hermes-shared-ref/app-engineering'
  };
  const protocolAgent = {
    ...SEED_AGENTS.find((agent) => agent.agent_id === 'protocol-engineering'),
    workspace_root: '/tmp/hermes-shared-ref/protocol-engineering'
  };

  const report = await collectControllerSnapshot({
    agents: [appAgent, protocolAgent],
    collectedAt: '2026-03-09T18:05:00.000Z',
    readPathStat: async () => null,
    listTmuxPanes: async () => [],
    readHermesRuntimeSources: async () => [
      {
        source_kind: 'hermes_profile',
        agent_id: 'app-engineering',
        evidence_ref: 'hermes://profile/shared-runtime',
        status: 'observed',
        observed_at: '2026-03-09T18:02:00.000Z'
      },
      {
        source_kind: 'hermes_profile',
        agent_id: 'protocol-engineering',
        evidence_ref: 'hermes://profile/shared-runtime',
        status: 'observed',
        observed_at: '2026-03-09T18:02:00.000Z'
      }
    ]
  });

  assert.deepEqual(report.shared_artifacts, []);
  assert.deepEqual(report.items.map((item) => item.evidence_refs), [[], []]);
  assert.deepEqual(report.items.map((item) => item.hermes_runtime_observations), [[], []]);
  assert.deepEqual(
    report.items.map((item) => ({
      agent_id: item.agent_id,
      hermes_profile: item.source_health.hermes_profile
    })),
    [
      {
        agent_id: 'app-engineering',
        hermes_profile: {
          status: 'degraded',
          profile_id: 'app-engineering',
          evidence_ref: null,
          last_observed_at: '2026-03-09T18:02:00.000Z',
          degraded_reasons: ['Hermes profile duplicate mapping']
        }
      },
      {
        agent_id: 'protocol-engineering',
        hermes_profile: {
          status: 'degraded',
          profile_id: 'protocol-engineering',
          evidence_ref: null,
          last_observed_at: '2026-03-09T18:02:00.000Z',
          degraded_reasons: ['Hermes profile duplicate mapping']
        }
      }
    ]
  );
  assert.deepEqual(
    report.runtime_source_evidence.unmapped_hermes_sources.map((source) => [
      source.source_kind,
      source.evidence_ref,
      source.status,
      source.degraded_reasons
    ]),
    [
      ['hermes_profile', 'hermes://profile/shared-runtime', 'degraded', ['Hermes profile duplicate mapping']],
      ['hermes_profile', 'hermes://profile/shared-runtime', 'degraded', ['Hermes profile duplicate mapping']]
    ]
  );

  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-hermes-shared-ref-'));
  const store = await createPrototypeStore({ filePath: path.join(root, 'prototype-store.jsonl') });
  await store.appendCollectorReport(report);
  const sharedRefRecords = store.listEvidenceRecords({
    source_kind: 'hermes_profile',
    evidence_role: 'runtime_unmapped',
    evidence_ref: 'hermes://profile/shared-runtime'
  });
  assert.deepEqual(
    sharedRefRecords.map((record) => ({
      agent_id: record.agent_id,
      evidence_ref: record.evidence_ref,
      evidence_role: record.evidence_role,
      output_candidate: record.output_candidate
    })),
    [
      {
        agent_id: null,
        evidence_ref: 'hermes://profile/shared-runtime',
        evidence_role: 'runtime_unmapped',
        output_candidate: false
      },
      {
        agent_id: null,
        evidence_ref: 'hermes://profile/shared-runtime',
        evidence_role: 'runtime_unmapped',
        output_candidate: false
      }
    ]
  );
  assert.deepEqual(report.evidence_coverage.source_kind_buckets, {
    workspace_file: 0,
    workspace_root: 0,
    tmux_observation: 0
  });
});

test('collector can read opt-in Hermes runtime facts from JSON and JSONL files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-hermes-runtime-'));
  const jsonFile = path.join(root, 'runtime-facts.json');
  const jsonlFile = path.join(root, 'runtime-facts.jsonl');

  await writeFile(
    jsonFile,
    JSON.stringify([
      {
        source_kind: 'hermes_profile',
        agent_id: 'app-engineering',
        profile_id: 'app-profile',
        observed_at: '2026-03-09T18:02:00.000Z'
      }
    ])
  );
  await writeFile(
    jsonlFile,
    `${JSON.stringify({
      source_kind: 'hermes_session',
      session_ref: '5-web3-app-engineering',
      status: 'degraded',
      observed_at: '2026-03-09T18:03:00.000Z',
      degraded_reasons: ['session heartbeat stale']
    })}\n`
  );

  const jsonFacts = await createHermesRuntimeSourcesFileReader({ filePath: jsonFile })();
  const jsonlFacts = await createHermesRuntimeSourcesFileReader({ filePath: jsonlFile })();

  assert.deepEqual(
    jsonFacts,
    [
      {
        source_kind: 'hermes_profile',
        agent_id: 'app-engineering',
        profile_id: 'app-profile',
        session_ref: null,
        evidence_ref: 'hermes://profile/app-profile',
        status: 'observed',
        last_observed_at: '2026-03-09T18:02:00.000Z',
        degraded_reasons: [],
        metadata: {},
        source_provenance: {
          source_format: 'json_array',
          source_index: 0,
          source_input_ordinal: 1,
          source_file_ordinal: 1
        }
      }
    ]
  );
  assert.deepEqual(jsonlFacts, [
    {
      source_kind: 'hermes_session',
      agent_id: null,
      profile_id: null,
      session_ref: '5-web3-app-engineering',
      evidence_ref: 'hermes://session/5-web3-app-engineering',
      status: 'degraded',
      last_observed_at: '2026-03-09T18:03:00.000Z',
      degraded_reasons: ['session heartbeat stale'],
      metadata: {},
      source_provenance: {
        source_format: 'jsonl',
        source_index: 0,
        line: 1,
        source_input_ordinal: 1,
        source_file_ordinal: 1
      }
    }
  ]);
});

test('collector can read opt-in Hermes runtime facts from multiple files and directories', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-hermes-runtime-'));
  const sourcesDir = path.join(root, 'runtime-sources');
  const ignoredFile = path.join(sourcesDir, 'ignore.txt');
  const profileFile = path.join(sourcesDir, '01-profile.json');
  const sessionFile = path.join(sourcesDir, '02-session.jsonl');
  const extraFile = path.join(root, 'extra.jsonl');
  await mkdir(sourcesDir);
  await writeFile(ignoredFile, 'not runtime evidence');
  await writeFile(
    profileFile,
    JSON.stringify([
      {
        source_kind: 'hermes_profile',
        agent_id: 'app-engineering',
        profile_id: 'app-profile',
        observed_at: '2026-03-09T18:02:00.000Z'
      }
    ])
  );
  await writeFile(
    sessionFile,
    `${JSON.stringify({
      source_kind: 'hermes_session',
      session_ref: '5-web3-app-engineering',
      observed_at: '2026-03-09T18:03:00.000Z'
    })}\n`
  );
  await writeFile(
    extraFile,
    `${JSON.stringify({
      source_kind: 'hermes_profile',
      profile_id: 'unmapped-worker',
      observed_at: '2026-03-09T18:04:00.000Z'
    })}\n`
  );

  const facts = await createHermesRuntimeSourcesReader({
    inputPaths: [sourcesDir, extraFile]
  })();

  assert.deepEqual(
    facts.map((fact) => [
      fact.source_kind,
      fact.evidence_ref,
      fact.last_observed_at,
      fact.source_provenance.source_input_ordinal,
      fact.source_provenance.source_file_ordinal
    ]),
    [
      ['hermes_profile', 'hermes://profile/app-profile', '2026-03-09T18:02:00.000Z', 1, 1],
      ['hermes_session', 'hermes://session/5-web3-app-engineering', '2026-03-09T18:03:00.000Z', 1, 2],
      ['hermes_profile', 'hermes://profile/unmapped-worker', '2026-03-09T18:04:00.000Z', 2, 3]
    ]
  );
  assert.equal(facts.some((fact) => String(fact.evidence_ref).includes(root)), false);
  assert.equal(facts.some((fact) => JSON.stringify(fact.source_provenance).includes(root)), false);
});

test('collector labels missing Hermes runtime source inputs without leaking paths', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-hermes-runtime-'));
  const missingFile = path.join(root, 'missing-runtime-facts.jsonl');

  await assert.rejects(
    () =>
      createHermesRuntimeSourcesReader({
        inputPaths: [missingFile]
      })(),
    (error) => {
      assert.match(error.message, /Hermes runtime source input 1/);
      assert.equal(error.message.includes(root), false);
      assert.equal(error.message.includes(missingFile), false);
      return true;
    }
  );
});

test('collector legacy Hermes runtime source file reader labels read failures without leaking paths', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-hermes-runtime-'));
  const missingFile = path.join(root, 'missing-runtime-facts.jsonl');

  await assert.rejects(
    () => createHermesRuntimeSourcesFileReader({ filePath: missingFile })(),
    (error) => {
      assert.match(error.message, /Hermes runtime sources file/);
      assert.equal(error.message.includes(root), false);
      assert.equal(error.message.includes(missingFile), false);
      return true;
    }
  );
});

test('collector labels malformed Hermes runtime source files without echoing input contents', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-hermes-runtime-'));
  const invalidJsonFile = path.join(root, 'invalid-runtime-facts.json');
  const invalidJsonlFile = path.join(root, 'invalid-runtime-facts.jsonl');
  await writeFile(invalidJsonFile, `[${JSON.stringify(root)}`);
  await writeFile(invalidJsonlFile, `${root}\n`);

  await assert.rejects(
    () => createHermesRuntimeSourcesFileReader({ filePath: invalidJsonFile })(),
    (error) => {
      assert.match(error.message, /Invalid Hermes runtime sources JSON in Hermes runtime sources file/);
      assert.match(error.message, /invalid JSON syntax/);
      assert.equal(error.message.includes(root), false);
      assert.equal(error.message.includes(invalidJsonFile), false);
      return true;
    }
  );
  await assert.rejects(
    () => createHermesRuntimeSourcesFileReader({ filePath: invalidJsonlFile })(),
    (error) => {
      assert.match(error.message, /Invalid Hermes runtime sources JSONL in Hermes runtime sources file/);
      assert.match(error.message, /invalid JSON syntax/);
      assert.equal(error.message.includes(root), false);
      assert.equal(error.message.includes(invalidJsonlFile), false);
      return true;
    }
  );
});

test('collector labels unreadable Hermes runtime source files without leaking paths', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-hermes-runtime-'));
  const sourcesDir = path.join(root, 'runtime-sources');
  const validFile = path.join(sourcesDir, '01-valid.jsonl');
  const unreadableFile = path.join(sourcesDir, '02-unreadable.jsonl');
  await mkdir(sourcesDir);
  await writeFile(
    validFile,
    `${JSON.stringify({
      source_kind: 'hermes_session',
      session_ref: '5-web3-app-engineering'
    })}\n`
  );
  await writeFile(unreadableFile, '{}\n');
  await chmod(unreadableFile, 0);

  await assert.rejects(
    () =>
      createHermesRuntimeSourcesReader({
        inputPaths: [sourcesDir]
      })(),
    (error) => {
      assert.match(error.message, /Hermes runtime source file 2/);
      assert.equal(error.message.includes(root), false);
      assert.equal(error.message.includes(sourcesDir), false);
      assert.equal(error.message.includes(unreadableFile), false);
      return true;
    }
  );
});

test('collector rejects invalid opt-in Hermes runtime files before producing a report', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-hermes-runtime-'));
  const invalidFile = path.join(root, 'runtime-facts.jsonl');
  await writeFile(
    invalidFile,
    `${JSON.stringify({
      source_kind: 'hermes_profile',
      profile_id: 'app-profile',
      observed_at: 'not-a-date'
    })}\n`
  );

  const collector = createControllerSnapshotCollector({
    agents: [SEED_AGENTS.find((agent) => agent.agent_id === 'app-engineering')],
    readPathStat: async () => null,
    listTmuxPanes: async () => [],
    readHermesRuntimeSources: createHermesRuntimeSourcesFileReader({ filePath: invalidFile })
  });

  await assert.rejects(
    () => collector.collectSnapshot({ collectedAt: '2026-03-09T18:05:00.000Z' }),
    /invalid observed timestamp/
  );
});

test('store keeps runtime source gaps from overwriting agent output state', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-store-'));
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });

  await store.appendCollectorReport(
    createCollectorReport({
      collectedAt: '2026-03-09T18:05:00.000Z',
      items: [
        createReportItem({
          collectedAt: '2026-03-09T18:05:00.000Z',
          agentId: 'app-engineering',
          evidenceRefs: ['/tmp/app-engineering/outbox.md'],
          currentState: 'coding',
          activeTask: 'Implement runtime contract',
          lastMeaningfulOutputAt: '2026-03-09T18:04:30.000Z',
          lastFileWriteAt: '2026-03-09T18:04:00.000Z'
        })
      ]
    })
  );

  const sourceGapReport = await collectControllerSnapshot({
    agents: [
      {
        ...SEED_AGENTS.find((agent) => agent.agent_id === 'app-engineering'),
        workspace_root: '/tmp/runtime-source-gap/app-engineering'
      }
    ],
    collectedAt: '2026-03-09T18:10:00.000Z',
    readPathStat: async (targetPath) => {
      if (targetPath === '/tmp/runtime-source-gap/app-engineering') {
        return { mtime: '2026-03-09T18:09:00.000Z' };
      }

      if (targetPath === '/tmp/runtime-source-gap/app-engineering/inbox.md') {
        return { mtime: '2026-03-09T18:09:30.000Z' };
      }

      return null;
    },
    listTmuxPanes: async () => []
  });

  await store.appendCollectorReport(sourceGapReport);

  const agent = store.getAgent('app-engineering');
  assert.equal(agent.current_state, 'coding');
  assert.equal(agent.active_task, 'Implement runtime contract');
  assert.equal(agent.last_meaningful_output_at, '2026-03-09T18:04:30.000Z');
  assert.equal(agent.last_file_write_at, '2026-03-09T18:04:00.000Z');
  assert.deepEqual(store.listEvents({ agent_id: 'app-engineering' }).map((event) => event.event_type), [
    'agent_state_changed',
    'agent_wrote_file'
  ]);
  assert.deepEqual(store.getCounts(), {
    agent_count: 7,
    event_count: 2,
    heartbeat_count: 1
  });

  const latestReport = store.getLatestCollectorReport();
  assert.equal(latestReport.summary.heartbeat_count, 0);

  const sourceHealth = store.getLatestCollectorSourceHealth();
  assert.equal(sourceHealth.agent_items[0].source_health.workspace_files.status, 'degraded');
  assert.equal(sourceHealth.agent_items[0].source_health.tmux_session.status, 'missing');
  assert.deepEqual(sourceHealth.agent_items[0].evidence_refs.slice().sort(), [
    '/tmp/runtime-source-gap/app-engineering',
    '/tmp/runtime-source-gap/app-engineering/inbox.md'
  ]);
});

test('store persists missing and error expected workspace files as non-output evidence', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-store-'));
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });
  const appAgent = {
    ...SEED_AGENTS.find((agent) => agent.agent_id === 'app-engineering'),
    workspace_root: '/tmp/negative-workspace-gap/app-engineering'
  };

  const report = await collectControllerSnapshot({
    agents: [appAgent],
    collectedAt: '2026-03-09T18:10:00.000Z',
    readPathStat: async (targetPath) => {
      if (targetPath === appAgent.workspace_root) {
        return { mtime: '2026-03-09T18:09:00.000Z' };
      }

      if (targetPath.endsWith('/outbox.md')) {
        throw new Error('permission denied');
      }

      return null;
    },
    listTmuxPanes: async () => []
  });

  await store.appendCollectorReport(report);

  assert.deepEqual(store.getCounts(), {
    agent_count: 7,
    event_count: 0,
    heartbeat_count: 0
  });
  assert.equal(store.getAgent('app-engineering').last_meaningful_output_at, null);

  const gapRecords = store.listEvidenceRecords({
    agent_id: 'app-engineering',
    source_kind: 'workspace_file',
    output_candidate: 'false',
    limit: 10
  });
  assert.deepEqual(
    gapRecords.map((record) => ({
      evidence_ref: record.evidence_ref,
      evidence_role: record.evidence_role,
      source_status: record.source_status,
      output_candidate: record.output_candidate,
      observed_at: record.observed_at,
      collector_snapshot_id: record.collector_snapshot_id,
      degraded_reasons: record.degraded_reasons
    })),
    [
      {
        evidence_ref: '/tmp/negative-workspace-gap/app-engineering/inbox.md',
        evidence_role: 'inbound_task',
        source_status: 'missing',
        output_candidate: false,
        observed_at: null,
        collector_snapshot_id: 'collector-snapshot:2026-03-09T18:10:00.000Z',
        degraded_reasons: ['missing workspace file']
      },
      {
        evidence_ref: '/tmp/negative-workspace-gap/app-engineering/outbox.md',
        evidence_role: 'agent_output',
        source_status: 'error',
        output_candidate: false,
        observed_at: null,
        collector_snapshot_id: 'collector-snapshot:2026-03-09T18:10:00.000Z',
        degraded_reasons: ['permission denied']
      },
      {
        evidence_ref: '/tmp/negative-workspace-gap/app-engineering/todo.md',
        evidence_role: 'agent_plan',
        source_status: 'missing',
        output_candidate: false,
        observed_at: null,
        collector_snapshot_id: 'collector-snapshot:2026-03-09T18:10:00.000Z',
        degraded_reasons: ['missing workspace file']
      }
    ]
  );
  assert.deepEqual(
    store.listEvidenceRecords({
      source_status: 'error',
      evidence_ref: '/tmp/negative-workspace-gap/app-engineering/outbox.md'
    }).map((record) => record.metadata),
    [
      {
        file_name: 'outbox.md',
        path: '/tmp/negative-workspace-gap/app-engineering/outbox.md',
        source_health_key: 'workspace_files'
      }
    ]
  );
});

test('store appends collector heartbeats and exposes the latest collector report', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-store-'));
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });

  const report = {
    collected_at: '2026-03-09T18:05:00.000Z',
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
          latest_evidence_at: '2026-03-09T18:04:30.000Z',
          confidence_level: 'high'
        }
      ]
    },
    runtime_source_evidence: {
      unmapped_tmux_sessions: [
        {
          session_name: 'outside-roster',
          observed_count: 1,
          last_observed_at: '2026-03-09T18:04:00.000Z',
          pane_refs: ['tmux://outside-roster/0.0']
        }
      ]
    },
    items: [
      {
        agent_id: 'app-engineering',
        evidence_refs: ['/tmp/app-engineering/todo.md', 'tmux://5-web3-app-engineering/0.1'],
        workspace_observations: [],
        tmux_observations: [],
        source_health: {
          workspace_root: {
            status: 'observed',
            path: '/tmp/app-engineering',
            last_observed_at: '2026-03-09T18:04:00.000Z',
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
          received_at: '2026-03-09T18:05:00.000Z',
          current_state: 'coding',
          active_task: 'Implement HTTP handlers',
          last_meaningful_output_at: '2026-03-09T18:04:30.000Z',
          last_file_write_at: '2026-03-09T18:04:00.000Z',
          current_blocker: '',
          confidence_level: 'high',
          reboot_recommended: false
        }
      }
    ]
  };

  const storedReport = await store.appendCollectorReport(report);
  assert.equal(storedReport.items.length, 1);
  assert.deepEqual(storedReport.evidence_coverage, report.evidence_coverage);
  assert.deepEqual(storedReport.shared_artifacts, []);
  assert.deepEqual(storedReport.runtime_source_evidence, report.runtime_source_evidence);
  assert.deepEqual(storedReport.items[0].source_health, report.items[0].source_health);
  assert.equal(store.getLatestCollectorReport().collected_at, '2026-03-09T18:05:00.000Z');
  assert.deepEqual(store.getCounts(), {
    agent_count: 7,
    event_count: 2,
    heartbeat_count: 1
  });
  assert.equal(store.getAgent('app-engineering').current_state, 'coding');

  const activityEvents = store.listEvents({ agent_id: 'app-engineering' }).map((event) => event.event_type);
  assert.deepEqual(activityEvents, ['agent_state_changed', 'agent_wrote_file']);

  const records = (await readFile(storeFile, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(records.filter((record) => record.kind === 'event').length, 2);
  assert.equal(records.filter((record) => record.kind === 'heartbeat').length, 1);
  assert.equal(records.filter((record) => record.kind === 'evidence_record').length, 2);
  const snapshotRecord = records[records.length - 1];
  assert.equal(snapshotRecord.kind, 'collector_snapshot');
  assert.deepEqual(snapshotRecord.payload, storedReport);
  assert.equal(snapshotRecord.payload.items[0].heartbeat.current_state, 'coding');
});

test('store replays the latest collector snapshot without duplicating counts', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-store-'));
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });
  const firstEvidenceCoverage = {
    evidence_ref_count: 1,
    covered_agent_count: 1,
    low_confidence_agent_ids: [],
    source_kind_buckets: {
      workspace_file: 1,
      workspace_root: 0,
      tmux_observation: 0
    },
    agent_items: [
      {
        agent_id: 'app-engineering',
        evidence_ref_count: 1,
        source_kinds: ['workspace_file'],
        latest_evidence_at: '2026-03-09T18:04:00.000Z',
        confidence_level: 'high'
      }
    ]
  };
  const secondEvidenceCoverage = {
    evidence_ref_count: 2,
    covered_agent_count: 1,
    low_confidence_agent_ids: ['app-engineering'],
    source_kind_buckets: {
      workspace_file: 1,
      workspace_root: 1,
      tmux_observation: 0
    },
    agent_items: [
      {
        agent_id: 'app-engineering',
        evidence_ref_count: 2,
        source_kinds: ['workspace_file', 'workspace_root'],
        latest_evidence_at: '2026-03-09T18:11:00.000Z',
        confidence_level: 'low'
      }
    ]
  };

  await store.appendCollectorReport(
    createCollectorReport({
      collectedAt: '2026-03-09T18:05:00.000Z',
      evidenceCoverage: firstEvidenceCoverage,
      items: [
        {
          ...createReportItem({
            collectedAt: '2026-03-09T18:05:00.000Z',
            agentId: 'app-engineering',
            evidenceRefs: ['/tmp/app-engineering/outbox.md'],
            currentState: 'coding',
            activeTask: 'Implement HTTP handlers',
            lastMeaningfulOutputAt: '2026-03-09T18:04:30.000Z',
            lastFileWriteAt: '2026-03-09T18:04:00.000Z'
          }),
          source_health: {
            workspace_root: {
              status: 'observed',
              path: '/tmp/app-engineering',
              last_observed_at: '2026-03-09T18:04:00.000Z',
              degraded_reasons: []
            }
          }
        }
      ]
    })
  );
  const latestWrittenReport = await store.appendCollectorReport(
    createCollectorReport({
      collectedAt: '2026-03-09T18:12:00.000Z',
      evidenceCoverage: secondEvidenceCoverage,
      items: [
        {
          ...createReportItem({
            collectedAt: '2026-03-09T18:12:00.000Z',
            agentId: 'app-engineering',
            evidenceRefs: ['/tmp/app-engineering/outbox.md', '/tmp/app-engineering'],
            currentState: 'coding',
            activeTask: 'Implement replay restore',
            lastMeaningfulOutputAt: '2026-03-09T18:11:00.000Z',
            lastFileWriteAt: '2026-03-09T18:11:00.000Z',
            confidenceLevel: 'low'
          }),
          workspace_observations: [
            {
              path: '/tmp/app-engineering/outbox.md',
              file_name: 'outbox.md',
              kind: 'workspace_file',
              last_modified_at: '2026-03-09T18:11:00.000Z'
            },
            {
              path: '/tmp/app-engineering',
              file_name: 'app-engineering',
              kind: 'workspace_root',
              last_modified_at: '2026-03-09T18:11:00.000Z'
            }
          ],
          source_health: {
            workspace_root: {
              status: 'observed',
              path: '/tmp/app-engineering',
              last_observed_at: '2026-03-09T18:11:00.000Z',
              degraded_reasons: []
            }
          }
        }
      ]
    })
  );

  const reloadedStore = await createPrototypeStore({ filePath: storeFile });
  assert.deepEqual(reloadedStore.getLatestCollectorReport(), latestWrittenReport);
  assert.deepEqual(reloadedStore.getLatestCollectorEvidenceCoverage(), {
    collected_at: '2026-03-09T18:12:00.000Z',
    collector_snapshot_id: 'collector-snapshot:2026-03-09T18:12:00.000Z',
    actor_id: 'team-lead',
    evidence_ref_count: 2,
    covered_agent_count: 1,
    low_confidence_agent_ids: ['app-engineering'],
    source_kind_buckets: {
      workspace_file: 1,
      workspace_root: 1,
      tmux_observation: 0
    },
    agent_items: secondEvidenceCoverage.agent_items
  });
  assert.deepEqual(reloadedStore.getCounts(), store.getCounts());
  assert.deepEqual(reloadedStore.getCounts(), {
    agent_count: 7,
    event_count: 3,
    heartbeat_count: 2
  });
});

test('store keeps heartbeat-only JSONL replay backward compatible without a latest collector report', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-store-'));
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const heartbeat = createReportItem({
    collectedAt: '2026-03-09T18:05:00.000Z',
    agentId: 'app-engineering',
    evidenceRefs: ['/tmp/app-engineering/outbox.md'],
    currentState: 'coding',
    activeTask: 'Implement HTTP handlers',
    lastMeaningfulOutputAt: '2026-03-09T18:04:30.000Z',
    lastFileWriteAt: '2026-03-09T18:04:00.000Z'
  }).heartbeat;

  await writeFile(
    storeFile,
    `${JSON.stringify({ kind: 'heartbeat', payload: heartbeat })}\n${JSON.stringify({
      kind: 'unknown_record',
      payload: { ignored: true }
    })}\n`,
    'utf8'
  );

  const store = await createPrototypeStore({ filePath: storeFile });

  assert.equal(store.getLatestCollectorReport(), null);
  assert.equal(store.getLatestCollectorEvidenceCoverage(), null);
  assert.deepEqual(store.getCounts(), {
    agent_count: 7,
    event_count: 0,
    heartbeat_count: 1
  });
});

test('store projects latest collector source health with filters and bounded rows', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-store-'));
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });

  assert.equal(store.getLatestCollectorSourceHealth(), null);

  await store.appendCollectorReport(
    createCollectorReport({
      collectedAt: '2026-03-09T18:05:00.000Z',
      evidenceCoverage: {
        evidence_ref_count: 2,
        covered_agent_count: 1,
        low_confidence_agent_ids: ['growth-revenue'],
        source_kind_buckets: {
          workspace_file: 1,
          workspace_root: 0,
          tmux_observation: 1
        },
        agent_items: [
          {
            agent_id: 'app-engineering',
            evidence_ref_count: 2,
            source_kinds: ['workspace_file', 'tmux_observation'],
            latest_evidence_at: '2026-03-09T18:04:30.000Z',
            confidence_level: 'high'
          },
          {
            agent_id: 'growth-revenue',
            evidence_ref_count: 0,
            source_kinds: [],
            latest_evidence_at: null,
            confidence_level: 'low'
          }
        ]
      },
      items: [
        {
          ...createReportItem({
            collectedAt: '2026-03-09T18:05:00.000Z',
            agentId: 'app-engineering',
            evidenceRefs: ['/tmp/app-engineering/outbox.md', 'tmux://5-web3-app-engineering/0.1'],
            currentState: 'coding',
            activeTask: 'Implement HTTP handlers',
            lastMeaningfulOutputAt: '2026-03-09T18:04:30.000Z',
            lastFileWriteAt: '2026-03-09T18:04:00.000Z'
          }),
          source_health: {
            workspace_root: {
              status: 'observed',
              path: '/tmp/app-engineering',
              last_observed_at: '2026-03-09T18:04:00.000Z',
              degraded_reasons: []
            },
            workspace_files: {
              status: 'degraded',
              expected_files: ['inbox.md', 'outbox.md', 'todo.md'],
              observed_count: 1,
              missing_count: 2,
              error_count: 0,
              last_observed_at: '2026-03-09T18:04:00.000Z',
              degraded_reasons: ['missing workspace files: inbox.md, todo.md']
            },
            tmux_session: {
              status: 'observed',
              expected_session_ref: '5-web3-app-engineering',
              observed_count: 1,
              last_observed_at: '2026-03-09T18:04:30.000Z',
              degraded_reasons: []
            }
          }
        },
        {
          ...createReportItem({
            collectedAt: '2026-03-09T18:05:00.000Z',
            agentId: 'growth-revenue',
            evidenceRefs: [],
            currentState: 'unknown',
            activeTask: '',
            lastMeaningfulOutputAt: null,
            lastFileWriteAt: null,
            confidenceLevel: 'low'
          }),
          source_health: {
            workspace_root: {
              status: 'missing',
              path: '/tmp/growth-revenue',
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
            },
            tmux_session: {
              status: 'missing',
              expected_session_ref: '5-web3-growth-revenue',
              observed_count: 0,
              last_observed_at: null,
              degraded_reasons: ['tmux session not observed']
            }
          }
        }
      ]
    })
  );

  const all = store.getLatestCollectorSourceHealth();
  assert.deepEqual(all.summary.status_buckets, {
    observed: 2,
    degraded: 1,
    missing: 3,
    error: 0
  });
  assert.deepEqual(all.summary.source_kind_buckets.workspace_files, {
    observed: 0,
    degraded: 1,
    missing: 1,
    error: 0
  });
  assert.deepEqual(all.agent_items.map((item) => item.agent_id), [
    'app-engineering',
    'growth-revenue'
  ]);
  assert.deepEqual(all.agent_items[0], {
    agent_id: 'app-engineering',
    workspace_root: '/tmp/app-engineering',
    session_ref: '5-web3-app-engineering',
    source_health: {
      workspace_root: {
        status: 'observed',
        path: '/tmp/app-engineering',
        last_observed_at: '2026-03-09T18:04:00.000Z',
        degraded_reasons: []
      },
      workspace_files: {
        status: 'degraded',
        expected_files: ['inbox.md', 'outbox.md', 'todo.md'],
        observed_count: 1,
        missing_count: 2,
        error_count: 0,
        last_observed_at: '2026-03-09T18:04:00.000Z',
        degraded_reasons: ['missing workspace files: inbox.md, todo.md']
      },
      tmux_session: {
        status: 'observed',
        expected_session_ref: '5-web3-app-engineering',
        observed_count: 1,
        last_observed_at: '2026-03-09T18:04:30.000Z',
        degraded_reasons: []
      }
    },
    evidence_ref_count: 2,
    evidence_refs: ['/tmp/app-engineering/outbox.md', 'tmux://5-web3-app-engineering/0.0'],
    latest_evidence_at: '2026-03-09T18:04:30.000Z'
  });

  const missingTmux = store.getLatestCollectorSourceHealth({
    source_kind: 'tmux_observation',
    status: 'missing'
  });
  assert.deepEqual(missingTmux.agent_items.map((item) => item.agent_id), ['growth-revenue']);
  assert.deepEqual(Object.keys(missingTmux.agent_items[0].source_health), ['tmux_session']);
  assert.deepEqual(missingTmux.summary.status_buckets, {
    observed: 0,
    degraded: 0,
    missing: 1,
    error: 0
  });

  const missingAnySource = store.getLatestCollectorSourceHealth({ status: 'missing' });
  assert.deepEqual(missingAnySource.agent_items.map((item) => item.agent_id), ['growth-revenue']);
  assert.deepEqual(Object.keys(missingAnySource.agent_items[0].source_health), [
    'workspace_root',
    'workspace_files',
    'tmux_session'
  ]);
  assert.deepEqual(missingAnySource.summary.status_buckets, {
    observed: 0,
    degraded: 0,
    missing: 3,
    error: 0
  });

  const unknownStatus = store.getLatestCollectorSourceHealth({ status: 'warning' });
  assert.deepEqual(unknownStatus.agent_items, []);
  assert.deepEqual(unknownStatus.summary.status_buckets, {
    observed: 0,
    degraded: 0,
    missing: 0,
    error: 0
  });

  const projected = store.getLatestCollectorSourceHealth();
  projected.agent_items[0].source_health.workspace_files.expected_files.push('mutated.md');
  projected.agent_items[0].source_health.workspace_files.degraded_reasons.push('mutated reason');
  const reread = store.getLatestCollectorSourceHealth();
  assert.equal(
    reread.agent_items[0].source_health.workspace_files.expected_files.includes('mutated.md'),
    false
  );
  assert.equal(
    reread.agent_items[0].source_health.workspace_files.degraded_reasons.includes('mutated reason'),
    false
  );

  const blankLimit = store.getLatestCollectorSourceHealth({
    source_kind: '',
    status: '',
    limit: 'not-a-number'
  });
  assert.equal(blankLimit.agent_items.length, 2);
});

test('store appends collector report with pane-id-only tmux observation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-store-'));
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });

  await assert.doesNotReject(() =>
    store.appendCollectorReport(
      createCollectorReport({
        collectedAt: '2026-03-09T18:05:00.000Z',
        items: [
          {
            agent_id: 'app-engineering',
            evidence_refs: [],
            workspace_observations: [],
            tmux_observations: [
              {
                pane_id: '%11',
                pane_title: 'Implement HTTP handlers',
                pane_current_command: 'nvim',
                pane_active: true,
                pane_dead: false,
                pane_activity_at: '2026-03-09T18:04:30.000Z'
              }
            ],
            supervision: {
              watch_target: 'growth-revenue',
              watched_by: ['protocol-engineering', 'team-lead'],
              needs_attention: false
            },
            heartbeat: {
              agent_id: 'app-engineering',
              actor_id: 'team-lead',
              received_at: '2026-03-09T18:05:00.000Z',
              current_state: 'coding',
              active_task: 'Implement HTTP handlers',
              last_meaningful_output_at: '2026-03-09T18:04:30.000Z',
              last_file_write_at: '2026-03-09T18:04:00.000Z',
              current_blocker: '',
              confidence_level: 'high',
              reboot_recommended: false
            }
          }
        ]
      })
    )
  );

  assert.deepEqual(store.listEvents({ agent_id: 'app-engineering' })[0].evidence_refs, [
    'tmux://%11'
  ]);
});

test('store derives shared snapshot artifacts from appended collector report items', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-store-'));
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });

  const evidenceCoverage = {
    evidence_ref_count: 1,
    covered_agent_count: 2,
    low_confidence_agent_ids: [],
    source_kind_buckets: {
      workspace_file: 1,
      workspace_root: 0,
      tmux_observation: 0
    },
    agent_items: [
      {
        agent_id: 'app-engineering',
        evidence_ref_count: 1,
        source_kinds: ['workspace_file'],
        latest_evidence_at: '2026-03-09T18:04:30.000Z',
        confidence_level: 'high'
      },
      {
        agent_id: 'growth-revenue',
        evidence_ref_count: 1,
        source_kinds: ['workspace_file'],
        latest_evidence_at: '2026-03-09T18:04:45.000Z',
        confidence_level: 'high'
      }
    ]
  };

  const storedReport = await store.appendCollectorReport(
    createCollectorReport({
      collectedAt: '2026-03-09T18:05:00.000Z',
      evidenceCoverage,
      items: [
        createReportItem({
          collectedAt: '2026-03-09T18:05:00.000Z',
          agentId: 'app-engineering',
          evidenceRefs: ['/tmp/shared-snapshot/todo.md'],
          currentState: 'coding',
          activeTask: 'Implement shared flow',
          lastMeaningfulOutputAt: '2026-03-09T18:04:30.000Z',
          lastFileWriteAt: '2026-03-09T18:04:30.000Z'
        }),
        createReportItem({
          collectedAt: '2026-03-09T18:05:00.000Z',
          agentId: 'growth-revenue',
          evidenceRefs: ['/tmp/shared-snapshot/todo.md'],
          currentState: 'researching',
          activeTask: 'Review shared flow',
          lastMeaningfulOutputAt: '2026-03-09T18:04:45.000Z',
          lastFileWriteAt: '2026-03-09T18:04:45.000Z'
        })
      ]
    })
  );

  assert.deepEqual(storedReport.shared_artifacts, [
    {
      artifact_ref: '/tmp/shared-snapshot/todo.md',
      artifact_kind: 'workspace_file',
      file_name: 'todo.md',
      agent_ids: ['app-engineering', 'growth-revenue'],
      agent_count: 2,
      mention_count: 2,
      last_seen_at: '2026-03-09T18:04:45.000Z',
      source_kinds: ['workspace_file']
    }
  ]);
  assert.deepEqual(storedReport.evidence_coverage, evidenceCoverage);
  assert.deepEqual(store.getLatestCollectorReport().shared_artifacts, storedReport.shared_artifacts);
  assert.deepEqual(store.getLatestCollectorReport().evidence_coverage, evidenceCoverage);
});

test('store appends collector-driven peer watch alerts for staleness and blocked snapshots', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-store-'));
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });

  const report = createCollectorReport({
    collectedAt: '2026-03-09T18:05:00.000Z',
    items: [
      createReportItem({
        collectedAt: '2026-03-09T18:05:00.000Z',
        agentId: 'market-intel',
        evidenceRefs: ['/tmp/market-intel/outbox.md'],
        currentState: 'researching',
        activeTask: 'Review competitor notes',
        lastMeaningfulOutputAt: '2026-03-09T17:45:00.000Z',
        lastFileWriteAt: '2026-03-09T17:45:00.000Z'
      }),
      createReportItem({
        collectedAt: '2026-03-09T18:05:00.000Z',
        agentId: 'growth-revenue',
        evidenceRefs: [
          '/tmp/growth-revenue/inbox.md',
          'tmux://6-web3-growth-revenue/0.0'
        ],
        currentState: 'blocked',
        activeTask: 'Investigate stalled shell',
        lastMeaningfulOutputAt: '2026-03-09T18:00:00.000Z',
        lastFileWriteAt: '2026-03-09T18:00:00.000Z',
        currentBlocker: 'tmux pane marked dead',
        rebootRecommended: true
      })
    ]
  });

  await store.appendCollectorReport(report);

  assert.deepEqual(store.getCounts(), {
    agent_count: 7,
    event_count: 5,
    heartbeat_count: 2
  });

  const events = store.listEvents({ event_type: 'peer_watch_alert_raised' });
  assert.equal(events.length, 2);

  const stalenessAlert = events.find(
    (event) =>
      event.agent_id === 'market-intel' && event.metadata.collector_alert_family === 'staleness'
  );
  assert.equal(stalenessAlert.severity, 'yellow');
  assert.equal(stalenessAlert.source_kind, 'controller_event');
  assert.equal(stalenessAlert.current_state, 'researching');
  assert.equal(stalenessAlert.metadata.collector_derived, true);
  assert.equal(stalenessAlert.metadata.derived_staleness.severity, 'yellow');
  assert.equal(
    stalenessAlert.metadata.derived_staleness.last_meaningful_output_at,
    '2026-03-09T17:45:00.000Z'
  );
  assert.ok(stalenessAlert.evidence_refs.includes('/tmp/market-intel/outbox.md'));

  const blockedAlert = events.find(
    (event) =>
      event.agent_id === 'growth-revenue' && event.metadata.collector_alert_family === 'blocked'
  );
  assert.equal(blockedAlert.severity, 'orange');
  assert.equal(blockedAlert.current_state, 'blocked');
  assert.equal(blockedAlert.metadata.reboot_recommended, true);
  assert.equal(blockedAlert.metadata.current_blocker, 'tmux pane marked dead');
  assert.ok(blockedAlert.evidence_refs.includes('tmux://6-web3-growth-revenue/0.0'));
});

test('store resolves collector-driven peer watch alerts when snapshot conditions clear', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-store-'));
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });

  await store.appendCollectorReport(
    createCollectorReport({
      collectedAt: '2026-03-09T18:05:00.000Z',
      items: [
        createReportItem({
          collectedAt: '2026-03-09T18:05:00.000Z',
          agentId: 'market-intel',
          evidenceRefs: ['/tmp/market-intel/outbox.md'],
          currentState: 'researching',
          activeTask: 'Review competitor notes',
          lastMeaningfulOutputAt: '2026-03-09T17:35:00.000Z',
          lastFileWriteAt: '2026-03-09T17:35:00.000Z'
        }),
        createReportItem({
          collectedAt: '2026-03-09T18:05:00.000Z',
          agentId: 'growth-revenue',
          evidenceRefs: [
            '/tmp/growth-revenue/inbox.md',
            'tmux://6-web3-growth-revenue/0.0'
          ],
          currentState: 'blocked',
          activeTask: 'Investigate stalled shell',
          lastMeaningfulOutputAt: '2026-03-09T18:00:00.000Z',
          lastFileWriteAt: '2026-03-09T18:00:00.000Z',
          currentBlocker: 'tmux pane marked dead',
          rebootRecommended: true
        })
      ]
    })
  );

  await store.appendCollectorReport(
    createCollectorReport({
      collectedAt: '2026-03-09T18:12:00.000Z',
      items: [
        createReportItem({
          collectedAt: '2026-03-09T18:12:00.000Z',
          agentId: 'market-intel',
          evidenceRefs: ['/tmp/market-intel/outbox.md'],
          currentState: 'researching',
          activeTask: 'Published competitor summary',
          lastMeaningfulOutputAt: '2026-03-09T18:11:00.000Z',
          lastFileWriteAt: '2026-03-09T18:11:00.000Z'
        }),
        createReportItem({
          collectedAt: '2026-03-09T18:12:00.000Z',
          agentId: 'growth-revenue',
          evidenceRefs: ['/tmp/growth-revenue/outbox.md'],
          currentState: 'coding',
          activeTask: 'Draft outbound fixes',
          lastMeaningfulOutputAt: '2026-03-09T18:11:30.000Z',
          lastFileWriteAt: '2026-03-09T18:11:30.000Z'
        })
      ]
    })
  );

  const resolvedEvents = store.listEvents({ event_type: 'peer_watch_alert_resolved' });
  assert.equal(resolvedEvents.length, 2);
  assert.ok(
    resolvedEvents.some(
      (event) =>
        event.agent_id === 'market-intel' && event.metadata.collector_alert_family === 'staleness'
    )
  );
  assert.ok(
    resolvedEvents.some(
      (event) =>
        event.agent_id === 'growth-revenue' && event.metadata.collector_alert_family === 'blocked'
    )
  );

  const latestGrowthRevenue = store.getAgent('growth-revenue');
  assert.equal(latestGrowthRevenue.current_state, 'coding');
  assert.equal(latestGrowthRevenue.current_blocker, '');
  assert.equal(latestGrowthRevenue.reboot_recommended, false);
  assert.equal(latestGrowthRevenue.severity, 'normal');
});

test('store keeps source-only snapshots from resolving open collector alerts', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-store-'));
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });

  await store.appendCollectorReport(
    createCollectorReport({
      collectedAt: '2026-03-09T18:05:00.000Z',
      items: [
        createReportItem({
          collectedAt: '2026-03-09T18:05:00.000Z',
          agentId: 'growth-revenue',
          evidenceRefs: [
            '/tmp/growth-revenue/inbox.md',
            'tmux://6-web3-growth-revenue/0.0'
          ],
          currentState: 'blocked',
          activeTask: 'Investigate stalled shell',
          lastMeaningfulOutputAt: '2026-03-09T18:00:00.000Z',
          lastFileWriteAt: '2026-03-09T18:00:00.000Z',
          currentBlocker: 'tmux pane marked dead',
          rebootRecommended: true
        })
      ]
    })
  );

  await store.appendCollectorReport(
    createCollectorReport({
      collectedAt: '2026-03-09T18:12:00.000Z',
      items: [
        createReportItem({
          collectedAt: '2026-03-09T18:12:00.000Z',
          agentId: 'growth-revenue',
          evidenceRefs: ['/tmp/growth-revenue/inbox.md'],
          currentState: 'coding',
          activeTask: 'Source gap only',
          lastMeaningfulOutputAt: null,
          lastFileWriteAt: null
        })
      ]
    })
  );

  assert.equal(store.listEvents({ event_type: 'peer_watch_alert_resolved' }).length, 0);

  const openAlerts = store.listOpenPeerWatchAlerts({ target_agent_id: 'growth-revenue' });
  assert.equal(openAlerts.length, 1);
  assert.equal(openAlerts[0].metadata.collector_alert_family, 'blocked');
  assert.equal(store.getLatestCollectorReport().summary.heartbeat_count, 0);

  const latestGrowthRevenue = store.getAgent('growth-revenue');
  assert.equal(latestGrowthRevenue.current_state, 'blocked');
  assert.equal(latestGrowthRevenue.current_blocker, 'tmux pane marked dead');
});

test('store suppresses duplicate collector-driven peer watch alerts for unchanged snapshots', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-store-'));
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });

  const firstReport = createCollectorReport({
    collectedAt: '2026-03-09T18:05:00.000Z',
    items: [
      createReportItem({
        collectedAt: '2026-03-09T18:05:00.000Z',
        agentId: 'product-pmf',
        evidenceRefs: ['/tmp/product-pmf/outbox.md'],
        currentState: 'planning',
        activeTask: 'Draft PMF memo',
        lastMeaningfulOutputAt: '2026-03-09T17:34:00.000Z',
        lastFileWriteAt: '2026-03-09T17:34:00.000Z'
      }),
      createReportItem({
        collectedAt: '2026-03-09T18:05:00.000Z',
        agentId: 'growth-revenue',
        evidenceRefs: [
          '/tmp/growth-revenue/inbox.md',
          'tmux://6-web3-growth-revenue/0.0'
        ],
        currentState: 'blocked',
        activeTask: 'Investigate stalled shell',
        lastMeaningfulOutputAt: '2026-03-09T18:00:00.000Z',
        lastFileWriteAt: '2026-03-09T18:00:00.000Z',
        currentBlocker: 'tmux pane marked dead',
        rebootRecommended: true
      })
    ]
  });

  const secondReport = createCollectorReport({
    collectedAt: '2026-03-09T18:11:00.000Z',
    items: [
      createReportItem({
        collectedAt: '2026-03-09T18:11:00.000Z',
        agentId: 'product-pmf',
        evidenceRefs: ['/tmp/product-pmf/outbox.md'],
        currentState: 'planning',
        activeTask: 'Draft PMF memo',
        lastMeaningfulOutputAt: '2026-03-09T17:34:00.000Z',
        lastFileWriteAt: '2026-03-09T17:34:00.000Z'
      }),
      createReportItem({
        collectedAt: '2026-03-09T18:11:00.000Z',
        agentId: 'growth-revenue',
        evidenceRefs: [
          '/tmp/growth-revenue/inbox.md',
          'tmux://6-web3-growth-revenue/0.0'
        ],
        currentState: 'blocked',
        activeTask: 'Investigate stalled shell',
        lastMeaningfulOutputAt: '2026-03-09T18:00:00.000Z',
        lastFileWriteAt: '2026-03-09T18:00:00.000Z',
        currentBlocker: 'tmux pane marked dead',
        rebootRecommended: true
      })
    ]
  });

  await store.appendCollectorReport(firstReport);
  const firstCounts = store.getCounts();

  await store.appendCollectorReport(secondReport);
  const secondCounts = store.getCounts();

  assert.equal(firstCounts.event_count, 5);
  assert.equal(secondCounts.event_count, 5);
  assert.equal(secondCounts.heartbeat_count, 4);
  assert.equal(store.listEvents({ event_type: 'peer_watch_alert_raised' }).length, 2);
  assert.equal(store.listEvents({ event_type: 'agent_state_changed' }).length, 2);
  assert.equal(store.listEvents({ event_type: 'agent_wrote_file' }).length, 1);
});


test('store suppresses duplicate collector-derived activity events for unchanged snapshots', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-store-'));
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });

  const firstReport = createCollectorReport({
    collectedAt: '2026-03-09T18:05:00.000Z',
    items: [
      createReportItem({
        collectedAt: '2026-03-09T18:05:00.000Z',
        agentId: 'app-engineering',
        evidenceRefs: [
          '/tmp/app-engineering/outbox.md',
          'tmux://5-web3-app-engineering/0.1'
        ],
        currentState: 'coding',
        activeTask: 'Implement HTTP handlers',
        lastMeaningfulOutputAt: '2026-03-09T18:04:30.000Z',
        lastFileWriteAt: '2026-03-09T18:04:00.000Z'
      })
    ]
  });

  const secondReport = createCollectorReport({
    collectedAt: '2026-03-09T18:11:00.000Z',
    items: [
      createReportItem({
        collectedAt: '2026-03-09T18:11:00.000Z',
        agentId: 'app-engineering',
        evidenceRefs: [
          '/tmp/app-engineering/outbox.md',
          'tmux://5-web3-app-engineering/0.1'
        ],
        currentState: 'coding',
        activeTask: 'Implement HTTP handlers',
        lastMeaningfulOutputAt: '2026-03-09T18:04:30.000Z',
        lastFileWriteAt: '2026-03-09T18:04:00.000Z'
      })
    ]
  });

  await store.appendCollectorReport(firstReport);
  const firstCounts = store.getCounts();

  await store.appendCollectorReport(secondReport);
  const secondCounts = store.getCounts();

  assert.deepEqual(firstCounts, {
    agent_count: 7,
    event_count: 2,
    heartbeat_count: 1
  });
  assert.deepEqual(secondCounts, {
    agent_count: 7,
    event_count: 2,
    heartbeat_count: 2
  });
  assert.equal(store.listEvents({ event_type: 'agent_state_changed' }).length, 1);
  assert.equal(store.listEvents({ event_type: 'agent_wrote_file' }).length, 1);
});
