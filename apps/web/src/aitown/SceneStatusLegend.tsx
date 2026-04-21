import { useWorld } from '../context/WorldContext';
import { SEVERITY_EMOJI, selectDataQualitySummary, selectHotZones } from '../world/selectors';
import type { Severity } from '../world/types';

import { SCENE_AGENT_STATUS_LEGEND } from './agentStatusBadge';

const SELECTED_SUPERVISION_NOTE =
  'Selected links only. Gold rings mark selected/linked agents; teal halos mark agents participating in the active correlation; arrows run watcher to target; thick links mean lead watch; colors show target severity.';

const SEVERITY_LABELS: Record<Severity, string> = {
  normal: 'Normal',
  yellow: 'Yellow',
  orange: 'Orange',
  red: 'Red',
};

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
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
    parts.push(`last overview ${lastOverviewAt}`);
  }
  return parts.join(' · ');
}

export function SceneStatusLegend() {
  const { world } = useWorld();
  const hotZones = selectHotZones(world);
  const dataQualitySummary = selectDataQualitySummary(world);

  return (
    <div id="scene-status-legend" className="aitown-status-legend">
      <span className="aitown-status-legend__title">Badge legend</span>
      <ul className="aitown-status-legend__items" aria-label="Scene status legend">
        {SCENE_AGENT_STATUS_LEGEND.map((item) => (
          <li key={item.token} className="aitown-status-legend__item">
            <span className="aitown-status-legend__token">
              {item.token}
            </span>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>

      {hotZones.length > 0 ? (
        <>
          <span className="aitown-status-legend__title">Hot zones</span>
          <ul className="aitown-status-legend__items" aria-label="Hot zones legend">
            {hotZones.map((zone) => (
              <li key={zone.zone_id} className="aitown-status-legend__item">
                <span
                  className="aitown-status-legend__token"
                  aria-hidden="true"
                  title={`Highest occupant severity: ${SEVERITY_LABELS[zone.highest_severity]}`}
                >
                  {SEVERITY_EMOJI[zone.highest_severity]}
                </span>
                <span>
                  <strong>{zone.label}</strong>
                  {' · '}
                  {formatHotZoneSummary(
                    zone.highest_severity,
                    zone.occupant_count,
                    zone.blocked_count,
                    zone.reboot_count,
                    zone.open_alert_or_incident_occupant_count,
                    zone.runtime_freshness_degraded_count
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {dataQualitySummary ? (
        <>
          <span className="aitown-status-legend__title">Data quality</span>
          <ul className="aitown-status-legend__items" aria-label="Data quality legend">
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
                {dataQualitySummary.degraded_reasons.join('; ')}
              </span>
            </li>
          </ul>
        </>
      ) : null}

      <p className="aitown-status-legend__note">{SELECTED_SUPERVISION_NOTE}</p>
    </div>
  );
}
