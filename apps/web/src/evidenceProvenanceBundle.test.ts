import { describe, expect, it } from 'vitest';

import {
  buildEvidenceProvenanceProof,
  buildEvidenceProvenanceVisibleClaimAnchor
} from './evidenceProvenanceBundle';
import { expectNoForbiddenPublicUiText } from './test/publicLeakSentinel';
import type { EvidenceProvenanceBundle } from './types';

describe('buildEvidenceProvenanceProof', () => {
  it('builds a bounded visible claim anchor that can trace to replay by evidence id', () => {
    const anchor = buildEvidenceProvenanceVisibleClaimAnchor({
      evidence_id: 'evidence-record-1',
      source_summary: {
        kind: 'workspace_file',
        status: 'observed',
        role: 'agent_plan',
        output_candidate: false,
        mapped: true,
        time: {
          observed_at: '2026-03-09T18:58:30.000Z',
          collected_at: '2026-03-09T18:59:00.000Z'
        }
      },
      record: {
        observed_at: '2026-03-09T18:58:30.000Z',
        collected_at: '2026-03-09T18:59:00.000Z',
        agent_id: 'app-engineering',
        source_kind: 'workspace_file',
        evidence_role: 'agent_plan',
        source_status: 'observed',
        output_candidate: false,
        collector_snapshot_id: 'collector-snapshot:2026-03-09T18:59:00.000Z',
        correlation_id: null,
        unmapped: false
      },
      anchors: {
        snapshot: null,
        source: {
          evidence_id: 'evidence-record-1',
          source_kind: 'workspace_file',
          evidence_role: 'agent_plan',
          source_status: 'observed',
          route: '/evidence-records/evidence-record-1'
        },
        replay: {
          evidence_id: 'evidence-record-1',
          route: '/accountability/replay?evidence_id=evidence-record-1'
        }
      }
    });

    expect(anchor).toEqual({
      evidenceId: 'evidence-record-1',
      anchorClass: 'replay_accountability',
      visible: {
        label: 'Evidence anchor · evidence-record-1',
        ariaLabel: 'Trace evidence anchor evidence-record-1'
      },
      trace: {
        evidenceId: 'evidence-record-1',
        sourceEvidenceId: 'evidence-record-1',
        replayEvidenceId: 'evidence-record-1',
        replayCorrelationId: null
      }
    });
  });

  it('keeps hostile ids and raw refs out of visible claim anchor text', () => {
    const hostileEvidenceId =
      'tmux://session/window profile://prod /tmp/raw-token-secret.md control-plane dispatch';
    const anchor = buildEvidenceProvenanceVisibleClaimAnchor({
      evidence_id: hostileEvidenceId,
      source_summary: {
        kind: 'tmux://session/private',
        status: 'dispatch',
        role: 'webhook',
        output_candidate: false,
        mapped: true,
        time: {
          observed_at: null,
          collected_at: null
        }
      },
      record: {
        observed_at: null,
        collected_at: null,
        agent_id: 'profile-prod',
        source_kind: 'tmux://session/private',
        evidence_role: 'payload',
        source_status: 'control-plane',
        output_candidate: false,
        collector_snapshot_id: 'collector-route-token',
        correlation_id: 'session-prod',
        unmapped: false
      },
      anchors: {
        snapshot: {
          collector_snapshot_id: 'collector-route-token',
          route: '/collectors/dispatch/route?token=sk-live-1234567890abcdef'
        },
        source: {
          evidence_id: hostileEvidenceId,
          source_kind: 'tmux://session/private',
          evidence_role: 'payload',
          source_status: 'control-plane',
          route: `/evidence-records/${encodeURIComponent(hostileEvidenceId)}`
        },
        replay: {
          evidence_id: hostileEvidenceId,
          correlation_id: 'session-prod',
          route: `/accountability/replay?evidence_id=${encodeURIComponent(hostileEvidenceId)}`
        }
      }
    } as EvidenceProvenanceBundle);

    expect(anchor).toMatchObject({
      evidenceId: hostileEvidenceId,
      anchorClass: 'unanchored',
      visible: {
        label: 'Evidence anchor',
        ariaLabel: 'Trace evidence anchor'
      },
      trace: {
        evidenceId: hostileEvidenceId,
        sourceEvidenceId: hostileEvidenceId,
        replayEvidenceId: hostileEvidenceId,
        replayCorrelationId: 'session-prod'
      }
    });
    expectNoForbiddenPublicUiText({
      anchorClass: anchor?.anchorClass,
      visible: anchor?.visible
    });
  });

  it('extracts replay-safe anchors in deterministic order', () => {
    const proof = buildEvidenceProvenanceProof({
      evidence_id: 'evidence-record-1',
      source_summary: {
        kind: 'workspace_file',
        status: 'observed',
        role: 'agent_plan',
        output_candidate: false,
        mapped: true,
        time: {
          observed_at: '2026-03-09T18:58:30.000Z',
          collected_at: '2026-03-09T18:59:00.000Z'
        }
      },
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
      sourceSummary: {
        kind: 'workspace_file',
        status: 'observed',
        role: 'agent_plan',
        outputCandidate: false,
        mapped: true,
        time: {
          observedAt: '2026-03-09T18:58:30.000Z',
          collectedAt: '2026-03-09T18:59:00.000Z'
        }
      },
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
      source_summary: {
        kind: 'workspace_file',
        status: 'observed',
        role: 'agent_plan',
        output_candidate: false,
        mapped: true,
        snapshot: 'collector-snapshot:2026-03-09T18:59:00.000Z',
        time: {
          observed_at: null,
          collected_at: null
        },
        correlation: 'corr-app-review',
        evidence_ref: '/Users/cwp/secret.txt',
        raw_payload: 'token=sk-live-1234567890abcdef'
      },
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
    const proof = buildEvidenceProvenanceProof(bundle);

    expect(proof?.sourceSummary).not.toHaveProperty('snapshot');
    expect(proof?.sourceSummary).not.toHaveProperty('correlation');
    expect(output).not.toContain('/Users/cwp/secret.txt');
    expect(output).not.toContain('sk-live-1234567890abcdef');
    expect(output).not.toContain('evidence_ref');
    expect(output).not.toContain('payload');
    expectNoForbiddenPublicUiText(proof);
  });

  it('redacts hostile provenance anchor ids and routes before public proof output', () => {
    const proof = buildEvidenceProvenanceProof({
      evidence_id: 'evidence-route-claim-complete-assign',
      source_summary: {
        kind: 'hermes://session/private',
        status: 'dispatch',
        role: 'webhook',
        output_candidate: false,
        mapped: true,
        time: {
          observed_at: null,
          collected_at: null
        }
      },
      record: {
        observed_at: null,
        collected_at: null,
        agent_id: 'profile-prod',
        source_kind: 'hermes://profile/private',
        evidence_role: 'payload',
        source_status: 'control-plane',
        output_candidate: false,
        collector_snapshot_id: 'collector-route-token',
        correlation_id: 'corr-assign',
        unmapped: false
      },
      anchors: {
        snapshot: {
          collector_snapshot_id: 'collector-route-token',
          route: '/collectors/dispatch/route?path=/Users/cwp/private&token=sk-live-1234567890abcdef'
        },
        source: {
          evidence_id: 'source-claim-complete',
          source_kind: 'hermes://profile/private',
          evidence_role: 'payload',
          source_status: 'control-plane',
          route: '/evidence-records/source-claim-complete'
        },
        replay: {
          correlation_id: 'session-prod',
          route: '/accountability/replay?correlation_id=session-prod'
        }
      }
    } as unknown as EvidenceProvenanceBundle);

    expect(proof).toMatchObject({
      evidenceId: '[redacted]',
      sourceSummary: {
        kind: null,
        status: null,
        role: null,
        outputCandidate: false,
        mapped: true,
        time: {
          observedAt: null,
          collectedAt: null
        }
      },
      record: {
        observedAt: null,
        collectedAt: null,
        agentId: null,
        sourceKind: '[redacted]',
        evidenceRole: null,
        sourceStatus: null,
        outputCandidate: false,
        collectorSnapshotId: '[redacted]',
        correlationId: null,
        unmapped: false
      },
      anchors: []
    });
    expectNoForbiddenPublicUiText(proof);
  });

  it('uses evidence_id for replay proof anchors when correlation_id is absent', () => {
    const proof = buildEvidenceProvenanceProof({
      evidence_id: 'evidence-record-1',
      source_summary: {
        kind: 'workspace_file',
        status: 'observed',
        role: 'agent_plan',
        output_candidate: false,
        mapped: true,
        time: {
          observed_at: null,
          collected_at: null
        }
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
        correlation_id: null,
        unmapped: false
      },
      anchors: {
        snapshot: null,
        source: null,
        replay: {
          evidence_id: 'evidence-record-1',
          route: '/accountability/replay?evidence_id=evidence-record-1'
        }
      }
    });

    expect(proof?.anchors).toEqual([
      {
        kind: 'replay',
        id: 'evidence-record-1',
        label: 'Replay',
        route: '/accountability/replay?evidence_id=evidence-record-1'
      }
    ]);
  });
});
