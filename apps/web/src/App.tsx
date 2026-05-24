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
  fetchAgentWorkflow,
  fetchAccountabilityReplay,
  fetchCollectorEvidenceCoverage,
  fetchCollectorSnapshot,
  fetchCollectorSourceHealth,
  fetchCorrelationDrilldown,
  fetchEvidenceRecord,
  fetchEvidenceProvenanceBundle,
  fetchEvidenceRecords,
  fetchIncidents,
  fetchMemoryArtifacts,
  fetchOfficeOperations,
  fetchOfficeOverview,
  fetchPeerWatchAlerts,
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
  deriveCollectorEvidenceCoverageFocusItems,
  type CollectorEvidenceCoverageFocusItem
} from './aitown/evidenceCoverage';
import { resolveRolePawnAssetUrl } from './aitown/rolePawnAssets';
import { adaptWorldToScene } from './aitown/sceneAdapter';
import {
  deriveRuntimeSourceGapChips,
  deriveRuntimeSourceGapInspectPeek,
  deriveRuntimeSourceGapLifecycleStrip,
  deriveRuntimeSourceGapWorldPins,
  deriveSelectedAgentSourceGapFact,
  type RuntimeSourceGapLifecycleStrip
} from './aitown/sourceGapSignals';
import { deriveSelectedAgentSourceHealthInspectPeek } from './aitown/sourceHealth';
import { deriveSelectedAgentEvidenceGlance } from './aitown/selectedAgentEvidenceGlance';
import { WorldProvider, useWorld } from './context/WorldContext';
import { usePolledResource, type LoadState } from './hooks/usePolledResource';
import { getHubFocusableElements, isHubElementVisible } from './hubFocus';
import {
  buildSelectedAgentEvidenceLedger,
  type SelectedAgentEvidenceLedgerModel
} from './selectedAgentEvidenceLedger';
import type {
  AccountabilityReplayBundle,
  CollectorEvidenceCoverage,
  CollectorSnapshot,
  CollectorSourceHealthProjection,
  CorrelationDrilldown,
  EvidenceProvenanceBundle,
  EvidenceRecord,
  MemoryArtifact,
  MemoryArtifactIndex,
  OfficeAgent,
  OfficeOperation,
  OfficeOperations,
  PeerWatchAlertsResponse,
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

function renderEvidenceCoverageFocusSources(sourceKinds: string[]) {
  return sourceKinds.length > 0 ? sourceKinds.join(', ') : 'No evidence sources';
}

function renderEvidenceCoverageFocusStatus(item: CollectorEvidenceCoverageFocusItem) {
  return item.status === 'uncovered_in_snapshot' ? 'Uncovered in snapshot' : 'Low-confidence evidence';
}

function renderEvidenceCoverageFocusLatest(item: CollectorEvidenceCoverageFocusItem) {
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
  const zoneFocusRequestIdRef = useRef(0);
  const sourceGapFocusRequestIdRef = useRef(0);
  const wasHubOpenRef = useRef(false);

  const clearSelectedAgentEvidenceRecordDetail = useCallback(() => {
    evidenceRecordDetailRequestIdRef.current += 1;
    evidenceRecordDetailAbortControllerRef.current?.abort();
    evidenceRecordDetailAbortControllerRef.current = null;
    setSelectedAgentEvidenceRecord(null);
    setSelectedAgentEvidenceRecordId(null);
    setSelectedAgentEvidenceRecordError(null);
    setSelectedAgentEvidenceRecordState('idle');
    setSelectedAgentEvidenceProvenanceBundle(null);
    setSelectedAgentEvidenceProvenanceBundleError(null);
    setSelectedAgentEvidenceProvenanceBundleState('idle');
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

  const scene = useMemo(
    () =>
      adaptWorldToScene(
        projectedWorld,
        selectedAgentId,
        activeCorrelationSpotlight?.correlation_id ?? null,
        activeCorrelationParticipantAgentIds,
        deriveRuntimeSourceGapWorldPins(runtimeSourceGapsResource.data, overviewResource.data?.agents)
      ),
    [
      activeCorrelationParticipantAgentIds,
      activeCorrelationSpotlight?.correlation_id,
      overviewResource.data?.agents,
      projectedWorld,
      runtimeSourceGapsResource.data,
      selectedAgentId
    ]
  );
  const liveFocusAgents = useMemo(() => selectAttentionQueue(projectedWorld), [projectedWorld]);
  const liveFocusReasonLine = useMemo(() => resolveLiveFocusReasonLine(liveFocusAgents), [liveFocusAgents]);
  const hotZones = useMemo(() => selectHotZones(projectedWorld), [projectedWorld]);
  const visibleCollectorSnapshot = collectorSnapshotResource.data;
  const visibleEvidenceCoverage =
    collectorSnapshotResource.data?.evidence_coverage ?? defaultEvidenceCoverage;
  const evidenceCoverageOverviewAgents = useMemo(
    () => overviewResource.data?.agents.filter((agent) => agent.kind === 'employee'),
    [overviewResource.data?.agents]
  );
  const evidenceCoverageFocusItems = useMemo(
    () =>
      hubOpen || selectedAgentId !== null
        ? []
        : deriveCollectorEvidenceCoverageFocusItems(visibleEvidenceCoverage, evidenceCoverageOverviewAgents),
    [evidenceCoverageOverviewAgents, hubOpen, selectedAgentId, visibleEvidenceCoverage]
  );
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
  const selectedAgentEvidenceLedgerResource = usePolledResource<SelectedAgentEvidenceLedgerPayload>({
    enabled:
      hubOpen &&
      selectedAgentId !== null &&
      activeHubCategory === 'evidence' &&
      selectedAgentDrilldownTab === 'evidence',
    load: async (signal) => ({
      targetAgentId: selectedAgentId!,
      evidenceLedger: buildSelectedAgentEvidenceLedger(
        await fetchEvidenceRecords({
          agentId: selectedAgentId!,
          newestFirst: true,
          limit: SELECTED_AGENT_EVIDENCE_LEDGER_LIMIT,
          signal
        })
      )
    }),
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
        evidenceCoverage: visibleEvidenceCoverage,
        sourceHealth: latestSourceHealth
      }),
    [latestSourceHealth, selectedAgentId, visibleEvidenceCoverage]
  );
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
        runtimeSourceGaps: runtimeSourceGapsResource.data,
        selectedAgentId,
        state: runtimeSourceGapsResource.state,
        error: runtimeSourceGapsResource.error
      });
    },
    [
      runtimeSourceGapsResource.data,
      runtimeSourceGapsResource.error,
      runtimeSourceGapsResource.state,
      selectedAgentId,
      sourceGapFocusIntent
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
      sourceDrilldownGroupKey: selectedAgentSourceGapFact.sourceDrilldownGroupKey,
      requestId: sourceGapFocusRequestIdRef.current
    });
    setHubOpen(true);
  }, [handleSelectAgentForInspection, selectedAgentSourceGapFact]);
  const handleSelectedAgentEvidenceLedgerOpen = useCallback(() => {
    if (selectedAgentId === null) {
      return;
    }

    requestedSelectedAgentDrilldownTabRef.current = 'evidence';
    activeHubCategoryFromSelectedAgentTabRef.current = false;
    setSourceGapFocusIntent(null);
    setActiveHubCategory('evidence');
    setSelectedAgentDrilldownTab('evidence');
    setHubOpen(true);
  }, [selectedAgentId]);
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
  const hudSignalSummary = [
    `Viewport · ${viewportToplineStatus.status}`,
    evidenceCoverageFocusItems.length > 0 ? `Evidence · ${evidenceCoverageFocusItems.length}` : null,
    evidenceCoverageReadModelStatus
      ? `${evidenceCoverageReadModelStatus.label} · ${evidenceCoverageReadModelStatus.summary}`
      : null,
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
                  {evidenceCoverageFocusItems.length > 0 ? (
                    <section
                      className="aitown-panel__signal-panel aitown-panel__evidence-focus"
                      role="region"
                      aria-label="Evidence coverage focus"
                    >
                      <div className="aitown-panel__evidence-focus__head">
                        <strong className="aitown-panel__topline-title">Evidence</strong>
                        <span className="aitown-panel__topline-copy">
                          {`${evidenceCoverageFocusItems.length} coverage gap${evidenceCoverageFocusItems.length === 1 ? '' : 's'}`}
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
                              {`${renderEvidenceCoverageFocusRefCount(item.evidence_ref_count)} · ${renderEvidenceCoverageFocusSources(item.source_kinds)}`}
                            </span>
                            <span>{renderEvidenceCoverageFocusLatest(item)}</span>
                          </button>
                        ))}
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
                {selectedAgentEvidenceGlance ? (
                  <span className="aitown-selected-agent-peek__proof" role="group" aria-label="Selected agent proof capsule">
                    {selectedAgentEvidenceGlance.map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </span>
                ) : null}
                {selectedAgentSourceHealthInspectPeek && selectedAgentSourceGapFact ? (
                  <section
                    className="aitown-selected-agent-peek__source-health-inspect"
                    role="region"
                    aria-label="Selected agent source-health inspect peek"
                  >
                    <span className="aitown-selected-agent-peek__source-health-inspect-label">
                      {selectedAgentSourceHealthInspectPeek.evidenceOnlyLabel}
                    </span>
                    <strong>
                      {`${selectedAgentSourceHealthInspectPeek.sourceKindLabel} · ${selectedAgentSourceHealthInspectPeek.statusLabel}`}
                    </strong>
                    <span>{selectedAgentSourceHealthInspectPeek.mappingLabel}</span>
                    <span>{selectedAgentSourceHealthInspectPeek.diffLineLabel}</span>
                    <button
                      type="button"
                      className="aitown-selected-agent-peek__source-gap-fact"
                      aria-label={`Open source gap supervision for ${selectedAgent.display_name} ${selectedAgentSourceGapFact.sourceLabel.toLowerCase()} ${selectedAgentSourceGapFact.status}`}
                      onClick={handleSelectedAgentSourceGapFactOpen}
                    >
                      Open Supervision
                    </button>
                  </section>
                ) : null}
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
                      Open Evidence drilldown
                    </button>
                  </section>
                ) : null}
                <button
                  type="button"
                  className="aitown-button aitown-selected-agent-peek__action"
                  aria-label={`Open ${selectedAgent.display_name} Evidence Ledger`}
                  onClick={handleSelectedAgentEvidenceLedgerOpen}
                >
                  Evidence Ledger
                </button>
              </div>
              <details className="aitown-selected-agent-peek__facts">
                <summary>Inspect facts</summary>
                {selectedAgentPeekZone ? <span>{`Zone · ${selectedAgentPeekZone}`}</span> : null}
                {selectedAgentPeekOperation ? <span>{`Operation · ${selectedAgentPeekOperation}`}</span> : null}
                {selectedAgentPeekCorrelationId ? (
                  <span>{`Correlation · ${selectedAgentPeekCorrelationId}`}</span>
                ) : null}
                {selectedAgentPeekEvidenceRef ? <span>{`Evidence · ${selectedAgentPeekEvidenceRef}`}</span> : null}
              </details>
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
                    {selectedAgentSourceGapInspectPeek || selectedAgentSourceGapLifecycleStrip ? (
                      <section
                        className="aitown-hub-focus-ribbon__source-gap-inspect"
                        role="region"
                        aria-label="Source gap inspect peek"
                      >
                        {selectedAgentSourceGapInspectPeek ? (
                          <>
                            <span className="aitown-hub-focus-ribbon__source-gap-inspect-label">
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
                          className="aitown-hub-focus-ribbon__source-gap-inspect-link"
                          onClick={handleSelectedAgentEvidenceLedgerOpen}
                        >
                          Open Evidence drilldown
                        </button>
                      </section>
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
              onReplaySelectedAgentEvidenceRecord={handleReplaySelectedAgentEvidenceRecord}
              onFocusSharedMemoryArtifact={handleFocusSharedMemoryArtifact}
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
