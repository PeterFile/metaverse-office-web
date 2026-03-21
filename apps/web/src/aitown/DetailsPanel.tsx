import type {
  AgentWorkflow,
  CorrelationDrilldown,
  IncidentFeedResponse,
  OfficeAgent,
  OfficeOperations,
  WorkflowIncident
} from '../types';
import type { LoadState } from '../hooks/usePolledResource';
import type { WorldState } from '../world/types';

type DetailsPanelProps = {
  incidentFeed: IncidentFeedResponse | null;
  incidentFeedError: string | null;
  incidentFeedState: LoadState;
  operations: OfficeOperations | null;
  operationsError: string | null;
  operationsState: LoadState;
  correlation: CorrelationDrilldown | null;
  correlationError: string | null;
  correlationState: LoadState;
  selectedAgent: OfficeAgent | null;
  workflow: AgentWorkflow | null;
  workflowError: string | null;
  workflowState: LoadState;
  world: WorldState;
  onSelectAgent: (agentId: string | null) => void;
  onSelectOperation: (agentId: string, correlationId: string | null) => void;
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
  incidentFeed,
  incidentFeedError,
  incidentFeedState,
  operations,
  operationsError,
  operationsState,
  correlation,
  correlationError,
  correlationState,
  selectedAgent,
  workflow,
  workflowError,
  workflowState,
  world,
  onSelectAgent,
  onSelectOperation
}: DetailsPanelProps) {
  const agents = [...world.agents.values()]
    .map((agent) => ({
      agentId: agent.agent_id,
      displayName: agent.display_name,
      severity: agent.severity
    }))
    .sort(compareAgents);

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
                  className="aitown-roster__button"
                  aria-label={
                    operation.correlation_id
                      ? `Open coordination for ${operation.display_name}`
                      : `Inspect ${operation.display_name} from active queue`
                  }
                  onClick={() => onSelectOperation(operation.agent_id, operation.correlation_id)}
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
          <h3>Incident Feed</h3>
          <ul className="aitown-records">
            {incidentFeedState === 'loading' && !incidentFeed ? (
              <li className="aitown-record">Loading incident feed...</li>
            ) : null}
            {incidentFeedError ? <li className="aitown-record">{incidentFeedError}</li> : null}
            {(incidentFeed?.items ?? []).slice(0, 4).map((incident) => (
              <li key={incident.incident_id} className={`aitown-record severity-${incident.severity}`}>
                <strong>{incident.summary}</strong>
                <span>{incident.agent_id}</span>
              </li>
            ))}
            {incidentFeedState === 'ready' && !incidentFeedError && !incidentFeed?.items.length ? (
              <li className="aitown-record">No active incident feed.</li>
            ) : null}
          </ul>
        </section>
      </aside>
    );
  }

  const selectedWorldAgent = world.agents.get(selectedAgent.agent_id) ?? null;
  const inboundWatchers = world.watch_edges.filter((edge) => edge.to_agent_id === selectedAgent.agent_id);
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
        <h3>Coordination</h3>
        <ul className="aitown-records">
          {correlationState === 'loading' && !correlation ? <li className="aitown-record">Loading coordination drilldown...</li> : null}
          {correlationError ? <li className="aitown-record">{correlationError}</li> : null}
          {correlation ? (
            <>
              <li className="aitown-record">
                <strong>{correlation.correlation_id}</strong>
                <span>{`${correlation.participant_agent_ids.length} participants · ${correlation.interaction_count} interactions`}</span>
              </li>
              <li className="aitown-record">
                <strong>Event flow</strong>
                <span>{`${correlation.incident_count} incidents · ${correlation.event_count} events`}</span>
              </li>
              <li className="aitown-record">
                <strong>Evidence refs</strong>
                <span>{correlation.evidence_refs.slice(0, 2).join(', ') || 'No evidence refs'}</span>
              </li>
            </>
          ) : null}
          {correlationState === 'idle' ? <li className="aitown-record">No coordination drilldown selected.</li> : null}
        </ul>
      </section>

      <section className="aitown-details__section">
        <h3>Workflow</h3>
        {workflowState === 'loading' && !workflow ? <p>Loading workflow...</p> : null}
        {workflowError ? <p>{workflowError}</p> : null}
        <ul className="aitown-records">
          {(workflow?.detail.open_peer_watch_alerts ?? []).map((alert) => (
            <li key={alert.alert_id} className={`aitown-record severity-${alert.severity}`}>
              <strong>{alert.summary}</strong>
              <span>{alert.correlation_id ?? 'No correlation id'}</span>
            </li>
          ))}
          {workflow && workflow.detail.open_peer_watch_alerts.length === 0 ? (
            <li className="aitown-record">No open watch alerts.</li>
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
              <span>{incident.status}</span>
            </li>
          ))}
          {incidentFeedState === 'ready' && !incidentFeedError && relatedIncidents.length === 0 ? (
            <li className="aitown-record">No incident feed entries.</li>
          ) : null}
        </ul>
      </section>
    </aside>
  );
}
