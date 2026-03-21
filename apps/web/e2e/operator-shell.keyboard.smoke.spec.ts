import { expect, test, type ConsoleMessage, type Page, type Request } from '@playwright/test';

import {
  BROWSER_SMOKE_BACKEND_ORIGIN_ENV,
  resolveBrowserSmokePorts
} from '../scripts/browser-smoke-ports.mjs';
import { resolveViewportEdgeDragDelta } from '../scripts/viewport-reachability';
import { findStableSample, requireStableSample } from '../scripts/stability';

const POLL_DRIVEN_ASSERTION_TIMEOUT_MS = 12_000;

async function readViewportState(page: Page) {
  return page.evaluate(() => window.__AITOWN_VIEWPORT__?.read() ?? null);
}

function expectViewportBoundsWithinClampBudget(
  state: NonNullable<Awaited<ReturnType<typeof readViewportState>>>
) {
  const scale = state.scale ?? 1;
  const epsilon = 0.5;
  const rightAllowance = (state.clampPadding?.right ?? 0) / scale;
  const topAllowance = (state.clampPadding?.top ?? 0) / scale;

  expect(state.left).toBeGreaterThanOrEqual(-epsilon);
  expect(state.right).toBeLessThanOrEqual(state.worldWidth + rightAllowance + epsilon);
  expect(state.top).toBeGreaterThanOrEqual(-(topAllowance + epsilon));
  expect(state.bottom).toBeLessThanOrEqual(state.worldHeight + epsilon);
}

async function readViewportScale(page: Page) {
  return page.evaluate(() => window.__AITOWN_VIEWPORT__?.read().scale ?? null);
}

type BrowserZoomState = {
  devicePixelRatio: number;
  innerWidth: number;
  innerHeight: number;
  clientWidth: number;
  clientHeight: number;
  visualViewportWidth: number | null;
  visualViewportHeight: number | null;
  visualViewportScale: number | null;
};

function describeBrowserZoomState(state: BrowserZoomState) {
  return {
    devicePixelRatio: state.devicePixelRatio,
    innerWidth: state.innerWidth,
    innerHeight: state.innerHeight,
    clientWidth: state.clientWidth,
    clientHeight: state.clientHeight,
    visualViewportWidth: state.visualViewportWidth,
    visualViewportHeight: state.visualViewportHeight,
    visualViewportScale: state.visualViewportScale
  };
}

async function readBrowserZoomState(page: Page): Promise<BrowserZoomState> {
  return page.evaluate(() => ({
    devicePixelRatio: window.devicePixelRatio,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    clientWidth: document.documentElement.clientWidth,
    clientHeight: document.documentElement.clientHeight,
    visualViewportWidth: window.visualViewport?.width ?? null,
    visualViewportHeight: window.visualViewport?.height ?? null,
    visualViewportScale: window.visualViewport?.scale ?? null
  }));
}

function isBrowserZoomStateStable(previousState: BrowserZoomState, nextState: BrowserZoomState) {
  return (
    Math.abs(nextState.devicePixelRatio - previousState.devicePixelRatio) <= 0.01 &&
    Math.abs(nextState.innerWidth - previousState.innerWidth) <= 1 &&
    Math.abs(nextState.innerHeight - previousState.innerHeight) <= 1 &&
    Math.abs(nextState.clientWidth - previousState.clientWidth) <= 1 &&
    Math.abs(nextState.clientHeight - previousState.clientHeight) <= 1 &&
    Math.abs((nextState.visualViewportWidth ?? 0) - (previousState.visualViewportWidth ?? 0)) <= 1 &&
    Math.abs((nextState.visualViewportHeight ?? 0) - (previousState.visualViewportHeight ?? 0)) <= 1 &&
    Math.abs((nextState.visualViewportScale ?? 0) - (previousState.visualViewportScale ?? 0)) <= 0.01
  );
}

function didBrowserZoomChange(previousState: BrowserZoomState, nextState: BrowserZoomState) {
  return (
    Math.abs(nextState.devicePixelRatio - previousState.devicePixelRatio) > 0.01 ||
    Math.abs(nextState.innerWidth - previousState.innerWidth) > 1 ||
    Math.abs(nextState.innerHeight - previousState.innerHeight) > 1 ||
    Math.abs(nextState.clientWidth - previousState.clientWidth) > 1 ||
    Math.abs(nextState.clientHeight - previousState.clientHeight) > 1 ||
    Math.abs((nextState.visualViewportWidth ?? 0) - (previousState.visualViewportWidth ?? 0)) > 1 ||
    Math.abs((nextState.visualViewportHeight ?? 0) - (previousState.visualViewportHeight ?? 0)) > 1 ||
    Math.abs((nextState.visualViewportScale ?? 0) - (previousState.visualViewportScale ?? 0)) > 0.01
  );
}

async function waitForBrowserZoomChange(
  page: Page,
  previousState: BrowserZoomState,
  samples = 10,
  sampleDelayMs = 100
) {
  const states: BrowserZoomState[] = [];
  const isStableZoomChange = (currentPreviousState: BrowserZoomState, currentNextState: BrowserZoomState) =>
    didBrowserZoomChange(previousState, currentPreviousState) &&
    didBrowserZoomChange(previousState, currentNextState) &&
    isBrowserZoomStateStable(currentPreviousState, currentNextState);

  for (let sample = 0; sample < samples; sample += 1) {
    const currentState = await readBrowserZoomState(page);
    states.push(currentState);

    const stableState = findStableSample(states, isStableZoomChange);

    if (stableState) {
      return stableState;
    }

    if (sample < samples - 1) {
      await page.waitForTimeout(sampleDelayMs);
    }
  }

  return requireStableSample(
    states,
    isStableZoomChange,
    `browser zoom did not change after ${samples} samples`,
    describeBrowserZoomState
  );
}

function expectBrowserZoomStateMatchesBaseline(
  actualState: BrowserZoomState,
  expectedState: BrowserZoomState,
  errorMessage: string
) {
  if (isBrowserZoomStateStable(expectedState, actualState)) {
    return;
  }

  throw new Error(
    `${errorMessage}: ${JSON.stringify({
      expected: describeBrowserZoomState(expectedState),
      actual: describeBrowserZoomState(actualState)
    })}`
  );
}

type ObservedWheelGesture = {
  ctrlKey: boolean;
  defaultPrevented: boolean;
  deltaMode: number;
  deltaY: number;
  phase: 'capture' | 'after-dispatch';
  target: 'world-host' | 'other';
};

type BrowserWriteAttemptResult =
  | {
      kind: 'response';
      status: number;
      bodyText: string;
    }
  | {
      kind: 'error';
      name: string | null;
      message: string;
    };

type BrowserSmokeRequestLogEntry = {
  method: string;
  pathname: string;
  origin: string | null;
  accessControlRequestMethod: string | null;
};

type BrowserConsoleObservation = {
  type: string;
  text: string;
};

type BrowserRequestFailureObservation = {
  method: string;
  url: string;
  errorText: string | null;
};

type BrowserWriteNetworkEvent = {
  name: string;
  method: string | null;
  status: number | null;
  url: string;
  type: string | null;
  errorText: string | null;
  initiator: string | null;
};

type ObservedLoopbackWriteAttempt = {
  consoleMessages: BrowserConsoleObservation[];
  requestFailures: BrowserRequestFailureObservation[];
  networkEvents: BrowserWriteNetworkEvent[];
  dispose: () => Promise<void>;
};

async function installObservedWheelGestureCapture(page: Page) {
  await page.addInitScript(() => {
    const records: Array<{
      ctrlKey: boolean;
      defaultPrevented: boolean;
      deltaMode: number;
      deltaY: number;
      phase: 'capture' | 'after-dispatch';
      target: 'world-host' | 'other';
    }> = [];

    const classifyTarget = (target: EventTarget | null) => {
      return target instanceof Element && target.closest('.aitown-world__host') ? 'world-host' : 'other';
    };

    window.addEventListener(
      'wheel',
      (event) => {
        const snapshot = {
          ctrlKey: event.ctrlKey,
          deltaMode: event.deltaMode,
          deltaY: event.deltaY,
          target: classifyTarget(event.target)
        };

        records.push({
          ...snapshot,
          defaultPrevented: event.defaultPrevented,
          phase: 'capture'
        });

        queueMicrotask(() => {
          records.push({
            ...snapshot,
            defaultPrevented: event.defaultPrevented,
            phase: 'after-dispatch'
          });
        });
      },
      { capture: true, passive: true }
    );

    (window as typeof window & {
      __AITOWN_OBSERVED_WHEEL_GESTURES__?: typeof records;
    }).__AITOWN_OBSERVED_WHEEL_GESTURES__ = records;
  });
}

async function readObservedWheelGestures(page: Page): Promise<ObservedWheelGesture[]> {
  return page.evaluate(() => {
    return (window as typeof window & {
      __AITOWN_OBSERVED_WHEEL_GESTURES__?: Array<{
        ctrlKey: boolean;
        defaultPrevented: boolean;
        deltaMode: number;
        deltaY: number;
        phase: 'capture' | 'after-dispatch';
        target: 'world-host' | 'other';
      }>;
    }).__AITOWN_OBSERVED_WHEEL_GESTURES__ ?? [];
  });
}

async function expectViewportScaleRemainsUnchanged(
  page: Page,
  expectedScale: number,
  samples = 8,
  sampleDelayMs = 100,
  epsilon = 0.0001
) {
  const observedScales: Array<number | null> = [];

  for (let sample = 0; sample < samples; sample += 1) {
    observedScales.push(await readViewportScale(page));

    if (sample < samples - 1) {
      await page.waitForTimeout(sampleDelayMs);
    }
  }

  const changedScale = observedScales.find(
    (scale) => typeof scale !== 'number' || Math.abs(scale - expectedScale) > epsilon
  );

  if (changedScale !== undefined) {
    throw new Error(
      `viewport scale changed after browser zoom settled: ${JSON.stringify({ expectedScale, observedScales })}`
    );
  }

  return observedScales[observedScales.length - 1] as number;
}

async function readViewportPose(page: Page) {
  return page.evaluate(() => {
    const state = window.__AITOWN_VIEWPORT__?.read();

    if (!state) {
      return null;
    }

    return {
      x: state.x,
      y: state.y,
      scale: state.scale
    };
  });
}

async function installFastPollInterval(page: Page, intervalMs = 100) {
  await page.addInitScript((nextIntervalMs: number) => {
    (window as typeof window & { __AITOWN_POLL_INTERVAL_MS__?: number }).__AITOWN_POLL_INTERVAL_MS__ = nextIntervalMs;
  }, intervalMs);
}

async function enableScenario(page: Page, scenario: 'degraded-refresh' | 'stale-selection-404') {
  const runId = `${scenario}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await page.evaluate(
    ({ nextScenario, nextRunId }) => {
      document.cookie = `browser_smoke_mode=${encodeURIComponent(nextScenario)}; path=/`;
      document.cookie = `browser_smoke_run=${encodeURIComponent(nextRunId)}; path=/`;
    },
    { nextScenario: scenario, nextRunId: runId }
  );
}

function resolveBrowserSmokeWriteTargetOrigin() {
  const explicitOrigin = process.env[BROWSER_SMOKE_BACKEND_ORIGIN_ENV]?.trim();
  if (explicitOrigin) {
    return explicitOrigin.replace(/\/+$/, '');
  }

  const proxyTarget = process.env.VITE_DEV_PROXY_TARGET?.trim();
  if (proxyTarget) {
    return proxyTarget.replace(/\/+$/, '');
  }

  if (process.env.BROWSER_SMOKE_BASE_URL?.trim()) {
    return null;
  }

  const { backendPort } = resolveBrowserSmokePorts(process.env);
  return `http://127.0.0.1:${backendPort}`;
}

function resolveInspectableBrowserSmokeBackendOrigin() {
  const explicitOrigin = process.env[BROWSER_SMOKE_BACKEND_ORIGIN_ENV]?.trim();
  if (explicitOrigin) {
    return explicitOrigin.replace(/\/+$/, '');
  }

  if (process.env.VITE_DEV_PROXY_TARGET?.trim()) {
    return null;
  }

  const { backendPort } = resolveBrowserSmokePorts(process.env);
  return `http://127.0.0.1:${backendPort}`;
}

async function attemptLoopbackWrite(page: Page, pathname: string): Promise<BrowserWriteAttemptResult> {
  const backendOrigin = resolveBrowserSmokeWriteTargetOrigin();

  return page.evaluate(
    async ({ nextBackendOrigin, nextPathname }) => {
      try {
        const response = await fetch(`${nextBackendOrigin}${nextPathname}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ smoke: true, pathname: nextPathname })
        });

        return {
          kind: 'response' as const,
          status: response.status,
          bodyText: await response.text()
        };
      } catch (error) {
        return {
          kind: 'error' as const,
          name: error instanceof Error ? error.name : null,
          message: error instanceof Error ? error.message : String(error)
        };
      }
    },
    { nextBackendOrigin: backendOrigin, nextPathname: pathname }
  );
}

async function observeLoopbackWriteAttempt(page: Page, pathname: string): Promise<ObservedLoopbackWriteAttempt> {
  const backendOrigin = resolveBrowserSmokeWriteTargetOrigin();
  const expectedUrl = `${backendOrigin}${pathname}`;
  const consoleMessages: BrowserConsoleObservation[] = [];
  const requestFailures: BrowserRequestFailureObservation[] = [];
  const networkEvents: BrowserWriteNetworkEvent[] = [];
  const cdpSession = await page.context().newCDPSession(page);

  await cdpSession.send('Network.enable');

  const handleConsole = (message: ConsoleMessage) => {
    consoleMessages.push({
      type: message.type(),
      text: message.text()
    });
  };

  const handleRequestFailed = (request: Request) => {
    if (request.url() !== expectedUrl) {
      return;
    }

    requestFailures.push({
      method: request.method(),
      url: request.url(),
      errorText: request.failure()?.errorText ?? null
    });
  };

  const appendNetworkEvent = (name: string, payload: Record<string, unknown>) => {
    const url =
      (payload.request as { url?: string } | undefined)?.url ??
      (payload.response as { url?: string } | undefined)?.url ??
      null;
    if (url !== expectedUrl) {
      return;
    }

    networkEvents.push({
      name,
      method: (payload.request as { method?: string } | undefined)?.method ?? null,
      status: (payload.response as { status?: number } | undefined)?.status ?? null,
      url,
      type: typeof payload.type === 'string' ? payload.type : null,
      errorText: typeof payload.errorText === 'string' ? payload.errorText : null,
      initiator:
        typeof (payload.initiator as { type?: string } | undefined)?.type === 'string'
          ? (payload.initiator as { type?: string }).type ?? null
          : null
    });
  };

  page.on('console', handleConsole);
  page.on('requestfailed', handleRequestFailed);
  cdpSession.on('Network.requestWillBeSent', (payload) => appendNetworkEvent('Network.requestWillBeSent', payload));
  cdpSession.on('Network.responseReceived', (payload) => appendNetworkEvent('Network.responseReceived', payload));
  cdpSession.on('Network.loadingFailed', (payload) => appendNetworkEvent('Network.loadingFailed', payload));

  return {
    consoleMessages,
    requestFailures,
    networkEvents,
    dispose: async () => {
      page.off('console', handleConsole);
      page.off('requestfailed', handleRequestFailed);
      await cdpSession.detach();
    }
  };
}

async function readBrowserSmokeRequestLog(backendOrigin: string): Promise<BrowserSmokeRequestLogEntry[]> {
  const response = await fetch(`${backendOrigin}/__browser-smoke__/requests`);
  expect(response.ok).toBe(true);
  return (await response.json()) as BrowserSmokeRequestLogEntry[];
}

async function installPinchTelemetry(page: Page) {
  await page.evaluate(() => {
    const host = document.querySelector('.aitown-world__host');
    const records: Array<{
      type: string;
      defaultPrevented: boolean;
      pointerType?: string;
      touches?: number;
    }> = [];

    if (!(host instanceof HTMLElement)) {
      throw new Error('missing world host for pinch telemetry');
    }

    const record = (event: Event) => {
      records.push({
        type: event.type,
        defaultPrevented: event.defaultPrevented,
        pointerType: 'pointerType' in event ? (event as PointerEvent).pointerType : undefined,
        touches: 'touches' in event ? (event as TouchEvent).touches.length : undefined
      });
    };

    host.addEventListener('pointermove', record);
    host.addEventListener('touchmove', record);

    (window as typeof window & {
      __AITOWN_PINCH_TELEMETRY__?: typeof records;
    }).__AITOWN_PINCH_TELEMETRY__ = records;
  });
}

async function readPinchTelemetry(page: Page) {
  return page.evaluate(() => {
    return (window as typeof window & {
      __AITOWN_PINCH_TELEMETRY__?: Array<{
        type: string;
        defaultPrevented: boolean;
        pointerType?: string;
        touches?: number;
      }>;
    }).__AITOWN_PINCH_TELEMETRY__ ?? [];
  });
}

async function synthesizePinchGesture(
  page: Page,
  scaleFactor = 1.25,
  gestureSourceType: 'touch' | 'mouse' = 'touch'
) {
  const session = await page.context().newCDPSession(page);
  const canvasBox = await page.locator('.aitown-world__host canvas').boundingBox();
  expect(canvasBox).not.toBeNull();

  await session.send('Input.synthesizePinchGesture', {
    x: Math.round(canvasBox!.x + canvasBox!.width / 2),
    y: Math.round(canvasBox!.y + canvasBox!.height / 2),
    scaleFactor,
    relativeSpeed: 800,
    gestureSourceType
  });
}

async function dispatchChromiumCtrlMouseWheel(page: Page, deltaY: number) {
  const host = page.locator('.aitown-world__host');
  await expect(host).toBeVisible();
  await host.hover();
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, deltaY);
  await page.keyboard.up('Control');
}

async function zoomViewportOutToMinimum(page: Page) {
  await page.evaluate(() => {
    window.__AITOWN_VIEWPORT__?.zoomToMinimum();
  });
}

async function zoomViewportInWithMouseWheel(page: Page, deltaY = -160) {
  await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

  const beforeScale = await readViewportScale(page);
  expect(beforeScale).not.toBeNull();

  await page.locator('.aitown-world__host canvas').hover();
  await page.mouse.wheel(0, deltaY);

  await expect
    .poll(async () => await readViewportScale(page), {
      timeout: POLL_DRIVEN_ASSERTION_TIMEOUT_MS
    })
    .toBeGreaterThan(beforeScale! + 0.01);
}

async function forceViewportAgainstTopRightClamp(page: Page) {
  await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));
  await page.evaluate(() => {
    const viewport = window.__AITOWN_VIEWPORT__;
    const state = viewport?.read();

    if (!viewport || !state) {
      throw new Error('missing viewport');
    }

    viewport.moveCenter(state.worldWidth * 4, -state.worldHeight * 4);
  });
}

async function expectCanvasDragMovesViewport(page: Page) {
  await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

  const before = await readViewportState(page);
  expect(before).not.toBeNull();
  expect(before!.screenWorldWidth).toBeGreaterThan(before!.screenWidth);
  expect(before!.screenWorldHeight).toBeGreaterThan(before!.screenHeight);

  const canvasBox = await page.locator('.aitown-world__host canvas').boundingBox();
  expect(canvasBox).not.toBeNull();

  const startX = canvasBox!.x + canvasBox!.width * 0.5;
  const startY = canvasBox!.y + canvasBox!.height * 0.5;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 120, startY + 120, { steps: 12 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const after = await readViewportState(page);

      return after && before
        ? { movedX: after.x > before.x, movedY: after.y > before.y }
        : null;
    })
    .toEqual({ movedX: true, movedY: true });
}

async function expectMinimumZoomKeepsTwoAxisPanRoom(page: Page) {
  await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));
  await zoomViewportOutToMinimum(page);

  const before = await readViewportState(page);
  expect(before).not.toBeNull();

  const canvasBox = await page.locator('.aitown-world__host canvas').boundingBox();
  expect(canvasBox).not.toBeNull();

  const startX = canvasBox!.x + canvasBox!.width * 0.5;
  const startY = canvasBox!.y + canvasBox!.height * 0.5;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 300, startY + 300, { steps: 20 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const after = await readViewportState(page);

      return after && before
        ? {
            movedX: after.x - before.x,
            movedY: after.y - before.y
          }
        : null;
    })
    .toMatchObject({
      movedX: expect.any(Number),
      movedY: expect.any(Number)
    });

  const after = await readViewportState(page);
  expect(after).not.toBeNull();
  expect(Math.abs(after!.x - before!.x)).toBeGreaterThanOrEqual(90);
  expect(Math.abs(after!.y - before!.y)).toBeGreaterThanOrEqual(90);
}

async function dragViewportFromCenter(page: Page, deltaX: number, deltaY: number) {
  const canvasBox = await page.locator('.aitown-world__host canvas').boundingBox();
  expect(canvasBox).not.toBeNull();

  const startX = canvasBox!.x + canvasBox!.width * 0.5;
  const startY = canvasBox!.y + canvasBox!.height * 0.5;
  const endX = startX + deltaX;
  const endY = startY + deltaY;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 16 });
  await page.mouse.up();
}

async function waitForViewportSettle(page: Page, samples = 8, sampleDelayMs = 50) {
  const states: Array<NonNullable<Awaited<ReturnType<typeof readViewportState>>>> = [];
  const isViewportStable = (
    previousState: NonNullable<Awaited<ReturnType<typeof readViewportState>>>,
    nextState: NonNullable<Awaited<ReturnType<typeof readViewportState>>>
  ) => Math.abs(nextState.x - previousState.x) <= 0.5 && Math.abs(nextState.y - previousState.y) <= 0.5;

  for (let sample = 0; sample < samples; sample += 1) {
    const currentState = await readViewportState(page);
    expect(currentState).not.toBeNull();
    states.push(currentState!);

    const stableState = findStableSample(states, isViewportStable);

    if (stableState) {
      return stableState;
    }

    if (sample < samples - 1) {
      await page.waitForTimeout(sampleDelayMs);
    }
  }

  return requireStableSample(
    states,
    isViewportStable,
    `viewport did not settle after ${samples} samples`,
    (state) => ({
      x: state.x,
      y: state.y,
      left: state.left,
      right: state.right,
      top: state.top,
      bottom: state.bottom,
      scale: state.scale
    })
  );
}

function isViewportAtBottomRightEdge(
  state: NonNullable<Awaited<ReturnType<typeof waitForViewportSettle>>>
) {
  const scale = state.scale ?? 1;
  const rightAllowance = (state.clampPadding?.right ?? 0) / scale;

  return state.right >= state.worldWidth + rightAllowance - 0.5 && state.bottom >= state.worldHeight - 0.5;
}

function isViewportAtTopLeftEdge(
  state: NonNullable<Awaited<ReturnType<typeof waitForViewportSettle>>>
) {
  const scale = state.scale ?? 1;
  const topAllowance = (state.clampPadding?.top ?? 0) / scale;

  return state.left >= -0.5 && state.left <= 0.5 && state.top <= -(topAllowance - 0.5);
}

async function dragViewportToEdge(
  page: Page,
  edge: 'bottom-right' | 'top-left',
  attempts = 2
) {
  const states: Array<NonNullable<Awaited<ReturnType<typeof waitForViewportSettle>>>> = [];
  const isSatisfied = edge === 'bottom-right' ? isViewportAtBottomRightEdge : isViewportAtTopLeftEdge;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const before = await readViewportState(page);
    expect(before).not.toBeNull();

    const { deltaX, deltaY } = resolveViewportEdgeDragDelta(before!, edge);
    if (deltaX === 0 && deltaY === 0) {
      return before!;
    }

    await dragViewportFromCenter(page, deltaX, deltaY);
    const currentState = await waitForViewportSettle(page);
    states.push(currentState);

    if (isSatisfied(currentState)) {
      return currentState;
    }
  }

  throw new Error(
    `viewport did not reach the ${edge} edge after ${attempts} resolved drags: ${JSON.stringify(
      states.map((state) => ({
        x: state.x,
        y: state.y,
        left: state.left,
        right: state.right,
        top: state.top,
        bottom: state.bottom,
        scale: state.scale
      }))
    )}`
  );
}

async function expectDefaultViewportKeepsDirectEdgeReachability(
  page: Page,
  options: {
    verifyReturnToTopLeft?: boolean;
  } = {}
) {
  const verifyReturnToTopLeft = options.verifyReturnToTopLeft ?? true;

  await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

  const initial = await readViewportState(page);
  expect(initial).not.toBeNull();
  expect(initial!.scale).not.toBeNull();
  expectViewportBoundsWithinClampBudget(initial!);
  const initialScale = initial!.scale!;

  const bottomRight = await dragViewportToEdge(page, 'bottom-right');
  expectViewportBoundsWithinClampBudget(bottomRight);
  expect(bottomRight.scale).not.toBeNull();
  expect(bottomRight.scale).toBeCloseTo(initialScale, 4);

  const bottomRightScale = bottomRight.scale ?? 1;
  const bottomRightAllowance = (bottomRight.clampPadding?.right ?? 0) / bottomRightScale;

  expect(bottomRight.right).toBeGreaterThanOrEqual(bottomRight.worldWidth + bottomRightAllowance - 0.5);
  expect(bottomRight.bottom).toBeGreaterThanOrEqual(bottomRight.worldHeight - 0.5);

  if (!verifyReturnToTopLeft) {
    return;
  }

  const topLeft = await dragViewportToEdge(page, 'top-left');
  expectViewportBoundsWithinClampBudget(topLeft);
  expect(topLeft.scale).not.toBeNull();
  expect(topLeft.scale).toBeCloseTo(initialScale, 4);

  expect(topLeft.left).toBeGreaterThanOrEqual(-0.5);
  expect(topLeft.left).toBeLessThanOrEqual(0.5);

  const topLeftScale = topLeft.scale ?? 1;
  const topLeftTopAllowance = (topLeft.clampPadding?.top ?? 0) / topLeftScale;
  expect(topLeft.top).toBeLessThanOrEqual(-(topLeftTopAllowance - 0.5));
}

const SHELLS = [
  { name: 'landscape', viewport: { width: 1280, height: 720 } },
  { name: 'portrait', viewport: { width: 390, height: 844 } }
] as const;

test.describe('AI Town shell smoke', () => {
  test('renders the new default shell and allows roster-driven selection through the Hub overlay', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Metaverse Town' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Town world' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Hub' })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Agent details' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();

    const inspectButton = detailsPanel.getByRole('button', {
      name: 'Inspect Growth Revenue Agent',
      exact: true
    });
    await expect(inspectButton).toBeVisible();
    await inspectButton.click();

    const workflowSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Workflow' })
    });
    const incidentSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Incident Feed' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Workflow' })).toBeVisible();
    await expect(detailsPanel.getByText('Prepare handoff notes')).toBeVisible();
    await expect(detailsPanel.getByText('meeting-zone', { exact: true })).toBeVisible();
    await expect(workflowSection.getByText('No open watch alerts.')).toBeVisible();
    await expect(incidentSection.getByText('Lead completed the revenue handoff')).toBeVisible();
    await expect(incidentSection.getByText('completed', { exact: true })).toBeVisible();
    await incidentSection.getByRole('button', { name: 'Open incident correlation corr-revenue-handoff' }).click();
    await expect(correlationSection.getByText('corr-revenue-handoff')).toBeVisible();

    await page.getByRole('button', { name: 'Close Hub' }).click();
    await expect(page.getByRole('complementary', { name: 'Agent details' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open Hub' })).toBeVisible();
  });

  test('treats Hub as a dismissible dialog and restores trigger focus on Escape', async ({ page }) => {
    await page.goto('/');

    const trigger = page.getByRole('button', { name: 'Open Hub' });
    await trigger.focus();
    await expect(trigger).toBeFocused();

    await trigger.click();

    const dialog = page.getByRole('dialog', { name: 'Hub' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close Hub' })).toBeFocused();

    await page.keyboard.press('Escape');

    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open Hub' })).toBeFocused();
  });

  test('keeps Tab focus contained inside Hub while the dialog is open', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const dialog = page.getByRole('dialog', { name: 'Hub' });
    const closeButton = dialog.getByRole('button', { name: 'Close Hub' });
    const dialogButtons = dialog.getByRole('button');

    await expect(dialog).toBeVisible();
    await expect(closeButton).toBeFocused();

    await page.keyboard.press('Shift+Tab');
    await expect(dialogButtons.last()).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(closeButton).toBeFocused();
  });

  test('keeps selected-agent workflow details pinned when a refresh-only workflow 404 arrives before overview drops the agent', async ({ page }) => {
    await installFastPollInterval(page);

    let workflowRequests = 0;
    await page.route('**/agents/app-engineering/workflow?limit=10&window=60m', async (route) => {
      workflowRequests += 1;
      if (workflowRequests === 1) {
        await route.continue();
        return;
      }

      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'not_found',
          details: 'unknown agent app-engineering'
        })
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    await detailsPanel.getByRole('button', { name: 'Inspect App Engineering Agent' }).click();
    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();

    await expect(detailsPanel.getByText('unknown agent app-engineering')).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear Selection' })).toBeVisible();
  });

  test('clears stale selected-agent workflow details after overview refresh confirms the agent is gone', async ({ page }) => {
    test.setTimeout(45_000);
    await installFastPollInterval(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    await detailsPanel.getByRole('button', { name: 'Inspect Growth Revenue Agent', exact: true }).click();
    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();

    await enableScenario(page, 'stale-selection-404');

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible({
      timeout: POLL_DRIVEN_ASSERTION_TIMEOUT_MS
    });
    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toHaveCount(0);
    await expect(
      detailsPanel.getByRole('button', { name: 'Inspect Growth Revenue Agent', exact: true })
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Clear Selection' })).toHaveCount(0);
  });

  test('keeps the last overview surface visible while degraded refresh warnings are active', async ({ page }) => {
    test.setTimeout(45_000);
    await installFastPollInterval(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Metaverse Town' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Town world' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Hub' })).toBeVisible();

    await enableScenario(page, 'degraded-refresh');

    await expect(page.getByText('Showing last office snapshot.')).toBeVisible({
      timeout: POLL_DRIVEN_ASSERTION_TIMEOUT_MS
    });
    await expect(page.getByText('overview refresh failed')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Metaverse Town' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Town world' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Hub' })).toBeVisible();
    await expect(page.getByText('Unable to load office overview.')).toHaveCount(0);
  });

  test('blocks loopback browser writes against the read-only smoke backend above the helper layer', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Metaverse Town' })).toBeVisible();

    const frontendOrigin = new URL(page.url()).origin;
    const inspectableBackendOrigin = resolveInspectableBrowserSmokeBackendOrigin();
    const backendOrigin = resolveBrowserSmokeWriteTargetOrigin();
    if (!backendOrigin) {
      return;
    }

    const expectedUrl = `${backendOrigin}/events`;
    const observedAttempt = await observeLoopbackWriteAttempt(page, '/events');

    try {
      const writeAttempt = await attemptLoopbackWrite(page, '/events');
      expect(writeAttempt.kind).toBe('error');

      await expect
        .poll(() => {
          const corsConsoleMessage = observedAttempt.consoleMessages.find(
            (message) =>
              /blocked by CORS policy/i.test(message.text) &&
              /preflight request/i.test(message.text) &&
              message.text.includes(expectedUrl) &&
              message.text.includes(frontendOrigin)
          );
          const postRequestFailure = observedAttempt.requestFailures.find(
            (failure) => failure.method === 'POST' && failure.url === expectedUrl
          );
          const preflightRequest = observedAttempt.networkEvents.find(
            (event) =>
              event.name === 'Network.requestWillBeSent' &&
              event.method === 'OPTIONS' &&
              event.url === expectedUrl &&
              event.initiator === 'preflight'
          );
          const preflightResponse = observedAttempt.networkEvents.find(
            (event) =>
              event.name === 'Network.responseReceived' &&
              event.type === 'Preflight' &&
              event.url === expectedUrl
          );
          const postIntent = observedAttempt.networkEvents.find(
            (event) =>
              event.name === 'Network.requestWillBeSent' &&
              event.method === 'POST' &&
              event.url === expectedUrl &&
              event.initiator === 'script'
          );

          return {
            sawCorsConsoleMessage: Boolean(corsConsoleMessage),
            postRequestFailure: postRequestFailure?.errorText ?? null,
            sawPreflightRequest: Boolean(preflightRequest),
            sawBlockedPreflight:
              typeof preflightResponse?.status === 'number' && preflightResponse.status >= 400,
            sawScriptPostIntent: Boolean(postIntent)
          };
        })
        .toEqual({
          sawCorsConsoleMessage: true,
          postRequestFailure: 'net::ERR_FAILED',
          sawPreflightRequest: true,
          sawBlockedPreflight: true,
          sawScriptPostIntent: true
        });

      if (!inspectableBackendOrigin) {
        return;
      }

      await expect
        .poll(async () => {
          const requests = await readBrowserSmokeRequestLog(inspectableBackendOrigin);
          const matchingRequests = requests.filter(
            (entry) => entry.pathname === '/events' && entry.origin === frontendOrigin
          );

          return {
            preflight: matchingRequests.find(
              (entry) => entry.method === 'OPTIONS' && entry.accessControlRequestMethod === 'POST'
            ) ?? null,
            sawPost: matchingRequests.some((entry) => entry.method === 'POST')
          };
        })
        .toEqual({
          preflight: {
            method: 'OPTIONS',
            pathname: '/events',
            origin: frontendOrigin,
            accessControlRequestMethod: 'POST'
          },
          sawPost: false
        });
    } finally {
      await observedAttempt.dispose();
    }
  });

  for (const shell of SHELLS) {
    test(`keeps the world diagonally draggable on the ${shell.name} shell`, async ({ page }) => {
      await page.setViewportSize(shell.viewport);
      await page.goto('/');
      await expectCanvasDragMovesViewport(page);
    });
  }

  for (const shell of SHELLS) {
    test(`keeps minimum-zoom viewport bounds inside the clamp padding budget on the ${shell.name} shell`, async ({ page }) => {
      await page.setViewportSize(shell.viewport);
      await page.goto('/');
      await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
      await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));
      await zoomViewportOutToMinimum(page);

      const state = await readViewportState(page);
      expect(state).not.toBeNull();
      expect(state!.screenWorldWidth).toBeGreaterThanOrEqual(state!.screenWidth);
      expect(state!.screenWorldHeight).toBeGreaterThanOrEqual(state!.screenHeight);
      expectViewportBoundsWithinClampBudget(state!);
    });
  }

  for (const shell of SHELLS) {
    test(`still keeps meaningful two-axis drag room at minimum zoom on the ${shell.name} shell`, async ({ page }) => {
      await page.setViewportSize(shell.viewport);
      await page.goto('/');
      await expectMinimumZoomKeepsTwoAxisPanRoom(page);
    });
  }

  for (const shell of SHELLS) {
    test(`keeps the default initial viewport directly reachable to the right and bottom edges without zooming first on the ${shell.name} shell`, async ({ page }) => {
      if (shell.name === 'landscape') {
        test.slow();
      }

      await page.setViewportSize(shell.viewport);
      await page.goto('/');
      await expectDefaultViewportKeepsDirectEdgeReachability(page);
    });
  }

  test('keeps selected-agent hub overlay clamp padding active at the top-right viewport boundary after resetting from a zoomed-in view', async ({ page }) => {
    await page.goto('/');
    await zoomViewportInWithMouseWheel(page);
    await page.getByRole('button', { name: 'Open Hub' }).click();
    await page.getByRole('button', { name: 'Inspect Growth Revenue Agent', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();

    await zoomViewportOutToMinimum(page);

    await expect
      .poll(async () => {
        const state = await readViewportState(page);

        return state ? Math.abs(state.scale - state.minScale) <= 0.0001 : false;
      })
      .toBe(true);

    await forceViewportAgainstTopRightClamp(page);

    await expect
      .poll(async () => {
        const viewport = await readViewportState(page);
        if (!viewport) {
          return false;
        }

        const scale = viewport.scale ?? 1;
        const epsilon = 0.5;
        const rightAllowance = (viewport.clampPadding?.right ?? 0) / scale;
        const topAllowance = (viewport.clampPadding?.top ?? 0) / scale;

        return (
          (viewport.clampPadding?.right ?? 0) >= 300 &&
          viewport.right <= viewport.worldWidth + rightAllowance + epsilon &&
          viewport.top >= -(topAllowance + epsilon)
        );
      })
      .toBe(true);
  });

  test('leaves browser-native pinch zoom available without zooming the canvas viewport', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP pinch synthesis is Chromium-only');

    await installObservedWheelGestureCapture(page);
    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    const beforeScale = await readViewportScale(page);
    const beforeBrowserZoom = await readBrowserZoomState(page);
    expect(beforeScale).not.toBeNull();
    const pinchScaleFactor = 1.25;

    await synthesizePinchGesture(page, pinchScaleFactor, 'mouse');

    const zoomedBrowserZoom = await waitForBrowserZoomChange(page, beforeBrowserZoom);
    const zoomedViewportScale = await expectViewportScaleRemainsUnchanged(page, beforeScale!);
    const zoomInWheelGestureCount = (await readObservedWheelGestures(page)).filter(
      (gesture) =>
        gesture.phase === 'after-dispatch' &&
        gesture.target === 'world-host' &&
        gesture.ctrlKey &&
        !gesture.defaultPrevented &&
        gesture.deltaMode === 0 &&
        Math.abs(gesture.deltaY) < 24
    ).length;

    expect(zoomedViewportScale).toBe(beforeScale);
    expect(didBrowserZoomChange(beforeBrowserZoom, zoomedBrowserZoom)).toBe(true);
    expect(zoomInWheelGestureCount).toBeGreaterThan(0);

    await synthesizePinchGesture(page, 1 / pinchScaleFactor, 'mouse');

    const restoredBrowserZoom = await waitForBrowserZoomChange(page, zoomedBrowserZoom);
    const restoredViewportScale = await expectViewportScaleRemainsUnchanged(page, beforeScale!);
    const worldHostWheelGestures = (await readObservedWheelGestures(page)).filter(
      (gesture) =>
        gesture.phase === 'after-dispatch' &&
        gesture.target === 'world-host' &&
        gesture.ctrlKey &&
        !gesture.defaultPrevented &&
        gesture.deltaMode === 0 &&
        Math.abs(gesture.deltaY) < 24
    );

    expect(restoredViewportScale).toBe(beforeScale);
    expect(didBrowserZoomChange(zoomedBrowserZoom, restoredBrowserZoom)).toBe(true);
    expectBrowserZoomStateMatchesBaseline(
      restoredBrowserZoom,
      beforeBrowserZoom,
      'browser zoom did not settle back to its baseline after the reverse pinch'
    );
    expect(worldHostWheelGestures.length).toBeGreaterThan(zoomInWheelGestureCount);
  });

  test('does not intercept ctrl-wheel over the canvas host and leaves the canvas viewport unchanged', async ({
    page,
    browserName
  }) => {
    test.skip(browserName !== 'chromium', 'ctrl-wheel host non-interception proof is currently pinned to Chromium smoke coverage');

    await installObservedWheelGestureCapture(page);
    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    const beforeScale = await readViewportScale(page);
    expect(beforeScale).not.toBeNull();

    await dispatchChromiumCtrlMouseWheel(page, -120);
    const zoomInViewportScale = await expectViewportScaleRemainsUnchanged(page, beforeScale!);
    const zoomInWorldHostCtrlWheelGestures = (await readObservedWheelGestures(page)).filter(
      (gesture) =>
        gesture.phase === 'after-dispatch' &&
        gesture.target === 'world-host' &&
        gesture.ctrlKey &&
        !gesture.defaultPrevented &&
        gesture.deltaMode === 0 &&
        gesture.deltaY < 0
    );

    expect(zoomInViewportScale).toBe(beforeScale);
    expect(zoomInWorldHostCtrlWheelGestures.length).toBeGreaterThan(0);

    await dispatchChromiumCtrlMouseWheel(page, 120);
    const restoredViewportScale = await expectViewportScaleRemainsUnchanged(page, beforeScale!);
    const worldHostCtrlWheelGestures = (await readObservedWheelGestures(page)).filter(
      (gesture) =>
        gesture.phase === 'after-dispatch' &&
        gesture.target === 'world-host' &&
        gesture.ctrlKey &&
        !gesture.defaultPrevented &&
        gesture.deltaMode === 0
    );

    expect(restoredViewportScale).toBe(beforeScale);
    expect(worldHostCtrlWheelGestures.some((gesture) => gesture.deltaY < 0)).toBe(true);
    expect(worldHostCtrlWheelGestures.some((gesture) => gesture.deltaY > 0)).toBe(true);
  });

  test('does not intercept touch pinch gestures or move the canvas viewport', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP pinch synthesis is Chromium-only');

    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));
    await installPinchTelemetry(page);

    const beforePose = await readViewportPose(page);
    expect(beforePose).not.toBeNull();

    await synthesizePinchGesture(page);

    await expect
      .poll(async () => {
        const afterPose = await readViewportPose(page);
        const telemetry = await readPinchTelemetry(page);

        return {
          x: afterPose?.x ?? null,
          y: afterPose?.y ?? null,
          scale: afterPose?.scale ?? null,
          preventedPointerMoves: telemetry.filter(
            (entry) => entry.type === 'pointermove' && entry.pointerType === 'touch' && entry.defaultPrevented
          ).length,
          preventedTouchMoves: telemetry.filter(
            (entry) => entry.type === 'touchmove' && entry.defaultPrevented
          ).length
        };
      })
      .toEqual({
        x: beforePose!.x,
        y: beforePose!.y,
        scale: beforePose!.scale,
        preventedPointerMoves: 0,
        preventedTouchMoves: 0
      });
  });

  test('does not register gesture event listeners on the canvas host path', async ({ page }) => {
    await page.addInitScript(() => {
      const originalAddEventListener = EventTarget.prototype.addEventListener;
      const gestureRegistrations: Array<{ type: string; target: string }> = [];

      const describeTarget = (target: EventTarget) => {
        if (target === window) return 'window';
        if (target === document) return 'document';
        if (target instanceof HTMLCanvasElement) return 'canvas';
        if (target instanceof HTMLElement) {
          return target.classList.contains('aitown-world__host')
            ? 'aitown-world__host'
            : `${target.tagName.toLowerCase()}.${target.className}`;
        }
        return Object.prototype.toString.call(target);
      };

      EventTarget.prototype.addEventListener = function patchedAddEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | AddEventListenerOptions
      ) {
        if (type === 'gesturestart' || type === 'gesturechange' || type === 'gestureend') {
          gestureRegistrations.push({ type, target: describeTarget(this) });
        }
        return originalAddEventListener.call(this, type, listener, options);
      };

      (window as typeof window & { __AITOWN_GESTURE_LISTENERS__?: Array<{ type: string; target: string }> }).__AITOWN_GESTURE_LISTENERS__ = gestureRegistrations;
    });

    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();

    const listeners = await page.evaluate(() => {
      return (window as typeof window & { __AITOWN_GESTURE_LISTENERS__?: Array<{ type: string; target: string }> }).__AITOWN_GESTURE_LISTENERS__ ?? [];
    });

    expect(listeners.filter((entry) => entry.target === 'aitown-world__host' || entry.target === 'canvas')).toEqual([]);
  });
});
