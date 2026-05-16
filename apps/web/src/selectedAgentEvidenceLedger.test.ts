import { describe, expect, it } from 'vitest';

import { buildSelectedAgentEvidenceLedger } from './selectedAgentEvidenceLedger';
import type { EvidenceRecord } from './types';

function evidenceRecord(overrides: Partial<EvidenceRecord>): EvidenceRecord {
  return {
    evidence_id: overrides.evidence_id ?? 'evidence-1',
    observed_at: overrides.observed_at ?? '2026-03-09T18:04:30.000Z',
    collected_at: overrides.collected_at ?? '2026-03-09T18:05:00.000Z',
    agent_id: overrides.agent_id === undefined ? 'app-engineering' : overrides.agent_id,
    source_kind: overrides.source_kind ?? 'workspace_file',
    evidence_ref: overrides.evidence_ref ?? '/tmp/app/output.md',
    evidence_role: overrides.evidence_role ?? 'agent_output',
    source_status: overrides.source_status ?? 'observed',
    output_candidate: overrides.output_candidate ?? true,
    collector_snapshot_id: overrides.collector_snapshot_id ?? 'collector-20260309',
    correlation_id: overrides.correlation_id ?? 'collector-20260309',
    degraded_reasons: overrides.degraded_reasons ?? [],
    metadata: overrides.metadata ?? {}
  };
}

describe('buildSelectedAgentEvidenceLedger', () => {
  it('keeps empty data as an empty evidence model without inferring idle or offline state', () => {
    expect(buildSelectedAgentEvidenceLedger([])).toEqual({
      isEmpty: true,
      requestScopeLabel: 'Selected-agent evidence records',
      outputEvidence: { totalCount: 0, overflowCount: 0, items: [] },
      nonOutputEvidence: { totalCount: 0, overflowCount: 0, items: [] },
      degradedEvidence: { totalCount: 0, overflowCount: 0, items: [] }
    });
  });

  it('groups output, non-output presence, and degraded evidence without changing API truth', () => {
    const output = evidenceRecord({
      evidence_id: 'output',
      evidence_ref: '/tmp/app/result.md',
      evidence_role: 'agent_output',
      output_candidate: true
    });
    const degradedOutput = evidenceRecord({
      evidence_id: 'degraded-output',
      observed_at: '2026-03-09T18:05:00.000Z',
      evidence_ref: '/tmp/app/outbox.md',
      evidence_role: 'agent_output',
      source_status: 'degraded',
      output_candidate: true,
      degraded_reasons: ['missing workspace files: inbox.md']
    });
    const presence = evidenceRecord({
      evidence_id: 'presence',
      observed_at: '2026-03-09T18:03:00.000Z',
      evidence_ref: '/tmp/app',
      evidence_role: 'workspace_presence',
      output_candidate: false,
      source_kind: 'workspace_root'
    });
    const missing = evidenceRecord({
      evidence_id: 'missing',
      observed_at: '2026-03-09T18:06:00.000Z',
      evidence_ref: '/tmp/app/missing.md',
      evidence_role: 'workspace_file',
      source_status: 'missing',
      output_candidate: false,
      degraded_reasons: ['workspace file not observed']
    });

    const model = buildSelectedAgentEvidenceLedger([output, degradedOutput, presence, missing]);

    expect(model).toEqual({
      isEmpty: false,
      requestScopeLabel: 'Selected-agent evidence records',
      outputEvidence: {
        totalCount: 2,
        overflowCount: 0,
        items: [
          expect.objectContaining({
            evidenceId: 'degraded-output',
            evidenceRef: '/tmp/app/outbox.md',
            evidenceRole: 'agent_output',
            sourceStatus: 'degraded',
            outputCandidate: true,
            degradedReasons: ['missing workspace files: inbox.md']
          }),
          expect.objectContaining({
            evidenceId: 'output',
            evidenceRef: '/tmp/app/result.md',
            evidenceRole: 'agent_output',
            sourceStatus: 'observed',
            outputCandidate: true,
            degradedReasons: []
          })
        ]
      },
      nonOutputEvidence: {
        totalCount: 2,
        overflowCount: 0,
        items: [
          expect.objectContaining({
            evidenceId: 'missing',
            evidenceRef: '/tmp/app/missing.md',
            evidenceRole: 'workspace_file',
            sourceStatus: 'missing',
            outputCandidate: false,
            degradedReasons: ['workspace file not observed']
          }),
          expect.objectContaining({
            evidenceId: 'presence',
            evidenceRef: '/tmp/app',
            evidenceRole: 'workspace_presence',
            sourceKind: 'workspace_root',
            outputCandidate: false
          })
        ]
      },
      degradedEvidence: {
        totalCount: 2,
        overflowCount: 0,
        items: [
          expect.objectContaining({
            evidenceId: 'missing',
            evidenceRef: '/tmp/app/missing.md',
            evidenceRole: 'workspace_file',
            sourceStatus: 'missing',
            degradedReasons: ['workspace file not observed']
          }),
          expect.objectContaining({
            evidenceId: 'degraded-output',
            evidenceRef: '/tmp/app/outbox.md',
            evidenceRole: 'agent_output',
            sourceStatus: 'degraded',
            outputCandidate: true,
            degradedReasons: ['missing workspace files: inbox.md']
          })
        ]
      }
    });

    expect(model.outputEvidence.items[0]).not.toBe(model.degradedEvidence.items[1]);
  });

  it('keeps source-status error output rows in output evidence while also flagging them degraded', () => {
    const erroredOutput = evidenceRecord({
      evidence_id: 'errored-output',
      observed_at: '2026-03-09T18:07:00.000Z',
      evidence_ref: '/tmp/app/error-output.md',
      evidence_role: 'agent_output',
      source_status: 'error',
      output_candidate: true,
      degraded_reasons: ['source-health aggregate reported error']
    });

    const model = buildSelectedAgentEvidenceLedger([erroredOutput]);

    expect(model.outputEvidence).toMatchObject({
      totalCount: 1,
      overflowCount: 0,
      items: [
        {
          evidenceId: 'errored-output',
          evidenceRef: '/tmp/app/error-output.md',
          evidenceRole: 'agent_output',
          sourceStatus: 'error',
          outputCandidate: true,
          degradedReasons: ['source-health aggregate reported error']
        }
      ]
    });
    expect(model.nonOutputEvidence.items).toEqual([]);
    expect(model.degradedEvidence).toMatchObject({
      totalCount: 1,
      overflowCount: 0,
      items: [
        {
          evidenceId: 'errored-output',
          evidenceRef: '/tmp/app/error-output.md',
          evidenceRole: 'agent_output',
          sourceStatus: 'error',
          outputCandidate: true,
          degradedReasons: ['source-health aggregate reported error']
        }
      ]
    });
    expect(model.outputEvidence.items[0]).not.toBe(model.degradedEvidence.items[0]);
  });

  it('bounds each rendering group and reports overflow without raw metadata dumps', () => {
    const model = buildSelectedAgentEvidenceLedger(
      [
        evidenceRecord({ evidence_id: 'a', evidence_ref: '/tmp/a.md' }),
        evidenceRecord({
          evidence_id: 'b',
          observed_at: '2026-03-09T18:05:30.000Z',
          evidence_ref: '/tmp/b.md'
        }),
        evidenceRecord({
          evidence_id: 'c',
          observed_at: '2026-03-09T18:06:00.000Z',
          evidence_ref: '/tmp/c.md'
        })
      ],
      { maxItemsPerGroup: 2 }
    );

    expect(model.outputEvidence.totalCount).toBe(3);
    expect(model.outputEvidence.overflowCount).toBe(1);
    expect(model.outputEvidence.items.map((item) => item.evidenceId)).toEqual(['c', 'b']);
    expect(model.outputEvidence.items[0]).not.toHaveProperty('metadata');
  });

  it('preserves API order for records with equal ledger timestamps', () => {
    const model = buildSelectedAgentEvidenceLedger(
      [
        evidenceRecord({
          evidence_id: 'api-first',
          evidence_ref: '/tmp/api-first.md'
        }),
        evidenceRecord({
          evidence_id: 'api-second',
          evidence_ref: '/tmp/api-second.md'
        }),
        evidenceRecord({
          evidence_id: 'api-third',
          evidence_ref: '/tmp/api-third.md'
        })
      ],
      { maxItemsPerGroup: 2 }
    );

    expect(model.outputEvidence.items.map((item) => item.evidenceId)).toEqual(['api-first', 'api-second']);
    expect(model.outputEvidence.overflowCount).toBe(1);
  });

  it('carries an explicit request scope label for scoped ledger callers', () => {
    const model = buildSelectedAgentEvidenceLedger([], {
      requestScopeLabel: 'Source-gap scope · workspace source records for app-engineering'
    });

    expect(model.requestScopeLabel).toBe('Source-gap scope · workspace source records for app-engineering');
  });

  it('treats unmapped tmux records as degraded/unmapped evidence, not agent output', () => {
    const model = buildSelectedAgentEvidenceLedger([
      evidenceRecord({
        evidence_id: 'unmapped',
        agent_id: null,
        source_kind: 'tmux_observation',
        evidence_ref: 'tmux://unmapped/0.1',
        evidence_role: 'runtime_unmapped',
        source_status: 'observed',
        output_candidate: false
      })
    ]);

    expect(model.outputEvidence.items).toEqual([]);
    expect(model.nonOutputEvidence.items).toEqual([]);
    expect(model.degradedEvidence.items).toEqual([
      expect.objectContaining({
        evidenceId: 'unmapped',
        agentId: null,
        sourceKind: 'tmux_observation',
        evidenceRole: 'runtime_unmapped',
        sourceStatus: 'observed',
        outputCandidate: false
      })
    ]);
  });
});
