import type { EvidenceProvenanceBundle } from './types';

export type EvidenceProvenanceProofAnchorKind = 'snapshot' | 'source' | 'replay';

export interface EvidenceProvenanceProofAnchor {
  kind: EvidenceProvenanceProofAnchorKind;
  id: string;
  label: string;
  route: string;
}

export interface EvidenceProvenanceProof {
  evidenceId: string;
  record: {
    observedAt: string | null;
    collectedAt: string | null;
    agentId: string | null;
    sourceKind: string;
    evidenceRole: string | null;
    sourceStatus: string | null;
    outputCandidate: boolean;
    collectorSnapshotId: string;
    correlationId: string | null;
    unmapped: boolean;
  };
  anchors: EvidenceProvenanceProofAnchor[];
}

const REDACTED = '[redacted]';
const MAX_SAFE_VALUE_LENGTH = 512;
const SECRET_LIKE_PATTERN =
  /\b(?:sk|xox[baprs]|gh[pousr])-[A-Za-z0-9_-]{8,}\b|(?:token|secret|password)\s*[:=]/i;
const LOCAL_REF_PATTERN = /(?:^|[\s"'=])(?:\/Users\/|\/tmp\/|[A-Za-z]:\\|tmux:\/\/)/i;

export function buildEvidenceProvenanceProof(
  bundle: EvidenceProvenanceBundle | null
): EvidenceProvenanceProof | null {
  if (!bundle) {
    return null;
  }

  const anchors = [
    buildAnchor(
      'snapshot',
      'Snapshot',
      bundle.anchors.snapshot?.collector_snapshot_id,
      bundle.anchors.snapshot?.route
    ),
    buildAnchor(
      'source',
      'Source record',
      bundle.anchors.source?.evidence_id,
      bundle.anchors.source?.route
    ),
    buildAnchor(
      'replay',
      'Replay',
      bundle.anchors.replay?.correlation_id,
      bundle.anchors.replay?.route
    )
  ].filter((anchor): anchor is EvidenceProvenanceProofAnchor => anchor !== null);

  return {
    evidenceId: safeValue(bundle.evidence_id) ?? REDACTED,
    record: {
      observedAt: safeNullableValue(bundle.record.observed_at),
      collectedAt: safeNullableValue(bundle.record.collected_at),
      agentId: safeNullableValue(bundle.record.agent_id),
      sourceKind: safeValue(bundle.record.source_kind) ?? REDACTED,
      evidenceRole: safeNullableValue(bundle.record.evidence_role),
      sourceStatus: safeNullableValue(bundle.record.source_status),
      outputCandidate: bundle.record.output_candidate === true,
      collectorSnapshotId: safeValue(bundle.record.collector_snapshot_id) ?? REDACTED,
      correlationId: safeNullableValue(bundle.record.correlation_id),
      unmapped: bundle.record.unmapped === true
    },
    anchors
  };
}

function buildAnchor(
  kind: EvidenceProvenanceProofAnchorKind,
  label: string,
  id: string | undefined,
  route: string | undefined
): EvidenceProvenanceProofAnchor | null {
  const safeId = safeValue(id);
  const safeRoute = safeRouteValue(route);
  if (!safeId || !safeRoute) {
    return null;
  }

  return {
    kind,
    id: safeId,
    label,
    route: safeRoute
  };
}

function safeNullableValue(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  return safeValue(value);
}

function safeRouteValue(value: string | undefined): string | null {
  const safe = safeValue(value);
  if (!safe || !safe.startsWith('/')) {
    return null;
  }

  return safe;
}

function safeValue(value: string | undefined): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_SAFE_VALUE_LENGTH) {
    return null;
  }
  if (isUnsafeValue(value)) {
    return null;
  }

  return value;
}

function isUnsafeValue(value: string): boolean {
  const decodedValue = decodeURIComponentSafely(value);
  return (
    SECRET_LIKE_PATTERN.test(value) ||
    SECRET_LIKE_PATTERN.test(decodedValue) ||
    LOCAL_REF_PATTERN.test(decodedValue)
  );
}

function decodeURIComponentSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
