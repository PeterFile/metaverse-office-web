import { expect, test, type Locator, type Page } from '@playwright/test';

import { findStableSample, requireStableSample } from '../scripts/stability';
import { resolveViewportEdgeDragDelta } from '../scripts/viewport-reachability';

type RectSnapshot = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

const RAW_OPERATOR_REF_PATTERNS = [
  { label: 'local path', source: String.raw`(?:^|[\s(["'])/(?:tmp|Users|Volumes|workspace|private|var)(?:/[^\s<>"')]+)+` },
  { label: 'runtime scheme', source: String.raw`\b(?:tmux|hermes|session|profile)://\S+` },
  { label: 'tmux session ref', source: String.raw`\b\d+-web3-[a-z0-9-]+(?:/\d+(?:\.\d+)?)?\b` },
  { label: 'profile ref', source: String.raw`\bprofile-[a-z0-9][a-z0-9-]*\b` },
  { label: 'token ref', source: String.raw`\b(?:session-token|token[_:-]?[a-z0-9]{6,}|sk-[a-z0-9]{10,}|xox[abprs]-[a-z0-9-]+)\b` },
  { label: 'webhook ref', source: String.raw`\b(?:webhook[_:-]?[a-z0-9-]*|hooks\.slack\.com|discord(?:app)?\.com/api/webhooks)\b` },
  { label: 'control-plane ref', source: String.raw`\bcontrol-plane(?:[:/][^\s]+)?\b` }
] as const;

async function readRect(locator: Locator): Promise<RectSnapshot> {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height
    };
  });
}

function resolveIntersectionArea(a: RectSnapshot, b: RectSnapshot) {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}

function resolvePrimaryDragLane(rect: RectSnapshot): RectSnapshot {
  return {
    left: rect.left + rect.width * 0.25,
    right: rect.left + rect.width * 0.60,
    top: rect.top + rect.height * 0.25,
    bottom: rect.top + rect.height * 0.75,
    width: rect.width * 0.35,
    height: rect.height * 0.50
  };
}

function resolveUpperWorldDragLane(rect: RectSnapshot): RectSnapshot {
  return {
    left: rect.left + rect.width * 0.25,
    right: rect.left + rect.width * 0.60,
    top: rect.top + rect.height * 0.12,
    bottom: rect.top + rect.height * 0.20,
    width: rect.width * 0.35,
    height: rect.height * 0.08
  };
}

async function readViewportState(page: Page) {
  return page.evaluate(() => window.__AITOWN_VIEWPORT__?.read() ?? null);
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

function resolveWorldPointScreenProjection(
  state: NonNullable<Awaited<ReturnType<typeof readViewportState>>>,
  point: { x: number; y: number }
) {
  return {
    x: ((point.x - state.left) / Math.max(state.right - state.left, Number.EPSILON)) * state.screenWidth,
    y: ((point.y - state.top) / Math.max(state.bottom - state.top, Number.EPSILON)) * state.screenHeight
  };
}

async function expectLocatorWithinScrollport(locator: Locator, scrollport: Locator, label: string) {
  const [locatorRect, scrollportRect] = await Promise.all([readRect(locator), readRect(scrollport)]);
  const epsilon = 1;

  expect(locatorRect.top, `${label} should start inside the Hub first fold`).toBeGreaterThanOrEqual(
    scrollportRect.top - epsilon
  );
  expect(locatorRect.bottom, `${label} should fit inside the Hub first fold`).toBeLessThanOrEqual(
    scrollportRect.bottom + epsilon
  );
}

async function expectLocatorTopInsideScrollport(locator: Locator, scrollport: Locator, label: string) {
  await expect
    .poll(async () => {
      const [locatorRect, scrollportRect] = await Promise.all([readRect(locator), readRect(scrollport)]);
      const epsilon = 1;

      return locatorRect.top >= scrollportRect.top - epsilon && locatorRect.top <= scrollportRect.bottom + epsilon;
    }, `${label} top should be visible in the Hub scrollport`)
    .toBe(true);
}

async function expectLocatorInsideRect(locator: Locator, container: Locator, label: string) {
  const [locatorRect, containerRect] = await Promise.all([readRect(locator), readRect(container)]);
  const epsilon = 1;

  expect(locatorRect.left, `${label} should stay inside the Hub sheet`).toBeGreaterThanOrEqual(
    containerRect.left - epsilon
  );
  expect(locatorRect.right, `${label} should stay inside the Hub sheet`).toBeLessThanOrEqual(
    containerRect.right + epsilon
  );
  expect(locatorRect.top, `${label} should stay inside the Hub sheet`).toBeGreaterThanOrEqual(
    containerRect.top - epsilon
  );
  expect(locatorRect.bottom, `${label} should stay inside the Hub sheet`).toBeLessThanOrEqual(
    containerRect.bottom + epsilon
  );
}

async function expectLocatorInsideViewport(page: Page, locator: Locator, label: string) {
  const rect = await readRect(locator);
  const viewport = page.viewportSize();
  const epsilon = 1;

  expect(viewport, `${label} requires an explicit viewport`).not.toBeNull();
  expect(rect.left, `${label} should not overflow viewport left`).toBeGreaterThanOrEqual(-epsilon);
  expect(rect.right, `${label} should not overflow viewport right`).toBeLessThanOrEqual(viewport!.width + epsilon);
  expect(rect.top, `${label} should not overflow viewport top`).toBeGreaterThanOrEqual(-epsilon);
  expect(rect.bottom, `${label} should not overflow viewport bottom`).toBeLessThanOrEqual(viewport!.height + epsilon);
}

async function expectPrimaryDragLaneMostlyReachable(
  page: Page,
  worldHost: Locator,
  label: string,
  maxBlockedRatio = 0.25
) {
  const worldRect = await readRect(worldHost);
  const dragLane = resolvePrimaryDragLane(worldRect);
  const hitStats = await page.evaluate((lane) => {
    const columns = 7;
    const rows = 5;
    const blockedSamples: Array<{
      x: number;
      y: number;
      tagName: string | null;
      className: string | null;
    }> = [];

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = lane.left + (lane.width * (column + 0.5)) / columns;
        const y = lane.top + (lane.height * (row + 0.5)) / rows;
        const target = document.elementFromPoint(x, y);

        if (!target?.closest('.aitown-world__host')) {
          blockedSamples.push({
            x,
            y,
            tagName: target?.tagName ?? null,
            className: target instanceof HTMLElement ? target.className : null
          });
        }
      }
    }

    return {
      blockedRatio: blockedSamples.length / (columns * rows),
      blockedSamples: blockedSamples.slice(0, 4)
    };
  }, dragLane);

  expect(
    hitStats.blockedRatio,
    `${label} should leave the primary world drag lane reachable: ${JSON.stringify(hitStats.blockedSamples)}`
  ).toBeLessThanOrEqual(maxBlockedRatio);
}

async function expectOverlayCombinationViewportGuard(
  page: Page,
  worldHost: Locator,
  overlays: Array<{ locator: Locator; label: string }>,
  label: string
) {
  for (const overlay of overlays) {
    await expect(overlay.locator, `${overlay.label} should be visible`).toBeVisible();
    await expectLocatorInsideViewport(page, overlay.locator, overlay.label);
  }

  await expectPrimaryDragLaneMostlyReachable(page, worldHost, label);
}

async function expectVisibleTextHasNoRawOperatorRefs(locator: Locator, label: string) {
  const violations = await locator.evaluate((element, patternDefs) => {
    const patterns = patternDefs.map((pattern) => ({
      label: pattern.label,
      regex: new RegExp(pattern.source, 'i')
    }));
    const visibleTextNodes: string[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);

    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.replace(/\s+/g, ' ').trim();
      const parent = node.parentElement;

      if (!text || !parent) {
        continue;
      }

      const style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden') {
        continue;
      }

      const range = document.createRange();
      range.selectNodeContents(node);
      const hasVisibleBox = Array.from(range.getClientRects()).some((rect) => rect.width > 0 && rect.height > 0);
      range.detach();

      if (hasVisibleBox) {
        visibleTextNodes.push(text);
      }
    }

    return visibleTextNodes.flatMap((text) =>
      patterns
        .filter((pattern) => pattern.regex.test(text))
        .map((pattern) => ({
          pattern: pattern.label,
          text: text.slice(0, 160)
        }))
    );
  }, RAW_OPERATOR_REF_PATTERNS);

  expect(violations, `${label} visible text should not expose raw operator refs`).toEqual([]);
}

async function expectCanvasDragMovesViewport(page: Page) {
  const canvas = page.locator('.aitown-world__host canvas');
  await expect(canvas).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

  const before = await readViewportState(page);
  expect(before).not.toBeNull();

  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();

  const startX = canvasBox!.x + canvasBox!.width * 0.5;
  const startY = canvasBox!.y + canvasBox!.height * 0.55;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 140, startY, { steps: 12 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const after = await readViewportState(page);
      return after && before ? Math.abs(after.x - before.x) : 0;
    })
    .toBeGreaterThan(40);
}

async function dragViewportFromPrimaryLane(page: Page, deltaX: number) {
  const worldHost = page.locator('.aitown-world__host');
  const worldRect = await readRect(worldHost);
  const dragLane = resolvePrimaryDragLane(worldRect);
  const startX = dragLane.left + dragLane.width * 0.5;
  const startY = dragLane.top + dragLane.height * 0.5;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY, { steps: 16 });
  await page.mouse.up();
}

function expectViewportWithinHorizontalWorldBounds(
  state: NonNullable<Awaited<ReturnType<typeof readViewportState>>>,
  label: string
) {
  const scale = Math.max(state.scale ?? 1, 0.0001);
  const rightAllowance = (state.clampPadding?.right ?? 0) / scale;

  expect(state.left, `${label} should not expose a black left gutter`).toBeGreaterThanOrEqual(-0.5);
  expect(state.right, `${label} should stay covered by the world scene`).toBeLessThanOrEqual(
    state.worldWidth + rightAllowance + 0.5
  );
}

function expectViewportAtRightHorizontalBoundary(
  state: NonNullable<Awaited<ReturnType<typeof readViewportState>>>,
  label: string
) {
  const scale = Math.max(state.scale ?? 1, 0.0001);
  const rightAllowance = (state.clampPadding?.right ?? 0) / scale;

  expectViewportWithinHorizontalWorldBounds(state, label);
  expect(state.right, `${label} should accept the complete right boundary`).toBeGreaterThanOrEqual(
    state.worldWidth + rightAllowance - 0.5
  );
}

function expectWorldRightEdgeVisible(
  state: NonNullable<Awaited<ReturnType<typeof readViewportState>>>,
  label: string
) {
  const projection = resolveWorldPointScreenProjection(state, { x: state.worldWidth, y: state.top });
  const rightChromeInset = state.clampPadding?.right ?? 0;

  expect(projection.x, `${label} should show the world right edge before right-side chrome`).toBeGreaterThanOrEqual(
    state.screenWidth - rightChromeInset - 1
  );
  expect(projection.x, `${label} should keep the world right edge inside the viewport`).toBeLessThanOrEqual(
    state.screenWidth + 1
  );
}

function expectViewportAtLeftHorizontalBoundary(
  state: NonNullable<Awaited<ReturnType<typeof readViewportState>>>,
  label: string
) {
  expectViewportWithinHorizontalWorldBounds(state, label);
  expect(state.left, `${label} should accept the left boundary without a black edge`).toBeLessThanOrEqual(0.5);
}

function expectWorldLeftEdgeVisible(
  state: NonNullable<Awaited<ReturnType<typeof readViewportState>>>,
  label: string
) {
  const projection = resolveWorldPointScreenProjection(state, { x: 0, y: state.top });

  expect(projection.x, `${label} should keep the world left edge inside the viewport`).toBeGreaterThanOrEqual(-1);
  expect(projection.x, `${label} should not hide the world left edge offscreen`).toBeLessThanOrEqual(1);
}

test.describe('operator shell layout visual smoke', () => {
  test('keeps default viewport pan-first horizontal drag inside left and right boundaries', async ({ page }) => {
    await page.goto('/');

    const worldHost = page.locator('.aitown-world__host');
    const canvas = worldHost.locator('canvas');
    await expect(worldHost).toBeVisible();
    await expect(canvas).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));
    await expect(page.getByRole('dialog', { name: 'Hub' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Selected agent inspect peek' })).toHaveCount(0);
    await expectPrimaryDragLaneMostlyReachable(page, worldHost, 'default Hub-closed world');
    await expectVisibleTextHasNoRawOperatorRefs(page.locator('body'), 'default Hub-closed world');

    const initial = await waitForViewportSettle(page);
    expectViewportWithinHorizontalWorldBounds(initial, 'default viewport');
    expect(
      Math.abs(resolveViewportEdgeDragDelta(initial, 'top-left').deltaX),
      'default viewport should have immediate left pan budget'
    ).toBeGreaterThan(40);

    const worldRect = await readRect(worldHost);
    const dragLane = resolvePrimaryDragLane(worldRect);
    const dragStart = {
      x: dragLane.left + dragLane.width * 0.5,
      y: dragLane.top + dragLane.height * 0.5
    };
    const hitTarget = await page.evaluate(({ x, y }) => {
      const target = document.elementFromPoint(x, y);

      return {
        insideWorld: Boolean(target?.closest('.aitown-world__host')),
        insideHub: Boolean(target?.closest('#aitown-hub')),
        insideSignals: Boolean(target?.closest('[aria-label="Office HUD signals"]')),
        insidePeek: Boolean(target?.closest('[aria-label="Selected agent inspect peek"]')),
        insideButton: Boolean(target?.closest('button')),
        tagName: target?.tagName ?? null,
        className: target instanceof HTMLElement ? target.className : null
      };
    }, dragStart);
    expect(hitTarget.insideWorld, `primary drag lane should hit the world: ${JSON.stringify(hitTarget)}`).toBe(true);
    expect(hitTarget.insideHub, `default drag lane should not start inside Hub: ${JSON.stringify(hitTarget)}`).toBe(
      false
    );
    expect(hitTarget.insideSignals, `HUD signals should not block default drag lane: ${JSON.stringify(hitTarget)}`).toBe(
      false
    );
    expect(hitTarget.insidePeek, `inspect peek should not block default drag lane: ${JSON.stringify(hitTarget)}`).toBe(
      false
    );
    expect(hitTarget.insideButton, `primary drag lane should not hit chrome controls: ${JSON.stringify(hitTarget)}`).toBe(
      false
    );

    const rightDrag = resolveViewportEdgeDragDelta(initial, 'right');
    expect(Math.abs(rightDrag.deltaX), 'default viewport should have immediate horizontal pan budget').toBeGreaterThan(
      40
    );
    await dragViewportFromPrimaryLane(page, rightDrag.deltaX);

    const rightBoundary = await waitForViewportSettle(page);
    expectViewportAtRightHorizontalBoundary(rightBoundary, 'right-dragged default viewport');
    expectWorldRightEdgeVisible(rightBoundary, 'right-dragged default viewport');
    expect(Math.abs(rightBoundary.top - initial.top), 'horizontal drag should keep the vertical lane stable').toBeLessThan(
      8
    );
    expect(rightBoundary.scale, 'pan-first drag must not zoom the viewport').toBeCloseTo(initial.scale ?? 1, 3);

    const leftDrag = resolveViewportEdgeDragDelta(rightBoundary, 'top-left');
    expect(Math.abs(leftDrag.deltaX), 'right boundary should allow a return drag to the left boundary').toBeGreaterThan(
      40
    );
    await dragViewportFromPrimaryLane(page, leftDrag.deltaX);

    const leftBoundary = await waitForViewportSettle(page);
    expectViewportAtLeftHorizontalBoundary(leftBoundary, 'left-dragged default viewport');
    expectWorldLeftEdgeVisible(leftBoundary, 'left-dragged default viewport');
    expect(Math.abs(leftBoundary.top - initial.top), 'return drag should stay horizontal').toBeLessThan(8);
    expect(leftBoundary.scale, 'return pan must not zoom the viewport').toBeCloseTo(initial.scale ?? 1, 3);
  });

  test('centers explicit agent locate requests on the viewport midpoint despite right-side chrome', async ({ page }) => {
    // Keep the explicit locate target within pan bounds; at 1280x720 the
    // Protocol Engineering desk sits near the bottom edge, so world clamp makes
    // exact Y centering impossible and the smoke stops testing direct focus.
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto('/');

    const worldHost = page.locator('.aitown-world__host');
    await expect(worldHost).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    await page
      .getByRole('navigation', { name: 'Agent roster' })
      .getByRole('button', { name: 'Select and locate Protocol Engineering Agent' })
      .click();

    await expect
      .poll(async () => (await readViewportState(page))?.selectedAgent?.agentId ?? null)
      .toBe('protocol-engineering');

    const state = await readViewportState(page);
    expect(state).not.toBeNull();
    expect(state!.selectedAgent).not.toBeNull();
    expect(state!.clampPadding.right).toBeGreaterThan(0);

    const projection = resolveWorldPointScreenProjection(state!, {
      x: state!.selectedAgent!.x,
      y: state!.selectedAgent!.y
    });
    const biasedSafeLaneX = state!.screenWidth / 2 - state!.clampPadding.right / 2;

    expect(
      Math.abs(projection.x - state!.screenWidth / 2),
      'explicit agent focus should use screen X center'
    ).toBeLessThanOrEqual(4);
    expect(
      Math.abs(projection.y - state!.screenHeight / 2),
      'explicit agent focus should use screen Y center'
    ).toBeLessThanOrEqual(4);
    expect(
      Math.abs(projection.x - biasedSafeLaneX),
      'explicit agent focus should not reuse the right-safe-lane bias'
    ).toBeGreaterThan(20);
  });

  test('@journey @evidence-live keeps compact HUD signals disclosure from blocking non-chip world drag', async ({
    page
  }) => {
    const evidenceCoverage = {
      evidence_ref_count: 1,
      covered_agent_count: 1,
      low_confidence_agent_ids: ['growth-revenue'],
      source_kind_buckets: {
        workspace_file: 1,
        workspace_root: 0,
        tmux_observation: 0
      },
      agent_items: [
        {
          agent_id: 'growth-revenue',
          evidence_ref_count: 3,
          evidence_refs: [
            '/tmp/launch-note.md',
            'tmux://6-web3-growth-revenue/2.0',
            '/tmp/growth-revenue'
          ],
          source_kinds: ['tmux_observation', 'workspace_file', 'workspace_root'],
          latest_evidence_at: '2026-03-16T08:58:40.000Z',
          confidence_level: 'medium'
        }
      ]
    };
    const sourceHealth = {
      collected_at: '2026-03-16T09:01:00.000Z',
      actor_id: 'team-lead',
      summary: {
        agent_count: 1,
        source_kind_buckets: {
          workspace_root: { observed: 0, degraded: 0, missing: 0, error: 0 },
          workspace_files: { observed: 0, degraded: 1, missing: 0, error: 0 },
          tmux_session: { observed: 1, degraded: 0, missing: 0, error: 0 },
          hermes_profile: { observed: 0, degraded: 0, missing: 1, error: 0 },
          hermes_session: { observed: 0, degraded: 1, missing: 0, error: 0 }
        },
        status_buckets: { observed: 1, degraded: 2, missing: 1, error: 0 }
      },
      agent_items: [
        {
          agent_id: 'app-engineering',
          workspace_root: '/tmp/app-engineering',
          session_ref: '5-web3-app-engineering',
          source_health: {
            workspace_files: {
              status: 'degraded',
              expected_files: ['inbox.md', 'outbox.md', 'todo.md'],
              observed_count: 1,
              missing_count: 2,
              error_count: 0,
              last_observed_at: '2026-03-16T08:58:30.000Z',
              degraded_reasons: ['missing workspace files: inbox.md, todo.md']
            },
            tmux_session: {
              status: 'observed',
              expected_session_ref: '5-web3-app-engineering',
              observed_count: 1,
              last_observed_at: '2026-03-16T08:58:32.000Z',
              degraded_reasons: []
            },
            hermes_profile: {
              status: 'missing',
              profile_id: 'profile-app-engineering',
              evidence_ref: 'hermes://profile/profile-app-engineering',
              last_observed_at: null,
              degraded_reasons: ['Hermes profile missing']
            },
            hermes_session: {
              status: 'degraded',
              expected_session_ref: '5-web3-app-engineering',
              evidence_ref: 'hermes://session/5-web3-app-engineering',
              last_observed_at: '2026-03-16T08:58:35.000Z',
              degraded_reasons: ['Hermes session stale']
            }
          },
          evidence_ref_count: 3,
          evidence_refs: [
            '/tmp/launch-note.md',
            'hermes://profile/profile-app-engineering',
            'hermes://session/5-web3-app-engineering'
          ],
          latest_evidence_at: '2026-03-16T08:58:40.000Z'
        }
      ],
      runtime_source_evidence: { unmapped_tmux_sessions: [] }
    };
    const runtimeSourceGaps = {
      items: [
        {
          observed_at: '2026-03-16T08:58:30.000Z',
          collected_at: '2026-03-16T09:01:00.000Z',
          agent_id: 'app-engineering',
          source_kind: 'workspace_file',
          evidence_role: 'agent_output',
          source_status: 'degraded',
          output_candidate: false,
          collector_snapshot_id: 'collector-snapshot:2026-03-16T09:01:00.000Z',
          correlation_id: 'collector-snapshot:2026-03-16T09:01:00.000Z',
          degraded_reasons: ['workspace file degraded'],
          unmapped: false
        },
        {
          observed_at: null,
          collected_at: '2026-03-16T09:01:00.000Z',
          agent_id: 'app-engineering',
          source_kind: 'hermes_profile',
          evidence_role: 'runtime_presence',
          source_status: 'missing',
          output_candidate: false,
          collector_snapshot_id: 'collector-snapshot:2026-03-16T09:01:00.000Z',
          correlation_id: 'collector-snapshot:2026-03-16T09:01:00.000Z',
          degraded_reasons: ['Hermes profile missing'],
          unmapped: false
        },
        {
          observed_at: '2026-03-16T08:58:35.000Z',
          collected_at: '2026-03-16T09:01:00.000Z',
          agent_id: 'app-engineering',
          source_kind: 'hermes_session',
          evidence_role: 'runtime_presence',
          source_status: 'degraded',
          output_candidate: false,
          collector_snapshot_id: 'collector-snapshot:2026-03-16T09:01:00.000Z',
          correlation_id: 'collector-snapshot:2026-03-16T09:01:00.000Z',
          degraded_reasons: ['Hermes session degraded'],
          unmapped: false
        }
      ]
    };
    const runtimeSourceGapsSummary = {
      total_count: 3,
      returned_limit: 3,
      mapped_count: 3,
      unmapped_count: 0,
      output_candidate_buckets: { true: 0, false: 3 },
      source_kind_buckets: {
        workspace_file: 1,
        hermes_profile: 1,
        hermes_session: 1
      },
      evidence_role_buckets: { agent_output: 1, runtime_presence: 2 },
      source_status_buckets: { degraded: 2, missing: 1 },
      collector_snapshot_id_buckets: {
        'collector-snapshot:2026-03-16T09:01:00.000Z': 3
      }
    };
    const collectorSnapshotSummary = {
      has_snapshot: true,
      collected_at: '2026-03-16T09:01:00.000Z',
      agent_count: 1,
      heartbeat_count: 1,
      tmux_observed_count: 1,
      workspace_observed_count: 1,
      reboot_recommended_count: 0,
      evidence_ref_count: 1,
      covered_agent_count: 1,
      low_confidence_agent_count: 1,
      source_kind_buckets: {
        workspace_file: 1,
        workspace_root: 0,
        tmux_observation: 0,
        hermes_profile: 0,
        hermes_session: 0,
        task_evidence: 0
      },
      source_health_buckets: {
        source_kind_buckets: sourceHealth.summary.source_kind_buckets,
        status_buckets: sourceHealth.summary.status_buckets
      },
      runtime_source_evidence: {
        unmapped_tmux_session_count: 0,
        unmapped_hermes_source_count: 0,
        unmapped_task_evidence_count: 0,
        latest_observed_at: '2026-03-16T08:58:40.000Z'
      }
    };

    await page.route('**/collectors/controller-snapshot/evidence-coverage', async (route) => {
      await route.fulfill({ json: { item: evidenceCoverage } });
    });
    await page.route('**/collectors/controller-snapshot/summary', async (route) => {
      await route.fulfill({ json: { item: collectorSnapshotSummary } });
    });
    await page.route('**/runtime/source-gaps?*', async (route) => {
      await route.fulfill({ json: runtimeSourceGaps });
    });
    await page.route('**/runtime/source-gaps/summary?*', async (route) => {
      await route.fulfill({ json: { item: runtimeSourceGapsSummary } });
    });
    await page.route('**/collectors/controller-snapshot/source-health**', async (route) => {
      await route.fulfill({ json: { item: sourceHealth } });
    });

    await page.route('**/collectors/controller-snapshot', async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      const sourceHealthByAgentId = new Map(
        sourceHealth.agent_items.map((item) => [item.agent_id, item] as const)
      );

      await route.fulfill({
        response,
        json: {
          item: {
            ...payload.item,
            evidence_coverage: evidenceCoverage,
            items: payload.item.items.map((item: { agent_id: string }) => {
              const sourceHealthItem = sourceHealthByAgentId.get(item.agent_id);
              return sourceHealthItem
                ? {
                    ...item,
                    source_health: sourceHealthItem.source_health,
                    evidence_ref_count: sourceHealthItem.evidence_ref_count,
                    evidence_refs: sourceHealthItem.evidence_refs,
                    latest_evidence_at: sourceHealthItem.latest_evidence_at
                  }
                : item;
            })
          }
        }
      });
    });

    await page.goto('/');

    const worldHost = page.locator('.aitown-world__host');
    const signals = page.getByRole('region', { name: 'Office HUD signals' });
    const signalsSummary = signals.locator('summary');
    const evidenceFocus = page.getByRole('region', { name: 'Evidence coverage focus' });
    const sourceGapFocus = page.getByRole('region', { name: 'Source gap focus' });
    const collectorSnapshotChip = page.getByRole('button', {
      name: 'Open collector snapshot supervision summary: Snapshot available'
    });
    const evidenceFocusHead = evidenceFocus.locator('.aitown-panel__evidence-focus__head');
    const evidenceFocusChip = evidenceFocus.getByRole('button', {
      name: 'Inspect evidence coverage focus agent Growth Revenue Agent'
    });
    const sourceGapChip = sourceGapFocus.getByRole('button', {
      name: 'Open source gap supervision for App Engineering Agent workspace files degraded'
    });
    const hermesProfileGapChip = sourceGapFocus.getByRole('button', {
      name: 'Open source gap supervision for App Engineering Agent hermes profile missing'
    });
    const hermesSessionGapChip = sourceGapFocus.getByRole('button', {
      name: 'Open source gap supervision for App Engineering Agent hermes session degraded'
    });
    await expect(worldHost).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));
    await expect(signals).toBeVisible();
    await expect(collectorSnapshotChip).toBeVisible();
    await expect(collectorSnapshotChip).toContainText('1 agents · 1 heartbeats');
    await expect(collectorSnapshotChip).toContainText('1 observed · 3 source gaps');
    await expect(collectorSnapshotChip).toContainText('Collected · 2026-03-16T09:01:00.000Z');
    await expect(collectorSnapshotChip).not.toContainText('/tmp/app-engineering');
    await expect(collectorSnapshotChip).not.toContainText('5-web3-app-engineering');
    await expect(collectorSnapshotChip).not.toContainText('hermes://');
    await expect(signalsSummary.getByText('Signals', { exact: true })).toBeVisible();
    await expect(signalsSummary.locator('.aitown-panel__topline-copy')).toContainText('Snapshot · Snapshot available');
    await expect(signalsSummary.locator('.aitown-panel__topline-copy')).toContainText('Evidence · 6');
    await expect(signalsSummary.getByText(/Source gaps · 3/)).toBeVisible();
    await expect(evidenceFocus).toBeHidden();
    await expect(sourceGapFocus).toBeHidden();
    const roster = page.getByRole('navigation', { name: 'Agent roster' });
    const appEngineeringButton = roster.getByRole('button', { name: 'Select and locate App Engineering Agent' });
    const appEngineeringPortrait = roster.locator(
      '.aitown-agent-roster__portrait img[src="/assets/generated/sprites/agent-normal/idle-1.png"]'
    );
    await expect(roster).toBeVisible();
    await expect(appEngineeringButton).toBeVisible();
    await expect(appEngineeringPortrait).toBeVisible();
    await expect(roster.locator('.aitown-agent-roster__portrait').first()).not.toContainText('AE');
    const [rosterButtonRect, rosterPortraitRect] = await Promise.all([
      readRect(appEngineeringButton),
      readRect(roster.locator('.aitown-agent-roster__portrait').first())
    ]);
    expect(rosterButtonRect.width, 'roster should use compact RimWorld portrait cards, not wide info buttons').toBeLessThanOrEqual(60);
    expect(rosterPortraitRect.height, 'portrait should be the dominant roster card element').toBeGreaterThanOrEqual(40);
    await expect(page.getByRole('dialog', { name: 'Hub' })).toHaveCount(0);

    await signalsSummary.click();
    await expect(evidenceFocus).toBeVisible();
    await expect(evidenceFocus.getByText('Evidence', { exact: true })).toBeVisible();
    await expect(evidenceFocus.getByText('6 coverage gaps', { exact: true })).toBeVisible();
    await expect(evidenceFocus.getByText('+3 more', { exact: true })).toBeVisible();
    await expect(evidenceFocus.getByRole('button', { name: '+3 more' })).toHaveCount(0);
    await expect(evidenceFocus.getByText('Low-confidence or uncovered evidence', { exact: true })).toBeVisible();
    await expect(evidenceFocusChip).toBeVisible();
    await expect(evidenceFocusChip).toContainText('Low-confidence evidence');
    await expect(evidenceFocusChip).toContainText('3 refs · Runtime evidence + Local evidence');
    await expect(evidenceFocusChip).toContainText('Latest evidence · 2026-03-16T08:58:40.000Z');
    await expect(evidenceFocusChip).not.toContainText('/tmp/launch-note.md');
    await expect(evidenceFocusChip).not.toContainText('/tmp/growth-revenue');
    await expect(evidenceFocusChip).not.toContainText('tmux://6-web3-growth-revenue/2.0');
    await expect(sourceGapFocus).toBeVisible();
    await expect(sourceGapFocus.getByText('Source gaps', { exact: true })).toBeVisible();
    await expect(sourceGapFocus.getByText('3 provenance gaps', { exact: true })).toBeVisible();
    await expect(sourceGapChip).toBeVisible();
    await expect(sourceGapChip).toContainText('Workspace files · degraded');
    await expect(sourceGapChip).toContainText('agent output · mapped source');
    await expect(sourceGapChip).toContainText('Observed 2026-03-16T08:58:30.000Z');
    await expect(sourceGapChip).not.toContainText('/tmp/app-engineering');
    await expect(sourceGapChip).not.toContainText('5-web3-app-engineering');
    await expect(hermesProfileGapChip).toBeVisible();
    await expect(hermesProfileGapChip).toContainText('Hermes profile · missing');
    await expect(hermesProfileGapChip).toContainText('runtime presence · mapped source');
    await expect(hermesProfileGapChip).toContainText('Not observed');
    await expect(hermesProfileGapChip).not.toContainText('hermes://');
    await expect(hermesProfileGapChip).not.toContainText('profile-app-engineering');
    await expect(hermesProfileGapChip).not.toContainText('5-web3-app-engineering');
    await expect(hermesSessionGapChip).toBeVisible();
    await expect(hermesSessionGapChip).toContainText('Hermes session · degraded');
    await expect(hermesSessionGapChip).toContainText('runtime presence · mapped source');
    await expect(hermesSessionGapChip).toContainText('Observed 2026-03-16T08:58:35.000Z');
    await expect(hermesSessionGapChip).not.toContainText('hermes://');
    await expect(hermesSessionGapChip).not.toContainText('profile-app-engineering');
    await expect(hermesSessionGapChip).not.toContainText('5-web3-app-engineering');
    await expectOverlayCombinationViewportGuard(
      page,
      worldHost,
      [
        { locator: collectorSnapshotChip, label: 'collector freshness chip' },
        { locator: signals, label: 'opened HUD signals overlay' },
        { locator: sourceGapFocus, label: 'source-gap focus overlay' }
      ],
      'collector freshness/source-gap overlay combination'
    );
    await expectVisibleTextHasNoRawOperatorRefs(signals, 'opened HUD signals overlay');

    const before = await readViewportState(page);
    expect(before).not.toBeNull();
    const [headRect] = await Promise.all([readRect(evidenceFocusHead)]);
    const dragStart = {
      x: headRect.left + Math.min(16, Math.max(1, headRect.width / 2)),
      y: headRect.top + Math.min(12, Math.max(1, headRect.height / 2))
    };

    const hitTarget = await page.evaluate(({ x, y }) => {
      const target = document.elementFromPoint(x, y);
      return {
        insideWorld: Boolean(target?.closest('.aitown-world__host')),
        insideEvidenceFocus: Boolean(target?.closest('.aitown-panel__evidence-focus')),
        insideEvidenceFocusChip: Boolean(target?.closest('.aitown-focus-chip')),
        tagName: target?.tagName ?? null,
        className: target instanceof HTMLElement ? target.className : null
      };
    }, dragStart);
    expect(
      hitTarget.insideWorld,
      `non-chip evidence focus area should pass through to the world: ${JSON.stringify(hitTarget)}`
    ).toBe(true);
    expect(hitTarget.insideEvidenceFocusChip).toBe(false);
    expect(hitTarget.insideEvidenceFocus).toBe(false);

    await page.mouse.move(dragStart.x, dragStart.y);
    await page.mouse.down();
    await page.mouse.move(dragStart.x + 140, dragStart.y, { steps: 12 });
    await page.mouse.up();

    await expect
      .poll(async () => {
        const current = await readViewportState(page);
        return current && before ? Math.abs(current.x - before.x) : 0;
      }, 'Evidence focus non-chip area should leave horizontal world drag usable')
      .toBeGreaterThan(40);

    await hermesSessionGapChip.click();

    const hub = page.getByRole('dialog', { name: 'Hub' });
    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const hermesDrilldown = detailsPanel.locator('#aitown-selected-agent-source-drilldown-hermes');
    const workspaceDrilldown = detailsPanel.locator('#aitown-selected-agent-source-drilldown-workspace');
    const tmuxDrilldown = detailsPanel.locator('#aitown-selected-agent-source-drilldown-tmux');

    await expect(hub).toBeVisible();
    await expect(detailsPanel.getByText('App Engineering Agent · supervision and collector observation.')).toBeVisible();
    await expect(hermesDrilldown).toHaveAttribute('data-source-gap-focus', 'true');
    await expect
      .poll(async () => hermesDrilldown.evaluate((element) => (element as HTMLDetailsElement).open))
      .toBe(true);
    await expect(hermesDrilldown).toContainText('Hermes session status · degraded');
    await expect(workspaceDrilldown).not.toHaveAttribute('data-source-gap-focus', 'true');
    await expect(tmuxDrilldown).not.toHaveAttribute('data-source-gap-focus', 'true');
  });

  test('keeps Hub-open passive HUD overlay from blocking pan-first horizontal drag', async ({ page }) => {
    await page.goto('/');

    const worldHost = page.locator('.aitown-world__host');
    await expect(worldHost).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    await page.getByRole('button', { name: 'Crew' }).click();

    const hub = page.getByRole('dialog', { name: 'Hub' });
    const passiveTopline = page.locator('.aitown-panel__chrome > .aitown-panel__hud-top > .aitown-panel__topline').first();
    await expect(hub).toBeVisible();
    await expect(passiveTopline).toBeVisible();

    const before = await readViewportState(page);
    expect(before).not.toBeNull();
    expectViewportWithinHorizontalWorldBounds(before!, 'initial Hub-open viewport');

    const worldRect = await readRect(worldHost);
    const upperDragLane = resolveUpperWorldDragLane(worldRect);
    const dragStart = {
      x: upperDragLane.left + upperDragLane.width * 0.5,
      y: upperDragLane.top + upperDragLane.height * 0.5
    };
    expect(dragStart.x, 'drag should start inside the upper world lane').toBeGreaterThanOrEqual(
      upperDragLane.left + 1
    );
    expect(dragStart.x, 'drag should start inside the upper world lane').toBeLessThanOrEqual(
      upperDragLane.right - 1
    );
    expect(dragStart.y, 'drag should start inside the upper world lane').toBeGreaterThanOrEqual(
      upperDragLane.top + 1
    );
    expect(dragStart.y, 'drag should start inside the upper world lane').toBeLessThanOrEqual(
      upperDragLane.bottom - 1
    );

    const hitTarget = await page.evaluate(({ x, y }) => {
      const target = document.elementFromPoint(x, y);
      return {
        insideWorld: Boolean(target?.closest('.aitown-world__host')),
        insideHub: Boolean(target?.closest('#aitown-hub')),
        tagName: target?.tagName ?? null,
        className: target instanceof HTMLElement ? target.className : null
      };
    }, dragStart);
    expect(hitTarget.insideWorld, `drag start should pass through passive HUD to the world: ${JSON.stringify(hitTarget)}`).toBe(
      true
    );
    expect(hitTarget.insideHub, `drag start should not be inside the Hub sheet: ${JSON.stringify(hitTarget)}`).toBe(false);

    await page.mouse.move(dragStart.x, dragStart.y);
    await page.mouse.down();
    await page.mouse.move(dragStart.x + 160, dragStart.y, { steps: 12 });
    await page.mouse.up();

    await expect
      .poll(async () => {
        const current = await readViewportState(page);
        return current && before ? Math.abs(current.x - before.x) : 0;
      }, 'Hub-open passive-HUD drag should move the viewport horizontally')
      .toBeGreaterThan(40);
    const after = await readViewportState(page);
    expect(after).not.toBeNull();

    expect(Math.abs(after!.top - before!.top), 'horizontal drag should not materially shift the vertical world lane').toBeLessThan(
      8
    );
    expect(after!.scale, 'pan-first drag must not depend on zoom changes').toBeCloseTo(before!.scale ?? 1, 3);
    expectViewportWithinHorizontalWorldBounds(after!, 'post-drag Hub-open viewport');
    await expect(hub).toBeVisible();
  });

  test('keeps the RimWorld window first fold readable while leaving the upper world drag lane', async ({ page }) => {
    await page.goto('/');

    const worldHost = page.locator('.aitown-world__host');
    await expect(worldHost).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    await page.getByRole('button', { name: 'Queue' }).click();

    const hub = page.getByRole('dialog', { name: 'Hub' });
    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const activeQueueSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Active Queue' })
    });
    const firstActiveQueueAction = activeQueueSection.getByRole('button', {
      name: 'Inspect Growth Revenue Agent from active queue'
    });

    await expect(hub).toBeVisible();
    await expect(activeQueueSection.getByRole('heading', { name: 'Active Queue' })).toBeVisible();
    await expect(firstActiveQueueAction).toBeVisible();
    await expect.poll(() => hub.evaluate((element) => element.scrollTop)).toBe(0);
    await expectLocatorWithinScrollport(activeQueueSection.getByRole('heading', { name: 'Active Queue' }), hub, 'Active Queue heading');
    await expectLocatorWithinScrollport(firstActiveQueueAction, hub, 'first active queue action');

    const [worldRect, hubRect] = await Promise.all([readRect(worldHost), readRect(hub)]);
    const hubWorldObstructionRatio = resolveIntersectionArea(worldRect, hubRect) / (worldRect.width * worldRect.height);
    expect(hubWorldObstructionRatio, 'RimWorld window should stay bounded, not a world-covering modal').toBeLessThanOrEqual(
      0.45
    );
    expect(
      resolveIntersectionArea(resolveUpperWorldDragLane(worldRect), hubRect),
      'RimWorld window should leave the upper world drag lane visually clear'
    ).toBe(0);

    await page.getByRole('button', { name: 'Close panel' }).click();
    await expect(hub).toHaveCount(0);
    await expectCanvasDragMovesViewport(page);
  });

  test('keeps the 390px portrait shell bounded across Hub and selected-watch transitions', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const worldHost = page.locator('.aitown-world__host');
    await expect(worldHost).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    const initialOverflow = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    }));
    expect(Math.max(initialOverflow.bodyWidth, initialOverflow.documentWidth)).toBeLessThanOrEqual(
      initialOverflow.viewportWidth + 1
    );

    await page.getByRole('button', { name: 'Crew' }).click();
    const hub = page.getByRole('dialog', { name: 'Hub' });
    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    await expect(hub).toBeVisible();
    await expectLocatorInsideViewport(page, hub, 'mobile Hub sheet');

    await detailsPanel.getByRole('button', { name: 'Inspect Growth Revenue Agent', exact: true }).click();
    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();

    const overflowingDetailItems = await hub.locator('.aitown-record, .aitown-link-button').evaluateAll((elements) =>
      elements
        .filter((element) => element.scrollWidth > element.clientWidth + 1)
        .map((element) => ({
          className: element instanceof HTMLElement ? element.className : '',
          text: element.textContent?.trim().slice(0, 80) ?? ''
        }))
        .slice(0, 4)
    );
    expect(overflowingDetailItems).toEqual([]);

    await page.getByRole('button', { name: 'Close panel' }).click();
    await expect(hub).toHaveCount(0);

    const toolbar = page.locator('.aitown-hub-category-bar');
    const statusLegend = page.locator('.aitown-status-legend');
    const watchOverlay = page.getByRole('region', { name: 'Selected watch links' });
    await expect(toolbar).toBeVisible();
    await expect(statusLegend).toBeVisible();
    await expect(watchOverlay).toBeVisible();

    await expectLocatorInsideViewport(page, toolbar, 'mobile category menu');
    await expectLocatorInsideViewport(page, statusLegend, 'mobile status legend');
    await expectLocatorInsideViewport(page, watchOverlay, 'mobile selected-watch overlay');

    const legendPolicy = await statusLegend.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);

      return {
        height: rect.height,
        overflowY: style.overflowY
      };
    });
    expect(legendPolicy.height, 'mobile status legend should stay bounded').toBeLessThanOrEqual(212);
    expect(legendPolicy.overflowY, 'mobile status legend should scroll instead of growing unbounded').toBe('auto');

    const centerHit = await page.evaluate(() => {
      const target = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);

      return {
        insideButton: Boolean(target?.closest('button')),
        insideWorld: Boolean(target?.closest('.aitown-world__host')),
        tagName: target?.tagName ?? null,
        className: target instanceof HTMLElement ? target.className : null
      };
    });
    expect(centerHit.insideButton, `portrait center should not hit chrome controls: ${JSON.stringify(centerHit)}`).toBe(
      false
    );
    expect(centerHit.insideWorld, `portrait center should remain a world drag lane: ${JSON.stringify(centerHit)}`).toBe(
      true
    );

    const finalOverflow = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    }));
    expect(Math.max(finalOverflow.bodyWidth, finalOverflow.documentWidth)).toBeLessThanOrEqual(
      finalOverflow.viewportWidth + 1
    );
  });

  test('keeps selected-agent inspect peek compact outside the world drag lane', async ({ page }) => {
    const workflowRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/agents/growth-revenue/workflow')) {
        workflowRequests.push(url);
      }
    });

    await page.goto('/');

    const worldHost = page.locator('.aitown-world__host');
    await expect(worldHost).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    const hub = page.getByRole('dialog', { name: 'Hub' });
    await expect(hub).toHaveCount(0);

    await page.getByRole('button', { name: 'Inspect live focus agent Growth Revenue Agent' }).click();
    await expect(hub).toHaveCount(0);

    const inspectPeek = page.getByRole('region', { name: 'Selected agent inspect peek' });
    await expect(inspectPeek).toBeVisible();
    await expect(inspectPeek.getByText('Growth Revenue Agent')).toBeVisible();
    await expect(inspectPeek.getByText('State · planning')).toBeVisible();
    await expect(inspectPeek.getByText(/Yellow .* planning/)).toHaveCount(0);
    await expect(inspectPeek.getByText('Inspect facts')).toBeVisible();
    await expect(inspectPeek.getByText('Operation · Prepare handoff notes')).toBeHidden();
    expect(workflowRequests, 'Hub-closed inspect peek should not request selected-agent workflow').toHaveLength(0);
    await expect(inspectPeek.getByText('Correlation · corr-growth-lead-review')).toHaveCount(0);
    await expect(inspectPeek.getByText('Evidence · /tmp/growth-review-complete.md')).toHaveCount(0);

    await inspectPeek.getByText('Inspect facts').press('Enter');
    await expect(inspectPeek.getByText('Operation · Prepare handoff notes')).toBeVisible();

    const [worldRect, peekRect] = await Promise.all([readRect(worldHost), readRect(inspectPeek)]);
    expect(peekRect.width, 'Inspect peek should stay compact').toBeLessThanOrEqual(360);
    expect(peekRect.height, 'Inspect peek should stay compact').toBeLessThanOrEqual(240);
    expect(
      resolveIntersectionArea(resolvePrimaryDragLane(worldRect), peekRect),
      'Inspect peek should stay outside the primary world drag lane'
    ).toBe(0);

    const overflowPolicy = await inspectPeek.evaluate((element) => {
      const peekStyle = getComputedStyle(element);
      const facts = element.querySelector('.aitown-selected-agent-peek__facts');
      const factsStyle = facts ? getComputedStyle(facts) : null;
      return {
        peekOverflow: peekStyle.overflow,
        factsOverflowY: factsStyle?.overflowY ?? null
      };
    });
    expect(overflowPolicy.peekOverflow, 'Inspect peek should clip long labels instead of painting outside').not.toBe(
      'visible'
    );
    expect(overflowPolicy.factsOverflowY, 'Inspect peek facts should scroll or clip long evidence refs').not.toBe(
      'visible'
    );

    await page.getByRole('button', { name: 'Crew' }).click();
    await expect(page.getByRole('dialog', { name: 'Hub' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Selected agent inspect peek' })).toHaveCount(0);
  });

  test('@journey @evidence-live opens selected-agent inspect peek Evidence Ledger without prefetching records', async ({
    page
  }) => {
    const expectedEvidenceRecordsGet = '/evidence-records?agent_id=growth-revenue&newest_first=true&limit=12';
    const expectedEvidenceRefRollupGet =
      '/evidence-records/ref-rollup?agent_id=growth-revenue&newest_first=true&limit=12';
    const evidenceRecordRequests: string[] = [];
    const evidenceRefRollupRequests: string[] = [];
    const evidenceRecordViolations: string[] = [];
    const evidenceRefRollupViolations: string[] = [];
    const apiRequestViolations: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      const relativeUrl = `${url.pathname}${url.search}`;
      const key = `${request.method()} ${relativeUrl}`;
      const apiPathIsReadModel =
        url.pathname.startsWith('/office/') ||
        url.pathname.startsWith('/incidents') ||
        url.pathname.startsWith('/timeline') ||
        url.pathname.startsWith('/peer-watch/') ||
        url.pathname.startsWith('/collectors/') ||
        url.pathname.startsWith('/memory/') ||
        url.pathname.startsWith('/agents/') ||
        url.pathname.startsWith('/correlations/') ||
        url.pathname.startsWith('/evidence-records');
      if (apiPathIsReadModel && request.method() !== 'GET') {
        apiRequestViolations.push(key);
      }

      if (url.pathname === '/evidence-records/ref-rollup') {
        evidenceRefRollupRequests.push(relativeUrl);
        if (request.method() !== 'GET' || relativeUrl !== expectedEvidenceRefRollupGet) {
          evidenceRefRollupViolations.push(key);
        }
        return;
      }

      if (url.pathname !== '/evidence-records') {
        return;
      }

      evidenceRecordRequests.push(relativeUrl);
      if (request.method() !== 'GET' || relativeUrl !== expectedEvidenceRecordsGet) {
        evidenceRecordViolations.push(key);
      }
    });

    await page.route('**/collectors/controller-snapshot/evidence-coverage', async (route) => {
      await route.fulfill({
        json: {
          item: {
            evidence_ref_count: 1,
            covered_agent_count: 1,
            low_confidence_agent_ids: ['growth-revenue'],
            source_kind_buckets: { workspace_file: 1, workspace_root: 1, tmux_observation: 1 },
            agent_items: [
              {
                agent_id: 'growth-revenue',
                evidence_ref_count: 3,
                evidence_refs: ['/tmp/launch-note.md', 'tmux://6-web3-growth-revenue/2.0', '/tmp/growth-revenue'],
                source_kinds: ['tmux_observation', 'workspace_file', 'workspace_root'],
                latest_evidence_at: '2026-03-16T08:58:40.000Z',
                confidence_level: 'medium'
              }
            ]
          }
        }
      });
    });

    await page.goto('/');

    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    const hub = page.getByRole('dialog', { name: 'Hub' });
    await expect(hub).toHaveCount(0);

    await page.getByRole('button', { name: 'Inspect live focus agent Growth Revenue Agent' }).click();
    await expect(hub).toHaveCount(0);

    const inspectPeek = page.getByRole('region', { name: 'Selected agent inspect peek' });
    const ledgerCta = inspectPeek.getByRole('button', { name: 'Open Growth Revenue Agent Evidence Ledger' });
    await expect(inspectPeek).toBeVisible();
    await expect(ledgerCta).toBeVisible();
    await expect(inspectPeek.getByText(/Proof glance · \d+ records? · Sources/)).toBeVisible();
    await expectOverlayCombinationViewportGuard(
      page,
      page.locator('.aitown-world__host'),
      [{ locator: inspectPeek, label: 'selected-agent proof peek' }],
      'selected-agent proof peek overlay combination'
    );
    const proofCapsuleText = await inspectPeek.innerText();
    expect(
      proofCapsuleText,
      'Hub-closed proof capsule should summarize evidence without raw refs or runtime payloads'
    ).not.toMatch(/\/tmp\/|tmux:\/\/|hermes:\/\/|\b\d+-web3-[a-z0-9-]+\b|profile-[a-z0-9-]+/i);
    await expectVisibleTextHasNoRawOperatorRefs(inspectPeek, 'selected-agent proof peek');
    expect(evidenceRecordRequests, 'Hub-closed inspect peek should not prefetch evidence records').toEqual([]);
    expect(evidenceRefRollupRequests, 'Hub-closed inspect peek should not prefetch ref-rollup rows').toEqual([]);

    await ledgerCta.click();

    await expect(hub).toBeVisible();
    const evidenceTab = page
      .getByRole('tablist', { name: 'Selected agent drilldown' })
      .getByRole('tab', { name: 'Evidence' });
    await expect(evidenceTab).toHaveAttribute('aria-selected', 'true');
    const evidencePanel = page.getByRole('tabpanel', { name: 'Evidence' });
    await expect(evidencePanel.getByRole('heading', { name: 'Evidence Ledger' })).toBeVisible();
    await expect(evidencePanel.getByText('Scope · Selected-agent evidence records')).toBeVisible();
    await expect.poll(() => evidenceRecordRequests.slice()).toEqual([expectedEvidenceRecordsGet]);
    await expect.poll(() => evidenceRefRollupRequests.slice()).toEqual([expectedEvidenceRefRollupGet]);
    expect(evidenceRecordViolations, 'Inspect peek Evidence Ledger CTA should only issue exact evidence-record GETs').toEqual([]);
    expect(evidenceRefRollupViolations, 'Inspect peek Evidence Ledger CTA should only issue exact ref-rollup GETs').toEqual([]);
    expect(apiRequestViolations, 'Inspect peek Evidence Ledger CTA should not issue mutating API requests').toEqual([]);
  });

  test('@journey @evidence-live surfaces selected-agent provenance anchors after explicit Inspect record', async ({
    page
  }) => {
    const evidenceId =
      'ev_collector-snapshot_2026-03-10T23_59_40_000Z_app-engineering_workspace_file__tmp_revenue-handoff_md_1';
    const boundedEvidenceId = `${evidenceId.slice(0, 69)}...`;
    const expectedEvidenceRecordGets = [
      '/evidence-records?agent_id=app-engineering&newest_first=true&limit=12',
      `/evidence-records/${evidenceId}`,
      `/evidence-records/${evidenceId}/provenance-bundle`
    ];
    const expectedEvidenceRefRollupGet =
      '/evidence-records/ref-rollup?agent_id=app-engineering&newest_first=true&limit=12';
    const expectedCheckpointLogGet = `/accountability/replay/checkpoint-log?limit=3&evidence_id=${encodeURIComponent(
      evidenceId
    )}`;
    const allowedApiGets = new Set([
      '/office/overview',
      '/incidents?limit=200&window=8760h',
      '/collectors/controller-snapshot/source-health?limit=7',
      '/collectors/controller-snapshot/evidence-coverage',
      '/collectors/controller-snapshot/summary',
      '/runtime/source-gaps?newest_first=true&limit=3',
      '/runtime/source-gaps/summary?newest_first=true&limit=3',
      '/agents/evidence-spine/summary?newest_first=true&limit=200',
      '/agents/evidence-spine/source-matrix?newest_first=true&limit=200',
      '/agents/app-engineering/workflow?limit=10&window=60m',
      '/office/operations?agent_id=app-engineering',
      '/collectors/controller-snapshot',
      '/memory/artifacts?limit=4&window=60m&agent_id=app-engineering',
      '/memory/artifacts?limit=4&window=60m&agent_id=app-engineering&correlation_id=collector-snapshot%3A2026-03-10T23%3A59%3A40.000Z',
      '/timeline?limit=10&window=60m&agent_id=app-engineering',
      '/timeline?limit=10&window=60m&agent_id=app-engineering&correlation_id=collector-snapshot%3A2026-03-10T23%3A59%3A40.000Z',
      '/peer-watch/alerts?target_agent_id=app-engineering&limit=4',
      '/peer-watch/alerts?target_agent_id=app-engineering&correlation_id=collector-snapshot%3A2026-03-10T23%3A59%3A40.000Z&limit=4',
      '/correlations/collector-snapshot%3A2026-03-10T23%3A59%3A40.000Z?limit=10&window=60m',
      expectedEvidenceRefRollupGet,
      expectedCheckpointLogGet,
      ...expectedEvidenceRecordGets
    ]);
    const checkpointLogRequests: string[] = [];
    const evidenceRecordRequests: string[] = [];
    const evidenceRefRollupRequests: string[] = [];
    const evidenceRecordViolations: string[] = [];
    const evidenceRefRollupViolations: string[] = [];
    const apiRequestViolations: string[] = [];

    page.on('request', (request) => {
      const url = new URL(request.url());
      const relativeUrl = `${url.pathname}${url.search}`;
      const key = `${request.method()} ${relativeUrl}`;
      const apiPathIsReadModel =
        url.pathname.startsWith('/office/') ||
        url.pathname.startsWith('/incidents') ||
        url.pathname.startsWith('/timeline') ||
        url.pathname.startsWith('/peer-watch/') ||
        url.pathname.startsWith('/collectors/') ||
        url.pathname.startsWith('/memory/') ||
        url.pathname.startsWith('/agents/') ||
        url.pathname.startsWith('/correlations/') ||
        url.pathname === '/runtime' ||
        url.pathname.startsWith('/runtime/') ||
        url.pathname === '/accountability' ||
        url.pathname.startsWith('/accountability/') ||
        url.pathname.startsWith('/evidence-records') ||
        url.pathname === '/control-plane' ||
        url.pathname.startsWith('/control-plane/');
      if (apiPathIsReadModel && (request.method() !== 'GET' || !allowedApiGets.has(relativeUrl))) {
        apiRequestViolations.push(key);
      }

      if (url.pathname === '/accountability/replay/checkpoint-log') {
        checkpointLogRequests.push(relativeUrl);
      }

      if (url.pathname === '/evidence-records/ref-rollup') {
        evidenceRefRollupRequests.push(relativeUrl);
        if (request.method() !== 'GET' || relativeUrl !== expectedEvidenceRefRollupGet) {
          evidenceRefRollupViolations.push(key);
        }
        return;
      }

      if (!url.pathname.startsWith('/evidence-records')) {
        return;
      }

      evidenceRecordRequests.push(relativeUrl);
      if (request.method() !== 'GET' || !expectedEvidenceRecordGets.includes(relativeUrl)) {
        evidenceRecordViolations.push(key);
      }
    });

    await page.route('**/accountability/replay/checkpoint-log?*', async (route) => {
      const url = new URL(route.request().url());
      const relativeUrl = `${url.pathname}${url.search}`;
      await route.fulfill({
        json:
          relativeUrl === expectedCheckpointLogGet
            ? {
                items: [
                  {
                    append_index: 87,
                    record_kind: 'evidence_record',
                    checkpoint: {
                      observed_at: '2026-03-10T23:59:40.000Z',
                      collected_at: '2026-03-10T23:59:40.000Z',
                      agent_id: 'app-engineering',
                      source_kind: 'workspace_file',
                      evidence_role: 'agent_output',
                      source_status: 'unknown',
                      output_candidate: true,
                      collector_snapshot_id: 'collector-snapshot:2026-03-10T23:59:40.000Z',
                      correlation_id: 'collector-snapshot:2026-03-10T23:59:40.000Z',
                      unmapped: false
                    }
                  }
                ]
              }
            : { items: [] }
      });
    });

    await page.goto('/');

    await expect(page.locator('.aitown-world__host canvas')).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    const roster = page.getByRole('navigation', { name: 'Agent roster' });
    await roster.getByRole('button', { name: 'Select and locate App Engineering Agent' }).click();

    const inspectPeek = page.getByRole('region', { name: 'Selected agent inspect peek' });
    const ledgerCta = inspectPeek.getByRole('button', { name: 'Open App Engineering Agent Evidence Ledger' });
    await expect(inspectPeek).toBeVisible();
    await expect(ledgerCta).toBeVisible();
    expect(evidenceRecordRequests, 'Selecting an agent should not prefetch evidence records').toEqual([]);
    expect(evidenceRefRollupRequests, 'Selecting an agent should not prefetch ref-rollup rows').toEqual([]);

    await ledgerCta.click();

    const hub = page.getByRole('dialog', { name: 'Hub' });
    await expect(hub).toBeVisible();
    const evidencePanel = page.getByRole('tabpanel', { name: 'Evidence' });
    await expect(evidencePanel.getByRole('heading', { name: 'Evidence Ledger' })).toBeVisible();
    await expect.poll(() => evidenceRecordRequests.slice()).toEqual([expectedEvidenceRecordGets[0]]);
    await expect.poll(() => evidenceRefRollupRequests.slice()).toEqual([expectedEvidenceRefRollupGet]);
    await expect(
      evidencePanel.getByRole('button', { name: `Inspect evidence record ${evidenceId}` })
    ).toHaveCount(0);

    await evidencePanel.getByRole('button', { name: `Inspect evidence record ${boundedEvidenceId}` }).click();

    await expect.poll(() => evidenceRecordRequests.slice()).toEqual(expectedEvidenceRecordGets);
    await expect.poll(() => checkpointLogRequests.slice()).toEqual([expectedCheckpointLogGet]);
    const detailSection = evidencePanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Evidence Record Detail' })
    });
    await expect(detailSection).toContainText(
      'Snapshot anchor · collector-snapshot:2026-03-10T23:59:40.000Z'
    );
    await expect(detailSection).toContainText('Source anchor ·');
    await expect(detailSection).toContainText('workspace_file · agent_output · unknown');
    await expect(detailSection).toContainText('Replay anchor · collector-snapshot:2026-03-10T23:59:40.000Z');
    await expect(detailSection).toContainText('Checkpoint proof');
    await expect(detailSection).toContainText(
      '#87 · evidence_record · workspace_file · agent_output · unknown · output candidate · collector-snapshot:2026-03-10T23:59:40.000Z · 2026-03-10T23:59:40.000Z'
    );
    await expect(detailSection).not.toContainText('/collectors/controller-snapshot');
    await expect(detailSection).not.toContainText('/accountability/replay');
    await expect(detailSection).not.toContainText('/evidence-records/');
    await expect(detailSection).not.toContainText('/tmp/revenue-handoff.md');
    expect(evidenceRecordViolations, 'Inspect record should issue only exact evidence read GETs').toEqual([]);
    expect(evidenceRefRollupViolations, 'Evidence Ledger should issue only exact ref-rollup GETs').toEqual([]);
    expect(apiRequestViolations, 'Inspect record should not issue unlisted or mutating API requests').toEqual([]);
  });

  test('keeps the selected-agent Hub focus ribbon compact inside the RimWorld window', async ({ page }) => {
    await page.goto('/');

    const worldHost = page.locator('.aitown-world__host');
    await expect(worldHost).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    await page.getByRole('button', { name: 'Queue' }).click();

    const hub = page.getByRole('dialog', { name: 'Hub' });
    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const activeQueueSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Active Queue' })
    });

    await expect(hub).toBeVisible();
    await expect(detailsPanel.getByRole('heading', { name: 'Active Queue' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Hub focus ribbon' })).toHaveCount(0);
    await expectLocatorWithinScrollport(
      activeQueueSection.getByRole('heading', { name: 'Active Queue' }),
      hub,
      'Active Queue heading'
    );
    await expectLocatorWithinScrollport(
      activeQueueSection.getByRole('button', { name: 'Inspect Growth Revenue Agent from active queue' }),
      hub,
      'first active queue action'
    );

    await activeQueueSection
      .getByRole('button', { name: 'Inspect Growth Revenue Agent from active queue' })
      .click();
    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();

    const focusRibbon = page.getByRole('region', { name: 'Hub focus ribbon' });
    await expect(focusRibbon).toBeVisible();
    await expect(focusRibbon.getByText('Growth Revenue Agent')).toBeVisible();
    await expect(focusRibbon.getByText(/Yellow .* planning/)).toBeVisible();
    await expect(focusRibbon.getByText('Loaded context facts')).toBeVisible();
    await expect(focusRibbon.getByText('Operation · Prepare handoff notes')).toBeVisible();
    await expect(focusRibbon.getByText('Correlation · corr-revenue-handoff')).toBeVisible();
    await expect(focusRibbon.getByText('Evidence · /tmp/revenue-handoff.md')).toBeVisible();

    const [worldRect, hubRect, ribbonRect] = await Promise.all([
      readRect(worldHost),
      readRect(hub),
      readRect(focusRibbon)
    ]);
    expect(ribbonRect.height, 'Hub focus ribbon should stay compact').toBeLessThanOrEqual(
      Math.min(184, page.viewportSize()!.height * 0.22) + 1
    );
    expect(ribbonRect.width, 'Hub focus ribbon should stay bounded by the Hub sheet').toBeLessThanOrEqual(
      hubRect.width
    );
    expect(
      resolveIntersectionArea(resolveUpperWorldDragLane(worldRect), ribbonRect),
      'Hub focus ribbon should not cover the upper world drag lane'
    ).toBe(0);
    await expectLocatorInsideRect(focusRibbon, hub, 'Hub focus ribbon');

    const overflowPolicy = await focusRibbon.evaluate((element) => {
      const ribbonStyle = getComputedStyle(element);
      const facts = element.querySelector('.aitown-hub-focus-ribbon__facts');
      const factsStyle = facts ? getComputedStyle(facts) : null;
      const fact = element.querySelector('.aitown-hub-focus-ribbon__facts span');
      const factStyle = fact ? getComputedStyle(fact) : null;
      return {
        ribbonOverflow: ribbonStyle.overflow,
        factsOverflowX: factsStyle?.overflowX ?? null,
        factsOverflowY: factsStyle?.overflowY ?? null,
        factOverflowWrap: factStyle?.overflowWrap ?? null
      };
    });
    expect(overflowPolicy.ribbonOverflow, 'Hub focus ribbon should clip long labels').not.toBe('visible');
    expect(overflowPolicy.factsOverflowX, 'Hub focus ribbon facts should not paint sideways').not.toBe(
      'visible'
    );
    expect(overflowPolicy.factsOverflowY, 'Hub focus ribbon facts should clip or scroll vertically').not.toBe(
      'visible'
    );
    expect(overflowPolicy.factOverflowWrap, 'Hub focus ribbon facts should wrap long tokens').toBe('anywhere');

    await hub.evaluate((element) => {
      element.scrollTop = 720;
    });
    await expect.poll(() => hub.evaluate((element) => element.scrollTop)).toBe(0);
    await expect(focusRibbon).toBeVisible();
    await expectLocatorInsideRect(focusRibbon, hub, 'Hub focus ribbon after no-op window scroll');

    await page.getByRole('button', { name: 'Close panel' }).click();
    await expect(hub).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Hub focus ribbon' })).toHaveCount(0);
    const inspectPeek = page.getByRole('region', { name: 'Selected agent inspect peek' });
    await expect(inspectPeek).toBeVisible();
    await expect(inspectPeek.getByText('Growth Revenue Agent')).toBeVisible();

    await page.getByRole('button', { name: 'Crew' }).click();
    await expect(page.getByRole('region', { name: 'Selected agent inspect peek' })).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Hub' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Hub focus ribbon' })).toBeVisible();
  });

  test('@journey @evidence-live selected-agent Hub drilldown tabs split Now Evidence and Replay Correlation inside the RimWorld window', async ({
    page
  }) => {
    await page.goto('/');

    const worldHost = page.locator('.aitown-world__host');
    await expect(worldHost).toBeVisible();
    await page.waitForFunction(() => Boolean(window.__AITOWN_VIEWPORT__));

    await page.getByRole('button', { name: 'Queue' }).click();

    const hub = page.getByRole('dialog', { name: 'Hub' });
    const detailsPanel = page.getByRole('complementary', { name: 'Agent details' });
    const activeQueueSection = detailsPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Active Queue' })
    });

    await expect(hub).toBeVisible();
    await expect(activeQueueSection.getByRole('heading', { name: 'Active Queue' })).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'Selected agent drilldown' })).toHaveCount(0);

    await activeQueueSection
      .getByRole('button', { name: 'Inspect Growth Revenue Agent from active queue' })
      .click();

    await expect(detailsPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    const focusRibbon = page.getByRole('region', { name: 'Hub focus ribbon' });
    const drilldown = page.getByRole('region', { name: 'Selected agent drilldown' });
    const tablist = page.getByRole('tablist', { name: 'Selected agent drilldown' });
    const nowTab = tablist.getByRole('tab', { name: 'Now' });
    const evidenceTab = tablist.getByRole('tab', { name: 'Evidence' });
    const replayTab = tablist.getByRole('tab', { name: 'Replay / Correlation' });

    await expect(focusRibbon).toBeVisible();
    await expect(tablist).toBeVisible();
    await expect(nowTab).toHaveAttribute('aria-selected', 'true');
    await expect(evidenceTab).toHaveAttribute('aria-selected', 'false');
    await expect(replayTab).toHaveAttribute('aria-selected', 'false');

    const nowPanel = page.getByRole('tabpanel', { name: 'Now' });
    const nowOperationSection = nowPanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Current Operation' })
    });
    await expect(nowPanel).toBeVisible();
    await expect(nowPanel.getByRole('heading', { name: 'Growth Revenue Agent' })).toBeVisible();
    await expect(nowOperationSection.getByRole('heading', { name: 'Current Operation' })).toBeVisible();
    await expect(nowOperationSection.getByText('planning · Prepare handoff notes')).toBeVisible();
    await expect(
      nowOperationSection.getByRole('button', { name: /Open operation correlation corr-revenue-handoff/ })
    ).toBeVisible();
    await expect(
      nowOperationSection.getByRole('button', { name: 'Jump to shared memory artifact /tmp/revenue-handoff.md' })
    ).toBeVisible();
    await expect(nowPanel.getByRole('heading', { name: 'Timeline Replay' })).toHaveCount(0);
    await expect(nowPanel.getByRole('heading', { name: 'Correlation Drilldown' })).toHaveCount(0);

    const [worldRect, hubRect, focusRibbonRect, drilldownRect] = await Promise.all([
      readRect(worldHost),
      readRect(hub),
      readRect(focusRibbon),
      readRect(drilldown)
    ]);
    expect(hubRect.width, 'RimWorld window should stay bounded by its readable-window width contract').toBeLessThanOrEqual(
      Math.min(860, page.viewportSize()!.width - 32) + 1
    );
    expect(hubRect.height, 'RimWorld window should be tall enough to read opened category content').toBeGreaterThanOrEqual(
      419
    );
    expect(
      hubRect.height,
      'RimWorld window should stay bounded instead of becoming a full modal on desktop'
    ).toBeLessThanOrEqual(561);
    const selectedAgentChromeVerticalFootprint =
      Math.max(focusRibbonRect.bottom, drilldownRect.bottom) - Math.min(focusRibbonRect.top, drilldownRect.top);
    expect(
      selectedAgentChromeVerticalFootprint,
      'Hub focus ribbon and desktop drilldown tabs should keep a compact vertical footprint'
    ).toBeLessThanOrEqual(198);
    expect(
      resolveIntersectionArea(resolveUpperWorldDragLane(worldRect), drilldownRect),
      'Selected-agent drilldown tabs should not cover the upper world drag lane'
    ).toBe(0);
    await expectLocatorInsideRect(drilldown, hub, 'Selected-agent drilldown tabs');

    await hub.evaluate((element) => {
      element.scrollTop = 720;
    });
    await expect.poll(() => hub.evaluate((element) => element.scrollTop)).toBe(0);
    await evidenceTab.click();
    const evidencePanel = page.getByRole('tabpanel', { name: 'Evidence' });
    await expect(evidencePanel).toBeVisible();
    await expectLocatorTopInsideScrollport(evidencePanel, hub, 'Evidence tab panel');
    await expect(evidencePanel.getByRole('heading', { name: 'Collector Observation' })).toBeVisible();
    await expect(evidencePanel.getByRole('heading', { name: 'Audit Signals' })).toBeVisible();
    await expect(evidencePanel.getByRole('heading', { name: 'Evidence Ledger' })).toBeVisible();
    await expect(evidencePanel.getByText('Scope · Selected-agent evidence records')).toBeVisible();
    const evidenceWorkflowSection = evidencePanel.locator('section').filter({
      has: page.getByRole('heading', { name: 'Workflow' })
    });
    await expect(evidenceWorkflowSection.getByRole('heading', { name: 'Workflow' })).toBeVisible();
    await expect(
      evidenceWorkflowSection
        .getByRole('button', { name: 'Jump to shared memory artifact local evidence' })
        .first()
    ).toBeVisible();

    await replayTab.click();
    const replayPanel = page.getByRole('tabpanel', { name: 'Replay / Correlation' });
    await expect(replayPanel).toBeVisible();
    await expectLocatorTopInsideScrollport(replayPanel, hub, 'Replay / Correlation tab panel');
    await expect(replayPanel.getByRole('heading', { name: 'Timeline Replay' })).toBeVisible();
    await expect(replayPanel.getByRole('heading', { name: 'Correlation Drilldown' })).toBeVisible();
    await expect(replayPanel.getByRole('heading', { name: 'Replay Bundle' })).toBeVisible();
    const replayProofLadder = replayPanel.locator('li').filter({ hasText: 'Replay Proof Ladder' });
    await expect(replayProofLadder.getByText(/Verdict · \w+/)).toBeVisible();
    await expect(replayProofLadder.getByText(/Rows · \d+ total · \d+ replayable/)).toBeVisible();
    await expect(replayProofLadder.getByText(/Anchor events · \d+/)).toBeVisible();
    await expect(replayPanel.getByText(/Ledger · \d+ entries · derived\/read-only/)).toBeVisible();

    await page.getByRole('button', { name: 'Close panel' }).click();
    await expect(hub).toHaveCount(0);
    await expect(page.getByRole('tablist', { name: 'Selected agent drilldown' })).toHaveCount(0);
    const inspectPeek = page.getByRole('region', { name: 'Selected agent inspect peek' });
    await expect(inspectPeek).toBeVisible();

    await page.getByRole('button', { name: 'Crew' }).click();
    await expect(page.getByRole('dialog', { name: 'Hub' })).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'Selected agent drilldown' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Now' })).toHaveAttribute('aria-selected', 'true');
  });
});
