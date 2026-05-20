const { readFile } = require('node:fs/promises');

const SUPPORTED_SOURCE_KINDS = new Set([
  'kanban_fixture',
  'linear_fixture',
  'slack_fixture',
  'task_fixture'
]);
const REQUIRED_FIELDS = Object.freeze(['task_ref', 'source_kind', 'observed_at', 'correlation_id']);
const FILE_OPTIONAL_IDENTIFIER_FIELDS = Object.freeze(['id', 'agent_id', 'local_path', 'path']);
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

function parseTaskEvidenceFileContent(content) {
  const trimmed = content.trim();
  if (!trimmed) {
    return { facts: [], rejected: [] };
  }

  if (trimmed.startsWith('[')) {
    return parseTaskEvidenceJsonArray(trimmed);
  }

  return parseTaskEvidenceJsonLines(content);
}

function parseTaskEvidenceJsonArray(content) {
  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      return fileFailure('task evidence file must contain a JSON array');
    }

    return { facts: parsed, rejected: [] };
  } catch {
    return fileFailure('task evidence file could not be parsed');
  }
}

function parseTaskEvidenceJsonLines(content) {
  const facts = [];
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      facts.push(JSON.parse(trimmed));
    } catch {
      return fileFailure('task evidence file could not be parsed');
    }
  }

  return { facts, rejected: [] };
}

function normalizeTaskEvidenceFileFacts(facts) {
  const candidates = [];
  const rejected = [];

  facts.forEach((fact, index) => {
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

    candidates.push(normalized);
  });

  if (rejected.length > 0) {
    return { candidates: [], rejected };
  }

  return { candidates, rejected };
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
    ...(Array.isArray(candidate.warnings) ? { warnings: candidate.warnings.slice() } : {})
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

  return candidate;
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
  taskEvidenceSourceFrom
};
