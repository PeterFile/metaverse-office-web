import { describe, expect, it } from 'vitest';
import {
  selectAgentBadge,
  selectAgentLabel,
  selectAgentTrailSummary,
  selectAgentZoneLabel,
  selectAttentionQueue,
  selectDataQualitySummary,
  selectGlobalSeverity,
  selectHotZones,
  selectIncidentEvidenceSummaries,
  selectRuntimeBackfillEvidence,
  selectRuntimeEvidenceAccountabilitySummary,
  selectWatchEdgeRisk,
  selectZoneEvidenceFloors,
  selectZoneEvidenceInspections,
} from './selectors';
import type { WatchEdgeSnapshot, WorldAgent, WorldState, ZoneSnapshot } from './types';

function makeWorldAgent(overrides: Partial<WorldAgent> = {}): WorldAgent {
  return {
    agent_id: 'app-engineering',
    display_name: 'App Engineering Agent',
    kind: 'employee',
    raw_state: 'coding',
    raw_location: 'desk-app-engineering',
    active_task: 'Implement handlers',
    reboot_recommended: false,
    phase: 'active',
    zone: 'desk-app-engineering',
    severity: 'normal',
    severity_reason: 'reported',
    staleness: null,
    recent_trail: [],
    open_alert_count: 0,
    has_open_incidents: false,
    ...overrides,
  };
}

function makeZoneSnapshot(overrides: Partial<ZoneSnapshot> = {}): ZoneSnapshot {
  return {
    zone_id: 'desk-app-engineering',
    label: 'App Engineering Desk',
    kind: 'desk',
    occupant_ids: [],
    grid_x: 0,
    grid_y: 0,
    grid_w: 1,
    grid_h: 1,
    ...overrides,
  };
}

function makeWorldState(overrides: Partial<WorldState> = {}): WorldState {
  return {
    generated_at: '2026-03-14T10:00:00Z',
    projection_ts: '2026-03-14T10:00:00Z',
    agents: new Map(),
    zones: [],
    watch_edges: [],
    incidents: [],
    summary: {
      total_agents: 0,
      blocked_count: 0,
      reboot_count: 0,
      severity_buckets: { normal: 0, yellow: 0, orange: 0, red: 0 },
      highest_severity: 'normal',
    },
    data_quality: {
      overview_available: true,
      workflow_agent_ids: [],
      incident_feed_available: true,
      last_overview_at: '2026-03-14T10:00:00Z',
      degraded_reasons: [],
    },
    ...overrides,
  };
}

const ZONES: ZoneSnapshot[] = [
  makeZoneSnapshot(),
  makeZoneSnapshot({ zone_id: 'meeting-zone', label: 'Meeting Zone', kind: 'shared', grid_x: 1 }),
  makeZoneSnapshot({ zone_id: 'review-zone', label: 'Review Zone', kind: 'shared', grid_x: 2 }),
];

describe('selectAgentLabel', () => {
  it('formats basic label', () => {
    const label = selectAgentLabel(makeWorldAgent());
    expect(label).toBe('🟢 Active');
  });

  it('includes reboot flag', () => {
    const label = selectAgentLabel(
      makeWorldAgent({ reboot_recommended: true, severity: 'orange', phase: 'reboot_recommended' })
    );
    expect(label).toContain('reboot recommended');
    expect(label).toContain('🟠');
  });

  it('includes alert count', () => {
    const label = selectAgentLabel(makeWorldAgent({ open_alert_count: 3 }));
    expect(label).toContain('3 alert(s)');
  });
});

describe('selectAgentBadge', () => {
  it('returns severity and reason', () => {
    const badge = selectAgentBadge(makeWorldAgent({ severity: 'red', severity_reason: 'open incident' }));
    expect(badge.severity).toBe('red');
    expect(badge.text).toBe('open incident');
  });
});

describe('selectAgentZoneLabel', () => {
  it('returns zone label', () => {
    expect(selectAgentZoneLabel(makeWorldAgent(), ZONES)).toBe('App Engineering Desk');
  });

  it('falls back to zone_id if not found', () => {
    expect(selectAgentZoneLabel(makeWorldAgent({ zone: 'unknown-zone' }), ZONES)).toBe('unknown-zone');
  });
});

describe('selectAgentTrailSummary', () => {
  it('formats trail entries', () => {
    const agent = makeWorldAgent({
      recent_trail: [
        { event_id: 'e1', ts: '2026-03-14T10:00:00Z', event_type: 'agent_wrote_file', severity: 'normal', summary: 'Updated server.js' },
      ],
    });
    const lines = selectAgentTrailSummary(agent);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('agent_wrote_file');
    expect(lines[0]).toContain('Updated server.js');
  });

  it('returns empty for no trail', () => {
    expect(selectAgentTrailSummary(makeWorldAgent())).toEqual([]);
  });
});

describe('selectWatchEdgeRisk', () => {
  it('returns high risk for orange+', () => {
    const edge: WatchEdgeSnapshot = { from_agent_id: 'a', to_agent_id: 'b', watch_mode: 'peer', risk_level: 'red' };
    expect(selectWatchEdgeRisk(edge)).toEqual({ level: 'red', label: 'High risk' });
  });

  it('returns elevated for yellow', () => {
    const edge: WatchEdgeSnapshot = { from_agent_id: 'a', to_agent_id: 'b', watch_mode: 'peer', risk_level: 'yellow' };
    expect(selectWatchEdgeRisk(edge)).toEqual({ level: 'yellow', label: 'Elevated' });
  });

  it('returns normal', () => {
    const edge: WatchEdgeSnapshot = { from_agent_id: 'a', to_agent_id: 'b', watch_mode: 'lead', risk_level: 'normal' };
    expect(selectWatchEdgeRisk(edge)).toEqual({ level: 'normal', label: 'Normal' });
  });
});

describe('selectAttentionQueue', () => {
  it('filters and sorts by severity desc', () => {
    const agents = new Map<string, WorldAgent>([
      ['a', makeWorldAgent({ agent_id: 'a', display_name: 'A', severity: 'yellow' })],
      ['b', makeWorldAgent({ agent_id: 'b', display_name: 'B', severity: 'red' })],
      ['c', makeWorldAgent({ agent_id: 'c', display_name: 'C', severity: 'normal' })],
    ]);
    const world = { agents } as WorldState;
    const queue = selectAttentionQueue(world);
    expect(queue.map((a) => a.agent_id)).toEqual(['b', 'a']);
  });

  it('includes blocked agents even if normal severity', () => {
    const agents = new Map<string, WorldAgent>([
      ['a', makeWorldAgent({ agent_id: 'a', display_name: 'A', phase: 'blocked', severity: 'normal' })],
    ]);
    const world = { agents } as WorldState;
    expect(selectAttentionQueue(world)).toHaveLength(1);
  });
});

describe('selectGlobalSeverity', () => {
  it('returns highest severity from summary', () => {
    const world = {
      summary: { highest_severity: 'orange' },
    } as WorldState;
    expect(selectGlobalSeverity(world)).toBe('orange');
  });
});

describe('selectDataQualitySummary', () => {
  it('returns null when projected data quality is healthy', () => {
    expect(selectDataQualitySummary(makeWorldState())).toBeNull();
    expect(selectDataQualitySummary(null)).toBeNull();
  });

  it('surfaces degraded reasons and last overview evidence when projected data is incomplete', () => {
    const world = makeWorldState({
      data_quality: {
        overview_available: false,
        workflow_agent_ids: ['app-engineering'],
        incident_feed_available: false,
        last_overview_at: '2026-03-14T09:55:00Z',
        degraded_reasons: ['overview unavailable', 'incident feed unavailable', 'workflow partial'],
      },
    });

    expect(selectDataQualitySummary(world)).toEqual({
      degraded_reasons: ['overview unavailable', 'incident feed unavailable', 'workflow partial'],
      last_overview_at: '2026-03-14T09:55:00Z',
    });
  });
});

describe('selectRuntimeBackfillEvidence', () => {
  it('returns agent-level incident-feed backfill evidence in deterministic order', () => {
    const world = makeWorldState({
      agents: new Map<string, WorldAgent>([
        [
          'z-agent',
          makeWorldAgent({
            agent_id: 'z-agent',
            display_name: 'Z Agent',
            runtime_evidence: {
              source: 'incident_feed_backfill',
              degraded_reasons: ['workflow partial'],
              incident_ids: ['inc-z'],
              source_kinds: ['controller_event'],
              correlation_ids: ['corr-z'],
              evidence_refs: ['tmux://z/0.1'],
            },
          }),
        ],
        [
          'a-agent',
          makeWorldAgent({
            agent_id: 'a-agent',
            display_name: 'A Agent',
            runtime_evidence: {
              source: 'incident_feed_backfill',
              degraded_reasons: ['workflow partial'],
              incident_ids: ['inc-a', 'inc-b'],
              source_kinds: ['collector_snapshot', 'controller_event'],
              correlation_ids: [' corr-a ', 'corr-a', ' ', 'corr-b'],
              evidence_refs: [' /tmp/a.md ', '', '/tmp/a.md', 'tmux://session/0.1'],
            },
          }),
        ],
        [
          'workflow-agent',
          makeWorldAgent({
            agent_id: 'workflow-agent',
            display_name: 'Workflow Agent',
            runtime_evidence: {
              source: 'workflow',
              degraded_reasons: [],
              incident_ids: [' inc-workflow ', 'inc-workflow'],
              source_kinds: [' controller_event '],
              correlation_ids: [' corr-workflow ', 'corr-workflow'],
              evidence_refs: [' /tmp/workflow.md ', '', '/tmp/workflow.md'],
            },
          }),
        ],
      ]),
    });

    expect(selectRuntimeBackfillEvidence(world)).toEqual([
      {
        agent_id: 'a-agent',
        display_name: 'A Agent',
        degraded_reasons: ['workflow partial'],
        incident_ids: ['inc-a', 'inc-b'],
        source_kinds: ['collector_snapshot', 'controller_event'],
        correlation_ids: ['corr-a', 'corr-b'],
        evidence_refs: ['/tmp/a.md', 'tmux://session/0.1'],
      },
      {
        agent_id: 'z-agent',
        display_name: 'Z Agent',
        degraded_reasons: ['workflow partial'],
        incident_ids: ['inc-z'],
        source_kinds: ['controller_event'],
        correlation_ids: ['corr-z'],
        evidence_refs: ['tmux://z/0.1'],
      },
    ]);
  });

  it('falls back quietly when world data has no incident-feed backfill evidence', () => {
    expect(selectRuntimeBackfillEvidence(null)).toEqual([]);
    expect(selectRuntimeBackfillEvidence(makeWorldState())).toEqual([]);
  });

  it('suppresses incident-feed backfill rows that lack real incident ids or source kinds', () => {
    const world = makeWorldState({
      agents: new Map<string, WorldAgent>([
        [
          'claimed-only',
          makeWorldAgent({
            agent_id: 'claimed-only',
            display_name: 'Claimed Only',
            runtime_evidence: {
              source: 'incident_feed_backfill',
              degraded_reasons: ['workflow partial'],
              incident_ids: [],
              source_kinds: [],
              correlation_ids: ['corr-claimed'],
              evidence_refs: ['/tmp/claimed.md'],
            },
          }),
        ],
      ]),
    });

    expect(selectRuntimeBackfillEvidence(world)).toEqual([]);
  });
});

describe('selectRuntimeEvidenceAccountabilitySummary', () => {
  it('derives runtime evidence posture without fabricating provenance', () => {
    const world = makeWorldState({
      agents: new Map<string, WorldAgent>([
        [
          'workflow-agent',
          makeWorldAgent({
            agent_id: 'workflow-agent',
            display_name: 'Workflow Agent',
            runtime_evidence: {
              source: 'workflow',
              degraded_reasons: [],
              incident_ids: [' inc-workflow ', 'inc-workflow'],
              source_kinds: [' controller_event '],
              correlation_ids: [' corr-workflow ', 'corr-workflow'],
              evidence_refs: [' /tmp/workflow.md ', '', '/tmp/workflow.md'],
            },
          }),
        ],
        [
          'backfill-agent',
          makeWorldAgent({
            agent_id: 'backfill-agent',
            display_name: 'Backfill Agent',
            runtime_evidence: {
              source: 'incident_feed_backfill',
              degraded_reasons: [' workflow partial ', 'workflow partial', ''],
              incident_ids: [' inc-1 ', 'inc-1', 'inc-2'],
              source_kinds: [' controller_event ', '', 'collector_snapshot'],
              correlation_ids: ['corr-2', ' corr-1 ', 'corr-1'],
              evidence_refs: [' tmux://agent/0.1 ', '', 'tmux://agent/0.1', '/tmp/evidence.md'],
            },
          }),
        ],
        [
          'overview-agent',
          makeWorldAgent({
            agent_id: 'overview-agent',
            display_name: 'Overview Agent',
            runtime_evidence: {
              source: 'overview_only',
              degraded_reasons: ['workflow missing'],
              incident_ids: [],
              source_kinds: [],
              correlation_ids: [],
              evidence_refs: [],
            },
          }),
        ],
        ['missing-agent', makeWorldAgent({ agent_id: 'missing-agent', display_name: 'Missing Agent' })],
      ]),
    });

    expect(selectRuntimeEvidenceAccountabilitySummary(world)).toEqual({
      status: 'overview_only_gaps',
      counts: {
        total_agents: 4,
        workflow_authoritative: 1,
        incident_feed_backfill: 1,
        overview_only: 1,
        missing_runtime_evidence: 1,
        degraded_agents: 2,
        incident_backed_agents: 2,
        evidence_backed_agents: 2,
      },
      degraded_reasons: ['workflow partial', 'workflow missing'],
      incident_ids: ['inc-workflow', 'inc-1', 'inc-2'],
      source_kinds: ['controller_event', 'collector_snapshot'],
      correlation_ids: ['corr-workflow', 'corr-2', 'corr-1'],
      evidence_refs: ['/tmp/workflow.md', 'tmux://agent/0.1', '/tmp/evidence.md'],
      gap_agents: [
        {
          agent_id: 'missing-agent',
          display_name: 'Missing Agent',
          source: 'missing_runtime_evidence',
          degraded_reasons: [],
        },
        {
          agent_id: 'overview-agent',
          display_name: 'Overview Agent',
          source: 'overview_only',
          degraded_reasons: ['workflow missing'],
        },
      ],
    });
  });

  it('returns an empty posture when no world or agents are available', () => {
    expect(selectRuntimeEvidenceAccountabilitySummary(null)).toEqual({
      status: 'empty',
      counts: {
        total_agents: 0,
        workflow_authoritative: 0,
        incident_feed_backfill: 0,
        overview_only: 0,
        missing_runtime_evidence: 0,
        degraded_agents: 0,
        incident_backed_agents: 0,
        evidence_backed_agents: 0,
      },
      degraded_reasons: [],
      incident_ids: [],
      source_kinds: [],
      correlation_ids: [],
      evidence_refs: [],
      gap_agents: [],
    });
    expect(selectRuntimeEvidenceAccountabilitySummary(makeWorldState())).toEqual(selectRuntimeEvidenceAccountabilitySummary(null));
  });
});

describe('selectIncidentEvidenceSummaries', () => {
  it('returns capped incident provenance summaries in deterministic order', () => {
    const world = makeWorldState({
      incidents: [
        {
          incident_id: 'inc-red-old',
          kind: 'reboot',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          severity: 'red',
          status: 'requested',
          summary: 'Old red reboot',
          ts: '2026-03-14T10:00:00Z',
          correlation_id: 'corr-red-old',
          source_kind: 'controller_event',
          evidence_refs: [' /tmp/a.md ', '', '/tmp/a.md', 'tmux://session/0.1'],
          counterparty_agent_ids: [' ops-lead ', 'ops-lead', ' '],
        },
        {
          incident_id: 'inc-yellow',
          kind: 'handoff',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          severity: 'yellow',
          status: 'waiting',
          summary: 'Yellow handoff',
          ts: '2026-03-14T10:05:00Z',
          correlation_id: 'corr-yellow',
          source_kind: 'controller_event',
          evidence_refs: ['tmux://yellow/0.1'],
          counterparty_agent_ids: ['growth-revenue'],
        },
        {
          incident_id: 'inc-red-new-b',
          kind: 'peer_watch_alert',
          agent_id: 'app-engineering',
          actor_id: 'ops-lead',
          severity: 'red',
          status: 'open',
          summary: 'New red alert B',
          ts: '2026-03-14T10:10:00Z',
          correlation_id: 'corr-red-new',
          source_kind: 'collector_snapshot',
          evidence_refs: [],
          counterparty_agent_ids: ['team-lead'],
        },
        {
          incident_id: 'inc-red-new-a',
          kind: 'peer_watch_alert',
          agent_id: 'app-engineering',
          actor_id: 'ops-lead',
          severity: 'red',
          status: 'open',
          summary: 'New red alert A',
          ts: '2026-03-14T10:10:00Z',
          correlation_id: 'corr-red-new',
          source_kind: 'collector_snapshot',
          evidence_refs: ['tmux://new/0.1'],
          counterparty_agent_ids: [],
        },
      ],
    });

    expect(selectIncidentEvidenceSummaries(world, 3)).toEqual([
      {
        incident_id: 'inc-red-new-a',
        severity: 'red',
        ts: '2026-03-14T10:10:00Z',
        source_kind: 'collector_snapshot',
        actor_id: 'ops-lead',
        correlation_id: 'corr-red-new',
        evidence_refs: ['tmux://new/0.1'],
        counterparty_agent_ids: [],
      },
      {
        incident_id: 'inc-red-new-b',
        severity: 'red',
        ts: '2026-03-14T10:10:00Z',
        source_kind: 'collector_snapshot',
        actor_id: 'ops-lead',
        correlation_id: 'corr-red-new',
        evidence_refs: [],
        counterparty_agent_ids: ['team-lead'],
      },
      {
        incident_id: 'inc-red-old',
        severity: 'red',
        ts: '2026-03-14T10:00:00Z',
        source_kind: 'controller_event',
        actor_id: 'team-lead',
        correlation_id: 'corr-red-old',
        evidence_refs: ['/tmp/a.md', 'tmux://session/0.1'],
        counterparty_agent_ids: ['ops-lead'],
      },
    ]);
  });

  it('caps per-incident provenance arrays and reports overflow counts', () => {
    const world = makeWorldState({
      incidents: [
        {
          incident_id: 'inc-overflow',
          kind: 'peer_watch_alert',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          severity: 'orange',
          status: 'open',
          summary: 'Overflow provenance',
          ts: '2026-03-14T10:00:00Z',
          correlation_id: 'corr-overflow',
          source_kind: 'collector_snapshot',
          evidence_refs: ['ref-1', 'ref-2', 'ref-3', 'ref-4', 'ref-5'],
          counterparty_agent_ids: ['agent-a', 'agent-b', 'agent-c', 'agent-d'],
        },
      ],
    });

    expect(selectIncidentEvidenceSummaries(world)).toEqual([
      {
        incident_id: 'inc-overflow',
        severity: 'orange',
        ts: '2026-03-14T10:00:00Z',
        source_kind: 'collector_snapshot',
        actor_id: 'team-lead',
        correlation_id: 'corr-overflow',
        evidence_refs: ['ref-1', 'ref-2', 'ref-3'],
        evidence_ref_overflow_count: 2,
        counterparty_agent_ids: ['agent-a', 'agent-b', 'agent-c'],
        counterparty_agent_overflow_count: 1,
      },
    ]);
  });

  it('orders invalid incident evidence timestamps deterministically by incident id', () => {
    const world = makeWorldState({
      incidents: [
        {
          incident_id: 'inc-z',
          kind: 'peer_watch_alert',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          severity: 'orange',
          status: 'open',
          summary: 'Invalid timestamp Z',
          ts: 'not-a-date',
          correlation_id: 'corr-z',
          source_kind: 'collector_snapshot',
          evidence_refs: ['tmux://z/0.1'],
          counterparty_agent_ids: [],
        },
        {
          incident_id: 'inc-a',
          kind: 'peer_watch_alert',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          severity: 'orange',
          status: 'open',
          summary: 'Invalid timestamp A',
          ts: 'also-not-a-date',
          correlation_id: 'corr-a',
          source_kind: 'collector_snapshot',
          evidence_refs: ['tmux://a/0.1'],
          counterparty_agent_ids: [],
        },
      ],
    });

    expect(selectIncidentEvidenceSummaries(world).map((incident) => incident.incident_id)).toEqual([
      'inc-a',
      'inc-z',
    ]);
  });

  it('falls back quietly and suppresses incidents without meaningful provenance', () => {
    const world = makeWorldState({
      incidents: [
        {
          incident_id: 'inc-empty',
          kind: 'reboot',
          agent_id: 'app-engineering',
          actor_id: '',
          severity: 'orange',
          status: 'requested',
          summary: 'No provenance',
          ts: '2026-03-14T10:00:00Z',
          correlation_id: ' ',
          source_kind: ' ',
          evidence_refs: [' '],
          counterparty_agent_ids: [''],
        },
      ],
    });

    expect(selectIncidentEvidenceSummaries(null)).toEqual([]);
    expect(selectIncidentEvidenceSummaries(makeWorldState())).toEqual([]);
    expect(selectIncidentEvidenceSummaries(world)).toEqual([]);
    expect(selectIncidentEvidenceSummaries(world, 0)).toEqual([]);
  });
});

describe('selectHotZones', () => {
  it('returns the hottest occupied zones in a deterministic order', () => {
    const agents = new Map<string, WorldAgent>([
      [
        'a',
        makeWorldAgent({
          agent_id: 'a',
          display_name: 'A',
          zone: 'war-room',
          severity: 'red',
          phase: 'blocked',
          reboot_recommended: true,
          has_open_incidents: true,
          staleness: {
            severity: 'orange',
            stale_for_ms: 120000,
            stale_for_minutes: 2,
            last_meaningful_output_at: '2026-03-14T09:58:00Z',
          },
        }),
      ],
      [
        'b',
        makeWorldAgent({
          agent_id: 'b',
          display_name: 'B',
          zone: 'war-room',
          severity: 'yellow',
          has_open_incidents: true,
        }),
      ],
      [
        'c',
        makeWorldAgent({
          agent_id: 'c',
          display_name: 'C',
          zone: 'meeting-zone',
          severity: 'orange',
          has_open_incidents: true,
          staleness: {
            severity: 'yellow',
            stale_for_ms: 60000,
            stale_for_minutes: 1,
            last_meaningful_output_at: '2026-03-14T09:59:00Z',
          },
        }),
      ],
      [
        'd',
        makeWorldAgent({
          agent_id: 'd',
          display_name: 'D',
          zone: 'review-zone',
          severity: 'yellow',
          reboot_recommended: true,
        }),
      ],
      [
        'e',
        makeWorldAgent({ agent_id: 'e', display_name: 'E', zone: 'focus-booth', severity: 'normal' }),
      ],
      [
        'f',
        makeWorldAgent({
          agent_id: 'f',
          display_name: 'F',
          zone: 'handoff-hub',
          severity: 'yellow',
          phase: 'blocked',
        }),
      ],
    ]);

    const world = makeWorldState({
      agents,
      zones: [
        makeZoneSnapshot({ zone_id: 'war-room', label: 'War Room', kind: 'shared', occupant_ids: ['a', 'b'] }),
        makeZoneSnapshot({ zone_id: 'meeting-zone', label: 'Meeting Zone', kind: 'shared', occupant_ids: ['c'] }),
        makeZoneSnapshot({ zone_id: 'review-zone', label: 'Review Zone', kind: 'shared', occupant_ids: ['d'] }),
        makeZoneSnapshot({ zone_id: 'focus-booth', label: 'Focus Booth', kind: 'shared', occupant_ids: ['e'] }),
        makeZoneSnapshot({ zone_id: 'handoff-hub', label: 'Handoff Hub', kind: 'shared', occupant_ids: ['f'] }),
      ],
    });

    expect(selectHotZones(world)).toEqual([
      {
        zone_id: 'war-room',
        label: 'War Room',
        highest_severity: 'red',
        occupant_count: 2,
        blocked_count: 1,
        reboot_count: 1,
        open_alert_or_incident_occupant_count: 2,
        runtime_freshness_degraded_count: 1,
      },
      {
        zone_id: 'meeting-zone',
        label: 'Meeting Zone',
        highest_severity: 'orange',
        occupant_count: 1,
        blocked_count: 0,
        reboot_count: 0,
        open_alert_or_incident_occupant_count: 1,
        runtime_freshness_degraded_count: 1,
      },
      {
        zone_id: 'handoff-hub',
        label: 'Handoff Hub',
        highest_severity: 'yellow',
        occupant_count: 1,
        blocked_count: 1,
        reboot_count: 0,
        open_alert_or_incident_occupant_count: 0,
        runtime_freshness_degraded_count: 0,
      },
    ]);
  });

  it('treats the combined alert/incident flag as a hot-zone signal on its own', () => {
    const world = makeWorldState({
      agents: new Map([
        [
          'steady',
          makeWorldAgent({
            agent_id: 'steady',
            display_name: 'Steady',
            zone: 'focus-booth',
            has_open_incidents: true,
          }),
        ],
      ]),
      zones: [
        makeZoneSnapshot({
          zone_id: 'focus-booth',
          label: 'Focus Booth',
          kind: 'shared',
          occupant_ids: ['steady'],
        }),
      ],
    });

    expect(selectHotZones(world)).toEqual([
      {
        zone_id: 'focus-booth',
        label: 'Focus Booth',
        highest_severity: 'normal',
        occupant_count: 1,
        blocked_count: 0,
        reboot_count: 0,
        open_alert_or_incident_occupant_count: 1,
        runtime_freshness_degraded_count: 0,
      },
    ]);
  });

  it('counts open peer-watch alerts as hot-zone evidence without incident fallback', () => {
    const world = makeWorldState({
      agents: new Map([
        [
          'alert-only',
          makeWorldAgent({
            agent_id: 'alert-only',
            display_name: 'Alert Only',
            zone: 'watch-pod',
            open_alert_count: 2,
            has_open_incidents: false,
          }),
        ],
      ]),
      zones: [
        makeZoneSnapshot({
          zone_id: 'watch-pod',
          label: 'Watch Pod',
          kind: 'shared',
          occupant_ids: ['alert-only'],
        }),
      ],
    });

    expect(selectHotZones(world)).toEqual([
      {
        zone_id: 'watch-pod',
        label: 'Watch Pod',
        highest_severity: 'normal',
        occupant_count: 1,
        blocked_count: 0,
        reboot_count: 0,
        open_alert_or_incident_occupant_count: 1,
        runtime_freshness_degraded_count: 0,
      },
    ]);
  });

  it('treats stale-only runtime freshness degradation as a hot-zone signal on its own', () => {
    const world = makeWorldState({
      agents: new Map([
        [
          'stale',
          makeWorldAgent({
            agent_id: 'stale',
            display_name: 'Stale Agent',
            zone: 'stale-pod',
            staleness: {
              severity: 'orange',
              stale_for_ms: 180000,
              stale_for_minutes: 3,
              last_meaningful_output_at: '2026-03-14T09:57:00Z',
            },
          }),
        ],
      ]),
      zones: [
        makeZoneSnapshot({
          zone_id: 'stale-pod',
          label: 'Stale Pod',
          kind: 'shared',
          occupant_ids: ['stale'],
        }),
      ],
    });

    expect(selectHotZones(world)).toEqual([
      {
        zone_id: 'stale-pod',
        label: 'Stale Pod',
        highest_severity: 'normal',
        occupant_count: 1,
        blocked_count: 0,
        reboot_count: 0,
        open_alert_or_incident_occupant_count: 0,
        runtime_freshness_degraded_count: 1,
      },
    ]);
  });

  it('falls back quietly when world data is unavailable or zones are not hot', () => {
    expect(selectHotZones(null)).toEqual([]);

    const world = makeWorldState({
      agents: new Map([
        ['steady', makeWorldAgent({ agent_id: 'steady', display_name: 'Steady', zone: 'focus-booth' })],
      ]),
      zones: [makeZoneSnapshot({ zone_id: 'focus-booth', label: 'Focus Booth', kind: 'shared', occupant_ids: ['steady'] })],
    });

    expect(selectHotZones(world)).toEqual([]);
  });
});

describe('selectZoneEvidenceFloors', () => {
  it('projects passive zone floor presence without carrying severity or counts', () => {
    const world = makeWorldState({
      agents: new Map([
        [
          'blocked',
          makeWorldAgent({
            agent_id: 'blocked',
            display_name: 'Blocked',
            zone: 'review-zone',
            severity: 'orange',
            phase: 'blocked',
            open_alert_count: 1,
          }),
        ],
        [
          'freshness',
          makeWorldAgent({
            agent_id: 'freshness',
            display_name: 'Freshness',
            zone: 'review-zone',
            staleness: {
              severity: 'yellow',
              stale_for_ms: 180000,
              stale_for_minutes: 3,
              last_meaningful_output_at: '2026-03-14T09:57:00Z',
            },
          }),
        ],
        ['steady', makeWorldAgent({ agent_id: 'steady', display_name: 'Steady', zone: 'quiet-zone' })],
      ]),
      zones: [
        makeZoneSnapshot({
          zone_id: 'review-zone',
          label: 'Review Zone',
          kind: 'shared',
          occupant_ids: ['blocked', 'freshness'],
        }),
        makeZoneSnapshot({
          zone_id: 'quiet-zone',
          label: 'Quiet Zone',
          kind: 'shared',
          occupant_ids: ['steady'],
        }),
      ],
    });

    expect(selectZoneEvidenceFloors(world)).toEqual([
      {
        zone_id: 'review-zone',
        label: 'Review Zone',
      },
    ]);
  });
});

describe('selectZoneEvidenceInspections', () => {
  it('projects compact zone-card aggregates and unavailable facts without raw provenance', () => {
    const world = makeWorldState({
      agents: new Map([
        [
          'backed',
          makeWorldAgent({
            agent_id: 'backed',
            display_name: 'Backed Operator',
            zone: 'review-zone',
            severity: 'yellow',
            runtime_evidence: {
              source: 'workflow',
              degraded_reasons: [],
              incident_ids: [],
              source_kinds: [],
              correlation_ids: [],
              evidence_refs: ['/tmp/secret.md'],
            },
            source_evidence_health_status: 'degraded',
          }),
        ],
        [
          'gap',
          makeWorldAgent({
            agent_id: 'gap',
            display_name: 'Gap Operator',
            zone: 'review-zone',
            runtime_evidence: { source: 'overview_only', degraded_reasons: [], incident_ids: [], source_kinds: [], correlation_ids: [], evidence_refs: [] },
            source_evidence_health_status: 'error',
          }),
        ],
        [
          'unbacked',
          makeWorldAgent({
            agent_id: 'unbacked',
            display_name: 'Unbacked Operator',
            zone: 'quiet-alert-zone',
            open_alert_count: 1,
          }),
        ],
        [
          'overflow',
          makeWorldAgent({
            agent_id: 'overflow',
            display_name: 'Overflow Operator',
            zone: 'review-zone',
            severity: 'yellow',
            runtime_evidence: {
              source: 'workflow',
              degraded_reasons: [],
              incident_ids: [],
              source_kinds: [],
              correlation_ids: [],
              evidence_refs: ['tmux://session/0.1'],
            },
            source_evidence_health_status: 'missing',
          }),
        ],
        [
          'hidden',
          makeWorldAgent({
            agent_id: 'hidden',
            display_name: 'Hidden Operator',
            zone: 'review-zone',
            severity: 'yellow',
            runtime_evidence: {
              source: 'workflow',
              degraded_reasons: [],
              incident_ids: [],
              source_kinds: [],
              correlation_ids: [],
              evidence_refs: ['/private/tmp/hidden.md'],
            },
          }),
        ],
      ]),
      zones: [
        makeZoneSnapshot({
          zone_id: 'review-zone',
          label: 'Review Zone',
          kind: 'shared',
          occupant_ids: ['backed', 'gap', 'overflow', 'hidden'],
        }),
        makeZoneSnapshot({ zone_id: 'quiet-alert-zone', label: 'Quiet Alert Zone', kind: 'shared', occupant_ids: ['unbacked'] }),
      ],
    });

    expect(selectZoneEvidenceInspections(world)).toEqual([
      {
        zone_id: 'review-zone',
        label: 'Review Zone',
        occupant_count: 4,
        evidence_backed_agent_count: 3,
        source_health_status: 'error',
        occupant_proof_summaries: [
          {
            display_name: 'Backed Operator',
            evidence_backed: true,
            source_health_status: 'degraded',
          },
          {
            display_name: 'Gap Operator',
            evidence_backed: false,
            source_health_status: 'error',
          },
          {
            display_name: 'Overflow Operator',
            evidence_backed: true,
            source_health_status: 'missing',
          },
        ],
        occupant_proof_overflow_count: 1,
      },
      {
        zone_id: 'quiet-alert-zone',
        label: 'Quiet Alert Zone',
        occupant_count: 1,
        evidence_backed_agent_count: null,
        source_health_status: null,
        occupant_proof_summaries: [
          {
            display_name: 'Unbacked Operator',
            evidence_backed: false,
            source_health_status: null,
          },
        ],
        occupant_proof_overflow_count: 0,
      },
    ]);
  });
});
