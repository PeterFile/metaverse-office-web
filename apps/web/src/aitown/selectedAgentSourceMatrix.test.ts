import { describe, expect, it } from 'vitest';

import { deriveSelectedAgentSourceMatrixViewModel } from './selectedAgentSourceMatrix';
import type { AgentEvidenceSourceMatrix } from '../types';

const sourceMatrix: AgentEvidenceSourceMatrix = {
  agent_count: 2,
  returned_limit: 200,
  total_count: 15,
  mapped_count: 12,
  unmapped_count: 3,
  agents: [
    {
      agent_id: 'growth-revenue',
      sources: [
        {
          source_kind: 'workspace_file',
          evidence_count: 2,
          source_status_buckets: { observed: 2 },
          evidence_role_buckets: { source_evidence: 2 },
          output_candidate_buckets: { true: 0, false: 2 },
          latest_observed_at: '2026-03-09T18:02:00.000Z',
          latest_collected_at: '2026-03-09T18:05:00.000Z'
        }
      ]
    },
    {
      agent_id: 'app-engineering',
      sources: [
        {
          source_kind: 'workspace_file',
          evidence_count: 3,
          source_status_buckets: { observed: 2, degraded: 1 },
          evidence_role_buckets: { agent_output: 1, agent_plan: 2 },
          output_candidate_buckets: { true: 1, false: 2 },
          latest_observed_at: '2026-03-09T18:04:45.000Z',
          latest_collected_at: '2026-03-09T18:05:00.000Z'
        },
        {
          source_kind: 'tmux_observation',
          evidence_count: 3,
          source_status_buckets: { observed: 3 },
          evidence_role_buckets: { agent_output: 3 },
          output_candidate_buckets: { true: 3, false: 0 },
          latest_observed_at: '2026-03-09T18:04:50.000Z',
          latest_collected_at: '2026-03-09T18:05:00.000Z'
        },
        {
          source_kind: 'hermes_session',
          evidence_count: 1,
          source_status_buckets: {},
          evidence_role_buckets: {},
          output_candidate_buckets: { true: 0, false: 0 },
          latest_observed_at: null,
          latest_collected_at: '2026-03-09T18:01:00.000Z'
        }
      ]
    }
  ],
  unmapped_evidence_summary: {
    total_count: 3,
    sources: [
      {
        source_kind: 'hermes_profile',
        evidence_count: 2,
        source_status_buckets: { observed: 2 },
        evidence_role_buckets: { runtime_source: 2 },
        output_candidate_buckets: { true: 0, false: 2 },
        latest_observed_at: '2026-03-09T18:03:00.000Z',
        latest_collected_at: '2026-03-09T18:05:00.000Z'
      },
      {
        source_kind: 'workspace_root',
        evidence_count: 1,
        source_status_buckets: { missing: 1 },
        evidence_role_buckets: { source_evidence: 1 },
        output_candidate_buckets: { true: 1, false: 0 },
        latest_observed_at: null,
        latest_collected_at: '2026-03-09T18:00:00.000Z'
      }
    ]
  }
};

describe('deriveSelectedAgentSourceMatrixViewModel', () => {
  it('returns explicit loading, error, empty, and last-good states without echoing raw errors', () => {
    expect(
      deriveSelectedAgentSourceMatrixViewModel(null, 'app-engineering', {
        loadState: 'loading',
        error: null
      })
    ).toMatchObject({
      status: 'loading',
      statusLabel: 'Source matrix · Loading',
      detailLabel: 'Waiting for selected-agent source matrix rows.',
      rows: []
    });

    expect(
      deriveSelectedAgentSourceMatrixViewModel(null, 'app-engineering', {
        loadState: 'error',
        error: 'read failed /Users/cwp/private token=secret tmux://raw'
      })
    ).toMatchObject({
      status: 'error',
      statusLabel: 'Source matrix unavailable',
      detailLabel: 'Selected-agent source matrix could not be loaded.',
      rows: []
    });

    expect(
      deriveSelectedAgentSourceMatrixViewModel(sourceMatrix, 'unknown-agent', {
        loadState: 'ready',
        error: null
      })
    ).toMatchObject({
      status: 'empty',
      statusLabel: 'No source matrix rows',
      detailLabel: 'No source rows are mapped to the selected agent in this slice.',
      rows: []
    });

    expect(
      deriveSelectedAgentSourceMatrixViewModel(sourceMatrix, 'app-engineering', {
        loadState: 'ready',
        error: 'read failed /Users/cwp/private token=secret tmux://raw',
        maxRows: 1
      })
    ).toMatchObject({
      status: 'last-good',
      statusLabel: 'Source matrix · Last loaded rows',
      detailLabel: 'Refresh failed; showing the last loaded selected-agent source rows.',
      rows: [
        expect.objectContaining({
          source: 'Tmux observation',
          status: 'Observed'
        })
      ]
    });
  });

  it('returns bounded safe rows for the selected agent with stable ordering', () => {
    expect(
      deriveSelectedAgentSourceMatrixViewModel(sourceMatrix, 'app-engineering', {
        maxRows: 2,
        maxUnmappedRows: 1
      })
    ).toEqual({
      status: 'ready',
      statusLabel: 'Source matrix',
      detailLabel: 'Selected-agent source rows loaded.',
      selectedAgentId: 'app-engineering',
      rows: [
        {
          source: 'Tmux observation',
          status: 'Observed',
          role: 'Agent output',
          output: 'Output candidate',
          count: 3,
          latest_at: '2026-03-09T18:04:50.000Z'
        },
        {
          source: 'Workspace file',
          status: 'Observed',
          role: 'Agent plan',
          output: 'Supporting evidence',
          count: 3,
          latest_at: '2026-03-09T18:04:45.000Z'
        }
      ],
      unmappedSummary: {
        totalCount: 3,
        rows: [
          {
            source: 'Hermes profile',
            status: 'Observed',
            role: 'Unknown',
            output: 'Supporting evidence',
            count: 2,
            latest_at: '2026-03-09T18:03:00.000Z'
          }
        ]
      }
    });
  });

  it('keeps unmapped evidence separate from selected-agent rows', () => {
    const model = deriveSelectedAgentSourceMatrixViewModel(sourceMatrix, 'growth-revenue');

    expect(model.status).toBe('ready');
    expect(model.rows).toEqual([
      {
        source: 'Workspace file',
        status: 'Observed',
        role: 'Unknown',
        output: 'Supporting evidence',
        count: 2,
        latest_at: '2026-03-09T18:02:00.000Z'
      }
    ]);
    expect(model.unmappedSummary.totalCount).toBe(3);
    expect(model.unmappedSummary.rows.map((row) => row.source)).toEqual(['Hermes profile', 'Workspace root']);
  });

  it('returns an empty selected-agent state for missing or unknown selected agents', () => {
    expect(deriveSelectedAgentSourceMatrixViewModel(sourceMatrix, null)).toMatchObject({
      status: 'empty',
      statusLabel: 'No selected agent',
      detailLabel: 'Select an agent to inspect source matrix rows.',
      selectedAgentId: null,
      rows: []
    });

    expect(deriveSelectedAgentSourceMatrixViewModel(sourceMatrix, 'unknown-agent')).toMatchObject({
      status: 'empty',
      statusLabel: 'No source matrix rows',
      detailLabel: 'No source rows are mapped to the selected agent in this slice.',
      selectedAgentId: 'unknown-agent',
      rows: []
    });
  });

  it('normalizes unknown buckets and falls back to collected timestamps', () => {
    const model = deriveSelectedAgentSourceMatrixViewModel(sourceMatrix, 'app-engineering', {
      maxRows: 5
    });

    expect(model.rows.at(-1)).toEqual({
      source: 'Hermes session',
      status: 'Unknown',
      role: 'Unknown',
      output: 'Unknown',
      count: 1,
      latest_at: '2026-03-09T18:01:00.000Z'
    });
  });

  it('does not echo hostile source, status, or role bucket labels into serialized output', () => {
    const hostileMatrix: AgentEvidenceSourceMatrix = {
      ...sourceMatrix,
      agents: [
        {
          agent_id: 'hostile-agent',
          sources: [
            {
              source_kind: '/Users/cwp/private',
              evidence_count: 7,
              source_status_buckets: { 'tmux://pane/0': 7 },
              evidence_role_buckets: { payload: 7 },
              output_candidate_buckets: { true: 7, false: 0 },
              latest_observed_at: '2026-03-09T18:10:00.000Z',
              latest_collected_at: '2026-03-09T18:10:01.000Z'
            },
            {
              source_kind: 'hermes://session/private',
              evidence_count: 6,
              source_status_buckets: { 'session://raw': 6 },
              evidence_role_buckets: { webhook: 6 },
              output_candidate_buckets: { true: 0, false: 6 },
              latest_observed_at: '2026-03-09T18:09:00.000Z',
              latest_collected_at: '2026-03-09T18:09:01.000Z'
            },
            {
              source_kind: 'profile://admin',
              evidence_count: 5,
              source_status_buckets: { token: 5 },
              evidence_role_buckets: { 'control-plane': 5 },
              output_candidate_buckets: { true: 0, false: 0 },
              latest_observed_at: '2026-03-09T18:08:00.000Z',
              latest_collected_at: '2026-03-09T18:08:01.000Z'
            },
            {
              source_kind: 'C:\\Users\\alice\\secret.txt',
              evidence_count: 4,
              source_status_buckets: { 'file:///tmp/raw': 4 },
              evidence_role_buckets: { secret: 4 },
              output_candidate_buckets: { true: 0, false: 4 },
              latest_observed_at: '2026-03-09T18:07:00.000Z',
              latest_collected_at: '2026-03-09T18:07:01.000Z'
            },
            {
              source_kind: '~/private/notes.md',
              evidence_count: 3,
              source_status_buckets: { 'http://localhost:5173/private': 3 },
              evidence_role_buckets: { 'https://example.invalid/private': 3 },
              output_candidate_buckets: { true: 0, false: 3 },
              latest_observed_at: '2026-03-09T18:06:00.000Z',
              latest_collected_at: '2026-03-09T18:06:01.000Z'
            }
          ]
        }
      ],
      unmapped_evidence_summary: {
        total_count: 1,
        sources: [
          {
            source_kind: 'https://example.invalid/private',
            evidence_count: 1,
            source_status_buckets: { payload: 1 },
            evidence_role_buckets: { token: 1 },
            output_candidate_buckets: { true: 0, false: 1 },
            latest_observed_at: null,
            latest_collected_at: '2026-03-09T18:07:00.000Z'
          }
        ]
      }
    };

    const serialized = JSON.stringify(
      deriveSelectedAgentSourceMatrixViewModel(hostileMatrix, 'hostile-agent', {
        maxRows: 10,
        maxUnmappedRows: 10
      })
    );

    expect(serialized).not.toMatch(
      /\/Users\/cwp|C:\\\\Users|~\/|file:\/\/|http:\/\/|tmux:\/\/|hermes:\/\/|session:\/\/|profile:\/\/|https:\/\/|token|payload|webhook|secret|control-plane/
    );
    expect(JSON.parse(serialized).rows).toEqual([
      expect.objectContaining({ source: 'Unknown', status: 'Unknown', role: 'Unknown' }),
      expect.objectContaining({ source: 'Unknown', status: 'Unknown', role: 'Unknown' }),
      expect.objectContaining({ source: 'Unknown', status: 'Unknown', role: 'Unknown' }),
      expect.objectContaining({ source: 'Unknown', status: 'Unknown', role: 'Unknown' }),
      expect.objectContaining({ source: 'Unknown', status: 'Unknown', role: 'Unknown' })
    ]);
  });
});
