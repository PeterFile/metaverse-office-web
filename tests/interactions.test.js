const assert = require('node:assert/strict');
const { mkdtemp } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createPrototypeStore } = require('../src/store/prototype-store');

async function createStore() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'metaverse-office-interactions-'));
  return createPrototypeStore({
    filePath: path.join(root, 'prototype-store.jsonl')
  });
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
    location: 'desk-app-engineering',
    summary,
    severity,
    correlation_id: correlationId,
    counterparty_agent_ids: counterpartyAgentIds,
    evidence_refs: evidenceRefs,
    source_kind: sourceKind,
    metadata
  };
}

test('store derives paired and single-event interactions with filters', async () => {
  const store = await createStore();

  await store.appendEvent(
    createEvent({
      eventId: 'evt_review_started',
      ts: '2026-03-09T18:00:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_started',
      currentState: 'reviewing',
      activeTask: 'Review interaction read model',
      summary: 'Lead started the backend review',
      severity: 'yellow',
      correlationId: 'review-123',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/review-start.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_review_completed',
      ts: '2026-03-09T18:05:00.000Z',
      agentId: 'app-engineering',
      actorId: 'team-lead',
      eventType: 'review_completed',
      currentState: 'reviewing',
      activeTask: 'Review interaction read model',
      summary: 'Lead completed the backend review',
      severity: 'normal',
      correlationId: 'review-123',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/review-complete.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_peer_watch_raised',
      ts: '2026-03-09T18:06:00.000Z',
      agentId: 'growth-revenue',
      actorId: 'team-lead',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Investigate missing handoff note',
      summary: 'Peer watch raised a blocker alert',
      severity: 'orange',
      correlationId: 'peer-watch-1',
      counterpartyAgentIds: ['app-engineering'],
      evidenceRefs: ['/tmp/peer-watch.md']
    })
  );

  const interactions = store.listInteractions({
    now: '2026-03-09T18:07:00.000Z'
  });

  assert.equal(interactions.length, 2);

  const review = interactions.find((item) => item.interaction_type === 'review');
  assert.deepEqual(review, {
    interaction_id: 'interaction:evt_review_started',
    interaction_type: 'review',
    correlation_id: 'review-123',
    started_at: '2026-03-09T18:00:00.000Z',
    ended_at: '2026-03-09T18:05:00.000Z',
    participant_agent_ids: ['app-engineering', 'protocol-engineering', 'team-lead'],
    trigger_event_id: 'evt_review_started',
    before_state: 'reviewing',
    after_state: 'reviewing',
    severity: 'yellow',
    evidence_refs: ['/tmp/review-start.md', '/tmp/review-complete.md'],
    summary: 'Lead completed the backend review',
    related_event_ids: ['evt_review_started', 'evt_review_completed']
  });

  const peerWatch = interactions.find((item) => item.interaction_type === 'peer_watch');
  assert.equal(peerWatch.ended_at, null);
  assert.equal(peerWatch.trigger_event_id, 'evt_peer_watch_raised');
  assert.equal(peerWatch.before_state, 'blocked');
  assert.equal(peerWatch.after_state, null);
  assert.deepEqual(peerWatch.related_event_ids, ['evt_peer_watch_raised']);

  assert.deepEqual(
    store.listInteractions({
      interaction_type: 'review',
      counterparty_agent_id: 'protocol-engineering',
      correlation_id: 'review-123',
      limit: '1',
      now: '2026-03-09T18:07:00.000Z'
    }),
    [review]
  );

  assert.deepEqual(
    store.listInteractions({
      severity: 'orange',
      window: '1m',
      now: '2026-03-09T18:07:00.000Z'
    }),
    [peerWatch]
  );

  assert.deepEqual(
    store.listAgentInteractions('app-engineering', {
      counterparty_agent_id: 'protocol-engineering',
      interaction_type: 'review',
      now: '2026-03-09T18:07:00.000Z'
    }),
    [review]
  );
});

test('store emits single-event interactions when correlation matches but participant lineage does not', async () => {
  const store = await createStore();

  await store.appendEvent(
    createEvent({
      eventId: 'evt_question',
      ts: '2026-03-09T18:10:00.000Z',
      agentId: 'app-engineering',
      eventType: 'agent_asked_question',
      currentState: 'planning',
      activeTask: 'Clarify API contract',
      summary: 'Asked protocol engineering about interaction shape',
      correlationId: 'question-1',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/question.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_reply_mismatch',
      ts: '2026-03-09T18:11:00.000Z',
      agentId: 'growth-revenue',
      eventType: 'agent_replied',
      currentState: 'planning',
      activeTask: 'Clarify API contract',
      summary: 'Replied on a different thread lineage',
      correlationId: 'question-1',
      counterpartyAgentIds: ['app-engineering'],
      evidenceRefs: ['/tmp/reply.md']
    })
  );

  const interactions = store.listInteractions({
    now: '2026-03-09T18:12:00.000Z'
  });

  assert.equal(interactions.length, 2);
  assert.ok(interactions.every((item) => item.interaction_type === 'question_reply'));
  assert.ok(interactions.every((item) => item.related_event_ids.length === 1));
  assert.ok(interactions.every((item) => item.ended_at === null || item.ended_at === item.started_at));
});
