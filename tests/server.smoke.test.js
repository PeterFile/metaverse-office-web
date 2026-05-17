const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { mkdtemp, readFile, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { promisify } = require('node:util');

const {
  collectControllerSnapshot,
  createControllerSnapshotCollector,
  createHermesRuntimeSourcesFileReader
} = require('../src/collectors/controller-snapshot');
const { SEED_AGENTS } = require('../src/domain');
const { createAppServer } = require('../src/server');
const { createPrototypeStore } = require('../src/store/prototype-store');

const execFileAsync = promisify(execFile);

async function createHarness(t, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-'));
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const sqliteStoreFile = path.join(root, 'prototype-store.sqlite');
  const store = await createPrototypeStore(
    options.storeBackend === 'sqlite'
      ? { sqliteFilePath: sqliteStoreFile }
      : { filePath: storeFile }
  );
  const server = createAppServer({
    store,
    now: options.now || (() => '2026-03-09T18:05:00.000Z'),
    controllerSnapshotCollector: options.controllerSnapshotCollector,
    allowedOrigins: options.allowedOrigins
  });

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  const address = server.address();
  return {
    store,
    storeFile,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

async function hasSqlite3() {
  try {
    await execFileAsync('sqlite3', ['--version']);
    return true;
  } catch {
    return false;
  }
}

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const body = await response.json();
  return { response, body };
}

function createEvent({
  eventId,
  ts,
  agentId,
  actorId = agentId,
  eventType,
  currentState,
  activeTask,
  summary,
  location = 'meeting-zone',
  severity = 'normal',
  correlationId,
  counterpartyAgentIds = [],
  evidenceRefs = [],
  metadata = {},
  sourceKind = actorId === agentId ? 'workspace_file' : 'controller_event'
}) {
  return {
    event_id: eventId,
    ts,
    agent_id: agentId,
    actor_id: actorId,
    agent_role: agentId,
    event_type: eventType,
    current_state: currentState,
    active_task: activeTask,
    location,
    summary,
    severity,
    correlation_id: correlationId,
    counterparty_agent_ids: counterpartyAgentIds,
    evidence_refs: evidenceRefs,
    source_kind: sourceKind,
    metadata
  };
}

function createRouteParityCollectorReport() {
  return {
    collected_at: '2026-03-09T18:06:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 2,
      heartbeat_count: 0,
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
          session_name: 'unmapped-route-parity',
          pane_refs: ['tmux://unmapped-route-parity/0.0'],
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
        evidence_refs: [
          '/tmp/route-parity/app/inbox.md',
          '/tmp/route-parity/app/outbox.md',
          'tmux://5-web3-app-engineering/0.1'
        ],
        workspace_observations: [
          {
            path: '/tmp/route-parity/app/inbox.md',
            file_name: 'inbox.md',
            kind: 'workspace_file',
            last_modified_at: '2026-03-09T18:04:00.000Z'
          },
          {
            path: '/tmp/route-parity/app/outbox.md',
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
            path: '/tmp/route-parity/app',
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
          received_at: '2026-03-09T18:06:00.000Z',
          current_state: 'coding',
          active_task: 'Validate evidence read-route parity',
          current_location: 'desk-app-engineering',
          last_meaningful_output_at: '2026-03-09T18:05:00.000Z',
          last_file_write_at: '2026-03-09T18:05:00.000Z',
          current_blocker: '',
          confidence_level: 'high',
          reboot_recommended: false,
          evidence_refs: ['/tmp/route-parity/app/outbox.md', 'tmux://5-web3-app-engineering/0.1']
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
            path: '/tmp/route-parity/protocol',
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

test('GET endpoints expose the seeded canonical scaffold', async (t) => {
  const { baseUrl } = await createHarness(t);

  const health = await requestJson(`${baseUrl}/health`);
  assert.equal(health.response.status, 200);
  assert.equal(health.body.status, 'ok');
  assert.equal(health.body.agent_count, 7);

  const agents = await requestJson(`${baseUrl}/agents`);
  assert.equal(agents.response.status, 200);
  assert.equal(agents.body.items.length, 7);
  assert.ok(agents.body.items.some((agent) => agent.agent_id === 'product-pmf'));

  const agent = await requestJson(`${baseUrl}/agents/team-lead`);
  assert.equal(agent.response.status, 200);
  assert.equal(agent.body.item.agent_id, 'team-lead');

  const agentEvents = await requestJson(`${baseUrl}/agents/team-lead/events`);
  assert.equal(agentEvents.response.status, 200);
  assert.deepEqual(agentEvents.body.items, []);

  const missing = await requestJson(`${baseUrl}/agents/missing-agent`);
  assert.equal(missing.response.status, 404);
});

test('GET /office/overview exposes seeded layout, empty zones, and watch edges', async (t) => {
  const { baseUrl } = await createHarness(t);

  const overview = await requestJson(`${baseUrl}/office/overview`);
  assert.equal(overview.response.status, 200);
  assert.equal(overview.body.generated_at, '2026-03-09T18:05:00.000Z');
  assert.equal(overview.body.summary.agent_count, 7);
  assert.equal(overview.body.summary.blocked_count, 0);
  assert.equal(overview.body.summary.reboot_recommended_count, 0);
  assert.deepEqual(overview.body.summary.severity_buckets, {
    normal: 7,
    yellow: 0,
    orange: 0,
    red: 0
  });
  assert.equal(overview.body.zones.length, 11);
  assert.equal(overview.body.watch_edges.length, 12);
  assert.equal(overview.body.agents.length, 7);

  const leadDesk = overview.body.zones.find((zone) => zone.zone_id === 'lead-desk');
  assert.deepEqual(leadDesk.occupants, []);

  const meetingZone = overview.body.zones.find((zone) => zone.zone_id === 'meeting-zone');
  assert.deepEqual(meetingZone.occupants, []);

  const reviewZone = overview.body.zones.find((zone) => zone.zone_id === 'review-zone');
  assert.equal(reviewZone.occupants.length, 1);
  assert.equal(reviewZone.occupants[0].agent_id, 'team-lead');

  assert.ok(
    overview.body.watch_edges.some(
      (edge) =>
        edge.from_agent_id === 'team-lead' &&
        edge.to_agent_id === 'app-engineering' &&
        edge.watch_mode === 'lead'
    )
  );
});

test('GET /office/operations exposes the active queue with agent_id, state, severity, and limit filters', async (t) => {
  const { baseUrl, store } = await createHarness(t);

  await store.appendHeartbeat({
    agent_id: 'market-intel',
    received_at: '2026-03-09T18:04:00.000Z',
    current_state: 'researching',
    active_task: 'Scan competitor notes',
    current_location: 'desk-market-intel',
    last_meaningful_output_at: '2026-03-09T17:45:00.000Z',
    last_file_write_at: '2026-03-09T17:45:00.000Z',
    current_blocker: '',
    confidence_level: 'medium',
    reboot_recommended: false
  });

  await store.appendHeartbeat({
    agent_id: 'growth-revenue',
    received_at: '2026-03-09T18:04:10.000Z',
    current_state: 'coding',
    active_task: 'Repair outbound funnel notes',
    current_location: 'desk-growth-revenue',
    last_meaningful_output_at: '2026-03-09T17:35:00.000Z',
    last_file_write_at: '2026-03-09T17:35:00.000Z',
    current_blocker: '',
    confidence_level: 'low',
    reboot_recommended: true
  });

  await store.appendHeartbeat({
    agent_id: 'product-pmf',
    received_at: '2026-03-09T18:04:20.000Z',
    current_state: 'sleeping',
    active_task: 'Sleep until next lead task',
    current_location: 'rest-zone',
    last_meaningful_output_at: '2026-03-09T18:00:00.000Z',
    last_file_write_at: '2026-03-09T18:00:00.000Z',
    current_blocker: '',
    confidence_level: 'high',
    reboot_recommended: false
  });

  await store.appendEvent(
    createEvent({
      eventId: 'evt_ops_blocked',
      ts: '2026-03-09T18:04:30.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Stop broken handler rollout',
      location: 'review-zone',
      summary: 'Peer watch found a severe regression',
      severity: 'red',
      correlationId: 'corr-ops-alert',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/ops-alert.md'],
      sourceKind: 'controller_event'
    })
  );

  const operations = await requestJson(`${baseUrl}/office/operations`);
  assert.equal(operations.response.status, 200);
  assert.equal(operations.body.generated_at, '2026-03-09T18:05:00.000Z');
  assert.deepEqual(operations.body.summary, {
    item_count: 4,
    blocked_count: 1,
    reboot_recommended_count: 1,
    state_buckets: {
      blocked: 1,
      coding: 1,
      researching: 1,
      reviewing: 1
    },
    severity_buckets: {
      normal: 1,
      yellow: 1,
      orange: 1,
      red: 1
    }
  });
  assert.deepEqual(
    operations.body.items.map((item) => item.agent_id),
    ['app-engineering', 'growth-revenue', 'market-intel', 'team-lead']
  );

  const blocked = operations.body.items[0];
  assert.deepEqual(blocked, {
    agent_id: 'app-engineering',
    display_name: 'App Engineering Agent',
    kind: 'employee',
    current_state: 'blocked',
    active_task: 'Stop broken handler rollout',
    current_blocker: 'Peer watch found a severe regression',
    current_location: 'review-zone',
    reported_severity: 'red',
    effective_severity: 'red',
    derived_staleness: {
      severity: 'normal',
      stale_for_ms: 30000,
      stale_for_minutes: 0,
      last_meaningful_output_at: '2026-03-09T18:04:30.000Z'
    },
    reboot_recommended: false,
    last_event_at: '2026-03-09T18:04:30.000Z',
    last_heartbeat_at: null,
    last_meaningful_output_at: '2026-03-09T18:04:30.000Z',
    correlation_id: 'corr-ops-alert',
    latest_event: {
      event_id: 'evt_ops_blocked',
      actor_id: 'team-lead',
      event_type: 'peer_watch_alert_raised',
      ts: '2026-03-09T18:04:30.000Z',
      summary: 'Peer watch found a severe regression',
      source_kind: 'controller_event',
      evidence_refs: ['/tmp/ops-alert.md'],
      counterparty_agent_ids: ['protocol-engineering']
    }
  });

  const rebooting = operations.body.items[1];
  assert.equal(rebooting.agent_id, 'growth-revenue');
  assert.equal(rebooting.reported_severity, 'orange');
  assert.equal(rebooting.effective_severity, 'orange');
  assert.equal(rebooting.correlation_id, null);
  assert.equal(rebooting.latest_event, null);

  const filtered = await requestJson(`${baseUrl}/office/operations?state=blocked`);
  assert.equal(filtered.response.status, 200);
  assert.deepEqual(filtered.body.summary, {
    item_count: 1,
    blocked_count: 1,
    reboot_recommended_count: 0,
    state_buckets: {
      blocked: 1
    },
    severity_buckets: {
      normal: 0,
      yellow: 0,
      orange: 0,
      red: 1
    }
  });
  assert.deepEqual(filtered.body.items.map((item) => item.agent_id), ['app-engineering']);

  const severityFiltered = await requestJson(`${baseUrl}/office/operations?severity=yellow&limit=1`);
  assert.equal(severityFiltered.response.status, 200);
  assert.deepEqual(severityFiltered.body.items.map((item) => item.agent_id), ['market-intel']);
  assert.deepEqual(severityFiltered.body.summary, {
    item_count: 1,
    blocked_count: 0,
    reboot_recommended_count: 0,
    state_buckets: {
      researching: 1
    },
    severity_buckets: {
      normal: 0,
      yellow: 1,
      orange: 0,
      red: 0
    }
  });
  assert.equal(severityFiltered.body.items[0].reported_severity, 'normal');
  assert.equal(severityFiltered.body.items[0].effective_severity, 'yellow');

  const limited = await requestJson(`${baseUrl}/office/operations?limit=2`);
  assert.equal(limited.response.status, 200);
  assert.deepEqual(limited.body.items.map((item) => item.agent_id), [
    'app-engineering',
    'growth-revenue'
  ]);
  assert.deepEqual(limited.body.summary, {
    item_count: 2,
    blocked_count: 1,
    reboot_recommended_count: 1,
    state_buckets: {
      blocked: 1,
      coding: 1
    },
    severity_buckets: {
      normal: 0,
      yellow: 0,
      orange: 1,
      red: 1
    }
  });

  const selectedAgent = await requestJson(`${baseUrl}/office/operations?agent_id=growth-revenue`);
  assert.equal(selectedAgent.response.status, 200);
  assert.deepEqual(selectedAgent.body.items.map((item) => item.agent_id), ['growth-revenue']);
  assert.deepEqual(selectedAgent.body.summary, {
    item_count: 1,
    blocked_count: 0,
    reboot_recommended_count: 1,
    state_buckets: {
      coding: 1
    },
    severity_buckets: {
      normal: 0,
      yellow: 0,
      orange: 1,
      red: 0
    }
  });

  const sleepingWithExplicitState = await requestJson(`${baseUrl}/office/operations?agent_id=product-pmf&state=sleeping`);
  assert.equal(sleepingWithExplicitState.response.status, 200);
  assert.deepEqual(sleepingWithExplicitState.body.items.map((item) => item.agent_id), ['product-pmf']);
  assert.deepEqual(sleepingWithExplicitState.body.summary, {
    item_count: 1,
    blocked_count: 0,
    reboot_recommended_count: 0,
    state_buckets: {
      sleeping: 1
    },
    severity_buckets: {
      normal: 1,
      yellow: 0,
      orange: 0,
      red: 0
    }
  });
});

test('POST writes append records and projection endpoints query them', async (t) => {
  const { baseUrl, storeFile } = await createHarness(t);

  const heartbeat = await requestJson(`${baseUrl}/heartbeats`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'app-engineering'
    },
    body: JSON.stringify({
      agent_id: 'app-engineering',
      current_state: 'coding',
      active_task: 'Implement HTTP handlers',
      last_meaningful_output_at: '2026-03-09T18:04:00.000Z',
      last_file_write_at: '2026-03-09T18:04:00.000Z',
      current_blocker: '',
      confidence_level: 'high',
      reboot_recommended: false
    })
  });

  assert.equal(heartbeat.response.status, 201);
  assert.equal(heartbeat.body.item.agent_id, 'app-engineering');
  assert.equal(heartbeat.body.item.current_location, 'desk-app-engineering');

  const event = await requestJson(`${baseUrl}/events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'app-engineering'
    },
    body: JSON.stringify({
      event_id: 'evt_app_write',
      ts: '2026-03-09T18:04:30.000Z',
      agent_id: 'app-engineering',
      agent_role: 'app-engineering',
      event_type: 'agent_wrote_file',
      current_state: 'coding',
      active_task: 'Implement HTTP handlers',
      location: 'rest-zone',
      summary: 'Updated the HTTP server module',
      severity: 'normal',
      correlation_id: 'phase1-backend',
      counterparty_agent_ids: [],
      evidence_refs: ['/tmp/server.js'],
      source_kind: 'workspace_file',
      metadata: {
        file_path: '/tmp/server.js'
      }
    })
  });

  assert.equal(event.response.status, 201);
  assert.equal(event.body.item.event_type, 'agent_wrote_file');
  assert.equal(event.body.item.location, 'desk-app-engineering');

  const alert = await requestJson(`${baseUrl}/events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'team-lead'
    },
    body: JSON.stringify({
      event_id: 'evt_peer_watch',
      ts: '2026-03-09T18:04:40.000Z',
      agent_id: 'app-engineering',
      agent_role: 'app-engineering',
      event_type: 'peer_watch_alert_raised',
      current_state: 'blocked',
      active_task: 'Investigate handler issue',
      location: 'desk-app-engineering',
      summary: 'Peer watch noticed missing validation',
      severity: 'orange',
      correlation_id: 'phase1-backend',
      counterparty_agent_ids: ['protocol-engineering'],
      evidence_refs: ['/tmp/server.js'],
      source_kind: 'controller_event',
      metadata: {}
    })
  });

  assert.equal(alert.response.status, 201);
  assert.equal(alert.body.item.location, 'review-zone');

  const handoff = await requestJson(`${baseUrl}/events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'team-lead'
    },
    body: JSON.stringify({
      event_id: 'evt_handoff',
      ts: '2026-03-09T18:04:50.000Z',
      agent_id: 'app-engineering',
      agent_role: 'app-engineering',
      event_type: 'agent_handoff_started',
      current_state: 'planning',
      active_task: 'Hand off API validation work',
      location: 'desk-app-engineering',
      summary: 'Lead initiated a handoff',
      severity: 'normal',
      correlation_id: 'phase1-backend',
      counterparty_agent_ids: ['growth-revenue'],
      evidence_refs: [],
      source_kind: 'controller_event',
      metadata: {}
    })
  });

  assert.equal(handoff.response.status, 201);
  assert.equal(handoff.body.item.location, 'meeting-zone');

  const reboot = await requestJson(`${baseUrl}/events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'team-lead'
    },
    body: JSON.stringify({
      event_id: 'evt_reboot',
      ts: '2026-03-09T18:05:00.000Z',
      agent_id: 'app-engineering',
      agent_role: 'app-engineering',
      event_type: 'agent_reboot_requested',
      current_state: 'rebooting',
      active_task: 'Reset degraded context',
      location: 'desk-app-engineering',
      summary: 'Lead requested a reboot',
      severity: 'orange',
      correlation_id: 'phase1-backend',
      counterparty_agent_ids: [],
      evidence_refs: [],
      source_kind: 'controller_event',
      metadata: {}
    })
  });

  assert.equal(reboot.response.status, 201);
  assert.equal(reboot.body.item.location, 'reboot-zone');

  const events = await requestJson(`${baseUrl}/events?agent_id=app-engineering&limit=2`);
  assert.equal(events.response.status, 200);
  assert.equal(events.body.items.length, 2);

  const agentEvents = await requestJson(`${baseUrl}/agents/app-engineering/events?limit=3`);
  assert.equal(agentEvents.response.status, 200);
  assert.equal(agentEvents.body.items.length, 3);

  const timeline = await requestJson(`${baseUrl}/timeline?window=15m`);
  assert.equal(timeline.response.status, 200);
  assert.ok(timeline.body.items.length >= 4);

  const alerts = await requestJson(`${baseUrl}/peer-watch/alerts?severity=orange`);
  assert.equal(alerts.response.status, 200);
  assert.equal(alerts.body.items.length, 1);
  assert.equal(alerts.body.items[0].status, 'open');

  const handoffs = await requestJson(`${baseUrl}/handoffs`);
  assert.equal(handoffs.response.status, 200);
  assert.equal(handoffs.body.items.length, 1);
  assert.equal(handoffs.body.items[0].phase, 'started');

  const reboots = await requestJson(`${baseUrl}/reboots`);
  assert.equal(reboots.response.status, 200);
  assert.equal(reboots.body.items.length, 1);
  assert.equal(reboots.body.items[0].phase, 'requested');

  const appEngineering = await requestJson(`${baseUrl}/agents/app-engineering`);
  assert.equal(appEngineering.response.status, 200);
  assert.equal(appEngineering.body.item.current_state, 'rebooting');
  assert.equal(appEngineering.body.item.current_location, 'reboot-zone');
  assert.equal(appEngineering.body.item.last_event_id, 'evt_reboot');

  const lines = (await readFile(storeFile, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 5);
});

test('GET /timeline supports replay filters, evidence fields, and ascending limit slices', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:30:00.000Z'
  });

  await store.appendEvent(
    createEvent({
      eventId: 'evt_timeline_old',
      ts: '2026-03-09T17:40:00.000Z',
      agentId: 'app-engineering',
      eventType: 'agent_wrote_file',
      currentState: 'coding',
      activeTask: 'Old replay artifact',
      location: 'desk-app-engineering',
      summary: 'Outside replay window',
      correlationId: 'corr-replay',
      evidenceRefs: ['/tmp/old-replay.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_timeline_1',
      ts: '2026-03-09T18:03:00.000Z',
      agentId: 'app-engineering',
      eventType: 'agent_wrote_file',
      currentState: 'coding',
      activeTask: 'Implement replay query',
      location: 'desk-app-engineering',
      summary: 'Wrote timeline replay query notes',
      correlationId: 'corr-replay',
      evidenceRefs: ['/tmp/replay-query.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_timeline_2',
      ts: '2026-03-09T18:07:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Fix replay ordering',
      location: 'review-zone',
      summary: 'Lead escalated replay ordering issue',
      severity: 'orange',
      correlationId: 'corr-replay',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/replay-alert.md'],
      sourceKind: 'controller_event'
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_timeline_3',
      ts: '2026-03-09T18:11:00.000Z',
      agentId: 'growth-revenue',
      actorId: 'team-lead',
      eventType: 'review_started',
      currentState: 'reviewing',
      activeTask: 'Review replay slice',
      location: 'review-zone',
      summary: 'Lead started replay slice review',
      severity: 'yellow',
      correlationId: 'corr-replay',
      counterpartyAgentIds: ['app-engineering'],
      evidenceRefs: ['/tmp/replay-review.md'],
      sourceKind: 'controller_event'
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_timeline_4',
      ts: '2026-03-09T18:14:00.000Z',
      agentId: 'app-engineering',
      eventType: 'agent_wrote_file',
      currentState: 'coding',
      activeTask: 'Write unrelated artifact',
      location: 'desk-app-engineering',
      summary: 'Wrote unrelated artifact',
      correlationId: 'corr-other',
      evidenceRefs: ['/tmp/other-artifact.md']
    })
  );

  const agentTimeline = await requestJson(`${baseUrl}/timeline?window=30m&agent_id=app-engineering`);
  assert.equal(agentTimeline.response.status, 200);
  assert.deepEqual(
    agentTimeline.body.items.map((item) => item.event_id),
    ['evt_timeline_1', 'evt_timeline_2', 'evt_timeline_4']
  );

  const filtered = await requestJson(
    `${baseUrl}/timeline?window=30m&event_type=peer_watch_alert_raised&severity=orange&correlation_id=corr-replay`
  );
  assert.equal(filtered.response.status, 200);
  assert.deepEqual(filtered.body.items, [
    {
      event_id: 'evt_timeline_2',
      ts: '2026-03-09T18:07:00.000Z',
      agent_id: 'app-engineering',
      actor_id: 'team-lead',
      event_type: 'peer_watch_alert_raised',
      severity: 'orange',
      current_state: 'blocked',
      location: 'review-zone',
      summary: 'Lead escalated replay ordering issue',
      correlation_id: 'corr-replay',
      counterparty_agent_ids: ['protocol-engineering'],
      evidence_refs: ['/tmp/replay-alert.md'],
      source_kind: 'controller_event'
    }
  ]);

  const limited = await requestJson(`${baseUrl}/timeline?window=30m&correlation_id=corr-replay&limit=2`);
  assert.equal(limited.response.status, 200);
  assert.deepEqual(
    limited.body.items.map((item) => item.event_id),
    ['evt_timeline_2', 'evt_timeline_3']
  );
  assert.ok(Date.parse(limited.body.items[0].ts) < Date.parse(limited.body.items[1].ts));
});

test('GET /events and /timeline support additive exact event_id filters', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:30:00.000Z'
  });

  await store.appendEvent(
    createEvent({
      eventId: 'evt_exact_old',
      ts: '2026-03-09T17:55:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Review exact replay filter',
      location: 'review-zone',
      summary: 'Older matching exact-filter event',
      severity: 'orange',
      correlationId: 'corr-exact-event',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/exact-old.md'],
      sourceKind: 'controller_event'
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_exact_target',
      ts: '2026-03-09T18:20:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Review exact replay filter',
      location: 'review-zone',
      summary: 'Target exact-filter event',
      severity: 'orange',
      correlationId: 'corr-exact-event',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/exact-target.md'],
      sourceKind: 'controller_event'
    })
  );

  const events = await requestJson(
    `${baseUrl}/events?event_id=evt_exact_target&agent_id=app-engineering&event_type=peer_watch_alert_raised&severity=orange&source_kind=controller_event&correlation_id=corr-exact-event`
  );
  assert.equal(events.response.status, 200);
  assert.deepEqual(
    events.body.items.map((item) => item.event_id),
    ['evt_exact_target']
  );

  const timeline = await requestJson(
    `${baseUrl}/timeline?window=20m&event_id=evt_exact_target&agent_id=app-engineering&event_type=peer_watch_alert_raised&severity=orange&source_kind=controller_event&correlation_id=corr-exact-event`
  );
  assert.equal(timeline.response.status, 200);
  assert.deepEqual(
    timeline.body.items.map((item) => item.event_id),
    ['evt_exact_target']
  );

  const windowedOut = await requestJson(`${baseUrl}/timeline?window=20m&event_id=evt_exact_old`);
  assert.equal(windowedOut.response.status, 200);
  assert.deepEqual(windowedOut.body.items, []);

  const mismatchedAgent = await requestJson(
    `${baseUrl}/events?event_id=evt_exact_target&agent_id=protocol-engineering`
  );
  assert.equal(mismatchedAgent.response.status, 200);
  assert.deepEqual(mismatchedAgent.body.items, []);
});

test('GET replay event endpoints support exact source_kind filters', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:30:00.000Z'
  });

  await store.appendEvent(
    createEvent({
      eventId: 'evt_source_workspace_old',
      ts: '2026-03-09T18:05:00.000Z',
      agentId: 'app-engineering',
      eventType: 'agent_wrote_file',
      currentState: 'coding',
      activeTask: 'Write provenance notes',
      location: 'desk-app-engineering',
      summary: 'Wrote workspace provenance notes',
      severity: 'yellow',
      correlationId: 'corr-source-agent',
      evidenceRefs: ['/tmp/source-workspace-old.md'],
      sourceKind: 'workspace_file'
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_source_controller_old',
      ts: '2026-03-09T18:07:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Review source-kind filter',
      location: 'review-zone',
      summary: 'Controller raised an older source-kind alert',
      severity: 'orange',
      correlationId: 'corr-source-agent',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/source-controller-old.md'],
      sourceKind: 'controller_event'
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_source_controller_new',
      ts: '2026-03-09T18:11:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Review source-kind filter',
      location: 'review-zone',
      summary: 'Controller raised the newest source-kind alert',
      severity: 'orange',
      correlationId: 'corr-source-agent',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/source-controller-new.md'],
      sourceKind: 'controller_event'
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_source_tmux_old',
      ts: '2026-03-09T18:12:00.000Z',
      agentId: 'growth-revenue',
      eventType: 'agent_noted',
      currentState: 'researching',
      activeTask: 'Inspect earlier tmux observation',
      location: 'desk-growth-revenue',
      summary: 'Observed earlier replay state from tmux',
      severity: 'yellow',
      correlationId: 'corr-source-tmux',
      evidenceRefs: ['tmux://growth-revenue/0.0'],
      sourceKind: 'tmux_observation'
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_source_tmux',
      ts: '2026-03-09T18:13:00.000Z',
      agentId: 'growth-revenue',
      eventType: 'agent_noted',
      currentState: 'researching',
      activeTask: 'Inspect tmux observation',
      location: 'desk-growth-revenue',
      summary: 'Observed replay state from tmux',
      severity: 'yellow',
      correlationId: 'corr-source-tmux',
      evidenceRefs: ['tmux://growth-revenue/0.1'],
      sourceKind: 'tmux_observation'
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_source_workspace_new',
      ts: '2026-03-09T18:16:00.000Z',
      agentId: 'app-engineering',
      eventType: 'agent_wrote_file',
      currentState: 'coding',
      activeTask: 'Write provenance notes',
      location: 'desk-app-engineering',
      summary: 'Wrote newer workspace provenance notes',
      severity: 'yellow',
      correlationId: 'corr-source-agent',
      evidenceRefs: ['/tmp/source-workspace-new.md'],
      sourceKind: 'workspace_file'
    })
  );

  const timeline = await requestJson(`${baseUrl}/timeline?window=30m&source_kind=tmux_observation`);
  assert.equal(timeline.response.status, 200);
  assert.deepEqual(
    timeline.body.items.map((item) => item.event_id),
    ['evt_source_tmux_old', 'evt_source_tmux']
  );
  assert.ok(timeline.body.items.every((item) => item.source_kind === 'tmux_observation'));
  assert.ok(Date.parse(timeline.body.items[0].ts) < Date.parse(timeline.body.items[1].ts));

  const events = await requestJson(
    `${baseUrl}/events?event_type=peer_watch_alert_raised&source_kind=controller_event`
  );
  assert.equal(events.response.status, 200);
  assert.deepEqual(
    events.body.items.map((item) => item.event_id),
    ['evt_source_controller_new', 'evt_source_controller_old']
  );
  assert.ok(events.body.items.every((item) => item.source_kind === 'controller_event'));

  const agentEvents = await requestJson(
    `${baseUrl}/agents/app-engineering/events?source_kind=workspace_file&event_type=agent_wrote_file&severity=yellow&correlation_id=corr-source-agent&limit=1`
  );
  assert.equal(agentEvents.response.status, 200);
  assert.deepEqual(
    agentEvents.body.items.map((item) => item.event_id),
    ['evt_source_workspace_new']
  );
  assert.ok(agentEvents.body.items.every((item) => item.source_kind === 'workspace_file'));

  const unknownAgent = await requestJson(`${baseUrl}/agents/unknown-agent/events?source_kind=workspace_file`);
  assert.equal(unknownAgent.response.status, 404);
  assert.equal(unknownAgent.body.details, 'unknown agent unknown-agent');
});

test('GET replay event endpoints support exact evidence_ref filters', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:30:00.000Z'
  });
  const exactRef = '/tmp/evidence-ref.md';
  const encodedExactRef = encodeURIComponent(exactRef);

  await store.appendEvent(
    createEvent({
      eventId: 'evt_evidence_exact_old',
      ts: '2026-03-09T18:02:00.000Z',
      agentId: 'app-engineering',
      eventType: 'agent_wrote_file',
      currentState: 'coding',
      activeTask: 'Write evidence replay notes',
      location: 'desk-app-engineering',
      summary: 'Older exact evidence ref match',
      severity: 'yellow',
      correlationId: 'corr-evidence-ref',
      evidenceRefs: [exactRef, '/tmp/evidence-extra.md'],
      sourceKind: 'workspace_file'
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_evidence_substring',
      ts: '2026-03-09T18:06:00.000Z',
      agentId: 'app-engineering',
      eventType: 'agent_wrote_file',
      currentState: 'coding',
      activeTask: 'Write substring replay notes',
      location: 'desk-app-engineering',
      summary: 'Only contains the target as a substring',
      severity: 'yellow',
      correlationId: 'corr-evidence-ref',
      evidenceRefs: [`${exactRef}.backup`],
      sourceKind: 'workspace_file'
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_evidence_exact_new',
      ts: '2026-03-09T18:10:00.000Z',
      agentId: 'app-engineering',
      eventType: 'agent_wrote_file',
      currentState: 'coding',
      activeTask: 'Write exact replay notes',
      location: 'desk-app-engineering',
      summary: 'Newer exact evidence ref match',
      severity: 'yellow',
      correlationId: 'corr-evidence-ref',
      evidenceRefs: [exactRef],
      sourceKind: 'workspace_file'
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_evidence_other_agent',
      ts: '2026-03-09T18:14:00.000Z',
      agentId: 'protocol-engineering',
      eventType: 'agent_wrote_file',
      currentState: 'coding',
      activeTask: 'Write protocol replay notes',
      location: 'desk-protocol-engineering',
      summary: 'Exact evidence ref match on another agent',
      severity: 'yellow',
      correlationId: 'corr-evidence-ref',
      evidenceRefs: [exactRef],
      sourceKind: 'workspace_file'
    })
  );

  const events = await requestJson(`${baseUrl}/events?evidence_ref=${encodedExactRef}`);
  assert.equal(events.response.status, 200);
  assert.deepEqual(
    events.body.items.map((item) => item.event_id),
    ['evt_evidence_other_agent', 'evt_evidence_exact_new', 'evt_evidence_exact_old']
  );
  assert.ok(events.body.items.every((item) => item.evidence_refs.includes(exactRef)));

  const composedEvents = await requestJson(
    `${baseUrl}/events?evidence_ref=${encodedExactRef}&agent_id=app-engineering&event_type=agent_wrote_file&severity=yellow&source_kind=workspace_file&correlation_id=corr-evidence-ref&limit=1`
  );
  assert.equal(composedEvents.response.status, 200);
  assert.deepEqual(
    composedEvents.body.items.map((item) => item.event_id),
    ['evt_evidence_exact_new']
  );

  const blankEvidenceRef = await requestJson(`${baseUrl}/events?evidence_ref=&limit=2`);
  const missingEvidenceRef = await requestJson(`${baseUrl}/events?limit=2`);
  assert.equal(blankEvidenceRef.response.status, 200);
  assert.deepEqual(
    blankEvidenceRef.body.items.map((item) => item.event_id),
    missingEvidenceRef.body.items.map((item) => item.event_id)
  );

  const agentEvents = await requestJson(
    `${baseUrl}/agents/app-engineering/events?evidence_ref=${encodedExactRef}&event_type=agent_wrote_file&limit=5`
  );
  assert.equal(agentEvents.response.status, 200);
  assert.deepEqual(
    agentEvents.body.items.map((item) => item.event_id),
    ['evt_evidence_exact_new', 'evt_evidence_exact_old']
  );

  const unknownAgent = await requestJson(`${baseUrl}/agents/unknown-agent/events?evidence_ref=${encodedExactRef}`);
  assert.equal(unknownAgent.response.status, 404);
  assert.equal(unknownAgent.body.details, 'unknown agent unknown-agent');

  const timeline = await requestJson(
    `${baseUrl}/timeline?window=30m&evidence_ref=${encodedExactRef}&agent_id=app-engineering&event_type=agent_wrote_file&severity=yellow&source_kind=workspace_file&correlation_id=corr-evidence-ref&limit=2`
  );
  assert.equal(timeline.response.status, 200);
  assert.deepEqual(
    timeline.body.items.map((item) => item.event_id),
    ['evt_evidence_exact_old', 'evt_evidence_exact_new']
  );
  assert.ok(Date.parse(timeline.body.items[0].ts) < Date.parse(timeline.body.items[1].ts));
});

test('GET interaction endpoints expose derived read models and filters', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:20:00.000Z'
  });

  await store.appendEvent(
    createEvent({
      eventId: 'evt_review_started',
      ts: '2026-03-09T18:10:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_started',
      currentState: 'reviewing',
      activeTask: 'Review interaction endpoint',
      summary: 'Lead started interaction review',
      severity: 'yellow',
      correlationId: 'review-456',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/review-start.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_review_completed',
      ts: '2026-03-09T18:12:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_completed',
      currentState: 'reviewing',
      activeTask: 'Review interaction endpoint',
      summary: 'Lead completed interaction review',
      severity: 'normal',
      correlationId: 'review-456',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/review-complete.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_handoff_started',
      ts: '2026-03-09T18:18:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Hand off endpoint cleanup',
      summary: 'Lead started a handoff',
      severity: 'orange',
      correlationId: 'handoff-1',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/handoff.md']
    })
  );

  const interactions = await requestJson(
    `${baseUrl}/interactions?interaction_type=review&counterparty_agent_id=protocol-engineering&limit=1`
  );
  assert.equal(interactions.response.status, 200);
  assert.equal(interactions.body.items.length, 1);
  assert.equal(interactions.body.items[0].interaction_type, 'review');
  assert.equal(interactions.body.items[0].ended_at, '2026-03-09T18:12:00.000Z');
  assert.equal(interactions.body.items[0].source_kind, 'controller_event');
  assert.deepEqual(interactions.body.items[0].related_event_ids, [
    'evt_review_started',
    'evt_review_completed'
  ]);

  const byCompletedEvent = await requestJson(
    `${baseUrl}/interactions?event_id=evt_review_completed`
  );
  assert.equal(byCompletedEvent.response.status, 200);
  assert.deepEqual(
    byCompletedEvent.body.items.map((item) => item.interaction_id),
    ['interaction:evt_review_started']
  );

  const byEvidenceRef = await requestJson(
    `${baseUrl}/interactions?evidence_ref=${encodeURIComponent('/tmp/review-complete.md')}`
  );
  assert.equal(byEvidenceRef.response.status, 200);
  assert.deepEqual(
    byEvidenceRef.body.items.map((item) => item.interaction_id),
    ['interaction:evt_review_started']
  );

  const agentExactEvidence = await requestJson(
    `${baseUrl}/agents/app-engineering/interactions?event_id=evt_review_started&evidence_ref=${encodeURIComponent('/tmp/review-complete.md')}`
  );
  assert.equal(agentExactEvidence.response.status, 200);
  assert.equal(agentExactEvidence.body.agent_id, 'app-engineering');
  assert.deepEqual(
    agentExactEvidence.body.items.map((item) => item.interaction_id),
    ['interaction:evt_review_started']
  );

  const mismatchedExactEvidence = await requestJson(
    `${baseUrl}/agents/app-engineering/interactions?event_id=evt_handoff_started&evidence_ref=${encodeURIComponent('/tmp/review-complete.md')}`
  );
  assert.equal(mismatchedExactEvidence.response.status, 200);
  assert.deepEqual(mismatchedExactEvidence.body.items, []);

  const windowed = await requestJson(`${baseUrl}/interactions?window=5m`);
  assert.equal(windowed.response.status, 200);
  assert.equal(windowed.body.items.length, 1);
  assert.equal(windowed.body.items[0].interaction_type, 'handoff');

  const agentInteractions = await requestJson(
    `${baseUrl}/agents/app-engineering/interactions?counterparty_agent_id=protocol-engineering&severity=yellow`
  );
  assert.equal(agentInteractions.response.status, 200);
  assert.equal(agentInteractions.body.agent_id, 'app-engineering');
  assert.equal(agentInteractions.body.items.length, 1);
  assert.equal(agentInteractions.body.items[0].correlation_id, 'review-456');
  assert.equal(agentInteractions.body.items[0].source_kind, 'controller_event');

  const missingAgent = await requestJson(`${baseUrl}/agents/missing-agent/interactions`);
  assert.equal(missingAgent.response.status, 404);
});

test('GET /agents/:id includes recent evidence surfaces while preserving the current snapshot', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:20:00.000Z'
  });

  await store.appendHeartbeat({
    agent_id: 'app-engineering',
    actor_id: 'app-engineering',
    received_at: '2026-03-09T18:19:00.000Z',
    current_state: 'coding',
    active_task: 'Harden agent detail query',
    current_location: 'desk-app-engineering',
    last_meaningful_output_at: '2026-03-09T18:18:00.000Z',
    last_file_write_at: '2026-03-09T18:18:00.000Z',
    current_blocker: '',
    confidence_level: 'high',
    reboot_recommended: false
  });

  await store.appendEvent(
    createEvent({
      eventId: 'evt_alert_open',
      ts: '2026-03-09T18:14:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Investigate failing query',
      summary: 'Lead raised an open peer-watch alert',
      severity: 'orange',
      correlationId: 'corr-agent-detail',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/agent-detail-alert.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_review_started_detail',
      ts: '2026-03-09T18:15:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_started',
      currentState: 'reviewing',
      activeTask: 'Review enriched agent detail',
      summary: 'Lead started agent detail review',
      severity: 'yellow',
      correlationId: 'review-agent-detail',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/review-start-detail.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_review_completed_detail',
      ts: '2026-03-09T18:16:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_completed',
      currentState: 'reviewing',
      activeTask: 'Review enriched agent detail',
      summary: 'Lead completed agent detail review',
      severity: 'normal',
      correlationId: 'review-agent-detail',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/review-end-detail.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_handoff_detail',
      ts: '2026-03-09T18:17:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Hand off alert follow-up',
      summary: 'Lead started a handoff for agent detail work',
      severity: 'normal',
      correlationId: 'handoff-agent-detail',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/handoff-detail.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_reboot_detail',
      ts: '2026-03-09T18:18:30.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Reset query context',
      summary: 'Lead requested a reboot for agent detail work',
      severity: 'orange',
      correlationId: 'reboot-agent-detail',
      evidenceRefs: ['/tmp/reboot-detail.md']
    })
  );

  const response = await requestJson(`${baseUrl}/agents/app-engineering`);
  assert.equal(response.response.status, 200);
  assert.equal(response.body.item.agent_id, 'app-engineering');
  assert.equal(response.body.item.last_event_id, 'evt_reboot_detail');
  assert.equal(response.body.item.latest_heartbeat.received_at, '2026-03-09T18:19:00.000Z');
  assert.equal(response.body.item.open_peer_watch_alerts.length, 1);
  assert.equal(response.body.item.open_peer_watch_alerts[0].alert_id, 'evt_alert_open');
  assert.equal(response.body.item.recent_events.length, 5);
  assert.equal(response.body.item.recent_events[0].event_id, 'evt_reboot_detail');
  assert.equal(response.body.item.recent_interactions.length, 3);
  assert.equal(response.body.item.recent_interactions[0].interaction_type, 'handoff');
  assert.equal(response.body.item.recent_incidents.length, 3);
  assert.equal(response.body.item.recent_incidents[0].incident_id, 'evt_reboot_detail');
  assert.equal(response.body.item.recent_handoffs.length, 1);
  assert.equal(response.body.item.recent_handoffs[0].handoff_id, 'evt_handoff_detail');
  assert.equal(response.body.item.recent_reboots.length, 1);
  assert.equal(response.body.item.recent_reboots[0].reboot_id, 'evt_reboot_detail');

  const limited = await requestJson(`${baseUrl}/agents/app-engineering?limit=2`);
  assert.equal(limited.response.status, 200);
  assert.equal(limited.body.item.recent_events.length, 2);
  assert.equal(limited.body.item.recent_interactions.length, 2);
  assert.equal(limited.body.item.recent_incidents.length, 2);
  assert.equal(limited.body.item.recent_incidents[0].incident_id, 'evt_reboot_detail');
});

test('GET /agents/:id/workflow aggregates detail with default 60m window and per-slice limits', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T19:00:00.000Z'
  });

  await store.appendEvent(
    createEvent({
      eventId: 'evt_workflow_old_alert',
      ts: '2026-03-09T17:50:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Investigate old workflow issue',
      summary: 'Old workflow incident outside the default window',
      severity: 'yellow',
      correlationId: 'corr-workflow-old',
      counterpartyAgentIds: ['market-intel'],
      evidenceRefs: ['/tmp/workflow-old-alert.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_workflow_review_started',
      ts: '2026-03-09T18:05:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_started',
      currentState: 'reviewing',
      activeTask: 'Review workflow aggregation',
      summary: 'Lead started workflow review',
      severity: 'yellow',
      correlationId: 'corr-workflow-review',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/workflow-review-start.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_workflow_review_completed',
      ts: '2026-03-09T18:06:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_completed',
      currentState: 'reviewing',
      activeTask: 'Review workflow aggregation',
      summary: 'Lead completed workflow review',
      correlationId: 'corr-workflow-review',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/workflow-review-complete.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_workflow_peer_watch',
      ts: '2026-03-09T18:40:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Fix workflow incident',
      summary: 'Protocol engineering escalated workflow evidence',
      severity: 'orange',
      correlationId: 'corr-workflow-peer-watch',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/workflow-peer-watch.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_workflow_handoff_started',
      ts: '2026-03-09T18:45:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Hand off workflow follow-up',
      summary: 'Lead started workflow handoff',
      severity: 'yellow',
      correlationId: 'corr-workflow-handoff',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/workflow-handoff-start.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_workflow_handoff_completed',
      ts: '2026-03-09T18:46:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_handoff_completed',
      currentState: 'planning',
      activeTask: 'Hand off workflow follow-up',
      summary: 'Lead completed workflow handoff',
      correlationId: 'corr-workflow-handoff',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/workflow-handoff-complete.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_workflow_reboot',
      ts: '2026-03-09T18:50:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Reset workflow context',
      summary: 'Lead requested a workflow reboot',
      severity: 'red',
      correlationId: 'corr-workflow-reboot',
      evidenceRefs: ['/tmp/workflow-reboot.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_workflow_write',
      ts: '2026-03-09T18:55:00.000Z',
      agentId: 'app-engineering',
      eventType: 'agent_wrote_file',
      currentState: 'coding',
      activeTask: 'Write workflow notes',
      summary: 'Agent wrote workflow notes',
      correlationId: 'corr-workflow-write',
      evidenceRefs: ['/tmp/workflow-write.md']
    })
  );

  const defaultWindow = await requestJson(`${baseUrl}/agents/app-engineering/workflow?limit=10`);
  assert.equal(defaultWindow.response.status, 200);
  assert.equal(defaultWindow.body.agent_id, 'app-engineering');
  assert.equal(defaultWindow.body.detail.agent_id, 'app-engineering');
  assert.equal(defaultWindow.body.detail.recent_events.length, 8);
  assert.equal(defaultWindow.body.detail.recent_incidents.length, 5);
  assert.equal(defaultWindow.body.detail.recent_incidents.at(-1).incident_id, 'evt_workflow_old_alert');
  assert.equal(defaultWindow.body.detail.recent_interactions.length, 4);
  assert.equal(
    defaultWindow.body.detail.recent_interactions.at(-1).interaction_id,
    'interaction:evt_workflow_old_alert'
  );
  assert.deepEqual(defaultWindow.body.summary, {
    incident_count: 4,
    interaction_count: 3,
    event_count: 7,
    incident_kind_buckets: {
      reboot: 1,
      handoff: 2,
      peer_watch_alert: 1
    },
    interaction_type_buckets: {
      handoff: 1,
      peer_watch: 1,
      review: 1
    },
    event_type_buckets: {
      review_started: 1,
      review_completed: 1,
      peer_watch_alert_raised: 1,
      agent_handoff_started: 1,
      agent_handoff_completed: 1,
      agent_reboot_requested: 1,
      agent_wrote_file: 1
    },
    severity_buckets: {
      normal: 4,
      yellow: 5,
      orange: 3,
      red: 2
    },
    latest_activity_at: '2026-03-09T18:55:00.000Z'
  });
  assert.deepEqual(
    defaultWindow.body.incidents.map((item) => item.incident_id),
    [
      'evt_workflow_reboot',
      'evt_workflow_handoff_completed',
      'evt_workflow_handoff_started',
      'evt_workflow_peer_watch'
    ]
  );
  assert.deepEqual(
    defaultWindow.body.interactions.map((item) => item.interaction_id),
    [
      'interaction:evt_workflow_handoff_started',
      'interaction:evt_workflow_peer_watch',
      'interaction:evt_workflow_review_started'
    ]
  );
  assert.deepEqual(
    defaultWindow.body.timeline.map((item) => item.event_id),
    [
      'evt_workflow_review_started',
      'evt_workflow_review_completed',
      'evt_workflow_peer_watch',
      'evt_workflow_handoff_started',
      'evt_workflow_handoff_completed',
      'evt_workflow_reboot',
      'evt_workflow_write'
    ]
  );
  assert.deepEqual(defaultWindow.body.correlation_ids, [
    'corr-workflow-handoff',
    'corr-workflow-peer-watch',
    'corr-workflow-reboot',
    'corr-workflow-review',
    'corr-workflow-write'
  ]);
  assert.deepEqual(defaultWindow.body.counterparty_agent_ids, [
    'growth-revenue',
    'protocol-engineering'
  ]);
  assert.equal(defaultWindow.body.counterparty_agent_ids.includes('app-engineering'), false);
  assert.equal(defaultWindow.body.counterparty_agent_ids.includes('team-lead'), false);

  const limited = await requestJson(
    `${baseUrl}/agents/app-engineering/workflow?window=20m&limit=2`
  );
  assert.equal(limited.response.status, 200);
  assert.equal(limited.body.detail.recent_events.length, 2);
  assert.deepEqual(
    limited.body.detail.recent_events.map((item) => item.event_id),
    ['evt_workflow_write', 'evt_workflow_reboot']
  );
  assert.equal(limited.body.detail.recent_interactions.length, 2);
  assert.equal(limited.body.detail.recent_incidents.length, 2);
  assert.deepEqual(
    limited.body.incidents.map((item) => item.incident_id),
    ['evt_workflow_reboot', 'evt_workflow_handoff_completed']
  );
  assert.deepEqual(
    limited.body.interactions.map((item) => item.interaction_id),
    ['interaction:evt_workflow_handoff_started', 'interaction:evt_workflow_peer_watch']
  );
  assert.deepEqual(
    limited.body.timeline.map((item) => item.event_id),
    ['evt_workflow_reboot', 'evt_workflow_write']
  );
  assert.deepEqual(limited.body.summary, {
    incident_count: 2,
    interaction_count: 2,
    event_count: 2,
    incident_kind_buckets: {
      reboot: 1,
      handoff: 1
    },
    interaction_type_buckets: {
      handoff: 1,
      peer_watch: 1
    },
    event_type_buckets: {
      agent_reboot_requested: 1,
      agent_wrote_file: 1
    },
    severity_buckets: {
      normal: 2,
      yellow: 1,
      orange: 1,
      red: 2
    },
    latest_activity_at: '2026-03-09T18:55:00.000Z'
  });
  assert.deepEqual(limited.body.correlation_ids, [
    'corr-workflow-handoff',
    'corr-workflow-peer-watch',
    'corr-workflow-reboot',
    'corr-workflow-write'
  ]);
  assert.deepEqual(limited.body.counterparty_agent_ids, [
    'growth-revenue',
    'protocol-engineering'
  ]);
  assert.equal(limited.body.counterparty_agent_ids.includes('app-engineering'), false);
  assert.equal(limited.body.counterparty_agent_ids.includes('team-lead'), false);
});

test('GET /agents/:id/workflow returns 404 for unknown agents', async (t) => {
  const { baseUrl } = await createHarness(t);

  const response = await requestJson(`${baseUrl}/agents/missing-agent/workflow`);
  assert.equal(response.response.status, 404);
  assert.equal(response.body.error, 'not_found');
});

test('GET /peer-watch/alerts supports evidence-oriented filters and fields', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:20:00.000Z'
  });

  await store.appendEvent(
    createEvent({
      eventId: 'evt_peer_watch_open_target',
      ts: '2026-03-09T18:10:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Fix evidence query',
      summary: 'Protocol engineering escalated missing evidence',
      severity: 'orange',
      correlationId: 'corr-open-target',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/evidence-open.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_peer_watch_resolved_target',
      ts: '2026-03-09T18:12:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_resolved',
      currentState: 'coding',
      activeTask: 'Fix evidence query',
      summary: 'Protocol engineering confirmed the evidence fix',
      severity: 'orange',
      correlationId: 'corr-open-target',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/evidence-resolved.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_peer_watch_other',
      ts: '2026-03-09T18:14:00.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Investigate stale market notes',
      summary: 'Growth revenue escalated stale evidence',
      severity: 'yellow',
      correlationId: 'corr-other',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/evidence-other.md']
    })
  );

  const filtered = await requestJson(
    `${baseUrl}/peer-watch/alerts?status=open&target_agent_id=market-intel&watcher_agent_id=growth-revenue&observer_agent_id=team-lead&correlation_id=corr-other&severity=yellow&limit=1`
  );
  assert.equal(filtered.response.status, 200);
  assert.equal(filtered.body.items.length, 1);
  assert.equal(filtered.body.items[0].alert_id, 'evt_peer_watch_other');
  assert.equal(filtered.body.items[0].target_agent_id, 'market-intel');
  assert.equal(filtered.body.items[0].observer_agent_id, 'team-lead');
  assert.deepEqual(filtered.body.items[0].watcher_agent_ids, ['growth-revenue']);
  assert.equal(filtered.body.items[0].evidence_count, 1);
  assert.equal(filtered.body.items[0].status, 'open');
  assert.equal(filtered.body.items[0].correlation_id, 'corr-other');

  const backwardsCompatible = await requestJson(
    `${baseUrl}/peer-watch/alerts?agent_id=app-engineering&status=resolved`
  );
  assert.equal(backwardsCompatible.response.status, 200);
  assert.equal(backwardsCompatible.body.items.length, 1);
  assert.equal(backwardsCompatible.body.items[0].alert_id, 'evt_peer_watch_resolved_target');
  assert.equal(backwardsCompatible.body.items[0].agent_id, 'app-engineering');

  const currentlyOpen = await requestJson(
    `${baseUrl}/peer-watch/alerts?agent_id=app-engineering&status=open`
  );
  assert.equal(currentlyOpen.response.status, 200);
  assert.deepEqual(currentlyOpen.body.items, []);
});

test('GET /incidents exposes a descending normalized incident feed with read-only filters', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:20:00.000Z'
  });

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_old',
      ts: '2026-03-09T17:40:00.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Investigate stale notes',
      summary: 'Old incident outside the feed window',
      severity: 'yellow',
      correlationId: 'corr-old-incident',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/incident-old.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_alert_unresolved',
      ts: '2026-03-09T18:07:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Track unresolved incident',
      summary: 'Protocol engineering left a second incident open',
      severity: 'orange',
      correlationId: 'corr-incident-open',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/incident-alert-unresolved.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_alert_open',
      ts: '2026-03-09T18:08:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Fix incident query',
      summary: 'Protocol engineering raised an active incident',
      severity: 'orange',
      correlationId: 'corr-incident-feed',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/incident-alert-open.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_alert_resolved',
      ts: '2026-03-09T18:09:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_resolved',
      currentState: 'coding',
      activeTask: 'Fix incident query',
      summary: 'Protocol engineering cleared the active incident',
      severity: 'orange',
      correlationId: 'corr-incident-feed',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/incident-alert-resolved.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_handoff_started',
      ts: '2026-03-09T18:12:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Hand off the incident follow-up',
      summary: 'Lead started an incident handoff',
      severity: 'yellow',
      correlationId: 'corr-incident-feed',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/incident-handoff-started.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_handoff_completed',
      ts: '2026-03-09T18:13:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_handoff_completed',
      currentState: 'planning',
      activeTask: 'Hand off the incident follow-up',
      summary: 'Lead completed the incident handoff',
      severity: 'normal',
      correlationId: 'corr-incident-feed',
      counterpartyAgentIds: [],
      evidenceRefs: ['/tmp/incident-handoff-completed.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_reboot_requested',
      ts: '2026-03-09T18:18:00.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Reset stale incident context',
      summary: 'Lead requested a reboot for the incident follow-up',
      severity: 'red',
      correlationId: 'corr-incident-reboot',
      evidenceRefs: ['/tmp/incident-reboot.md']
    })
  );

  const feed = await requestJson(`${baseUrl}/incidents?limit=4`);
  assert.equal(feed.response.status, 200);
  assert.deepEqual(
    feed.body.items.map((item) => item.incident_id),
    [
      'evt_incident_reboot_requested',
      'evt_incident_handoff_completed',
      'evt_incident_handoff_started',
      'evt_incident_alert_resolved'
    ]
  );
  assert.deepEqual(feed.body.items[0], {
    incident_id: 'evt_incident_reboot_requested',
    kind: 'reboot',
    ts: '2026-03-09T18:18:00.000Z',
    agent_id: 'market-intel',
    actor_id: 'team-lead',
    status: 'requested',
    severity: 'red',
    summary: 'Lead requested a reboot for the incident follow-up',
    correlation_id: 'corr-incident-reboot',
    evidence_refs: ['/tmp/incident-reboot.md'],
    counterparty_agent_ids: [],
    source_kind: 'controller_event'
  });

  const handoffOnly = await requestJson(
    `${baseUrl}/incidents?kind=handoff&agent_id=app-engineering&severity=yellow&status=started&correlation_id=corr-incident-feed&limit=2`
  );
  assert.equal(handoffOnly.response.status, 200);
  assert.deepEqual(handoffOnly.body.items, [
    {
      incident_id: 'evt_incident_handoff_started',
      kind: 'handoff',
      ts: '2026-03-09T18:12:00.000Z',
      agent_id: 'app-engineering',
      actor_id: 'team-lead',
      status: 'started',
      severity: 'yellow',
      summary: 'Lead started an incident handoff',
      correlation_id: 'corr-incident-feed',
      evidence_refs: ['/tmp/incident-handoff-started.md'],
      counterparty_agent_ids: ['growth-revenue'],
      source_kind: 'controller_event'
    }
  ]);

  const recentWindow = await requestJson(`${baseUrl}/incidents?window=10m`);
  assert.equal(recentWindow.response.status, 200);
  assert.deepEqual(
    recentWindow.body.items.map((item) => item.incident_id),
    [
      'evt_incident_reboot_requested',
      'evt_incident_handoff_completed',
      'evt_incident_handoff_started'
    ]
  );

  const openPeerWatch = await requestJson(
    `${baseUrl}/incidents?kind=peer_watch_alert&status=open&agent_id=app-engineering&severity=orange&correlation_id=corr-incident-open`
  );
  assert.equal(openPeerWatch.response.status, 200);
  assert.deepEqual(openPeerWatch.body.items, [
    {
      incident_id: 'evt_incident_alert_unresolved',
      kind: 'peer_watch_alert',
      ts: '2026-03-09T18:07:00.000Z',
      agent_id: 'app-engineering',
      actor_id: 'team-lead',
      status: 'open',
      severity: 'orange',
      summary: 'Protocol engineering left a second incident open',
      correlation_id: 'corr-incident-open',
      evidence_refs: ['/tmp/incident-alert-unresolved.md'],
      counterparty_agent_ids: ['protocol-engineering'],
      source_kind: 'controller_event'
    }
  ]);

  const openActiveIncidents = await requestJson(
    `${baseUrl}/incidents?status=open&window=20m`
  );
  assert.equal(openActiveIncidents.response.status, 200);
  assert.deepEqual(
    openActiveIncidents.body.items.map((item) => item.incident_id),
    [
      'evt_incident_reboot_requested',
      'evt_incident_alert_unresolved'
    ]
  );

  const completedIncidents = await requestJson(
    `${baseUrl}/incidents?status=completed&correlation_id=corr-incident-feed`
  );
  assert.equal(completedIncidents.response.status, 200);
  assert.deepEqual(
    completedIncidents.body.items.map((item) => item.incident_id),
    ['evt_incident_handoff_completed']
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_blank_reboot_one',
      ts: '2026-03-09T18:15:00.000Z',
      agentId: 'product-pmf',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Reset first blank-correlation reboot',
      summary: 'Lead requested the first blank-correlation reboot',
      severity: 'yellow',
      correlationId: '',
      evidenceRefs: ['/tmp/blank-reboot-one.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_blank_reboot_two',
      ts: '2026-03-09T18:16:00.000Z',
      agentId: 'product-pmf',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Reset second blank-correlation reboot',
      summary: 'Lead requested the second blank-correlation reboot',
      severity: 'orange',
      correlationId: '',
      evidenceRefs: ['/tmp/blank-reboot-two.md']
    })
  );

  const concurrentBlankReboots = await requestJson(
    `${baseUrl}/incidents?kind=reboot&agent_id=product-pmf&status=open&window=20m`
  );
  assert.equal(concurrentBlankReboots.response.status, 200);
  assert.deepEqual(
    concurrentBlankReboots.body.items.map((item) => item.incident_id),
    ['evt_incident_blank_reboot_two', 'evt_incident_blank_reboot_one']
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_correlated_reboot_one',
      ts: '2026-03-09T18:17:00.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Reset first correlated reboot',
      summary: 'Lead requested the first correlated reboot',
      severity: 'yellow',
      correlationId: 'corr-blank-completion-one',
      evidenceRefs: ['/tmp/correlated-reboot-one.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_correlated_reboot_two',
      ts: '2026-03-09T18:18:00.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Reset second correlated reboot',
      summary: 'Lead requested the second correlated reboot',
      severity: 'orange',
      correlationId: 'corr-blank-completion-two',
      evidenceRefs: ['/tmp/correlated-reboot-two.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_blank_correlation_reboot_completed',
      ts: '2026-03-09T18:19:00.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'agent_reboot_completed',
      currentState: 'rebooting',
      activeTask: 'Ignore ambiguous blank-correlation completion',
      summary: 'Lead completed an ambiguous blank-correlation reboot',
      severity: 'normal',
      correlationId: '',
      evidenceRefs: ['/tmp/blank-correlation-reboot-completed.md']
    })
  );

  const blankCorrelationCompletionReboots = await requestJson(
    `${baseUrl}/incidents?kind=reboot&agent_id=market-intel&status=open&correlation_id=corr-blank-completion-two&window=20m`
  );
  assert.equal(blankCorrelationCompletionReboots.response.status, 200);
  assert.deepEqual(
    blankCorrelationCompletionReboots.body.items.map((item) => item.incident_id),
    ['evt_incident_correlated_reboot_two']
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_ambiguous_handoff_one',
      ts: '2026-03-09T18:17:00.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Start first ambiguous handoff',
      summary: 'Lead started the first ambiguous handoff',
      severity: 'yellow',
      correlationId: 'corr-ambiguous-handoff',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/ambiguous-handoff-one.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_ambiguous_handoff_two',
      ts: '2026-03-09T18:18:00.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Start second ambiguous handoff',
      summary: 'Lead started the second ambiguous handoff',
      severity: 'orange',
      correlationId: 'corr-ambiguous-handoff',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/ambiguous-handoff-two.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_ambiguous_handoff_completed',
      ts: '2026-03-09T18:19:00.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'agent_handoff_completed',
      currentState: 'planning',
      activeTask: 'Ignore ambiguous handoff completion',
      summary: 'Lead completed an ambiguous handoff lifecycle',
      severity: 'normal',
      correlationId: 'corr-ambiguous-handoff',
      counterpartyAgentIds: [],
      evidenceRefs: ['/tmp/ambiguous-handoff-completed.md']
    })
  );

  const ambiguousHandoffCompletion = await requestJson(
    `${baseUrl}/incidents?kind=handoff&agent_id=market-intel&status=open&correlation_id=corr-ambiguous-handoff&window=20m`
  );
  assert.equal(ambiguousHandoffCompletion.response.status, 200);
  assert.deepEqual(
    ambiguousHandoffCompletion.body.items.map((item) => item.incident_id),
    ['evt_incident_ambiguous_handoff_two', 'evt_incident_ambiguous_handoff_one']
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_ambiguous_blank_correlation_handoff_one',
      ts: '2026-03-09T18:14:00.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Start first blank-correlation ambiguous handoff',
      summary: 'Lead started the first blank-correlation ambiguous handoff',
      severity: 'yellow',
      correlationId: 'corr-ambiguous-blank-correlation-one',
      counterpartyAgentIds: ['app-engineering'],
      evidenceRefs: ['/tmp/ambiguous-blank-correlation-handoff-one.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_ambiguous_blank_correlation_handoff_two',
      ts: '2026-03-09T18:15:00.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Start second blank-correlation ambiguous handoff',
      summary: 'Lead started the second blank-correlation ambiguous handoff',
      severity: 'orange',
      correlationId: 'corr-ambiguous-blank-correlation-two',
      counterpartyAgentIds: ['app-engineering'],
      evidenceRefs: ['/tmp/ambiguous-blank-correlation-handoff-two.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_ambiguous_blank_correlation_handoff_completed',
      ts: '2026-03-09T18:16:00.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'agent_handoff_completed',
      currentState: 'planning',
      activeTask: 'Ignore blank-correlation ambiguous completion',
      summary: 'Lead completed a blank-correlation ambiguous handoff lifecycle',
      severity: 'normal',
      correlationId: '',
      counterpartyAgentIds: ['app-engineering'],
      evidenceRefs: ['/tmp/ambiguous-blank-correlation-handoff-completed.md']
    })
  );

  const ambiguousBlankCorrelationCompletion = await requestJson(
    `${baseUrl}/incidents?kind=handoff&agent_id=market-intel&status=open&window=20m`
  );
  assert.equal(ambiguousBlankCorrelationCompletion.response.status, 200);
  assert.deepEqual(
    ambiguousBlankCorrelationCompletion.body.items.map((item) => item.incident_id),
    [
      'evt_incident_ambiguous_handoff_two',
      'evt_incident_ambiguous_handoff_one',
      'evt_incident_ambiguous_blank_correlation_handoff_two',
      'evt_incident_ambiguous_blank_correlation_handoff_one'
    ]
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_duplicate_reboot_requested_one',
      ts: '2026-03-09T18:16:30.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Retry reboot request for the same lifecycle',
      summary: 'Lead requested a duplicate reboot lifecycle once',
      severity: 'red',
      correlationId: 'corr-duplicate-reboot-lifecycle',
      evidenceRefs: ['/tmp/duplicate-reboot-request-one.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_duplicate_reboot_requested_two',
      ts: '2026-03-09T18:17:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Retry reboot request for the same lifecycle again',
      summary: 'Lead requested a duplicate reboot lifecycle twice',
      severity: 'red',
      correlationId: 'corr-duplicate-reboot-lifecycle',
      evidenceRefs: ['/tmp/duplicate-reboot-request-two.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_duplicate_reboot_completed',
      ts: '2026-03-09T18:17:30.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_reboot_completed',
      currentState: 'rebooting',
      activeTask: 'Complete the duplicate reboot lifecycle',
      summary: 'Lead completed the duplicate reboot lifecycle',
      severity: 'normal',
      correlationId: 'corr-duplicate-reboot-lifecycle',
      evidenceRefs: ['/tmp/duplicate-reboot-completed.md']
    })
  );

  const duplicateRebootLifecycle = await requestJson(
    `${baseUrl}/incidents?kind=reboot&agent_id=app-engineering&status=open&correlation_id=corr-duplicate-reboot-lifecycle&window=20m`
  );
  assert.equal(duplicateRebootLifecycle.response.status, 200);
  assert.deepEqual(duplicateRebootLifecycle.body.items, []);

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_retried_handoff_started_one',
      ts: '2026-03-09T18:17:40.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Retry a handoff before counterparty metadata is complete',
      summary: 'Lead started a handoff before counterparty metadata was complete',
      severity: 'yellow',
      correlationId: 'corr-retried-handoff-open',
      counterpartyAgentIds: [],
      evidenceRefs: ['/tmp/retried-handoff-started-one.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_retried_handoff_started_two',
      ts: '2026-03-09T18:17:50.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Retry a handoff after counterparty metadata is known',
      summary: 'Lead retried a handoff with richer counterparty metadata',
      severity: 'yellow',
      correlationId: 'corr-retried-handoff-open',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/retried-handoff-started-two.md']
    })
  );

  const retriedOpenHandoff = await requestJson(
    `${baseUrl}/incidents?kind=handoff&agent_id=market-intel&status=open&correlation_id=corr-retried-handoff-open&window=20m`
  );
  assert.equal(retriedOpenHandoff.response.status, 200);
  assert.deepEqual(
    retriedOpenHandoff.body.items.map((item) => item.incident_id),
    ['evt_incident_retried_handoff_started_two']
  );
  assert.deepEqual(retriedOpenHandoff.body.items[0].counterparty_agent_ids, ['growth-revenue']);

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_parallel_subset_handoff_one',
      ts: '2026-03-09T18:17:52.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Keep the first parallel handoff open',
      summary: 'Lead started a parallel handoff with a subset counterparty set',
      severity: 'yellow',
      correlationId: 'corr-parallel-open-subset-handoff',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/parallel-subset-handoff-one.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_parallel_subset_handoff_two',
      ts: '2026-03-09T18:17:53.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Keep the second parallel handoff open',
      summary: 'Lead started a parallel handoff with a superset counterparty set',
      severity: 'orange',
      correlationId: 'corr-parallel-open-subset-handoff',
      counterpartyAgentIds: ['growth-revenue', 'protocol-engineering'],
      evidenceRefs: ['/tmp/parallel-subset-handoff-two.md']
    })
  );

  const parallelSubsetHandoffs = await requestJson(
    `${baseUrl}/incidents?kind=handoff&agent_id=market-intel&status=open&correlation_id=corr-parallel-open-subset-handoff&window=20m`
  );
  assert.equal(parallelSubsetHandoffs.response.status, 200);
  assert.deepEqual(
    parallelSubsetHandoffs.body.items.map((item) => item.incident_id),
    ['evt_incident_parallel_subset_handoff_two', 'evt_incident_parallel_subset_handoff_one']
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_subset_counterparty_handoff_started',
      ts: '2026-03-09T18:17:55.000Z',
      agentId: 'product-pmf',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Start a multi-party handoff before completion metadata shrinks',
      summary: 'Lead started a multi-party handoff',
      severity: 'orange',
      correlationId: 'corr-subset-counterparty-handoff',
      counterpartyAgentIds: ['app-engineering', 'growth-revenue'],
      evidenceRefs: ['/tmp/subset-counterparty-handoff-started.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_subset_counterparty_handoff_completed',
      ts: '2026-03-09T18:18:05.000Z',
      agentId: 'product-pmf',
      actorId: 'team-lead',
      eventType: 'agent_handoff_completed',
      currentState: 'planning',
      activeTask: 'Complete a multi-party handoff with partial metadata',
      summary: 'Lead completed a multi-party handoff after metadata shrank',
      severity: 'normal',
      correlationId: 'corr-subset-counterparty-handoff',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/subset-counterparty-handoff-completed.md']
    })
  );

  const subsetCounterpartyHandoff = await requestJson(
    `${baseUrl}/incidents?kind=handoff&agent_id=product-pmf&status=open&correlation_id=corr-subset-counterparty-handoff&window=20m`
  );
  assert.equal(subsetCounterpartyHandoff.response.status, 200);
  assert.deepEqual(subsetCounterpartyHandoff.body.items, []);

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_partial_counterparty_handoff',
      ts: '2026-03-09T18:10:00.000Z',
      agentId: 'product-pmf',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Start handoff before counterparty metadata is complete',
      summary: 'Lead started a handoff before counterparty metadata was complete',
      severity: 'yellow',
      correlationId: 'corr-partial-counterparty-handoff',
      counterpartyAgentIds: [],
      evidenceRefs: ['/tmp/partial-counterparty-handoff-started.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_partial_counterparty_handoff_completed',
      ts: '2026-03-09T18:11:00.000Z',
      agentId: 'product-pmf',
      actorId: 'team-lead',
      eventType: 'agent_handoff_completed',
      currentState: 'planning',
      activeTask: 'Complete handoff after counterparty metadata is known',
      summary: 'Lead completed a handoff after counterparty metadata was known',
      severity: 'normal',
      correlationId: 'corr-partial-counterparty-handoff',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/partial-counterparty-handoff-completed.md']
    })
  );

  const partialCounterpartyHandoff = await requestJson(
    `${baseUrl}/incidents?kind=handoff&agent_id=product-pmf&status=open&correlation_id=corr-partial-counterparty-handoff&window=20m`
  );
  assert.equal(partialCounterpartyHandoff.response.status, 200);
  assert.deepEqual(partialCounterpartyHandoff.body.items, []);

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_correlation_drift_handoff',
      ts: '2026-03-09T18:12:00.000Z',
      agentId: 'product-pmf',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Start handoff before correlation metadata is corrected',
      summary: 'Lead started a handoff before correlation metadata was corrected',
      severity: 'yellow',
      correlationId: 'corr-drift-start-handoff',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/correlation-drift-handoff-started.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_correlation_drift_handoff_completed',
      ts: '2026-03-09T18:13:00.000Z',
      agentId: 'product-pmf',
      actorId: 'team-lead',
      eventType: 'agent_handoff_completed',
      currentState: 'planning',
      activeTask: 'Complete handoff after correlation metadata is corrected',
      summary: 'Lead completed a handoff after correlation metadata was corrected',
      severity: 'normal',
      correlationId: '',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/correlation-drift-handoff-completed.md']
    })
  );

  const correlationDriftHandoff = await requestJson(
    `${baseUrl}/incidents?kind=handoff&agent_id=product-pmf&status=open&correlation_id=corr-drift-start-handoff&window=20m`
  );
  assert.equal(correlationDriftHandoff.response.status, 200);
  assert.deepEqual(correlationDriftHandoff.body.items, []);

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_window_ambiguous_reboot_old',
      ts: '2026-03-09T17:50:00.000Z',
      agentId: 'growth-revenue',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Keep an older reboot lifecycle open outside the request window',
      summary: 'Lead requested an older reboot lifecycle outside the open window',
      severity: 'yellow',
      correlationId: 'corr-window-ambiguous-reboot-old',
      evidenceRefs: ['/tmp/window-ambiguous-reboot-old.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_window_ambiguous_reboot_target',
      ts: '2026-03-09T18:10:00.000Z',
      agentId: 'growth-revenue',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Keep the in-window reboot lifecycle open',
      summary: 'Lead requested an in-window reboot lifecycle',
      severity: 'orange',
      correlationId: 'corr-window-ambiguous-reboot-target',
      evidenceRefs: ['/tmp/window-ambiguous-reboot-target.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_window_ambiguous_reboot_completed',
      ts: '2026-03-09T18:15:00.000Z',
      agentId: 'growth-revenue',
      actorId: 'team-lead',
      eventType: 'agent_reboot_completed',
      currentState: 'rebooting',
      activeTask: 'Ignore a blank-correlation reboot completion that is ambiguous across window boundaries',
      summary: 'Lead completed an ambiguous blank-correlation reboot',
      severity: 'normal',
      correlationId: '',
      evidenceRefs: ['/tmp/window-ambiguous-reboot-completed.md']
    })
  );

  const windowedOpenReboot = await requestJson(
    `${baseUrl}/incidents?kind=reboot&agent_id=growth-revenue&status=open&correlation_id=corr-window-ambiguous-reboot-target&window=20m`
  );
  assert.equal(windowedOpenReboot.response.status, 200);
  assert.deepEqual(
    windowedOpenReboot.body.items.map((item) => item.incident_id),
    ['evt_incident_window_ambiguous_reboot_target']
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_future_completion_handoff',
      ts: '2026-03-09T18:18:00.000Z',
      agentId: 'growth-revenue',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Keep handoff open before future completion',
      summary: 'Lead started a handoff that completes in the future',
      severity: 'orange',
      correlationId: 'corr-future-completion-handoff',
      counterpartyAgentIds: ['app-engineering'],
      evidenceRefs: ['/tmp/future-completion-handoff-started.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_future_completion_handoff_completed',
      ts: '2026-03-09T18:25:00.000Z',
      agentId: 'growth-revenue',
      actorId: 'team-lead',
      eventType: 'agent_handoff_completed',
      currentState: 'planning',
      activeTask: 'Complete handoff in the future',
      summary: 'Lead completed a handoff after the request now time',
      severity: 'normal',
      correlationId: 'corr-future-completion-handoff',
      counterpartyAgentIds: ['app-engineering'],
      evidenceRefs: ['/tmp/future-completion-handoff-completed.md']
    })
  );

  const futureCompletionHandoff = await requestJson(
    `${baseUrl}/incidents?kind=handoff&agent_id=growth-revenue&status=open&correlation_id=corr-future-completion-handoff`
  );
  assert.equal(futureCompletionHandoff.response.status, 200);
  assert.deepEqual(
    futureCompletionHandoff.body.items.map((item) => item.incident_id),
    ['evt_incident_future_completion_handoff']
  );

  await store.appendEvent(
    createEvent({
      eventId: 'z_incident_same_ts_reboot_requested',
      ts: '2026-03-09T18:14:00.000Z',
      agentId: 'protocol-engineering',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Reset same timestamp lifecycle',
      summary: 'Lead requested a same timestamp reboot',
      severity: 'red',
      correlationId: 'corr-same-ts-reboot',
      evidenceRefs: ['/tmp/same-ts-reboot-requested.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'a_incident_same_ts_reboot_completed',
      ts: '2026-03-09T18:14:00.000Z',
      agentId: 'protocol-engineering',
      actorId: 'team-lead',
      eventType: 'agent_reboot_completed',
      currentState: 'rebooting',
      activeTask: 'Reset same timestamp lifecycle',
      summary: 'Lead completed a same timestamp reboot',
      severity: 'normal',
      correlationId: 'corr-same-ts-reboot',
      evidenceRefs: ['/tmp/same-ts-reboot-completed.md']
    })
  );

  const sameTimestampReboot = await requestJson(
    `${baseUrl}/incidents?kind=reboot&agent_id=protocol-engineering&status=open&correlation_id=corr-same-ts-reboot&window=20m`
  );
  assert.equal(sameTimestampReboot.response.status, 200);
  assert.deepEqual(sameTimestampReboot.body.items, []);

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_same_ts_completed_before_requested_completed',
      ts: '2026-03-09T18:14:00.000Z',
      agentId: 'protocol-engineering',
      actorId: 'team-lead',
      eventType: 'agent_reboot_completed',
      currentState: 'rebooting',
      activeTask: 'Complete same timestamp lifecycle before request append',
      summary: 'Lead completed a same timestamp reboot before request append',
      severity: 'normal',
      correlationId: 'corr-same-ts-reboot-reversed',
      evidenceRefs: ['/tmp/same-ts-reboot-reversed-completed.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_incident_same_ts_completed_before_requested_requested',
      ts: '2026-03-09T18:14:00.000Z',
      agentId: 'protocol-engineering',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Request same timestamp lifecycle after completion append',
      summary: 'Lead requested a same timestamp reboot after completion append',
      severity: 'red',
      correlationId: 'corr-same-ts-reboot-reversed',
      evidenceRefs: ['/tmp/same-ts-reboot-reversed-requested.md']
    })
  );

  const sameTimestampReversedReboot = await requestJson(
    `${baseUrl}/incidents?kind=reboot&agent_id=protocol-engineering&status=open&correlation_id=corr-same-ts-reboot-reversed&window=20m`
  );
  assert.equal(sameTimestampReversedReboot.response.status, 200);
  assert.deepEqual(sameTimestampReversedReboot.body.items, []);
});

test('GET /agents/:id/incidents reuses incident feed semantics with an implicit agent filter', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:20:00.000Z'
  });

  await store.appendEvent(
    createEvent({
      eventId: 'evt_agent_incident_old',
      ts: '2026-03-09T17:40:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Investigate stale notes',
      summary: 'Old agent incident outside the route window',
      severity: 'yellow',
      correlationId: 'corr-agent-incident-old',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/agent-incident-old.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_agent_incident_alert',
      ts: '2026-03-09T18:08:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Fix agent incident query',
      summary: 'Lead raised an agent incident',
      severity: 'orange',
      correlationId: 'corr-agent-incident-feed',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/agent-incident-alert.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_agent_incident_handoff',
      ts: '2026-03-09T18:12:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Hand off agent incident follow-up',
      summary: 'Lead started an agent incident handoff',
      severity: 'yellow',
      correlationId: 'corr-agent-incident-feed',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/agent-incident-handoff.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_agent_incident_unmatched_handoff_completed',
      ts: '2026-03-09T18:13:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_handoff_completed',
      currentState: 'planning',
      activeTask: 'Ignore unrelated completion',
      summary: 'Lead completed an unrelated handoff lifecycle',
      severity: 'normal',
      correlationId: 'corr-agent-unmatched-complete',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/agent-unmatched-handoff-complete.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_agent_incident_reboot',
      ts: '2026-03-09T18:16:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Reset agent incident context',
      summary: 'Lead requested an agent incident reboot',
      severity: 'red',
      correlationId: 'corr-agent-open-reboot',
      evidenceRefs: ['/tmp/agent-incident-reboot.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_agent_incident_reboot_completed',
      ts: '2026-03-09T18:17:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_reboot_completed',
      currentState: 'rebooting',
      activeTask: 'Reset agent incident context',
      summary: 'Lead completed the agent incident reboot',
      severity: 'normal',
      correlationId: 'corr-agent-open-reboot',
      evidenceRefs: ['/tmp/agent-incident-reboot-completed.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_other_agent_incident',
      ts: '2026-03-09T18:18:00.000Z',
      agentId: 'market-intel',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Reset stale incident context',
      summary: 'Lead requested a reboot for another agent incident',
      severity: 'red',
      correlationId: 'corr-agent-incident-feed',
      evidenceRefs: ['/tmp/other-agent-incident.md']
    })
  );

  const response = await requestJson(
    `${baseUrl}/agents/app-engineering/incidents?kind=handoff&severity=yellow&status=started&correlation_id=corr-agent-incident-feed&window=10m&limit=1`
  );
  assert.equal(response.response.status, 200);
  assert.equal(response.body.agent_id, 'app-engineering');
  assert.deepEqual(response.body.items, [
    {
      incident_id: 'evt_agent_incident_handoff',
      kind: 'handoff',
      ts: '2026-03-09T18:12:00.000Z',
      agent_id: 'app-engineering',
      actor_id: 'team-lead',
      status: 'started',
      severity: 'yellow',
      summary: 'Lead started an agent incident handoff',
      correlation_id: 'corr-agent-incident-feed',
      evidence_refs: ['/tmp/agent-incident-handoff.md'],
      counterparty_agent_ids: ['growth-revenue'],
      source_kind: 'controller_event'
    }
  ]);

  const implicitAgentFilter = await requestJson(
    `${baseUrl}/agents/app-engineering/incidents?correlation_id=corr-agent-incident-feed&window=20m&limit=5`
  );
  assert.equal(implicitAgentFilter.response.status, 200);
  assert.deepEqual(
    implicitAgentFilter.body.items.map((item) => item.incident_id),
    ['evt_agent_incident_handoff', 'evt_agent_incident_alert']
  );

  const openActiveIncidents = await requestJson(
    `${baseUrl}/agents/app-engineering/incidents?status=open&window=20m`
  );
  assert.equal(openActiveIncidents.response.status, 200);
  assert.deepEqual(
    openActiveIncidents.body.items.map((item) => item.incident_id),
    ['evt_agent_incident_handoff', 'evt_agent_incident_alert']
  );

  const completedAgentReboot = await requestJson(
    `${baseUrl}/agents/app-engineering/incidents?status=completed&correlation_id=corr-agent-open-reboot&window=20m`
  );
  assert.equal(completedAgentReboot.response.status, 200);
  assert.deepEqual(
    completedAgentReboot.body.items.map((item) => item.incident_id),
    ['evt_agent_incident_reboot_completed']
  );

  const openRedAgentIncidents = await requestJson(
    `${baseUrl}/agents/app-engineering/incidents?status=open&severity=red&window=20m`
  );
  assert.equal(openRedAgentIncidents.response.status, 200);
  assert.deepEqual(openRedAgentIncidents.body.items, []);

  const missingAgent = await requestJson(`${baseUrl}/agents/missing-agent/incidents`);
  assert.equal(missingAgent.response.status, 404);
});

test('GET /memory/artifacts materializes actor and counterparty evidence plus collector observations that extend event-backed artifacts', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:20:00.000Z'
  });

  await store.appendEvent(
    createEvent({
      eventId: 'evt_memory_counterparty',
      ts: '2026-03-09T18:06:00.000Z',
      agentId: 'growth-revenue',
      actorId: 'team-lead',
      eventType: 'review_started',
      currentState: 'reviewing',
      activeTask: 'Review the artifact coverage',
      summary: 'Lead started review with app-engineering as counterparty',
      severity: 'yellow',
      correlationId: 'corr-memory',
      counterpartyAgentIds: ['app-engineering'],
      evidenceRefs: ['/tmp/memory-counterparty.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_memory_existing_artifact',
      ts: '2026-03-09T18:04:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_started',
      currentState: 'idle',
      activeTask: 'Keep shared artifact in view',
      summary: 'Existing event already referenced the shared artifact',
      severity: 'normal',
      correlationId: 'corr-memory-shared',
      counterpartyAgentIds: [],
      evidenceRefs: ['/tmp/shared.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_memory_latest_artifact',
      ts: '2026-03-09T18:08:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_completed',
      currentState: 'reviewing',
      activeTask: 'Refresh shared artifact anchor',
      summary: 'Newer event updated the shared artifact anchor',
      severity: 'normal',
      correlationId: 'corr-memory-shared-latest',
      counterpartyAgentIds: [],
      evidenceRefs: ['/tmp/shared.md']
    })
  );

  await store.appendCollectorReport({
    collected_at: '2026-03-09T18:18:00.000Z',
    actor_id: 'team-lead',
      summary: {
        agent_count: 1,
        heartbeat_count: 1,
        tmux_observed_count: 1,
        workspace_observed_count: 3,
        reboot_recommended_count: 0
      },
    items: [
      {
        agent_id: 'app-engineering',
        workspace_root: '/tmp/app-engineering',
        session_ref: '5-web3-app-engineering',
        evidence_refs: ['/tmp/collector-only.md', 'tmux://5-web3-app-engineering/0.1'],
        workspace_observations: [
          {
            path: '/tmp/collector-only.md',
            file_name: 'collector-only.md',
            kind: 'workspace_file',
            last_modified_at: '2026-03-09T18:17:00.000Z'
          },
          {
            path: '/tmp/passive-only.md',
            file_name: 'passive-only.md',
            kind: 'workspace_file',
            last_modified_at: '2026-03-09T18:15:00.000Z'
          },
          {
            path: '/tmp/shared.md',
            file_name: 'shared.md',
            kind: 'workspace_file',
            last_modified_at: '2026-03-09T18:16:30.000Z'
          }
        ],
        tmux_observations: [
          {
            session_name: '5-web3-app-engineering',
            window_index: '0',
            pane_index: '1',
            pane_id: '%11',
            pane_title: 'Implement HTTP handlers',
            pane_current_command: 'nvim',
            pane_active: true,
            pane_dead: false,
            pane_activity_at: '2026-03-09T18:18:30.000Z'
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
          received_at: '2026-03-09T18:18:00.000Z',
          current_state: 'coding',
          active_task: 'Implement HTTP handlers',
          current_location: 'desk-app-engineering',
          last_meaningful_output_at: '2026-03-09T18:16:00.000Z',
          last_file_write_at: '2026-03-09T18:17:00.000Z',
          current_blocker: '',
          confidence_level: 'high',
          reboot_recommended: false,
          evidence_refs: ['/tmp/collector-only.md', 'tmux://5-web3-app-engineering/0.1']
        }
      }
    ]
  });

  const counterpartyResponse = await requestJson(
    `${baseUrl}/memory/artifacts?agent_id=app-engineering&correlation_id=corr-memory&window=20m&limit=10`
  );
  assert.equal(counterpartyResponse.response.status, 200);
  assert.deepEqual(counterpartyResponse.body, {
    generated_at: '2026-03-09T18:20:00.000Z',
    items: [
      {
        artifact_ref: '/tmp/memory-counterparty.md',
        artifact_kind: 'evidence_ref',
        file_name: 'memory-counterparty.md',
        first_seen_at: '2026-03-09T18:06:00.000Z',
        last_seen_at: '2026-03-09T18:06:00.000Z',
        mention_count: 1,
        agent_ids: ['app-engineering', 'growth-revenue', 'team-lead'],
        correlation_ids: ['corr-memory'],
        source_kinds: ['controller_event'],
        latest_summary: 'Lead started review with app-engineering as counterparty',
        latest_event_type: 'review_started',
        latest_event_id: 'evt_memory_counterparty',
        replay_checkpoint: {
          event_id: 'evt_memory_counterparty',
          event_type: 'review_started',
          summary: 'Lead started review with app-engineering as counterparty',
          last_seen_at: '2026-03-09T18:06:00.000Z'
        },
        collector_last_modified_at: null
      }
    ]
  });

  const collectorOnlyResponse = await requestJson(`${baseUrl}/memory/artifacts?agent_id=app-engineering&window=20m&limit=10`);
  assert.equal(collectorOnlyResponse.response.status, 200);
  assert.deepEqual(collectorOnlyResponse.body.items.slice(0, 2), [
    {
      artifact_ref: 'tmux://5-web3-app-engineering/0.1',
      artifact_kind: 'tmux_observation',
      file_name: 'Implement HTTP handlers',
      first_seen_at: '2026-03-09T18:18:00.000Z',
      last_seen_at: '2026-03-09T18:18:30.000Z',
      mention_count: 2,
      agent_ids: ['app-engineering', 'team-lead'],
      correlation_ids: ['collector-snapshot:2026-03-09T18:18:00.000Z'],
      source_kinds: ['tmux_observation'],
      latest_summary: 'Collector observed state change reviewing -> coding',
      latest_event_type: 'agent_state_changed',
      latest_event_id: 'evt_collector_app-engineering_state_change_observed_normal_2026-03-09T18_18_00_000Z',
      replay_checkpoint: {
        event_id: 'evt_collector_app-engineering_state_change_observed_normal_2026-03-09T18_18_00_000Z',
        event_type: 'agent_state_changed',
        summary: 'Collector observed state change reviewing -> coding',
        last_seen_at: '2026-03-09T18:18:00.000Z'
      },
      collector_last_modified_at: '2026-03-09T18:18:30.000Z'
    },
    {
      artifact_ref: '/tmp/collector-only.md',
      artifact_kind: 'workspace_file',
      file_name: 'collector-only.md',
      first_seen_at: '2026-03-09T18:17:00.000Z',
      last_seen_at: '2026-03-09T18:17:00.000Z',
      mention_count: 2,
      agent_ids: ['app-engineering', 'team-lead'],
      correlation_ids: ['collector-snapshot:2026-03-09T18:18:00.000Z'],
      source_kinds: ['workspace_file'],
      latest_summary: 'Collector observed workspace write to collector-only.md',
      latest_event_type: 'agent_wrote_file',
      latest_event_id: 'evt_collector_app-engineering_file_write_observed_normal_2026-03-09T18_18_00_000Z',
      replay_checkpoint: {
        event_id: 'evt_collector_app-engineering_file_write_observed_normal_2026-03-09T18_18_00_000Z',
        event_type: 'agent_wrote_file',
        summary: 'Collector observed workspace write to collector-only.md',
        last_seen_at: '2026-03-09T18:17:00.000Z'
      },
      collector_last_modified_at: '2026-03-09T18:17:00.000Z'
    }
  ]);

  const passiveOnlyArtifact = collectorOnlyResponse.body.items.find((item) => item.artifact_ref === '/tmp/passive-only.md');
  assert.deepEqual(passiveOnlyArtifact, {
    artifact_ref: '/tmp/passive-only.md',
    artifact_kind: 'workspace_file',
    file_name: 'passive-only.md',
    first_seen_at: '2026-03-09T18:15:00.000Z',
    last_seen_at: '2026-03-09T18:15:00.000Z',
    mention_count: 1,
    agent_ids: ['app-engineering', 'team-lead'],
    correlation_ids: ['collector-snapshot:2026-03-09T18:18:00.000Z'],
    source_kinds: ['workspace_file'],
    latest_summary: null,
    latest_event_type: null,
    collector_last_modified_at: '2026-03-09T18:15:00.000Z'
  });
  assert.equal(Object.prototype.hasOwnProperty.call(passiveOnlyArtifact, 'latest_event_id'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(passiveOnlyArtifact, 'replay_checkpoint'), false);

  const sharedArtifact = collectorOnlyResponse.body.items.find((item) => item.artifact_ref === '/tmp/shared.md');
  assert.deepEqual(sharedArtifact, {
    artifact_ref: '/tmp/shared.md',
    artifact_kind: 'workspace_file',
    file_name: 'shared.md',
    first_seen_at: '2026-03-09T18:04:00.000Z',
    last_seen_at: '2026-03-09T18:16:30.000Z',
    mention_count: 3,
    agent_ids: ['app-engineering', 'team-lead'],
    correlation_ids: [
      'collector-snapshot:2026-03-09T18:18:00.000Z',
      'corr-memory-shared',
      'corr-memory-shared-latest'
    ],
    source_kinds: ['controller_event', 'workspace_file'],
    latest_summary: 'Newer event updated the shared artifact anchor',
    latest_event_type: 'review_completed',
    latest_event_id: 'evt_memory_latest_artifact',
    replay_checkpoint: {
      event_id: 'evt_memory_latest_artifact',
      event_type: 'review_completed',
      summary: 'Newer event updated the shared artifact anchor',
      last_seen_at: '2026-03-09T18:08:00.000Z'
    },
    collector_last_modified_at: '2026-03-09T18:16:30.000Z'
  });

  const exactArtifactResponse = await requestJson(
    `${baseUrl}/memory/artifacts?agent_id=app-engineering&artifact_ref=${encodeURIComponent('/tmp/shared.md')}&window=20m&limit=10`
  );
  assert.equal(exactArtifactResponse.response.status, 200);
  assert.deepEqual(exactArtifactResponse.body.items, [
    {
      artifact_ref: '/tmp/shared.md',
      artifact_kind: 'workspace_file',
      file_name: 'shared.md',
      first_seen_at: '2026-03-09T18:04:00.000Z',
      last_seen_at: '2026-03-09T18:16:30.000Z',
      mention_count: 3,
      agent_ids: ['app-engineering', 'team-lead'],
      correlation_ids: [
        'collector-snapshot:2026-03-09T18:18:00.000Z',
        'corr-memory-shared',
        'corr-memory-shared-latest'
      ],
      source_kinds: ['controller_event', 'workspace_file'],
      latest_summary: 'Newer event updated the shared artifact anchor',
      latest_event_type: 'review_completed',
      latest_event_id: 'evt_memory_latest_artifact',
      replay_checkpoint: {
        event_id: 'evt_memory_latest_artifact',
        event_type: 'review_completed',
        summary: 'Newer event updated the shared artifact anchor',
        last_seen_at: '2026-03-09T18:08:00.000Z'
      },
      collector_last_modified_at: '2026-03-09T18:16:30.000Z'
    }
  ]);

  const collectorWindowedResponse = await requestJson(`${baseUrl}/memory/artifacts?agent_id=app-engineering&window=1m&limit=10`);
  assert.equal(collectorWindowedResponse.response.status, 200);
  assert.deepEqual(collectorWindowedResponse.body.items, []);
});

test('GET /memory/artifacts narrows evidence facets without leaking unrelated collector-only artifacts', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:20:00.000Z'
  });

  await store.appendEvent(
    createEvent({
      eventId: 'evt_memory_facet_match',
      ts: '2026-03-09T18:04:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_started',
      currentState: 'reviewing',
      activeTask: 'Review facet artifact coverage',
      summary: 'Facet event referenced the shared workspace artifact',
      severity: 'yellow',
      correlationId: 'corr-memory-facet',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/facet-shared.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_memory_facet_wrong_type',
      ts: '2026-03-09T18:05:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_completed',
      currentState: 'reviewing',
      activeTask: 'Finish facet artifact coverage',
      summary: 'Completed review should not match the started facet',
      severity: 'yellow',
      correlationId: 'corr-memory-facet',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/facet-completed.md']
    })
  );

  await store.appendCollectorReport({
    collected_at: '2026-03-09T18:18:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 1,
      heartbeat_count: 1,
      tmux_observed_count: 0,
      workspace_observed_count: 2,
      reboot_recommended_count: 0
    },
    items: [
      {
        agent_id: 'app-engineering',
        workspace_root: '/tmp/app-engineering',
        session_ref: '5-web3-app-engineering',
        evidence_refs: ['/tmp/facet-collector-only.md'],
        workspace_observations: [
          {
            path: '/tmp/facet-shared.md',
            file_name: 'facet-shared.md',
            kind: 'workspace_file',
            last_modified_at: '2026-03-09T18:16:30.000Z'
          },
          {
            path: '/tmp/facet-collector-only.md',
            file_name: 'facet-collector-only.md',
            kind: 'workspace_file',
            last_modified_at: '2026-03-09T18:17:00.000Z'
          }
        ],
        tmux_observations: [],
        supervision: {
          watch_target: 'growth-revenue',
          watched_by: ['protocol-engineering', 'team-lead'],
          needs_attention: false
        },
        heartbeat: {
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          received_at: '2026-03-09T18:18:00.000Z',
          current_state: 'reviewing',
          active_task: 'Review facet artifact coverage',
          current_location: 'desk-app-engineering',
          last_meaningful_output_at: '2026-03-09T18:16:00.000Z',
          last_file_write_at: '2026-03-09T18:17:00.000Z',
          current_blocker: '',
          confidence_level: 'high',
          reboot_recommended: false,
          evidence_refs: ['/tmp/facet-collector-only.md']
        }
      }
    ]
  });

  const response = await requestJson(
    `${baseUrl}/memory/artifacts?agent_id=app-engineering&event_type=review_started&severity=yellow&artifact_kind=workspace_file&window=20m&limit=10`
  );

  assert.equal(response.response.status, 200);
  assert.deepEqual(response.body.items, [
    {
      artifact_ref: '/tmp/facet-shared.md',
      artifact_kind: 'workspace_file',
      file_name: 'facet-shared.md',
      first_seen_at: '2026-03-09T18:04:00.000Z',
      last_seen_at: '2026-03-09T18:16:30.000Z',
      mention_count: 2,
      agent_ids: ['app-engineering', 'protocol-engineering', 'team-lead'],
      correlation_ids: ['collector-snapshot:2026-03-09T18:18:00.000Z', 'corr-memory-facet'],
      source_kinds: ['controller_event', 'workspace_file'],
      latest_summary: 'Facet event referenced the shared workspace artifact',
      latest_event_type: 'review_started',
      latest_event_id: 'evt_memory_facet_match',
      replay_checkpoint: {
        event_id: 'evt_memory_facet_match',
        event_type: 'review_started',
        summary: 'Facet event referenced the shared workspace artifact',
        last_seen_at: '2026-03-09T18:04:00.000Z'
      },
      collector_last_modified_at: '2026-03-09T18:16:30.000Z'
    }
  ]);
});

test('GET /memory/artifacts filters source_kind by exact provenance membership before limit', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:20:00.000Z'
  });

  await store.appendEvent(
    createEvent({
      eventId: 'evt_memory_source_kind_shared_controller',
      ts: '2026-03-09T18:04:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_started',
      currentState: 'reviewing',
      activeTask: 'Review source kind parity',
      summary: 'Controller event referenced the shared artifact',
      severity: 'yellow',
      correlationId: 'corr-memory-source-kind',
      evidenceRefs: ['/tmp/source-kind-shared.md'],
      sourceKind: 'controller_event'
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_memory_source_kind_workspace_only',
      ts: '2026-03-09T18:06:00.000Z',
      agentId: 'app-engineering',
      actorId: 'app-engineering',
      eventType: 'agent_wrote_file',
      currentState: 'coding',
      activeTask: 'Write source kind parity notes',
      summary: 'Workspace event referenced a workspace-only artifact',
      severity: 'yellow',
      correlationId: 'corr-memory-source-kind',
      evidenceRefs: ['/tmp/source-kind-workspace-only.md'],
      sourceKind: 'workspace_file'
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_memory_source_kind_shared_workspace',
      ts: '2026-03-09T18:07:00.000Z',
      agentId: 'app-engineering',
      actorId: 'app-engineering',
      eventType: 'agent_wrote_file',
      currentState: 'coding',
      activeTask: 'Update source kind parity notes',
      summary: 'Workspace event updated the shared artifact',
      severity: 'yellow',
      correlationId: 'corr-memory-source-kind',
      evidenceRefs: ['/tmp/source-kind-shared.md'],
      sourceKind: 'workspace_file'
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_memory_source_kind_controller_newer',
      ts: '2026-03-09T18:09:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_started',
      currentState: 'reviewing',
      activeTask: 'Review newer controller-only artifact',
      summary: 'Newer controller event should not satisfy workspace_file',
      severity: 'yellow',
      correlationId: 'corr-memory-source-kind',
      evidenceRefs: ['/tmp/source-kind-controller-only.md'],
      sourceKind: 'controller_event'
    })
  );

  const workspaceLimited = await requestJson(
    `${baseUrl}/memory/artifacts?agent_id=app-engineering&correlation_id=corr-memory-source-kind&source_kind=workspace_file&limit=1`
  );
  assert.equal(workspaceLimited.response.status, 200);
  assert.deepEqual(workspaceLimited.body.items.map((item) => item.artifact_ref), [
    '/tmp/source-kind-shared.md'
  ]);
  assert.deepEqual(workspaceLimited.body.items[0].source_kinds, ['controller_event', 'workspace_file']);

  const controllerResponse = await requestJson(
    `${baseUrl}/memory/artifacts?agent_id=app-engineering&correlation_id=corr-memory-source-kind&source_kind=controller_event&limit=10`
  );
  assert.equal(controllerResponse.response.status, 200);
  assert.deepEqual(controllerResponse.body.items.map((item) => item.artifact_ref), [
    '/tmp/source-kind-controller-only.md',
    '/tmp/source-kind-shared.md'
  ]);

  const artifactRefMismatch = await requestJson(
    `${baseUrl}/memory/artifacts?agent_id=app-engineering&correlation_id=corr-memory-source-kind&artifact_ref=${encodeURIComponent('/tmp/source-kind-controller-only.md')}&source_kind=workspace_file&limit=10`
  );
  assert.equal(artifactRefMismatch.response.status, 200);
  assert.deepEqual(artifactRefMismatch.body.items, []);

  const unknownSourceKind = await requestJson(
    `${baseUrl}/memory/artifacts?agent_id=app-engineering&correlation_id=corr-memory-source-kind&source_kind=missing_source_kind&limit=10`
  );
  assert.equal(unknownSourceKind.response.status, 200);
  assert.deepEqual(unknownSourceKind.body.items, []);

  const unfiltered = await requestJson(
    `${baseUrl}/memory/artifacts?agent_id=app-engineering&correlation_id=corr-memory-source-kind&limit=10`
  );
  const blankSourceKind = await requestJson(
    `${baseUrl}/memory/artifacts?agent_id=app-engineering&correlation_id=corr-memory-source-kind&source_kind=&limit=10`
  );
  assert.equal(blankSourceKind.response.status, 200);
  assert.deepEqual(blankSourceKind.body, unfiltered.body);
});

test('GET /memory/artifacts keeps collector-only observations canonical and agent-scoped when no derived activity event exists', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:20:00.000Z'
  });

  const appState = store.getAgent('app-engineering').current_state;
  const protocolState = store.getAgent('protocol-engineering').current_state;

  await store.appendCollectorReport({
    collected_at: '2026-03-09T18:18:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 2,
      heartbeat_count: 2,
      tmux_observed_count: 0,
      workspace_observed_count: 2,
      reboot_recommended_count: 0
    },
    items: [
      {
        agent_id: 'app-engineering',
        workspace_root: '/tmp/app-engineering',
        session_ref: '5-web3-app-engineering',
        evidence_refs: ['/tmp/shared.md'],
        workspace_observations: [
          {
            path: '/tmp/shared.md',
            file_name: 'shared.md',
            kind: 'workspace_file',
            last_modified_at: '2026-03-09T18:17:00.000Z'
          }
        ],
        tmux_observations: [],
        supervision: {
          watch_target: 'protocol-engineering',
          watched_by: [],
          needs_attention: false
        },
        heartbeat: {
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          received_at: '2026-03-09T18:18:00.000Z',
          current_state: appState,
          active_task: 'Inspect shared artifact',
          current_location: 'desk-app-engineering',
          last_meaningful_output_at: '2026-03-09T18:16:00.000Z',
          last_file_write_at: '',
          current_blocker: '',
          confidence_level: 'high',
          reboot_recommended: false,
          evidence_refs: ['/tmp/shared.md']
        }
      },
      {
        agent_id: 'protocol-engineering',
        workspace_root: '/tmp/protocol-engineering',
        session_ref: '5-web3-protocol-engineering',
        evidence_refs: ['/tmp/shared.md'],
        workspace_observations: [
          {
            path: '/tmp/shared.md',
            file_name: 'shared.md',
            kind: 'workspace_file',
            last_modified_at: '2026-03-09T18:17:30.000Z'
          }
        ],
        tmux_observations: [],
        supervision: {
          watch_target: 'app-engineering',
          watched_by: [],
          needs_attention: false
        },
        heartbeat: {
          agent_id: 'protocol-engineering',
          actor_id: 'team-lead',
          received_at: '2026-03-09T18:18:00.000Z',
          current_state: protocolState,
          active_task: 'Inspect shared artifact',
          current_location: 'desk-protocol-engineering',
          last_meaningful_output_at: '2026-03-09T18:16:00.000Z',
          last_file_write_at: '',
          current_blocker: '',
          confidence_level: 'high',
          reboot_recommended: false,
          evidence_refs: ['/tmp/shared.md']
        }
      }
    ]
  });

  const appResponse = await requestJson(`${baseUrl}/memory/artifacts?agent_id=app-engineering&window=20m&limit=10`);
  const protocolResponse = await requestJson(`${baseUrl}/memory/artifacts?agent_id=protocol-engineering&window=20m&limit=10`);
  assert.equal(appResponse.response.status, 200);
  assert.equal(protocolResponse.response.status, 200);
  assert.deepEqual(appResponse.body.items, [
    {
      artifact_ref: '/tmp/shared.md',
      artifact_kind: 'workspace_file',
      file_name: 'shared.md',
      first_seen_at: '2026-03-09T18:17:00.000Z',
      last_seen_at: '2026-03-09T18:17:00.000Z',
      mention_count: 1,
      agent_ids: ['app-engineering', 'team-lead'],
      correlation_ids: ['collector-snapshot:2026-03-09T18:18:00.000Z'],
      source_kinds: ['workspace_file'],
      latest_summary: null,
      latest_event_type: null,
      collector_last_modified_at: '2026-03-09T18:17:00.000Z'
    }
  ]);
  assert.deepEqual(protocolResponse.body.items, [
    {
      artifact_ref: '/tmp/shared.md',
      artifact_kind: 'workspace_file',
      file_name: 'shared.md',
      first_seen_at: '2026-03-09T18:17:30.000Z',
      last_seen_at: '2026-03-09T18:17:30.000Z',
      mention_count: 1,
      agent_ids: ['protocol-engineering', 'team-lead'],
      correlation_ids: ['collector-snapshot:2026-03-09T18:18:00.000Z'],
      source_kinds: ['workspace_file'],
      latest_summary: null,
      latest_event_type: null,
      collector_last_modified_at: '2026-03-09T18:17:30.000Z'
    }
  ]);
});

test('GET /memory/artifacts does not leak collector_last_modified_at from filtered-out collector observations onto event-backed artifacts', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:20:00.000Z'
  });

  await store.appendEvent(
    createEvent({
      eventId: 'evt_memory_event_only_for_app',
      ts: '2026-03-09T18:10:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_started',
      currentState: 'reviewing',
      activeTask: 'Review shared evidence',
      summary: 'Lead reviewed shared evidence with app engineering',
      severity: 'yellow',
      correlationId: 'corr-memory-filtered',
      evidenceRefs: ['/tmp/shared.md']
    })
  );

  const protocolState = store.getAgent('protocol-engineering').current_state;

  await store.appendCollectorReport({
    collected_at: '2026-03-09T18:18:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 1,
      heartbeat_count: 1,
      tmux_observed_count: 0,
      workspace_observed_count: 1,
      reboot_recommended_count: 0
    },
    items: [
      {
        agent_id: 'protocol-engineering',
        workspace_root: '/tmp/protocol-engineering',
        session_ref: '5-web3-protocol-engineering',
        evidence_refs: ['/tmp/shared.md'],
        workspace_observations: [
          {
            path: '/tmp/shared.md',
            file_name: 'shared.md',
            kind: 'workspace_file',
            last_modified_at: '2026-03-09T18:17:30.000Z'
          }
        ],
        tmux_observations: [],
        supervision: {
          watch_target: 'app-engineering',
          watched_by: [],
          needs_attention: false
        },
        heartbeat: {
          agent_id: 'protocol-engineering',
          actor_id: 'team-lead',
          received_at: '2026-03-09T18:18:00.000Z',
          current_state: protocolState,
          active_task: 'Inspect shared artifact',
          current_location: 'desk-protocol-engineering',
          last_meaningful_output_at: '2026-03-09T18:16:00.000Z',
          last_file_write_at: '',
          current_blocker: '',
          confidence_level: 'high',
          reboot_recommended: false,
          evidence_refs: ['/tmp/shared.md']
        }
      }
    ]
  });

  const response = await requestJson(
    `${baseUrl}/memory/artifacts?agent_id=app-engineering&correlation_id=corr-memory-filtered&window=20m&limit=10`
  );
  assert.equal(response.response.status, 200);
  assert.deepEqual(response.body.items, [
    {
      artifact_ref: '/tmp/shared.md',
      artifact_kind: 'evidence_ref',
      file_name: 'shared.md',
      first_seen_at: '2026-03-09T18:10:00.000Z',
      last_seen_at: '2026-03-09T18:10:00.000Z',
      mention_count: 1,
      agent_ids: ['app-engineering', 'team-lead'],
      correlation_ids: ['corr-memory-filtered'],
      source_kinds: ['controller_event'],
      latest_summary: 'Lead reviewed shared evidence with app engineering',
      latest_event_type: 'review_started',
      latest_event_id: 'evt_memory_event_only_for_app',
      replay_checkpoint: {
        event_id: 'evt_memory_event_only_for_app',
        event_type: 'review_started',
        summary: 'Lead reviewed shared evidence with app engineering',
        last_seen_at: '2026-03-09T18:10:00.000Z'
      },
      collector_last_modified_at: null
    }
  ]);
});

test('GET /memory/artifacts keeps stable tmux refs when later collector snapshots lose pane coordinates', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:20:00.000Z'
  });

  await store.appendCollectorReport({
    collected_at: '2026-03-09T18:18:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 1,
      heartbeat_count: 1,
      tmux_observed_count: 1,
      workspace_observed_count: 0,
      reboot_recommended_count: 0
    },
    items: [
      {
        agent_id: 'app-engineering',
        workspace_root: '/tmp/app-engineering',
        session_ref: '5-web3-app-engineering',
        evidence_refs: ['tmux://5-web3-app-engineering/0.1'],
        workspace_observations: [],
        tmux_observations: [
          {
            session_name: '5-web3-app-engineering',
            window_index: '0',
            pane_index: '1',
            pane_id: '%11',
            pane_title: 'Implement HTTP handlers',
            pane_current_command: 'nvim',
            pane_active: true,
            pane_dead: false,
            pane_activity_at: '2026-03-09T18:18:30.000Z'
          }
        ],
        supervision: {
          watch_target: 'growth-revenue',
          watched_by: ['team-lead'],
          needs_attention: false
        },
        heartbeat: {
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          received_at: '2026-03-09T18:18:00.000Z',
          current_state: 'coding',
          active_task: 'Implement HTTP handlers',
          current_location: 'desk-app-engineering',
          last_meaningful_output_at: '2026-03-09T18:16:00.000Z',
          last_file_write_at: '',
          current_blocker: '',
          confidence_level: 'high',
          reboot_recommended: false,
          evidence_refs: ['tmux://5-web3-app-engineering/0.1']
        }
      }
    ]
  });

  await store.appendCollectorReport({
    collected_at: '2026-03-09T18:19:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 1,
      heartbeat_count: 1,
      tmux_observed_count: 1,
      workspace_observed_count: 0,
      reboot_recommended_count: 0
    },
    items: [
      {
        agent_id: 'app-engineering',
        workspace_root: '/tmp/app-engineering',
        session_ref: '5-web3-app-engineering',
        evidence_refs: ['tmux://5-web3-app-engineering/0.1'],
        workspace_observations: [],
        tmux_observations: [
          {
            session_name: '5-web3-app-engineering',
            window_index: 'null',
            pane_index: 'null',
            pane_id: '%11',
            pane_title: 'Implement HTTP handlers',
            pane_current_command: 'nvim',
            pane_active: true,
            pane_dead: false,
            pane_activity_at: '2026-03-09T18:19:30.000Z'
          }
        ],
        supervision: {
          watch_target: 'growth-revenue',
          watched_by: ['team-lead'],
          needs_attention: false
        },
        heartbeat: {
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          received_at: '2026-03-09T18:19:00.000Z',
          current_state: 'reviewing',
          active_task: 'Review HTTP handlers',
          current_location: 'desk-app-engineering',
          last_meaningful_output_at: '2026-03-09T18:19:00.000Z',
          last_file_write_at: '',
          current_blocker: '',
          confidence_level: 'high',
          reboot_recommended: false,
          evidence_refs: ['tmux://5-web3-app-engineering/0.1']
        }
      }
    ]
  });

  const response = await requestJson(`${baseUrl}/memory/artifacts?agent_id=app-engineering&window=20m&limit=10`);
  assert.equal(response.response.status, 200);
  assert.deepEqual(response.body.items, [
    {
      artifact_ref: 'tmux://5-web3-app-engineering/0.1',
      artifact_kind: 'tmux_observation',
      file_name: 'Implement HTTP handlers',
      first_seen_at: '2026-03-09T18:18:00.000Z',
      last_seen_at: '2026-03-09T18:19:30.000Z',
      mention_count: 3,
      agent_ids: ['app-engineering', 'team-lead'],
      correlation_ids: [
        'collector-snapshot:2026-03-09T18:18:00.000Z',
        'collector-snapshot:2026-03-09T18:19:00.000Z'
      ],
      source_kinds: ['tmux_observation'],
      latest_summary: 'Collector observed state change coding -> reviewing',
      latest_event_type: 'agent_state_changed',
      latest_event_id: 'evt_collector_app-engineering_state_change_observed_normal_2026-03-09T18_19_00_000Z',
      replay_checkpoint: {
        event_id: 'evt_collector_app-engineering_state_change_observed_normal_2026-03-09T18_19_00_000Z',
        event_type: 'agent_state_changed',
        summary: 'Collector observed state change coding -> reviewing',
        last_seen_at: '2026-03-09T18:19:00.000Z'
      },
      collector_last_modified_at: '2026-03-09T18:19:30.000Z'
    }
  ]);
});

test('GET /memory/artifacts exposes multiple tmux panes as distinct artifacts', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:20:00.000Z'
  });

  await store.appendCollectorReport({
    collected_at: '2026-03-09T18:18:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 1,
      heartbeat_count: 1,
      tmux_observed_count: 1,
      workspace_observed_count: 0,
      reboot_recommended_count: 0
    },
    items: [
      {
        agent_id: 'app-engineering',
        workspace_root: '/tmp/app-engineering',
        session_ref: '5-web3-app-engineering',
        evidence_refs: ['tmux://5-web3-app-engineering/0.1', 'tmux://5-web3-app-engineering/0.2'],
        workspace_observations: [],
        tmux_observations: [
          {
            session_name: '5-web3-app-engineering',
            window_index: '0',
            pane_index: '1',
            pane_id: '%11',
            pane_title: 'Pane One',
            pane_current_command: 'nvim',
            pane_active: true,
            pane_dead: false,
            pane_activity_at: '2026-03-09T18:18:30.000Z'
          },
          {
            session_name: '5-web3-app-engineering',
            window_index: '0',
            pane_index: '2',
            pane_id: '%12',
            pane_title: 'Pane Two',
            pane_current_command: 'bash',
            pane_active: false,
            pane_dead: false,
            pane_activity_at: '2026-03-09T18:17:30.000Z'
          }
        ],
        supervision: {
          watch_target: 'growth-revenue',
          watched_by: ['team-lead'],
          needs_attention: false
        },
        heartbeat: {
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          received_at: '2026-03-09T18:18:00.000Z',
          current_state: 'coding',
          active_task: 'Inspect multiple panes',
          current_location: 'desk-app-engineering',
          last_meaningful_output_at: '2026-03-09T18:18:30.000Z',
          last_file_write_at: '',
          current_blocker: '',
          confidence_level: 'high',
          reboot_recommended: false,
          evidence_refs: ['tmux://5-web3-app-engineering/0.1', 'tmux://5-web3-app-engineering/0.2']
        }
      }
    ]
  });

  const response = await requestJson(`${baseUrl}/memory/artifacts?agent_id=app-engineering&window=20m&limit=10`);
  assert.equal(response.response.status, 200);
  assert.deepEqual(response.body.items.slice(0, 2), [
    {
      artifact_ref: 'tmux://5-web3-app-engineering/0.1',
      artifact_kind: 'tmux_observation',
      file_name: 'Pane One',
      first_seen_at: '2026-03-09T18:18:00.000Z',
      last_seen_at: '2026-03-09T18:18:30.000Z',
      mention_count: 2,
      agent_ids: ['app-engineering', 'team-lead'],
      correlation_ids: ['collector-snapshot:2026-03-09T18:18:00.000Z'],
      source_kinds: ['tmux_observation'],
      latest_summary: 'Collector observed state change idle -> coding',
      latest_event_type: 'agent_state_changed',
      latest_event_id: 'evt_collector_app-engineering_state_change_observed_normal_2026-03-09T18_18_00_000Z',
      replay_checkpoint: {
        event_id: 'evt_collector_app-engineering_state_change_observed_normal_2026-03-09T18_18_00_000Z',
        event_type: 'agent_state_changed',
        summary: 'Collector observed state change idle -> coding',
        last_seen_at: '2026-03-09T18:18:00.000Z'
      },
      collector_last_modified_at: '2026-03-09T18:18:30.000Z'
    },
    {
      artifact_ref: 'tmux://5-web3-app-engineering/0.2',
      artifact_kind: 'tmux_observation',
      file_name: 'Pane Two',
      first_seen_at: '2026-03-09T18:17:30.000Z',
      last_seen_at: '2026-03-09T18:17:30.000Z',
      mention_count: 1,
      agent_ids: ['app-engineering', 'team-lead'],
      correlation_ids: ['collector-snapshot:2026-03-09T18:18:00.000Z'],
      source_kinds: ['tmux_observation'],
      latest_summary: null,
      latest_event_type: null,
      collector_last_modified_at: '2026-03-09T18:17:30.000Z'
    }
  ]);
});


test('GET /memory/artifacts binds collector state-change evidence to the active tmux pane instead of the first ref', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:20:00.000Z'
  });

  await store.appendCollectorReport({
    collected_at: '2026-03-09T18:18:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 1,
      heartbeat_count: 1,
      tmux_observed_count: 1,
      workspace_observed_count: 0,
      reboot_recommended_count: 0
    },
    items: [
      {
        agent_id: 'app-engineering',
        workspace_root: '/tmp/app-engineering',
        session_ref: '5-web3-app-engineering',
        evidence_refs: ['tmux://5-web3-app-engineering/0.1', 'tmux://5-web3-app-engineering/0.2'],
        workspace_observations: [],
        tmux_observations: [
          {
            session_name: '5-web3-app-engineering',
            window_index: '0',
            pane_index: '1',
            pane_id: '%11',
            pane_title: 'Pane One',
            pane_current_command: 'bash',
            pane_active: false,
            pane_dead: false,
            pane_activity_at: '2026-03-09T18:17:30.000Z'
          },
          {
            session_name: '5-web3-app-engineering',
            window_index: '0',
            pane_index: '2',
            pane_id: '%12',
            pane_title: 'Pane Two',
            pane_current_command: 'nvim',
            pane_active: true,
            pane_dead: false,
            pane_activity_at: '2026-03-09T18:18:30.000Z'
          }
        ],
        supervision: {
          watch_target: 'growth-revenue',
          watched_by: ['team-lead'],
          needs_attention: false
        },
        heartbeat: {
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          received_at: '2026-03-09T18:18:00.000Z',
          current_state: 'coding',
          active_task: 'Inspect multiple panes',
          current_location: 'desk-app-engineering',
          last_meaningful_output_at: '2026-03-09T18:18:30.000Z',
          last_file_write_at: '',
          current_blocker: '',
          confidence_level: 'high',
          reboot_recommended: false,
          evidence_refs: ['tmux://5-web3-app-engineering/0.1', 'tmux://5-web3-app-engineering/0.2']
        }
      }
    ]
  });

  const response = await requestJson(`${baseUrl}/memory/artifacts?agent_id=app-engineering&window=20m&limit=10`);
  assert.equal(response.response.status, 200);
  const activePane = response.body.items.find((item) => item.artifact_ref === 'tmux://5-web3-app-engineering/0.2');
  assert.deepEqual(activePane, {
    artifact_ref: 'tmux://5-web3-app-engineering/0.2',
    artifact_kind: 'tmux_observation',
    file_name: 'Pane Two',
    first_seen_at: '2026-03-09T18:18:00.000Z',
    last_seen_at: '2026-03-09T18:18:30.000Z',
    mention_count: 2,
    agent_ids: ['app-engineering', 'team-lead'],
    correlation_ids: ['collector-snapshot:2026-03-09T18:18:00.000Z'],
    source_kinds: ['tmux_observation'],
    latest_summary: 'Collector observed state change idle -> coding',
    latest_event_type: 'agent_state_changed',
    latest_event_id: 'evt_collector_app-engineering_state_change_observed_normal_2026-03-09T18_18_00_000Z',
    replay_checkpoint: {
      event_id: 'evt_collector_app-engineering_state_change_observed_normal_2026-03-09T18_18_00_000Z',
      event_type: 'agent_state_changed',
      summary: 'Collector observed state change idle -> coding',
      last_seen_at: '2026-03-09T18:18:00.000Z'
    },
    collector_last_modified_at: '2026-03-09T18:18:30.000Z'
  });
});

test('GET /memory/artifacts ignores workspace_root collector observations', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:20:00.000Z'
  });

  const appState = store.getAgent('app-engineering').current_state;

  await store.appendCollectorReport({
    collected_at: '2026-03-09T18:18:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 1,
      heartbeat_count: 1,
      tmux_observed_count: 0,
      workspace_observed_count: 1,
      reboot_recommended_count: 0
    },
    items: [
      {
        agent_id: 'app-engineering',
        workspace_root: '/tmp/app-engineering',
        session_ref: '5-web3-app-engineering',
        evidence_refs: [],
        workspace_observations: [
          {
            path: '/tmp/app-engineering',
            file_name: 'app-engineering',
            kind: 'workspace_root',
            last_modified_at: '2026-03-09T18:17:00.000Z'
          }
        ],
        tmux_observations: [],
        supervision: {
          watch_target: 'growth-revenue',
          watched_by: ['team-lead'],
          needs_attention: false
        },
        heartbeat: {
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          received_at: '2026-03-09T18:18:00.000Z',
          current_state: appState,
          active_task: 'Inspect workspace root',
          current_location: 'desk-app-engineering',
          last_meaningful_output_at: '2026-03-09T18:16:00.000Z',
          last_file_write_at: '',
          current_blocker: '',
          confidence_level: 'high',
          reboot_recommended: false,
          evidence_refs: []
        }
      }
    ]
  });

  const response = await requestJson(`${baseUrl}/memory/artifacts?agent_id=app-engineering&window=20m&limit=10`);
  assert.equal(response.response.status, 200);
  assert.deepEqual(response.body.items, []);
});

test('GET /correlations/:correlation_id aggregates incident, interaction, and replay evidence', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T18:20:00.000Z'
  });

  await store.appendEvent(
    createEvent({
      eventId: 'evt_corr_old',
      ts: '2026-03-09T17:50:00.000Z',
      agentId: 'app-engineering',
      eventType: 'agent_wrote_file',
      currentState: 'coding',
      activeTask: 'Old correlation artifact',
      summary: 'Outside the requested correlation window',
      correlationId: 'corr-drilldown',
      evidenceRefs: ['/tmp/corr-old.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_corr_review_started',
      ts: '2026-03-09T18:06:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_started',
      currentState: 'reviewing',
      activeTask: 'Review the drill-down evidence',
      location: 'review-zone',
      summary: 'Lead started the drill-down review',
      severity: 'yellow',
      correlationId: 'corr-drilldown',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/corr-review-start.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_corr_peer_watch_open',
      ts: '2026-03-09T18:07:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Fix the missing evidence trail',
      location: 'review-zone',
      summary: 'Protocol engineering flagged missing evidence',
      severity: 'orange',
      correlationId: 'corr-drilldown',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/corr-alert-open.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_corr_review_completed',
      ts: '2026-03-09T18:08:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_completed',
      currentState: 'reviewing',
      activeTask: 'Review the drill-down evidence',
      location: 'review-zone',
      summary: 'Lead completed the drill-down review',
      correlationId: 'corr-drilldown',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/corr-review-end.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_corr_handoff_started',
      ts: '2026-03-09T18:10:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Hand off evidence follow-up',
      summary: 'Lead started the evidence handoff',
      severity: 'yellow',
      correlationId: 'corr-drilldown',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/corr-handoff-start.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_corr_handoff_completed',
      ts: '2026-03-09T18:11:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_handoff_completed',
      currentState: 'planning',
      activeTask: 'Hand off evidence follow-up',
      summary: 'Lead completed the evidence handoff',
      correlationId: 'corr-drilldown',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/corr-handoff-complete.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_corr_reboot_requested',
      ts: '2026-03-09T18:12:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'agent_reboot_requested',
      currentState: 'rebooting',
      activeTask: 'Reset the evidence replay context',
      location: 'reboot-zone',
      summary: 'Lead requested a reboot after the evidence review',
      severity: 'red',
      correlationId: 'corr-drilldown',
      evidenceRefs: ['/tmp/corr-reboot.md']
    })
  );

  const response = await requestJson(
    `${baseUrl}/correlations/corr-drilldown?window=15m&limit=2`
  );
  assert.equal(response.response.status, 200);
  assert.deepEqual(response.body, {
    correlation_id: 'corr-drilldown',
    participant_agent_ids: [
      'app-engineering',
      'growth-revenue',
      'protocol-engineering',
      'team-lead'
    ],
    evidence_refs: [
      '/tmp/corr-alert-open.md',
      '/tmp/corr-handoff-complete.md',
      '/tmp/corr-handoff-start.md',
      '/tmp/corr-reboot.md',
      '/tmp/corr-review-end.md',
      '/tmp/corr-review-start.md'
    ],
    first_ts: '2026-03-09T18:06:00.000Z',
    last_ts: '2026-03-09T18:12:00.000Z',
    incident_count: 4,
    interaction_count: 3,
    event_count: 6,
    closure_ledger: {
      state: 'open',
      basis: 'filtered_correlation_slice',
      open_count: 2,
      active_count: 1,
      closed_count: 1,
      entry_count: 4,
      last_transition_ts: '2026-03-09T18:12:00.000Z',
      entries: [
        {
          entry_id: 'incident:evt_corr_reboot_requested',
          state: 'open',
          kind: 'reboot',
          status: 'requested',
          ts: '2026-03-09T18:12:00.000Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          summary: 'Lead requested a reboot after the evidence review',
          correlation_id: 'corr-drilldown',
          evidence_refs: ['/tmp/corr-reboot.md'],
          source_kind: 'controller_event',
          incident_id: 'evt_corr_reboot_requested'
        },
        {
          entry_id: 'incident:evt_corr_handoff_completed',
          state: 'closed',
          kind: 'handoff',
          status: 'completed',
          ts: '2026-03-09T18:11:00.000Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          summary: 'Lead completed the evidence handoff',
          correlation_id: 'corr-drilldown',
          evidence_refs: ['/tmp/corr-handoff-complete.md'],
          source_kind: 'controller_event',
          incident_id: 'evt_corr_handoff_completed'
        }
      ]
    },
    incidents: [
      {
        incident_id: 'evt_corr_reboot_requested',
        kind: 'reboot',
        ts: '2026-03-09T18:12:00.000Z',
        agent_id: 'app-engineering',
        actor_id: 'team-lead',
        status: 'requested',
        severity: 'red',
        summary: 'Lead requested a reboot after the evidence review',
        correlation_id: 'corr-drilldown',
        evidence_refs: ['/tmp/corr-reboot.md'],
        counterparty_agent_ids: [],
        source_kind: 'controller_event'
      },
      {
        incident_id: 'evt_corr_handoff_completed',
        kind: 'handoff',
        ts: '2026-03-09T18:11:00.000Z',
        agent_id: 'app-engineering',
        actor_id: 'team-lead',
        status: 'completed',
        severity: 'normal',
        summary: 'Lead completed the evidence handoff',
        correlation_id: 'corr-drilldown',
        evidence_refs: ['/tmp/corr-handoff-complete.md'],
        counterparty_agent_ids: ['growth-revenue'],
        source_kind: 'controller_event'
      }
    ],
    interactions: [
      {
        interaction_id: 'interaction:evt_corr_handoff_started',
        interaction_type: 'handoff',
        correlation_id: 'corr-drilldown',
        started_at: '2026-03-09T18:10:00.000Z',
        ended_at: '2026-03-09T18:11:00.000Z',
        participant_agent_ids: ['app-engineering', 'growth-revenue', 'team-lead'],
        trigger_event_id: 'evt_corr_handoff_started',
        before_state: 'planning',
        after_state: 'planning',
        severity: 'yellow',
        evidence_refs: ['/tmp/corr-handoff-start.md', '/tmp/corr-handoff-complete.md'],
        source_kind: 'controller_event',
        summary: 'Lead completed the evidence handoff',
        related_event_ids: ['evt_corr_handoff_started', 'evt_corr_handoff_completed']
      },
      {
        interaction_id: 'interaction:evt_corr_review_started',
        interaction_type: 'review',
        correlation_id: 'corr-drilldown',
        started_at: '2026-03-09T18:06:00.000Z',
        ended_at: '2026-03-09T18:08:00.000Z',
        participant_agent_ids: ['app-engineering', 'protocol-engineering', 'team-lead'],
        trigger_event_id: 'evt_corr_review_started',
        before_state: 'reviewing',
        after_state: 'reviewing',
        severity: 'yellow',
        evidence_refs: ['/tmp/corr-review-start.md', '/tmp/corr-review-end.md'],
        source_kind: 'controller_event',
        summary: 'Lead completed the drill-down review',
        related_event_ids: ['evt_corr_review_started', 'evt_corr_review_completed']
      }
    ],
    timeline: [
      {
        event_id: 'evt_corr_handoff_completed',
        ts: '2026-03-09T18:11:00.000Z',
        agent_id: 'app-engineering',
        actor_id: 'team-lead',
        event_type: 'agent_handoff_completed',
        severity: 'normal',
        current_state: 'planning',
        location: 'meeting-zone',
        summary: 'Lead completed the evidence handoff',
        correlation_id: 'corr-drilldown',
        counterparty_agent_ids: ['growth-revenue'],
        evidence_refs: ['/tmp/corr-handoff-complete.md'],
        source_kind: 'controller_event'
      },
      {
        event_id: 'evt_corr_reboot_requested',
        ts: '2026-03-09T18:12:00.000Z',
        agent_id: 'app-engineering',
        actor_id: 'team-lead',
        event_type: 'agent_reboot_requested',
        severity: 'red',
        current_state: 'rebooting',
        location: 'reboot-zone',
        summary: 'Lead requested a reboot after the evidence review',
        correlation_id: 'corr-drilldown',
        counterparty_agent_ids: [],
        evidence_refs: ['/tmp/corr-reboot.md'],
        source_kind: 'controller_event'
      }
    ]
  });

  const missing = await requestJson(`${baseUrl}/correlations/missing-correlation`);
  assert.equal(missing.response.status, 404);
  assert.equal(missing.body.error, 'not_found');
});



test('GET /correlations/:correlation_id keeps full interaction counts when slices are limited or omitted', async (t) => {
  const { baseUrl, store } = await createHarness(t, {
    now: () => '2026-03-09T19:30:00.000Z'
  });
  const baseTs = Date.parse('2026-03-09T18:00:00.000Z');

  for (let index = 0; index < 55; index += 1) {
    const startedAt = new Date(baseTs + index * 60_000).toISOString();
    const completedAt = new Date(baseTs + index * 60_000 + 5_000).toISOString();

    await store.appendEvent(
      createEvent({
        eventId: `evt_corr_many_review_started_${index}`,
        ts: startedAt,
        agentId: 'app-engineering',
        actorId: 'team-lead',
        eventType: 'review_started',
        currentState: 'reviewing',
        activeTask: `Review correlation batch ${index}`,
        location: 'review-zone',
        summary: `Lead started review batch ${index}`,
        severity: 'yellow',
        correlationId: 'corr-many',
        counterpartyAgentIds: ['protocol-engineering'],
        evidenceRefs: [`/tmp/corr-many-review-start-${index}.md`]
      })
    );

    await store.appendEvent(
      createEvent({
        eventId: `evt_corr_many_review_completed_${index}`,
        ts: completedAt,
        agentId: 'app-engineering',
        actorId: 'team-lead',
        eventType: 'review_completed',
        currentState: 'reviewing',
        activeTask: `Review correlation batch ${index}`,
        location: 'review-zone',
        summary: `Lead completed review batch ${index}`,
        severity: 'yellow',
        correlationId: 'corr-many',
        counterpartyAgentIds: ['protocol-engineering'],
        evidenceRefs: [`/tmp/corr-many-review-complete-${index}.md`]
      })
    );
  }

  const unlimited = await requestJson(`${baseUrl}/correlations/corr-many`);
  assert.equal(unlimited.response.status, 200);
  assert.equal(unlimited.body.interaction_count, 55);
  assert.equal(unlimited.body.interactions.length, 55);

  const limited = await requestJson(`${baseUrl}/correlations/corr-many?limit=10`);
  assert.equal(limited.response.status, 200);
  assert.equal(limited.body.interaction_count, 55);
  assert.equal(limited.body.interactions.length, 10);
});

test('write endpoints reject missing headers, invalid payloads, and actor-boundary violations', async (t) => {
  const { baseUrl } = await createHarness(t);

  const missingActor = await requestJson(`${baseUrl}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({})
  });

  assert.equal(missingActor.response.status, 400);
  assert.match(missingActor.body.error, /missing_actor_id/);

  const forbidden = await requestJson(`${baseUrl}/events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'market-intel'
    },
    body: JSON.stringify({
      event_id: 'evt_bad_actor',
      ts: '2026-03-09T18:04:30.000Z',
      agent_id: 'product-pmf',
      agent_role: 'product-pmf',
      event_type: 'agent_wrote_file',
      current_state: 'coding',
      active_task: 'Write code',
      summary: 'Market intel should not emit product events',
      severity: 'normal',
      correlation_id: 'phase1-backend',
      counterparty_agent_ids: [],
      evidence_refs: [],
      source_kind: 'workspace_file',
      metadata: {}
    })
  });

  assert.equal(forbidden.response.status, 422);
  assert.match(forbidden.body.error, /validation_failed/);

  const invalidHeartbeat = await requestJson(`${baseUrl}/heartbeats`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'app-engineering'
    },
    body: JSON.stringify({
      agent_id: 'app-engineering',
      current_state: 'flying',
      active_task: 'Impossible state',
      last_meaningful_output_at: '2026-03-09T18:04:00.000Z',
      last_file_write_at: '2026-03-09T18:04:00.000Z',
      current_blocker: '',
      confidence_level: 'high',
      reboot_recommended: false
    })
  });

  assert.equal(invalidHeartbeat.response.status, 422);
  assert.match(invalidHeartbeat.body.error, /validation_failed/);
});

test('POST /events allows team-lead task dispatch without advancing meaningful-output freshness', async (t) => {
  const { baseUrl } = await createHarness(t);

  const baselineHeartbeat = await requestJson(`${baseUrl}/heartbeats`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'app-engineering'
    },
    body: JSON.stringify({
      agent_id: 'app-engineering',
      current_state: 'coding',
      active_task: 'Maintain websocket reconnection path',
      last_meaningful_output_at: '2026-03-09T17:45:00.000Z',
      last_file_write_at: '2026-03-09T17:45:00.000Z',
      current_blocker: '',
      confidence_level: 'high',
      reboot_recommended: false
    })
  });
  assert.equal(baselineHeartbeat.response.status, 201);

  const dispatch = await requestJson(`${baseUrl}/events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'team-lead'
    },
    body: JSON.stringify({
      event_id: 'evt_dispatch_task',
      ts: '2026-03-09T18:04:30.000Z',
      agent_id: 'app-engineering',
      agent_role: 'app-engineering',
      event_type: 'agent_received_task',
      current_state: 'planning',
      active_task: 'Investigate controller queue drift',
      summary: 'Controller dispatched a new cross-agent task',
      severity: 'normal',
      correlation_id: 'corr-task-dispatch',
      counterparty_agent_ids: ['team-lead'],
      evidence_refs: [],
      source_kind: 'controller_event',
      metadata: {}
    })
  });

  assert.equal(dispatch.response.status, 201);
  assert.equal(dispatch.body.item.actor_id, 'team-lead');
  assert.equal(dispatch.body.item.event_type, 'agent_received_task');

  const agent = await requestJson(`${baseUrl}/agents/app-engineering`);
  assert.equal(agent.response.status, 200);
  assert.equal(agent.body.item.active_task, 'Investigate controller queue drift');
  assert.equal(agent.body.item.current_state, 'planning');
  assert.equal(agent.body.item.last_meaningful_output_at, '2026-03-09T17:45:00.000Z');
  assert.equal(agent.body.item.recent_events[0].event_id, 'evt_dispatch_task');
  assert.equal(agent.body.item.recent_events[0].actor_id, 'team-lead');

  const overview = await requestJson(`${baseUrl}/office/overview`);
  assert.equal(overview.response.status, 200);

  const appEngineering = overview.body.agents.find((item) => item.agent_id === 'app-engineering');
  assert.equal(appEngineering.active_task, 'Investigate controller queue drift');
  assert.equal(appEngineering.last_meaningful_output_at, '2026-03-09T17:45:00.000Z');
  assert.equal(appEngineering.derived_staleness.severity, 'yellow');
  assert.equal(appEngineering.effective_severity, 'yellow');
});

test('GET /office/overview derives yellow and orange staleness without fabricating red', async (t) => {
  const { baseUrl } = await createHarness(t);

  const marketIntelHeartbeat = await requestJson(`${baseUrl}/heartbeats`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'market-intel'
    },
    body: JSON.stringify({
      agent_id: 'market-intel',
      current_state: 'researching',
      active_task: 'Scan competitors',
      last_meaningful_output_at: '2026-03-09T17:45:00.000Z',
      last_file_write_at: '2026-03-09T17:45:00.000Z',
      current_blocker: '',
      confidence_level: 'medium',
      reboot_recommended: false
    })
  });
  assert.equal(marketIntelHeartbeat.response.status, 201);

  const productHeartbeat = await requestJson(`${baseUrl}/heartbeats`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'product-pmf'
    },
    body: JSON.stringify({
      agent_id: 'product-pmf',
      current_state: 'planning',
      active_task: 'Draft PMF memo',
      last_meaningful_output_at: '2026-03-09T17:35:00.000Z',
      last_file_write_at: '2026-03-09T17:35:00.000Z',
      current_blocker: '',
      confidence_level: 'medium',
      reboot_recommended: false
    })
  });
  assert.equal(productHeartbeat.response.status, 201);

  const rebootHeartbeat = await requestJson(`${baseUrl}/heartbeats`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'growth-revenue'
    },
    body: JSON.stringify({
      agent_id: 'growth-revenue',
      current_state: 'coding',
      active_task: 'Repair outbound funnel notes',
      last_meaningful_output_at: '2026-03-09T18:04:00.000Z',
      last_file_write_at: '2026-03-09T18:04:00.000Z',
      current_blocker: '',
      confidence_level: 'low',
      reboot_recommended: true
    })
  });
  assert.equal(rebootHeartbeat.response.status, 201);

  const redAlert = await requestJson(`${baseUrl}/events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-actor-id': 'team-lead'
    },
    body: JSON.stringify({
      event_id: 'evt_alert_red',
      ts: '2026-03-09T18:04:30.000Z',
      agent_id: 'app-engineering',
      agent_role: 'app-engineering',
      event_type: 'peer_watch_alert_raised',
      current_state: 'blocked',
      active_task: 'Stop broken handler rollout',
      summary: 'Peer watch found a severe regression',
      severity: 'red',
      correlation_id: 'phase1-overview',
      counterparty_agent_ids: ['protocol-engineering'],
      evidence_refs: ['/tmp/server.js'],
      source_kind: 'controller_event',
      metadata: {}
    })
  });
  assert.equal(redAlert.response.status, 201);

  const overview = await requestJson(`${baseUrl}/office/overview`);
  assert.equal(overview.response.status, 200);
  assert.equal(overview.body.summary.blocked_count, 1);
  assert.equal(overview.body.summary.reboot_recommended_count, 1);
  assert.deepEqual(overview.body.summary.severity_buckets, {
    normal: 3,
    yellow: 1,
    orange: 2,
    red: 1
  });

  const marketIntel = overview.body.agents.find((agent) => agent.agent_id === 'market-intel');
  assert.equal(marketIntel.reported_severity, 'normal');
  assert.equal(marketIntel.derived_staleness.severity, 'yellow');
  assert.equal(marketIntel.effective_severity, 'yellow');

  const productPmf = overview.body.agents.find((agent) => agent.agent_id === 'product-pmf');
  assert.equal(productPmf.reported_severity, 'normal');
  assert.equal(productPmf.derived_staleness.severity, 'orange');
  assert.equal(productPmf.effective_severity, 'orange');

  const growthRevenue = overview.body.agents.find((agent) => agent.agent_id === 'growth-revenue');
  assert.equal(growthRevenue.reported_severity, 'orange');
  assert.equal(growthRevenue.derived_staleness.severity, 'normal');
  assert.equal(growthRevenue.effective_severity, 'orange');

  const appEngineering = overview.body.agents.find((agent) => agent.agent_id === 'app-engineering');
  assert.equal(appEngineering.reported_severity, 'red');
  assert.equal(appEngineering.effective_severity, 'red');
  assert.equal(appEngineering.derived_staleness.severity, 'normal');
});

test('collector snapshot endpoints stay read-only on GET and require team-lead on POST', async (t) => {
  const controllerSnapshotCollector = {
    async collectSnapshot({ actorId, collectedAt }) {
      assert.equal(actorId, 'team-lead');
      assert.equal(collectedAt, '2026-03-09T18:05:00.000Z');

      return {
        collected_at: collectedAt,
        actor_id: actorId,
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
              received_at: collectedAt,
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
    }
  };

  const { baseUrl, storeFile } = await createHarness(t, { controllerSnapshotCollector });

  const initial = await requestJson(`${baseUrl}/collectors/controller-snapshot`);
  assert.equal(initial.response.status, 200);
  assert.equal(initial.body.item, null);

  const missingActor = await requestJson(`${baseUrl}/collectors/controller-snapshot`, {
    method: 'POST'
  });
  assert.equal(missingActor.response.status, 400);
  assert.equal(missingActor.body.error, 'missing_actor_id');

  const forbidden = await requestJson(`${baseUrl}/collectors/controller-snapshot`, {
    method: 'POST',
    headers: {
      'x-actor-id': 'app-engineering'
    }
  });
  assert.equal(forbidden.response.status, 403);
  assert.equal(forbidden.body.error, 'forbidden_actor');

  const collected = await requestJson(`${baseUrl}/collectors/controller-snapshot`, {
    method: 'POST',
    headers: {
      'x-actor-id': 'team-lead'
    }
  });
  assert.equal(collected.response.status, 201);
  assert.equal(collected.body.item.summary.heartbeat_count, 1);

  const latest = await requestJson(`${baseUrl}/collectors/controller-snapshot`);
  assert.equal(latest.response.status, 200);
  assert.equal(latest.body.item.collected_at, '2026-03-09T18:05:00.000Z');

  const appEngineering = await requestJson(`${baseUrl}/agents/app-engineering`);
  assert.equal(appEngineering.response.status, 200);
  assert.equal(appEngineering.body.item.current_state, 'coding');
  assert.equal(appEngineering.body.item.last_heartbeat_at, '2026-03-09T18:05:00.000Z');

  const overview = await requestJson(`${baseUrl}/office/overview`);
  assert.equal(overview.response.status, 200);
  const appEngineeringOverview = overview.body.agents.find((agent) => agent.agent_id === 'app-engineering');
  assert.equal(appEngineeringOverview.current_state, 'coding');

  const activityEvents = await requestJson(`${baseUrl}/events?agent_id=app-engineering&limit=5`);
  assert.equal(activityEvents.response.status, 200);
  assert.deepEqual(
    activityEvents.body.items.map((event) => event.event_type),
    ['agent_state_changed', 'agent_wrote_file']
  );

  const lines = (await readFile(storeFile, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 4);
  assert.equal(JSON.parse(lines[0]).kind, 'event');
  assert.equal(JSON.parse(lines[1]).kind, 'event');
  assert.equal(JSON.parse(lines[2]).kind, 'heartbeat');
  const snapshotRecord = JSON.parse(lines[3]);
  assert.equal(snapshotRecord.kind, 'collector_snapshot');
  assert.equal(snapshotRecord.payload.collected_at, '2026-03-09T18:05:00.000Z');
  assert.equal(snapshotRecord.payload.items[0].heartbeat.current_state, 'coding');
});

test('collector snapshot rejects invalid Hermes runtime file before append', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-hermes-runtime-'));
  const runtimeFile = path.join(root, 'runtime-facts.json');
  await writeFile(
    runtimeFile,
    JSON.stringify([
      {
        source_kind: 'hermes_profile',
        profile_id: 'app-profile',
        status: 'unknown'
      }
    ])
  );

  const controllerSnapshotCollector = createControllerSnapshotCollector({
    agents: [SEED_AGENTS.find((agent) => agent.agent_id === 'app-engineering')],
    readPathStat: async () => null,
    listTmuxPanes: async () => [],
    readHermesRuntimeSources: createHermesRuntimeSourcesFileReader({ filePath: runtimeFile })
  });
  const { baseUrl, storeFile } = await createHarness(t, { controllerSnapshotCollector });

  const collected = await requestJson(`${baseUrl}/collectors/controller-snapshot`, {
    method: 'POST',
    headers: {
      'x-actor-id': 'team-lead'
    }
  });

  assert.equal(collected.response.status, 500);
  assert.equal(collected.body.error, 'internal_error');
  await assert.rejects(() => readFile(storeFile, 'utf8'), { code: 'ENOENT' });
});

test('GET /collectors/controller-snapshot/evidence-coverage projects latest coverage read-only with filters', async (t) => {
  const selectedAgents = ['app-engineering', 'protocol-engineering', 'growth-revenue'].map((agentId) =>
    SEED_AGENTS.find((agent) => agent.agent_id === agentId)
  );
  const appAgent = selectedAgents[0];
  const protocolAgent = selectedAgents[1];
  const appTodoRef = path.join(appAgent.workspace_root, 'todo.md');
  const statsByPath = new Map([
    [appTodoRef, { mtime: '2026-03-09T18:04:00.000Z' }],
    [protocolAgent.workspace_root, { mtime: '2026-03-09T18:03:00.000Z' }]
  ]);
  let collectCount = 0;

  const controllerSnapshotCollector = {
    async collectSnapshot({ actorId, collectedAt }) {
      collectCount += 1;

      return collectControllerSnapshot({
        actorId,
        collectedAt,
        agents: selectedAgents,
        readPathStat: async (targetPath) => statsByPath.get(targetPath) || null,
        listTmuxPanes: async () => [
          {
            session_name: appAgent.session_ref,
            window_index: '0',
            pane_index: '1',
            pane_id: '%11',
            pane_title: 'Implement evidence coverage API',
            pane_current_command: 'nvim',
            pane_active: true,
            pane_dead: false,
            pane_activity_at: '2026-03-09T18:04:30.000Z'
          }
        ]
      });
    }
  };

  const { baseUrl, store } = await createHarness(t, { controllerSnapshotCollector });

  const missing = await requestJson(`${baseUrl}/collectors/controller-snapshot/evidence-coverage`);
  assert.equal(missing.response.status, 200);
  assert.deepEqual(missing.body, { item: null });
  assert.equal(collectCount, 0);

  const collected = await requestJson(`${baseUrl}/collectors/controller-snapshot`, {
    method: 'POST',
    headers: {
      'x-actor-id': 'team-lead'
    }
  });
  assert.equal(collected.response.status, 201);
  assert.equal(collectCount, 1);
  const collectedApp = collected.body.item.items.find((item) => item.agent_id === 'app-engineering');
  assert.equal(collectedApp.source_health.tmux_session.expected_session_ref, appAgent.session_ref);
  assert.equal(collectedApp.source_health.tmux_session.status, 'observed');
  assert.equal(collectedApp.source_health.workspace_files.missing_count, 2);
  const collectedGrowth = collected.body.item.items.find((item) => item.agent_id === 'growth-revenue');
  assert.equal(collectedGrowth.source_health.tmux_session.status, 'missing');
  assert.deepEqual(collected.body.item.runtime_source_evidence, {
    unmapped_tmux_sessions: []
  });

  const latestBeforeRead = store.getLatestCollectorReport();
  const coverage = await requestJson(`${baseUrl}/collectors/controller-snapshot/evidence-coverage`);
  assert.equal(coverage.response.status, 200);
  assert.deepEqual(coverage.body.item, {
    collected_at: '2026-03-09T18:05:00.000Z',
    actor_id: 'team-lead',
    ...collected.body.item.evidence_coverage
  });
  assert.equal(Object.hasOwn(coverage.body.item, 'items'), false);
  assert.equal(collectCount, 1);
  assert.equal(store.getLatestCollectorReport(), latestBeforeRead);

  const appOnly = await requestJson(
    `${baseUrl}/collectors/controller-snapshot/evidence-coverage?agent_id=app-engineering`
  );
  assert.deepEqual(appOnly.body.item.agent_items.map((item) => item.agent_id), ['app-engineering']);
  assert.equal(appOnly.body.item.evidence_ref_count, 2);
  assert.equal(appOnly.body.item.covered_agent_count, 1);
  assert.deepEqual(appOnly.body.item.source_kind_buckets, {
    workspace_file: 1,
    workspace_root: 0,
    tmux_observation: 1
  });
  assert.deepEqual(appOnly.body.item.low_confidence_agent_ids, []);

  const workspaceFile = await requestJson(
    `${baseUrl}/collectors/controller-snapshot/evidence-coverage?source_kind=workspace_file`
  );
  assert.deepEqual(workspaceFile.body.item.agent_items.map((item) => item.agent_id), [
    'app-engineering'
  ]);
  assert.deepEqual(workspaceFile.body.item.agent_items[0].source_kinds, [
    'tmux_observation',
    'workspace_file'
  ]);
  assert.deepEqual(workspaceFile.body.item.source_kind_buckets, {
    workspace_file: 1,
    workspace_root: 0,
    tmux_observation: 1
  });

  const unknownAgent = await requestJson(
    `${baseUrl}/collectors/controller-snapshot/evidence-coverage?agent_id=unknown-agent`
  );
  assert.deepEqual(unknownAgent.body.item, {
    collected_at: '2026-03-09T18:05:00.000Z',
    actor_id: 'team-lead',
    evidence_ref_count: 0,
    covered_agent_count: 0,
    low_confidence_agent_ids: [],
    source_kind_buckets: {
      workspace_file: 0,
      workspace_root: 0,
      tmux_observation: 0
    },
    agent_items: []
  });

  const workspaceRoot = await requestJson(
    `${baseUrl}/collectors/controller-snapshot/evidence-coverage?source_kind=workspace_root`
  );
  assert.deepEqual(workspaceRoot.body.item.agent_items.map((item) => item.agent_id), [
    'protocol-engineering'
  ]);
  assert.equal(workspaceRoot.body.item.evidence_ref_count, 1);
  assert.deepEqual(workspaceRoot.body.item.low_confidence_agent_ids, ['protocol-engineering']);

  const eventSourceKind = await requestJson(
    `${baseUrl}/collectors/controller-snapshot/evidence-coverage?source_kind=controller_event`
  );
  assert.deepEqual(eventSourceKind.body.item.agent_items, []);
  assert.deepEqual(eventSourceKind.body.item.source_kind_buckets, {
    workspace_file: 0,
    workspace_root: 0,
    tmux_observation: 0
  });

  const lowConfidence = await requestJson(
    `${baseUrl}/collectors/controller-snapshot/evidence-coverage?confidence_level=low`
  );
  assert.deepEqual(lowConfidence.body.item.agent_items.map((item) => item.agent_id), [
    'growth-revenue'
  ]);
  assert.equal(lowConfidence.body.item.covered_agent_count, 0);
  assert.deepEqual(lowConfidence.body.item.low_confidence_agent_ids, ['growth-revenue']);

  const blankFiltersWithLimit = await requestJson(
    `${baseUrl}/collectors/controller-snapshot/evidence-coverage?source_kind=&confidence_level=&limit=2`
  );
  assert.deepEqual(blankFiltersWithLimit.body.item.agent_items.map((item) => item.agent_id), [
    'app-engineering',
    'protocol-engineering'
  ]);
  assert.deepEqual(blankFiltersWithLimit.body.item.source_kind_buckets, {
    workspace_file: 1,
    workspace_root: 1,
    tmux_observation: 1
  });

  const negativeLimit = await requestJson(
    `${baseUrl}/collectors/controller-snapshot/evidence-coverage?limit=-1`
  );
  assert.deepEqual(negativeLimit.body.item.agent_items.map((item) => item.agent_id), [
    'app-engineering',
    'protocol-engineering',
    'growth-revenue'
  ]);

  const nonNumericLimit = await requestJson(
    `${baseUrl}/collectors/controller-snapshot/evidence-coverage?limit=not-a-number`
  );
  assert.deepEqual(nonNumericLimit.body.item.agent_items.map((item) => item.agent_id), [
    'app-engineering',
    'protocol-engineering',
    'growth-revenue'
  ]);
});

test('GET /collectors/controller-snapshot/source-health projects latest source health read-only with filters', async (t) => {
  const selectedAgents = ['app-engineering', 'growth-revenue'].map((agentId) =>
    SEED_AGENTS.find((agent) => agent.agent_id === agentId)
  );
  const appAgent = selectedAgents[0];
  const statsByPath = new Map([
    [appAgent.workspace_root, { mtime: '2026-03-09T18:03:30.000Z' }],
    [path.join(appAgent.workspace_root, 'outbox.md'), { mtime: '2026-03-09T18:04:00.000Z' }]
  ]);
  let collectCount = 0;

  const controllerSnapshotCollector = {
    async collectSnapshot({ actorId, collectedAt }) {
      collectCount += 1;

      return collectControllerSnapshot({
        actorId,
        collectedAt,
        agents: selectedAgents,
        readPathStat: async (targetPath) => statsByPath.get(targetPath) || null,
        listTmuxPanes: async () => [
          {
            session_name: appAgent.session_ref,
            window_index: '0',
            pane_index: '1',
            pane_id: '%11',
            pane_title: 'Implement source health API',
            pane_current_command: 'nvim',
            pane_active: true,
            pane_dead: false,
            pane_activity_at: '2026-03-09T18:04:30.000Z'
          },
          {
            session_name: 'unmapped-session',
            window_index: '0',
            pane_index: '0',
            pane_id: '%99',
            pane_title: 'unmapped',
            pane_current_command: 'bash',
            pane_active: false,
            pane_dead: false,
            pane_activity_at: '2026-03-09T18:02:00.000Z'
          }
        ]
      });
    }
  };

  const { baseUrl, store, storeFile } = await createHarness(t, { controllerSnapshotCollector });

  const missing = await requestJson(`${baseUrl}/collectors/controller-snapshot/source-health`);
  assert.equal(missing.response.status, 200);
  assert.deepEqual(missing.body, { item: null });
  assert.equal(collectCount, 0);

  const collected = await requestJson(`${baseUrl}/collectors/controller-snapshot`, {
    method: 'POST',
    headers: {
      'x-actor-id': 'team-lead'
    }
  });
  assert.equal(collected.response.status, 201);
  assert.equal(collectCount, 1);
  const recordsAfterPost = (await readFile(storeFile, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  const recordCountAfterPost = recordsAfterPost.length;

  const latestBeforeRead = store.getLatestCollectorReport();
  const sourceHealth = await requestJson(`${baseUrl}/collectors/controller-snapshot/source-health`);
  assert.equal(sourceHealth.response.status, 200);
  assert.equal(sourceHealth.body.item.collected_at, '2026-03-09T18:05:00.000Z');
  assert.equal(sourceHealth.body.item.collector_snapshot_id, 'collector-snapshot:2026-03-09T18:05:00.000Z');
  assert.equal(sourceHealth.body.item.actor_id, 'team-lead');
  assert.deepEqual(sourceHealth.body.item.runtime_source_evidence.unmapped_tmux_sessions, [
    {
      session_name: 'unmapped-session',
      observed_count: 1,
      last_observed_at: '2026-03-09T18:02:00.000Z',
      pane_refs: ['tmux://unmapped-session/0.0']
    }
  ]);
  assert.deepEqual(sourceHealth.body.item.agent_items.map((item) => item.agent_id), [
    'app-engineering',
    'growth-revenue'
  ]);
  assert.equal(sourceHealth.body.item.agent_items[0].source_health.workspace_root.status, 'observed');
  assert.equal(sourceHealth.body.item.agent_items[0].source_health.workspace_files.status, 'degraded');
  assert.equal(sourceHealth.body.item.agent_items[0].source_health.tmux_session.status, 'observed');
  assert.equal(sourceHealth.body.item.agent_items[0].evidence_ref_count, 3);
  assert.equal(sourceHealth.body.item.agent_items[0].latest_evidence_at, '2026-03-09T18:04:30.000Z');
  assert.equal(Object.hasOwn(sourceHealth.body.item, 'items'), false);
  assert.equal(collectCount, 1);
  assert.equal(store.getLatestCollectorReport(), latestBeforeRead);

  const missingTmux = await requestJson(
    `${baseUrl}/collectors/controller-snapshot/source-health?source_kind=tmux_observation&status=missing`
  );
  assert.equal(missingTmux.body.item.collector_snapshot_id, 'collector-snapshot:2026-03-09T18:05:00.000Z');
  assert.deepEqual(missingTmux.body.item.agent_items.map((item) => item.agent_id), [
    'growth-revenue'
  ]);
  assert.deepEqual(Object.keys(missingTmux.body.item.agent_items[0].source_health), [
    'tmux_session'
  ]);
  assert.deepEqual(missingTmux.body.item.summary.status_buckets, {
    observed: 0,
    degraded: 0,
    missing: 1,
    error: 0
  });

  const aliasAndLimit = await requestJson(
    `${baseUrl}/collectors/controller-snapshot/source-health?source_kind=workspace_file&limit=1`
  );
  assert.deepEqual(aliasAndLimit.body.item.agent_items.map((item) => item.agent_id), [
    'app-engineering'
  ]);
  assert.deepEqual(Object.keys(aliasAndLimit.body.item.agent_items[0].source_health), [
    'workspace_files'
  ]);

  const blankFilters = await requestJson(
    `${baseUrl}/collectors/controller-snapshot/source-health?agent_id=&source_kind=&status=&limit=-1`
  );
  assert.deepEqual(blankFilters.body.item.agent_items.map((item) => item.agent_id), [
    'app-engineering',
    'growth-revenue'
  ]);

  const records = (await readFile(storeFile, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(records.length, recordCountAfterPost);
  assert.equal(records.filter((record) => record.kind === 'event').length, 2);
  assert.equal(records.filter((record) => record.kind === 'heartbeat').length, 1);
  assert.ok(records.some((record) => record.kind === 'evidence_record'));
  assert.equal(records.filter((record) => record.kind === 'collector_snapshot').length, 1);
  assert.equal(records[records.length - 1].kind, 'collector_snapshot');
});

test('GET /evidence-records lists stored evidence records read-only with exact filters', async (t) => {
  let collectCount = 0;
  const controllerSnapshotCollector = {
    async collectSnapshot() {
      collectCount += 1;
      throw new Error('GET /evidence-records must not collect');
    }
  };
  const { baseUrl, store, storeFile } = await createHarness(t, { controllerSnapshotCollector });

  await store.appendCollectorReport({
    collected_at: '2026-03-09T18:06:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 2,
      heartbeat_count: 0,
      tmux_observed_count: 1,
      workspace_observed_count: 2,
      reboot_recommended_count: 0
    },
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
    },
    items: [
      {
        agent_id: 'app-engineering',
        evidence_refs: [
          '/tmp/evidence-query/app',
          '/tmp/evidence-query/app/inbox.md',
          '/tmp/evidence-query/app/outbox.md',
          'tmux://5-web3-app-engineering/0.1'
        ],
        workspace_observations: [
          {
            path: '/tmp/evidence-query/app/inbox.md',
            file_name: 'inbox.md',
            kind: 'workspace_file',
            last_modified_at: '2026-03-09T18:04:00.000Z'
          },
          {
            path: '/tmp/evidence-query/app/outbox.md',
            file_name: 'outbox.md',
            kind: 'workspace_file',
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
            path: '/tmp/evidence-query/app',
            last_observed_at: '2026-03-09T18:03:00.000Z',
            degraded_reasons: []
          },
          workspace_files: {
            status: 'observed',
            last_observed_at: '2026-03-09T18:05:00.000Z',
            degraded_reasons: []
          },
          tmux_session: {
            status: 'observed',
            expected_session_ref: '5-web3-app-engineering',
            observed_count: 1,
            last_observed_at: '2026-03-09T18:05:30.000Z',
            degraded_reasons: []
          }
        }
      },
      {
        agent_id: 'protocol-engineering',
        evidence_refs: ['/tmp/evidence-query/protocol/todo.md'],
        workspace_source_records: [
          {
            path: '/tmp/evidence-query/protocol/inbox.md',
            file_name: 'inbox.md',
            kind: 'workspace_file',
            status: 'missing',
            last_observed_at: null,
            error: null
          }
        ],
        workspace_observations: [
          {
            path: '/tmp/evidence-query/protocol/todo.md',
            file_name: 'todo.md',
            kind: 'workspace_file',
            last_modified_at: '2026-03-09T18:02:00.000Z'
          }
        ],
        tmux_observations: [],
        source_health: {
          workspace_files: {
            status: 'degraded',
            last_observed_at: '2026-03-09T18:02:00.000Z',
            degraded_reasons: ['missing workspace files: inbox.md, outbox.md']
          }
        }
      }
    ]
  });

  const fileBeforeRead = await readFile(storeFile, 'utf8');
  const latestBeforeRead = store.getLatestCollectorReport();
  const countsBeforeRead = store.getCounts();

  const response = await requestJson(
    `${baseUrl}/evidence-records?agent_id=app-engineering&source_kind=workspace_file&evidence_role=agent_output&output_candidate=true&limit=10`
  );
  assert.equal(response.response.status, 200);
  assert.deepEqual(response.body.items.map((item) => item.evidence_ref), [
    '/tmp/evidence-query/app/outbox.md'
  ]);
  assert.equal(response.body.items[0].agent_id, 'app-engineering');
  assert.equal(response.body.items[0].source_kind, 'workspace_file');
  assert.equal(response.body.items[0].evidence_role, 'agent_output');
  assert.equal(response.body.items[0].output_candidate, true);

  const evidenceId = response.body.items[0].evidence_id;
  const exactEvidenceId = await requestJson(
    `${baseUrl}/evidence-records?evidence_id=${encodeURIComponent(evidenceId)}&agent_id=app-engineering&source_kind=workspace_file&newest_first=true&limit=1`
  );
  assert.equal(exactEvidenceId.response.status, 200);
  assert.deepEqual(exactEvidenceId.body.items.map((item) => item.evidence_ref), [
    '/tmp/evidence-query/app/outbox.md'
  ]);

  const substringEvidenceId = await requestJson(
    `${baseUrl}/evidence-records?evidence_id=${encodeURIComponent(evidenceId.slice(0, -2))}&limit=10`
  );
  assert.equal(substringEvidenceId.response.status, 200);
  assert.deepEqual(substringEvidenceId.body.items, []);

  const unknownEvidenceId = await requestJson(
    `${baseUrl}/evidence-records?evidence_id=missing-evidence-id&limit=10`
  );
  assert.equal(unknownEvidenceId.response.status, 200);
  assert.deepEqual(unknownEvidenceId.body.items, []);

  const blankFilters = await requestJson(
    `${baseUrl}/evidence-records?evidence_id=&agent_id=&source_kind=&evidence_role=&output_candidate=false&limit=2`
  );
  assert.equal(blankFilters.response.status, 200);
  assert.deepEqual(blankFilters.body.items.map((item) => item.evidence_ref), [
    '/tmp/evidence-query/app',
    '/tmp/evidence-query/app/inbox.md'
  ]);

  const newestFirst = await requestJson(
    `${baseUrl}/evidence-records?output_candidate=false&newest_first=true&limit=2`
  );
  assert.equal(newestFirst.response.status, 200);
  assert.deepEqual(newestFirst.body.items.map((item) => item.evidence_ref), [
    'tmux://unmapped-session/0.0',
    '/tmp/evidence-query/app/inbox.md'
  ]);

  const unmapped = await requestJson(
    `${baseUrl}/evidence-records?evidence_role=runtime_unmapped&output_candidate=false&limit=-1`
  );
  assert.equal(unmapped.response.status, 200);
  assert.deepEqual(unmapped.body.items, [
    {
      evidence_id: unmapped.body.items[0].evidence_id,
      observed_at: '2026-03-09T18:05:50.000Z',
      collected_at: '2026-03-09T18:06:00.000Z',
      agent_id: null,
      source_kind: 'tmux_observation',
      evidence_ref: 'tmux://unmapped-session/0.0',
      evidence_role: 'runtime_unmapped',
      source_status: 'observed',
      output_candidate: false,
      collector_snapshot_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
      correlation_id: 'collector-snapshot:2026-03-09T18:06:00.000Z',
      degraded_reasons: [],
      metadata: {
        session_name: 'unmapped-session',
        observed_count: 1,
        source_health_key: 'runtime_source_evidence.unmapped_tmux_sessions'
      }
    }
  ]);

  const mappedOnly = await requestJson(`${baseUrl}/evidence-records?mapped=true&limit=10`);
  assert.equal(mappedOnly.response.status, 200);
  assert.ok(mappedOnly.body.items.length > 0);
  assert.ok(mappedOnly.body.items.every((item) => item.agent_id !== null));

  const unmappedOnly = await requestJson(`${baseUrl}/evidence-records?mapped=false&limit=10`);
  assert.equal(unmappedOnly.response.status, 200);
  assert.deepEqual(unmappedOnly.body.items.map((item) => item.evidence_ref), [
    'tmux://unmapped-session/0.0'
  ]);

  const unmappedWithAgent = await requestJson(
    `${baseUrl}/evidence-records?mapped=false&agent_id=app-engineering&limit=10`
  );
  assert.equal(unmappedWithAgent.response.status, 200);
  assert.deepEqual(unmappedWithAgent.body.items, []);

  const invalidMapped = await requestJson(`${baseUrl}/evidence-records?mapped=maybe&limit=2`);
  assert.equal(invalidMapped.response.status, 200);
  assert.deepEqual(invalidMapped.body.items.map((item) => item.evidence_ref), [
    '/tmp/evidence-query/app',
    '/tmp/evidence-query/app/inbox.md'
  ]);

  const exactDrilldown = await requestJson(
    `${baseUrl}/evidence-records?evidence_ref=${encodeURIComponent('/tmp/evidence-query/app/outbox.md')}&source_status=observed&collector_snapshot_id=${encodeURIComponent('collector-snapshot:2026-03-09T18:06:00.000Z')}&correlation_id=${encodeURIComponent('collector-snapshot:2026-03-09T18:06:00.000Z')}`
  );
  assert.equal(exactDrilldown.response.status, 200);
  assert.deepEqual(exactDrilldown.body.items.map((item) => item.evidence_ref), [
    '/tmp/evidence-query/app/outbox.md'
  ]);

  const negativeWorkspaceGap = await requestJson(
    `${baseUrl}/evidence-records?agent_id=protocol-engineering&source_kind=workspace_file&source_status=missing&output_candidate=false&limit=10`
  );
  assert.equal(negativeWorkspaceGap.response.status, 200);
  assert.deepEqual(negativeWorkspaceGap.body.items.map((item) => item.evidence_ref), [
    '/tmp/evidence-query/protocol/inbox.md'
  ]);
  assert.equal(negativeWorkspaceGap.body.items[0].evidence_role, 'inbound_task');

  const observedWindow = await requestJson(
    `${baseUrl}/evidence-records?observed_since=${encodeURIComponent('2026-03-09T18:04:30.000Z')}&observed_until=${encodeURIComponent('2026-03-09T18:05:30.000Z')}&newest_first=true&limit=2`
  );
  assert.equal(observedWindow.response.status, 200);
  assert.deepEqual(observedWindow.body.items.map((item) => item.evidence_ref), [
    'tmux://5-web3-app-engineering/0.1',
    '/tmp/evidence-query/app/outbox.md'
  ]);

  const collectedWindow = await requestJson(
    `${baseUrl}/evidence-records?collected_since=${encodeURIComponent('2026-03-09T18:06:00.000Z')}&collected_until=${encodeURIComponent('2026-03-09T18:06:00.000Z')}&limit=1`
  );
  assert.equal(collectedWindow.response.status, 200);
  assert.deepEqual(collectedWindow.body.items.map((item) => item.evidence_ref), [
    '/tmp/evidence-query/app'
  ]);

  const invalidWindow = await requestJson(
    `${baseUrl}/evidence-records?observed_since=bogus&observed_until=&collected_since=%20&collected_until=2026-13-99&limit=1`
  );
  assert.equal(invalidWindow.response.status, 200);
  assert.deepEqual(invalidWindow.body.items.map((item) => item.evidence_ref), [
    '/tmp/evidence-query/app'
  ]);

  const unknownExact = await requestJson(
    `${baseUrl}/evidence-records?evidence_ref=${encodeURIComponent('/tmp/evidence-query')}&source_status=missing&collector_snapshot_id=unknown&correlation_id=unknown`
  );
  assert.equal(unknownExact.response.status, 200);
  assert.deepEqual(unknownExact.body.items, []);

  const summary = await requestJson(
    `${baseUrl}/evidence-records/summary?output_candidate=false&newest_first=true&limit=1`
  );
  assert.equal(summary.response.status, 200);
  assert.deepEqual(summary.body, {
    item: {
      total_count: 4,
      returned_limit: 1,
      mapped_count: 3,
      unmapped_count: 1,
      output_candidate_buckets: {
        true: 0,
        false: 4
      },
      source_kind_buckets: {
        workspace_root: 1,
        workspace_file: 2,
        tmux_observation: 1,
        hermes_profile: 0,
        hermes_session: 0
      },
      evidence_role_buckets: {
        workspace_presence: 1,
        inbound_task: 2,
        agent_output: 0,
        agent_plan: 0,
        runtime_activity: 0,
        runtime_presence: 0,
        runtime_unmapped: 1
      },
      source_status_buckets: {
        observed: 3,
        degraded: 0,
        missing: 1,
        error: 0
      }
    }
  });
  assert.equal(await readFile(storeFile, 'utf8'), fileBeforeRead);

  const emptySummary = await requestJson(
    `${baseUrl}/evidence-records/summary?mapped=false&agent_id=app-engineering&limit=10`
  );
  assert.equal(emptySummary.response.status, 200);
  assert.deepEqual(emptySummary.body.item, {
    total_count: 0,
    returned_limit: 10,
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
      hermes_session: 0
    },
    evidence_role_buckets: {
      workspace_presence: 0,
      inbound_task: 0,
      agent_output: 0,
      agent_plan: 0,
      runtime_activity: 0,
      runtime_presence: 0,
      runtime_unmapped: 0
    },
    source_status_buckets: {
      observed: 0,
      degraded: 0,
      missing: 0,
      error: 0
    }
  });

  assert.equal(collectCount, 0);
  assert.equal(store.getLatestCollectorReport(), latestBeforeRead);
  assert.deepEqual(store.getCounts(), countsBeforeRead);
  assert.equal(await readFile(storeFile, 'utf8'), fileBeforeRead);
});

test('GET evidence and source read routes keep JSONL and SQLite parity', async (t) => {
  if (!(await hasSqlite3())) {
    t.skip('sqlite3 binary not found; SQLite route parity smoke skipped explicitly');
    return;
  }

  const jsonl = await createHarness(t);
  const sqlite = await createHarness(t, { storeBackend: 'sqlite' });
  const report = createRouteParityCollectorReport();
  await jsonl.store.appendCollectorReport(report);
  await sqlite.store.appendCollectorReport(structuredClone(report));

  const before = {
    jsonl: jsonl.store.records.length,
    sqlite: sqlite.store.records.length
  };

  async function parityRequest(pathname) {
    const jsonlResponse = await requestJson(`${jsonl.baseUrl}${pathname}`);
    const sqliteResponse = await requestJson(`${sqlite.baseUrl}${pathname}`);
    assert.equal(jsonlResponse.response.status, 200);
    assert.equal(sqliteResponse.response.status, 200);
    return [jsonlResponse.body, sqliteResponse.body];
  }

  const [jsonlHealth, sqliteHealth] = await parityRequest('/health');
  assert.deepEqual(sqliteHealth, jsonlHealth);

  const [jsonlCoverage, sqliteCoverage] = await parityRequest(
    '/collectors/controller-snapshot/evidence-coverage?source_kind=workspace_file&confidence_level=high&limit=10'
  );
  assert.deepEqual(sqliteCoverage, jsonlCoverage);
  assert.deepEqual(jsonlCoverage.item.agent_items.map((item) => item.agent_id), [
    'app-engineering'
  ]);

  const [jsonlSourceHealth, sqliteSourceHealth] = await parityRequest(
    '/collectors/controller-snapshot/source-health?status=missing&limit=10'
  );
  assert.deepEqual(sqliteSourceHealth, jsonlSourceHealth);
  assert.deepEqual(jsonlSourceHealth.item.agent_items.map((item) => item.agent_id), [
    'protocol-engineering'
  ]);

  const projectEvidenceRecords = (body) =>
    body.items.map((item) => ({
      observed_at: item.observed_at,
      collected_at: item.collected_at,
      agent_id: item.agent_id,
      source_kind: item.source_kind,
      evidence_ref: item.evidence_ref,
      evidence_role: item.evidence_role,
      source_status: item.source_status,
      output_candidate: item.output_candidate,
      collector_snapshot_id: item.collector_snapshot_id,
      correlation_id: item.correlation_id
    }));

  const [jsonlMapped, sqliteMapped] = await parityRequest(
    '/evidence-records?mapped=true&output_candidate=true&observed_since=2026-03-09T18%3A04%3A30.000Z&observed_until=2026-03-09T18%3A05%3A30.000Z&collected_since=2026-03-09T18%3A06%3A00.000Z&collected_until=2026-03-09T18%3A06%3A00.000Z&newest_first=true&limit=10'
  );
  assert.deepEqual(projectEvidenceRecords(sqliteMapped), projectEvidenceRecords(jsonlMapped));
  assert.deepEqual(projectEvidenceRecords(jsonlMapped).map((item) => item.evidence_ref), [
    'tmux://5-web3-app-engineering/0.1',
    '/tmp/route-parity/app/outbox.md'
  ]);

  const [jsonlUnmapped, sqliteUnmapped] = await parityRequest(
    '/evidence-records?mapped=false&output_candidate=false&limit=10'
  );
  assert.deepEqual(projectEvidenceRecords(sqliteUnmapped), projectEvidenceRecords(jsonlUnmapped));
  assert.deepEqual(projectEvidenceRecords(jsonlUnmapped).map((item) => item.evidence_ref), [
    'tmux://unmapped-route-parity/0.0'
  ]);

  const [jsonlSummary, sqliteSummary] = await parityRequest(
    '/evidence-records/summary?mapped=true&output_candidate=true&newest_first=true&limit=1'
  );
  assert.deepEqual(sqliteSummary, jsonlSummary);
  assert.equal(jsonlSummary.item.total_count, 2);
  assert.equal(jsonlSummary.item.returned_limit, 1);

  assert.equal(jsonl.store.records.length, before.jsonl);
  assert.equal(sqlite.store.records.length, before.sqlite);
});

test('collector snapshot POST exposes shared artifact rollups for refs shared by multiple agents', async (t) => {
  const sharedArtifactRef = '/tmp/shared-controller-snapshot/todo.md';
  const controllerSnapshotCollector = {
    async collectSnapshot({ actorId, collectedAt }) {
      assert.equal(actorId, 'team-lead');
      assert.equal(collectedAt, '2026-03-09T18:05:00.000Z');

      return {
        collected_at: collectedAt,
        actor_id: actorId,
        summary: {
          agent_count: 2,
          heartbeat_count: 2,
          tmux_observed_count: 0,
          workspace_observed_count: 2,
          reboot_recommended_count: 0
        },
        items: [
          {
            agent_id: 'app-engineering',
            workspace_root: '/tmp/shared-controller-snapshot',
            session_ref: '5-web3-app-engineering',
            evidence_refs: [sharedArtifactRef],
            workspace_observations: [
              {
                path: sharedArtifactRef,
                file_name: 'todo.md',
                kind: 'workspace_file',
                last_modified_at: '2026-03-09T18:04:30.000Z'
              }
            ],
            tmux_observations: [],
            supervision: {
              watch_target: 'growth-revenue',
              watched_by: ['protocol-engineering', 'team-lead'],
              needs_attention: false
            },
            heartbeat: {
              agent_id: 'app-engineering',
              actor_id: actorId,
              received_at: collectedAt,
              current_state: 'coding',
              active_task: 'Implement shared snapshot artifact rollup',
              last_meaningful_output_at: '2026-03-09T18:04:30.000Z',
              last_file_write_at: '2026-03-09T18:04:30.000Z',
              current_blocker: '',
              confidence_level: 'high',
              reboot_recommended: false
            }
          },
          {
            agent_id: 'growth-revenue',
            workspace_root: '/tmp/shared-controller-snapshot',
            session_ref: '6-web3-growth-revenue',
            evidence_refs: [sharedArtifactRef],
            workspace_observations: [
              {
                path: sharedArtifactRef,
                file_name: 'todo.md',
                kind: 'workspace_file',
                last_modified_at: '2026-03-09T18:04:45.000Z'
              }
            ],
            tmux_observations: [],
            supervision: {
              watch_target: 'app-engineering',
              watched_by: ['team-lead'],
              needs_attention: false
            },
            heartbeat: {
              agent_id: 'growth-revenue',
              actor_id: actorId,
              received_at: collectedAt,
              current_state: 'researching',
              active_task: 'Review shared snapshot artifact rollup',
              last_meaningful_output_at: '2026-03-09T18:04:45.000Z',
              last_file_write_at: '2026-03-09T18:04:45.000Z',
              current_blocker: '',
              confidence_level: 'high',
              reboot_recommended: false
            }
          }
        ]
      };
    }
  };

  const { baseUrl } = await createHarness(t, { controllerSnapshotCollector });

  const collected = await requestJson(`${baseUrl}/collectors/controller-snapshot`, {
    method: 'POST',
    headers: {
      'x-actor-id': 'team-lead'
    }
  });
  assert.equal(collected.response.status, 201);
  assert.deepEqual(collected.body.item.shared_artifacts, [
    {
      artifact_ref: sharedArtifactRef,
      artifact_kind: 'workspace_file',
      file_name: 'todo.md',
      agent_ids: ['app-engineering', 'growth-revenue'],
      agent_count: 2,
      mention_count: 2,
      last_seen_at: '2026-03-09T18:04:45.000Z',
      source_kinds: ['workspace_file']
    }
  ]);

  const latest = await requestJson(`${baseUrl}/collectors/controller-snapshot`);
  assert.equal(latest.response.status, 200);
  assert.deepEqual(latest.body.item.shared_artifacts, collected.body.item.shared_artifacts);
});

test('collector snapshot POST emits supervision events onto existing query surfaces', async (t) => {
  const controllerSnapshotCollector = {
    async collectSnapshot({ actorId, collectedAt }) {
      assert.equal(actorId, 'team-lead');
      assert.equal(collectedAt, '2026-03-09T18:05:00.000Z');

      return {
        collected_at: collectedAt,
        actor_id: actorId,
        summary: {
          agent_count: 2,
          heartbeat_count: 2,
          tmux_observed_count: 1,
          workspace_observed_count: 2,
          reboot_recommended_count: 1
        },
        items: [
          {
            agent_id: 'market-intel',
            evidence_refs: ['/tmp/market-intel/outbox.md'],
            workspace_observations: [],
            tmux_observations: [],
            supervision: {
              watch_target: 'product-pmf',
              watched_by: ['growth-revenue', 'team-lead'],
              needs_attention: true
            },
            heartbeat: {
              agent_id: 'market-intel',
              actor_id: actorId,
              received_at: collectedAt,
              current_state: 'researching',
              active_task: 'Review competitor notes',
              last_meaningful_output_at: '2026-03-09T17:45:00.000Z',
              last_file_write_at: '2026-03-09T17:45:00.000Z',
              current_blocker: '',
              confidence_level: 'high',
              reboot_recommended: false
            }
          },
          {
            agent_id: 'growth-revenue',
            evidence_refs: [
              '/tmp/growth-revenue/inbox.md',
              'tmux://6-web3-growth-revenue/0.0'
            ],
            workspace_observations: [],
            tmux_observations: [
              {
                session_name: '6-web3-growth-revenue',
                window_index: '0',
                pane_index: '0',
                pane_id: '%21',
                pane_title: 'Investigate stalled shell',
                pane_current_command: 'bash',
                pane_active: true,
                pane_dead: true,
                pane_activity_at: '2026-03-09T18:00:00.000Z'
              }
            ],
            supervision: {
              watch_target: 'market-intel',
              watched_by: ['app-engineering', 'team-lead'],
              needs_attention: true
            },
            heartbeat: {
              agent_id: 'growth-revenue',
              actor_id: actorId,
              received_at: collectedAt,
              current_state: 'blocked',
              active_task: 'Investigate stalled shell',
              last_meaningful_output_at: '2026-03-09T18:00:00.000Z',
              last_file_write_at: null,
              current_blocker: 'tmux pane marked dead',
              confidence_level: 'high',
              reboot_recommended: true
            }
          }
        ]
      };
    }
  };

  const { baseUrl } = await createHarness(t, { controllerSnapshotCollector });

  const collected = await requestJson(`${baseUrl}/collectors/controller-snapshot`, {
    method: 'POST',
    headers: {
      'x-actor-id': 'team-lead'
    }
  });
  assert.equal(collected.response.status, 201);

  const activityEvents = await requestJson(`${baseUrl}/events?event_type=agent_state_changed&limit=5`);
  assert.equal(activityEvents.response.status, 200);
  assert.equal(activityEvents.body.items.length, 2);
  assert.ok(activityEvents.body.items.every((event) => event.metadata.collector_activity_family === 'state_change'));

  const fileWriteEvents = await requestJson(`${baseUrl}/events?event_type=agent_wrote_file&limit=5`);
  assert.equal(fileWriteEvents.response.status, 200);
  assert.equal(fileWriteEvents.body.items.length, 1);
  assert.ok(fileWriteEvents.body.items.every((event) => event.metadata.collector_activity_family === 'file_write'));
  assert.ok(fileWriteEvents.body.items.every((event) => !event.evidence_refs.includes('/tmp/growth-revenue/inbox.md')));

  const events = await requestJson(`${baseUrl}/events?event_type=peer_watch_alert_raised`);
  assert.equal(events.response.status, 200);
  assert.equal(events.body.items.length, 2);
  assert.ok(
    events.body.items.some(
      (event) =>
        event.agent_id === 'market-intel' &&
        event.metadata.collector_alert_family === 'staleness' &&
        event.severity === 'yellow'
    )
  );
  assert.ok(
    events.body.items.some(
      (event) =>
        event.agent_id === 'growth-revenue' &&
        event.metadata.collector_alert_family === 'blocked' &&
        event.severity === 'orange'
    )
  );

  const alerts = await requestJson(`${baseUrl}/peer-watch/alerts`);
  assert.equal(alerts.response.status, 200);
  assert.equal(alerts.body.items.length, 2);
  assert.ok(alerts.body.items.every((item) => item.status === 'open'));

  const timeline = await requestJson(`${baseUrl}/timeline?window=30m`);
  assert.equal(timeline.response.status, 200);
  assert.equal(
    timeline.body.items.filter((item) => item.event_type === 'peer_watch_alert_raised').length,
    2
  );
  const growthRevenueAlert = timeline.body.items.find(
    (item) =>
      item.agent_id === 'growth-revenue' && item.event_type === 'peer_watch_alert_raised'
  );
  assert.ok(growthRevenueAlert);
  assert.equal(growthRevenueAlert.source_kind, 'controller_event');
  assert.deepEqual(growthRevenueAlert.counterparty_agent_ids, ['app-engineering']);
  assert.deepEqual(growthRevenueAlert.evidence_refs, [
    '/tmp/growth-revenue/inbox.md',
    'tmux://6-web3-growth-revenue/0.0'
  ]);

  const growthRevenueStateChange = timeline.body.items.find(
    (item) =>
      item.agent_id === 'growth-revenue' && item.event_type === 'agent_state_changed'
  );
  assert.ok(growthRevenueStateChange);
  assert.equal(growthRevenueStateChange.source_kind, 'tmux_observation');
  assert.deepEqual(growthRevenueStateChange.evidence_refs, [
    'tmux://6-web3-growth-revenue/0.0'
  ]);

  const overview = await requestJson(`${baseUrl}/office/overview`);
  assert.equal(overview.response.status, 200);
  const marketIntel = overview.body.agents.find((agent) => agent.agent_id === 'market-intel');
  assert.equal(marketIntel.current_state, 'researching');
  assert.equal(marketIntel.effective_severity, 'yellow');
  const growthRevenue = overview.body.agents.find((agent) => agent.agent_id === 'growth-revenue');
  assert.equal(growthRevenue.current_state, 'blocked');
  assert.equal(growthRevenue.effective_severity, 'orange');
});

test('CORS headers are correctly set for allowed origins', async (t) => {
  const allowedOrigin = 'http://localhost:8080';
  const { baseUrl } = await createHarness(t, { allowedOrigins: [allowedOrigin] });

  const { response } = await requestJson(`${baseUrl}/health`, {
    headers: {
      Origin: allowedOrigin
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), allowedOrigin);
  assert.equal(response.headers.get('Access-Control-Allow-Headers'), 'Content-Type');
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');
});

test('OPTIONS preflight requests are handled for allowed origins', async (t) => {
  const allowedOrigin = 'http://localhost:8080';
  const { baseUrl } = await createHarness(t, { allowedOrigins: [allowedOrigin] });

  const response = await fetch(`${baseUrl}/health`, {
    method: 'OPTIONS',
    headers: {
      Origin: allowedOrigin,
      'Access-Control-Request-Headers': 'Content-Type',
      'Access-Control-Request-Method': 'GET'
    }
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), allowedOrigin);
  assert.equal(response.headers.get('Access-Control-Allow-Headers'), 'Content-Type');
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');
});

test('OPTIONS preflight rejects non-GET methods even for allowed origins', async (t) => {
  const allowedOrigin = 'http://localhost:8080';
  const { baseUrl } = await createHarness(t, { allowedOrigins: [allowedOrigin] });

  const response = await fetch(`${baseUrl}/health`, {
    method: 'OPTIONS',
    headers: {
      Origin: allowedOrigin,
      'Access-Control-Request-Headers': 'Content-Type',
      'Access-Control-Request-Method': 'POST'
    }
  });

  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), allowedOrigin);
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, OPTIONS');
});

test('CORS headers are not set for disallowed origins', async (t) => {
  const allowedOrigin = 'http://localhost:8080';
  const disallowedOrigin = 'http://malicious.com';
  const { baseUrl } = await createHarness(t, { allowedOrigins: [allowedOrigin] });

  const { response } = await requestJson(`${baseUrl}/health`, {
    headers: {
      Origin: disallowedOrigin
    }
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});
