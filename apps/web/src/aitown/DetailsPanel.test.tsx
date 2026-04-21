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
  OfficeOperations,
  PeerWatchAlertsResponse,
  WorkflowInteraction
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
      actor_id: 'team-lead',
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
    summary: {
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
        red: 0
      },
      latest_activity_at: null
    },
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
    operationsStateBuckets: {
      blocked: 1
    },
    operationsSeverityBuckets: {
      normal: 0,
      yellow: 0,
      orange: 1,
      red: 0
    },
    operationsStateBucketsError: null,
    operationsStateBucketsState: 'ready',
    overviewZones: null,
    manualCorrelationOverrideActive: false,
    preserveWorkflowCounterpartyCorrelation: false,
    memoryArtifacts: buildMemoryArtifacts(),
    memoryArtifactsError: null,
    memoryArtifactsState: 'ready',
    sharedMemoryRequestScopeLabel: 'app-engineering · corr-app-review',
    focusedSharedMemoryArtifactRef: null,
    selectedAgentSupervisionHistoryRequestScopeLabel: 'Target agent · app-engineering',
    selectedAgentSupervisionHistory: {
      items: []
    },
    selectedAgentSupervisionHistoryError: null,
    selectedAgentSupervisionHistoryState: 'ready',
    selectedAgent: buildSelectedAgent(),
    selectedCorrelationId: 'corr-app-review',
    selectedOperationsState: null,
    selectedOperationsSeverity: null,
    selectedOperation: buildSelectedOperation(),
    timelineReplay: null,
    timelineReplayError: null,
    timelineReplayState: 'ready',
    workflow: buildWorkflow(),
    workflowError: null,
    workflowState: 'ready',
    world: buildWorld(),
    onInspectAgent: vi.fn(),
    onSelectAgent: vi.fn(),
    onSelectCorrelation: vi.fn(),
    onResetCorrelationOverride: vi.fn(),
    onSelectOperationsState: vi.fn(),
    onSelectOperationsSeverity: vi.fn(),
    onSelectOperation: vi.fn(),
    ...overrides
  };
}

describe('DetailsPanel selected-agent workflow lifecycle', () => {
  it('shows explicit first-load copy while the selected-agent workflow is still loading', () => {
    render(
      <DetailsPanel
        {...buildProps({
          workflow: null,
          workflowError: null,
          workflowState: 'loading'
        })}
      />
    );

    const workflowSection = screen.getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(within(workflowSection!).getByText('Loading workflow...')).toBeVisible();
    expect(within(workflowSection!).queryByText(/Unable to load workflow\./)).not.toBeInTheDocument();
    expect(within(workflowSection!).queryByText(/Showing last workflow snapshot\./)).not.toBeInTheDocument();
  });

  it('shows explicit first-failure copy when the selected-agent workflow request fails before data loads', () => {
    render(
      <DetailsPanel
        {...buildProps({
          workflow: null,
          workflowError: 'workflow request failed',
          workflowState: 'error'
        })}
      />
    );

    const workflowSection = screen.getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(within(workflowSection!).getByText('Unable to load workflow. workflow request failed')).toBeVisible();
    expect(within(workflowSection!).queryByText(/Loading workflow\.\.\./)).not.toBeInTheDocument();
    expect(within(workflowSection!).queryByText(/Showing last workflow snapshot\./)).not.toBeInTheDocument();
  });

  it('shows explicit refresh-failure copy while retaining the last selected-agent workflow snapshot', () => {
    render(
      <DetailsPanel
        {...buildProps({
          workflowError: 'workflow refresh failed',
          workflowState: 'ready'
        })}
      />
    );

    const workflowSection = screen.getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(within(workflowSection!).getByText('Showing last workflow snapshot. workflow refresh failed')).toBeVisible();
    expect(
      within(workflowSection!).getByText(
        (_, element) => element?.tagName === 'STRONG' && element.textContent === 'Latest heartbeat'
      )
    ).toBeVisible();
    expect(within(workflowSection!).queryByText(/Unable to load workflow\./)).not.toBeInTheDocument();
  });
});

describe('DetailsPanel accountability signals', () => {
  it('shows a return-to-current-scope action for manual correlation overrides in crew-overview and selected-agent surfaces', async () => {
    const user = userEvent.setup();
    const onResetCorrelationOverride = vi.fn();

    const { rerender } = render(
      <DetailsPanel
        {...buildProps({
          onResetCorrelationOverride,
          manualCorrelationOverrideActive: true,
          preserveWorkflowCounterpartyCorrelation: true,
          selectedAgent: null,
          selectedCorrelationId: 'corr-app-secondary',
          selectedOperation: null,
          workflow: null
        })}
      />
    );

    let summary = screen.getByRole('complementary', { name: 'Agent details' }).querySelector('.aitown-details__summary');
    expect(summary).not.toBeNull();
    expect(summary?.querySelectorAll('p')).toHaveLength(1);
    expect(summary).toHaveTextContent('Manual correlation override active.');

    let resetAction = screen.getByRole('button', { name: 'Return to current scope' });
    expect(resetAction).toBeVisible();

    await user.click(resetAction);

    expect(onResetCorrelationOverride).toHaveBeenCalledTimes(1);

    onResetCorrelationOverride.mockClear();
    rerender(
      <DetailsPanel
        {...buildProps({
          onResetCorrelationOverride,
          manualCorrelationOverrideActive: true,
          preserveWorkflowCounterpartyCorrelation: true,
          selectedCorrelationId: 'corr-app-secondary'
        })}
      />
    );

    summary = screen.getByRole('complementary', { name: 'Agent details' }).querySelector('.aitown-details__summary');
    expect(summary).not.toBeNull();
    expect(summary?.querySelectorAll('p')).toHaveLength(1);
    expect(summary).toHaveTextContent('Manual correlation override active.');

    resetAction = screen.getByRole('button', { name: 'Return to current scope' });
    expect(resetAction).toBeVisible();

    await user.click(resetAction);

    expect(onResetCorrelationOverride).toHaveBeenCalledTimes(1);
  });

  it('renders crew-overview watch topology endpoints as pivots only for navigable agents and preserves the active correlation', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const world: WorldState = {
      ...buildWorld(),
      watch_edges: [
        {
          from_agent_id: 'team-lead',
          to_agent_id: 'app-engineering',
          watch_mode: 'lead',
          risk_level: 'yellow'
        },
        {
          from_agent_id: 'ghost-agent',
          to_agent_id: 'growth-revenue',
          watch_mode: 'peer',
          risk_level: 'red'
        }
      ]
    };

    render(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          selectedAgent: null,
          selectedCorrelationId: 'corr-app-secondary',
          selectedOperation: null,
          world
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Watch Topology' }).closest('section');
    expect(section).not.toBeNull();

    const leadEdge = within(section!).getByText((_, element) => element?.tagName === 'STRONG' && element.textContent === 'Team Lead -> App Engineering Agent')
      .closest('li');
    expect(leadEdge).not.toBeNull();
    expect(
      within(leadEdge!).getByRole('button', {
        name: 'Select watch topology source agent from lead edge team-lead app-engineering'
      })
    ).toBeVisible();
    const leadTargetPivot = within(leadEdge!).getByRole('button', {
      name: 'Select watch topology target agent from lead edge team-lead app-engineering'
    });
    expect(leadTargetPivot).toBeVisible();

    const ghostEdge = within(section!).getByText((_, element) => element?.tagName === 'STRONG' && element.textContent === 'ghost-agent -> Growth Revenue Agent')
      .closest('li');
    expect(ghostEdge).not.toBeNull();
    expect(
      within(ghostEdge!).queryByRole('button', {
        name: 'Select watch topology source agent from peer edge ghost-agent growth-revenue'
      })
    ).not.toBeInTheDocument();
    expect(
      within(ghostEdge!).getByRole('button', {
        name: 'Select watch topology target agent from peer edge ghost-agent growth-revenue'
      })
    ).toBeVisible();

    await user.click(leadTargetPivot);

    expect(onSelectAgent).toHaveBeenCalledWith('app-engineering', 'corr-app-secondary');
  });

  it('renders crew-overview active-queue correlation pivots only for rows with a correlation id', async () => {
    const user = userEvent.setup();
    const onSelectCorrelation = vi.fn();
    const onSelectOperation = vi.fn();
    const operations: OfficeOperations = {
      generated_at: '2026-03-16T09:00:00.000Z',
      summary: {
        item_count: 2,
        blocked_count: 1,
        reboot_recommended_count: 1,
        state_buckets: {
          blocked: 1,
          reviewing: 1
        },
        severity_buckets: {
          normal: 1,
          yellow: 0,
          orange: 1,
          red: 0
        }
      },
      items: [
        buildSelectedOperation(),
        {
          ...buildSelectedOperation(),
          agent_id: 'team-lead',
          display_name: 'Team Lead',
          kind: 'lead',
          current_state: 'reviewing',
          active_task: 'Coordinate rollout',
          current_blocker: '',
          current_location: 'lead-desk',
          reported_severity: 'normal',
          effective_severity: 'normal',
          derived_staleness: {
            severity: 'normal',
            stale_for_ms: 60000,
            stale_for_minutes: 1,
            last_meaningful_output_at: '2026-03-16T08:59:00.000Z'
          },
          reboot_recommended: false,
          last_event_at: null,
          last_heartbeat_at: null,
          last_meaningful_output_at: null,
          correlation_id: null,
          latest_event: null
        }
      ]
    };

    render(
      <DetailsPanel
        {...buildProps({
          onSelectCorrelation,
          onSelectOperation,
          operations,
          selectedAgent: null,
          selectedCorrelationId: null,
          selectedOperation: null,
          workflow: null
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Active Queue' }).closest('section');
    expect(section).not.toBeNull();

    const appRecord = within(section!)
      .getByRole('button', { name: 'Inspect App Engineering Agent from active queue' })
      .closest('li');
    const teamLeadRecord = within(section!)
      .getByRole('button', { name: 'Inspect Team Lead from active queue' })
      .closest('li');
    expect(appRecord).not.toBeNull();
    expect(teamLeadRecord).not.toBeNull();
    expect(appRecord!).toHaveTextContent('Correlation · corr-app-review');
    expect(teamLeadRecord!).toHaveTextContent('Correlation · No correlation id');

    const activeQueueCorrelationButton = within(appRecord!).getByRole('button', {
      name: 'Open active queue correlation corr-app-review'
    });
    expect(activeQueueCorrelationButton).toBeVisible();
    expect(
      within(teamLeadRecord!).queryByRole('button', {
        name: /Open active queue correlation/
      })
    ).not.toBeInTheDocument();

    await user.click(activeQueueCorrelationButton);

    expect(onSelectCorrelation).toHaveBeenCalledWith('corr-app-review', {
      preserveAutoOnDefaultReselect: true
    });
    expect(onSelectOperation).not.toHaveBeenCalled();
  });

  it('preserves auto mode when re-selecting the already-active default correlation from active queue', async () => {
    const user = userEvent.setup();
    const onSelectCorrelation = vi.fn();

    render(
      <DetailsPanel
        {...buildProps({
          onSelectCorrelation,
          selectedAgent: null,
          selectedCorrelationId: 'corr-app-review',
          selectedOperation: null,
          workflow: null
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Active Queue' }).closest('section');
    expect(section).not.toBeNull();

    const activeQueueCorrelationButton = within(section!).getByRole('button', {
      name: 'Open active queue correlation corr-app-review, currently selected'
    });

    await user.click(activeQueueCorrelationButton);

    expect(onSelectCorrelation).toHaveBeenCalledWith('corr-app-review', {
      preserveAutoOnDefaultReselect: true
    });
  });

  it('preserves auto mode when re-selecting the already-active default correlation from the open supervision alerts queue', async () => {
    const user = userEvent.setup();
    const onSelectCorrelation = vi.fn();

    render(
      <DetailsPanel
        {...buildProps({
          onSelectCorrelation,
          selectedAgent: null,
          selectedCorrelationId: 'corr-app-review',
          selectedOperation: null,
          workflow: null,
          openSupervisionAlerts: {
            items: [
              {
                alert_id: 'alert-open-queue-default-correlation',
                ts: '2026-03-16T08:55:00.000Z',
                agent_id: 'growth-revenue',
                target_agent_id: 'growth-revenue',
                actor_id: 'team-lead',
                observer_agent_id: 'app-engineering',
                watcher_agent_ids: ['team-lead'],
                severity: 'orange',
                status: 'open',
                current_state: 'blocked',
                active_task: 'Escalate missing revenue evidence before release review',
                summary: 'Open supervision queue keeps auto mode on default correlation reselect',
                evidence_refs: ['/tmp/revenue-evidence.md'],
                evidence_count: 1,
                correlation_id: 'corr-app-review',
                source_kind: 'controller_event',
                metadata: {
                  escalation: 'release-review'
                }
              }
            ]
          }
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Open Supervision Alerts' }).closest('section');
    expect(section).not.toBeNull();

    const openSupervisionCorrelationButton = within(section!).getByRole('button', {
      name: 'Open supervision queue correlation corr-app-review, currently selected'
    });

    await user.click(openSupervisionCorrelationButton);

    expect(onSelectCorrelation).toHaveBeenCalledWith('corr-app-review', {
      preserveAutoOnDefaultReselect: true
    });
  });

  it('preserves the null-correlation path when opening target and watcher pivots from the open supervision alerts queue', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();

    render(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          selectedAgent: null,
          selectedCorrelationId: null,
          selectedOperation: null,
          workflow: null,
          openSupervisionAlerts: {
            items: [
              {
                alert_id: 'alert-open-queue-null-correlation',
                ts: '2026-03-16T08:55:00.000Z',
                agent_id: 'growth-revenue',
                target_agent_id: 'growth-revenue',
                actor_id: 'team-lead',
                observer_agent_id: 'app-engineering',
                watcher_agent_ids: ['team-lead'],
                severity: 'orange',
                status: 'open',
                current_state: 'blocked',
                active_task: 'Escalate missing revenue evidence before release review',
                summary: 'Open supervision queue keeps null-correlation pivots on the no-correlation path',
                evidence_refs: ['/tmp/revenue-evidence.md'],
                evidence_count: 1,
                correlation_id: null,
                source_kind: 'controller_event',
                metadata: {
                  escalation: 'release-review'
                }
              }
            ]
          }
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Open Supervision Alerts' }).closest('section');
    expect(section).not.toBeNull();

    await user.click(
      within(section!).getByRole('button', {
        name: 'Inspect Growth Revenue Agent from open supervision alerts queue'
      })
    );

    expect(onSelectAgent).toHaveBeenCalledWith('growth-revenue', null, {
      preserveNullCorrelation: true
    });

    await user.click(
      within(section!).getByRole('button', {
        name: 'Select open supervision alert watcher from alert alert-open-queue-null-correlation team-lead'
      })
    );

    expect(onSelectAgent).toHaveBeenLastCalledWith('team-lead', null, {
      preserveNullCorrelation: true
    });
  });

  it('renders active-queue counterparties as pivots only for navigable non-self agents, preserves an active crew-overview correlation, and otherwise keeps the agent-only path', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const operations: OfficeOperations = {
      generated_at: '2026-03-16T09:00:00.000Z',
      summary: {
        item_count: 2,
        blocked_count: 1,
        reboot_recommended_count: 1,
        state_buckets: {
          blocked: 1,
          reviewing: 1
        },
        severity_buckets: {
          normal: 1,
          yellow: 0,
          orange: 1,
          red: 0
        }
      },
      items: [
        {
          ...buildSelectedOperation(),
          latest_event: {
            ...buildSelectedOperation().latest_event!,
            counterparty_agent_ids: ['app-engineering', 'growth-revenue', 'ghost-agent']
          }
        },
        {
          ...buildSelectedOperation(),
          agent_id: 'team-lead',
          display_name: 'Team Lead',
          kind: 'lead',
          current_state: 'reviewing',
          active_task: 'Coordinate rollout',
          current_blocker: '',
          current_location: 'lead-desk',
          reported_severity: 'normal',
          effective_severity: 'normal',
          derived_staleness: {
            severity: 'normal',
            stale_for_ms: 60000,
            stale_for_minutes: 1,
            last_meaningful_output_at: '2026-03-16T08:59:00.000Z'
          },
          reboot_recommended: false,
          last_event_at: null,
          last_heartbeat_at: null,
          last_meaningful_output_at: null,
          correlation_id: null,
          latest_event: null
        }
      ]
    };

    const { rerender } = render(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          operations,
          selectedAgent: null,
          selectedCorrelationId: 'corr-app-secondary',
          selectedOperation: null,
          workflow: null
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Active Queue' }).closest('section');
    expect(section).not.toBeNull();

    const appRecord = within(section!)
      .getByRole('button', { name: 'Inspect App Engineering Agent from active queue' })
      .closest('li');
    const teamLeadRecord = within(section!)
      .getByRole('button', { name: 'Inspect Team Lead from active queue' })
      .closest('li');
    expect(appRecord).not.toBeNull();
    expect(teamLeadRecord).not.toBeNull();

    expect(appRecord).toHaveTextContent('Counterparties · app-engineering, growth-revenue, ghost-agent');
    expect(
      within(appRecord!).queryByRole('button', {
        name: 'Select active queue counterparty agent from operation app-engineering app-engineering'
      })
    ).not.toBeInTheDocument();
    expect(
      within(appRecord!).getByRole('button', {
        name: 'Select active queue counterparty agent from operation app-engineering growth-revenue'
      })
    ).toBeVisible();
    expect(
      within(appRecord!).queryByRole('button', {
        name: 'Select active queue counterparty agent from operation app-engineering ghost-agent'
      })
    ).not.toBeInTheDocument();
    expect(teamLeadRecord).toHaveTextContent('Counterparties · No counterparties');

    const counterpartyPivot = within(appRecord!).getByRole('button', {
      name: 'Select active queue counterparty agent from operation app-engineering growth-revenue'
    });
    await user.click(counterpartyPivot);

    expect(onSelectAgent).toHaveBeenNthCalledWith(1, 'growth-revenue', 'corr-app-secondary');

    rerender(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          operations,
          selectedAgent: null,
          selectedCorrelationId: null,
          selectedOperation: null,
          workflow: null
        })}
      />
    );

    const counterpartyPivotWithoutActiveCorrelation = within(
      screen.getByRole('heading', { name: 'Active Queue' }).closest('section')!
    ).getByRole('button', {
      name: 'Select active queue counterparty agent from operation app-engineering growth-revenue'
    });
    counterpartyPivotWithoutActiveCorrelation.focus();
    expect(counterpartyPivotWithoutActiveCorrelation).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(onSelectAgent).toHaveBeenNthCalledWith(2, 'growth-revenue', null);
  });

  it('renders active-queue actors as pivots only for navigable non-current agents, preserves an active crew-overview correlation, and otherwise keeps the agent-only path', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const operations: OfficeOperations = {
      generated_at: '2026-03-16T09:00:00.000Z',
      summary: {
        item_count: 3,
        blocked_count: 1,
        reboot_recommended_count: 1,
        state_buckets: {
          blocked: 1,
          reviewing: 1,
          waiting: 1
        },
        severity_buckets: {
          normal: 1,
          yellow: 0,
          orange: 1,
          red: 1
        }
      },
      items: [
        {
          ...buildSelectedOperation(),
          latest_event: {
            ...buildSelectedOperation().latest_event!,
            actor_id: 'growth-revenue'
          }
        },
        {
          ...buildSelectedOperation(),
          agent_id: 'team-lead',
          display_name: 'Team Lead',
          kind: 'lead',
          current_state: 'reviewing',
          active_task: 'Coordinate rollout',
          current_blocker: '',
          current_location: 'lead-desk',
          reported_severity: 'normal',
          effective_severity: 'normal',
          derived_staleness: {
            severity: 'normal',
            stale_for_ms: 60000,
            stale_for_minutes: 1,
            last_meaningful_output_at: '2026-03-16T08:59:00.000Z'
          },
          reboot_recommended: false,
          last_event_at: '2026-03-16T08:59:10.000Z',
          last_heartbeat_at: null,
          last_meaningful_output_at: null,
          correlation_id: 'corr-team-lead',
          latest_event: {
            ...buildSelectedOperation().latest_event!,
            actor_id: 'team-lead',
            summary: 'Team lead recorded the current review state'
          }
        },
        {
          ...buildSelectedOperation(),
          agent_id: 'growth-revenue',
          display_name: 'Growth Revenue Agent',
          current_state: 'waiting',
          active_task: 'Review launch copy',
          current_blocker: '',
          current_location: 'growth-desk',
          reported_severity: 'red',
          effective_severity: 'red',
          derived_staleness: {
            severity: 'red',
            stale_for_ms: 900000,
            stale_for_minutes: 15,
            last_meaningful_output_at: '2026-03-16T08:45:00.000Z'
          },
          reboot_recommended: false,
          last_event_at: '2026-03-16T08:56:00.000Z',
          last_heartbeat_at: null,
          last_meaningful_output_at: '2026-03-16T08:45:00.000Z',
          correlation_id: 'corr-growth-ghost',
          latest_event: {
            ...buildSelectedOperation().latest_event!,
            actor_id: 'ghost-agent',
            summary: 'Unknown actor left a launch review note'
          }
        }
      ]
    };

    const { rerender } = render(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          operations,
          selectedAgent: null,
          selectedCorrelationId: 'corr-app-secondary',
          selectedOperation: null,
          workflow: null
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Active Queue' }).closest('section');
    expect(section).not.toBeNull();

    const appRecord = within(section!)
      .getByRole('button', { name: 'Inspect App Engineering Agent from active queue' })
      .closest('li');
    const teamLeadRecord = within(section!)
      .getByRole('button', { name: 'Inspect Team Lead from active queue' })
      .closest('li');
    const growthRecord = within(section!)
      .getByRole('button', { name: 'Inspect Growth Revenue Agent from active queue' })
      .closest('li');
    expect(appRecord).not.toBeNull();
    expect(teamLeadRecord).not.toBeNull();
    expect(growthRecord).not.toBeNull();

    expect(appRecord).toHaveTextContent('Actor · growth-revenue');
    expect(teamLeadRecord).toHaveTextContent('Actor · team-lead');
    expect(growthRecord).toHaveTextContent('Actor · ghost-agent');
    expect(
      within(appRecord!).getByRole('button', {
        name: 'Select active queue actor from operation app-engineering growth-revenue'
      })
    ).toBeVisible();
    expect(
      within(teamLeadRecord!).queryByRole('button', {
        name: 'Select active queue actor from operation team-lead team-lead'
      })
    ).not.toBeInTheDocument();
    expect(
      within(growthRecord!).queryByRole('button', {
        name: 'Select active queue actor from operation growth-revenue ghost-agent'
      })
    ).not.toBeInTheDocument();

    const actorPivot = within(appRecord!).getByRole('button', {
      name: 'Select active queue actor from operation app-engineering growth-revenue'
    });
    await user.click(actorPivot);

    expect(onSelectAgent).toHaveBeenNthCalledWith(1, 'growth-revenue', 'corr-app-secondary');

    rerender(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          operations,
          selectedAgent: null,
          selectedCorrelationId: null,
          selectedOperation: null,
          workflow: null
        })}
      />
    );

    const actorPivotWithoutActiveCorrelation = within(
      screen.getByRole('heading', { name: 'Active Queue' }).closest('section')!
    ).getByRole('button', {
      name: 'Select active queue actor from operation app-engineering growth-revenue'
    });
    actorPivotWithoutActiveCorrelation.focus();
    expect(actorPivotWithoutActiveCorrelation).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(onSelectAgent).toHaveBeenNthCalledWith(2, 'growth-revenue', null);
  });

  it('renders a crew-overview active-correlation queue lane only while an active correlation exists and keeps queue pivots inside that correlation', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const onSelectOperation = vi.fn();
    const operations: OfficeOperations = {
      generated_at: '2026-03-16T09:00:00.000Z',
      summary: {
        item_count: 3,
        blocked_count: 1,
        reboot_recommended_count: 1,
        state_buckets: {
          blocked: 1,
          reviewing: 1,
          waiting: 1
        },
        severity_buckets: {
          normal: 1,
          yellow: 0,
          orange: 1,
          red: 1
        }
      },
      items: [
        buildSelectedOperation(),
        {
          ...buildSelectedOperation(),
          agent_id: 'team-lead',
          display_name: 'Team Lead',
          kind: 'lead',
          current_state: 'reviewing',
          active_task: 'Coordinate rollout',
          current_blocker: '',
          current_location: 'lead-desk',
          reported_severity: 'normal',
          effective_severity: 'normal',
          derived_staleness: {
            severity: 'normal',
            stale_for_ms: 60000,
            stale_for_minutes: 1,
            last_meaningful_output_at: '2026-03-16T08:59:00.000Z'
          },
          reboot_recommended: false,
          last_event_at: '2026-03-16T08:59:10.000Z',
          last_heartbeat_at: null,
          last_meaningful_output_at: null,
          correlation_id: null,
          latest_event: {
            ...buildSelectedOperation().latest_event!,
            actor_id: 'team-lead',
            summary: 'Team lead recorded the current review state'
          }
        },
        {
          ...buildSelectedOperation(),
          agent_id: 'growth-revenue',
          display_name: 'Growth Revenue Agent',
          current_state: 'waiting',
          active_task: 'Review launch copy',
          current_blocker: '',
          current_location: 'growth-desk',
          reported_severity: 'red',
          effective_severity: 'red',
          derived_staleness: {
            severity: 'red',
            stale_for_ms: 900000,
            stale_for_minutes: 15,
            last_meaningful_output_at: '2026-03-16T08:45:00.000Z'
          },
          reboot_recommended: false,
          last_event_at: '2026-03-16T08:56:00.000Z',
          last_heartbeat_at: null,
          last_meaningful_output_at: '2026-03-16T08:45:00.000Z',
          correlation_id: 'corr-growth-ghost',
          latest_event: {
            ...buildSelectedOperation().latest_event!,
            actor_id: 'growth-revenue',
            summary: 'Growth queued a launch review note'
          }
        }
      ]
    };

    const { rerender } = render(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          onSelectOperation,
          operations,
          selectedAgent: null,
          selectedCorrelationId: 'corr-app-review',
          selectedOperation: null,
          workflow: null
        })}
      />
    );

    const laneSection = screen.getByRole('heading', { name: 'Active Correlation Queue' }).closest('section');
    expect(laneSection).not.toBeNull();
    expect(within(laneSection!).getByText('Scope · corr-app-review · 2 of 2 participants in current active queue snapshot')).toBeVisible();
    expect(
      within(laneSection!).getByRole('button', { name: 'Inspect App Engineering Agent from active correlation queue' })
    ).toBeVisible();
    expect(within(laneSection!).getByRole('button', { name: 'Inspect Team Lead from active correlation queue' })).toBeVisible();
    expect(
      within(laneSection!).queryByRole('button', { name: 'Inspect Growth Revenue Agent from active correlation queue' })
    ).not.toBeInTheDocument();

    await user.click(
      within(laneSection!).getByRole('button', { name: 'Inspect App Engineering Agent from active correlation queue' })
    );

    expect(onSelectOperation).toHaveBeenCalledWith(expect.objectContaining({ agent_id: 'app-engineering' }), {
      preserveActiveCorrelation: true
    });

    await user.click(
      within(laneSection!).getByRole('button', {
        name: 'Select active correlation queue actor from operation app-engineering team-lead'
      })
    );

    expect(onSelectAgent).toHaveBeenCalledWith('team-lead', 'corr-app-review');

    rerender(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          onSelectOperation,
          operations,
          correlation: null,
          selectedAgent: null,
          selectedCorrelationId: null,
          selectedOperation: null,
          workflow: null
        })}
      />
    );

    expect(screen.queryByRole('heading', { name: 'Active Correlation Queue' })).not.toBeInTheDocument();
  });

  it('renders the active-correlation queue lane in selected-agent mode while an active correlation exists and keeps queue pivots inside that correlation', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const onSelectOperation = vi.fn();
    const operations: OfficeOperations = {
      generated_at: '2026-03-16T09:00:00.000Z',
      summary: {
        item_count: 3,
        blocked_count: 1,
        reboot_recommended_count: 1,
        state_buckets: {
          blocked: 1,
          reviewing: 1,
          waiting: 1
        },
        severity_buckets: {
          normal: 1,
          yellow: 0,
          orange: 1,
          red: 1
        }
      },
      items: [
        buildSelectedOperation(),
        {
          ...buildSelectedOperation(),
          agent_id: 'team-lead',
          display_name: 'Team Lead',
          kind: 'lead',
          current_state: 'reviewing',
          active_task: 'Coordinate rollout',
          current_blocker: '',
          current_location: 'lead-desk',
          reported_severity: 'normal',
          effective_severity: 'normal',
          derived_staleness: {
            severity: 'normal',
            stale_for_ms: 60000,
            stale_for_minutes: 1,
            last_meaningful_output_at: '2026-03-16T08:59:00.000Z'
          },
          reboot_recommended: false,
          last_event_at: '2026-03-16T08:59:10.000Z',
          last_heartbeat_at: null,
          last_meaningful_output_at: null,
          correlation_id: null,
          latest_event: {
            ...buildSelectedOperation().latest_event!,
            actor_id: 'team-lead',
            summary: 'Team lead recorded the current review state'
          }
        },
        {
          ...buildSelectedOperation(),
          agent_id: 'growth-revenue',
          display_name: 'Growth Revenue Agent',
          current_state: 'waiting',
          active_task: 'Review launch copy',
          current_blocker: '',
          current_location: 'growth-desk',
          reported_severity: 'red',
          effective_severity: 'red',
          derived_staleness: {
            severity: 'red',
            stale_for_ms: 900000,
            stale_for_minutes: 15,
            last_meaningful_output_at: '2026-03-16T08:45:00.000Z'
          },
          reboot_recommended: false,
          last_event_at: '2026-03-16T08:56:00.000Z',
          last_heartbeat_at: null,
          last_meaningful_output_at: '2026-03-16T08:45:00.000Z',
          correlation_id: 'corr-growth-ghost',
          latest_event: {
            ...buildSelectedOperation().latest_event!,
            actor_id: 'growth-revenue',
            summary: 'Growth queued a launch review note'
          }
        }
      ]
    };

    render(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          onSelectOperation,
          operations,
          activeCorrelationQueueOperations: operations,
          activeCorrelationQueueState: 'ready',
          selectedCorrelationId: 'corr-app-review'
        })}
      />
    );

    expect(screen.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Crew Overview' })).not.toBeInTheDocument();

    const laneSection = screen.getByRole('heading', { name: 'Active Correlation Queue' }).closest('section');
    expect(laneSection).not.toBeNull();
    expect(within(laneSection!).getByText('Scope · corr-app-review · 2 of 2 participants in current active queue snapshot')).toBeVisible();
    expect(
      within(laneSection!).getByRole('button', { name: 'Inspect App Engineering Agent from active correlation queue' })
    ).toBeVisible();
    expect(within(laneSection!).getByRole('button', { name: 'Inspect Team Lead from active correlation queue' })).toBeVisible();
    expect(
      within(laneSection!).queryByRole('button', { name: 'Inspect Growth Revenue Agent from active correlation queue' })
    ).not.toBeInTheDocument();

    await user.click(
      within(laneSection!).getByRole('button', { name: 'Inspect App Engineering Agent from active correlation queue' })
    );

    expect(onSelectOperation).toHaveBeenCalledWith(expect.objectContaining({ agent_id: 'app-engineering' }), {
      preserveActiveCorrelation: true
    });

    await user.click(
      within(laneSection!).getByRole('button', {
        name: 'Select active correlation queue actor from operation app-engineering team-lead'
      })
    );

    expect(onSelectAgent).toHaveBeenCalledWith('team-lead', 'corr-app-review');
  });

  it('suppresses the selected-agent active-correlation queue lane when no cached queue snapshot exists yet', () => {
    render(
      <DetailsPanel
        {...buildProps({
          activeCorrelationQueueOperations: null,
          activeCorrelationQueueError: null,
          activeCorrelationQueueState: 'idle',
          selectedCorrelationId: 'corr-app-review'
        })}
      />
    );

    expect(screen.queryByRole('heading', { name: 'Active Correlation Queue' })).not.toBeInTheDocument();
  });

  it('renders explicit active-correlation queue lane loading, empty, and stale-or-error states', () => {
    const emptyOperations: OfficeOperations = {
      generated_at: '2026-03-16T09:00:00.000Z',
      summary: {
        item_count: 0,
        blocked_count: 0,
        reboot_recommended_count: 0,
        state_buckets: {},
        severity_buckets: {
          normal: 0,
          yellow: 0,
          orange: 0,
          red: 0
        }
      },
      items: []
    };

    const { rerender } = render(
      <DetailsPanel
        {...buildProps({
          operations: null,
          operationsError: null,
          operationsState: 'loading',
          selectedAgent: null,
          selectedCorrelationId: 'corr-app-review',
          selectedOperation: null,
          workflow: null
        })}
      />
    );

    let laneSection = screen.getByRole('heading', { name: 'Active Correlation Queue' }).closest('section');
    expect(laneSection).not.toBeNull();
    expect(within(laneSection!).getByText('Loading active-correlation queue lane for corr-app-review...')).toBeVisible();

    rerender(
      <DetailsPanel
        {...buildProps({
          operations: null,
          operationsError: 'queue request failed',
          operationsState: 'error',
          selectedAgent: null,
          selectedCorrelationId: 'corr-app-review',
          selectedOperation: null,
          workflow: null
        })}
      />
    );

    laneSection = screen.getByRole('heading', { name: 'Active Correlation Queue' }).closest('section');
    expect(laneSection).not.toBeNull();
    expect(
      within(laneSection!).getByText('Unable to load active-correlation queue lane for corr-app-review. queue request failed')
    ).toBeVisible();

    rerender(
      <DetailsPanel
        {...buildProps({
          operations: buildOperations(),
          operationsError: 'queue refresh failed',
          operationsState: 'ready',
          selectedAgent: null,
          selectedCorrelationId: 'corr-app-review',
          selectedOperation: null,
          workflow: null
        })}
      />
    );

    laneSection = screen.getByRole('heading', { name: 'Active Correlation Queue' }).closest('section');
    expect(laneSection).not.toBeNull();
    expect(
      within(laneSection!).getByText('Showing last active-correlation queue lane snapshot for corr-app-review. queue refresh failed')
    ).toBeVisible();

    rerender(
      <DetailsPanel
        {...buildProps({
          operations: emptyOperations,
          operationsError: null,
          operationsState: 'ready',
          selectedAgent: null,
          selectedCorrelationId: 'corr-app-review',
          selectedOperation: null,
          workflow: null
        })}
      />
    );

    laneSection = screen.getByRole('heading', { name: 'Active Correlation Queue' }).closest('section');
    expect(laneSection).not.toBeNull();
    expect(
      within(laneSection!).getByText('No active-correlation queue items for corr-app-review in current active queue snapshot.')
    ).toBeVisible();
  });

  it('renders one compact run-context preview line per active-queue row with explicit null fallbacks', () => {
    const operations: OfficeOperations = {
      generated_at: '2026-03-16T09:00:00.000Z',
      summary: {
        item_count: 2,
        blocked_count: 1,
        reboot_recommended_count: 1,
        state_buckets: {
          blocked: 1,
          reviewing: 1
        },
        severity_buckets: {
          normal: 1,
          yellow: 0,
          orange: 1,
          red: 0
        }
      },
      items: [
        buildSelectedOperation(),
        {
          ...buildSelectedOperation(),
          agent_id: 'team-lead',
          display_name: 'Team Lead',
          kind: 'lead',
          current_state: 'reviewing',
          active_task: 'Coordinate rollout',
          current_blocker: '',
          current_location: 'lead-desk',
          reported_severity: 'normal',
          effective_severity: 'normal',
          derived_staleness: {
            severity: 'normal',
            stale_for_ms: 60000,
            stale_for_minutes: 1,
            last_meaningful_output_at: '2026-03-16T08:59:00.000Z'
          },
          reboot_recommended: false,
          last_event_at: null,
          last_heartbeat_at: null,
          last_meaningful_output_at: null,
          correlation_id: null,
          latest_event: null
        }
      ]
    };

    render(
      <DetailsPanel
        {...buildProps({
          operations,
          selectedAgent: null,
          selectedCorrelationId: null,
          selectedOperation: null,
          workflow: null
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Active Queue' }).closest('section');
    expect(section).not.toBeNull();

    const appButton = within(section!).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' });
    const teamLeadButton = within(section!).getByRole('button', { name: 'Inspect Team Lead from active queue' });
    const appRecord = appButton.closest('li');
    const teamLeadRecord = teamLeadButton.closest('li');
    expect(appRecord).not.toBeNull();
    expect(teamLeadRecord).not.toBeNull();

    expect(appButton).toHaveAttribute(
      'aria-describedby',
      'aitown-active-queue-status-app-engineering aitown-active-queue-preview-app-engineering'
    );
    expect(teamLeadButton).toHaveAttribute(
      'aria-describedby',
      'aitown-active-queue-status-team-lead aitown-active-queue-preview-team-lead'
    );
    expect(document.getElementById('aitown-active-queue-status-app-engineering')).toHaveTextContent(
      'blocked · Waiting on review sign-off'
    );
    expect(document.getElementById('aitown-active-queue-preview-app-engineering')).toHaveTextContent(
      'Event · Followed up on missing workflow evidence · Source · controller_event · Freshness · 2026-03-16T08:58:30.000Z · Heartbeat · 2026-03-16T08:59:30.000Z · Output · 2026-03-16T08:58:00.000Z · Staleness · Yellow · 5m · Reboot · Recommended'
    );
    expect(document.getElementById('aitown-active-queue-status-team-lead')).toHaveTextContent(
      'reviewing · Coordinate rollout'
    );
    expect(document.getElementById('aitown-active-queue-preview-team-lead')).toHaveTextContent(
      'Event · No latest event yet · Source · No latest event source · Freshness · No last event timestamp · Heartbeat · No heartbeat yet · Output · No last output timestamp · Staleness · Normal · 1m · Reboot · No'
    );
  });

  it('treats empty-string active-queue event fields as fallbacks and wires the preview into aria-describedby', () => {
    const operations: OfficeOperations = {
      generated_at: '2026-03-16T09:00:00.000Z',
      summary: {
        item_count: 1,
        blocked_count: 0,
        reboot_recommended_count: 0,
        state_buckets: {
          reviewing: 1
        },
        severity_buckets: {
          normal: 1,
          yellow: 0,
          orange: 0,
          red: 0
        }
      },
      items: [
        {
          ...buildSelectedOperation(),
          agent_id: 'team-lead',
          display_name: 'Team Lead',
          kind: 'lead',
          current_state: 'reviewing',
          active_task: 'Coordinate rollout',
          current_blocker: '',
          current_location: 'lead-desk',
          reported_severity: 'normal',
          effective_severity: 'normal',
          derived_staleness: {
            severity: 'normal',
            stale_for_ms: 0,
            stale_for_minutes: 0,
            last_meaningful_output_at: ''
          },
          reboot_recommended: false,
          last_event_at: '',
          last_heartbeat_at: '',
          last_meaningful_output_at: '',
          correlation_id: null,
          latest_event: {
            ...buildSelectedOperation().latest_event!,
            summary: '',
            source_kind: ''
          }
        }
      ]
    };

    render(
      <DetailsPanel
        {...buildProps({
          operations,
          selectedAgent: null,
          selectedCorrelationId: null,
          selectedOperation: null,
          workflow: null
        })}
      />
    );

    const button = screen.getByRole('button', { name: 'Inspect Team Lead from active queue' });
    expect(button).toHaveAttribute(
      'aria-describedby',
      'aitown-active-queue-status-team-lead aitown-active-queue-preview-team-lead'
    );
    expect(document.getElementById('aitown-active-queue-status-team-lead')).toHaveTextContent(
      'reviewing · Coordinate rollout'
    );
    expect(document.getElementById('aitown-active-queue-preview-team-lead')).toHaveTextContent(
      'Event · No latest event yet · Source · No latest event source · Freshness · No last event timestamp · Heartbeat · No heartbeat yet · Output · No last output timestamp · Staleness · Normal · 0m · Reboot · No'
    );
  });

  it('renders active-queue state options from the provided crew-overview buckets while filtered', async () => {
    const user = userEvent.setup();
    const onSelectOperationsState = vi.fn();

    render(
      <DetailsPanel
        {...buildProps({
          onSelectOperationsState,
          operationsStateBuckets: {
            blocked: 1,
            waiting: 1
          },
          selectedAgent: null,
          selectedCorrelationId: null,
          selectedOperationsState: 'blocked',
          selectedOperation: null,
          workflow: null
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Active Queue' }).closest('section');
    expect(section).not.toBeNull();

    const stateFilter = within(section!).getByRole('combobox', {
      name: 'Filter active queue by state'
    });

    expect(within(stateFilter).getByRole('option', { name: 'All states (2)' })).toBeVisible();
    expect(within(stateFilter).getByRole('option', { name: 'Blocked (1)' })).toBeVisible();
    expect(within(stateFilter).getByRole('option', { name: 'Waiting (1)' })).toBeVisible();

    await user.selectOptions(stateFilter, 'waiting');

    expect(onSelectOperationsState).toHaveBeenCalledWith('waiting');
  });

  it('renders active-queue severity options from the provided crew-overview buckets while filtered', async () => {
    const user = userEvent.setup();
    const onSelectOperationsSeverity = vi.fn();

    render(
      <DetailsPanel
        {...buildProps({
          onSelectOperationsSeverity,
          operationsSeverityBuckets: {
            normal: 0,
            yellow: 1,
            orange: 1,
            red: 0
          },
          selectedAgent: null,
          selectedCorrelationId: null,
          selectedOperationsSeverity: 'yellow',
          selectedOperation: null,
          workflow: null
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Active Queue' }).closest('section');
    expect(section).not.toBeNull();

    const severityFilter = within(section!).getByRole('combobox', {
      name: 'Filter active queue by severity'
    });

    expect(within(severityFilter).getByRole('option', { name: 'All severities (2)' })).toBeVisible();
    expect(within(severityFilter).getByRole('option', { name: 'Yellow (1)' })).toBeVisible();
    expect(within(severityFilter).getByRole('option', { name: 'Orange (1)' })).toBeVisible();

    await user.selectOptions(severityFilter, 'orange');

    expect(onSelectOperationsSeverity).toHaveBeenCalledWith('orange');
  });

  it('jumps from matching active-queue evidence refs to shared memory while leaving non-matching refs as plain text and showing explicit fallbacks', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const onSelectCorrelation = vi.fn();
    const onSelectOperation = vi.fn();
    const operations: OfficeOperations = {
      generated_at: '2026-03-16T09:00:00.000Z',
      summary: {
        item_count: 2,
        blocked_count: 1,
        reboot_recommended_count: 1,
        state_buckets: {
          blocked: 1,
          reviewing: 1
        },
        severity_buckets: {
          normal: 1,
          yellow: 0,
          orange: 1,
          red: 0
        }
      },
      items: [
        {
          ...buildSelectedOperation(),
          latest_event: {
            ...buildSelectedOperation().latest_event!,
            evidence_refs: ['/evidence/review.md', '/evidence/missing.md']
          }
        },
        {
          ...buildSelectedOperation(),
          agent_id: 'team-lead',
          display_name: 'Team Lead',
          kind: 'lead',
          current_state: 'reviewing',
          active_task: 'Coordinate rollout',
          current_blocker: '',
          current_location: 'lead-desk',
          reported_severity: 'normal',
          effective_severity: 'normal',
          derived_staleness: {
            severity: 'normal',
            stale_for_ms: 60000,
            stale_for_minutes: 1,
            last_meaningful_output_at: '2026-03-16T08:59:00.000Z'
          },
          reboot_recommended: false,
          last_event_at: null,
          last_heartbeat_at: null,
          last_meaningful_output_at: null,
          correlation_id: null,
          latest_event: {
            ...buildSelectedOperation().latest_event!,
            summary: 'Queue item with no linked evidence refs',
            evidence_refs: []
          }
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
          first_seen_at: '2026-03-16T08:42:00.000Z',
          last_seen_at: '2026-03-16T08:58:00.000Z',
          mention_count: 2,
          agent_ids: ['app-engineering', 'team-lead'],
          correlation_ids: ['corr-app-review'],
          source_kinds: ['controller_event'],
          latest_summary: 'Active queue evidence anchor',
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
          onSelectOperation,
          operations,
          selectedAgent: null,
          selectedCorrelationId: 'corr-app-review',
          selectedOperation: null,
          workflow: null
        })}
      />
    );

    const queueSection = screen.getByRole('heading', { name: 'Active Queue' }).closest('section');
    const sharedMemorySection = screen.getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(queueSection).not.toBeNull();
    expect(sharedMemorySection).not.toBeNull();

    const appRecord = within(queueSection!)
      .getByRole('button', { name: 'Inspect App Engineering Agent from active queue' })
      .closest('li');
    const teamLeadRecord = within(queueSection!)
      .getByRole('button', { name: 'Inspect Team Lead from active queue' })
      .closest('li');
    const artifactRecord = within(sharedMemorySection!).getByText('Ref · /evidence/review.md').closest('li');
    expect(appRecord).not.toBeNull();
    expect(teamLeadRecord).not.toBeNull();
    expect(artifactRecord).not.toBeNull();

    expect(appRecord!).toHaveTextContent(
      'Evidence · /evidence/review.md, /evidence/missing.md'
    );
    expect(teamLeadRecord!).toHaveTextContent('Evidence · No evidence refs');
    expect(
      within(appRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/review.md'
      })
    ).toHaveTextContent('/evidence/review.md');
    expect(
      within(appRecord!).queryByRole('button', {
        name: 'Jump to shared memory artifact /evidence/missing.md'
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(appRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/review.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(onSelectAgent).not.toHaveBeenCalled();
    expect(onSelectCorrelation).not.toHaveBeenCalled();
    expect(onSelectOperation).not.toHaveBeenCalled();
  });

  it('shows one explicit focused exact-artifact state in shared memory', () => {
    render(
      <DetailsPanel
        {...buildProps({
          focusedSharedMemoryArtifactRef: 'artifact/review-note',
          memoryArtifacts: {
            ...buildMemoryArtifacts(),
            items: [
              ...buildMemoryArtifacts().items,
              {
                artifact_ref: '/evidence/secondary.md',
                artifact_kind: 'evidence_ref',
                file_name: 'secondary.md',
                first_seen_at: '2026-03-16T08:43:00.000Z',
                last_seen_at: '2026-03-16T08:43:00.000Z',
                mention_count: 1,
                agent_ids: ['app-engineering'],
                correlation_ids: ['corr-app-review'],
                source_kinds: ['controller_event'],
                latest_summary: 'Secondary artifact stays unfocused',
                latest_event_type: 'agent_noted',
                collector_last_modified_at: null
              }
            ]
          },
          selectedAgent: null,
          selectedCorrelationId: 'corr-app-review',
          selectedOperation: null,
          workflow: null
        })}
      />
    );

    const sharedMemorySection = screen.getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(sharedMemorySection).not.toBeNull();
    expect(within(sharedMemorySection!).getByText('Focused exact artifact · artifact/review-note')).toBeVisible();
    expect(within(sharedMemorySection!).getByText('Current-scope backlinks')).toBeVisible();
    expect(within(sharedMemorySection!).getByText('No current-scope backlinks cite this artifact.')).toBeVisible();

    const focusedArtifactRecord = within(sharedMemorySection!).getByText('Ref · artifact/review-note').closest('li');
    const unfocusedArtifactRecord = within(sharedMemorySection!).getByText('Ref · /evidence/secondary.md').closest('li');
    expect(focusedArtifactRecord).not.toBeNull();
    expect(unfocusedArtifactRecord).not.toBeNull();
    expect(focusedArtifactRecord).toHaveClass('aitown-record--shared-memory-focused');
    expect(within(focusedArtifactRecord!).getByText('Focused exact jump')).toBeVisible();
    expect(unfocusedArtifactRecord).not.toHaveClass('aitown-record--shared-memory-focused');
    expect(within(unfocusedArtifactRecord!).queryByText('Focused exact jump')).not.toBeInTheDocument();
  });

  it('shows focused exact-artifact backlinks from crew-overview current-scope correlation data without a selected agent', () => {
    const focusedArtifactRef = '/evidence/review.md';

    render(
      <DetailsPanel
        {...buildProps({
          focusedSharedMemoryArtifactRef: focusedArtifactRef,
          selectedAgent: null,
          selectedOperation: null,
          selectedAgentSupervisionHistory: null,
          workflow: null,
          correlation: {
            ...buildCorrelation(),
            evidence_refs: [focusedArtifactRef]
          }
        })}
      />
    );

    const sharedMemorySection = screen.getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(sharedMemorySection).not.toBeNull();

    const backlinkLane = within(sharedMemorySection!).getByText('Current-scope backlinks').closest('div');
    expect(backlinkLane).not.toBeNull();
    expect(within(backlinkLane!).getByText('Active correlation')).toBeVisible();
    expect(within(backlinkLane!).getByText('corr-app-review')).toBeVisible();
    expect(within(backlinkLane!).getByText('Correlation interaction')).toBeVisible();
    expect(within(backlinkLane!).getByText('Reviewed the missing workflow package')).toBeVisible();
    expect(
      within(backlinkLane!).queryByText('No current-scope backlinks cite this artifact.')
    ).not.toBeInTheDocument();
  });

  it('shows focused exact-artifact backlinks from the scoped current records and omits cross-correlation duplicates', () => {
    const focusedArtifactRef = '/evidence/review.md';
    const sharedInteraction: WorkflowInteraction = {
      interaction_id: 'int-1',
      interaction_type: 'peer_watch',
      correlation_id: 'corr-app-review',
      started_at: '2026-03-16T08:45:00.000Z',
      participant_agent_ids: ['app-engineering', 'team-lead'],
      trigger_event_id: 'evt-1',
      severity: 'yellow',
      evidence_refs: [focusedArtifactRef],
      summary: 'Reviewed the missing workflow package'
    };

    render(
      <DetailsPanel
        {...buildProps({
          focusedSharedMemoryArtifactRef: focusedArtifactRef,
          memoryArtifacts: {
            ...buildMemoryArtifacts(),
            items: [
              ...buildMemoryArtifacts().items,
              {
                artifact_ref: focusedArtifactRef,
                artifact_kind: 'evidence_ref',
                file_name: 'review.md',
                first_seen_at: '2026-03-16T08:49:00.000Z',
                last_seen_at: '2026-03-16T08:58:00.000Z',
                mention_count: 3,
                agent_ids: ['app-engineering', 'team-lead'],
                correlation_ids: ['corr-app-review'],
                source_kinds: ['controller_event', 'workflow_event'],
                latest_summary: 'Review evidence anchor',
                latest_event_type: 'workflow_event',
                collector_last_modified_at: '2026-03-16T08:58:00.000Z'
              }
            ]
          },
          selectedAgentSupervisionHistory: {
            items: [
              {
                alert_id: 'alert-history-1',
                ts: '2026-03-16T08:55:00.000Z',
                agent_id: 'app-engineering',
                target_agent_id: 'app-engineering',
                actor_id: 'team-lead',
                observer_agent_id: 'team-lead',
                watcher_agent_ids: ['growth-revenue', 'team-lead'],
                severity: 'orange',
                status: 'resolved',
                current_state: 'blocked',
                active_task: 'Fix workflow issue',
                summary: 'Peer watch recovered after evidence review',
                evidence_refs: [focusedArtifactRef],
                evidence_count: 1,
                correlation_id: 'corr-app-review',
                source_kind: 'controller_event',
                metadata: {
                  resolution: 'review_complete'
                }
              },
              {
                alert_id: 'alert-history-cross-scope',
                ts: '2026-03-16T08:54:00.000Z',
                agent_id: 'app-engineering',
                target_agent_id: 'app-engineering',
                actor_id: 'growth-revenue',
                observer_agent_id: 'team-lead',
                watcher_agent_ids: [],
                severity: 'yellow',
                status: 'open',
                current_state: 'blocked',
                active_task: 'Cross-correlation alert stays hidden',
                summary: 'Cross-correlation supervision note stays hidden',
                evidence_refs: [focusedArtifactRef],
                evidence_count: 1,
                correlation_id: 'corr-app-secondary',
                source_kind: 'controller_event',
                metadata: {}
              }
            ]
          },
          workflow: {
            ...buildWorkflow(),
            detail: {
              ...buildWorkflow().detail,
              recent_interactions: [sharedInteraction],
              recent_events: [
                {
                  event_id: 'evt-cross-scope',
                  ts: '2026-03-16T08:57:00.000Z',
                  agent_id: 'app-engineering',
                  actor_id: 'growth-revenue',
                  agent_role: 'app-engineering',
                  event_type: 'workflow_event',
                  severity: 'yellow',
                  current_state: 'blocked',
                  active_task: 'Cross-correlation workflow note stays hidden',
                  location: 'delivery-desk',
                  summary: 'Cross-correlation workflow note stays hidden',
                  correlation_id: 'corr-app-secondary',
                  counterparty_agent_ids: ['growth-revenue'],
                  evidence_refs: [focusedArtifactRef],
                  source_kind: 'workflow_event',
                  metadata: {}
                }
              ]
            }
          },
          correlation: {
            ...buildCorrelation(),
            evidence_refs: [focusedArtifactRef],
            interactions: [sharedInteraction]
          }
        })}
      />
    );

    const sharedMemorySection = screen.getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(sharedMemorySection).not.toBeNull();

    const backlinkLane = within(sharedMemorySection!).getByText('Current-scope backlinks').closest('div');
    expect(backlinkLane).not.toBeNull();
    expect(within(backlinkLane!).getByText('Current operation')).toBeVisible();
    expect(within(backlinkLane!).getByText('Followed up on missing workflow evidence')).toBeVisible();
    expect(within(backlinkLane!).getByText('Supervision history')).toBeVisible();
    expect(within(backlinkLane!).getByText('Peer watch recovered after evidence review')).toBeVisible();
    expect(within(backlinkLane!).getByText('Workflow interaction')).toBeVisible();
    expect(within(backlinkLane!).getByText('Reviewed the missing workflow package')).toBeVisible();
    expect(within(backlinkLane!).getAllByText('Reviewed the missing workflow package')).toHaveLength(1);
    expect(within(backlinkLane!).getByText('Active correlation')).toBeVisible();
    expect(within(backlinkLane!).getByText('corr-app-review')).toBeVisible();
    expect(within(backlinkLane!).queryByText('Cross-correlation supervision note stays hidden')).not.toBeInTheDocument();
    expect(within(backlinkLane!).queryByText('Cross-correlation workflow note stays hidden')).not.toBeInTheDocument();
    expect(within(backlinkLane!).queryByText('More')).not.toBeInTheDocument();
  });

  it('includes workflow recent incidents in focused exact-artifact backlinks', () => {
    const focusedArtifactRef = '/evidence/review.md';

    render(
      <DetailsPanel
        {...buildProps({
          focusedSharedMemoryArtifactRef: focusedArtifactRef,
          selectedOperation: null,
          correlation: null,
          selectedAgentSupervisionHistory: { items: [] },
          workflow: {
            ...buildWorkflow(),
            detail: {
              ...buildWorkflow().detail,
              recent_events: [],
              recent_interactions: [],
              recent_incidents: [
                {
                  incident_id: 'inc-workflow-1',
                  kind: 'peer_watch',
                  ts: '2026-03-16T08:56:30.000Z',
                  agent_id: 'app-engineering',
                  actor_id: 'team-lead',
                  status: 'open',
                  severity: 'orange',
                  summary: 'Workflow incident cites the exact artifact',
                  correlation_id: 'corr-app-review',
                  evidence_refs: [focusedArtifactRef],
                  counterparty_agent_ids: ['team-lead'],
                  source_kind: 'workflow_event'
                }
              ],
              recent_handoffs: [],
              recent_reboots: []
            }
          }
        })}
      />
    );

    const sharedMemorySection = screen.getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(sharedMemorySection).not.toBeNull();

    const backlinkLane = within(sharedMemorySection!).getByText('Current-scope backlinks').closest('div');
    expect(backlinkLane).not.toBeNull();
    expect(within(backlinkLane!).getByText('Workflow incident')).toBeVisible();
    expect(within(backlinkLane!).getByText('Workflow incident cites the exact artifact')).toBeVisible();
    expect(
      within(backlinkLane!).queryByText('No current-scope backlinks cite this artifact.')
    ).not.toBeInTheDocument();
  });

  it('surfaces focused exact-artifact backlinks beyond the first two already-loaded workflow records', () => {
    const focusedArtifactRef = '/evidence/review.md';
    const workflow = buildWorkflow();
    const workflowEventTemplate = workflow.detail.recent_events[0];
    const workflowInteractionTemplate = buildCorrelation().interactions[0];

    render(
      <DetailsPanel
        {...buildProps({
          focusedSharedMemoryArtifactRef: focusedArtifactRef,
          selectedOperation: null,
          correlation: null,
          selectedAgentSupervisionHistory: { items: [] },
          workflow: {
            ...workflow,
            detail: {
              ...workflow.detail,
              recent_incidents: [],
              recent_interactions: [
                {
                  ...workflowInteractionTemplate,
                  interaction_id: 'int-ignore-1',
                  trigger_event_id: 'evt-ignore-1',
                  evidence_refs: ['/evidence/other-interaction-1.md'],
                  summary: 'Ignore interaction one'
                },
                {
                  ...workflowInteractionTemplate,
                  interaction_id: 'int-ignore-2',
                  trigger_event_id: 'evt-ignore-2',
                  evidence_refs: ['/evidence/other-interaction-2.md'],
                  summary: 'Ignore interaction two'
                },
                {
                  ...workflowInteractionTemplate,
                  interaction_id: 'int-match',
                  trigger_event_id: 'evt-match',
                  evidence_refs: [focusedArtifactRef],
                  summary: 'Late workflow interaction match'
                }
              ],
              recent_events: [
                {
                  ...workflowEventTemplate,
                  event_id: 'evt-ignore-1',
                  evidence_refs: ['/evidence/other-event-1.md'],
                  summary: 'Ignore event one'
                },
                {
                  ...workflowEventTemplate,
                  event_id: 'evt-ignore-2',
                  evidence_refs: ['/evidence/other-event-2.md'],
                  summary: 'Ignore event two'
                },
                {
                  ...workflowEventTemplate,
                  event_id: 'evt-match',
                  evidence_refs: [focusedArtifactRef],
                  summary: 'Late workflow event match'
                }
              ],
              recent_handoffs: [
                {
                  handoff_id: 'handoff-ignore-1',
                  ts: '2026-03-16T08:53:00.000Z',
                  agent_id: 'app-engineering',
                  actor_id: 'team-lead',
                  phase: 'blocked',
                  status: 'pending',
                  severity: 'yellow',
                  summary: 'Ignore handoff one',
                  counterparty_agent_ids: ['team-lead'],
                  evidence_refs: ['/evidence/other-handoff-1.md'],
                  correlation_id: 'corr-app-review',
                  source_kind: 'handoff_log'
                },
                {
                  handoff_id: 'handoff-ignore-2',
                  ts: '2026-03-16T08:54:00.000Z',
                  agent_id: 'app-engineering',
                  actor_id: 'team-lead',
                  phase: 'blocked',
                  status: 'pending',
                  severity: 'yellow',
                  summary: 'Ignore handoff two',
                  counterparty_agent_ids: ['team-lead'],
                  evidence_refs: ['/evidence/other-handoff-2.md'],
                  correlation_id: 'corr-app-review',
                  source_kind: 'handoff_log'
                },
                {
                  handoff_id: 'handoff-match',
                  ts: '2026-03-16T08:55:00.000Z',
                  agent_id: 'app-engineering',
                  actor_id: 'team-lead',
                  phase: 'blocked',
                  status: 'pending',
                  severity: 'orange',
                  summary: 'Late workflow handoff match',
                  counterparty_agent_ids: ['team-lead'],
                  evidence_refs: [focusedArtifactRef],
                  correlation_id: 'corr-app-review',
                  source_kind: 'handoff_log'
                }
              ],
              recent_reboots: [
                {
                  reboot_id: 'reboot-ignore-1',
                  ts: '2026-03-16T08:56:00.000Z',
                  agent_id: 'app-engineering',
                  actor_id: 'controller',
                  phase: 'blocked',
                  status: 'recommended',
                  severity: 'yellow',
                  summary: 'Ignore reboot one',
                  counterparty_agent_ids: [],
                  evidence_refs: ['/evidence/other-reboot-1.md'],
                  correlation_id: 'corr-app-review',
                  source_kind: 'controller_event'
                },
                {
                  reboot_id: 'reboot-ignore-2',
                  ts: '2026-03-16T08:57:00.000Z',
                  agent_id: 'app-engineering',
                  actor_id: 'controller',
                  phase: 'blocked',
                  status: 'recommended',
                  severity: 'yellow',
                  summary: 'Ignore reboot two',
                  counterparty_agent_ids: [],
                  evidence_refs: ['/evidence/other-reboot-2.md'],
                  correlation_id: 'corr-app-review',
                  source_kind: 'controller_event'
                },
                {
                  reboot_id: 'reboot-match',
                  ts: '2026-03-16T08:58:00.000Z',
                  agent_id: 'app-engineering',
                  actor_id: 'controller',
                  phase: 'blocked',
                  status: 'recommended',
                  severity: 'orange',
                  summary: 'Late workflow reboot match',
                  counterparty_agent_ids: [],
                  evidence_refs: [focusedArtifactRef],
                  correlation_id: 'corr-app-review',
                  source_kind: 'controller_event'
                }
              ]
            }
          }
        })}
      />
    );

    const sharedMemorySection = screen.getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(sharedMemorySection).not.toBeNull();

    const backlinkLane = within(sharedMemorySection!).getByText('Current-scope backlinks').closest('div');
    expect(backlinkLane).not.toBeNull();
    expect(within(backlinkLane!).getByText('Workflow interaction')).toBeVisible();
    expect(within(backlinkLane!).getByText('Late workflow interaction match')).toBeVisible();
    expect(within(backlinkLane!).getByText('Workflow event')).toBeVisible();
    expect(within(backlinkLane!).getByText('Late workflow event match')).toBeVisible();
    expect(within(backlinkLane!).getByText('Workflow handoff')).toBeVisible();
    expect(within(backlinkLane!).getByText('Late workflow handoff match')).toBeVisible();
    expect(within(backlinkLane!).getByText('Workflow reboot')).toBeVisible();
    expect(within(backlinkLane!).getByText('Late workflow reboot match')).toBeVisible();
    expect(within(backlinkLane!).queryByText('More')).not.toBeInTheDocument();
  });

  it('keeps the selected active-queue state option visible when its count drops to zero', () => {
    render(
      <DetailsPanel
        {...buildProps({
          operations: {
            ...buildOperations(),
            summary: {
              ...buildOperations().summary,
              item_count: 0,
              blocked_count: 0,
              reboot_recommended_count: 0,
              state_buckets: {}
            },
            items: []
          },
          operationsStateBuckets: {
            waiting: 1
          },
          selectedAgent: null,
          selectedCorrelationId: null,
          selectedOperationsState: 'blocked',
          selectedOperation: null,
          workflow: null
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Active Queue' }).closest('section');
    expect(section).not.toBeNull();

    const stateFilter = within(section!).getByRole('combobox', {
      name: 'Filter active queue by state'
    });

    expect(within(stateFilter).getByRole('option', { name: 'Blocked (0)' })).toBeVisible();
    expect(stateFilter).toHaveValue('blocked');
  });

  it('falls back to the current active-queue summary when separate bucket data is unavailable', () => {
    render(
      <DetailsPanel
        {...buildProps({
          operationsStateBuckets: {},
          operationsStateBucketsState: 'loading',
          selectedAgent: null,
          selectedCorrelationId: null,
          selectedOperation: null,
          workflow: null
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Active Queue' }).closest('section');
    expect(section).not.toBeNull();

    const stateFilter = within(section!).getByRole('combobox', {
      name: 'Filter active queue by state'
    });

    expect(within(stateFilter).getByRole('option', { name: 'All states (1)' })).toBeVisible();
    expect(within(stateFilter).getByRole('option', { name: 'Blocked (1)' })).toBeVisible();
  });

  it('treats a loaded empty state-bucket snapshot as authoritative instead of falling back to the visible queue summary', () => {
    render(
      <DetailsPanel
        {...buildProps({
          operationsStateBuckets: {},
          operationsStateBucketsState: 'ready',
          selectedAgent: null,
          selectedCorrelationId: null,
          selectedOperation: null,
          workflow: null
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Active Queue' }).closest('section');
    expect(section).not.toBeNull();

    const stateFilter = within(section!).getByRole('combobox', {
      name: 'Filter active queue by state'
    });

    expect(within(stateFilter).getByRole('option', { name: 'All states (0)' })).toBeVisible();
    expect(within(stateFilter).queryByRole('option', { name: 'Blocked (1)' })).not.toBeInTheDocument();
  });

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

  it('renders selected-agent workflow interaction correlation pivots only for populated ids and uses interaction-local accessible names', async () => {
    const user = userEvent.setup();
    const onSelectCorrelation = vi.fn();
    const workflow: AgentWorkflow = {
      ...buildWorkflow(),
      detail: {
        ...buildWorkflow().detail,
        recent_interactions: [
          {
            interaction_id: 'interaction-workflow-correlation',
            interaction_type: 'peer_watch',
            correlation_id: 'corr-app-secondary',
            started_at: '2026-03-16T08:49:00.000Z',
            ended_at: '2026-03-16T08:58:00.000Z',
            participant_agent_ids: ['app-engineering', 'team-lead'],
            trigger_event_id: 'evt-workflow-correlation',
            before_state: 'coding',
            after_state: 'blocked',
            severity: 'orange',
            evidence_refs: [],
            summary: 'Workflow interaction correlation becomes a pivot',
            related_event_ids: ['evt-workflow-correlation']
          },
          {
            interaction_id: 'interaction-workflow-empty-correlation',
            interaction_type: 'peer_watch',
            correlation_id: '',
            started_at: '2026-03-16T08:59:00.000Z',
            ended_at: null,
            participant_agent_ids: ['app-engineering'],
            trigger_event_id: 'evt-workflow-empty-correlation',
            before_state: null,
            after_state: 'blocked',
            severity: 'yellow',
            evidence_refs: [],
            summary: 'Workflow interaction without a correlation id stays plain text',
            related_event_ids: ['evt-workflow-empty-correlation']
          }
        ]
      }
    };

    render(<DetailsPanel {...buildProps({ onSelectCorrelation, workflow })} />);

    const workflowSection = screen.getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(workflowSection).not.toBeNull();

    const pivotRecord = within(workflowSection!)
      .getByText('Workflow interaction correlation becomes a pivot')
      .closest('li');
    const plainTextRecord = within(workflowSection!)
      .getByText('Workflow interaction without a correlation id stays plain text')
      .closest('li');
    expect(pivotRecord).not.toBeNull();
    expect(plainTextRecord).not.toBeNull();

    const interactionCorrelationButton = within(pivotRecord!).getByRole('button', {
      name: 'Open workflow interaction correlation from interaction interaction-workflow-correlation corr-app-secondary'
    });
    expect(interactionCorrelationButton).toHaveTextContent('corr-app-secondary');
    expect(plainTextRecord).toHaveTextContent('Correlation · No correlation id');
    expect(
      within(plainTextRecord!).queryByRole('button', {
        name: /Open workflow interaction correlation from interaction/
      })
    ).not.toBeInTheDocument();

    await user.click(interactionCorrelationButton);

    expect(onSelectCorrelation).toHaveBeenCalledWith('corr-app-secondary');
  });

  it('renders selected-agent workflow interaction participant pivots with workflow-local accessible names and preserves the active selected correlation', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const workflow: AgentWorkflow = {
      ...buildWorkflow(),
      detail: {
        ...buildWorkflow().detail,
        recent_interactions: [
          {
            interaction_id: 'interaction-workflow-participants',
            interaction_type: 'peer_watch',
            correlation_id: 'corr-app-review',
            started_at: '2026-03-16T08:49:00.000Z',
            ended_at: '2026-03-16T08:58:00.000Z',
            participant_agent_ids: ['app-engineering', 'team-lead', 'ghost-agent'],
            trigger_event_id: 'evt-workflow-participants',
            before_state: 'coding',
            after_state: 'blocked',
            severity: 'orange',
            evidence_refs: [],
            summary: 'Workflow interaction participant pivot preserves the selected correlation',
            related_event_ids: ['evt-workflow-participants']
          }
        ]
      }
    };

    render(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          selectedCorrelationId: 'corr-app-secondary',
          workflow
        })}
      />
    );

    const workflowSection = screen.getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(workflowSection).not.toBeNull();

    const interactionRecord = within(workflowSection!)
      .getByText('Workflow interaction participant pivot preserves the selected correlation')
      .closest('li');
    expect(interactionRecord).not.toBeNull();
    expect(interactionRecord).toHaveTextContent(
      /Participants · app-engineering\s*,\s*team-lead\s*,\s*ghost-agent/
    );
    expect(
      within(interactionRecord!).queryByRole('button', {
        name: 'Select workflow interaction participant from interaction interaction-workflow-participants app-engineering'
      })
    ).not.toBeInTheDocument();
    expect(
      within(interactionRecord!).queryByRole('button', {
        name: 'Select workflow interaction participant from interaction interaction-workflow-participants ghost-agent'
      })
    ).not.toBeInTheDocument();
    expect(
      within(interactionRecord!).queryByRole('button', {
        name: 'Select correlation interaction participant agent team-lead'
      })
    ).not.toBeInTheDocument();

    const participantPivot = within(interactionRecord!).getByRole('button', {
      name: 'Select workflow interaction participant from interaction interaction-workflow-participants team-lead'
    });
    expect(participantPivot).toBeVisible();

    await user.click(participantPivot);

    expect(onSelectAgent).toHaveBeenCalledWith('team-lead', 'corr-app-secondary');
  });

  it('falls back to the workflow interaction correlation when no selected correlation is active', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const workflow: AgentWorkflow = {
      ...buildWorkflow(),
      detail: {
        ...buildWorkflow().detail,
        recent_interactions: [
          {
            interaction_id: 'interaction-workflow-participants',
            interaction_type: 'peer_watch',
            correlation_id: 'corr-app-review',
            started_at: '2026-03-16T08:49:00.000Z',
            ended_at: '2026-03-16T08:58:00.000Z',
            participant_agent_ids: ['app-engineering', 'team-lead', 'ghost-agent'],
            trigger_event_id: 'evt-workflow-participants',
            before_state: 'coding',
            after_state: 'blocked',
            severity: 'orange',
            evidence_refs: [],
            summary: 'Workflow interaction participant pivot falls back to its own correlation',
            related_event_ids: ['evt-workflow-participants']
          }
        ]
      }
    };

    render(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          selectedCorrelationId: null,
          workflow
        })}
      />
    );

    const workflowSection = screen.getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(workflowSection).not.toBeNull();

    const interactionRecord = within(workflowSection!)
      .getByText('Workflow interaction participant pivot falls back to its own correlation')
      .closest('li');
    expect(interactionRecord).not.toBeNull();
    expect(interactionRecord).toHaveTextContent(
      /Participants · app-engineering\s*,\s*team-lead\s*,\s*ghost-agent/
    );
    expect(
      within(interactionRecord!).queryByRole('button', {
        name: 'Select workflow interaction participant from interaction interaction-workflow-participants app-engineering'
      })
    ).not.toBeInTheDocument();
    expect(
      within(interactionRecord!).queryByRole('button', {
        name: 'Select workflow interaction participant from interaction interaction-workflow-participants ghost-agent'
      })
    ).not.toBeInTheDocument();
    expect(
      within(interactionRecord!).queryByRole('button', {
        name: 'Select correlation interaction participant agent team-lead'
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(interactionRecord!).getByRole('button', {
        name: 'Select workflow interaction participant from interaction interaction-workflow-participants team-lead'
      })
    );

    expect(onSelectAgent).toHaveBeenCalledWith('team-lead', 'corr-app-review');
  });

  it('renders selected-agent workflow recent-event actor and counterparty pivots with workflow-local accessible names and preserves the active correlation', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const workflow: AgentWorkflow = {
      ...buildWorkflow(),
      detail: {
        ...buildWorkflow().detail,
        recent_events: [
          {
            ...buildWorkflow().detail.recent_events[0],
            event_id: 'evt-workflow-recent',
            actor_id: 'team-lead',
            summary: 'Workflow recent event pivots keep the active correlation',
            counterparty_agent_ids: ['app-engineering', 'growth-revenue', 'ghost-agent']
          }
        ]
      }
    };

    render(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          selectedCorrelationId: 'corr-app-secondary',
          workflow
        })}
      />
    );

    const workflowSection = screen.getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(workflowSection).not.toBeNull();

    const eventRecord = within(workflowSection!)
      .getByText('Workflow recent event pivots keep the active correlation')
      .closest('li');
    expect(eventRecord).not.toBeNull();

    const actorPivot = within(eventRecord!).getByRole('button', {
      name: 'Select workflow recent event actor from event evt-workflow-recent team-lead'
    });
    const counterpartyPivot = within(eventRecord!).getByRole('button', {
      name: 'Select workflow recent event counterparty from event evt-workflow-recent growth-revenue'
    });
    expect(actorPivot).toBeVisible();
    expect(counterpartyPivot).toBeVisible();
    expect(eventRecord).toHaveTextContent('Counterparties · app-engineering, growth-revenue, ghost-agent');
    expect(
      within(eventRecord!).queryByRole('button', {
        name: 'Select workflow recent event counterparty from event evt-workflow-recent app-engineering'
      })
    ).not.toBeInTheDocument();
    expect(
      within(eventRecord!).queryByRole('button', {
        name: 'Select workflow recent event counterparty from event evt-workflow-recent ghost-agent'
      })
    ).not.toBeInTheDocument();

    await user.click(actorPivot);
    await user.click(counterpartyPivot);

    expect(onSelectAgent).toHaveBeenNthCalledWith(1, 'team-lead', 'corr-app-secondary');
    expect(onSelectAgent).toHaveBeenNthCalledWith(2, 'growth-revenue', 'corr-app-secondary');
  });

  it('renders selected-agent workflow recent-event subject-agent pivots for navigable rows, keeps unknown subjects as plain text, and preserves the active correlation', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const baseEvent = buildWorkflow().detail.recent_events[0];
    const workflow: AgentWorkflow = {
      ...buildWorkflow(),
      detail: {
        ...buildWorkflow().detail,
        recent_events: [
          {
            ...baseEvent,
            event_id: 'evt-workflow-subject-1',
            agent_id: 'growth-revenue',
            summary: 'Navigable workflow recent-event subject stays actionable'
          },
          {
            ...baseEvent,
            event_id: 'evt-workflow-subject-2',
            agent_id: 'ghost-agent',
            summary: 'Unknown workflow recent-event subject stays plain text'
          }
        ]
      }
    };

    render(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          selectedCorrelationId: 'corr-app-secondary',
          workflow
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(section).not.toBeNull();

    const navigableRecord = within(section!).getByText('Navigable workflow recent-event subject stays actionable').closest('li');
    const unknownRecord = within(section!).getByText('Unknown workflow recent-event subject stays plain text').closest('li');
    expect(navigableRecord).not.toBeNull();
    expect(unknownRecord).not.toBeNull();

    expect(
      within(navigableRecord!).getByRole('button', {
        name: 'Select workflow recent event subject agent from event evt-workflow-subject-1 growth-revenue'
      })
    ).toBeVisible();
    expect(
      within(unknownRecord!).queryByRole('button', {
        name: 'Select workflow recent event subject agent from event evt-workflow-subject-2 ghost-agent'
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(navigableRecord!).getByRole('button', {
        name: 'Select workflow recent event subject agent from event evt-workflow-subject-1 growth-revenue'
      })
    );

    expect(onSelectAgent).toHaveBeenCalledWith('growth-revenue', 'corr-app-secondary');
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

  it('preserves the active correlation when a replay agent pivot is clicked', async () => {
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
                event_id: 'evt-replay-agent-1',
                ts: '2026-03-16T08:59:00.000Z',
                agent_id: 'growth-revenue',
                actor_id: 'team-lead',
                event_type: 'peer_watch_alert_raised',
                severity: 'orange',
                current_state: 'planning',
                location: 'growth-desk',
                summary: 'Replay agent pivot keeps the active correlation',
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

    const section = screen.getByRole('heading', { name: 'Timeline Replay' }).closest('section');
    expect(section).not.toBeNull();

    const record = within(section!).getByText('Replay agent pivot keeps the active correlation').closest('li');
    expect(record).not.toBeNull();

    await user.click(
      within(record!).getByRole('button', {
        name: 'Select replay agent growth-revenue from event evt-replay-agent-1'
      })
    );

    expect(onSelectAgent).toHaveBeenCalledWith('growth-revenue', 'corr-app-secondary');
  });

  it('preserves auto mode when re-selecting the already-active default replay correlation', async () => {
    const user = userEvent.setup();
    const onSelectCorrelation = vi.fn();

    render(
      <DetailsPanel
        {...buildProps({
          onSelectCorrelation,
          selectedAgent: null,
          selectedOperation: null,
          timelineReplay: {
            items: [
              {
                event_id: 'evt-replay-default-correlation-1',
                ts: '2026-03-16T08:59:00.000Z',
                agent_id: 'app-engineering',
                actor_id: 'team-lead',
                event_type: 'peer_watch_alert_raised',
                severity: 'orange',
                current_state: 'blocked',
                location: 'delivery-desk',
                summary: 'Replay correlation re-select keeps auto mode',
                correlation_id: 'corr-app-review',
                counterparty_agent_ids: ['team-lead'],
                evidence_refs: ['/evidence/replay.md'],
                source_kind: 'controller_event'
              }
            ]
          },
          workflow: null
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Timeline Replay' }).closest('section');
    expect(section).not.toBeNull();

    await user.click(
      within(section!).getByRole('button', {
        name: 'Open replay correlation corr-app-review, currently selected'
      })
    );

    expect(onSelectCorrelation).toHaveBeenCalledWith('corr-app-review', {
      preserveAutoOnDefaultReselect: true
    });
  });

  it('renders replay counterparties as pivots only for navigable non-current agents, uses event-specific labels, and preserves the active correlation', async () => {
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
                event_id: 'evt-replay-counterparty-1',
                ts: '2026-03-16T08:59:00.000Z',
                agent_id: 'app-engineering',
                actor_id: 'team-lead',
                event_type: 'peer_watch_alert_raised',
                severity: 'orange',
                current_state: 'blocked',
                location: 'delivery-desk',
                summary: 'Replay counterparties keep the active correlation',
                correlation_id: 'corr-app-review',
                counterparty_agent_ids: ['app-engineering', 'team-lead', 'ghost-agent'],
                evidence_refs: ['/evidence/replay.md'],
                source_kind: 'controller_event'
              },
              {
                event_id: 'evt-replay-counterparty-2',
                ts: '2026-03-16T08:58:00.000Z',
                agent_id: 'growth-revenue',
                actor_id: 'growth-revenue',
                event_type: 'agent_noted',
                severity: 'yellow',
                current_state: 'planning',
                location: 'growth-desk',
                summary: 'Repeated replay counterparty stays uniquely addressable',
                correlation_id: 'corr-app-review',
                counterparty_agent_ids: ['team-lead'],
                evidence_refs: ['/evidence/replay-secondary.md'],
                source_kind: 'workspace_snapshot'
              }
            ]
          }
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Timeline Replay' }).closest('section');
    expect(section).not.toBeNull();

    const firstRecord = within(section!).getByText('Replay counterparties keep the active correlation').closest('li');
    const secondRecord = within(section!)
      .getByText('Repeated replay counterparty stays uniquely addressable')
      .closest('li');
    expect(firstRecord).not.toBeNull();
    expect(secondRecord).not.toBeNull();
    expect(firstRecord).toHaveTextContent('Counterparties · app-engineering, team-lead, ghost-agent');
    expect(secondRecord).toHaveTextContent('Counterparties · team-lead');
    expect(
      within(firstRecord!).queryByRole('button', {
        name: 'Select replay counterparty from event evt-replay-counterparty-1 app-engineering'
      })
    ).not.toBeInTheDocument();
    expect(
      within(firstRecord!).getByRole('button', {
        name: 'Select replay counterparty from event evt-replay-counterparty-1 team-lead'
      })
    ).toBeVisible();
    expect(
      within(firstRecord!).queryByRole('button', {
        name: 'Select replay counterparty from event evt-replay-counterparty-1 ghost-agent'
      })
    ).not.toBeInTheDocument();
    expect(
      within(secondRecord!).getByRole('button', {
        name: 'Select replay counterparty from event evt-replay-counterparty-2 team-lead'
      })
    ).toBeVisible();

    await user.click(
      within(firstRecord!).getByRole('button', {
        name: 'Select replay counterparty from event evt-replay-counterparty-1 team-lead'
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

  it('renders current-operation evidence refs as shared-memory jumps when loaded or eligible for exact fallback', async () => {
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
      within(operationRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/missing.md'
      })
    ).toBeVisible();

    await user.click(
      within(operationRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /evidence/review.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(onSelectAgent).not.toHaveBeenCalled();
    expect(onSelectCorrelation).not.toHaveBeenCalled();
  });

  it('renders a live current-operation actor pivot for navigable non-current actors and preserves the active correlation', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const selectedOperation: OfficeOperation = {
      ...buildSelectedOperation(),
      latest_event: {
        ...buildSelectedOperation().latest_event!,
        event_id: 'evt-current-operation-actor',
        actor_id: 'team-lead',
        summary: 'Current operation actor pivot keeps the clicked correlation'
      }
    };

    const { rerender } = render(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          selectedCorrelationId: 'corr-app-secondary',
          selectedOperation
        })}
      />
    );

    let operationSection = screen.getByRole('heading', { name: 'Current Operation' }).closest('section');
    expect(operationSection).not.toBeNull();
    expect(operationSection).toHaveTextContent('Actor · team-lead');

    let actorPivot = within(operationSection!).getByRole('button', {
      name: 'Select current operation actor from event evt-current-operation-actor team-lead'
    });
    expect(actorPivot).toBeVisible();

    await user.click(actorPivot);

    expect(onSelectAgent).toHaveBeenCalledWith('team-lead', 'corr-app-secondary');

    onSelectAgent.mockClear();
    rerender(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          selectedCorrelationId: null,
          selectedOperation
        })}
      />
    );

    operationSection = screen.getByRole('heading', { name: 'Current Operation' }).closest('section');
    expect(operationSection).not.toBeNull();
    actorPivot = within(operationSection!).getByRole('button', {
      name: 'Select current operation actor from event evt-current-operation-actor team-lead'
    });
    await user.click(actorPivot);

    expect(onSelectAgent).toHaveBeenCalledWith('team-lead', 'corr-app-review');
  });

  it('keeps stale, missing, current, and unknown current-operation actors on the plain-text path', () => {
    const { rerender } = render(
      <DetailsPanel
        {...buildProps({
          operationsError: 'selected operation refresh failed'
        })}
      />
    );

    let operationSection = screen.getByRole('heading', { name: 'Current Operation' }).closest('section');
    expect(operationSection).not.toBeNull();
    expect(operationSection).toHaveTextContent('Actor · team-lead');
    expect(
      within(operationSection!).queryByRole('button', {
        name: 'Select current operation actor from event evt-1 team-lead'
      })
    ).not.toBeInTheDocument();

    rerender(
      <DetailsPanel
        {...buildProps({
          selectedOperation: {
            ...buildSelectedOperation(),
            latest_event: null
          }
        })}
      />
    );

    operationSection = screen.getByRole('heading', { name: 'Current Operation' }).closest('section');
    expect(operationSection).not.toBeNull();
    expect(operationSection).toHaveTextContent('Actor · No actor');
    expect(within(operationSection!).queryByRole('button', { name: /Select current operation actor/ })).not.toBeInTheDocument();

    rerender(
      <DetailsPanel
        {...buildProps({
          selectedOperation: {
            ...buildSelectedOperation(),
            latest_event: {
              ...buildSelectedOperation().latest_event!,
              actor_id: 'app-engineering',
              summary: 'Current-operation self actor stays plain text'
            }
          }
        })}
      />
    );

    operationSection = screen.getByRole('heading', { name: 'Current Operation' }).closest('section');
    expect(operationSection).not.toBeNull();
    expect(operationSection).toHaveTextContent('Actor · app-engineering');
    expect(within(operationSection!).queryByRole('button', { name: /Select current operation actor/ })).not.toBeInTheDocument();

    rerender(
      <DetailsPanel
        {...buildProps({
          selectedOperation: {
            ...buildSelectedOperation(),
            latest_event: {
              ...buildSelectedOperation().latest_event!,
              actor_id: 'ghost-agent',
              summary: 'Current-operation unknown actor stays plain text'
            }
          }
        })}
      />
    );

    operationSection = screen.getByRole('heading', { name: 'Current Operation' }).closest('section');
    expect(operationSection).not.toBeNull();
    expect(operationSection).toHaveTextContent('Actor · ghost-agent');
    expect(within(operationSection!).queryByRole('button', { name: /Select current operation actor/ })).not.toBeInTheDocument();
  });

  it('keeps stale current-operation counterparties on the plain-text path for refresh errors and missing queue entries', () => {
    const { rerender } = render(
      <DetailsPanel
        {...buildProps({
          operationsError: 'selected operation refresh failed'
        })}
      />
    );

    let operationSection = screen.getByRole('heading', { name: 'Current Operation' }).closest('section');
    expect(operationSection).not.toBeNull();
    expect(operationSection!).toHaveTextContent('Counterparties · growth-revenue');
    expect(
      within(operationSection!).queryByRole('button', {
        name: 'Select operation counterparty agent growth-revenue'
      })
    ).not.toBeInTheDocument();

    rerender(
      <DetailsPanel
        {...buildProps({
          operationsState: 'ready',
          operations: buildOperations(),
          selectedOperation: buildSelectedOperation()
        })}
      />
    );

    operationSection = screen.getByRole('heading', { name: 'Current Operation' }).closest('section');
    expect(operationSection).not.toBeNull();
    expect(
      within(operationSection!).getByRole('button', {
        name: 'Select operation counterparty agent growth-revenue'
      })
    ).toBeVisible();

    rerender(
      <DetailsPanel
        {...buildProps({
          operationsState: 'ready',
          operations: {
            ...buildOperations(),
            items: []
          }
        })}
      />
    );

    operationSection = screen.getByRole('heading', { name: 'Current Operation' }).closest('section');
    expect(operationSection).not.toBeNull();
    expect(operationSection!).toHaveTextContent('Counterparties · growth-revenue');
    expect(
      within(operationSection!).queryByRole('button', {
        name: 'Select operation counterparty agent growth-revenue'
      })
    ).not.toBeInTheDocument();
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

  it('falls back to each correlation timeline row correlation for subject-agent pivots and keeps current or unknown subjects as plain text', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const baseTimelineEvent = buildCorrelation().timeline[0];
    const correlation: CorrelationDrilldown = {
      ...buildSecondaryCorrelation(),
      event_count: 3,
      timeline: [
        {
          ...baseTimelineEvent,
          event_id: 'evt-correlation-subject-1',
          agent_id: 'growth-revenue',
          correlation_id: 'corr-app-secondary',
          summary: 'Navigable correlation timeline subject falls back to its row correlation'
        },
        {
          ...baseTimelineEvent,
          event_id: 'evt-correlation-subject-2',
          agent_id: 'app-engineering',
          correlation_id: 'corr-app-secondary',
          summary: 'Current correlation timeline subject stays plain text'
        },
        {
          ...baseTimelineEvent,
          event_id: 'evt-correlation-subject-3',
          agent_id: 'ghost-agent',
          correlation_id: 'corr-app-secondary',
          summary: 'Unknown correlation timeline subject stays plain text'
        }
      ]
    };

    render(<DetailsPanel {...buildProps({ correlation, onSelectAgent, selectedCorrelationId: null })} />);

    const section = screen.getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(section).not.toBeNull();

    const navigableRecord = within(section!)
      .getByText('Navigable correlation timeline subject falls back to its row correlation')
      .closest('li');
    const currentRecord = within(section!).getByText('Current correlation timeline subject stays plain text').closest('li');
    const unknownRecord = within(section!).getByText('Unknown correlation timeline subject stays plain text').closest('li');
    expect(navigableRecord).not.toBeNull();
    expect(currentRecord).not.toBeNull();
    expect(unknownRecord).not.toBeNull();

    expect(
      within(navigableRecord!).getByRole('button', {
        name: 'Select correlation timeline subject agent from event evt-correlation-subject-1 growth-revenue'
      })
    ).toBeVisible();
    expect(
      within(currentRecord!).queryByRole('button', {
        name: 'Select correlation timeline subject agent from event evt-correlation-subject-2 app-engineering'
      })
    ).not.toBeInTheDocument();
    expect(
      within(unknownRecord!).queryByRole('button', {
        name: 'Select correlation timeline subject agent from event evt-correlation-subject-3 ghost-agent'
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(navigableRecord!).getByRole('button', {
        name: 'Select correlation timeline subject agent from event evt-correlation-subject-1 growth-revenue'
      })
    );

    expect(onSelectAgent).toHaveBeenCalledWith('growth-revenue', 'corr-app-secondary');
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

  it('routes accountability artifact jumps through exact shared-memory focus when available without changing selection state', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const onSelectCorrelation = vi.fn();
    const onFocusSharedMemoryArtifact = vi.fn();

    render(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          onSelectCorrelation,
          onFocusSharedMemoryArtifact
        })}
      />
    );

    const auditSection = screen.getByRole('heading', { name: 'Audit Signals' }).closest('section');
    expect(auditSection).not.toBeNull();

    await user.click(
      within(auditSection!).getByRole('button', {
        name: 'Jump to shared memory artifact artifact/review-note'
      })
    );

    expect(onFocusSharedMemoryArtifact).toHaveBeenCalledWith('artifact/review-note');
    expect(onSelectAgent).not.toHaveBeenCalled();
    expect(onSelectCorrelation).not.toHaveBeenCalled();
  });

  it('falls back to DOM-only accountability artifact jumps when exact shared-memory focus is unavailable', async () => {
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

  it('renders crew-overview collector supervision watchers as pivots and carries the active correlation when present, otherwise keeps no-correlation behavior', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();

    const { rerender } = render(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          selectedAgent: null,
          selectedCorrelationId: 'corr-app-secondary',
          selectedOperation: null
        })}
      />
    );

    const collectorSupervisionSection = screen.getByRole('heading', { name: 'Collector Supervision' }).closest('section');
    expect(collectorSupervisionSection).not.toBeNull();

    const watcherLine = within(collectorSupervisionSection!).getByText(
      (_content, element) =>
        element?.tagName === 'SPAN' && element.textContent === 'Watchers · team-lead'
    );

    expect(
      within(watcherLine).getByRole('button', {
        name: 'Select collector supervision watcher from collector app-engineering team-lead'
      })
    ).toBeVisible();

    await user.click(
      within(watcherLine).getByRole('button', {
        name: 'Select collector supervision watcher from collector app-engineering team-lead'
      })
    );

    expect(onSelectAgent).toHaveBeenCalledWith('team-lead', 'corr-app-secondary');

    rerender(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          selectedAgent: null,
          selectedCorrelationId: null,
          selectedOperation: null
        })}
      />
    );

    await user.click(
      within(screen.getByRole('heading', { name: 'Collector Supervision' }).closest('section')!).getByRole('button', {
        name: 'Select collector supervision watcher from collector app-engineering team-lead'
      })
    );

    expect(onSelectAgent).toHaveBeenLastCalledWith('team-lead', null, {
      preserveNullCorrelation: true
    });
  });

  it('renders crew-overview collector supervision watch targets as pivots for navigable non-row agents and preserves the active correlation, otherwise keeps no-correlation behavior', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();

    const { rerender } = render(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          selectedAgent: null,
          selectedCorrelationId: 'corr-app-secondary',
          selectedOperation: null
        })}
      />
    );

    const collectorSupervisionSection = screen.getByRole('heading', { name: 'Collector Supervision' }).closest('section');
    expect(collectorSupervisionSection).not.toBeNull();

    const watchTargetLine = within(collectorSupervisionSection!).getByText(
      (_content, element) =>
        element?.tagName === 'SPAN' && element.textContent === 'Watch target · growth-revenue'
    );

    expect(
      within(watchTargetLine).getByRole('button', {
        name: 'Select collector supervision watch target from collector app-engineering growth-revenue'
      })
    ).toBeVisible();

    await user.click(
      within(watchTargetLine).getByRole('button', {
        name: 'Select collector supervision watch target from collector app-engineering growth-revenue'
      })
    );

    expect(onSelectAgent).toHaveBeenCalledWith('growth-revenue', 'corr-app-secondary');

    rerender(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          selectedAgent: null,
          selectedCorrelationId: null,
          selectedOperation: null
        })}
      />
    );

    await user.click(
      within(screen.getByRole('heading', { name: 'Collector Supervision' }).closest('section')!).getByRole('button', {
        name: 'Select collector supervision watch target from collector app-engineering growth-revenue'
      })
    );

    expect(onSelectAgent).toHaveBeenLastCalledWith('growth-revenue', null);
  });

  it('renders crew-overview collector supervision row agents as pivots, carries the active correlation when present, and otherwise keeps no-correlation behavior', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();

    const { rerender } = render(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          selectedAgent: null,
          selectedCorrelationId: 'corr-app-secondary',
          selectedOperation: null
        })}
      />
    );

    const collectorSupervisionSection = screen.getByRole('heading', { name: 'Collector Supervision' }).closest('section');
    expect(collectorSupervisionSection).not.toBeNull();

    const agentButton = within(collectorSupervisionSection!).getByRole('button', {
      name: 'Select collector supervision agent app-engineering'
    });
    expect(agentButton).toBeVisible();
    expect(agentButton).toHaveTextContent('App Engineering Agent');

    await user.click(agentButton);

    expect(onSelectAgent).toHaveBeenCalledWith('app-engineering', 'corr-app-secondary');

    rerender(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          selectedAgent: null,
          selectedCorrelationId: null,
          selectedOperation: null
        })}
      />
    );

    await user.click(
      within(screen.getByRole('heading', { name: 'Collector Supervision' }).closest('section')!).getByRole('button', {
        name: 'Select collector supervision agent app-engineering'
      })
    );

    expect(onSelectAgent).toHaveBeenLastCalledWith('app-engineering', null);
  });

  it('renders the crew-overview collector snapshot actor as a pivot when navigable and preserves the active correlation, otherwise keeps the no-correlation path unchanged', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const baseCollectorSnapshot = buildCollectorSnapshot();

    const { rerender } = render(
      <DetailsPanel
        {...buildProps({
          collectorSnapshot: {
            ...baseCollectorSnapshot,
            actor_id: 'team-lead'
          },
          onSelectAgent,
          selectedAgent: null,
          selectedCorrelationId: 'corr-app-secondary',
          selectedOperation: null
        })}
      />
    );

    const collectorSupervisionSection = screen.getByRole('heading', { name: 'Collector Supervision' }).closest('section');
    expect(collectorSupervisionSection).not.toBeNull();

    const actorButton = within(collectorSupervisionSection!).getByRole('button', {
      name: 'Select collector snapshot actor team-lead'
    });
    expect(actorButton).toBeVisible();
    expect(actorButton).toHaveTextContent('team-lead');

    await user.click(actorButton);

    expect(onSelectAgent).toHaveBeenCalledWith('team-lead', 'corr-app-secondary');

    rerender(
      <DetailsPanel
        {...buildProps({
          collectorSnapshot: {
            ...baseCollectorSnapshot,
            actor_id: 'team-lead'
          },
          onSelectAgent,
          selectedAgent: null,
          selectedCorrelationId: null,
          selectedOperation: null
        })}
      />
    );

    await user.click(
      within(screen.getByRole('heading', { name: 'Collector Supervision' }).closest('section')!).getByRole('button', {
        name: 'Select collector snapshot actor team-lead'
      })
    );

    expect(onSelectAgent).toHaveBeenLastCalledWith('team-lead', null);
  });

  it('keeps unknown and empty crew-overview collector supervision watchers as plain text', () => {
    const baseCollectorSnapshot = buildCollectorSnapshot();
    const baseCollectorItem = baseCollectorSnapshot.items[0];

    const { rerender } = render(
      <DetailsPanel
        {...buildProps({
          selectedAgent: null,
          selectedOperation: null,
          collectorSnapshot: {
            ...baseCollectorSnapshot,
            items: [
              {
                ...baseCollectorItem,
                supervision: {
                  ...baseCollectorItem.supervision,
                  watched_by: ['ghost-agent']
                }
              }
            ]
          }
        })}
      />
    );

    const unknownWatcherLine = within(screen.getByRole('heading', { name: 'Collector Supervision' }).closest('section')!).getByText(
      (_content, element) => element?.tagName === 'SPAN' && element.textContent === 'Watchers · ghost-agent'
    );

    expect(
      within(unknownWatcherLine).queryByRole('button', {
        name: 'Select collector supervision watcher ghost-agent'
      })
    ).not.toBeInTheDocument();

    rerender(
      <DetailsPanel
        {...buildProps({
          selectedAgent: null,
          selectedOperation: null,
          collectorSnapshot: {
            ...baseCollectorSnapshot,
            items: [
              {
                ...baseCollectorItem,
                supervision: {
                  ...baseCollectorItem.supervision,
                  watched_by: []
                }
              }
            ]
          }
        })}
      />
    );

    const emptyWatcherLine = within(screen.getByRole('heading', { name: 'Collector Supervision' }).closest('section')!).getByText(
      (_content, element) => element?.tagName === 'SPAN' && element.textContent === 'Watchers · No watchers'
    );

    expect(
      within(emptyWatcherLine).queryByRole('button', {
        name: /Select collector supervision watcher/
      })
    ).not.toBeInTheDocument();
  });

  it('keeps unknown crew-overview collector supervision row agents as plain text', () => {
    const baseCollectorSnapshot = buildCollectorSnapshot();
    const baseCollectorItem = baseCollectorSnapshot.items[0];

    render(
      <DetailsPanel
        {...buildProps({
          selectedAgent: null,
          selectedOperation: null,
          collectorSnapshot: {
            ...baseCollectorSnapshot,
            items: [
              {
                ...baseCollectorItem,
                agent_id: 'ghost-agent',
                heartbeat: {
                  ...baseCollectorItem.heartbeat,
                  agent_id: 'ghost-agent'
                }
              }
            ]
          }
        })}
      />
    );

    const collectorRecord = within(screen.getByRole('heading', { name: 'Collector Supervision' }).closest('section')!).getByText(
      'ghost-agent'
    ).closest('li');
    expect(collectorRecord).not.toBeNull();

    expect(
      within(collectorRecord!).queryByRole('button', {
        name: 'Select collector supervision agent ghost-agent'
      })
    ).not.toBeInTheDocument();
  });

  it('keeps unknown crew-overview collector snapshot actors as plain text', () => {
    const baseCollectorSnapshot = buildCollectorSnapshot();

    const { rerender } = render(
      <DetailsPanel
        {...buildProps({
          selectedAgent: null,
          selectedOperation: null,
          collectorSnapshot: {
            ...baseCollectorSnapshot,
            actor_id: 'ghost-agent'
          }
        })}
      />
    );

    const collectorSummaryRecord = within(
      screen.getByRole('heading', { name: 'Collector Supervision' }).closest('section')!
    )
      .getByText('ghost-agent')
      .closest('li');
    expect(collectorSummaryRecord).not.toBeNull();
    expect(
      within(collectorSummaryRecord!).queryByRole('button', {
        name: 'Select collector snapshot actor ghost-agent'
      })
    ).not.toBeInTheDocument();

    rerender(
      <DetailsPanel
        {...buildProps({
          selectedAgent: null,
          selectedOperation: null,
          collectorSnapshot: {
            ...baseCollectorSnapshot,
            actor_id: 'collector-watch'
          }
        })}
      />
    );

    expect(
      within(screen.getByRole('heading', { name: 'Collector Supervision' }).closest('section')!).queryByRole('button', {
        name: 'Select collector snapshot actor collector-watch'
      })
    ).not.toBeInTheDocument();
  });

  it('keeps row-current, unknown, and empty crew-overview collector supervision watch targets as plain text', () => {
    const baseCollectorSnapshot = buildCollectorSnapshot();
    const baseCollectorItem = baseCollectorSnapshot.items[0];

    const { rerender } = render(
      <DetailsPanel
        {...buildProps({
          selectedAgent: null,
          selectedOperation: null,
          collectorSnapshot: {
            ...baseCollectorSnapshot,
            items: [
              {
                ...baseCollectorItem,
                supervision: {
                  ...baseCollectorItem.supervision,
                  watch_target: 'app-engineering'
                }
              }
            ]
          }
        })}
      />
    );

    const rowCurrentWatchTargetLine = within(
      screen.getByRole('heading', { name: 'Collector Supervision' }).closest('section')!
    ).getByText((_content, element) => element?.tagName === 'SPAN' && element.textContent === 'Watch target · app-engineering');

    expect(
      within(rowCurrentWatchTargetLine).queryByRole('button', {
        name: 'Select collector supervision watch target from collector app-engineering app-engineering'
      })
    ).not.toBeInTheDocument();

    rerender(
      <DetailsPanel
        {...buildProps({
          selectedAgent: null,
          selectedOperation: null,
          collectorSnapshot: {
            ...baseCollectorSnapshot,
            items: [
              {
                ...baseCollectorItem,
                supervision: {
                  ...baseCollectorItem.supervision,
                  watch_target: 'ghost-agent'
                }
              }
            ]
          }
        })}
      />
    );

    const unknownWatchTargetLine = within(
      screen.getByRole('heading', { name: 'Collector Supervision' }).closest('section')!
    ).getByText((_content, element) => element?.tagName === 'SPAN' && element.textContent === 'Watch target · ghost-agent');

    expect(
      within(unknownWatchTargetLine).queryByRole('button', {
        name: 'Select collector supervision watch target from collector app-engineering ghost-agent'
      })
    ).not.toBeInTheDocument();

    rerender(
      <DetailsPanel
        {...buildProps({
          selectedAgent: null,
          selectedOperation: null,
          collectorSnapshot: {
            ...baseCollectorSnapshot,
            items: [
              {
                ...baseCollectorItem,
                supervision: {
                  ...baseCollectorItem.supervision,
                  watch_target: null
                }
              }
            ]
          }
        })}
      />
    );

    const missingWatchTargetLine = within(
      screen.getByRole('heading', { name: 'Collector Supervision' }).closest('section')!
    ).getByText(
      (_content, element) => element?.tagName === 'SPAN' && element.textContent === 'Watch target · No watch target'
    );

    expect(
      within(missingWatchTargetLine).queryByRole('button', {
        name: /Select collector supervision watch target/
      })
    ).not.toBeInTheDocument();
  });

  it('renders a full-match watch-graph alignment status for crew-overview collector supervision rows', () => {
    render(
      <DetailsPanel
        {...buildProps({
          selectedAgent: null,
          selectedCorrelationId: null,
          selectedOperation: null,
          workflow: null
        })}
      />
    );

    const collectorSupervisionSection = screen.getByRole('heading', { name: 'Collector Supervision' }).closest('section');
    expect(collectorSupervisionSection).not.toBeNull();

    const collectorRecord = within(collectorSupervisionSection!).getByText('App Engineering Agent').closest('li');
    expect(collectorRecord).not.toBeNull();
    expect(collectorRecord!).toHaveTextContent('Watch graph alignment · Full match');
  });

  it('renders a target-mismatch watch-graph alignment status when the live watch target differs', () => {
    const world: WorldState = {
      ...buildWorld(),
      watch_edges: [
        {
          from_agent_id: 'team-lead',
          to_agent_id: 'app-engineering',
          watch_mode: 'lead',
          risk_level: 'yellow'
        },
        {
          from_agent_id: 'app-engineering',
          to_agent_id: 'team-lead',
          watch_mode: 'peer',
          risk_level: 'yellow'
        }
      ]
    };

    render(<DetailsPanel {...buildProps({ world })} />);

    const collectorObservationSection = screen.getByRole('heading', { name: 'Collector Observation' }).closest('section');
    expect(collectorObservationSection).not.toBeNull();
    expect(within(collectorObservationSection!).getByText('Watch graph alignment · Target mismatch')).toBeVisible();
  });

  it('renders a watcher-mismatch watch-graph alignment status when live watchers differ', () => {
    const world: WorldState = {
      ...buildWorld(),
      watch_edges: [
        {
          from_agent_id: 'app-engineering',
          to_agent_id: 'growth-revenue',
          watch_mode: 'peer',
          risk_level: 'red'
        }
      ]
    };

    render(
      <DetailsPanel
        {...buildProps({
          selectedAgent: null,
          selectedCorrelationId: null,
          selectedOperation: null,
          workflow: null,
          world
        })}
      />
    );

    const collectorSupervisionSection = screen.getByRole('heading', { name: 'Collector Supervision' }).closest('section');
    expect(collectorSupervisionSection).not.toBeNull();

    const collectorRecord = within(collectorSupervisionSection!).getByText('App Engineering Agent').closest('li');
    expect(collectorRecord).not.toBeNull();
    expect(collectorRecord!).toHaveTextContent('Watch graph alignment · Watcher mismatch');
  });

  it('renders crew-overview office-grid home agents as pivots when navigable, preserves the active correlation, and keeps unassigned or unknown homes as plain text', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const world = buildWorld();
    const officeGridWorld: WorldState = {
      ...world,
      zones: [
        ...world.zones,
        {
          zone_id: 'unassigned-desk',
          label: 'Unassigned Desk',
          kind: 'desk',
          grid_x: 1,
          grid_y: 0,
          grid_w: 1,
          grid_h: 1,
          home_agent_id: null,
          occupant_ids: []
        },
        {
          zone_id: 'ghost-desk',
          label: 'Ghost Desk',
          kind: 'desk',
          grid_x: 2,
          grid_y: 0,
          grid_w: 1,
          grid_h: 1,
          home_agent_id: 'ghost-agent',
          occupant_ids: []
        }
      ]
    };

    const { rerender } = render(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          selectedAgent: null,
          selectedCorrelationId: 'corr-app-review',
          selectedOperation: null,
          world: officeGridWorld
        })}
      />
    );

    const officeGridSection = screen.getByRole('heading', { name: 'Office Grid' }).closest('section');
    expect(officeGridSection).not.toBeNull();

    const homeButton = within(officeGridSection!).getByRole('button', {
      name: 'Select home agent App Engineering Agent in Delivery Desk'
    });
    expect(homeButton).toBeVisible();
    expect(
      within(officeGridSection!).getByRole('button', {
        name: 'Select zone occupant App Engineering Agent in Delivery Desk'
      })
    ).toBeVisible();
    expect(within(officeGridSection!).getByText('Home · Unassigned')).toBeVisible();

    const unknownHomeLine = within(officeGridSection!).getByText(
      (_content, element) => element?.tagName === 'SPAN' && element.textContent === 'Home · ghost-agent'
    );
    expect(
      within(unknownHomeLine).queryByRole('button', {
        name: 'Select home agent ghost-agent in Ghost Desk'
      })
    ).not.toBeInTheDocument();

    await user.click(homeButton);

    expect(onSelectAgent).toHaveBeenCalledWith('app-engineering', 'corr-app-review');

    rerender(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          selectedAgent: null,
          selectedCorrelationId: null,
          selectedOperation: null,
          world: officeGridWorld
        })}
      />
    );

    await user.click(
      within(screen.getByRole('heading', { name: 'Office Grid' }).closest('section')!).getByRole('button', {
        name: 'Select home agent App Engineering Agent in Delivery Desk'
      })
    );

    expect(onSelectAgent).toHaveBeenLastCalledWith('app-engineering', null);
  });

  it('appends runtime-only world zones to the office grid when overview zones are present and uses projected occupants', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const world = buildWorld();
    const officeGridWorld: WorldState = {
      ...world,
      agents: new Map(world.agents).set('team-lead', {
        ...world.agents.get('team-lead')!,
        raw_location: 'lead-desk',
        zone: 'review-zone'
      }),
      zones: [
        ...world.zones,
        {
          zone_id: 'review-zone',
          label: 'Review Zone',
          kind: 'shared',
          grid_x: 0,
          grid_y: 1,
          grid_w: 1,
          grid_h: 1,
          home_agent_id: null,
          occupant_ids: ['team-lead']
        }
      ]
    };
    const overviewZones = officeGridWorld.zones
      .filter((zone) => zone.zone_id !== 'review-zone')
      .map((zone) => ({
        zone_id: zone.zone_id,
        label: zone.label,
        kind: zone.kind,
        grid_x: zone.grid_x,
        grid_y: zone.grid_y,
        grid_w: zone.grid_w,
        grid_h: zone.grid_h,
        home_agent_id: zone.home_agent_id ?? null,
        occupants: []
      }));

    render(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          overviewZones,
          selectedAgent: null,
          selectedCorrelationId: 'corr-app-review',
          selectedOperation: null,
          world: officeGridWorld
        })}
      />
    );

    const officeGridSection = screen.getByRole('heading', { name: 'Office Grid' }).closest('section');
    expect(officeGridSection).not.toBeNull();

    const officeGridLabels = Array.from(within(officeGridSection!).getAllByRole('listitem')).map((node) =>
      node.querySelector('strong')?.textContent
    );
    expect(officeGridLabels).toEqual(['Delivery Desk', 'Review Zone']);

    const reviewOccupantButton = within(officeGridSection!).getByRole('button', {
      name: 'Select zone occupant Team Lead in Review Zone'
    });
    expect(reviewOccupantButton).toBeVisible();
    expect(within(officeGridSection!).getByText('Home · Unassigned')).toBeVisible();
    expect(within(officeGridSection!).getByText('Severity · Yellow · 1 occupant(s)')).toBeVisible();

    await user.click(reviewOccupantButton);

    expect(onSelectAgent).toHaveBeenCalledWith('team-lead', 'corr-app-review');
  });

  it('renders the selected-agent collector observation watch target as a pivot only for navigable non-current targets and preserves the active correlation', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const baseCollectorSnapshot = buildCollectorSnapshot();
    const baseCollectorItem = baseCollectorSnapshot.items[0];

    const { rerender } = render(
      <DetailsPanel {...buildProps({ onSelectAgent, selectedCorrelationId: 'corr-app-review' })} />
    );

    const collectorObservationSection = screen.getByRole('heading', { name: 'Collector Observation' }).closest('section');
    expect(collectorObservationSection).not.toBeNull();

    const navigableWatchTargetLine = within(collectorObservationSection!).getByText(
      (_content, element) => element?.tagName === 'SPAN' && element.textContent === 'Watch target · growth-revenue'
    );
    expect(
      within(navigableWatchTargetLine).getByRole('button', {
        name: 'Select collector observation watch target growth-revenue'
      })
    ).toBeVisible();

    await user.click(
      within(navigableWatchTargetLine).getByRole('button', {
        name: 'Select collector observation watch target growth-revenue'
      })
    );

    expect(onSelectAgent).toHaveBeenCalledWith('growth-revenue', 'corr-app-review');

    rerender(
      <DetailsPanel
        {...buildProps({
          collectorSnapshot: {
            ...baseCollectorSnapshot,
            items: [
              {
                ...baseCollectorItem,
                supervision: {
                  ...baseCollectorItem.supervision,
                  watch_target: 'app-engineering'
                }
              }
            ]
          }
        })}
      />
    );

    const currentWatchTargetLine = within(screen.getByRole('heading', { name: 'Collector Observation' }).closest('section')!).getByText(
      (_content, element) => element?.tagName === 'SPAN' && element.textContent === 'Watch target · app-engineering'
    );
    expect(
      within(currentWatchTargetLine).queryByRole('button', {
        name: 'Select collector observation watch target app-engineering'
      })
    ).not.toBeInTheDocument();

    rerender(
      <DetailsPanel
        {...buildProps({
          collectorSnapshot: {
            ...baseCollectorSnapshot,
            items: [
              {
                ...baseCollectorItem,
                supervision: {
                  ...baseCollectorItem.supervision,
                  watch_target: 'ghost-agent'
                }
              }
            ]
          }
        })}
      />
    );

    const unknownWatchTargetLine = within(screen.getByRole('heading', { name: 'Collector Observation' }).closest('section')!).getByText(
      (_content, element) => element?.tagName === 'SPAN' && element.textContent === 'Watch target · ghost-agent'
    );
    expect(
      within(unknownWatchTargetLine).queryByRole('button', {
        name: 'Select collector observation watch target ghost-agent'
      })
    ).not.toBeInTheDocument();

    rerender(
      <DetailsPanel
        {...buildProps({
          collectorSnapshot: {
            ...baseCollectorSnapshot,
            items: [
              {
                ...baseCollectorItem,
                supervision: {
                  ...baseCollectorItem.supervision,
                  watch_target: null
                }
              }
            ]
          }
        })}
      />
    );

    const missingWatchTargetLine = within(screen.getByRole('heading', { name: 'Collector Observation' }).closest('section')!).getByText(
      (_content, element) => element?.tagName === 'SPAN' && element.textContent === 'Watch target · No watch target'
    );
    expect(
      within(missingWatchTargetLine).queryByRole('button', {
        name: /Select collector observation watch target/
      })
    ).not.toBeInTheDocument();
  });

  it('renders the selected-agent collector observation watched-by row as watcher pivots only for navigable non-current agents and preserves the active correlation', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();

    render(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          selectedCorrelationId: 'corr-app-secondary'
        })}
      />
    );

    const collectorObservationSection = screen.getByRole('heading', { name: 'Collector Observation' }).closest('section');
    expect(collectorObservationSection).not.toBeNull();

    const watchedByLine = within(collectorObservationSection!).getByText(
      (_content, element) => element?.tagName === 'SPAN' && element.textContent === 'Watched by · team-lead'
    );

    expect(
      within(watchedByLine).getByRole('button', {
        name: 'Select collector observation watcher team-lead'
      })
    ).toBeVisible();

    await user.click(
      within(watchedByLine).getByRole('button', {
        name: 'Select collector observation watcher team-lead'
      })
    );

    expect(onSelectAgent).toHaveBeenCalledWith('team-lead', 'corr-app-secondary');
  });

  it('keeps current, unknown, and empty collector observation watchers as plain text', () => {
    const baseCollectorSnapshot = buildCollectorSnapshot();
    const baseCollectorItem = baseCollectorSnapshot.items[0];

    const { rerender } = render(
      <DetailsPanel
        {...buildProps({
          collectorSnapshot: {
            ...baseCollectorSnapshot,
            items: [
              {
                ...baseCollectorItem,
                supervision: {
                  ...baseCollectorItem.supervision,
                  watched_by: ['app-engineering', 'ghost-agent']
                }
              }
            ]
          }
        })}
      />
    );

    const currentAndUnknownLine = within(screen.getByRole('heading', { name: 'Collector Observation' }).closest('section')!).getByText(
      (_content, element) =>
        element?.tagName === 'SPAN' && element.textContent === 'Watched by · app-engineering, ghost-agent'
    );

    expect(
      within(currentAndUnknownLine).queryByRole('button', {
        name: 'Select collector observation watcher app-engineering'
      })
    ).not.toBeInTheDocument();
    expect(
      within(currentAndUnknownLine).queryByRole('button', {
        name: 'Select collector observation watcher ghost-agent'
      })
    ).not.toBeInTheDocument();

    rerender(
      <DetailsPanel
        {...buildProps({
          collectorSnapshot: {
            ...baseCollectorSnapshot,
            items: [
              {
                ...baseCollectorItem,
                supervision: {
                  ...baseCollectorItem.supervision,
                  watched_by: []
                }
              }
            ]
          }
        })}
      />
    );

    const emptyLine = within(screen.getByRole('heading', { name: 'Collector Observation' }).closest('section')!).getByText(
      (_content, element) => element?.tagName === 'SPAN' && element.textContent === 'Watched by · No watchers'
    );

    expect(
      within(emptyLine).queryByRole('button', {
        name: /Select collector observation watcher/
      })
    ).not.toBeInTheDocument();
  });

  it('renders compact collector provenance previews in both collector cards from the latest loaded snapshot data', () => {
    const baseCollectorSnapshot = buildCollectorSnapshot();
    const baseCollectorItem = baseCollectorSnapshot.items[0];
    const collectorSnapshot: CollectorSnapshot = {
      ...baseCollectorSnapshot,
      items: [
        {
          ...baseCollectorItem,
          workspace_observations: [
            {
              path: '/workspace/app-engineering',
              file_name: 'app-engineering',
              kind: 'workspace_root',
              last_modified_at: '2026-03-16T08:59:00.000Z'
            },
            {
              path: '/workspace/app-engineering/docs/notes.md',
              file_name: 'notes.md',
              kind: 'workspace_file',
              last_modified_at: '2026-03-16T08:53:00.000Z'
            },
            {
              path: '/workspace/app-engineering/src/collector-preview.ts',
              file_name: 'collector-preview.ts',
              kind: 'workspace_file',
              last_modified_at: '2026-03-16T08:58:45.000Z'
            }
          ],
          tmux_observations: [
            {
              session_name: 'app-engineering',
              window_index: '1',
              pane_index: '0',
              pane_id: '%10',
              pane_title: 'editor',
              pane_current_command: 'vim',
              pane_active: false,
              pane_dead: false,
              pane_activity_at: '2026-03-16T08:54:00.000Z'
            },
            {
              session_name: 'app-engineering',
              window_index: '2',
              pane_index: '1',
              pane_id: '%11',
              pane_title: 'tests',
              pane_current_command: 'pnpm test',
              pane_active: true,
              pane_dead: false,
              pane_activity_at: '2026-03-16T08:58:30.000Z'
            }
          ]
        }
      ]
    };

    const { unmount } = render(
      <DetailsPanel
        {...buildProps({
          collectorSnapshot,
          selectedAgent: null,
          selectedCorrelationId: null,
          selectedOperation: null,
          workflow: null,
          correlation: null
        })}
      />
    );

    const collectorSupervisionSection = screen.getByRole('heading', { name: 'Collector Supervision' }).closest('section');
    expect(collectorSupervisionSection).not.toBeNull();
    expect(within(collectorSupervisionSection!).getByText('Confidence · High')).toBeVisible();
    expect(
      within(collectorSupervisionSection!).getByText('Last output · 2026-03-16T08:58:00.000Z')
    ).toBeVisible();
    expect(
      within(collectorSupervisionSection!).getByText('Last file write · 2026-03-16T08:57:00.000Z')
    ).toBeVisible();
    expect(collectorSupervisionSection).toHaveTextContent(
      'Workspace preview · collector-preview.ts · 2026-03-16T08:58:45.000Z'
    );
    expect(collectorSupervisionSection).toHaveTextContent('Tmux preview · pnpm test · 2026-03-16T08:58:30.000Z');

    unmount();

    render(
      <DetailsPanel
        {...buildProps({
          collectorSnapshot
        })}
      />
    );

    const collectorObservationSection = screen.getByRole('heading', { name: 'Collector Observation' }).closest('section');
    expect(collectorObservationSection).not.toBeNull();
    expect(within(collectorObservationSection!).getByText('Confidence · High')).toBeVisible();
    expect(
      within(collectorObservationSection!).getByText('Last output · 2026-03-16T08:58:00.000Z')
    ).toBeVisible();
    expect(
      within(collectorObservationSection!).getByText('Last file write · 2026-03-16T08:57:00.000Z')
    ).toBeVisible();
    expect(collectorObservationSection).toHaveTextContent(
      'Workspace preview · collector-preview.ts · 2026-03-16T08:58:45.000Z'
    );
    expect(collectorObservationSection).toHaveTextContent('Tmux preview · pnpm test · 2026-03-16T08:58:30.000Z');
  });

  it('renders explicit none fallbacks in collector provenance previews when freshness evidence is missing', () => {
    const baseCollectorSnapshot = buildCollectorSnapshot();
    const baseCollectorItem = baseCollectorSnapshot.items[0];
    const collectorSnapshot: CollectorSnapshot = {
      ...baseCollectorSnapshot,
      items: [
        {
          ...baseCollectorItem,
          workspace_observations: [
            {
              path: '/workspace/app-engineering',
              file_name: 'app-engineering',
              kind: 'workspace_root',
              last_modified_at: '2026-03-16T08:59:00.000Z'
            }
          ],
          tmux_observations: [
            {
              session_name: 'app-engineering',
              window_index: '2',
              pane_index: '1',
              pane_id: '%11',
              pane_title: 'tests',
              pane_current_command: 'pnpm test',
              pane_active: true,
              pane_dead: false,
              pane_activity_at: null
            }
          ],
          heartbeat: {
            ...baseCollectorItem.heartbeat,
            last_meaningful_output_at: null,
            last_file_write_at: null
          }
        }
      ]
    };

    const { unmount } = render(
      <DetailsPanel
        {...buildProps({
          collectorSnapshot,
          selectedAgent: null,
          selectedCorrelationId: null,
          selectedOperation: null,
          workflow: null,
          correlation: null
        })}
      />
    );

    const collectorSupervisionSection = screen.getByRole('heading', { name: 'Collector Supervision' }).closest('section');
    expect(collectorSupervisionSection).not.toBeNull();
    expect(within(collectorSupervisionSection!).getByText('Last output · None')).toBeVisible();
    expect(within(collectorSupervisionSection!).getByText('Last file write · None')).toBeVisible();
    expect(within(collectorSupervisionSection!).getByText('Workspace preview · None')).toBeVisible();
    expect(within(collectorSupervisionSection!).getByText('Tmux preview · None')).toBeVisible();

    unmount();

    render(
      <DetailsPanel
        {...buildProps({
          collectorSnapshot
        })}
      />
    );

    const collectorObservationSection = screen.getByRole('heading', { name: 'Collector Observation' }).closest('section');
    expect(collectorObservationSection).not.toBeNull();
    expect(within(collectorObservationSection!).getByText('Last output · None')).toBeVisible();
    expect(within(collectorObservationSection!).getByText('Last file write · None')).toBeVisible();
    expect(within(collectorObservationSection!).getByText('Workspace preview · None')).toBeVisible();
    expect(within(collectorObservationSection!).getByText('Tmux preview · None')).toBeVisible();
  });

  it('renders matching collector workspace previews as shared-memory jumps while keeping non-matching previews as plain text', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const onSelectCorrelation = vi.fn();
    const baseCollectorSnapshot = buildCollectorSnapshot();
    const baseCollectorItem = baseCollectorSnapshot.items[0];
    const collectorSnapshot: CollectorSnapshot = {
      ...baseCollectorSnapshot,
      items: [
        {
          ...baseCollectorItem,
          workspace_observations: [
            {
              path: '/workspace/app-engineering/src/non-matching.ts',
              file_name: 'non-matching.ts',
              kind: 'workspace_file',
              last_modified_at: '2026-03-16T08:53:00.000Z'
            },
            {
              path: '/workspace/app-engineering/src/collector-preview.ts',
              file_name: 'collector-preview.ts',
              kind: 'workspace_file',
              last_modified_at: '2026-03-16T08:58:45.000Z'
            }
          ]
        }
      ]
    };
    const memoryArtifacts: MemoryArtifactIndex = {
      generated_at: '2026-03-16T09:00:00.000Z',
      items: [
        ...buildMemoryArtifacts().items,
        {
          artifact_ref: '/workspace/app-engineering/src/collector-preview.ts',
          artifact_kind: 'workspace_file',
          file_name: 'collector-preview.ts',
          first_seen_at: '2026-03-16T08:54:00.000Z',
          last_seen_at: '2026-03-16T08:58:45.000Z',
          mention_count: 2,
          agent_ids: ['app-engineering'],
          correlation_ids: ['corr-app-review'],
          source_kinds: ['collector_snapshot'],
          latest_summary: 'Collector preview workspace artifact',
          latest_event_type: 'collector_snapshot_written',
          collector_last_modified_at: '2026-03-16T08:58:45.000Z'
        }
      ]
    };

    const { unmount } = render(
      <DetailsPanel
        {...buildProps({
          collectorSnapshot,
          memoryArtifacts,
          selectedAgent: null,
          selectedCorrelationId: null,
          selectedOperation: null,
          workflow: null,
          correlation: null,
          onSelectAgent,
          onSelectCorrelation
        })}
      />
    );

    const collectorSupervisionSection = screen.getByRole('heading', { name: 'Collector Supervision' }).closest('section');
    const sharedMemorySection = screen.getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(collectorSupervisionSection).not.toBeNull();
    expect(sharedMemorySection).not.toBeNull();

    const crewOverviewArtifactRecord = within(sharedMemorySection!).getByText(
      'Ref · /workspace/app-engineering/src/collector-preview.ts'
    ).closest('li');
    expect(crewOverviewArtifactRecord).not.toBeNull();
    expect(
      within(collectorSupervisionSection!).getByRole('button', {
        name: 'Jump to shared memory artifact /workspace/app-engineering/src/collector-preview.ts collector-preview.ts · 2026-03-16T08:58:45.000Z'
      })
    ).toHaveTextContent('collector-preview.ts · 2026-03-16T08:58:45.000Z');
    expect(collectorSupervisionSection).toHaveTextContent(
      'Workspace preview · collector-preview.ts · 2026-03-16T08:58:45.000Z'
    );
    expect(
      within(collectorSupervisionSection!).queryByRole('button', {
        name: 'Jump to shared memory artifact /workspace/app-engineering/src/non-matching.ts'
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(collectorSupervisionSection!).getByRole('button', {
        name: 'Jump to shared memory artifact /workspace/app-engineering/src/collector-preview.ts collector-preview.ts · 2026-03-16T08:58:45.000Z'
      })
    );

    expect(document.activeElement).toBe(crewOverviewArtifactRecord);

    unmount();

    render(
      <DetailsPanel
        {...buildProps({
          collectorSnapshot,
          memoryArtifacts,
          onSelectAgent,
          onSelectCorrelation
        })}
      />
    );

    const collectorObservationSection = screen.getByRole('heading', { name: 'Collector Observation' }).closest('section');
    const selectedArtifactRecord = within(screen.getByRole('heading', { name: 'Shared Memory' }).closest('section')!).getByText(
      'Ref · /workspace/app-engineering/src/collector-preview.ts'
    ).closest('li');
    expect(collectorObservationSection).not.toBeNull();
    expect(selectedArtifactRecord).not.toBeNull();
    expect(
      within(collectorObservationSection!).getByRole('button', {
        name: 'Jump to shared memory artifact /workspace/app-engineering/src/collector-preview.ts collector-preview.ts · 2026-03-16T08:58:45.000Z'
      })
    ).toHaveTextContent('collector-preview.ts · 2026-03-16T08:58:45.000Z');
    expect(collectorObservationSection).toHaveTextContent(
      'Workspace preview · collector-preview.ts · 2026-03-16T08:58:45.000Z'
    );
    expect(
      within(collectorObservationSection!).queryByRole('button', {
        name: 'Jump to shared memory artifact /workspace/app-engineering/src/non-matching.ts'
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(collectorObservationSection!).getByRole('button', {
        name: 'Jump to shared memory artifact /workspace/app-engineering/src/collector-preview.ts collector-preview.ts · 2026-03-16T08:58:45.000Z'
      })
    );

    expect(document.activeElement).toBe(selectedArtifactRecord);
    expect(onSelectAgent).not.toHaveBeenCalled();
    expect(onSelectCorrelation).not.toHaveBeenCalled();
  });

  it('renders matching collector tmux previews as shared-memory jumps in both collector provenance surfaces', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const onSelectCorrelation = vi.fn();
    const tmuxArtifactRef = 'tmux://5-web3-app-engineering/0.1';
    const tmuxPreviewLabel = 'pnpm test · 2026-03-16T08:58:30.000Z';
    const baseCollectorSnapshot = buildCollectorSnapshot();
    const baseCollectorItem = baseCollectorSnapshot.items[0];
    const collectorSnapshot: CollectorSnapshot = {
      ...baseCollectorSnapshot,
      items: [
        {
          ...baseCollectorItem,
          session_ref: '5-web3-app-engineering',
          tmux_observations: [
            {
              session_name: '5-web3-app-engineering',
              window_index: '0',
              pane_index: '0',
              pane_id: '%10',
              pane_title: 'editor',
              pane_current_command: 'vim',
              pane_active: false,
              pane_dead: false,
              pane_activity_at: '2026-03-16T08:54:00.000Z'
            },
            {
              session_name: '5-web3-app-engineering',
              window_index: '0',
              pane_index: '1',
              pane_id: '%11',
              pane_title: 'tests',
              pane_current_command: 'pnpm test',
              pane_active: true,
              pane_dead: false,
              pane_activity_at: '2026-03-16T08:58:30.000Z'
            }
          ]
        }
      ]
    };
    const memoryArtifacts: MemoryArtifactIndex = {
      generated_at: '2026-03-16T09:00:00.000Z',
      items: [
        ...buildMemoryArtifacts().items,
        {
          artifact_ref: tmuxArtifactRef,
          artifact_kind: 'tmux_observation',
          file_name: '5-web3-app-engineering/0.1',
          first_seen_at: '2026-03-16T08:58:30.000Z',
          last_seen_at: '2026-03-16T08:58:30.000Z',
          mention_count: 1,
          agent_ids: ['app-engineering'],
          correlation_ids: ['corr-app-review'],
          source_kinds: ['collector_snapshot'],
          latest_summary: 'Collector preview tmux pane',
          latest_event_type: 'collector_snapshot_written',
          collector_last_modified_at: '2026-03-16T08:58:30.000Z'
        }
      ]
    };

    const { unmount } = render(
      <DetailsPanel
        {...buildProps({
          collectorSnapshot,
          memoryArtifacts,
          selectedAgent: null,
          selectedCorrelationId: null,
          selectedOperation: null,
          workflow: null,
          correlation: null,
          onSelectAgent,
          onSelectCorrelation
        })}
      />
    );

    const collectorSupervisionSection = screen.getByRole('heading', { name: 'Collector Supervision' }).closest('section');
    const sharedMemorySection = screen.getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(collectorSupervisionSection).not.toBeNull();
    expect(sharedMemorySection).not.toBeNull();

    const crewOverviewArtifactRecord = within(sharedMemorySection!).getByText(`Ref · ${tmuxArtifactRef}`).closest('li');
    expect(crewOverviewArtifactRecord).not.toBeNull();
    expect(
      within(collectorSupervisionSection!).getByRole('button', {
        name: `Jump to shared memory artifact ${tmuxArtifactRef} ${tmuxPreviewLabel}`
      })
    ).toHaveTextContent(tmuxPreviewLabel);
    expect(collectorSupervisionSection).toHaveTextContent(`Tmux preview · ${tmuxPreviewLabel}`);

    await user.click(
      within(collectorSupervisionSection!).getByRole('button', {
        name: `Jump to shared memory artifact ${tmuxArtifactRef} ${tmuxPreviewLabel}`
      })
    );

    expect(document.activeElement).toBe(crewOverviewArtifactRecord);
    expect(onSelectAgent).not.toHaveBeenCalled();
    expect(onSelectCorrelation).not.toHaveBeenCalled();

    unmount();

    render(
      <DetailsPanel
        {...buildProps({
          collectorSnapshot,
          memoryArtifacts,
          onSelectAgent,
          onSelectCorrelation
        })}
      />
    );

    const collectorObservationSection = screen.getByRole('heading', { name: 'Collector Observation' }).closest('section');
    const selectedArtifactRecord = within(screen.getByRole('heading', { name: 'Shared Memory' }).closest('section')!).getByText(
      `Ref · ${tmuxArtifactRef}`
    ).closest('li');
    expect(collectorObservationSection).not.toBeNull();
    expect(selectedArtifactRecord).not.toBeNull();
    expect(
      within(collectorObservationSection!).getByRole('button', {
        name: `Jump to shared memory artifact ${tmuxArtifactRef} ${tmuxPreviewLabel}`
      })
    ).toHaveTextContent(tmuxPreviewLabel);
    expect(collectorObservationSection).toHaveTextContent(`Tmux preview · ${tmuxPreviewLabel}`);

    await user.click(
      within(collectorObservationSection!).getByRole('button', {
        name: `Jump to shared memory artifact ${tmuxArtifactRef} ${tmuxPreviewLabel}`
      })
    );

    expect(document.activeElement).toBe(selectedArtifactRecord);
    expect(onSelectAgent).not.toHaveBeenCalled();
    expect(onSelectCorrelation).not.toHaveBeenCalled();
  });

  it('prefers the stable tmux evidence ref when the latest collector preview session name diverges from session_ref', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const onSelectCorrelation = vi.fn();
    const tmuxArtifactRef = 'tmux://5-web3-app-engineering/0.1';
    const tmuxPreviewLabel = 'pnpm test · 2026-03-16T08:58:30.000Z';
    const baseCollectorSnapshot = buildCollectorSnapshot();
    const baseCollectorItem = baseCollectorSnapshot.items[0];
    const collectorSnapshot: CollectorSnapshot = {
      ...baseCollectorSnapshot,
      items: [
        {
          ...baseCollectorItem,
          session_ref: '5-web3-app-engineering',
          evidence_refs: [tmuxArtifactRef],
          tmux_observations: [
            {
              session_name: 'app-engineering',
              window_index: '0',
              pane_index: '1',
              pane_id: '%11',
              pane_title: 'tests',
              pane_current_command: 'pnpm test',
              pane_active: true,
              pane_dead: false,
              pane_activity_at: '2026-03-16T08:58:30.000Z'
            }
          ]
        }
      ]
    };
    const memoryArtifacts: MemoryArtifactIndex = {
      generated_at: '2026-03-16T09:00:00.000Z',
      items: [
        ...buildMemoryArtifacts().items,
        {
          artifact_ref: tmuxArtifactRef,
          artifact_kind: 'tmux_observation',
          file_name: '5-web3-app-engineering/0.1',
          first_seen_at: '2026-03-16T08:58:30.000Z',
          last_seen_at: '2026-03-16T08:58:30.000Z',
          mention_count: 1,
          agent_ids: ['app-engineering'],
          correlation_ids: ['corr-app-review'],
          source_kinds: ['collector_snapshot'],
          latest_summary: 'Collector preview tmux pane',
          latest_event_type: 'collector_snapshot_written',
          collector_last_modified_at: '2026-03-16T08:58:30.000Z'
        }
      ]
    };

    render(
      <DetailsPanel
        {...buildProps({
          collectorSnapshot,
          memoryArtifacts,
          onSelectAgent,
          onSelectCorrelation
        })}
      />
    );

    const collectorObservationSection = screen.getByRole('heading', { name: 'Collector Observation' }).closest('section');
    const selectedArtifactRecord = within(screen.getByRole('heading', { name: 'Shared Memory' }).closest('section')!).getByText(
      `Ref · ${tmuxArtifactRef}`
    ).closest('li');
    expect(collectorObservationSection).not.toBeNull();
    expect(selectedArtifactRecord).not.toBeNull();
    expect(
      within(collectorObservationSection!).getByRole('button', {
        name: `Jump to shared memory artifact ${tmuxArtifactRef} ${tmuxPreviewLabel}`
      })
    ).toHaveTextContent(tmuxPreviewLabel);
    expect(
      within(collectorObservationSection!).queryByRole('button', {
        name: `Jump to shared memory artifact tmux://app-engineering/0.1 ${tmuxPreviewLabel}`
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(collectorObservationSection!).getByRole('button', {
        name: `Jump to shared memory artifact ${tmuxArtifactRef} ${tmuxPreviewLabel}`
      })
    );

    expect(document.activeElement).toBe(selectedArtifactRecord);
    expect(onSelectAgent).not.toHaveBeenCalled();
    expect(onSelectCorrelation).not.toHaveBeenCalled();
  });

  it('falls back to a single stable tmux evidence ref when the latest collector preview loses pane coordinates', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const onSelectCorrelation = vi.fn();
    const tmuxArtifactRef = 'tmux://5-web3-app-engineering/0.1';
    const tmuxPreviewLabel = 'pnpm test · 2026-03-16T08:58:30.000Z';
    const baseCollectorSnapshot = buildCollectorSnapshot();
    const baseCollectorItem = baseCollectorSnapshot.items[0];
    const collectorSnapshot: CollectorSnapshot = {
      ...baseCollectorSnapshot,
      items: [
        {
          ...baseCollectorItem,
          session_ref: '5-web3-app-engineering',
          evidence_refs: [tmuxArtifactRef],
          tmux_observations: [
            {
              session_name: '5-web3-app-engineering',
              window_index: 'null',
              pane_index: 'null',
              pane_id: '%11',
              pane_title: 'tests',
              pane_current_command: 'pnpm test',
              pane_active: true,
              pane_dead: false,
              pane_activity_at: '2026-03-16T08:58:30.000Z'
            }
          ]
        }
      ]
    };
    const memoryArtifacts: MemoryArtifactIndex = {
      generated_at: '2026-03-16T09:00:00.000Z',
      items: [
        ...buildMemoryArtifacts().items,
        {
          artifact_ref: tmuxArtifactRef,
          artifact_kind: 'tmux_observation',
          file_name: '5-web3-app-engineering/0.1',
          first_seen_at: '2026-03-16T08:58:30.000Z',
          last_seen_at: '2026-03-16T08:58:30.000Z',
          mention_count: 1,
          agent_ids: ['app-engineering'],
          correlation_ids: ['corr-app-review'],
          source_kinds: ['collector_snapshot'],
          latest_summary: 'Collector preview tmux pane',
          latest_event_type: 'collector_snapshot_written',
          collector_last_modified_at: '2026-03-16T08:58:30.000Z'
        }
      ]
    };

    render(
      <DetailsPanel
        {...buildProps({
          collectorSnapshot,
          memoryArtifacts,
          onSelectAgent,
          onSelectCorrelation
        })}
      />
    );

    const collectorObservationSection = screen.getByRole('heading', { name: 'Collector Observation' }).closest('section');
    const selectedArtifactRecord = within(screen.getByRole('heading', { name: 'Shared Memory' }).closest('section')!).getByText(
      `Ref · ${tmuxArtifactRef}`
    ).closest('li');
    expect(collectorObservationSection).not.toBeNull();
    expect(selectedArtifactRecord).not.toBeNull();
    expect(
      within(collectorObservationSection!).getByRole('button', {
        name: `Jump to shared memory artifact ${tmuxArtifactRef} ${tmuxPreviewLabel}`
      })
    ).toHaveTextContent(tmuxPreviewLabel);
    expect(collectorObservationSection).toHaveTextContent(`Tmux preview · ${tmuxPreviewLabel}`);

    await user.click(
      within(collectorObservationSection!).getByRole('button', {
        name: `Jump to shared memory artifact ${tmuxArtifactRef} ${tmuxPreviewLabel}`
      })
    );

    expect(document.activeElement).toBe(selectedArtifactRecord);
    expect(onSelectAgent).not.toHaveBeenCalled();
    expect(onSelectCorrelation).not.toHaveBeenCalled();
  });

  it('falls back to a single stable tmux evidence ref when only one pane coordinate degrades', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const onSelectCorrelation = vi.fn();
    const tmuxArtifactRef = 'tmux://5-web3-app-engineering/0.1';
    const tmuxPreviewLabel = 'pnpm test · 2026-03-16T08:58:30.000Z';
    const baseCollectorSnapshot = buildCollectorSnapshot();
    const baseCollectorItem = baseCollectorSnapshot.items[0];
    const collectorSnapshot: CollectorSnapshot = {
      ...baseCollectorSnapshot,
      items: [
        {
          ...baseCollectorItem,
          session_ref: '5-web3-app-engineering',
          evidence_refs: [tmuxArtifactRef],
          tmux_observations: [
            {
              session_name: '5-web3-app-engineering',
              window_index: '0',
              pane_index: 'null',
              pane_id: '%11',
              pane_title: 'tests',
              pane_current_command: 'pnpm test',
              pane_active: true,
              pane_dead: false,
              pane_activity_at: '2026-03-16T08:58:30.000Z'
            }
          ]
        }
      ]
    };
    const memoryArtifacts: MemoryArtifactIndex = {
      generated_at: '2026-03-16T09:00:00.000Z',
      items: [
        ...buildMemoryArtifacts().items,
        {
          artifact_ref: tmuxArtifactRef,
          artifact_kind: 'tmux_observation',
          file_name: '5-web3-app-engineering/0.1',
          first_seen_at: '2026-03-16T08:58:30.000Z',
          last_seen_at: '2026-03-16T08:58:30.000Z',
          mention_count: 1,
          agent_ids: ['app-engineering'],
          correlation_ids: ['corr-app-review'],
          source_kinds: ['collector_snapshot'],
          latest_summary: 'Collector preview tmux pane',
          latest_event_type: 'collector_snapshot_written',
          collector_last_modified_at: '2026-03-16T08:58:30.000Z'
        }
      ]
    };

    render(
      <DetailsPanel
        {...buildProps({
          collectorSnapshot,
          memoryArtifacts,
          onSelectAgent,
          onSelectCorrelation
        })}
      />
    );

    const collectorObservationSection = screen.getByRole('heading', { name: 'Collector Observation' }).closest('section');
    const selectedArtifactRecord = within(screen.getByRole('heading', { name: 'Shared Memory' }).closest('section')!).getByText(
      `Ref · ${tmuxArtifactRef}`
    ).closest('li');
    expect(collectorObservationSection).not.toBeNull();
    expect(selectedArtifactRecord).not.toBeNull();
    expect(
      within(collectorObservationSection!).getByRole('button', {
        name: `Jump to shared memory artifact ${tmuxArtifactRef} ${tmuxPreviewLabel}`
      })
    ).toHaveTextContent(tmuxPreviewLabel);
    expect(collectorObservationSection).toHaveTextContent(`Tmux preview · ${tmuxPreviewLabel}`);

    await user.click(
      within(collectorObservationSection!).getByRole('button', {
        name: `Jump to shared memory artifact ${tmuxArtifactRef} ${tmuxPreviewLabel}`
      })
    );

    expect(document.activeElement).toBe(selectedArtifactRecord);
    expect(onSelectAgent).not.toHaveBeenCalled();
    expect(onSelectCorrelation).not.toHaveBeenCalled();
  });

  it('renders collector tmux previews as exact shared-memory fallback jumps when no matching shared-memory artifact is loaded', () => {
    const tmuxArtifactRef = 'tmux://5-web3-app-engineering/0.1';
    const tmuxPreviewLabel = 'pnpm test · 2026-03-16T08:58:30.000Z';
    const baseCollectorSnapshot = buildCollectorSnapshot();
    const baseCollectorItem = baseCollectorSnapshot.items[0];
    const collectorSnapshot: CollectorSnapshot = {
      ...baseCollectorSnapshot,
      items: [
        {
          ...baseCollectorItem,
          session_ref: '5-web3-app-engineering',
          tmux_observations: [
            {
              session_name: '5-web3-app-engineering',
              window_index: '0',
              pane_index: '1',
              pane_id: '%11',
              pane_title: 'tests',
              pane_current_command: 'pnpm test',
              pane_active: true,
              pane_dead: false,
              pane_activity_at: '2026-03-16T08:58:30.000Z'
            }
          ]
        }
      ]
    };

    const { unmount } = render(
      <DetailsPanel
        {...buildProps({
          collectorSnapshot,
          selectedAgent: null,
          selectedCorrelationId: null,
          selectedOperation: null,
          workflow: null,
          correlation: null
        })}
      />
    );

    const collectorSupervisionSection = screen.getByRole('heading', { name: 'Collector Supervision' }).closest('section');
    expect(collectorSupervisionSection).not.toBeNull();
    expect(collectorSupervisionSection).toHaveTextContent(`Tmux preview · ${tmuxPreviewLabel}`);
    expect(
      within(collectorSupervisionSection!).getByRole('button', {
        name: `Jump to shared memory artifact ${tmuxArtifactRef} ${tmuxPreviewLabel}`
      })
    ).toBeVisible();

    unmount();

    render(
      <DetailsPanel
        {...buildProps({
          collectorSnapshot
        })}
      />
    );

    const collectorObservationSection = screen.getByRole('heading', { name: 'Collector Observation' }).closest('section');
    expect(collectorObservationSection).not.toBeNull();
    expect(collectorObservationSection).toHaveTextContent(`Tmux preview · ${tmuxPreviewLabel}`);
    expect(
      within(collectorObservationSection!).getByRole('button', {
        name: `Jump to shared memory artifact ${tmuxArtifactRef} ${tmuxPreviewLabel}`
      })
    ).toBeVisible();
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
  it('passes the preserved correlation to workflow counterparties only when explicit workflow-correlation preservation is enabled', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();

    const { rerender } = render(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          preserveWorkflowCounterpartyCorrelation: false,
          selectedCorrelationId: 'corr-app-secondary'
        })}
      />
    );

    const workflowSection = screen.getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(workflowSection).not.toBeNull();

    const workflowCounterpartyPivot = within(workflowSection!).getByRole('button', {
      name: 'Select workflow counterparty agent team-lead'
    });
    expect(workflowCounterpartyPivot).toBeVisible();

    await user.click(workflowCounterpartyPivot);

    expect(onSelectAgent).toHaveBeenNthCalledWith(1, 'team-lead', null);

    rerender(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          preserveWorkflowCounterpartyCorrelation: true,
          selectedCorrelationId: 'corr-app-secondary'
        })}
      />
    );

    await user.click(
      within(screen.getByRole('heading', { name: 'Workflow' }).closest('section')!).getByRole('button', {
        name: 'Select workflow counterparty agent team-lead'
      })
    );

    expect(onSelectAgent).toHaveBeenNthCalledWith(2, 'team-lead', 'corr-app-secondary');
  });

  it('renders a navigable workflow peer-watch target pivot with row-local context and preserves the active correlation', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const workflow: AgentWorkflow = {
      ...buildWorkflow(),
      detail: {
        ...buildWorkflow().detail,
        open_peer_watch_alerts: [
          {
            alert_id: 'alert-target-pivot',
            ts: '2026-03-16T08:55:00.000Z',
            agent_id: 'app-engineering',
            target_agent_id: 'growth-revenue',
            actor_id: 'team-lead',
            observer_agent_id: 'team-lead',
            watcher_agent_ids: ['team-lead'],
            severity: 'orange',
            status: 'open',
            current_state: 'blocked',
            active_task: 'Fix workflow issue',
            summary: 'Peer watch target stays actionable',
            evidence_refs: [],
            evidence_count: 0,
            correlation_id: 'corr-app-review',
            source_kind: 'controller_event',
            metadata: {}
          }
        ]
      }
    };

    render(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          selectedCorrelationId: 'corr-app-secondary',
          workflow
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(section).not.toBeNull();

    const alertRecord = within(section!).getByText('Peer watch target stays actionable').closest('li');
    expect(alertRecord).not.toBeNull();
    expect(alertRecord).toHaveTextContent('Target · growth-revenue');

    const targetPivot = within(alertRecord!).getByRole('button', {
      name: 'Select workflow peer-watch target from alert alert-target-pivot growth-revenue'
    });
    expect(targetPivot).toBeVisible();

    await user.click(targetPivot);

    expect(onSelectAgent).toHaveBeenCalledWith('growth-revenue', 'corr-app-secondary');
  });

  it('falls back to the workflow peer-watch alert correlation when no correlation is currently selected for target pivots', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const workflow: AgentWorkflow = {
      ...buildWorkflow(),
      detail: {
        ...buildWorkflow().detail,
        open_peer_watch_alerts: [
          {
            alert_id: 'alert-target-fallback',
            ts: '2026-03-16T08:56:00.000Z',
            agent_id: 'app-engineering',
            target_agent_id: 'growth-revenue',
            actor_id: 'team-lead',
            observer_agent_id: 'team-lead',
            watcher_agent_ids: ['team-lead'],
            severity: 'yellow',
            status: 'open',
            current_state: 'blocked',
            active_task: 'Fix workflow issue',
            summary: 'Peer watch target falls back to the alert correlation',
            evidence_refs: [],
            evidence_count: 0,
            correlation_id: 'corr-app-secondary',
            source_kind: 'controller_event',
            metadata: {}
          }
        ]
      }
    };

    render(
      <DetailsPanel
        {...buildProps({
          correlation: null,
          onSelectAgent,
          selectedCorrelationId: null,
          workflow
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(section).not.toBeNull();

    await user.click(
      within(section!).getByRole('button', {
        name: 'Select workflow peer-watch target from alert alert-target-fallback growth-revenue'
      })
    );

    expect(onSelectAgent).toHaveBeenCalledWith('growth-revenue', 'corr-app-secondary');
  });

  it('keeps current and unknown workflow peer-watch targets as plain text', () => {
    const workflow: AgentWorkflow = {
      ...buildWorkflow(),
      detail: {
        ...buildWorkflow().detail,
        open_peer_watch_alerts: [
          {
            alert_id: 'alert-target-current',
            ts: '2026-03-16T08:55:00.000Z',
            agent_id: 'app-engineering',
            target_agent_id: 'app-engineering',
            actor_id: 'team-lead',
            observer_agent_id: 'team-lead',
            watcher_agent_ids: ['growth-revenue'],
            severity: 'orange',
            status: 'open',
            current_state: 'blocked',
            active_task: 'Fix workflow issue',
            summary: 'Current target stays plain text',
            evidence_refs: [],
            evidence_count: 0,
            correlation_id: 'corr-app-review',
            source_kind: 'controller_event',
            metadata: {}
          },
          {
            alert_id: 'alert-target-unknown',
            ts: '2026-03-16T08:54:00.000Z',
            agent_id: 'app-engineering',
            target_agent_id: 'ghost-agent',
            actor_id: 'team-lead',
            observer_agent_id: 'team-lead',
            watcher_agent_ids: ['growth-revenue'],
            severity: 'yellow',
            status: 'open',
            current_state: 'blocked',
            active_task: 'Fix workflow issue',
            summary: 'Unknown target stays plain text',
            evidence_refs: [],
            evidence_count: 0,
            correlation_id: 'corr-app-review',
            source_kind: 'controller_event',
            metadata: {}
          }
        ]
      }
    };

    render(<DetailsPanel {...buildProps({ workflow })} />);

    const section = screen.getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(section).not.toBeNull();

    const currentRecord = within(section!).getByText('Current target stays plain text').closest('li');
    const unknownRecord = within(section!).getByText('Unknown target stays plain text').closest('li');
    expect(currentRecord).not.toBeNull();
    expect(unknownRecord).not.toBeNull();

    expect(currentRecord).toHaveTextContent('Target · app-engineering');
    expect(
      within(currentRecord!).queryByRole('button', {
        name: 'Select workflow peer-watch target from alert alert-target-current app-engineering'
      })
    ).not.toBeInTheDocument();
    expect(unknownRecord).toHaveTextContent('Target · ghost-agent');
    expect(
      within(unknownRecord!).queryByRole('button', {
        name: 'Select workflow peer-watch target from alert alert-target-unknown ghost-agent'
      })
    ).not.toBeInTheDocument();
  });

  it('renders a navigable workflow peer-watch observer pivot with row-local context and preserves the active correlation', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const workflow: AgentWorkflow = {
      ...buildWorkflow(),
      detail: {
        ...buildWorkflow().detail,
        open_peer_watch_alerts: [
          {
            alert_id: 'alert-observer-pivot',
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
            summary: 'Peer watch observer stays actionable',
            evidence_refs: [],
            evidence_count: 0,
            correlation_id: 'corr-app-review',
            source_kind: 'controller_event',
            metadata: {}
          }
        ]
      }
    };

    render(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          selectedCorrelationId: 'corr-app-secondary',
          workflow
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(section).not.toBeNull();

    const alertRecord = within(section!).getByText('Peer watch observer stays actionable').closest('li');
    expect(alertRecord).not.toBeNull();
    expect(alertRecord).toHaveTextContent('Watchers · growth-revenue, team-lead');

    const observerPivot = within(alertRecord!).getByRole('button', {
      name: 'Select workflow peer-watch observer from alert alert-observer-pivot team-lead'
    });
    expect(observerPivot).toBeVisible();

    await user.click(observerPivot);

    expect(onSelectAgent).toHaveBeenCalledWith('team-lead', 'corr-app-secondary');
  });

  it('falls back to the workflow peer-watch alert correlation when no correlation is currently selected', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const workflow: AgentWorkflow = {
      ...buildWorkflow(),
      detail: {
        ...buildWorkflow().detail,
        open_peer_watch_alerts: [
          {
            alert_id: 'alert-observer-fallback',
            ts: '2026-03-16T08:56:00.000Z',
            agent_id: 'app-engineering',
            target_agent_id: 'app-engineering',
            actor_id: 'growth-revenue',
            observer_agent_id: 'growth-revenue',
            watcher_agent_ids: ['growth-revenue'],
            severity: 'yellow',
            status: 'open',
            current_state: 'blocked',
            active_task: 'Fix workflow issue',
            summary: 'Peer watch observer falls back to the alert correlation',
            evidence_refs: [],
            evidence_count: 0,
            correlation_id: 'corr-app-secondary',
            source_kind: 'controller_event',
            metadata: {}
          }
        ]
      }
    };

    render(
      <DetailsPanel
        {...buildProps({
          correlation: null,
          onSelectAgent,
          selectedCorrelationId: null,
          workflow
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(section).not.toBeNull();

    await user.click(
      within(section!).getByRole('button', {
        name: 'Select workflow peer-watch observer from alert alert-observer-fallback growth-revenue'
      })
    );

    expect(onSelectAgent).toHaveBeenCalledWith('growth-revenue', 'corr-app-secondary');
  });

  it('keeps current and unknown workflow peer-watch observers as plain text', () => {
    const workflow: AgentWorkflow = {
      ...buildWorkflow(),
      detail: {
        ...buildWorkflow().detail,
        open_peer_watch_alerts: [
          {
            alert_id: 'alert-observer-current',
            ts: '2026-03-16T08:55:00.000Z',
            agent_id: 'app-engineering',
            target_agent_id: 'app-engineering',
            actor_id: 'app-engineering',
            observer_agent_id: 'app-engineering',
            watcher_agent_ids: ['team-lead'],
            severity: 'orange',
            status: 'open',
            current_state: 'blocked',
            active_task: 'Fix workflow issue',
            summary: 'Current observer stays plain text',
            evidence_refs: [],
            evidence_count: 0,
            correlation_id: 'corr-app-review',
            source_kind: 'controller_event',
            metadata: {}
          },
          {
            alert_id: 'alert-observer-unknown',
            ts: '2026-03-16T08:54:00.000Z',
            agent_id: 'app-engineering',
            target_agent_id: 'app-engineering',
            actor_id: 'ghost-agent',
            observer_agent_id: 'ghost-agent',
            watcher_agent_ids: ['ghost-agent'],
            severity: 'yellow',
            status: 'open',
            current_state: 'blocked',
            active_task: 'Fix workflow issue',
            summary: 'Unknown observer stays plain text',
            evidence_refs: [],
            evidence_count: 0,
            correlation_id: 'corr-app-review',
            source_kind: 'controller_event',
            metadata: {}
          }
        ]
      }
    };

    render(<DetailsPanel {...buildProps({ workflow })} />);

    const section = screen.getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(section).not.toBeNull();

    const currentRecord = within(section!).getByText('Current observer stays plain text').closest('li');
    const unknownRecord = within(section!).getByText('Unknown observer stays plain text').closest('li');
    expect(currentRecord).not.toBeNull();
    expect(unknownRecord).not.toBeNull();

    expect(currentRecord).toHaveTextContent('Observer · app-engineering');
    expect(
      within(currentRecord!).queryByRole('button', {
        name: 'Select workflow peer-watch observer from alert alert-observer-current app-engineering'
      })
    ).not.toBeInTheDocument();
    expect(unknownRecord).toHaveTextContent('Observer · ghost-agent');
    expect(
      within(unknownRecord!).queryByRole('button', {
        name: 'Select workflow peer-watch observer from alert alert-observer-unknown ghost-agent'
      })
    ).not.toBeInTheDocument();
  });

  it('renders navigable workflow peer-watch watcher pivots with row-local context and preserves the active correlation', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const workflow: AgentWorkflow = {
      ...buildWorkflow(),
      detail: {
        ...buildWorkflow().detail,
        open_peer_watch_alerts: [
          {
            alert_id: 'alert-watcher-pivot',
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
            summary: 'Peer watch watchers stay actionable',
            evidence_refs: [],
            evidence_count: 0,
            correlation_id: 'corr-app-review',
            source_kind: 'controller_event',
            metadata: {}
          }
        ]
      }
    };

    render(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          selectedCorrelationId: 'corr-app-secondary',
          workflow
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(section).not.toBeNull();

    const alertRecord = within(section!).getByText('Peer watch watchers stay actionable').closest('li');
    expect(alertRecord).not.toBeNull();
    expect(alertRecord).toHaveTextContent('Watchers · growth-revenue, team-lead');

    const watcherPivot = within(alertRecord!).getByRole('button', {
      name: 'Select workflow peer-watch watcher from alert alert-watcher-pivot growth-revenue'
    });
    expect(watcherPivot).toBeVisible();

    await user.click(watcherPivot);

    expect(onSelectAgent).toHaveBeenCalledWith('growth-revenue', 'corr-app-secondary');
  });

  it('falls back to the workflow peer-watch alert correlation when no correlation is currently selected for watcher pivots', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const workflow: AgentWorkflow = {
      ...buildWorkflow(),
      detail: {
        ...buildWorkflow().detail,
        open_peer_watch_alerts: [
          {
            alert_id: 'alert-watcher-fallback',
            ts: '2026-03-16T08:56:00.000Z',
            agent_id: 'app-engineering',
            target_agent_id: 'app-engineering',
            actor_id: 'team-lead',
            observer_agent_id: 'team-lead',
            watcher_agent_ids: ['growth-revenue'],
            severity: 'yellow',
            status: 'open',
            current_state: 'blocked',
            active_task: 'Fix workflow issue',
            summary: 'Peer watch watcher falls back to the alert correlation',
            evidence_refs: [],
            evidence_count: 0,
            correlation_id: 'corr-app-secondary',
            source_kind: 'controller_event',
            metadata: {}
          }
        ]
      }
    };

    render(
      <DetailsPanel
        {...buildProps({
          correlation: null,
          onSelectAgent,
          selectedCorrelationId: null,
          workflow
        })}
      />
    );

    const section = screen.getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(section).not.toBeNull();

    await user.click(
      within(section!).getByRole('button', {
        name: 'Select workflow peer-watch watcher from alert alert-watcher-fallback growth-revenue'
      })
    );

    expect(onSelectAgent).toHaveBeenCalledWith('growth-revenue', 'corr-app-secondary');
  });

  it('keeps current and unknown workflow peer-watch watchers as plain text', () => {
    const workflow: AgentWorkflow = {
      ...buildWorkflow(),
      detail: {
        ...buildWorkflow().detail,
        open_peer_watch_alerts: [
          {
            alert_id: 'alert-watcher-current',
            ts: '2026-03-16T08:55:00.000Z',
            agent_id: 'app-engineering',
            target_agent_id: 'app-engineering',
            actor_id: 'team-lead',
            observer_agent_id: 'team-lead',
            watcher_agent_ids: ['app-engineering'],
            severity: 'orange',
            status: 'open',
            current_state: 'blocked',
            active_task: 'Fix workflow issue',
            summary: 'Current watcher stays plain text',
            evidence_refs: [],
            evidence_count: 0,
            correlation_id: 'corr-app-review',
            source_kind: 'controller_event',
            metadata: {}
          },
          {
            alert_id: 'alert-watcher-unknown',
            ts: '2026-03-16T08:54:00.000Z',
            agent_id: 'app-engineering',
            target_agent_id: 'app-engineering',
            actor_id: 'team-lead',
            observer_agent_id: 'team-lead',
            watcher_agent_ids: ['ghost-agent'],
            severity: 'yellow',
            status: 'open',
            current_state: 'blocked',
            active_task: 'Fix workflow issue',
            summary: 'Unknown watcher stays plain text',
            evidence_refs: [],
            evidence_count: 0,
            correlation_id: 'corr-app-review',
            source_kind: 'controller_event',
            metadata: {}
          }
        ]
      }
    };

    render(<DetailsPanel {...buildProps({ workflow })} />);

    const section = screen.getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(section).not.toBeNull();

    const currentRecord = within(section!).getByText('Current watcher stays plain text').closest('li');
    const unknownRecord = within(section!).getByText('Unknown watcher stays plain text').closest('li');
    expect(currentRecord).not.toBeNull();
    expect(unknownRecord).not.toBeNull();

    expect(currentRecord).toHaveTextContent('Watchers · app-engineering');
    expect(
      within(currentRecord!).queryByRole('button', {
        name: 'Select workflow peer-watch watcher from alert alert-watcher-current app-engineering'
      })
    ).not.toBeInTheDocument();
    expect(unknownRecord).toHaveTextContent('Watchers · ghost-agent');
    expect(
      within(unknownRecord!).queryByRole('button', {
        name: 'Select workflow peer-watch watcher from alert alert-watcher-unknown ghost-agent'
      })
    ).not.toBeInTheDocument();
  });

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
        name: 'Select workflow interaction participant from interaction interaction-workflow-1 team-lead'
      })
    ).toBeVisible();
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
      within(eventRecord!).getByRole('button', {
        name: 'Select workflow recent event counterparty from event evt-2 team-lead'
      })
    ).toBeVisible();
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
            counterparty_agent_ids: ['team-lead', 'app-engineering', 'ghost-agent'],
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
            counterparty_agent_ids: ['team-lead', 'app-engineering', 'ghost-agent'],
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
    const handoffActorPivot = within(handoffRecord!).getByRole('button', {
      name: 'Select workflow status actor from handoff handoff-1 growth-revenue'
    });
    const handoffCounterpartyPivot = within(handoffRecord!).getByRole('button', {
      name: 'Select workflow status counterparty from handoff handoff-1 team-lead'
    });
    expect(handoffActorPivot).toBeVisible();
    expect(handoffCounterpartyPivot).toBeVisible();
    expect(handoffRecord).toHaveTextContent('Counterparties · team-lead, app-engineering, ghost-agent');
    expect(
      within(handoffRecord!).queryByRole('button', {
        name: 'Select workflow status counterparty from handoff handoff-1 app-engineering'
      })
    ).not.toBeInTheDocument();
    expect(
      within(handoffRecord!).queryByRole('button', {
        name: 'Select workflow status counterparty from handoff handoff-1 ghost-agent'
      })
    ).not.toBeInTheDocument();
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
    expect(
      within(rebootRecord!).getByRole('button', {
        name: 'Select workflow status actor from reboot reboot-1 team-lead'
      })
    ).toBeVisible();
    expect(
      within(rebootRecord!).getByRole('button', {
        name: 'Select workflow status counterparty from reboot reboot-1 team-lead'
      })
    ).toBeVisible();
    expect(rebootRecord).toHaveTextContent('Counterparties · team-lead, app-engineering, ghost-agent');
    expect(
      within(rebootRecord!).queryByRole('button', {
        name: 'Select workflow status counterparty from reboot reboot-1 app-engineering'
      })
    ).not.toBeInTheDocument();
    expect(
      within(rebootRecord!).queryByRole('button', {
        name: 'Select workflow status counterparty from reboot reboot-1 ghost-agent'
      })
    ).not.toBeInTheDocument();
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
    expect(onSelectCorrelation).not.toHaveBeenCalled();

    await user.click(handoffCounterpartyPivot);
    expect(onSelectAgent).toHaveBeenNthCalledWith(1, 'team-lead', 'corr-app-review');

    await user.click(handoffActorPivot);
    expect(onSelectAgent).toHaveBeenNthCalledWith(2, 'growth-revenue', 'corr-app-review');

    await user.click(handoffPivot);
    expect(onSelectCorrelation).toHaveBeenCalledWith('corr-app-secondary', {
      preserveAutoOnDefaultReselect: true
    });
  });

  it('preserves auto correlation mode when re-selecting the active selected-agent workflow-status correlation', async () => {
    const user = userEvent.setup();
    const onSelectCorrelation = vi.fn();
    const workflow: AgentWorkflow = {
      ...buildWorkflow(),
      detail: {
        ...buildWorkflow().detail,
        recent_handoffs: [],
        recent_reboots: [
          {
            reboot_id: 'reboot-auto-reselect',
            ts: '2026-03-16T08:40:00.000Z',
            agent_id: 'app-engineering',
            actor_id: 'team-lead',
            phase: 'reboot_recommended',
            status: 'requested',
            severity: 'yellow',
            summary: 'Workflow status default correlation stays auto',
            counterparty_agent_ids: ['team-lead'],
            evidence_refs: [],
            correlation_id: 'corr-app-review',
            source_kind: 'controller_event'
          }
        ]
      }
    };

    render(
      <DetailsPanel
        {...buildProps({
          onSelectCorrelation,
          selectedCorrelationId: 'corr-app-review',
          workflow
        })}
      />
    );

    const workflowSection = screen.getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(workflowSection).not.toBeNull();

    await user.click(
      within(workflowSection!).getByRole('button', {
        name: 'Open workflow status correlation corr-app-review, currently selected'
      })
    );

    expect(onSelectCorrelation).toHaveBeenCalledWith('corr-app-review', {
      preserveAutoOnDefaultReselect: true
    });
  });

  it('falls back to each workflow status record correlation when no correlation is currently selected and a workflow status counterparty is clicked', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const workflow: AgentWorkflow = {
      ...buildWorkflow(),
      detail: {
        ...buildWorkflow().detail,
        recent_handoffs: [
          {
            handoff_id: 'handoff-fallback-actor',
            ts: '2026-03-16T08:57:00.000Z',
            agent_id: 'app-engineering',
            actor_id: 'growth-revenue',
            phase: 'handoff_done',
            status: 'completed',
            severity: 'yellow',
            summary: 'Fallback handoff counterparty keeps its own correlation',
            counterparty_agent_ids: ['growth-revenue'],
            evidence_refs: [],
            correlation_id: 'corr-app-secondary',
            source_kind: 'controller_event'
          }
        ],
        recent_reboots: [
          {
            reboot_id: 'reboot-fallback-actor',
            ts: '2026-03-16T08:40:00.000Z',
            agent_id: 'app-engineering',
            actor_id: 'team-lead',
            phase: 'reboot_recommended',
            status: 'requested',
            severity: 'yellow',
            summary: 'Fallback reboot counterparty keeps its own correlation',
            counterparty_agent_ids: ['team-lead'],
            evidence_refs: [],
            correlation_id: 'corr-app-review',
            source_kind: 'controller_event'
          }
        ]
      }
    };

    render(<DetailsPanel {...buildProps({ onSelectAgent, selectedCorrelationId: null, workflow })} />);

    const section = screen.getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(section).not.toBeNull();

    await user.click(
      within(section!).getByRole('button', {
        name: 'Select workflow status counterparty from handoff handoff-fallback-actor growth-revenue'
      })
    );
    expect(onSelectAgent).toHaveBeenNthCalledWith(1, 'growth-revenue', 'corr-app-secondary');

    await user.click(
      within(section!).getByRole('button', {
        name: 'Select workflow status counterparty from reboot reboot-fallback-actor team-lead'
      })
    );
    expect(onSelectAgent).toHaveBeenNthCalledWith(2, 'team-lead', 'corr-app-review');
  });

  it('keeps unknown and current workflow status counterparties as plain text', () => {
    const workflow: AgentWorkflow = {
      ...buildWorkflow(),
      detail: {
        ...buildWorkflow().detail,
        recent_handoffs: [
          {
            handoff_id: 'handoff-current-actor',
            ts: '2026-03-16T08:57:00.000Z',
            agent_id: 'app-engineering',
            actor_id: 'app-engineering',
            phase: 'handoff_done',
            status: 'completed',
            severity: 'yellow',
            summary: 'Current and unknown counterparties stay plain text for handoffs',
            counterparty_agent_ids: ['app-engineering', 'ghost-agent'],
            evidence_refs: [],
            correlation_id: 'corr-app-review',
            source_kind: 'controller_event'
          }
        ],
        recent_reboots: [
          {
            reboot_id: 'reboot-unknown-actor',
            ts: '2026-03-16T08:40:00.000Z',
            agent_id: 'app-engineering',
            actor_id: 'ghost-agent',
            phase: 'reboot_recommended',
            status: 'requested',
            severity: 'yellow',
            summary: 'Current and unknown counterparties stay plain text for reboots',
            counterparty_agent_ids: ['ghost-agent', 'app-engineering'],
            evidence_refs: [],
            correlation_id: 'corr-app-review',
            source_kind: 'controller_event'
          }
        ]
      }
    };

    render(<DetailsPanel {...buildProps({ workflow })} />);

    const section = screen.getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(section).not.toBeNull();

    const handoffRecord = within(section!)
      .getByText('Current and unknown counterparties stay plain text for handoffs')
      .closest('li');
    const rebootRecord = within(section!)
      .getByText('Current and unknown counterparties stay plain text for reboots')
      .closest('li');
    expect(handoffRecord).not.toBeNull();
    expect(rebootRecord).not.toBeNull();

    expect(handoffRecord).toHaveTextContent('Counterparties · app-engineering, ghost-agent');
    expect(
      within(handoffRecord!).queryByRole('button', {
        name: 'Select workflow status counterparty from handoff handoff-current-actor app-engineering'
      })
    ).not.toBeInTheDocument();
    expect(
      within(handoffRecord!).queryByRole('button', {
        name: 'Select workflow status counterparty from handoff handoff-current-actor ghost-agent'
      })
    ).not.toBeInTheDocument();
    expect(rebootRecord).toHaveTextContent('Counterparties · ghost-agent, app-engineering');
    expect(
      within(rebootRecord!).queryByRole('button', {
        name: 'Select workflow status counterparty from reboot reboot-unknown-actor ghost-agent'
      })
    ).not.toBeInTheDocument();
    expect(
      within(rebootRecord!).queryByRole('button', {
        name: 'Select workflow status counterparty from reboot reboot-unknown-actor app-engineering'
      })
    ).not.toBeInTheDocument();
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
    expect(
      within(alertRecord!).getByRole('button', {
        name: 'Select workflow peer-watch observer from alert alert-observability team-lead'
      })
    ).toBeVisible();
    expect(alertRecord).toHaveTextContent('Watchers · growth-revenue, team-lead');
    expect(
      within(alertRecord!).getByRole('button', {
        name: 'Select workflow peer-watch watcher from alert alert-observability growth-revenue'
      })
    ).toBeVisible();
    expect(
      within(alertRecord!).getByRole('button', {
        name: 'Select workflow peer-watch watcher from alert alert-observability team-lead'
      })
    ).toBeVisible();
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

  it('renders selected-agent supervision history entries with explicit severity, status, pivots, and evidence metadata', async () => {
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
          first_seen_at: '2026-03-16T08:49:00.000Z',
          last_seen_at: '2026-03-16T08:55:00.000Z',
          mention_count: 2,
          agent_ids: ['app-engineering', 'team-lead'],
          correlation_ids: ['corr-app-review'],
          source_kinds: ['controller_event'],
          latest_summary: 'Selected-agent supervision history evidence anchor',
          latest_event_type: 'peer_watch_alert_raised',
          collector_last_modified_at: '2026-03-16T08:55:00.000Z'
        }
      ]
    };

    render(
      <DetailsPanel
        {...buildProps({
          memoryArtifacts,
          onSelectAgent,
          onSelectCorrelation,
          selectedAgentSupervisionHistory: {
            items: [
              {
                alert_id: 'alert-history-1',
                ts: '2026-03-16T08:55:00.000Z',
                agent_id: 'app-engineering',
                target_agent_id: 'app-engineering',
                actor_id: 'team-lead',
                observer_agent_id: 'team-lead',
                watcher_agent_ids: ['growth-revenue', 'team-lead'],
                severity: 'orange',
                status: 'resolved',
                current_state: 'blocked',
                active_task: 'Fix workflow issue',
                summary: 'Peer watch recovered after evidence review',
                evidence_refs: ['/evidence/review.md', '/evidence/missing.md'],
                evidence_count: 2,
                correlation_id: 'corr-app-review',
                source_kind: 'controller_event',
                metadata: {
                  resolution: 'review_complete'
                }
              }
            ]
          }
        })}
      />
    );

    const supervisionSection = screen.getByRole('heading', { name: 'Supervision History' }).closest('section');
    const sharedMemorySection = screen.getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(supervisionSection).not.toBeNull();
    expect(sharedMemorySection).not.toBeNull();

    const alertRecord = within(supervisionSection!).getByText('Peer watch recovered after evidence review').closest('li');
    const artifactRecord = within(sharedMemorySection!).getByText('Ref · /evidence/review.md').closest('li');
    expect(alertRecord).not.toBeNull();
    expect(artifactRecord).not.toBeNull();

    expect(
      within(alertRecord!).getByRole('button', {
        name: 'Open supervision history correlation corr-app-review, currently selected'
      })
    ).toBeVisible();
    expect(within(alertRecord!).getByText('At · 2026-03-16T08:55:00.000Z')).toBeVisible();
    expect(within(alertRecord!).getByText('Severity · orange')).toBeVisible();
    expect(within(alertRecord!).getByText('Status · resolved')).toBeVisible();
    expect(within(alertRecord!).getByText('Workflow status · blocked')).toBeVisible();
    expect(within(alertRecord!).getByText('Task · Fix workflow issue')).toBeVisible();
    expect(
      within(alertRecord!).getByRole('button', {
        name: 'Select supervision history observer from alert alert-history-1 team-lead'
      })
    ).toBeVisible();
    expect(alertRecord).toHaveTextContent('Watchers · growth-revenue, team-lead');
    expect(
      within(alertRecord!).getByRole('button', {
        name: 'Select supervision history watcher from alert alert-history-1 growth-revenue'
      })
    ).toBeVisible();
    expect(
      within(alertRecord!).getByRole('button', {
        name: 'Select supervision history watcher from alert alert-history-1 team-lead'
      })
    ).toBeVisible();
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

  it('renders selected-agent supervision history actors as pivots only for navigable non-current agents and preserves the active correlation first', async () => {
    const user = userEvent.setup();
    const onSelectAgent = vi.fn();
    const selectedAgentSupervisionHistory = {
      items: [
        {
          alert_id: 'alert-history-actor-pivot',
          ts: '2026-03-16T08:55:00.000Z',
          agent_id: 'app-engineering',
          target_agent_id: 'app-engineering',
          actor_id: 'growth-revenue',
          observer_agent_id: 'team-lead',
          watcher_agent_ids: [],
          severity: 'orange',
          status: 'resolved',
          current_state: 'blocked',
          active_task: 'Navigable actor keeps the selected correlation',
          summary: 'Navigable supervision-history actor stays actionable',
          evidence_refs: [],
          evidence_count: 0,
          correlation_id: 'corr-app-review',
          source_kind: 'controller_event',
          metadata: {}
        },
        {
          alert_id: 'alert-history-actor-current',
          ts: '2026-03-16T08:54:00.000Z',
          agent_id: 'app-engineering',
          target_agent_id: 'app-engineering',
          actor_id: 'app-engineering',
          observer_agent_id: 'team-lead',
          watcher_agent_ids: [],
          severity: 'yellow',
          status: 'open',
          current_state: 'blocked',
          active_task: 'Current actor stays plain text',
          summary: 'Current supervision-history actor stays plain text',
          evidence_refs: [],
          evidence_count: 0,
          correlation_id: 'corr-app-review',
          source_kind: 'controller_event',
          metadata: {}
        },
        {
          alert_id: 'alert-history-actor-unknown',
          ts: '2026-03-16T08:53:00.000Z',
          agent_id: 'app-engineering',
          target_agent_id: 'app-engineering',
          actor_id: 'ghost-agent',
          observer_agent_id: 'team-lead',
          watcher_agent_ids: [],
          severity: 'yellow',
          status: 'open',
          current_state: 'blocked',
          active_task: 'Unknown actor stays plain text',
          summary: 'Unknown supervision-history actor stays plain text',
          evidence_refs: [],
          evidence_count: 0,
          correlation_id: 'corr-app-ghost',
          source_kind: 'controller_event',
          metadata: {}
        }
      ]
    } satisfies PeerWatchAlertsResponse;

    const { rerender } = render(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          selectedCorrelationId: 'corr-app-secondary',
          selectedAgentSupervisionHistory
        })}
      />
    );

    const supervisionSection = screen.getByRole('heading', { name: 'Supervision History' }).closest('section');
    expect(supervisionSection).not.toBeNull();

    const navigableRecord = within(supervisionSection!)
      .getByText('Navigable supervision-history actor stays actionable')
      .closest('li');
    const currentRecord = within(supervisionSection!).getByText('Current supervision-history actor stays plain text').closest('li');
    const unknownRecord = within(supervisionSection!).getByText('Unknown supervision-history actor stays plain text').closest('li');
    expect(navigableRecord).not.toBeNull();
    expect(currentRecord).not.toBeNull();
    expect(unknownRecord).not.toBeNull();

    expect(navigableRecord).toHaveTextContent('Actor · growth-revenue');
    expect(currentRecord).toHaveTextContent('Actor · app-engineering');
    expect(unknownRecord).toHaveTextContent('Actor · ghost-agent');
    expect(
      within(navigableRecord!).getByRole('button', {
        name: 'Select supervision history actor from alert alert-history-actor-pivot growth-revenue'
      })
    ).toBeVisible();
    expect(
      within(currentRecord!).queryByRole('button', {
        name: 'Select supervision history actor from alert alert-history-actor-current app-engineering'
      })
    ).not.toBeInTheDocument();
    expect(
      within(unknownRecord!).queryByRole('button', {
        name: 'Select supervision history actor from alert alert-history-actor-unknown ghost-agent'
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(navigableRecord!).getByRole('button', {
        name: 'Select supervision history actor from alert alert-history-actor-pivot growth-revenue'
      })
    );

    expect(onSelectAgent).toHaveBeenNthCalledWith(1, 'growth-revenue', 'corr-app-secondary');

    rerender(
      <DetailsPanel
        {...buildProps({
          onSelectAgent,
          selectedCorrelationId: null,
          selectedAgentSupervisionHistory
        })}
      />
    );

    await user.click(
      within(screen.getByRole('heading', { name: 'Supervision History' }).closest('section')!).getByRole('button', {
        name: 'Select supervision history actor from alert alert-history-actor-pivot growth-revenue'
      })
    );

    expect(onSelectAgent).toHaveBeenNthCalledWith(2, 'growth-revenue', 'corr-app-review');
  });

  it('preserves auto correlation mode when re-selecting the active selected-agent supervision history correlation', async () => {
    const user = userEvent.setup();
    const onSelectCorrelation = vi.fn();

    render(
      <DetailsPanel
        {...buildProps({
          onSelectCorrelation,
          selectedAgentSupervisionHistory: {
            items: [
              {
                alert_id: 'alert-history-1',
                ts: '2026-03-16T08:55:00.000Z',
                agent_id: 'app-engineering',
                target_agent_id: 'app-engineering',
                actor_id: 'team-lead',
                observer_agent_id: 'team-lead',
                watcher_agent_ids: ['growth-revenue'],
                severity: 'orange',
                status: 'resolved',
                current_state: 'blocked',
                active_task: 'Fix workflow issue',
                summary: 'Peer watch recovered after evidence review',
                evidence_refs: ['/evidence/review.md'],
                evidence_count: 1,
                correlation_id: 'corr-app-review',
                source_kind: 'controller_event',
                metadata: {}
              }
            ]
          }
        })}
      />
    );

    const supervisionSection = screen.getByRole('heading', { name: 'Supervision History' }).closest('section');
    expect(supervisionSection).not.toBeNull();

    await user.click(
      within(supervisionSection!).getByRole('button', {
        name: 'Open supervision history correlation corr-app-review, currently selected'
      })
    );

    expect(onSelectCorrelation).toHaveBeenCalledWith('corr-app-review', {
      preserveAutoOnDefaultReselect: true
    });
  });

  it('shows a target-agent request scope line for selected-agent supervision history even during manual correlation overrides', () => {
    render(
      <DetailsPanel
        {...buildProps({
          manualCorrelationOverrideActive: true,
          selectedCorrelationId: 'corr-app-secondary',
          sharedMemoryRequestScopeLabel: 'app-engineering · corr-app-secondary',
          selectedAgentSupervisionHistory: {
            items: [
              {
                alert_id: 'alert-history-scope',
                ts: '2026-03-16T08:55:00.000Z',
                agent_id: 'app-engineering',
                target_agent_id: 'app-engineering',
                actor_id: 'team-lead',
                observer_agent_id: 'team-lead',
                watcher_agent_ids: ['growth-revenue'],
                severity: 'orange',
                status: 'resolved',
                current_state: 'blocked',
                active_task: 'Fix workflow issue',
                summary: 'Selected-agent history keeps target-agent request scope',
                evidence_refs: [],
                evidence_count: 0,
                correlation_id: 'corr-app-review',
                source_kind: 'controller_event',
                metadata: {}
              }
            ]
          }
        })}
      />
    );

    const supervisionSection = screen.getByRole('heading', { name: 'Supervision History' }).closest('section');
    expect(supervisionSection).not.toBeNull();
    expect(within(supervisionSection!).getByText('Request scope · Target agent · app-engineering')).toBeVisible();
    expect(
      within(supervisionSection!).queryByText('Request scope · app-engineering · corr-app-secondary')
    ).not.toBeInTheDocument();
  });

  it('renders selected-agent supervision history loading, empty, error, and degraded states explicitly', () => {
    const { rerender } = render(
      <DetailsPanel
        {...buildProps({
          selectedAgentSupervisionHistory: null,
          selectedAgentSupervisionHistoryError: null,
          selectedAgentSupervisionHistoryState: 'loading'
        })}
      />
    );

    const supervisionSection = screen.getByRole('heading', { name: 'Supervision History' }).closest('section');
    expect(supervisionSection).not.toBeNull();
    expect(within(supervisionSection!).getByText('Loading supervision history...')).toBeVisible();

    rerender(
      <DetailsPanel
        {...buildProps({
          selectedAgentSupervisionHistory: { items: [] },
          selectedAgentSupervisionHistoryError: null,
          selectedAgentSupervisionHistoryState: 'ready'
        })}
      />
    );

    expect(within(supervisionSection!).getByText('No recent supervision history.')).toBeVisible();

    rerender(
      <DetailsPanel
        {...buildProps({
          selectedAgentSupervisionHistory: null,
          selectedAgentSupervisionHistoryError: 'peer-watch refresh failed',
          selectedAgentSupervisionHistoryState: 'error'
        })}
      />
    );

    expect(
      within(supervisionSection!).getByText('Unable to load supervision history. peer-watch refresh failed')
    ).toBeVisible();

    rerender(
      <DetailsPanel
        {...buildProps({
          selectedAgentSupervisionHistory: { items: [] },
          selectedAgentSupervisionHistoryError: 'peer-watch refresh failed',
          selectedAgentSupervisionHistoryState: 'ready'
        })}
      />
    );

    expect(
      within(supervisionSection!).getByText('Showing last supervision history. peer-watch refresh failed')
    ).toBeVisible();
    expect(within(supervisionSection!).getByText('No recent supervision history.')).toBeVisible();
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
