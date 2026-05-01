import type {
  AccountabilityReplayBundle,
  AccountabilityReplayLedgerEntry,
  AccountabilityReplaySummary,
  WorkflowInteraction
} from '../types';

const COLLECTOR_SOURCE_LABELS: Record<string, string> = {
  controller_snapshot: 'Collector snapshot'
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNonEmptyString(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function formatCollectorSource(source: string | null) {
  if (!source) {
    return 'Collector snapshot';
  }

  const knownLabel = COLLECTOR_SOURCE_LABELS[source];
  if (knownLabel) {
    return knownLabel;
  }

  const normalized = source.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}` : 'Collector snapshot';
}

function formatSeverityLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}` : null;
}

function formatDerivedStaleness(metadata: Record<string, unknown>) {
  const derivedStaleness = metadata.derived_staleness;
  if (!isRecord(derivedStaleness)) {
    return null;
  }

  const severity = readNonEmptyString(derivedStaleness, 'severity');
  const severityLabel = severity ? formatSeverityLabel(severity) : null;
  return severityLabel ? `Staleness ${severityLabel}` : null;
}

function compactJoin(values: Array<string | null>) {
  return values.filter((value): value is string => value !== null).join(' · ');
}

function normalizeStringArray(values: readonly unknown[]) {
  const seenValues = new Set<string>();
  const normalizedValues: string[] = [];

  values.forEach((value) => {
    if (typeof value !== 'string') {
      return;
    }

    const normalizedValue = value.trim();
    if (normalizedValue.length === 0 || seenValues.has(normalizedValue)) {
      return;
    }

    seenValues.add(normalizedValue);
    normalizedValues.push(normalizedValue);
  });

  return normalizedValues;
}

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeSourceKindBuckets(sourceKindBuckets: Record<string, number>) {
  const normalizedBuckets = new Map<string, number>();

  Object.entries(sourceKindBuckets).forEach(([sourceKind, count]) => {
    const normalizedSourceKind = sourceKind.trim();
    if (normalizedSourceKind.length === 0) {
      return;
    }

    normalizedBuckets.set(
      normalizedSourceKind,
      (normalizedBuckets.get(normalizedSourceKind) ?? 0) + count
    );
  });

  return Object.fromEntries(
    Array.from(normalizedBuckets.entries()).sort(([leftSourceKind], [rightSourceKind]) =>
      leftSourceKind.localeCompare(rightSourceKind)
    )
  );
}

export type AccountabilityReplayLedgerRowStatus =
  | 'replayable'
  | 'observation_only_no_replay_anchor'
  | 'unsupported_unbacked';

export interface AccountabilityReplayLedgerRowViewModel {
  entry_type: AccountabilityReplayLedgerEntry['entry_type'];
  entry_id: string;
  ts: string;
  agent_id?: string;
  actor_id: string | null;
  source_kind: string | null;
  correlation_id: string | null;
  summary?: string | null;
  provenance?: AccountabilityReplayLedgerEntry['provenance'];
  basis_event_ids: string[];
  evidence_refs: string[];
  source_kinds: string[];
  correlation_ids: string[];
  replayable: boolean;
  status: AccountabilityReplayLedgerRowStatus;
  warning: string | null;
}

export interface AccountabilityReplayLedgerViewModel {
  basis: AccountabilityReplaySummary['basis'] | null;
  bounded_by: AccountabilityReplaySummary['bounded_by'] | null;
  counts: {
    event_count: number;
    interaction_count: number;
    artifact_count: number;
    ledger_row_count: number;
  };
  participants: string[];
  actors: string[];
  evidence_refs: string[];
  source_kind_buckets: Record<string, number>;
  first_ts: string | null;
  last_ts: string | null;
  ledger_rows: AccountabilityReplayLedgerRowViewModel[];
}

function createEmptyAccountabilityReplayLedgerViewModel(): AccountabilityReplayLedgerViewModel {
  return {
    basis: null,
    bounded_by: null,
    counts: {
      event_count: 0,
      interaction_count: 0,
      artifact_count: 0,
      ledger_row_count: 0
    },
    participants: [],
    actors: [],
    evidence_refs: [],
    source_kind_buckets: {},
    first_ts: null,
    last_ts: null,
    ledger_rows: []
  };
}

function deriveReplayLedgerRowStatus({
  provenance,
  basisEventIds
}: {
  provenance: AccountabilityReplayLedgerEntry['provenance'];
  basisEventIds: readonly string[];
}) {
  if (provenance === 'collector_observation_without_event_id') {
    return {
      replayable: false,
      status: 'observation_only_no_replay_anchor' as const,
      warning: 'observation-only/no replay anchor'
    };
  }

  if (basisEventIds.length === 0) {
    return {
      replayable: false,
      status: 'unsupported_unbacked' as const,
      warning: 'unsupported/unbacked: no basis event id'
    };
  }

  return {
    replayable: true,
    status: 'replayable' as const,
    warning: null
  };
}

function deriveAccountabilityReplayLedgerRowViewModel(
  entry: AccountabilityReplayLedgerEntry
): AccountabilityReplayLedgerRowViewModel {
  const basisEventIds = normalizeStringArray(entry.basis_event_ids);
  const status = deriveReplayLedgerRowStatus({
    provenance: entry.provenance,
    basisEventIds
  });
  const sourceKind = normalizeOptionalString(entry.source_kind);
  const correlationId = normalizeOptionalString(entry.correlation_id);

  return {
    entry_type: entry.entry_type,
    entry_id: entry.entry_id,
    ts: entry.ts,
    agent_id: normalizeOptionalString(entry.agent_id) ?? undefined,
    actor_id: normalizeOptionalString(entry.actor_id),
    source_kind: sourceKind,
    correlation_id: correlationId,
    summary: entry.summary,
    provenance: entry.provenance,
    basis_event_ids: basisEventIds,
    evidence_refs: normalizeStringArray(entry.evidence_refs),
    source_kinds: normalizeStringArray([sourceKind, ...(entry.source_kinds ?? [])]),
    correlation_ids: normalizeStringArray([correlationId, ...(entry.correlation_ids ?? [])]),
    ...status
  };
}

export function deriveAccountabilityReplayLedgerViewModel(
  bundle: AccountabilityReplayBundle | null | undefined
): AccountabilityReplayLedgerViewModel {
  if (!bundle) {
    return createEmptyAccountabilityReplayLedgerViewModel();
  }

  return {
    basis: bundle.accountability.basis,
    bounded_by: { ...bundle.accountability.bounded_by },
    counts: {
      event_count: bundle.accountability.event_count,
      interaction_count: bundle.accountability.interaction_count,
      artifact_count: bundle.accountability.artifact_count,
      ledger_row_count: bundle.ledger.length
    },
    participants: normalizeStringArray(bundle.accountability.participant_agent_ids),
    actors: normalizeStringArray(bundle.accountability.actor_ids),
    evidence_refs: normalizeStringArray(bundle.accountability.evidence_refs),
    source_kind_buckets: normalizeSourceKindBuckets(bundle.accountability.source_kind_buckets),
    first_ts: bundle.accountability.first_ts,
    last_ts: bundle.accountability.last_ts,
    ledger_rows: bundle.ledger.map(deriveAccountabilityReplayLedgerRowViewModel)
  };
}

export function collectInteractionSourceKinds({
  workflowInteractions = [],
  correlationInteractions = []
}: {
  workflowInteractions?: readonly WorkflowInteraction[];
  correlationInteractions?: readonly WorkflowInteraction[];
}) {
  return [...workflowInteractions, ...correlationInteractions].flatMap((interaction) =>
    typeof interaction.source_kind === 'string' && interaction.source_kind.trim().length > 0
      ? [interaction.source_kind]
      : []
  );
}

export function formatCollectorDerivedPeerWatchMetadata(metadata: unknown): readonly string[] | null {
  if (!isRecord(metadata)) {
    return null;
  }

  const collectorSource = readNonEmptyString(metadata, 'collector_source');
  if (metadata.collector_derived !== true && collectorSource === null) {
    return null;
  }

  const alertFamily = readNonEmptyString(metadata, 'collector_alert_family');
  const collectedAt = readNonEmptyString(metadata, 'collected_at');
  const lastMeaningfulOutputAt = readNonEmptyString(metadata, 'last_meaningful_output_at');
  const currentBlocker = readNonEmptyString(metadata, 'current_blocker');
  const collectorAlertSignature = readNonEmptyString(metadata, 'collector_alert_signature');
  const provenanceLine = compactJoin([
    'Provenance',
    formatCollectorSource(collectorSource),
    alertFamily,
    collectedAt ? `collected ${collectedAt}` : null
  ]);
  const basisLine = compactJoin([
    'Basis',
    lastMeaningfulOutputAt ? `Last output ${lastMeaningfulOutputAt}` : null,
    formatDerivedStaleness(metadata),
    currentBlocker ? `Blocker ${currentBlocker}` : null,
    metadata.reboot_recommended === true ? 'Reboot Recommended' : null,
    collectorAlertSignature ? `Signature ${collectorAlertSignature}` : null
  ]);

  return basisLine === 'Basis' ? [provenanceLine] : [provenanceLine, basisLine];
}
