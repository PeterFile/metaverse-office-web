import { describe, expect, it } from 'vitest';

import {
  collectInteractionSourceKinds,
  formatCollectorDerivedPeerWatchMetadata
} from './accountabilitySignals';
import type { WorkflowInteraction } from '../types';

function buildInteraction(overrides: Partial<WorkflowInteraction> = {}): WorkflowInteraction {
  return {
    interaction_id: 'interaction:test',
    interaction_type: 'review',
    correlation_id: 'corr-test',
    started_at: '2026-03-16T08:00:00.000Z',
    participant_agent_ids: ['app-engineering', 'team-lead'],
    trigger_event_id: 'evt-test',
    evidence_refs: ['/evidence/test.md'],
    summary: 'Interaction evidence',
    ...overrides
  };
}

describe('accountability signal provenance', () => {
  it('collects workflow and correlation interaction source kinds for audit Source aggregation', () => {
    expect(
      collectInteractionSourceKinds({
        workflowInteractions: [
          buildInteraction({ source_kind: 'workflow_interaction' }),
          buildInteraction({ interaction_id: 'interaction:missing-source', source_kind: '' })
        ],
        correlationInteractions: [
          buildInteraction({
            interaction_id: 'interaction:correlation',
            source_kind: 'correlation_interaction'
          })
        ]
      })
    ).toEqual(['workflow_interaction', 'correlation_interaction']);
  });

  it('formats collector-derived peer-watch metadata into compact provenance and basis lines', () => {
    expect(
      formatCollectorDerivedPeerWatchMetadata({
        collector_derived: true,
        collector_source: 'controller_snapshot',
        collector_alert_family: 'blocked',
        collector_alert_signature: 'collector:block:app-engineering:orange',
        collected_at: '2026-03-09T18:59:00.000Z',
        last_meaningful_output_at: '2026-03-09T18:20:00.000Z',
        current_blocker: 'Waiting on evidence',
        reboot_recommended: true,
        derived_staleness: {
          severity: 'orange'
        }
      })
    ).toEqual([
      'Provenance · Collector snapshot · blocked · collected 2026-03-09T18:59:00.000Z',
      'Basis · Last output 2026-03-09T18:20:00.000Z · Staleness Orange · Blocker Waiting on evidence · Reboot Recommended · Signature collector:block:app-engineering:orange'
    ]);
  });

  it('ignores non-collector and malformed peer-watch metadata without false provenance', () => {
    expect(
      formatCollectorDerivedPeerWatchMetadata({
        escalation: 'release-review'
      })
    ).toBeNull();
    expect(
      formatCollectorDerivedPeerWatchMetadata({
        collector_derived: true,
        collector_source: ['controller_snapshot'],
        collected_at: 17,
        derived_staleness: 'orange',
        current_blocker: ['Waiting on evidence']
      })
    ).toEqual(['Provenance · Collector snapshot']);
  });
});
