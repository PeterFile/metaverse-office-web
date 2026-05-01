import type {
  AccountabilityReplayBundle,
  AgentEventsResponse,
  AgentInteractionsResponse,
  CollectorEvidenceCoverage,
  AgentWorkflow,
  CollectorSnapshot,
  CorrelationDrilldown,
  IncidentFeedResponse,
  MemoryArtifactIndex,
  OfficeOperations,
  OfficeOverview,
  PeerWatchAlertsResponse,
  ProblemResponse,
  TimelineReplayResponse
} from './types';

const DEFAULT_WORKFLOW_LIMIT = 10;
const DEFAULT_WORKFLOW_WINDOW = '60m';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim();

export class RequestError extends Error {
  status: number;
  code: string | null;

  constructor({
    message,
    status,
    code
  }: {
    message: string;
    status: number;
    code: string | null;
  }) {
    super(message);
    this.name = 'RequestError';
    this.status = status;
    this.code = code;
    Object.setPrototypeOf(this, RequestError.prototype);
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  let body: T | ProblemResponse;
  const contentType = response.headers.get('content-type');

  if (contentType && contentType.includes('application/json')) {
    try {
      body = (await response.json()) as T | ProblemResponse;
    } catch {
      throw new RequestError({
        message: 'request_failed: invalid_json_response',
        status: response.status,
        code: 'invalid_json_response'
      });
    }
  } else {
    throw new RequestError({
      message: 'request_failed: non_json_response',
      status: response.status,
      code: 'non_json_response'
    });
  }

  if (!response.ok) {
    const problem = body as ProblemResponse;
    throw new RequestError({
      message: problem.details || problem.error || 'request_failed',
      status: response.status,
      code: problem.error || null
    });
  }

  return body as T;
}

export function resolveApiUrl(path: string, apiBaseUrl = API_BASE_URL): string {
  const trimmedBaseUrl = apiBaseUrl?.trim();

  if (!trimmedBaseUrl) {
    return path;
  }

  return `${trimmedBaseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export async function fetchOfficeOverview(signal?: AbortSignal): Promise<OfficeOverview> {
  const response = await fetch(resolveApiUrl('/office/overview'), { signal });
  return parseJson<OfficeOverview>(response);
}

export async function fetchCollectorSnapshot(signal?: AbortSignal): Promise<CollectorSnapshot | null> {
  const response = await fetch(resolveApiUrl('/collectors/controller-snapshot'), { signal });
  const body = await parseJson<{ item: CollectorSnapshot | null }>(response);
  return body.item;
}

export async function fetchCollectorEvidenceCoverage(
  options: {
    agentId?: string;
    sourceKind?: string;
    confidenceLevel?: string;
    limit?: number;
    signal?: AbortSignal;
  } = {}
): Promise<CollectorEvidenceCoverage | null> {
  const params = new URLSearchParams();
  if (options.agentId) {
    params.set('agent_id', options.agentId);
  }
  if (options.sourceKind) {
    params.set('source_kind', options.sourceKind);
  }
  if (options.confidenceLevel) {
    params.set('confidence_level', options.confidenceLevel);
  }
  if (options.limit !== undefined) {
    params.set('limit', String(options.limit));
  }

  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  const response = await fetch(
    resolveApiUrl(`/collectors/controller-snapshot/evidence-coverage${suffix}`),
    {
      signal: options.signal
    }
  );
  const body = await parseJson<{ item: CollectorEvidenceCoverage | null }>(response);
  return body.item;
}

export async function fetchOfficeOperations(
  options: {
    limit?: number;
    state?: string;
    severity?: string;
    agentId?: string;
    signal?: AbortSignal;
  } = {}
): Promise<OfficeOperations> {
  const params = new URLSearchParams();
  if (options.limit !== undefined) {
    params.set('limit', String(options.limit));
  }
  if (options.state) {
    params.set('state', options.state);
  }
  if (options.severity) {
    params.set('severity', options.severity);
  }
  if (options.agentId) {
    params.set('agent_id', options.agentId);
  }

  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  const response = await fetch(resolveApiUrl(`/office/operations${suffix}`), {
    signal: options.signal
  });
  return parseJson<OfficeOperations>(response);
}

export async function fetchAgentEvents(
  agentId: string,
  options: {
    limit?: number;
    eventType?: string;
    severity?: string;
    sourceKind?: string;
    evidenceRef?: string;
    correlationId?: string;
    signal?: AbortSignal;
  } = {}
): Promise<AgentEventsResponse> {
  const params = new URLSearchParams({
    limit: String(options.limit ?? DEFAULT_WORKFLOW_LIMIT)
  });

  if (options.eventType) {
    params.set('event_type', options.eventType);
  }
  if (options.severity) {
    params.set('severity', options.severity);
  }
  if (options.sourceKind) {
    params.set('source_kind', options.sourceKind);
  }
  if (options.evidenceRef) {
    params.set('evidence_ref', options.evidenceRef);
  }
  if (options.correlationId) {
    params.set('correlation_id', options.correlationId);
  }

  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  const response = await fetch(
    resolveApiUrl(`/agents/${encodeURIComponent(agentId)}/events${suffix}`),
    {
      signal: options.signal
    }
  );

  return parseJson<AgentEventsResponse>(response);
}

export async function fetchAgentInteractions(
  agentId: string,
  options: {
    limit?: number;
    window?: string;
    interactionType?: string;
    counterpartyAgentId?: string;
    severity?: string;
    correlationId?: string;
    eventId?: string;
    evidenceRef?: string;
    signal?: AbortSignal;
  } = {}
): Promise<AgentInteractionsResponse> {
  const params = new URLSearchParams({
    limit: String(options.limit ?? DEFAULT_WORKFLOW_LIMIT),
    window: options.window ?? DEFAULT_WORKFLOW_WINDOW
  });

  if (options.interactionType) {
    params.set('interaction_type', options.interactionType);
  }
  if (options.counterpartyAgentId) {
    params.set('counterparty_agent_id', options.counterpartyAgentId);
  }
  if (options.severity) {
    params.set('severity', options.severity);
  }
  if (options.correlationId) {
    params.set('correlation_id', options.correlationId);
  }
  if (options.eventId) {
    params.set('event_id', options.eventId);
  }
  if (options.evidenceRef) {
    params.set('evidence_ref', options.evidenceRef);
  }

  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  const response = await fetch(
    resolveApiUrl(`/agents/${encodeURIComponent(agentId)}/interactions${suffix}`),
    {
      signal: options.signal
    }
  );

  return parseJson<AgentInteractionsResponse>(response);
}

export async function fetchAgentIncidents(
  agentId: string,
  options: {
    kind?: string;
    severity?: string;
    status?: string;
    correlationId?: string;
    limit?: number;
    window?: string;
    signal?: AbortSignal;
  } = {}
): Promise<IncidentFeedResponse & { agent_id: string }> {
  const params = new URLSearchParams({
    limit: String(options.limit ?? DEFAULT_WORKFLOW_LIMIT),
    window: options.window ?? DEFAULT_WORKFLOW_WINDOW
  });

  if (options.kind) {
    params.set('kind', options.kind);
  }
  if (options.severity) {
    params.set('severity', options.severity);
  }
  if (options.status) {
    params.set('status', options.status);
  }
  if (options.correlationId) {
    params.set('correlation_id', options.correlationId);
  }

  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  const response = await fetch(
    resolveApiUrl(`/agents/${encodeURIComponent(agentId)}/incidents${suffix}`),
    {
      signal: options.signal
    }
  );

  return parseJson<IncidentFeedResponse & { agent_id: string }>(response);
}

export async function fetchAgentWorkflow(
  agentId: string,
  options: { limit?: number; window?: string; signal?: AbortSignal } = {}
): Promise<AgentWorkflow> {
  const params = new URLSearchParams({
    limit: String(options.limit ?? DEFAULT_WORKFLOW_LIMIT),
    window: options.window ?? DEFAULT_WORKFLOW_WINDOW
  });
  const response = await fetch(
    resolveApiUrl(`/agents/${encodeURIComponent(agentId)}/workflow?${params.toString()}`),
    {
      signal: options.signal
    }
  );

  return parseJson<AgentWorkflow>(response);
}

export async function fetchIncidents(
  options: { limit?: number; window?: string; signal?: AbortSignal } = {}
): Promise<IncidentFeedResponse> {
  const params = new URLSearchParams({
    limit: String(options.limit ?? DEFAULT_WORKFLOW_LIMIT),
    window: options.window ?? DEFAULT_WORKFLOW_WINDOW
  });
  const response = await fetch(resolveApiUrl(`/incidents?${params.toString()}`), {
    signal: options.signal
  });

  return parseJson<IncidentFeedResponse>(response);
}

export async function fetchTimeline(
  options: {
    limit?: number;
    window?: string;
    agentId?: string;
    eventType?: string;
    severity?: string;
    sourceKind?: string;
    evidenceRef?: string;
    correlationId?: string;
    eventId?: string;
    signal?: AbortSignal;
  } = {}
): Promise<TimelineReplayResponse> {
  const params = new URLSearchParams({
    limit: String(options.limit ?? DEFAULT_WORKFLOW_LIMIT),
    window: options.window ?? DEFAULT_WORKFLOW_WINDOW
  });

  if (options.agentId) {
    params.set('agent_id', options.agentId);
  }
  if (options.eventType) {
    params.set('event_type', options.eventType);
  }
  if (options.severity) {
    params.set('severity', options.severity);
  }
  if (options.sourceKind) {
    params.set('source_kind', options.sourceKind);
  }
  if (options.evidenceRef) {
    params.set('evidence_ref', options.evidenceRef);
  }
  if (options.correlationId) {
    params.set('correlation_id', options.correlationId);
  }
  if (options.eventId) {
    params.set('event_id', options.eventId);
  }

  const response = await fetch(resolveApiUrl(`/timeline?${params.toString()}`), {
    signal: options.signal
  });

  return parseJson<TimelineReplayResponse>(response);
}

export async function fetchAccountabilityReplay(
  options: {
    limit?: number;
    window?: string;
    eventId?: string;
    evidenceRef?: string;
    correlationId?: string;
    agentId?: string;
    signal?: AbortSignal;
  } = {}
): Promise<AccountabilityReplayBundle> {
  const params = new URLSearchParams({
    limit: String(options.limit ?? DEFAULT_WORKFLOW_LIMIT),
    window: options.window ?? DEFAULT_WORKFLOW_WINDOW
  });

  if (options.eventId) {
    params.set('event_id', options.eventId);
  }
  if (options.evidenceRef) {
    params.set('evidence_ref', options.evidenceRef);
  }
  if (options.correlationId) {
    params.set('correlation_id', options.correlationId);
  }
  if (options.agentId) {
    params.set('agent_id', options.agentId);
  }

  const response = await fetch(resolveApiUrl(`/accountability/replay?${params.toString()}`), {
    signal: options.signal
  });

  return parseJson<AccountabilityReplayBundle>(response);
}

export async function fetchPeerWatchAlerts(
  options: {
    status?: string;
    targetAgentId?: string;
    agentId?: string;
    watcherAgentId?: string;
    observerAgentId?: string;
    correlationId?: string;
    severity?: string;
    limit?: number;
    signal?: AbortSignal;
  } = {}
): Promise<PeerWatchAlertsResponse> {
  const params = new URLSearchParams();

  if (options.status) {
    params.set('status', options.status);
  }
  if (options.targetAgentId) {
    params.set('target_agent_id', options.targetAgentId);
  }
  if (options.agentId) {
    params.set('agent_id', options.agentId);
  }
  if (options.watcherAgentId) {
    params.set('watcher_agent_id', options.watcherAgentId);
  }
  if (options.observerAgentId) {
    params.set('observer_agent_id', options.observerAgentId);
  }
  if (options.correlationId) {
    params.set('correlation_id', options.correlationId);
  }
  if (options.severity) {
    params.set('severity', options.severity);
  }
  params.set('limit', String(options.limit ?? DEFAULT_WORKFLOW_LIMIT));

  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  const response = await fetch(resolveApiUrl(`/peer-watch/alerts${suffix}`), {
    signal: options.signal
  });

  return parseJson<PeerWatchAlertsResponse>(response);
}

export async function fetchCorrelationDrilldown(
  correlationId: string,
  options: { limit?: number; window?: string; signal?: AbortSignal } = {}
): Promise<CorrelationDrilldown> {
  const params = new URLSearchParams({
    limit: String(options.limit ?? DEFAULT_WORKFLOW_LIMIT),
    window: options.window ?? DEFAULT_WORKFLOW_WINDOW
  });
  const response = await fetch(
    resolveApiUrl(`/correlations/${encodeURIComponent(correlationId)}?${params.toString()}`),
    {
      signal: options.signal
    }
  );

  return parseJson<CorrelationDrilldown>(response);
}

export async function fetchMemoryArtifacts(
  options: {
    limit?: number;
    window?: string;
    agentId?: string;
    correlationId?: string;
    artifactRef?: string;
    eventType?: string;
    severity?: string;
    sourceKind?: string;
    artifactKind?: string;
    signal?: AbortSignal;
  } = {}
): Promise<MemoryArtifactIndex> {
  const params = new URLSearchParams({
    limit: String(options.limit ?? DEFAULT_WORKFLOW_LIMIT),
    window: options.window ?? DEFAULT_WORKFLOW_WINDOW
  });

  if (options.agentId) {
    params.set('agent_id', options.agentId);
  }

  if (options.correlationId) {
    params.set('correlation_id', options.correlationId);
  }

  if (options.artifactRef) {
    params.set('artifact_ref', options.artifactRef);
  }

  if (options.eventType) {
    params.set('event_type', options.eventType);
  }

  if (options.severity) {
    params.set('severity', options.severity);
  }

  if (options.sourceKind) {
    params.set('source_kind', options.sourceKind);
  }

  if (options.artifactKind) {
    params.set('artifact_kind', options.artifactKind);
  }

  const response = await fetch(resolveApiUrl(`/memory/artifacts?${params.toString()}`), {
    signal: options.signal
  });

  return parseJson<MemoryArtifactIndex>(response);
}

export { DEFAULT_WORKFLOW_LIMIT, DEFAULT_WORKFLOW_WINDOW };
