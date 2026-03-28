import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DetailsPanel } from './DetailsPanel';
import type {
  AgentWorkflow,
  CollectorSnapshot,
  CorrelationDrilldown,
  MemoryArtifactIndex,
  OfficeAgent,
  OfficeOperation,
  OfficeOperations
} from '../types';
import type { WorldState } from '../world/types';

type DetailsPanelProps = Parameters<typeof DetailsPanel>[0];

function buildWorld(): WorldState {
  return {
    generated_at: '2026-03-16T09:00:00.000Z',
    projection_ts: '2026-03-16T09:00:00.000Z',
    agents: new Map([
      [
        'app-engineering',
        {
          agent_id: 'app-engineering',
          display_name: 'App Engineering Agent',
          kind: 'employee',
          raw_state: 'blocked',
          raw_location: 'delivery-desk',
          active_task: 'Fix workflow issue',
          reboot_recommended: true,
          phase: 'blocked',
          zone: 'delivery-desk',
          severity: 'orange',
          severity_reason: 'Workflow evidence still missing',
          staleness: {
            severity: 'yellow',
            stale_for_ms: 300000,
            stale_for_minutes: 5,
            last_meaningful_output_at: '2026-03-16T08:58:00.000Z'
          },
          recent_trail: [],
          open_alert_count: 2,
          has_open_incidents: true
        }
      ],
      [
        'team-lead',
        {
          agent_id: 'team-lead',
          display_name: 'Team Lead',
          kind: 'lead',
          raw_state: 'reviewing',
          raw_location: 'review-desk',
          active_task: 'Review queue',
          reboot_recommended: false,
          phase: 'reviewing',
          zone: 'review-desk',
          severity: 'yellow',
          severity_reason: 'Watching blocked agents',
          staleness: null,
          recent_trail: [],
          open_alert_count: 0,
          has_open_incidents: false
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
          active_task: 'Review copy',
          reboot_recommended: false,
          phase: 'waiting',
          zone: 'growth-desk',
          severity: 'red',
          severity_reason: 'Waiting on upstream input',
          staleness: null,
          recent_trail: [],
          open_alert_count: 0,
          has_open_incidents: false
        }
      ]
    ]),
    zones: [
      {
        zone_id: 'delivery-desk',
        label: 'Delivery Desk',
        kind: 'desk',
        grid_x: 0,
        grid_y: 0,
        grid_w: 1,
        grid_h: 1,
        home_agent_id: 'app-engineering',
        occupant_ids: ['app-engineering']
      }
    ],
    watch_edges: [
      {
        from_agent_id: 'team-lead',
        to_agent_id: 'app-engineering',
        watch_mode: 'lead',
        risk_level: 'yellow'
      },
      {
        from_agent_id: 'app-engineering',
        to_agent_id: 'growth-revenue',
        watch_mode: 'peer',
        risk_level: 'red'
      }
    ],
    incidents: [],
    summary: {
      total_agents: 3,
      blocked_count: 1,
      reboot_count: 1,
      severity_buckets: {
        normal: 0,
        yellow: 1,
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
}

function buildSelectedAgent(): OfficeAgent {
  return {
    agent_id: 'app-engineering',
    display_name: 'App Engineering Agent',
    kind: 'employee',
    current_state: 'blocked',
    active_task: 'Fix workflow issue',
    current_location: 'delivery-desk',
    effective_severity: 'orange',
    reported_severity: 'yellow',
    severity: 'orange',
    derived_staleness: {
      severity: 'yellow',
      stale_for_ms: 300000,
      stale_for_minutes: 5,
      last_meaningful_output_at: '2026-03-16T08:58:00.000Z'
    },
    reboot_recommended: true
  };
}

function buildSelectedOperation(): OfficeOperation {
  return {
    agent_id: 'app-engineering',
    display_name: 'App Engineering Agent',
    kind: 'employee',
    current_state: 'blocked',
    active_task: 'Fix workflow issue',
    current_blocker: 'Waiting on review sign-off',
    current_location: 'delivery-desk',
    reported_severity: 'yellow',
    effective_severity: 'orange',
    derived_staleness: {
      severity: 'yellow',
      stale_for_ms: 300000,
      stale_for_minutes: 5,
      last_meaningful_output_at: '2026-03-16T08:58:00.000Z'
    },
    reboot_recommended: true,
    last_event_at: '2026-03-16T08:58:30.000Z',
    last_heartbeat_at: '2026-03-16T08:59:30.000Z',
    last_meaningful_output_at: '2026-03-16T08:58:00.000Z',
    correlation_id: 'corr-app-review',
    latest_event: {
      event_id: 'evt-1',
      event_type: 'agent_noted',
      ts: '2026-03-16T08:58:30.000Z',
      summary: 'Followed up on missing workflow evidence',
      source_kind: 'controller_event',
      evidence_refs: ['/evidence/review.md'],
      counterparty_agent_ids: ['growth-revenue']
    }
  };
}

function buildOperations(): OfficeOperations {
  return {
    generated_at: '2026-03-16T09:00:00.000Z',
    summary: {
      item_count: 1,
      blocked_count: 1,
      reboot_recommended_count: 1,
      state_buckets: {
        blocked: 1
      },
      severity_buckets: {
        normal: 0,
        yellow: 0,
        orange: 1,
        red: 0
      }
    },
    items: [buildSelectedOperation()]
  };
}

function buildWorkflow(): AgentWorkflow {
  return {
    agent_id: 'app-engineering',
    correlation_ids: ['corr-app-review'],
    counterparty_agent_ids: ['team-lead'],
    incidents: [],
    interactions: [],
    timeline: [],
    detail: {
      agent_id: 'app-engineering',
      display_name: 'App Engineering Agent',
      current_state: 'blocked',
      active_task: 'Fix workflow issue',
      current_location: 'delivery-desk',
      latest_heartbeat: {
        agent_id: 'app-engineering',
        received_at: '2026-03-16T08:59:30.000Z'
      },
      open_peer_watch_alerts: [],
      recent_events: [
        {
          event_id: 'evt-2',
          ts: '2026-03-16T08:57:00.000Z',
          agent_id: 'app-engineering',
          actor_id: 'controller',
          agent_role: 'app-engineering',
          event_type: 'workflow_event',
          severity: 'yellow',
          current_state: 'blocked',
          active_task: 'Fix workflow issue',
          location: 'delivery-desk',
          summary: 'Workflow evidence still incomplete',
          correlation_id: 'corr-app-review',
          counterparty_agent_ids: ['team-lead'],
          evidence_refs: ['/evidence/log.md'],
          source_kind: 'workflow_event',
          metadata: {}
        }
      ],
      recent_interactions: [],
      recent_incidents: [],
      recent_handoffs: [],
      recent_reboots: []
    }
  };
}

function buildCorrelation(): CorrelationDrilldown {
  return {
    correlation_id: 'corr-app-review',
    participant_agent_ids: ['app-engineering', 'team-lead'],
    evidence_refs: ['/evidence/correlation.md'],
    first_ts: '2026-03-16T08:40:00.000Z',
    last_ts: '2026-03-16T08:58:30.000Z',
    incident_count: 1,
    interaction_count: 1,
    event_count: 1,
    incidents: [
      {
        incident_id: 'inc-1',
        kind: 'peer_watch',
        ts: '2026-03-16T08:50:00.000Z',
        agent_id: 'app-engineering',
        actor_id: 'controller',
        status: 'open',
        severity: 'orange',
        summary: 'Lead is still waiting on workflow evidence',
        correlation_id: 'corr-app-review',
        evidence_refs: ['/evidence/correlation.md'],
        counterparty_agent_ids: ['team-lead'],
        source_kind: 'controller_event'
      }
    ],
    interactions: [
      {
        interaction_id: 'int-1',
        interaction_type: 'peer_watch',
        correlation_id: 'corr-app-review',
        started_at: '2026-03-16T08:45:00.000Z',
        participant_agent_ids: ['app-engineering', 'team-lead'],
        trigger_event_id: 'evt-1',
        severity: 'yellow',
        evidence_refs: ['/evidence/review.md'],
        summary: 'Reviewed the missing workflow package'
      }
    ],
    timeline: [
      {
        event_id: 'evt-3',
        ts: '2026-03-16T08:56:00.000Z',
        agent_id: 'app-engineering',
        actor_id: 'controller',
        event_type: 'timeline_note',
        severity: 'yellow',
        current_state: 'blocked',
        location: 'delivery-desk',
        summary: 'Replay captured workflow follow-up',
        correlation_id: 'corr-app-review',
        counterparty_agent_ids: ['team-lead'],
        evidence_refs: ['/evidence/correlation.md'],
        source_kind: 'timeline_replay'
      }
    ]
  };
}

function buildSecondaryCorrelation(): CorrelationDrilldown {
  return {
    correlation_id: 'corr-app-secondary',
    participant_agent_ids: ['app-engineering', 'growth-revenue'],
    evidence_refs: ['/evidence/secondary-correlation.md'],
    first_ts: '2026-03-16T08:52:00.000Z',
    last_ts: '2026-03-16T08:54:00.000Z',
    incident_count: 1,
    interaction_count: 0,
    event_count: 1,
    incidents: [
      {
        incident_id: 'inc-2',
        kind: 'handoff',
        ts: '2026-03-16T08:52:00.000Z',
        agent_id: 'app-engineering',
        actor_id: 'growth-revenue',
        status: 'completed',
        severity: 'yellow',
        summary: 'Secondary review handoff finished',
        correlation_id: 'corr-app-secondary',
        evidence_refs: ['/evidence/secondary-correlation.md'],
        counterparty_agent_ids: ['growth-revenue'],
        source_kind: 'controller_event'
      }
    ],
    interactions: [],
    timeline: [
      {
        event_id: 'evt-4',
        ts: '2026-03-16T08:54:00.000Z',
        agent_id: 'app-engineering',
        actor_id: 'growth-revenue',
        event_type: 'handoff_completed',
        severity: 'yellow',
        current_state: 'blocked',
        location: 'delivery-desk',
        summary: 'Secondary review evidence shipped',
        correlation_id: 'corr-app-secondary',
        counterparty_agent_ids: ['growth-revenue'],
        evidence_refs: ['/evidence/secondary-correlation.md'],
        source_kind: 'timeline_replay'
      }
    ]
  };
}

function buildCollectorSnapshot(): CollectorSnapshot {
  return {
    collected_at: '2026-03-16T09:00:00.000Z',
    actor_id: 'collector-watch',
    summary: {
      agent_count: 3,
      heartbeat_count: 3,
      tmux_observed_count: 1,
      workspace_observed_count: 2,
      reboot_recommended_count: 1
    },
    items: [
      {
        agent_id: 'app-engineering',
        workspace_root: '/workspace/app-engineering',
        session_ref: 'sess-1',
        evidence_refs: ['/evidence/log.md'],
        workspace_observations: [],
        tmux_observations: [],
        supervision: {
          watch_target: 'growth-revenue',
          watched_by: ['team-lead'],
          needs_attention: true
        },
        heartbeat: {
          agent_id: 'app-engineering',
          actor_id: 'collector-watch',
          received_at: '2026-03-16T08:59:30.000Z',
          current_state: 'blocked',
          active_task: 'Fix workflow issue',
          current_location: 'delivery-desk',
          last_meaningful_output_at: '2026-03-16T08:58:00.000Z',
          last_file_write_at: '2026-03-16T08:57:00.000Z',
          current_blocker: 'Waiting on review sign-off',
          confidence_level: 'high',
          reboot_recommended: true,
          evidence_refs: ['/evidence/controller.md']
        }
      }
    ]
  };
}

function buildMemoryArtifacts(): MemoryArtifactIndex {
  return {
    generated_at: '2026-03-16T09:00:00.000Z',
    items: [
      {
        artifact_ref: 'artifact/replay-bundle',
        artifact_kind: 'evidence_ref',
        file_name: 'replay-bundle.md',
        first_seen_at: '2026-03-16T08:45:00.000Z',
        last_seen_at: '2026-03-16T08:58:00.000Z',
        mention_count: 2,
        agent_ids: ['app-engineering'],
        correlation_ids: ['corr-app-review'],
        source_kinds: ['timeline_replay'],
        latest_summary: 'Replay evidence bundle',
        latest_event_type: 'timeline_note',
        collector_last_modified_at: '2026-03-16T08:58:00.000Z'
      },
      {
        artifact_ref: 'artifact/review-note',
        artifact_kind: 'workspace_file',
        file_name: 'review-note.md',
        first_seen_at: '2026-03-16T08:42:00.000Z',
        last_seen_at: '2026-03-16T08:57:00.000Z',
        mention_count: 1,
        agent_ids: ['app-engineering', 'team-lead'],
        correlation_ids: ['corr-app-review'],
        source_kinds: ['evidence_ref'],
        latest_summary: 'Review note',
        latest_event_type: 'workflow_event',
        collector_last_modified_at: '2026-03-16T08:57:00.000Z'
      }
    ]
  };
}

function buildProps(overrides: Partial<DetailsPanelProps> = {}): DetailsPanelProps {
  return {
    collectorSnapshot: buildCollectorSnapshot(),
    collectorSnapshotError: null,
    collectorSnapshotState: 'ready',
    correlation: buildCorrelation(),
    correlationError: null,
    correlationState: 'ready',
    incidentFeed: null,
    incidentFeedError: null,
    incidentFeedState: 'ready',
    operations: buildOperations(),
    operationsError: null,
    operationsState: 'ready',
    overviewZones: null,
    preserveWorkflowCounterpartyCorrelation: false,
    memoryArtifacts: buildMemoryArtifacts(),
    memoryArtifactsError: null,
    memoryArtifactsState: 'ready',
    selectedAgent: buildSelectedAgent(),
    selectedCorrelationId: 'corr-app-review',
    selectedOperation: buildSelectedOperation(),
    timelineReplay: null,
    timelineReplayError: null,
    timelineReplayState: 'ready',
    workflow: buildWorkflow(),
    workflowError: null,
    workflowState: 'ready',
    world: buildWorld(),
    onSelectAgent: vi.fn(),
    onSelectCorrelation: vi.fn(),
    onSelectOperation: vi.fn(),
    ...overrides
  };
}

describe('DetailsPanel accountability signals', () => {
  it('renders crew-overview incident feed actors as pivots and carries the clicked incident correlation', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();

    render(
      <DetailsPanel
        {...buildProps({
          incidentFeed: {
            items: [
              {
                incident_id: 'inc-feed-1',
                kind: 'peer_watch',
                ts: '2026-03-16T08:50:00.000Z',
                agent_id: 'app-engineering',
                actor_id: 'team-lead',
                status: 'open',
                severity: 'orange',
                summary: 'Lead is still waiting on workflow evidence',
                correlation_id: 'corr-app-review',
                evidence_refs: ['/evidence/review.md'],
                counterparty_agent_ids: ['team-lead'],
                source_kind: 'controller_event'
              }
            ]
          },
          onSelectAgent,
          selectedAgent: null,
          selectedOperation: null
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Incident Feed' }).closest('section');
    expect(section).not.toBeNull();

    const incidentCard = within(section!).getByText('Lead is still waiting on workflow evidence').closest('li');
    expect(incidentCard).not.toBeNull();

    expect(within(incidentCard!).getByText('At · 2026-03-16T08:50:00.000Z')).toBeVisible();
    expect(incidentCard!).toHaveTextContent('Actor · team-lead');
    expect(
      within(incidentCard!).getByRole('button', {
        name: 'Select incident feed actor from incident inc-feed-1 team-lead'
      })
    ).toBeVisible();

    await user.click(
      within(incidentCard!).getByRole('button', {
        name: 'Select incident feed actor from incident inc-feed-1 team-lead'
      })
    );

    expect(onSelectAgent).toHaveBeenCalledWith('team-lead', 'corr-app-review');
  });

  it('jumps from matching crew-overview incident feed evidence refs to shared memory while leaving non-matching refs as plain text', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const onSelectCorrelation = vi.fn();
    const memoryArtifacts: MemoryArtifactIndex = {
      generated_at: '2026-03-16T09:00:00.000Z',
      items: [
        {
          artifact_ref: '/evidence/review.md',
          artifact_kind: 'evidence_ref',
          file_name: 'review.md',
          first_seen_at: '2026-03-16T08:42:00.000Z',
          last_seen_at: '2026-03-16T08:58:00.000Z',
          mention_count: 2,
          agent_ids: ['app-engineering', 'team-lead'],
          correlation_ids: ['corr-app-review'],
          source_kinds: ['controller_event'],
          latest_summary: 'Incident feed evidence anchor',
          latest_event_type: 'peer_watch',
          collector_last_modified_at: '2026-03-16T08:58:00.000Z'
        }
      ]
    };

    render(
      <DetailsPanel
        {...buildProps({
          incidentFeed: {
            items: [
              {
                incident_id: 'inc-feed-1',
                kind: 'peer_watch',
                ts: '2026-03-16T08:50:00.000Z',
                agent_id: 'app-engineering',
                actor_id: 'team-lead',
                status: 'open',
                severity: 'orange',
                summary: 'Lead is still waiting on workflow evidence',
                correlation_id: 'corr-app-review',
                evidence_refs: ['/evidence/review.md', '/evidence/missing.md'],
                counterparty_agent_ids: ['team-lead'],
                source_kind: 'controller_event'
              }
            ]
          },
          memoryArtifacts,
          onSelectAgent,
          onSelectCorrelation,
          selectedAgent: null,
          selectedOperation: null
        })}
      />
    );

    const incidentSection = screen.getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const sharedMemorySection = screen.getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(incidentSection).not.toBeNull();
    expect(sharedMemorySection).not.toBeNull();

    const incidentRecord = within(incidentSection!).getByText('Lead is still waiting on workflow evidence').closest('li');
    const artifactRecord = within(sharedMemorySection!).getByText('Ref · /evidence/review.md').closest('li');
    expect(incidentRecord).not.toBeNull();
    expect(artifactRecord).not.toBeNull();
    expect(incidentRecord).toHaveTextContent('Evidence · /evidence/review.md, /evidence/missing.md');
    expect(
      within(incidentRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/review.md'
      })
    ).toHaveTextContent('/evidence/review.md');
    expect(
      within(incidentRecord!).queryByRole('button', {
        name: 'Jump to shared memory artifact /evidence/missing.md'
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(incidentRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/review.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(onSelectAgent).not.toHaveBeenCalled();
    expect(onSelectCorrelation).not.toHaveBeenCalled();
  });

  it('jumps from matching selected-agent incident feed evidence refs to shared memory while leaving non-matching refs as plain text', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const onSelectCorrelation = vi.fn();
    const memoryArtifacts: MemoryArtifactIndex = {
      generated_at: '2026-03-16T09:00:00.000Z',
      items: [
        {
          artifact_ref: '/evidence/review.md',
          artifact_kind: 'evidence_ref',
          file_name: 'review.md',
          first_seen_at: '2026-03-16T08:42:00.000Z',
          last_seen_at: '2026-03-16T08:58:00.000Z',
          mention_count: 2,
          agent_ids: ['app-engineering', 'team-lead'],
          correlation_ids: ['corr-app-review'],
          source_kinds: ['controller_event'],
          latest_summary: 'Incident feed evidence anchor',
          latest_event_type: 'peer_watch',
          collector_last_modified_at: '2026-03-16T08:58:00.000Z'
        }
      ]
    };

    render(
      <DetailsPanel
        {...buildProps({
          incidentFeed: {
            items: [
              {
                incident_id: 'inc-feed-1',
                kind: 'peer_watch',
                ts: '2026-03-16T08:50:00.000Z',
                agent_id: 'app-engineering',
                actor_id: 'team-lead',
                status: 'open',
                severity: 'orange',
                summary: 'Lead is still waiting on workflow evidence',
                correlation_id: 'corr-app-review',
                evidence_refs: ['/evidence/review.md', '/evidence/missing.md'],
                counterparty_agent_ids: ['team-lead'],
                source_kind: 'controller_event'
              }
            ]
          },
          memoryArtifacts,
          onSelectAgent,
          onSelectCorrelation
        })}
      />
    );

    const incidentSection = screen.getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const sharedMemorySection = screen.getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(incidentSection).not.toBeNull();
    expect(sharedMemorySection).not.toBeNull();

    const incidentRecord = within(incidentSection!).getByText('Lead is still waiting on workflow evidence').closest('li');
    const artifactRecord = within(sharedMemorySection!).getByText('Ref · /evidence/review.md').closest('li');
    expect(incidentRecord).not.toBeNull();
    expect(artifactRecord).not.toBeNull();
    expect(incidentRecord).toHaveTextContent('Evidence · /evidence/review.md, /evidence/missing.md');
    expect(
      within(incidentRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/review.md'
      })
    ).toHaveTextContent('/evidence/review.md');
    expect(
      within(incidentRecord!).queryByRole('button', {
        name: 'Jump to shared memory artifact /evidence/missing.md'
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(incidentRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/review.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(onSelectAgent).not.toHaveBeenCalled();
    expect(onSelectCorrelation).not.toHaveBeenCalled();
  });

  it('renders crew-overview incident feed counterparties as pivots and carries the clicked incident correlation', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();

    render(
      <DetailsPanel
        {...buildProps({
          incidentFeed: {
            items: [
              {
                incident_id: 'inc-feed-2',
                kind: 'handoff',
                ts: '2026-03-16T08:52:00.000Z',
                agent_id: 'app-engineering',
                actor_id: 'growth-revenue',
                status: 'completed',
                severity: 'yellow',
                summary: 'App engineering finished the secondary review handoff',
                correlation_id: 'corr-app-secondary',
                evidence_refs: ['/evidence/secondary-handoff.md'],
                counterparty_agent_ids: ['growth-revenue', 'ghost-agent'],
                source_kind: 'controller_event'
              }
            ]
          },
          onSelectAgent,
          selectedAgent: null,
          selectedOperation: null
        })}
      />
    );

    const incidentSection = screen.getByRole('heading', { name: 'Incident Feed' }).closest('section');
    expect(incidentSection).not.toBeNull();

    const incidentRecord = within(incidentSection!)
      .getByText('App engineering finished the secondary review handoff')
      .closest('li');
    expect(incidentRecord).not.toBeNull();
    expect(incidentRecord).toHaveTextContent('Counterparties · growth-revenue, ghost-agent');
    expect(
      within(incidentRecord!).getByRole('button', {
        name: 'Select incident feed counterparty agent from incident inc-feed-2 growth-revenue'
      })
    ).toBeVisible();
    expect(
      within(incidentRecord!).queryByRole('button', {
        name: 'Select incident feed counterparty agent from incident inc-feed-2 ghost-agent'
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(incidentRecord!).getByRole('button', {
        name: 'Select incident feed counterparty agent from incident inc-feed-2 growth-revenue'
      })
    );

    expect(onSelectAgent).toHaveBeenCalledWith('growth-revenue', 'corr-app-secondary');
  });

  it('renders selected-agent incident feed counterparties as pivots only for navigable non-current agents', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();

    render(
      <DetailsPanel
        {...buildProps({
          incidentFeed: {
            items: [
              {
                incident_id: 'inc-feed-2',
                kind: 'handoff',
                ts: '2026-03-16T08:52:00.000Z',
                agent_id: 'app-engineering',
                actor_id: 'growth-revenue',
                status: 'completed',
                severity: 'yellow',
                summary: 'App engineering finished the secondary review handoff',
                correlation_id: 'corr-app-secondary',
                evidence_refs: ['/evidence/secondary-handoff.md'],
                counterparty_agent_ids: ['app-engineering', 'growth-revenue', 'ghost-agent'],
                source_kind: 'controller_event'
              }
            ]
          },
          onSelectAgent
        })}
      />
    );

    const incidentSection = screen.getByRole('heading', { name: 'Incident Feed' }).closest('section');
    expect(incidentSection).not.toBeNull();

    const incidentRecord = within(incidentSection!)
      .getByText('App engineering finished the secondary review handoff')
      .closest('li');
    expect(incidentRecord).not.toBeNull();
    expect(incidentRecord).toHaveTextContent('Counterparties · app-engineering, growth-revenue, ghost-agent');
    expect(
      within(incidentRecord!).queryByRole('button', {
        name: 'Select incident feed counterparty agent from incident inc-feed-2 app-engineering'
      })
    ).not.toBeInTheDocument();
    expect(
      within(incidentRecord!).getByRole('button', {
        name: 'Select incident feed counterparty agent from incident inc-feed-2 growth-revenue'
      })
    ).toBeVisible();
    expect(
      within(incidentRecord!).queryByRole('button', {
        name: 'Select incident feed counterparty agent from incident inc-feed-2 ghost-agent'
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(incidentRecord!).getByRole('button', {
        name: 'Select incident feed counterparty agent from incident inc-feed-2 growth-revenue'
      })
    );

    expect(onSelectAgent).toHaveBeenCalledWith('growth-revenue', 'corr-app-secondary');
  });

  it('renders selected-agent incident feed actors as pivots only for navigable non-current agents', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();

    render(
      <DetailsPanel
        {...buildProps({
          incidentFeed: {
            items: [
              {
                incident_id: 'inc-feed-2',
                kind: 'handoff',
                ts: '2026-03-16T08:52:00.000Z',
                agent_id: 'app-engineering',
                actor_id: 'growth-revenue',
                status: 'completed',
                severity: 'yellow',
                summary: 'App engineering finished the secondary review handoff',
                correlation_id: 'corr-app-secondary',
                evidence_refs: ['/evidence/secondary-handoff.md'],
                counterparty_agent_ids: ['growth-revenue'],
                source_kind: 'controller_event'
              },
              {
                incident_id: 'inc-feed-3',
                kind: 'peer_watch',
                ts: '2026-03-16T08:53:00.000Z',
                agent_id: 'app-engineering',
                actor_id: 'app-engineering',
                status: 'open',
                severity: 'orange',
                summary: 'App engineering is still blocked on review follow-up',
                correlation_id: 'corr-app-review',
                evidence_refs: ['/evidence/review.md'],
                counterparty_agent_ids: [],
                source_kind: 'controller_event'
              },
              {
                incident_id: 'inc-feed-4',
                kind: 'peer_watch',
                ts: '2026-03-16T08:54:00.000Z',
                agent_id: 'app-engineering',
                actor_id: 'ghost-agent',
                status: 'open',
                severity: 'yellow',
                summary: 'Unknown watcher is still waiting on workflow evidence',
                correlation_id: 'corr-app-ghost',
                evidence_refs: ['/evidence/ghost.md'],
                counterparty_agent_ids: [],
                source_kind: 'controller_event'
              }
            ]
          },
          onSelectAgent
        })}
      />
    );

    const incidentSection = screen.getByRole('heading', { name: 'Incident Feed' }).closest('section');
    expect(incidentSection).not.toBeNull();

    const navigableActorRecord = within(incidentSection!)
      .getByText('App engineering finished the secondary review handoff')
      .closest('li');
    const currentActorRecord = within(incidentSection!)
      .getByText('App engineering is still blocked on review follow-up')
      .closest('li');
    const unknownActorRecord = within(incidentSection!)
      .getByText('Unknown watcher is still waiting on workflow evidence')
      .closest('li');
    expect(navigableActorRecord).not.toBeNull();
    expect(currentActorRecord).not.toBeNull();
    expect(unknownActorRecord).not.toBeNull();

    expect(
      within(navigableActorRecord!).getByRole('button', {
        name: 'Select incident feed actor from incident inc-feed-2 growth-revenue'
      })
    ).toBeVisible();
    expect(
      within(currentActorRecord!).queryByRole('button', {
        name: 'Select incident feed actor from incident inc-feed-3 app-engineering'
      })
    ).not.toBeInTheDocument();
    expect(
      within(unknownActorRecord!).queryByRole('button', {
        name: 'Select incident feed actor from incident inc-feed-4 ghost-agent'
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(navigableActorRecord!).getByRole('button', {
        name: 'Select incident feed actor from incident inc-feed-2 growth-revenue'
      })
    );

    expect(onSelectAgent).toHaveBeenCalledWith('growth-revenue', 'corr-app-secondary');
  });

  it('renders workflow and correlation interaction cards with timing and transition metadata', () => {
    const interaction = {
      ...buildCorrelation().interactions[0],
      ended_at: '2026-03-16T08:47:30.000Z',
      before_state: 'blocked',
      after_state: 'reviewing'
    };
    const workflow: AgentWorkflow = {
      ...buildWorkflow(),
      detail: {
        ...buildWorkflow().detail,
        recent_interactions: [interaction]
      }
    };
    const correlation: CorrelationDrilldown = {
      ...buildCorrelation(),
      interactions: [interaction]
    };

    render(<DetailsPanel {...buildProps({ workflow, correlation })} />);

    const workflowSection = screen.getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(workflowSection).not.toBeNull();

    const workflowCard = within(workflowSection!).getByText('Reviewed the missing workflow package').closest('li');
    expect(workflowCard).not.toBeNull();
    expect(within(workflowCard!).getByText('Started · 2026-03-16T08:45:00.000Z')).toBeVisible();
    expect(within(workflowCard!).getByText('Ended · 2026-03-16T08:47:30.000Z')).toBeVisible();
    expect(within(workflowCard!).getByText('Trigger · evt-1')).toBeVisible();
    expect(within(workflowCard!).getByText('State · blocked -> reviewing')).toBeVisible();

    const correlationSection = screen.getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(correlationSection).not.toBeNull();

    const correlationCard = within(correlationSection!).getByText('Reviewed the missing workflow package').closest('li');
    expect(correlationCard).not.toBeNull();
    expect(within(correlationCard!).getByText('Started · 2026-03-16T08:45:00.000Z')).toBeVisible();
    expect(within(correlationCard!).getByText('Ended · 2026-03-16T08:47:30.000Z')).toBeVisible();
    expect(within(correlationCard!).getByText('Trigger · evt-1')).toBeVisible();
    expect(within(correlationCard!).getByText('State · blocked -> reviewing')).toBeVisible();
  });

  it('renders read-only observability metadata for correlation and replay timeline events', () => {
    render(
      <DetailsPanel
        {...buildProps({
          selectedAgent: null,
          selectedOperation: null,
          timelineReplay: {
            items: [
              {
                event_id: 'evt-replay',
                ts: '2026-03-16T08:59:00.000Z',
                agent_id: 'growth-revenue',
                actor_id: 'growth-revenue',
                event_type: 'peer_watch_alert_raised',
                severity: 'orange',
                current_state: 'planning',
                location: 'growth-desk',
                summary: 'Replay event with observability metadata',
                correlation_id: 'corr-app-review',
                counterparty_agent_ids: ['team-lead'],
                evidence_refs: ['/evidence/replay.md'],
                source_kind: 'controller_event'
              }
            ]
          }
        })}
      />
    );

    const correlationSection = screen.getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const replaySection = screen.getByRole('heading', { name: 'Timeline Replay' }).closest('section');
    expect(correlationSection).not.toBeNull();
    expect(replaySection).not.toBeNull();

    const correlationCard = within(correlationSection!).getByText('Replay captured workflow follow-up').closest('li');
    const replayCard = within(replaySection!).getByText('Replay event with observability metadata').closest('li');
    expect(correlationCard).not.toBeNull();
    expect(replayCard).not.toBeNull();

    expect(within(correlationCard!).getByText('At · 2026-03-16T08:56:00.000Z')).toBeVisible();
    expect(within(correlationCard!).getByText('Actor · controller')).toBeVisible();
    expect(within(correlationCard!).getByText('State · blocked')).toBeVisible();

    expect(within(replayCard!).getByText('At · 2026-03-16T08:59:00.000Z')).toBeVisible();
    expect(replayCard).toHaveTextContent('Actor · growth-revenue');
    expect(within(replayCard!).getByText('State · planning')).toBeVisible();
    expect(
      within(replayCard!).getByRole('button', {
        name: 'Select replay actor from event evt-replay growth-revenue'
      })
    ).toBeVisible();
    expect(
      within(replayCard!).getByRole('button', {
        name: 'Select replay agent growth-revenue from event evt-replay'
      })
    ).toBeVisible();
  });

  it('renders replay actors as pivots when navigable, preserves the active correlation, and leaves unknown actors as plain text', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();

    render(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          selectedAgent: null,
          selectedOperation: null,
          selectedCorrelationId: 'corr-app-secondary',
          timelineReplay: {
            items: [
              {
                event_id: 'evt-replay-actor-1',
                ts: '2026-03-16T08:59:00.000Z',
                agent_id: 'app-engineering',
                actor_id: 'team-lead',
                event_type: 'peer_watch_alert_raised',
                severity: 'orange',
                current_state: 'blocked',
                location: 'delivery-desk',
                summary: 'Navigable replay actor stays actionable',
                correlation_id: 'corr-app-review',
                counterparty_agent_ids: ['team-lead'],
                evidence_refs: ['/evidence/replay.md'],
                source_kind: 'controller_event'
              },
              {
                event_id: 'evt-replay-actor-2',
                ts: '2026-03-16T08:58:00.000Z',
                agent_id: 'growth-revenue',
                actor_id: 'growth-revenue',
                event_type: 'agent_noted',
                severity: 'yellow',
                current_state: 'planning',
                location: 'growth-desk',
                summary: 'Replay actor matching the replay agent stays actionable',
                correlation_id: 'corr-app-secondary',
                counterparty_agent_ids: [],
                evidence_refs: ['/evidence/replay-current.md'],
                source_kind: 'workspace_snapshot'
              },
              {
                event_id: 'evt-replay-actor-3',
                ts: '2026-03-16T08:57:00.000Z',
                agent_id: 'app-engineering',
                actor_id: 'ghost-agent',
                event_type: 'agent_noted',
                severity: 'yellow',
                current_state: 'blocked',
                location: 'delivery-desk',
                summary: 'Unknown replay actor stays plain text',
                correlation_id: 'corr-app-secondary',
                counterparty_agent_ids: [],
                evidence_refs: ['/evidence/replay-unknown.md'],
                source_kind: 'workspace_snapshot'
              }
            ]
          }
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Timeline Replay' }).closest('section');
    expect(section).not.toBeNull();

    const navigableRecord = within(section!).getByText('Navigable replay actor stays actionable').closest('li');
    const duplicateRecord = within(section!).getByText('Replay actor matching the replay agent stays actionable').closest('li');
    const unknownRecord = within(section!).getByText('Unknown replay actor stays plain text').closest('li');
    expect(navigableRecord).not.toBeNull();
    expect(duplicateRecord).not.toBeNull();
    expect(unknownRecord).not.toBeNull();

    expect(
      within(navigableRecord!).getByRole('button', {
        name: 'Select replay actor from event evt-replay-actor-1 team-lead'
      })
    ).toBeVisible();
    expect(
      within(navigableRecord!).getByRole('button', {
        name: 'Select replay agent app-engineering from event evt-replay-actor-1'
      })
    ).toBeVisible();
    expect(
      within(duplicateRecord!).getByRole('button', {
        name: 'Select replay actor from event evt-replay-actor-2 growth-revenue'
      })
    ).toBeVisible();
    expect(
      within(duplicateRecord!).getByRole('button', {
        name: 'Select replay agent growth-revenue from event evt-replay-actor-2'
      })
    ).toBeVisible();
    expect(
      within(unknownRecord!).queryByRole('button', {
        name: 'Select replay actor from event evt-replay-actor-3 ghost-agent'
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(navigableRecord!).getByRole('button', {
        name: 'Select replay actor from event evt-replay-actor-1 team-lead'
      })
    );

    expect(onSelectAgent).toHaveBeenCalledWith('team-lead', 'corr-app-secondary');
  });

  it('jumps from matching timeline-replay evidence refs to shared memory while leaving non-matching refs as plain text', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const onSelectCorrelation = vi.fn();
    const memoryArtifacts: MemoryArtifactIndex = {
      generated_at: '2026-03-16T09:00:00.000Z',
      items: [
        ...buildMemoryArtifacts().items,
        {
          artifact_ref: '/evidence/replay.md',
          artifact_kind: 'evidence_ref',
          file_name: 'replay.md',
          first_seen_at: '2026-03-16T08:54:00.000Z',
          last_seen_at: '2026-03-16T08:59:00.000Z',
          mention_count: 2,
          agent_ids: ['app-engineering', 'team-lead'],
          correlation_ids: ['corr-app-review'],
          source_kinds: ['controller_event'],
          latest_summary: 'Replay evidence anchor',
          latest_event_type: 'peer_watch_alert_raised',
          collector_last_modified_at: '2026-03-16T08:59:00.000Z'
        }
      ]
    };

    render(
      <DetailsPanel
        {...buildProps({
          memoryArtifacts,
          onSelectAgent,
          onSelectCorrelation,
          selectedAgent: null,
          selectedOperation: null,
          timelineReplay: {
            items: [
              {
                event_id: 'evt-replay',
                ts: '2026-03-16T08:59:00.000Z',
                agent_id: 'app-engineering',
                actor_id: 'team-lead',
                event_type: 'peer_watch_alert_raised',
                severity: 'orange',
                current_state: 'blocked',
                location: 'delivery-desk',
                summary: 'Replay event with evidence jump',
                correlation_id: 'corr-app-review',
                counterparty_agent_ids: ['team-lead'],
                evidence_refs: ['/evidence/replay.md', '/evidence/missing.md'],
                source_kind: 'controller_event'
              }
            ]
          }
        })}
      />
    );

    const replaySection = screen.getByRole('heading', { name: 'Timeline Replay' }).closest('section');
    const sharedMemorySection = screen.getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(replaySection).not.toBeNull();
    expect(sharedMemorySection).not.toBeNull();

    const replayRecord = within(replaySection!)
      .getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/replay.md'
      })
      .closest('li');
    const artifactRecord = within(sharedMemorySection!).getByText('Ref · /evidence/replay.md').closest('li');
    expect(replayRecord).not.toBeNull();
    expect(artifactRecord).not.toBeNull();
    expect(replayRecord).toHaveTextContent('Evidence · /evidence/replay.md, /evidence/missing.md');
    expect(
      within(replayRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/replay.md'
      })
    ).toHaveTextContent('/evidence/replay.md');
    expect(
      within(replayRecord!).queryByRole('button', {
        name: 'Jump to shared memory artifact /evidence/missing.md'
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(replayRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/replay.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(onSelectAgent).not.toHaveBeenCalled();
    expect(onSelectCorrelation).not.toHaveBeenCalled();
  });

  it('jumps from matching current-operation evidence refs to shared memory while leaving non-matching refs as plain text', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const onSelectCorrelation = vi.fn();
    const baseSelectedOperation = buildSelectedOperation();
    const latestEvent = baseSelectedOperation.latest_event;

    if (!latestEvent) {
      throw new Error('Expected current operation latest event fixture');
    }

    const selectedOperation: OfficeOperation = {
      ...baseSelectedOperation,
      latest_event: {
        ...latestEvent,
        evidence_refs: ['/evidence/review.md', '/evidence/missing.md']
      }
    };
    const memoryArtifacts: MemoryArtifactIndex = {
      generated_at: '2026-03-16T09:00:00.000Z',
      items: [
        ...buildMemoryArtifacts().items,
        {
          artifact_ref: '/evidence/review.md',
          artifact_kind: 'evidence_ref',
          file_name: 'review.md',
          first_seen_at: '2026-03-16T08:42:00.000Z',
          last_seen_at: '2026-03-16T08:58:00.000Z',
          mention_count: 2,
          agent_ids: ['app-engineering', 'team-lead'],
          correlation_ids: ['corr-app-review'],
          source_kinds: ['controller_event'],
          latest_summary: 'Current operation evidence anchor',
          latest_event_type: 'agent_noted',
          collector_last_modified_at: '2026-03-16T08:58:00.000Z'
        }
      ]
    };

    render(
      <DetailsPanel
        {...buildProps({
          memoryArtifacts,
          onSelectAgent,
          onSelectCorrelation,
          selectedOperation
        })}
      />
    );

    const operationSection = screen.getByRole('heading', { name: 'Current Operation' }).closest('section');
    const sharedMemorySection = screen.getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(operationSection).not.toBeNull();
    expect(sharedMemorySection).not.toBeNull();

    const operationRecord = within(operationSection!)
      .getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/review.md'
      })
      .closest('li');
    const artifactRecord = within(sharedMemorySection!).getByText('Ref · /evidence/review.md').closest('li');
    expect(operationRecord).not.toBeNull();
    expect(artifactRecord).not.toBeNull();
    expect(operationRecord).toHaveTextContent('Evidence · /evidence/review.md, /evidence/missing.md');
    expect(
      within(operationRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/review.md'
      })
    ).toHaveTextContent('/evidence/review.md');
    expect(
      within(operationRecord!).queryByRole('button', {
        name: 'Jump to shared memory artifact /evidence/missing.md'
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(operationRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/review.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(onSelectAgent).not.toHaveBeenCalled();
    expect(onSelectCorrelation).not.toHaveBeenCalled();
  });

  it('shows a selected agent responsibility chain with current evidence, sources, and correlation context', () => {
    render(<DetailsPanel {...buildProps()} />);

    const section = screen.getByRole('heading', { name: 'Audit Signals' }).closest('section');
    expect(section).not.toBeNull();
    const record = within(section!).getByText('Responsibility chain').closest('li');
    expect(record).not.toBeNull();

    expect(within(section!).getByText('Responsibility chain')).toBeVisible();
    expect(record!).toHaveTextContent(
      'Who · Team Lead -> App Engineering Agent (lead, Elevated); App Engineering Agent -> Growth Revenue Agent (peer, High risk)'
    );
    expect(within(section!).getByText('What · Followed up on missing workflow evidence')).toBeVisible();
    expect(record!).toHaveTextContent('Evidence · /evidence/review.md, /evidence/log.md, /evidence/correlation.md');
    expect(
      within(section!).getByRole('button', {
        name: 'Jump to shared memory artifact artifact/replay-bundle'
      })
    ).toHaveTextContent('Replay evidence bundle (artifact/replay-bundle)');
    expect(
      within(section!).getByRole('button', {
        name: 'Jump to shared memory artifact artifact/review-note'
      })
    ).toHaveTextContent('Review note (artifact/review-note)');
    expect(
      within(section!).getByText(
        'Source · controller_event, workflow_event, timeline_replay, evidence_ref'
      )
    ).toBeVisible();
    expect(
      within(section!).getByRole('button', {
        name: 'Open accountability correlation corr-app-review, currently selected'
      })
    ).toBeVisible();
    expect(section).toHaveTextContent('1 incidents · 1 interactions · 1 events');
  });

  it('renders non-current accountability chain agents as pivots and keeps the current agent as plain text', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();

    render(<DetailsPanel {...buildProps({ onSelectAgent })} />);

    const section = screen.getByRole('heading', { name: 'Audit Signals' }).closest('section');
    expect(section).not.toBeNull();

    expect(
      within(section!).queryByRole('button', {
        name: 'Select responsibility chain agent app-engineering'
      })
    ).not.toBeInTheDocument();
    expect(
      within(section!).getByRole('button', {
        name: 'Select responsibility chain agent team-lead'
      })
    ).toBeVisible();
    expect(
      within(section!).getByRole('button', {
        name: 'Select responsibility chain agent growth-revenue'
      })
    ).toBeVisible();

    await user.click(
      within(section!).getByRole('button', {
        name: 'Select responsibility chain agent team-lead'
      })
    );

    expect(onSelectAgent).toHaveBeenCalledWith('team-lead', 'corr-app-review');
  });

  it('renders correlation incident agents as pivots when they are not the current agent and preserves the active correlation', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const correlation: CorrelationDrilldown = {
      ...buildCorrelation(),
      incidents: [
        {
          ...buildCorrelation().incidents[0],
          agent_id: 'team-lead'
        }
      ]
    };

    render(<DetailsPanel {...buildProps({ correlation, onSelectAgent })} />);

    const section = screen.getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(section).not.toBeNull();

    expect(
      within(section!).getByRole('button', {
        name: 'Select incident agent team-lead from incident inc-1'
      })
    ).toBeVisible();
    expect(
      within(section!).queryByRole('button', {
        name: 'Open incident correlation corr-app-review, currently selected'
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(section!).getByRole('button', {
        name: 'Select incident agent team-lead from incident inc-1'
      })
    );

    expect(onSelectAgent).toHaveBeenCalledWith('team-lead', 'corr-app-review');
  });

  it('renders crew-overview correlation incident actors as pivots and carries the active correlation', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const correlation: CorrelationDrilldown = {
      ...buildCorrelation(),
      incidents: [
        {
          ...buildCorrelation().incidents[0],
          actor_id: 'team-lead'
        }
      ]
    };

    render(
      <DetailsPanel
        {...buildProps({
          correlation,
          onSelectAgent,
          selectedAgent: null,
          selectedOperation: null
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(section).not.toBeNull();

    expect(
      within(section!).getByRole('button', {
        name: 'Select correlation incident actor from incident inc-1 team-lead'
      })
    ).toBeVisible();

    await user.click(
      within(section!).getByRole('button', {
        name: 'Select correlation incident actor from incident inc-1 team-lead'
      })
    );

    expect(onSelectAgent).toHaveBeenCalledWith('team-lead', 'corr-app-review');
  });

  it('renders selected-agent correlation incident actors as pivots only for navigable non-current agents', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const baseIncident = buildCorrelation().incidents[0];
    const correlation: CorrelationDrilldown = {
      ...buildCorrelation(),
      incident_count: 3,
      incidents: [
        {
          ...baseIncident,
          incident_id: 'inc-actor-1',
          actor_id: 'team-lead',
          summary: 'Navigable correlation actor stays actionable'
        },
        {
          ...baseIncident,
          incident_id: 'inc-actor-2',
          actor_id: 'app-engineering',
          summary: 'Current correlation actor stays plain text'
        },
        {
          ...baseIncident,
          incident_id: 'inc-actor-3',
          actor_id: 'ghost-agent',
          summary: 'Unknown correlation actor stays plain text'
        }
      ]
    };

    render(<DetailsPanel {...buildProps({ correlation, onSelectAgent })} />);

    const section = screen.getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(section).not.toBeNull();

    const navigableIncident = within(section!).getByText('Navigable correlation actor stays actionable').closest('li');
    const currentIncident = within(section!).getByText('Current correlation actor stays plain text').closest('li');
    const unknownIncident = within(section!).getByText('Unknown correlation actor stays plain text').closest('li');
    expect(navigableIncident).not.toBeNull();
    expect(currentIncident).not.toBeNull();
    expect(unknownIncident).not.toBeNull();

    expect(
      within(navigableIncident!).getByRole('button', {
        name: 'Select correlation incident actor from incident inc-actor-1 team-lead'
      })
    ).toBeVisible();
    expect(
      within(currentIncident!).queryByRole('button', {
        name: 'Select correlation incident actor from incident inc-actor-2 app-engineering'
      })
    ).not.toBeInTheDocument();
    expect(
      within(unknownIncident!).queryByRole('button', {
        name: 'Select correlation incident actor from incident inc-actor-3 ghost-agent'
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(navigableIncident!).getByRole('button', {
        name: 'Select correlation incident actor from incident inc-actor-1 team-lead'
      })
    );

    expect(onSelectAgent).toHaveBeenCalledWith('team-lead', 'corr-app-review');
  });

  it('renders correlation incident counterparties as pivots for non-current agents and keeps the current agent as plain text', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const correlation: CorrelationDrilldown = {
      ...buildCorrelation(),
      incidents: [
        {
          ...buildCorrelation().incidents[0],
          counterparty_agent_ids: ['app-engineering', 'team-lead']
        }
      ]
    };

    render(<DetailsPanel {...buildProps({ correlation, onSelectAgent })} />);

    const section = screen.getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(section).not.toBeNull();

    const incidentRecord = within(section!).getByText('Lead is still waiting on workflow evidence').closest('li');
    expect(incidentRecord).not.toBeNull();
    expect(
      within(incidentRecord!).queryByRole('button', {
        name: 'Select correlation incident counterparty agent app-engineering'
      })
    ).not.toBeInTheDocument();
    expect(incidentRecord).toHaveTextContent('Counterparties · app-engineering, team-lead');
    expect(
      within(incidentRecord!).getByRole('button', {
        name: 'Select correlation incident counterparty agent team-lead'
      })
    ).toBeVisible();

    await user.click(
      within(incidentRecord!).getByRole('button', {
        name: 'Select correlation incident counterparty agent team-lead'
      })
    );

    expect(onSelectAgent).toHaveBeenCalledWith('team-lead', 'corr-app-review');
  });

  it('renders crew-overview correlation timeline actors as pivots and carries the active correlation', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const correlation: CorrelationDrilldown = {
      ...buildCorrelation(),
      timeline: [
        {
          ...buildCorrelation().timeline[0],
          actor_id: 'team-lead'
        }
      ]
    };

    render(
      <DetailsPanel
        {...buildProps({
          correlation,
          onSelectAgent,
          selectedAgent: null,
          selectedOperation: null
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(section).not.toBeNull();

    expect(
      within(section!).getByRole('button', {
        name: 'Select correlation timeline actor from event evt-3 team-lead'
      })
    ).toBeVisible();

    await user.click(
      within(section!).getByRole('button', {
        name: 'Select correlation timeline actor from event evt-3 team-lead'
      })
    );

    expect(onSelectAgent).toHaveBeenCalledWith('team-lead', 'corr-app-review');
  });

  it('renders selected-agent correlation timeline actors as pivots only for navigable non-current agents', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const baseTimelineEvent = buildCorrelation().timeline[0];
    const correlation: CorrelationDrilldown = {
      ...buildCorrelation(),
      event_count: 3,
      timeline: [
        {
          ...baseTimelineEvent,
          event_id: 'evt-timeline-actor-1',
          actor_id: 'team-lead',
          summary: 'Navigable correlation timeline actor stays actionable'
        },
        {
          ...baseTimelineEvent,
          event_id: 'evt-timeline-actor-2',
          actor_id: 'app-engineering',
          summary: 'Current correlation timeline actor stays plain text'
        },
        {
          ...baseTimelineEvent,
          event_id: 'evt-timeline-actor-3',
          actor_id: 'ghost-agent',
          summary: 'Unknown correlation timeline actor stays plain text'
        }
      ]
    };

    render(<DetailsPanel {...buildProps({ correlation, onSelectAgent })} />);

    const section = screen.getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(section).not.toBeNull();

    const navigableRecord = within(section!).getByText('Navigable correlation timeline actor stays actionable').closest('li');
    const currentRecord = within(section!).getByText('Current correlation timeline actor stays plain text').closest('li');
    const unknownRecord = within(section!).getByText('Unknown correlation timeline actor stays plain text').closest('li');
    expect(navigableRecord).not.toBeNull();
    expect(currentRecord).not.toBeNull();
    expect(unknownRecord).not.toBeNull();

    expect(
      within(navigableRecord!).getByRole('button', {
        name: 'Select correlation timeline actor from event evt-timeline-actor-1 team-lead'
      })
    ).toBeVisible();
    expect(
      within(currentRecord!).queryByRole('button', {
        name: 'Select correlation timeline actor from event evt-timeline-actor-2 app-engineering'
      })
    ).not.toBeInTheDocument();
    expect(
      within(unknownRecord!).queryByRole('button', {
        name: 'Select correlation timeline actor from event evt-timeline-actor-3 ghost-agent'
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(navigableRecord!).getByRole('button', {
        name: 'Select correlation timeline actor from event evt-timeline-actor-1 team-lead'
      })
    );

    expect(onSelectAgent).toHaveBeenCalledWith('team-lead', 'corr-app-review');
  });

  it('renders correlation timeline counterparties as pivots only for navigable non-current agents', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const correlation: CorrelationDrilldown = {
      ...buildCorrelation(),
      timeline: [
        {
          ...buildCorrelation().timeline[0],
          counterparty_agent_ids: ['app-engineering', 'team-lead', 'ghost-agent']
        }
      ]
    };

    render(<DetailsPanel {...buildProps({ correlation, onSelectAgent })} />);

    const section = screen.getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(section).not.toBeNull();

    const timelineRecord = within(section!).getByText('Replay captured workflow follow-up').closest('li');
    expect(timelineRecord).not.toBeNull();
    expect(
      within(timelineRecord!).queryByRole('button', {
        name: 'Select correlation timeline counterparty agent app-engineering'
      })
    ).not.toBeInTheDocument();
    expect(
      within(timelineRecord!).queryByRole('button', {
        name: 'Select correlation timeline counterparty agent ghost-agent'
      })
    ).not.toBeInTheDocument();
    expect(timelineRecord).toHaveTextContent('Counterparties · app-engineering, team-lead, ghost-agent');
    expect(
      within(timelineRecord!).getByRole('button', {
        name: 'Select correlation timeline counterparty agent team-lead'
      })
    ).toBeVisible();

    await user.click(
      within(timelineRecord!).getByRole('button', {
        name: 'Select correlation timeline counterparty agent team-lead'
      })
    );

    expect(onSelectAgent).toHaveBeenCalledWith('team-lead', 'corr-app-review');
  });

  it('renders correlation interaction participants as pivots only for navigable non-current agents', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const correlation: CorrelationDrilldown = {
      ...buildCorrelation(),
      interactions: [
        {
          ...buildCorrelation().interactions[0],
          participant_agent_ids: ['app-engineering', 'team-lead', 'ghost-agent']
        }
      ]
    };

    render(<DetailsPanel {...buildProps({ correlation, onSelectAgent })} />);

    const section = screen.getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(section).not.toBeNull();

    const interactionRecord = within(section!).getByText('Reviewed the missing workflow package').closest('li');
    expect(interactionRecord).not.toBeNull();
    expect(
      within(interactionRecord!).queryByRole('button', {
        name: 'Select correlation interaction participant agent app-engineering'
      })
    ).not.toBeInTheDocument();
    expect(
      within(interactionRecord!).queryByRole('button', {
        name: 'Select correlation interaction participant agent ghost-agent'
      })
    ).not.toBeInTheDocument();
    expect(interactionRecord).toHaveTextContent('Participants · app-engineering, team-lead, ghost-agent');
    expect(
      within(interactionRecord!).getByRole('button', {
        name: 'Select correlation interaction participant agent team-lead'
      })
    ).toBeVisible();

    await user.click(
      within(interactionRecord!).getByRole('button', {
        name: 'Select correlation interaction participant agent team-lead'
      })
    );

    expect(onSelectAgent).toHaveBeenCalledWith('team-lead', 'corr-app-review');
  });

  it('jumps from an accountability artifact to the matching shared-memory record without changing selection state', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const onSelectCorrelation = vi.fn();

    render(<DetailsPanel {...buildProps({ onSelectAgent, onSelectCorrelation })} />);

    const auditSection = screen.getByRole('heading', { name: 'Audit Signals' }).closest('section');
    const sharedMemorySection = screen.getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(auditSection).not.toBeNull();
    expect(sharedMemorySection).not.toBeNull();

    const artifactRecord = within(sharedMemorySection!).getByText('Review note').closest('li');
    expect(artifactRecord).not.toBeNull();

    await user.click(
      within(auditSection!).getByRole('button', {
        name: 'Jump to shared memory artifact artifact/review-note'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(onSelectAgent).not.toHaveBeenCalled();
    expect(onSelectCorrelation).not.toHaveBeenCalled();
  });

  it('jumps from matching accountability evidence refs to shared memory while leaving non-matching refs as plain text', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const onSelectCorrelation = vi.fn();
    const memoryArtifacts: MemoryArtifactIndex = {
      generated_at: '2026-03-16T09:00:00.000Z',
      items: [
        ...buildMemoryArtifacts().items,
        {
          artifact_ref: '/evidence/review.md',
          artifact_kind: 'evidence_ref',
          file_name: 'review.md',
          first_seen_at: '2026-03-16T08:46:00.000Z',
          last_seen_at: '2026-03-16T08:58:00.000Z',
          mention_count: 2,
          agent_ids: ['app-engineering', 'team-lead'],
          correlation_ids: ['corr-app-review'],
          source_kinds: ['controller_event'],
          latest_summary: 'Review evidence anchor',
          latest_event_type: 'workflow_event',
          collector_last_modified_at: '2026-03-16T08:58:00.000Z'
        }
      ]
    };

    render(<DetailsPanel {...buildProps({ memoryArtifacts, onSelectAgent, onSelectCorrelation })} />);

    const auditSection = screen.getByRole('heading', { name: 'Audit Signals' }).closest('section');
    const sharedMemorySection = screen.getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(auditSection).not.toBeNull();
    expect(sharedMemorySection).not.toBeNull();

    const evidenceLine = within(auditSection!).getByText(
      (_content, element) =>
        element?.tagName === 'SPAN' &&
        element.textContent === 'Evidence · /evidence/review.md, /evidence/log.md, /evidence/correlation.md'
    );
    const artifactRecord = within(sharedMemorySection!).getByText('Ref · /evidence/review.md').closest('li');
    expect(artifactRecord).not.toBeNull();
    expect(
      within(evidenceLine).getByRole('button', {
        name: 'Jump to accountability evidence ref /evidence/review.md'
      })
    ).toBeVisible();
    expect(
      within(evidenceLine).queryByRole('button', {
        name: 'Jump to accountability evidence ref /evidence/log.md'
      })
    ).not.toBeInTheDocument();
    expect(
      within(evidenceLine).queryByRole('button', {
        name: 'Jump to accountability evidence ref /evidence/correlation.md'
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(evidenceLine).getByRole('button', {
        name: 'Jump to accountability evidence ref /evidence/review.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(onSelectAgent).not.toHaveBeenCalled();
    expect(onSelectCorrelation).not.toHaveBeenCalled();
  });

  it('jumps from matching collector evidence refs to shared memory in both collector surfaces while leaving non-matching refs as plain text', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const onSelectCorrelation = vi.fn();
    const memoryArtifacts: MemoryArtifactIndex = {
      generated_at: '2026-03-16T09:00:00.000Z',
      items: [
        ...buildMemoryArtifacts().items,
        {
          artifact_ref: '/evidence/controller.md',
          artifact_kind: 'evidence_ref',
          file_name: 'controller.md',
          first_seen_at: '2026-03-16T08:46:00.000Z',
          last_seen_at: '2026-03-16T08:59:30.000Z',
          mention_count: 2,
          agent_ids: ['app-engineering'],
          correlation_ids: ['corr-app-review'],
          source_kinds: ['workspace_snapshot'],
          latest_summary: 'Collector evidence anchor',
          latest_event_type: 'agent_noted',
          collector_last_modified_at: '2026-03-16T08:59:30.000Z'
        }
      ]
    };

    const { rerender } = render(
      <DetailsPanel
        {...buildProps({
          memoryArtifacts,
          onSelectAgent,
          onSelectCorrelation,
          selectedAgent: null,
          selectedOperation: null
        })}
      />
    );

    const collectorSection = screen.getByRole('heading', { name: 'Collector Supervision' }).closest('section');
    expect(collectorSection).not.toBeNull();

    const collectorOverviewEvidenceLine = within(collectorSection!).getByText(
      (_content, element) =>
        element?.tagName === 'SPAN' &&
        element.textContent === 'Evidence · /evidence/log.md, /evidence/controller.md'
    );
    expect(
      within(collectorOverviewEvidenceLine).getByRole('button', {
        name: 'Jump to collector evidence ref /evidence/controller.md'
      })
    ).toBeVisible();
    expect(
      within(collectorOverviewEvidenceLine).queryByRole('button', {
        name: 'Jump to collector evidence ref /evidence/log.md'
      })
    ).not.toBeInTheDocument();

    rerender(<DetailsPanel {...buildProps({ memoryArtifacts, onSelectAgent, onSelectCorrelation })} />);

    const collectorObservationSection = screen.getByRole('heading', { name: 'Collector Observation' }).closest('section');
    const sharedMemorySection = screen.getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(collectorObservationSection).not.toBeNull();
    expect(sharedMemorySection).not.toBeNull();

    const collectorObservationEvidenceLine = within(collectorObservationSection!).getByText(
      (_content, element) =>
        element?.tagName === 'SPAN' &&
        element.textContent === 'Evidence · /evidence/log.md, /evidence/controller.md'
    );
    const artifactRecord = within(sharedMemorySection!).getByText('Ref · /evidence/controller.md').closest('li');
    expect(artifactRecord).not.toBeNull();
    expect(
      within(collectorObservationEvidenceLine).getByRole('button', {
        name: 'Jump to collector evidence ref /evidence/controller.md'
      })
    ).toBeVisible();
    expect(
      within(collectorObservationEvidenceLine).queryByRole('button', {
        name: 'Jump to collector evidence ref /evidence/log.md'
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(collectorObservationEvidenceLine).getByRole('button', {
        name: 'Jump to collector evidence ref /evidence/controller.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(onSelectAgent).not.toHaveBeenCalled();
    expect(onSelectCorrelation).not.toHaveBeenCalled();
  });

  it('jumps from matching top-level correlation evidence refs to shared memory in crew overview while leaving non-matching refs as plain text', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const onSelectCorrelation = vi.fn();
    const correlation: CorrelationDrilldown = {
      ...buildCorrelation(),
      evidence_refs: ['/evidence/correlation.md', '/evidence/missing.md']
    };
    const memoryArtifacts: MemoryArtifactIndex = {
      generated_at: '2026-03-16T09:00:00.000Z',
      items: [
        ...buildMemoryArtifacts().items,
        {
          artifact_ref: '/evidence/correlation.md',
          artifact_kind: 'evidence_ref',
          file_name: 'correlation.md',
          first_seen_at: '2026-03-16T08:49:00.000Z',
          last_seen_at: '2026-03-16T08:58:00.000Z',
          mention_count: 2,
          agent_ids: ['app-engineering', 'team-lead'],
          correlation_ids: ['corr-app-review'],
          source_kinds: ['controller_event'],
          latest_summary: 'Correlation evidence anchor',
          latest_event_type: 'peer_watch_alert_raised',
          collector_last_modified_at: '2026-03-16T08:58:00.000Z'
        }
      ]
    };

    render(
      <DetailsPanel
        {...buildProps({
          correlation,
          memoryArtifacts,
          selectedAgent: null,
          selectedOperation: null,
          onSelectAgent,
          onSelectCorrelation
        })}
      />
    );

    const correlationSection = screen.getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const sharedMemorySection = screen.getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(correlationSection).not.toBeNull();
    expect(sharedMemorySection).not.toBeNull();

    const correlationRecord = within(correlationSection!).getByText('corr-app-review').closest('li');
    const artifactRecord = within(sharedMemorySection!).getByText('Ref · /evidence/correlation.md').closest('li');
    expect(correlationRecord).not.toBeNull();
    expect(artifactRecord).not.toBeNull();
    expect(
      within(correlationRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/correlation.md'
      })
    ).toHaveTextContent('/evidence/correlation.md');
    expect(correlationRecord).toHaveTextContent('Evidence · /evidence/correlation.md, /evidence/missing.md');
    expect(
      within(correlationRecord!).queryByRole('button', {
        name: 'Jump to shared memory artifact /evidence/missing.md'
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(correlationRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/correlation.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(onSelectAgent).not.toHaveBeenCalled();
    expect(onSelectCorrelation).not.toHaveBeenCalled();
  });

  it('jumps from matching top-level correlation evidence refs to shared memory in selected-agent view while leaving non-matching refs as plain text', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const onSelectCorrelation = vi.fn();
    const correlation: CorrelationDrilldown = {
      ...buildCorrelation(),
      evidence_refs: ['/evidence/correlation.md', '/evidence/missing.md']
    };
    const memoryArtifacts: MemoryArtifactIndex = {
      generated_at: '2026-03-16T09:00:00.000Z',
      items: [
        ...buildMemoryArtifacts().items,
        {
          artifact_ref: '/evidence/correlation.md',
          artifact_kind: 'evidence_ref',
          file_name: 'correlation.md',
          first_seen_at: '2026-03-16T08:49:00.000Z',
          last_seen_at: '2026-03-16T08:58:00.000Z',
          mention_count: 2,
          agent_ids: ['app-engineering', 'team-lead'],
          correlation_ids: ['corr-app-review'],
          source_kinds: ['controller_event'],
          latest_summary: 'Correlation evidence anchor',
          latest_event_type: 'peer_watch_alert_raised',
          collector_last_modified_at: '2026-03-16T08:58:00.000Z'
        }
      ]
    };

    render(<DetailsPanel {...buildProps({ correlation, memoryArtifacts, onSelectAgent, onSelectCorrelation })} />);

    const correlationSection = screen.getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const sharedMemorySection = screen.getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(correlationSection).not.toBeNull();
    expect(sharedMemorySection).not.toBeNull();

    const correlationRecord = within(correlationSection!).getByText('corr-app-review').closest('li');
    const artifactRecord = within(sharedMemorySection!).getByText('Ref · /evidence/correlation.md').closest('li');
    expect(correlationRecord).not.toBeNull();
    expect(artifactRecord).not.toBeNull();
    expect(
      within(correlationRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/correlation.md'
      })
    ).toHaveTextContent('/evidence/correlation.md');
    expect(correlationRecord).toHaveTextContent('Evidence · /evidence/correlation.md, /evidence/missing.md');
    expect(
      within(correlationRecord!).queryByRole('button', {
        name: 'Jump to shared memory artifact /evidence/missing.md'
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(correlationRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/correlation.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(onSelectAgent).not.toHaveBeenCalled();
    expect(onSelectCorrelation).not.toHaveBeenCalled();
  });

  it('jumps from matching correlation-incident evidence refs to shared memory while leaving non-matching refs as plain text', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const onSelectCorrelation = vi.fn();
    const correlation: CorrelationDrilldown = {
      ...buildCorrelation(),
      incidents: [
        {
          ...buildCorrelation().incidents[0],
          evidence_refs: ['/evidence/correlation.md', '/evidence/missing.md']
        }
      ]
    };
    const memoryArtifacts: MemoryArtifactIndex = {
      generated_at: '2026-03-16T09:00:00.000Z',
      items: [
        ...buildMemoryArtifacts().items,
        {
          artifact_ref: '/evidence/correlation.md',
          artifact_kind: 'evidence_ref',
          file_name: 'correlation.md',
          first_seen_at: '2026-03-16T08:49:00.000Z',
          last_seen_at: '2026-03-16T08:58:00.000Z',
          mention_count: 2,
          agent_ids: ['app-engineering', 'team-lead'],
          correlation_ids: ['corr-app-review'],
          source_kinds: ['controller_event'],
          latest_summary: 'Correlation evidence anchor',
          latest_event_type: 'peer_watch_alert_raised',
          collector_last_modified_at: '2026-03-16T08:58:00.000Z'
        }
      ]
    };

    render(<DetailsPanel {...buildProps({ correlation, memoryArtifacts, onSelectAgent, onSelectCorrelation })} />);

    const correlationSection = screen.getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const sharedMemorySection = screen.getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(correlationSection).not.toBeNull();
    expect(sharedMemorySection).not.toBeNull();

    const incidentRecord = within(correlationSection!).getByText('Lead is still waiting on workflow evidence').closest('li');
    const artifactRecord = within(sharedMemorySection!).getByText('Ref · /evidence/correlation.md').closest('li');
    expect(incidentRecord).not.toBeNull();
    expect(artifactRecord).not.toBeNull();
    expect(
      within(incidentRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/correlation.md'
      })
    ).toHaveTextContent('/evidence/correlation.md');
    expect(incidentRecord).toHaveTextContent('Evidence · /evidence/correlation.md, /evidence/missing.md');
    expect(
      within(incidentRecord!).queryByRole('button', {
        name: 'Jump to shared memory artifact /evidence/missing.md'
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(incidentRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/correlation.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(onSelectAgent).not.toHaveBeenCalled();
    expect(onSelectCorrelation).not.toHaveBeenCalled();
  });

  it('jumps from matching correlation-interaction evidence refs to shared memory while leaving non-matching refs as plain text', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const onSelectCorrelation = vi.fn();
    const correlation: CorrelationDrilldown = {
      ...buildCorrelation(),
      interactions: [
        {
          ...buildCorrelation().interactions[0],
          evidence_refs: ['/evidence/review.md', '/evidence/missing.md']
        }
      ]
    };
    const memoryArtifacts: MemoryArtifactIndex = {
      generated_at: '2026-03-16T09:00:00.000Z',
      items: [
        ...buildMemoryArtifacts().items,
        {
          artifact_ref: '/evidence/review.md',
          artifact_kind: 'evidence_ref',
          file_name: 'review.md',
          first_seen_at: '2026-03-16T08:45:00.000Z',
          last_seen_at: '2026-03-16T08:47:30.000Z',
          mention_count: 2,
          agent_ids: ['app-engineering', 'team-lead'],
          correlation_ids: ['corr-app-review'],
          source_kinds: ['controller_event'],
          latest_summary: 'Interaction review evidence anchor',
          latest_event_type: 'peer_watch',
          collector_last_modified_at: '2026-03-16T08:47:30.000Z'
        }
      ]
    };

    render(<DetailsPanel {...buildProps({ correlation, memoryArtifacts, onSelectAgent, onSelectCorrelation })} />);

    const correlationSection = screen.getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const sharedMemorySection = screen.getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(correlationSection).not.toBeNull();
    expect(sharedMemorySection).not.toBeNull();

    const interactionRecord = within(correlationSection!).getByText('Reviewed the missing workflow package').closest('li');
    const artifactRecord = within(sharedMemorySection!).getByText('Ref · /evidence/review.md').closest('li');
    expect(interactionRecord).not.toBeNull();
    expect(artifactRecord).not.toBeNull();
    expect(
      within(interactionRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/review.md'
      })
    ).toHaveTextContent('/evidence/review.md');
    expect(interactionRecord).toHaveTextContent('Evidence · /evidence/review.md, /evidence/missing.md');
    expect(
      within(interactionRecord!).queryByRole('button', {
        name: 'Jump to shared memory artifact /evidence/missing.md'
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(interactionRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/review.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(onSelectAgent).not.toHaveBeenCalled();
    expect(onSelectCorrelation).not.toHaveBeenCalled();
  });

  it('jumps from matching correlation-timeline evidence refs to shared memory while leaving non-matching refs as plain text', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const onSelectCorrelation = vi.fn();
    const correlation: CorrelationDrilldown = {
      ...buildCorrelation(),
      timeline: [
        {
          ...buildCorrelation().timeline[0],
          evidence_refs: ['/evidence/correlation.md', '/evidence/missing.md']
        }
      ]
    };
    const memoryArtifacts: MemoryArtifactIndex = {
      generated_at: '2026-03-16T09:00:00.000Z',
      items: [
        ...buildMemoryArtifacts().items,
        {
          artifact_ref: '/evidence/correlation.md',
          artifact_kind: 'evidence_ref',
          file_name: 'correlation.md',
          first_seen_at: '2026-03-16T08:49:00.000Z',
          last_seen_at: '2026-03-16T08:58:00.000Z',
          mention_count: 2,
          agent_ids: ['app-engineering', 'team-lead'],
          correlation_ids: ['corr-app-review'],
          source_kinds: ['timeline_replay'],
          latest_summary: 'Timeline evidence anchor',
          latest_event_type: 'timeline_note',
          collector_last_modified_at: '2026-03-16T08:58:00.000Z'
        }
      ]
    };

    render(<DetailsPanel {...buildProps({ correlation, memoryArtifacts, onSelectAgent, onSelectCorrelation })} />);

    const correlationSection = screen.getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const sharedMemorySection = screen.getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(correlationSection).not.toBeNull();
    expect(sharedMemorySection).not.toBeNull();

    const timelineRecord = within(correlationSection!).getByText('Replay captured workflow follow-up').closest('li');
    const artifactRecord = within(sharedMemorySection!).getByText('Ref · /evidence/correlation.md').closest('li');
    expect(timelineRecord).not.toBeNull();
    expect(artifactRecord).not.toBeNull();
    expect(
      within(timelineRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/correlation.md'
      })
    ).toHaveTextContent('/evidence/correlation.md');
    expect(timelineRecord).toHaveTextContent('Evidence · /evidence/correlation.md, /evidence/missing.md');
    expect(
      within(timelineRecord!).queryByRole('button', {
        name: 'Jump to shared memory artifact /evidence/missing.md'
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(timelineRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/correlation.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(onSelectAgent).not.toHaveBeenCalled();
    expect(onSelectCorrelation).not.toHaveBeenCalled();
  });

  it('uses the latest top-level workflow timeline event when detail feeds are empty', () => {
    const workflow: AgentWorkflow = {
      ...buildWorkflow(),
      interactions: [],
      incidents: [],
      timeline: [
        {
          event_id: 'evt-older',
          ts: '2026-03-16T08:54:00.000Z',
          agent_id: 'app-engineering',
          actor_id: 'controller',
          event_type: 'timeline_note',
          severity: 'yellow',
          current_state: 'blocked',
          location: 'delivery-desk',
          summary: 'Older accountability signal',
          correlation_id: 'corr-app-review',
          counterparty_agent_ids: ['team-lead'],
          evidence_refs: ['/evidence/older.md'],
          source_kind: 'timeline_replay'
        },
        {
          event_id: 'evt-latest',
          ts: '2026-03-16T08:59:00.000Z',
          agent_id: 'app-engineering',
          actor_id: 'controller',
          event_type: 'timeline_note',
          severity: 'orange',
          current_state: 'blocked',
          location: 'delivery-desk',
          summary: 'Latest accountability signal',
          correlation_id: 'corr-app-review',
          counterparty_agent_ids: ['team-lead'],
          evidence_refs: ['/evidence/latest.md'],
          source_kind: 'controller_event'
        }
      ],
      detail: {
        ...buildWorkflow().detail,
        open_peer_watch_alerts: [],
        recent_events: [],
        recent_interactions: [],
        recent_incidents: [],
        recent_handoffs: [],
        recent_reboots: []
      }
    };

    render(
      <DetailsPanel
        {...buildProps({
          collectorSnapshot: null,
          correlation: null,
          memoryArtifacts: { generated_at: '2026-03-16T09:00:00.000Z', items: [] },
          selectedCorrelationId: null,
          selectedOperation: null,
          workflow
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Audit Signals' }).closest('section');
    expect(section).not.toBeNull();

    expect(within(section!).getByText('What · Latest accountability signal')).toBeVisible();
    expect(within(section!).queryByText('What · Older accountability signal')).not.toBeInTheDocument();
  });

  it('keeps evidence, artifacts, and sources aligned to the displayed correlation', () => {
    const workflow: AgentWorkflow = {
      ...buildWorkflow(),
      correlation_ids: ['corr-app-secondary'],
      detail: {
        ...buildWorkflow().detail,
        recent_events: [
          {
            ...buildWorkflow().detail.recent_events[0],
            event_id: 'evt-review',
            summary: 'Primary review evidence still missing',
            correlation_id: 'corr-app-review',
            evidence_refs: ['/evidence/review-only.md'],
            source_kind: 'workflow_event'
          },
          {
            ...buildWorkflow().detail.recent_events[0],
            event_id: 'evt-secondary',
            summary: 'Secondary review evidence shipped',
            correlation_id: 'corr-app-secondary',
            evidence_refs: ['/evidence/secondary-workflow.md'],
            source_kind: 'handoff_log'
          }
        ]
      }
    };
    const memoryArtifacts: MemoryArtifactIndex = {
      generated_at: '2026-03-16T09:00:00.000Z',
      items: [
        ...buildMemoryArtifacts().items,
        {
          artifact_ref: 'artifact/secondary-bundle',
          artifact_kind: 'evidence_ref',
          file_name: 'secondary-bundle.md',
          first_seen_at: '2026-03-16T08:52:00.000Z',
          last_seen_at: '2026-03-16T08:54:00.000Z',
          mention_count: 1,
          agent_ids: ['app-engineering', 'growth-revenue'],
          correlation_ids: ['corr-app-secondary'],
          source_kinds: ['handoff_log'],
          latest_summary: 'Secondary evidence bundle',
          latest_event_type: 'handoff_completed',
          collector_last_modified_at: '2026-03-16T08:54:00.000Z'
        }
      ]
    };

    render(
      <DetailsPanel
        {...buildProps({
          correlation: buildSecondaryCorrelation(),
          memoryArtifacts,
          selectedCorrelationId: 'corr-app-secondary',
          workflow
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Audit Signals' }).closest('section');
    expect(section).not.toBeNull();

    expect(within(section!).getByText('What · Secondary review evidence shipped')).toBeVisible();
    expect(section!).toHaveTextContent('Evidence · /evidence/secondary-workflow.md, /evidence/secondary-correlation.md');
    expect(
      within(section!).getByRole('button', {
        name: 'Jump to shared memory artifact artifact/secondary-bundle'
      })
    ).toHaveTextContent('Secondary evidence bundle (artifact/secondary-bundle)');
    expect(within(section!).getByText('Source · handoff_log, controller_event, timeline_replay')).toBeVisible();
    expect(within(section!).queryByText(/review-only\.md/)).not.toBeInTheDocument();
    expect(within(section!).queryByText(/Replay evidence bundle/)).not.toBeInTheDocument();
    expect(within(section!).queryByText(/collector:collector-watch/)).not.toBeInTheDocument();
    expect(within(section!).queryByRole('button', { name: /Open accountability correlation corr-app-review/ })).not.toBeInTheDocument();
    expect(
      within(section!).getByRole('button', {
        name: 'Open accountability correlation corr-app-secondary, currently selected'
      })
    ).toBeVisible();
  });

  it('uses aligned peer-watch alerts as the live accountability signal when they are the only correlation-aligned source', () => {
    const workflow: AgentWorkflow = {
      ...buildWorkflow(),
      correlation_ids: ['corr-peer-watch-only'],
      timeline: [],
      interactions: [],
      incidents: [],
      detail: {
        ...buildWorkflow().detail,
        open_peer_watch_alerts: [
          {
            alert_id: 'alert-1',
            ts: '2026-03-16T08:58:00.000Z',
            agent_id: 'app-engineering',
            target_agent_id: 'growth-revenue',
            actor_id: 'team-lead',
            observer_agent_id: 'team-lead',
            watcher_agent_ids: ['team-lead'],
            severity: 'orange',
            status: 'open',
            current_state: 'blocked',
            active_task: 'Escalate missing evidence',
            summary: 'Peer watch alert: waiting on aligned workflow evidence',
            evidence_refs: ['/evidence/peer-watch-only.md'],
            evidence_count: 1,
            correlation_id: 'corr-peer-watch-only',
            source_kind: 'peer_watch_alert',
            metadata: {}
          }
        ],
        recent_events: [],
        recent_interactions: [],
        recent_incidents: [],
        recent_handoffs: [],
        recent_reboots: []
      }
    };

    render(
      <DetailsPanel
        {...buildProps({
          correlation: null,
          memoryArtifacts: { generated_at: '2026-03-16T09:00:00.000Z', items: [] },
          selectedCorrelationId: 'corr-peer-watch-only',
          selectedOperation: null,
          workflow
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Audit Signals' }).closest('section');
    expect(section).not.toBeNull();

    expect(
      within(section!).getByText('What · Peer watch alert: waiting on aligned workflow evidence')
    ).toBeVisible();
    expect(section!).toHaveTextContent('Evidence · /evidence/peer-watch-only.md');
    expect(within(section!).getByText('Source · peer_watch_alert')).toBeVisible();
    expect(within(section!).queryByText(/What · Waiting on review sign-off/)).not.toBeInTheDocument();
    expect(within(section!).queryByText(/What · Fix workflow issue/)).not.toBeInTheDocument();
  });
});

describe('DetailsPanel workflow peer-watch alerts', () => {
  it('jumps from matching selected-agent workflow interaction evidence refs to shared memory while leaving non-matching refs as plain text', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const onSelectCorrelation = vi.fn();
    const workflow: AgentWorkflow = {
      ...buildWorkflow(),
      detail: {
        ...buildWorkflow().detail,
        recent_interactions: [
          {
            interaction_id: 'interaction-workflow-1',
            interaction_type: 'peer_watch',
            correlation_id: 'corr-app-review',
            started_at: '2026-03-16T08:49:00.000Z',
            ended_at: '2026-03-16T08:58:00.000Z',
            participant_agent_ids: ['app-engineering', 'team-lead'],
            trigger_event_id: 'evt-workflow-1',
            before_state: 'coding',
            after_state: 'blocked',
            severity: 'orange',
            evidence_refs: ['/evidence/workflow-interaction.md', '/evidence/missing.md'],
            summary: 'Lead reviewed the selected-agent workflow interaction evidence',
            related_event_ids: ['evt-workflow-1']
          }
        ]
      }
    };
    const memoryArtifacts: MemoryArtifactIndex = {
      generated_at: '2026-03-16T09:00:00.000Z',
      items: [
        ...buildMemoryArtifacts().items,
        {
          artifact_ref: '/evidence/workflow-interaction.md',
          artifact_kind: 'evidence_ref',
          file_name: 'workflow-interaction.md',
          first_seen_at: '2026-03-16T08:49:00.000Z',
          last_seen_at: '2026-03-16T08:58:00.000Z',
          mention_count: 2,
          agent_ids: ['app-engineering', 'team-lead'],
          correlation_ids: ['corr-app-review'],
          source_kinds: ['controller_event'],
          latest_summary: 'Workflow interaction evidence anchor',
          latest_event_type: 'peer_watch_alert_raised',
          collector_last_modified_at: '2026-03-16T08:58:00.000Z'
        }
      ]
    };

    render(<DetailsPanel {...buildProps({ workflow, memoryArtifacts, onSelectAgent, onSelectCorrelation })} />);

    const workflowSection = screen.getByRole('heading', { name: 'Workflow' }).closest('section');
    const sharedMemorySection = screen.getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(sharedMemorySection).not.toBeNull();

    const interactionRecord = within(workflowSection!)
      .getByText('Lead reviewed the selected-agent workflow interaction evidence')
      .closest('li');
    const artifactRecord = within(sharedMemorySection!).getByText('Ref · /evidence/workflow-interaction.md').closest('li');
    expect(interactionRecord).not.toBeNull();
    expect(artifactRecord).not.toBeNull();
    expect(interactionRecord).toHaveTextContent(
      'Participants · app-engineering, team-lead'
    );
    expect(
      within(interactionRecord!).queryByRole('button', {
        name: 'Select correlation interaction participant agent team-lead'
      })
    ).not.toBeInTheDocument();
    expect(
      within(interactionRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/workflow-interaction.md'
      })
    ).toHaveTextContent('/evidence/workflow-interaction.md');
    expect(interactionRecord).toHaveTextContent(
      'Evidence · /evidence/workflow-interaction.md, /evidence/missing.md'
    );
    expect(
      within(interactionRecord!).queryByRole('button', {
        name: 'Jump to shared memory artifact /evidence/missing.md'
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(interactionRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/workflow-interaction.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(onSelectAgent).not.toHaveBeenCalled();
    expect(onSelectCorrelation).not.toHaveBeenCalled();
  });

  it('jumps from matching selected-agent workflow recent-event evidence refs to shared memory while leaving non-matching refs as plain text', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const onSelectCorrelation = vi.fn();
    const workflow: AgentWorkflow = {
      ...buildWorkflow(),
      detail: {
        ...buildWorkflow().detail,
        recent_events: [
          {
            ...buildWorkflow().detail.recent_events[0],
            counterparty_agent_ids: ['app-engineering', 'team-lead', 'ghost-agent'],
            evidence_refs: ['/evidence/workflow-event.md', '/evidence/missing.md'],
            summary: 'Agent attached selected-agent workflow event evidence for lead review'
          }
        ]
      }
    };
    const memoryArtifacts: MemoryArtifactIndex = {
      generated_at: '2026-03-16T09:00:00.000Z',
      items: [
        ...buildMemoryArtifacts().items,
        {
          artifact_ref: '/evidence/workflow-event.md',
          artifact_kind: 'evidence_ref',
          file_name: 'workflow-event.md',
          first_seen_at: '2026-03-16T08:58:00.000Z',
          last_seen_at: '2026-03-16T08:59:00.000Z',
          mention_count: 2,
          agent_ids: ['app-engineering', 'team-lead'],
          correlation_ids: ['corr-app-review'],
          source_kinds: ['workspace_snapshot'],
          latest_summary: 'Workflow event evidence anchor',
          latest_event_type: 'agent_noted',
          collector_last_modified_at: '2026-03-16T08:59:00.000Z'
        }
      ]
    };

    render(<DetailsPanel {...buildProps({ workflow, memoryArtifacts, onSelectAgent, onSelectCorrelation })} />);

    const workflowSection = screen.getByRole('heading', { name: 'Workflow' }).closest('section');
    const sharedMemorySection = screen.getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(sharedMemorySection).not.toBeNull();

    const eventRecord = within(workflowSection!)
      .getByText('Agent attached selected-agent workflow event evidence for lead review')
      .closest('li');
    const artifactRecord = within(sharedMemorySection!).getByText('Ref · /evidence/workflow-event.md').closest('li');
    expect(eventRecord).not.toBeNull();
    expect(artifactRecord).not.toBeNull();
    expect(eventRecord).toHaveTextContent('Counterparties · app-engineering, team-lead, ghost-agent');
    expect(
      within(eventRecord!).queryByRole('button', {
        name: 'Select correlation timeline counterparty agent team-lead'
      })
    ).not.toBeInTheDocument();
    expect(
      within(eventRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/workflow-event.md'
      })
    ).toHaveTextContent('/evidence/workflow-event.md');
    expect(eventRecord).toHaveTextContent('Evidence · /evidence/workflow-event.md, /evidence/missing.md');
    expect(
      within(eventRecord!).queryByRole('button', {
        name: 'Jump to shared memory artifact /evidence/missing.md'
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(eventRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/workflow-event.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(onSelectAgent).not.toHaveBeenCalled();
    expect(onSelectCorrelation).not.toHaveBeenCalled();
  });

  it('jumps from matching selected-agent workflow handoff and reboot evidence refs to shared memory while leaving non-matching refs as plain text', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const onSelectCorrelation = vi.fn();
    const workflow: AgentWorkflow = {
      ...buildWorkflow(),
      detail: {
        ...buildWorkflow().detail,
        recent_handoffs: [
          {
            handoff_id: 'handoff-1',
            ts: '2026-03-16T08:57:00.000Z',
            agent_id: 'app-engineering',
            actor_id: 'growth-revenue',
            phase: 'handoff_done',
            status: 'completed',
            severity: 'yellow',
            summary: 'Secondary review handoff completed',
            counterparty_agent_ids: ['growth-revenue'],
            evidence_refs: ['/evidence/secondary-handoff.md', '/evidence/missing-handoff.md'],
            correlation_id: 'corr-app-secondary',
            source_kind: 'controller_event'
          }
        ],
        recent_reboots: [
          {
            reboot_id: 'reboot-1',
            ts: '2026-03-16T08:40:00.000Z',
            agent_id: 'app-engineering',
            actor_id: 'team-lead',
            phase: 'reboot_recommended',
            status: 'requested',
            severity: 'yellow',
            summary: 'Reboot recommended after the workflow stalled',
            counterparty_agent_ids: ['team-lead'],
            evidence_refs: ['/evidence/reboot-note.md', '/evidence/missing-reboot.md'],
            correlation_id: 'corr-app-review',
            source_kind: 'controller_event'
          }
        ]
      }
    };
    const memoryArtifacts: MemoryArtifactIndex = {
      generated_at: '2026-03-16T09:00:00.000Z',
      items: [
        ...buildMemoryArtifacts().items,
        {
          artifact_ref: '/evidence/secondary-handoff.md',
          artifact_kind: 'evidence_ref',
          file_name: 'secondary-handoff.md',
          first_seen_at: '2026-03-16T08:56:00.000Z',
          last_seen_at: '2026-03-16T08:57:00.000Z',
          mention_count: 1,
          agent_ids: ['app-engineering', 'growth-revenue'],
          correlation_ids: ['corr-app-secondary'],
          source_kinds: ['controller_event'],
          latest_summary: 'Workflow handoff evidence anchor',
          latest_event_type: 'handoff_completed',
          collector_last_modified_at: null
        },
        {
          artifact_ref: '/evidence/reboot-note.md',
          artifact_kind: 'evidence_ref',
          file_name: 'reboot-note.md',
          first_seen_at: '2026-03-16T08:39:00.000Z',
          last_seen_at: '2026-03-16T08:40:00.000Z',
          mention_count: 1,
          agent_ids: ['app-engineering', 'team-lead'],
          correlation_ids: ['corr-app-review'],
          source_kinds: ['controller_event'],
          latest_summary: 'Workflow reboot evidence anchor',
          latest_event_type: 'reboot_requested',
          collector_last_modified_at: null
        }
      ]
    };

    render(<DetailsPanel {...buildProps({ memoryArtifacts, onSelectAgent, onSelectCorrelation, workflow })} />);

    const section = screen.getByRole('heading', { name: 'Workflow' }).closest('section');
    const sharedMemorySection = screen.getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(section).not.toBeNull();
    expect(sharedMemorySection).not.toBeNull();

    const handoffRecord = within(section!).getByText('Secondary review handoff completed').closest('li');
    const rebootRecord = within(section!).getByText('Reboot recommended after the workflow stalled').closest('li');
    const handoffArtifactRecord = within(sharedMemorySection!)
      .getByText('Ref · /evidence/secondary-handoff.md')
      .closest('li');
    const rebootArtifactRecord = within(sharedMemorySection!).getByText('Ref · /evidence/reboot-note.md').closest('li');
    expect(handoffRecord).not.toBeNull();
    expect(rebootRecord).not.toBeNull();
    expect(handoffArtifactRecord).not.toBeNull();
    expect(rebootArtifactRecord).not.toBeNull();

    expect(within(handoffRecord!).getByText('At · 2026-03-16T08:57:00.000Z')).toBeVisible();
    expect(within(handoffRecord!).getByText('Actor · growth-revenue')).toBeVisible();
    expect(handoffRecord).toHaveTextContent('Evidence · /evidence/secondary-handoff.md, /evidence/missing-handoff.md');
    expect(
      within(handoffRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/secondary-handoff.md'
      })
    ).toHaveTextContent('/evidence/secondary-handoff.md');
    expect(
      within(handoffRecord!).queryByRole('button', {
        name: 'Jump to shared memory artifact /evidence/missing-handoff.md'
      })
    ).not.toBeInTheDocument();
    const handoffPivot = within(handoffRecord!).getByRole('button', {
      name: 'Open workflow status correlation corr-app-secondary'
    });
    expect(handoffPivot).toBeVisible();

    expect(within(rebootRecord!).getByText('At · 2026-03-16T08:40:00.000Z')).toBeVisible();
    expect(within(rebootRecord!).getByText('Actor · team-lead')).toBeVisible();
    expect(rebootRecord).toHaveTextContent('Evidence · /evidence/reboot-note.md, /evidence/missing-reboot.md');
    expect(
      within(rebootRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/reboot-note.md'
      })
    ).toHaveTextContent('/evidence/reboot-note.md');
    expect(
      within(rebootRecord!).queryByRole('button', {
        name: 'Jump to shared memory artifact /evidence/missing-reboot.md'
      })
    ).not.toBeInTheDocument();
    expect(
      within(rebootRecord!).getByRole('button', {
        name: 'Open workflow status correlation corr-app-review, currently selected'
      })
    ).toBeVisible();

    await user.click(
      within(handoffRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/secondary-handoff.md'
      })
    );
    expect(document.activeElement).toBe(handoffArtifactRecord);

    await user.click(
      within(rebootRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/reboot-note.md'
      })
    );
    expect(document.activeElement).toBe(rebootArtifactRecord);
    expect(onSelectAgent).not.toHaveBeenCalled();
    expect(onSelectCorrelation).not.toHaveBeenCalled();

    await user.click(handoffPivot);
    expect(onSelectCorrelation).toHaveBeenCalledWith('corr-app-secondary');
  });

  it('jumps from matching selected-agent workflow peer-watch alert evidence refs to shared memory while leaving non-matching refs as plain text', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const onSelectCorrelation = vi.fn();
    const workflow: AgentWorkflow = {
      ...buildWorkflow(),
      detail: {
        ...buildWorkflow().detail,
        open_peer_watch_alerts: [
          {
            alert_id: 'alert-observability',
            ts: '2026-03-16T08:55:00.000Z',
            agent_id: 'app-engineering',
            target_agent_id: 'app-engineering',
            actor_id: 'team-lead',
            observer_agent_id: 'team-lead',
            watcher_agent_ids: ['growth-revenue', 'team-lead'],
            severity: 'orange',
            status: 'open',
            current_state: 'blocked',
            active_task: 'Fix workflow issue',
            summary: 'Peer watch still waiting on review evidence',
            evidence_refs: ['/evidence/review.md', '/evidence/missing.md'],
            evidence_count: 2,
            correlation_id: 'corr-app-review',
            source_kind: 'controller_event',
            metadata: {}
          }
        ]
      }
    };
    const memoryArtifacts: MemoryArtifactIndex = {
      generated_at: '2026-03-16T09:00:00.000Z',
      items: [
        ...buildMemoryArtifacts().items,
        {
          artifact_ref: '/evidence/review.md',
          artifact_kind: 'evidence_ref',
          file_name: 'review.md',
          first_seen_at: '2026-03-16T08:49:00.000Z',
          last_seen_at: '2026-03-16T08:55:00.000Z',
          mention_count: 2,
          agent_ids: ['app-engineering', 'team-lead'],
          correlation_ids: ['corr-app-review'],
          source_kinds: ['controller_event'],
          latest_summary: 'Peer-watch alert evidence anchor',
          latest_event_type: 'peer_watch_alert_raised',
          collector_last_modified_at: '2026-03-16T08:55:00.000Z'
        }
      ]
    };

    render(
      <DetailsPanel {...buildProps({ workflow, memoryArtifacts, onSelectAgent, onSelectCorrelation })} />
    );

    const workflowSection = screen.getByRole('heading', { name: 'Workflow' }).closest('section');
    const sharedMemorySection = screen.getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(sharedMemorySection).not.toBeNull();

    const alertRecord = within(workflowSection!)
      .getByText('Peer watch still waiting on review evidence')
      .closest('li');
    const artifactRecord = within(sharedMemorySection!).getByText('Ref · /evidence/review.md').closest('li');
    expect(alertRecord).not.toBeNull();
    expect(artifactRecord).not.toBeNull();

    expect(
      within(alertRecord!).getByRole('button', {
        name: 'Open workflow correlation corr-app-review, currently selected'
      })
    ).toBeVisible();
    expect(within(alertRecord!).getByText('At · 2026-03-16T08:55:00.000Z')).toBeVisible();
    expect(within(alertRecord!).getByText('Observer · team-lead')).toBeVisible();
    expect(within(alertRecord!).getByText('Watchers · growth-revenue, team-lead')).toBeVisible();
    expect(within(alertRecord!).getByText('Status · open')).toBeVisible();
    expect(within(alertRecord!).getByText('Workflow status · blocked')).toBeVisible();
    expect(within(alertRecord!).getByText('Task · Fix workflow issue')).toBeVisible();
    expect(
      within(alertRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/review.md'
      })
    ).toHaveTextContent('/evidence/review.md');
    expect(alertRecord).toHaveTextContent('Evidence · /evidence/review.md, /evidence/missing.md');
    expect(
      within(alertRecord!).queryByRole('button', {
        name: 'Jump to shared memory artifact /evidence/missing.md'
      })
    ).not.toBeInTheDocument();
    expect(within(alertRecord!).getByText('Evidence count · 2')).toBeVisible();
    expect(within(alertRecord!).getByText('Source · controller_event')).toBeVisible();

    await user.click(
      within(alertRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/review.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(onSelectAgent).not.toHaveBeenCalled();
    expect(onSelectCorrelation).not.toHaveBeenCalled();
  });
});

describe('DetailsPanel shared memory', () => {
  it('renders shared-memory agent pivots and preserves the active correlation when pivoting', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();

    render(<DetailsPanel {...buildProps({ onSelectAgent })} />);

    const section = screen.getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(section).not.toBeNull();

    const artifactRecord = within(section!).getByText('Review note').closest('li');
    expect(artifactRecord).not.toBeNull();

    expect(within(artifactRecord!).getByText('app-engineering')).toBeVisible();
    expect(
      within(artifactRecord!).queryByRole('button', {
        name: 'Select shared memory agent app-engineering'
      })
    ).not.toBeInTheDocument();
    expect(
      within(artifactRecord!).getByRole('button', {
        name: 'Select shared memory agent team-lead'
      })
    ).toBeVisible();

    await user.click(
      within(artifactRecord!).getByRole('button', {
        name: 'Select shared memory agent team-lead'
      })
    );

    expect(onSelectAgent).toHaveBeenCalledWith('team-lead', 'corr-app-review');
  });

  it('falls back to the artifact correlation when no correlation is currently selected', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();

    render(
      <DetailsPanel
        {...buildProps({
          memoryArtifacts: {
            generated_at: '2026-03-16T09:00:00.000Z',
            items: [
              {
                artifact_ref: 'artifact/secondary-review',
                artifact_kind: 'evidence_ref',
                file_name: 'secondary-review.md',
                first_seen_at: '2026-03-16T08:52:00.000Z',
                last_seen_at: '2026-03-16T08:54:00.000Z',
                mention_count: 1,
                agent_ids: ['app-engineering', 'growth-revenue'],
                correlation_ids: ['', 'corr-app-secondary', 'corr-app-review'],
                source_kinds: ['controller_event'],
                latest_summary: 'Secondary review memory anchor',
                latest_event_type: 'handoff_completed',
                collector_last_modified_at: '2026-03-16T08:54:00.000Z'
              }
            ]
          },
          onSelectAgent,
          selectedAgent: null,
          selectedCorrelationId: null,
          selectedOperation: null
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(section).not.toBeNull();

    await user.click(
      within(section!).getByRole('button', {
        name: 'Select shared memory agent growth-revenue'
      })
    );

    expect(onSelectAgent).toHaveBeenCalledWith('growth-revenue', 'corr-app-secondary');
  });

  it('renders a no-correlation artifact path without shared-memory correlation pivots', () => {
    render(
      <DetailsPanel
        {...buildProps({
          memoryArtifacts: {
            generated_at: '2026-03-16T09:00:00.000Z',
            items: [
              {
                artifact_ref: 'artifact/team-lead-note',
                artifact_kind: 'workspace_file',
                file_name: 'team-lead-note.md',
                first_seen_at: '2026-03-16T08:55:00.000Z',
                last_seen_at: '2026-03-16T08:59:00.000Z',
                mention_count: 2,
                agent_ids: ['team-lead'],
                correlation_ids: [],
                source_kinds: ['workspace_snapshot'],
                latest_summary: 'Team lead kept a local review note',
                latest_event_type: 'agent_noted',
                collector_last_modified_at: '2026-03-16T08:59:00.000Z'
              }
            ]
          },
          selectedCorrelationId: null,
          selectedOperation: null
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(section).not.toBeNull();

    expect(within(section!).getByText('Team lead kept a local review note')).toBeVisible();
    expect(within(section!).getByText('Correlations · No correlation ids')).toBeVisible();
    expect(within(section!).getByText('Latest event type · agent_noted')).toBeVisible();
    expect(within(section!).getByText('Source kinds · workspace_snapshot')).toBeVisible();
    expect(within(section!).getByText('Collector modified · 2026-03-16T08:59:00.000Z')).toBeVisible();
    expect(
      within(section!).queryByRole('button', {
        name: /Open shared memory correlation/
      })
    ).not.toBeInTheDocument();
  });
});
