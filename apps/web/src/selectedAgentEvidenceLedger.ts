import type { EvidenceRecord, EvidenceRefRollup } from './types';

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

export interface SelectedAgentEvidenceProofCompassBucket {
  key: string;
  count: number;
}

export interface SelectedAgentEvidenceProofCompassRow {
  groupKey: string;
  label: string;
  recordCount: number;
  mappedCount: number;
  unmappedCount: number;
  sourceKindBuckets: SelectedAgentEvidenceProofCompassBucket[];
  sourceStatusBuckets: SelectedAgentEvidenceProofCompassBucket[];
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
const DEFAULT_PROOF_COMPASS_GROUP_LABEL = 'Evidence ref group';
const SAFE_PROOF_COMPASS_KEY_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;
const UNSAFE_PROOF_COMPASS_TEXT_PATTERN =
  /(?:^|[^A-Za-z0-9])(?:\/[^\s"'`]+|~\/|[A-Za-z]:[\\/])|(?:tmux|hermes|session|profile|file|https?):\/\/|(?:token|webhook|secret|payload|control-plane)/i;
const PROOF_COMPASS_SOURCE_KINDS = new Set([
  'workspace_root',
  'workspace_file',
  'tmux_observation',
  'hermes_profile',
  'hermes_session',
  'kanban_fixture',
  'linear_fixture',
  'slack_fixture',
  'task_fixture'
]);
const PROOF_COMPASS_SOURCE_STATUSES = new Set(['observed', 'degraded', 'missing', 'error']);

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

export function buildSelectedAgentEvidenceProofCompassRows(
  rollup: EvidenceRefRollup | null | undefined,
  options: { maxRows?: number; maxBucketsPerRow?: number } = {}
): SelectedAgentEvidenceProofCompassRow[] {
  const maxRows = Math.max(0, options.maxRows ?? 4);
  const maxBucketsPerRow = Math.max(0, options.maxBucketsPerRow ?? 3);

  return (rollup?.groups ?? []).slice(0, maxRows).map((group, index) => ({
    groupKey: toSafeProofCompassGroupKey(group.evidence_ref_key, index),
    label: toSafeProofCompassGroupLabel(group.evidence_ref_label),
    recordCount: toSafeProofCompassCount(group.record_count),
    mappedCount: toSafeProofCompassCount(group.mapped_count),
    unmappedCount: toSafeProofCompassCount(group.unmapped_count),
    sourceKindBuckets: toSafeProofCompassBuckets(
      group.source_kind_buckets,
      PROOF_COMPASS_SOURCE_KINDS,
      maxBucketsPerRow
    ),
    sourceStatusBuckets: toSafeProofCompassBuckets(
      group.source_status_buckets,
      PROOF_COMPASS_SOURCE_STATUSES,
      maxBucketsPerRow
    )
  }));
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

function toSafeProofCompassGroupKey(value: string, index: number): string {
  const normalized = value.trim();
  if (
    normalized.length > 0 &&
    SAFE_PROOF_COMPASS_KEY_PATTERN.test(normalized) &&
    !UNSAFE_PROOF_COMPASS_TEXT_PATTERN.test(normalized)
  ) {
    return normalized;
  }

  return `ref_group_${index + 1}`;
}

function toSafeProofCompassGroupLabel(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0 || UNSAFE_PROOF_COMPASS_TEXT_PATTERN.test(normalized)) {
    return DEFAULT_PROOF_COMPASS_GROUP_LABEL;
  }

  return normalized.length <= 80 ? normalized : `${normalized.slice(0, 77)}...`;
}

function toSafeProofCompassBuckets(
  buckets: Record<string, number>,
  allowedKeys: Set<string>,
  maxBuckets: number
): SelectedAgentEvidenceProofCompassBucket[] {
  return Object.entries(buckets)
    .filter(([key, count]) => allowedKeys.has(key) && toSafeProofCompassCount(count) > 0)
    .sort(([leftKey, leftCount], [rightKey, rightCount]) => {
      const count = toSafeProofCompassCount(rightCount) - toSafeProofCompassCount(leftCount);
      return count !== 0 ? count : leftKey.localeCompare(rightKey);
    })
    .slice(0, maxBuckets)
    .map(([key, count]) => ({
      key,
      count: toSafeProofCompassCount(count)
    }));
}

function toSafeProofCompassCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
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
    SelectedAgentEvidenceLedgerSourceRefGroup & {
      firstSourceOrder: number;
      latestTime: number;
      evidenceRefs: Set<string>;
    }
  >();

  records.forEach((record, sourceOrder) => {
    const evidenceRef = record.evidence_ref.trim();
    if (evidenceRef.length === 0) {
      return;
    }

    const sourceKind = record.source_kind;
    const evidenceRole = record.evidence_role;
    const sourceStatus = record.source_status;
    const key = JSON.stringify([sourceKind, evidenceRole, sourceStatus]);
    const existing = groupsByKey.get(key);
    const latestTime = getLedgerItemTime(toLedgerItem(record));

    if (existing) {
      existing.evidenceRefs.add(evidenceRef);
      existing.totalCount = existing.evidenceRefs.size;
      existing.latestTime = Math.max(existing.latestTime, latestTime);
      return;
    }

    groupsByKey.set(key, {
      sourceKind,
      evidenceRole,
      sourceStatus,
      totalCount: 1,
      firstSourceOrder: sourceOrder,
      latestTime,
      evidenceRefs: new Set([evidenceRef])
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
    .map(
      ({
        firstSourceOrder: _firstSourceOrder,
        latestTime: _latestTime,
        evidenceRefs: _evidenceRefs,
        ...group
      }) => group
    );
}
