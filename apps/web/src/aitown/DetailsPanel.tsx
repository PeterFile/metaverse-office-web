import type {
  AgentWorkflow,
  CollectorItem,
  CollectorSnapshot,
  CollectorTmuxObservation,
  CollectorWorkspaceObservation,
  CorrelationDrilldown,
  IncidentFeedResponse,
  MemoryArtifact,
  MemoryArtifactIndex,
  OfficeAgent,
  OfficeOperation,
  OfficeOperations,
  OfficeZone,
  TimelineReplayResponse,
  WorkflowIncident,
  WorkflowInteraction,
  WorkflowPeerWatchAlert,
  WorkflowTimelineEvent
} from '../types';
import type { LoadState } from '../hooks/usePolledResource';
import { buildZoneLayoutModels } from '../layout';
import type { WorldState } from '../world/types';
import { selectAgentBadge, selectAgentZoneLabel, selectAttentionQueue, selectWatchEdgeRisk } from '../world/selectors';

type DetailsPanelProps = {
  collectorSnapshot: CollectorSnapshot | null;
  collectorSnapshotError: string | null;
  collectorSnapshotState: LoadState;
  correlation: CorrelationDrilldown | null;
  correlationError: string | null;
  correlationState: LoadState;
  incidentFeed: IncidentFeedResponse | null;
  incidentFeedError: string | null;
  incidentFeedState: LoadState;
  operations: OfficeOperations | null;
  operationsError: string | null;
  operationsState: LoadState;
  operationsStateBuckets: Record<string, number>;
  operationsStateBucketsError: string | null;
  operationsStateBucketsState: LoadState;
  overviewZones: OfficeZone[] | null;
  preserveWorkflowCounterpartyCorrelation: boolean;
  memoryArtifacts: MemoryArtifactIndex | null;
  memoryArtifactsError: string | null;
  memoryArtifactsState: LoadState;
  selectedAgent: OfficeAgent | null;
  selectedCorrelationId: string | null;
  selectedOperationsState: string | null;
  selectedOperation: OfficeOperation | null;
  timelineReplay: TimelineReplayResponse | null;
  timelineReplayError: string | null;
  timelineReplayState: LoadState;
  workflow: AgentWorkflow | null;
  workflowError: string | null;
  workflowState: LoadState;
  world: WorldState;
  onSelectAgent: (agentId: string | null, correlationId?: string | null) => void;
  onInspectAgent: (agentId: string | null) => void;
  onSelectCorrelation: (correlationId: string | null) => void;
  onSelectOperationsState: (state: string | null) => void;
  onSelectOperation: (operation: OfficeOperation) => void;
};

const SEVERITY_LABELS = {
  normal: 'Normal',
  yellow: 'Yellow',
  orange: 'Orange',
  red: 'Red'
} as const;

const SEVERITY_RANK = {
  normal: 0,
  yellow: 1,
  orange: 2,
  red: 3
} as const;

function dedupeIncidents(incidents: WorkflowIncident[]) {
  return incidents.filter(
    (incident, index, list) => list.findIndex((item) => item.incident_id === incident.incident_id) === index
  );
}

function renderCorrelationButton({
  correlationId,
  label,
  buttonLabel,
  activeCorrelationId,
  onSelectCorrelation
}: {
  correlationId: string | null;
  label: string;
  buttonLabel: string;
  activeCorrelationId: string | null;
  onSelectCorrelation: (correlationId: string | null) => void;
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
      onClick={() => onSelectCorrelation(correlationId)}
    >
      {label}
    </button>
  );
}

function renderAgentPivotButton({
  agentId,
  label = agentId,
  ariaLabel,
  correlationId = null,
  onSelectAgent
}: {
  agentId: string;
  label?: string;
  ariaLabel: string;
  correlationId?: string | null;
  onSelectAgent: (agentId: string | null, correlationId?: string | null) => void;
}) {
  return (
    <button
      type="button"
      className="aitown-link-button"
      aria-label={ariaLabel}
      onClick={() => onSelectAgent(agentId, correlationId)}
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
  onSelectAgent
}: {
  agentIds: string[];
  currentAgentId: string | null;
  navigableAgentIds: Set<string>;
  emptyLabel: string;
  ariaLabelPrefix: string;
  correlationId?: string | null;
  onSelectAgent: (agentId: string | null, correlationId?: string | null) => void;
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
  onSelectAgent: (agentId: string | null, correlationId?: string | null) => void;
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
  onSelectAgent: (agentId: string | null, correlationId?: string | null) => void;
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
  onSelectAgent: (agentId: string | null, correlationId?: string | null) => void;
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
  onSelectAgent: (agentId: string | null, correlationId?: string | null) => void;
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

function renderSharedMemoryEvidenceRefs({
  evidenceRefs,
  sharedMemoryArtifactRefs,
  onJump,
  jumpAriaLabelPrefix = 'Jump to shared memory artifact'
}: {
  evidenceRefs: string[];
  sharedMemoryArtifactRefs: ReadonlySet<string>;
  onJump: (artifactRef: string) => void;
  jumpAriaLabelPrefix?: string;
}) {
  if (evidenceRefs.length === 0) {
    return 'No evidence refs';
  }

  return evidenceRefs.map((evidenceRef, index) => (
    <span key={`${evidenceRef}-${index}`}>
      {index > 0 ? ', ' : null}
      {sharedMemoryArtifactRefs.has(evidenceRef) ? (
        <button
          type="button"
          className="aitown-link-button"
          aria-label={`${jumpAriaLabelPrefix} ${evidenceRef}`}
          onClick={() => onJump(evidenceRef)}
        >
          {evidenceRef}
        </button>
      ) : (
        <span>{evidenceRef}</span>
      )}
    </span>
  ));
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
  onSelectCorrelation: (correlationId: string | null) => void;
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

function renderTimestamp(value: string | null | undefined, fallback: string) {
  return findFirstNonEmptyString([value]) ?? fallback;
}

function renderOperationBlocker(blocker: string) {
  return blocker || 'No current blocker';
}

function renderOperationStaleness(operation: OfficeOperation) {
  return `${SEVERITY_LABELS[operation.derived_staleness.severity]} · ${operation.derived_staleness.stale_for_minutes ?? 0}m`;
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

function renderActiveQueueLoadingLabel(selectedOperationsState: string | null) {
  if (!selectedOperationsState) {
    return 'Loading operations queue...';
  }

  return `Loading active queue for ${renderDisplayState(selectedOperationsState)} state...`;
}

function renderActiveQueueErrorLabel(selectedOperationsState: string | null, operationsError: string) {
  if (!selectedOperationsState) {
    return `Unable to load active queue. ${operationsError}`;
  }

  return `Unable to load active queue for ${renderDisplayState(selectedOperationsState)} state. ${operationsError}`;
}

function renderActiveQueueWarningLabel(selectedOperationsState: string | null, operationsError: string) {
  if (!selectedOperationsState) {
    return `Showing last active queue snapshot. ${operationsError}`;
  }

  return `Showing last active queue snapshot for ${renderDisplayState(selectedOperationsState)} state. ${operationsError}`;
}

function renderActiveQueueEmptyLabel(selectedOperationsState: string | null) {
  if (!selectedOperationsState) {
    return 'No active operations queue.';
  }

  return `No active queue items for ${renderDisplayState(selectedOperationsState)} state.`;
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

function renderActiveQueueStateBucketsStatusLabel(error: string) {
  return `Showing last active queue state buckets. ${error}`;
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

function renderCollectorProvenancePreview(item: CollectorItem) {
  const latestWorkspaceObservation = selectLatestWorkspaceObservation(item.workspace_observations);
  const latestTmuxObservation = selectLatestTmuxObservation(item.tmux_observations);

  return (
    <>
      <span>{`Confidence · ${renderDisplayState(item.heartbeat.confidence_level)}`}</span>
      <span>{`Last output · ${item.heartbeat.last_meaningful_output_at ?? 'None'}`}</span>
      <span>{`Last file write · ${item.heartbeat.last_file_write_at ?? 'None'}`}</span>
      <span>
        {`Workspace preview · ${latestWorkspaceObservation ? renderWorkspaceObservationPreview(latestWorkspaceObservation) : 'None'}`}
      </span>
      <span>{`Tmux preview · ${latestTmuxObservation ? renderTmuxObservationPreview(latestTmuxObservation) : 'None'}`}</span>
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
  participantAriaLabelPrefix = 'Select correlation interaction participant agent'
}: {
  interaction: WorkflowInteraction;
  activeCorrelationId?: string | null;
  currentAgentId?: string | null;
  navigableAgentIds?: Set<string>;
  onSelectAgent?: (agentId: string | null, correlationId?: string | null) => void;
  onSelectCorrelation?: (correlationId: string | null) => void;
  sharedMemoryArtifactRefs?: ReadonlySet<string>;
  enableSharedMemoryEvidenceJump?: boolean;
  participantAriaLabelPrefix?: string;
}) {
  const canRenderParticipantPivots = Boolean(navigableAgentIds && onSelectAgent);
  const interactionCorrelationId = findFirstNonEmptyString([interaction.correlation_id]);
  const stateTransition =
    interaction.before_state && interaction.after_state
      ? `${interaction.before_state} -> ${interaction.after_state}`
      : interaction.before_state ?? interaction.after_state ?? null;

  return (
    <li key={interaction.interaction_id} className={`aitown-record severity-${interaction.severity ?? 'normal'}`}>
      <strong>{interaction.summary}</strong>
      <span>{`Interaction · ${interaction.interaction_type}`}</span>
      <span>{`Started · ${interaction.started_at}`}</span>
      {interaction.ended_at ? <span>{`Ended · ${interaction.ended_at}`}</span> : null}
      <span>{`Trigger · ${interaction.trigger_event_id}`}</span>
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
            onJump: focusSharedMemoryArtifact
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
        subjectPivotAriaLabelPrefix?: string;
        actorPivotAriaLabelPrefix?: string;
        counterpartyPivotAriaLabelPrefix?: string;
      }
) {
  const event = 'event' in input ? input.event : input;
  const activeCorrelationId = 'event' in input ? (input.activeCorrelationId ?? null) : null;
  const currentAgentId = 'event' in input ? (input.currentAgentId ?? null) : null;
  const navigableAgentIds = 'event' in input ? input.navigableAgentIds : undefined;
  const onSelectAgent = 'event' in input ? input.onSelectAgent : undefined;
  const sharedMemoryArtifactRefs = 'event' in input ? input.sharedMemoryArtifactRefs : undefined;
  const enableSharedMemoryEvidenceJump = 'event' in input ? (input.enableSharedMemoryEvidenceJump ?? false) : false;
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

  return (
    <li key={event.event_id} className={`aitown-record severity-${event.severity}`}>
      <strong>{event.summary}</strong>
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
            onJump: focusSharedMemoryArtifact
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
  sharedMemoryArtifactRefs,
  onSelectAgent,
  onSelectCorrelation
}: {
  event: WorkflowTimelineEvent;
  activeCorrelationId: string | null;
  agentLabel: string;
  currentAgentId: string | null;
  navigableAgentIds: Set<string>;
  sharedMemoryArtifactRefs: ReadonlySet<string>;
  onSelectAgent: (agentId: string | null, correlationId?: string | null) => void;
  onSelectCorrelation: (correlationId: string | null) => void;
}) {
  const canNavigateToAgent = event.agent_id !== currentAgentId && navigableAgentIds.has(event.agent_id);
  const preservedCorrelationId = activeCorrelationId ?? event.correlation_id;
  const canNavigateToActor = event.actor_id !== currentAgentId && navigableAgentIds.has(event.actor_id);
  const currentReplayAgentId = currentAgentId ?? event.agent_id;

  return (
    <li key={event.event_id} className={`aitown-record severity-${event.severity}`}>
      <strong>{event.summary}</strong>
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
      <span>{`Location · ${event.location}`}</span>
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
          onJump: focusSharedMemoryArtifact
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
              correlationId: event.correlation_id,
              onSelectAgent
            })
          : agentLabel}
      </span>
    </li>
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
  onSelectCorrelation
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
  onSelectAgent: (agentId: string | null, correlationId?: string | null) => void;
  onSelectCorrelation: (correlationId: string | null) => void;
}) {
  const preservedCorrelationId = activeCorrelationId ?? correlationId;
  const canNavigateToActor = actorId !== currentAgentId && navigableAgentIds.has(actorId);
  const actorPivotAriaLabelPrefix = `Select workflow status actor from ${kind.toLowerCase()}`;
  const counterpartyPivotAriaLabelPrefix = `Select workflow status counterparty from ${kind.toLowerCase()} ${key}`;

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
          onJump: focusSharedMemoryArtifact
        })}
      </span>
      <span>
        Correlation pivot ·{' '}
        {renderCorrelationButton({
          correlationId,
          label: correlationId ?? 'No correlation id',
          buttonLabel: 'Open workflow status correlation',
          activeCorrelationId,
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
  onSelectCorrelation
}: {
  alert: WorkflowPeerWatchAlert;
  sharedMemoryArtifactRefs: ReadonlySet<string>;
  activeCorrelationId: string | null;
  currentAgentId: string | null;
  navigableAgentIds: Set<string>;
  onSelectAgent: (agentId: string | null, correlationId?: string | null) => void;
  onSelectCorrelation: (correlationId: string | null) => void;
}) {
  const preservedCorrelationId = activeCorrelationId ?? alert.correlation_id;
  const canNavigateToTarget = alert.target_agent_id !== currentAgentId && navigableAgentIds.has(alert.target_agent_id);
  const canNavigateToObserver =
    alert.observer_agent_id !== currentAgentId && navigableAgentIds.has(alert.observer_agent_id);

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
      <span>
        Evidence ·{' '}
        {renderSharedMemoryEvidenceRefs({
          evidenceRefs: alert.evidence_refs,
          sharedMemoryArtifactRefs,
          onJump: focusSharedMemoryArtifact
        })}
      </span>
      <span>{`Evidence count · ${alert.evidence_count}`}</span>
      <span>{`Source · ${alert.source_kind}`}</span>
    </li>
  );
}

function renderSharedMemoryArtifact({
  artifact,
  activeCorrelationId,
  currentAgentId,
  navigableAgentIds,
  onSelectAgent,
  onSelectCorrelation
}: {
  artifact: MemoryArtifact;
  activeCorrelationId: string | null;
  currentAgentId: string | null;
  navigableAgentIds: Set<string>;
  onSelectAgent: (agentId: string | null, correlationId?: string | null) => void;
  onSelectCorrelation: (correlationId: string | null) => void;
}) {
  const artifactCorrelationId = findFirstNonEmptyString(artifact.correlation_ids);
  const preservedCorrelationId = activeCorrelationId ?? artifactCorrelationId;

  return (
    <li
      key={artifact.artifact_ref}
      id={resolveSharedMemoryArtifactDomId(artifact.artifact_ref)}
      className="aitown-record"
      data-shared-memory-target="true"
      tabIndex={-1}
    >
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
      {artifact.source_kinds.length > 0 ? (
        <span>{`Source kinds · ${renderNamedList(dedupeNonEmptyStrings(artifact.source_kinds), 'No source kinds')}`}</span>
      ) : null}
      {artifact.collector_last_modified_at ? (
        <span>{`Collector modified · ${artifact.collector_last_modified_at}`}</span>
      ) : null}
    </li>
  );
}

function renderSharedMemorySection({
  memoryArtifacts,
  memoryArtifactsError,
  memoryArtifactsState,
  activeCorrelationId,
  currentAgentId,
  navigableAgentIds,
  onSelectAgent,
  onSelectCorrelation
}: {
  memoryArtifacts: MemoryArtifactIndex | null;
  memoryArtifactsError: string | null;
  memoryArtifactsState: LoadState;
  activeCorrelationId: string | null;
  currentAgentId: string | null;
  navigableAgentIds: Set<string>;
  onSelectAgent: (agentId: string | null, correlationId?: string | null) => void;
  onSelectCorrelation: (correlationId: string | null) => void;
}) {
  const sharedMemoryWarning =
    memoryArtifactsError && memoryArtifacts
      ? `Showing last shared-memory snapshot. ${memoryArtifactsError}`
      : null;

  return (
    <section className="aitown-details__section">
      <h3>Shared Memory</h3>
      {sharedMemoryWarning ? <p role="status">{sharedMemoryWarning}</p> : null}
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

function renderIncidentRecord({
  incident,
  activeCorrelationId,
  currentAgentId,
  navigableAgentIds,
  sharedMemoryArtifactRefs,
  enableSharedMemoryEvidenceJump = false,
  onSelectAgent,
  onSelectCorrelation,
  includeAgentPivot,
  includeActorPivot = false,
  actorPivotAriaLabelPrefix = 'Select incident feed actor from incident',
  includeCounterpartyPivots = false,
  counterpartyPivotAriaLabelPrefix = 'Select correlation incident counterparty agent',
  includeCorrelationPivot = true
}: {
  incident: WorkflowIncident;
  activeCorrelationId: string | null;
  currentAgentId: string | null;
  navigableAgentIds: Set<string>;
  sharedMemoryArtifactRefs: ReadonlySet<string>;
  enableSharedMemoryEvidenceJump?: boolean;
  onSelectAgent: (agentId: string | null, correlationId?: string | null) => void;
  onSelectCorrelation: (correlationId: string | null) => void;
  includeAgentPivot: boolean;
  includeActorPivot?: boolean;
  actorPivotAriaLabelPrefix?: string;
  includeCounterpartyPivots?: boolean;
  counterpartyPivotAriaLabelPrefix?: string;
  includeCorrelationPivot?: boolean;
}) {
  return (
    <li key={incident.incident_id} className={`aitown-record severity-${incident.severity}`}>
      <strong>{incident.summary}</strong>
      {includeAgentPivot ? (
        <span>
          Agent ·{' '}
          {navigableAgentIds.has(incident.agent_id) && incident.agent_id !== currentAgentId
            ? renderAgentPivotButton({
                agentId: incident.agent_id,
                ariaLabel: `Select incident agent ${incident.agent_id} from incident ${incident.incident_id}`,
                correlationId: incident.correlation_id,
                onSelectAgent
              })
            : incident.agent_id}
        </span>
      ) : null}
      {includeCorrelationPivot
        ? renderCorrelationButton({
            correlationId: incident.correlation_id,
            label: incident.correlation_id ?? 'No correlation id',
            buttonLabel: 'Open incident correlation',
            activeCorrelationId,
            onSelectCorrelation
          })
        : null}
      <span>{`At · ${renderTimestamp(incident.ts, 'No incident timestamp')}`}</span>
      <span>
        Actor ·{' '}
        {includeActorPivot && incident.actor_id !== currentAgentId && navigableAgentIds.has(incident.actor_id)
          ? renderAgentPivotButton({
              agentId: incident.actor_id,
              ariaLabel: `${actorPivotAriaLabelPrefix} ${incident.incident_id} ${incident.actor_id}`,
              correlationId: incident.correlation_id,
              onSelectAgent
            })
          : incident.actor_id}
      </span>
      <span>{`Incident · ${incident.kind} · ${incident.status}`}</span>
      <span>{`Severity · ${SEVERITY_LABELS[incident.severity]}`}</span>
      <span>
        Counterparties ·{' '}
        {includeCounterpartyPivots
          ? renderAgentPivotList({
              agentIds: incident.counterparty_agent_ids,
              currentAgentId,
              navigableAgentIds,
              emptyLabel: 'No counterparties',
              ariaLabelPrefix: counterpartyPivotAriaLabelPrefix,
              correlationId: incident.correlation_id,
              onSelectAgent
            })
          : renderCounterparties(incident.counterparty_agent_ids)}
      </span>
      {enableSharedMemoryEvidenceJump ? (
        <span>
          Evidence ·{' '}
          {renderSharedMemoryEvidenceRefs({
            evidenceRefs: incident.evidence_refs,
            sharedMemoryArtifactRefs,
            onJump: focusSharedMemoryArtifact
          })}
        </span>
      ) : (
        <span>{`Evidence · ${renderEvidenceRefs(incident.evidence_refs)}`}</span>
      )}
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

function resolveCollectorSeverity(item: CollectorItem): keyof typeof SEVERITY_LABELS {
  if (item.supervision.needs_attention) {
    return 'orange';
  }

  if (item.heartbeat.reboot_recommended || item.supervision.watch_target || item.supervision.watched_by.length > 0) {
    return 'yellow';
  }

  return 'normal';
}

function compareCollectorItems(left: CollectorItem, right: CollectorItem) {
  const leftSignalScore =
    (left.supervision.needs_attention ? 100 : 0) +
    (left.heartbeat.reboot_recommended ? 50 : 0) +
    (left.supervision.watch_target ? 20 : 0) +
    left.supervision.watched_by.length * 10 +
    resolveCollectorEvidenceRefs(left).length * 2 +
    left.workspace_observations.length +
    left.tmux_observations.length;
  const rightSignalScore =
    (right.supervision.needs_attention ? 100 : 0) +
    (right.heartbeat.reboot_recommended ? 50 : 0) +
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
  onSelectAgent: (agentId: string | null, correlationId?: string | null) => void;
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
  collectorSnapshot,
  collectorSnapshotError,
  collectorSnapshotState,
  correlation,
  correlationError,
  correlationState,
  incidentFeed,
  incidentFeedError,
  incidentFeedState,
  operations,
  operationsError,
  operationsState,
  operationsStateBuckets,
  operationsStateBucketsError,
  operationsStateBucketsState,
  overviewZones,
  preserveWorkflowCounterpartyCorrelation,
  memoryArtifacts,
  memoryArtifactsError,
  memoryArtifactsState,
  selectedAgent,
  selectedCorrelationId,
  selectedOperationsState,
  selectedOperation,
  timelineReplay,
  timelineReplayError,
  timelineReplayState,
  workflow,
  workflowError,
  workflowState,
  world,
  onSelectAgent,
  onInspectAgent,
  onSelectCorrelation,
  onSelectOperationsState,
  onSelectOperation
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
  const zoneSource = overviewZones ?? world.zones.map((zone) => ({
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
  const officeGrid = buildZoneLayoutModels(zoneSource).map((layoutModel) => {
    const zone = layoutModel.zone;
    const overviewZone = overviewZones?.find((candidate) => candidate.zone_id === zone.zone_id) ?? null;
    const occupants = overviewZone && overviewZone.occupants.length > 0
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
          }));

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
  const activeQueueStateBucketsStatus =
    operationsStateBucketsState === 'ready' && operationsStateBucketsError
      ? renderActiveQueueStateBucketsStatusLabel(operationsStateBucketsError)
      : null;
  const collectorWarning =
    collectorSnapshotError && collectorSnapshot
      ? `Showing last collector snapshot. ${collectorSnapshotError}`
      : null;
  const collectorSignalItems = (collectorSnapshot?.items ?? [])
    .filter(
      (item) =>
        item.supervision.needs_attention ||
        item.heartbeat.reboot_recommended ||
        item.supervision.watch_target !== null ||
        item.supervision.watched_by.length > 0
    )
    .sort(compareCollectorItems)
    .slice(0, 3);
  const sharedMemoryActiveCorrelationId = selectedCorrelationId;
  const sharedMemoryArtifactRefs = new Set((memoryArtifacts?.items ?? []).map((artifact) => artifact.artifact_ref));

  if (!selectedAgent) {
    return (
      <aside className="aitown-panel aitown-panel--details" role="complementary" aria-label="Agent details">
        <div className="aitown-details__head">
          <div>
            <h2>Crew Overview</h2>
            <p>Pick an agent in the town or start from the roster.</p>
          </div>
        </div>

        <div className="aitown-details__summary">
          <p>
            {world.summary.total_agents} active agents, {world.summary.blocked_count} blocked, highest
            severity {SEVERITY_LABELS[world.summary.highest_severity]}.
          </p>
        </div>

        <section className="aitown-details__section">
          <h3>Collector Supervision</h3>
          {collectorWarning ? <p role="status">{collectorWarning}</p> : null}
          <ul className="aitown-records">
            {collectorSnapshotState === 'loading' && !collectorSnapshot ? (
              <li className="aitown-record">Loading collector snapshot...</li>
            ) : null}
            {collectorSnapshotError && !collectorSnapshot ? (
              <li className="aitown-record">{`Unable to load collector snapshot. ${collectorSnapshotError}`}</li>
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
              </li>
            ) : null}
            {collectorSignalItems.map((item) => {
              const collectorEvidenceRefs = resolveCollectorEvidenceRefs(item);
              const collectorLabel = agentNameById.get(item.agent_id) ?? item.agent_id;
              const canNavigateToCollectorAgent = navigableAgentIds.has(item.agent_id);
              const watchGraphAlignment = resolveCollectorWatchGraphAlignment(item, world);

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
                  {renderCollectorProvenancePreview(item)}
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
                      onSelectAgent
                    })}
                  </span>
                  <span>{`Watch graph alignment · ${watchGraphAlignment}`}</span>
                  <span>
                    Evidence ·{' '}
                    {renderSharedMemoryEvidenceRefs({
                      evidenceRefs: collectorEvidenceRefs,
                      sharedMemoryArtifactRefs,
                      onJump: focusSharedMemoryArtifact,
                      jumpAriaLabelPrefix: 'Jump to collector evidence ref'
                    })}
                  </span>
                </li>
              );
            })}
            {collectorSnapshotState === 'ready' && !collectorSnapshotError && !collectorSnapshot ? (
              <li className="aitown-record">No collector snapshot available yet.</li>
            ) : null}
            {collectorSnapshot && collectorSignalItems.length === 0 ? (
              <li className="aitown-record">No collector attention items in latest snapshot.</li>
            ) : null}
          </ul>
        </section>

        <section className="aitown-details__section">
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

        <section className="aitown-details__section">
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
                </li>
              );
            })}
            {officeGrid.length === 0 ? <li className="aitown-record">No office zones available.</li> : null}
          </ul>
        </section>

        <section className="aitown-details__section">
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

        <section className="aitown-details__section">
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
          <ul className="aitown-records">
            {operationsState === 'loading' && !operations ? (
              <li className="aitown-record">{renderActiveQueueLoadingLabel(selectedOperationsState)}</li>
            ) : null}
            {operationsError && !operations ? (
              <li className="aitown-record">
                {renderActiveQueueErrorLabel(selectedOperationsState, operationsError)}
              </li>
            ) : null}
            {operationsError && operations ? (
              <li className="aitown-record">
                {renderActiveQueueWarningLabel(selectedOperationsState, operationsError)}
              </li>
            ) : null}
            {(operations?.items ?? []).slice(0, 4).map((operation) => {
              const activeQueueStatusId = `aitown-active-queue-status-${operation.agent_id}`;
              const activeQueuePreviewId = `aitown-active-queue-preview-${operation.agent_id}`;

              return (
                <li key={operation.agent_id} className="aitown-queue-record">
                  <button
                    type="button"
                    className={`aitown-roster__button aitown-queue-record__button severity-${operation.effective_severity}`}
                    aria-label={`Inspect ${operation.display_name} from active queue`}
                    aria-describedby={`${activeQueueStatusId} ${activeQueuePreviewId}`}
                    onClick={() => onSelectOperation(operation)}
                  >
                    <strong>{operation.display_name}</strong>
                    <span id={activeQueueStatusId} className="aitown-queue-record__status">{`${operation.current_state} · ${operation.current_blocker || operation.active_task}`}</span>
                    <span id={activeQueuePreviewId} className="aitown-queue-record__preview">
                      {renderActiveQueueRunContextPreview(operation)}
                    </span>
                  </button>
                  <span className="aitown-queue-record__meta">
                    Correlation ·{' '}
                    {renderCorrelationButton({
                      correlationId: operation.correlation_id,
                      label: operation.correlation_id ?? 'No correlation id',
                      buttonLabel: 'Open active queue correlation',
                      activeCorrelationId: selectedCorrelationId,
                      onSelectCorrelation
                    })}
                  </span>
                  <span className="aitown-queue-record__meta">
                    Counterparties ·{' '}
                    {renderAgentPivotList({
                      agentIds: operation.latest_event?.counterparty_agent_ids ?? [],
                      currentAgentId: operation.agent_id,
                      navigableAgentIds,
                      emptyLabel: 'No counterparties',
                      ariaLabelPrefix: `Select active queue counterparty agent from operation ${operation.agent_id}`,
                      correlationId: selectedCorrelationId ?? operation.correlation_id,
                      onSelectAgent
                    })}
                  </span>
                  <span className="aitown-queue-record__meta">
                    Evidence ·{' '}
                    {renderSharedMemoryEvidenceRefs({
                      evidenceRefs: operation.latest_event?.evidence_refs ?? [],
                      sharedMemoryArtifactRefs,
                      onJump: focusSharedMemoryArtifact
                    })}
                  </span>
                </li>
              );
            })}
            {operationsState === 'ready' && !operationsError && !operations?.items.length ? (
              <li className="aitown-record">{renderActiveQueueEmptyLabel(selectedOperationsState)}</li>
            ) : null}
          </ul>
        </section>

        {renderSharedMemorySection({
          memoryArtifacts,
          memoryArtifactsError,
          memoryArtifactsState,
          activeCorrelationId: sharedMemoryActiveCorrelationId,
          currentAgentId: null,
          navigableAgentIds,
          onSelectAgent,
          onSelectCorrelation
        })}

        <section className="aitown-details__section">
          <h3>Incident Feed</h3>
          <ul className="aitown-records">
            {incidentFeedState === 'loading' && !incidentFeed ? (
              <li className="aitown-record">Loading incident feed...</li>
            ) : null}
            {incidentFeedError ? <li className="aitown-record">{incidentFeedError}</li> : null}
            {(incidentFeed?.items ?? []).slice(0, 4).map((incident) =>
              renderIncidentRecord({
                incident,
                activeCorrelationId: selectedCorrelationId,
                currentAgentId: null,
                navigableAgentIds,
                sharedMemoryArtifactRefs,
                enableSharedMemoryEvidenceJump: true,
                onSelectAgent,
                onSelectCorrelation,
                includeAgentPivot: true,
                includeActorPivot: true,
                includeCounterpartyPivots: true,
                counterpartyPivotAriaLabelPrefix: `Select incident feed counterparty agent from incident ${incident.incident_id}`
              })
            )}
            {incidentFeedState === 'ready' && !incidentFeedError && !incidentFeed?.items.length ? (
              <li className="aitown-record">No active incident feed.</li>
            ) : null}
          </ul>
        </section>

        <section className="aitown-details__section">
          <h3>Timeline Replay</h3>
          <ul className="aitown-records">
            {timelineReplayState === 'loading' && !timelineReplay ? (
              <li className="aitown-record">Loading timeline replay...</li>
            ) : null}
            {timelineReplayError ? <li className="aitown-record">{timelineReplayError}</li> : null}
            {(timelineReplay?.items ?? []).map((event) =>
              renderReplayTimelineEvent({
                event,
                activeCorrelationId: selectedCorrelationId,
                agentLabel: agentNameById.get(event.agent_id) ?? event.agent_id,
                currentAgentId: null,
                navigableAgentIds,
                sharedMemoryArtifactRefs,
                onSelectAgent,
                onSelectCorrelation
              })
            )}
            {timelineReplayState === 'ready' && !timelineReplayError && !timelineReplay?.items.length ? (
              <li className="aitown-record">No recent replay events.</li>
            ) : null}
          </ul>
        </section>

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
                      onJump: focusSharedMemoryArtifact
                    })}
                  </span>
                  <span>{`Counts · ${correlation.incident_count} incidents · ${correlation.interaction_count} interactions · ${correlation.event_count} events`}</span>
                </li>
                {correlation.incidents.map((incident) =>
                  renderIncidentRecord({
                    incident,
                    activeCorrelationId: sharedMemoryActiveCorrelationId,
                    currentAgentId: null,
                    navigableAgentIds,
                    sharedMemoryArtifactRefs,
                    enableSharedMemoryEvidenceJump: true,
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
                    enableSharedMemoryEvidenceJump: true
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
                    enableSharedMemoryEvidenceJump: true
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

  const selectedWorldAgent = world.agents.get(selectedAgent.agent_id) ?? null;
  const inboundWatchers = world.watch_edges.filter((edge) => edge.to_agent_id === selectedAgent.agent_id);
  const currentOperationMissingFromQueue =
    selectedOperation !== null && operationsState === 'ready' && (operations?.items ?? []).length === 0;
  const currentOperationWarning = operationsError
    ? `Showing last operation snapshot. ${operationsError}`
    : currentOperationMissingFromQueue
      ? 'Showing last operation snapshot. Operation is no longer in the active queue.'
      : null;
  const currentOperationIsStale = currentOperationWarning !== null;
  const selectedOperationLatestEvent = currentOperationIsStale ? null : selectedOperation?.latest_event ?? null;
  const latestWorkflowTimelineEvent = selectLatestTimelineEvent(workflow?.timeline ?? []);
  const workflowIncidents = dedupeIncidents([
    ...(workflow?.incidents ?? []),
    ...(workflow?.detail.recent_incidents ?? [])
  ]);
  const relatedIncidents = workflowIncidents.length
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
  const selectedCollectorItem =
    collectorSnapshot?.items.find((item) => item.agent_id === selectedAgent.agent_id) ?? null;
  const selectedCollectorEvidenceRefs = selectedCollectorItem ? resolveCollectorEvidenceRefs(selectedCollectorItem) : [];
  const selectedCollectorWatchGraphAlignment = selectedCollectorItem
    ? resolveCollectorWatchGraphAlignment(selectedCollectorItem, world)
    : null;
  const outboundWatchers = world.watch_edges.filter((edge) => edge.from_agent_id === selectedAgent.agent_id);
  const selectedOperationCorrelationId = currentOperationIsStale ? null : selectedOperation?.correlation_id ?? null;
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
  const alignedWorkflowIncidentHistory = (workflow?.incidents ?? []).filter((incident) =>
    isAlignedCorrelation(incident.correlation_id, accountabilityCorrelationId)
  );
  const alignedWorkflowHistoryInteraction =
    workflow?.interactions.find((interaction) =>
      isAlignedCorrelation(interaction.correlation_id, accountabilityCorrelationId)
    ) ?? null;
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
    ...(workflow?.interactions
      .filter((interaction) => isAlignedCorrelation(interaction.correlation_id, accountabilityCorrelationId))
      .flatMap((interaction) => interaction.evidence_refs) ?? []),
    ...alignedWorkflowIncidentHistory.flatMap((incident) => incident.evidence_refs),
    ...(alignedCorrelation?.evidence_refs ?? []),
    ...(accountabilityCorrelationId || !selectedCollectorItem ? [] : selectedCollectorEvidenceRefs)
  ]).slice(0, 4);
  const accountabilitySources = dedupeNonEmptyStrings([
    includeSelectedOperationSignal ? selectedOperationLatestEvent?.source_kind : null,
    ...alignedWorkflowAlerts.map((alert) => alert.source_kind),
    ...alignedWorkflowEvents.map((event) => event.source_kind),
    ...alignedWorkflowIncidents.map((incident) => incident.source_kind),
    ...alignedWorkflowHandoffs.map((handoff) => handoff.source_kind),
    ...alignedWorkflowReboots.map((reboot) => reboot.source_kind),
    ...alignedWorkflowTimeline.map((event) => event.source_kind),
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
    <aside className="aitown-panel aitown-panel--details" role="complementary" aria-label="Agent details">
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
        </p>
      </div>

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

      <section className="aitown-details__section">
        <h3>Collector Observation</h3>
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
              {renderCollectorProvenancePreview(selectedCollectorItem)}
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
                  onJump: focusSharedMemoryArtifact,
                  jumpAriaLabelPrefix: 'Jump to collector evidence ref'
                })}
              </span>
            </li>
          ) : null}
          {collectorSnapshotState === 'ready' && !collectorSnapshotError && !collectorSnapshot ? (
            <li className="aitown-record">No collector snapshot available yet.</li>
          ) : null}
          {collectorSnapshot && !selectedCollectorItem ? (
            <li className="aitown-record">No collector observation context for this agent in latest snapshot.</li>
          ) : null}
        </ul>
      </section>

      {selectedOperation ? (
        <>
        <section className="aitown-details__section">
          <h3>Current Operation</h3>
          {currentOperationWarning ? <p role="status">{currentOperationWarning}</p> : null}
          <ul className="aitown-records">
            <li className={`aitown-record severity-${selectedOperation.effective_severity}`}>
              <strong>{selectedOperation.display_name}</strong>
              <span>{`${selectedOperation.current_state} · ${selectedOperation.current_blocker || selectedOperation.active_task}`}</span>
              <span>{`Location · ${selectedOperation.current_location}`}</span>
              <span>{`Latest event · ${selectedOperation.latest_event?.summary ?? 'No latest event yet'}`}</span>
              {selectedOperation.correlation_id && !currentOperationIsStale
                ? renderCorrelationButton({
                    correlationId: selectedOperation.correlation_id,
                    label: selectedOperation.correlation_id,
                    buttonLabel: 'Open operation correlation',
                    activeCorrelationId: selectedCorrelationId,
                    onSelectCorrelation
                  })
                : null}
              <span>
                {'Counterparties · '}
                {renderAgentPivotList({
                  agentIds: selectedOperation.latest_event?.counterparty_agent_ids ?? [],
                  currentAgentId: selectedAgent.agent_id,
                  navigableAgentIds,
                  emptyLabel: 'No counterparties',
                  ariaLabelPrefix: 'Select operation counterparty agent',
                  correlationId: currentOperationIsStale ? null : selectedOperation.correlation_id,
                  onSelectAgent
                })}
              </span>
              <span>
                Evidence ·{' '}
                {renderSharedMemoryEvidenceRefs({
                  evidenceRefs: selectedOperation.latest_event?.evidence_refs ?? [],
                  sharedMemoryArtifactRefs,
                  onJump: focusSharedMemoryArtifact
                })}
              </span>
              <span>{`Source · ${selectedOperation.latest_event?.source_kind ?? 'No latest event source'}`}</span>
            </li>
          </ul>
        </section>
        <section className="aitown-details__section">
          <h3>Run Context</h3>
          <ul className="aitown-records">
            <li className={`aitown-record severity-${selectedOperation.effective_severity}`}>
              <strong>{selectedOperation.display_name}</strong>
              <span>{`Run blocker · ${renderOperationBlocker(selectedOperation.current_blocker)}`}</span>
              <span>{`Latest event type · ${selectedOperation.latest_event?.event_type ?? 'No latest event type'}`}</span>
              <span>{`Latest event at · ${renderTimestamp(selectedOperation.latest_event?.ts ?? null, 'No latest event timestamp')}`}</span>
              <span>{`Last event at · ${renderTimestamp(selectedOperation.last_event_at, 'No last event timestamp')}`}</span>
              <span>{`Last heartbeat · ${renderTimestamp(selectedOperation.last_heartbeat_at, 'No heartbeat yet')}`}</span>
              <span>{`Last output · ${renderTimestamp(selectedOperation.last_meaningful_output_at, 'No last output timestamp')}`}</span>
              <span>{`Staleness · ${renderOperationStaleness(selectedOperation)}`}</span>
              <span>{`Reboot recommendation · ${selectedOperation.reboot_recommended ? 'Recommended' : 'No'}`}</span>
            </li>
          </ul>
        </section>
        </>
      ) : null}

      <section className="aitown-details__section">
        <h3>Audit Signals</h3>
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
                    onJump: focusSharedMemoryArtifact,
                    jumpAriaLabelPrefix: 'Jump to accountability evidence ref'
                  })
                : 'No loaded evidence refs'}
            </span>
            <span>
              Artifacts ·{' '}
              {renderAccountabilityArtifactJumpList({
                artifacts: accountabilityMemoryArtifacts,
                onJump: focusSharedMemoryArtifact
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

      <section className="aitown-details__section">
        <h3>Workflow</h3>
        {workflowState === 'loading' && !workflow ? <p>Loading workflow...</p> : null}
        {workflowError ? <p>{workflowError}</p> : null}
        <ul className="aitown-records">
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
              onSelectCorrelation
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
              enableSharedMemoryEvidenceJump: true
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
              enableSharedMemoryEvidenceJump: true
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
              onSelectCorrelation
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
              onSelectCorrelation
            })
          )}
        </ul>
      </section>

      {renderSharedMemorySection({
        memoryArtifacts,
        memoryArtifactsError,
        memoryArtifactsState,
        activeCorrelationId: sharedMemoryActiveCorrelationId,
        currentAgentId: selectedAgent.agent_id,
        navigableAgentIds,
        onSelectAgent,
        onSelectCorrelation
      })}

      <section className="aitown-details__section">
        <h3>Incident Feed</h3>
        <ul className="aitown-records">
          {incidentFeedState === 'loading' && !incidentFeed ? (
            <li className="aitown-record">Loading incident feed...</li>
          ) : null}
          {incidentFeedError ? <li className="aitown-record">{incidentFeedError}</li> : null}
          {relatedIncidents.map((incident) =>
            renderIncidentRecord({
              incident,
              activeCorrelationId: selectedCorrelationId,
              currentAgentId: selectedAgent.agent_id,
              navigableAgentIds,
              sharedMemoryArtifactRefs,
              enableSharedMemoryEvidenceJump: true,
              onSelectAgent,
              onSelectCorrelation,
              includeAgentPivot: false,
              includeActorPivot: true,
              includeCounterpartyPivots: true,
              counterpartyPivotAriaLabelPrefix: `Select incident feed counterparty agent from incident ${incident.incident_id}`
            })
          )}
          {incidentFeedState === 'ready' && !incidentFeedError && relatedIncidents.length === 0 ? (
            <li className="aitown-record">No incident feed entries.</li>
          ) : null}
        </ul>
      </section>

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
                    onJump: focusSharedMemoryArtifact
                  })}
                </span>
                <span>{`Counts · ${correlation.incident_count} incidents · ${correlation.interaction_count} interactions · ${correlation.event_count} events`}</span>
              </li>
              {correlation.incidents.map((incident) =>
                renderIncidentRecord({
                  incident,
                  activeCorrelationId: selectedCorrelationId,
                  currentAgentId: selectedAgent.agent_id,
                  navigableAgentIds,
                  sharedMemoryArtifactRefs,
                  enableSharedMemoryEvidenceJump: true,
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
                  enableSharedMemoryEvidenceJump: true
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
                  enableSharedMemoryEvidenceJump: true
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
