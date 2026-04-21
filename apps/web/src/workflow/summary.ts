import type { Severity, WorkflowSummary } from '../types';

export interface WorkflowSummaryBucket {
  key: string;
  count: number;
}

export interface WorkflowSummarySeverityBucket {
  severity: Severity;
  count: number;
}

export interface WorkflowSummaryCounts {
  incident_count: number;
  interaction_count: number;
  event_count: number;
}

export interface WorkflowSummaryFacets {
  counts: WorkflowSummaryCounts;
  incidentKinds: WorkflowSummaryBucket[];
  interactionTypes: WorkflowSummaryBucket[];
  eventTypes: WorkflowSummaryBucket[];
  severities: WorkflowSummarySeverityBucket[];
  latestActivityAt: string | null;
}

const WORKFLOW_SUMMARY_SEVERITY_ORDER: Severity[] = ['red', 'orange', 'yellow', 'normal'];

export function selectWorkflowSummaryBuckets(
  buckets: Record<string, number>
): WorkflowSummaryBucket[] {
  return Object.entries(buckets)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => ({ key, count }))
    .sort(compareWorkflowSummaryBuckets);
}

export function selectWorkflowSummarySeverityBuckets(
  summary: WorkflowSummary
): WorkflowSummarySeverityBucket[] {
  return WORKFLOW_SUMMARY_SEVERITY_ORDER.map((severity) => ({
    severity,
    count: summary.severity_buckets[severity] ?? 0,
  }));
}

export function selectWorkflowSummaryFacets(
  summary: WorkflowSummary
): WorkflowSummaryFacets {
  return {
    counts: {
      incident_count: summary.incident_count,
      interaction_count: summary.interaction_count,
      event_count: summary.event_count,
    },
    incidentKinds: selectWorkflowSummaryBuckets(summary.incident_kind_buckets),
    interactionTypes: selectWorkflowSummaryBuckets(summary.interaction_type_buckets),
    eventTypes: selectWorkflowSummaryBuckets(summary.event_type_buckets),
    severities: selectWorkflowSummarySeverityBuckets(summary),
    latestActivityAt: summary.latest_activity_at,
  };
}

function compareWorkflowSummaryBuckets(
  left: WorkflowSummaryBucket,
  right: WorkflowSummaryBucket
): number {
  const countDelta = right.count - left.count;
  if (countDelta !== 0) {
    return countDelta;
  }

  return left.key.localeCompare(right.key);
}

export { WORKFLOW_SUMMARY_SEVERITY_ORDER };
