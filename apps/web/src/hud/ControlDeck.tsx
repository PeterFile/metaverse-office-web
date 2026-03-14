import type { ReactNode } from 'react';

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
  workflowLimit
}: ControlDeckProps) {
  return (
    <main className="app-shell">
      <header className="app-shell__header">
        <div>
          <h1>Operator Shell</h1>
          <p>Evidence-first office surface for the Phase 1 metaverse office.</p>
          {overviewRefreshNotice}
        </div>
        <p>Last refresh: {generatedAt}</p>
      </header>

      {summaryStrip}

      <section className="app-shell__content">
        {officeGrid}
        <div className="app-shell__sidebar">
          {attentionQueuePanel}
          {workflowPanel}
        </div>
      </section>

      <section className="app-shell__operations">
        {incidentFeedPanel}
        {watchTopologyPanel}
        {correlationPanel}
      </section>

      <footer className="app-shell__footer">
        <p>Polling every {pollIntervalMs / 1000}s. No fake motion. No synthetic activity.</p>
        <p>{`Using ${workflowWindow} read-only slices with limit ${workflowLimit} for workflow, incidents, and correlation.`}</p>
      </footer>
    </main>
  );
}
