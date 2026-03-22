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
  selectedAgent: OfficeAgent | null;
  selectedCorrelationId: string | null;
  selectedOperation: OfficeOperation | null;
  workflow: AgentWorkflow | null;
  workflowError: string | null;
  workflowState: LoadState;
  world: WorldState;
  onSelectAgent: (agentId: string | null) => void;
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
  onSelectAgent
}: {
  agentId: string;
  ariaLabel: string;
  onSelectAgent: (agentId: string | null) => void;
}) {
  return (
    <button
      type="button"
      className="aitown-link-button"
      aria-label={ariaLabel}
      onClick={() => onSelectAgent(agentId)}
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
  onSelectAgent
}: {
  agentIds: string[];
  currentAgentId: string | null;
  navigableAgentIds: Set<string>;
  emptyLabel: string;
  ariaLabelPrefix: string;
  onSelectAgent: (agentId: string | null) => void;
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
            {(incidentFeed?.items ?? []).slice(0, 4).map((incident) => (
              <li key={incident.incident_id} className={`aitown-record severity-${incident.severity}`}>
                <strong>{incident.summary}</strong>
                <span>
                  {navigableAgentIds.has(incident.agent_id)
                    ? renderAgentPivotButton({
                        agentId: incident.agent_id,
                        ariaLabel: `Select incident agent ${incident.agent_id} from incident ${incident.incident_id}`,
                        onSelectAgent
                      })
                    : incident.agent_id}
                </span>
                {renderCorrelationButton({
                  correlationId: incident.correlation_id,
                  label: incident.correlation_id ?? 'No correlation id',
                  buttonLabel: 'Open incident correlation',
                  activeCorrelationId: selectedCorrelationId,
                  onSelectCorrelation
                })}
              </li>
            ))}
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
              <span>{`Counterparties · ${renderCounterparties(selectedOperation.latest_event?.counterparty_agent_ids ?? [])}`}</span>
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
        </ul>
      </section>

      <section className="aitown-details__section">
        <h3>Incident Feed</h3>
        <ul className="aitown-records">
          {incidentFeedState === 'loading' && !incidentFeed ? (
            <li className="aitown-record">Loading incident feed...</li>
          ) : null}
          {incidentFeedError ? <li className="aitown-record">{incidentFeedError}</li> : null}
          {relatedIncidents.map((incident) => (
            <li key={incident.incident_id} className={`aitown-record severity-${incident.severity}`}>
              <strong>{incident.summary}</strong>
              {renderCorrelationButton({
                correlationId: incident.correlation_id,
                label: incident.correlation_id ?? 'No correlation id',
                buttonLabel: 'Open incident correlation',
                activeCorrelationId: selectedCorrelationId,
                onSelectCorrelation
              })}
              <span>{incident.status}</span>
            </li>
          ))}
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
