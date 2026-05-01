import { describe, expect, it } from 'vitest';

import {
  collectInteractionSourceKinds,
  deriveAccountabilityReplayLedgerViewModel,
  formatCollectorDerivedPeerWatchMetadata
} from './accountabilitySignals';
import type { AccountabilityReplayBundle, WorkflowInteraction } from '../types';

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
        agent_id: 'app-engineering',
        actor_id: 'team-lead',
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

describe('accountability replay ledger view model', () => {
  it('keeps event-backed rows replayable with normalized real basis and evidence arrays', () => {
    const viewModel = deriveAccountabilityReplayLedgerViewModel(buildAccountabilityReplayBundle());

    expect(viewModel).toMatchObject({
      basis: 'event_log_and_existing_read_models',
      bounded_by: {
        limit: 3,
        window: '60m'
      },
      counts: {
        event_count: 1,
        interaction_count: 1,
        artifact_count: 1,
        ledger_row_count: 3
      },
      participants: ['app-engineering', 'team-lead'],
      actors: ['team-lead'],
      evidence_refs: ['/evidence/replay.md'],
      source_kind_buckets: {
        controller_event: 1,
        workspace_file: 2
      }
    });
    expect(viewModel.ledger_rows.map((row) => row.entry_id)).toEqual([
      'evt-real-1',
      '/evidence/collector.md',
      'interaction:unbacked'
    ]);
    expect(viewModel.ledger_rows[0]).toMatchObject({
      entry_type: 'event',
      entry_id: 'evt-real-1',
      summary: 'Event-backed replay anchor',
      provenance: 'event_backed_artifact',
      basis_event_ids: ['evt-real-1', 'evt-real-2'],
      evidence_refs: ['/evidence/replay.md', '/evidence/log.md'],
      source_kinds: ['controller_event', 'workspace_file'],
      correlation_ids: ['corr-replay', 'corr-secondary'],
      replayable: true,
      status: 'replayable',
      warning: null
    });
  });

  it('keeps collector observations non-replayable without fake anchors', () => {
    const viewModel = deriveAccountabilityReplayLedgerViewModel(buildAccountabilityReplayBundle());
    const collectorRow = viewModel.ledger_rows[1];

    expect(collectorRow).toMatchObject({
      entry_type: 'memory_artifact',
      entry_id: '/evidence/collector.md',
      basis_event_ids: [],
      evidence_refs: ['/evidence/collector.md'],
      source_kinds: ['collector_snapshot'],
      correlation_ids: ['corr-collector'],
      provenance: 'collector_observation_without_event_id',
      replayable: false,
      status: 'observation_only_no_replay_anchor'
    });
    expect(collectorRow.warning).toContain('observation-only');
    expect(Object.keys(collectorRow)).not.toContain('checkpoint_event_id');
  });

  it('flags rows with no real basis and no collector provenance as unsupported', () => {
    const viewModel = deriveAccountabilityReplayLedgerViewModel(buildAccountabilityReplayBundle());

    expect(viewModel.ledger_rows[2]).toMatchObject({
      entry_type: 'interaction',
      entry_id: 'interaction:unbacked',
      basis_event_ids: [],
      replayable: false,
      status: 'unsupported_unbacked'
    });
    expect(viewModel.ledger_rows[2].warning).toContain('unsupported');
  });

  it('returns an empty safe summary for null and undefined bundles', () => {
    const emptySummary = {
      basis: null,
      bounded_by: null,
      counts: {
        event_count: 0,
        interaction_count: 0,
        artifact_count: 0,
        ledger_row_count: 0
      },
      participants: [],
      actors: [],
      evidence_refs: [],
      source_kind_buckets: {},
      first_ts: null,
      last_ts: null,
      ledger_rows: []
    };

    expect(deriveAccountabilityReplayLedgerViewModel(null)).toEqual(emptySummary);
    expect(deriveAccountabilityReplayLedgerViewModel(undefined)).toEqual(emptySummary);
  });

  it('does not mutate or reuse input bundle arrays', () => {
    const bundle = buildAccountabilityReplayBundle();
    const originalBundle = JSON.parse(JSON.stringify(bundle));

    const viewModel = deriveAccountabilityReplayLedgerViewModel(bundle);

    expect(bundle).toEqual(originalBundle);
    expect(viewModel.participants).not.toBe(bundle.accountability.participant_agent_ids);
    expect(viewModel.ledger_rows[0].basis_event_ids).not.toBe(bundle.ledger[0].basis_event_ids);
  });
});
