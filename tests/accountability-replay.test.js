const assert = require('node:assert/strict');
const { mkdtemp, readFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createAppServer } = require('../src/server');
const { createPrototypeStore } = require('../src/store/prototype-store');

async function createHarness(t, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-replay-'));
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });
  const server = createAppServer({
    store,
    now: options.now || (() => '2026-03-09T18:50:00.000Z')
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

async function requestJson(url) {
  const response = await fetch(url);
  const body = await response.json();
  return { response, body };
}

function createEvent({
  eventId,
  ts,
  agentId = 'app-engineering',
  actorId = 'team-lead',
  eventType,
  currentState,
  activeTask,
  summary,
  severity = 'normal',
  correlationId,
  counterpartyAgentIds = [],
  evidenceRefs = [],
  sourceKind = 'controller_event'
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
    location: 'review-zone',
    summary,
    severity,
    correlation_id: correlationId,
    counterparty_agent_ids: counterpartyAgentIds,
    evidence_refs: evidenceRefs,
    source_kind: sourceKind,
    metadata: {}
  };
}

async function seedReplaySlice(store) {
  await store.appendEvent(
    createEvent({
      eventId: 'evt_replay_old',
      ts: '2026-03-09T17:30:00.000Z',
      eventType: 'agent_handoff_started',
      currentState: 'planning',
      activeTask: 'Old replay work',
      summary: 'Old replay event outside the bounded window',
      severity: 'yellow',
      correlationId: 'corr-replay',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/replay-old.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_replay_review_started',
      ts: '2026-03-09T18:42:00.000Z',
      eventType: 'review_started',
      currentState: 'reviewing',
      activeTask: 'Review replay bundle',
      summary: 'Lead started replay review',
      severity: 'yellow',
      correlationId: 'corr-replay',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/replay-start.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_replay_review_completed',
      ts: '2026-03-09T18:45:00.000Z',
      agentId: 'protocol-engineering',
      actorId: 'app-engineering',
      eventType: 'review_completed',
      currentState: 'reviewing',
      activeTask: 'Review replay bundle',
      summary: 'Replay review completed with evidence',
      severity: 'orange',
      correlationId: 'corr-replay',
      counterpartyAgentIds: ['team-lead'],
      evidenceRefs: ['/tmp/replay-complete.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_replay_agent_status',
      ts: '2026-03-09T18:49:00.000Z',
      eventType: 'agent_replied',
      currentState: 'coding',
      activeTask: 'Patch replay bundle',
      summary: 'App engineering posted replay status',
      severity: 'normal',
      correlationId: 'corr-replay',
      counterpartyAgentIds: ['team-lead'],
      evidenceRefs: ['/tmp/replay-status.md'],
      sourceKind: 'workspace_file'
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_replay_other',
      ts: '2026-03-09T18:49:30.000Z',
      agentId: 'growth-revenue',
      eventType: 'agent_replied',
      currentState: 'coding',
      activeTask: 'Unrelated work',
      summary: 'Unrelated event should stay out of replay',
      severity: 'normal',
      correlationId: 'corr-other',
      evidenceRefs: ['/tmp/replay-other.md'],
      sourceKind: 'workspace_file'
    })
  );
}

async function countStoreLines(storeFile) {
  const content = await readFile(storeFile, 'utf8');
  return content.split('\n').filter((line) => line.trim()).length;
}

test('GET /accountability/replay rejects requests without an anchor', async (t) => {
  const { baseUrl } = await createHarness(t);

  const { response, body } = await requestJson(`${baseUrl}/accountability/replay?limit=5&window=10m`);

  assert.equal(response.status, 400);
  assert.equal(body.error, 'missing_replay_anchor');
  assert.match(body.details, /event_id, evidence_ref, correlation_id, or agent_id/);
});

test('GET /accountability/replay returns an evidence_ref-anchored replay bundle', async (t) => {
  const { baseUrl, store } = await createHarness(t);
  await seedReplaySlice(store);

  const { response, body } = await requestJson(
    `${baseUrl}/accountability/replay?evidence_ref=${encodeURIComponent('/tmp/replay-start.md')}&limit=5&window=15m`
  );

  assert.equal(response.status, 200);
  assert.equal(body.generated_at, '2026-03-09T18:50:00.000Z');
  assert.deepEqual(body.query, {
    evidence_ref: '/tmp/replay-start.md',
    limit: 5,
    window: '15m'
  });
  assert.deepEqual(body.accountability.bounded_by, {
    limit: 5,
    window: '15m'
  });
  assert.equal(body.accountability.basis, 'event_log_and_existing_read_models');
  assert.equal(body.accountability.event_count, 1);
  assert.equal(body.events[0].event_id, 'evt_replay_review_started');
  assert.ok(body.accountability.evidence_refs.includes('/tmp/replay-start.md'));
  assert.ok(body.interactions.some((item) => item.interaction_id === 'interaction:evt_replay_review_started'));
  assert.ok(
    body.ledger.some(
      (entry) =>
        entry.entry_type === 'event' &&
        entry.entry_id === 'evt_replay_review_started' &&
        entry.basis_event_ids.includes('evt_replay_review_started')
    )
  );
});

test('accountability replay ledger drops interaction basis ids that are not event-log ids', async (t) => {
  const { store } = await createHarness(t);
  await seedReplaySlice(store);
  store.listInteractions = () => [
    {
      interaction_id: 'interaction:manual-invalid-basis',
      interaction_type: 'handoff',
      correlation_id: 'corr-replay',
      started_at: '2026-03-09T18:42:00.000Z',
      ended_at: '2026-03-09T18:45:00.000Z',
      participant_agent_ids: ['app-engineering', 'protocol-engineering'],
      status: 'completed',
      severity: 'normal',
      evidence_refs: ['/tmp/replay-start.md'],
      source_kind: 'controller_event',
      summary: 'Interaction references a stale non-event id',
      related_event_ids: [
        'evt_replay_review_started',
        'not-a-real-event',
        'evt_replay_review_completed'
      ]
    }
  ];

  const bundle = store.getAccountabilityReplay({
    evidence_ref: '/tmp/replay-start.md',
    limit: 5,
    window: '15m',
    now: '2026-03-09T18:50:00.000Z'
  });
  const ledgerEntry = bundle.ledger.find(
    (entry) => entry.entry_id === 'interaction:manual-invalid-basis'
  );

  assert.deepEqual(ledgerEntry.basis_event_ids, [
    'evt_replay_review_completed',
    'evt_replay_review_started'
  ]);
  assert.ok(!ledgerEntry.basis_event_ids.includes('not-a-real-event'));
});

test('GET /accountability/replay uses real event ids for event_id anchors and stays read-only', async (t) => {
  const { baseUrl, store, storeFile } = await createHarness(t);
  await seedReplaySlice(store);
  const beforeLineCount = await countStoreLines(storeFile);

  const { response, body } = await requestJson(
    `${baseUrl}/accountability/replay?event_id=evt_replay_review_completed&limit=5&window=15m`
  );
  const afterLineCount = await countStoreLines(storeFile);

  assert.equal(response.status, 200);
  assert.equal(afterLineCount, beforeLineCount);
  assert.deepEqual(body.events.map((event) => event.event_id), ['evt_replay_review_completed']);
  assert.equal(body.memory_artifacts.length, 2);
  assert.deepEqual(
    body.ledger
      .filter((entry) => entry.entry_type === 'memory_artifact')
      .flatMap((entry) => entry.basis_event_ids)
      .sort(),
    ['evt_replay_review_completed', 'evt_replay_review_started']
  );
  assert.ok(
    body.ledger.every((entry) =>
      entry.basis_event_ids.every((eventId) =>
        [
          'evt_replay_old',
          'evt_replay_review_started',
          'evt_replay_review_completed',
          'evt_replay_agent_status',
          'evt_replay_other'
        ].includes(eventId)
      )
    )
  );
});

test('GET /accountability/replay applies correlation_id, agent_id, limit, and window bounds', async (t) => {
  const { baseUrl, store } = await createHarness(t);
  await seedReplaySlice(store);

  const { response, body } = await requestJson(
    `${baseUrl}/accountability/replay?correlation_id=corr-replay&agent_id=app-engineering&limit=1&window=10m`
  );

  assert.equal(response.status, 200);
  assert.deepEqual(body.query, {
    correlation_id: 'corr-replay',
    agent_id: 'app-engineering',
    limit: 1,
    window: '10m'
  });
  assert.deepEqual(body.events.map((event) => event.event_id), ['evt_replay_agent_status']);
  assert.deepEqual(body.interactions.map((interaction) => interaction.interaction_id), [
    'interaction:evt_replay_agent_status'
  ]);
  assert.deepEqual(body.memory_artifacts.map((artifact) => artifact.artifact_ref), [
    '/tmp/replay-status.md'
  ]);
  assert.equal(body.accountability.event_count, 1);
  assert.equal(body.accountability.interaction_count, 1);
  assert.equal(body.accountability.artifact_count, 1);
  assert.deepEqual(body.accountability.participant_agent_ids, ['app-engineering', 'team-lead']);
  assert.deepEqual(body.accountability.source_kind_buckets, {
    workspace_file: 3
  });
  assert.equal(body.accountability.first_ts, '2026-03-09T18:49:00.000Z');
  assert.equal(body.accountability.last_ts, '2026-03-09T18:49:00.000Z');
  assert.ok(!body.accountability.evidence_refs.includes('/tmp/replay-old.md'));
});
