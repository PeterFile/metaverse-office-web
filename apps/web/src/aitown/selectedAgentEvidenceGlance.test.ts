import { describe, expect, it } from 'vitest';

import { deriveSelectedAgentEvidenceGlance } from './selectedAgentEvidenceGlance';
import { expectNoForbiddenPublicUiText } from '../test/publicLeakSentinel';
import type {
  AgentEvidenceSpineSummary,
  CollectorEvidenceCoverage,
  CollectorSourceHealthProjection
} from '../types';

const evidenceSpineSummary: AgentEvidenceSpineSummary = {
  agent_count: 2,
  returned_limit: 200,
  total_count: 9,
  mapped_count: 7,
  unmapped_count: 2,
  agents: [
    {
      agent_id: 'app-engineering',
      evidence_count: 6,
      output_candidate_buckets: { true: 2, false: 4 },
      source_kind_buckets: {
        workspace_file: 3,
        tmux_observation: 2,
        hermes_session: 1
      },
      evidence_role_buckets: {
        agent_output: 2,
        source_evidence: 4
      },
      source_status_buckets: {
        observed: 5,
        missing: 1
      },
      source_gap_buckets: {
        missing: 1
      },
      latest_observed_at: '2026-03-09T18:04:45.000Z',
      latest_collected_at: '2026-03-09T18:05:00.000Z'
    },
    {
      agent_id: 'growth-revenue',
      evidence_count: 0,
      output_candidate_buckets: { true: 0, false: 0 },
      source_kind_buckets: {},
      evidence_role_buckets: {},
      source_status_buckets: {},
      source_gap_buckets: {},
      latest_observed_at: null,
      latest_collected_at: null
    }
  ],
  unmapped_evidence_summary: {
    total_count: 2,
    source_kind_buckets: { hermes_profile: 2 },
    evidence_role_buckets: { runtime_source: 2 },
    source_status_buckets: { observed: 2 },
    latest_observed_at: '2026-03-09T18:04:00.000Z',
    latest_collected_at: '2026-03-09T18:05:00.000Z'
  }
};

const coverage: CollectorEvidenceCoverage = {
  collected_at: '2026-03-09T18:05:00.000Z',
  collector_snapshot_id: 'collector-snapshot:2026-03-09T18:05:00.000Z',
  actor_id: 'team-lead',
  evidence_ref_count: 4,
  covered_agent_count: 2,
  low_confidence_agent_ids: ['growth-revenue'],
  source_kind_buckets: {
    workspace_file: 2,
    workspace_root: 0,
    tmux_observation: 2
  },
  agent_items: [
    {
      agent_id: 'app-engineering',
      evidence_ref_count: 2,
      source_kinds: ['workspace_file', 'tmux_observation'],
      latest_evidence_at: '2026-03-09T18:04:45.000Z',
      confidence_level: 'high'
    },
    {
      agent_id: 'growth-revenue',
      evidence_ref_count: 1,
      source_kinds: ['workspace_file'],
      latest_evidence_at: null,
      confidence_level: 'medium'
    }
  ]
};

const sourceHealth: CollectorSourceHealthProjection = {
  collected_at: '2026-03-16T09:01:00.000Z',
  collector_snapshot_id: 'collector-snapshot:2026-03-16T09:01:00.000Z',
  actor_id: 'team-lead',
  summary: {
    agent_count: 1,
    source_kind_buckets: {
      workspace_root: { observed: 1, degraded: 0, missing: 0, error: 0 },
      workspace_files: { observed: 1, degraded: 0, missing: 0, error: 0 },
      tmux_session: { observed: 1, degraded: 0, missing: 0, error: 0 },
      hermes_profile: { observed: 0, degraded: 0, missing: 0, error: 0 },
      hermes_session: { observed: 0, degraded: 0, missing: 0, error: 0 }
    },
    status_buckets: {
      observed: 3,
      degraded: 0,
      missing: 0,
      error: 0
    }
  },
  agent_items: [
    {
      agent_id: 'support',
      workspace_root: '/tmp/support',
      session_ref: '7-web3-support',
      evidence_ref_count: 1,
      evidence_refs: ['/tmp/support/outbox.md', 'hermes://session/7-web3-support'],
      latest_evidence_at: '2026-03-16T08:59:30.000Z',
      source_health: {
        workspace_root: {
          status: 'observed',
          path: '/tmp/support',
          last_observed_at: '2026-03-16T08:59:00.000Z',
          degraded_reasons: []
        },
        tmux_session: {
          status: 'observed',
          expected_session_ref: '7-web3-support',
          observed_count: 1,
          last_observed_at: '2026-03-16T08:59:00.000Z',
          degraded_reasons: []
        }
      }
    }
  ]
};

describe('deriveSelectedAgentEvidenceGlance', () => {
  it('summarizes evidence-spine counts and buckets for the selected agent', () => {
    expect(
      deriveSelectedAgentEvidenceGlance({
        selectedAgentId: 'app-engineering',
        evidenceSpineSummary,
        evidenceCoverage: coverage,
        sourceHealth
      })
    ).toEqual([
      'Proof glance · 6 records · Sources workspace 3, tmux 2, Hermes 1',
      'Coverage gap · 1 · Roles source evidence 4, agent output 2 · Latest observed 2026-03-09T18:04:45.000Z'
    ]);
  });

  it('projects hostile evidence-spine bucket keys through safe labels', () => {
    const hostileSummary: AgentEvidenceSpineSummary = {
      ...evidenceSpineSummary,
      agents: [
        {
          agent_id: 'hostile-agent',
          evidence_count: 9,
          output_candidate_buckets: { true: 0, false: 9 },
          source_kind_buckets: {
            workspace_file: 3,
            '/Users/cwp/private/token.md': 2,
            'hermes://session/private': 1
          },
          evidence_role_buckets: {
            source_evidence: 4,
            webhook: 3,
            metadata: 2,
            dispatch: 1,
            route: 1,
            claim: 1,
            complete: 1,
            assign: 1
          },
          source_status_buckets: {
            observed: 4,
            'tmux://raw-session': 3,
            'control-plane': 2
          },
          source_gap_buckets: {
            missing: 1,
            'profile://admin': 2
          },
          latest_observed_at: '2026-03-09T18:04:45.000Z',
          latest_collected_at: '2026-03-09T18:05:00.000Z'
        }
      ]
    };

    const glance = deriveSelectedAgentEvidenceGlance({
      selectedAgentId: 'hostile-agent',
      evidenceSpineSummary: hostileSummary,
      evidenceCoverage: null,
      sourceHealth: null
    });
    const serialized = JSON.stringify(glance);

    expect(glance).toEqual([
      'Proof glance · 9 records · Sources workspace 3, Unknown 3',
      'Coverage gap · 3 · Roles source evidence 4, Unknown 10 · Latest observed 2026-03-09T18:04:45.000Z'
    ]);
    expectNoForbiddenPublicUiText(glance);
    expect(serialized).not.toContain('metadata');
  });

  it('shows missing summary rows as unavailable coverage gaps without fabricated activity', () => {
    expect(
      deriveSelectedAgentEvidenceGlance({
        selectedAgentId: 'missing',
        evidenceSpineSummary,
        evidenceCoverage: coverage,
        sourceHealth
      })
    ).toEqual(['Proof glance · unavailable', 'Coverage gap · selected-agent summary unavailable']);

    expect(
      deriveSelectedAgentEvidenceGlance({
        selectedAgentId: 'growth-revenue',
        evidenceSpineSummary,
        evidenceCoverage: coverage,
        sourceHealth
      })
    ).toEqual([
      'Proof glance · 0 records · Sources unavailable',
      'Coverage gap · 0 · Roles unavailable · Latest observed unavailable'
    ]);
  });

  it('summarizes coverage for the selected agent without raw refs', () => {
    expect(
      deriveSelectedAgentEvidenceGlance({
        selectedAgentId: 'app-engineering',
        evidenceCoverage: coverage,
        sourceHealth
      })
    ).toEqual([
      'Proof glance · 2 records · Sources tmux + workspace',
      'Coverage backed · Confidence high · Latest observed 2026-03-09T18:04:45.000Z'
    ]);
  });

  it('marks low-confidence and uncovered selected agents', () => {
    expect(
      deriveSelectedAgentEvidenceGlance({
        selectedAgentId: 'growth-revenue',
        evidenceCoverage: coverage,
        sourceHealth
      })
    ).toEqual([
      'Proof glance · 1 record · Sources workspace',
      'Coverage low confidence · Confidence medium · Latest observed unavailable'
    ]);

    expect(
      deriveSelectedAgentEvidenceGlance({
        selectedAgentId: 'sales',
        evidenceCoverage: coverage,
        sourceHealth
      })
    ).toEqual([
      'Proof glance · 0 records · Sources unavailable',
      'Coverage gap · loaded snapshot has no row'
    ]);
  });

  it('falls back to source health counts without leaking refs or paths', () => {
    const glance = deriveSelectedAgentEvidenceGlance({
      selectedAgentId: 'support',
      evidenceCoverage: null,
      sourceHealth
    });

    expect(glance).toEqual([
      'Proof glance · 1 record · Source-health snapshot',
      'Coverage source-health only · Latest observed 2026-03-16T08:59:30.000Z'
    ]);
    expect(glance).toHaveLength(2);
    expectNoForbiddenPublicUiText(glance);
  });

  it('returns null until a selected agent and loaded read model row exist', () => {
    expect(
      deriveSelectedAgentEvidenceGlance({
        selectedAgentId: null,
        evidenceCoverage: coverage,
        sourceHealth
      })
    ).toBeNull();
    expect(
      deriveSelectedAgentEvidenceGlance({
        selectedAgentId: 'missing',
        evidenceCoverage: null,
        sourceHealth: null
      })
    ).toBeNull();
  });
});
