export const HUB_FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]'
].join(', ');

function isHiddenBySelectedAgentDrilldown(element: HTMLElement) {
  const panel = element.closest<HTMLElement>('.aitown-panel--details[data-selected-agent-drilldown-tab]');
  const activeTab = panel?.dataset.selectedAgentDrilldownTab;
  if (!panel || !activeTab) {
    return false;
  }

  const section = element.closest<HTMLElement>('.aitown-details__section');
  if (section && panel.contains(section)) {
    return !section.classList.contains(`aitown-details__section--selected-${activeTab}`);
  }

  const selectedAgentSummaryChrome = element.closest<HTMLElement>(
    '.aitown-details__head, .aitown-details__summary, .aitown-details__grid'
  );
  return Boolean(selectedAgentSummaryChrome && selectedAgentSummaryChrome.parentElement === panel && activeTab !== 'now');
}

export function isHubElementVisible(element: HTMLElement) {
  if (element.matches(':disabled')) {
    return false;
  }

  const win = element.ownerDocument.defaultView;
  let current: HTMLElement | null = element;

  while (current) {
    if (
      current.hidden ||
      current.hasAttribute('inert') ||
      current.getAttribute('aria-hidden') === 'true' ||
      isHiddenBySelectedAgentDrilldown(current)
    ) {
      return false;
    }

    const style = win?.getComputedStyle(current);
    if (style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse') {
      return false;
    }

    current = current.parentElement;
  }

  return true;
}

export function getHubFocusableElements(container: ParentNode) {
  return Array.from(container.querySelectorAll<HTMLElement>(HUB_FOCUSABLE_SELECTOR)).filter(isHubElementVisible);
}
