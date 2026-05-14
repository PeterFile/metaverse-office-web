import type { Severity } from '../types';

// ── Finite State Set ──
// Derived phase that the world engine assigns to each agent.
// Maps from raw backend states + contextual signals.
export type AgentPhase =
  | 'idle'
  | 'active'
  | 'blocked'
  | 'waiting'
  | 'reviewing'
  | 'handoff_pending'
  | 'handoff_active'
  | 'handoff_done'
  | 'reboot_recommended'
  | 'rebooting'
  | 'recovered'
  | 'sleeping'
  | 'unknown';

// ── Timeline Trail ──
export interface TrailEntry {
  event_id: string;
  ts: string;
  event_type: string;
  severity: Severity;
  location?: string | null;
  summary: string;
}

// ── Staleness Derived ──
export interface StalenessDerived {
  severity: Severity;
  stale_for_ms: number | null;
  stale_for_minutes: number | null;
  last_meaningful_output_at: string | null;
}

// ── Runtime Evidence Transparency ──
export type RuntimeEvidenceSource = 'workflow' | 'incident_feed_backfill' | 'overview_only';

export interface RuntimeEvidence {
  source: RuntimeEvidenceSource;
  degraded_reasons: string[];
  incident_ids: string[];
  source_kinds: string[];
  correlation_ids: string[];
  evidence_refs: string[];
}

// ── World Agent ──
export interface WorldAgent {
  agent_id: string;
  display_name: string;
  kind: 'lead' | 'employee';

  // observed facts — directly from API
  raw_state: string;
  raw_location: string;
  current_map_id?: string;
  active_task: string;
  reboot_recommended: boolean;

  // derived conclusions — produced by projector
  phase: AgentPhase;
  zone: string;
  severity: Severity;
  severity_reason: string;
  staleness: StalenessDerived | null;
  recent_trail: TrailEntry[];
  open_alert_count: number;
  has_open_incidents: boolean;
  runtime_evidence?: RuntimeEvidence;
}

// ── Zone Snapshot ──
export interface ZoneSnapshot {
  zone_id: string;
  label: string;
  kind: 'desk' | 'shared';
  grid_x: number;
  grid_y: number;
  grid_w: number;
  grid_h: number;
  home_agent_id?: string | null;
  occupant_ids: string[];
}

// ── Watch Edge Snapshot ──
export interface WatchEdgeSnapshot {
  from_agent_id: string;
  to_agent_id: string;
  watch_mode: 'lead' | 'peer';
  risk_level: Severity;
}

// ── Incident Snapshot ──
export interface IncidentSnapshot {
  incident_id: string;
  kind: string;
  agent_id: string;
  actor_id: string;
  severity: Severity;
  status: string;
  summary: string;
  ts: string;
  correlation_id: string | null;
  source_kind: string;
  evidence_refs: string[];
  counterparty_agent_ids: string[];
}

// ── World Summary ──
export interface WorldSummary {
  total_agents: number;
  blocked_count: number;
  reboot_count: number;
  severity_buckets: Record<Severity, number>;
  highest_severity: Severity;
}

// ── Data Quality ──
export interface DataQuality {
  overview_available: boolean;
  workflow_agent_ids: string[];
  incident_feed_available: boolean;
  last_overview_at: string | null;
  degraded_reasons: string[];
}

// ── Top-level WorldState ──
export interface WorldState {
  generated_at: string;
  projection_ts: string;
  agents: Map<string, WorldAgent>;
  zones: ZoneSnapshot[];
  watch_edges: WatchEdgeSnapshot[];
  incidents: IncidentSnapshot[];
  summary: WorldSummary;
  data_quality: DataQuality;
}

// ── Signals used by FSM to refine phase beyond raw_state ──
export interface PhaseSignals {
  reboot_recommended: boolean;
  has_open_handoff: boolean;
  has_pending_handoff: boolean;
  has_recent_handoff_done: boolean;
  has_recent_reboot_completed: boolean;
  has_open_incident: boolean;
}

export type { Severity };
