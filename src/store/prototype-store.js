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
    const collectorEvents = createCollectorSupervisionEvents({
      report,
      existingEvents: this.events
    });
    const items = [];

    for (const event of collectorEvents) {
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

  listEvents(filters = {}) {
    const limit = parseLimit(filters.limit);

    return this.events
      .filter((event) => {
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
      })
      .slice()
      .sort((left, right) => Date.parse(right.ts) - Date.parse(left.ts))
      .slice(0, limit);
  }

  listAgentEvents(agentId, filters = {}) {
    return this.listEvents({ ...filters, agent_id: agentId });
  }

  listTimeline({ window = '60m', now }) {
    const durationMs = parseWindow(window);
    const nowMs = Date.parse(now);

    return this.events
      .filter((event) => Date.parse(event.ts) >= nowMs - durationMs)
      .slice()
      .sort((left, right) => Date.parse(left.ts) - Date.parse(right.ts))
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
        correlation_id: event.correlation_id
      }));
  }

  listPeerWatchAlerts({ severity }) {
    return this.events
      .filter((event) => event.event_type.startsWith('peer_watch_alert_'))
      .filter((event) => !severity || event.severity === severity)
      .slice()
      .sort((left, right) => Date.parse(right.ts) - Date.parse(left.ts))
      .map((event) => ({
        alert_id: event.event_id,
        ts: event.ts,
        agent_id: event.agent_id,
        actor_id: event.actor_id,
        severity: event.severity,
        status: event.event_type.endsWith('_resolved') ? 'resolved' : 'open',
        summary: event.summary,
        evidence_refs: event.evidence_refs,
        correlation_id: event.correlation_id
      }));
  }

  listHandoffs() {
    return this.events
      .filter((event) => event.event_type.startsWith('agent_handoff_'))
      .slice()
      .sort((left, right) => Date.parse(right.ts) - Date.parse(left.ts))
      .map((event) => ({
        handoff_id: event.event_id,
        ts: event.ts,
        agent_id: event.agent_id,
        actor_id: event.actor_id,
        phase: event.event_type.endsWith('_completed') ? 'completed' : 'started',
        summary: event.summary,
        counterparty_agent_ids: event.counterparty_agent_ids,
        evidence_refs: event.evidence_refs,
        correlation_id: event.correlation_id
      }));
  }

  listReboots() {
    return this.events
      .filter((event) => event.event_type.startsWith('agent_reboot_'))
      .slice()
      .sort((left, right) => Date.parse(right.ts) - Date.parse(left.ts))
      .map((event) => ({
        reboot_id: event.event_id,
        ts: event.ts,
        agent_id: event.agent_id,
        actor_id: event.actor_id,
        phase: event.event_type.endsWith('_completed') ? 'completed' : 'requested',
        severity: event.severity,
        summary: event.summary,
        evidence_refs: event.evidence_refs,
        correlation_id: event.correlation_id
      }));
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

function parseLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }

  return Math.min(parsed, 200);
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
