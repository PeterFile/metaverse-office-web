import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  RequestError,
  fetchCollectorSnapshot,
  fetchMemoryArtifacts,
  fetchOfficeOperations,
  fetchOfficeOverview,
  resolveApiUrl
} from './api';

const JSON_HEADERS = {
  'content-type': 'application/json'
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RequestError', () => {
  it('preserves status and code metadata for callers that need protocol-aware handling', () => {
    const error = new RequestError({
      message: 'unknown agent unknown-agent',
      status: 404,
      code: 'not_found'
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('RequestError');
    expect(error.message).toBe('unknown agent unknown-agent');
    expect(error.status).toBe(404);
    expect(error.code).toBe('not_found');
  });
});

describe('fetchOfficeOverview', () => {
  it('throws a RequestError with invalid_json_response when a JSON response body cannot be parsed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{', {
          status: 502,
          headers: {
            'content-type': 'application/json'
          }
        })
      )
    );

    await expect(fetchOfficeOverview()).rejects.toMatchObject({
      name: 'RequestError',
      status: 502,
      code: 'invalid_json_response',
      message: 'request_failed: invalid_json_response'
    });
  });

  it('throws a RequestError with non_json_response when the backend does not return JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('gateway unavailable', {
          status: 503,
          headers: {
            'content-type': 'text/plain'
          }
        })
      )
    );

    await expect(fetchOfficeOverview()).rejects.toMatchObject({
      name: 'RequestError',
      status: 503,
      code: 'non_json_response',
      message: 'request_failed: non_json_response'
    });
  });
});

describe('fetchOfficeOperations', () => {
  it('passes limit, state, and agent_id filters through to the backend query string', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            generated_at: '2026-03-09T19:00:00.000Z',
            summary: {
              item_count: 1,
              blocked_count: 1,
              reboot_recommended_count: 0,
              state_buckets: { blocked: 1 },
              severity_buckets: { normal: 0, yellow: 0, orange: 0, red: 1 }
            },
            items: []
          }),
          {
            headers: JSON_HEADERS
          }
        )
      )
    );

    await fetchOfficeOperations({
      limit: 1,
      state: 'blocked',
      agentId: 'app-engineering'
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/office/operations?limit=1&state=blocked&agent_id=app-engineering',
      expect.objectContaining({ signal: undefined })
    );
  });
});

describe('fetchCollectorSnapshot', () => {
  it('unwraps the latest collector snapshot item from the read-only backend envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            item: {
              collected_at: '2026-03-09T18:05:00.000Z',
              actor_id: 'team-lead',
              summary: {
                agent_count: 1,
                heartbeat_count: 1,
                tmux_observed_count: 1,
                workspace_observed_count: 1,
                reboot_recommended_count: 0
              },
              items: [
                {
                  agent_id: 'app-engineering',
                  workspace_root: '/tmp/app-engineering',
                  session_ref: '5-web3-app-engineering',
                  evidence_refs: ['/tmp/app-engineering/todo.md'],
                  workspace_observations: [],
                  tmux_observations: [],
                  supervision: {
                    watch_target: 'growth-revenue',
                    watched_by: ['team-lead'],
                    needs_attention: false
                  },
                  heartbeat: {
                    agent_id: 'app-engineering',
                    actor_id: 'team-lead',
                    received_at: '2026-03-09T18:05:00.000Z',
                    current_state: 'coding',
                    active_task: 'Implement HTTP handlers',
                    last_meaningful_output_at: '2026-03-09T18:04:30.000Z',
                    last_file_write_at: '2026-03-09T18:04:00.000Z',
                    current_blocker: '',
                    confidence_level: 'high',
                    reboot_recommended: false,
                    evidence_refs: ['/tmp/app-engineering/todo.md']
                  }
                }
              ]
            }
          }),
          {
            headers: JSON_HEADERS
          }
        )
      )
    );

    await expect(fetchCollectorSnapshot()).resolves.toMatchObject({
      collected_at: '2026-03-09T18:05:00.000Z',
      actor_id: 'team-lead',
      summary: {
        heartbeat_count: 1
      },
      items: [
        expect.objectContaining({
          agent_id: 'app-engineering',
          heartbeat: expect.objectContaining({
            current_state: 'coding'
          })
        })
      ]
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/collectors/controller-snapshot',
      expect.objectContaining({ signal: undefined })
    );
  });

  it('returns null when the backend has not collected a snapshot yet', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ item: null }),
          {
            headers: JSON_HEADERS
          }
        )
      )
    );

    await expect(fetchCollectorSnapshot()).resolves.toBeNull();
  });
});

describe('fetchMemoryArtifacts', () => {
  it('passes limit, window, agent_id, and correlation_id filters through to the backend query string', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            generated_at: '2026-03-09T19:00:00.000Z',
            items: []
          }),
          {
            headers: JSON_HEADERS
          }
        )
      )
    );

    await fetchMemoryArtifacts({
      limit: 4,
      window: '30m',
      agentId: 'app-engineering',
      correlationId: 'corr-app-review'
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/memory/artifacts?limit=4&window=30m&agent_id=app-engineering&correlation_id=corr-app-review',
      expect.objectContaining({ signal: undefined })
    );
  });

  it('loads the structured shared-memory artifact index envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            generated_at: '2026-03-09T19:00:00.000Z',
            items: [
              {
                artifact_ref: '/tmp/app-engineering/todo.md',
                artifact_kind: 'workspace_file',
                file_name: 'todo.md',
                first_seen_at: '2026-03-09T18:40:00.000Z',
                last_seen_at: '2026-03-09T18:58:30.000Z',
                mention_count: 3,
                agent_ids: ['app-engineering'],
                correlation_ids: ['corr-app-review'],
                source_kinds: ['controller_event', 'workspace_file'],
                latest_summary: 'Workflow evidence is still incomplete',
                latest_event_type: 'peer_watch_alert_raised',
                collector_last_modified_at: '2026-03-09T18:58:30.000Z'
              }
            ]
          }),
          {
            headers: JSON_HEADERS
          }
        )
      )
    );

    await expect(fetchMemoryArtifacts()).resolves.toMatchObject({
      generated_at: '2026-03-09T19:00:00.000Z',
      items: [
        expect.objectContaining({
          artifact_ref: '/tmp/app-engineering/todo.md',
          artifact_kind: 'workspace_file',
          file_name: 'todo.md',
          mention_count: 3,
          latest_event_type: 'peer_watch_alert_raised'
        })
      ]
    });
  });
});

describe('resolveApiUrl', () => {
  it('keeps same-origin relative paths when no API base URL is configured', () => {
    expect(resolveApiUrl('/office/overview')).toBe('/office/overview');
    expect(resolveApiUrl('/agents/app-engineering/workflow?limit=10&window=60m')).toBe(
      '/agents/app-engineering/workflow?limit=10&window=60m'
    );
  });

  it('prefixes request paths with a relative API base URL', () => {
    expect(resolveApiUrl('/agents/app-engineering/workflow?limit=10&window=60m', '/api')).toBe(
      '/api/agents/app-engineering/workflow?limit=10&window=60m'
    );
  });

  it('prefixes request paths with the configured API base URL', () => {
    expect(resolveApiUrl('/office/overview', 'https://api.example.test')).toBe(
      'https://api.example.test/office/overview'
    );
    expect(resolveApiUrl('/office/overview', 'https://api.example.test/root/')).toBe(
      'https://api.example.test/root/office/overview'
    );
    expect(resolveApiUrl('/agents/app-engineering/workflow?limit=10&window=60m', '/api')).toBe(
      '/api/agents/app-engineering/workflow?limit=10&window=60m'
    );
  });
});
