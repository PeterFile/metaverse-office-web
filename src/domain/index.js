const AGENT_STATES = Object.freeze([
  'idle',
  'researching',
  'planning',
  'coding',
  'blocked',
  'reviewing',
  'sleeping',
  'rebooting'
]);

const EVENT_TYPES = Object.freeze([
  'agent_started',
  'agent_stopped',
  'agent_state_changed',
  'agent_received_task',
  'agent_opened_file',
  'agent_wrote_file',
  'agent_asked_question',
  'agent_replied',
  'meeting_started',
  'meeting_ended',
  'review_started',
  'review_completed',
  'peer_watch_alert_raised',
  'peer_watch_alert_resolved',
  'agent_handoff_started',
  'agent_handoff_completed',
  'agent_memory_warning',
  'agent_hallucination_suspected',
  'agent_context_degraded',
  'agent_reboot_requested',
  'agent_reboot_completed'
]);

const EVENT_STATE_REQUIREMENTS = Object.freeze({
  meeting_started: ['planning', 'reviewing'],
  meeting_ended: ['planning', 'reviewing'],
  review_started: ['reviewing'],
  review_completed: ['reviewing'],
  peer_watch_alert_raised: ['blocked', 'reviewing'],
  peer_watch_alert_resolved: ['blocked', 'reviewing'],
  agent_handoff_started: ['planning', 'reviewing', 'blocked'],
  agent_handoff_completed: ['planning', 'reviewing', 'blocked'],
  agent_reboot_requested: ['rebooting'],
  agent_reboot_completed: ['rebooting']
});

const CONTROLLER_EVENT_TYPES = new Set([
  'meeting_started',
  'meeting_ended',
  'review_started',
  'review_completed',
  'peer_watch_alert_raised',
  'peer_watch_alert_resolved',
  'agent_handoff_started',
  'agent_handoff_completed',
  'agent_reboot_requested',
  'agent_reboot_completed'
]);

const REVIEW_ZONE_EVENT_TYPES = new Set([
  'review_started',
  'review_completed',
  'peer_watch_alert_raised',
  'peer_watch_alert_resolved'
]);

const MEETING_ZONE_EVENT_TYPES = new Set([
  'meeting_started',
  'meeting_ended',
  'agent_asked_question',
  'agent_replied',
  'agent_handoff_started',
  'agent_handoff_completed'
]);

const MEANINGFUL_OUTPUT_EVENT_TYPES = new Set([
  'agent_received_task',
  'agent_wrote_file',
  'agent_asked_question',
  'agent_replied',
  'review_completed',
  'peer_watch_alert_raised',
  'peer_watch_alert_resolved',
  'agent_handoff_started',
  'agent_handoff_completed',
  'agent_memory_warning',
  'agent_hallucination_suspected',
  'agent_context_degraded',
  'agent_reboot_requested',
  'agent_reboot_completed'
]);

const SEVERITY_LEVELS = Object.freeze(['normal', 'yellow', 'orange', 'red']);
const CONFIDENCE_LEVELS = Object.freeze(['low', 'medium', 'high']);
const SOURCE_KINDS = Object.freeze([
  'controller_event',
  'workspace_file',
  'tmux_observation',
  'raw_transcript'
]);

const WATCH_TARGETS = Object.freeze({
  'market-intel': 'product-pmf',
  'product-pmf': 'tokenomics',
  tokenomics: 'protocol-engineering',
  'protocol-engineering': 'app-engineering',
  'app-engineering': 'growth-revenue',
  'growth-revenue': 'market-intel'
});

const WATCHED_BY = Object.freeze({
  'team-lead': [],
  'market-intel': ['growth-revenue', 'team-lead'],
  'product-pmf': ['market-intel', 'team-lead'],
  tokenomics: ['product-pmf', 'team-lead'],
  'protocol-engineering': ['tokenomics', 'team-lead'],
  'app-engineering': ['protocol-engineering', 'team-lead'],
  'growth-revenue': ['app-engineering', 'team-lead']
});

const SEED_AGENTS = Object.freeze([
  {
    agent_id: 'team-lead',
    role_slug: 'lead',
    display_name: 'Team Lead',
    avatar_key: 'team-lead',
    home_zone: 'lead-desk',
    watch_target: 'all',
    watched_by: WATCHED_BY['team-lead'],
    session_ref: 'primary-hermes-session',
    workspace_root: '/Users/cwp/.hermes/teams/web3-company/controller',
    kind: 'lead',
    current_state: 'reviewing',
    active_task: 'Coordinate Phase 1 backend scaffold'
  },
  {
    agent_id: 'market-intel',
    role_slug: 'market-intel',
    display_name: 'Market Intel Agent',
    avatar_key: 'market-intel',
    home_zone: 'desk-market-intel',
    watch_target: WATCH_TARGETS['market-intel'],
    watched_by: WATCHED_BY['market-intel'],
    session_ref: '1-web3-market-intel',
    workspace_root: '/Users/cwp/.hermes/teams/web3-company/agents/market-intel/workspace',
    kind: 'employee',
    current_state: 'idle',
    active_task: 'Awaiting next team-lead task'
  },
  {
    agent_id: 'product-pmf',
    role_slug: 'product-pmf',
    display_name: 'Product PMF Agent',
    avatar_key: 'product-pmf',
    home_zone: 'desk-product-pmf',
    watch_target: WATCH_TARGETS['product-pmf'],
    watched_by: WATCHED_BY['product-pmf'],
    session_ref: '2-web3-product-pmf',
    workspace_root: '/Users/cwp/.hermes/teams/web3-company/agents/product-pmf/workspace',
    kind: 'employee',
    current_state: 'idle',
    active_task: 'Awaiting next team-lead task'
  },
  {
    agent_id: 'tokenomics',
    role_slug: 'tokenomics',
    display_name: 'Tokenomics Agent',
    avatar_key: 'tokenomics',
    home_zone: 'desk-tokenomics',
    watch_target: WATCH_TARGETS.tokenomics,
    watched_by: WATCHED_BY.tokenomics,
    session_ref: '3-web3-tokenomics',
    workspace_root: '/Users/cwp/.hermes/teams/web3-company/agents/tokenomics/workspace',
    kind: 'employee',
    current_state: 'idle',
    active_task: 'Awaiting next team-lead task'
  },
  {
    agent_id: 'protocol-engineering',
    role_slug: 'protocol-engineering',
    display_name: 'Protocol Engineering Agent',
    avatar_key: 'protocol-engineering',
    home_zone: 'desk-protocol-engineering',
    watch_target: WATCH_TARGETS['protocol-engineering'],
    watched_by: WATCHED_BY['protocol-engineering'],
    session_ref: '4-web3-protocol-engineering',
    workspace_root: '/Users/cwp/.hermes/teams/web3-company/agents/protocol-engineering/workspace',
    kind: 'employee',
    current_state: 'idle',
    active_task: 'Awaiting next team-lead task'
  },
  {
    agent_id: 'app-engineering',
    role_slug: 'app-engineering',
    display_name: 'App Engineering Agent',
    avatar_key: 'app-engineering',
    home_zone: 'desk-app-engineering',
    watch_target: WATCH_TARGETS['app-engineering'],
    watched_by: WATCHED_BY['app-engineering'],
    session_ref: '5-web3-app-engineering',
    workspace_root: '/Users/cwp/.hermes/teams/web3-company/agents/app-engineering/workspace',
    kind: 'employee',
    current_state: 'idle',
    active_task: 'Awaiting next team-lead task'
  },
  {
    agent_id: 'growth-revenue',
    role_slug: 'growth-revenue',
    display_name: 'Growth Revenue Agent',
    avatar_key: 'growth-revenue',
    home_zone: 'desk-growth-revenue',
    watch_target: WATCH_TARGETS['growth-revenue'],
    watched_by: WATCHED_BY['growth-revenue'],
    session_ref: '6-web3-growth-revenue',
    workspace_root: '/Users/cwp/.hermes/teams/web3-company/agents/growth-revenue/workspace',
    kind: 'employee',
    current_state: 'idle',
    active_task: 'Awaiting next team-lead task'
  }
]);

const AGENT_STATE_SET = new Set(AGENT_STATES);
const EVENT_TYPE_SET = new Set(EVENT_TYPES);
const SEVERITY_SET = new Set(SEVERITY_LEVELS);
const CONFIDENCE_SET = new Set(CONFIDENCE_LEVELS);
const SOURCE_KIND_SET = new Set(SOURCE_KINDS);
const AGENT_INDEX = new Map(SEED_AGENTS.map((agent) => [agent.agent_id, agent]));

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isIsoTimestamp(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return false;
  }

  return !Number.isNaN(Date.parse(value));
}

function isCanonicalState(value) {
  return AGENT_STATE_SET.has(value);
}

function isEventType(value) {
  return EVENT_TYPE_SET.has(value);
}

function getAgentById(agentId) {
  return AGENT_INDEX.get(agentId) || null;
}

function deriveLocationForState(agent, currentState) {
  if (!agent) {
    return null;
  }

  switch (currentState) {
    case 'reviewing':
      return 'review-zone';
    case 'sleeping':
      return 'rest-zone';
    case 'rebooting':
      return 'reboot-zone';
    default:
      return agent.home_zone;
  }
}

function deriveLocationForEvent(agent, eventType, currentState) {
  if (!agent) {
    return null;
  }

  if (REVIEW_ZONE_EVENT_TYPES.has(eventType)) {
    return 'review-zone';
  }

  if (MEETING_ZONE_EVENT_TYPES.has(eventType)) {
    return 'meeting-zone';
  }

  return deriveLocationForState(agent, currentState);
}

function validateEventPayload(payload, options = {}) {
  const errors = [];

  if (!isPlainObject(payload)) {
    return { ok: false, errors: ['payload must be an object'] };
  }

  const actorId = options.actorId || payload.actor_id || payload.agent_id;
  const targetAgent = getAgentById(payload.agent_id);
  const actorAgent = getAgentById(actorId);

  if (options.actorId && payload.actor_id && payload.actor_id !== options.actorId) {
    errors.push('actor_id must match x-actor-id header');
  }

  if (typeof payload.event_id !== 'string' || payload.event_id.length === 0) {
    errors.push('event_id is required');
  }

  if (!isIsoTimestamp(payload.ts)) {
    errors.push('ts must be an ISO timestamp');
  }

  if (!targetAgent) {
    errors.push('agent_id must reference a known agent');
  }

  if (!actorAgent) {
    errors.push('actor_id must reference a known agent');
  }

  if (!isEventType(payload.event_type)) {
    errors.push('event_type must be canonical');
  }

  if (!isCanonicalState(payload.current_state)) {
    errors.push('current_state must be canonical');
  }

  if (!SEVERITY_SET.has(payload.severity)) {
    errors.push('severity must be one of normal, yellow, orange, red');
  }

  if (!SOURCE_KIND_SET.has(payload.source_kind)) {
    errors.push('source_kind must be supported');
  }

  if (!Array.isArray(payload.counterparty_agent_ids)) {
    errors.push('counterparty_agent_ids must be an array');
  }

  if (!Array.isArray(payload.evidence_refs)) {
    errors.push('evidence_refs must be an array');
  }

  if (!isPlainObject(payload.metadata)) {
    errors.push('metadata must be an object');
  }

  for (const field of ['agent_role', 'active_task', 'summary', 'correlation_id']) {
    if (typeof payload[field] !== 'string') {
      errors.push(`${field} must be a string`);
    }
  }

  if (payload.location !== undefined && typeof payload.location !== 'string') {
    errors.push('location must be a string when provided');
  }

  if (targetAgent && payload.agent_role !== targetAgent.role_slug) {
    errors.push('agent_role must match the target agent role_slug');
  }

  const allowedStates = EVENT_STATE_REQUIREMENTS[payload.event_type];
  if (allowedStates && !allowedStates.includes(payload.current_state)) {
    errors.push(
      `event_type ${payload.event_type} requires current_state ${allowedStates.join(', ')}`
    );
  }

  if (actorAgent && targetAgent) {
    if (actorAgent.kind === 'employee' && actorAgent.agent_id !== targetAgent.agent_id) {
      errors.push('employee events must be self-scoped');
    }

    if (actorAgent.kind === 'employee' && CONTROLLER_EVENT_TYPES.has(payload.event_type)) {
      errors.push('controller-only event_type requires the team lead');
    }

    if (
      actorAgent.kind === 'lead' &&
      actorAgent.agent_id !== targetAgent.agent_id &&
      !CONTROLLER_EVENT_TYPES.has(payload.event_type)
    ) {
      errors.push(
        'lead cross-agent events must be supervision, handoff, reboot, review, or meeting events'
      );
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      ...payload,
      actor_id: actorId,
      location: deriveLocationForEvent(targetAgent, payload.event_type, payload.current_state)
    }
  };
}

function validateHeartbeatPayload(payload, options = {}) {
  const errors = [];

  if (!isPlainObject(payload)) {
    return { ok: false, errors: ['payload must be an object'] };
  }

  const actorId = options.actorId || payload.actor_id || payload.agent_id;
  const targetAgent = getAgentById(payload.agent_id);
  const actorAgent = getAgentById(actorId);

  if (options.actorId && payload.actor_id && payload.actor_id !== options.actorId) {
    errors.push('actor_id must match x-actor-id header');
  }

  if (!targetAgent) {
    errors.push('agent_id must reference a known agent');
  }

  if (!actorAgent) {
    errors.push('actor_id must reference a known agent');
  }

  if (actorAgent && targetAgent && actorAgent.agent_id !== targetAgent.agent_id) {
    errors.push('heartbeats must be self-scoped');
  }

  if (!isCanonicalState(payload.current_state)) {
    errors.push('current_state must be canonical');
  }

  if (!isIsoTimestamp(payload.last_meaningful_output_at)) {
    errors.push('last_meaningful_output_at must be an ISO timestamp');
  }

  if (!isIsoTimestamp(payload.last_file_write_at)) {
    errors.push('last_file_write_at must be an ISO timestamp');
  }

  if (!CONFIDENCE_SET.has(payload.confidence_level)) {
    errors.push('confidence_level must be low, medium, or high');
  }

  if (typeof payload.active_task !== 'string') {
    errors.push('active_task must be a string');
  }

  if (typeof payload.current_blocker !== 'string') {
    errors.push('current_blocker must be a string');
  }

  if (typeof payload.reboot_recommended !== 'boolean') {
    errors.push('reboot_recommended must be a boolean');
  }

  if (payload.received_at !== undefined && !isIsoTimestamp(payload.received_at)) {
    errors.push('received_at must be an ISO timestamp when provided');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      ...payload,
      actor_id: actorId,
      current_location: deriveLocationForState(targetAgent, payload.current_state)
    }
  };
}

module.exports = {
  AGENT_STATES,
  CONTROLLER_EVENT_TYPES,
  EVENT_TYPES,
  MEANINGFUL_OUTPUT_EVENT_TYPES,
  SEED_AGENTS,
  SEVERITY_LEVELS,
  WATCH_TARGETS,
  WATCHED_BY,
  validateEventPayload,
  validateHeartbeatPayload,
  isCanonicalState,
  isEventType,
  getAgentById,
  deriveLocationForState,
  deriveLocationForEvent
};
