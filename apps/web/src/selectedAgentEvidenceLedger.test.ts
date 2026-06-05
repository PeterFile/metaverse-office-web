import { describe, expect, it } from 'vitest';

import {
  buildSelectedAgentEvidenceProofCompassRows,
  buildSelectedAgentEvidenceLedger,
  selectSelectedAgentEvidenceLedgerSourceContextGroups
} from './selectedAgentEvidenceLedger';
import type { EvidenceRecord, EvidenceRefRollup } from './types';

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

function proofCompassRollupGroup(
  overrides: Partial<EvidenceRefRollup['groups'][number]> = {}
): EvidenceRefRollup['groups'][number] {
  return {
    evidence_ref: null,
    evidence_ref_key: overrides.evidence_ref_key ?? 'ref_group_001',
    evidence_ref_label: overrides.evidence_ref_label ?? 'workspace_file evidence',
    record_count: overrides.record_count ?? 1,
    mapped_count: overrides.mapped_count ?? 1,
    unmapped_count: overrides.unmapped_count ?? 0,
    agent_id_buckets: overrides.agent_id_buckets ?? {
      'app-engineering': 1
    },
    source_kind_buckets: overrides.source_kind_buckets ?? {
      workspace_file: 1
    },
    source_status_buckets: overrides.source_status_buckets ?? {
      observed: 1
    }
  };
}

describe('buildSelectedAgentEvidenceLedger', () => {
  it('keeps empty data as an empty evidence model without inferring idle or offline state', () => {
    expect(buildSelectedAgentEvidenceLedger([])).toEqual({
      isEmpty: true,
      requestScopeLabel: 'Selected-agent evidence records',
      outputEvidence: { totalCount: 0, overflowCount: 0, items: [] },
      nonOutputEvidence: { totalCount: 0, overflowCount: 0, items: [] },
      degradedEvidence: { totalCount: 0, overflowCount: 0, items: [] },
      unmappedEvidence: { totalCount: 0, overflowCount: 0, items: [] },
      sourceContextGroups: [],
      sourceRefGroups: [],
      proofCompassRows: []
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
      },
      unmappedEvidence: {
        totalCount: 0,
        overflowCount: 0,
        items: []
      },
      sourceContextGroups: [
        {
          sourceKind: 'workspace_file',
          evidenceRole: 'workspace_file',
          sourceStatus: 'missing',
          mapped: true,
          observedAt: '2026-03-09T18:06:00.000Z',
          collectedAt: '2026-03-09T18:05:00.000Z',
          totalCount: 1
        },
        {
          sourceKind: 'workspace_file',
          evidenceRole: 'agent_output',
          sourceStatus: 'degraded',
          mapped: true,
          observedAt: '2026-03-09T18:05:00.000Z',
          collectedAt: '2026-03-09T18:05:00.000Z',
          totalCount: 1
        },
        {
          sourceKind: 'workspace_file',
          evidenceRole: 'agent_output',
          sourceStatus: 'observed',
          mapped: true,
          observedAt: '2026-03-09T18:04:30.000Z',
          collectedAt: '2026-03-09T18:05:00.000Z',
          totalCount: 1
        },
        {
          sourceKind: 'workspace_root',
          evidenceRole: 'workspace_presence',
          sourceStatus: 'observed',
          mapped: true,
          observedAt: '2026-03-09T18:03:00.000Z',
          collectedAt: '2026-03-09T18:05:00.000Z',
          totalCount: 1
        }
      ],
      sourceRefGroups: [
        {
          sourceKind: 'workspace_file',
          evidenceRole: 'workspace_file',
          sourceStatus: 'missing',
          totalCount: 1
        },
        {
          sourceKind: 'workspace_file',
          evidenceRole: 'agent_output',
          sourceStatus: 'degraded',
          totalCount: 1
        },
        {
          sourceKind: 'workspace_file',
          evidenceRole: 'agent_output',
          sourceStatus: 'observed',
          totalCount: 1
        },
        {
          sourceKind: 'workspace_root',
          evidenceRole: 'workspace_presence',
          sourceStatus: 'observed',
          totalCount: 1
        }
      ],
      proofCompassRows: []
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
    expect(model.unmappedEvidence.items).toEqual([]);
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
    expect(model.sourceRefGroups).toEqual([
      {
        sourceKind: 'workspace_file',
        evidenceRole: 'agent_output',
        sourceStatus: 'observed',
        totalCount: 3
      }
    ]);
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
    expect(model.proofCompassRows).toEqual([]);
  });

  it('preserves caller-provided safe Proof Compass rows on the ledger model', () => {
    const proofCompassRows = [
      {
        groupKey: 'ref_group_001',
        label: 'workspace_file evidence',
        recordCount: 4,
        mappedCount: 3,
        unmappedCount: 1,
        sourceKindBuckets: [
          { key: 'workspace_file', count: 3 },
          { key: 'tmux_observation', count: 1 }
        ],
        sourceStatusBuckets: [
          { key: 'observed', count: 3 },
          { key: 'missing', count: 1 }
        ]
      }
    ];

    const model = buildSelectedAgentEvidenceLedger([evidenceRecord({})], { proofCompassRows });

    expect(model.proofCompassRows).toEqual(proofCompassRows);
    expect(model.proofCompassRows).not.toBe(proofCompassRows);
  });

  it('sanitizes caller-provided Proof Compass rows before exposing the ledger model', () => {
    const model = buildSelectedAgentEvidenceLedger([evidenceRecord({})], {
      proofCompassRows: [
        {
          groupKey: 'profile-prod-private-token',
          label: 'metadata dispatch token webhook hermes-session-app-engineering tmux-pane-1',
          recordCount: 2.8,
          mappedCount: -1,
          unmappedCount: 1,
          sourceKindBuckets: [
            { key: 'workspace_file', count: 2 },
            { key: 'dispatch', count: 99 }
          ],
          sourceStatusBuckets: [
            { key: 'observed', count: 1 },
            { key: 'metadata', count: 99 }
          ]
        }
      ]
    });

    expect(model.proofCompassRows).toEqual([
      {
        groupKey: 'ref_group_1',
        label: 'Evidence ref group',
        recordCount: 2,
        mappedCount: 0,
        unmappedCount: 1,
        sourceKindBuckets: [{ key: 'workspace_file', count: 2 }],
        sourceStatusBuckets: [{ key: 'observed', count: 1 }]
      }
    ]);
    expect(JSON.stringify(model.proofCompassRows)).not.toMatch(
      /profile-prod|private-token|metadata|dispatch|token|webhook|hermes-session|tmux-pane/i
    );
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
    expect(model.degradedEvidence.items).toEqual([]);
    expect(model.unmappedEvidence.items).toEqual([
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

  it('computes source/ref rollups before group bounding and counts unique refs only', () => {
    const model = buildSelectedAgentEvidenceLedger(
      [
        evidenceRecord({ evidence_id: 'a', evidence_ref: '/tmp/a.md' }),
        evidenceRecord({ evidence_id: 'b', evidence_ref: '/tmp/b.md' }),
        evidenceRecord({ evidence_id: 'c', evidence_ref: '/tmp/c.md' }),
        evidenceRecord({ evidence_id: 'd', evidence_ref: '/tmp/d.md' }),
        evidenceRecord({ evidence_id: 'e', evidence_ref: '/tmp/e.md' }),
        evidenceRecord({ evidence_id: 'duplicate-e', evidence_ref: '/tmp/e.md' }),
        evidenceRecord({
          evidence_id: 'presence',
          evidence_ref: '/tmp/app',
          source_kind: 'workspace_root',
          evidence_role: 'workspace_presence'
        })
      ],
      { maxSourceRefGroups: 1 }
    );

    expect(model.sourceRefGroups).toEqual([
      {
        sourceKind: 'workspace_file',
        evidenceRole: 'agent_output',
        sourceStatus: 'observed',
        totalCount: 5
      }
    ]);
    expect(JSON.stringify(model.sourceRefGroups)).not.toContain('/tmp/');
  });
});

describe('buildSelectedAgentEvidenceProofCompassRows', () => {
  it('projects bounded Proof Compass rows from safe endpoint rollup fields only', () => {
    const rows = buildSelectedAgentEvidenceProofCompassRows(
      {
        total_count: 12,
        total_groups: 3,
        returned_limit: 3,
        groups: [
          proofCompassRollupGroup({
            evidence_ref_key: 'ref_group_002',
            evidence_ref_label: 'workspace_file degraded evidence',
            record_count: 7,
            mapped_count: 5,
            unmapped_count: 2,
            source_kind_buckets: {
              workspace_file: 5,
              tmux_observation: 2,
              '/tmp/not-a-kind': 99
            },
            source_status_buckets: {
              degraded: 4,
              observed: 3,
              'token-status': 99
            }
          }),
          proofCompassRollupGroup({
            evidence_ref_key: 'ref_group_001',
            evidence_ref_label: 'runtime evidence',
            record_count: 5,
            mapped_count: 0,
            unmapped_count: 5,
            source_kind_buckets: {
              hermes_session: 3,
              tmux_observation: 2
            },
            source_status_buckets: {
              observed: 5
            }
          }),
          proofCompassRollupGroup({ evidence_ref_key: 'ref_group_003' })
        ]
      },
      { maxRows: 2, maxBucketsPerRow: 2 }
    );

    expect(rows).toEqual([
      {
        groupKey: 'ref_group_002',
        label: 'workspace_file degraded evidence',
        recordCount: 7,
        mappedCount: 5,
        unmappedCount: 2,
        sourceKindBuckets: [
          { key: 'workspace_file', count: 5 },
          { key: 'tmux_observation', count: 2 }
        ],
        sourceStatusBuckets: [
          { key: 'degraded', count: 4 },
          { key: 'observed', count: 3 }
        ]
      },
      {
        groupKey: 'ref_group_001',
        label: 'runtime evidence',
        recordCount: 5,
        mappedCount: 0,
        unmappedCount: 5,
        sourceKindBuckets: [
          { key: 'hermes_session', count: 3 },
          { key: 'tmux_observation', count: 2 }
        ],
        sourceStatusBuckets: [{ key: 'observed', count: 5 }]
      }
    ]);
    expect(JSON.stringify(rows)).not.toContain('/tmp/');
    expect(JSON.stringify(rows)).not.toContain('token-status');
  });

  it('does not render raw refs, paths, protocols, tokens, or webhook canaries from unsafe rollup text', () => {
    const rows = buildSelectedAgentEvidenceProofCompassRows({
      total_count: 6,
      total_groups: 2,
      returned_limit: 2,
      groups: [
        proofCompassRollupGroup({
          evidence_ref_key: '/tmp/ref-group-token-secret-payload-control-plane',
          evidence_ref_label:
            '/tmp/output.md /Users/peter/outbox.md ~/secrets.md file:///tmp/raw http://localhost https://example.invalid tmux://pane hermes://profile session://abc profile://abc tmux-pane hermes-session profile-prod session-prod token webhook secret payload control-plane',
          record_count: 6,
          mapped_count: 4,
          unmapped_count: 2,
          source_kind_buckets: {
            workspace_file: 2,
            'tmux://pane': 2,
            'hermes://profile': 2,
            '/Users/peter/source': 2,
            webhook: 2,
            'file:///tmp/raw': 2,
            'https://example.invalid': 2,
            payload: 2,
            'control-plane': 2
          },
          source_status_buckets: {
            observed: 3,
            error: 1,
            'session://secret': 2,
            'profile://secret': 2,
            token: 2,
            payload: 2,
            'control-plane': 2
          }
        }),
        proofCompassRollupGroup({
          evidence_ref_key: 'control-plane',
          evidence_ref_label: 'path=C:\\Builds\\alice\\notes.txt path=/var/log/app.txt',
          source_kind_buckets: {
            task_fixture: 1
          },
          source_status_buckets: {
            missing: 1
          }
        })
      ]
    });

    expect(rows).toEqual([
      {
        groupKey: 'ref_group_1',
        label: 'Evidence ref group',
        recordCount: 6,
        mappedCount: 4,
        unmappedCount: 2,
        sourceKindBuckets: [{ key: 'workspace_file', count: 2 }],
        sourceStatusBuckets: [
          { key: 'observed', count: 3 },
          { key: 'error', count: 1 }
        ]
      },
      {
        groupKey: 'ref_group_2',
        label: 'Evidence ref group',
        recordCount: 1,
        mappedCount: 1,
        unmappedCount: 0,
        sourceKindBuckets: [{ key: 'task_fixture', count: 1 }],
        sourceStatusBuckets: [{ key: 'missing', count: 1 }]
      }
    ]);

    const rendered = JSON.stringify(rows);
    expect(rendered).not.toContain('/tmp');
    expect(rendered).not.toContain('/Users');
    expect(rendered).not.toContain('tmux://');
    expect(rendered).not.toContain('hermes://');
    expect(rendered).not.toContain('session://');
    expect(rendered).not.toContain('profile://');
    expect(rendered).not.toContain('tmux-pane');
    expect(rendered).not.toContain('hermes-session');
    expect(rendered).not.toContain('profile-prod');
    expect(rendered).not.toContain('session-prod');
    expect(rendered).not.toContain('~/');
    expect(rendered).not.toContain('file://');
    expect(rendered).not.toContain('http://');
    expect(rendered).not.toContain('https://');
    expect(rendered).not.toContain('token');
    expect(rendered).not.toContain('webhook');
    expect(rendered).not.toContain('secret');
    expect(rendered).not.toContain('payload');
    expect(rendered).not.toContain('control-plane');
    expect(rendered).not.toContain('C:\\\\Builds');
    expect(rendered).not.toContain('/var/log');
    expect(rendered).not.toContain('alice');
  });
});

describe('selectSelectedAgentEvidenceLedgerSourceContextGroups', () => {
  it('computes source context groups from all records even when visible cards overflow', () => {
    const model = buildSelectedAgentEvidenceLedger(
      [
        evidenceRecord({
          evidence_id: 'visible-output',
          evidence_ref: '/tmp/app/visible-output.md',
          source_kind: 'workspace_file',
          evidence_role: 'agent_output',
          source_status: 'observed',
          output_candidate: true
        }),
        evidenceRecord({
          evidence_id: 'hidden-output',
          observed_at: '2026-03-09T18:03:00.000Z',
          evidence_ref: '/tmp/app/hidden-output.md',
          source_kind: 'workspace_file',
          evidence_role: 'agent_output',
          source_status: 'observed',
          output_candidate: true
        }),
        evidenceRecord({
          evidence_id: 'hidden-runtime',
          observed_at: '2026-03-09T18:02:00.000Z',
          agent_id: null,
          evidence_ref: 'tmux://session/window/pane',
          source_kind: 'tmux_observation',
          evidence_role: 'runtime_unmapped',
          source_status: 'observed',
          output_candidate: false,
          degraded_reasons: ['do not render tmux://session/window/pane']
        })
      ],
      { maxItemsPerGroup: 1, maxSourceRefGroups: 4 }
    );

    expect(model.outputEvidence.items.map((item) => item.evidenceId)).toEqual(['visible-output']);
    expect(model.outputEvidence.overflowCount).toBe(1);
    expect(model.unmappedEvidence.items.map((item) => item.evidenceId)).toEqual(['hidden-runtime']);
    expect(selectSelectedAgentEvidenceLedgerSourceContextGroups(model)).toEqual([
      {
        sourceKind: 'workspace_file',
        evidenceRole: 'agent_output',
        sourceStatus: 'observed',
        mapped: true,
        observedAt: '2026-03-09T18:04:30.000Z',
        collectedAt: '2026-03-09T18:05:00.000Z',
        totalCount: 2
      },
      {
        sourceKind: 'tmux_observation',
        evidenceRole: 'runtime_unmapped',
        sourceStatus: 'observed',
        mapped: false,
        observedAt: '2026-03-09T18:02:00.000Z',
        collectedAt: '2026-03-09T18:05:00.000Z',
        totalCount: 1
      }
    ]);
    expect(JSON.stringify(selectSelectedAgentEvidenceLedgerSourceContextGroups(model))).not.toContain('/tmp/app');
    expect(JSON.stringify(selectSelectedAgentEvidenceLedgerSourceContextGroups(model))).not.toContain('tmux://');
  });

  it('projects only safe source context fields and deduplicates degraded bucket overlap', () => {
    const model = buildSelectedAgentEvidenceLedger([
      evidenceRecord({
        evidence_id: 'output',
        evidence_ref: '/tmp/app/output.md',
        source_kind: 'workspace_file',
        evidence_role: 'agent_output',
        source_status: 'degraded',
        output_candidate: true,
        degraded_reasons: ['do not render /tmp/app/output.md']
      }),
      evidenceRecord({
        evidence_id: 'unmapped',
        observed_at: '2026-03-09T18:06:00.000Z',
        agent_id: null,
        source_kind: 'tmux_observation',
        evidence_ref: 'tmux://unmapped/0.1',
        evidence_role: 'runtime_unmapped',
        source_status: 'observed',
        output_candidate: false,
        collector_snapshot_id: 'collector-secret',
        correlation_id: null
      })
    ]);

    expect(selectSelectedAgentEvidenceLedgerSourceContextGroups(model)).toEqual([
      {
        sourceKind: 'tmux_observation',
        evidenceRole: 'runtime_unmapped',
        sourceStatus: 'observed',
        mapped: false,
        observedAt: '2026-03-09T18:06:00.000Z',
        collectedAt: '2026-03-09T18:05:00.000Z',
        totalCount: 1
      },
      {
        sourceKind: 'workspace_file',
        evidenceRole: 'agent_output',
        sourceStatus: 'degraded',
        mapped: true,
        observedAt: '2026-03-09T18:04:30.000Z',
        collectedAt: '2026-03-09T18:05:00.000Z',
        totalCount: 1
      }
    ]);
  });
});
