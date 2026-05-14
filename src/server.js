const http = require('node:http');

const { getAgentById, validateEventPayload, validateHeartbeatPayload } = require('./domain');
const { createControllerSnapshotCollector } = require('./collectors/controller-snapshot');

function createAppServer({
  store,
  now = () => new Date().toISOString(),
  controllerSnapshotCollector = createControllerSnapshotCollector(),
  allowedOrigins = []
}) {
  return http.createServer((req, res) => {
    handleRequest({ req, res, store, now, controllerSnapshotCollector, allowedOrigins }).catch((error) => {
      sendJson(res, error.statusCode || 500, {
        error: error.publicMessage || 'internal_error',
        details: error.details || error.message
      });
    });
  });
}

async function handleRequest({ req, res, store, now, controllerSnapshotCollector, allowedOrigins }) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const pathname = url.pathname;
  const method = req.method || 'GET';

  const origin = req.headers['origin'];
  if (origin) {
    res.setHeader('Vary', 'Origin');
  }
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); // Allow Content-Type header
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS'); // Read-only CORS surface

    // Handle preflight OPTIONS requests for read-only access only
    if (method === 'OPTIONS') {
      const requestedMethod = req.headers['access-control-request-method'];
      if (requestedMethod && requestedMethod !== 'GET') {
        res.writeHead(405);
        res.end();
        return;
      }
      res.writeHead(204); // No Content
      res.end();
      return;
    }
  }

  if (method === 'GET' && pathname === '/health') {
    sendJson(res, 200, {
      status: 'ok',
      now: now(),
      ...store.getCounts()
    });
    return;
  }

  if (method === 'GET' && pathname === '/agents') {
    sendJson(res, 200, { items: store.listAgents() });
    return;
  }

  if (method === 'GET' && pathname === '/office/overview') {
    sendJson(res, 200, store.getOfficeOverview({ now: now() }));
    return;
  }

  if (method === 'GET' && pathname === '/office/operations') {
    sendJson(res, 200, store.getOfficeOperations({
      now: now(),
      agent_id: url.searchParams.get('agent_id'),
      state: url.searchParams.get('state'),
      severity: url.searchParams.get('severity'),
      limit: url.searchParams.get('limit')
    }));
    return;
  }

  const agentEventsMatch = pathname.match(/^\/agents\/([^/]+)\/events$/);
  if (method === 'GET' && agentEventsMatch) {
    const agentId = decodeURIComponent(agentEventsMatch[1]);
    const agent = getAgentById(agentId);
    if (!agent) {
      sendJson(res, 404, {
        error: 'not_found',
        details: `unknown agent ${agentId}`
      });
      return;
    }

    sendJson(res, 200, {
      agent_id: agentId,
      items: store.listAgentEvents(agentId, {
        event_type: url.searchParams.get('event_type'),
        severity: url.searchParams.get('severity'),
        source_kind: url.searchParams.get('source_kind'),
        evidence_ref: url.searchParams.get('evidence_ref'),
        correlation_id: url.searchParams.get('correlation_id'),
        limit: url.searchParams.get('limit')
      })
    });
    return;
  }

  const agentInteractionsMatch = pathname.match(/^\/agents\/([^/]+)\/interactions$/);
  if (method === 'GET' && agentInteractionsMatch) {
    const agentId = decodeURIComponent(agentInteractionsMatch[1]);
    const agent = getAgentById(agentId);
    if (!agent) {
      sendJson(res, 404, {
        error: 'not_found',
        details: `unknown agent ${agentId}`
      });
      return;
    }

    sendJson(res, 200, {
      agent_id: agentId,
      items: store.listAgentInteractions(agentId, {
        event_id: url.searchParams.get('event_id'),
        evidence_ref: url.searchParams.get('evidence_ref'),
        interaction_type: url.searchParams.get('interaction_type'),
        counterparty_agent_id: url.searchParams.get('counterparty_agent_id'),
        severity: url.searchParams.get('severity'),
        correlation_id: url.searchParams.get('correlation_id'),
        limit: url.searchParams.get('limit'),
        window: url.searchParams.get('window'),
        now: now()
      })
    });
    return;
  }

  const agentIncidentsMatch = pathname.match(/^\/agents\/([^/]+)\/incidents$/);
  if (method === 'GET' && agentIncidentsMatch) {
    const agentId = decodeURIComponent(agentIncidentsMatch[1]);
    const agent = getAgentById(agentId);
    if (!agent) {
      sendJson(res, 404, {
        error: 'not_found',
        details: `unknown agent ${agentId}`
      });
      return;
    }

    sendJson(res, 200, {
      agent_id: agentId,
      items: store.listIncidents({
        agent_id: agentId,
        kind: url.searchParams.get('kind'),
        severity: url.searchParams.get('severity'),
        status: url.searchParams.get('status'),
        correlation_id: url.searchParams.get('correlation_id'),
        limit: url.searchParams.get('limit'),
        window: url.searchParams.get('window'),
        now: now()
      })
    });
    return;
  }

  const agentWorkflowMatch = pathname.match(/^\/agents\/([^/]+)\/workflow$/);
  if (method === 'GET' && agentWorkflowMatch) {
    const agentId = decodeURIComponent(agentWorkflowMatch[1]);
    const item = store.getAgentWorkflow(agentId, {
      limit: url.searchParams.get('limit'),
      window: url.searchParams.get('window') || '60m',
      now: now()
    });

    if (!item) {
      sendJson(res, 404, {
        error: 'not_found',
        details: `unknown agent ${agentId}`
      });
      return;
    }

    sendJson(res, 200, item);
    return;
  }

  const agentMatch = pathname.match(/^\/agents\/([^/]+)$/);
  if (method === 'GET' && agentMatch) {
    const agentId = decodeURIComponent(agentMatch[1]);
    const agent = store.getAgentDetail(agentId, {
      limit: url.searchParams.get('limit'),
      now: now()
    });

    if (!agent) {
      sendJson(res, 404, {
        error: 'not_found',
        details: `unknown agent ${agentId}`
      });
      return;
    }

    sendJson(res, 200, { item: agent });
    return;
  }

  if (method === 'GET' && pathname === '/events') {
    sendJson(res, 200, {
      items: store.listEvents({
        event_id: url.searchParams.get('event_id'),
        agent_id: url.searchParams.get('agent_id'),
        event_type: url.searchParams.get('event_type'),
        severity: url.searchParams.get('severity'),
        source_kind: url.searchParams.get('source_kind'),
        evidence_ref: url.searchParams.get('evidence_ref'),
        correlation_id: url.searchParams.get('correlation_id'),
        limit: url.searchParams.get('limit')
      })
    });
    return;
  }

  if (method === 'GET' && pathname === '/interactions') {
    sendJson(res, 200, {
      items: store.listInteractions({
        event_id: url.searchParams.get('event_id'),
        evidence_ref: url.searchParams.get('evidence_ref'),
        interaction_type: url.searchParams.get('interaction_type'),
        counterparty_agent_id: url.searchParams.get('counterparty_agent_id'),
        severity: url.searchParams.get('severity'),
        correlation_id: url.searchParams.get('correlation_id'),
        limit: url.searchParams.get('limit'),
        window: url.searchParams.get('window'),
        now: now()
      })
    });
    return;
  }

  if (method === 'GET' && pathname === '/timeline') {
    sendJson(res, 200, {
      items: store.listTimeline({
        window: url.searchParams.get('window') || '60m',
        event_id: url.searchParams.get('event_id'),
        agent_id: url.searchParams.get('agent_id'),
        event_type: url.searchParams.get('event_type'),
        severity: url.searchParams.get('severity'),
        source_kind: url.searchParams.get('source_kind'),
        evidence_ref: url.searchParams.get('evidence_ref'),
        correlation_id: url.searchParams.get('correlation_id'),
        limit: url.searchParams.get('limit'),
        now: now()
      })
    });
    return;
  }

  if (method === 'GET' && pathname === '/accountability/replay') {
    if (!hasReplayAnchor(url.searchParams)) {
      sendJson(res, 400, {
        error: 'missing_replay_anchor',
        details: 'one of event_id, evidence_ref, correlation_id, or agent_id is required'
      });
      return;
    }

    sendJson(res, 200, store.getAccountabilityReplay({
      event_id: getSearchValue(url.searchParams, 'event_id'),
      evidence_ref: getSearchValue(url.searchParams, 'evidence_ref'),
      correlation_id: getSearchValue(url.searchParams, 'correlation_id'),
      agent_id: getSearchValue(url.searchParams, 'agent_id'),
      source_kind: getSearchValue(url.searchParams, 'source_kind'),
      artifact_kind: getSearchValue(url.searchParams, 'artifact_kind'),
      limit: url.searchParams.get('limit') || '10',
      window: url.searchParams.get('window') || '60m',
      now: now()
    }));
    return;
  }

  if (method === 'GET' && pathname === '/peer-watch/alerts') {
    sendJson(res, 200, {
      items: store.listPeerWatchAlerts({
        severity: url.searchParams.get('severity'),
        status: url.searchParams.get('status'),
        target_agent_id: url.searchParams.get('target_agent_id'),
        agent_id: url.searchParams.get('agent_id'),
        watcher_agent_id: url.searchParams.get('watcher_agent_id'),
        observer_agent_id: url.searchParams.get('observer_agent_id'),
        correlation_id: url.searchParams.get('correlation_id'),
        limit: url.searchParams.get('limit')
      })
    });
    return;
  }

  if (method === 'GET' && pathname === '/incidents') {
    sendJson(res, 200, {
      items: store.listIncidents({
        kind: url.searchParams.get('kind'),
        agent_id: url.searchParams.get('agent_id'),
        severity: url.searchParams.get('severity'),
        status: url.searchParams.get('status'),
        correlation_id: url.searchParams.get('correlation_id'),
        limit: url.searchParams.get('limit'),
        window: url.searchParams.get('window'),
        now: now()
      })
    });
    return;
  }

  const correlationMatch = pathname.match(/^\/correlations\/([^/]+)$/);
  if (method === 'GET' && correlationMatch) {
    const correlationId = decodeURIComponent(correlationMatch[1]);
    const item = store.getCorrelationDrilldown(correlationId, {
      limit: url.searchParams.get('limit'),
      window: url.searchParams.get('window'),
      now: now()
    });

    if (!item) {
      sendJson(res, 404, {
        error: 'not_found',
        details: `unknown correlation ${correlationId}`
      });
      return;
    }

    sendJson(res, 200, item);
    return;
  }

  if (method === 'GET' && pathname === '/handoffs') {
    sendJson(res, 200, { items: store.listHandoffs() });
    return;
  }

  if (method === 'GET' && pathname === '/collectors/controller-snapshot') {
    sendJson(res, 200, {
      item: store.getLatestCollectorReport()
    });
    return;
  }

  if (method === 'GET' && pathname === '/collectors/controller-snapshot/evidence-coverage') {
    sendJson(res, 200, {
      item: store.getLatestCollectorEvidenceCoverage({
        agent_id: url.searchParams.get('agent_id'),
        source_kind: url.searchParams.get('source_kind'),
        confidence_level: url.searchParams.get('confidence_level'),
        limit: url.searchParams.get('limit')
      })
    });
    return;
  }

  if (method === 'GET' && pathname === '/collectors/controller-snapshot/source-health') {
    sendJson(res, 200, {
      item: store.getLatestCollectorSourceHealth({
        agent_id: url.searchParams.get('agent_id'),
        source_kind: url.searchParams.get('source_kind'),
        status: url.searchParams.get('status'),
        limit: url.searchParams.get('limit')
      })
    });
    return;
  }

  if (method === 'GET' && pathname === '/memory/artifacts') {
    sendJson(res, 200, {
      generated_at: now(),
      items: store.listMemoryArtifacts({
        window: url.searchParams.get('window') || '60m',
        agent_id: url.searchParams.get('agent_id'),
        correlation_id: url.searchParams.get('correlation_id'),
        artifact_ref: url.searchParams.get('artifact_ref'),
        event_type: url.searchParams.get('event_type'),
        severity: url.searchParams.get('severity'),
        source_kind: url.searchParams.get('source_kind'),
        artifact_kind: url.searchParams.get('artifact_kind'),
        limit: url.searchParams.get('limit'),
        now: now()
      })
    });
    return;
  }

  if (method === 'GET' && pathname === '/reboots') {
    sendJson(res, 200, { items: store.listReboots() });
    return;
  }

  if (method === 'POST' && pathname === '/events') {
    const actorId = getActorId(req);
    if (!actorId) {
      sendJson(res, 400, {
        error: 'missing_actor_id',
        details: 'x-actor-id header is required for controlled writes'
      });
      return;
    }

    const payload = await readJsonBody(req);
    const validation = validateEventPayload(payload, { actorId });

    if (!validation.ok) {
      sendJson(res, 422, {
        error: 'validation_failed',
        details: validation.errors
      });
      return;
    }

    const event = await store.appendEvent(validation.value);
    sendJson(res, 201, { item: event });
    return;
  }

  if (method === 'POST' && pathname === '/heartbeats') {
    const actorId = getActorId(req);
    if (!actorId) {
      sendJson(res, 400, {
        error: 'missing_actor_id',
        details: 'x-actor-id header is required for controlled writes'
      });
      return;
    }

    const payload = await readJsonBody(req);
    const validation = validateHeartbeatPayload(
      {
        ...payload,
        received_at: now()
      },
      { actorId }
    );

    if (!validation.ok) {
      sendJson(res, 422, {
        error: 'validation_failed',
        details: validation.errors
      });
      return;
    }

    const heartbeat = await store.appendHeartbeat(validation.value);
    sendJson(res, 201, { item: heartbeat });
    return;
  }

  if (method === 'POST' && pathname === '/collectors/controller-snapshot') {
    const actorId = getActorId(req);
    if (!actorId) {
      sendJson(res, 400, {
        error: 'missing_actor_id',
        details: 'x-actor-id header is required for controlled writes'
      });
      return;
    }

    if (actorId !== 'team-lead') {
      sendJson(res, 403, {
        error: 'forbidden_actor',
        details: 'controller snapshot collection requires x-actor-id: team-lead'
      });
      return;
    }

    await readJsonBody(req);
    const report = await controllerSnapshotCollector.collectSnapshot({
      actorId,
      collectedAt: now()
    });
    const storedReport = await store.appendCollectorReport(report);
    sendJson(res, 201, { item: storedReport });
    return;
  }

  sendJson(res, 404, {
    error: 'not_found',
    details: `${method} ${pathname} is not implemented`
  });
}

function hasReplayAnchor(searchParams) {
  return ['event_id', 'evidence_ref', 'correlation_id', 'agent_id'].some((name) =>
    Boolean(getSearchValue(searchParams, name))
  );
}

function getSearchValue(searchParams, name) {
  const value = searchParams.get(name);
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function getActorId(req) {
  const value = req.headers['x-actor-id'];
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  return null;
}

async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString('utf8');
  if (!body) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    error.statusCode = 400;
    error.publicMessage = 'invalid_json';
    throw error;
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8'
  });
  res.end(JSON.stringify(payload));
}

module.exports = {
  createAppServer,
  handleRequest,
  readJsonBody,
  sendJson
};
