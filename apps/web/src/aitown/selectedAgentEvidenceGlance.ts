import type {
  AgentEvidenceSpineSummary,
  AgentEvidenceSpineSummaryAgent,
  CollectorEvidenceCoverage,
  CollectorEvidenceCoverageSourceKind,
  CollectorSourceHealthProjection
} from '../types';
import { deriveCollectorEvidenceCoverageViewModel } from './evidenceCoverage';

export type SelectedAgentEvidenceGlanceInput = {
  selectedAgentId: string | null | undefined;
  evidenceSpineSummary?: AgentEvidenceSpineSummary | null | undefined;
  evidenceCoverage: CollectorEvidenceCoverage | null | undefined;
  sourceHealth: CollectorSourceHealthProjection | null | undefined;
};

export type SelectedAgentEvidenceProofCapsule = [string] | [string, string];

const SOURCE_KIND_LABELS: Record<CollectorEvidenceCoverageSourceKind, string> = {
  workspace_file: 'Workspace evidence',
  workspace_root: 'Workspace evidence',
  tmux_observation: 'Runtime evidence',
  hermes_profile: 'Runtime evidence',
  hermes_session: 'Runtime evidence'
};
const SAFE_SOURCE_KIND_LABELS: Record<string, string> = {
  ...SOURCE_KIND_LABELS
};
const SAFE_EVIDENCE_ROLE_LABELS: Record<string, string> = {
  agent_output: 'agent output',
  agent_plan: 'agent plan',
  runtime_activity: 'runtime activity',
  runtime_presence: 'runtime presence',
  runtime_unmapped: 'runtime unmapped',
  source_evidence: 'source evidence',
  task_reference: 'task reference',
  workspace_presence: 'workspace presence'
};
const UNKNOWN_BUCKET_LABEL = 'Unknown';

export function deriveSelectedAgentEvidenceGlance({
  selectedAgentId,
  evidenceSpineSummary,
  evidenceCoverage,
  sourceHealth
}: SelectedAgentEvidenceGlanceInput): SelectedAgentEvidenceProofCapsule | null {
  const agentId = normalizeString(selectedAgentId);
  if (!agentId) {
    return null;
  }

  if (evidenceSpineSummary) {
    return deriveEvidenceSpineProofCapsule(evidenceSpineSummary, agentId);
  }

  if (evidenceCoverage) {
    const row = deriveCollectorEvidenceCoverageViewModel(evidenceCoverage).rows.find(
      (candidate) => candidate.agent_id === agentId
    );
    if (!row) {
      return ['Proof glance · 0 records · Sources unavailable', 'Coverage gap · selected-agent coverage unavailable'];
    }
    if (row.status === 'uncovered_in_snapshot') {
      return ['Proof glance · 0 records · Sources unavailable', 'Coverage gap · selected-agent evidence insufficient'];
    }

    return [
      `Proof glance · ${renderEvidenceRefCount(row.evidence_ref_count)} · Sources ${renderSourceKindSummary(row.source_kinds) ?? 'unavailable'}`,
      [
        `Coverage ${row.status === 'low_confidence_evidence' ? 'low confidence' : 'backed'}`,
        renderConfidence(row.confidence),
        `Latest observed ${row.latest_evidence_at ?? 'unavailable'}`
      ].join(' · ')
    ];
  }

  const sourceHealthItem = sourceHealth?.agent_items.find((item) => item.agent_id === agentId);
  if (!sourceHealthItem) {
    return null;
  }

  return [
    `Proof glance · ${renderEvidenceRefCount(sourceHealthItem.evidence_ref_count)} · Sources unavailable`,
    `Coverage limited summary · Latest observed ${sourceHealthItem.latest_evidence_at ?? 'unavailable'}`
  ];
}

function deriveEvidenceSpineProofCapsule(
  evidenceSpineSummary: AgentEvidenceSpineSummary,
  agentId: string
): SelectedAgentEvidenceProofCapsule {
  const row = evidenceSpineSummary.agents.find((candidate) => candidate.agent_id === agentId);
  if (!row) {
    return ['Proof glance · unavailable', 'Coverage gap · selected-agent summary unavailable'];
  }

  return [
    `Proof glance · ${renderRecordCount(row.evidence_count)} · Sources ${renderBucketSummary(row.source_kind_buckets, renderSourceKindLabel)}`,
    [
      `Coverage gap · ${renderSourceGapCount(row)}`,
      `Roles ${renderBucketSummary(row.evidence_role_buckets, renderEvidenceRoleLabel)}`,
      `Latest observed ${row.latest_observed_at ?? 'unavailable'}`
    ].join(' · ')
  ];
}

function normalizeString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function renderEvidenceRefCount(count: number) {
  return renderRecordCount(count);
}

function renderRecordCount(count: number) {
  return `${count} ${count === 1 ? 'record' : 'records'}`;
}

function renderSourceKindSummary(sourceKinds: CollectorEvidenceCoverageSourceKind[]) {
  const labels = Array.from(
    new Set(sourceKinds.map((sourceKind) => SOURCE_KIND_LABELS[sourceKind]).filter(Boolean))
  );
  return labels.length > 0 ? labels.join(' + ') : null;
}

function renderConfidence(confidence: string | null) {
  return confidence ? `Confidence ${confidence}` : 'Confidence unavailable';
}

function renderSourceGapCount(row: AgentEvidenceSpineSummaryAgent) {
  return Object.values(row.source_gap_buckets).reduce((sum, count) => sum + Math.max(0, count), 0);
}

function renderBucketSummary(
  buckets: Record<string, number>,
  renderKey: (key: string) => string
) {
  const projectedBuckets = Object.entries(buckets).reduce<Record<string, number>>((acc, [key, count]) => {
    if (count > 0) {
      const label = renderKey(key);
      acc[label] = (acc[label] ?? 0) + count;
    }
    return acc;
  }, {});
  const parts = Object.entries(projectedBuckets)
    .filter(([, count]) => count > 0)
    .sort(([leftKey, leftCount], [rightKey, rightCount]) => {
      const leftUnknown = leftKey === UNKNOWN_BUCKET_LABEL;
      const rightUnknown = rightKey === UNKNOWN_BUCKET_LABEL;
      if (leftUnknown !== rightUnknown) {
        return leftUnknown ? 1 : -1;
      }
      return rightCount - leftCount || leftKey.localeCompare(rightKey);
    })
    .slice(0, 3)
    .map(([key, count]) => `${key} ${count}`);

  return parts.length > 0 ? parts.join(', ') : 'unavailable';
}

function renderSourceKindLabel(sourceKind: string) {
  return SAFE_SOURCE_KIND_LABELS[sourceKind] ?? UNKNOWN_BUCKET_LABEL;
}

function renderEvidenceRoleLabel(evidenceRole: string) {
  return SAFE_EVIDENCE_ROLE_LABELS[evidenceRole] ?? UNKNOWN_BUCKET_LABEL;
}
