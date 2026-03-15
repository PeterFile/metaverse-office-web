import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

type BottomMenuTab = 'none' | 'queue' | 'watch' | 'layout' | 'feed';
type InspectorTab = 'overview' | 'workflow' | 'correlation';

type ControlDeckProps = {
  generatedAt: string;
  overviewRefreshNotice: ReactNode;
  summaryStrip: ReactNode;
  officeGrid: ReactNode;
  attentionQueuePanel: ReactNode;
  workflowPanel: ReactNode;
  incidentFeedPanel: ReactNode;
  watchTopologyPanel: ReactNode;
  correlationPanel: ReactNode;
  pollIntervalMs: number;
  workflowWindow: string;
  workflowLimit: number;
  hasSelectedAgent: boolean;
  hasSelectedCorrelation: boolean;
};

export function ControlDeck({
  generatedAt,
  overviewRefreshNotice,
  summaryStrip,
  officeGrid,
  attentionQueuePanel,
  workflowPanel,
  incidentFeedPanel,
  watchTopologyPanel,
  correlationPanel,
  pollIntervalMs,
  workflowWindow,
  workflowLimit,
  hasSelectedAgent,
  hasSelectedCorrelation,
}: ControlDeckProps) {
  const [activeMenu, setActiveMenu] = useState<BottomMenuTab>('none');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('workflow');

  useEffect(() => {
    if (hasSelectedAgent) {
      setInspectorTab('workflow');
    }
  }, [hasSelectedAgent]);

  useEffect(() => {
    if (hasSelectedCorrelation) {
      setInspectorTab('correlation');
    }
  }, [hasSelectedCorrelation]);

  const toggleMenu = (menu: BottomMenuTab) => {
    setActiveMenu((prev) => (prev === menu ? 'none' : menu));
  };

  return (
    <div className="control-deck-hud">
      {/* TOP LEFT: Time and basic resources */}
      <header className="hud-panel--top-left" style={{ pointerEvents: 'auto' }}>
        <div className="hud-shell__brand">
          <h1>Operator Shell</h1>
          <span className="hud-shell__timestamp">Last refresh: {generatedAt}</span>
        </div>
        <div className="hud-shell__summary">{summaryStrip}</div>
        <div className="hud-shell__legend" aria-label="Canvas legend">
          <span className="hud-legend-chip hud-legend-chip--home">Home desk</span>
          <span className="hud-legend-chip">Click agent</span>
          <span className="hud-legend-chip">Focus shows trails</span>
        </div>
        <div className="hud-shell__notice">{overviewRefreshNotice}</div>
      </header>

      {/* BOTTOM LEFT: Selected Entity Inspector */}
      {hasSelectedAgent && (
        <aside className="hud-panel--inspector" style={{ pointerEvents: 'auto' }}>
          <div className="hud-inspector__tabs">
            <button
              type="button"
              className={`hud-tab-btn${inspectorTab === 'overview' ? ' is-active' : ''}`}
              onClick={() => setInspectorTab('overview')}
            >
              Overview
            </button>
            <button
              type="button"
              className={`hud-tab-btn${inspectorTab === 'workflow' ? ' is-active' : ''}`}
              onClick={() => setInspectorTab('workflow')}
            >
              Workflow
            </button>
            <button
              type="button"
              className={`hud-tab-btn${inspectorTab === 'correlation' ? ' is-active' : ''}`}
              onClick={() => setInspectorTab('correlation')}
            >
              Correlation
            </button>
          </div>
          <div className="hud-inspector__body">
            {inspectorTab === 'overview' ? (
               <div className="surface-card">
                 <p className="surface-status surface-status--info">Agent is selected. View their workflow or active correlations to learn more.</p>
               </div>
            ) : null}
            {inspectorTab === 'workflow' ? workflowPanel : null}
            {inspectorTab === 'correlation' ? correlationPanel : null}
          </div>
        </aside>
      )}

      {/* BOTTOM CENTER/RIGHT: Main Menu & Panels */}
      {activeMenu !== 'none' && (
        <div className="hud-panel--menu-content" style={{ pointerEvents: 'auto' }}>
          {activeMenu === 'queue' && attentionQueuePanel}
          {activeMenu === 'watch' && watchTopologyPanel}
          {activeMenu === 'layout' && officeGrid}
          {activeMenu === 'feed' && incidentFeedPanel}
        </div>
      )}

      <nav className="hud-bottom-menu" style={{ pointerEvents: 'auto' }}>
        <button
          type="button"
          className={`hud-menu-btn${activeMenu === 'queue' ? ' is-active' : ''}`}
          onClick={() => toggleMenu('queue')}
        >
          Queue
        </button>
        <button
          type="button"
          className={`hud-menu-btn${activeMenu === 'watch' ? ' is-active' : ''}`}
          onClick={() => toggleMenu('watch')}
        >
          Watch
        </button>
        <button
          type="button"
          className={`hud-menu-btn${activeMenu === 'layout' ? ' is-active' : ''}`}
          onClick={() => toggleMenu('layout')}
        >
          Layout
        </button>
        <button
          type="button"
          className={`hud-menu-btn${activeMenu === 'feed' ? ' is-active' : ''}`}
          onClick={() => toggleMenu('feed')}
        >
          Feed
        </button>

        <div className="hud-menu__footer">
          <span>Poll: {pollIntervalMs / 1000}s</span>
          <span>Window: {workflowWindow}</span>
          <span>Limit: {workflowLimit}</span>
        </div>
      </nav>
    </div>
  );
}
