import { useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import {
  DEFAULT_WORKFLOW_LIMIT,
  DEFAULT_WORKFLOW_WINDOW,
  RequestError,
  fetchAgentWorkflow,
  fetchCorrelationDrilldown,
  fetchIncidents,
  fetchOfficeOverview
} from './api';
import { usePolledResource, type LoadState, POLL_INTERVAL_MS } from './hooks/usePolledResource';
import { ControlDeck } from './hud/ControlDeck';
import { buildZoneLayoutModels } from './layout';
import type {
  AgentWorkflow,
  CorrelationDrilldown,
  IncidentFeedResponse,
  OfficeAgent,
  OfficeOverview,
  Severity,
  WorkflowDetailEvent,
  WorkflowDetailHandoff,
  WorkflowDetailReboot,
  WorkflowIncident,
  WorkflowInteraction,
  WorkflowPeerWatchAlert,
  WorkflowTimelineEvent
} from './types';

type ZoneStyle = CSSProperties & {
  '--zone-grid-column': string;
  '--zone-grid-row': string;
  '--zone-mobile-grid-column': string;
  '--zone-mobile-order': string;
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

function recordsIncludeCorrelation(
  records: Array<{
    correlation_id?: string | null;
  }>,
  correlationId: string
) {
  return records.some((record) => record.correlation_id === correlationId);
}

function workflowShowsCorrelation(workflow: AgentWorkflow | null, correlationId: string) {
  if (!workflow) {
    return false;
  }

  return (
    workflow.correlation_ids.includes(correlationId) ||
    recordsIncludeCorrelation(workflow.incidents, correlationId) ||
    recordsIncludeCorrelation(workflow.interactions, correlationId) ||
    recordsIncludeCorrelation(workflow.timeline, correlationId) ||
    recordsIncludeCorrelation(workflow.detail.open_peer_watch_alerts, correlationId) ||
    recordsIncludeCorrelation(workflow.detail.recent_events, correlationId) ||
    recordsIncludeCorrelation(workflow.detail.recent_handoffs, correlationId) ||
    recordsIncludeCorrelation(workflow.detail.recent_reboots, correlationId)
  );
}

function incidentFeedShowsCorrelation(incidentFeed: IncidentFeedResponse | null, correlationId: string) {
  if (!incidentFeed) {
    return false;
  }

  return recordsIncludeCorrelation(incidentFeed.items, correlationId);
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

function WorkflowAgentButton({
  agentId,
  isSelected,
  onSelect
}: {
  agentId: string;
  isSelected: boolean;
  onSelect: (agentId: string) => void;
}) {
  const ariaLabel = isSelected ? `Select workflow for ${agentId} (selected)` : `Select workflow for ${agentId}`;

  return (
    <button
      type="button"
      className={`token-pill token-pill--action${isSelected ? ' token-pill--selected' : ''}`}
      aria-label={ariaLabel}
      aria-pressed={isSelected}
      onClick={() => onSelect(agentId)}
    >
      {agentId}
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
    <section className="operations-panel" aria-label="Operator attention queue">
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

function WatchTopologyPanel({
  topology,
  selectedAgentId,
  onSelectAgent
}: {
  topology: WatchTopologyRecord[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
}) {
  return (
    <section className="operations-panel" aria-label="Watch topology">
      <div className="panel-heading">
        <div>
          <h2>Watch topology</h2>
          <p>Watcher to target relationships from the office overview.</p>
        </div>
      </div>

      {topology.length > 0 ? (
        <ul className="record-list">
          {topology.map((edge) => (
            <li
              key={edge.id}
              className={`record-item attention-item${
                selectedAgentId === edge.toAgentId ? ' attention-item--selected' : ''
              }`}
            >
              <button
                type="button"
                className="attention-item__button"
                aria-label={`Select target ${edge.targetLabel} from ${edge.watcherLabel} (${edge.watchMode} watch)${selectedAgentId === edge.toAgentId ? ' (selected)' : ''}`}
                aria-pressed={selectedAgentId === edge.toAgentId}
                onClick={() => onSelectAgent(edge.toAgentId)}
              >
                <strong>{`${edge.watcherLabel} -> ${edge.targetLabel}`}</strong>
                <span className="record-item__meta">{`Mode: ${edge.watchMode}`}</span>
              </button>
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
  listLabel,
  render
}: {
  title: string;
  empty: string;
  items: T[];
  listLabel?: string;
  render: (item: T) => ReactNode;
}) {
  return (
    <section className="workflow-section">
      <h3>{title}</h3>
      {items.length > 0 ? (
        <ul className="record-list" aria-label={listLabel}>
          {items.map(render)}
        </ul>
      ) : (
        <p>{empty}</p>
      )}
    </section>
  );
}

function WorkflowDetailSurface<T>({
  title,
  empty,
  items,
  listLabel,
  render
}: {
  title: string;
  empty: string;
  items: T[];
  listLabel: string;
  render: (item: T) => ReactNode;
}) {
  return (
    <section className="detail-card">
      <strong>{title}</strong>
      {items.length > 0 ? (
        <ul className="record-list" aria-label={listLabel}>
          {items.map(render)}
        </ul>
      ) : (
        <p>{empty}</p>
      )}
    </section>
  );
}

function IncidentRecord({
  incident,
  selectedAgentId,
  selectedCorrelationId,
  correlationButtonLabelPrefix,
  onSelectAgent,
  onSelectCorrelation
}: {
  incident: WorkflowIncident;
  selectedAgentId?: string | null;
  selectedCorrelationId: string | null;
  correlationButtonLabelPrefix?: string;
  onSelectAgent?: (agentId: string) => void;
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
      {onSelectAgent ? (
        <>
          <WorkflowAgentButton
            agentId={incident.agent_id}
            isSelected={selectedAgentId === incident.agent_id}
            onSelect={onSelectAgent}
          />
          <span className="record-item__meta">{`Timestamp: ${incident.ts}`}</span>
        </>
      ) : (
        <span className="record-item__meta">{`${incident.agent_id} · ${incident.ts}`}</span>
      )}
      <span className="record-item__meta">{`Source: ${incident.source_kind}`}</span>
      <span className="record-item__meta">{`Counterparties: ${formatInlineList(
        incident.counterparty_agent_ids
      )}`}</span>
      <span className="record-item__meta">{`Evidence: ${formatInlineList(incident.evidence_refs)}`}</span>
    </li>
  );
}

function InteractionRecord({
  interaction,
  selectedAgentId,
  onSelectAgent
}: {
  interaction: WorkflowInteraction;
  selectedAgentId?: string | null;
  onSelectAgent?: (agentId: string) => void;
}) {
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
      {onSelectAgent ? (
        <ul className="token-list token-list--plain">
          {interaction.participant_agent_ids.map((value) => (
            <li key={`${interaction.interaction_id}:${value}`}>
              <WorkflowAgentButton
                agentId={value}
                isSelected={selectedAgentId === value}
                onSelect={onSelectAgent}
              />
            </li>
          ))}
        </ul>
      ) : null}
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

function PeerWatchAlertRecord({ alert }: { alert: WorkflowPeerWatchAlert }) {
  return (
    <li className="record-item">
      <div className="record-item__header">
        <strong>{alert.summary}</strong>
      </div>
      <span className="record-item__meta">{`${alert.severity} · ${alert.status}`}</span>
      <span className="record-item__meta">{`Current state: ${alert.current_state}`}</span>
      <span className="record-item__meta">{`Task: ${alert.active_task || 'No active task recorded.'}`}</span>
      <span className="record-item__meta">{`Observer: ${alert.observer_agent_id}`}</span>
      <span className="record-item__meta">{`Watchers: ${formatInlineList(alert.watcher_agent_ids)}`}</span>
      <span className="record-item__meta">{`Evidence refs: ${formatInlineList(alert.evidence_refs)}`}</span>
      <span className="record-item__meta">{`Evidence count: ${alert.evidence_count}`}</span>
      {alert.correlation_id ? (
        <span className="record-item__meta">{`Correlation: ${alert.correlation_id}`}</span>
      ) : null}
      <span className="record-item__meta">{`Source: ${alert.source_kind}`}</span>
    </li>
  );
}

function DetailEventRecord({ event }: { event: WorkflowDetailEvent }) {
  return (
    <li className="record-item">
      <div className="record-item__header">
        <strong>{event.summary}</strong>
      </div>
      <span className="record-item__meta">{`${event.event_type} · ${event.severity}`}</span>
      <span className="record-item__meta">{`Timestamp: ${event.ts}`}</span>
      <span className="record-item__meta">{`State: ${event.current_state}`}</span>
      <span className="record-item__meta">{`Task: ${event.active_task || 'No active task recorded.'}`}</span>
      <span className="record-item__meta">{`Location: ${event.location}`}</span>
      <span className="record-item__meta">{`Counterparties: ${formatInlineList(
        event.counterparty_agent_ids
      )}`}</span>
      <span className="record-item__meta">{`Evidence refs: ${formatInlineList(event.evidence_refs)}`}</span>
      {event.correlation_id ? (
        <span className="record-item__meta">{`Correlation: ${event.correlation_id}`}</span>
      ) : null}
      <span className="record-item__meta">{`Source: ${event.source_kind}`}</span>
    </li>
  );
}

function HandoffRecord({ handoff }: { handoff: WorkflowDetailHandoff }) {
  return (
    <li className="record-item">
      <div className="record-item__header">
        <strong>{handoff.summary}</strong>
      </div>
      <span className="record-item__meta">{`${handoff.status} · ${handoff.severity}`}</span>
      <span className="record-item__meta">{`Timestamp: ${handoff.ts}`}</span>
      <span className="record-item__meta">{`Actor: ${handoff.actor_id}`}</span>
      <span className="record-item__meta">{`Counterparties: ${formatInlineList(
        handoff.counterparty_agent_ids
      )}`}</span>
      <span className="record-item__meta">{`Evidence refs: ${formatInlineList(handoff.evidence_refs)}`}</span>
      {handoff.correlation_id ? (
        <span className="record-item__meta">{`Correlation: ${handoff.correlation_id}`}</span>
      ) : null}
      <span className="record-item__meta">{`Source: ${handoff.source_kind}`}</span>
    </li>
  );
}

function RebootRecord({ reboot }: { reboot: WorkflowDetailReboot }) {
  return (
    <li className="record-item">
      <div className="record-item__header">
        <strong>{reboot.summary}</strong>
      </div>
      <span className="record-item__meta">{`${reboot.status} · ${reboot.severity}`}</span>
      <span className="record-item__meta">{`Timestamp: ${reboot.ts}`}</span>
      <span className="record-item__meta">{`Actor: ${reboot.actor_id}`}</span>
      <span className="record-item__meta">{`Counterparties: ${formatInlineList(
        reboot.counterparty_agent_ids
      )}`}</span>
      <span className="record-item__meta">{`Evidence refs: ${formatInlineList(reboot.evidence_refs)}`}</span>
      {reboot.correlation_id ? (
        <span className="record-item__meta">{`Correlation: ${reboot.correlation_id}`}</span>
      ) : null}
      <span className="record-item__meta">{`Source: ${reboot.source_kind}`}</span>
    </li>
  );
}

function WorkflowPanel({
  selectedAgentId,
  selectedAgent,
  selectedAgentStillVisibleInOverview,
  selectedCorrelationId,
  workflowState,
  workflow,
  workflowError,
  onSelectAgent,
  onSelectCorrelation
}: {
  selectedAgentId: string | null;
  selectedAgent: OfficeAgent | null;
  selectedAgentStillVisibleInOverview: boolean;
  selectedCorrelationId: string | null;
  workflowState: LoadState;
  workflow: AgentWorkflow | null;
  workflowError: string | null;
  onSelectAgent: (agentId: string) => void;
  onSelectCorrelation: (correlationId: string) => void;
}) {
  if (!selectedAgentId) {
    return (
      <aside className="workflow-panel" aria-label="Workflow panel">
        <h2>Workflow panel</h2>
        <p>Select an agent to inspect incidents, interactions, and replay evidence.</p>
      </aside>
    );
  }

  if (workflowState === 'loading' && !workflow) {
    return (
      <aside className="workflow-panel" aria-label="Workflow panel">
        <h2>Workflow panel</h2>
        <p role="status" aria-live="polite">
          Loading workflow.
        </p>
      </aside>
    );
  }

  if (workflowState === 'error') {
    return (
      <aside className="workflow-panel" aria-label="Workflow panel">
        <h2>Workflow panel</h2>
        <div role="alert">
          <p>Unable to load workflow.</p>
          {workflowError ? <p>{workflowError}</p> : null}
        </div>
      </aside>
    );
  }

  if (!workflow) {
    return null;
  }

  const workflowDisplayName = workflow.detail.display_name || selectedAgent?.display_name || selectedAgentId;

  return (
    <aside className="workflow-panel" aria-label="Workflow panel">
      <h2>{`Workflow: ${workflowDisplayName}`}</h2>
      <RefreshStatusNotice hasData={workflow !== null} label="Workflow" error={workflowError} />
      {!selectedAgentStillVisibleInOverview ? (
        <p className="surface-status surface-status--warning" role="note">
          {`${workflowDisplayName} is absent from the current office overview. Workflow evidence remains available, but the office grid and watch topology cannot highlight this agent.`}
        </p>
      ) : null}
      <p>{workflow.detail.active_task || 'No active task recorded.'}</p>
      <p>State: {workflow.detail.current_state}</p>
      <p>Location: {workflow.detail.current_location}</p>
      <p>
        Latest heartbeat:{' '}
        {workflow.detail.latest_heartbeat?.received_at || 'No heartbeat recorded in this slice.'}
      </p>

      <section className="detail-grid">
        <WorkflowDetailSurface
          title="Open peer-watch alerts"
          empty="No open peer-watch alerts in this detail slice."
          items={workflow.detail.open_peer_watch_alerts}
          listLabel="Workflow detail peer-watch alerts"
          render={(alert) => <PeerWatchAlertRecord key={alert.alert_id} alert={alert} />}
        />
        <WorkflowDetailSurface
          title="Recent events"
          empty="No recent events in this detail slice."
          items={workflow.detail.recent_events}
          listLabel="Workflow detail recent events"
          render={(event) => <DetailEventRecord key={event.event_id} event={event} />}
        />
        <WorkflowDetailSurface
          title="Recent handoffs"
          empty="No recent handoffs in this detail slice."
          items={workflow.detail.recent_handoffs}
          listLabel="Workflow detail recent handoffs"
          render={(handoff) => <HandoffRecord key={handoff.handoff_id} handoff={handoff} />}
        />
        <WorkflowDetailSurface
          title="Recent reboots"
          empty="No recent reboots in this detail slice."
          items={workflow.detail.recent_reboots}
          listLabel="Workflow detail recent reboots"
          render={(reboot) => <RebootRecord key={reboot.reboot_id} reboot={reboot} />}
        />
      </section>

      <section className="workflow-section">
        <h3>Correlation ids</h3>
        {workflow.correlation_ids.length > 0 ? (
          <ul className="token-list" aria-label="Workflow correlation ids">
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
          <ul className="token-list token-list--plain" aria-label="Workflow counterparties">
            {workflow.counterparty_agent_ids.map((value) => (
              <li key={value}>
                <WorkflowAgentButton
                  agentId={value}
                  isSelected={selectedAgentId === value}
                  onSelect={onSelectAgent}
                />
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
        listLabel="Workflow incidents"
        render={(incident) => (
          <IncidentRecord
            key={incident.incident_id}
            incident={incident}
            selectedAgentId={selectedAgentId}
            selectedCorrelationId={selectedCorrelationId}
            correlationButtonLabelPrefix="Inspect workflow incident correlation"
            onSelectAgent={onSelectAgent}
            onSelectCorrelation={onSelectCorrelation}
          />
        )}
      />
      <WorkflowList
        title="Interactions"
        empty={`No interactions in ${DEFAULT_WORKFLOW_WINDOW}.`}
        items={workflow.interactions}
        listLabel="Workflow interactions"
        render={(interaction) => (
          <InteractionRecord
            key={interaction.interaction_id}
            interaction={interaction}
            selectedAgentId={selectedAgentId}
            onSelectAgent={onSelectAgent}
          />
        )}
      />
      <WorkflowList
        title="Timeline"
        empty={`No timeline events in ${DEFAULT_WORKFLOW_WINDOW}.`}
        items={workflow.timeline}
        listLabel="Workflow timeline"
        render={(event) => <TimelineRecord key={event.event_id} event={event} />}
      />
    </aside>
  );
}

function IncidentFeedPanel({
  incidentFeed,
  incidentFeedError,
  incidentFeedState,
  selectedAgentId,
  selectedCorrelationId,
  onSelectAgent,
  onSelectCorrelation
}: {
  incidentFeed: IncidentFeedResponse | null;
  incidentFeedError: string | null;
  incidentFeedState: LoadState;
  selectedAgentId: string | null;
  selectedCorrelationId: string | null;
  onSelectAgent: (agentId: string) => void;
  onSelectCorrelation: (correlationId: string) => void;
}) {
  return (
    <section className="operations-panel" aria-label="Global incident feed">
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

      {incidentFeedState === 'loading' && !incidentFeed ? (
        <p role="status" aria-live="polite">
          Loading incident feed.
        </p>
      ) : null}

      {incidentFeedState === 'error' ? (
        <div role="alert">
          <p>Unable to load incident feed.</p>
          {incidentFeedError ? <p>{incidentFeedError}</p> : null}
        </div>
      ) : null}

      {incidentFeedState !== 'error' && incidentFeed ? (
        incidentFeed.items.length > 0 ? (
          <ul className="record-list" aria-label="Global incidents">
            {incidentFeed.items.map((incident) => (
              <IncidentRecord
                key={incident.incident_id}
                incident={incident}
                selectedAgentId={selectedAgentId}
                selectedCorrelationId={selectedCorrelationId}
                correlationButtonLabelPrefix="Inspect correlation"
                onSelectAgent={onSelectAgent}
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
  selectedAgentId,
  selectedCorrelationId,
  onSelectAgent
}: {
  correlation: CorrelationDrilldown | null;
  correlationError: string | null;
  correlationState: LoadState;
  selectedAgentId: string | null;
  selectedCorrelationId: string | null;
  onSelectAgent: (agentId: string) => void;
}) {
  if (!selectedCorrelationId) {
    return (
      <section className="operations-panel" aria-label="Correlation drilldown">
        <h2>Correlation drilldown</h2>
        <p>Select a correlation id from workflow or incident feed.</p>
      </section>
    );
  }

  if (correlationState === 'loading' && !correlation) {
    return (
      <section className="operations-panel" aria-label="Correlation drilldown">
        <h2>Correlation drilldown</h2>
        <p role="status" aria-live="polite">
          Loading correlation drilldown.
        </p>
      </section>
    );
  }

  if (correlationState === 'error') {
    return (
      <section className="operations-panel" aria-label="Correlation drilldown">
        <h2>Correlation drilldown</h2>
        <div role="alert">
          <p>Unable to load correlation.</p>
          {correlationError ? <p>{correlationError}</p> : null}
        </div>
      </section>
    );
  }

  if (!correlation) {
    return null;
  }

  return (
    <section className="operations-panel" aria-label="Correlation drilldown">
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
            <ul className="token-list token-list--plain" aria-label="Correlation participants">
              {correlation.participant_agent_ids.map((value) => (
                <li key={value}>
                  <WorkflowAgentButton
                    agentId={value}
                    isSelected={selectedAgentId === value}
                    onSelect={onSelectAgent}
                  />
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
            <ul className="token-list token-list--plain" aria-label="Correlation evidence refs">
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
        listLabel="Correlation incidents"
        render={(incident) => (
          <IncidentRecord
            key={incident.incident_id}
            incident={incident}
            selectedAgentId={selectedAgentId}
            selectedCorrelationId={selectedCorrelationId}
            onSelectAgent={onSelectAgent}
          />
        )}
      />
      <WorkflowList
        title="Interactions"
        empty={`No interactions in ${DEFAULT_WORKFLOW_WINDOW}.`}
        items={correlation.interactions}
        listLabel="Correlation interactions"
        render={(interaction) => (
          <InteractionRecord
            key={interaction.interaction_id}
            interaction={interaction}
            selectedAgentId={selectedAgentId}
            onSelectAgent={onSelectAgent}
          />
        )}
      />
      <WorkflowList
        title="Timeline"
        empty={`No timeline events in ${DEFAULT_WORKFLOW_WINDOW}.`}
        items={correlation.timeline}
        listLabel="Correlation timeline"
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

  const selectedAgentStillVisibleInOverview = useMemo(
    () =>
      selectedAgentId !== null &&
      (overviewResource.data?.agents.some((agent) => agent.agent_id === selectedAgentId) || false),
    [overviewResource.data, selectedAgentId]
  );

  const handleWorkflowError = (error: unknown) => {
    if (
      error instanceof RequestError &&
      error.code === 'not_found' &&
      !selectedAgentStillVisibleInOverview
    ) {
      setSelectedAgentId((currentAgentId) => (currentAgentId === null ? currentAgentId : null));
    }
  };

  const workflowResource = usePolledResource({
    enabled: selectedAgentId !== null,
    load: (signal) =>
      fetchAgentWorkflow(selectedAgentId!, {
        limit: DEFAULT_WORKFLOW_LIMIT,
        window: DEFAULT_WORKFLOW_WINDOW,
        signal
      }),
    onError: handleWorkflowError,
    resourceKey: selectedAgentId
  });
  const handleCorrelationError = (error: unknown) => {
    if (
      error instanceof RequestError &&
      error.code === 'not_found' &&
      !selectedCorrelationStillVisible
    ) {
      setSelectedCorrelationId((currentCorrelationId) =>
        currentCorrelationId === null ? currentCorrelationId : null
      );
    }
  };

  const correlationResource = usePolledResource({
    enabled: selectedCorrelationId !== null,
    load: (signal) =>
      fetchCorrelationDrilldown(selectedCorrelationId!, {
        limit: DEFAULT_WORKFLOW_LIMIT,
        window: DEFAULT_WORKFLOW_WINDOW,
        signal
      }),
    onError: handleCorrelationError,
    resourceKey: selectedCorrelationId
  });

  const selectedAgent = useMemo(
    () => overviewResource.data?.agents.find((agent) => agent.agent_id === selectedAgentId) || null,
    [overviewResource.data, selectedAgentId]
  );
  const selectedCorrelationVisibleFromWorkflow = useMemo(
    () =>
      selectedCorrelationId !== null && workflowShowsCorrelation(workflowResource.data, selectedCorrelationId),
    [selectedCorrelationId, workflowResource.data]
  );
  const selectedCorrelationVisibleFromIncidentFeed = useMemo(
    () =>
      selectedCorrelationId !== null &&
      incidentFeedShowsCorrelation(incidentFeedResource.data, selectedCorrelationId),
    [selectedCorrelationId, incidentFeedResource.data]
  );
  const selectedCorrelationStillVisible =
    selectedCorrelationVisibleFromWorkflow || selectedCorrelationVisibleFromIncidentFeed;

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
        <p role="status" aria-live="polite">
          Loading office overview.
        </p>
      </main>
    );
  }

  if (overviewResource.state === 'error') {
    return (
      <main className="app-shell">
        <h1>Operator Shell</h1>
        <div role="alert">
          <p>Unable to load office overview.</p>
          {overviewResource.error ? <p>{overviewResource.error}</p> : null}
        </div>
      </main>
    );
  }

  if (!overviewResource.data) {
    return null;
  }

  return (
    <ControlDeck
      generatedAt={overviewResource.data.generated_at}
      overviewRefreshNotice={
        <RefreshStatusNotice
          hasData={overviewResource.data !== null}
          label="Overview"
          error={overviewResource.error}
        />
      }
      summaryStrip={<SummaryStrip overview={overviewResource.data} />}
      officeGrid={
        <OfficeGrid
          overview={overviewResource.data}
          selectedAgentId={selectedAgentId}
          onSelectAgent={setSelectedAgentId}
        />
      }
      attentionQueuePanel={
        <AttentionQueuePanel
          agents={attentionQueue}
          selectedAgentId={selectedAgentId}
          onSelectAgent={setSelectedAgentId}
        />
      }
      workflowPanel={
        <WorkflowPanel
          selectedAgentId={selectedAgentId}
          selectedAgent={selectedAgent}
          selectedAgentStillVisibleInOverview={selectedAgentStillVisibleInOverview}
          selectedCorrelationId={selectedCorrelationId}
          workflowState={workflowResource.state}
          workflow={workflowResource.data}
          workflowError={workflowResource.error}
          onSelectAgent={setSelectedAgentId}
          onSelectCorrelation={setSelectedCorrelationId}
        />
      }
      incidentFeedPanel={
        <IncidentFeedPanel
          incidentFeed={incidentFeedResource.data}
          incidentFeedError={incidentFeedResource.error}
          incidentFeedState={incidentFeedResource.state}
          selectedAgentId={selectedAgentId}
          selectedCorrelationId={selectedCorrelationId}
          onSelectAgent={setSelectedAgentId}
          onSelectCorrelation={setSelectedCorrelationId}
        />
      }
      watchTopologyPanel={
        <WatchTopologyPanel
          topology={watchTopology}
          selectedAgentId={selectedAgentId}
          onSelectAgent={setSelectedAgentId}
        />
      }
      correlationPanel={
        <CorrelationPanel
          correlation={correlationResource.data}
          correlationError={correlationResource.error}
          correlationState={correlationResource.state}
          selectedAgentId={selectedAgentId}
          selectedCorrelationId={selectedCorrelationId}
          onSelectAgent={setSelectedAgentId}
        />
      }
      pollIntervalMs={POLL_INTERVAL_MS}
      workflowWindow={DEFAULT_WORKFLOW_WINDOW}
      workflowLimit={DEFAULT_WORKFLOW_LIMIT}
    />
  );
}
