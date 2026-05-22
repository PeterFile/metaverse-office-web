import type {
  CollectorEvidenceCoverage,
  CollectorEvidenceCoverageSourceKind,
  CollectorSourceHealthProjection
} from '../types';
import { deriveCollectorEvidenceCoverageViewModel } from './evidenceCoverage';

export type SelectedAgentEvidenceGlanceInput = {
  selectedAgentId: string | null | undefined;
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
  evidenceCoverage,
  sourceHealth
}: SelectedAgentEvidenceGlanceInput): SelectedAgentEvidenceProofCapsule | null {
  const agentId = normalizeString(selectedAgentId);
  if (!agentId) {
    return null;
  }

  if (evidenceCoverage) {
    const row = deriveCollectorEvidenceCoverageViewModel(evidenceCoverage).rows.find(
      (candidate) => candidate.agent_id === agentId
    );
    if (!row) {
      return ['Proof capsule · 0 evidence refs · Sources unavailable', 'Coverage uncovered in loaded snapshot'];
    }
    if (row.status === 'uncovered_in_snapshot') {
      return ['Proof capsule · 0 evidence refs · Sources unavailable', 'Coverage uncovered in loaded snapshot'];
    }

    return [
      `Proof capsule · ${renderEvidenceRefCount(row.evidence_ref_count)} · Sources ${renderSourceKindSummary(row.source_kinds) ?? 'unavailable'}`,
      [
        `Coverage ${row.status === 'low_confidence_evidence' ? 'low confidence' : 'backed'}`,
        renderConfidence(row.confidence),
        `Latest evidence ${row.latest_evidence_at ?? 'unavailable'}`
      ].join(' · ')
    ];
  }

  const sourceHealthItem = sourceHealth?.agent_items.find((item) => item.agent_id === agentId);
  if (!sourceHealthItem) {
    return null;
  }

  return [
    `Proof capsule · ${renderEvidenceRefCount(sourceHealthItem.evidence_ref_count)} · Source-health snapshot`,
    `Coverage source-health only · Latest evidence ${sourceHealthItem.latest_evidence_at ?? 'unavailable'}`
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
  return `${count} evidence ${count === 1 ? 'ref' : 'refs'}`;
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
