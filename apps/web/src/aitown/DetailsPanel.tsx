import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';

import type {
  AccountabilityReplayBundle,
  AccountabilityReplayLedgerEntry,
  AgentWorkflow,
  CollectorEvidenceCoverageAgentItem,
  CollectorItem,
  CollectorSourceHealthStatus,
  CollectorSharedArtifact,
  CollectorSnapshot,
  CollectorTmuxObservation,
  CollectorWorkspaceObservation,
  CorrelationDrilldown,
  EvidenceProvenanceBundle,
  EvidenceRecord,
  EvidenceSourceContext,
  IncidentFeedResponse,
  MemoryArtifact,
  MemoryArtifactIndex,
  OfficeAgent,
  OfficeOperation,
  OfficeOperations,
  OfficeZone,
  PeerWatchAlertsResponse,
  ReplayCheckpoint,
  ReplayCheckpointLogResponse,
  Severity,
  TimelineReplayResponse,
  WorkflowIncident,
  WorkflowInteraction,
  WorkflowPeerWatchAlert,
  WorkflowTimelineEvent
} from '../types';
import type { LoadState } from '../hooks/usePolledResource';
import { buildZoneLayoutModels } from '../layout';
import { selectWorkflowSummaryFacets } from '../workflow/summary';
import type { WorldState } from '../world/types';
import { selectAgentBadge, selectAgentZoneLabel, selectAttentionQueue, selectWatchEdgeRisk } from '../world/selectors';
import {
  collectInteractionSourceKinds,
  formatCollectorDerivedPeerWatchMetadata
} from './accountabilitySignals';
import { deriveAccountabilityReplayAuditVerdict } from './accountabilityReplayAudit';
import { deriveAgentDetailEvidenceFacets } from './agentDetailEvidenceFacets';
import {
  deriveCollectorItemSourceDrilldownGroups,
  deriveCollectorItemSourceHealthFacts,
  deriveRuntimeSourceDrilldownGroups,
  deriveRuntimeSourceEvidenceFacts,
  type SourceDrilldownGroup,
  type SourceHealthFact
} from './sourceHealth';
import type {
  SelectedAgentEvidenceLedgerGroup,
  SelectedAgentEvidenceLedgerItem,
  SelectedAgentEvidenceLedgerModel,
  SelectedAgentEvidenceLedgerSourceContextGroup,
  SelectedAgentEvidenceLedgerSourceRefGroup
} from '../selectedAgentEvidenceLedger';
import type { SourceGapDrilldownGroupKey } from './sourceGapSignals';

export type HubCategory = 'crew' | 'queue' | 'supervision' | 'evidence' | 'replay' | 'memory';

export type SelectedAgentDrilldownTab = 'now' | 'evidence' | 'replay';

type SelectedAgentSupervisionPanel =
  | 'collector'
  | 'history'
  | 'audit'
  | 'workflow'
  | 'memory'
  | 'incidents'
  | 'queue';

export const SELECTED_AGENT_DRILLDOWN_TABS: ReadonlyArray<{
  id: SelectedAgentDrilldownTab;
  label: string;
}> = [
  { id: 'now', label: 'Now' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'replay', label: 'Replay / Correlation' }
];

export function resolveSelectedAgentDrilldownTabId(tab: SelectedAgentDrilldownTab) {
  return `aitown-selected-agent-drilldown-tab-${tab}`;
}

export function resolveSelectedAgentDrilldownPanelId(tab: SelectedAgentDrilldownTab) {
  return `aitown-selected-agent-drilldown-panel-${tab}`;
}

type SharedMemoryJumpScope = {
  correlationId?: string | null;
  preserveNullCorrelation?: boolean;
};

type DetailsPanelProps = {
  activeHubCategory: HubCategory;
  collectorSnapshot: CollectorSnapshot | null;
  collectorSnapshotError: string | null;
  collectorSnapshotState: LoadState;
  correlation: CorrelationDrilldown | null;
  correlationError: string | null;
  correlationState: LoadState;
  incidentFeed: IncidentFeedResponse | null;
  incidentFeedError: string | null;
  incidentFeedState: LoadState;
  crewIncidentCorrelationSelectableIds?: ReadonlySet<string>;
  openSupervisionAlerts?: PeerWatchAlertsResponse | null;
  openSupervisionAlertsError?: string | null;
  openSupervisionAlertsState?: LoadState;
  operations: OfficeOperations | null;
  operationsError: string | null;
  operationsState: LoadState;
  activeCorrelationQueueOperations?: OfficeOperations | null;
  activeCorrelationQueueError?: string | null;
  activeCorrelationQueueState?: LoadState;
  operationsStateBuckets: Record<string, number>;
  operationsSeverityBuckets: Record<Severity, number>;
  operationsStateBucketsError: string | null;
  operationsStateBucketsState: LoadState;
  overviewZones: OfficeZone[] | null;
  manualCorrelationOverrideActive: boolean;
  preserveWorkflowCounterpartyCorrelation: boolean;
  memoryArtifacts: MemoryArtifactIndex | null;
  memoryArtifactsError: string | null;
  memoryArtifactsState: LoadState;
  sharedMemoryRequestScopeLabel: string;
  focusedSharedMemoryArtifactRef?: string | null;
  sharedMemoryJumpStatus?: string | null;
  replayCheckpointEventId?: string | null;
  selectedAgentSupervisionHistoryRequestScopeLabel: string;
  selectedAgentSupervisionHistory: PeerWatchAlertsResponse | null;
  selectedAgentSupervisionHistoryError: string | null;
  selectedAgentSupervisionHistoryState: LoadState;
  selectedAgent: OfficeAgent | null;
  selectedCorrelationId: string | null;
  selectedCrewOpenSupervisionSeverity: Severity | null;
  selectedAgentSupervisionHistorySeverity: Severity | null;
  selectedAgentReplaySeverity: Severity | null;
  selectedCrewReplaySeverity: Severity | null;
  selectedOperationsState: string | null;
  selectedOperationsSeverity: Severity | null;
  selectedOperation: OfficeOperation | null;
  selectedOperationRequestActive?: boolean;
  selectedAgentDrilldownTab?: SelectedAgentDrilldownTab | null;
  sourceGapFocusIntent?: SourceGapFocusIntent | null;
  timelineReplay: TimelineReplayResponse | null;
  timelineReplayError: string | null;
  timelineReplayState: LoadState;
  selectedAgentTimelineReplay: TimelineReplayResponse | null;
  selectedAgentTimelineReplayError: string | null;
  selectedAgentTimelineReplayState: LoadState;
  selectedAgentAccountabilityReplay: AccountabilityReplayBundle | null;
  selectedAgentAccountabilityReplayError: string | null;
  selectedAgentAccountabilityReplayState: LoadState;
  selectedAgentEvidenceLedger: SelectedAgentEvidenceLedgerModel | null;
  selectedAgentEvidenceLedgerError: string | null;
  selectedAgentEvidenceLedgerState: LoadState;
  selectedAgentEvidenceRecord: EvidenceRecord | null;
  selectedAgentEvidenceRecordError: string | null;
  selectedAgentEvidenceRecordId: string | null;
  selectedAgentEvidenceRecordState: LoadState;
  selectedAgentEvidenceProvenanceBundle: EvidenceProvenanceBundle | null;
  selectedAgentEvidenceProvenanceBundleError: string | null;
  selectedAgentEvidenceProvenanceBundleState: LoadState;
  selectedAgentEvidenceSourceContext: EvidenceSourceContext | null;
  selectedAgentEvidenceSourceContextError: string | null;
  selectedAgentEvidenceSourceContextState: LoadState;
  selectedAgentEvidenceCheckpointLog: ReplayCheckpointLogResponse | null;
  selectedAgentEvidenceCheckpointLogError: string | null;
  selectedAgentEvidenceCheckpointLogState: LoadState;
  workflow: AgentWorkflow | null;
  workflowError: string | null;
  workflowState: LoadState;
  world: WorldState;
  onSelectAgent: SelectAgentHandler;
  onInspectAgent: (agentId: string | null) => void;
  onSelectCorrelation: SelectCorrelationHandler;
  onResetCorrelationOverride: () => void;
  onSelectCrewOpenSupervisionSeverity: (severity: Severity | null) => void;
  onSelectSelectedAgentSupervisionHistorySeverity: (severity: Severity | null) => void;
  onSelectSelectedAgentReplaySeverity: (severity: Severity | null) => void;
  onSelectCrewReplaySeverity: (severity: Severity | null) => void;
  onSelectOperationsState: (state: string | null) => void;
  onSelectOperationsSeverity: (severity: Severity | null) => void;
  onSelectOperation: (operation: OfficeOperation, options?: SelectOperationOptions) => void;
  onInspectSelectedAgentEvidenceRecord: (evidenceId: string) => void;
  onInspectSelectedAgentEvidenceSourceContext: (evidenceId: string) => void;
  onReplaySelectedAgentEvidenceRecord: (evidenceId: string) => void;
  onBackToSelectedAgentEvidenceRecord?: () => void;
  onFocusSharedMemoryArtifact?: (artifactRef: string, scope?: SharedMemoryJumpScope) => void;
  onOpenReplayCheckpoint?: (eventId: string) => void;
  onFocusWorldZone?: (zoneId: string) => void;
};

export type SourceGapFocusIntent = {
  agentId: string;
  agentLabel: string;
  sourceLabel: string;
  status: CollectorSourceHealthStatus;
  sourceDrilldownGroupKey: SourceGapDrilldownGroupKey;
  requestId: number;
};

type SelectAgentOptions = {
  preserveNullCorrelation?: boolean;
};

type SelectOperationOptions = {
  preserveActiveCorrelation?: boolean;
};

type SelectAgentHandler = (
  agentId: string | null,
  correlationId?: string | null,
  options?: SelectAgentOptions
) => void;

type SelectCorrelationHandler = (
  correlationId: string | null,
  options?: { preserveAutoOnDefaultReselect?: boolean }
) => void;

const SEVERITY_LABELS = {
  normal: 'Normal',
  yellow: 'Yellow',
  orange: 'Orange',
  red: 'Red'
} as const;

const CORRELATION_CLOSURE_LABELS = {
  open: 'Open',
  active: 'Active',
  closed: 'Closed',
  unknown: 'Unknown'
} as const;

const CORRELATION_CLOSURE_BASIS_LABELS = {
  filtered_correlation_slice: 'filtered correlation slice'
} as const;

const SEVERITY_RANK = {
  normal: 0,
  yellow: 1,
  orange: 2,
  red: 3
} as const;

const EMPTY_SEVERITY_BUCKETS: Record<Severity, number> = {
  normal: 0,
  yellow: 0,
  orange: 0,
  red: 0
};

const SHARED_MEMORY_BACKLINK_LIMIT = 4;
const STRUCTURED_EVIDENCE_FACET_TOKEN_LIMIT = 3;
const EVIDENCE_LEDGER_TOKEN_LIMIT = 72;

const SELECTED_AGENT_SUPERVISION_PANEL_LABELS: Record<SelectedAgentSupervisionPanel, string> = {
  collector: 'Collector Observation',
  history: 'Supervision History',
  audit: 'Audit / Responsibility Chain',
  workflow: 'Workflow',
  memory: 'Shared Memory',
  incidents: 'Incident Feed',
  queue: 'Active Correlation Queue'
};

type SharedMemoryBacklink = {
  key: string;
  sourceLabel: string;
  label: string;
};

type SharedMemoryBacklinkSummary = {
  items: SharedMemoryBacklink[];
  overflowCount: number;
};

type SelectedAgentEvidenceLedgerBucketKey = 'output' | 'non-output' | 'degraded' | 'unmapped';

type SelectedAgentEvidenceLedgerBucket = {
  key: SelectedAgentEvidenceLedgerBucketKey;
  label: string;
  totalCount: number;
};

function dedupeIncidents(incidents: WorkflowIncident[]) {
  return incidents.filter(
    (incident, index, list) => list.findIndex((item) => item.incident_id === incident.incident_id) === index
  );
}

function appendSharedMemoryBacklink(
  backlinksByKey: Map<string, SharedMemoryBacklink>,
  backlink: SharedMemoryBacklink | null
) {
  if (!backlink || backlinksByKey.has(backlink.key)) {
    return;
  }

  backlinksByKey.set(backlink.key, backlink);
}

function appendScopedEvidenceRefBacklinks<
  RecordType extends {
    evidence_refs: string[];
    summary: string;
    correlation_id?: string | null;
  }
>(
  backlinksByKey: Map<string, SharedMemoryBacklink>,
  records: ReadonlyArray<RecordType>,
  focusedArtifactRef: string,
  activeCorrelationId: string | null,
  createBacklink: (record: RecordType) => SharedMemoryBacklink
) {
  records.forEach((record) => {
    if (!isAlignedCorrelation(record.correlation_id, activeCorrelationId)) {
      return;
    }

    if (!record.evidence_refs.includes(focusedArtifactRef)) {
      return;
    }

    appendSharedMemoryBacklink(backlinksByKey, createBacklink(record));
  });
}

function appendVisibleEvidenceRefBacklinks<RecordType extends { evidence_refs: string[]; summary: string }>(
  backlinksByKey: Map<string, SharedMemoryBacklink>,
  records: ReadonlyArray<RecordType>,
  focusedArtifactRef: string,
  createBacklink: (record: RecordType) => SharedMemoryBacklink
) {
  records.forEach((record) => {
    if (!record.evidence_refs.includes(focusedArtifactRef)) {
      return;
    }

    appendSharedMemoryBacklink(backlinksByKey, createBacklink(record));
  });
}

function renderReplayBundleSummaryBacklinkLabel(replayBundle: AccountabilityReplayBundle) {
  return replayBundle.query.correlation_id
    ? `${replayBundle.accountability.basis} · ${replayBundle.query.correlation_id}`
    : replayBundle.accountability.basis;
}

function appendReplayBundleEvidenceBacklinks(
  backlinksByKey: Map<string, SharedMemoryBacklink>,
  replayBundle: AccountabilityReplayBundle | null,
  focusedArtifactRef: string
) {
  if (!replayBundle) {
    return;
  }

  if (replayBundle.accountability.evidence_refs.includes(focusedArtifactRef)) {
    appendSharedMemoryBacklink(backlinksByKey, {
      key: `replay-bundle-summary:${focusedArtifactRef}`,
      sourceLabel: 'Replay bundle summary',
      label: renderReplayBundleSummaryBacklinkLabel(replayBundle)
    });
  }

  replayBundle.ledger.forEach((entry) => {
    if (!entry.evidence_refs.includes(focusedArtifactRef)) {
      return;
    }

    appendSharedMemoryBacklink(backlinksByKey, {
      key: `replay-bundle-ledger:${entry.entry_type}:${entry.entry_id}:${focusedArtifactRef}`,
      sourceLabel: 'Replay bundle ledger',
      label: entry.summary || entry.entry_id
    });
  });
}

function appendCollectorSharedArtifactBacklinks(
  backlinksByKey: Map<string, SharedMemoryBacklink>,
  collectorSharedArtifacts: ReadonlyArray<CollectorSharedArtifact> | null | undefined,
  focusedArtifactRef: string
) {
  collectorSharedArtifacts?.forEach((artifact) => {
    if (artifact.artifact_ref !== focusedArtifactRef) {
      return;
    }

    appendSharedMemoryBacklink(backlinksByKey, {
      key: `collector-shared-artifact:${artifact.artifact_ref}`,
      sourceLabel: 'Collector shared snapshot',
      label: artifact.artifact_ref
    });
  });
}

function appendCollectorProvenanceBacklinks(
  backlinksByKey: Map<string, SharedMemoryBacklink>,
  collectorItems: ReadonlyArray<CollectorItem>,
  focusedArtifactRef: string
) {
  collectorItems.forEach((item) => {
    const latestWorkspaceObservation = selectLatestWorkspaceObservation(item.workspace_observations);
    if (latestWorkspaceObservation?.path === focusedArtifactRef) {
      appendSharedMemoryBacklink(backlinksByKey, {
        key: `collector-workspace:${item.agent_id}:${latestWorkspaceObservation.path}`,
        sourceLabel: 'Collector workspace preview',
        label: `${item.agent_id} · ${renderWorkspaceObservationPreview(latestWorkspaceObservation)}`
      });
    }

    const latestTmuxObservation = selectLatestTmuxObservation(item.tmux_observations);
    const tmuxArtifactRef = deriveCollectorTmuxArtifactRef(item, latestTmuxObservation);
    if (latestTmuxObservation && tmuxArtifactRef === focusedArtifactRef) {
      appendSharedMemoryBacklink(backlinksByKey, {
        key: `collector-tmux:${item.agent_id}:${tmuxArtifactRef}`,
        sourceLabel: 'Collector tmux preview',
        label: `${item.agent_id} · ${renderTmuxObservationPreview(latestTmuxObservation)}`
      });
    }
  });
}

function buildFocusedSharedMemoryBacklinks({
  focusedArtifactRef,
  activeCorrelationId,
  selectedOperation,
  openSupervisionAlerts,
  selectedAgentSupervisionHistory,
  timelineReplay,
  workflow,
  correlation,
  selectedAgentAccountabilityReplay,
  collectorSharedArtifacts,
  visibleCollectorItems
}: {
  focusedArtifactRef: string | null | undefined;
  activeCorrelationId: string | null;
  selectedOperation: OfficeOperation | null;
  openSupervisionAlerts: PeerWatchAlertsResponse | null | undefined;
  selectedAgentSupervisionHistory: PeerWatchAlertsResponse | null;
  timelineReplay: TimelineReplayResponse | null;
  workflow: AgentWorkflow | null;
  correlation: CorrelationDrilldown | null;
  selectedAgentAccountabilityReplay: AccountabilityReplayBundle | null;
  collectorSharedArtifacts: ReadonlyArray<CollectorSharedArtifact> | null | undefined;
  visibleCollectorItems: ReadonlyArray<CollectorItem>;
}): SharedMemoryBacklinkSummary {
  if (!focusedArtifactRef) {
    return {
      items: [],
      overflowCount: 0
    };
  }

  const backlinksByKey = new Map<string, SharedMemoryBacklink>();

  if (
    selectedOperation?.latest_event &&
    isAlignedCorrelation(selectedOperation.correlation_id, activeCorrelationId) &&
    selectedOperation.latest_event.evidence_refs.includes(focusedArtifactRef)
  ) {
    appendSharedMemoryBacklink(backlinksByKey, {
      key: `event:${selectedOperation.latest_event.event_id}`,
      sourceLabel: 'Current operation',
      label: selectedOperation.latest_event.summary
    });
  }

  appendVisibleEvidenceRefBacklinks(
    backlinksByKey,
    openSupervisionAlerts?.items ?? [],
    focusedArtifactRef,
    (alert) => ({
      key: `alert:${alert.alert_id}`,
      sourceLabel: 'Open supervision alert',
      label: alert.summary
    })
  );

  appendScopedEvidenceRefBacklinks(
    backlinksByKey,
    selectedAgentSupervisionHistory?.items ?? [],
    focusedArtifactRef,
    activeCorrelationId,
    (alert) => ({
      key: `alert:${alert.alert_id}`,
      sourceLabel: 'Supervision history',
      label: alert.summary
    })
  );

  appendVisibleEvidenceRefBacklinks(
    backlinksByKey,
    timelineReplay?.items ?? [],
    focusedArtifactRef,
    (event) => ({
      key: `event:${event.event_id}`,
      sourceLabel: 'Timeline replay',
      label: event.summary
    })
  );

  appendScopedEvidenceRefBacklinks(
    backlinksByKey,
    workflow?.detail.open_peer_watch_alerts ?? [],
    focusedArtifactRef,
    activeCorrelationId,
    (alert) => ({
      key: `alert:${alert.alert_id}`,
      sourceLabel: 'Workflow alert',
      label: alert.summary
    })
  );

  appendScopedEvidenceRefBacklinks(
    backlinksByKey,
    workflow?.detail.recent_incidents ?? [],
    focusedArtifactRef,
    activeCorrelationId,
    (incident) => ({
      key: `incident:${incident.incident_id}`,
      sourceLabel: 'Workflow incident',
      label: incident.summary
    })
  );

  appendScopedEvidenceRefBacklinks(
    backlinksByKey,
    workflow?.detail.recent_interactions ?? [],
    focusedArtifactRef,
    activeCorrelationId,
    (interaction) => ({
      key: `interaction:${interaction.interaction_id}`,
      sourceLabel: 'Workflow interaction',
      label: interaction.summary
    })
  );

  appendScopedEvidenceRefBacklinks(
    backlinksByKey,
    workflow?.detail.recent_events ?? [],
    focusedArtifactRef,
    activeCorrelationId,
    (event) => ({
      key: `event:${event.event_id}`,
      sourceLabel: 'Workflow event',
      label: event.summary
    })
  );

  appendScopedEvidenceRefBacklinks(
    backlinksByKey,
    workflow?.detail.recent_handoffs ?? [],
    focusedArtifactRef,
    activeCorrelationId,
    (handoff) => ({
      key: `handoff:${handoff.handoff_id}`,
      sourceLabel: 'Workflow handoff',
      label: handoff.summary
    })
  );

  appendScopedEvidenceRefBacklinks(
    backlinksByKey,
    workflow?.detail.recent_reboots ?? [],
    focusedArtifactRef,
    activeCorrelationId,
    (reboot) => ({
      key: `reboot:${reboot.reboot_id}`,
      sourceLabel: 'Workflow reboot',
      label: reboot.summary
    })
  );

  if (activeCorrelationId && correlation?.correlation_id === activeCorrelationId) {
    if (correlation.evidence_refs.includes(focusedArtifactRef)) {
      appendSharedMemoryBacklink(backlinksByKey, {
        key: `correlation:${correlation.correlation_id}`,
        sourceLabel: 'Active correlation',
        label: correlation.correlation_id
      });
    }

    appendScopedEvidenceRefBacklinks(
      backlinksByKey,
      correlation.incidents,
      focusedArtifactRef,
      activeCorrelationId,
      (incident) => ({
        key: `incident:${incident.incident_id}`,
        sourceLabel: 'Correlation incident',
        label: incident.summary
      })
    );

    appendScopedEvidenceRefBacklinks(
      backlinksByKey,
      correlation.interactions,
      focusedArtifactRef,
      activeCorrelationId,
      (interaction) => ({
        key: `interaction:${interaction.interaction_id}`,
        sourceLabel: 'Correlation interaction',
        label: interaction.summary
      })
    );

    appendScopedEvidenceRefBacklinks(
      backlinksByKey,
      correlation.timeline,
      focusedArtifactRef,
      activeCorrelationId,
      (event) => ({
        key: `event:${event.event_id}`,
        sourceLabel: 'Correlation event',
        label: event.summary
      })
    );
  }

  appendReplayBundleEvidenceBacklinks(backlinksByKey, selectedAgentAccountabilityReplay, focusedArtifactRef);
  appendCollectorSharedArtifactBacklinks(backlinksByKey, collectorSharedArtifacts, focusedArtifactRef);
  appendCollectorProvenanceBacklinks(backlinksByKey, visibleCollectorItems, focusedArtifactRef);

  const allBacklinks = [...backlinksByKey.values()];

  return {
    items: allBacklinks.slice(0, SHARED_MEMORY_BACKLINK_LIMIT),
    overflowCount: Math.max(0, allBacklinks.length - SHARED_MEMORY_BACKLINK_LIMIT)
  };
}

function renderCorrelationButton({
  correlationId,
  label,
  buttonLabel,
  activeCorrelationId,
  preserveAutoOnDefaultReselect = false,
  onSelectCorrelation
}: {
  correlationId: string | null;
  label: string;
  buttonLabel: string;
  activeCorrelationId: string | null;
  preserveAutoOnDefaultReselect?: boolean;
  onSelectCorrelation: SelectCorrelationHandler;
}) {
  if (!correlationId) {
    return <span>{label}</span>;
  }

  const isActive = activeCorrelationId === correlationId;

  return (
    <button
      type="button"
      className={`aitown-link-button${isActive ? ' is-active' : ''}`}
      aria-label={`${buttonLabel} ${correlationId}${isActive ? ', currently selected' : ''}`}
      onClick={() =>
        preserveAutoOnDefaultReselect
          ? onSelectCorrelation(correlationId, { preserveAutoOnDefaultReselect: true })
          : onSelectCorrelation(correlationId)
      }
    >
      {label}
    </button>
  );
}

function renderAgentPivotButton({
  agentId,
  label = agentId,
  ariaLabel,
  correlationId,
  preserveNullCorrelation = false,
  onSelectAgent
}: {
  agentId: string;
  label?: string;
  ariaLabel: string;
  correlationId?: string | null;
  preserveNullCorrelation?: boolean;
  onSelectAgent: SelectAgentHandler;
}) {
  return (
    <button
      type="button"
      className="aitown-link-button"
      aria-label={ariaLabel}
      onClick={() =>
        preserveNullCorrelation
          ? onSelectAgent(agentId, correlationId, { preserveNullCorrelation: true })
          : onSelectAgent(agentId, correlationId)
      }
    >
      {label}
    </button>
  );
}

function resolveSharedMemoryArtifactDomId(artifactRef: string) {
  return `aitown-shared-memory-${encodeURIComponent(artifactRef)}`;
}

function focusSharedMemoryArtifact(artifactRef: string) {
  if (typeof document === 'undefined') {
    return;
  }

  const target = document.getElementById(resolveSharedMemoryArtifactDomId(artifactRef));

  if (!(target instanceof HTMLElement)) {
    return;
  }

  target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  target.focus();
}

function renderAccountabilityArtifactJumpList({
  artifacts,
  onJump
}: {
  artifacts: MemoryArtifact[];
  onJump: (artifactRef: string) => void;
}) {
  if (artifacts.length === 0) {
    return 'No linked memory artifacts';
  }

  return artifacts.map((artifact, index) => {
    const label = `${artifact.latest_summary ?? artifact.file_name} (${artifact.artifact_ref})`;

    return (
      <span key={artifact.artifact_ref}>
        {index > 0 ? ', ' : null}
        <button
          type="button"
          className="aitown-link-button"
          aria-label={`Jump to shared memory artifact ${artifact.artifact_ref}`}
          onClick={() => onJump(artifact.artifact_ref)}
        >
          {label}
        </button>
      </span>
    );
  });
}

function renderAgentPivotList({
  agentIds,
  currentAgentId,
  navigableAgentIds,
  emptyLabel,
  ariaLabelPrefix,
  correlationId,
  preserveNullCorrelation = false,
  onSelectAgent
}: {
  agentIds: string[];
  currentAgentId: string | null;
  navigableAgentIds: Set<string>;
  emptyLabel: string;
  ariaLabelPrefix: string;
  correlationId?: string | null;
  preserveNullCorrelation?: boolean;
  onSelectAgent: SelectAgentHandler;
}) {
  if (agentIds.length === 0) {
    return emptyLabel;
  }

  return agentIds.map((agentId, index) => {
    const canNavigate = agentId !== currentAgentId && navigableAgentIds.has(agentId);

    return (
      <span key={`${ariaLabelPrefix}-${agentId}`}>
        {index > 0 ? ', ' : null}
        {canNavigate ? (
          renderAgentPivotButton({
            agentId,
            ariaLabel: `${ariaLabelPrefix} ${agentId}`,
            correlationId,
            preserveNullCorrelation,
            onSelectAgent
          })
        ) : (
          <span>{agentId}</span>
        )}
      </span>
    );
  });
}

function renderResponsibilityAgent({
  agentId,
  label,
  currentAgentId,
  navigableAgentIds,
  correlationId = null,
  onSelectAgent
}: {
  agentId: string;
  label: string;
  currentAgentId: string;
  navigableAgentIds: Set<string>;
  correlationId?: string | null;
  onSelectAgent: SelectAgentHandler;
}) {
  if (agentId === currentAgentId || !navigableAgentIds.has(agentId)) {
    return label;
  }

  return renderAgentPivotButton({
    agentId,
    label,
    ariaLabel: `Select responsibility chain agent ${agentId}`,
    correlationId,
    onSelectAgent
  });
}

function renderWatchTopologyAgent({
  agentId,
  label,
  roleLabel,
  watchMode,
  fromAgentId,
  toAgentId,
  navigableAgentIds,
  correlationId,
  onSelectAgent
}: {
  agentId: string;
  label: string;
  roleLabel: 'source' | 'target';
  watchMode: string;
  fromAgentId: string;
  toAgentId: string;
  navigableAgentIds: Set<string>;
  correlationId: string | null;
  onSelectAgent: SelectAgentHandler;
}) {
  if (!navigableAgentIds.has(agentId)) {
    return label;
  }

  return renderAgentPivotButton({
    agentId,
    label,
    ariaLabel: `Select watch topology ${roleLabel} agent from ${watchMode} edge ${fromAgentId} ${toAgentId}`,
    correlationId,
    onSelectAgent
  });
}

function renderResponsibilityChain({
  selectedAgentId,
  selectedAgentLabel,
  inboundWatchers,
  outboundWatchers,
  agentNameById,
  navigableAgentIds,
  correlationId,
  onSelectAgent
}: {
  selectedAgentId: string;
  selectedAgentLabel: string;
  inboundWatchers: WorldState['watch_edges'];
  outboundWatchers: WorldState['watch_edges'];
  agentNameById: Map<string, string>;
  navigableAgentIds: Set<string>;
  correlationId?: string | null;
  onSelectAgent: SelectAgentHandler;
}) {
  const chainItems = [
    ...inboundWatchers.map((edge) => ({
      key: `inbound-${edge.from_agent_id}-${edge.to_agent_id}-${edge.watch_mode}`,
      fromAgentId: edge.from_agent_id,
      fromLabel: agentNameById.get(edge.from_agent_id) ?? edge.from_agent_id,
      toAgentId: selectedAgentId,
      toLabel: selectedAgentLabel,
      watchMode: edge.watch_mode,
      riskLabel: selectWatchEdgeRisk(edge).label
    })),
    ...outboundWatchers.map((edge) => ({
      key: `outbound-${edge.from_agent_id}-${edge.to_agent_id}-${edge.watch_mode}`,
      fromAgentId: selectedAgentId,
      fromLabel: selectedAgentLabel,
      toAgentId: edge.to_agent_id,
      toLabel: agentNameById.get(edge.to_agent_id) ?? edge.to_agent_id,
      watchMode: edge.watch_mode,
      riskLabel: selectWatchEdgeRisk(edge).label
    }))
  ];

  if (chainItems.length === 0) {
    return 'No active watch chain';
  }

  return chainItems.map((item, index) => (
    <span key={item.key}>
      {index > 0 ? '; ' : null}
      {renderResponsibilityAgent({
        agentId: item.fromAgentId,
        label: item.fromLabel,
        currentAgentId: selectedAgentId,
        navigableAgentIds,
        correlationId,
        onSelectAgent
      })}
      {' -> '}
      {renderResponsibilityAgent({
        agentId: item.toAgentId,
        label: item.toLabel,
        currentAgentId: selectedAgentId,
        navigableAgentIds,
        correlationId,
        onSelectAgent
      })}
      {` (${item.watchMode}, ${item.riskLabel})`}
    </span>
  ));
}

function renderCollectorWatchTarget({
  watchTarget,
  currentAgentId,
  navigableAgentIds,
  ariaLabelPrefix = 'Select collector observation watch target',
  correlationId,
  onSelectAgent
}: {
  watchTarget: string | null;
  currentAgentId: string;
  navigableAgentIds: Set<string>;
  ariaLabelPrefix?: string;
  correlationId: string | null;
  onSelectAgent: SelectAgentHandler;
}) {
  if (!watchTarget) {
    return 'No watch target';
  }

  if (watchTarget === currentAgentId || !navigableAgentIds.has(watchTarget)) {
    return watchTarget;
  }

  return renderAgentPivotButton({
    agentId: watchTarget,
    ariaLabel: `${ariaLabelPrefix} ${watchTarget}`,
    correlationId,
    onSelectAgent
  });
}

function renderEvidenceRefs(evidenceRefs: string[]) {
  return evidenceRefs.length > 0 ? evidenceRefs.join(', ') : 'No evidence refs';
}

function formatPublicEvidenceRefLabel(evidenceRef: string) {
  const normalized = evidenceRef.trim();
  const sensitiveUriToken = formatSensitiveEvidenceLedgerUriToken(normalized);
  if (sensitiveUriToken) {
    return 'Runtime evidence';
  }

  if (
    normalized.startsWith('/') ||
    normalized.startsWith('~/') ||
    normalized.startsWith('file://') ||
    /^[A-Za-z]:[\\/]/.test(normalized)
  ) {
    return 'Local evidence';
  }

  if (/^https?:\/\//i.test(normalized)) {
    return 'External evidence';
  }

  return 'Linked evidence';
}

function formatPublicEvidenceRefAriaLabel(evidenceRef: string) {
  return formatPublicEvidenceRefLabel(evidenceRef).toLowerCase();
}

function renderSharedMemoryEvidenceRefs({
  evidenceRefs,
  sharedMemoryArtifactRefs,
  onJump,
  jumpAriaLabelPrefix = 'Jump to shared memory artifact',
  allowExactFallback = false,
  formatLabel = (evidenceRef: string) => evidenceRef,
  formatAriaLabel = (evidenceRef: string) => evidenceRef
}: {
  evidenceRefs: string[];
  sharedMemoryArtifactRefs: ReadonlySet<string>;
  onJump: (artifactRef: string) => void;
  jumpAriaLabelPrefix?: string;
  allowExactFallback?: boolean;
  formatLabel?: (evidenceRef: string) => string;
  formatAriaLabel?: (evidenceRef: string) => string;
}) {
  if (evidenceRefs.length === 0) {
    return 'No evidence refs';
  }

  return evidenceRefs.map((evidenceRef, index) => (
    <span key={`${evidenceRef}-${index}`}>
      {index > 0 ? ', ' : null}
      {renderSharedMemoryArtifactJump({
        artifactRef: evidenceRef,
        label: formatLabel(evidenceRef),
        ariaLabelRef: formatAriaLabel(evidenceRef),
        sharedMemoryArtifactRefs,
        onJump,
        jumpAriaLabelPrefix,
        allowExactFallback
      })}
    </span>
  ));
}

function renderCorrelationClosureLedger({
  correlation,
  sharedMemoryArtifactRefs,
  onJump,
  allowExactFallback
}: {
  correlation: CorrelationDrilldown;
  sharedMemoryArtifactRefs: ReadonlySet<string>;
  onJump: (artifactRef: string) => void;
  allowExactFallback: boolean;
}) {
  const ledger = correlation.closure_ledger;
  if (!ledger) {
    return null;
  }

  return (
    <>
      <li className="aitown-record">
        <strong>{`Closure · ${CORRELATION_CLOSURE_LABELS[ledger.state]}`}</strong>
        <span>{`Basis · ${CORRELATION_CLOSURE_BASIS_LABELS[ledger.basis]}`}</span>
        <span>{`Open ${ledger.open_count} · Active ${ledger.active_count} · Closed ${ledger.closed_count}`}</span>
        <span>{`Entries · ${ledger.entry_count}`}</span>
        {ledger.last_transition_ts ? <span>{`Latest transition · ${ledger.last_transition_ts}`}</span> : null}
        {ledger.entries.length === 0 ? <span>No closure evidence in this correlation slice.</span> : null}
      </li>
      {ledger.entries.map((entry) => (
        <li className="aitown-record" key={entry.entry_id}>
          <strong>{`Closure evidence · ${entry.entry_id}`}</strong>
          <span>{`Summary · ${entry.summary || 'No summary'}`}</span>
          <span>{`State · ${CORRELATION_CLOSURE_LABELS[entry.state]} · ${entry.kind} · ${entry.status}`}</span>
          <span>{`Transition · ${entry.ts}`}</span>
          <span>{`Agent · ${entry.agent_id}`}</span>
          {entry.actor_id ? <span>{`Actor · ${entry.actor_id}`}</span> : null}
          <span>{`Source · ${entry.source_kind}`}</span>
          <span>
            Evidence ·{' '}
            {renderSharedMemoryEvidenceRefs({
              evidenceRefs: entry.evidence_refs,
              sharedMemoryArtifactRefs,
              onJump,
              allowExactFallback
            })}
          </span>
          {entry.incident_id ? <span>{`Incident · ${entry.incident_id}`}</span> : null}
          {entry.interaction_id ? <span>{`Interaction · ${entry.interaction_id}`}</span> : null}
          {entry.related_event_ids && entry.related_event_ids.length > 0 ? (
            <span>{`Related events · ${entry.related_event_ids.join(', ')}`}</span>
          ) : null}
        </li>
      ))}
    </>
  );
}

function resolveSharedMemoryEvidenceJumpBehavior(
  onFocusSharedMemoryArtifact?: (artifactRef: string, scope?: SharedMemoryJumpScope) => void
) {
  return {
    onJump: onFocusSharedMemoryArtifact ?? focusSharedMemoryArtifact,
    allowExactFallback: Boolean(onFocusSharedMemoryArtifact)
  };
}

function renderSharedMemoryArtifactJump({
  artifactRef,
  label,
  ariaLabelRef,
  sharedMemoryArtifactRefs,
  onJump,
  jumpAriaLabelPrefix = 'Jump to shared memory artifact',
  ariaLabelSuffix = null,
  allowExactFallback = false
}: {
  artifactRef: string;
  label: string;
  ariaLabelRef?: string;
  sharedMemoryArtifactRefs: ReadonlySet<string>;
  onJump: (artifactRef: string) => void;
  jumpAriaLabelPrefix?: string;
  ariaLabelSuffix?: string | null;
  allowExactFallback?: boolean;
}) {
  if (!sharedMemoryArtifactRefs.has(artifactRef) && !allowExactFallback) {
    return label;
  }

  const ariaLabel = ariaLabelSuffix
    ? `${jumpAriaLabelPrefix} ${ariaLabelRef ?? artifactRef} ${ariaLabelSuffix}`
    : `${jumpAriaLabelPrefix} ${ariaLabelRef ?? artifactRef}`;

  return (
    <button
      type="button"
      className="aitown-link-button"
      aria-label={ariaLabel}
      onClick={() => onJump(artifactRef)}
    >
      {label}
    </button>
  );
}

function renderCounterparties(counterpartyAgentIds: string[]) {
  return counterpartyAgentIds.length > 0 ? counterpartyAgentIds.join(', ') : 'No counterparties';
}

function renderParticipants(participantAgentIds: string[]) {
  return participantAgentIds.length > 0 ? participantAgentIds.join(', ') : 'No participants';
}

function renderNamedList(values: string[], emptyLabel: string) {
  return values.length > 0 ? values.join(', ') : emptyLabel;
}

function renderCompactFacetList(
  values: readonly string[],
  emptyLabel: string,
  formatValue: (value: string) => string = (value) => value
) {
  const visibleValues = values.slice(0, STRUCTURED_EVIDENCE_FACET_TOKEN_LIMIT).map(formatValue);

  if (visibleValues.length === 0) {
    return emptyLabel;
  }

  const overflowCount = values.length - visibleValues.length;
  return overflowCount > 0 ? `${visibleValues.join(', ')}, +${overflowCount} more` : visibleValues.join(', ');
}

function renderStructuredEvidenceFacetCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function dedupeNonEmptyStrings(values: Array<string | null | undefined>) {
  return values.filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);
}

function renderCorrelationPivotList({
  correlationIds,
  activeCorrelationId,
  emptyLabel,
  buttonLabel,
  onSelectCorrelation
}: {
  correlationIds: string[];
  activeCorrelationId: string | null;
  emptyLabel: string;
  buttonLabel: string;
  onSelectCorrelation: SelectCorrelationHandler;
}) {
  const uniqueCorrelationIds = dedupeNonEmptyStrings(correlationIds);

  if (uniqueCorrelationIds.length === 0) {
    return emptyLabel;
  }

  return uniqueCorrelationIds.map((correlationId, index) => (
    <span key={`${buttonLabel}-${correlationId}`}>
      {index > 0 ? ', ' : null}
      {renderCorrelationButton({
        correlationId,
        label: correlationId,
        buttonLabel,
        activeCorrelationId,
        onSelectCorrelation
      })}
    </span>
  ));
}

function isAlignedCorrelation(itemCorrelationId: string | null | undefined, correlationId: string | null) {
  if (!correlationId) {
    return true;
  }

  return itemCorrelationId === correlationId;
}

function findFirstNonEmptyString(values: Array<string | null | undefined>) {
  return values.find((value): value is string => Boolean(value?.trim())) ?? null;
}

function selectLatestTimelineEvent(timeline: WorkflowTimelineEvent[]) {
  return timeline.length > 0 ? timeline[timeline.length - 1] : null;
}

function filterTimelineBySeverity(timeline: WorkflowTimelineEvent[], selectedSeverity: Severity | null) {
  return selectedSeverity ? timeline.filter((event) => event.severity === selectedSeverity) : timeline;
}

function renderTimestamp(value: string | null | undefined, fallback: string) {
  return findFirstNonEmptyString([value]) ?? fallback;
}

const SENSITIVE_EVIDENCE_LEDGER_TOKEN_PATTERN = /(?:access[_-]?token|api[_-]?key|secret|password|credential|bearer|token)(?:[-_=:.][A-Za-z0-9][A-Za-z0-9._:-]*)?/gi;
const FILE_EVIDENCE_LEDGER_REF_PATTERN = /file:\/\/\/?[^\s,;:)]+/g;
const SENSITIVE_EVIDENCE_LEDGER_URI_REF_PATTERN = /(?:tmux|hermes|session|profile):\/\/[^\s,;)]+/gi;
const NON_FILE_URI_EVIDENCE_LEDGER_REF_PATTERN = /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s,;)]+/g;
const LOCAL_EVIDENCE_LEDGER_REF_PATTERN = /(^|[^/])((?:\/(?!\/)[^\s,;:)/]+(?:\/[^\s,;)]+)+)|(?:~\/[^\s,;)]+)|(?:[A-Za-z]:(?![\\/]{2})[\\/][^\s,;)]+))/g;

type EvidenceLedgerLocalPathFormatOptions = {
  includeBasename?: boolean;
};

type EvidenceLedgerTokenFormatOptions = {
  includeLocalPathBasename?: boolean;
};

function formatLocalEvidenceLedgerPathToken(value: string, options: EvidenceLedgerLocalPathFormatOptions = {}) {
  const trimmed = value.trim().replace(/^file:\/\//, '');
  const basename = trimmed.split(/[\\/]/).filter(Boolean).pop();
  if (options.includeBasename === false) {
    return '[local path]';
  }
  return basename ? `[local path] ${basename}` : '[local path]';
}

function formatSensitiveEvidenceLedgerUriToken(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith('tmux://')) {
    return '[tmux ref]';
  }

  if (normalized.startsWith('hermes://') || normalized.startsWith('session://') || normalized.startsWith('profile://')) {
    return '[runtime ref]';
  }

  return null;
}

function redactLocalEvidenceLedgerPathChunk(value: string, options: EvidenceLedgerLocalPathFormatOptions = {}) {
  return value.replace(
    LOCAL_EVIDENCE_LEDGER_REF_PATTERN,
    (_match, prefix: string, localRef: string) => (
      `${prefix}${formatLocalEvidenceLedgerPathToken(localRef, options)}`
    )
  );
}

function redactLocalEvidenceLedgerRefs(value: string, options: EvidenceLedgerLocalPathFormatOptions = {}) {
  const sensitiveUriRefsRedacted = value.replace(
    SENSITIVE_EVIDENCE_LEDGER_URI_REF_PATTERN,
    (match) => formatSensitiveEvidenceLedgerUriToken(match) ?? match
  );
  const fileRefsRedacted = sensitiveUriRefsRedacted.replace(
    FILE_EVIDENCE_LEDGER_REF_PATTERN,
    (match) => formatLocalEvidenceLedgerPathToken(match, options)
  );

  let cursor = 0;
  let redacted = '';
  for (const match of fileRefsRedacted.matchAll(NON_FILE_URI_EVIDENCE_LEDGER_REF_PATTERN)) {
    const matchIndex = match.index ?? 0;
    redacted += redactLocalEvidenceLedgerPathChunk(fileRefsRedacted.slice(cursor, matchIndex), options);
    redacted += match[0];
    cursor = matchIndex + match[0].length;
  }

  redacted += redactLocalEvidenceLedgerPathChunk(fileRefsRedacted.slice(cursor), options);
  return redacted;
}

function redactSensitiveEvidenceLedgerToken(value: string) {
  return value.replace(SENSITIVE_EVIDENCE_LEDGER_TOKEN_PATTERN, '[redacted]');
}

function formatBoundedEvidenceLedgerToken(value: string, options: EvidenceLedgerTokenFormatOptions = {}) {
  const normalized = value.trim();
  const redacted = redactSensitiveEvidenceLedgerToken(
    redactLocalEvidenceLedgerRefs(normalized, { includeBasename: options.includeLocalPathBasename ?? true })
  );
  if (redacted.length <= EVIDENCE_LEDGER_TOKEN_LIMIT) {
    return redacted;
  }

  return `${redacted.slice(0, EVIDENCE_LEDGER_TOKEN_LIMIT - 3)}...`;
}

function formatEvidenceLedgerRef(value: string) {
  const normalized = value.trim();
  const sensitiveUriToken = formatSensitiveEvidenceLedgerUriToken(normalized);
  if (sensitiveUriToken) {
    return sensitiveUriToken;
  }

  if (
    normalized.startsWith('/') ||
    normalized.startsWith('~/') ||
    normalized.startsWith('file://') ||
    /^[A-Za-z]:[\\/]/.test(normalized)
  ) {
    const trimmed = normalized.replace(/^file:\/\//, '');
    const basename = trimmed.split(/[\\/]/).filter(Boolean).pop();
    return formatBoundedEvidenceLedgerToken(basename ? `[local path] ${basename}` : '[local path]');
  }

  return formatBoundedEvidenceLedgerToken(normalized);
}

function renderSelectedAgentEvidenceProofCompass(model: SelectedAgentEvidenceLedgerModel) {
  if (model.isEmpty) {
    return null;
  }

  const buckets: SelectedAgentEvidenceLedgerBucket[] = [
    {
      key: 'output',
      label: 'Output',
      totalCount: model.outputEvidence.totalCount
    },
    {
      key: 'non-output',
      label: 'Non-output',
      totalCount: model.nonOutputEvidence.totalCount
    },
    {
      key: 'degraded',
      label: 'Degraded',
      totalCount: model.degradedEvidence.totalCount
    },
    {
      key: 'unmapped',
      label: 'Unmapped',
      totalCount: model.unmappedEvidence.totalCount
    }
  ];
  const visibleBuckets = buckets.filter((bucket) => bucket.totalCount > 0);
  const sourceContextGroups = model.sourceContextGroups;
  const sourceRefGroups = model.sourceRefGroups;

  if (visibleBuckets.length === 0 && sourceContextGroups.length === 0 && sourceRefGroups.length === 0) {
    return null;
  }

  return (
    <li className="aitown-record">
      <strong>Proof Compass</strong>
      {visibleBuckets.length > 0 ? (
        <span>
          Buckets ·{' '}
          {visibleBuckets.map((bucket, index) => (
            <Fragment key={bucket.key}>
              {index > 0 ? ' · ' : null}
              <button
                type="button"
                className="aitown-link-button"
                aria-label={`Show ${bucket.label.toLowerCase()} evidence ${bucket.totalCount}`}
                onClick={() => focusSelectedAgentEvidenceLedgerGroup(bucket.key)}
              >
                {`${bucket.label} ${bucket.totalCount}`}
              </button>
            </Fragment>
          ))}
        </span>
      ) : null}
      {sourceContextGroups.map((group) => renderSelectedAgentEvidenceSourceContextGroup(group))}
      {sourceRefGroups.map((group) => renderSelectedAgentEvidenceSourceRefGroup(group))}
    </li>
  );
}

function getSelectedAgentEvidenceLedgerGroupId(key: SelectedAgentEvidenceLedgerBucketKey) {
  return `selected-agent-evidence-ledger-${key}`;
}

function focusSelectedAgentEvidenceLedgerGroup(key: SelectedAgentEvidenceLedgerBucketKey) {
  if (typeof document === 'undefined') {
    return;
  }

  const target = document.getElementById(getSelectedAgentEvidenceLedgerGroupId(key));
  if (!(target instanceof HTMLElement)) {
    return;
  }

  target.scrollIntoView({ block: 'nearest' });
  target.focus({ preventScroll: true });
}

function renderSelectedAgentEvidenceSourceContextGroup(group: SelectedAgentEvidenceLedgerSourceContextGroup) {
  return (
    <span
      key={`${group.sourceKind}:${group.evidenceRole ?? 'none'}:${group.sourceStatus ?? 'none'}:${group.mapped ? 'mapped' : 'unmapped'}`}
    >
      {`Source context · ${group.sourceKind} · ${group.evidenceRole ?? 'unclassified'} · ${group.sourceStatus ?? 'unknown'} · ${group.mapped ? 'mapped' : 'unmapped'} · ${group.totalCount} · Observed ${renderTimestamp(group.observedAt, 'No observed timestamp')} · Collected ${renderTimestamp(group.collectedAt, 'No collected timestamp')}`}
    </span>
  );
}

function renderSelectedAgentEvidenceSourceRefGroup(group: SelectedAgentEvidenceLedgerSourceRefGroup) {
  return (
    <span key={`${group.sourceKind}:${group.evidenceRole ?? 'none'}:${group.sourceStatus ?? 'none'}`}>
      {`Ref rollup · ${group.sourceKind} · ${group.evidenceRole ?? 'unclassified'} · ${group.sourceStatus ?? 'unknown'} · refs available · ${group.totalCount}`}
    </span>
  );
}

function renderSelectedAgentEvidenceLedgerGroup(
  key: SelectedAgentEvidenceLedgerBucketKey,
  label: string,
  group: SelectedAgentEvidenceLedgerGroup,
  onInspectRecord: (evidenceId: string) => void
) {
  if (group.totalCount === 0) {
    return null;
  }

  return (
    <li className="aitown-record" id={getSelectedAgentEvidenceLedgerGroupId(key)} tabIndex={-1}>
      <strong>{`${label} · ${group.totalCount}`}</strong>
      {group.items.map((item) => renderSelectedAgentEvidenceLedgerItem(item, onInspectRecord))}
      {group.overflowCount > 0 ? <span>{`More · ${group.overflowCount} hidden by card limit`}</span> : null}
    </li>
  );
}

function renderSelectedAgentEvidenceLedgerItem(
  item: SelectedAgentEvidenceLedgerItem,
  onInspectRecord: (evidenceId: string) => void
) {
  const mapped = item.agentId !== null && item.evidenceRole !== 'runtime_unmapped';
  const evidenceId = formatBoundedEvidenceLedgerToken(item.evidenceId);

  return (
    <Fragment key={item.evidenceId}>
      <span>{`Source · ${item.sourceKind} · Role · ${item.evidenceRole ?? 'unclassified'} · Status · ${item.sourceStatus ?? 'unknown'} · ${mapped ? 'mapped' : 'unmapped'} · Observed · ${renderTimestamp(item.observedAt, 'No observed timestamp')} · Collected · ${renderTimestamp(item.collectedAt, 'No collected timestamp')}`}</span>
      <button
        type="button"
        className="aitown-link-button"
        aria-label={`Inspect evidence record ${evidenceId}`}
        onClick={() => onInspectRecord(item.evidenceId)}
      >
        Inspect record
      </button>
    </Fragment>
  );
}

function renderSelectedAgentEvidenceRecordDetail(
  record: EvidenceRecord | null,
  state: LoadState,
  error: string | null,
  requestedEvidenceId: string | null,
  provenanceBundle: EvidenceProvenanceBundle | null,
  provenanceState: LoadState,
  provenanceError: string | null,
  sourceContext: EvidenceSourceContext | null,
  sourceContextState: LoadState,
  sourceContextError: string | null,
  checkpointLog: ReplayCheckpointLogResponse | null,
  checkpointLogState: LoadState,
  checkpointLogError: string | null,
  onInspectSourceContext: (evidenceId: string) => void,
  onReplayRecord: (evidenceId: string) => void
) {
  if (!requestedEvidenceId && !record) {
    return null;
  }

  const evidenceId = requestedEvidenceId ?? record?.evidence_id ?? 'unknown';
  const boundedEvidenceId = formatBoundedEvidenceLedgerToken(evidenceId);
  const recordEvidenceId = record?.evidence_id ?? null;
  const recordBoundedEvidenceId = recordEvidenceId ? formatBoundedEvidenceLedgerToken(recordEvidenceId) : boundedEvidenceId;
  const recordMatchesRequestedEvidence = !record || requestedEvidenceId === null || record.evidence_id === requestedEvidenceId;
  const sourceContextMatchesRecord = !sourceContext || !record || sourceContext.evidence_id === record.evidence_id;

  return (
    <section
      className="aitown-details__section aitown-details__section--selected-evidence aitown-details__section--selected-evidence-record aitown-details__section--hub-evidence"
    >
      <h3>Evidence Record Detail</h3>
      <ul className="aitown-records">
        {state === 'loading' && !record ? (
          <li className="aitown-record">{`Loading evidence record detail for ${boundedEvidenceId}...`}</li>
        ) : null}
        {error && !record ? (
          <li className="aitown-record">{`Unable to load evidence record ${boundedEvidenceId}. ${error}`}</li>
        ) : null}
        {state === 'ready' && !error && !record ? (
          <li className="aitown-record">{`No evidence record found for ${boundedEvidenceId}.`}</li>
        ) : null}
        {record ? (
          <li className="aitown-record">
            <strong>{`Evidence id · ${recordBoundedEvidenceId}`}</strong>
            {state === 'loading' ? <span>Refreshing evidence record detail...</span> : null}
            {!recordMatchesRequestedEvidence ? <span>{`Waiting for evidence record ${boundedEvidenceId}...`}</span> : null}
            {error ? <span>{`Last-good detail · Refresh failed: ${error}`}</span> : null}
            <span>{`Observed · ${renderTimestamp(record.observed_at, 'No observed timestamp')}`}</span>
            <span>{`Collected · ${renderTimestamp(record.collected_at, 'No collected timestamp')}`}</span>
            <span>{`Source · ${record.source_kind}`}</span>
            <span>{`Status · ${record.source_status ?? 'unknown'}`}</span>
            <span>{`Role · ${record.evidence_role ?? 'unclassified'}`}</span>
            <span>{`Output candidate · ${String(record.output_candidate)}`}</span>
            <span>{`Snapshot · ${formatBoundedEvidenceLedgerToken(record.collector_snapshot_id)}`}</span>
            <span>{`Correlation · ${record.correlation_id ? formatBoundedEvidenceLedgerToken(record.correlation_id) : 'none'}`}</span>
            <span>{`Degraded count · ${record.degraded_reasons.length}`}</span>
            <span>{`Ref · ${formatEvidenceLedgerRef(record.evidence_ref)}`}</span>
            {renderSelectedAgentEvidenceProvenanceAnchors(provenanceBundle, provenanceState, provenanceError)}
            {recordMatchesRequestedEvidence ? (
              renderSelectedAgentEvidenceSourceContext(
                record.evidence_id,
                sourceContextMatchesRecord ? sourceContext : null,
                sourceContextState,
                sourceContextError,
                onInspectSourceContext
              )
            ) : (
              <span>Source context · waiting for requested evidence record</span>
            )}
            {renderSelectedAgentEvidenceCheckpointProofStrip(checkpointLog, checkpointLogState, checkpointLogError)}
            {renderSelectedAgentEvidenceReplayAction(record, provenanceBundle, provenanceState, onReplayRecord)}
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function renderSelectedAgentEvidenceSourceContext(
  evidenceId: string,
  sourceContext: EvidenceSourceContext | null,
  state: LoadState,
  error: string | null,
  onInspectSourceContext: (evidenceId: string) => void
) {
  if (state === 'loading' && !sourceContext) {
    return <span>Source context · loading</span>;
  }

  if (error && !sourceContext) {
    return <span>{`Source context · unavailable · ${error}`}</span>;
  }

  if (!sourceContext) {
    return (
      <>
        <span>Source context · not loaded</span>
        <button
          type="button"
          className="aitown-link-button"
          aria-label={`Inspect source context for evidence ${formatBoundedEvidenceLedgerToken(evidenceId)}`}
          onClick={() => onInspectSourceContext(evidenceId)}
        >
          Inspect source context
        </button>
      </>
    );
  }

  const summary = sourceContext.source_summary;
  const healthItem =
    sourceContext.source_health.agent_items.find((item) => item.agent_id === sourceContext.record.agent_id) ??
    sourceContext.source_health.agent_items[0] ??
    null;

  return (
    <span className="aitown-evidence-source-context" aria-label="Selected evidence source context">
      <strong>Evidence Source Context</strong>
      <span>
        {`Source context · ${summary.kind} · ${summary.role ?? 'unclassified'} · ${summary.status ?? 'unknown'} · ${summary.mapped ? 'mapped' : 'unmapped'} · ${summary.output_candidate ? 'output candidate' : 'non-output'}`}
      </span>
      <span>{`Observed · ${renderTimestamp(summary.time.observed_at, 'No observed timestamp')}`}</span>
      <span>{`Collected · ${renderTimestamp(summary.time.collected_at, 'No collected timestamp')}`}</span>
      <span>{`Source gaps · ${sourceContext.source_gaps.summary.total_count} total · ${sourceContext.source_gaps.summary.mapped_count} mapped · ${sourceContext.source_gaps.summary.unmapped_count} unmapped`}</span>
      {healthItem ? (
        <span>{`Source health · ${healthItem.evidence_count} evidence · Latest ${renderTimestamp(healthItem.latest_evidence_at, 'No evidence timestamp')}`}</span>
      ) : null}
    </span>
  );
}

function renderSelectedAgentEvidenceCheckpointProofStrip(
  log: ReplayCheckpointLogResponse | null,
  state: LoadState,
  error: string | null
) {
  if (state === 'loading' && !log) {
    return <span>Checkpoint proof · loading selected evidence rows...</span>;
  }

  if (error && !log) {
    return <span>{`Checkpoint proof · unavailable · ${error}`}</span>;
  }

  if (!log) {
    return null;
  }

  const rows = log.items.slice(0, 3);

  if (rows.length === 0) {
    return <span>Checkpoint proof · none for selected evidence</span>;
  }

  return (
    <span className="aitown-evidence-proof-strip" aria-label="Selected evidence checkpoint proof">
      <span>Checkpoint proof</span>
      {rows.map((item) => (
        <span key={`${item.append_index}:${item.record_kind}`} className="aitown-evidence-proof-strip__row">
          {renderSelectedAgentEvidenceCheckpointProofRow(item.append_index, item.record_kind, item.checkpoint)}
        </span>
      ))}
    </span>
  );
}

function renderSelectedAgentEvidenceCheckpointProofRow(
  appendIndex: number,
  recordKind: string,
  checkpoint: ReplayCheckpoint | null
) {
  const facts = [`#${appendIndex}`, recordKind];

  if (checkpoint && 'event_id' in checkpoint) {
    facts.push(formatBoundedEvidenceLedgerToken(checkpoint.event_id), checkpoint.event_type);
    if (checkpoint.source_kind) {
      facts.push(checkpoint.source_kind);
    }
    facts.push(renderTimestamp(checkpoint.ts, 'No timestamp'));
  } else if (checkpoint && 'received_at' in checkpoint) {
    facts.push(
      formatBoundedEvidenceLedgerToken(checkpoint.agent_id),
      renderTimestamp(checkpoint.received_at, 'No timestamp')
    );
  } else if (checkpoint && 'item_count' in checkpoint) {
    facts.push(
      formatBoundedEvidenceLedgerToken(checkpoint.collector_snapshot_id),
      `${checkpoint.item_count} items`,
      renderTimestamp(checkpoint.collected_at, 'No collected timestamp')
    );
  } else if (checkpoint) {
    facts.push(
      checkpoint.source_kind ?? 'unknown source',
      checkpoint.evidence_role ?? 'unclassified',
      checkpoint.source_status ?? 'unknown',
      checkpoint.output_candidate ? 'output candidate' : 'non-output',
      checkpoint.correlation_id ? formatBoundedEvidenceLedgerToken(checkpoint.correlation_id) : 'no correlation',
      renderTimestamp(checkpoint.observed_at, 'No observed timestamp')
    );
  } else {
    facts.push('empty checkpoint');
  }

  return facts.join(' · ');
}

function renderSelectedAgentEvidenceReplayAction(
  record: EvidenceRecord,
  provenanceBundle: EvidenceProvenanceBundle | null,
  provenanceState: LoadState,
  onReplayRecord: (evidenceId: string) => void
) {
  if (provenanceState === 'loading' && !provenanceBundle) {
    return null;
  }

  if (provenanceState === 'error' && !provenanceBundle) {
    return <span>Replay · unavailable without provenance anchor</span>;
  }

  const replayEvidenceId = provenanceBundle?.anchors.replay?.evidence_id?.trim() ?? '';
  if (!replayEvidenceId) {
    return <span>Replay · not available for collector-only evidence</span>;
  }

  if (replayEvidenceId !== record.evidence_id) {
    return <span>Replay · not available for this evidence</span>;
  }

  return (
    <button
      type="button"
      className="aitown-link-button"
      aria-label={`Replay this evidence ${formatBoundedEvidenceLedgerToken(record.evidence_id)}`}
      onClick={() => onReplayRecord(record.evidence_id)}
    >
      Replay this evidence
    </button>
  );
}

function renderSelectedAgentEvidenceProvenanceAnchors(
  bundle: EvidenceProvenanceBundle | null,
  state: LoadState,
  error: string | null
) {
  if (state === 'loading' && !bundle) {
    return <span>Loading provenance anchors...</span>;
  }

  if (error && !bundle) {
    return <span>{`Provenance anchors unavailable · ${error}`}</span>;
  }

  if (!bundle) {
    return null;
  }

  const { snapshot, source, replay } = bundle.anchors;
  const replayAnchorLabel = replay
    ? findFirstNonEmptyString([replay.correlation_id, replay.evidence_id])
    : null;

  return (
    <>
      {snapshot ? (
        <span>{`Snapshot anchor · ${formatBoundedEvidenceLedgerToken(snapshot.collector_snapshot_id)}`}</span>
      ) : null}
      {source ? (
        <span>
          {`Source anchor · ${formatBoundedEvidenceLedgerToken(source.evidence_id, { includeLocalPathBasename: false })} · ${source.source_kind} · ${source.evidence_role ?? 'unclassified'} · ${source.source_status ?? 'unknown'}`}
        </span>
      ) : null}
      {replay && replayAnchorLabel ? (
        <span>{`Replay anchor · ${formatBoundedEvidenceLedgerToken(replayAnchorLabel)}`}</span>
      ) : null}
    </>
  );
}

function renderOperationBlocker(blocker: string) {
  return blocker || 'No current blocker';
}

function renderCollectorDerivedPeerWatchMetadata(metadata: unknown) {
  return formatCollectorDerivedPeerWatchMetadata(metadata)?.map((line) => <span key={line}>{line}</span>) ?? null;
}

function renderOperationStaleness(operation: OfficeOperation) {
  return `${SEVERITY_LABELS[operation.derived_staleness.severity]} · ${operation.derived_staleness.stale_for_minutes ?? 0}m`;
}

function parseTimestampMs(value: string) {
  const timestampMs = Date.parse(value);

  return Number.isFinite(timestampMs) ? timestampMs : null;
}

function selectTimestampEvidence(candidates: Array<{ label: string; value: string | null | undefined }>) {
  const matches = candidates.flatMap((candidate) => {
    const value = findFirstNonEmptyString([candidate.value]);

    return value ? [{ label: candidate.label, value }] : [];
  });

  if (matches.length === 0) {
    return null;
  }

  return matches.reduce((selected, candidate) => {
    const selectedMs = parseTimestampMs(selected.value);
    const candidateMs = parseTimestampMs(candidate.value);

    if (candidateMs === null) {
      return selected;
    }

    return selectedMs === null || candidateMs > selectedMs ? candidate : selected;
  });
}

function isTimestampAfter(value: string, reference: string) {
  const valueMs = parseTimestampMs(value);
  const referenceMs = parseTimestampMs(reference);

  return valueMs !== null && referenceMs !== null && valueMs > referenceMs;
}

function selectOperationOutputEvidence(operation: OfficeOperation) {
  return selectTimestampEvidence([
    { label: 'operation last output', value: operation.last_meaningful_output_at },
    { label: 'operation staleness output', value: operation.derived_staleness.last_meaningful_output_at }
  ]);
}

function selectOperationSnapshotTimestampEvidence(operation: OfficeOperation) {
  return selectTimestampEvidence([
    { label: 'operation latest event', value: operation.latest_event?.ts },
    { label: 'operation last event', value: operation.last_event_at },
    { label: 'operation heartbeat', value: operation.last_heartbeat_at },
    { label: 'operation last output', value: operation.last_meaningful_output_at },
    { label: 'operation staleness output', value: operation.derived_staleness.last_meaningful_output_at }
  ]);
}

function resolveRetainedCollectorSourceWarning(
  collectorSnapshot: CollectorSnapshot | null,
  collectorSnapshotError: string | null,
  collectorSnapshotState: LoadState
) {
  if (!collectorSnapshot) {
    return null;
  }

  if (collectorSnapshotError) {
    return collectorSnapshotError;
  }

  if (collectorSnapshotState === 'error') {
    return 'Collector snapshot unavailable';
  }

  return collectorSnapshotState === 'loading' ? 'Collector snapshot loading' : null;
}

function appendCollectorFreshnessEvidence(
  parts: string[],
  operation: OfficeOperation,
  collectorSnapshot: CollectorSnapshot | null,
  collectorSnapshotError: string | null,
  collectorSnapshotState: LoadState,
  selectedCollectorItem: CollectorItem | null,
  retainedCollectorSourceWarning: string | null
) {
  if (retainedCollectorSourceWarning) {
    parts.push(`Data gap · Stale collector source (${retainedCollectorSourceWarning})`);

    return;
  }

  if (collectorSnapshot && selectedCollectorItem) {
    const collectorHeartbeat = findFirstNonEmptyString([selectedCollectorItem.heartbeat.received_at]);
    parts.push(
      collectorHeartbeat
        ? `Collector evidence (${collectorSnapshot.actor_id} collected ${collectorSnapshot.collected_at}, heartbeat ${collectorHeartbeat})`
        : `Data gap · No collector heartbeat timestamp in snapshot ${collectorSnapshot.collected_at}`
    );
  } else if (collectorSnapshot) {
    parts.push(`Data gap · No collector evidence for ${operation.agent_id} in snapshot ${collectorSnapshot.collected_at}`);
  } else if (collectorSnapshotState === 'loading') {
    parts.push('Data gap · Collector snapshot loading');
  } else if (collectorSnapshotError) {
    parts.push(`Data gap · Collector snapshot unavailable (${collectorSnapshotError})`);
  } else {
    parts.push('Data gap · No collector snapshot available');
  }
}

function isCollectorHeartbeatFresherThanOperationSnapshot(
  operation: OfficeOperation,
  selectedCollectorItem: CollectorItem | null
) {
  const collectorHeartbeat = findFirstNonEmptyString([selectedCollectorItem?.heartbeat.received_at]);

  if (!collectorHeartbeat || selectedCollectorItem?.agent_id !== operation.agent_id) {
    return false;
  }

  const collectorHeartbeatMs = parseTimestampMs(collectorHeartbeat);

  if (collectorHeartbeatMs === null) {
    return false;
  }

  const operationTimestamp = selectOperationSnapshotTimestampEvidence(operation);

  if (operationTimestamp === null) {
    return true;
  }

  const operationTimestampMs = parseTimestampMs(operationTimestamp.value);

  return operationTimestampMs === null || collectorHeartbeatMs > operationTimestampMs;
}

function isCollectorHeartbeatOlderThanOperationSnapshot(
  operation: OfficeOperation,
  selectedCollectorItem: CollectorItem | null
) {
  const collectorHeartbeat = findFirstNonEmptyString([selectedCollectorItem?.heartbeat.received_at]);

  if (!collectorHeartbeat || selectedCollectorItem?.agent_id !== operation.agent_id) {
    return false;
  }

  const collectorHeartbeatMs = parseTimestampMs(collectorHeartbeat);
  const operationTimestamp = selectOperationSnapshotTimestampEvidence(operation);
  const operationTimestampMs = operationTimestamp ? parseTimestampMs(operationTimestamp.value) : null;

  return collectorHeartbeatMs !== null && operationTimestampMs !== null && collectorHeartbeatMs < operationTimestampMs;
}

function renderFreshnessCause({
  operation,
  collectorSnapshot,
  collectorSnapshotError,
  collectorSnapshotState,
  operationSourceWarning,
  selectedCollectorItem,
  workflow,
  workflowHeartbeatTrusted
}: {
  operation: OfficeOperation;
  collectorSnapshot: CollectorSnapshot | null;
  collectorSnapshotError: string | null;
  collectorSnapshotState: LoadState;
  operationSourceWarning: string | null;
  selectedCollectorItem: CollectorItem | null;
  workflow: AgentWorkflow | null;
  workflowHeartbeatTrusted: boolean;
}) {
  const operationSourceIsRetained = operationSourceWarning !== null;
  const retainedCollectorSourceWarning = resolveRetainedCollectorSourceWarning(
    collectorSnapshot,
    collectorSnapshotError,
    collectorSnapshotState
  );
  const trustedOperationHeartbeat = operationSourceIsRetained ? null : operation.last_heartbeat_at;
  const trustedOperationOutput = operationSourceIsRetained ? null : operation.last_meaningful_output_at;
  const trustedOperationStalenessOutput = operationSourceIsRetained
    ? null
    : operation.derived_staleness.last_meaningful_output_at;
  const trustedCollectorHeartbeat = retainedCollectorSourceWarning ? null : selectedCollectorItem?.heartbeat.received_at;
  const trustedCollectorOutput = retainedCollectorSourceWarning
    ? null
    : selectedCollectorItem?.heartbeat.last_meaningful_output_at;
  const trustedCollectorBlocker = retainedCollectorSourceWarning
    ? null
    : selectedCollectorItem?.heartbeat.current_blocker;
  const trustedWorkflowHeartbeat = workflowHeartbeatTrusted ? workflow?.detail.latest_heartbeat?.received_at : null;
  const heartbeatEvidence = selectTimestampEvidence([
    { label: 'operation heartbeat', value: trustedOperationHeartbeat },
    { label: 'collector heartbeat', value: trustedCollectorHeartbeat },
    { label: 'workflow heartbeat', value: trustedWorkflowHeartbeat }
  ]);
  const outputEvidence = selectTimestampEvidence([
    { label: 'operation last output', value: trustedOperationOutput },
    { label: 'collector last output', value: trustedCollectorOutput },
    { label: 'operation staleness output', value: trustedOperationStalenessOutput }
  ]);
  const parts = ['Freshness cause'];
  const operationOutputEvidence = operationSourceIsRetained ? null : selectOperationOutputEvidence(operation);
  const collectorPriorityIsFresher =
    !operationSourceIsRetained &&
    !retainedCollectorSourceWarning &&
    isCollectorHeartbeatFresherThanOperationSnapshot(operation, selectedCollectorItem);
  const collectorCauseIsOlderThanOperation =
    !operationSourceIsRetained &&
    !retainedCollectorSourceWarning &&
    isCollectorHeartbeatOlderThanOperationSnapshot(operation, selectedCollectorItem);
  const collectorCanProvideLiveCause = !retainedCollectorSourceWarning && !collectorCauseIsOlderThanOperation;

  if (operationSourceWarning) {
    parts.push(`Data gap · Stale operation source (${operationSourceWarning})`);
  }

  const rebootSources = [
    !operationSourceIsRetained && !collectorPriorityIsFresher && operation.reboot_recommended
      ? 'operation snapshot'
      : null,
    collectorCanProvideLiveCause && selectedCollectorItem?.heartbeat.reboot_recommended ? 'collector heartbeat' : null
  ].filter((source): source is string => source !== null);
  const operationBlocker =
    operationSourceIsRetained || collectorPriorityIsFresher ? null : findFirstNonEmptyString([operation.current_blocker]);
  const collectorBlocker = collectorCanProvideLiveCause ? findFirstNonEmptyString([trustedCollectorBlocker]) : null;
  const blocker = collectorPriorityIsFresher ? collectorBlocker : operationBlocker ?? collectorBlocker;
  const hasPriorityCause = rebootSources.length > 0 || blocker !== null;

  if (rebootSources.length > 0) {
    parts.push(`Reboot recommended (${rebootSources.join(', ')})`);
  }

  if (blocker) {
    parts.push(`Blocked by ${blocker} (${operationBlocker ? 'operation current blocker' : 'collector current blocker'})`);
  }

  if (!heartbeatEvidence && !retainedCollectorSourceWarning) {
    parts.push('No heartbeat evidence');
  } else if (!operationSourceIsRetained && !hasPriorityCause && operation.derived_staleness.severity !== 'normal') {
    const staleForMinutes = operation.derived_staleness.stale_for_minutes ?? 0;
    const outputLabel = operationOutputEvidence
      ? `${operationOutputEvidence.label} ${operationOutputEvidence.value}, ${SEVERITY_LABELS[operation.derived_staleness.severity]} ${staleForMinutes}m`
      : `${SEVERITY_LABELS[operation.derived_staleness.severity]} ${staleForMinutes}m, no operation output timestamp evidence`;
    parts.push(`Output stale (${outputLabel})`);
  } else if (!hasPriorityCause) {
    parts.push(outputEvidence ? `Output evidence (${outputEvidence.label} ${outputEvidence.value})` : 'No output timestamp evidence');
  }

  if (!heartbeatEvidence && retainedCollectorSourceWarning) {
    parts.push('No trusted heartbeat evidence');
  }

  if (heartbeatEvidence) {
    const heartbeatLabel =
      outputEvidence && isTimestampAfter(heartbeatEvidence.value, outputEvidence.value)
        ? 'Heartbeat fresh'
        : 'Heartbeat evidence';
    parts.push(`${heartbeatLabel} (${heartbeatEvidence.label} ${heartbeatEvidence.value})`);
  }

  appendCollectorFreshnessEvidence(
    parts,
    operation,
    collectorSnapshot,
    collectorSnapshotError,
    collectorSnapshotState,
    selectedCollectorItem,
    retainedCollectorSourceWarning
  );

  return parts.join(' · ');
}

function renderActiveQueueRunContextPreview(operation: OfficeOperation) {
  return [
    `Event · ${findFirstNonEmptyString([operation.latest_event?.summary]) ?? 'No latest event yet'}`,
    `Source · ${findFirstNonEmptyString([operation.latest_event?.source_kind]) ?? 'No latest event source'}`,
    `Freshness · ${renderTimestamp(operation.last_event_at, 'No last event timestamp')}`,
    `Heartbeat · ${renderTimestamp(operation.last_heartbeat_at, 'No heartbeat yet')}`,
    `Output · ${renderTimestamp(operation.last_meaningful_output_at, 'No last output timestamp')}`,
    `Staleness · ${renderOperationStaleness(operation)}`,
    `Reboot · ${operation.reboot_recommended ? 'Recommended' : 'No'}`
  ].join(' · ');
}

function renderDisplayState(value: string) {
  return value
    .split('_')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function renderWorkflowSummaryBucketList(
  buckets: ReadonlyArray<{
    key: string;
    count: number;
  }>,
  emptyLabel: string
) {
  return renderNamedList(
    buckets.map(({ key, count }) => `${renderDisplayState(key)} (${count})`),
    emptyLabel
  );
}

function renderWorkflowSummarySeverityList(
  severities: ReadonlyArray<{
    severity: Severity;
    count: number;
  }>
) {
  return severities.map(({ severity, count }) => `${SEVERITY_LABELS[severity]} (${count})`).join(', ');
}

function renderActiveQueueFilterScopeLabel(
  selectedOperationsState: string | null,
  selectedOperationsSeverity: Severity | null
) {
  const scopeParts: string[] = [];

  if (selectedOperationsState) {
    scopeParts.push(`${renderDisplayState(selectedOperationsState)} state`);
  }

  if (selectedOperationsSeverity) {
    scopeParts.push(`${SEVERITY_LABELS[selectedOperationsSeverity]} severity`);
  }

  return scopeParts.length > 0 ? scopeParts.join(' · ') : null;
}

function renderActiveQueueLoadingLabel(
  selectedOperationsState: string | null,
  selectedOperationsSeverity: Severity | null
) {
  const activeQueueFilterScope = renderActiveQueueFilterScopeLabel(
    selectedOperationsState,
    selectedOperationsSeverity
  );

  if (!activeQueueFilterScope) {
    return 'Loading operations queue...';
  }

  return `Loading active queue for ${activeQueueFilterScope}...`;
}

function renderActiveQueueErrorLabel(
  selectedOperationsState: string | null,
  selectedOperationsSeverity: Severity | null,
  operationsError: string
) {
  const activeQueueFilterScope = renderActiveQueueFilterScopeLabel(
    selectedOperationsState,
    selectedOperationsSeverity
  );

  if (!activeQueueFilterScope) {
    return `Unable to load active queue. ${operationsError}`;
  }

  return `Unable to load active queue for ${activeQueueFilterScope}. ${operationsError}`;
}

function renderActiveQueueWarningLabel(
  selectedOperationsState: string | null,
  selectedOperationsSeverity: Severity | null,
  operationsError: string
) {
  const activeQueueFilterScope = renderActiveQueueFilterScopeLabel(
    selectedOperationsState,
    selectedOperationsSeverity
  );

  if (!activeQueueFilterScope) {
    return `Showing last active queue snapshot. ${operationsError}`;
  }

  return `Showing last active queue snapshot for ${activeQueueFilterScope}. ${operationsError}`;
}

function renderActiveQueueEmptyLabel(
  selectedOperationsState: string | null,
  selectedOperationsSeverity: Severity | null
) {
  const activeQueueFilterScope = renderActiveQueueFilterScopeLabel(
    selectedOperationsState,
    selectedOperationsSeverity
  );

  if (!activeQueueFilterScope) {
    return 'No active operations queue.';
  }

  return `No active queue items for ${activeQueueFilterScope}.`;
}

function renderSelectedOperationLoadingLabel() {
  return 'Loading current operation...';
}

function renderSelectedOperationErrorLabel(operationsError: string) {
  return `Unable to load current operation. ${operationsError}`;
}

function renderActiveQueueAllStatesLabel({
  activeQueueStateCount
}: {
  activeQueueStateCount: number;
}) {
  return `All states (${activeQueueStateCount})`;
}

function renderActiveQueueStateOptionLabel({
  count,
  state
}: {
  count: number;
  state: string;
}) {
  return `${renderDisplayState(state)} (${count})`;
}

function renderActiveQueueAllSeveritiesLabel({
  activeQueueSeverityCount
}: {
  activeQueueSeverityCount: number;
}) {
  return `All severities (${activeQueueSeverityCount})`;
}

function renderActiveQueueSeverityOptionLabel({
  count,
  severity
}: {
  count: number;
  severity: Severity;
}) {
  return `${SEVERITY_LABELS[severity]} (${count})`;
}

function renderActiveQueueStateBucketsStatusLabel(error: string) {
  return `Showing last active queue state buckets. ${error}`;
}

function renderOpenSupervisionAlertsSeverityScopeLabel(selectedSeverity: Severity | null) {
  return selectedSeverity ? `${SEVERITY_LABELS[selectedSeverity]} severity` : null;
}

function renderOpenSupervisionAlertsLoadingLabel(selectedSeverity: Severity | null) {
  const severityScope = renderOpenSupervisionAlertsSeverityScopeLabel(selectedSeverity);
  return severityScope
    ? `Loading open supervision alerts queue at ${severityScope}...`
    : 'Loading open supervision alerts queue...';
}

function renderOpenSupervisionAlertsErrorLabel(
  selectedSeverity: Severity | null,
  openSupervisionAlertsError: string
) {
  const severityScope = renderOpenSupervisionAlertsSeverityScopeLabel(selectedSeverity);
  return severityScope
    ? `Unable to load open supervision alerts queue at ${severityScope}. ${openSupervisionAlertsError}`
    : `Unable to load open supervision alerts queue. ${openSupervisionAlertsError}`;
}

function renderOpenSupervisionAlertsWarningLabel(
  selectedSeverity: Severity | null,
  openSupervisionAlertsError: string
) {
  const severityScope = renderOpenSupervisionAlertsSeverityScopeLabel(selectedSeverity);
  return severityScope
    ? `Showing last open supervision alerts queue snapshot at ${severityScope}. ${openSupervisionAlertsError}`
    : `Showing last open supervision alerts queue snapshot. ${openSupervisionAlertsError}`;
}

function renderOpenSupervisionAlertsEmptyLabel(selectedSeverity: Severity | null) {
  const severityScope = renderOpenSupervisionAlertsSeverityScopeLabel(selectedSeverity);
  return severityScope
    ? `No open supervision alerts at ${severityScope} in crew overview queue.`
    : 'No open supervision alerts in crew overview queue.';
}

function renderSelectedAgentSupervisionHistorySeverityScopeLabel(selectedSeverity: Severity | null) {
  return selectedSeverity ? `${SEVERITY_LABELS[selectedSeverity]} severity` : null;
}

function renderSelectedAgentSupervisionHistoryLoadingLabel(selectedSeverity: Severity | null) {
  const severityScope = renderSelectedAgentSupervisionHistorySeverityScopeLabel(selectedSeverity);
  return severityScope ? `Loading supervision history at ${severityScope}...` : 'Loading supervision history...';
}

function renderSelectedAgentSupervisionHistoryErrorLabel(
  selectedSeverity: Severity | null,
  supervisionHistoryError: string
) {
  const severityScope = renderSelectedAgentSupervisionHistorySeverityScopeLabel(selectedSeverity);
  return severityScope
    ? `Unable to load supervision history at ${severityScope}. ${supervisionHistoryError}`
    : `Unable to load supervision history. ${supervisionHistoryError}`;
}

function renderSelectedAgentSupervisionHistoryWarningLabel(
  selectedSeverity: Severity | null,
  supervisionHistoryError: string
) {
  const severityScope = renderSelectedAgentSupervisionHistorySeverityScopeLabel(selectedSeverity);
  return severityScope
    ? `Showing last supervision history at ${severityScope}. ${supervisionHistoryError}`
    : `Showing last supervision history. ${supervisionHistoryError}`;
}

function renderSelectedAgentSupervisionHistoryEmptyLabel(selectedSeverity: Severity | null) {
  const severityScope = renderSelectedAgentSupervisionHistorySeverityScopeLabel(selectedSeverity);
  return severityScope
    ? `No recent supervision history at ${severityScope}.`
    : 'No recent supervision history.';
}

function renderActiveCorrelationQueueScopeLabel({
  correlationId,
  matchedCount,
  participantCount
}: {
  correlationId: string;
  matchedCount: number;
  participantCount: number;
}) {
  return `Scope · ${correlationId} · ${matchedCount} of ${participantCount} participants in current active queue snapshot`;
}

function renderActiveCorrelationQueueLoadingLabel(correlationId: string) {
  return `Loading active-correlation queue lane for ${correlationId}...`;
}

function renderActiveCorrelationQueueErrorLabel(correlationId: string, operationsError: string) {
  return `Unable to load active-correlation queue lane for ${correlationId}. ${operationsError}`;
}

function renderActiveCorrelationQueueWarningLabel(correlationId: string, operationsError: string) {
  return `Showing last active-correlation queue lane snapshot for ${correlationId}. ${operationsError}`;
}

function renderActiveCorrelationQueueEmptyLabel(correlationId: string) {
  return `No active-correlation queue items for ${correlationId} in current active queue snapshot.`;
}

function renderOperationsQueueRecord({
  operation,
  activeCorrelationId,
  pivotCorrelationId,
  queueScopeLabel,
  domIdPrefix,
  navigableAgentIds,
  sharedMemoryArtifactRefs,
  onJumpToSharedMemoryArtifact,
  allowExactSharedMemoryFallback,
  onSelectAgent,
  onSelectCorrelation,
  onSelectOperation,
  preserveActiveCorrelationOnSelect = false
}: {
  operation: OfficeOperation;
  activeCorrelationId: string | null;
  pivotCorrelationId: string | null;
  queueScopeLabel: string;
  domIdPrefix: string;
  navigableAgentIds: Set<string>;
  sharedMemoryArtifactRefs: ReadonlySet<string>;
  onJumpToSharedMemoryArtifact: (artifactRef: string) => void;
  allowExactSharedMemoryFallback: boolean;
  onSelectAgent: SelectAgentHandler;
  onSelectCorrelation: SelectCorrelationHandler;
  onSelectOperation: (operation: OfficeOperation, options?: SelectOperationOptions) => void;
  preserveActiveCorrelationOnSelect?: boolean;
}) {
  const queueStatusId = `aitown-${domIdPrefix}-status-${operation.agent_id}`;
  const queuePreviewId = `aitown-${domIdPrefix}-preview-${operation.agent_id}`;
  const latestEventActorId = operation.latest_event?.actor_id ?? null;
  const canNavigateToLatestEventActor = Boolean(
    latestEventActorId && latestEventActorId !== operation.agent_id && navigableAgentIds.has(latestEventActorId)
  );

  const handleSelectOperation = () => {
    if (preserveActiveCorrelationOnSelect) {
      onSelectOperation(operation, { preserveActiveCorrelation: true });
      return;
    }

    onSelectOperation(operation);
  };

  return (
    <li key={operation.agent_id} className="aitown-queue-record">
      <button
        type="button"
        className={`aitown-roster__button aitown-queue-record__button severity-${operation.effective_severity}`}
        aria-label={`Inspect ${operation.display_name} from ${queueScopeLabel}`}
        aria-describedby={`${queueStatusId} ${queuePreviewId}`}
        onClick={handleSelectOperation}
      >
        <strong>{operation.display_name}</strong>
        <span id={queueStatusId} className="aitown-queue-record__status">{`${operation.current_state} · ${operation.current_blocker || operation.active_task}`}</span>
        <span id={queuePreviewId} className="aitown-queue-record__preview">
          {renderActiveQueueRunContextPreview(operation)}
        </span>
      </button>
      <span className="aitown-queue-record__meta">
        Correlation ·{' '}
        {renderCorrelationButton({
          correlationId: operation.correlation_id,
          label: operation.correlation_id ?? 'No correlation id',
          buttonLabel: `Open ${queueScopeLabel} correlation`,
          activeCorrelationId,
          preserveAutoOnDefaultReselect: true,
          onSelectCorrelation
        })}
      </span>
      <span className="aitown-queue-record__meta">
        Actor ·{' '}
        {canNavigateToLatestEventActor && latestEventActorId
          ? renderAgentPivotButton({
              agentId: latestEventActorId,
              ariaLabel: `Select ${queueScopeLabel} actor from operation ${operation.agent_id} ${latestEventActorId}`,
              correlationId: pivotCorrelationId,
              onSelectAgent
            })
          : (latestEventActorId ?? 'No actor')}
      </span>
      <span className="aitown-queue-record__meta">
        Counterparties ·{' '}
        {renderAgentPivotList({
          agentIds: operation.latest_event?.counterparty_agent_ids ?? [],
          currentAgentId: operation.agent_id,
          navigableAgentIds,
          emptyLabel: 'No counterparties',
          ariaLabelPrefix: `Select ${queueScopeLabel} counterparty agent from operation ${operation.agent_id}`,
          correlationId: pivotCorrelationId,
          onSelectAgent
        })}
      </span>
      <span className="aitown-queue-record__meta">
        Evidence ·{' '}
        {renderSharedMemoryEvidenceRefs({
          evidenceRefs: operation.latest_event?.evidence_refs ?? [],
          sharedMemoryArtifactRefs,
          onJump: onJumpToSharedMemoryArtifact,
          allowExactFallback: allowExactSharedMemoryFallback
        })}
      </span>
    </li>
  );
}

function renderWorkflowLoadingLabel() {
  return 'Loading workflow...';
}

function renderWorkflowErrorLabel(workflowError: string) {
  return `Unable to load workflow. ${workflowError}`;
}

function renderWorkflowWarningLabel(workflowError: string) {
  return `Showing last workflow snapshot. ${workflowError}`;
}

function selectLatestWorkspaceObservation(workspaceObservations: CollectorWorkspaceObservation[]) {
  return workspaceObservations
    .filter((observation) => observation.kind === 'workspace_file')
    .reduce<CollectorWorkspaceObservation | null>(
      (latestObservation, observation) =>
        !latestObservation || observation.last_modified_at.localeCompare(latestObservation.last_modified_at) > 0
          ? observation
          : latestObservation,
      null
    );
}

function renderWorkspaceObservationPreview(observation: CollectorWorkspaceObservation) {
  return `${observation.file_name} · ${observation.last_modified_at}`;
}

function selectLatestTmuxObservation(tmuxObservations: CollectorTmuxObservation[]) {
  return tmuxObservations
    .filter((observation) => Boolean(observation.pane_activity_at))
    .reduce<CollectorTmuxObservation | null>((latestObservation, observation) => {
      if (!latestObservation) {
        return observation;
      }

      return observation.pane_activity_at!.localeCompare(latestObservation.pane_activity_at!) > 0
        ? observation
        : latestObservation;
    }, null);
}

function renderTmuxObservationPreview(observation: CollectorTmuxObservation) {
  const paneLabel = observation.session_name
    ? `${observation.session_name} ${observation.window_index}:${observation.pane_index}`
    : `${observation.window_index}:${observation.pane_index}`;
  const previewLabel = findFirstNonEmptyString([observation.pane_current_command, observation.pane_title, paneLabel]) ?? paneLabel;

  return observation.pane_activity_at ? `${previewLabel} · ${observation.pane_activity_at}` : previewLabel;
}

function normalizeCollectorTmuxCoordinate(value: string | null | undefined) {
  const normalized = `${value ?? ''}`.trim();
  return normalized && normalized !== 'null' && normalized !== 'undefined' ? normalized : null;
}

function isValidCollectorTmuxArtifactRef(ref: string | null | undefined) {
  if (typeof ref !== 'string' || !ref.startsWith('tmux://')) {
    return false;
  }

  const coordinateMatch = ref.match(/^tmux:\/\/.+\/([^/.]+)\.([^/.]+)$/);
  if (!coordinateMatch) {
    return true;
  }

  const [, windowIndex, paneIndex] = coordinateMatch;
  return windowIndex !== 'null' && windowIndex !== 'undefined' && paneIndex !== 'null' && paneIndex !== 'undefined';
}

function deriveCollectorTmuxArtifactRef(item: CollectorItem, observation: CollectorTmuxObservation | null) {
  const stableTmuxRefs = item.evidence_refs.filter((ref) => isValidCollectorTmuxArtifactRef(ref));

  if (observation) {
    const windowIndex = normalizeCollectorTmuxCoordinate(observation.window_index);
    const paneIndex = normalizeCollectorTmuxCoordinate(observation.pane_index);

    if (windowIndex && paneIndex) {
      const candidateSessionRefs = [item.session_ref, observation.session_name].filter(
        (value, index, values): value is string => Boolean(value) && values.indexOf(value) === index
      );

      for (const sessionRef of candidateSessionRefs) {
        const exactRef = `tmux://${sessionRef}/${windowIndex}.${paneIndex}`;
        const stableRef = stableTmuxRefs.find((ref) => ref === exactRef);
        if (stableRef) {
          return stableRef;
        }
      }

      if (candidateSessionRefs.length > 0) {
        return `tmux://${candidateSessionRefs[0]}/${windowIndex}.${paneIndex}`;
      }
    }

    if (stableTmuxRefs.length === 1) {
      return stableTmuxRefs[0] ?? null;
    }

    if (observation.pane_id) {
      const paneIdRef = `tmux://${observation.pane_id}`;
      return stableTmuxRefs.find((ref) => ref === paneIdRef) ?? paneIdRef;
    }

    return null;
  }

  return stableTmuxRefs.length === 1 ? stableTmuxRefs[0] ?? null : null;
}

function renderCollectorProvenancePreview({
  item,
  sharedMemoryArtifactRefs,
  onJump
}: {
  item: CollectorItem;
  sharedMemoryArtifactRefs: ReadonlySet<string>;
  onJump: (artifactRef: string) => void;
}) {
  const latestWorkspaceObservation = selectLatestWorkspaceObservation(item.workspace_observations);
  const latestTmuxObservation = selectLatestTmuxObservation(item.tmux_observations);
  const workspacePreviewLabel = latestWorkspaceObservation ? renderWorkspaceObservationPreview(latestWorkspaceObservation) : 'None';
  const tmuxPreviewLabel = latestTmuxObservation ? renderTmuxObservationPreview(latestTmuxObservation) : 'None';
  const tmuxArtifactRef = deriveCollectorTmuxArtifactRef(item, latestTmuxObservation);

  return (
    <>
      <span>{`Confidence · ${renderDisplayState(item.heartbeat.confidence_level)}`}</span>
      <span>{`Last output · ${item.heartbeat.last_meaningful_output_at ?? 'None'}`}</span>
      <span>{`Last file write · ${item.heartbeat.last_file_write_at ?? 'None'}`}</span>
      <span>
        Workspace preview ·{' '}
        {latestWorkspaceObservation
          ? renderSharedMemoryArtifactJump({
              artifactRef: latestWorkspaceObservation.path,
              label: workspacePreviewLabel,
              sharedMemoryArtifactRefs,
              onJump,
              ariaLabelSuffix: workspacePreviewLabel,
              allowExactFallback: true
            })
          : 'None'}
      </span>
      <span>
        Tmux preview ·{' '}
        {latestTmuxObservation && tmuxArtifactRef
          ? renderSharedMemoryArtifactJump({
              artifactRef: tmuxArtifactRef,
              label: tmuxPreviewLabel,
              sharedMemoryArtifactRefs,
              onJump,
              ariaLabelSuffix: tmuxPreviewLabel,
              allowExactFallback: true
            })
          : tmuxPreviewLabel}
      </span>
    </>
  );
}

function renderCorrelationInteraction({
  interaction,
  activeCorrelationId = null,
  currentAgentId,
  navigableAgentIds,
  onSelectAgent,
  onSelectCorrelation,
  sharedMemoryArtifactRefs,
  enableSharedMemoryEvidenceJump = false,
  onFocusSharedMemoryArtifact,
  participantAriaLabelPrefix = 'Select correlation interaction participant agent',
  publicEvidenceLabels = false
}: {
  interaction: WorkflowInteraction;
  activeCorrelationId?: string | null;
  currentAgentId?: string | null;
  navigableAgentIds?: Set<string>;
  onSelectAgent?: (agentId: string | null, correlationId?: string | null) => void;
  onSelectCorrelation?: (correlationId: string | null) => void;
  sharedMemoryArtifactRefs?: ReadonlySet<string>;
  enableSharedMemoryEvidenceJump?: boolean;
  onFocusSharedMemoryArtifact?: (artifactRef: string, scope?: SharedMemoryJumpScope) => void;
  participantAriaLabelPrefix?: string;
  publicEvidenceLabels?: boolean;
}) {
  const canRenderParticipantPivots = Boolean(navigableAgentIds && onSelectAgent);
  const interactionCorrelationId = findFirstNonEmptyString([interaction.correlation_id]);
  const { onJump, allowExactFallback } = resolveSharedMemoryEvidenceJumpBehavior(onFocusSharedMemoryArtifact);
  const evidenceLabelFormatters = publicEvidenceLabels
    ? {
        formatLabel: formatPublicEvidenceRefLabel,
        formatAriaLabel: formatPublicEvidenceRefAriaLabel
      }
    : {};
  const stateTransition =
    interaction.before_state && interaction.after_state
      ? `${interaction.before_state} -> ${interaction.after_state}`
      : interaction.before_state ?? interaction.after_state ?? null;
  const sourceKind = findFirstNonEmptyString([interaction.source_kind]);
  const triggerEventId = interaction.trigger_event_id.trim();
  const relatedEventIds = (interaction.related_event_ids ?? [])
    .map((eventId) => eventId.trim())
    .filter((eventId) => eventId.length > 0 && eventId !== triggerEventId);

  return (
    <li key={interaction.interaction_id} className={`aitown-record severity-${interaction.severity ?? 'normal'}`}>
      <strong>{interaction.summary}</strong>
      <span>{`Interaction · ${interaction.interaction_type}`}</span>
      <span>{`Started · ${interaction.started_at}`}</span>
      {interaction.ended_at ? <span>{`Ended · ${interaction.ended_at}`}</span> : null}
      <span>{`Trigger · ${interaction.trigger_event_id}`}</span>
      {sourceKind ? <span>{`Source · ${sourceKind}`}</span> : null}
      {relatedEventIds.length > 0 ? <span>{`Related events · ${relatedEventIds.join(', ')}`}</span> : null}
      {stateTransition ? <span>{`State · ${stateTransition}`}</span> : null}
      <span>
        Participants ·{' '}
        {canRenderParticipantPivots && navigableAgentIds && onSelectAgent
          ? renderAgentPivotList({
              agentIds: interaction.participant_agent_ids,
              currentAgentId: currentAgentId ?? null,
              navigableAgentIds,
              emptyLabel: 'No participants',
              ariaLabelPrefix: participantAriaLabelPrefix,
              correlationId: activeCorrelationId ?? interaction.correlation_id,
              onSelectAgent
            })
          : renderParticipants(interaction.participant_agent_ids)}
      </span>
      <span>
        Correlation ·{' '}
        {onSelectCorrelation
          ? renderCorrelationButton({
              correlationId: interactionCorrelationId,
              label: interactionCorrelationId ?? 'No correlation id',
              buttonLabel: `Open workflow interaction correlation from interaction ${interaction.interaction_id}`,
              activeCorrelationId,
              onSelectCorrelation
            })
          : interactionCorrelationId ?? 'No correlation id'}
      </span>
      {interaction.severity ? <span>{`Severity · ${SEVERITY_LABELS[interaction.severity]}`}</span> : null}
      {enableSharedMemoryEvidenceJump && sharedMemoryArtifactRefs ? (
        <span>
          Evidence ·{' '}
          {renderSharedMemoryEvidenceRefs({
            evidenceRefs: interaction.evidence_refs,
            sharedMemoryArtifactRefs,
            onJump,
            allowExactFallback,
            ...evidenceLabelFormatters
          })}
        </span>
      ) : (
        <span>{`Evidence · ${renderEvidenceRefs(interaction.evidence_refs)}`}</span>
      )}
    </li>
  );
}

function renderCorrelationTimelineEvent(
  input:
    | WorkflowTimelineEvent
    | {
        event: WorkflowTimelineEvent;
        activeCorrelationId?: string | null;
        currentAgentId?: string | null;
        navigableAgentIds?: Set<string>;
        onSelectAgent?: (agentId: string | null, correlationId?: string | null) => void;
        sharedMemoryArtifactRefs?: ReadonlySet<string>;
        enableSharedMemoryEvidenceJump?: boolean;
        onFocusSharedMemoryArtifact?: (artifactRef: string, scope?: SharedMemoryJumpScope) => void;
        subjectPivotAriaLabelPrefix?: string;
        actorPivotAriaLabelPrefix?: string;
        counterpartyPivotAriaLabelPrefix?: string;
        publicEvidenceLabels?: boolean;
      }
) {
  const event = 'event' in input ? input.event : input;
  const activeCorrelationId = 'event' in input ? (input.activeCorrelationId ?? null) : null;
  const currentAgentId = 'event' in input ? (input.currentAgentId ?? null) : null;
  const navigableAgentIds = 'event' in input ? input.navigableAgentIds : undefined;
  const onSelectAgent = 'event' in input ? input.onSelectAgent : undefined;
  const sharedMemoryArtifactRefs = 'event' in input ? input.sharedMemoryArtifactRefs : undefined;
  const enableSharedMemoryEvidenceJump = 'event' in input ? (input.enableSharedMemoryEvidenceJump ?? false) : false;
  const onFocusSharedMemoryArtifact = 'event' in input ? input.onFocusSharedMemoryArtifact : undefined;
  const subjectPivotAriaLabelPrefix =
    'event' in input
      ? (input.subjectPivotAriaLabelPrefix ?? 'Select correlation timeline subject agent from event')
      : 'Select correlation timeline subject agent from event';
  const actorPivotAriaLabelPrefix =
    'event' in input ? (input.actorPivotAriaLabelPrefix ?? 'Select correlation timeline actor from event') : 'Select correlation timeline actor from event';
  const counterpartyPivotAriaLabelPrefix =
    'event' in input ? (input.counterpartyPivotAriaLabelPrefix ?? 'Select correlation timeline counterparty agent') : 'Select correlation timeline counterparty agent';
  const preservedCorrelationId = activeCorrelationId ?? event.correlation_id;
  const canRenderCounterpartyPivots = Boolean(navigableAgentIds && onSelectAgent);
  const canRenderSubjectPivot = Boolean(
    navigableAgentIds && onSelectAgent && event.agent_id !== currentAgentId && navigableAgentIds.has(event.agent_id)
  );
  const canRenderActorPivot = Boolean(
    navigableAgentIds && onSelectAgent && event.actor_id !== currentAgentId && navigableAgentIds.has(event.actor_id)
  );
  const { onJump, allowExactFallback } = resolveSharedMemoryEvidenceJumpBehavior(onFocusSharedMemoryArtifact);
  const publicEvidenceLabels = 'event' in input ? (input.publicEvidenceLabels ?? false) : false;
  const evidenceLabelFormatters = publicEvidenceLabels
    ? {
        formatLabel: formatPublicEvidenceRefLabel,
        formatAriaLabel: formatPublicEvidenceRefAriaLabel
      }
    : {};

  return (
    <li key={event.event_id} className={`aitown-record severity-${event.severity}`}>
      <strong>{event.summary}</strong>
      <span>{`Event id · ${event.event_id}`}</span>
      <span>{`At · ${renderTimestamp(event.ts, 'No event timestamp')}`}</span>
      <span>
        Subject ·{' '}
        {canRenderSubjectPivot && onSelectAgent
          ? renderAgentPivotButton({
              agentId: event.agent_id,
              ariaLabel: `${subjectPivotAriaLabelPrefix} ${event.event_id} ${event.agent_id}`,
              correlationId: preservedCorrelationId,
              onSelectAgent
            })
          : event.agent_id}
      </span>
      <span>
        Actor ·{' '}
        {canRenderActorPivot && onSelectAgent
          ? renderAgentPivotButton({
              agentId: event.actor_id,
              ariaLabel: `${actorPivotAriaLabelPrefix} ${event.event_id} ${event.actor_id}`,
              correlationId: preservedCorrelationId,
              onSelectAgent
            })
          : event.actor_id}
      </span>
      <span>{`Timeline · ${event.event_type} · ${event.location}`}</span>
      <span>{`State · ${event.current_state}`}</span>
      <span>{`Severity · ${SEVERITY_LABELS[event.severity]}`}</span>
      <span>
        Counterparties ·{' '}
        {canRenderCounterpartyPivots && navigableAgentIds && onSelectAgent
          ? renderAgentPivotList({
              agentIds: event.counterparty_agent_ids,
              currentAgentId,
              navigableAgentIds,
              emptyLabel: 'No counterparties',
              ariaLabelPrefix: counterpartyPivotAriaLabelPrefix,
              correlationId: preservedCorrelationId,
              onSelectAgent
            })
          : renderCounterparties(event.counterparty_agent_ids)}
      </span>
      {enableSharedMemoryEvidenceJump && sharedMemoryArtifactRefs ? (
        <span>
          Evidence ·{' '}
          {renderSharedMemoryEvidenceRefs({
            evidenceRefs: event.evidence_refs,
            sharedMemoryArtifactRefs,
            onJump,
            allowExactFallback,
            ...evidenceLabelFormatters
          })}
        </span>
      ) : (
        <span>{`Evidence · ${renderEvidenceRefs(event.evidence_refs)}`}</span>
      )}
      <span>{`Source · ${event.source_kind}`}</span>
    </li>
  );
}

function renderReplayTimelineEvent({
  event,
  activeCorrelationId,
  agentLabel,
  currentAgentId,
  navigableAgentIds,
  zoneLabelById,
  sharedMemoryArtifactRefs,
  onFocusSharedMemoryArtifact,
  onFocusWorldZone,
  onSelectAgent,
  onSelectCorrelation
}: {
  event: WorkflowTimelineEvent;
  activeCorrelationId: string | null;
  agentLabel: string;
  currentAgentId: string | null;
  navigableAgentIds: Set<string>;
  zoneLabelById: ReadonlyMap<string, string>;
  sharedMemoryArtifactRefs: ReadonlySet<string>;
  onFocusSharedMemoryArtifact?: (artifactRef: string, scope?: SharedMemoryJumpScope) => void;
  onFocusWorldZone?: (zoneId: string) => void;
  onSelectAgent: SelectAgentHandler;
  onSelectCorrelation: SelectCorrelationHandler;
}) {
  const canNavigateToAgent = event.agent_id !== currentAgentId && navigableAgentIds.has(event.agent_id);
  const preservedCorrelationId = activeCorrelationId ?? event.correlation_id;
  const canNavigateToActor = event.actor_id !== currentAgentId && navigableAgentIds.has(event.actor_id);
  const currentReplayAgentId = currentAgentId ?? event.agent_id;
  const zoneLabel = zoneLabelById.get(event.location);
  const { onJump, allowExactFallback } = resolveSharedMemoryEvidenceJumpBehavior(onFocusSharedMemoryArtifact);

  return (
    <li key={event.event_id} className={`aitown-record severity-${event.severity}`}>
      <strong>{event.summary}</strong>
      <span>{`Event id · ${event.event_id}`}</span>
      <span>{`At · ${renderTimestamp(event.ts, 'No event timestamp')}`}</span>
      <span>
        Actor ·{' '}
        {canNavigateToActor
          ? renderAgentPivotButton({
              agentId: event.actor_id,
              ariaLabel: `Select replay actor from event ${event.event_id} ${event.actor_id}`,
              correlationId: preservedCorrelationId,
              onSelectAgent
            })
          : event.actor_id}
      </span>
      <span>{`Event type · ${event.event_type}`}</span>
      <span>
        Location ·{' '}
        {zoneLabel && onFocusWorldZone ? (
          <button
            type="button"
            className="aitown-link-button"
            aria-label={`Focus ${zoneLabel} in world viewport from replay event ${event.event_id}`}
            onClick={() => onFocusWorldZone(event.location)}
          >
            {zoneLabel}
          </button>
        ) : (
          event.location
        )}
      </span>
      <span>{`State · ${event.current_state}`}</span>
      <span>{`Severity · ${SEVERITY_LABELS[event.severity]}`}</span>
      <span>
        Counterparties ·{' '}
        {renderAgentPivotList({
          agentIds: event.counterparty_agent_ids,
          currentAgentId: currentReplayAgentId,
          navigableAgentIds,
          emptyLabel: 'No counterparties',
          ariaLabelPrefix: `Select replay counterparty from event ${event.event_id}`,
          correlationId: preservedCorrelationId,
          onSelectAgent
        })}
      </span>
      <span>
        Evidence ·{' '}
        {renderSharedMemoryEvidenceRefs({
          evidenceRefs: event.evidence_refs,
          sharedMemoryArtifactRefs,
          onJump,
          allowExactFallback
        })}
      </span>
      <span>{`Source · ${event.source_kind}`}</span>
      {event.correlation_id ? (
        <span>
          Correlation pivot ·{' '}
          {renderCorrelationButton({
            correlationId: event.correlation_id,
            label: event.correlation_id,
            buttonLabel: 'Open replay correlation',
            activeCorrelationId,
            preserveAutoOnDefaultReselect: true,
            onSelectCorrelation
          })}
        </span>
      ) : null}
      <span>
        Agent pivot ·{' '}
        {canNavigateToAgent
          ? renderAgentPivotButton({
              agentId: event.agent_id,
              label: agentLabel,
              ariaLabel: `Select replay agent ${event.agent_id} from event ${event.event_id}`,
              correlationId: preservedCorrelationId,
              onSelectAgent
            })
          : agentLabel}
      </span>
    </li>
  );
}

function renderCrewReplayLoadingLabel(scopedReplayCorrelationId: string | null, selectedSeverity: Severity | null) {
  if (scopedReplayCorrelationId && selectedSeverity) {
    return `Loading timeline replay for ${scopedReplayCorrelationId} at ${SEVERITY_LABELS[selectedSeverity]} severity...`;
  }
  if (scopedReplayCorrelationId) {
    return 'Loading scoped timeline replay...';
  }
  if (selectedSeverity) {
    return `Loading timeline replay at ${SEVERITY_LABELS[selectedSeverity]} severity...`;
  }
  return 'Loading timeline replay...';
}

function renderCrewReplayEmptyLabel(scopedReplayCorrelationId: string | null, selectedSeverity: Severity | null) {
  if (scopedReplayCorrelationId && selectedSeverity) {
    return `No replay events for ${scopedReplayCorrelationId} at ${SEVERITY_LABELS[selectedSeverity]} severity.`;
  }
  if (scopedReplayCorrelationId) {
    return `No replay events for ${scopedReplayCorrelationId}.`;
  }
  if (selectedSeverity) {
    return `No replay events at ${SEVERITY_LABELS[selectedSeverity]} severity.`;
  }
  return 'No recent replay events.';
}

function renderCrewReplayInitialErrorLabel(
  scopedReplayCorrelationId: string | null,
  selectedSeverity: Severity | null,
  timelineReplayError: string | null
) {
  const errorLabel = timelineReplayError ?? 'Timeline replay unavailable.';
  if (scopedReplayCorrelationId && selectedSeverity) {
    return `Unable to load timeline replay for ${scopedReplayCorrelationId} at ${SEVERITY_LABELS[selectedSeverity]} severity. ${errorLabel}`;
  }
  if (scopedReplayCorrelationId) {
    return `Scoped replay unavailable. ${errorLabel}`;
  }
  if (selectedSeverity) {
    return `Unable to load timeline replay at ${SEVERITY_LABELS[selectedSeverity]} severity. ${errorLabel}`;
  }
  return errorLabel;
}

function renderCrewReplayDegradedErrorLabel(
  scopedReplayCorrelationId: string | null,
  selectedSeverity: Severity | null,
  timelineReplayError: string | null
) {
  const errorLabel = timelineReplayError ?? 'Timeline replay unavailable.';
  if (scopedReplayCorrelationId && selectedSeverity) {
    return `Showing last timeline replay snapshot for ${scopedReplayCorrelationId} at ${SEVERITY_LABELS[selectedSeverity]} severity. ${errorLabel}`;
  }
  if (scopedReplayCorrelationId) {
    return `Scoped replay unavailable. ${errorLabel}`;
  }
  if (selectedSeverity) {
    return `Showing last timeline replay snapshot at ${SEVERITY_LABELS[selectedSeverity]} severity. ${errorLabel}`;
  }
  return errorLabel;
}

function renderSelectedAgentReplayLoadingLabel(
  scopedReplayCorrelationId: string | null,
  selectedSeverity: Severity | null
) {
  if (scopedReplayCorrelationId && selectedSeverity) {
    return `Loading timeline replay for ${scopedReplayCorrelationId} at ${SEVERITY_LABELS[selectedSeverity]} severity...`;
  }
  if (scopedReplayCorrelationId) {
    return 'Loading scoped timeline replay...';
  }
  if (selectedSeverity) {
    return `Loading selected-agent timeline replay at ${SEVERITY_LABELS[selectedSeverity]} severity...`;
  }
  return 'Loading selected-agent timeline replay...';
}

function renderSelectedAgentReplayEmptyLabel(
  scopedReplayCorrelationId: string | null,
  selectedSeverity: Severity | null
) {
  if (scopedReplayCorrelationId && selectedSeverity) {
    return `No replay events for ${scopedReplayCorrelationId} at ${SEVERITY_LABELS[selectedSeverity]} severity.`;
  }
  if (scopedReplayCorrelationId) {
    return `No replay events for ${scopedReplayCorrelationId}.`;
  }
  if (selectedSeverity) {
    return `No selected-agent replay events at ${SEVERITY_LABELS[selectedSeverity]} severity.`;
  }
  return 'No recent replay events.';
}

function renderSelectedAgentReplayInitialErrorLabel(
  scopedReplayCorrelationId: string | null,
  selectedSeverity: Severity | null,
  timelineReplayError: string | null
) {
  const errorLabel = timelineReplayError ?? 'Timeline replay unavailable.';
  if (scopedReplayCorrelationId && selectedSeverity) {
    return `Unable to load timeline replay for ${scopedReplayCorrelationId} at ${SEVERITY_LABELS[selectedSeverity]} severity. ${errorLabel}`;
  }
  if (scopedReplayCorrelationId) {
    return `Scoped replay unavailable. ${errorLabel}`;
  }
  if (selectedSeverity) {
    return `Unable to load selected-agent timeline replay at ${SEVERITY_LABELS[selectedSeverity]} severity. ${errorLabel}`;
  }
  return `Unable to load timeline replay. ${errorLabel}`;
}

function renderSelectedAgentReplayDegradedErrorLabel(
  scopedReplayCorrelationId: string | null,
  selectedSeverity: Severity | null,
  timelineReplayError: string | null
) {
  const errorLabel = timelineReplayError ?? 'Timeline replay unavailable.';
  if (scopedReplayCorrelationId && selectedSeverity) {
    return `Showing last timeline replay snapshot for ${scopedReplayCorrelationId} at ${SEVERITY_LABELS[selectedSeverity]} severity. ${errorLabel}`;
  }
  if (scopedReplayCorrelationId) {
    return `Scoped replay unavailable. ${errorLabel}`;
  }
  if (selectedSeverity) {
    return `Showing last selected-agent timeline replay snapshot at ${SEVERITY_LABELS[selectedSeverity]} severity. ${errorLabel}`;
  }
  return `Showing last timeline replay snapshot. ${errorLabel}`;
}

function renderReplayCheckpointLoadingLabel(eventId: string) {
  return `Loading replay checkpoint ${eventId}...`;
}

function renderReplayCheckpointEmptyLabel(eventId: string) {
  return `No replay checkpoint event found for ${eventId}.`;
}

function renderReplayCheckpointInitialErrorLabel(eventId: string, timelineReplayError: string | null) {
  return `Unable to load replay checkpoint ${eventId}. ${timelineReplayError ?? 'Timeline replay unavailable.'}`;
}

function renderReplayCheckpointDegradedErrorLabel(eventId: string, timelineReplayError: string | null) {
  return `Showing last replay checkpoint ${eventId} snapshot. ${timelineReplayError ?? 'Timeline replay unavailable.'}`;
}

type ReplaySummaryBucket = {
  key: string;
  count: number;
};

type ReplaySummarySeverityBucket = {
  severity: Severity;
  count: number;
};

type ReplaySummaryFacets = {
  eventCount: number;
  eventTypes: ReplaySummaryBucket[];
  severities: ReplaySummarySeverityBucket[];
  latestActivityAt: string | null;
};

const REPLAY_SUMMARY_SEVERITY_ORDER: Severity[] = ['red', 'orange', 'yellow', 'normal'];

function selectReplaySummaryFacets(events: ReadonlyArray<WorkflowTimelineEvent>): ReplaySummaryFacets {
  const eventTypeBuckets = new Map<string, number>();
  const severityBuckets: Record<Severity, number> = { ...EMPTY_SEVERITY_BUCKETS };
  let latestActivityAt: string | null = null;

  events.forEach((event) => {
    eventTypeBuckets.set(event.event_type, (eventTypeBuckets.get(event.event_type) ?? 0) + 1);
    severityBuckets[event.severity] += 1;
    latestActivityAt = latestActivityAt && latestActivityAt > event.ts ? latestActivityAt : event.ts;
  });

  return {
    eventCount: events.length,
    eventTypes: Array.from(eventTypeBuckets, ([key, count]) => ({ key, count })).sort(compareReplaySummaryBuckets),
    severities: REPLAY_SUMMARY_SEVERITY_ORDER.map((severity) => ({
      severity,
      count: severityBuckets[severity]
    })),
    latestActivityAt
  };
}

function compareReplaySummaryBuckets(left: ReplaySummaryBucket, right: ReplaySummaryBucket) {
  const countDelta = right.count - left.count;
  if (countDelta !== 0) {
    return countDelta;
  }

  return left.key.localeCompare(right.key);
}

function renderReplaySummaryBucketList(buckets: ReadonlyArray<ReplaySummaryBucket>, emptyLabel: string) {
  return renderNamedList(
    buckets.map(({ key, count }) => `${renderDisplayState(key)} (${count})`),
    emptyLabel
  );
}

function renderReplaySummaryFacets(facets: ReplaySummaryFacets) {
  return (
    <li className="aitown-record">
      <strong>Replay summary</strong>
      <span>{`Counts · ${facets.eventCount} events`}</span>
      <span>{`Event types · ${renderReplaySummaryBucketList(facets.eventTypes, 'No event types in current replay window')}`}</span>
      <span>{`Severities · ${renderWorkflowSummarySeverityList(facets.severities)}`}</span>
      <span>{`Latest activity · ${renderTimestamp(facets.latestActivityAt, 'No activity in current replay window')}`}</span>
    </li>
  );
}

function renderReplayBundleSourceKindCounts(sourceKindBuckets: Record<string, number>) {
  const sourceKindCounts = Object.entries(sourceKindBuckets)
    .filter(([, count]) => count > 0)
    .map(([sourceKind, count]) => `${sourceKind} (${count})`);

  return renderNamedList(sourceKindCounts, 'No source-kind counts');
}

function renderReplayBundleQueryAnchors(bundle: AccountabilityReplayBundle) {
  const anchors = dedupeNonEmptyStrings([
    bundle.query.agent_id ? `agent_id ${formatBoundedEvidenceLedgerToken(bundle.query.agent_id)}` : null,
    bundle.query.correlation_id
      ? `correlation_id ${formatBoundedEvidenceLedgerToken(bundle.query.correlation_id)}`
      : null,
    bundle.query.event_id ? `event_id ${formatBoundedEvidenceLedgerToken(bundle.query.event_id)}` : null,
    bundle.query.evidence_id ? `evidence_id ${formatBoundedEvidenceLedgerToken(bundle.query.evidence_id)}` : null,
    bundle.query.evidence_ref ? `evidence_ref ${formatEvidenceLedgerRef(bundle.query.evidence_ref)}` : null
  ]);

  return renderNamedList(anchors, 'No query anchors');
}

function renderReplayProofLadder(replayBundle: AccountabilityReplayBundle) {
  const verdict = deriveAccountabilityReplayAuditVerdict(replayBundle);
  const { counts } = verdict;
  const unavailableAnchorCount =
    counts.collector_observation_without_event_id_row_count + counts.unsupported_unbacked_row_count;
  const replayableLabel =
    verdict.status === 'empty' ? 'unavailable' : verdict.replayable ? 'full' : 'partial';

  return (
    <li className="aitown-record">
      <strong>Replay Proof Ladder</strong>
      <span>{`Verdict · ${verdict.status}`}</span>
      <span>
        {`Rows · ${counts.ledger_row_count} total · ${counts.replayable_row_count} replayable · ${counts.collector_observation_without_event_id_row_count} collector-only gaps · ${counts.unsupported_unbacked_row_count} unsupported gaps`}
      </span>
      <span>{`Anchor events · ${verdict.replay_anchor_event_ids.length}`}</span>
      <span>
        {`Unavailable anchors · ${unavailableAnchorCount} total · ${counts.collector_observation_without_event_id_row_count} collector-only · ${counts.unsupported_unbacked_row_count} unsupported`}
      </span>
      <span>{`Query anchor · ${renderReplayBundleQueryAnchors(replayBundle)}`}</span>
      <span>{`Replayable · ${replayableLabel}`}</span>
    </li>
  );
}

function renderSelectedEvidenceReplayScope(
  replayBundle: AccountabilityReplayBundle,
  onBackToEvidence?: () => void
) {
  if (!replayBundle.query.evidence_id) {
    return null;
  }

  return (
    <li className="aitown-record">
      <strong>Selected Evidence Replay Scope</strong>
      <span>{`Evidence · ${formatBoundedEvidenceLedgerToken(replayBundle.query.evidence_id)}`}</span>
      {replayBundle.query.agent_id ? (
        <span>{`Agent · ${formatBoundedEvidenceLedgerToken(replayBundle.query.agent_id)}`}</span>
      ) : null}
      <span>{`Bounds · limit ${replayBundle.query.limit} · window ${replayBundle.query.window}`}</span>
      <span>Mode · read-only evidence replay</span>
      {onBackToEvidence ? (
        <button type="button" className="aitown-link-button" onClick={onBackToEvidence}>
          Back to Evidence
        </button>
      ) : null}
    </li>
  );
}

function renderReplayBundleLedgerSourceKinds(entry: AccountabilityReplayLedgerEntry) {
  const sourceKinds = dedupeNonEmptyStrings([
    entry.source_kind,
    ...(entry.source_kinds ?? [])
  ]);

  return renderNamedList(sourceKinds, 'No source kinds');
}

function renderReplayBundleLedgerBasisEventIds(
  entry: AccountabilityReplayLedgerEntry,
  onOpenReplayCheckpoint?: (eventId: string) => void
) {
  const basisEventIds = Array.from(
    new Set(entry.basis_event_ids.map((eventId) => eventId.trim()).filter((eventId) => eventId.length > 0))
  );
  if (basisEventIds.length > 0) {
    if (!onOpenReplayCheckpoint) {
      return basisEventIds.join(', ');
    }

    return basisEventIds.map((eventId, index) => (
      <Fragment key={eventId}>
        {index > 0 ? ', ' : null}
        <button
          type="button"
          className="aitown-link-button"
          aria-label={`Open replay checkpoint ${eventId}`}
          onClick={() => onOpenReplayCheckpoint(eventId)}
        >
          {eventId}
        </button>
      </Fragment>
    ));
  }

  return entry.provenance === 'collector_observation_without_event_id'
    ? 'None (collector-only artifact)'
    : 'None supplied';
}

function buildReplayBundleSharedMemoryArtifactRefs(
  replayBundle: AccountabilityReplayBundle,
  sharedMemoryArtifactRefs: ReadonlySet<string>
) {
  const replayBundleArtifactRefs = new Set(sharedMemoryArtifactRefs);
  replayBundle.memory_artifacts.forEach((artifact) => {
    replayBundleArtifactRefs.add(artifact.artifact_ref);
  });
  return replayBundleArtifactRefs;
}

function renderReplayBundleLedgerEntry({
  entry,
  sharedMemoryArtifactRefs,
  onJump,
  onOpenReplayCheckpoint
}: {
  entry: AccountabilityReplayLedgerEntry;
  sharedMemoryArtifactRefs: ReadonlySet<string>;
  onJump: (artifactRef: string) => void;
  onOpenReplayCheckpoint?: (eventId: string) => void;
}) {
  return (
    <li key={`${entry.entry_type}:${entry.entry_id}`} className="aitown-record">
      <strong>{entry.summary ?? formatBoundedEvidenceLedgerToken(entry.entry_id)}</strong>
      <span>{`Ledger entry · ${entry.entry_type} · ${formatBoundedEvidenceLedgerToken(entry.entry_id)}`}</span>
      <span>{`At · ${renderTimestamp(entry.ts, 'No ledger timestamp')}`}</span>
      <span>Basis events · {renderReplayBundleLedgerBasisEventIds(entry, onOpenReplayCheckpoint)}</span>
      <span>{`Source kinds · ${renderReplayBundleLedgerSourceKinds(entry)}`}</span>
      <span>
        Evidence ·{' '}
        {renderSharedMemoryEvidenceRefs({
          evidenceRefs: entry.evidence_refs,
          sharedMemoryArtifactRefs,
          onJump,
          jumpAriaLabelPrefix: 'Jump to replay bundle evidence ref'
        })}
      </span>
      {entry.agent_id ? <span>{`Agent · ${formatBoundedEvidenceLedgerToken(entry.agent_id)}`}</span> : null}
      {entry.actor_id ? <span>{`Actor · ${formatBoundedEvidenceLedgerToken(entry.actor_id)}`}</span> : null}
      {entry.correlation_id ? (
        <span>{`Correlation · ${formatBoundedEvidenceLedgerToken(entry.correlation_id)}`}</span>
      ) : null}
      {entry.correlation_ids && entry.correlation_ids.length > 0 ? (
        <span>{`Correlations · ${entry.correlation_ids.map((id) => formatBoundedEvidenceLedgerToken(id)).join(', ')}`}</span>
      ) : null}
      {entry.provenance ? <span>{`Provenance · ${entry.provenance}`}</span> : null}
    </li>
  );
}

function renderSelectedAgentReplayBundleSection({
  replayBundle,
  replayBundleError,
  replayBundleState,
  sharedMemoryArtifactRefs,
  onFocusSharedMemoryArtifact,
  onOpenReplayCheckpoint,
  onBackToSelectedAgentEvidenceRecord
}: {
  replayBundle: AccountabilityReplayBundle | null;
  replayBundleError: string | null;
  replayBundleState: LoadState;
  sharedMemoryArtifactRefs: ReadonlySet<string>;
  onFocusSharedMemoryArtifact?: (artifactRef: string, scope?: SharedMemoryJumpScope) => void;
  onOpenReplayCheckpoint?: (eventId: string) => void;
  onBackToSelectedAgentEvidenceRecord?: () => void;
}) {
  const replayBundleWarning =
    replayBundleError && replayBundle ? `Showing last replay bundle snapshot. ${replayBundleError}` : null;
  const replayBundleSharedMemoryArtifactRefs = replayBundle
    ? buildReplayBundleSharedMemoryArtifactRefs(replayBundle, sharedMemoryArtifactRefs)
    : sharedMemoryArtifactRefs;
  const { onJump } = resolveSharedMemoryEvidenceJumpBehavior(onFocusSharedMemoryArtifact);

  return (
    <section className="aitown-details__section aitown-details__section--selected-replay aitown-details__section--hub-replay">
      <h3>Replay Bundle</h3>
      <ul className="aitown-records">
        {replayBundleState === 'loading' && !replayBundle ? (
          <li className="aitown-record">Loading replay bundle...</li>
        ) : null}
        {replayBundleError && !replayBundle ? (
          <li className="aitown-record">{`Unable to load replay bundle. ${replayBundleError}`}</li>
        ) : null}
        {replayBundleWarning ? <li className="aitown-record">{replayBundleWarning}</li> : null}
        {replayBundle ? (
          <>
            {renderSelectedEvidenceReplayScope(replayBundle, onBackToSelectedAgentEvidenceRecord)}
            {renderReplayProofLadder(replayBundle)}
            <li className="aitown-record">
              <strong>Replay bundle summary</strong>
              <span>{`Basis · ${replayBundle.accountability.basis}`}</span>
              <span>
                {`bounded_by · limit ${replayBundle.accountability.bounded_by.limit} · window ${replayBundle.accountability.bounded_by.window} · generated_at ${replayBundle.generated_at}`}
              </span>
              <span>{`Query anchors · ${renderReplayBundleQueryAnchors(replayBundle)}`}</span>
              <span>
                {`Counts · ${replayBundle.accountability.event_count} events · ${replayBundle.accountability.interaction_count} interactions · ${replayBundle.accountability.artifact_count} artifacts`}
              </span>
              <span>
                {`Source-kind counts · ${renderReplayBundleSourceKindCounts(
                  replayBundle.accountability.source_kind_buckets
                )} · derived/read-only`}
              </span>
              <span>{`Ledger · ${replayBundle.ledger.length} entries · derived/read-only`}</span>
              <span>
                {`Participants · ${renderNamedList(
                  replayBundle.accountability.participant_agent_ids,
                  'No participants'
                )}`}
              </span>
              <span>{`Actors · ${renderNamedList(replayBundle.accountability.actor_ids, 'No actors')}`}</span>
              <span>
                Evidence ·{' '}
                {renderSharedMemoryEvidenceRefs({
                  evidenceRefs: replayBundle.accountability.evidence_refs,
                  sharedMemoryArtifactRefs: replayBundleSharedMemoryArtifactRefs,
                  onJump,
                  jumpAriaLabelPrefix: 'Jump to replay bundle evidence ref'
                })}
              </span>
              <span>
                {`Window · ${renderTimestamp(
                  replayBundle.accountability.first_ts,
                  'No first event timestamp'
                )} -> ${renderTimestamp(replayBundle.accountability.last_ts, 'No last event timestamp')}`}
              </span>
            </li>
            {replayBundle.ledger.map((entry) =>
              renderReplayBundleLedgerEntry({
                entry,
                sharedMemoryArtifactRefs: replayBundleSharedMemoryArtifactRefs,
                onJump,
                onOpenReplayCheckpoint
              })
            )}
          </>
        ) : null}
        {replayBundleState === 'ready' && !replayBundleError && !replayBundle ? (
          <li className="aitown-record">No replay bundle loaded.</li>
        ) : null}
      </ul>
    </section>
  );
}

function renderTimelineReplaySection({
  sectionClassName = '',
  requestScopeLabel = null,
  scopedReplayCorrelationId = null,
  replayCheckpointEventId = null,
  selectedSeverity = null,
  timelineReplayItems,
  timelineReplayError,
  timelineReplayState,
  hasReplaySnapshot,
  loadingLabel,
  emptyLabel,
  initialErrorLabel,
  degradedErrorLabel,
  activeCorrelationId,
  currentAgentId,
  navigableAgentIds,
  agentNameById,
  zoneLabelById,
  sharedMemoryArtifactRefs,
  onSelectSeverity,
  onFocusSharedMemoryArtifact,
  onFocusWorldZone,
  onSelectAgent,
  onSelectCorrelation
}: {
  sectionClassName?: string;
  requestScopeLabel?: string | null;
  scopedReplayCorrelationId?: string | null;
  replayCheckpointEventId?: string | null;
  selectedSeverity?: Severity | null;
  timelineReplayItems: WorkflowTimelineEvent[];
  timelineReplayError: string | null;
  timelineReplayState: LoadState;
  hasReplaySnapshot: boolean;
  loadingLabel: string;
  emptyLabel: string;
  initialErrorLabel: string;
  degradedErrorLabel: string;
  activeCorrelationId: string | null;
  currentAgentId: string | null;
  navigableAgentIds: Set<string>;
  agentNameById: Map<string, string>;
  zoneLabelById: ReadonlyMap<string, string>;
  sharedMemoryArtifactRefs: ReadonlySet<string>;
  onSelectSeverity?: (severity: Severity | null) => void;
  onFocusSharedMemoryArtifact?: (artifactRef: string, scope?: SharedMemoryJumpScope) => void;
  onFocusWorldZone?: (zoneId: string) => void;
  onSelectAgent: SelectAgentHandler;
  onSelectCorrelation: SelectCorrelationHandler;
}) {
  const replaySummaryFacets = hasReplaySnapshot ? selectReplaySummaryFacets(timelineReplayItems) : null;

  return (
    <section className={`aitown-details__section${sectionClassName ? ` ${sectionClassName}` : ''}`}>
      <h3>Timeline Replay</h3>
      {requestScopeLabel ? <p>{`Request scope · ${requestScopeLabel}`}</p> : null}
      {scopedReplayCorrelationId ? <span>{`Scoped replay · ${scopedReplayCorrelationId}`}</span> : null}
      {replayCheckpointEventId ? <span>{`Replay checkpoint focus · ${replayCheckpointEventId}`}</span> : null}
      {onSelectSeverity ? (
        <p>
          <label htmlFor="aitown-timeline-replay-severity-filter">Severity filter</label>{' '}
          <select
            id="aitown-timeline-replay-severity-filter"
            aria-label="Filter timeline replay by severity"
            value={selectedSeverity ?? ''}
            onChange={(event) => onSelectSeverity(event.target.value ? (event.target.value as Severity) : null)}
          >
            <option value="">All severities</option>
            <option value="normal">Normal</option>
            <option value="yellow">Yellow</option>
            <option value="orange">Orange</option>
            <option value="red">Red</option>
          </select>
        </p>
      ) : null}
      <ul className="aitown-records">
        {timelineReplayState === 'loading' && !hasReplaySnapshot ? (
          <li className="aitown-record">{loadingLabel}</li>
        ) : null}
        {timelineReplayError ? (
          <li className="aitown-record">
            {hasReplaySnapshot ? degradedErrorLabel : initialErrorLabel}
          </li>
        ) : null}
        {replaySummaryFacets ? renderReplaySummaryFacets(replaySummaryFacets) : null}
        {timelineReplayItems.map((event) =>
          renderReplayTimelineEvent({
            event,
            activeCorrelationId,
            agentLabel: agentNameById.get(event.agent_id) ?? event.agent_id,
            currentAgentId,
            navigableAgentIds,
            zoneLabelById,
            sharedMemoryArtifactRefs,
            onFocusSharedMemoryArtifact,
            onFocusWorldZone,
            onSelectAgent,
            onSelectCorrelation
          })
        )}
        {timelineReplayState === 'ready' && !timelineReplayError && hasReplaySnapshot && timelineReplayItems.length === 0 ? (
          <li className="aitown-record">{emptyLabel}</li>
        ) : null}
      </ul>
    </section>
  );
}

function renderWorkflowStatusRecord({
  key,
  kind,
  severity,
  summary,
  ts,
  actorId,
  status,
  phase,
  counterpartyAgentIds,
  evidenceRefs,
  sharedMemoryArtifactRefs,
  correlationId,
  activeCorrelationId,
  sourceKind,
  currentAgentId,
  navigableAgentIds,
  onSelectAgent,
  onSelectCorrelation,
  onFocusSharedMemoryArtifact
}: {
  key: string;
  kind: 'Handoff' | 'Reboot';
  severity: keyof typeof SEVERITY_LABELS;
  summary: string;
  ts: string;
  actorId: string;
  status: string;
  phase: string;
  counterpartyAgentIds: string[];
  evidenceRefs: string[];
  sharedMemoryArtifactRefs: ReadonlySet<string>;
  correlationId: string | null;
  activeCorrelationId: string | null;
  sourceKind: string;
  currentAgentId: string | null;
  navigableAgentIds: Set<string>;
  onSelectAgent: SelectAgentHandler;
  onSelectCorrelation: SelectCorrelationHandler;
  onFocusSharedMemoryArtifact?: (artifactRef: string, scope?: SharedMemoryJumpScope) => void;
}) {
  const preservedCorrelationId = activeCorrelationId ?? correlationId;
  const canNavigateToActor = actorId !== currentAgentId && navigableAgentIds.has(actorId);
  const actorPivotAriaLabelPrefix = `Select workflow status actor from ${kind.toLowerCase()}`;
  const counterpartyPivotAriaLabelPrefix = `Select workflow status counterparty from ${kind.toLowerCase()} ${key}`;
  const { onJump, allowExactFallback } = resolveSharedMemoryEvidenceJumpBehavior(onFocusSharedMemoryArtifact);

  return (
    <li key={key} className={`aitown-record severity-${severity}`}>
      <strong>{summary}</strong>
      <span>{`${kind} · ${status} · ${phase}`}</span>
      <span>{`At · ${renderTimestamp(ts, 'No status timestamp')}`}</span>
      <span>
        Actor ·{' '}
        {canNavigateToActor
          ? renderAgentPivotButton({
              agentId: actorId,
              ariaLabel: `${actorPivotAriaLabelPrefix} ${key} ${actorId}`,
              correlationId: preservedCorrelationId,
              onSelectAgent
            })
          : actorId}
      </span>
      <span>{`Severity · ${SEVERITY_LABELS[severity]}`}</span>
      <span>
        Counterparties ·{' '}
        {renderAgentPivotList({
          agentIds: counterpartyAgentIds,
          currentAgentId,
          navigableAgentIds,
          emptyLabel: 'No counterparties',
          ariaLabelPrefix: counterpartyPivotAriaLabelPrefix,
          correlationId: preservedCorrelationId,
          onSelectAgent
        })}
      </span>
      <span>
        Evidence ·{' '}
        {renderSharedMemoryEvidenceRefs({
          evidenceRefs,
          sharedMemoryArtifactRefs,
          onJump,
          allowExactFallback,
          formatLabel: formatPublicEvidenceRefLabel,
          formatAriaLabel: formatPublicEvidenceRefAriaLabel
        })}
      </span>
      <span>
        Correlation pivot ·{' '}
        {renderCorrelationButton({
          correlationId,
          label: correlationId ?? 'No correlation id',
          buttonLabel: 'Open workflow status correlation',
          activeCorrelationId,
          preserveAutoOnDefaultReselect: true,
          onSelectCorrelation
        })}
      </span>
      <span>{`Source · ${sourceKind}`}</span>
    </li>
  );
}

function renderWorkflowPeerWatchAlert({
  alert,
  sharedMemoryArtifactRefs,
  activeCorrelationId,
  currentAgentId,
  navigableAgentIds,
  onSelectAgent,
  onSelectCorrelation,
  onFocusSharedMemoryArtifact
}: {
  alert: WorkflowPeerWatchAlert;
  sharedMemoryArtifactRefs: ReadonlySet<string>;
  activeCorrelationId: string | null;
  currentAgentId: string | null;
  navigableAgentIds: Set<string>;
  onSelectAgent: SelectAgentHandler;
  onSelectCorrelation: SelectCorrelationHandler;
  onFocusSharedMemoryArtifact?: (artifactRef: string, scope?: SharedMemoryJumpScope) => void;
}) {
  const preservedCorrelationId = activeCorrelationId ?? alert.correlation_id;
  const canNavigateToTarget = alert.target_agent_id !== currentAgentId && navigableAgentIds.has(alert.target_agent_id);
  const canNavigateToObserver =
    alert.observer_agent_id !== currentAgentId && navigableAgentIds.has(alert.observer_agent_id);
  const { onJump, allowExactFallback } = resolveSharedMemoryEvidenceJumpBehavior(onFocusSharedMemoryArtifact);

  return (
    <li key={alert.alert_id} className={`aitown-record severity-${alert.severity}`}>
      <strong>{alert.summary}</strong>
      {renderCorrelationButton({
        correlationId: alert.correlation_id,
        label: alert.correlation_id ?? 'No correlation id',
        buttonLabel: 'Open workflow correlation',
        activeCorrelationId,
        onSelectCorrelation
      })}
      <span>{`At · ${renderTimestamp(alert.ts, 'No alert timestamp')}`}</span>
      <span>
        Target ·{' '}
        {canNavigateToTarget
          ? renderAgentPivotButton({
              agentId: alert.target_agent_id,
              ariaLabel: `Select workflow peer-watch target from alert ${alert.alert_id} ${alert.target_agent_id}`,
              correlationId: preservedCorrelationId,
              onSelectAgent
            })
          : alert.target_agent_id}
      </span>
      <span>
        Observer ·{' '}
        {canNavigateToObserver
          ? renderAgentPivotButton({
              agentId: alert.observer_agent_id,
              ariaLabel: `Select workflow peer-watch observer from alert ${alert.alert_id} ${alert.observer_agent_id}`,
              correlationId: preservedCorrelationId,
              onSelectAgent
            })
          : alert.observer_agent_id}
      </span>
      <span>
        Watchers ·{' '}
        {renderAgentPivotList({
          agentIds: alert.watcher_agent_ids,
          currentAgentId,
          navigableAgentIds,
          emptyLabel: 'No watchers',
          ariaLabelPrefix: `Select workflow peer-watch watcher from alert ${alert.alert_id}`,
          correlationId: preservedCorrelationId,
          onSelectAgent
        })}
      </span>
      <span>{`Status · ${alert.status}`}</span>
      <span>{`Workflow status · ${alert.current_state}`}</span>
      <span>{`Task · ${alert.active_task}`}</span>
      {renderCollectorDerivedPeerWatchMetadata(alert.metadata)}
      <span>
        Evidence ·{' '}
        {renderSharedMemoryEvidenceRefs({
          evidenceRefs: alert.evidence_refs,
          sharedMemoryArtifactRefs,
          onJump,
          allowExactFallback,
          formatLabel: formatPublicEvidenceRefLabel,
          formatAriaLabel: formatPublicEvidenceRefAriaLabel
        })}
      </span>
      <span>{`Evidence count · ${alert.evidence_count}`}</span>
      <span>{`Source · ${alert.source_kind}`}</span>
    </li>
  );
}

function renderSelectedAgentSupervisionAlert({
  alert,
  sharedMemoryArtifactRefs,
  activeCorrelationId,
  currentAgentId,
  navigableAgentIds,
  onSelectAgent,
  onSelectCorrelation,
  onFocusSharedMemoryArtifact
}: {
  alert: WorkflowPeerWatchAlert;
  sharedMemoryArtifactRefs: ReadonlySet<string>;
  activeCorrelationId: string | null;
  currentAgentId: string | null;
  navigableAgentIds: Set<string>;
  onSelectAgent: SelectAgentHandler;
  onSelectCorrelation: SelectCorrelationHandler;
  onFocusSharedMemoryArtifact?: (artifactRef: string, scope?: SharedMemoryJumpScope) => void;
}) {
  const preservedCorrelationId = activeCorrelationId ?? alert.correlation_id;
  const canNavigateToActor = alert.actor_id !== currentAgentId && navigableAgentIds.has(alert.actor_id);
  const canNavigateToObserver =
    alert.observer_agent_id !== currentAgentId && navigableAgentIds.has(alert.observer_agent_id);
  const { onJump, allowExactFallback } = resolveSharedMemoryEvidenceJumpBehavior(onFocusSharedMemoryArtifact);

  return (
    <li key={alert.alert_id} className={`aitown-record aitown-evidence-card severity-${alert.severity}`}>
      <div className="aitown-evidence-card__header">
        <span className="aitown-evidence-card__title">
          <span className="aitown-evidence-card__eyebrow">Peer watch supervision</span>
          <strong>{alert.summary}</strong>
        </span>
        <span className="aitown-evidence-card__correlation">
          {renderCorrelationButton({
            correlationId: alert.correlation_id,
            label: alert.correlation_id ?? 'No correlation id',
            buttonLabel: 'Open supervision history correlation',
            activeCorrelationId,
            preserveAutoOnDefaultReselect: true,
            onSelectCorrelation
          })}
        </span>
      </div>
      <div className="aitown-evidence-card__facts" aria-label={`Evidence facts for ${alert.summary}`}>
        <span className="aitown-evidence-card__fact">{`At · ${renderTimestamp(alert.ts, 'No alert timestamp')}`}</span>
        <span className="aitown-evidence-card__fact">{`Severity · ${alert.severity}`}</span>
        <span className="aitown-evidence-card__fact">{`Status · ${alert.status}`}</span>
        <span className="aitown-evidence-card__fact">{`Workflow status · ${alert.current_state}`}</span>
        <span className="aitown-evidence-card__fact aitown-evidence-card__fact--wide">{`Task · ${alert.active_task}`}</span>
        {renderCollectorDerivedPeerWatchMetadata(alert.metadata)}
        <span className="aitown-evidence-card__fact">
          Actor ·{' '}
          {canNavigateToActor
            ? renderAgentPivotButton({
                agentId: alert.actor_id,
                ariaLabel: `Select supervision history actor from alert ${alert.alert_id} ${alert.actor_id}`,
                correlationId: preservedCorrelationId,
                onSelectAgent
              })
            : alert.actor_id}
        </span>
        <span className="aitown-evidence-card__fact">
          Observer ·{' '}
          {canNavigateToObserver
            ? renderAgentPivotButton({
                agentId: alert.observer_agent_id,
                ariaLabel: `Select supervision history observer from alert ${alert.alert_id} ${alert.observer_agent_id}`,
                correlationId: preservedCorrelationId,
                onSelectAgent
              })
            : alert.observer_agent_id}
        </span>
        <span className="aitown-evidence-card__fact aitown-evidence-card__fact--wide">
          Watchers ·{' '}
          {renderAgentPivotList({
            agentIds: alert.watcher_agent_ids,
            currentAgentId,
            navigableAgentIds,
            emptyLabel: 'No watchers',
            ariaLabelPrefix: `Select supervision history watcher from alert ${alert.alert_id}`,
            correlationId: preservedCorrelationId,
            onSelectAgent
          })}
        </span>
        <span className="aitown-evidence-card__fact aitown-evidence-card__fact--wide">
          Evidence ·{' '}
          {renderSharedMemoryEvidenceRefs({
            evidenceRefs: alert.evidence_refs,
            sharedMemoryArtifactRefs,
            onJump,
            allowExactFallback,
            formatLabel: formatPublicEvidenceRefLabel,
            formatAriaLabel: formatPublicEvidenceRefAriaLabel
          })}
        </span>
        <span className="aitown-evidence-card__fact">{`Evidence count · ${alert.evidence_count}`}</span>
        <span className="aitown-evidence-card__fact">{`Source · ${alert.source_kind}`}</span>
      </div>
    </li>
  );
}

function renderCrewOpenSupervisionAlert({
  alert,
  agentNameById,
  sharedMemoryArtifactRefs,
  activeCorrelationId,
  navigableAgentIds,
  onSelectAgent,
  onSelectCorrelation,
  onFocusSharedMemoryArtifact
}: {
  alert: WorkflowPeerWatchAlert;
  agentNameById: Map<string, string>;
  sharedMemoryArtifactRefs: ReadonlySet<string>;
  activeCorrelationId: string | null;
  navigableAgentIds: Set<string>;
  onSelectAgent: SelectAgentHandler;
  onSelectCorrelation: SelectCorrelationHandler;
  onFocusSharedMemoryArtifact?: (artifactRef: string, scope?: SharedMemoryJumpScope) => void;
}) {
  const preservedCorrelationId =
    activeCorrelationId !== null && alert.correlation_id === activeCorrelationId
      ? activeCorrelationId
      : alert.correlation_id;
  const preserveNullCorrelation = preservedCorrelationId === null;
  const targetLabel = agentNameById.get(alert.target_agent_id) ?? alert.target_agent_id;
  const actorLabel = agentNameById.get(alert.actor_id) ?? alert.actor_id;
  const observerLabel = agentNameById.get(alert.observer_agent_id) ?? alert.observer_agent_id;
  const canNavigateToTarget = navigableAgentIds.has(alert.target_agent_id);
  const canNavigateToActor = navigableAgentIds.has(alert.actor_id);
  const canNavigateToObserver = navigableAgentIds.has(alert.observer_agent_id);
  const openSupervisionAlertEvidenceJump = onFocusSharedMemoryArtifact
    ? (artifactRef: string) =>
        onFocusSharedMemoryArtifact(artifactRef, {
          correlationId: preservedCorrelationId,
          preserveNullCorrelation
        })
    : focusSharedMemoryArtifact;
  const allowExactFallback = Boolean(onFocusSharedMemoryArtifact);

  return (
    <li key={alert.alert_id} className={`aitown-record aitown-evidence-card aitown-supervision-alert-card severity-${alert.severity}`}>
      <div className="aitown-evidence-card__header">
        <span className="aitown-evidence-card__title">
          <span className="aitown-evidence-card__eyebrow">Open peer watch</span>
          <strong>{alert.summary}</strong>
        </span>
        <span className="aitown-evidence-card__correlation">
          {renderCorrelationButton({
            correlationId: alert.correlation_id,
            label: alert.correlation_id ?? 'No correlation id',
            buttonLabel: 'Open supervision queue correlation',
            activeCorrelationId,
            preserveAutoOnDefaultReselect: true,
            onSelectCorrelation
          })}
        </span>
      </div>
      <div className="aitown-evidence-card__facts" aria-label={`Open supervision facts for ${alert.summary}`}>
        <span className="aitown-evidence-card__fact">{`At · ${renderTimestamp(alert.ts, 'No alert timestamp')}`}</span>
        <span className="aitown-evidence-card__fact">{`Severity · ${alert.severity}`}</span>
        <span className="aitown-evidence-card__fact">{`Status · ${alert.status}`}</span>
        <span className="aitown-evidence-card__fact">{`Workflow status · ${alert.current_state}`}</span>
        <span className="aitown-evidence-card__fact aitown-evidence-card__fact--wide">{`Task · ${alert.active_task}`}</span>
        {renderCollectorDerivedPeerWatchMetadata(alert.metadata)}
        <span className="aitown-evidence-card__fact">
          Target ·{' '}
          {canNavigateToTarget
            ? renderAgentPivotButton({
                agentId: alert.target_agent_id,
                label: targetLabel,
                ariaLabel: `Inspect ${targetLabel} from open supervision alerts queue`,
                correlationId: preservedCorrelationId,
                preserveNullCorrelation,
                onSelectAgent
              })
            : targetLabel}
        </span>
        <span className="aitown-evidence-card__fact">
          Actor ·{' '}
          {canNavigateToActor
            ? renderAgentPivotButton({
                agentId: alert.actor_id,
                label: actorLabel,
                ariaLabel: `Select open supervision alert actor from alert ${alert.alert_id} ${alert.actor_id}`,
                correlationId: preservedCorrelationId,
                preserveNullCorrelation,
                onSelectAgent
              })
            : actorLabel}
        </span>
        <span className="aitown-evidence-card__fact">
          Observer ·{' '}
          {canNavigateToObserver
            ? renderAgentPivotButton({
                agentId: alert.observer_agent_id,
                label: observerLabel,
                ariaLabel: `Select open supervision alert observer from alert ${alert.alert_id} ${alert.observer_agent_id}`,
                correlationId: preservedCorrelationId,
                preserveNullCorrelation,
                onSelectAgent
              })
            : observerLabel}
        </span>
        <span className="aitown-evidence-card__fact aitown-evidence-card__fact--wide">
          Watchers ·{' '}
          {renderAgentPivotList({
            agentIds: alert.watcher_agent_ids,
            currentAgentId: null,
            navigableAgentIds,
            emptyLabel: 'No watchers',
            ariaLabelPrefix: `Select open supervision alert watcher from alert ${alert.alert_id}`,
            correlationId: preservedCorrelationId,
            preserveNullCorrelation,
            onSelectAgent
          })}
        </span>
        <span className="aitown-evidence-card__fact aitown-evidence-card__fact--wide">
          Evidence ·{' '}
          {renderSharedMemoryEvidenceRefs({
            evidenceRefs: alert.evidence_refs,
            sharedMemoryArtifactRefs,
            onJump: openSupervisionAlertEvidenceJump,
            allowExactFallback
          })}
        </span>
        <span className="aitown-evidence-card__fact">{`Evidence count · ${alert.evidence_count}`}</span>
        <span className="aitown-evidence-card__fact">{`Source · ${alert.source_kind}`}</span>
      </div>
    </li>
  );
}

function renderSharedMemoryArtifact({
  artifact,
  activeCorrelationId,
  currentAgentId,
  navigableAgentIds,
  isFocusedExactArtifact = false,
  onOpenReplayCheckpoint,
  onSelectAgent,
  onSelectCorrelation
}: {
  artifact: MemoryArtifact;
  activeCorrelationId: string | null;
  currentAgentId: string | null;
  navigableAgentIds: Set<string>;
  isFocusedExactArtifact?: boolean;
  onOpenReplayCheckpoint?: (eventId: string) => void;
  onSelectAgent: SelectAgentHandler;
  onSelectCorrelation: SelectCorrelationHandler;
}) {
  const artifactCorrelationId = findFirstNonEmptyString(artifact.correlation_ids);
  const preservedCorrelationId = activeCorrelationId ?? artifactCorrelationId;
  const replayCheckpoint = artifact.replay_checkpoint;

  return (
    <li
      key={artifact.artifact_ref}
      id={resolveSharedMemoryArtifactDomId(artifact.artifact_ref)}
      className={`aitown-record${isFocusedExactArtifact ? ' aitown-record--shared-memory-focused' : ''}`}
      data-shared-memory-target="true"
      tabIndex={-1}
    >
      {isFocusedExactArtifact ? <span className="aitown-shared-memory-focus-chip">Focused exact jump</span> : null}
      <strong>{artifact.latest_summary ?? artifact.file_name}</strong>
      <span>{`Artifact · ${artifact.file_name} · ${renderDisplayState(artifact.artifact_kind)}`}</span>
      <span>{`Ref · ${artifact.artifact_ref}`}</span>
      <span>{`Seen · ${artifact.last_seen_at} · ${artifact.mention_count} mentions`}</span>
      <span>
        Agents ·{' '}
        {renderAgentPivotList({
          agentIds: artifact.agent_ids,
          currentAgentId,
          navigableAgentIds,
          emptyLabel: 'No agents',
          ariaLabelPrefix: 'Select shared memory agent',
          correlationId: preservedCorrelationId,
          onSelectAgent
        })}
      </span>
      <span>
        Correlations ·{' '}
        {renderCorrelationPivotList({
          correlationIds: artifact.correlation_ids,
          activeCorrelationId,
          emptyLabel: 'No correlation ids',
          buttonLabel: 'Open shared memory correlation',
          onSelectCorrelation
        })}
      </span>
      {artifact.latest_event_type ? <span>{`Latest event type · ${artifact.latest_event_type}`}</span> : null}
      {artifact.latest_event_id ? (
        <span>{`Latest event · ${artifact.latest_event_id} · ${artifact.latest_event_type ?? 'unknown'}`}</span>
      ) : null}
      {replayCheckpoint ? (
        <span>
          Replay checkpoint ·{' '}
          {onOpenReplayCheckpoint ? (
            <button
              type="button"
              className="aitown-link-button"
              aria-label={`Open replay checkpoint ${replayCheckpoint.event_id}`}
              onClick={() => onOpenReplayCheckpoint(replayCheckpoint.event_id)}
            >
              {replayCheckpoint.event_id}
            </button>
          ) : (
            replayCheckpoint.event_id
          )}
          {` · ${replayCheckpoint.event_type ?? 'unknown'} · ${replayCheckpoint.last_seen_at}`}
        </span>
      ) : null}
      {artifact.source_kinds.length > 0 ? (
        <span>{`Source kinds · ${renderNamedList(dedupeNonEmptyStrings(artifact.source_kinds), 'No source kinds')}`}</span>
      ) : null}
      {artifact.collector_last_modified_at ? (
        <span>{`Collector modified · ${artifact.collector_last_modified_at}`}</span>
      ) : null}
    </li>
  );
}

function renderFocusedSharedMemoryBacklinkLane({
  items,
  overflowCount
}: SharedMemoryBacklinkSummary) {
  return (
    <div className="aitown-shared-memory-backlink-lane">
      <span className="aitown-shared-memory-backlink-label">Current-scope backlinks</span>
      {items.length > 0 ? (
        <div className="aitown-shared-memory-backlink-chips">
          {items.map((backlink) => (
            <span key={backlink.key} className="aitown-shared-memory-backlink-chip">
              <strong>{backlink.sourceLabel}</strong>
              <span>{backlink.label}</span>
            </span>
          ))}
          {overflowCount > 0 ? (
            <span className="aitown-shared-memory-backlink-chip">
              <strong>More</strong>
              <span>{`+${overflowCount} more current-scope records`}</span>
            </span>
          ) : null}
        </div>
      ) : (
        <span className="aitown-shared-memory-backlink-empty">No current-scope backlinks cite this artifact.</span>
      )}
    </div>
  );
}

function renderSharedMemorySection({
  sectionClassName = '',
  hidden = false,
  headerAction = null,
  memoryArtifacts,
  memoryArtifactsError,
  memoryArtifactsState,
  sharedMemoryRequestScopeLabel,
  focusedSharedMemoryArtifactRef,
  focusedSharedMemoryBacklinks,
  focusedSharedMemoryBacklinkOverflowCount,
  sharedMemoryJumpStatus,
  activeCorrelationId,
  currentAgentId,
  navigableAgentIds,
  onOpenReplayCheckpoint,
  onSelectAgent,
  onSelectCorrelation
}: {
  sectionClassName?: string;
  hidden?: boolean;
  headerAction?: ReactNode;
  memoryArtifacts: MemoryArtifactIndex | null;
  memoryArtifactsError: string | null;
  memoryArtifactsState: LoadState;
  sharedMemoryRequestScopeLabel: string;
  focusedSharedMemoryArtifactRef?: string | null;
  focusedSharedMemoryBacklinks: SharedMemoryBacklink[];
  focusedSharedMemoryBacklinkOverflowCount: number;
  sharedMemoryJumpStatus?: string | null;
  activeCorrelationId: string | null;
  currentAgentId: string | null;
  navigableAgentIds: Set<string>;
  onOpenReplayCheckpoint?: (eventId: string) => void;
  onSelectAgent: SelectAgentHandler;
  onSelectCorrelation: SelectCorrelationHandler;
}) {
  const sharedMemoryWarning =
    memoryArtifactsError && memoryArtifacts
      ? `Showing last shared-memory snapshot. ${memoryArtifactsError}`
      : null;

  return (
    <section className={`aitown-details__section${sectionClassName ? ` ${sectionClassName}` : ''}`} hidden={hidden}>
      <h3>Shared Memory</h3>
      {headerAction}
      <span>{`Request scope · ${sharedMemoryRequestScopeLabel}`}</span>
      {focusedSharedMemoryArtifactRef ? (
        <>
          <p className="aitown-shared-memory-focus-status">{`Focused exact artifact · ${focusedSharedMemoryArtifactRef}`}</p>
          {renderFocusedSharedMemoryBacklinkLane({
            items: focusedSharedMemoryBacklinks,
            overflowCount: focusedSharedMemoryBacklinkOverflowCount
          })}
        </>
      ) : null}
      {sharedMemoryWarning ? <p role="status">{sharedMemoryWarning}</p> : null}
      {sharedMemoryJumpStatus ? <p role="status">{sharedMemoryJumpStatus}</p> : null}
      <ul className="aitown-records">
        {memoryArtifactsState === 'loading' && !memoryArtifacts ? (
          <li className="aitown-record">Loading shared memory...</li>
        ) : null}
        {memoryArtifactsError && !memoryArtifacts ? (
          <li className="aitown-record">{`Unable to load shared memory. ${memoryArtifactsError}`}</li>
        ) : null}
        {(memoryArtifacts?.items ?? []).map((artifact) =>
          renderSharedMemoryArtifact({
            artifact,
            activeCorrelationId,
            currentAgentId,
            navigableAgentIds,
            isFocusedExactArtifact: focusedSharedMemoryArtifactRef === artifact.artifact_ref,
            onOpenReplayCheckpoint,
            onSelectAgent,
            onSelectCorrelation
          })
        )}
        {memoryArtifactsState === 'ready' && !memoryArtifactsError && !memoryArtifacts?.items.length ? (
          <li className="aitown-record">No shared memory artifacts.</li>
        ) : null}
      </ul>
    </section>
  );
}

function resolveSelectableIncidentCorrelationId(
  incident: WorkflowIncident,
  selectableIds?: ReadonlySet<string>
): string | null {
  if (!incident.correlation_id) {
    return null;
  }

  if (!selectableIds) {
    return incident.correlation_id;
  }

  return selectableIds.has(incident.incident_id) ? incident.correlation_id : null;
}

const HUB_CATEGORY_ORIENTATION: Record<
  HubCategory,
  {
    title: string;
    crewScope: string;
    crewFocus: string;
    selectedScope: (agent: OfficeAgent) => string;
    selectedFocus: string;
  }
> = {
  crew: {
    title: 'Crew focus',
    crewScope: 'Roster, office grid, and current town state.',
    crewFocus: 'Focus: choose the next agent or room to inspect.',
    selectedScope: (agent) => `${agent.display_name} · current operation and town context.`,
    selectedFocus: 'Focus: read the pawn state before drilling into proof.'
  },
  queue: {
    title: 'Queue focus',
    crewScope: 'Live work queue and attention lane for the crew.',
    crewFocus: 'Focus: find blocked work and choose the next inspect target.',
    selectedScope: (agent) => `${agent.display_name} · queue position and active-correlation lane.`,
    selectedFocus: 'Focus: compare this agent against queued work without leaving the inspect window.'
  },
  supervision: {
    title: 'Supervision focus',
    crewScope: 'Collector state, watch topology, and open supervision alerts.',
    crewFocus: 'Focus: see who is watching whom and which signals need intervention.',
    selectedScope: (agent) => `${agent.display_name} · supervision and collector observation.`,
    selectedFocus: 'Focus: verify watcher context before acting on the agent.'
  },
  evidence: {
    title: 'Evidence focus',
    crewScope: 'Incident feed and shared memory refs for the crew.',
    crewFocus: 'Focus: prove what happened, who touched it, and where the trail lives.',
    selectedScope: (agent) => `${agent.display_name} · active evidence view.`,
    selectedFocus: "Focus: isolate this agent's proof, incidents, and memory anchors."
  },
  replay: {
    title: 'Replay focus',
    crewScope: 'Timeline replay and correlation drilldown.',
    crewFocus: 'Focus: walk the event order before changing scope.',
    selectedScope: (agent) => `${agent.display_name} · replay and correlation context.`,
    selectedFocus: 'Focus: reconstruct the chain for this agent and active correlation.'
  },
  memory: {
    title: 'Memory focus',
    crewScope: 'Shared artifacts and exact evidence refs.',
    crewFocus: 'Focus: jump from proof refs to the stored artifact.',
    selectedScope: (agent) => `${agent.display_name} · scoped shared memory artifacts.`,
    selectedFocus: 'Focus: keep memory refs tied to this agent and correlation.'
  }
};

function renderHubCategoryOrientation({
  activeHubCategory,
  selectedAgent
}: {
  activeHubCategory: HubCategory;
  selectedAgent: OfficeAgent | null;
}) {
  const orientation = HUB_CATEGORY_ORIENTATION[activeHubCategory];

  return (
    <section
      className="aitown-hub-category-orientation"
      data-active-hub-category={activeHubCategory}
      aria-label={orientation.title}
    >
      <h3>{orientation.title}</h3>
      <p>{selectedAgent ? orientation.selectedScope(selectedAgent) : orientation.crewScope}</p>
      <p>{selectedAgent ? orientation.selectedFocus : orientation.crewFocus}</p>
    </section>
  );
}

function renderIncidentRecord({
  incident,
  activeCorrelationId,
  currentAgentId,
  navigableAgentIds,
  sharedMemoryArtifactRefs,
  enableSharedMemoryEvidenceJump = false,
  onFocusSharedMemoryArtifact,
  onSelectAgent,
  onSelectCorrelation,
  includeAgentPivot,
  includeActorPivot = false,
  actorPivotAriaLabelPrefix = 'Select incident feed actor from incident',
  includeCounterpartyPivots = false,
  counterpartyPivotAriaLabelPrefix = 'Select correlation incident counterparty agent',
  includeCorrelationPivot = true,
  selectableCorrelationId = incident.correlation_id,
  layout = 'flat'
}: {
  incident: WorkflowIncident;
  activeCorrelationId: string | null;
  currentAgentId: string | null;
  navigableAgentIds: Set<string>;
  sharedMemoryArtifactRefs: ReadonlySet<string>;
  enableSharedMemoryEvidenceJump?: boolean;
  onFocusSharedMemoryArtifact?: (artifactRef: string, scope?: SharedMemoryJumpScope) => void;
  onSelectAgent: SelectAgentHandler;
  onSelectCorrelation: SelectCorrelationHandler;
  includeAgentPivot: boolean;
  includeActorPivot?: boolean;
  actorPivotAriaLabelPrefix?: string;
  includeCounterpartyPivots?: boolean;
  counterpartyPivotAriaLabelPrefix?: string;
  includeCorrelationPivot?: boolean;
  selectableCorrelationId?: string | null;
  layout?: 'flat' | 'evidence-card';
}) {
  const { onJump, allowExactFallback } = resolveSharedMemoryEvidenceJumpBehavior(onFocusSharedMemoryArtifact);
  const pivotCorrelationId = selectableCorrelationId ?? activeCorrelationId;
  const renderedAgent =
    navigableAgentIds.has(incident.agent_id) && incident.agent_id !== currentAgentId
      ? renderAgentPivotButton({
          agentId: incident.agent_id,
          ariaLabel: `Select incident agent ${incident.agent_id} from incident ${incident.incident_id}`,
          correlationId: pivotCorrelationId,
          onSelectAgent
        })
      : incident.agent_id;
  const renderedActor =
    includeActorPivot && incident.actor_id !== currentAgentId && navigableAgentIds.has(incident.actor_id)
      ? renderAgentPivotButton({
          agentId: incident.actor_id,
          ariaLabel: `${actorPivotAriaLabelPrefix} ${incident.incident_id} ${incident.actor_id}`,
          correlationId: pivotCorrelationId,
          onSelectAgent
        })
      : incident.actor_id;
  const renderedCounterparties = includeCounterpartyPivots
    ? renderAgentPivotList({
        agentIds: incident.counterparty_agent_ids,
        currentAgentId,
        navigableAgentIds,
        emptyLabel: 'No counterparties',
        ariaLabelPrefix: counterpartyPivotAriaLabelPrefix,
        correlationId: pivotCorrelationId,
        onSelectAgent
      })
    : renderCounterparties(incident.counterparty_agent_ids);
  const renderedEvidence = enableSharedMemoryEvidenceJump
    ? renderSharedMemoryEvidenceRefs({
        evidenceRefs: incident.evidence_refs,
        sharedMemoryArtifactRefs,
        onJump,
        allowExactFallback
      })
    : renderEvidenceRefs(incident.evidence_refs);

  if (layout === 'evidence-card') {
    const timestampLabel = renderTimestamp(incident.ts, 'No incident timestamp');

    return (
      <li key={incident.incident_id} className={`aitown-record aitown-evidence-card severity-${incident.severity}`}>
        <div className="aitown-evidence-card__header">
          <span className="aitown-evidence-card__title">
            <span className="aitown-evidence-card__eyebrow">
              {`${SEVERITY_LABELS[incident.severity]} · ${incident.kind} · ${incident.status} · ${timestampLabel}`}
            </span>
            <strong>{incident.summary}</strong>
          </span>
          {includeCorrelationPivot ? (
            <span className="aitown-evidence-card__correlation">
              <span className="aitown-evidence-card__eyebrow">Correlation</span>
              {renderCorrelationButton({
                correlationId: selectableCorrelationId,
                label: incident.correlation_id ?? 'No correlation id',
                buttonLabel: 'Open incident correlation',
                activeCorrelationId,
                preserveAutoOnDefaultReselect: true,
                onSelectCorrelation
              })}
            </span>
          ) : null}
        </div>
        <div className="aitown-evidence-card__facts" aria-label={`Evidence facts for ${incident.summary}`}>
          <span className="aitown-evidence-card__fact">Agent · {renderedAgent}</span>
          <span className="aitown-evidence-card__fact">Actor · {renderedActor}</span>
          <span className="aitown-evidence-card__fact">{`At · ${timestampLabel}`}</span>
          <span className="aitown-evidence-card__fact">{`Incident · ${incident.kind} · ${incident.status}`}</span>
          <span className="aitown-evidence-card__fact">{`Severity · ${SEVERITY_LABELS[incident.severity]}`}</span>
          <span className="aitown-evidence-card__fact aitown-evidence-card__fact--wide">
            Counterparties · {renderedCounterparties}
          </span>
          <span className="aitown-evidence-card__fact aitown-evidence-card__fact--wide">
            Evidence · {renderedEvidence}
          </span>
          <span className="aitown-evidence-card__fact aitown-evidence-card__fact--wide">{`Source · ${incident.source_kind}`}</span>
        </div>
      </li>
    );
  }

  return (
    <li key={incident.incident_id} className={`aitown-record severity-${incident.severity}`}>
      <strong>{incident.summary}</strong>
      {includeAgentPivot ? (
        <span>
          Agent · {renderedAgent}
        </span>
      ) : null}
      {includeCorrelationPivot
        ? renderCorrelationButton({
            correlationId: selectableCorrelationId,
            label: incident.correlation_id ?? 'No correlation id',
            buttonLabel: 'Open incident correlation',
            activeCorrelationId,
            preserveAutoOnDefaultReselect: true,
            onSelectCorrelation
          })
        : null}
      <span>{`At · ${renderTimestamp(incident.ts, 'No incident timestamp')}`}</span>
      <span>Actor · {renderedActor}</span>
      <span>{`Incident · ${incident.kind} · ${incident.status}`}</span>
      <span>{`Severity · ${SEVERITY_LABELS[incident.severity]}`}</span>
      <span>Counterparties · {renderedCounterparties}</span>
      <span>Evidence · {renderedEvidence}</span>
      <span>{`Source · ${incident.source_kind}`}</span>
    </li>
  );
}

function compareAgents(
  left: { severity: keyof typeof SEVERITY_LABELS; displayName: string; agentId: string },
  right: { severity: keyof typeof SEVERITY_LABELS; displayName: string; agentId: string }
) {
  return (
    SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity] ||
    left.displayName.localeCompare(right.displayName) ||
    left.agentId.localeCompare(right.agentId)
  );
}

function resolveCollectorEvidenceRefs(item: CollectorItem) {
  return [...item.evidence_refs, ...(item.heartbeat.evidence_refs ?? [])].filter(
    (evidenceRef, index, list) => evidenceRef && list.indexOf(evidenceRef) === index
  );
}

function renderEvidenceRefCount(count: number) {
  return `${count} ref${count === 1 ? '' : 's'}`;
}

function renderCollectorEvidenceCoverageSummary({
  coverage,
  agentCount
}: {
  coverage: CollectorSnapshot['evidence_coverage'] | null;
  agentCount: number;
}) {
  if (!coverage) {
    return null;
  }

  const buckets = coverage.source_kind_buckets;

  return (
    <>
      <span>{`Evidence coverage · ${coverage.covered_agent_count}/${agentCount} agents · ${renderEvidenceRefCount(coverage.evidence_ref_count)}`}</span>
      <span>
        {`Evidence sources · workspace_file ${buckets.workspace_file} · workspace_root ${buckets.workspace_root} · tmux_observation ${buckets.tmux_observation}`}
      </span>
      <span>
        {`Coverage below high-confidence/no evidence · ${renderNamedList(coverage.low_confidence_agent_ids, 'None')}`}
      </span>
    </>
  );
}

function renderCollectorEvidenceCoverageItem({
  coverageItem,
  coverageLow
}: {
  coverageItem: CollectorEvidenceCoverageAgentItem;
  coverageLow: boolean;
}) {
  return (
    <>
      <span>{`Coverage status · ${coverageLow ? 'below high-confidence/no evidence' : 'evidence coverage present'}`}</span>
      <span>
        {`Evidence coverage · ${renderEvidenceRefCount(coverageItem.evidence_ref_count)} · ${renderNamedList(coverageItem.source_kinds, 'No evidence sources')}`}
      </span>
      <span>{`Latest evidence · ${renderTimestamp(coverageItem.latest_evidence_at, 'No recent evidence')}`}</span>
    </>
  );
}

function renderSourceHealthFacts(facts: SourceHealthFact[], labelPrefix: string | null = 'Source health') {
  if (facts.length === 0) {
    return null;
  }

  return facts.map((fact) => (
    <span key={fact.key}>{labelPrefix ? `${labelPrefix} · ${fact.label}` : fact.label}</span>
  ));
}

function renderSourceDrilldownGroups(
  groups: SourceDrilldownGroup[],
  labelPrefix: string | null = 'Source health',
  options: {
    idPrefix?: string;
    focusedGroupKey?: SourceGapDrilldownGroupKey | null;
  } = {}
) {
  if (groups.length === 0) {
    return null;
  }

  return groups.map((group) => (
    <details
      key={group.key}
      id={options.idPrefix ? `${options.idPrefix}-${group.key}` : undefined}
      data-source-gap-focus={options.focusedGroupKey === group.key ? 'true' : undefined}
      open={options.focusedGroupKey === group.key ? true : undefined}
      tabIndex={options.idPrefix ? -1 : undefined}
    >
      <summary>{labelPrefix ? `${labelPrefix} · ${group.summary}` : group.summary}</summary>
      {group.details.map((detail) => (
        <span key={detail.key}>{detail.label}</span>
      ))}
    </details>
  ));
}

function renderSourceGapContextBreadcrumb(intent: SourceGapFocusIntent) {
  return (
    <section className="aitown-source-gap-context" role="region" aria-label="Source gap context">
      <span>Source gap</span>
      <strong>{intent.agentLabel}</strong>
      <span>{`${intent.sourceLabel} · ${intent.status}`}</span>
    </section>
  );
}

function hasSourceHealthGap(facts: SourceHealthFact[]) {
  return facts.some((fact) => fact.status !== 'observed');
}

function hasCollectorSourceHealthGap(item: CollectorItem) {
  return hasSourceHealthGap(deriveCollectorItemSourceHealthFacts(item));
}

function resolveCollectorSeverity(item: CollectorItem): keyof typeof SEVERITY_LABELS {
  if (item.supervision.needs_attention) {
    return 'orange';
  }

  if (item.heartbeat.reboot_recommended || item.supervision.watch_target || item.supervision.watched_by.length > 0) {
    return 'yellow';
  }

  return 'normal';
}

function compareCollectorItems(
  left: CollectorItem,
  right: CollectorItem,
  lowCoverageAgentIds: ReadonlySet<string> = new Set()
) {
  const leftSignalScore =
    (left.supervision.needs_attention ? 100 : 0) +
    (left.heartbeat.reboot_recommended ? 50 : 0) +
    (lowCoverageAgentIds.has(left.agent_id) ? 30 : 0) +
    (left.supervision.watch_target ? 20 : 0) +
    left.supervision.watched_by.length * 10 +
    resolveCollectorEvidenceRefs(left).length * 2 +
    left.workspace_observations.length +
    left.tmux_observations.length;
  const rightSignalScore =
    (right.supervision.needs_attention ? 100 : 0) +
    (right.heartbeat.reboot_recommended ? 50 : 0) +
    (lowCoverageAgentIds.has(right.agent_id) ? 30 : 0) +
    (right.supervision.watch_target ? 20 : 0) +
    right.supervision.watched_by.length * 10 +
    resolveCollectorEvidenceRefs(right).length * 2 +
    right.workspace_observations.length +
    right.tmux_observations.length;

  return (
    rightSignalScore - leftSignalScore ||
    right.heartbeat.received_at.localeCompare(left.heartbeat.received_at) ||
    left.agent_id.localeCompare(right.agent_id)
  );
}

function sortAgentIds(agentIds: string[]) {
  return [...new Set(agentIds)].sort((left, right) => left.localeCompare(right));
}

function matchAgentIds(left: string[], right: string[]) {
  return left.length === right.length && left.every((agentId, index) => agentId === right[index]);
}

function resolveCollectorWatchGraphAlignment(item: CollectorItem, world: WorldState) {
  const collectorWatchTargets = sortAgentIds(item.supervision.watch_target ? [item.supervision.watch_target] : []);
  const liveWatchTargets = sortAgentIds(
    world.watch_edges
      .filter((edge) => edge.from_agent_id === item.agent_id)
      .map((edge) => edge.to_agent_id)
  );
  const collectorWatchers = sortAgentIds(item.supervision.watched_by);
  const liveWatchers = sortAgentIds(
    world.watch_edges
      .filter((edge) => edge.to_agent_id === item.agent_id)
      .map((edge) => edge.from_agent_id)
  );
  const targetMatches = matchAgentIds(collectorWatchTargets, liveWatchTargets);
  const watcherMatches = matchAgentIds(collectorWatchers, liveWatchers);

  if (targetMatches && watcherMatches) {
    return 'Full match';
  }

  if (!targetMatches && !watcherMatches) {
    return 'Target + watcher mismatch';
  }

  return targetMatches ? 'Watcher mismatch' : 'Target mismatch';
}

function renderZoneOccupants({
  zoneLabel,
  occupants,
  currentAgentId,
  navigableAgentIds,
  correlationId,
  onSelectAgent
}: {
  zoneLabel: string;
  occupants: Array<{ agentId: string; displayName: string }>;
  currentAgentId: string | null;
  navigableAgentIds: Set<string>;
  correlationId?: string | null;
  onSelectAgent: SelectAgentHandler;
}) {
  if (occupants.length === 0) {
    return 'Empty';
  }

  return occupants.map((occupant, index) => {
    const canNavigate = occupant.agentId !== currentAgentId && navigableAgentIds.has(occupant.agentId);

    return (
      <span key={`zone-occupant-${zoneLabel}-${occupant.agentId}`}>
        {index > 0 ? ', ' : null}
        {canNavigate ? (
          renderAgentPivotButton({
            agentId: occupant.agentId,
            label: occupant.displayName,
            ariaLabel: `Select zone occupant ${occupant.displayName} in ${zoneLabel}`,
            correlationId,
            onSelectAgent
          })
        ) : (
          <span>{occupant.displayName}</span>
        )}
      </span>
    );
  });
}

function summarizeZoneSeverity(severities: Array<keyof typeof SEVERITY_LABELS>) {
  if (severities.length === 0) {
    return 'Normal · Empty';
  }

  const highestSeverity = severities.reduce<keyof typeof SEVERITY_LABELS>((highest, severity) =>
    SEVERITY_RANK[severity] > SEVERITY_RANK[highest] ? severity : highest
  , 'normal');

  return `${SEVERITY_LABELS[highestSeverity]} · ${severities.length} occupant(s)`;
}

export function DetailsPanel({
  activeHubCategory,
  collectorSnapshot,
  collectorSnapshotError,
  collectorSnapshotState,
  correlation,
  correlationError,
  correlationState,
  incidentFeed,
  incidentFeedError,
  incidentFeedState,
  crewIncidentCorrelationSelectableIds,
  openSupervisionAlerts = null,
  openSupervisionAlertsError = null,
  openSupervisionAlertsState = 'ready',
  operations,
  operationsError,
  operationsState,
  activeCorrelationQueueOperations = operations,
  activeCorrelationQueueError = operationsError,
  activeCorrelationQueueState = operationsState,
  operationsStateBuckets,
  operationsSeverityBuckets,
  operationsStateBucketsError,
  operationsStateBucketsState,
  overviewZones,
  manualCorrelationOverrideActive,
  preserveWorkflowCounterpartyCorrelation,
  memoryArtifacts,
  memoryArtifactsError,
  memoryArtifactsState,
  sharedMemoryRequestScopeLabel,
  focusedSharedMemoryArtifactRef,
  sharedMemoryJumpStatus,
  replayCheckpointEventId,
  selectedAgentSupervisionHistoryRequestScopeLabel,
  selectedAgentSupervisionHistory,
  selectedAgentSupervisionHistoryError,
  selectedAgentSupervisionHistoryState,
  selectedAgent,
  selectedCorrelationId,
  selectedCrewOpenSupervisionSeverity,
  selectedAgentSupervisionHistorySeverity,
  selectedAgentReplaySeverity,
  selectedCrewReplaySeverity,
  selectedOperationsState,
  selectedOperationsSeverity,
  selectedOperation,
  selectedOperationRequestActive,
  selectedAgentDrilldownTab = null,
  sourceGapFocusIntent = null,
  timelineReplay,
  timelineReplayError,
  timelineReplayState,
  selectedAgentTimelineReplay,
  selectedAgentTimelineReplayError,
  selectedAgentTimelineReplayState,
  selectedAgentAccountabilityReplay,
  selectedAgentAccountabilityReplayError,
  selectedAgentAccountabilityReplayState,
  selectedAgentEvidenceLedger,
  selectedAgentEvidenceLedgerError,
  selectedAgentEvidenceLedgerState,
  selectedAgentEvidenceRecord,
  selectedAgentEvidenceRecordError,
  selectedAgentEvidenceRecordId,
  selectedAgentEvidenceRecordState,
  selectedAgentEvidenceProvenanceBundle,
  selectedAgentEvidenceProvenanceBundleError,
  selectedAgentEvidenceProvenanceBundleState,
  selectedAgentEvidenceSourceContext,
  selectedAgentEvidenceSourceContextError,
  selectedAgentEvidenceSourceContextState,
  selectedAgentEvidenceCheckpointLog,
  selectedAgentEvidenceCheckpointLogError,
  selectedAgentEvidenceCheckpointLogState,
  workflow,
  workflowError,
  workflowState,
  world,
  onSelectAgent,
  onInspectAgent,
  onSelectCorrelation,
  onResetCorrelationOverride,
  onSelectCrewOpenSupervisionSeverity,
  onSelectSelectedAgentSupervisionHistorySeverity,
  onSelectSelectedAgentReplaySeverity,
  onSelectCrewReplaySeverity,
  onSelectOperationsState,
  onSelectOperationsSeverity,
  onSelectOperation,
  onInspectSelectedAgentEvidenceRecord,
  onInspectSelectedAgentEvidenceSourceContext,
  onReplaySelectedAgentEvidenceRecord,
  onBackToSelectedAgentEvidenceRecord,
  onFocusSharedMemoryArtifact,
  onOpenReplayCheckpoint,
  onFocusWorldZone
}: DetailsPanelProps) {
  const agents = [...world.agents.values()]
    .map((agent) => ({
      agentId: agent.agent_id,
      displayName: agent.display_name,
      severity: agent.severity
    }))
    .sort(compareAgents);
  const navigableAgentIds = new Set(agents.map((agent) => agent.agentId));
  const attentionQueue = selectAttentionQueue(world);
  const agentNameById = new Map([...world.agents.values()].map((agent) => [agent.agent_id, agent.display_name]));
  const sharedMemoryEvidenceJump = resolveSharedMemoryEvidenceJumpBehavior(onFocusSharedMemoryArtifact);
  const projectedZoneById = new Map(world.zones.map((zone) => [zone.zone_id, zone]));
  const zoneSource = overviewZones
    ? [
        ...overviewZones,
        ...world.zones
          .filter((zone) => !overviewZones.some((candidate) => candidate.zone_id === zone.zone_id))
          .map((zone) => ({
            zone_id: zone.zone_id,
            label: zone.label,
            kind: zone.kind,
            grid_x: zone.grid_x,
            grid_y: zone.grid_y,
            grid_w: zone.grid_w,
            grid_h: zone.grid_h,
            home_agent_id: zone.home_agent_id ?? null,
            occupants: []
          }))
      ]
    : world.zones.map((zone) => ({
        zone_id: zone.zone_id,
        label: zone.label,
        kind: zone.kind,
        grid_x: zone.grid_x,
        grid_y: zone.grid_y,
        grid_w: zone.grid_w,
        grid_h: zone.grid_h,
        home_agent_id: zone.home_agent_id ?? null,
        occupants: []
      }));
  const zoneLabelById = new Map(zoneSource.map((zone) => [zone.zone_id, zone.label]));
  const officeGrid = buildZoneLayoutModels(zoneSource).map((layoutModel) => {
    const zone = layoutModel.zone;
    const overviewZone = overviewZones?.find((candidate) => candidate.zone_id === zone.zone_id) ?? null;
    const projectedZone = projectedZoneById.get(zone.zone_id) ?? null;
    const occupants = overviewZone
      ? overviewZone.occupants.length > 0
        ? overviewZone.occupants.map((occupant) => ({
            agentId: occupant.agent_id,
            displayName: occupant.display_name,
            severity: occupant.effective_severity
          }))
        : [...world.agents.values()]
            .filter((agent) => agent.raw_location === zone.zone_id)
            .map((agent) => ({
              agentId: agent.agent_id,
              displayName: agent.display_name,
              severity: agent.severity
            }))
      : (projectedZone?.occupant_ids ?? []).flatMap((occupantId) => {
          const occupant = world.agents.get(occupantId);
          return occupant
            ? [{
                agentId: occupant.agent_id,
                displayName: occupant.display_name,
                severity: occupant.severity
              }]
            : [];
        });

    return {
      zone,
      occupants,
      homeAgentLabel: zone.home_agent_id ? (agentNameById.get(zone.home_agent_id) ?? zone.home_agent_id) : null,
      severitySummary: summarizeZoneSeverity(occupants.map((occupant) => occupant.severity))
    };
  });
  const activeQueueStateBuckets = new Map(
    Object.entries(
      operationsStateBucketsState === 'ready'
        ? operationsStateBuckets
        : (operations?.summary.state_buckets ?? {})
    )
  );

  if (selectedOperationsState && !activeQueueStateBuckets.has(selectedOperationsState)) {
    activeQueueStateBuckets.set(selectedOperationsState, 0);
  }

  const activeQueueStateOptions = [...activeQueueStateBuckets.entries()].filter(
    ([state, count]) => count > 0 || state === selectedOperationsState
  );
  const activeQueueStateCount = activeQueueStateOptions.reduce((total, [, count]) => total + count, 0);
  const activeQueueSeverityBuckets = new Map<Severity, number>(
    Object.entries(
      operationsStateBucketsState === 'ready'
        ? operationsSeverityBuckets
        : (operations?.summary.severity_buckets ?? EMPTY_SEVERITY_BUCKETS)
    ) as [Severity, number][]
  );

  if (selectedOperationsSeverity && !activeQueueSeverityBuckets.has(selectedOperationsSeverity)) {
    activeQueueSeverityBuckets.set(selectedOperationsSeverity, 0);
  }

  const activeQueueSeverityOptions = [...activeQueueSeverityBuckets.entries()].filter(
    ([severity, count]) => count > 0 || severity === selectedOperationsSeverity
  );
  const activeQueueSeverityCount = activeQueueSeverityOptions.reduce((total, [, count]) => total + count, 0);
  const activeQueueStateBucketsStatus =
    operationsStateBucketsState === 'ready' && operationsStateBucketsError
      ? renderActiveQueueStateBucketsStatusLabel(operationsStateBucketsError)
      : null;
  const activeCorrelationQueueCorrelation =
    correlation?.correlation_id === selectedCorrelationId ? correlation : null;
  const activeCorrelationQueueParticipantAgentIds = activeCorrelationQueueCorrelation?.participant_agent_ids ?? [];
  const activeCorrelationQueueParticipantAgentIdSet = new Set(activeCorrelationQueueParticipantAgentIds);
  const activeCorrelationQueueItems = activeCorrelationQueueCorrelation
    ? (activeCorrelationQueueOperations?.items ?? []).filter((operation) =>
        activeCorrelationQueueParticipantAgentIdSet.has(operation.agent_id)
      )
    : [];
  const activeCorrelationQueueScopeLabel = activeCorrelationQueueCorrelation
    ? renderActiveCorrelationQueueScopeLabel({
        correlationId: activeCorrelationQueueCorrelation.correlation_id,
        matchedCount: activeCorrelationQueueItems.length,
        participantCount: activeCorrelationQueueParticipantAgentIds.length
      })
    : null;
  const activeCorrelationQueueWarning =
    activeCorrelationQueueCorrelation && activeCorrelationQueueError && activeCorrelationQueueOperations
      ? renderActiveCorrelationQueueWarningLabel(
          activeCorrelationQueueCorrelation.correlation_id,
          activeCorrelationQueueError
        )
      : null;
  const shouldRenderActiveCorrelationQueueSection =
    Boolean(activeCorrelationQueueCorrelation) &&
    (!selectedAgent ||
      activeCorrelationQueueOperations !== null ||
      activeCorrelationQueueState !== 'idle' ||
      activeCorrelationQueueError !== null);
  const canOpenActiveCorrelationQueuePanel = Boolean(
    shouldRenderActiveCorrelationQueueSection && activeCorrelationQueueCorrelation && activeCorrelationQueueOperations !== null
  );
  const [selectedAgentSupervisionPanel, setSelectedAgentSupervisionPanel] =
    useState<SelectedAgentSupervisionPanel | null>(null);
  const [sourceGapFocusDomRetry, setSourceGapFocusDomRetry] = useState(0);
  const focusedSourceGapRequestIdRef = useRef<number | null>(null);
  const sourceGapFocusDomRetryRef = useRef<{ requestId: number | null; attempts: number }>({
    requestId: null,
    attempts: 0
  });
  const activeSourceGapFocusIntent =
    selectedAgent &&
    activeHubCategory === 'supervision' &&
    selectedAgentDrilldownTab === 'evidence' &&
    sourceGapFocusIntent?.agentId === selectedAgent.agent_id
      ? sourceGapFocusIntent
      : null;
  useEffect(() => {
    setSelectedAgentSupervisionPanel(null);
  }, [activeHubCategory, selectedAgent?.agent_id, selectedAgentDrilldownTab]);
  useEffect(() => {
    if (activeSourceGapFocusIntent) {
      setSelectedAgentSupervisionPanel('collector');
    }
  }, [activeSourceGapFocusIntent]);
  const selectedAgentSupervisionDeckEnabled = Boolean(
    selectedAgent && activeHubCategory === 'supervision' && selectedAgentDrilldownTab === 'evidence'
  );
  const selectedAgentSupervisionPanelMode =
    selectedAgentSupervisionDeckEnabled &&
    selectedAgentSupervisionPanel !== null &&
    (selectedAgentSupervisionPanel !== 'queue' || canOpenActiveCorrelationQueuePanel)
      ? selectedAgentSupervisionPanel
      : null;
  const shouldShowSelectedAgentSupervisionPanel = (panel: SelectedAgentSupervisionPanel) =>
    !selectedAgentSupervisionDeckEnabled || selectedAgentSupervisionPanelMode === panel;
  useEffect(() => {
    if (!activeSourceGapFocusIntent || selectedAgentSupervisionPanelMode !== 'collector') {
      return;
    }

    if (focusedSourceGapRequestIdRef.current === activeSourceGapFocusIntent.requestId) {
      return;
    }

    if (sourceGapFocusDomRetryRef.current.requestId !== activeSourceGapFocusIntent.requestId) {
      sourceGapFocusDomRetryRef.current = {
        requestId: activeSourceGapFocusIntent.requestId,
        attempts: 0
      };
    }

    const target = document.getElementById(
      `aitown-selected-agent-source-drilldown-${activeSourceGapFocusIntent.sourceDrilldownGroupKey}`
    );
    if (!(target instanceof HTMLDetailsElement)) {
      if (sourceGapFocusDomRetryRef.current.attempts >= 8) {
        return;
      }

      sourceGapFocusDomRetryRef.current.attempts += 1;
      const retryTimer = window.setTimeout(() => {
        setSourceGapFocusDomRetry((retry) => retry + 1);
      }, 0);

      return () => window.clearTimeout(retryTimer);
    }

    focusedSourceGapRequestIdRef.current = activeSourceGapFocusIntent.requestId;
    target.open = true;
    target.focus();
    target.scrollIntoView?.({ block: 'nearest' });
  }, [activeSourceGapFocusIntent, selectedAgentSupervisionPanelMode, sourceGapFocusDomRetry]);
  const renderSelectedAgentSupervisionPanelBackButton = (panel: SelectedAgentSupervisionPanel) =>
    selectedAgentSupervisionPanelMode === panel ? (
      <button
        type="button"
        className="aitown-link-button aitown-selected-supervision-panel__back"
        aria-label="Back to supervision deck"
        autoFocus
        onClick={() => setSelectedAgentSupervisionPanel(null)}
      >
        Back to deck
      </button>
    ) : null;
  const activeCorrelationQueueDeckSummary = activeCorrelationQueueCorrelation
    ? canOpenActiveCorrelationQueuePanel
      ? `${activeCorrelationQueueItems.length} of ${activeCorrelationQueueParticipantAgentIds.length} participants`
      : 'Queue snapshot not loaded'
    : 'No active correlation';
  const sharedMemoryActiveCorrelationId = selectedCorrelationId;
  const sharedMemoryArtifactRefs = new Set((memoryArtifacts?.items ?? []).map((artifact) => artifact.artifact_ref));
  const activeReplayCheckpointEventId = replayCheckpointEventId?.trim() || null;
  const activeCorrelationQueueSection = shouldRenderActiveCorrelationQueueSection && activeCorrelationQueueCorrelation ? (
    <section
      className={`aitown-details__section aitown-details__section--hub-queue aitown-details__section--hub-evidence aitown-details__section--hub-supervision${selectedAgent ? ' aitown-details__section--selected-now aitown-details__section--selected-evidence aitown-details__section--selected-supervision-queue' : ''}`}
    >
      <h3>Active Correlation Queue</h3>
      {renderSelectedAgentSupervisionPanelBackButton('queue')}
      {activeCorrelationQueueScopeLabel ? <p>{activeCorrelationQueueScopeLabel}</p> : null}
      <ul className="aitown-records">
        {activeCorrelationQueueState === 'loading' && !activeCorrelationQueueOperations ? (
          <li className="aitown-record">
            {renderActiveCorrelationQueueLoadingLabel(activeCorrelationQueueCorrelation.correlation_id)}
          </li>
        ) : null}
        {activeCorrelationQueueError && !activeCorrelationQueueOperations ? (
          <li className="aitown-record">
            {renderActiveCorrelationQueueErrorLabel(
              activeCorrelationQueueCorrelation.correlation_id,
              activeCorrelationQueueError
            )}
          </li>
        ) : null}
        {activeCorrelationQueueWarning ? <li className="aitown-record">{activeCorrelationQueueWarning}</li> : null}
        {activeCorrelationQueueItems.map((operation) =>
          renderOperationsQueueRecord({
            operation,
            activeCorrelationId: selectedCorrelationId,
            pivotCorrelationId: selectedCorrelationId,
            queueScopeLabel: 'active correlation queue',
            domIdPrefix: 'active-correlation-queue',
            navigableAgentIds,
            sharedMemoryArtifactRefs,
            onJumpToSharedMemoryArtifact: sharedMemoryEvidenceJump.onJump,
            allowExactSharedMemoryFallback: sharedMemoryEvidenceJump.allowExactFallback,
            onSelectAgent,
            onSelectCorrelation,
            onSelectOperation,
            preserveActiveCorrelationOnSelect: true
          })
        )}
        {activeCorrelationQueueState === 'ready' &&
        !activeCorrelationQueueError &&
        activeCorrelationQueueItems.length === 0 ? (
          <li className="aitown-record">
            {renderActiveCorrelationQueueEmptyLabel(activeCorrelationQueueCorrelation.correlation_id)}
          </li>
        ) : null}
      </ul>
    </section>
  ) : null;
  const collectorWarning =
    collectorSnapshotError && collectorSnapshot
      ? `Showing last collector snapshot. ${collectorSnapshotError}`
      : null;
  const openSupervisionAlertsWarning =
    openSupervisionAlertsError && openSupervisionAlerts
      ? renderOpenSupervisionAlertsWarningLabel(
          selectedCrewOpenSupervisionSeverity,
          openSupervisionAlertsError
        )
      : null;
  const supervisionHistoryWarning =
    selectedAgentSupervisionHistoryError && selectedAgentSupervisionHistory
      ? renderSelectedAgentSupervisionHistoryWarningLabel(
          selectedAgentSupervisionHistorySeverity,
          selectedAgentSupervisionHistoryError
        )
      : null;
  const workflowWarning = workflowError && workflow ? renderWorkflowWarningLabel(workflowError) : null;
  const workflowSummaryFacets = workflow ? selectWorkflowSummaryFacets(workflow.summary) : null;
  const selectedAgentDetailEvidenceFacets = deriveAgentDetailEvidenceFacets(workflow?.detail);
  const collectorEvidenceCoverage = collectorSnapshot?.evidence_coverage ?? null;
  const collectorRuntimeSourceEvidenceFacts = deriveRuntimeSourceEvidenceFacts(
    collectorSnapshot?.runtime_source_evidence
  );
  const collectorRuntimeSourceDrilldownGroups = deriveRuntimeSourceDrilldownGroups(
    collectorSnapshot?.runtime_source_evidence
  );
  const collectorEvidenceCoverageLowAgentIds = new Set(
    collectorEvidenceCoverage?.low_confidence_agent_ids ?? []
  );
  const collectorEvidenceCoverageByAgentId = new Map(
    (collectorEvidenceCoverage?.agent_items ?? []).map((item) => [item.agent_id, item])
  );
  const collectorSignalItems = (collectorSnapshot?.items ?? [])
    .filter(
      (item) =>
        item.supervision.needs_attention ||
        item.heartbeat.reboot_recommended ||
        item.supervision.watch_target !== null ||
        item.supervision.watched_by.length > 0 ||
        collectorEvidenceCoverageLowAgentIds.has(item.agent_id) ||
        hasCollectorSourceHealthGap(item)
    )
    .sort((left, right) => compareCollectorItems(left, right, collectorEvidenceCoverageLowAgentIds))
    .slice(0, 3);
  const collectorSharedArtifacts = collectorSnapshot?.shared_artifacts;
  const selectedCollectorItem = selectedAgent
    ? collectorSnapshot?.items.find((item) => item.agent_id === selectedAgent.agent_id) ?? null
    : null;
  const visibleCollectorItems = selectedAgent ? (selectedCollectorItem ? [selectedCollectorItem] : []) : collectorSignalItems;
  const focusedSharedMemoryBacklinks = buildFocusedSharedMemoryBacklinks({
    focusedArtifactRef: focusedSharedMemoryArtifactRef,
    activeCorrelationId: sharedMemoryActiveCorrelationId,
    selectedOperation,
    openSupervisionAlerts: selectedAgent ? null : openSupervisionAlerts,
    selectedAgentSupervisionHistory,
    timelineReplay,
    workflow,
    correlation,
    selectedAgentAccountabilityReplay,
    collectorSharedArtifacts: selectedAgent ? null : collectorSharedArtifacts,
    visibleCollectorItems
  });
  const manualCorrelationResetAction =
    manualCorrelationOverrideActive && selectedCorrelationId ? (
      <>
        {' '}
        <span>
          Manual correlation override active.{' '}
          <button type="button" className="aitown-link-button" onClick={onResetCorrelationOverride}>
            Return to current scope
          </button>
        </span>
      </>
    ) : null;
  const shouldRenderCrewCategory = activeHubCategory === 'crew';
  const shouldRenderQueueCategory = activeHubCategory === 'queue';
  const shouldRenderSupervisionCategory = activeHubCategory === 'supervision';
  const shouldRenderEvidenceCategory = activeHubCategory === 'evidence';
  const shouldRenderReplayCategory = activeHubCategory === 'replay';
  const shouldRenderMemoryCategory = activeHubCategory === 'memory';
  const detailsPanelClassName = [
    'aitown-panel',
    'aitown-panel--details',
    `aitown-panel--details-category-${activeHubCategory}`,
    selectedAgent ? 'aitown-panel--details-selected-agent' : 'aitown-panel--details-crew-overview'
  ].join(' ');

  if (!selectedAgent) {
    return (
      <aside
        className={detailsPanelClassName}
        role="complementary"
        aria-label="Agent details"
        data-active-hub-category={activeHubCategory}
      >
        {shouldRenderCrewCategory ? (
          <>
            <div className="aitown-details__head">
              <div>
                <h2>Crew Overview</h2>
                <p>Pick an agent in the town or start from the roster.</p>
              </div>
            </div>

            <div className="aitown-details__summary">
              <p>
                {world.summary.total_agents} active agents, {world.summary.blocked_count} blocked, highest
                severity {SEVERITY_LABELS[world.summary.highest_severity]}.{manualCorrelationResetAction}
              </p>
            </div>

            <div className="aitown-crew-summary-grid" aria-label="Crew overview summary">
              <div className="aitown-stat-card aitown-stat-card--crew">
                <span>Agents</span>
                <strong>{world.summary.total_agents}</strong>
              </div>
              <div className="aitown-stat-card aitown-stat-card--crew">
                <span>Blocked</span>
                <strong>{world.summary.blocked_count}</strong>
              </div>
              <div className="aitown-stat-card aitown-stat-card--crew">
                <span>Reboots</span>
                <strong>{world.summary.reboot_count}</strong>
              </div>
              <div className="aitown-stat-card aitown-stat-card--crew">
                <span>Watch edges</span>
                <strong>{world.watch_edges.length}</strong>
              </div>
            </div>
          </>
        ) : null}

        {!shouldRenderCrewCategory ? renderHubCategoryOrientation({ activeHubCategory, selectedAgent: null }) : null}

        {shouldRenderSupervisionCategory ? (
          <div className="aitown-supervision-summary-grid" aria-label="Supervision overview summary">
            <div className="aitown-stat-card aitown-stat-card--supervision">
              <span>Watch edges</span>
              <strong>{world.watch_edges.length}</strong>
            </div>
            <div className="aitown-stat-card aitown-stat-card--supervision">
              <span>Open alerts</span>
              <strong>{openSupervisionAlerts?.items.length ?? 0}</strong>
            </div>
            <div className="aitown-stat-card aitown-stat-card--supervision">
              <span>Collector flags</span>
              <strong>{collectorSignalItems.length}</strong>
            </div>
            <div className="aitown-stat-card aitown-stat-card--supervision">
              <span>Reboot flags</span>
              <strong>{collectorSnapshot?.summary.reboot_recommended_count ?? world.summary.reboot_count}</strong>
            </div>
          </div>
        ) : null}

        {shouldRenderQueueCategory ? (
        <section className="aitown-details__section aitown-details__section--active-queue">
          <h3>Active Queue</h3>
          {activeQueueStateBucketsStatus ? <p role="status">{activeQueueStateBucketsStatus}</p> : null}
          <div>
            <label htmlFor="aitown-active-queue-state-filter">State filter</label>{' '}
            <select
              id="aitown-active-queue-state-filter"
              aria-label="Filter active queue by state"
              value={selectedOperationsState ?? ''}
              onChange={(event) => onSelectOperationsState(event.target.value || null)}
            >
              <option value="">
                {renderActiveQueueAllStatesLabel({
                  activeQueueStateCount
                })}
              </option>
              {activeQueueStateOptions.map(([state, count]) => (
                <option key={state} value={state}>
                  {renderActiveQueueStateOptionLabel({
                    count,
                    state
                  })}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="aitown-active-queue-severity-filter">Severity filter</label>{' '}
            <select
              id="aitown-active-queue-severity-filter"
              aria-label="Filter active queue by severity"
              value={selectedOperationsSeverity ?? ''}
              onChange={(event) =>
                onSelectOperationsSeverity((event.target.value || null) as Severity | null)
              }
            >
              <option value="">
                {renderActiveQueueAllSeveritiesLabel({
                  activeQueueSeverityCount
                })}
              </option>
              {activeQueueSeverityOptions.map(([severity, count]) => (
                <option key={severity} value={severity}>
                  {renderActiveQueueSeverityOptionLabel({
                    count,
                    severity
                  })}
                </option>
              ))}
            </select>
          </div>
          <ul className="aitown-records">
            {operationsState === 'loading' && !operations ? (
              <li className="aitown-record">
                {renderActiveQueueLoadingLabel(selectedOperationsState, selectedOperationsSeverity)}
              </li>
            ) : null}
            {operationsError && !operations ? (
              <li className="aitown-record">
                {renderActiveQueueErrorLabel(
                  selectedOperationsState,
                  selectedOperationsSeverity,
                  operationsError
                )}
              </li>
            ) : null}
            {operationsError && operations ? (
              <li className="aitown-record">
                {renderActiveQueueWarningLabel(
                  selectedOperationsState,
                  selectedOperationsSeverity,
                  operationsError
                )}
              </li>
            ) : null}
            {(operations?.items ?? []).slice(0, 4).map((operation) =>
              renderOperationsQueueRecord({
                operation,
                activeCorrelationId: selectedCorrelationId,
                pivotCorrelationId: selectedCorrelationId,
                queueScopeLabel: 'active queue',
                domIdPrefix: 'active-queue',
                navigableAgentIds,
                sharedMemoryArtifactRefs,
                onJumpToSharedMemoryArtifact: sharedMemoryEvidenceJump.onJump,
                allowExactSharedMemoryFallback: sharedMemoryEvidenceJump.allowExactFallback,
                onSelectAgent,
                onSelectCorrelation,
                onSelectOperation
              })
            )}
            {operationsState === 'ready' && !operationsError && !operations?.items.length ? (
              <li className="aitown-record">
                {renderActiveQueueEmptyLabel(selectedOperationsState, selectedOperationsSeverity)}
              </li>
            ) : null}
          </ul>
        </section>
        ) : null}

        {shouldRenderSupervisionCategory ? (
        <section className="aitown-details__section aitown-details__section--supervision-collector">
          <h3>Collector Supervision</h3>
          {collectorWarning ? <p role="status">{collectorWarning}</p> : null}
          <ul className="aitown-records">
            {collectorSnapshotState === 'loading' && !collectorSnapshot ? (
              <li className="aitown-record">Loading collector snapshot...</li>
            ) : null}
            {collectorSnapshotState === 'loading' && !collectorSnapshot ? (
              <li className="aitown-record">Loading collector shared snapshot artifacts...</li>
            ) : null}
            {collectorSnapshotError && !collectorSnapshot ? (
              <li className="aitown-record">{`Unable to load collector snapshot. ${collectorSnapshotError}`}</li>
            ) : null}
            {collectorSnapshotError && !collectorSnapshot ? (
              <li className="aitown-record">
                {`Unable to load collector shared snapshot artifacts. ${collectorSnapshotError}`}
              </li>
            ) : null}
            {collectorSnapshot ? (
              <li className="aitown-record">
                <strong>
                  {navigableAgentIds.has(collectorSnapshot.actor_id)
                    ? renderAgentPivotButton({
                        agentId: collectorSnapshot.actor_id,
                        ariaLabel: `Select collector snapshot actor ${collectorSnapshot.actor_id}`,
                        correlationId: selectedCorrelationId,
                        onSelectAgent
                      })
                    : collectorSnapshot.actor_id}
                </strong>
                <span>{`Latest snapshot · ${collectorSnapshot.collected_at}`}</span>
                <span>{`Heartbeats · ${collectorSnapshot.summary.heartbeat_count}`}</span>
                <span>{`Workspace observations · ${collectorSnapshot.summary.workspace_observed_count}`}</span>
                <span>{`Tmux observations · ${collectorSnapshot.summary.tmux_observed_count}`}</span>
                <span>{`Reboot flags · ${collectorSnapshot.summary.reboot_recommended_count}`}</span>
                {renderCollectorEvidenceCoverageSummary({
                  coverage: collectorEvidenceCoverage,
                  agentCount: collectorSnapshot.summary.agent_count
                })}
                {renderSourceHealthFacts(collectorRuntimeSourceEvidenceFacts, null)}
                {renderSourceDrilldownGroups(collectorRuntimeSourceDrilldownGroups, null)}
              </li>
            ) : null}
            {collectorSnapshot && collectorSharedArtifacts !== undefined ? (
              <li className="aitown-record">
                <strong>
                  {`Shared snapshot artifacts · ${collectorSharedArtifacts.length} shared artifact${collectorSharedArtifacts.length === 1 ? '' : 's'} in latest collector snapshot`}
                </strong>
              </li>
            ) : null}
            {collectorSharedArtifacts?.map((artifact) => (
              <li key={artifact.artifact_ref} className="aitown-record">
                <strong>
                  {renderSharedMemoryArtifactJump({
                    artifactRef: artifact.artifact_ref,
                    label: artifact.artifact_ref,
                    sharedMemoryArtifactRefs,
                    onJump: sharedMemoryEvidenceJump.onJump,
                    allowExactFallback: sharedMemoryEvidenceJump.allowExactFallback
                  })}
                </strong>
                <span>{`Agent count · ${artifact.agent_count}`}</span>
                <span>{`Mention count · ${artifact.mention_count}`}</span>
                <span>{`Last seen · ${renderTimestamp(artifact.last_seen_at, 'No shared snapshot timestamp')}`}</span>
                <span>{`Source kinds · ${renderNamedList(artifact.source_kinds, 'No source kinds')}`}</span>
                <span>{`Participating agents · ${renderNamedList(artifact.agent_ids, 'No participating agents')}`}</span>
              </li>
            ))}
            {collectorSignalItems.map((item) => {
              const collectorEvidenceRefs = resolveCollectorEvidenceRefs(item);
              const collectorLabel = agentNameById.get(item.agent_id) ?? item.agent_id;
              const canNavigateToCollectorAgent = navigableAgentIds.has(item.agent_id);
              const watchGraphAlignment = resolveCollectorWatchGraphAlignment(item, world);
              const collectorEvidenceCoverageItem = collectorEvidenceCoverageByAgentId.get(item.agent_id) ?? null;
              const sourceHealthFacts = deriveCollectorItemSourceHealthFacts(item);
              const sourceDrilldownGroups = deriveCollectorItemSourceDrilldownGroups(item);

              return (
                <li key={item.agent_id} className={`aitown-record severity-${resolveCollectorSeverity(item)}`}>
                  <strong>
                    {canNavigateToCollectorAgent
                      ? renderAgentPivotButton({
                          agentId: item.agent_id,
                          label: collectorLabel,
                          ariaLabel: `Select collector supervision agent ${item.agent_id}`,
                          correlationId: selectedCorrelationId,
                          onSelectAgent
                        })
                      : collectorLabel}
                  </strong>
                  <span>{`Collector state · ${item.heartbeat.current_state}`}</span>
                  <span>{`Needs attention · ${item.supervision.needs_attention ? 'Yes' : 'No'}`}</span>
                  <span>{`Reboot flag · ${item.heartbeat.reboot_recommended ? 'Recommended' : 'No'}`}</span>
                  {renderCollectorProvenancePreview({
                    item,
                    sharedMemoryArtifactRefs,
                    onJump: onFocusSharedMemoryArtifact ?? focusSharedMemoryArtifact
                  })}
                  {renderSourceHealthFacts(sourceHealthFacts)}
                  {renderSourceDrilldownGroups(sourceDrilldownGroups)}
                  {collectorEvidenceCoverageItem
                    ? renderCollectorEvidenceCoverageItem({
                        coverageItem: collectorEvidenceCoverageItem,
                        coverageLow: collectorEvidenceCoverageLowAgentIds.has(item.agent_id)
                      })
                    : null}
                  <span>
                    Watch target ·{' '}
                    {renderCollectorWatchTarget({
                      watchTarget: item.supervision.watch_target,
                      currentAgentId: item.agent_id,
                      navigableAgentIds,
                      ariaLabelPrefix: `Select collector supervision watch target from collector ${item.agent_id}`,
                      correlationId: selectedCorrelationId,
                      onSelectAgent
                    })}
                  </span>
                  <span>
                    Watchers ·{' '}
                    {renderAgentPivotList({
                      agentIds: item.supervision.watched_by,
                      currentAgentId: null,
                      navigableAgentIds,
                      emptyLabel: 'No watchers',
                      ariaLabelPrefix: `Select collector supervision watcher from collector ${item.agent_id}`,
                      correlationId: selectedCorrelationId,
                      preserveNullCorrelation:
                        selectedAgent === null &&
                        selectedCorrelationId === null &&
                        incidentFeedState === 'ready',
                      onSelectAgent
                    })}
                  </span>
                  <span>{`Watch graph alignment · ${watchGraphAlignment}`}</span>
                  <span>
                    Evidence ·{' '}
                    {renderSharedMemoryEvidenceRefs({
                      evidenceRefs: collectorEvidenceRefs,
                      sharedMemoryArtifactRefs,
                      onJump: sharedMemoryEvidenceJump.onJump,
                      jumpAriaLabelPrefix: 'Jump to collector evidence ref',
                      allowExactFallback: sharedMemoryEvidenceJump.allowExactFallback
                    })}
                  </span>
                </li>
              );
            })}
            {collectorSnapshotState === 'ready' && !collectorSnapshotError && !collectorSnapshot ? (
              <li className="aitown-record">No collector snapshot available yet.</li>
            ) : null}
            {collectorSnapshot && collectorSharedArtifacts === undefined ? (
              <li className="aitown-record">Collector shared snapshot artifacts unavailable in latest collector snapshot.</li>
            ) : null}
            {collectorSharedArtifacts && collectorSharedArtifacts.length === 0 ? (
              <li className="aitown-record">No shared snapshot artifacts in latest collector snapshot.</li>
            ) : null}
            {collectorSnapshot && collectorSignalItems.length === 0 ? (
              <li className="aitown-record">No collector attention items in latest snapshot.</li>
            ) : null}
          </ul>
        </section>
        ) : null}

        {shouldRenderCrewCategory ? (
        <section className="aitown-details__section aitown-details__section--crew-roster">
          <h3>Roster</h3>
          <div className="aitown-roster">
            {agents.map((agent) => (
              <button
                key={agent.agentId}
                type="button"
                className={`aitown-roster__button severity-${agent.severity}`}
                aria-label={`Inspect ${agent.displayName}`}
                onClick={() => onInspectAgent(agent.agentId)}
              >
                <strong>{agent.displayName}</strong>
                <span>{SEVERITY_LABELS[agent.severity]}</span>
              </button>
            ))}
          </div>
        </section>
        ) : null}

        {shouldRenderQueueCategory ? (
        <section className="aitown-details__section">
          <h3>Attention Queue</h3>
          <ul className="aitown-records">
            {attentionQueue.map((agent) => {
              const badge = selectAgentBadge(agent);

              return (
                <li key={agent.agent_id} className={`aitown-record severity-${agent.severity}`}>
                  <button
                    type="button"
                    className={`aitown-roster__button severity-${agent.severity}`}
                    aria-label={`Inspect ${agent.display_name} from attention queue`}
                    onClick={() => onSelectAgent(agent.agent_id)}
                  >
                    <strong>{agent.display_name}</strong>
                    <span>{`${SEVERITY_LABELS[agent.severity]} · ${renderDisplayState(agent.raw_state)}`}</span>
                  </button>
                  <span>{`Active task · ${agent.active_task}`}</span>
                  <span>{`Reboot recommendation · ${agent.reboot_recommended ? 'Recommended' : 'No'}`}</span>
                  <span>{`Zone · ${selectAgentZoneLabel(agent, world.zones)}`}</span>
                  <span>{`Reason · ${badge.text}`}</span>
                </li>
              );
            })}
            {attentionQueue.length === 0 ? <li className="aitown-record">No agents need attention.</li> : null}
          </ul>
        </section>
        ) : null}

        {shouldRenderCrewCategory ? (
        <section className="aitown-details__section aitown-details__section--crew-office-grid">
          <h3>Office Grid</h3>
          <ul className="aitown-records">
            {officeGrid.map(({ zone, occupants, homeAgentLabel, severitySummary }) => {
              const homeAgentId = zone.home_agent_id;
              const canNavigateToHomeAgent = homeAgentId !== null && navigableAgentIds.has(homeAgentId);

              return (
                <li key={zone.zone_id} className="aitown-record">
                  <strong>{zone.label}</strong>
                  <span>{`Kind · ${zone.kind}`}</span>
                  <span>
                    Home ·{' '}
                    {canNavigateToHomeAgent && homeAgentLabel
                      ? renderAgentPivotButton({
                          agentId: homeAgentId,
                          label: homeAgentLabel,
                          ariaLabel: `Select home agent ${homeAgentLabel} in ${zone.label}`,
                          correlationId: selectedCorrelationId,
                          onSelectAgent
                        })
                      : (homeAgentLabel ?? 'Unassigned')}
                  </span>
                  <span>
                    Occupants ·{' '}
                    {renderZoneOccupants({
                      zoneLabel: zone.label,
                      occupants,
                      currentAgentId: null,
                      navigableAgentIds,
                      correlationId: selectedCorrelationId,
                      onSelectAgent
                    })}
                  </span>
                  <span>{`Severity · ${severitySummary}`}</span>
                  {onFocusWorldZone ? (
                    <span>
                      Viewport ·{' '}
                      <button
                        type="button"
                        className="aitown-link-button"
                        aria-label={`Focus ${zone.label} in world viewport`}
                        onClick={() => onFocusWorldZone(zone.zone_id)}
                      >
                        Focus
                      </button>
                    </span>
                  ) : null}
                </li>
              );
            })}
            {officeGrid.length === 0 ? <li className="aitown-record">No office zones available.</li> : null}
          </ul>
        </section>
        ) : null}

        {shouldRenderSupervisionCategory ? (
        <section className="aitown-details__section aitown-details__section--supervision-topology">
          <h3>Watch Topology</h3>
          <ul className="aitown-records">
            {world.watch_edges.map((edge) => {
              const risk = selectWatchEdgeRisk(edge);
              const fromLabel = agentNameById.get(edge.from_agent_id) ?? edge.from_agent_id;
              const toLabel = agentNameById.get(edge.to_agent_id) ?? edge.to_agent_id;

              return (
                <li key={`${edge.from_agent_id}-${edge.to_agent_id}-${edge.watch_mode}`} className={`aitown-record severity-${risk.level}`}>
                  <strong>
                    {renderWatchTopologyAgent({
                      agentId: edge.from_agent_id,
                      label: fromLabel,
                      roleLabel: 'source',
                      watchMode: edge.watch_mode,
                      fromAgentId: edge.from_agent_id,
                      toAgentId: edge.to_agent_id,
                      navigableAgentIds,
                      correlationId: selectedCorrelationId,
                      onSelectAgent
                    })}
                    {' -> '}
                    {renderWatchTopologyAgent({
                      agentId: edge.to_agent_id,
                      label: toLabel,
                      roleLabel: 'target',
                      watchMode: edge.watch_mode,
                      fromAgentId: edge.from_agent_id,
                      toAgentId: edge.to_agent_id,
                      navigableAgentIds,
                      correlationId: selectedCorrelationId,
                      onSelectAgent
                    })}
                  </strong>
                  <span>{`Mode · ${edge.watch_mode}`}</span>
                  <span>{`Risk · ${risk.label} · ${SEVERITY_LABELS[edge.risk_level]}`}</span>
                </li>
              );
            })}
            {world.watch_edges.length === 0 ? <li className="aitown-record">No active watch edges.</li> : null}
          </ul>
        </section>
        ) : null}

        {shouldRenderQueueCategory ? activeCorrelationQueueSection : null}

        {shouldRenderSupervisionCategory ? (
        <section className="aitown-details__section aitown-details__section--supervision-open-alerts">
          <h3>Open Supervision Alerts</h3>
          {openSupervisionAlertsWarning ? <p role="status">{openSupervisionAlertsWarning}</p> : null}
          <p>
            <label htmlFor="aitown-open-supervision-alerts-severity-filter">Severity filter</label>{' '}
            <select
              id="aitown-open-supervision-alerts-severity-filter"
              aria-label="Filter open supervision alerts by severity"
              value={selectedCrewOpenSupervisionSeverity ?? ''}
              onChange={(event) =>
                onSelectCrewOpenSupervisionSeverity(event.target.value ? (event.target.value as Severity) : null)
              }
            >
              <option value="">All severities</option>
              <option value="normal">Normal</option>
              <option value="yellow">Yellow</option>
              <option value="orange">Orange</option>
              <option value="red">Red</option>
            </select>
          </p>
          <ul className="aitown-records">
            {openSupervisionAlertsState === 'loading' && !openSupervisionAlerts ? (
              <li className="aitown-record">
                {renderOpenSupervisionAlertsLoadingLabel(selectedCrewOpenSupervisionSeverity)}
              </li>
            ) : null}
            {openSupervisionAlertsError && !openSupervisionAlerts ? (
              <li className="aitown-record">
                {renderOpenSupervisionAlertsErrorLabel(
                  selectedCrewOpenSupervisionSeverity,
                  openSupervisionAlertsError
                )}
              </li>
            ) : null}
            {(openSupervisionAlerts?.items ?? []).map((alert) =>
              renderCrewOpenSupervisionAlert({
                alert,
                agentNameById,
                sharedMemoryArtifactRefs,
                activeCorrelationId: selectedCorrelationId,
                navigableAgentIds,
                onSelectAgent,
                onSelectCorrelation,
                onFocusSharedMemoryArtifact
              })
            )}
            {openSupervisionAlertsState === 'ready' &&
            !openSupervisionAlertsError &&
            (openSupervisionAlerts?.items.length ?? 0) === 0 ? (
              <li className="aitown-record">
                {renderOpenSupervisionAlertsEmptyLabel(selectedCrewOpenSupervisionSeverity)}
              </li>
            ) : null}
          </ul>
        </section>
        ) : null}

        {shouldRenderMemoryCategory ? renderSharedMemorySection({
          memoryArtifacts,
          memoryArtifactsError,
          memoryArtifactsState,
          sharedMemoryRequestScopeLabel,
          focusedSharedMemoryArtifactRef,
          focusedSharedMemoryBacklinks: focusedSharedMemoryBacklinks.items,
          focusedSharedMemoryBacklinkOverflowCount: focusedSharedMemoryBacklinks.overflowCount,
          sharedMemoryJumpStatus,
          activeCorrelationId: sharedMemoryActiveCorrelationId,
          currentAgentId: null,
          navigableAgentIds,
          onOpenReplayCheckpoint,
          onSelectAgent,
          onSelectCorrelation
        }) : null}

        {shouldRenderEvidenceCategory ? (
        <section className="aitown-details__section">
          <h3>Incident Feed</h3>
          <ul className="aitown-records">
            {incidentFeedState === 'loading' && !incidentFeed ? (
              <li className="aitown-record">Loading incident feed...</li>
            ) : null}
            {incidentFeedError && incidentFeedState !== 'loading' ? (
              <li className="aitown-record">{incidentFeedError}</li>
            ) : null}
            {(incidentFeed?.items ?? []).slice(0, 4).map((incident) =>
              renderIncidentRecord({
                incident,
                activeCorrelationId: selectedCorrelationId,
                currentAgentId: null,
                navigableAgentIds,
                sharedMemoryArtifactRefs,
                enableSharedMemoryEvidenceJump: true,
                onFocusSharedMemoryArtifact,
                onSelectAgent,
                onSelectCorrelation,
                includeAgentPivot: true,
                includeActorPivot: true,
                includeCounterpartyPivots: true,
                counterpartyPivotAriaLabelPrefix: `Select incident feed counterparty agent from incident ${incident.incident_id}`,
                selectableCorrelationId: resolveSelectableIncidentCorrelationId(
                  incident,
                  crewIncidentCorrelationSelectableIds
                ),
                layout: 'evidence-card'
              })
            )}
            {incidentFeedState === 'ready' && !incidentFeedError && !incidentFeed?.items.length ? (
              <li className="aitown-record">No active incident feed.</li>
            ) : null}
          </ul>
        </section>
        ) : null}

        {shouldRenderReplayCategory ? renderTimelineReplaySection({
          scopedReplayCorrelationId: manualCorrelationOverrideActive ? selectedCorrelationId : null,
          replayCheckpointEventId: activeReplayCheckpointEventId,
          selectedSeverity: selectedCrewReplaySeverity,
          timelineReplayItems: timelineReplay?.items ?? [],
          timelineReplayError,
          timelineReplayState,
          hasReplaySnapshot: timelineReplay !== null,
          loadingLabel: activeReplayCheckpointEventId
            ? renderReplayCheckpointLoadingLabel(activeReplayCheckpointEventId)
            : renderCrewReplayLoadingLabel(
                manualCorrelationOverrideActive ? selectedCorrelationId : null,
                selectedCrewReplaySeverity
              ),
          emptyLabel: activeReplayCheckpointEventId
            ? renderReplayCheckpointEmptyLabel(activeReplayCheckpointEventId)
            : renderCrewReplayEmptyLabel(
                manualCorrelationOverrideActive ? selectedCorrelationId : null,
                selectedCrewReplaySeverity
              ),
          initialErrorLabel: activeReplayCheckpointEventId
            ? renderReplayCheckpointInitialErrorLabel(activeReplayCheckpointEventId, timelineReplayError)
            : renderCrewReplayInitialErrorLabel(
                manualCorrelationOverrideActive ? selectedCorrelationId : null,
                selectedCrewReplaySeverity,
                timelineReplayError
              ),
          degradedErrorLabel: activeReplayCheckpointEventId
            ? renderReplayCheckpointDegradedErrorLabel(activeReplayCheckpointEventId, timelineReplayError)
            : renderCrewReplayDegradedErrorLabel(
                manualCorrelationOverrideActive ? selectedCorrelationId : null,
                selectedCrewReplaySeverity,
                timelineReplayError
              ),
          activeCorrelationId: selectedCorrelationId,
          currentAgentId: null,
          navigableAgentIds,
          agentNameById,
          zoneLabelById,
          sharedMemoryArtifactRefs,
          onSelectSeverity: onSelectCrewReplaySeverity,
          onFocusSharedMemoryArtifact,
          onFocusWorldZone,
          onSelectAgent,
          onSelectCorrelation
        }) : null}

        {shouldRenderReplayCategory ? (
        <section className="aitown-details__section">
          <h3>Correlation Drilldown</h3>
          <ul className="aitown-records">
            {correlationState === 'loading' && !correlation ? (
              <li className="aitown-record">Loading correlation drilldown...</li>
            ) : null}
            {correlationError ? <li className="aitown-record">{correlationError}</li> : null}
            {correlation ? (
              <>
                <li className="aitown-record">
                  <strong>{correlation.correlation_id}</strong>
                  <span>
                    Participants ·{' '}
                    {renderAgentPivotList({
                      agentIds: correlation.participant_agent_ids,
                      currentAgentId: null,
                      navigableAgentIds,
                      emptyLabel: 'No participants',
                      ariaLabelPrefix: 'Select correlation participant agent',
                      correlationId: correlation.correlation_id,
                      onSelectAgent
                    })}
                  </span>
                  <span>
                    Evidence ·{' '}
                    {renderSharedMemoryEvidenceRefs({
                      evidenceRefs: correlation.evidence_refs,
                      sharedMemoryArtifactRefs,
                      onJump: sharedMemoryEvidenceJump.onJump,
                      allowExactFallback: sharedMemoryEvidenceJump.allowExactFallback
                    })}
                  </span>
                  <span>{`Counts · ${correlation.incident_count} incidents · ${correlation.interaction_count} interactions · ${correlation.event_count} events`}</span>
                </li>
                {renderCorrelationClosureLedger({
                  correlation,
                  sharedMemoryArtifactRefs,
                  onJump: sharedMemoryEvidenceJump.onJump,
                  allowExactFallback: sharedMemoryEvidenceJump.allowExactFallback
                })}
                {correlation.incidents.map((incident) =>
                  renderIncidentRecord({
                    incident,
                    activeCorrelationId: sharedMemoryActiveCorrelationId,
                    currentAgentId: null,
                    navigableAgentIds,
                    sharedMemoryArtifactRefs,
                    enableSharedMemoryEvidenceJump: true,
                    onFocusSharedMemoryArtifact,
                    onSelectAgent,
                    onSelectCorrelation,
                    includeAgentPivot: false,
                    includeActorPivot: true,
                    actorPivotAriaLabelPrefix: 'Select correlation incident actor from incident',
                    includeCorrelationPivot: false
                  })
                )}
                {correlation.interactions.map((interaction) =>
                  renderCorrelationInteraction({
                    interaction,
                    activeCorrelationId: sharedMemoryActiveCorrelationId,
                    currentAgentId: null,
                    navigableAgentIds,
                    onSelectAgent,
                    sharedMemoryArtifactRefs,
                    enableSharedMemoryEvidenceJump: true,
                    onFocusSharedMemoryArtifact
                  })
                )}
                {correlation.timeline.map((event) =>
                  renderCorrelationTimelineEvent({
                    event,
                    activeCorrelationId: sharedMemoryActiveCorrelationId,
                    currentAgentId: null,
                    navigableAgentIds,
                    onSelectAgent,
                    sharedMemoryArtifactRefs,
                    enableSharedMemoryEvidenceJump: true,
                    onFocusSharedMemoryArtifact
                  })
                )}
              </>
            ) : null}
            {correlationState !== 'loading' && !correlationError && !correlation ? (
              <li className="aitown-record">No correlation selected.</li>
            ) : null}
          </ul>
        </section>
        ) : null}
      </aside>
    );
  }

  const selectedWorldAgent = world.agents.get(selectedAgent.agent_id) ?? null;
  const inboundWatchers = world.watch_edges.filter((edge) => edge.to_agent_id === selectedAgent.agent_id);
  const selectedOperationLoadsIndependently = Boolean(selectedOperationRequestActive);
  const selectedOperationLoadingState =
    selectedOperationLoadsIndependently && selectedOperation === null && operationsState === 'loading';
  const selectedOperationErrorState =
    selectedOperationLoadsIndependently && selectedOperation === null && Boolean(operationsError);
  const currentOperationMissingFromQueue =
    selectedOperation !== null && operationsState === 'ready' && (operations?.items ?? []).length === 0;
  const currentOperationWarning =
    selectedOperation !== null
      ? operationsError
        ? `Showing last operation snapshot. ${operationsError}`
        : currentOperationMissingFromQueue
          ? 'Showing last operation snapshot. Operation is no longer in the active queue.'
          : null
      : null;
  const currentOperationIsStale = currentOperationWarning !== null;
  const selectedOperationLatestEvent = currentOperationIsStale ? null : selectedOperation?.latest_event ?? null;
  const latestWorkflowTimelineEvent = selectLatestTimelineEvent(workflow?.timeline ?? []);
  const workflowIncidents = dedupeIncidents([
    ...(workflow?.incidents ?? []),
    ...(workflow?.detail.recent_incidents ?? [])
  ]);
  const relatedIncidentsFromWorkflow = workflowIncidents.length > 0;
  const relatedIncidents = relatedIncidentsFromWorkflow
    ? workflowIncidents
    : dedupeIncidents(
        (incidentFeed?.items ?? []).filter((incident) => incident.agent_id === selectedAgent.agent_id)
      );
  const location = selectedWorldAgent?.zone ?? workflow?.detail.current_location ?? selectedAgent.current_location;
  const severityLabel = selectedWorldAgent
    ? SEVERITY_LABELS[selectedWorldAgent.severity]
    : SEVERITY_LABELS[selectedAgent.effective_severity];
  const phaseLabel = selectedWorldAgent?.phase ?? selectedAgent.current_state;
  const workflowAlertCorrelationIds = new Set(
    (workflow?.detail.open_peer_watch_alerts ?? []).flatMap((alert) => (alert.correlation_id ? [alert.correlation_id] : []))
  );
  const workflowPivotCorrelationIds = (workflow?.correlation_ids ?? []).filter(
    (correlationId) => Boolean(correlationId) && !workflowAlertCorrelationIds.has(correlationId)
  );
  const workflowHasAdditionalPivots =
    workflowPivotCorrelationIds.length > 0 || (workflow?.counterparty_agent_ids.length ?? 0) > 0;
  const selectedCollectorEvidenceRefs = selectedCollectorItem ? resolveCollectorEvidenceRefs(selectedCollectorItem) : [];
  const selectedCollectorSourceHealthFacts = selectedCollectorItem
    ? deriveCollectorItemSourceHealthFacts(selectedCollectorItem)
    : [];
  const selectedCollectorSourceDrilldownGroups = selectedCollectorItem
    ? deriveCollectorItemSourceDrilldownGroups(selectedCollectorItem)
    : [];
  const selectedCollectorHasFocusedSourceGroup = activeSourceGapFocusIntent
    ? selectedCollectorSourceDrilldownGroups.some(
        (group) => group.key === activeSourceGapFocusIntent.sourceDrilldownGroupKey
      )
    : false;
  const selectedCollectorWatchGraphAlignment = selectedCollectorItem
    ? resolveCollectorWatchGraphAlignment(selectedCollectorItem, world)
    : null;
  const outboundWatchers = world.watch_edges.filter((edge) => edge.from_agent_id === selectedAgent.agent_id);
  const selectedOperationCorrelationId = currentOperationIsStale ? null : selectedOperation?.correlation_id ?? null;
  const selectedOperationLatestEventActorId = selectedOperation?.latest_event?.actor_id ?? null;
  const selectedOperationActorPivotCorrelationId = selectedCorrelationId ?? selectedOperationCorrelationId;
  const selectedOperationCounterpartyPivotCorrelationId = selectedCorrelationId ?? selectedOperationCorrelationId;
  const canNavigateToSelectedOperationLatestEventActor = Boolean(
    !currentOperationIsStale &&
      selectedOperationLatestEventActorId &&
      selectedOperationLatestEventActorId !== selectedAgent.agent_id &&
      navigableAgentIds.has(selectedOperationLatestEventActorId)
  );
  const accountabilityCorrelationId =
    selectedCorrelationId ?? selectedOperationCorrelationId ?? correlation?.correlation_id ?? workflow?.correlation_ids[0] ?? null;
  const alignedWorkflowAlerts = (workflow?.detail.open_peer_watch_alerts ?? []).filter((alert) =>
    isAlignedCorrelation(alert.correlation_id, accountabilityCorrelationId)
  );
  const alignedWorkflowEvents = (workflow?.detail.recent_events ?? []).filter((event) =>
    isAlignedCorrelation(event.correlation_id, accountabilityCorrelationId)
  );
  const alignedWorkflowInteractions = (workflow?.detail.recent_interactions ?? []).filter((interaction) =>
    isAlignedCorrelation(interaction.correlation_id, accountabilityCorrelationId)
  );
  const alignedWorkflowIncidents = (workflow?.detail.recent_incidents ?? []).filter((incident) =>
    isAlignedCorrelation(incident.correlation_id, accountabilityCorrelationId)
  );
  const alignedWorkflowHandoffs = (workflow?.detail.recent_handoffs ?? []).filter((handoff) =>
    isAlignedCorrelation(handoff.correlation_id, accountabilityCorrelationId)
  );
  const alignedWorkflowReboots = (workflow?.detail.recent_reboots ?? []).filter((reboot) =>
    isAlignedCorrelation(reboot.correlation_id, accountabilityCorrelationId)
  );
  const alignedWorkflowTimeline = (workflow?.timeline ?? []).filter((event) =>
    isAlignedCorrelation(event.correlation_id, accountabilityCorrelationId)
  );
  const selectedAgentReplayUsesScopedCorrelation = selectedCorrelationId !== null;
  const selectedAgentCanonicalReplayItems = (selectedAgentTimelineReplay?.items ?? []).filter(
    (event) => event.agent_id === selectedAgent.agent_id
  );
  const selectedAgentFallbackScopedReplayItems = (correlation?.timeline ?? []).filter(
    (event) => event.agent_id === selectedAgent.agent_id
  );
  const selectedAgentFallbackUnscopedReplayItems = filterTimelineBySeverity(
    workflow?.timeline ?? [],
    selectedAgentReplaySeverity
  );
  const selectedAgentFallbackFilteredScopedReplayItems = filterTimelineBySeverity(
    selectedAgentFallbackScopedReplayItems,
    selectedAgentReplaySeverity
  );
  const selectedAgentUsesCanonicalTimelineReplay =
    selectedAgentTimelineReplay !== null ||
    selectedAgentTimelineReplayError !== null ||
    selectedAgentTimelineReplayState !== 'idle';
  const selectedAgentReplayItems = selectedAgentUsesCanonicalTimelineReplay
    ? selectedAgentCanonicalReplayItems
    : selectedAgentReplayUsesScopedCorrelation
      ? selectedAgentFallbackFilteredScopedReplayItems
      : selectedAgentFallbackUnscopedReplayItems;
  const selectedAgentReplayHasSnapshot = selectedAgentUsesCanonicalTimelineReplay
    ? selectedAgentTimelineReplay !== null
    : selectedAgentReplayUsesScopedCorrelation
      ? correlation !== null
      : workflow !== null;
  const selectedAgentReplayState = selectedAgentUsesCanonicalTimelineReplay
    ? selectedAgentTimelineReplayState
    : selectedAgentReplayUsesScopedCorrelation
      ? correlationState
      : workflowState;
  const selectedAgentReplayError = selectedAgentUsesCanonicalTimelineReplay
    ? selectedAgentTimelineReplayError
    : selectedAgentReplayUsesScopedCorrelation
      ? correlationError
      : workflowError;
  const selectedAgentReplayScopeLabel = selectedCorrelationId
    ? `Target agent · ${selectedAgent.agent_id} · ${selectedCorrelationId}`
    : `Target agent · ${selectedAgent.agent_id}`;
  const alignedWorkflowIncidentHistory = (workflow?.incidents ?? []).filter((incident) =>
    isAlignedCorrelation(incident.correlation_id, accountabilityCorrelationId)
  );
  const alignedWorkflowHistoryInteractions = (workflow?.interactions ?? []).filter((interaction) =>
    isAlignedCorrelation(interaction.correlation_id, accountabilityCorrelationId)
  );
  const alignedWorkflowHistoryInteraction = alignedWorkflowHistoryInteractions[0] ?? null;
  const alignedCorrelation = correlation && accountabilityCorrelationId === correlation.correlation_id ? correlation : null;
  const alignedWorkflowTimelineEvent = selectLatestTimelineEvent(alignedWorkflowTimeline);
  const alignedCorrelationTimelineEvent = selectLatestTimelineEvent(alignedCorrelation?.timeline ?? []);
  const includeSelectedOperationSignal =
    selectedOperationLatestEvent !== null && selectedOperationCorrelationId === accountabilityCorrelationId;
  const accountabilityMemoryArtifacts = (memoryArtifacts?.items ?? [])
    .filter(
      (artifact) =>
        accountabilityCorrelationId
          ? artifact.correlation_ids.includes(accountabilityCorrelationId)
          : artifact.agent_ids.includes(selectedAgent.agent_id) ||
            (selectedOperationCorrelationId ? artifact.correlation_ids.includes(selectedOperationCorrelationId) : false)
    )
    .slice(0, 2);
  const accountabilityWhat = findFirstNonEmptyString([
    includeSelectedOperationSignal ? selectedOperationLatestEvent?.summary : null,
    alignedWorkflowEvents[0]?.summary,
    alignedWorkflowInteractions[0]?.summary,
    alignedWorkflowIncidents[0]?.summary,
    alignedWorkflowHandoffs[0]?.summary,
    alignedWorkflowReboots[0]?.summary,
    alignedWorkflowTimelineEvent?.summary,
    alignedWorkflowHistoryInteraction?.summary,
    alignedWorkflowIncidentHistory[0]?.summary,
    alignedCorrelation?.interactions[0]?.summary,
    alignedCorrelation?.incidents[0]?.summary,
    alignedCorrelationTimelineEvent?.summary,
    alignedWorkflowAlerts[0]?.summary,
    accountabilityCorrelationId ? null : latestWorkflowTimelineEvent?.summary,
    accountabilityCorrelationId ? null : workflow?.interactions[0]?.summary,
    accountabilityCorrelationId ? null : workflow?.incidents[0]?.summary,
    selectedCollectorItem?.heartbeat.current_blocker,
    selectedCollectorItem?.heartbeat.active_task,
    selectedAgent.active_task
  ]);
  const accountabilityEvidenceRefs = dedupeNonEmptyStrings([
    ...(includeSelectedOperationSignal ? selectedOperationLatestEvent?.evidence_refs ?? [] : []),
    ...alignedWorkflowAlerts.flatMap((alert) => alert.evidence_refs),
    ...alignedWorkflowEvents.flatMap((event) => event.evidence_refs),
    ...alignedWorkflowInteractions.flatMap((interaction) => interaction.evidence_refs),
    ...alignedWorkflowIncidents.flatMap((incident) => incident.evidence_refs),
    ...alignedWorkflowHandoffs.flatMap((handoff) => handoff.evidence_refs),
    ...alignedWorkflowReboots.flatMap((reboot) => reboot.evidence_refs),
    ...alignedWorkflowTimeline.flatMap((event) => event.evidence_refs),
    ...alignedWorkflowHistoryInteractions.flatMap((interaction) => interaction.evidence_refs),
    ...alignedWorkflowIncidentHistory.flatMap((incident) => incident.evidence_refs),
    ...(alignedCorrelation?.evidence_refs ?? []),
    ...(accountabilityCorrelationId || !selectedCollectorItem ? [] : selectedCollectorEvidenceRefs)
  ]).slice(0, 4);
  const accountabilityInteractionSourceKinds = collectInteractionSourceKinds({
    workflowInteractions: [...alignedWorkflowInteractions, ...alignedWorkflowHistoryInteractions],
    correlationInteractions: alignedCorrelation?.interactions ?? []
  });
  const accountabilityWhatUsesInteractionProvenance = [
    alignedWorkflowInteractions[0]?.summary,
    alignedWorkflowHistoryInteraction?.summary,
    alignedCorrelation?.interactions[0]?.summary
  ].some((summary) => summary === accountabilityWhat && summary !== null);
  const accountabilitySources = dedupeNonEmptyStrings([
    ...(accountabilityWhatUsesInteractionProvenance ? accountabilityInteractionSourceKinds : []),
    includeSelectedOperationSignal ? selectedOperationLatestEvent?.source_kind : null,
    ...alignedWorkflowAlerts.map((alert) => alert.source_kind),
    ...alignedWorkflowEvents.map((event) => event.source_kind),
    ...alignedWorkflowIncidents.map((incident) => incident.source_kind),
    ...alignedWorkflowHandoffs.map((handoff) => handoff.source_kind),
    ...alignedWorkflowReboots.map((reboot) => reboot.source_kind),
    ...alignedWorkflowTimeline.map((event) => event.source_kind),
    ...(accountabilityWhatUsesInteractionProvenance ? [] : accountabilityInteractionSourceKinds),
    ...alignedWorkflowIncidentHistory.map((incident) => incident.source_kind),
    ...(alignedCorrelation?.incidents.map((incident) => incident.source_kind) ?? []),
    ...(alignedCorrelation?.timeline.map((event) => event.source_kind) ?? []),
    ...accountabilityMemoryArtifacts.flatMap((artifact) => artifact.source_kinds),
    accountabilityCorrelationId || !collectorSnapshot ? null : `collector:${collectorSnapshot.actor_id}`
  ]).slice(0, 5);
  const accountabilityCorrelationCounts =
    alignedCorrelation
      ? `${alignedCorrelation.incident_count} incidents · ${alignedCorrelation.interaction_count} interactions · ${alignedCorrelation.event_count} events`
      : null;

  return (
    <aside
      className={detailsPanelClassName}
      role="complementary"
      aria-label="Agent details"
      data-active-hub-category={activeHubCategory}
      data-selected-agent-drilldown-tab={selectedAgentDrilldownTab ?? undefined}
      data-selected-agent-supervision-panel={selectedAgentSupervisionPanelMode ?? undefined}
    >
      <div className="aitown-details__head">
        <div>
          <h2>{selectedAgent.display_name}</h2>
          <p>{workflow?.detail.active_task ?? selectedAgent.active_task}</p>
        </div>
        <button type="button" className="aitown-button" onClick={() => onSelectAgent(null)}>
          Clear
        </button>
      </div>

      <div className="aitown-details__summary">
        <p>
          {phaseLabel} · {severityLabel} · {location}
          {manualCorrelationResetAction}
        </p>
      </div>

      {renderHubCategoryOrientation({ activeHubCategory, selectedAgent })}

      {activeSourceGapFocusIntent ? renderSourceGapContextBreadcrumb(activeSourceGapFocusIntent) : null}

      <div className="aitown-details__grid">
        <div className="aitown-stat-card">
          <span>Location</span>
          <strong>{location}</strong>
        </div>
        <div className="aitown-stat-card">
          <span>Alerts</span>
          <strong>{selectedWorldAgent?.open_alert_count ?? 0}</strong>
        </div>
        <div className="aitown-stat-card">
          <span>Observed By</span>
          <strong>{inboundWatchers.length}</strong>
        </div>
        <div className="aitown-stat-card">
          <span>Reboot</span>
          <strong>{selectedAgent.reboot_recommended ? 'Recommended' : 'No'}</strong>
        </div>
      </div>

      {activeHubCategory === 'supervision' ? (
        <div className="aitown-selected-supervision-summary-grid" aria-label="Selected agent supervision summary">
          <div className="aitown-stat-card aitown-stat-card--supervision">
            <span>Observed by</span>
            <strong>{inboundWatchers.length}</strong>
          </div>
          <div className="aitown-stat-card aitown-stat-card--supervision">
            <span>Watches</span>
            <strong>{outboundWatchers.length}</strong>
          </div>
          <div className="aitown-stat-card aitown-stat-card--supervision">
            <span>History rows</span>
            <strong>{selectedAgentSupervisionHistory?.items.length ?? 0}</strong>
          </div>
          <div className="aitown-stat-card aitown-stat-card--supervision">
            <span>Collector flag</span>
            <strong>{selectedCollectorItem?.supervision.needs_attention ? 'Yes' : 'No'}</strong>
          </div>
        </div>
      ) : null}

      {selectedAgentSupervisionDeckEnabled && selectedAgentSupervisionPanelMode === null ? (
        <div className="aitown-selected-supervision-deck" role="group" aria-label="Selected agent supervision deck">
          {(
            [
              ['collector', selectedCollectorItem ? selectedCollectorItem.heartbeat.current_state : 'No collector row', true],
              [
                'history',
                `${selectedAgentSupervisionHistory?.items.length ?? 0} history row${
                  (selectedAgentSupervisionHistory?.items.length ?? 0) === 1 ? '' : 's'
                }`,
                true
              ],
              ['audit', accountabilityWhat ?? 'No live accountability signal', true],
              [
                'workflow',
                workflowSummaryFacets
                  ? `${workflowSummaryFacets.counts.incident_count} incidents · ${workflowSummaryFacets.counts.event_count} events`
                  : 'No workflow summary',
                true
              ],
              ['memory', `${memoryArtifacts?.items.length ?? 0} artifact${(memoryArtifacts?.items.length ?? 0) === 1 ? '' : 's'}`, true],
              ['incidents', `${relatedIncidents.length} incident${relatedIncidents.length === 1 ? '' : 's'}`, true],
              ['queue', activeCorrelationQueueDeckSummary, canOpenActiveCorrelationQueuePanel]
            ] satisfies Array<[SelectedAgentSupervisionPanel, string, boolean]>
          ).map(([panel, summary, enabled]) => (
            <button
              key={panel}
              type="button"
              className="aitown-selected-supervision-deck__button"
              aria-label={`Open ${SELECTED_AGENT_SUPERVISION_PANEL_LABELS[panel]} supervision panel`}
              disabled={!enabled}
              onClick={enabled ? () => setSelectedAgentSupervisionPanel(panel) : undefined}
            >
              <strong>{SELECTED_AGENT_SUPERVISION_PANEL_LABELS[panel]}</strong>
              <span>{summary}</span>
            </button>
          ))}
        </div>
      ) : null}

      <section
        className="aitown-details__section aitown-details__section--selected-evidence aitown-details__section--hub-supervision aitown-details__section--hub-evidence aitown-details__section--selected-supervision-observation"
        hidden={!shouldShowSelectedAgentSupervisionPanel('collector')}
      >
        <h3>Collector Observation</h3>
        {renderSelectedAgentSupervisionPanelBackButton('collector')}
        {collectorWarning ? <p role="status">{collectorWarning}</p> : null}
        <ul className="aitown-records">
          {collectorSnapshotState === 'loading' && !collectorSnapshot ? (
            <li className="aitown-record">Loading collector snapshot...</li>
          ) : null}
          {collectorSnapshotError && !collectorSnapshot ? (
            <li className="aitown-record">{`Unable to load collector snapshot. ${collectorSnapshotError}`}</li>
          ) : null}
          {collectorSnapshot && selectedCollectorItem ? (
            <li className={`aitown-record severity-${resolveCollectorSeverity(selectedCollectorItem)}`}>
              <strong>{agentNameById.get(selectedCollectorItem.agent_id) ?? selectedCollectorItem.agent_id}</strong>
              <span>{`Latest snapshot · ${collectorSnapshot.collected_at}`}</span>
              <span>{`Heartbeat received · ${selectedCollectorItem.heartbeat.received_at}`}</span>
              <span>{`Collector state · ${selectedCollectorItem.heartbeat.current_state}`}</span>
              <span>{`Active task · ${selectedCollectorItem.heartbeat.active_task}`}</span>
              <span>{`Current blocker · ${renderOperationBlocker(selectedCollectorItem.heartbeat.current_blocker)}`}</span>
              <span>{`Attention flag · ${selectedCollectorItem.supervision.needs_attention ? 'Needs attention' : 'No'}`}</span>
              <span>{`Reboot flag · ${selectedCollectorItem.heartbeat.reboot_recommended ? 'Recommended' : 'No'}`}</span>
              {renderCollectorProvenancePreview({
                item: selectedCollectorItem,
                sharedMemoryArtifactRefs,
                onJump: onFocusSharedMemoryArtifact ?? focusSharedMemoryArtifact
              })}
              {renderSourceHealthFacts(selectedCollectorSourceHealthFacts)}
              {renderSourceDrilldownGroups(selectedCollectorSourceDrilldownGroups, 'Source health', {
                idPrefix: 'aitown-selected-agent-source-drilldown',
                focusedGroupKey: activeSourceGapFocusIntent?.sourceDrilldownGroupKey ?? null
              })}
              {collectorEvidenceCoverageByAgentId.has(selectedCollectorItem.agent_id)
                ? renderCollectorEvidenceCoverageItem({
                    coverageItem: collectorEvidenceCoverageByAgentId.get(selectedCollectorItem.agent_id)!,
                    coverageLow: collectorEvidenceCoverageLowAgentIds.has(selectedCollectorItem.agent_id)
                  })
                : null}
              {activeSourceGapFocusIntent && !selectedCollectorHasFocusedSourceGroup ? (
                <span>{`Source-gap focus · No collector source evidence for ${activeSourceGapFocusIntent.agentId} in snapshot ${collectorSnapshot.collected_at}.`}</span>
              ) : null}
              <span>
                Watch target ·{' '}
                {renderCollectorWatchTarget({
                  watchTarget: selectedCollectorItem.supervision.watch_target,
                  currentAgentId: selectedAgent.agent_id,
                  navigableAgentIds,
                  correlationId: selectedCorrelationId,
                  onSelectAgent
                })}
              </span>
              <span>
                Watched by ·{' '}
                {renderAgentPivotList({
                  agentIds: selectedCollectorItem.supervision.watched_by,
                  currentAgentId: selectedAgent.agent_id,
                  navigableAgentIds,
                  emptyLabel: 'No watchers',
                  ariaLabelPrefix: 'Select collector observation watcher',
                  correlationId: selectedCorrelationId,
                  onSelectAgent
                })}
              </span>
              <span>{`Watch graph alignment · ${selectedCollectorWatchGraphAlignment}`}</span>
              <span>{`Workspace observations · ${selectedCollectorItem.workspace_observations.length}`}</span>
              <span>{`Tmux observations · ${selectedCollectorItem.tmux_observations.length}`}</span>
              <span>{`Workspace root · ${selectedCollectorItem.workspace_root}`}</span>
              <span>{`Session · ${selectedCollectorItem.session_ref}`}</span>
              <span>
                Evidence ·{' '}
                {renderSharedMemoryEvidenceRefs({
                  evidenceRefs: selectedCollectorEvidenceRefs,
                  sharedMemoryArtifactRefs,
                  onJump: sharedMemoryEvidenceJump.onJump,
                  jumpAriaLabelPrefix: 'Jump to collector evidence ref',
                  allowExactFallback: sharedMemoryEvidenceJump.allowExactFallback
                })}
              </span>
            </li>
          ) : null}
          {collectorSnapshotState === 'ready' && !collectorSnapshotError && !collectorSnapshot ? (
            <li className="aitown-record">No collector snapshot available yet.</li>
          ) : null}
          {collectorSnapshot && !selectedCollectorItem && activeSourceGapFocusIntent ? (
            <li className="aitown-record">
              {`Source-gap focus · No collector source evidence for ${activeSourceGapFocusIntent.agentId} in snapshot ${collectorSnapshot.collected_at}.`}
            </li>
          ) : null}
          {collectorSnapshot && !selectedCollectorItem ? (
            <li className="aitown-record">No collector observation context for this agent in latest snapshot.</li>
          ) : null}
        </ul>
      </section>

      <section
        className="aitown-details__section aitown-details__section--selected-evidence aitown-details__section--hub-supervision aitown-details__section--hub-evidence aitown-details__section--selected-supervision-history"
        hidden={!shouldShowSelectedAgentSupervisionPanel('history')}
      >
        <h3>Supervision History</h3>
        {renderSelectedAgentSupervisionPanelBackButton('history')}
        {supervisionHistoryWarning ? <p role="status">{supervisionHistoryWarning}</p> : null}
        <p className="aitown-evidence-toolbar">
          <span className="aitown-evidence-toolbar__scope">{`Request scope · ${selectedAgentSupervisionHistoryRequestScopeLabel}`}</span>
          <span className="aitown-evidence-toolbar__filter">
            <label htmlFor="aitown-selected-agent-supervision-history-severity-filter">Severity filter</label>
            <select
              id="aitown-selected-agent-supervision-history-severity-filter"
              aria-label="Filter supervision history by severity"
              value={selectedAgentSupervisionHistorySeverity ?? ''}
              onChange={(event) =>
                onSelectSelectedAgentSupervisionHistorySeverity(
                  event.target.value ? (event.target.value as Severity) : null
                )
              }
            >
              <option value="">All severities</option>
              <option value="normal">Normal</option>
              <option value="yellow">Yellow</option>
              <option value="orange">Orange</option>
              <option value="red">Red</option>
            </select>
          </span>
        </p>
        <ul className="aitown-records">
          {selectedAgentSupervisionHistoryState === 'loading' && !selectedAgentSupervisionHistory ? (
            <li className="aitown-record">
              {renderSelectedAgentSupervisionHistoryLoadingLabel(selectedAgentSupervisionHistorySeverity)}
            </li>
          ) : null}
          {selectedAgentSupervisionHistoryError && !selectedAgentSupervisionHistory ? (
            <li className="aitown-record">
              {renderSelectedAgentSupervisionHistoryErrorLabel(
                selectedAgentSupervisionHistorySeverity,
                selectedAgentSupervisionHistoryError
              )}
            </li>
          ) : null}
          {(selectedAgentSupervisionHistory?.items ?? []).map((alert) =>
            renderSelectedAgentSupervisionAlert({
              alert,
              sharedMemoryArtifactRefs,
              activeCorrelationId: selectedCorrelationId,
              currentAgentId: selectedAgent.agent_id,
              navigableAgentIds,
              onSelectAgent,
              onSelectCorrelation,
              onFocusSharedMemoryArtifact
            })
          )}
          {selectedAgentSupervisionHistoryState === 'ready' &&
          (selectedAgentSupervisionHistory?.items.length ?? 0) === 0 ? (
            <li className="aitown-record">
              {renderSelectedAgentSupervisionHistoryEmptyLabel(selectedAgentSupervisionHistorySeverity)}
            </li>
          ) : null}
        </ul>
      </section>

      {selectedOperation || selectedOperationLoadingState || selectedOperationErrorState ? (
        <>
          <section className="aitown-details__section aitown-details__section--selected-now aitown-details__section--hub-crew aitown-details__section--hub-queue">
            <h3>Current Operation</h3>
            {currentOperationWarning ? <p role="status">{currentOperationWarning}</p> : null}
            <ul className="aitown-records">
              {selectedOperationLoadingState ? (
                <li className="aitown-record">{renderSelectedOperationLoadingLabel()}</li>
              ) : null}
              {selectedOperationErrorState && operationsError ? (
                <li className="aitown-record">{renderSelectedOperationErrorLabel(operationsError)}</li>
              ) : null}
              {selectedOperation ? (
                <li className={`aitown-record severity-${selectedOperation.effective_severity}`}>
                  <strong>{selectedOperation.display_name}</strong>
                  <span>{`${selectedOperation.current_state} · ${selectedOperation.current_blocker || selectedOperation.active_task}`}</span>
                  <span>{`Location · ${selectedOperation.current_location}`}</span>
                  <span>{`Latest event · ${selectedOperation.latest_event?.summary ?? 'No latest event yet'}`}</span>
                  <span>
                    Actor ·{' '}
                    {canNavigateToSelectedOperationLatestEventActor && selectedOperation.latest_event
                      ? renderAgentPivotButton({
                          agentId: selectedOperation.latest_event.actor_id,
                          ariaLabel: `Select current operation actor from event ${selectedOperation.latest_event.event_id} ${selectedOperation.latest_event.actor_id}`,
                          correlationId: selectedOperationActorPivotCorrelationId,
                          onSelectAgent
                        })
                      : (selectedOperationLatestEventActorId ?? 'No actor')}
                  </span>
                  {selectedOperation.correlation_id && !currentOperationIsStale
                    ? renderCorrelationButton({
                        correlationId: selectedOperation.correlation_id,
                        label: selectedOperation.correlation_id,
                        buttonLabel: 'Open operation correlation',
                        activeCorrelationId: selectedCorrelationId,
                        preserveAutoOnDefaultReselect: true,
                        onSelectCorrelation
                      })
                    : null}
                  <span>
                    {'Counterparties · '}
                    {currentOperationIsStale
                      ? renderCounterparties(selectedOperation.latest_event?.counterparty_agent_ids ?? [])
                      : renderAgentPivotList({
                          agentIds: selectedOperation.latest_event?.counterparty_agent_ids ?? [],
                          currentAgentId: selectedAgent.agent_id,
                          navigableAgentIds,
                          emptyLabel: 'No counterparties',
                          ariaLabelPrefix: 'Select operation counterparty agent',
                          correlationId: selectedOperationCounterpartyPivotCorrelationId,
                          onSelectAgent
                        })}
                  </span>
                  <span>
                    Evidence ·{' '}
                    {renderSharedMemoryEvidenceRefs({
                      evidenceRefs: selectedOperation.latest_event?.evidence_refs ?? [],
                      sharedMemoryArtifactRefs,
                      onJump: onFocusSharedMemoryArtifact ?? focusSharedMemoryArtifact,
                      allowExactFallback: true
                    })}
                  </span>
                  <span>{`Source · ${selectedOperation.latest_event?.source_kind ?? 'No latest event source'}`}</span>
                </li>
              ) : null}
            </ul>
          </section>
          {selectedOperation ? (
            <section className="aitown-details__section aitown-details__section--selected-now aitown-details__section--selected-evidence aitown-details__section--hub-crew aitown-details__section--hub-queue aitown-details__section--hub-evidence">
              <h3>Run Context</h3>
              <ul className="aitown-records">
                <li className={`aitown-record severity-${selectedOperation.effective_severity}`}>
                  <strong>{selectedOperation.display_name}</strong>
                  {currentOperationWarning ? (
                    <span>{`Operation source · Retained snapshot (${currentOperationWarning})`}</span>
                  ) : null}
                  <span>{`${currentOperationWarning ? 'Operation snapshot blocker' : 'Run blocker'} · ${renderOperationBlocker(selectedOperation.current_blocker)}`}</span>
                  <span>{`${currentOperationWarning ? 'Operation snapshot latest event type' : 'Latest event type'} · ${selectedOperation.latest_event?.event_type ?? 'No latest event type'}`}</span>
                  <span>{`${currentOperationWarning ? 'Operation snapshot latest event' : 'Latest event at'} · ${renderTimestamp(selectedOperation.latest_event?.ts ?? null, 'No latest event timestamp')}`}</span>
                  <span>{`${currentOperationWarning ? 'Operation snapshot last event' : 'Last event at'} · ${renderTimestamp(selectedOperation.last_event_at, 'No last event timestamp')}`}</span>
                  <span>{`${currentOperationWarning ? 'Operation snapshot heartbeat' : 'Last heartbeat'} · ${renderTimestamp(selectedOperation.last_heartbeat_at, 'No heartbeat yet')}`}</span>
                  <span>{`${currentOperationWarning ? 'Operation snapshot output' : 'Last output'} · ${renderTimestamp(selectedOperation.last_meaningful_output_at, 'No last output timestamp')}`}</span>
                  <span>{`${currentOperationWarning ? 'Operation snapshot staleness' : 'Staleness'} · ${renderOperationStaleness(selectedOperation)}`}</span>
                  <span>{`${currentOperationWarning ? 'Operation snapshot reboot' : 'Reboot recommendation'} · ${selectedOperation.reboot_recommended ? 'Recommended' : 'No'}`}</span>
                  <span>
                    {renderFreshnessCause({
                      operation: selectedOperation,
                      collectorSnapshot,
                      collectorSnapshotError,
                      collectorSnapshotState,
                      operationSourceWarning: currentOperationWarning,
                      selectedCollectorItem,
                      workflow,
                      workflowHeartbeatTrusted: workflowError === null && workflowState === 'ready'
                    })}
                  </span>
                </li>
              </ul>
            </section>
          ) : null}
        </>
      ) : null}

      {shouldShowSelectedAgentSupervisionPanel('queue') ? activeCorrelationQueueSection : null}

      <section
        className="aitown-details__section aitown-details__section--selected-now aitown-details__section--selected-evidence aitown-details__section--hub-crew aitown-details__section--hub-supervision aitown-details__section--hub-evidence aitown-details__section--selected-supervision-audit"
        hidden={!shouldShowSelectedAgentSupervisionPanel('audit')}
      >
        <h3>Audit Signals</h3>
        {renderSelectedAgentSupervisionPanelBackButton('audit')}
        <ul className="aitown-records">
          <li className={`aitown-record severity-${selectedAgent.effective_severity}`}>
            <strong>Responsibility chain</strong>
            <span>
              Who ·{' '}
              {renderResponsibilityChain({
                selectedAgentId: selectedAgent.agent_id,
                selectedAgentLabel: selectedAgent.display_name,
                inboundWatchers,
                outboundWatchers,
                agentNameById,
                navigableAgentIds,
                correlationId: accountabilityCorrelationId,
                onSelectAgent
              })}
            </span>
            <span>{`What · ${accountabilityWhat ?? 'No live accountability signal'}`}</span>
            <span>
              Evidence ·{' '}
              {accountabilityEvidenceRefs.length > 0
                ? renderSharedMemoryEvidenceRefs({
                    evidenceRefs: accountabilityEvidenceRefs,
                    sharedMemoryArtifactRefs,
                    onJump: sharedMemoryEvidenceJump.onJump,
                    jumpAriaLabelPrefix: 'Jump to accountability evidence ref',
                    allowExactFallback: sharedMemoryEvidenceJump.allowExactFallback
                  })
                : 'No loaded evidence refs'}
            </span>
            <span>
              Artifacts ·{' '}
              {renderAccountabilityArtifactJumpList({
                artifacts: accountabilityMemoryArtifacts,
                onJump: sharedMemoryEvidenceJump.onJump
              })}
            </span>
            <span>{`Source · ${renderNamedList(accountabilitySources, 'No loaded source signals')}`}</span>
            <span>
              Correlation ·{' '}
              {accountabilityCorrelationId
                ? renderCorrelationButton({
                    correlationId: accountabilityCorrelationId,
                    label: accountabilityCorrelationId,
                    buttonLabel: 'Open accountability correlation',
                    activeCorrelationId: selectedCorrelationId,
                    onSelectCorrelation
                  })
                : 'No active correlation id'}
              {accountabilityCorrelationCounts ? ` · ${accountabilityCorrelationCounts}` : null}
            </span>
          </li>
        </ul>
      </section>

      <section className="aitown-details__section aitown-details__section--selected-evidence aitown-details__section--hub-evidence">
        <h3>Evidence Ledger</h3>
        <ul className="aitown-records">
          <li className="aitown-record">
            <strong>{`Scope · ${selectedAgentEvidenceLedger?.requestScopeLabel ?? 'Selected-agent evidence records'}`}</strong>
            {selectedAgentEvidenceLedgerState === 'loading' && selectedAgentEvidenceLedger ? (
              <span>Refreshing evidence ledger...</span>
            ) : null}
            {selectedAgentEvidenceLedgerError && selectedAgentEvidenceLedger ? (
              <span>{`Last-good view · Refresh failed: ${selectedAgentEvidenceLedgerError}`}</span>
            ) : null}
          </li>
          {selectedAgentEvidenceLedgerState === 'loading' && !selectedAgentEvidenceLedger ? (
            <li className="aitown-record">Loading evidence ledger...</li>
          ) : null}
          {selectedAgentEvidenceLedgerError && !selectedAgentEvidenceLedger ? (
            <li className="aitown-record">{`Unable to load evidence ledger. ${selectedAgentEvidenceLedgerError}`}</li>
          ) : null}
          {selectedAgentEvidenceLedger ? (
            <>
              {renderSelectedAgentEvidenceProofCompass(selectedAgentEvidenceLedger)}
              {renderSelectedAgentEvidenceLedgerGroup(
                'output',
                'Output evidence',
                selectedAgentEvidenceLedger.outputEvidence,
                onInspectSelectedAgentEvidenceRecord
              )}
              {renderSelectedAgentEvidenceLedgerGroup(
                'non-output',
                'Non-output evidence',
                selectedAgentEvidenceLedger.nonOutputEvidence,
                onInspectSelectedAgentEvidenceRecord
              )}
              {renderSelectedAgentEvidenceLedgerGroup(
                'degraded',
                'Degraded evidence',
                selectedAgentEvidenceLedger.degradedEvidence,
                onInspectSelectedAgentEvidenceRecord
              )}
              {renderSelectedAgentEvidenceLedgerGroup(
                'unmapped',
                'Unmapped evidence',
                selectedAgentEvidenceLedger.unmappedEvidence,
                onInspectSelectedAgentEvidenceRecord
              )}
              {selectedAgentEvidenceLedger.isEmpty ? (
                <li className="aitown-record">No evidence records returned for this bounded request.</li>
              ) : null}
            </>
          ) : null}
        </ul>
      </section>

      {renderSelectedAgentEvidenceRecordDetail(
        selectedAgentEvidenceRecord,
        selectedAgentEvidenceRecordState,
        selectedAgentEvidenceRecordError,
        selectedAgentEvidenceRecordId,
        selectedAgentEvidenceProvenanceBundle,
        selectedAgentEvidenceProvenanceBundleState,
        selectedAgentEvidenceProvenanceBundleError,
        selectedAgentEvidenceSourceContext,
        selectedAgentEvidenceSourceContextState,
        selectedAgentEvidenceSourceContextError,
        selectedAgentEvidenceCheckpointLog,
        selectedAgentEvidenceCheckpointLogState,
        selectedAgentEvidenceCheckpointLogError,
        onInspectSelectedAgentEvidenceSourceContext,
        onReplaySelectedAgentEvidenceRecord
      )}

      <section
        className="aitown-details__section aitown-details__section--selected-evidence aitown-details__section--hub-supervision aitown-details__section--hub-evidence aitown-details__section--selected-supervision-workflow"
        hidden={!shouldShowSelectedAgentSupervisionPanel('workflow')}
      >
        <h3>Workflow</h3>
        {renderSelectedAgentSupervisionPanelBackButton('workflow')}
        {workflowWarning ? <p role="status">{workflowWarning}</p> : null}
        <ul className="aitown-records">
          {workflowState === 'loading' && !workflow ? (
            <li className="aitown-record">{renderWorkflowLoadingLabel()}</li>
          ) : null}
          {workflowError && !workflow ? (
            <li className="aitown-record">{renderWorkflowErrorLabel(workflowError)}</li>
          ) : null}
          {workflowSummaryFacets ? (
            <li className="aitown-record">
              <strong>Workflow summary</strong>
              <span>{`Counts · ${workflowSummaryFacets.counts.incident_count} incidents · ${workflowSummaryFacets.counts.interaction_count} interactions · ${workflowSummaryFacets.counts.event_count} events`}</span>
              <span>
                {`Incident kinds · ${renderWorkflowSummaryBucketList(
                  workflowSummaryFacets.incidentKinds,
                  'No incident kinds in current workflow window'
                )}`}
              </span>
              <span>
                {`Interaction types · ${renderWorkflowSummaryBucketList(
                  workflowSummaryFacets.interactionTypes,
                  'No interaction types in current workflow window'
                )}`}
              </span>
              <span>
                {`Event types · ${renderWorkflowSummaryBucketList(
                  workflowSummaryFacets.eventTypes,
                  'No event types in current workflow window'
                )}`}
              </span>
              <span>{`Severities · ${renderWorkflowSummarySeverityList(workflowSummaryFacets.severities)}`}</span>
              <span>
                {`Latest activity · ${renderTimestamp(
                  workflowSummaryFacets.latestActivityAt,
                  'No activity in current workflow window'
                )}`}
              </span>
            </li>
          ) : null}
          {selectedAgentDetailEvidenceFacets.status === 'evidence_present' ? (
            <li className="aitown-record">
              <strong>Structured evidence facets</strong>
              <span>Scope · Structured evidence facets from loaded workflow detail only; not full activity</span>
              <span>
                {`Facet counts · ${[
                  renderStructuredEvidenceFacetCount(
                    selectedAgentDetailEvidenceFacets.evidence_refs.length,
                    'evidence ref'
                  ),
                  renderStructuredEvidenceFacetCount(
                    selectedAgentDetailEvidenceFacets.source_kinds.length,
                    'source kind'
                  ),
                  renderStructuredEvidenceFacetCount(
                    selectedAgentDetailEvidenceFacets.correlation_ids.length,
                    'correlation'
                  ),
                  renderStructuredEvidenceFacetCount(
                    selectedAgentDetailEvidenceFacets.event_ids.length,
                    'event id'
                  ),
                  renderStructuredEvidenceFacetCount(
                    selectedAgentDetailEvidenceFacets.incident_ids.length,
                    'incident id'
                  ),
                  renderStructuredEvidenceFacetCount(
                    selectedAgentDetailEvidenceFacets.counterparty_agent_ids.length,
                    'counterparty',
                    'counterparties'
                  )
                ].join(' · ')}`}
              </span>
              <span>{`Structured rows · ${renderStructuredEvidenceFacetCount(selectedAgentDetailEvidenceFacets.rows.length, 'loaded detail row')}`}</span>
              <span>{`Evidence refs · ${renderCompactFacetList(selectedAgentDetailEvidenceFacets.evidence_refs, 'No evidence refs', formatPublicEvidenceRefLabel)}`}</span>
              <span>{`Source kinds · ${renderCompactFacetList(selectedAgentDetailEvidenceFacets.source_kinds, 'No source kinds')}`}</span>
              <span>{`Correlations · ${renderCompactFacetList(selectedAgentDetailEvidenceFacets.correlation_ids, 'No correlations')}`}</span>
              <span>{`Events · ${renderCompactFacetList(selectedAgentDetailEvidenceFacets.event_ids, 'No event ids')}`}</span>
              <span>{`Incidents · ${renderCompactFacetList(selectedAgentDetailEvidenceFacets.incident_ids, 'No incident ids')}`}</span>
              <span>{`Counterparties · ${renderCompactFacetList(selectedAgentDetailEvidenceFacets.counterparty_agent_ids, 'No counterparties')}`}</span>
            </li>
          ) : null}
          {workflow?.detail.latest_heartbeat ? (
            <li className="aitown-record">
              <strong>Latest heartbeat</strong>
              <span>{`Latest heartbeat · ${renderTimestamp(workflow.detail.latest_heartbeat.received_at ?? null, 'No heartbeat yet')}`}</span>
              <span>{`Recent interactions · ${workflow.detail.recent_interactions.length}`}</span>
              <span>{`Recent timeline · ${workflow.detail.recent_events.length}`}</span>
              <span>{`Recent handoffs · ${workflow.detail.recent_handoffs.length}`}</span>
              <span>{`Recent reboots · ${workflow.detail.recent_reboots.length}`}</span>
            </li>
          ) : null}
          {(workflow?.detail.open_peer_watch_alerts ?? []).map((alert) =>
            renderWorkflowPeerWatchAlert({
              alert,
              sharedMemoryArtifactRefs,
              activeCorrelationId: selectedCorrelationId,
              currentAgentId: selectedAgent?.agent_id ?? null,
              navigableAgentIds,
              onSelectAgent,
              onSelectCorrelation,
              onFocusSharedMemoryArtifact
            })
          )}
          {workflow && workflow.detail.open_peer_watch_alerts.length === 0 ? (
            <li className="aitown-record">No open watch alerts.</li>
          ) : null}
          {workflowHasAdditionalPivots ? (
            <li className="aitown-record">
              <strong>Workflow pivots</strong>
              {workflow?.counterparty_agent_ids.length ? (
                <span>
                  Counterparties ·{' '}
                  {renderAgentPivotList({
                    agentIds: workflow.counterparty_agent_ids,
                    currentAgentId: selectedAgent.agent_id,
                    navigableAgentIds,
                    emptyLabel: 'No counterparties',
                    ariaLabelPrefix: 'Select workflow counterparty agent',
                    correlationId: preserveWorkflowCounterpartyCorrelation ? selectedCorrelationId : null,
                    onSelectAgent
                  })}
                </span>
              ) : null}
              {workflowPivotCorrelationIds.map((correlationId) => (
                <div key={correlationId}>
                  {renderCorrelationButton({
                    correlationId,
                    label: correlationId,
                    buttonLabel: 'Open workflow correlation',
                    activeCorrelationId: selectedCorrelationId,
                    onSelectCorrelation
                  })}
                </div>
              ))}
            </li>
          ) : null}
          {(workflow?.detail.recent_interactions ?? []).slice(0, 2).map((interaction) =>
            renderCorrelationInteraction({
              interaction,
              activeCorrelationId: selectedCorrelationId,
              currentAgentId: selectedAgent.agent_id,
              navigableAgentIds,
              onSelectAgent,
              onSelectCorrelation,
              participantAriaLabelPrefix: `Select workflow interaction participant from interaction ${interaction.interaction_id}`,
              sharedMemoryArtifactRefs,
              enableSharedMemoryEvidenceJump: true,
              onFocusSharedMemoryArtifact,
              publicEvidenceLabels: true
            })
          )}
          {(workflow?.detail.recent_events ?? []).slice(0, 2).map((event) =>
            renderCorrelationTimelineEvent({
              event,
              activeCorrelationId: selectedCorrelationId,
              currentAgentId: selectedAgent.agent_id,
              navigableAgentIds,
              onSelectAgent,
              subjectPivotAriaLabelPrefix: 'Select workflow recent event subject agent from event',
              actorPivotAriaLabelPrefix: 'Select workflow recent event actor from event',
              counterpartyPivotAriaLabelPrefix: `Select workflow recent event counterparty from event ${event.event_id}`,
              sharedMemoryArtifactRefs,
              enableSharedMemoryEvidenceJump: true,
              onFocusSharedMemoryArtifact,
              publicEvidenceLabels: true
            })
          )}
          {(workflow?.detail.recent_handoffs ?? []).slice(0, 2).map((handoff) =>
            renderWorkflowStatusRecord({
              key: handoff.handoff_id,
              kind: 'Handoff',
              severity: handoff.severity,
              summary: handoff.summary,
              ts: handoff.ts,
              actorId: handoff.actor_id,
              status: handoff.status,
              phase: handoff.phase,
              counterpartyAgentIds: handoff.counterparty_agent_ids,
              evidenceRefs: handoff.evidence_refs,
              sharedMemoryArtifactRefs,
              correlationId: handoff.correlation_id,
              activeCorrelationId: selectedCorrelationId,
              sourceKind: handoff.source_kind,
              currentAgentId: selectedAgent.agent_id,
              navigableAgentIds,
              onSelectAgent,
              onSelectCorrelation,
              onFocusSharedMemoryArtifact
            })
          )}
          {(workflow?.detail.recent_reboots ?? []).slice(0, 2).map((reboot) =>
            renderWorkflowStatusRecord({
              key: reboot.reboot_id,
              kind: 'Reboot',
              severity: reboot.severity,
              summary: reboot.summary,
              ts: reboot.ts,
              actorId: reboot.actor_id,
              status: reboot.status,
              phase: reboot.phase,
              counterpartyAgentIds: reboot.counterparty_agent_ids,
              evidenceRefs: reboot.evidence_refs,
              sharedMemoryArtifactRefs,
              correlationId: reboot.correlation_id,
              activeCorrelationId: selectedCorrelationId,
              sourceKind: reboot.source_kind,
              currentAgentId: selectedAgent.agent_id,
              navigableAgentIds,
              onSelectAgent,
              onSelectCorrelation,
              onFocusSharedMemoryArtifact
            })
          )}
        </ul>
      </section>

      {renderSharedMemorySection({
        sectionClassName:
          'aitown-details__section--selected-evidence aitown-details__section--hub-memory aitown-details__section--hub-supervision aitown-details__section--hub-evidence aitown-details__section--selected-supervision-memory',
        hidden: !shouldShowSelectedAgentSupervisionPanel('memory'),
        headerAction: renderSelectedAgentSupervisionPanelBackButton('memory'),
        memoryArtifacts,
        memoryArtifactsError,
        memoryArtifactsState,
        sharedMemoryRequestScopeLabel,
        focusedSharedMemoryArtifactRef,
        focusedSharedMemoryBacklinks: focusedSharedMemoryBacklinks.items,
        focusedSharedMemoryBacklinkOverflowCount: focusedSharedMemoryBacklinks.overflowCount,
        sharedMemoryJumpStatus,
        activeCorrelationId: sharedMemoryActiveCorrelationId,
        currentAgentId: selectedAgent.agent_id,
        navigableAgentIds,
        onOpenReplayCheckpoint,
        onSelectAgent,
        onSelectCorrelation
      })}

      <section
        className="aitown-details__section aitown-details__section--selected-evidence aitown-details__section--hub-supervision aitown-details__section--hub-evidence aitown-details__section--selected-supervision-incidents"
        hidden={!shouldShowSelectedAgentSupervisionPanel('incidents')}
      >
        <h3>Incident Feed</h3>
        {renderSelectedAgentSupervisionPanelBackButton('incidents')}
        <ul className="aitown-records">
          {incidentFeedState === 'loading' && !incidentFeed ? (
            <li className="aitown-record">Loading incident feed...</li>
          ) : null}
          {incidentFeedError && incidentFeedState !== 'loading' ? (
            <li className="aitown-record">{incidentFeedError}</li>
          ) : null}
          {relatedIncidents.map((incident) =>
            renderIncidentRecord({
              incident,
              activeCorrelationId: selectedCorrelationId,
              currentAgentId: selectedAgent.agent_id,
              navigableAgentIds,
              sharedMemoryArtifactRefs,
              enableSharedMemoryEvidenceJump: true,
              onFocusSharedMemoryArtifact,
              onSelectAgent,
              onSelectCorrelation,
              includeAgentPivot: false,
              includeActorPivot: true,
              includeCounterpartyPivots: true,
              counterpartyPivotAriaLabelPrefix: `Select incident feed counterparty agent from incident ${incident.incident_id}`,
              selectableCorrelationId: relatedIncidentsFromWorkflow
                ? incident.correlation_id
                : resolveSelectableIncidentCorrelationId(incident, crewIncidentCorrelationSelectableIds),
              layout: 'evidence-card'
            })
          )}
          {incidentFeedState === 'ready' && !incidentFeedError && relatedIncidents.length === 0 ? (
            <li className="aitown-record">No incident feed entries.</li>
          ) : null}
        </ul>
      </section>

      {renderTimelineReplaySection({
        sectionClassName: 'aitown-details__section--selected-replay aitown-details__section--hub-replay',
        requestScopeLabel: selectedAgentReplayScopeLabel,
        scopedReplayCorrelationId: selectedCorrelationId,
        replayCheckpointEventId: activeReplayCheckpointEventId,
        selectedSeverity: selectedAgentReplaySeverity,
        timelineReplayItems: selectedAgentReplayItems,
        timelineReplayError: selectedAgentReplayError,
        timelineReplayState: selectedAgentReplayState,
        hasReplaySnapshot: selectedAgentReplayHasSnapshot,
        loadingLabel: activeReplayCheckpointEventId
          ? renderReplayCheckpointLoadingLabel(activeReplayCheckpointEventId)
          : renderSelectedAgentReplayLoadingLabel(selectedCorrelationId, selectedAgentReplaySeverity),
        emptyLabel: activeReplayCheckpointEventId
          ? renderReplayCheckpointEmptyLabel(activeReplayCheckpointEventId)
          : renderSelectedAgentReplayEmptyLabel(selectedCorrelationId, selectedAgentReplaySeverity),
        initialErrorLabel: activeReplayCheckpointEventId
          ? renderReplayCheckpointInitialErrorLabel(activeReplayCheckpointEventId, selectedAgentReplayError)
          : renderSelectedAgentReplayInitialErrorLabel(
              selectedCorrelationId,
              selectedAgentReplaySeverity,
              selectedAgentReplayError
            ),
        degradedErrorLabel: activeReplayCheckpointEventId
          ? renderReplayCheckpointDegradedErrorLabel(activeReplayCheckpointEventId, selectedAgentReplayError)
          : renderSelectedAgentReplayDegradedErrorLabel(
              selectedCorrelationId,
              selectedAgentReplaySeverity,
              selectedAgentReplayError
            ),
        activeCorrelationId: selectedCorrelationId,
        currentAgentId: selectedAgent.agent_id,
        navigableAgentIds,
        agentNameById,
        zoneLabelById,
        sharedMemoryArtifactRefs,
        onSelectSeverity: onSelectSelectedAgentReplaySeverity,
        onFocusSharedMemoryArtifact,
        onFocusWorldZone,
        onSelectAgent,
        onSelectCorrelation
      })}

      {renderSelectedAgentReplayBundleSection({
        replayBundle: selectedAgentAccountabilityReplay,
        replayBundleError: selectedAgentAccountabilityReplayError,
        replayBundleState: selectedAgentAccountabilityReplayState,
        sharedMemoryArtifactRefs,
        onFocusSharedMemoryArtifact,
        onOpenReplayCheckpoint,
        onBackToSelectedAgentEvidenceRecord
      })}

      <section className="aitown-details__section aitown-details__section--selected-replay aitown-details__section--hub-replay">
        <h3>Correlation Drilldown</h3>
        <ul className="aitown-records">
          {correlationState === 'loading' && !correlation ? (
            <li className="aitown-record">Loading correlation drilldown...</li>
          ) : null}
          {correlationError ? <li className="aitown-record">{correlationError}</li> : null}
          {correlation ? (
            <>
              <li className="aitown-record">
                <strong>{correlation.correlation_id}</strong>
                <span>
                  Participants ·{' '}
                  {renderAgentPivotList({
                    agentIds: correlation.participant_agent_ids,
                    currentAgentId: selectedAgent.agent_id,
                    navigableAgentIds,
                    emptyLabel: 'No participants',
                    ariaLabelPrefix: 'Select correlation participant agent',
                    onSelectAgent
                  })}
                </span>
                <span>
                  Evidence ·{' '}
                  {renderSharedMemoryEvidenceRefs({
                    evidenceRefs: correlation.evidence_refs,
                    sharedMemoryArtifactRefs,
                    onJump: sharedMemoryEvidenceJump.onJump,
                    allowExactFallback: sharedMemoryEvidenceJump.allowExactFallback
                  })}
                </span>
                <span>{`Counts · ${correlation.incident_count} incidents · ${correlation.interaction_count} interactions · ${correlation.event_count} events`}</span>
              </li>
              {renderCorrelationClosureLedger({
                correlation,
                sharedMemoryArtifactRefs,
                onJump: sharedMemoryEvidenceJump.onJump,
                allowExactFallback: sharedMemoryEvidenceJump.allowExactFallback
              })}
              {correlation.incidents.map((incident) =>
                renderIncidentRecord({
                  incident,
                  activeCorrelationId: selectedCorrelationId,
                  currentAgentId: selectedAgent.agent_id,
                  navigableAgentIds,
                  sharedMemoryArtifactRefs,
                  enableSharedMemoryEvidenceJump: true,
                  onFocusSharedMemoryArtifact,
                  onSelectAgent,
                  onSelectCorrelation,
                  includeAgentPivot: true,
                  includeActorPivot: true,
                  actorPivotAriaLabelPrefix: 'Select correlation incident actor from incident',
                  includeCounterpartyPivots: true,
                  includeCorrelationPivot: false
                })
              )}
              {correlation.interactions.map((interaction) =>
                renderCorrelationInteraction({
                  interaction,
                  activeCorrelationId: selectedCorrelationId,
                  currentAgentId: selectedAgent.agent_id,
                  navigableAgentIds,
                  onSelectAgent,
                  sharedMemoryArtifactRefs,
                  enableSharedMemoryEvidenceJump: true,
                  onFocusSharedMemoryArtifact
                })
              )}
              {correlation.timeline.map((event) =>
                renderCorrelationTimelineEvent({
                  event,
                  activeCorrelationId: selectedCorrelationId,
                  currentAgentId: selectedAgent.agent_id,
                  navigableAgentIds,
                  onSelectAgent,
                  sharedMemoryArtifactRefs,
                  enableSharedMemoryEvidenceJump: true,
                  onFocusSharedMemoryArtifact
                })
              )}
            </>
          ) : null}
          {correlationState !== 'loading' && !correlationError && !correlation ? (
            <li className="aitown-record">No correlation selected.</li>
          ) : null}
        </ul>
      </section>
    </aside>
  );
}
