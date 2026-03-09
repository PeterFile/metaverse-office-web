const assert = require('node:assert/strict');
const { mkdtemp, readFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { SEED_AGENTS } = require('../src/domain');
const { collectControllerSnapshot } = require('../src/collectors/controller-snapshot');
const { createPrototypeStore } = require('../src/store/prototype-store');

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
  assert.equal(growthRevenue.heartbeat.last_meaningful_output_at, '2026-03-09T17:59:00.000Z');
  assert.equal(growthRevenue.heartbeat.confidence_level, 'high');
  assert.equal(growthRevenue.supervision.needs_attention, true);
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
    items: [
      {
        agent_id: 'app-engineering',
        evidence_refs: ['/tmp/app-engineering/todo.md', 'tmux://5-web3-app-engineering/0.1'],
        workspace_observations: [],
        tmux_observations: [],
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
  assert.equal(store.getLatestCollectorReport().collected_at, '2026-03-09T18:05:00.000Z');
  assert.equal(store.getCounts().heartbeat_count, 1);
  assert.equal(store.getAgent('app-engineering').current_state, 'coding');

  const lines = (await readFile(storeFile, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).kind, 'heartbeat');
});
