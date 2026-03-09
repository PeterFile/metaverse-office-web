const { appendFile, mkdir, readFile } = require('node:fs/promises');
const path = require('node:path');

const {
  OFFICE_ZONES,
  SEED_AGENTS,
  deriveAgentOverviewSeverity,
  deriveLocationForEvent,
  deriveLocationForState,
  deriveStalenessSeverity,
  getAgentById,
  getWatchEdges,
  MEANINGFUL_OUTPUT_EVENT_TYPES,
  validateEventPayload
} = require('../domain');

const COLLECTOR_ALERT_SOURCE = 'controller_snapshot';
const SEVERITY_RANK = Object.freeze({
  normal: 0,
  yellow: 1,
  orange: 2,
  red: 3
});
const INTERACTION_EVENT_DESCRIPTORS = Object.freeze({
  agent_asked_question: Object.freeze({
    interaction_type: 'question_reply',
    phase: 'start'
  }),
  agent_replied: Object.freeze({
    interaction_type: 'question_reply',
    phase: 'end'
  }),
  review_started: Object.freeze({
    interaction_type: 'review',
    phase: 'start'
  }),
  review_completed: Object.freeze({
    interaction_type: 'review',
    phase: 'end'
  }),
  agent_handoff_started: Object.freeze({
    interaction_type: 'handoff',
    phase: 'start'
  }),
  agent_handoff_completed: Object.freeze({
    interaction_type: 'handoff',
    phase: 'end'
  }),
  peer_watch_alert_raised: Object.freeze({
    interaction_type: 'peer_watch',
    phase: 'start'
  }),
  peer_watch_alert_resolved: Object.freeze({
    interaction_type: 'peer_watch',
    phase: 'end'
  }),
  meeting_started: Object.freeze({
    interaction_type: 'meeting',
    phase: 'start'
  }),
  meeting_ended: Object.freeze({
    interaction_type: 'meeting',
    phase: 'end'
  })
});

class PrototypeStore {
  constructor({ filePath }) {
    this.filePath = filePath;
    this.records = [];
    this.events = [];
    this.heartbeats = [];
    this.latestCollectorReport = null;
  }

  async load() {
    await mkdir(path.dirname(this.filePath), { recursive: true });

    let content = '';
    try {
      content = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    this.records = [];
    this.events = [];
    this.heartbeats = [];
    this.latestCollectorReport = null;

    if (!content.trim()) {
      return;
    }

    for (const line of content.split('\n')) {
      if (!line.trim()) {
        continue;
      }

      const record = JSON.parse(line);
      this.records.push(record);

      if (record.kind === 'event') {
        this.events.push(record.payload);
        continue;
      }

      if (record.kind === 'heartbeat') {
        this.heartbeats.push(record.payload);
      }
    }
  }

  async appendEvent(event) {
    const record = { kind: 'event', payload: event };
    await appendFile(this.filePath, `${JSON.stringify(record)}\n`, 'utf8');
    this.records.push(record);
    this.events.push(event);
    return event;
  }

  async appendHeartbeat(heartbeat) {
    const record = { kind: 'heartbeat', payload: heartbeat };
    await appendFile(this.filePath, `${JSON.stringify(record)}\n`, 'utf8');
    this.records.push(record);
    this.heartbeats.push(heartbeat);
    return heartbeat;
  }

  async appendCollectorReport(report) {
    const previousAgentProjections = new Map(
      this.listAgents().map((agent) => [agent.agent_id, agent])
    );
    const collectorActivityEvents = createCollectorActivityEvents({
      report,
      previousAgentProjections
    });
    const collectorEvents = createCollectorSupervisionEvents({
      report,
      existingEvents: this.events
    });
    const items = [];

    for (const event of [...collectorActivityEvents, ...collectorEvents]) {
      await this.appendEvent(event);
    }

    for (const item of report.items || []) {
      const heartbeat = await this.appendHeartbeat(item.heartbeat);
      items.push({
        ...item,
        heartbeat
      });
    }

    this.latestCollectorReport = {
      ...report,
      summary: {
        ...(report.summary || {}),
        heartbeat_count: items.length
      },
      items
    };

    return this.latestCollectorReport;
  }

  getLatestCollectorReport() {
    return this.latestCollectorReport;
  }

  getCounts() {
    return {
      agent_count: SEED_AGENTS.length,
      event_count: this.events.length,
      heartbeat_count: this.heartbeats.length
    };
  }

  listAgents() {
    const projections = new Map(
      SEED_AGENTS.map((agent) => [agent.agent_id, createBaseProjection(agent)])
    );

    for (const record of this.records) {
      const snapshot = projections.get(record.payload.agent_id);
      if (!snapshot) {
        continue;
      }

      if (record.kind === 'event') {
        applyEvent(snapshot, record.payload);
        continue;
      }

      if (record.kind === 'heartbeat') {
        applyHeartbeat(snapshot, record.payload);
      }
    }

    return SEED_AGENTS.map((agent) => projections.get(agent.agent_id));
  }

  getAgent(agentId) {
    return this.listAgents().find((agent) => agent.agent_id === agentId) || null;
  }

  getAgentDetail(agentId, filters = {}) {
    const agent = this.getAgent(agentId);
    if (!agent) {
      return null;
    }

    const recentLimit = parseLimit(filters.limit || 5);

    return {
      ...agent,
      latest_heartbeat: this.getLatestHeartbeat(agentId),
      open_peer_watch_alerts: this.listOpenPeerWatchAlerts({
        target_agent_id: agentId,
        limit: recentLimit
      }),
      recent_events: this.listAgentEvents(agentId, {
        limit: recentLimit
      }),
      recent_interactions: this.listAgentInteractions(agentId, {
        limit: recentLimit,
        now: filters.now
      }),
      recent_handoffs: this.listHandoffs({
        agent_id: agentId,
        limit: recentLimit
      }),
      recent_reboots: this.listReboots({
        agent_id: agentId,
        limit: recentLimit
      })
    };
  }

  getLatestHeartbeat(agentId) {
    return this.heartbeats
      .filter((heartbeat) => heartbeat.agent_id === agentId)
      .slice()
      .sort((left, right) => getHeartbeatSortMs(right) - getHeartbeatSortMs(left))[0] || null;
  }

  listEvents(filters = {}) {
    const limit = parseLimit(filters.limit);

    return this.events
      .filter((event) => matchesEventFilters(event, filters))
      .slice()
      .sort((left, right) => Date.parse(right.ts) - Date.parse(left.ts))
      .slice(0, limit);
  }

  listAgentEvents(agentId, filters = {}) {
    return this.listEvents({ ...filters, agent_id: agentId });
  }

  listInteractions(filters = {}) {
    const limit = parseLimit(filters.limit);
    const durationMs = filters.window ? parseWindow(filters.window) : null;
    const nowMs = durationMs === null ? null : parseNowMs(filters.now);

    return deriveInteractions(this.events)
      .filter((interaction) => {
        if (
          filters.agent_id &&
          !interaction.participant_agent_ids.includes(filters.agent_id)
        ) {
          return false;
        }

        if (
          filters.counterparty_agent_id &&
          !interaction.participant_agent_ids.includes(filters.counterparty_agent_id)
        ) {
          return false;
        }

        if (
          filters.interaction_type &&
          interaction.interaction_type !== filters.interaction_type
        ) {
          return false;
        }

        if (filters.severity && interaction.severity !== filters.severity) {
          return false;
        }

        if (
          filters.correlation_id &&
          interaction.correlation_id !== filters.correlation_id
        ) {
          return false;
        }

        if (
          durationMs !== null &&
          nowMs !== null &&
          getInteractionSortMs(interaction) < nowMs - durationMs
        ) {
          return false;
        }

        return true;
      })
      .sort((left, right) => {
        const rightTs = getInteractionSortMs(right);
        const leftTs = getInteractionSortMs(left);

        if (rightTs !== leftTs) {
          return rightTs - leftTs;
        }

        return right.interaction_id.localeCompare(left.interaction_id);
      })
      .slice(0, limit);
  }

  listAgentInteractions(agentId, filters = {}) {
    return this.listInteractions({ ...filters, agent_id: agentId });
  }

  listTimeline(filters = {}) {
    const { window = '60m', now } = filters;
    const durationMs = parseWindow(window);
    const nowMs = parseNowMs(now);
    const limit =
      filters.limit === null || filters.limit === undefined || filters.limit === ''
        ? null
        : parseLimit(filters.limit);

    return this.events
      .filter((event) => {
        if (!matchesEventFilters(event, filters)) {
          return false;
        }

        if (durationMs !== null && nowMs !== null && Date.parse(event.ts) < nowMs - durationMs) {
          return false;
        }

        return true;
      })
      .slice()
      .sort((left, right) => Date.parse(left.ts) - Date.parse(right.ts))
      .slice(limit === null ? 0 : -limit)
      .map((event) => ({
        event_id: event.event_id,
        ts: event.ts,
        agent_id: event.agent_id,
        actor_id: event.actor_id,
        event_type: event.event_type,
        severity: event.severity,
        current_state: event.current_state,
        location: event.location,
        summary: event.summary,
        correlation_id: event.correlation_id,
        counterparty_agent_ids: event.counterparty_agent_ids,
        evidence_refs: event.evidence_refs,
        source_kind: event.source_kind
      }));
  }

  listPeerWatchAlerts(filters = {}) {
    if (filters.status === 'open') {
      return this.listOpenPeerWatchAlerts(filters);
    }

    const limit = parseOptionalLimit(filters.limit);

    return applyOptionalLimit(
      this.events
        .filter((event) => event.event_type.startsWith('peer_watch_alert_'))
        .map((event) => createPeerWatchAlertRecord(event))
        .filter((alert) => matchesPeerWatchAlertFilters(alert, filters))
        .slice()
        .sort((left, right) => Date.parse(right.ts) - Date.parse(left.ts)),
      limit
    );
  }

  listOpenPeerWatchAlerts(filters = {}) {
    const limit = parseOptionalLimit(filters.limit);

    return applyOptionalLimit(
      deriveOpenPeerWatchAlerts(this.events)
        .filter((alert) => matchesPeerWatchAlertFilters(alert, {
          ...filters,
          status: 'open'
        }))
        .slice()
        .sort((left, right) => Date.parse(right.ts) - Date.parse(left.ts)),
      limit
    );
  }

  listHandoffs(filters = {}) {
    const limit = parseOptionalLimit(filters.limit);

    return applyOptionalLimit(
      this.events
        .filter((event) => event.event_type.startsWith('agent_handoff_'))
        .filter((event) => {
          if (filters.agent_id && event.agent_id !== filters.agent_id) {
            return false;
          }

          if (
            filters.correlation_id &&
            event.correlation_id !== filters.correlation_id
          ) {
            return false;
          }

          return true;
        })
        .slice()
        .sort((left, right) => Date.parse(right.ts) - Date.parse(left.ts))
        .map((event) => ({
          handoff_id: event.event_id,
          ts: event.ts,
          agent_id: event.agent_id,
          actor_id: event.actor_id,
          phase: event.event_type.endsWith('_completed') ? 'completed' : 'started',
          status: event.event_type.endsWith('_completed') ? 'completed' : 'started',
          severity: event.severity,
          summary: event.summary,
          counterparty_agent_ids: event.counterparty_agent_ids,
          evidence_refs: event.evidence_refs,
          correlation_id: event.correlation_id,
          source_kind: event.source_kind
        })),
      limit
    );
  }

  listReboots(filters = {}) {
    const limit = parseOptionalLimit(filters.limit);

    return applyOptionalLimit(
      this.events
        .filter((event) => event.event_type.startsWith('agent_reboot_'))
        .filter((event) => {
          if (filters.agent_id && event.agent_id !== filters.agent_id) {
            return false;
          }

          if (filters.severity && event.severity !== filters.severity) {
            return false;
          }

          if (
            filters.correlation_id &&
            event.correlation_id !== filters.correlation_id
          ) {
            return false;
          }

          return true;
        })
        .slice()
        .sort((left, right) => Date.parse(right.ts) - Date.parse(left.ts))
        .map((event) => ({
          reboot_id: event.event_id,
          ts: event.ts,
          agent_id: event.agent_id,
          actor_id: event.actor_id,
          phase: event.event_type.endsWith('_completed') ? 'completed' : 'requested',
          status: event.event_type.endsWith('_completed') ? 'completed' : 'requested',
          severity: event.severity,
          summary: event.summary,
          counterparty_agent_ids: event.counterparty_agent_ids,
          evidence_refs: event.evidence_refs,
          correlation_id: event.correlation_id,
          source_kind: event.source_kind
        })),
      limit
    );
  }

  listIncidents(filters = {}) {
    const limit = parseOptionalLimit(filters.limit);
    const durationMs = filters.window ? parseWindow(filters.window) : null;
    const nowMs = durationMs === null ? null : parseNowMs(filters.now);
    const incidents = [];

    if (!filters.kind || filters.kind === 'peer_watch_alert') {
      incidents.push(
        ...this.listPeerWatchAlerts({
          agent_id: filters.agent_id,
          severity: filters.severity,
          status: filters.status,
          correlation_id: filters.correlation_id,
          limit: null
        }).map(createIncidentFromPeerWatchAlert)
      );
    }

    if (!filters.kind || filters.kind === 'handoff') {
      incidents.push(
        ...this.listHandoffs({
          agent_id: filters.agent_id,
          correlation_id: filters.correlation_id,
          limit: null
        }).map(createIncidentFromHandoff)
      );
    }

    if (!filters.kind || filters.kind === 'reboot') {
      incidents.push(
        ...this.listReboots({
          agent_id: filters.agent_id,
          severity: filters.severity,
          correlation_id: filters.correlation_id,
          limit: null
        }).map(createIncidentFromReboot)
      );
    }

    return applyOptionalLimit(
      incidents
        .filter((incident) => matchesIncidentFilters(incident, filters, { durationMs, nowMs }))
        .sort((left, right) => {
          const rightTs = getIncidentSortMs(right);
          const leftTs = getIncidentSortMs(left);

          if (rightTs !== leftTs) {
            return rightTs - leftTs;
          }

          return right.incident_id.localeCompare(left.incident_id);
        }),
      limit
    );
  }

  getOfficeOverview({ now }) {
    const generatedAt = now;
    const overviewAgents = this.listAgents().map((agent) => {
      const severityView = deriveAgentOverviewSeverity({
        now: generatedAt,
        reportedSeverity: agent.severity,
        lastMeaningfulOutputAt: agent.last_meaningful_output_at
      });

      return {
        ...agent,
        ...severityView
      };
    });

    const occupantsByZone = new Map(OFFICE_ZONES.map((zone) => [zone.zone_id, []]));
    const severityBuckets = {
      normal: 0,
      yellow: 0,
      orange: 0,
      red: 0
    };

    let blockedCount = 0;
    let rebootRecommendedCount = 0;

    for (const agent of overviewAgents) {
      severityBuckets[agent.effective_severity] += 1;

      if (agent.current_state === 'blocked') {
        blockedCount += 1;
      }

      if (agent.reboot_recommended) {
        rebootRecommendedCount += 1;
      }

      if (!occupantsByZone.has(agent.current_location)) {
        occupantsByZone.set(agent.current_location, []);
      }

      occupantsByZone.get(agent.current_location).push(createZoneOccupant(agent));
    }

    return {
      generated_at: generatedAt,
      summary: {
        agent_count: overviewAgents.length,
        blocked_count: blockedCount,
        reboot_recommended_count: rebootRecommendedCount,
        severity_buckets: severityBuckets
      },
      zones: OFFICE_ZONES.map((zone) => ({
        ...zone,
        occupants: occupantsByZone.get(zone.zone_id) || []
      })),
      watch_edges: getWatchEdges(),
      agents: overviewAgents
    };
  }
}

function createZoneOccupant(agent) {
  return {
    agent_id: agent.agent_id,
    display_name: agent.display_name,
    kind: agent.kind,
    current_state: agent.current_state,
    active_task: agent.active_task,
    effective_severity: agent.effective_severity
  };
}

function createBaseProjection(agent) {
  return {
    ...agent,
    current_location: deriveLocationForState(agent, agent.current_state),
    severity: 'normal',
    last_event_id: null,
    last_event_at: null,
    last_heartbeat_at: null,
    last_meaningful_output_at: null,
    last_file_write_at: null,
    current_blocker: '',
    confidence_level: null,
    reboot_recommended: false
  };
}

function applyEvent(snapshot, event) {
  snapshot.current_state = event.current_state;
  snapshot.active_task = event.active_task;
  snapshot.current_location = isCollectorDerivedPeerWatchEvent(event)
    ? deriveLocationForState(snapshot, event.current_state)
    : deriveLocationForEvent(snapshot, event.event_type, event.current_state);
  snapshot.last_event_id = event.event_id;
  snapshot.last_event_at = event.ts;
  snapshot.severity = shouldEventResetSeverity(event)
    ? 'normal'
    : mergeSeverity(snapshot.severity, event.severity);

  if (MEANINGFUL_OUTPUT_EVENT_TYPES.has(event.event_type) && shouldEventAdvanceMeaningfulOutput(event)) {
    snapshot.last_meaningful_output_at = event.ts;
  }

  if (event.event_type === 'agent_wrote_file') {
    snapshot.last_file_write_at = event.ts;
  }

  if (event.event_type === 'peer_watch_alert_raised' && event.current_state === 'blocked') {
    snapshot.current_blocker = getEventCurrentBlocker(event) || event.summary;
  }

  if (event.event_type === 'peer_watch_alert_resolved') {
    snapshot.current_blocker = '';
  }

  if (event.event_type === 'agent_reboot_requested') {
    snapshot.reboot_recommended = true;
  }

  if (event.event_type === 'agent_reboot_completed') {
    snapshot.reboot_recommended = false;
  }
}

function applyHeartbeat(snapshot, heartbeat) {
  snapshot.current_state = heartbeat.current_state;
  snapshot.active_task = heartbeat.active_task;
  snapshot.current_location =
    heartbeat.current_location || deriveLocationForState(snapshot, heartbeat.current_state);
  snapshot.last_heartbeat_at = heartbeat.received_at || null;
  snapshot.last_meaningful_output_at = heartbeat.last_meaningful_output_at;
  snapshot.last_file_write_at = heartbeat.last_file_write_at;
  snapshot.current_blocker = heartbeat.current_blocker;
  snapshot.confidence_level = heartbeat.confidence_level;
  snapshot.reboot_recommended = heartbeat.reboot_recommended;

  if (heartbeat.reboot_recommended) {
    snapshot.severity = mergeSeverity(snapshot.severity, 'orange');
  }
}

function createCollectorSupervisionEvents({ report, existingEvents }) {
  const events = [];
  const openAlerts = buildOpenCollectorAlertIndex(existingEvents);

  for (const item of report.items || []) {
    const previousEvent = openAlerts.get(item.agent_id) || null;
    const currentAlert = createCollectorAlertCandidate({ report, item });

    if (previousEvent && currentAlert) {
      const previousSignature = previousEvent.metadata.collector_alert_signature;
      const currentSignature = currentAlert.metadata.collector_alert_signature;

      if (previousSignature === currentSignature) {
        continue;
      }

      events.push(createCollectorResolutionEvent({ previousEvent, report, item }));
      const raisedEvent = createCollectorRaisedEvent({ report, item, alert: currentAlert });
      events.push(raisedEvent);
      openAlerts.set(item.agent_id, raisedEvent);
      continue;
    }

    if (previousEvent && !currentAlert) {
      events.push(createCollectorResolutionEvent({ previousEvent, report, item }));
      openAlerts.delete(item.agent_id);
      continue;
    }

    if (!previousEvent && currentAlert) {
      const raisedEvent = createCollectorRaisedEvent({ report, item, alert: currentAlert });
      events.push(raisedEvent);
      openAlerts.set(item.agent_id, raisedEvent);
    }
  }

  return events;
}

function createCollectorActivityEvents({ report, previousAgentProjections }) {
  const events = [];

  for (const item of report.items || []) {
    const previousProjection = previousAgentProjections.get(item.agent_id) || null;
    const fileWriteEvent = createCollectorFileWriteEvent({
      report,
      item,
      previousProjection
    });
    if (fileWriteEvent) {
      events.push(fileWriteEvent);
    }

    const stateChangedEvent = createCollectorStateChangedEvent({
      report,
      item,
      previousProjection
    });
    if (stateChangedEvent) {
      events.push(stateChangedEvent);
    }
  }

  return events;
}

function createCollectorStateChangedEvent({ report, item, previousProjection }) {
  const heartbeat = item.heartbeat || null;
  const agent = getAgentById(item.agent_id);

  if (!heartbeat || !agent || !heartbeat.current_state) {
    return null;
  }

  const previousState = previousProjection ? previousProjection.current_state : null;
  if (previousState === heartbeat.current_state) {
    return null;
  }

  const evidence = deriveCollectorStateEvidence(item);
  if (!evidence) {
    return null;
  }

  const derivedStaleness = deriveStalenessSeverity({
    now: report.collected_at,
    lastMeaningfulOutputAt: heartbeat.last_meaningful_output_at
  });

  return validateCollectorEvent(
    {
      event_id: createCollectorEventId({
        report,
        agentId: item.agent_id,
        family: 'state_change',
        phase: 'observed',
        severity: 'normal'
      }),
      ts: report.collected_at,
      agent_id: item.agent_id,
      agent_role: agent.role_slug,
      event_type: 'agent_state_changed',
      current_state: heartbeat.current_state,
      active_task: heartbeat.active_task,
      summary: previousState
        ? `Collector observed state change ${previousState} -> ${heartbeat.current_state}`
        : `Collector observed state ${heartbeat.current_state}`,
      severity: 'normal',
      correlation_id: createCollectorCorrelationId(report.collected_at),
      counterparty_agent_ids: [],
      evidence_refs: evidence.evidence_refs,
      source_kind: evidence.source_kind,
      metadata: {
        ...createCollectorMetadataBase({
          report,
          item,
          derivedStaleness
        }),
        collector_activity_family: 'state_change',
        previous_state: previousState,
        observed_state: heartbeat.current_state
      }
    },
    report.actor_id
  );
}

function createCollectorFileWriteEvent({ report, item, previousProjection }) {
  const heartbeat = item.heartbeat || null;
  const agent = getAgentById(item.agent_id);
  const observedAt = normalizeCollectorTimestamp(heartbeat && heartbeat.last_file_write_at);

  if (!heartbeat || !agent || !observedAt) {
    return null;
  }

  const previousFileWriteAt = normalizeCollectorTimestamp(
    previousProjection && previousProjection.last_file_write_at
  );
  if (
    previousFileWriteAt &&
    Date.parse(observedAt) <= Date.parse(previousFileWriteAt)
  ) {
    return null;
  }

  const evidence = deriveCollectorFileWriteEvidence(item, observedAt);
  if (!evidence) {
    return null;
  }

  const derivedStaleness = deriveStalenessSeverity({
    now: report.collected_at,
    lastMeaningfulOutputAt: heartbeat.last_meaningful_output_at
  });

  return validateCollectorEvent(
    {
      event_id: createCollectorEventId({
        report,
        agentId: item.agent_id,
        family: 'file_write',
        phase: 'observed',
        severity: 'normal'
      }),
      ts: observedAt,
      agent_id: item.agent_id,
      agent_role: agent.role_slug,
      event_type: 'agent_wrote_file',
      current_state: heartbeat.current_state,
      active_task: heartbeat.active_task,
      summary: `Collector observed workspace write to ${evidence.file_name}`,
      severity: 'normal',
      correlation_id: createCollectorCorrelationId(report.collected_at),
      counterparty_agent_ids: [],
      evidence_refs: evidence.evidence_refs,
      source_kind: 'workspace_file',
      metadata: {
        ...createCollectorMetadataBase({
          report,
          item,
          derivedStaleness
        }),
        collector_activity_family: 'file_write',
        previous_last_file_write_at: previousFileWriteAt,
        observed_file_path: evidence.file_path,
        observed_file_name: evidence.file_name,
        observed_last_file_write_at: observedAt
      }
    },
    report.actor_id
  );
}

function deriveCollectorStateEvidence(item) {
  const tmuxObservation = getLatestCollectorTmuxObservation(item);
  if (tmuxObservation) {
    return {
      source_kind: 'tmux_observation',
      evidence_refs: [
        `tmux://${tmuxObservation.session_name}/${tmuxObservation.window_index}.${tmuxObservation.pane_index}`
      ]
    };
  }

  const tmuxRef = normalizeEvidenceRefs(item.evidence_refs).find(isTmuxRef);
  if (tmuxRef) {
    return {
      source_kind: 'tmux_observation',
      evidence_refs: [tmuxRef]
    };
  }

  const workspaceObservation = getLatestCollectorWorkspaceFileObservation(item);
  if (workspaceObservation) {
    return {
      source_kind: 'workspace_file',
      evidence_refs: [workspaceObservation.path]
    };
  }

  const workspaceFileRef = normalizeEvidenceRefs(item.evidence_refs).find(isWorkspaceFileRef);
  if (workspaceFileRef) {
    return {
      source_kind: 'workspace_file',
      evidence_refs: [workspaceFileRef]
    };
  }

  return null;
}

function deriveCollectorFileWriteEvidence(item, observedAt) {
  const workspaceObservation = getLatestCollectorWorkspaceFileObservation(item, observedAt);
  if (workspaceObservation) {
    return {
      file_path: workspaceObservation.path,
      file_name: workspaceObservation.file_name,
      evidence_refs: [workspaceObservation.path]
    };
  }

  const workspaceFileRef = normalizeEvidenceRefs(item.evidence_refs).find(isWorkspaceFileRef);
  if (workspaceFileRef) {
    return {
      file_path: workspaceFileRef,
      file_name: path.basename(workspaceFileRef),
      evidence_refs: [workspaceFileRef]
    };
  }

  return null;
}

function getLatestCollectorTmuxObservation(item) {
  const observations = Array.isArray(item.tmux_observations) ? item.tmux_observations.slice() : [];
  if (observations.length === 0) {
    return null;
  }

  observations.sort(
    (left, right) =>
      Date.parse(right.pane_activity_at || 0) - Date.parse(left.pane_activity_at || 0)
  );
  return observations[0] || null;
}

function getLatestCollectorWorkspaceFileObservation(item, observedAt = null) {
  const observations = (Array.isArray(item.workspace_observations) ? item.workspace_observations : [])
    .filter((observation) => observation.kind === 'workspace_file')
    .slice()
    .sort(
      (left, right) =>
        Date.parse(right.last_modified_at || 0) - Date.parse(left.last_modified_at || 0)
    );

  if (observations.length === 0) {
    return null;
  }

  if (observedAt) {
    const exactMatch = observations.find((observation) => observation.last_modified_at === observedAt);
    if (exactMatch) {
      return exactMatch;
    }
  }

  return observations[0] || null;
}

function isTmuxRef(ref) {
  return typeof ref === 'string' && ref.startsWith('tmux://');
}

function isWorkspaceFileRef(ref) {
  return typeof ref === 'string' && !isTmuxRef(ref) && path.extname(ref).length > 0;
}

function normalizeCollectorTimestamp(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
}

function buildOpenCollectorAlertIndex(events) {
  const openAlerts = new Map();

  for (const event of events) {
    if (!isCollectorDerivedPeerWatchEvent(event)) {
      continue;
    }

    if (event.event_type === 'peer_watch_alert_raised') {
      openAlerts.set(event.agent_id, event);
      continue;
    }

    if (event.event_type === 'peer_watch_alert_resolved') {
      openAlerts.delete(event.agent_id);
    }
  }

  return openAlerts;
}

function createCollectorAlertCandidate({ report, item }) {
  const heartbeat = item.heartbeat || null;
  const agent = getAgentById(item.agent_id);

  if (!heartbeat || !agent) {
    return null;
  }

  const derivedStaleness = deriveStalenessSeverity({
    now: report.collected_at,
    lastMeaningfulOutputAt: heartbeat.last_meaningful_output_at
  });
  const metadataBase = createCollectorMetadataBase({
    report,
    item,
    derivedStaleness
  });

  if (heartbeat.current_state === 'blocked' || heartbeat.reboot_recommended) {
    return {
      agent_id: item.agent_id,
      agent_role: agent.role_slug,
      current_state: heartbeat.current_state,
      active_task: heartbeat.active_task,
      summary: createCollectorBlockedSummary({ heartbeat }),
      severity: 'orange',
      counterparty_agent_ids: deriveCollectorCounterpartyAgentIds({
        actorId: report.actor_id,
        item
      }),
      evidence_refs: normalizeEvidenceRefs(item.evidence_refs),
      metadata: {
        ...metadataBase,
        collector_alert_family: 'blocked',
        collector_alert_signature: createCollectorAlertSignature({
          family: 'blocked',
          severity: 'orange',
          heartbeat
        })
      }
    };
  }

  if (derivedStaleness.severity === 'yellow' || derivedStaleness.severity === 'orange') {
    return {
      agent_id: item.agent_id,
      agent_role: agent.role_slug,
      current_state: heartbeat.current_state,
      active_task: heartbeat.active_task,
      summary: createCollectorStalenessSummary({ derivedStaleness }),
      severity: derivedStaleness.severity,
      counterparty_agent_ids: deriveCollectorCounterpartyAgentIds({
        actorId: report.actor_id,
        item
      }),
      evidence_refs: normalizeEvidenceRefs(item.evidence_refs),
      metadata: {
        ...metadataBase,
        collector_alert_family: 'staleness',
        collector_alert_signature: createCollectorAlertSignature({
          family: 'staleness',
          severity: derivedStaleness.severity,
          heartbeat
        })
      }
    };
  }

  return null;
}

function createCollectorRaisedEvent({ report, item, alert }) {
  return validateCollectorEvent(
    {
      event_id: createCollectorEventId({
        report,
        agentId: item.agent_id,
        family: alert.metadata.collector_alert_family,
        phase: 'raised',
        severity: alert.severity
      }),
      ts: report.collected_at,
      agent_id: alert.agent_id,
      agent_role: alert.agent_role,
      event_type: 'peer_watch_alert_raised',
      current_state: alert.current_state,
      active_task: alert.active_task,
      summary: alert.summary,
      severity: alert.severity,
      correlation_id: createCollectorCorrelationId(report.collected_at),
      counterparty_agent_ids: alert.counterparty_agent_ids,
      evidence_refs: alert.evidence_refs,
      source_kind: 'controller_event',
      metadata: alert.metadata
    },
    report.actor_id
  );
}

function createCollectorResolutionEvent({ previousEvent, report, item }) {
  const heartbeat = item.heartbeat || {};
  const family = previousEvent.metadata.collector_alert_family;
  const derivedStaleness = deriveStalenessSeverity({
    now: report.collected_at,
    lastMeaningfulOutputAt: heartbeat.last_meaningful_output_at
  });

  return validateCollectorEvent(
    {
      event_id: createCollectorEventId({
        report,
        agentId: item.agent_id,
        family,
        phase: 'resolved',
        severity: previousEvent.severity
      }),
      ts: report.collected_at,
      agent_id: item.agent_id,
      agent_role: previousEvent.agent_role,
      event_type: 'peer_watch_alert_resolved',
      current_state: heartbeat.current_state,
      active_task: heartbeat.active_task,
      summary: createCollectorResolvedSummary({
        family,
        heartbeat
      }),
      severity: previousEvent.severity,
      correlation_id: createCollectorCorrelationId(report.collected_at),
      counterparty_agent_ids: deriveCollectorCounterpartyAgentIds({
        actorId: report.actor_id,
        item
      }),
      evidence_refs: normalizeEvidenceRefs(item.evidence_refs),
      source_kind: 'controller_event',
      metadata: {
        ...createCollectorMetadataBase({
          report,
          item,
          derivedStaleness
        }),
        collector_alert_family: family,
        collector_alert_signature: createCollectorResolutionSignature({
          family,
          previousEvent,
          heartbeat
        }),
        resolution_reason: 'snapshot_condition_cleared',
        resolved_alert_event_id: previousEvent.event_id,
        resolved_alert_signature: previousEvent.metadata.collector_alert_signature
      }
    },
    report.actor_id
  );
}

function createCollectorMetadataBase({ report, item, derivedStaleness }) {
  const heartbeat = item.heartbeat || {};
  const supervision = item.supervision || {};

  return {
    collector_derived: true,
    collector_source: COLLECTOR_ALERT_SOURCE,
    collected_at: report.collected_at,
    watch_target: supervision.watch_target || null,
    watched_by: Array.isArray(supervision.watched_by) ? supervision.watched_by.slice() : [],
    current_blocker: heartbeat.current_blocker || '',
    reboot_recommended: Boolean(heartbeat.reboot_recommended),
    confidence_level: heartbeat.confidence_level || null,
    last_meaningful_output_at: heartbeat.last_meaningful_output_at || null,
    last_file_write_at: heartbeat.last_file_write_at || null,
    derived_staleness: derivedStaleness
  };
}

function deriveCollectorCounterpartyAgentIds({ actorId, item }) {
  const watchedBy =
    item.supervision && Array.isArray(item.supervision.watched_by) ? item.supervision.watched_by : [];

  return Array.from(
    new Set(
      watchedBy.filter(
        (agentId) =>
          typeof agentId === 'string' &&
          agentId.length > 0 &&
          agentId !== actorId &&
          agentId !== item.agent_id
      )
    )
  );
}

function normalizeEvidenceRefs(evidenceRefs) {
  if (!Array.isArray(evidenceRefs)) {
    return [];
  }

  return Array.from(new Set(evidenceRefs.filter((ref) => typeof ref === 'string' && ref.length > 0)));
}

function createCollectorBlockedSummary({ heartbeat }) {
  if (heartbeat.current_blocker) {
    return `Collector observed blocked execution: ${heartbeat.current_blocker}`;
  }

  if (heartbeat.reboot_recommended) {
    return 'Collector recommends reboot based on current supervision evidence';
  }

  return 'Collector observed a supervision alert';
}

function createCollectorStalenessSummary({ derivedStaleness }) {
  return `Collector observed ${derivedStaleness.severity} staleness since ${derivedStaleness.last_meaningful_output_at}`;
}

function createCollectorResolvedSummary({ family, heartbeat }) {
  if (family === 'staleness' && heartbeat.last_meaningful_output_at) {
    return `Collector cleared staleness after meaningful output at ${heartbeat.last_meaningful_output_at}`;
  }

  if (family === 'blocked' && !heartbeat.current_blocker) {
    return 'Collector cleared blocked execution after new snapshot evidence';
  }

  return 'Collector cleared the previous supervision alert';
}

function createCollectorAlertSignature({ family, severity, heartbeat }) {
  return [
    family,
    severity,
    heartbeat.current_state || '',
    heartbeat.last_meaningful_output_at || '',
    heartbeat.current_blocker || '',
    heartbeat.reboot_recommended ? '1' : '0'
  ].join('|');
}

function createCollectorResolutionSignature({ family, previousEvent, heartbeat }) {
  return [
    'resolved',
    family,
    previousEvent.metadata.collector_alert_signature,
    heartbeat.current_state || '',
    heartbeat.last_meaningful_output_at || '',
    heartbeat.current_blocker || '',
    heartbeat.reboot_recommended ? '1' : '0'
  ].join('|');
}

function createCollectorCorrelationId(collectedAt) {
  return `collector-snapshot:${collectedAt}`;
}

function createCollectorEventId({ report, agentId, family, phase, severity }) {
  return [
    'evt',
    'collector',
    sanitizeEventIdPart(agentId),
    sanitizeEventIdPart(family),
    sanitizeEventIdPart(phase),
    sanitizeEventIdPart(severity),
    sanitizeEventIdPart(report.collected_at)
  ].join('_');
}

function sanitizeEventIdPart(value) {
  return `${value}`.replace(/[^a-zA-Z0-9_-]+/g, '_');
}

function validateCollectorEvent(event, actorId) {
  const validation = validateEventPayload(event, { actorId });
  if (validation.ok) {
    return validation.value;
  }

  const error = new Error(
    `collector supervision event validation failed: ${validation.errors.join('; ')}`
  );
  error.details = validation.errors;
  throw error;
}

function isCollectorDerivedPeerWatchEvent(event) {
  return (
    event &&
    event.event_type &&
    event.event_type.startsWith('peer_watch_alert_') &&
    event.metadata &&
    event.metadata.collector_derived === true
  );
}

function shouldEventAdvanceMeaningfulOutput(event) {
  return !isCollectorDerivedPeerWatchEvent(event);
}

function shouldEventResetSeverity(event) {
  return (
    event.event_type === 'peer_watch_alert_resolved' ||
    event.event_type === 'agent_reboot_completed'
  );
}

function deriveInteractions(events) {
  const orderedEvents = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => getInteractionDescriptor(event))
    .sort((left, right) => {
      const leftTs = Date.parse(left.event.ts);
      const rightTs = Date.parse(right.event.ts);

      if (leftTs !== rightTs) {
        return leftTs - rightTs;
      }

      return left.index - right.index;
    });
  const interactions = [];
  const openPairs = new Map();

  for (const { event } of orderedEvents) {
    const descriptor = getInteractionDescriptor(event);
    const pairKey = createInteractionPairKey(event, descriptor);

    if (descriptor.phase === 'start') {
      if (!pairKey) {
        interactions.push(createInteractionRecord({ startEvent: event, endEvent: null }));
        continue;
      }

      if (!openPairs.has(pairKey)) {
        openPairs.set(pairKey, []);
      }

      openPairs.get(pairKey).push(event);
      continue;
    }

    const openStarts = pairKey ? openPairs.get(pairKey) : null;
    if (openStarts && openStarts.length > 0) {
      const startEvent = openStarts.shift();
      if (openStarts.length === 0) {
        openPairs.delete(pairKey);
      }

      interactions.push(createInteractionRecord({ startEvent, endEvent: event }));
      continue;
    }

    interactions.push(createInteractionRecord({ startEvent: null, endEvent: event }));
  }

  for (const openStarts of openPairs.values()) {
    for (const startEvent of openStarts) {
      interactions.push(createInteractionRecord({ startEvent, endEvent: null }));
    }
  }

  return interactions;
}

function deriveOpenPeerWatchAlerts(events) {
  const openAlertsByEventId = new Map();
  const openKeysByEventId = new Map();

  const orderedEvents = events
    .filter((event) => event.event_type.startsWith('peer_watch_alert_'))
    .slice()
    .sort((left, right) => Date.parse(left.ts) - Date.parse(right.ts));

  for (const event of orderedEvents) {
    if (event.event_type === 'peer_watch_alert_raised') {
      const alert = createPeerWatchAlertRecord(event);
      const key = createPeerWatchAlertKey(event);
      openAlertsByEventId.set(event.event_id, alert);
      openKeysByEventId.set(event.event_id, key);
      continue;
    }

    const resolvedAlertEventId =
      event.metadata && typeof event.metadata.resolved_alert_event_id === 'string'
        ? event.metadata.resolved_alert_event_id
        : null;

    if (resolvedAlertEventId && openAlertsByEventId.has(resolvedAlertEventId)) {
      openAlertsByEventId.delete(resolvedAlertEventId);
      openKeysByEventId.delete(resolvedAlertEventId);
      continue;
    }

    const resolvedKey = createPeerWatchAlertKey(event);
    for (const [eventId, key] of openKeysByEventId.entries()) {
      if (key === resolvedKey) {
        openKeysByEventId.delete(eventId);
        openAlertsByEventId.delete(eventId);
      }
    }
  }

  return Array.from(openAlertsByEventId.values());
}

function getInteractionDescriptor(event) {
  return INTERACTION_EVENT_DESCRIPTORS[event.event_type] || null;
}

function createInteractionPairKey(event, descriptor) {
  if (
    !descriptor ||
    typeof event.correlation_id !== 'string' ||
    event.correlation_id.trim().length === 0
  ) {
    return null;
  }

  const participants = getInteractionParticipantAgentIds(event);
  if (participants.length === 0) {
    return null;
  }

  return [
    descriptor.interaction_type,
    event.correlation_id,
    participants.join('|')
  ].join('::');
}

function getInteractionParticipantAgentIds(event) {
  return Array.from(
    new Set(
      [event.agent_id, event.actor_id, ...(event.counterparty_agent_ids || [])]
        .filter((agentId) => typeof agentId === 'string' && agentId.length > 0)
        .sort()
    )
  );
}

function createInteractionRecord({ startEvent, endEvent }) {
  const sourceEvent = startEvent || endEvent;
  const sourceDescriptor = getInteractionDescriptor(sourceEvent);
  const relatedEvents = [startEvent, endEvent].filter(Boolean);
  const severity = relatedEvents.reduce(
    (currentSeverity, event) => mergeSeverity(currentSeverity, event.severity),
    'normal'
  );
  const participants = Array.from(
    new Set(
      relatedEvents
        .flatMap((event) => getInteractionParticipantAgentIds(event))
        .sort()
    )
  );

  return {
    interaction_id: `interaction:${sourceEvent.event_id}`,
    interaction_type: sourceDescriptor.interaction_type,
    correlation_id: sourceEvent.correlation_id,
    started_at: startEvent ? startEvent.ts : endEvent.ts,
    ended_at: endEvent ? endEvent.ts : null,
    participant_agent_ids: participants,
    trigger_event_id: sourceEvent.event_id,
    before_state: startEvent ? startEvent.current_state : null,
    after_state: endEvent ? endEvent.current_state : null,
    severity,
    evidence_refs: normalizeEvidenceRefs(relatedEvents.flatMap((event) => event.evidence_refs)),
    summary:
      (endEvent && endEvent.summary) ||
      (startEvent && startEvent.summary) ||
      sourceEvent.summary,
    related_event_ids: relatedEvents.map((event) => event.event_id)
  };
}

function getInteractionSortMs(interaction) {
  return Date.parse(interaction.ended_at || interaction.started_at);
}

function getHeartbeatSortMs(heartbeat) {
  return Date.parse(heartbeat.received_at || 0);
}

function mergeSeverity(currentSeverity, nextSeverity) {
  const currentRank = SEVERITY_RANK[currentSeverity] || 0;
  const nextRank = SEVERITY_RANK[nextSeverity] || 0;
  return nextRank >= currentRank ? nextSeverity : currentSeverity;
}

function getEventCurrentBlocker(event) {
  if (!event.metadata || typeof event.metadata.current_blocker !== 'string') {
    return '';
  }

  return event.metadata.current_blocker;
}

function createPeerWatchAlertRecord(event) {
  const evidenceRefs = normalizeEvidenceRefs(event.evidence_refs);
  const watcherAgentIds = Array.from(
    new Set(
      (event.counterparty_agent_ids || []).filter(
        (agentId) => typeof agentId === 'string' && agentId.length > 0
      )
    )
  );

  return {
    alert_id: event.event_id,
    ts: event.ts,
    agent_id: event.agent_id,
    target_agent_id: event.agent_id,
    actor_id: event.actor_id,
    observer_agent_id: event.actor_id,
    watcher_agent_ids: watcherAgentIds,
    severity: event.severity,
    status: event.event_type.endsWith('_resolved') ? 'resolved' : 'open',
    current_state: event.current_state,
    active_task: event.active_task,
    summary: event.summary,
    evidence_refs: evidenceRefs,
    evidence_count: evidenceRefs.length,
    correlation_id: event.correlation_id,
    source_kind: event.source_kind,
    metadata: event.metadata || {}
  };
}

function createIncidentFromPeerWatchAlert(alert) {
  return {
    incident_id: alert.alert_id,
    kind: 'peer_watch_alert',
    ts: alert.ts,
    agent_id: alert.target_agent_id,
    actor_id: alert.observer_agent_id,
    status: alert.status,
    severity: alert.severity,
    summary: alert.summary,
    correlation_id: alert.correlation_id,
    evidence_refs: normalizeEvidenceRefs(alert.evidence_refs),
    counterparty_agent_ids: Array.isArray(alert.watcher_agent_ids)
      ? alert.watcher_agent_ids.slice()
      : [],
    source_kind: alert.source_kind
  };
}

function createIncidentFromHandoff(handoff) {
  return {
    incident_id: handoff.handoff_id,
    kind: 'handoff',
    ts: handoff.ts,
    agent_id: handoff.agent_id,
    actor_id: handoff.actor_id,
    status: handoff.status || handoff.phase,
    severity: handoff.severity,
    summary: handoff.summary,
    correlation_id: handoff.correlation_id,
    evidence_refs: normalizeEvidenceRefs(handoff.evidence_refs),
    counterparty_agent_ids: Array.isArray(handoff.counterparty_agent_ids)
      ? handoff.counterparty_agent_ids.slice()
      : [],
    source_kind: handoff.source_kind
  };
}

function createIncidentFromReboot(reboot) {
  return {
    incident_id: reboot.reboot_id,
    kind: 'reboot',
    ts: reboot.ts,
    agent_id: reboot.agent_id,
    actor_id: reboot.actor_id,
    status: reboot.status || reboot.phase,
    severity: reboot.severity,
    summary: reboot.summary,
    correlation_id: reboot.correlation_id,
    evidence_refs: normalizeEvidenceRefs(reboot.evidence_refs),
    counterparty_agent_ids: Array.isArray(reboot.counterparty_agent_ids)
      ? reboot.counterparty_agent_ids.slice()
      : [],
    source_kind: reboot.source_kind
  };
}

function matchesPeerWatchAlertFilters(alert, filters = {}) {
  const targetAgentId = filters.target_agent_id || filters.agent_id;

  if (filters.severity && alert.severity !== filters.severity) {
    return false;
  }

  if (filters.status && alert.status !== filters.status) {
    return false;
  }

  if (targetAgentId && alert.target_agent_id !== targetAgentId) {
    return false;
  }

  if (
    filters.watcher_agent_id &&
    !alert.watcher_agent_ids.includes(filters.watcher_agent_id)
  ) {
    return false;
  }

  if (
    filters.observer_agent_id &&
    alert.observer_agent_id !== filters.observer_agent_id
  ) {
    return false;
  }

  if (
    filters.correlation_id &&
    alert.correlation_id !== filters.correlation_id
  ) {
    return false;
  }

  return true;
}

function matchesIncidentFilters(incident, filters = {}, { durationMs = null, nowMs = null } = {}) {
  if (filters.kind && incident.kind !== filters.kind) {
    return false;
  }

  if (filters.agent_id && incident.agent_id !== filters.agent_id) {
    return false;
  }

  if (filters.severity && incident.severity !== filters.severity) {
    return false;
  }

  if (filters.status && incident.status !== filters.status) {
    return false;
  }

  if (filters.correlation_id && incident.correlation_id !== filters.correlation_id) {
    return false;
  }

  if (
    durationMs !== null &&
    nowMs !== null &&
    getIncidentSortMs(incident) < nowMs - durationMs
  ) {
    return false;
  }

  return true;
}

function createPeerWatchAlertKey(event) {
  return [
    event.agent_id,
    event.actor_id,
    event.correlation_id,
    normalizeEvidenceRefs(event.counterparty_agent_ids).sort().join('|')
  ].join('::');
}

function matchesEventFilters(event, filters = {}) {
  if (filters.agent_id && event.agent_id !== filters.agent_id) {
    return false;
  }

  if (filters.event_type && event.event_type !== filters.event_type) {
    return false;
  }

  if (filters.severity && event.severity !== filters.severity) {
    return false;
  }

  if (filters.correlation_id && event.correlation_id !== filters.correlation_id) {
    return false;
  }

  return true;
}

function getIncidentSortMs(incident) {
  return Date.parse(incident.ts || 0);
}

function parseLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }

  return Math.min(parsed, 200);
}

function parseOptionalLimit(value) {
  return value === null ? null : parseLimit(value);
}

function applyOptionalLimit(items, limit) {
  return limit === null ? items : items.slice(0, limit);
}

function parseWindow(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return 60 * 60 * 1000;
  }

  const match = value.match(/^(\d+)([mh])$/);
  if (!match) {
    return 60 * 60 * 1000;
  }

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2];
  return unit === 'h' ? amount * 60 * 60 * 1000 : amount * 60 * 1000;
}

function parseNowMs(value) {
  const parsed = typeof value === 'string' ? Date.parse(value) : Date.now();
  return Number.isFinite(parsed) ? parsed : null;
}

async function createPrototypeStore({ filePath }) {
  const store = new PrototypeStore({ filePath });
  await store.load();
  return store;
}

module.exports = {
  PrototypeStore,
  createPrototypeStore,
  parseWindow,
  parseLimit
};
