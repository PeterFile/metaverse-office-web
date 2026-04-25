import { describe, expect, it } from 'vitest';
import { projectWorldState } from './projector';
import type { ProjectorInput } from './projector';
import type {
  AgentWorkflow,
  IncidentFeedResponse,
  OfficeAgent,
  OfficeOverview,
} from '../types';

function makeAgent(overrides: Partial<OfficeAgent> = {}): OfficeAgent {
  return {
    agent_id: 'app-engineering',
    display_name: 'App Engineering Agent',
    kind: 'employee',
    current_state: 'coding',
    active_task: 'Implement handlers',
    current_location: 'desk-app-engineering',
    effective_severity: 'normal',
    reported_severity: 'normal',
    severity: 'normal',
    derived_staleness: {
      severity: 'normal',
      stale_for_ms: 0,
      stale_for_minutes: 0,
      last_meaningful_output_at: '2026-03-14T10:00:00Z',
    },
    reboot_recommended: false,
    ...overrides,
  };
}

function makeOverview(agents: OfficeAgent[] = [makeAgent()]): OfficeOverview {
  return {
    generated_at: '2026-03-14T10:05:00Z',
    summary: {
      agent_count: agents.length,
      blocked_count: 0,
      reboot_recommended_count: 0,
      severity_buckets: { normal: agents.length, yellow: 0, orange: 0, red: 0 },
    },
    zones: [
      {
        zone_id: 'desk-app-engineering',
        label: 'App Engineering Desk',
        kind: 'desk',
        grid_x: 4, grid_y: 1, grid_w: 1, grid_h: 1,
        home_agent_id: 'app-engineering',
        occupants: [],
      },
      {
        zone_id: 'meeting-zone',
        label: 'Meeting Zone',
        kind: 'shared',
        grid_x: 0, grid_y: 2, grid_w: 2, grid_h: 1,
        home_agent_id: null,
        occupants: [],
      },
      {
        zone_id: 'review-zone',
        label: 'Review Zone',
        kind: 'shared',
        grid_x: 2, grid_y: 2, grid_w: 2, grid_h: 1,
        home_agent_id: null,
        occupants: [],
      },
    ],
    watch_edges: [
      { from_agent_id: 'team-lead', to_agent_id: 'app-engineering', watch_mode: 'lead' },
    ],
    agents,
  };
}

function makeWorkflow(overrides: Partial<AgentWorkflow> = {}): AgentWorkflow {
  const { summary: overrideSummary, ...restOverrides } = overrides;

  return {
    agent_id: 'app-engineering',
    detail: {
      agent_id: 'app-engineering',
      display_name: 'App Engineering Agent',
      current_state: 'coding',
      active_task: 'Implement handlers',
      current_location: 'desk-app-engineering',
      latest_heartbeat: null,
      open_peer_watch_alerts: [],
      recent_events: [],
      recent_interactions: [],
      recent_incidents: [],
      recent_handoffs: [],
      recent_reboots: [],
    },
    summary: overrideSummary || {
      incident_count: 0,
      interaction_count: 0,
      event_count: 0,
      incident_kind_buckets: {},
      interaction_type_buckets: {},
      event_type_buckets: {},
      severity_buckets: {
        normal: 0,
        yellow: 0,
        orange: 0,
        red: 0,
      },
      latest_activity_at: null,
    },
    correlation_ids: [],
    counterparty_agent_ids: [],
    incidents: [],
    interactions: [],
    timeline: [],
    ...restOverrides,
  };
}

const NOW = '2026-03-14T10:05:00Z';

describe('projectWorldState', () => {
  it('returns empty world when overview is null', () => {
    const input: ProjectorInput = {
      overview: null,
      workflows: new Map(),
      incidentFeed: null,
      now: NOW,
    };
    const world = projectWorldState(input);
    expect(world.agents.size).toBe(0);
    expect(world.data_quality.overview_available).toBe(false);
    expect(world.data_quality.degraded_reasons).toContain('overview unavailable');
  });

  it('projects agent with correct phase and zone from overview only', () => {
    const input: ProjectorInput = {
      overview: makeOverview(),
      workflows: new Map(),
      incidentFeed: null,
      now: NOW,
    };
    const world = projectWorldState(input);
    const agent = world.agents.get('app-engineering');
    expect(agent).toBeDefined();
    expect(agent!.phase).toBe('active');
    expect(agent!.zone).toBe('desk-app-engineering');
    expect(agent!.raw_state).toBe('coding');
    expect(agent!.severity_reason).toContain('workflow unavailable');
  });

  it('projects reviewing agent to review-zone', () => {
    const input: ProjectorInput = {
      overview: makeOverview([makeAgent({ current_state: 'reviewing' })]),
      workflows: new Map(),
      incidentFeed: null,
      now: NOW,
    };
    const world = projectWorldState(input);
    const agent = world.agents.get('app-engineering')!;
    expect(agent.phase).toBe('reviewing');
    expect(agent.zone).toBe('review-zone');
  });

  it('materializes runtime-only zones missing from the overview', () => {
    const overview = makeOverview([makeAgent({ current_state: 'reviewing' })]);
    overview.zones = overview.zones.filter((zone) => zone.zone_id !== 'review-zone');

    const input: ProjectorInput = {
      overview,
      workflows: new Map(),
      incidentFeed: null,
      now: NOW,
    };
    const world = projectWorldState(input);

    expect(world.zones.map((zone) => zone.zone_id)).toEqual([
      'desk-app-engineering',
      'meeting-zone',
      'review-zone',
    ]);
    expect(world.zones.find((zone) => zone.zone_id === 'review-zone')).toMatchObject({
      label: 'Review Zone',
      kind: 'shared',
      home_agent_id: null,
      occupant_ids: ['app-engineering'],
    });
  });

  it('merges severity from staleness', () => {
    const input: ProjectorInput = {
      overview: makeOverview([
        makeAgent({
          derived_staleness: {
            severity: 'orange',
            stale_for_ms: 1800000,
            stale_for_minutes: 30,
            last_meaningful_output_at: '2026-03-14T09:35:00Z',
          },
        }),
      ]),
      workflows: new Map(),
      incidentFeed: null,
      now: NOW,
    };
    const world = projectWorldState(input);
    const agent = world.agents.get('app-engineering')!;
    expect(agent.severity).toBe('orange');
    expect(agent.severity_reason).toContain('staleness');
  });

  it('builds zone occupancy from derived zones', () => {
    const input: ProjectorInput = {
      overview: makeOverview(),
      workflows: new Map(),
      incidentFeed: null,
      now: NOW,
    };
    const world = projectWorldState(input);
    const deskZone = world.zones.find((z) => z.zone_id === 'desk-app-engineering');
    expect(deskZone?.occupant_ids).toEqual(['app-engineering']);
  });

  it('enriches watch edges with target severity', () => {
    const input: ProjectorInput = {
      overview: makeOverview([
        makeAgent({ effective_severity: 'red' }),
      ]),
      workflows: new Map(),
      incidentFeed: null,
      now: NOW,
    };
    const world = projectWorldState(input);
    const edge = world.watch_edges.find(
      (e) => e.to_agent_id === 'app-engineering'
    );
    expect(edge?.risk_level).toBe('red');
  });

  it('includes incident feed in world state', () => {
    const feed: IncidentFeedResponse = {
      items: [
        {
          incident_id: 'inc-1',
          kind: 'reboot',
          ts: '2026-03-14T10:00:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'requested',
          severity: 'red',
          summary: 'Reboot requested',
          correlation_id: 'corr-1',
          evidence_refs: [],
          counterparty_agent_ids: [],
          source_kind: 'controller_event',
        },
      ],
    };
    const input: ProjectorInput = {
      overview: makeOverview(),
      workflows: new Map(),
      incidentFeed: feed,
      now: NOW,
    };
    const world = projectWorldState(input);
    expect(world.incidents).toHaveLength(1);
    expect(world.incidents[0].incident_id).toBe('inc-1');
  });

  it('backfills incident-feed severity and handoff phase without workflow coverage while keeping alert counts peer-watch specific', () => {
    const feed: IncidentFeedResponse = {
      items: [
        {
          incident_id: 'inc-alert',
          kind: 'peer_watch_alert',
          ts: '2026-03-14T10:00:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'open',
          severity: 'orange',
          summary: 'Peer-watch alert raised',
          correlation_id: 'corr-1',
          evidence_refs: [],
          counterparty_agent_ids: [],
          source_kind: 'controller_event',
        },
        {
          incident_id: 'inc-active-2',
          kind: 'handoff',
          ts: '2026-03-14T10:01:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'waiting',
          severity: 'yellow',
          summary: 'Handoff waiting',
          correlation_id: 'corr-2',
          evidence_refs: [],
          counterparty_agent_ids: ['team-lead'],
          source_kind: 'controller_event',
        },
        {
          incident_id: 'inc-completed',
          kind: 'handoff',
          ts: '2026-03-14T09:55:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'completed',
          severity: 'red',
          summary: 'Completed handoff',
          correlation_id: 'corr-3',
          evidence_refs: [],
          counterparty_agent_ids: ['team-lead'],
          source_kind: 'controller_event',
        },
      ],
    };
    const input: ProjectorInput = {
      overview: makeOverview(),
      workflows: new Map(),
      incidentFeed: feed,
      now: NOW,
    };

    const world = projectWorldState(input);
    const agent = world.agents.get('app-engineering')!;
    const edge = world.watch_edges.find((candidate) => candidate.to_agent_id === 'app-engineering');

    expect(agent.open_alert_count).toBe(1);
    expect(agent.has_open_incidents).toBe(true);
    expect(agent.phase).toBe('handoff_pending');
    expect(agent.zone).toBe('meeting-zone');
    expect(agent.severity).toBe('orange');
    expect(agent.severity_reason).toBe('open incident (workflow unavailable)');
    expect(world.summary.highest_severity).toBe('orange');
    expect(edge?.risk_level).toBe('orange');
  });

  it('does not backfill crew runtime risk from a saturated incident feed window', () => {
    const feed: IncidentFeedResponse = {
      items: [
        {
          incident_id: 'inc-alert-saturated',
          kind: 'peer_watch_alert',
          ts: '2026-03-14T10:00:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'open',
          severity: 'orange',
          summary: 'Feed window hit its limit before the crew-wide slice completed',
          correlation_id: 'corr-saturated-alert',
          evidence_refs: [],
          counterparty_agent_ids: [],
          source_kind: 'controller_event',
        },
        {
          incident_id: 'inc-handoff-saturated',
          kind: 'handoff',
          ts: '2026-03-14T10:01:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'waiting',
          severity: 'yellow',
          summary: 'Handoff waiting inside a saturated global incident window',
          correlation_id: 'corr-saturated-handoff',
          evidence_refs: [],
          counterparty_agent_ids: ['growth-revenue'],
          source_kind: 'controller_event',
        },
      ],
    };
    const input: ProjectorInput = {
      overview: makeOverview(),
      workflows: new Map(),
      incidentFeed: feed,
      incidentFeedLimit: 2,
      now: NOW,
    };

    const world = projectWorldState(input);
    const agent = world.agents.get('app-engineering')!;

    expect(agent.open_alert_count).toBe(0);
    expect(agent.has_open_incidents).toBe(false);
    expect(agent.phase).toBe('active');
    expect(agent.zone).toBe('desk-app-engineering');
    expect(agent.severity).toBe('normal');
    expect(agent.severity_reason).toBe('reported (workflow unavailable)');
    expect(world.data_quality.degraded_reasons).toContain('incident feed truncated');
  });

  it('keeps workflow-derived runtime risk authoritative when incident feed also has active items', () => {
    const wf = makeWorkflow();
    const feed: IncidentFeedResponse = {
      items: [
        {
          incident_id: 'inc-feed',
          kind: 'reboot',
          ts: '2026-03-14T10:00:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'requested',
          severity: 'red',
          summary: 'Feed reboot requested',
          correlation_id: 'corr-feed',
          evidence_refs: [],
          counterparty_agent_ids: [],
          source_kind: 'controller_event',
        },
      ],
    };
    const input: ProjectorInput = {
      overview: makeOverview(),
      workflows: new Map([['app-engineering', wf]]),
      incidentFeed: feed,
      now: NOW,
    };

    const world = projectWorldState(input);
    const agent = world.agents.get('app-engineering')!;

    expect(agent.open_alert_count).toBe(0);
    expect(agent.has_open_incidents).toBe(false);
    expect(agent.phase).toBe('active');
    expect(agent.zone).toBe('desk-app-engineering');
    expect(agent.severity).toBe('normal');
    expect(agent.severity_reason).toBe('reported');
  });

  it('ignores stale active feed entries when a newer incident lifecycle record has resolved or completed', () => {
    const feed: IncidentFeedResponse = {
      items: [
        {
          incident_id: 'handoff-waiting',
          kind: 'handoff',
          ts: '2026-03-14T10:00:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'waiting',
          severity: 'yellow',
          summary: 'Earlier handoff waiting',
          correlation_id: 'corr-resolved',
          evidence_refs: [],
          counterparty_agent_ids: ['growth-revenue'],
          source_kind: 'controller_event',
        },
        {
          incident_id: 'handoff-completed',
          kind: 'handoff',
          ts: '2026-03-14T10:02:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'completed',
          severity: 'yellow',
          summary: 'Later handoff completed',
          correlation_id: 'corr-resolved',
          evidence_refs: [],
          counterparty_agent_ids: ['growth-revenue'],
          source_kind: 'controller_event',
        },
        {
          incident_id: 'alert-open',
          kind: 'peer_watch_alert',
          ts: '2026-03-14T10:01:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'open',
          severity: 'orange',
          summary: 'Earlier alert open',
          correlation_id: 'corr-alert',
          evidence_refs: [],
          counterparty_agent_ids: [],
          source_kind: 'controller_event',
        },
        {
          incident_id: 'alert-resolved',
          kind: 'peer_watch_alert',
          ts: '2026-03-14T10:03:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'resolved',
          severity: 'orange',
          summary: 'Later alert resolved',
          correlation_id: 'corr-alert',
          evidence_refs: [],
          counterparty_agent_ids: [],
          source_kind: 'controller_event',
        },
      ],
    };
    const input: ProjectorInput = {
      overview: makeOverview(),
      workflows: new Map(),
      incidentFeed: feed,
      now: NOW,
    };

    const world = projectWorldState(input);
    const agent = world.agents.get('app-engineering')!;

    expect(agent.open_alert_count).toBe(0);
    expect(agent.has_open_incidents).toBe(false);
  });

  it('closes a handoff lifecycle even when a later actor records the completion', () => {
    const feed: IncidentFeedResponse = {
      items: [
        {
          incident_id: 'handoff-1',
          kind: 'handoff',
          ts: '2026-03-14T10:00:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'waiting',
          severity: 'yellow',
          summary: 'Handoff waiting',
          correlation_id: 'corr-actor-shift',
          evidence_refs: [],
          counterparty_agent_ids: ['growth-revenue'],
          source_kind: 'controller_event',
        },
        {
          incident_id: 'handoff-1',
          kind: 'handoff',
          ts: '2026-03-14T10:02:00Z',
          agent_id: 'app-engineering',
          actor_id: 'ops-lead',
          status: 'completed',
          severity: 'yellow',
          summary: 'Different actor recorded the completion',
          correlation_id: 'corr-actor-shift',
          evidence_refs: [],
          counterparty_agent_ids: ['growth-revenue'],
          source_kind: 'controller_event',
        },
      ],
    };
    const input: ProjectorInput = {
      overview: makeOverview(),
      workflows: new Map(),
      incidentFeed: feed,
      now: NOW,
    };

    const world = projectWorldState(input);
    const agent = world.agents.get('app-engineering')!;

    expect(agent.phase).toBe('handoff_done');
    expect(agent.has_open_incidents).toBe(false);
    expect(agent.severity).toBe('normal');
    expect(agent.severity_reason).toBe('reported (workflow unavailable)');
  });

  it('closes a handoff lifecycle even when the counterparty set changes before completion', () => {
    const feed: IncidentFeedResponse = {
      items: [
        {
          incident_id: 'handoff-counterparty-open',
          kind: 'handoff',
          ts: '2026-03-14T10:00:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'waiting',
          severity: 'yellow',
          summary: 'Handoff waiting with an earlier counterparty set',
          correlation_id: 'corr-counterparty-drift',
          evidence_refs: [],
          counterparty_agent_ids: ['growth-revenue'],
          source_kind: 'controller_event',
        },
        {
          incident_id: 'handoff-counterparty-completed',
          kind: 'handoff',
          ts: '2026-03-14T10:02:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'completed',
          severity: 'yellow',
          summary: 'Same handoff completed after the counterparty set drifted',
          correlation_id: 'corr-counterparty-drift',
          evidence_refs: [],
          counterparty_agent_ids: [],
          source_kind: 'controller_event',
        },
      ],
    };
    const input: ProjectorInput = {
      overview: makeOverview(),
      workflows: new Map(),
      incidentFeed: feed,
      now: NOW,
    };

    const world = projectWorldState(input);
    const agent = world.agents.get('app-engineering')!;

    expect(agent.phase).toBe('handoff_done');
    expect(agent.has_open_incidents).toBe(false);
    expect(agent.severity).toBe('normal');
    expect(agent.severity_reason).toBe('reported (workflow unavailable)');
  });

  it('keeps null-correlation handoff rows independent instead of collapsing unrelated lifecycle records', () => {
    const feed: IncidentFeedResponse = {
      items: [
        {
          incident_id: 'handoff-null-active',
          kind: 'handoff',
          ts: '2026-03-14T10:00:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'waiting',
          severity: 'yellow',
          summary: 'Null-correlation handoff is still waiting',
          correlation_id: null,
          evidence_refs: [],
          counterparty_agent_ids: ['growth-revenue'],
          source_kind: 'controller_event',
        },
        {
          incident_id: 'handoff-null-completed-unrelated',
          kind: 'handoff',
          ts: '2026-03-14T10:03:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'completed',
          severity: 'yellow',
          summary: 'Unrelated null-correlation handoff completed later',
          correlation_id: null,
          evidence_refs: [],
          counterparty_agent_ids: ['protocol-engineering'],
          source_kind: 'controller_event',
        },
      ],
    };
    const input: ProjectorInput = {
      overview: makeOverview(),
      workflows: new Map(),
      incidentFeed: feed,
      now: NOW,
    };

    const world = projectWorldState(input);
    const agent = world.agents.get('app-engineering')!;

    expect(agent.phase).toBe('handoff_pending');
    expect(agent.zone).toBe('meeting-zone');
    expect(agent.has_open_incidents).toBe(true);
    expect(agent.severity).toBe('yellow');
    expect(agent.severity_reason).toBe('open incident (workflow unavailable)');
  });

  it('does not treat long-ago completed handoffs as recent phase backfill', () => {
    const feed: IncidentFeedResponse = {
      items: [
        {
          incident_id: 'handoff-completed-old',
          kind: 'handoff',
          ts: '2026-03-14T08:00:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'completed',
          severity: 'yellow',
          summary: 'Old handoff completion should not keep the agent in handoff_done',
          correlation_id: 'corr-old-handoff',
          evidence_refs: [],
          counterparty_agent_ids: ['growth-revenue'],
          source_kind: 'controller_event',
        },
      ],
    };
    const input: ProjectorInput = {
      overview: makeOverview(),
      workflows: new Map(),
      incidentFeed: feed,
      now: NOW,
    };

    const world = projectWorldState(input);
    const agent = world.agents.get('app-engineering')!;

    expect(agent.phase).toBe('active');
    expect(agent.zone).toBe('desk-app-engineering');
    expect(agent.has_open_incidents).toBe(false);
    expect(agent.severity).toBe('normal');
    expect(agent.severity_reason).toBe('reported (workflow unavailable)');
  });

  it('does not treat long-ago completed reboots as recent phase backfill', () => {
    const feed: IncidentFeedResponse = {
      items: [
        {
          incident_id: 'reboot-completed-old',
          kind: 'reboot',
          ts: '2026-03-14T08:00:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'completed',
          severity: 'yellow',
          summary: 'Old reboot completion should not keep the agent in recovered',
          correlation_id: 'corr-old-reboot',
          evidence_refs: [],
          counterparty_agent_ids: [],
          source_kind: 'controller_event',
        },
      ],
    };
    const input: ProjectorInput = {
      overview: makeOverview(),
      workflows: new Map(),
      incidentFeed: feed,
      now: NOW,
    };

    const world = projectWorldState(input);
    const agent = world.agents.get('app-engineering')!;

    expect(agent.phase).toBe('active');
    expect(agent.zone).toBe('desk-app-engineering');
    expect(agent.has_open_incidents).toBe(false);
    expect(agent.severity).toBe('normal');
    expect(agent.severity_reason).toBe('reported (workflow unavailable)');
  });

  it('prefers the completed handoff state when same-lifecycle records share a timestamp', () => {
    const feed: IncidentFeedResponse = {
      items: [
        {
          incident_id: 'handoff-same-ts-waiting',
          kind: 'handoff',
          ts: '2026-03-14T10:00:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'waiting',
          severity: 'yellow',
          summary: 'Waiting state recorded at coarse timestamp precision',
          correlation_id: 'corr-same-ts-handoff',
          evidence_refs: [],
          counterparty_agent_ids: ['growth-revenue'],
          source_kind: 'controller_event',
        },
        {
          incident_id: 'handoff-same-ts-completed',
          kind: 'handoff',
          ts: '2026-03-14T10:00:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'completed',
          severity: 'yellow',
          summary: 'Completion landed in the same timestamp bucket',
          correlation_id: 'corr-same-ts-handoff',
          evidence_refs: [],
          counterparty_agent_ids: ['growth-revenue'],
          source_kind: 'controller_event',
        },
      ],
    };
    const input: ProjectorInput = {
      overview: makeOverview(),
      workflows: new Map(),
      incidentFeed: feed,
      now: NOW,
    };

    const world = projectWorldState(input);
    const agent = world.agents.get('app-engineering')!;

    expect(agent.phase).toBe('handoff_done');
    expect(agent.has_open_incidents).toBe(false);
    expect(agent.severity).toBe('normal');
    expect(agent.severity_reason).toBe('reported (workflow unavailable)');
  });

  it('does not keep collector peer-watch alerts open after a later collector resolution event', () => {
    const feed: IncidentFeedResponse = {
      items: [
        {
          incident_id: 'collector-alert-open',
          kind: 'peer_watch_alert',
          ts: '2026-03-14T10:00:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'open',
          severity: 'orange',
          summary: 'Collector saw the agent blocked',
          correlation_id: 'collector-snapshot:2026-03-14T10:00:00.000Z',
          evidence_refs: [],
          counterparty_agent_ids: ['team-lead'],
          source_kind: 'controller_event',
        },
        {
          incident_id: 'collector-alert-resolved',
          kind: 'peer_watch_alert',
          ts: '2026-03-14T10:05:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'resolved',
          severity: 'orange',
          summary: 'Collector saw the agent recover',
          correlation_id: 'collector-snapshot:2026-03-14T10:05:00.000Z',
          evidence_refs: [],
          counterparty_agent_ids: ['team-lead'],
          source_kind: 'controller_event',
        },
      ],
    };
    const input: ProjectorInput = {
      overview: makeOverview(),
      workflows: new Map(),
      incidentFeed: feed,
      now: NOW,
    };

    const world = projectWorldState(input);
    const agent = world.agents.get('app-engineering')!;

    expect(agent.open_alert_count).toBe(0);
    expect(agent.has_open_incidents).toBe(false);
    expect(agent.severity).toBe('normal');
    expect(agent.severity_reason).toBe('reported (workflow unavailable)');
  });

  it('closes collector peer-watch alerts even when the watcher set changes before resolution', () => {
    const feed: IncidentFeedResponse = {
      items: [
        {
          incident_id: 'collector-alert-open-watcher-drift',
          kind: 'peer_watch_alert',
          ts: '2026-03-14T10:00:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'open',
          severity: 'orange',
          summary: 'Collector flagged the agent while lead was watching',
          correlation_id: 'collector-snapshot:2026-03-14T10:00:00.000Z',
          evidence_refs: [],
          counterparty_agent_ids: ['team-lead'],
          source_kind: 'controller_event',
        },
        {
          incident_id: 'collector-alert-resolved-watcher-drift',
          kind: 'peer_watch_alert',
          ts: '2026-03-14T10:05:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'resolved',
          severity: 'orange',
          summary: 'Collector resolved the alert after watcher drift',
          correlation_id: 'collector-snapshot:2026-03-14T10:05:00.000Z',
          evidence_refs: [],
          counterparty_agent_ids: ['protocol-engineering'],
          source_kind: 'controller_event',
        },
      ],
    };
    const input: ProjectorInput = {
      overview: makeOverview(),
      workflows: new Map(),
      incidentFeed: feed,
      now: NOW,
    };

    const world = projectWorldState(input);
    const agent = world.agents.get('app-engineering')!;

    expect(agent.open_alert_count).toBe(0);
    expect(agent.has_open_incidents).toBe(false);
    expect(agent.severity).toBe('normal');
    expect(agent.severity_reason).toBe('reported (workflow unavailable)');
  });

  it('closes collector peer-watch alerts even when the actor changes before resolution', () => {
    const feed: IncidentFeedResponse = {
      items: [
        {
          incident_id: 'collector-alert-open-actor-drift',
          kind: 'peer_watch_alert',
          ts: '2026-03-14T10:00:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'open',
          severity: 'orange',
          summary: 'Collector opened the alert under the original actor',
          correlation_id: 'collector-snapshot:2026-03-14T10:00:00.000Z',
          evidence_refs: [],
          counterparty_agent_ids: ['team-lead'],
          source_kind: 'controller_event',
        },
        {
          incident_id: 'collector-alert-resolved-actor-drift',
          kind: 'peer_watch_alert',
          ts: '2026-03-14T10:05:00Z',
          agent_id: 'app-engineering',
          actor_id: 'ops-lead',
          status: 'resolved',
          severity: 'orange',
          summary: 'Collector resolved the alert after actor rotation',
          correlation_id: 'collector-snapshot:2026-03-14T10:05:00.000Z',
          evidence_refs: [],
          counterparty_agent_ids: ['team-lead'],
          source_kind: 'controller_event',
        },
      ],
    };
    const input: ProjectorInput = {
      overview: makeOverview(),
      workflows: new Map(),
      incidentFeed: feed,
      now: NOW,
    };

    const world = projectWorldState(input);
    const agent = world.agents.get('app-engineering')!;

    expect(agent.open_alert_count).toBe(0);
    expect(agent.has_open_incidents).toBe(false);
    expect(agent.severity).toBe('normal');
    expect(agent.severity_reason).toBe('reported (workflow unavailable)');
  });

  it('keeps non-collector peer-watch alerts open when another observer resolves the same correlation', () => {
    const feed: IncidentFeedResponse = {
      items: [
        {
          incident_id: 'peer-watch-open-actor-drift',
          kind: 'peer_watch_alert',
          ts: '2026-03-14T10:00:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'open',
          severity: 'orange',
          summary: 'Peer-watch alert opened under the original observer',
          correlation_id: 'corr-actor-drift',
          evidence_refs: [],
          counterparty_agent_ids: ['growth-revenue'],
          source_kind: 'controller_event',
        },
        {
          incident_id: 'peer-watch-resolved-actor-drift',
          kind: 'peer_watch_alert',
          ts: '2026-03-14T10:05:00Z',
          agent_id: 'app-engineering',
          actor_id: 'ops-lead',
          status: 'resolved',
          severity: 'orange',
          summary: 'A different observer resolved its matching alert',
          correlation_id: 'corr-actor-drift',
          evidence_refs: [],
          counterparty_agent_ids: ['growth-revenue'],
          source_kind: 'controller_event',
        },
      ],
    };
    const input: ProjectorInput = {
      overview: makeOverview(),
      workflows: new Map(),
      incidentFeed: feed,
      now: NOW,
    };

    const world = projectWorldState(input);
    const agent = world.agents.get('app-engineering')!;

    expect(agent.open_alert_count).toBe(1);
    expect(agent.has_open_incidents).toBe(true);
    expect(agent.severity).toBe('orange');
    expect(agent.severity_reason).toBe('open incident (workflow unavailable)');
  });

  it('keeps distinct peer-watch alerts open when they share correlation metadata', () => {
    const feed: IncidentFeedResponse = {
      items: [
        {
          incident_id: 'alert-open-1',
          kind: 'peer_watch_alert',
          ts: '2026-03-14T10:00:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'open',
          severity: 'orange',
          summary: 'First open alert on the same correlation',
          correlation_id: 'corr-shared-alert',
          evidence_refs: ['/tmp/alert-1.md'],
          counterparty_agent_ids: ['growth-revenue'],
          source_kind: 'controller_event',
        },
        {
          incident_id: 'alert-open-2',
          kind: 'peer_watch_alert',
          ts: '2026-03-14T10:01:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'open',
          severity: 'red',
          summary: 'Second open alert on the same correlation',
          correlation_id: 'corr-shared-alert',
          evidence_refs: ['/tmp/alert-2.md'],
          counterparty_agent_ids: ['growth-revenue'],
          source_kind: 'controller_event',
        },
      ],
    };
    const input: ProjectorInput = {
      overview: makeOverview(),
      workflows: new Map(),
      incidentFeed: feed,
      now: NOW,
    };

    const world = projectWorldState(input);
    const agent = world.agents.get('app-engineering')!;

    expect(agent.open_alert_count).toBe(2);
    expect(agent.has_open_incidents).toBe(true);
    expect(agent.severity).toBe('red');
    expect(agent.severity_reason).toBe('open incident (workflow unavailable)');
  });

  it('resolves only one duplicate peer-watch alert per later resolution event', () => {
    const feed: IncidentFeedResponse = {
      items: [
        {
          incident_id: 'alert-open-1',
          kind: 'peer_watch_alert',
          ts: '2026-03-14T10:00:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'open',
          severity: 'orange',
          summary: 'First duplicate open alert',
          correlation_id: 'corr-shared-alert',
          evidence_refs: ['/tmp/alert-1.md'],
          counterparty_agent_ids: ['growth-revenue'],
          source_kind: 'controller_event',
        },
        {
          incident_id: 'alert-open-2',
          kind: 'peer_watch_alert',
          ts: '2026-03-14T10:01:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'open',
          severity: 'red',
          summary: 'Second duplicate open alert',
          correlation_id: 'corr-shared-alert',
          evidence_refs: ['/tmp/alert-2.md'],
          counterparty_agent_ids: ['growth-revenue'],
          source_kind: 'controller_event',
        },
        {
          incident_id: 'alert-resolved-1',
          kind: 'peer_watch_alert',
          ts: '2026-03-14T10:02:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'resolved',
          severity: 'red',
          summary: 'A later resolution should only close one duplicate alert',
          correlation_id: 'corr-shared-alert',
          evidence_refs: ['/tmp/alert-resolved.md'],
          counterparty_agent_ids: ['growth-revenue'],
          source_kind: 'controller_event',
        },
      ],
    };
    const input: ProjectorInput = {
      overview: makeOverview(),
      workflows: new Map(),
      incidentFeed: feed,
      now: NOW,
    };

    const world = projectWorldState(input);
    const agent = world.agents.get('app-engineering')!;

    expect(agent.open_alert_count).toBe(1);
    expect(agent.has_open_incidents).toBe(true);
    expect(agent.severity).not.toBe('normal');
  });

  it('does not project recovered when a completed reboot is followed by another active reboot incident', () => {
    const feed: IncidentFeedResponse = {
      items: [
        {
          incident_id: 'reboot-completed',
          kind: 'reboot',
          ts: '2026-03-14T10:00:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'completed',
          severity: 'yellow',
          summary: 'Earlier reboot finished',
          correlation_id: 'corr-reboot-completed',
          evidence_refs: [],
          counterparty_agent_ids: [],
          source_kind: 'controller_event',
        },
        {
          incident_id: 'reboot-requested',
          kind: 'reboot',
          ts: '2026-03-14T10:04:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'requested',
          severity: 'red',
          summary: 'A later reboot is still pending',
          correlation_id: 'corr-reboot-requested',
          evidence_refs: [],
          counterparty_agent_ids: [],
          source_kind: 'controller_event',
        },
      ],
    };
    const input: ProjectorInput = {
      overview: makeOverview(),
      workflows: new Map(),
      incidentFeed: feed,
      now: NOW,
    };

    const world = projectWorldState(input);
    const agent = world.agents.get('app-engineering')!;

    expect(agent.phase).toBe('active');
    expect(agent.zone).toBe('desk-app-engineering');
    expect(agent.has_open_incidents).toBe(true);
    expect(agent.severity).toBe('red');
    expect(agent.severity_reason).toBe('open incident (workflow unavailable)');
  });

  it('keeps an older active handoff lifecycle authoritative over a newer completed handoff for the same agent', () => {
    const feed: IncidentFeedResponse = {
      items: [
        {
          incident_id: 'handoff-open',
          kind: 'handoff',
          ts: '2026-03-14T10:00:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'waiting',
          severity: 'yellow',
          summary: 'Older handoff still waiting',
          correlation_id: 'corr-open-handoff',
          evidence_refs: [],
          counterparty_agent_ids: ['growth-revenue'],
          source_kind: 'controller_event',
        },
        {
          incident_id: 'handoff-completed',
          kind: 'handoff',
          ts: '2026-03-14T10:02:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'completed',
          severity: 'yellow',
          summary: 'Separate handoff already completed',
          correlation_id: 'corr-completed-handoff',
          evidence_refs: [],
          counterparty_agent_ids: ['protocol-engineering'],
          source_kind: 'controller_event',
        },
      ],
    };
    const input: ProjectorInput = {
      overview: makeOverview(),
      workflows: new Map(),
      incidentFeed: feed,
      now: NOW,
    };

    const world = projectWorldState(input);
    const agent = world.agents.get('app-engineering')!;

    expect(agent.phase).toBe('handoff_pending');
    expect(agent.zone).toBe('meeting-zone');
    expect(agent.has_open_incidents).toBe(true);
    expect(agent.severity).toBe('yellow');
    expect(agent.severity_reason).toBe('open incident (workflow unavailable)');
  });

  it('marks workflow coverage as partial when incident-feed backfill is the only runtime evidence for an agent', () => {
    const feed: IncidentFeedResponse = {
      items: [
        {
          incident_id: 'alert-coverage-gap',
          kind: 'peer_watch_alert',
          ts: '2026-03-14T10:01:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'open',
          severity: 'orange',
          summary: 'Backfilled from incident feed only',
          correlation_id: 'corr-coverage-gap',
          evidence_refs: [],
          counterparty_agent_ids: [],
          source_kind: 'controller_event',
        },
      ],
    };
    const input: ProjectorInput = {
      overview: makeOverview(),
      workflows: new Map(),
      incidentFeed: feed,
      now: NOW,
    };

    const world = projectWorldState(input);

    expect(world.data_quality.degraded_reasons).toContain('workflow partial');
  });

  it('marks workflow coverage as partial when only one selected workflow is loaded and another agent relies on backfill', () => {
    const appAgent = makeAgent();
    const growthAgent = makeAgent({
      agent_id: 'growth-revenue',
      display_name: 'Growth Revenue Agent',
      current_location: 'review-zone',
    });
    const feed: IncidentFeedResponse = {
      items: [
        {
          incident_id: 'growth-alert-open',
          kind: 'peer_watch_alert',
          ts: '2026-03-14T10:01:00Z',
          agent_id: 'growth-revenue',
          actor_id: 'team-lead',
          status: 'open',
          severity: 'orange',
          summary: 'Growth revenue still relies on incident-feed backfill',
          correlation_id: 'corr-growth-open',
          evidence_refs: [],
          counterparty_agent_ids: ['team-lead'],
          source_kind: 'controller_event',
        },
      ],
    };
    const input: ProjectorInput = {
      overview: makeOverview([appAgent, growthAgent]),
      workflows: new Map([['app-engineering', makeWorkflow()]]),
      incidentFeed: feed,
      now: NOW,
    };

    const world = projectWorldState(input);

    expect(world.data_quality.degraded_reasons).toContain('workflow partial');
  });

  it('does not mark workflow partial during lazy selected-agent workflow loading', () => {
    const appAgent = makeAgent();
    const growthAgent = makeAgent({
      agent_id: 'growth-revenue',
      display_name: 'Growth Revenue Agent',
      current_location: 'review-zone',
    });
    const feed: IncidentFeedResponse = {
      items: [
        {
          incident_id: 'growth-alert-open',
          kind: 'peer_watch_alert',
          ts: '2026-03-14T10:01:00Z',
          agent_id: 'growth-revenue',
          actor_id: 'team-lead',
          status: 'open',
          severity: 'orange',
          summary: 'Growth revenue is blocked while only the selected workflow is loaded',
          correlation_id: 'corr-growth-open',
          evidence_refs: [],
          counterparty_agent_ids: ['team-lead'],
          source_kind: 'controller_event',
        },
      ],
    };
    const input: ProjectorInput = {
      overview: makeOverview([appAgent, growthAgent]),
      workflows: new Map(),
      incidentFeed: feed,
      selectedAgentWorkflowPending: true,
      now: NOW,
    };

    const world = projectWorldState(input);
    const growthProjected = world.agents.get('growth-revenue')!;

    expect(growthProjected.has_open_incidents).toBe(true);
    expect(growthProjected.severity).toBe('orange');
    expect(world.data_quality.degraded_reasons).not.toContain('workflow partial');
  });

  it('does not mark workflow partial when unresolved runtime backfill is absent', () => {
    const feed: IncidentFeedResponse = {
      items: [
        {
          incident_id: 'alert-resolved-only',
          kind: 'peer_watch_alert',
          ts: '2026-03-14T10:02:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'resolved',
          severity: 'orange',
          summary: 'Resolved alert should not degrade runtime coverage by itself',
          correlation_id: 'corr-resolved-only',
          evidence_refs: [],
          counterparty_agent_ids: [],
          source_kind: 'controller_event',
        },
      ],
    };
    const input: ProjectorInput = {
      overview: makeOverview(),
      workflows: new Map(),
      incidentFeed: feed,
      now: NOW,
    };

    const world = projectWorldState(input);
    const agent = world.agents.get('app-engineering')!;

    expect(agent.has_open_incidents).toBe(false);
    expect(agent.severity).toBe('normal');
    expect(world.data_quality.degraded_reasons).not.toContain('workflow partial');
  });

  it('does not mark workflow partial when only historical completed lifecycle backfill remains', () => {
    const feed: IncidentFeedResponse = {
      items: [
        {
          incident_id: 'handoff-completed-old',
          kind: 'handoff',
          ts: '2026-03-14T08:00:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'completed',
          severity: 'yellow',
          summary: 'Historical handoff completed well before the recent lookback window',
          correlation_id: 'corr-old-handoff',
          evidence_refs: [],
          counterparty_agent_ids: ['growth-revenue'],
          source_kind: 'controller_event',
        },
      ],
    };
    const input: ProjectorInput = {
      overview: makeOverview(),
      workflows: new Map(),
      incidentFeed: feed,
      now: NOW,
    };

    const world = projectWorldState(input);
    const agent = world.agents.get('app-engineering')!;

    expect(agent.phase).toBe('active');
    expect(agent.has_open_incidents).toBe(false);
    expect(agent.severity).toBe('normal');
    expect(world.data_quality.degraded_reasons).not.toContain('workflow partial');
  });

  it('derives handoff_active phase from workflow', () => {
    const wf = makeWorkflow({
      detail: {
        ...makeWorkflow().detail,
        recent_handoffs: [
          {
            handoff_id: 'h-1',
            ts: '2026-03-14T10:00:00Z',
            agent_id: 'app-engineering',
            actor_id: 'team-lead',
            phase: 'started',
            status: 'started',
            severity: 'yellow',
            summary: 'Handoff started',
            counterparty_agent_ids: ['growth-revenue'],
            evidence_refs: [],
            correlation_id: null,
            source_kind: 'controller_event',
          },
        ],
      },
      incidents: [
        {
          incident_id: 'handoff-1',
          kind: 'handoff',
          ts: '2026-03-14T10:00:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'started',
          severity: 'yellow',
          summary: 'Handoff started',
          correlation_id: null,
          evidence_refs: [],
          counterparty_agent_ids: ['growth-revenue'],
          source_kind: 'controller_event',
        },
      ],
    });
    const input: ProjectorInput = {
      overview: makeOverview(),
      workflows: new Map([['app-engineering', wf]]),
      incidentFeed: null,
      now: NOW,
    };
    const world = projectWorldState(input);
    const agent = world.agents.get('app-engineering')!;
    expect(agent.phase).toBe('handoff_active');
    expect(agent.zone).toBe('meeting-zone');
    expect(agent.has_open_incidents).toBe(true);
  });

  it('uses the newest handoff status instead of historical started entries', () => {
    const wf = makeWorkflow({
      detail: {
        ...makeWorkflow().detail,
        recent_handoffs: [
          {
            handoff_id: 'h-2',
            ts: '2026-03-14T10:05:00Z',
            agent_id: 'app-engineering',
            actor_id: 'team-lead',
            phase: 'completed',
            status: 'completed',
            severity: 'yellow',
            summary: 'Handoff completed',
            counterparty_agent_ids: ['growth-revenue'],
            evidence_refs: [],
            correlation_id: null,
            source_kind: 'controller_event',
          },
          {
            handoff_id: 'h-1',
            ts: '2026-03-14T10:00:00Z',
            agent_id: 'app-engineering',
            actor_id: 'team-lead',
            phase: 'started',
            status: 'started',
            severity: 'yellow',
            summary: 'Handoff started',
            counterparty_agent_ids: ['growth-revenue'],
            evidence_refs: [],
            correlation_id: null,
            source_kind: 'controller_event',
          },
        ],
      },
      incidents: [
        {
          incident_id: 'handoff-1',
          kind: 'handoff',
          ts: '2026-03-14T10:00:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'started',
          severity: 'yellow',
          summary: 'Handoff started',
          correlation_id: null,
          evidence_refs: [],
          counterparty_agent_ids: ['growth-revenue'],
          source_kind: 'controller_event',
        },
        {
          incident_id: 'handoff-2',
          kind: 'handoff',
          ts: '2026-03-14T10:05:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'completed',
          severity: 'yellow',
          summary: 'Handoff completed',
          correlation_id: null,
          evidence_refs: [],
          counterparty_agent_ids: ['growth-revenue'],
          source_kind: 'controller_event',
        },
      ],
    });
    const input: ProjectorInput = {
      overview: makeOverview(),
      workflows: new Map([['app-engineering', wf]]),
      incidentFeed: null,
      now: NOW,
    };
    const world = projectWorldState(input);
    const agent = world.agents.get('app-engineering')!;
    expect(agent.phase).toBe('handoff_done');
    expect(agent.has_open_incidents).toBe(false);
  });

  it('derives handoff_pending from the newest waiting incident', () => {
    const wf = makeWorkflow({
      incidents: [
        {
          incident_id: 'handoff-waiting',
          kind: 'handoff',
          ts: '2026-03-14T10:02:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'waiting',
          severity: 'yellow',
          summary: 'Waiting on lead approval',
          correlation_id: null,
          evidence_refs: [],
          counterparty_agent_ids: ['team-lead'],
          source_kind: 'controller_event',
        },
      ],
    });
    const input: ProjectorInput = {
      overview: makeOverview(),
      workflows: new Map([['app-engineering', wf]]),
      incidentFeed: null,
      now: NOW,
    };
    const world = projectWorldState(input);
    const agent = world.agents.get('app-engineering')!;
    expect(agent.phase).toBe('handoff_pending');
    expect(agent.zone).toBe('meeting-zone');
    expect(agent.has_open_incidents).toBe(true);
  });

  it('does not raise severity from completed incidents only', () => {
    const wf = makeWorkflow({
      incidents: [
        {
          incident_id: 'handoff-complete',
          kind: 'handoff',
          ts: '2026-03-14T10:00:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'completed',
          severity: 'red',
          summary: 'Completed handoff should not keep severity elevated',
          correlation_id: null,
          evidence_refs: [],
          counterparty_agent_ids: ['growth-revenue'],
          source_kind: 'controller_event',
        },
      ],
    });
    const input: ProjectorInput = {
      overview: makeOverview(),
      workflows: new Map([['app-engineering', wf]]),
      incidentFeed: null,
      now: NOW,
    };
    const world = projectWorldState(input);
    const agent = world.agents.get('app-engineering')!;
    expect(agent.severity).toBe('normal');
    expect(agent.severity_reason).not.toContain('open incident');
  });

  it('extracts trail from workflow timeline', () => {
    const wf = makeWorkflow({
      timeline: [
        {
          event_id: 'evt-1',
          ts: '2026-03-14T10:00:00Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          event_type: 'agent_state_changed',
          severity: 'normal',
          current_state: 'coding',
          location: 'desk-app-engineering',
          summary: 'State changed',
          correlation_id: null,
          counterparty_agent_ids: [],
          evidence_refs: [],
          source_kind: 'controller_event',
        },
      ],
    });
    const input: ProjectorInput = {
      overview: makeOverview(),
      workflows: new Map([['app-engineering', wf]]),
      incidentFeed: null,
      now: NOW,
    };
    const world = projectWorldState(input);
    const agent = world.agents.get('app-engineering')!;
    expect(agent.recent_trail).toHaveLength(1);
    expect(agent.recent_trail[0].event_id).toBe('evt-1');
  });

  it('marks data quality when data sources are missing', () => {
    const input: ProjectorInput = {
      overview: makeOverview(),
      workflows: new Map(),
      incidentFeed: null,
      now: NOW,
    };
    const world = projectWorldState(input);
    expect(world.data_quality.incident_feed_available).toBe(false);
    expect(world.data_quality.workflow_agent_ids).toEqual([]);
    expect(world.data_quality.degraded_reasons).toContain('incident feed unavailable');
  });
});
