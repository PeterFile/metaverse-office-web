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
  workspace_file: 'workspace',
  workspace_root: 'workspace',
  tmux_observation: 'tmux',
  hermes_profile: 'Hermes',
  hermes_session: 'Hermes'
};

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
      return ['Proof glance · 0 records · Sources unavailable', 'Coverage gap · loaded snapshot has no row'];
    }
    if (row.status === 'uncovered_in_snapshot') {
      return ['Proof glance · 0 records · Sources unavailable', 'Coverage gap · uncovered in loaded snapshot'];
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
    `Proof glance · ${renderEvidenceRefCount(sourceHealthItem.evidence_ref_count)} · Source-health snapshot`,
    `Coverage source-health only · Latest observed ${sourceHealthItem.latest_evidence_at ?? 'unavailable'}`
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
      `Roles ${renderBucketSummary(row.evidence_role_buckets, renderBucketLabel)}`,
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
  const parts = Object.entries(buckets)
    .filter(([, count]) => count > 0)
    .sort(([leftKey, leftCount], [rightKey, rightCount]) => rightCount - leftCount || leftKey.localeCompare(rightKey))
    .slice(0, 3)
    .map(([key, count]) => `${renderKey(key)} ${count}`);

  return parts.length > 0 ? parts.join(', ') : 'unavailable';
}

function renderSourceKindLabel(sourceKind: string) {
  if (sourceKind === 'workspace_file' || sourceKind === 'workspace_root') {
    return 'workspace';
  }
  if (sourceKind === 'tmux_observation') {
    return 'tmux';
  }
  if (sourceKind === 'hermes_profile' || sourceKind === 'hermes_session') {
    return 'Hermes';
  }
  return renderBucketLabel(sourceKind);
}

function renderBucketLabel(value: string) {
  return value.replace(/_/g, ' ');
}
