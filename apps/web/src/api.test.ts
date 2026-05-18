import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  RequestError,
  fetchAccountabilityReplay,
  fetchAgentDetail,
  fetchAgentEvents,
  fetchAgentIncidents,
  fetchAgentInteractions,
  fetchCollectorEvidenceCoverage,
  fetchCollectorSnapshot,
  fetchCollectorSourceHealth,
  fetchEvidenceRecord,
  fetchEvidenceRecords,
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

describe('fetchAccountabilityReplay', () => {
  it('passes explicit bounds and replay anchors through to the backend query string', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            generated_at: '2026-03-09T19:00:00.000Z',
            query: {
              event_id: 'evt app/review#1',
              evidence_ref: '/tmp/evidence ref#1.md',
              correlation_id: 'corr replay',
              agent_id: 'app-engineering',
              source_kind: 'workspace_file',
              artifact_kind: 'evidence_ref',
              limit: 3,
              window: '15m'
            },
            accountability: {
              basis: 'event_log_and_existing_read_models',
              bounded_by: {
                limit: 3,
                window: '15m'
              },
              event_count: 0,
              interaction_count: 0,
              artifact_count: 0,
              participant_agent_ids: [],
              actor_ids: [],
              evidence_refs: [],
              source_kind_buckets: {},
              first_ts: null,
              last_ts: null
            },
            ledger: [],
            events: [],
            interactions: [],
            memory_artifacts: []
          }),
          {
            headers: JSON_HEADERS
          }
        )
      )
    );

    await fetchAccountabilityReplay({
      limit: 3,
      window: '15m',
      eventId: 'evt app/review#1',
      evidenceRef: '/tmp/evidence ref#1.md',
      correlationId: 'corr replay',
      agentId: 'app-engineering',
      sourceKind: 'workspace_file',
      artifactKind: 'evidence_ref'
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/accountability/replay?limit=3&window=15m&event_id=evt+app%2Freview%231&evidence_ref=%2Ftmp%2Fevidence+ref%231.md&correlation_id=corr+replay&agent_id=app-engineering&source_kind=workspace_file&artifact_kind=evidence_ref',
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
              evidence_coverage: {
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
                    latest_evidence_at: '2026-03-09T18:04:30.000Z',
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
      evidence_coverage: {
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
            latest_evidence_at: '2026-03-09T18:04:30.000Z',
            confidence_level: 'high'
          }
        ]
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

describe('fetchCollectorEvidenceCoverage', () => {
  it('unwraps the lightweight collector evidence coverage projection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            item: {
              collected_at: '2026-03-09T18:05:00.000Z',
              actor_id: 'team-lead',
              evidence_ref_count: 2,
              covered_agent_count: 1,
              low_confidence_agent_ids: ['growth-revenue'],
              source_kind_buckets: {
                workspace_file: 1,
                workspace_root: 0,
                tmux_observation: 1
              },
              agent_items: [
                {
                  agent_id: 'growth-revenue',
                  evidence_ref_count: 2,
                  source_kinds: ['tmux_observation', 'workspace_file'],
                  latest_evidence_at: '2026-03-09T18:04:30.000Z',
                  confidence_level: 'medium'
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

    const coverage = await fetchCollectorEvidenceCoverage();

    expect(coverage).not.toBeNull();
    if (!coverage) {
      throw new Error('expected collector evidence coverage');
    }
    expect(coverage.collected_at).toBe('2026-03-09T18:05:00.000Z');
    expect(coverage.actor_id).toBe('team-lead');
    expect(coverage).toMatchObject({
      evidence_ref_count: 2,
      covered_agent_count: 1,
      low_confidence_agent_ids: ['growth-revenue'],
      agent_items: [
        {
          agent_id: 'growth-revenue',
          evidence_ref_count: 2,
          latest_evidence_at: '2026-03-09T18:04:30.000Z',
          confidence_level: 'medium'
        }
      ]
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/collectors/controller-snapshot/evidence-coverage',
      expect.objectContaining({ signal: undefined })
    );
  });

  it('passes exact evidence coverage filters through to the read-only projection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ item: null }), {
          headers: JSON_HEADERS
        })
      )
    );

    await expect(
      fetchCollectorEvidenceCoverage({
        agentId: 'app-engineering',
        sourceKind: 'tmux_observation',
        confidenceLevel: 'low',
        limit: 2
      })
    ).resolves.toBeNull();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/collectors/controller-snapshot/evidence-coverage?agent_id=app-engineering&source_kind=tmux_observation&confidence_level=low&limit=2',
      expect.objectContaining({ signal: undefined })
    );
  });
});

describe('fetchCollectorSourceHealth', () => {
  it('unwraps the bounded collector source-health projection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            item: {
              collected_at: '2026-03-09T18:05:00.000Z',
              collector_snapshot_id: 'collector-snapshot:2026-03-09T18:05:00.000Z',
              actor_id: 'team-lead',
              summary: {
                agent_count: 1,
                source_kind_buckets: {
                  workspace_root: { observed: 1, degraded: 0, missing: 0, error: 0 },
                  workspace_files: { observed: 0, degraded: 1, missing: 0, error: 0 },
                  tmux_session: { observed: 1, degraded: 0, missing: 0, error: 0 },
                  hermes_profile: { observed: 1, degraded: 0, missing: 0, error: 0 },
                  hermes_session: { observed: 0, degraded: 1, missing: 0, error: 0 }
                },
                status_buckets: {
                  observed: 2,
                  degraded: 1,
                  missing: 0,
                  error: 0
                }
              },
              agent_items: [
                {
                  agent_id: 'app-engineering',
                  workspace_root: '/tmp/app-engineering',
                  session_ref: '5-web3-app-engineering',
                  source_health: {
                    workspace_files: {
                      status: 'degraded',
                      expected_files: ['inbox.md', 'outbox.md', 'todo.md'],
                      observed_count: 1,
                      missing_count: 2,
                      error_count: 0,
                      last_observed_at: '2026-03-09T18:04:00.000Z',
                      degraded_reasons: ['missing workspace files: inbox.md, todo.md']
                    },
                    hermes_profile: {
                      status: 'observed',
                      profile_id: 'app-engineering',
                      evidence_ref: 'hermes://profile/app-engineering',
                      last_observed_at: '2026-03-09T18:04:15.000Z',
                      degraded_reasons: []
                    },
                    hermes_session: {
                      status: 'degraded',
                      expected_session_ref: '5-web3-app-engineering',
                      evidence_ref: 'hermes://session/5-web3-app-engineering',
                      last_observed_at: '2026-03-09T18:04:20.000Z',
                      degraded_reasons: ['Hermes session stale']
                    }
                  },
                  evidence_ref_count: 2,
                  evidence_refs: ['/tmp/app-engineering/outbox.md'],
                  latest_evidence_at: '2026-03-09T18:04:30.000Z'
                }
              ],
              runtime_source_evidence: {
                unmapped_tmux_sessions: [],
                unmapped_hermes_sources: [
                  {
                    source_kind: 'hermes_profile',
                    evidence_ref: 'hermes://profile/unseeded-profile',
                    profile_id: 'unseeded-profile',
                    session_ref: null,
                    observed_at: '2026-03-09T18:04:10.000Z',
                    status: 'observed',
                    degraded_reasons: []
                  }
                ]
              }
            }
          }),
          {
            headers: JSON_HEADERS
          }
        )
      )
    );

    const sourceHealth = await fetchCollectorSourceHealth({ limit: 7 });

    expect(sourceHealth).not.toBeNull();
    expect(sourceHealth?.collector_snapshot_id).toBe('collector-snapshot:2026-03-09T18:05:00.000Z');
    expect(sourceHealth?.summary.status_buckets.degraded).toBe(1);
    expect(sourceHealth?.agent_items[0].source_health.workspace_files?.status).toBe('degraded');
    expect(sourceHealth?.agent_items[0].source_health.hermes_session?.status).toBe('degraded');
    expect(sourceHealth?.runtime_source_evidence?.unmapped_hermes_sources?.[0]).toMatchObject({
      source_kind: 'hermes_profile',
      profile_id: 'unseeded-profile'
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/collectors/controller-snapshot/source-health?limit=7',
      expect.objectContaining({ signal: undefined })
    );
  });

  it('returns null when the source-health projection is absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ item: null }), {
          headers: JSON_HEADERS
        })
      )
    );

    await expect(fetchCollectorSourceHealth({ limit: 7 })).resolves.toBeNull();
  });
});

describe('fetchEvidenceRecords', () => {
  it('requests the max read-model slice by default so ledger callers do not get the oldest short prefix', async () => {
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

    await expect(fetchEvidenceRecords()).resolves.toEqual([]);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/evidence-records?newest_first=true&limit=200',
      expect.objectContaining({ signal: undefined })
    );
  });

  it('passes only supported evidence-record filters through to the read-only ledger endpoint', async () => {
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

    await expect(
      fetchEvidenceRecords({
        agentId: 'app engineering',
        sourceKind: 'tmux_observation',
        evidenceRole: 'runtime activity',
        evidenceRef: '/tmp/evidence ref#1.md',
        sourceStatus: 'active',
        collectorSnapshotId: 'snapshot 2026/03/09',
        correlationId: 'corr app/review#1',
        outputCandidate: false,
        mapped: true,
        observedSince: '2026-03-09T18:58:30.000Z',
        observedUntil: '2026-03-09T18:59:00.000Z',
        collectedSince: '2026-03-09T18:59:00.000Z',
        collectedUntil: '2026-03-09T19:00:00.000Z',
        limit: 7
      })
    ).resolves.toEqual([]);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/evidence-records?agent_id=app+engineering&source_kind=tmux_observation&evidence_role=runtime+activity&evidence_ref=%2Ftmp%2Fevidence+ref%231.md&source_status=active&collector_snapshot_id=snapshot+2026%2F03%2F09&correlation_id=corr+app%2Freview%231&output_candidate=false&mapped=true&observed_since=2026-03-09T18%3A58%3A30.000Z&observed_until=2026-03-09T18%3A59%3A00.000Z&collected_since=2026-03-09T18%3A59%3A00.000Z&collected_until=2026-03-09T19%3A00%3A00.000Z&newest_first=true&limit=7',
      expect.objectContaining({ signal: undefined })
    );
  });

  it('omits blank and null evidence-record filter values', async () => {
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

    await expect(
      fetchEvidenceRecords({
        agentId: '',
        sourceKind: null,
        evidenceRole: '',
        evidenceRef: null,
        sourceStatus: '',
        collectorSnapshotId: null,
        correlationId: '',
        outputCandidate: false,
        mapped: false,
        observedSince: '',
        observedUntil: null,
        collectedSince: undefined,
        collectedUntil: '',
        newestFirst: false,
        limit: 3
      })
    ).resolves.toEqual([]);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/evidence-records?output_candidate=false&mapped=false&newest_first=false&limit=3',
      expect.objectContaining({ signal: undefined })
    );
  });

  it('allows fetchEvidenceRecords callers to opt out of newest-first ordering explicitly', async () => {
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

    await expect(fetchEvidenceRecords({ newestFirst: false, limit: 3 })).resolves.toEqual([]);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/evidence-records?newest_first=false&limit=3',
      expect.objectContaining({ signal: undefined })
    );
  });
});

describe('fetchEvidenceRecord', () => {
  const record = {
    evidence_id: 'collector-snapshot:2026-03-09T18:59:00.000Z:app engineering:workspace_file:/tmp/evidence ref#1.md:0',
    observed_at: '2026-03-09T18:58:30.000Z',
    collected_at: '2026-03-09T18:59:00.000Z',
    agent_id: 'app-engineering',
    source_kind: 'workspace_file',
    evidence_ref: '/tmp/evidence ref#1.md',
    evidence_role: 'runtime activity',
    source_status: 'active',
    output_candidate: false,
    collector_snapshot_id: 'collector-snapshot:2026-03-09T18:59:00.000Z',
    correlation_id: 'corr-app-review',
    degraded_reasons: [],
    metadata: {}
  };

  it('URL-encodes the evidence_id path parameter and unwraps the item envelope without default query params', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ item: record }), {
          headers: JSON_HEADERS
        })
      )
    );

    await expect(fetchEvidenceRecord(record.evidence_id)).resolves.toEqual(record);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/evidence-records/collector-snapshot%3A2026-03-09T18%3A59%3A00.000Z%3Aapp%20engineering%3Aworkspace_file%3A%2Ftmp%2Fevidence%20ref%231.md%3A0',
      expect.objectContaining({ signal: undefined })
    );
  });

  it('returns null when the backend envelope item is null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ item: null }), {
          headers: JSON_HEADERS
        })
      )
    );

    await expect(fetchEvidenceRecord('missing-record')).resolves.toBeNull();
  });

  it('maps unknown evidence record 404 responses into RequestError metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'not_found',
            details: 'unknown evidence record missing-record'
          }),
          {
            status: 404,
            headers: JSON_HEADERS
          }
        )
      )
    );

    await expect(fetchEvidenceRecord('missing-record')).rejects.toMatchObject({
      name: 'RequestError',
      status: 404,
      code: 'not_found',
      message: 'unknown evidence record missing-record'
    });
  });
});

describe('fetchAgentDetail', () => {
  it('omits the query string when callers omit limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            item: {
              agent_id: 'app-engineering',
              current_state: 'blocked',
              active_task: 'Fix the contract drift',
              current_location: 'desk-app-engineering',
              latest_heartbeat: null,
              open_peer_watch_alerts: [],
              recent_events: [],
              recent_interactions: [],
              recent_incidents: [],
              recent_handoffs: [],
              recent_reboots: []
            }
          }),
          {
            headers: JSON_HEADERS
          }
        )
      )
    );

    await fetchAgentDetail('app-engineering');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/agents/app-engineering',
      expect.objectContaining({ signal: undefined })
    );
  });

  it('passes explicit limit through to the backend query string', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            item: {
              agent_id: 'app-engineering',
              current_state: 'blocked',
              active_task: 'Fix the contract drift',
              current_location: 'desk-app-engineering',
              latest_heartbeat: null,
              open_peer_watch_alerts: [],
              recent_events: [],
              recent_interactions: [],
              recent_incidents: [],
              recent_handoffs: [],
              recent_reboots: []
            }
          }),
          {
            headers: JSON_HEADERS
          }
        )
      )
    );

    await fetchAgentDetail('app-engineering', { limit: 2 });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/agents/app-engineering?limit=2',
      expect.objectContaining({ signal: undefined })
    );
  });

  it('unwraps the item envelope and preserves latest heartbeat, peer-watch alerts, and recent slices', async () => {
    const item = {
      agent_id: 'app-engineering',
      display_name: 'App Engineering Agent',
      current_state: 'blocked',
      active_task: 'Fix the contract drift',
      current_location: 'desk-app-engineering',
      latest_heartbeat: {
        agent_id: 'app-engineering',
        received_at: '2026-03-09T18:59:00.000Z'
      },
      open_peer_watch_alerts: [
        {
          alert_id: 'evt_contract_peer_watch',
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
      ],
      recent_events: [
        {
          event_id: 'evt_contract_peer_watch',
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
      ],
      recent_interactions: [
        {
          interaction_id: 'interaction:evt_contract_peer_watch',
          interaction_type: 'peer_watch',
          correlation_id: 'corr-app-review',
          started_at: '2026-03-09T18:45:00.000Z',
          participant_agent_ids: ['app-engineering', 'protocol-engineering'],
          trigger_event_id: 'evt_contract_peer_watch',
          severity: 'orange',
          evidence_refs: ['/tmp/contract-peer-watch.md'],
          source_kind: 'controller_event',
          summary: 'Protocol engineering flagged the contract drift'
        }
      ],
      recent_incidents: [
        {
          incident_id: 'evt_contract_peer_watch',
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
      ],
      recent_handoffs: [],
      recent_reboots: []
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ item }), {
          headers: JSON_HEADERS
        })
      )
    );

    await expect(fetchAgentDetail('app-engineering')).resolves.toEqual(item);
  });

  it('maps unknown-agent 404 responses into RequestError metadata for detail reads', async () => {
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

    await expect(fetchAgentDetail('unknown-agent')).rejects.toMatchObject({
      name: 'RequestError',
      status: 404,
      code: 'not_found',
      message: 'unknown agent unknown-agent'
    });
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

  it('passes limit, window, interaction_type, counterparty_agent_id, severity, correlation_id, event_id, and evidence_ref filters through to the backend query string', async () => {
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
      correlationId: 'corr-app-review',
      eventId: 'evt-app-review',
      evidenceRef: '/tmp/contract-peer-watch.md'
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/agents/app-engineering/interactions?limit=3&window=30m&interaction_type=peer_watch&counterparty_agent_id=protocol-engineering&severity=orange&correlation_id=corr-app-review&event_id=evt-app-review&evidence_ref=%2Ftmp%2Fcontract-peer-watch.md',
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
  it('passes limit, window, agent_id, correlation_id, artifact_ref, source_kind, and evidence facet filters through to the backend query string', async () => {
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
      sourceKind: 'workspace_file',
      artifactKind: 'workspace_file'
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/memory/artifacts?limit=4&window=30m&agent_id=app-engineering&correlation_id=corr-app-review&artifact_ref=%2Ftmp%2Fapp-engineering%2Ftodo.md&event_type=peer_watch_alert_raised&severity=orange&source_kind=workspace_file&artifact_kind=workspace_file',
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

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/memory/artifacts?limit=10&window=60m',
      expect.objectContaining({ signal: undefined })
    );
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
