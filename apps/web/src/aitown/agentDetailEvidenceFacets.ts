import type { AgentDetail } from '../types';

export type AgentDetailEvidenceFacetStatus = 'empty' | 'evidence_present' | 'no_structured_evidence';

export type AgentDetailEvidenceFacetSourceSlice =
  | 'latest_heartbeat'
  | 'open_peer_watch_alerts'
  | 'recent_events'
  | 'recent_interactions'
  | 'recent_incidents'
  | 'recent_handoffs'
  | 'recent_reboots';

export interface AgentDetailEvidenceFacetCounts {
  evidence_refs: number;
  source_kinds: number;
  correlations: number;
  events: number;
  interactions: number;
  handoffs: number;
  reboots: number;
  incidents: number;
  peer_watch_alerts: number;
}

export interface AgentDetailEvidenceFacetRow {
  source_slice: AgentDetailEvidenceFacetSourceSlice;
  id: string | null;
  ts: string | null;
  evidence_refs: string[];
  source_kinds: string[];
  correlation_ids: string[];
  incident_ids: string[];
  event_ids: string[];
  counterparty_agent_ids: string[];
}

export interface AgentDetailEvidenceFacets {
  status: AgentDetailEvidenceFacetStatus;
  agent_id: string | null;
  name: string | null;
  counts: AgentDetailEvidenceFacetCounts;
  evidence_refs: string[];
  source_kinds: string[];
  correlation_ids: string[];
  incident_ids: string[];
  event_ids: string[];
  counterparty_agent_ids: string[];
  rows: AgentDetailEvidenceFacetRow[];
}

function emptyCounts(): AgentDetailEvidenceFacetCounts {
  return {
    evidence_refs: 0,
    source_kinds: 0,
    correlations: 0,
    events: 0,
    interactions: 0,
    handoffs: 0,
    reboots: 0,
    incidents: 0,
    peer_watch_alerts: 0
  };
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeList(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const trimmed = normalizeString(value);
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      normalized.push(trimmed);
    }
  }
  return normalized;
}

function sorted(values: Iterable<string>): string[] {
  return Array.from(values).sort((left, right) => left.localeCompare(right));
}

function addAll(target: Set<string>, values: readonly string[]): void {
  for (const value of values) {
    target.add(value);
  }
}

function makeRow(input: {
  source_slice: AgentDetailEvidenceFacetSourceSlice;
  id?: unknown;
  ts?: unknown;
  evidence_refs?: unknown;
  source_kind?: unknown;
  source_kinds?: unknown;
  correlation_id?: unknown;
  correlation_ids?: unknown;
  incident_id?: unknown;
  incident_ids?: unknown;
  event_id?: unknown;
  event_ids?: unknown;
  counterparty_agent_ids?: unknown;
}): AgentDetailEvidenceFacetRow | null {
  const evidence_refs = normalizeList(input.evidence_refs);
  const source_kinds = [
    ...normalizeList(input.source_kinds),
    ...normalizeList([input.source_kind])
  ];
  const correlation_ids = [
    ...normalizeList(input.correlation_ids),
    ...normalizeList([input.correlation_id])
  ];
  const incident_ids = [
    ...normalizeList(input.incident_ids),
    ...normalizeList([input.incident_id])
  ];
  const event_ids = [
    ...normalizeList(input.event_ids),
    ...normalizeList([input.event_id])
  ];
  const counterparty_agent_ids = normalizeList(input.counterparty_agent_ids);
  const id = normalizeString(input.id);
  const ts = normalizeString(input.ts);

  const hasStructuredEvidence =
    evidence_refs.length > 0 ||
    source_kinds.length > 0 ||
    correlation_ids.length > 0 ||
    incident_ids.length > 0 ||
    event_ids.length > 0 ||
    counterparty_agent_ids.length > 0;

  if (!hasStructuredEvidence) {
    return null;
  }

  return {
    source_slice: input.source_slice,
    id,
    ts,
    evidence_refs: sorted(new Set(evidence_refs)),
    source_kinds: sorted(new Set(source_kinds)),
    correlation_ids: sorted(new Set(correlation_ids)),
    incident_ids: sorted(new Set(incident_ids)),
    event_ids: sorted(new Set(event_ids)),
    counterparty_agent_ids: sorted(new Set(counterparty_agent_ids))
  };
}

export function deriveAgentDetailEvidenceFacets(detail: AgentDetail | null | undefined): AgentDetailEvidenceFacets {
  const counts = emptyCounts();
  const rows: AgentDetailEvidenceFacetRow[] = [];
  const evidenceRefs = new Set<string>();
  const sourceKinds = new Set<string>();
  const correlationIds = new Set<string>();
  const incidentIds = new Set<string>();
  const eventIds = new Set<string>();
  const counterpartyAgentIds = new Set<string>();

  if (!detail) {
    return {
      status: 'empty',
      agent_id: null,
      name: null,
      counts,
      evidence_refs: [],
      source_kinds: [],
      correlation_ids: [],
      incident_ids: [],
      event_ids: [],
      counterparty_agent_ids: [],
      rows
    };
  }

  const pushRow = (row: AgentDetailEvidenceFacetRow | null, countKey?: keyof Pick<
    AgentDetailEvidenceFacetCounts,
    'events' | 'interactions' | 'handoffs' | 'reboots' | 'incidents' | 'peer_watch_alerts'
  >) => {
    if (!row) {
      return;
    }
    rows.push(row);
    if (countKey) {
      counts[countKey] += 1;
    }
    addAll(evidenceRefs, row.evidence_refs);
    addAll(sourceKinds, row.source_kinds);
    addAll(correlationIds, row.correlation_ids);
    addAll(incidentIds, row.incident_ids);
    addAll(eventIds, row.event_ids);
    addAll(counterpartyAgentIds, row.counterparty_agent_ids);
  };

  for (const alert of detail.open_peer_watch_alerts ?? []) {
    pushRow(
      makeRow({
        source_slice: 'open_peer_watch_alerts',
        id: alert.alert_id,
        ts: alert.ts,
        evidence_refs: alert.evidence_refs,
        source_kind: alert.source_kind,
        correlation_id: alert.correlation_id,
        counterparty_agent_ids: [alert.target_agent_id]
      }),
      'peer_watch_alerts'
    );
  }

  for (const event of detail.recent_events ?? []) {
    pushRow(
      makeRow({
        source_slice: 'recent_events',
        id: event.event_id,
        ts: event.ts,
        evidence_refs: event.evidence_refs,
        source_kind: event.source_kind,
        correlation_id: event.correlation_id,
        event_id: event.event_id,
        counterparty_agent_ids: event.counterparty_agent_ids
      }),
      'events'
    );
  }

  for (const interaction of detail.recent_interactions ?? []) {
    const participants = normalizeList(interaction.participant_agent_ids).filter(
      (agentId) => agentId !== detail.agent_id
    );
    pushRow(
      makeRow({
        source_slice: 'recent_interactions',
        id: interaction.interaction_id,
        ts: interaction.started_at,
        evidence_refs: interaction.evidence_refs,
        source_kind: interaction.source_kind,
        correlation_id: interaction.correlation_id,
        event_id: interaction.trigger_event_id,
        event_ids: interaction.related_event_ids,
        counterparty_agent_ids: participants
      }),
      'interactions'
    );
  }

  for (const incident of detail.recent_incidents ?? []) {
    pushRow(
      makeRow({
        source_slice: 'recent_incidents',
        id: incident.incident_id,
        ts: incident.ts,
        evidence_refs: incident.evidence_refs,
        source_kind: incident.source_kind,
        correlation_id: incident.correlation_id,
        incident_id: incident.incident_id,
        counterparty_agent_ids: incident.counterparty_agent_ids
      }),
      'incidents'
    );
  }

  for (const handoff of detail.recent_handoffs ?? []) {
    pushRow(
      makeRow({
        source_slice: 'recent_handoffs',
        id: handoff.handoff_id,
        ts: handoff.ts,
        evidence_refs: handoff.evidence_refs,
        source_kind: handoff.source_kind,
        correlation_id: handoff.correlation_id,
        counterparty_agent_ids: handoff.counterparty_agent_ids
      }),
      'handoffs'
    );
  }

  for (const reboot of detail.recent_reboots ?? []) {
    pushRow(
      makeRow({
        source_slice: 'recent_reboots',
        id: reboot.reboot_id,
        ts: reboot.ts,
        evidence_refs: reboot.evidence_refs,
        source_kind: reboot.source_kind,
        correlation_id: reboot.correlation_id,
        counterparty_agent_ids: reboot.counterparty_agent_ids
      }),
      'reboots'
    );
  }

  counts.evidence_refs = evidenceRefs.size;
  counts.source_kinds = sourceKinds.size;
  counts.correlations = correlationIds.size;

  return {
    status: rows.length > 0 ? 'evidence_present' : 'no_structured_evidence',
    agent_id: detail.agent_id,
    name: detail.display_name ?? null,
    counts,
    evidence_refs: sorted(evidenceRefs),
    source_kinds: sorted(sourceKinds),
    correlation_ids: sorted(correlationIds),
    incident_ids: sorted(incidentIds),
    event_ids: sorted(eventIds),
    counterparty_agent_ids: sorted(counterpartyAgentIds),
    rows
  };
}
