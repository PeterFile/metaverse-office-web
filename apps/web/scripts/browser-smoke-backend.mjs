import http from 'node:http';
import { mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createAppServer } = require('../../../src/server.js');
const { createPrototypeStore } = require('../../../src/store/prototype-store.js');

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../..');
const scratchRoot = path.join(repoRoot, '.tmp', 'browser-smoke');
const storeFile = path.join(scratchRoot, 'prototype-store.jsonl');
const port = Number.parseInt(process.env.PORT || '3210', 10);
const now = () => '2026-03-11T00:00:00.000Z';
const scenarioStateByRun = new Map();
const scenarioCookieName = 'browser_smoke_mode';
const scenarioRunCookieName = 'browser_smoke_run';
const staleSelectionAgentId = 'growth-revenue';
const staleSelectionCorrelationId = 'corr-growth-lead-review';
const initialScenarioGraceMs = 5_000;

async function main() {
  await rm(scratchRoot, { recursive: true, force: true });
  await mkdir(scratchRoot, { recursive: true });

  const store = await createPrototypeStore({ filePath: storeFile });
  await seedBrowserSmokeSlice(store);

  const baseServer = createAppServer({ store, now });
  const server = createScenarioServer({ baseServer, store, now });
  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(
      `browser smoke backend listening on http://127.0.0.1:${port}\nstore: ${storeFile}\n`
    );
  });

  const shutdown = () => {
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function createScenarioServer({ baseServer, store, now }) {
  return http.createServer((req, res) => {
    if (handleScenarioOverride({ req, res, store, now })) {
      return;
    }

    baseServer.emit('request', req, res);
  });
}

function handleScenarioOverride({ req, res, store, now }) {
  const method = req.method || 'GET';
  if (method !== 'GET') {
    return false;
  }

  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const cookies = parseCookies(req.headers.cookie);
  const scenario = cookies[scenarioCookieName];
  if (!scenario) {
    return false;
  }

  const runId = cookies[scenarioRunCookieName] || 'default';
  const state = getScenarioState({ scenario, runId });
  if (scenario === 'degraded-refresh') {
    return handleDegradedRefreshScenario({ res, url, state });
  }

  if (scenario === 'stale-selection-404') {
    return handleStaleSelectionScenario({ res, url, state, store, now });
  }

  return false;
}

function handleDegradedRefreshScenario({ res, url, state }) {
  const pathname = url.pathname;

  if (Date.now() - state.startedAt < initialScenarioGraceMs) {
    return false;
  }

  if (pathname === '/office/overview') {
    incrementScenarioCount(state, 'overview');
    sendJson(res, 500, {
      error: 'internal_error',
      details: 'overview refresh failed'
    });
    return true;
  }

  if (pathname === '/incidents') {
    incrementScenarioCount(state, 'incidents');
    sendJson(res, 500, {
      error: 'internal_error',
      details: 'incident refresh failed'
    });
    return true;
  }

  const workflowMatch = pathname.match(/^\/agents\/([^/]+)\/workflow$/);
  if (workflowMatch) {
    const agentId = decodeURIComponent(workflowMatch[1]);
    incrementScenarioCount(state, `workflow:${agentId}`);
    sendJson(res, 500, {
      error: 'internal_error',
      details: 'workflow refresh failed'
    });
    return true;
  }

  const correlationMatch = pathname.match(/^\/correlations\/([^/]+)$/);
  if (correlationMatch) {
    const correlationId = decodeURIComponent(correlationMatch[1]);
    incrementScenarioCount(state, `correlation:${correlationId}`);
    sendJson(res, 500, {
      error: 'internal_error',
      details: 'correlation refresh failed'
    });
    return true;
  }

  return false;
}

function handleStaleSelectionScenario({ res, url, state, store, now }) {
  const pathname = url.pathname;

  if (pathname === '/office/overview') {
    incrementScenarioCount(state, 'overview');
    const overview = store.getOfficeOverview({ now: now() });
    sendJson(res, 200, removeAgentFromOverview(overview, staleSelectionAgentId));
    return true;
  }

  const workflowMatch = pathname.match(/^\/agents\/([^/]+)\/workflow$/);
  if (workflowMatch) {
    const agentId = decodeURIComponent(workflowMatch[1]);
    if (agentId !== staleSelectionAgentId) {
      return false;
    }

    const requestCount = incrementScenarioCount(state, `workflow:${agentId}`);
    if (requestCount === 1) {
      const workflow = store.getAgentWorkflow(agentId, {
        limit: url.searchParams.get('limit'),
        window: url.searchParams.get('window') || '60m',
        now: now()
      });
      if (!workflow) {
        sendJson(res, 404, {
          error: 'not_found',
          details: `unknown agent ${agentId}`
        });
        return true;
      }

      sendJson(res, 200, removeCorrelationFromWorkflow(workflow, staleSelectionCorrelationId));
      return true;
    }

    sendJson(res, 404, {
      error: 'not_found',
      details: `unknown agent ${agentId}`
    });
    return true;
  }

  const correlationMatch = pathname.match(/^\/correlations\/([^/]+)$/);
  if (correlationMatch) {
    const correlationId = decodeURIComponent(correlationMatch[1]);
    if (correlationId !== staleSelectionCorrelationId) {
      return false;
    }

    const requestCount = incrementScenarioCount(state, `correlation:${correlationId}`);
    if (requestCount >= 2) {
      sendJson(res, 404, {
        error: 'not_found',
        details: `unknown correlation ${correlationId}`
      });
      return true;
    }

    return false;
  }

  return false;
}

function removeAgentFromOverview(overview, removedAgentId) {
  const agents = overview.agents.filter((agent) => agent.agent_id !== removedAgentId);
  const zones = overview.zones.map((zone) => ({
    ...zone,
    occupants: zone.occupants.filter((occupant) => occupant.agent_id !== removedAgentId)
  }));
  const watchEdges = overview.watch_edges.filter(
    (edge) => edge.from_agent_id !== removedAgentId && edge.to_agent_id !== removedAgentId
  );

  return {
    ...overview,
    summary: buildOverviewSummary(agents),
    zones,
    watch_edges: watchEdges,
    agents
  };
}

function buildOverviewSummary(agents) {
  const severityBuckets = {
    normal: 0,
    yellow: 0,
    orange: 0,
    red: 0
  };

  let blockedCount = 0;
  let rebootRecommendedCount = 0;
  for (const agent of agents) {
    if (agent.effective_severity in severityBuckets) {
      severityBuckets[agent.effective_severity] += 1;
    }
    if (agent.current_state.trim().toLowerCase() === 'blocked') {
      blockedCount += 1;
    }
    if (agent.reboot_recommended) {
      rebootRecommendedCount += 1;
    }
  }

  return {
    agent_count: agents.length,
    blocked_count: blockedCount,
    reboot_recommended_count: rebootRecommendedCount,
    severity_buckets: severityBuckets
  };
}

function removeCorrelationFromWorkflow(workflow, removedCorrelationId) {
  const keepRecord = (record) => record.correlation_id !== removedCorrelationId;

  return {
    ...workflow,
    correlation_ids: workflow.correlation_ids.filter((value) => value !== removedCorrelationId),
    incidents: workflow.incidents.filter(keepRecord),
    interactions: workflow.interactions.filter(keepRecord),
    timeline: workflow.timeline.filter(keepRecord),
    detail: {
      ...workflow.detail,
      open_peer_watch_alerts: workflow.detail.open_peer_watch_alerts.filter(keepRecord),
      recent_events: workflow.detail.recent_events.filter(keepRecord),
      recent_interactions: workflow.detail.recent_interactions.filter(keepRecord),
      recent_incidents: workflow.detail.recent_incidents.filter(keepRecord),
      recent_handoffs: workflow.detail.recent_handoffs.filter(keepRecord),
      recent_reboots: workflow.detail.recent_reboots.filter(keepRecord)
    }
  };
}

function parseCookies(rawCookieHeader) {
  const cookieHeader = typeof rawCookieHeader === 'string' ? rawCookieHeader : '';
  if (!cookieHeader) {
    return {};
  }

  const cookies = {};
  for (const entry of cookieHeader.split(';')) {
    const [rawName, ...rawValueParts] = entry.trim().split('=');
    if (!rawName) {
      continue;
    }

    const rawValue = rawValueParts.join('=');
    try {
      cookies[rawName] = decodeURIComponent(rawValue);
    } catch {
      cookies[rawName] = rawValue;
    }
  }

  return cookies;
}

function getScenarioState({ scenario, runId }) {
  const stateKey = `${scenario}:${runId}`;
  const existing = scenarioStateByRun.get(stateKey);
  if (existing) {
    return existing;
  }

  const next = {
    startedAt: Date.now(),
    requestCounts: new Map()
  };
  scenarioStateByRun.set(stateKey, next);
  return next;
}

function incrementScenarioCount(state, key) {
  const nextCount = (state.requestCounts.get(key) || 0) + 1;
  state.requestCounts.set(key, nextCount);
  return nextCount;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8'
  });
  res.end(JSON.stringify(payload));
}

async function seedBrowserSmokeSlice(store) {
  await store.appendEvent(
    createEvent({
      eventId: 'evt_growth_review_started',
      ts: '2026-03-10T23:20:00.000Z',
      agentId: 'growth-revenue',
      actorId: 'team-lead',
      eventType: 'review_started',
      currentState: 'reviewing',
      activeTask: 'Prepare handoff notes',
      summary: 'Lead started reviewing the growth handoff notes',
      severity: 'yellow',
      correlationId: 'corr-growth-lead-review',
      counterpartyAgentIds: ['team-lead'],
      evidenceRefs: ['/tmp/growth-review-start.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_growth_review_completed',
      ts: '2026-03-10T23:25:00.000Z',
      agentId: 'growth-revenue',
      actorId: 'team-lead',
      eventType: 'review_completed',
      currentState: 'planning',
      activeTask: 'Prepare handoff notes',
      summary: 'Lead completed the review of the growth handoff notes',
      severity: 'yellow',
      correlationId: 'corr-growth-lead-review',
      counterpartyAgentIds: ['team-lead'],
      evidenceRefs: ['/tmp/growth-review-complete.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_revenue_handoff_completed',
      ts: '2026-03-10T23:40:00.000Z',
      agentId: 'growth-revenue',
      actorId: 'team-lead',
      eventType: 'agent_handoff_completed',
      currentState: 'planning',
      activeTask: 'Prepare handoff notes',
      summary: 'Lead completed the revenue handoff',
      severity: 'yellow',
      correlationId: 'corr-revenue-handoff',
      counterpartyAgentIds: ['app-engineering'],
      evidenceRefs: ['/tmp/revenue-handoff.md']
    })
  );

  await store.appendHeartbeat({
    agent_id: 'team-lead',
    received_at: '2026-03-10T23:59:30.000Z',
    current_state: 'reviewing',
    active_task: 'Coordinate the office shell',
    current_location: 'lead-desk',
    last_meaningful_output_at: '2026-03-10T23:59:00.000Z',
    last_file_write_at: '2026-03-10T23:58:00.000Z',
    current_blocker: '',
    confidence_level: 'high',
    reboot_recommended: false
  });

  await store.appendHeartbeat({
    agent_id: 'growth-revenue',
    received_at: '2026-03-10T23:58:30.000Z',
    current_state: 'planning',
    active_task: 'Prepare handoff notes',
    current_location: 'meeting-zone',
    last_meaningful_output_at: '2026-03-10T23:58:00.000Z',
    last_file_write_at: '2026-03-10T23:57:00.000Z',
    current_blocker: '',
    confidence_level: 'high',
    reboot_recommended: false
  });
}

function createEvent({
  eventId,
  ts,
  agentId,
  actorId,
  eventType,
  currentState,
  activeTask,
  summary,
  severity,
  correlationId,
  counterpartyAgentIds,
  evidenceRefs
}) {
  return {
    event_id: eventId,
    ts,
    agent_id: agentId,
    actor_id: actorId,
    agent_role: agentId === 'team-lead' ? 'lead' : agentId,
    event_type: eventType,
    current_state: currentState,
    active_task: activeTask,
    location: agentId === 'team-lead' ? 'lead-desk' : 'meeting-zone',
    summary,
    severity,
    correlation_id: correlationId,
    counterparty_agent_ids: counterpartyAgentIds,
    evidence_refs: evidenceRefs,
    source_kind: 'controller_event',
    metadata: {}
  };
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
