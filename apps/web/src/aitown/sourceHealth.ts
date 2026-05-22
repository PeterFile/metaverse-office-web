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

export interface SourceDrilldownDetail {
  key: string;
  label: string;
}

export interface SourceDrilldownGroup {
  key: string;
  label: string;
  status: SourceHealthFactStatus;
  summary: string;
  details: SourceDrilldownDetail[];
}

const BOUNDED_DETAIL_LIMIT = 3;
const BOUNDED_REASON_LIMIT = 2;
const BOUNDED_RUNTIME_SOURCE_LIMIT = 3;
const BOUNDED_TEXT_LIMIT = 120;

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
          : `Tmux source gap · Session ${tmuxSession.status}`,
      status: tmuxSession.status
    });
  }

  if (sourceHealth.hermes_profile) {
    const hermesProfile = sourceHealth.hermes_profile;

    facts.push({
      key: 'hermes-profile',
      label:
        hermesProfile.status === 'observed'
          ? 'Hermes profile source · Observed'
          : `Hermes profile source gap · Profile ${hermesProfile.status}`,
      status: hermesProfile.status
    });
  }

  if (sourceHealth.hermes_session) {
    const hermesSession = sourceHealth.hermes_session;

    facts.push({
      key: 'hermes-session',
      label:
        hermesSession.status === 'observed'
          ? 'Hermes session source · Observed'
          : `Hermes session source gap · Session ${hermesSession.status}`,
      status: hermesSession.status
    });
  }

  return facts;
}

export function deriveRuntimeSourceEvidenceFacts(
  runtimeSourceEvidence?: CollectorRuntimeSourceEvidence
): SourceHealthFact[] {
  const facts: SourceHealthFact[] = [];
  const unmappedTmuxSessions = runtimeSourceEvidence?.unmapped_tmux_sessions ?? [];
  const unmappedHermesSources = runtimeSourceEvidence?.unmapped_hermes_sources ?? [];

  if (unmappedTmuxSessions.length > 0) {
    const paneCount = unmappedTmuxSessions.reduce((total, session) => total + session.observed_count, 0);

    facts.push({
      key: 'unmapped-tmux-sessions',
      label: `Unmapped tmux source gap · ${unmappedTmuxSessions.length} ${pluralize(
        'session',
        unmappedTmuxSessions.length
      )}, ${paneCount} ${pluralize('pane', paneCount)}`,
      status: 'degraded'
    });
  }

  if (unmappedHermesSources.length > 0) {
    const profileCount = unmappedHermesSources.filter((source) => source.source_kind === 'hermes_profile').length;
    const sessionCount = unmappedHermesSources.filter((source) => source.source_kind === 'hermes_session').length;

    facts.push({
      key: 'unmapped-hermes-sources',
      label: `Unmapped Hermes source gap · ${unmappedHermesSources.length} ${pluralize(
        'source',
        unmappedHermesSources.length
      )}, ${profileCount} ${pluralize('profile', profileCount)}, ${sessionCount} ${pluralize('session', sessionCount)}`,
      status: resolveUnmappedRuntimeSourceStatus(unmappedHermesSources.map((source) => source.status))
    });
  }

  return facts;
}

export function deriveCollectorItemSourceDrilldownGroups(item: CollectorItem): SourceDrilldownGroup[] {
  const sourceHealth = item.source_health;
  if (!sourceHealth) {
    return [];
  }

  const groups: SourceDrilldownGroup[] = [];
  const workspaceDetails: SourceDrilldownDetail[] = [];
  const workspaceStatuses: CollectorSourceHealthStatus[] = [];

  if (sourceHealth.workspace_root) {
    const root = sourceHealth.workspace_root;
    workspaceStatuses.push(root.status);
    workspaceDetails.push(
      { key: 'workspace-root-status', label: `Workspace root status · ${root.status}` },
      { key: 'workspace-root-path', label: `Workspace root configured · ${root.path ? 'Yes' : 'No'}` },
      { key: 'workspace-root-observed', label: `Workspace root observed · ${renderNullable(root.last_observed_at)}` },
      ...renderReasons('workspace-root', 'Workspace root', root.degraded_reasons)
    );
  }

  if (sourceHealth.workspace_files) {
    const files = sourceHealth.workspace_files;
    workspaceStatuses.push(files.status);
    workspaceDetails.push(
      { key: 'workspace-files-status', label: `Workspace files status · ${files.status}` },
      { key: 'workspace-files-expected', label: `Expected files · ${renderBoundedList(files.expected_files)}` },
      {
        key: 'workspace-files-observed',
        label: `Workspace files observed · ${files.observed_count}/${files.expected_files.length}`
      },
      { key: 'workspace-files-gaps', label: `Workspace files gaps · ${renderWorkspaceFileGap(files.missing_count, files.error_count, files.observed_count)}` },
      {
        key: 'workspace-files-observed-at',
        label: `Workspace files observed at · ${renderNullable(files.last_observed_at)}`
      },
      ...renderReasons('workspace-files', 'Workspace files', files.degraded_reasons)
    );
  }

  if (workspaceDetails.length > 0) {
    groups.push(createGroup('workspace', 'Workspace source drilldown', resolveSourceStatus(workspaceStatuses), workspaceDetails));
  }

  if (sourceHealth.tmux_session) {
    const tmuxSession = sourceHealth.tmux_session;
    groups.push(
      createGroup('tmux', 'Tmux source drilldown', tmuxSession.status, [
        { key: 'tmux-session-status', label: `Tmux session status · ${tmuxSession.status}` },
        { key: 'tmux-session-expected', label: `Expected tmux session · ${tmuxSession.expected_session_ref ? 'configured' : 'None'}` },
        { key: 'tmux-session-observed', label: `Tmux panes observed · ${tmuxSession.observed_count}` },
        {
          key: 'tmux-session-observed-at',
          label: `Tmux session observed at · ${renderNullable(tmuxSession.last_observed_at)}`
        },
        ...renderReasons('tmux-session', 'Tmux session', tmuxSession.degraded_reasons)
      ])
    );
  }

  const hermesDetails: SourceDrilldownDetail[] = [];
  const hermesStatuses: CollectorSourceHealthStatus[] = [];

  if (sourceHealth.hermes_profile) {
    const hermesProfile = sourceHealth.hermes_profile;
    hermesStatuses.push(hermesProfile.status);
    hermesDetails.push(
      { key: 'hermes-profile-status', label: `Hermes profile status · ${hermesProfile.status}` },
      { key: 'hermes-profile-id', label: `Hermes profile id · ${hermesProfile.profile_id ? 'available' : 'None'}` },
      { key: 'hermes-profile-evidence', label: `Hermes profile evidence ref · ${renderEvidenceRef(hermesProfile.evidence_ref)}` },
      {
        key: 'hermes-profile-observed-at',
        label: `Hermes profile observed at · ${renderNullable(hermesProfile.last_observed_at)}`
      },
      ...renderReasons('hermes-profile', 'Hermes profile', hermesProfile.degraded_reasons)
    );
  }

  if (sourceHealth.hermes_session) {
    const hermesSession = sourceHealth.hermes_session;
    hermesStatuses.push(hermesSession.status);
    hermesDetails.push(
      { key: 'hermes-session-status', label: `Hermes session status · ${hermesSession.status}` },
      { key: 'hermes-session-expected', label: `Expected Hermes session · ${hermesSession.expected_session_ref ? 'configured' : 'None'}` },
      { key: 'hermes-session-evidence', label: `Hermes session evidence ref · ${renderEvidenceRef(hermesSession.evidence_ref)}` },
      {
        key: 'hermes-session-observed-at',
        label: `Hermes session observed at · ${renderNullable(hermesSession.last_observed_at)}`
      },
      ...renderReasons('hermes-session', 'Hermes session', hermesSession.degraded_reasons)
    );
  }

  if (hermesDetails.length > 0) {
    groups.push(createGroup('hermes', 'Hermes source drilldown', resolveSourceStatus(hermesStatuses), hermesDetails));
  }

  return groups;
}

export function deriveRuntimeSourceDrilldownGroups(
  runtimeSourceEvidence?: CollectorRuntimeSourceEvidence
): SourceDrilldownGroup[] {
  const groups: SourceDrilldownGroup[] = [];
  const unmappedTmuxSessions = runtimeSourceEvidence?.unmapped_tmux_sessions ?? [];
  const unmappedHermesSources = runtimeSourceEvidence?.unmapped_hermes_sources ?? [];

  if (unmappedTmuxSessions.length > 0) {
    groups.push(
      createGroup(
        'runtime-tmux',
        'Runtime tmux source drilldown',
        'degraded',
        unmappedTmuxSessions.flatMap((session, index) => [
          {
            key: `unmapped-tmux-session-${index}`,
            label: `Unmapped tmux session · ${session.observed_count} ${pluralize('pane', session.observed_count)}`
          },
          {
            key: `unmapped-tmux-observed-${index}`,
            label: `Unmapped tmux observed at · ${renderNullable(session.last_observed_at)}`
          },
          {
            key: `unmapped-tmux-panes-${index}`,
            label: `Unmapped tmux pane refs · ${session.pane_refs.length} observed`
          }
        ])
      )
    );
  }

  if (unmappedHermesSources.length > 0) {
    const visibleHermesSources = unmappedHermesSources.slice(0, BOUNDED_RUNTIME_SOURCE_LIMIT);
    const hermesDetails = visibleHermesSources.flatMap((source, index) => [
      {
        key: `unmapped-hermes-source-${index}`,
        label: `Unmapped Hermes ${renderHermesSourceKind(source.source_kind)} · ${renderHermesRuntimeSourceRef(
          source
        )} · ${source.status}`
      },
      {
        key: `unmapped-hermes-evidence-${index}`,
        label: `Unmapped Hermes evidence ref · ${renderEvidenceRef(source.evidence_ref)}`
      },
      {
        key: `unmapped-hermes-observed-${index}`,
        label: `Unmapped Hermes observed at · ${renderNullable(source.observed_at)}`
      },
      ...renderReasons(`unmapped-hermes-${index}`, 'Unmapped Hermes source', source.degraded_reasons)
    ]);

    if (unmappedHermesSources.length > visibleHermesSources.length) {
      hermesDetails.push({
        key: 'unmapped-hermes-source-overflow',
        label: `Unmapped Hermes sources · +${unmappedHermesSources.length - visibleHermesSources.length} more`
      });
    }

    groups.push(
      createGroup(
        'runtime-hermes',
        'Runtime Hermes source drilldown',
        resolveUnmappedRuntimeSourceStatus(unmappedHermesSources.map((source) => source.status)),
        hermesDetails
      )
    );
  }

  return groups;
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

function createGroup(
  key: string,
  label: string,
  status: CollectorSourceHealthStatus,
  details: SourceDrilldownDetail[]
): SourceDrilldownGroup {
  return {
    key,
    label,
    status,
    summary: `${label} · ${status}`,
    details
  };
}

function resolveSourceStatus(statuses: CollectorSourceHealthStatus[]) {
  if (statuses.includes('error')) {
    return 'error';
  }

  if (statuses.includes('missing')) {
    return 'missing';
  }

  if (statuses.includes('degraded')) {
    return 'degraded';
  }

  return 'observed';
}

function resolveUnmappedRuntimeSourceStatus(statuses: CollectorSourceHealthStatus[]): CollectorSourceHealthStatus {
  if (statuses.includes('error')) {
    return 'error';
  }

  return 'degraded';
}

function renderHermesSourceKind(sourceKind: 'hermes_profile' | 'hermes_session') {
  return sourceKind === 'hermes_profile' ? 'profile' : 'session';
}

function renderHermesRuntimeSourceRef(source: NonNullable<CollectorRuntimeSourceEvidence['unmapped_hermes_sources']>[number]) {
  return source.source_kind === 'hermes_profile'
    ? source.profile_id
      ? 'profile ref available'
      : 'profile ref unavailable'
    : source.session_ref
      ? 'session ref available'
      : 'session ref unavailable';
}

function renderEvidenceRef(value: string | null) {
  return value ? 'available' : 'None';
}

function renderReasons(keyPrefix: string, labelPrefix: string, reasons: string[]): SourceDrilldownDetail[] {
  const details = reasons.slice(0, BOUNDED_REASON_LIMIT).map((_, index) => ({
    key: `${keyPrefix}-reason-${index}`,
    label: `${labelPrefix} reason · Reported`
  }));

  if (reasons.length > BOUNDED_REASON_LIMIT) {
    details.push({
      key: `${keyPrefix}-reason-overflow`,
      label: `${labelPrefix} reasons · +${reasons.length - BOUNDED_REASON_LIMIT} more`
    });
  }

  return details;
}

function renderBoundedList(values: string[]) {
  if (values.length === 0) {
    return 'None';
  }

  const visibleValues = values.slice(0, BOUNDED_DETAIL_LIMIT);
  const overflowCount = values.length - visibleValues.length;
  return overflowCount > 0 ? `${visibleValues.join(', ')}, +${overflowCount} more` : visibleValues.join(', ');
}

function renderBoundedText(value: string) {
  return value.length > BOUNDED_TEXT_LIMIT ? `${value.slice(0, BOUNDED_TEXT_LIMIT - 1)}…` : value;
}

function renderNullable(value: string | null) {
  return value ?? 'None';
}

function pluralize(noun: string, count: number) {
  return count === 1 ? noun : `${noun}s`;
}
