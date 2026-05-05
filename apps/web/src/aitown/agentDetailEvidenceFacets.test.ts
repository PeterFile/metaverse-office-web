import { describe, expect, it } from 'vitest';

import { deriveAgentDetailEvidenceFacets } from './agentDetailEvidenceFacets';
import type { AgentDetail } from '../types';

function buildAgentDetail(overrides: Partial<AgentDetail> = {}): AgentDetail {
  return {
    agent_id: 'agent-1',
    display_name: 'Agent One',
    current_state: 'working',
    active_task: 'Ship feature',
    current_location: 'desk',
    latest_heartbeat: null,
    open_peer_watch_alerts: [],
    recent_events: [],
    recent_interactions: [],
    recent_incidents: [],
    recent_handoffs: [],
    recent_reboots: [],
    ...overrides
  };
}

describe('deriveAgentDetailEvidenceFacets', () => {
  it('normalizes and dedupes noisy explicit facets without changing row order', () => {
    const detail = buildAgentDetail({
      open_peer_watch_alerts: [
        {
          alert_id: 'alert-1',
          ts: '2026-03-16T08:00:00.000Z',
          agent_id: 'agent-1',
          target_agent_id: ' agent-2 ',
          actor_id: 'lead-1',
          observer_agent_id: 'agent-3',
          watcher_agent_ids: ['agent-3'],
          severity: 'orange',
          status: 'open',
          current_state: 'blocked',
          active_task: 'Ship feature',
          summary: 'Do not parse this /fake/path.md',
          evidence_refs: [' /evidence/a.md ', '', '/evidence/a.md'],
          evidence_count: 99,
          correlation_id: ' corr-2 ',
          source_kind: ' peer_watch ',
          metadata: {}
        }
      ],
      recent_events: [
        {
          event_id: ' evt-2 ',
          ts: '2026-03-16T08:01:00.000Z',
          agent_id: 'agent-1',
          actor_id: 'lead-1',
          agent_role: 'engineer',
          event_type: 'status',
          severity: 'yellow',
          current_state: 'working',
          active_task: 'Ship feature',
          location: 'desk',
          summary: 'mentions corr-fake but has explicit ids',
          correlation_id: 'corr-1',
          counterparty_agent_ids: [' agent-2 ', '', 'agent-2'],
          evidence_refs: ['/evidence/b.md', ' /evidence/a.md '],
          source_kind: ' controller_event ',
          metadata: {}
        },
        {
          event_id: '',
          ts: '2026-03-16T08:02:00.000Z',
          agent_id: 'agent-1',
          actor_id: 'lead-1',
          agent_role: 'engineer',
          event_type: 'status',
          severity: 'yellow',
          current_state: 'working',
          active_task: 'Ship feature',
          location: 'desk',
          summary: 'count-only noise',
          correlation_id: null,
          counterparty_agent_ids: [],
          evidence_refs: [''],
          source_kind: ' ',
          metadata: {}
        }
      ],
      recent_interactions: [
        {
          interaction_id: ' interaction-1 ',
          interaction_type: 'review',
          correlation_id: ' corr-1 ',
          started_at: '2026-03-16T08:03:00.000Z',
          participant_agent_ids: ['agent-1', ' agent-4 ', 'agent-4'],
          trigger_event_id: ' evt-2 ',
          evidence_refs: [' /evidence/c.md ', '/evidence/c.md'],
          source_kind: ' workflow_interaction ',
          summary: 'Explicit structured interaction evidence'
        }
      ]
    });

    expect(deriveAgentDetailEvidenceFacets(detail)).toMatchObject({
      status: 'evidence_present',
      agent_id: 'agent-1',
      name: 'Agent One',
      counts: {
        evidence_refs: 3,
        source_kinds: 3,
        correlations: 2,
        events: 1,
        interactions: 1,
        handoffs: 0,
        reboots: 0,
        incidents: 0,
        peer_watch_alerts: 1
      },
      evidence_refs: ['/evidence/a.md', '/evidence/b.md', '/evidence/c.md'],
      source_kinds: ['controller_event', 'peer_watch', 'workflow_interaction'],
      correlation_ids: ['corr-1', 'corr-2'],
      event_ids: ['evt-2'],
      counterparty_agent_ids: ['agent-2', 'agent-4']
    });
    expect(deriveAgentDetailEvidenceFacets(detail).rows.map((row) => row.source_slice)).toEqual([
      'open_peer_watch_alerts',
      'recent_events',
      'recent_interactions'
    ]);
  });

  it('does not fabricate facets for null, undefined, or overview-only detail', () => {
    expect(deriveAgentDetailEvidenceFacets(null)).toMatchObject({
      status: 'empty',
      agent_id: null,
      rows: [],
      evidence_refs: [],
      source_kinds: [],
      correlation_ids: [],
      incident_ids: [],
      event_ids: [],
      counterparty_agent_ids: []
    });
    expect(deriveAgentDetailEvidenceFacets(undefined).status).toBe('empty');

    expect(
      deriveAgentDetailEvidenceFacets(
        buildAgentDetail({
          current_state: 'mentions /fake/path.md corr-fake event-fake',
          active_task: 'no explicit structured evidence'
        })
      )
    ).toMatchObject({
      status: 'no_structured_evidence',
      agent_id: 'agent-1',
      name: 'Agent One',
      rows: [],
      evidence_refs: [],
      source_kinds: [],
      correlation_ids: [],
      incident_ids: [],
      event_ids: [],
      counterparty_agent_ids: []
    });
  });

  it('does not mutate or alias input arrays', () => {
    const eventEvidenceRefs = [' /evidence/a.md ', '/evidence/a.md', ''];
    const counterpartyAgentIds = [' agent-2 '];
    const detail = buildAgentDetail({
      recent_events: [
        {
          event_id: 'evt-1',
          ts: '2026-03-16T08:01:00.000Z',
          agent_id: 'agent-1',
          actor_id: 'lead-1',
          agent_role: 'engineer',
          event_type: 'status',
          severity: 'yellow',
          current_state: 'working',
          active_task: 'Ship feature',
          location: 'desk',
          summary: 'structured evidence',
          correlation_id: null,
          counterparty_agent_ids: counterpartyAgentIds,
          evidence_refs: eventEvidenceRefs,
          source_kind: 'controller_event',
          metadata: {}
        }
      ]
    });

    const facets = deriveAgentDetailEvidenceFacets(detail);

    expect(eventEvidenceRefs).toEqual([' /evidence/a.md ', '/evidence/a.md', '']);
    expect(counterpartyAgentIds).toEqual([' agent-2 ']);

    facets.evidence_refs.push('/evidence/mutated.md');
    facets.counterparty_agent_ids.push('agent-mutated');
    facets.rows[0].evidence_refs.push('/evidence/row-mutated.md');

    expect(eventEvidenceRefs).toEqual([' /evidence/a.md ', '/evidence/a.md', '']);
    expect(counterpartyAgentIds).toEqual([' agent-2 ']);
    expect(deriveAgentDetailEvidenceFacets(detail).evidence_refs).toEqual(['/evidence/a.md']);
  });
});
