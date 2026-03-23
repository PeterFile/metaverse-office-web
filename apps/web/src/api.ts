import type {
  AgentWorkflow,
  CorrelationDrilldown,
  IncidentFeedResponse,
  OfficeOperations,
  OfficeOverview,
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

export async function fetchOfficeOperations(
  options: { limit?: number; state?: string; agentId?: string; signal?: AbortSignal } = {}
): Promise<OfficeOperations> {
  const params = new URLSearchParams();
  if (options.limit !== undefined) {
    params.set('limit', String(options.limit));
  }
  if (options.state) {
    params.set('state', options.state);
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
  options: { limit?: number; window?: string; signal?: AbortSignal } = {}
): Promise<TimelineReplayResponse> {
  const params = new URLSearchParams({
    limit: String(options.limit ?? DEFAULT_WORKFLOW_LIMIT),
    window: options.window ?? DEFAULT_WORKFLOW_WINDOW
  });
  const response = await fetch(resolveApiUrl(`/timeline?${params.toString()}`), {
    signal: options.signal
  });

  return parseJson<TimelineReplayResponse>(response);
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

export { DEFAULT_WORKFLOW_LIMIT, DEFAULT_WORKFLOW_WINDOW };
