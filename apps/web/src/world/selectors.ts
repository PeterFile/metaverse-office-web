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

// ── Internal helpers ──

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
