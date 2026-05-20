import { describe, expect, it } from 'vitest';

import { buildEvidenceProvenanceProof } from './evidenceProvenanceBundle';
import type { EvidenceProvenanceBundle } from './types';

describe('buildEvidenceProvenanceProof', () => {
  it('extracts replay-safe anchors in deterministic order', () => {
    const proof = buildEvidenceProvenanceProof({
      evidence_id: 'evidence-record-1',
      record: {
        observed_at: '2026-03-09T18:58:30.000Z',
        collected_at: '2026-03-09T18:59:00.000Z',
        agent_id: 'app-engineering',
        source_kind: 'workspace_file',
        evidence_role: 'agent_plan',
        source_status: 'observed',
        output_candidate: false,
        collector_snapshot_id: 'collector-snapshot:2026-03-09T18:59:00.000Z',
        correlation_id: 'corr-app-review',
        unmapped: false
      },
      anchors: {
        replay: {
          correlation_id: 'corr-app-review',
          route: '/accountability/replay?correlation_id=corr-app-review'
        },
        source: {
          evidence_id: 'evidence-record-1',
          source_kind: 'workspace_file',
          evidence_role: 'agent_plan',
          source_status: 'observed',
          route: '/evidence-records/evidence-record-1'
        },
        snapshot: {
          collector_snapshot_id: 'collector-snapshot:2026-03-09T18:59:00.000Z',
          route:
            '/collectors/controller-snapshot/source-health?collector_snapshot_id=collector-snapshot%3A2026-03-09T18%3A59%3A00.000Z&source_kind=workspace_file'
        }
      }
    });

    expect(proof).toEqual({
      evidenceId: 'evidence-record-1',
      record: {
        observedAt: '2026-03-09T18:58:30.000Z',
        collectedAt: '2026-03-09T18:59:00.000Z',
        agentId: 'app-engineering',
        sourceKind: 'workspace_file',
        evidenceRole: 'agent_plan',
        sourceStatus: 'observed',
        outputCandidate: false,
        collectorSnapshotId: 'collector-snapshot:2026-03-09T18:59:00.000Z',
        correlationId: 'corr-app-review',
        unmapped: false
      },
      anchors: [
        {
          kind: 'snapshot',
          id: 'collector-snapshot:2026-03-09T18:59:00.000Z',
          label: 'Snapshot',
          route:
            '/collectors/controller-snapshot/source-health?collector_snapshot_id=collector-snapshot%3A2026-03-09T18%3A59%3A00.000Z&source_kind=workspace_file'
        },
        {
          kind: 'source',
          id: 'evidence-record-1',
          label: 'Source record',
          route: '/evidence-records/evidence-record-1'
        },
        {
          kind: 'replay',
          id: 'corr-app-review',
          label: 'Replay',
          route: '/accountability/replay?correlation_id=corr-app-review'
        }
      ]
    });
  });

  it('omits raw refs, payload-like fields, local paths, and token-like values from helper output', () => {
    const bundle = {
      evidence_id: 'evidence-record-1',
      evidence_ref: '/Users/cwp/secret.txt',
      payload: {
        token: 'sk-live-1234567890abcdef'
      },
      record: {
        observed_at: null,
        collected_at: null,
        agent_id: 'app-engineering',
        source_kind: 'workspace_file',
        evidence_role: 'agent_plan',
        source_status: 'observed',
        output_candidate: false,
        collector_snapshot_id: 'collector-snapshot:2026-03-09T18:59:00.000Z',
        correlation_id: 'corr-app-review',
        unmapped: false,
        evidence_ref: '/Users/cwp/secret.txt',
        raw_payload: 'token=sk-live-1234567890abcdef'
      },
      anchors: {
        snapshot: {
          collector_snapshot_id: 'collector-snapshot:2026-03-09T18:59:00.000Z',
          route:
            '/collectors/controller-snapshot/source-health?collector_snapshot_id=collector-snapshot%3A2026-03-09T18%3A59%3A00.000Z&source_kind=workspace_file'
        },
        source: {
          evidence_id: 'evidence-record-1',
          source_kind: 'workspace_file',
          evidence_role: 'agent_plan',
          source_status: 'observed',
          route: '/evidence-records/evidence-record-1'
        },
        replay: {
          correlation_id: 'corr-app-review',
          route: '/accountability/replay?correlation_id=corr-app-review'
        }
      }
    } as unknown as EvidenceProvenanceBundle;

    const output = JSON.stringify(buildEvidenceProvenanceProof(bundle));

    expect(output).not.toContain('/Users/cwp/secret.txt');
    expect(output).not.toContain('sk-live-1234567890abcdef');
    expect(output).not.toContain('evidence_ref');
    expect(output).not.toContain('payload');
  });
});
