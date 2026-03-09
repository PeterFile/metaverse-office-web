const assert = require('node:assert/strict');
const { mkdtemp, readFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createAppServer } = require('../src/server');
const { createPrototypeStore } = require('../src/store/prototype-store');

async function createHarness(t, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-'));
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });
  const server = createAppServer({
    store,
    now: options.now || (() => '2026-03-09T18:05:00.000Z'),
    controllerSnapshotCollector: options.controllerSnapshotCollector
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
    location: 'meeting-zone',
    summary,
    severity,
    correlation_id: correlationId,
    counterparty_agent_ids: counterpartyAgentIds,
    evidence_refs: evidenceRefs,
    source_kind: sourceKind,
    metadata
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
  assert.deepEqual(interactions.body.items[0].related_event_ids, [
    'evt_review_started',
    'evt_review_completed'
  ]);

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

  const missingAgent = await requestJson(`${baseUrl}/agents/missing-agent/interactions`);
  assert.equal(missingAgent.response.status, 404);
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

  const lines = (await readFile(storeFile, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).kind, 'heartbeat');
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
            tmux_observations: [],
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
              last_file_write_at: '2026-03-09T18:00:00.000Z',
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

  const growthRevenue = await requestJson(`${baseUrl}/agents/growth-revenue`);
  assert.equal(growthRevenue.response.status, 200);
  assert.equal(growthRevenue.body.item.current_state, 'blocked');
  assert.equal(growthRevenue.body.item.current_blocker, 'tmux pane marked dead');
  assert.equal(growthRevenue.body.item.severity, 'orange');

  const overview = await requestJson(`${baseUrl}/office/overview`);
  assert.equal(overview.response.status, 200);
  const marketIntel = overview.body.agents.find((agent) => agent.agent_id === 'market-intel');
  assert.equal(marketIntel.reported_severity, 'yellow');
  assert.equal(marketIntel.effective_severity, 'yellow');
});
