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
const { createSharedArtifactRollup } = require('../collectors/controller-snapshot');

const COLLECTOR_ALERT_SOURCE = 'controller_snapshot';
const SEVERITY_RANK = Object.freeze({
  normal: 0,
  yellow: 1,
  orange: 2,
  red: 3
});
const ACTIVE_INCIDENT_STATUSES_BY_KIND = Object.freeze({
  peer_watch_alert: Object.freeze(['open']),
  handoff: Object.freeze(['waiting', 'started']),
  reboot: Object.freeze(['waiting', 'started', 'requested'])
});
const LIFECYCLE_INCIDENT_KINDS = new Set(['handoff', 'reboot']);
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
    const normalizedReport = normalizeCollectorReport(report, this.latestCollectorReport);
    const previousAgentProjections = new Map(
      this.listAgents().map((agent) => [agent.agent_id, agent])
    );
    const collectorActivityEvents = createCollectorActivityEvents({
      report: normalizedReport,
      previousAgentProjections
    });
    const collectorEvents = createCollectorSupervisionEvents({
      report: normalizedReport,
      existingEvents: this.events
    });
    const items = [];

    for (const event of [...collectorActivityEvents, ...collectorEvents]) {
      await this.appendEvent(event);
    }

    for (const item of normalizedReport.items || []) {
      const heartbeat = await this.appendHeartbeat(item.heartbeat);
      items.push({
        ...item,
        heartbeat
      });
    }

    this.latestCollectorReport = {
      ...normalizedReport,
      summary: {
        ...(normalizedReport.summary || {}),
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
      recent_incidents: this.listIncidents({
        agent_id: agentId,
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

  getAgentWorkflow(agentId, filters = {}) {
    const limit = filters.limit === undefined ? null : filters.limit;
    const window = filters.window || '60m';
    const detail = this.getAgentDetail(agentId, {
      limit,
      now: filters.now
    });

    if (!detail) {
      return null;
    }

    const incidents = this.listIncidents({
      agent_id: agentId,
      window,
      limit,
      now: filters.now
    });
    const interactions = this.listAgentInteractions(agentId, {
      window,
      limit,
      now: filters.now
    });
    const timeline = this.listTimeline({
      agent_id: agentId,
      window,
      limit,
      now: filters.now
    });
    const summary = createWorkflowSummary({
      incidents,
      interactions,
      timeline
    });

    return {
      agent_id: agentId,
      detail,
      summary,
      correlation_ids: normalizeStringValues([
        ...incidents.map((incident) => incident.correlation_id),
        ...interactions.map((interaction) => interaction.correlation_id),
        ...timeline.map((event) => event.correlation_id)
      ]),
      counterparty_agent_ids: getWorkflowCounterpartyAgentIds({
        agentId,
        incidents,
        interactions,
        timeline
      }),
      incidents,
      interactions,
      timeline
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
    return listInteractionItems(this.events, filters);
  }

  listAgentInteractions(agentId, filters = {}) {
    return this.listInteractions({ ...filters, agent_id: agentId });
  }

  listTimeline(filters = {}) {
    return listTimelineItems(this.events, filters);
  }

  listMemoryArtifacts(filters = {}) {
    return listMemoryArtifactItems({
      events: this.events,
      latestCollectorReport: this.latestCollectorReport,
      filters
    });
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
    const nowMs = filters.status === 'open' || durationMs !== null ? parseNowMs(filters.now) : null;
    const incidents = [];

    if (!filters.kind || filters.kind === 'peer_watch_alert') {
      const peerWatchAlerts = filters.status === 'open'
        ? this.listOpenPeerWatchAlerts({
          agent_id: filters.agent_id,
          severity: filters.severity,
          correlation_id: filters.correlation_id,
          limit: null
        })
        : this.listPeerWatchAlerts({
          agent_id: filters.agent_id,
          severity: filters.severity,
          status: filters.status,
          correlation_id: filters.correlation_id,
          limit: null
        });

      incidents.push(...peerWatchAlerts.map(createIncidentFromPeerWatchAlert));
    }

    if (!filters.kind || filters.kind === 'handoff') {
      incidents.push(
        ...this.listHandoffs({
          agent_id: filters.agent_id,
          correlation_id: filters.status === 'open' ? null : filters.correlation_id,
          limit: null
        }).map(createIncidentFromHandoff)
      );
    }

    if (!filters.kind || filters.kind === 'reboot') {
      incidents.push(
        ...this.listReboots({
          agent_id: filters.agent_id,
          severity: filters.status === 'open' ? null : filters.severity,
          correlation_id: filters.status === 'open' ? null : filters.correlation_id,
          limit: null
        }).map(createIncidentFromReboot)
      );
    }

    const openLifecycleCandidates = filters.status === 'open'
      ? incidents.filter((incident) => matchesIncidentOpenLifecycleWindow(incident, { nowMs }))
      : incidents;
    const incidentCandidates = filters.status === 'open'
      ? selectOpenIncidentLifecycleItems(openLifecycleCandidates)
      : incidents;

    return applyOptionalLimit(
      incidentCandidates
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

  getCorrelationDrilldown(correlationId, filters = {}) {
    const baseFilters = {
      correlation_id: correlationId,
      window: filters.window,
      now: filters.now
    };
    const allIncidents = this.listIncidents({ ...baseFilters, limit: null });
    const openIncidents = this.listIncidents({ ...baseFilters, status: 'open', limit: null });
    const allInteractions = listInteractionItems(this.events, baseFilters, null);
    const allTimeline = listTimelineItems(this.events, { ...baseFilters, limit: null });

    if (
      allIncidents.length === 0 &&
      allInteractions.length === 0 &&
      allTimeline.length === 0
    ) {
      return null;
    }

    const limit =
      filters.limit === null || filters.limit === undefined || filters.limit === ''
        ? null
        : filters.limit;
    const interactionLimit = limit === null ? null : parseLimit(limit);
    const closureLedger = createCorrelationClosureLedger({
      incidents: allIncidents,
      openIncidents,
      interactions: allInteractions,
      limit: interactionLimit
    });
    const timestamps = collectCorrelationTimestamps({
      incidents: allIncidents,
      interactions: allInteractions,
      timeline: allTimeline
    });

    return {
      correlation_id: correlationId,
      participant_agent_ids: normalizeAgentIds([
        ...allIncidents.flatMap(getIncidentParticipantAgentIds),
        ...allInteractions.flatMap((interaction) => interaction.participant_agent_ids || []),
        ...allTimeline.flatMap(getTimelineParticipantAgentIds)
      ]),
      evidence_refs: normalizeEvidenceRefs(
        [
          ...allIncidents.flatMap((incident) => incident.evidence_refs || []),
          ...allInteractions.flatMap((interaction) => interaction.evidence_refs || []),
          ...allTimeline.flatMap((event) => event.evidence_refs || [])
        ].sort()
      ),
      first_ts: timestamps[0] || null,
      last_ts: timestamps[timestamps.length - 1] || null,
      incident_count: allIncidents.length,
      interaction_count: allInteractions.length,
      event_count: allTimeline.length,
      closure_ledger: closureLedger,
      incidents: this.listIncidents({ ...baseFilters, limit }),
      interactions: listInteractionItems(this.events, baseFilters, interactionLimit),
      timeline: listTimelineItems(this.events, { ...baseFilters, limit })
    };
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

  getOfficeOperations(filters = {}) {
    const generatedAt = filters.now;
    const latestEventsByAgentId = buildLatestEventsByAgentId(this.events);
    const limit =
      filters.limit === null || filters.limit === undefined || filters.limit === ''
        ? null
        : parseLimit(filters.limit);

    const items = applyOptionalLimit(
      this.listAgents()
        .filter((agent) => matchesOfficeOperationAgentId(agent, filters.agent_id))
        .filter((agent) => matchesOfficeOperationState(agent, filters.state))
        .map((agent) => createOfficeOperationItem({
          agent,
          latestEvent: latestEventsByAgentId.get(agent.agent_id) || null,
          now: generatedAt
        }))
        .filter((item) => matchesOfficeOperationSeverity(item, filters.severity))
        .sort(compareOfficeOperations),
      limit
    );

    return {
      generated_at: generatedAt,
      summary: createOfficeOperationsSummary(items),
      items
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

function createOfficeOperationItem({ agent, latestEvent, now }) {
  const severityView = deriveAgentOverviewSeverity({
    now,
    reportedSeverity: agent.severity,
    lastMeaningfulOutputAt: agent.last_meaningful_output_at
  });

  return {
    agent_id: agent.agent_id,
    display_name: agent.display_name,
    kind: agent.kind,
    current_state: agent.current_state,
    active_task: agent.active_task,
    current_blocker: agent.current_blocker,
    current_location: agent.current_location,
    reported_severity: severityView.reported_severity,
    effective_severity: severityView.effective_severity,
    derived_staleness: severityView.derived_staleness,
    reboot_recommended: agent.reboot_recommended,
    last_event_at: agent.last_event_at,
    last_heartbeat_at: agent.last_heartbeat_at,
    last_meaningful_output_at: agent.last_meaningful_output_at,
    correlation_id: latestEvent ? latestEvent.correlation_id : null,
    latest_event: latestEvent
      ? {
          event_id: latestEvent.event_id,
          actor_id: latestEvent.actor_id,
          event_type: latestEvent.event_type,
          ts: latestEvent.ts,
          summary: latestEvent.summary,
          source_kind: latestEvent.source_kind,
          evidence_refs: latestEvent.evidence_refs,
          counterparty_agent_ids: latestEvent.counterparty_agent_ids
        }
      : null
  };
}

function matchesOfficeOperationState(agent, state) {
  if (typeof state === 'string' && state.length > 0) {
    return agent.current_state === state;
  }

  return agent.current_state !== 'idle' && agent.current_state !== 'sleeping';
}

function matchesOfficeOperationAgentId(agent, agentId) {
  if (typeof agentId === 'string' && agentId.length > 0) {
    return agent.agent_id === agentId;
  }

  return true;
}

function matchesOfficeOperationSeverity(item, severity) {
  if (typeof severity === 'string' && severity.length > 0) {
    return item.effective_severity === severity;
  }

  return true;
}

function buildLatestEventsByAgentId(events) {
  const latestEventsByAgentId = new Map();

  for (const event of events) {
    const previous = latestEventsByAgentId.get(event.agent_id) || null;
    if (!previous || compareEventsByTsDesc(event, previous) < 0) {
      latestEventsByAgentId.set(event.agent_id, event);
    }
  }

  return latestEventsByAgentId;
}

function createOfficeOperationsSummary(items) {
  const severityBuckets = {
    normal: 0,
    yellow: 0,
    orange: 0,
    red: 0
  };
  const stateBuckets = {};

  let blockedCount = 0;
  let rebootRecommendedCount = 0;

  for (const item of items) {
    severityBuckets[item.effective_severity] += 1;
    stateBuckets[item.current_state] = (stateBuckets[item.current_state] || 0) + 1;

    if (item.current_state === 'blocked') {
      blockedCount += 1;
    }

    if (item.reboot_recommended) {
      rebootRecommendedCount += 1;
    }
  }

  return {
    item_count: items.length,
    blocked_count: blockedCount,
    reboot_recommended_count: rebootRecommendedCount,
    state_buckets: stateBuckets,
    severity_buckets: severityBuckets
  };
}

function createWorkflowSummary({ incidents = [], interactions = [], timeline = [] }) {
  const severityBuckets = createSeverityBuckets();
  const incidentKindBuckets = {};
  const interactionTypeBuckets = {};
  const eventTypeBuckets = {};
  let latestActivityAt = null;

  for (const incident of incidents) {
    incrementBucket(incidentKindBuckets, incident.kind);
    incrementSeverityBucket(severityBuckets, incident.severity);
    latestActivityAt = getLatestIsoValue(latestActivityAt, incident.ts);
  }

  for (const interaction of interactions) {
    incrementBucket(interactionTypeBuckets, interaction.interaction_type);
    incrementSeverityBucket(severityBuckets, interaction.severity);
    latestActivityAt = getLatestIsoValue(
      latestActivityAt,
      interaction.ended_at || interaction.started_at
    );
  }

  for (const event of timeline) {
    incrementBucket(eventTypeBuckets, event.event_type);
    incrementSeverityBucket(severityBuckets, event.severity);
    latestActivityAt = getLatestIsoValue(latestActivityAt, event.ts);
  }

  return {
    incident_count: incidents.length,
    interaction_count: interactions.length,
    event_count: timeline.length,
    incident_kind_buckets: incidentKindBuckets,
    interaction_type_buckets: interactionTypeBuckets,
    event_type_buckets: eventTypeBuckets,
    severity_buckets: severityBuckets,
    latest_activity_at: latestActivityAt
  };
}

function createSeverityBuckets() {
  return {
    normal: 0,
    yellow: 0,
    orange: 0,
    red: 0
  };
}

function incrementBucket(buckets, key) {
  if (typeof key !== 'string' || key.length === 0) {
    return;
  }

  buckets[key] = (buckets[key] || 0) + 1;
}

function incrementSeverityBucket(buckets, severity) {
  if (typeof severity !== 'string' || !Object.prototype.hasOwnProperty.call(buckets, severity)) {
    return;
  }

  buckets[severity] += 1;
}

function getLatestIsoValue(currentValue, nextValue) {
  if (compareIsoAsc(currentValue, nextValue) >= 0) {
    return currentValue;
  }

  return nextValue || currentValue || null;
}

function compareOfficeOperations(left, right) {
  const severityDelta =
    SEVERITY_RANK[right.effective_severity] - SEVERITY_RANK[left.effective_severity];
  if (severityDelta !== 0) {
    return severityDelta;
  }

  const rebootDelta = Number(right.reboot_recommended) - Number(left.reboot_recommended);
  if (rebootDelta !== 0) {
    return rebootDelta;
  }

  const blockedDelta = Number(right.current_state === 'blocked') - Number(left.current_state === 'blocked');
  if (blockedDelta !== 0) {
    return blockedDelta;
  }

  const activityDelta = getOfficeOperationActivitySortMs(right) - getOfficeOperationActivitySortMs(left);
  if (activityDelta !== 0) {
    return activityDelta;
  }

  return (
    left.display_name.localeCompare(right.display_name) ||
    left.agent_id.localeCompare(right.agent_id)
  );
}

function getOfficeOperationActivitySortMs(item) {
  return Math.max(
    Date.parse(item.last_event_at || 0) || 0,
    Date.parse(item.last_heartbeat_at || 0) || 0,
    Date.parse(item.last_meaningful_output_at || 0) || 0
  );
}

function compareEventsByTsDesc(left, right) {
  const tsDelta = Date.parse(right.ts || 0) - Date.parse(left.ts || 0);
  if (tsDelta !== 0) {
    return tsDelta;
  }

  return String(right.event_id || '').localeCompare(String(left.event_id || ''));
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
  const tmuxObservationRef = getCollectorTmuxArtifactRef(item, tmuxObservation);
  if (tmuxObservationRef) {
    return {
      source_kind: 'tmux_observation',
      evidence_refs: [tmuxObservationRef]
    };
  }

  const tmuxRef = normalizeEvidenceRefs(item.evidence_refs).find(isValidTmuxRef);
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

function isValidTmuxRef(ref) {
  return isTmuxRef(ref) && !/\/(null|undefined)\.(null|undefined)$/.test(ref);
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

function normalizeCollectorReport(report = {}, previousReport = null) {
  const previousItemsByAgentId = new Map(
    (previousReport?.items || []).map((item) => [item.agent_id, item])
  );
  const normalizedItems = (report.items || []).map((item) =>
    normalizeCollectorReportItem(item, previousItemsByAgentId.get(item.agent_id) || null)
  );

  return {
    ...report,
    shared_artifacts: createSharedArtifactRollup(normalizedItems),
    items: normalizedItems
  };
}

function normalizeCollectorReportItem(item = {}, previousItem = null) {
  const normalizedEvidenceRefs = normalizeEvidenceRefs(item.evidence_refs);
  const currentStableTmuxRefs = normalizedEvidenceRefs.filter(isValidTmuxRef);
  const previousStableTmuxRefs = normalizeEvidenceRefs(previousItem?.evidence_refs).filter(isValidTmuxRef);
  const previousTmuxRefByPaneId = buildPreviousTmuxRefByPaneId(previousItem, previousStableTmuxRefs);

  const rawTmuxObservations = item.tmux_observations || [];
  const normalizedTmuxObservations = rawTmuxObservations.map((observation, index) =>
    normalizeCollectorTmuxObservation(observation, {
      currentStableTmuxRef: currentStableTmuxRefs[index] || null,
      previousStableTmuxRefByPaneId: previousTmuxRefByPaneId
    })
  );

  const normalizedTmuxEvidenceRefs = normalizedTmuxObservations
    .map((observation) => observation.artifact_ref)
    .filter(isValidTmuxRef);
  const nonTmuxEvidenceRefs = normalizedEvidenceRefs.filter((ref) => !isTmuxRef(ref));
  const passthroughTmuxEvidenceRefs =
    rawTmuxObservations.length === 0 ? currentStableTmuxRefs : [];

  return {
    ...item,
    evidence_refs: normalizeEvidenceRefs([
      ...nonTmuxEvidenceRefs,
      ...normalizedTmuxEvidenceRefs,
      ...passthroughTmuxEvidenceRefs
    ]),
    tmux_observations: normalizedTmuxObservations
  };
}

function buildPreviousTmuxRefByPaneId(previousItem = null, previousStableTmuxRefs = []) {
  const mapping = new Map();
  const previousObservations = previousItem?.tmux_observations || [];

  for (let index = 0; index < previousObservations.length; index += 1) {
    const observation = previousObservations[index];
    const stableRef =
      observation?.artifact_ref || previousStableTmuxRefs[index] || deriveTmuxArtifactRef(observation) || null;

    if (observation?.pane_id && stableRef) {
      mapping.set(observation.pane_id, stableRef);
    }
  }

  return mapping;
}

function normalizeCollectorTmuxObservation(
  observation = {},
  { currentStableTmuxRef = null, previousStableTmuxRefByPaneId = new Map() } = {}
) {
  const previousStableTmuxRef = observation.pane_id
    ? previousStableTmuxRefByPaneId.get(observation.pane_id) || null
    : null;
  const parsedStableRef = parseTmuxRef(currentStableTmuxRef || previousStableTmuxRef);

  const paneActivityAt = normalizeCollectorTimestamp(observation.pane_activity_at);
  const sessionName = observation.session_name || parsedStableRef?.session_name || null;
  const windowIndex = normalizeTmuxCoordinate(observation.window_index) || parsedStableRef?.window_index || null;
  const paneIndex = normalizeTmuxCoordinate(observation.pane_index) || parsedStableRef?.pane_index || null;
  const paneId = observation.pane_id || parsedStableRef?.pane_id || null;
  const artifactRef =
    deriveTmuxArtifactRef({
      session_name: sessionName,
      window_index: windowIndex,
      pane_index: paneIndex,
      pane_id: paneId
    }) ||
    currentStableTmuxRef ||
    previousStableTmuxRef ||
    null;

  return {
    ...observation,
    session_name: sessionName,
    window_index: windowIndex,
    pane_index: paneIndex,
    pane_id: paneId,
    pane_activity_at: paneActivityAt,
    artifact_ref: artifactRef
  };
}

function normalizeTmuxCoordinate(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = `${value}`.trim();
  if (!normalized || normalized === 'null' || normalized === 'undefined') {
    return null;
  }

  return normalized;
}

function parseTmuxRef(ref) {
  if (!isTmuxRef(ref)) {
    return null;
  }

  const body = ref.slice('tmux://'.length);
  const slashIndex = body.lastIndexOf('/');
  if (slashIndex === -1) {
    return {
      session_name: null,
      window_index: null,
      pane_index: null,
      pane_id: body || null
    };
  }

  const sessionName = body.slice(0, slashIndex) || null;
  const coordinates = body.slice(slashIndex + 1);
  const dotIndex = coordinates.indexOf('.');
  if (dotIndex === -1) {
    return {
      session_name: sessionName,
      window_index: null,
      pane_index: null,
      pane_id: null
    };
  }

  return {
    session_name: sessionName,
    window_index: normalizeTmuxCoordinate(coordinates.slice(0, dotIndex)),
    pane_index: normalizeTmuxCoordinate(coordinates.slice(dotIndex + 1)),
    pane_id: null
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

function normalizeStringValues(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(new Set(values.filter((value) => typeof value === 'string' && value.length > 0)))
    .sort();
}

function normalizeAgentIds(agentIds) {
  if (!Array.isArray(agentIds)) {
    return [];
  }

  return Array.from(
    new Set(agentIds.filter((agentId) => typeof agentId === 'string' && agentId.length > 0))
  ).sort();
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
  const summarySourceEvent =
    (endEvent && endEvent.summary ? endEvent : null) ||
    (startEvent && startEvent.summary ? startEvent : null) ||
    sourceEvent;
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
    source_kind: summarySourceEvent.source_kind,
    summary: summarySourceEvent.summary,
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

  if (
    filters.status &&
    !matchesIncidentStatusFilter(incident, filters.status)
  ) {
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

function matchesIncidentStatusFilter(incident, status) {
  if (status !== 'open') {
    return incident.status === status;
  }

  const activeStatuses = ACTIVE_INCIDENT_STATUSES_BY_KIND[incident.kind];
  if (!activeStatuses) {
    return incident.status === status;
  }

  return activeStatuses.includes(incident.status);
}

function getOpenLifecycleIncidentTieRank(incident) {
  return matchesIncidentStatusFilter(incident, 'open') ? 0 : 1;
}

function matchesIncidentOpenLifecycleWindow(incident, { durationMs = null, nowMs = null } = {}) {
  if (nowMs === null) {
    return true;
  }

  const incidentMs = getIncidentSortMs(incident);
  if (!Number.isFinite(incidentMs) || incidentMs > nowMs) {
    return false;
  }

  return durationMs === null || nowMs - incidentMs <= durationMs;
}

function selectOpenIncidentLifecycleItems(incidents) {
  const openLifecycleIncidents = [];
  const passthroughIncidents = [];
  const orderedIncidents = incidents
    .map((incident, index) => ({ incident, index }))
    .sort((left, right) => {
      const leftMs = getIncidentSortMs(left.incident);
      const rightMs = getIncidentSortMs(right.incident);
      if (leftMs !== rightMs) {
        return leftMs - rightMs;
      }

      const leftRank = getOpenLifecycleIncidentTieRank(left.incident);
      const rightRank = getOpenLifecycleIncidentTieRank(right.incident);
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return left.index - right.index;
    });

  for (const { incident } of orderedIncidents) {
    if (!LIFECYCLE_INCIDENT_KINDS.has(incident.kind)) {
      passthroughIncidents.push(incident);
      continue;
    }

    if (matchesIncidentStatusFilter(incident, 'open')) {
      const duplicateOpenIndex = findOpenLifecycleDuplicateIndex(openLifecycleIncidents, incident);
      if (duplicateOpenIndex !== -1) {
        openLifecycleIncidents.splice(duplicateOpenIndex, 1, incident);
      } else {
        openLifecycleIncidents.push(incident);
      }
      continue;
    }

    const openIndex = findLifecycleOpenIncidentIndex(openLifecycleIncidents, incident);
    if (openIndex !== -1) {
      openLifecycleIncidents.splice(openIndex, 1);
    }
  }

  return [...passthroughIncidents, ...openLifecycleIncidents];
}

function findOpenLifecycleDuplicateIndex(openIncidents, nextIncident) {
  const correlationKey = getIncidentCorrelationKey(nextIncident);
  if (correlationKey.length === 0) {
    return -1;
  }

  const counterpartyIds = getIncidentCounterpartyIds(nextIncident);
  return openIncidents.findIndex((incident) => (
    incident.kind === nextIncident.kind &&
    incident.agent_id === nextIncident.agent_id &&
    getIncidentCorrelationKey(incident) === correlationKey &&
    areDuplicateOpenLifecycleCounterpartyIds(getIncidentCounterpartyIds(incident), counterpartyIds)
  ));
}

function areDuplicateOpenLifecycleCounterpartyIds(left, right) {
  return agentIdListsEqual(left, right) || left.length === 0 || right.length === 0;
}

function findLifecycleOpenIncidentIndex(openIncidents, closingIncident) {
  const sameAgentKindCandidates = openIncidents
    .map((incident, index) => ({ incident, index }))
    .filter(({ incident }) => (
      incident.kind === closingIncident.kind &&
      incident.agent_id === closingIncident.agent_id
    ));

  if (sameAgentKindCandidates.length === 0) {
    return -1;
  }

  const closingCorrelationKey = getIncidentCorrelationKey(closingIncident);
  const matchingCorrelationCandidates = sameAgentKindCandidates.filter(
    ({ incident }) => getIncidentCorrelationKey(incident) === closingCorrelationKey
  );
  if (matchingCorrelationCandidates.length > 0) {
    return selectLifecycleCandidateIndex(matchingCorrelationCandidates, closingIncident);
  }

  const driftCorrelationCandidates = sameAgentKindCandidates.filter(({ incident }) => {
    const candidateCorrelationKey = getIncidentCorrelationKey(incident);
    return candidateCorrelationKey.length === 0 || closingCorrelationKey.length === 0;
  });

  return selectLifecycleCandidateIndex(driftCorrelationCandidates, closingIncident);
}

function selectLifecycleCandidateIndex(candidates, closingIncident) {
  const closingCounterpartyIds = getIncidentCounterpartyIds(closingIncident);
  if (closingCounterpartyIds.length > 0) {
    const exactCounterpartyCandidates = candidates.filter(
      ({ incident }) => agentIdListsEqual(getIncidentCounterpartyIds(incident), closingCounterpartyIds)
    );
    if (exactCounterpartyCandidates.length === 1) {
      return exactCounterpartyCandidates[0].index;
    }
    if (exactCounterpartyCandidates.length > 1) {
      return -1;
    }

    const compatibleCounterpartyCandidates = candidates.filter(({ incident }) => {
      const candidateCounterpartyIds = getIncidentCounterpartyIds(incident);
      return areLifecycleCounterpartyIdsCompatible(candidateCounterpartyIds, closingCounterpartyIds);
    });
    if (compatibleCounterpartyCandidates.length === 1) {
      return compatibleCounterpartyCandidates[0].index;
    }

    return -1;
  }

  if (candidates.length !== 1) {
    return -1;
  }

  return candidates[0].index;
}

function getIncidentCorrelationKey(incident) {
  return typeof incident.correlation_id === 'string' && incident.correlation_id.length > 0
    ? incident.correlation_id
    : '';
}

function getIncidentCounterpartyKey(incident) {
  return getIncidentCounterpartyIds(incident).join('|');
}

function getIncidentCounterpartyIds(incident) {
  return normalizeAgentIds(incident.counterparty_agent_ids || []);
}

function agentIdListsEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((agentId, index) => agentId === right[index]);
}

function areLifecycleCounterpartyIdsCompatible(left, right) {
  return (
    left.length === 0 ||
    right.length === 0 ||
    isAgentIdSubset(left, right) ||
    isAgentIdSubset(right, left)
  );
}

function isAgentIdSubset(left, right) {
  const rightIds = new Set(right);
  return left.every((agentId) => rightIds.has(agentId));
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
  if (filters.event_id && event.event_id !== filters.event_id) {
    return false;
  }

  if (filters.agent_id && event.agent_id !== filters.agent_id) {
    return false;
  }

  if (filters.event_type && event.event_type !== filters.event_type) {
    return false;
  }

  if (filters.severity && event.severity !== filters.severity) {
    return false;
  }

  if (filters.source_kind && event.source_kind !== filters.source_kind) {
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

function listInteractionItems(events, filters = {}, limit = parseLimit(filters.limit)) {
  const durationMs = filters.window ? parseWindow(filters.window) : null;
  const nowMs = durationMs === null ? null : parseNowMs(filters.now);

  const items = deriveInteractions(events)
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
    });

  return limit === null ? items : items.slice(0, limit);
}

function listTimelineItems(events, filters = {}) {
  const durationMs = filters.window ? parseWindow(filters.window) : null;
  const nowMs = durationMs === null ? null : parseNowMs(filters.now);
  const limit =
    filters.limit === null || filters.limit === undefined || filters.limit === ''
      ? null
      : parseLimit(filters.limit);

  return events
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
    .map(createTimelineItem);
}

function createTimelineItem(event) {
  return {
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
  };
}

function getIncidentParticipantAgentIds(incident) {
  return normalizeAgentIds([
    incident.agent_id,
    incident.actor_id,
    ...((incident && incident.counterparty_agent_ids) || [])
  ]);
}

function getTimelineParticipantAgentIds(event) {
  return normalizeAgentIds([
    event.agent_id,
    event.actor_id,
    ...((event && event.counterparty_agent_ids) || [])
  ]);
}

function getWorkflowCounterpartyAgentIds({
  agentId,
  incidents = [],
  interactions = [],
  timeline = []
}) {
  return normalizeAgentIds([
    ...incidents.flatMap((incident) => incident.counterparty_agent_ids || []),
    ...interactions.flatMap((interaction) => interaction.participant_agent_ids || []),
    ...timeline.flatMap((event) => event.counterparty_agent_ids || [])
  ]).filter(
    (counterpartyAgentId) =>
      counterpartyAgentId !== agentId && counterpartyAgentId !== 'team-lead'
  );
}

function listMemoryArtifactItems({ events = [], latestCollectorReport = null, filters = {} }) {
  const durationMs = filters.window ? parseWindow(filters.window) : null;
  const nowMs = durationMs === null ? null : parseNowMs(filters.now);
  const limit =
    filters.limit === null || filters.limit === undefined || filters.limit === ''
      ? null
      : parseLimit(filters.limit);
  const collectorObservations = buildCollectorObservationMap(latestCollectorReport);
  const artifactMap = new Map();

  for (const event of events) {
    if (!matchesMemoryArtifactEventFilters(event, filters)) {
      continue;
    }

    const eventTs = Date.parse(event.ts || 0);
    if (durationMs !== null && nowMs !== null && eventTs < nowMs - durationMs) {
      continue;
    }

    for (const artifactRef of normalizeEvidenceRefs(event.evidence_refs)) {
      const collectorObservation = collectorObservations.get(artifactRef) || null;
      const matchingCollectorObservationEntries = collectorObservation
        ? listMatchingCollectorObservationEntries({
            artifactRef,
            collectorObservation,
            filters,
            durationMs,
            nowMs
          })
        : [];
      const collectorArtifactKind =
        matchingCollectorObservationEntries.length > 0 ? collectorObservation.artifact_kind : null;
      const artifactKind = deriveArtifactKind(artifactRef, collectorArtifactKind);
      if (!matchesMemoryArtifactFilters({ artifactRef, event, artifactKind, filters })) {
        continue;
      }

      const collectorLastModifiedAt = getCollectorObservationLastSeenAt(matchingCollectorObservationEntries);
      const fileName = deriveArtifactFileName(
        artifactRef,
        matchingCollectorObservationEntries.length > 0 ? collectorObservation : null
      );
      const key = artifactRef;
      const existing = artifactMap.get(key) || {
        artifact_ref: artifactRef,
        artifact_kind: artifactKind,
        file_name: fileName,
        first_seen_at: event.ts,
        last_seen_at: event.ts,
        mention_count: 0,
        agent_ids: new Set(),
        correlation_ids: new Set(),
        source_kinds: new Set(),
        latest_summary: event.summary,
        latest_event_type: event.event_type,
        latest_event_id: event.event_id,
        latest_event_ts: event.ts,
        collector_last_modified_at: collectorLastModifiedAt
      };

      if (
        collectorLastModifiedAt &&
        (!existing.collector_last_modified_at ||
          Date.parse(collectorLastModifiedAt) > Date.parse(existing.collector_last_modified_at))
      ) {
        existing.collector_last_modified_at = collectorLastModifiedAt;
      }

      existing.artifact_kind = rankArtifactKind(existing.artifact_kind, artifactKind);
      if (!existing.file_name || existing.file_name === existing.artifact_ref) {
        existing.file_name = fileName;
      }
      existing.first_seen_at = compareIsoAsc(existing.first_seen_at, event.ts) <= 0 ? existing.first_seen_at : event.ts;
      existing.last_seen_at = compareIsoAsc(existing.last_seen_at, event.ts) >= 0 ? existing.last_seen_at : event.ts;
      existing.mention_count += 1;
      existing.agent_ids.add(event.agent_id);
      if (event.actor_id) {
        existing.agent_ids.add(event.actor_id);
      }
      for (const counterpartyAgentId of event.counterparty_agent_ids || []) {
        existing.agent_ids.add(counterpartyAgentId);
      }
      if (event.correlation_id) {
        existing.correlation_ids.add(event.correlation_id);
      }
      existing.source_kinds.add(event.source_kind);
      if (Date.parse(event.ts || 0) >= Date.parse(existing.latest_event_ts || 0)) {
        existing.latest_event_ts = event.ts;
        existing.latest_summary = event.summary;
        existing.latest_event_type = event.event_type;
        existing.latest_event_id = event.event_id;
      }
      if (!existing.collector_last_modified_at && collectorLastModifiedAt) {
        existing.collector_last_modified_at = collectorLastModifiedAt;
      }

      artifactMap.set(key, existing);
    }
  }

  for (const [artifactRef, collectorObservation] of collectorObservations.entries()) {
    const matchingObservationEntries = listMatchingCollectorObservationEntries({
      artifactRef,
      collectorObservation,
      filters,
      durationMs,
      nowMs
    });
    if (matchingObservationEntries.length === 0) {
      continue;
    }

    const firstSeenAt = matchingObservationEntries.reduce(
      (earliest, entry) => (compareIsoAsc(earliest, entry.observed_at) <= 0 ? earliest : entry.observed_at),
      matchingObservationEntries[0].observed_at
    );
    const lastSeenAt = matchingObservationEntries.reduce(
      (latest, entry) => (compareIsoAsc(latest, entry.observed_at) >= 0 ? latest : entry.observed_at),
      matchingObservationEntries[0].observed_at
    );

    const existing = artifactMap.get(artifactRef);
    if (!existing && hasMemoryArtifactEventFacetFilters(filters)) {
      continue;
    }

    if (existing) {
      existing.artifact_kind = rankArtifactKind(existing.artifact_kind, collectorObservation.artifact_kind);
      existing.first_seen_at = compareIsoAsc(existing.first_seen_at, firstSeenAt) <= 0 ? existing.first_seen_at : firstSeenAt;
      existing.last_seen_at = compareIsoAsc(existing.last_seen_at, lastSeenAt) >= 0 ? existing.last_seen_at : lastSeenAt;
      existing.mention_count += matchingObservationEntries.length;
      for (const participantAgentId of matchingObservationEntries.flatMap((entry) => entry.participant_agent_ids || [])) {
        existing.agent_ids.add(participantAgentId);
      }
      for (const correlationId of matchingObservationEntries.flatMap((entry) => (entry.correlation_id ? [entry.correlation_id] : []))) {
        existing.correlation_ids.add(correlationId);
      }
      for (const sourceKind of matchingObservationEntries.flatMap((entry) => (entry.source_kind ? [entry.source_kind] : []))) {
        existing.source_kinds.add(sourceKind);
      }
      if (
        !existing.collector_last_modified_at ||
        Date.parse(lastSeenAt) > Date.parse(existing.collector_last_modified_at)
      ) {
        existing.collector_last_modified_at = lastSeenAt;
      }
      if (!existing.file_name || existing.file_name === existing.artifact_ref) {
        existing.file_name = collectorObservation.file_name || deriveFileNameFromRef(artifactRef);
      }
      artifactMap.set(artifactRef, existing);
      continue;
    }

    artifactMap.set(artifactRef, {
      artifact_ref: artifactRef,
      artifact_kind: collectorObservation.artifact_kind,
      file_name: collectorObservation.file_name || deriveFileNameFromRef(artifactRef),
      first_seen_at: firstSeenAt,
      last_seen_at: lastSeenAt,
      mention_count: matchingObservationEntries.length,
      agent_ids: new Set(matchingObservationEntries.flatMap((entry) => entry.participant_agent_ids || [])),
      correlation_ids: new Set(
        matchingObservationEntries.flatMap((entry) => (entry.correlation_id ? [entry.correlation_id] : []))
      ),
      source_kinds: new Set(
        matchingObservationEntries.flatMap((entry) => (entry.source_kind ? [entry.source_kind] : []))
      ),
      latest_summary: null,
      latest_event_type: null,
      latest_event_ts: lastSeenAt,
      collector_last_modified_at: lastSeenAt
    });
  }

  const items = Array.from(artifactMap.values())
    .map((artifact) => ({
      artifact_ref: artifact.artifact_ref,
      artifact_kind: artifact.artifact_kind,
      file_name: artifact.file_name,
      first_seen_at: artifact.first_seen_at,
      last_seen_at: artifact.last_seen_at,
      mention_count: artifact.mention_count,
      agent_ids: Array.from(artifact.agent_ids).sort(),
      correlation_ids: Array.from(artifact.correlation_ids).sort(),
      source_kinds: Array.from(artifact.source_kinds).sort(),
      latest_summary: artifact.latest_summary,
      latest_event_type: artifact.latest_event_type,
      ...(artifact.latest_event_id
        ? {
            latest_event_id: artifact.latest_event_id,
            replay_checkpoint: {
              event_id: artifact.latest_event_id,
              event_type: artifact.latest_event_type,
              summary: artifact.latest_summary,
              last_seen_at: artifact.latest_event_ts
            }
          }
        : {}),
      collector_last_modified_at: artifact.collector_last_modified_at
    }))
    .sort((left, right) => {
      const lastSeenDelta = Date.parse(right.last_seen_at || 0) - Date.parse(left.last_seen_at || 0);
      if (lastSeenDelta !== 0) {
        return lastSeenDelta;
      }

      if (right.mention_count !== left.mention_count) {
        return right.mention_count - left.mention_count;
      }

      return left.artifact_ref.localeCompare(right.artifact_ref);
    });

  return applyOptionalLimit(items, limit);
}

function buildCollectorObservationMap(report) {
  const observations = new Map();
  const correlationId = createCollectorCorrelationId(report?.collected_at);

  for (const item of report?.items || []) {
    for (const workspaceObservation of item.workspace_observations || []) {
      if (!workspaceObservation?.path || workspaceObservation.kind !== 'workspace_file') {
        continue;
      }

      mergeCollectorObservation(observations, workspaceObservation.path, {
        artifact_kind: 'workspace_file',
        file_name: workspaceObservation.file_name || deriveFileNameFromRef(workspaceObservation.path),
        last_modified_at: workspaceObservation.last_modified_at || null,
        observed_agent_id: item.agent_id,
        participant_agent_ids: normalizeAgentIds([item.agent_id, report?.actor_id]),
        correlation_id: correlationId,
        source_kind: 'workspace_file'
      });
    }

    const itemTmuxObservations = item.tmux_observations || [];

    for (const tmuxObservation of itemTmuxObservations) {
      const tmuxRef = getCollectorTmuxArtifactRef(item, tmuxObservation, tmuxObservation?.artifact_ref || null);
      if (!tmuxRef) {
        continue;
      }

      mergeCollectorObservation(observations, tmuxRef, {
        artifact_kind: 'tmux_observation',
        file_name: tmuxObservation.pane_title || tmuxObservation.pane_current_command || tmuxRef,
        last_modified_at: tmuxObservation.pane_activity_at || null,
        observed_agent_id: item.agent_id,
        participant_agent_ids: normalizeAgentIds([item.agent_id, report?.actor_id]),
        correlation_id: correlationId,
        source_kind: 'tmux_observation'
      });
    }
  }

  return observations;
}

function mergeCollectorObservation(observations, artifactRef, nextObservation) {
  const existing = observations.get(artifactRef);
  const entry = {
    observed_agent_id: nextObservation.observed_agent_id || null,
    participant_agent_ids: normalizeAgentIds(nextObservation.participant_agent_ids || []),
    correlation_id: nextObservation.correlation_id || null,
    source_kind: nextObservation.source_kind || null,
    observed_at: nextObservation.last_modified_at || null
  };

  if (!existing) {
    observations.set(artifactRef, {
      artifact_kind: nextObservation.artifact_kind,
      file_name: nextObservation.file_name,
      last_modified_at: nextObservation.last_modified_at,
      entries: [entry]
    });
    return;
  }

  existing.artifact_kind = rankArtifactKind(existing.artifact_kind, nextObservation.artifact_kind);
  if (!existing.file_name || existing.file_name === artifactRef) {
    existing.file_name = nextObservation.file_name;
  }
  if (
    nextObservation.last_modified_at &&
    (!existing.last_modified_at || Date.parse(nextObservation.last_modified_at) > Date.parse(existing.last_modified_at))
  ) {
    existing.last_modified_at = nextObservation.last_modified_at;
  }
  existing.entries = [...(existing.entries || []), entry];
  observations.set(artifactRef, existing);
}

function matchesMemoryArtifactEventFilters(event, filters = {}) {
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

function matchesMemoryArtifactFilters({ artifactRef, event, artifactKind, filters }) {
  if (filters.agent_id) {
    const participantAgentIds = normalizeAgentIds([
      event.agent_id,
      event.actor_id,
      ...(event.counterparty_agent_ids || [])
    ]);

    if (!participantAgentIds.includes(filters.agent_id)) {
      return false;
    }
  }

  if (filters.correlation_id && event.correlation_id !== filters.correlation_id) {
    return false;
  }

  if (filters.artifact_kind && artifactKind !== filters.artifact_kind) {
    return false;
  }

  if (filters.artifact_ref && artifactRef !== filters.artifact_ref) {
    return false;
  }

  return true;
}

function hasMemoryArtifactEventFacetFilters(filters = {}) {
  return Boolean(filters.event_type || filters.severity);
}

function listMatchingCollectorObservationEntries({
  artifactRef,
  collectorObservation,
  filters,
  durationMs = null,
  nowMs = null
}) {
  if (filters.artifact_ref && artifactRef !== filters.artifact_ref) {
    return [];
  }

  if (filters.artifact_kind && collectorObservation.artifact_kind !== filters.artifact_kind) {
    return [];
  }

  return (collectorObservation.entries || [])
    .map((entry) => ({
      ...entry,
      observed_at: entry.observed_at || collectorObservation.last_modified_at || null
    }))
    .filter((entry) => {
      if (filters.agent_id) {
        const participantAgentIds = normalizeAgentIds(entry.participant_agent_ids || []);
        if (!participantAgentIds.includes(filters.agent_id)) {
          return false;
        }
      }

      if (filters.correlation_id && entry.correlation_id !== filters.correlation_id) {
        return false;
      }

      if (durationMs !== null && nowMs !== null && Date.parse(entry.observed_at || 0) < nowMs - durationMs) {
        return false;
      }

      return true;
    });
}

function deriveArtifactKind(artifactRef, collectorArtifactKind = null) {
  if (collectorArtifactKind) {
    return collectorArtifactKind;
  }

  if (artifactRef.startsWith('tmux://')) {
    return 'tmux_observation';
  }

  if (/\/(inbox|outbox|todo)\.md$/i.test(artifactRef)) {
    return 'workspace_file';
  }

  return 'evidence_ref';
}

function getCollectorObservationLastSeenAt(entries = []) {
  if (entries.length === 0) {
    return null;
  }

  return entries.reduce(
    (latest, entry) => (compareIsoAsc(latest, entry.observed_at) >= 0 ? latest : entry.observed_at),
    entries[0].observed_at
  );
}

function rankArtifactKind(left, right) {
  const rank = {
    evidence_ref: 0,
    workspace_file: 1,
    tmux_observation: 2
  };

  return rank[right] > rank[left] ? right : left;
}

function deriveArtifactFileName(artifactRef, collectorObservation) {
  return collectorObservation?.file_name || deriveFileNameFromRef(artifactRef);
}

function deriveFileNameFromRef(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return 'unknown';
  }

  if (value.startsWith('tmux://')) {
    const segments = value.replace(/^tmux:\/\//, '').split('/');
    return segments[segments.length - 1] || value;
  }

  const parts = value.split('/').filter(Boolean);
  return parts[parts.length - 1] || value;
}

function deriveTmuxArtifactRef(tmuxObservation) {
  if (
    tmuxObservation?.session_name &&
    tmuxObservation.window_index !== undefined &&
    tmuxObservation.window_index !== null &&
    tmuxObservation.window_index !== 'null' &&
    tmuxObservation.window_index !== 'undefined' &&
    tmuxObservation.pane_index !== undefined &&
    tmuxObservation.pane_index !== null &&
    tmuxObservation.pane_index !== 'null' &&
    tmuxObservation.pane_index !== 'undefined'
  ) {
    return `tmux://${tmuxObservation.session_name}/${tmuxObservation.window_index}.${tmuxObservation.pane_index}`;
  }

  if (tmuxObservation?.pane_id) {
    return `tmux://${tmuxObservation.pane_id}`;
  }

  return null;
}

function getCollectorTmuxArtifactRef(item, tmuxObservation, fallbackTmuxRef = null) {
  if (fallbackTmuxRef) {
    return fallbackTmuxRef;
  }

  const observationRef = deriveTmuxArtifactRef(tmuxObservation);
  if (observationRef) {
    return observationRef;
  }

  return normalizeEvidenceRefs(item?.evidence_refs).find(isValidTmuxRef) || null;
}

function compareIsoAsc(left, right) {
  return Date.parse(left || 0) - Date.parse(right || 0);
}

function createCorrelationClosureLedger({ incidents = [], openIncidents = [], interactions = [], limit = null }) {
  const openIncidentIds = new Set(openIncidents.map((incident) => incident.incident_id));
  const openEntries = openIncidents.map((incident) => createIncidentClosureEntry(incident, 'open'));
  const closedEntries = incidents
    .filter((incident) => !openIncidentIds.has(incident.incident_id))
    .filter((incident) => incident.status === 'resolved' || incident.status === 'completed')
    .map((incident) => createIncidentClosureEntry(incident, 'closed'));
  const activeEntries = interactions
    .filter((interaction) => !interaction.ended_at)
    .map(createActiveInteractionClosureEntry);
  const entries = [...openEntries, ...activeEntries, ...closedEntries].sort((left, right) => {
    const rightTs = Date.parse(right.ts || 0);
    const leftTs = Date.parse(left.ts || 0);

    if (rightTs !== leftTs) {
      return rightTs - leftTs;
    }

    return right.entry_id.localeCompare(left.entry_id);
  });
  const visibleEntries = limit === null ? entries : entries.slice(0, limit);

  return {
    state: openEntries.length > 0
      ? 'open'
      : activeEntries.length > 0
        ? 'active'
        : closedEntries.length > 0
          ? 'closed'
          : 'unknown',
    basis: 'filtered_correlation_slice',
    open_count: openEntries.length,
    active_count: activeEntries.length,
    closed_count: closedEntries.length,
    entry_count: entries.length,
    last_transition_ts: entries[0]?.ts || null,
    entries: visibleEntries
  };
}

function createIncidentClosureEntry(incident, state) {
  return {
    entry_id: `incident:${incident.incident_id}`,
    state,
    kind: incident.kind,
    status: incident.status,
    ts: incident.ts,
    agent_id: incident.agent_id,
    actor_id: incident.actor_id || null,
    summary: incident.summary,
    correlation_id: incident.correlation_id,
    evidence_refs: normalizeEvidenceRefs(incident.evidence_refs),
    source_kind: incident.source_kind,
    incident_id: incident.incident_id
  };
}

function createActiveInteractionClosureEntry(interaction) {
  return {
    entry_id: interaction.interaction_id,
    state: 'active',
    kind: interaction.interaction_type,
    status: 'active',
    ts: interaction.started_at,
    agent_id: interaction.participant_agent_ids[0] || '',
    actor_id: null,
    summary: interaction.summary,
    correlation_id: interaction.correlation_id,
    evidence_refs: normalizeEvidenceRefs(interaction.evidence_refs),
    source_kind: interaction.source_kind,
    interaction_id: interaction.interaction_id,
    related_event_ids: normalizeStringValues(interaction.related_event_ids)
  };
}

function collectCorrelationTimestamps({ incidents = [], interactions = [], timeline = [] }) {
  return Array.from(
    new Set(
      [
        ...incidents.map((incident) => incident.ts),
        ...interactions.flatMap((interaction) =>
          [interaction.started_at, interaction.ended_at].filter(Boolean)
        ),
        ...timeline.map((event) => event.ts)
      ].filter((ts) => typeof ts === 'string' && ts.length > 0)
    )
  ).sort((left, right) => Date.parse(left) - Date.parse(right));
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
