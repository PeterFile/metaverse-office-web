import type {
  AgentWorkflow,
  IncidentFeedResponse,
  OfficeAgent,
  OfficeOverview,
  Severity,
  WorkflowIncident,
} from '../types';

import { deriveAgentPhase, deriveAgentZone } from './state-machine';
import type {
  DataQuality,
  IncidentSnapshot,
  PhaseSignals,
  RuntimeEvidence,
  StalenessDerived,
  TrailEntry,
  WatchEdgeSnapshot,
  WorldAgent,
  WorldState,
  WorldSummary,
  ZoneSnapshot,
} from './types';

const TRAIL_LIMIT = 5;

const SEVERITY_RANK: Record<Severity, number> = {
  normal: 0,
  yellow: 1,
  orange: 2,
  red: 3,
};

const ACTIVE_INCIDENT_STATUSES = new Set(['open', 'started', 'requested', 'waiting']);
const INCIDENT_FEED_RECENT_COMPLETION_WINDOW = '60m';

function parseLookbackWindowMs(window: string): number | null {
  const match = /^(\d+)([smhd])$/.exec(window.trim());
  if (!match) {
    return null;
  }

  const value = Number.parseInt(match[1] ?? '', 10);
  if (!Number.isFinite(value)) {
    return null;
  }

  const unit = match[2];
  const unitMs =
    unit === 's'
      ? 1000
      : unit === 'm'
        ? 60 * 1000
        : unit === 'h'
          ? 60 * 60 * 1000
          : 24 * 60 * 60 * 1000;

  return value * unitMs;
}

const INCIDENT_FEED_RECENT_COMPLETION_WINDOW_MS =
  parseLookbackWindowMs(INCIDENT_FEED_RECENT_COMPLETION_WINDOW) ?? 60 * 60 * 1000;

function isIncidentInsideLookbackWindow(ts: string, now: string, windowMs: number) {
  const incidentTs = Date.parse(ts);
  const nowTs = Date.parse(now);

  if (!Number.isFinite(incidentTs) || !Number.isFinite(nowTs)) {
    return false;
  }

  return nowTs >= incidentTs && nowTs - incidentTs <= windowMs;
}

interface TimestampedStatus {
  status: string;
  ts: string;
  severity: Severity;
}

interface IncidentFeedPhaseSignals {
  has_open_handoff: boolean;
  has_pending_handoff: boolean;
  has_recent_handoff_done: boolean;
  has_recent_reboot_completed: boolean;
}

export interface ProjectorInput {
  overview: OfficeOverview | null;
  workflows: Map<string, AgentWorkflow>;
  incidentFeed: IncidentFeedResponse | null;
  incidentFeedLimit?: number;
  selectedAgentWorkflowPending?: boolean;
  now: string;
}

// ── Main projector ──

export function projectWorldState(input: ProjectorInput): WorldState {
  const { overview, workflows, incidentFeed, incidentFeedLimit, selectedAgentWorkflowPending = false, now } = input;
  const projectionTs = now;
  const incidentFeedBackfillAvailable = isIncidentFeedBackfillAvailable(incidentFeed, incidentFeedLimit);

  if (!overview) {
    return emptyWorldState(projectionTs, workflows, incidentFeed, incidentFeedLimit);
  }

  const agents = new Map<string, WorldAgent>();
  const severityBuckets: Record<Severity, number> = { normal: 0, yellow: 0, orange: 0, red: 0 };
  let blockedCount = 0;
  let rebootCount = 0;
  let highestSeverity: Severity = 'normal';
  const runtimeIncidentFeedItems = incidentFeedBackfillAvailable ? buildRuntimeIncidentFeedItems(incidentFeed) : [];
  const activeIncidentCountsByAgent = buildActiveIncidentCountsByAgent(runtimeIncidentFeedItems);
  const activePeerWatchAlertCountsByAgent = buildActiveIncidentCountsByAgent(
    runtimeIncidentFeedItems,
    (incident) => incident.kind === 'peer_watch_alert'
  );
  const activeIncidentMaxSeverityByAgent = buildActiveIncidentMaxSeverityByAgent(runtimeIncidentFeedItems);
  const incidentFeedPhaseSignalsByAgent = buildIncidentFeedPhaseSignalsByAgent(runtimeIncidentFeedItems, now);

  for (const oa of overview.agents) {
    const workflow = workflows.get(oa.agent_id) ?? null;
    const runtimeEvidence = buildAgentRuntimeEvidence(oa.agent_id, workflow, runtimeIncidentFeedItems, now);
    const wa = projectAgent(
      oa,
      workflow,
      activePeerWatchAlertCountsByAgent.get(oa.agent_id) ?? 0,
      activeIncidentCountsByAgent.get(oa.agent_id) ?? 0,
      activeIncidentMaxSeverityByAgent.get(oa.agent_id) ?? 'normal',
      incidentFeedPhaseSignalsByAgent.get(oa.agent_id) ?? null,
      runtimeEvidence,
      now
    );
    agents.set(wa.agent_id, wa);

    severityBuckets[wa.severity] += 1;
    if (wa.phase === 'blocked') blockedCount += 1;
    if (wa.reboot_recommended) rebootCount += 1;
    if (SEVERITY_RANK[wa.severity] > SEVERITY_RANK[highestSeverity]) {
      highestSeverity = wa.severity;
    }
  }

  const zones = buildZoneSnapshots(overview, agents);
  const watchEdges = buildWatchEdges(overview, agents);
  const incidents = buildIncidentSnapshots(incidentFeed);

  const summary: WorldSummary = {
    total_agents: agents.size,
    blocked_count: blockedCount,
    reboot_count: rebootCount,
    severity_buckets: severityBuckets,
    highest_severity: highestSeverity,
  };

  const dataQuality = buildDataQuality(
    overview,
    workflows,
    incidentFeed,
    incidentFeedLimit,
    runtimeIncidentFeedItems,
    now,
    selectedAgentWorkflowPending
  );

  return {
    generated_at: overview.generated_at,
    projection_ts: projectionTs,
    agents,
    zones,
    watch_edges: watchEdges,
    incidents,
    summary,
    data_quality: dataQuality,
  };
}

// ── Agent projection ──

function projectAgent(
  oa: OfficeAgent,
  workflow: AgentWorkflow | null,
  incidentFeedAlertCount: number,
  incidentFeedOpenCount: number,
  incidentFeedMaxSeverity: Severity,
  incidentFeedPhaseSignals: IncidentFeedPhaseSignals | null,
  runtimeEvidence: RuntimeEvidence,
  now: string
): WorldAgent {
  const signals = extractPhaseSignals(oa, workflow, incidentFeedOpenCount, incidentFeedPhaseSignals);
  const phase = deriveAgentPhase(oa.current_state, signals);
  const homeZone = oa.current_location || `desk-${oa.agent_id}`;
  const zone = deriveAgentZone(phase, homeZone);

  const staleness = projectStaleness(oa);
  const { severity, severity_reason } = projectSeverity(
    oa,
    workflow,
    staleness,
    incidentFeedMaxSeverity
  );
  const recentTrail = extractTrail(workflow);

  const openAlertCount = workflow
    ? workflow.detail.open_peer_watch_alerts.length
    : incidentFeedAlertCount;
  const latestHandoffStatus = workflow ? getLatestStatusRecord(workflow.detail.recent_handoffs) : null;
  const latestRebootStatus = workflow ? getLatestStatusRecord(workflow.detail.recent_reboots) : null;
  const hasOpenIncidents = workflow
    ? openAlertCount > 0 ||
      isCurrentActiveStatus(latestHandoffStatus, workflow.incidents, 'handoff') ||
      isCurrentActiveStatus(latestRebootStatus, workflow.incidents, 'reboot')
    : incidentFeedOpenCount > 0;

  return {
    agent_id: oa.agent_id,
    display_name: oa.display_name,
    kind: oa.kind,
    raw_state: oa.current_state,
    raw_location: oa.current_location,
    active_task: oa.active_task,
    reboot_recommended: oa.reboot_recommended,
    phase,
    zone,
    severity,
    severity_reason,
    staleness,
    recent_trail: recentTrail,
    open_alert_count: openAlertCount,
    has_open_incidents: hasOpenIncidents,
    runtime_evidence: runtimeEvidence,
  };
}

function extractPhaseSignals(
  oa: OfficeAgent,
  workflow: AgentWorkflow | null,
  incidentFeedOpenCount: number,
  incidentFeedPhaseSignals: IncidentFeedPhaseSignals | null
): PhaseSignals {
  const incidents = workflow?.incidents ?? [];
  const latestHandoffStatus = workflow ? getLatestStatusRecord(workflow.detail.recent_handoffs) : null;
  const latestRebootStatus = workflow ? getLatestStatusRecord(workflow.detail.recent_reboots) : null;

  const hasOpenHandoff = workflow
    ? isCurrentStatus(latestHandoffStatus, incidents, 'handoff', 'started')
    : (incidentFeedPhaseSignals?.has_open_handoff ?? false);
  const hasPendingHandoff = workflow
    ? isCurrentStatus(latestHandoffStatus, incidents, 'handoff', 'waiting')
    : (incidentFeedPhaseSignals?.has_pending_handoff ?? false);
  const hasRecentHandoffDone = workflow
    ? isCurrentStatus(latestHandoffStatus, incidents, 'handoff', 'completed')
    : (incidentFeedPhaseSignals?.has_recent_handoff_done ?? false);
  const hasRecentRebootCompleted = workflow
    ? isCurrentStatus(latestRebootStatus, incidents, 'reboot', 'completed')
    : (incidentFeedPhaseSignals?.has_recent_reboot_completed ?? false);
  const hasOpenIncident =
    workflow
      ? workflow.detail.open_peer_watch_alerts.length !== 0 ||
        isCurrentActiveStatus(latestHandoffStatus, incidents, 'handoff') ||
        isCurrentActiveStatus(latestRebootStatus, incidents, 'reboot')
      : incidentFeedOpenCount > 0;

  return {
    reboot_recommended: oa.reboot_recommended,
    has_open_handoff: hasOpenHandoff,
    has_pending_handoff: hasPendingHandoff,
    has_recent_handoff_done: hasRecentHandoffDone,
    has_recent_reboot_completed: hasRecentRebootCompleted,
    has_open_incident: hasOpenIncident,
  };
}

function projectStaleness(oa: OfficeAgent): StalenessDerived | null {
  const ds = oa.derived_staleness;
  if (!ds) return null;
  return {
    severity: ds.severity,
    stale_for_ms: ds.stale_for_ms ?? null,
    stale_for_minutes: ds.stale_for_minutes ?? null,
    last_meaningful_output_at: ds.last_meaningful_output_at ?? null,
  };
}

// ── Severity merge: max(reported, staleness, workflow incidents) ──

function projectSeverity(
  oa: OfficeAgent,
  workflow: AgentWorkflow | null,
  staleness: StalenessDerived | null,
  incidentFeedMaxSeverity: Severity
): { severity: Severity; severity_reason: string } {
  let best: Severity = oa.reported_severity ?? oa.severity ?? 'normal';
  let reason = 'reported';

  const stalenessSev = staleness?.severity ?? 'normal';
  if (SEVERITY_RANK[stalenessSev] > SEVERITY_RANK[best]) {
    best = stalenessSev;
    reason = `staleness: ${staleness?.stale_for_minutes ?? '?'}m`;
  }

  const incidentMax = workflow ? maxIncidentSeverity(workflow) : incidentFeedMaxSeverity;
  if (SEVERITY_RANK[incidentMax] > SEVERITY_RANK[best]) {
    best = incidentMax;
    reason = 'open incident';
  }

  // effective_severity from backend is authoritative when higher
  const effectiveSev = oa.effective_severity ?? 'normal';
  if (SEVERITY_RANK[effectiveSev] > SEVERITY_RANK[best]) {
    best = effectiveSev;
    reason = 'effective (backend)';
  }

  if (!workflow) {
    reason += ' (workflow unavailable)';
  }

  return { severity: best, severity_reason: reason };
}

function maxIncidentSeverity(workflow: AgentWorkflow): Severity {
  let max: Severity = 'normal';

  for (const alert of workflow.detail.open_peer_watch_alerts) {
    if (SEVERITY_RANK[alert.severity] > SEVERITY_RANK[max]) {
      max = alert.severity;
    }
  }

  const latestHandoffStatus = getLatestStatusRecord(workflow.detail.recent_handoffs);
  const latestRebootStatus = getLatestStatusRecord(workflow.detail.recent_reboots);

  const currentHandoff = getCurrentStatusSeverity(latestHandoffStatus, workflow.incidents, 'handoff');
  if (currentHandoff && SEVERITY_RANK[currentHandoff.severity] > SEVERITY_RANK[max]) {
    max = currentHandoff.severity;
  }

  const currentReboot = getCurrentStatusSeverity(latestRebootStatus, workflow.incidents, 'reboot');
  if (currentReboot && SEVERITY_RANK[currentReboot.severity] > SEVERITY_RANK[max]) {
    max = currentReboot.severity;
  }

  return max;
}

function isActiveIncident(incident: WorkflowIncident): boolean {
  return ACTIVE_INCIDENT_STATUSES.has(incident.status);
}

function isIncidentFeedBackfillAvailable(
  feed: IncidentFeedResponse | null,
  incidentFeedLimit?: number
): boolean {
  if (!feed?.items) {
    return false;
  }

  if (incidentFeedLimit == null || !Number.isFinite(incidentFeedLimit) || incidentFeedLimit <= 0) {
    return true;
  }

  return feed.items.length < incidentFeedLimit;
}

function buildRuntimeIncidentFeedItems(feed: IncidentFeedResponse | null): WorkflowIncident[] {
  if (!feed?.items) return [];

  const lifecycleIncidents = buildLatestIncidentLifecycleItemsFromItems(
    feed.items.filter((incident) => incident.kind !== 'peer_watch_alert')
  );
  const openPeerWatchAlerts = buildOpenPeerWatchAlertIncidents(feed.items);

  return [...lifecycleIncidents, ...openPeerWatchAlerts];
}

function buildLatestIncidentLifecycleItems(feed: IncidentFeedResponse | null): WorkflowIncident[] {
  return buildLatestIncidentLifecycleItemsFromItems(feed?.items ?? []);
}

function buildLatestIncidentLifecycleItemsFromItems(incidents: WorkflowIncident[]): WorkflowIncident[] {
  const latestIncidentsByLifecycle = new Map<string, WorkflowIncident>();

  for (const incident of incidents) {
    const key = buildIncidentLifecycleKey(incident);
    const current = latestIncidentsByLifecycle.get(key);

    if (!current || shouldPreferIncidentLifecycleUpdate(incident, current)) {
      latestIncidentsByLifecycle.set(key, incident);
    }
  }

  return Array.from(latestIncidentsByLifecycle.values());
}

function shouldPreferIncidentLifecycleUpdate(
  incident: WorkflowIncident,
  current: WorkflowIncident
): boolean {
  const incidentTs = Date.parse(incident.ts);
  const currentTs = Date.parse(current.ts);

  if (incidentTs !== currentTs) {
    return incidentTs > currentTs;
  }

  if (incident.kind !== current.kind) {
    return false;
  }

  const statusPriority = getIncidentLifecycleStatusPriority(incident);
  const currentPriority = getIncidentLifecycleStatusPriority(current);

  return statusPriority > currentPriority;
}

function getIncidentLifecycleStatusPriority(incident: WorkflowIncident): number {
  if (incident.kind === 'handoff') {
    if (incident.status === 'completed') {
      return 3;
    }
    if (incident.status === 'waiting') {
      return 2;
    }
    if (incident.status === 'started') {
      return 1;
    }
  }

  if (incident.kind === 'reboot') {
    if (incident.status === 'completed') {
      return 2;
    }
    if (incident.status === 'requested') {
      return 1;
    }
  }

  return 0;
}

function buildOpenPeerWatchAlertIncidents(incidents: WorkflowIncident[]): WorkflowIncident[] {
  const openAlertsByResolutionKey = new Map<string, WorkflowIncident[]>();
  const orderedAlerts = incidents
    .filter((incident) => incident.kind === 'peer_watch_alert')
    .map((incident, index) => ({ incident, index }))
    .sort((left, right) => {
      const byTs = Date.parse(left.incident.ts) - Date.parse(right.incident.ts);
      return byTs !== 0 ? byTs : left.index - right.index;
    });

  for (const { incident } of orderedAlerts) {
    const key = buildPeerWatchAlertResolutionKey(incident);

    if (incident.status === 'resolved') {
      const current = openAlertsByResolutionKey.get(key) ?? [];
      if (current.length <= 1) {
        openAlertsByResolutionKey.delete(key);
      } else {
        openAlertsByResolutionKey.set(key, current.slice(1));
      }
      continue;
    }

    if (incident.status !== 'open') {
      continue;
    }

    const current = openAlertsByResolutionKey.get(key) ?? [];
    openAlertsByResolutionKey.set(key, [...current, incident]);
  }

  return Array.from(openAlertsByResolutionKey.values()).flat();
}

function buildPeerWatchAlertResolutionKey(incident: WorkflowIncident): string {
  if (isCollectorSnapshotPeerWatchAlert(incident)) {
    return buildCollectorPeerWatchLifecycleKey(incident);
  }

  const counterparties = Array.isArray(incident.counterparty_agent_ids)
    ? [...incident.counterparty_agent_ids].sort().join('|')
    : '';

  return [
    incident.agent_id,
    incident.kind,
    incident.actor_id,
    incident.correlation_id ?? '',
    counterparties,
  ].join('::');
}

function buildActiveIncidentCountsByAgent(
  incidents: WorkflowIncident[],
  predicate: (incident: WorkflowIncident) => boolean = () => true
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const incident of incidents) {
    if (!isActiveIncident(incident) || !predicate(incident)) {
      continue;
    }

    counts.set(incident.agent_id, (counts.get(incident.agent_id) ?? 0) + 1);
  }

  return counts;
}

function buildActiveIncidentMaxSeverityByAgent(incidents: WorkflowIncident[]): Map<string, Severity> {
  const severities = new Map<string, Severity>();

  for (const incident of incidents) {
    if (!isActiveIncident(incident)) {
      continue;
    }

    const current = severities.get(incident.agent_id) ?? 'normal';
    if (SEVERITY_RANK[incident.severity] > SEVERITY_RANK[current]) {
      severities.set(incident.agent_id, incident.severity);
    }
  }

  return severities;
}

function buildIncidentFeedPhaseSignalsByAgent(
  incidents: WorkflowIncident[],
  now: string
): Map<string, IncidentFeedPhaseSignals> {
  const signalsByAgent = new Map<string, IncidentFeedPhaseSignals>();
  const rebootStateByAgent = new Map<string, { has_active: boolean; has_recent_completed: boolean }>();

  for (const incident of incidents) {
    if (incident.kind !== 'handoff' && incident.kind !== 'reboot') {
      continue;
    }

    const signals = signalsByAgent.get(incident.agent_id) ?? {
      has_open_handoff: false,
      has_pending_handoff: false,
      has_recent_handoff_done: false,
      has_recent_reboot_completed: false,
    };

    if (incident.kind === 'handoff') {
      if (incident.status === 'started') {
        signals.has_open_handoff = true;
      }
      if (incident.status === 'waiting') {
        signals.has_pending_handoff = true;
      }
      if (
        incident.status === 'completed' &&
        isIncidentInsideLookbackWindow(incident.ts, now, INCIDENT_FEED_RECENT_COMPLETION_WINDOW_MS)
      ) {
        signals.has_recent_handoff_done = true;
      }
    }

    if (incident.kind === 'reboot') {
      const rebootState = rebootStateByAgent.get(incident.agent_id) ?? {
        has_active: false,
        has_recent_completed: false,
      };
      if (isActiveIncident(incident)) {
        rebootState.has_active = true;
      }
      if (
        incident.status === 'completed' &&
        isIncidentInsideLookbackWindow(incident.ts, now, INCIDENT_FEED_RECENT_COMPLETION_WINDOW_MS)
      ) {
        rebootState.has_recent_completed = true;
      }
      rebootStateByAgent.set(incident.agent_id, rebootState);
    }

    signalsByAgent.set(incident.agent_id, signals);
  }

  for (const [agentId, rebootState] of rebootStateByAgent.entries()) {
    const signals = signalsByAgent.get(agentId) ?? {
      has_open_handoff: false,
      has_pending_handoff: false,
      has_recent_handoff_done: false,
      has_recent_reboot_completed: false,
    };
    signals.has_recent_reboot_completed = rebootState.has_recent_completed && !rebootState.has_active;
    signalsByAgent.set(agentId, signals);
  }

  return signalsByAgent;
}

function isCollectorSnapshotPeerWatchAlert(incident: WorkflowIncident): boolean {
  return (
    incident.kind === 'peer_watch_alert' &&
    typeof incident.correlation_id === 'string' &&
    incident.correlation_id.startsWith('collector-snapshot:')
  );
}

function buildCollectorPeerWatchLifecycleKey(incident: WorkflowIncident): string {
  return [incident.agent_id, incident.kind].join('::');
}

function buildLatestIncidentStatusesByAgent(
  incidents: WorkflowIncident[],
  kind: WorkflowIncident['kind']
): Map<string, TimestampedStatus> {
  const statuses = new Map<string, TimestampedStatus>();

  for (const incident of incidents) {
    if (incident.kind !== kind) {
      continue;
    }

    const current = statuses.get(incident.agent_id);
    if (!current || Date.parse(incident.ts) > Date.parse(current.ts)) {
      statuses.set(incident.agent_id, {
        status: incident.status,
        ts: incident.ts,
        severity: incident.severity,
      });
    }
  }

  return statuses;
}

function buildIncidentLifecycleKey(incident: WorkflowIncident): string {
  const counterparties = Array.isArray(incident.counterparty_agent_ids)
    ? [...incident.counterparty_agent_ids].sort().join('|')
    : '';

  if (incident.kind === 'handoff' || incident.kind === 'reboot') {
    const lifecycleId =
      typeof incident.correlation_id === 'string' && incident.correlation_id.trim().length > 0
        ? `correlation:${incident.correlation_id}`
        : `incident:${incident.incident_id}`;
    return [incident.agent_id, incident.kind, lifecycleId].join('::');
  }

  return [
    incident.agent_id,
    incident.kind,
    incident.actor_id,
    incident.correlation_id ?? '',
    counterparties,
  ].join('::');
}

function getLatestStatusRecord(
  items: Array<{ status: string; ts: string; severity: Severity }>
): TimestampedStatus | null {
  let latest: TimestampedStatus | null = null;

  for (const item of items) {
    if (!latest || Date.parse(item.ts) > Date.parse(latest.ts)) {
      latest = { status: item.status, ts: item.ts, severity: item.severity };
    }
  }

  return latest;
}

function getLatestIncidentForKind(
  incidents: WorkflowIncident[],
  kind: WorkflowIncident['kind']
): WorkflowIncident | null {
  let latest: WorkflowIncident | null = null;

  for (const incident of incidents) {
    if (incident.kind !== kind) {
      continue;
    }

    if (!latest || Date.parse(incident.ts) > Date.parse(latest.ts)) {
      latest = incident;
    }
  }

  return latest;
}

function resolveCurrentStatus(
  detailStatus: TimestampedStatus | null,
  incidents: WorkflowIncident[],
  kind: WorkflowIncident['kind']
): TimestampedStatus | null {
  const incident = getLatestIncidentForKind(incidents, kind);

  if (detailStatus && incident) {
    if (Date.parse(detailStatus.ts) >= Date.parse(incident.ts)) {
      return detailStatus;
    }

    return {
      status: incident.status,
      ts: incident.ts,
      severity: incident.severity,
    };
  }

  if (detailStatus) {
    return detailStatus;
  }

  if (!incident) {
    return null;
  }

  return {
    status: incident.status,
    ts: incident.ts,
    severity: incident.severity,
  };
}

function getCurrentStatusSeverity(
  detailStatus: TimestampedStatus | null,
  incidents: WorkflowIncident[],
  kind: WorkflowIncident['kind']
): { status: string; severity: Severity } | null {
  const currentStatus = resolveCurrentStatus(detailStatus, incidents, kind);
  if (!currentStatus || !ACTIVE_INCIDENT_STATUSES.has(currentStatus.status)) {
    return null;
  }

  return {
    status: currentStatus.status,
    severity: currentStatus.severity,
  };
}

function isCurrentStatus(
  detailStatus: TimestampedStatus | null,
  incidents: WorkflowIncident[],
  kind: WorkflowIncident['kind'],
  expectedStatus: string
): boolean {
  return resolveCurrentStatus(detailStatus, incidents, kind)?.status === expectedStatus;
}

function isCurrentActiveStatus(
  detailStatus: TimestampedStatus | null,
  incidents: WorkflowIncident[],
  kind: WorkflowIncident['kind']
): boolean {
  const currentStatus = resolveCurrentStatus(detailStatus, incidents, kind);
  return currentStatus ? ACTIVE_INCIDENT_STATUSES.has(currentStatus.status) : false;
}

// ── Trail extraction ──

function extractTrail(workflow: AgentWorkflow | null): TrailEntry[] {
  if (!workflow?.timeline) return [];

  return workflow.timeline
    .slice(-TRAIL_LIMIT)
    .map((e) => ({
      event_id: e.event_id,
      ts: e.ts,
      event_type: e.event_type,
      severity: e.severity,
      location: e.location ?? null,
      summary: e.summary,
    }));
}

// ── Zone snapshots ──

function buildZoneSnapshots(
  overview: OfficeOverview,
  agents: Map<string, WorldAgent>
): ZoneSnapshot[] {
  const occupancy = new Map<string, string[]>();
  const overviewZoneIds = new Set<string>();
  for (const zone of overview.zones) {
    overviewZoneIds.add(zone.zone_id);
    occupancy.set(zone.zone_id, []);
  }
  for (const [, wa] of agents) {
    const list = occupancy.get(wa.zone);
    if (list) {
      list.push(wa.agent_id);
    } else {
      occupancy.set(wa.zone, [wa.agent_id]);
    }
  }

  const overviewSnapshots = overview.zones.map((z) => ({
    zone_id: z.zone_id,
    label: z.label,
    kind: z.kind,
    grid_x: z.grid_x,
    grid_y: z.grid_y,
    grid_w: z.grid_w,
    grid_h: z.grid_h,
    home_agent_id: z.home_agent_id,
    occupant_ids: occupancy.get(z.zone_id) ?? [],
  }));

  const runtimeGridY = overview.zones.reduce(
    (next, zone) => Math.max(next, zone.grid_y + zone.grid_h),
    0
  );
  const runtimeSnapshots = Array.from(occupancy.keys())
    .filter((zoneId) => !overviewZoneIds.has(zoneId))
    .sort()
    .map((zoneId, index) => ({
      zone_id: zoneId,
      label: formatRuntimeZoneLabel(zoneId),
      kind: 'shared' as const,
      grid_x: 0,
      grid_y: runtimeGridY + index,
      grid_w: 1,
      grid_h: 1,
      home_agent_id: null,
      occupant_ids: occupancy.get(zoneId) ?? [],
    }));

  return [...overviewSnapshots, ...runtimeSnapshots];
}

function formatRuntimeZoneLabel(zoneId: string): string {
  const words = zoneId.split('-').filter(Boolean);
  if (words.length === 0) {
    return zoneId;
  }

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ── Watch edge enrichment ──

function buildWatchEdges(
  overview: OfficeOverview,
  agents: Map<string, WorldAgent>
): WatchEdgeSnapshot[] {
  return overview.watch_edges.map((e) => {
    const target = agents.get(e.to_agent_id);
    return {
      from_agent_id: e.from_agent_id,
      to_agent_id: e.to_agent_id,
      watch_mode: e.watch_mode,
      risk_level: target?.severity ?? 'normal',
    };
  });
}

// ── Incident feed normalization ──

function buildIncidentSnapshots(
  feed: IncidentFeedResponse | null
): IncidentSnapshot[] {
  if (!feed?.items) return [];

  return feed.items.map((i) => ({
    incident_id: i.incident_id,
    kind: i.kind,
    agent_id: i.agent_id,
    severity: i.severity,
    status: i.status,
    summary: i.summary,
    ts: i.ts,
    correlation_id: i.correlation_id,
  }));
}

function isRuntimeEffectiveBackfillIncident(incident: WorkflowIncident, now: string): boolean {
  if (isActiveIncident(incident)) {
    return true;
  }

  if (
    (incident.kind === 'handoff' || incident.kind === 'reboot') &&
    incident.status === 'completed' &&
    isIncidentInsideLookbackWindow(incident.ts, now, INCIDENT_FEED_RECENT_COMPLETION_WINDOW_MS)
  ) {
    return true;
  }

  return false;
}

function buildAgentRuntimeEvidence(
  agentId: string,
  workflow: AgentWorkflow | null,
  runtimeIncidentFeedItems: WorkflowIncident[],
  now: string
): RuntimeEvidence {
  if (workflow) {
    return {
      source: 'workflow',
      degraded_reasons: [],
      incident_ids: [],
      source_kinds: [],
      correlation_ids: [],
      evidence_refs: [],
    };
  }

  const evidenceIncidents = runtimeIncidentFeedItems
    .filter((incident) => incident.agent_id === agentId && isRuntimeEffectiveBackfillIncident(incident, now))
    .sort(compareIncidentsByTimestampThenId);

  if (evidenceIncidents.length === 0) {
    return {
      source: 'overview_only',
      degraded_reasons: [],
      incident_ids: [],
      source_kinds: [],
      correlation_ids: [],
      evidence_refs: [],
    };
  }

  return {
    source: 'incident_feed_backfill',
    degraded_reasons: ['workflow partial'],
    incident_ids: uniqueStrings(evidenceIncidents.map((incident) => incident.incident_id)),
    source_kinds: uniqueStrings(evidenceIncidents.map((incident) => incident.source_kind)).sort(),
    correlation_ids: uniqueTrimmedStrings(evidenceIncidents.map((incident) => incident.correlation_id)),
    evidence_refs: uniqueTrimmedStrings(evidenceIncidents.flatMap((incident) => incident.evidence_refs)),
  };
}

function compareIncidentsByTimestampThenId(a: WorkflowIncident, b: WorkflowIncident): number {
  const timestampDelta = Date.parse(a.ts) - Date.parse(b.ts);
  if (timestampDelta !== 0) {
    return timestampDelta;
  }

  return a.incident_id.localeCompare(b.incident_id);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function uniqueTrimmedStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const trimmed = value?.trim() ?? '';
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

// ── Data quality ──

function buildDataQuality(
  overview: OfficeOverview | null,
  workflows: Map<string, AgentWorkflow>,
  incidentFeed: IncidentFeedResponse | null,
  incidentFeedLimit?: number,
  runtimeIncidentFeedItems: WorkflowIncident[] = buildRuntimeIncidentFeedItems(incidentFeed),
  now = '',
  selectedAgentWorkflowPending = false
): DataQuality {
  const reasons: string[] = [];
  if (!overview) reasons.push('overview unavailable');
  if (!incidentFeed) reasons.push('incident feed unavailable');
  if (
    incidentFeed &&
    incidentFeedLimit != null &&
    Number.isFinite(incidentFeedLimit) &&
    incidentFeedLimit > 0 &&
    incidentFeed.items.length >= incidentFeedLimit
  ) {
    reasons.push('incident feed truncated');
  }

  if (overview && runtimeIncidentFeedItems.length > 0 && !(selectedAgentWorkflowPending && workflows.size === 0)) {
    const overviewAgentIds = new Set(overview.agents.map((agent) => agent.agent_id));
    const usesIncidentFeedBackfill = runtimeIncidentFeedItems.some(
      (incident) =>
        overviewAgentIds.has(incident.agent_id) &&
        !workflows.has(incident.agent_id) &&
        isRuntimeEffectiveBackfillIncident(incident, now)
    );

    if (usesIncidentFeedBackfill) {
      reasons.push('workflow partial');
    }
  }

  return {
    overview_available: overview !== null,
    workflow_agent_ids: Array.from(workflows.keys()),
    incident_feed_available: incidentFeed !== null,
    last_overview_at: overview?.generated_at ?? null,
    degraded_reasons: reasons,
  };
}

// ── Empty state fallback ──

function emptyWorldState(
  projectionTs: string,
  workflows: Map<string, AgentWorkflow>,
  incidentFeed: IncidentFeedResponse | null,
  incidentFeedLimit?: number
): WorldState {
  return {
    generated_at: '',
    projection_ts: projectionTs,
    agents: new Map(),
    zones: [],
    watch_edges: [],
    incidents: buildIncidentSnapshots(incidentFeed),
    summary: {
      total_agents: 0,
      blocked_count: 0,
      reboot_count: 0,
      severity_buckets: { normal: 0, yellow: 0, orange: 0, red: 0 },
      highest_severity: 'normal',
    },
    data_quality: buildDataQuality(null, workflows, incidentFeed, incidentFeedLimit, undefined, projectionTs),
  };
}

export { SEVERITY_RANK, TRAIL_LIMIT };
