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
  selectWatchEdgeRisk,
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
      },
      {
        zone_id: 'meeting-zone',
        label: 'Meeting Zone',
        highest_severity: 'orange',
        occupant_count: 1,
        blocked_count: 0,
        reboot_count: 0,
        open_alert_or_incident_occupant_count: 1,
      },
      {
        zone_id: 'handoff-hub',
        label: 'Handoff Hub',
        highest_severity: 'yellow',
        occupant_count: 1,
        blocked_count: 1,
        reboot_count: 0,
        open_alert_or_incident_occupant_count: 0,
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
