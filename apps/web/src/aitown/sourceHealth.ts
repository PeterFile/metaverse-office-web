import type {
  CollectorItem,
  CollectorRuntimeSourceEvidence,
  CollectorSourceHealthStatus
} from '../types';

export type SourceHealthFactStatus = CollectorSourceHealthStatus;

export interface SourceHealthFact {
  key: string;
  label: string;
  status: SourceHealthFactStatus;
}

export function deriveCollectorItemSourceHealthFacts(item: CollectorItem): SourceHealthFact[] {
  const sourceHealth = item.source_health;
  if (!sourceHealth) {
    return [];
  }

  const facts: SourceHealthFact[] = [];

  if (sourceHealth.workspace_root) {
    facts.push({
      key: 'workspace-root',
      label:
        sourceHealth.workspace_root.status === 'observed'
          ? 'Workspace source · Observed'
          : `Workspace source gap · ${sourceHealth.workspace_root.status === 'missing' ? 'Root missing' : renderStatus(sourceHealth.workspace_root.status)}`,
      status: sourceHealth.workspace_root.status
    });
  }

  if (sourceHealth.workspace_files) {
    const files = sourceHealth.workspace_files;
    const expectedCount = files.expected_files.length;

    facts.push({
      key: 'workspace-files',
      label:
        files.status === 'observed'
          ? `Workspace files source · Observed ${files.observed_count}/${expectedCount}`
          : `Workspace files source gap · ${renderWorkspaceFileGap(files.missing_count, files.error_count, files.observed_count)}`,
      status: files.status
    });
  }

  if (sourceHealth.tmux_session) {
    const tmuxSession = sourceHealth.tmux_session;

    facts.push({
      key: 'tmux-session',
      label:
        tmuxSession.status === 'observed'
          ? `Tmux source · Observed ${tmuxSession.observed_count} ${pluralize('pane', tmuxSession.observed_count)}`
          : `Tmux source gap · Expected ${tmuxSession.expected_session_ref} ${tmuxSession.status}`,
      status: tmuxSession.status
    });
  }

  return facts;
}

export function deriveRuntimeSourceEvidenceFacts(
  runtimeSourceEvidence?: CollectorRuntimeSourceEvidence
): SourceHealthFact[] {
  const unmappedTmuxSessions = runtimeSourceEvidence?.unmapped_tmux_sessions ?? [];
  if (unmappedTmuxSessions.length === 0) {
    return [];
  }

  const paneCount = unmappedTmuxSessions.reduce((total, session) => total + session.observed_count, 0);

  return [
    {
      key: 'unmapped-tmux-sessions',
      label: `Unmapped tmux source gap · ${unmappedTmuxSessions.length} ${pluralize(
        'session',
        unmappedTmuxSessions.length
      )}, ${paneCount} ${pluralize('pane', paneCount)}`,
      status: 'degraded'
    }
  ];
}

function renderWorkspaceFileGap(missingCount: number, errorCount: number, observedCount: number) {
  const parts: string[] = [];

  if (missingCount > 0) {
    parts.push(`${missingCount} missing`);
  }

  if (errorCount > 0) {
    parts.push(`${errorCount} error${errorCount === 1 ? '' : 's'}`);
  }

  parts.push(`${observedCount} observed`);

  return parts.join(', ');
}

function renderStatus(status: CollectorSourceHealthStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function pluralize(noun: string, count: number) {
  return count === 1 ? noun : `${noun}s`;
}
