import type {
  CollectorSourceHealth,
  CollectorSourceHealthKind,
  CollectorSourceHealthProjection,
  CollectorSourceHealthProjectionAgentItem,
  CollectorSourceHealthStatus
} from '../types';

export type { SourceHealthWorldBadge } from '../sourceHealthWorldBadges';
export {
  deriveSourceHealthWorldBadges,
  resolveWorstSourceHealthStatus
} from '../sourceHealthWorldBadges';

type SourceGapAgent = {
  agent_id: string;
  display_name: string;
};

type DisplayedSourceGapKind = Extract<
  CollectorSourceHealthKind,
  'workspace_root' | 'workspace_files' | 'tmux_session'
>;

export type SourceGapChip = {
  agentId: string;
  displayName: string;
  sourceDrilldownGroupKey: SourceGapDrilldownGroupKey;
  sourceKind: DisplayedSourceGapKind;
  status: Exclude<CollectorSourceHealthStatus, 'observed'>;
  sourceLabel: string;
  detail: string;
  observedAtLabel: string;
};

export type SourceGapDrilldownGroupKey = 'workspace' | 'tmux';

const MAX_SOURCE_GAP_CHIPS = 3;

const SOURCE_GAP_STATUS_RANK: Record<CollectorSourceHealthStatus, number> = {
  error: 0,
  missing: 1,
  degraded: 2,
  observed: 3
};

const SOURCE_KIND_LABELS: Record<DisplayedSourceGapKind, string> = {
  workspace_root: 'Workspace root',
  workspace_files: 'Workspace files',
  tmux_session: 'Tmux session'
};

const SOURCE_KIND_ORDER: DisplayedSourceGapKind[] = [
  'workspace_root',
  'workspace_files',
  'tmux_session'
];

export function deriveSourceGapChips(
  sourceHealth: CollectorSourceHealthProjection | null | undefined,
  agents: SourceGapAgent[] | null | undefined
): SourceGapChip[] {
  if (!sourceHealth?.agent_items.length || !agents?.length) {
    return [];
  }

  const displayNameByAgentId = new Map(agents.map((agent) => [agent.agent_id, agent.display_name]));
  const chips: SourceGapChip[] = [];

  for (const item of sourceHealth.agent_items) {
    const displayName = displayNameByAgentId.get(item.agent_id);
    if (!displayName) {
      continue;
    }

    for (const sourceKind of SOURCE_KIND_ORDER) {
      const health = item.source_health[sourceKind];
      if (!health || health.status === 'observed') {
        continue;
      }

      chips.push({
        agentId: item.agent_id,
        displayName,
        sourceDrilldownGroupKey: resolveSourceGapDrilldownGroupKey(sourceKind),
        sourceKind,
        status: health.status,
        sourceLabel: SOURCE_KIND_LABELS[sourceKind],
        detail: renderSourceGapDetail(item, sourceKind),
        observedAtLabel: renderObservedAtLabel(health.last_observed_at)
      });
    }
  }

  return chips
    .sort((left, right) => {
      const statusRank = SOURCE_GAP_STATUS_RANK[left.status] - SOURCE_GAP_STATUS_RANK[right.status];
      if (statusRank !== 0) {
        return statusRank;
      }

      const agentRank = left.displayName.localeCompare(right.displayName);
      if (agentRank !== 0) {
        return agentRank;
      }

      return SOURCE_KIND_ORDER.indexOf(left.sourceKind) - SOURCE_KIND_ORDER.indexOf(right.sourceKind);
    })
    .slice(0, MAX_SOURCE_GAP_CHIPS);
}

function resolveSourceGapDrilldownGroupKey(
  sourceKind: DisplayedSourceGapKind
): SourceGapDrilldownGroupKey {
  return sourceKind === 'tmux_session' ? 'tmux' : 'workspace';
}

function renderSourceGapDetail(
  item: CollectorSourceHealthProjectionAgentItem,
  sourceKind: DisplayedSourceGapKind
) {
  const countLabel = renderSourceGapCount(item, sourceKind);
  return `${countLabel} · latest evidence ${item.latest_evidence_at ?? 'unavailable'}`;
}

function renderSourceGapCount(
  item: CollectorSourceHealthProjectionAgentItem,
  sourceKind: DisplayedSourceGapKind
) {
  if (sourceKind === 'workspace_files') {
    return renderWorkspaceFilesCount(item.source_health);
  }

  if (sourceKind === 'tmux_session') {
    return renderObservationCount(item.source_health.tmux_session?.observed_count ?? 0);
  }

  return renderEvidenceRefCount(item.evidence_ref_count);
}

function renderWorkspaceFilesCount(sourceHealth: CollectorSourceHealth) {
  const missingCount = sourceHealth.workspace_files?.missing_count ?? 0;
  if (missingCount > 0) {
    return `${missingCount} missing file${missingCount === 1 ? '' : 's'}`;
  }

  return renderObservationCount(sourceHealth.workspace_files?.observed_count ?? 0);
}

function renderEvidenceRefCount(count: number) {
  return `${count} ${count === 1 ? 'evidence ref' : 'refs'}`;
}

function renderObservationCount(count: number) {
  return `${count} observation${count === 1 ? '' : 's'}`;
}

function renderObservedAtLabel(lastObservedAt: string | null | undefined) {
  return lastObservedAt ? `Observed ${lastObservedAt}` : 'Not observed';
}
