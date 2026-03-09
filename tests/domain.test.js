const assert = require('node:assert/strict');
const test = require('node:test');

const {
  AGENT_STATES,
  EVENT_TYPES,
  SEED_AGENTS,
  SEVERITY_LEVELS,
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
