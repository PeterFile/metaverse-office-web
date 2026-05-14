const { execFile } = require('node:child_process');
const { stat } = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');

const { SEED_AGENTS } = require('../domain');

const execFileAsync = promisify(execFile);

const OBSERVED_WORKSPACE_PATHS = Object.freeze(['inbox.md', 'outbox.md', 'todo.md']);
const INBOUND_WORKSPACE_FILES = new Set(['inbox.md']);
const AGENT_OUTPUT_WORKSPACE_FILES = new Set(['outbox.md', 'todo.md']);
const TMUX_FORMAT_DELIMITER = '\u001f';
const EVIDENCE_SOURCE_KINDS = Object.freeze([
  'workspace_file',
  'workspace_root',
  'tmux_observation'
]);
const COMMAND_STATE_MAP = Object.freeze({
  cat: 'researching',
  git: 'reviewing',
  grep: 'researching',
  less: 'researching',
  node: 'coding',
  nvim: 'coding',
  pnpm: 'coding',
  rg: 'researching',
  sleep: 'sleeping',
  vi: 'coding',
  vim: 'coding'
});
const FILE_STATE_MAP = Object.freeze({
  'inbox.md': 'researching',
  'outbox.md': 'coding',
  'todo.md': 'planning'
});

function createControllerSnapshotCollector(options = {}) {
  const agents = options.agents || SEED_AGENTS;
  const readPathStat = options.readPathStat || defaultReadPathStat;
  const listTmuxPanes = options.listTmuxPanes || defaultListTmuxPanes;

  return {
    collectSnapshot({ actorId = 'team-lead', collectedAt = new Date().toISOString() } = {}) {
      return collectControllerSnapshot({
        actorId,
        agents,
        collectedAt,
        readPathStat,
        listTmuxPanes
      });
    }
  };
}

async function collectControllerSnapshot(options = {}) {
  const actorId = options.actorId || 'team-lead';
  const agents = options.agents || SEED_AGENTS;
  const collectedAt = options.collectedAt || new Date().toISOString();
  const readPathStat = options.readPathStat || defaultReadPathStat;
  const listTmuxPanes = options.listTmuxPanes || defaultListTmuxPanes;
  const panes = await listTmuxPanes();
  const panesBySession = groupTmuxPanesBySession(panes);
  const items = [];

  for (const agent of agents) {
    const workspaceSources = await collectWorkspaceSources({ agent, readPathStat });
    const tmuxObservations = panesBySession.get(agent.session_ref) || [];
    items.push(
      createCollectorItem({
        actorId,
        agent,
        collectedAt,
        workspaceObservations: workspaceSources.observations,
        tmuxObservations,
        sourceHealth: {
          ...workspaceSources.source_health,
          tmux_session: createTmuxSessionHealth({
            expectedSessionRef: agent.session_ref,
            tmuxObservations
          })
        }
      })
    );
  }

  return {
    collected_at: collectedAt,
    actor_id: actorId,
    summary: createCollectorSummary(items),
    shared_artifacts: createSharedArtifactRollup(items),
    evidence_coverage: createEvidenceCoverageLedger(items),
    runtime_source_evidence: createRuntimeSourceEvidence({
      panesBySession,
      expectedSessionRefs: new Set(agents.map((agent) => agent.session_ref))
    }),
    items
  };
}

async function collectWorkspaceSources({ agent, readPathStat }) {
  const targets = [
    {
      path: agent.workspace_root,
      file_name: path.basename(agent.workspace_root),
      kind: 'workspace_root'
    },
    ...OBSERVED_WORKSPACE_PATHS.map((fileName) => ({
      path: path.join(agent.workspace_root, fileName),
      file_name: fileName,
      kind: 'workspace_file'
    }))
  ];
  const observations = [];
  const sourceRecords = [];

  for (const target of targets) {
    const sourceRecord = await collectWorkspaceSourceRecord({ target, readPathStat });
    sourceRecords.push(sourceRecord);

    const observation = normalizeWorkspaceObservation(target.path, sourceRecord.stat_result);
    if (observation) {
      observations.push(observation);
    }
  }

  return {
    observations: observations.sort(compareObservationRecency),
    source_health: createWorkspaceSourceHealth({
      workspaceRoot: agent.workspace_root,
      sourceRecords
    })
  };
}

async function collectWorkspaceSourceRecord({ target, readPathStat }) {
  try {
    const statResult = await readPathStat(target.path);
    const lastObservedAt = normalizeIsoTimestamp(statResult?.mtime || statResult?.last_modified_at);

    return {
      ...target,
      stat_result: statResult,
      status: lastObservedAt ? 'observed' : 'missing',
      last_observed_at: lastObservedAt,
      error: null
    };
  } catch (error) {
    return {
      ...target,
      stat_result: null,
      status: 'error',
      last_observed_at: null,
      error: sanitizeText(error?.message) || 'stat failed'
    };
  }
}

function normalizeWorkspaceObservation(targetPath, statResult) {
  if (!statResult) {
    return null;
  }

  const lastModifiedAt = normalizeIsoTimestamp(statResult.mtime || statResult.last_modified_at);
  if (!lastModifiedAt) {
    return null;
  }

  return {
    path: targetPath,
    file_name: path.basename(targetPath),
    kind: path.extname(targetPath) ? 'workspace_file' : 'workspace_root',
    evidence_role: deriveWorkspaceEvidenceRole({
      kind: path.extname(targetPath) ? 'workspace_file' : 'workspace_root',
      fileName: path.basename(targetPath)
    }),
    last_modified_at: lastModifiedAt
  };
}

function groupTmuxPanesBySession(panes) {
  const grouped = new Map();

  for (const pane of panes) {
    const sessionName = pane.session_name || pane.session_ref;
    if (!sessionName) {
      continue;
    }

    if (!grouped.has(sessionName)) {
      grouped.set(sessionName, []);
    }

    grouped.get(sessionName).push(normalizeTmuxObservation(pane));
  }

  return grouped;
}

function normalizeTmuxObservation(pane) {
  const sessionName = pane.session_name || pane.session_ref || null;
  const windowIndex = `${pane.window_index}`;
  const paneIndex = `${pane.pane_index}`;
  const paneId = pane.pane_id || null;

  return {
    session_name: sessionName,
    window_index: windowIndex,
    pane_index: paneIndex,
    pane_id: paneId,
    pane_title: sanitizeText(pane.pane_title),
    pane_current_command: sanitizeText(pane.pane_current_command),
    pane_active: Boolean(pane.pane_active),
    pane_dead: Boolean(pane.pane_dead),
    pane_activity_at: normalizeIsoTimestamp(pane.pane_activity_at),
    artifact_ref: deriveTmuxArtifactRef({
      session_name: sessionName,
      window_index: windowIndex,
      pane_index: paneIndex,
      pane_id: paneId
    })
  };
}

function createCollectorItem({
  actorId,
  agent,
  collectedAt,
  workspaceObservations,
  tmuxObservations,
  sourceHealth
}) {
  const latestWorkspaceFile = workspaceObservations.find(isAgentOutputWorkspaceObservation);
  const latestTmuxObservation = tmuxObservations.slice().sort(compareObservationRecency)[0] || null;
  const latestTmuxActivityAt = latestTmuxObservation ? latestTmuxObservation.pane_activity_at : null;
  const lastFileWriteAt = latestWorkspaceFile ? latestWorkspaceFile.last_modified_at : null;
  const lastMeaningfulOutputAt = maxIsoTimestamp([lastFileWriteAt, latestTmuxActivityAt]);
  const currentState = deriveCollectorState({
    latestWorkspaceFile,
    tmuxObservations
  });
  const currentBlocker = tmuxObservations.some((pane) => pane.pane_dead)
    ? 'tmux pane marked dead'
    : '';
  const confidenceLevel = deriveConfidenceLevel({
    workspaceObservations,
    tmuxObservations
  });
  const rebootRecommended = Boolean(currentBlocker);
  const activeTask = deriveActiveTask({
    latestWorkspaceFile,
    latestTmuxObservation
  });

  return {
    agent_id: agent.agent_id,
    workspace_root: agent.workspace_root,
    session_ref: agent.session_ref,
    source_health: sourceHealth,
    evidence_refs: createEvidenceRefs({
      workspaceObservations,
      tmuxObservations
    }),
    workspace_observations: workspaceObservations,
    tmux_observations: tmuxObservations,
    supervision: {
      watch_target: agent.watch_target,
      watched_by: agent.watched_by.slice(),
      needs_attention: rebootRecommended || currentState === 'blocked' || confidenceLevel === 'low'
    },
    heartbeat: {
      agent_id: agent.agent_id,
      actor_id: actorId,
      received_at: collectedAt,
      current_state: currentState,
      active_task: activeTask,
      last_meaningful_output_at: lastMeaningfulOutputAt,
      last_file_write_at: lastFileWriteAt,
      current_blocker: currentBlocker,
      confidence_level: confidenceLevel,
      reboot_recommended: rebootRecommended,
      evidence_refs: createEvidenceRefs({
        workspaceObservations,
        tmuxObservations
      })
    }
  };
}

function createWorkspaceSourceHealth({ workspaceRoot, sourceRecords }) {
  const rootRecord =
    sourceRecords.find((record) => record.kind === 'workspace_root') || null;
  const fileRecords = sourceRecords.filter((record) => record.kind === 'workspace_file');
  const missingFiles = fileRecords
    .filter((record) => record.status === 'missing')
    .map((record) => record.file_name);
  const errorFiles = fileRecords
    .filter((record) => record.status === 'error')
    .map((record) => record.file_name);
  const observedFileCount = fileRecords.filter((record) => record.status === 'observed').length;
  const workspaceFileReasons = [];

  if (missingFiles.length > 0) {
    workspaceFileReasons.push(`missing workspace files: ${missingFiles.join(', ')}`);
  }

  if (errorFiles.length > 0) {
    workspaceFileReasons.push(`workspace file stat errors: ${errorFiles.join(', ')}`);
  }

  return {
    workspace_root: {
      status: rootRecord?.status || 'missing',
      path: workspaceRoot,
      last_observed_at: rootRecord?.last_observed_at || null,
      degraded_reasons: createWorkspaceRootDegradedReasons(rootRecord)
    },
    workspace_files: {
      status: deriveWorkspaceFilesStatus({ observedFileCount, missingFiles, errorFiles }),
      expected_files: OBSERVED_WORKSPACE_PATHS.slice(),
      observed_count: observedFileCount,
      missing_count: missingFiles.length,
      error_count: errorFiles.length,
      last_observed_at: maxIsoTimestamp(fileRecords.map((record) => record.last_observed_at)),
      degraded_reasons: workspaceFileReasons
    }
  };
}

function createWorkspaceRootDegradedReasons(rootRecord) {
  if (!rootRecord || rootRecord.status === 'missing') {
    return ['workspace root not observed'];
  }

  if (rootRecord.status === 'error') {
    return ['workspace root stat error'];
  }

  return [];
}

function deriveWorkspaceFilesStatus({ observedFileCount, missingFiles, errorFiles }) {
  if (errorFiles.length > 0) {
    return 'error';
  }

  if (missingFiles.length > 0) {
    return observedFileCount > 0 ? 'degraded' : 'missing';
  }

  return 'observed';
}

function createTmuxSessionHealth({ expectedSessionRef, tmuxObservations }) {
  const observedCount = tmuxObservations.length;
  const degradedReasons = [];

  if (observedCount === 0) {
    degradedReasons.push('tmux session not observed');
  } else if (tmuxObservations.some((pane) => pane.pane_dead)) {
    degradedReasons.push('tmux pane marked dead');
  }

  return {
    status: deriveTmuxSessionStatus({ observedCount, degradedReasons }),
    expected_session_ref: expectedSessionRef,
    observed_count: observedCount,
    last_observed_at: maxIsoTimestamp(tmuxObservations.map((pane) => pane.pane_activity_at)),
    degraded_reasons: degradedReasons
  };
}

function deriveTmuxSessionStatus({ observedCount, degradedReasons }) {
  if (observedCount === 0) {
    return 'missing';
  }

  if (degradedReasons.length > 0) {
    return 'degraded';
  }

  return 'observed';
}

function createRuntimeSourceEvidence({ panesBySession, expectedSessionRefs }) {
  const unmappedTmuxSessions = [];

  for (const [sessionName, observations] of panesBySession.entries()) {
    if (expectedSessionRefs.has(sessionName)) {
      continue;
    }

    unmappedTmuxSessions.push({
      session_name: sessionName,
      observed_count: observations.length,
      last_observed_at: maxIsoTimestamp(observations.map((pane) => pane.pane_activity_at)),
      pane_refs: observations
        .map((pane) => pane.artifact_ref || deriveTmuxArtifactRef(pane))
        .filter(Boolean)
        .sort()
    });
  }

  return {
    unmapped_tmux_sessions: unmappedTmuxSessions.sort((left, right) =>
      left.session_name.localeCompare(right.session_name)
    )
  };
}

function createCollectorSummary(items) {
  return {
    agent_count: items.length,
    heartbeat_count: items.length,
    tmux_observed_count: items.filter((item) => item.tmux_observations.length > 0).length,
    workspace_observed_count: items.filter((item) => item.workspace_observations.length > 0).length,
    reboot_recommended_count: items.filter((item) => item.heartbeat.reboot_recommended).length
  };
}

function createSharedArtifactRollup(items = []) {
  const sharedArtifacts = new Map();

  for (const item of items) {
    if (!item || typeof item.agent_id !== 'string' || item.agent_id.length === 0) {
      continue;
    }

    for (const mention of collectItemArtifactMentions(item)) {
      const artifactRef = mention.artifact_ref;
      if (!artifactRef) {
        continue;
      }

      const existing = sharedArtifacts.get(artifactRef) || {
        artifact_ref: artifactRef,
        artifact_kind: mention.artifact_kind,
        file_name: mention.file_name || null,
        agent_ids: new Set(),
        mention_count: 0,
        last_seen_at: mention.last_seen_at || null,
        source_kinds: new Set()
      };

      existing.artifact_kind = rankArtifactKind(existing.artifact_kind, mention.artifact_kind);
      if (!existing.artifact_kind) {
        existing.artifact_kind = mention.artifact_kind || 'workspace_file';
      }
      if (!existing.file_name && mention.file_name) {
        existing.file_name = mention.file_name;
      }
      existing.agent_ids.add(item.agent_id);
      existing.mention_count += 1;
      if (
        mention.last_seen_at &&
        (!existing.last_seen_at ||
          Date.parse(mention.last_seen_at) > Date.parse(existing.last_seen_at))
      ) {
        existing.last_seen_at = mention.last_seen_at;
      }
      if (mention.source_kind) {
        existing.source_kinds.add(mention.source_kind);
      }

      sharedArtifacts.set(artifactRef, existing);
    }
  }

  return Array.from(sharedArtifacts.values())
    .filter((artifact) => artifact.agent_ids.size >= 2)
    .map((artifact) => ({
      artifact_ref: artifact.artifact_ref,
      artifact_kind: artifact.artifact_kind,
      ...(artifact.file_name ? { file_name: artifact.file_name } : {}),
      agent_ids: Array.from(artifact.agent_ids).sort(),
      agent_count: artifact.agent_ids.size,
      mention_count: artifact.mention_count,
      last_seen_at: artifact.last_seen_at,
      source_kinds: Array.from(artifact.source_kinds).sort()
    }))
    .sort(compareSharedArtifacts);
}

function createEvidenceCoverageLedger(items = []) {
  const uniqueEvidenceRefs = new Set();
  const sourceRefsByKind = new Map(EVIDENCE_SOURCE_KINDS.map((kind) => [kind, new Set()]));
  const lowConfidenceAgentIds = [];
  let coveredAgentCount = 0;
  const agentItems = [];

  for (const item of items) {
    const itemCoverage = collectItemEvidenceCoverage(item);
    const confidenceLevel = item?.heartbeat?.confidence_level || null;

    if (itemCoverage.evidence_ref_count > 0) {
      coveredAgentCount += 1;
    }

    if (confidenceLevel !== 'high' || itemCoverage.evidence_ref_count === 0) {
      lowConfidenceAgentIds.push(item.agent_id);
    }

    for (const entry of itemCoverage.entries) {
      uniqueEvidenceRefs.add(entry.ref);
      if (sourceRefsByKind.has(entry.source_kind)) {
        sourceRefsByKind.get(entry.source_kind).add(entry.ref);
      }
    }

    agentItems.push({
      agent_id: item.agent_id,
      evidence_ref_count: itemCoverage.evidence_ref_count,
      source_kinds: itemCoverage.source_kinds,
      latest_evidence_at: itemCoverage.latest_evidence_at,
      confidence_level: confidenceLevel
    });
  }

  return {
    evidence_ref_count: uniqueEvidenceRefs.size,
    covered_agent_count: coveredAgentCount,
    low_confidence_agent_ids: lowConfidenceAgentIds,
    source_kind_buckets: {
      workspace_file: sourceRefsByKind.get('workspace_file').size,
      workspace_root: sourceRefsByKind.get('workspace_root').size,
      tmux_observation: sourceRefsByKind.get('tmux_observation').size
    },
    agent_items: agentItems
  };
}

function collectItemEvidenceCoverage(item = {}) {
  const entriesByRef = new Map();

  for (const evidenceRef of normalizeEvidenceRefs(item.evidence_refs)) {
    addEvidenceCoverageEntry(entriesByRef, {
      ref: evidenceRef,
      source_kind: deriveEvidenceSourceKindFromRef(evidenceRef),
      latest_at: null,
      observed: false
    });
  }

  for (const observation of item.workspace_observations || []) {
    if (!observation || typeof observation.path !== 'string' || observation.path.length === 0) {
      continue;
    }

    addEvidenceCoverageEntry(entriesByRef, {
      ref: observation.path,
      source_kind: deriveWorkspaceEvidenceSourceKind(observation),
      latest_at: normalizeIsoTimestamp(observation.last_modified_at),
      observed: true
    });
  }

  for (const observation of item.tmux_observations || []) {
    const artifactRef = observation?.artifact_ref || deriveTmuxArtifactRef(observation);
    if (!artifactRef) {
      continue;
    }

    addEvidenceCoverageEntry(entriesByRef, {
      ref: artifactRef,
      source_kind: 'tmux_observation',
      latest_at: normalizeIsoTimestamp(observation.pane_activity_at),
      observed: true
    });
  }

  const entries = Array.from(entriesByRef.values());

  return {
    entries,
    evidence_ref_count: entries.length,
    source_kinds: Array.from(new Set(entries.map((entry) => entry.source_kind))).sort(),
    latest_evidence_at: maxIsoTimestamp(entries.map((entry) => entry.latest_at))
  };
}

function addEvidenceCoverageEntry(entriesByRef, entry) {
  const existing = entriesByRef.get(entry.ref);
  if (!existing) {
    entriesByRef.set(entry.ref, entry);
    return;
  }

  entriesByRef.set(entry.ref, {
    ref: entry.ref,
    source_kind: entry.observed || !existing.observed ? entry.source_kind : existing.source_kind,
    latest_at: maxIsoTimestamp([existing.latest_at, entry.latest_at]),
    observed: existing.observed || entry.observed
  });
}

function deriveWorkspaceEvidenceSourceKind(observation) {
  if (observation.kind === 'workspace_root') {
    return 'workspace_root';
  }

  if (observation.kind === 'workspace_file') {
    return 'workspace_file';
  }

  return deriveEvidenceSourceKindFromRef(observation.path);
}

function deriveWorkspaceEvidenceRole({ kind, fileName }) {
  if (kind === 'workspace_root') {
    return 'workspace_presence';
  }

  if (fileName === 'inbox.md') {
    return 'inbound_task';
  }

  if (AGENT_OUTPUT_WORKSPACE_FILES.has(fileName)) {
    return fileName === 'todo.md' ? 'agent_plan' : 'agent_output';
  }

  return 'workspace_presence';
}

function isAgentOutputWorkspaceObservation(observation) {
  if (!observation || observation.kind !== 'workspace_file') {
    return false;
  }

  if (observation.evidence_role) {
    return observation.evidence_role === 'agent_output' || observation.evidence_role === 'agent_plan';
  }

  return !INBOUND_WORKSPACE_FILES.has(observation.file_name || path.basename(observation.path || ''));
}

function deriveEvidenceSourceKindFromRef(evidenceRef) {
  if (typeof evidenceRef === 'string' && evidenceRef.startsWith('tmux://')) {
    return 'tmux_observation';
  }

  return path.extname(evidenceRef) ? 'workspace_file' : 'workspace_root';
}

function collectItemArtifactMentions(item = {}) {
  const mentions = [];
  const seenArtifactRefs = new Set();

  for (const observation of item.workspace_observations || []) {
    if (!observation || typeof observation.path !== 'string' || observation.path.length === 0) {
      continue;
    }

    seenArtifactRefs.add(observation.path);
    if (observation.kind !== 'workspace_file') {
      continue;
    }

    mentions.push({
      artifact_ref: observation.path,
      artifact_kind: 'workspace_file',
      file_name: observation.file_name || path.basename(observation.path),
      last_seen_at: normalizeIsoTimestamp(observation.last_modified_at),
      source_kind: 'workspace_file'
    });
  }

  for (const observation of item.tmux_observations || []) {
    const artifactRef = observation?.artifact_ref || deriveTmuxArtifactRef(observation);
    if (!artifactRef) {
      continue;
    }

    seenArtifactRefs.add(artifactRef);
    mentions.push({
      artifact_ref: artifactRef,
      artifact_kind: 'tmux_observation',
      file_name: null,
      last_seen_at: normalizeIsoTimestamp(observation.pane_activity_at),
      source_kind: 'tmux_observation'
    });
  }

  for (const evidenceRef of normalizeEvidenceRefs(item.evidence_refs)) {
    if (seenArtifactRefs.has(evidenceRef)) {
      continue;
    }

    const artifactKind = deriveArtifactKindFromRef(evidenceRef);
    mentions.push({
      artifact_ref: evidenceRef,
      artifact_kind: artifactKind,
      file_name: artifactKind === 'tmux_observation' ? null : path.basename(evidenceRef),
      last_seen_at: deriveSharedArtifactLastSeenAt({ item, artifactKind }),
      source_kind: artifactKind === 'tmux_observation' ? 'tmux_observation' : 'workspace_file'
    });
  }

  return mentions;
}

function normalizeEvidenceRefs(evidenceRefs) {
  if (!Array.isArray(evidenceRefs)) {
    return [];
  }

  return Array.from(new Set(evidenceRefs.filter((ref) => typeof ref === 'string' && ref.length > 0)));
}

function deriveArtifactKindFromRef(artifactRef) {
  if (typeof artifactRef === 'string' && artifactRef.startsWith('tmux://')) {
    return 'tmux_observation';
  }

  return 'workspace_file';
}

function deriveSharedArtifactLastSeenAt({ item, artifactKind }) {
  const heartbeat = item?.heartbeat || {};

  if (artifactKind === 'tmux_observation') {
    return normalizeIsoTimestamp(heartbeat.last_meaningful_output_at);
  }

  return maxIsoTimestamp([heartbeat.last_file_write_at, heartbeat.last_meaningful_output_at]);
}

function compareSharedArtifacts(left, right) {
  const recencyDelta = parseComparableTimestamp(right.last_seen_at) - parseComparableTimestamp(left.last_seen_at);
  if (recencyDelta !== 0) {
    return recencyDelta;
  }

  if (right.mention_count !== left.mention_count) {
    return right.mention_count - left.mention_count;
  }

  return left.artifact_ref.localeCompare(right.artifact_ref);
}

function rankArtifactKind(left, right) {
  const rank = {
    workspace_file: 1,
    tmux_observation: 2
  };
  const leftRank = left && rank[left] ? rank[left] : 0;
  const rightRank = right && rank[right] ? rank[right] : 0;
  return rightRank > leftRank ? right : left;
}

function createEvidenceRefs({ workspaceObservations, tmuxObservations }) {
  const refs = [];

  for (const observation of workspaceObservations) {
    refs.push(observation.path);
  }

  for (const pane of tmuxObservations) {
    const artifactRef = pane.artifact_ref || deriveTmuxArtifactRef(pane);
    if (artifactRef) {
      refs.push(artifactRef);
    }
  }

  return refs;
}

function deriveCollectorState({ latestWorkspaceFile, tmuxObservations }) {
  if (tmuxObservations.some((pane) => pane.pane_dead)) {
    return 'blocked';
  }

  const activePane =
    tmuxObservations.find((pane) => pane.pane_active) || tmuxObservations[0] || null;
  const commandState =
    activePane && activePane.pane_current_command
      ? COMMAND_STATE_MAP[activePane.pane_current_command] || null
      : null;

  if (commandState) {
    return commandState;
  }

  if (latestWorkspaceFile) {
    return FILE_STATE_MAP[latestWorkspaceFile.file_name] || 'idle';
  }

  return 'idle';
}

function deriveActiveTask({ latestWorkspaceFile, latestTmuxObservation }) {
  if (latestTmuxObservation && latestTmuxObservation.pane_title) {
    return latestTmuxObservation.pane_title;
  }

  if (latestWorkspaceFile) {
    return `Observed ${latestWorkspaceFile.file_name} update`;
  }

  if (latestTmuxObservation && latestTmuxObservation.pane_current_command) {
    return `Observed ${latestTmuxObservation.pane_current_command} in tmux`;
  }

  return 'No evidence captured';
}

function deriveConfidenceLevel({ workspaceObservations, tmuxObservations }) {
  if (workspaceObservations.length > 0 && tmuxObservations.length > 0) {
    return 'high';
  }

  if (workspaceObservations.length > 0 || tmuxObservations.length > 0) {
    return 'medium';
  }

  return 'low';
}

function compareObservationRecency(left, right) {
  const leftMs = parseComparableTimestamp(left.last_modified_at || left.pane_activity_at);
  const rightMs = parseComparableTimestamp(right.last_modified_at || right.pane_activity_at);
  return rightMs - leftMs;
}

function parseComparableTimestamp(value) {
  const normalized = normalizeIsoTimestamp(value);
  return normalized ? Date.parse(normalized) : 0;
}

function maxIsoTimestamp(values) {
  let latestValue = null;
  let latestMs = -1;

  for (const value of values) {
    const normalized = normalizeIsoTimestamp(value);
    if (!normalized) {
      continue;
    }

    const parsed = Date.parse(normalized);
    if (parsed > latestMs) {
      latestMs = parsed;
      latestValue = normalized;
    }
  }

  return latestValue;
}

function deriveTmuxArtifactRef(tmuxObservation) {
  if (
    tmuxObservation?.session_name &&
    tmuxObservation.window_index !== undefined &&
    tmuxObservation.window_index !== null &&
    tmuxObservation.window_index !== '' &&
    tmuxObservation.window_index !== 'null' &&
    tmuxObservation.window_index !== 'undefined' &&
    tmuxObservation.pane_index !== undefined &&
    tmuxObservation.pane_index !== null &&
    tmuxObservation.pane_index !== '' &&
    tmuxObservation.pane_index !== 'null' &&
    tmuxObservation.pane_index !== 'undefined'
  ) {
    return `tmux://${tmuxObservation.session_name}/${tmuxObservation.window_index}.${tmuxObservation.pane_index}`;
  }

  if (tmuxObservation?.pane_id) {
    return `tmux://${tmuxObservation.pane_id}`;
  }

  return null;
}

function normalizeIsoTimestamp(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
}

function sanitizeText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

async function defaultReadPathStat(targetPath) {
  try {
    const result = await stat(targetPath);
    return {
      mtime: result.mtime.toISOString()
    };
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      return null;
    }

    throw error;
  }
}

async function defaultListTmuxPanes() {
  try {
    return await runTmuxListPanes();
  } catch (error) {
    if (isTransientTmuxError(error)) {
      try {
        return await runTmuxListPanes();
      } catch (retryError) {
        return handleTmuxError(retryError);
      }
    }

    return handleTmuxError(error);
  }
}

async function runTmuxListPanes() {
  const format = [
    '#{session_name}',
    '#{window_index}',
    '#{pane_index}',
    '#{pane_id}',
    '#{pane_title}',
    '#{pane_current_command}',
    '#{?pane_active,1,0}',
    '#{?pane_dead,1,0}',
    '#{pane_activity}'
  ].join(TMUX_FORMAT_DELIMITER);
  const { stdout } = await execFileAsync('tmux', ['list-panes', '-a', '-F', format], {
    encoding: 'utf8'
  });

  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseTmuxPaneLine)
    .filter(Boolean);
}

function parseTmuxPaneLine(line) {
  const fields = line.split(TMUX_FORMAT_DELIMITER);
  if (fields.length !== 9) {
    return null;
  }

  const activitySeconds = Number.parseInt(fields[8], 10);

  return {
    session_name: fields[0],
    window_index: fields[1],
    pane_index: fields[2],
    pane_id: fields[3],
    pane_title: fields[4],
    pane_current_command: fields[5],
    pane_active: fields[6] === '1',
    pane_dead: fields[7] === '1',
    pane_activity_at:
      Number.isFinite(activitySeconds) && activitySeconds > 0
        ? new Date(activitySeconds * 1000).toISOString()
        : null
  };
}

function isTransientTmuxError(error) {
  return error && ['EAGAIN', 'ECONNRESET', 'ETIMEDOUT'].includes(error.code);
}

function handleTmuxError(error) {
  if (!error) {
    return [];
  }

  if (error.code === 'ENOENT') {
    return [];
  }

  const stderr = typeof error.stderr === 'string' ? error.stderr : '';
  if (/no server running/i.test(stderr) || /failed to connect/i.test(stderr)) {
    return [];
  }

  throw error;
}

module.exports = {
  OBSERVED_WORKSPACE_PATHS,
  collectControllerSnapshot,
  createEvidenceCoverageLedger,
  createSharedArtifactRollup,
  createControllerSnapshotCollector,
  createEvidenceRefs,
  defaultListTmuxPanes,
  defaultReadPathStat,
  deriveActiveTask,
  deriveCollectorState,
  deriveConfidenceLevel,
  maxIsoTimestamp,
  parseTmuxPaneLine
};
