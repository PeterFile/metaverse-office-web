import type { WorkflowInteraction } from '../types';

const COLLECTOR_SOURCE_LABELS: Record<string, string> = {
  controller_snapshot: 'Collector snapshot'
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNonEmptyString(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function formatCollectorSource(source: string | null) {
  if (!source) {
    return 'Collector snapshot';
  }

  const knownLabel = COLLECTOR_SOURCE_LABELS[source];
  if (knownLabel) {
    return knownLabel;
  }

  const normalized = source.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}` : 'Collector snapshot';
}

function formatSeverityLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}` : null;
}

function formatDerivedStaleness(metadata: Record<string, unknown>) {
  const derivedStaleness = metadata.derived_staleness;
  if (!isRecord(derivedStaleness)) {
    return null;
  }

  const severity = readNonEmptyString(derivedStaleness, 'severity');
  const severityLabel = severity ? formatSeverityLabel(severity) : null;
  return severityLabel ? `Staleness ${severityLabel}` : null;
}

function compactJoin(values: Array<string | null>) {
  return values.filter((value): value is string => value !== null).join(' · ');
}

export function collectInteractionSourceKinds({
  workflowInteractions = [],
  correlationInteractions = []
}: {
  workflowInteractions?: readonly WorkflowInteraction[];
  correlationInteractions?: readonly WorkflowInteraction[];
}) {
  return [...workflowInteractions, ...correlationInteractions].flatMap((interaction) =>
    typeof interaction.source_kind === 'string' && interaction.source_kind.trim().length > 0
      ? [interaction.source_kind]
      : []
  );
}

export function formatCollectorDerivedPeerWatchMetadata(metadata: unknown): readonly string[] | null {
  if (!isRecord(metadata)) {
    return null;
  }

  const collectorSource = readNonEmptyString(metadata, 'collector_source');
  if (metadata.collector_derived !== true && collectorSource === null) {
    return null;
  }

  const alertFamily = readNonEmptyString(metadata, 'collector_alert_family');
  const collectedAt = readNonEmptyString(metadata, 'collected_at');
  const lastMeaningfulOutputAt = readNonEmptyString(metadata, 'last_meaningful_output_at');
  const currentBlocker = readNonEmptyString(metadata, 'current_blocker');
  const collectorAlertSignature = readNonEmptyString(metadata, 'collector_alert_signature');
  const provenanceLine = compactJoin([
    'Provenance',
    formatCollectorSource(collectorSource),
    alertFamily,
    collectedAt ? `collected ${collectedAt}` : null
  ]);
  const basisLine = compactJoin([
    'Basis',
    lastMeaningfulOutputAt ? `Last output ${lastMeaningfulOutputAt}` : null,
    formatDerivedStaleness(metadata),
    currentBlocker ? `Blocker ${currentBlocker}` : null,
    metadata.reboot_recommended === true ? 'Reboot Recommended' : null,
    collectorAlertSignature ? `Signature ${collectorAlertSignature}` : null
  ]);

  return basisLine === 'Basis' ? [provenanceLine] : [provenanceLine, basisLine];
}
