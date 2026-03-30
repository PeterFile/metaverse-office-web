const assert = require('node:assert/strict');
const test = require('node:test');

const {
  AGENT_STATES,
  EVENT_TYPES,
  OFFICE_ZONES,
  SEED_AGENTS,
  SEVERITY_LEVELS,
  deriveAgentOverviewSeverity,
  deriveStalenessSeverity,
  getWatchEdges,
  validateEventPayload,
  validateHeartbeatPayload
} = require('../src/domain');

test('seed agents include the canonical six employees plus the team lead', () => {
  const ids = SEED_AGENTS.map((agent) => agent.agent_id);

  assert.deepEqual(ids, [
    'team-lead',
    'market-intel',
    'product-pmf',
    'tokenomics',
    'protocol-engineering',
    'app-engineering',
    'growth-revenue'
  ]);
  assert.equal(SEED_AGENTS.filter((agent) => agent.kind === 'lead').length, 1);
  assert.equal(SEED_AGENTS.filter((agent) => agent.kind === 'employee').length, 6);
  assert.ok(SEED_AGENTS.every((agent) => typeof agent.home_zone === 'string'));
});

test('domain exports canonical states, event types, and severities from the Phase 1 spec', () => {
  assert.ok(AGENT_STATES.includes('coding'));
  assert.ok(AGENT_STATES.includes('rebooting'));
  assert.ok(EVENT_TYPES.includes('peer_watch_alert_raised'));
  assert.ok(EVENT_TYPES.includes('agent_reboot_completed'));
  assert.deepEqual(SEVERITY_LEVELS, ['normal', 'yellow', 'orange', 'red']);
});

test('office overview exports zone metadata, watch edges, and staleness helpers', () => {
  assert.equal(OFFICE_ZONES.length, 11);
  assert.ok(
    OFFICE_ZONES.some(
      (zone) => zone.zone_id === 'desk-app-engineering' && zone.home_agent_id === 'app-engineering'
    )
  );
  assert.ok(
    OFFICE_ZONES.some((zone) => zone.zone_id === 'review-zone' && zone.kind === 'shared')
  );

  const watchEdges = getWatchEdges();
  assert.equal(watchEdges.length, 12);
  assert.ok(
    watchEdges.some(
      (edge) =>
        edge.from_agent_id === 'team-lead' &&
        edge.to_agent_id === 'market-intel' &&
        edge.watch_mode === 'lead'
    )
  );
  assert.ok(
    watchEdges.some(
      (edge) =>
        edge.from_agent_id === 'market-intel' &&
        edge.to_agent_id === 'product-pmf' &&
        edge.watch_mode === 'peer'
    )
  );

  assert.equal(
    deriveStalenessSeverity({
      now: '2026-03-09T18:05:00.000Z',
      lastMeaningfulOutputAt: '2026-03-09T17:46:00.000Z'
    }).severity,
    'normal'
  );
  assert.equal(
    deriveStalenessSeverity({
      now: '2026-03-09T18:05:00.000Z',
      lastMeaningfulOutputAt: '2026-03-09T17:45:00.000Z'
    }).severity,
    'yellow'
  );
  assert.equal(
    deriveStalenessSeverity({
      now: '2026-03-09T18:05:00.000Z',
      lastMeaningfulOutputAt: '2026-03-09T17:35:00.000Z'
    }).severity,
    'orange'
  );

  const timeDerived = deriveAgentOverviewSeverity({
    now: '2026-03-09T18:05:00.000Z',
    reportedSeverity: 'normal',
    lastMeaningfulOutputAt: '2026-03-09T17:35:00.000Z'
  });
  assert.equal(timeDerived.reported_severity, 'normal');
  assert.equal(timeDerived.derived_staleness.severity, 'orange');
  assert.equal(timeDerived.effective_severity, 'orange');

  const explicitRed = deriveAgentOverviewSeverity({
    now: '2026-03-09T18:05:00.000Z',
    reportedSeverity: 'red',
    lastMeaningfulOutputAt: '2026-03-09T17:35:00.000Z'
  });
  assert.equal(explicitRed.reported_severity, 'red');
  assert.equal(explicitRed.derived_staleness.severity, 'orange');
  assert.equal(explicitRed.effective_severity, 'red');
});

test('event validation rejects invalid state and actor combinations', () => {
  const invalidReboot = validateEventPayload(
    {
      event_id: 'evt_invalid_reboot',
      ts: '2026-03-09T18:00:00.000Z',
      agent_id: 'app-engineering',
      agent_role: 'app-engineering',
      event_type: 'agent_reboot_requested',
      current_state: 'planning',
      active_task: 'Fix prototype',
      summary: 'Requested a reboot',
      severity: 'orange',
      correlation_id: 'phase1',
      counterparty_agent_ids: [],
      evidence_refs: [],
      source_kind: 'controller_event',
      metadata: {}
    },
    { actorId: 'team-lead' }
  );

  assert.equal(invalidReboot.ok, false);
  assert.match(invalidReboot.errors.join(' '), /reboot/i);

  const invalidActor = validateEventPayload(
    {
      event_id: 'evt_invalid_actor',
      ts: '2026-03-09T18:01:00.000Z',
      agent_id: 'tokenomics',
      agent_role: 'tokenomics',
      event_type: 'agent_wrote_file',
      current_state: 'coding',
      active_task: 'Write backend notes',
      summary: 'Changed tokenomics files',
      severity: 'normal',
      correlation_id: 'phase1',
      counterparty_agent_ids: [],
      evidence_refs: [],
      source_kind: 'workspace_file',
      metadata: {}
    },
    { actorId: 'product-pmf' }
  );

  assert.equal(invalidActor.ok, false);
  assert.match(invalidActor.errors.join(' '), /self-scoped/i);
});

test('event validation allows team lead to dispatch cross-agent task events', () => {
  const result = validateEventPayload(
    {
      event_id: 'evt_task_dispatch',
      ts: '2026-03-09T18:01:00.000Z',
      agent_id: 'app-engineering',
      agent_role: 'app-engineering',
      event_type: 'agent_received_task',
      current_state: 'planning',
      active_task: 'Investigate controller queue drift',
      summary: 'Team lead dispatched a controller follow-up task',
      severity: 'normal',
      correlation_id: 'phase1-task-dispatch',
      counterparty_agent_ids: ['team-lead'],
      evidence_refs: [],
      source_kind: 'controller_event',
      metadata: {}
    },
    { actorId: 'team-lead' }
  );

  assert.equal(result.ok, true);
  assert.equal(result.value.actor_id, 'team-lead');
  assert.equal(result.value.location, 'desk-app-engineering');
});

test('event validation still rejects employee cross-agent task dispatch', () => {
  const result = validateEventPayload(
    {
      event_id: 'evt_employee_task_dispatch',
      ts: '2026-03-09T18:01:30.000Z',
      agent_id: 'app-engineering',
      agent_role: 'app-engineering',
      event_type: 'agent_received_task',
      current_state: 'planning',
      active_task: 'Investigate controller queue drift',
      summary: 'Market intel tried to dispatch app engineering work',
      severity: 'normal',
      correlation_id: 'phase1-task-dispatch',
      counterparty_agent_ids: ['team-lead'],
      evidence_refs: [],
      source_kind: 'controller_event',
      metadata: {}
    },
    { actorId: 'market-intel' }
  );

  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /self-scoped/i);
});

test('event validation allows peer watch alerts from non-blocked work states', () => {
  const result = validateEventPayload(
    {
      event_id: 'evt_stale_yellow',
      ts: '2026-03-09T18:05:00.000Z',
      agent_id: 'market-intel',
      agent_role: 'market-intel',
      event_type: 'peer_watch_alert_raised',
      current_state: 'researching',
      active_task: 'Review competitor notes',
      summary: 'Collector observed yellow staleness since 2026-03-09T17:45:00.000Z',
      severity: 'yellow',
      correlation_id: 'collector-snapshot:2026-03-09T18:05:00.000Z',
      counterparty_agent_ids: ['growth-revenue'],
      evidence_refs: ['/tmp/market-intel/outbox.md'],
      source_kind: 'controller_event',
      metadata: {
        collector_derived: true
      }
    },
    { actorId: 'team-lead' }
  );

  assert.equal(result.ok, true);
  assert.equal(result.value.location, 'review-zone');
});

test('heartbeat validation accepts canonical payloads', () => {
  const result = validateHeartbeatPayload(
    {
      agent_id: 'app-engineering',
      current_state: 'coding',
      active_task: 'Implement HTTP handlers',
      last_meaningful_output_at: '2026-03-09T18:02:00.000Z',
      last_file_write_at: '2026-03-09T18:02:00.000Z',
      current_blocker: '',
      confidence_level: 'high',
      reboot_recommended: false
    },
    { actorId: 'app-engineering' }
  );

  assert.equal(result.ok, true);
  assert.equal(result.value.current_location, 'desk-app-engineering');
});
