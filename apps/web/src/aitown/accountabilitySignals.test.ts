import { describe, expect, it } from 'vitest';

import { collectInteractionSourceKinds } from './accountabilitySignals';
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
});
