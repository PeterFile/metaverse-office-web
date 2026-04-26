import { describe, expect, it } from 'vitest';

import { getHubFocusableElements } from './hubFocus';

describe('getHubFocusableElements', () => {
  it('returns dialog focusables in DOM order while skipping hidden elements', () => {
    document.body.innerHTML = `
      <section>
        <button aria-label="Close Hub">Close Hub</button>
        <button aria-hidden="true" aria-label="Hidden control">Hidden control</button>
        <a href="#workflow" aria-label="Workflow tab">Workflow</a>
        <input type="hidden" aria-label="Hidden input" />
        <div style="display: none;">
          <button aria-label="Hidden tab panel action">Hidden tab panel action</button>
        </div>
        <section hidden>
          <button aria-label="Hidden section action">Hidden section action</button>
        </section>
        <button aria-label="Open incident correlation corr-revenue-handoff">corr-revenue-handoff</button>
      </section>
    `;

    expect(
      getHubFocusableElements(document.body).map(
        (element) => element.getAttribute('aria-label') ?? element.textContent?.trim() ?? element.tagName.toLowerCase()
      )
    ).toEqual(['Close Hub', 'Workflow tab', 'Open incident correlation corr-revenue-handoff']);
  });

  it('skips controls in inactive selected-agent drilldown sections and summary chrome', () => {
    document.body.innerHTML = `
      <aside class="aitown-panel--details" data-selected-agent-drilldown-tab="evidence">
        <div class="aitown-details__head">
          <button aria-label="Clear">Clear</button>
        </div>
        <section class="aitown-details__section aitown-details__section--selected-now">
          <button aria-label="Open operation correlation corr-revenue-handoff">corr-revenue-handoff</button>
        </section>
        <section class="aitown-details__section aitown-details__section--selected-evidence">
          <button aria-label="Jump to shared memory artifact /tmp/evidence.md">Jump</button>
        </section>
        <section class="aitown-details__section aitown-details__section--selected-replay">
          <button aria-label="Open replay correlation corr-revenue-handoff">Replay</button>
        </section>
      </aside>
    `;

    expect(
      getHubFocusableElements(document.body).map(
        (element) => element.getAttribute('aria-label') ?? element.textContent?.trim() ?? element.tagName.toLowerCase()
      )
    ).toEqual(['Jump to shared memory artifact /tmp/evidence.md']);
  });
});
