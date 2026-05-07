import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./aitown/WorldScene', () => ({
  default: function MockWorldScene({
    scene,
    onSelectAgent,
    resetViewSignal = 0,
    zoneFocusRequest = null,
    showActiveCorrelationOverlay = true
  }: {
    scene: {
      selectedAgentId: string | null;
      activeCorrelationId: string | null;
      correlationParticipantAgentIds: string[];
      watchEdges: Array<{
        fromAgentId: string;
        toAgentId: string;
        watchMode: 'lead' | 'peer';
        riskLevel: 'normal' | 'yellow' | 'orange' | 'red';
      }>;
      agents: Array<{
        agentId: string;
        displayName: string;
      }>;
    };
    onSelectAgent: (agentId: string | null) => void;
    resetViewSignal?: number;
    zoneFocusRequest?: { zoneId: string; requestId: number } | null;
    showActiveCorrelationOverlay?: boolean;
  }) {
    const labelByAgentId = new Map(scene.agents.map((agent) => [agent.agentId, agent.displayName]));

    return (
      <div data-testid="mock-world-scene">
        <output data-testid="mock-reset-view-signal">{resetViewSignal}</output>
        <output data-testid="mock-zone-focus-request">
          {zoneFocusRequest ? `${zoneFocusRequest.zoneId}:${zoneFocusRequest.requestId}` : ''}
        </output>
        <output data-testid="mock-scene-selected-agent-id">{scene.selectedAgentId ?? ''}</output>
        <output data-testid="mock-scene-active-correlation-id">{scene.activeCorrelationId ?? ''}</output>
        <output data-testid="mock-scene-correlation-participants">
          {scene.correlationParticipantAgentIds.join(',')}
        </output>
        {showActiveCorrelationOverlay && scene.activeCorrelationId ? (
          <section aria-label="Active correlation">{scene.activeCorrelationId}</section>
        ) : null}
        {scene.agents.map((agent) => (
          <button key={agent.agentId} type="button" onClick={() => onSelectAgent(agent.agentId)}>
            {`Select scene agent ${agent.agentId}`}
          </button>
        ))}
        {scene.watchEdges.length > 0 ? (
          <section aria-label="Selected watch links">
            <span>{`${scene.selectedAgentId} watch links`}</span>
            <ul aria-label="Selected watch link list">
              {scene.watchEdges.map((edge) => (
                <li key={`${edge.fromAgentId}:${edge.toAgentId}:${edge.watchMode}`}>
                  {`${edge.watchMode} ${labelByAgentId.get(edge.fromAgentId) ?? edge.fromAgentId} -> ${labelByAgentId.get(edge.toAgentId) ?? edge.toAgentId} ${edge.riskLevel}`}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    );
  }
}));

import App, {
  resolveOverviewRefreshWarning,
  resolveSelectedAgent,
  resolveSelectedAgentPeekEvidenceRef,
  resolveViewportToplineStatus
} from './App';
import type { AccountabilityReplayBundle, AgentWorkflow, OfficeAgent, OfficeOperation } from './types';

const DEFAULT_NAVIGATOR_USER_AGENT = window.navigator.userAgent;

function setNavigatorUserAgent(userAgent: string) {
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: userAgent
  });
}

const operationsUrl = '/office/operations?limit=4';
const allOperationsUrl = '/office/operations';
const blockedOperationsUrl = '/office/operations?limit=4&state=blocked';
const orangeOperationsUrl = '/office/operations?limit=4&severity=orange';
const planningOperationsUrl = '/office/operations?limit=4&state=planning';
const reviewingOperationsUrl = '/office/operations?limit=4&state=reviewing';
const selectedOperationUrl = '/office/operations?agent_id=app-engineering';
const teamLeadSelectedOperationUrl = '/office/operations?agent_id=team-lead';
const growthRevenueSelectedOperationUrl = '/office/operations?agent_id=growth-revenue';
const incidentsUrl = '/incidents?limit=200&window=8760h';
const selectedAgentIncidentsUrl = '/agents/app-engineering/incidents?limit=10&window=60m';
const timelineUrl = '/timeline?limit=4&window=60m';
const orangeTimelineUrl = '/timeline?limit=4&window=60m&severity=orange';
const reviewScopedTimelineUrl = '/timeline?limit=4&window=60m&correlation_id=corr-app-review';
const secondaryScopedTimelineUrl = '/timeline?limit=4&window=60m&correlation_id=corr-app-secondary';
const orangeSecondaryScopedTimelineUrl = '/timeline?limit=4&window=60m&severity=orange&correlation_id=corr-app-secondary';
const appEngineeringSelectedTimelineUrl = '/timeline?limit=10&window=60m&agent_id=app-engineering';
const appEngineeringReviewSelectedTimelineUrl =
  '/timeline?limit=10&window=60m&agent_id=app-engineering&correlation_id=corr-app-review';
const orangeAppEngineeringReviewSelectedTimelineUrl =
  '/timeline?limit=10&window=60m&agent_id=app-engineering&severity=orange&correlation_id=corr-app-review';
const appEngineeringReviewSelectedTimelineCheckpointUrl =
  '/timeline?limit=10&window=60m&agent_id=app-engineering&correlation_id=corr-app-review&event_id=evt-memory-replay-anchor';
const orangeAppEngineeringReviewSelectedTimelineCheckpointUrl =
  '/timeline?limit=10&window=60m&agent_id=app-engineering&severity=orange&correlation_id=corr-app-review&event_id=evt-memory-replay-anchor';
const appEngineeringSecondarySelectedTimelineUrl =
  '/timeline?limit=10&window=60m&agent_id=app-engineering&correlation_id=corr-app-secondary';
const orangeAppEngineeringSecondarySelectedTimelineUrl =
  '/timeline?limit=10&window=60m&agent_id=app-engineering&severity=orange&correlation_id=corr-app-secondary';
const teamLeadSelectedTimelineUrl = '/timeline?limit=10&window=60m&agent_id=team-lead';
const orangeTeamLeadSelectedTimelineUrl = '/timeline?limit=10&window=60m&agent_id=team-lead&severity=orange';
const growthRevenueSelectedTimelineUrl = '/timeline?limit=10&window=60m&agent_id=growth-revenue';
const growthRevenueReviewSelectedTimelineUrl =
  '/timeline?limit=10&window=60m&agent_id=growth-revenue&correlation_id=corr-app-review';
const growthRevenueSecondarySelectedTimelineUrl =
  '/timeline?limit=10&window=60m&agent_id=growth-revenue&correlation_id=corr-app-secondary';
const appEngineeringReviewAccountabilityReplayUrl =
  '/accountability/replay?limit=10&window=60m&correlation_id=corr-app-review&agent_id=app-engineering';
const appEngineeringReviewAccountabilityReplayCheckpointUrl =
  '/accountability/replay?limit=10&window=60m&event_id=evt-memory-replay-anchor&correlation_id=corr-app-review&agent_id=app-engineering';
const teamLeadAccountabilityReplayUrl =
  '/accountability/replay?limit=10&window=60m&agent_id=team-lead';
const workflowUrl = '/agents/app-engineering/workflow?limit=10&window=60m';
const teamLeadWorkflowUrl = '/agents/team-lead/workflow?limit=10&window=60m';
const teamLeadIncidentsUrl = '/agents/team-lead/incidents?limit=10&window=60m';
const growthRevenueWorkflowUrl = '/agents/growth-revenue/workflow?limit=10&window=60m';
const appEngineeringSupervisionHistoryUrl = '/peer-watch/alerts?target_agent_id=app-engineering&limit=4';
const appEngineeringScopedReviewSupervisionHistoryUrl =
  '/peer-watch/alerts?target_agent_id=app-engineering&correlation_id=corr-app-review&limit=4';
const orangeAppEngineeringScopedReviewSupervisionHistoryUrl =
  '/peer-watch/alerts?target_agent_id=app-engineering&correlation_id=corr-app-review&severity=orange&limit=4';
const appEngineeringScopedSecondarySupervisionHistoryUrl =
  '/peer-watch/alerts?target_agent_id=app-engineering&correlation_id=corr-app-secondary&limit=4';
const crewOpenSupervisionAlertsUrl = '/peer-watch/alerts?status=open&limit=4';
const orangeCrewOpenSupervisionAlertsUrl = '/peer-watch/alerts?status=open&severity=orange&limit=4';
const teamLeadSupervisionHistoryUrl = '/peer-watch/alerts?target_agent_id=team-lead&limit=4';
const growthRevenueSupervisionHistoryUrl = '/peer-watch/alerts?target_agent_id=growth-revenue&limit=4';
const growthRevenueScopedReviewSupervisionHistoryUrl =
  '/peer-watch/alerts?target_agent_id=growth-revenue&correlation_id=corr-app-review&limit=4';
const orangeGrowthRevenueScopedReviewSupervisionHistoryUrl =
  '/peer-watch/alerts?target_agent_id=growth-revenue&correlation_id=corr-app-review&severity=orange&limit=4';
const growthRevenueScopedSecondarySupervisionHistoryUrl =
  '/peer-watch/alerts?target_agent_id=growth-revenue&correlation_id=corr-app-secondary&limit=4';
const correlationUrl = '/correlations/corr-app-review?limit=10&window=60m';
const secondaryCorrelationUrl = '/correlations/corr-app-secondary?limit=10&window=60m';
const memoryArtifactsUrl = '/memory/artifacts?limit=4&window=60m';
const crewOverviewMissingArtifactExactUrl =
  '/memory/artifacts?limit=4&window=60m&artifact_ref=%2Ftmp%2Fmissing.md';
const crewOverviewEvidenceArtifactExactUrl =
  '/memory/artifacts?limit=4&window=60m&artifact_ref=%2Ftmp%2Fevidence.md';
const crewOverviewSecondaryCorrelationMissingArtifactExactUrl =
  '/memory/artifacts?limit=4&window=60m&correlation_id=corr-app-secondary&artifact_ref=%2Ftmp%2Fmissing.md';
const crewOverviewSecondaryCorrelationEvidenceArtifactExactUrl =
  '/memory/artifacts?limit=4&window=60m&correlation_id=corr-app-secondary&artifact_ref=%2Ftmp%2Fevidence.md';
const crewOverviewSecondMissingArtifactExactUrl =
  '/memory/artifacts?limit=4&window=60m&artifact_ref=%2Ftmp%2Fsecond-missing.md';
const crewOverviewSelectedCorrelationMemoryArtifactsUrl =
  '/memory/artifacts?limit=4&window=60m&correlation_id=corr-app-secondary';
const appEngineeringMemoryArtifactsUrl = '/memory/artifacts?limit=4&window=60m&agent_id=app-engineering';
const growthRevenueMemoryArtifactsUrl = '/memory/artifacts?limit=4&window=60m&agent_id=growth-revenue';
const teamLeadMemoryArtifactsUrl = '/memory/artifacts?limit=4&window=60m&agent_id=team-lead';
const teamLeadSelectedCorrelationMemoryArtifactsUrl =
  '/memory/artifacts?limit=4&window=60m&agent_id=team-lead&correlation_id=corr-app-review';
const teamLeadSelectedSecondaryCorrelationMemoryArtifactsUrl =
  '/memory/artifacts?limit=4&window=60m&agent_id=team-lead&correlation_id=corr-app-secondary';
const growthRevenueSelectedSecondaryCorrelationMemoryArtifactsUrl =
  '/memory/artifacts?limit=4&window=60m&agent_id=growth-revenue&correlation_id=corr-app-secondary';
const growthRevenueSelectedReviewCorrelationMemoryArtifactsUrl =
  '/memory/artifacts?limit=4&window=60m&agent_id=growth-revenue&correlation_id=corr-app-review';
const selectedCorrelationMemoryArtifactsUrl =
  '/memory/artifacts?limit=4&window=60m&agent_id=app-engineering&correlation_id=corr-app-review';
const selectedCorrelationMissingArtifactExactUrl =
  '/memory/artifacts?limit=4&window=60m&agent_id=app-engineering&correlation_id=corr-app-review&artifact_ref=%2Ftmp%2Fmissing.md';
const selectedCorrelationTmuxArtifactExactUrl =
  '/memory/artifacts?limit=4&window=60m&agent_id=app-engineering&correlation_id=corr-app-review&artifact_ref=tmux%3A%2F%2F5-web3-app-engineering%2F0.1';
const collectorSnapshotUrl = '/collectors/controller-snapshot';
const collectorEvidenceCoverageUrl = '/collectors/controller-snapshot/evidence-coverage';

const overviewFixture = {
  generated_at: '2026-03-16T09:00:00.000Z',
  summary: {
    agent_count: 3,
    blocked_count: 1,
    reboot_recommended_count: 1,
    severity_buckets: {
      normal: 1,
      yellow: 1,
      orange: 1,
      red: 0
    }
  },
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
      occupants: []
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
      occupants: []
    }
  ],
  watch_edges: [
    {
      from_agent_id: 'team-lead',
      to_agent_id: 'app-engineering',
      watch_mode: 'lead'
    }
  ],
  agents: [
    {
      agent_id: 'team-lead',
      display_name: 'Team Lead',
      kind: 'lead',
      current_state: 'reviewing',
      active_task: 'Coordinate rollout',
      current_location: 'lead-desk',
      effective_severity: 'normal',
      reported_severity: 'normal',
      severity: 'normal',
      derived_staleness: {
        severity: 'normal',
        stale_for_minutes: 1,
        last_meaningful_output_at: '2026-03-16T08:59:00.000Z'
      },
      reboot_recommended: false
    },
    {
      agent_id: 'app-engineering',
      display_name: 'App Engineering Agent',
      kind: 'employee',
      current_state: 'blocked',
      active_task: 'Fix workflow issue',
      current_location: 'meeting-zone',
      effective_severity: 'orange',
      reported_severity: 'yellow',
      severity: 'yellow',
      derived_staleness: {
        severity: 'orange',
        stale_for_minutes: 22,
        last_meaningful_output_at: '2026-03-16T08:38:00.000Z'
      },
      reboot_recommended: true
    },
    {
      agent_id: 'growth-revenue',
      display_name: 'Growth Revenue Agent',
      kind: 'employee',
      current_state: 'planning',
      active_task: 'Review launch copy',
      current_location: 'meeting-zone',
      effective_severity: 'yellow',
      reported_severity: 'yellow',
      severity: 'yellow',
      derived_staleness: {
        severity: 'yellow',
        stale_for_minutes: 9,
        last_meaningful_output_at: '2026-03-16T08:51:00.000Z'
      },
      reboot_recommended: false
    }
  ]
};

const operationsFixture = {
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
      agent_id: 'app-engineering',
      display_name: 'App Engineering Agent',
      kind: 'employee',
      current_state: 'blocked',
      active_task: 'Fix workflow issue',
      current_blocker: 'Workflow evidence is still incomplete',
      current_location: 'meeting-zone',
      effective_severity: 'orange',
      reported_severity: 'yellow',
      derived_staleness: {
        severity: 'orange',
        stale_for_minutes: 22,
        last_meaningful_output_at: '2026-03-16T08:38:00.000Z'
      },
      reboot_recommended: true,
      last_event_at: '2026-03-16T08:50:00.000Z',
      last_heartbeat_at: '2026-03-16T08:59:30.000Z',
      last_meaningful_output_at: '2026-03-16T08:38:00.000Z',
      correlation_id: 'corr-app-review',
      latest_event: {
        event_id: 'evt-1',
        actor_id: 'team-lead',
        event_type: 'peer_watch_alert_raised',
        ts: '2026-03-16T08:50:00.000Z',
        summary: 'Workflow evidence is still incomplete',
        source_kind: 'controller_event',
        evidence_refs: ['/tmp/evidence.md'],
        counterparty_agent_ids: ['team-lead']
      }
    },
    {
      agent_id: 'team-lead',
      display_name: 'Team Lead',
      kind: 'lead',
      current_state: 'reviewing',
      active_task: 'Coordinate rollout',
      current_blocker: '',
      current_location: 'lead-desk',
      effective_severity: 'normal',
      reported_severity: 'normal',
      derived_staleness: {
        severity: 'normal',
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

const directSelectionOperationFixture = {
  ...operationsFixture,
  summary: {
    ...operationsFixture.summary,
    item_count: 1,
    blocked_count: 0,
    reboot_recommended_count: 0
  },
  items: [
    {
      ...operationsFixture.items[0],
      current_state: 'working',
      current_blocker: '',
      active_task: 'Load current operation snapshot',
      reboot_recommended: false,
      latest_event: {
        event_id: 'evt-direct-selection-1',
        actor_id: 'app-engineering',
        event_type: 'agent_received_task',
        ts: '2026-03-16T08:56:00.000Z',
        summary: 'Controller assigned the direct-selection snapshot task',
        source_kind: 'controller_event',
        evidence_refs: ['/tmp/direct-selection.md'],
        counterparty_agent_ids: []
      }
    }
  ]
};

const teamLeadOperationFixture = {
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
  items: [operationsFixture.items[1]]
};

const blockedOperationsFixture = {
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
  items: [operationsFixture.items[0]]
};

const planningOperationsFixture = {
  generated_at: '2026-03-16T09:00:00.000Z',
  summary: {
    item_count: 1,
    blocked_count: 0,
    reboot_recommended_count: 0,
    state_buckets: {
      planning: 1
    },
    severity_buckets: {
      normal: 0,
      yellow: 1,
      orange: 0,
      red: 0
    }
  },
  items: [
    {
      agent_id: 'growth-revenue',
      display_name: 'Growth Revenue Agent',
      kind: 'employee',
      current_state: 'planning',
      active_task: 'Review launch copy',
      current_blocker: '',
      current_location: 'meeting-zone',
      effective_severity: 'yellow',
      reported_severity: 'yellow',
      derived_staleness: {
        severity: 'yellow',
        stale_for_minutes: 9,
        last_meaningful_output_at: '2026-03-16T08:51:00.000Z'
      },
      reboot_recommended: false,
      last_event_at: '2026-03-16T08:52:00.000Z',
      last_heartbeat_at: '2026-03-16T08:59:00.000Z',
      last_meaningful_output_at: '2026-03-16T08:51:00.000Z',
      correlation_id: 'corr-app-secondary',
      latest_event: {
        event_id: 'evt-growth-planning-1',
        actor_id: 'growth-revenue',
        event_type: 'agent_noted',
        ts: '2026-03-16T08:52:00.000Z',
        summary: 'Growth queued launch copy review',
        source_kind: 'workspace_snapshot',
        evidence_refs: ['/tmp/launch-note.md'],
        counterparty_agent_ids: []
      }
    }
  ]
};

const allOperationsFixture = {
  generated_at: '2026-03-16T09:00:00.000Z',
  summary: {
    item_count: 3,
    blocked_count: 1,
    reboot_recommended_count: 1,
    state_buckets: {
      blocked: 1,
      planning: 1,
      reviewing: 1
    },
    severity_buckets: {
      normal: 1,
      yellow: 1,
      orange: 1,
      red: 0
    }
  },
  items: [...operationsFixture.items, planningOperationsFixture.items[0]]
};

const emptyOperationsFixture = {
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

const incidentFeedFixture = {
  items: [
    {
      incident_id: 'inc-1',
      kind: 'peer_watch',
      ts: '2026-03-16T08:50:00.000Z',
      agent_id: 'app-engineering',
      actor_id: 'team-lead',
      status: 'open',
      severity: 'orange',
      summary: 'Lead is still waiting on workflow evidence',
      correlation_id: 'corr-app-review',
      evidence_refs: ['/tmp/evidence.md'],
      counterparty_agent_ids: ['team-lead'],
      source_kind: 'controller_event'
    },
    {
      incident_id: 'inc-2',
      kind: 'handoff',
      ts: '2026-03-16T08:52:00.000Z',
      agent_id: 'app-engineering',
      actor_id: 'growth-revenue',
      status: 'completed',
      severity: 'yellow',
      summary: 'App engineering finished the secondary review handoff',
      correlation_id: 'corr-app-secondary',
      evidence_refs: ['/tmp/secondary-evidence.md'],
      counterparty_agent_ids: ['growth-revenue'],
      source_kind: 'controller_event'
    }
  ]
};

const timelineFixture = {
  items: [
    {
      event_id: 'evt-timeline-1',
      ts: '2026-03-16T08:50:00.000Z',
      agent_id: 'app-engineering',
      actor_id: 'team-lead',
      event_type: 'peer_watch_alert_raised',
      severity: 'orange',
      current_state: 'blocked',
      location: 'meeting-zone',
      summary: 'Replay captured missing workflow evidence',
      correlation_id: 'corr-app-review',
      counterparty_agent_ids: ['team-lead'],
      evidence_refs: ['/tmp/evidence.md'],
      source_kind: 'controller_event'
    },
    {
      event_id: 'evt-timeline-2',
      ts: '2026-03-16T08:52:00.000Z',
      agent_id: 'growth-revenue',
      actor_id: 'growth-revenue',
      event_type: 'agent_noted',
      severity: 'yellow',
      current_state: 'planning',
      location: 'meeting-zone',
      summary: 'Replay captured launch copy review note',
      correlation_id: null,
      counterparty_agent_ids: [],
      evidence_refs: ['/tmp/launch-note.md'],
      source_kind: 'workspace_snapshot'
    }
  ]
};

const reviewScopedTimelineFixture = {
  items: [timelineFixture.items[0]]
};

const secondaryScopedTimelineFixture = {
  items: [
    {
      event_id: 'evt-timeline-secondary-1',
      ts: '2026-03-16T08:52:00.000Z',
      agent_id: 'growth-revenue',
      actor_id: 'team-lead',
      event_type: 'handoff_completed',
      severity: 'yellow',
      current_state: 'reviewing',
      location: 'meeting-zone',
      summary: 'Replay captured the secondary review handoff',
      correlation_id: 'corr-app-secondary',
      counterparty_agent_ids: ['growth-revenue'],
      evidence_refs: ['/tmp/secondary-evidence.md'],
      source_kind: 'controller_event'
    }
  ]
};

const emptyWorkflowSummaryFixture = {
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
};

const workflowFixture = {
  agent_id: 'app-engineering',
  detail: {
    agent_id: 'app-engineering',
    display_name: 'App Engineering Agent',
    current_state: 'blocked',
    active_task: 'Fix workflow issue',
    current_location: 'meeting-zone',
    latest_heartbeat: {
      agent_id: 'app-engineering',
      received_at: '2026-03-16T08:59:30.000Z'
    },
    open_peer_watch_alerts: [
      {
        alert_id: 'alert-1',
        ts: '2026-03-16T08:50:00.000Z',
        agent_id: 'app-engineering',
        target_agent_id: 'app-engineering',
        actor_id: 'team-lead',
        observer_agent_id: 'team-lead',
        watcher_agent_ids: ['growth-revenue'],
        severity: 'orange',
        status: 'open',
        current_state: 'blocked',
        active_task: 'Fix workflow issue',
        summary: 'Workflow evidence is still incomplete',
        evidence_refs: ['/tmp/evidence.md'],
        evidence_count: 1,
        correlation_id: 'corr-app-review',
        source_kind: 'controller_event',
        metadata: {}
      }
    ],
    recent_events: [
      {
        event_id: 'evt-workflow-1',
        ts: '2026-03-16T08:58:00.000Z',
        agent_id: 'app-engineering',
        actor_id: 'app-engineering',
        agent_role: 'app-engineering',
        event_type: 'agent_noted',
        severity: 'yellow',
        current_state: 'blocked',
        active_task: 'Fix workflow issue',
        location: 'meeting-zone',
        summary: 'Agent attached workflow evidence for lead review',
        correlation_id: 'corr-app-review',
        counterparty_agent_ids: ['team-lead'],
        evidence_refs: ['/tmp/evidence.md'],
        source_kind: 'workspace_snapshot',
        metadata: {}
      }
    ],
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
        evidence_refs: ['/tmp/evidence.md'],
        summary: 'Lead reviewed the missing workflow evidence thread',
        related_event_ids: ['evt-workflow-1']
      }
    ],
    recent_incidents: [],
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
        evidence_refs: ['/tmp/secondary-evidence.md'],
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
        evidence_refs: ['/tmp/reboot-note.md'],
        correlation_id: 'corr-app-review',
        source_kind: 'controller_event'
      }
    ]
  },
  summary: emptyWorkflowSummaryFixture,
  correlation_ids: ['corr-app-review', 'corr-app-secondary'],
  counterparty_agent_ids: ['team-lead'],
  incidents: [],
  interactions: [],
  timeline: []
} satisfies AgentWorkflow;

const teamLeadWorkflowFixture = {
  agent_id: 'team-lead',
  detail: {
    agent_id: 'team-lead',
    display_name: 'Team Lead',
    current_state: 'reviewing',
    active_task: 'Coordinate rollout',
    current_location: 'lead-desk',
    latest_heartbeat: {
      agent_id: 'team-lead',
      received_at: '2026-03-16T08:59:30.000Z'
    },
    open_peer_watch_alerts: [],
    recent_events: [],
    recent_interactions: [],
    recent_incidents: [],
    recent_handoffs: [],
    recent_reboots: []
  },
  summary: emptyWorkflowSummaryFixture,
  correlation_ids: [],
  counterparty_agent_ids: [],
  incidents: [],
  interactions: [],
  timeline: []
} satisfies AgentWorkflow;

const teamLeadReplayWorkflowFixture = {
  ...teamLeadWorkflowFixture,
  timeline: [
    {
      event_id: 'evt-team-lead-replay-1',
      ts: '2026-03-16T08:58:00.000Z',
      agent_id: 'team-lead',
      actor_id: 'team-lead',
      event_type: 'agent_noted',
      severity: 'normal',
      current_state: 'reviewing',
      location: 'lead-desk',
      summary: 'Replay captured lead review checkpoint',
      correlation_id: null,
      counterparty_agent_ids: [],
      evidence_refs: ['/tmp/team-lead-review.md'],
      source_kind: 'workspace_snapshot'
    }
  ]
} satisfies AgentWorkflow;

const growthRevenueWorkflowFixture = {
  agent_id: 'growth-revenue',
  detail: {
    agent_id: 'growth-revenue',
    display_name: 'Growth Revenue Agent',
    current_state: 'planning',
    active_task: 'Review launch copy',
    current_location: 'meeting-zone',
    latest_heartbeat: {
      agent_id: 'growth-revenue',
      received_at: '2026-03-16T08:59:30.000Z'
    },
    open_peer_watch_alerts: [],
    recent_events: [],
    recent_interactions: [],
    recent_incidents: [],
    recent_handoffs: [],
    recent_reboots: []
  },
  summary: emptyWorkflowSummaryFixture,
  correlation_ids: ['corr-growth-lead-review'],
  counterparty_agent_ids: ['team-lead'],
  incidents: [],
  interactions: [],
  timeline: []
} satisfies AgentWorkflow;

const appEngineeringSupervisionHistoryFixture = {
  items: [
    {
      alert_id: 'alert-history-1',
      ts: '2026-03-16T08:47:00.000Z',
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
      evidence_refs: ['/tmp/evidence.md', '/tmp/peer-watch.md'],
      evidence_count: 2,
      correlation_id: 'corr-app-review',
      source_kind: 'controller_event',
      metadata: {
        resolution: 'review_complete'
      }
    }
  ]
};

const emptySupervisionHistoryFixture = {
  items: []
};

const crewOpenSupervisionAlertsFixture = {
  items: [
    {
      alert_id: 'alert-open-growth-revenue',
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
      summary: 'Growth revenue still needs supervision before release review',
      evidence_refs: ['/tmp/revenue-evidence.md'],
      evidence_count: 1,
      correlation_id: 'corr-app-secondary',
      source_kind: 'controller_event',
      metadata: {
        escalation: 'release-review'
      }
    }
  ]
};

const crewOpenSupervisionAlertsNoCorrelationFixture = {
  items: [
    {
      alert_id: 'alert-open-growth-revenue-no-correlation',
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
      summary: 'Growth revenue open supervision alert without a correlation id',
      evidence_refs: ['/tmp/revenue-evidence.md'],
      evidence_count: 1,
      correlation_id: null,
      source_kind: 'controller_event',
      metadata: {
        escalation: 'release-review'
      }
    }
  ]
};

const correlationFixture = {
  correlation_id: 'corr-app-review',
  participant_agent_ids: ['app-engineering', 'team-lead'],
  evidence_refs: ['/tmp/evidence.md', '/tmp/peer-watch.md'],
  first_ts: '2026-03-16T08:49:00.000Z',
  last_ts: '2026-03-16T08:50:00.000Z',
  incident_count: 1,
  interaction_count: 1,
  event_count: 1,
  incidents: [
    {
      incident_id: 'inc-1',
      kind: 'peer_watch',
      ts: '2026-03-16T08:50:00.000Z',
      agent_id: 'app-engineering',
      actor_id: 'team-lead',
      status: 'open',
      severity: 'orange',
      summary: 'Lead is still waiting on workflow evidence',
      correlation_id: 'corr-app-review',
      evidence_refs: ['/tmp/evidence.md'],
      counterparty_agent_ids: ['team-lead'],
      source_kind: 'controller_event'
    }
  ],
  interactions: [
    {
      interaction_id: 'interaction-1',
      interaction_type: 'peer_watch',
      correlation_id: 'corr-app-review',
      started_at: '2026-03-16T08:49:00.000Z',
      ended_at: '2026-03-16T08:50:00.000Z',
      participant_agent_ids: ['app-engineering', 'team-lead'],
      trigger_event_id: 'evt-1',
      before_state: 'coding',
      after_state: 'blocked',
      severity: 'orange',
      evidence_refs: ['/tmp/evidence.md'],
      summary: 'Lead escalated missing workflow evidence',
      related_event_ids: ['evt-1']
    }
  ],
  timeline: [
    {
      event_id: 'evt-1',
      ts: '2026-03-16T08:50:00.000Z',
      agent_id: 'app-engineering',
      actor_id: 'team-lead',
      event_type: 'peer_watch_alert_raised',
      severity: 'orange',
      current_state: 'blocked',
      location: 'meeting-zone',
      summary: 'Workflow evidence is still incomplete',
      correlation_id: 'corr-app-review',
      counterparty_agent_ids: ['team-lead'],
      evidence_refs: ['/tmp/evidence.md'],
      source_kind: 'controller_event'
    }
  ]
};

const correlationIncidentAgentPivotFixture = {
  ...correlationFixture,
  incidents: [
    {
      ...correlationFixture.incidents[0],
      agent_id: 'team-lead'
    }
  ]
};

const correlationTimelineCounterpartyPivotFixture = {
  ...correlationFixture,
  timeline: [
    {
      ...correlationFixture.timeline[0],
      counterparty_agent_ids: ['app-engineering', 'team-lead', 'ghost-agent']
    }
  ]
};

const correlationInteractionParticipantPivotFixture = {
  ...correlationFixture,
  interactions: [
    {
      ...correlationFixture.interactions[0],
      participant_agent_ids: ['app-engineering', 'team-lead', 'ghost-agent']
    }
  ]
};

const secondaryCorrelationFixture = {
  correlation_id: 'corr-app-secondary',
  participant_agent_ids: ['app-engineering', 'growth-revenue'],
  evidence_refs: ['/tmp/secondary-evidence.md'],
  first_ts: '2026-03-16T08:52:00.000Z',
  last_ts: '2026-03-16T08:52:00.000Z',
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
      summary: 'App engineering finished the secondary review handoff',
      correlation_id: 'corr-app-secondary',
      evidence_refs: ['/tmp/secondary-evidence.md'],
      counterparty_agent_ids: ['growth-revenue'],
      source_kind: 'controller_event'
    }
  ],
  interactions: [],
  timeline: [
    {
      event_id: 'evt-2',
      ts: '2026-03-16T08:52:00.000Z',
      agent_id: 'app-engineering',
      actor_id: 'growth-revenue',
      event_type: 'handoff_completed',
      severity: 'yellow',
      current_state: 'coding',
      location: 'meeting-zone',
      summary: 'App engineering finished the secondary review handoff',
      correlation_id: 'corr-app-secondary',
      counterparty_agent_ids: ['growth-revenue'],
      evidence_refs: ['/tmp/secondary-evidence.md'],
      source_kind: 'controller_event'
    }
  ]
};

const memoryArtifactsFixture = {
  generated_at: '2026-03-16T09:00:00.000Z',
  items: [
    {
      artifact_ref: '/tmp/evidence.md',
      artifact_kind: 'evidence_ref',
      file_name: 'evidence.md',
      first_seen_at: '2026-03-16T08:40:00.000Z',
      last_seen_at: '2026-03-16T08:58:00.000Z',
      mention_count: 3,
      agent_ids: ['app-engineering', 'team-lead'],
      correlation_ids: ['corr-app-review'],
      source_kinds: ['controller_event', 'workspace_snapshot'],
      latest_summary: 'Workflow evidence anchor for the lead review trail',
      latest_event_type: 'peer_watch_alert_raised',
      collector_last_modified_at: '2026-03-16T08:58:00.000Z'
    },
    {
      artifact_ref: '/tmp/secondary-evidence.md',
      artifact_kind: 'evidence_ref',
      file_name: 'secondary-evidence.md',
      first_seen_at: '2026-03-16T08:52:00.000Z',
      last_seen_at: '2026-03-16T08:52:00.000Z',
      mention_count: 1,
      agent_ids: ['app-engineering', 'growth-revenue'],
      correlation_ids: ['corr-app-secondary'],
      source_kinds: ['controller_event'],
      latest_summary: 'Secondary review evidence anchor',
      latest_event_type: 'handoff_completed',
      collector_last_modified_at: null
    }
  ]
};

const collectorSnapshotFixture = {
  collected_at: '2026-03-16T09:01:00.000Z',
  actor_id: 'team-lead',
  summary: {
    agent_count: 2,
    heartbeat_count: 2,
    tmux_observed_count: 2,
    workspace_observed_count: 3,
    reboot_recommended_count: 1
  },
  evidence_coverage: {
    evidence_ref_count: 8,
    covered_agent_count: 2,
    low_confidence_agent_ids: ['growth-revenue'],
    source_kind_buckets: {
      workspace_file: 4,
      workspace_root: 2,
      tmux_observation: 2
    },
    agent_items: [
      {
        agent_id: 'app-engineering',
        evidence_ref_count: 5,
        source_kinds: ['tmux_observation', 'workspace_file', 'workspace_root'],
        latest_evidence_at: '2026-03-16T08:59:10.000Z',
        confidence_level: 'high'
      },
      {
        agent_id: 'growth-revenue',
        evidence_ref_count: 3,
        source_kinds: ['tmux_observation', 'workspace_file', 'workspace_root'],
        latest_evidence_at: '2026-03-16T08:58:40.000Z',
        confidence_level: 'medium'
      }
    ]
  },
  items: [
    {
      agent_id: 'app-engineering',
      workspace_root: '/tmp/app-engineering',
      session_ref: '5-web3-app-engineering',
      evidence_refs: ['/tmp/controller-log.md', '/tmp/evidence.md'],
      workspace_observations: [
        {
          path: '/tmp/app-engineering',
          file_name: 'app-engineering',
          kind: 'workspace_root',
          last_modified_at: '2026-03-16T08:59:00.000Z'
        },
        {
          path: '/tmp/app-engineering/todo.md',
          file_name: 'todo.md',
          kind: 'workspace_file',
          last_modified_at: '2026-03-16T08:58:45.000Z'
        }
      ],
      tmux_observations: [
        {
          session_name: 'app-engineering',
          window_index: '1',
          pane_index: '0',
          pane_id: '%1',
          pane_title: 'editor',
          pane_current_command: 'pnpm',
          pane_active: true,
          pane_dead: false,
          pane_activity_at: '2026-03-16T08:59:10.000Z'
        }
      ],
      supervision: {
        watch_target: 'growth-revenue',
        watched_by: ['team-lead', 'growth-revenue'],
        needs_attention: true
      },
      heartbeat: {
        agent_id: 'app-engineering',
        actor_id: 'team-lead',
        received_at: '2026-03-16T08:59:30.000Z',
        current_state: 'blocked',
        active_task: 'Fix workflow issue',
        current_location: 'meeting-zone',
        last_meaningful_output_at: '2026-03-16T08:58:00.000Z',
        last_file_write_at: '2026-03-16T08:58:45.000Z',
        current_blocker: 'Workflow evidence is still incomplete',
        confidence_level: 'high',
        reboot_recommended: true,
        evidence_refs: ['/tmp/evidence.md', '/tmp/controller-log.md']
      }
    },
    {
      agent_id: 'growth-revenue',
      workspace_root: '/tmp/growth-revenue',
      session_ref: '6-web3-growth-revenue',
      evidence_refs: ['/tmp/launch-note.md'],
      workspace_observations: [
        {
          path: '/tmp/growth-revenue',
          file_name: 'growth-revenue',
          kind: 'workspace_root',
          last_modified_at: '2026-03-16T08:58:30.000Z'
        }
      ],
      tmux_observations: [
        {
          session_name: 'growth-revenue',
          window_index: '2',
          pane_index: '0',
          pane_id: '%2',
          pane_title: 'notes',
          pane_current_command: 'nvim',
          pane_active: true,
          pane_dead: false,
          pane_activity_at: '2026-03-16T08:58:40.000Z'
        }
      ],
      supervision: {
        watch_target: null,
        watched_by: ['team-lead'],
        needs_attention: false
      },
      heartbeat: {
        agent_id: 'growth-revenue',
        actor_id: 'growth-revenue',
        received_at: '2026-03-16T08:58:40.000Z',
        current_state: 'planning',
        active_task: 'Review launch copy',
        current_location: 'meeting-zone',
        last_meaningful_output_at: '2026-03-16T08:57:00.000Z',
        last_file_write_at: '2026-03-16T08:58:30.000Z',
        current_blocker: '',
        confidence_level: 'medium',
        reboot_recommended: false,
        evidence_refs: ['/tmp/launch-note.md']
      }
    }
  ]
};

const teamLeadMemoryArtifactsFixture = {
  generated_at: '2026-03-16T09:00:00.000Z',
  items: [
    {
      artifact_ref: '/tmp/team-lead-review.md',
      artifact_kind: 'workspace_file',
      file_name: 'team-lead-review.md',
      first_seen_at: '2026-03-16T08:55:00.000Z',
      last_seen_at: '2026-03-16T08:59:00.000Z',
      mention_count: 2,
      agent_ids: ['team-lead'],
      correlation_ids: [],
      source_kinds: ['workspace_snapshot'],
      latest_summary: 'Team lead review notes stayed local to the agent context',
      latest_event_type: 'agent_noted',
      collector_last_modified_at: '2026-03-16T08:59:00.000Z'
    }
  ]
};

const growthRevenueMemoryArtifactsFixture = {
  generated_at: '2026-03-16T09:00:00.000Z',
  items: [
    {
      artifact_ref: '/tmp/growth-revenue-plan.md',
      artifact_kind: 'workspace_file',
      file_name: 'growth-revenue-plan.md',
      first_seen_at: '2026-03-16T08:54:00.000Z',
      last_seen_at: '2026-03-16T08:58:30.000Z',
      mention_count: 1,
      agent_ids: ['growth-revenue'],
      correlation_ids: [],
      source_kinds: ['workspace_snapshot'],
      latest_summary: 'Growth revenue draft remained on the agent-only path',
      latest_event_type: 'agent_noted',
      collector_last_modified_at: '2026-03-16T08:58:30.000Z'
    }
  ]
};

const teamLeadSelectedCorrelationMemoryArtifactsFixture = {
  generated_at: '2026-03-16T09:00:00.000Z',
  items: [
    {
      artifact_ref: '/tmp/evidence.md',
      artifact_kind: 'evidence_ref',
      file_name: 'evidence.md',
      first_seen_at: '2026-03-16T08:40:00.000Z',
      last_seen_at: '2026-03-16T08:58:00.000Z',
      mention_count: 3,
      agent_ids: ['app-engineering', 'team-lead'],
      correlation_ids: ['corr-app-review'],
      source_kinds: ['controller_event', 'workspace_snapshot'],
      latest_summary: 'Team lead preserved the active review evidence context',
      latest_event_type: 'peer_watch_alert_raised',
      collector_last_modified_at: '2026-03-16T08:58:00.000Z'
    }
  ]
};

const teamLeadSelectedSecondaryCorrelationMemoryArtifactsFixture = {
  generated_at: '2026-03-16T09:00:00.000Z',
  items: [
    {
      artifact_ref: '/tmp/secondary-evidence.md',
      artifact_kind: 'evidence_ref',
      file_name: 'secondary-evidence.md',
      first_seen_at: '2026-03-16T08:52:00.000Z',
      last_seen_at: '2026-03-16T08:52:00.000Z',
      mention_count: 1,
      agent_ids: ['app-engineering', 'team-lead'],
      correlation_ids: ['corr-app-secondary'],
      source_kinds: ['controller_event'],
      latest_summary: 'Team lead preserved the carried secondary workflow correlation',
      latest_event_type: 'handoff_completed',
      collector_last_modified_at: null
    }
  ]
};

const selectedCorrelationMemoryArtifactsFixture = {
  generated_at: '2026-03-16T09:00:00.000Z',
  items: [
    {
      artifact_ref: '/tmp/evidence.md',
      artifact_kind: 'evidence_ref',
      file_name: 'evidence.md',
      first_seen_at: '2026-03-16T08:40:00.000Z',
      last_seen_at: '2026-03-16T08:58:00.000Z',
      mention_count: 3,
      agent_ids: ['app-engineering', 'team-lead'],
      correlation_ids: ['corr-app-review'],
      source_kinds: ['controller_event', 'workspace_snapshot'],
      latest_summary: 'Correlation-scoped evidence trail for the missing workflow review',
      latest_event_type: 'peer_watch_alert_raised',
      collector_last_modified_at: '2026-03-16T08:58:00.000Z'
    }
  ]
};

const growthRevenueSelectedSecondaryCorrelationMemoryArtifactsFixture = {
  generated_at: '2026-03-16T09:00:00.000Z',
  items: [
    {
      artifact_ref: '/tmp/secondary-evidence.md',
      artifact_kind: 'evidence_ref',
      file_name: 'secondary-evidence.md',
      first_seen_at: '2026-03-16T08:52:00.000Z',
      last_seen_at: '2026-03-16T08:52:00.000Z',
      mention_count: 1,
      agent_ids: ['app-engineering', 'growth-revenue'],
      correlation_ids: ['corr-app-secondary'],
      source_kinds: ['controller_event'],
      latest_summary: 'Growth revenue preserved the artifact-selected correlation',
      latest_event_type: 'handoff_completed',
      collector_last_modified_at: null
    }
  ]
};

const growthRevenueSelectedReviewCorrelationMemoryArtifactsFixture = {
  generated_at: '2026-03-16T09:00:00.000Z',
  items: [
    {
      artifact_ref: '/tmp/evidence.md',
      artifact_kind: 'evidence_ref',
      file_name: 'evidence.md',
      first_seen_at: '2026-03-16T08:45:00.000Z',
      last_seen_at: '2026-03-16T08:58:00.000Z',
      mention_count: 2,
      agent_ids: ['app-engineering', 'growth-revenue'],
      correlation_ids: ['corr-app-review'],
      source_kinds: ['controller_event'],
      latest_summary: 'Growth revenue preserved the active crew-overview correlation',
      latest_event_type: 'peer_watch_alert_raised',
      collector_last_modified_at: null
    }
  ]
};

const crewOverviewSelectedCorrelationMemoryArtifactsFixture = {
  generated_at: '2026-03-16T09:00:00.000Z',
  items: [
    {
      artifact_ref: '/tmp/secondary-evidence.md',
      artifact_kind: 'evidence_ref',
      file_name: 'secondary-evidence.md',
      first_seen_at: '2026-03-16T08:52:00.000Z',
      last_seen_at: '2026-03-16T08:52:00.000Z',
      mention_count: 1,
      agent_ids: ['app-engineering', 'growth-revenue'],
      correlation_ids: ['corr-app-secondary'],
      source_kinds: ['controller_event'],
      latest_summary: 'Crew-overview manual correlation memory slice',
      latest_event_type: 'handoff_completed',
      collector_last_modified_at: '2026-03-16T08:52:00.000Z'
    }
  ]
};

function buildAccountabilityReplayFixture(url: string): AccountabilityReplayBundle {
  const parsedUrl = new URL(url, 'http://localhost');
  const agentId = parsedUrl.searchParams.get('agent_id') ?? 'app-engineering';
  const correlationId = parsedUrl.searchParams.get('correlation_id');
  const eventId = parsedUrl.searchParams.get('event_id');
  const evidenceRef = parsedUrl.searchParams.get('evidence_ref');
  const limit = Number(parsedUrl.searchParams.get('limit') ?? '10');
  const windowValue = parsedUrl.searchParams.get('window') ?? '60m';
  const summaryAgent = agentId === 'team-lead' ? 'Team Lead' : 'App Engineering Agent';
  const summary = eventId
    ? `${summaryAgent} accountability checkpoint bundle`
    : `${summaryAgent} accountability replay bundle`;
  const basisEventId = eventId ?? `evt-accountability-${agentId}`;

  return {
    generated_at: '2026-03-16T09:00:00.000Z',
    query: {
      ...(eventId ? { event_id: eventId } : {}),
      ...(evidenceRef ? { evidence_ref: evidenceRef } : {}),
      ...(correlationId ? { correlation_id: correlationId } : {}),
      agent_id: agentId,
      limit,
      window: windowValue
    },
    accountability: {
      basis: 'event_log_and_existing_read_models',
      bounded_by: {
        limit,
        window: windowValue
      },
      event_count: 1,
      interaction_count: 1,
      artifact_count: 1,
      participant_agent_ids: correlationId ? [agentId, 'team-lead'] : [agentId],
      actor_ids: ['team-lead'],
      evidence_refs: ['/tmp/evidence.md'],
      source_kind_buckets: {
        controller_event: 2
      },
      first_ts: '2026-03-16T08:50:00.000Z',
      last_ts: '2026-03-16T08:58:00.000Z'
    },
    ledger: [
      {
        entry_type: 'event',
        entry_id: basisEventId,
        ts: '2026-03-16T08:50:00.000Z',
        basis_event_ids: [basisEventId],
        agent_id: agentId,
        actor_id: 'team-lead',
        source_kind: 'controller_event',
        evidence_refs: ['/tmp/evidence.md'],
        correlation_id: correlationId,
        summary
      }
    ],
    events: [
      {
        event_id: basisEventId,
        ts: '2026-03-16T08:50:00.000Z',
        agent_id: agentId,
        actor_id: 'team-lead',
        event_type: eventId ? 'replay_checkpoint' : 'peer_watch_alert_raised',
        severity: 'orange',
        current_state: agentId === 'team-lead' ? 'reviewing' : 'blocked',
        location: agentId === 'team-lead' ? 'lead-desk' : 'meeting-zone',
        summary,
        correlation_id: correlationId,
        counterparty_agent_ids: correlationId ? ['team-lead'] : [],
        evidence_refs: ['/tmp/evidence.md'],
        source_kind: 'controller_event'
      }
    ],
    interactions: [],
    memory_artifacts: []
  };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' }
  });
}

function resolveSelectedAgentTimelineResponse(url: string) {
  if (!url.startsWith('/timeline?')) {
    return null;
  }

  const parsedUrl = new URL(url, 'http://localhost');
  const agentId = parsedUrl.searchParams.get('agent_id');
  if (!agentId) {
    return null;
  }

  const correlationId = parsedUrl.searchParams.get('correlation_id');
  const severity = parsedUrl.searchParams.get('severity');

  let items = [] as Array<(typeof timelineFixture.items)[number]>;

  if (agentId === 'team-lead') {
    items = teamLeadWorkflowFixture.timeline;
  } else if (agentId === 'app-engineering') {
    if (correlationId === 'corr-app-secondary') {
      items = secondaryCorrelationFixture.timeline.filter((event) => event.agent_id === 'app-engineering');
    } else if (correlationId === 'corr-app-review') {
      items = correlationFixture.timeline.filter((event) => event.agent_id === 'app-engineering');
    } else {
      items = [...correlationFixture.timeline, ...secondaryCorrelationFixture.timeline].filter(
        (event) => event.agent_id === 'app-engineering'
      );
    }
  } else if (agentId === 'growth-revenue') {
    if (correlationId === 'corr-app-review') {
      items = correlationFixture.timeline.filter((event) => event.agent_id === 'growth-revenue');
    } else if (correlationId === 'corr-app-secondary') {
      items = secondaryCorrelationFixture.timeline.filter((event) => event.agent_id === 'growth-revenue');
    } else {
      items = timelineFixture.items.filter((event) => event.agent_id === 'growth-revenue');
    }
  }

  return jsonResponse({
    items: severity ? items.filter((event) => event.severity === severity) : items
  });
}

function resolveDefaultFetchResponse(url: string) {
  if (url === '/office/overview') {
    return jsonResponse(overviewFixture);
  }

  if (url === allOperationsUrl) {
    return jsonResponse(allOperationsFixture);
  }

  if (url === operationsUrl || url === selectedOperationUrl) {
    return jsonResponse(operationsFixture);
  }

  if (url === orangeOperationsUrl) {
    return jsonResponse(blockedOperationsFixture);
  }

  if (url === teamLeadSelectedOperationUrl) {
    return jsonResponse(teamLeadOperationFixture);
  }

  if (url === growthRevenueSelectedOperationUrl) {
    return jsonResponse(emptyOperationsFixture);
  }

  if (url === incidentsUrl) {
    return jsonResponse(incidentFeedFixture);
  }

  if (url === timelineUrl) {
    return jsonResponse(timelineFixture);
  }

  if (url === reviewScopedTimelineUrl) {
    return jsonResponse(reviewScopedTimelineFixture);
  }

  if (url === secondaryScopedTimelineUrl) {
    return jsonResponse(secondaryScopedTimelineFixture);
  }

  const selectedAgentTimelineResponse = resolveSelectedAgentTimelineResponse(url);
  if (selectedAgentTimelineResponse) {
    return selectedAgentTimelineResponse;
  }

  if (url.startsWith('/accountability/replay?')) {
    return jsonResponse(buildAccountabilityReplayFixture(url));
  }

  if (url === workflowUrl) {
    return jsonResponse(workflowFixture);
  }

  if (url === teamLeadWorkflowUrl) {
    return jsonResponse(teamLeadWorkflowFixture);
  }

  if (url === growthRevenueWorkflowUrl) {
    return jsonResponse(growthRevenueWorkflowFixture);
  }

  if (
    url === crewOpenSupervisionAlertsUrl ||
    url === appEngineeringSupervisionHistoryUrl ||
    url === appEngineeringScopedReviewSupervisionHistoryUrl ||
    url === appEngineeringScopedSecondarySupervisionHistoryUrl
  ) {
    return url === crewOpenSupervisionAlertsUrl
      ? jsonResponse(crewOpenSupervisionAlertsFixture)
      : jsonResponse(appEngineeringSupervisionHistoryFixture);
  }

  if (
    url === teamLeadSupervisionHistoryUrl ||
    url === growthRevenueSupervisionHistoryUrl ||
    url === growthRevenueScopedReviewSupervisionHistoryUrl ||
    url === growthRevenueScopedSecondarySupervisionHistoryUrl
  ) {
    return jsonResponse(emptySupervisionHistoryFixture);
  }

  if (url === correlationUrl) {
    return jsonResponse(correlationFixture);
  }

  if (url === secondaryCorrelationUrl) {
    return jsonResponse(secondaryCorrelationFixture);
  }

  if (url === memoryArtifactsUrl) {
    return jsonResponse(memoryArtifactsFixture);
  }

  if (url === crewOverviewSelectedCorrelationMemoryArtifactsUrl) {
    return jsonResponse(crewOverviewSelectedCorrelationMemoryArtifactsFixture);
  }

  if (url === appEngineeringMemoryArtifactsUrl) {
    return jsonResponse(memoryArtifactsFixture);
  }

  if (url === growthRevenueMemoryArtifactsUrl) {
    return jsonResponse(growthRevenueMemoryArtifactsFixture);
  }

  if (url === teamLeadMemoryArtifactsUrl) {
    return jsonResponse(teamLeadMemoryArtifactsFixture);
  }

  if (url === teamLeadSelectedCorrelationMemoryArtifactsUrl) {
    return jsonResponse(teamLeadSelectedCorrelationMemoryArtifactsFixture);
  }

  if (url === teamLeadSelectedSecondaryCorrelationMemoryArtifactsUrl) {
    return jsonResponse(teamLeadSelectedSecondaryCorrelationMemoryArtifactsFixture);
  }

  if (url === selectedCorrelationMemoryArtifactsUrl) {
    return jsonResponse(selectedCorrelationMemoryArtifactsFixture);
  }

  if (url === growthRevenueSelectedSecondaryCorrelationMemoryArtifactsUrl) {
    return jsonResponse(growthRevenueSelectedSecondaryCorrelationMemoryArtifactsFixture);
  }

  if (url === growthRevenueSelectedReviewCorrelationMemoryArtifactsUrl) {
    return jsonResponse(growthRevenueSelectedReviewCorrelationMemoryArtifactsFixture);
  }

  if (url === collectorSnapshotUrl) {
    return jsonResponse({ item: collectorSnapshotFixture });
  }

  if (url === collectorEvidenceCoverageUrl) {
    return jsonResponse({ item: collectorSnapshotFixture.evidence_coverage });
  }

  return null;
}

function resolveTestFetchResponse(url: string) {
  const response = resolveDefaultFetchResponse(url);
  if (response) {
    return response;
  }

  throw new Error(`Unexpected request: ${url}`);
}
async function openHub(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Open Hub' }));
  return screen.findByRole('complementary', { name: 'Agent details' });
}

async function openHudSignals(user: ReturnType<typeof userEvent.setup>) {
  const signals = await screen.findByRole('region', { name: 'Office HUD signals' });
  await user.click(within(signals).getByText('Signals'));
  return signals;
}

async function openSelectedAgentPeekInHub(user: ReturnType<typeof userEvent.setup>, agentName?: string) {
  const inspectPeek = await screen.findByRole('region', { name: 'Selected agent inspect peek' });

  if (agentName) {
    expect(within(inspectPeek).getByText(agentName)).toBeVisible();
  }

  await user.click(within(inspectPeek).getByRole('button', { name: 'Open selected agent in Hub' }));
  return screen.findByRole('complementary', { name: 'Agent details' });
}

async function selectSceneAgentAndOpenHub(
  user: ReturnType<typeof userEvent.setup>,
  agentId: string,
  agentName?: string
) {
  await user.click(await screen.findByRole('button', { name: `Select scene agent ${agentId}` }));
  expect(screen.queryByRole('dialog', { name: 'Hub' })).not.toBeInTheDocument();

  return openSelectedAgentPeekInHub(user, agentName);
}

async function selectSelectedAgentDrilldownTab(
  user: ReturnType<typeof userEvent.setup>,
  name: 'Now' | 'Evidence' | 'Replay / Correlation'
) {
  const tablist = await screen.findByRole('tablist', { name: 'Selected agent drilldown' });
  const tab = within(tablist).getByRole('tab', { name });
  await user.click(tab);
  await waitFor(() => expect(tab).toHaveAttribute('aria-selected', 'true'));
  return screen.getByRole('tabpanel', { name });
}

function getFeedStat(): HTMLElement {
  const feedStat = within(screen.getByLabelText('Office summary')).getByText('Feed').closest('.aitown-shell__stat');
  expect(feedStat).not.toBeNull();
  return feedStat as HTMLElement;
}

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl || url === selectedOperationUrl) {
          return new Response(JSON.stringify(operationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === orangeOperationsUrl) {
          return new Response(JSON.stringify(blockedOperationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === timelineUrl) {
          return new Response(JSON.stringify(timelineFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === reviewScopedTimelineUrl) {
          return new Response(JSON.stringify(reviewScopedTimelineFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === secondaryScopedTimelineUrl) {
          return new Response(JSON.stringify(secondaryScopedTimelineFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          return new Response(JSON.stringify(workflowFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === teamLeadWorkflowUrl) {
          return new Response(JSON.stringify(teamLeadWorkflowFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === growthRevenueWorkflowUrl) {
          return new Response(JSON.stringify(growthRevenueWorkflowFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === correlationUrl) {
          return new Response(JSON.stringify(correlationFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === secondaryCorrelationUrl) {
          return new Response(JSON.stringify(secondaryCorrelationFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );
  });

afterEach(() => {
  vi.useRealTimers();
  delete (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__;
  setNavigatorUserAgent(DEFAULT_NAVIGATOR_USER_AGENT);
  vi.unstubAllGlobals();
});

  it('renders the operator shell as the default frontend', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Metaverse Office' })).toBeVisible();
    expect(screen.getByText('Metaverse Office operator shell')).toBeVisible();
    expect(
      screen.getByText('Operator shell for real-running, supervised, replayable, accountable agents.')
    ).toBeVisible();
    const signals = await screen.findByRole('region', { name: 'Office HUD signals' });
    expect(within(signals).getByText(/Office snapshot · Live/)).toBeVisible();
    expect(screen.getByText('Snapshot 2026-03-16T09:00:00.000Z')).not.toBeVisible();
    await openHudSignals(user);
    expect(screen.getByText('Snapshot 2026-03-16T09:00:00.000Z')).toBeVisible();

    const worldRegion = screen.getByRole('region', { name: 'Office world' });
    expect(worldRegion).toBeVisible();
    expect(within(worldRegion).getByText('Loading world renderer...')).toBeVisible();

    expect(screen.getByRole('button', { name: 'Open Hub' })).toBeVisible();
    expect(screen.queryByRole('complementary', { name: 'Agent details' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Inspect App Engineering Agent' })).not.toBeInTheDocument();
  });

  it('does not auto-request a stale crew correlation that is outside the drilldown window', async () => {
    const user = userEvent.setup();
    const staleCorrelationUrl = '/correlations/corr-stale-crew?limit=10&window=60m';
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url === incidentsUrl) {
        return jsonResponse({
          items: [
            {
              ...incidentFeedFixture.items[0],
              incident_id: 'inc-stale-crew',
              ts: '2026-03-16T06:30:00.000Z',
              correlation_id: 'corr-stale-crew',
            },
          ],
        });
      }

      return resolveTestFetchResponse(url);
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    const details = await openHub(user);
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    expect(details).toBeVisible();
    expect(incidentSection).not.toBeNull();

    await waitFor(() => {
      expect(within(incidentSection!).getByText('Lead is still waiting on workflow evidence')).toBeVisible();
      expect(
        within(incidentSection!).queryByRole('button', { name: 'Open incident correlation corr-stale-crew' })
      ).not.toBeInTheDocument();
      expect(fetchMock.mock.calls.map(([request]) => String(request))).not.toContain(staleCorrelationUrl);
    });
  });

  it('keeps a newer incident-feed crew correlation selectable before overview catches up', async () => {
    const user = userEvent.setup();
    const freshCorrelationUrl = '/correlations/corr-app-review?limit=10&window=60m';
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url === incidentsUrl) {
        return jsonResponse({
          items: [
            {
              ...incidentFeedFixture.items[0],
              incident_id: 'inc-fresh-crew',
              ts: '2026-03-16T09:00:30.000Z',
              correlation_id: 'corr-app-review',
            },
          ],
        });
      }

      return resolveTestFetchResponse(url);
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    const details = await openHub(user);
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(incidentSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(
        within(incidentSection!).getByRole('button', { name: 'Open incident correlation corr-app-review, currently selected' })
      ).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(fetchMock.mock.calls.map(([request]) => String(request))).toContain(freshCorrelationUrl);
    });
  });

  it('drops crew incident correlations once the current poll time ages past the drilldown window', async () => {
    const user = userEvent.setup();
    const staleByNowCorrelationUrl = '/correlations/corr-app-review?limit=10&window=60m';
    const now = Date.now();
    const incidentTs = new Date(now - 90 * 60 * 1000).toISOString();
    const overviewGeneratedAt = new Date(now - 30 * 60 * 1000).toISOString();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url === '/office/overview') {
        return jsonResponse({
          ...overviewFixture,
          generated_at: overviewGeneratedAt,
        });
      }

      if (url === incidentsUrl) {
        return jsonResponse({
          items: [
            {
              ...incidentFeedFixture.items[0],
              incident_id: 'inc-now-stale-crew',
              ts: incidentTs,
              correlation_id: 'corr-app-review',
            },
          ],
        });
      }

      return resolveTestFetchResponse(url);
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    const details = await openHub(user);
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    expect(incidentSection).not.toBeNull();

    await waitFor(() => {
      expect(
        within(incidentSection!).queryByRole('button', { name: 'Open incident correlation corr-app-review' })
      ).not.toBeInTheDocument();
      expect(fetchMock.mock.calls.map(([request]) => String(request))).not.toContain(staleByNowCorrelationUrl);
    });
  });

  it('renders an accessible compact scene status legend for the canvas badge markers', async () => {
    const user = userEvent.setup();
    render(<App />);

    const worldRegion = await screen.findByRole('region', { name: 'Office world' });
    expect(within(worldRegion).getByText('World legend')).toBeVisible();
    expect(within(worldRegion).getByText(/focused signal|badge meanings/)).toBeVisible();
    expect(within(worldRegion).getByText('Badge legend')).not.toBeVisible();

    await user.click(within(worldRegion).getByText('World legend'));

    const legend = within(worldRegion).getByRole('list', { name: 'Scene status legend' });
    const items = within(legend).getAllByRole('listitem');

    expect(legend).toBeVisible();
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('#');
    expect(items[0]).toHaveTextContent('Peer-watch alert count');
    expect(items[1]).toHaveTextContent('!');
    expect(items[1]).toHaveTextContent('Open alerts or workflow incidents');
    expect(items[2]).toHaveTextContent('R');
    expect(items[2]).toHaveTextContent('Reboot recommended');
    expect(items[3]).toHaveTextContent('S');
    expect(items[3]).toHaveTextContent('Runtime freshness degraded');
    expect(within(worldRegion).queryByText('Selected supervision')).not.toBeInTheDocument();
    expect(
      within(worldRegion).getByText(
        'Selected links only. Gold rings mark selected/linked agents; teal halos mark agents participating in the active correlation; arrows run watcher to target; thick links mean lead watch; colors show target severity.'
      )
    ).toBeVisible();
    expect(worldRegion).not.toHaveAttribute('aria-describedby');
  });

  it('focuses hot zones from the scene legend without clearing selected agent, active correlation, or fetch state', async () => {
    const user = userEvent.setup();

    setNavigatorUserAgent('VitestBrowser');
    render(<App />);

    const details = await selectSceneAgentAndOpenHub(user, 'app-engineering', 'App Engineering Agent');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');

    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await user.click(screen.getByRole('button', { name: 'Close Hub' }));
    expect(screen.queryByRole('dialog', { name: 'Hub' })).not.toBeInTheDocument();

    const fetchCallCountBeforeFocus = vi.mocked(globalThis.fetch).mock.calls.length;
    const worldRegion = screen.getByRole('region', { name: 'Office world' });
    await user.click(within(worldRegion).getByText('World legend'));
    const hotZonesLegend = within(worldRegion).getByRole('list', { name: 'Hot zones legend' });

    await user.click(
      within(hotZonesLegend).getByRole('button', {
        name: /Meeting Zone/
      })
    );

    expect(screen.getByTestId('mock-zone-focus-request')).toHaveTextContent('meeting-zone:1');
    expect(screen.getByTestId('mock-scene-selected-agent-id')).toHaveTextContent('app-engineering');
    expect(screen.getByTestId('mock-scene-active-correlation-id')).toHaveTextContent('corr-app-review');
    expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(fetchCallCountBeforeFocus);
  });

  it('routes selected-agent watch links into the scene overlay path without widening scene data', async () => {
    const user = userEvent.setup();

    setNavigatorUserAgent('VitestBrowser');
    render(<App />);

    const selectButton = await screen.findByRole('button', { name: 'Select scene agent app-engineering' });
    await user.click(selectButton);

    const watchLinkList = await screen.findByRole('list', { name: 'Selected watch link list' });
    const items = within(watchLinkList).getAllByRole('listitem');

    expect(screen.getByText('app-engineering watch links')).toBeVisible();
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('lead');
    expect(items[0]).toHaveTextContent('Team Lead');
    expect(items[0]).toHaveTextContent('App Engineering Agent');
    expect(items[0]).toHaveTextContent('orange');
  });

  it('passes the active correlation spotlight ids into the scene model when drilldown data is loaded', async () => {
    const user = userEvent.setup();

    setNavigatorUserAgent('VitestBrowser');
    render(<App />);

    const details = await selectSceneAgentAndOpenHub(user, 'app-engineering', 'App Engineering Agent');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');

    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    expect(screen.getByTestId('mock-scene-active-correlation-id')).toHaveTextContent('corr-app-review');
    expect(screen.getByTestId('mock-scene-correlation-participants')).toHaveTextContent(
      'app-engineering,team-lead'
    );
  });

  it(
    'keeps the active correlation spotlight in the scene after the Hub closes without polling correlations',
    async () => {
      (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 1000;

      const user = userEvent.setup();

      setNavigatorUserAgent('VitestBrowser');
      render(<App />);

      const details = await selectSceneAgentAndOpenHub(user, 'app-engineering', 'App Engineering Agent');
      const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');

      expect(correlationSection).not.toBeNull();

      await waitFor(() => {
        expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      });

      const countCorrelationRequests = () =>
        vi
          .mocked(globalThis.fetch)
          .mock.calls.filter(([input]) => {
            const url = typeof input === 'string' ? input : input.toString();
            return url === correlationUrl;
          }).length;

      expect(screen.getByTestId('mock-scene-active-correlation-id')).toHaveTextContent('corr-app-review');
      expect(screen.getByTestId('mock-scene-correlation-participants')).toHaveTextContent(
        'app-engineering,team-lead'
      );
      expect(screen.getByRole('region', { name: 'Active correlation' })).toBeVisible();

      const correlationRequestsBeforeClose = countCorrelationRequests();
      expect(correlationRequestsBeforeClose).toBeGreaterThan(0);

      await act(async () => {
        screen.getByRole('button', { name: 'Close Hub' }).click();
      });

      expect(screen.queryByRole('dialog', { name: 'Hub' })).not.toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Active correlation' })).not.toBeInTheDocument();
      expect(screen.getByTestId('mock-scene-active-correlation-id')).toHaveTextContent('corr-app-review');
      expect(screen.getByTestId('mock-scene-correlation-participants')).toHaveTextContent(
        'app-engineering,team-lead'
      );

      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 1100));
      });

      expect(countCorrelationRequests()).toBe(correlationRequestsBeforeClose);
    },
    10000
  );

  it('keeps the active correlation when a highlighted scene participant is inspected', async () => {
    const user = userEvent.setup();

    setNavigatorUserAgent('VitestBrowser');
    render(<App />);

    const details = await selectSceneAgentAndOpenHub(user, 'app-engineering', 'App Engineering Agent');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');

    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(screen.getByTestId('mock-scene-correlation-participants')).toHaveTextContent(
        'app-engineering,team-lead'
      );
    });

    await user.click(screen.getByRole('button', { name: 'Select scene agent team-lead' }));

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    expect(screen.getByTestId('mock-scene-active-correlation-id')).toHaveTextContent('corr-app-review');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      teamLeadSelectedCorrelationMemoryArtifactsUrl,
      expect.anything()
    );
  });

  it('preserves the active correlation when a highlighted scene participant is inspected after the Hub closes', async () => {
    const user = userEvent.setup();

    setNavigatorUserAgent('VitestBrowser');
    render(<App />);

    let details = await selectSceneAgentAndOpenHub(user, 'app-engineering', 'App Engineering Agent');
    let correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');

    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(screen.getByTestId('mock-scene-correlation-participants')).toHaveTextContent(
        'app-engineering,team-lead'
      );
    });

    await user.click(screen.getByRole('button', { name: 'Close Hub' }));

    expect(screen.queryByRole('dialog', { name: 'Hub' })).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-scene-active-correlation-id')).toHaveTextContent('corr-app-review');
    expect(screen.getByTestId('mock-scene-correlation-participants')).toHaveTextContent(
      'app-engineering,team-lead'
    );

    await user.click(screen.getByRole('button', { name: 'Select scene agent team-lead' }));
    expect(screen.queryByRole('dialog', { name: 'Hub' })).not.toBeInTheDocument();

    details = await openSelectedAgentPeekInHub(user, 'Team Lead');
    correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');

    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    expect(screen.getByTestId('mock-scene-active-correlation-id')).toHaveTextContent('corr-app-review');
    expect(screen.getByTestId('mock-scene-correlation-participants')).toHaveTextContent(
      'app-engineering,team-lead'
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      teamLeadSelectedCorrelationMemoryArtifactsUrl,
      expect.anything()
    );
  });

  it('replaces the cached scene spotlight when a different correlation is selected', async () => {
    const user = userEvent.setup();

    setNavigatorUserAgent('VitestBrowser');
    render(<App />);

    let details = await selectSceneAgentAndOpenHub(user, 'app-engineering', 'App Engineering Agent');
    let correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');

    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await user.click(screen.getByRole('button', { name: 'Close Hub' }));
    expect(screen.getByTestId('mock-scene-active-correlation-id')).toHaveTextContent('corr-app-review');

    details = await openHub(user);
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');

    expect(incidentSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await user.click(
      within(incidentSection!).getByRole('button', { name: 'Open incident correlation corr-app-secondary' })
    );

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(screen.getByTestId('mock-scene-active-correlation-id')).toHaveTextContent('corr-app-secondary');
      expect(screen.getByTestId('mock-scene-correlation-participants')).toHaveTextContent(
        'app-engineering,growth-revenue'
      );
    });

    await user.click(screen.getByRole('button', { name: 'Close Hub' }));

    expect(screen.queryByRole('dialog', { name: 'Hub' })).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-scene-active-correlation-id')).toHaveTextContent('corr-app-secondary');
    expect(screen.getByTestId('mock-scene-correlation-participants')).toHaveTextContent(
      'app-engineering,growth-revenue'
    );
  });

  it('keeps the selected-agent hub context while resetting the world view', async () => {
    const user = userEvent.setup();

    setNavigatorUserAgent('VitestBrowser');
    render(<App />);

    const details = await selectSceneAgentAndOpenHub(user, 'app-engineering', 'App Engineering Agent');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');

    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await user.click(screen.getByRole('button', { name: 'Reset view' }));

    expect(screen.getByRole('button', { name: 'Hide Hub' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Clear Selection' })).toBeVisible();
    expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
  });

  it('exposes reset-view shortcut metadata and triggers the reset path with or without the Hub open', async () => {
    const user = userEvent.setup();

    setNavigatorUserAgent('VitestBrowser');
    render(<App />);

    const resetSignal = screen.getByTestId('mock-reset-view-signal');
    const toolbarResetButton = await screen.findByRole('button', { name: 'Reset view' });

    expect(toolbarResetButton).toHaveAttribute('aria-keyshortcuts', 'R');
    expect(resetSignal).toHaveTextContent('0');

    await user.keyboard('r');
    expect(resetSignal).toHaveTextContent('1');

    await user.click(screen.getByRole('button', { name: 'Open Hub' }));

    const hubResetButton = await screen.findByRole('button', { name: 'Reset view' });
    expect(hubResetButton).toHaveAttribute('aria-keyshortcuts', 'R');

    await user.keyboard('r');
    expect(resetSignal).toHaveTextContent('2');
    expect(screen.getByRole('dialog', { name: 'Hub' })).toBeVisible();
  });

  it('keeps selected-agent hub context while using the reset-view keyboard shortcut', async () => {
    const user = userEvent.setup();

    setNavigatorUserAgent('VitestBrowser');
    render(<App />);

    const details = await selectSceneAgentAndOpenHub(user, 'app-engineering', 'App Engineering Agent');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');

    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await user.keyboard('r');

    expect(screen.getByTestId('mock-reset-view-signal')).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: 'Hide Hub' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Clear Selection' })).toBeVisible();
    expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
  });

  it('ignores the reset-view keyboard shortcut while focus is inside editable controls', async () => {
    const user = userEvent.setup();

    setNavigatorUserAgent('VitestBrowser');
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Open Hub' }));

    const details = await screen.findByRole('complementary', { name: 'Agent details' });
    const stateFilter = within(details).getByRole('combobox', { name: 'Filter active queue by state' });
    const resetSignal = screen.getByTestId('mock-reset-view-signal');

    stateFilter.focus();
    expect(stateFilter).toHaveFocus();

    await user.keyboard('r');

    expect(resetSignal).toHaveTextContent('0');
    expect(screen.getByRole('dialog', { name: 'Hub' })).toBeVisible();
  });

  it('uses a full-screen scene with a dismissible hub overlay', async () => {
    const user = userEvent.setup();
    render(<App />);

    const hubTrigger = await screen.findByRole('button', { name: 'Open Hub' });
    expect(hubTrigger).toBeVisible();
    expect(screen.queryByRole('complementary', { name: 'Agent details' })).not.toBeInTheDocument();

    const worldRegion = screen.getByRole('region', { name: 'Office world' });
    expect(worldRegion.className).toContain('aitown-panel--game-fullscreen');

    await user.click(hubTrigger);
    expect(await screen.findByRole('dialog', { name: 'Hub' })).toBeVisible();
    expect(await screen.findByRole('complementary', { name: 'Agent details' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Hide Hub' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Close Hub' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Close Hub' }));
    expect(screen.queryByRole('dialog', { name: 'Hub' })).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Agent details' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Hub' })).toBeVisible();
  });

  it('renders the selected-agent Hub focus ribbon only while the selected-agent Hub is open', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    expect(within(details).getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Hub focus ribbon' })).not.toBeInTheDocument();

    await user.click(
      within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' })
    );

    const focusRibbon = await screen.findByRole('region', { name: 'Hub focus ribbon' });
    expect(within(focusRibbon).getByText('App Engineering Agent')).toBeVisible();
    expect(within(focusRibbon).getByText('Orange · blocked')).toBeVisible();
    expect(within(focusRibbon).getByText('Operation · Workflow evidence is still incomplete')).toBeVisible();
    expect(within(focusRibbon).getByText('Correlation · corr-app-review')).toBeVisible();
    expect(within(focusRibbon).getByText('Evidence · /tmp/evidence.md')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Close Hub' }));

    expect(screen.queryByRole('dialog', { name: 'Hub' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Hub focus ribbon' })).not.toBeInTheDocument();
    const inspectPeek = screen.getByRole('region', { name: 'Selected agent inspect peek' });
    expect(within(inspectPeek).getByText('App Engineering Agent')).toBeVisible();

    await user.click(within(inspectPeek).getByRole('button', { name: 'Open selected agent in Hub' }));

    expect(screen.queryByRole('region', { name: 'Selected agent inspect peek' })).not.toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Hub focus ribbon' })).toBeVisible();
  });

  it('selected-agent Hub drilldown tabs expose Now Evidence and Replay Correlation panels', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    expect(within(details).getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    expect(screen.queryByRole('tablist', { name: 'Selected agent drilldown' })).not.toBeInTheDocument();

    const queueSection = within(details).getByRole('heading', { name: 'Active Queue' }).closest('section');
    expect(queueSection).not.toBeNull();
    await user.click(within(queueSection!).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const tablist = await screen.findByRole('tablist', { name: 'Selected agent drilldown' });
    const nowTab = within(tablist).getByRole('tab', { name: 'Now' });
    const evidenceTab = within(tablist).getByRole('tab', { name: 'Evidence' });
    const replayTab = within(tablist).getByRole('tab', { name: 'Replay / Correlation' });

    expect(nowTab).toHaveAttribute('aria-selected', 'true');
    expect(evidenceTab).toHaveAttribute('aria-selected', 'false');
    expect(replayTab).toHaveAttribute('aria-selected', 'false');

    const nowPanel = screen.getByRole('tabpanel', { name: 'Now' });
    expect(within(nowPanel).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    expect(within(nowPanel).getByRole('heading', { name: 'Current Operation' })).toBeVisible();
    const operationSection = within(nowPanel).getByRole('heading', { name: 'Current Operation' }).closest('section');
    expect(operationSection).not.toBeNull();
    expect(within(operationSection!).getByText('blocked · Workflow evidence is still incomplete')).toBeVisible();
    expect(
      within(operationSection!).getByRole('button', { name: /Open operation correlation corr-app-review/ })
    ).toBeVisible();
    expect(
      within(operationSection!).getByRole('button', { name: 'Jump to shared memory artifact /tmp/evidence.md' })
    ).toBeVisible();
    expect(within(nowPanel).getByRole('complementary', { name: 'Agent details' })).toHaveAttribute(
      'data-selected-agent-drilldown-tab',
      'now'
    );

    await user.click(evidenceTab);
    const evidencePanel = screen.getByRole('tabpanel', { name: 'Evidence' });
    expect(evidenceTab).toHaveAttribute('aria-selected', 'true');
    expect(within(evidencePanel).getByRole('complementary', { name: 'Agent details' })).toHaveAttribute(
      'data-selected-agent-drilldown-tab',
      'evidence'
    );
    expect(within(evidencePanel).getByRole('heading', { name: 'Collector Observation' })).toBeVisible();
    expect(within(evidencePanel).getByRole('heading', { name: 'Audit Signals' })).toBeVisible();
    expect(within(evidencePanel).getByRole('heading', { name: 'Workflow' })).toBeVisible();

    await user.click(replayTab);
    const replayPanel = screen.getByRole('tabpanel', { name: 'Replay / Correlation' });
    expect(replayTab).toHaveAttribute('aria-selected', 'true');
    expect(within(replayPanel).getByRole('complementary', { name: 'Agent details' })).toHaveAttribute(
      'data-selected-agent-drilldown-tab',
      'replay'
    );
    expect(within(replayPanel).getByRole('heading', { name: 'Timeline Replay' })).toBeVisible();
    expect(within(replayPanel).getByRole('heading', { name: 'Correlation Drilldown' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Close Hub' }));
    expect(screen.queryByRole('tablist', { name: 'Selected agent drilldown' })).not.toBeInTheDocument();
    const inspectPeek = screen.getByRole('region', { name: 'Selected agent inspect peek' });
    await user.click(within(inspectPeek).getByRole('button', { name: 'Open selected agent in Hub' }));
    expect(await screen.findByRole('tablist', { name: 'Selected agent drilldown' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Now' })).toHaveAttribute('aria-selected', 'true');
  }, 10000);

  it('supports keyboard navigation across selected-agent Hub drilldown tabs', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const queueSection = within(details).getByRole('heading', { name: 'Active Queue' }).closest('section');
    expect(queueSection).not.toBeNull();
    await user.click(within(queueSection!).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const tablist = await screen.findByRole('tablist', { name: 'Selected agent drilldown' });
    const nowTab = within(tablist).getByRole('tab', { name: 'Now' });
    const evidenceTab = within(tablist).getByRole('tab', { name: 'Evidence' });
    const replayTab = within(tablist).getByRole('tab', { name: 'Replay / Correlation' });

    nowTab.focus();
    expect(nowTab).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(evidenceTab).toHaveFocus();
    expect(evidenceTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Evidence' })).toBeVisible();

    await user.keyboard('{End}');
    expect(replayTab).toHaveFocus();
    expect(replayTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Replay / Correlation' })).toBeVisible();

    await user.keyboard('{Home}');
    expect(nowTab).toHaveFocus();
    expect(nowTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Now' })).toBeVisible();
  });

  it('moves focus out of hidden selected-agent drilldown content after a non-focused tab reset', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const queueSection = within(details).getByRole('heading', { name: 'Active Queue' }).closest('section');
    expect(queueSection).not.toBeNull();
    await user.click(within(queueSection!).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const evidencePanel = await selectSelectedAgentDrilldownTab(user, 'Evidence');
    const severityFilter = within(evidencePanel).getByRole('combobox', {
      name: 'Filter supervision history by severity'
    });
    severityFilter.focus();
    expect(severityFilter).toHaveFocus();

    const nowTab = screen.getByRole('tab', { name: 'Now' });
    await act(async () => {
      nowTab.click();
    });

    const currentDetails = screen.getByRole('complementary', { name: 'Agent details' });
    await waitFor(() => expect(nowTab).toHaveAttribute('aria-selected', 'true'));
    await waitFor(() => expect(currentDetails).toHaveAttribute('data-selected-agent-drilldown-tab', 'now'));
    await waitFor(() => expect(severityFilter).not.toHaveFocus());

    const activeElement = document.activeElement;
    expect(activeElement).toBeInstanceOf(HTMLElement);
    expect(currentDetails).toContainElement(activeElement as HTMLElement);
    expect(activeElement as HTMLElement).toBeVisible();
  });

  it('surfaces live focus agents on the world shell and opens a world inspect peek before Hub drilldown', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText('Live Focus')).toBeVisible();
    const liveFocusButton = await screen.findByRole('button', {
      name: 'Inspect live focus agent App Engineering Agent'
    });
    expect(screen.getByText(/need attention right now\./)).toBeVisible();
    expect(
      screen.getByText(
        'Why this matters · App Engineering Agent: stale for 22m; workflow unavailable; reboot recommended; open incident; 1 more focus agent.'
      )
    ).toBeVisible();
    expect(screen.queryByRole('dialog', { name: 'Hub' })).not.toBeInTheDocument();

    expect(liveFocusButton).toBeVisible();

    await user.click(liveFocusButton);

    expect(screen.queryByRole('dialog', { name: 'Hub' })).not.toBeInTheDocument();
    const inspectPeek = await screen.findByRole('region', { name: 'Selected agent inspect peek' });
    await act(async () => {});
    expect(vi.mocked(globalThis.fetch).mock.calls.map(([request]) => String(request))).not.toContain(workflowUrl);
    expect(within(inspectPeek).getByText('App Engineering Agent')).toBeVisible();
    expect(within(inspectPeek).getByText('Orange · blocked')).toBeVisible();

    await user.click(within(inspectPeek).getByRole('button', { name: 'Open selected agent in Hub' }));

    const details = await screen.findByRole('complementary', { name: 'Agent details' });
    expect(screen.getByRole('dialog', { name: 'Hub' })).toBeVisible();
    expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
  });

  it('surfaces evidence coverage focus on the default world shell before Hub opens from the lightweight projection', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      const requestedUrls = vi.mocked(globalThis.fetch).mock.calls.map(([request]) => String(request));
      expect(requestedUrls).toContain(collectorEvidenceCoverageUrl);
      expect(requestedUrls).not.toContain(collectorSnapshotUrl);
    });

    await openHudSignals(user);
    const evidenceFocus = await screen.findByRole('region', { name: 'Evidence coverage focus' });

    expect(within(evidenceFocus).getByText('Evidence')).toBeVisible();
    expect(within(evidenceFocus).getByText('1 low coverage')).toBeVisible();
    expect(within(evidenceFocus).getByText('Coverage below high-confidence/no evidence')).toBeVisible();

    const focusChip = within(evidenceFocus).getByRole('button', {
      name: 'Inspect evidence coverage focus agent Growth Revenue Agent'
    });

    expect(within(evidenceFocus).getByText('Coverage below high-confidence/no evidence')).toBeVisible();
    expect(focusChip).toBeVisible();
    expect(focusChip).toHaveTextContent('Growth Revenue Agent');
    expect(focusChip).toHaveTextContent('ID · growth-revenue');
    expect(focusChip).toHaveTextContent('3 refs · tmux_observation, workspace_file, workspace_root');
    expect(focusChip).toHaveTextContent('Latest evidence · 2026-03-16T08:58:40.000Z');
    expect(screen.queryByRole('dialog', { name: 'Hub' })).not.toBeInTheDocument();
  });

  it('opens the selected agent Evidence tab from an evidence coverage focus chip', async () => {
    const user = userEvent.setup();
    render(<App />);

    await openHudSignals(user);
    const evidenceFocus = await screen.findByRole('region', { name: 'Evidence coverage focus' });
    await user.click(
      within(evidenceFocus).getByRole('button', {
        name: 'Inspect evidence coverage focus agent Growth Revenue Agent'
      })
    );

    const details = await screen.findByRole('complementary', { name: 'Agent details' });
    const evidenceTab = await screen.findByRole('tab', { name: 'Evidence' });

    expect(screen.getByRole('dialog', { name: 'Hub' })).toBeVisible();
    expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await waitFor(() => expect(evidenceTab).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByRole('tabpanel', { name: 'Evidence' })).toBeVisible();
    expect(details).toHaveAttribute('data-selected-agent-drilldown-tab', 'evidence');
  });

  it('omits the evidence coverage focus strip when collector coverage is absent', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url === collectorEvidenceCoverageUrl) {
        return jsonResponse({ item: null });
      }

      return resolveTestFetchResponse(url);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => expect(fetchMock.mock.calls.map(([request]) => String(request))).toContain(collectorEvidenceCoverageUrl));
    expect(screen.queryByRole('region', { name: 'Evidence coverage focus' })).not.toBeInTheDocument();
    expect(screen.queryByText('Coverage below high-confidence/no evidence')).not.toBeInTheDocument();
    expect(screen.queryByText(/No evidence coverage/i)).not.toBeInTheDocument();
  });

  it('omits evidence coverage focus chips for agents missing from the current overview', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url === collectorEvidenceCoverageUrl) {
        return jsonResponse({
          item: {
            ...collectorSnapshotFixture.evidence_coverage,
            low_confidence_agent_ids: ['ghost-agent'],
            agent_items: [
              {
                agent_id: 'ghost-agent',
                evidence_ref_count: 1,
                source_kinds: ['workspace_file'],
                latest_evidence_at: '2026-03-16T08:58:40.000Z',
                confidence_level: 'low'
              }
            ]
          }
        });
      }

      return resolveTestFetchResponse(url);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => expect(fetchMock.mock.calls.map(([request]) => String(request))).toContain(collectorEvidenceCoverageUrl));
    expect(screen.queryByRole('region', { name: 'Evidence coverage focus' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ghost-agent/i })).not.toBeInTheDocument();
  });

  it('uses a later Hub collector snapshot for evidence coverage focus after the default one-shot lacks coverage', async () => {
    const user = userEvent.setup();
    let evidenceCoverageRequestCount = 0;
    let collectorRequestCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url === collectorEvidenceCoverageUrl) {
        evidenceCoverageRequestCount += 1;
        return jsonResponse({ item: null });
      }

      if (url === collectorSnapshotUrl) {
        collectorRequestCount += 1;
        return jsonResponse({ item: collectorSnapshotFixture });
      }

      return resolveTestFetchResponse(url);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => expect(evidenceCoverageRequestCount).toBe(1));
    expect(screen.queryByRole('region', { name: 'Evidence coverage focus' })).not.toBeInTheDocument();

    await openHub(user);
    await waitFor(() => expect(collectorRequestCount).toBeGreaterThanOrEqual(1));
    await user.click(screen.getByRole('button', { name: 'Close Hub' }));

    await openHudSignals(user);
    const evidenceFocus = await screen.findByRole('region', { name: 'Evidence coverage focus' });
    expect(within(evidenceFocus).getByText('Evidence')).toBeVisible();
    expect(within(evidenceFocus).getByText('1 low coverage')).toBeVisible();

    expect(
      within(evidenceFocus).getByRole('button', {
        name: 'Inspect evidence coverage focus agent Growth Revenue Agent'
      })
    ).toBeVisible();
  });

  it('clears cached evidence coverage focus when a later Hub collector read has no snapshot', async () => {
    const user = userEvent.setup();
    let collectorRequestCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url === collectorEvidenceCoverageUrl) {
        return jsonResponse({ item: collectorSnapshotFixture.evidence_coverage });
      }

      if (url === collectorSnapshotUrl) {
        collectorRequestCount += 1;
        return jsonResponse({ item: null });
      }

      return resolveTestFetchResponse(url);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await openHudSignals(user);
    const evidenceFocus = await screen.findByRole('region', { name: 'Evidence coverage focus' });
    expect(within(evidenceFocus).getByText('Evidence')).toBeVisible();
    await openHub(user);
    await screen.findByText('No collector snapshot available yet.');
    await user.click(screen.getByRole('button', { name: 'Close Hub' }));

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Evidence coverage focus' })).not.toBeInTheDocument();
    });
  });

  it('surfaces hot-zone focus chips in the shell topline without changing selection, correlation, or fetch state', async () => {
    const user = userEvent.setup();

    setNavigatorUserAgent('VitestBrowser');
    render(<App />);

    const details = await selectSceneAgentAndOpenHub(user, 'app-engineering', 'App Engineering Agent');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');

    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await user.click(screen.getByRole('button', { name: 'Close Hub' }));
    expect(screen.queryByRole('dialog', { name: 'Hub' })).not.toBeInTheDocument();

    const fetchCallCountBeforeFocus = vi.mocked(globalThis.fetch).mock.calls.length;
    await openHudSignals(user);
    const hotZoneFocusRegion = await screen.findByRole('region', { name: 'Hot zone focus' });

    expect(within(hotZoneFocusRegion).getByText('Zones')).toBeVisible();
    expect(within(hotZoneFocusRegion).getByText('1 hot zone')).toBeVisible();

    const hotZoneFocus = within(hotZoneFocusRegion).getByRole('group', { name: 'Hot zone focus' });
    const hotZoneFocusContainer = hotZoneFocus.closest('.aitown-panel__hot-zone-focus');

    expect(hotZoneFocusContainer).not.toBeNull();
    expect(hotZoneFocus.closest('.aitown-panel__signal-cluster')).not.toBeNull();

    await user.click(
      within(hotZoneFocus).getByRole('button', {
        name: /Meeting Zone .*Orange severity.*Focus in world viewport/
      })
    );

    expect(screen.getByTestId('mock-zone-focus-request')).toHaveTextContent('meeting-zone:1');
    expect(screen.getByTestId('mock-scene-selected-agent-id')).toHaveTextContent('app-engineering');
    expect(screen.getByTestId('mock-scene-active-correlation-id')).toHaveTextContent('corr-app-review');
    expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(fetchCallCountBeforeFocus);
  });

  it('treats Hub as a dialog, closes on Escape, and restores focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<App />);

    const hubTrigger = await screen.findByRole('button', { name: 'Open Hub' });
    hubTrigger.focus();
    expect(hubTrigger).toHaveFocus();

    await user.click(hubTrigger);

    const dialog = await screen.findByRole('dialog', { name: 'Hub' });
    const closeButton = within(dialog).getByRole('button', { name: 'Close Hub' });
    await waitFor(() => {
      expect(closeButton).toHaveFocus();
    });

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Hub' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Open Hub' })).toHaveFocus();
  });

  it('traps Tab navigation inside Hub while it is open', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Open Hub' }));

    const dialog = await screen.findByRole('dialog', { name: 'Hub' });
    const closeButton = within(dialog).getByRole('button', { name: 'Close Hub' });
    const dialogButtons = within(dialog).getAllByRole('button');
    const firstDialogButton = dialogButtons.at(0);
    const lastDialogButton = dialogButtons.at(-1);

    expect(firstDialogButton).toBeDefined();
    expect(lastDialogButton).toBeDefined();
    await waitFor(() => {
      expect(closeButton).toHaveFocus();
    });

    await user.tab({ shift: true });
    expect(firstDialogButton).toHaveFocus();

    await user.tab({ shift: true });
    expect(lastDialogButton).toHaveFocus();

    await user.tab();
    expect(firstDialogButton).toHaveFocus();
  });

  it('loads the active operations queue only when Hub opens in Crew Overview and also refreshes full state buckets', async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole('button', { name: 'Open Hub' });
    expect(globalThis.fetch).not.toHaveBeenCalledWith(operationsUrl, expect.anything());
    expect(globalThis.fetch).not.toHaveBeenCalledWith(allOperationsUrl, expect.anything());

    const details = await openHub(user);
    const activeQueueSection = await waitFor(() => {
      const nextActiveQueueSection = within(details).getByRole('heading', { name: 'Active Queue' }).closest('section');
      expect(nextActiveQueueSection).not.toBeNull();
      return nextActiveQueueSection;
    });

    expect(within(activeQueueSection!).getByText('blocked · Workflow evidence is still incomplete')).toBeVisible();
    expect(within(activeQueueSection!).getByText('reviewing · Coordinate rollout')).toBeVisible();

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(operationsUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(allOperationsUrl, expect.anything());
    });

    await user.click(within(details).getByRole('button', { name: 'Inspect Team Lead' }));
    expect(within(details).queryByRole('heading', { name: 'Active Queue' })).not.toBeInTheDocument();
  });

  it('loads a compact shared-memory queue only when Hub opens in Crew Overview', async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole('button', { name: 'Open Hub' });
    expect(globalThis.fetch).not.toHaveBeenCalledWith(memoryArtifactsUrl, expect.anything());

    const details = await openHub(user);
    const memorySection = await within(details).findByRole('heading', { name: 'Shared Memory' });

    expect(memorySection).toBeVisible();
    expect(within(details).getByText('Workflow evidence anchor for the lead review trail')).toBeVisible();
    expect(within(details).getByText('Ref · /tmp/evidence.md')).toBeVisible();

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(memoryArtifactsUrl, expect.anything());
    });
  });

  it('loads the selected agent operation snapshot for direct active roster selection and preserves the last good snapshot on refresh failure', async () => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 10;

    let selectedOperationRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === selectedOperationUrl) {
          selectedOperationRequests += 1;

          if (selectedOperationRequests === 1) {
            return jsonResponse(directSelectionOperationFixture);
          }

          return new Response(JSON.stringify({ error: 'internal_error', details: 'operations refresh failed' }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const operationSection = (await within(details).findByRole('heading', { name: 'Current Operation' })).closest('section');
    const runContextSection = within(details).getByRole('heading', { name: 'Run Context' }).closest('section');
    expect(operationSection).not.toBeNull();
    expect(runContextSection).not.toBeNull();

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(selectedOperationUrl, expect.anything());
      expect(within(operationSection!).getByText('working · Load current operation snapshot')).toBeVisible();
      expect(
        within(operationSection!).getByText('Latest event · Controller assigned the direct-selection snapshot task')
      ).toBeVisible();
      expect(within(runContextSection!).getByText('Operation snapshot latest event type · agent_received_task')).toBeVisible();
    });

    await waitFor(() => {
      expect(selectedOperationRequests).toBeGreaterThan(1);
      expect(within(details).getByText('Showing last operation snapshot. operations refresh failed')).toBeVisible();
      expect(within(operationSection!).getByText('working · Load current operation snapshot')).toBeVisible();
      expect(within(runContextSection!).getByText('Operation snapshot latest event type · agent_received_task')).toBeVisible();
    });
  });

  it('shows selected-agent Current Operation loading and failure explicitly on the first direct roster read', async () => {
    let resolveSelectedOperationRequest: ((response: Response) => void) | null = null;
    const queueWithoutAppEngineering = {
      ...operationsFixture,
      items: operationsFixture.items.filter((operation) => operation.agent_id !== 'app-engineering')
    };

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === operationsUrl) {
          return Promise.resolve(jsonResponse(queueWithoutAppEngineering));
        }

        if (url === selectedOperationUrl) {
          return new Promise<Response>((resolve) => {
            resolveSelectedOperationRequest = resolve;
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const operationSection = (await within(details).findByRole('heading', { name: 'Current Operation' })).closest('section');
    expect(operationSection).not.toBeNull();

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(selectedOperationUrl, expect.anything());
      expect(within(operationSection!).getByText('Loading current operation...')).toBeVisible();
      expect(within(operationSection!).queryByText(/Unable to load current operation\./)).not.toBeInTheDocument();
      expect(within(details).queryByRole('heading', { name: 'Run Context' })).not.toBeInTheDocument();
    });

    expect(resolveSelectedOperationRequest).not.toBeNull();
    await act(async () => {
      resolveSelectedOperationRequest!(
        new Response(JSON.stringify({ error: 'internal_error', details: 'operations refresh failed' }), {
          status: 500,
          headers: { 'content-type': 'application/json' }
        })
      );
    });

    await waitFor(() => {
      expect(within(operationSection!).getByText('Unable to load current operation. operations refresh failed')).toBeVisible();
      expect(within(operationSection!).queryByText('Loading current operation...')).not.toBeInTheDocument();
      expect(within(details).queryByRole('heading', { name: 'Run Context' })).not.toBeInTheDocument();
    });
  });

  it('keeps direct inactive roster selection without a current operation section', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === growthRevenueSelectedOperationUrl) {
          return jsonResponse(emptyOperationsFixture);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));
    expect(await within(details).findByRole('heading', { name: 'Current Operation' })).toBeVisible();

    await user.click(within(details).getByRole('button', { name: 'Clear' }));
    await user.click(within(details).getByRole('button', { name: 'Inspect Growth Revenue Agent' }));

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      expect(globalThis.fetch).toHaveBeenCalledWith(growthRevenueSelectedOperationUrl, expect.anything());
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(within(details).queryByRole('heading', { name: 'Run Context' })).not.toBeInTheDocument();
    });
  }, 10000);

  it('filters shared memory to a manually selected crew-overview correlation', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(incidentSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    await user.click(within(incidentSection!).getByRole('button', { name: 'Open incident correlation corr-app-secondary' }));

    await waitFor(() => {
      expect(within(memorySection!).getByText('Crew-overview manual correlation memory slice')).toBeVisible();
      expect(
        within(memorySection!).getByRole('button', {
          name: 'Open shared memory correlation corr-app-secondary, currently selected'
        })
      ).toBeVisible();
    });
    expect(within(memorySection!).getByText('Latest event type · handoff_completed')).toBeVisible();
    expect(within(memorySection!).getByText('Source kinds · controller_event')).toBeVisible();
    expect(within(memorySection!).getByText('Collector modified · 2026-03-16T08:52:00.000Z')).toBeVisible();
    expect(
      within(memorySection!).queryByText('Workflow evidence anchor for the lead review trail')
    ).not.toBeInTheDocument();

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        crewOverviewSelectedCorrelationMemoryArtifactsUrl,
        expect.anything()
      );
    });
  });

  it('opens a crew-overview active-queue correlation without selecting an agent', async () => {
    const operationsWithSecondaryCorrelation = {
      ...operationsFixture,
      items: [
        {
          ...operationsFixture.items[0],
          correlation_id: 'corr-app-secondary'
        },
        operationsFixture.items[1]
      ]
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === operationsUrl) {
          return jsonResponse(operationsWithSecondaryCorrelation);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const queueSection = within(details).getByRole('heading', { name: 'Active Queue' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(queueSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await user.click(
      within(queueSection!).getByRole('button', {
        name: 'Open active queue correlation corr-app-secondary'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'App Engineering Agent' })).not.toBeInTheDocument();
      expect(within(details).queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(secondaryCorrelationUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(
        crewOverviewSelectedCorrelationMemoryArtifactsUrl,
        expect.anything()
      );
      expect(globalThis.fetch).not.toHaveBeenCalledWith(workflowUrl, expect.anything());
      expect(globalThis.fetch).not.toHaveBeenCalledWith(selectedOperationUrl, expect.anything());
    });
  });

  it('surfaces an active-correlation queue lane from the existing queue snapshot and preserves that correlation when selecting a lane item', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    expect(incidentSection).not.toBeNull();

    await user.click(
      within(incidentSection!).getByRole('button', {
        name: 'Open incident correlation corr-app-secondary'
      })
    );

    const laneSection = await waitFor(() => {
      const nextLaneSection = within(details).getByRole('heading', { name: 'Active Correlation Queue' }).closest('section');
      expect(nextLaneSection).not.toBeNull();
      expect(within(details).getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'App Engineering Agent' })).not.toBeInTheDocument();
      expect(nextLaneSection).toHaveTextContent(
        'Scope · corr-app-secondary · 2 of 2 participants in current active queue snapshot'
      );
      return nextLaneSection;
    });

    const correlationQueueButton = within(laneSection!).getByRole('button', {
      name: 'Inspect App Engineering Agent from active correlation queue'
    });
    const correlationQueueRecord = correlationQueueButton.closest('li');
    expect(correlationQueueRecord).not.toBeNull();
    expect(correlationQueueRecord).toHaveTextContent('Correlation · corr-app-review');
    expect(
      within(laneSection!).getByRole('button', { name: 'Inspect Growth Revenue Agent from active correlation queue' })
    ).toBeVisible();

    await user.click(correlationQueueButton);

    await waitFor(() => {
      const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      const selectedLaneSection = within(details).getByRole('heading', { name: 'Active Correlation Queue' }).closest('section');
      expect(correlationSection).not.toBeNull();
      expect(selectedLaneSection).not.toBeNull();
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(details).getByRole('heading', { name: 'Current Operation' })).toBeVisible();
      expect(selectedLaneSection).toHaveTextContent(
        'Scope · corr-app-secondary · 2 of 2 participants in current active queue snapshot'
      );
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
    });

    const requestedUrls = vi
      .mocked(globalThis.fetch)
      .mock
      .calls.map(([input]) => (typeof input === 'string' ? input : input.toString()));

    expect(requestedUrls).toContain(secondaryCorrelationUrl);
    expect(requestedUrls).toContain(selectedOperationUrl);
    expect(
      requestedUrls.some((url) => url.startsWith('/office/operations') && url.includes('correlation_id='))
    ).toBe(false);
  });

  it('keeps the active-queue counterparty on the crew-overview agent-only path when no crew-overview correlation is selected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === incidentsUrl) {
          return jsonResponse({
            items: []
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const queueSection = within(details).getByRole('heading', { name: 'Active Queue' }).closest('section');
    const getCorrelationSection = () =>
      within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(queueSection).not.toBeNull();
    expect(getCorrelationSection()).not.toBeNull();

    await waitFor(() => {
      const correlationSection = getCorrelationSection();
      expect(correlationSection).not.toBeNull();
      expect(within(details).getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
      expect(within(correlationSection!).getByText('No correlation selected.')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
    });

    const counterpartyPivot = within(queueSection!).getByRole('button', {
      name: 'Select active queue counterparty agent from operation app-engineering team-lead'
    });
    counterpartyPivot.focus();
    expect(counterpartyPivot).toHaveFocus();

    await user.keyboard('{Enter}');

    await waitFor(() => {
      const correlationSection = getCorrelationSection();
      expect(correlationSection).not.toBeNull();
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(within(correlationSection!).getByText('No correlation selected.')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
      expect(within(correlationSection!).queryByText('corr-app-secondary')).not.toBeInTheDocument();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadMemoryArtifactsUrl, expect.anything());
      expect(globalThis.fetch).not.toHaveBeenCalledWith(correlationUrl, expect.anything());
      expect(globalThis.fetch).not.toHaveBeenCalledWith(secondaryCorrelationUrl, expect.anything());
      expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
      expect(globalThis.fetch).not.toHaveBeenCalledWith(
        teamLeadSelectedSecondaryCorrelationMemoryArtifactsUrl,
        expect.anything()
      );
      expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadSelectedOperationUrl, expect.anything());
      expect(globalThis.fetch).not.toHaveBeenCalledWith(selectedOperationUrl, expect.anything());
    });
  });

  it('preserves the active crew-overview correlation when pivoting through an active-queue counterparty without selecting the current-operation path', async () => {
    const operationsWithSecondaryCorrelation = {
      ...operationsFixture,
      items: [
        {
          ...operationsFixture.items[0],
          correlation_id: 'corr-app-secondary'
        },
        operationsFixture.items[1]
      ]
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === operationsUrl) {
          return jsonResponse(operationsWithSecondaryCorrelation);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const queueSection = within(details).getByRole('heading', { name: 'Active Queue' }).closest('section');
    expect(queueSection).not.toBeNull();

    await user.click(
      within(queueSection!).getByRole('button', {
        name: 'Select active queue counterparty agent from operation app-engineering team-lead'
      })
    );

    await waitFor(() => {
      const activeCorrelationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      const laneSection = within(details).getByRole('heading', { name: 'Active Correlation Queue' }).closest('section');
      expect(activeCorrelationSection).not.toBeNull();
      expect(laneSection).not.toBeNull();
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(laneSection).toHaveTextContent('Scope · corr-app-review · 2 of 2 participants in current active queue snapshot');
      expect(within(activeCorrelationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(activeCorrelationSection!).queryByText('corr-app-secondary')).not.toBeInTheDocument();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(correlationUrl, expect.anything());
      expect(globalThis.fetch).not.toHaveBeenCalledWith(secondaryCorrelationUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(
        teamLeadSelectedCorrelationMemoryArtifactsUrl,
        expect.anything()
      );
      expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadSelectedOperationUrl, expect.anything());
      expect(globalThis.fetch).not.toHaveBeenCalledWith(selectedOperationUrl, expect.anything());
    });
  });

  it('waits for the unfiltered crew snapshot before surfacing the selected-agent active-correlation queue lane', async () => {
    let resolveAllOperations: ((response: Response) => void) | null = null;

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === allOperationsUrl) {
          return new Promise<Response>((resolve) => {
            resolveAllOperations = resolve;
          });
        }

        if (url === operationsUrl) {
          return Promise.resolve(jsonResponse(operationsFixture));
        }

        return Promise.resolve(resolveTestFetchResponse(url));
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const queueSection = within(details).getByRole('heading', { name: 'Active Queue' }).closest('section');
    expect(incidentSection).not.toBeNull();
    expect(queueSection).not.toBeNull();

    await waitFor(() => {
      const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      expect(correlationSection).not.toBeNull();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await user.click(
      within(queueSection!).getByRole('button', {
        name: 'Select active queue counterparty agent from operation app-engineering team-lead'
      })
    );

    await waitFor(() => {
      const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      expect(correlationSection).not.toBeNull();
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Active Correlation Queue' })).not.toBeInTheDocument();
    });

    expect(resolveAllOperations).not.toBeNull();
    await act(async () => {
      resolveAllOperations!(jsonResponse(allOperationsFixture));
    });

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Active Correlation Queue' })).not.toBeInTheDocument();
    });
  });

  it('keeps the active-correlation queue stale warning after pivoting into selected-agent mode', async () => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 10;

    let allOperationsRequests = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === allOperationsUrl) {
          allOperationsRequests += 1;
          if (allOperationsRequests === 1) {
            return jsonResponse(allOperationsFixture);
          }

          return new Response(JSON.stringify({ error: 'internal_error', details: 'queue snapshot failed' }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const queueSection = within(details).getByRole('heading', { name: 'Active Queue' }).closest('section');
    expect(incidentSection).not.toBeNull();
    expect(queueSection).not.toBeNull();

    await waitFor(() => {
      const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      expect(correlationSection).not.toBeNull();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await waitFor(() => {
      const laneSection = within(details).getByRole('heading', { name: 'Active Correlation Queue' }).closest('section');
      expect(laneSection).not.toBeNull();
      expect(laneSection).toHaveTextContent('Scope · corr-app-review · 2 of 2 participants in current active queue snapshot');
    });

    await waitFor(() => {
      expect(allOperationsRequests).toBeGreaterThan(1);
      expect(
        within(details).getByText(
          'Showing last active-correlation queue lane snapshot for corr-app-review. queue snapshot failed'
        )
      ).toBeVisible();
    });

    await user.click(
      within(queueSection!).getByRole('button', {
        name: 'Select active queue counterparty agent from operation app-engineering team-lead'
      })
    );

    await waitFor(() => {
      const laneSection = within(details).getByRole('heading', { name: 'Active Correlation Queue' }).closest('section');
      expect(laneSection).not.toBeNull();
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(
        within(laneSection!).getByText(
          'Showing last active-correlation queue lane snapshot for corr-app-review. queue snapshot failed'
        )
      ).toBeVisible();
    });
  });

  it('keeps the active-queue actor on the crew-overview agent-only path when no crew-overview correlation is selected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === incidentsUrl) {
          return jsonResponse({
            items: []
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const queueSection = within(details).getByRole('heading', { name: 'Active Queue' }).closest('section');
    const getCorrelationSection = () =>
      within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(queueSection).not.toBeNull();
    expect(getCorrelationSection()).not.toBeNull();

    await waitFor(() => {
      const correlationSection = getCorrelationSection();
      expect(correlationSection).not.toBeNull();
      expect(within(details).getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
      expect(within(correlationSection!).getByText('No correlation selected.')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
    });

    const actorPivot = within(queueSection!).getByRole('button', {
      name: 'Select active queue actor from operation app-engineering team-lead'
    });
    actorPivot.focus();
    expect(actorPivot).toHaveFocus();

    await user.keyboard('{Enter}');

    await waitFor(() => {
      const correlationSection = getCorrelationSection();
      expect(correlationSection).not.toBeNull();
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(within(correlationSection!).getByText('No correlation selected.')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
      expect(within(correlationSection!).queryByText('corr-app-secondary')).not.toBeInTheDocument();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadMemoryArtifactsUrl, expect.anything());
      expect(globalThis.fetch).not.toHaveBeenCalledWith(correlationUrl, expect.anything());
      expect(globalThis.fetch).not.toHaveBeenCalledWith(secondaryCorrelationUrl, expect.anything());
      expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
      expect(globalThis.fetch).not.toHaveBeenCalledWith(
        teamLeadSelectedSecondaryCorrelationMemoryArtifactsUrl,
        expect.anything()
      );
      expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadSelectedOperationUrl, expect.anything());
      expect(globalThis.fetch).not.toHaveBeenCalledWith(selectedOperationUrl, expect.anything());
    });
  });

  it('preserves the active crew-overview correlation when pivoting through an active-queue actor without selecting the current-operation path', async () => {
    const operationsWithSecondaryCorrelation = {
      ...operationsFixture,
      items: [
        {
          ...operationsFixture.items[0],
          correlation_id: 'corr-app-secondary'
        },
        operationsFixture.items[1]
      ]
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === operationsUrl) {
          return jsonResponse(operationsWithSecondaryCorrelation);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const queueSection = within(details).getByRole('heading', { name: 'Active Queue' }).closest('section');
    expect(queueSection).not.toBeNull();

    await user.click(
      within(queueSection!).getByRole('button', {
        name: 'Select active queue actor from operation app-engineering team-lead'
      })
    );

    await waitFor(() => {
      const activeCorrelationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      expect(activeCorrelationSection).not.toBeNull();
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(within(activeCorrelationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(activeCorrelationSection!).queryByText('corr-app-secondary')).not.toBeInTheDocument();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(correlationUrl, expect.anything());
      expect(globalThis.fetch).not.toHaveBeenCalledWith(secondaryCorrelationUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(
        teamLeadSelectedCorrelationMemoryArtifactsUrl,
        expect.anything()
      );
      expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadSelectedOperationUrl, expect.anything());
      expect(globalThis.fetch).not.toHaveBeenCalledWith(selectedOperationUrl, expect.anything());
    });
  });

  it('preserves the active crew-overview correlation when pivoting through shared-memory agents', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(memorySection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(
        within(memorySection!).getByRole('button', {
          name: 'Select shared memory agent growth-revenue'
        })
      ).toBeVisible();
    });

    await user.click(
      within(memorySection!).getByRole('button', {
        name: 'Select shared memory agent growth-revenue'
      })
    );

    await waitFor(() => {
      const activeCorrelationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      const activeMemorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');

      expect(activeCorrelationSection).not.toBeNull();
      expect(activeMemorySection).not.toBeNull();
      expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      expect(within(activeCorrelationSection!).getByText('corr-app-review')).toBeVisible();
      expect(
        within(activeMemorySection!).getByText('Growth revenue preserved the active crew-overview correlation')
      ).toBeVisible();
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(growthRevenueWorkflowUrl, expect.anything());
    expect(globalThis.fetch).toHaveBeenCalledWith(correlationUrl, expect.anything());
    expect(globalThis.fetch).toHaveBeenCalledWith(
      growthRevenueSelectedReviewCorrelationMemoryArtifactsUrl,
      expect.anything()
    );
  });

  it('shows selected-agent artifact context with the agent filter when no correlation is active', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect Team Lead' }));

    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(memorySection).not.toBeNull();

    expect(await within(memorySection!).findByText('Team lead review notes stayed local to the agent context')).toBeVisible();
    expect(within(memorySection!).getByText('Request scope · team-lead')).toBeVisible();
    expect(memorySection).toHaveTextContent('Agents · team-lead');
    expect(within(memorySection!).getByText('Correlations · No correlation ids')).toBeVisible();
    expect(within(memorySection!).getByText('Latest event type · agent_noted')).toBeVisible();
    expect(within(memorySection!).getByText('Source kinds · workspace_snapshot')).toBeVisible();
    expect(within(memorySection!).getByText('Collector modified · 2026-03-16T08:59:00.000Z')).toBeVisible();
    expect(
      within(memorySection!).queryByRole('button', {
        name: /Open shared memory correlation/
      })
    ).not.toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadMemoryArtifactsUrl, expect.anything());
  });

  it('prefers correlation-relevant artifact memory after pivoting from a selected correlation into an agent', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await user.click(
      within(correlationSection!).getByRole('button', { name: 'Select correlation participant agent app-engineering' })
    );

    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(memorySection).not.toBeNull();

    expect(await within(memorySection!).findByText('Correlation-scoped evidence trail for the missing workflow review')).toBeVisible();
    expect(within(memorySection!).getByText('Request scope · app-engineering · corr-app-review')).toBeVisible();
    expect(
      within(memorySection!).getByRole('button', {
        name: 'Open shared memory correlation corr-app-review, currently selected'
      })
    ).toBeVisible();
    expect(globalThis.fetch).toHaveBeenCalledWith(selectedCorrelationMemoryArtifactsUrl, expect.anything());
  });

  it('preserves the active correlation when pivoting through shared-memory agents', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(memorySection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(
        within(memorySection!).getByRole('button', {
          name: 'Select shared memory agent team-lead'
        })
      ).toBeVisible();
    });

    await user.click(
      within(memorySection!).getByRole('button', {
        name: 'Select shared memory agent team-lead'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(
        within(memorySection!).getByText('Team lead preserved the active review evidence context')
      ).toBeVisible();
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
    expect(globalThis.fetch).toHaveBeenCalledWith(correlationUrl, expect.anything());
    expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
  });

  it('falls back to the artifact correlation when pivoting from crew overview through shared memory', async () => {
    const crewOverviewWithoutCorrelationIncidentFeedFixture = {
      items: incidentFeedFixture.items.map((incident) => ({
        ...incident,
        correlation_id: null
      }))
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === incidentsUrl) {
          return jsonResponse(crewOverviewWithoutCorrelationIncidentFeedFixture);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(memorySection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    expect(within(correlationSection!).getByText('No correlation selected.')).toBeVisible();

    await user.click(
      within(memorySection!).getByRole('button', {
        name: 'Select shared memory agent growth-revenue'
      })
    );

    await waitFor(() => {
      const activeCorrelationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      const activeMemorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');

      expect(activeCorrelationSection).not.toBeNull();
      expect(activeMemorySection).not.toBeNull();
      expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      expect(within(activeCorrelationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(
        within(activeMemorySection!).getByText('Growth revenue preserved the artifact-selected correlation')
      ).toBeVisible();
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(growthRevenueWorkflowUrl, expect.anything());
    expect(globalThis.fetch).toHaveBeenCalledWith(secondaryCorrelationUrl, expect.anything());
    expect(globalThis.fetch).toHaveBeenCalledWith(
      growthRevenueSelectedSecondaryCorrelationMemoryArtifactsUrl,
      expect.anything()
    );
  });

  it('shows attention queue, watch topology, and enriched incident cards in crew overview', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const attentionSection = within(details).getByRole('heading', { name: 'Attention Queue' }).closest('section');
    const topologySection = within(details).getByRole('heading', { name: 'Watch Topology' }).closest('section');
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');

    expect(attentionSection).not.toBeNull();
    expect(topologySection).not.toBeNull();
    expect(incidentSection).not.toBeNull();

    expect(within(attentionSection!).getByRole('button', { name: 'Inspect App Engineering Agent from attention queue' })).toBeVisible();
    expect(within(attentionSection!).getByRole('button', { name: 'Inspect Growth Revenue Agent from attention queue' })).toBeVisible();
    expect(within(attentionSection!).getByText('Orange · Blocked')).toBeVisible();
    expect(within(attentionSection!).getByText('Yellow · Planning')).toBeVisible();
    expect(within(attentionSection!).getByText('Active task · Fix workflow issue')).toBeVisible();
    expect(within(attentionSection!).getByText('Reboot recommendation · Recommended')).toBeVisible();
    expect(within(attentionSection!).getByText('Active task · Review launch copy')).toBeVisible();
    expect(within(attentionSection!).getByText('Reboot recommendation · No')).toBeVisible();
    expect(
      within(topologySection!).getByRole('button', {
        name: 'Select watch topology source agent from lead edge team-lead app-engineering'
      })
    ).toBeVisible();
    expect(
      within(topologySection!).getByRole('button', {
        name: 'Select watch topology target agent from lead edge team-lead app-engineering'
      })
    ).toBeVisible();
    expect(within(topologySection!).getByText('Mode · lead')).toBeVisible();
    expect(within(topologySection!).getByText('Risk · High risk · Orange')).toBeVisible();
    const overviewIncidentRecord = within(incidentSection!).getByText('Lead is still waiting on workflow evidence').closest('li');
    expect(overviewIncidentRecord).not.toBeNull();
    expect(within(overviewIncidentRecord!).getByText('At · 2026-03-16T08:50:00.000Z')).toBeVisible();
    expect(overviewIncidentRecord!).toHaveTextContent('Actor · team-lead');
    expect(
      within(overviewIncidentRecord!).getByRole('button', {
        name: 'Select incident feed actor from incident inc-1 team-lead'
      })
    ).toBeVisible();
    expect(within(overviewIncidentRecord!).getByText('Incident · peer_watch · open')).toBeVisible();
    expect(within(overviewIncidentRecord!).getByText('Severity · Orange')).toBeVisible();
    expect(overviewIncidentRecord).toHaveTextContent('Counterparties · team-lead');
    expect(
      within(overviewIncidentRecord!).getByRole('button', {
        name: 'Select incident feed counterparty agent from incident inc-1 team-lead'
      })
    ).toBeVisible();
    expect(overviewIncidentRecord).toHaveTextContent('Evidence · /tmp/evidence.md');
    expect(
      within(overviewIncidentRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/evidence.md'
      })
    ).toBeVisible();
    expect(within(overviewIncidentRecord!).getByText('Source · controller_event')).toBeVisible();
    expect(within(incidentSection!).getByRole('button', { name: 'Select incident agent app-engineering from incident inc-1' })).toBeVisible();
    expect(
      within(incidentSection!).getByRole('button', { name: /Open incident correlation corr-app-review/ })
    ).toBeVisible();
  });

  it('pivots from watch topology endpoints through the existing selected-agent path without widening requests', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const topologySection = within(details).getByRole('heading', { name: 'Watch Topology' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(topologySection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(
        within(topologySection!).getByRole('button', {
          name: 'Select watch topology source agent from lead edge team-lead app-engineering'
        })
      ).toBeVisible();
    });

    const fetchCallCountBeforePivot = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(topologySection!).getByRole('button', {
        name: 'Select watch topology source agent from lead edge team-lead app-engineering'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      const nextCorrelationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      expect(nextCorrelationSection).not.toBeNull();
      expect(within(nextCorrelationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(nextCorrelationSection!).getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    });

    const newFetchUrlsAfterPivot = vi
      .mocked(globalThis.fetch)
      .mock.calls.slice(fetchCallCountBeforePivot)
      .map(([input]) => (typeof input === 'string' ? input : input.toString()));

    expect(newFetchUrlsAfterPivot).toContain(teamLeadWorkflowUrl);
    expect(newFetchUrlsAfterPivot).toContain(teamLeadSelectedCorrelationMemoryArtifactsUrl);
    expect(newFetchUrlsAfterPivot).not.toContain(teamLeadIncidentsUrl);
  });

  it('shows collector supervision summary and highest-signal observation items in crew overview', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const collectorSection = within(details).getByRole('heading', { name: 'Collector Supervision' }).closest('section');
    expect(collectorSection).not.toBeNull();

    expect(await within(collectorSection!).findByText('Latest snapshot · 2026-03-16T09:01:00.000Z')).toBeVisible();
    expect(within(collectorSection!).getByText('Heartbeats · 2')).toBeVisible();
    expect(within(collectorSection!).getByText('Workspace observations · 3')).toBeVisible();
    expect(within(collectorSection!).getByText('Tmux observations · 2')).toBeVisible();
    expect(within(collectorSection!).getByText('Reboot flags · 1')).toBeVisible();
    expect(within(collectorSection!).getByText('Evidence coverage · 2/2 agents · 8 refs')).toBeVisible();
    expect(
      within(collectorSection!).getByText('Coverage below high-confidence/no evidence · growth-revenue')
    ).toBeVisible();
    expect(
      within(collectorSection!).getByRole('button', {
        name: 'Select collector supervision agent app-engineering'
      })
    ).toBeVisible();
    expect(within(collectorSection!).getByText('Needs attention · Yes')).toBeVisible();
    const appEngineeringCollectorRecord = within(collectorSection!).getByText('App Engineering Agent').closest('li');
    const growthRevenueCollectorRecord = within(collectorSection!).getByText('Growth Revenue Agent').closest('li');
    expect(appEngineeringCollectorRecord).not.toBeNull();
    expect(growthRevenueCollectorRecord).not.toBeNull();
    expect(appEngineeringCollectorRecord!).toHaveTextContent('Watch target · growth-revenue');
    expect(appEngineeringCollectorRecord!).toHaveTextContent('Watchers · team-lead, growth-revenue');
    expect(appEngineeringCollectorRecord!).toHaveTextContent('Watch graph alignment · Target + watcher mismatch');
    expect(
      within(appEngineeringCollectorRecord!).getByRole('button', {
        name: 'Select collector supervision watch target from collector app-engineering growth-revenue'
      })
    ).toBeVisible();
    expect(
      within(appEngineeringCollectorRecord!).getByRole('button', {
        name: 'Select collector supervision watcher from collector app-engineering team-lead'
      })
    ).toBeVisible();
    expect(
      within(appEngineeringCollectorRecord!).getByRole('button', {
        name: 'Select collector supervision watcher from collector app-engineering growth-revenue'
      })
    ).toBeVisible();
    expect(
      within(growthRevenueCollectorRecord!).getByRole('button', {
        name: 'Select collector supervision watcher from collector growth-revenue team-lead'
      })
    ).toBeVisible();
    expect(growthRevenueCollectorRecord!).toHaveTextContent('Watch target · No watch target');
    expect(growthRevenueCollectorRecord!).toHaveTextContent('Watch graph alignment · Watcher mismatch');
    expect(growthRevenueCollectorRecord!).toHaveTextContent('Coverage status · below high-confidence/no evidence');
    expect(growthRevenueCollectorRecord!).toHaveTextContent(
      'Evidence coverage · 3 refs · tmux_observation, workspace_file, workspace_root'
    );
    expect(collectorSection!).toHaveTextContent('Evidence · /tmp/controller-log.md, /tmp/evidence.md');
    expect(
      within(collectorSection!).getByRole('button', {
        name: 'Jump to collector evidence ref /tmp/evidence.md'
      })
    ).toBeVisible();
    expect(
      within(collectorSection!).getByRole('button', {
        name: 'Jump to collector evidence ref /tmp/controller-log.md'
      })
    ).toBeVisible();
  });

  it('focuses crew-overview collector shared snapshot artifacts through exact shared memory without changing the crew-overview selection', async () => {
    const collectorSnapshotWithSharedArtifact = {
      ...collectorSnapshotFixture,
      shared_artifacts: [
        {
          artifact_ref: '/tmp/missing.md',
          artifact_kind: 'workspace_file',
          file_name: 'missing.md',
          agent_ids: ['app-engineering', 'growth-revenue'],
          agent_count: 2,
          mention_count: 2,
          last_seen_at: '2026-03-16T08:59:10.000Z',
          source_kinds: ['workspace_file', 'tmux_observation']
        }
      ]
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === collectorSnapshotUrl) {
          return jsonResponse({ item: collectorSnapshotWithSharedArtifact });
        }

        if (url === crewOverviewMissingArtifactExactUrl) {
          return jsonResponse({
            generated_at: '2026-03-16T09:00:00.000Z',
            items: [
              {
                artifact_ref: '/tmp/missing.md',
                artifact_kind: 'workspace_file',
                file_name: 'missing.md',
                first_seen_at: '2026-03-16T08:58:30.000Z',
                last_seen_at: '2026-03-16T08:59:10.000Z',
                mention_count: 2,
                agent_ids: ['app-engineering', 'growth-revenue'],
                correlation_ids: [],
                source_kinds: ['collector_snapshot'],
                latest_summary: 'Collector shared snapshot exact fallback stayed on the crew-overview path',
                latest_event_type: 'collector_snapshot_written',
                collector_last_modified_at: '2026-03-16T08:59:10.000Z'
              }
            ]
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const collectorSection = within(details).getByRole('heading', { name: 'Collector Supervision' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(collectorSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(
        within(collectorSection!).getByText('Shared snapshot artifacts · 1 shared artifact in latest collector snapshot')
      ).toBeVisible();
    });

    const sharedArtifactRecord = within(collectorSection!).getByText('Agent count · 2').closest('li');
    expect(sharedArtifactRecord).not.toBeNull();
    expect(sharedArtifactRecord!).toHaveTextContent('Mention count · 2');
    expect(sharedArtifactRecord!).toHaveTextContent('Last seen · 2026-03-16T08:59:10.000Z');
    expect(sharedArtifactRecord!).toHaveTextContent('Source kinds · workspace_file, tmux_observation');
    expect(sharedArtifactRecord!).toHaveTextContent('Participating agents · app-engineering, growth-revenue');
    expect(within(memorySection!).queryByText('Ref · /tmp/missing.md')).not.toBeInTheDocument();

    const fetchCallCountBeforeJump = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(sharedArtifactRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/missing.md'
      })
    );

    await waitFor(() => {
      expect(within(memorySection!).getByText('Ref · /tmp/missing.md')).toBeVisible();
      expect(within(memorySection!).getByText('Focused exact artifact · /tmp/missing.md')).toBeVisible();
      expect(within(memorySection!).getByText('Collector shared snapshot exact fallback stayed on the crew-overview path')).toBeVisible();
      const backlinkLane = within(memorySection!).getByText('Current-scope backlinks').closest('div');
      expect(backlinkLane).not.toBeNull();
      expect(within(backlinkLane!).getByText('Collector shared snapshot')).toBeVisible();
      expect(within(backlinkLane!).getByText('/tmp/missing.md')).toBeVisible();
      expect(within(details).getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    const focusedArtifactRecord = within(memorySection!).getByText('Ref · /tmp/missing.md').closest('li');
    expect(focusedArtifactRecord).not.toBeNull();
    expect(document.activeElement).toBe(focusedArtifactRecord);

    const postJumpRequests = vi
      .mocked(globalThis.fetch)
      .mock.calls.slice(fetchCallCountBeforeJump)
      .map(([input]) => (typeof input === 'string' ? input : input.toString()));

    expect(postJumpRequests).toEqual([crewOverviewMissingArtifactExactUrl]);
  });

  it('preserves the active crew-overview correlation when pivoting through a collector supervision row agent label', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const collectorSection = within(details).getByRole('heading', { name: 'Collector Supervision' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(collectorSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(
        within(collectorSection!).getByRole('button', {
          name: 'Select collector supervision agent app-engineering'
        })
      ).toBeVisible();
    });

    await user.click(
      within(collectorSection!).getByRole('button', {
        name: 'Select collector supervision agent app-engineering'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      const nextCorrelationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      expect(nextCorrelationSection).not.toBeNull();
      expect(within(nextCorrelationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(workflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(correlationUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(selectedCorrelationMemoryArtifactsUrl, expect.anything());
    });
  });

  it('preserves the active crew-overview correlation when pivoting through the collector snapshot actor', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const collectorSection = within(details).getByRole('heading', { name: 'Collector Supervision' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(collectorSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(
        within(collectorSection!).getByRole('button', {
          name: 'Select collector snapshot actor team-lead'
        })
      ).toBeVisible();
    });

    await user.click(
      within(collectorSection!).getByRole('button', {
        name: 'Select collector snapshot actor team-lead'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      const nextCorrelationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      expect(nextCorrelationSection).not.toBeNull();
      expect(within(nextCorrelationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(nextCorrelationSection!).getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(correlationUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
    });
  });

  it('preserves the active crew-overview correlation when pivoting through a collector supervision watch target', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const collectorSection = within(details).getByRole('heading', { name: 'Collector Supervision' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(collectorSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    const appEngineeringCollectorRecord = within(collectorSection!).getByText('App Engineering Agent').closest('li');
    expect(appEngineeringCollectorRecord).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(
        within(appEngineeringCollectorRecord!).getByRole('button', {
          name: 'Select collector supervision watch target from collector app-engineering growth-revenue'
        })
      ).toBeVisible();
    });

    await user.click(
      within(appEngineeringCollectorRecord!).getByRole('button', {
        name: 'Select collector supervision watch target from collector app-engineering growth-revenue'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      const nextCorrelationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      expect(nextCorrelationSection).not.toBeNull();
      expect(within(nextCorrelationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(nextCorrelationSection!).getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(growthRevenueWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(correlationUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(growthRevenueSelectedReviewCorrelationMemoryArtifactsUrl, expect.anything());
    });
  });

  it('preserves the active crew-overview correlation when pivoting through collector supervision watchers', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const collectorSection = within(details).getByRole('heading', { name: 'Collector Supervision' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(collectorSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    const growthRevenueCollectorRecord = within(collectorSection!).getByText('Growth Revenue Agent').closest('li');
    expect(growthRevenueCollectorRecord).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(
        within(growthRevenueCollectorRecord!).getByRole('button', {
          name: 'Select collector supervision watcher from collector growth-revenue team-lead'
        })
      ).toBeVisible();
    });

    await user.click(
      within(growthRevenueCollectorRecord!).getByRole('button', {
        name: 'Select collector supervision watcher from collector growth-revenue team-lead'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      const nextCorrelationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      expect(nextCorrelationSection).not.toBeNull();
      expect(within(nextCorrelationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(nextCorrelationSection!).getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(correlationUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
    });
  });

  it('keeps collector supervision watcher pivots on auto-correlation while crew-overview correlation is still loading', async () => {
    const growthRevenueReviewCorrelationUrl = '/correlations/corr-growth-lead-review?limit=10&window=60m';
    const growthRevenueSelectedGrowthLeadReviewMemoryArtifactsUrl =
      '/memory/artifacts?limit=4&window=60m&agent_id=growth-revenue&correlation_id=corr-growth-lead-review';
    const growthRevenueReviewCorrelationFixture = {
      ...correlationFixture,
      correlation_id: 'corr-growth-lead-review',
      participant_agent_ids: ['growth-revenue', 'team-lead'],
      incidents: correlationFixture.incidents.map((incident) => ({
        ...incident,
        incident_id: 'inc-growth-review',
        agent_id: 'growth-revenue',
        correlation_id: 'corr-growth-lead-review'
      })),
      interactions: correlationFixture.interactions.map((interaction) => ({
        ...interaction,
        interaction_id: 'interaction-growth-review',
        correlation_id: 'corr-growth-lead-review',
        participant_agent_ids: ['growth-revenue', 'team-lead']
      })),
      timeline: correlationFixture.timeline.map((event, index) => ({
        ...event,
        event_id: `evt-growth-review-${index}`,
        agent_id: 'growth-revenue',
        correlation_id: 'corr-growth-lead-review'
      }))
    };
    let releaseIncidentFeed!: (response: Response) => void;
    let delayCrewOverviewIncidentFeed = true;
    const delayedIncidentFeed = new Promise<Response>((resolve) => {
      releaseIncidentFeed = resolve;
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === incidentsUrl && delayCrewOverviewIncidentFeed) {
          delayCrewOverviewIncidentFeed = false;
          return delayedIncidentFeed;
        }

        if (url === growthRevenueReviewCorrelationUrl) {
          return jsonResponse(growthRevenueReviewCorrelationFixture);
        }

        if (url === growthRevenueSelectedGrowthLeadReviewMemoryArtifactsUrl) {
          return jsonResponse(growthRevenueMemoryArtifactsFixture);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const collectorSection = within(details).getByRole('heading', { name: 'Collector Supervision' }).closest('section');
    expect(collectorSection).not.toBeNull();

    const appEngineeringCollectorRecord = within(collectorSection!).getByText('App Engineering Agent').closest('li');
    expect(appEngineeringCollectorRecord).not.toBeNull();

    await waitFor(() => {
      expect(
        within(appEngineeringCollectorRecord!).getByRole('button', {
          name: 'Select collector supervision watcher from collector app-engineering growth-revenue'
        })
      ).toBeVisible();
    });

    await user.click(
      within(appEngineeringCollectorRecord!).getByRole('button', {
        name: 'Select collector supervision watcher from collector app-engineering growth-revenue'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      const nextCorrelationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      expect(nextCorrelationSection).not.toBeNull();
      expect(within(nextCorrelationSection!).getByText('corr-growth-lead-review')).toBeVisible();
      expect(within(nextCorrelationSection!).queryByText('No correlation selected.')).not.toBeInTheDocument();
    });

    await act(async () => {
      releaseIncidentFeed(jsonResponse(incidentFeedFixture));
      await Promise.resolve();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(growthRevenueWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(growthRevenueReviewCorrelationUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(
        growthRevenueSelectedGrowthLeadReviewMemoryArtifactsUrl,
        expect.anything()
      );
    });
  });

  it('keeps collector supervision watcher pivots on auto-correlation when the crew-overview incident feed errors', async () => {
    const growthRevenueReviewCorrelationUrl = '/correlations/corr-growth-lead-review?limit=10&window=60m';
    const growthRevenueSelectedGrowthLeadReviewMemoryArtifactsUrl =
      '/memory/artifacts?limit=4&window=60m&agent_id=growth-revenue&correlation_id=corr-growth-lead-review';
    const growthRevenueReviewCorrelationFixture = {
      ...correlationFixture,
      correlation_id: 'corr-growth-lead-review',
      participant_agent_ids: ['growth-revenue', 'team-lead'],
      incidents: correlationFixture.incidents.map((incident) => ({
        ...incident,
        incident_id: 'inc-growth-review',
        agent_id: 'growth-revenue',
        correlation_id: 'corr-growth-lead-review'
      })),
      interactions: correlationFixture.interactions.map((interaction) => ({
        ...interaction,
        interaction_id: 'interaction-growth-review',
        correlation_id: 'corr-growth-lead-review',
        participant_agent_ids: ['growth-revenue', 'team-lead']
      })),
      timeline: correlationFixture.timeline.map((event, index) => ({
        ...event,
        event_id: `evt-growth-review-${index}`,
        agent_id: 'growth-revenue',
        correlation_id: 'corr-growth-lead-review'
      }))
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === incidentsUrl) {
          return new Response(JSON.stringify({ error: 'internal_error', details: 'incident refresh failed' }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === growthRevenueReviewCorrelationUrl) {
          return jsonResponse(growthRevenueReviewCorrelationFixture);
        }

        if (url === growthRevenueSelectedGrowthLeadReviewMemoryArtifactsUrl) {
          return jsonResponse(growthRevenueMemoryArtifactsFixture);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const collectorSection = within(details).getByRole('heading', { name: 'Collector Supervision' }).closest('section');
    expect(collectorSection).not.toBeNull();
    expect(await within(details).findByText('incident refresh failed')).toBeVisible();

    const appEngineeringCollectorRecord = within(collectorSection!).getByText('App Engineering Agent').closest('li');
    expect(appEngineeringCollectorRecord).not.toBeNull();

    await waitFor(() => {
      expect(
        within(appEngineeringCollectorRecord!).getByRole('button', {
          name: 'Select collector supervision watcher from collector app-engineering growth-revenue'
        })
      ).toBeVisible();
    });

    await user.click(
      within(appEngineeringCollectorRecord!).getByRole('button', {
        name: 'Select collector supervision watcher from collector app-engineering growth-revenue'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      const nextCorrelationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      expect(nextCorrelationSection).not.toBeNull();
      expect(within(nextCorrelationSection!).getByText('corr-growth-lead-review')).toBeVisible();
      expect(within(nextCorrelationSection!).queryByText('No correlation selected.')).not.toBeInTheDocument();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(growthRevenueWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(growthRevenueReviewCorrelationUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(
        growthRevenueSelectedGrowthLeadReviewMemoryArtifactsUrl,
        expect.anything()
      );
    });
  });

  it('keeps crew-overview collector supervision watcher pivots on the existing no-correlation path when no active correlation is selected', async () => {
    const crewOverviewWithoutCorrelationIncidentFeedFixture = {
      items: incidentFeedFixture.items.map((incident) => ({
        ...incident,
        correlation_id: null
      }))
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === incidentsUrl) {
          return jsonResponse(crewOverviewWithoutCorrelationIncidentFeedFixture);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const collectorSection = within(details).getByRole('heading', { name: 'Collector Supervision' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(collectorSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    const appEngineeringCollectorRecord = within(collectorSection!).getByText('App Engineering Agent').closest('li');
    expect(appEngineeringCollectorRecord).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('No correlation selected.')).toBeVisible();
      expect(
        within(appEngineeringCollectorRecord!).getByRole('button', {
          name: 'Select collector supervision watcher from collector app-engineering team-lead'
        })
      ).toBeVisible();
    });

    await user.click(
      within(appEngineeringCollectorRecord!).getByRole('button', {
        name: 'Select collector supervision watcher from collector app-engineering team-lead'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      const nextCorrelationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      expect(nextCorrelationSection).not.toBeNull();
      expect(within(nextCorrelationSection!).getByText('No correlation selected.')).toBeVisible();
      expect(within(nextCorrelationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
      expect(within(nextCorrelationSection!).queryByText('corr-growth-lead-review')).not.toBeInTheDocument();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadMemoryArtifactsUrl, expect.anything());
    });

    expect(globalThis.fetch).not.toHaveBeenCalledWith(correlationUrl, expect.anything());
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
  });

  it('keeps crew-overview collector supervision watch-target pivots on the existing no-correlation path when no active correlation is selected', async () => {
    const crewOverviewWithoutCorrelationIncidentFeedFixture = {
      items: incidentFeedFixture.items.map((incident) => ({
        ...incident,
        correlation_id: null
      }))
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === incidentsUrl) {
          return jsonResponse(crewOverviewWithoutCorrelationIncidentFeedFixture);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const collectorSection = within(details).getByRole('heading', { name: 'Collector Supervision' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(collectorSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    const appEngineeringCollectorRecord = within(collectorSection!).getByText('App Engineering Agent').closest('li');
    expect(appEngineeringCollectorRecord).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('No correlation selected.')).toBeVisible();
      expect(
        within(appEngineeringCollectorRecord!).getByRole('button', {
          name: 'Select collector supervision watch target from collector app-engineering growth-revenue'
        })
      ).toBeVisible();
    });

    await user.click(
      within(appEngineeringCollectorRecord!).getByRole('button', {
        name: 'Select collector supervision watch target from collector app-engineering growth-revenue'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      const nextCorrelationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      expect(nextCorrelationSection).not.toBeNull();
      expect(within(nextCorrelationSection!).getByText('No correlation selected.')).toBeVisible();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(growthRevenueWorkflowUrl, expect.anything());
    });

    expect(globalThis.fetch).not.toHaveBeenCalledWith(correlationUrl, expect.anything());
    expect(globalThis.fetch).not.toHaveBeenCalledWith(growthRevenueSelectedReviewCorrelationMemoryArtifactsUrl, expect.anything());
    expect(globalThis.fetch).toHaveBeenCalledWith(growthRevenueMemoryArtifactsUrl, expect.anything());
  });

  it('keeps the collector snapshot actor pivot on the existing no-correlation path when no active correlation is selected', async () => {
    const crewOverviewWithoutCorrelationIncidentFeedFixture = {
      items: incidentFeedFixture.items.map((incident) => ({
        ...incident,
        correlation_id: null
      }))
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === incidentsUrl) {
          return jsonResponse(crewOverviewWithoutCorrelationIncidentFeedFixture);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const collectorSection = within(details).getByRole('heading', { name: 'Collector Supervision' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(collectorSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('No correlation selected.')).toBeVisible();
      expect(
        within(collectorSection!).getByRole('button', {
          name: 'Select collector snapshot actor team-lead'
        })
      ).toBeVisible();
    });

    await user.click(
      within(collectorSection!).getByRole('button', {
        name: 'Select collector snapshot actor team-lead'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      const nextCorrelationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      expect(nextCorrelationSection).not.toBeNull();
      expect(within(nextCorrelationSection!).getByText('No correlation selected.')).toBeVisible();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
    });

    expect(globalThis.fetch).not.toHaveBeenCalledWith(correlationUrl, expect.anything());
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
    expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadMemoryArtifactsUrl, expect.anything());
  });

  it('keeps crew-overview collector supervision row-agent pivots on the existing no-correlation path when no active correlation is selected', async () => {
    const crewOverviewWithoutCorrelationIncidentFeedFixture = {
      items: incidentFeedFixture.items.map((incident) => ({
        ...incident,
        correlation_id: null
      }))
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === incidentsUrl) {
          return jsonResponse(crewOverviewWithoutCorrelationIncidentFeedFixture);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const collectorSection = within(details).getByRole('heading', { name: 'Collector Supervision' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(collectorSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('No correlation selected.')).toBeVisible();
      expect(
        within(collectorSection!).getByRole('button', {
          name: 'Select collector supervision agent growth-revenue'
        })
      ).toBeVisible();
    });

    await user.click(
      within(collectorSection!).getByRole('button', {
        name: 'Select collector supervision agent growth-revenue'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      const nextCorrelationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      expect(nextCorrelationSection).not.toBeNull();
      expect(within(nextCorrelationSection!).getByText('No correlation selected.')).toBeVisible();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(growthRevenueWorkflowUrl, expect.anything());
    });

    expect(globalThis.fetch).not.toHaveBeenCalledWith(correlationUrl, expect.anything());
    expect(globalThis.fetch).not.toHaveBeenCalledWith(growthRevenueSelectedReviewCorrelationMemoryArtifactsUrl, expect.anything());
    expect(globalThis.fetch).toHaveBeenCalledWith(growthRevenueMemoryArtifactsUrl, expect.anything());
  });

  it('keeps crew-overview collector supervision watcher pivots on the existing no-correlation path when no active correlation is selected', async () => {
    const crewOverviewWithoutCorrelationIncidentFeedFixture = {
      items: incidentFeedFixture.items.map((incident) => ({
        ...incident,
        correlation_id: null
      }))
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === incidentsUrl) {
          return jsonResponse(crewOverviewWithoutCorrelationIncidentFeedFixture);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const collectorSection = within(details).getByRole('heading', { name: 'Collector Supervision' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(collectorSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    const growthRevenueCollectorRecord = within(collectorSection!).getByText('Growth Revenue Agent').closest('li');
    expect(growthRevenueCollectorRecord).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('No correlation selected.')).toBeVisible();
      expect(
        within(growthRevenueCollectorRecord!).getByRole('button', {
          name: 'Select collector supervision watcher from collector growth-revenue team-lead'
        })
      ).toBeVisible();
    });

    await user.click(
      within(growthRevenueCollectorRecord!).getByRole('button', {
        name: 'Select collector supervision watcher from collector growth-revenue team-lead'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      const nextCorrelationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      expect(nextCorrelationSection).not.toBeNull();
      expect(within(nextCorrelationSection!).getByText('No correlation selected.')).toBeVisible();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
    });

    expect(globalThis.fetch).not.toHaveBeenCalledWith(correlationUrl, expect.anything());
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
    expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadMemoryArtifactsUrl, expect.anything());
  });

  it('keeps timeline replay visible after selecting an agent and refetches selected-agent replay from canonical timeline queries when no correlation is active', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === teamLeadWorkflowUrl) {
          return jsonResponse(teamLeadWorkflowFixture);
        }

        if (url === teamLeadSelectedTimelineUrl) {
          return jsonResponse({ items: teamLeadReplayWorkflowFixture.timeline });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole('button', { name: 'Open Hub' });
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadSelectedTimelineUrl, expect.anything());

    const details = await openHub(user);
    const replaySection = (await within(details).findByRole('heading', { name: 'Timeline Replay' })).closest('section');

    expect(replaySection).not.toBeNull();
    expect(within(replaySection!).getByText('Replay captured missing workflow evidence')).toBeVisible();

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(timelineUrl, expect.anything());
    });

    await user.click(within(details).getByRole('button', { name: 'Inspect Team Lead' }));

    const selectedReplaySection = (await within(details).findByRole('heading', { name: 'Timeline Replay' })).closest(
      'section'
    );
    expect(selectedReplaySection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(selectedReplaySection!).getByText('Replay captured lead review checkpoint')).toBeVisible();
      expect(within(selectedReplaySection!).getByText('Request scope · Target agent · team-lead')).toBeVisible();
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
    expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadSelectedTimelineUrl, expect.anything());
  });

  it('shows an explicit empty replay state for selected agents without an active correlation or recent replay events', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect Team Lead' }));

    const replaySection = (await within(details).findByRole('heading', { name: 'Timeline Replay' })).closest('section');
    expect(replaySection).not.toBeNull();
    expect(within(replaySection!).getByText('Request scope · Target agent · team-lead')).toBeVisible();
    expect(within(replaySection!).getByText('No recent replay events.')).toBeVisible();
  });

  it('refetches selected-agent timeline replay with the selected severity filter', async () => {
    const teamLeadSelectedTimelineFixture = {
      items: [
        {
          ...teamLeadReplayWorkflowFixture.timeline[0],
          event_id: 'evt-team-lead-normal-replay',
          severity: 'normal',
          summary: 'Team lead normal replay checkpoint'
        },
        {
          ...teamLeadReplayWorkflowFixture.timeline[0],
          event_id: 'evt-team-lead-orange-replay',
          severity: 'orange',
          summary: 'Team lead orange replay checkpoint'
        }
      ]
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === teamLeadWorkflowUrl) {
          return jsonResponse(teamLeadWorkflowFixture);
        }

        if (url === teamLeadSelectedTimelineUrl) {
          return jsonResponse(teamLeadSelectedTimelineFixture);
        }

        if (url === orangeTeamLeadSelectedTimelineUrl) {
          return jsonResponse({ items: [teamLeadSelectedTimelineFixture.items[1]] });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect Team Lead' }));

    const replaySection = (await within(details).findByRole('heading', { name: 'Timeline Replay' })).closest('section');
    expect(replaySection).not.toBeNull();

    await waitFor(() => {
      expect(within(replaySection!).getByText('Request scope · Target agent · team-lead')).toBeVisible();
      expect(within(replaySection!).getByText('Team lead normal replay checkpoint')).toBeVisible();
      expect(within(replaySection!).getByText('Team lead orange replay checkpoint')).toBeVisible();
    });

    const severityFilter = within(replaySection!).getByRole('combobox', {
      name: 'Filter timeline replay by severity'
    });
    const fetchCallCountBeforeFilter = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.selectOptions(severityFilter, 'orange');

    await waitFor(() => {
      expect(within(replaySection!).getByText('Team lead orange replay checkpoint')).toBeVisible();
      expect(within(replaySection!).queryByText('Team lead normal replay checkpoint')).not.toBeInTheDocument();
      expect(within(replaySection!).queryByText('Scoped replay ·')).not.toBeInTheDocument();
    });

    const postFilterRequests = vi
      .mocked(globalThis.fetch)
      .mock.calls.slice(fetchCallCountBeforeFilter)
      .map(([input]) => (typeof input === 'string' ? input : input.toString()));

    expect(postFilterRequests).toContain(orangeTeamLeadSelectedTimelineUrl);
    expect(postFilterRequests).not.toContain(timelineUrl);
  });

  it('resets selected-agent replay severity when switching to a different agent', async () => {
    const teamLeadSelectedTimelineFixture = {
      items: [
        {
          ...teamLeadReplayWorkflowFixture.timeline[0],
          event_id: 'evt-team-lead-normal-replay',
          severity: 'normal',
          summary: 'Team lead normal replay checkpoint'
        },
        {
          ...teamLeadReplayWorkflowFixture.timeline[0],
          event_id: 'evt-team-lead-orange-replay',
          severity: 'orange',
          summary: 'Team lead orange replay checkpoint'
        }
      ]
    };
    const appEngineeringSelectedTimelineFixture = {
      items: correlationFixture.timeline.filter((event) => event.agent_id === 'app-engineering')
    };
    let resolveAppEngineeringSelectedTimeline: ((response: Response) => void) | null = null;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === teamLeadWorkflowUrl) {
          return jsonResponse(teamLeadWorkflowFixture);
        }

        if (url === teamLeadSelectedTimelineUrl) {
          return jsonResponse(teamLeadSelectedTimelineFixture);
        }

        if (url === orangeTeamLeadSelectedTimelineUrl) {
          return jsonResponse({ items: [teamLeadSelectedTimelineFixture.items[1]] });
        }

        if (url === appEngineeringReviewSelectedTimelineUrl) {
          return new Promise<Response>((resolve) => {
            resolveAppEngineeringSelectedTimeline = resolve;
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect Team Lead' }));

    let replaySection = (await within(details).findByRole('heading', { name: 'Timeline Replay' })).closest('section');
    expect(replaySection).not.toBeNull();

    const severityFilter = within(replaySection!).getByRole('combobox', {
      name: 'Filter timeline replay by severity'
    });

    await user.selectOptions(severityFilter, 'orange');

    await waitFor(() => {
      expect(severityFilter).toHaveValue('orange');
      expect(within(replaySection!).getByText('Team lead orange replay checkpoint')).toBeVisible();
    });

    await user.click(
      within(details).getByRole('button', {
        name: 'Select responsibility chain agent app-engineering'
      })
    );

    replaySection = (await within(details).findByRole('heading', { name: 'Timeline Replay' })).closest('section');
    expect(replaySection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(replaySection!).queryByText('Team lead orange replay checkpoint')).not.toBeInTheDocument();
      expect(within(replaySection!).getByText('Loading scoped timeline replay...')).toBeVisible();
      expect(
        within(replaySection!).getByRole('combobox', {
          name: 'Filter timeline replay by severity'
        })
      ).toHaveValue('');
    });

    expect(resolveAppEngineeringSelectedTimeline).not.toBeNull();
    resolveAppEngineeringSelectedTimeline!(jsonResponse(appEngineeringSelectedTimelineFixture));

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(
        within(replaySection!).getByRole('combobox', {
          name: 'Filter timeline replay by severity'
        })
      ).toHaveValue('');
      expect(within(replaySection!).getByText('Workflow evidence is still incomplete')).toBeVisible();
    });

    await user.click(within(details).getByRole('button', { name: 'Clear' }));
    await user.click(within(details).getByRole('button', { name: 'Inspect Team Lead' }));

    replaySection = (await within(details).findByRole('heading', { name: 'Timeline Replay' })).closest('section');
    expect(replaySection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(
        within(replaySection!).getByRole('combobox', {
          name: 'Filter timeline replay by severity'
        })
      ).toHaveValue('');
      expect(within(replaySection!).getByText('Team lead normal replay checkpoint')).toBeVisible();
      expect(within(replaySection!).getByText('Team lead orange replay checkpoint')).toBeVisible();
    });
  });

  it('keeps selected-agent timeline replay scoped to the active correlation via canonical timeline queries without widening to the crew replay feed', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const incidentSection = (await within(details).findByRole('heading', { name: 'Incident Feed' })).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(incidentSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    const fetchCallCountBeforeSelection = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(incidentSection!).getByRole('button', { name: 'Open incident correlation corr-app-secondary' })
    );

    const replaySection = (await within(details).findByRole('heading', { name: 'Timeline Replay' })).closest('section');
    expect(replaySection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(replaySection!).getByText('Request scope · Target agent · app-engineering · corr-app-secondary')).toBeVisible();
      expect(within(replaySection!).getByText('Scoped replay · corr-app-secondary')).toBeVisible();
      expect(within(replaySection!).getByText('App engineering finished the secondary review handoff')).toBeVisible();
      expect(within(replaySection!).queryByText('Replay captured the secondary review handoff')).not.toBeInTheDocument();
      expect(within(replaySection!).queryByText('Replay captured missing workflow evidence')).not.toBeInTheDocument();
    });

    const postSelectionRequests = vi
      .mocked(globalThis.fetch)
      .mock.calls.slice(fetchCallCountBeforeSelection)
      .map(([input]) => (typeof input === 'string' ? input : input.toString()));

    expect(postSelectionRequests).toContain(secondaryCorrelationUrl);
    expect(postSelectionRequests).toContain(appEngineeringSecondarySelectedTimelineUrl);
    expect(postSelectionRequests).not.toContain(secondaryScopedTimelineUrl);
    expect(postSelectionRequests).not.toContain(timelineUrl);
  });

  it('loads selected-agent accountability replay bundles with bounded read-only GET anchors only after Replay / Correlation is active', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    });

    const requestsBeforeReplayTab = vi
      .mocked(globalThis.fetch)
      .mock.calls.map(([input]) => (typeof input === 'string' ? input : input.toString()));
    expect(requestsBeforeReplayTab).not.toContain(appEngineeringReviewAccountabilityReplayUrl);

    const fetchCallCountBeforeReplayTab = vi.mocked(globalThis.fetch).mock.calls.length;
    const replayPanel = await selectSelectedAgentDrilldownTab(user, 'Replay / Correlation');
    const replayBundleSection = (await within(replayPanel).findByRole('heading', { name: 'Replay Bundle' })).closest(
      'section'
    );
    expect(replayBundleSection).not.toBeNull();

    await waitFor(() => {
      expect(within(replayBundleSection!).getByText('App Engineering Agent accountability replay bundle')).toBeVisible();
      expect(within(replayBundleSection!).getByText('Basis · event_log_and_existing_read_models')).toBeVisible();
      expect(
        within(replayBundleSection!).getByText(
          'bounded_by · limit 10 · window 60m · generated_at 2026-03-16T09:00:00.000Z'
        )
      ).toBeVisible();
      expect(within(replayBundleSection!).getByText('Ledger · 1 entries · derived/read-only')).toBeVisible();
    });

    const postReplayTabRequests = vi
      .mocked(globalThis.fetch)
      .mock.calls.slice(fetchCallCountBeforeReplayTab)
      .map(([input]) => (typeof input === 'string' ? input : input.toString()));
    const accountabilityReplayCalls = vi
      .mocked(globalThis.fetch)
      .mock.calls.filter(([input]) => {
        const url = typeof input === 'string' ? input : input.toString();
        return url.startsWith('/accountability/replay?');
      });

    expect(postReplayTabRequests).toContain(appEngineeringReviewAccountabilityReplayUrl);
    expect(postReplayTabRequests.some((url) => url.includes('/dispatch'))).toBe(false);
    expect(postReplayTabRequests.some((url) => url.includes('/commands'))).toBe(false);
    expect(accountabilityReplayCalls.length).toBeGreaterThan(0);
    expect(
      accountabilityReplayCalls.every(([, init]) => !init || !('method' in init) || init.method === 'GET')
    ).toBe(true);
  });

  it('keys selected-agent accountability replay bundles by selected agent and correlation to avoid stale bundle reuse', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    let replayPanel = await selectSelectedAgentDrilldownTab(user, 'Replay / Correlation');
    let replayBundleSection = (await within(replayPanel).findByRole('heading', { name: 'Replay Bundle' })).closest(
      'section'
    );
    expect(replayBundleSection).not.toBeNull();

    await waitFor(() => {
      expect(within(replayBundleSection!).getByText('App Engineering Agent accountability replay bundle')).toBeVisible();
    });

    await user.click(
      within(replayPanel).getByRole('button', {
        name: 'Select correlation participant agent team-lead'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
    });

    const requestsBeforeTeamReplayTab = vi
      .mocked(globalThis.fetch)
      .mock.calls.map(([input]) => (typeof input === 'string' ? input : input.toString()));
    expect(requestsBeforeTeamReplayTab).not.toContain(teamLeadAccountabilityReplayUrl);

    replayPanel = await selectSelectedAgentDrilldownTab(user, 'Replay / Correlation');
    replayBundleSection = (await within(replayPanel).findByRole('heading', { name: 'Replay Bundle' })).closest(
      'section'
    );
    expect(replayBundleSection).not.toBeNull();

    await waitFor(() => {
      expect(within(replayBundleSection!).getByText('Team Lead accountability replay bundle')).toBeVisible();
      expect(
        within(replayBundleSection!).queryByText('App Engineering Agent accountability replay bundle')
      ).not.toBeInTheDocument();
    });

    const requestedUrls = vi
      .mocked(globalThis.fetch)
      .mock.calls.map(([input]) => (typeof input === 'string' ? input : input.toString()));
    expect(requestedUrls).toContain(appEngineeringReviewAccountabilityReplayUrl);
    expect(requestedUrls).toContain(teamLeadAccountabilityReplayUrl);
  });

  it('opens a replay checkpoint event from shared memory without changing the selected agent or correlation', async () => {
    const replayCheckpointMemoryArtifacts = {
      ...selectedCorrelationMemoryArtifactsFixture,
      items: [
        {
          ...selectedCorrelationMemoryArtifactsFixture.items[0],
          latest_event_id: 'evt-memory-replay-anchor',
          latest_event_type: 'peer_watch_alert_raised',
          replay_checkpoint: {
            event_id: 'evt-memory-replay-anchor',
            event_type: 'peer_watch_alert_raised',
            summary: 'Workflow evidence checkpoint',
            last_seen_at: '2026-03-16T08:58:00.000Z'
          }
        }
      ]
    };
    const exactReplayFixture = {
      items: [
        {
          ...correlationFixture.timeline[0],
          event_id: 'evt-memory-replay-anchor',
          summary: 'Replay checkpoint exact event opened'
        }
      ]
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === selectedCorrelationMemoryArtifactsUrl) {
          return jsonResponse(replayCheckpointMemoryArtifacts);
        }

        if (url === orangeAppEngineeringReviewSelectedTimelineUrl) {
          return jsonResponse({ items: [] });
        }

        if (url === appEngineeringReviewSelectedTimelineCheckpointUrl) {
          return jsonResponse(exactReplayFixture);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));
    await selectSelectedAgentDrilldownTab(user, 'Replay / Correlation');

    const replayPanelBeforeCheckpoint = screen.getByRole('tabpanel', { name: 'Replay / Correlation' });
    const replaySectionBeforeCheckpoint = within(replayPanelBeforeCheckpoint)
      .getByRole('heading', { name: 'Timeline Replay' })
      .closest('section');
    expect(replaySectionBeforeCheckpoint).not.toBeNull();

    const severityFilterBeforeCheckpoint = within(replaySectionBeforeCheckpoint!).getByRole('combobox', {
      name: 'Filter timeline replay by severity'
    });
    await user.selectOptions(severityFilterBeforeCheckpoint, 'orange');

    await waitFor(() => {
      expect(severityFilterBeforeCheckpoint).toHaveValue('orange');
      expect(within(replaySectionBeforeCheckpoint!).getByText('No replay events for corr-app-review at Orange severity.')).toBeVisible();
    });

    await selectSelectedAgentDrilldownTab(user, 'Evidence');

    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(memorySection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(memorySection!).getByText('Ref · /tmp/evidence.md')).toBeVisible();
      expect(memorySection!).toHaveTextContent(
        'Replay checkpoint · evt-memory-replay-anchor · peer_watch_alert_raised · 2026-03-16T08:58:00.000Z'
      );
    });

    const fetchCallCountBeforeCheckpoint = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(memorySection!).getByRole('button', {
        name: 'Open replay checkpoint evt-memory-replay-anchor'
      })
    );

    const replayTab = screen.getByRole('tab', { name: 'Replay / Correlation' });
    await waitFor(() => {
      expect(replayTab).toHaveAttribute('aria-selected', 'true');
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    });

    const replayPanel = screen.getByRole('tabpanel', { name: 'Replay / Correlation' });
    const replaySection = within(replayPanel).getByRole('heading', { name: 'Timeline Replay' }).closest('section');
    const correlationSection = within(replayPanel).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(replaySection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(replaySection!).getByText('Request scope · Target agent · app-engineering · corr-app-review')).toBeVisible();
      expect(within(replaySection!).getByText('Replay checkpoint focus · evt-memory-replay-anchor')).toBeVisible();
      expect(within(replaySection!).getByText('Replay checkpoint exact event opened')).toBeVisible();
      expect(
        within(replaySection!).getByRole('combobox', {
          name: 'Filter timeline replay by severity'
        })
      ).toHaveValue('');
      expect(within(replaySection!).queryByText('Workflow evidence is still incomplete')).not.toBeInTheDocument();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    const postCheckpointRequests = vi
      .mocked(globalThis.fetch)
      .mock.calls.slice(fetchCallCountBeforeCheckpoint)
      .map(([input]) => (typeof input === 'string' ? input : input.toString()));

    expect(postCheckpointRequests).toContain(appEngineeringReviewSelectedTimelineCheckpointUrl);
    expect(postCheckpointRequests).toContain(appEngineeringReviewAccountabilityReplayCheckpointUrl);
    expect(postCheckpointRequests).not.toContain(orangeAppEngineeringReviewSelectedTimelineCheckpointUrl);
    expect(postCheckpointRequests).not.toContain(timelineUrl);
    expect(postCheckpointRequests).not.toContain(reviewScopedTimelineUrl);
    expect(postCheckpointRequests).not.toContain(appEngineeringMemoryArtifactsUrl);
    expect(postCheckpointRequests).not.toContain(selectedCorrelationMemoryArtifactsUrl);
    expect(
      vi.mocked(globalThis.fetch).mock.calls.every(([, init]) => !init || !('method' in init) || init.method === 'GET')
    ).toBe(true);
  }, 10_000);

  it('refetches selected-agent scoped correlation replay with the selected severity filter', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const incidentSection = (await within(details).findByRole('heading', { name: 'Incident Feed' })).closest('section');
    const replaySection = (await within(details).findByRole('heading', { name: 'Timeline Replay' })).closest('section');
    expect(incidentSection).not.toBeNull();
    expect(replaySection).not.toBeNull();

    await user.click(
      within(incidentSection!).getByRole('button', { name: 'Open incident correlation corr-app-secondary' })
    );

    await waitFor(() => {
      expect(within(replaySection!).getByText('Scoped replay · corr-app-secondary')).toBeVisible();
      expect(within(replaySection!).getByText('App engineering finished the secondary review handoff')).toBeVisible();
    });

    const severityFilter = within(replaySection!).getByRole('combobox', {
      name: 'Filter timeline replay by severity'
    });
    const fetchCallCountBeforeFilter = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.selectOptions(severityFilter, 'orange');

    await waitFor(() => {
      expect(within(replaySection!).getByText('Scoped replay · corr-app-secondary')).toBeVisible();
      expect(within(replaySection!).getByText('No replay events for corr-app-secondary at Orange severity.')).toBeVisible();
      expect(
        within(replaySection!).queryByText('App engineering finished the secondary review handoff')
      ).not.toBeInTheDocument();
    });

    const postFilterRequests = vi
      .mocked(globalThis.fetch)
      .mock.calls.slice(fetchCallCountBeforeFilter)
      .map(([input]) => (typeof input === 'string' ? input : input.toString()));

    expect(postFilterRequests).toContain(orangeAppEngineeringSecondarySelectedTimelineUrl);
    expect(postFilterRequests).not.toContain(orangeTimelineUrl);
  });

  it('keeps the last selected-agent replay snapshot visible when a canonical selected-agent replay refresh fails', async () => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 10;

    let selectedTimelineRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === teamLeadWorkflowUrl) {
          return jsonResponse(teamLeadWorkflowFixture);
        }

        if (url === teamLeadSelectedTimelineUrl) {
          selectedTimelineRequests += 1;
          if (selectedTimelineRequests === 1) {
            return jsonResponse({ items: teamLeadReplayWorkflowFixture.timeline });
          }

          return new Response(JSON.stringify({ error: 'internal_error', details: 'team lead replay refresh failed' }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect Team Lead' }));

    const replaySection = (await within(details).findByRole('heading', { name: 'Timeline Replay' })).closest('section');
    expect(replaySection).not.toBeNull();
    expect(await within(replaySection!).findByText('Replay captured lead review checkpoint')).toBeVisible();

    await waitFor(() => {
      expect(
        within(replaySection!).getByText('Showing last timeline replay snapshot. team lead replay refresh failed')
      ).toBeVisible();
      expect(within(replaySection!).getByText('Replay captured lead review checkpoint')).toBeVisible();
    });

    expect(selectedTimelineRequests).toBeGreaterThan(1);
  });

  it('renders timeline replay evidence-first labels and supports a correlation pivot from crew overview', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const replaySection = (await within(details).findByRole('heading', { name: 'Timeline Replay' })).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const replayEvent = within(replaySection!)
      .getByText('Replay captured missing workflow evidence')
      .closest('li');

    expect(replaySection).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(replayEvent).not.toBeNull();
    expect(within(replayEvent!).getByText('Replay captured missing workflow evidence')).toBeVisible();
    expect(within(replayEvent!).getByText('Event type · peer_watch_alert_raised')).toBeVisible();
    expect(replayEvent).toHaveTextContent('Location · Meeting Zone');
    expect(
      within(replayEvent!).getByRole('button', {
        name: 'Focus Meeting Zone in world viewport from replay event evt-timeline-1'
      })
    ).toBeVisible();
    expect(within(replayEvent!).getByText('Severity · Orange')).toBeVisible();
    expect(replayEvent).toHaveTextContent('Counterparties · team-lead');
    expect(
      within(replayEvent!).getByRole('button', {
        name: 'Select replay counterparty from event evt-timeline-1 team-lead'
      })
    ).toBeVisible();
    expect(replayEvent).toHaveTextContent('Evidence · /tmp/evidence.md');
    expect(
      within(replayEvent!).getByRole('button', { name: 'Jump to shared memory artifact /tmp/evidence.md' })
    ).toBeVisible();
    expect(within(replayEvent!).getByText('Source · controller_event')).toBeVisible();
    expect(
      within(replayEvent!).getByRole('button', { name: 'Select replay agent app-engineering from event evt-timeline-1' })
    ).toBeVisible();

    await user.click(
      within(replayEvent!).getByRole('button', { name: /Open replay correlation corr-app-review/ })
    );

    expect(await within(correlationSection!).findByText('corr-app-review')).toBeVisible();
    expect(within(correlationSection!).getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    const overviewCorrelationIncidentRecord = within(correlationSection!)
      .getByText('Lead is still waiting on workflow evidence')
      .closest('li');
    expect(overviewCorrelationIncidentRecord).not.toBeNull();
    expect(within(overviewCorrelationIncidentRecord!).getByText('Incident · peer_watch · open')).toBeVisible();
    expect(within(overviewCorrelationIncidentRecord!).getByText('Severity · Orange')).toBeVisible();
  });

  it('refetches timeline replay with a manually selected crew-overview correlation and labels scoped empty replay state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === secondaryScopedTimelineUrl) {
          return new Response(JSON.stringify({ items: [] }), {
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const replaySection = (await within(details).findByRole('heading', { name: 'Timeline Replay' })).closest('section');
    expect(incidentSection).not.toBeNull();
    expect(replaySection).not.toBeNull();

    expect(await within(replaySection!).findByText('Replay captured missing workflow evidence')).toBeVisible();
    expect(globalThis.fetch).toHaveBeenCalledWith(timelineUrl, expect.anything());

    await user.click(
      within(incidentSection!).getByRole('button', { name: 'Open incident correlation corr-app-secondary' })
    );

    await waitFor(() => {
      expect(within(replaySection!).getByText('Scoped replay · corr-app-secondary')).toBeVisible();
      expect(within(replaySection!).getByText('No replay events for corr-app-secondary.')).toBeVisible();
      expect(within(replaySection!).queryByText('Replay captured missing workflow evidence')).not.toBeInTheDocument();
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(secondaryScopedTimelineUrl, expect.anything());
  });

  it('refetches crew-overview timeline replay with the selected severity filter', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === orangeTimelineUrl) {
          return jsonResponse(reviewScopedTimelineFixture);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const replaySection = (await within(details).findByRole('heading', { name: 'Timeline Replay' })).closest('section');
    expect(replaySection).not.toBeNull();

    const severityFilter = within(replaySection!).getByRole('combobox', {
      name: 'Filter timeline replay by severity'
    });

    expect(await within(replaySection!).findByText('Replay captured launch copy review note')).toBeVisible();
    expect(severityFilter).toHaveValue('');
    expect(within(severityFilter).getByRole('option', { name: 'All severities' })).toBeVisible();

    await user.selectOptions(severityFilter, 'orange');

    await waitFor(() => {
      expect(within(replaySection!).getByText('Replay captured missing workflow evidence')).toBeVisible();
      expect(within(replaySection!).queryByText('Replay captured launch copy review note')).not.toBeInTheDocument();
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(orangeTimelineUrl, expect.anything());
  });

  it('stacks the crew-overview timeline severity filter with a manual correlation scope and restores that scope when cleared', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === orangeSecondaryScopedTimelineUrl) {
          return jsonResponse({ items: [] });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const replaySection = (await within(details).findByRole('heading', { name: 'Timeline Replay' })).closest('section');
    expect(incidentSection).not.toBeNull();
    expect(replaySection).not.toBeNull();

    await user.click(
      within(incidentSection!).getByRole('button', { name: 'Open incident correlation corr-app-secondary' })
    );

    await waitFor(() => {
      expect(within(replaySection!).getByText('Scoped replay · corr-app-secondary')).toBeVisible();
      expect(within(replaySection!).getByText('Replay captured the secondary review handoff')).toBeVisible();
    });

    const severityFilter = within(replaySection!).getByRole('combobox', {
      name: 'Filter timeline replay by severity'
    });
    const fetchCallCountBeforeFilter = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.selectOptions(severityFilter, 'orange');

    await waitFor(() => {
      expect(within(replaySection!).getByText('Scoped replay · corr-app-secondary')).toBeVisible();
      expect(within(replaySection!).getByText('No replay events for corr-app-secondary at Orange severity.')).toBeVisible();
      expect(within(replaySection!).queryByText('Replay captured the secondary review handoff')).not.toBeInTheDocument();
    });

    const postFilterRequests = vi
      .mocked(globalThis.fetch)
      .mock.calls.slice(fetchCallCountBeforeFilter)
      .map(([input]) => (typeof input === 'string' ? input : input.toString()));

    expect(postFilterRequests).toContain(orangeSecondaryScopedTimelineUrl);
    expect(postFilterRequests).not.toContain(orangeTimelineUrl);

    const fetchCallCountBeforeClear = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.selectOptions(severityFilter, '');

    await waitFor(() => {
      expect(within(replaySection!).getByText('Scoped replay · corr-app-secondary')).toBeVisible();
      expect(within(replaySection!).getByText('Replay captured the secondary review handoff')).toBeVisible();
      expect(
        within(replaySection!).queryByText('No replay events for corr-app-secondary at Orange severity.')
      ).not.toBeInTheDocument();
    });

    const postClearRequests = vi
      .mocked(globalThis.fetch)
      .mock.calls.slice(fetchCallCountBeforeClear)
      .map(([input]) => (typeof input === 'string' ? input : input.toString()));

    expect(postClearRequests).toContain(secondaryScopedTimelineUrl);
    expect(postClearRequests).not.toContain(timelineUrl);
  });

  it('keeps crew-overview auto correlation mode when re-selecting the current default correlation from timeline replay', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const replaySection = (await within(details).findByRole('heading', { name: 'Timeline Replay' })).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(replaySection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(replaySection!).getByText('Replay captured missing workflow evidence')).toBeVisible();
      expect(
        within(replaySection!).getByRole('button', {
          name: 'Open replay correlation corr-app-review, currently selected'
        })
      ).toBeVisible();
      expect(within(details).queryByRole('button', { name: 'Return to current scope' })).not.toBeInTheDocument();
      expect(within(replaySection!).queryByText('Scoped replay · corr-app-review')).not.toBeInTheDocument();
    });

    const fetchCallCountBeforeReselect = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(replaySection!).getByRole('button', {
        name: 'Open replay correlation corr-app-review, currently selected'
      })
    );

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(replaySection!).getByText('Replay captured missing workflow evidence')).toBeVisible();
      expect(within(details).queryByRole('button', { name: 'Return to current scope' })).not.toBeInTheDocument();
      expect(within(replaySection!).queryByText('Scoped replay · corr-app-review')).not.toBeInTheDocument();
    });

    const postReselectRequests = vi
      .mocked(globalThis.fetch)
      .mock.calls.slice(fetchCallCountBeforeReselect)
      .map(([input]) => (typeof input === 'string' ? input : input.toString()));

    expect(postReselectRequests).toEqual([]);
    expect(postReselectRequests).not.toContain(reviewScopedTimelineUrl);
    expect(postReselectRequests).not.toContain(crewOverviewSelectedCorrelationMemoryArtifactsUrl);
  });

  it('jumps from timeline replay evidence refs to shared memory without changing crew-overview selection or the active replay correlation', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const replaySection = (await within(details).findByRole('heading', { name: 'Timeline Replay' })).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(replaySection).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    const selectedReplayCorrelationButton = await within(replaySection!).findByRole('button', {
      name: 'Open replay correlation corr-app-review, currently selected'
    });
    const selectedSharedMemoryCorrelationButton = await within(memorySection!).findByRole('button', {
      name: 'Open shared memory correlation corr-app-review, currently selected'
    });
    const artifactRecord = await within(memorySection!)
      .findByText('Ref · /tmp/evidence.md')
      .then((record) => record.closest('li'));
    const replayRecord = selectedReplayCorrelationButton.closest('li');
    expect(artifactRecord).not.toBeNull();
    expect(replayRecord).not.toBeNull();

    expect(within(details).getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    expect(within(details).queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
    expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
    expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    expect(within(replaySection!).queryByText('Scoped replay · corr-app-review')).not.toBeInTheDocument();
    expect(within(details).queryByRole('button', { name: 'Return to current scope' })).not.toBeInTheDocument();
    expect(selectedReplayCorrelationButton).toBeVisible();
    expect(selectedSharedMemoryCorrelationButton).toBeVisible();
    expect(
      within(replayRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/evidence.md'
      })
    ).toBeVisible();

    const fetchCallCountBeforeJump = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(replayRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/evidence.md'
      })
    );

    await waitFor(() => {
      expect(document.activeElement).toBe(artifactRecord);
      const backlinkLane = within(memorySection!).getByText('Current-scope backlinks').closest('div');
      expect(backlinkLane).not.toBeNull();
      expect(within(backlinkLane!).getByText('Timeline replay')).toBeVisible();
      expect(within(backlinkLane!).getByText('Replay captured missing workflow evidence')).toBeVisible();
      expect(within(details).getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
      expect(within(details).queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(replaySection!).queryByText('Scoped replay · corr-app-review')).not.toBeInTheDocument();
      expect(within(details).queryByRole('button', { name: 'Return to current scope' })).not.toBeInTheDocument();
      expect(selectedReplayCorrelationButton).toBeVisible();
      expect(selectedSharedMemoryCorrelationButton).toBeVisible();
    });

    const postJumpRequests = vi
      .mocked(globalThis.fetch)
      .mock.calls.slice(fetchCallCountBeforeJump)
      .map(([input]) => (typeof input === 'string' ? input : input.toString()));

    expect(postJumpRequests).toEqual([]);
    expect(postJumpRequests).not.toContain(selectedOperationUrl);
    expect(postJumpRequests).not.toContain(workflowUrl);
    expect(postJumpRequests).not.toContain(reviewScopedTimelineUrl);
    expect(postJumpRequests).not.toContain(crewOverviewSelectedCorrelationMemoryArtifactsUrl);
  });

  it('pivots from timeline replay actors while carrying replay correlation context', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const replaySection = (await within(details).findByRole('heading', { name: 'Timeline Replay' })).closest('section');
    const replayEvent = within(replaySection!)
      .getByText('Replay captured missing workflow evidence')
      .closest('li');

    expect(replaySection).not.toBeNull();
    expect(replayEvent).not.toBeNull();

    await user.click(
      within(replayEvent!).getByRole('button', {
        name: 'Select replay actor from event evt-timeline-1 team-lead'
      })
    );

    let selectedCorrelationSection: HTMLElement | null = null;
    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      selectedCorrelationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      expect(selectedCorrelationSection).not.toBeNull();
      expect(within(selectedCorrelationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
    });
  });

  it('pivots from timeline replay counterparties while carrying the active replay correlation context', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const replaySection = (await within(details).findByRole('heading', { name: 'Timeline Replay' })).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const replayEvent = within(replaySection!)
      .getByText('Replay captured missing workflow evidence')
      .closest('li');

    expect(replaySection).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(replayEvent).not.toBeNull();
    expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();

    await user.click(
      within(replayEvent!).getByRole('button', {
        name: 'Select replay counterparty from event evt-timeline-1 team-lead'
      })
    );

    let selectedCorrelationSection: HTMLElement | null = null;
    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      selectedCorrelationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      expect(selectedCorrelationSection).not.toBeNull();
      expect(within(selectedCorrelationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
    });
  });

  it('keeps the last timeline replay visible when a later replay poll fails', async () => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 10;

    let timelineRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl || url === selectedOperationUrl) {
          return new Response(JSON.stringify(operationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === timelineUrl) {
          timelineRequests += 1;
          if (timelineRequests === 1) {
            return new Response(JSON.stringify(timelineFixture), {
              headers: { 'content-type': 'application/json' }
            });
          }

          return new Response(JSON.stringify({ error: 'internal_error', details: 'timeline refresh failed' }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === correlationUrl) {
          return new Response(JSON.stringify(correlationFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    expect(await within(details).findByText('Replay captured missing workflow evidence')).toBeVisible();

    expect(await within(details).findByText('timeline refresh failed')).toBeVisible();
    expect(within(details).getByText('Replay captured missing workflow evidence')).toBeVisible();
    expect(timelineRequests).toBeGreaterThan(1);
  });

  it('keeps the last explicitly scoped replay visible when a later scoped replay poll fails', async () => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 10;

    let scopedReplayRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === secondaryScopedTimelineUrl) {
          scopedReplayRequests += 1;
          if (scopedReplayRequests === 1) {
            return new Response(JSON.stringify(secondaryScopedTimelineFixture), {
              headers: { 'content-type': 'application/json' }
            });
          }

          return new Response(JSON.stringify({ error: 'internal_error', details: 'scoped replay refresh failed' }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const replaySection = (await within(details).findByRole('heading', { name: 'Timeline Replay' })).closest('section');
    expect(incidentSection).not.toBeNull();
    expect(replaySection).not.toBeNull();

    await user.click(
      within(incidentSection!).getByRole('button', {
        name: 'Open incident correlation corr-app-secondary'
      })
    );

    await waitFor(() => {
      expect(within(replaySection!).getByText('Scoped replay · corr-app-secondary')).toBeVisible();
      expect(within(replaySection!).getByText('Replay captured the secondary review handoff')).toBeVisible();
      expect(within(replaySection!).getByText('Scoped replay unavailable. scoped replay refresh failed')).toBeVisible();
    });

    expect(scopedReplayRequests).toBeGreaterThan(1);
  });

  it('keeps crew-overview auto correlation mode when re-selecting the current default correlation', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const replaySection = (await within(details).findByRole('heading', { name: 'Timeline Replay' })).closest('section');
    expect(incidentSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(replaySection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(replaySection!).getByText('Replay captured missing workflow evidence')).toBeVisible();
      expect(within(details).queryByRole('button', { name: 'Return to current scope' })).not.toBeInTheDocument();
    });

    const fetchCallCountBeforeReselect = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(incidentSection!).getByRole('button', {
        name: 'Open incident correlation corr-app-review, currently selected'
      })
    );

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(replaySection!).getByText('Replay captured missing workflow evidence')).toBeVisible();
      expect(within(replaySection!).queryByText('Scoped replay · corr-app-review')).not.toBeInTheDocument();
      expect(within(details).queryByRole('button', { name: 'Return to current scope' })).not.toBeInTheDocument();
    });

    expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(fetchCallCountBeforeReselect);
  });

  it('shows a canonical office grid in crew overview and pivots from a zone occupant', async () => {
    const user = userEvent.setup();
    const canonicalZoneOverviewFixture = {
      ...overviewFixture,
      zones: [
        {
          zone_id: 'meeting-zone',
          label: 'Meeting Zone',
          kind: 'shared' as const,
          grid_x: 1,
          grid_y: 1,
          grid_w: 2,
          grid_h: 1,
          home_agent_id: null,
          occupants: [
            {
              agent_id: 'app-engineering',
              display_name: 'App Engineering Agent',
              kind: 'employee' as const,
              current_state: 'blocked',
              active_task: 'Fix workflow issue',
              effective_severity: 'orange' as const
            },
            {
              agent_id: 'growth-revenue',
              display_name: 'Growth Revenue Agent',
              kind: 'employee' as const,
              current_state: 'planning',
              active_task: 'Review launch copy',
              effective_severity: 'yellow' as const
            }
          ]
        },
        {
          zone_id: 'qa-desk',
          label: 'QA Desk',
          kind: 'desk' as const,
          grid_x: 1,
          grid_y: 0,
          grid_w: 1,
          grid_h: 1,
          home_agent_id: 'growth-revenue',
          occupants: []
        },
        {
          zone_id: 'lead-desk',
          label: 'Team Lead Desk',
          kind: 'desk' as const,
          grid_x: 0,
          grid_y: 0,
          grid_w: 1,
          grid_h: 1,
          home_agent_id: 'team-lead',
          occupants: [
            {
              agent_id: 'team-lead',
              display_name: 'Team Lead',
              kind: 'lead' as const,
              current_state: 'reviewing',
              active_task: 'Coordinate rollout',
              effective_severity: 'normal' as const
            }
          ]
        }
      ]
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(canonicalZoneOverviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl || url === selectedOperationUrl) {
          return new Response(JSON.stringify(operationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          return new Response(JSON.stringify(workflowFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === teamLeadWorkflowUrl) {
          return new Response(JSON.stringify(teamLeadWorkflowFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === growthRevenueWorkflowUrl) {
          return new Response(JSON.stringify(growthRevenueWorkflowFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === correlationUrl) {
          return new Response(JSON.stringify(correlationFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === secondaryCorrelationUrl) {
          return new Response(JSON.stringify(secondaryCorrelationFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    render(<App />);

    const details = await openHub(user);
    const officeGridSection = within(details).getByRole('heading', { name: 'Office Grid' }).closest('section');
    expect(officeGridSection).not.toBeNull();

    const officeGridLabels = Array.from(officeGridSection!.querySelectorAll('li strong')).map((node) => node.textContent);
    expect(officeGridLabels).toEqual(['Team Lead Desk', 'QA Desk', 'Meeting Zone', 'Review Zone']);

    expect(within(officeGridSection!).getAllByText('Kind · desk')).toHaveLength(2);
    expect(within(officeGridSection!).getAllByText('Kind · shared')).toHaveLength(2);
    expect(
      within(officeGridSection!).getByRole('button', {
        name: 'Select home agent Team Lead in Team Lead Desk'
      })
    ).toBeVisible();
    expect(
      within(officeGridSection!).getByRole('button', {
        name: 'Select home agent Growth Revenue Agent in QA Desk'
      })
    ).toBeVisible();
    expect(
      within(officeGridSection!).getByRole('button', { name: 'Select zone occupant Team Lead in Team Lead Desk' })
    ).toBeVisible();
    expect(within(officeGridSection!).getAllByText('Occupants · Empty')).toHaveLength(1);

    const reviewZoneRow = within(officeGridSection!).getByText('Review Zone').closest('li');
    expect(reviewZoneRow).not.toBeNull();
    expect(within(reviewZoneRow!).getByText('Severity · Normal · 1 occupant(s)')).toBeVisible();
    expect(within(officeGridSection!).getByText('Severity · Orange · 2 occupant(s)')).toBeVisible();

    const occupantButton = within(officeGridSection!).getByRole('button', {
      name: 'Select zone occupant App Engineering Agent in Meeting Zone'
    });
    expect(occupantButton).toBeVisible();

    await user.click(occupantButton);
    expect(await within(details).findByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
  });

  it('appends runtime-only projected zones to the crew-overview office grid when overview data omits them', async () => {
    const user = userEvent.setup();
    setNavigatorUserAgent('VitestBrowser');
    const runtimeOnlyZoneOverviewFixture = {
      ...overviewFixture,
      agents: overviewFixture.agents.map((agent) =>
        agent.agent_id === 'app-engineering'
          ? {
              ...agent,
              current_state: 'reviewing',
              current_location: 'meeting-zone'
            }
          : agent
      )
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(runtimeOnlyZoneOverviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl || url === selectedOperationUrl) {
          return new Response(JSON.stringify(operationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          return new Response(JSON.stringify(workflowFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === correlationUrl) {
          return new Response(JSON.stringify(correlationFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    render(<App />);

    const details = await openHub(user);
    const officeGridSection = within(details).getByRole('heading', { name: 'Office Grid' }).closest('section');
    expect(officeGridSection).not.toBeNull();

    const officeGridLabels = Array.from(officeGridSection!.querySelectorAll('li strong')).map((node) => node.textContent);
    expect(officeGridLabels).toEqual(['Team Lead Desk', 'Meeting Zone', 'Review Zone']);

    const reviewZoneRow = within(officeGridSection!).getByText('Review Zone').closest('li');
    expect(reviewZoneRow).not.toBeNull();
    expect(within(reviewZoneRow!).getByText('Severity · Normal · 1 occupant(s)')).toBeVisible();

    const reviewZoneOccupantButton = within(reviewZoneRow!).getByRole('button', {
      name: 'Select zone occupant Team Lead in Review Zone'
    });
    expect(reviewZoneOccupantButton).toBeVisible();

    await user.click(
      within(reviewZoneRow!).getByRole('button', {
        name: 'Focus Review Zone in world viewport'
      })
    );

    expect(screen.getByTestId('mock-zone-focus-request')).toHaveTextContent('review-zone:1');
    expect(screen.getByRole('dialog', { name: 'Hub' })).toBeVisible();
    expect(within(details).getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    expect(screen.getByTestId('mock-scene-selected-agent-id')).toHaveTextContent('');
    expect(screen.getByTestId('mock-scene-active-correlation-id')).toHaveTextContent('corr-app-review');

    await user.click(reviewZoneOccupantButton);

    expect(await within(details).findByRole('heading', { name: 'Team Lead' })).toBeVisible();
  });

  it('preserves a manually selected crew-overview correlation when pivoting through an office-grid zone occupant', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const officeGridSection = within(details).getByRole('heading', { name: 'Office Grid' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(incidentSection).not.toBeNull();
    expect(officeGridSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await user.click(within(incidentSection!).getByRole('button', { name: 'Open incident correlation corr-app-secondary' }));

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(correlationSection!).getByText('Counts · 1 incidents · 0 interactions · 1 events')).toBeVisible();
    });

    await user.click(
      within(officeGridSection!).getByRole('button', {
        name: 'Select zone occupant App Engineering Agent in Meeting Zone'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      const nextCorrelationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      expect(nextCorrelationSection).not.toBeNull();
      expect(within(nextCorrelationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(nextCorrelationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
    });
  });

  it('preserves the active crew-overview correlation when pivoting through office-grid home agents', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const officeGridSection = within(details).getByRole('heading', { name: 'Office Grid' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(officeGridSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(
        within(officeGridSection!).getByRole('button', {
          name: 'Select home agent Team Lead in Team Lead Desk'
        })
      ).toBeVisible();
    });

    await user.click(
      within(officeGridSection!).getByRole('button', {
        name: 'Select home agent Team Lead in Team Lead Desk'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      const nextCorrelationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      expect(nextCorrelationSection).not.toBeNull();
      expect(within(nextCorrelationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(nextCorrelationSection!).getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(correlationUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
    });
  });

  it('keeps the office-grid home-agent no-correlation path agent-only', async () => {
    const crewOverviewWithoutCorrelationIncidentFeedFixture = {
      items: incidentFeedFixture.items.map((incident) => ({
        ...incident,
        correlation_id: null
      }))
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === incidentsUrl) {
          return jsonResponse(crewOverviewWithoutCorrelationIncidentFeedFixture);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const officeGridSection = within(details).getByRole('heading', { name: 'Office Grid' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(officeGridSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(within(correlationSection!).getByText('No correlation selected.')).toBeVisible();

    await user.click(
      within(officeGridSection!).getByRole('button', {
        name: 'Select home agent Team Lead in Team Lead Desk'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      const nextCorrelationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      expect(nextCorrelationSection).not.toBeNull();
      expect(within(nextCorrelationSection!).getByText('No correlation selected.')).toBeVisible();
    });

    const requestedUrls = vi
      .mocked(globalThis.fetch)
      .mock
      .calls.map(([input]) => (typeof input === 'string' ? input : input.toString()));

    expect(requestedUrls).toContain(teamLeadWorkflowUrl);
    expect(requestedUrls).toContain(teamLeadMemoryArtifactsUrl);
    expect(requestedUrls).not.toContain(correlationUrl);
    expect(requestedUrls).not.toContain(teamLeadSelectedCorrelationMemoryArtifactsUrl);
  });

  it('opens agent detail and correlation drilldown directly from the active queue', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const queueButton = within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' });
    await user.click(queueButton);

    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(details).getByRole('button', { name: 'Clear' })).toHaveFocus();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(workflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(correlationUrl, expect.anything());
    });
  });

  it('opens agent detail from the crew open supervision alerts queue using the alert correlation instead of an unrelated crew-overview default', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    const alertsSection = within(details).getByRole('heading', { name: 'Open Supervision Alerts' }).closest('section');
    expect(alertsSection).not.toBeNull();
    expect(
      within(alertsSection!).getByText('Growth revenue still needs supervision before release review')
    ).toBeVisible();

    await user.click(
      await within(alertsSection!).findByRole('button', {
        name: 'Inspect Growth Revenue Agent from open supervision alerts queue'
      })
    );

    await waitFor(() => {
      const activeCorrelationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      expect(activeCorrelationSection).not.toBeNull();
      expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      expect(within(activeCorrelationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(activeCorrelationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
    });

    const peerWatchRequests = vi
      .mocked(globalThis.fetch)
      .mock.calls.map(([input]) => (typeof input === 'string' ? input : input.toString()))
      .filter((url) => url.startsWith('/peer-watch/alerts'));

    expect(peerWatchRequests).toContain(crewOpenSupervisionAlertsUrl);
    expect(peerWatchRequests).toContain(growthRevenueScopedSecondarySupervisionHistoryUrl);
    expect(peerWatchRequests).not.toContain(growthRevenueScopedReviewSupervisionHistoryUrl);
  });

  it('refetches crew open supervision alerts with the selected severity filter', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === orangeCrewOpenSupervisionAlertsUrl) {
          return jsonResponse({
            items: [
              {
                ...crewOpenSupervisionAlertsFixture.items[0],
                summary: 'Orange open supervision alert remains in the crew queue'
              }
            ]
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const alertsSection = within(details).getByRole('heading', { name: 'Open Supervision Alerts' }).closest('section');
    expect(alertsSection).not.toBeNull();

    const severityFilter = await within(alertsSection!).findByRole('combobox', {
      name: 'Filter open supervision alerts by severity'
    });

    expect(severityFilter).toHaveValue('');
    expect(within(severityFilter).getByRole('option', { name: 'All severities' })).toBeVisible();

    await user.selectOptions(severityFilter, 'orange');

    await waitFor(() => {
      expect(
        within(alertsSection!).getByText('Orange open supervision alert remains in the crew queue')
      ).toBeVisible();
      expect(
        within(alertsSection!).queryByText('Growth revenue still needs supervision before release review')
      ).not.toBeInTheDocument();
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(orangeCrewOpenSupervisionAlertsUrl, expect.anything());
  });

  it('uses the open supervision alert correlation for exact shared-memory evidence jumps without changing the crew-overview selection', async () => {
    const alertsWithExactFallbackFixture = {
      items: [
        {
          ...crewOpenSupervisionAlertsFixture.items[0],
          evidence_refs: ['/tmp/missing.md'],
          evidence_count: 1,
          summary: 'Open supervision alert exact evidence jump stays on the alert correlation'
        }
      ]
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === crewOpenSupervisionAlertsUrl) {
          return jsonResponse(alertsWithExactFallbackFixture);
        }

        if (url === crewOverviewSecondaryCorrelationMissingArtifactExactUrl) {
          return jsonResponse({
            generated_at: '2026-03-16T09:00:00.000Z',
            items: [
              {
                artifact_ref: '/tmp/missing.md',
                artifact_kind: 'evidence_ref',
                file_name: 'missing.md',
                first_seen_at: '2026-03-16T08:58:30.000Z',
                last_seen_at: '2026-03-16T08:58:30.000Z',
                mention_count: 1,
                agent_ids: ['growth-revenue', 'team-lead'],
                correlation_ids: ['corr-app-secondary'],
                source_kinds: ['controller_event'],
                latest_summary: 'Open supervision alert exact fallback kept the alert correlation scope',
                latest_event_type: 'peer_watch_alert',
                collector_last_modified_at: null
              }
            ]
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const alertsSection = within(details).getByRole('heading', { name: 'Open Supervision Alerts' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(correlationSection).not.toBeNull();
    expect(alertsSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(alertsSection!).getByText('Open supervision alert exact evidence jump stays on the alert correlation')).toBeVisible();
    });

    expect(within(memorySection!).queryByText('Ref · /tmp/missing.md')).not.toBeInTheDocument();

    const fetchCallCountBeforeJump = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(alertsSection!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/missing.md'
      })
    );

    await waitFor(() => {
      expect(within(memorySection!).getByText('Ref · /tmp/missing.md')).toBeVisible();
      const backlinkLane = within(memorySection!).getByText('Current-scope backlinks').closest('div');
      expect(backlinkLane).not.toBeNull();
      expect(within(backlinkLane!).getByText('Open supervision alert')).toBeVisible();
      expect(
        within(backlinkLane!).getByText('Open supervision alert exact evidence jump stays on the alert correlation')
      ).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-app-secondary')).not.toBeInTheDocument();
    });

    const postJumpRequests = vi
      .mocked(globalThis.fetch)
      .mock.calls.slice(fetchCallCountBeforeJump)
      .map(([input]) => (typeof input === 'string' ? input : input.toString()));

    expect(postJumpRequests).toEqual([crewOverviewSecondaryCorrelationMissingArtifactExactUrl]);
  });

  it('reruns an exact scoped fetch for an open supervision alert evidence ref even when the same artifact is already loaded in the current crew scope', async () => {
    const alertsWithLoadedArtifactFixture = {
      items: [
        {
          ...crewOpenSupervisionAlertsFixture.items[0],
          evidence_refs: ['/tmp/evidence.md'],
          evidence_count: 1,
          summary: 'Open supervision alert exact evidence jump replaces the current-scope artifact copy'
        }
      ]
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === crewOpenSupervisionAlertsUrl) {
          return jsonResponse(alertsWithLoadedArtifactFixture);
        }

        if (url === crewOverviewSecondaryCorrelationEvidenceArtifactExactUrl) {
          return jsonResponse({
            generated_at: '2026-03-16T09:00:00.000Z',
            items: [
              {
                artifact_ref: '/tmp/evidence.md',
                artifact_kind: 'evidence_ref',
                file_name: 'evidence.md',
                first_seen_at: '2026-03-16T08:58:30.000Z',
                last_seen_at: '2026-03-16T08:58:30.000Z',
                mention_count: 1,
                agent_ids: ['growth-revenue', 'team-lead'],
                correlation_ids: ['corr-app-secondary'],
                source_kinds: ['controller_event'],
                latest_summary: 'Open supervision alert exact fetch replaced the current-scope evidence artifact',
                latest_event_type: 'peer_watch_alert',
                collector_last_modified_at: null
              }
            ]
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const alertsSection = within(details).getByRole('heading', { name: 'Open Supervision Alerts' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(correlationSection).not.toBeNull();
    expect(alertsSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(alertsSection!).getByText('Open supervision alert exact evidence jump replaces the current-scope artifact copy')).toBeVisible();
      expect(within(memorySection!).getByText('Ref · /tmp/evidence.md')).toBeVisible();
    });

    const fetchCallCountBeforeJump = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(alertsSection!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/evidence.md'
      })
    );

    await waitFor(() => {
      expect(within(memorySection!).getByText('Focused exact artifact · /tmp/evidence.md')).toBeVisible();
      expect(
        within(memorySection!).getByText('Open supervision alert exact fetch replaced the current-scope evidence artifact')
      ).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-app-secondary')).not.toBeInTheDocument();
    });

    const postJumpRequests = vi
      .mocked(globalThis.fetch)
      .mock.calls.slice(fetchCallCountBeforeJump)
      .map(([input]) => (typeof input === 'string' ? input : input.toString()));

    expect(postJumpRequests).toEqual([crewOverviewSecondaryCorrelationEvidenceArtifactExactUrl]);
  });

  it('keeps correlation-less open supervision alert evidence jumps on the unscoped shared-memory path', async () => {
    const alertsWithNullCorrelationExactFallbackFixture = {
      items: [
        {
          ...crewOpenSupervisionAlertsNoCorrelationFixture.items[0],
          evidence_refs: ['/tmp/missing.md'],
          evidence_count: 1,
          summary: 'Open supervision alert exact evidence jump stays on the no-correlation path'
        }
      ]
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === crewOpenSupervisionAlertsUrl) {
          return jsonResponse(alertsWithNullCorrelationExactFallbackFixture);
        }

        if (url === crewOverviewMissingArtifactExactUrl) {
          return jsonResponse({
            generated_at: '2026-03-16T09:00:00.000Z',
            items: [
              {
                artifact_ref: '/tmp/missing.md',
                artifact_kind: 'evidence_ref',
                file_name: 'missing.md',
                first_seen_at: '2026-03-16T08:58:30.000Z',
                last_seen_at: '2026-03-16T08:58:30.000Z',
                mention_count: 1,
                agent_ids: ['growth-revenue', 'team-lead'],
                correlation_ids: [],
                source_kinds: ['controller_event'],
                latest_summary: 'Open supervision alert exact fallback stayed on the unscoped crew-overview path',
                latest_event_type: 'peer_watch_alert',
                collector_last_modified_at: null
              }
            ]
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const alertsSection = within(details).getByRole('heading', { name: 'Open Supervision Alerts' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(correlationSection).not.toBeNull();
    expect(alertsSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(alertsSection!).getByText('Open supervision alert exact evidence jump stays on the no-correlation path')).toBeVisible();
    });

    expect(within(memorySection!).queryByText('Ref · /tmp/missing.md')).not.toBeInTheDocument();

    const fetchCallCountBeforeJump = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(alertsSection!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/missing.md'
      })
    );

    await waitFor(() => {
      expect(within(memorySection!).getByText('Ref · /tmp/missing.md')).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(correlationSection!).queryByText('No correlation selected.')).not.toBeInTheDocument();
    });

    const postJumpRequests = vi
      .mocked(globalThis.fetch)
      .mock.calls.slice(fetchCallCountBeforeJump)
      .map(([input]) => (typeof input === 'string' ? input : input.toString()));

    expect(postJumpRequests).toEqual([crewOverviewMissingArtifactExactUrl]);
  });

  it('keeps correlation-less open supervision alerts on the no-correlation selected-agent path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === incidentsUrl) {
          return jsonResponse({
            items: []
          });
        }

        if (url === crewOpenSupervisionAlertsUrl) {
          return jsonResponse(crewOpenSupervisionAlertsNoCorrelationFixture);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('No correlation selected.')).toBeVisible();
    });

    const alertsSection = within(details).getByRole('heading', { name: 'Open Supervision Alerts' }).closest('section');
    expect(alertsSection).not.toBeNull();
    expect(
      within(alertsSection!).getByText('Growth revenue open supervision alert without a correlation id')
    ).toBeVisible();

    await user.click(
      await within(alertsSection!).findByRole('button', {
        name: 'Inspect Growth Revenue Agent from open supervision alerts queue'
      })
    );

    await waitFor(() => {
      const activeCorrelationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      expect(activeCorrelationSection).not.toBeNull();
      expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      expect(within(activeCorrelationSection!).getByText('No correlation selected.')).toBeVisible();
    });

    const peerWatchRequests = vi
      .mocked(globalThis.fetch)
      .mock.calls.map(([input]) => (typeof input === 'string' ? input : input.toString()))
      .filter((url) => url.startsWith('/peer-watch/alerts'));

    expect(peerWatchRequests).toContain(crewOpenSupervisionAlertsUrl);
    expect(peerWatchRequests).toContain(growthRevenueSupervisionHistoryUrl);
    expect(peerWatchRequests).not.toContain(growthRevenueScopedReviewSupervisionHistoryUrl);
    expect(peerWatchRequests).not.toContain(growthRevenueScopedSecondarySupervisionHistoryUrl);
  });

  it('does not block null-correlation open supervision alert pivots on a loading workflow before requesting supervision history', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === incidentsUrl) {
          return Promise.resolve(jsonResponse({ items: [] }));
        }

        if (url === crewOpenSupervisionAlertsUrl) {
          return Promise.resolve(jsonResponse(crewOpenSupervisionAlertsNoCorrelationFixture));
        }

        if (url === growthRevenueWorkflowUrl) {
          return new Promise<Response>(() => {});
        }

        return Promise.resolve(resolveTestFetchResponse(url));
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const supervisionSection = within(details).getByRole('heading', { name: 'Open Supervision Alerts' }).closest('section');
    expect(correlationSection).not.toBeNull();
    expect(supervisionSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('No correlation selected.')).toBeVisible();
    });

    await user.click(
      within(supervisionSection!).getByRole('button', {
        name: 'Inspect Growth Revenue Agent from open supervision alerts queue'
      })
    );

    const selectedSupervisionSection = within(details)
      .getByRole('heading', { name: 'Supervision History' })
      .closest('section');
    expect(selectedSupervisionSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      expect(within(selectedSupervisionSection!).getByText('Request scope · Target agent · growth-revenue')).toBeVisible();
      expect(within(selectedSupervisionSection!).getByText('No recent supervision history.')).toBeVisible();
    });

    const peerWatchRequests = vi
      .mocked(globalThis.fetch)
      .mock.calls.map(([input]) => (typeof input === 'string' ? input : input.toString()))
      .filter((url) => url.startsWith('/peer-watch/alerts'));

    expect(peerWatchRequests).toContain(growthRevenueSupervisionHistoryUrl);
    expect(peerWatchRequests).not.toContain(growthRevenueScopedReviewSupervisionHistoryUrl);
    expect(peerWatchRequests).not.toContain(growthRevenueScopedSecondarySupervisionHistoryUrl);
  });

  it('shows the active-queue severity filter and forwards severity-only requests to office operations', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const queueSection = within(details).getByRole('heading', { name: 'Active Queue' }).closest('section');
    expect(queueSection).not.toBeNull();

    const severityFilter = within(queueSection!).getByRole('combobox', {
      name: 'Filter active queue by severity'
    });

    expect(within(severityFilter).getByRole('option', { name: 'All severities (3)' })).toBeVisible();
    expect(within(severityFilter).getByRole('option', { name: 'Normal (1)' })).toBeVisible();
    expect(within(severityFilter).getByRole('option', { name: 'Yellow (1)' })).toBeVisible();
    expect(within(severityFilter).getByRole('option', { name: 'Orange (1)' })).toBeVisible();

    await user.selectOptions(severityFilter, 'orange');

    await waitFor(() => {
      expect(
        within(queueSection!).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' })
      ).toBeVisible();
      expect(
        within(queueSection!).queryByRole('button', { name: 'Inspect Team Lead from active queue' })
      ).not.toBeInTheDocument();
    });

    const requestedUrls = vi
      .mocked(globalThis.fetch)
      .mock
      .calls.map(([input]) => (typeof input === 'string' ? input : input.toString()));

    expect(requestedUrls).toContain(orangeOperationsUrl);
  });

  it('keeps the current operation path intact when selecting a filtered active queue item', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl) {
          return new Response(JSON.stringify(operationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === blockedOperationsUrl) {
          return new Response(JSON.stringify(blockedOperationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === selectedOperationUrl) {
          return new Response(JSON.stringify(directSelectionOperationFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          return new Response(JSON.stringify(workflowFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const queueSection = within(details).getByRole('heading', { name: 'Active Queue' }).closest('section');
    expect(queueSection).not.toBeNull();

    expect(
      within(queueSection!).getByText('Evidence · No evidence refs')
    ).toBeVisible();

    await user.selectOptions(
      within(queueSection!).getByRole('combobox', { name: 'Filter active queue by state' }),
      'blocked'
    );

    const filteredQueueButton = await within(queueSection!).findByRole('button', {
      name: 'Inspect App Engineering Agent from active queue'
    });
    expect(filteredQueueButton).toHaveAttribute(
      'aria-describedby',
      'aitown-active-queue-status-app-engineering aitown-active-queue-preview-app-engineering'
    );
    expect(document.getElementById('aitown-active-queue-status-app-engineering')).toHaveTextContent(
      'blocked · Workflow evidence is still incomplete'
    );
    expect(document.getElementById('aitown-active-queue-preview-app-engineering')).toHaveTextContent(
      'Event · Workflow evidence is still incomplete · Source · controller_event · Freshness · 2026-03-16T08:50:00.000Z · Heartbeat · 2026-03-16T08:59:30.000Z · Output · 2026-03-16T08:38:00.000Z · Staleness · Orange · 22m · Reboot · Recommended'
    );
    expect(
      within(queueSection!).queryByRole('button', { name: 'Inspect Team Lead from active queue' })
    ).not.toBeInTheDocument();

    await user.click(filteredQueueButton);

    const currentOperationSection = (await within(details).findByRole('heading', { name: 'Current Operation' })).closest('section');
    expect(currentOperationSection).not.toBeNull();
    expect(within(currentOperationSection!).getByText('working · Load current operation snapshot')).toBeVisible();

    const requestedUrls = vi
      .mocked(globalThis.fetch)
      .mock
      .calls.map(([input]) => (typeof input === 'string' ? input : input.toString()));

    expect(requestedUrls).toContain(blockedOperationsUrl);
    expect(requestedUrls).toContain(selectedOperationUrl);
    expect(requestedUrls).not.toContain('/office/operations?state=blocked&agent_id=app-engineering');
  });

  it('keeps direct roster inspection seeded from the unfiltered operations contract while a crew-overview state filter is active', async () => {
    let resolveTeamLeadOperationRequest: ((response: Response) => void) | null = null;
    const teamLeadOperationRequest = new Promise<Response>((resolve) => {
      resolveTeamLeadOperationRequest = resolve;
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return jsonResponse(overviewFixture);
        }

        if (url === operationsUrl) {
          return jsonResponse(operationsFixture);
        }

        if (url === allOperationsUrl) {
          return jsonResponse(allOperationsFixture);
        }

        if (url === blockedOperationsUrl) {
          return jsonResponse(blockedOperationsFixture);
        }

        if (url === teamLeadSelectedOperationUrl) {
          return teamLeadOperationRequest;
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const queueSection = within(details).getByRole('heading', { name: 'Active Queue' }).closest('section');
    expect(queueSection).not.toBeNull();

    await user.selectOptions(
      within(queueSection!).getByRole('combobox', { name: 'Filter active queue by state' }),
      'blocked'
    );

    expect(
      await within(queueSection!).findByRole('button', { name: 'Inspect App Engineering Agent from active queue' })
    ).toBeVisible();
    expect(
      within(queueSection!).queryByRole('button', { name: 'Inspect Team Lead from active queue' })
    ).not.toBeInTheDocument();

    await user.click(within(details).getByRole('button', { name: 'Inspect Team Lead' }));

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(details).getByRole('heading', { name: 'Current Operation' })).toBeVisible();
      expect(within(details).getByText('reviewing · Coordinate rollout')).toBeVisible();
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadSelectedOperationUrl, expect.anything());

    await act(async () => {
      resolveTeamLeadOperationRequest?.(jsonResponse(teamLeadOperationFixture));
    });
  });

  it('keeps top-slice-missing crew-overview states selectable in the active queue filter', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl) {
          return new Response(JSON.stringify(operationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === planningOperationsUrl) {
          return new Response(JSON.stringify(planningOperationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === timelineUrl) {
          return new Response(JSON.stringify(timelineFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const queueSection = within(details).getByRole('heading', { name: 'Active Queue' }).closest('section');
    expect(queueSection).not.toBeNull();

    const stateFilter = within(queueSection!).getByRole('combobox', {
      name: 'Filter active queue by state'
    });

    expect(within(stateFilter).getByRole('option', { name: 'All states (3)' })).toBeVisible();
    expect(within(stateFilter).getByRole('option', { name: 'Planning (1)' })).toBeVisible();

    await user.selectOptions(stateFilter, 'planning');

    expect(
      await within(queueSection!).findByRole('button', { name: 'Inspect Growth Revenue Agent from active queue' })
    ).toBeVisible();
    expect(
      within(queueSection!).queryByRole('button', { name: 'Inspect App Engineering Agent from active queue' })
    ).not.toBeInTheDocument();

    const requestedUrls = vi
      .mocked(globalThis.fetch)
      .mock
      .calls.map(([input]) => (typeof input === 'string' ? input : input.toString()));

    expect(requestedUrls).toContain(planningOperationsUrl);
  });

  it('falls back to the currently loaded queue summary while full state buckets are still loading', async () => {
    let resolveAllOperations: ((response: Response) => void) | null = null;

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return Promise.resolve(
            new Response(JSON.stringify(overviewFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        if (url === operationsUrl) {
          return Promise.resolve(
            new Response(JSON.stringify(operationsFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        if (url === allOperationsUrl) {
          return new Promise<Response>((resolve) => {
            resolveAllOperations = resolve;
          });
        }

        return Promise.resolve(resolveTestFetchResponse(url));
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const queueSection = within(details).getByRole('heading', { name: 'Active Queue' }).closest('section');
    expect(queueSection).not.toBeNull();

    const stateFilter = within(queueSection!).getByRole('combobox', {
      name: 'Filter active queue by state'
    });

    await waitFor(() => {
      expect(within(stateFilter).getByRole('option', { name: 'All states (2)' })).toBeVisible();
      expect(within(stateFilter).getByRole('option', { name: 'Blocked (1)' })).toBeVisible();
      expect(within(stateFilter).getByRole('option', { name: 'Reviewing (1)' })).toBeVisible();
    });

    expect(resolveAllOperations).not.toBeNull();
    resolveAllOperations!(
      new Response(JSON.stringify(allOperationsFixture), {
        headers: { 'content-type': 'application/json' }
      })
    );

    await waitFor(() => {
      expect(within(stateFilter).getByRole('option', { name: 'All states (3)' })).toBeVisible();
      expect(within(stateFilter).getByRole('option', { name: 'Blocked (1)' })).toBeVisible();
      expect(within(stateFilter).getByRole('option', { name: 'Planning (1)' })).toBeVisible();
      expect(within(stateFilter).getByRole('option', { name: 'Reviewing (1)' })).toBeVisible();
    });
  });

  it('falls back to the visible queue summary when the full active-queue bucket read fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === allOperationsUrl) {
          return new Response(
            JSON.stringify({ error: 'internal_error', details: 'state bucket refresh failed' }),
            {
              status: 500,
              headers: { 'content-type': 'application/json' }
            }
          );
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const queueSection = within(details).getByRole('heading', { name: 'Active Queue' }).closest('section');
    expect(queueSection).not.toBeNull();

    expect(
      await within(queueSection!).findByRole('button', { name: 'Inspect App Engineering Agent from active queue' })
    ).toBeVisible();
    expect(within(queueSection!).queryByText(/active queue state buckets/i)).not.toBeInTheDocument();

    const stateFilter = within(queueSection!).getByRole('combobox', {
      name: 'Filter active queue by state'
    });

    expect(within(stateFilter).getByRole('option', { name: 'All states (2)' })).toBeVisible();
    expect(within(stateFilter).getByRole('option', { name: 'Blocked (1)' })).toBeVisible();
    expect(within(stateFilter).getByRole('option', { name: 'Reviewing (1)' })).toBeVisible();
  });

  it('shows a degraded bucket warning while keeping the last full active-queue state buckets after a later refresh fails', async () => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 10;

    let allOperationsRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === allOperationsUrl) {
          allOperationsRequests += 1;

          if (allOperationsRequests === 1) {
            return new Response(JSON.stringify(allOperationsFixture), {
              headers: { 'content-type': 'application/json' }
            });
          }

          return new Response(
            JSON.stringify({ error: 'internal_error', details: 'state bucket refresh failed' }),
            {
              status: 500,
              headers: { 'content-type': 'application/json' }
            }
          );
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const queueSection = within(details).getByRole('heading', { name: 'Active Queue' }).closest('section');
    expect(queueSection).not.toBeNull();

    const stateFilter = within(queueSection!).getByRole('combobox', {
      name: 'Filter active queue by state'
    });

    expect(await within(stateFilter).findByRole('option', { name: 'Planning (1)' })).toBeVisible();

    await waitFor(() => {
      expect(allOperationsRequests).toBeGreaterThan(1);
      expect(
        within(queueSection!).getByText('Showing last active queue state buckets. state bucket refresh failed')
      ).toBeVisible();
      expect(within(stateFilter).getByRole('option', { name: 'All states (3)' })).toBeVisible();
      expect(within(stateFilter).getByRole('option', { name: 'Planning (1)' })).toBeVisible();
    });
  });

  it('keeps queue-derived operation context visible after drilling into a selected agent', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const operationSection = within(details).getByRole('heading', { name: 'Current Operation' }).closest('section');
    const runContextSection = within(details).getByRole('heading', { name: 'Run Context' }).closest('section');
    expect(operationSection).not.toBeNull();
    expect(runContextSection).not.toBeNull();

    await waitFor(() => {
      expect(within(operationSection!).getByText('blocked · Workflow evidence is still incomplete')).toBeVisible();
      expect(within(operationSection!).getByRole('button', { name: /Open operation correlation corr-app-review/ })).toBeVisible();
      expect(within(operationSection!).getByRole('button', { name: 'Select operation counterparty agent team-lead' })).toBeVisible();
      expect(within(operationSection!).getByText('Location · meeting-zone')).toBeVisible();
      expect(within(operationSection!).getByText('Latest event · Workflow evidence is still incomplete')).toBeVisible();
      expect(operationSection!).toHaveTextContent('Counterparties · team-lead');
      expect(operationSection!).toHaveTextContent('Evidence · /tmp/evidence.md');
      expect(within(operationSection!).getByText('Source · controller_event')).toBeVisible();
      expect(within(runContextSection!).getByText('Run blocker · Workflow evidence is still incomplete')).toBeVisible();
      expect(within(runContextSection!).getByText('Latest event type · peer_watch_alert_raised')).toBeVisible();
      expect(within(runContextSection!).getByText('Latest event at · 2026-03-16T08:50:00.000Z')).toBeVisible();
      expect(within(runContextSection!).getByText('Last event at · 2026-03-16T08:50:00.000Z')).toBeVisible();
      expect(within(runContextSection!).getByText('Last heartbeat · 2026-03-16T08:59:30.000Z')).toBeVisible();
      expect(within(runContextSection!).getByText('Last output · 2026-03-16T08:38:00.000Z')).toBeVisible();
      expect(within(runContextSection!).getByText('Staleness · Orange · 22m')).toBeVisible();
      expect(within(runContextSection!).getByText('Reboot recommendation · Recommended')).toBeVisible();
    });
  });

  it('preserves the current-operation correlation when pivoting through current-operation counterparties', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const operationSection = within(details).getByRole('heading', { name: 'Current Operation' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(operationSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(operationSection!).getByRole('button', { name: 'Select operation counterparty agent team-lead' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await user.click(within(operationSection!).getByRole('button', { name: 'Select operation counterparty agent team-lead' }));

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(correlationUrl, expect.anything());
    });
  });

  it('preserves the clicked selected-agent workflow correlation when opening a current-operation actor pivot', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    const operationSection = within(details).getByRole('heading', { name: 'Current Operation' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(operationSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await user.click(within(workflowSection!).getByRole('button', { name: 'Open workflow correlation corr-app-secondary' }));

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Current Operation' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
    });

    await user.click(
      within(operationSection!).getByRole('button', {
        name: 'Select current operation actor from event evt-1 team-lead'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(secondaryCorrelationUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(
        teamLeadSelectedSecondaryCorrelationMemoryArtifactsUrl,
        expect.anything()
      );
      expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
      expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadSelectedOperationUrl, expect.anything());
    });
  });

  it('preserves the switched selected-agent workflow correlation when opening a current-operation counterparty pivot', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    const operationSection = within(details).getByRole('heading', { name: 'Current Operation' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(operationSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(details).getByRole('heading', { name: 'Current Operation' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await user.click(within(workflowSection!).getByRole('button', { name: 'Open workflow correlation corr-app-secondary' }));

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Current Operation' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
    });

    const fetchCallCountBeforePivot = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(within(operationSection!).getByRole('button', { name: 'Select operation counterparty agent team-lead' }));

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
      expect(within(memorySection!).getByText('Team lead preserved the carried secondary workflow correlation')).toBeVisible();
    });

    const newFetchUrlsAfterPivot = vi
      .mocked(globalThis.fetch)
      .mock.calls.slice(fetchCallCountBeforePivot)
      .map(([input]) => (typeof input === 'string' ? input : input.toString()));

    expect(newFetchUrlsAfterPivot).toContain(teamLeadWorkflowUrl);
    expect(newFetchUrlsAfterPivot).toContain(teamLeadSelectedSecondaryCorrelationMemoryArtifactsUrl);
    expect(newFetchUrlsAfterPivot).not.toContain(correlationUrl);
    expect(newFetchUrlsAfterPivot).not.toContain(teamLeadSelectedCorrelationMemoryArtifactsUrl);
    expect(newFetchUrlsAfterPivot).not.toContain(teamLeadMemoryArtifactsUrl);
    expect(newFetchUrlsAfterPivot).not.toContain(teamLeadSelectedOperationUrl);
  });

  it('switches the Current Operation correlation button back to the selected operation correlation without changing the selected agent', async () => {
    const growthRevenueReviewCorrelationUrl = '/correlations/corr-growth-lead-review?limit=10&window=60m';
    const revenueHandoffCorrelationUrl = '/correlations/corr-revenue-handoff?limit=10&window=60m';
    const growthRevenueSelectedGrowthLeadReviewMemoryArtifactsUrl =
      '/memory/artifacts?limit=4&window=60m&agent_id=growth-revenue&correlation_id=corr-growth-lead-review';
    const growthRevenueSelectedRevenueHandoffMemoryArtifactsUrl =
      '/memory/artifacts?limit=4&window=60m&agent_id=growth-revenue&correlation_id=corr-revenue-handoff';
    const growthRevenueSelectedOperationFixture = {
      generated_at: '2026-03-16T09:00:00.000Z',
      summary: {
        item_count: 1,
        blocked_count: 0,
        reboot_recommended_count: 0,
        state_buckets: {
          planning: 1
        },
        severity_buckets: {
          normal: 0,
          yellow: 1,
          orange: 0,
          red: 0
        }
      },
      items: [
        {
          ...planningOperationsFixture.items[0],
          active_task: 'Prepare handoff notes',
          correlation_id: 'corr-growth-lead-review',
          latest_event: {
            event_id: 'evt-growth-handoff-plan',
            actor_id: 'team-lead',
            event_type: 'handoff_prepared',
            ts: '2026-03-16T08:56:00.000Z',
            summary: 'Prepared handoff notes',
            source_kind: 'workspace_snapshot',
            evidence_refs: ['/tmp/growth-handoff.md'],
            counterparty_agent_ids: ['team-lead']
          }
        }
      ]
    };
    const growthRevenueWorkflowCorrelationFixture = {
      ...growthRevenueWorkflowFixture,
      correlation_ids: ['corr-growth-lead-review', 'corr-revenue-handoff']
    } satisfies AgentWorkflow;
    const growthRevenueReviewCorrelationFixture = {
      ...correlationFixture,
      correlation_id: 'corr-growth-lead-review',
      participant_agent_ids: ['growth-revenue', 'team-lead'],
      first_ts: '2026-03-16T08:55:00.000Z',
      last_ts: '2026-03-16T08:58:00.000Z',
      incident_count: 0,
      interaction_count: 1,
      event_count: 2,
      incidents: [],
      interactions: [
        {
          ...correlationFixture.interactions[0],
          interaction_id: 'interaction-growth-review',
          correlation_id: 'corr-growth-lead-review',
          participant_agent_ids: ['growth-revenue', 'team-lead'],
          summary: 'Growth synced with lead on the handoff review'
        }
      ],
      timeline: [
        {
          ...correlationFixture.timeline[0],
          event_id: 'evt-growth-review-1',
          agent_id: 'growth-revenue',
          actor_id: 'growth-revenue',
          event_type: 'agent_noted',
          current_state: 'planning',
          summary: 'Prepared handoff notes',
          correlation_id: 'corr-growth-lead-review',
          counterparty_agent_ids: [],
          evidence_refs: ['/tmp/growth-handoff.md'],
          source_kind: 'workspace_snapshot'
        },
        {
          ...correlationFixture.timeline[0],
          event_id: 'evt-growth-review-2',
          agent_id: 'growth-revenue',
          actor_id: 'team-lead',
          event_type: 'handoff_prepared',
          current_state: 'planning',
          summary: 'Lead reviewed the planned revenue handoff',
          correlation_id: 'corr-growth-lead-review',
          counterparty_agent_ids: ['team-lead'],
          evidence_refs: ['/tmp/growth-handoff.md'],
          source_kind: 'controller_event'
        }
      ]
    };
    const revenueHandoffCorrelationFixture = {
      ...secondaryCorrelationFixture,
      correlation_id: 'corr-revenue-handoff',
      participant_agent_ids: ['growth-revenue', 'team-lead'],
      evidence_refs: ['/tmp/revenue-handoff.md'],
      incidents: [
        {
          ...secondaryCorrelationFixture.incidents[0],
          incident_id: 'inc-revenue-handoff',
          agent_id: 'growth-revenue',
          actor_id: 'team-lead',
          summary: 'Revenue handoff cleared for launch',
          correlation_id: 'corr-revenue-handoff',
          evidence_refs: ['/tmp/revenue-handoff.md'],
          counterparty_agent_ids: ['team-lead']
        }
      ],
      timeline: [
        {
          ...secondaryCorrelationFixture.timeline[0],
          event_id: 'evt-revenue-handoff',
          agent_id: 'growth-revenue',
          actor_id: 'team-lead',
          summary: 'Revenue handoff cleared for launch',
          correlation_id: 'corr-revenue-handoff',
          counterparty_agent_ids: ['team-lead'],
          evidence_refs: ['/tmp/revenue-handoff.md']
        }
      ]
    };
    const growthRevenueSelectedGrowthLeadReviewMemoryArtifactsFixture = {
      generated_at: '2026-03-16T09:00:00.000Z',
      items: [
        {
          artifact_ref: '/tmp/growth-handoff.md',
          artifact_kind: 'workspace_file',
          file_name: 'growth-handoff.md',
          first_seen_at: '2026-03-16T08:55:00.000Z',
          last_seen_at: '2026-03-16T08:58:00.000Z',
          mention_count: 2,
          agent_ids: ['growth-revenue', 'team-lead'],
          correlation_ids: ['corr-growth-lead-review'],
          source_kinds: ['workspace_snapshot', 'controller_event'],
          latest_summary: 'Growth revenue stayed scoped to the current operation handoff review',
          latest_event_type: 'handoff_prepared',
          collector_last_modified_at: '2026-03-16T08:58:00.000Z'
        }
      ]
    };
    const growthRevenueSelectedRevenueHandoffMemoryArtifactsFixture = {
      generated_at: '2026-03-16T09:00:00.000Z',
      items: [
        {
          artifact_ref: '/tmp/revenue-handoff.md',
          artifact_kind: 'workspace_file',
          file_name: 'revenue-handoff.md',
          first_seen_at: '2026-03-16T08:57:00.000Z',
          last_seen_at: '2026-03-16T08:57:00.000Z',
          mention_count: 1,
          agent_ids: ['growth-revenue', 'team-lead'],
          correlation_ids: ['corr-revenue-handoff'],
          source_kinds: ['controller_event'],
          latest_summary: 'Growth revenue briefly switched to the workflow-selected handoff correlation',
          latest_event_type: 'handoff_completed',
          collector_last_modified_at: null
        }
      ]
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === growthRevenueSelectedOperationUrl) {
          return jsonResponse(growthRevenueSelectedOperationFixture);
        }

        if (url === growthRevenueWorkflowUrl) {
          return jsonResponse(growthRevenueWorkflowCorrelationFixture);
        }

        if (url === growthRevenueReviewCorrelationUrl) {
          return jsonResponse(growthRevenueReviewCorrelationFixture);
        }

        if (url === revenueHandoffCorrelationUrl) {
          return jsonResponse(revenueHandoffCorrelationFixture);
        }

        if (url === growthRevenueSelectedGrowthLeadReviewMemoryArtifactsUrl) {
          return jsonResponse(growthRevenueSelectedGrowthLeadReviewMemoryArtifactsFixture);
        }

        if (url === growthRevenueSelectedRevenueHandoffMemoryArtifactsUrl) {
          return jsonResponse(growthRevenueSelectedRevenueHandoffMemoryArtifactsFixture);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect Growth Revenue Agent' }));

    const operationSection = (await within(details).findByRole('heading', { name: 'Current Operation' })).closest('section');
    const workflowSection = (await within(details).findByRole('heading', { name: 'Workflow' })).closest('section');
    const correlationSection = (await within(details).findByRole('heading', { name: 'Correlation Drilldown' })).closest(
      'section'
    );
    expect(operationSection).not.toBeNull();
    expect(workflowSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      expect(within(details).getByRole('heading', { name: 'Current Operation' })).toBeVisible();
      expect(within(operationSection!).getByText('planning · Prepare handoff notes')).toBeVisible();
      expect(
        within(operationSection!).getByRole('button', { name: /Open operation correlation corr-growth-lead-review/ })
      ).toBeVisible();
      expect(
        within(workflowSection!).getByRole('button', { name: 'Open workflow correlation corr-revenue-handoff' })
      ).toBeVisible();
      expect(within(correlationSection!).getByText('corr-growth-lead-review')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-revenue-handoff')).not.toBeInTheDocument();
    });

    await user.click(
      within(workflowSection!).getByRole('button', { name: 'Open workflow correlation corr-revenue-handoff' })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      expect(within(details).getByRole('heading', { name: 'Current Operation' })).toBeVisible();
      expect(within(operationSection!).getByText('planning · Prepare handoff notes')).toBeVisible();
      expect(
        within(operationSection!).getByRole('button', { name: /Open operation correlation corr-growth-lead-review/ })
      ).toBeVisible();
      expect(within(correlationSection!).getByText('corr-revenue-handoff')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-growth-lead-review')).not.toBeInTheDocument();
    });

    const requestCountBeforeOperationCorrelationOpen = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(operationSection!).getByRole('button', { name: 'Open operation correlation corr-growth-lead-review' })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      expect(within(details).getByRole('heading', { name: 'Current Operation' })).toBeVisible();
      expect(within(operationSection!).getByText('planning · Prepare handoff notes')).toBeVisible();
      expect(within(correlationSection!).getByText('corr-growth-lead-review')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-revenue-handoff')).not.toBeInTheDocument();
    });

    const postOperationCorrelationSelectionRequests = vi
      .mocked(globalThis.fetch)
      .mock.calls.slice(requestCountBeforeOperationCorrelationOpen)
      .map(([input]) => (typeof input === 'string' ? input : input.toString()));

    expect(postOperationCorrelationSelectionRequests).toContain(growthRevenueReviewCorrelationUrl);
    expect(postOperationCorrelationSelectionRequests).toContain(
      growthRevenueSelectedGrowthLeadReviewMemoryArtifactsUrl
    );
    expect(postOperationCorrelationSelectionRequests).not.toContain(revenueHandoffCorrelationUrl);
    expect(postOperationCorrelationSelectionRequests).not.toContain(
      growthRevenueSelectedRevenueHandoffMemoryArtifactsUrl
    );
    expect(postOperationCorrelationSelectionRequests).not.toContain(growthRevenueMemoryArtifactsUrl);
    expect(postOperationCorrelationSelectionRequests).not.toContain(growthRevenueSelectedOperationUrl);
    expect(postOperationCorrelationSelectionRequests).not.toContain(growthRevenueWorkflowUrl);
    expect(postOperationCorrelationSelectionRequests).not.toContain(teamLeadSelectedOperationUrl);
    expect(postOperationCorrelationSelectionRequests).not.toContain(teamLeadWorkflowUrl);
    expect(postOperationCorrelationSelectionRequests).not.toContain(selectedOperationUrl);
    expect(postOperationCorrelationSelectionRequests).not.toContain(workflowUrl);
    expect(postOperationCorrelationSelectionRequests).not.toContain(teamLeadSelectedCorrelationMemoryArtifactsUrl);
  });

  it('jumps from current-operation evidence refs to shared memory without changing the selected agent, queue-derived operation context, or correlation', async () => {
    const currentOperationEvidenceJumpFixture = {
      ...operationsFixture,
      items: [
        {
          ...operationsFixture.items[0],
          latest_event: operationsFixture.items[0].latest_event
            ? {
                ...operationsFixture.items[0].latest_event,
                evidence_refs: ['/tmp/evidence.md', '/tmp/missing.md']
              }
            : null
        },
        operationsFixture.items[1]
      ]
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === operationsUrl || url === selectedOperationUrl) {
          return jsonResponse(currentOperationEvidenceJumpFixture);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const operationSection = within(details).getByRole('heading', { name: 'Current Operation' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(operationSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(memorySection!).getByText('Ref · /tmp/evidence.md')).toBeVisible();
      expect(operationSection!).toHaveTextContent('Evidence · /tmp/evidence.md, /tmp/missing.md');
    });

    const artifactRecord = within(memorySection!).getByText('Ref · /tmp/evidence.md').closest('li');
    expect(artifactRecord).not.toBeNull();
    expect(
      within(operationSection!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/evidence.md'
      })
    ).toBeVisible();
    expect(
      within(operationSection!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/missing.md'
      })
    ).toBeVisible();

    const fetchCallCountBeforeJump = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(operationSection!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/evidence.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    expect(within(details).getByRole('heading', { name: 'Current Operation' })).toBeVisible();
    expect(
      within(operationSection!).getByRole('button', {
        name: 'Open operation correlation corr-app-review, currently selected'
      })
    ).toBeVisible();
    expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(fetchCallCountBeforeJump);
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
  });

  it('falls back to one exact shared-memory artifact fetch for current-operation evidence refs that are outside the loaded slice', async () => {
    const currentOperationExactArtifactFixture = {
      ...operationsFixture,
      items: [
        {
          ...operationsFixture.items[0],
          latest_event: operationsFixture.items[0].latest_event
            ? {
                ...operationsFixture.items[0].latest_event,
                evidence_refs: ['/tmp/evidence.md', '/tmp/missing.md']
              }
            : null
        },
        operationsFixture.items[1]
      ]
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === operationsUrl || url === selectedOperationUrl) {
          return jsonResponse(currentOperationExactArtifactFixture);
        }

        if (url === selectedCorrelationMissingArtifactExactUrl) {
          return jsonResponse({
            generated_at: '2026-03-16T09:00:00.000Z',
            items: [
              {
                artifact_ref: '/tmp/missing.md',
                artifact_kind: 'evidence_ref',
                file_name: 'missing.md',
                first_seen_at: '2026-03-16T08:58:30.000Z',
                last_seen_at: '2026-03-16T08:58:30.000Z',
                mention_count: 1,
                agent_ids: ['app-engineering', 'team-lead'],
                correlation_ids: ['corr-app-review'],
                source_kinds: ['controller_event'],
                latest_summary: 'Exact artifact fallback stayed inside the current operation scope',
                latest_event_type: 'agent_noted',
                collector_last_modified_at: null
              }
            ]
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const operationSection = within(details).getByRole('heading', { name: 'Current Operation' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(operationSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(details).getByRole('heading', { name: 'Current Operation' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(memorySection!).getByText('Ref · /tmp/evidence.md')).toBeVisible();
    });

    const fetchCallCountBeforeJump = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(operationSection!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/missing.md'
      })
    );

    await waitFor(() => {
      expect(within(memorySection!).getByText('Exact artifact fallback stayed inside the current operation scope')).toBeVisible();
    });

    const missingArtifactRecord = within(memorySection!).getByText('Ref · /tmp/missing.md').closest('li');
    expect(missingArtifactRecord).not.toBeNull();
    expect(document.activeElement).toBe(missingArtifactRecord);
    expect(within(memorySection!).getByText('Request scope · app-engineering · corr-app-review')).toBeVisible();
    expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    expect(within(details).getByRole('heading', { name: 'Current Operation' })).toBeVisible();
    expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();

    const newFetchUrlsAfterJump = vi
      .mocked(globalThis.fetch)
      .mock.calls.slice(fetchCallCountBeforeJump)
      .map(([input]) => (typeof input === 'string' ? input : input.toString()));
    expect(newFetchUrlsAfterJump).toEqual([selectedCorrelationMissingArtifactExactUrl]);
  });

  it('treats a mismatched exact shared-memory response as a miss instead of focusing an unrelated artifact', async () => {
    const currentOperationExactArtifactFixture = {
      ...operationsFixture,
      items: [
        {
          ...operationsFixture.items[0],
          latest_event: operationsFixture.items[0].latest_event
            ? {
                ...operationsFixture.items[0].latest_event,
                evidence_refs: ['/tmp/evidence.md', '/tmp/missing.md']
              }
            : null
        },
        operationsFixture.items[1]
      ]
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === operationsUrl || url === selectedOperationUrl) {
          return jsonResponse(currentOperationExactArtifactFixture);
        }

        if (url === selectedCorrelationMissingArtifactExactUrl) {
          return jsonResponse({
            generated_at: '2026-03-16T09:00:00.000Z',
            items: [
              {
                artifact_ref: '/tmp/unrelated.md',
                artifact_kind: 'evidence_ref',
                file_name: 'unrelated.md',
                first_seen_at: '2026-03-16T08:58:30.000Z',
                last_seen_at: '2026-03-16T08:58:30.000Z',
                mention_count: 1,
                agent_ids: ['app-engineering'],
                correlation_ids: ['corr-app-review'],
                source_kinds: ['controller_event'],
                latest_summary: 'Unrelated artifact should not satisfy an exact jump',
                latest_event_type: 'agent_noted',
                collector_last_modified_at: null
              }
            ]
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const operationSection = within(details).getByRole('heading', { name: 'Current Operation' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(operationSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await user.click(
      within(operationSection!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/missing.md'
      })
    );

    await waitFor(() => {
      expect(
        within(memorySection!).getByText(
          'Shared memory miss. /tmp/missing.md is not available in app-engineering · corr-app-review.'
        )
      ).toBeVisible();
    });

    expect(within(memorySection!).queryByText('Ref · /tmp/unrelated.md')).not.toBeInTheDocument();
    expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    expect(within(details).getByRole('heading', { name: 'Current Operation' })).toBeVisible();
    expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    expect(operationSection!).toHaveTextContent('Evidence · /tmp/evidence.md, /tmp/missing.md');
  });

  it('shows an explicit shared-memory miss state for current-operation evidence jumps without resetting the current context', async () => {
    const currentOperationExactArtifactFixture = {
      ...operationsFixture,
      items: [
        {
          ...operationsFixture.items[0],
          latest_event: operationsFixture.items[0].latest_event
            ? {
                ...operationsFixture.items[0].latest_event,
                evidence_refs: ['/tmp/evidence.md', '/tmp/missing.md']
              }
            : null
        },
        operationsFixture.items[1]
      ]
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === operationsUrl || url === selectedOperationUrl) {
          return jsonResponse(currentOperationExactArtifactFixture);
        }

        if (url === selectedCorrelationMissingArtifactExactUrl) {
          return jsonResponse({
            generated_at: '2026-03-16T09:00:00.000Z',
            items: []
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const operationSection = within(details).getByRole('heading', { name: 'Current Operation' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(operationSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await user.click(
      within(operationSection!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/missing.md'
      })
    );

    await waitFor(() => {
      expect(
        within(memorySection!).getByText(
          'Shared memory miss. /tmp/missing.md is not available in app-engineering · corr-app-review.'
        )
      ).toBeVisible();
    });

    expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    expect(within(details).getByRole('heading', { name: 'Current Operation' })).toBeVisible();
    expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    expect(operationSection!).toHaveTextContent('Evidence · /tmp/evidence.md, /tmp/missing.md');
  });

  it('shows an explicit shared-memory error state for current-operation evidence jumps without resetting the current context', async () => {
    const currentOperationExactArtifactFixture = {
      ...operationsFixture,
      items: [
        {
          ...operationsFixture.items[0],
          latest_event: operationsFixture.items[0].latest_event
            ? {
                ...operationsFixture.items[0].latest_event,
                evidence_refs: ['/tmp/evidence.md', '/tmp/missing.md']
              }
            : null
        },
        operationsFixture.items[1]
      ]
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === operationsUrl || url === selectedOperationUrl) {
          return jsonResponse(currentOperationExactArtifactFixture);
        }

        if (url === selectedCorrelationMissingArtifactExactUrl) {
          return new Response(
            JSON.stringify({
              error: 'internal_error',
              details: 'shared memory exact fetch failed'
            }),
            {
              status: 500,
              headers: { 'content-type': 'application/json' }
            }
          );
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const operationSection = within(details).getByRole('heading', { name: 'Current Operation' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(operationSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await user.click(
      within(operationSection!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/missing.md'
      })
    );

    await waitFor(() => {
      expect(
        within(memorySection!).getByText(
          'Shared memory jump failed for /tmp/missing.md in app-engineering · corr-app-review. shared memory exact fetch failed'
        )
      ).toBeVisible();
    });

    expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    expect(within(details).getByRole('heading', { name: 'Current Operation' })).toBeVisible();
    expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    expect(operationSection!).toHaveTextContent('Evidence · /tmp/evidence.md, /tmp/missing.md');
  });

  it('jumps from active-queue evidence refs to shared memory without changing the queue filter, selected agent, current-operation context, or correlation', async () => {
    const activeQueueEvidenceJumpFixture = {
      ...operationsFixture,
      items: [
        {
          ...operationsFixture.items[0],
          latest_event: operationsFixture.items[0].latest_event
            ? {
                ...operationsFixture.items[0].latest_event,
                evidence_refs: ['/tmp/evidence.md', '/tmp/missing.md']
              }
            : null
        },
        {
          ...operationsFixture.items[1],
          latest_event: operationsFixture.items[1].latest_event
            ? {
                ...operationsFixture.items[1].latest_event,
                evidence_refs: []
              }
            : {
                event_id: 'evt-team-lead',
                event_type: 'agent_noted',
                ts: '2026-03-16T08:59:10.000Z',
                summary: 'No linked evidence refs',
                source_kind: 'controller_event',
                evidence_refs: [],
                counterparty_agent_ids: []
              }
        }
      ]
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === operationsUrl || url === blockedOperationsUrl || url === selectedOperationUrl) {
          return jsonResponse(activeQueueEvidenceJumpFixture);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const queueSection = within(details).getByRole('heading', { name: 'Active Queue' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(queueSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    expect(within(queueSection!).getByText('Evidence · No evidence refs')).toBeVisible();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'App Engineering Agent' })).not.toBeInTheDocument();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(memorySection!).getByText('Ref · /tmp/evidence.md')).toBeVisible();
    });

    await user.selectOptions(
      within(queueSection!).getByRole('combobox', { name: 'Filter active queue by state' }),
      'blocked'
    );

    const queueRecord = await within(queueSection!)
      .findByRole('button', { name: 'Inspect App Engineering Agent from active queue' })
      .then((button) => button.closest('li'));
    expect(queueRecord).not.toBeNull();
    expect(queueRecord!).toHaveTextContent('Evidence · /tmp/evidence.md, /tmp/missing.md');
    const artifactRecord = within(memorySection!).getByText('Ref · /tmp/evidence.md').closest('li');
    expect(artifactRecord).not.toBeNull();
    expect(
      within(queueRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/evidence.md'
      })
    ).toBeVisible();
    expect(
      within(queueRecord!).queryByRole('button', {
        name: 'Jump to shared memory artifact /tmp/missing.md'
      })
    ).toBeVisible();

    const fetchCallCountBeforeJump = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(queueRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/evidence.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(within(details).getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    expect(within(details).queryByRole('heading', { name: 'App Engineering Agent' })).not.toBeInTheDocument();
    expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
    expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    expect(
      within(queueSection!).getByRole('combobox', { name: 'Filter active queue by state' })
    ).toHaveValue('blocked');
    expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(fetchCallCountBeforeJump);
    expect(globalThis.fetch).not.toHaveBeenCalledWith(workflowUrl, expect.anything());
    expect(globalThis.fetch).not.toHaveBeenCalledWith(selectedOperationUrl, expect.anything());
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
  });

  it('falls back to one exact shared-memory artifact fetch for active-queue evidence refs outside the loaded slice', async () => {
    const activeQueueExactArtifactFixture = {
      ...operationsFixture,
      items: [
        {
          ...operationsFixture.items[0],
          latest_event: operationsFixture.items[0].latest_event
            ? {
                ...operationsFixture.items[0].latest_event,
                evidence_refs: ['/tmp/evidence.md', '/tmp/missing.md']
              }
            : null
        },
        operationsFixture.items[1]
      ]
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === operationsUrl || url === blockedOperationsUrl || url === selectedOperationUrl) {
          return jsonResponse(activeQueueExactArtifactFixture);
        }

        if (url.endsWith('artifact_ref=%2Ftmp%2Fmissing.md')) {
          return jsonResponse({
            generated_at: '2026-03-16T09:00:00.000Z',
            items: [
              {
                artifact_ref: '/tmp/missing.md',
                artifact_kind: 'evidence_ref',
                file_name: 'missing.md',
                first_seen_at: '2026-03-16T08:58:30.000Z',
                last_seen_at: '2026-03-16T08:58:30.000Z',
                mention_count: 1,
                agent_ids: ['app-engineering', 'team-lead'],
                correlation_ids: ['corr-app-review'],
                source_kinds: ['controller_event'],
                latest_summary: 'Active queue exact fallback stayed inside the crew-overview scope',
                latest_event_type: 'agent_noted',
                collector_last_modified_at: null
              }
            ]
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const queueSection = within(details).getByRole('heading', { name: 'Active Queue' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(queueSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(memorySection!).getByText('Ref · /tmp/evidence.md')).toBeVisible();
    });

    await user.selectOptions(
      within(queueSection!).getByRole('combobox', { name: 'Filter active queue by state' }),
      'blocked'
    );

    const queueRecord = await within(queueSection!)
      .findByRole('button', { name: 'Inspect App Engineering Agent from active queue' })
      .then((button) => button.closest('li'));
    expect(queueRecord).not.toBeNull();
    expect(queueRecord!).toHaveTextContent('Evidence · /tmp/evidence.md, /tmp/missing.md');
    expect(
      within(queueRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/missing.md'
      })
    ).toBeVisible();
    expect(within(memorySection!).queryByText('Ref · /tmp/missing.md')).not.toBeInTheDocument();

    const fetchCallCountBeforeJump = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(queueRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/missing.md'
      })
    );

    await waitFor(() => {
      expect(within(memorySection!).getByText('Ref · /tmp/missing.md')).toBeVisible();
    });

    const missingArtifactRecord = within(memorySection!).getByText('Ref · /tmp/missing.md').closest('li');
    expect(missingArtifactRecord).not.toBeNull();
    expect(within(memorySection!).getByText('Focused exact artifact · /tmp/missing.md')).toBeVisible();
    expect(missingArtifactRecord).toHaveClass('aitown-record--shared-memory-focused');
    expect(within(missingArtifactRecord!).getByText('Focused exact jump')).toBeVisible();
    expect(document.activeElement).toBe(missingArtifactRecord);
    expect(within(details).getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    expect(within(details).queryByRole('heading', { name: 'App Engineering Agent' })).not.toBeInTheDocument();
    expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
    expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    expect(
      within(queueSection!).getByRole('combobox', { name: 'Filter active queue by state' })
    ).toHaveValue('blocked');

    const newFetchUrlsAfterJump = vi
      .mocked(globalThis.fetch)
      .mock.calls.slice(fetchCallCountBeforeJump)
      .map(([input]) => (typeof input === 'string' ? input : input.toString()));
    expect(newFetchUrlsAfterJump).toEqual([crewOverviewMissingArtifactExactUrl]);
    expect(globalThis.fetch).not.toHaveBeenCalledWith(workflowUrl, expect.anything());
    expect(globalThis.fetch).not.toHaveBeenCalledWith(selectedOperationUrl, expect.anything());
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
  });

  it('keeps exactly one focused shared-memory artifact across exact evidence jumps and clears it on scope changes', async () => {
    const activeQueueExactArtifactFixture = {
      ...operationsFixture,
      items: [
        {
          ...operationsFixture.items[0],
          latest_event: operationsFixture.items[0].latest_event
            ? {
                ...operationsFixture.items[0].latest_event,
                evidence_refs: ['/tmp/missing.md', '/tmp/second-missing.md']
              }
            : null
        },
        operationsFixture.items[1]
      ]
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === operationsUrl || url === blockedOperationsUrl || url === selectedOperationUrl) {
          return jsonResponse(activeQueueExactArtifactFixture);
        }

        if (url === crewOverviewMissingArtifactExactUrl) {
          return jsonResponse({
            generated_at: '2026-03-16T09:00:00.000Z',
            items: [
              {
                artifact_ref: '/tmp/missing.md',
                artifact_kind: 'evidence_ref',
                file_name: 'missing.md',
                first_seen_at: '2026-03-16T08:58:30.000Z',
                last_seen_at: '2026-03-16T08:58:30.000Z',
                mention_count: 1,
                agent_ids: ['app-engineering', 'team-lead'],
                correlation_ids: ['corr-app-review'],
                source_kinds: ['controller_event'],
                latest_summary: 'First focused exact artifact stays isolated to the jump state',
                latest_event_type: 'agent_noted',
                collector_last_modified_at: null
              }
            ]
          });
        }

        if (url === crewOverviewSecondMissingArtifactExactUrl) {
          return jsonResponse({
            generated_at: '2026-03-16T09:00:01.000Z',
            items: [
              {
                artifact_ref: '/tmp/second-missing.md',
                artifact_kind: 'evidence_ref',
                file_name: 'second-missing.md',
                first_seen_at: '2026-03-16T08:58:40.000Z',
                last_seen_at: '2026-03-16T08:58:40.000Z',
                mention_count: 1,
                agent_ids: ['app-engineering'],
                correlation_ids: ['corr-app-review'],
                source_kinds: ['controller_event'],
                latest_summary: 'Second focused exact artifact replaces the first one',
                latest_event_type: 'agent_noted',
                collector_last_modified_at: null
              }
            ]
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const queueSection = within(details).getByRole('heading', { name: 'Active Queue' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(queueSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    await user.selectOptions(
      within(queueSection!).getByRole('combobox', { name: 'Filter active queue by state' }),
      'blocked'
    );

    const queueRecord = await within(queueSection!)
      .findByRole('button', { name: 'Inspect App Engineering Agent from active queue' })
      .then((button) => button.closest('li'));
    expect(queueRecord).not.toBeNull();
    expect(queueRecord!).toHaveTextContent('Evidence · /tmp/missing.md, /tmp/second-missing.md');

    await user.click(
      within(queueRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/missing.md'
      })
    );

    await waitFor(() => {
      expect(within(memorySection!).getByText('Focused exact artifact · /tmp/missing.md')).toBeVisible();
    });

    const firstFocusedRecord = within(memorySection!).getByText('Ref · /tmp/missing.md').closest('li');
    expect(firstFocusedRecord).not.toBeNull();
    expect(firstFocusedRecord).toHaveClass('aitown-record--shared-memory-focused');
    expect(within(firstFocusedRecord!).getByText('Focused exact jump')).toBeVisible();
    expect(within(details).getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    expect(within(details).queryByRole('heading', { name: 'App Engineering Agent' })).not.toBeInTheDocument();

    await user.click(
      within(queueRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/second-missing.md'
      })
    );

    await waitFor(() => {
      expect(within(memorySection!).getByText('Focused exact artifact · /tmp/second-missing.md')).toBeVisible();
    });

    const secondFocusedRecord = within(memorySection!).getByText('Ref · /tmp/second-missing.md').closest('li');
    expect(secondFocusedRecord).not.toBeNull();
    expect(secondFocusedRecord).toHaveClass('aitown-record--shared-memory-focused');
    expect(within(secondFocusedRecord!).getByText('Focused exact jump')).toBeVisible();
    expect(within(memorySection!).queryByText('Focused exact artifact · /tmp/missing.md')).not.toBeInTheDocument();
    expect(within(memorySection!).queryByText('Ref · /tmp/missing.md')).not.toBeInTheDocument();

    await user.click(within(queueSection!).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(memorySection!).queryByText('Focused exact artifact · /tmp/second-missing.md')).not.toBeInTheDocument();
      expect(within(memorySection!).queryByText('Ref · /tmp/second-missing.md')).not.toBeInTheDocument();
    });
  });

  it('shows when a queue-derived operation does not have a latest event yet', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect Team Lead from active queue' }));

    const operationSection = within(details).getByRole('heading', { name: 'Current Operation' }).closest('section');
    const runContextSection = within(details).getByRole('heading', { name: 'Run Context' }).closest('section');
    expect(operationSection).not.toBeNull();
    expect(runContextSection).not.toBeNull();

    await waitFor(() => {
      expect(within(operationSection!).getByText('reviewing · Coordinate rollout')).toBeVisible();
      expect(within(operationSection!).getByText('Latest event · No latest event yet')).toBeVisible();
      expect(within(operationSection!).queryByText('Latest event · Coordinate rollout')).not.toBeInTheDocument();
      expect(within(operationSection!).getByText('Source · No latest event source')).toBeVisible();
      expect(within(runContextSection!).getByText('Run blocker · No current blocker')).toBeVisible();
      expect(within(runContextSection!).getByText('Latest event type · No latest event type')).toBeVisible();
      expect(within(runContextSection!).getByText('Latest event at · No latest event timestamp')).toBeVisible();
      expect(within(runContextSection!).getByText('Last event at · No last event timestamp')).toBeVisible();
      expect(within(runContextSection!).getByText('Last heartbeat · No heartbeat yet')).toBeVisible();
      expect(within(runContextSection!).getByText('Last output · No last output timestamp')).toBeVisible();
      expect(within(runContextSection!).getByText('Staleness · Normal · 1m')).toBeVisible();
      expect(within(runContextSection!).getByText('Reboot recommendation · No')).toBeVisible();
    });
  });

  it('refreshes queue-derived operation context while selected agent details remain open', async () => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 10;

    let operationsRequests = 0;
    const refreshedOperationsFixture = {
      ...operationsFixture,
      generated_at: '2026-03-16T09:00:20.000Z',
      summary: {
        ...operationsFixture.summary,
        item_count: 4,
        blocked_count: 2,
        reboot_recommended_count: 1,
        state_buckets: {
          reviewing: 2,
          blocked: 1,
          coordinating: 1
        },
        severity_buckets: {
          normal: 1,
          yellow: 1,
          orange: 2,
          red: 0
        }
      },
      items: [
        {
          ...operationsFixture.items[0],
          current_state: 'reviewing',
          active_task: 'Verify merged rollout',
          current_blocker: '',
          current_location: 'review-zone',
          correlation_id: 'corr-app-followup',
          latest_event: operationsFixture.items[0].latest_event
            ? {
                ...operationsFixture.items[0].latest_event,
                summary: 'Merged rollout verified',
                source_kind: 'workspace_snapshot',
                evidence_refs: ['/tmp/review.log'],
                counterparty_agent_ids: ['growth-revenue']
              }
            : null
        },
        {
          ...operationsFixture.items[0],
          agent_id: 'growth-revenue',
          display_name: 'Growth Revenue Agent',
          active_task: 'Stabilize launch handoff',
          current_blocker: 'Need live launch metrics',
          current_location: 'launch-bridge',
          correlation_id: 'corr-growth-launch'
        },
        operationsFixture.items[1],
        {
          ...operationsFixture.items[1],
          agent_id: 'market-intel',
          display_name: 'Market Intel Agent',
          current_state: 'blocked',
          active_task: 'Escalate policy spike',
          current_blocker: 'Awaiting policy note',
          current_location: 'policy-room',
          effective_severity: 'yellow',
          reported_severity: 'yellow',
          correlation_id: 'corr-policy-spike'
        }
      ]
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl) {
          operationsRequests += 1;
          return new Response(JSON.stringify(operationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === selectedOperationUrl) {
          operationsRequests += 1;
          return new Response(JSON.stringify(refreshedOperationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          return new Response(JSON.stringify(workflowFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === correlationUrl) {
          return new Response(JSON.stringify(correlationFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const operationSection = within(details).getByRole('heading', { name: 'Current Operation' }).closest('section');
    const runContextSection = within(details).getByRole('heading', { name: 'Run Context' }).closest('section');
    expect(operationSection).not.toBeNull();
    expect(runContextSection).not.toBeNull();

    await waitFor(() => {
      expect(operationsRequests).toBeGreaterThan(1);
      expect(globalThis.fetch).toHaveBeenCalledWith(selectedOperationUrl, expect.anything());
    });

    await waitFor(() => {
      expect(within(operationSection!).getByText('reviewing · Verify merged rollout')).toBeVisible();
      expect(within(operationSection!).getByText('Location · review-zone')).toBeVisible();
      expect(within(operationSection!).getByText('Latest event · Merged rollout verified')).toBeVisible();
      expect(within(operationSection!).getByRole('button', { name: /Open operation correlation corr-app-followup/ })).toBeVisible();
      expect(within(operationSection!).getByRole('button', { name: 'Select operation counterparty agent growth-revenue' })).toBeVisible();
      expect(operationSection!).toHaveTextContent('Counterparties · growth-revenue');
      expect(operationSection!).toHaveTextContent('Evidence · /tmp/review.log');
      expect(within(operationSection!).getByText('Source · workspace_snapshot')).toBeVisible();
      expect(within(runContextSection!).getByText('Run blocker · No current blocker')).toBeVisible();
      expect(within(runContextSection!).getByText('Latest event type · peer_watch_alert_raised')).toBeVisible();
      expect(within(runContextSection!).getByText('Latest event at · 2026-03-16T08:50:00.000Z')).toBeVisible();
      expect(within(runContextSection!).getByText('Last event at · 2026-03-16T08:50:00.000Z')).toBeVisible();
      expect(within(runContextSection!).getByText('Last heartbeat · 2026-03-16T08:59:30.000Z')).toBeVisible();
      expect(within(runContextSection!).getByText('Last output · 2026-03-16T08:38:00.000Z')).toBeVisible();
      expect(within(runContextSection!).getByText('Staleness · Orange · 22m')).toBeVisible();
      expect(within(runContextSection!).getByText('Reboot recommendation · Recommended')).toBeVisible();
    });
  });

  it('shows a stale-operation warning when queue-derived refresh fails after selection', async () => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 10;

    let operationsRequests = 0;
    const staleOperationFixture = {
      ...operationsFixture,
      items: [
        {
          ...operationsFixture.items[0],
          latest_event: operationsFixture.items[0].latest_event
            ? {
                ...operationsFixture.items[0].latest_event,
                summary: 'Stale queue snapshot should not win',
                source_kind: 'api_cache',
                evidence_refs: ['/tmp/stale.md']
              }
            : null
        },
        operationsFixture.items[1]
      ]
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl) {
          operationsRequests += 1;
          return new Response(JSON.stringify(staleOperationFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === selectedOperationUrl) {
          operationsRequests += 1;
          return new Response(JSON.stringify({ error: 'internal_error', details: 'operations refresh failed' }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          return new Response(JSON.stringify(workflowFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === correlationUrl) {
          return new Response(JSON.stringify(correlationFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const operationSection = (await within(details).findByRole('heading', { name: 'Current Operation' })).closest('section');
    expect(operationSection).not.toBeNull();

    const auditSignalsSection = within(details).getByRole('heading', { name: 'Audit Signals' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(auditSignalsSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(operationsRequests).toBeGreaterThan(1);
      expect(globalThis.fetch).toHaveBeenCalledWith(selectedOperationUrl, expect.anything());
      expect(within(details).getByText('Showing last operation snapshot. operations refresh failed')).toBeVisible();
      expect(within(operationSection!).getByText('blocked · Workflow evidence is still incomplete')).toBeVisible();
      expect(within(operationSection!).getByText('Latest event · Stale queue snapshot should not win')).toBeVisible();
      expect(within(operationSection!).getByText('Counterparties · team-lead')).toBeVisible();
      expect(
        within(operationSection!).queryByRole('button', { name: 'Select operation counterparty agent team-lead' })
      ).not.toBeInTheDocument();
      expect(within(auditSignalsSection!).getByText('What · Agent attached workflow evidence for lead review')).toBeVisible();
      expect(within(auditSignalsSection!).queryByText('What · Stale queue snapshot should not win')).not.toBeInTheDocument();
      expect(auditSignalsSection!).toHaveTextContent(
        'Evidence · /tmp/evidence.md, /tmp/reboot-note.md, /tmp/peer-watch.md'
      );
      expect(within(auditSignalsSection!).queryByText(/\/tmp\/secondary-evidence\.md/)).not.toBeInTheDocument();
      expect(within(auditSignalsSection!).queryByText(/\/tmp\/stale\.md/)).not.toBeInTheDocument();
      expect(within(auditSignalsSection!).getByText('Source · controller_event, workspace_snapshot')).toBeVisible();
      expect(within(auditSignalsSection!).queryByText(/collector:team-lead/)).not.toBeInTheDocument();
      expect(within(auditSignalsSection!).queryByText(/api_cache/)).not.toBeInTheDocument();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(correlationSection!).queryByText('operations refresh failed')).not.toBeInTheDocument();
    });
  });

  it('falls back to no correlation when stale operation refresh fails and workflow has none', async () => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 10;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl) {
          return new Response(JSON.stringify(operationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === selectedOperationUrl) {
          return new Response(JSON.stringify({ error: 'internal_error', details: 'operations refresh failed' }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          return new Response(JSON.stringify(teamLeadWorkflowFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === correlationUrl) {
          return new Response(JSON.stringify(correlationFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByText('Showing last operation snapshot. operations refresh failed')).toBeVisible();
      expect(within(correlationSection!).getByText('No correlation selected.')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
    });
  });

  it('keeps the last operation snapshot visible when the agent leaves the active queue', async () => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 10;

    let operationsRequests = 0;
    let dropSelectedOperation = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl) {
          operationsRequests += 1;
          return new Response(JSON.stringify(operationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === selectedOperationUrl) {
          operationsRequests += 1;
          return new Response(JSON.stringify(dropSelectedOperation ? emptyOperationsFixture : operationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          return new Response(JSON.stringify(workflowFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === correlationUrl) {
          return new Response(JSON.stringify(correlationFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const operationSection = (await within(details).findByRole('heading', { name: 'Current Operation' })).closest('section');
    expect(operationSection).not.toBeNull();
    dropSelectedOperation = true;

    await waitFor(() => {
      expect(operationsRequests).toBeGreaterThan(1);
      expect(within(details).getByText('Showing last operation snapshot. Operation is no longer in the active queue.')).toBeVisible();
      expect(within(operationSection!).getByText('blocked · Workflow evidence is still incomplete')).toBeVisible();
      expect(within(operationSection!).getByText('Counterparties · team-lead')).toBeVisible();
      expect(
        within(operationSection!).queryByRole('button', { name: 'Select operation counterparty agent team-lead' })
      ).not.toBeInTheDocument();
    });
  });

  it('clears stale operation-derived accountability correlation when the queue snapshot expires', async () => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 10;

    let dropSelectedOperation = false;
    const workflowWithoutCorrelations = {
      ...workflowFixture,
      correlation_ids: [],
      detail: {
        ...workflowFixture.detail,
        open_peer_watch_alerts: []
      }
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl) {
          return new Response(JSON.stringify(operationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === selectedOperationUrl) {
          return new Response(JSON.stringify(dropSelectedOperation ? emptyOperationsFixture : operationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          return new Response(JSON.stringify(workflowWithoutCorrelations), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === correlationUrl) {
          return new Response(JSON.stringify(correlationFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const auditSection = within(details).getByRole('heading', { name: 'Audit Signals' }).closest('section');
    expect(correlationSection).not.toBeNull();
    expect(auditSection).not.toBeNull();

    expect(await within(correlationSection!).findByText('corr-app-review')).toBeVisible();
    expect(
      within(auditSection!).getByRole('button', {
        name: 'Open accountability correlation corr-app-review, currently selected'
      })
    ).toBeVisible();

    dropSelectedOperation = true;

    await waitFor(() => {
      expect(within(details).getByText('Showing last operation snapshot. Operation is no longer in the active queue.')).toBeVisible();
      expect(within(correlationSection!).getByText('No correlation selected.')).toBeVisible();
      expect(within(auditSection!).getByText('Correlation · No active correlation id')).toBeVisible();
    });

    expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
    expect(
      within(auditSection!).queryByRole('button', { name: /Open accountability correlation corr-app-review/ })
    ).not.toBeInTheDocument();
  });

  it('falls back to the live workflow correlation when the queue snapshot becomes stale', async () => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 10;

    let dropSelectedOperation = false;
    const refreshedWorkflowFixture = {
      ...workflowFixture,
      correlation_ids: ['corr-app-secondary'],
      detail: {
        ...workflowFixture.detail,
        open_peer_watch_alerts: [
          {
            ...workflowFixture.detail.open_peer_watch_alerts[0],
            correlation_id: 'corr-app-secondary',
            summary: 'Secondary workflow correlation is now active'
          }
        ]
      }
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl || url === selectedOperationUrl) {
          return new Response(JSON.stringify(dropSelectedOperation ? emptyOperationsFixture : operationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          return new Response(JSON.stringify(refreshedWorkflowFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === correlationUrl) {
          return new Response(JSON.stringify({ error: 'not_found', details: 'old correlation removed' }), {
            status: 404,
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === secondaryCorrelationUrl) {
          return new Response(JSON.stringify(secondaryCorrelationFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));
    expect(await within(details).findByRole('heading', { name: 'Current Operation' })).toBeVisible();

    dropSelectedOperation = true;

    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByText('Showing last operation snapshot. Operation is no longer in the active queue.')).toBeVisible();
      expect(within(details).queryByRole('button', { name: /Open operation correlation corr-app-review/ })).not.toBeInTheDocument();
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(correlationSection!).queryByText('old correlation removed')).not.toBeInTheDocument();
      expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
    });
  });

  it('falls back to the live workflow correlation when the selected operation keeps a stale correlation id', async () => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 10;

    const refreshedWorkflowFixture = {
      ...workflowFixture,
      correlation_ids: ['corr-app-secondary'],
      detail: {
        ...workflowFixture.detail,
        open_peer_watch_alerts: [
          {
            ...workflowFixture.detail.open_peer_watch_alerts[0],
            correlation_id: 'corr-app-secondary',
            summary: 'Secondary workflow correlation is now active'
          }
        ]
      }
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl || url === selectedOperationUrl) {
          return new Response(JSON.stringify(operationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          return new Response(JSON.stringify(refreshedWorkflowFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === correlationUrl) {
          return new Response(JSON.stringify({ error: 'not_found', details: 'old correlation removed' }), {
            status: 404,
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === secondaryCorrelationUrl) {
          return new Response(JSON.stringify(secondaryCorrelationFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));
    expect(await within(details).findByRole('heading', { name: 'Current Operation' })).toBeVisible();

    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(correlationSection!).queryByText('old correlation removed')).not.toBeInTheDocument();
      expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
    });
  });

  it('clears stale queue-derived operation context before a fresh roster selection', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));
    expect(await within(details).findByRole('heading', { name: 'Current Operation' })).toBeVisible();

    await user.click(within(details).getByRole('button', { name: 'Clear' }));
    await user.click(within(details).getByRole('button', { name: 'Inspect Team Lead' }));

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(details).getByRole('heading', { name: 'Current Operation' })).toBeVisible();
      expect(within(details).getByText('reviewing · Coordinate rollout')).toBeVisible();
      expect(within(details).queryByText('blocked · Workflow evidence is still incomplete')).not.toBeInTheDocument();
    });
  });

  it('resets toolbar-cleared correlation selection back to the crew-overview default on reopen', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const evidencePanel = await selectSelectedAgentDrilldownTab(user, 'Evidence');
    const incidentSection = within(evidencePanel).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    expect(incidentSection).not.toBeNull();

    await user.click(
      within(incidentSection!).getByRole('button', { name: 'Open incident correlation corr-app-secondary' })
    );

    const replayPanel = await selectSelectedAgentDrilldownTab(user, 'Replay / Correlation');
    const correlationSection = within(replayPanel).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(correlationSection).not.toBeNull();
    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
    });

    await user.click(screen.getByRole('button', { name: 'Clear Selection' }));
    await user.click(screen.getByRole('button', { name: 'Hide Hub' }));
    const reopenedDetails = await openHub(user);
    const reopenedCorrelationSection = within(reopenedDetails)
      .getByRole('heading', { name: 'Correlation Drilldown' })
      .closest('section');
    expect(reopenedCorrelationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(reopenedDetails).getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
      expect(within(reopenedCorrelationSection!).getByText('corr-app-review')).toBeVisible();
    });
    expect(within(reopenedCorrelationSection!).queryByText('corr-app-secondary')).not.toBeInTheDocument();
  }, 10000);

  it('shows operations queue loading state explicitly while the overview queue is still pending', async () => {
    let resolveOperations: ((response: Response) => void) | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return Promise.resolve(
            new Response(JSON.stringify(overviewFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        if (url === operationsUrl || url === selectedOperationUrl) {
          return new Promise<Response>((resolve) => {
            resolveOperations = resolve;
          });
        }

        if (url === incidentsUrl) {
          return Promise.resolve(
            new Response(JSON.stringify(incidentFeedFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        if (url === workflowUrl) {
          return Promise.resolve(
            new Response(JSON.stringify(workflowFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const activeQueueSection = await waitFor(() => {
      const nextActiveQueueSection = within(details).getByRole('heading', { name: 'Active Queue' }).closest('section');
      expect(nextActiveQueueSection).not.toBeNull();
      return nextActiveQueueSection;
    });
    expect(await within(activeQueueSection!).findByText('Loading operations queue...')).toBeVisible();

    expect(resolveOperations).not.toBeNull();
    resolveOperations!(
      new Response(JSON.stringify(operationsFixture), {
        headers: { 'content-type': 'application/json' }
      })
    );

    expect(await within(activeQueueSection!).findByText('blocked · Workflow evidence is still incomplete')).toBeVisible();
  });

  it('filters the crew active queue by state and keeps filtered loading, empty, and error states explicit', async () => {
    let resolveBlockedOperations: ((response: Response) => void) | null = null;
    let blockedOperationsRequests = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return Promise.resolve(
            new Response(JSON.stringify(overviewFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        if (url === operationsUrl) {
          return Promise.resolve(
            new Response(JSON.stringify(operationsFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        if (url === blockedOperationsUrl) {
          blockedOperationsRequests += 1;

          if (blockedOperationsRequests === 1) {
            return new Promise<Response>((resolve) => {
              resolveBlockedOperations = resolve;
            });
          }

          return Promise.resolve(
            new Response(JSON.stringify({ error: 'internal_error', details: 'blocked queue refresh failed' }), {
              status: 500,
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        if (url === reviewingOperationsUrl) {
          return Promise.resolve(
            new Response(JSON.stringify(emptyOperationsFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        if (url === incidentsUrl) {
          return Promise.resolve(
            new Response(JSON.stringify(incidentFeedFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        if (url === timelineUrl) {
          return Promise.resolve(
            new Response(JSON.stringify(timelineFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        return Promise.resolve(resolveTestFetchResponse(url));
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const queueSection = within(details).getByRole('heading', { name: 'Active Queue' }).closest('section');
    expect(queueSection).not.toBeNull();

    const stateFilter = within(queueSection!).getByRole('combobox', {
      name: 'Filter active queue by state'
    });

    expect(within(stateFilter).getByRole('option', { name: 'All states (3)' })).toBeVisible();
    expect(within(stateFilter).getByRole('option', { name: 'Blocked (1)' })).toBeVisible();
    expect(within(stateFilter).getByRole('option', { name: 'Planning (1)' })).toBeVisible();
    expect(within(stateFilter).getByRole('option', { name: 'Reviewing (1)' })).toBeVisible();

    await user.selectOptions(stateFilter, 'blocked');
    expect(await within(queueSection!).findByText('Loading active queue for Blocked state...')).toBeVisible();

    expect(resolveBlockedOperations).not.toBeNull();
    resolveBlockedOperations!(
      new Response(JSON.stringify(blockedOperationsFixture), {
        headers: { 'content-type': 'application/json' }
      })
    );

    await waitFor(() => {
      expect(within(queueSection!).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' })).toBeVisible();
      expect(
        within(queueSection!).queryByRole('button', { name: 'Inspect Team Lead from active queue' })
      ).not.toBeInTheDocument();
    });

    await user.selectOptions(stateFilter, 'reviewing');
    expect(await within(queueSection!).findByText('No active queue items for Reviewing state.')).toBeVisible();

    await user.selectOptions(stateFilter, 'blocked');
    expect(
      await within(queueSection!).findByText(
        'Unable to load active queue for Blocked state. blocked queue refresh failed'
      )
    ).toBeVisible();
  });

  it('shows operations queue failures explicitly instead of pretending empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl || url === selectedOperationUrl) {
          return new Response(JSON.stringify({ error: 'internal_error', details: 'operations refresh failed' }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          return new Response(JSON.stringify(workflowFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    expect(await within(details).findByText('Unable to load active queue. operations refresh failed')).toBeVisible();
    expect(within(details).queryByText('No active operations queue.')).not.toBeInTheDocument();
  });

  it('surfaces read-only workflow summary facets after selecting an agent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === workflowUrl) {
          return jsonResponse({
            ...workflowFixture,
            summary: {
              ...emptyWorkflowSummaryFixture,
              incident_count: 3,
              interaction_count: 2,
              event_count: 5,
              incident_kind_buckets: {
                peer_watch: 2,
                handoff: 1,
                noop: 0
              },
              interaction_type_buckets: {
                peer_watch: 1,
                review: 1
              },
              event_type_buckets: {
                agent_waiting: 2,
                handoff_completed: 1,
                agent_started: 2
              },
              severity_buckets: {
                normal: 1,
                yellow: 2,
                orange: 0,
                red: 1
              },
              latest_activity_at: '2026-03-16T08:58:00.000Z'
            }
          } satisfies AgentWorkflow);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(workflowSection).not.toBeNull();

    await waitFor(() => {
      expect(within(workflowSection!).getByText('Counts · 3 incidents · 2 interactions · 5 events')).toBeVisible();
      expect(within(workflowSection!).getByText('Incident kinds · Peer Watch (2), Handoff (1)')).toBeVisible();
      expect(within(workflowSection!).getByText('Interaction types · Peer Watch (1), Review (1)')).toBeVisible();
      expect(
        within(workflowSection!).getByText(
          'Event types · Agent Started (2), Agent Waiting (2), Handoff Completed (1)'
        )
      ).toBeVisible();
      expect(
        within(workflowSection!).getByText('Severities · Red (1), Orange (0), Yellow (2), Normal (1)')
      ).toBeVisible();
      expect(within(workflowSection!).getByText('Latest activity · 2026-03-16T08:58:00.000Z')).toBeVisible();
    });
  });

  it('loads correlation drilldown from selected-agent workflow evidence', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    await user.click(within(workflowSection!).getByRole('button', { name: /Open workflow correlation corr-app-review/ }));

    await waitFor(() => {
      expect(
        within(correlationSection!).queryByRole('button', { name: 'Select correlation participant agent app-engineering' })
      ).not.toBeInTheDocument();
      expect(
        within(correlationSection!).getByRole('button', { name: 'Select correlation participant agent team-lead' })
      ).toBeVisible();
      expect(within(correlationSection!).getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(correlationUrl, expect.anything());
    });
  });

  it('loads additional workflow pivot correlations from selected-agent workflow pivots', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    expect(within(workflowSection!).getByText('Workflow pivots')).toBeVisible();
    expect(
      within(workflowSection!).getByRole('button', { name: 'Select workflow counterparty agent team-lead' })
    ).toBeVisible();

    await user.click(within(workflowSection!).getByRole('button', { name: 'Open workflow correlation corr-app-secondary' }));

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(
        within(correlationSection!).queryByRole('button', { name: 'Select correlation participant agent app-engineering' })
      ).not.toBeInTheDocument();
      expect(
        within(correlationSection!).getByRole('button', { name: 'Select correlation participant agent growth-revenue' })
      ).toBeVisible();
      expect(within(correlationSection!).getByText('Counts · 1 incidents · 0 interactions · 1 events')).toBeVisible();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(secondaryCorrelationUrl, expect.anything());
    });
  });

  it('opens a selected-agent workflow interaction correlation pivot without clearing the selected agent operation snapshot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === workflowUrl) {
          return jsonResponse({
            ...workflowFixture,
            detail: {
              ...workflowFixture.detail,
              recent_interactions: [
                {
                  ...workflowFixture.detail.recent_interactions[0],
                  interaction_id: 'interaction-app-secondary',
                  correlation_id: 'corr-app-secondary',
                  summary: 'Workflow interaction pivot opens the secondary correlation'
                }
              ]
            }
          } satisfies AgentWorkflow);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await user.click(
      within(workflowSection!).getByRole('button', {
        name: 'Open workflow interaction correlation from interaction interaction-app-secondary corr-app-secondary'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(details).getByRole('heading', { name: 'Current Operation' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(correlationSection!).getByText('Counts · 1 incidents · 0 interactions · 1 events')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(secondaryCorrelationUrl, expect.anything());
    });
  });

  it('preserves the active selected-agent workflow correlation when pivoting through workflow interaction participants', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(
        within(workflowSection!).getByRole('button', { name: /Open workflow correlation corr-app-secondary/ })
      ).toBeVisible();
      expect(
        within(workflowSection!).getByRole('button', {
          name: 'Select workflow interaction participant from interaction interaction-workflow-1 team-lead'
        })
      ).toBeVisible();
    });

    expect(
      within(workflowSection!).queryByRole('button', {
        name: 'Select correlation interaction participant agent team-lead'
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(workflowSection!).getByRole('button', { name: /Open workflow correlation corr-app-secondary/ })
    );

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
    });

    await user.click(
      within(workflowSection!).getByRole('button', {
        name: 'Select workflow interaction participant from interaction interaction-workflow-1 team-lead'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(
        teamLeadSelectedSecondaryCorrelationMemoryArtifactsUrl,
        expect.anything()
      );
      expect(globalThis.fetch).not.toHaveBeenCalledWith(
        teamLeadSelectedCorrelationMemoryArtifactsUrl,
        expect.anything()
      );
    });
  });

  it('preserves the clicked selected-agent workflow correlation when opening a workflow recent-event actor pivot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === workflowUrl) {
          return jsonResponse({
            ...workflowFixture,
            detail: {
              ...workflowFixture.detail,
              recent_events: [
                {
                  ...workflowFixture.detail.recent_events[0],
                  actor_id: 'team-lead',
                  summary: 'Workflow recent event actor pivot keeps the active review correlation'
                }
              ]
            }
          } satisfies AgentWorkflow);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await user.click(
      within(workflowSection!).getByRole('button', {
        name: 'Select workflow recent event actor from event evt-workflow-1 team-lead'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(correlationUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
    });
  });

  it('keeps unknown workflow and correlation agent ids as plain text instead of broken pivots', async () => {
    const incidentFeedWithUnknownAgentFixture = {
      ...incidentFeedFixture,
      items: incidentFeedFixture.items.map((item, index) =>
        index === 1
          ? {
              ...item,
              agent_id: 'ghost-agent'
            }
          : item
      )
    };
    const workflowWithUnknownCounterpartyFixture = {
      ...workflowFixture,
      counterparty_agent_ids: ['team-lead', 'ghost-agent']
    };
    const correlationWithUnknownParticipantFixture = {
      ...secondaryCorrelationFixture,
      participant_agent_ids: ['app-engineering', 'growth-revenue', 'ghost-agent']
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl || url === selectedOperationUrl) {
          return new Response(JSON.stringify(operationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedWithUnknownAgentFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          return new Response(JSON.stringify(workflowWithUnknownCounterpartyFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === teamLeadWorkflowUrl) {
          return new Response(JSON.stringify(teamLeadWorkflowFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === correlationUrl) {
          return new Response(JSON.stringify(correlationFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === secondaryCorrelationUrl) {
          return new Response(JSON.stringify(correlationWithUnknownParticipantFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(workflowSection!).toHaveTextContent('Counterparties · team-lead, ghost-agent');
      expect(
        within(workflowSection!).getByRole('button', { name: 'Select workflow counterparty agent team-lead' })
      ).toBeVisible();
      expect(
        within(workflowSection!).queryByRole('button', { name: 'Select workflow counterparty agent ghost-agent' })
      ).not.toBeInTheDocument();
    });

    await user.click(within(workflowSection!).getByRole('button', { name: 'Open workflow correlation corr-app-secondary' }));

    await waitFor(() => {
      expect(correlationSection!).toHaveTextContent('Participants · app-engineering, growth-revenue, ghost-agent');
      expect(
        within(correlationSection!).getByRole('button', { name: 'Select correlation participant agent growth-revenue' })
      ).toBeVisible();
      expect(
        within(correlationSection!).queryByRole('button', { name: 'Select correlation participant agent ghost-agent' })
      ).not.toBeInTheDocument();
    });
  });

  it('does not preserve auto-selected workflow correlation when pivoting through workflow counterparties', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await user.click(within(workflowSection!).getByRole('button', { name: 'Select workflow counterparty agent team-lead' }));

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(within(correlationSection!).getByText('No correlation selected.')).toBeVisible();
    });

    expect(screen.getByRole('button', { name: 'Hide Hub' })).toBeVisible();
    expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
    });
  });

  it('preserves an explicitly selected workflow correlation when pivoting through workflow counterparties', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(incidentSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await user.click(within(incidentSection!).getByRole('button', { name: 'Open incident correlation corr-app-secondary' }));
    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
    });

    await user.click(within(workflowSection!).getByRole('button', { name: 'Select workflow counterparty agent team-lead' }));

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
    });

    expect(screen.getByRole('button', { name: 'Hide Hub' })).toBeVisible();
    expect(within(correlationSection!).getByText('Counts · 1 incidents · 0 interactions · 1 events')).toBeVisible();

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(secondaryCorrelationUrl, expect.anything());
    });
  });

  it('preserves an explicitly reopened default correlation when pivoting through workflow counterparties', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(incidentSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(
        within(incidentSection!).getByRole('button', {
          name: 'Open incident correlation corr-app-secondary'
        })
      ).toBeVisible();
      expect(
        within(workflowSection!).getByRole('button', {
          name: 'Open workflow status correlation corr-app-review, currently selected'
        })
      ).toBeVisible();
    });

    await user.click(
      within(incidentSection!).getByRole('button', {
        name: 'Open incident correlation corr-app-secondary'
      })
    );

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(
        within(workflowSection!).getByRole('button', {
          name: 'Open workflow status correlation corr-app-review'
        })
      ).toBeVisible();
      expect(within(details).getByRole('button', { name: 'Return to current scope' })).toBeVisible();
    });

    await user.click(
      within(workflowSection!).getByRole('button', {
        name: 'Open workflow status correlation corr-app-review'
      })
    );

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(correlationSection!).getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
      expect(
        within(workflowSection!).getByRole('button', {
          name: 'Open workflow status correlation corr-app-review, currently selected'
        })
      ).toBeVisible();
      expect(within(details).getByRole('button', { name: 'Return to current scope' })).toBeVisible();
    });

    await user.click(within(workflowSection!).getByRole('button', { name: 'Select workflow counterparty agent team-lead' }));

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(correlationSection!).getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
      expect(within(correlationSection!).queryByText('No correlation selected.')).not.toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Hide Hub' })).toBeVisible();

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(correlationUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
      expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadMemoryArtifactsUrl, expect.anything());
    });
  });

  it('preserves the accountability correlation when pivoting through responsibility chain agents', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const auditSection = within(details).getByRole('heading', { name: 'Audit Signals' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(auditSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    expect(
      within(auditSection!).queryByRole('button', {
        name: 'Select responsibility chain agent app-engineering'
      })
    ).not.toBeInTheDocument();
    expect(
      within(auditSection!).getByRole('button', {
        name: 'Select responsibility chain agent team-lead'
      })
    ).toBeVisible();

    await user.click(
      within(auditSection!).getByRole('button', {
        name: 'Select responsibility chain agent team-lead'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
    });
  });

  it('focuses audit-signal artifacts through exact shared memory without changing the selected agent or correlation', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const auditSection = within(details).getByRole('heading', { name: 'Audit Signals' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(auditSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(memorySection!).getByText('Ref · /tmp/evidence.md')).toBeVisible();
    });

    const artifactRecord = within(memorySection!).getByText('Ref · /tmp/evidence.md').closest('li');
    expect(artifactRecord).not.toBeNull();
    const artifactLine = within(auditSection!).getByText(
      (_content, element) =>
        element?.tagName === 'SPAN' &&
        element.textContent ===
          'Artifacts · Correlation-scoped evidence trail for the missing workflow review (/tmp/evidence.md)'
    );
    const fetchCallCountBeforeJump = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(artifactLine).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/evidence.md'
      })
    );

    await waitFor(() => {
      expect(within(memorySection!).getByText('Focused exact artifact · /tmp/evidence.md')).toBeVisible();
      expect(artifactRecord).toHaveClass('aitown-record--shared-memory-focused');
      expect(within(artifactRecord!).getByText('Focused exact jump')).toBeVisible();
      expect(document.activeElement).toBe(artifactRecord);
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(fetchCallCountBeforeJump);
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
  });

  it('jumps from matching audit-signal accountability evidence refs to shared memory without changing the selected agent or accountability correlation', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const auditSection = within(details).getByRole('heading', { name: 'Audit Signals' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(auditSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(
        within(auditSection!).getByText(
          (_content, element) =>
            element?.tagName === 'SPAN' &&
            element.textContent === 'Evidence · /tmp/evidence.md, /tmp/reboot-note.md, /tmp/peer-watch.md'
        )
      ).toBeVisible();
      expect(
        within(auditSection!).getByRole('button', {
          name: 'Open accountability correlation corr-app-review, currently selected'
        })
      ).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(memorySection!).getByText('Ref · /tmp/evidence.md')).toBeVisible();
    });

    const evidenceLine = within(auditSection!).getByText(
      (_content, element) =>
        element?.tagName === 'SPAN' &&
        element.textContent === 'Evidence · /tmp/evidence.md, /tmp/reboot-note.md, /tmp/peer-watch.md'
    );
    const artifactRecord = within(memorySection!).getByText('Ref · /tmp/evidence.md').closest('li');
    expect(artifactRecord).not.toBeNull();
    expect(
      within(evidenceLine).getByRole('button', {
        name: 'Jump to accountability evidence ref /tmp/evidence.md'
      })
    ).toBeVisible();
    expect(
      within(evidenceLine).getByRole('button', {
        name: 'Jump to accountability evidence ref /tmp/reboot-note.md'
      })
    ).toBeVisible();
    expect(
      within(evidenceLine).getByRole('button', {
        name: 'Jump to accountability evidence ref /tmp/peer-watch.md'
      })
    ).toBeVisible();

    const fetchCallCountBeforeJump = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(evidenceLine).getByRole('button', {
        name: 'Jump to accountability evidence ref /tmp/evidence.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    expect(
      within(auditSection!).getByRole('button', {
        name: 'Open accountability correlation corr-app-review, currently selected'
      })
    ).toBeVisible();
    expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(fetchCallCountBeforeJump);
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
  });

  it('jumps from top-level crew-overview correlation evidence refs to shared memory without changing the active correlation', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(incidentSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    await user.click(within(incidentSection!).getByRole('button', { name: /Open incident correlation corr-app-secondary/ }));

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(memorySection!).getByText('Ref · /tmp/secondary-evidence.md')).toBeVisible();
    });

    const correlationRecord = within(correlationSection!).getByText('corr-app-secondary').closest('li');
    const artifactRecord = within(memorySection!).getByText('Ref · /tmp/secondary-evidence.md').closest('li');
    expect(correlationRecord).not.toBeNull();
    expect(artifactRecord).not.toBeNull();
    expect(correlationRecord).toHaveTextContent('Evidence · /tmp/secondary-evidence.md');

    const fetchCallCountBeforeJump = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(correlationRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/secondary-evidence.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(within(details).getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
    expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(fetchCallCountBeforeJump);
  });

  it('jumps from top-level selected-agent correlation evidence refs to shared memory without changing the selected agent or correlation', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    await user.click(within(workflowSection!).getByRole('button', { name: /Open workflow correlation corr-app-review/ }));

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(memorySection!).getByText('Ref · /tmp/evidence.md')).toBeVisible();
    });

    const correlationRecord = within(correlationSection!).getByText('corr-app-review').closest('li');
    const artifactRecord = within(memorySection!).getByText('Ref · /tmp/evidence.md').closest('li');
    expect(correlationRecord).not.toBeNull();
    expect(artifactRecord).not.toBeNull();
    expect(correlationRecord).toHaveTextContent('Evidence · /tmp/evidence.md, /tmp/peer-watch.md');

    const fetchCallCountBeforeJump = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(correlationRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/evidence.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(fetchCallCountBeforeJump);
  });

  it('jumps from selected-agent workflow interaction evidence refs to shared memory without changing the selected agent or correlation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === workflowUrl) {
          return jsonResponse({
            ...workflowFixture,
            detail: {
              ...workflowFixture.detail,
              recent_interactions: [
                {
                  ...workflowFixture.detail.recent_interactions[0],
                  evidence_refs: ['/tmp/evidence.md', '/tmp/missing.md'],
                  summary: 'Lead reviewed the selected-agent workflow interaction evidence'
                }
              ]
            }
          } satisfies AgentWorkflow);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    await user.click(within(workflowSection!).getByRole('button', { name: /Open workflow correlation corr-app-review/ }));

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(memorySection!).getByText('Ref · /tmp/evidence.md')).toBeVisible();
      expect(
        within(workflowSection!).getByText('Lead reviewed the selected-agent workflow interaction evidence')
      ).toBeVisible();
    });

    const interactionRecord = within(workflowSection!)
      .getByText('Lead reviewed the selected-agent workflow interaction evidence')
      .closest('li');
    const artifactRecord = within(memorySection!).getByText('Ref · /tmp/evidence.md').closest('li');
    expect(interactionRecord).not.toBeNull();
    expect(artifactRecord).not.toBeNull();
    expect(interactionRecord).toHaveTextContent(/Participants · app-engineering\s*,\s*team-lead/);
    expect(interactionRecord).toHaveTextContent('Evidence · /tmp/evidence.md, /tmp/missing.md');
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
        name: 'Jump to shared memory artifact /tmp/evidence.md'
      })
    ).toBeVisible();
    expect(
      within(interactionRecord!).queryByRole('button', {
        name: 'Jump to shared memory artifact /tmp/missing.md'
      })
    ).toBeVisible();

    const fetchCallCountBeforeJump = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(interactionRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/evidence.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(fetchCallCountBeforeJump);
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
  });

  it('falls back to one exact shared-memory artifact fetch for selected-agent workflow interaction evidence refs outside the loaded slice', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === workflowUrl) {
          return jsonResponse({
            ...workflowFixture,
            detail: {
              ...workflowFixture.detail,
              recent_interactions: [
                {
                  ...workflowFixture.detail.recent_interactions[0],
                  evidence_refs: ['/tmp/evidence.md', '/tmp/missing.md'],
                  summary: 'Lead reviewed the selected-agent workflow interaction exact fallback evidence'
                }
              ]
            }
          } satisfies AgentWorkflow);
        }

        if (url === selectedCorrelationMissingArtifactExactUrl) {
          return jsonResponse({
            generated_at: '2026-03-16T09:00:00.000Z',
            items: [
              {
                artifact_ref: '/tmp/missing.md',
                artifact_kind: 'evidence_ref',
                file_name: 'missing.md',
                first_seen_at: '2026-03-16T08:58:30.000Z',
                last_seen_at: '2026-03-16T08:58:30.000Z',
                mention_count: 1,
                agent_ids: ['app-engineering', 'team-lead'],
                correlation_ids: ['corr-app-review'],
                source_kinds: ['controller_event'],
                latest_summary: 'Workflow interaction exact fallback stayed inside the selected-agent scope',
                latest_event_type: 'agent_noted',
                collector_last_modified_at: null
              }
            ]
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    await user.click(within(workflowSection!).getByRole('button', { name: /Open workflow correlation corr-app-review/ }));

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(memorySection!).getByText('Ref · /tmp/evidence.md')).toBeVisible();
      expect(
        within(workflowSection!).getByText('Lead reviewed the selected-agent workflow interaction exact fallback evidence')
      ).toBeVisible();
    });

    const interactionRecord = within(workflowSection!)
      .getByText('Lead reviewed the selected-agent workflow interaction exact fallback evidence')
      .closest('li');
    expect(interactionRecord).not.toBeNull();
    expect(interactionRecord).toHaveTextContent('Evidence · /tmp/evidence.md, /tmp/missing.md');
    expect(
      within(interactionRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/missing.md'
      })
    ).toBeVisible();
    expect(within(memorySection!).queryByText('Ref · /tmp/missing.md')).not.toBeInTheDocument();

    const fetchCallCountBeforeJump = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(interactionRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/missing.md'
      })
    );

    await waitFor(() => {
      expect(within(memorySection!).getByText('Ref · /tmp/missing.md')).toBeVisible();
    });

    const exactArtifactRecord = within(memorySection!).getByText('Ref · /tmp/missing.md').closest('li');
    expect(exactArtifactRecord).not.toBeNull();
    expect(document.activeElement).toBe(exactArtifactRecord);
    expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();

    const newFetchUrlsAfterJump = vi
      .mocked(globalThis.fetch)
      .mock.calls.slice(fetchCallCountBeforeJump)
      .map(([input]) => (typeof input === 'string' ? input : input.toString()));
    expect(newFetchUrlsAfterJump).toEqual([selectedCorrelationMissingArtifactExactUrl]);
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
  });

  it('jumps from selected-agent workflow recent-event evidence refs to shared memory without changing the selected agent or correlation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === workflowUrl) {
          return jsonResponse({
            ...workflowFixture,
            detail: {
              ...workflowFixture.detail,
              recent_events: [
                {
                  ...workflowFixture.detail.recent_events[0],
                  counterparty_agent_ids: ['app-engineering', 'team-lead', 'ghost-agent'],
                  evidence_refs: ['/tmp/evidence.md', '/tmp/missing.md'],
                  summary: 'Agent attached selected-agent workflow event evidence for lead review'
                }
              ]
            }
          } satisfies AgentWorkflow);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    await user.click(within(workflowSection!).getByRole('button', { name: /Open workflow correlation corr-app-review/ }));

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(memorySection!).getByText('Ref · /tmp/evidence.md')).toBeVisible();
      expect(
        within(workflowSection!).getByText('Agent attached selected-agent workflow event evidence for lead review')
      ).toBeVisible();
    });

    const eventRecord = within(workflowSection!)
      .getByText('Agent attached selected-agent workflow event evidence for lead review')
      .closest('li');
    const artifactRecord = within(memorySection!).getByText('Ref · /tmp/evidence.md').closest('li');
    expect(eventRecord).not.toBeNull();
    expect(artifactRecord).not.toBeNull();
    expect(eventRecord).toHaveTextContent('Counterparties · app-engineering, team-lead, ghost-agent');
    expect(eventRecord).toHaveTextContent('Evidence · /tmp/evidence.md, /tmp/missing.md');
    expect(
      within(eventRecord!).getByRole('button', {
        name: 'Select workflow recent event counterparty from event evt-workflow-1 team-lead'
      })
    ).toBeVisible();
    expect(
      within(eventRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/evidence.md'
      })
    ).toBeVisible();
    expect(
      within(eventRecord!).queryByRole('button', {
        name: 'Jump to shared memory artifact /tmp/missing.md'
      })
    ).toBeVisible();

    const fetchCallCountBeforeJump = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(eventRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/evidence.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(fetchCallCountBeforeJump);
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
  });

  it('jumps from selected-agent workflow peer-watch alert evidence refs to shared memory without changing the selected agent or correlation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === workflowUrl) {
          return jsonResponse({
            ...workflowFixture,
            detail: {
              ...workflowFixture.detail,
              open_peer_watch_alerts: [
                {
                  ...workflowFixture.detail.open_peer_watch_alerts[0],
                  evidence_refs: ['/tmp/evidence.md', '/tmp/missing.md'],
                  summary: 'Peer watch still waiting on review evidence'
                }
              ]
            }
          } satisfies AgentWorkflow);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    await user.click(within(workflowSection!).getByRole('button', { name: /Open workflow correlation corr-app-review/ }));

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(memorySection!).getByText('Ref · /tmp/evidence.md')).toBeVisible();
      expect(within(workflowSection!).getByText('Peer watch still waiting on review evidence')).toBeVisible();
    });

    const alertRecord = within(workflowSection!).getByText('Peer watch still waiting on review evidence').closest('li');
    const artifactRecord = within(memorySection!).getByText('Ref · /tmp/evidence.md').closest('li');
    expect(alertRecord).not.toBeNull();
    expect(artifactRecord).not.toBeNull();
    expect(alertRecord).toHaveTextContent('Watchers · growth-revenue');
    expect(alertRecord).toHaveTextContent('Evidence · /tmp/evidence.md, /tmp/missing.md');
    expect(alertRecord).toHaveTextContent('Evidence count · 1');
    expect(
      within(alertRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/evidence.md'
      })
    ).toBeVisible();
    expect(
      within(alertRecord!).queryByRole('button', {
        name: 'Jump to shared memory artifact /tmp/missing.md'
      })
    ).toBeVisible();

    const fetchCallCountBeforeJump = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(alertRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/evidence.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(fetchCallCountBeforeJump);
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
  });

  it('loads selected-agent supervision history from peer-watch alerts with a scoped target-agent read', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const supervisionSection = within(details).getByRole('heading', { name: 'Supervision History' }).closest('section');
    expect(supervisionSection).not.toBeNull();

    expect(await within(supervisionSection!).findByText('Peer watch recovered after evidence review')).toBeVisible();
    expect(within(supervisionSection!).getByText('Severity · orange')).toBeVisible();
    expect(within(supervisionSection!).getByText('Status · resolved')).toBeVisible();
    expect(within(supervisionSection!).getByText('Workflow status · blocked')).toBeVisible();
    expect(within(supervisionSection!).getByText('Task · Fix workflow issue')).toBeVisible();
    expect(
      within(supervisionSection!).getByText(
        (_content, element) => element?.tagName === 'SPAN' && element.textContent === 'Observer · team-lead'
      )
    ).toBeVisible();
    expect(
      within(supervisionSection!).getByText(
        (_content, element) => element?.tagName === 'SPAN' && element.textContent === 'Watchers · growth-revenue'
      )
    ).toBeVisible();
    expect(
      within(supervisionSection!).getByRole('button', {
        name: 'Open supervision history correlation corr-app-review, currently selected'
      })
    ).toBeVisible();
    expect(within(supervisionSection!).getByText('Evidence count · 2')).toBeVisible();
    expect(within(supervisionSection!).getByText('Source · controller_event')).toBeVisible();

    const peerWatchRequests = vi
      .mocked(globalThis.fetch)
      .mock.calls.map(([input]) => (typeof input === 'string' ? input : input.toString()))
      .filter((url) => url.startsWith('/peer-watch/alerts'));

    expect(peerWatchRequests).toEqual([
      crewOpenSupervisionAlertsUrl,
      appEngineeringScopedReviewSupervisionHistoryUrl
    ]);
  });

  it('refetches selected-agent supervision history with the selected severity filter and resets it across agent pivots', async () => {
    let resolveOrangeSupervisionHistory: (() => void) | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === orangeAppEngineeringScopedReviewSupervisionHistoryUrl) {
          return new Promise<Response>((resolve) => {
            resolveOrangeSupervisionHistory = () =>
              resolve(
                jsonResponse({
                  items: [
                    {
                      ...appEngineeringSupervisionHistoryFixture.items[0],
                      alert_id: 'alert-history-orange',
                      summary: 'Orange selected-agent supervision history remains visible'
                    }
                  ]
                })
              );
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const supervisionSection = within(details).getByRole('heading', { name: 'Supervision History' }).closest('section');
    expect(supervisionSection).not.toBeNull();

    const severityFilter = await within(supervisionSection!).findByRole('combobox', {
      name: 'Filter supervision history by severity'
    });
    expect(severityFilter).toHaveValue('');
    expect(within(severityFilter).getByRole('option', { name: 'All severities' })).toBeVisible();
    await waitFor(() => {
      expect(within(supervisionSection!).getByText('Peer watch recovered after evidence review')).toBeVisible();
    });

    await user.selectOptions(severityFilter, 'orange');

    await waitFor(() => {
      expect(within(supervisionSection!).getByText('Loading supervision history at Orange severity...')).toBeVisible();
      expect(within(supervisionSection!).queryByText('Peer watch recovered after evidence review')).not.toBeInTheDocument();
    });
    expect(resolveOrangeSupervisionHistory).not.toBeNull();
    await act(async () => {
      resolveOrangeSupervisionHistory?.();
    });

    await waitFor(() => {
      expect(
        within(supervisionSection!).getByText('Orange selected-agent supervision history remains visible')
      ).toBeVisible();
      expect(within(supervisionSection!).queryByText('Peer watch recovered after evidence review')).not.toBeInTheDocument();
    });
    expect(
      within(supervisionSection!).getByText(
        'Request scope · Target agent · app-engineering · Active correlation · corr-app-review'
      )
    ).toBeVisible();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      orangeAppEngineeringScopedReviewSupervisionHistoryUrl,
      expect.anything()
    );

    await user.click(
      within(supervisionSection!).getByRole('button', {
        name: 'Select supervision history watcher from alert alert-history-orange growth-revenue'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      const pivotedSupervisionSection = within(details).getByRole('heading', { name: 'Supervision History' }).closest('section');
      expect(pivotedSupervisionSection).not.toBeNull();
      expect(
        within(pivotedSupervisionSection!).getByRole('combobox', {
          name: 'Filter supervision history by severity'
        })
      ).toHaveValue('');
      expect(within(pivotedSupervisionSection!).getByText('No recent supervision history.')).toBeVisible();
    });

    const peerWatchRequests = vi
      .mocked(globalThis.fetch)
      .mock.calls.map(([input]) => (typeof input === 'string' ? input : input.toString()))
      .filter((url) => url.startsWith('/peer-watch/alerts'));

    expect(peerWatchRequests).toContain(growthRevenueScopedReviewSupervisionHistoryUrl);
    expect(peerWatchRequests).not.toContain(orangeGrowthRevenueScopedReviewSupervisionHistoryUrl);
  });

  it('scopes selected-agent supervision history to the active selected correlation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === appEngineeringSupervisionHistoryUrl) {
          return jsonResponse({
            items: [
              {
                ...appEngineeringSupervisionHistoryFixture.items[0],
                alert_id: 'alert-history-unrelated-correlation',
                summary: 'Unrelated supervision history should not stay visible',
                correlation_id: 'corr-app-secondary'
              }
            ]
          });
        }

        if (
          url === appEngineeringScopedReviewSupervisionHistoryUrl ||
          url === appEngineeringScopedSecondarySupervisionHistoryUrl
        ) {
          return jsonResponse({
            items: [
              {
                ...appEngineeringSupervisionHistoryFixture.items[0],
                alert_id: 'alert-history-active-correlation',
                summary: 'Active correlation scoped supervision history stays visible'
              }
            ]
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const supervisionSection = within(details).getByRole('heading', { name: 'Supervision History' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(supervisionSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(
        within(supervisionSection!).getByText('Active correlation scoped supervision history stays visible')
      ).toBeVisible();
    });

    expect(
      within(supervisionSection!).getByText(
        'Request scope · Target agent · app-engineering · Active correlation · corr-app-review'
      )
    ).toBeVisible();
    expect(
      within(supervisionSection!).queryByText('Unrelated supervision history should not stay visible')
    ).not.toBeInTheDocument();

    const peerWatchRequests = vi
      .mocked(globalThis.fetch)
      .mock.calls.map(([input]) => (typeof input === 'string' ? input : input.toString()))
      .filter((url) => url.startsWith('/peer-watch/alerts'));

    expect(peerWatchRequests).toContain(appEngineeringScopedReviewSupervisionHistoryUrl);
    expect(peerWatchRequests.at(-1)).toBe(appEngineeringScopedReviewSupervisionHistoryUrl);
  });

  it('keeps supervision history request scope target-agent scoped across manual correlation overrides and agent pivots', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const supervisionSection = within(details).getByRole('heading', { name: 'Supervision History' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(incidentSection).not.toBeNull();
    expect(supervisionSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(supervisionSection!).getByText('Peer watch recovered after evidence review')).toBeVisible();
    });

    expect(
      within(supervisionSection!).getByText(
        'Request scope · Target agent · app-engineering · Active correlation · corr-app-review'
      )
    ).toBeVisible();

    await user.click(
      within(incidentSection!).getByRole('button', {
        name: 'Open incident correlation corr-app-secondary'
      })
    );

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(details).getByRole('button', { name: 'Return to current scope' })).toBeVisible();
    });

    expect(
      within(supervisionSection!).getByText(
        'Request scope · Target agent · app-engineering · Active correlation · corr-app-secondary'
      )
    ).toBeVisible();

    await user.click(
      within(supervisionSection!).getByRole('button', {
        name: 'Select supervision history watcher from alert alert-history-1 growth-revenue'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      expect(
        within(supervisionSection!).getByText(
          'Request scope · Target agent · growth-revenue · Active correlation · corr-app-secondary'
        )
      ).toBeVisible();
    });
  });

  it('jumps from selected-agent supervision history evidence refs to shared memory without changing the selected agent or correlation', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const supervisionSection = within(details).getByRole('heading', { name: 'Supervision History' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(supervisionSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(supervisionSection!).getByText('Peer watch recovered after evidence review')).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(memorySection!).getByText('Ref · /tmp/evidence.md')).toBeVisible();
    });

    const alertRecord = within(supervisionSection!).getByText('Peer watch recovered after evidence review').closest('li');
    const artifactRecord = within(memorySection!).getByText('Ref · /tmp/evidence.md').closest('li');
    expect(alertRecord).not.toBeNull();
    expect(artifactRecord).not.toBeNull();
    expect(alertRecord).toHaveTextContent('Evidence · /tmp/evidence.md, /tmp/peer-watch.md');
    expect(
      within(alertRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/evidence.md'
      })
    ).toBeVisible();
    expect(
      within(alertRecord!).queryByRole('button', {
        name: 'Jump to shared memory artifact /tmp/peer-watch.md'
      })
    ).toBeVisible();

    const fetchCallCountBeforeJump = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(alertRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/evidence.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    expect(
      within(supervisionSection!).getByRole('button', {
        name: 'Open supervision history correlation corr-app-review, currently selected'
      })
    ).toBeVisible();
    expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(fetchCallCountBeforeJump);
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
  });

  it('preserves the active selected correlation when opening a supervision history actor pivot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (
          url === appEngineeringScopedReviewSupervisionHistoryUrl ||
          url === appEngineeringScopedSecondarySupervisionHistoryUrl
        ) {
          return jsonResponse({
            items: [
              {
                ...appEngineeringSupervisionHistoryFixture.items[0],
                alert_id: 'alert-history-actor-pivot',
                actor_id: 'growth-revenue',
                observer_agent_id: 'team-lead',
                watcher_agent_ids: ['team-lead'],
                summary: 'Supervision history actor keeps the active correlation'
              }
            ]
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const supervisionSection = within(details).getByRole('heading', { name: 'Supervision History' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(incidentSection).not.toBeNull();
    expect(supervisionSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(supervisionSection!).getByText('Supervision history actor keeps the active correlation')).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await user.click(
      within(incidentSection!).getByRole('button', {
        name: 'Open incident correlation corr-app-secondary'
      })
    );

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
    });

    await user.click(
      within(supervisionSection!).getByRole('button', {
        name: 'Select supervision history actor from alert alert-history-actor-pivot growth-revenue'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(correlationSection!).getByText('Counts · 1 incidents · 0 interactions · 1 events')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(growthRevenueWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(secondaryCorrelationUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(
        growthRevenueSelectedSecondaryCorrelationMemoryArtifactsUrl,
        expect.anything()
      );
    });
  });

  it('preserves the active selected correlation and scoped shared-memory reads when opening a selected-agent supervision history observer pivot', async () => {
    const growthRevenueFallbackCorrelationUrl = '/correlations/corr-growth-lead-review?limit=10&window=60m';

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (
          url === appEngineeringScopedReviewSupervisionHistoryUrl ||
          url === appEngineeringScopedSecondarySupervisionHistoryUrl
        ) {
          return jsonResponse({
            items: [
              {
                ...appEngineeringSupervisionHistoryFixture.items[0],
                alert_id: 'alert-history-observer-pivot',
                actor_id: 'team-lead',
                observer_agent_id: 'growth-revenue',
                watcher_agent_ids: ['team-lead'],
                summary: 'Supervision history observer keeps the active correlation'
              }
            ]
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const supervisionSection = within(details).getByRole('heading', { name: 'Supervision History' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(incidentSection).not.toBeNull();
    expect(supervisionSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(supervisionSection!).getByText('Supervision history observer keeps the active correlation')).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await user.click(
      within(incidentSection!).getByRole('button', {
        name: 'Open incident correlation corr-app-secondary'
      })
    );

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
    });

    const fetchCallCountBeforePivot = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(supervisionSection!).getByRole('button', {
        name: 'Select supervision history observer from alert alert-history-observer-pivot growth-revenue'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(correlationSection!).getByText('Counts · 1 incidents · 0 interactions · 1 events')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-growth-lead-review')).not.toBeInTheDocument();
      expect(within(memorySection!).getByText('Growth revenue preserved the artifact-selected correlation')).toBeVisible();
    });

    const newFetchUrlsAfterPivot = vi
      .mocked(globalThis.fetch)
      .mock.calls.slice(fetchCallCountBeforePivot)
      .map(([input]) => (typeof input === 'string' ? input : input.toString()));

    expect(newFetchUrlsAfterPivot).toContain(growthRevenueWorkflowUrl);
    expect(newFetchUrlsAfterPivot).toContain(growthRevenueScopedSecondarySupervisionHistoryUrl);
    expect(newFetchUrlsAfterPivot).toContain(growthRevenueSelectedSecondaryCorrelationMemoryArtifactsUrl);
    expect(newFetchUrlsAfterPivot).not.toContain(growthRevenueSelectedOperationUrl);
    expect(newFetchUrlsAfterPivot).not.toContain(growthRevenueMemoryArtifactsUrl);
    expect(newFetchUrlsAfterPivot).not.toContain(growthRevenueFallbackCorrelationUrl);
  });

  it('keeps current and unknown selected-agent supervision history observers as plain text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (
          url === appEngineeringScopedReviewSupervisionHistoryUrl ||
          url === appEngineeringScopedSecondarySupervisionHistoryUrl
        ) {
          return jsonResponse({
            items: [
              {
                ...appEngineeringSupervisionHistoryFixture.items[0],
                alert_id: 'alert-history-observer-current',
                observer_agent_id: 'app-engineering',
                summary: 'Current supervision-history observer stays plain text'
              },
              {
                ...appEngineeringSupervisionHistoryFixture.items[0],
                alert_id: 'alert-history-observer-unknown',
                observer_agent_id: 'ghost-agent',
                summary: 'Unknown supervision-history observer stays plain text'
              }
            ]
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const supervisionSection = within(details).getByRole('heading', { name: 'Supervision History' }).closest('section');
    expect(supervisionSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(supervisionSection!).getByText('Current supervision-history observer stays plain text')).toBeVisible();
      expect(within(supervisionSection!).getByText('Unknown supervision-history observer stays plain text')).toBeVisible();
    });

    const currentRecord = within(supervisionSection!)
      .getByText('Current supervision-history observer stays plain text')
      .closest('li');
    const unknownRecord = within(supervisionSection!)
      .getByText('Unknown supervision-history observer stays plain text')
      .closest('li');
    expect(currentRecord).not.toBeNull();
    expect(unknownRecord).not.toBeNull();

    expect(currentRecord).toHaveTextContent('Observer · app-engineering');
    expect(
      within(currentRecord!).queryByRole('button', {
        name: 'Select supervision history observer from alert alert-history-observer-current app-engineering'
      })
    ).not.toBeInTheDocument();
    expect(unknownRecord).toHaveTextContent('Observer · ghost-agent');
    expect(
      within(unknownRecord!).queryByRole('button', {
        name: 'Select supervision history observer from alert alert-history-observer-unknown ghost-agent'
      })
    ).not.toBeInTheDocument();
  });

  it('preserves the active selected correlation and scoped reads when opening a selected-agent supervision history watcher pivot', async () => {
    const growthRevenueFallbackCorrelationUrl = '/correlations/corr-growth-lead-review?limit=10&window=60m';

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (
          url === appEngineeringScopedReviewSupervisionHistoryUrl ||
          url === appEngineeringScopedSecondarySupervisionHistoryUrl
        ) {
          return jsonResponse({
            items: [
              {
                ...appEngineeringSupervisionHistoryFixture.items[0],
                alert_id: 'alert-history-watcher-pivot',
                actor_id: 'team-lead',
                observer_agent_id: 'team-lead',
                watcher_agent_ids: ['growth-revenue'],
                summary: 'Supervision history watcher keeps the active correlation'
              }
            ]
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const supervisionSection = within(details).getByRole('heading', { name: 'Supervision History' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(incidentSection).not.toBeNull();
    expect(supervisionSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(supervisionSection!).getByText('Supervision history watcher keeps the active correlation')).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await user.click(
      within(incidentSection!).getByRole('button', {
        name: 'Open incident correlation corr-app-secondary'
      })
    );

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
    });

    const fetchCallCountBeforePivot = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(supervisionSection!).getByRole('button', {
        name: 'Select supervision history watcher from alert alert-history-watcher-pivot growth-revenue'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(correlationSection!).getByText('Counts · 1 incidents · 0 interactions · 1 events')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-growth-lead-review')).not.toBeInTheDocument();
      expect(within(memorySection!).getByText('Growth revenue preserved the artifact-selected correlation')).toBeVisible();
    });

    const newFetchUrlsAfterPivot = vi
      .mocked(globalThis.fetch)
      .mock.calls.slice(fetchCallCountBeforePivot)
      .map(([input]) => (typeof input === 'string' ? input : input.toString()));

    expect(newFetchUrlsAfterPivot).toContain(growthRevenueWorkflowUrl);
    expect(newFetchUrlsAfterPivot).toContain(growthRevenueScopedSecondarySupervisionHistoryUrl);
    expect(newFetchUrlsAfterPivot).toContain(growthRevenueSelectedSecondaryCorrelationMemoryArtifactsUrl);
    expect(newFetchUrlsAfterPivot).not.toContain(growthRevenueSelectedOperationUrl);
    expect(newFetchUrlsAfterPivot).not.toContain(growthRevenueMemoryArtifactsUrl);
    expect(newFetchUrlsAfterPivot).not.toContain(growthRevenueFallbackCorrelationUrl);
  });

  it('preserves the active selected correlation when opening a workflow peer-watch observer pivot', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    expect(incidentSection).not.toBeNull();

    await user.click(
      within(incidentSection!).getByRole('button', {
        name: 'Select incident agent app-engineering from incident inc-2'
      })
    );

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
    });

    await user.click(
      within(workflowSection!).getByRole('button', {
        name: 'Select workflow peer-watch observer from alert alert-1 team-lead'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(correlationSection!).getByText('Counts · 1 incidents · 0 interactions · 1 events')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(secondaryCorrelationUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(
        teamLeadSelectedSecondaryCorrelationMemoryArtifactsUrl,
        expect.anything()
      );
    });
  });

  it('preserves the active selected correlation when opening a workflow peer-watch target pivot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === workflowUrl) {
          return jsonResponse({
            ...workflowFixture,
            detail: {
              ...workflowFixture.detail,
              open_peer_watch_alerts: [
                {
                  ...workflowFixture.detail.open_peer_watch_alerts[0],
                  alert_id: 'alert-target-pivot',
                  target_agent_id: 'growth-revenue',
                  summary: 'Workflow target stays actionable'
                }
              ]
            }
          } satisfies AgentWorkflow);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(incidentSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await user.click(within(incidentSection!).getByRole('button', { name: 'Open incident correlation corr-app-secondary' }));
    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
    });

    await user.click(
      within(workflowSection!).getByRole('button', {
        name: 'Select workflow peer-watch target from alert alert-target-pivot growth-revenue'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(correlationSection!).getByText('Counts · 1 incidents · 0 interactions · 1 events')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(growthRevenueWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(secondaryCorrelationUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(
        growthRevenueSelectedSecondaryCorrelationMemoryArtifactsUrl,
        expect.anything()
      );
    });
  });

  it('keeps current and unknown workflow peer-watch observers as plain text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === workflowUrl) {
          return jsonResponse({
            ...workflowFixture,
            detail: {
              ...workflowFixture.detail,
              open_peer_watch_alerts: [
                {
                  ...workflowFixture.detail.open_peer_watch_alerts[0],
                  alert_id: 'alert-observer-current',
                  observer_agent_id: 'app-engineering',
                  actor_id: 'app-engineering',
                  summary: 'Current observer stays plain text'
                },
                {
                  ...workflowFixture.detail.open_peer_watch_alerts[0],
                  alert_id: 'alert-observer-unknown',
                  observer_agent_id: 'ghost-agent',
                  actor_id: 'ghost-agent',
                  summary: 'Unknown observer stays plain text'
                }
              ]
            }
          } satisfies AgentWorkflow);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(workflowSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(workflowSection!).getByText('Current observer stays plain text')).toBeVisible();
      expect(within(workflowSection!).getByText('Unknown observer stays plain text')).toBeVisible();
    });

    const currentRecord = within(workflowSection!).getByText('Current observer stays plain text').closest('li');
    const unknownRecord = within(workflowSection!).getByText('Unknown observer stays plain text').closest('li');
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

  it('keeps current and unknown workflow peer-watch targets as plain text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === workflowUrl) {
          return jsonResponse({
            ...workflowFixture,
            detail: {
              ...workflowFixture.detail,
              open_peer_watch_alerts: [
                {
                  ...workflowFixture.detail.open_peer_watch_alerts[0],
                  alert_id: 'alert-target-current',
                  target_agent_id: 'app-engineering',
                  summary: 'Current target stays plain text'
                },
                {
                  ...workflowFixture.detail.open_peer_watch_alerts[0],
                  alert_id: 'alert-target-unknown',
                  target_agent_id: 'ghost-agent',
                  summary: 'Unknown target stays plain text'
                }
              ]
            }
          } satisfies AgentWorkflow);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(workflowSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(workflowSection!).getByText('Current target stays plain text')).toBeVisible();
      expect(within(workflowSection!).getByText('Unknown target stays plain text')).toBeVisible();
    });

    const currentRecord = within(workflowSection!).getByText('Current target stays plain text').closest('li');
    const unknownRecord = within(workflowSection!).getByText('Unknown target stays plain text').closest('li');
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

  it('preserves the active selected correlation when opening a workflow peer-watch watcher pivot', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(incidentSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await user.click(within(incidentSection!).getByRole('button', { name: 'Open incident correlation corr-app-secondary' }));
    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
    });

    await user.click(
      within(workflowSection!).getByRole('button', {
        name: 'Select workflow peer-watch watcher from alert alert-1 growth-revenue'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(correlationSection!).getByText('Counts · 1 incidents · 0 interactions · 1 events')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(growthRevenueWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(secondaryCorrelationUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(
        growthRevenueSelectedSecondaryCorrelationMemoryArtifactsUrl,
        expect.anything()
      );
    });
  });

  it('keeps current and unknown workflow peer-watch watchers as plain text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === workflowUrl) {
          return jsonResponse({
            ...workflowFixture,
            detail: {
              ...workflowFixture.detail,
              open_peer_watch_alerts: [
                {
                  ...workflowFixture.detail.open_peer_watch_alerts[0],
                  alert_id: 'alert-watcher-current',
                  watcher_agent_ids: ['app-engineering'],
                  summary: 'Current watcher stays plain text'
                },
                {
                  ...workflowFixture.detail.open_peer_watch_alerts[0],
                  alert_id: 'alert-watcher-unknown',
                  watcher_agent_ids: ['ghost-agent'],
                  summary: 'Unknown watcher stays plain text'
                }
              ]
            }
          } satisfies AgentWorkflow);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(workflowSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(workflowSection!).getByText('Current watcher stays plain text')).toBeVisible();
      expect(within(workflowSection!).getByText('Unknown watcher stays plain text')).toBeVisible();
    });

    const currentRecord = within(workflowSection!).getByText('Current watcher stays plain text').closest('li');
    const unknownRecord = within(workflowSection!).getByText('Unknown watcher stays plain text').closest('li');
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

  it('jumps from selected-agent workflow handoff and reboot evidence refs to shared memory without changing the selected agent or correlation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === workflowUrl) {
          return jsonResponse({
            ...workflowFixture,
            detail: {
              ...workflowFixture.detail,
              recent_handoffs: [
                {
                  ...workflowFixture.detail.recent_handoffs[0],
                  evidence_refs: ['/tmp/evidence.md', '/tmp/missing.md']
                }
              ],
              recent_reboots: [
                {
                  ...workflowFixture.detail.recent_reboots[0],
                  evidence_refs: ['/tmp/evidence.md', '/tmp/missing.md']
                }
              ]
            }
          } satisfies AgentWorkflow);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    await user.click(within(workflowSection!).getByRole('button', { name: /Open workflow correlation corr-app-review/ }));

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(memorySection!).getByText('Ref · /tmp/evidence.md')).toBeVisible();
      expect(within(workflowSection!).getByText('Secondary review handoff completed')).toBeVisible();
      expect(within(workflowSection!).getByText('Reboot recommended after the workflow stalled')).toBeVisible();
    });

    const handoffRecord = within(workflowSection!).getByText('Secondary review handoff completed').closest('li');
    const rebootRecord = within(workflowSection!).getByText('Reboot recommended after the workflow stalled').closest('li');
    const artifactRecord = within(memorySection!).getByText('Ref · /tmp/evidence.md').closest('li');
    expect(handoffRecord).not.toBeNull();
    expect(rebootRecord).not.toBeNull();
    expect(artifactRecord).not.toBeNull();
    expect(handoffRecord).toHaveTextContent('Evidence · /tmp/evidence.md, /tmp/missing.md');
    expect(rebootRecord).toHaveTextContent('Evidence · /tmp/evidence.md, /tmp/missing.md');
    expect(
      within(handoffRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/evidence.md'
      })
    ).toBeVisible();
    expect(
      within(rebootRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/evidence.md'
      })
    ).toBeVisible();
    expect(
      within(handoffRecord!).queryByRole('button', {
        name: 'Jump to shared memory artifact /tmp/missing.md'
      })
    ).toBeVisible();
    expect(
      within(rebootRecord!).queryByRole('button', {
        name: 'Jump to shared memory artifact /tmp/missing.md'
      })
    ).toBeVisible();

    const fetchCallCountBeforeJump = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(handoffRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/evidence.md'
      })
    );
    expect(document.activeElement).toBe(artifactRecord);

    await user.click(
      within(rebootRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/evidence.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(fetchCallCountBeforeJump);
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
  });

  it('jumps from correlation-incident evidence refs to shared memory without changing the selected agent or correlation', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(correlationSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(memorySection!).getByText('Ref · /tmp/evidence.md')).toBeVisible();
    });

    const incidentRecord = within(correlationSection!).getByText('Lead is still waiting on workflow evidence').closest('li');
    const artifactRecord = within(memorySection!).getByText('Ref · /tmp/evidence.md').closest('li');
    expect(incidentRecord).not.toBeNull();
    expect(artifactRecord).not.toBeNull();

    const fetchCallCountBeforeJump = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(incidentRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/evidence.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(fetchCallCountBeforeJump);
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
  });

  it('jumps from correlation-interaction evidence refs to shared memory without changing the selected agent or correlation', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(correlationSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(memorySection!).getByText('Ref · /tmp/evidence.md')).toBeVisible();
    });

    const interactionRecord = within(correlationSection!).getByText('Lead escalated missing workflow evidence').closest('li');
    const artifactRecord = within(memorySection!).getByText('Ref · /tmp/evidence.md').closest('li');
    expect(interactionRecord).not.toBeNull();
    expect(artifactRecord).not.toBeNull();

    const fetchCallCountBeforeJump = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(interactionRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/evidence.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(fetchCallCountBeforeJump);
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
  });

  it('jumps from correlation-timeline evidence refs to shared memory without changing the selected agent or correlation', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(correlationSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(memorySection!).getByText('Ref · /tmp/evidence.md')).toBeVisible();
    });

    const timelineRecord = within(correlationSection!).getByText('Workflow evidence is still incomplete').closest('li');
    const artifactRecord = within(memorySection!).getByText('Ref · /tmp/evidence.md').closest('li');
    expect(timelineRecord).not.toBeNull();
    expect(artifactRecord).not.toBeNull();

    const fetchCallCountBeforeJump = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(timelineRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/evidence.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(fetchCallCountBeforeJump);
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
    expect(globalThis.fetch).not.toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
  });

  it('pivots from correlation incident agents while preserving the active correlation', async () => {
    const originalFetch = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url === correlationUrl) {
          return new Response(JSON.stringify(correlationIncidentAgentPivotFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }
        return originalFetch(input, init);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(
        within(correlationSection!).getByRole('button', {
          name: 'Select incident agent team-lead from incident inc-1'
        })
      ).toBeVisible();
    });

    await user.click(
      within(correlationSection!).getByRole('button', {
        name: 'Select incident agent team-lead from incident inc-1'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    expect(screen.getByRole('button', { name: 'Hide Hub' })).toBeVisible();

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
    });
  });

  it('pivots from correlation incident actors while preserving the active correlation', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(
        within(correlationSection!).getByRole('button', {
          name: 'Select correlation incident actor from incident inc-1 team-lead'
        })
      ).toBeVisible();
    });

    await user.click(
      within(correlationSection!).getByRole('button', {
        name: 'Select correlation incident actor from incident inc-1 team-lead'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
    });
  });

  it('pivots from correlation incident counterparties while preserving the active correlation', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(
        within(correlationSection!).getByRole('button', {
          name: 'Select correlation incident counterparty agent team-lead'
        })
      ).toBeVisible();
    });

    await user.click(
      within(correlationSection!).getByRole('button', {
        name: 'Select correlation incident counterparty agent team-lead'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
    });
  });

  it('pivots from correlation timeline actors while preserving the active correlation', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(
        within(correlationSection!).getByRole('button', {
          name: 'Select correlation timeline actor from event evt-1 team-lead'
        })
      ).toBeVisible();
    });

    await user.click(
      within(correlationSection!).getByRole('button', {
        name: 'Select correlation timeline actor from event evt-1 team-lead'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
    });
  });

  it('pivots from correlation timeline counterparties while preserving the active correlation', async () => {
    const originalFetch = globalThis.fetch;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === correlationUrl) {
          return new Response(JSON.stringify(correlationTimelineCounterpartyPivotFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        return originalFetch(input, init);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(
        within(correlationSection!).getByRole('button', {
          name: 'Select correlation timeline counterparty agent team-lead'
        })
      ).toBeVisible();
    });

    await user.click(
      within(correlationSection!).getByRole('button', {
        name: 'Select correlation timeline counterparty agent team-lead'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
    });
  });

  it('pivots from correlation interaction participants while preserving the active correlation', async () => {
    const originalFetch = globalThis.fetch;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === correlationUrl) {
          return new Response(JSON.stringify(correlationInteractionParticipantPivotFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        return originalFetch(input, init);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(
        within(correlationSection!).getByRole('button', {
          name: 'Select correlation interaction participant agent team-lead'
        })
      ).toBeVisible();
    });

    await user.click(
      within(correlationSection!).getByRole('button', {
        name: 'Select correlation interaction participant agent team-lead'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
    });
  });

  it('pivots from correlation participants through the selected-agent flow', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await user.click(
      within(correlationSection!).getByRole('button', { name: 'Select correlation participant agent team-lead' })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(
        within(within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section')!).getByText(
          'No correlation selected.'
        )
      ).toBeVisible();
    });

    expect(screen.getByRole('button', { name: 'Hide Hub' })).toBeVisible();

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
    });
  });

  it('preserves the active crew-overview correlation when pivoting through its participant agents', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    expect(incidentSection).not.toBeNull();

    await user.click(within(incidentSection!).getByRole('button', { name: 'Open incident correlation corr-app-secondary' }));

    await waitFor(() => {
      const crewCorrelationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      expect(crewCorrelationSection).not.toBeNull();
      expect(within(crewCorrelationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(
        within(crewCorrelationSection!).getByRole('button', { name: 'Select correlation participant agent growth-revenue' })
      ).toBeVisible();
    });

    await user.click(
      within(within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section')!).getByRole('button', {
        name: 'Select correlation participant agent growth-revenue'
      })
    );

    await waitFor(() => {
      const selectedCorrelationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      expect(selectedCorrelationSection).not.toBeNull();
      expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      expect(within(selectedCorrelationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(selectedCorrelationSection!).queryByText('corr-growth-lead-review')).not.toBeInTheDocument();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(growthRevenueWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(secondaryCorrelationUrl, expect.anything());
    });
  });

  it('keeps an explicitly selected incident correlation instead of snapping back to the workflow default', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(incidentSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await user.click(within(incidentSection!).getByRole('button', { name: 'Open incident correlation corr-app-secondary' }));

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(
        within(correlationSection!).getByText('Counts · 1 incidents · 0 interactions · 1 events')
      ).toBeVisible();
    });
    expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(secondaryCorrelationUrl, expect.anything());
    });
  });

  it('returns a manual crew-overview correlation to the current default scope without widening replay or shared-memory scope', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(incidentSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    expect(within(memorySection!).getByText('Request scope · Crew overview')).toBeVisible();

    await user.click(within(incidentSection!).getByRole('button', { name: 'Open incident correlation corr-app-secondary' }));

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(details).getByRole('button', { name: 'Return to current scope' })).toBeVisible();
      expect(within(memorySection!).getByText('Request scope · Crew overview · corr-app-secondary')).toBeVisible();
    });

    const fetchCallCountBeforeReset = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(within(details).getByRole('button', { name: 'Return to current scope' }));

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-app-secondary')).not.toBeInTheDocument();
      expect(within(details).queryByRole('button', { name: 'Return to current scope' })).not.toBeInTheDocument();
      expect(within(memorySection!).getByText('Request scope · Crew overview')).toBeVisible();
      expect(within(memorySection!).queryByText('Request scope · Crew overview · corr-app-secondary')).not.toBeInTheDocument();
    });

    const postResetRequests = vi
      .mocked(globalThis.fetch)
      .mock.calls.slice(fetchCallCountBeforeReset)
      .map(([input]) => (typeof input === 'string' ? input : input.toString()));

    expect(postResetRequests).toContain(timelineUrl);
    expect(postResetRequests).toContain(memoryArtifactsUrl);
    expect(postResetRequests).not.toContain(secondaryScopedTimelineUrl);
    expect(postResetRequests).not.toContain(crewOverviewSelectedCorrelationMemoryArtifactsUrl);
  }, 10000);

  it('returns a manual selected-agent correlation to the current default scope without clearing the agent, operation, or hub', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(incidentSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await user.click(within(incidentSection!).getByRole('button', { name: 'Open incident correlation corr-app-secondary' }));

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(details).getByRole('heading', { name: 'Current Operation' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Hide Hub' })).toBeVisible();
      expect(within(details).getByRole('button', { name: 'Return to current scope' })).toBeVisible();
    });

    const fetchCallCountBeforeReset = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(within(details).getByRole('button', { name: 'Return to current scope' }));

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(details).getByRole('heading', { name: 'Current Operation' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-app-secondary')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Hide Hub' })).toBeVisible();
      expect(within(details).getByRole('button', { name: 'Clear' })).toHaveFocus();
    });

    const postResetRequests = vi
      .mocked(globalThis.fetch)
      .mock.calls.slice(fetchCallCountBeforeReset)
      .map(([input]) => (typeof input === 'string' ? input : input.toString()));

    expect(postResetRequests).toContain(selectedCorrelationMemoryArtifactsUrl);
    expect(postResetRequests).not.toContain(appEngineeringMemoryArtifactsUrl);
  });

  it(
    'keeps crew-overview auto correlation mode when re-selecting the current default correlation from active queue after a later refresh',
    async () => {
      (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 10;

    let unscopedTimelineRequests = 0;
    let scopedTimelineRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === timelineUrl) {
          unscopedTimelineRequests += 1;
          return new Response(JSON.stringify(timelineFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === reviewScopedTimelineUrl) {
          scopedTimelineRequests += 1;
          return new Response(JSON.stringify(reviewScopedTimelineFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const queueSection = within(details).getByRole('heading', { name: 'Active Queue' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const replaySection = within(details).getByRole('heading', { name: 'Timeline Replay' }).closest('section');
    expect(queueSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(replaySection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(
        within(queueSection!).getByRole('button', {
          name: 'Open active queue correlation corr-app-review, currently selected'
        })
      ).toBeVisible();
      expect(within(details).queryByRole('button', { name: 'Return to current scope' })).not.toBeInTheDocument();
      expect(within(replaySection!).queryByText('Scoped replay · corr-app-review')).not.toBeInTheDocument();
    });

    const unscopedTimelineRequestsBeforeReselect = unscopedTimelineRequests;
    const scopedTimelineRequestsBeforeReselect = scopedTimelineRequests;
    const fetchCallCountBeforeReselect = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(queueSection!).getByRole('button', {
        name: 'Open active queue correlation corr-app-review, currently selected'
      })
    );

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(details).queryByRole('button', { name: 'Return to current scope' })).not.toBeInTheDocument();
      expect(within(replaySection!).queryByText('Scoped replay · corr-app-review')).not.toBeInTheDocument();
    });

    await waitFor(() => {
      expect(unscopedTimelineRequests).toBeGreaterThan(unscopedTimelineRequestsBeforeReselect);
    });

    const postReselectRequests = vi
      .mocked(globalThis.fetch)
      .mock.calls.slice(fetchCallCountBeforeReselect)
      .map(([input]) => (typeof input === 'string' ? input : input.toString()));

    expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    expect(within(details).queryByRole('button', { name: 'Return to current scope' })).not.toBeInTheDocument();
    expect(within(replaySection!).queryByText('Scoped replay · corr-app-review')).not.toBeInTheDocument();
    expect(scopedTimelineRequests).toBe(scopedTimelineRequestsBeforeReselect);
    expect(vi.mocked(globalThis.fetch).mock.calls.length).toBeGreaterThan(fetchCallCountBeforeReselect);
    expect(postReselectRequests).toContain(timelineUrl);
    expect(postReselectRequests).not.toContain(reviewScopedTimelineUrl);
    expect(postReselectRequests).not.toContain(crewOverviewSelectedCorrelationMemoryArtifactsUrl);
    },
    10000
  );

  it('keeps a different crew-overview active-queue correlation explicit and manual', async () => {
    const operationsWithSecondaryCorrelation = {
      ...operationsFixture,
      items: [
        {
          ...operationsFixture.items[0],
          correlation_id: 'corr-app-secondary'
        },
        operationsFixture.items[1]
      ]
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === operationsUrl) {
          return jsonResponse(operationsWithSecondaryCorrelation);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const queueSection = within(details).getByRole('heading', { name: 'Active Queue' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const replaySection = within(details).getByRole('heading', { name: 'Timeline Replay' }).closest('section');
    expect(queueSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(replaySection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(
        within(queueSection!).getByRole('button', {
          name: 'Open active queue correlation corr-app-secondary'
        })
      ).toBeVisible();
      expect(within(details).queryByRole('button', { name: 'Return to current scope' })).not.toBeInTheDocument();
    });

    const fetchCallCountBeforeSelection = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(queueSection!).getByRole('button', {
        name: 'Open active queue correlation corr-app-secondary'
      })
    );

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
      expect(within(details).getByRole('button', { name: 'Return to current scope' })).toBeVisible();
      expect(within(replaySection!).getByText('Scoped replay · corr-app-secondary')).toBeVisible();
    });

    const postSelectionRequests = vi
      .mocked(globalThis.fetch)
      .mock.calls.slice(fetchCallCountBeforeSelection)
      .map(([input]) => (typeof input === 'string' ? input : input.toString()));

    expect(postSelectionRequests).toContain(secondaryScopedTimelineUrl);
    expect(postSelectionRequests).toContain(crewOverviewSelectedCorrelationMemoryArtifactsUrl);
  });

  it('keeps selected-agent auto correlation mode when re-selecting the current default correlation', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const operationSection = (await within(details).findByRole('heading', { name: 'Current Operation' })).closest(
      'section'
    );
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(operationSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(
        within(operationSection!).getByRole('button', {
          name: 'Open operation correlation corr-app-review, currently selected'
        })
      ).toBeVisible();
      expect(within(details).queryByRole('button', { name: 'Return to current scope' })).not.toBeInTheDocument();
    });

    const fetchCallCountBeforeReselect = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(operationSection!).getByRole('button', {
        name: 'Open operation correlation corr-app-review, currently selected'
      })
    );

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(details).queryByRole('button', { name: 'Return to current scope' })).not.toBeInTheDocument();
    });

    expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(fetchCallCountBeforeReselect);
  });

  it('keeps selected-agent auto correlation mode when re-selecting the current default correlation from supervision history', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const supervisionSection = within(details).getByRole('heading', { name: 'Supervision History' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(supervisionSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(
        within(supervisionSection!).getByRole('button', {
          name: 'Open supervision history correlation corr-app-review, currently selected'
        })
      ).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(details).queryByRole('button', { name: 'Return to current scope' })).not.toBeInTheDocument();
    });

    const fetchCallCountBeforeReselect = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(supervisionSection!).getByRole('button', {
        name: 'Open supervision history correlation corr-app-review, currently selected'
      })
    );

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(details).queryByRole('button', { name: 'Return to current scope' })).not.toBeInTheDocument();
    });

    expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(fetchCallCountBeforeReselect);
  });

  it('keeps selected-agent auto correlation mode when re-selecting the current default correlation from workflow status', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(
        within(workflowSection!).getByRole('button', {
          name: 'Open workflow status correlation corr-app-review, currently selected'
        })
      ).toBeVisible();
      expect(within(details).queryByRole('button', { name: 'Return to current scope' })).not.toBeInTheDocument();
    });

    const fetchCallCountBeforeReselect = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(workflowSection!).getByRole('button', {
        name: 'Open workflow status correlation corr-app-review, currently selected'
      })
    );

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(details).queryByRole('button', { name: 'Return to current scope' })).not.toBeInTheDocument();
    });

    expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(fetchCallCountBeforeReselect);
  });

  it('keeps a manually reopened default correlation manual when re-selecting it from workflow status', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(incidentSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(
        within(incidentSection!).getByRole('button', {
          name: 'Open incident correlation corr-app-secondary'
        })
      ).toBeVisible();
      expect(
        within(workflowSection!).getByRole('button', {
          name: 'Open workflow status correlation corr-app-review, currently selected'
        })
      ).toBeVisible();
      expect(within(details).queryByRole('button', { name: 'Return to current scope' })).not.toBeInTheDocument();
    });

    await user.click(
      within(incidentSection!).getByRole('button', {
        name: 'Open incident correlation corr-app-secondary'
      })
    );

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(
        within(workflowSection!).getByRole('button', {
          name: 'Open workflow status correlation corr-app-review'
        })
      ).toBeVisible();
      expect(within(details).getByRole('button', { name: 'Return to current scope' })).toBeVisible();
    });

    await user.click(
      within(workflowSection!).getByRole('button', {
        name: 'Open workflow status correlation corr-app-review'
      })
    );

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(
        within(workflowSection!).getByRole('button', {
          name: 'Open workflow status correlation corr-app-review, currently selected'
        })
      ).toBeVisible();
      expect(within(details).getByRole('button', { name: 'Return to current scope' })).toBeVisible();
    });

    await user.click(
      within(workflowSection!).getByRole('button', {
        name: 'Open workflow status correlation corr-app-review, currently selected'
      })
    );

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(details).getByRole('button', { name: 'Return to current scope' })).toBeVisible();
    });
  });

  it('keeps a manually reopened default correlation manual when re-selecting it from supervision history', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const supervisionSection = within(details).getByRole('heading', { name: 'Supervision History' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(incidentSection).not.toBeNull();
    expect(supervisionSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(
        within(incidentSection!).getByRole('button', {
          name: 'Open incident correlation corr-app-secondary'
        })
      ).toBeVisible();
      expect(
        within(supervisionSection!).getByRole('button', {
          name: 'Open supervision history correlation corr-app-review, currently selected'
        })
      ).toBeVisible();
      expect(within(details).queryByRole('button', { name: 'Return to current scope' })).not.toBeInTheDocument();
    });

    await user.click(
      within(incidentSection!).getByRole('button', {
        name: 'Open incident correlation corr-app-secondary'
      })
    );

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(
        within(supervisionSection!).getByRole('button', {
          name: 'Open supervision history correlation corr-app-review'
        })
      ).toBeVisible();
      expect(within(details).getByRole('button', { name: 'Return to current scope' })).toBeVisible();
    });

    await user.click(
      within(supervisionSection!).getByRole('button', {
        name: 'Open supervision history correlation corr-app-review'
      })
    );

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(
        within(supervisionSection!).getByRole('button', {
          name: 'Open supervision history correlation corr-app-review, currently selected'
        })
      ).toBeVisible();
      expect(within(details).getByRole('button', { name: 'Return to current scope' })).toBeVisible();
    });

    await user.click(
      within(supervisionSection!).getByRole('button', {
        name: 'Open supervision history correlation corr-app-review, currently selected'
      })
    );

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(details).getByRole('button', { name: 'Return to current scope' })).toBeVisible();
    });
  });

  it('does not fall back to crew-overview correlations while a selected-agent workflow is still loading', async () => {
    let correlationRequests = 0;
    let selectedAgentReplayRequests = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return Promise.resolve(
            new Response(JSON.stringify(overviewFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        if (url === operationsUrl || url === selectedOperationUrl) {
          return Promise.resolve(
            new Response(JSON.stringify(operationsFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        if (url === incidentsUrl || url === teamLeadWorkflowUrl) {
          return new Promise<Response>(() => {});
        }

        if (url === teamLeadSelectedTimelineUrl) {
          selectedAgentReplayRequests += 1;
          return new Promise<Response>(() => {});
        }

        if (url === correlationUrl || url === secondaryCorrelationUrl) {
          correlationRequests += 1;
          return Promise.resolve(
            new Response(JSON.stringify(correlationFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect Team Lead' }));

    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(correlationSection!).getByText('No correlation selected.')).toBeVisible();
    });
    expect(correlationRequests).toBe(0);
    expect(selectedAgentReplayRequests).toBe(0);
  });

  it('keeps selected-agent supervision history on the seeded target-agent path while selected-agent replay still waits for workflow correlation', async () => {
    let selectedAgentReplayRequests = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return Promise.resolve(
            new Response(JSON.stringify(overviewFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        if (url === operationsUrl || url === selectedOperationUrl) {
          return Promise.resolve(
            new Response(JSON.stringify(operationsFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        if (url === incidentsUrl || url === teamLeadWorkflowUrl) {
          return new Promise<Response>(() => {});
        }

        if (url === teamLeadSelectedTimelineUrl) {
          selectedAgentReplayRequests += 1;
          return new Promise<Response>(() => {});
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect Team Lead' }));

    const supervisionSection = within(details).getByRole('heading', { name: 'Supervision History' }).closest('section');
    expect(supervisionSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(supervisionSection!).getByText('Request scope · Target agent · team-lead')).toBeVisible();
      expect(within(supervisionSection!).getByText('No recent supervision history.')).toBeVisible();
    });

    const peerWatchRequests = vi
      .mocked(globalThis.fetch)
      .mock.calls.map(([input]) => (typeof input === 'string' ? input : input.toString()))
      .filter((url) => url.startsWith('/peer-watch/alerts'));

    expect(peerWatchRequests).toContain(teamLeadSupervisionHistoryUrl);
    expect(selectedAgentReplayRequests).toBe(0);
  });

  it('does not reuse a stale selected-agent workflow error to start replay before the next agent workflow resolves', async () => {
    let growthRevenueSelectedReplayRequests = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return Promise.resolve(
            new Response(JSON.stringify(overviewFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        if (url === operationsUrl || url === selectedOperationUrl) {
          return Promise.resolve(
            new Response(JSON.stringify(operationsFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        if (url === incidentsUrl) {
          return new Promise<Response>(() => {});
        }

        if (url === workflowUrl) {
          return Promise.resolve(
            new Response(JSON.stringify({ error: 'internal_error', details: 'workflow failed for app-engineering' }), {
              status: 500,
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        if (url === growthRevenueWorkflowUrl) {
          return new Promise<Response>(() => {});
        }

        if (url === growthRevenueSelectedTimelineUrl) {
          growthRevenueSelectedReplayRequests += 1;
          return new Promise<Response>(() => {});
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(workflowSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(workflowSection!).getByText('Unable to load workflow. workflow failed for app-engineering')).toBeVisible();
    });

    await user.click(screen.getByRole('button', { name: 'Inspect live focus agent Growth Revenue Agent' }));

    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('No correlation selected.')).toBeVisible();
      expect(globalThis.fetch).toHaveBeenCalledWith(growthRevenueWorkflowUrl, expect.anything());
    });

    expect(growthRevenueSelectedReplayRequests).toBe(0);
  });

  it('clears stale correlation drilldown when switching to an agent without correlations', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(workflowSection).not.toBeNull();
    await user.click(within(workflowSection!).getByRole('button', { name: /Open workflow correlation corr-app-review/ }));

    expect(await within(details).findByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();

    await user.click(within(details).getByRole('button', { name: 'Clear' }));
    await user.click(within(details).getByRole('button', { name: 'Inspect Team Lead' }));

    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(correlationSection!).getByText('No correlation selected.')).toBeVisible();
    });
    expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
  });

  it('loads correlation drilldown from incident feed evidence', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(incidentSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await user.click(within(incidentSection!).getByRole('button', { name: /Open incident correlation corr-app-review/ }));

    expect(
      await within(details).findByRole('button', { name: 'Select correlation participant agent app-engineering' })
    ).toBeVisible();
    expect(
      within(details).getByRole('button', { name: 'Select correlation participant agent team-lead' })
    ).toBeVisible();
    expect(within(correlationSection!).getByText('corr-app-review').closest('li')).toHaveTextContent(
      'Participants · app-engineering, team-lead'
    );

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(correlationUrl, expect.anything());
    });
  });

  it('preserves the clicked crew-overview incident correlation into the selected-agent flow', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    expect(incidentSection).not.toBeNull();

    await user.click(
      within(incidentSection!).getByRole('button', {
        name: 'Select incident agent app-engineering from incident inc-2'
      })
    );

    await waitFor(() => {
      const selectedCorrelationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      expect(selectedCorrelationSection).not.toBeNull();
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(within(selectedCorrelationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(selectedCorrelationSection!).getByText('Counts · 1 incidents · 0 interactions · 1 events')).toBeVisible();
      expect(within(selectedCorrelationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Hide Hub' })).toBeVisible();

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(workflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(secondaryCorrelationUrl, expect.anything());
    });
  });

  it('preserves the clicked selected-agent incident correlation when opening an incident counterparty pivot', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(incidentSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await user.click(
      within(incidentSection!).getByRole('button', {
        name: 'Select incident feed counterparty agent from incident inc-2 growth-revenue'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(correlationSection!).getByText('Counts · 1 incidents · 0 interactions · 1 events')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(growthRevenueWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(secondaryCorrelationUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(
        growthRevenueSelectedSecondaryCorrelationMemoryArtifactsUrl,
        expect.anything()
      );
    });
  });

  it('preserves the clicked selected-agent incident correlation when opening an incident actor pivot', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(incidentSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await user.click(
      within(incidentSection!).getByRole('button', {
        name: 'Select incident feed actor from incident inc-2 growth-revenue'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(correlationSection!).getByText('Counts · 1 incidents · 0 interactions · 1 events')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-app-review')).not.toBeInTheDocument();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(growthRevenueWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(secondaryCorrelationUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(
        growthRevenueSelectedSecondaryCorrelationMemoryArtifactsUrl,
        expect.anything()
      );
    });
  });

  it('preserves the clicked selected-agent workflow status correlation when opening a workflow status actor pivot', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await user.click(
      within(workflowSection!).getByRole('button', {
        name: 'Select workflow status actor from handoff handoff-1 growth-revenue'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(correlationSection!).getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-growth-lead-review')).not.toBeInTheDocument();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(growthRevenueWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(correlationUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(
        growthRevenueSelectedReviewCorrelationMemoryArtifactsUrl,
        expect.anything()
      );
    });
  });

  it('preserves the clicked selected-agent workflow status correlation when opening a workflow reboot actor pivot', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await user.click(
      within(workflowSection!).getByRole('button', {
        name: 'Select workflow status actor from reboot reboot-1 team-lead'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(correlationSection!).getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-growth-lead-review')).not.toBeInTheDocument();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(correlationUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
    });
  });

  it('preserves the clicked selected-agent workflow status correlation when opening a workflow status counterparty pivot', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    await user.click(
      within(workflowSection!).getByRole('button', {
        name: 'Select workflow status counterparty from handoff handoff-1 growth-revenue'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(correlationSection!).getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-growth-lead-review')).not.toBeInTheDocument();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(growthRevenueWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(correlationUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(
        growthRevenueSelectedReviewCorrelationMemoryArtifactsUrl,
        expect.anything()
      );
    });
  });

  it('falls back to the workflow-status record correlation and keeps scoped reads when no workflow correlation is selected', async () => {
    const workflowWithoutSelectedCorrelation = {
      ...workflowFixture,
      correlation_ids: [],
      detail: {
        ...workflowFixture.detail,
        open_peer_watch_alerts: []
      }
    } satisfies AgentWorkflow;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === selectedOperationUrl) {
          return new Response(JSON.stringify(emptyOperationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === timelineUrl) {
          return new Response(JSON.stringify(timelineFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          return new Response(JSON.stringify(workflowWithoutSelectedCorrelation), {
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('No correlation selected.')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-app-secondary')).not.toBeInTheDocument();
    });

    const fetchCallCountBeforePivot = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(workflowSection!).getByRole('button', {
        name: 'Select workflow status counterparty from handoff handoff-1 growth-revenue'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(correlationSection!).getByText('Counts · 1 incidents · 0 interactions · 1 events')).toBeVisible();
      expect(within(correlationSection!).queryByText('No correlation selected.')).not.toBeInTheDocument();
    });

    const newFetchUrlsAfterPivot = vi
      .mocked(globalThis.fetch)
      .mock.calls.slice(fetchCallCountBeforePivot)
      .map(([input]) => (typeof input === 'string' ? input : input.toString()));

    expect(newFetchUrlsAfterPivot).toContain(growthRevenueWorkflowUrl);
    expect(newFetchUrlsAfterPivot).toContain(secondaryCorrelationUrl);
    expect(newFetchUrlsAfterPivot).toContain(growthRevenueSelectedSecondaryCorrelationMemoryArtifactsUrl);
    expect(newFetchUrlsAfterPivot).not.toContain(growthRevenueSelectedOperationUrl);
    expect(newFetchUrlsAfterPivot).not.toContain(growthRevenueMemoryArtifactsUrl);
    expect(newFetchUrlsAfterPivot).not.toContain(growthRevenueSelectedReviewCorrelationMemoryArtifactsUrl);
  });

  it('keeps the current-operation correlation when the workflow has none and keeps current or unknown counterparties as plain text', async () => {
    const workflowWithoutSelectedCorrelation = {
      ...workflowFixture,
      detail: {
        ...workflowFixture.detail,
        open_peer_watch_alerts: [],
        recent_handoffs: [
          {
            ...workflowFixture.detail.recent_handoffs[0],
            counterparty_agent_ids: ['growth-revenue', 'app-engineering', 'ghost-agent']
          }
        ],
        recent_reboots: [
          {
            ...workflowFixture.detail.recent_reboots[0],
            counterparty_agent_ids: ['team-lead', 'app-engineering', 'ghost-agent']
          }
        ]
      },
      correlation_ids: []
    } satisfies AgentWorkflow;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === timelineUrl) {
          return new Response(JSON.stringify(timelineFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          return new Response(JSON.stringify(workflowWithoutSelectedCorrelation), {
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(details).getByRole('heading', { name: 'Current Operation' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(correlationSection!).queryByText('No correlation selected.')).not.toBeInTheDocument();
    });

    const workflowHandoffRecord = within(workflowSection!).getByText('Secondary review handoff completed').closest('li');
    const workflowRebootRecord = within(workflowSection!).getByText('Reboot recommended after the workflow stalled').closest('li');
    expect(workflowHandoffRecord).not.toBeNull();
    expect(workflowRebootRecord).not.toBeNull();

    expect(
      within(workflowHandoffRecord!).getByRole('button', {
        name: 'Select workflow status counterparty from handoff handoff-1 growth-revenue'
      })
    ).toBeVisible();
    expect(
      within(workflowHandoffRecord!).queryByRole('button', {
        name: 'Select workflow status counterparty from handoff handoff-1 app-engineering'
      })
    ).not.toBeInTheDocument();
    expect(
      within(workflowHandoffRecord!).queryByRole('button', {
        name: 'Select workflow status counterparty from handoff handoff-1 ghost-agent'
      })
    ).not.toBeInTheDocument();
    expect(workflowHandoffRecord).toHaveTextContent('Counterparties · growth-revenue, app-engineering, ghost-agent');

    expect(
      within(workflowRebootRecord!).getByRole('button', {
        name: 'Select workflow status counterparty from reboot reboot-1 team-lead'
      })
    ).toBeVisible();
    expect(
      within(workflowRebootRecord!).queryByRole('button', {
        name: 'Select workflow status counterparty from reboot reboot-1 app-engineering'
      })
    ).not.toBeInTheDocument();
    expect(
      within(workflowRebootRecord!).queryByRole('button', {
        name: 'Select workflow status counterparty from reboot reboot-1 ghost-agent'
      })
    ).not.toBeInTheDocument();
    expect(workflowRebootRecord).toHaveTextContent('Counterparties · team-lead, app-engineering, ghost-agent');

    await user.click(
      within(workflowHandoffRecord!).getByRole('button', {
        name: 'Select workflow status counterparty from handoff handoff-1 growth-revenue'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(correlationSection!).queryByText('corr-app-secondary')).not.toBeInTheDocument();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(growthRevenueWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(
        growthRevenueSelectedReviewCorrelationMemoryArtifactsUrl,
        expect.anything()
      );
    });
  });

  it('keeps the current-operation correlation when the workflow has no selected interaction correlation and keeps current or unknown participants as plain text', async () => {
    const workflowWithoutSelectedCorrelation = {
      ...workflowFixture,
      detail: {
        ...workflowFixture.detail,
        open_peer_watch_alerts: [],
        recent_interactions: [
          {
            ...workflowFixture.detail.recent_interactions[0],
            participant_agent_ids: ['app-engineering', 'team-lead', 'ghost-agent']
          }
        ]
      },
      correlation_ids: []
    } satisfies AgentWorkflow;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === timelineUrl) {
          return new Response(JSON.stringify(timelineFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          return new Response(JSON.stringify(workflowWithoutSelectedCorrelation), {
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(details).getByRole('heading', { name: 'Current Operation' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(correlationSection!).queryByText('No correlation selected.')).not.toBeInTheDocument();
    });

    const workflowInteractionRecord = within(workflowSection!)
      .getByText('Lead reviewed the missing workflow evidence thread')
      .closest('li');
    expect(workflowInteractionRecord).not.toBeNull();
    expect(workflowInteractionRecord).toHaveTextContent(
      /Participants · app-engineering\s*,\s*team-lead\s*,\s*ghost-agent/
    );
    expect(
      within(workflowInteractionRecord!).queryByRole('button', {
        name: 'Select workflow interaction participant from interaction interaction-workflow-1 app-engineering'
      })
    ).not.toBeInTheDocument();
    expect(
      within(workflowInteractionRecord!).queryByRole('button', {
        name: 'Select workflow interaction participant from interaction interaction-workflow-1 ghost-agent'
      })
    ).not.toBeInTheDocument();
    expect(
      within(workflowInteractionRecord!).queryByRole('button', {
        name: 'Select correlation interaction participant agent team-lead'
      })
    ).not.toBeInTheDocument();

    await user.click(
      within(workflowInteractionRecord!).getByRole('button', {
        name: 'Select workflow interaction participant from interaction interaction-workflow-1 team-lead'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(correlationSection!).queryByText('No correlation selected.')).not.toBeInTheDocument();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(correlationUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadSelectedCorrelationMemoryArtifactsUrl, expect.anything());
    });
  });

  it('does not preserve a carried crew-overview incident correlation when later pivoting through workflow counterparties', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    expect(incidentSection).not.toBeNull();

    await user.click(
      within(incidentSection!).getByRole('button', {
        name: 'Select incident agent app-engineering from incident inc-2'
      })
    );

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
    });

    await user.click(within(workflowSection!).getByRole('button', { name: 'Select workflow counterparty agent team-lead' }));

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      expect(within(correlationSection!).getByText('No correlation selected.')).toBeVisible();
    });

    expect(within(correlationSection!).queryByText('corr-app-secondary')).not.toBeInTheDocument();

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
    });
  });

  it('does not treat a different carried correlation as explicit after an earlier manual selection', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const getIncidentSection = () => within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const getCorrelationSection = () => within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(getIncidentSection()).not.toBeNull();
    expect(getCorrelationSection()).not.toBeNull();

    await user.click(
      within(getIncidentSection()!).getByRole('button', { name: 'Open incident correlation corr-app-review, currently selected' })
    );
    await waitFor(() => {
      expect(within(getCorrelationSection()!).getByText('corr-app-review')).toBeVisible();
    });

    await user.click(
      within(getIncidentSection()!).getByRole('button', {
        name: 'Select incident agent app-engineering from incident inc-2'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(getCorrelationSection()!).getByText('corr-app-secondary')).toBeVisible();
      expect(within(getCorrelationSection()!).getByText('Counts · 1 incidents · 0 interactions · 1 events')).toBeVisible();
    });

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(workflowSection).not.toBeNull();

    await user.click(within(workflowSection!).getByRole('button', { name: 'Select workflow counterparty agent team-lead' }));

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(getCorrelationSection()!).getByText('No correlation selected.')).toBeVisible();
    });

    expect(within(getCorrelationSection()!).queryByText('corr-app-secondary')).not.toBeInTheDocument();

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(correlationUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(secondaryCorrelationUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(workflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
    });
  });

  it('falls back to the selected-agent default correlation when a carried incident correlation 404s', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl) {
          return new Response(JSON.stringify(operationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          return new Response(JSON.stringify(workflowFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === secondaryCorrelationUrl) {
          return new Response(JSON.stringify({ error: 'not_found', details: 'correlation not found' }), {
            status: 404,
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === correlationUrl) {
          return new Response(JSON.stringify(correlationFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    expect(incidentSection).not.toBeNull();

    await user.click(
      within(incidentSection!).getByRole('button', {
        name: 'Select incident agent app-engineering from incident inc-2'
      })
    );

    await waitFor(() => {
      const selectedCorrelationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      expect(selectedCorrelationSection).not.toBeNull();
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(selectedCorrelationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(selectedCorrelationSection!).queryByText('corr-app-secondary')).not.toBeInTheDocument();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(secondaryCorrelationUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(correlationUrl, expect.anything());
    });
  });

  it('shows correlation loading and error states explicitly', async () => {

    let resolveCorrelation: ((response: Response) => void) | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return Promise.resolve(
            new Response(JSON.stringify(overviewFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        if (url === operationsUrl || url === selectedOperationUrl) {
          return Promise.resolve(
            new Response(JSON.stringify(operationsFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        if (url === incidentsUrl) {
          return Promise.resolve(
            new Response(JSON.stringify(incidentFeedFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        if (url === workflowUrl) {
          return Promise.resolve(
            new Response(JSON.stringify(workflowFixture), {
              headers: { 'content-type': 'application/json' }
            })
          );
        }

        if (url === correlationUrl) {
          return new Promise<Response>((resolve) => {
            resolveCorrelation = resolve;
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    expect(incidentSection).not.toBeNull();

    await user.click(within(incidentSection!).getByRole('button', { name: /Open incident correlation corr-app-review/ }));

    expect(resolveCorrelation).not.toBeNull();
    resolveCorrelation!(
      new Response(JSON.stringify({ error: 'internal_error', details: 'correlation refresh failed' }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      })
    );

    expect(await within(details).findByText('correlation refresh failed')).toBeVisible();
    expect(within(details).queryByText('Counts · 1 incidents · 1 interactions · 1 events')).not.toBeInTheDocument();
  });

  it('keeps the last correlation drilldown visible when a later poll fails', async () => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 10;

    let correlationRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl || url === selectedOperationUrl) {
          return new Response(JSON.stringify(operationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          return new Response(JSON.stringify(workflowFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === correlationUrl) {
          correlationRequests += 1;
          if (correlationRequests === 1) {
            return new Response(JSON.stringify(correlationFixture), {
              headers: { 'content-type': 'application/json' }
            });
          }

          return new Response(JSON.stringify({ error: 'internal_error', details: 'correlation refresh failed' }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    expect(incidentSection).not.toBeNull();

    await user.click(within(incidentSection!).getByRole('button', { name: /Open incident correlation corr-app-review/ }));

    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(correlationSection).not.toBeNull();

    expect(await within(details).findByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    expect(await within(details).findByText('correlation refresh failed')).toBeVisible();
    expect(within(correlationSection!).getByText('corr-app-review').closest('li')).toHaveTextContent(
      'Participants · app-engineering, team-lead'
    );
    const correlationIncidentRecord = within(correlationSection!)
      .getByText('Lead is still waiting on workflow evidence')
      .closest('li');
    const correlationInteractionRecord = within(correlationSection!)
      .getByText('Lead escalated missing workflow evidence')
      .closest('li');
    const correlationTimelineRecord = within(correlationSection!).getByText('Workflow evidence is still incomplete').closest('li');
    expect(correlationIncidentRecord).not.toBeNull();
    expect(correlationInteractionRecord).not.toBeNull();
    expect(correlationTimelineRecord).not.toBeNull();
    expect(within(correlationIncidentRecord!).getByText('Incident · peer_watch · open')).toBeVisible();
    expect(within(correlationIncidentRecord!).getByText('Severity · Orange')).toBeVisible();
    expect(within(correlationInteractionRecord!).getByText('Correlation · corr-app-review')).toBeVisible();
    expect(within(correlationInteractionRecord!).getByText('Severity · Orange')).toBeVisible();
    expect(within(correlationTimelineRecord!).getByText('Severity · Orange')).toBeVisible();
    expect(within(correlationSection!).getByText('corr-app-review').closest('li')).toHaveTextContent(
      'Evidence · /tmp/evidence.md, /tmp/peer-watch.md'
    );
    expect(correlationRequests).toBeGreaterThan(1);
  });

  it('keeps the last collector snapshot visible when a later poll fails', async () => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 10;

    let collectorRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl) {
          return new Response(JSON.stringify(operationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === timelineUrl) {
          return new Response(JSON.stringify(timelineFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === collectorSnapshotUrl) {
          collectorRequests += 1;
          if (collectorRequests === 1) {
            return new Response(JSON.stringify({ item: collectorSnapshotFixture }), {
              headers: { 'content-type': 'application/json' }
            });
          }

          return new Response(
            JSON.stringify({ error: 'internal_error', details: 'collector snapshot refresh failed' }),
            {
              status: 500,
              headers: { 'content-type': 'application/json' }
            }
          );
        }

        if (url === collectorEvidenceCoverageUrl) {
          return jsonResponse({ item: collectorSnapshotFixture.evidence_coverage });
        }

        throw new Error(`Unexpected request: ${url}`);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const collectorSection = within(details).getByRole('heading', { name: 'Collector Supervision' }).closest('section');
    expect(collectorSection).not.toBeNull();

    expect(await within(collectorSection!).findByText('Latest snapshot · 2026-03-16T09:01:00.000Z')).toBeVisible();

    await waitFor(() => {
      expect(collectorRequests).toBeGreaterThan(1);
      expect(within(collectorSection!).getByText('Showing last collector snapshot. collector snapshot refresh failed')).toBeVisible();
      expect(within(collectorSection!).getByText('Latest snapshot · 2026-03-16T09:01:00.000Z')).toBeVisible();
      expect(within(collectorSection!).getByText('App Engineering Agent')).toBeVisible();
    });
  });

  it('shows an empty operations queue explicitly when no active overview items exist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl || url === selectedOperationUrl) {
          return new Response(JSON.stringify(emptyOperationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          return new Response(JSON.stringify(workflowFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    expect(await within(details).findByText('No active operations queue.')).toBeVisible();
  });

  it('keeps the last operations queue visible when a later queue poll fails', async () => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 10;

    let operationsRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl || url === selectedOperationUrl) {
          operationsRequests += 1;
          if (operationsRequests === 1) {
            return new Response(JSON.stringify(operationsFixture), {
              headers: { 'content-type': 'application/json' }
            });
          }

          return new Response(JSON.stringify({ error: 'internal_error', details: 'operations refresh failed' }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          return new Response(JSON.stringify(workflowFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const activeQueueSection = await waitFor(() => {
      const nextActiveQueueSection = within(details).getByRole('heading', { name: 'Active Queue' }).closest('section');
      expect(nextActiveQueueSection).not.toBeNull();
      return nextActiveQueueSection;
    });
    expect(await within(activeQueueSection!).findByText('blocked · Workflow evidence is still incomplete')).toBeVisible();

    expect(await within(activeQueueSection!).findByText('Showing last active queue snapshot. operations refresh failed')).toBeVisible();
    expect(within(activeQueueSection!).getByText('blocked · Workflow evidence is still incomplete')).toBeVisible();
    expect(operationsRequests).toBeGreaterThan(1);
  });

  it('keeps the last shared-memory queue visible when a later poll fails', async () => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 10;

    let memoryArtifactRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl || url === selectedOperationUrl) {
          return new Response(JSON.stringify(operationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === timelineUrl) {
          return new Response(JSON.stringify(timelineFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === correlationUrl) {
          return new Response(JSON.stringify(correlationFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === memoryArtifactsUrl) {
          memoryArtifactRequests += 1;
          if (memoryArtifactRequests === 1) {
            return new Response(JSON.stringify(memoryArtifactsFixture), {
              headers: { 'content-type': 'application/json' }
            });
          }

          return new Response(JSON.stringify({ error: 'internal_error', details: 'shared memory refresh failed' }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(memorySection).not.toBeNull();

    expect(await within(memorySection!).findByText('Workflow evidence anchor for the lead review trail')).toBeVisible();
    expect(
      await within(memorySection!).findByText('Showing last shared-memory snapshot. shared memory refresh failed')
    ).toBeVisible();
    expect(within(memorySection!).getByText('Ref · /tmp/evidence.md')).toBeVisible();
    expect(memoryArtifactRequests).toBeGreaterThan(1);
  });

  it('keeps selected agent summary aligned with projected world state', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect Team Lead' }));

    expect(screen.getByRole('button', { name: 'Hide Hub' })).toBeVisible();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
    });

    expect(within(details).getByText(/reviewing · Normal · review-zone/i)).toBeVisible();
  });

  it('shows incident feed header loading explicitly instead of pretending empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === incidentsUrl) {
          return new Promise<Response>(() => {});
        }

        return Promise.resolve(resolveTestFetchResponse(url));
      })
    );

    render(<App />);

    await waitFor(() => {
      expect(within(getFeedStat()).getByRole('status')).toHaveTextContent('Feed · Loading');
      expect(within(getFeedStat()).queryByText('0')).not.toBeInTheDocument();
    });
  });

  it('shows incident feed loading and error states explicitly instead of pretending empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl || url === selectedOperationUrl) {
          return new Response(JSON.stringify(operationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify({ error: 'internal_error', details: 'incident refresh failed' }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          return new Response(JSON.stringify(workflowFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(within(getFeedStat()).getByRole('status')).toHaveTextContent('Feed · Unavailable · incident refresh failed');
      expect(within(getFeedStat()).queryByText('0')).not.toBeInTheDocument();
    });

    const details = await openHub(user);
    expect(await within(details).findByText('incident refresh failed')).toBeVisible();
    expect(within(details).queryByText('No active incident feed.')).not.toBeInTheDocument();
  });

  it('shows feed loading while retrying after an earlier incident refresh failure before any data has loaded', async () => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 10;

    let incidentRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === incidentsUrl) {
          incidentRequests += 1;

          if (incidentRequests === 1) {
            return new Response(JSON.stringify({ error: 'internal_error', details: 'incident refresh failed' }), {
              status: 500,
              headers: { 'content-type': 'application/json' }
            });
          }

          return new Promise<Response>(() => {});
        }

        return Promise.resolve(resolveTestFetchResponse(url));
      })
    );

    render(<App />);

    await waitFor(() => {
      expect(within(getFeedStat()).getByRole('status')).toHaveTextContent('Feed · Unavailable · incident refresh failed');
    });

    await waitFor(() => {
      expect(incidentRequests).toBeGreaterThan(1);
      expect(within(getFeedStat()).getByRole('status')).toHaveTextContent('Feed · Loading');
      expect(within(getFeedStat()).queryByText('Feed · Unavailable · incident refresh failed')).not.toBeInTheDocument();
    });
  });

  it('shows incident feed loading in the Hub while retrying after an earlier feed failure before any data has loaded', async () => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 100;

    let incidentRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === incidentsUrl) {
          incidentRequests += 1;

          if (incidentRequests === 1) {
            return new Response(JSON.stringify({ error: 'internal_error', details: 'incident refresh failed' }), {
              status: 500,
              headers: { 'content-type': 'application/json' }
            });
          }

          return new Promise<Response>(() => {});
        }

        return Promise.resolve(resolveTestFetchResponse(url));
      })
    );

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(within(getFeedStat()).getByRole('status')).toHaveTextContent('Feed · Unavailable · incident refresh failed');
    });

    const details = await openHub(user);

    await waitFor(() => {
      expect(incidentRequests).toBeGreaterThan(1);
      expect(within(details).getByText('Loading incident feed...')).toBeVisible();
      expect(within(details).queryByText('incident refresh failed')).not.toBeInTheDocument();
    });
  });

  it('keeps the last good feed count in the header when incident refresh later fails', async () => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 10;

    let incidentRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === incidentsUrl) {
          incidentRequests += 1;

          if (incidentRequests === 1) {
            return jsonResponse(incidentFeedFixture);
          }

          return new Response(JSON.stringify({ error: 'internal_error', details: 'incident refresh failed' }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    render(<App />);

    await waitFor(() => {
      expect(within(getFeedStat()).getByText('2')).toBeVisible();
    });

    await waitFor(() => {
      expect(incidentRequests).toBeGreaterThan(1);
      expect(within(getFeedStat()).getByText('2')).toBeVisible();
      expect(within(getFeedStat()).getByRole('status')).toHaveTextContent('Feed · Refresh failed · incident refresh failed');
    });
  });

  it('keeps the selected details visible when overview briefly drops the selected agent', () => {
    const selected = resolveSelectedAgent('app-engineering', undefined, overviewFixture.agents[1] as OfficeAgent);

    expect(selected).toMatchObject({
      agent_id: 'app-engineering',
      display_name: 'App Engineering Agent'
    });
  });

  it('keeps selected-agent peek evidence scoped to the displayed correlation', () => {
    const appOperation = operationsFixture.items[0] as OfficeOperation;
    const secondaryOnlyWorkflow = {
      ...workflowFixture.detail,
      open_peer_watch_alerts: [],
      recent_events: [],
      recent_incidents: [],
      recent_reboots: [],
      recent_interactions: [],
      recent_handoffs: [workflowFixture.detail.recent_handoffs[0]]
    };

    expect(
      resolveSelectedAgentPeekEvidenceRef({
        selectedOperation: {
          ...appOperation,
          latest_event: null
        },
        workflow: secondaryOnlyWorkflow,
        correlationId: 'corr-app-review'
      })
    ).toBeNull();
    expect(
      resolveSelectedAgentPeekEvidenceRef({
        selectedOperation: null,
        workflow: secondaryOnlyWorkflow,
        correlationId: null
      })
    ).toBe('/tmp/secondary-evidence.md');
    expect(
      resolveSelectedAgentPeekEvidenceRef({
        selectedOperation: {
          ...appOperation,
          correlation_id: 'corr-app-review',
          latest_event: {
            ...appOperation.latest_event!,
            evidence_refs: ['/tmp/review-operation.md']
          }
        },
        workflow: null,
        correlationId: 'corr-app-secondary'
      })
    ).toBeNull();
  });

  it('shows incident feed failures explicitly even for selected agents', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl || url === selectedOperationUrl) {
          return new Response(JSON.stringify(operationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify({ error: 'internal_error', details: 'incident refresh failed' }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          return new Response(JSON.stringify(workflowFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    expect(await within(details).findByText('incident refresh failed')).toBeVisible();
    expect(within(details).queryByText('No incident feed entries.')).not.toBeInTheDocument();
  });

  it('keeps selected-agent incident rendering on the existing workflow/global request surface', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    expect(await within(details).findByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    expect(incidentSection).not.toBeNull();
    const selectedIncidentRecord = await within(incidentSection!).findByText('Lead is still waiting on workflow evidence');
    expect(selectedIncidentRecord.closest('li')).not.toBeNull();
    expect(within(selectedIncidentRecord.closest('li')!).getByText('Incident · peer_watch · open')).toBeVisible();

    await waitFor(() => {
      const requestedUrls = vi
        .mocked(globalThis.fetch)
        .mock
        .calls.map(([input]) => (typeof input === 'string' ? input : input.toString()));

      expect(requestedUrls).toContain(incidentsUrl);
      expect(requestedUrls).toContain(workflowUrl);
      expect(requestedUrls).not.toContain(selectedAgentIncidentsUrl);
    });
  });

  it('shows a degraded warning when overview refresh fails after initial load', () => {
    expect(resolveOverviewRefreshWarning('overview refresh failed', true)).toBe('overview refresh failed');
    expect(resolveOverviewRefreshWarning('overview refresh failed', false)).toBeNull();
    expect(resolveOverviewRefreshWarning(null, true)).toBeNull();
  });

  it('resolves explicit viewport topline states for loading, live, refresh-failed, and unavailable overview states', () => {
    expect(resolveViewportToplineStatus('loading', null, null)).toEqual({
      status: 'Office snapshot · Loading',
      snapshot: 'Waiting for first office snapshot'
    });
    expect(resolveViewportToplineStatus('ready', null, '2026-03-16T09:00:00.000Z')).toEqual({
      status: 'Office snapshot · Live',
      snapshot: 'Snapshot 2026-03-16T09:00:00.000Z'
    });
    expect(resolveViewportToplineStatus('error', 'overview refresh failed', '2026-03-16T09:00:00.000Z')).toEqual({
      status: 'Office snapshot · Refresh failed · overview refresh failed',
      snapshot: 'Snapshot 2026-03-16T09:00:00.000Z'
    });
    expect(resolveViewportToplineStatus('error', 'overview unavailable', null)).toEqual({
      status: 'Office snapshot · Unavailable · overview unavailable',
      snapshot: 'No office snapshot loaded yet'
    });
  });

  it('keeps the last overview snapshot visible when a later overview poll fails', async () => {
    const user = userEvent.setup();
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 10;

    let overviewRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          overviewRequests += 1;
          if (overviewRequests === 1) {
            return new Response(JSON.stringify(overviewFixture), {
              headers: { 'content-type': 'application/json' }
            });
          }

          return new Response(JSON.stringify({ error: 'internal_error', details: 'overview refresh failed' }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Metaverse Office' })).toBeVisible();
    let signals = await screen.findByRole('region', { name: 'Office HUD signals' });
    expect(await within(signals).findByText(/Office snapshot · Refresh failed · overview refresh failed/)).toBeVisible();
    expect(within(signals).getByText(/Snapshot 2026-03-16T09:00:00.000Z/)).not.toBeVisible();
    signals = await openHudSignals(user);
    expect(within(signals).getByText(/Snapshot 2026-03-16T09:00:00.000Z/)).toBeVisible();

    expect(await screen.findByText('Showing last office snapshot.')).toBeVisible();
    expect(screen.getByText('overview refresh failed')).toBeVisible();
    expect(within(signals).getByText(/Office snapshot · Refresh failed · overview refresh failed/)).toBeVisible();
    expect(within(signals).getByText(/Snapshot 2026-03-16T09:00:00.000Z/)).toBeVisible();
    expect(screen.queryByText('Unable to load office overview.')).not.toBeInTheDocument();
  });

  it('shows an explicit viewport unavailable status when the first overview load fails', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify({ error: 'internal_error', details: 'overview unavailable' }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Metaverse Office' })).toBeVisible();
    const signals = await screen.findByRole('region', { name: 'Office HUD signals' });
    expect(within(signals).getByText(/Office snapshot · Unavailable · overview unavailable/)).toBeVisible();
    expect(within(signals).getByText('No office snapshot loaded yet')).not.toBeVisible();
    await openHudSignals(user);
    expect(within(signals).getByText('No office snapshot loaded yet')).toBeVisible();
    expect(screen.getByText('Unable to load office overview.')).toBeVisible();
  });

  it('clears stale selected-agent workflow details only after overview confirms the agent is absent', async () => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 10;

    let overviewRequests = 0;
    let workflowRequests = 0;
    let allowOverviewDrop = false;
    let overviewDroppedAgent = false;
    const overviewWithoutSelectedAgent = {
      ...overviewFixture,
      summary: {
        ...overviewFixture.summary,
        agent_count: 2,
        blocked_count: 0,
        reboot_recommended_count: 0,
        severity_buckets: {
          normal: 1,
          yellow: 1,
          orange: 0,
          red: 0
        }
      },
      watch_edges: [],
      agents: overviewFixture.agents.filter((agent) => agent.agent_id !== 'app-engineering'),
      zones: overviewFixture.zones.map((zone) => ({
        ...zone,
        occupants: zone.occupants
      }))
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          overviewRequests += 1;
          const body = allowOverviewDrop ? overviewWithoutSelectedAgent : overviewFixture;
          if (allowOverviewDrop) {
            overviewDroppedAgent = true;
          }
          return new Response(JSON.stringify(body), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          workflowRequests += 1;
          if (workflowRequests === 1) {
            return new Response(JSON.stringify(workflowFixture), {
              headers: { 'content-type': 'application/json' }
            });
          }

          if (!overviewDroppedAgent) {
            return new Response(JSON.stringify(workflowFixture), {
              headers: { 'content-type': 'application/json' }
            });
          }

          return new Response(JSON.stringify({ error: 'not_found', details: 'unknown agent app-engineering' }), {
            status: 404,
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(await within(details).findByRole('button', { name: 'Inspect App Engineering Agent' }));
    expect(await within(details).findByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    allowOverviewDrop = true;

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    });
    expect(overviewRequests).toBeGreaterThan(1);
    expect(workflowRequests).toBeGreaterThan(1);
    expect(within(details).queryByRole('heading', { name: 'App Engineering Agent' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear Selection' })).not.toBeInTheDocument();
  });

  it('keeps selected-agent workflow details pinned and shows explicit stale workflow copy when a workflow 404 arrives before overview drops the agent', async () => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = 10;

    let workflowRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl || url === selectedOperationUrl) {
          return new Response(JSON.stringify(operationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify(incidentFeedFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          workflowRequests += 1;
          if (workflowRequests === 1) {
            return new Response(JSON.stringify(workflowFixture), {
              headers: { 'content-type': 'application/json' }
            });
          }

          return new Response(JSON.stringify({ error: 'not_found', details: 'unknown agent app-engineering' }), {
            status: 404,
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));
    expect(await within(details).findByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(workflowSection).not.toBeNull();
    expect(
      await within(workflowSection!).findByText('Showing last workflow snapshot. unknown agent app-engineering')
    ).toBeVisible();
    expect(within(workflowSection!).getByText((_, element) => element?.tagName === 'STRONG' && element.textContent === 'Latest heartbeat')).toBeVisible();
    expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Clear Selection' })).toBeVisible();
  });

  it('prefers workflow incidents when the selected agent is missing from the global incident feed', async () => {
    const workflowWithIncidents = {
      ...workflowFixture,
      incidents: [
        {
          incident_id: 'wf-inc-1',
          kind: 'peer_watch',
          ts: '2026-03-16T08:49:00.000Z',
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          status: 'open',
          severity: 'orange',
          summary: 'Workflow incident fallback entry',
          correlation_id: 'corr-app-review',
          evidence_refs: ['/tmp/evidence.md'],
          counterparty_agent_ids: ['team-lead'],
          source_kind: 'controller_event'
        }
      ],
      detail: {
        ...workflowFixture.detail,
        recent_incidents: [
          {
            incident_id: 'wf-inc-1',
            kind: 'peer_watch',
            ts: '2026-03-16T08:49:00.000Z',
            agent_id: 'app-engineering',
            actor_id: 'team-lead',
            status: 'open',
            severity: 'orange',
            summary: 'Workflow incident fallback entry',
            correlation_id: 'corr-app-review',
            evidence_refs: ['/tmp/evidence.md'],
            counterparty_agent_ids: ['team-lead'],
            source_kind: 'controller_event'
          }
        ]
      }
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === '/office/overview') {
          return new Response(JSON.stringify(overviewFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === operationsUrl || url === selectedOperationUrl) {
          return new Response(JSON.stringify(operationsFixture), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === incidentsUrl) {
          return new Response(JSON.stringify({ items: [] }), {
            headers: { 'content-type': 'application/json' }
          });
        }

        if (url === workflowUrl) {
          return new Response(JSON.stringify(workflowWithIncidents), {
            headers: { 'content-type': 'application/json' }
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    expect(await within(details).findByText('Workflow incident fallback entry')).toBeVisible();
    expect(within(details).queryByText('No incident feed entries.')).not.toBeInTheDocument();
  });

  it('loads workflow details into the right panel when an agent is selected', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    });

    const workflowSection = within(details).getByRole('heading', { name: 'Workflow' }).closest('section');
    expect(workflowSection).not.toBeNull();

    expect(within(details).getByText('Fix workflow issue')).toBeVisible();
    expect(within(workflowSection!).getByText('Workflow evidence is still incomplete')).toBeVisible();
    expect(within(details).getByText('meeting-zone')).toBeVisible();
    expect(within(workflowSection!).getByText('Workflow status · blocked')).toBeVisible();
    expect(within(workflowSection!).getByText('Latest heartbeat · 2026-03-16T08:59:30.000Z')).toBeVisible();
    expect(within(workflowSection!).getByText('Recent interactions · 1')).toBeVisible();
    expect(within(workflowSection!).getByText('Recent timeline · 1')).toBeVisible();
    expect(within(workflowSection!).getByText('Recent handoffs · 1')).toBeVisible();
    expect(within(workflowSection!).getByText('Recent reboots · 1')).toBeVisible();
    const workflowInteractionRecord = within(workflowSection!)
      .getByText('Lead reviewed the missing workflow evidence thread')
      .closest('li');
    const workflowTimelineRecord = within(workflowSection!)
      .getByText('Agent attached workflow evidence for lead review')
      .closest('li');
    expect(workflowInteractionRecord).not.toBeNull();
    expect(workflowTimelineRecord).not.toBeNull();
    expect(within(workflowInteractionRecord!).getByText('Interaction · peer_watch')).toBeVisible();
    expect(workflowInteractionRecord!).toHaveTextContent(/Participants · app-engineering\s*,\s*team-lead/);
    expect(
      within(workflowInteractionRecord!).getByRole('button', {
        name: 'Select workflow interaction participant from interaction interaction-workflow-1 team-lead'
      })
    ).toBeVisible();
    expect(workflowInteractionRecord!).toHaveTextContent('Correlation · corr-app-review');
    expect(
      within(workflowInteractionRecord!).getByRole('button', {
        name: 'Open workflow interaction correlation from interaction interaction-workflow-1 corr-app-review, currently selected'
      })
    ).toBeVisible();
    expect(within(workflowInteractionRecord!).getByText('Severity · Orange')).toBeVisible();
    expect(within(workflowTimelineRecord!).getByText('Timeline · agent_noted · meeting-zone')).toBeVisible();
    expect(within(workflowTimelineRecord!).getByText('Severity · Yellow')).toBeVisible();
    const workflowHandoffRecord = within(workflowSection!).getByText('Secondary review handoff completed').closest('li');
    const workflowRebootRecord = within(workflowSection!).getByText('Reboot recommended after the workflow stalled').closest('li');
    expect(workflowHandoffRecord).not.toBeNull();
    expect(workflowRebootRecord).not.toBeNull();
    expect(within(workflowHandoffRecord!).getByText('Handoff · completed · handoff_done')).toBeVisible();
    expect(within(workflowHandoffRecord!).getByText('At · 2026-03-16T08:57:00.000Z')).toBeVisible();
    expect(
      within(workflowHandoffRecord!).getByRole('button', {
        name: 'Select workflow status actor from handoff handoff-1 growth-revenue'
      })
    ).toBeVisible();
    expect(
      within(workflowHandoffRecord!).getByRole('button', {
        name: 'Select workflow status counterparty from handoff handoff-1 growth-revenue'
      })
    ).toBeVisible();
    expect(
      within(workflowHandoffRecord!).getByRole('button', {
        name: 'Open workflow status correlation corr-app-secondary'
      })
    ).toBeVisible();
    expect(within(workflowHandoffRecord!).getByText('Severity · Yellow')).toBeVisible();
    expect(within(workflowRebootRecord!).getByText('Reboot · requested · reboot_recommended')).toBeVisible();
    expect(within(workflowRebootRecord!).getByText('At · 2026-03-16T08:40:00.000Z')).toBeVisible();
    expect(
      within(workflowRebootRecord!).getByRole('button', {
        name: 'Select workflow status actor from reboot reboot-1 team-lead'
      })
    ).toBeVisible();
    expect(
      within(workflowRebootRecord!).getByRole('button', {
        name: 'Select workflow status counterparty from reboot reboot-1 team-lead'
      })
    ).toBeVisible();
    expect(
      within(workflowRebootRecord!).getByRole('button', {
        name: 'Open workflow status correlation corr-app-review, currently selected'
      })
    ).toBeVisible();
    expect(within(workflowRebootRecord!).getByText('Severity · Yellow')).toBeVisible();

    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    expect(incidentSection).not.toBeNull();
    const selectedIncidentRecord = within(incidentSection!).getByText('Lead is still waiting on workflow evidence').closest('li');
    expect(selectedIncidentRecord).not.toBeNull();
    expect(within(selectedIncidentRecord!).getByText('At · 2026-03-16T08:50:00.000Z')).toBeVisible();
    expect(selectedIncidentRecord!).toHaveTextContent('Actor · team-lead');
    expect(within(selectedIncidentRecord!).getByText('Incident · peer_watch · open')).toBeVisible();
    expect(within(selectedIncidentRecord!).getByText('Severity · Orange')).toBeVisible();
    expect(selectedIncidentRecord).toHaveTextContent('Counterparties · team-lead');
    expect(
      within(selectedIncidentRecord!).getByRole('button', {
        name: 'Select incident feed counterparty agent from incident inc-1 team-lead'
      })
    ).toBeVisible();
    expect(selectedIncidentRecord).toHaveTextContent('Evidence · /tmp/evidence.md');
    expect(
      within(selectedIncidentRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/evidence.md'
      })
    ).toBeVisible();
    expect(within(selectedIncidentRecord!).getByText('Source · controller_event')).toBeVisible();

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(workflowUrl, expect.anything());
    });
  });

  it('shows collector observation context for the selected agent', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const collectorSection = await within(details).findByRole('heading', { name: 'Collector Observation' });
    const collectorContainer = collectorSection.closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(collectorContainer).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    expect(within(collectorContainer!).getByText('Heartbeat received · 2026-03-16T08:59:30.000Z')).toBeVisible();
    expect(within(collectorContainer!).getByText('Collector state · blocked')).toBeVisible();
    expect(within(collectorContainer!).getByText('Active task · Fix workflow issue')).toBeVisible();
    expect(within(collectorContainer!).getByText('Current blocker · Workflow evidence is still incomplete')).toBeVisible();
    expect(within(collectorContainer!).getByText('Attention flag · Needs attention')).toBeVisible();
    expect(within(collectorContainer!).getByText('Reboot flag · Recommended')).toBeVisible();
    expect(within(collectorContainer!).getByText('Watch graph alignment · Target + watcher mismatch')).toBeVisible();
    const collectorWatchTargetLine = within(collectorContainer!).getByText(
      (_content, element) => element?.tagName === 'SPAN' && element.textContent === 'Watch target · growth-revenue'
    );
    expect(
      within(collectorWatchTargetLine).getByRole('button', {
        name: 'Select collector observation watch target growth-revenue'
      })
    ).toBeVisible();
    const watchedByLine = within(collectorContainer!).getByText(
      (_content, element) => element?.tagName === 'SPAN' && element.textContent === 'Watched by · team-lead, growth-revenue'
    );
    expect(
      within(watchedByLine).getByRole('button', {
        name: 'Select collector observation watcher team-lead'
      })
    ).toBeVisible();
    expect(
      within(watchedByLine).getByRole('button', {
        name: 'Select collector observation watcher growth-revenue'
      })
    ).toBeVisible();
    expect(within(collectorContainer!).getByText('Workspace observations · 2')).toBeVisible();
    expect(within(collectorContainer!).getByText('Tmux observations · 1')).toBeVisible();
    expect(collectorContainer!).toHaveTextContent('Evidence · /tmp/controller-log.md, /tmp/evidence.md');
    const collectorEvidenceLine = within(collectorContainer!).getByText(
      (_content, element) =>
        element?.tagName === 'SPAN' &&
        element.textContent === 'Evidence · /tmp/controller-log.md, /tmp/evidence.md'
    );
    const artifactRecord = within(memorySection!).getByText('Ref · /tmp/evidence.md').closest('li');
    expect(artifactRecord).not.toBeNull();
    expect(
      within(collectorEvidenceLine).getByRole('button', {
        name: 'Jump to collector evidence ref /tmp/evidence.md'
      })
    ).toBeVisible();
    expect(
      within(collectorEvidenceLine).getByRole('button', {
        name: 'Jump to collector evidence ref /tmp/controller-log.md'
      })
    ).toBeVisible();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    const fetchCallCountBeforeJump = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(collectorEvidenceLine).getByRole('button', {
        name: 'Jump to collector evidence ref /tmp/evidence.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();

    const newFetchUrlsAfterJump = vi
      .mocked(globalThis.fetch)
      .mock.calls.slice(fetchCallCountBeforeJump)
      .map(([input]) => (typeof input === 'string' ? input : input.toString()));
    expect(newFetchUrlsAfterJump).not.toContain(workflowUrl);
    expect(newFetchUrlsAfterJump).not.toContain(correlationUrl);
    expect(newFetchUrlsAfterJump).not.toContain(appEngineeringMemoryArtifactsUrl);
    expect(newFetchUrlsAfterJump).not.toContain(selectedCorrelationMemoryArtifactsUrl);
  });

  it('jumps from matching collector tmux previews to shared memory without changing the selected agent, active correlation, or scoped request surface', async () => {
    const tmuxArtifactRef = 'tmux://5-web3-app-engineering/0.1';
    const tmuxPreviewLabel = 'pnpm test · 2026-03-16T08:59:10.000Z';
    const collectorSnapshotWithTmux = {
      ...collectorSnapshotFixture,
      items: collectorSnapshotFixture.items.map((item) =>
        item.agent_id === 'app-engineering'
          ? {
              ...item,
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
                  pane_activity_at: '2026-03-16T08:59:10.000Z'
                }
              ]
            }
          : item
      )
    };
    const scopedMemoryArtifactsWithTmux = {
      ...selectedCorrelationMemoryArtifactsFixture,
      items: [
        ...selectedCorrelationMemoryArtifactsFixture.items,
        {
          artifact_ref: tmuxArtifactRef,
          artifact_kind: 'tmux_observation',
          file_name: '5-web3-app-engineering/0.1',
          first_seen_at: '2026-03-16T08:59:10.000Z',
          last_seen_at: '2026-03-16T08:59:10.000Z',
          mention_count: 1,
          agent_ids: ['app-engineering'],
          correlation_ids: ['corr-app-review'],
          source_kinds: ['collector_snapshot'],
          latest_summary: 'Collector observed tmux test pane for the active review scope',
          latest_event_type: 'collector_snapshot_written',
          collector_last_modified_at: '2026-03-16T08:59:10.000Z'
        }
      ]
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === collectorSnapshotUrl) {
          return jsonResponse({ item: collectorSnapshotWithTmux });
        }

        if (url === appEngineeringMemoryArtifactsUrl || url === selectedCorrelationMemoryArtifactsUrl) {
          return jsonResponse(scopedMemoryArtifactsWithTmux);
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const collectorSection = await within(details).findByRole('heading', { name: 'Collector Observation' });
    const collectorContainer = collectorSection.closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(collectorContainer).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    const tmuxArtifactRecord = within(memorySection!).getByText(`Ref · ${tmuxArtifactRef}`).closest('li');
    expect(tmuxArtifactRecord).not.toBeNull();
    expect(within(memorySection!).getByText('Request scope · app-engineering · corr-app-review')).toBeVisible();
    expect(collectorContainer).toHaveTextContent(`Tmux preview · ${tmuxPreviewLabel}`);
    expect(
      within(collectorContainer!).getByRole('button', {
        name: `Jump to shared memory artifact ${tmuxArtifactRef} ${tmuxPreviewLabel}`
      })
    ).toBeVisible();

    await waitFor(() => {
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    const fetchCallCountBeforeJump = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(collectorContainer!).getByRole('button', {
        name: `Jump to shared memory artifact ${tmuxArtifactRef} ${tmuxPreviewLabel}`
      })
    );

    expect(document.activeElement).toBe(tmuxArtifactRecord);
    expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    expect(within(memorySection!).getByText('Request scope · app-engineering · corr-app-review')).toBeVisible();

    const newFetchUrlsAfterJump = vi
      .mocked(globalThis.fetch)
      .mock.calls.slice(fetchCallCountBeforeJump)
      .map(([input]) => (typeof input === 'string' ? input : input.toString()));
    expect(newFetchUrlsAfterJump).not.toContain(workflowUrl);
    expect(newFetchUrlsAfterJump).not.toContain(correlationUrl);
    expect(newFetchUrlsAfterJump).not.toContain(appEngineeringMemoryArtifactsUrl);
    expect(newFetchUrlsAfterJump).not.toContain(selectedCorrelationMemoryArtifactsUrl);
  });

  it('falls back to one exact shared-memory artifact fetch for matching collector tmux previews outside the loaded slice', async () => {
    const tmuxArtifactRef = 'tmux://5-web3-app-engineering/0.1';
    const tmuxPreviewLabel = 'pnpm test · 2026-03-16T08:59:10.000Z';
    const collectorSnapshotWithTmux = {
      ...collectorSnapshotFixture,
      items: collectorSnapshotFixture.items.map((item) =>
        item.agent_id === 'app-engineering'
          ? {
              ...item,
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
                  pane_activity_at: '2026-03-16T08:59:10.000Z'
                }
              ]
            }
          : item
      )
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url === collectorSnapshotUrl) {
          return jsonResponse({ item: collectorSnapshotWithTmux });
        }

        if (url === selectedCorrelationTmuxArtifactExactUrl) {
          return jsonResponse({
            generated_at: '2026-03-16T09:00:00.000Z',
            items: [
              {
                artifact_ref: tmuxArtifactRef,
                artifact_kind: 'tmux_observation',
                file_name: '5-web3-app-engineering/0.1',
                first_seen_at: '2026-03-16T08:59:10.000Z',
                last_seen_at: '2026-03-16T08:59:10.000Z',
                mention_count: 1,
                agent_ids: ['app-engineering'],
                correlation_ids: ['corr-app-review'],
                source_kinds: ['collector_snapshot'],
                latest_summary: 'Collector tmux fallback stayed inside the selected-agent scope',
                latest_event_type: 'collector_snapshot_written',
                collector_last_modified_at: '2026-03-16T08:59:10.000Z'
              }
            ]
          });
        }

        return resolveTestFetchResponse(url);
      })
    );

    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const collectorSection = await within(details).findByRole('heading', { name: 'Collector Observation' });
    const collectorContainer = collectorSection.closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const memorySection = within(details).getByRole('heading', { name: 'Shared Memory' }).closest('section');
    expect(collectorContainer).not.toBeNull();
    expect(correlationSection).not.toBeNull();
    expect(memorySection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    const fetchCallCountBeforeJump = vi.mocked(globalThis.fetch).mock.calls.length;

    await user.click(
      within(collectorContainer!).getByRole('button', {
        name: `Jump to shared memory artifact ${tmuxArtifactRef} ${tmuxPreviewLabel}`
      })
    );

    await waitFor(() => {
      expect(within(memorySection!).getByText('Collector tmux fallback stayed inside the selected-agent scope')).toBeVisible();
    });

    const tmuxArtifactRecord = within(memorySection!).getByText(`Ref · ${tmuxArtifactRef}`).closest('li');
    expect(tmuxArtifactRecord).not.toBeNull();
    expect(document.activeElement).toBe(tmuxArtifactRecord);
    const backlinkLane = within(memorySection!).getByText('Current-scope backlinks').closest('div');
    expect(backlinkLane).not.toBeNull();
    expect(within(backlinkLane!).getByText('Collector tmux preview')).toBeVisible();
    expect(within(backlinkLane!).getByText(`app-engineering · ${tmuxPreviewLabel}`)).toBeVisible();
    expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    expect(within(memorySection!).getByText('Request scope · app-engineering · corr-app-review')).toBeVisible();

    const newFetchUrlsAfterJump = vi
      .mocked(globalThis.fetch)
      .mock.calls.slice(fetchCallCountBeforeJump)
      .map(([input]) => (typeof input === 'string' ? input : input.toString()));
    expect(newFetchUrlsAfterJump).toEqual([selectedCorrelationTmuxArtifactExactUrl]);
  });

  it('preserves the active selected-agent correlation when pivoting through the collector observation watch target', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
    });

    const collectorSection = within(details).getByRole('heading', { name: 'Collector Observation' }).closest('section');
    expect(collectorSection).not.toBeNull();

    await user.click(
      within(collectorSection!).getByRole('button', {
        name: 'Select collector observation watch target growth-revenue'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      const nextCorrelationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      expect(nextCorrelationSection).not.toBeNull();
      expect(within(nextCorrelationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(nextCorrelationSection!).getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
      expect(within(nextCorrelationSection!).queryByText('corr-growth-lead-review')).not.toBeInTheDocument();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(growthRevenueWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(correlationUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(
        growthRevenueSelectedReviewCorrelationMemoryArtifactsUrl,
        expect.anything()
      );
    });
  });

  it('preserves the active selected-agent correlation when pivoting through collector observation watchers', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    const collectorSection = within(details).getByRole('heading', { name: 'Collector Observation' }).closest('section');
    expect(correlationSection).not.toBeNull();
    expect(collectorSection).not.toBeNull();

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
      expect(
        within(collectorSection!).getByRole('button', {
          name: 'Select collector observation watcher team-lead'
        })
      ).toBeVisible();
    });

    await user.click(
      within(collectorSection!).getByRole('button', {
        name: 'Select collector observation watcher team-lead'
      })
    );

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
      const nextCorrelationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
      expect(nextCorrelationSection).not.toBeNull();
      expect(within(nextCorrelationSection!).getByText('corr-app-review')).toBeVisible();
      expect(within(nextCorrelationSection!).getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
      expect(within(nextCorrelationSection!).queryByText('corr-app-secondary')).not.toBeInTheDocument();
    });

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(teamLeadWorkflowUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(correlationUrl, expect.anything());
      expect(globalThis.fetch).toHaveBeenCalledWith(
        teamLeadSelectedCorrelationMemoryArtifactsUrl,
        expect.anything()
      );
    });
  });
});
