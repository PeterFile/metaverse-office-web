import { describe, expect, it } from 'vitest';

import { deriveAccountabilityReplayAudit } from './accountabilityReplayAudit';
import type { AccountabilityReplayBundle } from '../types';

function buildAccountabilityReplayBundle(): AccountabilityReplayBundle {
  return {
    generated_at: '2026-03-09T19:00:00.000Z',
    query: {
      limit: 3,
      window: '60m'
    },
    accountability: {
      basis: 'event_log_and_existing_read_models',
      bounded_by: {
        limit: 3,
        window: '60m'
      },
      event_count: 1,
      interaction_count: 1,
      artifact_count: 1,
      participant_agent_ids: [' app-engineering ', 'team-lead', 'app-engineering', ''],
      actor_ids: [' team-lead ', '', 'team-lead'],
      evidence_refs: ['/evidence/replay.md', ' /evidence/replay.md ', ''],
      source_kind_buckets: {
        controller_event: 1,
        workspace_file: 2
      },
      first_ts: '2026-03-09T18:45:00.000Z',
      last_ts: '2026-03-09T18:47:00.000Z'
    },
    ledger: [
      {
        entry_type: 'event',
        entry_id: 'evt-real-1',
        ts: '2026-03-09T18:45:00.000Z',
        basis_event_ids: [' evt-real-1 ', 'evt-real-1', '', 'evt-real-2'],
        agent_id: ' app-engineering ',
        actor_id: ' team-lead ',
        source_kind: ' controller_event ',
        source_kinds: ['workspace_file', ' controller_event ', 'workspace_file', ''],
        evidence_refs: ['/evidence/replay.md', ' /evidence/log.md ', '/evidence/replay.md', ''],
        correlation_id: ' corr-replay ',
        correlation_ids: ['corr-secondary', ' corr-replay ', 'corr-secondary', ''],
        summary: 'Event-backed replay anchor',
        provenance: 'event_backed_artifact'
      },
      {
        entry_type: 'memory_artifact',
        entry_id: '/evidence/collector.md',
        ts: '2026-03-09T18:46:00.000Z',
        basis_event_ids: ['', '   '],
        source_kinds: ['collector_snapshot', ' collector_snapshot ', ''],
        evidence_refs: [' /evidence/collector.md '],
        correlation_ids: [' corr-collector ', '', 'corr-collector'],
        summary: 'Collector observation without event id',
        provenance: 'collector_observation_without_event_id'
      },
      {
        entry_type: 'interaction',
        entry_id: 'interaction:unbacked',
        ts: '2026-03-09T18:47:00.000Z',
        basis_event_ids: [' ', ''],
        evidence_refs: [],
        correlation_ids: [],
        summary: 'Unbacked interaction'
      }
    ],
    events: [],
    interactions: [],
    memory_artifacts: []
  };
}

describe('accountability replay audit summary', () => {
  it('returns an empty safe summary for null and undefined bundles', () => {
    const emptySummary = {
      counts: {
        ledger_row_count: 0,
        replayable_row_count: 0,
        collector_observation_without_event_id_row_count: 0,
        unsupported_unbacked_row_count: 0
      },
      participants: [],
      actors: [],
      evidence_refs: [],
      source_kinds: [],
      correlation_ids: [],
      rows: []
    };

    expect(deriveAccountabilityReplayAudit(null)).toEqual(emptySummary);
    expect(deriveAccountabilityReplayAudit(undefined)).toEqual(emptySummary);
  });

  it('classifies rows from normalized basis ids without inventing replay anchors', () => {
    const audit = deriveAccountabilityReplayAudit(buildAccountabilityReplayBundle());

    expect(audit.counts).toEqual({
      ledger_row_count: 3,
      replayable_row_count: 1,
      collector_observation_without_event_id_row_count: 1,
      unsupported_unbacked_row_count: 1
    });
    expect(audit.participants).toEqual(['app-engineering', 'team-lead']);
    expect(audit.actors).toEqual(['team-lead']);
    expect(audit.evidence_refs).toEqual([
      '/evidence/replay.md',
      '/evidence/log.md',
      '/evidence/collector.md'
    ]);
    expect(audit.source_kinds).toEqual([
      'controller_event',
      'workspace_file',
      'collector_snapshot'
    ]);
    expect(audit.correlation_ids).toEqual(['corr-replay', 'corr-secondary', 'corr-collector']);
    expect(audit.rows.map((row) => row.entry_id)).toEqual([
      'evt-real-1',
      '/evidence/collector.md',
      'interaction:unbacked'
    ]);
    expect(audit.rows[0]).toMatchObject({
      entry_type: 'event',
      entry_id: 'evt-real-1',
      basis_event_ids: ['evt-real-1', 'evt-real-2'],
      evidence_refs: ['/evidence/replay.md', '/evidence/log.md'],
      source_kinds: ['controller_event', 'workspace_file'],
      correlation_ids: ['corr-replay', 'corr-secondary'],
      actors: ['team-lead'],
      participants: ['app-engineering'],
      replayable: true,
      status: 'replayable',
      warning: null
    });
    expect(audit.rows[1]).toMatchObject({
      basis_event_ids: [],
      provenance: 'collector_observation_without_event_id',
      replayable: false,
      status: 'collector_observation_without_event_id',
      warning: 'collector-observation/no replay anchor'
    });
    expect(audit.rows[2]).toMatchObject({
      basis_event_ids: [],
      replayable: false,
      status: 'unsupported_unbacked',
      warning: 'unsupported/unbacked'
    });
    expect(Object.keys(audit.rows[1])).not.toContain('checkpoint_event_id');
  });

  it('does not mutate or reuse input arrays', () => {
    const bundle = buildAccountabilityReplayBundle();
    const originalBundle = JSON.parse(JSON.stringify(bundle));

    const audit = deriveAccountabilityReplayAudit(bundle);

    expect(bundle).toEqual(originalBundle);
    expect(audit.participants).not.toBe(bundle.accountability.participant_agent_ids);
    expect(audit.rows[0].basis_event_ids).not.toBe(bundle.ledger[0].basis_event_ids);
  });
});
