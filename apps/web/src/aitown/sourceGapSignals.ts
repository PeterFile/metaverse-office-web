import type {
  CollectorSourceHealth,
  CollectorSourceHealthKind,
  CollectorSourceHealthProjection,
  CollectorSourceHealthProjectionAgentItem,
  CollectorSourceHealthStatus,
  RuntimeSourceGap
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

export type DisplayedSourceGapKind = Extract<
  CollectorSourceHealthKind,
  'workspace_root' | 'workspace_files' | 'tmux_session' | 'hermes_profile' | 'hermes_session'
>;

export type SourceGapChip = {
  agentId: string | null;
  displayName: string;
  isMapped?: boolean;
  sourceDrilldownGroupKey: SourceGapDrilldownGroupKey | null;
  sourceKind: DisplayedSourceGapKind;
  status: CollectorSourceHealthStatus;
  sourceLabel: string;
  lifecycleLabel?: string;
  detail: string;
  observedAtLabel: string;
};

export type SourceGapDrilldownGroupKey = 'workspace' | 'tmux' | 'hermes';

export type SelectedAgentSourceGapFact = {
  agentId: string;
  sourceDrilldownGroupKey: SourceGapDrilldownGroupKey;
  sourceKind: DisplayedSourceGapKind;
  sourceLabel: string;
  status: Exclude<CollectorSourceHealthStatus, 'observed'>;
  countLabel: string;
  reason: string | null;
};

export type RuntimeSourceGapLifecycleState =
  | 'new'
  | 'ongoing'
  | 'recurring'
  | 'current_gap'
  | 'unmapped_observed';

export type RuntimeSourceGapLifecycleItem = {
  key: string;
  agentId: string | null;
  sourceKind: DisplayedSourceGapKind;
  evidenceRole: string | null;
  status: CollectorSourceHealthStatus;
  state: RuntimeSourceGapLifecycleState;
  count: number;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
};

export type RuntimeSourceGapLifecycleOptions = {
  priorRows?: RuntimeSourceGap[] | null;
};

export type SourceGapWorldPin = {
  pinId: string;
  agentId: string | null;
  displayName: string;
  isMapped: boolean;
  sourceDrilldownGroupKey: SourceGapDrilldownGroupKey | null;
  sourceKind: DisplayedSourceGapKind;
  status: CollectorSourceHealthStatus;
  sourceLabel: string;
  lifecycleLabel?: string;
  observedAtLabel: string;
};

export type RuntimeSourceGapInspectFocus = {
  agentId: string;
  sourceDrilldownGroupKey: SourceGapDrilldownGroupKey;
};

export type RuntimeSourceGapInspectPeek = {
  agentId: string;
  displayName: string;
  evidenceOnlyLabel: 'Evidence only';
  mappingLabel: 'Mapped source';
  sourceKindLabel: string;
  statusLabel: CollectorSourceHealthStatus;
  observedAtLabel: string;
  collectedAtLabel: string;
};

const MAX_SOURCE_GAP_CHIPS = 3;
const SELECTED_SOURCE_GAP_REASON_LIMIT = 96;

const SOURCE_GAP_STATUS_RANK: Record<CollectorSourceHealthStatus, number> = {
  error: 0,
  missing: 1,
  degraded: 2,
  observed: 3
};

const SOURCE_KIND_LABELS: Record<DisplayedSourceGapKind, string> = {
  workspace_root: 'Workspace root',
  workspace_files: 'Workspace files',
  tmux_session: 'Tmux session',
  hermes_profile: 'Hermes profile',
  hermes_session: 'Hermes session'
};

const SOURCE_KIND_ORDER: DisplayedSourceGapKind[] = [
  'workspace_root',
  'workspace_files',
  'tmux_session',
  'hermes_profile',
  'hermes_session'
];

const RUNTIME_SOURCE_KIND_MAP: Record<string, DisplayedSourceGapKind> = {
  workspace_root: 'workspace_root',
  workspace_file: 'workspace_files',
  workspace_files: 'workspace_files',
  tmux_observation: 'tmux_session',
  tmux_session: 'tmux_session',
  hermes_profile: 'hermes_profile',
  hermes_session: 'hermes_session'
};

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

export function deriveRuntimeSourceGapChips(
  runtimeSourceGaps: RuntimeSourceGap[] | null | undefined,
  agents: SourceGapAgent[] | null | undefined
): SourceGapChip[] {
  if (!runtimeSourceGaps?.length) {
    return [];
  }

  const displayNameByAgentId = new Map((agents ?? []).map((agent) => [agent.agent_id, agent.display_name]));
  const lifecycleByKey = new Map(
    deriveRuntimeSourceGapLifecycle(runtimeSourceGaps).map((item) => [item.key, item])
  );
  const chips: SourceGapChip[] = [];

  for (const gap of runtimeSourceGaps) {
    const sourceKind = RUNTIME_SOURCE_KIND_MAP[gap.source_kind];
    if (!sourceKind) {
      continue;
    }

    const displayName = gap.agent_id ? displayNameByAgentId.get(gap.agent_id) : null;
    if (gap.agent_id && !displayName) {
      continue;
    }

    const isMapped = Boolean(gap.agent_id && !gap.unmapped);
    const lifecycle = lifecycleByKey.get(buildRuntimeSourceGapLifecycleKey(gap, sourceKind));
    chips.push({
      agentId: isMapped ? gap.agent_id : null,
      displayName: isMapped ? displayName! : 'Unmapped runtime source',
      isMapped,
      sourceDrilldownGroupKey: isMapped ? resolveSourceGapDrilldownGroupKey(sourceKind) : null,
      sourceKind,
      status: gap.source_status,
      sourceLabel: SOURCE_KIND_LABELS[sourceKind],
      lifecycleLabel: lifecycle ? renderRuntimeSourceGapLifecycleLabel(lifecycle.state) : undefined,
      detail: renderRuntimeSourceGapDetail(gap),
      observedAtLabel: renderObservedAtLabel(gap.observed_at)
    });
  }

  return chips
    .sort((left, right) => {
      const statusRank = SOURCE_GAP_STATUS_RANK[left.status] - SOURCE_GAP_STATUS_RANK[right.status];
      if (statusRank !== 0) {
        return statusRank;
      }

      const mappedRank = Number(left.isMapped === false) - Number(right.isMapped === false);
      if (mappedRank !== 0) {
        return mappedRank;
      }

      const agentRank = left.displayName.localeCompare(right.displayName);
      if (agentRank !== 0) {
        return agentRank;
      }

      return SOURCE_KIND_ORDER.indexOf(left.sourceKind) - SOURCE_KIND_ORDER.indexOf(right.sourceKind);
    })
    .slice(0, MAX_SOURCE_GAP_CHIPS);
}

export function deriveRuntimeSourceGapWorldPins(
  runtimeSourceGaps: RuntimeSourceGap[] | null | undefined,
  agents: SourceGapAgent[] | null | undefined
): SourceGapWorldPin[] {
  return deriveRuntimeSourceGapChips(runtimeSourceGaps, agents)
    .filter((chip) => chip.status !== 'observed' || chip.isMapped === false)
    .map((chip, index) => ({
      pinId: `source-gap:${chip.agentId ?? 'unmapped'}:${chip.sourceKind}:${chip.status}:${index}`,
      agentId: chip.agentId,
      displayName: chip.displayName,
      isMapped: chip.isMapped !== false,
      sourceDrilldownGroupKey: chip.sourceDrilldownGroupKey,
      sourceKind: chip.sourceKind,
      status: chip.status,
      sourceLabel: chip.sourceLabel,
      lifecycleLabel: chip.lifecycleLabel,
      observedAtLabel: chip.observedAtLabel
    }));
}

export function deriveRuntimeSourceGapInspectPeek(
  runtimeSourceGaps: RuntimeSourceGap[] | null | undefined,
  selectedAgentId: string | null | undefined,
  focus: RuntimeSourceGapInspectFocus | null | undefined,
  agents: SourceGapAgent[] | null | undefined
): RuntimeSourceGapInspectPeek | null {
  if (!runtimeSourceGaps?.length || !selectedAgentId || !focus || focus.agentId !== selectedAgentId) {
    return null;
  }

  const matchingGaps = runtimeSourceGaps
    .map((gap) => ({ gap, sourceKind: RUNTIME_SOURCE_KIND_MAP[gap.source_kind] }))
    .filter(
      (item): item is { gap: RuntimeSourceGap; sourceKind: DisplayedSourceGapKind } =>
        Boolean(item.sourceKind) &&
        item.gap.agent_id === selectedAgentId &&
        !item.gap.unmapped &&
        resolveSourceGapDrilldownGroupKey(item.sourceKind as DisplayedSourceGapKind) === focus.sourceDrilldownGroupKey
    )
    .sort(compareRuntimeSourceGapInspectCandidates);

  const selected = matchingGaps[0];
  if (!selected) {
    return null;
  }

  const displayName =
    (agents ?? []).find((agent) => agent.agent_id === selectedAgentId)?.display_name ?? selectedAgentId;

  return {
    agentId: selectedAgentId,
    displayName,
    evidenceOnlyLabel: 'Evidence only',
    mappingLabel: 'Mapped source',
    sourceKindLabel: SOURCE_KIND_LABELS[selected.sourceKind],
    statusLabel: selected.gap.source_status,
    observedAtLabel: renderObservedAtLabel(selected.gap.observed_at),
    collectedAtLabel: renderCollectedAtLabel(selected.gap.collected_at)
  };
}

export function deriveRuntimeSourceGapLifecycle(
  runtimeSourceGaps: RuntimeSourceGap[] | null | undefined,
  options: RuntimeSourceGapLifecycleOptions = {}
): RuntimeSourceGapLifecycleItem[] {
  if (!runtimeSourceGaps?.length) {
    return [];
  }

  const priorCounts = countRuntimeSourceGapLifecycleKeys(options.priorRows);
  const groups = new Map<string, RuntimeSourceGapLifecycleItem>();

  for (const gap of runtimeSourceGaps) {
    const sourceKind = RUNTIME_SOURCE_KIND_MAP[gap.source_kind];
    if (!sourceKind) {
      continue;
    }

    if (gap.source_status === 'observed' && !gap.unmapped) {
      continue;
    }

    const key = buildRuntimeSourceGapLifecycleKey(gap, sourceKind);
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.firstObservedAt = minNullableTimestamp(existing.firstObservedAt, gap.observed_at);
      existing.lastObservedAt = maxNullableTimestamp(existing.lastObservedAt, gap.observed_at);
      continue;
    }

    groups.set(key, {
      key,
      agentId: gap.agent_id && !gap.unmapped ? gap.agent_id : null,
      sourceKind,
      evidenceRole: gap.evidence_role,
      status: gap.source_status,
      state: 'current_gap',
      count: 1,
      firstObservedAt: gap.observed_at,
      lastObservedAt: gap.observed_at
    });
  }

  const hasPriorWindow = options.priorRows != null;
  const lifecycle = Array.from(groups.values());
  for (const item of lifecycle) {
    item.state = resolveRuntimeSourceGapLifecycleState(item, priorCounts.get(item.key) ?? 0, hasPriorWindow);
  }

  return lifecycle.sort(compareRuntimeSourceGapLifecycleItems);
}

export function deriveSelectedAgentSourceGapFact(
  sourceHealth: CollectorSourceHealthProjection | null | undefined,
  selectedAgentId: string | null | undefined
): SelectedAgentSourceGapFact | null {
  if (!sourceHealth?.agent_items.length || !selectedAgentId) {
    return null;
  }

  const item = sourceHealth.agent_items.find((agentItem) => agentItem.agent_id === selectedAgentId);
  if (!item) {
    return null;
  }

  const selectedSourceKind = SOURCE_KIND_ORDER.reduce<DisplayedSourceGapKind | null>((selectedKind, sourceKind) => {
    const status = item.source_health[sourceKind]?.status;
    if (!status || status === 'observed') {
      return selectedKind;
    }

    if (!selectedKind) {
      return sourceKind;
    }

    const selectedStatus = item.source_health[selectedKind]?.status;
    if (!selectedStatus || SOURCE_GAP_STATUS_RANK[status] < SOURCE_GAP_STATUS_RANK[selectedStatus]) {
      return sourceKind;
    }

    return selectedKind;
  }, null);
  if (!selectedSourceKind) {
    return null;
  }

  const health = item.source_health[selectedSourceKind];
  if (!health || health.status === 'observed') {
    return null;
  }

  return {
    agentId: item.agent_id,
    sourceDrilldownGroupKey: resolveSourceGapDrilldownGroupKey(selectedSourceKind),
    sourceKind: selectedSourceKind,
    sourceLabel: SOURCE_KIND_LABELS[selectedSourceKind],
    status: health.status,
    countLabel: renderSelectedSourceGapCount(item, selectedSourceKind),
    reason: renderSelectedSourceGapReason(item, selectedSourceKind)
  };
}

function resolveSourceGapDrilldownGroupKey(
  sourceKind: DisplayedSourceGapKind
): SourceGapDrilldownGroupKey {
  if (sourceKind === 'tmux_session') {
    return 'tmux';
  }

  if (sourceKind === 'hermes_profile' || sourceKind === 'hermes_session') {
    return 'hermes';
  }

  return 'workspace';
}

function countRuntimeSourceGapLifecycleKeys(runtimeSourceGaps: RuntimeSourceGap[] | null | undefined) {
  const counts = new Map<string, number>();
  if (!runtimeSourceGaps?.length) {
    return counts;
  }

  for (const gap of runtimeSourceGaps) {
    const sourceKind = RUNTIME_SOURCE_KIND_MAP[gap.source_kind];
    if (!sourceKind || (gap.source_status === 'observed' && !gap.unmapped)) {
      continue;
    }

    const key = buildRuntimeSourceGapLifecycleKey(gap, sourceKind);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function buildRuntimeSourceGapLifecycleKey(gap: RuntimeSourceGap, sourceKind: DisplayedSourceGapKind) {
  return [
    `agent:${gap.agent_id && !gap.unmapped ? gap.agent_id : 'unmapped'}`,
    `source:${sourceKind}`,
    `role:${gap.evidence_role ?? 'null'}`,
    `status:${gap.source_status}`
  ].join('|');
}

function resolveRuntimeSourceGapLifecycleState(
  item: RuntimeSourceGapLifecycleItem,
  priorCount: number,
  hasPriorWindow: boolean
): RuntimeSourceGapLifecycleState {
  if (item.status === 'observed' && item.agentId === null) {
    return 'unmapped_observed';
  }

  if (!hasPriorWindow) {
    return 'current_gap';
  }

  if (item.count > 1 || priorCount > 1) {
    return 'recurring';
  }

  return priorCount > 0 ? 'ongoing' : 'new';
}

function renderRuntimeSourceGapLifecycleLabel(state: RuntimeSourceGapLifecycleState) {
  switch (state) {
    case 'new':
      return 'New gap';
    case 'ongoing':
      return 'Ongoing gap';
    case 'recurring':
      return 'Recurring gap';
    case 'unmapped_observed':
      return 'Unmapped observed';
    case 'current_gap':
      return 'Current gap';
  }
}

function compareRuntimeSourceGapLifecycleItems(
  left: RuntimeSourceGapLifecycleItem,
  right: RuntimeSourceGapLifecycleItem
) {
  const statusRank = SOURCE_GAP_STATUS_RANK[left.status] - SOURCE_GAP_STATUS_RANK[right.status];
  if (statusRank !== 0) {
    return statusRank;
  }

  const sourceRank = SOURCE_KIND_ORDER.indexOf(left.sourceKind) - SOURCE_KIND_ORDER.indexOf(right.sourceKind);
  if (sourceRank !== 0) {
    return sourceRank;
  }

  return left.key.localeCompare(right.key);
}

function compareRuntimeSourceGapInspectCandidates(
  left: { gap: RuntimeSourceGap; sourceKind: DisplayedSourceGapKind },
  right: { gap: RuntimeSourceGap; sourceKind: DisplayedSourceGapKind }
) {
  const statusRank = SOURCE_GAP_STATUS_RANK[left.gap.source_status] - SOURCE_GAP_STATUS_RANK[right.gap.source_status];
  if (statusRank !== 0) {
    return statusRank;
  }

  const sourceRank = SOURCE_KIND_ORDER.indexOf(left.sourceKind) - SOURCE_KIND_ORDER.indexOf(right.sourceKind);
  if (sourceRank !== 0) {
    return sourceRank;
  }

  return (right.gap.observed_at ?? '').localeCompare(left.gap.observed_at ?? '');
}

function minNullableTimestamp(left: string | null, right: string | null) {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return left <= right ? left : right;
}

function maxNullableTimestamp(left: string | null, right: string | null) {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return left >= right ? left : right;
}

function renderSourceGapDetail(
  item: CollectorSourceHealthProjectionAgentItem,
  sourceKind: DisplayedSourceGapKind
) {
  const countLabel = renderSourceGapCount(item, sourceKind);
  return `${countLabel} · latest evidence ${item.latest_evidence_at ?? 'unavailable'}`;
}

function renderRuntimeSourceGapDetail(gap: RuntimeSourceGap) {
  if (gap.unmapped || !gap.agent_id) {
    return 'unmapped runtime source · not mapped to an agent';
  }

  return gap.output_candidate
    ? `${renderEvidenceRoleLabel(gap.evidence_role)} · output candidate`
    : `${renderEvidenceRoleLabel(gap.evidence_role)} · mapped source`;
}

function renderEvidenceRoleLabel(evidenceRole: string | null) {
  return evidenceRole ? evidenceRole.replace(/_/g, ' ') : 'source evidence';
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

function renderSelectedSourceGapCount(
  item: CollectorSourceHealthProjectionAgentItem,
  sourceKind: DisplayedSourceGapKind
) {
  if (sourceKind === 'workspace_files') {
    const source = item.source_health.workspace_files;
    if (!source) {
      return renderEvidenceRefCount(item.evidence_ref_count);
    }

    const parts: string[] = [];
    if (source.missing_count > 0) {
      parts.push(`${source.missing_count} missing file${source.missing_count === 1 ? '' : 's'}`);
    }
    if (source.error_count > 0) {
      parts.push(`${source.error_count} error${source.error_count === 1 ? '' : 's'}`);
    }
    parts.push(`${source.observed_count} observed`);
    return parts.join(', ');
  }

  if (sourceKind === 'tmux_session') {
    return renderObservationCount(item.source_health.tmux_session?.observed_count ?? 0);
  }

  return renderEvidenceRefCount(item.evidence_ref_count);
}

function renderSelectedSourceGapReason(
  item: CollectorSourceHealthProjectionAgentItem,
  sourceKind: DisplayedSourceGapKind
) {
  const reasons = item.source_health[sourceKind]?.degraded_reasons;
  const reason = Array.isArray(reasons) ? reasons[0] : null;
  if (!reason) {
    return null;
  }

  return renderBoundedSelectedSourceGapText(redactSelectedSourceGapText(reason, item));
}

function redactSelectedSourceGapText(value: string, item: CollectorSourceHealthProjectionAgentItem) {
  let redacted = value;
  const sensitiveLabels = collectSensitiveSelectedSourceGapLabels(item).sort(
    (left, right) => (right.value?.length ?? 0) - (left.value?.length ?? 0)
  );

  for (const { value: sensitiveValue, label } of sensitiveLabels) {
    if (!sensitiveValue) {
      continue;
    }

    redacted = redacted.replace(new RegExp(escapeRegExp(sensitiveValue), 'g'), label);
  }

  return redacted
    .replace(/hermes:\/\/[^\s,;)]*/g, '[hermes ref]')
    .replace(/https?:\/\/[^\s,;)]*/g, '[ref]')
    .replace(/(?:~|\/)[^\s,;)]*/g, '[path]')
    .replace(/\b\d+-web3-[A-Za-z0-9-]+\b/g, '[tmux ref]');
}

function collectSensitiveSelectedSourceGapLabels(item: CollectorSourceHealthProjectionAgentItem) {
  const sourceHealth = item.source_health;
  return [
    { value: item.workspace_root, label: '[path]' },
    { value: sourceHealth.workspace_root?.path, label: '[path]' },
    { value: item.session_ref, label: '[tmux ref]' },
    { value: sourceHealth.tmux_session?.expected_session_ref, label: '[tmux ref]' },
    { value: sourceHealth.hermes_session?.expected_session_ref, label: '[tmux ref]' },
    { value: sourceHealth.hermes_profile?.profile_id, label: '[hermes ref]' },
    { value: sourceHealth.hermes_profile?.evidence_ref, label: '[hermes ref]' },
    { value: sourceHealth.hermes_session?.evidence_ref, label: '[hermes ref]' },
    ...((Array.isArray(item.evidence_refs) ? item.evidence_refs : []).map((evidenceRef) => ({
      value: evidenceRef,
      label: '[ref]'
    })))
  ];
}

function renderBoundedSelectedSourceGapText(value: string) {
  if (value.length <= SELECTED_SOURCE_GAP_REASON_LIMIT) {
    return value;
  }

  return `${value.slice(0, SELECTED_SOURCE_GAP_REASON_LIMIT - 3)}...`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function renderCollectedAtLabel(collectedAt: string | null | undefined) {
  return collectedAt ? `Collected ${collectedAt}` : 'Not collected';
}
