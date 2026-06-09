import type {
  CollectorEvidenceCoverage,
  CollectorEvidenceCoverageAgentItem,
  CollectorEvidenceCoverageSourceKind
} from '../types';

export type CollectorEvidenceCoverageViewStatus = 'coverage_available' | 'coverage_unavailable';

export type CollectorEvidenceCoverageRowStatus =
  | 'evidence_backed'
  | 'low_confidence_evidence'
  | 'uncovered_in_snapshot';

export interface CollectorEvidenceCoverageOverviewAgent {
  agent_id: string;
  display_name?: string | null;
}

export interface CollectorEvidenceCoverageSourceKindBucket {
  source_kind: CollectorEvidenceCoverageSourceKind;
  count: number;
}

export interface CollectorEvidenceCoverageRow {
  agent_id: string;
  display_name: string;
  evidence_refs: string[];
  evidence_ref_count: number;
  source_kinds: CollectorEvidenceCoverageSourceKind[];
  latest_evidence_at: string | null;
  confidence: CollectorEvidenceCoverageAgentItem['confidence_level'];
  status: CollectorEvidenceCoverageRowStatus;
  warning: string | null;
}

export interface CollectorEvidenceCoverageViewModel {
  status: CollectorEvidenceCoverageViewStatus;
  collected_at: string | null;
  actor_id: string | null;
  counts: {
    covered_agent_count: number;
    uncovered_agent_count: number;
    low_confidence_agent_count: number;
    evidence_ref_count: number;
  };
  source_kind_buckets: CollectorEvidenceCoverageSourceKindBucket[];
  rows: CollectorEvidenceCoverageRow[];
}

export type CollectorEvidenceCoverageFocusItem = Pick<
  CollectorEvidenceCoverageRow,
  | 'agent_id'
  | 'display_name'
  | 'evidence_ref_count'
  | 'source_kinds'
  | 'latest_evidence_at'
  | 'status'
  | 'warning'
>;

export type CollectorEvidenceCoverageFocusSummaryItem = Omit<CollectorEvidenceCoverageFocusItem, 'source_kinds'> & {
  source_labels: string[];
};

export interface CollectorEvidenceCoverageFocusSummary {
  visibleItems: CollectorEvidenceCoverageFocusSummaryItem[];
  totalGapCount: number;
  overflowCount: number;
}

type CoverageItemWithRefs = CollectorEvidenceCoverageAgentItem & {
  evidence_refs?: unknown;
};

const SOURCE_KIND_ORDER: CollectorEvidenceCoverageSourceKind[] = [
  'tmux_observation',
  'workspace_file',
  'workspace_root',
  'hermes_profile',
  'hermes_session'
];

const SOURCE_KIND_FOCUS_LABELS: Record<CollectorEvidenceCoverageSourceKind, string> = {
  tmux_observation: 'Runtime evidence',
  workspace_file: 'Local evidence',
  workspace_root: 'Local evidence',
  hermes_profile: 'Runtime evidence',
  hermes_session: 'Runtime evidence'
};

const EMPTY_MODEL: CollectorEvidenceCoverageViewModel = {
  status: 'coverage_unavailable',
  collected_at: null,
  actor_id: null,
  counts: {
    covered_agent_count: 0,
    uncovered_agent_count: 0,
    low_confidence_agent_count: 0,
    evidence_ref_count: 0
  },
  source_kind_buckets: [],
  rows: []
};

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function uniqueSortedStrings(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(values.map(normalizeString).filter((value): value is string => value !== null))
  ).sort((left, right) => left.localeCompare(right));
}

function isCoverageSourceKind(value: string): value is CollectorEvidenceCoverageSourceKind {
  return SOURCE_KIND_ORDER.includes(value as CollectorEvidenceCoverageSourceKind);
}

function normalizeSourceKinds(values: unknown): CollectorEvidenceCoverageSourceKind[] {
  return uniqueSortedStrings(values).filter(isCoverageSourceKind);
}

function normalizeLowConfidenceIds(values: unknown): string[] {
  return uniqueSortedStrings(values);
}

function normalizeEvidenceRefCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function buildDisplayName(agentId: string, overviewName: string | null): string {
  return overviewName ?? agentId;
}

export function deriveCollectorEvidenceCoverageViewModel(
  coverage: CollectorEvidenceCoverage | null | undefined,
  overviewAgents: CollectorEvidenceCoverageOverviewAgent[] = []
): CollectorEvidenceCoverageViewModel {
  if (!coverage) {
    return {
      ...EMPTY_MODEL,
      counts: { ...EMPTY_MODEL.counts },
      source_kind_buckets: [],
      rows: []
    };
  }

  const overviewById = new Map<string, string | null>();
  for (const agent of overviewAgents) {
    const agentId = normalizeString(agent.agent_id);
    if (!agentId || overviewById.has(agentId)) {
      continue;
    }
    overviewById.set(agentId, normalizeString(agent.display_name));
  }

  const itemsById = new Map<string, CoverageItemWithRefs>();
  for (const item of coverage.agent_items ?? []) {
    const agentId = normalizeString(item.agent_id);
    if (!agentId || itemsById.has(agentId)) {
      continue;
    }
    itemsById.set(agentId, item as CoverageItemWithRefs);
  }

  const lowConfidenceIds = new Set(normalizeLowConfidenceIds(coverage.low_confidence_agent_ids));
  const agentIds = Array.from(new Set([...itemsById.keys(), ...overviewById.keys()])).sort((left, right) =>
    left.localeCompare(right)
  );

  const rows = agentIds.map((agentId) => {
    const item = itemsById.get(agentId);
    const evidenceRefs = uniqueSortedStrings(item?.evidence_refs);
    const evidenceRefCount = normalizeEvidenceRefCount(item?.evidence_ref_count);
    const hasEvidence = evidenceRefCount > 0;
    const sourceKinds = hasEvidence ? normalizeSourceKinds(item?.source_kinds) : [];
    const confidence = hasEvidence ? (item?.confidence_level ?? null) : null;
    const latestEvidenceAt = hasEvidence ? (normalizeString(item?.latest_evidence_at) ?? null) : null;
    const isLowConfidence = hasEvidence && (lowConfidenceIds.has(agentId) || confidence !== 'high');

    return {
      agent_id: agentId,
      display_name: buildDisplayName(agentId, overviewById.get(agentId) ?? null),
      evidence_refs: evidenceRefs,
      evidence_ref_count: evidenceRefCount,
      source_kinds: sourceKinds,
      latest_evidence_at: latestEvidenceAt,
      confidence,
      status: hasEvidence
        ? isLowConfidence
          ? 'low_confidence_evidence'
          : 'evidence_backed'
        : 'uncovered_in_snapshot',
      warning: hasEvidence && isLowConfidence ? 'low-confidence evidence coverage' : null
    } satisfies CollectorEvidenceCoverageRow;
  });

  const buckets = Object.entries(coverage.source_kind_buckets ?? {})
    .flatMap(([sourceKind, count]) => {
      const normalizedSourceKind = normalizeString(sourceKind);
      if (!normalizedSourceKind || !isCoverageSourceKind(normalizedSourceKind)) {
        return [];
      }
      return [{ source_kind: normalizedSourceKind, count: typeof count === 'number' ? count : 0 }];
    })
    .sort((left, right) => right.count - left.count || left.source_kind.localeCompare(right.source_kind));

  return {
    status: 'coverage_available',
    collected_at: normalizeString(coverage.collected_at) ?? null,
    actor_id: normalizeString(coverage.actor_id) ?? null,
    counts: {
      covered_agent_count: Math.max(0, coverage.covered_agent_count ?? 0),
      uncovered_agent_count: rows.filter((row) => row.status === 'uncovered_in_snapshot').length,
      low_confidence_agent_count: lowConfidenceIds.size,
      evidence_ref_count: Math.max(0, coverage.evidence_ref_count ?? 0)
    },
    source_kind_buckets: buckets,
    rows
  };
}

function deriveCollectorEvidenceCoverageGapItems(
  coverage: CollectorEvidenceCoverage | null | undefined,
  overviewAgents: CollectorEvidenceCoverageOverviewAgent[] = []
): CollectorEvidenceCoverageFocusItem[] {
  if (overviewAgents.length === 0) {
    return [];
  }

  const overviewAgentIds = new Set(
    overviewAgents
      .map((agent) => normalizeString(agent.agent_id))
      .filter((agentId): agentId is string => agentId !== null)
  );
  if (overviewAgentIds.size === 0) {
    return [];
  }

  return deriveCollectorEvidenceCoverageViewModel(coverage, overviewAgents)
    .rows.filter((row) => overviewAgentIds.has(row.agent_id) && row.status !== 'evidence_backed')
    .sort((left, right) => {
      const leftPriority = left.status === 'low_confidence_evidence' ? 0 : 1;
      const rightPriority = right.status === 'low_confidence_evidence' ? 0 : 1;
      return leftPriority - rightPriority || left.display_name.localeCompare(right.display_name);
    })
    .map((row) => ({
      agent_id: row.agent_id,
      display_name: row.display_name,
      evidence_ref_count: row.evidence_ref_count,
      source_kinds: [...row.source_kinds],
      latest_evidence_at: row.latest_evidence_at,
      status: row.status,
      warning: row.warning
    }));
}

function renderCollectorEvidenceCoverageFocusSourceLabels(sourceKinds: CollectorEvidenceCoverageSourceKind[]) {
  return Array.from(new Set(sourceKinds.map((sourceKind) => SOURCE_KIND_FOCUS_LABELS[sourceKind]).filter(Boolean)));
}

export function deriveCollectorEvidenceCoverageFocusSummary(
  coverage: CollectorEvidenceCoverage | null | undefined,
  overviewAgents: CollectorEvidenceCoverageOverviewAgent[] = [],
  limit = 3
): CollectorEvidenceCoverageFocusSummary {
  const gapItems = deriveCollectorEvidenceCoverageGapItems(coverage, overviewAgents);
  const visibleLimit = Math.max(0, limit);

  return {
    visibleItems: gapItems.slice(0, visibleLimit).map(({ source_kinds: sourceKinds, ...item }) => ({
      ...item,
      source_labels: renderCollectorEvidenceCoverageFocusSourceLabels(sourceKinds)
    })),
    totalGapCount: gapItems.length,
    overflowCount: Math.max(0, gapItems.length - visibleLimit)
  };
}

export function deriveCollectorEvidenceCoverageFocusItems(
  coverage: CollectorEvidenceCoverage | null | undefined,
  overviewAgents: CollectorEvidenceCoverageOverviewAgent[] = [],
  limit = 3
): CollectorEvidenceCoverageFocusItem[] {
  if (limit <= 0) {
    return [];
  }
  return deriveCollectorEvidenceCoverageGapItems(coverage, overviewAgents).slice(0, limit);
}
