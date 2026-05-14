# PERF_AUDIT

Date: 2026-05-14

Scope: `apps/web/src/aitown/WorldScene.tsx`, generated map assets, and AI Town map switching.

## Method

Command:

```sh
pnpm --filter @metaverse-office/web build
pnpm --filter @metaverse-office/web perf:audit
```

Chrome instrumentation:

- Playwright Chromium, 1440x960 viewport.
- Chrome DevTools Protocol `Performance`, `Runtime`, and `HeapProfiler` domains.
- `requestAnimationFrame` frame sampler for the 60 second FPS window.
- `HeapProfiler.collectGarbage` before heap reads, including after each map switch.

Stress profile:

- Dense map: 80 active agents injected into `/office/overview`.
- Warmup: 2 seconds.
- FPS checkpoint: 60 seconds.
- Map switch checkpoint: 10 consecutive gateway switches.
- Raw run data: `.tmp/perf-audit/latest.json`.

Green zone:

- Average FPS >= 58.
- Long frames <= 5 per minute, where a long frame is `> 50ms`.
- Map switch P95 <= 500ms.
- Heap growth after 10 switches <= 20% after forced GC.

## Results

Run timestamp: `2026-05-14T07:08:59.471Z`.

| Checkpoint | Metric | Result | Status |
| --- | ---: | ---: | --- |
| FPS stability | Average FPS over 60s | 59.69 | Green |
| FPS stability | Long frames per minute | 0.00 | Green |
| FPS stability | Max frame | 50.0ms | Green |
| Memory leak check | Runtime heap before | 8.21 MB | Baseline |
| Memory leak check | Runtime heap after 60s FPS | 9.03 MB | Green |
| Memory leak check | Runtime heap after 10 switches | 9.51 MB | Green |
| Memory leak check | Heap growth after 10 switches | 15.73% | Green |
| Loading time | Switch average | 96.52ms | Green |
| Loading time | Switch P95 | 311.50ms | Green |

Heap samples after each switch, in runtime used MB:

```text
9.23, 9.30, 9.37, 9.42, 9.43, 9.44, 9.47, 9.47, 9.52, 9.51
```

The curve stays inside the 20% budget and falls on the last switch sample. The remaining growth is consistent with warmed Pixi/React/object-pool state, not unbounded per-switch growth.

## Implemented Changes

Rendering:

- Kept one Pixi `Application` and one `Viewport` alive across generated-map switches.
- Replaced full scene recreation with in-place map container sync.
- Kept generated layered maps as two raster sprites: `groundBase` plus y-sorted `propsTransparent` frames.
- Destroyed generated y-sort frame textures on map switch while preserving their shared texture source.
- Cached static agent chrome (`Graphics` and `Text`) as textures while leaving `AnimatedSprite` bodies live.
- Applied viewport culling to agents and y-sort prop sprites.
- Skipped animation updates for culled agents.
- Reused unchanged agent sprites and pooled retired sprites by render key.
- Forced Pixi canvas renderer for this scene after local profiling showed the visible WebGL path was the active bottleneck.

Loading and memory:

- Loaded only the active generated map texture set.
- Evicted non-active generated map textures through Pixi `Assets.unload`.
- Loaded only generated layers used by the renderer: `groundBase` and `propsTransparent`.
- Converted generated map PNG assets to WebP.
- Updated generated map URLs to WebP.

Asset compression:

```text
Generated PNG assets: 107 MB
Generated WebP assets: 25 MB
Generated WebP files: 77
```

No generated map PNG references remain in `apps/web/src` or `apps/web/scripts`.

## Current Bottleneck

No failing bottleneck remains under the 80-agent benchmark. The residual cost is the first cold map switch, which still completes at 311.50ms P95 against the 500ms budget.

The next likely bottleneck above this profile is Canvas draw cost for visible animated agent bodies. Keep the static chrome cached; do not reintroduce per-frame `Graphics`/`Text` redraw for every agent.

## Guardrails

- Core agent state, route selection, gateway traversal, and protocol payloads were not changed.
- Map filtering still prevents non-current-map agents from rendering.
- Tests cover map switching without Pixi app recreation, active-map lazy loading, sprite reuse, frame texture destruction, and existing movement/focus behavior.
