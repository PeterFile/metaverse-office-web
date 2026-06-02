import type { AgentEvidenceSourceMatrix, AgentEvidenceSourceMatrixRow } from '../types';

export type SelectedAgentSourceMatrixStatus = 'empty' | 'ready';

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
  selectedAgentId: string | null;
  rows: SelectedAgentSourceMatrixDisplayRow[];
  unmappedSummary: SelectedAgentSourceMatrixUnmappedSummary;
};

export type SelectedAgentSourceMatrixOptions = {
  maxRows?: number;
  maxUnmappedRows?: number;
};

const DEFAULT_MAX_ROWS = 5;
const DEFAULT_MAX_UNMAPPED_ROWS = 3;
const SAFE_SOURCE_KINDS = new Set([
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
const SAFE_SOURCE_STATUSES = new Set(['observed', 'degraded', 'missing', 'error']);
const SAFE_EVIDENCE_ROLES = new Set([
  'workspace_presence',
  'inbound_task',
  'agent_output',
  'agent_plan',
  'runtime_activity',
  'runtime_presence',
  'runtime_unmapped',
  'task_reference'
]);
const SOURCE_KIND_LABELS: Record<string, string> = {
  workspace_root: 'Workspace root',
  workspace_file: 'Workspace file',
  tmux_observation: 'Tmux observation',
  hermes_profile: 'Hermes profile',
  hermes_session: 'Hermes session',
  kanban_fixture: 'Kanban fixture',
  linear_fixture: 'Linear fixture',
  slack_fixture: 'Slack fixture',
  task_fixture: 'Task fixture'
};
const SOURCE_STATUS_LABELS: Record<string, string> = {
  observed: 'Observed',
  degraded: 'Degraded',
  missing: 'Missing',
  error: 'Error'
};
const EVIDENCE_ROLE_LABELS: Record<string, string> = {
  workspace_presence: 'Workspace presence',
  inbound_task: 'Inbound task',
  agent_output: 'Agent output',
  agent_plan: 'Agent plan',
  runtime_activity: 'Runtime activity',
  runtime_presence: 'Runtime presence',
  runtime_unmapped: 'Runtime unmapped',
  task_reference: 'Task reference'
};

export function deriveSelectedAgentSourceMatrixViewModel(
  matrix: AgentEvidenceSourceMatrix | null | undefined,
  selectedAgentId: string | null | undefined,
  options: SelectedAgentSourceMatrixOptions = {}
): SelectedAgentSourceMatrixViewModel {
  const agentId = normalizeString(selectedAgentId);
  const maxRows = normalizeLimit(options.maxRows, DEFAULT_MAX_ROWS);
  const maxUnmappedRows = normalizeLimit(options.maxUnmappedRows, DEFAULT_MAX_UNMAPPED_ROWS);
  const unmappedSummary = deriveUnmappedSummary(matrix, maxUnmappedRows);

  if (!matrix || !agentId) {
    return {
      status: 'empty',
      selectedAgentId: agentId,
      rows: [],
      unmappedSummary
    };
  }

  const agent = matrix.agents.find((candidate) => candidate.agent_id === agentId);
  if (!agent) {
    return {
      status: 'empty',
      selectedAgentId: agentId,
      rows: [],
      unmappedSummary
    };
  }

  const rows = normalizeRows(agent.sources, maxRows);

  return {
    status: rows.length > 0 ? 'ready' : 'empty',
    selectedAgentId: agentId,
    rows,
    unmappedSummary
  };
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
    source: projectAllowedLabel(row.source_kind, SAFE_SOURCE_KINDS, SOURCE_KIND_LABELS),
    status: renderBucket(row.source_status_buckets, SAFE_SOURCE_STATUSES, SOURCE_STATUS_LABELS),
    role: renderBucket(row.evidence_role_buckets, SAFE_EVIDENCE_ROLES, EVIDENCE_ROLE_LABELS),
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
  allowedLabels: ReadonlySet<string>,
  displayLabels: Readonly<Record<string, string>>
): string {
  const winner = Object.entries(buckets)
    .map(([key, count]) => [projectAllowedLabel(key, allowedLabels, displayLabels), count] as const)
    .filter(([, count]) => count > 0)
    .sort(([leftKey, leftCount], [rightKey, rightCount]) => rightCount - leftCount || leftKey.localeCompare(rightKey))
    .at(0);

  return winner ? winner[0] : 'Unknown';
}

function projectAllowedLabel(
  value: unknown,
  allowedLabels: ReadonlySet<string>,
  displayLabels: Readonly<Record<string, string>>
): string {
  const normalized = normalizeString(value);
  return normalized !== null && allowedLabels.has(normalized) ? (displayLabels[normalized] ?? normalized) : 'Unknown';
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
