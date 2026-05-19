const SUPPORTED_SOURCE_KINDS = new Set([
  'kanban_fixture',
  'linear_fixture',
  'slack_fixture',
  'task_fixture'
]);
const REQUIRED_FIELDS = Object.freeze(['task_ref', 'source_kind', 'observed_at', 'correlation_id']);
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

module.exports = {
  normalizeTaskEvidenceFacts,
  taskEvidenceSourceFrom
};
