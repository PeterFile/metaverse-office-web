import type { EvidenceRecord } from './types';

export interface SelectedAgentEvidenceLedgerItem {
  evidenceId: string;
  observedAt: string | null;
  collectedAt: string | null;
  agentId: string | null;
  sourceKind: string;
  evidenceRef: string;
  evidenceRole: string | null;
  sourceStatus: string | null;
  outputCandidate: boolean;
  collectorSnapshotId: string;
  correlationId: string | null;
  degradedReasons: string[];
}

export interface SelectedAgentEvidenceLedgerGroup {
  totalCount: number;
  overflowCount: number;
  items: SelectedAgentEvidenceLedgerItem[];
}

export interface SelectedAgentEvidenceLedgerModel {
  isEmpty: boolean;
  outputEvidence: SelectedAgentEvidenceLedgerGroup;
  nonOutputEvidence: SelectedAgentEvidenceLedgerGroup;
  degradedEvidence: SelectedAgentEvidenceLedgerGroup;
}

const DEGRADED_SOURCE_STATUSES = new Set(['degraded', 'missing', 'error']);

export function buildSelectedAgentEvidenceLedger(
  records: EvidenceRecord[],
  options: { maxItemsPerGroup?: number } = {}
): SelectedAgentEvidenceLedgerModel {
  const maxItemsPerGroup = Math.max(0, options.maxItemsPerGroup ?? 4);
  const outputEvidence: SelectedAgentEvidenceLedgerItem[] = [];
  const nonOutputEvidence: SelectedAgentEvidenceLedgerItem[] = [];
  const degradedEvidence: SelectedAgentEvidenceLedgerItem[] = [];

  for (const record of records) {
    if (isClassifiableEvidence(record)) {
      if (record.output_candidate) {
        outputEvidence.push(toLedgerItem(record));
      } else {
        nonOutputEvidence.push(toLedgerItem(record));
      }
    }

    if (isDegradedOrUnmapped(record)) {
      degradedEvidence.push(toLedgerItem(record));
    }
  }

  return {
    isEmpty: records.length === 0,
    outputEvidence: toBoundedGroup(outputEvidence, maxItemsPerGroup),
    nonOutputEvidence: toBoundedGroup(nonOutputEvidence, maxItemsPerGroup),
    degradedEvidence: toBoundedGroup(degradedEvidence, maxItemsPerGroup)
  };
}

function toLedgerItem(record: EvidenceRecord): SelectedAgentEvidenceLedgerItem {
  return {
    evidenceId: record.evidence_id,
    observedAt: record.observed_at,
    collectedAt: record.collected_at,
    agentId: record.agent_id,
    sourceKind: record.source_kind,
    evidenceRef: record.evidence_ref,
    evidenceRole: record.evidence_role,
    sourceStatus: record.source_status,
    outputCandidate: record.output_candidate,
    collectorSnapshotId: record.collector_snapshot_id,
    correlationId: record.correlation_id,
    degradedReasons: record.degraded_reasons
  };
}

function isClassifiableEvidence(record: EvidenceRecord): boolean {
  return record.evidence_role !== 'runtime_unmapped';
}

function isDegradedOrUnmapped(record: EvidenceRecord): boolean {
  return (
    record.evidence_role === 'runtime_unmapped' ||
    DEGRADED_SOURCE_STATUSES.has(record.source_status ?? '')
  );
}

function toBoundedGroup(
  items: SelectedAgentEvidenceLedgerItem[],
  maxItems: number
): SelectedAgentEvidenceLedgerGroup {
  return {
    totalCount: items.length,
    overflowCount: Math.max(0, items.length - maxItems),
    items: items.slice().sort(compareLedgerItemRecency).slice(0, maxItems)
  };
}

function compareLedgerItemRecency(
  left: SelectedAgentEvidenceLedgerItem,
  right: SelectedAgentEvidenceLedgerItem
): number {
  return getLedgerItemTime(right) - getLedgerItemTime(left);
}

function getLedgerItemTime(item: SelectedAgentEvidenceLedgerItem): number {
  const observedAt = Date.parse(item.observedAt ?? '');
  if (Number.isFinite(observedAt)) {
    return observedAt;
  }

  const collectedAt = Date.parse(item.collectedAt ?? '');
  return Number.isFinite(collectedAt) ? collectedAt : 0;
}
