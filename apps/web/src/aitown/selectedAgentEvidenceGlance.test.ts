import { describe, expect, it } from 'vitest';

import { deriveSelectedAgentEvidenceGlance } from './selectedAgentEvidenceGlance';
import type { CollectorEvidenceCoverage, CollectorSourceHealthProjection } from '../types';

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
  it('summarizes coverage for the selected agent without raw refs', () => {
    expect(
      deriveSelectedAgentEvidenceGlance({
        selectedAgentId: 'app-engineering',
        evidenceCoverage: coverage,
        sourceHealth
      })
    ).toEqual([
      'Proof capsule · 2 evidence refs · Sources tmux + workspace',
      'Coverage backed · Confidence high · Latest evidence 2026-03-09T18:04:45.000Z'
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
      'Proof capsule · 1 evidence ref · Sources workspace',
      'Coverage low confidence · Confidence medium · Latest evidence unavailable'
    ]);

    expect(
      deriveSelectedAgentEvidenceGlance({
        selectedAgentId: 'sales',
        evidenceCoverage: coverage,
        sourceHealth
      })
    ).toEqual([
      'Proof capsule · 0 evidence refs · Sources unavailable',
      'Coverage uncovered in loaded snapshot'
    ]);
  });

  it('falls back to source health counts without leaking refs or paths', () => {
    const glance = deriveSelectedAgentEvidenceGlance({
      selectedAgentId: 'support',
      evidenceCoverage: null,
      sourceHealth
    });

    expect(glance).toEqual([
      'Proof capsule · 1 evidence ref · Source-health snapshot',
      'Coverage source-health only · Latest evidence 2026-03-16T08:59:30.000Z'
    ]);
    expect(glance).toHaveLength(2);
    const glanceText = glance?.join('\n') ?? '';
    expect(glanceText).not.toContain('/tmp/');
    expect(glanceText).not.toContain('hermes://');
    expect(glanceText).not.toContain('7-web3-support');
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
