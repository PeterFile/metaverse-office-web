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

test('event validation rejects self-scoped employee controller events', () => {
  const result = validateEventPayload(
    {
      event_id: 'evt_employee_controller_source',
      ts: '2026-03-09T18:02:00.000Z',
      agent_id: 'app-engineering',
      agent_role: 'app-engineering',
      event_type: 'agent_wrote_file',
      current_state: 'coding',
      active_task: 'Write backend notes',
      summary: 'Employee tried to emit controller-sourced provenance',
      severity: 'normal',
      correlation_id: 'phase1-source-boundary',
      counterparty_agent_ids: [],
      evidence_refs: ['/tmp/app-engineering/outbox.md'],
      source_kind: 'controller_event',
      metadata: {}
    },
    { actorId: 'app-engineering' }
  );

  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /controller_event.*team lead/i);
});

test('event validation rejects blank evidence refs even when another ref is valid', () => {
  for (const evidenceRefs of [
    ['   ', '/tmp/app-engineering/outbox.md'],
    ['/tmp/app-engineering/outbox.md', '\t']
  ]) {
    const result = validateEventPayload(
      {
        event_id: 'evt_blank_evidence_ref',
        ts: '2026-03-09T18:02:00.000Z',
        agent_id: 'app-engineering',
        agent_role: 'app-engineering',
        event_type: 'agent_wrote_file',
        current_state: 'coding',
        active_task: 'Write backend notes',
        summary: 'Evidence refs include a blank entry',
        severity: 'normal',
        correlation_id: 'phase1-source-boundary',
        counterparty_agent_ids: [],
        evidence_refs: evidenceRefs,
        source_kind: 'workspace_file',
        metadata: {}
      },
      { actorId: 'app-engineering' }
    );

    assert.equal(result.ok, false);
    assert.match(result.errors.join(' '), /evidence_refs.*blank/i);
  }
});

test('event validation rejects evidence refs with surrounding whitespace', () => {
  for (const payload of [
    {
      event_id: 'evt_workspace_padded_evidence_ref',
      ts: '2026-03-09T18:02:00.000Z',
      agent_id: 'app-engineering',
      agent_role: 'app-engineering',
      event_type: 'agent_wrote_file',
      current_state: 'coding',
      active_task: 'Write backend notes',
      summary: 'Workspace source with padded evidence ref',
      severity: 'normal',
      correlation_id: 'phase1-source-boundary',
      counterparty_agent_ids: [],
      evidence_refs: [' /tmp/app-engineering/outbox.md '],
      source_kind: 'workspace_file',
      metadata: {}
    },
    {
      event_id: 'evt_raw_transcript_padded_evidence_ref',
      ts: '2026-03-09T18:02:00.000Z',
      agent_id: 'app-engineering',
      agent_role: 'app-engineering',
      event_type: 'agent_replied',
      current_state: 'planning',
      active_task: 'Reply in planning thread',
      summary: 'Transcript source with padded evidence ref',
      severity: 'normal',
      correlation_id: 'phase1-source-boundary',
      counterparty_agent_ids: ['team-lead'],
      evidence_refs: [' transcript://abc '],
      source_kind: 'raw_transcript',
      metadata: {}
    }
  ]) {
    const result = validateEventPayload(payload, { actorId: 'app-engineering' });

    assert.equal(result.ok, false);
    assert.match(result.errors.join(' '), /evidence_refs.*whitespace/i);
  }
});

test('event validation rejects non-string evidence refs even when source refs are valid', () => {
  for (const { actorId, payload } of [
    {
      actorId: 'app-engineering',
      payload: {
        event_id: 'evt_workspace_non_string_evidence_ref',
        ts: '2026-03-09T18:02:00.000Z',
        agent_id: 'app-engineering',
        agent_role: 'app-engineering',
        event_type: 'agent_wrote_file',
        current_state: 'coding',
        active_task: 'Write backend notes',
        summary: 'Workspace source includes a non-string evidence ref',
        severity: 'normal',
        correlation_id: 'phase1-source-boundary',
        counterparty_agent_ids: [],
        evidence_refs: ['/tmp/probe.md', 123],
        source_kind: 'workspace_file',
        metadata: {}
      }
    },
    {
      actorId: 'app-engineering',
      payload: {
        event_id: 'evt_tmux_non_string_evidence_ref',
        ts: '2026-03-09T18:02:00.000Z',
        agent_id: 'app-engineering',
        agent_role: 'app-engineering',
        event_type: 'agent_state_changed',
        current_state: 'blocked',
        active_task: 'Investigate stalled pane',
        summary: 'Tmux source includes a non-string evidence ref',
        severity: 'orange',
        correlation_id: 'phase1-source-boundary',
        counterparty_agent_ids: [],
        evidence_refs: ['tmux://%11', 123],
        source_kind: 'tmux_observation',
        metadata: {}
      }
    },
    {
      actorId: 'app-engineering',
      payload: {
        event_id: 'evt_raw_transcript_non_string_evidence_ref',
        ts: '2026-03-09T18:02:00.000Z',
        agent_id: 'app-engineering',
        agent_role: 'app-engineering',
        event_type: 'agent_replied',
        current_state: 'planning',
        active_task: 'Reply in planning thread',
        summary: 'Transcript source includes a non-string evidence ref',
        severity: 'normal',
        correlation_id: 'phase1-source-boundary',
        counterparty_agent_ids: ['team-lead'],
        evidence_refs: ['transcript://abc', 123],
        source_kind: 'raw_transcript',
        metadata: {}
      }
    },
    {
      actorId: 'team-lead',
      payload: {
        event_id: 'evt_controller_non_string_evidence_ref',
        ts: '2026-03-09T18:02:00.000Z',
        agent_id: 'app-engineering',
        agent_role: 'app-engineering',
        event_type: 'agent_received_task',
        current_state: 'planning',
        active_task: 'Investigate controller queue drift',
        summary: 'Controller source includes a non-string evidence ref',
        severity: 'normal',
        correlation_id: 'phase1-source-boundary',
        counterparty_agent_ids: ['team-lead'],
        evidence_refs: [123],
        source_kind: 'controller_event',
        metadata: {}
      }
    }
  ]) {
    const result = validateEventPayload(payload, { actorId });

    assert.equal(result.ok, false);
    assert.match(result.errors.join(' '), /evidence_refs.*strings/i);
  }
});

test('event validation binds workspace_file source to non-tmux evidence refs', () => {
  const missingEvidence = validateEventPayload(
    {
      event_id: 'evt_workspace_missing_ref',
      ts: '2026-03-09T18:02:00.000Z',
      agent_id: 'app-engineering',
      agent_role: 'app-engineering',
      event_type: 'agent_wrote_file',
      current_state: 'coding',
      active_task: 'Write backend notes',
      summary: 'Workspace source without artifact ref',
      severity: 'normal',
      correlation_id: 'phase1-source-boundary',
      counterparty_agent_ids: [],
      evidence_refs: [],
      source_kind: 'workspace_file',
      metadata: {
        file_path: '/tmp/app-engineering/outbox.md'
      }
    },
    { actorId: 'app-engineering' }
  );

  assert.equal(missingEvidence.ok, false);
  assert.match(missingEvidence.errors.join(' '), /workspace_file.*evidence_ref/i);

  const tmuxOnlyEvidence = validateEventPayload(
    {
      event_id: 'evt_workspace_tmux_ref',
      ts: '2026-03-09T18:02:00.000Z',
      agent_id: 'app-engineering',
      agent_role: 'app-engineering',
      event_type: 'agent_wrote_file',
      current_state: 'coding',
      active_task: 'Write backend notes',
      summary: 'Workspace source with tmux-only ref',
      severity: 'normal',
      correlation_id: 'phase1-source-boundary',
      counterparty_agent_ids: [],
      evidence_refs: ['tmux://5-web3-app-engineering/0.1'],
      source_kind: 'workspace_file',
      metadata: {}
    },
    { actorId: 'app-engineering' }
  );

  assert.equal(tmuxOnlyEvidence.ok, false);
  assert.match(tmuxOnlyEvidence.errors.join(' '), /workspace_file.*non-tmux/i);

  const mixedTmuxEvidence = validateEventPayload(
    {
      event_id: 'evt_workspace_mixed_tmux_ref',
      ts: '2026-03-09T18:02:00.000Z',
      agent_id: 'app-engineering',
      agent_role: 'app-engineering',
      event_type: 'agent_wrote_file',
      current_state: 'coding',
      active_task: 'Write backend notes',
      summary: 'Workspace source with mixed tmux and file refs',
      severity: 'normal',
      correlation_id: 'phase1-source-boundary',
      counterparty_agent_ids: [],
      evidence_refs: ['/tmp/app-engineering/outbox.md', 'tmux://5-web3-app-engineering/0.1'],
      source_kind: 'workspace_file',
      metadata: {}
    },
    { actorId: 'app-engineering' }
  );

  assert.equal(mixedTmuxEvidence.ok, false);
  assert.match(mixedTmuxEvidence.errors.join(' '), /workspace_file.*tmux/i);

  const mixedPaneIdTmuxEvidence = validateEventPayload(
    {
      event_id: 'evt_workspace_mixed_pane_id_tmux_ref',
      ts: '2026-03-09T18:02:00.000Z',
      agent_id: 'app-engineering',
      agent_role: 'app-engineering',
      event_type: 'agent_wrote_file',
      current_state: 'coding',
      active_task: 'Write backend notes',
      summary: 'Workspace source with mixed pane-id tmux and file refs',
      severity: 'normal',
      correlation_id: 'phase1-source-boundary',
      counterparty_agent_ids: [],
      evidence_refs: ['/tmp/app-engineering/outbox.md', 'tmux://%11'],
      source_kind: 'workspace_file',
      metadata: {}
    },
    { actorId: 'app-engineering' }
  );

  assert.equal(mixedPaneIdTmuxEvidence.ok, false);
  assert.match(mixedPaneIdTmuxEvidence.errors.join(' '), /workspace_file.*tmux/i);
});

test('event validation binds tmux_observation source to tmux evidence refs', () => {
  const result = validateEventPayload(
    {
      event_id: 'evt_tmux_missing_ref',
      ts: '2026-03-09T18:02:00.000Z',
      agent_id: 'app-engineering',
      agent_role: 'app-engineering',
      event_type: 'agent_state_changed',
      current_state: 'blocked',
      active_task: 'Investigate stalled pane',
      summary: 'Tmux source without tmux ref',
      severity: 'orange',
      correlation_id: 'phase1-source-boundary',
      counterparty_agent_ids: [],
      evidence_refs: ['/tmp/app-engineering/outbox.md'],
      source_kind: 'tmux_observation',
      metadata: {}
    },
    { actorId: 'app-engineering' }
  );

  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /tmux_observation.*tmux:\/\/ evidence_ref/i);

  for (const evidenceRef of [
    'tmux://',
    'tmux://session',
    'tmux://5-web3-app-engineering/null.undefined',
    ' tmux://5-web3-app-engineering/0.1',
    'tmux://5-web3-app-engineering/0.1 '
  ]) {
    const invalidShape = validateEventPayload(
      {
        event_id: 'evt_tmux_invalid_ref_shape',
        ts: '2026-03-09T18:02:00.000Z',
        agent_id: 'app-engineering',
        agent_role: 'app-engineering',
        event_type: 'agent_state_changed',
        current_state: 'blocked',
        active_task: 'Investigate stalled pane',
        summary: 'Tmux source with invalid pane ref shape',
        severity: 'orange',
        correlation_id: 'phase1-source-boundary',
        counterparty_agent_ids: [],
        evidence_refs: [evidenceRef],
        source_kind: 'tmux_observation',
        metadata: {}
      },
      { actorId: 'app-engineering' }
    );

    assert.equal(invalidShape.ok, false);
    assert.match(invalidShape.errors.join(' '), /tmux_observation.*canonical tmux/i);
  }

  const storePreservedTmuxEvidence = validateEventPayload(
    {
      event_id: 'evt_tmux_store_preserved_ref',
      ts: '2026-03-09T18:02:00.000Z',
      agent_id: 'app-engineering',
      agent_role: 'app-engineering',
      event_type: 'agent_state_changed',
      current_state: 'blocked',
      active_task: 'Investigate stalled pane',
      summary: 'Tmux source with store-preserved pane ref',
      severity: 'orange',
      correlation_id: 'phase1-source-boundary',
      counterparty_agent_ids: [],
      evidence_refs: ['tmux://5-web3-app-engineering/0'],
      source_kind: 'tmux_observation',
      metadata: {}
    },
    { actorId: 'app-engineering' }
  );

  assert.equal(storePreservedTmuxEvidence.ok, true);
  assert.deepEqual(storePreservedTmuxEvidence.value.evidence_refs, ['tmux://5-web3-app-engineering/0']);

  const paneIdFallback = validateEventPayload(
    {
      event_id: 'evt_tmux_pane_id_ref',
      ts: '2026-03-09T18:02:00.000Z',
      agent_id: 'app-engineering',
      agent_role: 'app-engineering',
      event_type: 'agent_state_changed',
      current_state: 'blocked',
      active_task: 'Investigate stalled pane',
      summary: 'Tmux source with pane-id fallback ref',
      severity: 'orange',
      correlation_id: 'phase1-source-boundary',
      counterparty_agent_ids: [],
      evidence_refs: ['tmux://%11'],
      source_kind: 'tmux_observation',
      metadata: {}
    },
    { actorId: 'app-engineering' }
  );

  assert.equal(paneIdFallback.ok, true);
  assert.deepEqual(paneIdFallback.value.evidence_refs, ['tmux://%11']);

  const mixedFileEvidence = validateEventPayload(
    {
      event_id: 'evt_tmux_mixed_file_ref',
      ts: '2026-03-09T18:02:00.000Z',
      agent_id: 'app-engineering',
      agent_role: 'app-engineering',
      event_type: 'agent_state_changed',
      current_state: 'blocked',
      active_task: 'Investigate stalled pane',
      summary: 'Tmux source with mixed pane and file refs',
      severity: 'orange',
      correlation_id: 'phase1-source-boundary',
      counterparty_agent_ids: [],
      evidence_refs: ['tmux://5-web3-app-engineering/0.1', '/tmp/app-engineering/outbox.md'],
      source_kind: 'tmux_observation',
      metadata: {}
    },
    { actorId: 'app-engineering' }
  );

  assert.equal(mixedFileEvidence.ok, false);
  assert.match(mixedFileEvidence.errors.join(' '), /tmux_observation.*only.*tmux/i);

  const paddedTmuxEvidence = validateEventPayload(
    {
      event_id: 'evt_tmux_padded_ref',
      ts: '2026-03-09T18:02:00.000Z',
      agent_id: 'app-engineering',
      agent_role: 'app-engineering',
      event_type: 'agent_state_changed',
      current_state: 'blocked',
      active_task: 'Investigate stalled pane',
      summary: 'Tmux source with padded pane ref',
      severity: 'orange',
      correlation_id: 'phase1-source-boundary',
      counterparty_agent_ids: [],
      evidence_refs: [' tmux://5-web3-app-engineering/0.1 '],
      source_kind: 'tmux_observation',
      metadata: {}
    },
    { actorId: 'app-engineering' }
  );

  assert.equal(paddedTmuxEvidence.ok, false);
  assert.match(paddedTmuxEvidence.errors.join(' '), /tmux_observation.*tmux:\/\/ evidence_ref/i);
});

test('event validation binds raw_transcript source to non-empty evidence refs', () => {
  const result = validateEventPayload(
    {
      event_id: 'evt_raw_transcript_missing_ref',
      ts: '2026-03-09T18:02:00.000Z',
      agent_id: 'app-engineering',
      agent_role: 'app-engineering',
      event_type: 'agent_replied',
      current_state: 'planning',
      active_task: 'Reply in planning thread',
      summary: 'Transcript source without evidence ref',
      severity: 'normal',
      correlation_id: 'phase1-source-boundary',
      counterparty_agent_ids: ['team-lead'],
      evidence_refs: [''],
      source_kind: 'raw_transcript',
      metadata: {}
    },
    { actorId: 'app-engineering' }
  );

  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /raw_transcript.*evidence_ref/i);
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
