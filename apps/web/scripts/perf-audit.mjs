import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import {
  launchManagedServer,
  resolveFrontendServerArgs,
  stopManagedServer
} from './run-browser-smoke.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(appRoot, '../..');
const outputDir = path.resolve(repoRoot, '.tmp/perf-audit');
const denseAgentCount = Number.parseInt(process.env.PERF_AUDIT_AGENT_COUNT ?? '80', 10);
const fpsSampleMs = Number.parseInt(process.env.PERF_AUDIT_FPS_MS ?? '60000', 10);
const fpsWarmupMs = Number.parseInt(process.env.PERF_AUDIT_WARMUP_MS ?? '2000', 10);
const mapSwitchCount = Number.parseInt(process.env.PERF_AUDIT_MAP_SWITCHES ?? '10', 10);
const settleMs = Number.parseInt(process.env.PERF_AUDIT_SETTLE_MS ?? '1500', 10);

function nowIso() {
  return new Date().toISOString();
}

function resolvePnpmCommand() {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function cloneDenseAgents(overview) {
  const baseAgents = Array.isArray(overview.agents) ? overview.agents : [];
  if (baseAgents.length === 0 || !Number.isFinite(denseAgentCount) || denseAgentCount <= baseAgents.length) {
    return overview;
  }

  const clonedAgents = [...baseAgents];
  const phases = ['active', 'reviewing', 'blocked', 'waiting', 'planning'];
  const severities = ['normal', 'yellow', 'orange', 'red'];
  const locations = ['delivery-desk', 'meeting-zone', 'lead-desk'];

  for (let index = baseAgents.length; index < denseAgentCount; index += 1) {
    const template = baseAgents[index % baseAgents.length];
    clonedAgents.push({
      ...template,
      agent_id: `perf-agent-${index.toString().padStart(3, '0')}`,
      display_name: `Perf Agent ${index.toString().padStart(3, '0')}`,
      current_location: locations[index % locations.length],
      current_map_id: 'neon-commercial-district',
      current_state: phases[index % phases.length],
      severity: severities[index % severities.length],
      active_task: `Perf audit patrol ${index}`
    });
  }

  return {
    ...overview,
    agents: clonedAgents,
    summary: overview.summary
      ? {
          ...overview.summary,
          total_agents: clonedAgents.length
        }
      : overview.summary
  };
}

async function collectHeap(cdpSession) {
  await cdpSession.send('HeapProfiler.collectGarbage').catch(() => {});
  const heapUsage = await cdpSession.send('Runtime.getHeapUsage').catch(() => null);
  const performanceMetrics = await cdpSession.send('Performance.getMetrics');
  const metricByName = new Map(performanceMetrics.metrics.map((metric) => [metric.name, metric.value]));

  return {
    jsHeapUsedSize: metricByName.get('JSHeapUsedSize') ?? null,
    jsHeapTotalSize: metricByName.get('JSHeapTotalSize') ?? null,
    runtimeUsedSize: heapUsage?.usedSize ?? null,
    runtimeTotalSize: heapUsage?.totalSize ?? null
  };
}

async function sampleFps(page, durationMs) {
  return page.evaluate(
    (sampleDurationMs) =>
      new Promise((resolve) => {
        let frameCount = 0;
        let measuredFrames = 0;
        let longFrames = 0;
        let maxFrameMs = 0;
        let totalFrameMs = 0;
        let previous = null;
        const startedAt = performance.now();

        function frame(now) {
          frameCount += 1;

          if (previous !== null) {
            const frameMs = now - previous;
            measuredFrames += 1;
            totalFrameMs += frameMs;
            maxFrameMs = Math.max(maxFrameMs, frameMs);
            if (frameMs > 50) {
              longFrames += 1;
            }
          }

          previous = now;
          if (now - startedAt >= sampleDurationMs) {
            const durationMs = now - startedAt;
            resolve({
              avgFps: measuredFrames / (durationMs / 1000),
              durationMs,
              frameCount,
              longFrames,
              maxFrameMs,
              meanFrameMs: measuredFrames > 0 ? totalFrameMs / measuredFrames : 0
            });
            return;
          }

          requestAnimationFrame(frame);
        }

        requestAnimationFrame(frame);
      }),
    durationMs
  );
}

async function switchMapOnce(page) {
  const title = page.locator('.aitown-map-gateways__title').first();
  const before = (await title.textContent()) ?? '';
  const startedAt = await page.evaluate(() => performance.now());

  await page.locator('.aitown-map-gateways__button').first().click();
  await page.waitForFunction(
    (previousTitle) => document.querySelector('.aitown-map-gateways__title')?.textContent !== previousTitle,
    before,
    { timeout: 5000 }
  );
  await page.locator('.aitown-world__host canvas').waitFor({ state: 'visible', timeout: 5000 });

  const finishedAt = await page.evaluate(() => performance.now());
  return finishedAt - startedAt;
}

async function runAudit() {
  await fs.mkdir(outputDir, { recursive: true });

  const backend = await launchManagedServer({
    command: 'node',
    args: ['./scripts/browser-smoke-backend.mjs'],
    env: {
      ...process.env,
      PORT: '0'
    },
    waitForUrlPath: '/health',
    readyPrefix: 'browser smoke backend listening on '
  });

  const frontend = await launchManagedServer({
    command: resolvePnpmCommand(),
    args: resolveFrontendServerArgs({ frontendMode: 'preview', devServerPort: 0 }),
    env: {
      ...process.env,
      VITE_DEV_PROXY_TARGET: backend.origin
    },
    waitForUrlPath: '/',
    readyPrefix: 'Local:'
  });

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--js-flags=--expose-gc',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ]
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 960 }
    });
    const page = await context.newPage();

    await page.route('**/office/overview', async (route) => {
      const response = await route.fetch();
      const overview = await response.json();
      await route.fulfill({ json: cloneDenseAgents(overview) });
    });

    const cdpSession = await context.newCDPSession(page);
    await cdpSession.send('Performance.enable');
    await cdpSession.send('Runtime.enable');
    await cdpSession.send('HeapProfiler.enable');

    await page.goto(frontend.origin, { waitUntil: 'networkidle' });
    await page.locator('.aitown-world__host canvas').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('.aitown-map-gateways__button').first().waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(settleMs);
    const fpsWarmup = fpsWarmupMs > 0 ? await sampleFps(page, fpsWarmupMs) : null;

    const heapBefore = await collectHeap(cdpSession);
    const fps = await sampleFps(page, fpsSampleMs);
    const heapAfterFps = await collectHeap(cdpSession);

    const switchDurationsMs = [];
    const heapAfterEachSwitch = [];
    for (let index = 0; index < mapSwitchCount; index += 1) {
      switchDurationsMs.push(await switchMapOnce(page));
      heapAfterEachSwitch.push(await collectHeap(cdpSession));
    }

    const heapAfterSwitches = heapAfterEachSwitch.at(-1) ?? (await collectHeap(cdpSession));
    const sortedSwitchDurations = [...switchDurationsMs].sort((left, right) => left - right);
    const p95Index = Math.min(sortedSwitchDurations.length - 1, Math.ceil(sortedSwitchDurations.length * 0.95) - 1);

    const metrics = {
      generatedAt: nowIso(),
      browser: 'chromium',
      frontendOrigin: frontend.origin,
      backendOrigin: backend.origin,
      denseAgentCount,
      fpsSampleMs,
      fpsWarmupMs,
      mapSwitchCount,
      settleMs,
      fpsWarmup,
      fps,
      heapBefore,
      heapAfterFps,
      heapAfterSwitches,
      heapAfterEachSwitch,
      switchDurationsMs,
      switchDurationSummaryMs: {
        min: sortedSwitchDurations[0] ?? null,
        max: sortedSwitchDurations.at(-1) ?? null,
        p95: sortedSwitchDurations[p95Index] ?? null,
        average:
          switchDurationsMs.length > 0
            ? switchDurationsMs.reduce((total, value) => total + value, 0) / switchDurationsMs.length
            : null
      },
      thresholds: {
        avgFps: 58,
        maxLongFramesPerMinute: 5,
        maxSwitchP95Ms: 500,
        heapGrowthAfterSwitchesRatio: 0.2
      }
    };

    const heapBase = metrics.heapBefore.runtimeUsedSize ?? metrics.heapBefore.jsHeapUsedSize ?? 0;
    const heapAfter = metrics.heapAfterSwitches.runtimeUsedSize ?? metrics.heapAfterSwitches.jsHeapUsedSize ?? 0;
    metrics.heapGrowthAfterSwitchesRatio = heapBase > 0 ? (heapAfter - heapBase) / heapBase : null;
    metrics.longFramesPerMinute =
      metrics.fps.durationMs > 0 ? metrics.fps.longFrames / (metrics.fps.durationMs / 60000) : null;
    metrics.green =
      metrics.fps.avgFps >= metrics.thresholds.avgFps &&
      (metrics.longFramesPerMinute ?? Infinity) <= metrics.thresholds.maxLongFramesPerMinute &&
      (metrics.switchDurationSummaryMs.p95 ?? Infinity) <= metrics.thresholds.maxSwitchP95Ms &&
      (metrics.heapGrowthAfterSwitchesRatio ?? Infinity) <= metrics.thresholds.heapGrowthAfterSwitchesRatio;

    const outputPath = path.join(outputDir, 'latest.json');
    await fs.writeFile(outputPath, `${JSON.stringify(metrics, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(metrics, null, 2)}\n`);

    if (!metrics.green) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close().catch(() => {});
    await stopManagedServer(frontend.child);
    await stopManagedServer(backend.child);
  }
}

runAudit().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
