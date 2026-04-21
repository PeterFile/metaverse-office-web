import { describe, expect, it } from 'vitest';

import type { Severity, WorkflowSummary } from '../types';
import {
  WORKFLOW_SUMMARY_SEVERITY_ORDER,
  selectWorkflowSummaryBuckets,
  selectWorkflowSummaryFacets,
  selectWorkflowSummarySeverityBuckets,
} from './summary';

function makeWorkflowSummary(overrides: Partial<WorkflowSummary> = {}): WorkflowSummary {
  return {
    incident_count: 0,
    interaction_count: 0,
    event_count: 0,
    incident_kind_buckets: {},
    interaction_type_buckets: {},
    event_type_buckets: {},
    severity_buckets: {
      normal: 0,
      yellow: 0,
      orange: 0,
      red: 0,
    },
    latest_activity_at: null,
    ...overrides,
  };
}

describe('WORKFLOW_SUMMARY_SEVERITY_ORDER', () => {
  it('keeps severity ordering deterministic for later UI consumers', () => {
    expect(WORKFLOW_SUMMARY_SEVERITY_ORDER).toEqual(['red', 'orange', 'yellow', 'normal']);
  });
});

describe('selectWorkflowSummaryBuckets', () => {
  it('returns buckets sorted by count desc and key asc for ties', () => {
    expect(
      selectWorkflowSummaryBuckets({
        handoff: 2,
        blocked: 2,
        review: 3,
        idle: 0,
      })
    ).toEqual([
      { key: 'review', count: 3 },
      { key: 'blocked', count: 2 },
      { key: 'handoff', count: 2 },
    ]);
  });

  it('returns an empty list when all buckets are empty', () => {
    expect(selectWorkflowSummaryBuckets({})).toEqual([]);
    expect(selectWorkflowSummaryBuckets({ idle: 0, active: 0 })).toEqual([]);
  });
});

describe('selectWorkflowSummarySeverityBuckets', () => {
  it('keeps fixed severity ordering and fills missing partial buckets with zero', () => {
    const summary = makeWorkflowSummary({
      severity_buckets: {
        red: 2,
        yellow: 1,
      } as Record<Severity, number>,
    });

    expect(selectWorkflowSummarySeverityBuckets(summary)).toEqual([
      { severity: 'red', count: 2 },
      { severity: 'orange', count: 0 },
      { severity: 'yellow', count: 1 },
      { severity: 'normal', count: 0 },
    ]);
  });
});

describe('selectWorkflowSummaryFacets', () => {
  it('normalizes counts, non-zero buckets, and latest activity into a stable structure', () => {
    const summary = makeWorkflowSummary({
      incident_count: 4,
      interaction_count: 3,
      event_count: 7,
      incident_kind_buckets: {
        blocker: 2,
        escalation: 2,
        noop: 0,
      },
      interaction_type_buckets: {
        handoff: 1,
        pair: 3,
      },
      event_type_buckets: {
        agent_started: 4,
        agent_waiting: 4,
        agent_idle: 1,
      },
      severity_buckets: {
        normal: 1,
        yellow: 3,
        orange: 2,
        red: 1,
      },
      latest_activity_at: '2026-03-09T18:59:00.000Z',
    });

    expect(selectWorkflowSummaryFacets(summary)).toEqual({
      counts: {
        incident_count: 4,
        interaction_count: 3,
        event_count: 7,
      },
      incidentKinds: [
        { key: 'blocker', count: 2 },
        { key: 'escalation', count: 2 },
      ],
      interactionTypes: [
        { key: 'pair', count: 3 },
        { key: 'handoff', count: 1 },
      ],
      eventTypes: [
        { key: 'agent_started', count: 4 },
        { key: 'agent_waiting', count: 4 },
        { key: 'agent_idle', count: 1 },
      ],
      severities: [
        { severity: 'red', count: 1 },
        { severity: 'orange', count: 2 },
        { severity: 'yellow', count: 3 },
        { severity: 'normal', count: 1 },
      ],
      latestActivityAt: '2026-03-09T18:59:00.000Z',
    });
  });
});
