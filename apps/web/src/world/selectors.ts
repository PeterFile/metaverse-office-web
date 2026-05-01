import type { Severity, WatchEdgeSnapshot, WorldAgent, WorldState, ZoneSnapshot } from './types';

const SEVERITY_RANK: Record<Severity, number> = {
  normal: 0,
  yellow: 1,
  orange: 2,
  red: 3,
};

const PHASE_LABELS: Record<string, string> = {
  idle: 'Idle',
  active: 'Active',
  blocked: 'Blocked',
  waiting: 'Waiting',
  reviewing: 'Reviewing',
  handoff_pending: 'Handoff pending',
  handoff_active: 'Handoff in progress',
  handoff_done: 'Handoff completed',
  reboot_recommended: 'Reboot recommended',
  rebooting: 'Rebooting',
  recovered: 'Recovered',
  sleeping: 'Sleeping',
  unknown: 'Unknown',
};

const SEVERITY_EMOJI: Record<Severity, string> = {
  normal: '🟢',
  yellow: '🟡',
  orange: '🟠',
  red: '🔴',
};

const HOT_ZONE_LIMIT = 3;

export interface HotZoneSummary {
  zone_id: string;
  label: string;
  highest_severity: Severity;
  occupant_count: number;
  blocked_count: number;
  reboot_count: number;
  open_alert_or_incident_occupant_count: number;
  runtime_freshness_degraded_count: number;
}

export interface DataQualitySummary {
  degraded_reasons: string[];
  last_overview_at: string | null;
}

export interface RuntimeBackfillEvidenceSummary {
  agent_id: string;
  display_name: string;
  degraded_reasons: string[];
  incident_ids: string[];
  source_kinds: string[];
}

// ── Single agent ──

export function selectAgentLabel(agent: WorldAgent): string {
  const emoji = SEVERITY_EMOJI[agent.severity];
  const phaseText = PHASE_LABELS[agent.phase] ?? agent.phase;
  const extras: string[] = [];
  if (agent.reboot_recommended) extras.push('reboot recommended');
  if (agent.open_alert_count > 0) extras.push(`${agent.open_alert_count} alert(s)`);
  const suffix = extras.length > 0 ? ` (${extras.join(', ')})` : '';
  return `${emoji} ${phaseText}${suffix}`;
}

export function selectAgentBadge(agent: WorldAgent): { severity: Severity; text: string } {
  return {
    severity: agent.severity,
    text: agent.severity_reason,
  };
}

export function selectAgentZoneLabel(
  agent: WorldAgent,
  zones: ZoneSnapshot[]
): string {
  const zone = zones.find((z) => z.zone_id === agent.zone);
  return zone?.label ?? agent.zone;
}

export function selectAgentTrailSummary(agent: WorldAgent): string[] {
  return agent.recent_trail.map(
    (e) => `[${e.ts}] ${e.event_type}: ${e.summary}`
  );
}

// ── Watch edges ──

export function selectWatchEdgeRisk(
  edge: WatchEdgeSnapshot
): { level: Severity; label: string } {
  if (SEVERITY_RANK[edge.risk_level] >= SEVERITY_RANK.orange) {
    return { level: edge.risk_level, label: 'High risk' };
  }
  if (SEVERITY_RANK[edge.risk_level] >= SEVERITY_RANK.yellow) {
    return { level: edge.risk_level, label: 'Elevated' };
  }
  return { level: 'normal', label: 'Normal' };
}

// ── Global selectors ──

export function selectAttentionQueue(world: WorldState): WorldAgent[] {
  const worthy: WorldAgent[] = [];
  for (const [, agent] of world.agents) {
    if (isAttentionWorthy(agent)) {
      worthy.push(agent);
    }
  }
  return worthy.sort(compareAttention);
}

export function selectGlobalSeverity(world: WorldState): Severity {
  return world.summary.highest_severity;
}

export function selectDataQualitySummary(
  world: WorldState | null | undefined
): DataQualitySummary | null {
  if (!world) {
    return null;
  }

  const degradedReasons = new Set(world.data_quality.degraded_reasons);
  if (!world.data_quality.overview_available) {
    degradedReasons.add('overview unavailable');
  }
  if (!world.data_quality.incident_feed_available) {
    degradedReasons.add('incident feed unavailable');
  }

  const normalizedReasons = Array.from(degradedReasons).filter((reason) => reason.length > 0);
  if (normalizedReasons.length === 0) {
    return null;
  }

  return {
    degraded_reasons: normalizedReasons,
    last_overview_at: world.data_quality.last_overview_at,
  };
}

export function selectRuntimeBackfillEvidence(
  world: WorldState | null | undefined
): RuntimeBackfillEvidenceSummary[] {
  if (!world) {
    return [];
  }

  const summaries: RuntimeBackfillEvidenceSummary[] = [];
  for (const [, agent] of world.agents) {
    const evidence = agent.runtime_evidence;
    if (
      !evidence ||
      evidence.source !== 'incident_feed_backfill' ||
      evidence.incident_ids.length === 0 ||
      evidence.source_kinds.length === 0
    ) {
      continue;
    }

    summaries.push({
      agent_id: agent.agent_id,
      display_name: agent.display_name,
      degraded_reasons: [...evidence.degraded_reasons],
      incident_ids: [...evidence.incident_ids],
      source_kinds: [...evidence.source_kinds],
    });
  }

  return summaries.sort(
    (left, right) =>
      left.display_name.localeCompare(right.display_name) || left.agent_id.localeCompare(right.agent_id)
  );
}

export function selectHotZones(
  world: WorldState | null | undefined,
  limit = HOT_ZONE_LIMIT
): HotZoneSummary[] {
  if (!world || limit <= 0 || world.zones.length === 0 || world.agents.size === 0) {
    return [];
  }

  const hotZones: HotZoneSummary[] = [];

  for (const zone of world.zones) {
    const occupants = zone.occupant_ids
      .map((occupantId) => world.agents.get(occupantId))
      .filter((occupant): occupant is WorldAgent => occupant !== undefined);

    if (occupants.length === 0) {
      continue;
    }

    let highestSeverity: Severity = 'normal';
    let blockedCount = 0;
    let rebootCount = 0;
    let openAlertOrIncidentOccupantCount = 0;
    let runtimeFreshnessDegradedCount = 0;

    for (const occupant of occupants) {
      if (SEVERITY_RANK[occupant.severity] > SEVERITY_RANK[highestSeverity]) {
        highestSeverity = occupant.severity;
      }

      if (occupant.phase === 'blocked') {
        blockedCount += 1;
      }

      if (occupant.reboot_recommended) {
        rebootCount += 1;
      }

      if (occupant.has_open_incidents) {
        openAlertOrIncidentOccupantCount += 1;
      }

      if (occupant.staleness && occupant.staleness.severity !== 'normal') {
        runtimeFreshnessDegradedCount += 1;
      }
    }

    const summary: HotZoneSummary = {
      zone_id: zone.zone_id,
      label: zone.label || zone.zone_id,
      highest_severity: highestSeverity,
      occupant_count: occupants.length,
      blocked_count: blockedCount,
      reboot_count: rebootCount,
      open_alert_or_incident_occupant_count: openAlertOrIncidentOccupantCount,
      runtime_freshness_degraded_count: runtimeFreshnessDegradedCount,
    };

    if (isHotZone(summary)) {
      hotZones.push(summary);
    }
  }

  return hotZones.sort(compareHotZones).slice(0, limit);
}

// ── Internal helpers ──

function isHotZone(zone: HotZoneSummary): boolean {
  return (
    SEVERITY_RANK[zone.highest_severity] > SEVERITY_RANK.normal ||
    zone.blocked_count > 0 ||
    zone.reboot_count > 0 ||
    zone.open_alert_or_incident_occupant_count > 0 ||
    zone.runtime_freshness_degraded_count > 0
  );
}

function compareHotZones(a: HotZoneSummary, b: HotZoneSummary): number {
  const severityDelta = SEVERITY_RANK[b.highest_severity] - SEVERITY_RANK[a.highest_severity];
  if (severityDelta !== 0) return severityDelta;

  const alertOrIncidentDelta =
    b.open_alert_or_incident_occupant_count - a.open_alert_or_incident_occupant_count;
  if (alertOrIncidentDelta !== 0) return alertOrIncidentDelta;

  const blockedDelta = b.blocked_count - a.blocked_count;
  if (blockedDelta !== 0) return blockedDelta;

  const rebootDelta = b.reboot_count - a.reboot_count;
  if (rebootDelta !== 0) return rebootDelta;

  const occupantDelta = b.occupant_count - a.occupant_count;
  if (occupantDelta !== 0) return occupantDelta;

  return a.label.localeCompare(b.label) || a.zone_id.localeCompare(b.zone_id);
}

function isAttentionWorthy(agent: WorldAgent): boolean {
  if (agent.severity !== 'normal') return true;
  if (agent.reboot_recommended) return true;
  if (agent.phase === 'blocked') return true;
  if (agent.has_open_incidents) return true;
  return false;
}

function compareAttention(a: WorldAgent, b: WorldAgent): number {
  const sevDelta = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  if (sevDelta !== 0) return sevDelta;

  const rebootDelta = Number(b.reboot_recommended) - Number(a.reboot_recommended);
  if (rebootDelta !== 0) return rebootDelta;

  const blockedDelta = Number(b.phase === 'blocked') - Number(a.phase === 'blocked');
  if (blockedDelta !== 0) return blockedDelta;

  return a.display_name.localeCompare(b.display_name) || a.agent_id.localeCompare(b.agent_id);
}

export { PHASE_LABELS, SEVERITY_EMOJI, SEVERITY_RANK };
