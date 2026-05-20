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
}: SelectedAgentEvidenceGlanceInput): string | null {
  const agentId = normalizeString(selectedAgentId);
  if (!agentId) {
    return null;
  }

  if (evidenceCoverage) {
    const row = deriveCollectorEvidenceCoverageViewModel(evidenceCoverage).rows.find(
      (candidate) => candidate.agent_id === agentId
    );
    if (!row) {
      return 'Evidence · uncovered in snapshot';
    }
    if (row.status === 'uncovered_in_snapshot') {
      return 'Evidence · uncovered in snapshot';
    }

    return [
      'Evidence',
      renderEvidenceRefCount(row.evidence_ref_count),
      renderSourceKindSummary(row.source_kinds),
      row.status === 'low_confidence_evidence' ? 'low-confidence' : row.confidence,
      `latest ${row.latest_evidence_at ?? 'unavailable'}`
    ]
      .filter((part): part is string => Boolean(part))
      .join(' · ');
  }

  const sourceHealthItem = sourceHealth?.agent_items.find((item) => item.agent_id === agentId);
  if (!sourceHealthItem) {
    return null;
  }

  return [
    'Evidence',
    renderEvidenceRefCount(sourceHealthItem.evidence_ref_count),
    'source health',
    `latest ${sourceHealthItem.latest_evidence_at ?? 'unavailable'}`
  ].join(' · ');
}

function normalizeString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function renderEvidenceRefCount(count: number) {
  return `${count} ${count === 1 ? 'ref' : 'refs'}`;
}

function renderSourceKindSummary(sourceKinds: CollectorEvidenceCoverageSourceKind[]) {
  const labels = Array.from(
    new Set(sourceKinds.map((sourceKind) => SOURCE_KIND_LABELS[sourceKind]).filter(Boolean))
  );
  return labels.length > 0 ? labels.join(' + ') : null;
}
