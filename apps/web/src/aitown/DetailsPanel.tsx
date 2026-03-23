import type {
  AgentWorkflow,
  CorrelationDrilldown,
  IncidentFeedResponse,
  OfficeAgent,
  OfficeOperation,
  OfficeOperations,
  WorkflowIncident,
  WorkflowInteraction,
  WorkflowTimelineEvent
} from '../types';
import type { LoadState } from '../hooks/usePolledResource';
import type { WorldState } from '../world/types';
import { selectAgentBadge, selectAgentZoneLabel, selectAttentionQueue, selectWatchEdgeRisk } from '../world/selectors';

type DetailsPanelProps = {
  correlation: CorrelationDrilldown | null;
  correlationError: string | null;
  correlationState: LoadState;
  incidentFeed: IncidentFeedResponse | null;
  incidentFeedError: string | null;
  incidentFeedState: LoadState;
  operations: OfficeOperations | null;
  operationsError: string | null;
  operationsState: LoadState;
  preserveWorkflowCounterpartyCorrelation: boolean;
  selectedAgent: OfficeAgent | null;
  selectedCorrelationId: string | null;
  selectedOperation: OfficeOperation | null;
  workflow: AgentWorkflow | null;
  workflowError: string | null;
  workflowState: LoadState;
  world: WorldState;
  onSelectAgent: (agentId: string | null, correlationId?: string | null) => void;
  onSelectCorrelation: (correlationId: string | null) => void;
  onSelectOperation: (operation: OfficeOperation) => void;
};

const SEVERITY_LABELS = {
  normal: 'Normal',
  yellow: 'Yellow',
  orange: 'Orange',
  red: 'Red'
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
  ariaLabel,
  correlationId = null,
  onSelectAgent
}: {
  agentId: string;
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
      {agentId}
    </button>
  );
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

function renderEvidenceRefs(evidenceRefs: string[]) {
  return evidenceRefs.length > 0 ? evidenceRefs.join(', ') : 'No evidence refs';
}

function renderCounterparties(counterpartyAgentIds: string[]) {
  return counterpartyAgentIds.length > 0 ? counterpartyAgentIds.join(', ') : 'No counterparties';
}

function renderParticipants(participantAgentIds: string[]) {
  return participantAgentIds.length > 0 ? participantAgentIds.join(', ') : 'No participants';
}

function renderTimestamp(value: string | null, fallback: string) {
  return value ?? fallback;
}

function renderOperationBlocker(blocker: string) {
  return blocker || 'No current blocker';
}

function renderOperationStaleness(operation: OfficeOperation) {
  return `${SEVERITY_LABELS[operation.derived_staleness.severity]} · ${operation.derived_staleness.stale_for_minutes ?? 0}m`;
}

function renderDisplayState(value: string) {
  return value
    .split('_')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function renderCorrelationInteraction(interaction: WorkflowInteraction) {
  return (
    <li key={interaction.interaction_id} className={`aitown-record severity-${interaction.severity ?? 'normal'}`}>
      <strong>{interaction.summary}</strong>
      <span>{`Interaction · ${interaction.interaction_type}`}</span>
      <span>{`Participants · ${renderParticipants(interaction.participant_agent_ids)}`}</span>
      <span>{`Evidence · ${renderEvidenceRefs(interaction.evidence_refs)}`}</span>
    </li>
  );
}

function renderCorrelationTimelineEvent(event: WorkflowTimelineEvent) {
  return (
    <li key={event.event_id} className={`aitown-record severity-${event.severity}`}>
      <strong>{event.summary}</strong>
      <span>{`Timeline · ${event.event_type} · ${event.location}`}</span>
      <span>{`Counterparties · ${renderCounterparties(event.counterparty_agent_ids)}`}</span>
      <span>{`Evidence · ${renderEvidenceRefs(event.evidence_refs)}`}</span>
      <span>{`Source · ${event.source_kind}`}</span>
    </li>
  );
}

function renderWorkflowStatusRecord({
  key,
  kind,
  severity,
  summary,
  status,
  phase,
  counterpartyAgentIds,
  evidenceRefs,
  sourceKind
}: {
  key: string;
  kind: 'Handoff' | 'Reboot';
  severity: keyof typeof SEVERITY_LABELS;
  summary: string;
  status: string;
  phase: string;
  counterpartyAgentIds: string[];
  evidenceRefs: string[];
  sourceKind: string;
}) {
  return (
    <li key={key} className={`aitown-record severity-${severity}`}>
      <strong>{summary}</strong>
      <span>{`${kind} · ${status} · ${phase}`}</span>
      <span>{`Counterparties · ${renderCounterparties(counterpartyAgentIds)}`}</span>
      <span>{`Evidence · ${renderEvidenceRefs(evidenceRefs)}`}</span>
      <span>{`Source · ${sourceKind}`}</span>
    </li>
  );
}

function renderIncidentRecord({
  incident,
  activeCorrelationId,
  currentAgentId,
  navigableAgentIds,
  onSelectAgent,
  onSelectCorrelation,
  includeAgentPivot
}: {
  incident: WorkflowIncident;
  activeCorrelationId: string | null;
  currentAgentId: string | null;
  navigableAgentIds: Set<string>;
  onSelectAgent: (agentId: string | null, correlationId?: string | null) => void;
  onSelectCorrelation: (correlationId: string | null) => void;
  includeAgentPivot: boolean;
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
      {renderCorrelationButton({
        correlationId: incident.correlation_id,
        label: incident.correlation_id ?? 'No correlation id',
        buttonLabel: 'Open incident correlation',
        activeCorrelationId,
        onSelectCorrelation
      })}
      <span>{`Incident · ${incident.kind} · ${incident.status}`}</span>
      <span>{`Counterparties · ${renderCounterparties(incident.counterparty_agent_ids)}`}</span>
      <span>{`Evidence · ${renderEvidenceRefs(incident.evidence_refs)}`}</span>
      <span>{`Source · ${incident.source_kind}`}</span>
    </li>
  );
}

function compareAgents(
  left: { severity: keyof typeof SEVERITY_LABELS; displayName: string; agentId: string },
  right: { severity: keyof typeof SEVERITY_LABELS; displayName: string; agentId: string }
) {
  const severityRank = {
    normal: 0,
    yellow: 1,
    orange: 2,
    red: 3
  } as const;

  return (
    severityRank[right.severity] - severityRank[left.severity] ||
    left.displayName.localeCompare(right.displayName) ||
    left.agentId.localeCompare(right.agentId)
  );
}

export function DetailsPanel({
  correlation,
  correlationError,
  correlationState,
  incidentFeed,
  incidentFeedError,
  incidentFeedState,
  operations,
  operationsError,
  operationsState,
  preserveWorkflowCounterpartyCorrelation,
  selectedAgent,
  selectedCorrelationId,
  selectedOperation,
  workflow,
  workflowError,
  workflowState,
  world,
  onSelectAgent,
  onSelectCorrelation,
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
          <h3>Roster</h3>
          <div className="aitown-roster">
            {agents.map((agent) => (
              <button
                key={agent.agentId}
                type="button"
                className={`aitown-roster__button severity-${agent.severity}`}
                aria-label={`Inspect ${agent.displayName}`}
                onClick={() => onSelectAgent(agent.agentId)}
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
                  <span>{`Zone · ${selectAgentZoneLabel(agent, world.zones)}`}</span>
                  <span>{`Reason · ${badge.text}`}</span>
                </li>
              );
            })}
            {attentionQueue.length === 0 ? <li className="aitown-record">No agents need attention.</li> : null}
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
                  <strong>{`${fromLabel} -> ${toLabel}`}</strong>
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
          <ul className="aitown-records">
            {operationsState === 'loading' && !operations ? (
              <li className="aitown-record">Loading operations queue...</li>
            ) : null}
            {operationsError ? <li className="aitown-record">{operationsError}</li> : null}
            {(operations?.items ?? []).slice(0, 4).map((operation) => (
              <li key={operation.agent_id} className={`aitown-record severity-${operation.effective_severity}`}>
                <button
                  type="button"
                  className={`aitown-roster__button severity-${operation.effective_severity}`}
                  aria-label={`Inspect ${operation.display_name} from active queue`}
                  onClick={() => onSelectOperation(operation)}
                >
                  <strong>{operation.display_name}</strong>
                  <span>{`${operation.current_state} · ${operation.current_blocker || operation.active_task}`}</span>
                </button>
              </li>
            ))}
            {operationsState === 'ready' && !operationsError && !operations?.items.length ? (
              <li className="aitown-record">No active operations queue.</li>
            ) : null}
          </ul>
        </section>

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
                onSelectAgent,
                onSelectCorrelation,
                includeAgentPivot: true
              })
            )}
            {incidentFeedState === 'ready' && !incidentFeedError && !incidentFeed?.items.length ? (
              <li className="aitown-record">No active incident feed.</li>
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
                  <span>{`Evidence · ${renderEvidenceRefs(correlation.evidence_refs)}`}</span>
                  <span>{`Counts · ${correlation.incident_count} incidents · ${correlation.interaction_count} interactions · ${correlation.event_count} events`}</span>
                </li>
                {correlation.incidents.map((incident) => (
                  <li key={incident.incident_id} className={`aitown-record severity-${incident.severity}`}>
                    <strong>{incident.summary}</strong>
                    <span>{`Incident · ${incident.kind} · ${incident.status}`}</span>
                    <span>{`Counterparties · ${renderCounterparties(incident.counterparty_agent_ids)}`}</span>
                    <span>{`Evidence · ${renderEvidenceRefs(incident.evidence_refs)}`}</span>
                    <span>{`Source · ${incident.source_kind}`}</span>
                  </li>
                ))}
                {correlation.interactions.map(renderCorrelationInteraction)}
                {correlation.timeline.map(renderCorrelationTimelineEvent)}
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
              <span>{`Evidence · ${renderEvidenceRefs(selectedOperation.latest_event?.evidence_refs ?? [])}`}</span>
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
          {(workflow?.detail.open_peer_watch_alerts ?? []).map((alert) => (
            <li key={alert.alert_id} className={`aitown-record severity-${alert.severity}`}>
              <strong>{alert.summary}</strong>
              {renderCorrelationButton({
                correlationId: alert.correlation_id,
                label: alert.correlation_id ?? 'No correlation id',
                buttonLabel: 'Open workflow correlation',
                activeCorrelationId: selectedCorrelationId,
                onSelectCorrelation
              })}
              <span>{`Workflow status · ${alert.current_state}`}</span>
            </li>
          ))}
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
          {(workflow?.detail.recent_interactions ?? []).slice(0, 2).map(renderCorrelationInteraction)}
          {(workflow?.detail.recent_events ?? []).slice(0, 2).map(renderCorrelationTimelineEvent)}
          {(workflow?.detail.recent_handoffs ?? []).slice(0, 2).map((handoff) =>
            renderWorkflowStatusRecord({
              key: handoff.handoff_id,
              kind: 'Handoff',
              severity: handoff.severity,
              summary: handoff.summary,
              status: handoff.status,
              phase: handoff.phase,
              counterpartyAgentIds: handoff.counterparty_agent_ids,
              evidenceRefs: handoff.evidence_refs,
              sourceKind: handoff.source_kind
            })
          )}
          {(workflow?.detail.recent_reboots ?? []).slice(0, 2).map((reboot) =>
            renderWorkflowStatusRecord({
              key: reboot.reboot_id,
              kind: 'Reboot',
              severity: reboot.severity,
              summary: reboot.summary,
              status: reboot.status,
              phase: reboot.phase,
              counterpartyAgentIds: reboot.counterparty_agent_ids,
              evidenceRefs: reboot.evidence_refs,
              sourceKind: reboot.source_kind
            })
          )}
        </ul>
      </section>

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
              onSelectAgent,
              onSelectCorrelation,
              includeAgentPivot: false
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
                <span>{`Evidence · ${renderEvidenceRefs(correlation.evidence_refs)}`}</span>
                <span>{`Counts · ${correlation.incident_count} incidents · ${correlation.interaction_count} interactions · ${correlation.event_count} events`}</span>
              </li>
              {correlation.incidents.map((incident) => (
                <li key={incident.incident_id} className={`aitown-record severity-${incident.severity}`}>
                  <strong>{incident.summary}</strong>
                  <span>{`Incident · ${incident.kind} · ${incident.status}`}</span>
                  <span>{`Counterparties · ${renderCounterparties(incident.counterparty_agent_ids)}`}</span>
                  <span>{`Evidence · ${renderEvidenceRefs(incident.evidence_refs)}`}</span>
                  <span>{`Source · ${incident.source_kind}`}</span>
                </li>
              ))}
              {correlation.interactions.map(renderCorrelationInteraction)}
              {correlation.timeline.map(renderCorrelationTimelineEvent)}
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
