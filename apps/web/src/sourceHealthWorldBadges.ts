import type {
  CollectorSourceHealth,
  CollectorSourceHealthKind,
  CollectorSourceHealthProjection,
  CollectorSourceHealthStatus
} from './types';

export type SourceHealthWorldBadge = {
  agentId: string;
  status: Exclude<CollectorSourceHealthStatus, 'observed'>;
};

const SOURCE_HEALTH_STATUS_RANK: Record<CollectorSourceHealthStatus, number> = {
  error: 0,
  missing: 1,
  degraded: 2,
  observed: 3
};

const SOURCE_HEALTH_KIND_ORDER: CollectorSourceHealthKind[] = [
  'workspace_root',
  'workspace_files',
  'tmux_session'
];

export function deriveSourceHealthWorldBadges(
  sourceHealth: CollectorSourceHealthProjection | null | undefined
): SourceHealthWorldBadge[] {
  if (!sourceHealth?.agent_items.length) {
    return [];
  }

  return sourceHealth.agent_items
    .flatMap((item) => {
      const status = resolveWorstSourceHealthStatus(item.source_health);

      return status ? [{ agentId: item.agent_id, status }] : [];
    })
    .sort((left, right) => {
      const statusRank = SOURCE_HEALTH_STATUS_RANK[left.status] - SOURCE_HEALTH_STATUS_RANK[right.status];
      if (statusRank !== 0) {
        return statusRank;
      }

      return left.agentId.localeCompare(right.agentId);
    });
}

export function resolveWorstSourceHealthStatus(
  sourceHealth: CollectorSourceHealth | null | undefined
): SourceHealthWorldBadge['status'] | null {
  if (!sourceHealth) {
    return null;
  }

  let worstStatus: SourceHealthWorldBadge['status'] | null = null;

  for (const sourceKind of SOURCE_HEALTH_KIND_ORDER) {
    const status = sourceHealth[sourceKind]?.status;
    if (!status || status === 'observed') {
      continue;
    }

    if (!worstStatus || SOURCE_HEALTH_STATUS_RANK[status] < SOURCE_HEALTH_STATUS_RANK[worstStatus]) {
      worstStatus = status;
    }
  }

  return worstStatus;
}
