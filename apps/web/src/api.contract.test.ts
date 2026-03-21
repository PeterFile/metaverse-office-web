import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  AgentWorkflow,
  CorrelationDrilldown,
  IncidentFeedResponse,
  OfficeOperations,
  OfficeOverview
} from './types';

const require = createRequire(import.meta.url);
const { createAppServer } = require('../../../src/server.js') as {
  createAppServer: (options: { store: BackendStore; now: () => string }) => Server;
};
const { createPrototypeStore } = require('../../../src/store/prototype-store.js') as {
  createPrototypeStore: (options: { filePath: string }) => Promise<BackendStore>;
};

const repoRoot = resolveRepoRootFromTestFile(import.meta.url);
const scratchRoot = path.join(repoRoot, '.tmp');

type ApiModule = typeof import('./api');
type BackendStore = {
  appendEvent(event: BackendEvent): Promise<BackendEvent>;
  appendHeartbeat(heartbeat: BackendHeartbeat): Promise<BackendHeartbeat>;
};

interface BackendEvent {
  event_id: string;
  ts: string;
  agent_id: string;
  actor_id: string;
  agent_role: string;
  event_type: string;
  current_state: string;
  active_task: string;
  location: string;
  summary: string;
  severity: 'normal' | 'yellow' | 'orange' | 'red';
  correlation_id?: string;
  counterparty_agent_ids: string[];
  evidence_refs: string[];
  source_kind: 'controller_event' | 'workspace_file';
  metadata: Record<string, unknown>;
}

interface BackendHeartbeat {
  agent_id: string;
  received_at: string;
  current_state: string;
  active_task: string;
  current_location: string;
  last_meaningful_output_at: string;
  last_file_write_at: string;
  current_blocker: string;
  confidence_level: 'low' | 'medium' | 'high';
  reboot_recommended: boolean;
}

interface Harness {
  baseUrl: string;
  root: string;
  server: Server;
  store: BackendStore;
}

interface RequestContract {
  method: string;
  origin: string;
  pathname: string;
  query: Array<[string, string]>;
}

let harness: Harness | null = null;

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();

  if (harness) {
    await closeServer(harness.server);
    await rm(harness.root, { recursive: true, force: true });
    harness = null;
  }
});

describe('read-only frontend/backend contract smoke', () => {
  it('keeps scratch data under the repository .tmp directory derived from this test file', async () => {
    const expectedRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
    harness = await createHarness(() => '2026-03-09T19:00:00.000Z');

    expect(repoRoot).toBe(expectedRepoRoot);
    expect(scratchRoot).toBe(path.join(expectedRepoRoot, '.tmp'));
    expect(path.dirname(harness.root)).toBe(scratchRoot);
    expect(path.basename(harness.root)).toMatch(/^web-contract-/);
  });

  it('loads /office/overview, /office/operations, /agents/:id/workflow, /incidents, and /correlations/:id from the real backend', async () => {
    harness = await createHarness(() => '2026-03-09T19:00:00.000Z');
    await seedContractSlice(harness.store);

    const nativeFetch = globalThis.fetch.bind(globalThis);
    const requests: RequestContract[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        requests.push(getRequestContract(input, harness!.baseUrl, init));
        return nativeFetch(input, init);
      })
    );

    const api = await loadApi(harness.baseUrl);
    const [overview, operations, workflow, incidents, correlation] = await Promise.all([
      api.fetchOfficeOverview(),
      api.fetchOfficeOperations(),
      api.fetchAgentWorkflow('app-engineering'),
      api.fetchIncidents(),
      api.fetchCorrelationDrilldown('corr-contract')
    ]);

    expect(requests).toEqual([
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/office/overview',
        query: []
      },
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/office/operations',
        query: []
      },
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/agents/app-engineering/workflow',
        query: [
          ['limit', '10'],
          ['window', '60m']
        ]
      },
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/incidents',
        query: [
          ['limit', '10'],
          ['window', '60m']
        ]
      },
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/correlations/corr-contract',
        query: [
          ['limit', '10'],
          ['window', '60m']
        ]
      }
    ]);
    expectOverviewContract(overview);
    expectOperationsContract(operations);
    expectWorkflowContract(workflow);
    expectIncidentFeedContract(incidents);
    expectCorrelationContract(correlation);
  });

  it('surfaces unknown-agent workflow 404s through the frontend request parser against the real backend', async () => {
    harness = await createHarness(() => '2026-03-09T19:00:00.000Z');

    const nativeFetch = globalThis.fetch.bind(globalThis);
    const responses: Array<{
      status: number;
      contentType: string | null;
      body: {
        error?: string;
        details?: string;
      };
    }> = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const response = await nativeFetch(input, init);
        responses.push({
          status: response.status,
          contentType: response.headers.get('content-type'),
          body: (await response.clone().json()) as {
            error?: string;
            details?: string;
          }
        });
        return response;
      })
    );

    const api = await loadApi(harness.baseUrl);

    await expect(api.fetchAgentWorkflow('unknown-agent')).rejects.toMatchObject({
      name: 'RequestError',
      status: 404,
      code: 'not_found',
      message: 'unknown agent unknown-agent'
    });
    expect(responses).toHaveLength(1);
    expect(responses[0].status).toBe(404);
    expect(responses[0].contentType).toContain('application/json');
    expect(responses[0].body).toMatchObject({
      error: 'not_found',
      details: 'unknown agent unknown-agent'
    });
  });

  it('surfaces unknown-correlation drilldown 404s through the frontend request parser against the real backend', async () => {
    harness = await createHarness(() => '2026-03-09T19:00:00.000Z');

    const nativeFetch = globalThis.fetch.bind(globalThis);
    const responses: Array<{
      status: number;
      contentType: string | null;
      body: {
        error?: string;
        details?: string;
      };
    }> = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const response = await nativeFetch(input, init);
        responses.push({
          status: response.status,
          contentType: response.headers.get('content-type'),
          body: (await response.clone().json()) as {
            error?: string;
            details?: string;
          }
        });
        return response;
      })
    );

    const api = await loadApi(harness.baseUrl);

    await expect(api.fetchCorrelationDrilldown('unknown-correlation')).rejects.toMatchObject({
      name: 'RequestError',
      status: 404,
      code: 'not_found',
      message: 'unknown correlation unknown-correlation'
    });
    expect(responses).toHaveLength(1);
    expect(responses[0].status).toBe(404);
    expect(responses[0].contentType).toContain('application/json');
    expect(responses[0].body).toMatchObject({
      error: 'not_found',
      details: 'unknown correlation unknown-correlation'
    });
  });
});

async function createHarness(now: () => string): Promise<Harness> {
  await mkdir(scratchRoot, { recursive: true });

  const root = await mkdtemp(path.join(scratchRoot, 'web-contract-'));
  const storeFile = path.join(root, 'prototype-store.jsonl');
  const store = await createPrototypeStore({ filePath: storeFile });
  const server = createAppServer({ store, now });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed_to_bind_contract_server');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    root,
    server,
    store
  };
}

async function loadApi(baseUrl: string): Promise<ApiModule> {
  vi.stubEnv('VITE_API_BASE_URL', baseUrl);
  vi.resetModules();
  return import('./api');
}

function resolveRepoRootFromTestFile(testFileUrl: string): string {
  return path.resolve(path.dirname(fileURLToPath(testFileUrl)), '../../..');
}

function getRequestContract(
  input: Parameters<typeof fetch>[0],
  baseUrl: string,
  init?: Parameters<typeof fetch>[1]
): RequestContract {
  const url =
    typeof input === 'string' || input instanceof URL
      ? new URL(String(input), baseUrl)
      : new URL(input.url, baseUrl);

  url.searchParams.sort();

  return {
    method: typeof input === 'string' || input instanceof URL ? init?.method || 'GET' : input.method || 'GET',
    origin: url.origin,
    pathname: url.pathname,
    query: Array.from(url.searchParams.entries())
  };
}

async function seedContractSlice(store: BackendStore) {
  await store.appendEvent(
    createEvent({
      eventId: 'evt_contract_old_alert',
      ts: '2026-03-09T17:20:00.000Z',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Investigate the stale contract drift',
      summary: 'Old contract incident outside the default workflow window',
      severity: 'yellow',
      correlationId: 'corr-contract',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/contract-old-alert.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_contract_review_started',
      ts: '2026-03-09T18:40:00.000Z',
      eventType: 'review_started',
      currentState: 'reviewing',
      activeTask: 'Review the contract slice',
      summary: 'Lead started the contract review',
      severity: 'yellow',
      correlationId: 'corr-contract',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/contract-review-start.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_contract_review_completed',
      ts: '2026-03-09T18:42:00.000Z',
      eventType: 'review_completed',
      currentState: 'reviewing',
      activeTask: 'Review the contract slice',
      summary: 'Lead completed the contract review',
      severity: 'yellow',
      correlationId: 'corr-contract',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/contract-review-complete.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_contract_peer_watch',
      ts: '2026-03-09T18:45:00.000Z',
      eventType: 'peer_watch_alert_raised',
      currentState: 'blocked',
      activeTask: 'Fix the contract drift',
      summary: 'Protocol engineering flagged the contract drift',
      severity: 'orange',
      correlationId: 'corr-contract',
      counterpartyAgentIds: ['protocol-engineering'],
      evidenceRefs: ['/tmp/contract-peer-watch.md']
    })
  );

  await store.appendEvent(
    createEvent({
      eventId: 'evt_contract_handoff_completed',
      ts: '2026-03-09T18:48:00.000Z',
      eventType: 'agent_handoff_completed',
      currentState: 'planning',
      activeTask: 'Hand off the contract fix',
      summary: 'Lead completed the contract handoff',
      severity: 'yellow',
      correlationId: 'corr-contract',
      counterpartyAgentIds: ['growth-revenue'],
      evidenceRefs: ['/tmp/contract-handoff.md']
    })
  );

  await store.appendHeartbeat({
    agent_id: 'app-engineering',
    received_at: '2026-03-09T18:58:30.000Z',
    current_state: 'blocked',
    active_task: 'Fix the contract drift',
    current_location: 'desk-app-engineering',
    last_meaningful_output_at: '2026-03-09T18:58:00.000Z',
    last_file_write_at: '2026-03-09T18:57:00.000Z',
    current_blocker: 'Need review evidence',
    confidence_level: 'high',
    reboot_recommended: false
  });
}

function createEvent({
  eventId,
  ts,
  eventType,
  currentState,
  activeTask,
  summary,
  severity,
  correlationId,
  counterpartyAgentIds,
  evidenceRefs
}: {
  eventId: string;
  ts: string;
  eventType: string;
  currentState: string;
  activeTask: string;
  summary: string;
  severity: BackendEvent['severity'];
  correlationId: string;
  counterpartyAgentIds: string[];
  evidenceRefs: string[];
}): BackendEvent {
  return {
    event_id: eventId,
    ts,
    agent_id: 'app-engineering',
    actor_id: 'team-lead',
    agent_role: 'app-engineering',
    event_type: eventType,
    current_state: currentState,
    active_task: activeTask,
    location:
      eventType.startsWith('review') || eventType.startsWith('peer_watch')
        ? 'review-zone'
        : 'meeting-zone',
    summary,
    severity,
    correlation_id: correlationId,
    counterparty_agent_ids: counterpartyAgentIds,
    evidence_refs: evidenceRefs,
    source_kind: 'controller_event',
    metadata: {}
  };
}

function expectOverviewContract(overview: OfficeOverview) {
  expect(overview.generated_at).toBe('2026-03-09T19:00:00.000Z');
  expect(overview.summary.agent_count).toBeGreaterThanOrEqual(1);
  expect(overview.zones.length).toBeGreaterThan(0);
  expect(overview.watch_edges.length).toBeGreaterThan(0);
  expect(overview.agents).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        agent_id: 'app-engineering',
        current_location: 'desk-app-engineering',
        effective_severity: 'orange'
      })
    ])
  );
}

function expectOperationsContract(operations: OfficeOperations) {
  expect(operations.generated_at).toBe('2026-03-09T19:00:00.000Z');
  expect(operations.summary).toEqual({
    item_count: 2,
    blocked_count: 1,
    reboot_recommended_count: 0,
    state_buckets: {
      blocked: 1,
      reviewing: 1
    },
    severity_buckets: {
      normal: 1,
      yellow: 0,
      orange: 1,
      red: 0
    }
  });
  expect(operations.items.map((item) => item.agent_id)).toEqual([
    'app-engineering',
    'team-lead'
  ]);
  expect(operations.items[0]).toMatchObject({
    agent_id: 'app-engineering',
    display_name: 'App Engineering Agent',
    current_state: 'blocked',
    correlation_id: 'corr-contract',
    current_blocker: 'Need review evidence',
    reported_severity: 'orange',
    effective_severity: 'orange',
    latest_event: {
      event_id: 'evt_contract_handoff_completed',
      event_type: 'agent_handoff_completed',
      summary: 'Lead completed the contract handoff'
    }
  });
  expect(operations.items[1]).toMatchObject({
    agent_id: 'team-lead',
    latest_event: null,
    correlation_id: null
  });
}

function expectWorkflowContract(workflow: AgentWorkflow) {
  expect(workflow.agent_id).toBe('app-engineering');
  expect(workflow.detail.agent_id).toBe('app-engineering');
  expect(workflow.detail.latest_heartbeat?.received_at).toBe('2026-03-09T18:58:30.000Z');
  expect(workflow.detail.current_location).toBe('desk-app-engineering');
  expect(workflow.detail.open_peer_watch_alerts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        alert_id: 'evt_contract_peer_watch',
        observer_agent_id: 'team-lead',
        watcher_agent_ids: ['protocol-engineering'],
        evidence_count: 1
      })
    ])
  );
  expect(workflow.detail.recent_events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        event_id: 'evt_contract_handoff_completed',
        active_task: 'Hand off the contract fix'
      })
    ])
  );
  expect(workflow.detail.recent_handoffs).toEqual([
    expect.objectContaining({
      handoff_id: 'evt_contract_handoff_completed',
      status: 'completed'
    })
  ]);
  expect(workflow.detail.recent_reboots).toEqual([]);
  expect(workflow.correlation_ids).toEqual(['corr-contract']);
  expect(workflow.counterparty_agent_ids).toEqual(['growth-revenue', 'protocol-engineering']);
  expect(workflow.incidents.map((incident) => incident.incident_id)).toEqual([
    'evt_contract_handoff_completed',
    'evt_contract_peer_watch'
  ]);
  expect(workflow.interactions.map((interaction) => interaction.interaction_id)).toEqual([
    'interaction:evt_contract_handoff_completed',
    'interaction:evt_contract_peer_watch',
    'interaction:evt_contract_review_started'
  ]);
  expect(workflow.timeline.map((event) => event.event_id)).toEqual([
    'evt_contract_review_started',
    'evt_contract_review_completed',
    'evt_contract_peer_watch',
    'evt_contract_handoff_completed'
  ]);
}

function expectIncidentFeedContract(feed: IncidentFeedResponse) {
  expect(feed.items.map((incident) => incident.incident_id)).toEqual([
    'evt_contract_handoff_completed',
    'evt_contract_peer_watch'
  ]);
  expect(feed.items[0]).toMatchObject({
    correlation_id: 'corr-contract',
    status: 'completed'
  });
  expect(feed.items[1]).toMatchObject({
    severity: 'orange'
  });
}

function expectCorrelationContract(correlation: CorrelationDrilldown) {
  expect(correlation.correlation_id).toBe('corr-contract');
  expect(correlation.participant_agent_ids).toEqual([
    'app-engineering',
    'growth-revenue',
    'protocol-engineering',
    'team-lead'
  ]);
  expect(correlation.evidence_refs).toEqual([
    '/tmp/contract-handoff.md',
    '/tmp/contract-peer-watch.md',
    '/tmp/contract-review-complete.md',
    '/tmp/contract-review-start.md'
  ]);
  expect(correlation.first_ts).toBe('2026-03-09T18:40:00.000Z');
  expect(correlation.last_ts).toBe('2026-03-09T18:48:00.000Z');
  expect(correlation.incident_count).toBe(2);
  expect(correlation.interaction_count).toBe(3);
  expect(correlation.event_count).toBe(4);
  expect(correlation.incidents.map((incident) => incident.incident_id)).toEqual([
    'evt_contract_handoff_completed',
    'evt_contract_peer_watch'
  ]);
  expect(correlation.interactions.map((interaction) => interaction.interaction_id)).toEqual([
    'interaction:evt_contract_handoff_completed',
    'interaction:evt_contract_peer_watch',
    'interaction:evt_contract_review_started'
  ]);
  expect(correlation.timeline.map((event) => event.event_id)).toEqual([
    'evt_contract_review_started',
    'evt_contract_review_completed',
    'evt_contract_peer_watch',
    'evt_contract_handoff_completed'
  ]);
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
