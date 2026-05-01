import type { AccountabilityReplayBundle, AccountabilityReplayLedgerEntry } from '../types';

export type AccountabilityReplayAuditRowStatus =
  | 'replayable'
  | 'collector_observation_without_event_id'
  | 'unsupported_unbacked';

export interface AccountabilityReplayAuditCounts {
  ledger_row_count: number;
  replayable_row_count: number;
  collector_observation_without_event_id_row_count: number;
  unsupported_unbacked_row_count: number;
}

export interface AccountabilityReplayAuditRow {
  entry_type: AccountabilityReplayLedgerEntry['entry_type'];
  entry_id: string;
  ts: string;
  basis_event_ids: string[];
  evidence_refs: string[];
  source_kinds: string[];
  correlation_ids: string[];
  actors: string[];
  participants: string[];
  provenance?: AccountabilityReplayLedgerEntry['provenance'];
  replayable: boolean;
  status: AccountabilityReplayAuditRowStatus;
  warning: string | null;
}

export interface AccountabilityReplayAuditSummary {
  counts: AccountabilityReplayAuditCounts;
  participants: string[];
  actors: string[];
  evidence_refs: string[];
  source_kinds: string[];
  correlation_ids: string[];
  rows: AccountabilityReplayAuditRow[];
}

const EMPTY_COUNTS: AccountabilityReplayAuditCounts = {
  ledger_row_count: 0,
  replayable_row_count: 0,
  collector_observation_without_event_id_row_count: 0,
  unsupported_unbacked_row_count: 0
};

function normalizeToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  return token.length > 0 ? token : null;
}

function pushToken(target: string[], value: unknown): void {
  const token = normalizeToken(value);
  if (token && !target.includes(token)) {
    target.push(token);
  }
}

function normalizeList(values: readonly unknown[] | null | undefined): string[] {
  const normalized: string[] = [];
  for (const value of values ?? []) {
    pushToken(normalized, value);
  }
  return normalized;
}

function normalizeSourceKinds(entry: AccountabilityReplayLedgerEntry): string[] {
  const sourceKinds: string[] = [];
  pushToken(sourceKinds, entry.source_kind);
  for (const value of entry.source_kinds ?? []) {
    pushToken(sourceKinds, value);
  }
  return sourceKinds;
}

function normalizeCorrelationIds(entry: AccountabilityReplayLedgerEntry): string[] {
  const correlationIds: string[] = [];
  pushToken(correlationIds, entry.correlation_id);
  for (const value of entry.correlation_ids ?? []) {
    pushToken(correlationIds, value);
  }
  return correlationIds;
}

function normalizeParticipants(entry: AccountabilityReplayLedgerEntry): string[] {
  const participants: string[] = [];
  pushToken(participants, entry.agent_id);
  return participants;
}

function normalizeActors(entry: AccountabilityReplayLedgerEntry): string[] {
  const actors: string[] = [];
  pushToken(actors, entry.actor_id);
  return actors;
}

function classifyRow(
  entry: AccountabilityReplayLedgerEntry,
  basisEventIds: string[]
): Pick<AccountabilityReplayAuditRow, 'replayable' | 'status' | 'warning'> {
  if (basisEventIds.length > 0) {
    return { replayable: true, status: 'replayable', warning: null };
  }

  if (entry.provenance === 'collector_observation_without_event_id') {
    return {
      replayable: false,
      status: 'collector_observation_without_event_id',
      warning: 'collector-observation/no replay anchor'
    };
  }

  return {
    replayable: false,
    status: 'unsupported_unbacked',
    warning: 'unsupported/unbacked'
  };
}

export function deriveAccountabilityReplayAudit(
  bundle: AccountabilityReplayBundle | null | undefined
): AccountabilityReplayAuditSummary {
  if (!bundle) {
    return {
      counts: { ...EMPTY_COUNTS },
      participants: [],
      actors: [],
      evidence_refs: [],
      source_kinds: [],
      correlation_ids: [],
      rows: []
    };
  }

  const participants = normalizeList(bundle.accountability.participant_agent_ids);
  const actors = normalizeList(bundle.accountability.actor_ids);
  const evidenceRefs = normalizeList(bundle.accountability.evidence_refs);
  const sourceKinds = normalizeList(Object.keys(bundle.accountability.source_kind_buckets));
  const correlationIds: string[] = [];

  const rows = bundle.ledger.map((entry): AccountabilityReplayAuditRow => {
    const basisEventIds = normalizeList(entry.basis_event_ids);
    const rowEvidenceRefs = normalizeList(entry.evidence_refs);
    const rowSourceKinds = normalizeSourceKinds(entry);
    const rowCorrelationIds = normalizeCorrelationIds(entry);
    const rowActors = normalizeActors(entry);
    const rowParticipants = normalizeParticipants(entry);
    const classification = classifyRow(entry, basisEventIds);

    for (const value of rowEvidenceRefs) pushToken(evidenceRefs, value);
    for (const value of rowSourceKinds) pushToken(sourceKinds, value);
    for (const value of rowCorrelationIds) pushToken(correlationIds, value);
    for (const value of rowActors) pushToken(actors, value);
    for (const value of rowParticipants) pushToken(participants, value);

    return {
      entry_type: entry.entry_type,
      entry_id: entry.entry_id,
      ts: entry.ts,
      basis_event_ids: basisEventIds,
      evidence_refs: rowEvidenceRefs,
      source_kinds: rowSourceKinds,
      correlation_ids: rowCorrelationIds,
      actors: rowActors,
      participants: rowParticipants,
      provenance: entry.provenance,
      ...classification
    };
  });

  const counts = rows.reduce(
    (acc, row) => {
      acc.ledger_row_count += 1;
      if (row.status === 'replayable') {
        acc.replayable_row_count += 1;
      } else if (row.status === 'collector_observation_without_event_id') {
        acc.collector_observation_without_event_id_row_count += 1;
      } else {
        acc.unsupported_unbacked_row_count += 1;
      }
      return acc;
    },
    { ...EMPTY_COUNTS }
  );

  return {
    counts,
    participants,
    actors,
    evidence_refs: evidenceRefs,
    source_kinds: sourceKinds,
    correlation_ids: correlationIds,
    rows
  };
}
