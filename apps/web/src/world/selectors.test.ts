import { describe, expect, it } from 'vitest';
import {
  selectAgentBadge,
  selectAgentLabel,
  selectAgentTrailSummary,
  selectAgentZoneLabel,
  selectAttentionQueue,
  selectGlobalSeverity,
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

const ZONES: ZoneSnapshot[] = [
  { zone_id: 'desk-app-engineering', label: 'App Engineering Desk', kind: 'desk', occupant_ids: [] },
  { zone_id: 'meeting-zone', label: 'Meeting Zone', kind: 'shared', occupant_ids: [] },
  { zone_id: 'review-zone', label: 'Review Zone', kind: 'shared', occupant_ids: [] },
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
