import { describe, expect, it } from 'vitest';

import type { CollectorItem, CollectorRuntimeSourceEvidence } from '../types';
import {
  deriveCollectorItemSourceDrilldownGroups,
  deriveCollectorItemSourceHealthFacts,
  deriveRuntimeSourceDrilldownGroups,
  deriveRuntimeSourceEvidenceFacts
} from './sourceHealth';

function buildCollectorItem(overrides: Partial<CollectorItem> = {}): CollectorItem {
  return {
    agent_id: 'app-engineering',
    workspace_root: '/workspace/app-engineering',
    session_ref: 'sess-app',
    evidence_refs: [],
    workspace_observations: [],
    tmux_observations: [],
    supervision: {
      watch_target: null,
      watched_by: [],
      needs_attention: false
    },
    heartbeat: {
      agent_id: 'app-engineering',
      actor_id: 'collector-watch',
      received_at: '2026-03-16T08:59:30.000Z',
      current_state: 'active',
      active_task: '',
      last_meaningful_output_at: null,
      last_file_write_at: null,
      current_blocker: '',
      confidence_level: 'medium',
      reboot_recommended: false
    },
    ...overrides
  };
}

describe('deriveCollectorItemSourceHealthFacts', () => {
  it('returns no facts for old collector snapshots without source health', () => {
    expect(deriveCollectorItemSourceHealthFacts(buildCollectorItem())).toEqual([]);
  });

  it('summarizes observed workspace and tmux evidence sources', () => {
    expect(
      deriveCollectorItemSourceHealthFacts(
        buildCollectorItem({
          source_health: {
            workspace_root: {
              status: 'observed',
              path: '/workspace/app-engineering',
              last_observed_at: '2026-03-16T08:55:00.000Z',
              degraded_reasons: []
            },
            workspace_files: {
              status: 'observed',
              expected_files: ['inbox.md', 'outbox.md', 'todo.md'],
              observed_count: 3,
              missing_count: 0,
              error_count: 0,
              last_observed_at: '2026-03-16T08:56:00.000Z',
              degraded_reasons: []
            },
            tmux_session: {
              status: 'observed',
              expected_session_ref: 'sess-app',
              observed_count: 1,
              last_observed_at: '2026-03-16T08:57:00.000Z',
              degraded_reasons: []
            }
          }
        })
      )
    ).toEqual([
      {
        key: 'workspace-root',
        label: 'Workspace source · Observed',
        status: 'observed'
      },
      {
        key: 'workspace-files',
        label: 'Workspace files source · Observed 3/3',
        status: 'observed'
      },
      {
        key: 'tmux-session',
        label: 'Tmux source · Observed 1 pane',
        status: 'observed'
      }
    ]);
  });

  it('summarizes degraded and missing source gaps without implying agent liveness', () => {
    expect(
      deriveCollectorItemSourceHealthFacts(
        buildCollectorItem({
          source_health: {
            workspace_root: {
              status: 'missing',
              path: '/workspace/app-engineering',
              last_observed_at: null,
              degraded_reasons: ['workspace root not observed']
            },
            workspace_files: {
              status: 'degraded',
              expected_files: ['inbox.md', 'outbox.md', 'todo.md'],
              observed_count: 1,
              missing_count: 2,
              error_count: 0,
              last_observed_at: '2026-03-16T08:56:00.000Z',
              degraded_reasons: ['missing workspace files: outbox.md, todo.md']
            },
            tmux_session: {
              status: 'missing',
              expected_session_ref: 'sess-app',
              observed_count: 0,
              last_observed_at: null,
              degraded_reasons: ['tmux session not observed']
            }
          }
        })
      )
    ).toEqual([
      {
        key: 'workspace-root',
        label: 'Workspace source gap · Root missing',
        status: 'missing'
      },
      {
        key: 'workspace-files',
        label: 'Workspace files source gap · 2 missing, 1 observed',
        status: 'degraded'
      },
      {
        key: 'tmux-session',
        label: 'Tmux source gap · Expected sess-app missing',
        status: 'missing'
      }
    ]);
  });
});

describe('deriveCollectorItemSourceDrilldownGroups', () => {
  it('returns no source drilldown groups for old collector snapshots without source health', () => {
    expect(deriveCollectorItemSourceDrilldownGroups(buildCollectorItem())).toEqual([]);
  });

  it('groups workspace and tmux source evidence with explicit statuses and bounded labels', () => {
    const groups = deriveCollectorItemSourceDrilldownGroups(
      buildCollectorItem({
        source_health: {
          workspace_root: {
            status: 'observed',
            path: '/workspace/app-engineering',
            last_observed_at: '2026-03-16T08:55:00.000Z',
            degraded_reasons: []
          },
          workspace_files: {
            status: 'degraded',
            expected_files: ['inbox.md', 'outbox.md', 'todo.md', 'scratch.md'],
            observed_count: 1,
            missing_count: 2,
            error_count: 1,
            last_observed_at: '2026-03-16T08:56:00.000Z',
            degraded_reasons: [
              'missing workspace files: outbox.md, todo.md',
              'workspace file read error: scratch.md',
              'extra reason should stay bounded'
            ]
          },
          tmux_session: {
            status: 'missing',
            expected_session_ref: 'sess-app',
            observed_count: 0,
            last_observed_at: null,
            degraded_reasons: ['tmux session not observed']
          }
        }
      })
    );

    expect(groups).toEqual([
      {
        key: 'workspace',
        label: 'Workspace source drilldown',
        status: 'degraded',
        summary: 'Workspace source drilldown · degraded',
        details: [
          { key: 'workspace-root-status', label: 'Workspace root status · observed' },
          { key: 'workspace-root-path', label: 'Workspace root path · /workspace/app-engineering' },
          { key: 'workspace-root-observed', label: 'Workspace root observed · 2026-03-16T08:55:00.000Z' },
          { key: 'workspace-files-status', label: 'Workspace files status · degraded' },
          { key: 'workspace-files-expected', label: 'Expected files · inbox.md, outbox.md, todo.md, +1 more' },
          { key: 'workspace-files-observed', label: 'Workspace files observed · 1/4' },
          { key: 'workspace-files-gaps', label: 'Workspace files gaps · 2 missing, 1 error, 1 observed' },
          { key: 'workspace-files-observed-at', label: 'Workspace files observed at · 2026-03-16T08:56:00.000Z' },
          {
            key: 'workspace-files-reason-0',
            label: 'Workspace files reason · missing workspace files: outbox.md, todo.md'
          },
          { key: 'workspace-files-reason-1', label: 'Workspace files reason · workspace file read error: scratch.md' },
          { key: 'workspace-files-reason-overflow', label: 'Workspace files reasons · +1 more' }
        ]
      },
      {
        key: 'tmux',
        label: 'Tmux source drilldown',
        status: 'missing',
        summary: 'Tmux source drilldown · missing',
        details: [
          { key: 'tmux-session-status', label: 'Tmux session status · missing' },
          { key: 'tmux-session-expected', label: 'Expected tmux session · sess-app' },
          { key: 'tmux-session-observed', label: 'Tmux panes observed · 0' },
          { key: 'tmux-session-observed-at', label: 'Tmux session observed at · None' },
          { key: 'tmux-session-reason-0', label: 'Tmux session reason · tmux session not observed' }
        ]
      }
    ]);
  });
});

describe('deriveRuntimeSourceEvidenceFacts', () => {
  it('returns no facts when no unmapped tmux sessions are reported', () => {
    expect(deriveRuntimeSourceEvidenceFacts()).toEqual([]);
    expect(deriveRuntimeSourceEvidenceFacts({ unmapped_tmux_sessions: [] })).toEqual([]);
  });

  it('summarizes unmapped tmux sessions as source gaps', () => {
    const runtimeSourceEvidence: CollectorRuntimeSourceEvidence = {
      unmapped_tmux_sessions: [
        {
          session_name: 'outside-a',
          observed_count: 1,
          last_observed_at: '2026-03-16T08:54:00.000Z',
          pane_refs: ['tmux://outside-a/0.0']
        },
        {
          session_name: 'outside-b',
          observed_count: 2,
          last_observed_at: '2026-03-16T08:58:00.000Z',
          pane_refs: ['tmux://outside-b/0.0', 'tmux://outside-b/0.1']
        }
      ]
    };

    expect(deriveRuntimeSourceEvidenceFacts(runtimeSourceEvidence)).toEqual([
      {
        key: 'unmapped-tmux-sessions',
        label: 'Unmapped tmux source gap · 2 sessions, 3 panes',
        status: 'degraded'
      }
    ]);
  });
});

describe('deriveRuntimeSourceDrilldownGroups', () => {
  it('groups unmapped tmux runtime source gaps with bounded pane refs', () => {
    const groups = deriveRuntimeSourceDrilldownGroups({
      unmapped_tmux_sessions: [
        {
          session_name: 'outside-tools',
          observed_count: 4,
          last_observed_at: '2026-03-16T08:58:00.000Z',
          pane_refs: [
            'tmux://outside-tools/0.0',
            'tmux://outside-tools/0.1',
            'tmux://outside-tools/0.2',
            'tmux://outside-tools/0.3'
          ]
        }
      ]
    });

    expect(groups).toEqual([
      {
        key: 'runtime-tmux',
        label: 'Runtime tmux source drilldown',
        status: 'degraded',
        summary: 'Runtime tmux source drilldown · degraded',
        details: [
          { key: 'unmapped-tmux-session-0', label: 'Unmapped tmux session · outside-tools · 4 panes' },
          { key: 'unmapped-tmux-observed-0', label: 'Unmapped tmux observed at · 2026-03-16T08:58:00.000Z' },
          {
            key: 'unmapped-tmux-panes-0',
            label: 'Unmapped tmux panes · tmux://outside-tools/0.0, tmux://outside-tools/0.1, tmux://outside-tools/0.2, +1 more'
          }
        ]
      }
    ]);
  });

  it('does not put liveness, severity, productivity, or control-plane vocabulary in source drilldown labels', () => {
    const groups = [
      ...deriveCollectorItemSourceDrilldownGroups(
        buildCollectorItem({
          source_health: {
            workspace_root: {
              status: 'missing',
              path: '/workspace/app-engineering',
              last_observed_at: null,
              degraded_reasons: ['workspace root not observed']
            },
            tmux_session: {
              status: 'error',
              expected_session_ref: 'sess-app',
              observed_count: 0,
              last_observed_at: null,
              degraded_reasons: ['tmux query failed']
            }
          }
        })
      ),
      ...deriveRuntimeSourceDrilldownGroups({
        unmapped_tmux_sessions: [
          {
            session_name: 'outside-tools',
            observed_count: 1,
            last_observed_at: null,
            pane_refs: ['tmux://outside-tools/0.0']
          }
        ]
      })
    ];

    const text = groups.flatMap((group) => [group.summary, ...group.details.map((detail) => detail.label)]).join(' ');

    expect(text).not.toMatch(/\b(live|alive|dead|stale|severity|productive|blocked|restart|assign|dispatch|resolve|collect)\b/i);
  });
});
