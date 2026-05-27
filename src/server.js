const http = require('node:http');

const { getAgentById, validateEventPayload, validateHeartbeatPayload } = require('./domain');
const { createControllerSnapshotCollector } = require('./collectors/controller-snapshot');

const INTERNAL_ERROR_DETAIL = 'internal_error';
const MAX_PUBLIC_ERROR_DETAIL_LENGTH = 200;

function getSourceEvidenceQuery(searchParams, { sourceStatusAlias = false } = {}) {
  const sourceStatus = searchParams.get('source_status');

  return {
    source_kind: searchParams.get('source_kind'),
    evidence_role: searchParams.get('evidence_role'),
    output_candidate: searchParams.get('output_candidate'),
    source_status: sourceStatusAlias ? sourceStatus || searchParams.get('status') : sourceStatus,
    collector_snapshot_id: searchParams.get('collector_snapshot_id'),
    correlation_id: searchParams.get('correlation_id'),
    mapped: searchParams.get('mapped'),
    observed_since: searchParams.get('observed_since'),
    observed_until: searchParams.get('observed_until'),
    collected_since: searchParams.get('collected_since'),
    collected_until: searchParams.get('collected_until'),
    newest_first: searchParams.get('newest_first'),
    limit: searchParams.get('limit')
  };
}

function createAppServer({
  store,
  now = () => new Date().toISOString(),
  controllerSnapshotCollector = createControllerSnapshotCollector(),
  allowedOrigins = []
}) {
  return http.createServer((req, res) => {
    handleRequest({ req, res, store, now, controllerSnapshotCollector, allowedOrigins }).catch((error) => {
      const publicError = formatPublicError(error);
      sendJson(res, publicError.statusCode, {
        error: publicError.error,
        details: publicError.details
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

  if (method === 'GET' && pathname === '/agents/evidence-spine/summary') {
    sendJson(res, 200, {
      item: store.getAgentEvidenceSpineSummary(
        getSourceEvidenceQuery(url.searchParams, { sourceStatusAlias: true })
      )
    });
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

  const agentEvidenceSpineMatch = pathname.match(/^\/agents\/([^/]+)\/evidence-spine$/);
  if (method === 'GET' && agentEvidenceSpineMatch) {
    const agentId = decodeURIComponent(agentEvidenceSpineMatch[1]);
    const item = store.getAgentEvidenceSpine(
      agentId,
      getSourceEvidenceQuery(url.searchParams, { sourceStatusAlias: true })
    );

    if (!item) {
      sendJson(res, 404, {
        error: 'not_found',
        details: `unknown agent ${agentId}`
      });
      return;
    }

    sendJson(res, 200, { item });
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
        details: 'one of event_id, evidence_id, evidence_ref, correlation_id, or agent_id is required'
      });
      return;
    }

    sendJson(res, 200, store.getAccountabilityReplay({
      event_id: getSearchValue(url.searchParams, 'event_id'),
      evidence_id: getSearchValue(url.searchParams, 'evidence_id'),
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

  if (method === 'GET' && pathname === '/accountability/replay/checkpoint-summary') {
    sendJson(res, 200, {
      item: store.getReplayCheckpointSummary()
    });
    return;
  }

  if (method === 'GET' && pathname === '/accountability/replay/checkpoint-log') {
    sendJson(res, 200, {
      items: store.listReplayCheckpointLog({
        limit: url.searchParams.get('limit'),
        record_kind: url.searchParams.get('record_kind'),
        evidence_id: url.searchParams.get('evidence_id'),
        collector_snapshot_id: url.searchParams.get('collector_snapshot_id'),
        correlation_id: url.searchParams.get('correlation_id'),
        source_kind: url.searchParams.get('source_kind')
      })
    });
    return;
  }

  if (method === 'GET' && pathname === '/storage/replay-manifest') {
    sendJson(res, 200, {
      item: store.getStorageReplayManifest()
    });
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
        collector_snapshot_id: url.searchParams.get('collector_snapshot_id'),
        agent_id: url.searchParams.get('agent_id'),
        source_kind: url.searchParams.get('source_kind'),
        status: url.searchParams.get('status'),
        limit: url.searchParams.get('limit')
      })
    });
    return;
  }

  if (method === 'GET' && pathname === '/collectors/controller-snapshot/history') {
    sendJson(res, 200, {
      item: store.getCollectorSnapshotHistorySummary({
        collector_snapshot_id: url.searchParams.get('collector_snapshot_id'),
        agent_id: url.searchParams.get('agent_id'),
        source_kind: url.searchParams.get('source_kind'),
        status: url.searchParams.get('status'),
        collected_since: url.searchParams.get('collected_since'),
        collected_until: url.searchParams.get('collected_until'),
        limit: url.searchParams.get('limit')
      })
    });
    return;
  }

  if (method === 'GET' && pathname === '/collectors/controller-snapshot/diff') {
    sendJson(res, 200, {
      item: store.getCollectorSnapshotDiff({
        from_collector_snapshot_id:
          url.searchParams.get('from_collector_snapshot_id') || url.searchParams.get('from'),
        to_collector_snapshot_id:
          url.searchParams.get('to_collector_snapshot_id') || url.searchParams.get('to'),
        limit: url.searchParams.get('limit')
      })
    });
    return;
  }

  if (method === 'GET' && pathname === '/evidence-records') {
    sendJson(res, 200, {
      items: store.listEvidenceRecords({
        evidence_id: url.searchParams.get('evidence_id'),
        agent_id: url.searchParams.get('agent_id'),
        evidence_ref: url.searchParams.get('evidence_ref'),
        ...getSourceEvidenceQuery(url.searchParams)
      })
    });
    return;
  }

  if (method === 'GET' && pathname === '/runtime/source-gaps') {
    sendJson(res, 200, {
      items: store.listRuntimeSourceGaps({
        evidence_id: url.searchParams.get('evidence_id'),
        agent_id: url.searchParams.get('agent_id'),
        ...getSourceEvidenceQuery(url.searchParams)
      })
    });
    return;
  }

  if (method === 'GET' && pathname === '/runtime/source-gaps/summary') {
    sendJson(res, 200, {
      item: store.getRuntimeSourceGapsSummary({
        evidence_id: url.searchParams.get('evidence_id'),
        agent_id: url.searchParams.get('agent_id'),
        ...getSourceEvidenceQuery(url.searchParams)
      })
    });
    return;
  }

  if (method === 'GET' && pathname === '/runtime/source-gaps/agent-summary') {
    sendJson(res, 200, {
      item: store.getRuntimeSourceGapAgentSummary({
        evidence_id: url.searchParams.get('evidence_id'),
        agent_id: url.searchParams.get('agent_id'),
        ...getSourceEvidenceQuery(url.searchParams)
      })
    });
    return;
  }

  if (method === 'GET' && pathname === '/runtime/source-gaps/lifecycle') {
    sendJson(res, 200, {
      item: store.getRuntimeSourceGapLifecycle({
        evidence_id: url.searchParams.get('evidence_id'),
        agent_id: url.searchParams.get('agent_id'),
        ...getSourceEvidenceQuery(url.searchParams)
      })
    });
    return;
  }

  if (method === 'GET' && pathname === '/runtime/source-gaps/trend') {
    sendJson(res, 200, {
      item: store.getRuntimeSourceGapTrend({
        evidence_id: url.searchParams.get('evidence_id'),
        agent_id: url.searchParams.get('agent_id'),
        ...getSourceEvidenceQuery(url.searchParams),
        bucket: url.searchParams.get('bucket')
      })
    });
    return;
  }

  if (method === 'GET' && pathname === '/evidence-records/facets') {
    sendJson(res, 200, {
      item: store.getEvidenceRecordFacets({
        evidence_id: url.searchParams.get('evidence_id'),
        agent_id: url.searchParams.get('agent_id'),
        evidence_ref: url.searchParams.get('evidence_ref'),
        ...getSourceEvidenceQuery(url.searchParams)
      })
    });
    return;
  }

  if (method === 'GET' && pathname === '/evidence-records/summary') {
    sendJson(res, 200, {
      item: store.getEvidenceRecordsSummary({
        evidence_id: url.searchParams.get('evidence_id'),
        agent_id: url.searchParams.get('agent_id'),
        evidence_ref: url.searchParams.get('evidence_ref'),
        ...getSourceEvidenceQuery(url.searchParams)
      })
    });
    return;
  }

  if (method === 'GET' && pathname === '/evidence-records/ref-rollup') {
    sendJson(res, 200, {
      item: store.getEvidenceRefRollup({
        evidence_id: url.searchParams.get('evidence_id'),
        agent_id: url.searchParams.get('agent_id'),
        evidence_ref: url.searchParams.get('evidence_ref'),
        ...getSourceEvidenceQuery(url.searchParams)
      })
    });
    return;
  }

  const evidenceProvenanceBundleMatch = pathname.match(
    /^\/evidence-records\/([^/]+)\/provenance-bundle$/
  );
  if (method === 'GET' && evidenceProvenanceBundleMatch) {
    const evidenceId = decodeURIComponent(evidenceProvenanceBundleMatch[1]);
    const provenanceBundle = store.getEvidenceProvenanceBundle(evidenceId);
    if (!provenanceBundle) {
      sendJson(res, 404, {
        error: 'not_found',
        details: `unknown evidence record ${evidenceId}`
      });
      return;
    }

    sendJson(res, 200, { item: provenanceBundle });
    return;
  }

  const evidenceSourceContextMatch = pathname.match(
    /^\/evidence-records\/([^/]+)\/source-context$/
  );
  if (method === 'GET' && evidenceSourceContextMatch) {
    const evidenceId = decodeURIComponent(evidenceSourceContextMatch[1]);
    const sourceContext = store.getEvidenceSourceContext(evidenceId);
    if (!sourceContext) {
      sendJson(res, 404, {
        error: 'not_found',
        details: 'unknown evidence record'
      });
      return;
    }

    sendJson(res, 200, { item: sourceContext });
    return;
  }

  const evidenceRecordMatch = pathname.match(/^\/evidence-records\/([^/]+)$/);
  if (method === 'GET' && evidenceRecordMatch) {
    const evidenceId = decodeURIComponent(evidenceRecordMatch[1]);
    const evidenceRecord = store.getEvidenceRecord(evidenceId);
    if (!evidenceRecord) {
      sendJson(res, 404, {
        error: 'not_found',
        details: `unknown evidence record ${evidenceId}`
      });
      return;
    }

    sendJson(res, 200, { item: evidenceRecord });
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
  return ['event_id', 'evidence_id', 'evidence_ref', 'correlation_id', 'agent_id'].some((name) =>
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
    error.publicDetails = 'invalid_json';
    throw error;
  }
}

function formatPublicError(error) {
  const statusCode = normalizeStatusCode(error?.statusCode);

  if (statusCode < 500) {
    const publicError = sanitizePublicErrorLabel(error?.publicMessage) || 'bad_request';
    const details = sanitizePublicErrorDetails(error?.publicDetails || error?.details || error?.message);
    return {
      statusCode,
      error: publicError,
      details: hasPublicErrorLeak(details) ? publicError : details || publicError
    };
  }

  const knownDetails = sanitizeKnownInternalErrorDetails(error?.publicDetails || error?.message);
  return {
    statusCode,
    error: 'internal_error',
    details: knownDetails || INTERNAL_ERROR_DETAIL
  };
}

function normalizeStatusCode(statusCode) {
  return Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599
    ? statusCode
    : 500;
}

function sanitizePublicErrorLabel(value) {
  const label = typeof value === 'string' ? value.trim() : '';
  return /^[a-z][a-z0-9_]{0,63}$/.test(label) ? label : null;
}

function sanitizeKnownInternalErrorDetails(value) {
  if (!isKnownSafeInternalError(value)) {
    return null;
  }

  const details = sanitizeKnownInternalDetails(value);
  return hasPublicErrorLeak(details) ? null : details;
}

function isKnownSafeInternalError(value) {
  if (typeof value !== 'string') {
    return false;
  }

  return (
    value.startsWith('Invalid task evidence input:') ||
    value.startsWith('Invalid Hermes runtime source') ||
    value.startsWith('Invalid Hermes runtime sources') ||
    value.startsWith('Unable to stat Hermes runtime source input ') ||
    value.startsWith('Unable to read Hermes runtime sources file') ||
    value.startsWith('Hermes runtime source input ') ||
    value.startsWith('Hermes runtime sources file ')
  );
}

function sanitizeKnownInternalDetails(value) {
  const details = sanitizePublicErrorDetails(value);
  if (typeof details !== 'string') {
    return '';
  }

  return details
    .replace(/\b(?:file|tmux|hermes):\/\/\S+/gi, '[redacted-uri]')
    .replace(/\bhttps?:\/\/\S+/gi, '[redacted-uri]')
    .replace(/(?:^|\s)(?:\/Users\/|\/Volumes\/|\/private\/|\/tmp\/|~\/)[^\s,;)]+/g, ' [redacted-path]')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizePublicErrorDetails(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizePublicErrorDetails).filter(Boolean);
  }

  if (value && typeof value === 'object') {
    return INTERNAL_ERROR_DETAIL;
  }

  const details = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (!details) {
    return '';
  }

  return details.slice(0, MAX_PUBLIC_ERROR_DETAIL_LENGTH);
}

function hasPublicErrorLeak(value) {
  if (Array.isArray(value)) {
    return value.some(hasPublicErrorLeak);
  }

  if (typeof value !== 'string') {
    return false;
  }

  return (
    /(?:^|[\s"'(])(?:\/Users\/|\/Volumes\/|\/private\/|\/tmp\/|~\/|[A-Za-z]:\\)/.test(value) ||
    /\b(?:file|tmux|hermes|https?):\/\//i.test(value) ||
    /\b(?:session|profile)_(?:id|ref)\b/i.test(value) ||
    /\b(?:token|webhook|callback|secret|api[_-]?key|authorization|bearer)\b\s*[:=]/i.test(value) ||
    /\braw[_-]?payload\b/i.test(value) ||
    /\b(?:control[_-]?plane|append(?:ed)?|write|delete|update)\b/i.test(value) ||
    /[{}]/.test(value)
  );
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8'
  });
  res.end(JSON.stringify(payload));
}

module.exports = {
  createAppServer,
  formatPublicError,
  handleRequest,
  readJsonBody,
  sendJson
};
