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

async function seedReplayFacetSlice(store) {
  await store.appendEvent(
    createEvent({
      eventId: 'evt_replay_facets_controller_latest',
      ts: '2026-03-09T18:49:00.000Z',
      eventType: 'agent_replied',
      currentState: 'coding',
      activeTask: 'Patch replay facets',
      summary: 'Controller event should be filtered out by source kind',
      correlationId: 'corr-replay-facets',
      counterpartyAgentIds: ['team-lead'],
      evidenceRefs: ['/tmp/replay-facets/controller.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_replay_facets_workspace_todo',
      ts: '2026-03-09T18:48:30.000Z',
      eventType: 'agent_replied',
      currentState: 'coding',
      activeTask: 'Patch replay facets',
      summary: 'Workspace todo artifact is newer but has the wrong artifact kind',
      correlationId: 'corr-replay-facets',
      counterpartyAgentIds: ['team-lead'],
      evidenceRefs: ['/tmp/replay-facets/todo.md'],
      sourceKind: 'workspace_file'
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_replay_facets_workspace_evidence',
      ts: '2026-03-09T18:48:00.000Z',
      eventType: 'agent_replied',
      currentState: 'coding',
      activeTask: 'Patch replay facets',
      summary: 'Workspace evidence artifact survives replay facet filters',
      correlationId: 'corr-replay-facets',
      counterpartyAgentIds: ['team-lead'],
      evidenceRefs: ['/tmp/replay-facets/evidence.md'],
      sourceKind: 'workspace_file'
    })
  );
}

function createReplayEvidenceCollectorReport({
  evidenceRef,
  collectedAt = '2026-03-09T18:46:00.000Z',
  observedAt = '2026-03-09T18:45:30.000Z'
}) {
  return {
    collected_at: collectedAt,
    actor_id: 'team-lead',
    summary: {
      agent_count: 1,
      heartbeat_count: 0,
      tmux_observed_count: 0,
      workspace_observed_count: 1,
      reboot_recommended_count: 0
    },
    evidence_coverage: {
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
          latest_evidence_at: observedAt,
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
        evidence_refs: [evidenceRef],
        workspace_observations: [
          {
            path: evidenceRef,
            file_name: path.basename(evidenceRef),
            kind: 'workspace_file',
            evidence_role: 'agent_output',
            last_modified_at: observedAt
          }
        ],
        tmux_observations: [],
        source_health: {
          workspace_files: {
            status: 'observed',
            expected_files: [path.basename(evidenceRef)],
            observed_count: 1,
            missing_count: 0,
            error_count: 0,
            last_observed_at: observedAt,
            degraded_reasons: []
          }
        }
      }
    ]
  };
}

async function countStoreLines(storeFile) {
  const content = await readFile(storeFile, 'utf8');
  return content.split('\n').filter((line) => line.trim()).length;
}

function assertBodyDoesNotContain(body, fragments) {
  const serialized = JSON.stringify(body);
  for (const fragment of fragments) {
    assert.equal(serialized.includes(fragment), false, fragment);
  }
}

test('GET /accountability/replay rejects requests without an anchor', async (t) => {
  const { baseUrl } = await createHarness(t);

  const { response, body } = await requestJson(`${baseUrl}/accountability/replay?limit=5&window=10m`);

  assert.equal(response.status, 400);
  assert.equal(body.error, 'missing_replay_anchor');
  assert.match(body.details, /event_id, evidence_id, evidence_ref, correlation_id, or agent_id/);
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

test('GET /accountability/replay returns an empty no-echo bundle for unknown hostile anchors', async (t) => {
  const { baseUrl, store, storeFile } = await createHarness(t);
  await seedReplaySlice(store);
  const beforeLineCount = await countStoreLines(storeFile);
  const unknownEvidenceId = 'unknown-evidence-/tmp/replay-secret-token';
  const unknownAgentId = 'unknown-agent-tmux://private-session/0.0';
  const unknownCorrelationId = 'unknown-correlation-hermes://session/private';

  for (const params of [
    new URLSearchParams({ evidence_id: unknownEvidenceId, limit: '5', window: '15m' }),
    new URLSearchParams({ agent_id: unknownAgentId, limit: '5', window: '15m' }),
    new URLSearchParams({ correlation_id: unknownCorrelationId, limit: '5', window: '15m' })
  ]) {
    const { response, body } = await requestJson(`${baseUrl}/accountability/replay?${params}`);

    assert.equal(response.status, 200);
    assert.deepEqual(body.events, []);
    assert.deepEqual(body.interactions, []);
    assert.deepEqual(body.memory_artifacts, []);
    assert.deepEqual(body.ledger, []);
    assert.equal(body.accountability.event_count, 0);
    assert.equal(body.accountability.interaction_count, 0);
    assert.equal(body.accountability.artifact_count, 0);
    assert.deepEqual(body.accountability.evidence_refs, []);
    if (params.has('evidence_id')) {
      assert.deepEqual(body.replay_audit, {
        evidence_id_status: 'unknown_evidence_id',
        event_count: 0,
        interaction_count: 0,
        artifact_count: 0,
        ledger_entry_count: 0,
        anchor_event_count: 0,
        anchor_event_ids: []
      });
    }
    assertBodyDoesNotContain(body, [
      unknownEvidenceId,
      unknownAgentId,
      unknownCorrelationId,
      '/tmp/replay-secret-token',
      'tmux://private-session/0.0',
      'hermes://session/private'
    ]);
  }

  const afterLineCount = await countStoreLines(storeFile);
  assert.equal(afterLineCount, beforeLineCount);
});

test('GET /accountability/replay audits collector-only evidence_id anchors without event ids', async (t) => {
  const { baseUrl, store } = await createHarness(t);
  await store.appendCollectorReport(
    createReplayEvidenceCollectorReport({
      evidenceRef: '/tmp/replay-collector-only.md'
    })
  );
  const evidenceRecord = store.listEvidenceRecords({
    evidence_ref: '/tmp/replay-collector-only.md'
  })[0];

  const { response, body } = await requestJson(
    `${baseUrl}/accountability/replay?evidence_id=${encodeURIComponent(evidenceRecord.evidence_id)}&limit=5&window=15m`
  );

  assert.equal(response.status, 200);
  assert.deepEqual(body.events, []);
  assert.equal(body.memory_artifacts.length, 1);
  assert.equal(body.replay_audit.evidence_id_status, 'collector_only');
  assert.equal(body.replay_audit.event_count, 0);
  assert.equal(body.replay_audit.artifact_count, 1);
  assert.deepEqual(body.replay_audit.anchor_event_ids, []);
  assert.equal(JSON.stringify(body.replay_audit).includes('/tmp/replay-collector-only.md'), false);
  assert.equal(JSON.stringify(body.replay_audit).includes('degraded'), false);
});

test('GET /accountability/replay audits event-backed evidence_id anchors with safe event ids', async (t) => {
  const { baseUrl, store } = await createHarness(t);
  await store.appendCollectorReport(
    createReplayEvidenceCollectorReport({
      evidenceRef: '/tmp/replay-start.md'
    })
  );
  const evidenceRecord = store.listEvidenceRecords({
    evidence_ref: '/tmp/replay-start.md'
  })[0];
  await store.appendEvent(
    createEvent({
      eventId: 'evt_replay_evidence_backed',
      ts: '2026-03-09T18:47:00.000Z',
      eventType: 'review_started',
      currentState: 'reviewing',
      activeTask: 'Review replay bundle',
      summary: 'Evidence record has a real replay event',
      severity: 'yellow',
      correlationId: evidenceRecord.correlation_id,
      evidenceRefs: ['/tmp/replay-start.md']
    })
  );

  const { response, body } = await requestJson(
    `${baseUrl}/accountability/replay?evidence_id=${encodeURIComponent(evidenceRecord.evidence_id)}&limit=5&window=15m`
  );

  assert.equal(response.status, 200);
  assert.equal(body.events.length, 1);
  assert.equal(body.replay_audit.evidence_id_status, 'event_backed');
  assert.deepEqual(body.replay_audit.anchor_event_ids, ['evt_replay_evidence_backed']);
  assert.equal(body.replay_audit.anchor_event_count, 1);
  assert.equal(JSON.stringify(body.replay_audit).includes('/tmp/replay-start.md'), false);
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

test('accountability replay ledger canonicalizes noisy interaction basis ids', async (t) => {
  const { store } = await createHarness(t);
  await seedReplaySlice(store);
  store.listInteractions = () => [
    {
      interaction_id: 'interaction:manual-noisy-basis',
      interaction_type: 'handoff',
      correlation_id: 'corr-replay',
      started_at: '2026-03-09T18:42:00.000Z',
      ended_at: '2026-03-09T18:45:00.000Z',
      participant_agent_ids: ['app-engineering', 'protocol-engineering'],
      status: 'completed',
      severity: 'normal',
      evidence_refs: ['/tmp/replay-start.md'],
      source_kind: 'controller_event',
      summary: 'Interaction carries noisy related event ids',
      related_event_ids: [
        ' evt_replay_review_started ',
        'evt_replay_review_started',
        '',
        '   ',
        42,
        null,
        'not-a-real-event',
        ' evt_replay_review_completed '
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
    (entry) => entry.entry_id === 'interaction:manual-noisy-basis'
  );

  assert.deepEqual(ledgerEntry.basis_event_ids, [
    'evt_replay_review_completed',
    'evt_replay_review_started'
  ]);
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

test('accountability replay ledger canonicalizes memory artifact latest event ids', async (t) => {
  const { store } = await createHarness(t);
  await seedReplaySlice(store);
  store.listMemoryArtifacts = () => [
    {
      artifact_ref: '/tmp/replay-padded-memory.md',
      artifact_kind: 'evidence_ref',
      file_name: 'replay-padded-memory.md',
      first_seen_at: '2026-03-09T18:45:00.000Z',
      last_seen_at: '2026-03-09T18:45:00.000Z',
      mention_count: 1,
      agent_ids: ['protocol-engineering'],
      correlation_ids: ['corr-replay'],
      source_kinds: ['workspace_file'],
      latest_summary: 'Padded memory artifact latest event id',
      latest_event_type: 'review_completed',
      latest_event_id: ' evt_replay_review_completed ',
      collector_last_modified_at: null
    },
    {
      artifact_ref: '/tmp/replay-blank-memory.md',
      artifact_kind: 'evidence_ref',
      file_name: 'replay-blank-memory.md',
      first_seen_at: '2026-03-09T18:44:00.000Z',
      last_seen_at: '2026-03-09T18:44:00.000Z',
      mention_count: 1,
      agent_ids: ['app-engineering'],
      correlation_ids: ['corr-replay'],
      source_kinds: ['controller_snapshot'],
      latest_summary: null,
      latest_event_type: null,
      latest_event_id: '   ',
      collector_last_modified_at: '2026-03-09T18:44:00.000Z'
    },
    {
      artifact_ref: '/tmp/replay-nonexistent-memory.md',
      artifact_kind: 'evidence_ref',
      file_name: 'replay-nonexistent-memory.md',
      first_seen_at: '2026-03-09T18:43:00.000Z',
      last_seen_at: '2026-03-09T18:43:00.000Z',
      mention_count: 1,
      agent_ids: ['app-engineering'],
      correlation_ids: ['corr-replay'],
      source_kinds: ['controller_snapshot'],
      latest_summary: null,
      latest_event_type: null,
      latest_event_id: 'not-a-real-event',
      collector_last_modified_at: '2026-03-09T18:43:00.000Z'
    }
  ];

  const bundle = store.getAccountabilityReplay({
    evidence_ref: '/tmp/replay-start.md',
    limit: 5,
    window: '15m',
    now: '2026-03-09T18:50:00.000Z'
  });
  const artifactEntries = new Map(
    bundle.ledger
      .filter((entry) => entry.entry_type === 'memory_artifact')
      .map((entry) => [entry.entry_id, entry])
  );

  assert.deepEqual(
    artifactEntries.get('/tmp/replay-padded-memory.md').basis_event_ids,
    ['evt_replay_review_completed']
  );
  assert.equal(
    artifactEntries.get('/tmp/replay-padded-memory.md').provenance,
    'event_backed_artifact'
  );
  assert.deepEqual(artifactEntries.get('/tmp/replay-blank-memory.md').basis_event_ids, []);
  assert.equal(
    artifactEntries.get('/tmp/replay-blank-memory.md').provenance,
    'collector_observation_without_event_id'
  );
  assert.deepEqual(artifactEntries.get('/tmp/replay-nonexistent-memory.md').basis_event_ids, []);
  assert.equal(
    artifactEntries.get('/tmp/replay-nonexistent-memory.md').provenance,
    'collector_observation_without_event_id'
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

test('GET /accountability/replay accepts evidence facets and filters memory artifacts before limit', async (t) => {
  const { baseUrl, store, storeFile } = await createHarness(t);
  await seedReplayFacetSlice(store);
  const beforeLineCount = await countStoreLines(storeFile);
  let mutationCallCount = 0;

  for (const methodName of ['appendEvent', 'appendHeartbeat', 'appendCollectorReport']) {
    const originalMethod = store[methodName].bind(store);
    store[methodName] = async (...args) => {
      mutationCallCount += 1;
      return originalMethod(...args);
    };
  }

  const { response, body } = await requestJson(
    `${baseUrl}/accountability/replay?correlation_id=corr-replay-facets&source_kind=${encodeURIComponent(' workspace_file ')}&artifact_kind=${encodeURIComponent(' evidence_ref ')}&limit=1&window=15m`
  );
  const afterLineCount = await countStoreLines(storeFile);

  assert.equal(response.status, 200);
  assert.equal(afterLineCount, beforeLineCount);
  assert.equal(mutationCallCount, 0);
  assert.deepEqual(body.query, {
    correlation_id: 'corr-replay-facets',
    source_kind: 'workspace_file',
    artifact_kind: 'evidence_ref',
    limit: 1,
    window: '15m'
  });
  assert.deepEqual(body.events.map((event) => event.event_id), [
    'evt_replay_facets_workspace_todo'
  ]);
  assert.ok(body.events.every((event) => event.source_kind === 'workspace_file'));
  assert.deepEqual(body.memory_artifacts.map((artifact) => artifact.artifact_ref), [
    '/tmp/replay-facets/evidence.md'
  ]);
  assert.equal(body.memory_artifacts[0].artifact_kind, 'evidence_ref');
  assert.deepEqual(body.memory_artifacts[0].source_kinds, ['workspace_file']);
});
