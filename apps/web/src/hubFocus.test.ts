import { describe, expect, it } from 'vitest';

import { getHubFocusableElements } from './hubFocus';

describe('getHubFocusableElements', () => {
  it('returns dialog focusables in DOM order while skipping aria-hidden elements', () => {
    document.body.innerHTML = `
      <section>
        <button aria-label="Close Hub">Close Hub</button>
        <button aria-hidden="true" aria-label="Hidden control">Hidden control</button>
        <a href="#workflow" aria-label="Workflow tab">Workflow</a>
        <input type="hidden" aria-label="Hidden input" />
        <button aria-label="Open incident correlation corr-revenue-handoff">corr-revenue-handoff</button>
      </section>
    `;

    expect(
      getHubFocusableElements(document.body).map(
        (element) => element.getAttribute('aria-label') ?? element.textContent?.trim() ?? element.tagName.toLowerCase()
      )
    ).toEqual(['Close Hub', 'Workflow tab', 'Open incident correlation corr-revenue-handoff']);
  });
});
