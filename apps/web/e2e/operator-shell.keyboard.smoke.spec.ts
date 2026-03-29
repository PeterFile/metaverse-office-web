import { expect, test, type ConsoleMessage, type Locator, type Page, type Request, type Route } from '@playwright/test';

import {
  resolveBrowserSmokeReadTargetOrigin,
  resolveBrowserSmokeWriteTargetOrigin
} from '../scripts/run-browser-smoke.mjs';
import { resolveViewportEdgeDragDelta } from '../scripts/viewport-reachability';
import { findStableSample, requireStableSample } from '../scripts/stability';

const POLL_DRIVEN_ASSERTION_TIMEOUT_MS = 12_000;

async function readViewportState(page: Page) {
  return page.evaluate(() => window.__AITOWN_VIEWPORT__?.read() ?? null);
}

async function focusHubControlWithTab(page: Page, locator: Locator, accessibleName: string, maxTabs = 96) {
  await expect(locator).toBeVisible();

  for (let step = 0; step < maxTabs; step += 1) {
    if (await locator.evaluate((element) => element === document.activeElement)) {
      return;
    }

    await page.keyboard.press('Tab');
  }

  throw new Error(`could not focus ${accessibleName} with Tab within ${maxTabs} steps`);
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

async function enableScenario(
  page: Page,
  scenario:
    | 'degraded-refresh'
    | 'selected-operation-refresh-failure'
    | 'selected-operation-queue-drop'
    | 'stale-selection-404'
) {
  const runId = `${scenario}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await page.evaluate(
    ({ nextScenario, nextRunId }) => {
      document.cookie = `browser_smoke_mode=${encodeURIComponent(nextScenario)}; path=/`;
      document.cookie = `browser_smoke_run=${encodeURIComponent(nextRunId)}; path=/`;
    },
    { nextScenario: scenario, nextRunId: runId }
  );
}

function resolveInspectableBrowserSmokeBackendOrigin() {
  return resolveBrowserSmokeReadTargetOrigin(process.env);
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

test.describe('operator shell smoke', () => {
  test('renders the default shell with operator-shell framing and allows roster-driven selection through the Hub overlay', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Metaverse Office operator shell')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Metaverse Office' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Office world' })).toBeVisible();
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
    await expect(detailsPanel.locator('.aitown-details__head').getByText('Prepare handoff notes', { exact: true })).toBeVisible();
    await expect(detailsPanel.getByText('meeting-zone', { exact: true })).toBeVisible();
    await expect(workflowSection.getByText('No open watch alerts.')).toBeVisible();
    const handoffIncidentRecord = incidentSection.getByText('Lead completed the revenue handoff').locator('..');
    await expect(handoffIncidentRecord.getByText('Lead completed the revenue handoff')).toBeVisible();
    await expect(handoffIncidentRecord.getByText('Incident · handoff · completed')).toBeVisible();
    await expect(handoffIncidentRecord.getByText('Severity · Yellow')).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();

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
    const lastDialogButton = dialog.getByRole('button').last();

    await expect(dialog).toBeVisible();
    await expect(closeButton).toBeFocused();
    await expect(lastDialogButton).toBeVisible();

    await page.keyboard.press('Shift+Tab');
    await expect(lastDialogButton).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(closeButton).toBeFocused();
  });

  test('opens agent detail and correlation drilldown from the crew-overview active queue via keyboard traversal', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const dialog = page.getByRole('dialog', { name: 'Hub' });
    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const queueButton = detailsPanel.getByRole('button', {
      name: 'Inspect Growth Revenue Agent from active queue'
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const runContextSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Run Context' })
    });

    await expect(dialog).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Active Queue' })).toBeVisible();
    await focusHubControlWithTab(page, queueButton, 'Inspect Growth Revenue Agent from active queue');
    await expect(queueButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(detailsPanel.getByRole('button', { name: 'Clear' })).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Run Context' })).toBeVisible();
    await expect(runContextSection.getByText(/Run blocker ·/)).toBeVisible();
    await expect(runContextSection.getByText(/Latest event type ·/)).toBeVisible();
    await expect(runContextSection.getByText(/Last heartbeat ·/)).toBeVisible();
    await expect(runContextSection.getByText(/Staleness ·/)).toBeVisible();
    await expect(runContextSection.getByText(/Reboot recommendation ·/)).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
  });

  test('opens a crew-overview active-queue correlation drilldown via keyboard traversal without selecting an agent', async ({
    page
  }) => {
    await page.route('**/office/operations?limit=4', async (route) => {
      const response = await route.fetch();
      const operations = (await response.json()) as {
        items: Array<{
          agent_id: string;
          correlation_id: string | null;
        }>;
      };

      await route.fulfill({
        response,
        json: {
          ...operations,
          items: operations.items.map((item) =>
            item.agent_id === 'team-lead'
              ? {
                  ...item,
                  correlation_id: 'corr-growth-lead-review'
                }
              : item
          )
        }
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const activeQueueCorrelationButton = detailsPanel.getByRole('button', {
      name: 'Open active queue correlation corr-growth-lead-review'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await focusHubControlWithTab(
      page,
      activeQueueCorrelationButton,
      'Open active queue correlation corr-growth-lead-review'
    );
    await expect(activeQueueCorrelationButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(detailsPanel.getByRole('button', { name: 'Clear' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 1 interactions · 2 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toHaveCount(0);
  });

  test('opens a current-operation counterparty pivot from the selected-agent Hub via keyboard traversal', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const clearButton = detailsPanel.getByRole('button', { name: 'Clear' });
    const queueButton = detailsPanel.getByRole('button', {
      name: 'Inspect Growth Revenue Agent from active queue'
    });

    await focusHubControlWithTab(page, queueButton, 'Inspect Growth Revenue Agent from active queue');
    await expect(queueButton).toBeFocused();
    await page.keyboard.press('Enter');

    const operationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Current Operation' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const operationCounterpartyButton = operationSection.getByRole('button', {
      name: 'Select operation counterparty agent app-engineering'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(operationCounterpartyButton).toBeVisible();
    await focusHubControlWithTab(page, operationCounterpartyButton, 'Select operation counterparty agent app-engineering');
    await expect(operationCounterpartyButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
  });

  test('jumps from audit-signal artifacts into the shared-memory record via keyboard traversal', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const queueButton = detailsPanel.getByRole('button', {
      name: 'Inspect App Engineering Agent',
      exact: true
    });

    await focusHubControlWithTab(page, queueButton, 'Inspect App Engineering Agent');
    await expect(queueButton).toBeFocused();
    await page.keyboard.press('Enter');

    const auditSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Audit Signals' })
    });
    const artifactJumpButton = auditSection.getByRole('button', {
      name: 'Jump to shared memory artifact /tmp/revenue-handoff.md'
    });
    const focusedSharedMemoryRecord = detailsPanel.locator('li[data-shared-memory-target]:focus');

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(artifactJumpButton).toBeVisible();
    await focusHubControlWithTab(page, artifactJumpButton, 'Jump to shared memory artifact /tmp/revenue-handoff.md');
    await expect(artifactJumpButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(focusedSharedMemoryRecord).toHaveCount(1);
    await expect(focusedSharedMemoryRecord).toContainText('Ref · /tmp/revenue-handoff.md');
  });

  test('jumps from audit-signal accountability evidence refs into the shared-memory record via keyboard traversal', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const queueButton = detailsPanel.getByRole('button', {
      name: 'Inspect App Engineering Agent',
      exact: true
    });

    await focusHubControlWithTab(page, queueButton, 'Inspect App Engineering Agent');
    await expect(queueButton).toBeFocused();
    await page.keyboard.press('Enter');

    const auditSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Audit Signals' })
    });
    const evidenceJumpButton = auditSection.getByRole('button', {
      name: 'Jump to accountability evidence ref /tmp/revenue-handoff.md'
    });
    const focusedSharedMemoryRecord = detailsPanel.locator('li[data-shared-memory-target]:focus');

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(evidenceJumpButton).toBeVisible();
    await focusHubControlWithTab(page, evidenceJumpButton, 'Jump to accountability evidence ref /tmp/revenue-handoff.md');
    await expect(evidenceJumpButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(focusedSharedMemoryRecord).toHaveCount(1);
    await expect(focusedSharedMemoryRecord).toContainText('Ref · /tmp/revenue-handoff.md');
  });

  test('jumps from collector observation evidence refs into the shared-memory record via keyboard traversal', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const queueButton = detailsPanel.getByRole('button', {
      name: 'Inspect App Engineering Agent',
      exact: true
    });

    await focusHubControlWithTab(page, queueButton, 'Inspect App Engineering Agent');
    await expect(queueButton).toBeFocused();
    await page.keyboard.press('Enter');

    const collectorObservationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Collector Observation' })
    });
    const evidenceJumpButton = collectorObservationSection.getByRole('button', {
      name: 'Jump to collector evidence ref /tmp/revenue-handoff.md'
    });
    const focusedSharedMemoryRecord = detailsPanel.locator('li[data-shared-memory-target]:focus');

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(evidenceJumpButton).toBeVisible();
    await focusHubControlWithTab(page, evidenceJumpButton, 'Jump to collector evidence ref /tmp/revenue-handoff.md');
    await expect(evidenceJumpButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(focusedSharedMemoryRecord).toHaveCount(1);
    await expect(focusedSharedMemoryRecord).toContainText('Ref · /tmp/revenue-handoff.md');
  });

  test('carries the crew-overview incident correlation into a selected-agent pivot via keyboard traversal', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const clearButton = detailsPanel.getByRole('button', { name: 'Clear' });
    const incidentSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Incident Feed' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const incidentAgentButton = incidentSection.getByRole('button', {
      name: 'Select incident agent growth-revenue from incident evt_revenue_handoff_completed'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await focusHubControlWithTab(
      page,
      incidentAgentButton,
      'Select incident agent growth-revenue from incident evt_revenue_handoff_completed'
    );
    await expect(incidentAgentButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Workflow' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
  });

  test('keeps the active crew-overview correlation when opening an office-grid home-agent pivot via keyboard traversal', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const clearButton = detailsPanel.getByRole('button', { name: 'Clear' });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const homeAgentButton = detailsPanel.getByRole('button', {
      name: 'Select home agent Team Lead in Team Lead Desk'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await focusHubControlWithTab(page, homeAgentButton, 'Select home agent Team Lead in Team Lead Desk');
    await expect(homeAgentButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Team Lead' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
  });

  test('keeps the active crew-overview correlation when opening a watch-topology endpoint pivot via keyboard traversal', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const clearButton = detailsPanel.getByRole('button', { name: 'Clear' });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const topologyPivotButton = detailsPanel.getByRole('button', {
      name: 'Select watch topology source agent from lead edge team-lead app-engineering'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await focusHubControlWithTab(
      page,
      topologyPivotButton,
      'Select watch topology source agent from lead edge team-lead app-engineering'
    );
    await expect(topologyPivotButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Team Lead' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
  });

  test('opens an incident correlation drilldown from the selected-agent Hub via keyboard traversal', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const dialog = page.getByRole('dialog', { name: 'Hub' });
    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const clearButton = detailsPanel.getByRole('button', { name: 'Clear' });
    const inspectButton = detailsPanel.getByRole('button', {
      name: 'Inspect Growth Revenue Agent',
      exact: true
    });

    await expect(dialog).toBeVisible();
    await focusHubControlWithTab(page, inspectButton, 'Inspect Growth Revenue Agent');
    await expect(inspectButton).toBeFocused();
    await page.keyboard.press('Enter');

    const incidentSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Incident Feed' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const incidentCorrelationButton = incidentSection.getByRole('button', {
      name: 'Open incident correlation corr-revenue-handoff'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 1 interactions · 2 events')).toBeVisible();

    await focusHubControlWithTab(page, incidentCorrelationButton, 'Open incident correlation corr-revenue-handoff');
    await expect(incidentCorrelationButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
  });

  test('keeps the active correlation when opening a correlation incident actor pivot via keyboard traversal', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const clearButton = detailsPanel.getByRole('button', { name: 'Clear' });
    const inspectButton = detailsPanel.getByRole('button', {
      name: 'Inspect Growth Revenue Agent',
      exact: true
    });

    await focusHubControlWithTab(page, inspectButton, 'Inspect Growth Revenue Agent');
    await expect(inspectButton).toBeFocused();
    await page.keyboard.press('Enter');

    const incidentSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Incident Feed' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const incidentCorrelationButton = incidentSection.getByRole('button', {
      name: 'Open incident correlation corr-revenue-handoff'
    });
    const incidentActorButton = correlationSection.getByRole('button', {
      name: 'Select correlation incident actor from incident evt_revenue_handoff_completed team-lead'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();

    await focusHubControlWithTab(page, incidentCorrelationButton, 'Open incident correlation corr-revenue-handoff');
    await expect(incidentCorrelationButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();

    await focusHubControlWithTab(
      page,
      incidentActorButton,
      'Select correlation incident actor from incident evt_revenue_handoff_completed team-lead'
    );
    await expect(incidentActorButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Team Lead' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
  });

  test('keeps the active correlation when opening a correlation timeline actor pivot via keyboard traversal', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const clearButton = detailsPanel.getByRole('button', { name: 'Clear' });
    const inspectButton = detailsPanel.getByRole('button', {
      name: 'Inspect Growth Revenue Agent',
      exact: true
    });

    await focusHubControlWithTab(page, inspectButton, 'Inspect Growth Revenue Agent');
    await expect(inspectButton).toBeFocused();
    await page.keyboard.press('Enter');

    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const timelineActorButton = correlationSection.getByRole('button', {
      name: 'Select correlation timeline actor from event evt_growth_review_started team-lead'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 1 interactions · 2 events')).toBeVisible();

    await focusHubControlWithTab(
      page,
      timelineActorButton,
      'Select correlation timeline actor from event evt_growth_review_started team-lead'
    );
    await expect(timelineActorButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Team Lead' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 1 interactions · 2 events')).toBeVisible();
  });

  test('keeps the active replay correlation when opening a replay actor pivot via keyboard traversal', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const clearButton = detailsPanel.getByRole('button', { name: 'Clear' });
    const replaySection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Timeline Replay' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const replayRecord = replaySection.locator('li').filter({
      has: page.getByText('Lead started reviewing the growth handoff notes', { exact: true })
    });
    const replayCorrelationButton = replayRecord.getByRole('button', {
      name: 'Open replay correlation corr-growth-lead-review'
    });
    const replayActorButton = replayRecord.getByRole('button', {
      name: 'Select replay actor from event evt_growth_review_started team-lead'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();

    await focusHubControlWithTab(page, replayCorrelationButton, 'Open replay correlation corr-growth-lead-review');
    await expect(replayCorrelationButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 1 interactions · 2 events')).toBeVisible();

    await focusHubControlWithTab(
      page,
      replayActorButton,
      'Select replay actor from event evt_growth_review_started team-lead'
    );
    await expect(replayActorButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Team Lead' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 1 interactions · 2 events')).toBeVisible();
  });

  test('keeps the active replay correlation when opening a replay counterparty pivot via keyboard traversal', async ({
    page
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const clearButton = detailsPanel.getByRole('button', { name: 'Clear' });
    const replaySection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Timeline Replay' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const replayRecord = replaySection.locator('li').filter({
      has: page.getByText('Lead started reviewing the growth handoff notes', { exact: true })
    });
    const replayCorrelationButton = replayRecord.getByRole('button', {
      name: 'Open replay correlation corr-growth-lead-review'
    });
    const replayCounterpartyButton = replayRecord.getByRole('button', {
      name: 'Select replay counterparty from event evt_growth_review_started team-lead'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();

    await focusHubControlWithTab(page, replayCorrelationButton, 'Open replay correlation corr-growth-lead-review');
    await expect(replayCorrelationButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 1 interactions · 2 events')).toBeVisible();

    await focusHubControlWithTab(
      page,
      replayCounterpartyButton,
      'Select replay counterparty from event evt_growth_review_started team-lead'
    );
    await expect(replayCounterpartyButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Team Lead' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 1 interactions · 2 events')).toBeVisible();
  });

  test('keeps the clicked selected-agent incident correlation when opening an incident counterparty pivot via keyboard traversal', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const clearButton = detailsPanel.getByRole('button', { name: 'Clear' });
    const inspectButton = detailsPanel.getByRole('button', {
      name: 'Inspect Growth Revenue Agent',
      exact: true
    });

    await focusHubControlWithTab(page, inspectButton, 'Inspect Growth Revenue Agent');
    await expect(inspectButton).toBeFocused();
    await page.keyboard.press('Enter');

    const incidentSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Incident Feed' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const incidentCounterpartyButton = incidentSection.getByRole('button', {
      name: 'Select incident feed counterparty agent from incident evt_revenue_handoff_completed app-engineering'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();

    await focusHubControlWithTab(
      page,
      incidentCounterpartyButton,
      'Select incident feed counterparty agent from incident evt_revenue_handoff_completed app-engineering'
    );
    await expect(incidentCounterpartyButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
  });

  test('keeps the clicked selected-agent incident correlation when opening an incident actor pivot via keyboard traversal', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const clearButton = detailsPanel.getByRole('button', { name: 'Clear' });
    const inspectButton = detailsPanel.getByRole('button', {
      name: 'Inspect Growth Revenue Agent',
      exact: true
    });

    await focusHubControlWithTab(page, inspectButton, 'Inspect Growth Revenue Agent');
    await expect(inspectButton).toBeFocused();
    await page.keyboard.press('Enter');

    const incidentSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Incident Feed' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const incidentActorButton = incidentSection.getByRole('button', {
      name: 'Select incident feed actor from incident evt_revenue_handoff_completed team-lead'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();

    await focusHubControlWithTab(
      page,
      incidentActorButton,
      'Select incident feed actor from incident evt_revenue_handoff_completed team-lead'
    );
    await expect(incidentActorButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Team Lead' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
  });

  test(
    'keeps an explicitly selected incident correlation instead of snapping back to the workflow default after a later workflow refresh',
    async ({ page }) => {
      test.setTimeout(45_000);
      await installFastPollInterval(page);

      let workflowResponses = 0;
      const workflowRoutePattern = '**/agents/growth-revenue/workflow?limit=10&window=60m';
      let releaseDelayedRefresh: (() => void) | null = null;
      const delayedRefreshReady = new Promise<void>((resolve) => {
        releaseDelayedRefresh = resolve;
      });
      const refreshedActiveTask = 'Prepare handoff notes (verified refresh)';
      const handleWorkflowRoute = async (route: Route) => {
        workflowResponses += 1;
        if (workflowResponses > 2) {
          await route.continue();
          return;
        }

        const response = await route.fetch();
        const workflow = (await response.json()) as {
          detail: {
            active_task: string;
          };
        };

        if (workflowResponses === 1) {
          await route.fulfill({ response, json: workflow });
          return;
        }

        await delayedRefreshReady;
        await route.fulfill({
          response,
          json: {
            ...workflow,
            detail: {
              ...workflow.detail,
              active_task: refreshedActiveTask
            }
          }
        });
      };
      await page.route(workflowRoutePattern, handleWorkflowRoute);

      try {
        await page.goto('/');
        await page.getByRole('button', { name: 'Open Hub' }).click();

        const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
        const incidentSection = detailsPanel.locator('section').filter({
          has: page.getByRole('heading', { name: 'Incident Feed' })
        });
        const correlationSection = detailsPanel.locator('section').filter({
          has: page.getByRole('heading', { name: 'Correlation Drilldown' })
        });
        const selectedIncidentCorrelationButton = incidentSection.getByRole('button', {
          name: 'Open incident correlation corr-revenue-handoff, currently selected'
        });

        await detailsPanel.getByRole('button', { name: 'Inspect Growth Revenue Agent', exact: true }).click();

        await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
        await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();

        await incidentSection.getByRole('button', { name: 'Open incident correlation corr-revenue-handoff' }).click();

        await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
        await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
        await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
        await expect(selectedIncidentCorrelationButton).toBeVisible();

        const refreshResponse = page.waitForResponse(
          (response) =>
            response.request().method() === 'GET' &&
            response.status() === 200 &&
            response.url().includes('/agents/growth-revenue/workflow?limit=10&window=60m')
        );
        releaseDelayedRefresh?.();
        await refreshResponse;
        await expect
          .poll(() => workflowResponses, {
            timeout: POLL_DRIVEN_ASSERTION_TIMEOUT_MS
          })
          .toBeGreaterThan(1);

        await expect(detailsPanel.getByText(refreshedActiveTask)).toBeVisible();
        await expect(selectedIncidentCorrelationButton).toBeVisible();
        await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
        await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
        await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
      } finally {
        releaseDelayedRefresh?.();
        await page.unroute(workflowRoutePattern, handleWorkflowRoute);
      }
    }
  );

  test('opens a workflow correlation pivot from the selected-agent Hub via keyboard traversal', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const clearButton = detailsPanel.getByRole('button', { name: 'Clear' });
    const inspectButton = detailsPanel.getByRole('button', {
      name: 'Inspect Growth Revenue Agent',
      exact: true
    });

    await focusHubControlWithTab(page, inspectButton, 'Inspect Growth Revenue Agent');
    await expect(inspectButton).toBeFocused();
    await page.keyboard.press('Enter');

    const workflowSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Workflow' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const workflowCorrelationButton = workflowSection.getByRole('button', {
      name: 'Open workflow correlation corr-revenue-handoff'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await focusHubControlWithTab(page, workflowCorrelationButton, 'Open workflow correlation corr-revenue-handoff');
    await expect(workflowCorrelationButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
  });

  test('opens a workflow interaction correlation pivot from the selected-agent Hub via keyboard traversal', async ({
    page
  }) => {
    await page.route('**/agents/growth-revenue/workflow?limit=10&window=60m', async (route) => {
      const response = await route.fetch();
      const workflow = (await response.json()) as {
        detail: {
          recent_interactions?: unknown[];
        };
      };

      await route.fulfill({
        response,
        json: {
          ...workflow,
          detail: {
            ...workflow.detail,
            recent_interactions: [
              {
                interaction_id: 'interaction-browser-workflow-correlation',
                interaction_type: 'handoff',
                correlation_id: 'corr-revenue-handoff',
                started_at: '2026-03-10T23:35:00.000Z',
                ended_at: '2026-03-10T23:40:00.000Z',
                participant_agent_ids: ['growth-revenue', 'app-engineering'],
                trigger_event_id: 'evt_revenue_handoff_completed',
                before_state: 'reviewing',
                after_state: 'planning',
                severity: 'yellow',
                evidence_refs: ['/tmp/revenue-handoff.md'],
                summary: 'Workflow interaction pivot opens the revenue handoff correlation',
                related_event_ids: ['evt_revenue_handoff_completed']
              },
              ...(workflow.detail.recent_interactions ?? [])
            ]
          }
        }
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const inspectButton = detailsPanel.getByRole('button', {
      name: 'Inspect Growth Revenue Agent',
      exact: true
    });
    const workflowSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Workflow' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });

    await focusHubControlWithTab(page, inspectButton, 'Inspect Growth Revenue Agent');
    await expect(inspectButton).toBeFocused();
    await page.keyboard.press('Enter');

    const workflowInteractionCorrelationButton = workflowSection.getByRole('button', {
      name: 'Open workflow interaction correlation from interaction interaction-browser-workflow-correlation corr-revenue-handoff'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await focusHubControlWithTab(
      page,
      workflowInteractionCorrelationButton,
      'Open workflow interaction correlation from interaction interaction-browser-workflow-correlation corr-revenue-handoff'
    );
    await expect(workflowInteractionCorrelationButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
  });

  test('keeps the active workflow correlation when opening a workflow counterparty pivot via keyboard traversal', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const clearButton = detailsPanel.getByRole('button', { name: 'Clear' });
    const inspectButton = detailsPanel.getByRole('button', {
      name: 'Inspect Growth Revenue Agent',
      exact: true
    });

    await focusHubControlWithTab(page, inspectButton, 'Inspect Growth Revenue Agent');
    await expect(inspectButton).toBeFocused();
    await page.keyboard.press('Enter');

    const workflowSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Workflow' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const workflowCorrelationButton = workflowSection.getByRole('button', {
      name: 'Open workflow correlation corr-revenue-handoff'
    });
    const workflowCounterpartyButton = workflowSection.getByRole('button', {
      name: 'Select workflow counterparty agent app-engineering'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await focusHubControlWithTab(page, workflowCorrelationButton, 'Open workflow correlation corr-revenue-handoff');
    await expect(workflowCorrelationButton).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();

    await focusHubControlWithTab(page, workflowCounterpartyButton, 'Select workflow counterparty agent app-engineering');
    await expect(workflowCounterpartyButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
  });

  test('keeps the active workflow correlation when opening a workflow status actor pivot via keyboard traversal', async ({
    page
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const clearButton = detailsPanel.getByRole('button', { name: 'Clear' });
    const inspectButton = detailsPanel.getByRole('button', {
      name: 'Inspect Growth Revenue Agent',
      exact: true
    });

    await focusHubControlWithTab(page, inspectButton, 'Inspect Growth Revenue Agent');
    await expect(inspectButton).toBeFocused();
    await page.keyboard.press('Enter');

    const workflowSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Workflow' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const workflowStatusActorButton = workflowSection.getByRole('button', {
      name: 'Select workflow status actor from handoff evt_revenue_handoff_completed team-lead'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await focusHubControlWithTab(
      page,
      workflowStatusActorButton,
      'Select workflow status actor from handoff evt_revenue_handoff_completed team-lead'
    );
    await expect(workflowStatusActorButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Team Lead' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 1 interactions · 2 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toHaveCount(0);
  });

  test('keeps the active workflow correlation when opening a workflow status counterparty pivot via keyboard traversal', async ({
    page
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const clearButton = detailsPanel.getByRole('button', { name: 'Clear' });
    const inspectButton = detailsPanel.getByRole('button', {
      name: 'Inspect Growth Revenue Agent',
      exact: true
    });

    await focusHubControlWithTab(page, inspectButton, 'Inspect Growth Revenue Agent');
    await expect(inspectButton).toBeFocused();
    await page.keyboard.press('Enter');

    const workflowSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Workflow' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const workflowStatusCounterpartyButton = workflowSection.getByRole('button', {
      name: 'Select workflow status counterparty from handoff evt_revenue_handoff_completed app-engineering'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await focusHubControlWithTab(
      page,
      workflowStatusCounterpartyButton,
      'Select workflow status counterparty from handoff evt_revenue_handoff_completed app-engineering'
    );
    await expect(workflowStatusCounterpartyButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 1 interactions · 2 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toHaveCount(0);
  });

  test('keeps the active workflow correlation when opening a workflow peer-watch observer pivot via keyboard traversal', async ({
    page
  }) => {
    await page.route('**/agents/app-engineering/workflow?limit=10&window=60m', async (route) => {
      const response = await route.fetch();
      const workflow = (await response.json()) as {
        detail: {
          active_task: string;
          open_peer_watch_alerts?: unknown[];
        };
      };

      await route.fulfill({
        response,
        json: {
          ...workflow,
          detail: {
            ...workflow.detail,
            open_peer_watch_alerts: [
              {
                alert_id: 'alert-browser-peer-watch-observer',
                ts: '2026-03-10T23:00:00.000Z',
                agent_id: 'app-engineering',
                target_agent_id: 'app-engineering',
                actor_id: 'team-lead',
                observer_agent_id: 'team-lead',
                watcher_agent_ids: ['growth-revenue'],
                severity: 'orange',
                status: 'open',
                current_state: 'blocked',
                active_task: workflow.detail.active_task,
                summary: 'Revenue handoff is still waiting on app confirmation',
                evidence_refs: ['/tmp/revenue-handoff.md'],
                evidence_count: 1,
                correlation_id: 'corr-app-peer-watch',
                source_kind: 'controller_event',
                metadata: {}
              },
              ...(workflow.detail.open_peer_watch_alerts ?? [])
            ]
          }
        }
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const clearButton = detailsPanel.getByRole('button', { name: 'Clear' });
    const inspectButton = detailsPanel.getByRole('button', {
      name: 'Inspect App Engineering Agent',
      exact: true
    });

    await focusHubControlWithTab(page, inspectButton, 'Inspect App Engineering Agent');
    await expect(inspectButton).toBeFocused();
    await page.keyboard.press('Enter');

    const workflowSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Workflow' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const workflowCorrelationButton = workflowSection.getByRole('button', {
      name: 'Open workflow correlation collector-snapshot:2026-03-10T23:59:40.000Z'
    });
    const observerButton = workflowSection.getByRole('button', {
      name: 'Select workflow peer-watch observer from alert alert-browser-peer-watch-observer team-lead'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await focusHubControlWithTab(
      page,
      workflowCorrelationButton,
      'Open workflow correlation collector-snapshot:2026-03-10T23:59:40.000Z'
    );
    await expect(workflowCorrelationButton).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(correlationSection.getByText('collector-snapshot:2026-03-10T23:59:40.000Z', { exact: true })).toBeVisible();
    await focusHubControlWithTab(
      page,
      observerButton,
      'Select workflow peer-watch observer from alert alert-browser-peer-watch-observer team-lead'
    );
    await expect(observerButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Team Lead' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('collector-snapshot:2026-03-10T23:59:40.000Z', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('No correlation selected.')).toHaveCount(0);
  });

  test('keeps the active workflow correlation when opening a workflow peer-watch watcher pivot via keyboard traversal', async ({
    page
  }) => {
    await page.route('**/agents/app-engineering/workflow?limit=10&window=60m', async (route) => {
      const response = await route.fetch();
      const workflow = (await response.json()) as {
        detail: {
          active_task: string;
          open_peer_watch_alerts?: unknown[];
        };
      };

      await route.fulfill({
        response,
        json: {
          ...workflow,
          detail: {
            ...workflow.detail,
            open_peer_watch_alerts: [
              {
                alert_id: 'alert-browser-peer-watch-watcher',
                ts: '2026-03-10T23:00:00.000Z',
                agent_id: 'app-engineering',
                target_agent_id: 'app-engineering',
                actor_id: 'team-lead',
                observer_agent_id: 'team-lead',
                watcher_agent_ids: ['growth-revenue'],
                severity: 'orange',
                status: 'open',
                current_state: 'blocked',
                active_task: workflow.detail.active_task,
                summary: 'Revenue handoff is still waiting on app confirmation',
                evidence_refs: ['/tmp/revenue-handoff.md'],
                evidence_count: 1,
                correlation_id: 'corr-app-peer-watch',
                source_kind: 'controller_event',
                metadata: {}
              },
              ...(workflow.detail.open_peer_watch_alerts ?? [])
            ]
          }
        }
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const clearButton = detailsPanel.getByRole('button', { name: 'Clear' });
    const inspectButton = detailsPanel.getByRole('button', {
      name: 'Inspect App Engineering Agent',
      exact: true
    });

    await focusHubControlWithTab(page, inspectButton, 'Inspect App Engineering Agent');
    await expect(inspectButton).toBeFocused();
    await page.keyboard.press('Enter');

    const workflowSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Workflow' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const workflowCorrelationButton = workflowSection.getByRole('button', {
      name: 'Open workflow correlation collector-snapshot:2026-03-10T23:59:40.000Z'
    });
    const watcherButton = workflowSection.getByRole('button', {
      name: 'Select workflow peer-watch watcher from alert alert-browser-peer-watch-watcher growth-revenue'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await focusHubControlWithTab(
      page,
      workflowCorrelationButton,
      'Open workflow correlation collector-snapshot:2026-03-10T23:59:40.000Z'
    );
    await expect(workflowCorrelationButton).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(correlationSection.getByText('collector-snapshot:2026-03-10T23:59:40.000Z', { exact: true })).toBeVisible();
    await focusHubControlWithTab(
      page,
      watcherButton,
      'Select workflow peer-watch watcher from alert alert-browser-peer-watch-watcher growth-revenue'
    );
    await expect(watcherButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('collector-snapshot:2026-03-10T23:59:40.000Z', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('No correlation selected.')).toHaveCount(0);
  });

  test('opens a correlation participant pivot from the selected-agent Hub via keyboard traversal', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const clearButton = detailsPanel.getByRole('button', { name: 'Clear' });
    const inspectButton = detailsPanel.getByRole('button', {
      name: 'Inspect Growth Revenue Agent',
      exact: true
    });

    await focusHubControlWithTab(page, inspectButton, 'Inspect Growth Revenue Agent');
    await expect(inspectButton).toBeFocused();
    await page.keyboard.press('Enter');

    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const correlationParticipantButton = correlationSection.getByRole('button', {
      name: 'Select correlation participant agent team-lead'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await focusHubControlWithTab(page, correlationParticipantButton, 'Select correlation participant agent team-lead');
    await expect(correlationParticipantButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Team Lead' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 1 interactions · 2 events')).toBeVisible();
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
    await detailsPanel.getByRole('button', { name: 'Inspect App Engineering Agent', exact: true }).click();
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

  test('keeps selected-operation details and correlation drilldown visible when only the selected-operation refresh degrades', async ({ page }) => {
    test.setTimeout(45_000);
    await installFastPollInterval(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const operationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Current Operation' })
    });
    const runContextSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Run Context' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });

    await detailsPanel.getByRole('button', { name: 'Inspect Growth Revenue Agent from active queue' }).click();

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(operationSection.getByText('planning · Prepare handoff notes')).toBeVisible();
    await expect(runContextSection.getByText(/Run blocker ·/)).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();

    await enableScenario(page, 'selected-operation-refresh-failure');

    await expect(detailsPanel.getByText('Showing last operation snapshot. operations refresh failed')).toBeVisible({
      timeout: POLL_DRIVEN_ASSERTION_TIMEOUT_MS
    });
    await expect(operationSection.getByText('planning · Prepare handoff notes')).toBeVisible();
    await expect(runContextSection.getByText(/Run blocker ·/)).toBeVisible();
    await expect(runContextSection.getByText(/Last heartbeat ·/)).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 1 interactions · 2 events')).toBeVisible();
    await expect(correlationSection.getByText('Participants · growth-revenue, team-lead')).toHaveCount(2);
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toHaveCount(0);
    await expect(correlationSection.getByText('operations refresh failed')).toHaveCount(0);
    await expect(correlationSection.getByText('correlation refresh failed')).toHaveCount(0);
  });

  test('keeps the last Current Operation visible when the selected operation drops out of the active queue', async ({ page }) => {
    test.setTimeout(45_000);
    await installFastPollInterval(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const operationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Current Operation' })
    });
    const runContextSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Run Context' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });

    await detailsPanel.getByRole('button', { name: 'Inspect Growth Revenue Agent from active queue' }).click();

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(operationSection.getByText('planning · Prepare handoff notes')).toBeVisible();
    await expect(
      operationSection.getByRole('button', { name: 'Open operation correlation corr-revenue-handoff' })
    ).toBeVisible();
    await expect(runContextSection.getByText(/Run blocker ·/)).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();

    await enableScenario(page, 'selected-operation-queue-drop');

    await expect(
      detailsPanel.getByText('Showing last operation snapshot. Operation is no longer in the active queue.')
    ).toBeVisible({
      timeout: POLL_DRIVEN_ASSERTION_TIMEOUT_MS
    });
    await expect(operationSection.getByText('planning · Prepare handoff notes')).toBeVisible();
    await expect(
      operationSection.getByRole('button', { name: 'Open operation correlation corr-revenue-handoff' })
    ).toHaveCount(0);
    await expect(runContextSection.getByText(/Run blocker ·/)).toBeVisible();
    await expect(runContextSection.getByText(/Last heartbeat ·/)).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 1 interactions · 2 events')).toBeVisible();
    await expect(correlationSection.getByText('Participants · growth-revenue, team-lead')).toHaveCount(2);
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toHaveCount(0);
    await expect(correlationSection.getByText('operations refresh failed')).toHaveCount(0);
    await expect(correlationSection.getByText('correlation refresh failed')).toHaveCount(0);
  });

  test('keeps the last overview surface visible while degraded refresh warnings are active', async ({ page }) => {
    test.setTimeout(45_000);
    await installFastPollInterval(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Metaverse Office' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Office world' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Hub' })).toBeVisible();

    await enableScenario(page, 'degraded-refresh');

    await expect(page.getByText('Showing last office snapshot.')).toBeVisible({
      timeout: POLL_DRIVEN_ASSERTION_TIMEOUT_MS
    });
    await expect(page.getByText('overview refresh failed')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Metaverse Office' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Office world' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Hub' })).toBeVisible();
    await expect(page.getByText('Unable to load office overview.')).toHaveCount(0);
  });

  test('routes Hub read models through the managed Vite proxy', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Metaverse Office' })).toBeVisible();

    const frontendOrigin = new URL(page.url()).origin;
    const inspectableBackendOrigin = resolveInspectableBrowserSmokeBackendOrigin();
    const expectedProxyPathnames = [
      '/office/operations',
      '/timeline',
      '/collectors/controller-snapshot',
      '/memory/artifacts'
    ] as const;
    const browserRequests = new Set<string>();
    const handleRequest = (request: Request) => {
      const url = new URL(request.url());
      if (request.method() !== 'GET' || url.origin !== frontendOrigin) {
        return;
      }

      if (expectedProxyPathnames.includes(url.pathname as (typeof expectedProxyPathnames)[number])) {
        browserRequests.add(url.pathname);
      }
    };

    page.on('request', handleRequest);
    await page.getByRole('button', { name: 'Open Hub' }).click();

    try {
      await expect(page.getByRole('dialog', { name: 'Hub' })).toBeVisible();

      await expect
        .poll(() =>
          Object.fromEntries(
            expectedProxyPathnames.map((pathname) => [pathname, browserRequests.has(pathname)])
          )
        )
        .toEqual(
          Object.fromEntries(expectedProxyPathnames.map((pathname) => [pathname, true]))
        );

      if (!inspectableBackendOrigin) {
        return;
      }

      await expect
        .poll(async () => {
          const requests = await readBrowserSmokeRequestLog(inspectableBackendOrigin);
          const proxiedGetPathnames = new Set(
            requests
              .filter((entry) => entry.method === 'GET' && entry.origin === null)
              .map((entry) => entry.pathname)
          );

          return Object.fromEntries(
            expectedProxyPathnames.map((pathname) => [pathname, proxiedGetPathnames.has(pathname)])
          );
        })
        .toEqual(
          Object.fromEntries(expectedProxyPathnames.map((pathname) => [pathname, true]))
        );
    } finally {
      page.off('request', handleRequest);
    }
  });

  test('blocks loopback browser writes against the read-only smoke backend above the helper layer', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Metaverse Office' })).toBeVisible();

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
