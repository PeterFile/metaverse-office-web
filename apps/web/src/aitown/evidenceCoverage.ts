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

type CoverageItemWithRefs = CollectorEvidenceCoverageAgentItem & {
  evidence_refs?: unknown;
};

const SOURCE_KIND_ORDER: CollectorEvidenceCoverageSourceKind[] = [
  'tmux_observation',
  'workspace_file',
  'workspace_root'
];

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
    const hasEvidence = evidenceRefs.length > 0;
    const sourceKinds = hasEvidence ? normalizeSourceKinds(item?.source_kinds) : [];
    const confidence = hasEvidence ? (item?.confidence_level ?? null) : null;
    const latestEvidenceAt = hasEvidence ? (normalizeString(item?.latest_evidence_at) ?? null) : null;
    const isLowConfidence = hasEvidence && (lowConfidenceIds.has(agentId) || confidence !== 'high');

    return {
      agent_id: agentId,
      display_name: buildDisplayName(agentId, overviewById.get(agentId) ?? null),
      evidence_refs: evidenceRefs,
      evidence_ref_count: evidenceRefs.length,
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
