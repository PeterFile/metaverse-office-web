import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  RequestError,
  fetchAgentEvents,
  fetchAgentIncidents,
  fetchAgentInteractions,
  fetchCollectorSnapshot,
  fetchMemoryArtifacts,
  fetchOfficeOperations,
  fetchOfficeOverview,
  fetchPeerWatchAlerts,
  fetchTimeline,
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
  it('passes limit, state, severity, and agent_id filters through to the backend query string', async () => {
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
      severity: 'red',
      agentId: 'app-engineering'
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/office/operations?limit=1&state=blocked&severity=red&agent_id=app-engineering',
      expect.objectContaining({ signal: undefined })
    );
  });
});

describe('fetchTimeline', () => {
  it('passes limit, window, event_id, agent_id, event_type, severity, source_kind, evidence_ref, and correlation_id filters through to the backend query string', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: []
          }),
          {
            headers: JSON_HEADERS
          }
        )
      )
    );

    await fetchTimeline({
      limit: 4,
      window: '30m',
      eventId: 'evt app/review#1',
      agentId: 'app-engineering',
      eventType: 'peer_watch_alert_raised',
      severity: 'orange',
      sourceKind: 'controller_event',
      evidenceRef: '/tmp/evidence ref#1.md',
      correlationId: 'corr-app-review'
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/timeline?limit=4&window=30m&agent_id=app-engineering&event_type=peer_watch_alert_raised&severity=orange&source_kind=controller_event&evidence_ref=%2Ftmp%2Fevidence+ref%231.md&correlation_id=corr-app-review&event_id=evt+app%2Freview%231',
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
              shared_artifacts: [],
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
      shared_artifacts: [],
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

describe('fetchAgentEvents', () => {
  it('applies the default bounded limit when callers omit event filters', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            agent_id: 'app-engineering',
            items: []
          }),
          {
            headers: JSON_HEADERS
          }
        )
      )
    );

    await fetchAgentEvents('app-engineering');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/agents/app-engineering/events?limit=10',
      expect.objectContaining({ signal: undefined })
    );
  });

  it('passes limit, event_type, severity, source_kind, evidence_ref, and correlation_id filters through to the backend query string', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            agent_id: 'app-engineering',
            items: []
          }),
          {
            headers: JSON_HEADERS
          }
        )
      )
    );

    await fetchAgentEvents('app-engineering', {
      limit: 2,
      eventType: 'peer_watch_alert_raised',
      severity: 'orange',
      sourceKind: 'controller_event',
      evidenceRef: '/tmp/event evidence#2.md',
      correlationId: 'corr-app-review'
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/agents/app-engineering/events?limit=2&event_type=peer_watch_alert_raised&severity=orange&source_kind=controller_event&evidence_ref=%2Ftmp%2Fevent+evidence%232.md&correlation_id=corr-app-review',
      expect.objectContaining({ signal: undefined })
    );
  });

  it('maps unknown-agent 404 responses into RequestError metadata for event reads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'not_found',
            details: 'unknown agent unknown-agent'
          }),
          {
            status: 404,
            headers: JSON_HEADERS
          }
        )
      )
    );

    await expect(fetchAgentEvents('unknown-agent')).rejects.toMatchObject({
      name: 'RequestError',
      status: 404,
      code: 'not_found',
      message: 'unknown agent unknown-agent'
    });
  });

  it('loads the agent-scoped event envelope returned by the backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            agent_id: 'app-engineering',
            items: [
              {
                event_id: 'evt-app-review',
                ts: '2026-03-09T18:45:00.000Z',
                agent_id: 'app-engineering',
                actor_id: 'team-lead',
                agent_role: 'app-engineering',
                event_type: 'peer_watch_alert_raised',
                severity: 'orange',
                current_state: 'blocked',
                active_task: 'Fix the contract drift',
                location: 'review-zone',
                summary: 'Protocol engineering flagged the contract drift',
                correlation_id: 'corr-app-review',
                counterparty_agent_ids: ['protocol-engineering'],
                evidence_refs: ['/tmp/contract-peer-watch.md'],
                source_kind: 'controller_event',
                metadata: {}
              }
            ]
          }),
          {
            headers: JSON_HEADERS
          }
        )
      )
    );

    await expect(fetchAgentEvents('app-engineering')).resolves.toMatchObject({
      agent_id: 'app-engineering',
      items: [
        expect.objectContaining({
          event_id: 'evt-app-review',
          agent_role: 'app-engineering',
          event_type: 'peer_watch_alert_raised',
          correlation_id: 'corr-app-review'
        })
      ]
    });
  });
});

describe('fetchAgentInteractions', () => {
  it('applies the default bounded limit and window when callers omit interaction filters', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            agent_id: 'app-engineering',
            items: []
          }),
          {
            headers: JSON_HEADERS
          }
        )
      )
    );

    await fetchAgentInteractions('app-engineering');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/agents/app-engineering/interactions?limit=10&window=60m',
      expect.objectContaining({ signal: undefined })
    );
  });

  it('passes limit, window, interaction_type, counterparty_agent_id, severity, and correlation_id filters through to the backend query string', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            agent_id: 'app-engineering',
            items: []
          }),
          {
            headers: JSON_HEADERS
          }
        )
      )
    );

    await fetchAgentInteractions('app-engineering', {
      limit: 3,
      window: '30m',
      interactionType: 'peer_watch',
      counterpartyAgentId: 'protocol-engineering',
      severity: 'orange',
      correlationId: 'corr-app-review'
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/agents/app-engineering/interactions?limit=3&window=30m&interaction_type=peer_watch&counterparty_agent_id=protocol-engineering&severity=orange&correlation_id=corr-app-review',
      expect.objectContaining({ signal: undefined })
    );
  });

  it('maps unknown-agent 404 responses into RequestError metadata for interaction reads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'not_found',
            details: 'unknown agent unknown-agent'
          }),
          {
            status: 404,
            headers: JSON_HEADERS
          }
        )
      )
    );

    await expect(fetchAgentInteractions('unknown-agent')).rejects.toMatchObject({
      name: 'RequestError',
      status: 404,
      code: 'not_found',
      message: 'unknown agent unknown-agent'
    });
  });

  it('loads the agent-scoped interaction envelope returned by the backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            agent_id: 'app-engineering',
            items: [
              {
                interaction_id: 'interaction:evt-app-review',
                interaction_type: 'peer_watch',
                correlation_id: 'corr-app-review',
                started_at: '2026-03-09T18:40:00.000Z',
                ended_at: '2026-03-09T18:45:00.000Z',
                participant_agent_ids: ['app-engineering', 'protocol-engineering', 'team-lead'],
                trigger_event_id: 'evt-app-review',
                before_state: 'coding',
                after_state: 'blocked',
                severity: 'orange',
                evidence_refs: ['/tmp/contract-peer-watch.md'],
                summary: 'Protocol engineering flagged the contract drift',
                related_event_ids: ['evt-app-review']
              }
            ]
          }),
          {
            headers: JSON_HEADERS
          }
        )
      )
    );

    await expect(fetchAgentInteractions('app-engineering')).resolves.toMatchObject({
      agent_id: 'app-engineering',
      items: [
        expect.objectContaining({
          interaction_id: 'interaction:evt-app-review',
          interaction_type: 'peer_watch',
          participant_agent_ids: ['app-engineering', 'protocol-engineering', 'team-lead']
        })
      ]
    });
  });
});

describe('fetchAgentIncidents', () => {
  it('applies the default bounded limit and window when callers omit incident filters', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            agent_id: 'app-engineering',
            items: []
          }),
          {
            headers: JSON_HEADERS
          }
        )
      )
    );

    await fetchAgentIncidents('app-engineering');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/agents/app-engineering/incidents?limit=10&window=60m',
      expect.objectContaining({ signal: undefined })
    );
  });

  it('passes kind, severity, status, correlation_id, limit, and window filters through to the backend query string', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            agent_id: 'app-engineering',
            items: []
          }),
          {
            headers: JSON_HEADERS
          }
        )
      )
    );

    await fetchAgentIncidents('app-engineering', {
      kind: 'peer_watch_alert',
      severity: 'orange',
      status: 'open',
      correlationId: 'corr-app-review',
      limit: 3,
      window: '30m'
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/agents/app-engineering/incidents?limit=3&window=30m&kind=peer_watch_alert&severity=orange&status=open&correlation_id=corr-app-review',
      expect.objectContaining({ signal: undefined })
    );
  });

  it('maps unknown-agent 404 responses into RequestError metadata for incident reads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'not_found',
            details: 'unknown agent unknown-agent'
          }),
          {
            status: 404,
            headers: JSON_HEADERS
          }
        )
      )
    );

    await expect(fetchAgentIncidents('unknown-agent')).rejects.toMatchObject({
      name: 'RequestError',
      status: 404,
      code: 'not_found',
      message: 'unknown agent unknown-agent'
    });
  });

  it('loads the agent-scoped incident envelope returned by the backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            agent_id: 'app-engineering',
            items: [
              {
                incident_id: 'evt-app-review',
                kind: 'peer_watch_alert',
                ts: '2026-03-09T18:45:00.000Z',
                agent_id: 'app-engineering',
                actor_id: 'team-lead',
                status: 'open',
                severity: 'orange',
                summary: 'Protocol engineering flagged the contract drift',
                correlation_id: 'corr-app-review',
                evidence_refs: ['/tmp/contract-peer-watch.md'],
                counterparty_agent_ids: ['protocol-engineering'],
                source_kind: 'controller_event'
              }
            ]
          }),
          {
            headers: JSON_HEADERS
          }
        )
      )
    );

    await expect(fetchAgentIncidents('app-engineering')).resolves.toMatchObject({
      agent_id: 'app-engineering',
      items: [
        expect.objectContaining({
          incident_id: 'evt-app-review',
          kind: 'peer_watch_alert',
          status: 'open',
          correlation_id: 'corr-app-review'
        })
      ]
    });
  });
});

describe('fetchPeerWatchAlerts', () => {
  it('applies the default bounded limit when callers omit alert filters', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: []
          }),
          {
            headers: JSON_HEADERS
          }
        )
      )
    );

    await fetchPeerWatchAlerts();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/peer-watch/alerts?limit=10',
      expect.objectContaining({ signal: undefined })
    );
  });

  it('passes read-only peer-watch filters through to the backend query string', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: []
          }),
          {
            headers: JSON_HEADERS
          }
        )
      )
    );

    await fetchPeerWatchAlerts({
      status: 'open',
      targetAgentId: 'app-engineering',
      watcherAgentId: 'protocol-engineering',
      observerAgentId: 'team-lead',
      correlationId: 'corr-app-review',
      severity: 'orange',
      limit: 2
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/peer-watch/alerts?status=open&target_agent_id=app-engineering&watcher_agent_id=protocol-engineering&observer_agent_id=team-lead&correlation_id=corr-app-review&severity=orange&limit=2',
      expect.objectContaining({ signal: undefined })
    );
  });

  it('supports the backward-compatible agent_id alias for peer-watch filters', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: []
          }),
          {
            headers: JSON_HEADERS
          }
        )
      )
    );

    await fetchPeerWatchAlerts({
      agentId: 'app-engineering',
      limit: 2
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/peer-watch/alerts?agent_id=app-engineering&limit=2',
      expect.objectContaining({ signal: undefined })
    );
  });

  it('preserves conflicting target_agent_id and agent_id peer-watch filters for backend resolution', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: []
          }),
          {
            headers: JSON_HEADERS
          }
        )
      )
    );

    await fetchPeerWatchAlerts({
      targetAgentId: 'app-engineering',
      agentId: 'growth-revenue',
      limit: 2
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/peer-watch/alerts?target_agent_id=app-engineering&agent_id=growth-revenue&limit=2',
      expect.objectContaining({ signal: undefined })
    );
  });

  it('loads the peer-watch alert envelope returned by the backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [
              {
                alert_id: 'evt-app-review',
                ts: '2026-03-09T18:45:00.000Z',
                agent_id: 'app-engineering',
                target_agent_id: 'app-engineering',
                actor_id: 'team-lead',
                observer_agent_id: 'team-lead',
                watcher_agent_ids: ['protocol-engineering'],
                severity: 'orange',
                status: 'open',
                current_state: 'blocked',
                active_task: 'Fix the contract drift',
                summary: 'Protocol engineering flagged the contract drift',
                evidence_refs: ['/tmp/contract-peer-watch.md'],
                evidence_count: 1,
                correlation_id: 'corr-app-review',
                source_kind: 'controller_event',
                metadata: {}
              }
            ]
          }),
          {
            headers: JSON_HEADERS
          }
        )
      )
    );

    await expect(fetchPeerWatchAlerts()).resolves.toMatchObject({
      items: [
        expect.objectContaining({
          alert_id: 'evt-app-review',
          ts: '2026-03-09T18:45:00.000Z',
          target_agent_id: 'app-engineering',
          watcher_agent_ids: ['protocol-engineering']
        })
      ]
    });
  });
});

describe('fetchMemoryArtifacts', () => {
  it('passes limit, window, agent_id, correlation_id, artifact_ref, and evidence facet filters through to the backend query string', async () => {
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
      correlationId: 'corr-app-review',
      artifactRef: '/tmp/app-engineering/todo.md',
      eventType: 'peer_watch_alert_raised',
      severity: 'orange',
      artifactKind: 'workspace_file'
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/memory/artifacts?limit=4&window=30m&agent_id=app-engineering&correlation_id=corr-app-review&artifact_ref=%2Ftmp%2Fapp-engineering%2Ftodo.md&event_type=peer_watch_alert_raised&severity=orange&artifact_kind=workspace_file',
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
