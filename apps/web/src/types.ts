export type Severity = 'normal' | 'yellow' | 'orange' | 'red';

export interface ProblemResponse {
  error: string;
  details?: string;
}

export interface OverviewSummary {
  agent_count: number;
  blocked_count: number;
  reboot_recommended_count: number;
  severity_buckets: Record<Severity, number>;
}

export interface ZoneOccupant {
  agent_id: string;
  display_name: string;
  kind: 'lead' | 'employee';
  current_state: string;
  active_task: string;
  effective_severity: Severity;
}

export interface OfficeZone {
  zone_id: string;
  label: string;
  kind: 'desk' | 'shared';
  grid_x: number;
  grid_y: number;
  grid_w: number;
  grid_h: number;
  home_agent_id: string | null;
  occupants: ZoneOccupant[];
}

export interface WatchEdge {
  from_agent_id: string;
  to_agent_id: string;
  watch_mode: 'lead' | 'peer';
}

export interface DerivedStaleness {
  severity: Severity;
  stale_for_ms?: number;
  stale_for_minutes?: number;
  last_meaningful_output_at?: string | null;
}

export interface OfficeAgent {
  agent_id: string;
  display_name: string;
  kind: 'lead' | 'employee';
  current_state: string;
  active_task: string;
  current_location: string;
  effective_severity: Severity;
  reported_severity: Severity;
  severity: Severity;
  derived_staleness: DerivedStaleness;
  reboot_recommended: boolean;
}

export interface OfficeOverview {
  generated_at: string;
  summary: OverviewSummary;
  zones: OfficeZone[];
  watch_edges: WatchEdge[];
  agents: OfficeAgent[];
}

export interface CollectorWorkspaceObservation {
  path: string;
  file_name: string;
  kind: 'workspace_file' | 'workspace_root';
  last_modified_at: string;
}

export interface CollectorTmuxObservation {
  session_name: string | null;
  window_index: string;
  pane_index: string;
  pane_id: string | null;
  pane_title: string | null;
  pane_current_command: string | null;
  pane_active: boolean;
  pane_dead: boolean;
  pane_activity_at: string | null;
}

export interface CollectorSupervision {
  watch_target: string | null;
  watched_by: string[];
  needs_attention: boolean;
}

export interface CollectorHeartbeat {
  agent_id: string;
  actor_id: string;
  received_at: string;
  current_state: string;
  active_task: string;
  current_location?: string;
  last_meaningful_output_at: string | null;
  last_file_write_at: string | null;
  current_blocker: string;
  confidence_level: 'low' | 'medium' | 'high';
  reboot_recommended: boolean;
  evidence_refs?: string[];
}

export interface CollectorItem {
  agent_id: string;
  workspace_root: string;
  session_ref: string;
  evidence_refs: string[];
  workspace_observations: CollectorWorkspaceObservation[];
  tmux_observations: CollectorTmuxObservation[];
  supervision: CollectorSupervision;
  heartbeat: CollectorHeartbeat;
}

export interface CollectorSnapshotSummary {
  agent_count: number;
  heartbeat_count: number;
  tmux_observed_count: number;
  workspace_observed_count: number;
  reboot_recommended_count: number;
}

export interface CollectorSnapshot {
  collected_at: string;
  actor_id: string;
  summary: CollectorSnapshotSummary;
  items: CollectorItem[];
}

export interface OperationsSummary {
  item_count: number;
  blocked_count: number;
  reboot_recommended_count: number;
  state_buckets: Record<string, number>;
  severity_buckets: Record<Severity, number>;
}

export interface OfficeOperationLatestEvent {
  event_id: string;
  event_type: string;
  ts: string;
  summary: string;
  source_kind: string;
  evidence_refs: string[];
  counterparty_agent_ids: string[];
}

export interface OfficeOperation {
  agent_id: string;
  display_name: string;
  kind: 'lead' | 'employee';
  current_state: string;
  active_task: string;
  current_blocker: string;
  current_location: string;
  reported_severity: Severity;
  effective_severity: Severity;
  derived_staleness: DerivedStaleness;
  reboot_recommended: boolean;
  last_event_at: string | null;
  last_heartbeat_at: string | null;
  last_meaningful_output_at: string | null;
  correlation_id: string | null;
  latest_event: OfficeOperationLatestEvent | null;
}

export interface OfficeOperations {
  generated_at: string;
  summary: OperationsSummary;
  items: OfficeOperation[];
}

export interface WorkflowDetail {
  agent_id: string;
  display_name?: string;
  current_state: string;
  active_task: string;
  current_location: string;
  latest_heartbeat: {
    agent_id: string;
    received_at?: string;
  } | null;
  open_peer_watch_alerts: WorkflowPeerWatchAlert[];
  recent_events: WorkflowDetailEvent[];
  recent_interactions: WorkflowInteraction[];
  recent_incidents: WorkflowIncident[];
  recent_handoffs: WorkflowDetailHandoff[];
  recent_reboots: WorkflowDetailReboot[];
}

export interface WorkflowPeerWatchAlert {
  alert_id: string;
  agent_id: string;
  target_agent_id: string;
  actor_id: string;
  observer_agent_id: string;
  watcher_agent_ids: string[];
  severity: Severity;
  status: string;
  current_state: string;
  active_task: string;
  summary: string;
  evidence_refs: string[];
  evidence_count: number;
  correlation_id: string | null;
  source_kind: string;
  metadata: Record<string, unknown>;
}

export interface WorkflowDetailEvent {
  event_id: string;
  ts: string;
  agent_id: string;
  actor_id: string;
  event_type: string;
  severity: Severity;
  current_state: string;
  active_task: string;
  location: string;
  summary: string;
  correlation_id: string | null;
  counterparty_agent_ids: string[];
  evidence_refs: string[];
  source_kind: string;
  metadata: Record<string, unknown>;
}

export interface WorkflowDetailHandoff {
  handoff_id: string;
  ts: string;
  agent_id: string;
  actor_id: string;
  phase: string;
  status: string;
  severity: Severity;
  summary: string;
  counterparty_agent_ids: string[];
  evidence_refs: string[];
  correlation_id: string | null;
  source_kind: string;
}

export interface WorkflowDetailReboot {
  reboot_id: string;
  ts: string;
  agent_id: string;
  actor_id: string;
  phase: string;
  status: string;
  severity: Severity;
  summary: string;
  counterparty_agent_ids: string[];
  evidence_refs: string[];
  correlation_id: string | null;
  source_kind: string;
}

export interface WorkflowIncident {
  incident_id: string;
  kind: string;
  ts: string;
  agent_id: string;
  actor_id: string;
  status: string;
  severity: Severity;
  summary: string;
  correlation_id: string | null;
  evidence_refs: string[];
  counterparty_agent_ids: string[];
  source_kind: string;
}

export interface WorkflowInteraction {
  interaction_id: string;
  interaction_type: string;
  correlation_id: string | null;
  started_at: string;
  ended_at?: string | null;
  participant_agent_ids: string[];
  trigger_event_id: string;
  before_state?: string | null;
  after_state?: string | null;
  severity?: Severity;
  evidence_refs: string[];
  summary: string;
  related_event_ids?: string[];
}

export interface WorkflowTimelineEvent {
  event_id: string;
  ts: string;
  agent_id: string;
  actor_id: string;
  event_type: string;
  severity: Severity;
  current_state: string;
  location: string;
  summary: string;
  correlation_id: string | null;
  counterparty_agent_ids: string[];
  evidence_refs: string[];
  source_kind: string;
}

export interface TimelineReplayResponse {
  items: WorkflowTimelineEvent[];
}

export interface AgentWorkflow {
  agent_id: string;
  detail: WorkflowDetail;
  correlation_ids: string[];
  counterparty_agent_ids: string[];
  incidents: WorkflowIncident[];
  interactions: WorkflowInteraction[];
  timeline: WorkflowTimelineEvent[];
}

export interface IncidentFeedResponse {
  items: WorkflowIncident[];
}

export interface CorrelationDrilldown {
  correlation_id: string;
  participant_agent_ids: string[];
  evidence_refs: string[];
  first_ts: string | null;
  last_ts: string | null;
  incident_count: number;
  interaction_count: number;
  event_count: number;
  incidents: WorkflowIncident[];
  interactions: WorkflowInteraction[];
  timeline: WorkflowTimelineEvent[];
}
