import { describe, expect, it } from 'vitest';

import { adaptWorldToScene } from './sceneAdapter';
import type { WorldState } from '../world/types';

const world: WorldState = {
  generated_at: '2026-03-16T09:00:00.000Z',
  projection_ts: '2026-03-16T09:00:05.000Z',
  agents: new Map([
    [
      'team-lead',
      {
        agent_id: 'team-lead',
        display_name: 'Team Lead',
        kind: 'lead',
        raw_state: 'reviewing',
        raw_location: 'lead-desk',
        active_task: 'Coordinate rollout',
        reboot_recommended: false,
        phase: 'reviewing',
        zone: 'lead-desk',
        severity: 'normal',
        severity_reason: 'reported',
        staleness: null,
        recent_trail: [],
        open_alert_count: 0,
        has_open_incidents: false
      }
    ],
    [
      'app-engineering',
      {
        agent_id: 'app-engineering',
        display_name: 'App Engineering Agent',
        kind: 'employee',
        raw_state: 'blocked',
        raw_location: 'meeting-zone',
        active_task: 'Fix workflow issue',
        reboot_recommended: true,
        phase: 'blocked',
        zone: 'meeting-zone',
        severity: 'orange',
        severity_reason: 'effective (backend)',
        staleness: {
          severity: 'orange',
          stale_for_ms: 1_320_000,
          stale_for_minutes: 22,
          last_meaningful_output_at: '2026-03-16T08:38:00.000Z'
        },
        recent_trail: [],
        open_alert_count: 1,
        has_open_incidents: true
      }
    ],
    [
      'growth-revenue',
      {
        agent_id: 'growth-revenue',
        display_name: 'Growth Revenue Agent',
        kind: 'employee',
        raw_state: 'waiting',
        raw_location: 'growth-desk',
        active_task: 'Review launch copy',
        reboot_recommended: false,
        phase: 'waiting',
        zone: 'growth-desk',
        severity: 'red',
        severity_reason: 'waiting on upstream input',
        staleness: null,
        recent_trail: [],
        open_alert_count: 0,
        has_open_incidents: false
      }
    ]
  ]),
  zones: [
    {
      zone_id: 'lead-desk',
      label: 'Team Lead Desk',
      kind: 'desk',
      grid_x: 0,
      grid_y: 0,
      grid_w: 1,
      grid_h: 1,
      home_agent_id: 'team-lead',
      occupant_ids: ['team-lead']
    },
    {
      zone_id: 'meeting-zone',
      label: 'Meeting Zone',
      kind: 'shared',
      grid_x: 1,
      grid_y: 1,
      grid_w: 2,
      grid_h: 1,
      home_agent_id: null,
      occupant_ids: ['app-engineering']
    },
    {
      zone_id: 'growth-desk',
      label: 'Growth Desk',
      kind: 'desk',
      grid_x: 2,
      grid_y: 1,
      grid_w: 1,
      grid_h: 1,
      home_agent_id: 'growth-revenue',
      occupant_ids: ['growth-revenue']
    }
  ],
  watch_edges: [
    {
      from_agent_id: 'team-lead',
      to_agent_id: 'app-engineering',
      watch_mode: 'lead',
      risk_level: 'orange'
    },
    {
      from_agent_id: 'app-engineering',
      to_agent_id: 'growth-revenue',
      watch_mode: 'peer',
      risk_level: 'red'
    },
    {
      from_agent_id: 'growth-revenue',
      to_agent_id: 'team-lead',
      watch_mode: 'peer',
      risk_level: 'yellow'
    }
  ],
  incidents: [],
  summary: {
    total_agents: 3,
    blocked_count: 1,
    reboot_count: 1,
    severity_buckets: {
      normal: 1,
      yellow: 0,
      orange: 1,
      red: 1
    },
    highest_severity: 'red'
  },
  data_quality: {
    overview_available: true,
    workflow_agent_ids: ['app-engineering'],
    incident_feed_available: true,
    last_overview_at: '2026-03-16T09:00:00.000Z',
    degraded_reasons: []
  }
};

describe('adaptWorldToScene', () => {
  it('maps world agents into stable AI Town scene coordinates and character variants', () => {
    const scene = adaptWorldToScene(world, 'app-engineering');

    expect(scene.map.width).toBeGreaterThan(40);
    expect(scene.map.height).toBeGreaterThan(30);

    expect(scene.zones).toHaveLength(3);
    expect(scene.zones.map((zone) => zone.zoneId)).toEqual(['lead-desk', 'meeting-zone', 'growth-desk']);

    const appEngineering = scene.agents.find((agent) => agent.agentId === 'app-engineering');
    expect(appEngineering).toMatchObject({
      agentId: 'app-engineering',
      zoneId: 'meeting-zone',
      severity: 'orange',
      selected: true,
      rebootRecommended: true,
      openAlertCount: 1,
      hasOpenIncidents: true
    });
    expect(appEngineering?.characterKey).toMatch(/^f[1-8]$/);
    expect(appEngineering?.position.x).toBeGreaterThan(0);
    expect(appEngineering?.position.y).toBeGreaterThan(0);
  });

  it('falls back to a stable anchor when the derived zone is absent from overview zones', () => {
    const derivedWorld: WorldState = {
      ...world,
      agents: new Map(world.agents).set('team-lead', {
        ...world.agents.get('team-lead')!,
        phase: 'reviewing',
        zone: 'review-zone'
      })
    };

    const scene = adaptWorldToScene(derivedWorld, 'team-lead');
    const teamLead = scene.agents.find((agent) => agent.agentId === 'team-lead');

    expect(teamLead).toMatchObject({
      agentId: 'team-lead',
      zoneId: 'review-zone',
      selected: true
    });
    expect(teamLead?.position.x).not.toBeCloseTo(20.5 * scene.map.tileDim, 4);
    expect(teamLead?.position.y).not.toBeCloseTo(15.5 * scene.map.tileDim, 4);
  });

  it('projects only inbound and outbound watch edges for the selected agent', () => {
    const scene = adaptWorldToScene(world, 'app-engineering');

    expect(scene.watchEdges).toEqual([
      {
        fromAgentId: 'team-lead',
        toAgentId: 'app-engineering',
        watchMode: 'lead',
        riskLevel: 'orange'
      },
      {
        fromAgentId: 'app-engineering',
        toAgentId: 'growth-revenue',
        watchMode: 'peer',
        riskLevel: 'red'
      }
    ]);
  });

  it('keeps the supervision overlay empty when no agent is selected', () => {
    const scene = adaptWorldToScene(world, null);

    expect(scene.watchEdges).toEqual([]);
  });
});
