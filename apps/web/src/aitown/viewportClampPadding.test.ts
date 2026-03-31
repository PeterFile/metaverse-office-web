import { describe, expect, it } from 'vitest';

import { resolveViewportClampPadding } from './viewportClampPadding';

describe('resolveViewportClampPadding', () => {
  it('keeps split top chrome from creating a global top gutter while still extending right travel', () => {
    document.body.innerHTML = `
      <section class="aitown-panel aitown-panel--game" id="panel">
        <div class="aitown-shell__brand" id="brand"></div>
        <div class="aitown-panel__toolbar" id="toolbar"></div>
        <div class="aitown-shell__stats" id="stats"></div>
        <div class="aitown-world__host" id="host"></div>
      </section>
    `;

    const host = document.getElementById('host') as HTMLDivElement;
    const brand = document.getElementById('brand') as HTMLDivElement;
    const toolbar = document.getElementById('toolbar') as HTMLDivElement;
    const stats = document.getElementById('stats') as HTMLDivElement;

    host.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 } as DOMRect);
    brand.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 260, bottom: 96, width: 260, height: 96 } as DOMRect);
    toolbar.getBoundingClientRect = () =>
      ({ left: 0, top: 40, right: 260, bottom: 96, width: 260, height: 56 } as DOMRect);
    stats.getBoundingClientRect = () =>
      ({ left: 760, top: 80, right: 1000, bottom: 220, width: 240, height: 140 } as DOMRect);

    expect(resolveViewportClampPadding(host)).toEqual({
      top: 0,
      right: 240
    });
  });

  it('includes the hub sheet when it overlays the world from the shell root', () => {
    document.body.innerHTML = `
      <main class="aitown-shell">
        <section class="aitown-panel aitown-panel--game">
          <div class="aitown-world__host" id="host"></div>
        </section>
        <div class="aitown-hub-sheet" id="hub"></div>
      </main>
    `;

    const host = document.getElementById('host') as HTMLDivElement;
    const hub = document.getElementById('hub') as HTMLDivElement;

    host.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 } as DOMRect);
    hub.getBoundingClientRect = () =>
      ({ left: 620, top: 0, right: 1000, bottom: 800, width: 380, height: 800 } as DOMRect);

    expect(resolveViewportClampPadding(host)).toEqual({
      top: 0,
      right: 380
    });
  });

  it('keeps right padding for a narrow host when the right-anchored Hub sheet exceeds 75% of the host width', () => {
    document.body.innerHTML = `
      <main class="aitown-shell">
        <section class="aitown-panel aitown-panel--game">
          <div class="aitown-world__host" id="host"></div>
        </section>
        <div class="aitown-hub-sheet" id="hub"></div>
      </main>
    `;

    const host = document.getElementById('host') as HTMLDivElement;
    const hub = document.getElementById('hub') as HTMLDivElement;

    host.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 320, bottom: 640, width: 320, height: 640 } as DOMRect);
    hub.getBoundingClientRect = () =>
      ({ left: 40, top: 0, right: 320, bottom: 640, width: 280, height: 640 } as DOMRect);

    expect(resolveViewportClampPadding(host)).toEqual({
      top: 0,
      right: 280
    });
  });

  it('ignores wide overlays that should not steal right-edge travel', () => {
    document.body.innerHTML = `
      <section class="aitown-panel aitown-panel--game">
        <div class="aitown-shell__stats" id="stats"></div>
        <div class="aitown-world__host" id="host"></div>
      </section>
    `;

    const host = document.getElementById('host') as HTMLDivElement;
    const stats = document.getElementById('stats') as HTMLDivElement;

    host.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 } as DOMRect);
    stats.getBoundingClientRect = () =>
      ({ left: 180, top: 80, right: 1000, bottom: 600, width: 820, height: 520 } as DOMRect);

    expect(resolveViewportClampPadding(host)).toEqual({
      top: 0,
      right: 0
    });
  });

  it('ignores the full-width mobile selected-watch overlay so bottom captions do not create right clamp padding', () => {
    document.body.innerHTML = `
      <main class="aitown-shell">
        <section class="aitown-panel aitown-panel--game">
          <div class="aitown-world__host" id="host"></div>
          <section class="aitown-watch-overlay" id="overlay" aria-label="Selected watch links"></section>
        </section>
      </main>
    `;

    const host = document.getElementById('host') as HTMLDivElement;
    const overlay = document.getElementById('overlay') as HTMLDivElement;

    host.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 390, bottom: 844, width: 390, height: 844 } as DOMRect);
    overlay.getBoundingClientRect = () =>
      ({ left: 10, top: 632, right: 380, bottom: 834, width: 370, height: 202 } as DOMRect);

    expect(resolveViewportClampPadding(host)).toEqual({
      top: 0,
      right: 0
    });
  });

  it('does not reserve default left or bottom travel even if the status legend spans the bottom edge', () => {
    document.body.innerHTML = `
      <main class="aitown-shell">
        <section class="aitown-panel aitown-panel--game">
          <div class="aitown-world__host" id="host"></div>
          <div class="aitown-status-legend" id="legend"></div>
        </section>
      </main>
    `;

    const host = document.getElementById('host') as HTMLDivElement;
    const legend = document.getElementById('legend') as HTMLDivElement;

    host.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 } as DOMRect);
    legend.getBoundingClientRect = () =>
      ({ left: 0, top: 620, right: 1000, bottom: 800, width: 1000, height: 180 } as DOMRect);

    expect(resolveViewportClampPadding(host)).toEqual({
      top: 0,
      right: 0
    });
  });

  it('extends right travel for the selected-watch caption overlay without reserving bottom travel', () => {
    document.body.innerHTML = `
      <main class="aitown-shell">
        <section class="aitown-panel aitown-panel--game">
          <div class="aitown-world__host" id="host"></div>
          <div class="aitown-watch-overlay" id="overlay"></div>
        </section>
      </main>
    `;

    const host = document.getElementById('host') as HTMLDivElement;
    const overlay = document.getElementById('overlay') as HTMLDivElement;

    host.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 } as DOMRect);
    overlay.getBoundingClientRect = () =>
      ({ left: 700, top: 560, right: 1000, bottom: 800, width: 300, height: 240 } as DOMRect);

    expect(resolveViewportClampPadding(host)).toEqual({
      top: 0,
      right: 300
    });
  });
});
