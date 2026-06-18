type LabelMode = 'ledger' | 'matrix' | 'source-context' | 'source-gap';

const LEDGER_SOURCE_KIND_LABELS: Record<string, string> = {
  workspace_root: 'Workspace root',
  workspace_file: 'Workspace file',
  workspace_files: 'Workspace files',
  tmux_observation: 'Runtime observation',
  tmux_session: 'Runtime source',
  hermes_profile: 'Runtime source',
  hermes_session: 'Runtime source',
  kanban_fixture: 'Tool evidence',
  linear_fixture: 'Tool evidence',
  slack_fixture: 'Tool evidence',
  task_fixture: 'Linked evidence',
  controller_event: 'Controller event',
  collector_snapshot: 'Collector snapshot',
  workspace_snapshot: 'Workspace snapshot',
  workflow_event: 'Workflow event',
  timeline_replay: 'Timeline replay',
  evidence_ref: 'Evidence ref',
  peer_watch: 'Peer watch',
  incident_reader: 'Incident reader',
  workflow_interaction: 'Workflow interaction',
  handoff_log: 'Handoff log',
  peer_watch_alert: 'Peer watch alert',
  workflow_incident: 'Workflow incident',
  reboot_recommendation: 'Reboot recommendation',
  correlation_interaction: 'Correlation interaction',
  api_cache: 'API cache'
};

const MATRIX_SOURCE_KIND_LABELS: Record<string, string> = {
  workspace_root: 'Workspace evidence',
  workspace_file: 'Workspace evidence',
  workspace_files: 'Workspace evidence',
  tmux_observation: 'Runtime evidence',
  tmux_session: 'Runtime evidence',
  hermes_profile: 'Runtime evidence',
  hermes_session: 'Runtime evidence',
  kanban_fixture: 'Tool evidence',
  linear_fixture: 'Tool evidence',
  slack_fixture: 'Tool evidence',
  task_fixture: 'Linked evidence'
};

const SOURCE_CONTEXT_KIND_LABELS: Record<string, string> = {
  workspace_root: 'Workspace root',
  workspace_file: 'Workspace file',
  tmux_observation: 'Runtime observation',
  hermes_profile: 'Runtime source',
  hermes_session: 'Runtime source',
  kanban_fixture: 'Tool evidence',
  linear_fixture: 'Tool evidence',
  slack_fixture: 'Tool evidence',
  task_fixture: 'Linked evidence'
};

const LEDGER_SOURCE_STATUS_LABELS: Record<string, string> = {
  observed: 'Observed',
  degraded: 'Degraded',
  missing: 'Missing',
  error: 'Error'
};

const TITLE_SOURCE_STATUS_LABELS: Record<string, string> = {
  observed: 'Observed',
  degraded: 'Degraded',
  missing: 'Missing',
  error: 'Error'
};

const LEDGER_EVIDENCE_ROLE_LABELS: Record<string, string> = {
  workspace_presence: 'Workspace presence',
  inbound_task: 'Inbound task',
  agent_output: 'Agent output',
  agent_plan: 'Agent plan',
  runtime_activity: 'Runtime activity',
  runtime_presence: 'Runtime presence',
  runtime_unmapped: 'Runtime unmapped',
  task_reference: 'Task reference',
  workspace_file: 'Workspace file'
};

const TITLE_EVIDENCE_ROLE_LABELS: Record<string, string> = {
  workspace_presence: 'Workspace presence',
  inbound_task: 'Inbound task',
  agent_output: 'Agent output',
  agent_plan: 'Agent plan',
  runtime_activity: 'Runtime activity',
  runtime_presence: 'Runtime presence',
  runtime_unmapped: 'Runtime unmapped',
  task_reference: 'Task reference'
};

const SOURCE_GAP_EVIDENCE_ROLE_LABELS: Record<string, string> = {
  workspace_presence: 'workspace presence',
  inbound_task: 'inbound task',
  agent_output: 'agent output',
  agent_plan: 'agent plan',
  runtime_activity: 'runtime activity',
  runtime_presence: 'runtime presence',
  runtime_source: 'runtime source',
  runtime_unmapped: 'runtime unmapped',
  source_evidence: 'source evidence',
  workspace_snapshot: 'workspace snapshot',
  task_reference: 'task reference'
};

export function formatEvidenceSourceKindLabel(
  value: unknown,
  mode: Exclude<LabelMode, 'source-gap'> = 'matrix'
) {
  if (mode === 'ledger') {
    return formatAllowedEnumLabel(value, LEDGER_SOURCE_KIND_LABELS);
  }
  if (mode === 'source-context') {
    return formatAllowedEnumLabel(value, SOURCE_CONTEXT_KIND_LABELS);
  }
  return formatAllowedEnumLabel(value, MATRIX_SOURCE_KIND_LABELS);
}

export function formatEvidenceSourceStatusLabel(
  value: unknown,
  mode: Exclude<LabelMode, 'source-gap'> = 'matrix'
) {
  return formatAllowedEnumLabel(
    value,
    mode === 'ledger' ? LEDGER_SOURCE_STATUS_LABELS : TITLE_SOURCE_STATUS_LABELS
  );
}

export function formatEvidenceRoleLabel(value: unknown, mode: LabelMode = 'matrix') {
  if (mode === 'ledger') {
    return formatAllowedEnumLabel(value, LEDGER_EVIDENCE_ROLE_LABELS);
  }
  if (mode === 'source-gap') {
    return formatAllowedEnumLabel(value, SOURCE_GAP_EVIDENCE_ROLE_LABELS);
  }
  return formatAllowedEnumLabel(value, TITLE_EVIDENCE_ROLE_LABELS);
}

function formatAllowedEnumLabel(value: unknown, labels: Readonly<Record<string, string>>) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized && Object.prototype.hasOwnProperty.call(labels, normalized)
    ? labels[normalized]
    : 'Unknown';
}
