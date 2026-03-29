import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App, { resolveOverviewRefreshWarning, resolveSelectedAgent } from './App';
import type { AgentWorkflow, OfficeAgent } from './types';

const operationsUrl = '/office/operations?limit=4';
const selectedOperationUrl = '/office/operations?agent_id=app-engineering';
const incidentsUrl = '/incidents?limit=10&window=60m';
const selectedAgentIncidentsUrl = '/agents/app-engineering/incidents?limit=10&window=60m';
const timelineUrl = '/timeline?limit=4&window=60m';
const workflowUrl = '/agents/app-engineering/workflow?limit=10&window=60m';
const teamLeadWorkflowUrl = '/agents/team-lead/workflow?limit=10&window=60m';
const growthRevenueWorkflowUrl = '/agents/growth-revenue/workflow?limit=10&window=60m';
const correlationUrl = '/correlations/corr-app-review?limit=10&window=60m';
const secondaryCorrelationUrl = '/correlations/corr-app-secondary?limit=10&window=60m';
const memoryArtifactsUrl = '/memory/artifacts?limit=4&window=60m';
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
const collectorSnapshotUrl = '/collectors/controller-snapshot';

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
  correlation_ids: [],
  counterparty_agent_ids: [],
  incidents: [],
  interactions: [],
  timeline: []
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
  correlation_ids: ['corr-growth-lead-review'],
  counterparty_agent_ids: ['team-lead'],
  incidents: [],
  interactions: [],
  timeline: []
} satisfies AgentWorkflow;

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

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' }
  });
}

function resolveDefaultFetchResponse(url: string) {
  if (url === '/office/overview') {
    return jsonResponse(overviewFixture);
  }

  if (url === operationsUrl || url === selectedOperationUrl) {
    return jsonResponse(operationsFixture);
  }

  if (url === incidentsUrl) {
    return jsonResponse(incidentFeedFixture);
  }

  if (url === timelineUrl) {
    return jsonResponse(timelineFixture);
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
  vi.unstubAllGlobals();
});

  it('renders the operator shell as the default frontend', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Metaverse Office' })).toBeVisible();
    expect(screen.getByText('Metaverse Office operator shell')).toBeVisible();
    expect(
      screen.getByText('Operator shell for real-running, supervised, replayable, accountable agents.')
    ).toBeVisible();

    const worldRegion = screen.getByRole('region', { name: 'Office world' });
    expect(worldRegion).toBeVisible();
    expect(within(worldRegion).getByText('Loading world renderer...')).toBeVisible();

    expect(screen.getByRole('button', { name: 'Open Hub' })).toBeVisible();
    expect(screen.queryByRole('complementary', { name: 'Agent details' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Inspect App Engineering Agent' })).not.toBeInTheDocument();
  });

  it('renders an accessible scene status legend for the canvas badge markers', async () => {
    render(<App />);

    const worldRegion = await screen.findByRole('region', { name: 'Office world' });
    const legend = within(worldRegion).getByRole('list', { name: 'Scene status legend' });
    const items = within(legend).getAllByRole('listitem');

    expect(legend).toBeVisible();
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('#');
    expect(items[0]).toHaveTextContent('Peer-watch alert count');
    expect(items[1]).toHaveTextContent('!');
    expect(items[1]).toHaveTextContent('Open alerts or workflow incidents');
    expect(items[2]).toHaveTextContent('R');
    expect(items[2]).toHaveTextContent('Reboot recommended');
    expect(worldRegion).not.toHaveAttribute('aria-describedby');
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
    const lastDialogButton = dialogButtons.at(-1);

    expect(lastDialogButton).toBeDefined();
    await waitFor(() => {
      expect(closeButton).toHaveFocus();
    });

    await user.tab({ shift: true });
    expect(lastDialogButton).toHaveFocus();

    await user.tab();
    expect(closeButton).toHaveFocus();
  });

  it('loads the active operations queue only when Hub opens in Crew Overview and requests the limited slice', async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole('button', { name: 'Open Hub' });
    expect(globalThis.fetch).not.toHaveBeenCalledWith(operationsUrl, expect.anything());

    const details = await openHub(user);

    expect(await within(details).findByRole('heading', { name: 'Active Queue' })).toBeVisible();
    expect(within(details).getByText('blocked · Workflow evidence is still incomplete')).toBeVisible();
    expect(within(details).getByText('reviewing · Coordinate rollout')).toBeVisible();

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(operationsUrl, expect.anything());
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
    expect(within(topologySection!).getByText('Team Lead -> App Engineering Agent')).toBeVisible();
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
    expect(within(collectorSection!).getByText('App Engineering Agent')).toBeVisible();
    expect(within(collectorSection!).getByText('Needs attention · Yes')).toBeVisible();
    const appEngineeringCollectorRecord = within(collectorSection!).getByText('App Engineering Agent').closest('li');
    const growthRevenueCollectorRecord = within(collectorSection!).getByText('Growth Revenue Agent').closest('li');
    expect(appEngineeringCollectorRecord).not.toBeNull();
    expect(growthRevenueCollectorRecord).not.toBeNull();
    expect(appEngineeringCollectorRecord!).toHaveTextContent('Watch target · growth-revenue');
    expect(appEngineeringCollectorRecord!).toHaveTextContent('Watchers · team-lead, growth-revenue');
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
    expect(collectorSection!).toHaveTextContent('Evidence · /tmp/controller-log.md, /tmp/evidence.md');
    expect(
      within(collectorSection!).getByRole('button', {
        name: 'Jump to collector evidence ref /tmp/evidence.md'
      })
    ).toBeVisible();
    expect(
      within(collectorSection!).queryByRole('button', {
        name: 'Jump to collector evidence ref /tmp/controller-log.md'
      })
    ).not.toBeInTheDocument();
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

  it('loads the timeline replay slice only when Hub opens in Crew Overview and hides it after selecting an agent', async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole('button', { name: 'Open Hub' });
    expect(globalThis.fetch).not.toHaveBeenCalledWith(timelineUrl, expect.anything());

    const details = await openHub(user);
    const replaySection = (await within(details).findByRole('heading', { name: 'Timeline Replay' })).closest('section');

    expect(replaySection).not.toBeNull();
    expect(within(replaySection!).getByText('Replay captured missing workflow evidence')).toBeVisible();

    await act(async () => {
      expect(globalThis.fetch).toHaveBeenCalledWith(timelineUrl, expect.anything());
    });

    await user.click(within(details).getByRole('button', { name: 'Inspect Team Lead' }));
    expect(within(details).queryByRole('heading', { name: 'Timeline Replay' })).not.toBeInTheDocument();
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
    expect(within(replayEvent!).getByText('Location · meeting-zone')).toBeVisible();
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
    expect(officeGridLabels).toEqual(['Team Lead Desk', 'QA Desk', 'Meeting Zone']);

    expect(within(officeGridSection!).getAllByText('Kind · desk')).toHaveLength(2);
    expect(within(officeGridSection!).getByText('Kind · shared')).toBeVisible();
    expect(within(officeGridSection!).getByText('Home · Team Lead')).toBeVisible();
    expect(within(officeGridSection!).getByText('Home · Growth Revenue Agent')).toBeVisible();
    expect(
      within(officeGridSection!).getByRole('button', { name: 'Select zone occupant Team Lead in Team Lead Desk' })
    ).toBeVisible();
    expect(within(officeGridSection!).getAllByText('Occupants · Empty')).toHaveLength(1);
    expect(within(officeGridSection!).getByText('Severity · Normal · 1 occupant(s)')).toBeVisible();
    expect(within(officeGridSection!).getByText('Severity · Orange · 2 occupant(s)')).toBeVisible();

    const occupantButton = within(officeGridSection!).getByRole('button', {
      name: 'Select zone occupant App Engineering Agent in Meeting Zone'
    });
    expect(occupantButton).toBeVisible();

    await user.click(occupantButton);
    expect(await within(details).findByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
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
      within(operationSection!).queryByRole('button', {
        name: 'Jump to shared memory artifact /tmp/missing.md'
      })
    ).not.toBeInTheDocument();

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

    const operationSection = await within(details).findByRole('heading', { name: 'Current Operation' });
    expect(operationSection).toBeVisible();

    const auditSignalsSection = within(details).getByRole('heading', { name: 'Audit Signals' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(auditSignalsSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await waitFor(() => {
      expect(operationsRequests).toBeGreaterThan(1);
      expect(globalThis.fetch).toHaveBeenCalledWith(selectedOperationUrl, expect.anything());
      expect(within(details).getByText('Showing last operation snapshot. operations refresh failed')).toBeVisible();
      expect(within(details).getByText('blocked · Workflow evidence is still incomplete')).toBeVisible();
      expect(within(details).getByText('Latest event · Stale queue snapshot should not win')).toBeVisible();
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

    expect(await within(details).findByRole('heading', { name: 'Current Operation' })).toBeVisible();
    dropSelectedOperation = true;

    await waitFor(() => {
      expect(operationsRequests).toBeGreaterThan(1);
      expect(within(details).getByText('Showing last operation snapshot. Operation is no longer in the active queue.')).toBeVisible();
      expect(within(details).getByText('blocked · Workflow evidence is still incomplete')).toBeVisible();
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

  it('clears queue-derived operation context before a fresh roster selection', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent from active queue' }));
    expect(await within(details).findByRole('heading', { name: 'Current Operation' })).toBeVisible();

    await user.click(within(details).getByRole('button', { name: 'Clear' }));
    await user.click(within(details).getByRole('button', { name: 'Inspect Team Lead' }));

    await waitFor(() => {
      expect(within(details).getByRole('heading', { name: 'Team Lead' })).toBeVisible();
      expect(within(details).queryByRole('heading', { name: 'Current Operation' })).not.toBeInTheDocument();
    });
  });

  it('resets toolbar-cleared correlation selection back to the crew-overview default on reopen', async () => {
    const user = userEvent.setup();
    render(<App />);

    const details = await openHub(user);
    await user.click(within(details).getByRole('button', { name: 'Inspect App Engineering Agent' }));

    const incidentSection = within(details).getByRole('heading', { name: 'Incident Feed' }).closest('section');
    const correlationSection = within(details).getByRole('heading', { name: 'Correlation Drilldown' }).closest('section');
    expect(incidentSection).not.toBeNull();
    expect(correlationSection).not.toBeNull();

    await user.click(
      within(incidentSection!).getByRole('button', { name: 'Open incident correlation corr-app-secondary' })
    );
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
  });

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
    expect(await within(details).findByText('Loading operations queue...')).toBeVisible();

    expect(resolveOperations).not.toBeNull();
    resolveOperations!(
      new Response(JSON.stringify(operationsFixture), {
        headers: { 'content-type': 'application/json' }
      })
    );

    expect(await within(details).findByText('blocked · Workflow evidence is still incomplete')).toBeVisible();
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
    expect(await within(details).findByText('operations refresh failed')).toBeVisible();
    expect(within(details).queryByText('No active operations queue.')).not.toBeInTheDocument();
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

  it('jumps from audit-signal artifacts to shared memory without changing the selected agent or correlation', async () => {
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

    await user.click(
      within(artifactLine).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/evidence.md'
      })
    );

    expect(document.activeElement).toBe(artifactRecord);
    expect(within(details).getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    expect(within(correlationSection!).getByText('corr-app-review')).toBeVisible();
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
      within(evidenceLine).queryByRole('button', {
        name: 'Jump to accountability evidence ref /tmp/reboot-note.md'
      })
    ).not.toBeInTheDocument();
    expect(
      within(evidenceLine).queryByRole('button', {
        name: 'Jump to accountability evidence ref /tmp/peer-watch.md'
      })
    ).not.toBeInTheDocument();

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
    expect(interactionRecord).toHaveTextContent('Participants · app-engineering, team-lead');
    expect(interactionRecord).toHaveTextContent('Evidence · /tmp/evidence.md, /tmp/missing.md');
    expect(
      within(interactionRecord!).queryByRole('button', {
        name: 'Select correlation interaction participant agent team-lead'
      })
    ).not.toBeInTheDocument();
    expect(
      within(interactionRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/evidence.md'
      })
    ).toBeVisible();
    expect(
      within(interactionRecord!).queryByRole('button', {
        name: 'Jump to shared memory artifact /tmp/missing.md'
      })
    ).not.toBeInTheDocument();

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
      within(eventRecord!).queryByRole('button', {
        name: 'Select correlation timeline counterparty agent team-lead'
      })
    ).not.toBeInTheDocument();
    expect(
      within(eventRecord!).getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/evidence.md'
      })
    ).toBeVisible();
    expect(
      within(eventRecord!).queryByRole('button', {
        name: 'Jump to shared memory artifact /tmp/missing.md'
      })
    ).not.toBeInTheDocument();

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
    ).not.toBeInTheDocument();

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
    ).not.toBeInTheDocument();
    expect(
      within(rebootRecord!).queryByRole('button', {
        name: 'Jump to shared memory artifact /tmp/missing.md'
      })
    ).not.toBeInTheDocument();

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

  it('does not fall back to crew-overview correlations while a selected-agent workflow is still loading', async () => {
    let correlationRequests = 0;

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

  it('falls back to a workflow status record correlation when no correlation is selected and keeps current or unknown counterparties as plain text', async () => {
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
      expect(within(correlationSection!).getByText('No correlation selected.')).toBeVisible();
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
      expect(within(correlationSection!).getByText('corr-app-secondary')).toBeVisible();
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
    expect(await within(details).findByText('blocked · Workflow evidence is still incomplete')).toBeVisible();

    expect(await within(details).findByText('operations refresh failed')).toBeVisible();
    expect(within(details).getByText('blocked · Workflow evidence is still incomplete')).toBeVisible();
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

    const details = await openHub(user);
    expect(await within(details).findByText('incident refresh failed')).toBeVisible();
    expect(within(details).queryByText('No active incident feed.')).not.toBeInTheDocument();
  });

  it('keeps the selected details visible when overview briefly drops the selected agent', () => {
    const selected = resolveSelectedAgent('app-engineering', undefined, overviewFixture.agents[1] as OfficeAgent);

    expect(selected).toMatchObject({
      agent_id: 'app-engineering',
      display_name: 'App Engineering Agent'
    });
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

  it('keeps the last overview snapshot visible when a later overview poll fails', async () => {
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
    expect(screen.getByText(/Snapshot 2026-03-16T09:00:00.000Z/)).toBeVisible();

    expect(await screen.findByText('Showing last office snapshot.')).toBeVisible();
    expect(screen.getByText('overview refresh failed')).toBeVisible();
    expect(screen.getByText(/Snapshot 2026-03-16T09:00:00.000Z/)).toBeVisible();
    expect(screen.queryByText('Unable to load office overview.')).not.toBeInTheDocument();
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

  it('keeps selected-agent workflow details pinned when a workflow 404 arrives before overview drops the agent', async () => {
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

    expect(await within(details).findByText('unknown agent app-engineering')).toBeVisible();
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
    expect(within(workflowInteractionRecord!).getByText('Participants · app-engineering, team-lead')).toBeVisible();
    expect(within(workflowInteractionRecord!).getByText('Correlation · corr-app-review')).toBeVisible();
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
      within(collectorEvidenceLine).queryByRole('button', {
        name: 'Jump to collector evidence ref /tmp/controller-log.md'
      })
    ).not.toBeInTheDocument();

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
