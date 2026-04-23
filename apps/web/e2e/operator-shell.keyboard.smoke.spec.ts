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

async function readWorldHostSize(page: Page) {
  return page.locator('.aitown-world__host').evaluate((element) => ({
    width: element.clientWidth,
    height: element.clientHeight
  }));
}

function resolveWorldPointScreenProjection(
  state: NonNullable<Awaited<ReturnType<typeof readViewportState>>>,
  point: { x: number; y: number }
) {
  return {
    x: ((point.x - state.left) / Math.max(state.right - state.left, Number.EPSILON)) * state.screenWidth,
    y: ((point.y - state.top) / Math.max(state.bottom - state.top, Number.EPSILON)) * state.screenHeight
  };
}

function resolveViewportSafeAreaTarget(
  state: NonNullable<Awaited<ReturnType<typeof readViewportState>>>
) {
  const topPadding = state.clampPadding?.top ?? 0;
  const rightPadding = state.clampPadding?.right ?? 0;

  return {
    x: (state.screenWidth - rightPadding) / 2,
    y: topPadding + (state.screenHeight - topPadding) / 2
  };
}

async function focusHubControlWithTab(
  page: Page,
  locator: Locator,
  accessibleName: string,
  options: {
    maxTabs?: number;
    reverse?: boolean;
  } = {}
) {
  const { maxTabs = 128, reverse = false } = options;
  await expect(locator).toBeVisible();

  for (let step = 0; step < maxTabs; step += 1) {
    if (await locator.evaluate((element) => element === document.activeElement)) {
      return;
    }

    await page.keyboard.press(reverse ? 'Shift+Tab' : 'Tab');
  }

  throw new Error(
    `could not focus ${accessibleName} with ${reverse ? 'Shift+Tab' : 'Tab'} within ${maxTabs} steps`
  );
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

function resolveSelectedAgentSupervisionHistoryPath(targetAgentId: string, correlationId?: string) {
  const params = new URLSearchParams();
  params.set('target_agent_id', targetAgentId);
  if (correlationId) {
    params.set('correlation_id', correlationId);
  }
  params.set('limit', '4');
  return `/peer-watch/alerts?${params.toString()}`;
}

const BENIGN_POST_JUMP_REQUESTS = new Set([
  '/office/overview',
  '/incidents?limit=10&window=60m',
  '/collectors/controller-snapshot'
]);

function expectOnlyBenignPostJumpRequests(postJumpRequests: string[], additionalAllowedRequests: string[] = []) {
  const allowedPostJumpRequests = new Set([...BENIGN_POST_JUMP_REQUESTS, ...additionalAllowedRequests]);
  const unexpectedPostJumpRequests = postJumpRequests.filter((url) => !allowedPostJumpRequests.has(url));
  expect(unexpectedPostJumpRequests).toEqual([]);
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

async function zoomViewportInThroughCanvasWheelEvent(page: Page, deltaY = -160) {
  await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

  const beforeScale = await readViewportScale(page);
  expect(beforeScale).not.toBeNull();

  await page.evaluate((wheelDeltaY) => {
    const canvas = document.querySelector('.aitown-world__host canvas');
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('missing world canvas');
    }

    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        composed: true,
        deltaY: wheelDeltaY,
        clientX: rect.left + rect.width * 0.5,
        clientY: rect.top + rect.height * 0.5
      })
    );
  }, deltaY);

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

async function dragViewportThroughHostPointerEvents(page: Page, deltaX: number, deltaY: number) {
  await page.evaluate(
    ({ deltaX: rawDeltaX, deltaY: rawDeltaY }) => {
      const host = document.querySelector('.aitown-world__host');
      if (!(host instanceof HTMLElement)) {
        throw new Error('missing world host');
      }

      const pointerId = 1;
      const rect = host.getBoundingClientRect();
      const startX = rect.left + rect.width * 0.5;
      const startY = rect.top + rect.height * 0.5;
      const steps = 16;
      const originalSetPointerCapture = host.setPointerCapture.bind(host);
      const originalReleasePointerCapture = host.releasePointerCapture.bind(host);
      const originalHasPointerCapture = host.hasPointerCapture.bind(host);
      const capturedPointerIds = new Set<number>();

      host.setPointerCapture = (capturedPointerId: number) => {
        capturedPointerIds.add(capturedPointerId);
      };
      host.releasePointerCapture = (capturedPointerId: number) => {
        capturedPointerIds.delete(capturedPointerId);
      };
      host.hasPointerCapture = (capturedPointerId: number) => capturedPointerIds.has(capturedPointerId);

      const dispatch = (type: string, clientX: number, clientY: number, buttons: number) => {
        host.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            pointerId,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            buttons,
            clientX,
            clientY
          })
        );
      };

      try {
        dispatch('pointerdown', startX, startY, 1);

        for (let step = 1; step <= steps; step += 1) {
          dispatch(
            'pointermove',
            startX + (rawDeltaX * step) / steps,
            startY + (rawDeltaY * step) / steps,
            1
          );
        }

        dispatch('pointerup', startX + rawDeltaX, startY + rawDeltaY, 0);
      } finally {
        host.setPointerCapture = originalSetPointerCapture;
        host.releasePointerCapture = originalReleasePointerCapture;
        host.hasPointerCapture = originalHasPointerCapture;
      }
    },
    { deltaX, deltaY }
  );
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

async function waitForViewportLayoutSettle(page: Page, samples = 12, sampleDelayMs = 50) {
  const states: Array<NonNullable<Awaited<ReturnType<typeof readViewportState>>>> = [];
  const isViewportLayoutStable = (
    previousState: NonNullable<Awaited<ReturnType<typeof readViewportState>>>,
    nextState: NonNullable<Awaited<ReturnType<typeof readViewportState>>>
  ) =>
    Math.abs(nextState.x - previousState.x) <= 0.5 &&
    Math.abs(nextState.y - previousState.y) <= 0.5 &&
    Math.abs(nextState.scale - previousState.scale) <= 0.0001 &&
    nextState.screenWidth === previousState.screenWidth &&
    nextState.screenHeight === previousState.screenHeight &&
    Math.abs((nextState.clampPadding?.top ?? 0) - (previousState.clampPadding?.top ?? 0)) <= 0.5 &&
    Math.abs((nextState.clampPadding?.right ?? 0) - (previousState.clampPadding?.right ?? 0)) <= 0.5;

  for (let sample = 0; sample < samples; sample += 1) {
    const currentState = await readViewportState(page);
    expect(currentState).not.toBeNull();
    states.push(currentState!);

    const stableState = findStableSample(states, isViewportLayoutStable);

    if (stableState) {
      return stableState;
    }

    if (sample < samples - 1) {
      await page.waitForTimeout(sampleDelayMs);
    }
  }

  return requireStableSample(
    states,
    isViewportLayoutStable,
    `viewport layout did not settle after ${samples} samples`,
    (state) => ({
      x: state.x,
      y: state.y,
      scale: state.scale,
      clampPadding: state.clampPadding,
      left: state.left,
      right: state.right,
      top: state.top,
      bottom: state.bottom
    })
  );
}

async function waitForViewportScreenSizeToMatchHost(
  page: Page,
  expectedHostSize: Awaited<ReturnType<typeof readWorldHostSize>>,
  samples = 20,
  sampleDelayMs = 50
) {
  let lastViewport: NonNullable<Awaited<ReturnType<typeof readViewportState>>> | null = null;

  for (let sample = 0; sample < samples; sample += 1) {
    const currentViewport = await readViewportState(page);
    expect(currentViewport).not.toBeNull();
    lastViewport = currentViewport!;

    if (
      lastViewport.screenWidth === expectedHostSize.width &&
      lastViewport.screenHeight === expectedHostSize.height
    ) {
      return lastViewport;
    }

    if (sample < samples - 1) {
      await page.waitForTimeout(sampleDelayMs);
    }
  }

  expect(lastViewport?.screenWidth).toBe(expectedHostSize.width);
  expect(lastViewport?.screenHeight).toBe(expectedHostSize.height);
  return lastViewport!;
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

function isViewportAtRightEdge(
  state: NonNullable<Awaited<ReturnType<typeof waitForViewportSettle>>>
) {
  const scale = state.scale ?? 1;
  const rightAllowance = (state.clampPadding?.right ?? 0) / scale;

  return state.right >= state.worldWidth + rightAllowance - 0.5;
}

function isViewportAtLeftEdge(
  state: NonNullable<Awaited<ReturnType<typeof waitForViewportSettle>>>
) {
  return state.left >= -0.5 && state.left <= 0.5;
}

async function dragViewportToEdge(
  page: Page,
  edge: 'bottom-right' | 'right' | 'top-left',
  options: {
    attempts?: number;
    horizontalOnly?: boolean;
    driver?: 'mouse' | 'synthetic-host-pointer';
  } = {}
) {
  const attempts = options.attempts ?? 2;
  const horizontalOnly = options.horizontalOnly ?? false;
  const driver = options.driver ?? 'mouse';
  const states: Array<NonNullable<Awaited<ReturnType<typeof waitForViewportSettle>>>> = [];
  const isSatisfied =
    edge === 'bottom-right'
      ? isViewportAtBottomRightEdge
      : edge === 'right'
        ? isViewportAtRightEdge
        : horizontalOnly
          ? isViewportAtLeftEdge
          : isViewportAtTopLeftEdge;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const before = await readViewportState(page);
    expect(before).not.toBeNull();

    const { deltaX, deltaY: resolvedDeltaY } = resolveViewportEdgeDragDelta(before!, edge);
    const deltaY = horizontalOnly && edge === 'top-left' ? 0 : resolvedDeltaY;
    if (deltaX === 0 && deltaY === 0) {
      return before!;
    }

    if (driver === 'synthetic-host-pointer') {
      await dragViewportThroughHostPointerEvents(page, deltaX, deltaY);
    } else {
      await dragViewportFromCenter(page, deltaX, deltaY);
    }
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

function expectViewportAtTopLeftClampEdge(
  state: NonNullable<Awaited<ReturnType<typeof waitForViewportSettle>>>,
  expectedScale: number
) {
  expectViewportBoundsWithinClampBudget(state);
  expect(state.scale).not.toBeNull();
  expect(state.scale).toBeCloseTo(expectedScale, 4);

  expect(state.left).toBeGreaterThanOrEqual(-0.5);
  expect(state.left).toBeLessThanOrEqual(0.5);

  const scale = state.scale ?? 1;
  const topAllowance = (state.clampPadding?.top ?? 0) / scale;
  expect(state.top).toBeLessThanOrEqual(-(topAllowance - 0.5));
}

function expectViewportAtLeftClampEdge(
  state: NonNullable<Awaited<ReturnType<typeof waitForViewportSettle>>>,
  expectedScale: number,
  expectedTop: number
) {
  expectViewportBoundsWithinClampBudget(state);
  expect(state.scale).not.toBeNull();
  expect(state.scale).toBeCloseTo(expectedScale, 4);
  expect(state.left).toBeGreaterThanOrEqual(-0.5);
  expect(state.left).toBeLessThanOrEqual(0.5);
  expect(Math.abs(state.top - expectedTop)).toBeLessThanOrEqual(0.5);
}

function expectViewportAtRightClampEdge(
  state: NonNullable<Awaited<ReturnType<typeof waitForViewportSettle>>>,
  expectedScale: number,
  expectedTop: number
) {
  expectViewportBoundsWithinClampBudget(state);
  expect(state.scale).not.toBeNull();
  expect(state.scale).toBeCloseTo(expectedScale, 4);

  const scale = state.scale ?? 1;
  const rightAllowance = (state.clampPadding?.right ?? 0) / scale;
  expect(state.right).toBeGreaterThanOrEqual(state.worldWidth + rightAllowance - 0.5);
  expect(Math.abs(state.top - expectedTop)).toBeLessThanOrEqual(0.5);
}

async function expectDefaultViewportKeepsDirectEdgeReachability(
  page: Page,
  options: {
    initialEdge?: 'bottom-right' | 'right' | 'top-left';
    initialHorizontalOnly?: boolean;
    verifyReturnToTopLeft?: boolean;
  } = {}
) {
  const initialEdge = options.initialEdge ?? 'bottom-right';
  const initialHorizontalOnly = options.initialHorizontalOnly ?? false;
  const verifyReturnToTopLeft = options.verifyReturnToTopLeft ?? true;

  await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

  const initial = await waitForViewportSettle(page);
  expect(initial).not.toBeNull();
  expect(initial.scale).not.toBeNull();
  expectViewportBoundsWithinClampBudget(initial);
  const initialScale = initial.scale!;

  if (initialEdge === 'top-left') {
    const topLeft = await dragViewportToEdge(page, 'top-left', { horizontalOnly: initialHorizontalOnly });
    if (initialHorizontalOnly) {
      expectViewportAtLeftClampEdge(topLeft, initialScale, initial.top);
    } else {
      expectViewportAtTopLeftClampEdge(topLeft, initialScale);
    }
    return;
  }

  if (initialEdge === 'right') {
    const right = await dragViewportToEdge(page, 'right');
    expectViewportAtRightClampEdge(right, initialScale, initial.top);

    if (!verifyReturnToTopLeft) {
      return;
    }

    const topLeft = await dragViewportToEdge(page, 'top-left');
    expectViewportAtTopLeftClampEdge(topLeft, initialScale);
    return;
  }

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
  expectViewportAtTopLeftClampEdge(topLeft, initialScale);
}

const SHELLS = [
  { name: 'landscape', viewport: { width: 1280, height: 720 } },
  { name: 'portrait', viewport: { width: 390, height: 844 } }
] as const;

test.describe('operator shell smoke', () => {
  test('renders the default shell with operator-shell framing and allows roster-driven selection through the Hub overlay', async ({ page }) => {
    const selectedOperationRequests: string[] = [];
    await page.route('**/office/operations?agent_id=growth-revenue', async (route) => {
      const url = new URL(route.request().url());
      selectedOperationRequests.push(`${url.pathname}${url.search}`);
      await route.continue();
    });

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
    const operationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Current Operation' })
    });
    const incidentSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Incident Feed' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const runContextSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Run Context' })
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Run Context' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Workflow' })).toBeVisible();
    await expect(detailsPanel.locator('.aitown-details__head').getByText('Prepare handoff notes', { exact: true })).toBeVisible();
    await expect(detailsPanel.getByText('meeting-zone', { exact: true })).toBeVisible();
    await expect(operationSection.getByText('planning · Prepare handoff notes')).toBeVisible();
    await expect(runContextSection.getByText(/Run blocker ·/)).toBeVisible();
    await expect(workflowSection.getByText('No open watch alerts.')).toBeVisible();
    const handoffIncidentRecord = incidentSection.getByText('Lead completed the revenue handoff').locator('..');
    await expect(handoffIncidentRecord.getByText('Lead completed the revenue handoff')).toBeVisible();
    await expect(handoffIncidentRecord.getByText('Incident · handoff · completed')).toBeVisible();
    await expect(handoffIncidentRecord.getByText('Severity · Yellow')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    expect(selectedOperationRequests).toContain('/office/operations?agent_id=growth-revenue');

    await page.getByRole('button', { name: 'Close Hub' }).click();
    await expect(page.getByRole('complementary', { name: 'Agent details' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open Hub' })).toBeVisible();
  });

  test('keeps landscape selected-agent world-shell safe-lane reachability on read-only GET routes once the Hub-close transition settles', async ({
    page
  }) => {
    test.slow();

    await installFastPollInterval(page);

    const landscapeShell = SHELLS.find((shell) => shell.name === 'landscape');
    expect(landscapeShell).toBeDefined();

    await page.setViewportSize(landscapeShell!.viewport);
    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    const frontendOrigin = new URL(page.url()).origin;
    const allowedPostClosePathnames = new Set(['/office/overview', '/incidents', '/agents/growth-revenue/workflow']);
    const forbiddenPostClosePathnames = new Set([
      '/office/operations',
      '/timeline',
      '/collectors/controller-snapshot',
      '/memory/artifacts',
      '/peer-watch/alerts',
      '/correlations/corr-revenue-handoff'
    ]);
    const expectedOverviewSearch = '';
    const expectedIncidentsSearch = '?limit=10&window=60m';
    const expectedWorkflowSearch = '?limit=10&window=60m';
    const postCloseRequests: Array<{
      method: string;
      pathname: string;
      search: string;
    }> = [];
    const readPostCloseGetRequests = () => postCloseRequests.filter((request) => request.method === 'GET');
    const readPostCloseNonGetRequests = () => postCloseRequests.filter((request) => request.method !== 'GET');
    let trackPostCloseRequests = false;
    const handleRequest = (request: Request) => {
      const url = new URL(request.url());
      if (url.origin !== frontendOrigin || !trackPostCloseRequests) {
        return;
      }

      postCloseRequests.push({
        method: request.method(),
        pathname: url.pathname,
        search: url.search
      });
    };

    page.on('request', handleRequest);

    try {
      const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
      const selectedAgentHeading = detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' });
      const watchOverlay = page.getByRole('region', { name: 'Selected watch links' });
      const workflowResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'GET' &&
          response.status() === 200 &&
          response.url().includes('/agents/growth-revenue/workflow?limit=10&window=60m')
      );

      await page.getByRole('button', { name: 'Open Hub' }).click();
      await detailsPanel.getByRole('button', { name: 'Inspect Growth Revenue Agent', exact: true }).click();
      await expect(selectedAgentHeading).toBeVisible();
      await workflowResponsePromise;

      await page.getByRole('button', { name: 'Close Hub' }).click();
      await expect(detailsPanel).toHaveCount(0);
      await expect(watchOverlay).toBeVisible();
      await expect(page.getByRole('list', { name: 'Selected watch link list' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Clear Selection' })).toBeVisible();

      const selectedAgentViewport = await waitForViewportLayoutSettle(page);
      const selectedAgent = selectedAgentViewport.selectedAgent;
      expect(selectedAgent).not.toBeNull();

      const selectedAgentProjection = resolveWorldPointScreenProjection(selectedAgentViewport, {
        x: selectedAgent!.x,
        y: selectedAgent!.y
      });
      const toplineCards = await page.locator('.aitown-panel__topline > span').evaluateAll((elements) =>
        elements
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom
            };
          })
          .sort((a, b) => a.left - b.left)
      );
      const selectedBaselineScale = selectedAgentViewport.scale ?? 1;
      const selectedBaselineTop = selectedAgentViewport.top;
      const selectedBaselineClampPadding = {
        top: selectedAgentViewport.clampPadding?.top ?? 0,
        right: selectedAgentViewport.clampPadding?.right ?? 0
      };

      expect(selectedAgent!.agentId).toBe('growth-revenue');
      expect(selectedBaselineClampPadding.right).toBeGreaterThan(0);
      expect(toplineCards).toHaveLength(2);
      expect(selectedAgentProjection.x).toBeGreaterThan(toplineCards[0]!.right + 0.5);
      expect(selectedAgentProjection.x).toBeLessThan(toplineCards[1]!.left - 0.5);
      expect(selectedAgentProjection.y).toBeGreaterThanOrEqual(0);
      expect(selectedAgentProjection.y).toBeLessThanOrEqual(selectedAgentViewport.screenHeight);
      expectViewportBoundsWithinClampBudget(selectedAgentViewport);

      postCloseRequests.length = 0;
      trackPostCloseRequests = true;

      const right = await dragViewportToEdge(page, 'right');
      await expect(watchOverlay).toBeVisible();
      expect(right.selectedAgent?.agentId).toBe('growth-revenue');
      expect(right.clampPadding?.top ?? 0).toBe(selectedBaselineClampPadding.top);
      expect(right.clampPadding?.right ?? 0).toBe(selectedBaselineClampPadding.right);
      expectViewportAtRightClampEdge(right, selectedBaselineScale, selectedBaselineTop);

      const left = await dragViewportToEdge(page, 'top-left', { horizontalOnly: true });
      await expect(watchOverlay).toBeVisible();
      expect(left.selectedAgent?.agentId).toBe('growth-revenue');
      expect(left.clampPadding?.top ?? 0).toBe(selectedBaselineClampPadding.top);
      expect(left.clampPadding?.right ?? 0).toBe(selectedBaselineClampPadding.right);
      expectViewportAtLeftClampEdge(left, selectedBaselineScale, selectedBaselineTop);

      await expect
        .poll(
          () =>
            readPostCloseGetRequests().filter(
              (request) => request.pathname === '/office/overview' && request.search === expectedOverviewSearch
            ).length,
          { timeout: POLL_DRIVEN_ASSERTION_TIMEOUT_MS }
        )
        .toBeGreaterThan(0);
      await expect
        .poll(
          () =>
            readPostCloseGetRequests().filter(
              (request) => request.pathname === '/incidents' && request.search === expectedIncidentsSearch
            ).length,
          { timeout: POLL_DRIVEN_ASSERTION_TIMEOUT_MS }
        )
        .toBeGreaterThan(0);
      await expect
        .poll(
          () =>
            readPostCloseGetRequests().filter(
              (request) =>
                request.pathname === '/agents/growth-revenue/workflow' && request.search === expectedWorkflowSearch
            ).length,
          { timeout: POLL_DRIVEN_ASSERTION_TIMEOUT_MS }
        )
        .toBeGreaterThan(1);

      expect(postCloseRequests.length).toBeGreaterThan(0);
      expect(readPostCloseNonGetRequests()).toEqual([]);
      expect(readPostCloseGetRequests().filter((request) => !allowedPostClosePathnames.has(request.pathname))).toEqual(
        []
      );
      expect(
        readPostCloseGetRequests().filter(
          (request) => request.pathname === '/office/overview' && request.search !== expectedOverviewSearch
        )
      ).toEqual([]);
      expect(
        readPostCloseGetRequests().filter(
          (request) => request.pathname === '/incidents' && request.search !== expectedIncidentsSearch
        )
      ).toEqual([]);
      expect(
        readPostCloseGetRequests().filter(
          (request) => request.pathname === '/agents/growth-revenue/workflow' && request.search !== expectedWorkflowSearch
        )
      ).toEqual([]);
      expect(
        readPostCloseGetRequests().filter((request) => forbiddenPostClosePathnames.has(request.pathname))
      ).toEqual([]);
    } finally {
      page.off('request', handleRequest);
    }
  });

  test('keeps portrait selected-agent world-shell return-lane reachability on read-only GET routes once the Hub-close transition settles', async ({
    page
  }) => {
    test.slow();

    await installFastPollInterval(page);

    const portraitShell = SHELLS.find((shell) => shell.name === 'portrait');
    expect(portraitShell).toBeDefined();

    await page.setViewportSize(portraitShell!.viewport);
    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    const frontendOrigin = new URL(page.url()).origin;
    const allowedPostClosePathnames = new Set(['/office/overview', '/incidents', '/agents/growth-revenue/workflow']);
    const forbiddenPostClosePathnames = new Set([
      '/office/operations',
      '/timeline',
      '/collectors/controller-snapshot',
      '/memory/artifacts',
      '/peer-watch/alerts',
      '/correlations/corr-revenue-handoff'
    ]);
    const expectedOverviewSearch = '';
    const expectedIncidentsSearch = '?limit=10&window=60m';
    const expectedWorkflowSearch = '?limit=10&window=60m';
    const postCloseRequests: Array<{
      method: string;
      pathname: string;
      search: string;
    }> = [];
    const readPostCloseGetRequests = () => postCloseRequests.filter((request) => request.method === 'GET');
    const readPostCloseNonGetRequests = () => postCloseRequests.filter((request) => request.method !== 'GET');
    let trackPostCloseRequests = false;
    const handleRequest = (request: Request) => {
      const url = new URL(request.url());
      if (url.origin !== frontendOrigin || !trackPostCloseRequests) {
        return;
      }

      postCloseRequests.push({
        method: request.method(),
        pathname: url.pathname,
        search: url.search
      });
    };

    page.on('request', handleRequest);

    try {
      const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
      const selectedAgentHeading = detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' });
      const watchOverlay = page.getByRole('region', { name: 'Selected watch links' });
      const workflowResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'GET' &&
          response.status() === 200 &&
          response.url().includes('/agents/growth-revenue/workflow?limit=10&window=60m')
      );

      await page.getByRole('button', { name: 'Open Hub' }).click();
      await detailsPanel.getByRole('button', { name: 'Inspect Growth Revenue Agent', exact: true }).click();
      await expect(selectedAgentHeading).toBeVisible();
      await workflowResponsePromise;

      await page.getByRole('button', { name: 'Close Hub' }).click();
      await expect(detailsPanel).toHaveCount(0);
      await expect(watchOverlay).toBeVisible();
      await expect(page.getByRole('list', { name: 'Selected watch link list' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Clear Selection' })).toBeVisible();

      const selectedAgentViewport = await waitForViewportLayoutSettle(page);
      const selectedAgent = selectedAgentViewport.selectedAgent;
      const selectedBaselineScale = selectedAgentViewport.scale ?? 1;
      const selectedBaselineTop = selectedAgentViewport.top;
      const selectedBaselineClampPadding = {
        top: selectedAgentViewport.clampPadding?.top ?? 0,
        right: selectedAgentViewport.clampPadding?.right ?? 0
      };

      expect(selectedAgent).not.toBeNull();
      expect(selectedAgent!.agentId).toBe('growth-revenue');
      expect(selectedBaselineClampPadding.right).toBe(0);
      expectViewportBoundsWithinClampBudget(selectedAgentViewport);

      postCloseRequests.length = 0;
      trackPostCloseRequests = true;

      const right = await dragViewportToEdge(page, 'right');
      await expect(watchOverlay).toBeVisible();
      expect(right.selectedAgent?.agentId).toBe('growth-revenue');
      expect(right.clampPadding?.top ?? 0).toBe(selectedBaselineClampPadding.top);
      expect(right.clampPadding?.right ?? 0).toBe(0);
      expectViewportBoundsWithinClampBudget(right);
      expect(right.scale).toBeCloseTo(selectedBaselineScale, 4);
      expect(right.right).toBeGreaterThanOrEqual(right.worldWidth - 0.5);
      expect(right.right).toBeLessThanOrEqual(right.worldWidth + 0.5);
      expect(Math.abs(right.top - selectedBaselineTop)).toBeLessThanOrEqual(0.5);

      const left = await dragViewportToEdge(page, 'top-left', { horizontalOnly: true });
      await expect(watchOverlay).toBeVisible();
      expect(left.selectedAgent?.agentId).toBe('growth-revenue');
      expect(left.clampPadding?.top ?? 0).toBe(selectedBaselineClampPadding.top);
      expect(left.clampPadding?.right ?? 0).toBe(0);
      expectViewportAtLeftClampEdge(left, selectedBaselineScale, selectedBaselineTop);

      await expect
        .poll(
          () =>
            readPostCloseGetRequests().filter(
              (request) => request.pathname === '/office/overview' && request.search === expectedOverviewSearch
            ).length,
          { timeout: POLL_DRIVEN_ASSERTION_TIMEOUT_MS }
        )
        .toBeGreaterThan(0);
      await expect
        .poll(
          () =>
            readPostCloseGetRequests().filter(
              (request) => request.pathname === '/incidents' && request.search === expectedIncidentsSearch
            ).length,
          { timeout: POLL_DRIVEN_ASSERTION_TIMEOUT_MS }
        )
        .toBeGreaterThan(0);
      await expect
        .poll(
          () =>
            readPostCloseGetRequests().filter(
              (request) =>
                request.pathname === '/agents/growth-revenue/workflow' && request.search === expectedWorkflowSearch
            ).length,
          { timeout: POLL_DRIVEN_ASSERTION_TIMEOUT_MS }
        )
        .toBeGreaterThan(1);

      expect(postCloseRequests.length).toBeGreaterThan(0);
      expect(readPostCloseNonGetRequests()).toEqual([]);
      expect(readPostCloseGetRequests().filter((request) => !allowedPostClosePathnames.has(request.pathname))).toEqual(
        []
      );
      expect(
        readPostCloseGetRequests().filter(
          (request) => request.pathname === '/office/overview' && request.search !== expectedOverviewSearch
        )
      ).toEqual([]);
      expect(
        readPostCloseGetRequests().filter(
          (request) => request.pathname === '/incidents' && request.search !== expectedIncidentsSearch
        )
      ).toEqual([]);
      expect(
        readPostCloseGetRequests().filter(
          (request) => request.pathname === '/agents/growth-revenue/workflow' && request.search !== expectedWorkflowSearch
        )
      ).toEqual([]);
      expect(
        readPostCloseGetRequests().filter((request) => forbiddenPostClosePathnames.has(request.pathname))
      ).toEqual([]);
    } finally {
      page.off('request', handleRequest);
    }
  });

  test('renders the scene status legend for the canvas badge markers on the default shell', async ({ page }) => {
    await page.goto('/');

    const worldRegion = page.getByRole('region', { name: 'Office world' });
    const legend = worldRegion.getByRole('list', { name: 'Scene status legend' });
    const items = legend.getByRole('listitem');

    await expect(worldRegion).toBeVisible();
    await expect(worldRegion.getByText('Badge legend')).toBeVisible();
    await expect(legend).toBeVisible();
    await expect(items).toHaveCount(4);
    await expect(legend).toContainText('#');
    await expect(legend).toContainText('!');
    await expect(legend).toContainText('R');
    await expect(legend).toContainText('S');
  });

  test('focuses a hot-zone legend entry in the world viewport via keyboard traversal', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    await forceViewportAgainstTopRightClamp(page);
    const before = await waitForViewportSettle(page);
    const hotZoneButton = page.getByRole('button', {
      name: /Meeting Zone.*Focus in world viewport/
    });

    await focusHubControlWithTab(page, hotZoneButton, 'Meeting Zone hot-zone legend entry');
    await expect(hotZoneButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect
      .poll(async () => {
        const current = await readViewportState(page);

        return current ? Math.hypot(current.left - before.left, current.top - before.top) : 0;
      }, {
        timeout: POLL_DRIVEN_ASSERTION_TIMEOUT_MS
      })
      .toBeGreaterThan(16);

    const after = await waitForViewportSettle(page);
    expect(after.selectedAgent).toBeNull();
    expectViewportBoundsWithinClampBudget(after);
  });

  test('surfaces live focus agents on the world shell before Hub opens and lets operators inspect them directly', async ({
    page
  }) => {
    await page.goto('/');

    await expect(page.getByText('Live Focus')).toBeVisible();
    await expect(page.getByText(/agent needs attention right now\./)).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Hub' })).toHaveCount(0);
    await expect(page.getByRole('complementary', { name: 'Agent details' })).toHaveCount(0);

    const liveFocusButton = page.getByRole('button', {
      name: 'Inspect live focus agent Growth Revenue Agent'
    });
    await expect(liveFocusButton).toBeVisible();
    await liveFocusButton.click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    await expect(page.getByRole('dialog', { name: 'Hub' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(detailsPanel.getByRole('button', { name: 'Clear' })).toBeVisible();
  });

  test('keeps the landscape Live Focus inspect return lane unobscured and the read-only request surface narrow once the Hub-close transition settles via keyboard traversal', async ({
    page
  }) => {
    test.slow();

    await installFastPollInterval(page);

    const landscapeShell = SHELLS.find((shell) => shell.name === 'landscape');
    expect(landscapeShell).toBeDefined();

    await page.setViewportSize(landscapeShell!.viewport);
    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    await expect(page.getByText('Live Focus')).toBeVisible();
    await expect(page.getByText(/agent needs attention right now\./)).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Hub' })).toHaveCount(0);
    await expect(page.getByRole('complementary', { name: 'Agent details' })).toHaveCount(0);

    const liveFocusButton = page.getByRole('button', {
      name: 'Inspect live focus agent Growth Revenue Agent'
    });
    const frontendOrigin = new URL(page.url()).origin;
    const allowedPostClosePathnames = new Set(['/office/overview', '/incidents', '/agents/growth-revenue/workflow']);
    const forbiddenPostClosePathnames = new Set([
      '/office/operations',
      '/timeline',
      '/collectors/controller-snapshot',
      '/memory/artifacts',
      '/peer-watch/alerts',
      '/correlations/corr-revenue-handoff'
    ]);
    const expectedOverviewSearch = '';
    const expectedIncidentsSearch = '?limit=10&window=60m';
    const expectedWorkflowSearch = '?limit=10&window=60m';
    const postCloseRequests: Array<{
      method: string;
      pathname: string;
      search: string;
    }> = [];
    const readPostCloseGetRequests = () => postCloseRequests.filter((request) => request.method === 'GET');
    const readPostCloseNonGetRequests = () => postCloseRequests.filter((request) => request.method !== 'GET');
    let trackPostCloseRequests = false;
    const dialog = page.getByRole('dialog', { name: 'Hub' });
    const handleRequest = (request: Request) => {
      const url = new URL(request.url());
      if (url.origin !== frontendOrigin || !trackPostCloseRequests) {
        return;
      }

      postCloseRequests.push({
        method: request.method(),
        pathname: url.pathname,
        search: url.search
      });
    };

    page.on('request', handleRequest);

    try {
      const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
      const selectedAgentHeading = detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' });
      const watchOverlay = page.getByRole('region', { name: 'Selected watch links' });
      const closeHubButton = page.getByRole('button', { name: 'Close Hub' });
      const workflowResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'GET' &&
          response.status() === 200 &&
          response.url().includes('/agents/growth-revenue/workflow?limit=10&window=60m')
      );

      await focusHubControlWithTab(page, liveFocusButton, 'Inspect live focus agent Growth Revenue Agent');
      await expect(liveFocusButton).toBeFocused();
      await page.keyboard.press('Enter');

      await expect(dialog).toBeVisible();
      await expect(selectedAgentHeading).toBeVisible();
      await expect(detailsPanel.getByRole('button', { name: 'Clear' })).toBeVisible();
      await workflowResponsePromise;

      await focusHubControlWithTab(page, closeHubButton, 'Close Hub');
      await expect(closeHubButton).toBeFocused();
      await page.keyboard.press('Enter');

      await expect(dialog).toHaveCount(0);
      await expect(detailsPanel).toHaveCount(0);
      await expect(watchOverlay).toBeVisible();
      await expect(page.getByRole('list', { name: 'Selected watch link list' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Clear Selection' })).toBeVisible();

      const selectedAgentViewport = await waitForViewportLayoutSettle(page);
      const selectedAgent = selectedAgentViewport.selectedAgent;
      expect(selectedAgent).not.toBeNull();

      const selectedAgentProjection = resolveWorldPointScreenProjection(selectedAgentViewport, {
        x: selectedAgent!.x,
        y: selectedAgent!.y
      });
      const toplineCards = await page.locator('.aitown-panel__topline > span').evaluateAll((elements) =>
        elements
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom
            };
          })
          .sort((a, b) => a.left - b.left)
      );
      const selectedBaselineScale = selectedAgentViewport.scale ?? 1;
      const selectedBaselineTop = selectedAgentViewport.top;
      const selectedBaselineClampPadding = {
        top: selectedAgentViewport.clampPadding?.top ?? 0,
        right: selectedAgentViewport.clampPadding?.right ?? 0
      };

      expect(selectedAgent!.agentId).toBe('growth-revenue');
      expect(selectedBaselineClampPadding.right).toBeGreaterThan(0);
      expect(toplineCards).toHaveLength(2);
      expect(selectedAgentProjection.x).toBeGreaterThan(toplineCards[0]!.right + 0.5);
      expect(selectedAgentProjection.x).toBeLessThan(toplineCards[1]!.left - 0.5);
      expect(selectedAgentProjection.y).toBeGreaterThanOrEqual(0);
      expect(selectedAgentProjection.y).toBeLessThanOrEqual(selectedAgentViewport.screenHeight);
      expectViewportBoundsWithinClampBudget(selectedAgentViewport);

      postCloseRequests.length = 0;
      trackPostCloseRequests = true;

      const right = await dragViewportToEdge(page, 'right');
      await expect(watchOverlay).toBeVisible();
      expect(right.selectedAgent?.agentId).toBe('growth-revenue');
      expect(right.clampPadding?.top ?? 0).toBe(selectedBaselineClampPadding.top);
      expect(right.clampPadding?.right ?? 0).toBe(selectedBaselineClampPadding.right);
      expectViewportAtRightClampEdge(right, selectedBaselineScale, selectedBaselineTop);

      const left = await dragViewportToEdge(page, 'top-left', { horizontalOnly: true });
      await expect(watchOverlay).toBeVisible();
      expect(left.selectedAgent?.agentId).toBe('growth-revenue');
      expect(left.clampPadding?.top ?? 0).toBe(selectedBaselineClampPadding.top);
      expect(left.clampPadding?.right ?? 0).toBe(selectedBaselineClampPadding.right);
      expectViewportAtLeftClampEdge(left, selectedBaselineScale, selectedBaselineTop);

      await expect
        .poll(
          () =>
            readPostCloseGetRequests().filter(
              (request) => request.pathname === '/office/overview' && request.search === expectedOverviewSearch
            ).length,
          { timeout: POLL_DRIVEN_ASSERTION_TIMEOUT_MS }
        )
        .toBeGreaterThan(0);
      await expect
        .poll(
          () =>
            readPostCloseGetRequests().filter(
              (request) => request.pathname === '/incidents' && request.search === expectedIncidentsSearch
            ).length,
          { timeout: POLL_DRIVEN_ASSERTION_TIMEOUT_MS }
        )
        .toBeGreaterThan(0);
      await expect
        .poll(
          () =>
            readPostCloseGetRequests().filter(
              (request) =>
                request.pathname === '/agents/growth-revenue/workflow' && request.search === expectedWorkflowSearch
            ).length,
          { timeout: POLL_DRIVEN_ASSERTION_TIMEOUT_MS }
        )
        .toBeGreaterThan(1);

      expect(postCloseRequests.length).toBeGreaterThan(0);
      expect(readPostCloseNonGetRequests()).toEqual([]);
      expect(readPostCloseGetRequests().filter((request) => !allowedPostClosePathnames.has(request.pathname))).toEqual(
        []
      );
      expect(
        readPostCloseGetRequests().filter(
          (request) => request.pathname === '/office/overview' && request.search !== expectedOverviewSearch
        )
      ).toEqual([]);
      expect(
        readPostCloseGetRequests().filter(
          (request) => request.pathname === '/incidents' && request.search !== expectedIncidentsSearch
        )
      ).toEqual([]);
      expect(
        readPostCloseGetRequests().filter(
          (request) => request.pathname === '/agents/growth-revenue/workflow' && request.search !== expectedWorkflowSearch
        )
      ).toEqual([]);
      expect(
        readPostCloseGetRequests().filter((request) => forbiddenPostClosePathnames.has(request.pathname))
      ).toEqual([]);
    } finally {
      page.off('request', handleRequest);
    }
  });

  test('keeps the portrait Live Focus inspect return lane unobscured and the read-only request surface narrow once the Hub-close transition settles via keyboard traversal', async ({
    page
  }) => {
    test.slow();

    await installFastPollInterval(page);

    const portraitShell = SHELLS.find((shell) => shell.name === 'portrait');
    expect(portraitShell).toBeDefined();

    await page.setViewportSize(portraitShell!.viewport);
    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    await expect(page.getByText('Live Focus')).toBeVisible();
    await expect(page.getByText(/agent needs attention right now\./)).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Hub' })).toHaveCount(0);
    await expect(page.getByRole('complementary', { name: 'Agent details' })).toHaveCount(0);

    const liveFocusButton = page.getByRole('button', {
      name: 'Inspect live focus agent Growth Revenue Agent'
    });
    const frontendOrigin = new URL(page.url()).origin;
    const allowedPostClosePathnames = new Set(['/office/overview', '/incidents', '/agents/growth-revenue/workflow']);
    const forbiddenPostClosePathnames = new Set([
      '/office/operations',
      '/timeline',
      '/collectors/controller-snapshot',
      '/memory/artifacts',
      '/peer-watch/alerts',
      '/correlations/corr-revenue-handoff'
    ]);
    const expectedOverviewSearch = '';
    const expectedIncidentsSearch = '?limit=10&window=60m';
    const expectedWorkflowSearch = '?limit=10&window=60m';
    const postCloseRequests: Array<{
      method: string;
      pathname: string;
      search: string;
    }> = [];
    const readPostCloseGetRequests = () => postCloseRequests.filter((request) => request.method === 'GET');
    const readPostCloseNonGetRequests = () => postCloseRequests.filter((request) => request.method !== 'GET');
    let trackPostCloseRequests = false;
    const dialog = page.getByRole('dialog', { name: 'Hub' });
    const handleRequest = (request: Request) => {
      const url = new URL(request.url());
      if (url.origin !== frontendOrigin || !trackPostCloseRequests) {
        return;
      }

      postCloseRequests.push({
        method: request.method(),
        pathname: url.pathname,
        search: url.search
      });
    };

    page.on('request', handleRequest);

    try {
      const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
      const selectedAgentHeading = detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' });
      const supervisionSection = detailsPanel.locator('section').filter({
        has: page.getByRole('heading', { name: 'Supervision History' })
      });
      const watchOverlay = page.getByRole('region', { name: 'Selected watch links' });
      const closeHubButton = page.getByRole('button', { name: 'Close Hub' });
      const workflowResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'GET' &&
          response.status() === 200 &&
          response.url().includes('/agents/growth-revenue/workflow?limit=10&window=60m')
      );
      const supervisionHistoryResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'GET' &&
          response.status() === 200 &&
          response.url().includes('/peer-watch/alerts?target_agent_id=growth-revenue&limit=4')
      );

      await focusHubControlWithTab(page, liveFocusButton, 'Inspect live focus agent Growth Revenue Agent');
      await expect(liveFocusButton).toBeFocused();
      await page.keyboard.press('Enter');

      await expect(dialog).toBeVisible();
      await expect(selectedAgentHeading).toBeVisible();
      await expect(detailsPanel.getByRole('button', { name: 'Clear' })).toBeVisible();
      await expect(detailsPanel.getByRole('heading', { name: 'Supervision History' })).toBeVisible();
      await workflowResponsePromise;
      await supervisionHistoryResponsePromise;
      await expect(
        supervisionSection.getByText(
          'Request scope · Target agent · growth-revenue · Active correlation · corr-revenue-handoff'
        )
      ).toBeVisible();

      await focusHubControlWithTab(page, closeHubButton, 'Close Hub');
      await expect(closeHubButton).toBeFocused();
      await page.keyboard.press('Enter');

      await expect(dialog).toHaveCount(0);
      await expect(detailsPanel).toHaveCount(0);
      await expect(watchOverlay).toBeVisible();
      await expect(page.getByRole('list', { name: 'Selected watch link list' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Clear Selection' })).toBeVisible();

      const selectedAgentViewport = await waitForViewportLayoutSettle(page);
      const selectedAgent = selectedAgentViewport.selectedAgent;
      const selectedBaselineScale = selectedAgentViewport.scale ?? 1;
      const selectedBaselineTop = selectedAgentViewport.top;
      const selectedBaselineClampPadding = {
        top: selectedAgentViewport.clampPadding?.top ?? 0,
        right: selectedAgentViewport.clampPadding?.right ?? 0
      };

      expect(selectedAgent).not.toBeNull();
      expect(selectedAgent!.agentId).toBe('growth-revenue');
      expect(selectedBaselineClampPadding.right).toBe(0);
      expectViewportBoundsWithinClampBudget(selectedAgentViewport);

      postCloseRequests.length = 0;
      trackPostCloseRequests = true;

      const right = await dragViewportToEdge(page, 'right');
      await expect(watchOverlay).toBeVisible();
      expect(right.selectedAgent?.agentId).toBe('growth-revenue');
      expect(right.clampPadding?.top ?? 0).toBe(selectedBaselineClampPadding.top);
      expect(right.clampPadding?.right ?? 0).toBe(0);
      expectViewportBoundsWithinClampBudget(right);
      expect(right.scale).toBeCloseTo(selectedBaselineScale, 4);
      expect(right.right).toBeGreaterThanOrEqual(right.worldWidth - 0.5);
      expect(right.right).toBeLessThanOrEqual(right.worldWidth + 0.5);
      expect(Math.abs(right.top - selectedBaselineTop)).toBeLessThanOrEqual(0.5);

      const left = await dragViewportToEdge(page, 'top-left', { horizontalOnly: true });
      await expect(watchOverlay).toBeVisible();
      expect(left.selectedAgent?.agentId).toBe('growth-revenue');
      expect(left.clampPadding?.top ?? 0).toBe(selectedBaselineClampPadding.top);
      expect(left.clampPadding?.right ?? 0).toBe(0);
      expectViewportAtLeftClampEdge(left, selectedBaselineScale, selectedBaselineTop);

      await expect
        .poll(
          () =>
            readPostCloseGetRequests().filter(
              (request) => request.pathname === '/office/overview' && request.search === expectedOverviewSearch
            ).length,
          { timeout: POLL_DRIVEN_ASSERTION_TIMEOUT_MS }
        )
        .toBeGreaterThan(0);
      await expect
        .poll(
          () =>
            readPostCloseGetRequests().filter(
              (request) => request.pathname === '/incidents' && request.search === expectedIncidentsSearch
            ).length,
          { timeout: POLL_DRIVEN_ASSERTION_TIMEOUT_MS }
        )
        .toBeGreaterThan(0);
      await expect
        .poll(
          () =>
            readPostCloseGetRequests().filter(
              (request) =>
                request.pathname === '/agents/growth-revenue/workflow' && request.search === expectedWorkflowSearch
            ).length,
          { timeout: POLL_DRIVEN_ASSERTION_TIMEOUT_MS }
        )
        .toBeGreaterThan(1);

      expect(postCloseRequests.length).toBeGreaterThan(0);
      expect(readPostCloseNonGetRequests()).toEqual([]);
      expect(readPostCloseGetRequests().filter((request) => !allowedPostClosePathnames.has(request.pathname))).toEqual(
        []
      );
      expect(
        readPostCloseGetRequests().filter(
          (request) => request.pathname === '/office/overview' && request.search !== expectedOverviewSearch
        )
      ).toEqual([]);
      expect(
        readPostCloseGetRequests().filter(
          (request) => request.pathname === '/incidents' && request.search !== expectedIncidentsSearch
        )
      ).toEqual([]);
      expect(
        readPostCloseGetRequests().filter(
          (request) => request.pathname === '/agents/growth-revenue/workflow' && request.search !== expectedWorkflowSearch
        )
      ).toEqual([]);
      expect(
        readPostCloseGetRequests().filter((request) => forbiddenPostClosePathnames.has(request.pathname))
      ).toEqual([]);
    } finally {
      page.off('request', handleRequest);
    }
  });

  test('keeps the last direct-selection Current Operation visible when a roster selection later degrades', async ({
    page
  }) => {
    test.setTimeout(45_000);
    await installFastPollInterval(page);

    const selectedOperationRequests: string[] = [];
    await page.route('**/office/operations?agent_id=growth-revenue', async (route) => {
      const url = new URL(route.request().url());
      selectedOperationRequests.push(`${url.pathname}${url.search}`);
      await route.continue();
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const operationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Current Operation' })
    });
    const runContextSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Run Context' })
    });

    await detailsPanel.getByRole('button', { name: 'Inspect Growth Revenue Agent', exact: true }).click();

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Run Context' })).toBeVisible();
    await expect(operationSection.getByText('planning · Prepare handoff notes')).toBeVisible();
    await expect(runContextSection.getByText(/Run blocker ·/)).toBeVisible();
    await expect(runContextSection.getByText(/Latest event type ·/)).toBeVisible();
    expect(selectedOperationRequests).toContain('/office/operations?agent_id=growth-revenue');

    await enableScenario(page, 'selected-operation-refresh-failure');

    await expect(detailsPanel.getByText('Showing last operation snapshot. operations refresh failed')).toBeVisible({
      timeout: POLL_DRIVEN_ASSERTION_TIMEOUT_MS
    });
    await expect(operationSection.getByText('planning · Prepare handoff notes')).toBeVisible();
    await expect(runContextSection.getByText(/Run blocker ·/)).toBeVisible();
    await expect(runContextSection.getByText(/Latest event type ·/)).toBeVisible();
  });

  test('shows the selected-agent Current Operation first-load loading and failure states explicitly instead of widening into another surface', async ({
    page
  }) => {
    let releaseSelectedOperation: (() => void) | null = null;
    const selectedOperationPath = '/office/operations?agent_id=app-engineering';
    const selectedOperationRequests: string[] = [];
    const unexpectedSelectedOperationRequests: string[] = [];

    await page.route('**/office/operations?limit=4', async (route) => {
      const response = await route.fetch();
      const operations = (await response.json()) as {
        items: Array<{ agent_id: string }>;
      };

      await route.fulfill({
        response,
        json: {
          ...operations,
          items: operations.items.filter((item) => item.agent_id !== 'app-engineering')
        }
      });
    });

    await page.route('**/office/operations**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname !== '/office/operations' || url.searchParams.get('agent_id') !== 'app-engineering') {
        await route.continue();
        return;
      }

      const requestPath = `${url.pathname}${url.search}`;
      if (requestPath !== selectedOperationPath) {
        unexpectedSelectedOperationRequests.push(requestPath);
        await route.continue();
        return;
      }

      selectedOperationRequests.push(requestPath);
      if (selectedOperationRequests.length === 1) {
        await new Promise<void>((resolve) => {
          releaseSelectedOperation = resolve;
        });
      }

      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'internal_error',
          details: 'operations refresh failed'
        })
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const inspectButton = detailsPanel.getByRole('button', {
      name: 'Inspect App Engineering Agent',
      exact: true
    });
    const operationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Current Operation' })
    });

    await focusHubControlWithTab(page, inspectButton, 'Inspect App Engineering Agent');
    await expect(inspectButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(operationSection.getByText('Loading current operation...')).toBeVisible();
    await expect(operationSection.getByText(/Unable to load current operation\./)).toHaveCount(0);
    await expect(detailsPanel.getByRole('heading', { name: 'Run Context' })).toHaveCount(0);
    await expect(operationSection.getByText('working · Load current operation snapshot')).toHaveCount(0);
    await expect
      .poll(() => selectedOperationRequests.filter((request) => request === selectedOperationPath).length)
      .toBe(1);
    expect(unexpectedSelectedOperationRequests).toEqual([]);

    expect(releaseSelectedOperation).not.toBeNull();
    releaseSelectedOperation!();

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(operationSection.getByText('Unable to load current operation. operations refresh failed')).toBeVisible();
    await expect(operationSection.getByText('Loading current operation...')).toHaveCount(0);
    await expect(detailsPanel.getByRole('heading', { name: 'Run Context' })).toHaveCount(0);
    await expect(operationSection.getByText('working · Load current operation snapshot')).toHaveCount(0);
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
    const firstDialogButton = dialog.getByRole('button').first();
    const lastDialogButton = dialog.getByRole('button').last();

    await expect(dialog).toBeVisible();
    await expect(closeButton).toBeFocused();
    await expect(firstDialogButton).toBeVisible();
    await expect(lastDialogButton).toBeVisible();

    await page.keyboard.press('Shift+Tab');
    await expect(firstDialogButton).toBeFocused();

    await page.keyboard.press('Shift+Tab');
    await expect(lastDialogButton).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(firstDialogButton).toBeFocused();
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

  test('opens agent detail from the crew open supervision alerts queue with the alert correlation via keyboard traversal', async ({ page }) => {
    await page.route('**/peer-watch/alerts?status=open&limit=4', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              alert_id: 'alert-open-queue-growth-review',
              ts: '2026-03-16T08:55:00.000Z',
              agent_id: 'growth-revenue',
              target_agent_id: 'growth-revenue',
              actor_id: 'team-lead',
              observer_agent_id: 'app-engineering',
              watcher_agent_ids: ['team-lead'],
              severity: 'orange',
              status: 'open',
              current_state: 'blocked',
              active_task: 'Escalate missing revenue evidence before release review',
              summary: 'Growth revenue needs open supervision review follow-up',
              evidence_refs: ['/tmp/revenue-evidence.md'],
              evidence_count: 1,
              correlation_id: 'corr-growth-lead-review',
              source_kind: 'controller_event',
              metadata: {
                escalation: 'release-review'
              }
            }
          ]
        })
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const openAlertsButton = detailsPanel.getByRole('button', {
      name: 'Inspect Growth Revenue Agent from open supervision alerts queue'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Open Supervision Alerts' })).toBeVisible();
    await expect(detailsPanel.getByText('Growth revenue needs open supervision review follow-up')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await focusHubControlWithTab(
      page,
      openAlertsButton,
      'Inspect Growth Revenue Agent from open supervision alerts queue'
    );
    await expect(openAlertsButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(detailsPanel.getByRole('button', { name: 'Clear' })).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toHaveCount(0);
  });

  test('keeps severity-filtered open supervision alerts linked from current-scope shared memory backlinks via keyboard traversal', async ({
    page
  }) => {
    const openSupervisionAlertRequests: string[] = [];
    const orangeAlert = {
      alert_id: 'alert-open-supervision-orange-backlink',
      ts: '2026-03-16T08:55:00.000Z',
      agent_id: 'growth-revenue',
      target_agent_id: 'growth-revenue',
      actor_id: 'team-lead',
      observer_agent_id: 'app-engineering',
      watcher_agent_ids: ['team-lead'],
      severity: 'orange',
      status: 'open',
      current_state: 'blocked',
      active_task: 'Escalate missing revenue evidence before release review',
      summary: 'Orange supervision alert cites revenue handoff',
      evidence_refs: ['/tmp/revenue-handoff.md'],
      evidence_count: 1,
      correlation_id: 'corr-revenue-handoff',
      source_kind: 'controller_event',
      metadata: {}
    };
    const yellowAlert = {
      ...orangeAlert,
      alert_id: 'alert-open-supervision-yellow-backlink',
      ts: '2026-03-16T08:50:00.000Z',
      severity: 'yellow',
      summary: 'Yellow supervision alert should stay out of filtered backlinks'
    };
    const orangeOpenAlertsPath = '/peer-watch/alerts?status=open&severity=orange&limit=4';

    await page.route('**/peer-watch/alerts**', async (route) => {
      const url = new URL(route.request().url());
      if (
        url.pathname !== '/peer-watch/alerts' ||
        url.searchParams.get('status') !== 'open' ||
        url.searchParams.get('limit') !== '4' ||
        url.searchParams.has('target_agent_id')
      ) {
        await route.continue();
        return;
      }

      const pathWithSearch = `${url.pathname}${url.search}`;
      openSupervisionAlertRequests.push(pathWithSearch);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: url.searchParams.get('severity') === 'orange' ? [orangeAlert] : [yellowAlert, orangeAlert]
        })
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const openAlertsSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Open Supervision Alerts' })
    });
    const memorySection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Shared Memory' })
    });
    const severityFilter = openAlertsSection.getByLabel('Filter open supervision alerts by severity');
    const orangeAlertRecord = openAlertsSection
      .getByText('Orange supervision alert cites revenue handoff')
      .locator('xpath=ancestor::li[contains(@class,"aitown-record")][1]');
    const evidenceJumpButton = orangeAlertRecord.getByRole('button', {
      name: 'Jump to shared memory artifact /tmp/revenue-handoff.md'
    });
    const focusedSharedMemoryRecord = detailsPanel.locator('li[data-shared-memory-target]:focus');

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(openAlertsSection.getByText('Yellow supervision alert should stay out of filtered backlinks')).toBeVisible();
    await expect(openAlertsSection.getByText('Orange supervision alert cites revenue handoff')).toBeVisible();

    await severityFilter.selectOption('orange');

    await expect.poll(() => openSupervisionAlertRequests.includes(orangeOpenAlertsPath)).toBe(true);
    await expect(openAlertsSection.getByText('Orange supervision alert cites revenue handoff')).toBeVisible();
    await expect(openAlertsSection.getByText('Yellow supervision alert should stay out of filtered backlinks')).toHaveCount(0);
    await expect(evidenceJumpButton).toBeVisible();
    await expect(focusedSharedMemoryRecord).toHaveCount(0);
    await focusHubControlWithTab(page, evidenceJumpButton, 'Jump to shared memory artifact /tmp/revenue-handoff.md');
    await expect(evidenceJumpButton).toBeFocused();

    await page.keyboard.press('Enter');

    await expect(focusedSharedMemoryRecord).toHaveCount(1);
    await expect(focusedSharedMemoryRecord).toContainText('Ref · /tmp/revenue-handoff.md');
    await expect(memorySection.getByText('Current-scope backlinks')).toBeVisible();
    await expect(memorySection.getByText('Open supervision alert')).toBeVisible();
    await expect(memorySection.getByText('Orange supervision alert cites revenue handoff')).toBeVisible();
    await expect(memorySection.getByText('Yellow supervision alert should stay out of filtered backlinks')).toHaveCount(0);
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

  test('shows explicit first-load fallback state when a crew-overview correlation drilldown fails', async ({ page }) => {
    const interceptedCorrelationRequests: string[] = [];
    let releaseFirstCorrelationResponse: (() => void) | null = null;
    const firstCorrelationResponseReleased = new Promise<void>((resolve) => {
      releaseFirstCorrelationResponse = resolve;
    });
    const activeQueueCorrelationUrl = '/correlations/corr-growth-lead-review?limit=10&window=60m';
    const activeQueueCorrelationRoute = `**${activeQueueCorrelationUrl}`;
    const activeQueueCorrelationHandler = async (route: Route) => {
      const requestUrl = new URL(route.request().url());
      const requestPath = `${route.request().method()} ${requestUrl.pathname}${requestUrl.search}`;
      interceptedCorrelationRequests.push(requestPath);
      expect(requestPath).toBe(`GET ${activeQueueCorrelationUrl}`);

      await firstCorrelationResponseReleased;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'internal_error', details: 'correlation refresh failed' })
      });
    };

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
    await page.route(activeQueueCorrelationRoute, activeQueueCorrelationHandler);

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
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await focusHubControlWithTab(
      page,
      activeQueueCorrelationButton,
      'Open active queue correlation corr-growth-lead-review'
    );
    await expect(activeQueueCorrelationButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect.poll(() => interceptedCorrelationRequests.length).toBe(1);
    await expect(correlationSection.getByText('Loading correlation drilldown...')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toHaveCount(0);
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toHaveCount(0);

    releaseFirstCorrelationResponse?.();

    await expect(correlationSection.getByText('correlation refresh failed')).toBeVisible();
    await expect(correlationSection.getByText('Loading correlation drilldown...')).toHaveCount(0);
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toHaveCount(0);
    await expect(correlationSection.getByText('Counts · 0 incidents · 1 interactions · 2 events')).toHaveCount(0);
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toHaveCount(0);
    expect(interceptedCorrelationRequests).toEqual([`GET ${activeQueueCorrelationUrl}`]);

    await page.unroute(activeQueueCorrelationRoute, activeQueueCorrelationHandler);
  });

  test('shows explicit first-load fallback state when crew-overview timeline replay fails', async ({ page }) => {
    const interceptedTimelineRequests: string[] = [];
    let releaseFirstTimelineResponse: (() => void) | null = null;
    const firstTimelineResponseReleased = new Promise<void>((resolve) => {
      releaseFirstTimelineResponse = resolve;
    });
    const crewTimelineUrl = '/timeline?limit=4&window=60m';
    const crewTimelineRoute = `**${crewTimelineUrl}`;
    const crewTimelineHandler = async (route: Route) => {
      const requestUrl = new URL(route.request().url());
      const requestPath = `${route.request().method()} ${requestUrl.pathname}${requestUrl.search}`;
      interceptedTimelineRequests.push(requestPath);
      expect(requestPath).toBe(`GET ${crewTimelineUrl}`);

      await firstTimelineResponseReleased;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'internal_error', details: 'timeline replay refresh failed' })
      });
    };

    await page.route(crewTimelineRoute, crewTimelineHandler);

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const replaySection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Timeline Replay' })
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect.poll(() => interceptedTimelineRequests.length).toBe(1);
    await expect(replaySection.getByText('Loading timeline replay...')).toBeVisible();
    await expect(replaySection.getByText('timeline replay refresh failed')).toHaveCount(0);
    await expect(replaySection.getByText('Lead completed the revenue handoff', { exact: true })).toHaveCount(0);
    await expect(replaySection.getByText('No recent replay events.')).toHaveCount(0);
    await expect(replaySection.getByText(/^Scoped replay · /)).toHaveCount(0);
    await expect(replaySection.getByText('Loading scoped timeline replay...')).toHaveCount(0);
    await expect(replaySection.getByText('Scoped replay unavailable.')).toHaveCount(0);

    releaseFirstTimelineResponse?.();

    await expect(replaySection.getByText('timeline replay refresh failed')).toBeVisible();
    await expect(replaySection.getByText('Loading timeline replay...')).toHaveCount(0);
    await expect(replaySection.getByText('Lead completed the revenue handoff', { exact: true })).toHaveCount(0);
    await expect(replaySection.getByText('No recent replay events.')).toHaveCount(0);
    await expect(replaySection.getByText(/^Scoped replay · /)).toHaveCount(0);
    await expect(replaySection.getByText('Loading scoped timeline replay...')).toHaveCount(0);
    await expect(replaySection.getByText('Scoped replay unavailable.')).toHaveCount(0);
    expect(interceptedTimelineRequests).toEqual([`GET ${crewTimelineUrl}`]);

    await page.unroute(crewTimelineRoute, crewTimelineHandler);
  });

  test('keeps crew-overview auto correlation mode when re-selecting the current default active-queue correlation via keyboard traversal', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

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
            item.agent_id === 'growth-revenue'
              ? {
                  ...item,
                  correlation_id: 'corr-revenue-handoff'
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
    const replaySection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Timeline Replay' })
    });
    const selectedActiveQueueCorrelationButton = detailsPanel.getByRole('button', {
      name: 'Open active queue correlation corr-revenue-handoff, currently selected'
    });
    const scopedTimelineUrl = '/timeline?limit=4&window=60m&correlation_id=corr-revenue-handoff';
    const scopedArtifactsUrl = '/memory/artifacts?limit=4&window=60m&correlation_id=corr-revenue-handoff';

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(selectedActiveQueueCorrelationButton).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(detailsPanel.getByRole('button', { name: 'Clear' })).toHaveCount(0);
    await expect(detailsPanel.getByRole('button', { name: 'Return to current scope' })).toHaveCount(0);
    await expect(replaySection.getByText('Scoped replay · corr-revenue-handoff')).toHaveCount(0);
    await focusHubControlWithTab(
      page,
      selectedActiveQueueCorrelationButton,
      'Open active queue correlation corr-revenue-handoff, currently selected'
    );
    await expect(selectedActiveQueueCorrelationButton).toBeFocused();

    const requestCountBeforeReselect = requestedUrls.length;
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(selectedActiveQueueCorrelationButton).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(detailsPanel.getByRole('button', { name: 'Clear' })).toHaveCount(0);
    await expect(detailsPanel.getByRole('button', { name: 'Return to current scope' })).toHaveCount(0);
    await expect(replaySection.getByText('Scoped replay · corr-revenue-handoff')).toHaveCount(0);

    await page.waitForTimeout(150);

    const postReselectRequests = requestedUrls.slice(requestCountBeforeReselect);
    expect(postReselectRequests).not.toContain(scopedTimelineUrl);
    expect(postReselectRequests).not.toContain(scopedArtifactsUrl);
  });

  test('keeps a different active-queue correlation explicit and manual via keyboard traversal', async ({ page }) => {
    const requestedUrls: string[] = [];
    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

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
    const replaySection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Timeline Replay' })
    });
    const memorySection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Shared Memory' })
    });
    const activeQueueCorrelationButton = detailsPanel.getByRole('button', {
      name: 'Open active queue correlation corr-growth-lead-review'
    });
    const scopedTimelineUrl = '/timeline?limit=4&window=60m&correlation_id=corr-growth-lead-review';
    const scopedArtifactsUrl = '/memory/artifacts?limit=4&window=60m&correlation_id=corr-growth-lead-review';

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(detailsPanel.getByRole('button', { name: 'Return to current scope' })).toHaveCount(0);
    await focusHubControlWithTab(
      page,
      activeQueueCorrelationButton,
      'Open active queue correlation corr-growth-lead-review'
    );
    await expect(activeQueueCorrelationButton).toBeFocused();

    const requestCountBeforeSelection = requestedUrls.length;
    const scopedTimelineResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && response.status() === 200 && response.url().includes(scopedTimelineUrl)
    );
    const scopedArtifactsResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && response.status() === 200 && response.url().includes(scopedArtifactsUrl)
    );

    await page.keyboard.press('Enter');
    await scopedTimelineResponse;
    await scopedArtifactsResponse;

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(detailsPanel.getByRole('button', { name: 'Clear' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 1 interactions · 2 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toHaveCount(0);
    await expect(detailsPanel.getByRole('button', { name: 'Return to current scope' })).toBeVisible();
    await expect(detailsPanel.getByRole('button', { name: 'Open active queue correlation corr-growth-lead-review, currently selected' })).toBeVisible();
    await expect(replaySection.getByText('Scoped replay · corr-growth-lead-review')).toBeVisible();

    const postSelectionRequests = requestedUrls.slice(requestCountBeforeSelection);
    expect(postSelectionRequests).toContain(scopedTimelineUrl);
    expect(postSelectionRequests).toContain(scopedArtifactsUrl);
  });

  test('returns a manual active-queue correlation to the current scope via keyboard traversal', async ({ page }) => {
    const requestedUrls: string[] = [];
    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

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
    const replaySection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Timeline Replay' })
    });
    const memorySection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Shared Memory' })
    });
    const activeQueueCorrelationButton = detailsPanel.getByRole('button', {
      name: 'Open active queue correlation corr-growth-lead-review'
    });
    const selectedActiveQueueCorrelationButton = detailsPanel.getByRole('button', {
      name: 'Open active queue correlation corr-growth-lead-review, currently selected'
    });
    const returnToCurrentScopeButton = detailsPanel.getByRole('button', { name: 'Return to current scope' });
    const defaultTimelineUrl = '/timeline?limit=4&window=60m';
    const defaultArtifactsUrl = '/memory/artifacts?limit=4&window=60m';
    const scopedTimelineUrl = '/timeline?limit=4&window=60m&correlation_id=corr-growth-lead-review';
    const scopedArtifactsUrl = '/memory/artifacts?limit=4&window=60m&correlation_id=corr-growth-lead-review';

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(memorySection.getByText('Request scope · Crew overview')).toBeVisible();
    await expect(returnToCurrentScopeButton).toHaveCount(0);
    await focusHubControlWithTab(
      page,
      activeQueueCorrelationButton,
      'Open active queue correlation corr-growth-lead-review'
    );
    await expect(activeQueueCorrelationButton).toBeFocused();

    const requestCountBeforeSelection = requestedUrls.length;
    const scopedTimelineResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && response.status() === 200 && response.url().includes(scopedTimelineUrl)
    );
    const scopedArtifactsResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && response.status() === 200 && response.url().includes(scopedArtifactsUrl)
    );

    await page.keyboard.press('Enter');
    await scopedTimelineResponse;
    await scopedArtifactsResponse;

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(detailsPanel.getByRole('button', { name: 'Clear' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 1 interactions · 2 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toHaveCount(0);
    await expect(memorySection.getByText('Request scope · Crew overview · corr-growth-lead-review')).toBeVisible();
    await expect(returnToCurrentScopeButton).toBeVisible();
    await expect(selectedActiveQueueCorrelationButton).toBeVisible();
    await expect(replaySection.getByText('Scoped replay · corr-growth-lead-review')).toBeVisible();

    const requestCountBeforeReset = requestedUrls.length;
    const defaultTimelineResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.status() === 200 &&
        response.url().includes(defaultTimelineUrl) &&
        !response.url().includes('correlation_id=')
    );
    const defaultArtifactsResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.status() === 200 &&
        response.url().includes(defaultArtifactsUrl) &&
        !response.url().includes('correlation_id=')
    );

    await focusHubControlWithTab(page, returnToCurrentScopeButton, 'Return to current scope');
    await expect(returnToCurrentScopeButton).toBeFocused();
    await page.keyboard.press('Enter');
    await defaultTimelineResponse;
    await defaultArtifactsResponse;

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(detailsPanel.getByRole('button', { name: 'Clear' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
    await expect(memorySection.getByText('Request scope · Crew overview')).toBeVisible();
    await expect(memorySection.getByText('Request scope · Crew overview · corr-growth-lead-review')).toHaveCount(0);
    await expect(returnToCurrentScopeButton).toHaveCount(0);
    await expect(selectedActiveQueueCorrelationButton).toHaveCount(0);
    await expect(activeQueueCorrelationButton).toBeVisible();
    await expect(replaySection.getByText('Scoped replay · corr-growth-lead-review')).toHaveCount(0);

    const postSelectionRequests = requestedUrls.slice(requestCountBeforeSelection, requestCountBeforeReset);
    expect(postSelectionRequests).toContain(scopedTimelineUrl);
    expect(postSelectionRequests).toContain(scopedArtifactsUrl);

    const postResetRequests = requestedUrls.slice(requestCountBeforeReset);
    expect(postResetRequests).toContain(defaultTimelineUrl);
    expect(postResetRequests).toContain(defaultArtifactsUrl);
    expect(postResetRequests).not.toContain(scopedTimelineUrl);
    expect(postResetRequests).not.toContain(scopedArtifactsUrl);
  });

  test('keeps the active crew-overview correlation when opening an active-queue counterparty pivot via keyboard traversal', async ({
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
            item.agent_id === 'growth-revenue'
              ? {
                  ...item,
                  correlation_id: 'corr-revenue-secondary'
                }
              : item
          )
        }
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const clearButton = detailsPanel.getByRole('button', { name: 'Clear' });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const replaySection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Timeline Replay' })
    });
    const replayRecord = replaySection.locator('li').filter({
      has: page.getByText('Lead started reviewing the growth handoff notes', { exact: true })
    });
    const replayCorrelationButton = replayRecord.getByRole('button', {
      name: 'Open replay correlation corr-growth-lead-review'
    });
    const activeQueueCounterpartyButton = detailsPanel.getByRole('button', {
      name: 'Select active queue counterparty agent from operation growth-revenue app-engineering'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await focusHubControlWithTab(page, replayCorrelationButton, 'Open replay correlation corr-growth-lead-review');
    await expect(replayCorrelationButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 1 interactions · 2 events')).toBeVisible();
    await focusHubControlWithTab(
      page,
      activeQueueCounterpartyButton,
      'Select active queue counterparty agent from operation growth-revenue app-engineering',
      { reverse: true }
    );
    await expect(activeQueueCounterpartyButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 1 interactions · 2 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-secondary', { exact: true })).toHaveCount(0);
  });

  test('keeps the active crew-overview correlation when opening an active-queue actor pivot via keyboard traversal', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

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
            item.agent_id === 'growth-revenue'
              ? {
                  ...item,
                  correlation_id: 'corr-revenue-secondary'
                }
              : item
          )
        }
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const clearButton = detailsPanel.getByRole('button', { name: 'Clear' });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const replaySection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Timeline Replay' })
    });
    const replayRecord = replaySection.locator('li').filter({
      has: page.getByText('Lead started reviewing the growth handoff notes', { exact: true })
    });
    const replayCorrelationButton = replayRecord.getByRole('button', {
      name: 'Open replay correlation corr-growth-lead-review'
    });
    const activeQueueActorButton = detailsPanel.getByRole('button', {
      name: 'Select active queue actor from operation growth-revenue team-lead'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await focusHubControlWithTab(page, replayCorrelationButton, 'Open replay correlation corr-growth-lead-review');
    await expect(replayCorrelationButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 1 interactions · 2 events')).toBeVisible();
    await focusHubControlWithTab(
      page,
      activeQueueActorButton,
      'Select active queue actor from operation growth-revenue team-lead',
      { reverse: true }
    );
    await expect(activeQueueActorButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Team Lead' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 1 interactions · 2 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-secondary', { exact: true })).toHaveCount(0);
    expect(requestedUrls).not.toContain('/office/operations?agent_id=team-lead');
    expect(requestedUrls).not.toContain('/correlations/corr-revenue-secondary?limit=10&window=60m');
  });

  test('keeps the active selected-agent correlation and request scope when opening a current-operation counterparty pivot via keyboard traversal', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    const forbiddenRequests: string[] = [];
    const directOperationUrl = '/office/operations?agent_id=app-engineering';
    const unscopedArtifactsUrl = '/memory/artifacts?limit=4&window=60m&agent_id=app-engineering';
    const fallbackCorrelationUrl = '/correlations/corr-app-review?limit=10&window=60m';
    let trackForbiddenRequests = false;

    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    await page.route(`**${directOperationUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(directOperationUrl);
      }
      await route.continue();
    });
    await page.route(`**${unscopedArtifactsUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(unscopedArtifactsUrl);
      }
      await route.continue();
    });
    await page.route(`**${fallbackCorrelationUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(fallbackCorrelationUrl);
      }
      await route.continue();
    });

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
    const workflowUrl = '/agents/app-engineering/workflow?limit=10&window=60m';
    const scopedArtifactsUrl =
      '/memory/artifacts?limit=4&window=60m&agent_id=app-engineering&correlation_id=corr-revenue-handoff';

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(operationCounterpartyButton).toBeVisible();
    await focusHubControlWithTab(page, operationCounterpartyButton, 'Select operation counterparty agent app-engineering');
    await expect(operationCounterpartyButton).toBeFocused();

    trackForbiddenRequests = true;
    const requestCountBeforePivot = requestedUrls.length;
    const workflowResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && response.status() === 200 && response.url().includes(workflowUrl)
    );
    const scopedArtifactsResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && response.status() === 200 && response.url().includes(scopedArtifactsUrl)
    );

    await page.keyboard.press('Enter');
    await workflowResponse;
    await scopedArtifactsResponse;

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-app-review', { exact: true })).toHaveCount(0);

    const requestSettleSamples: Array<{ requestedCount: number; forbiddenCount: number }> = [];
    const isRequestStreamStable = (
      previous: { requestedCount: number; forbiddenCount: number },
      current: { requestedCount: number; forbiddenCount: number }
    ) => previous.requestedCount === current.requestedCount && previous.forbiddenCount === current.forbiddenCount;

    for (let sample = 0; sample < 6; sample += 1) {
      requestSettleSamples.push({
        requestedCount: requestedUrls.length,
        forbiddenCount: forbiddenRequests.length
      });

      if (findStableSample(requestSettleSamples, isRequestStreamStable)) {
        break;
      }

      if (sample < 5) {
        await page.waitForTimeout(100);
      }
    }

    requireStableSample(
      requestSettleSamples,
      isRequestStreamStable,
      'post-pivot request stream did not settle',
      (sample) => sample
    );

    const pivotRequestedUrls = requestedUrls.slice(requestCountBeforePivot);

    expect(pivotRequestedUrls).toContain(workflowUrl);
    expect(pivotRequestedUrls).toContain(scopedArtifactsUrl);
    expect(pivotRequestedUrls).not.toContain(directOperationUrl);
    expect(pivotRequestedUrls).not.toContain(unscopedArtifactsUrl);
    expect(pivotRequestedUrls).not.toContain(fallbackCorrelationUrl);
    expect(forbiddenRequests).toEqual([]);
  });

  test('opens a selected-agent current-operation correlation drilldown via keyboard traversal', async ({ page }) => {
    const requestedUrls: string[] = [];
    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    await page.route('**/office/operations**', async (route) => {
      const url = new URL(route.request().url());
      if (
        url.pathname !== '/office/operations' ||
        url.searchParams.get('agent_id') !== 'growth-revenue' ||
        url.searchParams.has('limit') ||
        url.searchParams.has('state')
      ) {
        await route.continue();
        return;
      }

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
            item.agent_id === 'growth-revenue'
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
    const clearButton = detailsPanel.getByRole('button', { name: 'Clear' });
    const inspectButton = detailsPanel.getByRole('button', {
      name: 'Inspect Growth Revenue Agent',
      exact: true
    });

    await focusHubControlWithTab(page, inspectButton, 'Inspect Growth Revenue Agent');
    await expect(inspectButton).toBeFocused();
    await page.keyboard.press('Enter');

    const operationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Current Operation' })
    });
    const workflowSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Workflow' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const workflowCorrelationButton = workflowSection.getByRole('button', {
      name: 'Open workflow correlation corr-revenue-handoff'
    });
    const operationCorrelationButton = operationSection.getByRole('button', {
      name: 'Open operation correlation corr-growth-lead-review'
    });
    const selectedCorrelationUrl = '/correlations/corr-growth-lead-review?limit=10&window=60m';
    const scopedArtifactsUrl =
      '/memory/artifacts?limit=4&window=60m&agent_id=growth-revenue&correlation_id=corr-growth-lead-review';

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toBeVisible();
    await expect(operationSection.getByText('planning · Prepare handoff notes')).toBeVisible();
    await expect(workflowCorrelationButton).toBeVisible();
    await expect(operationCorrelationButton).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toHaveCount(0);
    await focusHubControlWithTab(page, workflowCorrelationButton, 'Open workflow correlation corr-revenue-handoff');
    await expect(workflowCorrelationButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toBeVisible();
    await expect(operationSection.getByText('planning · Prepare handoff notes')).toBeVisible();
    await expect(operationCorrelationButton).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
    await focusHubControlWithTab(
      page,
      operationCorrelationButton,
      'Open operation correlation corr-growth-lead-review'
    );
    await expect(operationCorrelationButton).toBeFocused();

    const requestCountBeforeCorrelationOpen = requestedUrls.length;

    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toBeVisible();
    await expect(operationSection.getByText('planning · Prepare handoff notes')).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 1 interactions · 2 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toHaveCount(0);

    const getPostCorrelationSelectionRequests = () => requestedUrls.slice(requestCountBeforeCorrelationOpen);

    await expect.poll(() => getPostCorrelationSelectionRequests().includes(selectedCorrelationUrl)).toBe(true);
    await expect.poll(() => getPostCorrelationSelectionRequests().includes(scopedArtifactsUrl)).toBe(true);

    const unexpectedPostCorrelationSelectionRequests = getPostCorrelationSelectionRequests().filter((url) =>
      [
        '/office/operations?agent_id=team-lead',
        '/agents/team-lead/workflow?limit=10&window=60m',
        '/office/operations?agent_id=app-engineering',
        '/agents/app-engineering/workflow?limit=10&window=60m',
        '/memory/artifacts?limit=4&window=60m&agent_id=team-lead&correlation_id=corr-growth-lead-review'
      ].includes(url)
    );
    expect(unexpectedPostCorrelationSelectionRequests).toHaveLength(0);
  });

  test('keeps the active selected-agent correlation when opening a current-operation actor pivot via keyboard traversal', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

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
    const operationActorButton = operationSection.getByRole('button', {
      name: 'Select current operation actor from event evt_revenue_handoff_completed team-lead'
    });
    const scopedArtifactsUrl = '/memory/artifacts?limit=4&window=60m&agent_id=team-lead&correlation_id=corr-revenue-handoff';

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(operationActorButton).toBeVisible();
    await focusHubControlWithTab(
      page,
      operationActorButton,
      'Select current operation actor from event evt_revenue_handoff_completed team-lead'
    );
    await expect(operationActorButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Team Lead' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
    await expect.poll(() => requestedUrls.includes(scopedArtifactsUrl)).toBe(true);
    expect(requestedUrls).not.toContain('/office/operations?agent_id=team-lead');
    expect(requestedUrls).not.toContain('/memory/artifacts?limit=4&window=60m&agent_id=team-lead');
    expect(requestedUrls).not.toContain('/correlations/corr-growth-lead-review?limit=10&window=60m');
  });

  test('keeps the selected-agent current operation evidence jump focused on shared memory without changing selection via keyboard traversal', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
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
    const evidenceJumpButton = operationSection.getByRole('button', {
      name: 'Jump to shared memory artifact /tmp/revenue-handoff.md'
    });
    const focusedSharedMemoryRecord = detailsPanel.locator('li[data-shared-memory-target]:focus');

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toBeVisible();
    await expect(operationSection.getByText('planning · Prepare handoff notes')).toBeVisible();
    await expect(operationSection.getByText('Evidence · /tmp/revenue-handoff.md')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(evidenceJumpButton).toBeVisible();
    await expect(focusedSharedMemoryRecord).toHaveCount(0);
    await focusHubControlWithTab(page, evidenceJumpButton, 'Jump to shared memory artifact /tmp/revenue-handoff.md');
    await expect(evidenceJumpButton).toBeFocused();

    const requestCountBeforeJump = requestedUrls.length;

    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toBeVisible();
    await expect(operationSection.getByText('planning · Prepare handoff notes')).toBeVisible();
    await expect(operationSection.getByText('Evidence · /tmp/revenue-handoff.md')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
    await expect(focusedSharedMemoryRecord).toHaveCount(1);
    await expect(focusedSharedMemoryRecord).toContainText('Ref · /tmp/revenue-handoff.md');

    await page.waitForTimeout(150);

    const postJumpRequests = requestedUrls.slice(requestCountBeforeJump);
    expectOnlyBenignPostJumpRequests(postJumpRequests);
    expect(requestedUrls).not.toContain('/office/operations?agent_id=team-lead');
    expect(requestedUrls).not.toContain('/agents/team-lead/workflow?limit=10&window=60m');
    expect(requestedUrls).not.toContain(
      '/memory/artifacts?limit=4&window=60m&agent_id=team-lead&correlation_id=corr-revenue-handoff'
    );
    expect(requestedUrls).not.toContain('/correlations/corr-growth-lead-review?limit=10&window=60m');
  });

  test('falls back to one exact scoped shared-memory fetch for a selected-agent current-operation evidence jump that is outside the loaded slice', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    const scopedArtifactsUrl =
      '/memory/artifacts?limit=4&window=60m&agent_id=growth-revenue&correlation_id=corr-revenue-handoff';
    const exactArtifactUrl =
      '/memory/artifacts?limit=4&window=60m&agent_id=growth-revenue&correlation_id=corr-revenue-handoff&artifact_ref=%2Ftmp%2Frevenue-handoff.md';

    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    await page.route(`**${scopedArtifactsUrl}`, async (route) => {
      const response = await route.fetch();
      const artifacts = (await response.json()) as {
        generated_at: string;
        items: Array<Record<string, unknown>>;
      };

      await route.fulfill({
        response,
        json: {
          ...artifacts,
          items: artifacts.items.filter((item) => item.artifact_ref !== '/tmp/revenue-handoff.md')
        }
      });
    });

    await page.route(`**${exactArtifactUrl}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          generated_at: '2026-03-16T09:00:00.000Z',
          items: [
            {
              artifact_ref: '/tmp/revenue-handoff.md',
              artifact_kind: 'evidence_ref',
              file_name: 'revenue-handoff.md',
              first_seen_at: '2026-03-16T08:58:30.000Z',
              last_seen_at: '2026-03-16T08:58:30.000Z',
              mention_count: 1,
              agent_ids: ['growth-revenue', 'team-lead'],
              correlation_ids: ['corr-revenue-handoff'],
              source_kinds: ['controller_event'],
              latest_summary: 'Exact artifact fallback stayed inside the growth handoff scope',
              latest_event_type: 'agent_handoff_completed',
              collector_last_modified_at: null
            }
          ]
        }
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
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
    const memorySection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Shared Memory' })
    });
    const evidenceJumpButton = operationSection.getByRole('button', {
      name: 'Jump to shared memory artifact /tmp/revenue-handoff.md'
    });
    const focusedSharedMemoryRecord = detailsPanel.locator('li[data-shared-memory-target]:focus');

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toBeVisible();
    await expect(operationSection.getByText('planning · Prepare handoff notes')).toBeVisible();
    await expect(operationSection.getByText('Evidence · /tmp/revenue-handoff.md')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(memorySection.getByText('Request scope · growth-revenue · corr-revenue-handoff')).toBeVisible();
    await expect(memorySection.getByText('Ref · /tmp/revenue-handoff.md')).toHaveCount(0);
    await expect(evidenceJumpButton).toBeVisible();
    await focusHubControlWithTab(page, evidenceJumpButton, 'Jump to shared memory artifact /tmp/revenue-handoff.md');
    await expect(evidenceJumpButton).toBeFocused();

    const requestCountBeforeJump = requestedUrls.length;

    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toBeVisible();
    await expect(operationSection.getByText('planning · Prepare handoff notes')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(memorySection.getByText('Request scope · growth-revenue · corr-revenue-handoff')).toBeVisible();
    await expect(memorySection.getByText('Exact artifact fallback stayed inside the growth handoff scope')).toBeVisible();
    await expect(focusedSharedMemoryRecord).toHaveCount(1);
    await expect(focusedSharedMemoryRecord).toContainText('Ref · /tmp/revenue-handoff.md');

    await page.waitForTimeout(150);

    const postJumpRequests = requestedUrls.slice(requestCountBeforeJump);
    expect(postJumpRequests).toEqual([exactArtifactUrl]);
    expect(requestedUrls).not.toContain('/office/operations?agent_id=team-lead');
    expect(requestedUrls).not.toContain('/memory/artifacts?limit=4&window=60m&agent_id=growth-revenue');
    expect(requestedUrls).not.toContain('/correlations/corr-growth-lead-review?limit=10&window=60m');
  });

  test('keeps the top-level selected-agent correlation evidence jump focused on shared memory without changing selection or active correlation via keyboard traversal', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const queueButton = detailsPanel.getByRole('button', {
      name: 'Inspect Growth Revenue Agent from active queue'
    });

    await focusHubControlWithTab(page, queueButton, 'Inspect Growth Revenue Agent from active queue');
    await expect(queueButton).toBeFocused();
    await page.keyboard.press('Enter');

    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const correlationRecord = correlationSection.locator('li').filter({
      has: page.getByText('corr-revenue-handoff', { exact: true })
    });
    const evidenceJumpButton = correlationRecord.getByRole('button', {
      name: 'Jump to shared memory artifact /tmp/revenue-handoff.md'
    });
    const focusedSharedMemoryRecord = detailsPanel.locator('li[data-shared-memory-target]:focus');

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toBeVisible();
    await expect(correlationRecord.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationRecord.getByText('Evidence · /tmp/revenue-handoff.md')).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
    await expect(detailsPanel.getByRole('button', { name: 'Return to current scope' })).toHaveCount(0);
    await expect(evidenceJumpButton).toBeVisible();
    await expect(focusedSharedMemoryRecord).toHaveCount(0);
    await focusHubControlWithTab(
      page,
      evidenceJumpButton,
      'Jump to shared memory artifact /tmp/revenue-handoff.md'
    );
    await expect(evidenceJumpButton).toBeFocused();

    const requestCountBeforeJump = requestedUrls.length;

    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toBeVisible();
    await expect(correlationRecord.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationRecord.getByText('Evidence · /tmp/revenue-handoff.md')).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
    await expect(detailsPanel.getByRole('button', { name: 'Return to current scope' })).toHaveCount(0);
    await expect(focusedSharedMemoryRecord).toHaveCount(1);
    await expect(focusedSharedMemoryRecord).toContainText('Ref · /tmp/revenue-handoff.md');

    await page.waitForTimeout(150);

    const postJumpRequests = requestedUrls.slice(requestCountBeforeJump);
    expectOnlyBenignPostJumpRequests(postJumpRequests, [
      '/correlations/corr-revenue-handoff?limit=10&window=60m'
    ]);
  });

  test('jumps from crew-overview active-queue evidence refs into the shared-memory record via keyboard traversal', async ({
    page
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const queueSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Active Queue' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const stateFilter = queueSection.getByRole('combobox', { name: 'Filter active queue by state' });
    const evidenceJumpButton = queueSection.getByRole('button', {
      name: 'Jump to shared memory artifact /tmp/revenue-handoff.md'
    });
    const focusedSharedMemoryRecord = detailsPanel.locator('li[data-shared-memory-target]:focus');

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(detailsPanel.getByRole('button', { name: 'Clear' })).toHaveCount(0);
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(stateFilter).toHaveValue('');
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(evidenceJumpButton).toBeVisible();
    await focusHubControlWithTab(page, evidenceJumpButton, 'Jump to shared memory artifact /tmp/revenue-handoff.md');
    await expect(evidenceJumpButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(detailsPanel.getByRole('button', { name: 'Clear' })).toHaveCount(0);
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(stateFilter).toHaveValue('');
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(focusedSharedMemoryRecord).toHaveCount(1);
    await expect(focusedSharedMemoryRecord).toContainText('Ref · /tmp/revenue-handoff.md');
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

  test('keeps the active accountability correlation and request scope when opening an audit-signal responsibility chain pivot via keyboard traversal', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    const forbiddenRequests: string[] = [];
    const directOperationUrl = '/office/operations?agent_id=team-lead';
    const unscopedArtifactsUrl = '/memory/artifacts?limit=4&window=60m&agent_id=team-lead';
    const fallbackCorrelationUrl = '/correlations/corr-growth-lead-review?limit=10&window=60m';
    let trackForbiddenRequests = false;

    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    await page.route(`**${directOperationUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(directOperationUrl);
      }
      await route.continue();
    });
    await page.route(`**${unscopedArtifactsUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(unscopedArtifactsUrl);
      }
      await route.continue();
    });
    await page.route(`**${fallbackCorrelationUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(fallbackCorrelationUrl);
      }
      await route.continue();
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

    const auditSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Audit Signals' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const responsibilityChainButton = auditSection.getByRole('button', {
      name: 'Select responsibility chain agent team-lead'
    });
    const accountabilityCorrelationId = 'collector-snapshot:2026-03-10T23:59:40.000Z';
    const workflowUrl = '/agents/team-lead/workflow?limit=10&window=60m';
    const scopedArtifactsUrl = `/memory/artifacts?limit=4&window=60m&agent_id=team-lead&correlation_id=${encodeURIComponent(
      accountabilityCorrelationId
    )}`;

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(
      auditSection.getByRole('button', {
        name: `Open accountability correlation ${accountabilityCorrelationId}, currently selected`
      })
    ).toBeVisible();
    await expect(correlationSection.getByText(accountabilityCorrelationId, { exact: true })).toBeVisible();
    await expect(responsibilityChainButton).toBeVisible();
    await focusHubControlWithTab(
      page,
      responsibilityChainButton,
      'Select responsibility chain agent team-lead'
    );
    await expect(responsibilityChainButton).toBeFocused();

    trackForbiddenRequests = true;
    const requestCountBeforePivot = requestedUrls.length;
    const workflowResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && response.status() === 200 && response.url().includes(workflowUrl)
    );
    const scopedArtifactsResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.status() === 200 &&
        response.url().includes(scopedArtifactsUrl)
    );

    await page.keyboard.press('Enter');
    await workflowResponse;
    await scopedArtifactsResponse;

    await expect(detailsPanel.getByRole('heading', { name: 'Team Lead' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText(accountabilityCorrelationId, { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 0 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);

    const requestSettleSamples: Array<{ requestedCount: number; forbiddenCount: number }> = [];
    const isRequestStreamStable = (
      previous: { requestedCount: number; forbiddenCount: number },
      current: { requestedCount: number; forbiddenCount: number }
    ) => previous.requestedCount === current.requestedCount && previous.forbiddenCount === current.forbiddenCount;

    for (let sample = 0; sample < 6; sample += 1) {
      requestSettleSamples.push({
        requestedCount: requestedUrls.length,
        forbiddenCount: forbiddenRequests.length
      });

      if (findStableSample(requestSettleSamples, isRequestStreamStable)) {
        break;
      }

      if (sample < 5) {
        await page.waitForTimeout(100);
      }
    }

    requireStableSample(
      requestSettleSamples,
      isRequestStreamStable,
      'post-pivot request stream did not settle',
      (sample) => sample
    );

    const pivotRequestedUrls = requestedUrls.slice(requestCountBeforePivot);

    expect(pivotRequestedUrls).toContain(workflowUrl);
    expect(pivotRequestedUrls).toContain(scopedArtifactsUrl);
    expect(pivotRequestedUrls).not.toContain(directOperationUrl);
    expect(pivotRequestedUrls).not.toContain(unscopedArtifactsUrl);
    expect(pivotRequestedUrls).not.toContain(fallbackCorrelationUrl);
    expect(forbiddenRequests).toEqual([]);
  });

  test('keeps an explicitly reopened accountability correlation when opening a workflow counterparty pivot via keyboard traversal', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    const forbiddenRequests: string[] = [];
    const directOperationUrl = '/office/operations?agent_id=team-lead';
    const unscopedArtifactsUrl = '/memory/artifacts?limit=4&window=60m&agent_id=team-lead';
    const fallbackCorrelationUrl = '/correlations/corr-growth-lead-review?limit=10&window=60m';
    let trackForbiddenRequests = false;

    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    await page.route('**/agents/app-engineering/workflow?limit=10&window=60m', async (route) => {
      const response = await route.fetch();
      const workflow = (await response.json()) as {
        counterparty_agent_ids?: string[];
      };

      await route.fulfill({
        response,
        json: {
          ...workflow,
          counterparty_agent_ids: ['team-lead']
        }
      });
    });

    await page.route(`**${directOperationUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(directOperationUrl);
      }
      await route.continue();
    });
    await page.route(`**${unscopedArtifactsUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(unscopedArtifactsUrl);
      }
      await route.continue();
    });
    await page.route(`**${fallbackCorrelationUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(fallbackCorrelationUrl);
      }
      await route.continue();
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
    const auditSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Audit Signals' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const accountabilityCorrelationId = 'collector-snapshot:2026-03-10T23:59:40.000Z';
    const reopenAccountabilityButton = auditSection.getByRole('button', {
      name: `Open accountability correlation ${accountabilityCorrelationId}, currently selected`
    });
    const workflowCounterpartyButton = workflowSection.getByRole('button', {
      name: 'Select workflow counterparty agent team-lead'
    });
    const workflowUrl = '/agents/team-lead/workflow?limit=10&window=60m';
    const scopedArtifactsUrl = `/memory/artifacts?limit=4&window=60m&agent_id=team-lead&correlation_id=${encodeURIComponent(
      accountabilityCorrelationId
    )}`;

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(reopenAccountabilityButton).toBeVisible();
    await expect(correlationSection.getByText(accountabilityCorrelationId, { exact: true })).toBeVisible();
    await focusHubControlWithTab(
      page,
      reopenAccountabilityButton,
      `Open accountability correlation ${accountabilityCorrelationId}, currently selected`
    );
    await expect(reopenAccountabilityButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(correlationSection.getByText(accountabilityCorrelationId, { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 0 interactions · 1 events')).toBeVisible();
    await focusHubControlWithTab(page, workflowCounterpartyButton, 'Select workflow counterparty agent team-lead');
    await expect(workflowCounterpartyButton).toBeFocused();

    trackForbiddenRequests = true;
    const requestCountBeforePivot = requestedUrls.length;
    const workflowResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && response.status() === 200 && response.url().includes(workflowUrl)
    );
    const scopedArtifactsResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.status() === 200 &&
        response.url().includes(scopedArtifactsUrl)
    );

    await page.keyboard.press('Enter');
    await workflowResponse;
    await scopedArtifactsResponse;

    await expect(detailsPanel.getByRole('heading', { name: 'Team Lead' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText(accountabilityCorrelationId, { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 0 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
    await expect(correlationSection.getByText('No correlation selected.')).toHaveCount(0);

    const requestSettleSamples: Array<{ requestedCount: number; forbiddenCount: number }> = [];
    const isRequestStreamStable = (
      previous: { requestedCount: number; forbiddenCount: number },
      current: { requestedCount: number; forbiddenCount: number }
    ) => previous.requestedCount === current.requestedCount && previous.forbiddenCount === current.forbiddenCount;

    for (let sample = 0; sample < 6; sample += 1) {
      requestSettleSamples.push({
        requestedCount: requestedUrls.length,
        forbiddenCount: forbiddenRequests.length
      });

      if (findStableSample(requestSettleSamples, isRequestStreamStable)) {
        break;
      }

      if (sample < 5) {
        await page.waitForTimeout(100);
      }
    }

    requireStableSample(
      requestSettleSamples,
      isRequestStreamStable,
      'post-pivot request stream did not settle',
      (sample) => sample
    );

    const pivotRequestedUrls = requestedUrls.slice(requestCountBeforePivot);

    expect(pivotRequestedUrls).toContain(workflowUrl);
    expect(pivotRequestedUrls).toContain(scopedArtifactsUrl);
    expect(pivotRequestedUrls).not.toContain(directOperationUrl);
    expect(pivotRequestedUrls).not.toContain(unscopedArtifactsUrl);
    expect(pivotRequestedUrls).not.toContain(fallbackCorrelationUrl);
    expect(forbiddenRequests).toEqual([]);
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

  test('keeps the selected-agent collector tmux preview jump focused on shared memory without changing selection, correlation, or request scope via keyboard traversal', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    const tmuxArtifactRef = 'tmux://5-web3-app-engineering/0.1';
    const tmuxPreviewLabel = 'pnpm test · 2026-03-10T23:59:10.000Z';
    const collectorSnapshotPath = '/collectors/controller-snapshot';
    const scopedArtifactsUrl = '/memory/artifacts?limit=4&window=60m&agent_id=app-engineering&correlation_id=corr-revenue-handoff';

    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    await page.route(`**${collectorSnapshotPath}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          item: {
            collected_at: '2026-03-10T23:59:40.000Z',
            actor_id: 'team-lead',
            summary: {
              agent_count: 1,
              heartbeat_count: 1,
              tmux_observed_count: 1,
              workspace_observed_count: 1,
              reboot_recommended_count: 0
            },
            items: [
              {
                agent_id: 'app-engineering',
                workspace_root: '/tmp/app-engineering',
                session_ref: '5-web3-app-engineering',
                evidence_refs: ['/tmp/revenue-handoff.md'],
                workspace_observations: [
                  {
                    path: '/tmp/revenue-handoff.md',
                    file_name: 'revenue-handoff.md',
                    kind: 'workspace_file',
                    last_modified_at: '2026-03-10T23:39:00.000Z'
                  }
                ],
                tmux_observations: [
                  {
                    session_name: '5-web3-app-engineering',
                    window_index: '0',
                    pane_index: '1',
                    pane_id: '%11',
                    pane_title: 'handoff',
                    pane_current_command: 'pnpm test',
                    pane_active: true,
                    pane_dead: false,
                    pane_activity_at: '2026-03-10T23:59:10.000Z'
                  }
                ],
                supervision: {
                  watch_target: 'growth-revenue',
                  watched_by: ['team-lead'],
                  needs_attention: false
                },
                heartbeat: {
                  agent_id: 'app-engineering',
                  actor_id: 'team-lead',
                  received_at: '2026-03-10T23:59:30.000Z',
                  current_state: 'blocked',
                  active_task: 'Confirm the revenue handoff',
                  current_location: 'delivery-desk',
                  last_meaningful_output_at: '2026-03-10T23:58:00.000Z',
                  last_file_write_at: '2026-03-10T23:39:00.000Z',
                  current_blocker: '',
                  confidence_level: 'high',
                  reboot_recommended: false,
                  evidence_refs: ['/tmp/revenue-handoff.md']
                }
              }
            ]
          }
        })
      });
    });

    await page.route(`**${scopedArtifactsUrl}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          generated_at: '2026-03-10T23:59:45.000Z',
          items: [
            {
              artifact_ref: '/tmp/revenue-handoff.md',
              artifact_kind: 'workspace_file',
              file_name: 'revenue-handoff.md',
              first_seen_at: '2026-03-10T23:39:00.000Z',
              last_seen_at: '2026-03-10T23:39:00.000Z',
              mention_count: 1,
              agent_ids: ['app-engineering', 'growth-revenue'],
              correlation_ids: ['corr-revenue-handoff'],
              source_kinds: ['collector_snapshot'],
              latest_summary: 'Collector observed workspace write to revenue-handoff.md',
              latest_event_type: 'collector_snapshot_written',
              collector_last_modified_at: '2026-03-10T23:39:00.000Z'
            },
            {
              artifact_ref: tmuxArtifactRef,
              artifact_kind: 'tmux_observation',
              file_name: '5-web3-app-engineering/0.1',
              first_seen_at: '2026-03-10T23:59:10.000Z',
              last_seen_at: '2026-03-10T23:59:10.000Z',
              mention_count: 1,
              agent_ids: ['app-engineering'],
              correlation_ids: ['corr-revenue-handoff'],
              source_kinds: ['collector_snapshot'],
              latest_summary: 'Collector observed tmux handoff pane for the selected-agent scope',
              latest_event_type: 'collector_snapshot_written',
              collector_last_modified_at: '2026-03-10T23:59:10.000Z'
            }
          ]
        })
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const queueButton = detailsPanel.getByRole('button', {
      name: 'Inspect Growth Revenue Agent from active queue'
    });

    await focusHubControlWithTab(page, queueButton, 'Inspect Growth Revenue Agent from active queue');
    await expect(queueButton).toBeFocused();
    await page.keyboard.press('Enter');

    const operationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Current Operation' })
    });
    const collectorObservationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Collector Observation' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const memorySection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Shared Memory' })
    });
    const operationCounterpartyButton = operationSection.getByRole('button', {
      name: 'Select operation counterparty agent app-engineering'
    });
    const workflowUrl = '/agents/app-engineering/workflow?limit=10&window=60m';
    const workspacePreviewButton = collectorObservationSection.getByRole('button', {
      name: 'Jump to shared memory artifact /tmp/revenue-handoff.md revenue-handoff.md · 2026-03-10T23:39:00.000Z'
    });
    const tmuxPreviewButton = collectorObservationSection.getByRole('button', {
      name: `Jump to shared memory artifact ${tmuxArtifactRef} ${tmuxPreviewLabel}`
    });
    const focusedSharedMemoryRecord = detailsPanel.locator('li[data-shared-memory-target]:focus');

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(operationCounterpartyButton).toBeVisible();
    await focusHubControlWithTab(page, operationCounterpartyButton, 'Select operation counterparty agent app-engineering');
    await expect(operationCounterpartyButton).toBeFocused();

    const workflowResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && response.status() === 200 && response.url().includes(workflowUrl)
    );
    const scopedArtifactsResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && response.status() === 200 && response.url().includes(scopedArtifactsUrl)
    );

    await page.keyboard.press('Enter');
    await workflowResponse;
    await scopedArtifactsResponse;

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(collectorObservationSection).toContainText(`Tmux preview · ${tmuxPreviewLabel}`);
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('corr-app-review', { exact: true })).toHaveCount(0);
    await expect(memorySection.getByText('Request scope · app-engineering · corr-revenue-handoff')).toBeVisible();
    await expect(memorySection.getByText(`Ref · ${tmuxArtifactRef}`)).toBeVisible();
    await expect(workspacePreviewButton).toBeVisible();
    await expect(tmuxPreviewButton).toBeVisible();
    await expect(focusedSharedMemoryRecord).toHaveCount(0);
    await focusHubControlWithTab(
      page,
      workspacePreviewButton,
      'Jump to shared memory artifact /tmp/revenue-handoff.md revenue-handoff.md · 2026-03-10T23:39:00.000Z'
    );
    await expect(workspacePreviewButton).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(tmuxPreviewButton).toBeFocused();

    const requestCountBeforeJump = requestedUrls.length;

    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(collectorObservationSection).toContainText(`Tmux preview · ${tmuxPreviewLabel}`);
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('corr-app-review', { exact: true })).toHaveCount(0);
    await expect(memorySection.getByText('Request scope · app-engineering · corr-revenue-handoff')).toBeVisible();
    await expect(focusedSharedMemoryRecord).toHaveCount(1);
    await expect(focusedSharedMemoryRecord).toContainText(`Ref · ${tmuxArtifactRef}`);

    await page.waitForTimeout(150);

    const postJumpRequests = requestedUrls.slice(requestCountBeforeJump);
    expect(postJumpRequests).not.toContain('/office/operations?agent_id=growth-revenue');
    expect(postJumpRequests).not.toContain('/agents/growth-revenue/workflow?limit=10&window=60m');
    expect(postJumpRequests).not.toContain('/office/operations?agent_id=app-engineering');
    expect(postJumpRequests).not.toContain('/correlations/corr-app-review?limit=10&window=60m');
    expect(postJumpRequests).not.toContain(
      '/memory/artifacts?limit=4&window=60m&agent_id=app-engineering&correlation_id=corr-app-review'
    );
  });

  test('keeps the active crew-overview correlation when opening a collector-snapshot actor pivot via keyboard traversal', async ({
    page
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const clearButton = detailsPanel.getByRole('button', { name: 'Clear' });
    const collectorSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Collector Supervision' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const collectorSnapshotActorButton = collectorSection.getByRole('button', {
      name: 'Select collector snapshot actor team-lead'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await focusHubControlWithTab(
      page,
      collectorSnapshotActorButton,
      'Select collector snapshot actor team-lead'
    );
    await expect(collectorSnapshotActorButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Team Lead' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
  });

  test('keeps the active crew-overview correlation when opening a collector supervision watcher pivot via keyboard traversal', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const clearButton = detailsPanel.getByRole('button', { name: 'Clear' });
    const collectorSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Collector Supervision' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const watcherButton = collectorSection.getByRole('button', {
      name: 'Select collector supervision watcher from collector app-engineering team-lead'
    });
    const scopedArtifactsUrl = '/memory/artifacts?limit=4&window=60m&agent_id=team-lead&correlation_id=corr-revenue-handoff';

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await focusHubControlWithTab(
      page,
      watcherButton,
      'Select collector supervision watcher from collector app-engineering team-lead'
    );
    await expect(watcherButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Team Lead' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Workflow' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
    await expect.poll(() => requestedUrls.includes(scopedArtifactsUrl)).toBe(true);
    expect(requestedUrls).not.toContain('/memory/artifacts?limit=4&window=60m&agent_id=team-lead');
    expect(requestedUrls).not.toContain('/correlations/corr-growth-lead-review?limit=10&window=60m');
  });

  test('keeps the collector supervision watcher pivot on the existing no-correlation path when no active crew-overview correlation is selected', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    await page.route('**/incidents?limit=10&window=60m', async (route) => {
      const response = await route.fetch();
      const incidents = (await response.json()) as {
        items: Array<{
          correlation_id: string | null;
        }>;
      };

      await route.fulfill({
        response,
        json: {
          ...incidents,
          items: incidents.items.map((incident) => ({
            ...incident,
            correlation_id: null
          }))
        }
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const clearButton = detailsPanel.getByRole('button', { name: 'Clear' });
    const collectorSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Collector Supervision' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const watcherButton = collectorSection.getByRole('button', {
      name: 'Select collector supervision watcher from collector app-engineering team-lead'
    });
    const unscopedArtifactsUrl = '/memory/artifacts?limit=4&window=60m&agent_id=team-lead';

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(correlationSection.getByText('No correlation selected.')).toBeVisible();
    await focusHubControlWithTab(
      page,
      watcherButton,
      'Select collector supervision watcher from collector app-engineering team-lead'
    );
    await expect(watcherButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Team Lead' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Workflow' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('No correlation selected.')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toHaveCount(0);
    await expect.poll(() => requestedUrls.includes(unscopedArtifactsUrl)).toBe(true);
    expect(requestedUrls).not.toContain(
      '/memory/artifacts?limit=4&window=60m&agent_id=team-lead&correlation_id=corr-growth-lead-review'
    );
    expect(requestedUrls.some((url) => url.startsWith('/correlations/'))).toBe(false);
  });

  test('keeps collector watcher pivots on auto-correlation when the crew-overview incident feed errors', async ({ page }) => {
    const requestedUrls: string[] = [];
    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    await page.route('**/incidents?limit=10&window=60m', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'internal_error', details: 'incident refresh failed' })
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const clearButton = detailsPanel.getByRole('button', { name: 'Clear' });
    const collectorSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Collector Supervision' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const watcherButton = collectorSection.getByRole('button', {
      name: 'Select collector supervision watcher from collector app-engineering team-lead'
    });
    const teamLeadCorrelationUrl = '/correlations/corr-growth-lead-review?limit=10&window=60m';
    const teamLeadScopedArtifactsUrl =
      '/memory/artifacts?limit=4&window=60m&agent_id=team-lead&correlation_id=corr-growth-lead-review';

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(detailsPanel.getByText('incident refresh failed')).toBeVisible();
    await expect(correlationSection.getByText('No correlation selected.')).toBeVisible();
    expect(requestedUrls).not.toContain(teamLeadCorrelationUrl);
    expect(requestedUrls).not.toContain(teamLeadScopedArtifactsUrl);
    await focusHubControlWithTab(
      page,
      watcherButton,
      'Select collector supervision watcher from collector app-engineering team-lead'
    );
    await expect(watcherButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Team Lead' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Workflow' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 1 interactions · 2 events')).toBeVisible();
    await expect(correlationSection.getByText('No correlation selected.')).toHaveCount(0);
    await expect.poll(() => requestedUrls.includes(teamLeadCorrelationUrl)).toBe(true);
    await expect.poll(() => requestedUrls.includes(teamLeadScopedArtifactsUrl)).toBe(true);
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

  test('keeps the active crew-overview correlation when opening a watch topology target endpoint pivot via keyboard traversal', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const clearButton = detailsPanel.getByRole('button', { name: 'Clear' });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const topologyPivotButton = detailsPanel.getByRole('button', {
      name: 'Select watch topology target agent from lead edge team-lead app-engineering'
    });
    const scopedArtifactsUrl =
      '/memory/artifacts?limit=4&window=60m&agent_id=app-engineering&correlation_id=corr-revenue-handoff';

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await focusHubControlWithTab(
      page,
      topologyPivotButton,
      'Select watch topology target agent from lead edge team-lead app-engineering'
    );
    await expect(topologyPivotButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Workflow' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
    await expect.poll(() => requestedUrls.includes('/agents/app-engineering/workflow?limit=10&window=60m')).toBe(true);
    await expect.poll(() => requestedUrls.includes(scopedArtifactsUrl)).toBe(true);
    expect(requestedUrls).not.toContain('/memory/artifacts?limit=4&window=60m&agent_id=app-engineering');
    expect(requestedUrls).not.toContain('/agents/app-engineering/incidents?limit=10&window=60m');
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
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();

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

    const workflowSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Workflow' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const timelineActorButton = correlationSection.getByRole('button', {
      name: 'Select correlation timeline actor from event evt_growth_review_started team-lead'
    });
    const workflowCorrelationButton = workflowSection.getByRole('button', {
      name: 'Open workflow correlation corr-growth-lead-review'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await focusHubControlWithTab(page, workflowCorrelationButton, 'Open workflow correlation corr-growth-lead-review');
    await expect(workflowCorrelationButton).toBeFocused();
    await page.keyboard.press('Enter');
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

  test('keeps the active replay correlation when opening a replay agent pivot via keyboard traversal', async ({ page }) => {
    const requestedUrls: string[] = [];
    const forbiddenRequests: string[] = [];
    const directOperationUrl = '/office/operations?agent_id=growth-revenue';
    const unscopedArtifactsUrl = '/memory/artifacts?limit=4&window=60m&agent_id=growth-revenue';
    const fallbackCorrelationUrl = '/correlations/corr-revenue-handoff?limit=10&window=60m';
    let trackForbiddenRequests = false;

    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    await page.route(`**${directOperationUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(directOperationUrl);
      }
      await route.continue();
    });
    await page.route(`**${unscopedArtifactsUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(unscopedArtifactsUrl);
      }
      await route.continue();
    });
    await page.route(`**${fallbackCorrelationUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(fallbackCorrelationUrl);
      }
      await route.continue();
    });

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
    const replayAgentButton = replayRecord.getByRole('button', {
      name: 'Select replay agent growth-revenue from event evt_growth_review_started'
    });
    const workflowUrl = '/agents/growth-revenue/workflow?limit=10&window=60m';
    const scopedArtifactsUrl =
      '/memory/artifacts?limit=4&window=60m&agent_id=growth-revenue&correlation_id=corr-growth-lead-review';

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();

    await focusHubControlWithTab(page, replayCorrelationButton, 'Open replay correlation corr-growth-lead-review');
    await expect(replayCorrelationButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 1 interactions · 2 events')).toBeVisible();
    await focusHubControlWithTab(
      page,
      replayAgentButton,
      'Select replay agent growth-revenue from event evt_growth_review_started'
    );
    await expect(replayAgentButton).toBeFocused();

    trackForbiddenRequests = true;
    const requestCountBeforePivot = requestedUrls.length;
    const workflowResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && response.status() === 200 && response.url().includes(workflowUrl)
    );
    const scopedArtifactsResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.status() === 200 &&
        response.url().includes(scopedArtifactsUrl)
    );

    await page.keyboard.press('Enter');
    await workflowResponse;
    await scopedArtifactsResponse;

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Workflow' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 1 interactions · 2 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toHaveCount(0);

    const requestSettleSamples: Array<{ requestedCount: number; forbiddenCount: number }> = [];
    const isRequestStreamStable = (
      previous: { requestedCount: number; forbiddenCount: number },
      current: { requestedCount: number; forbiddenCount: number }
    ) => previous.requestedCount === current.requestedCount && previous.forbiddenCount === current.forbiddenCount;

    for (let sample = 0; sample < 6; sample += 1) {
      requestSettleSamples.push({
        requestedCount: requestedUrls.length,
        forbiddenCount: forbiddenRequests.length
      });

      if (findStableSample(requestSettleSamples, isRequestStreamStable)) {
        break;
      }

      if (sample < 5) {
        await page.waitForTimeout(100);
      }
    }

    requireStableSample(
      requestSettleSamples,
      isRequestStreamStable,
      'post-pivot request stream did not settle',
      (sample) => sample
    );

    const pivotRequestedUrls = requestedUrls.slice(requestCountBeforePivot);

    expect(pivotRequestedUrls).toContain(workflowUrl);
    expect(pivotRequestedUrls).toContain(scopedArtifactsUrl);
    expect(pivotRequestedUrls).not.toContain(directOperationUrl);
    expect(pivotRequestedUrls).not.toContain(unscopedArtifactsUrl);
    expect(pivotRequestedUrls).not.toContain(fallbackCorrelationUrl);
    expect(forbiddenRequests).toEqual([]);
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
      'Select replay actor from event evt_growth_review_started team-lead',
      { reverse: true }
    );
    await expect(replayActorButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Team Lead' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 1 interactions · 2 events')).toBeVisible();
  });

  test('keeps crew-overview replay default correlation reselect on the auto path via keyboard traversal', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const replaySection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Timeline Replay' })
    });
    const selectedReplayCorrelationButton = replaySection.getByRole('button', {
      name: 'Open replay correlation corr-revenue-handoff, currently selected'
    });
    const scopedTimelineUrl = '/timeline?limit=4&window=60m&correlation_id=corr-revenue-handoff';
    const scopedArtifactsUrl = '/memory/artifacts?limit=4&window=60m&correlation_id=corr-revenue-handoff';

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(selectedReplayCorrelationButton).toBeVisible();
    await expect(detailsPanel.getByRole('button', { name: 'Return to current scope' })).toHaveCount(0);
    await expect(replaySection.getByText('Scoped replay · corr-revenue-handoff')).toHaveCount(0);
    await focusHubControlWithTab(
      page,
      selectedReplayCorrelationButton,
      'Open replay correlation corr-revenue-handoff, currently selected'
    );
    await expect(selectedReplayCorrelationButton).toBeFocused();

    const requestCountBeforeReselect = requestedUrls.length;
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(selectedReplayCorrelationButton).toBeVisible();
    await expect(detailsPanel.getByRole('button', { name: 'Return to current scope' })).toHaveCount(0);
    await expect(replaySection.getByText('Scoped replay · corr-revenue-handoff')).toHaveCount(0);

    await page.waitForTimeout(150);

    const postReselectRequests = requestedUrls.slice(requestCountBeforeReselect);
    expect(postReselectRequests).not.toContain(scopedTimelineUrl);
    expect(postReselectRequests).not.toContain(scopedArtifactsUrl);
  });

  test('keeps the crew-overview replay evidence jump focused on shared memory without changing selection or the active replay correlation via keyboard traversal', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const replaySection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Timeline Replay' })
    });
    const memorySection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Shared Memory' })
    });
    const replayRecord = replaySection.locator('li').filter({
      has: page.getByText('Lead completed the revenue handoff', { exact: true })
    });
    const selectedReplayCorrelationButton = replayRecord.getByRole('button', {
      name: 'Open replay correlation corr-revenue-handoff, currently selected'
    });
    const selectedSharedMemoryCorrelationButton = memorySection.getByRole('button', {
      name: 'Open shared memory correlation corr-revenue-handoff, currently selected'
    });
    const evidenceJumpButton = replayRecord.getByRole('button', {
      name: 'Jump to shared memory artifact /tmp/revenue-handoff.md'
    });
    const focusedSharedMemoryRecord = detailsPanel.locator('li[data-shared-memory-target]:focus');

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(selectedReplayCorrelationButton).toBeVisible();
    await expect(selectedSharedMemoryCorrelationButton).toBeVisible();
    await expect(memorySection.getByText('Ref · /tmp/revenue-handoff.md')).toBeVisible();
    await expect(detailsPanel.getByRole('button', { name: 'Clear' })).toHaveCount(0);
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(detailsPanel.getByRole('button', { name: 'Return to current scope' })).toHaveCount(0);
    await expect(replaySection.getByText('Scoped replay · corr-revenue-handoff')).toHaveCount(0);
    await expect(evidenceJumpButton).toBeVisible();
    await expect(focusedSharedMemoryRecord).toHaveCount(0);
    await focusHubControlWithTab(page, evidenceJumpButton, 'Jump to shared memory artifact /tmp/revenue-handoff.md');
    await expect(evidenceJumpButton).toBeFocused();

    const requestCountBeforeJump = requestedUrls.length;
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(selectedReplayCorrelationButton).toBeVisible();
    await expect(selectedSharedMemoryCorrelationButton).toBeVisible();
    await expect(detailsPanel.getByRole('button', { name: 'Clear' })).toHaveCount(0);
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(detailsPanel.getByRole('button', { name: 'Return to current scope' })).toHaveCount(0);
    await expect(replaySection.getByText('Scoped replay · corr-revenue-handoff')).toHaveCount(0);
    await expect(focusedSharedMemoryRecord).toHaveCount(1);
    await expect(focusedSharedMemoryRecord).toContainText('Ref · /tmp/revenue-handoff.md');

    await page.waitForTimeout(150);

    const postJumpRequests = requestedUrls.slice(requestCountBeforeJump);
    expect(postJumpRequests).not.toContain('/office/operations?agent_id=growth-revenue');
    expect(postJumpRequests).not.toContain('/agents/growth-revenue/workflow?limit=10&window=60m');
    expect(postJumpRequests).not.toContain('/timeline?limit=4&window=60m&correlation_id=corr-revenue-handoff');
    expect(postJumpRequests).not.toContain('/memory/artifacts?limit=4&window=60m&correlation_id=corr-revenue-handoff');
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
      'Select replay counterparty from event evt_growth_review_started team-lead',
      { reverse: true }
    );
    await expect(replayCounterpartyButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Team Lead' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 1 interactions · 2 events')).toBeVisible();
  });

  test('falls back to the replay event correlation when opening a replay counterparty pivot via keyboard traversal', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    const forbiddenRequests: string[] = [];
    const fallbackCorrelationId = 'corr-browser-replay-counterparty-fallback';
    const fallbackCorrelationUrl = `/correlations/${fallbackCorrelationId}?limit=10&window=60m`;
    const fallbackArtifactsUrl = `/memory/artifacts?limit=4&window=60m&agent_id=team-lead&correlation_id=${fallbackCorrelationId}`;
    const staleCorrelationUrl = '/correlations/corr-growth-lead-review?limit=10&window=60m';
    const staleArtifactsUrl = '/memory/artifacts?limit=4&window=60m&agent_id=team-lead&correlation_id=corr-growth-lead-review';
    const teamLeadWorkflowUrl = '/agents/team-lead/workflow?limit=10&window=60m';
    let trackForbiddenRequests = false;

    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    await page.route(`**${staleCorrelationUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(staleCorrelationUrl);
      }
      await route.continue();
    });
    await page.route(`**${staleArtifactsUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(staleArtifactsUrl);
      }
      await route.continue();
    });

    await page.route('**/incidents?limit=10&window=60m', async (route) => {
      const response = await route.fetch();
      const incidents = (await response.json()) as { items: Array<Record<string, unknown>> };

      await route.fulfill({
        response,
        json: {
          ...incidents,
          items: incidents.items.map((incident) => ({
            ...incident,
            correlation_id: null
          }))
        }
      });
    });

    await page.route('**/timeline?limit=4&window=60m', async (route) => {
      const response = await route.fetch();
      const timeline = (await response.json()) as { items: Array<Record<string, unknown>> };
      const seedEvent = timeline.items[0] ?? {};

      await route.fulfill({
        response,
        json: {
          ...timeline,
          items: [
            {
              ...seedEvent,
              event_id: 'evt_browser_replay_counterparty_fallback',
              ts: '2026-03-16T09:03:00.000Z',
              agent_id: 'growth-revenue',
              actor_id: 'growth-revenue',
              event_type: 'agent_noted',
              severity: 'yellow',
              current_state: 'reviewing',
              location: 'meeting-zone',
              summary: 'Replay counterparty fallback uses the replay event correlation',
              correlation_id: fallbackCorrelationId,
              counterparty_agent_ids: ['team-lead'],
              evidence_refs: ['/tmp/replay-fallback.md'],
              source_kind: 'controller_event'
            },
            ...timeline.items
          ]
        }
      });
    });

    await page.route(`**/correlations/${fallbackCorrelationId}?limit=10&window=60m`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          correlation_id: fallbackCorrelationId,
          participant_agent_ids: ['growth-revenue', 'team-lead'],
          evidence_refs: ['/tmp/replay-fallback.md'],
          first_ts: '2026-03-16T09:03:00.000Z',
          last_ts: '2026-03-16T09:03:00.000Z',
          incident_count: 0,
          interaction_count: 0,
          event_count: 1,
          incidents: [],
          interactions: [],
          timeline: [
            {
              event_id: 'evt_browser_replay_counterparty_fallback',
              ts: '2026-03-16T09:03:00.000Z',
              agent_id: 'growth-revenue',
              actor_id: 'growth-revenue',
              event_type: 'agent_noted',
              severity: 'yellow',
              current_state: 'reviewing',
              location: 'meeting-zone',
              summary: 'Replay counterparty fallback uses the replay event correlation',
              correlation_id: fallbackCorrelationId,
              counterparty_agent_ids: ['team-lead'],
              evidence_refs: ['/tmp/replay-fallback.md'],
              source_kind: 'controller_event'
            }
          ]
        }
      });
    });

    await page.route(`**/memory/artifacts?limit=4&window=60m&agent_id=team-lead&correlation_id=${fallbackCorrelationId}`, async (
      route
    ) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          generated_at: '2026-03-16T09:03:00.000Z',
          items: [
            {
              artifact_ref: '/tmp/replay-fallback.md',
              artifact_kind: 'evidence_ref',
              file_name: 'replay-fallback.md',
              first_seen_at: '2026-03-16T09:03:00.000Z',
              last_seen_at: '2026-03-16T09:03:00.000Z',
              mention_count: 1,
              agent_ids: ['growth-revenue', 'team-lead'],
              correlation_ids: [fallbackCorrelationId],
              source_kinds: ['controller_event'],
              latest_summary: 'Replay fallback preserved the replay event correlation on pivot',
              latest_event_type: 'agent_noted',
              collector_last_modified_at: null
            }
          ]
        }
      });
    });

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
      has: page.getByText('Replay counterparty fallback uses the replay event correlation', { exact: true })
    });
    const replayCounterpartyButton = replayRecord.getByRole('button', {
      name: 'Select replay counterparty from event evt_browser_replay_counterparty_fallback team-lead'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(correlationSection.getByText('No correlation selected.')).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
    await focusHubControlWithTab(
      page,
      replayCounterpartyButton,
      'Select replay counterparty from event evt_browser_replay_counterparty_fallback team-lead'
    );
    await expect(replayCounterpartyButton).toBeFocused();

    trackForbiddenRequests = true;
    const requestCountBeforePivot = requestedUrls.length;
    const workflowResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && response.status() === 200 && response.url().includes(teamLeadWorkflowUrl)
    );
    const correlationResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && response.status() === 200 && response.url().includes(fallbackCorrelationUrl)
    );
    const artifactsResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && response.status() === 200 && response.url().includes(fallbackArtifactsUrl)
    );

    await page.keyboard.press('Enter');
    await workflowResponse;
    await correlationResponse;
    await artifactsResponse;

    await expect(detailsPanel.getByRole('heading', { name: 'Team Lead' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText(fallbackCorrelationId, { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 0 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('No correlation selected.')).toHaveCount(0);
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);

    const requestSettleSamples: Array<{ requestedCount: number; forbiddenCount: number }> = [];
    const isRequestStreamStable = (
      previous: { requestedCount: number; forbiddenCount: number },
      current: { requestedCount: number; forbiddenCount: number }
    ) => previous.requestedCount === current.requestedCount && previous.forbiddenCount === current.forbiddenCount;

    for (let sample = 0; sample < 6; sample += 1) {
      requestSettleSamples.push({
        requestedCount: requestedUrls.length,
        forbiddenCount: forbiddenRequests.length
      });

      if (findStableSample(requestSettleSamples, isRequestStreamStable)) {
        break;
      }

      if (sample < 5) {
        await page.waitForTimeout(100);
      }
    }

    requireStableSample(
      requestSettleSamples,
      isRequestStreamStable,
      'post-pivot replay fallback request stream did not settle',
      (sample) => sample
    );

    const pivotRequestedUrls = requestedUrls.slice(requestCountBeforePivot);
    expect(pivotRequestedUrls).toContain(teamLeadWorkflowUrl);
    expect(pivotRequestedUrls).toContain(fallbackCorrelationUrl);
    expect(pivotRequestedUrls).toContain(fallbackArtifactsUrl);
    expect(pivotRequestedUrls).not.toContain(staleCorrelationUrl);
    expect(pivotRequestedUrls).not.toContain(staleArtifactsUrl);
    expect(forbiddenRequests).toEqual([]);
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
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();

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
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();

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
        await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();

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
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await focusHubControlWithTab(
      page,
      workflowInteractionCorrelationButton,
      'Open workflow interaction correlation from interaction interaction-browser-workflow-correlation corr-revenue-handoff'
    );
    await expect(workflowInteractionCorrelationButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
  });

  test('keeps the selected-agent workflow interaction evidence jump focused on shared memory without changing selection or active correlation via keyboard traversal', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

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
                interaction_id: 'interaction-browser-workflow-evidence-jump',
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
                summary: 'Workflow interaction evidence jump stays in shared memory',
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

    await focusHubControlWithTab(page, inspectButton, 'Inspect Growth Revenue Agent');
    await expect(inspectButton).toBeFocused();
    await page.keyboard.press('Enter');

    const workflowSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Workflow' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const workflowInteractionRecord = workflowSection
      .getByText('Workflow interaction evidence jump stays in shared memory')
      .locator('xpath=ancestor::li[contains(@class,"aitown-record")][1]');
    const evidenceJumpButton = workflowInteractionRecord.getByRole('button', {
      name: 'Jump to shared memory artifact /tmp/revenue-handoff.md'
    });
    const focusedSharedMemoryRecord = detailsPanel.locator('li[data-shared-memory-target]:focus');

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(workflowInteractionRecord.getByText('Workflow interaction evidence jump stays in shared memory')).toBeVisible();
    await expect(workflowInteractionRecord.getByText('Evidence · /tmp/revenue-handoff.md')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
    await expect(evidenceJumpButton).toBeVisible();
    await expect(focusedSharedMemoryRecord).toHaveCount(0);
    await focusHubControlWithTab(page, evidenceJumpButton, 'Jump to shared memory artifact /tmp/revenue-handoff.md');
    await expect(evidenceJumpButton).toBeFocused();

    const requestCountBeforeJump = requestedUrls.length;

    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(workflowInteractionRecord.getByText('Workflow interaction evidence jump stays in shared memory')).toBeVisible();
    await expect(workflowInteractionRecord.getByText('Evidence · /tmp/revenue-handoff.md')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
    await expect(focusedSharedMemoryRecord).toHaveCount(1);
    await expect(focusedSharedMemoryRecord).toContainText('Ref · /tmp/revenue-handoff.md');

    await page.waitForTimeout(150);

    const postJumpRequests = requestedUrls.slice(requestCountBeforeJump);
    expectOnlyBenignPostJumpRequests(postJumpRequests);
    expect(requestedUrls).not.toContain('/agents/team-lead/workflow?limit=10&window=60m');
    expect(requestedUrls).not.toContain(
      '/memory/artifacts?limit=4&window=60m&agent_id=team-lead&correlation_id=corr-revenue-handoff'
    );
    expect(requestedUrls).not.toContain('/correlations/corr-growth-lead-review?limit=10&window=60m');
  });

  test('keeps the active workflow correlation when opening a workflow interaction participant pivot via keyboard traversal', async ({
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
                interaction_id: 'interaction-browser-workflow-participant',
                interaction_type: 'handoff',
                correlation_id: 'corr-revenue-handoff',
                started_at: '2026-03-10T23:35:00.000Z',
                ended_at: '2026-03-10T23:40:00.000Z',
                participant_agent_ids: ['growth-revenue', 'app-engineering', 'ghost-agent'],
                trigger_event_id: 'evt_revenue_handoff_completed',
                before_state: 'reviewing',
                after_state: 'planning',
                severity: 'yellow',
                evidence_refs: ['/tmp/revenue-handoff.md'],
                summary: 'Workflow interaction participant pivot keeps the active growth correlation',
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
    const clearButton = detailsPanel.getByRole('button', { name: 'Clear' });
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

    const workflowInteractionParticipantButton = workflowSection.getByRole('button', {
      name: 'Select workflow interaction participant from interaction interaction-browser-workflow-participant app-engineering'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await focusHubControlWithTab(
      page,
      workflowInteractionParticipantButton,
      'Select workflow interaction participant from interaction interaction-browser-workflow-participant app-engineering'
    );
    await expect(workflowInteractionParticipantButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
  });

  test('falls back to the workflow interaction correlation when opening a workflow interaction participant pivot via keyboard traversal', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    await page.route('**/agents/app-engineering/workflow?limit=10&window=60m', async (route) => {
      const response = await route.fetch();
      const workflow = (await response.json()) as {
        correlation_ids?: string[];
        detail: {
          open_peer_watch_alerts?: unknown[];
          recent_interactions?: unknown[];
        };
      };

      await route.fulfill({
        response,
        json: {
          ...workflow,
          correlation_ids: [],
          detail: {
            ...workflow.detail,
            open_peer_watch_alerts: [],
            recent_interactions: [
              {
                interaction_id: 'interaction-browser-workflow-participant-fallback',
                interaction_type: 'peer_watch',
                correlation_id: 'corr-app-review',
                started_at: '2026-03-16T08:49:00.000Z',
                ended_at: '2026-03-16T08:58:00.000Z',
                participant_agent_ids: ['app-engineering', 'team-lead', 'ghost-agent'],
                trigger_event_id: 'evt-browser-workflow-participant-fallback',
                before_state: 'coding',
                after_state: 'blocked',
                severity: 'orange',
                evidence_refs: [],
                summary: 'Workflow interaction participant pivot falls back to its own correlation',
                related_event_ids: ['evt-browser-workflow-participant-fallback']
              },
              ...(workflow.detail.recent_interactions ?? [])
            ]
          }
        }
      });
    });

    await page.route('**/correlations/corr-app-review?limit=10&window=60m', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          correlation_id: 'corr-app-review',
          participant_agent_ids: ['app-engineering', 'team-lead'],
          evidence_refs: ['/tmp/evidence.md', '/tmp/peer-watch.md'],
          first_ts: '2026-03-16T08:49:00.000Z',
          last_ts: '2026-03-16T08:50:00.000Z',
          incident_count: 1,
          interaction_count: 1,
          event_count: 1,
          incidents: [
            {
              incident_id: 'inc-browser-app-review',
              kind: 'peer_watch',
              ts: '2026-03-16T08:50:00.000Z',
              agent_id: 'app-engineering',
              actor_id: 'team-lead',
              status: 'open',
              severity: 'orange',
              summary: 'Lead is still waiting on workflow evidence',
              correlation_id: 'corr-app-review',
              evidence_refs: ['/tmp/evidence.md'],
              counterparty_agent_ids: ['team-lead'],
              source_kind: 'controller_event'
            }
          ],
          interactions: [
            {
              interaction_id: 'interaction-browser-workflow-participant-fallback',
              interaction_type: 'peer_watch',
              correlation_id: 'corr-app-review',
              started_at: '2026-03-16T08:49:00.000Z',
              ended_at: '2026-03-16T08:58:00.000Z',
              participant_agent_ids: ['app-engineering', 'team-lead'],
              trigger_event_id: 'evt-browser-workflow-participant-fallback',
              before_state: 'coding',
              after_state: 'blocked',
              severity: 'orange',
              evidence_refs: ['/tmp/evidence.md'],
              summary: 'Workflow interaction participant pivot falls back to its own correlation',
              related_event_ids: ['evt-browser-workflow-participant-fallback']
            }
          ],
          timeline: [
            {
              event_id: 'evt-browser-workflow-participant-fallback',
              ts: '2026-03-16T08:50:00.000Z',
              agent_id: 'app-engineering',
              actor_id: 'team-lead',
              event_type: 'peer_watch_alert_raised',
              severity: 'orange',
              current_state: 'blocked',
              location: 'meeting-zone',
              summary: 'Workflow evidence is still incomplete',
              correlation_id: 'corr-app-review',
              counterparty_agent_ids: ['team-lead'],
              evidence_refs: ['/tmp/evidence.md'],
              source_kind: 'controller_event'
            }
          ]
        }
      });
    });

    await page.route('**/memory/artifacts?limit=4&window=60m&agent_id=team-lead&correlation_id=corr-app-review', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          generated_at: '2026-03-16T09:00:00.000Z',
          items: [
            {
              artifact_ref: '/tmp/evidence.md',
              artifact_kind: 'evidence_ref',
              file_name: 'evidence.md',
              first_seen_at: '2026-03-16T08:40:00.000Z',
              last_seen_at: '2026-03-16T08:58:00.000Z',
              mention_count: 3,
              agent_ids: ['app-engineering', 'team-lead'],
              correlation_ids: ['corr-app-review'],
              source_kinds: ['controller_event', 'workspace_snapshot'],
              latest_summary: 'Team lead preserved the active review evidence context',
              latest_event_type: 'peer_watch_alert_raised',
              collector_last_modified_at: '2026-03-16T08:58:00.000Z'
            }
          ]
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
    const workflowSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Workflow' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const workflowInteractionRecord = workflowSection.locator('li').filter({
      hasText: 'Workflow interaction participant pivot falls back to its own correlation'
    });
    const workflowInteractionParticipantButton = workflowSection.getByRole('button', {
      name: 'Select workflow interaction participant from interaction interaction-browser-workflow-participant-fallback team-lead'
    });

    await focusHubControlWithTab(page, inspectButton, 'Inspect App Engineering Agent');
    await expect(inspectButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(correlationSection.getByText('No correlation selected.')).toBeVisible();
    await expect(workflowInteractionRecord).toHaveCount(1);
    await expect(workflowInteractionRecord).toContainText('Participants · app-engineering, team-lead, ghost-agent');
    await expect(
      workflowInteractionRecord.locator('button, a[href], [tabindex]:not([tabindex="-1"])').filter({ hasText: 'app-engineering' })
    ).toHaveCount(0);
    await expect(
      workflowInteractionRecord.locator('button, a[href], [tabindex]:not([tabindex="-1"])').filter({ hasText: 'ghost-agent' })
    ).toHaveCount(0);
    await focusHubControlWithTab(
      page,
      workflowInteractionParticipantButton,
      'Select workflow interaction participant from interaction interaction-browser-workflow-participant-fallback team-lead'
    );
    await expect(workflowInteractionParticipantButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Team Lead' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-app-review', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
    await expect(correlationSection.getByText('No correlation selected.')).toHaveCount(0);
    expect(requestedUrls).toContain('/correlations/corr-app-review?limit=10&window=60m');
    expect(requestedUrls).toContain('/memory/artifacts?limit=4&window=60m&agent_id=team-lead&correlation_id=corr-app-review');
    expect(requestedUrls).not.toContain('/correlations/corr-growth-lead-review?limit=10&window=60m');
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
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
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

  test('keeps selected-agent auto correlation mode when re-selecting the current default correlation from workflow status via keyboard traversal', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
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
    const selectedWorkflowStatusCorrelationButton = workflowSection.getByRole('button', {
      name: 'Open workflow status correlation corr-revenue-handoff, currently selected'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toBeVisible();
    await expect(selectedWorkflowStatusCorrelationButton).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(detailsPanel.getByRole('button', { name: 'Return to current scope' })).toHaveCount(0);
    await focusHubControlWithTab(
      page,
      selectedWorkflowStatusCorrelationButton,
      'Open workflow status correlation corr-revenue-handoff, currently selected'
    );
    await expect(selectedWorkflowStatusCorrelationButton).toBeFocused();

    const requestCountBeforeReselect = requestedUrls.length;
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toBeVisible();
    await expect(selectedWorkflowStatusCorrelationButton).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(detailsPanel.getByRole('button', { name: 'Return to current scope' })).toHaveCount(0);

    await page.waitForTimeout(150);

    expect(requestedUrls).toHaveLength(requestCountBeforeReselect);
  });

  test('switches the active correlation from a workflow status correlation button without changing the selected agent via keyboard traversal', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    const forbiddenRequests: string[] = [];
    const selectedCorrelationUrl = '/correlations/corr-growth-lead-review?limit=10&window=60m';
    const staleCorrelationUrl = '/correlations/corr-revenue-handoff?limit=10&window=60m';
    const scopedArtifactsUrl =
      '/memory/artifacts?limit=4&window=60m&agent_id=growth-revenue&correlation_id=corr-growth-lead-review';
    const staleScopedArtifactsUrl =
      '/memory/artifacts?limit=4&window=60m&agent_id=growth-revenue&correlation_id=corr-revenue-handoff';
    const unscopedArtifactsUrl = '/memory/artifacts?limit=4&window=60m&agent_id=growth-revenue';
    let trackForbiddenRequests = false;

    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    await page.route(`**${staleCorrelationUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(staleCorrelationUrl);
      }
      await route.continue();
    });
    await page.route(`**${staleScopedArtifactsUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(staleScopedArtifactsUrl);
      }
      await route.continue();
    });
    await page.route(`**${unscopedArtifactsUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(unscopedArtifactsUrl);
      }
      await route.continue();
    });
    await page.route('**/agents/growth-revenue/workflow?limit=10&window=60m', async (route) => {
      const response = await route.fetch();
      const workflow = (await response.json()) as {
        detail: {
          recent_handoffs?: Array<{
            handoff_id: string;
            correlation_id: string | null;
          }>;
        };
      };
      let matchedHandoff = false;
      const recentHandoffs = (workflow.detail.recent_handoffs ?? []).map((handoff) => {
        if (handoff.handoff_id !== 'evt_revenue_handoff_completed') {
          return handoff;
        }

        matchedHandoff = true;
        return {
          ...handoff,
          correlation_id: 'corr-growth-lead-review'
        };
      });

      if (!matchedHandoff) {
        throw new Error('browser smoke fixture must expose a workflow handoff status record for growth-revenue');
      }

      await route.fulfill({
        response,
        json: {
          ...workflow,
          detail: {
            ...workflow.detail,
            recent_handoffs: recentHandoffs
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

    await focusHubControlWithTab(page, inspectButton, 'Inspect Growth Revenue Agent');
    await expect(inspectButton).toBeFocused();
    await page.keyboard.press('Enter');

    const operationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Current Operation' })
    });
    const workflowSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Workflow' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const workflowStatusCorrelationButton = workflowSection.getByRole('button', {
      name: 'Open workflow status correlation corr-growth-lead-review'
    });
    const selectedWorkflowStatusCorrelationButton = workflowSection.getByRole('button', {
      name: 'Open workflow status correlation corr-growth-lead-review, currently selected'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toBeVisible();
    await expect(operationSection.getByText('planning · Prepare handoff notes')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
    await focusHubControlWithTab(
      page,
      workflowStatusCorrelationButton,
      'Open workflow status correlation corr-growth-lead-review'
    );
    await expect(workflowStatusCorrelationButton).toBeFocused();

    trackForbiddenRequests = true;
    const requestCountBeforeCorrelationOpen = requestedUrls.length;
    const selectedCorrelationResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.status() === 200 &&
        response.url().includes(selectedCorrelationUrl)
    );
    const scopedArtifactsResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.status() === 200 &&
        response.url().includes(scopedArtifactsUrl)
    );

    await page.keyboard.press('Enter');
    await selectedCorrelationResponse;
    await scopedArtifactsResponse;

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toBeVisible();
    await expect(operationSection.getByText('planning · Prepare handoff notes')).toBeVisible();
    await expect(selectedWorkflowStatusCorrelationButton).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 1 interactions · 2 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toHaveCount(0);

    const requestSettleSamples: Array<{ requestedCount: number; forbiddenCount: number }> = [];
    const isRequestStreamStable = (
      previous: { requestedCount: number; forbiddenCount: number },
      current: { requestedCount: number; forbiddenCount: number }
    ) => previous.requestedCount === current.requestedCount && previous.forbiddenCount === current.forbiddenCount;

    for (let sample = 0; sample < 6; sample += 1) {
      requestSettleSamples.push({
        requestedCount: requestedUrls.length,
        forbiddenCount: forbiddenRequests.length
      });

      if (findStableSample(requestSettleSamples, isRequestStreamStable)) {
        break;
      }

      if (sample < 5) {
        await page.waitForTimeout(100);
      }
    }

    requireStableSample(
      requestSettleSamples,
      isRequestStreamStable,
      'post-correlation request stream did not settle',
      (sample) => sample
    );

    const postCorrelationSelectionRequests = requestedUrls.slice(requestCountBeforeCorrelationOpen);

    expect(postCorrelationSelectionRequests).toContain(selectedCorrelationUrl);
    expect(postCorrelationSelectionRequests).toContain(scopedArtifactsUrl);
    expect(postCorrelationSelectionRequests).not.toContain(staleCorrelationUrl);
    expect(postCorrelationSelectionRequests).not.toContain(staleScopedArtifactsUrl);
    expect(postCorrelationSelectionRequests).not.toContain(unscopedArtifactsUrl);
    expect(forbiddenRequests).toEqual([]);
  });

  test('keeps the selected-agent workflow-status handoff evidence jump focused on shared memory without changing selection or active correlation via keyboard traversal', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
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
    const handoffRecord = workflowStatusActorButton.locator('xpath=ancestor::li[contains(@class,"aitown-record")][1]');
    const evidenceJumpButton = handoffRecord.getByRole('button', {
      name: 'Jump to shared memory artifact /tmp/revenue-handoff.md'
    });
    const focusedSharedMemoryRecord = detailsPanel.locator('li[data-shared-memory-target]:focus');

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Workflow' })).toBeVisible();
    await expect(handoffRecord.getByText('Lead completed the revenue handoff', { exact: true })).toBeVisible();
    await expect(handoffRecord.getByText('Evidence · /tmp/revenue-handoff.md')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
    await expect(evidenceJumpButton).toBeVisible();
    await expect(focusedSharedMemoryRecord).toHaveCount(0);
    await focusHubControlWithTab(page, evidenceJumpButton, 'Jump to shared memory artifact /tmp/revenue-handoff.md');
    await expect(evidenceJumpButton).toBeFocused();

    const requestCountBeforeJump = requestedUrls.length;

    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Workflow' })).toBeVisible();
    await expect(handoffRecord.getByText('Lead completed the revenue handoff', { exact: true })).toBeVisible();
    await expect(handoffRecord.getByText('Evidence · /tmp/revenue-handoff.md')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
    await expect(focusedSharedMemoryRecord).toHaveCount(1);
    await expect(focusedSharedMemoryRecord).toContainText('Ref · /tmp/revenue-handoff.md');

    await page.waitForTimeout(150);

    const postJumpRequests = requestedUrls.slice(requestCountBeforeJump);
    expectOnlyBenignPostJumpRequests(postJumpRequests);
    expect(requestedUrls).not.toContain('/agents/team-lead/workflow?limit=10&window=60m');
    expect(requestedUrls).not.toContain(
      '/memory/artifacts?limit=4&window=60m&agent_id=team-lead&correlation_id=corr-revenue-handoff'
    );
    expect(requestedUrls).not.toContain('/correlations/corr-growth-lead-review?limit=10&window=60m');
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
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
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
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
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
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
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
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
  });

  test('falls back to the workflow-status counterparty record correlation and keeps scoped reads via keyboard traversal', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    const forbiddenRequests: string[] = [];
    const directOperationUrl = '/office/operations?agent_id=app-engineering';
    const selectedCorrelationUrl =
      '/correlations/corr-browser-workflow-status-counterparty-fallback?limit=10&window=60m';
    const staleCorrelationUrl = '/correlations/corr-revenue-handoff?limit=10&window=60m';
    const scopedArtifactsUrl =
      '/memory/artifacts?limit=4&window=60m&agent_id=app-engineering&correlation_id=corr-browser-workflow-status-counterparty-fallback';
    const staleScopedArtifactsUrl =
      '/memory/artifacts?limit=4&window=60m&agent_id=app-engineering&correlation_id=corr-revenue-handoff';
    const unscopedArtifactsUrl = '/memory/artifacts?limit=4&window=60m&agent_id=app-engineering';
    let trackForbiddenRequests = false;

    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    await page.route('**/office/operations?agent_id=growth-revenue', async (route) => {
      const response = await route.fetch();
      const operations = (await response.json()) as {
        items?: unknown[];
      };

      await route.fulfill({
        response,
        json: {
          ...operations,
          items: []
        }
      });
    });

    await page.route('**/agents/growth-revenue/workflow?limit=10&window=60m', async (route) => {
      const response = await route.fetch();
      const workflow = (await response.json()) as {
        correlation_ids?: string[];
        detail: {
          open_peer_watch_alerts?: unknown[];
          recent_handoffs?: Array<{
            handoff_id: string;
            agent_id: string;
            actor_id: string;
            summary: string;
            correlation_id?: string | null;
            counterparty_agent_ids?: string[];
          }>;
        };
      };

      const recentHandoffs = (workflow.detail.recent_handoffs ?? []).map((handoff) =>
        handoff.handoff_id === 'evt_revenue_handoff_completed'
          ? {
              ...handoff,
              agent_id: 'growth-revenue',
              actor_id: 'team-lead',
              correlation_id: 'corr-browser-workflow-status-counterparty-fallback',
              summary: 'Workflow status counterparty fallback uses the record correlation',
              counterparty_agent_ids: ['app-engineering', 'growth-revenue', 'ghost-agent']
            }
          : handoff
      );

      if (
        !recentHandoffs.some((handoff) => handoff.handoff_id === 'evt_revenue_handoff_completed')
      ) {
        throw new Error('expected a workflow status handoff for the counterparty fallback keyboard smoke');
      }

      await route.fulfill({
        response,
        json: {
          ...workflow,
          correlation_ids: [],
          detail: {
            ...workflow.detail,
            open_peer_watch_alerts: [],
            recent_handoffs: recentHandoffs
          }
        }
      });
    });

    await page.route(`**${selectedCorrelationUrl}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          correlation_id: 'corr-browser-workflow-status-counterparty-fallback',
          participant_agent_ids: ['app-engineering', 'team-lead'],
          evidence_refs: ['/tmp/evidence.md', '/tmp/revenue-handoff.md'],
          first_ts: '2026-03-16T08:49:00.000Z',
          last_ts: '2026-03-16T08:50:00.000Z',
          incident_count: 1,
          interaction_count: 1,
          event_count: 1,
          incidents: [
            {
              incident_id: 'inc-browser-workflow-status-counterparty-fallback',
              kind: 'peer_watch',
              ts: '2026-03-16T08:50:00.000Z',
              agent_id: 'app-engineering',
              actor_id: 'team-lead',
              status: 'open',
              severity: 'orange',
              summary: 'Lead is still waiting on workflow evidence',
              correlation_id: 'corr-browser-workflow-status-counterparty-fallback',
              evidence_refs: ['/tmp/evidence.md'],
              counterparty_agent_ids: ['team-lead'],
              source_kind: 'controller_event'
            }
          ],
          interactions: [
            {
              interaction_id: 'interaction-browser-workflow-status-counterparty-fallback',
              interaction_type: 'peer_watch',
              correlation_id: 'corr-browser-workflow-status-counterparty-fallback',
              started_at: '2026-03-16T08:49:00.000Z',
              ended_at: '2026-03-16T08:58:00.000Z',
              participant_agent_ids: ['app-engineering', 'team-lead'],
              trigger_event_id: 'evt_revenue_handoff_completed',
              before_state: 'coding',
              after_state: 'blocked',
              severity: 'orange',
              evidence_refs: ['/tmp/evidence.md'],
              summary: 'Workflow status counterparty fallback uses the record correlation',
              related_event_ids: ['evt_revenue_handoff_completed']
            }
          ],
          timeline: [
            {
              event_id: 'evt_browser_workflow_status_counterparty_fallback',
              ts: '2026-03-16T08:50:00.000Z',
              agent_id: 'growth-revenue',
              actor_id: 'team-lead',
              event_type: 'workflow_state_changed',
              severity: 'orange',
              current_state: 'blocked',
              location: 'meeting-zone',
              summary: 'Workflow status counterparty fallback uses the record correlation',
              correlation_id: 'corr-browser-workflow-status-counterparty-fallback',
              counterparty_agent_ids: ['app-engineering'],
              evidence_refs: ['/tmp/evidence.md'],
              source_kind: 'controller_event'
            }
          ]
        }
      });
    });

    await page.route(`**${scopedArtifactsUrl}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          generated_at: '2026-03-16T09:00:00.000Z',
          items: [
            {
              artifact_ref: '/tmp/evidence.md',
              artifact_kind: 'evidence_ref',
              file_name: 'evidence.md',
              first_seen_at: '2026-03-16T08:40:00.000Z',
              last_seen_at: '2026-03-16T08:58:00.000Z',
              mention_count: 3,
              agent_ids: ['app-engineering', 'team-lead'],
              correlation_ids: ['corr-browser-workflow-status-counterparty-fallback'],
              source_kinds: ['controller_event', 'workspace_snapshot'],
              latest_summary: 'App engineering preserved the workflow-status fallback correlation',
              latest_event_type: 'workflow_state_changed',
              collector_last_modified_at: '2026-03-16T08:58:00.000Z'
            }
          ]
        }
      });
    });

    await page.route(`**${directOperationUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(directOperationUrl);
      }
      await route.continue();
    });
    await page.route(`**${staleCorrelationUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(staleCorrelationUrl);
      }
      await route.continue();
    });
    await page.route(`**${staleScopedArtifactsUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(staleScopedArtifactsUrl);
      }
      await route.continue();
    });
    await page.route(`**${unscopedArtifactsUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(unscopedArtifactsUrl);
      }
      await route.continue();
    });

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
    const workflowUrl = '/agents/app-engineering/workflow?limit=10&window=60m';

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(workflowSection.getByText('Workflow status counterparty fallback uses the record correlation')).toBeVisible();
    await expect(correlationSection.getByText('No correlation selected.')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toHaveCount(0);
    await focusHubControlWithTab(
      page,
      workflowStatusCounterpartyButton,
      'Select workflow status counterparty from handoff evt_revenue_handoff_completed app-engineering'
    );
    await expect(workflowStatusCounterpartyButton).toBeFocused();

    trackForbiddenRequests = true;
    const requestCountBeforePivot = requestedUrls.length;
    const workflowResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && response.status() === 200 && response.url().includes(workflowUrl)
    );
    const selectedCorrelationResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.status() === 200 &&
        response.url().includes(selectedCorrelationUrl)
    );
    const scopedArtifactsResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.status() === 200 &&
        response.url().includes(scopedArtifactsUrl)
    );

    await page.keyboard.press('Enter');
    await workflowResponse;
    await selectedCorrelationResponse;
    await scopedArtifactsResponse;

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-browser-workflow-status-counterparty-fallback', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toHaveCount(0);
    await expect(correlationSection.getByText('No correlation selected.')).toHaveCount(0);

    const requestSettleSamples: Array<{ requestedCount: number; forbiddenCount: number }> = [];
    const isRequestStreamStable = (
      previous: { requestedCount: number; forbiddenCount: number },
      current: { requestedCount: number; forbiddenCount: number }
    ) => previous.requestedCount === current.requestedCount && previous.forbiddenCount === current.forbiddenCount;

    for (let sample = 0; sample < 6; sample += 1) {
      requestSettleSamples.push({
        requestedCount: requestedUrls.length,
        forbiddenCount: forbiddenRequests.length
      });

      if (findStableSample(requestSettleSamples, isRequestStreamStable)) {
        break;
      }

      if (sample < 5) {
        await page.waitForTimeout(100);
      }
    }

    requireStableSample(
      requestSettleSamples,
      isRequestStreamStable,
      'post-pivot request stream did not settle',
      (sample) => sample
    );

    const pivotRequestedUrls = requestedUrls.slice(requestCountBeforePivot);

    expect(pivotRequestedUrls).toContain(workflowUrl);
    expect(pivotRequestedUrls).toContain(selectedCorrelationUrl);
    expect(pivotRequestedUrls).toContain(scopedArtifactsUrl);
    expect(pivotRequestedUrls).not.toContain(directOperationUrl);
    expect(pivotRequestedUrls).not.toContain(staleCorrelationUrl);
    expect(pivotRequestedUrls).not.toContain(staleScopedArtifactsUrl);
    expect(pivotRequestedUrls).not.toContain(unscopedArtifactsUrl);
    expect(forbiddenRequests).toEqual([]);
  });

  test('keeps the active workflow correlation when opening a workflow recent-event actor pivot via keyboard traversal', async ({
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
    const workflowRecentEventActorButton = workflowSection.getByRole('button', {
      name: 'Select workflow recent event actor from event evt_revenue_handoff_completed team-lead'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await focusHubControlWithTab(
      page,
      workflowRecentEventActorButton,
      'Select workflow recent event actor from event evt_revenue_handoff_completed team-lead'
    );
    await expect(workflowRecentEventActorButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Team Lead' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
  });

  test('keeps the active workflow correlation and scoped reads when opening a workflow recent-event counterparty pivot via keyboard traversal', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    const forbiddenRequests: string[] = [];
    const directOperationUrl = '/office/operations?agent_id=app-engineering';
    const unscopedArtifactsUrl = '/memory/artifacts?limit=4&window=60m&agent_id=app-engineering';
    const fallbackCorrelationUrl = '/correlations/corr-app-review?limit=10&window=60m';
    let trackForbiddenRequests = false;

    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    await page.route('**/agents/growth-revenue/workflow?limit=10&window=60m', async (route) => {
      const response = await route.fetch();
      const workflow = (await response.json()) as {
        detail: {
          recent_events: Array<{
            event_id: string;
            agent_id: string;
            actor_id: string;
            summary: string;
            counterparty_agent_ids?: string[];
          }>;
        };
      };

      const [firstEvent, ...remainingEvents] = workflow.detail.recent_events;
      if (!firstEvent) {
        throw new Error('expected a workflow recent event for the counterparty keyboard smoke');
      }

      await route.fulfill({
        response,
        json: {
          ...workflow,
          detail: {
            ...workflow.detail,
            recent_events: [
              {
                ...firstEvent,
                event_id: 'evt_browser_workflow_recent_counterparty',
                agent_id: 'growth-revenue',
                actor_id: 'team-lead',
                summary: 'Workflow recent event counterparty pivot keeps the active correlation',
                counterparty_agent_ids: ['app-engineering', 'growth-revenue', 'ghost-agent']
              },
              ...remainingEvents
            ]
          }
        }
      });
    });

    await page.route(`**${directOperationUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(directOperationUrl);
      }
      await route.continue();
    });
    await page.route(`**${unscopedArtifactsUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(unscopedArtifactsUrl);
      }
      await route.continue();
    });
    await page.route(`**${fallbackCorrelationUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(fallbackCorrelationUrl);
      }
      await route.continue();
    });

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
    const workflowRecentEventCounterpartyButton = workflowSection.getByRole('button', {
      name: 'Select workflow recent event counterparty from event evt_browser_workflow_recent_counterparty app-engineering'
    });
    const workflowUrl = '/agents/app-engineering/workflow?limit=10&window=60m';
    const scopedArtifactsUrl =
      '/memory/artifacts?limit=4&window=60m&agent_id=app-engineering&correlation_id=corr-revenue-handoff';

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(workflowSection.getByText('Workflow recent event counterparty pivot keeps the active correlation')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await focusHubControlWithTab(
      page,
      workflowRecentEventCounterpartyButton,
      'Select workflow recent event counterparty from event evt_browser_workflow_recent_counterparty app-engineering'
    );
    await expect(workflowRecentEventCounterpartyButton).toBeFocused();

    trackForbiddenRequests = true;
    const requestCountBeforePivot = requestedUrls.length;
    const workflowResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && response.status() === 200 && response.url().includes(workflowUrl)
    );
    const scopedArtifactsResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.status() === 200 &&
        response.url().includes(scopedArtifactsUrl)
    );

    await page.keyboard.press('Enter');
    await workflowResponse;
    await scopedArtifactsResponse;

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-app-review', { exact: true })).toHaveCount(0);

    const requestSettleSamples: Array<{ requestedCount: number; forbiddenCount: number }> = [];
    const isRequestStreamStable = (
      previous: { requestedCount: number; forbiddenCount: number },
      current: { requestedCount: number; forbiddenCount: number }
    ) => previous.requestedCount === current.requestedCount && previous.forbiddenCount === current.forbiddenCount;

    for (let sample = 0; sample < 6; sample += 1) {
      requestSettleSamples.push({
        requestedCount: requestedUrls.length,
        forbiddenCount: forbiddenRequests.length
      });

      if (findStableSample(requestSettleSamples, isRequestStreamStable)) {
        break;
      }

      if (sample < 5) {
        await page.waitForTimeout(100);
      }
    }

    requireStableSample(
      requestSettleSamples,
      isRequestStreamStable,
      'post-pivot request stream did not settle',
      (sample) => sample
    );

    const pivotRequestedUrls = requestedUrls.slice(requestCountBeforePivot);

    expect(pivotRequestedUrls).toContain(workflowUrl);
    expect(pivotRequestedUrls).toContain(scopedArtifactsUrl);
    expect(pivotRequestedUrls).not.toContain(directOperationUrl);
    expect(pivotRequestedUrls).not.toContain(unscopedArtifactsUrl);
    expect(pivotRequestedUrls).not.toContain(fallbackCorrelationUrl);
    expect(forbiddenRequests).toEqual([]);
  });

  test('falls back to the workflow recent-event counterparty event correlation and keeps scoped reads via keyboard traversal', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    const forbiddenRequests: string[] = [];
    const directOperationUrl = '/office/operations?agent_id=app-engineering';
    const selectedCorrelationUrl =
      '/correlations/corr-browser-workflow-recent-counterparty-fallback?limit=10&window=60m';
    const staleCorrelationUrl = '/correlations/corr-revenue-handoff?limit=10&window=60m';
    const scopedArtifactsUrl =
      '/memory/artifacts?limit=4&window=60m&agent_id=app-engineering&correlation_id=corr-browser-workflow-recent-counterparty-fallback';
    const staleScopedArtifactsUrl =
      '/memory/artifacts?limit=4&window=60m&agent_id=app-engineering&correlation_id=corr-revenue-handoff';
    const unscopedArtifactsUrl = '/memory/artifacts?limit=4&window=60m&agent_id=app-engineering';
    let trackForbiddenRequests = false;

    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    await page.route('**/office/operations?agent_id=growth-revenue', async (route) => {
      const response = await route.fetch();
      const operations = (await response.json()) as {
        items?: unknown[];
      };

      await route.fulfill({
        response,
        json: {
          ...operations,
          items: []
        }
      });
    });

    await page.route('**/agents/growth-revenue/workflow?limit=10&window=60m', async (route) => {
      const response = await route.fetch();
      const workflow = (await response.json()) as {
        correlation_ids?: string[];
        detail: {
          recent_events: Array<{
            event_id: string;
            agent_id: string;
            actor_id: string;
            summary: string;
            correlation_id?: string | null;
            counterparty_agent_ids?: string[];
          }>;
        };
      };

      const [firstEvent, ...remainingEvents] = workflow.detail.recent_events;
      if (!firstEvent) {
        throw new Error('expected a workflow recent event for the counterparty fallback keyboard smoke');
      }

      await route.fulfill({
        response,
        json: {
          ...workflow,
          correlation_ids: [],
          detail: {
            ...workflow.detail,
            recent_events: [
              {
                ...firstEvent,
                event_id: 'evt_browser_workflow_recent_counterparty_fallback',
                agent_id: 'growth-revenue',
                actor_id: 'team-lead',
                correlation_id: 'corr-browser-workflow-recent-counterparty-fallback',
                summary: 'Workflow recent-event counterparty fallback uses the event correlation',
                counterparty_agent_ids: ['app-engineering', 'growth-revenue', 'ghost-agent']
              },
              ...remainingEvents
            ]
          }
        }
      });
    });

    await page.route(`**${selectedCorrelationUrl}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          correlation_id: 'corr-browser-workflow-recent-counterparty-fallback',
          participant_agent_ids: ['app-engineering', 'team-lead'],
          evidence_refs: ['/tmp/evidence.md', '/tmp/revenue-handoff.md'],
          first_ts: '2026-03-16T08:49:00.000Z',
          last_ts: '2026-03-16T08:50:00.000Z',
          incident_count: 1,
          interaction_count: 1,
          event_count: 1,
          incidents: [
            {
              incident_id: 'inc-browser-app-review',
              kind: 'peer_watch',
              ts: '2026-03-16T08:50:00.000Z',
              agent_id: 'app-engineering',
              actor_id: 'team-lead',
              status: 'open',
              severity: 'orange',
              summary: 'Lead is still waiting on workflow evidence',
              correlation_id: 'corr-browser-workflow-recent-counterparty-fallback',
              evidence_refs: ['/tmp/evidence.md'],
              counterparty_agent_ids: ['team-lead'],
              source_kind: 'controller_event'
            }
          ],
          interactions: [
            {
              interaction_id: 'interaction-browser-workflow-recent-counterparty-fallback',
              interaction_type: 'peer_watch',
              correlation_id: 'corr-browser-workflow-recent-counterparty-fallback',
              started_at: '2026-03-16T08:49:00.000Z',
              ended_at: '2026-03-16T08:58:00.000Z',
              participant_agent_ids: ['app-engineering', 'team-lead'],
              trigger_event_id: 'evt_browser_workflow_recent_counterparty_fallback',
              before_state: 'coding',
              after_state: 'blocked',
              severity: 'orange',
              evidence_refs: ['/tmp/evidence.md'],
              summary: 'Workflow recent-event counterparty fallback uses the event correlation',
              related_event_ids: ['evt_browser_workflow_recent_counterparty_fallback']
            }
          ],
          timeline: [
            {
              event_id: 'evt_browser_workflow_recent_counterparty_fallback',
              ts: '2026-03-16T08:50:00.000Z',
              agent_id: 'growth-revenue',
              actor_id: 'team-lead',
              event_type: 'workflow_state_changed',
              severity: 'orange',
              current_state: 'blocked',
              location: 'meeting-zone',
              summary: 'Workflow recent-event counterparty fallback uses the event correlation',
              correlation_id: 'corr-browser-workflow-recent-counterparty-fallback',
              counterparty_agent_ids: ['app-engineering'],
              evidence_refs: ['/tmp/evidence.md'],
              source_kind: 'controller_event'
            }
          ]
        }
      });
    });

    await page.route(`**${scopedArtifactsUrl}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          generated_at: '2026-03-16T09:00:00.000Z',
          items: [
            {
              artifact_ref: '/tmp/evidence.md',
              artifact_kind: 'evidence_ref',
              file_name: 'evidence.md',
              first_seen_at: '2026-03-16T08:40:00.000Z',
              last_seen_at: '2026-03-16T08:58:00.000Z',
              mention_count: 3,
              agent_ids: ['app-engineering', 'team-lead'],
              correlation_ids: ['corr-browser-workflow-recent-counterparty-fallback'],
              source_kinds: ['controller_event', 'workspace_snapshot'],
              latest_summary: 'App engineering preserved the fallback event correlation context',
              latest_event_type: 'workflow_state_changed',
              collector_last_modified_at: '2026-03-16T08:58:00.000Z'
            }
          ]
        }
      });
    });

    await page.route(`**${directOperationUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(directOperationUrl);
      }
      await route.continue();
    });
    await page.route(`**${staleCorrelationUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(staleCorrelationUrl);
      }
      await route.continue();
    });
    await page.route(`**${staleScopedArtifactsUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(staleScopedArtifactsUrl);
      }
      await route.continue();
    });
    await page.route(`**${unscopedArtifactsUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(unscopedArtifactsUrl);
      }
      await route.continue();
    });

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
    const workflowRecentEventCounterpartyButton = workflowSection.getByRole('button', {
      name: 'Select workflow recent event counterparty from event evt_browser_workflow_recent_counterparty_fallback app-engineering'
    });
    const workflowUrl = '/agents/app-engineering/workflow?limit=10&window=60m';

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(workflowSection.getByText('Workflow recent-event counterparty fallback uses the event correlation')).toBeVisible();
    await expect(correlationSection.getByText('No correlation selected.')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toHaveCount(0);
    await focusHubControlWithTab(
      page,
      workflowRecentEventCounterpartyButton,
      'Select workflow recent event counterparty from event evt_browser_workflow_recent_counterparty_fallback app-engineering'
    );
    await expect(workflowRecentEventCounterpartyButton).toBeFocused();

    trackForbiddenRequests = true;
    const requestCountBeforePivot = requestedUrls.length;
    const workflowResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && response.status() === 200 && response.url().includes(workflowUrl)
    );
    const selectedCorrelationResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.status() === 200 &&
        response.url().includes(selectedCorrelationUrl)
    );
    const scopedArtifactsResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.status() === 200 &&
        response.url().includes(scopedArtifactsUrl)
    );

    await page.keyboard.press('Enter');
    await workflowResponse;
    await selectedCorrelationResponse;
    await scopedArtifactsResponse;

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-browser-workflow-recent-counterparty-fallback', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toHaveCount(0);
    await expect(correlationSection.getByText('No correlation selected.')).toHaveCount(0);

    const requestSettleSamples: Array<{ requestedCount: number; forbiddenCount: number }> = [];
    const isRequestStreamStable = (
      previous: { requestedCount: number; forbiddenCount: number },
      current: { requestedCount: number; forbiddenCount: number }
    ) => previous.requestedCount === current.requestedCount && previous.forbiddenCount === current.forbiddenCount;

    for (let sample = 0; sample < 6; sample += 1) {
      requestSettleSamples.push({
        requestedCount: requestedUrls.length,
        forbiddenCount: forbiddenRequests.length
      });

      if (findStableSample(requestSettleSamples, isRequestStreamStable)) {
        break;
      }

      if (sample < 5) {
        await page.waitForTimeout(100);
      }
    }

    requireStableSample(
      requestSettleSamples,
      isRequestStreamStable,
      'post-pivot request stream did not settle',
      (sample) => sample
    );

    const pivotRequestedUrls = requestedUrls.slice(requestCountBeforePivot);

    expect(pivotRequestedUrls).toContain(workflowUrl);
    expect(pivotRequestedUrls).toContain(selectedCorrelationUrl);
    expect(pivotRequestedUrls).toContain(scopedArtifactsUrl);
    expect(pivotRequestedUrls).not.toContain(directOperationUrl);
    expect(pivotRequestedUrls).not.toContain(staleCorrelationUrl);
    expect(pivotRequestedUrls).not.toContain(staleScopedArtifactsUrl);
    expect(pivotRequestedUrls).not.toContain(unscopedArtifactsUrl);
    expect(forbiddenRequests).toEqual([]);
  });

  test('keeps the active workflow correlation when opening a workflow recent-event subject-agent pivot via keyboard traversal', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    const forbiddenRequests: string[] = [];
    const directOperationUrl = '/office/operations?agent_id=app-engineering';
    const unscopedArtifactsUrl = '/memory/artifacts?limit=4&window=60m&agent_id=app-engineering';
    const fallbackCorrelationUrl = '/correlations/corr-app-review?limit=10&window=60m';
    let trackForbiddenRequests = false;

    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    await page.route('**/agents/growth-revenue/workflow?limit=10&window=60m', async (route) => {
      const response = await route.fetch();
      const workflow = (await response.json()) as {
        detail: {
          recent_events: Array<{
            event_id: string;
            agent_id: string;
            actor_id: string;
            summary: string;
          }>;
        };
      };

      const [firstEvent, ...remainingEvents] = workflow.detail.recent_events;
      if (!firstEvent) {
        throw new Error('expected a workflow recent event for the subject-agent keyboard smoke');
      }

      await route.fulfill({
        response,
        json: {
          ...workflow,
          detail: {
            ...workflow.detail,
            recent_events: [
              {
                ...firstEvent,
                event_id: 'evt_browser_workflow_recent_subject',
                agent_id: 'app-engineering',
                actor_id: 'team-lead',
                summary: 'Workflow recent event subject pivot keeps the active correlation'
              },
              ...remainingEvents
            ]
          }
        }
      });
    });

    await page.route(`**${directOperationUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(directOperationUrl);
      }
      await route.continue();
    });
    await page.route(`**${unscopedArtifactsUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(unscopedArtifactsUrl);
      }
      await route.continue();
    });
    await page.route(`**${fallbackCorrelationUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(fallbackCorrelationUrl);
      }
      await route.continue();
    });

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
    const workflowRecentEventSubjectButton = workflowSection.getByRole('button', {
      name: 'Select workflow recent event subject agent from event evt_browser_workflow_recent_subject app-engineering'
    });
    const workflowUrl = '/agents/app-engineering/workflow?limit=10&window=60m';
    const scopedArtifactsUrl =
      '/memory/artifacts?limit=4&window=60m&agent_id=app-engineering&correlation_id=corr-revenue-handoff';

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(workflowSection.getByText('Workflow recent event subject pivot keeps the active correlation')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await focusHubControlWithTab(
      page,
      workflowRecentEventSubjectButton,
      'Select workflow recent event subject agent from event evt_browser_workflow_recent_subject app-engineering'
    );
    await expect(workflowRecentEventSubjectButton).toBeFocused();

    trackForbiddenRequests = true;
    const requestCountBeforePivot = requestedUrls.length;
    const workflowResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && response.status() === 200 && response.url().includes(workflowUrl)
    );
    const scopedArtifactsResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.status() === 200 &&
        response.url().includes(scopedArtifactsUrl)
    );

    await page.keyboard.press('Enter');
    await workflowResponse;
    await scopedArtifactsResponse;

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 1 incidents · 1 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-app-review', { exact: true })).toHaveCount(0);

    const requestSettleSamples: Array<{ requestedCount: number; forbiddenCount: number }> = [];
    const isRequestStreamStable = (
      previous: { requestedCount: number; forbiddenCount: number },
      current: { requestedCount: number; forbiddenCount: number }
    ) => previous.requestedCount === current.requestedCount && previous.forbiddenCount === current.forbiddenCount;

    for (let sample = 0; sample < 6; sample += 1) {
      requestSettleSamples.push({
        requestedCount: requestedUrls.length,
        forbiddenCount: forbiddenRequests.length
      });

      if (findStableSample(requestSettleSamples, isRequestStreamStable)) {
        break;
      }

      if (sample < 5) {
        await page.waitForTimeout(100);
      }
    }

    requireStableSample(
      requestSettleSamples,
      isRequestStreamStable,
      'post-pivot request stream did not settle',
      (sample) => sample
    );

    const pivotRequestedUrls = requestedUrls.slice(requestCountBeforePivot);

    expect(pivotRequestedUrls).toContain(workflowUrl);
    expect(pivotRequestedUrls).toContain(scopedArtifactsUrl);
    expect(pivotRequestedUrls).not.toContain(directOperationUrl);
    expect(pivotRequestedUrls).not.toContain(unscopedArtifactsUrl);
    expect(pivotRequestedUrls).not.toContain(fallbackCorrelationUrl);
    expect(forbiddenRequests).toEqual([]);
  });

  test('keeps the selected-agent workflow recent-event evidence jump focused on shared memory without changing selection or active correlation via keyboard traversal', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
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
    const recentEventActorButton = workflowSection.getByRole('button', {
      name: 'Select workflow recent event actor from event evt_revenue_handoff_completed team-lead'
    });
    const recentEventRecord = recentEventActorButton.locator('xpath=ancestor::li[contains(@class,"aitown-record")][1]');
    const evidenceJumpButton = recentEventRecord.getByRole('button', {
      name: 'Jump to shared memory artifact /tmp/revenue-handoff.md'
    });
    const focusedSharedMemoryRecord = detailsPanel.locator('li[data-shared-memory-target]:focus');

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Workflow' })).toBeVisible();
    await expect(recentEventRecord.getByText('Lead completed the revenue handoff', { exact: true })).toBeVisible();
    await expect(recentEventRecord.getByText('Evidence · /tmp/revenue-handoff.md')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
    await expect(evidenceJumpButton).toBeVisible();
    await expect(focusedSharedMemoryRecord).toHaveCount(0);
    await focusHubControlWithTab(page, evidenceJumpButton, 'Jump to shared memory artifact /tmp/revenue-handoff.md');
    await expect(evidenceJumpButton).toBeFocused();

    const requestCountBeforeJump = requestedUrls.length;

    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Workflow' })).toBeVisible();
    await expect(recentEventRecord.getByText('Lead completed the revenue handoff', { exact: true })).toBeVisible();
    await expect(recentEventRecord.getByText('Evidence · /tmp/revenue-handoff.md')).toBeVisible();
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);
    await expect(focusedSharedMemoryRecord).toHaveCount(1);
    await expect(focusedSharedMemoryRecord).toContainText('Ref · /tmp/revenue-handoff.md');

    await page.waitForTimeout(150);

    const postJumpRequests = requestedUrls.slice(requestCountBeforeJump);
    expectOnlyBenignPostJumpRequests(postJumpRequests);
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

  test('keeps the active workflow correlation when opening a workflow peer-watch target pivot via keyboard traversal', async ({
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
                alert_id: 'alert-browser-peer-watch-target',
                ts: '2026-03-10T23:00:00.000Z',
                agent_id: 'app-engineering',
                target_agent_id: 'growth-revenue',
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
    const targetButton = workflowSection.getByRole('button', {
      name: 'Select workflow peer-watch target from alert alert-browser-peer-watch-target growth-revenue'
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
      targetButton,
      'Select workflow peer-watch target from alert alert-browser-peer-watch-target growth-revenue'
    );
    await expect(targetButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
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

  test('keeps the selected-agent workflow peer-watch alert evidence jump focused on shared memory without changing selection or active correlation via keyboard traversal', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    const workflowCorrelationId = 'collector-snapshot:2026-03-10T23:59:40.000Z';
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
                alert_id: 'alert-browser-peer-watch-evidence-jump',
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
                summary: 'Workflow peer-watch evidence jump stays in shared memory',
                evidence_refs: ['/tmp/revenue-handoff.md', '/tmp/missing.md'],
                evidence_count: 1,
                correlation_id: workflowCorrelationId,
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
    const memorySection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Shared Memory' })
    });
    const alertRecord = workflowSection
      .getByText('Workflow peer-watch evidence jump stays in shared memory')
      .locator('xpath=ancestor::li[contains(@class,"aitown-record")][1]');
    const evidenceJumpButton = alertRecord.getByRole('button', {
      name: 'Jump to shared memory artifact /tmp/revenue-handoff.md'
    });
    const focusedSharedMemoryRecord = detailsPanel.locator('li[data-shared-memory-target]:focus');

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    const baselineCorrelationIdPattern = /(?:corr-[A-Za-z0-9:_-]+|collector-snapshot:\d{4}-\d{2}-\d{2}T[0-9:.]+Z)/;
    await expect
      .poll(async () => {
        const text = await correlationSection.textContent();
        return text?.match(baselineCorrelationIdPattern)?.[0] ?? null;
      })
      .not.toBeNull();
    const baselineCorrelationId = ((await correlationSection.textContent()) ?? '').match(baselineCorrelationIdPattern)?.[0] ?? null;
    expect(baselineCorrelationId).not.toBeNull();

    await expect(alertRecord.getByText('Workflow peer-watch evidence jump stays in shared memory')).toBeVisible();
    await expect(alertRecord.getByText('Evidence · /tmp/revenue-handoff.md, /tmp/missing.md')).toBeVisible();
    await expect(alertRecord.getByText('Watchers · growth-revenue')).toBeVisible();
    await expect(
      alertRecord.getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/missing.md'
      })
    ).toBeVisible();
    await expect(memorySection.getByText('Collector observed workspace write to revenue-handoff.md')).toBeVisible();
    await expect(detailsPanel.getByRole('button', { name: 'Return to current scope' })).toHaveCount(0);
    await expect(focusedSharedMemoryRecord).toHaveCount(0);
    await focusHubControlWithTab(page, evidenceJumpButton, 'Jump to shared memory artifact /tmp/revenue-handoff.md');
    await expect(evidenceJumpButton).toBeFocused();

    const requestCountBeforeJump = requestedUrls.length;

    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(correlationSection.getByText(baselineCorrelationId!, { exact: true })).toBeVisible();
    await expect(alertRecord.getByText('Workflow peer-watch evidence jump stays in shared memory')).toBeVisible();
    await expect(detailsPanel.getByRole('button', { name: 'Return to current scope' })).toHaveCount(0);
    await expect(focusedSharedMemoryRecord).toHaveCount(1);
    await expect(focusedSharedMemoryRecord).toContainText('Ref · /tmp/revenue-handoff.md');

    await page.waitForTimeout(150);

    const postJumpRequests = requestedUrls.slice(requestCountBeforeJump);
    expectOnlyBenignPostJumpRequests(postJumpRequests);
  });

  test('shows the selected-agent supervision history loading state explicitly while the first selected-agent read is pending', async ({
    page
  }) => {
    let releaseSupervisionHistory: (() => void) | null = null;
    const selectedSupervisionHistoryRequests: string[] = [];
    const accountabilityCorrelationId = 'collector-snapshot:2026-03-10T23:59:40.000Z';
    const selectedSupervisionHistoryPath = resolveSelectedAgentSupervisionHistoryPath(
      'app-engineering',
      accountabilityCorrelationId
    );

    await page.route('**/peer-watch/alerts**', async (route) => {
      const url = new URL(route.request().url());
      if (
        url.pathname !== '/peer-watch/alerts' ||
        url.searchParams.get('target_agent_id') !== 'app-engineering' ||
        url.searchParams.get('limit') !== '4'
      ) {
        await route.continue();
        return;
      }

      selectedSupervisionHistoryRequests.push(`${url.pathname}${url.search}`);
      await new Promise<void>((resolve) => {
        releaseSupervisionHistory = resolve;
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              alert_id: 'alert-browser-supervision-history-loading',
              ts: '2026-03-10T23:00:00.000Z',
              agent_id: 'app-engineering',
              target_agent_id: 'app-engineering',
              actor_id: 'team-lead',
              observer_agent_id: 'team-lead',
              watcher_agent_ids: ['team-lead'],
              severity: 'orange',
              status: 'open',
              current_state: 'blocked',
              active_task: 'Revenue handoff still needs app confirmation',
              summary: 'Selected-agent supervision history loading stays explicit',
              evidence_refs: ['/tmp/revenue-handoff.md'],
              evidence_count: 1,
              correlation_id: accountabilityCorrelationId,
              source_kind: 'controller_event',
              metadata: {}
            }
          ]
        })
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const inspectButton = detailsPanel.getByRole('button', {
      name: 'Inspect App Engineering Agent',
      exact: true
    });

    await focusHubControlWithTab(page, inspectButton, 'Inspect App Engineering Agent');
    await expect(inspectButton).toBeFocused();
    await page.keyboard.press('Enter');

    const supervisionSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Supervision History' })
    });

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(supervisionSection.getByText('Loading supervision history...')).toBeVisible();
    await expect(supervisionSection.getByText('No recent supervision history.')).toHaveCount(0);
    await expect(supervisionSection.getByText(/Unable to load supervision history\./)).toHaveCount(0);
    await expect
      .poll(
        () =>
          selectedSupervisionHistoryRequests.filter((request) => request === selectedSupervisionHistoryPath).length
      )
      .toBe(1);

    expect(releaseSupervisionHistory).not.toBeNull();
    releaseSupervisionHistory!();

    await expect(
      supervisionSection.getByText('Selected-agent supervision history loading stays explicit')
    ).toBeVisible();
  });

  test('shows the selected-agent supervision history failures explicitly instead of pretending empty', async ({ page }) => {
    const selectedSupervisionHistoryRequests: string[] = [];
    const accountabilityCorrelationId = 'collector-snapshot:2026-03-10T23:59:40.000Z';
    const selectedSupervisionHistoryPath = resolveSelectedAgentSupervisionHistoryPath(
      'app-engineering',
      accountabilityCorrelationId
    );

    await page.route('**/peer-watch/alerts**', async (route) => {
      const url = new URL(route.request().url());
      if (
        url.pathname !== '/peer-watch/alerts' ||
        url.searchParams.get('target_agent_id') !== 'app-engineering' ||
        url.searchParams.get('limit') !== '4'
      ) {
        await route.continue();
        return;
      }

      selectedSupervisionHistoryRequests.push(`${url.pathname}${url.search}`);
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'internal_error',
          details: 'peer-watch refresh failed'
        })
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const inspectButton = detailsPanel.getByRole('button', {
      name: 'Inspect App Engineering Agent',
      exact: true
    });

    await focusHubControlWithTab(page, inspectButton, 'Inspect App Engineering Agent');
    await expect(inspectButton).toBeFocused();
    await page.keyboard.press('Enter');

    const supervisionSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Supervision History' })
    });

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(
      supervisionSection.getByText('Unable to load supervision history. peer-watch refresh failed')
    ).toBeVisible();
    await expect(supervisionSection.getByText('No recent supervision history.')).toHaveCount(0);
    await expect(supervisionSection.getByText('Loading supervision history...')).toHaveCount(0);
    await expect
      .poll(
        () =>
          selectedSupervisionHistoryRequests.filter((request) => request === selectedSupervisionHistoryPath).length
      )
      .toBe(1);
  });

  test('keeps selected-agent auto correlation mode when re-selecting the current default correlation from supervision history via keyboard traversal', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    const accountabilityCorrelationId = 'collector-snapshot:2026-03-10T23:59:40.000Z';
    const selectedSupervisionHistoryPath = resolveSelectedAgentSupervisionHistoryPath(
      'app-engineering',
      accountabilityCorrelationId
    );
    await page.route(`**${selectedSupervisionHistoryPath}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              alert_id: 'alert-browser-supervision-history-auto-reselect',
              ts: '2026-03-10T23:00:00.000Z',
              agent_id: 'app-engineering',
              target_agent_id: 'app-engineering',
              actor_id: 'team-lead',
              observer_agent_id: 'team-lead',
              watcher_agent_ids: ['team-lead'],
              severity: 'orange',
              status: 'open',
              current_state: 'blocked',
              active_task: 'Revenue handoff still needs app confirmation',
              summary: 'Supervision history default correlation stays auto',
              evidence_refs: ['/tmp/revenue-handoff.md'],
              evidence_count: 1,
              correlation_id: accountabilityCorrelationId,
              source_kind: 'controller_event',
              metadata: {}
            }
          ]
        })
      });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const inspectButton = detailsPanel.getByRole('button', {
      name: 'Inspect App Engineering Agent',
      exact: true
    });

    await focusHubControlWithTab(page, inspectButton, 'Inspect App Engineering Agent');
    await expect(inspectButton).toBeFocused();
    await page.keyboard.press('Enter');

    const supervisionSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Supervision History' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const memorySection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Shared Memory' })
    });
    const replaySection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Timeline Replay' })
    });
    const selectedSupervisionCorrelationButton = supervisionSection.getByRole('button', {
      name: `Open supervision history correlation ${accountabilityCorrelationId}, currently selected`
    });
    const selectedSharedMemoryCorrelationButton = memorySection.getByRole('button', {
      name: `Open shared memory correlation ${accountabilityCorrelationId}, currently selected`
    });

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(supervisionSection.getByText('Supervision history default correlation stays auto')).toBeVisible();
    await expect(selectedSupervisionCorrelationButton).toBeVisible();
    await expect(correlationSection.getByText(accountabilityCorrelationId, { exact: true })).toBeVisible();
    await expect(replaySection.getByRole('heading', { name: 'Timeline Replay' })).toBeVisible();
    await expect(replaySection.getByText(`Scoped replay · ${accountabilityCorrelationId}`)).toBeVisible();
    await expect(memorySection.getByText('Collector observed workspace write to revenue-handoff.md')).toBeVisible();
    await expect(selectedSharedMemoryCorrelationButton).toBeVisible();
    await expect(detailsPanel.getByRole('button', { name: 'Return to current scope' })).toHaveCount(0);
    await focusHubControlWithTab(
      page,
      selectedSupervisionCorrelationButton,
      `Open supervision history correlation ${accountabilityCorrelationId}, currently selected`
    );
    await expect(selectedSupervisionCorrelationButton).toBeFocused();

    const requestCountBeforeReselect = requestedUrls.length;
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(selectedSupervisionCorrelationButton).toBeVisible();
    await expect(correlationSection.getByText(accountabilityCorrelationId, { exact: true })).toBeVisible();
    await expect(replaySection.getByRole('heading', { name: 'Timeline Replay' })).toBeVisible();
    await expect(replaySection.getByText(`Scoped replay · ${accountabilityCorrelationId}`)).toBeVisible();
    await expect(memorySection.getByText('Collector observed workspace write to revenue-handoff.md')).toBeVisible();
    await expect(selectedSharedMemoryCorrelationButton).toBeVisible();
    await expect(detailsPanel.getByRole('button', { name: 'Return to current scope' })).toHaveCount(0);

    await page.waitForTimeout(150);

    expect(requestedUrls).toHaveLength(requestCountBeforeReselect);
  });

  test(
    'keeps the selected-agent supervision history evidence jump focus-only while a manually reopened default correlation stays explicit via keyboard traversal',
    async ({ page }) => {
      const requestedUrls: string[] = [];
      page.on('request', (request) => {
        try {
          const url = new URL(request.url());
          requestedUrls.push(`${url.pathname}${url.search}`);
        } catch {
          requestedUrls.push(request.url());
        }
      });

      const accountabilityCorrelationId = 'collector-snapshot:2026-03-10T23:59:40.000Z';
      const selectedSupervisionHistoryPath = resolveSelectedAgentSupervisionHistoryPath(
        'app-engineering',
        accountabilityCorrelationId
      );

      await page.route(`**${selectedSupervisionHistoryPath}`, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                alert_id: 'alert-browser-supervision-history-manual-evidence-jump',
                ts: '2026-03-10T23:00:00.000Z',
                agent_id: 'app-engineering',
                target_agent_id: 'app-engineering',
                actor_id: 'team-lead',
                observer_agent_id: 'team-lead',
                watcher_agent_ids: ['team-lead'],
                severity: 'orange',
                status: 'open',
                current_state: 'blocked',
                active_task: 'Revenue handoff still needs app confirmation',
                summary: 'Supervision history manual evidence jump stays in shared memory',
                evidence_refs: ['/tmp/revenue-handoff.md'],
                evidence_count: 1,
                correlation_id: accountabilityCorrelationId,
                source_kind: 'controller_event',
                metadata: {}
              }
            ]
          })
        });
      });

      await page.goto('/');
      await page.getByRole('button', { name: 'Open Hub' }).click();

      const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
      const inspectButton = detailsPanel.getByRole('button', {
        name: 'Inspect App Engineering Agent',
        exact: true
      });

      await focusHubControlWithTab(page, inspectButton, 'Inspect App Engineering Agent');
      await expect(inspectButton).toBeFocused();
      await page.keyboard.press('Enter');

      const supervisionSection = detailsPanel.locator('section').filter({
        has: page.getByRole('heading', { name: 'Supervision History' })
      });
      const workflowSection = detailsPanel.locator('section').filter({
        has: page.getByRole('heading', { name: 'Workflow' })
      });
      const correlationSection = detailsPanel.locator('section').filter({
        has: page.getByRole('heading', { name: 'Correlation Drilldown' })
      });
      const memorySection = detailsPanel.locator('section').filter({
        has: page.getByRole('heading', { name: 'Shared Memory' })
      });
      const workflowCorrelationButton = workflowSection.getByRole('button', {
        name: 'Open workflow correlation corr-revenue-handoff'
      });
      const reopenDefaultSupervisionCorrelationButton = supervisionSection.getByRole('button', {
        name: `Open supervision history correlation ${accountabilityCorrelationId}`
      });
      const selectedSupervisionCorrelationButton = supervisionSection.getByRole('button', {
        name: `Open supervision history correlation ${accountabilityCorrelationId}, currently selected`
      });
      const selectedSharedMemoryCorrelationButton = memorySection.getByRole('button', {
        name: `Open shared memory correlation ${accountabilityCorrelationId}, currently selected`
      });
      const returnToCurrentScopeButton = detailsPanel.getByRole('button', { name: 'Return to current scope' });
      const evidenceJumpButton = supervisionSection.getByRole('button', {
        name: 'Jump to shared memory artifact /tmp/revenue-handoff.md'
      });
      const sharedMemoryRecord = detailsPanel
        .locator('li[data-shared-memory-target]')
        .filter({ hasText: 'Collector observed workspace write to revenue-handoff.md' });
      const focusedSharedMemoryRecord = detailsPanel.locator('li[data-shared-memory-target]:focus');

      await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      await expect(
        supervisionSection.getByText('Supervision history manual evidence jump stays in shared memory')
      ).toBeVisible();
      await expect(selectedSupervisionCorrelationButton).toBeVisible();
      await expect(correlationSection.getByText(accountabilityCorrelationId, { exact: true })).toBeVisible();
      await expect(sharedMemoryRecord).toContainText('Collector observed workspace write to revenue-handoff.md');
      await expect(selectedSharedMemoryCorrelationButton).toBeVisible();
      await expect(returnToCurrentScopeButton).toHaveCount(0);

      await focusHubControlWithTab(page, workflowCorrelationButton, 'Open workflow correlation corr-revenue-handoff');
      await expect(workflowCorrelationButton).toBeFocused();
      await page.keyboard.press('Enter');

      await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
      await expect(correlationSection.getByText(accountabilityCorrelationId, { exact: true })).toHaveCount(0);
      await expect(returnToCurrentScopeButton).toBeVisible();
      await expect(reopenDefaultSupervisionCorrelationButton).toHaveCount(0);
      await expect(
        supervisionSection.getByText('Supervision history manual evidence jump stays in shared memory')
      ).toHaveCount(0);
      await expect(evidenceJumpButton).toHaveCount(0);

      await focusHubControlWithTab(page, returnToCurrentScopeButton, 'Return to current scope');
      await expect(returnToCurrentScopeButton).toBeFocused();
      await page.keyboard.press('Enter');

      await expect(selectedSupervisionCorrelationButton).toBeVisible();
      await expect(correlationSection.getByText(accountabilityCorrelationId, { exact: true })).toBeVisible();
      await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toHaveCount(0);
      await expect(sharedMemoryRecord).toContainText('Collector observed workspace write to revenue-handoff.md');
      await expect(selectedSharedMemoryCorrelationButton).toBeVisible();
      await expect(returnToCurrentScopeButton).toHaveCount(0);
      await expect(evidenceJumpButton).toBeVisible();
      await expect(focusedSharedMemoryRecord).toHaveCount(0);

      await focusHubControlWithTab(page, evidenceJumpButton, 'Jump to shared memory artifact /tmp/revenue-handoff.md');
      await expect(evidenceJumpButton).toBeFocused();

      const requestCountBeforeJump = requestedUrls.length;
      await page.keyboard.press('Enter');

      await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      await expect(
        supervisionSection.getByText('Supervision history manual evidence jump stays in shared memory')
      ).toBeVisible();
      await expect(selectedSupervisionCorrelationButton).toBeVisible();
      await expect(correlationSection.getByText(accountabilityCorrelationId, { exact: true })).toBeVisible();
      await expect(sharedMemoryRecord).toContainText('Collector observed workspace write to revenue-handoff.md');
      await expect(selectedSharedMemoryCorrelationButton).toBeVisible();
      await expect(returnToCurrentScopeButton).toHaveCount(0);
      await expect(focusedSharedMemoryRecord).toHaveCount(1);
      await expect(focusedSharedMemoryRecord).toContainText('Ref · /tmp/revenue-handoff.md');

      await page.waitForTimeout(150);

      const postJumpRequests = requestedUrls.slice(requestCountBeforeJump);
      expectOnlyBenignPostJumpRequests(postJumpRequests);
    }
  );

  test('keeps the selected-agent supervision history evidence jump focused on shared memory without changing selection or active correlation via keyboard traversal', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    const accountabilityCorrelationId = 'collector-snapshot:2026-03-10T23:59:40.000Z';
    const selectedSupervisionHistoryPath = resolveSelectedAgentSupervisionHistoryPath(
      'app-engineering',
      accountabilityCorrelationId
    );
    await page.route(`**${selectedSupervisionHistoryPath}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              alert_id: 'alert-browser-supervision-history-evidence-jump',
              ts: '2026-03-10T23:00:00.000Z',
              agent_id: 'app-engineering',
              target_agent_id: 'app-engineering',
              actor_id: 'team-lead',
              observer_agent_id: 'team-lead',
              watcher_agent_ids: ['team-lead'],
              severity: 'orange',
              status: 'open',
              current_state: 'blocked',
              active_task: 'Revenue handoff still needs app confirmation',
              summary: 'Supervision history evidence jump stays in shared memory',
              evidence_refs: ['/tmp/revenue-handoff.md'],
              evidence_count: 1,
              correlation_id: accountabilityCorrelationId,
              source_kind: 'controller_event',
              metadata: {}
            }
          ]
        })
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const inspectButton = detailsPanel.getByRole('button', {
      name: 'Inspect App Engineering Agent',
      exact: true
    });

    await focusHubControlWithTab(page, inspectButton, 'Inspect App Engineering Agent');
    await expect(inspectButton).toBeFocused();
    await page.keyboard.press('Enter');

    const supervisionSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Supervision History' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const memorySection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Shared Memory' })
    });
    const selectedSupervisionCorrelationButton = supervisionSection.getByRole('button', {
      name: `Open supervision history correlation ${accountabilityCorrelationId}, currently selected`
    });
    const selectedSharedMemoryCorrelationButton = memorySection.getByRole('button', {
      name: `Open shared memory correlation ${accountabilityCorrelationId}, currently selected`
    });
    const evidenceJumpButton = supervisionSection.getByRole('button', {
      name: 'Jump to shared memory artifact /tmp/revenue-handoff.md'
    });
    const sharedMemoryRecord = detailsPanel
      .locator('li[data-shared-memory-target]')
      .filter({ hasText: 'Collector observed workspace write to revenue-handoff.md' });
    const focusedSharedMemoryRecord = detailsPanel.locator('li[data-shared-memory-target]:focus');

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(supervisionSection.getByText('Supervision history evidence jump stays in shared memory')).toBeVisible();
    await expect(selectedSupervisionCorrelationButton).toBeVisible();
    await expect(correlationSection.getByText(accountabilityCorrelationId, { exact: true })).toBeVisible();
    await expect(sharedMemoryRecord).toContainText('Collector observed workspace write to revenue-handoff.md');
    await expect(selectedSharedMemoryCorrelationButton).toBeVisible();
    await expect(detailsPanel.getByRole('button', { name: 'Return to current scope' })).toHaveCount(0);
    await expect(evidenceJumpButton).toBeVisible();
    await expect(focusedSharedMemoryRecord).toHaveCount(0);
    await focusHubControlWithTab(page, evidenceJumpButton, 'Jump to shared memory artifact /tmp/revenue-handoff.md');
    await expect(evidenceJumpButton).toBeFocused();

    const requestCountBeforeJump = requestedUrls.length;

    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(supervisionSection.getByText('Supervision history evidence jump stays in shared memory')).toBeVisible();
    await expect(selectedSupervisionCorrelationButton).toBeVisible();
    await expect(correlationSection.getByText(accountabilityCorrelationId, { exact: true })).toBeVisible();
    await expect(sharedMemoryRecord).toContainText('Collector observed workspace write to revenue-handoff.md');
    await expect(selectedSharedMemoryCorrelationButton).toBeVisible();
    await expect(detailsPanel.getByRole('button', { name: 'Return to current scope' })).toHaveCount(0);
    await expect(focusedSharedMemoryRecord).toHaveCount(1);
    await expect(focusedSharedMemoryRecord).toContainText('Ref · /tmp/revenue-handoff.md');

    await page.waitForTimeout(150);

    const postJumpRequests = requestedUrls.slice(requestCountBeforeJump);
    expectOnlyBenignPostJumpRequests(postJumpRequests);
  });

  test('keeps the active selected correlation when opening a supervision history actor pivot via keyboard traversal', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    const forbiddenRequests: string[] = [];
    const directOperationUrl = '/office/operations?agent_id=growth-revenue';
    const unscopedArtifactsUrl = '/memory/artifacts?limit=4&window=60m&agent_id=growth-revenue';
    const fallbackCorrelationUrl = '/correlations/corr-growth-lead-review?limit=10&window=60m';
    let trackForbiddenRequests = false;

    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    await page.route(`**${directOperationUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(directOperationUrl);
      }
      await route.continue();
    });

    await page.route(`**${unscopedArtifactsUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(unscopedArtifactsUrl);
      }
      await route.continue();
    });

    await page.route(`**${fallbackCorrelationUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(fallbackCorrelationUrl);
      }
      await route.continue();
    });

    const accountabilityCorrelationId = 'collector-snapshot:2026-03-10T23:59:40.000Z';
    const selectedSupervisionHistoryPath = resolveSelectedAgentSupervisionHistoryPath(
      'app-engineering',
      accountabilityCorrelationId
    );
    await page.route(`**${selectedSupervisionHistoryPath}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              alert_id: 'alert-browser-supervision-history-actor',
              ts: '2026-03-10T23:00:00.000Z',
              agent_id: 'app-engineering',
              target_agent_id: 'app-engineering',
              actor_id: 'growth-revenue',
              observer_agent_id: 'team-lead',
              watcher_agent_ids: ['team-lead'],
              severity: 'orange',
              status: 'open',
              current_state: 'blocked',
              active_task: 'Revenue handoff still needs app confirmation',
              summary: 'Supervision history actor keeps the active correlation',
              evidence_refs: ['/tmp/revenue-handoff.md'],
              evidence_count: 1,
              correlation_id: 'corr-app-review',
              source_kind: 'controller_event',
              metadata: {}
            }
          ]
        })
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

    const supervisionSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Supervision History' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const supervisionActorButton = supervisionSection.getByRole('button', {
      name: 'Select supervision history actor from alert alert-browser-supervision-history-actor growth-revenue'
    });
    const workflowUrl = '/agents/growth-revenue/workflow?limit=10&window=60m';
    const scopedArtifactsUrl = `/memory/artifacts?limit=4&window=60m&agent_id=growth-revenue&correlation_id=${encodeURIComponent(
      accountabilityCorrelationId
    )}`;

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(supervisionSection.getByText('Supervision history actor keeps the active correlation')).toBeVisible();
    await expect(correlationSection.getByText(accountabilityCorrelationId, { exact: true })).toBeVisible();
    await expect(supervisionActorButton).toBeVisible();
    await focusHubControlWithTab(
      page,
      supervisionActorButton,
      'Select supervision history actor from alert alert-browser-supervision-history-actor growth-revenue'
    );
    await expect(supervisionActorButton).toBeFocused();

    trackForbiddenRequests = true;
    const requestCountBeforePivot = requestedUrls.length;
    const workflowResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && response.status() === 200 && response.url().includes(workflowUrl)
    );
    const scopedArtifactsResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && response.status() === 200 && response.url().includes(scopedArtifactsUrl)
    );

    await page.keyboard.press('Enter');
    await workflowResponse;
    await scopedArtifactsResponse;

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText(accountabilityCorrelationId, { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 0 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);

    const requestSettleSamples: Array<{ requestedCount: number; forbiddenCount: number }> = [];
    const isRequestStreamStable = (
      previous: { requestedCount: number; forbiddenCount: number },
      current: { requestedCount: number; forbiddenCount: number }
    ) => previous.requestedCount === current.requestedCount && previous.forbiddenCount === current.forbiddenCount;

    for (let sample = 0; sample < 6; sample += 1) {
      requestSettleSamples.push({
        requestedCount: requestedUrls.length,
        forbiddenCount: forbiddenRequests.length
      });

      if (findStableSample(requestSettleSamples, isRequestStreamStable)) {
        break;
      }

      if (sample < 5) {
        await page.waitForTimeout(100);
      }
    }

    requireStableSample(
      requestSettleSamples,
      isRequestStreamStable,
      'post-pivot request stream did not settle',
      (sample) => sample
    );

    const pivotRequestedUrls = requestedUrls.slice(requestCountBeforePivot);

    expect(pivotRequestedUrls).toContain(workflowUrl);
    expect(pivotRequestedUrls).toContain(scopedArtifactsUrl);
    expect(pivotRequestedUrls).not.toContain(directOperationUrl);
    expect(pivotRequestedUrls).not.toContain(unscopedArtifactsUrl);
    expect(pivotRequestedUrls).not.toContain(fallbackCorrelationUrl);
    expect(forbiddenRequests).toEqual([]);
  });

  test('keeps current and unknown selected-agent supervision history actors as plain text via keyboard smoke', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    const accountabilityCorrelationId = 'collector-snapshot:2026-03-10T23:59:40.000Z';
    const selectedSupervisionHistoryPath = resolveSelectedAgentSupervisionHistoryPath(
      'app-engineering',
      accountabilityCorrelationId
    );
    await page.route(`**${selectedSupervisionHistoryPath}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              alert_id: 'alert-browser-supervision-history-actor-current',
              ts: '2026-03-10T23:00:00.000Z',
              agent_id: 'app-engineering',
              target_agent_id: 'app-engineering',
              actor_id: 'app-engineering',
              observer_agent_id: 'team-lead',
              watcher_agent_ids: ['team-lead'],
              severity: 'orange',
              status: 'open',
              current_state: 'blocked',
              active_task: 'Revenue handoff still needs app confirmation',
              summary: 'Current supervision-history actor stays plain text',
              evidence_refs: ['/tmp/revenue-handoff.md'],
              evidence_count: 1,
              correlation_id: 'corr-app-review',
              source_kind: 'controller_event',
              metadata: {}
            },
            {
              alert_id: 'alert-browser-supervision-history-actor-unknown',
              ts: '2026-03-10T23:05:00.000Z',
              agent_id: 'app-engineering',
              target_agent_id: 'app-engineering',
              actor_id: 'ghost-agent',
              observer_agent_id: 'team-lead',
              watcher_agent_ids: ['team-lead'],
              severity: 'orange',
              status: 'open',
              current_state: 'blocked',
              active_task: 'Revenue handoff still needs app confirmation',
              summary: 'Unknown supervision-history actor stays plain text',
              evidence_refs: ['/tmp/revenue-handoff.md'],
              evidence_count: 1,
              correlation_id: 'corr-app-review',
              source_kind: 'controller_event',
              metadata: {}
            }
          ]
        })
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const inspectButton = detailsPanel.getByRole('button', {
      name: 'Inspect App Engineering Agent',
      exact: true
    });

    await focusHubControlWithTab(page, inspectButton, 'Inspect App Engineering Agent');
    await expect(inspectButton).toBeFocused();
    await page.keyboard.press('Enter');

    const supervisionSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Supervision History' })
    });
    const currentRecord = supervisionSection.locator('li').filter({
      has: page.getByText('Current supervision-history actor stays plain text', { exact: true })
    });
    const unknownRecord = supervisionSection.locator('li').filter({
      has: page.getByText('Unknown supervision-history actor stays plain text', { exact: true })
    });
    const currentActorButton = currentRecord.getByRole('button', {
      name: 'Select supervision history actor from alert alert-browser-supervision-history-actor-current app-engineering'
    });
    const unknownActorButton = unknownRecord.getByRole('button', {
      name: 'Select supervision history actor from alert alert-browser-supervision-history-actor-unknown ghost-agent'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(supervisionSection.getByText('Current supervision-history actor stays plain text')).toBeVisible();
    await expect(supervisionSection.getByText('Unknown supervision-history actor stays plain text')).toBeVisible();
    await expect(currentRecord).toContainText('Actor · app-engineering');
    await expect(unknownRecord).toContainText('Actor · ghost-agent');
    await expect(currentActorButton).toHaveCount(0);
    await expect(unknownActorButton).toHaveCount(0);

    const requestSettleSamples: number[] = [];
    const isRequestStreamStable = (previousCount: number, currentCount: number) => previousCount === currentCount;

    for (let sample = 0; sample < 6; sample += 1) {
      requestSettleSamples.push(requestedUrls.length);

      if (findStableSample(requestSettleSamples, isRequestStreamStable)) {
        break;
      }

      if (sample < 5) {
        await page.waitForTimeout(100);
      }
    }

    requireStableSample(
      requestSettleSamples,
      isRequestStreamStable,
      'plain-text supervision-history actor request stream did not settle',
      (sample) => sample
    );

    const requestCountAfterSettle = requestedUrls.length;

    await page.waitForTimeout(150);

    expect(requestedUrls).toHaveLength(requestCountAfterSettle);
    expect(requestedUrls).not.toContain('/agents/ghost-agent/workflow?limit=10&window=60m');
    expect(requestedUrls).not.toContain('/peer-watch/alerts?target_agent_id=ghost-agent&limit=4');
    expect(requestedUrls).not.toContain('/memory/artifacts?limit=4&window=60m&agent_id=ghost-agent');
  });

  test('keeps current and unknown selected-agent supervision history observers as plain text via keyboard smoke', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    const accountabilityCorrelationId = 'collector-snapshot:2026-03-10T23:59:40.000Z';
    const selectedSupervisionHistoryPath = resolveSelectedAgentSupervisionHistoryPath(
      'app-engineering',
      accountabilityCorrelationId
    );
    await page.route(`**${selectedSupervisionHistoryPath}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              alert_id: 'alert-browser-supervision-history-observer-current',
              ts: '2026-03-10T23:00:00.000Z',
              agent_id: 'app-engineering',
              target_agent_id: 'app-engineering',
              actor_id: 'team-lead',
              observer_agent_id: 'app-engineering',
              watcher_agent_ids: ['team-lead'],
              severity: 'orange',
              status: 'open',
              current_state: 'blocked',
              active_task: 'Revenue handoff still needs app confirmation',
              summary: 'Current supervision-history observer stays plain text',
              evidence_refs: ['/tmp/revenue-handoff.md'],
              evidence_count: 1,
              correlation_id: 'corr-app-review',
              source_kind: 'controller_event',
              metadata: {}
            },
            {
              alert_id: 'alert-browser-supervision-history-observer-unknown',
              ts: '2026-03-10T23:05:00.000Z',
              agent_id: 'app-engineering',
              target_agent_id: 'app-engineering',
              actor_id: 'team-lead',
              observer_agent_id: 'ghost-agent',
              watcher_agent_ids: ['team-lead'],
              severity: 'orange',
              status: 'open',
              current_state: 'blocked',
              active_task: 'Revenue handoff still needs app confirmation',
              summary: 'Unknown supervision-history observer stays plain text',
              evidence_refs: ['/tmp/revenue-handoff.md'],
              evidence_count: 1,
              correlation_id: 'corr-app-review',
              source_kind: 'controller_event',
              metadata: {}
            }
          ]
        })
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const inspectButton = detailsPanel.getByRole('button', {
      name: 'Inspect App Engineering Agent',
      exact: true
    });

    await focusHubControlWithTab(page, inspectButton, 'Inspect App Engineering Agent');
    await expect(inspectButton).toBeFocused();
    await page.keyboard.press('Enter');

    const supervisionSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Supervision History' })
    });
    const currentRecord = supervisionSection.locator('li').filter({
      has: page.getByText('Current supervision-history observer stays plain text', { exact: true })
    });
    const unknownRecord = supervisionSection.locator('li').filter({
      has: page.getByText('Unknown supervision-history observer stays plain text', { exact: true })
    });
    const currentObserverButton = currentRecord.getByRole('button', {
      name: 'Select supervision history observer from alert alert-browser-supervision-history-observer-current app-engineering'
    });
    const unknownObserverButton = unknownRecord.getByRole('button', {
      name: 'Select supervision history observer from alert alert-browser-supervision-history-observer-unknown ghost-agent'
    });

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(supervisionSection.getByText('Current supervision-history observer stays plain text')).toBeVisible();
    await expect(supervisionSection.getByText('Unknown supervision-history observer stays plain text')).toBeVisible();
    await expect(currentRecord).toContainText('Observer · app-engineering');
    await expect(unknownRecord).toContainText('Observer · ghost-agent');
    await expect(currentObserverButton).toHaveCount(0);
    await expect(unknownObserverButton).toHaveCount(0);

    const requestSettleSamples: number[] = [];
    const isRequestStreamStable = (previousCount: number, currentCount: number) => previousCount === currentCount;

    for (let sample = 0; sample < 6; sample += 1) {
      requestSettleSamples.push(requestedUrls.length);

      if (findStableSample(requestSettleSamples, isRequestStreamStable)) {
        break;
      }

      if (sample < 5) {
        await page.waitForTimeout(100);
      }
    }

    requireStableSample(
      requestSettleSamples,
      isRequestStreamStable,
      'plain-text supervision-history observer request stream did not settle',
      (sample) => sample
    );

    const requestCountAfterSettle = requestedUrls.length;

    await page.waitForTimeout(150);

    expect(requestedUrls).toHaveLength(requestCountAfterSettle);
    expect(requestedUrls).not.toContain('/agents/ghost-agent/workflow?limit=10&window=60m');
    expect(requestedUrls).not.toContain('/peer-watch/alerts?target_agent_id=ghost-agent&limit=4');
    expect(requestedUrls).not.toContain('/memory/artifacts?limit=4&window=60m&agent_id=ghost-agent');
  });

  test('keeps the active selected correlation when opening a supervision history observer pivot via keyboard traversal', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    const forbiddenRequests: string[] = [];
    const directOperationUrl = '/office/operations?agent_id=growth-revenue';
    const accountabilityCorrelationId = 'collector-snapshot:2026-03-10T23:59:40.000Z';
    const supervisionHistoryUrl = resolveSelectedAgentSupervisionHistoryPath(
      'growth-revenue',
      accountabilityCorrelationId
    );
    const unscopedArtifactsUrl = '/memory/artifacts?limit=4&window=60m&agent_id=growth-revenue';
    const fallbackCorrelationUrl = '/correlations/corr-growth-lead-review?limit=10&window=60m';
    let trackForbiddenRequests = false;

    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    await page.route(`**${directOperationUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(directOperationUrl);
      }
      await route.continue();
    });

    await page.route(`**${unscopedArtifactsUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(unscopedArtifactsUrl);
      }
      await route.continue();
    });

    await page.route(`**${fallbackCorrelationUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(fallbackCorrelationUrl);
      }
      await route.continue();
    });

    const selectedSupervisionHistoryPath = resolveSelectedAgentSupervisionHistoryPath(
      'app-engineering',
      accountabilityCorrelationId
    );
    await page.route(`**${selectedSupervisionHistoryPath}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              alert_id: 'alert-browser-supervision-history-observer',
              ts: '2026-03-10T23:00:00.000Z',
              agent_id: 'app-engineering',
              target_agent_id: 'app-engineering',
              actor_id: 'team-lead',
              observer_agent_id: 'growth-revenue',
              watcher_agent_ids: ['team-lead'],
              severity: 'orange',
              status: 'open',
              current_state: 'blocked',
              active_task: 'Revenue handoff still needs app confirmation',
              summary: 'Supervision history observer keeps the active correlation',
              evidence_refs: ['/tmp/revenue-handoff.md'],
              evidence_count: 1,
              correlation_id: 'corr-app-review',
              source_kind: 'controller_event',
              metadata: {}
            }
          ]
        })
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

    const supervisionSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Supervision History' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const supervisionObserverButton = supervisionSection.getByRole('button', {
      name: 'Select supervision history observer from alert alert-browser-supervision-history-observer growth-revenue'
    });
    const workflowUrl = '/agents/growth-revenue/workflow?limit=10&window=60m';
    const scopedArtifactsUrl = `/memory/artifacts?limit=4&window=60m&agent_id=growth-revenue&correlation_id=${encodeURIComponent(
      accountabilityCorrelationId
    )}`;

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(supervisionSection.getByText('Supervision history observer keeps the active correlation')).toBeVisible();
    await expect(correlationSection.getByText(accountabilityCorrelationId, { exact: true })).toBeVisible();
    await expect(supervisionObserverButton).toBeVisible();
    await focusHubControlWithTab(
      page,
      supervisionObserverButton,
      'Select supervision history observer from alert alert-browser-supervision-history-observer growth-revenue'
    );
    await expect(supervisionObserverButton).toBeFocused();

    trackForbiddenRequests = true;
    const requestCountBeforePivot = requestedUrls.length;
    const workflowResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && response.status() === 200 && response.url().includes(workflowUrl)
    );
    const supervisionHistoryResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && response.status() === 200 && response.url().includes(supervisionHistoryUrl)
    );
    const scopedArtifactsResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && response.status() === 200 && response.url().includes(scopedArtifactsUrl)
    );

    await page.keyboard.press('Enter');
    await workflowResponse;
    await supervisionHistoryResponse;
    await scopedArtifactsResponse;

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText(accountabilityCorrelationId, { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 0 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);

    const requestSettleSamples: Array<{ requestedCount: number; forbiddenCount: number }> = [];
    const isRequestStreamStable = (
      previous: { requestedCount: number; forbiddenCount: number },
      current: { requestedCount: number; forbiddenCount: number }
    ) => previous.requestedCount === current.requestedCount && previous.forbiddenCount === current.forbiddenCount;

    for (let sample = 0; sample < 6; sample += 1) {
      requestSettleSamples.push({
        requestedCount: requestedUrls.length,
        forbiddenCount: forbiddenRequests.length
      });

      if (findStableSample(requestSettleSamples, isRequestStreamStable)) {
        break;
      }

      if (sample < 5) {
        await page.waitForTimeout(100);
      }
    }

    requireStableSample(
      requestSettleSamples,
      isRequestStreamStable,
      'post-pivot request stream did not settle',
      (sample) => sample
    );

    const pivotRequestedUrls = requestedUrls.slice(requestCountBeforePivot);

    expect(pivotRequestedUrls).toContain(workflowUrl);
    expect(pivotRequestedUrls).toContain(supervisionHistoryUrl);
    expect(pivotRequestedUrls).toContain(scopedArtifactsUrl);
    expect(pivotRequestedUrls).not.toContain(directOperationUrl);
    expect(pivotRequestedUrls).not.toContain(unscopedArtifactsUrl);
    expect(pivotRequestedUrls).not.toContain(fallbackCorrelationUrl);
    expect(forbiddenRequests).toEqual([]);
  });

  test('keeps the active selected correlation and scoped reads when opening a supervision history watcher pivot via keyboard traversal', async ({
    page
  }) => {
    const requestedUrls: string[] = [];
    const forbiddenRequests: string[] = [];
    const directOperationUrl = '/office/operations?agent_id=growth-revenue';
    const accountabilityCorrelationId = 'collector-snapshot:2026-03-10T23:59:40.000Z';
    const supervisionHistoryUrl = resolveSelectedAgentSupervisionHistoryPath(
      'growth-revenue',
      accountabilityCorrelationId
    );
    const unscopedArtifactsUrl = '/memory/artifacts?limit=4&window=60m&agent_id=growth-revenue';
    const fallbackCorrelationUrl = '/correlations/corr-growth-lead-review?limit=10&window=60m';
    let trackForbiddenRequests = false;

    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    await page.route(`**${directOperationUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(directOperationUrl);
      }
      await route.continue();
    });

    await page.route(`**${unscopedArtifactsUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(unscopedArtifactsUrl);
      }
      await route.continue();
    });

    await page.route(`**${fallbackCorrelationUrl}`, async (route) => {
      if (trackForbiddenRequests) {
        forbiddenRequests.push(fallbackCorrelationUrl);
      }
      await route.continue();
    });

    const selectedSupervisionHistoryPath = resolveSelectedAgentSupervisionHistoryPath(
      'app-engineering',
      accountabilityCorrelationId
    );
    await page.route(`**${selectedSupervisionHistoryPath}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              alert_id: 'alert-browser-supervision-history-watcher',
              ts: '2026-03-10T23:00:00.000Z',
              agent_id: 'app-engineering',
              target_agent_id: 'app-engineering',
              actor_id: 'team-lead',
              observer_agent_id: 'team-lead',
              watcher_agent_ids: ['growth-revenue'],
              severity: 'orange',
              status: 'open',
              current_state: 'blocked',
              active_task: 'Revenue handoff still needs app confirmation',
              summary: 'Supervision history watcher keeps the active correlation',
              evidence_refs: ['/tmp/revenue-handoff.md'],
              evidence_count: 1,
              correlation_id: 'corr-app-review',
              source_kind: 'controller_event',
              metadata: {}
            }
          ]
        })
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

    const supervisionSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Supervision History' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });
    const supervisionWatcherButton = supervisionSection.getByRole('button', {
      name: 'Select supervision history watcher from alert alert-browser-supervision-history-watcher growth-revenue'
    });
    const workflowUrl = '/agents/growth-revenue/workflow?limit=10&window=60m';
    const scopedArtifactsUrl = `/memory/artifacts?limit=4&window=60m&agent_id=growth-revenue&correlation_id=${encodeURIComponent(
      accountabilityCorrelationId
    )}`;

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(supervisionSection.getByText('Supervision history watcher keeps the active correlation')).toBeVisible();
    await expect(correlationSection.getByText(accountabilityCorrelationId, { exact: true })).toBeVisible();
    await expect(supervisionWatcherButton).toBeVisible();
    await focusHubControlWithTab(
      page,
      supervisionWatcherButton,
      'Select supervision history watcher from alert alert-browser-supervision-history-watcher growth-revenue'
    );
    await expect(supervisionWatcherButton).toBeFocused();

    trackForbiddenRequests = true;
    const requestCountBeforePivot = requestedUrls.length;
    const workflowResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && response.status() === 200 && response.url().includes(workflowUrl)
    );
    const supervisionHistoryResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && response.status() === 200 && response.url().includes(supervisionHistoryUrl)
    );
    const scopedArtifactsResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' && response.status() === 200 && response.url().includes(scopedArtifactsUrl)
    );

    await page.keyboard.press('Enter');
    await workflowResponse;
    await supervisionHistoryResponse;
    await scopedArtifactsResponse;

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(detailsPanel.getByRole('heading', { name: 'Current Operation' })).toHaveCount(0);
    await expect(correlationSection.getByText(accountabilityCorrelationId, { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 0 interactions · 1 events')).toBeVisible();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toHaveCount(0);

    const requestSettleSamples: Array<{ requestedCount: number; forbiddenCount: number }> = [];
    const isRequestStreamStable = (
      previous: { requestedCount: number; forbiddenCount: number },
      current: { requestedCount: number; forbiddenCount: number }
    ) => previous.requestedCount === current.requestedCount && previous.forbiddenCount === current.forbiddenCount;

    for (let sample = 0; sample < 6; sample += 1) {
      requestSettleSamples.push({
        requestedCount: requestedUrls.length,
        forbiddenCount: forbiddenRequests.length
      });

      if (findStableSample(requestSettleSamples, isRequestStreamStable)) {
        break;
      }

      if (sample < 5) {
        await page.waitForTimeout(100);
      }
    }

    requireStableSample(
      requestSettleSamples,
      isRequestStreamStable,
      'post-pivot request stream did not settle',
      (sample) => sample
    );

    const pivotRequestedUrls = requestedUrls.slice(requestCountBeforePivot);

    expect(pivotRequestedUrls).toContain(workflowUrl);
    expect(pivotRequestedUrls).toContain(supervisionHistoryUrl);
    expect(pivotRequestedUrls).toContain(scopedArtifactsUrl);
    expect(pivotRequestedUrls).not.toContain(directOperationUrl);
    expect(pivotRequestedUrls).not.toContain(unscopedArtifactsUrl);
    expect(pivotRequestedUrls).not.toContain(fallbackCorrelationUrl);
    expect(forbiddenRequests).toEqual([]);
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
    await expect(correlationSection.getByText('corr-revenue-handoff', { exact: true })).toBeVisible();
    await focusHubControlWithTab(page, correlationParticipantButton, 'Select correlation participant agent team-lead');
    await expect(correlationParticipantButton).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(detailsPanel.getByRole('heading', { name: 'Team Lead' })).toBeVisible();
    await expect(clearButton).toBeFocused();
    await expect(correlationSection.getByText('corr-growth-lead-review', { exact: true })).toBeVisible();
    await expect(correlationSection.getByText('Counts · 0 incidents · 1 interactions · 2 events')).toBeVisible();
  });

  test('shows the selected-agent workflow loading state explicitly before surfacing the first workflow failure', async ({
    page
  }) => {
    let releaseSelectedWorkflow: (() => void) | null = null;
    const selectedWorkflowPath = '/agents/app-engineering/workflow?limit=10&window=60m';
    const selectedWorkflowRequests: string[] = [];

    await page.route('**/agents/app-engineering/workflow?limit=10&window=60m', async (route) => {
      const url = new URL(route.request().url());
      selectedWorkflowRequests.push(`${url.pathname}${url.search}`);

      if (selectedWorkflowRequests.length === 1) {
        await new Promise<void>((resolve) => {
          releaseSelectedWorkflow = resolve;
        });
      }

      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'internal_error',
          details: 'workflow request failed'
        })
      });
    });

    await page.goto('/');
    await expect(page.getByText('Metaverse Office operator shell')).toBeVisible();
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
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

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(page.getByText('Metaverse Office operator shell')).toBeVisible();
    await expect(workflowSection.getByText('Loading workflow...')).toBeVisible();
    await expect(workflowSection.getByText(/Unable to load workflow\./)).toHaveCount(0);
    await expect(workflowSection.getByText('No open watch alerts.')).toHaveCount(0);
    await expect(workflowSection.getByText('Latest heartbeat')).toHaveCount(0);
    await expect.poll(() => selectedWorkflowRequests.filter((request) => request === selectedWorkflowPath).length).toBe(1);

    expect(releaseSelectedWorkflow).not.toBeNull();
    releaseSelectedWorkflow!();

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(page.getByText('Metaverse Office operator shell')).toBeVisible();
    await expect(workflowSection.getByText('Unable to load workflow. workflow request failed')).toBeVisible();
    await expect(workflowSection.getByText('Loading workflow...')).toHaveCount(0);
    await expect(workflowSection.getByText('No open watch alerts.')).toHaveCount(0);
    await expect(workflowSection.getByText('Latest heartbeat')).toHaveCount(0);
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
    await expect(page.getByText('overview refresh failed', { exact: true })).toBeVisible();
    await expect(page.getByText('Office snapshot · Refresh failed · overview refresh failed')).toBeVisible();
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

  test('routes selected-agent supervision history reads through the managed Vite proxy', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Metaverse Office' })).toBeVisible();

    const frontendOrigin = new URL(page.url()).origin;
    const inspectableBackendOrigin = resolveInspectableBrowserSmokeBackendOrigin();
    const accountabilityCorrelationId = 'collector-snapshot:2026-03-10T23:59:40.000Z';
    const expectedBrowserRequest = resolveSelectedAgentSupervisionHistoryPath(
      'app-engineering',
      accountabilityCorrelationId
    );
    const browserRequests = new Set<string>();
    const handleRequest = (request: Request) => {
      const url = new URL(request.url());
      if (request.method() !== 'GET' || url.origin !== frontendOrigin) {
        return;
      }

      if (`${url.pathname}${url.search}` === expectedBrowserRequest) {
        browserRequests.add(expectedBrowserRequest);
      }
    };

    page.on('request', handleRequest);
    await page.getByRole('button', { name: 'Open Hub' }).click();

    try {
      const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
      await expect(detailsPanel).toBeVisible();

      await detailsPanel.getByRole('button', { name: 'Inspect App Engineering Agent', exact: true }).click();

      await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
      await expect(
        detailsPanel.getByText(
          `Request scope · Target agent · app-engineering · Active correlation · ${accountabilityCorrelationId}`
        )
      ).toBeVisible();

      await expect.poll(() => browserRequests.has(expectedBrowserRequest)).toBe(true);

      if (!inspectableBackendOrigin) {
        return;
      }

      await expect
        .poll(async () => {
          const requests = await readBrowserSmokeRequestLog(inspectableBackendOrigin);
          return requests.some(
            (entry) =>
              entry.method === 'GET' &&
              entry.origin === null &&
              entry.pathname === '/peer-watch/alerts'
          );
        })
        .toBe(true);
    } finally {
      page.off('request', handleRequest);
    }
  });

  test('Supervision History stays aligned with the active selected correlation in browser smoke once the selected-agent correlation settles', async ({
    page
  }) => {
    const accountabilityCorrelationId = 'collector-snapshot:2026-03-10T23:59:40.000Z';
    const scopedSupervisionHistoryPath = resolveSelectedAgentSupervisionHistoryPath(
      'app-engineering',
      accountabilityCorrelationId
    );
    const unscopedSupervisionHistoryPath = resolveSelectedAgentSupervisionHistoryPath('app-engineering');
    const requestedUrls: string[] = [];

    page.on('request', (request) => {
      try {
        const url = new URL(request.url());
        requestedUrls.push(`${url.pathname}${url.search}`);
      } catch {
        requestedUrls.push(request.url());
      }
    });

    await page.route(`**${unscopedSupervisionHistoryPath}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              alert_id: 'alert-browser-supervision-history-unscoped',
              ts: '2026-03-10T23:00:00.000Z',
              agent_id: 'app-engineering',
              target_agent_id: 'app-engineering',
              actor_id: 'team-lead',
              observer_agent_id: 'team-lead',
              watcher_agent_ids: ['team-lead'],
              severity: 'orange',
              status: 'open',
              current_state: 'blocked',
              active_task: 'Revenue handoff still needs app confirmation',
              summary: 'Unrelated supervision history should not leak into the scoped view',
              evidence_refs: ['/tmp/revenue-handoff.md'],
              evidence_count: 1,
              correlation_id: 'corr-app-secondary',
              source_kind: 'controller_event',
              metadata: {}
            }
          ]
        })
      });
    });

    await page.route(`**${scopedSupervisionHistoryPath}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              alert_id: 'alert-browser-supervision-history-scoped',
              ts: '2026-03-10T23:00:00.000Z',
              agent_id: 'app-engineering',
              target_agent_id: 'app-engineering',
              actor_id: 'team-lead',
              observer_agent_id: 'team-lead',
              watcher_agent_ids: ['team-lead'],
              severity: 'orange',
              status: 'open',
              current_state: 'blocked',
              active_task: 'Revenue handoff still needs app confirmation',
              summary: 'Supervision History stays aligned with the active selected correlation',
              evidence_refs: ['/tmp/revenue-handoff.md'],
              evidence_count: 1,
              correlation_id: accountabilityCorrelationId,
              source_kind: 'controller_event',
              metadata: {}
            }
          ]
        })
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const supervisionSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Supervision History' })
    });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });

    await detailsPanel.getByRole('button', { name: 'Inspect App Engineering Agent', exact: true }).click();

    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(correlationSection.getByText(accountabilityCorrelationId, { exact: true })).toBeVisible();
    await expect(
      supervisionSection.getByText('Supervision History stays aligned with the active selected correlation')
    ).toBeVisible();
    await expect(
      detailsPanel.getByText(
        `Request scope · Target agent · app-engineering · Active correlation · ${accountabilityCorrelationId}`
      )
    ).toBeVisible();
    await expect(
      supervisionSection.getByText('Unrelated supervision history should not leak into the scoped view')
    ).toHaveCount(0);

    await expect
      .poll(() => ({
        scoped: requestedUrls.includes(scopedSupervisionHistoryPath)
      }))
      .toEqual({
        scoped: true
      });
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
    test(`keeps the default initial viewport directly reachable to the top-left clamp edge without zooming first on the ${shell.name} shell`, async ({ page }) => {
      if (shell.name === 'landscape') {
        test.slow();
      }

      await page.setViewportSize(shell.viewport);
      await page.goto('/');
      await expectDefaultViewportKeepsDirectEdgeReachability(page, {
        initialEdge: 'top-left',
        verifyReturnToTopLeft: false
      });
    });
  }

  for (const shell of SHELLS) {
    test(`keeps the default initial viewport directly reachable to the left clamp edge via horizontal drag on fresh load on the ${shell.name} shell`, async ({ page }) => {
      if (shell.name === 'landscape') {
        test.slow();
      }

      await page.setViewportSize(shell.viewport);
      await page.goto('/');
      await expectDefaultViewportKeepsDirectEdgeReachability(page, {
        initialEdge: 'top-left',
        initialHorizontalOnly: true,
        verifyReturnToTopLeft: false
      });
    });
  }

  for (const shell of SHELLS) {
    test(`keeps the default initial viewport directly reachable to the right clamp edge via horizontal drag on fresh load on the ${shell.name} shell`, async ({ page }) => {
      if (shell.name === 'landscape') {
        test.slow();
      }

      await page.setViewportSize(shell.viewport);
      await page.goto('/');
      await expectDefaultViewportKeepsDirectEdgeReachability(page, {
        initialEdge: 'right',
        verifyReturnToTopLeft: false
      });
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

  test('keeps crew-overview live-resize horizontal reachability after landscape-to-portrait resize without reload', async ({
    page
  }) => {
    test.slow();

    const landscapeShell = SHELLS.find((shell) => shell.name === 'landscape');
    const portraitShell = SHELLS.find((shell) => shell.name === 'portrait');
    expect(landscapeShell).toBeDefined();
    expect(portraitShell).toBeDefined();

    await page.setViewportSize(landscapeShell!.viewport);
    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));
    await waitForViewportLayoutSettle(page);

    await page.setViewportSize(portraitShell!.viewport);

    await waitForViewportLayoutSettle(page);
    const resizedHostSize = await readWorldHostSize(page);
    const resizedViewport = await waitForViewportScreenSizeToMatchHost(page, resizedHostSize);
    const resizedScale = resizedViewport.scale ?? 1;
    const resizedTop = resizedViewport.top;
    const resizedClampPadding = {
      top: resizedViewport.clampPadding?.top ?? 0,
      right: resizedViewport.clampPadding?.right ?? 0
    };

    expect(resizedViewport.screenWidth).toBe(resizedHostSize.width);
    expect(resizedViewport.screenHeight).toBe(resizedHostSize.height);
    expect(resizedViewport.selectedAgent).toBeNull();
    expect(resizedViewport.scale).not.toBeNull();
    expectViewportBoundsWithinClampBudget(resizedViewport);

    const right = await dragViewportToEdge(page, 'right');
    expect(right.clampPadding?.top ?? 0).toBe(resizedClampPadding.top);
    expect(right.clampPadding?.right ?? 0).toBe(resizedClampPadding.right);
    expectViewportAtRightClampEdge(right, resizedScale, resizedTop);

    const left = await dragViewportToEdge(page, 'top-left', { horizontalOnly: true });
    expect(left.clampPadding?.top ?? 0).toBe(resizedClampPadding.top);
    expect(left.clampPadding?.right ?? 0).toBe(resizedClampPadding.right);
    expectViewportAtLeftClampEdge(left, resizedScale, resizedTop);
  });

  test('keeps portrait selected-watch overlay drag reachability at default zoom without adding right clamp padding', async ({ page }) => {
    const portraitShell = SHELLS.find((shell) => shell.name === 'portrait');
    expect(portraitShell).toBeDefined();

    await page.setViewportSize(portraitShell!.viewport);
    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    await detailsPanel.getByRole('button', { name: 'Inspect Growth Revenue Agent', exact: true }).click();
    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await page.getByRole('button', { name: 'Close Hub' }).click();
    await expect(page.getByRole('complementary', { name: 'Agent details' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Selected watch links' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Selected watch link list' })).toBeVisible();

    await expect
      .poll(async () => (await readViewportState(page))?.clampPadding?.right ?? null)
      .toBe(0);

    const initial = await waitForViewportSettle(page);
    expect(initial.scale).not.toBeNull();
    expect(initial.clampPadding?.right ?? 0).toBe(0);

    const initialScale = initial.scale!;
    const initialTop = initial.top;
    const right = await dragViewportToEdge(page, 'right');

    expect(right.clampPadding?.right ?? 0).toBe(0);
    expectViewportBoundsWithinClampBudget(right);
    expect(right.scale).toBeCloseTo(initialScale, 4);
    expect(right.right).toBeGreaterThanOrEqual(right.worldWidth - 0.5);
    expect(right.right).toBeLessThanOrEqual(right.worldWidth + 0.5);
    expect(Math.abs(right.top - initialTop)).toBeLessThanOrEqual(0.5);

    const left = await dragViewportToEdge(page, 'top-left', { horizontalOnly: true });
    expect(left.clampPadding?.right ?? 0).toBe(0);
    expectViewportAtLeftClampEdge(left, initialScale, initialTop);
  });

  test('restores the fresh-load viewport pose without opening the Hub when the Reset view shortcut is pressed', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    const resetViewButton = page.getByRole('button', { name: 'Reset view' });
    await expect(resetViewButton).toHaveAttribute('aria-keyshortcuts', 'R');
    await expect(page.getByRole('button', { name: 'Open Hub' })).toBeVisible();

    const baselinePose = await readViewportPose(page);
    expect(baselinePose).not.toBeNull();

    await zoomViewportOutToMinimum(page);
    await forceViewportAgainstTopRightClamp(page);

    await expect
      .poll(async () => {
        const currentPose = await readViewportPose(page);
        if (!baselinePose || !currentPose) {
          return false;
        }

        return (
          Math.abs(currentPose.x - baselinePose.x) >= 60 ||
          Math.abs(currentPose.y - baselinePose.y) >= 60 ||
          Math.abs(currentPose.scale - baselinePose.scale) >= 0.05
        );
      })
      .toBe(true);

    await page.keyboard.press('r');

    await expect(page.getByRole('button', { name: 'Open Hub' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Hub' })).toHaveCount(0);

    await expect
      .poll(async () => {
        const currentPose = await readViewportPose(page);
        if (!baselinePose || !currentPose) {
          return false;
        }

        return (
          Math.abs(currentPose.x - baselinePose.x) <= 1 &&
          Math.abs(currentPose.y - baselinePose.y) <= 1 &&
          Math.abs(currentPose.scale - baselinePose.scale) <= 0.01
        );
      }, {
        timeout: POLL_DRIVEN_ASSERTION_TIMEOUT_MS
      })
      .toBe(true);

    expectViewportBoundsWithinClampBudget(await waitForViewportSettle(page));
  });

  test('ignores the Reset view shortcut while focus stays inside the active-queue state filter', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    await page.getByRole('button', { name: 'Open Hub' }).click();

    const dialog = page.getByRole('dialog', { name: 'Hub' });
    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const queueSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Active Queue' })
    });
    const stateFilter = queueSection.getByRole('combobox', { name: 'Filter active queue by state' });

    await expect(dialog).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Crew Overview' })).toBeVisible();
    await expect(stateFilter).toHaveValue('');

    const baselinePose = await readViewportPose(page);
    expect(baselinePose).not.toBeNull();

    await zoomViewportOutToMinimum(page);
    await forceViewportAgainstTopRightClamp(page);

    await expect
      .poll(async () => {
        const currentPose = await readViewportPose(page);
        if (!baselinePose || !currentPose) {
          return false;
        }

        return (
          Math.abs(currentPose.x - baselinePose.x) >= 60 ||
          Math.abs(currentPose.y - baselinePose.y) >= 60 ||
          Math.abs(currentPose.scale - baselinePose.scale) >= 0.05
        );
      })
      .toBe(true);

    const shiftedPose = await waitForViewportSettle(page);

    await stateFilter.focus();
    await expect(stateFilter).toBeFocused();

    await page.keyboard.press('r');

    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hide Hub' })).toBeVisible();
    await expect(stateFilter).toBeFocused();

    await expect
      .poll(async () => {
        const currentPose = await readViewportPose(page);
        if (!currentPose) {
          return false;
        }

        return (
          Math.abs(currentPose.x - shiftedPose.x) <= 1 &&
          Math.abs(currentPose.y - shiftedPose.y) <= 1 &&
          Math.abs(currentPose.scale - shiftedPose.scale) <= 0.01
        );
      }, {
        timeout: POLL_DRIVEN_ASSERTION_TIMEOUT_MS
      })
      .toBe(true);

    await expect
      .poll(async () => {
        const currentPose = await readViewportPose(page);
        if (!baselinePose || !currentPose) {
          return false;
        }

        return (
          Math.abs(currentPose.x - baselinePose.x) >= 60 ||
          Math.abs(currentPose.y - baselinePose.y) >= 60 ||
          Math.abs(currentPose.scale - baselinePose.scale) >= 0.05
        );
      }, {
        timeout: POLL_DRIVEN_ASSERTION_TIMEOUT_MS
      })
      .toBe(true);

    expectViewportBoundsWithinClampBudget(await waitForViewportSettle(page));
  });

  test('restores the selected-agent default viewport pose without clearing hub context when the Reset view shortcut is pressed', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });

    await detailsPanel.getByRole('button', { name: 'Inspect App Engineering Agent', exact: true }).click();
    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    const correlationIdPattern = /(?:corr-[A-Za-z0-9:_-]+|collector-snapshot:\d{4}-\d{2}-\d{2}T[0-9:.]+Z)/;
    await expect
      .poll(async () => {
        const text = await correlationSection.textContent();
        return text?.match(correlationIdPattern)?.[0] ?? null;
      })
      .not.toBeNull();
    const baselineCorrelationId = ((await correlationSection.textContent()) ?? '').match(correlationIdPattern)?.[0] ?? null;
    expect(baselineCorrelationId).not.toBeNull();

    const baselinePose = await readViewportPose(page);
    expect(baselinePose).not.toBeNull();

    await zoomViewportOutToMinimum(page);
    await forceViewportAgainstTopRightClamp(page);

    await expect
      .poll(async () => {
        const currentPose = await readViewportPose(page);
        if (!baselinePose || !currentPose) {
          return false;
        }

        return (
          Math.abs(currentPose.x - baselinePose.x) >= 60 ||
          Math.abs(currentPose.y - baselinePose.y) >= 60 ||
          Math.abs(currentPose.scale - baselinePose.scale) >= 0.05
        );
      })
      .toBe(true);

    await expect(page.getByRole('button', { name: 'Reset view' })).toHaveAttribute('aria-keyshortcuts', 'R');
    await page.keyboard.press('r');

    await expect(page.getByRole('button', { name: 'Hide Hub' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear Selection' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(correlationSection.getByText(baselineCorrelationId!, { exact: true })).toBeVisible();

    await expect
      .poll(async () => {
        const currentPose = await readViewportPose(page);
        if (!baselinePose || !currentPose) {
          return false;
        }

        return (
          Math.abs(currentPose.x - baselinePose.x) <= 1 &&
          Math.abs(currentPose.y - baselinePose.y) <= 1 &&
          Math.abs(currentPose.scale - baselinePose.scale) <= 0.01
        );
      }, {
        timeout: POLL_DRIVEN_ASSERTION_TIMEOUT_MS
      })
      .toBe(true);

    expectViewportBoundsWithinClampBudget(await waitForViewportSettle(page));
  });

  test('restores the selected-agent default viewport pose without clearing hub context when Reset view is pressed', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const correlationSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Correlation Drilldown' })
    });

    await detailsPanel.getByRole('button', { name: 'Inspect App Engineering Agent', exact: true }).click();
    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    const correlationIdPattern = /(?:corr-[A-Za-z0-9:_-]+|collector-snapshot:\d{4}-\d{2}-\d{2}T[0-9:.]+Z)/;
    await expect
      .poll(async () => {
        const text = await correlationSection.textContent();
        return text?.match(correlationIdPattern)?.[0] ?? null;
      })
      .not.toBeNull();
    const baselineCorrelationId = ((await correlationSection.textContent()) ?? '').match(correlationIdPattern)?.[0] ?? null;
    expect(baselineCorrelationId).not.toBeNull();

    const baselinePose = await readViewportPose(page);
    expect(baselinePose).not.toBeNull();

    await zoomViewportOutToMinimum(page);
    await forceViewportAgainstTopRightClamp(page);

    await expect
      .poll(async () => {
        const currentPose = await readViewportPose(page);
        if (!baselinePose || !currentPose) {
          return false;
        }

        return (
          Math.abs(currentPose.x - baselinePose.x) >= 60 ||
          Math.abs(currentPose.y - baselinePose.y) >= 60 ||
          Math.abs(currentPose.scale - baselinePose.scale) >= 0.05
        );
      })
      .toBe(true);

    await page.getByRole('button', { name: 'Reset view' }).click();

    await expect(page.getByRole('button', { name: 'Hide Hub' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear Selection' })).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'App Engineering Agent' })).toBeVisible();
    await expect(correlationSection.getByText(baselineCorrelationId!, { exact: true })).toBeVisible();

    await expect
      .poll(async () => {
        const currentPose = await readViewportPose(page);
        if (!baselinePose || !currentPose) {
          return false;
        }

        return (
          Math.abs(currentPose.x - baselinePose.x) <= 1 &&
          Math.abs(currentPose.y - baselinePose.y) <= 1 &&
          Math.abs(currentPose.scale - baselinePose.scale) <= 0.01
        );
      }, {
        timeout: POLL_DRIVEN_ASSERTION_TIMEOUT_MS
      })
      .toBe(true);

    expectViewportBoundsWithinClampBudget(await waitForViewportSettle(page));
  });

  test('keeps selected-agent reset-view horizontal reachability after zoomed-in Hub inspection', async ({ page }) => {
    const landscapeShell = SHELLS.find((shell) => shell.name === 'landscape');
    expect(landscapeShell).toBeDefined();

    await page.setViewportSize(landscapeShell!.viewport);
    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    const dialog = page.getByRole('dialog', { name: 'Hub' });
    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const selectedAgentHeading = detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' });

    await page.getByRole('button', { name: 'Open Hub' }).click();
    await expect(dialog).toBeVisible();

    const inspectButton = detailsPanel.getByRole('button', {
      name: 'Inspect Growth Revenue Agent',
      exact: true
    });
    await expect(inspectButton).toBeVisible();
    await inspectButton.click();
    await expect(selectedAgentHeading).toBeVisible();

    const baseline = await waitForViewportSettle(page);
    const baselineScale = baseline.scale ?? 1;
    const baselineTop = baseline.top;
    const baselineClampPadding = {
      top: baseline.clampPadding?.top ?? 0,
      right: baseline.clampPadding?.right ?? 0
    };

    expect(baselineClampPadding.right).toBeGreaterThan(0);
    expectViewportBoundsWithinClampBudget(baseline);

    await zoomViewportInThroughCanvasWheelEvent(page);
    await forceViewportAgainstTopRightClamp(page);

    await expect
      .poll(async () => {
        const currentPose = await readViewportPose(page);
        if (!currentPose) {
          return false;
        }

        return (
          Math.abs(currentPose.x - baseline.x) >= 60 ||
          Math.abs(currentPose.y - baseline.y) >= 60 ||
          Math.abs((currentPose.scale ?? 0) - baselineScale) >= 0.05
        );
      })
      .toBe(true);

    await page.getByRole('button', { name: 'Reset view' }).click();

    await expect(dialog).toBeVisible();
    await expect(selectedAgentHeading).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear Selection' })).toBeVisible();

    await expect
      .poll(async () => {
        const currentPose = await readViewportPose(page);
        if (!currentPose) {
          return false;
        }

        return (
          Math.abs(currentPose.x - baseline.x) <= 1 &&
          Math.abs(currentPose.y - baseline.y) <= 1 &&
          Math.abs((currentPose.scale ?? 0) - baselineScale) <= 0.01
        );
      }, {
        timeout: POLL_DRIVEN_ASSERTION_TIMEOUT_MS
      })
      .toBe(true);

    const resetViewport = await waitForViewportSettle(page);
    expect(resetViewport.clampPadding?.top ?? 0).toBe(baselineClampPadding.top);
    expect(resetViewport.clampPadding?.right ?? 0).toBe(baselineClampPadding.right);
    expectViewportBoundsWithinClampBudget(resetViewport);

    const right = await dragViewportToEdge(page, 'right', { driver: 'synthetic-host-pointer' });
    await expect(dialog).toBeVisible();
    await expect(selectedAgentHeading).toBeVisible();
    expect(right.clampPadding?.top ?? 0).toBe(baselineClampPadding.top);
    expect(right.clampPadding?.right ?? 0).toBe(baselineClampPadding.right);
    expectViewportAtRightClampEdge(right, baselineScale, baselineTop);

    const left = await dragViewportToEdge(page, 'top-left', {
      horizontalOnly: true,
      driver: 'synthetic-host-pointer'
    });
    await expect(dialog).toBeVisible();
    await expect(selectedAgentHeading).toBeVisible();
    expect(left.clampPadding?.top ?? 0).toBe(baselineClampPadding.top);
    expect(left.clampPadding?.right ?? 0).toBe(baselineClampPadding.right);
    expectViewportAtLeftClampEdge(left, baselineScale, baselineTop);
  });

  test('keeps portrait selected-watch clamp gating stable across fixed-width overlay churn and unrelated shell noise', async ({
    page
  }) => {
    const portraitShell = SHELLS.find((shell) => shell.name === 'portrait');
    expect(portraitShell).toBeDefined();

    await page.setViewportSize(portraitShell!.viewport);
    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    await detailsPanel.getByRole('button', { name: 'Inspect Growth Revenue Agent', exact: true }).click();
    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await page.getByRole('button', { name: 'Close Hub' }).click();
    await expect(page.getByRole('complementary', { name: 'Agent details' })).toHaveCount(0);

    const watchOverlay = page.getByRole('region', { name: 'Selected watch links' });
    await expect(watchOverlay).toBeVisible();
    await expect(page.getByRole('list', { name: 'Selected watch link list' })).toBeVisible();

    const baseline = await waitForViewportSettle(page);
    const baselineScale = baseline.scale ?? 1;
    const baselineTop = baseline.top;
    const baselineClampPadding = {
      top: baseline.clampPadding?.top ?? 0,
      right: baseline.clampPadding?.right ?? 0
    };

    expect(baselineClampPadding.right).toBe(0);

    await page.evaluate(() => {
      const watchOverlay = document.querySelector('.aitown-watch-overlay');
      const watchTitle = document.querySelector('.aitown-watch-overlay__title');
      const watchSummary = document.querySelector('.aitown-watch-overlay__summary');
      const shell = document.querySelector('.aitown-shell');

      if (!(watchOverlay instanceof HTMLElement)) {
        throw new Error('missing selected-watch overlay');
      }

      if (!(watchTitle instanceof HTMLElement) || !(watchSummary instanceof HTMLElement)) {
        throw new Error('missing selected-watch overlay copy');
      }

      if (!(shell instanceof HTMLElement)) {
        throw new Error('missing shell root');
      }

      watchTitle.textContent = 'Portrait watch links still pinned';
      watchSummary.textContent = 'Fixed-width overlay churn should not create portrait clamp padding.';

      const overlayNoise = document.createElement('div');
      overlayNoise.className = 'aitown-watch-overlay__smoke-noise';
      overlayNoise.textContent = 'Overlay churn';
      watchOverlay.appendChild(overlayNoise);
      overlayNoise.classList.add('aitown-watch-overlay__smoke-noise--active');
      overlayNoise.style.color = 'rgb(241, 221, 176)';

      const shellNoise = document.createElement('div');
      shellNoise.className = 'aitown-shell__smoke-noise';
      shellNoise.textContent = 'Unrelated shell noise';
      shell.appendChild(shellNoise);
      shellNoise.classList.add('aitown-shell__smoke-noise--active');
      shellNoise.style.opacity = '0.99';
      shellNoise.remove();
    });

    const churned = await waitForViewportSettle(page);
    expect(churned.scale).toBeCloseTo(baselineScale, 4);
    expect(Math.abs(churned.x - baseline.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(churned.y - baseline.y)).toBeLessThanOrEqual(0.5);
    expect(churned.clampPadding?.top ?? 0).toBe(baselineClampPadding.top);
    expect(churned.clampPadding?.right ?? 0).toBe(0);

    const right = await dragViewportToEdge(page, 'right');
    expect(right.clampPadding?.top ?? 0).toBe(baselineClampPadding.top);
    expect(right.clampPadding?.right ?? 0).toBe(0);
    expectViewportBoundsWithinClampBudget(right);
    expect(right.scale).toBeCloseTo(baselineScale, 4);
    expect(right.right).toBeGreaterThanOrEqual(right.worldWidth - 0.5);
    expect(right.right).toBeLessThanOrEqual(right.worldWidth + 0.5);
    expect(Math.abs(right.top - baselineTop)).toBeLessThanOrEqual(0.5);

    const left = await dragViewportToEdge(page, 'top-left', { horizontalOnly: true });
    expect(left.clampPadding?.top ?? 0).toBe(baselineClampPadding.top);
    expect(left.clampPadding?.right ?? 0).toBe(0);
    expectViewportAtLeftClampEdge(left, baselineScale, baselineTop);
  });

  test('preserves the portrait selected-watch manual pose and zero-right-clamp reachability after clearing and reselecting through the UI', async ({
    page
  }) => {
    test.slow();

    const portraitShell = SHELLS.find((shell) => shell.name === 'portrait');
    expect(portraitShell).toBeDefined();

    await page.setViewportSize(portraitShell!.viewport);
    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    const readRightClampPadding = async () => (await readViewportState(page))?.clampPadding?.right ?? null;
    const baseline = await waitForViewportSettle(page);
    const baselineScale = baseline.scale ?? 1;
    const baselineClampPadding = {
      top: baseline.clampPadding?.top ?? 0,
      right: baseline.clampPadding?.right ?? 0
    };

    expect(baselineClampPadding.right).toBe(0);

    const selectWatchOverlay = async () => {
      await page.getByRole('button', { name: 'Open Hub' }).click();

      const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
      const inspectButton = detailsPanel.getByRole('button', {
        name: 'Inspect Growth Revenue Agent',
        exact: true
      });
      await expect(inspectButton).toBeVisible();
      await inspectButton.click();
      await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
      await page.getByRole('button', { name: 'Close Hub' }).click();
      await expect(detailsPanel).toHaveCount(0);

      const watchOverlay = page.getByRole('region', { name: 'Selected watch links' });
      await expect(watchOverlay).toBeVisible();
      await expect(page.getByRole('list', { name: 'Selected watch link list' })).toBeVisible();
      await expect.poll(readRightClampPadding).toBe(0);

      return watchOverlay;
    };

    const expectZeroRightClampPaddingKeepsHorizontalDragReachability = async () => {
      const settled = await waitForViewportSettle(page);
      const settledTop = settled.top;

      expect(settled.scale).toBeCloseTo(baselineScale, 4);
      expect(settled.clampPadding?.top ?? 0).toBe(baselineClampPadding.top);
      expect(settled.clampPadding?.right ?? 0).toBe(0);

      const right = await dragViewportToEdge(page, 'right');
      expect(right.clampPadding?.top ?? 0).toBe(baselineClampPadding.top);
      expect(right.clampPadding?.right ?? 0).toBe(0);
      expectViewportBoundsWithinClampBudget(right);
      expect(right.scale).toBeCloseTo(baselineScale, 4);
      expect(right.right).toBeGreaterThanOrEqual(right.worldWidth - 0.5);
      expect(right.right).toBeLessThanOrEqual(right.worldWidth + 0.5);
      expect(Math.abs(right.top - settledTop)).toBeLessThanOrEqual(0.5);

      const left = await dragViewportToEdge(page, 'top-left', { horizontalOnly: true });
      expect(left.clampPadding?.top ?? 0).toBe(baselineClampPadding.top);
      expect(left.clampPadding?.right ?? 0).toBe(0);
      expectViewportAtLeftClampEdge(left, baselineScale, settledTop);

      return settled;
    };

    const firstWatchOverlay = await selectWatchOverlay();
    await expectZeroRightClampPaddingKeepsHorizontalDragReachability();
    const firstSelectedManualPose = await waitForViewportSettle(page);

    await page.getByRole('button', { name: 'Clear Selection' }).click();
    await expect(firstWatchOverlay).toHaveCount(0);

    await expect
      .poll(readRightClampPadding)
      .toBeCloseTo(baselineClampPadding.right, 4);

    const cleared = await waitForViewportSettle(page);
    expect(cleared.clampPadding?.top ?? 0).toBe(baselineClampPadding.top);
    expect(cleared.clampPadding?.right ?? 0).toBeCloseTo(baselineClampPadding.right, 4);

    await expectZeroRightClampPaddingKeepsHorizontalDragReachability();
    const clearedManualPose = await waitForViewportSettle(page);

    await selectWatchOverlay();
    const reselected = await waitForViewportSettle(page);
    expect(reselected.scale).toBeCloseTo(clearedManualPose.scale ?? baselineScale, 4);
    expect(Math.abs(reselected.x - clearedManualPose.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(reselected.y - clearedManualPose.y)).toBeLessThanOrEqual(0.5);
    expect(reselected.clampPadding?.top ?? 0).toBe(clearedManualPose.clampPadding?.top ?? baselineClampPadding.top);
    expect(reselected.clampPadding?.right ?? 0).toBe(0);

    await expectZeroRightClampPaddingKeepsHorizontalDragReachability();
  });

  test('clears landscape selected-watch overlay clamp padding after clearing the overlay through the UI', async ({
    page
  }) => {
    const landscapeShell = SHELLS.find((shell) => shell.name === 'landscape');
    expect(landscapeShell).toBeDefined();
    const overlayDominanceMarginPx = 48;
    const widenedWatchOverlayWidthPx = 560;

    await page.setViewportSize(landscapeShell!.viewport);
    await page.goto('/');
    await page.addStyleTag({
      content: `
        .aitown-watch-overlay {
          width: ${widenedWatchOverlayWidthPx}px !important;
          max-width: none !important;
        }
      `
    });
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    const readRightClampPadding = async () => (await readViewportState(page))?.clampPadding?.right ?? null;
    const baseline = await waitForViewportSettle(page);
    const baselineScale = baseline.scale ?? 1;
    const baselineTop = baseline.clampPadding?.top ?? 0;
    const baselineRight = baseline.clampPadding?.right ?? 0;

    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const inspectButton = detailsPanel.getByRole('button', {
      name: 'Inspect Growth Revenue Agent',
      exact: true
    });
    await expect(inspectButton).toBeVisible();
    await inspectButton.click();
    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await page.getByRole('button', { name: 'Close Hub' }).click();
    await expect(page.getByRole('complementary', { name: 'Agent details' })).toHaveCount(0);

    const watchOverlay = page.getByRole('region', { name: 'Selected watch links' });
    await expect(watchOverlay).toBeVisible();
    await expect(page.getByRole('list', { name: 'Selected watch link list' })).toBeVisible();

    await expect
      .poll(async () =>
        watchOverlay.evaluate((element) => element.getBoundingClientRect().width)
      )
      .toBeGreaterThan(baselineRight + overlayDominanceMarginPx);

    await expect
      .poll(readRightClampPadding)
      .toBeGreaterThan(baselineRight + overlayDominanceMarginPx);

    const overlayVisible = await waitForViewportSettle(page);
    const overlayWidth = await watchOverlay.evaluate((element) => element.getBoundingClientRect().width);
    expect(overlayVisible.clampPadding?.top ?? 0).toBe(baselineTop);
    expect(overlayWidth).toBeGreaterThan(baselineRight + overlayDominanceMarginPx);
    expect(overlayVisible.clampPadding?.right ?? 0).toBeGreaterThan(baselineRight + overlayDominanceMarginPx);

    await page.getByRole('button', { name: 'Clear Selection' }).click();
    await expect(watchOverlay).toHaveCount(0);

    await expect
      .poll(readRightClampPadding)
      .toBeCloseTo(baselineRight, 4);

    const cleared = await waitForViewportSettle(page);
    expect(cleared.clampPadding?.top ?? 0).toBe(baselineTop);
    expect(cleared.clampPadding?.right ?? 0).toBeCloseTo(baselineRight, 4);

    const clearedRightEdge = await dragViewportToEdge(page, 'right');
    expect(clearedRightEdge.scale).toBeCloseTo(baselineScale, 4);
    expect(isViewportAtRightEdge(clearedRightEdge)).toBe(true);
  });

  test('keeps landscape selected-watch clamp gating stable across fixed-width overlay churn and unrelated shell noise', async ({
    page
  }) => {
    const landscapeShell = SHELLS.find((shell) => shell.name === 'landscape');
    expect(landscapeShell).toBeDefined();

    await page.setViewportSize(landscapeShell!.viewport);
    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    await detailsPanel.getByRole('button', { name: 'Inspect Growth Revenue Agent', exact: true }).click();
    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await page.getByRole('button', { name: 'Close Hub' }).click();
    await expect(page.getByRole('complementary', { name: 'Agent details' })).toHaveCount(0);

    const watchOverlay = page.getByRole('region', { name: 'Selected watch links' });
    await expect(watchOverlay).toBeVisible();
    await expect(page.getByRole('list', { name: 'Selected watch link list' })).toBeVisible();

    const baseline = await waitForViewportSettle(page);
    const baselineScale = baseline.scale ?? 1;
    const baselineTop = baseline.top;
    const baselineClampPadding = {
      top: baseline.clampPadding?.top ?? 0,
      right: baseline.clampPadding?.right ?? 0
    };

    expect(baselineClampPadding.right).toBeGreaterThan(0);

    await page.evaluate(() => {
      const watchOverlay = document.querySelector('.aitown-watch-overlay');
      const watchTitle = document.querySelector('.aitown-watch-overlay__title');
      const watchSummary = document.querySelector('.aitown-watch-overlay__summary');
      const shell = document.querySelector('.aitown-shell');

      if (!(watchOverlay instanceof HTMLElement)) {
        throw new Error('missing selected-watch overlay');
      }

      if (!(watchTitle instanceof HTMLElement) || !(watchSummary instanceof HTMLElement)) {
        throw new Error('missing selected-watch overlay copy');
      }

      if (!(shell instanceof HTMLElement)) {
        throw new Error('missing shell root');
      }

      watchTitle.textContent = 'Watch links still pinned';
      watchSummary.textContent = 'Fixed-width overlay churn should not retrigger clamp padding.';

      const overlayNoise = document.createElement('div');
      overlayNoise.className = 'aitown-watch-overlay__smoke-noise';
      overlayNoise.textContent = 'Overlay churn';
      watchOverlay.appendChild(overlayNoise);
      overlayNoise.classList.add('aitown-watch-overlay__smoke-noise--active');
      overlayNoise.style.color = 'rgb(241, 221, 176)';

      const shellNoise = document.createElement('div');
      shellNoise.className = 'aitown-shell__smoke-noise';
      shellNoise.textContent = 'Unrelated shell noise';
      shell.appendChild(shellNoise);
      shellNoise.classList.add('aitown-shell__smoke-noise--active');
      shellNoise.style.opacity = '0.99';
      shellNoise.remove();
    });

    const churned = await waitForViewportSettle(page);
    expect(churned.scale).toBeCloseTo(baselineScale, 4);
    expect(Math.abs(churned.x - baseline.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(churned.y - baseline.y)).toBeLessThanOrEqual(0.5);
    expect(churned.clampPadding?.top ?? 0).toBe(baselineClampPadding.top);
    expect(churned.clampPadding?.right ?? 0).toBe(baselineClampPadding.right);

    const right = await dragViewportToEdge(page, 'right');
    expect(right.clampPadding?.top ?? 0).toBe(baselineClampPadding.top);
    expect(right.clampPadding?.right ?? 0).toBe(baselineClampPadding.right);
    expectViewportAtRightClampEdge(right, baselineScale, baselineTop);

    const left = await dragViewportToEdge(page, 'top-left', { horizontalOnly: true });
    expect(left.clampPadding?.top ?? 0).toBe(baselineClampPadding.top);
    expect(left.clampPadding?.right ?? 0).toBe(baselineClampPadding.right);
    expectViewportAtLeftClampEdge(left, baselineScale, baselineTop);
  });

  test('keeps landscape selected-agent Hub default-zoom horizontal reachability with the Hub sheet open', async ({ page }) => {
    test.slow();

    const landscapeShell = SHELLS.find((shell) => shell.name === 'landscape');
    expect(landscapeShell).toBeDefined();

    await page.setViewportSize(landscapeShell!.viewport);
    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    const dialog = page.getByRole('dialog', { name: 'Hub' });
    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const selectedAgentHeading = detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' });

    await page.getByRole('button', { name: 'Open Hub' }).click();
    await expect(dialog).toBeVisible();

    const inspectButton = detailsPanel.getByRole('button', {
      name: 'Inspect Growth Revenue Agent',
      exact: true
    });
    await expect(inspectButton).toBeVisible();
    await inspectButton.click();
    await expect(selectedAgentHeading).toBeVisible();

    const baseline = await waitForViewportSettle(page);
    const baselineScale = baseline.scale ?? 1;
    const baselineTop = baseline.top;
    const baselineClampPadding = {
      top: baseline.clampPadding?.top ?? 0,
      right: baseline.clampPadding?.right ?? 0
    };

    expect(baselineClampPadding.right).toBeGreaterThan(0);
    expectViewportBoundsWithinClampBudget(baseline);

    const right = await dragViewportToEdge(page, 'right', { driver: 'synthetic-host-pointer' });
    await expect(dialog).toBeVisible();
    await expect(selectedAgentHeading).toBeVisible();
    expect(right.clampPadding?.top ?? 0).toBe(baselineClampPadding.top);
    expect(right.clampPadding?.right ?? 0).toBe(baselineClampPadding.right);
    expectViewportAtRightClampEdge(right, baselineScale, baselineTop);

    const left = await dragViewportToEdge(page, 'top-left', {
      horizontalOnly: true,
      driver: 'synthetic-host-pointer'
    });
    await expect(dialog).toBeVisible();
    await expect(selectedAgentHeading).toBeVisible();
    expect(left.clampPadding?.top ?? 0).toBe(baselineClampPadding.top);
    expect(left.clampPadding?.right ?? 0).toBe(baselineClampPadding.right);
    expectViewportAtLeftClampEdge(left, baselineScale, baselineTop);
  });

  test('keeps portrait selected-agent Hub default-zoom horizontal reachability with the Hub sheet open', async ({ page }) => {
    test.slow();

    const portraitShell = SHELLS.find((shell) => shell.name === 'portrait');
    expect(portraitShell).toBeDefined();

    await page.setViewportSize(portraitShell!.viewport);
    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    const dialog = page.getByRole('dialog', { name: 'Hub' });
    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const selectedAgentHeading = detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' });

    await page.getByRole('button', { name: 'Open Hub' }).click();
    await expect(dialog).toBeVisible();

    const inspectButton = detailsPanel.getByRole('button', {
      name: 'Inspect Growth Revenue Agent',
      exact: true
    });
    await expect(inspectButton).toBeVisible();
    await inspectButton.click();
    await expect(selectedAgentHeading).toBeVisible();

    const baseline = await waitForViewportSettle(page);
    const baselineScale = baseline.scale ?? 1;
    const baselineTop = baseline.top;
    const baselineClampPadding = {
      top: baseline.clampPadding?.top ?? 0,
      right: baseline.clampPadding?.right ?? 0
    };

    expect(baselineClampPadding.right).toBeGreaterThan(0);
    expectViewportBoundsWithinClampBudget(baseline);

    const right = await dragViewportToEdge(page, 'right', { driver: 'synthetic-host-pointer' });
    await expect(dialog).toBeVisible();
    await expect(selectedAgentHeading).toBeVisible();
    expect(right.clampPadding?.top ?? 0).toBe(baselineClampPadding.top);
    expect(right.clampPadding?.right ?? 0).toBe(baselineClampPadding.right);
    expectViewportAtRightClampEdge(right, baselineScale, baselineTop);

    const left = await dragViewportToEdge(page, 'top-left', {
      horizontalOnly: true,
      driver: 'synthetic-host-pointer'
    });
    await expect(dialog).toBeVisible();
    await expect(selectedAgentHeading).toBeVisible();
    expect(left.clampPadding?.top ?? 0).toBe(baselineClampPadding.top);
    expect(left.clampPadding?.right ?? 0).toBe(baselineClampPadding.right);
    expectViewportAtLeftClampEdge(left, baselineScale, baselineTop);
  });

  test('keeps selected-agent Hub-open live-resize safe-lane continuity after landscape-to-portrait resize', async ({
    page
  }) => {
    test.slow();

    const landscapeShell = SHELLS.find((shell) => shell.name === 'landscape');
    const portraitShell = SHELLS.find((shell) => shell.name === 'portrait');
    expect(landscapeShell).toBeDefined();
    expect(portraitShell).toBeDefined();

    await page.setViewportSize(landscapeShell!.viewport);
    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    const dialog = page.getByRole('dialog', { name: 'Hub' });
    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const selectedAgentHeading = detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' });

    await page.getByRole('button', { name: 'Open Hub' }).click();
    await expect(dialog).toBeVisible();

    const inspectButton = detailsPanel.getByRole('button', {
      name: 'Inspect Growth Revenue Agent',
      exact: true
    });
    await expect(inspectButton).toBeVisible();
    await inspectButton.click();
    await expect(selectedAgentHeading).toBeVisible();
    await waitForViewportLayoutSettle(page);

    await page.setViewportSize(portraitShell!.viewport);
    await expect(dialog).toBeVisible();
    await expect(selectedAgentHeading).toBeVisible();

    await waitForViewportLayoutSettle(page);
    const resizedHostSize = await readWorldHostSize(page);
    const resizedViewport = await waitForViewportScreenSizeToMatchHost(page, resizedHostSize);
    const resizedSelectedAgent = resizedViewport.selectedAgent;
    expect(resizedSelectedAgent).not.toBeNull();

    expect(resizedViewport.screenWidth).toBe(resizedHostSize.width);
    expect(resizedViewport.screenHeight).toBe(resizedHostSize.height);

    const resizedProjection = resolveWorldPointScreenProjection(resizedViewport, {
      x: resizedSelectedAgent!.x,
      y: resizedSelectedAgent!.y
    });
    const resizedSafeAreaTarget = resolveViewportSafeAreaTarget(resizedViewport);
    const resizedScale = resizedViewport.scale ?? 1;
    const resizedTop = resizedViewport.top;
    const resizedClampPadding = {
      top: resizedViewport.clampPadding?.top ?? 0,
      right: resizedViewport.clampPadding?.right ?? 0
    };

    expect(resizedSelectedAgent!.agentId).toBe('growth-revenue');
    expect(resizedClampPadding.right).toBeGreaterThan(0);
    expect(Math.abs(resizedProjection.x - resizedSafeAreaTarget.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(resizedProjection.y - resizedSafeAreaTarget.y)).toBeLessThanOrEqual(0.5);
    expectViewportBoundsWithinClampBudget(resizedViewport);

    const right = await dragViewportToEdge(page, 'right', { driver: 'synthetic-host-pointer' });
    await expect(dialog).toBeVisible();
    await expect(selectedAgentHeading).toBeVisible();
    expect(right.selectedAgent?.agentId).toBe('growth-revenue');
    expect(right.clampPadding?.top ?? 0).toBe(resizedClampPadding.top);
    expect(right.clampPadding?.right ?? 0).toBe(resizedClampPadding.right);
    expectViewportAtRightClampEdge(right, resizedScale, resizedTop);

    const left = await dragViewportToEdge(page, 'top-left', {
      horizontalOnly: true,
      driver: 'synthetic-host-pointer'
    });
    await expect(dialog).toBeVisible();
    await expect(selectedAgentHeading).toBeVisible();
    expect(left.selectedAgent?.agentId).toBe('growth-revenue');
    expect(left.clampPadding?.top ?? 0).toBe(resizedClampPadding.top);
    expect(left.clampPadding?.right ?? 0).toBe(resizedClampPadding.right);
    expectViewportAtLeftClampEdge(left, resizedScale, resizedTop);
  });

  test('re-centers the landscape viewport under active right clamp padding after inspecting a selected agent through the Hub', async ({
    page
  }) => {
    const landscapeShell = SHELLS.find((shell) => shell.name === 'landscape');
    expect(landscapeShell).toBeDefined();

    await page.setViewportSize(landscapeShell!.viewport);
    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    await page.getByRole('button', { name: 'Open Hub' }).click();

    const baselineViewport = await waitForViewportLayoutSettle(page);
    const baselineRightPadding = baselineViewport.clampPadding?.right ?? 0;
    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const workflowResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.status() === 200 &&
        response.url().includes('/agents/growth-revenue/workflow?limit=10&window=60m')
    );

    await detailsPanel.getByRole('button', { name: 'Inspect Growth Revenue Agent', exact: true }).click();
    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await workflowResponsePromise;

    const selectedAgentViewport = await waitForViewportLayoutSettle(page);
    const selectedRightPadding = selectedAgentViewport.clampPadding?.right ?? 0;
    const viewportShift = Math.hypot(
      selectedAgentViewport.x - baselineViewport.x,
      selectedAgentViewport.y - baselineViewport.y
    );
    const selectedAgent = selectedAgentViewport.selectedAgent;

    expect(selectedAgent).not.toBeNull();

    const selectedAgentProjection = resolveWorldPointScreenProjection(selectedAgentViewport, {
      x: selectedAgent!.x,
      y: selectedAgent!.y
    });
    const safeAreaTarget = resolveViewportSafeAreaTarget(selectedAgentViewport);

    expect(baselineRightPadding).toBeGreaterThan(0);
    expect(selectedRightPadding).toBeGreaterThan(0);
    expect(selectedRightPadding).toBeCloseTo(baselineRightPadding, 4);
    expect(selectedAgent!.agentId).toBe('growth-revenue');
    expect(viewportShift).toBeGreaterThan(1);
    expect(Math.abs(selectedAgentProjection.x - safeAreaTarget.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(selectedAgentProjection.y - safeAreaTarget.y)).toBeLessThanOrEqual(0.5);
    expectViewportBoundsWithinClampBudget(selectedAgentViewport);
  });

  test('keeps selected-agent safe-area follow on overview refresh under active right clamp padding', async ({
    page
  }) => {
    test.slow();
    await installFastPollInterval(page);

    let overviewRequests = 0;
    let movedOverviewResponses = 0;
    let refreshReady = false;
    let refreshedAgentLocation: string | null = null;

    await page.route('**/office/overview', async (route) => {
      overviewRequests += 1;
      if (overviewRequests === 1 || !refreshReady) {
        await route.continue();
        return;
      }

      const response = await route.fetch();
      const overview = (await response.json()) as {
        zones: Array<{ zone_id: string }>;
        agents: Array<{ agent_id: string; current_location: string }>;
      };
      const selectedAgent = overview.agents.find((agent) => agent.agent_id === 'growth-revenue');

      if (!selectedAgent) {
        throw new Error('browser smoke fixture must expose growth-revenue in /office/overview');
      }

      refreshedAgentLocation ??=
        (selectedAgent.current_location !== 'rest-zone' &&
        overview.zones.some((zone) => zone.zone_id === 'rest-zone')
          ? 'rest-zone'
          : overview.zones.find((zone) => zone.zone_id !== selectedAgent.current_location)?.zone_id) ?? null;

      if (!refreshedAgentLocation) {
        throw new Error('browser smoke fixture must expose an alternate zone for growth-revenue');
      }

      if (selectedAgent.current_location === refreshedAgentLocation) {
        await route.fulfill({ response, json: overview });
        return;
      }

      movedOverviewResponses += 1;
      await route.fulfill({
        response,
        json: {
          ...overview,
          agents: overview.agents.map((agent) =>
            agent.agent_id === 'growth-revenue'
              ? {
                  ...agent,
                  current_location: refreshedAgentLocation!
                }
              : agent
          )
        }
      });
    });

    const landscapeShell = SHELLS.find((shell) => shell.name === 'landscape');
    expect(landscapeShell).toBeDefined();

    await page.setViewportSize(landscapeShell!.viewport);
    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const selectedAgentHeading = detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' });
    const workflowResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.status() === 200 &&
        response.url().includes('/agents/growth-revenue/workflow?limit=10&window=60m')
    );

    await detailsPanel.getByRole('button', { name: 'Inspect Growth Revenue Agent', exact: true }).click();
    await expect(selectedAgentHeading).toBeVisible();
    await workflowResponsePromise;

    const initialViewport = await waitForViewportLayoutSettle(page);
    const initialSelectedAgent = initialViewport.selectedAgent;
    expect(initialSelectedAgent).not.toBeNull();

    const initialRightPadding = initialViewport.clampPadding?.right ?? 0;
    const initialProjection = resolveWorldPointScreenProjection(initialViewport, {
      x: initialSelectedAgent!.x,
      y: initialSelectedAgent!.y
    });
    const initialSafeAreaTarget = resolveViewportSafeAreaTarget(initialViewport);

    expect(initialRightPadding).toBeGreaterThan(0);
    expect(initialSelectedAgent!.agentId).toBe('growth-revenue');
    expect(Math.abs(initialProjection.x - initialSafeAreaTarget.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(initialProjection.y - initialSafeAreaTarget.y)).toBeLessThanOrEqual(0.5);
    expectViewportBoundsWithinClampBudget(initialViewport);

    refreshReady = true;

    await page.waitForFunction(
      ({ agentId, x, y }) => {
        const selectedAgent = window.__AITOWN_VIEWPORT__?.read()?.selectedAgent;
        if (!selectedAgent || selectedAgent.agentId !== agentId) {
          return false;
        }

        return Math.abs(selectedAgent.x - x) > 0.5 || Math.abs(selectedAgent.y - y) > 0.5;
      },
      {
        agentId: initialSelectedAgent!.agentId,
        x: initialSelectedAgent!.x,
        y: initialSelectedAgent!.y
      },
      { timeout: POLL_DRIVEN_ASSERTION_TIMEOUT_MS }
    );

    const refreshedViewport = await waitForViewportLayoutSettle(page);
    const refreshedSelectedAgent = refreshedViewport.selectedAgent;
    expect(refreshedSelectedAgent).not.toBeNull();

    const refreshedProjection = resolveWorldPointScreenProjection(refreshedViewport, {
      x: refreshedSelectedAgent!.x,
      y: refreshedSelectedAgent!.y
    });
    const refreshedSafeAreaTarget = resolveViewportSafeAreaTarget(refreshedViewport);
    const worldShift = Math.hypot(
      refreshedSelectedAgent!.x - initialSelectedAgent!.x,
      refreshedSelectedAgent!.y - initialSelectedAgent!.y
    );

    expect(overviewRequests).toBeGreaterThanOrEqual(2);
    expect(movedOverviewResponses).toBeGreaterThan(0);
    expect(refreshedAgentLocation).not.toBeNull();
    expect(refreshedSelectedAgent!.agentId).toBe('growth-revenue');
    expect(worldShift).toBeGreaterThan(1);
    expect(refreshedViewport.clampPadding?.right ?? 0).toBeGreaterThan(0);
    expect(refreshedViewport.clampPadding?.right ?? 0).toBeCloseTo(initialRightPadding, 4);
    expect(Math.abs(refreshedProjection.x - refreshedSafeAreaTarget.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(refreshedProjection.y - refreshedSafeAreaTarget.y)).toBeLessThanOrEqual(0.5);
    expectViewportBoundsWithinClampBudget(refreshedViewport);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('keeps portrait selected-agent safe-area follow on overview refresh under active right clamp padding', async ({
    page
  }) => {
    test.slow();
    await installFastPollInterval(page);

    let overviewRequests = 0;
    let movedOverviewResponses = 0;
    let refreshReady = false;
    let refreshedAgentLocation: string | null = null;

    await page.route('**/office/overview', async (route) => {
      overviewRequests += 1;
      if (overviewRequests === 1 || !refreshReady) {
        await route.continue();
        return;
      }

      const response = await route.fetch();
      const overview = (await response.json()) as {
        zones: Array<{ zone_id: string }>;
        agents: Array<{ agent_id: string; current_location: string }>;
      };
      const selectedAgent = overview.agents.find((agent) => agent.agent_id === 'growth-revenue');

      if (!selectedAgent) {
        throw new Error('browser smoke fixture must expose growth-revenue in /office/overview');
      }

      refreshedAgentLocation ??=
        (selectedAgent.current_location !== 'rest-zone' &&
        overview.zones.some((zone) => zone.zone_id === 'rest-zone')
          ? 'rest-zone'
          : overview.zones.find((zone) => zone.zone_id !== selectedAgent.current_location)?.zone_id) ?? null;

      if (!refreshedAgentLocation) {
        throw new Error('browser smoke fixture must expose an alternate zone for growth-revenue');
      }

      if (selectedAgent.current_location === refreshedAgentLocation) {
        await route.fulfill({ response, json: overview });
        return;
      }

      movedOverviewResponses += 1;
      await route.fulfill({
        response,
        json: {
          ...overview,
          agents: overview.agents.map((agent) =>
            agent.agent_id === 'growth-revenue'
              ? {
                  ...agent,
                  current_location: refreshedAgentLocation!
                }
              : agent
          )
        }
      });
    });

    const portraitShell = SHELLS.find((shell) => shell.name === 'portrait');
    expect(portraitShell).toBeDefined();

    await page.setViewportSize(portraitShell!.viewport);
    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const selectedAgentHeading = detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' });
    const workflowResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.status() === 200 &&
        response.url().includes('/agents/growth-revenue/workflow?limit=10&window=60m')
    );

    await detailsPanel.getByRole('button', { name: 'Inspect Growth Revenue Agent', exact: true }).click();
    await expect(selectedAgentHeading).toBeVisible();
    await workflowResponsePromise;

    const initialViewport = await waitForViewportLayoutSettle(page);
    const initialSelectedAgent = initialViewport.selectedAgent;
    expect(initialSelectedAgent).not.toBeNull();

    const initialRightPadding = initialViewport.clampPadding?.right ?? 0;
    const initialProjection = resolveWorldPointScreenProjection(initialViewport, {
      x: initialSelectedAgent!.x,
      y: initialSelectedAgent!.y
    });
    const initialSafeAreaTarget = resolveViewportSafeAreaTarget(initialViewport);

    expect(initialRightPadding).toBeGreaterThan(0);
    expect(initialSelectedAgent!.agentId).toBe('growth-revenue');
    expect(Math.abs(initialProjection.x - initialSafeAreaTarget.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(initialProjection.y - initialSafeAreaTarget.y)).toBeLessThanOrEqual(0.5);
    expectViewportBoundsWithinClampBudget(initialViewport);

    refreshReady = true;

    await page.waitForFunction(
      ({ agentId, x, y }) => {
        const selectedAgent = window.__AITOWN_VIEWPORT__?.read()?.selectedAgent;
        if (!selectedAgent || selectedAgent.agentId !== agentId) {
          return false;
        }

        return Math.abs(selectedAgent.x - x) > 0.5 || Math.abs(selectedAgent.y - y) > 0.5;
      },
      {
        agentId: initialSelectedAgent!.agentId,
        x: initialSelectedAgent!.x,
        y: initialSelectedAgent!.y
      },
      { timeout: POLL_DRIVEN_ASSERTION_TIMEOUT_MS }
    );

    const refreshedViewport = await waitForViewportLayoutSettle(page);
    const refreshedSelectedAgent = refreshedViewport.selectedAgent;
    expect(refreshedSelectedAgent).not.toBeNull();

    const refreshedProjection = resolveWorldPointScreenProjection(refreshedViewport, {
      x: refreshedSelectedAgent!.x,
      y: refreshedSelectedAgent!.y
    });
    const refreshedSafeAreaTarget = resolveViewportSafeAreaTarget(refreshedViewport);
    const worldShift = Math.hypot(
      refreshedSelectedAgent!.x - initialSelectedAgent!.x,
      refreshedSelectedAgent!.y - initialSelectedAgent!.y
    );

    expect(overviewRequests).toBeGreaterThanOrEqual(2);
    expect(movedOverviewResponses).toBeGreaterThan(0);
    expect(refreshedAgentLocation).not.toBeNull();
    expect(refreshedSelectedAgent!.agentId).toBe('growth-revenue');
    expect(worldShift).toBeGreaterThan(1);
    expect(refreshedViewport.clampPadding?.right ?? 0).toBeGreaterThan(0);
    expect(refreshedViewport.clampPadding?.right ?? 0).toBeCloseTo(initialRightPadding, 4);
    expect(Math.abs(refreshedProjection.x - refreshedSafeAreaTarget.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(refreshedProjection.y - refreshedSafeAreaTarget.y)).toBeLessThanOrEqual(0.5);
    expectViewportBoundsWithinClampBudget(refreshedViewport);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('keeps manual-drag selected-agent override active across overview refresh under active right clamp padding', async ({
    page
  }) => {
    test.slow();
    await installFastPollInterval(page);

    let overviewRequests = 0;
    let movedOverviewResponses = 0;
    let refreshReady = false;
    let refreshedAgentLocation: string | null = null;

    await page.route('**/office/overview', async (route) => {
      overviewRequests += 1;
      if (overviewRequests === 1 || !refreshReady) {
        await route.continue();
        return;
      }

      const response = await route.fetch();
      const overview = (await response.json()) as {
        zones: Array<{ zone_id: string }>;
        agents: Array<{ agent_id: string; current_location: string }>;
      };
      const selectedAgent = overview.agents.find((agent) => agent.agent_id === 'growth-revenue');

      if (!selectedAgent) {
        throw new Error('browser smoke fixture must expose growth-revenue in /office/overview');
      }

      refreshedAgentLocation ??=
        (selectedAgent.current_location !== 'rest-zone' &&
        overview.zones.some((zone) => zone.zone_id === 'rest-zone')
          ? 'rest-zone'
          : overview.zones.find((zone) => zone.zone_id !== selectedAgent.current_location)?.zone_id) ?? null;

      if (!refreshedAgentLocation) {
        throw new Error('browser smoke fixture must expose an alternate zone for growth-revenue');
      }

      if (selectedAgent.current_location === refreshedAgentLocation) {
        await route.fulfill({ response, json: overview });
        return;
      }

      movedOverviewResponses += 1;
      await route.fulfill({
        response,
        json: {
          ...overview,
          agents: overview.agents.map((agent) =>
            agent.agent_id === 'growth-revenue'
              ? {
                  ...agent,
                  current_location: refreshedAgentLocation!
                }
              : agent
          )
        }
      });
    });

    const landscapeShell = SHELLS.find((shell) => shell.name === 'landscape');
    expect(landscapeShell).toBeDefined();

    await page.setViewportSize(landscapeShell!.viewport);
    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    await page.getByRole('button', { name: 'Open Hub' }).click();

    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const selectedAgentHeading = detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' });
    const workflowResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.status() === 200 &&
        response.url().includes('/agents/growth-revenue/workflow?limit=10&window=60m')
    );

    await detailsPanel.getByRole('button', { name: 'Inspect Growth Revenue Agent', exact: true }).click();
    await expect(selectedAgentHeading).toBeVisible();
    await workflowResponsePromise;

    const initialViewport = await waitForViewportLayoutSettle(page);
    const initialSelectedAgent = initialViewport.selectedAgent;
    expect(initialSelectedAgent).not.toBeNull();

    const initialRightPadding = initialViewport.clampPadding?.right ?? 0;
    const initialProjection = resolveWorldPointScreenProjection(initialViewport, {
      x: initialSelectedAgent!.x,
      y: initialSelectedAgent!.y
    });
    const initialSafeAreaTarget = resolveViewportSafeAreaTarget(initialViewport);

    expect(initialRightPadding).toBeGreaterThan(0);
    expect(initialSelectedAgent!.agentId).toBe('growth-revenue');
    expect(Math.abs(initialProjection.x - initialSafeAreaTarget.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(initialProjection.y - initialSafeAreaTarget.y)).toBeLessThanOrEqual(0.5);
    expectViewportBoundsWithinClampBudget(initialViewport);

    const initialScale = initialViewport.scale ?? 1;
    const initialRightAllowance = initialRightPadding / initialScale;
    const dragToRightEdge = initialViewport.right < initialViewport.worldWidth + initialRightAllowance - 1;
    const manuallyDraggedViewport = dragToRightEdge
      ? await dragViewportToEdge(page, 'right', { driver: 'synthetic-host-pointer' })
      : await dragViewportToEdge(page, 'top-left', {
          horizontalOnly: true,
          driver: 'synthetic-host-pointer'
        });
    const manualViewportShift = Math.hypot(
      manuallyDraggedViewport.x - initialViewport.x,
      manuallyDraggedViewport.y - initialViewport.y
    );

    await expect(selectedAgentHeading).toBeVisible();

    expect(manuallyDraggedViewport.selectedAgent?.agentId).toBe('growth-revenue');
    expect(manualViewportShift).toBeGreaterThan(1);
    expect(manuallyDraggedViewport.clampPadding?.right ?? 0).toBeCloseTo(initialRightPadding, 4);
    if (dragToRightEdge) {
      expectViewportAtRightClampEdge(manuallyDraggedViewport, initialScale, initialViewport.top);
    } else {
      expectViewportAtLeftClampEdge(manuallyDraggedViewport, initialScale, initialViewport.top);
    }

    refreshReady = true;

    await page.waitForFunction(
      ({ agentId, x, y }) => {
        const selectedAgent = window.__AITOWN_VIEWPORT__?.read()?.selectedAgent;
        if (!selectedAgent || selectedAgent.agentId !== agentId) {
          return false;
        }

        return Math.abs(selectedAgent.x - x) > 0.5 || Math.abs(selectedAgent.y - y) > 0.5;
      },
      {
        agentId: initialSelectedAgent!.agentId,
        x: initialSelectedAgent!.x,
        y: initialSelectedAgent!.y
      },
      { timeout: POLL_DRIVEN_ASSERTION_TIMEOUT_MS }
    );

    const refreshedViewport = await waitForViewportLayoutSettle(page);
    const refreshedSelectedAgent = refreshedViewport.selectedAgent;
    expect(refreshedSelectedAgent).not.toBeNull();

    const worldShift = Math.hypot(
      refreshedSelectedAgent!.x - initialSelectedAgent!.x,
      refreshedSelectedAgent!.y - initialSelectedAgent!.y
    );
    const refreshedViewportDrift = Math.hypot(
      refreshedViewport.x - manuallyDraggedViewport.x,
      refreshedViewport.y - manuallyDraggedViewport.y
    );

    expect(overviewRequests).toBeGreaterThanOrEqual(2);
    expect(movedOverviewResponses).toBeGreaterThan(0);
    expect(refreshedAgentLocation).not.toBeNull();
    expect(refreshedSelectedAgent!.agentId).toBe('growth-revenue');
    expect(worldShift).toBeGreaterThan(1);
    expect(refreshedViewport.clampPadding?.right ?? 0).toBeGreaterThan(0);
    expect(refreshedViewport.clampPadding?.right ?? 0).toBeCloseTo(initialRightPadding, 4);
    expect(refreshedViewportDrift).toBeLessThanOrEqual(1);
    if (dragToRightEdge) {
      expectViewportAtRightClampEdge(refreshedViewport, initialScale, manuallyDraggedViewport.top);
    } else {
      expectViewportAtLeftClampEdge(refreshedViewport, initialScale, manuallyDraggedViewport.top);
    }
    expectViewportBoundsWithinClampBudget(refreshedViewport);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('re-centers the portrait viewport under active right clamp padding after inspecting a selected agent through the Hub', async ({
    page
  }) => {
    const portraitShell = SHELLS.find((shell) => shell.name === 'portrait');
    expect(portraitShell).toBeDefined();

    await page.setViewportSize(portraitShell!.viewport);
    await page.goto('/');
    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    await page.getByRole('button', { name: 'Open Hub' }).click();

    const baselineViewport = await waitForViewportLayoutSettle(page);
    const baselineRightPadding = baselineViewport.clampPadding?.right ?? 0;
    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const workflowResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.status() === 200 &&
        response.url().includes('/agents/growth-revenue/workflow?limit=10&window=60m')
    );

    await detailsPanel.getByRole('button', { name: 'Inspect Growth Revenue Agent', exact: true }).click();
    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await workflowResponsePromise;

    const selectedAgentViewport = await waitForViewportLayoutSettle(page);
    const selectedRightPadding = selectedAgentViewport.clampPadding?.right ?? 0;
    const viewportShift = Math.hypot(
      selectedAgentViewport.x - baselineViewport.x,
      selectedAgentViewport.y - baselineViewport.y
    );
    const selectedAgent = selectedAgentViewport.selectedAgent;

    expect(selectedAgent).not.toBeNull();

    const selectedAgentProjection = resolveWorldPointScreenProjection(selectedAgentViewport, {
      x: selectedAgent!.x,
      y: selectedAgent!.y
    });
    const safeAreaTarget = resolveViewportSafeAreaTarget(selectedAgentViewport);

    expect(baselineRightPadding).toBeGreaterThan(0);
    expect(selectedRightPadding).toBeGreaterThan(0);
    expect(selectedRightPadding).toBeCloseTo(baselineRightPadding, 4);
    expect(selectedAgent!.agentId).toBe('growth-revenue');
    expect(viewportShift).toBeGreaterThan(1);
    expect(Math.abs(selectedAgentProjection.x - safeAreaTarget.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(selectedAgentProjection.y - safeAreaTarget.y)).toBeLessThanOrEqual(0.5);
    expectViewportBoundsWithinClampBudget(selectedAgentViewport);
  });

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
