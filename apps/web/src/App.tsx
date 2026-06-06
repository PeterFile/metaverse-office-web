import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react';

import {
  DEFAULT_WORKFLOW_LIMIT,
  DEFAULT_WORKFLOW_WINDOW,
  RequestError,
  fetchAgentEvidenceSpineSummary,
  fetchAgentEvidenceSourceMatrix,
  fetchAgentWorkflow,
  fetchAccountabilityReplay,
  fetchCollectorEvidenceCoverage,
  fetchCollectorSnapshot,
  fetchCollectorSnapshotSummary,
  fetchCollectorSourceHealth,
  fetchCorrelationDrilldown,
  fetchEvidenceRecord,
  fetchEvidenceProvenanceBundle,
  fetchEvidenceRefRollup,
  fetchEvidenceReplayWindow,
  fetchEvidenceSourceContext,
  fetchEvidenceRecords,
  fetchReplayCheckpointLog,
  fetchIncidents,
  fetchMemoryArtifacts,
  fetchOfficeOperations,
  fetchOfficeOverview,
  fetchPeerWatchAlerts,
  fetchRuntimeSourceGapLifecycle,
  fetchRuntimeSourceGaps,
  fetchRuntimeSourceGapsSummary,
  fetchTimeline
} from './api';
import {
  DetailsPanel,
  SELECTED_AGENT_DRILLDOWN_TABS,
  resolveSelectedAgentDrilldownPanelId,
  resolveSelectedAgentDrilldownTabId,
  type HubCategory,
  type SelectedAgentDrilldownTab,
  type SourceGapFocusIntent
} from './aitown/DetailsPanel';
import { SceneStatusLegend } from './aitown/SceneStatusLegend';
import {
  deriveCollectorEvidenceCoverageFocusSummary,
  type CollectorEvidenceCoverageFocusSummaryItem
} from './aitown/evidenceCoverage';
import { resolveRolePawnAssetUrl } from './aitown/rolePawnAssets';
import { adaptWorldToScene } from './aitown/sceneAdapter';
import {
  deriveRuntimeSourceGapChips,
  deriveRuntimeSourceGapInspectPeek,
  deriveRuntimeSourceGapLifecycleStrip,
  deriveRuntimeSourceGapWorldPins,
  deriveSelectedAgentSourceGapFact,
  type DisplayedSourceGapKind,
  type RuntimeSourceGapLifecycleStrip
} from './aitown/sourceGapSignals';
import { deriveSelectedAgentSourceHealthInspectPeek } from './aitown/sourceHealth';
import { deriveSelectedAgentEvidenceGlance } from './aitown/selectedAgentEvidenceGlance';
import { deriveSelectedAgentSourceMatrixViewModel } from './aitown/selectedAgentSourceMatrix';
import { WorldProvider, useWorld } from './context/WorldContext';
import { usePolledResource, type LoadState } from './hooks/usePolledResource';
import { getHubFocusableElements, isHubElementVisible } from './hubFocus';
import {
  buildSelectedAgentEvidenceProofCompassRows,
  buildSelectedAgentEvidenceLedger,
  type SelectedAgentEvidenceLedgerModel,
  type SelectedAgentEvidenceProofCompassRow
} from './selectedAgentEvidenceLedger';
import type {
  AccountabilityReplayBundle,
  AgentEvidenceSourceMatrix,
  AgentEvidenceSpineSummary,
  CollectorEvidenceCoverage,
  CollectorSnapshot,
  CollectorSnapshotSafeSummary,
  CollectorSourceHealthProjection,
  CorrelationDrilldown,
  EvidenceProvenanceBundle,
  EvidenceRecord,
  EvidenceReplayWindow,
  EvidenceSourceContext,
  ReplayCheckpointLogResponse,
  MemoryArtifact,
  MemoryArtifactIndex,
  OfficeAgent,
  OfficeOperation,
  OfficeOperations,
  PeerWatchAlertsResponse,
  RuntimeSourceGap,
  RuntimeSourceGapLifecycle,
  RuntimeSourceGapsSummary,
  Severity,
  TimelineReplayResponse,
  WorkflowDetail
} from './types';
import { projectWorldState } from './world/projector';
import {
  PHASE_LABELS,
  selectAttentionQueue,
  selectAgentZoneLabel,
  selectHotZones,
  type HotZoneSummary
} from './world/selectors';
import type { SceneAgent, SceneSourceGapPin } from './aitown/types';

type AgentRosterStatusState = Pick<
  SceneAgent,
  'phase' | 'severity' | 'rebootRecommended' | 'openAlertCount' | 'hasOpenIncidents' | 'runtimeFreshnessSeverity'
>;

type AgentRosterProps = {
  agents: SceneAgent[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
};

const CREW_INCIDENT_FEED_LIMIT = 200;
const CREW_INCIDENT_FEED_WINDOW = '8760h';
import type { WorldAgent } from './world/types';

const LazyWorldScene = lazy(() => import('./aitown/WorldScene'));

type OperationSelection = {
  agentId: string;
};

type AgentFocusRequest = {
  agentId: string;
  requestId: number;
};

type ZoneFocusRequest = {
  zoneId: string;
  requestId: number;
};

type CorrelationSpotlight = Pick<CorrelationDrilldown, 'correlation_id' | 'participant_agent_ids'>;

type ReplayCheckpointFocus = {
  eventId: string;
  selectedAgentId: string | null;
  selectedCorrelationId: string | null;
};

type EvidenceCoverageReadState = {
  data: CollectorEvidenceCoverage | null;
  error: string | null;
  state: LoadState;
};

type SourceGapReadState = {
  data: RuntimeSourceGap[] | null;
  error: string | null;
  state: LoadState;
};

type SourceGapSummaryReadState = {
  data: RuntimeSourceGapsSummary | null;
  error: string | null;
  state: LoadState;
};

type CollectorSnapshotSummaryChipModel = {
  statusLabel: string;
  countLabel: string;
  healthLabel: string;
  timeLabel: string;
  tone: 'loading' | 'empty' | 'ready' | 'unavailable';
};

type HudReadModelStatus = {
  label: string;
  summary: string;
  detail: string;
  tone: 'unavailable';
};

type SelectedAgentTimelineReplayPayload = {
  targetAgentId: string;
  correlationId: string | null;
  severity: Severity | null;
  eventId: string | null;
  timelineReplay: TimelineReplayResponse;
};

type SelectedAgentSupervisionHistoryPayload = {
  targetAgentId: string;
  correlationId: string | null;
  severity: Severity | null;
  peerWatchAlerts: PeerWatchAlertsResponse;
};

type SelectedAgentAccountabilityReplayPayload = {
  targetAgentId: string;
  correlationId: string | null;
  eventId: string | null;
  evidenceId: string | null;
  replayBundle: AccountabilityReplayBundle;
};

type SelectedAgentEvidenceLedgerPayload = {
  targetAgentId: string;
  evidenceLedger: SelectedAgentEvidenceLedgerModel;
};

const CREW_TIMELINE_LIMIT = 4;
const CREW_OPEN_SUPERVISION_ALERTS_LIMIT = 4;
const MEMORY_ARTIFACT_LIMIT = 4;
const SOURCE_HEALTH_HUD_LIMIT = 7;
const SOURCE_GAP_QUEUE_LIMIT = 3;
const SELECTED_AGENT_SUPERVISION_HISTORY_LIMIT = 4;
const SELECTED_AGENT_EVIDENCE_LEDGER_LIMIT = 12;
const RESET_VIEW_SHORTCUT_KEY = 'r';
const RESET_VIEW_SHORTCUT_ARIA = 'R';

const HUB_CATEGORIES: ReadonlyArray<{
  id: HubCategory;
  label: string;
  hint: string;
  selectedAgentTab: SelectedAgentDrilldownTab;
}> = [
  { id: 'crew', label: 'Crew', hint: 'Roster and crew overview', selectedAgentTab: 'now' },
  { id: 'queue', label: 'Queue', hint: 'Active work and attention queue', selectedAgentTab: 'now' },
  { id: 'supervision', label: 'Supervision', hint: 'Collector and watch signals', selectedAgentTab: 'evidence' },
  { id: 'evidence', label: 'Evidence', hint: 'Incidents and workflow evidence', selectedAgentTab: 'evidence' },
  { id: 'replay', label: 'Replay', hint: 'Timeline and correlation drilldown', selectedAgentTab: 'replay' },
  { id: 'memory', label: 'Memory', hint: 'Shared memory artifacts', selectedAgentTab: 'evidence' }
];

function resolveHubCategoryLabel(category: HubCategory) {
  return HUB_CATEGORIES.find((item) => item.id === category)?.label ?? 'Crew';
}

function resolveHubCategorySelectedAgentTab(category: HubCategory): SelectedAgentDrilldownTab {
  return HUB_CATEGORIES.find((item) => item.id === category)?.selectedAgentTab ?? 'now';
}

function resolveSelectedAgentTabHubCategory(tab: SelectedAgentDrilldownTab, currentCategory: HubCategory): HubCategory {
  if (tab === 'replay') {
    return 'replay';
  }

  if (tab === 'evidence') {
    return 'evidence';
  }

  return currentCategory === 'queue' ? 'queue' : 'crew';
}

function resolveRuntimeSourceGapLifecycleApiSourceKind(sourceKind: DisplayedSourceGapKind) {
  switch (sourceKind) {
    case 'workspace_files':
      return 'workspace_file';
    case 'tmux_session':
      return 'tmux_observation';
    case 'workspace_root':
    case 'hermes_profile':
    case 'hermes_session':
      return sourceKind;
  }
}

function mergeRuntimeSourceGapLifecycles(
  mappedLifecycle: RuntimeSourceGapLifecycle,
  unmappedLifecycle: RuntimeSourceGapLifecycle
): RuntimeSourceGapLifecycle {
  return {
    total_count: mappedLifecycle.total_count + unmappedLifecycle.total_count,
    total_groups: mappedLifecycle.total_groups + unmappedLifecycle.total_groups,
    returned_limit: Math.max(mappedLifecycle.returned_limit, unmappedLifecycle.returned_limit),
    groups: [...mappedLifecycle.groups, ...unmappedLifecycle.groups]
  };
}

const EMPTY_SEVERITY_BUCKETS: Record<Severity, number> = {
  normal: 0,
  yellow: 0,
  orange: 0,
  red: 0
};
const HOT_ZONE_SEVERITY_LABELS: Record<Severity, string> = {
  normal: 'Normal',
  yellow: 'Yellow',
  orange: 'Orange',
  red: 'Red'
};
const AGENT_ROSTER_SHORT_LABELS: Record<string, string> = {
  'team-lead': 'Lead',
  'market-intel': 'Intel',
  'product-pmf': 'PMF',
  tokenomics: 'Token',
  'protocol-engineering': 'Protocol',
  'app-engineering': 'App Eng',
  'growth-revenue': 'Growth'
};

function normalizeAgentNameTokens(displayName: string, fallbackId: string) {
  const cleanedDisplayName = displayName.trim().replace(/\s+agent$/i, '').trim();
  const source = cleanedDisplayName || fallbackId.trim() || 'Agent';

  return source.split(/[\s_-]+/).filter(Boolean);
}

function truncateRosterToken(token: string, maxLength: number) {
  return token.length > maxLength ? token.slice(0, maxLength) : token;
}

function resolveAgentRosterName(displayName: string, fallbackId: string) {
  const configuredShortLabel = AGENT_ROSTER_SHORT_LABELS[fallbackId];
  if (configuredShortLabel) {
    return configuredShortLabel;
  }

  const tokens = normalizeAgentNameTokens(displayName, fallbackId);
  const [firstToken = 'Agent', secondToken] = tokens;

  if (!secondToken) {
    return truncateRosterToken(firstToken, 10);
  }

  return `${truncateRosterToken(firstToken, 8)} ${truncateRosterToken(secondToken, 3)}`;
}

function resolveAgentRosterStatus(agent: AgentRosterStatusState) {
  if (agent.rebootRecommended || agent.phase === 'reboot_recommended' || agent.phase === 'rebooting') {
    return '↻';
  }

  if (agent.phase === 'blocked') {
    return '×';
  }

  if (agent.openAlertCount > 0) {
    return `${Math.min(agent.openAlertCount, 9)}!`;
  }

  if (agent.hasOpenIncidents) {
    return '!';
  }

  if (agent.runtimeFreshnessSeverity && agent.runtimeFreshnessSeverity !== 'normal') {
    return '◷';
  }

  if (agent.severity !== 'normal') {
    return '!';
  }

  if (agent.phase === 'sleeping') {
    return 'z';
  }

  if (agent.phase === 'active' || agent.phase === 'reviewing' || agent.phase === 'handoff_active') {
    return '●';
  }

  return '✓';
}

function AgentRoster({ agents, selectedAgentId, onSelectAgent }: AgentRosterProps) {
  if (agents.length === 0) {
    return null;
  }

  return (
    <nav className="aitown-agent-roster" aria-label="Agent roster">
      <ol className="aitown-agent-roster__list">
        {agents.map((agent) => {
          const selected = selectedAgentId === agent.agentId;
          const shortName = resolveAgentRosterName(agent.displayName, agent.agentId);
          const status = resolveAgentRosterStatus(agent);
          const portraitUrl = resolveRolePawnAssetUrl(agent.rolePawnKey);

          return (
            <li key={agent.agentId} className="aitown-agent-roster__item">
              <button
                type="button"
                className={`aitown-agent-roster__button severity-${agent.severity}${selected ? ' is-active' : ''}`}
                aria-label={`Select and locate ${agent.displayName}`}
                aria-pressed={selected}
                title={agent.displayName}
                onClick={() => onSelectAgent(agent.agentId)}
              >
                <span className="aitown-agent-roster__portrait" aria-hidden="true">
                  {portraitUrl ? (
                    <img src={portraitUrl} alt="" loading="eager" draggable={false} />
                  ) : (
                    <span className="aitown-agent-roster__portrait-fallback" />
                  )}
                </span>
                <span className="aitown-agent-roster__copy">
                  <strong>{shortName}</strong>
                  <span>{status}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function isJsdomEnvironment() {
  return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
  );
}

export function resolveSelectedAgent(
  selectedAgentId: string | null,
  overviewAgents: OfficeAgent[] | undefined,
  lastSelectedAgent: OfficeAgent | null
) {
  if (!selectedAgentId) {
    return null;
  }

  return (
    overviewAgents?.find((agent) => agent.agent_id === selectedAgentId) ??
    (lastSelectedAgent?.agent_id === selectedAgentId ? lastSelectedAgent : null)
  );
}

function resolveLiveFocusSummaryLabel(attentionCount: number) {
  if (attentionCount === 0) {
    return 'No agents currently need attention.';
  }

  return attentionCount === 1
    ? '1 agent needs attention right now.'
    : `${attentionCount} agents need attention right now.`;
}

function resolveLiveFocusAgentMeta(agent: WorldAgent) {
  const phaseLabel = PHASE_LABELS[agent.phase] ?? agent.phase;
  const statusSignals = resolveAgentRosterStatus({
    phase: agent.phase,
    severity: agent.severity,
    rebootRecommended: agent.reboot_recommended,
    openAlertCount: agent.open_alert_count,
    hasOpenIncidents: agent.has_open_incidents,
    runtimeFreshnessSeverity: agent.staleness?.severity ?? null
  });

  return `${phaseLabel} · ${statusSignals}`;
}

function resolveLiveFocusReasonLine(agents: WorldAgent[]) {
  const primaryAgent = agents[0];
  if (!primaryAgent) {
    return null;
  }

  const reasons = resolveLiveFocusReasons(primaryAgent);
  const hiddenCount = Math.max(0, agents.length - 1);
  if (hiddenCount > 0) {
    reasons.push(`${hiddenCount} more focus ${hiddenCount === 1 ? 'agent' : 'agents'}`);
  }

  return `Why this matters · ${primaryAgent.display_name}: ${reasons.join('; ')}.`;
}

function resolveLiveFocusReasons(agent: WorldAgent) {
  const reasons = renderLiveFocusSeverityReason(agent);
  const hasStalenessReason = reasons.some((reason) => reason.startsWith('stale for '));

  if (
    !hasStalenessReason &&
    agent.staleness &&
    agent.staleness.severity !== 'normal' &&
    agent.staleness.stale_for_minutes !== null
  ) {
    reasons.push(`stale for ${agent.staleness.stale_for_minutes}m`);
  }

  if (agent.phase === 'blocked') {
    reasons.push('blocked');
  }

  if (agent.reboot_recommended) {
    reasons.push('reboot recommended');
  }

  const hasIncidentReason = reasons.some((reason) => reason.includes('incident'));
  if (!hasIncidentReason && agent.has_open_incidents) {
    if (agent.open_alert_count > 0) {
      reasons.push(`${agent.open_alert_count} open ${agent.open_alert_count === 1 ? 'alert' : 'alerts'}`);
    } else {
      reasons.push('open incident');
    }
  }

  return dedupeLiveFocusReasons(reasons.length > 0 ? reasons : ['attention-worthy state']);
}

function renderLiveFocusSeverityReason(agent: WorldAgent) {
  const rawReason = agent.severity_reason.trim();
  const workflowUnavailable = rawReason.includes('(workflow unavailable)');
  const baseReason = rawReason.replace(' (workflow unavailable)', '').trim();
  const reasons: string[] = [];
  const stalenessMatch = /^staleness: (\d+|\?)m$/.exec(baseReason);

  if (stalenessMatch) {
    reasons.push(`stale for ${stalenessMatch[1]}m`);
  } else if (baseReason === 'open incident') {
    reasons.push('open incident evidence');
  } else if (baseReason === 'effective (backend)') {
    reasons.push(`${HOT_ZONE_SEVERITY_LABELS[agent.severity]} backend severity`);
  } else if (baseReason === 'reported' && agent.severity !== 'normal') {
    reasons.push(`${HOT_ZONE_SEVERITY_LABELS[agent.severity]} reported severity`);
  } else if (baseReason && baseReason !== 'reported') {
    reasons.push(baseReason);
  }

  if (workflowUnavailable) {
    reasons.push('workflow unavailable');
  }

  return reasons;
}

function dedupeLiveFocusReasons(reasons: string[]) {
  return reasons.filter((reason, index) => reason.length > 0 && reasons.indexOf(reason) === index);
}

function renderEvidenceCoverageFocusRefCount(count: number) {
  return `${count} ref${count === 1 ? '' : 's'}`;
}

function renderEvidenceCoverageFocusSources(sourceLabels: string[]) {
  return sourceLabels.length > 0 ? sourceLabels.join(' + ') : 'No evidence sources';
}

function renderEvidenceCoverageFocusStatus(item: CollectorEvidenceCoverageFocusSummaryItem) {
  return item.status === 'uncovered_in_snapshot' ? 'Uncovered in snapshot' : 'Low-confidence evidence';
}

function renderEvidenceCoverageFocusLatest(item: CollectorEvidenceCoverageFocusSummaryItem) {
  if (item.status === 'uncovered_in_snapshot') {
    return 'No coverage in snapshot';
  }

  return item.latest_evidence_at
    ? `Latest evidence · ${item.latest_evidence_at}`
    : 'Latest evidence unavailable';
}

function renderRuntimeSourceGapLifecycleStrip(strip: RuntimeSourceGapLifecycleStrip | null) {
  if (!strip) {
    return null;
  }

  return (
    <section
      className={`aitown-source-gap-lifecycle-strip aitown-source-gap-lifecycle-strip--${strip.status}`}
      role="region"
      aria-label="Source gap lifecycle"
    >
      <span className="aitown-source-gap-lifecycle-strip__summary">{strip.summaryLabel}</span>
      {strip.mappedRows.length > 0 ? (
        <span className="aitown-source-gap-lifecycle-strip__group" role="group" aria-label="Mapped lifecycle">
          <span className="aitown-source-gap-lifecycle-strip__group-label">Mapped lifecycle</span>
          {strip.mappedRows.map((row) => (
            <span key={row.key} className="aitown-source-gap-lifecycle-strip__row">
              <span>{`${row.sourceLabel} · ${row.statusLabel} · ${row.lifecycleLabel}`}</span>
              <span>{`${row.countLabel} · ${row.observedAtLabel}`}</span>
            </span>
          ))}
        </span>
      ) : null}
      {strip.unmappedRows.length > 0 ? (
        <span className="aitown-source-gap-lifecycle-strip__group" role="group" aria-label="Unmapped lifecycle">
          <span className="aitown-source-gap-lifecycle-strip__group-label">Unmapped lifecycle</span>
          {strip.unmappedRows.map((row) => (
            <span key={row.key} className="aitown-source-gap-lifecycle-strip__row">
              <span>{`${row.sourceLabel} · ${row.statusLabel} · ${row.lifecycleLabel}`}</span>
              <span>{`${row.countLabel} · ${row.observedAtLabel}`}</span>
            </span>
          ))}
        </span>
      ) : null}
    </section>
  );
}

function resolveCollectorSnapshotSummaryChip(
  summary: CollectorSnapshotSafeSummary | null,
  state: LoadState,
  error: string | null
): CollectorSnapshotSummaryChipModel {
  if (summary?.has_snapshot) {
    const healthBuckets = summary.source_health_buckets.status_buckets;
    const unstableHealthCount =
      (healthBuckets.degraded ?? 0) + (healthBuckets.missing ?? 0) + (healthBuckets.error ?? 0);

    return {
      statusLabel: 'Snapshot available',
      countLabel: `${summary.agent_count} agents · ${summary.heartbeat_count} heartbeats`,
      healthLabel: `${healthBuckets.observed ?? 0} observed · ${unstableHealthCount} source gaps`,
      timeLabel: `Collected · ${summary.collected_at ?? 'unknown'}`,
      tone: 'ready'
    };
  }

  if (summary && !summary.has_snapshot) {
    return {
      statusLabel: 'No snapshot',
      countLabel: '0 agents · 0 heartbeats',
      healthLabel: '0 observed · 0 source gaps',
      timeLabel: 'Collected · none',
      tone: 'empty'
    };
  }

  if (error) {
    return {
      statusLabel: 'Snapshot summary unavailable',
      countLabel: 'Safe summary read failed',
      healthLabel: 'Safe aggregate unavailable',
      timeLabel: 'Collected · unknown',
      tone: 'unavailable'
    };
  }

  if (state === 'loading' || state === 'idle') {
    return {
      statusLabel: 'Snapshot summary loading',
      countLabel: 'Safe summary boundary',
      healthLabel: 'Waiting for aggregate state',
      timeLabel: 'Collected · unknown',
      tone: 'loading'
    };
  }

  return {
    statusLabel: 'No snapshot',
    countLabel: '0 agents · 0 heartbeats',
    healthLabel: '0 observed · 0 source gaps',
    timeLabel: 'Collected · none',
    tone: 'empty'
  };
}

function formatUnknownError(error: unknown) {
  return error instanceof Error ? error.message : 'unknown_error';
}

function resolveEvidenceCoverageReadModelStatus(
  coverageResource: EvidenceCoverageReadState
): HudReadModelStatus | null {
  const { data, error, state } = coverageResource;

  if (data || state === 'loading') {
    return null;
  }

  if (error) {
    return {
      label: 'Evidence coverage',
      summary: 'Unavailable',
      detail: `Read model unavailable · ${error}`,
      tone: 'unavailable'
    };
  }

  if (state === 'ready') {
    return {
      label: 'Evidence coverage',
      summary: 'No snapshot',
      detail: 'Read model has no evidence coverage snapshot yet.',
      tone: 'unavailable'
    };
  }

  return null;
}

function resolveSourceHealthReadModelStatus(
  sourceHealthResource: {
    data: CollectorSourceHealthProjection | null;
    error: string | null;
    state: LoadState;
  },
  latestSourceHealth: CollectorSourceHealthProjection | null
): HudReadModelStatus | null {
  const data = latestSourceHealth ?? sourceHealthResource.data;

  if (data || sourceHealthResource.state === 'loading') {
    return null;
  }

  if (sourceHealthResource.error) {
    return {
      label: 'Source health',
      summary: 'Unavailable',
      detail: `Read model unavailable · ${sourceHealthResource.error}`,
      tone: 'unavailable'
    };
  }

  if (sourceHealthResource.state === 'ready') {
    return {
      label: 'Source health',
      summary: 'No snapshot',
      detail: 'Read model has no source health snapshot yet.',
      tone: 'unavailable'
    };
  }

  return null;
}

function resolveSourceGapReadModelStatus(
  sourceGapResource: SourceGapReadState,
  sourceGapSummaryResource: SourceGapSummaryReadState,
  sourceGapChipCount: number
): HudReadModelStatus | null {
  if (sourceGapChipCount > 0) {
    return null;
  }

  const sourceGapDataReady = sourceGapResource.data !== null;
  const sourceGapSummaryReady = sourceGapSummaryResource.data !== null;

  if (
    (sourceGapResource.error && !sourceGapDataReady) ||
    (sourceGapSummaryResource.error && !sourceGapSummaryReady)
  ) {
    return {
      label: 'Source gaps',
      summary: 'Unavailable',
      detail: 'Read model unavailable',
      tone: 'unavailable'
    };
  }

  if (sourceGapResource.state === 'loading' || sourceGapSummaryResource.state === 'loading') {
    return null;
  }

  if (
    sourceGapResource.state === 'ready' &&
    sourceGapResource.data?.length === 0 &&
    sourceGapSummaryResource.state === 'ready' &&
    (!sourceGapSummaryResource.data || sourceGapSummaryResource.data.total_count === 0)
  ) {
    return {
      label: 'Source gaps',
      summary: 'No rows',
      detail: 'Runtime source-gap read model has no rows in the current slice.',
      tone: 'unavailable'
    };
  }

  return null;
}

function resolveHotZoneFocusMeta(zone: HotZoneSummary) {
  const parts = [
    `${HOT_ZONE_SEVERITY_LABELS[zone.highest_severity]} severity`,
    `${zone.occupant_count} ${zone.occupant_count === 1 ? 'agent' : 'agents'}`
  ];

  if (zone.blocked_count > 0) {
    parts.push(`${zone.blocked_count} blocked`);
  }

  if (zone.reboot_count > 0) {
    parts.push(`${zone.reboot_count} reboot`);
  }

  if (zone.open_alert_or_incident_occupant_count > 0) {
    parts.push(`${zone.open_alert_or_incident_occupant_count} alert/incident`);
  }

  if (zone.runtime_freshness_degraded_count > 0) {
    parts.push(`${zone.runtime_freshness_degraded_count} runtime stale`);
  }

  return parts.join(' · ');
}

export function resolveViewportToplineStatus(
  state: LoadState,
  error: string | null,
  generatedAt: string | null | undefined
) {
  if (generatedAt) {
    return {
      status: error ? `Office snapshot · Refresh failed · ${error}` : 'Office snapshot · Live',
      snapshot: `Snapshot ${generatedAt}`
    };
  }

  if (state === 'loading') {
    return {
      status: 'Office snapshot · Loading',
      snapshot: 'Waiting for first office snapshot'
    };
  }

  if (error) {
    return {
      status: `Office snapshot · Unavailable · ${error}`,
      snapshot: 'No office snapshot loaded yet'
    };
  }

  return {
    status: 'Office snapshot · Loading',
    snapshot: 'Waiting for first office snapshot'
  };
}

export function resolveOverviewRefreshWarning(error: string | null, hasOverviewData: boolean) {
  if (!error || !hasOverviewData) {
    return null;
  }

  return error;
}

function resolveIncidentFeedHeaderStatus(
  state: LoadState,
  error: string | null,
  incidentFeed: { items: unknown[] } | null
) {
  if (incidentFeed) {
    return {
      count: incidentFeed.items.length,
      status: error ? 'Refresh failed' : null,
      detail: error
    };
  }

  if (state === 'loading') {
    return {
      count: '--',
      status: 'Loading',
      detail: null
    };
  }

  if (error) {
    return {
      count: '--',
      status: 'Unavailable',
      detail: error
    };
  }

  return {
    count: 0,
    status: null,
    detail: null
  };
}

function resolveCorrelationPollKey(selectedCorrelationId: string | null) {
  return selectedCorrelationId;
}

function resolveCorrelationSelectionContext(selectedAgentId: string | null) {
  return selectedAgentId ?? '__crew-overview__';
}

function resolveMemoryArtifactResourceKey(
  selectedAgentId: string | null,
  selectedCorrelationId: string | null
) {
  return `memory-artifacts:${selectedAgentId ?? 'crew-overview'}:${selectedCorrelationId ?? '__all__'}`;
}

function resolveDirectOperationSelection(agentId: string | null, correlationId: string | null) {
  if (!agentId || correlationId !== null) {
    return null;
  }

  return { agentId };
}

function resolveOperationSnapshotSeed(
  agentId: string | null,
  operations: { items: OfficeOperation[] } | null
) {
  if (!agentId) {
    return null;
  }

  return operations?.items.find((operation) => operation.agent_id === agentId) ?? null;
}

function resolveSharedMemoryCorrelationId(
  selectedAgentId: string | null,
  selectedCorrelationId: string | null,
  selectedCorrelationWasExplicit: boolean
) {
  if (!selectedCorrelationId) {
    return null;
  }

  if (selectedAgentId) {
    return selectedCorrelationId;
  }

  return selectedCorrelationWasExplicit ? selectedCorrelationId : null;
}

function resolveSharedMemoryRequestScopeLabel(
  selectedAgentId: string | null,
  sharedMemoryCorrelationId: string | null
) {
  if (selectedAgentId) {
    return sharedMemoryCorrelationId
      ? `${selectedAgentId} · ${sharedMemoryCorrelationId}`
      : selectedAgentId;
  }

  return sharedMemoryCorrelationId
    ? `Crew overview · ${sharedMemoryCorrelationId}`
    : 'Crew overview';
}

function resolveSharedMemoryArtifactDomId(artifactRef: string) {
  return `aitown-shared-memory-${encodeURIComponent(artifactRef)}`;
}

function focusSharedMemoryArtifactInDom(artifactRef: string) {
  if (typeof document === 'undefined') {
    return false;
  }

  const target = document.getElementById(resolveSharedMemoryArtifactDomId(artifactRef));
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (!isHubElementVisible(target)) {
    return false;
  }

  target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  target.focus();
  return true;
}

function sortMemoryArtifacts(artifacts: MemoryArtifact[]) {
  return [...artifacts].sort((left, right) => {
    const rightLastSeen = Date.parse(right.last_seen_at ?? '') || 0;
    const leftLastSeen = Date.parse(left.last_seen_at ?? '') || 0;
    const lastSeenDelta = rightLastSeen - leftLastSeen;
    if (lastSeenDelta !== 0) {
      return lastSeenDelta;
    }

    if (right.mention_count !== left.mention_count) {
      return right.mention_count - left.mention_count;
    }

    return left.artifact_ref.localeCompare(right.artifact_ref);
  });
}

function resolveSelectedAgentSupervisionHistoryCorrelationId(
  selectedAgentId: string | null,
  selectedCorrelationId: string | null,
  defaultCorrelationId: string | null,
  preserveNullCorrelation: boolean
) {
  if (!selectedAgentId) {
    return null;
  }

  if (preserveNullCorrelation) {
    return null;
  }

  return selectedCorrelationId ?? defaultCorrelationId;
}

function resolveSelectedAgentSupervisionHistoryRequestScopeLabel(
  selectedAgentId: string | null,
  selectedCorrelationId: string | null
) {
  if (!selectedAgentId) {
    return 'Target agent';
  }

  return selectedCorrelationId
    ? `Target agent · ${selectedAgentId} · Active correlation · ${selectedCorrelationId}`
    : `Target agent · ${selectedAgentId}`;
}

function resolveCrewReplayCorrelationId(
  selectedAgentId: string | null,
  selectedCorrelationId: string | null,
  selectedCorrelationWasExplicit: boolean
) {
  if (selectedAgentId !== null || !selectedCorrelationWasExplicit) {
    return null;
  }

  return selectedCorrelationId;
}

function parseLookbackWindowMs(window: string): number | null {
  const match = /^(\d+)([smhd])$/.exec(window.trim());
  if (!match) {
    return null;
  }

  const value = Number.parseInt(match[1] ?? '', 10);
  if (!Number.isFinite(value)) {
    return null;
  }

  const unit = match[2];
  const unitMs =
    unit === 's'
      ? 1000
      : unit === 'm'
        ? 60 * 1000
        : unit === 'h'
          ? 60 * 60 * 1000
          : 24 * 60 * 60 * 1000;

  return value * unitMs;
}

const CREW_DEFAULT_CORRELATION_WINDOW_MS = parseLookbackWindowMs(DEFAULT_WORKFLOW_WINDOW) ?? 60 * 60 * 1000;
const CREW_DEFAULT_CORRELATION_LIVE_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

function isIncidentInsideLookbackWindow(ts: string, referenceTs: string, windowMs: number) {
  const incidentTs = Date.parse(ts);
  const referenceTime = Date.parse(referenceTs);

  if (!Number.isFinite(incidentTs) || !Number.isFinite(referenceTime)) {
    return false;
  }

  return referenceTime >= incidentTs && referenceTime - incidentTs <= windowMs;
}

function resolveIncidentCorrelationActivityTs(incident: {
  ts: string;
  correlation_latest_activity_at?: string | null;
}) {
  const latestActivityTs = incident.correlation_latest_activity_at ?? null;
  return latestActivityTs && Number.isFinite(Date.parse(latestActivityTs)) ? latestActivityTs : incident.ts;
}

function resolveCrewDefaultCorrelationReferenceTs(
  incidentFeed: { items: Array<{ ts: string }> } | null,
  overviewGeneratedAt: string | null,
  currentTs: string | null
) {
  const overviewTs = overviewGeneratedAt && Number.isFinite(Date.parse(overviewGeneratedAt)) ? overviewGeneratedAt : null;
  const latestIncidentTs = incidentFeed?.items[0]?.ts ?? null;
  const incidentTs = latestIncidentTs && Number.isFinite(Date.parse(latestIncidentTs)) ? latestIncidentTs : null;
  const freshestSnapshotTs = !overviewTs
    ? incidentTs
    : !incidentTs
      ? overviewTs
      : Date.parse(incidentTs) > Date.parse(overviewTs)
        ? incidentTs
        : overviewTs;

  if (!freshestSnapshotTs) {
    return null;
  }

  const currentReferenceTs = currentTs && Number.isFinite(Date.parse(currentTs)) ? currentTs : null;
  if (!currentReferenceTs) {
    return freshestSnapshotTs;
  }

  const currentReferenceMs = Date.parse(currentReferenceTs);
  const freshestSnapshotMs = Date.parse(freshestSnapshotTs);
  if (
    currentReferenceMs >= freshestSnapshotMs &&
    currentReferenceMs - freshestSnapshotMs <= CREW_DEFAULT_CORRELATION_LIVE_CLOCK_SKEW_MS
  ) {
    return currentReferenceTs;
  }

  return freshestSnapshotTs;
}

function selectDefaultCorrelationId({
  incidentFeed,
  selectedOperation,
  workflow,
  selectedAgentId,
  referenceTs
}: {
  incidentFeed: { items: Array<{ correlation_id: string | null; ts: string; correlation_latest_activity_at?: string | null }> } | null;
  selectedOperation: OfficeOperation | null;
  workflow: {
    detail: { open_peer_watch_alerts: Array<{ correlation_id: string | null }> };
    correlation_ids: string[];
  } | null;
  selectedAgentId: string | null;
  referenceTs: string | null;
}) {
  if (selectedAgentId) {
    if (selectedOperation?.correlation_id) {
      return selectedOperation.correlation_id;
    }

    const workflowCorrelation = workflow?.detail.open_peer_watch_alerts.find((alert) => alert.correlation_id)?.correlation_id;
    if (workflowCorrelation) {
      return workflowCorrelation;
    }

    const workflowFallbackCorrelation = workflow?.correlation_ids.find(Boolean) ?? null;
    if (workflowFallbackCorrelation) {
      return workflowFallbackCorrelation;
    }

    return null;
  }

  if (!referenceTs) {
    return incidentFeed?.items.find((incident) => incident.correlation_id)?.correlation_id ?? null;
  }

  return (
    incidentFeed?.items.find(
      (incident) =>
        incident.correlation_id &&
        isIncidentInsideLookbackWindow(
          resolveIncidentCorrelationActivityTs(incident),
          referenceTs,
          CREW_DEFAULT_CORRELATION_WINDOW_MS
        )
    )?.correlation_id ?? null
  );
}

type WorkflowEvidenceRecord = {
  correlation_id: string | null;
  evidence_refs: string[];
};

function selectFirstEvidenceRef(records: WorkflowEvidenceRecord[], correlationId: string | null) {
  if (correlationId) {
    return records.find((record) => record.correlation_id === correlationId && record.evidence_refs.length > 0)?.evidence_refs[0] ?? null;
  }

  return records.find((record) => record.evidence_refs.length > 0)?.evidence_refs[0] ?? null;
}

export function resolveSelectedAgentPeekEvidenceRef({
  selectedOperation,
  workflow,
  correlationId
}: {
  selectedOperation: OfficeOperation | null;
  workflow: WorkflowDetail | null;
  correlationId: string | null;
}) {
  const operationEvidenceRef = selectedOperation?.latest_event?.evidence_refs[0] ?? null;
  const operationCorrelationId = selectedOperation?.correlation_id ?? null;

  if (operationEvidenceRef && (!correlationId || operationCorrelationId === correlationId)) {
    return operationEvidenceRef;
  }

  if (!workflow) {
    return null;
  }

  return selectFirstEvidenceRef(
    [
      ...workflow.open_peer_watch_alerts,
      ...workflow.recent_events,
      ...workflow.recent_incidents,
      ...workflow.recent_handoffs,
      ...workflow.recent_reboots,
      ...workflow.recent_interactions
    ],
    correlationId
  );
}

function resolveSelectedAgentSourceSummary(sourceMatrix: ReturnType<typeof deriveSelectedAgentSourceMatrixViewModel>) {
  if (sourceMatrix.status === 'ready' || sourceMatrix.status === 'last-good') {
    const classCount = sourceMatrix.rows.length;
    const classLabel = classCount === 1 ? 'class' : 'classes';
    const unmappedCount = sourceMatrix.unmappedSummary.totalCount;
    const unmappedLabel = unmappedCount > 0 ? ` · ${unmappedCount} unmapped` : '';

    return `Sources · ${classCount} ${classLabel}${unmappedLabel}`;
  }

  if (sourceMatrix.status === 'loading') {
    return 'Sources · Loading';
  }

  if (sourceMatrix.status === 'error') {
    return 'Sources · Unavailable';
  }

  if (sourceMatrix.selectedAgentId) {
    return 'Sources · No mapped classes';
  }

  return null;
}

function AppInner() {
  const { selectedAgentId, setSelectedAgentId, setWorld } = useWorld();
  const [hubOpen, setHubOpen] = useState(false);
  const [activeHubCategory, setActiveHubCategory] = useState<HubCategory>('crew');
  const [resetViewSignal, setResetViewSignal] = useState(0);
  const [agentFocusRequest, setAgentFocusRequest] = useState<AgentFocusRequest | null>(null);
  const [zoneFocusRequest, setZoneFocusRequest] = useState<ZoneFocusRequest | null>(null);
  const [selectedCorrelationId, setSelectedCorrelationId] = useState<string | null>(null);
  const [selectedCorrelationWasExplicit, setSelectedCorrelationWasExplicit] = useState(false);
  const [selectedCorrelationCarryForward, setSelectedCorrelationCarryForward] = useState(false);
  const [selectedCrewReplaySeverity, setSelectedCrewReplaySeverity] = useState<Severity | null>(null);
  const [selectedCrewOpenSupervisionSeverity, setSelectedCrewOpenSupervisionSeverity] =
    useState<Severity | null>(null);
  const [selectedAgentSupervisionHistoryFilter, setSelectedAgentSupervisionHistoryFilter] = useState<{
    agentId: string;
    severity: Severity | null;
  } | null>(null);
  const selectedAgentSupervisionHistorySeverity =
    selectedAgentId !== null && selectedAgentSupervisionHistoryFilter?.agentId === selectedAgentId
      ? selectedAgentSupervisionHistoryFilter.severity
      : null;
  const [selectedAgentReplayFilter, setSelectedAgentReplayFilter] = useState<{
    agentId: string;
    severity: Severity | null;
  } | null>(null);
  const selectedAgentReplaySeverity =
    selectedAgentId !== null && selectedAgentReplayFilter?.agentId === selectedAgentId
      ? selectedAgentReplayFilter.severity
      : null;
  const [selectedOperationsState, setSelectedOperationsState] = useState<string | null>(null);
  const [selectedOperationsSeverity, setSelectedOperationsSeverity] = useState<Severity | null>(null);
  const [selectedOperationSelection, setSelectedOperationSelection] = useState<OperationSelection | null>(null);
  const [selectedOperationSnapshot, setSelectedOperationSnapshot] = useState<OfficeOperation | null>(null);
  const [activeCorrelationQueueSnapshot, setActiveCorrelationQueueSnapshot] = useState<OfficeOperations | null>(null);
  const [activeCorrelationQueueSnapshotError, setActiveCorrelationQueueSnapshotError] = useState<string | null>(null);
  const [invalidSelectedOperationCorrelationId, setInvalidSelectedOperationCorrelationId] = useState<string | null>(null);
  const [focusedExactMemoryArtifact, setFocusedExactMemoryArtifact] = useState<MemoryArtifact | null>(null);
  const [focusedSharedMemoryArtifactRef, setFocusedSharedMemoryArtifactRef] = useState<string | null>(null);
  const [sharedMemoryJumpStatus, setSharedMemoryJumpStatus] = useState<string | null>(null);
  const [replayCheckpointFocus, setReplayCheckpointFocus] = useState<ReplayCheckpointFocus | null>(null);
  const [selectedAgentReplayEvidenceId, setSelectedAgentReplayEvidenceId] = useState<string | null>(null);
  const [cachedCorrelationSpotlight, setCachedCorrelationSpotlight] = useState<CorrelationSpotlight | null>(null);
  const [selectedAgentDrilldownTab, setSelectedAgentDrilldownTab] =
    useState<SelectedAgentDrilldownTab>('now');
  const [selectedAgentEvidenceRecord, setSelectedAgentEvidenceRecord] =
    useState<EvidenceRecord | null>(null);
  const [selectedAgentEvidenceRecordId, setSelectedAgentEvidenceRecordId] =
    useState<string | null>(null);
  const [selectedAgentEvidenceRecordState, setSelectedAgentEvidenceRecordState] =
    useState<LoadState>('idle');
  const [selectedAgentEvidenceRecordError, setSelectedAgentEvidenceRecordError] =
    useState<string | null>(null);
  const [selectedAgentEvidenceProvenanceBundle, setSelectedAgentEvidenceProvenanceBundle] =
    useState<EvidenceProvenanceBundle | null>(null);
  const [selectedAgentEvidenceProvenanceBundleState, setSelectedAgentEvidenceProvenanceBundleState] =
    useState<LoadState>('idle');
  const [selectedAgentEvidenceProvenanceBundleError, setSelectedAgentEvidenceProvenanceBundleError] =
    useState<string | null>(null);
  const [selectedAgentEvidenceCheckpointLog, setSelectedAgentEvidenceCheckpointLog] =
    useState<ReplayCheckpointLogResponse | null>(null);
  const [selectedAgentEvidenceCheckpointLogState, setSelectedAgentEvidenceCheckpointLogState] =
    useState<LoadState>('idle');
  const [selectedAgentEvidenceCheckpointLogError, setSelectedAgentEvidenceCheckpointLogError] =
    useState<string | null>(null);
  const [selectedAgentEvidenceSourceContext, setSelectedAgentEvidenceSourceContext] =
    useState<EvidenceSourceContext | null>(null);
  const [selectedAgentEvidenceSourceContextState, setSelectedAgentEvidenceSourceContextState] =
    useState<LoadState>('idle');
  const [selectedAgentEvidenceSourceContextError, setSelectedAgentEvidenceSourceContextError] =
    useState<string | null>(null);
  const [selectedAgentEvidenceReplayWindow, setSelectedAgentEvidenceReplayWindow] =
    useState<EvidenceReplayWindow | null>(null);
  const [selectedAgentEvidenceReplayWindowState, setSelectedAgentEvidenceReplayWindowState] =
    useState<LoadState>('idle');
  const [selectedAgentEvidenceReplayWindowError, setSelectedAgentEvidenceReplayWindowError] =
    useState<string | null>(null);
  const [defaultEvidenceCoverage, setDefaultEvidenceCoverage] =
    useState<CollectorEvidenceCoverage | null>(null);
  const [defaultEvidenceCoverageState, setDefaultEvidenceCoverageState] =
    useState<LoadState>('idle');
  const [defaultEvidenceCoverageError, setDefaultEvidenceCoverageError] =
    useState<string | null>(null);
  const [latestSourceHealth, setLatestSourceHealth] =
    useState<CollectorSourceHealthProjection | null>(null);
  const [previousSourceHealth, setPreviousSourceHealth] =
    useState<CollectorSourceHealthProjection | null>(null);
  const [sourceGapFocusIntent, setSourceGapFocusIntent] =
    useState<SourceGapFocusIntent | null>(null);
  const requestedSelectedAgentDrilldownTabRef = useRef<SelectedAgentDrilldownTab | null>(null);
  const activeHubCategoryFromSelectedAgentTabRef = useRef(false);
  const defaultEvidenceCoverageRequestedRef = useRef(false);
  const lastSelectedAgentRef = useRef<OfficeAgent | null>(null);
  const correlationSelectionModeRef = useRef<'auto' | 'manual' | 'preserved'>('auto');
  const lastCorrelationContextRef = useRef<string | null>(null);
  const hubTriggerRef = useRef<HTMLButtonElement | null>(null);
  const hubCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const hubDialogRef = useRef<HTMLDivElement | null>(null);
  const hubFocusReturnRef = useRef<HTMLElement | null>(null);
  const pendingSharedMemoryFocusRef = useRef<string | null>(null);
  const sharedMemoryJumpRequestIdRef = useRef(0);
  const agentFocusRequestIdRef = useRef(0);
  const evidenceRecordDetailRequestIdRef = useRef(0);
  const evidenceRecordDetailAbortControllerRef = useRef<AbortController | null>(null);
  const evidenceSourceContextRequestIdRef = useRef(0);
  const evidenceSourceContextAbortControllerRef = useRef<AbortController | null>(null);
  const evidenceReplayWindowRequestIdRef = useRef(0);
  const evidenceReplayWindowAbortControllerRef = useRef<AbortController | null>(null);
  const zoneFocusRequestIdRef = useRef(0);
  const sourceGapFocusRequestIdRef = useRef(0);
  const wasHubOpenRef = useRef(false);

  const clearSelectedAgentEvidenceRecordDetail = useCallback(() => {
    evidenceRecordDetailRequestIdRef.current += 1;
    evidenceRecordDetailAbortControllerRef.current?.abort();
    evidenceRecordDetailAbortControllerRef.current = null;
    evidenceSourceContextRequestIdRef.current += 1;
    evidenceSourceContextAbortControllerRef.current?.abort();
    evidenceSourceContextAbortControllerRef.current = null;
    evidenceReplayWindowRequestIdRef.current += 1;
    evidenceReplayWindowAbortControllerRef.current?.abort();
    evidenceReplayWindowAbortControllerRef.current = null;
    setSelectedAgentEvidenceRecord(null);
    setSelectedAgentEvidenceRecordId(null);
    setSelectedAgentEvidenceRecordError(null);
    setSelectedAgentEvidenceRecordState('idle');
    setSelectedAgentEvidenceProvenanceBundle(null);
    setSelectedAgentEvidenceProvenanceBundleError(null);
    setSelectedAgentEvidenceProvenanceBundleState('idle');
    setSelectedAgentEvidenceCheckpointLog(null);
    setSelectedAgentEvidenceCheckpointLogError(null);
    setSelectedAgentEvidenceCheckpointLogState('idle');
    setSelectedAgentEvidenceSourceContext(null);
    setSelectedAgentEvidenceSourceContextError(null);
    setSelectedAgentEvidenceSourceContextState('idle');
    setSelectedAgentEvidenceReplayWindow(null);
    setSelectedAgentEvidenceReplayWindowError(null);
    setSelectedAgentEvidenceReplayWindowState('idle');
  }, []);

  const overviewResource = usePolledResource({
    load: (signal) => fetchOfficeOverview(signal),
    resourceKey: 'office-overview'
  });

  const incidentFeedResource = usePolledResource({
    load: (signal) =>
      fetchIncidents({
        limit: CREW_INCIDENT_FEED_LIMIT,
        window: CREW_INCIDENT_FEED_WINDOW,
        signal
      }),
    resourceKey: 'incident-feed'
  });
  const crewReplayCorrelationId = resolveCrewReplayCorrelationId(
    selectedAgentId,
    selectedCorrelationId,
    selectedCorrelationWasExplicit
  );
  const crewReplayCheckpointEventId =
    replayCheckpointFocus &&
    selectedAgentId === null &&
    replayCheckpointFocus.selectedAgentId === null &&
    replayCheckpointFocus.selectedCorrelationId === selectedCorrelationId
      ? replayCheckpointFocus.eventId
      : null;
  const activeCrewReplaySeverity = crewReplayCheckpointEventId ? null : selectedCrewReplaySeverity;
  const timelineReplayResource = usePolledResource({
    enabled: hubOpen && selectedAgentId === null,
    load: (signal) =>
      fetchTimeline({
        limit: CREW_TIMELINE_LIMIT,
        window: DEFAULT_WORKFLOW_WINDOW,
        severity: activeCrewReplaySeverity ?? undefined,
        correlationId: crewReplayCorrelationId ?? undefined,
        eventId: crewReplayCheckpointEventId ?? undefined,
        signal
      }),
    resourceKey: `timeline-replay:severity=${activeCrewReplaySeverity ?? '__all__'}:correlation=${crewReplayCorrelationId ?? '__all__'}:event=${crewReplayCheckpointEventId ?? '__all__'}`
  });
  const crewOpenSupervisionAlertsResource = usePolledResource({
    enabled: hubOpen && selectedAgentId === null,
    load: (signal) =>
      fetchPeerWatchAlerts({
        status: 'open',
        severity: selectedCrewOpenSupervisionSeverity ?? undefined,
        limit: CREW_OPEN_SUPERVISION_ALERTS_LIMIT,
        signal
      }),
    resourceKey: `crew-open-supervision-alerts:severity=${selectedCrewOpenSupervisionSeverity ?? '__all__'}`
  });
  const collectorSnapshotResource = usePolledResource({
    enabled: hubOpen,
    load: (signal) => fetchCollectorSnapshot(signal),
    resourceKey: 'collector-controller-snapshot'
  });
  const collectorSnapshotSummaryResource = usePolledResource({
    enabled: overviewResource.data !== null,
    load: (signal) => fetchCollectorSnapshotSummary(signal),
    resourceKey: 'collector-controller-snapshot-summary'
  });
  const sourceHealthResource = usePolledResource({
    enabled: overviewResource.data !== null,
    load: (signal) =>
      fetchCollectorSourceHealth({
        limit: SOURCE_HEALTH_HUD_LIMIT,
        signal
      }),
    resourceKey: `collector-source-health:limit=${SOURCE_HEALTH_HUD_LIMIT}`
  });
  const runtimeSourceGapsResource = usePolledResource({
    enabled: overviewResource.data !== null,
    load: (signal) =>
      fetchRuntimeSourceGaps({
        limit: SOURCE_GAP_QUEUE_LIMIT,
        newestFirst: true,
        signal
      }),
    resourceKey: `runtime-source-gaps:limit=${SOURCE_GAP_QUEUE_LIMIT}`
  });
  const runtimeSourceGapsSummaryResource = usePolledResource({
    enabled: overviewResource.data !== null,
    load: (signal) =>
      fetchRuntimeSourceGapsSummary({
        limit: SOURCE_GAP_QUEUE_LIMIT,
        newestFirst: true,
        signal
      }),
    resourceKey: `runtime-source-gaps-summary:limit=${SOURCE_GAP_QUEUE_LIMIT}`
  });
  const selectedSourceGapLifecycleSourceKind =
    selectedAgentId !== null && sourceGapFocusIntent?.agentId === selectedAgentId
      ? resolveRuntimeSourceGapLifecycleApiSourceKind(sourceGapFocusIntent.sourceKind)
      : null;
  const selectedAgentRuntimeSourceGapLifecycleResource = usePolledResource<RuntimeSourceGapLifecycle>({
    enabled:
      selectedAgentId !== null &&
      sourceGapFocusIntent?.agentId === selectedAgentId &&
      selectedSourceGapLifecycleSourceKind !== null &&
      overviewResource.data !== null,
    load: async (signal) => {
      const [mappedLifecycle, unmappedLifecycle] = await Promise.all([
        fetchRuntimeSourceGapLifecycle({
          agentId: selectedAgentId,
          sourceKind: selectedSourceGapLifecycleSourceKind,
          sourceStatus: sourceGapFocusIntent?.status ?? null,
          mapped: true,
          newestFirst: true,
          limit: SOURCE_GAP_QUEUE_LIMIT,
          signal
        }),
        fetchRuntimeSourceGapLifecycle({
          sourceKind: selectedSourceGapLifecycleSourceKind,
          mapped: false,
          newestFirst: true,
          limit: SOURCE_GAP_QUEUE_LIMIT,
          signal
        })
      ]);

      return mergeRuntimeSourceGapLifecycles(mappedLifecycle, unmappedLifecycle);
    },
    resourceKey:
      selectedAgentId && sourceGapFocusIntent?.agentId === selectedAgentId && selectedSourceGapLifecycleSourceKind
        ? [
            'runtime-source-gaps-lifecycle',
            `agent_id=${selectedAgentId}`,
            `source_kind=${selectedSourceGapLifecycleSourceKind}`,
            `source_status=${sourceGapFocusIntent.status}`,
            `request=${sourceGapFocusIntent.requestId}`,
            `limit=${SOURCE_GAP_QUEUE_LIMIT}`
          ].join(':')
        : null
  });
  const selectedAgentEvidenceSpineSummaryResource = usePolledResource<AgentEvidenceSpineSummary>({
    enabled: selectedAgentId !== null && overviewResource.data !== null,
    load: (signal) => fetchAgentEvidenceSpineSummary({ signal }),
    resourceKey: selectedAgentId ? `selected-agent-evidence-spine-summary:${selectedAgentId}` : null
  });
  const selectedAgentEvidenceSourceMatrixResource = usePolledResource<AgentEvidenceSourceMatrix>({
    enabled: selectedAgentId !== null && overviewResource.data !== null,
    load: (signal) => fetchAgentEvidenceSourceMatrix({ signal }),
    resourceKey: selectedAgentId ? `selected-agent-evidence-source-matrix:${selectedAgentId}` : null
  });
  const defaultEvidenceCoverageReady = overviewResource.data !== null;

  useEffect(() => {
    if (sourceHealthResource.state === 'ready') {
      if (
        latestSourceHealth &&
        sourceHealthResource.data &&
        latestSourceHealth.collector_snapshot_id !== sourceHealthResource.data.collector_snapshot_id
      ) {
        setPreviousSourceHealth(latestSourceHealth);
      }

      setLatestSourceHealth(sourceHealthResource.data);
    }
  }, [latestSourceHealth, sourceHealthResource.data, sourceHealthResource.state]);

  useEffect(() => {
    if (hubOpen || selectedAgentId !== null || !defaultEvidenceCoverageReady || defaultEvidenceCoverageRequestedRef.current) {
      return undefined;
    }

    defaultEvidenceCoverageRequestedRef.current = true;
    setDefaultEvidenceCoverageState('loading');
    setDefaultEvidenceCoverageError(null);
    const controller = new AbortController();
    let settled = false;

    void fetchCollectorEvidenceCoverage({ signal: controller.signal })
      .then((coverage) => {
        setDefaultEvidenceCoverage(coverage);
        setDefaultEvidenceCoverageError(null);
        setDefaultEvidenceCoverageState('ready');
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error && error.name === 'AbortError')) {
          setDefaultEvidenceCoverage(null);
          setDefaultEvidenceCoverageError(formatUnknownError(error));
          setDefaultEvidenceCoverageState('error');
        }
      })
      .finally(() => {
        settled = true;
      });

    return () => {
      if (!settled) {
        defaultEvidenceCoverageRequestedRef.current = false;
      }
      controller.abort();
    };
  }, [defaultEvidenceCoverageReady, hubOpen, selectedAgentId]);

  useEffect(() => {
    if (collectorSnapshotResource.state === 'ready') {
      setDefaultEvidenceCoverage(collectorSnapshotResource.data?.evidence_coverage ?? null);
      setDefaultEvidenceCoverageError(collectorSnapshotResource.error);
      setDefaultEvidenceCoverageState('ready');
    } else if (collectorSnapshotResource.state === 'error' && !defaultEvidenceCoverage) {
      setDefaultEvidenceCoverageError(collectorSnapshotResource.error);
      setDefaultEvidenceCoverageState('error');
    }
  }, [
    collectorSnapshotResource.data,
    collectorSnapshotResource.error,
    collectorSnapshotResource.state,
    defaultEvidenceCoverage
  ]);

  const operationsQueueEnabled = hubOpen && (selectedAgentId === null || selectedOperationSelection !== null);

  const operationsResource = usePolledResource({
    enabled: operationsQueueEnabled,
    load: (signal) =>
      fetchOfficeOperations({
        limit: selectedOperationSelection ? undefined : 4,
        state: selectedOperationSelection ? undefined : selectedOperationsState ?? undefined,
        severity: selectedOperationSelection ? undefined : selectedOperationsSeverity ?? undefined,
        agentId: selectedOperationSelection?.agentId,
        signal
      }),
    resourceKey: selectedOperationSelection
      ? `office-operations:${selectedOperationSelection.agentId}`
      : `office-operations:state=${selectedOperationsState ?? '__all__'}:severity=${selectedOperationsSeverity ?? '__all__'}`
  });
  const crewOverviewStateBucketsResource = usePolledResource({
    enabled: hubOpen && selectedAgentId === null && selectedOperationSelection === null,
    load: (signal) => fetchOfficeOperations({ signal }),
    resourceKey: 'office-operations-state-buckets'
  });

  const selectedAgentStillVisibleInOverview = useMemo(
    () =>
      selectedAgentId !== null &&
      (overviewResource.data?.agents.some((agent) => agent.agent_id === selectedAgentId) ?? false),
    [overviewResource.data, selectedAgentId]
  );

  const workflowResource = usePolledResource({
    enabled: hubOpen && selectedAgentId !== null,
    load: (signal) =>
      fetchAgentWorkflow(selectedAgentId!, {
        limit: DEFAULT_WORKFLOW_LIMIT,
        window: DEFAULT_WORKFLOW_WINDOW,
        signal
      }),
    onError: (error) => {
      if (
        error instanceof RequestError &&
        error.code === 'not_found' &&
        !selectedAgentStillVisibleInOverview
      ) {
        clearSelectedAgentEvidenceRecordDetail();
        setSelectedAgentId(null);
      }
    },
    resourceKey: selectedAgentId
  });
  const previousSelectedAgentWorkflowResourceKeyRef = useRef<string | null>(selectedAgentId);
  const selectedAgentWorkflowSelectionChanged =
    selectedAgentId !== null && previousSelectedAgentWorkflowResourceKeyRef.current !== selectedAgentId;
  const workflowPayloadMatchesSelectedAgent = workflowResource.data?.agent_id === selectedAgentId;
  const selectedAgentWorkflowSurfaceIsStale =
    selectedAgentWorkflowSelectionChanged ||
    (workflowResource.data !== null && !workflowPayloadMatchesSelectedAgent);
  const activeWorkflow =
    !selectedAgentWorkflowSurfaceIsStale && workflowPayloadMatchesSelectedAgent ? workflowResource.data : null;
  const workflowError = selectedAgentWorkflowSurfaceIsStale ? null : workflowResource.error;
  const workflowState: LoadState = selectedAgentWorkflowSurfaceIsStale ? 'loading' : workflowResource.state;

  useEffect(() => {
    previousSelectedAgentWorkflowResourceKeyRef.current = selectedAgentId;
  }, [selectedAgentId]);
  const sharedMemoryCorrelationId = resolveSharedMemoryCorrelationId(
    selectedAgentId,
    selectedCorrelationId,
    selectedCorrelationWasExplicit
  );
  const sharedMemoryRequestScopeLabel = resolveSharedMemoryRequestScopeLabel(
    selectedAgentId,
    sharedMemoryCorrelationId
  );
  const memoryArtifactResourceKey = resolveMemoryArtifactResourceKey(selectedAgentId, sharedMemoryCorrelationId);

  const memoryArtifactsResource = usePolledResource({
    enabled: hubOpen,
    load: (signal) =>
      fetchMemoryArtifacts({
        limit: MEMORY_ARTIFACT_LIMIT,
        window: DEFAULT_WORKFLOW_WINDOW,
        agentId: selectedAgentId ?? undefined,
        correlationId: sharedMemoryCorrelationId ?? undefined,
        signal
      }),
    resourceKey: memoryArtifactResourceKey
  });

  useEffect(() => {
    pendingSharedMemoryFocusRef.current = null;
    sharedMemoryJumpRequestIdRef.current += 1;
    setFocusedExactMemoryArtifact(null);
    setFocusedSharedMemoryArtifactRef(null);
    setSharedMemoryJumpStatus(null);
  }, [memoryArtifactResourceKey]);

  useEffect(() => {
    setReplayCheckpointFocus(null);
    setSelectedAgentReplayEvidenceId(null);
  }, [selectedAgentId, selectedCorrelationId]);

  const memoryArtifacts = useMemo<MemoryArtifactIndex | null>(() => {
    if (!memoryArtifactsResource.data && !focusedExactMemoryArtifact) {
      return null;
    }

    const mergedArtifacts = new Map<string, MemoryArtifact>();

    for (const artifact of memoryArtifactsResource.data?.items ?? []) {
      mergedArtifacts.set(artifact.artifact_ref, artifact);
    }

    if (focusedExactMemoryArtifact) {
      mergedArtifacts.set(focusedExactMemoryArtifact.artifact_ref, focusedExactMemoryArtifact);
    }

    return {
      generated_at: memoryArtifactsResource.data?.generated_at ?? new Date().toISOString(),
      items: sortMemoryArtifacts(Array.from(mergedArtifacts.values()))
    };
  }, [focusedExactMemoryArtifact, memoryArtifactsResource.data]);

  useEffect(() => {
    const artifactRef = pendingSharedMemoryFocusRef.current;
    if (!artifactRef) {
      return;
    }

    if (focusSharedMemoryArtifactInDom(artifactRef)) {
      pendingSharedMemoryFocusRef.current = null;
    }
  }, [hubOpen, memoryArtifacts, selectedAgentDrilldownTab]);

  const correlationResource = usePolledResource({
    enabled: hubOpen && selectedCorrelationId !== null,
    load: (signal) =>
      fetchCorrelationDrilldown(selectedCorrelationId!, {
        limit: DEFAULT_WORKFLOW_LIMIT,
        window: DEFAULT_WORKFLOW_WINDOW,
        signal
      }),
    onError: (error) => {
      if (
        correlationSelectionModeRef.current === 'preserved' &&
        error instanceof RequestError &&
        error.code === 'not_found'
      ) {
        correlationSelectionModeRef.current = 'auto';
        setSelectedCorrelationId(null);
        setSelectedCorrelationWasExplicit(false);
        setSelectedCorrelationCarryForward(false);
      }
    },
    resourceKey: resolveCorrelationPollKey(selectedCorrelationId)
  });

  const activeCorrelation =
    correlationResource.data?.correlation_id === selectedCorrelationId ? correlationResource.data : null;

  useEffect(() => {
    if (activeCorrelation) {
      setCachedCorrelationSpotlight({
        correlation_id: activeCorrelation.correlation_id,
        participant_agent_ids: activeCorrelation.participant_agent_ids
      });
      return;
    }

    if (!selectedCorrelationId) {
      setCachedCorrelationSpotlight(null);
      return;
    }

    setCachedCorrelationSpotlight((current) =>
      current?.correlation_id === selectedCorrelationId ? current : null
    );
  }, [activeCorrelation, selectedCorrelationId]);

  const activeCorrelationSpotlight = useMemo(() => {
    if (activeCorrelation) {
      return {
        correlation_id: activeCorrelation.correlation_id,
        participant_agent_ids: activeCorrelation.participant_agent_ids
      };
    }

    return cachedCorrelationSpotlight?.correlation_id === selectedCorrelationId
      ? cachedCorrelationSpotlight
      : null;
  }, [activeCorrelation, cachedCorrelationSpotlight, selectedCorrelationId]);

  const activeCorrelationParticipantAgentIds = activeCorrelationSpotlight?.participant_agent_ids ?? [];
  const correlationSelectionContext = resolveCorrelationSelectionContext(selectedAgentId);

  const projectedWorld = useMemo(
    () =>
      projectWorldState({
        overview: overviewResource.data,
        workflows: activeWorkflow && selectedAgentId ? new Map([[selectedAgentId, activeWorkflow]]) : new Map(),
        incidentFeed: incidentFeedResource.data,
        sourceHealth: latestSourceHealth,
        incidentFeedLimit: CREW_INCIDENT_FEED_LIMIT,
        selectedAgentWorkflowPending: selectedAgentId !== null && workflowState === 'loading',
        now: new Date().toISOString(),
      }),
    [activeWorkflow, incidentFeedResource.data, latestSourceHealth, overviewResource.data, selectedAgentId, workflowState]
  );

  useEffect(() => {
    setWorld(projectedWorld);
  }, [projectedWorld, setWorld]);

  const visibleCollectorSnapshot = collectorSnapshotResource.data;
  const visibleEvidenceCoverage =
    collectorSnapshotResource.data?.evidence_coverage ?? defaultEvidenceCoverage;
  const scene = useMemo(
    () =>
      adaptWorldToScene(
        projectedWorld,
        selectedAgentId,
        activeCorrelationSpotlight?.correlation_id ?? null,
        activeCorrelationParticipantAgentIds,
        deriveRuntimeSourceGapWorldPins(runtimeSourceGapsResource.data, overviewResource.data?.agents),
        {
          evidenceSpineSummary: selectedAgentEvidenceSpineSummaryResource.data,
          evidenceCoverage: visibleEvidenceCoverage,
          sourceHealth: latestSourceHealth
        }
      ),
    [
      activeCorrelationParticipantAgentIds,
      activeCorrelationSpotlight?.correlation_id,
      latestSourceHealth,
      overviewResource.data?.agents,
      projectedWorld,
      runtimeSourceGapsResource.data,
      selectedAgentEvidenceSpineSummaryResource.data,
      selectedAgentId,
      visibleEvidenceCoverage
    ]
  );
  const liveFocusAgents = useMemo(() => selectAttentionQueue(projectedWorld), [projectedWorld]);
  const liveFocusReasonLine = useMemo(() => resolveLiveFocusReasonLine(liveFocusAgents), [liveFocusAgents]);
  const hotZones = useMemo(() => selectHotZones(projectedWorld), [projectedWorld]);
  const evidenceCoverageOverviewAgents = useMemo(
    () => overviewResource.data?.agents.filter((agent) => agent.kind === 'employee'),
    [overviewResource.data?.agents]
  );
  const evidenceCoverageFocusSummary = useMemo(
    () =>
      hubOpen || selectedAgentId !== null
        ? {
            visibleItems: [],
            totalGapCount: 0,
            overflowCount: 0
          }
        : deriveCollectorEvidenceCoverageFocusSummary(visibleEvidenceCoverage, evidenceCoverageOverviewAgents),
    [evidenceCoverageOverviewAgents, hubOpen, selectedAgentId, visibleEvidenceCoverage]
  );
  const evidenceCoverageFocusItems = evidenceCoverageFocusSummary.visibleItems;
  const sourceGapChips = useMemo(
    () =>
      hubOpen || selectedAgentId !== null
        ? []
        : deriveRuntimeSourceGapChips(runtimeSourceGapsResource.data, overviewResource.data?.agents),
    [hubOpen, overviewResource.data?.agents, runtimeSourceGapsResource.data, selectedAgentId]
  );
  const sourceGapQueueTotal = runtimeSourceGapsSummaryResource.data?.total_count ?? sourceGapChips.length;
  const hudReadModelsVisible = !hubOpen && selectedAgentId === null;
  const evidenceCoverageReadModelStatus = hudReadModelsVisible
    ? resolveEvidenceCoverageReadModelStatus(
        {
          data: visibleEvidenceCoverage,
          error: defaultEvidenceCoverageError,
          state: defaultEvidenceCoverageState
        }
      )
    : null;
  const sourceHealthReadModelStatus = hudReadModelsVisible
    ? resolveSourceHealthReadModelStatus(sourceHealthResource, latestSourceHealth)
    : null;
  const sourceGapReadModelStatus = hudReadModelsVisible
    ? resolveSourceGapReadModelStatus(
        runtimeSourceGapsResource,
        runtimeSourceGapsSummaryResource,
        sourceGapChips.length
      )
    : null;

  const selectedAgent = resolveSelectedAgent(
    selectedAgentId,
    overviewResource.data?.agents,
    lastSelectedAgentRef.current
  );
  const selectedWorldAgent = selectedAgentId ? projectedWorld.agents.get(selectedAgentId) ?? null : null;

  const liveSelectedOperation = useMemo(() => {
    if (!selectedOperationSelection) {
      return null;
    }

    return operationsResource.data?.items.find((operation) => operation.agent_id === selectedOperationSelection.agentId) ?? null;
  }, [operationsResource.data, selectedOperationSelection]);

  const selectedOperation = useMemo(() => {
    if (!selectedOperationSelection) {
      return null;
    }

    return liveSelectedOperation ?? selectedOperationSnapshot;
  }, [liveSelectedOperation, selectedOperationSelection, selectedOperationSnapshot]);

  const selectedOperationForCorrelationSelection = useMemo(() => {
    if (operationsResource.error) {
      return null;
    }

    if (liveSelectedOperation) {
      return liveSelectedOperation;
    }

    return operationsResource.state === 'loading' ? selectedOperationSnapshot : null;
  }, [liveSelectedOperation, operationsResource.error, operationsResource.state, selectedOperationSnapshot]);

  useEffect(() => {
    const currentOperationCorrelationId = selectedOperationForCorrelationSelection?.correlation_id ?? null;

    if (!currentOperationCorrelationId) {
      if (invalidSelectedOperationCorrelationId !== null) {
        setInvalidSelectedOperationCorrelationId(null);
      }
      return;
    }

    if (
      invalidSelectedOperationCorrelationId !== null &&
      invalidSelectedOperationCorrelationId !== currentOperationCorrelationId
    ) {
      setInvalidSelectedOperationCorrelationId(null);
    }
  }, [invalidSelectedOperationCorrelationId, selectedOperationForCorrelationSelection]);

  useEffect(() => {
    const currentOperationCorrelationId = selectedOperationForCorrelationSelection?.correlation_id ?? null;
    if (!currentOperationCorrelationId) {
      return;
    }

    const selectedOperationCorrelationFailed =
      Boolean(correlationResource.error) &&
      !activeCorrelation &&
      selectedCorrelationId === currentOperationCorrelationId;

    if (
      selectedOperationCorrelationFailed &&
      invalidSelectedOperationCorrelationId !== currentOperationCorrelationId
    ) {
      setInvalidSelectedOperationCorrelationId(currentOperationCorrelationId);
    }
  }, [
    activeCorrelation,
    correlationResource.error,
    invalidSelectedOperationCorrelationId,
    selectedCorrelationId,
    selectedOperationForCorrelationSelection
  ]);

  const selectedOperationForAutoCorrelation = useMemo(() => {
    if (!selectedOperationForCorrelationSelection?.correlation_id) {
      return selectedOperationForCorrelationSelection;
    }

    return invalidSelectedOperationCorrelationId === selectedOperationForCorrelationSelection.correlation_id
      ? null
      : selectedOperationForCorrelationSelection;
  }, [invalidSelectedOperationCorrelationId, selectedOperationForCorrelationSelection]);
  const crewCorrelationReferenceNow = new Date().toISOString();
  const crewIncidentCorrelationReferenceTs = useMemo(
    () =>
      resolveCrewDefaultCorrelationReferenceTs(
        incidentFeedResource.data,
        overviewResource.data?.generated_at ?? null,
        crewCorrelationReferenceNow
      ),
    [crewCorrelationReferenceNow, incidentFeedResource.data, overviewResource.data?.generated_at]
  );
  const crewIncidentCorrelationSelectableIds = useMemo(() => {
    const selectableIds = new Set<string>();

    for (const incident of incidentFeedResource.data?.items ?? []) {
      if (!incident.correlation_id) {
        continue;
      }

      if (
        !crewIncidentCorrelationReferenceTs ||
        isIncidentInsideLookbackWindow(
          resolveIncidentCorrelationActivityTs(incident),
          crewIncidentCorrelationReferenceTs,
          CREW_DEFAULT_CORRELATION_WINDOW_MS
        )
      ) {
        selectableIds.add(incident.incident_id);
      }
    }

    return selectableIds;
  }, [crewIncidentCorrelationReferenceTs, incidentFeedResource.data]);
  const defaultCorrelationId = useMemo(
    () =>
      selectDefaultCorrelationId({
        incidentFeed: incidentFeedResource.data,
        selectedOperation: selectedOperationForAutoCorrelation,
        workflow: activeWorkflow,
        selectedAgentId,
        referenceTs: crewIncidentCorrelationReferenceTs
      }),
    [activeWorkflow, crewIncidentCorrelationReferenceTs, incidentFeedResource.data, selectedAgentId, selectedOperationForAutoCorrelation]
  );
  const selectedAgentPreservesNullCorrelation =
    selectedAgentId !== null &&
    selectedCorrelationId === null &&
    correlationSelectionModeRef.current === 'preserved';
  const selectedAgentScopedCorrelationId =
    resolveSelectedAgentSupervisionHistoryCorrelationId(
      selectedAgentId,
      selectedCorrelationId,
      defaultCorrelationId,
      selectedAgentPreservesNullCorrelation
    );
  const selectedAgentTimelineReplayDefaultCorrelationPending =
    selectedAgentId !== null &&
    !selectedAgentPreservesNullCorrelation &&
    selectedCorrelationId === null &&
    defaultCorrelationId === null &&
    activeWorkflow === null &&
    workflowError === null;
  const selectedAgentSupervisionHistoryDefaultCorrelationPending =
    selectedAgentId !== null &&
    !selectedAgentPreservesNullCorrelation &&
    selectedCorrelationId === null &&
    defaultCorrelationId === null &&
    selectedOperationForAutoCorrelation === null &&
    workflowResource.state === 'loading';
  const selectedAgentReplayCheckpointEventId =
    replayCheckpointFocus &&
    selectedAgentId !== null &&
    replayCheckpointFocus.selectedAgentId === selectedAgentId &&
    replayCheckpointFocus.selectedCorrelationId === selectedCorrelationId
      ? replayCheckpointFocus.eventId
      : null;
  const activeSelectedAgentReplayEvidenceId = selectedAgentReplayCheckpointEventId
    ? null
    : selectedAgentReplayEvidenceId;
  const activeSelectedAgentReplaySeverity = selectedAgentReplayCheckpointEventId ? null : selectedAgentReplaySeverity;
  const selectedAgentTimelineReplayResourceKey = selectedAgentId
    ? `selected-agent-timeline-replay:${selectedAgentId}:correlation=${selectedAgentScopedCorrelationId ?? '__all__'}:severity=${activeSelectedAgentReplaySeverity ?? '__all__'}:event=${selectedAgentReplayCheckpointEventId ?? '__all__'}`
    : null;
  const previousSelectedAgentTimelineReplayResourceKeyRef = useRef<string | null>(
    selectedAgentTimelineReplayResourceKey
  );
  const selectedAgentTimelineReplayResource = usePolledResource<SelectedAgentTimelineReplayPayload>({
    enabled:
      hubOpen &&
      selectedAgentId !== null &&
      !selectedAgentTimelineReplayDefaultCorrelationPending,
    load: async (signal) => ({
      targetAgentId: selectedAgentId!,
      correlationId: selectedAgentScopedCorrelationId,
      severity: activeSelectedAgentReplaySeverity,
      eventId: selectedAgentReplayCheckpointEventId,
      timelineReplay: await fetchTimeline({
        limit: DEFAULT_WORKFLOW_LIMIT,
        window: DEFAULT_WORKFLOW_WINDOW,
        agentId: selectedAgentId!,
        correlationId: selectedAgentScopedCorrelationId ?? undefined,
        severity: activeSelectedAgentReplaySeverity ?? undefined,
        eventId: selectedAgentReplayCheckpointEventId ?? undefined,
        signal
      })
    }),
    resourceKey: selectedAgentTimelineReplayResourceKey
  });
  const selectedAgentTimelineReplaySelectionChanged =
    selectedAgentId !== null &&
    selectedAgentTimelineReplayResourceKey !== null &&
    previousSelectedAgentTimelineReplayResourceKeyRef.current !==
      selectedAgentTimelineReplayResourceKey;
  const selectedAgentTimelineReplayPayloadMatches =
    selectedAgentTimelineReplayResource.data?.targetAgentId === selectedAgentId &&
    selectedAgentTimelineReplayResource.data?.correlationId === selectedAgentScopedCorrelationId &&
    selectedAgentTimelineReplayResource.data?.severity === activeSelectedAgentReplaySeverity &&
    selectedAgentTimelineReplayResource.data?.eventId === selectedAgentReplayCheckpointEventId;
  const selectedAgentTimelineReplaySurfaceIsStale =
    selectedAgentTimelineReplaySelectionChanged ||
    (selectedAgentTimelineReplayResource.data !== null &&
      !selectedAgentTimelineReplayPayloadMatches);
  const selectedAgentTimelineReplay =
    !selectedAgentTimelineReplaySurfaceIsStale &&
    selectedAgentTimelineReplayPayloadMatches &&
    selectedAgentTimelineReplayResource.data !== null
      ? selectedAgentTimelineReplayResource.data.timelineReplay
      : null;
  const selectedAgentTimelineReplayError = selectedAgentTimelineReplaySurfaceIsStale
    ? null
    : selectedAgentTimelineReplayResource.error;
  const selectedAgentTimelineReplayState: LoadState =
    selectedAgentTimelineReplaySurfaceIsStale
      ? 'loading'
      : selectedAgentTimelineReplayResource.state;
  useEffect(() => {
    previousSelectedAgentTimelineReplayResourceKeyRef.current =
      selectedAgentTimelineReplayResourceKey;
  }, [selectedAgentTimelineReplayResourceKey]);
  const selectedAgentAccountabilityReplayResourceKey = selectedAgentId
    ? [
        `selected-agent-accountability-replay:${selectedAgentId}`,
        `correlation=${selectedAgentScopedCorrelationId ?? '__all__'}`,
        `event=${selectedAgentReplayCheckpointEventId ?? '__all__'}`,
        `evidence=${activeSelectedAgentReplayEvidenceId ?? '__all__'}`
      ].join(':')
    : null;
  const previousSelectedAgentAccountabilityReplayResourceKeyRef = useRef<string | null>(
    selectedAgentAccountabilityReplayResourceKey
  );
  const selectedAgentAccountabilityReplayResource = usePolledResource<SelectedAgentAccountabilityReplayPayload>({
    enabled:
      hubOpen &&
      selectedAgentId !== null &&
      selectedAgentDrilldownTab === 'replay' &&
      !selectedAgentTimelineReplayDefaultCorrelationPending,
    load: async (signal) => ({
      targetAgentId: selectedAgentId!,
      correlationId: activeSelectedAgentReplayEvidenceId ? null : selectedAgentScopedCorrelationId,
      eventId: selectedAgentReplayCheckpointEventId,
      evidenceId: activeSelectedAgentReplayEvidenceId,
      replayBundle: await fetchAccountabilityReplay({
        limit: DEFAULT_WORKFLOW_LIMIT,
        window: DEFAULT_WORKFLOW_WINDOW,
        agentId: selectedAgentId!,
        correlationId: activeSelectedAgentReplayEvidenceId
          ? undefined
          : selectedAgentScopedCorrelationId ?? undefined,
        eventId: selectedAgentReplayCheckpointEventId ?? undefined,
        evidenceId: activeSelectedAgentReplayEvidenceId ?? undefined,
        signal
      })
    }),
    resourceKey: selectedAgentAccountabilityReplayResourceKey
  });
  const selectedAgentAccountabilityReplaySelectionChanged =
    selectedAgentId !== null &&
    selectedAgentAccountabilityReplayResourceKey !== null &&
    previousSelectedAgentAccountabilityReplayResourceKeyRef.current !==
      selectedAgentAccountabilityReplayResourceKey;
  const selectedAgentAccountabilityReplayPayloadMatches =
    selectedAgentAccountabilityReplayResource.data?.targetAgentId === selectedAgentId &&
    selectedAgentAccountabilityReplayResource.data?.correlationId ===
      (activeSelectedAgentReplayEvidenceId ? null : selectedAgentScopedCorrelationId) &&
    selectedAgentAccountabilityReplayResource.data?.eventId === selectedAgentReplayCheckpointEventId &&
    selectedAgentAccountabilityReplayResource.data?.evidenceId === activeSelectedAgentReplayEvidenceId;
  const selectedAgentAccountabilityReplaySurfaceIsStale =
    selectedAgentAccountabilityReplaySelectionChanged ||
    (selectedAgentAccountabilityReplayResource.data !== null &&
      !selectedAgentAccountabilityReplayPayloadMatches);
  const selectedAgentAccountabilityReplay =
    !selectedAgentAccountabilityReplaySurfaceIsStale &&
    selectedAgentAccountabilityReplayPayloadMatches &&
    selectedAgentAccountabilityReplayResource.data !== null
      ? selectedAgentAccountabilityReplayResource.data.replayBundle
      : null;
  const selectedAgentAccountabilityReplayError = selectedAgentAccountabilityReplaySurfaceIsStale
    ? null
    : selectedAgentAccountabilityReplayResource.error;
  const selectedAgentAccountabilityReplayState: LoadState = selectedAgentAccountabilityReplaySurfaceIsStale
    ? 'loading'
    : selectedAgentAccountabilityReplayResource.state;
  useEffect(() => {
    previousSelectedAgentAccountabilityReplayResourceKeyRef.current =
      selectedAgentAccountabilityReplayResourceKey;
  }, [selectedAgentAccountabilityReplayResourceKey]);
  const selectedAgentEvidenceReplayWindowResourceKey =
    selectedAgentId && activeSelectedAgentReplayEvidenceId
      ? `selected-agent-evidence-replay-window:${selectedAgentId}:evidence=${activeSelectedAgentReplayEvidenceId}`
      : null;
  const selectedAgentEvidenceReplayWindowEnabled =
    hubOpen &&
    selectedAgentId !== null &&
    selectedAgentDrilldownTab === 'replay' &&
    activeSelectedAgentReplayEvidenceId !== null;
  useEffect(() => {
    evidenceReplayWindowRequestIdRef.current += 1;
    evidenceReplayWindowAbortControllerRef.current?.abort();
    evidenceReplayWindowAbortControllerRef.current = null;

    if (
      !selectedAgentEvidenceReplayWindowEnabled ||
      selectedAgentId === null ||
      activeSelectedAgentReplayEvidenceId === null ||
      selectedAgentEvidenceReplayWindowResourceKey === null
    ) {
      setSelectedAgentEvidenceReplayWindow(null);
      setSelectedAgentEvidenceReplayWindowError(null);
      setSelectedAgentEvidenceReplayWindowState('idle');
      return undefined;
    }

    const requestId = evidenceReplayWindowRequestIdRef.current;
    const controller = new AbortController();
    evidenceReplayWindowAbortControllerRef.current = controller;
    setSelectedAgentEvidenceReplayWindow(null);
    setSelectedAgentEvidenceReplayWindowError(null);
    setSelectedAgentEvidenceReplayWindowState('loading');

    fetchEvidenceReplayWindow(activeSelectedAgentReplayEvidenceId, { signal: controller.signal })
      .then((replayWindow) => {
        if (controller.signal.aborted || requestId !== evidenceReplayWindowRequestIdRef.current) {
          return;
        }

        setSelectedAgentEvidenceReplayWindow(replayWindow);
        setSelectedAgentEvidenceReplayWindowError(null);
        setSelectedAgentEvidenceReplayWindowState('ready');
      })
      .catch((error) => {
        if (controller.signal.aborted || requestId !== evidenceReplayWindowRequestIdRef.current) {
          return;
        }

        setSelectedAgentEvidenceReplayWindow(null);
        setSelectedAgentEvidenceReplayWindowError(error instanceof Error ? error.message : 'unknown_error');
        setSelectedAgentEvidenceReplayWindowState('error');
      })
      .finally(() => {
        if (evidenceReplayWindowAbortControllerRef.current === controller) {
          evidenceReplayWindowAbortControllerRef.current = null;
        }
      });

    return () => {
      controller.abort();
      if (evidenceReplayWindowAbortControllerRef.current === controller) {
        evidenceReplayWindowAbortControllerRef.current = null;
      }
    };
  }, [
    activeSelectedAgentReplayEvidenceId,
    selectedAgentEvidenceReplayWindowEnabled,
    selectedAgentEvidenceReplayWindowResourceKey,
    selectedAgentId
  ]);
  const selectedAgentSupervisionHistoryResourceKey = selectedAgentId
    ? `selected-agent-supervision-history:${selectedAgentId}:correlation=${selectedAgentScopedCorrelationId ?? '__all__'}:severity=${selectedAgentSupervisionHistorySeverity ?? '__all__'}`
    : null;
  const previousSelectedAgentSupervisionHistoryResourceKeyRef = useRef<string | null>(
    selectedAgentSupervisionHistoryResourceKey
  );
  const selectedAgentSupervisionHistoryResource = usePolledResource<SelectedAgentSupervisionHistoryPayload>({
    enabled:
      hubOpen &&
      selectedAgentId !== null &&
      !selectedAgentSupervisionHistoryDefaultCorrelationPending,
    load: async (signal) => ({
      targetAgentId: selectedAgentId!,
      correlationId: selectedAgentScopedCorrelationId,
      severity: selectedAgentSupervisionHistorySeverity,
      peerWatchAlerts: await fetchPeerWatchAlerts({
        targetAgentId: selectedAgentId!,
        correlationId: selectedAgentScopedCorrelationId ?? undefined,
        severity: selectedAgentSupervisionHistorySeverity ?? undefined,
        limit: SELECTED_AGENT_SUPERVISION_HISTORY_LIMIT,
        signal
      })
    }),
    resourceKey: selectedAgentSupervisionHistoryResourceKey
  });
  const selectedAgentSupervisionHistorySelectionChanged =
    selectedAgentId !== null &&
    selectedAgentSupervisionHistoryResourceKey !== null &&
    previousSelectedAgentSupervisionHistoryResourceKeyRef.current !==
      selectedAgentSupervisionHistoryResourceKey;
  const selectedAgentSupervisionHistoryPayloadMatches =
    selectedAgentSupervisionHistoryResource.data?.targetAgentId === selectedAgentId &&
    selectedAgentSupervisionHistoryResource.data?.correlationId === selectedAgentScopedCorrelationId &&
    selectedAgentSupervisionHistoryResource.data?.severity === selectedAgentSupervisionHistorySeverity;
  const selectedAgentSupervisionHistorySurfaceIsStale =
    selectedAgentSupervisionHistorySelectionChanged ||
    (selectedAgentSupervisionHistoryResource.data !== null &&
      !selectedAgentSupervisionHistoryPayloadMatches);
  const selectedAgentSupervisionHistory =
    !selectedAgentSupervisionHistorySurfaceIsStale &&
    selectedAgentSupervisionHistoryPayloadMatches &&
    selectedAgentSupervisionHistoryResource.data !== null
      ? selectedAgentSupervisionHistoryResource.data.peerWatchAlerts
      : null;
  const selectedAgentSupervisionHistoryError = selectedAgentSupervisionHistorySurfaceIsStale
    ? null
    : selectedAgentSupervisionHistoryResource.error;
  const selectedAgentSupervisionHistoryState: LoadState = selectedAgentSupervisionHistorySurfaceIsStale
    ? 'loading'
    : selectedAgentSupervisionHistoryResource.state;
  useEffect(() => {
    previousSelectedAgentSupervisionHistoryResourceKeyRef.current =
      selectedAgentSupervisionHistoryResourceKey;
  }, [selectedAgentSupervisionHistoryResourceKey]);
  const selectedAgentSupervisionHistoryRequestScopeLabel =
    resolveSelectedAgentSupervisionHistoryRequestScopeLabel(
      selectedAgentId,
      selectedAgentScopedCorrelationId
    );
  const selectedAgentEvidenceLedgerResourceKey = selectedAgentId
    ? `selected-agent-evidence-ledger:${selectedAgentId}:limit=${SELECTED_AGENT_EVIDENCE_LEDGER_LIMIT}`
    : null;
  const previousSelectedAgentEvidenceLedgerResourceKeyRef = useRef<string | null>(
    selectedAgentEvidenceLedgerResourceKey
  );
  const selectedAgentEvidenceProofCompassRowsByLedgerKeyRef = useRef<
    Map<string, SelectedAgentEvidenceProofCompassRow[]>
  >(new Map());
  const selectedAgentEvidenceLedgerResource = usePolledResource<SelectedAgentEvidenceLedgerPayload>({
    enabled:
      hubOpen &&
      selectedAgentId !== null &&
      activeHubCategory === 'evidence' &&
      selectedAgentDrilldownTab === 'evidence',
    load: async (signal) => {
      const targetAgentId = selectedAgentId!;
      const recordOptions = {
        agentId: targetAgentId,
        newestFirst: true,
        limit: SELECTED_AGENT_EVIDENCE_LEDGER_LIMIT,
        signal
      };
      const proofCompassRowsCacheKey = selectedAgentEvidenceLedgerResourceKey;
      const cachedProofCompassRows = proofCompassRowsCacheKey
        ? selectedAgentEvidenceProofCompassRowsByLedgerKeyRef.current.get(proofCompassRowsCacheKey)
        : undefined;
      const [records, proofCompassRows] = await Promise.all([
        fetchEvidenceRecords(recordOptions),
        cachedProofCompassRows !== undefined
          ? Promise.resolve(cachedProofCompassRows)
          : fetchEvidenceRefRollup(recordOptions)
              .then((rollup) => buildSelectedAgentEvidenceProofCompassRows(rollup))
              .catch(() => [])
      ]);
      if (proofCompassRowsCacheKey && cachedProofCompassRows === undefined) {
        selectedAgentEvidenceProofCompassRowsByLedgerKeyRef.current.set(
          proofCompassRowsCacheKey,
          proofCompassRows
        );
      }

      return {
        targetAgentId,
        evidenceLedger: buildSelectedAgentEvidenceLedger(records, {
          proofCompassRows
        })
      };
    },
    resourceKey: selectedAgentEvidenceLedgerResourceKey
  });
  const selectedAgentEvidenceLedgerSelectionChanged =
    selectedAgentId !== null &&
    selectedAgentEvidenceLedgerResourceKey !== null &&
    previousSelectedAgentEvidenceLedgerResourceKeyRef.current !== selectedAgentEvidenceLedgerResourceKey;
  const selectedAgentEvidenceLedgerPayloadMatches =
    selectedAgentEvidenceLedgerResource.data?.targetAgentId === selectedAgentId;
  const selectedAgentEvidenceLedgerSurfaceIsStale =
    selectedAgentEvidenceLedgerSelectionChanged ||
    (selectedAgentEvidenceLedgerResource.data !== null &&
      !selectedAgentEvidenceLedgerPayloadMatches);
  const selectedAgentEvidenceLedger =
    !selectedAgentEvidenceLedgerSurfaceIsStale &&
    selectedAgentEvidenceLedgerPayloadMatches &&
    selectedAgentEvidenceLedgerResource.data !== null
      ? selectedAgentEvidenceLedgerResource.data.evidenceLedger
      : null;
  const selectedAgentEvidenceLedgerError = selectedAgentEvidenceLedgerSurfaceIsStale
    ? null
    : selectedAgentEvidenceLedgerResource.error;
  const selectedAgentEvidenceLedgerState: LoadState = selectedAgentEvidenceLedgerSurfaceIsStale
    ? 'loading'
    : selectedAgentEvidenceLedgerResource.state;
  useEffect(() => {
    previousSelectedAgentEvidenceLedgerResourceKeyRef.current = selectedAgentEvidenceLedgerResourceKey;
  }, [selectedAgentEvidenceLedgerResourceKey]);

  const handleInspectSelectedAgentEvidenceRecord = useCallback((evidenceId: string) => {
    const requestId = evidenceRecordDetailRequestIdRef.current + 1;
    const controller = new AbortController();
    evidenceRecordDetailRequestIdRef.current = requestId;
    evidenceRecordDetailAbortControllerRef.current?.abort();
    evidenceRecordDetailAbortControllerRef.current = controller;
    setSelectedAgentEvidenceRecordId(evidenceId);
    setSelectedAgentEvidenceRecordError(null);
    setSelectedAgentEvidenceRecordState('loading');
    setSelectedAgentEvidenceProvenanceBundle(null);
    setSelectedAgentEvidenceProvenanceBundleError(null);
    setSelectedAgentEvidenceProvenanceBundleState('loading');
    setSelectedAgentEvidenceCheckpointLog(null);
    setSelectedAgentEvidenceCheckpointLogError(null);
    setSelectedAgentEvidenceCheckpointLogState('loading');
    evidenceSourceContextRequestIdRef.current += 1;
    evidenceSourceContextAbortControllerRef.current?.abort();
    evidenceSourceContextAbortControllerRef.current = null;
    setSelectedAgentEvidenceSourceContext(null);
    setSelectedAgentEvidenceSourceContextError(null);
    setSelectedAgentEvidenceSourceContextState('idle');

    void fetchEvidenceRecord(evidenceId, { signal: controller.signal })
      .then((record) => {
        if (evidenceRecordDetailRequestIdRef.current !== requestId) {
          return;
        }

        evidenceRecordDetailAbortControllerRef.current = null;
        setSelectedAgentEvidenceRecord(record);
        setSelectedAgentEvidenceRecordError(null);
        setSelectedAgentEvidenceRecordState('ready');
      })
      .catch((error: unknown) => {
        if (evidenceRecordDetailRequestIdRef.current !== requestId) {
          return;
        }

        evidenceRecordDetailAbortControllerRef.current = null;
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        setSelectedAgentEvidenceRecordError(formatUnknownError(error));
        setSelectedAgentEvidenceRecordState('error');
      });

    void fetchEvidenceProvenanceBundle(evidenceId, { signal: controller.signal })
      .then((bundle) => {
        if (evidenceRecordDetailRequestIdRef.current !== requestId) {
          return;
        }

        setSelectedAgentEvidenceProvenanceBundle(bundle);
        setSelectedAgentEvidenceProvenanceBundleError(null);
        setSelectedAgentEvidenceProvenanceBundleState('ready');
      })
      .catch((error: unknown) => {
        if (evidenceRecordDetailRequestIdRef.current !== requestId) {
          return;
        }

        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        setSelectedAgentEvidenceProvenanceBundle(null);
        setSelectedAgentEvidenceProvenanceBundleError(formatUnknownError(error));
        setSelectedAgentEvidenceProvenanceBundleState('error');
      });

    void fetchReplayCheckpointLog({ evidenceId, limit: 3, signal: controller.signal })
      .then((checkpointLog) => {
        if (evidenceRecordDetailRequestIdRef.current !== requestId) {
          return;
        }

        setSelectedAgentEvidenceCheckpointLog(checkpointLog);
        setSelectedAgentEvidenceCheckpointLogError(null);
        setSelectedAgentEvidenceCheckpointLogState('ready');
      })
      .catch((error: unknown) => {
        if (evidenceRecordDetailRequestIdRef.current !== requestId) {
          return;
        }

        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        setSelectedAgentEvidenceCheckpointLog(null);
        setSelectedAgentEvidenceCheckpointLogError(formatUnknownError(error));
        setSelectedAgentEvidenceCheckpointLogState('error');
      });
  }, []);

  const handleInspectSelectedAgentEvidenceSourceContext = useCallback((evidenceId: string) => {
    const requestId = evidenceSourceContextRequestIdRef.current + 1;
    const controller = new AbortController();
    evidenceSourceContextRequestIdRef.current = requestId;
    evidenceSourceContextAbortControllerRef.current?.abort();
    evidenceSourceContextAbortControllerRef.current = controller;
    setSelectedAgentEvidenceSourceContext(null);
    setSelectedAgentEvidenceSourceContextError(null);
    setSelectedAgentEvidenceSourceContextState('loading');

    void fetchEvidenceSourceContext(evidenceId, { signal: controller.signal })
      .then((context) => {
        if (evidenceSourceContextRequestIdRef.current !== requestId) {
          return;
        }

        evidenceSourceContextAbortControllerRef.current = null;
        setSelectedAgentEvidenceSourceContext(context);
        setSelectedAgentEvidenceSourceContextError(null);
        setSelectedAgentEvidenceSourceContextState('ready');
      })
      .catch((error: unknown) => {
        if (evidenceSourceContextRequestIdRef.current !== requestId) {
          return;
        }

        evidenceSourceContextAbortControllerRef.current = null;
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        setSelectedAgentEvidenceSourceContext(null);
        setSelectedAgentEvidenceSourceContextError(formatUnknownError(error));
        setSelectedAgentEvidenceSourceContextState('error');
      });
  }, []);

  const crewOverviewOperationStateBuckets = useMemo(
    () => crewOverviewStateBucketsResource.data?.summary.state_buckets ?? {},
    [crewOverviewStateBucketsResource.data]
  );
  const crewOverviewOperationSeverityBuckets = useMemo(
    () => crewOverviewStateBucketsResource.data?.summary.severity_buckets ?? EMPTY_SEVERITY_BUCKETS,
    [crewOverviewStateBucketsResource.data]
  );
  const selectedOperationsFiltersActive =
    selectedOperationsState !== null || selectedOperationsSeverity !== null;
  const crewOverviewOperationSeedData = useMemo(
    () =>
      selectedOperationsFiltersActive
        ? crewOverviewStateBucketsResource.data ?? operationsResource.data
        : operationsResource.data,
    [
      crewOverviewStateBucketsResource.data,
      operationsResource.data,
      selectedOperationsFiltersActive
    ]
  );
  const crewOverviewActiveCorrelationQueueSource = crewOverviewStateBucketsResource.data;
  const crewOverviewActiveCorrelationQueueState = crewOverviewStateBucketsResource.state;
  const crewOverviewActiveCorrelationQueueError = crewOverviewStateBucketsResource.error;

  useEffect(() => {
    if (!hubOpen) {
      setActiveCorrelationQueueSnapshot(null);
      setActiveCorrelationQueueSnapshotError(null);
      return;
    }

    if (selectedAgentId !== null) {
      return;
    }

    if (crewOverviewActiveCorrelationQueueSource) {
      setActiveCorrelationQueueSnapshot(crewOverviewActiveCorrelationQueueSource);
    }

    setActiveCorrelationQueueSnapshotError(crewOverviewActiveCorrelationQueueError);
  }, [
    hubOpen,
    selectedAgentId,
    crewOverviewActiveCorrelationQueueSource,
    crewOverviewActiveCorrelationQueueError
  ]);

  const activeCorrelationQueueOperations =
    selectedAgentId === null ? crewOverviewActiveCorrelationQueueSource : activeCorrelationQueueSnapshot;
  const activeCorrelationQueueState =
    selectedAgentId === null
      ? crewOverviewActiveCorrelationQueueState
      : activeCorrelationQueueSnapshot
        ? 'ready'
        : 'idle';
  const activeCorrelationQueueError =
    selectedAgentId === null ? crewOverviewActiveCorrelationQueueError : activeCorrelationQueueSnapshotError;

  useEffect(() => {
    if (liveSelectedOperation) {
      setSelectedOperationSnapshot(liveSelectedOperation);
      return;
    }

    if (!selectedOperationSelection) {
      setSelectedOperationSnapshot(null);
    }
  }, [liveSelectedOperation, selectedOperationSelection]);

  useEffect(() => {
    if (!selectedAgentId) {
      lastSelectedAgentRef.current = null;
      if (selectedOperationSelection) {
        setSelectedOperationSelection(null);
      }
      return;
    }

    const overviewMatch = overviewResource.data?.agents.find((agent) => agent.agent_id === selectedAgentId) ?? null;
    if (overviewMatch) {
      lastSelectedAgentRef.current = overviewMatch;
    }
  }, [overviewResource.data, selectedAgentId]);

  useEffect(() => {
    if (!hubOpen) {
      if (selectedAgentId === null && selectedCorrelationId === null) {
        lastCorrelationContextRef.current = null;
        correlationSelectionModeRef.current = 'auto';
      }
      return;
    }

    if (lastCorrelationContextRef.current !== correlationSelectionContext) {
      lastCorrelationContextRef.current = correlationSelectionContext;
      correlationSelectionModeRef.current = 'auto';
      setSelectedCorrelationId(null);
      setSelectedCorrelationWasExplicit(false);
      setSelectedCorrelationCarryForward(false);
    }
  }, [correlationSelectionContext, hubOpen, selectedAgentId, selectedCorrelationId]);

  useEffect(() => {
    if (!hubOpen) {
      return;
    }

    if (correlationSelectionModeRef.current !== 'auto') {
      return;
    }

    if (defaultCorrelationId !== selectedCorrelationId || selectedCorrelationWasExplicit) {
      setSelectedCorrelationId(defaultCorrelationId);
      setSelectedCorrelationWasExplicit(false);
      setSelectedCorrelationCarryForward(false);
    }
  }, [
    defaultCorrelationId,
    hubOpen,
    selectedCorrelationId,
    selectedCorrelationWasExplicit
  ]);

  const closeHub = useCallback(() => {
    setHubOpen(false);
    setSourceGapFocusIntent(null);
  }, []);

  const openHubCategory = useCallback(
    (category: HubCategory) => {
      requestedSelectedAgentDrilldownTabRef.current = null;
      activeHubCategoryFromSelectedAgentTabRef.current = false;
      setSourceGapFocusIntent(null);
      setActiveHubCategory(category);
      if (selectedAgentId !== null) {
        setSelectedAgentDrilldownTab(resolveHubCategorySelectedAgentTab(category));
      }
      setHubOpen(true);
    },
    [selectedAgentId]
  );

  const handleSelectCorrelation = useCallback(
    (
      correlationId: string | null,
      options?: {
        preserveAutoOnDefaultReselect?: boolean;
      }
    ) => {
      const keepAutoSelection =
        Boolean(options?.preserveAutoOnDefaultReselect) &&
        correlationSelectionModeRef.current === 'auto' &&
        correlationId !== null &&
        correlationId === selectedCorrelationId &&
        correlationId === defaultCorrelationId;
      const isExplicitSelection = correlationId !== null && !keepAutoSelection;
      correlationSelectionModeRef.current = isExplicitSelection ? 'manual' : 'auto';
      setSelectedCorrelationId(correlationId);
      setSelectedCorrelationWasExplicit(isExplicitSelection);
      setSelectedCorrelationCarryForward(correlationId !== null && !keepAutoSelection);
      setSelectedAgentReplayEvidenceId(null);
      if (correlationId) {
        activeHubCategoryFromSelectedAgentTabRef.current = false;
        setActiveHubCategory('replay');
        setHubOpen(true);
      }
    },
    [defaultCorrelationId, selectedCorrelationId]
  );

  const handleResetCorrelationOverride = useCallback(() => {
    correlationSelectionModeRef.current = 'auto';
    setSelectedCorrelationId(defaultCorrelationId);
    setSelectedCorrelationWasExplicit(false);
    setSelectedCorrelationCarryForward(false);
  }, [defaultCorrelationId]);

  const handleResetView = useCallback(() => {
    setResetViewSignal((signal) => signal + 1);
  }, []);

  const handleFocusWorldZone = useCallback((zoneId: string) => {
    zoneFocusRequestIdRef.current += 1;
    setZoneFocusRequest({
      zoneId,
      requestId: zoneFocusRequestIdRef.current
    });
  }, []);

  useEffect(() => {
    if (hubOpen && selectedAgentId !== null) {
      const requestedTab = requestedSelectedAgentDrilldownTabRef.current;
      requestedSelectedAgentDrilldownTabRef.current = null;
      setSelectedAgentDrilldownTab(requestedTab ?? resolveHubCategorySelectedAgentTab(activeHubCategory));
      return;
    }

    if (!hubOpen) {
      requestedSelectedAgentDrilldownTabRef.current = null;
    }
  }, [activeHubCategory, hubOpen, selectedAgentId]);

  useEffect(() => {
    if (
      sourceGapFocusIntent &&
      (selectedAgentId !== sourceGapFocusIntent.agentId ||
        (hubOpen && (activeHubCategory !== 'supervision' || selectedAgentDrilldownTab !== 'evidence')))
    ) {
      setSourceGapFocusIntent(null);
    }
  }, [activeHubCategory, hubOpen, selectedAgentDrilldownTab, selectedAgentId, sourceGapFocusIntent]);

  const handleSelectSelectedAgentDrilldownTab = useCallback((tab: SelectedAgentDrilldownTab) => {
    requestedSelectedAgentDrilldownTabRef.current = null;
    setSourceGapFocusIntent(null);
    setSelectedAgentReplayEvidenceId(null);
    setSelectedAgentDrilldownTab(tab);
    activeHubCategoryFromSelectedAgentTabRef.current = true;
    setActiveHubCategory((currentCategory) => resolveSelectedAgentTabHubCategory(tab, currentCategory));

    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const schedule =
      typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : (callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 0);

    schedule(() => {
      const dialog = hubDialogRef.current;
      const panel = document.getElementById(resolveSelectedAgentDrilldownPanelId(tab));

      if (!dialog || !panel) {
        return;
      }

      const targetScrollTop = Math.max(0, panel.offsetTop - 4);
      if (typeof dialog.scrollTo === 'function') {
        dialog.scrollTo({ top: targetScrollTop, behavior: 'auto' });
      } else {
        dialog.scrollTop = targetScrollTop;
      }
    });
  }, []);

  const handleOpenReplayCheckpoint = useCallback(
    (eventId: string) => {
      const nextEventId = eventId.trim();
      if (!nextEventId) {
        return;
      }

      setSelectedAgentReplayEvidenceId(null);
      setReplayCheckpointFocus({
        eventId: nextEventId,
        selectedAgentId,
        selectedCorrelationId
      });
      if (selectedAgentId !== null) {
        handleSelectSelectedAgentDrilldownTab('replay');
      }
    },
    [handleSelectSelectedAgentDrilldownTab, selectedAgentId, selectedCorrelationId]
  );

  const handleSelectSelectedAgentReplaySeverity = useCallback(
    (severity: Severity | null) => {
      setReplayCheckpointFocus(null);
      setSelectedAgentReplayEvidenceId(null);
      setSelectedAgentReplayFilter(
        selectedAgentId !== null
          ? {
              agentId: selectedAgentId,
              severity
            }
          : null
      );
    },
    [selectedAgentId]
  );

  const handleSelectCrewReplaySeverity = useCallback((severity: Severity | null) => {
    setReplayCheckpointFocus(null);
    setSelectedCrewReplaySeverity(severity);
  }, []);

  const selectAndFocusSelectedAgentDrilldownTab = useCallback(
    (tab: SelectedAgentDrilldownTab) => {
      handleSelectSelectedAgentDrilldownTab(tab);

      if (typeof document === 'undefined') {
        return;
      }

      document.getElementById(resolveSelectedAgentDrilldownTabId(tab))?.focus();
    },
    [handleSelectSelectedAgentDrilldownTab]
  );

  const handleSelectedAgentDrilldownTabKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      const currentIndex = SELECTED_AGENT_DRILLDOWN_TABS.findIndex(
        (tab) => tab.id === selectedAgentDrilldownTab
      );

      if (currentIndex === -1) {
        return;
      }

      let nextIndex: number | null = null;

      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          nextIndex = (currentIndex + 1) % SELECTED_AGENT_DRILLDOWN_TABS.length;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          nextIndex =
            (currentIndex - 1 + SELECTED_AGENT_DRILLDOWN_TABS.length) %
            SELECTED_AGENT_DRILLDOWN_TABS.length;
          break;
        case 'Home':
          nextIndex = 0;
          break;
        case 'End':
          nextIndex = SELECTED_AGENT_DRILLDOWN_TABS.length - 1;
          break;
        default:
          return;
      }

      event.preventDefault();
      const nextTab = SELECTED_AGENT_DRILLDOWN_TABS[nextIndex]?.id;
      if (nextTab) {
        selectAndFocusSelectedAgentDrilldownTab(nextTab);
      }
    },
    [selectAndFocusSelectedAgentDrilldownTab, selectedAgentDrilldownTab]
  );

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    if (hubOpen && !wasHubOpenRef.current) {
      const activeElement = document.activeElement;
      hubFocusReturnRef.current = activeElement instanceof HTMLElement ? activeElement : null;
      hubCloseButtonRef.current?.focus();
    }

    if (!hubOpen && wasHubOpenRef.current) {
      const focusTarget = hubFocusReturnRef.current;
      if (focusTarget && focusTarget.isConnected && focusTarget !== document.body) {
        focusTarget.focus();
      } else {
        hubTriggerRef.current?.focus();
      }
      hubFocusReturnRef.current = null;
    }

    wasHubOpenRef.current = hubOpen;
  }, [hubOpen]);

  useEffect(() => {
    if (!hubOpen || typeof document === 'undefined') {
      return;
    }

    const dialog = hubDialogRef.current;
    if (!dialog) {
      return;
    }

    const activeElement = document.activeElement;
    const detailsPanel = dialog.querySelector<HTMLElement>('[role="complementary"][aria-label="Agent details"]');
    if (!detailsPanel) {
      return;
    }

    const focusableDetailsElements = getHubFocusableElements(detailsPanel);
    if (activeElement instanceof HTMLElement && activeElement.isConnected && dialog.contains(activeElement)) {
      if (!detailsPanel.contains(activeElement) || isHubElementVisible(activeElement)) {
        return;
      }
    }

    const [firstDetailsFocusable] = focusableDetailsElements;
    (firstDetailsFocusable ?? dialog).focus();
  }, [hubOpen, selectedAgentDrilldownTab, selectedAgentId, selectedCorrelationId, selectedCorrelationWasExplicit]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const handleResetViewShortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.key.toLowerCase() !== RESET_VIEW_SHORTCUT_KEY ||
        isEditableShortcutTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      handleResetView();
    };

    document.addEventListener('keydown', handleResetViewShortcut);
    return () => {
      document.removeEventListener('keydown', handleResetViewShortcut);
    };
  }, [handleResetView]);

  useEffect(() => {
    if (!hubOpen || typeof document === 'undefined') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeHub();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const dialog = hubDialogRef.current;
      if (!dialog) {
        return;
      }

      const focusableElements = getHubFocusableElements(dialog);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey) {
        if (activeElement === firstFocusable || !dialog.contains(activeElement)) {
          event.preventDefault();
          lastFocusable.focus();
        }
        return;
      }

      if (activeElement === lastFocusable || !dialog.contains(activeElement)) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeHub, hubOpen]);

  const selectAgent = useCallback(
    (
      agentId: string | null,
      correlationId: string | null,
      operationSelection: OperationSelection | null = null,
      correlationMode: 'auto' | 'manual' | 'preserved' = correlationId === null ? 'auto' : 'manual',
      correlationWasExplicit = correlationMode === 'manual',
      correlationCarryForward = correlationId !== null && correlationWasExplicit
    ) => {
      const selectedAgentChanged = agentId !== selectedAgentId;

      if (!agentId) {
        lastSelectedAgentRef.current = null;
        setAgentFocusRequest(null);
        setSourceGapFocusIntent(null);
      } else {
        const overviewMatch = overviewResource.data?.agents.find((agent) => agent.agent_id === agentId) ?? null;
        if (overviewMatch) {
          lastSelectedAgentRef.current = overviewMatch;
        }
      }

      lastCorrelationContextRef.current = resolveCorrelationSelectionContext(agentId);
      correlationSelectionModeRef.current = correlationMode;
      setSelectedCorrelationId(correlationId);
      setSelectedCorrelationWasExplicit(correlationId !== null && correlationWasExplicit);
      setSelectedCorrelationCarryForward(correlationId !== null && correlationCarryForward);
      setSelectedOperationSelection(operationSelection);
      if (selectedAgentChanged) {
        clearSelectedAgentEvidenceRecordDetail();
        setSelectedAgentReplayFilter(null);
        setSelectedAgentSupervisionHistoryFilter(null);
        if (activeHubCategoryFromSelectedAgentTabRef.current) {
          activeHubCategoryFromSelectedAgentTabRef.current = false;
          setSelectedAgentDrilldownTab('now');
          setActiveHubCategory((currentCategory) => resolveSelectedAgentTabHubCategory('now', currentCategory));
        }
      }
      setSelectedAgentId(agentId);
    },
    [clearSelectedAgentEvidenceRecordDetail, overviewResource.data, selectedAgentId, setSelectedAgentId]
  );

  const requestAgentFocus = useCallback((agentId: string) => {
    agentFocusRequestIdRef.current += 1;
    setAgentFocusRequest({
      agentId,
      requestId: agentFocusRequestIdRef.current
    });
  }, []);

  const selectAgentWithSnapshot = useCallback(
    (
      agentId: string | null,
      correlationId: string | null,
      operationSelection: OperationSelection | null = null,
      correlationMode: 'auto' | 'manual' | 'preserved' = correlationId === null ? 'auto' : 'manual',
      correlationWasExplicit = correlationMode === 'manual',
      correlationCarryForward = correlationId !== null && correlationWasExplicit,
      operationSnapshot: OfficeOperation | null = null
    ) => {
      setSelectedOperationSnapshot(operationSnapshot);
      selectAgent(
        agentId,
        correlationId,
        operationSelection,
        correlationMode,
        correlationWasExplicit,
        correlationCarryForward
      );
    },
    [selectAgent]
  );

  const handleSelectAgentForInspection = useCallback(
    (agentId: string | null) => {
      const preservedCorrelationId =
        agentId !== null && activeCorrelationParticipantAgentIds.includes(agentId)
          ? activeCorrelationSpotlight?.correlation_id ?? null
          : null;
      const operationSelection = resolveDirectOperationSelection(agentId, null);
      selectAgentWithSnapshot(
        agentId,
        preservedCorrelationId,
        operationSelection,
        preservedCorrelationId ? 'preserved' : 'auto',
        preservedCorrelationId !== null &&
          preservedCorrelationId === selectedCorrelationId &&
          selectedCorrelationWasExplicit,
        preservedCorrelationId !== null &&
          preservedCorrelationId === selectedCorrelationId &&
          selectedCorrelationCarryForward,
        resolveOperationSnapshotSeed(agentId, crewOverviewOperationSeedData)
      );
    },
    [
      activeCorrelationParticipantAgentIds,
      activeCorrelationSpotlight?.correlation_id,
      crewOverviewOperationSeedData,
      selectAgentWithSnapshot,
      selectedCorrelationCarryForward,
      selectedCorrelationId,
      selectedCorrelationWasExplicit
    ]
  );

  const handleSceneSelectAgent = useCallback(
    (agentId: string | null) => {
      handleSelectAgentForInspection(agentId);
      if (agentId) {
        requestAgentFocus(agentId);
      }
    },
    [handleSelectAgentForInspection, requestAgentFocus]
  );

  const handleRosterSelectAgent = useCallback(
    (agentId: string) => {
      handleSceneSelectAgent(agentId);
      setHubOpen(false);
    },
    [handleSceneSelectAgent]
  );

  const handleEvidenceCoverageFocusAgent = useCallback(
    (agentId: string) => {
      requestedSelectedAgentDrilldownTabRef.current = 'evidence';
      activeHubCategoryFromSelectedAgentTabRef.current = false;
      setActiveHubCategory('evidence');
      handleSelectAgentForInspection(agentId);
      setSelectedAgentDrilldownTab('evidence');
      setHubOpen(true);
    },
    [handleSelectAgentForInspection]
  );
  const handleCollectorSnapshotSummaryOpen = useCallback(() => {
    requestedSelectedAgentDrilldownTabRef.current = selectedAgentId === null ? null : 'evidence';
    activeHubCategoryFromSelectedAgentTabRef.current = false;
    setSourceGapFocusIntent(null);
    setActiveHubCategory('supervision');
    if (selectedAgentId !== null) {
      setSelectedAgentDrilldownTab('evidence');
    }
    setHubOpen(true);
  }, [selectedAgentId]);

  const handleSourceGapFocusAgent = useCallback(
    (chip: (typeof sourceGapChips)[number]) => {
      if (!chip.agentId || !chip.sourceDrilldownGroupKey) {
        return;
      }

      sourceGapFocusRequestIdRef.current += 1;
      requestedSelectedAgentDrilldownTabRef.current = 'evidence';
      activeHubCategoryFromSelectedAgentTabRef.current = false;
      setActiveHubCategory('supervision');
      handleSelectAgentForInspection(chip.agentId);
      setSelectedAgentDrilldownTab('evidence');
      setSourceGapFocusIntent({
        agentId: chip.agentId,
        agentLabel: chip.displayName,
        sourceKind: chip.sourceKind,
        sourceLabel: chip.sourceLabel,
        status: chip.status,
        sourceDrilldownGroupKey: chip.sourceDrilldownGroupKey,
        requestId: sourceGapFocusRequestIdRef.current
      });
      setHubOpen(true);
    },
    [handleSelectAgentForInspection]
  );

  const handleSourceGapWorldPinInspect = useCallback(
    (pin: SceneSourceGapPin) => {
      if (!pin.agentId || !pin.sourceDrilldownGroupKey) {
        return;
      }

      sourceGapFocusRequestIdRef.current += 1;
      requestedSelectedAgentDrilldownTabRef.current = 'evidence';
      activeHubCategoryFromSelectedAgentTabRef.current = false;
      setActiveHubCategory('supervision');
      handleSelectAgentForInspection(pin.agentId);
      requestAgentFocus(pin.agentId);
      setSelectedAgentDrilldownTab('evidence');
      setSourceGapFocusIntent({
        agentId: pin.agentId,
        agentLabel: pin.displayName,
        sourceKind: pin.sourceKind,
        sourceLabel: pin.sourceLabel,
        status: pin.status,
        sourceDrilldownGroupKey: pin.sourceDrilldownGroupKey,
        requestId: sourceGapFocusRequestIdRef.current
      });
      setHubOpen(false);
    },
    [handleSelectAgentForInspection, requestAgentFocus]
  );

  const handleSelectOperation = useCallback(
    (
      operation: OfficeOperation,
      options?: {
        preserveActiveCorrelation?: boolean;
      }
    ) => {
      const preserveActiveCorrelation = Boolean(
        options?.preserveActiveCorrelation && activeCorrelationSpotlight?.correlation_id
      );
      const preservedCorrelationId = preserveActiveCorrelation
        ? activeCorrelationSpotlight!.correlation_id
        : operation.correlation_id;

      activeHubCategoryFromSelectedAgentTabRef.current = false;
      selectAgentWithSnapshot(
        operation.agent_id,
        preservedCorrelationId,
        {
          agentId: operation.agent_id
        },
        preserveActiveCorrelation ? 'preserved' : 'auto',
        preserveActiveCorrelation && selectedCorrelationWasExplicit,
        preserveActiveCorrelation && selectedCorrelationCarryForward,
        operation
      );
      setActiveHubCategory('queue');
      setHubOpen(true);
    },
    [
      activeCorrelationSpotlight?.correlation_id,
      selectAgentWithSnapshot,
      selectedCorrelationCarryForward,
      selectedCorrelationWasExplicit
    ]
  );

  const handleFocusSharedMemoryArtifact = useCallback(
    async (
      artifactRef: string,
      scope?: {
        correlationId?: string | null;
        preserveNullCorrelation?: boolean;
      }
    ) => {
      activeHubCategoryFromSelectedAgentTabRef.current = false;
      setActiveHubCategory('memory');
      if (selectedAgentId !== null) {
        setSelectedAgentDrilldownTab('evidence');
      }
      setHubOpen(true);

      setSharedMemoryJumpStatus(null);

      const hasScopeOverride = Boolean(scope?.preserveNullCorrelation) || scope?.correlationId !== undefined;
      const jumpCorrelationId = scope?.preserveNullCorrelation
        ? null
        : hasScopeOverride
          ? scope?.correlationId ?? null
          : sharedMemoryCorrelationId;
      const jumpRequestScopeLabel = hasScopeOverride
        ? resolveSharedMemoryRequestScopeLabel(selectedAgentId, jumpCorrelationId)
        : sharedMemoryRequestScopeLabel;

      const existingArtifact =
        !hasScopeOverride
          ? (memoryArtifacts?.items.find((item) => item.artifact_ref === artifactRef) ?? null)
          : null;
      if (existingArtifact) {
        setFocusedExactMemoryArtifact(existingArtifact);
        setFocusedSharedMemoryArtifactRef(existingArtifact.artifact_ref);

        if (focusSharedMemoryArtifactInDom(existingArtifact.artifact_ref)) {
          return;
        }

        pendingSharedMemoryFocusRef.current = existingArtifact.artifact_ref;
        return;
      }

      pendingSharedMemoryFocusRef.current = null;
      setFocusedExactMemoryArtifact(null);
      setFocusedSharedMemoryArtifactRef(null);

      const requestId = sharedMemoryJumpRequestIdRef.current + 1;
      sharedMemoryJumpRequestIdRef.current = requestId;

      try {
        const artifactIndex = await fetchMemoryArtifacts({
          limit: MEMORY_ARTIFACT_LIMIT,
          window: DEFAULT_WORKFLOW_WINDOW,
          agentId: selectedAgentId ?? undefined,
          correlationId: jumpCorrelationId ?? undefined,
          artifactRef
        });

        if (sharedMemoryJumpRequestIdRef.current !== requestId) {
          return;
        }

        const exactArtifact = artifactIndex.items.find((item) => item.artifact_ref === artifactRef) ?? null;

        if (!exactArtifact) {
          setSharedMemoryJumpStatus(
            `Shared memory miss. ${artifactRef} is not available in ${jumpRequestScopeLabel}.`
          );
          return;
        }

        setFocusedExactMemoryArtifact(exactArtifact);
        setFocusedSharedMemoryArtifactRef(exactArtifact.artifact_ref);
        pendingSharedMemoryFocusRef.current = exactArtifact.artifact_ref;
      } catch (error) {
        if (sharedMemoryJumpRequestIdRef.current !== requestId) {
          return;
        }

        setSharedMemoryJumpStatus(
          `Shared memory jump failed for ${artifactRef} in ${jumpRequestScopeLabel}. ${
            error instanceof Error ? error.message : 'unknown_error'
          }`
        );
      }
    },
    [focusedExactMemoryArtifact?.artifact_ref, memoryArtifacts, selectedAgentId, sharedMemoryCorrelationId, sharedMemoryRequestScopeLabel]
  );

  const rendererFallback = (
    <div className="aitown-world__placeholder aitown-world__placeholder--static">
      Loading world renderer...
    </div>
  );
  const overviewRefreshWarning = resolveOverviewRefreshWarning(
    overviewResource.error,
    Boolean(overviewResource.data)
  );
  const viewportToplineStatus = resolveViewportToplineStatus(
    overviewResource.state,
    overviewResource.error,
    overviewResource.data?.generated_at ?? null
  );
  const incidentFeedHeaderStatus = resolveIncidentFeedHeaderStatus(
    incidentFeedResource.state,
    incidentFeedResource.error,
    incidentFeedResource.data
  );
  const manualCorrelationOverrideActive = selectedCorrelationId !== null && selectedCorrelationWasExplicit;
  const preserveWorkflowCounterpartyCorrelation = selectedCorrelationId !== null && selectedCorrelationCarryForward;
  const selectedAgentPeekSeverity =
    selectedOperation?.effective_severity ??
    selectedWorldAgent?.severity ??
    selectedAgent?.effective_severity ??
    'normal';
  const selectedAgentPeekStatus =
    selectedOperation?.current_state ??
    selectedWorldAgent?.raw_state ??
    selectedAgent?.current_state ??
    'unknown';
  const selectedAgentPeekZone =
    selectedWorldAgent
      ? selectAgentZoneLabel(selectedWorldAgent, projectedWorld.zones)
      : selectedOperation?.current_location ?? selectedAgent?.current_location ?? null;
  const selectedAgentPeekOperation =
    selectedOperation?.current_blocker ||
    selectedOperation?.active_task ||
    selectedWorldAgent?.active_task ||
    selectedAgent?.active_task ||
    null;
  const selectedAgentPeekCorrelationId =
    selectedOperation?.correlation_id ?? selectedCorrelationId ?? defaultCorrelationId;
  const selectedAgentPeekEvidenceRef = resolveSelectedAgentPeekEvidenceRef({
    selectedOperation,
    workflow: activeWorkflow?.detail ?? null,
    correlationId: selectedAgentPeekCorrelationId
  });
  const selectedAgentEvidenceGlance = useMemo(
    () =>
      deriveSelectedAgentEvidenceGlance({
        selectedAgentId,
        evidenceSpineSummary: selectedAgentEvidenceSpineSummaryResource.data,
        evidenceCoverage: visibleEvidenceCoverage,
        sourceHealth: latestSourceHealth
      }),
    [latestSourceHealth, selectedAgentEvidenceSpineSummaryResource.data, selectedAgentId, visibleEvidenceCoverage]
  );
  const selectedAgentSourceMatrix = useMemo(
    () =>
      deriveSelectedAgentSourceMatrixViewModel(selectedAgentEvidenceSourceMatrixResource.data, selectedAgentId, {
        loadState: selectedAgentEvidenceSourceMatrixResource.state,
        error: selectedAgentEvidenceSourceMatrixResource.error,
        maxRows: 3,
        maxUnmappedRows: 1
      }),
    [
      selectedAgentEvidenceSourceMatrixResource.data,
      selectedAgentEvidenceSourceMatrixResource.error,
      selectedAgentEvidenceSourceMatrixResource.state,
      selectedAgentId
    ]
  );
  const selectedAgentSourceSummary = resolveSelectedAgentSourceSummary(selectedAgentSourceMatrix);
  const selectedAgentSourceGapFact = deriveSelectedAgentSourceGapFact(latestSourceHealth, selectedAgentId);
  const selectedAgentSourceHealthInspectPeek = useMemo(
    () => deriveSelectedAgentSourceHealthInspectPeek(latestSourceHealth, selectedAgentId, previousSourceHealth),
    [latestSourceHealth, previousSourceHealth, selectedAgentId]
  );
  const selectedAgentSourceGapInspectPeek = useMemo(
    () =>
      deriveRuntimeSourceGapInspectPeek(
        runtimeSourceGapsResource.data,
        selectedAgentId,
        sourceGapFocusIntent,
        overviewResource.data?.agents
      ),
    [overviewResource.data?.agents, runtimeSourceGapsResource.data, selectedAgentId, sourceGapFocusIntent]
  );
  const selectedAgentSourceGapLifecycleStrip = useMemo(
    () => {
      if (!selectedAgentId || sourceGapFocusIntent?.agentId !== selectedAgentId) {
        return null;
      }

      return deriveRuntimeSourceGapLifecycleStrip({
        runtimeSourceGapLifecycle: selectedAgentRuntimeSourceGapLifecycleResource.data,
        selectedAgentId,
        state:
          selectedAgentRuntimeSourceGapLifecycleResource.state === 'idle'
            ? 'loading'
            : selectedAgentRuntimeSourceGapLifecycleResource.state,
        error: selectedAgentRuntimeSourceGapLifecycleResource.error
      });
    },
    [
      selectedAgentRuntimeSourceGapLifecycleResource.data,
      selectedAgentRuntimeSourceGapLifecycleResource.error,
      selectedAgentRuntimeSourceGapLifecycleResource.state,
      selectedAgentId,
      sourceGapFocusIntent
    ]
  );
  const collectorSnapshotSummaryChip = useMemo(
    () =>
      resolveCollectorSnapshotSummaryChip(
        collectorSnapshotSummaryResource.data,
        collectorSnapshotSummaryResource.state,
        collectorSnapshotSummaryResource.error
      ),
    [
      collectorSnapshotSummaryResource.data,
      collectorSnapshotSummaryResource.error,
      collectorSnapshotSummaryResource.state
    ]
  );
  const handleSelectedAgentSourceGapFactOpen = useCallback(() => {
    if (!selectedAgentSourceGapFact) {
      return;
    }

    sourceGapFocusRequestIdRef.current += 1;
    requestedSelectedAgentDrilldownTabRef.current = 'evidence';
    activeHubCategoryFromSelectedAgentTabRef.current = false;
    setActiveHubCategory('supervision');
    handleSelectAgentForInspection(selectedAgentSourceGapFact.agentId);
    setSelectedAgentDrilldownTab('evidence');
    setSourceGapFocusIntent({
      agentId: selectedAgentSourceGapFact.agentId,
      agentLabel: selectedAgent?.display_name ?? selectedAgentSourceGapFact.agentId,
      sourceKind: selectedAgentSourceGapFact.sourceKind,
      sourceLabel: selectedAgentSourceGapFact.sourceLabel,
      status: selectedAgentSourceGapFact.status,
      sourceDrilldownGroupKey: selectedAgentSourceGapFact.sourceDrilldownGroupKey,
      requestId: sourceGapFocusRequestIdRef.current
    });
    setHubOpen(true);
  }, [handleSelectAgentForInspection, selectedAgent?.display_name, selectedAgentSourceGapFact]);
  const handleSelectedAgentEvidenceLedgerOpen = useCallback(() => {
    if (selectedAgentId === null) {
      return;
    }

    requestedSelectedAgentDrilldownTabRef.current = 'evidence';
    activeHubCategoryFromSelectedAgentTabRef.current = false;
    if (sourceGapFocusIntent?.agentId === selectedAgentId) {
      sourceGapFocusRequestIdRef.current += 1;
      setSourceGapFocusIntent({
        ...sourceGapFocusIntent,
        requestId: sourceGapFocusRequestIdRef.current
      });
      setActiveHubCategory('supervision');
    } else {
      setSourceGapFocusIntent(null);
      setActiveHubCategory('evidence');
    }
    setSelectedAgentDrilldownTab('evidence');
    setHubOpen(true);
  }, [selectedAgentId, sourceGapFocusIntent]);
  const handleSelectedAgentNowOpen = useCallback(() => {
    if (selectedAgentId === null) {
      return;
    }

    requestedSelectedAgentDrilldownTabRef.current = 'now';
    activeHubCategoryFromSelectedAgentTabRef.current = false;
    setSourceGapFocusIntent(null);
    setActiveHubCategory('crew');
    setSelectedAgentDrilldownTab('now');
    setHubOpen(true);
  }, [selectedAgentId]);
  const handleSelectedAgentReplayOpen = useCallback(() => {
    if (selectedAgentId === null) {
      return;
    }

    requestedSelectedAgentDrilldownTabRef.current = 'replay';
    activeHubCategoryFromSelectedAgentTabRef.current = false;
    setSourceGapFocusIntent(null);
    setActiveHubCategory('replay');
    setSelectedAgentDrilldownTab('replay');
    setHubOpen(true);
  }, [selectedAgentId]);
  const handleSelectedAgentSupervisionOpen = useCallback(() => {
    if (selectedAgentSourceGapFact) {
      handleSelectedAgentSourceGapFactOpen();
      return;
    }

    if (selectedAgentId === null) {
      return;
    }

    requestedSelectedAgentDrilldownTabRef.current = 'evidence';
    activeHubCategoryFromSelectedAgentTabRef.current = false;
    setSourceGapFocusIntent(null);
    setActiveHubCategory('supervision');
    setSelectedAgentDrilldownTab('evidence');
    setHubOpen(true);
  }, [handleSelectedAgentSourceGapFactOpen, selectedAgentId, selectedAgentSourceGapFact]);
  const handleReplaySelectedAgentEvidenceRecord = useCallback((evidenceId: string) => {
    const replayEvidenceId = evidenceId.trim();
    if (!replayEvidenceId) {
      return;
    }

    setReplayCheckpointFocus(null);
    setSelectedAgentReplayEvidenceId(replayEvidenceId);
    requestedSelectedAgentDrilldownTabRef.current = 'replay';
    activeHubCategoryFromSelectedAgentTabRef.current = false;
    setSourceGapFocusIntent(null);
    setActiveHubCategory('replay');
    setSelectedAgentDrilldownTab('replay');
    setHubOpen(true);
  }, []);
  const handleBackToSelectedAgentEvidenceRecord = useCallback(() => {
    if (selectedAgentId === null || selectedAgentEvidenceRecordId === null) {
      return;
    }

    requestedSelectedAgentDrilldownTabRef.current = 'evidence';
    activeHubCategoryFromSelectedAgentTabRef.current = false;
    setSourceGapFocusIntent(null);
    setActiveHubCategory('evidence');
    setSelectedAgentDrilldownTab('evidence');
    setHubOpen(true);
  }, [selectedAgentEvidenceRecordId, selectedAgentId]);
  const hudSignalSummary = [
    `Viewport · ${viewportToplineStatus.status}`,
    evidenceCoverageFocusSummary.totalGapCount > 0 ? `Evidence · ${evidenceCoverageFocusSummary.totalGapCount}` : null,
    evidenceCoverageReadModelStatus
      ? `${evidenceCoverageReadModelStatus.label} · ${evidenceCoverageReadModelStatus.summary}`
      : null,
    `Snapshot · ${collectorSnapshotSummaryChip.statusLabel}`,
    sourceGapChips.length > 0 ? `Source gaps · ${sourceGapChips.length}` : null,
    sourceHealthReadModelStatus
      ? `${sourceHealthReadModelStatus.label} · ${sourceHealthReadModelStatus.summary}`
      : null,
    hotZones.length > 0 ? `Zones · ${hotZones.length}` : null
  ]
    .filter(Boolean)
    .join(' / ');
  const activeHubCategoryLabel = resolveHubCategoryLabel(activeHubCategory);

  return (
    <main className="aitown-shell game-background">
      <section className="aitown-shell__layout aitown-shell__layout--fullscreen">
        <section
          className={`aitown-panel aitown-panel--game aitown-panel--game-fullscreen${
            selectedAgent && !hubOpen && scene.activeCorrelationId ? ' aitown-panel--peek-with-active-correlation' : ''
          }`}
          role="region"
          aria-label="Office world"
        >
          <div className="aitown-panel__chrome">
            <header className="aitown-shell__header">
            <div className="aitown-shell__brand">
              <span className="aitown-shell__eyebrow">Metaverse Office operator shell</span>
              <h1 className="game-title">Metaverse Office</h1>
              <p>Operator shell for real-running, supervised, replayable, accountable agents.</p>
            </div>

            <AgentRoster
              agents={scene.agents}
              selectedAgentId={selectedAgentId}
              onSelectAgent={handleRosterSelectAgent}
            />

            <div className="aitown-shell__stats" aria-label="Office summary">
              <div className="aitown-shell__stat">
                <span>Agents</span>
                <strong>{overviewResource.data?.summary.agent_count ?? 0}</strong>
              </div>
              <div className="aitown-shell__stat">
                <span>Blocked</span>
                <strong>{overviewResource.data?.summary.blocked_count ?? 0}</strong>
              </div>
              <div className="aitown-shell__stat">
                <span>Reboot</span>
                <strong>{overviewResource.data?.summary.reboot_recommended_count ?? 0}</strong>
              </div>
              <div className="aitown-shell__stat">
                <span>Feed</span>
                <strong>{incidentFeedHeaderStatus.count}</strong>
                {incidentFeedHeaderStatus.status ? (
                  <span role="status">
                    {incidentFeedHeaderStatus.detail
                      ? `Feed · ${incidentFeedHeaderStatus.status} · ${incidentFeedHeaderStatus.detail}`
                      : `Feed · ${incidentFeedHeaderStatus.status}`}
                  </span>
                ) : null}
              </div>
            </div>
          </header>
          <div className="aitown-panel__hud-top">
            <div className="aitown-panel__topline">
              <span className="aitown-panel__topline-card--live-focus">
                <strong className="aitown-panel__topline-title">Live Focus</strong>
                <span className="aitown-panel__topline-copy aitown-panel__topline-copy--live-focus-summary">
                  {resolveLiveFocusSummaryLabel(liveFocusAgents.length)}
                  {liveFocusReasonLine ? <span className="aitown-panel__live-focus-reason"> {liveFocusReasonLine}</span> : null}
                </span>
                {liveFocusAgents.length > 0 ? (
                  <>
                    <span className="aitown-panel__focus-chips" aria-label="Live focus agents">
                      {liveFocusAgents.slice(0, 3).map((agent) => (
                        <button
                          key={agent.agent_id}
                          type="button"
                          className={`aitown-focus-chip severity-${agent.severity}${selectedAgentId === agent.agent_id ? ' is-active' : ''}`}
                          aria-label={`Inspect live focus agent ${agent.display_name}`}
                          onClick={() => handleSelectAgentForInspection(agent.agent_id)}
                        >
                          <strong>{agent.display_name}</strong>
                          <span>{resolveLiveFocusAgentMeta(agent)}</span>
                        </button>
                      ))}
                    </span>
                  </>
                ) : (
                  <span className="aitown-panel__topline-copy">Drag to pan. Wheel to zoom. Tap or click an agent to inspect.</span>
                )}
              </span>
              <button
                type="button"
                className={`aitown-collector-summary-chip aitown-collector-summary-chip--${collectorSnapshotSummaryChip.tone}`}
                aria-label={`Open collector snapshot supervision summary: ${collectorSnapshotSummaryChip.statusLabel}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={handleCollectorSnapshotSummaryOpen}
              >
                <span className="aitown-panel__topline-title">Collector snapshot</span>
                <strong>{collectorSnapshotSummaryChip.statusLabel}</strong>
                <span>{collectorSnapshotSummaryChip.countLabel}</span>
                <span>{collectorSnapshotSummaryChip.healthLabel}</span>
                <span>{collectorSnapshotSummaryChip.timeLabel}</span>
              </button>
              <details className="aitown-panel__signal-cluster" role="region" aria-label="Office HUD signals">
                <summary className="aitown-panel__hud-popover-summary">
                  <strong className="aitown-panel__topline-title">Signals</strong>
                  <span className="aitown-panel__topline-copy">{hudSignalSummary}</span>
                </summary>
                <div className="aitown-panel__signal-grid">
                  <section className="aitown-panel__signal-panel aitown-panel__signal-panel--viewport">
                    <strong className="aitown-panel__topline-title">Viewport</strong>
                    <span className="aitown-panel__topline-copy">Drag to pan. Wheel to zoom. Tap or click an agent to inspect.</span>
                    <span className="aitown-panel__topline-copy">{viewportToplineStatus.snapshot}</span>
                  </section>
                  {evidenceCoverageReadModelStatus ? (
                    <section
                      className={`aitown-panel__signal-panel aitown-panel__read-model-status aitown-panel__read-model-status--${evidenceCoverageReadModelStatus.tone}`}
                      role="region"
                      aria-label="Evidence coverage read model status"
                    >
                      <div className="aitown-panel__evidence-focus__head">
                        <strong className="aitown-panel__topline-title">{evidenceCoverageReadModelStatus.label}</strong>
                        <span className="aitown-panel__topline-copy">{evidenceCoverageReadModelStatus.summary}</span>
                      </div>
                      <span className="aitown-panel__topline-copy">{evidenceCoverageReadModelStatus.detail}</span>
                    </section>
                  ) : null}
                  {evidenceCoverageFocusSummary.totalGapCount > 0 ? (
                    <section
                      className="aitown-panel__signal-panel aitown-panel__evidence-focus"
                      role="region"
                      aria-label="Evidence coverage focus"
                    >
                      <div className="aitown-panel__evidence-focus__head">
                        <strong className="aitown-panel__topline-title">Evidence</strong>
                        <span className="aitown-panel__topline-copy">
                          {`${evidenceCoverageFocusSummary.totalGapCount} coverage gap${evidenceCoverageFocusSummary.totalGapCount === 1 ? '' : 's'}`}
                        </span>
                      </div>
                      <span className="aitown-panel__topline-copy">Low-confidence or uncovered evidence</span>
                      <span
                        className="aitown-panel__focus-chips aitown-panel__focus-chips--compact"
                        role="group"
                        aria-label="Evidence coverage focus agents"
                      >
                        {evidenceCoverageFocusItems.map((item) => (
                          <button
                            key={item.agent_id}
                            type="button"
                            className={`aitown-focus-chip aitown-focus-chip--evidence${selectedAgentId === item.agent_id ? ' is-active' : ''}`}
                            aria-label={`Inspect evidence coverage focus agent ${item.display_name}`}
                            onClick={() => handleEvidenceCoverageFocusAgent(item.agent_id)}
                          >
                            <strong>{item.display_name}</strong>
                            <span>{`ID · ${item.agent_id}`}</span>
                            <span>{renderEvidenceCoverageFocusStatus(item)}</span>
                            <span>
                              {`${renderEvidenceCoverageFocusRefCount(item.evidence_ref_count)} · ${renderEvidenceCoverageFocusSources(item.source_labels)}`}
                            </span>
                            <span>{renderEvidenceCoverageFocusLatest(item)}</span>
                          </button>
                        ))}
                        {evidenceCoverageFocusSummary.overflowCount > 0 ? (
                          <span className="aitown-focus-chip aitown-focus-chip--evidence aitown-focus-chip--readonly">
                            <strong>{`+${evidenceCoverageFocusSummary.overflowCount} more`}</strong>
                          </span>
                        ) : null}
                      </span>
                    </section>
                  ) : null}
                  {sourceHealthReadModelStatus ? (
                    <section
                      className={`aitown-panel__signal-panel aitown-panel__read-model-status aitown-panel__read-model-status--${sourceHealthReadModelStatus.tone}`}
                      role="region"
                      aria-label="Source health read model status"
                    >
                      <div className="aitown-panel__evidence-focus__head">
                        <strong className="aitown-panel__topline-title">{sourceHealthReadModelStatus.label}</strong>
                        <span className="aitown-panel__topline-copy">{sourceHealthReadModelStatus.summary}</span>
                      </div>
                      <span className="aitown-panel__topline-copy">{sourceHealthReadModelStatus.detail}</span>
                    </section>
                  ) : null}
                  {sourceGapChips.length > 0 ? (
                    <section
                      className="aitown-panel__signal-panel aitown-panel__source-gap-focus"
                      role="region"
                      aria-label="Source gap focus"
                    >
                      <div className="aitown-panel__evidence-focus__head">
                        <strong className="aitown-panel__topline-title">Source gaps</strong>
                        <span className="aitown-panel__topline-copy">
                          {`${sourceGapQueueTotal} provenance gap${sourceGapQueueTotal === 1 ? '' : 's'}`}
                        </span>
                      </div>
                      <span className="aitown-panel__topline-copy">Runtime source-gap read model</span>
                      <span
                        className="aitown-panel__focus-chips aitown-panel__focus-chips--compact"
                        role="group"
                        aria-label="Source gap focus agents"
                      >
                        {sourceGapChips.map((chip) =>
                          chip.agentId && chip.sourceDrilldownGroupKey ? (
                            <button
                              key={`${chip.agentId}:${chip.sourceKind}:${chip.status}`}
                              type="button"
                              className={`aitown-focus-chip aitown-focus-chip--source-gap source-gap-${chip.status}${selectedAgentId === chip.agentId ? ' is-active' : ''}`}
                              aria-label={`Open source gap supervision for ${chip.displayName} ${chip.sourceLabel.toLowerCase()} ${chip.status}`}
                              onClick={() => handleSourceGapFocusAgent(chip)}
                            >
                              <strong>{chip.displayName}</strong>
                              <span>{`${chip.sourceLabel} · ${chip.status}`}</span>
                              {chip.lifecycleLabel ? <span>{chip.lifecycleLabel}</span> : null}
                              <span>{chip.detail}</span>
                              <span>{chip.observedAtLabel}</span>
                            </button>
                          ) : (
                            <span
                              key={`unmapped:${chip.sourceKind}:${chip.status}:${chip.observedAtLabel}`}
                              className={`aitown-focus-chip aitown-focus-chip--source-gap source-gap-${chip.status}`}
                              role="status"
                              aria-label={`Unmapped source gap ${chip.sourceLabel.toLowerCase()} ${chip.status}`}
                            >
                              <strong>{chip.displayName}</strong>
                              <span>{`${chip.sourceLabel} · ${chip.status}`}</span>
                              {chip.lifecycleLabel ? <span>{chip.lifecycleLabel}</span> : null}
                              <span>{chip.detail}</span>
                              <span>{chip.observedAtLabel}</span>
                            </span>
                          )
                        )}
                      </span>
                    </section>
                  ) : null}
                  {sourceGapReadModelStatus ? (
                    <section
                      className={`aitown-panel__signal-panel aitown-panel__read-model-status aitown-panel__read-model-status--${sourceGapReadModelStatus.tone}`}
                      role="region"
                      aria-label="Source gap read model status"
                    >
                      <div className="aitown-panel__evidence-focus__head">
                        <strong className="aitown-panel__topline-title">{sourceGapReadModelStatus.label}</strong>
                        <span className="aitown-panel__topline-copy">{sourceGapReadModelStatus.summary}</span>
                      </div>
                      <span className="aitown-panel__topline-copy">{sourceGapReadModelStatus.detail}</span>
                    </section>
                  ) : null}
                  {hotZones.length > 0 ? (
                    <section className="aitown-panel__signal-panel aitown-panel__hot-zone-focus" role="region" aria-label="Hot zone focus">
                      <div className="aitown-panel__evidence-focus__head">
                        <strong className="aitown-panel__topline-title">Zones</strong>
                        <span className="aitown-panel__topline-copy">
                          {`${hotZones.length} hot zone${hotZones.length === 1 ? '' : 's'}`}
                        </span>
                      </div>
                      <span
                        className="aitown-panel__focus-chips aitown-panel__focus-chips--compact"
                        role="group"
                        aria-label="Hot zone focus"
                      >
                        {hotZones.map((zone) => (
                          <button
                            key={zone.zone_id}
                            type="button"
                            className={`aitown-focus-chip aitown-focus-chip--hot-zone severity-${zone.highest_severity}`}
                            aria-label={`${zone.label} · ${resolveHotZoneFocusMeta(zone)} · Focus in world viewport`}
                            onClick={() => handleFocusWorldZone(zone.zone_id)}
                          >
                            <strong>{zone.label}</strong>
                            <span>{resolveHotZoneFocusMeta(zone)}</span>
                          </button>
                        ))}
                      </span>
                    </section>
                  ) : null}
                </div>
              </details>
            </div>

          </div>
          </div>
          <nav className="aitown-hub-category-bar" aria-label="Office category menu">
            {HUB_CATEGORIES.map((category, index) => {
              const active = hubOpen && activeHubCategory === category.id;

              return (
                <button
                  key={category.id}
                  ref={index === 0 ? hubTriggerRef : undefined}
                  type="button"
                  className={`aitown-hub-category-bar__button${active ? ' is-active' : ''}`}
                  aria-label={category.label}
                  aria-expanded={active}
                  aria-current={active ? 'page' : undefined}
                  aria-controls="aitown-hub"
                  aria-haspopup="dialog"
                  onClick={() => openHubCategory(category.id)}
                >
                  <strong>{category.label}</strong>
                  <span>{category.hint}</span>
                </button>
              );
            })}
            <button
              type="button"
              className="aitown-button aitown-hub-category-bar__reset"
              aria-keyshortcuts={RESET_VIEW_SHORTCUT_ARIA}
              onClick={handleResetView}
            >
              Reset view
            </button>
            {selectedAgent ? (
              <button type="button" className="aitown-button aitown-hub-category-bar__clear" onClick={() => selectAgent(null, null)}>
                Clear Selection
              </button>
            ) : null}
          </nav>
          <SceneStatusLegend onFocusWorldZone={handleFocusWorldZone} world={projectedWorld} />

          {selectedAgent && !hubOpen ? (
            <aside
              className={`aitown-selected-agent-peek severity-${selectedAgentPeekSeverity}`}
              role="region"
              aria-label="Selected agent inspect peek"
            >
              <div className="aitown-selected-agent-peek__head">
                <span className="aitown-selected-agent-peek__eyebrow">Selected agent</span>
                <strong>{selectedAgent.display_name}</strong>
                <span>{`State · ${selectedAgentPeekStatus}`}</span>
              </div>
              <div className="aitown-selected-agent-peek__triage">
                {selectedAgentPeekOperation ? <span>{`Work · ${selectedAgentPeekOperation}`}</span> : null}
                {selectedAgentSourceSummary ? <span>{selectedAgentSourceSummary}</span> : null}
                {selectedAgentSourceHealthInspectPeek ? (
                  <span>
                    {`Source gap · ${selectedAgentSourceHealthInspectPeek.sourceKindLabel} · ${selectedAgentSourceHealthInspectPeek.statusLabel}`}
                  </span>
                ) : null}
                {selectedAgentEvidenceGlance ? (
                  <span className="aitown-selected-agent-peek__proof" role="group" aria-label="Selected agent proof glance">
                    {selectedAgentEvidenceGlance.map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </span>
                ) : null}
              </div>
              {selectedAgentSourceMatrix.status !== 'empty' || selectedAgentSourceMatrix.selectedAgentId ? (
                <details className="aitown-selected-agent-peek__source-details">
                  <summary>Source details</summary>
                  <section
                    className="aitown-selected-agent-peek__source-matrix"
                    role="region"
                    aria-label="Selected agent source matrix peek"
                  >
                    <span className="aitown-selected-agent-peek__source-matrix-label">
                      {selectedAgentSourceMatrix.statusLabel}
                    </span>
                    {selectedAgentSourceMatrix.status === 'ready' ? null : <span>{selectedAgentSourceMatrix.detailLabel}</span>}
                    {selectedAgentSourceMatrix.rows.map((row) => (
                      <span
                        key={`${row.source}:${row.status}:${row.role}:${row.output}:${row.count}:${row.latest_at ?? 'unknown'}`}
                        className="aitown-selected-agent-peek__source-matrix-row"
                      >
                        <strong>{`${row.source} · ${row.status}`}</strong>
                        <span>{`${row.role} · ${row.output} · ${row.count}`}</span>
                        <span>{`Latest · ${row.latest_at ?? 'unknown'}`}</span>
                      </span>
                    ))}
                    {selectedAgentSourceMatrix.unmappedSummary.totalCount > 0 ? (
                      <span>{`Unmapped evidence · ${selectedAgentSourceMatrix.unmappedSummary.totalCount} separate`}</span>
                    ) : null}
                  </section>
                </details>
              ) : null}
              <details className="aitown-selected-agent-peek__facts">
                <summary>Inspect facts</summary>
                {selectedAgentPeekZone ? <span>{`Zone · ${selectedAgentPeekZone}`}</span> : null}
                {selectedAgentPeekOperation ? <span>{`Operation · ${selectedAgentPeekOperation}`}</span> : null}
                {selectedAgentPeekCorrelationId ? <span>Correlation · available</span> : null}
                {selectedAgentPeekEvidenceRef ? <span>Evidence · attached</span> : null}
              </details>
              {selectedAgentSourceGapInspectPeek || selectedAgentSourceGapLifecycleStrip ? (
                <section
                  className="aitown-selected-agent-peek__source-gap-inspect"
                  role="region"
                  aria-label="Source gap inspect peek"
                >
                  {selectedAgentSourceGapInspectPeek ? (
                    <>
                      <span className="aitown-selected-agent-peek__source-gap-inspect-label">
                        {selectedAgentSourceGapInspectPeek.evidenceOnlyLabel}
                      </span>
                      <strong>
                        {`${selectedAgentSourceGapInspectPeek.sourceKindLabel} · ${selectedAgentSourceGapInspectPeek.statusLabel}`}
                      </strong>
                      <span>{selectedAgentSourceGapInspectPeek.mappingLabel}</span>
                      <span>{selectedAgentSourceGapInspectPeek.observedAtLabel}</span>
                      <span>{selectedAgentSourceGapInspectPeek.collectedAtLabel}</span>
                    </>
                  ) : null}
                  {renderRuntimeSourceGapLifecycleStrip(selectedAgentSourceGapLifecycleStrip)}
                  <button
                    type="button"
                    className="aitown-selected-agent-peek__source-gap-inspect-link"
                    onClick={handleSelectedAgentEvidenceLedgerOpen}
                  >
                    Open source-gap drilldown
                  </button>
                </section>
              ) : null}
              <div className="aitown-selected-agent-peek__actions" role="group" aria-label="Selected agent triage actions">
                <button
                  type="button"
                  className="aitown-button aitown-selected-agent-peek__action"
                  aria-label={`Open ${selectedAgent.display_name} Now drilldown`}
                  onClick={handleSelectedAgentNowOpen}
                >
                  Now
                </button>
                <button
                  type="button"
                  className="aitown-button aitown-selected-agent-peek__action"
                  aria-label={`Open ${selectedAgent.display_name} Evidence Ledger`}
                  onClick={handleSelectedAgentEvidenceLedgerOpen}
                >
                  Evidence
                </button>
                <button
                  type="button"
                  className="aitown-button aitown-selected-agent-peek__action"
                  aria-label={`Open ${selectedAgent.display_name} Replay drilldown`}
                  onClick={handleSelectedAgentReplayOpen}
                >
                  Replay
                </button>
                <button
                  type="button"
                  className="aitown-button aitown-selected-agent-peek__action"
                  aria-label={`Open ${selectedAgent.display_name} Supervision drilldown`}
                  onClick={handleSelectedAgentSupervisionOpen}
                >
                  Supervision
                </button>
              </div>
            </aside>
          ) : null}

          {overviewRefreshWarning ? (
            <div className="aitown-world__placeholder aitown-world__placeholder--warning" role="status">
              <strong>Showing last office snapshot.</strong>
              <span>{overviewRefreshWarning}</span>
            </div>
          ) : null}

          {overviewResource.state === 'error' && !overviewResource.data ? (
            <div className="aitown-world__placeholder aitown-world__placeholder--error">
              <strong>Unable to load office overview.</strong>
              <span>{overviewResource.error}</span>
            </div>
          ) : isJsdomEnvironment() ? (
            rendererFallback
          ) : (
            <Suspense fallback={rendererFallback}>
              <LazyWorldScene
                scene={scene}
                onSelectAgent={handleSceneSelectAgent}
                onSelectSourceGapPin={handleSourceGapWorldPinInspect}
                resetViewSignal={resetViewSignal}
                agentFocusRequest={agentFocusRequest}
                zoneFocusRequest={zoneFocusRequest}
              />
            </Suspense>
          )}
        </section>
      </section>

      {hubOpen ? (
        <div className="aitown-hub-overlay" onClick={closeHub}>
          <div
            ref={hubDialogRef}
            id="aitown-hub"
            className="aitown-hub-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Hub"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="aitown-hub-sheet__header">
              <span id="aitown-hub-title" className="aitown-hub-sheet__title">{activeHubCategoryLabel}</span>
              <div className="aitown-hub-sheet__actions">
                <button
                  type="button"
                  className="aitown-button"
                  aria-keyshortcuts={RESET_VIEW_SHORTCUT_ARIA}
                  onClick={handleResetView}
                >
                  Reset view
                </button>
                <button ref={hubCloseButtonRef} type="button" className="aitown-button" onClick={closeHub}>
                  Close panel
                </button>
              </div>
            </div>
            <div className={selectedAgent ? 'aitown-hub-sheet__body aitown-hub-sheet__body--selected-agent' : 'aitown-hub-sheet__body'}>
              {selectedAgent ? (
              <div className="aitown-hub-selected-agent-chrome">
                <section
                  className={`aitown-hub-focus-ribbon severity-${selectedAgentPeekSeverity}`}
                  role="region"
                  aria-label="Hub focus ribbon"
                >
                  <div className="aitown-hub-focus-ribbon__head">
                    <span className="aitown-hub-focus-ribbon__eyebrow">Selected agent</span>
                    <strong>{selectedAgent.display_name}</strong>
                    <span>{`${HOT_ZONE_SEVERITY_LABELS[selectedAgentPeekSeverity]} · ${selectedAgentPeekStatus}`}</span>
                  </div>
                  <div className="aitown-hub-focus-ribbon__facts">
                    <span className="aitown-hub-focus-ribbon__facts-label">Loaded context facts</span>
                    {selectedAgentPeekZone ? <span>{`Zone · ${selectedAgentPeekZone}`}</span> : null}
                    {selectedAgentPeekOperation ? <span>{`Operation · ${selectedAgentPeekOperation}`}</span> : null}
                    {selectedAgentPeekCorrelationId ? (
                      <span>{`Correlation · ${selectedAgentPeekCorrelationId}`}</span>
                    ) : null}
                    {selectedAgentPeekEvidenceRef ? <span>{`Evidence · ${selectedAgentPeekEvidenceRef}`}</span> : null}
                    {selectedAgentSourceHealthInspectPeek && selectedAgentSourceGapFact ? (
                      <button
                        type="button"
                        className="aitown-hub-focus-ribbon__source-gap-fact"
                        aria-label={`Open source gap supervision for ${selectedAgent.display_name} ${selectedAgentSourceGapFact.sourceLabel.toLowerCase()} ${selectedAgentSourceGapFact.status}`}
                        onClick={handleSelectedAgentSourceGapFactOpen}
                      >
                        {[
                          'Source health',
                          selectedAgentSourceHealthInspectPeek.sourceKindLabel,
                          selectedAgentSourceHealthInspectPeek.statusLabel,
                          selectedAgentSourceHealthInspectPeek.mappingLabel,
                          selectedAgentSourceHealthInspectPeek.diffLineLabel
                        ].join(' · ')}
                      </button>
                    ) : null}
                  </div>
                </section>
                <section
                  className="aitown-hub-drilldown"
                  role="region"
                  aria-label="Selected agent drilldown"
                >
                  <div className="aitown-hub-drilldown__tabs" role="tablist" aria-label="Selected agent drilldown">
                    {SELECTED_AGENT_DRILLDOWN_TABS.map((tab) => {
                      const selected = selectedAgentDrilldownTab === tab.id;

                      return (
                        <button
                          key={tab.id}
                          id={resolveSelectedAgentDrilldownTabId(tab.id)}
                          type="button"
                          role="tab"
                          className={`aitown-hub-drilldown__tab${selected ? ' is-active' : ''}`}
                          aria-selected={selected}
                          aria-controls={selected ? resolveSelectedAgentDrilldownPanelId(tab.id) : undefined}
                          tabIndex={selected ? 0 : -1}
                          onClick={() => handleSelectSelectedAgentDrilldownTab(tab.id)}
                          onKeyDown={handleSelectedAgentDrilldownTabKeyDown}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </section>
              </div>
              ) : null}
              <div
              id={
                selectedAgent
                  ? resolveSelectedAgentDrilldownPanelId(selectedAgentDrilldownTab)
                  : undefined
              }
              className={selectedAgent ? 'aitown-hub-drilldown__panel' : 'aitown-hub-drilldown__panel aitown-hub-drilldown__panel--crew'}
              role={selectedAgent ? 'tabpanel' : undefined}
              aria-labelledby={
                selectedAgent
                  ? resolveSelectedAgentDrilldownTabId(selectedAgentDrilldownTab)
                  : undefined
              }
            >
              <DetailsPanel
                activeHubCategory={activeHubCategory}
                collectorSnapshot={visibleCollectorSnapshot}
              collectorSnapshotError={collectorSnapshotResource.error}
              collectorSnapshotState={collectorSnapshotResource.state}
              correlation={activeCorrelation}
              correlationError={correlationResource.error}
              correlationState={correlationResource.state}
              incidentFeed={incidentFeedResource.data}
              incidentFeedError={incidentFeedResource.error}
              incidentFeedState={incidentFeedResource.state}
              crewIncidentCorrelationSelectableIds={crewIncidentCorrelationSelectableIds}
              openSupervisionAlerts={crewOpenSupervisionAlertsResource.data}
              openSupervisionAlertsError={crewOpenSupervisionAlertsResource.error}
              openSupervisionAlertsState={crewOpenSupervisionAlertsResource.state}
              operations={operationsResource.data}
              operationsError={operationsResource.error}
              operationsState={operationsResource.state}
              activeCorrelationQueueOperations={activeCorrelationQueueOperations}
              activeCorrelationQueueError={activeCorrelationQueueError}
              activeCorrelationQueueState={activeCorrelationQueueState}
              operationsStateBuckets={crewOverviewOperationStateBuckets}
              operationsSeverityBuckets={crewOverviewOperationSeverityBuckets}
              operationsStateBucketsError={crewOverviewStateBucketsResource.error}
              operationsStateBucketsState={crewOverviewStateBucketsResource.state}
              overviewZones={overviewResource.data?.zones ?? null}
              manualCorrelationOverrideActive={manualCorrelationOverrideActive}
              preserveWorkflowCounterpartyCorrelation={preserveWorkflowCounterpartyCorrelation}
              selectedAgent={selectedAgent}
              selectedCorrelationId={selectedCorrelationId}
              selectedCrewOpenSupervisionSeverity={selectedCrewOpenSupervisionSeverity}
              selectedAgentSupervisionHistorySeverity={selectedAgentSupervisionHistorySeverity}
              selectedAgentReplaySeverity={activeSelectedAgentReplaySeverity}
              selectedCrewReplaySeverity={activeCrewReplaySeverity}
              selectedOperationsState={selectedOperationsState}
              selectedOperationsSeverity={selectedOperationsSeverity}
              selectedOperation={selectedOperation}
              selectedOperationRequestActive={selectedOperationSelection !== null}
              selectedAgentDrilldownTab={selectedAgent ? selectedAgentDrilldownTab : null}
              sourceGapFocusIntent={sourceGapFocusIntent}
              timelineReplay={timelineReplayResource.data}
              timelineReplayError={timelineReplayResource.error}
              timelineReplayState={timelineReplayResource.state}
              selectedAgentTimelineReplay={selectedAgentTimelineReplay}
              selectedAgentTimelineReplayError={selectedAgentTimelineReplayError}
              selectedAgentTimelineReplayState={selectedAgentTimelineReplayState}
              selectedAgentAccountabilityReplay={selectedAgentAccountabilityReplay}
              selectedAgentAccountabilityReplayError={selectedAgentAccountabilityReplayError}
              selectedAgentAccountabilityReplayState={selectedAgentAccountabilityReplayState}
              selectedAgentEvidenceReplayWindow={selectedAgentEvidenceReplayWindow}
              selectedAgentEvidenceReplayWindowError={selectedAgentEvidenceReplayWindowError}
              selectedAgentEvidenceReplayWindowState={selectedAgentEvidenceReplayWindowState}
              selectedAgentEvidenceLedger={selectedAgentEvidenceLedger}
              selectedAgentEvidenceLedgerError={selectedAgentEvidenceLedgerError}
              selectedAgentEvidenceLedgerState={selectedAgentEvidenceLedgerState}
              selectedAgentEvidenceRecord={selectedAgentEvidenceRecord}
              selectedAgentEvidenceRecordError={selectedAgentEvidenceRecordError}
              selectedAgentEvidenceRecordId={selectedAgentEvidenceRecordId}
              selectedAgentEvidenceRecordState={selectedAgentEvidenceRecordState}
              selectedAgentEvidenceProvenanceBundle={selectedAgentEvidenceProvenanceBundle}
              selectedAgentEvidenceProvenanceBundleError={selectedAgentEvidenceProvenanceBundleError}
              selectedAgentEvidenceProvenanceBundleState={selectedAgentEvidenceProvenanceBundleState}
              selectedAgentEvidenceSourceContext={selectedAgentEvidenceSourceContext}
              selectedAgentEvidenceSourceContextError={selectedAgentEvidenceSourceContextError}
              selectedAgentEvidenceSourceContextState={selectedAgentEvidenceSourceContextState}
              selectedAgentEvidenceCheckpointLog={selectedAgentEvidenceCheckpointLog}
              selectedAgentEvidenceCheckpointLogError={selectedAgentEvidenceCheckpointLogError}
              selectedAgentEvidenceCheckpointLogState={selectedAgentEvidenceCheckpointLogState}
              workflow={activeWorkflow}
              workflowError={workflowError}
              workflowState={workflowState}
              world={projectedWorld}
              memoryArtifacts={memoryArtifacts}
              memoryArtifactsError={memoryArtifactsResource.error}
              memoryArtifactsState={memoryArtifactsResource.state}
              sharedMemoryRequestScopeLabel={sharedMemoryRequestScopeLabel}
              focusedSharedMemoryArtifactRef={focusedSharedMemoryArtifactRef}
              sharedMemoryJumpStatus={sharedMemoryJumpStatus}
              replayCheckpointEventId={
                selectedAgentId === null
                  ? crewReplayCheckpointEventId
                  : selectedAgentReplayCheckpointEventId
              }
              selectedAgentSupervisionHistoryRequestScopeLabel={
                selectedAgentSupervisionHistoryRequestScopeLabel
              }
              selectedAgentSupervisionHistory={selectedAgentSupervisionHistory}
              selectedAgentSupervisionHistoryError={selectedAgentSupervisionHistoryError}
              selectedAgentSupervisionHistoryState={selectedAgentSupervisionHistoryState}
              onInspectAgent={(agentId) =>
                selectAgentWithSnapshot(
                  agentId,
                  null,
                  resolveDirectOperationSelection(agentId, null),
                  'auto',
                  false,
                  false,
                  resolveOperationSnapshotSeed(agentId, crewOverviewOperationSeedData)
                )
              }
              onSelectAgent={(agentId, correlationId, options) =>
                selectAgentWithSnapshot(
                  agentId,
                  correlationId ?? null,
                  null,
                  correlationId !== undefined && correlationId !== null
                    ? 'preserved'
                    : options?.preserveNullCorrelation && correlationId === null
                      ? 'preserved'
                      : 'auto',
                  correlationId !== null && correlationId !== undefined && correlationId === selectedCorrelationId && selectedCorrelationWasExplicit,
                  correlationId !== null && correlationId !== undefined && correlationId === selectedCorrelationId && selectedCorrelationCarryForward,
                  null
                )
              }
              onSelectCorrelation={handleSelectCorrelation}
              onResetCorrelationOverride={handleResetCorrelationOverride}
              onSelectCrewOpenSupervisionSeverity={setSelectedCrewOpenSupervisionSeverity}
              onSelectSelectedAgentSupervisionHistorySeverity={(severity) =>
                setSelectedAgentSupervisionHistoryFilter(
                  selectedAgentId !== null
                    ? {
                        agentId: selectedAgentId,
                        severity
                      }
                    : null
                )
              }
              onSelectSelectedAgentReplaySeverity={handleSelectSelectedAgentReplaySeverity}
              onSelectCrewReplaySeverity={handleSelectCrewReplaySeverity}
              onSelectOperationsState={setSelectedOperationsState}
              onSelectOperationsSeverity={setSelectedOperationsSeverity}
              onSelectOperation={handleSelectOperation}
              onInspectSelectedAgentEvidenceRecord={handleInspectSelectedAgentEvidenceRecord}
              onInspectSelectedAgentEvidenceSourceContext={handleInspectSelectedAgentEvidenceSourceContext}
              onReplaySelectedAgentEvidenceRecord={handleReplaySelectedAgentEvidenceRecord}
              onBackToSelectedAgentEvidenceRecord={
                selectedAgentEvidenceRecordId ? handleBackToSelectedAgentEvidenceRecord : undefined
              }
              onFocusSharedMemoryArtifact={handleFocusSharedMemoryArtifact}
              onFocusWorldAgent={requestAgentFocus}
              onOpenReplayCheckpoint={handleOpenReplayCheckpoint}
              onFocusWorldZone={handleFocusWorldZone}
              />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default function App() {
  return (
    <WorldProvider>
      <AppInner />
    </WorldProvider>
  );
}
