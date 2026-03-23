import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_WORKFLOW_LIMIT,
  DEFAULT_WORKFLOW_WINDOW,
  RequestError,
  fetchAgentWorkflow,
  fetchCorrelationDrilldown,
  fetchIncidents,
  fetchOfficeOperations,
  fetchOfficeOverview
} from './api';
import { DetailsPanel } from './aitown/DetailsPanel';
import { adaptWorldToScene } from './aitown/sceneAdapter';
import { WorldProvider, useWorld } from './context/WorldContext';
import { usePolledResource } from './hooks/usePolledResource';
import { getHubFocusableElements } from './hubFocus';
import type { OfficeAgent, OfficeOperation } from './types';
import { projectWorldState } from './world/projector';

const LazyWorldScene = lazy(() => import('./aitown/WorldScene'));

type OperationSelection = {
  agentId: string;
};

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

function resolveCorrelationPollKey(selectedCorrelationId: string | null) {
  return selectedCorrelationId;
}

function resolveCorrelationSelectionContext(selectedAgentId: string | null) {
  return selectedAgentId ?? '__crew-overview__';
}

function selectDefaultCorrelationId({
  incidentFeed,
  selectedOperation,
  workflow,
  selectedAgentId
}: {
  incidentFeed: { items: Array<{ correlation_id: string | null }> } | null;
  selectedOperation: OfficeOperation | null;
  workflow: {
    detail: { open_peer_watch_alerts: Array<{ correlation_id: string | null }> };
    correlation_ids: string[];
  } | null;
  selectedAgentId: string | null;
}) {
  if (selectedAgentId) {
    if (selectedOperation?.correlation_id) {
      return selectedOperation.correlation_id;
    }

    const workflowCorrelation = workflow?.detail.open_peer_watch_alerts.find((alert) => alert.correlation_id)?.correlation_id;
    if (workflowCorrelation) {
      return workflowCorrelation;
    }

    const workflowFallbackCorrelation = workflow?.correlation_ids.find(Boolean) ?? null;
    if (workflowFallbackCorrelation) {
      return workflowFallbackCorrelation;
    }

    return null;
  }

  return incidentFeed?.items.find((incident) => incident.correlation_id)?.correlation_id ?? null;
}

function AppInner() {
  const { selectedAgentId, setSelectedAgentId, setWorld } = useWorld();
  const [hubOpen, setHubOpen] = useState(false);
  const [selectedCorrelationId, setSelectedCorrelationId] = useState<string | null>(null);
  const [selectedCorrelationWasExplicit, setSelectedCorrelationWasExplicit] = useState(false);
  const [selectedOperationSelection, setSelectedOperationSelection] = useState<OperationSelection | null>(null);
  const [selectedOperationSnapshot, setSelectedOperationSnapshot] = useState<OfficeOperation | null>(null);
  const [invalidSelectedOperationCorrelationId, setInvalidSelectedOperationCorrelationId] = useState<string | null>(null);
  const lastSelectedAgentRef = useRef<OfficeAgent | null>(null);
  const correlationSelectionModeRef = useRef<'auto' | 'manual' | 'preserved'>('auto');
  const lastCorrelationContextRef = useRef<string | null>(null);
  const hubTriggerRef = useRef<HTMLButtonElement | null>(null);
  const hubCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const hubDialogRef = useRef<HTMLDivElement | null>(null);
  const hubFocusReturnRef = useRef<HTMLElement | null>(null);
  const wasHubOpenRef = useRef(false);

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

  const operationsQueueEnabled = hubOpen && (selectedAgentId === null || selectedOperationSelection !== null);

  const operationsResource = usePolledResource({
    enabled: operationsQueueEnabled,
    load: (signal) =>
      fetchOfficeOperations({
        limit: selectedOperationSelection ? undefined : 4,
        agentId: selectedOperationSelection?.agentId,
        signal
      }),
    resourceKey: selectedOperationSelection
      ? `office-operations:${selectedOperationSelection.agentId}`
      : 'office-operations'
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

  const correlationResource = usePolledResource({
    enabled: hubOpen && selectedCorrelationId !== null,
    load: (signal) =>
      fetchCorrelationDrilldown(selectedCorrelationId!, {
        limit: DEFAULT_WORKFLOW_LIMIT,
        window: DEFAULT_WORKFLOW_WINDOW,
        signal
      }),
    onError: (error) => {
      if (
        correlationSelectionModeRef.current === 'preserved' &&
        error instanceof RequestError &&
        error.code === 'not_found'
      ) {
        correlationSelectionModeRef.current = 'auto';
        setSelectedCorrelationId(null);
        setSelectedCorrelationWasExplicit(false);
      }
    },
    resourceKey: resolveCorrelationPollKey(selectedCorrelationId)
  });

  const activeCorrelation =
    correlationResource.data?.correlation_id === selectedCorrelationId ? correlationResource.data : null;
  const correlationSelectionContext = resolveCorrelationSelectionContext(selectedAgentId);

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

  const liveSelectedOperation = useMemo(() => {
    if (!selectedOperationSelection) {
      return null;
    }

    return operationsResource.data?.items.find((operation) => operation.agent_id === selectedOperationSelection.agentId) ?? null;
  }, [operationsResource.data, selectedOperationSelection]);

  const selectedOperation = useMemo(() => {
    if (!selectedOperationSelection) {
      return null;
    }

    return liveSelectedOperation ?? selectedOperationSnapshot;
  }, [liveSelectedOperation, selectedOperationSelection, selectedOperationSnapshot]);

  const selectedOperationForCorrelationSelection = useMemo(() => {
    if (operationsResource.error) {
      return null;
    }

    if (liveSelectedOperation) {
      return liveSelectedOperation;
    }

    return operationsResource.state === 'loading' ? selectedOperationSnapshot : null;
  }, [liveSelectedOperation, operationsResource.error, operationsResource.state, selectedOperationSnapshot]);

  useEffect(() => {
    const currentOperationCorrelationId = selectedOperationForCorrelationSelection?.correlation_id ?? null;

    if (!currentOperationCorrelationId) {
      if (invalidSelectedOperationCorrelationId !== null) {
        setInvalidSelectedOperationCorrelationId(null);
      }
      return;
    }

    if (
      invalidSelectedOperationCorrelationId !== null &&
      invalidSelectedOperationCorrelationId !== currentOperationCorrelationId
    ) {
      setInvalidSelectedOperationCorrelationId(null);
    }
  }, [invalidSelectedOperationCorrelationId, selectedOperationForCorrelationSelection]);

  useEffect(() => {
    const currentOperationCorrelationId = selectedOperationForCorrelationSelection?.correlation_id ?? null;
    if (!currentOperationCorrelationId) {
      return;
    }

    const selectedOperationCorrelationFailed =
      Boolean(correlationResource.error) &&
      !activeCorrelation &&
      selectedCorrelationId === currentOperationCorrelationId;

    if (
      selectedOperationCorrelationFailed &&
      invalidSelectedOperationCorrelationId !== currentOperationCorrelationId
    ) {
      setInvalidSelectedOperationCorrelationId(currentOperationCorrelationId);
    }
  }, [
    activeCorrelation,
    correlationResource.error,
    invalidSelectedOperationCorrelationId,
    selectedCorrelationId,
    selectedOperationForCorrelationSelection
  ]);

  const selectedOperationForAutoCorrelation = useMemo(() => {
    if (!selectedOperationForCorrelationSelection?.correlation_id) {
      return selectedOperationForCorrelationSelection;
    }

    return invalidSelectedOperationCorrelationId === selectedOperationForCorrelationSelection.correlation_id
      ? null
      : selectedOperationForCorrelationSelection;
  }, [invalidSelectedOperationCorrelationId, selectedOperationForCorrelationSelection]);

  useEffect(() => {
    if (liveSelectedOperation) {
      setSelectedOperationSnapshot(liveSelectedOperation);
      return;
    }

    if (!selectedOperationSelection) {
      setSelectedOperationSnapshot(null);
    }
  }, [liveSelectedOperation, selectedOperationSelection]);

  useEffect(() => {
    if (!selectedAgentId) {
      lastSelectedAgentRef.current = null;
      if (selectedOperationSelection) {
        setSelectedOperationSelection(null);
      }
      return;
    }

    const overviewMatch = overviewResource.data?.agents.find((agent) => agent.agent_id === selectedAgentId) ?? null;
    if (overviewMatch) {
      lastSelectedAgentRef.current = overviewMatch;
    }
  }, [overviewResource.data, selectedAgentId]);

  useEffect(() => {
    if (!hubOpen) {
      lastCorrelationContextRef.current = null;
      correlationSelectionModeRef.current = 'auto';
      return;
    }

    if (lastCorrelationContextRef.current !== correlationSelectionContext) {
      lastCorrelationContextRef.current = correlationSelectionContext;
      correlationSelectionModeRef.current = 'auto';
      setSelectedCorrelationId(null);
      setSelectedCorrelationWasExplicit(false);
    }
  }, [correlationSelectionContext, hubOpen]);

  useEffect(() => {
    if (!hubOpen) {
      return;
    }

    if (
      (correlationSelectionModeRef.current === 'manual' || correlationSelectionModeRef.current === 'preserved') &&
      selectedCorrelationId !== null
    ) {
      return;
    }

    const nextCorrelationId = selectDefaultCorrelationId({
      incidentFeed: incidentFeedResource.data,
      selectedOperation: selectedOperationForAutoCorrelation,
      workflow: activeWorkflow,
      selectedAgentId
    });

    if (nextCorrelationId !== selectedCorrelationId) {
      setSelectedCorrelationId(nextCorrelationId);
      setSelectedCorrelationWasExplicit(false);
    }
  }, [
    activeWorkflow,
    hubOpen,
    incidentFeedResource.data,
    selectedAgentId,
    selectedCorrelationId,
    selectedOperation,
    selectedOperationForAutoCorrelation
  ]);

  const closeHub = useCallback(() => {
    setHubOpen(false);
  }, []);

  const handleSelectCorrelation = useCallback((correlationId: string | null) => {
    const isExplicitSelection = correlationId !== null;
    correlationSelectionModeRef.current = isExplicitSelection ? 'manual' : 'auto';
    setSelectedCorrelationId(correlationId);
    setSelectedCorrelationWasExplicit(isExplicitSelection);
    if (correlationId) {
      setHubOpen(true);
    }
  }, []);

  const toggleHub = useCallback(() => {
    setHubOpen((open) => !open);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    if (hubOpen && !wasHubOpenRef.current) {
      const activeElement = document.activeElement;
      hubFocusReturnRef.current = activeElement instanceof HTMLElement ? activeElement : null;
      hubCloseButtonRef.current?.focus();
    }

    if (!hubOpen && wasHubOpenRef.current) {
      const focusTarget = hubFocusReturnRef.current;
      if (focusTarget && focusTarget.isConnected && focusTarget !== document.body) {
        focusTarget.focus();
      } else {
        hubTriggerRef.current?.focus();
      }
      hubFocusReturnRef.current = null;
    }

    wasHubOpenRef.current = hubOpen;
  }, [hubOpen]);

  useEffect(() => {
    if (!hubOpen || typeof document === 'undefined') {
      return;
    }

    const dialog = hubDialogRef.current;
    if (!dialog) {
      return;
    }

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && activeElement.isConnected && dialog.contains(activeElement)) {
      return;
    }

    const detailsPanel = dialog.querySelector<HTMLElement>('[role="complementary"][aria-label="Agent details"]');
    if (!detailsPanel) {
      return;
    }

    const [firstDetailsFocusable] = getHubFocusableElements(detailsPanel);
    (firstDetailsFocusable ?? dialog).focus();
  }, [hubOpen, selectedAgentId]);

  useEffect(() => {
    if (!hubOpen || typeof document === 'undefined') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeHub();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const dialog = hubDialogRef.current;
      if (!dialog) {
        return;
      }

      const focusableElements = getHubFocusableElements(dialog);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey) {
        if (activeElement === firstFocusable || !dialog.contains(activeElement)) {
          event.preventDefault();
          lastFocusable.focus();
        }
        return;
      }

      if (activeElement === lastFocusable || !dialog.contains(activeElement)) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeHub, hubOpen]);

  const selectAgent = useCallback(
    (
      agentId: string | null,
      correlationId: string | null,
      operationSelection: OperationSelection | null = null,
      correlationMode: 'auto' | 'manual' | 'preserved' = correlationId === null ? 'auto' : 'manual',
      correlationWasExplicit = correlationMode === 'manual'
    ) => {
      lastCorrelationContextRef.current = resolveCorrelationSelectionContext(agentId);
      correlationSelectionModeRef.current = correlationMode;
      setSelectedCorrelationId(correlationId);
      setSelectedCorrelationWasExplicit(correlationId !== null && correlationWasExplicit);
      setSelectedOperationSelection(operationSelection);
      setSelectedAgentId(agentId);
    },
    [setSelectedAgentId]
  );

  const handleSceneSelectAgent = useCallback(
    (agentId: string | null) => {
      selectAgent(agentId, null);
      if (agentId) {
        setHubOpen(true);
      }
    },
    [selectAgent]
  );

  const handleSelectOperation = useCallback(
    (operation: OfficeOperation) => {
      setSelectedOperationSnapshot(operation);
      selectAgent(operation.agent_id, operation.correlation_id, {
        agentId: operation.agent_id
      }, 'auto');
      setHubOpen(true);
    },
    [selectAgent]
  );

  const rendererFallback = (
    <div className="aitown-world__placeholder aitown-world__placeholder--static">
      Loading world renderer...
    </div>
  );
  const overviewRefreshWarning = resolveOverviewRefreshWarning(
    overviewResource.error,
    Boolean(overviewResource.data)
  );
  const preserveWorkflowCounterpartyCorrelation =
    selectedCorrelationId !== null && selectedCorrelationWasExplicit;

  return (
    <main className="aitown-shell game-background">
      <section className="aitown-shell__layout aitown-shell__layout--fullscreen">
        <section className="aitown-panel aitown-panel--game aitown-panel--game-fullscreen" role="region" aria-label="Town world">
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
          <div className="aitown-panel__topline">
            <span>Drag to pan. Wheel to zoom. Tap or click an agent to inspect.</span>
            <span>
              {overviewResource.data?.generated_at ? `Snapshot ${overviewResource.data.generated_at}` : 'Synchronizing'}
            </span>
          </div>

          <div className="aitown-panel__toolbar">
            <button
              ref={hubTriggerRef}
              type="button"
              className="aitown-button"
              aria-expanded={hubOpen}
              aria-controls="aitown-hub"
              aria-haspopup="dialog"
              onClick={toggleHub}
            >
              {hubOpen ? 'Hide Hub' : 'Open Hub'}
            </button>
            {selectedAgent ? (
              <button type="button" className="aitown-button" onClick={() => selectAgent(null, null)}>
                Clear Selection
              </button>
            ) : null}
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
              <LazyWorldScene scene={scene} onSelectAgent={handleSceneSelectAgent} />
            </Suspense>
          )}
        </section>
      </section>

      {hubOpen ? (
        <div className="aitown-hub-overlay" onClick={closeHub}>
          <div
            ref={hubDialogRef}
            id="aitown-hub"
            className="aitown-hub-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="aitown-hub-title"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="aitown-hub-sheet__header">
              <span id="aitown-hub-title" className="aitown-hub-sheet__title">Hub</span>
              <button ref={hubCloseButtonRef} type="button" className="aitown-button" onClick={closeHub}>
                Close Hub
              </button>
            </div>
            <DetailsPanel
              correlation={activeCorrelation}
              correlationError={correlationResource.error}
              correlationState={correlationResource.state}
              incidentFeed={incidentFeedResource.data}
              incidentFeedError={incidentFeedResource.error}
              incidentFeedState={incidentFeedResource.state}
              operations={operationsResource.data}
              operationsError={operationsResource.error}
              operationsState={operationsResource.state}
              overviewZones={overviewResource.data?.zones ?? null}
              preserveWorkflowCounterpartyCorrelation={preserveWorkflowCounterpartyCorrelation}
              selectedAgent={selectedAgent}
              selectedCorrelationId={selectedCorrelationId}
              selectedOperation={selectedOperation}
              workflow={activeWorkflow}
              workflowError={workflowResource.error}
              workflowState={workflowResource.state}
              world={projectedWorld}
              onSelectAgent={(agentId, correlationId = null) =>
                selectAgent(
                  agentId,
                  correlationId,
                  null,
                  correlationId === null ? 'auto' : 'preserved',
                  correlationId !== null && correlationId === selectedCorrelationId && selectedCorrelationWasExplicit
                )
              }
              onSelectCorrelation={handleSelectCorrelation}
              onSelectOperation={handleSelectOperation}
            />
          </div>
        </div>
      ) : null}
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
