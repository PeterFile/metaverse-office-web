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
      counterpartyAgentIds: ['growth-revenue'],
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

  const missingAgent = await requestJson(`${baseUrl}/agents/missing-agent/incidents`);
  assert.equal(missingAgent.response.status, 404);
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

  const activityEvents = await requestJson(`${baseUrl}/events?agent_id=app-engineering&limit=5`);
  assert.equal(activityEvents.response.status, 200);
  assert.deepEqual(
    activityEvents.body.items.map((event) => event.event_type),
    ['agent_state_changed', 'agent_wrote_file']
  );

  const lines = (await readFile(storeFile, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 3);
  assert.equal(JSON.parse(lines[0]).kind, 'event');
  assert.equal(JSON.parse(lines[1]).kind, 'event');
  assert.equal(JSON.parse(lines[2]).kind, 'heartbeat');
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

  const activityEvents = await requestJson(`${baseUrl}/events?event_type=agent_state_changed&limit=5`);
  assert.equal(activityEvents.response.status, 200);
  assert.equal(activityEvents.body.items.length, 2);
  assert.ok(activityEvents.body.items.every((event) => event.metadata.collector_activity_family === 'state_change'));

  const fileWriteEvents = await requestJson(`${baseUrl}/events?event_type=agent_wrote_file&limit=5`);
  assert.equal(fileWriteEvents.response.status, 200);
  assert.equal(fileWriteEvents.body.items.length, 2);
  assert.ok(fileWriteEvents.body.items.every((event) => event.metadata.collector_activity_family === 'file_write'));

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

  const growthRevenueFileWrite = timeline.body.items.find(
    (item) => item.agent_id === 'growth-revenue' && item.event_type === 'agent_wrote_file'
  );
  assert.ok(growthRevenueFileWrite);
  assert.equal(growthRevenueFileWrite.source_kind, 'workspace_file');
  assert.deepEqual(growthRevenueFileWrite.evidence_refs, ['/tmp/growth-revenue/inbox.md']);

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
