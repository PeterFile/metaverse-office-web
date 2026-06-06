import { useState } from 'react';

import { useWorld } from '../context/WorldContext';
import {
  SEVERITY_EMOJI,
  selectDataQualitySummary,
  selectHotZones,
  selectIncidentEvidenceSummaries,
  selectRuntimeBackfillEvidence,
} from '../world/selectors';
import type { Severity, WorldState } from '../world/types';

import { SCENE_AGENT_STATUS_LEGEND } from './agentStatusBadge';
import { safeVisibleText } from './safeVisibleText';

const SELECTED_SUPERVISION_NOTE =
  'Selected links only. Gold rings mark selected/linked agents; teal halos mark agents participating in the active correlation; arrows run watcher to target; thick links mean lead watch; colors show target severity.';

const LEGEND_SECTION_ITEM_LIMIT = 3;

const SEVERITY_LABELS: Record<Severity, string> = {
  normal: 'Normal',
  yellow: 'Yellow',
  orange: 'Orange',
  red: 'Red',
};

const SOURCE_KIND_LABELS: Record<string, string> = {
  collector_snapshot: 'Collector snapshot',
  controller_event: 'Controller event',
  peer_watch: 'Peer watch',
  peer_watch_alert: 'Peer watch alert',
  workflow_interaction: 'Workflow interaction',
  workspace_file: 'Local evidence',
  workspace_root: 'Local evidence',
};

const DEGRADED_REASON_LABELS: Record<string, string> = {
  'incident feed unavailable': 'Incident feed unavailable',
  'overview unavailable': 'Overview unavailable',
  'workflow partial': 'Workflow partial',
};

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function sanitizeSourceKindLabel(sourceKind: string): string {
  const normalized = sourceKind.trim();
  return SOURCE_KIND_LABELS[normalized] ?? 'Unknown source';
}

function sanitizeSourceKindLabels(sourceKinds: string[]): string[] {
  const labels = sourceKinds.map(sanitizeSourceKindLabel);
  return Array.from(new Set(labels));
}

function sanitizeDegradedReasonLabel(reason: string): string {
  const normalized = reason.trim();
  return DEGRADED_REASON_LABELS[normalized] ?? 'Unknown evidence gap';
}

function sanitizeDegradedReasonLabels(reasons: string[]): string[] {
  const labels = reasons.map(sanitizeDegradedReasonLabel);
  return Array.from(new Set(labels));
}

function formatHotZoneSummary(
  highestSeverity: Severity,
  occupantCount: number,
  blockedCount: number,
  rebootCount: number,
  openAlertOrIncidentOccupantCount: number,
  runtimeFreshnessDegradedCount: number
): string {
  const summary = [
    SEVERITY_LABELS[highestSeverity],
    formatCount(occupantCount, 'occupant'),
    `${blockedCount} blocked`,
    `${rebootCount} reboot`,
    formatCount(
      openAlertOrIncidentOccupantCount,
      'occupant with open alerts or incidents',
      'occupants with open alerts or incidents'
    ),
  ];

  if (runtimeFreshnessDegradedCount > 0) {
    summary.push(
      formatCount(
        runtimeFreshnessDegradedCount,
        'occupant with runtime freshness degraded',
        'occupants with runtime freshness degraded'
      )
    );
  }

  return summary.join(' · ');
}

function formatDataQualitySummary(degradedReasonCount: number, lastOverviewAt: string | null): string {
  const parts = [formatCount(degradedReasonCount, 'evidence gap')];
  if (lastOverviewAt) {
    parts.push(`last overview ${safeVisibleText(lastOverviewAt, 'available')}`);
  }
  return parts.join(' · ');
}

function formatRuntimeBackfillEvidence(
  displayName: string,
  incidentIds: string[],
  sourceKinds: string[],
  correlationIds: string[],
  evidenceRefs: string[],
  degradedReasons: string[]
): string {
  const parts = [`Incident-feed backfill · ${safeVisibleText(displayName, 'Backfill agent')}`];
  if (incidentIds.length > 0) {
    parts.push(formatCount(incidentIds.length, 'incident'));
  }
  const sourceKindLabels = sanitizeSourceKindLabels(sourceKinds);
  if (sourceKindLabels.length > 0) {
    parts.push(`sources ${sourceKindLabels.join(', ')}`);
  }
  if (correlationIds.length > 0) {
    parts.push(formatCount(correlationIds.length, 'correlation'));
  }
  if (evidenceRefs.length > 0) {
    parts.push(formatCount(evidenceRefs.length, 'evidence ref'));
  }
  const degradedReasonLabels = sanitizeDegradedReasonLabels(degradedReasons);
  if (degradedReasonLabels.length > 0) {
    parts.push(degradedReasonLabels.join('; '));
  }

  return parts.join(' · ');
}

function renderOverflowItem(key: string, label: string) {
  return (
    <li key={key} className="aitown-status-legend__item">
      <span className="aitown-status-legend__token" aria-hidden="true">
        …
      </span>
      <span>{label}</span>
    </li>
  );
}

function formatIncidentEvidenceSummary(
  sourceKind: string,
  actorId: string,
  correlationId: string | null,
  evidenceRefs: string[],
  evidenceRefOverflowCount: number,
  counterpartyAgentIds: string[],
  counterpartyAgentOverflowCount: number
): string {
  const parts = ['Incident evidence'];
  if (sourceKind) {
    parts.push(`source ${sanitizeSourceKindLabel(sourceKind)}`);
  }
  if (actorId) {
    parts.push('actor mapped');
  }
  if (correlationId) {
    parts.push('correlation linked');
  }
  const evidenceRefCount = evidenceRefs.length + evidenceRefOverflowCount;
  if (evidenceRefCount > 0) {
    parts.push(formatCount(evidenceRefCount, 'evidence ref'));
  }
  const counterpartyAgentCount = counterpartyAgentIds.length + counterpartyAgentOverflowCount;
  if (counterpartyAgentCount > 0) {
    parts.push(formatCount(counterpartyAgentCount, 'counterparty', 'counterparties'));
  }

  return parts.join(' · ');
}

type SceneStatusLegendProps = {
  defaultOpen?: boolean;
  onFocusWorldZone?: (zoneId: string) => void;
  world?: WorldState | null;
};

export function SceneStatusLegend({
  defaultOpen = false,
  onFocusWorldZone,
  world: providedWorld,
}: SceneStatusLegendProps) {
  const { world: contextWorld } = useWorld();
  const [expanded, setExpanded] = useState(defaultOpen);
  const world = providedWorld ?? contextWorld;
  const allHotZones = selectHotZones(world, Number.MAX_SAFE_INTEGER);
  const hotZones = allHotZones.slice(0, LEGEND_SECTION_ITEM_LIMIT);
  const dataQualitySummary = selectDataQualitySummary(world);
  const allRuntimeBackfillEvidence = selectRuntimeBackfillEvidence(world);
  const runtimeBackfillEvidence = allRuntimeBackfillEvidence.slice(0, LEGEND_SECTION_ITEM_LIMIT);
  const allIncidentEvidenceSummaries = selectIncidentEvidenceSummaries(world, Number.MAX_SAFE_INTEGER);
  const incidentEvidenceSummaries = allIncidentEvidenceSummaries.slice(0, LEGEND_SECTION_ITEM_LIMIT);
  const hotZoneOverflowCount = allHotZones.length - hotZones.length;
  const runtimeBackfillEvidenceOverflowCount = allRuntimeBackfillEvidence.length - runtimeBackfillEvidence.length;
  const incidentEvidenceOverflowCount = allIncidentEvidenceSummaries.length - incidentEvidenceSummaries.length;
  const focusedSignalCount =
    allHotZones.length +
    allIncidentEvidenceSummaries.length +
    allRuntimeBackfillEvidence.length +
    (dataQualitySummary ? 1 : 0);

  return (
    <details
      id="scene-status-legend"
      className="aitown-status-legend"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="aitown-status-legend__summary">
        <span className="aitown-status-legend__title">World legend</span>
        <span className="aitown-status-legend__summary-copy">
          {focusedSignalCount > 0
            ? `${focusedSignalCount} focused signal${focusedSignalCount === 1 ? '' : 's'}`
            : `${SCENE_AGENT_STATUS_LEGEND.length} badge meanings`}
        </span>
      </summary>

      <div className="aitown-status-legend__content">
        <span className="aitown-status-legend__title">Badge legend</span>
        <ul className="aitown-status-legend__items" aria-label="Scene status legend">
          {SCENE_AGENT_STATUS_LEGEND.map((item) => (
            <li key={item.token} className="aitown-status-legend__item">
              <span className="aitown-status-legend__token">{item.token}</span>
              <span>{item.label}</span>
            </li>
          ))}
        </ul>

        {incidentEvidenceSummaries.length > 0 ? (
          <>
            <span className="aitown-status-legend__title">Incident evidence</span>
            <ul className="aitown-status-legend__items" aria-label="Incident evidence legend">
              {incidentEvidenceSummaries.map((incident) => (
                <li key={incident.incident_id} className="aitown-status-legend__item">
                  <span className="aitown-status-legend__token" aria-hidden="true">
                    {SEVERITY_EMOJI[incident.severity]}
                  </span>
                  <span>
                    {formatIncidentEvidenceSummary(
                      incident.source_kind,
                      incident.actor_id,
                      incident.correlation_id,
                      incident.evidence_refs,
                      incident.evidence_ref_overflow_count ?? 0,
                      incident.counterparty_agent_ids,
                      incident.counterparty_agent_overflow_count ?? 0
                    )}
                  </span>
                </li>
              ))}
              {incidentEvidenceOverflowCount > 0
                ? renderOverflowItem(
                    'incident-evidence-overflow',
                    `+${incidentEvidenceOverflowCount} more incident evidence signals`
                  )
                : null}
            </ul>
          </>
        ) : null}

        {hotZones.length > 0 ? (
          <>
            <span className="aitown-status-legend__title">Hot zones</span>
            <ul className="aitown-status-legend__items" aria-label="Hot zones legend">
              {hotZones.map((zone) => {
                const summary = formatHotZoneSummary(
                  zone.highest_severity,
                  zone.occupant_count,
                  zone.blocked_count,
                  zone.reboot_count,
                  zone.open_alert_or_incident_occupant_count,
                  zone.runtime_freshness_degraded_count
                );
                const zoneLabel = safeVisibleText(zone.label, 'World zone');

                return (
                  <li key={zone.zone_id} className="aitown-status-legend__item">
                    {onFocusWorldZone ? (
                      <button
                        type="button"
                        className="aitown-status-legend__action"
                        aria-label={`${zoneLabel} · ${summary} · Focus in world viewport`}
                        onClick={() => onFocusWorldZone(zone.zone_id)}
                      >
                        <span
                          className="aitown-status-legend__token"
                          aria-hidden="true"
                          title={`Highest occupant severity: ${SEVERITY_LABELS[zone.highest_severity]}`}
                        >
                          {SEVERITY_EMOJI[zone.highest_severity]}
                        </span>
                        <span className="aitown-status-legend__action-copy">
                          <strong>{zoneLabel}</strong>
                          {' · '}
                          {summary}
                        </span>
                      </button>
                    ) : (
                      <>
                        <span
                          className="aitown-status-legend__token"
                          aria-hidden="true"
                          title={`Highest occupant severity: ${SEVERITY_LABELS[zone.highest_severity]}`}
                        >
                          {SEVERITY_EMOJI[zone.highest_severity]}
                        </span>
                        <span>
                          <strong>{zoneLabel}</strong>
                          {' · '}
                          {summary}
                        </span>
                      </>
                    )}
                  </li>
                );
              })}
              {hotZoneOverflowCount > 0
                ? renderOverflowItem('hot-zone-overflow', `+${hotZoneOverflowCount} more hot zones`)
                : null}
            </ul>
          </>
        ) : null}

        {dataQualitySummary || runtimeBackfillEvidence.length > 0 ? (
          <>
            <span className="aitown-status-legend__title">Data quality</span>
            <ul className="aitown-status-legend__items" aria-label="Data quality legend">
              {dataQualitySummary ? (
                <li className="aitown-status-legend__item">
                  <span className="aitown-status-legend__token" aria-hidden="true">
                    ⚠
                  </span>
                  <span>
                    <strong>Degraded</strong>
                    {' · '}
                    {formatDataQualitySummary(
                      dataQualitySummary.degraded_reasons.length,
                      dataQualitySummary.last_overview_at
                    )}
                    {' · '}
                    {sanitizeDegradedReasonLabels(dataQualitySummary.degraded_reasons).join('; ')}
                  </span>
                </li>
              ) : null}
              {runtimeBackfillEvidence.map((evidence) => (
                <li key={evidence.agent_id} className="aitown-status-legend__item">
                  <span className="aitown-status-legend__token" aria-hidden="true">
                    ⓘ
                  </span>
                  <span>
                    {formatRuntimeBackfillEvidence(
                      evidence.display_name,
                      evidence.incident_ids,
                      evidence.source_kinds,
                      evidence.correlation_ids,
                      evidence.evidence_refs,
                      evidence.degraded_reasons
                    )}
                  </span>
                </li>
              ))}
              {runtimeBackfillEvidenceOverflowCount > 0
                ? renderOverflowItem(
                    'runtime-backfill-overflow',
                    `+${runtimeBackfillEvidenceOverflowCount} more backfill signals`
                  )
                : null}
            </ul>
          </>
        ) : null}

        <p className="aitown-status-legend__note">{SELECTED_SUPERVISION_NOTE}</p>
      </div>
    </details>
  );
}
