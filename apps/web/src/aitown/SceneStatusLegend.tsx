import { SCENE_AGENT_STATUS_LEGEND } from './agentStatusBadge';

const SELECTED_SUPERVISION_NOTE =
  'Selected links only. Gold rings mark selected/linked agents; arrows run watcher to target; thick links mean lead watch; colors show target severity.';

export function SceneStatusLegend() {
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
      <p className="aitown-status-legend__note">{SELECTED_SUPERVISION_NOTE}</p>
    </div>
  );
}
