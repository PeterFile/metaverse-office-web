import { describe, expect, it } from 'vitest';

import {
  deriveRuntimeSourceGapWorldPins,
  deriveRuntimeSourceGapInspectPeek,
  deriveRuntimeSourceGapLifecycleStrip,
  deriveRuntimeSourceGapLifecycle,
  deriveSelectedAgentSourceGapFact,
  deriveRuntimeSourceGapChips,
  deriveSourceGapChips,
  deriveSourceHealthWorldBadges
} from './sourceGapSignals';
import type { CollectorSourceHealthProjection, RuntimeSourceGap, RuntimeSourceGapLifecycle } from '../types';

const sourceHealth: CollectorSourceHealthProjection = {
  collected_at: '2026-03-16T09:01:00.000Z',
  collector_snapshot_id: 'collector-snapshot:2026-03-16T09:01:00.000Z',
  actor_id: 'team-lead',
  summary: {
    agent_count: 3,
    source_kind_buckets: {
      workspace_root: { observed: 1, degraded: 0, missing: 1, error: 1 },
      workspace_files: { observed: 0, degraded: 1, missing: 1, error: 0 },
      tmux_session: { observed: 1, degraded: 0, missing: 1, error: 0 },
      hermes_profile: { observed: 0, degraded: 0, missing: 0, error: 0 },
      hermes_session: { observed: 0, degraded: 0, missing: 0, error: 0 }
    },
    status_buckets: {
      observed: 2,
      degraded: 1,
      missing: 3,
      error: 1
    }
  },
  agent_items: [
    {
      agent_id: 'app-engineering',
      workspace_root: '/tmp/app-engineering',
      session_ref: '5-web3-app-engineering',
      evidence_ref_count: 2,
      evidence_refs: ['/tmp/app-engineering/outbox.md'],
      latest_evidence_at: '2026-03-16T08:59:30.000Z',
      source_health: {
        workspace_files: {
          status: 'degraded',
          expected_files: ['inbox.md', 'outbox.md', 'todo.md'],
          observed_count: 1,
          missing_count: 2,
          error_count: 0,
          last_observed_at: '2026-03-16T08:59:00.000Z',
          degraded_reasons: ['missing workspace files: inbox.md, todo.md']
        }
      }
    },
    {
      agent_id: 'growth-revenue',
      workspace_root: '/tmp/growth-revenue',
      session_ref: '6-web3-growth-revenue',
      evidence_ref_count: 0,
      evidence_refs: [],
      latest_evidence_at: null,
      source_health: {
        workspace_root: {
          status: 'error',
          path: '/tmp/growth-revenue',
          last_observed_at: null,
          degraded_reasons: ['workspace root read failed']
        },
        tmux_session: {
          status: 'missing',
          expected_session_ref: '6-web3-growth-revenue',
          observed_count: 0,
          last_observed_at: null,
          degraded_reasons: ['tmux session not observed']
        }
      }
    },
    {
      agent_id: 'team-lead',
      workspace_root: '/tmp/team-lead',
      session_ref: '7-web3-team-lead',
      evidence_ref_count: 1,
      evidence_refs: ['/tmp/team-lead/outbox.md'],
      latest_evidence_at: '2026-03-16T08:58:30.000Z',
      source_health: {
        workspace_root: {
          status: 'missing',
          path: '/tmp/team-lead',
          last_observed_at: null,
          degraded_reasons: ['workspace root not observed']
        }
      }
    }
  ],
  runtime_source_evidence: {
    unmapped_tmux_sessions: []
  }
};

describe('deriveSourceGapChips', () => {
  it('returns at most three non-observed source gaps ordered by worst source status', () => {
    const chips = deriveSourceGapChips(sourceHealth, [
      { agent_id: 'app-engineering', display_name: 'App Engineering Agent' },
      { agent_id: 'growth-revenue', display_name: 'Growth Revenue Agent' },
      { agent_id: 'team-lead', display_name: 'Team Lead Agent' }
    ]);

    expect(chips).toEqual([
      {
        agentId: 'growth-revenue',
        displayName: 'Growth Revenue Agent',
        sourceDrilldownGroupKey: 'workspace',
        sourceKind: 'workspace_root',
        status: 'error',
        sourceLabel: 'Workspace root',
        detail: '0 refs · latest evidence unavailable',
        observedAtLabel: 'Not observed'
      },
      {
        agentId: 'growth-revenue',
        displayName: 'Growth Revenue Agent',
        sourceDrilldownGroupKey: 'tmux',
        sourceKind: 'tmux_session',
        status: 'missing',
        sourceLabel: 'Tmux session',
        detail: '0 observations · latest evidence unavailable',
        observedAtLabel: 'Not observed'
      },
      {
        agentId: 'team-lead',
        displayName: 'Team Lead Agent',
        sourceDrilldownGroupKey: 'workspace',
        sourceKind: 'workspace_root',
        status: 'missing',
        sourceLabel: 'Workspace root',
        detail: '1 evidence ref · latest evidence 2026-03-16T08:58:30.000Z',
        observedAtLabel: 'Not observed'
      }
    ]);
  });

  it('returns an empty no-gap state when every source is observed or absent', () => {
    expect(
      deriveSourceGapChips(
        {
          ...sourceHealth,
          agent_items: [
            {
              agent_id: 'app-engineering',
              workspace_root: '/tmp/app-engineering',
              session_ref: '5-web3-app-engineering',
              evidence_ref_count: 2,
              evidence_refs: ['/tmp/app-engineering/outbox.md'],
              latest_evidence_at: '2026-03-16T08:59:30.000Z',
              source_health: {
                workspace_root: {
                  status: 'observed',
                  path: '/tmp/app-engineering',
                  last_observed_at: '2026-03-16T08:59:00.000Z',
                  degraded_reasons: []
                }
              }
            }
          ]
        },
        [{ agent_id: 'app-engineering', display_name: 'App Engineering Agent' }]
      )
    ).toEqual([]);
  });

  it('includes mapped Hermes source-health gaps with compact chip details', () => {
    const chips = deriveSourceGapChips(
      {
        ...sourceHealth,
        summary: {
          ...sourceHealth.summary,
          source_kind_buckets: {
            ...sourceHealth.summary.source_kind_buckets,
            hermes_profile: { observed: 0, degraded: 0, missing: 1, error: 0 },
            hermes_session: { observed: 0, degraded: 1, missing: 0, error: 0 }
          }
        },
        agent_items: [
          {
            agent_id: 'app-engineering',
            workspace_root: '/tmp/app-engineering',
            session_ref: '5-web3-app-engineering',
            evidence_ref_count: 2,
            evidence_refs: [
              'hermes://profile/profile-app-engineering',
              'hermes://session/5-web3-app-engineering'
            ],
            latest_evidence_at: '2026-03-16T08:59:30.000Z',
            source_health: {
              hermes_profile: {
                status: 'missing',
                profile_id: 'profile-app-engineering',
                evidence_ref: 'hermes://profile/profile-app-engineering',
                last_observed_at: null,
                degraded_reasons: ['Hermes profile missing']
              },
              hermes_session: {
                status: 'degraded',
                expected_session_ref: '5-web3-app-engineering',
                evidence_ref: 'hermes://session/5-web3-app-engineering',
                last_observed_at: '2026-03-16T08:59:00.000Z',
                degraded_reasons: ['Hermes session stale']
              }
            }
          }
        ]
      },
      [{ agent_id: 'app-engineering', display_name: 'App Engineering Agent' }]
    );

    expect(chips).toEqual([
      {
        agentId: 'app-engineering',
        displayName: 'App Engineering Agent',
        sourceDrilldownGroupKey: 'hermes',
        sourceKind: 'hermes_profile',
        status: 'missing',
        sourceLabel: 'Hermes profile',
        detail: '2 refs · latest evidence 2026-03-16T08:59:30.000Z',
        observedAtLabel: 'Not observed'
      },
      {
        agentId: 'app-engineering',
        displayName: 'App Engineering Agent',
        sourceDrilldownGroupKey: 'hermes',
        sourceKind: 'hermes_session',
        status: 'degraded',
        sourceLabel: 'Hermes session',
        detail: '2 refs · latest evidence 2026-03-16T08:59:30.000Z',
        observedAtLabel: 'Observed 2026-03-16T08:59:00.000Z'
      }
    ]);
    for (const chip of chips) {
      expect(chip.detail).not.toContain('hermes://');
      expect(chip.detail).not.toContain('profile-app-engineering');
      expect(chip.detail).not.toContain('5-web3-app-engineering');
    }
  });

  it('keeps source-gap chips bounded with Hermes kinds after tmux in tie-break order', () => {
    const orderedMissingSourceHealth = {
      tmux_session: {
        status: 'missing' as const,
        expected_session_ref: '5-web3-app-engineering',
        observed_count: 0,
        last_observed_at: null,
        degraded_reasons: ['tmux session missing']
      },
      hermes_profile: {
        status: 'missing' as const,
        profile_id: 'profile-app-engineering',
        evidence_ref: 'hermes://profile/profile-app-engineering',
        last_observed_at: null,
        degraded_reasons: ['Hermes profile missing']
      },
      hermes_session: {
        status: 'missing' as const,
        expected_session_ref: '5-web3-app-engineering',
        evidence_ref: 'hermes://session/5-web3-app-engineering',
        last_observed_at: null,
        degraded_reasons: ['Hermes session missing']
      }
    };

    const sourceKinds = deriveSourceGapChips(
      {
        ...sourceHealth,
        agent_items: [
          {
            agent_id: 'app-engineering',
            workspace_root: '/tmp/app-engineering',
            session_ref: '5-web3-app-engineering',
            evidence_ref_count: 1,
            evidence_refs: ['/tmp/app-engineering/outbox.md'],
            latest_evidence_at: '2026-03-16T08:59:30.000Z',
            source_health: {
              workspace_root: {
                status: 'missing',
                path: '/tmp/app-engineering',
                last_observed_at: null,
                degraded_reasons: ['workspace root missing']
              },
              workspace_files: {
                status: 'missing',
                expected_files: ['inbox.md'],
                observed_count: 0,
                missing_count: 1,
                error_count: 0,
                last_observed_at: null,
                degraded_reasons: ['workspace file missing']
              },
              ...orderedMissingSourceHealth
            }
          }
        ]
      },
      [{ agent_id: 'app-engineering', display_name: 'App Engineering Agent' }]
    ).map((chip) => chip.sourceKind);
    expect(sourceKinds).toEqual(['workspace_root', 'workspace_files', 'tmux_session']);

    const hermesSourceKinds = deriveSourceGapChips(
      {
        ...sourceHealth,
        agent_items: [
          {
            agent_id: 'app-engineering',
            workspace_root: '/tmp/app-engineering',
            session_ref: '5-web3-app-engineering',
            evidence_ref_count: 1,
            evidence_refs: ['/tmp/app-engineering/outbox.md'],
            latest_evidence_at: '2026-03-16T08:59:30.000Z',
            source_health: orderedMissingSourceHealth
          }
        ]
      },
      [{ agent_id: 'app-engineering', display_name: 'App Engineering Agent' }]
    ).map((chip) => chip.sourceKind);
    expect(hermesSourceKinds).toEqual(['tmux_session', 'hermes_profile', 'hermes_session']);
  });

  it('does not turn unmapped Hermes runtime sources into source-gap chips', () => {
    expect(
      deriveSourceGapChips(
        {
          ...sourceHealth,
          agent_items: [],
          runtime_source_evidence: {
            unmapped_tmux_sessions: [],
            unmapped_hermes_sources: [
              {
                source_kind: 'hermes_session',
                evidence_ref: 'hermes://session/unmapped-session',
                profile_id: null,
                session_ref: 'unmapped-session',
                observed_at: '2026-03-16T08:59:30.000Z',
                status: 'missing',
                degraded_reasons: ['Hermes session not mapped to an agent']
              }
            ]
          }
        },
        [{ agent_id: 'app-engineering', display_name: 'App Engineering Agent' }]
      )
    ).toEqual([]);
  });
});

describe('deriveRuntimeSourceGapChips', () => {
  const runtimeSourceGaps: RuntimeSourceGap[] = [
    {
      observed_at: '2026-03-16T08:59:30.000Z',
      collected_at: '2026-03-16T09:01:00.000Z',
      agent_id: 'app-engineering',
      source_kind: 'workspace_file',
      evidence_role: 'agent_output',
      source_status: 'degraded',
      output_candidate: true,
      collector_snapshot_id: 'collector-snapshot:2026-03-16T09:01:00.000Z',
      correlation_id: 'collector-snapshot:2026-03-16T09:01:00.000Z',
      degraded_reasons: ['raw path /tmp/app-engineering/outbox.md must not render'],
      unmapped: false
    },
    {
      observed_at: '2026-03-16T08:58:30.000Z',
      collected_at: '2026-03-16T09:01:00.000Z',
      agent_id: null,
      source_kind: 'tmux_observation',
      evidence_role: 'runtime_unmapped',
      source_status: 'observed',
      output_candidate: false,
      collector_snapshot_id: 'collector-snapshot:2026-03-16T09:01:00.000Z',
      correlation_id: 'collector-snapshot:2026-03-16T09:01:00.000Z',
      degraded_reasons: ['raw tmux://outside-tools/0.0 must not render'],
      unmapped: true
    }
  ];

  it('maps bounded runtime source gaps into compact queue chips without raw provenance payloads', () => {
    const chips = deriveRuntimeSourceGapChips(runtimeSourceGaps, [
      { agent_id: 'app-engineering', display_name: 'App Engineering Agent' }
    ]);

    expect(chips).toEqual([
      {
        agentId: 'app-engineering',
        displayName: 'App Engineering Agent',
        isMapped: true,
        sourceDrilldownGroupKey: 'workspace',
        sourceKind: 'workspace_files',
        status: 'degraded',
        sourceLabel: 'Workspace files',
        lifecycleLabel: 'Current gap',
        detail: 'agent output · output candidate',
        observedAtLabel: 'Observed 2026-03-16T08:59:30.000Z'
      },
      {
        agentId: null,
        displayName: 'Unmapped runtime source',
        isMapped: false,
        sourceDrilldownGroupKey: null,
        sourceKind: 'tmux_session',
        status: 'observed',
        sourceLabel: 'Tmux session',
        lifecycleLabel: 'Unmapped observed',
        detail: 'unmapped runtime source · not mapped to an agent',
        observedAtLabel: 'Observed 2026-03-16T08:58:30.000Z'
      }
    ]);
    expect(JSON.stringify(chips)).not.toContain('/tmp/app-engineering');
    expect(JSON.stringify(chips)).not.toContain('tmux://');
    expect(JSON.stringify(chips)).not.toContain('collector-snapshot:');
  });

  it('does not label unmapped runtime evidence as agent output', () => {
    const [chip] = deriveRuntimeSourceGapChips(
      [
        {
          ...runtimeSourceGaps[1],
          evidence_role: 'agent_output'
        }
      ],
      [{ agent_id: 'app-engineering', display_name: 'App Engineering Agent' }]
    );

    expect(chip.detail).toBe('unmapped runtime source · not mapped to an agent');
    expect(chip.detail).not.toContain('agent output');
  });

  it('projects runtime source gaps as passive world pins with unmapped evidence kept separate', () => {
    const pins = deriveRuntimeSourceGapWorldPins(runtimeSourceGaps, [
      { agent_id: 'app-engineering', display_name: 'App Engineering Agent' }
    ]);

    expect(pins).toEqual([
      {
        pinId: 'source-gap:app-engineering:workspace_files:degraded:0',
        agentId: 'app-engineering',
        displayName: 'App Engineering Agent',
        isMapped: true,
        sourceDrilldownGroupKey: 'workspace',
        sourceKind: 'workspace_files',
        status: 'degraded',
        sourceLabel: 'Workspace files',
        lifecycleLabel: 'Current gap',
        observedAtLabel: 'Observed 2026-03-16T08:59:30.000Z'
      },
      {
        pinId: 'source-gap:unmapped:tmux_session:observed:1',
        agentId: null,
        displayName: 'Unmapped runtime source',
        isMapped: false,
        sourceDrilldownGroupKey: null,
        sourceKind: 'tmux_session',
        status: 'observed',
        sourceLabel: 'Tmux session',
        lifecycleLabel: 'Unmapped observed',
        observedAtLabel: 'Observed 2026-03-16T08:58:30.000Z'
      }
    ]);
    expect(JSON.stringify(pins)).not.toContain('/tmp/app-engineering');
    expect(JSON.stringify(pins)).not.toContain('tmux://');
    expect(JSON.stringify(pins)).not.toContain('agent output');
    expect(JSON.stringify(pins)).not.toContain('collector-snapshot:');
    expect(JSON.stringify(pins)).not.toContain('clickable');
  });

  it('derives a sanitized source-gap inspect peek for the active mapped focus', () => {
    const peek = deriveRuntimeSourceGapInspectPeek(
      runtimeSourceGaps,
      'app-engineering',
      {
        agentId: 'app-engineering',
        sourceDrilldownGroupKey: 'workspace'
      },
      [{ agent_id: 'app-engineering', display_name: 'App Engineering Agent' }]
    );

    expect(peek).toEqual({
      agentId: 'app-engineering',
      displayName: 'App Engineering Agent',
      evidenceOnlyLabel: 'Evidence only',
      mappingLabel: 'Mapped source',
      sourceKindLabel: 'Workspace files',
      statusLabel: 'degraded',
      observedAtLabel: 'Observed 2026-03-16T08:59:30.000Z',
      collectedAtLabel: 'Collected 2026-03-16T09:01:00.000Z'
    });
    expect(JSON.stringify(peek)).not.toContain('/tmp/app-engineering');
    expect(JSON.stringify(peek)).not.toContain('collector-snapshot:');
    expect(JSON.stringify(peek)).not.toContain('raw path');
    expect(JSON.stringify(peek)).not.toContain('assign');
    expect(JSON.stringify(peek)).not.toContain('claim');
    expect(JSON.stringify(peek)).not.toContain('dispatch');
    expect(JSON.stringify(peek)).not.toContain('kanban');
    expect(JSON.stringify(peek)).not.toContain('route');
  });
});

describe('deriveRuntimeSourceGapLifecycle', () => {
  const baseGap: RuntimeSourceGap = {
    observed_at: '2026-03-16T08:59:30.000Z',
    collected_at: '2026-03-16T09:01:00.000Z',
    agent_id: 'app-engineering',
    source_kind: 'workspace_file',
    evidence_role: 'agent_output',
    source_status: 'degraded',
    output_candidate: true,
    collector_snapshot_id: 'collector-snapshot:current',
    correlation_id: 'source-gap:workspace-output',
    degraded_reasons: ['raw path /tmp/app-engineering/outbox.md must not render'],
    unmapped: false
  };

  it('classifies mapped missing, degraded, and error rows as current gaps', () => {
    const lifecycle = deriveRuntimeSourceGapLifecycle([
      { ...baseGap, source_status: 'missing', source_kind: 'workspace_root', evidence_role: 'workspace_root' },
      { ...baseGap, source_status: 'degraded', source_kind: 'workspace_file', evidence_role: 'agent_output' },
      { ...baseGap, source_status: 'error', source_kind: 'hermes_session', evidence_role: 'hermes_session' }
    ]);

    expect(lifecycle.map((item) => [item.sourceKind, item.status, item.state])).toEqual([
      ['hermes_session', 'error', 'current_gap'],
      ['workspace_root', 'missing', 'current_gap'],
      ['workspace_files', 'degraded', 'current_gap']
    ]);
  });

  it('classifies unmapped observed runtime evidence separately from current gaps', () => {
    const lifecycle = deriveRuntimeSourceGapLifecycle([
      {
        ...baseGap,
        agent_id: null,
        source_kind: 'tmux_observation',
        evidence_role: 'runtime_unmapped',
        source_status: 'observed',
        output_candidate: false,
        unmapped: true
      }
    ]);

    expect(lifecycle).toEqual([
      {
        key: 'agent:unmapped|source:tmux_session|role:runtime_unmapped|status:observed',
        agentId: null,
        sourceKind: 'tmux_session',
        evidenceRole: 'runtime_unmapped',
        status: 'observed',
        state: 'unmapped_observed',
        count: 1,
        firstObservedAt: '2026-03-16T08:59:30.000Z',
        lastObservedAt: '2026-03-16T08:59:30.000Z'
      }
    ]);
  });

  it('distinguishes new, ongoing, and recurring groups without raw path, snapshot, or payload leakage', () => {
    const lifecycle = deriveRuntimeSourceGapLifecycle(
      [
        { ...baseGap, source_kind: 'workspace_root', evidence_role: 'workspace_root', correlation_id: 'source-gap:new' },
        {
          ...baseGap,
          source_kind: 'workspace_file',
          evidence_role: 'agent_output',
          correlation_id: 'collector-snapshot:2026-03-16T09:01:00.000Z',
          collector_snapshot_id: 'collector-snapshot:2026-03-16T09:01:00.000Z'
        },
        {
          ...baseGap,
          source_kind: 'tmux_observation',
          evidence_role: 'tmux_session',
          correlation_id: 'collector-snapshot:2026-03-16T09:02:00.000Z',
          collector_snapshot_id: 'collector-snapshot:2026-03-16T09:02:00.000Z',
          observed_at: '2026-03-16T09:02:00.000Z'
        },
        {
          ...baseGap,
          source_kind: 'tmux_observation',
          evidence_role: 'tmux_session',
          correlation_id: 'collector-snapshot:2026-03-16T09:03:00.000Z',
          collector_snapshot_id: 'collector-snapshot:2026-03-16T09:03:00.000Z',
          observed_at: '2026-03-16T09:03:00.000Z'
        }
      ],
      {
        priorRows: [
          {
            ...baseGap,
            source_kind: 'workspace_file',
            evidence_role: 'agent_output',
            correlation_id: 'collector-snapshot:2026-03-16T08:01:00.000Z',
            collector_snapshot_id: 'collector-snapshot:2026-03-16T08:01:00.000Z'
          },
          {
            ...baseGap,
            source_kind: 'tmux_observation',
            evidence_role: 'tmux_session',
            correlation_id: 'collector-snapshot:2026-03-16T08:02:00.000Z',
            collector_snapshot_id: 'collector-snapshot:2026-03-16T08:02:00.000Z'
          }
        ]
      }
    );

    expect(lifecycle.map((item) => [item.key, item.state, item.count])).toEqual([
      [
        'agent:app-engineering|source:workspace_root|role:workspace_root|status:degraded',
        'new',
        1
      ],
      [
        'agent:app-engineering|source:workspace_files|role:agent_output|status:degraded',
        'ongoing',
        1
      ],
      [
        'agent:app-engineering|source:tmux_session|role:tmux_session|status:degraded',
        'recurring',
        2
      ]
    ]);
    expect(JSON.stringify(lifecycle)).not.toContain('/tmp/app-engineering');
    expect(JSON.stringify(lifecycle)).not.toContain('collector-snapshot:');
    expect(JSON.stringify(lifecycle)).not.toContain('payload');
  });

  it('ignores unknown source kinds and keeps deterministic status/source ordering', () => {
    const lifecycle = deriveRuntimeSourceGapLifecycle([
      { ...baseGap, source_kind: 'unknown_runtime_source', source_status: 'error' },
      { ...baseGap, source_kind: 'workspace_file', source_status: 'degraded', correlation_id: 'z' },
      { ...baseGap, source_kind: 'workspace_root', source_status: 'missing', correlation_id: 'a' },
      { ...baseGap, source_kind: 'tmux_observation', source_status: 'error', correlation_id: 'm' }
    ]);

    expect(lifecycle.map((item) => [item.sourceKind, item.status, item.key])).toEqual([
      ['tmux_session', 'error', 'agent:app-engineering|source:tmux_session|role:agent_output|status:error'],
      ['workspace_root', 'missing', 'agent:app-engineering|source:workspace_root|role:agent_output|status:missing'],
      ['workspace_files', 'degraded', 'agent:app-engineering|source:workspace_files|role:agent_output|status:degraded']
    ]);
  });

  it('does not claim recovered state from prior gaps without current recovery evidence', () => {
    const lifecycle = deriveRuntimeSourceGapLifecycle([], { priorRows: [baseGap] });

    expect(lifecycle).toEqual([]);
    expect(JSON.stringify(lifecycle)).not.toContain('recovered');
  });

  it('does not expose liveness or productivity labels', () => {
    const lifecycle = deriveRuntimeSourceGapLifecycle([baseGap]);

    expect(JSON.stringify(lifecycle).toLowerCase()).not.toMatch(/liveness|productive|productivity/);
  });
});

describe('deriveRuntimeSourceGapLifecycleStrip', () => {
  const baseLifecycle: RuntimeSourceGapLifecycle = {
    total_count: 3,
    total_groups: 3,
    returned_limit: 25,
    groups: [
      {
        agent_id: 'app-engineering',
        source_kind: 'workspace_file',
        evidence_role: 'agent_output',
        current_status: 'degraded',
        lifecycle_state: 'opened',
        first_observed_at: '2026-03-16T08:58:30.000Z',
        last_observed_at: '2026-03-16T08:59:30.000Z',
        first_collected_at: '2026-03-16T09:00:00.000Z',
        last_collected_at: '2026-03-16T09:01:00.000Z',
        record_count: 1,
        snapshot_count: 1,
        source_status_buckets: { degraded: 1 }
      },
      {
        agent_id: null,
        source_kind: 'tmux_observation',
        evidence_role: 'runtime_unmapped',
        current_status: 'observed',
        lifecycle_state: 'observed_unmapped',
        first_observed_at: '2026-03-16T08:59:30.000Z',
        last_observed_at: '2026-03-16T08:59:30.000Z',
        first_collected_at: '2026-03-16T09:01:00.000Z',
        last_collected_at: '2026-03-16T09:01:00.000Z',
        record_count: 1,
        snapshot_count: 1,
        source_status_buckets: { observed: 1 }
      },
      {
        agent_id: 'other-agent',
        source_kind: 'workspace_root',
        evidence_role: 'agent_workspace',
        current_status: 'missing',
        lifecycle_state: 'continuing',
        first_observed_at: null,
        last_observed_at: null,
        first_collected_at: '2026-03-16T09:01:00.000Z',
        last_collected_at: '2026-03-16T09:01:00.000Z',
        record_count: 1,
        snapshot_count: 1,
        source_status_buckets: { missing: 1 }
      }
    ]
  };

  it('preserves the legacy raw-row fallback until App wiring moves to the lifecycle read model', () => {
    const strip = deriveRuntimeSourceGapLifecycleStrip({
      runtimeSourceGaps: [
        {
          observed_at: '2026-03-16T08:59:30.000Z',
          collected_at: '2026-03-16T09:01:00.000Z',
          agent_id: 'app-engineering',
          source_kind: 'workspace_file',
          evidence_role: 'agent_output',
          source_status: 'degraded',
          output_candidate: true,
          collector_snapshot_id: 'collector-snapshot:current',
          correlation_id: 'collector-snapshot:current',
          degraded_reasons: ['raw path /tmp/app-engineering/outbox.md must not render'],
          unmapped: false
        }
      ],
      selectedAgentId: 'app-engineering',
      state: 'ready',
      error: null
    });

    expect(strip).toMatchObject({
      status: 'ready',
      summaryLabel: 'Lifecycle · 1 mapped · 0 unmapped',
      mappedRows: [
        {
          sourceLabel: 'Workspace files',
          statusLabel: 'degraded',
          lifecycleLabel: 'Current gap',
          countLabel: '1 row',
          observedAtLabel: 'Observed 2026-03-16T08:59:30.000Z'
        }
      ],
      unmappedRows: []
    });
    expect(JSON.stringify(strip)).not.toContain('/tmp/app-engineering');
    expect(JSON.stringify(strip)).not.toContain('collector-snapshot:');
    expect(JSON.stringify(strip)).not.toContain('raw path');
  });

  it('keeps selected mapped lifecycle rows separate from unmapped runtime evidence', () => {
    const strip = deriveRuntimeSourceGapLifecycleStrip({
      runtimeSourceGapLifecycle: baseLifecycle,
      selectedAgentId: 'app-engineering',
      state: 'ready',
      error: null
    });

    expect(strip).toEqual({
      status: 'ready',
      summaryLabel: 'Lifecycle · 1 mapped · 1 unmapped',
      mappedRows: [
        {
          key: 'scope:mapped|source:workspace|state:opened|status:degraded|index:0',
          sourceLabel: 'Workspace source',
          statusLabel: 'degraded',
          lifecycleLabel: 'opened',
          countLabel: '1 row',
          observedAtLabel: 'Observed 2026-03-16T08:59:30.000Z'
        }
      ],
      unmappedRows: [
        {
          key: 'scope:unmapped|source:runtime|state:observed_unmapped|status:observed|index:0',
          sourceLabel: 'Runtime source',
          statusLabel: 'observed',
          lifecycleLabel: 'observed unmapped',
          countLabel: '1 row',
          observedAtLabel: 'Observed 2026-03-16T08:59:30.000Z'
        }
      ]
    });
    const serializedStrip = JSON.stringify(strip).toLowerCase();
    expect(serializedStrip).not.toContain('app-engineering');
    expect(serializedStrip).not.toContain('agent_output');
    expect(serializedStrip).not.toContain('runtime_unmapped');
    expect(serializedStrip).not.toContain('tmux');
    expect(serializedStrip).not.toContain('hermes');
    expect(serializedStrip).not.toContain('session');
    expect(serializedStrip).not.toContain('profile');
  });

  it('renders explicit empty, error, and no-snapshot states without implying health', () => {
    expect(
      deriveRuntimeSourceGapLifecycleStrip({
        runtimeSourceGapLifecycle: { ...baseLifecycle, groups: [] },
        selectedAgentId: 'app-engineering',
        state: 'ready',
        error: null
      })
    ).toMatchObject({
      status: 'empty',
      summaryLabel: 'Lifecycle · no runtime source-gap rows in current slice'
    });
    expect(
      deriveRuntimeSourceGapLifecycleStrip({
        runtimeSourceGapLifecycle: null,
        selectedAgentId: 'app-engineering',
        state: 'error',
        error: 'access_token=secret backend failed'
      })
    ).toMatchObject({
      status: 'error',
      summaryLabel: 'Lifecycle · unable to load runtime source-gap rows'
    });

    const staleErrorStrip = deriveRuntimeSourceGapLifecycleStrip({
      runtimeSourceGapLifecycle: baseLifecycle,
      selectedAgentId: 'app-engineering',
      state: 'error',
      error: 'access_token=secret backend failed'
    });

    expect(staleErrorStrip).toMatchObject({
      status: 'error',
      summaryLabel: 'Lifecycle · refresh error; showing last runtime source-gap rows',
      mappedRows: [{ sourceLabel: 'Workspace source' }],
      unmappedRows: [{ sourceLabel: 'Runtime source' }]
    });
    expect(staleErrorStrip?.summaryLabel.toLowerCase()).not.toContain('healthy');
    expect(staleErrorStrip?.summaryLabel.toLowerCase()).not.toContain('observed');

    const staleLoadingStrip = deriveRuntimeSourceGapLifecycleStrip({
      runtimeSourceGapLifecycle: baseLifecycle,
      selectedAgentId: 'app-engineering',
      state: 'loading',
      error: null
    });

    expect(staleLoadingStrip).toMatchObject({
      status: 'loading',
      summaryLabel: 'Lifecycle · refreshing runtime source-gap rows',
      mappedRows: [{ sourceLabel: 'Workspace source' }],
      unmappedRows: [{ sourceLabel: 'Runtime source' }]
    });
    expect(staleLoadingStrip?.summaryLabel.toLowerCase()).not.toContain('ready');
    expect(staleLoadingStrip?.summaryLabel.toLowerCase()).not.toContain('healthy');
    expect(
      deriveRuntimeSourceGapLifecycleStrip({
        runtimeSourceGapLifecycle: null,
        selectedAgentId: 'app-engineering',
        state: 'ready',
        error: null
      })
    ).toMatchObject({
      status: 'no_snapshot',
      summaryLabel: 'Lifecycle · no runtime source-gap snapshot'
    });
  });

  it('skips unknown source kinds and does not serialize hostile lifecycle group fields', () => {
    const strip = deriveRuntimeSourceGapLifecycleStrip({
      runtimeSourceGapLifecycle: {
        ...baseLifecycle,
        groups: [
          {
            agent_id: 'app-engineering',
            source_kind: 'workspace_file',
            evidence_role: 'agent_output protocol://token-control-plane',
            current_status: 'degraded',
            lifecycle_state: 'continuing',
            first_observed_at: '2026-03-16T08:58:30.000Z',
            last_observed_at: '2026-03-16T08:59:30.000Z',
            first_collected_at: '2026-03-16T09:00:00.000Z',
            last_collected_at: '2026-03-16T09:01:00.000Z',
            record_count: 2,
            snapshot_count: 2,
            source_status_buckets: { degraded: 2 }
          },
          {
            agent_id: 'app-engineering',
            source_kind: '/tmp/app-engineering?token=secret-control-plane',
            evidence_role: 'webhook_url=https://example.invalid/hook',
            current_status: 'error',
            lifecycle_state: 'opened',
            first_observed_at: '2026-03-16T08:58:30.000Z',
            last_observed_at: '2026-03-16T08:59:30.000Z',
            first_collected_at: '2026-03-16T09:00:00.000Z',
            last_collected_at: '2026-03-16T09:01:00.000Z',
            record_count: 99,
            snapshot_count: 99,
            source_status_buckets: { error: 99 }
          },
          {
            agent_id: 'app-engineering',
            source_kind: 'workspace_file',
            evidence_role: null,
            current_status:
              'dispatch-control-plane-token=/tmp/app-engineering' as RuntimeSourceGapLifecycle['groups'][number]['current_status'],
            lifecycle_state: 'opened',
            first_observed_at: '2026-03-16T08:58:30.000Z',
            last_observed_at: '2026-03-16T08:59:30.000Z',
            first_collected_at: '2026-03-16T09:00:00.000Z',
            last_collected_at: '2026-03-16T09:01:00.000Z',
            record_count: 97,
            snapshot_count: 97,
            source_status_buckets: { error: 97 }
          },
          {
            agent_id: 'app-engineering',
            source_kind: null,
            evidence_role: 'collector_snapshot_id:secret',
            current_status: 'missing',
            lifecycle_state: 'opened',
            first_observed_at: '2026-03-16T08:58:30.000Z',
            last_observed_at: '2026-03-16T08:59:30.000Z',
            first_collected_at: '2026-03-16T09:00:00.000Z',
            last_collected_at: '2026-03-16T09:01:00.000Z',
            record_count: 98,
            snapshot_count: 98,
            source_status_buckets: { missing: 98 }
          }
        ]
      },
      selectedAgentId: 'app-engineering',
      state: 'ready',
      error: null
    });

    expect(strip?.mappedRows).toHaveLength(2);
    expect(strip?.mappedRows[0]).toMatchObject({
      sourceLabel: 'Workspace source',
      statusLabel: 'degraded',
      lifecycleLabel: 'continuing',
      countLabel: '2 rows'
    });
    expect(strip?.mappedRows[1]).toMatchObject({
      sourceLabel: 'Workspace source',
      statusLabel: 'unknown',
      lifecycleLabel: 'opened',
      countLabel: '97 rows'
    });
    const serializedStrip = JSON.stringify(strip);
    expect(serializedStrip).not.toContain('/tmp/app-engineering');
    expect(serializedStrip).not.toContain('protocol://');
    expect(serializedStrip).not.toContain('token');
    expect(serializedStrip).not.toContain('control-plane');
    expect(serializedStrip).not.toContain('dispatch');
    expect(serializedStrip).not.toContain('webhook');
    expect(serializedStrip).not.toContain('agent_output');
    expect(serializedStrip).not.toContain('99');
    expect(serializedStrip).not.toContain('98');
    expect(serializedStrip).not.toContain('collector_snapshot_id');
  });

  it('renders resolved lifecycle groups without echoing observed or missing current status', () => {
    const strip = deriveRuntimeSourceGapLifecycleStrip({
      runtimeSourceGapLifecycle: {
        ...baseLifecycle,
        groups: [
          {
            agent_id: 'app-engineering',
            source_kind: 'workspace_root',
            evidence_role: null,
            current_status: 'observed',
            lifecycle_state: 'resolved',
            first_observed_at: '2026-03-16T08:58:30.000Z',
            last_observed_at: '2026-03-16T08:59:30.000Z',
            first_collected_at: '2026-03-16T09:00:00.000Z',
            last_collected_at: '2026-03-16T09:01:00.000Z',
            record_count: 1,
            snapshot_count: 1,
            source_status_buckets: { observed: 1 }
          },
          {
            agent_id: 'app-engineering',
            source_kind: 'workspace_file',
            evidence_role: null,
            current_status: null,
            lifecycle_state: 'resolved',
            first_observed_at: '2026-03-16T08:58:30.000Z',
            last_observed_at: '2026-03-16T08:59:31.000Z',
            first_collected_at: '2026-03-16T09:00:00.000Z',
            last_collected_at: '2026-03-16T09:01:00.000Z',
            record_count: 1,
            snapshot_count: 1,
            source_status_buckets: {}
          }
        ]
      },
      selectedAgentId: 'app-engineering',
      state: 'ready',
      error: null
    });

    expect(strip?.mappedRows).toEqual([
      {
        key: 'scope:mapped|source:workspace|state:resolved|status:resolved|index:0',
        sourceLabel: 'Workspace source',
        statusLabel: 'resolved',
        lifecycleLabel: 'resolved',
        countLabel: '1 row',
        observedAtLabel: 'Observed 2026-03-16T08:59:30.000Z'
      },
      {
        key: 'scope:mapped|source:workspace|state:resolved|status:resolved|index:1',
        sourceLabel: 'Workspace source',
        statusLabel: 'resolved',
        lifecycleLabel: 'resolved',
        countLabel: '1 row',
        observedAtLabel: 'Observed 2026-03-16T08:59:31.000Z'
      }
    ]);
  });

  it('keeps active lifecycle rows with unknown current status on a safe fallback label', () => {
    const strip = deriveRuntimeSourceGapLifecycleStrip({
      runtimeSourceGapLifecycle: {
        ...baseLifecycle,
        groups: [
          {
            agent_id: 'app-engineering',
            source_kind: 'workspace_file',
            evidence_role: null,
            current_status: null,
            lifecycle_state: 'opened',
            first_observed_at: '2026-03-16T08:58:30.000Z',
            last_observed_at: '2026-03-16T08:59:30.000Z',
            first_collected_at: '2026-03-16T09:00:00.000Z',
            last_collected_at: '2026-03-16T09:01:00.000Z',
            record_count: 1,
            snapshot_count: 1,
            source_status_buckets: {}
          }
        ]
      },
      selectedAgentId: 'app-engineering',
      state: 'ready',
      error: null
    });

    expect(strip?.mappedRows).toEqual([
      {
        key: 'scope:mapped|source:workspace|state:opened|status:unknown|index:0',
        sourceLabel: 'Workspace source',
        statusLabel: 'unknown',
        lifecycleLabel: 'opened',
        countLabel: '1 row',
        observedAtLabel: 'Observed 2026-03-16T08:59:30.000Z'
      }
    ]);
  });
});

describe('deriveSelectedAgentSourceGapFact', () => {
  it('returns the worst bounded source-gap fact for a selected agent', () => {
    expect(deriveSelectedAgentSourceGapFact(sourceHealth, 'growth-revenue')).toEqual({
      agentId: 'growth-revenue',
      sourceDrilldownGroupKey: 'workspace',
      sourceKind: 'workspace_root',
      sourceLabel: 'Workspace root',
      status: 'error',
      countLabel: '0 refs',
      reason: 'workspace root read failed'
    });
  });

  it('keeps degraded, missing, and error source-health facts compact', () => {
    const fact = deriveSelectedAgentSourceGapFact(
      {
        ...sourceHealth,
        agent_items: [
          {
            agent_id: 'app-engineering',
            workspace_root: '/tmp/app-engineering',
            session_ref: '5-web3-app-engineering',
            evidence_ref_count: 2,
            evidence_refs: ['/tmp/app-engineering/outbox.md'],
            latest_evidence_at: '2026-03-16T08:59:30.000Z',
            source_health: {
              workspace_files: {
                status: 'degraded',
                expected_files: ['inbox.md', 'outbox.md', 'todo.md'],
                observed_count: 1,
                missing_count: 2,
                error_count: 1,
                last_observed_at: '2026-03-16T08:59:00.000Z',
                degraded_reasons: ['missing workspace files: inbox.md, todo.md']
              }
            }
          }
        ]
      },
      'app-engineering'
    );

    expect(fact).toEqual({
      agentId: 'app-engineering',
      sourceDrilldownGroupKey: 'workspace',
      sourceKind: 'workspace_files',
      sourceLabel: 'Workspace files',
      status: 'degraded',
      countLabel: '2 missing files, 1 error, 1 observed',
      reason: 'missing workspace files: inbox.md, todo.md'
    });
  });

  it('does not report observed, absent, no-data, unmapped, or unselected agents as gaps', () => {
    expect(
      deriveSelectedAgentSourceGapFact(
        {
          ...sourceHealth,
          agent_items: [
            {
              agent_id: 'app-engineering',
              workspace_root: '/tmp/app-engineering',
              session_ref: '5-web3-app-engineering',
              evidence_ref_count: 1,
              evidence_refs: ['/tmp/app-engineering/outbox.md'],
              latest_evidence_at: '2026-03-16T08:59:30.000Z',
              source_health: {
                workspace_root: {
                  status: 'observed',
                  path: '/tmp/app-engineering',
                  last_observed_at: '2026-03-16T08:59:00.000Z',
                  degraded_reasons: []
                }
              }
            },
            {
              agent_id: 'team-lead',
              workspace_root: '/tmp/team-lead',
              session_ref: '7-web3-team-lead',
              evidence_ref_count: 0,
              evidence_refs: [],
              latest_evidence_at: null,
              source_health: {}
            }
          ],
          runtime_source_evidence: {
            unmapped_tmux_sessions: [
              {
                session_name: 'unmapped-session',
                observed_count: 1,
                last_observed_at: '2026-03-16T08:59:00.000Z',
                pane_refs: ['%1']
              }
            ],
            unmapped_hermes_sources: [
              {
                source_kind: 'hermes_session',
                evidence_ref: 'hermes://session/unmapped-session',
                profile_id: null,
                session_ref: 'unmapped-session',
                observed_at: '2026-03-16T08:59:00.000Z',
                status: 'missing',
                degraded_reasons: ['Hermes session not mapped to an agent']
              }
            ]
          }
        },
        'app-engineering'
      )
    ).toBeNull();
    expect(deriveSelectedAgentSourceGapFact(sourceHealth, 'ghost-agent')).toBeNull();
    expect(deriveSelectedAgentSourceGapFact(null, 'app-engineering')).toBeNull();
    expect(deriveSelectedAgentSourceGapFact(sourceHealth, null)).toBeNull();
  });

  it('redacts raw workspace paths, tmux refs, Hermes refs, and bounds long evidence text', () => {
    const fact = deriveSelectedAgentSourceGapFact(
      {
        ...sourceHealth,
        agent_items: [
          {
            agent_id: 'app-engineering',
            workspace_root: '/Volumes/HDD/MyStorage/Projects/private/app-engineering',
            session_ref: '5-web3-app-engineering',
            evidence_ref_count: 14,
            evidence_refs: [
              '/Volumes/HDD/MyStorage/Projects/private/app-engineering/outbox-with-a-very-long-name.md',
              'hermes://profile/profile-app-engineering-private',
              'hermes://session/5-web3-app-engineering'
            ],
            latest_evidence_at: '2026-03-16T08:59:30.000Z',
            source_health: {
              hermes_session: {
                status: 'missing',
                expected_session_ref: '5-web3-app-engineering',
                evidence_ref:
                  'hermes://session/5-web3-app-engineering/with/an/excessively/long/evidence/reference/that/must/not/leak',
                last_observed_at: null,
                degraded_reasons: [
                  'Expected 5-web3-app-engineering at /Volumes/HDD/MyStorage/Projects/private/app-engineering with hermes://session/5-web3-app-engineering/with/an/excessively/long/evidence/reference/that/must/not/leak'
                ]
              }
            }
          }
        ]
      },
      'app-engineering'
    );

    expect(fact).toEqual({
      agentId: 'app-engineering',
      sourceDrilldownGroupKey: 'hermes',
      sourceKind: 'hermes_session',
      sourceLabel: 'Hermes session',
      status: 'missing',
      countLabel: '14 refs',
      reason: 'Expected [tmux ref] at [path] with [hermes ref]'
    });
    expect(JSON.stringify(fact)).not.toContain('/Volumes/HDD');
    expect(JSON.stringify(fact)).not.toContain('5-web3-app-engineering');
    expect(JSON.stringify(fact)).not.toContain('profile-app-engineering-private');
    expect(JSON.stringify(fact)).not.toContain('hermes://');
    expect(JSON.stringify(fact).length).toBeLessThan(240);
  });
});

describe('deriveSourceHealthWorldBadges', () => {
  it('returns one worst non-observed source evidence health badge per agent', () => {
    expect(deriveSourceHealthWorldBadges(sourceHealth)).toEqual([
      {
        agentId: 'growth-revenue',
        status: 'error'
      },
      {
        agentId: 'team-lead',
        status: 'missing'
      },
      {
        agentId: 'app-engineering',
        status: 'degraded'
      }
    ]);
  });

  it('omits agents whose source evidence health is fully observed or absent', () => {
    expect(
      deriveSourceHealthWorldBadges({
        ...sourceHealth,
        agent_items: [
          {
            agent_id: 'app-engineering',
            workspace_root: '/tmp/app-engineering',
            session_ref: '5-web3-app-engineering',
            evidence_ref_count: 2,
            evidence_refs: ['/tmp/app-engineering/outbox.md'],
            latest_evidence_at: '2026-03-16T08:59:30.000Z',
            source_health: {
              workspace_root: {
                status: 'observed',
                path: '/tmp/app-engineering',
                last_observed_at: '2026-03-16T08:59:00.000Z',
                degraded_reasons: []
              }
            }
          },
          {
            agent_id: 'team-lead',
            workspace_root: '/tmp/team-lead',
            session_ref: '7-web3-team-lead',
            evidence_ref_count: 1,
            evidence_refs: ['/tmp/team-lead/outbox.md'],
            latest_evidence_at: '2026-03-16T08:58:30.000Z',
            source_health: {}
          }
        ]
      })
    ).toEqual([]);
  });

  it('does not turn unmapped Hermes runtime sources into world badges', () => {
    expect(
      deriveSourceHealthWorldBadges({
        ...sourceHealth,
        agent_items: [
          {
            agent_id: 'app-engineering',
            workspace_root: '/tmp/app-engineering',
            session_ref: '5-web3-app-engineering',
            evidence_ref_count: 0,
            evidence_refs: [],
            latest_evidence_at: null,
            source_health: {}
          }
        ],
        runtime_source_evidence: {
          unmapped_tmux_sessions: [],
          unmapped_hermes_sources: [
            {
              source_kind: 'hermes_session',
              evidence_ref: 'hermes://session/unmapped-session',
              profile_id: null,
              session_ref: 'unmapped-session',
              observed_at: '2026-03-16T08:59:30.000Z',
              status: 'missing',
              degraded_reasons: ['Hermes session not mapped to an agent']
            }
          ]
        }
      })
    ).toEqual([]);
  });
});
