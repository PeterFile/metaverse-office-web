import { describe, expect, it } from 'vitest';

import type { CollectorItem, CollectorRuntimeSourceEvidence } from '../types';
import {
  deriveCollectorItemSourceHealthFacts,
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
