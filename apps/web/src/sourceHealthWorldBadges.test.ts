import { describe, expect, it } from 'vitest';
import { deriveSourceHealthWorldBadges, resolveWorstSourceHealthStatus } from './sourceHealthWorldBadges';
import type { CollectorSourceHealthProjection } from './types';

describe('sourceHealthWorldBadges', () => {
  it.each([
    ['degraded Hermes profile', { hermes_profile: makeHermesProfileHealth('degraded') }, 'degraded'],
    ['missing Hermes session', { hermes_session: makeHermesSessionHealth('missing') }, 'missing'],
    ['error Hermes session', { hermes_session: makeHermesSessionHealth('error') }, 'error'],
  ])('maps %s into a source evidence badge status', (_caseName, sourceHealth, expectedStatus) => {
    expect(resolveWorstSourceHealthStatus(sourceHealth)).toBe(expectedStatus);
  });

  it('uses Hermes profile and session health when choosing the worst mapped source status', () => {
    expect(
      resolveWorstSourceHealthStatus({
        workspace_root: {
          status: 'observed',
          path: '/tmp/app-engineering',
          last_observed_at: '2026-03-16T08:59:00.000Z',
          degraded_reasons: [],
        },
        workspace_files: {
          status: 'degraded',
          expected_files: ['README.md'],
          observed_count: 0,
          missing_count: 1,
          error_count: 0,
          last_observed_at: null,
          degraded_reasons: ['workspace file missing'],
        },
        tmux_session: {
          status: 'missing',
          expected_session_ref: '5-web3-app-engineering',
          observed_count: 0,
          last_observed_at: null,
          degraded_reasons: ['tmux session missing'],
        },
        hermes_profile: {
          status: 'error',
          profile_id: 'profile-app-engineering',
          evidence_ref: null,
          last_observed_at: null,
          degraded_reasons: ['Hermes profile read failed'],
        },
        hermes_session: {
          status: 'observed',
          expected_session_ref: 'hermes-session-app-engineering',
          evidence_ref: 'hermes://session/hermes-session-app-engineering',
          last_observed_at: '2026-03-16T08:59:00.000Z',
          degraded_reasons: [],
        },
      })
    ).toBe('error');
  });

  it('omits mapped Hermes sources that are only observed', () => {
    const sourceHealth: CollectorSourceHealthProjection = {
      collected_at: '2026-03-16T08:59:00.000Z',
      actor_id: 'team-lead',
      summary: {
        agent_count: 1,
        source_kind_buckets: {
          workspace_root: { observed: 0, degraded: 0, missing: 0, error: 0 },
          workspace_files: { observed: 0, degraded: 0, missing: 0, error: 0 },
          tmux_session: { observed: 0, degraded: 0, missing: 0, error: 0 },
          hermes_profile: { observed: 1, degraded: 0, missing: 0, error: 0 },
          hermes_session: { observed: 1, degraded: 0, missing: 0, error: 0 },
        },
        status_buckets: { observed: 2, degraded: 0, missing: 0, error: 0 },
      },
      agent_items: [
        {
          agent_id: 'app-engineering',
          workspace_root: '/tmp/app-engineering',
          session_ref: '5-web3-app-engineering',
          evidence_ref_count: 2,
          evidence_refs: [
            'hermes://profile/profile-app-engineering',
            'hermes://session/hermes-session-app-engineering',
          ],
          latest_evidence_at: '2026-03-16T08:59:00.000Z',
          source_health: {
            hermes_profile: {
              status: 'observed',
              profile_id: 'profile-app-engineering',
              evidence_ref: 'hermes://profile/profile-app-engineering',
              last_observed_at: '2026-03-16T08:59:00.000Z',
              degraded_reasons: [],
            },
            hermes_session: {
              status: 'observed',
              expected_session_ref: 'hermes-session-app-engineering',
              evidence_ref: 'hermes://session/hermes-session-app-engineering',
              last_observed_at: '2026-03-16T08:59:00.000Z',
              degraded_reasons: [],
            },
          },
        },
      ],
    };

    expect(deriveSourceHealthWorldBadges(sourceHealth)).toEqual([]);
  });
});

function makeHermesProfileHealth(status: 'degraded' | 'missing' | 'error') {
  return {
    status,
    profile_id: 'profile-app-engineering',
    evidence_ref: null,
    last_observed_at: null,
    degraded_reasons: [`Hermes profile ${status}`],
  };
}

function makeHermesSessionHealth(status: 'degraded' | 'missing' | 'error') {
  return {
    status,
    expected_session_ref: 'hermes-session-app-engineering',
    evidence_ref: null,
    last_observed_at: null,
    degraded_reasons: [`Hermes session ${status}`],
  };
}
