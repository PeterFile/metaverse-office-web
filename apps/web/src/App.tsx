import { lazy, Suspense, useEffect, useMemo, useRef } from 'react';

import {
  DEFAULT_WORKFLOW_LIMIT,
  DEFAULT_WORKFLOW_WINDOW,
  RequestError,
  fetchAgentWorkflow,
  fetchIncidents,
  fetchOfficeOverview
} from './api';
import { DetailsPanel } from './aitown/DetailsPanel';
import { adaptWorldToScene } from './aitown/sceneAdapter';
import { WorldProvider, useWorld } from './context/WorldContext';
import { usePolledResource } from './hooks/usePolledResource';
import type { OfficeAgent } from './types';
import { projectWorldState } from './world/projector';

const LazyWorldScene = lazy(() => import('./aitown/WorldScene'));

function isJsdomEnvironment() {
  return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
}

export function resolveSelectedAgent(
  selectedAgentId: string | null,
  overviewAgents: OfficeAgent[] | undefined,
  lastSelectedAgent: OfficeAgent | null
) {
  if (!selectedAgentId) {
    return null;
  }

  return (
    overviewAgents?.find((agent) => agent.agent_id === selectedAgentId) ??
    (lastSelectedAgent?.agent_id === selectedAgentId ? lastSelectedAgent : null)
  );
}

export function resolveOverviewRefreshWarning(error: string | null, hasOverviewData: boolean) {
  if (!error || !hasOverviewData) {
    return null;
  }

  return error;
}

function AppInner() {
  const { selectedAgentId, setSelectedAgentId, setWorld } = useWorld();
  const lastSelectedAgentRef = useRef<OfficeAgent | null>(null);

  const overviewResource = usePolledResource({
    load: (signal) => fetchOfficeOverview(signal),
    resourceKey: 'office-overview'
  });

  const incidentFeedResource = usePolledResource({
    load: (signal) =>
      fetchIncidents({
        limit: DEFAULT_WORKFLOW_LIMIT,
        window: DEFAULT_WORKFLOW_WINDOW,
        signal
      }),
    resourceKey: 'incident-feed'
  });

  const selectedAgentStillVisibleInOverview = useMemo(
    () =>
      selectedAgentId !== null &&
      (overviewResource.data?.agents.some((agent) => agent.agent_id === selectedAgentId) ?? false),
    [overviewResource.data, selectedAgentId]
  );

  const workflowResource = usePolledResource({
    enabled: selectedAgentId !== null,
    load: (signal) =>
      fetchAgentWorkflow(selectedAgentId!, {
        limit: DEFAULT_WORKFLOW_LIMIT,
        window: DEFAULT_WORKFLOW_WINDOW,
        signal
      }),
    onError: (error) => {
      if (
        error instanceof RequestError &&
        error.code === 'not_found' &&
        !selectedAgentStillVisibleInOverview
      ) {
        setSelectedAgentId(null);
      }
    },
    resourceKey: selectedAgentId
  });

  const activeWorkflow =
    workflowResource.data?.agent_id === selectedAgentId ? workflowResource.data : null;

  const projectedWorld = useMemo(
    () =>
      projectWorldState({
        overview: overviewResource.data,
        workflows: activeWorkflow && selectedAgentId ? new Map([[selectedAgentId, activeWorkflow]]) : new Map(),
        incidentFeed: incidentFeedResource.data,
        now: new Date().toISOString()
      }),
    [activeWorkflow, incidentFeedResource.data, overviewResource.data, selectedAgentId]
  );

  useEffect(() => {
    setWorld(projectedWorld);
  }, [projectedWorld, setWorld]);

  const scene = useMemo(
    () => adaptWorldToScene(projectedWorld, selectedAgentId),
    [projectedWorld, selectedAgentId]
  );

  const selectedAgent = resolveSelectedAgent(
    selectedAgentId,
    overviewResource.data?.agents,
    lastSelectedAgentRef.current
  );

  useEffect(() => {
    if (!selectedAgentId) {
      lastSelectedAgentRef.current = null;
      return;
    }

    const overviewMatch = overviewResource.data?.agents.find((agent) => agent.agent_id === selectedAgentId) ?? null;
    if (overviewMatch) {
      lastSelectedAgentRef.current = overviewMatch;
    }
  }, [overviewResource.data, selectedAgentId]);

  const rendererFallback = (
    <div className="aitown-world__placeholder aitown-world__placeholder--static">
      Loading world renderer...
    </div>
  );
  const overviewRefreshWarning = resolveOverviewRefreshWarning(
    overviewResource.error,
    Boolean(overviewResource.data)
  );

  return (
    <main className="aitown-shell game-background">
      <header className="aitown-shell__header">
        <div className="aitown-shell__brand">
          <span className="aitown-shell__eyebrow">Metaverse Office</span>
          <h1 className="game-title">Metaverse Town</h1>
          <p>AI Town-derived world shell for Metaverse Office.</p>
        </div>

        <div className="aitown-shell__stats" aria-label="Town summary">
          <div className="aitown-shell__stat">
            <span>Agents</span>
            <strong>{overviewResource.data?.summary.agent_count ?? 0}</strong>
          </div>
          <div className="aitown-shell__stat">
            <span>Blocked</span>
            <strong>{overviewResource.data?.summary.blocked_count ?? 0}</strong>
          </div>
          <div className="aitown-shell__stat">
            <span>Reboot</span>
            <strong>{overviewResource.data?.summary.reboot_recommended_count ?? 0}</strong>
          </div>
          <div className="aitown-shell__stat">
            <span>Feed</span>
            <strong>{incidentFeedResource.data?.items.length ?? 0}</strong>
          </div>
        </div>
      </header>

      <section className="aitown-shell__layout">
        <section className="aitown-panel aitown-panel--game" role="region" aria-label="Town world">
          <div className="aitown-panel__topline">
            <span>Drag to pan. Wheel to zoom. Click an agent to inspect.</span>
            <span>
              {overviewResource.data?.generated_at ? `Snapshot ${overviewResource.data.generated_at}` : 'Synchronizing'}
            </span>
          </div>

          {overviewRefreshWarning ? (
            <div className="aitown-world__placeholder aitown-world__placeholder--warning" role="status">
              <strong>Showing last office snapshot.</strong>
              <span>{overviewRefreshWarning}</span>
            </div>
          ) : null}

          {overviewResource.state === 'error' && !overviewResource.data ? (
            <div className="aitown-world__placeholder aitown-world__placeholder--error">
              <strong>Unable to load office overview.</strong>
              <span>{overviewResource.error}</span>
            </div>
          ) : isJsdomEnvironment() ? (
            rendererFallback
          ) : (
            <Suspense fallback={rendererFallback}>
              <LazyWorldScene scene={scene} onSelectAgent={setSelectedAgentId} />
            </Suspense>
          )}
        </section>

        <DetailsPanel
          incidentFeed={incidentFeedResource.data}
          incidentFeedError={incidentFeedResource.error}
          incidentFeedState={incidentFeedResource.state}
          selectedAgent={selectedAgent}
          workflow={activeWorkflow}
          workflowError={workflowResource.error}
          workflowState={workflowResource.state}
          world={projectedWorld}
          onSelectAgent={setSelectedAgentId}
        />
      </section>
    </main>
  );
}

export default function App() {
  return (
    <WorldProvider>
      <AppInner />
    </WorldProvider>
  );
}
