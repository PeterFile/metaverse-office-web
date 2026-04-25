import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_WORKFLOW_LIMIT,
  DEFAULT_WORKFLOW_WINDOW,
  RequestError,
  fetchAgentWorkflow,
  fetchCollectorSnapshot,
  fetchCorrelationDrilldown,
  fetchIncidents,
  fetchMemoryArtifacts,
  fetchOfficeOperations,
  fetchOfficeOverview,
  fetchPeerWatchAlerts,
  fetchTimeline
} from './api';
import { DetailsPanel } from './aitown/DetailsPanel';
import { SceneStatusLegend } from './aitown/SceneStatusLegend';
import { adaptWorldToScene } from './aitown/sceneAdapter';
import { WorldProvider, useWorld } from './context/WorldContext';
import { usePolledResource, type LoadState } from './hooks/usePolledResource';
import { getHubFocusableElements } from './hubFocus';
import type {
  CorrelationDrilldown,
  MemoryArtifact,
  MemoryArtifactIndex,
  OfficeAgent,
  OfficeOperation,
  OfficeOperations,
  PeerWatchAlertsResponse,
  Severity,
  TimelineReplayResponse
} from './types';
import { projectWorldState } from './world/projector';
import {
  PHASE_LABELS,
  selectAttentionQueue,
  selectAgentZoneLabel,
  selectHotZones,
  type HotZoneSummary
} from './world/selectors';

const CREW_INCIDENT_FEED_LIMIT = 200;
const CREW_INCIDENT_FEED_WINDOW = '8760h';
import type { WorldAgent, WorldState } from './world/types';

const LazyWorldScene = lazy(() => import('./aitown/WorldScene'));

type OperationSelection = {
  agentId: string;
};

type ZoneFocusRequest = {
  zoneId: string;
  requestId: number;
};

type CorrelationSpotlight = Pick<CorrelationDrilldown, 'correlation_id' | 'participant_agent_ids'>;

type SelectedAgentTimelineReplayPayload = {
  targetAgentId: string;
  timelineReplay: TimelineReplayResponse;
};

type SelectedAgentSupervisionHistoryPayload = {
  targetAgentId: string;
  correlationId: string | null;
  severity: Severity | null;
  peerWatchAlerts: PeerWatchAlertsResponse;
};

const CREW_TIMELINE_LIMIT = 4;
const CREW_OPEN_SUPERVISION_ALERTS_LIMIT = 4;
const MEMORY_ARTIFACT_LIMIT = 4;
const SELECTED_AGENT_SUPERVISION_HISTORY_LIMIT = 4;
const RESET_VIEW_SHORTCUT_KEY = 'r';
const RESET_VIEW_SHORTCUT_ARIA = 'R';
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

function resolveLiveFocusAgentMeta(agent: WorldAgent, world: WorldState) {
  const phaseLabel = PHASE_LABELS[agent.phase] ?? agent.phase;
  const zoneLabel = selectAgentZoneLabel(agent, world.zones);

  return `${phaseLabel} · ${zoneLabel}`;
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

function AppInner() {
  const { selectedAgentId, setSelectedAgentId, setWorld } = useWorld();
  const [hubOpen, setHubOpen] = useState(false);
  const [resetViewSignal, setResetViewSignal] = useState(0);
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
  const [cachedCorrelationSpotlight, setCachedCorrelationSpotlight] = useState<CorrelationSpotlight | null>(null);
  const lastSelectedAgentRef = useRef<OfficeAgent | null>(null);
  const correlationSelectionModeRef = useRef<'auto' | 'manual' | 'preserved'>('auto');
  const lastCorrelationContextRef = useRef<string | null>(null);
  const hubTriggerRef = useRef<HTMLButtonElement | null>(null);
  const hubCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const hubDialogRef = useRef<HTMLDivElement | null>(null);
  const hubFocusReturnRef = useRef<HTMLElement | null>(null);
  const pendingSharedMemoryFocusRef = useRef<string | null>(null);
  const sharedMemoryJumpRequestIdRef = useRef(0);
  const zoneFocusRequestIdRef = useRef(0);
  const wasHubOpenRef = useRef(false);

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
  const timelineReplayResource = usePolledResource({
    enabled: hubOpen && selectedAgentId === null,
    load: (signal) =>
      fetchTimeline({
        limit: CREW_TIMELINE_LIMIT,
        window: DEFAULT_WORKFLOW_WINDOW,
        severity: selectedCrewReplaySeverity ?? undefined,
        correlationId: crewReplayCorrelationId ?? undefined,
        signal
      }),
    resourceKey: `timeline-replay:severity=${selectedCrewReplaySeverity ?? '__all__'}:correlation=${crewReplayCorrelationId ?? '__all__'}`
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
    enabled: selectedAgentId !== null,
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
  }, [hubOpen, memoryArtifacts]);

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
        incidentFeedLimit: CREW_INCIDENT_FEED_LIMIT,
        selectedAgentWorkflowPending: selectedAgentId !== null && workflowState === 'loading',
        now: new Date().toISOString(),
      }),
    [activeWorkflow, incidentFeedResource.data, overviewResource.data, selectedAgentId, workflowState]
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
        activeCorrelationParticipantAgentIds
      ),
    [activeCorrelationParticipantAgentIds, activeCorrelationSpotlight?.correlation_id, projectedWorld, selectedAgentId]
  );
  const liveFocusAgents = useMemo(() => selectAttentionQueue(projectedWorld), [projectedWorld]);
  const hotZones = useMemo(() => selectHotZones(projectedWorld), [projectedWorld]);

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
  const selectedAgentTimelineReplayResourceKey = selectedAgentId
    ? `selected-agent-timeline-replay:${selectedAgentId}:correlation=${selectedAgentScopedCorrelationId ?? '__all__'}:severity=${selectedAgentReplaySeverity ?? '__all__'}`
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
      timelineReplay: await fetchTimeline({
        limit: DEFAULT_WORKFLOW_LIMIT,
        window: DEFAULT_WORKFLOW_WINDOW,
        agentId: selectedAgentId!,
        correlationId: selectedAgentScopedCorrelationId ?? undefined,
        severity: selectedAgentReplaySeverity ?? undefined,
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
  const selectedAgentTimelineReplayPayloadMatchesAgent =
    selectedAgentTimelineReplayResource.data?.targetAgentId === selectedAgentId;
  const selectedAgentTimelineReplaySurfaceIsStale =
    selectedAgentTimelineReplaySelectionChanged ||
    (selectedAgentTimelineReplayResource.data !== null &&
      !selectedAgentTimelineReplayPayloadMatchesAgent);
  const selectedAgentTimelineReplay =
    !selectedAgentTimelineReplaySurfaceIsStale &&
    selectedAgentTimelineReplayPayloadMatchesAgent &&
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
      lastCorrelationContextRef.current = null;
      correlationSelectionModeRef.current = 'auto';
      return;
    }

    if (lastCorrelationContextRef.current !== correlationSelectionContext) {
      lastCorrelationContextRef.current = correlationSelectionContext;
      correlationSelectionModeRef.current = 'auto';
      setSelectedCorrelationId(null);
      setSelectedCorrelationWasExplicit(false);
      setSelectedCorrelationCarryForward(false);
    }
  }, [correlationSelectionContext, hubOpen]);

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
  }, []);

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
      if (correlationId) {
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

  const toggleHub = useCallback(() => {
    setHubOpen((open) => !open);
  }, []);

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
    if (activeElement instanceof HTMLElement && activeElement.isConnected && dialog.contains(activeElement)) {
      return;
    }

    const detailsPanel = dialog.querySelector<HTMLElement>('[role="complementary"][aria-label="Agent details"]');
    if (!detailsPanel) {
      return;
    }

    const [firstDetailsFocusable] = getHubFocusableElements(detailsPanel);
    (firstDetailsFocusable ?? dialog).focus();
  }, [hubOpen, selectedAgentId, selectedCorrelationId, selectedCorrelationWasExplicit]);

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
      if (!agentId) {
        lastSelectedAgentRef.current = null;
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
      if (agentId !== selectedAgentId) {
        setSelectedAgentReplayFilter(null);
        setSelectedAgentSupervisionHistoryFilter(null);
      }
      setSelectedAgentId(agentId);
    },
    [overviewResource.data, selectedAgentId, setSelectedAgentId]
  );

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

  const handleSceneSelectAgent = useCallback(
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
      if (agentId) {
        setHubOpen(true);
      }
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
  const selectedAgentPeekEvidenceRef =
    selectedOperation?.latest_event?.evidence_refs[0] ??
    activeWorkflow?.detail.recent_events.find((event) => event.evidence_refs.length > 0)?.evidence_refs[0] ??
    null;

  return (
    <main className="aitown-shell game-background">
      <section className="aitown-shell__layout aitown-shell__layout--fullscreen">
        <section className="aitown-panel aitown-panel--game aitown-panel--game-fullscreen" role="region" aria-label="Office world">
          <header className="aitown-shell__header">
            <div className="aitown-shell__brand">
              <span className="aitown-shell__eyebrow">Metaverse Office operator shell</span>
              <h1 className="game-title">Metaverse Office</h1>
              <p>Operator shell for real-running, supervised, replayable, accountable agents.</p>
            </div>

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
              <span>
                <strong className="aitown-panel__topline-title">Live Focus</strong>
                <span className="aitown-panel__topline-copy">{resolveLiveFocusSummaryLabel(liveFocusAgents.length)}</span>
                {liveFocusAgents.length > 0 ? (
                  <span className="aitown-panel__focus-chips" aria-label="Live focus agents">
                    {liveFocusAgents.slice(0, 3).map((agent) => (
                      <button
                        key={agent.agent_id}
                        type="button"
                        className={`aitown-focus-chip severity-${agent.severity}${selectedAgentId === agent.agent_id ? ' is-active' : ''}`}
                        aria-label={`Inspect live focus agent ${agent.display_name}`}
                        onClick={() => handleSceneSelectAgent(agent.agent_id)}
                      >
                        <strong>{agent.display_name}</strong>
                        <span>{resolveLiveFocusAgentMeta(agent, projectedWorld)}</span>
                      </button>
                    ))}
                  </span>
                ) : (
                  <span className="aitown-panel__topline-copy">Drag to pan. Wheel to zoom. Tap or click an agent to inspect.</span>
                )}
              </span>
              <span>
                <strong className="aitown-panel__topline-title">Viewport</strong>
                <span className="aitown-panel__topline-copy">Drag to pan. Wheel to zoom. Tap or click an agent to inspect.</span>
                <span className="aitown-panel__topline-copy">{viewportToplineStatus.status}</span>
                <span className="aitown-panel__topline-copy">{viewportToplineStatus.snapshot}</span>
              </span>
            </div>
            {hotZones.length > 0 ? (
              <div className="aitown-panel__hot-zone-focus">
                <strong className="aitown-panel__topline-title">Hot zone focus</strong>
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
              </div>
            ) : null}

          </div>
          <div className="aitown-panel__toolbar">
            <button
              ref={hubTriggerRef}
              type="button"
              className="aitown-button"
              aria-expanded={hubOpen}
              aria-controls="aitown-hub"
              aria-haspopup="dialog"
              onClick={toggleHub}
            >
              {hubOpen ? 'Hide Hub' : 'Open Hub'}
            </button>
            {!hubOpen ? (
              <button
                type="button"
                className="aitown-button"
                aria-keyshortcuts={RESET_VIEW_SHORTCUT_ARIA}
                onClick={handleResetView}
              >
                Reset view
              </button>
            ) : null}
            {selectedAgent ? (
              <button type="button" className="aitown-button" onClick={() => selectAgent(null, null)}>
                Clear Selection
              </button>
            ) : null}
          </div>
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
                <span>{`${HOT_ZONE_SEVERITY_LABELS[selectedAgentPeekSeverity]} · ${selectedAgentPeekStatus}`}</span>
              </div>
              <div className="aitown-selected-agent-peek__facts">
                {selectedAgentPeekZone ? <span>{`Zone · ${selectedAgentPeekZone}`}</span> : null}
                {selectedAgentPeekOperation ? <span>{`Operation · ${selectedAgentPeekOperation}`}</span> : null}
                {selectedAgentPeekCorrelationId ? (
                  <span>{`Correlation · ${selectedAgentPeekCorrelationId}`}</span>
                ) : null}
                {selectedAgentPeekEvidenceRef ? <span>{`Evidence · ${selectedAgentPeekEvidenceRef}`}</span> : null}
              </div>
              <button
                type="button"
                className="aitown-button aitown-selected-agent-peek__action"
                aria-controls="aitown-hub"
                aria-haspopup="dialog"
                onClick={() => setHubOpen(true)}
              >
                Open selected agent in Hub
              </button>
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
                resetViewSignal={resetViewSignal}
                zoneFocusRequest={zoneFocusRequest}
                showActiveCorrelationOverlay={hubOpen}
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
            aria-labelledby="aitown-hub-title"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="aitown-hub-sheet__header">
              <span id="aitown-hub-title" className="aitown-hub-sheet__title">Hub</span>
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
                  Close Hub
                </button>
              </div>
            </div>
            <DetailsPanel
              collectorSnapshot={collectorSnapshotResource.data}
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
              selectedAgentReplaySeverity={selectedAgentReplaySeverity}
              selectedCrewReplaySeverity={selectedCrewReplaySeverity}
              selectedOperationsState={selectedOperationsState}
              selectedOperationsSeverity={selectedOperationsSeverity}
              selectedOperation={selectedOperation}
              selectedOperationRequestActive={selectedOperationSelection !== null}
              timelineReplay={timelineReplayResource.data}
              timelineReplayError={timelineReplayResource.error}
              timelineReplayState={timelineReplayResource.state}
              selectedAgentTimelineReplay={selectedAgentTimelineReplay}
              selectedAgentTimelineReplayError={selectedAgentTimelineReplayError}
              selectedAgentTimelineReplayState={selectedAgentTimelineReplayState}
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
              onSelectSelectedAgentReplaySeverity={(severity) =>
                setSelectedAgentReplayFilter(
                  selectedAgentId !== null
                    ? {
                        agentId: selectedAgentId,
                        severity
                      }
                    : null
                )
              }
              onSelectCrewReplaySeverity={setSelectedCrewReplaySeverity}
              onSelectOperationsState={setSelectedOperationsState}
              onSelectOperationsSeverity={setSelectedOperationsSeverity}
              onSelectOperation={handleSelectOperation}
              onFocusSharedMemoryArtifact={handleFocusSharedMemoryArtifact}
              onFocusWorldZone={handleFocusWorldZone}
            />
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
