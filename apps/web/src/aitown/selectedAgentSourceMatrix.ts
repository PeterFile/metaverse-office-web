import type { AgentEvidenceSourceMatrix, AgentEvidenceSourceMatrixRow } from '../types';
import {
  formatEvidenceRoleLabel,
  formatEvidenceSourceKindLabel,
  formatEvidenceSourceStatusLabel
} from '../evidenceEnumLabels';

export type SelectedAgentSourceMatrixLoadState = 'idle' | 'loading' | 'ready' | 'error';
export type SelectedAgentSourceMatrixStatus = 'loading' | 'error' | 'empty' | 'ready' | 'last-good';

export type SelectedAgentSourceMatrixDisplayRow = {
  source: string;
  status: string;
  role: string;
  output: string;
  count: number;
  latest_at: string | null;
};

export type SelectedAgentSourceMatrixUnmappedSummary = {
  totalCount: number;
  rows: SelectedAgentSourceMatrixDisplayRow[];
};

export type SelectedAgentSourceMatrixViewModel = {
  status: SelectedAgentSourceMatrixStatus;
  statusLabel: string;
  detailLabel: string;
  selectedAgentId: string | null;
  rows: SelectedAgentSourceMatrixDisplayRow[];
  unmappedSummary: SelectedAgentSourceMatrixUnmappedSummary;
};

export type SelectedAgentSourceMatrixOptions = {
  loadState?: SelectedAgentSourceMatrixLoadState;
  error?: string | null;
  maxRows?: number;
  maxUnmappedRows?: number;
};

const DEFAULT_MAX_ROWS = 5;
const DEFAULT_MAX_UNMAPPED_ROWS = 3;

export function deriveSelectedAgentSourceMatrixViewModel(
  matrix: AgentEvidenceSourceMatrix | null | undefined,
  selectedAgentId: string | null | undefined,
  options: SelectedAgentSourceMatrixOptions = {}
): SelectedAgentSourceMatrixViewModel {
  const agentId = normalizeString(selectedAgentId);
  const loadState = options.loadState ?? 'ready';
  const hasError = normalizeString(options.error) !== null;
  const maxRows = normalizeLimit(options.maxRows, DEFAULT_MAX_ROWS);
  const maxUnmappedRows = normalizeLimit(options.maxUnmappedRows, DEFAULT_MAX_UNMAPPED_ROWS);
  const unmappedSummary = deriveUnmappedSummary(matrix, maxUnmappedRows);

  if (!agentId) {
    return {
      status: 'empty',
      statusLabel: 'No selected agent',
      detailLabel: 'Select an agent to inspect source matrix rows.',
      selectedAgentId: agentId,
      rows: [],
      unmappedSummary
    };
  }

  if (!matrix) {
    if (loadState === 'loading' || loadState === 'idle') {
      return {
        status: 'loading',
        statusLabel: 'Source matrix · Loading',
        detailLabel: 'Waiting for selected-agent source matrix rows.',
        selectedAgentId: agentId,
        rows: [],
        unmappedSummary
      };
    }

    return {
      status: 'error',
      statusLabel: 'Source matrix unavailable',
      detailLabel: 'Selected-agent source matrix could not be loaded.',
      selectedAgentId: agentId,
      rows: [],
      unmappedSummary
    };
  }

  const agent = matrix.agents.find((candidate) => candidate.agent_id === agentId);
  const rows = agent ? normalizeRows(agent.sources, maxRows) : [];
  const status = resolveSourceMatrixStatus(rows.length, hasError);

  if (status === 'last-good') {
    return {
      status,
      statusLabel: 'Source matrix · Last loaded rows',
      detailLabel: 'Refresh failed; showing the last loaded selected-agent source rows.',
      selectedAgentId: agentId,
      rows,
      unmappedSummary
    };
  }

  if (status === 'error') {
    return {
      status,
      statusLabel: 'Source matrix unavailable',
      detailLabel: 'Selected-agent source matrix could not be loaded.',
      selectedAgentId: agentId,
      rows,
      unmappedSummary
    };
  }

  if (status === 'empty') {
    return {
      status,
      statusLabel: 'No source matrix rows',
      detailLabel: 'No source rows are mapped to the selected agent in this slice.',
      selectedAgentId: agentId,
      rows,
      unmappedSummary
    };
  }

  return {
    status,
    statusLabel: 'Source matrix',
    detailLabel: 'Selected-agent source rows loaded.',
    selectedAgentId: agentId,
    rows,
    unmappedSummary
  };
}

function resolveSourceMatrixStatus(rowCount: number, hasError: boolean): SelectedAgentSourceMatrixStatus {
  if (rowCount > 0) {
    return hasError ? 'last-good' : 'ready';
  }

  if (hasError) {
    return 'error';
  }

  return 'empty';
}

function deriveUnmappedSummary(
  matrix: AgentEvidenceSourceMatrix | null | undefined,
  maxRows: number
): SelectedAgentSourceMatrixUnmappedSummary {
  return {
    totalCount: Math.max(0, matrix?.unmapped_evidence_summary.total_count ?? 0),
    rows: normalizeRows(matrix?.unmapped_evidence_summary.sources ?? [], maxRows)
  };
}

function normalizeRows(
  rows: AgentEvidenceSourceMatrixRow[],
  maxRows: number
): SelectedAgentSourceMatrixDisplayRow[] {
  if (maxRows <= 0) {
    return [];
  }

  return rows
    .map(toDisplayRow)
    .sort(compareDisplayRows)
    .slice(0, maxRows);
}

function toDisplayRow(row: AgentEvidenceSourceMatrixRow): SelectedAgentSourceMatrixDisplayRow {
  return {
    source: formatEvidenceSourceKindLabel(row.source_kind, 'matrix'),
    status: renderBucket(row.source_status_buckets, formatEvidenceSourceStatusLabel),
    role: renderBucket(row.evidence_role_buckets, formatEvidenceRoleLabel),
    output: renderOutputBucket(row.output_candidate_buckets),
    count: Math.max(0, row.evidence_count),
    latest_at: normalizeString(row.latest_observed_at) ?? normalizeString(row.latest_collected_at)
  };
}

function compareDisplayRows(left: SelectedAgentSourceMatrixDisplayRow, right: SelectedAgentSourceMatrixDisplayRow) {
  return (
    right.count - left.count ||
    compareNullableTimestamp(right.latest_at, left.latest_at) ||
    left.source.localeCompare(right.source) ||
    left.status.localeCompare(right.status) ||
    left.role.localeCompare(right.role) ||
    left.output.localeCompare(right.output)
  );
}

function compareNullableTimestamp(left: string | null, right: string | null) {
  if (left === right) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return left.localeCompare(right);
}

function renderBucket(
  buckets: Record<string, number>,
  formatLabel: (value: unknown) => string
): string {
  const winner = Object.entries(buckets)
    .map(([key, count]) => [formatLabel(key), count] as const)
    .filter(([, count]) => count > 0)
    .sort(([leftKey, leftCount], [rightKey, rightCount]) => rightCount - leftCount || leftKey.localeCompare(rightKey))
    .at(0);

  return winner ? winner[0] : 'Unknown';
}

function renderOutputBucket(buckets: Record<'true' | 'false', number>): string {
  const trueCount = Math.max(0, buckets.true ?? 0);
  const falseCount = Math.max(0, buckets.false ?? 0);

  if (trueCount === 0 && falseCount === 0) {
    return 'Unknown';
  }
  if (trueCount === falseCount) {
    return 'Mixed';
  }
  return trueCount > falseCount ? 'Output candidate' : 'Supporting evidence';
}

function normalizeLimit(value: number | null | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(value));
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
