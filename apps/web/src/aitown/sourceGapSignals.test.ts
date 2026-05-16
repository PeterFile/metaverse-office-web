import { describe, expect, it } from 'vitest';

import { deriveSourceGapChips, deriveSourceHealthWorldBadges } from './sourceGapSignals';
import type { CollectorSourceHealthProjection } from '../types';

const sourceHealth: CollectorSourceHealthProjection = {
  collected_at: '2026-03-16T09:01:00.000Z',
  actor_id: 'team-lead',
  summary: {
    agent_count: 3,
    source_kind_buckets: {
      workspace_root: { observed: 1, degraded: 0, missing: 1, error: 1 },
      workspace_files: { observed: 0, degraded: 1, missing: 1, error: 0 },
      tmux_session: { observed: 1, degraded: 0, missing: 1, error: 0 },
      hermes_profile: { observed: 0, degraded: 0, missing: 0, error: 0 },
      hermes_session: { observed: 0, degraded: 0, missing: 0, error: 0 }
    },
    status_buckets: {
      observed: 2,
      degraded: 1,
      missing: 3,
      error: 1
    }
  },
  agent_items: [
    {
      agent_id: 'app-engineering',
      workspace_root: '/tmp/app-engineering',
      session_ref: '5-web3-app-engineering',
      evidence_ref_count: 2,
      evidence_refs: ['/tmp/app-engineering/outbox.md'],
      latest_evidence_at: '2026-03-16T08:59:30.000Z',
      source_health: {
        workspace_files: {
          status: 'degraded',
          expected_files: ['inbox.md', 'outbox.md', 'todo.md'],
          observed_count: 1,
          missing_count: 2,
          error_count: 0,
          last_observed_at: '2026-03-16T08:59:00.000Z',
          degraded_reasons: ['missing workspace files: inbox.md, todo.md']
        }
      }
    },
    {
      agent_id: 'growth-revenue',
      workspace_root: '/tmp/growth-revenue',
      session_ref: '6-web3-growth-revenue',
      evidence_ref_count: 0,
      evidence_refs: [],
      latest_evidence_at: null,
      source_health: {
        workspace_root: {
          status: 'error',
          path: '/tmp/growth-revenue',
          last_observed_at: null,
          degraded_reasons: ['workspace root read failed']
        },
        tmux_session: {
          status: 'missing',
          expected_session_ref: '6-web3-growth-revenue',
          observed_count: 0,
          last_observed_at: null,
          degraded_reasons: ['tmux session not observed']
        }
      }
    },
    {
      agent_id: 'team-lead',
      workspace_root: '/tmp/team-lead',
      session_ref: '7-web3-team-lead',
      evidence_ref_count: 1,
      evidence_refs: ['/tmp/team-lead/outbox.md'],
      latest_evidence_at: '2026-03-16T08:58:30.000Z',
      source_health: {
        workspace_root: {
          status: 'missing',
          path: '/tmp/team-lead',
          last_observed_at: null,
          degraded_reasons: ['workspace root not observed']
        }
      }
    }
  ],
  runtime_source_evidence: {
    unmapped_tmux_sessions: []
  }
};

describe('deriveSourceGapChips', () => {
  it('returns at most three non-observed source gaps ordered by worst source status', () => {
    const chips = deriveSourceGapChips(sourceHealth, [
      { agent_id: 'app-engineering', display_name: 'App Engineering Agent' },
      { agent_id: 'growth-revenue', display_name: 'Growth Revenue Agent' },
      { agent_id: 'team-lead', display_name: 'Team Lead Agent' }
    ]);

    expect(chips).toEqual([
      {
        agentId: 'growth-revenue',
        displayName: 'Growth Revenue Agent',
        sourceDrilldownGroupKey: 'workspace',
        sourceKind: 'workspace_root',
        status: 'error',
        sourceLabel: 'Workspace root',
        detail: '0 refs · latest evidence unavailable',
        observedAtLabel: 'Not observed'
      },
      {
        agentId: 'growth-revenue',
        displayName: 'Growth Revenue Agent',
        sourceDrilldownGroupKey: 'tmux',
        sourceKind: 'tmux_session',
        status: 'missing',
        sourceLabel: 'Tmux session',
        detail: '0 observations · latest evidence unavailable',
        observedAtLabel: 'Not observed'
      },
      {
        agentId: 'team-lead',
        displayName: 'Team Lead Agent',
        sourceDrilldownGroupKey: 'workspace',
        sourceKind: 'workspace_root',
        status: 'missing',
        sourceLabel: 'Workspace root',
        detail: '1 evidence ref · latest evidence 2026-03-16T08:58:30.000Z',
        observedAtLabel: 'Not observed'
      }
    ]);
  });

  it('returns an empty no-gap state when every source is observed or absent', () => {
    expect(
      deriveSourceGapChips(
        {
          ...sourceHealth,
          agent_items: [
            {
              agent_id: 'app-engineering',
              workspace_root: '/tmp/app-engineering',
              session_ref: '5-web3-app-engineering',
              evidence_ref_count: 2,
              evidence_refs: ['/tmp/app-engineering/outbox.md'],
              latest_evidence_at: '2026-03-16T08:59:30.000Z',
              source_health: {
                workspace_root: {
                  status: 'observed',
                  path: '/tmp/app-engineering',
                  last_observed_at: '2026-03-16T08:59:00.000Z',
                  degraded_reasons: []
                }
              }
            }
          ]
        },
        [{ agent_id: 'app-engineering', display_name: 'App Engineering Agent' }]
      )
    ).toEqual([]);
  });

  it('does not turn Hermes runtime source health into legacy source-gap chips', () => {
    expect(
      deriveSourceGapChips(
        {
          ...sourceHealth,
          summary: {
            ...sourceHealth.summary,
            source_kind_buckets: {
              ...sourceHealth.summary.source_kind_buckets,
              hermes_session: { observed: 0, degraded: 1, missing: 0, error: 0 }
            }
          },
          agent_items: [
            {
              agent_id: 'app-engineering',
              workspace_root: '/tmp/app-engineering',
              session_ref: '5-web3-app-engineering',
              evidence_ref_count: 1,
              evidence_refs: ['hermes://session/5-web3-app-engineering'],
              latest_evidence_at: '2026-03-16T08:59:30.000Z',
              source_health: {
                hermes_session: {
                  status: 'degraded',
                  expected_session_ref: '5-web3-app-engineering',
                  evidence_ref: 'hermes://session/5-web3-app-engineering',
                  last_observed_at: '2026-03-16T08:59:00.000Z',
                  degraded_reasons: ['Hermes session stale']
                }
              }
            }
          ]
        },
        [{ agent_id: 'app-engineering', display_name: 'App Engineering Agent' }]
      )
    ).toEqual([]);
  });
});

describe('deriveSourceHealthWorldBadges', () => {
  it('returns one worst non-observed source evidence health badge per agent', () => {
    expect(deriveSourceHealthWorldBadges(sourceHealth)).toEqual([
      {
        agentId: 'growth-revenue',
        status: 'error'
      },
      {
        agentId: 'team-lead',
        status: 'missing'
      },
      {
        agentId: 'app-engineering',
        status: 'degraded'
      }
    ]);
  });

  it('omits agents whose source evidence health is fully observed or absent', () => {
    expect(
      deriveSourceHealthWorldBadges({
        ...sourceHealth,
        agent_items: [
          {
            agent_id: 'app-engineering',
            workspace_root: '/tmp/app-engineering',
            session_ref: '5-web3-app-engineering',
            evidence_ref_count: 2,
            evidence_refs: ['/tmp/app-engineering/outbox.md'],
            latest_evidence_at: '2026-03-16T08:59:30.000Z',
            source_health: {
              workspace_root: {
                status: 'observed',
                path: '/tmp/app-engineering',
                last_observed_at: '2026-03-16T08:59:00.000Z',
                degraded_reasons: []
              }
            }
          },
          {
            agent_id: 'team-lead',
            workspace_root: '/tmp/team-lead',
            session_ref: '7-web3-team-lead',
            evidence_ref_count: 1,
            evidence_refs: ['/tmp/team-lead/outbox.md'],
            latest_evidence_at: '2026-03-16T08:58:30.000Z',
            source_health: {}
          }
        ]
      })
    ).toEqual([]);
  });

  it('does not turn unmapped Hermes runtime sources into world badges', () => {
    expect(
      deriveSourceHealthWorldBadges({
        ...sourceHealth,
        agent_items: [
          {
            agent_id: 'app-engineering',
            workspace_root: '/tmp/app-engineering',
            session_ref: '5-web3-app-engineering',
            evidence_ref_count: 0,
            evidence_refs: [],
            latest_evidence_at: null,
            source_health: {}
          }
        ],
        runtime_source_evidence: {
          unmapped_tmux_sessions: [],
          unmapped_hermes_sources: [
            {
              source_kind: 'hermes_session',
              evidence_ref: 'hermes://session/unmapped-session',
              profile_id: null,
              session_ref: 'unmapped-session',
              observed_at: '2026-03-16T08:59:30.000Z',
              status: 'missing',
              degraded_reasons: ['Hermes session not mapped to an agent']
            }
          ]
        }
      })
    ).toEqual([]);
  });
});
