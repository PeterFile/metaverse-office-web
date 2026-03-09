const { appendFile, mkdir, readFile } = require('node:fs/promises');
const path = require('node:path');

const {
  SEED_AGENTS,
  deriveLocationForEvent,
  deriveLocationForState,
  MEANINGFUL_OUTPUT_EVENT_TYPES
} = require('../domain');

class PrototypeStore {
  constructor({ filePath }) {
    this.filePath = filePath;
    this.records = [];
    this.events = [];
    this.heartbeats = [];
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
  snapshot.current_location = deriveLocationForEvent(snapshot, event.event_type, event.current_state);
  snapshot.last_event_id = event.event_id;
  snapshot.last_event_at = event.ts;
  snapshot.severity = event.severity;

  if (MEANINGFUL_OUTPUT_EVENT_TYPES.has(event.event_type)) {
    snapshot.last_meaningful_output_at = event.ts;
  }

  if (event.event_type === 'agent_wrote_file') {
    snapshot.last_file_write_at = event.ts;
  }

  if (event.event_type === 'peer_watch_alert_raised' && event.current_state === 'blocked') {
    snapshot.current_blocker = event.summary;
  }

  if (event.event_type === 'peer_watch_alert_resolved') {
    snapshot.current_blocker = '';
    snapshot.severity = 'normal';
  }

  if (event.event_type === 'agent_reboot_requested') {
    snapshot.reboot_recommended = true;
  }

  if (event.event_type === 'agent_reboot_completed') {
    snapshot.reboot_recommended = false;
    snapshot.severity = 'normal';
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

  if (heartbeat.reboot_recommended && snapshot.severity === 'normal') {
    snapshot.severity = 'orange';
  }

  if (!heartbeat.reboot_recommended && !heartbeat.current_blocker && snapshot.severity === 'orange') {
    snapshot.severity = 'normal';
  }
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
