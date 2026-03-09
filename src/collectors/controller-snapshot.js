const { execFile } = require('node:child_process');
const { stat } = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');

const { SEED_AGENTS } = require('../domain');

const execFileAsync = promisify(execFile);

const OBSERVED_WORKSPACE_PATHS = Object.freeze(['inbox.md', 'outbox.md', 'todo.md']);
const TMUX_FORMAT_DELIMITER = '\u001f';
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
    const workspaceObservations = await collectWorkspaceObservations({ agent, readPathStat });
    const tmuxObservations = panesBySession.get(agent.session_ref) || [];
    items.push(
      createCollectorItem({
        actorId,
        agent,
        collectedAt,
        workspaceObservations,
        tmuxObservations
      })
    );
  }

  return {
    collected_at: collectedAt,
    actor_id: actorId,
    summary: createCollectorSummary(items),
    items
  };
}

async function collectWorkspaceObservations({ agent, readPathStat }) {
  const targets = [agent.workspace_root].concat(
    OBSERVED_WORKSPACE_PATHS.map((fileName) => path.join(agent.workspace_root, fileName))
  );
  const observations = [];

  for (const targetPath of targets) {
    const statResult = await readPathStat(targetPath);
    const observation = normalizeWorkspaceObservation(targetPath, statResult);
    if (observation) {
      observations.push(observation);
    }
  }

  return observations.sort(compareObservationRecency);
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
  return {
    session_name: pane.session_name || pane.session_ref,
    window_index: `${pane.window_index}`,
    pane_index: `${pane.pane_index}`,
    pane_id: pane.pane_id || null,
    pane_title: sanitizeText(pane.pane_title),
    pane_current_command: sanitizeText(pane.pane_current_command),
    pane_active: Boolean(pane.pane_active),
    pane_dead: Boolean(pane.pane_dead),
    pane_activity_at: normalizeIsoTimestamp(pane.pane_activity_at)
  };
}

function createCollectorItem({ actorId, agent, collectedAt, workspaceObservations, tmuxObservations }) {
  const latestWorkspaceFile = workspaceObservations.find(
    (observation) => observation.kind === 'workspace_file'
  );
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

function createCollectorSummary(items) {
  return {
    agent_count: items.length,
    heartbeat_count: items.length,
    tmux_observed_count: items.filter((item) => item.tmux_observations.length > 0).length,
    workspace_observed_count: items.filter((item) => item.workspace_observations.length > 0).length,
    reboot_recommended_count: items.filter((item) => item.heartbeat.reboot_recommended).length
  };
}

function createEvidenceRefs({ workspaceObservations, tmuxObservations }) {
  const refs = [];

  for (const observation of workspaceObservations) {
    refs.push(observation.path);
  }

  for (const pane of tmuxObservations) {
    refs.push(`tmux://${pane.session_name}/${pane.window_index}.${pane.pane_index}`);
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
