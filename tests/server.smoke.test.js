const assert = require('node:assert/strict');
const { mkdtemp, readFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createAppServer } = require('../src/server');
const { createPrototypeStore } = require('../src/store/prototype-store');

async function createHarness(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-'));
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });
  const server = createAppServer({ store, now: () => '2026-03-09T18:05:00.000Z' });

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
    storeFile,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const body = await response.json();
  return { response, body };
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
