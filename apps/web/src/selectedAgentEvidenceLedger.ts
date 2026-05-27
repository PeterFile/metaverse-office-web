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

export interface SelectedAgentEvidenceLedgerSourceRefGroup {
  sourceKind: string;
  evidenceRole: string | null;
  sourceStatus: string | null;
  evidenceRef: string;
  totalCount: number;
}

export interface SelectedAgentEvidenceLedgerSourceContextGroup {
  sourceKind: string;
  evidenceRole: string | null;
  sourceStatus: string | null;
  mapped: boolean;
  observedAt: string | null;
  collectedAt: string | null;
  totalCount: number;
}

export interface SelectedAgentEvidenceLedgerModel {
  isEmpty: boolean;
  requestScopeLabel: string;
  outputEvidence: SelectedAgentEvidenceLedgerGroup;
  nonOutputEvidence: SelectedAgentEvidenceLedgerGroup;
  degradedEvidence: SelectedAgentEvidenceLedgerGroup;
  unmappedEvidence: SelectedAgentEvidenceLedgerGroup;
  sourceContextGroups: SelectedAgentEvidenceLedgerSourceContextGroup[];
  sourceRefGroups: SelectedAgentEvidenceLedgerSourceRefGroup[];
}

const DEGRADED_SOURCE_STATUSES = new Set(['degraded', 'missing', 'error']);
const DEFAULT_REQUEST_SCOPE_LABEL = 'Selected-agent evidence records';

type IndexedLedgerItem = {
  item: SelectedAgentEvidenceLedgerItem;
  sourceOrder: number;
};

export function buildSelectedAgentEvidenceLedger(
  records: EvidenceRecord[],
  options: { maxItemsPerGroup?: number; maxSourceRefGroups?: number; requestScopeLabel?: string } = {}
): SelectedAgentEvidenceLedgerModel {
  const maxItemsPerGroup = Math.max(0, options.maxItemsPerGroup ?? 4);
  const maxSourceRefGroups = Math.max(0, options.maxSourceRefGroups ?? 4);
  const requestScopeLabel = options.requestScopeLabel?.trim() || DEFAULT_REQUEST_SCOPE_LABEL;
  const outputEvidence: IndexedLedgerItem[] = [];
  const nonOutputEvidence: IndexedLedgerItem[] = [];
  const degradedEvidence: IndexedLedgerItem[] = [];
  const unmappedEvidence: IndexedLedgerItem[] = [];

  records.forEach((record, sourceOrder) => {
    const item = { item: toLedgerItem(record), sourceOrder };
    if (isClassifiableEvidence(record)) {
      if (record.output_candidate) {
        outputEvidence.push(item);
      } else {
        nonOutputEvidence.push(item);
      }
    }

    if (isDegraded(record)) {
      degradedEvidence.push(item);
    }

    if (isUnmapped(record)) {
      unmappedEvidence.push(item);
    }
  });

  return {
    isEmpty: records.length === 0,
    requestScopeLabel,
    outputEvidence: toBoundedGroup(outputEvidence, maxItemsPerGroup),
    nonOutputEvidence: toBoundedGroup(nonOutputEvidence, maxItemsPerGroup),
    degradedEvidence: toBoundedGroup(degradedEvidence, maxItemsPerGroup),
    unmappedEvidence: toBoundedGroup(unmappedEvidence, maxItemsPerGroup),
    sourceContextGroups: toSourceContextGroups(records, maxSourceRefGroups),
    sourceRefGroups: toSourceRefGroups(records, maxSourceRefGroups)
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

function isDegraded(record: EvidenceRecord): boolean {
  return DEGRADED_SOURCE_STATUSES.has(record.source_status ?? '');
}

function isUnmapped(record: EvidenceRecord): boolean {
  return record.evidence_role === 'runtime_unmapped';
}

function toBoundedGroup(
  items: IndexedLedgerItem[],
  maxItems: number
): SelectedAgentEvidenceLedgerGroup {
  return {
    totalCount: items.length,
    overflowCount: Math.max(0, items.length - maxItems),
    items: items
      .slice()
      .sort(compareLedgerItemRecency)
      .slice(0, maxItems)
      .map((item) => cloneLedgerItem(item.item))
  };
}

function cloneLedgerItem(
  item: SelectedAgentEvidenceLedgerItem
): SelectedAgentEvidenceLedgerItem {
  return {
    ...item,
    degradedReasons: [...item.degradedReasons]
  };
}

export function selectSelectedAgentEvidenceLedgerSourceContextGroups(
  model: SelectedAgentEvidenceLedgerModel,
  maxGroups = 4
): SelectedAgentEvidenceLedgerSourceContextGroup[] {
  return model.sourceContextGroups.slice(0, Math.max(0, maxGroups));
}

function toSourceContextGroups(
  records: EvidenceRecord[],
  maxGroups: number
): SelectedAgentEvidenceLedgerSourceContextGroup[] {
  const groupsByKey = new Map<
    string,
    SelectedAgentEvidenceLedgerSourceContextGroup & { latestTime: number; firstSourceOrder: number }
  >();
  const seenEvidenceIds = new Set<string>();

  records.forEach((record, sourceOrder) => {
    if (seenEvidenceIds.has(record.evidence_id)) {
      return;
    }
    seenEvidenceIds.add(record.evidence_id);

    const item = toLedgerItem(record);
    const mapped = item.agentId !== null && item.evidenceRole !== 'runtime_unmapped';
    const key = JSON.stringify([item.sourceKind, item.evidenceRole, item.sourceStatus, mapped]);
    const latestTime = getLedgerItemTime(item);
    const existing = groupsByKey.get(key);

    if (existing) {
      existing.totalCount += 1;
      existing.latestTime = Math.max(existing.latestTime, latestTime);
      existing.observedAt = maxTimestamp(existing.observedAt, item.observedAt);
      existing.collectedAt = maxTimestamp(existing.collectedAt, item.collectedAt);
      return;
    }

    groupsByKey.set(key, {
      sourceKind: item.sourceKind,
      evidenceRole: item.evidenceRole,
      sourceStatus: item.sourceStatus,
      mapped,
      observedAt: item.observedAt,
      collectedAt: item.collectedAt,
      totalCount: 1,
      latestTime,
      firstSourceOrder: sourceOrder
    });
  });

  return [...groupsByKey.values()]
    .sort((left, right) => {
      const count = right.totalCount - left.totalCount;
      if (count !== 0) {
        return count;
      }

      const recency = right.latestTime - left.latestTime;
      return recency !== 0 ? recency : left.firstSourceOrder - right.firstSourceOrder;
    })
    .slice(0, maxGroups)
    .map(({ latestTime: _latestTime, firstSourceOrder: _firstSourceOrder, ...group }) => group);
}

function maxTimestamp(left: string | null, right: string | null): string | null {
  const leftTime = Date.parse(left ?? '');
  const rightTime = Date.parse(right ?? '');

  if (!Number.isFinite(leftTime)) {
    return right;
  }

  if (!Number.isFinite(rightTime)) {
    return left;
  }

  return rightTime > leftTime ? right : left;
}

function compareLedgerItemRecency(
  left: IndexedLedgerItem,
  right: IndexedLedgerItem
): number {
  const recency = getLedgerItemTime(right.item) - getLedgerItemTime(left.item);
  return recency !== 0 ? recency : left.sourceOrder - right.sourceOrder;
}

function getLedgerItemTime(item: SelectedAgentEvidenceLedgerItem): number {
  const observedAt = Date.parse(item.observedAt ?? '');
  if (Number.isFinite(observedAt)) {
    return observedAt;
  }

  const collectedAt = Date.parse(item.collectedAt ?? '');
  return Number.isFinite(collectedAt) ? collectedAt : 0;
}

function toSourceRefGroups(
  records: EvidenceRecord[],
  maxGroups: number
): SelectedAgentEvidenceLedgerSourceRefGroup[] {
  const groupsByKey = new Map<
    string,
    SelectedAgentEvidenceLedgerSourceRefGroup & { firstSourceOrder: number; latestTime: number }
  >();

  records.forEach((record, sourceOrder) => {
    const sourceKind = record.source_kind;
    const evidenceRole = record.evidence_role;
    const sourceStatus = record.source_status;
    const evidenceRef = record.evidence_ref;
    const key = JSON.stringify([sourceKind, evidenceRole, sourceStatus, evidenceRef]);
    const existing = groupsByKey.get(key);
    const latestTime = getLedgerItemTime(toLedgerItem(record));

    if (existing) {
      existing.totalCount += 1;
      existing.latestTime = Math.max(existing.latestTime, latestTime);
      return;
    }

    groupsByKey.set(key, {
      sourceKind,
      evidenceRole,
      sourceStatus,
      evidenceRef,
      totalCount: 1,
      firstSourceOrder: sourceOrder,
      latestTime
    });
  });

  return [...groupsByKey.values()]
    .sort((left, right) => {
      const count = right.totalCount - left.totalCount;
      if (count !== 0) {
        return count;
      }

      const recency = right.latestTime - left.latestTime;
      return recency !== 0 ? recency : left.firstSourceOrder - right.firstSourceOrder;
    })
    .slice(0, maxGroups)
    .map((group) => ({
      sourceKind: group.sourceKind,
      evidenceRole: group.evidenceRole,
      sourceStatus: group.sourceStatus,
      evidenceRef: group.evidenceRef,
      totalCount: group.totalCount
    }));
}
