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
  current_map_id?: string;
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

export type CollectorSourceHealthStatus = 'observed' | 'degraded' | 'missing' | 'error';

export interface CollectorWorkspaceRootSourceHealth {
  status: CollectorSourceHealthStatus;
  path: string;
  last_observed_at: string | null;
  degraded_reasons: string[];
}

export interface CollectorWorkspaceFilesSourceHealth {
  status: CollectorSourceHealthStatus;
  expected_files: string[];
  observed_count: number;
  missing_count: number;
  error_count: number;
  last_observed_at: string | null;
  degraded_reasons: string[];
}

export interface CollectorTmuxSessionSourceHealth {
  status: CollectorSourceHealthStatus;
  expected_session_ref: string;
  observed_count: number;
  last_observed_at: string | null;
  degraded_reasons: string[];
}

export interface CollectorHermesProfileSourceHealth {
  status: CollectorSourceHealthStatus;
  profile_id: string;
  evidence_ref: string | null;
  last_observed_at: string | null;
  degraded_reasons: string[];
}

export interface CollectorHermesSessionSourceHealth {
  status: CollectorSourceHealthStatus;
  expected_session_ref: string;
  evidence_ref: string | null;
  last_observed_at: string | null;
  degraded_reasons: string[];
}

export interface CollectorSourceHealth {
  workspace_root?: CollectorWorkspaceRootSourceHealth;
  workspace_files?: CollectorWorkspaceFilesSourceHealth;
  tmux_session?: CollectorTmuxSessionSourceHealth;
  hermes_profile?: CollectorHermesProfileSourceHealth;
  hermes_session?: CollectorHermesSessionSourceHealth;
}

export interface CollectorUnmappedTmuxSession {
  session_name: string;
  observed_count: number;
  last_observed_at: string | null;
  pane_refs: string[];
}

export interface CollectorUnmappedHermesSource {
  source_kind: 'hermes_profile' | 'hermes_session';
  evidence_ref: string;
  profile_id: string | null;
  session_ref: string | null;
  observed_at: string | null;
  status: CollectorSourceHealthStatus;
  degraded_reasons: string[];
}

export interface CollectorRuntimeSourceEvidence {
  unmapped_tmux_sessions?: CollectorUnmappedTmuxSession[];
  unmapped_hermes_sources?: CollectorUnmappedHermesSource[];
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
  source_health?: CollectorSourceHealth;
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

export interface CollectorSharedArtifact {
  artifact_ref: string;
  artifact_kind: 'workspace_file' | 'tmux_observation';
  file_name?: string | null;
  agent_ids: string[];
  agent_count: number;
  mention_count: number;
  last_seen_at: string | null;
  source_kinds: Array<'workspace_file' | 'tmux_observation'>;
}

export type CollectorEvidenceCoverageLegacySourceKind =
  | 'workspace_file'
  | 'workspace_root'
  | 'tmux_observation';

export type CollectorHermesRuntimeSourceKind = 'hermes_profile' | 'hermes_session';

export type CollectorEvidenceCoverageSourceKind =
  | CollectorEvidenceCoverageLegacySourceKind
  | CollectorHermesRuntimeSourceKind;

export interface CollectorEvidenceCoverageAgentItem {
  agent_id: string;
  evidence_ref_count: number;
  source_kinds: CollectorEvidenceCoverageSourceKind[];
  latest_evidence_at: string | null;
  confidence_level: CollectorHeartbeat['confidence_level'] | null;
}

export interface CollectorEvidenceCoverage {
  collected_at?: string | null;
  collector_snapshot_id?: string | null;
  actor_id?: string | null;
  evidence_ref_count: number;
  covered_agent_count: number;
  low_confidence_agent_ids: string[];
  source_kind_buckets: Record<CollectorEvidenceCoverageLegacySourceKind, number> &
    Partial<Record<CollectorHermesRuntimeSourceKind, number>>;
  agent_items: CollectorEvidenceCoverageAgentItem[];
}

export type CollectorSourceHealthKind =
  | 'workspace_root'
  | 'workspace_files'
  | 'tmux_session'
  | 'hermes_profile'
  | 'hermes_session';

export interface CollectorSourceHealthProjectionAgentItem {
  agent_id: string;
  workspace_root: string | null;
  session_ref: string | null;
  source_health: CollectorSourceHealth;
  evidence_ref_count: number;
  evidence_refs: string[];
  latest_evidence_at: string | null;
}

export interface CollectorSourceHealthProjection {
  collected_at?: string | null;
  collector_snapshot_id: string;
  actor_id?: string | null;
  summary: {
    agent_count: number;
    source_kind_buckets: Record<CollectorSourceHealthKind, Record<CollectorSourceHealthStatus, number>>;
    status_buckets: Record<CollectorSourceHealthStatus, number>;
  };
  agent_items: CollectorSourceHealthProjectionAgentItem[];
  runtime_source_evidence?: CollectorRuntimeSourceEvidence;
}

export interface CollectorSnapshotHistoryItem {
  collector_snapshot_id: string;
  collected_at: string | null;
  actor_id: string | null;
  agent_count: number;
  heartbeat_count: number;
  tmux_observed_count: number;
  workspace_observed_count: number;
  reboot_recommended_count: number;
  matched_agent_count: number;
  source_kind_buckets: Record<CollectorSourceHealthKind, number>;
  status_buckets: Record<CollectorSourceHealthStatus, number>;
}

export interface CollectorSnapshotHistory {
  total_count: number;
  returned_limit: number;
  source_kind_buckets: Record<CollectorSourceHealthKind, number>;
  status_buckets: Record<CollectorSourceHealthStatus, number>;
  items: CollectorSnapshotHistoryItem[];
}

export type CollectorSnapshotDiffAgentChangeType = 'added' | 'removed' | 'changed';

export interface CollectorSnapshotDiffAgentChange {
  agent_id: string;
  change_type: CollectorSnapshotDiffAgentChangeType;
  heartbeat_changed: boolean;
  source_health_status_changes: Partial<
    Record<
      CollectorSourceHealthKind,
      {
        from: CollectorSourceHealthStatus | null;
        to: CollectorSourceHealthStatus | null;
      }
    >
  >;
}

export interface CollectorSnapshotDiff {
  from_collector_snapshot_id: string;
  to_collector_snapshot_id: string;
  from_collected_at: string | null;
  to_collected_at: string | null;
  summary_delta: CollectorSnapshotSummary;
  source_health_delta: {
    source_kind_buckets: Record<CollectorSourceHealthKind, number>;
    status_buckets: Record<CollectorSourceHealthStatus, number>;
  };
  agent_change_count: number;
  returned_limit: number;
  agent_changes: CollectorSnapshotDiffAgentChange[];
}

export interface EvidenceRecord {
  evidence_id: string;
  observed_at: string | null;
  collected_at: string | null;
  agent_id: string | null;
  source_kind: string;
  evidence_ref: string;
  evidence_role: string | null;
  source_status: string | null;
  output_candidate: boolean;
  collector_snapshot_id: string;
  correlation_id: string | null;
  degraded_reasons: string[];
  metadata: Record<string, unknown>;
}

export interface EvidenceRecordsResponse {
  items: EvidenceRecord[];
}

export interface EvidenceRefRollupGroup {
  evidence_ref: null;
  evidence_ref_key: string;
  evidence_ref_label: string;
  record_count: number;
  mapped_count: number;
  unmapped_count: number;
  agent_id_buckets: Record<string, number>;
  source_kind_buckets: Record<string, number>;
  source_status_buckets: Record<string, number>;
}

export interface EvidenceRefRollup {
  total_count: number;
  total_groups: number;
  returned_limit: number;
  groups: EvidenceRefRollupGroup[];
}

export interface EvidenceRefRollupResponse {
  item: EvidenceRefRollup;
}

export interface EvidenceProvenanceRecord {
  observed_at: string | null;
  collected_at: string | null;
  agent_id: string | null;
  source_kind: string | null;
  evidence_role: string | null;
  source_status: string | null;
  output_candidate: boolean;
  collector_snapshot_id: string;
  correlation_id: string | null;
  unmapped: boolean;
}

export interface EvidenceProvenanceSourceSummary {
  kind: string | null;
  status: string | null;
  role: string | null;
  output_candidate: boolean;
  mapped: boolean;
  time: {
    observed_at: string | null;
    collected_at: string | null;
  };
}

export interface EvidenceProvenanceSnapshotAnchor {
  collector_snapshot_id: string;
  route: string;
}

export interface EvidenceProvenanceSourceAnchor {
  evidence_id: string;
  source_kind: string;
  evidence_role: string | null;
  source_status: string | null;
  route: string;
}

export interface EvidenceProvenanceReplayAnchor {
  evidence_id?: string;
  correlation_id?: string | null;
  route: string;
}

export interface EvidenceProvenanceBundle {
  evidence_id: string;
  source_summary: EvidenceProvenanceSourceSummary;
  record: EvidenceProvenanceRecord;
  anchors: {
    snapshot: EvidenceProvenanceSnapshotAnchor | null;
    source: EvidenceProvenanceSourceAnchor | null;
    replay: EvidenceProvenanceReplayAnchor | null;
  };
}

export type EvidenceSourceContextRecord = Omit<
  EvidenceProvenanceRecord,
  'collector_snapshot_id' | 'correlation_id'
>;

export interface EvidenceSourceContextWorkspaceRootHealth {
  status: CollectorSourceHealthStatus;
  last_observed_at: string | null;
}

export interface EvidenceSourceContextWorkspaceFilesHealth {
  status: CollectorSourceHealthStatus;
  observed_count: number;
  missing_count: number;
  error_count: number;
  last_observed_at: string | null;
}

export interface EvidenceSourceContextSessionHealth {
  status: CollectorSourceHealthStatus;
  observed_count: number;
  last_observed_at: string | null;
}

export interface EvidenceSourceContextHermesHealth {
  status: CollectorSourceHealthStatus;
  last_observed_at: string | null;
}

export interface EvidenceSourceContextSourceHealth {
  workspace_root?: EvidenceSourceContextWorkspaceRootHealth;
  workspace_files?: EvidenceSourceContextWorkspaceFilesHealth;
  tmux_session?: EvidenceSourceContextSessionHealth;
  hermes_profile?: EvidenceSourceContextHermesHealth;
  hermes_session?: EvidenceSourceContextHermesHealth;
}

export interface EvidenceSourceContextHealthAgentItem {
  agent_id: string;
  source_health: EvidenceSourceContextSourceHealth;
  evidence_count: number;
  latest_evidence_at: string | null;
}

export interface EvidenceSourceContextHealth {
  collected_at: string | null;
  summary: CollectorSourceHealthProjection['summary'];
  agent_items: EvidenceSourceContextHealthAgentItem[];
}

export type EvidenceSourceContextGapItem = Omit<
  RuntimeSourceGap,
  'collector_snapshot_id' | 'correlation_id' | 'degraded_reasons'
>;

export type EvidenceSourceContextGapsSummary = Omit<
  RuntimeSourceGapsSummary,
  'collector_snapshot_id_buckets'
>;

export interface EvidenceSourceContext {
  evidence_id: string;
  source_summary: EvidenceProvenanceSourceSummary;
  record: EvidenceSourceContextRecord;
  source_health: EvidenceSourceContextHealth;
  source_gaps: {
    summary: EvidenceSourceContextGapsSummary;
    items: EvidenceSourceContextGapItem[];
  };
}

export interface RuntimeSourceGap {
  observed_at: string | null;
  collected_at: string | null;
  agent_id: string | null;
  source_kind: string;
  evidence_role: string | null;
  source_status: 'observed' | 'missing' | 'degraded' | 'error';
  output_candidate: boolean;
  collector_snapshot_id: string;
  correlation_id: string | null;
  degraded_reasons: string[];
  unmapped: boolean;
}

export interface RuntimeSourceGapsResponse {
  items: RuntimeSourceGap[];
}

export interface RuntimeSourceGapsSummary {
  total_count: number;
  returned_limit: number;
  mapped_count: number;
  unmapped_count: number;
  output_candidate_buckets: Record<'true' | 'false', number>;
  source_kind_buckets: Record<string, number>;
  evidence_role_buckets: Record<string, number>;
  source_status_buckets: Record<string, number>;
  collector_snapshot_id_buckets: Record<string, number>;
  first_observed_at: string | null;
  last_observed_at: string | null;
  first_collected_at: string | null;
  last_collected_at: string | null;
}

export interface RuntimeSourceGapsSummaryResponse {
  item: RuntimeSourceGapsSummary;
}

export interface RuntimeSourceGapAgentSummaryGroup {
  agent_id: string | null;
  source_kind: string | null;
  record_count: number;
  mapped_count: number;
  unmapped_count: number;
  output_candidate_buckets: Record<string, number>;
  evidence_role_buckets: Record<string, number>;
  source_status_buckets: Record<string, number>;
  first_observed_at: string | null;
  last_observed_at: string | null;
  first_collected_at: string | null;
  last_collected_at: string | null;
}

export interface RuntimeSourceGapAgentSummary {
  total_count: number;
  total_groups: number;
  returned_limit: number;
  groups: RuntimeSourceGapAgentSummaryGroup[];
}

export interface RuntimeSourceGapAgentSummaryResponse {
  item: RuntimeSourceGapAgentSummary;
}

export interface RuntimeSourceGapTrendBucket {
  bucket_start: string;
  total_count: number;
  mapped_count: number;
  unmapped_count: number;
  output_candidate_buckets: Record<string, number>;
  source_kind_buckets: Record<string, number>;
  evidence_role_buckets: Record<string, number>;
  source_status_buckets: Record<string, number>;
}

export interface RuntimeSourceGapTrend {
  bucket: 'hour' | 'day';
  total_count: number;
  total_buckets: number;
  returned_limit: number;
  buckets: RuntimeSourceGapTrendBucket[];
}

export interface RuntimeSourceGapTrendResponse {
  item: RuntimeSourceGapTrend;
}

export type RuntimeSourceGapLifecycleState =
  | 'opened'
  | 'continuing'
  | 'resolved'
  | 'observed_unmapped';

export interface RuntimeSourceGapLifecycleGroup {
  agent_id: string | null;
  source_kind: string | null;
  evidence_role: string | null;
  current_status: RuntimeSourceGap['source_status'] | null;
  lifecycle_state: RuntimeSourceGapLifecycleState;
  first_observed_at: string | null;
  last_observed_at: string | null;
  first_collected_at: string | null;
  last_collected_at: string | null;
  snapshot_count: number;
  source_status_buckets: Record<string, number>;
}

export interface RuntimeSourceGapLifecycle {
  total_count: number;
  total_groups: number;
  returned_limit: number;
  groups: RuntimeSourceGapLifecycleGroup[];
}

export interface RuntimeSourceGapLifecycleResponse {
  item: RuntimeSourceGapLifecycle;
}

export type StorageIndexHealthBackend = 'jsonl' | 'sqlite';

export type StorageIndexHealthStatus = 'ok' | 'degraded';

export type StorageIndexHealthSidecarStatus = 'complete' | 'stale' | 'not_applicable';

export interface StorageIndexHealth {
  backend: StorageIndexHealthBackend;
  status: StorageIndexHealthStatus;
  record_count: number;
  record_index_count: number | null;
  record_evidence_ref_count: number | null;
  sidecar_status: StorageIndexHealthSidecarStatus;
  record_kind_buckets: Record<string, number>;
  latest_record_ts: string | null;
}

export interface StorageIndexHealthResponse {
  item: StorageIndexHealth;
}

export interface AgentEvidenceSpineRecord {
  observed_at: string | null;
  collected_at: string | null;
  source_kind: string | null;
  evidence_role: string | null;
  source_status: string | null;
  output_candidate: boolean;
  collector_snapshot_id: string | null;
  correlation_id: string | null;
  unmapped: boolean;
}

export interface AgentEvidenceSpineSourceGap {
  observed_at: string | null;
  collected_at: string | null;
  agent_id: string | null;
  source_kind: string;
  evidence_role: string | null;
  source_status: RuntimeSourceGap['source_status'];
  output_candidate: boolean;
  collector_snapshot_id: string;
  correlation_id: string | null;
  unmapped: boolean;
}

export interface AgentEvidenceSpineSourceHealthEntry {
  status: CollectorSourceHealthStatus | null;
  last_observed_at: string | null;
  observed_count?: number;
}

export interface AgentEvidenceSpineSourceHealthAgentItem {
  agent_id: string;
  collector_snapshot_id: string;
  source_health: Partial<
    Record<CollectorSourceHealthKind, AgentEvidenceSpineSourceHealthEntry>
  >;
  evidence_count: number;
  latest_evidence_at: string | null;
}

export interface AgentEvidenceSpineSourceHealth {
  collected_at: string | null;
  collector_snapshot_id: string | null;
  actor_id: string | null;
  summary: CollectorSourceHealthProjection['summary'];
  agent_items: AgentEvidenceSpineSourceHealthAgentItem[];
}

export interface AgentEvidenceSpineSummaryAgent {
  agent_id: string;
  evidence_count: number;
  output_candidate_buckets: Record<'true' | 'false', number>;
  source_kind_buckets: Record<string, number>;
  evidence_role_buckets: Record<string, number>;
  source_status_buckets: Record<string, number>;
  source_gap_buckets: Record<string, number>;
  latest_observed_at: string | null;
  latest_collected_at: string | null;
}

export interface AgentEvidenceSpineUnmappedSummary {
  total_count: number;
  source_kind_buckets: Record<string, number>;
  evidence_role_buckets: Record<string, number>;
  source_status_buckets: Record<string, number>;
  latest_observed_at: string | null;
  latest_collected_at: string | null;
}

export interface AgentEvidenceSourceMatrixRow {
  source_kind: string;
  evidence_count: number;
  source_status_buckets: Record<string, number>;
  evidence_role_buckets: Record<string, number>;
  output_candidate_buckets: Record<'true' | 'false', number>;
  latest_observed_at: string | null;
  latest_collected_at: string | null;
}

export interface AgentEvidenceSourceMatrixAgent {
  agent_id: string;
  sources: AgentEvidenceSourceMatrixRow[];
}

export interface AgentEvidenceSourceMatrixUnmappedSummary {
  total_count: number;
  sources: AgentEvidenceSourceMatrixRow[];
}

export interface AgentEvidenceSourceMatrix {
  agent_count: number;
  returned_limit: number;
  total_count: number;
  mapped_count: number;
  unmapped_count: number;
  agents: AgentEvidenceSourceMatrixAgent[];
  unmapped_evidence_summary: AgentEvidenceSourceMatrixUnmappedSummary;
}

export interface AgentEvidenceSpineSummary {
  agent_count: number;
  returned_limit: number;
  total_count: number;
  mapped_count: number;
  unmapped_count: number;
  agents: AgentEvidenceSpineSummaryAgent[];
  unmapped_evidence_summary: AgentEvidenceSpineUnmappedSummary;
}

export interface AgentEvidenceSpine {
  agent_id: string;
  returned_limit: number;
  evidence_summary: RuntimeSourceGapsSummary;
  recent_evidence: AgentEvidenceSpineRecord[];
  source_gaps: {
    summary: RuntimeSourceGapsSummary;
    items: AgentEvidenceSpineSourceGap[];
  };
  source_health: AgentEvidenceSpineSourceHealth;
}

export interface AgentEvidenceSpineSummaryResponse {
  item: AgentEvidenceSpineSummary;
}

export interface AgentEvidenceSourceMatrixResponse {
  item: AgentEvidenceSourceMatrix;
}

export interface AgentEvidenceSpineResponse {
  item: AgentEvidenceSpine;
}

export interface CollectorSnapshot {
  collected_at: string;
  actor_id: string;
  summary: CollectorSnapshotSummary;
  evidence_coverage?: CollectorEvidenceCoverage;
  shared_artifacts?: CollectorSharedArtifact[];
  runtime_source_evidence?: CollectorRuntimeSourceEvidence;
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
  actor_id: string;
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
    actor_id?: string;
    received_at?: string;
    confidence_level?: string;
  } | null;
  open_peer_watch_alerts: WorkflowPeerWatchAlert[];
  recent_events: WorkflowDetailEvent[];
  recent_interactions: WorkflowInteraction[];
  recent_incidents: WorkflowIncident[];
  recent_handoffs: WorkflowDetailHandoff[];
  recent_reboots: WorkflowDetailReboot[];
}

export type AgentDetail = WorkflowDetail;

export interface AgentDetailResponse {
  item: AgentDetail;
}

export interface WorkflowPeerWatchAlert {
  alert_id: string;
  ts: string;
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
  agent_role: string;
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
  correlation_latest_activity_at?: string | null;
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
  source_kind?: string | null;
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

export interface AccountabilityReplayQuery {
  event_id?: string;
  evidence_id?: string;
  evidence_ref?: string;
  correlation_id?: string;
  agent_id?: string;
  source_kind?: string;
  artifact_kind?: string;
  limit: number;
  window: string;
}

export interface AccountabilityReplaySummary {
  basis: 'event_log_and_existing_read_models';
  bounded_by: {
    limit: number;
    window: string;
  };
  event_count: number;
  interaction_count: number;
  artifact_count: number;
  participant_agent_ids: string[];
  actor_ids: string[];
  evidence_refs: string[];
  source_kind_buckets: Record<string, number>;
  first_ts: string | null;
  last_ts: string | null;
}

export interface AccountabilityReplayLedgerEntry {
  entry_type: 'event' | 'interaction' | 'memory_artifact';
  entry_id: string;
  ts: string;
  basis_event_ids: string[];
  agent_id?: string;
  actor_id?: string | null;
  source_kind?: string | null;
  source_kinds?: string[];
  evidence_refs: string[];
  correlation_id?: string | null;
  correlation_ids?: string[];
  summary?: string | null;
  provenance?: 'event_backed_artifact' | 'collector_observation_without_event_id';
}

export interface AccountabilityReplayBundle {
  generated_at: string;
  query: AccountabilityReplayQuery;
  accountability: AccountabilityReplaySummary;
  ledger: AccountabilityReplayLedgerEntry[];
  events: WorkflowTimelineEvent[];
  interactions: WorkflowInteraction[];
  memory_artifacts: MemoryArtifact[];
}

export interface ReplayCheckpointEvent {
  event_id: string;
  ts: string;
  agent_id: string;
  event_type: string;
  correlation_id: string | null;
  source_kind: string | null;
}

export interface ReplayCheckpointHeartbeat {
  agent_id: string;
  received_at: string;
}

export interface ReplayCheckpointEvidenceRecord {
  observed_at: string | null;
  collected_at: string | null;
  agent_id: string | null;
  source_kind: string | null;
  evidence_role: string | null;
  source_status: string | null;
  output_candidate: boolean;
  collector_snapshot_id: string;
  correlation_id: string | null;
  unmapped: boolean;
}

export interface ReplayCheckpointCollectorSnapshot {
  collector_snapshot_id: string;
  collected_at: string | null;
  actor_id: string | null;
  item_count: number;
}

export type ReplayCheckpoint =
  | ReplayCheckpointEvent
  | ReplayCheckpointHeartbeat
  | ReplayCheckpointEvidenceRecord
  | ReplayCheckpointCollectorSnapshot;

export interface ReplayCheckpointLogItem {
  append_index: number;
  record_kind: string;
  checkpoint: ReplayCheckpoint | null;
}

export interface ReplayCheckpointLogResponse {
  items: ReplayCheckpointLogItem[];
}

export interface WorkflowSummary {
  incident_count: number;
  interaction_count: number;
  event_count: number;
  incident_kind_buckets: Record<string, number>;
  interaction_type_buckets: Record<string, number>;
  event_type_buckets: Record<string, number>;
  severity_buckets: Record<Severity, number>;
  latest_activity_at: string | null;
}

export interface AgentWorkflow {
  agent_id: string;
  detail: WorkflowDetail;
  summary: WorkflowSummary;
  correlation_ids: string[];
  counterparty_agent_ids: string[];
  incidents: WorkflowIncident[];
  interactions: WorkflowInteraction[];
  timeline: WorkflowTimelineEvent[];
}

export interface IncidentFeedResponse {
  items: WorkflowIncident[];
}

export type AgentEvent = WorkflowDetailEvent;

export interface AgentEventsResponse {
  agent_id: string;
  items: AgentEvent[];
}

export interface AgentInteractionsResponse {
  agent_id: string;
  items: WorkflowInteraction[];
}

export type PeerWatchAlert = WorkflowPeerWatchAlert;

export interface PeerWatchAlertsResponse {
  items: PeerWatchAlert[];
}

export interface CorrelationClosureLedgerEntry {
  entry_id: string;
  state: 'open' | 'active' | 'closed';
  kind: string;
  status: string;
  ts: string;
  agent_id: string;
  actor_id: string | null;
  summary: string;
  correlation_id: string;
  evidence_refs: string[];
  source_kind: string;
  incident_id?: string;
  interaction_id?: string;
  related_event_ids?: string[];
}

export interface CorrelationClosureLedger {
  state: 'open' | 'active' | 'closed' | 'unknown';
  basis: 'filtered_correlation_slice';
  open_count: number;
  active_count: number;
  closed_count: number;
  entry_count: number;
  last_transition_ts: string | null;
  entries: CorrelationClosureLedgerEntry[];
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
  closure_ledger?: CorrelationClosureLedger;
  incidents: WorkflowIncident[];
  interactions: WorkflowInteraction[];
  timeline: WorkflowTimelineEvent[];
}

export interface MemoryArtifactReplayCheckpoint {
  event_id: string;
  event_type: string | null;
  summary: string | null;
  last_seen_at: string;
}

export interface MemoryArtifact {
  artifact_ref: string;
  artifact_kind: 'workspace_file' | 'tmux_observation' | 'evidence_ref';
  file_name: string;
  first_seen_at: string;
  last_seen_at: string;
  mention_count: number;
  agent_ids: string[];
  correlation_ids: string[];
  source_kinds: string[];
  latest_summary: string | null;
  latest_event_type: string | null;
  latest_event_id?: string | null;
  replay_checkpoint?: MemoryArtifactReplayCheckpoint | null;
  collector_last_modified_at: string | null;
}

export interface MemoryArtifactIndex {
  generated_at: string;
  items: MemoryArtifact[];
}
