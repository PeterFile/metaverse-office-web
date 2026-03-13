import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import {
  DEFAULT_WORKFLOW_LIMIT,
  DEFAULT_WORKFLOW_WINDOW,
  fetchAgentWorkflow,
  fetchCorrelationDrilldown,
  fetchIncidents,
  fetchOfficeOverview
} from './api';
import { buildZoneLayoutModels } from './layout';
import type {
  AgentWorkflow,
  CorrelationDrilldown,
  IncidentFeedResponse,
  OfficeAgent,
  OfficeOverview,
  Severity,
  WorkflowIncident,
  WorkflowInteraction,
  WorkflowTimelineEvent
} from './types';

const POLL_INTERVAL_MS = 15_000;

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

type ZoneStyle = CSSProperties & {
  '--zone-grid-column': string;
  '--zone-grid-row': string;
  '--zone-mobile-grid-column': string;
  '--zone-mobile-order': string;
};

type PolledResource<T> = {
  data: T | null;
  error: string | null;
  state: LoadState;
};

type WatchTopologyRecord = {
  id: string;
  targetLabel: string;
  toAgentId: string;
  watchMode: OfficeOverview['watch_edges'][number]['watch_mode'];
  watcherLabel: string;
  fromAgentId: string;
};

const SEVERITY_RANK: Record<Severity, number> = {
  normal: 0,
  yellow: 1,
  orange: 2,
  red: 3
};

function isAttentionWorthy(agent: OfficeAgent) {
  if (agent.effective_severity !== 'normal') {
    return true;
  }
  if (agent.reboot_recommended) {
    return true;
  }
  if (isBlockedState(agent.current_state)) {
    return true;
  }

  return false;
}

function isBlockedState(state: string) {
  return state.trim().toLowerCase() === 'blocked';
}

function formatInlineList(values: string[], emptyValue = 'None') {
  return values.length > 0 ? values.join(', ') : emptyValue;
}

function compareAttentionAgents(left: OfficeAgent, right: OfficeAgent) {
  const severityDelta =
    SEVERITY_RANK[right.effective_severity] - SEVERITY_RANK[left.effective_severity];
  if (severityDelta !== 0) {
    return severityDelta;
  }

  const rebootDelta = Number(right.reboot_recommended) - Number(left.reboot_recommended);
  if (rebootDelta !== 0) {
    return rebootDelta;
  }

  const blockedDelta =
    Number(isBlockedState(right.current_state)) - Number(isBlockedState(left.current_state));
  if (blockedDelta !== 0) {
    return blockedDelta;
  }

  const nameDelta = left.display_name.localeCompare(right.display_name);
  if (nameDelta !== 0) {
    return nameDelta;
  }

  return left.agent_id.localeCompare(right.agent_id);
}

function buildAttentionQueue(agents: OfficeAgent[]) {
  const attentionWorthyAgents = agents.filter(isAttentionWorthy);
  return [...attentionWorthyAgents].sort(compareAttentionAgents);
}

function buildWatchTopology(watchEdges: OfficeOverview['watch_edges'], agents: OfficeAgent[]) {
  const agentMap = new Map(agents.map((agent) => [agent.agent_id, agent]));

  return [...watchEdges]
    .map<WatchTopologyRecord>((edge) => ({
      id: `${edge.from_agent_id}:${edge.to_agent_id}:${edge.watch_mode}`,
      targetLabel: agentMap.get(edge.to_agent_id)?.display_name || edge.to_agent_id,
      toAgentId: edge.to_agent_id,
      watchMode: edge.watch_mode,
      watcherLabel: agentMap.get(edge.from_agent_id)?.display_name || edge.from_agent_id,
      fromAgentId: edge.from_agent_id
    }))
    .sort(
      (left, right) =>
        left.watcherLabel.localeCompare(right.watcherLabel) ||
        left.targetLabel.localeCompare(right.targetLabel) ||
        left.watchMode.localeCompare(right.watchMode) ||
        left.fromAgentId.localeCompare(right.fromAgentId) ||
        left.toAgentId.localeCompare(right.toAgentId)
    );
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function usePolledResource<T>({
  enabled = true,
  load,
  resourceKey
}: {
  enabled?: boolean;
  load: (signal: AbortSignal) => Promise<T>;
  resourceKey: string | null;
}): PolledResource<T> {
  const loadEvent = useEffectEvent(load);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>(enabled ? 'loading' : 'idle');

  useEffect(() => {
    if (!enabled || !resourceKey) {
      setData(null);
      setError(null);
      setState('idle');
      return undefined;
    }

    let active = true;
    let currentRequestId = 0;
    let timeoutId: number | null = null;
    let controller: AbortController | null = null;
    let hasCommittedData = false;

    setData(null);
    setError(null);
    setState('loading');

    const scheduleNextPoll = () => {
      if (!active) {
        return;
      }

      timeoutId = window.setTimeout(() => {
        void loadResource();
      }, POLL_INTERVAL_MS);
    };

    const loadResource = async () => {
      const requestId = ++currentRequestId;
      const requestController = new AbortController();
      controller = requestController;

      if (!hasCommittedData) {
        setState('loading');
      }

      try {
        const nextData = await loadEvent(requestController.signal);
        if (!active || requestController.signal.aborted || requestId !== currentRequestId) {
          return;
        }

        hasCommittedData = true;
        setData(nextData);
        setError(null);
        setState('ready');
      } catch (nextError) {
        if (
          !active ||
          requestController.signal.aborted ||
          requestId !== currentRequestId ||
          isAbortError(nextError)
        ) {
          return;
        }

        setError(nextError instanceof Error ? nextError.message : 'unknown_error');
        setState(hasCommittedData ? 'ready' : 'error');
      } finally {
        if (controller === requestController) {
          controller = null;
        }
        scheduleNextPoll();
      }
    };

    void loadResource();

    return () => {
      active = false;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      controller?.abort();
    };
  }, [enabled, resourceKey]);

  return { data, error, state };
}

function RefreshStatusNotice({
  hasData,
  label,
  error
}: {
  hasData: boolean;
  label: string;
  error: string | null;
}) {
  if (!hasData || !error) {
    return null;
  }

  return (
    <p className="surface-status surface-status--degraded" role="status" aria-live="polite">
      {`${label} refresh degraded. Showing last good data. Reason: ${error}`}
    </p>
  );
}

function CorrelationButton({
  correlationId,
  isSelected,
  labelPrefix = 'Open correlation',
  onSelect
}: {
  correlationId: string | null;
  isSelected: boolean;
  labelPrefix?: string;
  onSelect: (correlationId: string) => void;
}) {
  if (!correlationId) {
    return <span className="correlation-chip correlation-chip--muted">No correlation</span>;
  }

  return (
    <button
      type="button"
      className={`correlation-chip${isSelected ? ' selected' : ''}`}
      aria-label={`${labelPrefix} ${correlationId}`}
      aria-pressed={isSelected}
      onClick={() => onSelect(correlationId)}
    >
      {correlationId}
    </button>
  );
}

function AgentCard({
  agent,
  isSelected,
  onSelect
}: {
  agent: OfficeAgent;
  isSelected: boolean;
  onSelect: (agentId: string) => void;
}) {
  return (
    <button
      type="button"
      className={`agent-card severity-${agent.effective_severity}${isSelected ? ' selected' : ''}`}
      onClick={() => onSelect(agent.agent_id)}
      aria-pressed={isSelected}
    >
      <span className="agent-card__name">{agent.display_name}</span>
      <span className="agent-card__meta">State: {agent.current_state}</span>
      <span className="agent-card__meta">Location: {agent.current_location}</span>
      <span className="agent-card__meta">Severity: {agent.effective_severity}</span>
      <span className="agent-card__task">{agent.active_task || 'No active task recorded.'}</span>
      {agent.reboot_recommended ? <span className="agent-card__flag">Reboot recommended</span> : null}
    </button>
  );
}

function SummaryStrip({ overview }: { overview: OfficeOverview }) {
  const buckets = overview.summary.severity_buckets;

  return (
    <section className="summary-strip" aria-label="Office summary">
      <div>
        <strong>{overview.summary.agent_count} agents</strong>
      </div>
      <div>{overview.summary.blocked_count} blocked</div>
      <div>{overview.summary.reboot_recommended_count} reboot recommended</div>
      <div>Normal {buckets.normal}</div>
      <div>Yellow {buckets.yellow}</div>
      <div>Orange {buckets.orange}</div>
      <div>Red {buckets.red}</div>
    </section>
  );
}

function AttentionQueuePanel({
  agents,
  selectedAgentId,
  onSelectAgent
}: {
  agents: OfficeAgent[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
}) {
  return (
    <section className="operations-panel">
      <div className="panel-heading">
        <div>
          <h2>Operator attention queue</h2>
          <p>Deterministic urgency order from the current overview.</p>
        </div>
      </div>

      {agents.length > 0 ? (
        <ul className="record-list">
          {agents.map((agent) => (
            <li
              key={agent.agent_id}
              className={`record-item attention-item severity-${agent.effective_severity}${
                selectedAgentId === agent.agent_id ? ' attention-item--selected' : ''
              }`}
            >
              <button
                type="button"
                className="attention-item__button"
                aria-pressed={selectedAgentId === agent.agent_id}
                onClick={() => onSelectAgent(agent.agent_id)}
              >
                <span className="attention-item__name">{agent.display_name}</span>
                <span className="record-item__meta">{`Severity: ${agent.effective_severity}`}</span>
                <span className="record-item__meta">{`State: ${agent.current_state}`}</span>
                <span className="record-item__meta">{`Task: ${
                  agent.active_task || 'No active task recorded.'
                }`}</span>
                <span className="record-item__meta">{`Reboot: ${
                  agent.reboot_recommended ? 'recommended' : 'not recommended'
                }`}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>No attention-worthy agents in the current overview.</p>
      )}
    </section>
  );
}

function WatchTopologyPanel({ topology }: { topology: WatchTopologyRecord[] }) {
  return (
    <section className="operations-panel">
      <div className="panel-heading">
        <div>
          <h2>Watch topology</h2>
          <p>Watcher to target relationships from the office overview.</p>
        </div>
      </div>

      {topology.length > 0 ? (
        <ul className="record-list">
          {topology.map((edge) => (
            <li key={edge.id} className="record-item">
              <strong>{`${edge.watcherLabel} -> ${edge.targetLabel}`}</strong>
              <span className="record-item__meta">{`Mode: ${edge.watchMode}`}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p>No watch relationships in the current overview.</p>
      )}
    </section>
  );
}

function OfficeGrid({
  overview,
  selectedAgentId,
  onSelectAgent
}: {
  overview: OfficeOverview;
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
}) {
  const agentMap = useMemo(
    () => new Map(overview.agents.map((agent) => [agent.agent_id, agent])),
    [overview.agents]
  );
  const zoneLayouts = useMemo(() => buildZoneLayoutModels(overview.zones), [overview.zones]);

  return (
    <section className="office-grid" aria-label="Office grid">
      {zoneLayouts.map((layout) => {
        const { zone } = layout;
        const zoneStyle: ZoneStyle = {
          '--zone-grid-column': layout.desktop.gridColumn,
          '--zone-grid-row': layout.desktop.gridRow,
          '--zone-mobile-grid-column': layout.mobile.gridColumn,
          '--zone-mobile-order': String(layout.mobile.order)
        };

        return (
          <article key={zone.zone_id} className="office-zone" style={zoneStyle}>
            <header className="office-zone__header">
              <h2>{zone.label}</h2>
              <span>{zone.kind}</span>
            </header>
            {zone.occupants.length > 0 ? (
              <div className="office-zone__occupants">
                {zone.occupants.map((occupant) => {
                  const agent = agentMap.get(occupant.agent_id);
                  if (!agent) {
                    return null;
                  }

                  return (
                    <AgentCard
                      key={agent.agent_id}
                      agent={agent}
                      isSelected={selectedAgentId === agent.agent_id}
                      onSelect={onSelectAgent}
                    />
                  );
                })}
              </div>
            ) : (
              <p className="office-zone__empty">No occupants in this zone.</p>
            )}
          </article>
        );
      })}
    </section>
  );
}

function WorkflowList<T>({
  title,
  empty,
  items,
  render
}: {
  title: string;
  empty: string;
  items: T[];
  render: (item: T) => ReactNode;
}) {
  return (
    <section className="workflow-section">
      <h3>{title}</h3>
      {items.length > 0 ? <ul className="record-list">{items.map(render)}</ul> : <p>{empty}</p>}
    </section>
  );
}

function IncidentRecord({
  incident,
  selectedCorrelationId,
  correlationButtonLabelPrefix,
  onSelectCorrelation
}: {
  incident: WorkflowIncident;
  selectedCorrelationId: string | null;
  correlationButtonLabelPrefix?: string;
  onSelectCorrelation?: (correlationId: string) => void;
}) {
  return (
    <li className="record-item">
      <div className="record-item__header">
        <strong>{incident.summary}</strong>
        {onSelectCorrelation ? (
          <CorrelationButton
            correlationId={incident.correlation_id}
            isSelected={selectedCorrelationId === incident.correlation_id}
            labelPrefix={correlationButtonLabelPrefix}
            onSelect={onSelectCorrelation}
          />
        ) : null}
      </div>
      <span className="record-item__meta">{`${incident.severity} · ${incident.status}`}</span>
      <span className="record-item__meta">{`${incident.agent_id} · ${incident.ts}`}</span>
      <span className="record-item__meta">{`Source: ${incident.source_kind}`}</span>
      <span className="record-item__meta">{`Counterparties: ${formatInlineList(
        incident.counterparty_agent_ids
      )}`}</span>
      <span className="record-item__meta">{`Evidence: ${formatInlineList(incident.evidence_refs)}`}</span>
    </li>
  );
}

function InteractionRecord({ interaction }: { interaction: WorkflowInteraction }) {
  return (
    <li className="record-item">
      <div className="record-item__header">
        <strong>{interaction.summary}</strong>
      </div>
      <span className="record-item__meta">{interaction.interaction_type}</span>
      <span className="record-item__meta">{interaction.started_at}</span>
      <span className="record-item__meta">{`Participants: ${formatInlineList(
        interaction.participant_agent_ids
      )}`}</span>
      {interaction.correlation_id ? (
        <span className="record-item__meta">{`Correlation: ${interaction.correlation_id}`}</span>
      ) : null}
      {interaction.severity ? (
        <span className="record-item__meta">{`Severity: ${interaction.severity}`}</span>
      ) : null}
      <span className="record-item__meta">{`Evidence: ${formatInlineList(
        interaction.evidence_refs
      )}`}</span>
    </li>
  );
}

function TimelineRecord({ event }: { event: WorkflowTimelineEvent }) {
  return (
    <li className="record-item">
      <div className="record-item__header">
        <strong>{event.summary}</strong>
      </div>
      <span className="record-item__meta">{`${event.event_type} · ${event.severity}`}</span>
      <span className="record-item__meta">{event.ts}</span>
      <span className="record-item__meta">{`Source: ${event.source_kind}`}</span>
      <span className="record-item__meta">{`Location: ${event.location}`}</span>
      <span className="record-item__meta">{`Counterparties: ${formatInlineList(
        event.counterparty_agent_ids
      )}`}</span>
      <span className="record-item__meta">{`Evidence: ${formatInlineList(event.evidence_refs)}`}</span>
    </li>
  );
}

function WorkflowPanel({
  selectedAgent,
  selectedCorrelationId,
  workflowState,
  workflow,
  workflowError,
  onSelectCorrelation
}: {
  selectedAgent: OfficeAgent | null;
  selectedCorrelationId: string | null;
  workflowState: LoadState;
  workflow: AgentWorkflow | null;
  workflowError: string | null;
  onSelectCorrelation: (correlationId: string) => void;
}) {
  if (!selectedAgent) {
    return (
      <aside className="workflow-panel">
        <h2>Workflow panel</h2>
        <p>Select an agent to inspect incidents, interactions, and replay evidence.</p>
      </aside>
    );
  }

  if (workflowState === 'loading' && !workflow) {
    return (
      <aside className="workflow-panel">
        <h2>Workflow panel</h2>
        <p>Loading workflow.</p>
      </aside>
    );
  }

  if (workflowState === 'error') {
    return (
      <aside className="workflow-panel">
        <h2>Workflow panel</h2>
        <p>Unable to load workflow.</p>
        {workflowError ? <p>{workflowError}</p> : null}
      </aside>
    );
  }

  if (!workflow) {
    return null;
  }

  return (
    <aside className="workflow-panel">
      <h2>{`Workflow: ${workflow.detail.display_name || selectedAgent.display_name}`}</h2>
      <RefreshStatusNotice hasData={workflow !== null} label="Workflow" error={workflowError} />
      <p>{workflow.detail.active_task || 'No active task recorded.'}</p>
      <p>State: {workflow.detail.current_state}</p>
      <p>Location: {workflow.detail.current_location}</p>
      <p>
        Latest heartbeat:{' '}
        {workflow.detail.latest_heartbeat?.received_at || 'No heartbeat recorded in this slice.'}
      </p>

      <section className="workflow-section">
        <h3>Correlation ids</h3>
        {workflow.correlation_ids.length > 0 ? (
          <ul className="token-list">
            {workflow.correlation_ids.map((value) => (
              <li key={value}>
                <CorrelationButton
                  correlationId={value}
                  isSelected={selectedCorrelationId === value}
                  onSelect={onSelectCorrelation}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p>No correlation ids in this slice.</p>
        )}
      </section>

      <section className="workflow-section">
        <h3>Counterparties</h3>
        {workflow.counterparty_agent_ids.length > 0 ? (
          <ul className="token-list token-list--plain">
            {workflow.counterparty_agent_ids.map((value) => (
              <li key={value} className="token-pill">
                {value}
              </li>
            ))}
          </ul>
        ) : (
          <p>No counterparties in this slice.</p>
        )}
      </section>

      <WorkflowList
        title="Incidents"
        empty={`No incidents in ${DEFAULT_WORKFLOW_WINDOW}.`}
        items={workflow.incidents}
        render={(incident) => (
          <IncidentRecord
            key={incident.incident_id}
            incident={incident}
            selectedCorrelationId={selectedCorrelationId}
            correlationButtonLabelPrefix="Inspect workflow incident correlation"
            onSelectCorrelation={onSelectCorrelation}
          />
        )}
      />
      <WorkflowList
        title="Interactions"
        empty={`No interactions in ${DEFAULT_WORKFLOW_WINDOW}.`}
        items={workflow.interactions}
        render={(interaction) => (
          <InteractionRecord key={interaction.interaction_id} interaction={interaction} />
        )}
      />
      <WorkflowList
        title="Timeline"
        empty={`No timeline events in ${DEFAULT_WORKFLOW_WINDOW}.`}
        items={workflow.timeline}
        render={(event) => <TimelineRecord key={event.event_id} event={event} />}
      />
    </aside>
  );
}

function IncidentFeedPanel({
  incidentFeed,
  incidentFeedError,
  incidentFeedState,
  selectedCorrelationId,
  onSelectCorrelation
}: {
  incidentFeed: IncidentFeedResponse | null;
  incidentFeedError: string | null;
  incidentFeedState: LoadState;
  selectedCorrelationId: string | null;
  onSelectCorrelation: (correlationId: string) => void;
}) {
  return (
    <section className="operations-panel">
      <div className="panel-heading">
        <div>
          <h2>Global incident feed</h2>
          <p>Read-only incidents across the office.</p>
        </div>
      </div>
      <RefreshStatusNotice
        hasData={incidentFeed !== null}
        label="Incident feed"
        error={incidentFeedError}
      />

      {incidentFeedState === 'loading' && !incidentFeed ? <p>Loading incident feed.</p> : null}

      {incidentFeedState === 'error' ? (
        <>
          <p>Unable to load incident feed.</p>
          {incidentFeedError ? <p>{incidentFeedError}</p> : null}
        </>
      ) : null}

      {incidentFeedState !== 'error' && incidentFeed ? (
        incidentFeed.items.length > 0 ? (
          <ul className="record-list">
            {incidentFeed.items.map((incident) => (
              <IncidentRecord
                key={incident.incident_id}
                incident={incident}
                selectedCorrelationId={selectedCorrelationId}
                correlationButtonLabelPrefix="Inspect correlation"
                onSelectCorrelation={onSelectCorrelation}
              />
            ))}
          </ul>
        ) : (
          <p>{`No incidents in ${DEFAULT_WORKFLOW_WINDOW} for the global feed.`}</p>
        )
      ) : null}
    </section>
  );
}

function CorrelationPanel({
  correlation,
  correlationError,
  correlationState,
  selectedCorrelationId
}: {
  correlation: CorrelationDrilldown | null;
  correlationError: string | null;
  correlationState: LoadState;
  selectedCorrelationId: string | null;
}) {
  if (!selectedCorrelationId) {
    return (
      <section className="operations-panel">
        <h2>Correlation drilldown</h2>
        <p>Select a correlation id from workflow or incident feed.</p>
      </section>
    );
  }

  if (correlationState === 'loading' && !correlation) {
    return (
      <section className="operations-panel">
        <h2>Correlation drilldown</h2>
        <p>Loading correlation drilldown.</p>
      </section>
    );
  }

  if (correlationState === 'error') {
    return (
      <section className="operations-panel">
        <h2>Correlation drilldown</h2>
        <p>Unable to load correlation.</p>
        {correlationError ? <p>{correlationError}</p> : null}
      </section>
    );
  }

  if (!correlation) {
    return null;
  }

  return (
    <section className="operations-panel">
      <div className="panel-heading">
        <div>
          <h2>{`Correlation: ${correlation.correlation_id}`}</h2>
          <p>{`${correlation.incident_count} incidents · ${correlation.interaction_count} interactions · ${correlation.event_count} events`}</p>
        </div>
      </div>
      <RefreshStatusNotice hasData={correlation !== null} label="Correlation" error={correlationError} />

      <section className="detail-grid">
        <div className="detail-card">
          <strong>Time window</strong>
          <p>{correlation.first_ts || 'No first timestamp.'}</p>
          <p>{correlation.last_ts || 'No last timestamp.'}</p>
        </div>
        <div className="detail-card">
          <strong>Participants</strong>
          {correlation.participant_agent_ids.length > 0 ? (
            <ul className="token-list token-list--plain">
              {correlation.participant_agent_ids.map((value) => (
                <li key={value} className="token-pill">
                  {value}
                </li>
              ))}
            </ul>
          ) : (
            <p>No participant agents recorded.</p>
          )}
        </div>
        <div className="detail-card">
          <strong>Evidence refs</strong>
          {correlation.evidence_refs.length > 0 ? (
            <ul className="token-list token-list--plain">
              {correlation.evidence_refs.map((value) => (
                <li key={value} className="token-pill">
                  {value}
                </li>
              ))}
            </ul>
          ) : (
            <p>No evidence refs recorded.</p>
          )}
        </div>
      </section>

      <WorkflowList
        title="Incidents"
        empty={`No incidents in ${DEFAULT_WORKFLOW_WINDOW}.`}
        items={correlation.incidents}
        render={(incident) => (
          <IncidentRecord
            key={incident.incident_id}
            incident={incident}
            selectedCorrelationId={selectedCorrelationId}
          />
        )}
      />
      <WorkflowList
        title="Interactions"
        empty={`No interactions in ${DEFAULT_WORKFLOW_WINDOW}.`}
        items={correlation.interactions}
        render={(interaction) => (
          <InteractionRecord key={interaction.interaction_id} interaction={interaction} />
        )}
      />
      <WorkflowList
        title="Timeline"
        empty={`No timeline events in ${DEFAULT_WORKFLOW_WINDOW}.`}
        items={correlation.timeline}
        render={(event) => <TimelineRecord key={event.event_id} event={event} />}
      />
    </section>
  );
}

export default function App() {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedCorrelationId, setSelectedCorrelationId] = useState<string | null>(null);

  const overviewResource = usePolledResource({
    load: (signal) => fetchOfficeOverview(signal),
    resourceKey: 'office-overview'
  });
  const incidentFeedResource = usePolledResource({
    load: (signal) =>
      fetchIncidents({
        limit: DEFAULT_WORKFLOW_LIMIT,
        window: DEFAULT_WORKFLOW_WINDOW,
        signal
      }),
    resourceKey: 'incident-feed'
  });
  const selectedAgentAvailableId =
    selectedAgentId && overviewResource.data?.agents.some((agent) => agent.agent_id === selectedAgentId)
      ? selectedAgentId
      : null;

  const workflowResource = usePolledResource({
    enabled: selectedAgentAvailableId !== null,
    load: (signal) =>
      fetchAgentWorkflow(selectedAgentAvailableId!, {
        limit: DEFAULT_WORKFLOW_LIMIT,
        window: DEFAULT_WORKFLOW_WINDOW,
        signal
      }),
    resourceKey: selectedAgentAvailableId
  });
  const correlationResource = usePolledResource({
    enabled: selectedCorrelationId !== null,
    load: (signal) =>
      fetchCorrelationDrilldown(selectedCorrelationId!, {
        limit: DEFAULT_WORKFLOW_LIMIT,
        window: DEFAULT_WORKFLOW_WINDOW,
        signal
      }),
    resourceKey: selectedCorrelationId
  });

  const selectedAgent = useMemo(
    () => overviewResource.data?.agents.find((agent) => agent.agent_id === selectedAgentAvailableId) || null,
    [overviewResource.data, selectedAgentAvailableId]
  );

  useEffect(() => {
    if (!overviewResource.data || !selectedAgentId || selectedAgentAvailableId !== null) {
      return;
    }

    setSelectedAgentId(null);
  }, [overviewResource.data, selectedAgentAvailableId, selectedAgentId]);

  const attentionQueue = useMemo(
    () => buildAttentionQueue(overviewResource.data?.agents || []),
    [overviewResource.data]
  );
  const watchTopology = useMemo(
    () =>
      buildWatchTopology(
        overviewResource.data?.watch_edges || [],
        overviewResource.data?.agents || []
      ),
    [overviewResource.data]
  );

  if (overviewResource.state === 'loading' && !overviewResource.data) {
    return (
      <main className="app-shell">
        <p>Loading office overview.</p>
      </main>
    );
  }

  if (overviewResource.state === 'error') {
    return (
      <main className="app-shell">
        <h1>Operator Shell</h1>
        <p>Unable to load office overview.</p>
        {overviewResource.error ? <p>{overviewResource.error}</p> : null}
      </main>
    );
  }

  if (!overviewResource.data) {
    return null;
  }

  return (
    <main className="app-shell">
      <header className="app-shell__header">
        <div>
          <h1>Operator Shell</h1>
          <p>Evidence-first office surface for the Phase 1 metaverse office.</p>
          <RefreshStatusNotice
            hasData={overviewResource.data !== null}
            label="Overview"
            error={overviewResource.error}
          />
        </div>
        <p>Last refresh: {overviewResource.data.generated_at}</p>
      </header>

      <SummaryStrip overview={overviewResource.data} />

      <section className="app-shell__content">
        <OfficeGrid
          overview={overviewResource.data}
          selectedAgentId={selectedAgentId}
          onSelectAgent={setSelectedAgentId}
        />
        <div className="app-shell__sidebar">
          <AttentionQueuePanel
            agents={attentionQueue}
            selectedAgentId={selectedAgentId}
            onSelectAgent={setSelectedAgentId}
          />
          <WorkflowPanel
            selectedAgent={selectedAgent}
            selectedCorrelationId={selectedCorrelationId}
            workflowState={workflowResource.state}
            workflow={workflowResource.data}
            workflowError={workflowResource.error}
            onSelectCorrelation={setSelectedCorrelationId}
          />
        </div>
      </section>

      <section className="app-shell__operations">
        <IncidentFeedPanel
          incidentFeed={incidentFeedResource.data}
          incidentFeedError={incidentFeedResource.error}
          incidentFeedState={incidentFeedResource.state}
          selectedCorrelationId={selectedCorrelationId}
          onSelectCorrelation={setSelectedCorrelationId}
        />
        <WatchTopologyPanel topology={watchTopology} />
        <CorrelationPanel
          correlation={correlationResource.data}
          correlationError={correlationResource.error}
          correlationState={correlationResource.state}
          selectedCorrelationId={selectedCorrelationId}
        />
      </section>

      <footer className="app-shell__footer">
        <p>Polling every {POLL_INTERVAL_MS / 1000}s. No fake motion. No synthetic activity.</p>
        <p>{`Using ${DEFAULT_WORKFLOW_WINDOW} read-only slices with limit ${DEFAULT_WORKFLOW_LIMIT} for workflow, incidents, and correlation.`}</p>
      </footer>
    </main>
  );
}
