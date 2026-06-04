const { readdir, readFile, stat } = require('node:fs/promises');
const path = require('node:path');

const SUPPORTED_SOURCE_KINDS = new Set([
  'kanban_fixture',
  'linear_fixture',
  'slack_fixture',
  'task_fixture'
]);
const REQUIRED_FIELDS = Object.freeze(['task_ref', 'source_kind', 'observed_at', 'correlation_id']);
const FILE_OPTIONAL_IDENTIFIER_FIELDS = Object.freeze(['id', 'agent_id', 'local_path', 'path']);
const CONTROL_FIELD_CATEGORIES = Object.freeze({
  claim: new Set(['claim', 'claimed', 'claiming']),
  complete: new Set(['complete', 'completed', 'completing', 'completion']),
  assign: new Set(['assign', 'assigned', 'assigning', 'assignment', 'assignee']),
  dispatch: new Set(['dispatch', 'dispatched', 'dispatching']),
  route: new Set(['route', 'routed', 'routing']),
  mutate: new Set(['mutate', 'mutated', 'mutating', 'mutation'])
});
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const SECRET_ID_PATTERNS = Object.freeze([
  /^xox[a-z]-/i,
  /^gh[opusr]_/i,
  /^github_pat_/i,
  /^sk-[A-Za-z0-9_-]{16,}$/i,
  /(?:^|[?&])(?:access_)?token=/i,
  /^[/~]/,
  /^[A-Za-z]:[\\/]/,
  /^https?:\/\/.+(?:hooks\.slack\.com|webhook|webhooks)/i
]);

function taskEvidenceSourceFrom(options = {}) {
  const facts = Array.isArray(options.facts) ? options.facts : null;
  const client = options.client || null;

  return {
    async readEvidenceCandidates() {
      if (facts) {
        return normalizeTaskEvidenceFacts(facts);
      }

      if (!client || typeof client.listTaskEvidenceFacts !== 'function') {
        return {
          candidates: [],
          rejected: [
            {
              status: 'invalid',
              index: null,
              missing_fields: ['listTaskEvidenceFacts'],
              error: 'task evidence source missing read method'
            }
          ]
        };
      }

      const clientFacts = await client.listTaskEvidenceFacts();
      return normalizeTaskEvidenceFacts(Array.isArray(clientFacts) ? clientFacts : []);
    }
  };
}

function taskEvidenceFileReaderFrom(options = {}) {
  const filePath = typeof options.filePath === 'string' ? options.filePath.trim() : '';

  return {
    async readEvidenceCandidates() {
      if (!filePath) {
        return fileFailure('task evidence file path is required');
      }

      let content;
      try {
        content = await readFile(filePath, 'utf8');
      } catch {
        return fileFailure('task evidence file could not be read');
      }

      const parsed = parseTaskEvidenceFileContent(content);
      if (parsed.rejected.length > 0) {
        return parsed;
      }

      return normalizeTaskEvidenceFileFacts(parsed.facts);
    }
  };
}

function taskEvidencePathsReaderFrom(options = {}) {
  const inputPaths = Array.isArray(options.inputPaths)
    ? options.inputPaths
        .map((inputPath) => (typeof inputPath === 'string' ? inputPath.trim() : ''))
        .filter(Boolean)
    : [];

  return {
    async readEvidenceCandidates() {
      if (inputPaths.length === 0) {
        return fileFailure('task evidence input path is required');
      }

      const facts = [];
      let sourceFileIndex = 0;

      for (const [sourcePathIndex, inputPath] of inputPaths.entries()) {
        const filePaths = await listTaskEvidenceFiles(inputPath);
        if (!filePaths) {
          return fileFailure('task evidence input could not be read');
        }

        for (const filePath of filePaths) {
          let content;
          try {
            content = await readFile(filePath, 'utf8');
          } catch {
            return fileFailure('task evidence input could not be read');
          }

          const parsed = parseTaskEvidenceFileContent(content, {
            source_input_ordinal: sourcePathIndex + 1,
            source_file_ordinal: sourceFileIndex + 1
          });
          if (parsed.rejected.length > 0) {
            return parsed;
          }

          sourceFileIndex += 1;
          facts.push(...parsed.facts);
        }
      }

      return normalizeTaskEvidenceFileFacts(facts);
    }
  };
}

async function listTaskEvidenceFiles(inputPath) {
  let inputStat;
  try {
    inputStat = await stat(inputPath);
  } catch {
    return null;
  }

  if (!inputStat.isDirectory()) {
    return [inputPath];
  }

  let entries;
  try {
    entries = await readdir(inputPath, { withFileTypes: true });
  } catch {
    return null;
  }

  return entries
    .filter((entry) => entry.isFile() && isTaskEvidenceFileName(entry.name))
    .map((entry) => path.join(inputPath, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function isTaskEvidenceFileName(fileName) {
  return fileName.endsWith('.json') || fileName.endsWith('.jsonl');
}

function parseTaskEvidenceFileContent(content, sourceProvenance = {}) {
  const trimmed = content.trim();
  if (!trimmed) {
    return { facts: [], rejected: [] };
  }

  if (trimmed.startsWith('[')) {
    return parseTaskEvidenceJsonArray(trimmed, sourceProvenance);
  }

  return parseTaskEvidenceJsonLines(content, sourceProvenance);
}

function parseTaskEvidenceJsonArray(content, sourceProvenance) {
  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      return fileFailure('task evidence file must contain a JSON array');
    }

    return {
      facts: parsed.map((fact, index) => ({
        fact,
        source_provenance: {
          source_format: 'json_array',
          source_index: index,
          source_input_ordinal: sourceProvenance.source_input_ordinal || 1,
          source_file_ordinal: sourceProvenance.source_file_ordinal || 1
        }
      })),
      rejected: []
    };
  } catch {
    return fileFailure('task evidence file could not be parsed');
  }
}

function parseTaskEvidenceJsonLines(content, sourceProvenance) {
  const facts = [];
  const lines = content.split(/\r?\n/);

  for (const [lineIndex, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      facts.push({
        fact: JSON.parse(trimmed),
        source_provenance: {
          source_format: 'jsonl',
          source_index: lineIndex,
          line: lineIndex + 1,
          source_input_ordinal: sourceProvenance.source_input_ordinal || 1,
          source_file_ordinal: sourceProvenance.source_file_ordinal || 1
        }
      });
    } catch {
      return fileFailure('task evidence file could not be parsed');
    }
  }

  return { facts, rejected: [] };
}

function normalizeTaskEvidenceFileFacts(facts) {
  const candidates = [];
  const rejected = [];

  facts.forEach((entry, index) => {
    const { fact, sourceProvenance } = unwrapTaskEvidenceFileEntry(entry);
    const unsafeFields = unsafeFileIdentifierFields(fact);
    const normalized =
      unsafeFields.length > 0
        ? {
            status: 'invalid',
            index,
            missing_fields: unsafeFields,
            error: 'task evidence fact has unsafe optional identifiers'
          }
        : normalizeTaskEvidenceFact(fact, index);

    if (normalized.status === 'invalid' || normalized.status === 'unsupported') {
      rejected.push(normalized);
      return;
    }

    candidates.push({
      ...normalized,
      ...(sourceProvenance ? { source_provenance: sourceProvenance } : {})
    });
  });

  if (rejected.length > 0) {
    return { candidates: [], rejected };
  }

  return { candidates, rejected };
}

function unwrapTaskEvidenceFileEntry(entry) {
  if (entry && typeof entry === 'object' && !Array.isArray(entry) && Object.hasOwn(entry, 'fact')) {
    return {
      fact: entry.fact,
      sourceProvenance: normalizeTaskEvidenceSourceProvenance(entry.source_provenance)
    };
  }

  return {
    fact: entry,
    sourceProvenance: normalizeTaskEvidenceSourceProvenance(entry?.source_provenance)
  };
}

function unsafeFileIdentifierFields(fact) {
  if (!fact || typeof fact !== 'object' || Array.isArray(fact)) {
    return [];
  }

  return FILE_OPTIONAL_IDENTIFIER_FIELDS.filter((field) => {
    if (fact[field] === undefined || fact[field] === null || fact[field] === '') {
      return false;
    }

    if (field === 'local_path' || field === 'path') {
      return true;
    }

    return !safeIdentifier(fact[field]);
  });
}

function fileFailure(error) {
  return {
    candidates: [],
    rejected: [
      {
        status: 'invalid',
        index: null,
        missing_fields: ['file'],
        error
      }
    ]
  };
}

function normalizeTaskEvidenceFacts(facts) {
  if (!Array.isArray(facts)) {
    return {
      candidates: [],
      rejected: [
        {
          status: 'invalid',
          index: null,
          missing_fields: ['facts'],
          error: 'task evidence facts must be an array'
        }
      ]
    };
  }

  const candidates = [];
  const rejected = [];

  facts.forEach((fact, index) => {
    const normalized = normalizeTaskEvidenceFact(fact, index);

    if (normalized.status === 'invalid' || normalized.status === 'unsupported') {
      rejected.push(normalized);
      return;
    }

    candidates.push(normalized);
  });

  return { candidates, rejected };
}

function projectTaskEvidenceRecords(facts, options = {}) {
  const collectedAt = safeIsoTimestamp(options.collected_at);
  const collectorSnapshotId =
    safeIdentifier(options.collector_snapshot_id) ||
    (collectedAt ? `task-evidence:${collectedAt}` : 'task-evidence:unknown');
  const records = [];
  const rejected = [];

  if (!Array.isArray(facts)) {
    return {
      records,
      rejected: [
        {
          status: 'invalid',
          index: null,
          missing_fields: ['facts'],
          error: 'task evidence facts must be an array'
        }
      ]
    };
  }

  facts.forEach((fact, index) => {
    const candidate = normalizeTaskEvidenceFact(fact, index);

    if (candidate.status === 'invalid' || candidate.status === 'unsupported') {
      rejected.push(candidate);
      return;
    }

    records.push(projectTaskEvidenceRecord(candidate, {
      collectedAt,
      collectorSnapshotId,
      index
    }));
  });

  return { records, rejected };
}

function projectTaskEvidenceRecord(candidate, { collectedAt, collectorSnapshotId, index }) {
  const recordIndex = index + 1;
  const metadata = {
    task_ref: candidate.task_ref,
    ...(candidate.id ? { fact_id: candidate.id } : {}),
    source_index: index,
    ...(Array.isArray(candidate.warnings) ? { warnings: candidate.warnings.slice() } : {}),
    ...(candidate.source_provenance ? { source_provenance: candidate.source_provenance } : {})
  };

  return {
    evidence_id: [
      'ev',
      sanitizeEvidenceIdPart(collectorSnapshotId),
      sanitizeEvidenceIdPart(candidate.source_kind),
      sanitizeEvidenceIdPart(candidate.task_ref),
      recordIndex
    ].join('_'),
    observed_at: candidate.observed_at,
    collected_at: collectedAt,
    agent_id: candidate.agent_id || null,
    source_kind: candidate.source_kind,
    evidence_ref: `task://${candidate.source_kind}/${candidate.task_ref}`,
    evidence_role: 'task_reference',
    source_status: candidate.status,
    output_candidate: false,
    collector_snapshot_id: collectorSnapshotId,
    correlation_id: candidate.correlation_id,
    degraded_reasons: Array.isArray(candidate.warnings) ? candidate.warnings.slice() : [],
    metadata
  };
}

function normalizeTaskEvidenceFact(fact, index) {
  if (!fact || typeof fact !== 'object' || Array.isArray(fact)) {
    return {
      status: 'invalid',
      index,
      missing_fields: REQUIRED_FIELDS.slice(),
      error: 'task evidence fact missing required fields'
    };
  }

  const taskRef = safeIdentifier(fact.task_ref);
  const sourceKind = safeIdentifier(fact.source_kind);
  const observedAt = safeIsoTimestamp(fact.observed_at);
  const correlationId = safeIdentifier(fact.correlation_id);
  const missingFields = [];

  if (!taskRef) missingFields.push('task_ref');
  if (!sourceKind) missingFields.push('source_kind');
  if (!observedAt) missingFields.push('observed_at');
  if (!correlationId) missingFields.push('correlation_id');

  if (missingFields.length > 0) {
    return {
      status: 'invalid',
      index,
      missing_fields: missingFields,
      error: 'task evidence fact missing required fields'
    };
  }

  if (!SUPPORTED_SOURCE_KINDS.has(sourceKind)) {
    return {
      status: 'unsupported',
      index,
      source_kind: sourceKind,
      error: 'task evidence source kind is not supported for read-only fixtures'
    };
  }

  const controlFields = controlPlaneFields(fact);
  if (controlFields.length > 0) {
    return {
      status: 'invalid',
      index,
      missing_fields: controlFields,
      error: 'task evidence fact contains control-plane fields'
    };
  }

  const candidate = {
    status: 'observed',
    task_ref: taskRef,
    source_kind: sourceKind,
    observed_at: observedAt,
    correlation_id: correlationId
  };
  const id = safeIdentifier(fact.id);
  const agentId = safeIdentifier(fact.agent_id);
  const warnings = [];

  if (id && id !== taskRef) {
    candidate.id = id;
  }

  if (agentId) {
    candidate.agent_id = agentId;
  } else if (fact.agent_id !== undefined && fact.agent_id !== null && fact.agent_id !== '') {
    warnings.push('agent_id suppressed');
  }

  if (warnings.length > 0) {
    candidate.status = 'degraded';
    candidate.warnings = warnings;
  }

  const sourceProvenance = normalizeTaskEvidenceSourceProvenance(fact.source_provenance);
  if (sourceProvenance) {
    candidate.source_provenance = sourceProvenance;
  }

  return candidate;
}

function normalizeTaskEvidenceSourceProvenance(sourceProvenance) {
  if (!sourceProvenance || typeof sourceProvenance !== 'object' || Array.isArray(sourceProvenance)) {
    return null;
  }
  if (!['json_array', 'jsonl'].includes(sourceProvenance.source_format)) {
    return null;
  }
  if (!Number.isSafeInteger(sourceProvenance.source_index) || sourceProvenance.source_index < 0) {
    return null;
  }

  const normalized = {
    source_format: sourceProvenance.source_format,
    source_index: sourceProvenance.source_index
  };
  if (sourceProvenance.source_format === 'jsonl') {
    if (!Number.isSafeInteger(sourceProvenance.line) || sourceProvenance.line < 1) {
      return null;
    }
    normalized.line = sourceProvenance.line;
  }
  if (
    Number.isSafeInteger(sourceProvenance.source_input_ordinal) &&
    sourceProvenance.source_input_ordinal > 0
  ) {
    normalized.source_input_ordinal = sourceProvenance.source_input_ordinal;
  }
  if (
    Number.isSafeInteger(sourceProvenance.source_file_ordinal) &&
    sourceProvenance.source_file_ordinal > 0
  ) {
    normalized.source_file_ordinal = sourceProvenance.source_file_ordinal;
  }

  return normalized;
}

function controlPlaneFields(fact) {
  const categories = new Set();

  for (const field of Object.keys(fact)) {
    const fieldCategories = controlPlaneFieldCategories(field);
    fieldCategories.forEach((category) => categories.add(category));
  }

  return Array.from(categories).sort();
}

function controlPlaneFieldCategories(field) {
  const tokens = tokenizeFieldName(field);
  const categories = new Set();

  tokens.forEach((token, index) => {
    if (token === 'writeback' || (token === 'write' && tokens[index + 1] === 'back')) {
      categories.add('writeback');
      return;
    }

    for (const [category, terms] of Object.entries(CONTROL_FIELD_CATEGORIES)) {
      if (terms.has(token)) {
        categories.add(category);
      }
    }
  });

  return Array.from(categories);
}

function tokenizeFieldName(field) {
  return `${field}`
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function safeIdentifier(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (isSecretShapedIdentifier(trimmed) || !SAFE_ID_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function isSecretShapedIdentifier(value) {
  return SECRET_ID_PATTERNS.some((pattern) => pattern.test(value));
}

function safeIsoTimestamp(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

function sanitizeEvidenceIdPart(value) {
  const sanitized = `${value ?? ''}`.trim().replace(/[^A-Za-z0-9_-]+/g, '_');
  return sanitized || 'unknown';
}

module.exports = {
  normalizeTaskEvidenceFacts,
  projectTaskEvidenceRecords,
  taskEvidenceFileReaderFrom,
  taskEvidencePathsReaderFrom,
  taskEvidenceSourceFrom
};
