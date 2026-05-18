import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  AccountabilityReplayBundle,
  AgentDetail,
  AgentEventsResponse,
  AgentInteractionsResponse,
  AgentWorkflow,
  CollectorEvidenceCoverage,
  CollectorSnapshot,
  CollectorSourceHealthProjection,
  CorrelationDrilldown,
  IncidentFeedResponse,
  MemoryArtifactIndex,
  OfficeOperations,
  OfficeOverview,
  PeerWatchAlertsResponse,
  TimelineReplayResponse
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
  appendCollectorReport(report: CollectorSnapshot): Promise<CollectorSnapshot>;
  listMemoryArtifacts(filters?: Record<string, unknown>): MemoryArtifactIndex['items'];
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

  it('loads /office/overview, /office/operations, /agents/:id/workflow, /incidents, /timeline, /collectors/controller-snapshot, collector source projections, /memory/artifacts, and /correlations/:id from the real backend', async () => {
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
    const [
      overview,
      operations,
      workflow,
      incidents,
      timeline,
      collectorSnapshot,
      collectorEvidenceCoverage,
      collectorSourceHealth,
      memoryArtifacts,
      correlation
    ] = await Promise.all([
      api.fetchOfficeOverview(),
      api.fetchOfficeOperations(),
      api.fetchAgentWorkflow('app-engineering'),
      api.fetchIncidents(),
      api.fetchTimeline(),
      api.fetchCollectorSnapshot(),
      api.fetchCollectorEvidenceCoverage(),
      api.fetchCollectorSourceHealth({ limit: 7 }),
      api.fetchMemoryArtifacts({
        agentId: 'app-engineering',
        correlationId: 'corr-contract'
      }),
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
        pathname: '/timeline',
        query: [
          ['limit', '10'],
          ['window', '60m']
        ]
      },
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/collectors/controller-snapshot',
        query: []
      },
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/collectors/controller-snapshot/evidence-coverage',
        query: []
      },
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/collectors/controller-snapshot/source-health',
        query: [['limit', '7']]
      },
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/memory/artifacts',
        query: [
          ['agent_id', 'app-engineering'],
          ['correlation_id', 'corr-contract'],
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
    expectTimelineContract(timeline);
    expectCollectorSnapshotContract(collectorSnapshot);
    expectCollectorEvidenceCoverageContract(collectorEvidenceCoverage);
    expectCollectorSourceHealthContract(collectorSourceHealth);
    expectMemoryArtifactContract(memoryArtifacts);
    expectCorrelationContract(correlation);
  });

  it('passes evidence-record exact filters through to the real backend', async () => {
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
    const records = await api.fetchEvidenceRecords({
      agentId: 'app-engineering',
      sourceKind: 'workspace_file',
      evidenceRef: '/tmp/app-engineering/todo.md',
      sourceStatus: 'degraded',
      collectorSnapshotId: 'collector-snapshot:2026-03-09T18:59:00.000Z',
      correlationId: 'collector-snapshot:2026-03-09T18:59:00.000Z',
      outputCandidate: true,
      mapped: true,
      observedSince: '2026-03-09T18:58:00.000Z',
      observedUntil: '2026-03-09T18:59:00.000Z',
      collectedSince: '2026-03-09T18:58:00.000Z',
      collectedUntil: '2026-03-09T19:00:00.000Z',
      newestFirst: true,
      limit: 5
    });

    expect(requests).toEqual([
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/evidence-records',
        query: [
          ['agent_id', 'app-engineering'],
          ['collected_since', '2026-03-09T18:58:00.000Z'],
          ['collected_until', '2026-03-09T19:00:00.000Z'],
          ['collector_snapshot_id', 'collector-snapshot:2026-03-09T18:59:00.000Z'],
          ['correlation_id', 'collector-snapshot:2026-03-09T18:59:00.000Z'],
          ['evidence_ref', '/tmp/app-engineering/todo.md'],
          ['limit', '5'],
          ['mapped', 'true'],
          ['newest_first', 'true'],
          ['observed_since', '2026-03-09T18:58:00.000Z'],
          ['observed_until', '2026-03-09T18:59:00.000Z'],
          ['output_candidate', 'true'],
          ['source_kind', 'workspace_file'],
          ['source_status', 'degraded']
        ]
      }
    ]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      agent_id: 'app-engineering',
      source_kind: 'workspace_file',
      evidence_ref: '/tmp/app-engineering/todo.md',
      source_status: 'degraded',
      output_candidate: true,
      collector_snapshot_id: 'collector-snapshot:2026-03-09T18:59:00.000Z',
      correlation_id: 'collector-snapshot:2026-03-09T18:59:00.000Z'
    });
  });

  it('fetches an evidence-record detail by evidence_id from the real backend', async () => {
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
    const records = await api.fetchEvidenceRecords({ limit: 1 });
    const detail = await api.fetchEvidenceRecord(records[0].evidence_id);

    expect(requests).toEqual([
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/evidence-records',
        query: [
          ['limit', '1'],
          ['newest_first', 'true']
        ]
      },
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: `/evidence-records/${encodeURIComponent(records[0].evidence_id)}`,
        query: []
      }
    ]);
    expect(detail).toEqual(records[0]);
  });

  it('passes runtime source-gap filters through to the real backend and unwraps the compact feed', async () => {
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
    const gaps = await api.fetchRuntimeSourceGaps({
      agentId: 'app-engineering',
      sourceKind: 'workspace_file',
      evidenceRole: 'agent_plan',
      sourceStatus: 'degraded',
      collectorSnapshotId: 'collector-snapshot:2026-03-09T18:59:00.000Z',
      correlationId: 'collector-snapshot:2026-03-09T18:59:00.000Z',
      outputCandidate: true,
      mapped: true,
      observedSince: '2026-03-09T18:58:00.000Z',
      observedUntil: '2026-03-09T18:59:00.000Z',
      collectedSince: '2026-03-09T18:58:00.000Z',
      collectedUntil: '2026-03-09T19:00:00.000Z',
      newestFirst: false,
      limit: 5
    });

    expect(requests).toEqual([
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/runtime/source-gaps',
        query: [
          ['agent_id', 'app-engineering'],
          ['collected_since', '2026-03-09T18:58:00.000Z'],
          ['collected_until', '2026-03-09T19:00:00.000Z'],
          ['collector_snapshot_id', 'collector-snapshot:2026-03-09T18:59:00.000Z'],
          ['correlation_id', 'collector-snapshot:2026-03-09T18:59:00.000Z'],
          ['evidence_role', 'agent_plan'],
          ['limit', '5'],
          ['mapped', 'true'],
          ['newest_first', 'false'],
          ['observed_since', '2026-03-09T18:58:00.000Z'],
          ['observed_until', '2026-03-09T18:59:00.000Z'],
          ['output_candidate', 'true'],
          ['source_kind', 'workspace_file'],
          ['source_status', 'degraded']
        ]
      }
    ]);
    expect(gaps).toEqual([
      expect.objectContaining({
        agent_id: 'app-engineering',
        source_kind: 'workspace_file',
        evidence_role: 'agent_plan',
        source_status: 'degraded',
        output_candidate: true,
        collector_snapshot_id: 'collector-snapshot:2026-03-09T18:59:00.000Z',
        correlation_id: 'collector-snapshot:2026-03-09T18:59:00.000Z',
        unmapped: false
      })
    ]);
    expect(Object.hasOwn(gaps[0], 'evidence_id')).toBe(false);
    expect(Object.hasOwn(gaps[0], 'evidence_ref')).toBe(false);
    expect(Object.hasOwn(gaps[0], 'metadata')).toBe(false);
  });

  it('passes timeline correlation_id replay filters through to the real backend and preserves seeded replay semantics', async () => {
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
    const timeline = await api.fetchTimeline({ correlationId: 'corr-contract' });

    expect(requests).toEqual([
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/timeline',
        query: [
          ['correlation_id', 'corr-contract'],
          ['limit', '10'],
          ['window', '60m']
        ]
      }
    ]);
    expect(timeline.items.map((event) => event.event_id)).toEqual([
      'evt_contract_review_started',
      'evt_contract_review_completed',
      'evt_contract_peer_watch',
      'evt_contract_handoff_completed'
    ]);
    expect(timeline.items).toHaveLength(4);
    expect(timeline.items.every((event) => event.correlation_id === 'corr-contract')).toBe(true);
    expect(timeline.items[2]).toMatchObject({
      event_type: 'peer_watch_alert_raised',
      severity: 'orange',
      counterparty_agent_ids: ['protocol-engineering'],
      evidence_refs: ['/tmp/contract-peer-watch.md']
    });
  });

  it('passes timeline agent_id, event_type, severity, source_kind, and correlation_id filters through to the real backend together', async () => {
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
    const timeline = await api.fetchTimeline({
      agentId: 'app-engineering',
      eventType: 'peer_watch_alert_raised',
      severity: 'orange',
      sourceKind: 'controller_event',
      correlationId: 'corr-contract'
    });

    expect(requests).toEqual([
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/timeline',
        query: [
          ['agent_id', 'app-engineering'],
          ['correlation_id', 'corr-contract'],
          ['event_type', 'peer_watch_alert_raised'],
          ['limit', '10'],
          ['severity', 'orange'],
          ['source_kind', 'controller_event'],
          ['window', '60m']
        ]
      }
    ]);
    expect(timeline.items.map((event) => event.event_id)).toEqual(['evt_contract_peer_watch']);
    expect(timeline.items).toHaveLength(1);
    expect(timeline.items[0]).toMatchObject({
      agent_id: 'app-engineering',
      event_type: 'peer_watch_alert_raised',
      severity: 'orange',
      correlation_id: 'corr-contract'
    });
  });

  it('passes timeline event_id exact replay filters through to the real backend', async () => {
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
    const timeline = await api.fetchTimeline({ eventId: 'evt_contract_peer_watch' });

    expect(requests).toEqual([
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/timeline',
        query: [
          ['event_id', 'evt_contract_peer_watch'],
          ['limit', '10'],
          ['window', '60m']
        ]
      }
    ]);
    expect(timeline.items.map((event) => event.event_id)).toEqual(['evt_contract_peer_watch']);
    expect(timeline.items[0]).toMatchObject({
      event_type: 'peer_watch_alert_raised',
      severity: 'orange',
      correlation_id: 'corr-contract'
    });
  });

  it('passes timeline evidence_ref exact replay filters through to the real backend', async () => {
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

    const evidenceRef = '/tmp/contract-peer-watch.md';
    const api = await loadApi(harness.baseUrl);
    const timeline = await api.fetchTimeline({
      agentId: 'app-engineering',
      eventType: 'peer_watch_alert_raised',
      severity: 'orange',
      sourceKind: 'controller_event',
      evidenceRef,
      correlationId: 'corr-contract'
    });

    expect(requests).toEqual([
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/timeline',
        query: [
          ['agent_id', 'app-engineering'],
          ['correlation_id', 'corr-contract'],
          ['event_type', 'peer_watch_alert_raised'],
          ['evidence_ref', evidenceRef],
          ['limit', '10'],
          ['severity', 'orange'],
          ['source_kind', 'controller_event'],
          ['window', '60m']
        ]
      }
    ]);
    expect(timeline.items.map((event) => event.event_id)).toEqual(['evt_contract_peer_watch']);
    expect(timeline.items).toHaveLength(1);
    expect(timeline.items.every((event) => event.evidence_refs.includes(evidenceRef))).toBe(true);
  });

  it('passes memory artifact_ref exact filters through to the real backend and keeps the current scope constrained', async () => {
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
    const memoryArtifacts = await api.fetchMemoryArtifacts({
      agentId: 'app-engineering',
      correlationId: 'corr-contract',
      artifactRef: '/tmp/contract-peer-watch.md'
    });

    expect(requests).toEqual([
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/memory/artifacts',
        query: [
          ['agent_id', 'app-engineering'],
          ['artifact_ref', '/tmp/contract-peer-watch.md'],
          ['correlation_id', 'corr-contract'],
          ['limit', '10'],
          ['window', '60m']
        ]
      }
    ]);
    expect(memoryArtifacts).toEqual({
      generated_at: '2026-03-09T19:00:00.000Z',
      items: [
        {
          artifact_ref: '/tmp/contract-peer-watch.md',
          artifact_kind: 'evidence_ref',
          file_name: 'contract-peer-watch.md',
          first_seen_at: '2026-03-09T18:45:00.000Z',
          last_seen_at: '2026-03-09T18:45:00.000Z',
          mention_count: 1,
          agent_ids: ['app-engineering', 'protocol-engineering', 'team-lead'],
          correlation_ids: ['corr-contract'],
          source_kinds: ['controller_event'],
          latest_summary: 'Protocol engineering flagged the contract drift',
          latest_event_type: 'peer_watch_alert_raised',
          latest_event_id: 'evt_contract_peer_watch',
          replay_checkpoint: {
            event_id: 'evt_contract_peer_watch',
            event_type: 'peer_watch_alert_raised',
            summary: 'Protocol engineering flagged the contract drift',
            last_seen_at: '2026-03-09T18:45:00.000Z'
          },
          collector_last_modified_at: null
        }
      ]
    });
  });

  it('passes memory evidence facet filters through to the real backend without changing the artifact envelope', async () => {
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
    const memoryArtifacts = await api.fetchMemoryArtifacts({
      agentId: 'app-engineering',
      correlationId: 'corr-contract',
      eventType: 'peer_watch_alert_raised',
      severity: 'orange',
      artifactKind: 'evidence_ref'
    });

    expect(requests).toEqual([
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/memory/artifacts',
        query: [
          ['agent_id', 'app-engineering'],
          ['artifact_kind', 'evidence_ref'],
          ['correlation_id', 'corr-contract'],
          ['event_type', 'peer_watch_alert_raised'],
          ['limit', '10'],
          ['severity', 'orange'],
          ['window', '60m']
        ]
      }
    ]);
    expect(memoryArtifacts).toEqual({
      generated_at: '2026-03-09T19:00:00.000Z',
      items: [
        {
          artifact_ref: '/tmp/contract-peer-watch.md',
          artifact_kind: 'evidence_ref',
          file_name: 'contract-peer-watch.md',
          first_seen_at: '2026-03-09T18:45:00.000Z',
          last_seen_at: '2026-03-09T18:45:00.000Z',
          mention_count: 1,
          agent_ids: ['app-engineering', 'protocol-engineering', 'team-lead'],
          correlation_ids: ['corr-contract'],
          source_kinds: ['controller_event'],
          latest_summary: 'Protocol engineering flagged the contract drift',
          latest_event_type: 'peer_watch_alert_raised',
          latest_event_id: 'evt_contract_peer_watch',
          replay_checkpoint: {
            event_id: 'evt_contract_peer_watch',
            event_type: 'peer_watch_alert_raised',
            summary: 'Protocol engineering flagged the contract drift',
            last_seen_at: '2026-03-09T18:45:00.000Z'
          },
          collector_last_modified_at: null
        }
      ]
    });
  });

  it('passes memory source_kind filters through to the real backend artifact source_kinds membership', async () => {
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
    const memoryArtifacts = await api.fetchMemoryArtifacts({
      sourceKind: 'workspace_file'
    });

    expect(requests).toEqual([
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/memory/artifacts',
        query: [
          ['limit', '10'],
          ['source_kind', 'workspace_file'],
          ['window', '60m']
        ]
      }
    ]);
    expect(memoryArtifacts.generated_at).toBe('2026-03-09T19:00:00.000Z');
    expect(memoryArtifacts.items).toHaveLength(1);
    expect(memoryArtifacts.items[0]).toEqual(
      expect.objectContaining({
        artifact_ref: '/tmp/app-engineering/todo.md',
        artifact_kind: 'workspace_file',
        file_name: 'todo.md'
      })
    );
    expect(memoryArtifacts.items[0].source_kinds).toContain('workspace_file');
    expect(
      memoryArtifacts.items.every((artifact) => artifact.source_kinds.includes('workspace_file'))
    ).toBe(true);
  });

  it('loads /accountability/replay from the real backend with bounded read-only anchors', async () => {
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
    const replay = await api.fetchAccountabilityReplay({
      agentId: 'app-engineering',
      correlationId: 'corr-contract',
      sourceKind: 'controller_event',
      artifactKind: 'evidence_ref',
      limit: 2,
      window: '60m'
    });

    expect(requests).toEqual([
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/accountability/replay',
        query: [
          ['agent_id', 'app-engineering'],
          ['artifact_kind', 'evidence_ref'],
          ['correlation_id', 'corr-contract'],
          ['limit', '2'],
          ['source_kind', 'controller_event'],
          ['window', '60m']
        ]
      }
    ]);
    expectAccountabilityReplayContract(replay);
  });

  it('passes office-operations agent_id filters through to the real backend without widening the request surface', async () => {
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
    const operations = await api.fetchOfficeOperations({ agentId: 'app-engineering' });

    expect(requests).toEqual([
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/office/operations',
        query: [['agent_id', 'app-engineering']]
      }
    ]);
    expect(operations.generated_at).toBe('2026-03-09T19:00:00.000Z');
    expect(operations.summary).toEqual({
      item_count: 1,
      blocked_count: 1,
      reboot_recommended_count: 0,
      state_buckets: {
        blocked: 1
      },
      severity_buckets: {
        normal: 0,
        yellow: 0,
        orange: 1,
        red: 0
      }
    });
    expect(operations.items.map((item) => item.agent_id)).toEqual(['app-engineering']);
    expect(operations.items[0]).toMatchObject({
      agent_id: 'app-engineering',
      current_state: 'blocked',
      correlation_id: 'collector-snapshot:2026-03-09T18:59:00.000Z',
      latest_event: {
        source_kind: 'controller_event',
        event_type: 'peer_watch_alert_raised'
      }
    });
  });

  it('loads /agents/:id/events, /agents/:id/interactions, and /peer-watch/alerts from the real backend with read-only filters intact', async () => {
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
    const [events, interactions, alerts] = await Promise.all([
      api.fetchAgentEvents('app-engineering', {
        limit: 2,
        eventType: 'peer_watch_alert_raised',
        severity: 'orange',
        sourceKind: 'controller_event',
        evidenceRef: '/tmp/contract-peer-watch.md',
        correlationId: 'corr-contract'
      }),
      api.fetchAgentInteractions('app-engineering', {
        limit: 2,
        window: '60m',
        interactionType: 'peer_watch',
        counterpartyAgentId: 'protocol-engineering',
        severity: 'orange',
        correlationId: 'corr-contract',
        eventId: 'evt_contract_peer_watch',
        evidenceRef: '/tmp/contract-peer-watch.md'
      }),
      api.fetchPeerWatchAlerts({
        status: 'open',
        targetAgentId: 'app-engineering',
        watcherAgentId: 'protocol-engineering',
        observerAgentId: 'team-lead',
        correlationId: 'corr-contract',
        severity: 'orange',
        limit: 2
      })
    ]);

    expect(requests).toEqual([
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/agents/app-engineering/events',
        query: [
          ['correlation_id', 'corr-contract'],
          ['event_type', 'peer_watch_alert_raised'],
          ['evidence_ref', '/tmp/contract-peer-watch.md'],
          ['limit', '2'],
          ['severity', 'orange'],
          ['source_kind', 'controller_event']
        ]
      },
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/agents/app-engineering/interactions',
        query: [
          ['correlation_id', 'corr-contract'],
          ['counterparty_agent_id', 'protocol-engineering'],
          ['event_id', 'evt_contract_peer_watch'],
          ['evidence_ref', '/tmp/contract-peer-watch.md'],
          ['interaction_type', 'peer_watch'],
          ['limit', '2'],
          ['severity', 'orange'],
          ['window', '60m']
        ]
      },
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/peer-watch/alerts',
        query: [
          ['correlation_id', 'corr-contract'],
          ['limit', '2'],
          ['observer_agent_id', 'team-lead'],
          ['severity', 'orange'],
          ['status', 'open'],
          ['target_agent_id', 'app-engineering'],
          ['watcher_agent_id', 'protocol-engineering']
        ]
      }
    ]);
    expectAgentEventsContract(events);
    expectAgentInteractionsContract(interactions);
    expectPeerWatchAlertsContract(alerts);
  });

  it('loads /agents/:id/incidents from the real backend with explicit read-only filters intact', async () => {
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
    const incidents = await api.fetchAgentIncidents('app-engineering', {
      kind: 'peer_watch_alert',
      severity: 'orange',
      status: 'open',
      correlationId: 'corr-contract',
      limit: 2,
      window: '60m'
    });

    expect(requests).toEqual([
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/agents/app-engineering/incidents',
        query: [
          ['correlation_id', 'corr-contract'],
          ['kind', 'peer_watch_alert'],
          ['limit', '2'],
          ['severity', 'orange'],
          ['status', 'open'],
          ['window', '60m']
        ]
      }
    ]);
    expectAgentIncidentsContract(incidents);
  });

  it('loads /agents/:id detail from the real backend without adding workflow defaults', async () => {
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
    const detail = await api.fetchAgentDetail('app-engineering', { limit: 2 });

    expect(requests).toEqual([
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/agents/app-engineering',
        query: [['limit', '2']]
      }
    ]);
    expectAgentDetailContract(detail);
  });

  it('sends explicit default read-only bounds for /agents/:id/events, /agents/:id/interactions, and /peer-watch/alerts', async () => {
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
    const [events, interactions, alerts, aliasAlerts] = await Promise.all([
      api.fetchAgentEvents('app-engineering'),
      api.fetchAgentInteractions('app-engineering'),
      api.fetchPeerWatchAlerts(),
      api.fetchPeerWatchAlerts({ agentId: 'app-engineering', limit: 2 })
    ]);

    expect(requests).toEqual([
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/agents/app-engineering/events',
        query: [['limit', '10']]
      },
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/agents/app-engineering/interactions',
        query: [
          ['limit', '10'],
          ['window', '60m']
        ]
      },
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/peer-watch/alerts',
        query: [['limit', '10']]
      },
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/peer-watch/alerts',
        query: [
          ['agent_id', 'app-engineering'],
          ['limit', '2']
        ]
      }
    ]);
    expect(events.items.map((event) => event.event_id)).toEqual([
      'evt_collector_app-engineering_blocked_raised_orange_2026-03-09T18_59_00_000Z',
      'evt_contract_handoff_completed',
      'evt_contract_peer_watch',
      'evt_contract_review_completed',
      'evt_contract_review_started',
      'evt_contract_old_alert'
    ]);
    expect(interactions.items.map((interaction) => interaction.interaction_id)).toEqual([
      'interaction:evt_collector_app-engineering_blocked_raised_orange_2026-03-09T18_59_00_000Z',
      'interaction:evt_contract_handoff_completed',
      'interaction:evt_contract_peer_watch',
      'interaction:evt_contract_review_started'
    ]);
    expect(alerts.items.map((alert) => alert.alert_id)).toEqual([
      'evt_collector_app-engineering_blocked_raised_orange_2026-03-09T18_59_00_000Z',
      'evt_contract_peer_watch',
      'evt_contract_old_alert'
    ]);
    expect(aliasAlerts.items.map((alert) => alert.alert_id)).toEqual([
      'evt_collector_app-engineering_blocked_raised_orange_2026-03-09T18_59_00_000Z',
      'evt_contract_peer_watch'
    ]);
  });

  it('sends explicit default read-only bounds for /agents/:id/incidents', async () => {
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
    const incidents = await api.fetchAgentIncidents('app-engineering');

    expect(requests).toEqual([
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/agents/app-engineering/incidents',
        query: [
          ['limit', '10'],
          ['window', '60m']
        ]
      }
    ]);
    expect(incidents.agent_id).toBe('app-engineering');
    expect(incidents.items.map((incident) => incident.incident_id)).toEqual([
      'evt_collector_app-engineering_blocked_raised_orange_2026-03-09T18_59_00_000Z',
      'evt_contract_handoff_completed',
      'evt_contract_peer_watch'
    ]);
  });

  it('keeps conflicting target_agent_id and agent_id peer-watch filters aligned with backend precedence', async () => {
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
    const alerts = await api.fetchPeerWatchAlerts({
      targetAgentId: 'app-engineering',
      agentId: 'growth-revenue',
      status: 'open',
      limit: 2
    });

    expect(requests).toEqual([
      {
        method: 'GET',
        origin: harness.baseUrl,
        pathname: '/peer-watch/alerts',
        query: [
          ['agent_id', 'growth-revenue'],
          ['limit', '2'],
          ['status', 'open'],
          ['target_agent_id', 'app-engineering']
        ]
      }
    ]);
    expect(alerts.items.map((alert) => alert.alert_id)).toEqual([
      'evt_collector_app-engineering_blocked_raised_orange_2026-03-09T18_59_00_000Z',
      'evt_contract_peer_watch'
    ]);
    expect(alerts.items.map((alert) => alert.target_agent_id)).toEqual([
      'app-engineering',
      'app-engineering'
    ]);
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

  it('surfaces unknown-agent event 404s through the frontend request parser against the real backend', async () => {
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

    await expect(api.fetchAgentEvents('unknown-agent')).rejects.toMatchObject({
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

  it('surfaces unknown-agent interaction 404s through the frontend request parser against the real backend', async () => {
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

    await expect(api.fetchAgentInteractions('unknown-agent')).rejects.toMatchObject({
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

  it('surfaces unknown-agent incident 404s through the frontend request parser against the real backend', async () => {
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

    await expect(api.fetchAgentIncidents('unknown-agent')).rejects.toMatchObject({
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

  await store.appendCollectorReport({
    collected_at: '2026-03-09T18:59:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 1,
      heartbeat_count: 1,
      tmux_observed_count: 1,
      workspace_observed_count: 1,
      reboot_recommended_count: 0
    },
    evidence_coverage: {
      collector_snapshot_id: 'collector-snapshot:2026-03-09T18:59:00.000Z',
      evidence_ref_count: 2,
      covered_agent_count: 1,
      low_confidence_agent_ids: [],
      source_kind_buckets: {
        workspace_file: 1,
        workspace_root: 0,
        tmux_observation: 1
      },
      agent_items: [
        {
          agent_id: 'app-engineering',
          evidence_ref_count: 2,
          source_kinds: ['tmux_observation', 'workspace_file'],
          latest_evidence_at: '2026-03-09T18:58:45.000Z',
          confidence_level: 'high'
        }
      ]
    },
    shared_artifacts: [],
    items: [
      {
        agent_id: 'app-engineering',
        workspace_root: '/tmp/app-engineering',
        session_ref: '5-web3-app-engineering',
        source_health: {
          workspace_root: {
            status: 'observed',
            path: '/tmp/app-engineering',
            last_observed_at: '2026-03-09T18:58:30.000Z',
            degraded_reasons: []
          },
          workspace_files: {
            status: 'degraded',
            expected_files: ['inbox.md', 'outbox.md', 'todo.md'],
            observed_count: 1,
            missing_count: 2,
            error_count: 0,
            last_observed_at: '2026-03-09T18:58:30.000Z',
            degraded_reasons: ['missing workspace files: inbox.md, outbox.md']
          },
          tmux_session: {
            status: 'observed',
            expected_session_ref: '5-web3-app-engineering',
            observed_count: 1,
            last_observed_at: '2026-03-09T18:58:45.000Z',
            degraded_reasons: []
          }
        },
        evidence_refs: ['/tmp/app-engineering/todo.md', 'tmux://5-web3-app-engineering/0.1'],
        workspace_observations: [
          {
            path: '/tmp/app-engineering/todo.md',
            file_name: 'todo.md',
            kind: 'workspace_file',
            last_modified_at: '2026-03-09T18:58:30.000Z'
          }
        ],
        tmux_observations: [
          {
            session_name: '5-web3-app-engineering',
            window_index: '0',
            pane_index: '1',
            pane_id: '%11',
            pane_title: 'Implement HTTP handlers',
            pane_current_command: 'nvim',
            pane_active: true,
            pane_dead: false,
            pane_activity_at: '2026-03-09T18:58:45.000Z'
          }
        ],
        supervision: {
          watch_target: 'growth-revenue',
          watched_by: ['protocol-engineering', 'team-lead'],
          needs_attention: false
        },
        heartbeat: {
          agent_id: 'app-engineering',
          actor_id: 'team-lead',
          received_at: '2026-03-09T18:59:00.000Z',
          current_state: 'blocked',
          active_task: 'Fix the contract drift',
          current_location: 'desk-app-engineering',
          last_meaningful_output_at: '2026-03-09T18:58:00.000Z',
          last_file_write_at: '2026-03-09T18:57:00.000Z',
          current_blocker: 'Need review evidence',
          confidence_level: 'high',
          reboot_recommended: false
        }
      }
    ]
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
    correlation_id: 'collector-snapshot:2026-03-09T18:59:00.000Z',
    current_blocker: 'Need review evidence',
    reported_severity: 'orange',
    effective_severity: 'orange',
    latest_event: {
      event_id: 'evt_collector_app-engineering_blocked_raised_orange_2026-03-09T18_59_00_000Z',
      event_type: 'peer_watch_alert_raised',
      summary: 'Collector observed blocked execution: Need review evidence'
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
  expect(workflow.detail.latest_heartbeat?.received_at).toBe('2026-03-09T18:59:00.000Z');
  expect(workflow.detail.current_location).toBe('desk-app-engineering');
  expect(workflow.detail.open_peer_watch_alerts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        alert_id: 'evt_contract_peer_watch',
        ts: '2026-03-09T18:45:00.000Z',
        observer_agent_id: 'team-lead',
        watcher_agent_ids: ['protocol-engineering'],
        evidence_count: 1
      }),
      expect.objectContaining({
        alert_id: 'evt_collector_app-engineering_blocked_raised_orange_2026-03-09T18_59_00_000Z',
        ts: '2026-03-09T18:59:00.000Z',
        observer_agent_id: 'team-lead',
        watcher_agent_ids: ['protocol-engineering'],
        evidence_count: 2
      }),
      expect.objectContaining({
        alert_id: 'evt_contract_old_alert',
        ts: '2026-03-09T17:20:00.000Z',
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
        agent_role: 'app-engineering',
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
  expect(workflow.summary).toEqual({
    incident_count: 3,
    interaction_count: 4,
    event_count: 5,
    incident_kind_buckets: {
      peer_watch_alert: 2,
      handoff: 1
    },
    interaction_type_buckets: {
      peer_watch: 2,
      handoff: 1,
      review: 1
    },
    event_type_buckets: {
      review_started: 1,
      review_completed: 1,
      peer_watch_alert_raised: 2,
      agent_handoff_completed: 1
    },
    severity_buckets: {
      normal: 0,
      yellow: 6,
      orange: 6,
      red: 0
    },
    latest_activity_at: '2026-03-09T18:59:00.000Z'
  });
  expect(workflow.correlation_ids).toEqual([
    'collector-snapshot:2026-03-09T18:59:00.000Z',
    'corr-contract'
  ]);
  expect(workflow.counterparty_agent_ids).toEqual(['growth-revenue', 'protocol-engineering']);
  expect(workflow.incidents.map((incident) => incident.incident_id)).toEqual([
    'evt_collector_app-engineering_blocked_raised_orange_2026-03-09T18_59_00_000Z',
    'evt_contract_handoff_completed',
    'evt_contract_peer_watch'
  ]);
  expect(workflow.interactions.map((interaction) => interaction.interaction_id)).toEqual([
    'interaction:evt_collector_app-engineering_blocked_raised_orange_2026-03-09T18_59_00_000Z',
    'interaction:evt_contract_handoff_completed',
    'interaction:evt_contract_peer_watch',
    'interaction:evt_contract_review_started'
  ]);
  expect(workflow.interactions.map((interaction) => interaction.source_kind)).toEqual([
    'controller_event',
    'controller_event',
    'controller_event',
    'controller_event'
  ]);
  expect(workflow.timeline.map((event) => event.event_id)).toEqual([
    'evt_contract_review_started',
    'evt_contract_review_completed',
    'evt_contract_peer_watch',
    'evt_contract_handoff_completed',
    'evt_collector_app-engineering_blocked_raised_orange_2026-03-09T18_59_00_000Z'
  ]);
}

function expectAgentDetailContract(detail: AgentDetail) {
  expect(detail.agent_id).toBe('app-engineering');
  expect(detail.display_name).toBe('App Engineering Agent');
  expect(detail.current_state).toBe('blocked');
  expect(detail.current_location).toBe('desk-app-engineering');
  expect(detail.latest_heartbeat).toMatchObject({
    agent_id: 'app-engineering',
    actor_id: 'team-lead',
    received_at: '2026-03-09T18:59:00.000Z',
    confidence_level: 'high'
  });
  expect(detail.open_peer_watch_alerts.map((alert) => alert.alert_id)).toEqual([
    'evt_collector_app-engineering_blocked_raised_orange_2026-03-09T18_59_00_000Z',
    'evt_contract_peer_watch'
  ]);
  expect(detail.open_peer_watch_alerts[0]).toMatchObject({
    source_kind: 'controller_event',
    evidence_refs: ['/tmp/app-engineering/todo.md', 'tmux://5-web3-app-engineering/0.1'],
    watcher_agent_ids: ['protocol-engineering']
  });
  expect(detail.recent_events.map((event) => event.event_id)).toEqual([
    'evt_collector_app-engineering_blocked_raised_orange_2026-03-09T18_59_00_000Z',
    'evt_contract_handoff_completed'
  ]);
  expect(detail.recent_interactions.map((interaction) => interaction.interaction_id)).toEqual([
    'interaction:evt_collector_app-engineering_blocked_raised_orange_2026-03-09T18_59_00_000Z',
    'interaction:evt_contract_handoff_completed'
  ]);
  expect(detail.recent_incidents.map((incident) => incident.incident_id)).toEqual([
    'evt_collector_app-engineering_blocked_raised_orange_2026-03-09T18_59_00_000Z',
    'evt_contract_handoff_completed'
  ]);
  expect(detail.recent_handoffs).toEqual([
    expect.objectContaining({
      handoff_id: 'evt_contract_handoff_completed',
      status: 'completed'
    })
  ]);
  expect(detail.recent_reboots).toEqual([]);
}

function expectIncidentFeedContract(feed: IncidentFeedResponse) {
  expect(feed.items.map((incident) => incident.incident_id)).toEqual([
    'evt_collector_app-engineering_blocked_raised_orange_2026-03-09T18_59_00_000Z',
    'evt_contract_handoff_completed',
    'evt_contract_peer_watch'
  ]);
  expect(feed.items[0]).toMatchObject({
    correlation_id: 'collector-snapshot:2026-03-09T18:59:00.000Z',
    kind: 'peer_watch_alert',
    severity: 'orange'
  });
  expect(feed.items[1]).toMatchObject({
    correlation_id: 'corr-contract',
    status: 'completed'
  });
  expect(feed.items[2]).toMatchObject({
    severity: 'orange'
  });
}

function expectTimelineContract(timeline: TimelineReplayResponse) {
  expect(timeline.items.map((event) => event.event_id)).toEqual([
    'evt_contract_review_started',
    'evt_contract_review_completed',
    'evt_contract_peer_watch',
    'evt_contract_handoff_completed',
    'evt_collector_app-engineering_blocked_raised_orange_2026-03-09T18_59_00_000Z'
  ]);
  expect(timeline.items[0]).toMatchObject({
    event_type: 'review_started',
    correlation_id: 'corr-contract',
    counterparty_agent_ids: ['protocol-engineering'],
    evidence_refs: ['/tmp/contract-review-start.md'],
    source_kind: 'controller_event'
  });
  expect(timeline.items[3]).toMatchObject({
    event_type: 'agent_handoff_completed',
    severity: 'yellow',
    summary: 'Lead completed the contract handoff'
  });
}

function expectCollectorSnapshotContract(snapshot: CollectorSnapshot | null) {
  expect(snapshot).not.toBeNull();
  expect(snapshot).toMatchObject({
    collected_at: '2026-03-09T18:59:00.000Z',
    actor_id: 'team-lead',
    summary: {
      agent_count: 1,
      heartbeat_count: 1,
      tmux_observed_count: 1,
      workspace_observed_count: 1,
      reboot_recommended_count: 0
    },
    shared_artifacts: []
  });
  expect(snapshot?.evidence_coverage).toMatchObject({
    evidence_ref_count: 2,
    covered_agent_count: 1,
    low_confidence_agent_ids: [],
    source_kind_buckets: {
      workspace_file: 1,
      workspace_root: 0,
      tmux_observation: 1
    },
    agent_items: [
      {
        agent_id: 'app-engineering',
        evidence_ref_count: 2,
        source_kinds: ['tmux_observation', 'workspace_file'],
        latest_evidence_at: '2026-03-09T18:58:45.000Z',
        confidence_level: 'high'
      }
    ]
  });
  expect(snapshot?.items).toHaveLength(1);
  expect(snapshot?.items[0]).toMatchObject({
    agent_id: 'app-engineering',
    workspace_root: '/tmp/app-engineering',
    session_ref: '5-web3-app-engineering',
    evidence_refs: ['/tmp/app-engineering/todo.md', 'tmux://5-web3-app-engineering/0.1'],
    supervision: {
      watch_target: 'growth-revenue',
      watched_by: ['protocol-engineering', 'team-lead'],
      needs_attention: false
    },
    heartbeat: {
      agent_id: 'app-engineering',
      actor_id: 'team-lead',
      current_state: 'blocked',
      active_task: 'Fix the contract drift',
      current_blocker: 'Need review evidence',
      confidence_level: 'high',
      reboot_recommended: false
    }
  });
}

function expectCollectorEvidenceCoverageContract(coverage: CollectorEvidenceCoverage | null) {
  expect(coverage?.collected_at).toBe('2026-03-09T18:59:00.000Z');
  expect(coverage?.actor_id).toBe('team-lead');
  expect(coverage).toMatchObject({
    evidence_ref_count: 2,
    covered_agent_count: 1,
    low_confidence_agent_ids: [],
    source_kind_buckets: {
      workspace_file: 1,
      workspace_root: 0,
      tmux_observation: 1
    },
    agent_items: [
      {
        agent_id: 'app-engineering',
        evidence_ref_count: 2,
        source_kinds: ['tmux_observation', 'workspace_file'],
        latest_evidence_at: '2026-03-09T18:58:45.000Z',
        confidence_level: 'high'
      }
    ]
  });
}

function expectCollectorSourceHealthContract(sourceHealth: CollectorSourceHealthProjection | null) {
  expect(sourceHealth?.collected_at).toBe('2026-03-09T18:59:00.000Z');
  expect(sourceHealth?.collector_snapshot_id).toBe('collector-snapshot:2026-03-09T18:59:00.000Z');
  expect(sourceHealth?.actor_id).toBe('team-lead');
  expect(sourceHealth).toMatchObject({
    summary: {
      agent_count: 1,
      status_buckets: {
        observed: 2,
        degraded: 1,
        missing: 0,
        error: 0
      },
      source_kind_buckets: {
        workspace_root: { observed: 1, degraded: 0, missing: 0, error: 0 },
        workspace_files: { observed: 0, degraded: 1, missing: 0, error: 0 },
        tmux_session: { observed: 1, degraded: 0, missing: 0, error: 0 }
      }
    },
    agent_items: [
      {
        agent_id: 'app-engineering',
        workspace_root: '/tmp/app-engineering',
        session_ref: '5-web3-app-engineering',
        evidence_ref_count: 2,
        latest_evidence_at: '2026-03-09T18:58:45.000Z',
        source_health: {
          workspace_files: {
            status: 'degraded',
            missing_count: 2
          }
        }
      }
    ]
  });
}

function expectMemoryArtifactContract(memoryArtifacts: MemoryArtifactIndex) {
  expect(memoryArtifacts.generated_at).toBe('2026-03-09T19:00:00.000Z');
  expect(memoryArtifacts.items).toEqual([
    {
      artifact_ref: '/tmp/contract-handoff.md',
      artifact_kind: 'evidence_ref',
      file_name: 'contract-handoff.md',
      first_seen_at: '2026-03-09T18:48:00.000Z',
      last_seen_at: '2026-03-09T18:48:00.000Z',
      mention_count: 1,
      agent_ids: ['app-engineering', 'growth-revenue', 'team-lead'],
      correlation_ids: ['corr-contract'],
      source_kinds: ['controller_event'],
      latest_summary: 'Lead completed the contract handoff',
      latest_event_type: 'agent_handoff_completed',
      latest_event_id: 'evt_contract_handoff_completed',
      replay_checkpoint: {
        event_id: 'evt_contract_handoff_completed',
        event_type: 'agent_handoff_completed',
        summary: 'Lead completed the contract handoff',
        last_seen_at: '2026-03-09T18:48:00.000Z'
      },
      collector_last_modified_at: null
    },
    {
      artifact_ref: '/tmp/contract-peer-watch.md',
      artifact_kind: 'evidence_ref',
      file_name: 'contract-peer-watch.md',
      first_seen_at: '2026-03-09T18:45:00.000Z',
      last_seen_at: '2026-03-09T18:45:00.000Z',
      mention_count: 1,
      agent_ids: ['app-engineering', 'protocol-engineering', 'team-lead'],
      correlation_ids: ['corr-contract'],
      source_kinds: ['controller_event'],
      latest_summary: 'Protocol engineering flagged the contract drift',
      latest_event_type: 'peer_watch_alert_raised',
      latest_event_id: 'evt_contract_peer_watch',
      replay_checkpoint: {
        event_id: 'evt_contract_peer_watch',
        event_type: 'peer_watch_alert_raised',
        summary: 'Protocol engineering flagged the contract drift',
        last_seen_at: '2026-03-09T18:45:00.000Z'
      },
      collector_last_modified_at: null
    },
    {
      artifact_ref: '/tmp/contract-review-complete.md',
      artifact_kind: 'evidence_ref',
      file_name: 'contract-review-complete.md',
      first_seen_at: '2026-03-09T18:42:00.000Z',
      last_seen_at: '2026-03-09T18:42:00.000Z',
      mention_count: 1,
      agent_ids: ['app-engineering', 'protocol-engineering', 'team-lead'],
      correlation_ids: ['corr-contract'],
      source_kinds: ['controller_event'],
      latest_summary: 'Lead completed the contract review',
      latest_event_type: 'review_completed',
      latest_event_id: 'evt_contract_review_completed',
      replay_checkpoint: {
        event_id: 'evt_contract_review_completed',
        event_type: 'review_completed',
        summary: 'Lead completed the contract review',
        last_seen_at: '2026-03-09T18:42:00.000Z'
      },
      collector_last_modified_at: null
    },
    {
      artifact_ref: '/tmp/contract-review-start.md',
      artifact_kind: 'evidence_ref',
      file_name: 'contract-review-start.md',
      first_seen_at: '2026-03-09T18:40:00.000Z',
      last_seen_at: '2026-03-09T18:40:00.000Z',
      mention_count: 1,
      agent_ids: ['app-engineering', 'protocol-engineering', 'team-lead'],
      correlation_ids: ['corr-contract'],
      source_kinds: ['controller_event'],
      latest_summary: 'Lead started the contract review',
      latest_event_type: 'review_started',
      latest_event_id: 'evt_contract_review_started',
      replay_checkpoint: {
        event_id: 'evt_contract_review_started',
        event_type: 'review_started',
        summary: 'Lead started the contract review',
        last_seen_at: '2026-03-09T18:40:00.000Z'
      },
      collector_last_modified_at: null
    }
  ]);
}

function expectAccountabilityReplayContract(replay: AccountabilityReplayBundle) {
  expect(replay.generated_at).toBe('2026-03-09T19:00:00.000Z');
  expect(replay.query).toEqual({
    correlation_id: 'corr-contract',
    agent_id: 'app-engineering',
    source_kind: 'controller_event',
    artifact_kind: 'evidence_ref',
    limit: 2,
    window: '60m'
  });
  expect(replay.accountability).toMatchObject({
    basis: 'event_log_and_existing_read_models',
    bounded_by: {
      limit: 2,
      window: '60m'
    },
    event_count: 2,
    interaction_count: 2,
    artifact_count: 2,
    participant_agent_ids: [
      'app-engineering',
      'growth-revenue',
      'protocol-engineering',
      'team-lead'
    ],
    actor_ids: ['team-lead'],
    evidence_refs: ['/tmp/contract-handoff.md', '/tmp/contract-peer-watch.md'],
    source_kind_buckets: {
      controller_event: 6
    },
    first_ts: '2026-03-09T18:45:00.000Z',
    last_ts: '2026-03-09T18:48:00.000Z'
  });
  expect(replay.events.map((event) => event.event_id)).toEqual([
    'evt_contract_peer_watch',
    'evt_contract_handoff_completed'
  ]);
  expect(replay.interactions.map((interaction) => interaction.interaction_id)).toEqual([
    'interaction:evt_contract_handoff_completed',
    'interaction:evt_contract_peer_watch'
  ]);
  expect(replay.memory_artifacts.map((artifact) => artifact.artifact_ref)).toEqual([
    '/tmp/contract-handoff.md',
    '/tmp/contract-peer-watch.md'
  ]);
  expect(replay.ledger.map((entry) => entry.entry_type)).toEqual([
    'event',
    'interaction',
    'memory_artifact',
    'event',
    'interaction',
    'memory_artifact'
  ]);
  expect(
    replay.ledger.every((entry) =>
      entry.basis_event_ids.every((eventId) =>
        [
          'evt_contract_handoff_completed',
          'evt_contract_peer_watch'
        ].includes(eventId)
      )
    )
  ).toBe(true);
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
  expect(correlation.closure_ledger).toMatchObject({
    state: 'open',
    basis: 'filtered_correlation_slice',
    open_count: 1,
    active_count: 1,
    closed_count: 1,
    entry_count: 3,
    last_transition_ts: '2026-03-09T18:48:00.000Z'
  });
  expect(correlation.closure_ledger?.entries.map((entry) => entry.entry_id)).toEqual([
    'incident:evt_contract_handoff_completed',
    'interaction:evt_contract_peer_watch',
    'incident:evt_contract_peer_watch'
  ]);
  expect(correlation.closure_ledger?.entries[0]).toMatchObject({
    state: 'closed',
    kind: 'handoff',
    status: 'completed',
    evidence_refs: ['/tmp/contract-handoff.md'],
    source_kind: 'controller_event'
  });
  expect(correlation.incidents.map((incident) => incident.incident_id)).toEqual([
    'evt_contract_handoff_completed',
    'evt_contract_peer_watch'
  ]);
  expect(correlation.interactions.map((interaction) => interaction.interaction_id)).toEqual([
    'interaction:evt_contract_handoff_completed',
    'interaction:evt_contract_peer_watch',
    'interaction:evt_contract_review_started'
  ]);
  expect(correlation.interactions.map((interaction) => interaction.source_kind)).toEqual([
    'controller_event',
    'controller_event',
    'controller_event'
  ]);
  expect(correlation.timeline.map((event) => event.event_id)).toEqual([
    'evt_contract_review_started',
    'evt_contract_review_completed',
    'evt_contract_peer_watch',
    'evt_contract_handoff_completed'
  ]);
}

function expectAgentEventsContract(events: AgentEventsResponse) {
  expect(events.agent_id).toBe('app-engineering');
  expect(events.items).toEqual([
    expect.objectContaining({
      event_id: 'evt_contract_peer_watch',
      agent_role: 'app-engineering',
      event_type: 'peer_watch_alert_raised',
      severity: 'orange',
      correlation_id: 'corr-contract',
      evidence_refs: ['/tmp/contract-peer-watch.md']
    })
  ]);
}

function expectAgentIncidentsContract(incidents: IncidentFeedResponse & { agent_id: string }) {
  expect(incidents.agent_id).toBe('app-engineering');
  expect(incidents.items).toEqual([
    expect.objectContaining({
      incident_id: 'evt_contract_peer_watch',
      kind: 'peer_watch_alert',
      status: 'open',
      severity: 'orange',
      correlation_id: 'corr-contract',
      evidence_refs: ['/tmp/contract-peer-watch.md']
    })
  ]);
}

function expectAgentInteractionsContract(interactions: AgentInteractionsResponse) {
  expect(interactions.agent_id).toBe('app-engineering');
  expect(interactions.items).toEqual([
    expect.objectContaining({
      interaction_id: 'interaction:evt_contract_peer_watch',
      interaction_type: 'peer_watch',
      participant_agent_ids: ['app-engineering', 'protocol-engineering', 'team-lead'],
      severity: 'orange',
      correlation_id: 'corr-contract',
      source_kind: 'controller_event'
    })
  ]);
}

function expectPeerWatchAlertsContract(alerts: PeerWatchAlertsResponse) {
  expect(alerts.items).toEqual([
    expect.objectContaining({
      alert_id: 'evt_contract_peer_watch',
      ts: '2026-03-09T18:45:00.000Z',
      target_agent_id: 'app-engineering',
      observer_agent_id: 'team-lead',
      watcher_agent_ids: ['protocol-engineering'],
      status: 'open',
      evidence_count: 1
    })
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
