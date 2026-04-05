import type { ViewportClampPadding } from './viewport';

const topSelectors = ['.aitown-shell__brand', '.aitown-shell__stats', '.aitown-panel__topline > span', '.aitown-panel__toolbar'];
const rightSelectors = [
  '.aitown-shell__stats',
  '.aitown-panel__toolbar',
  '.aitown-panel__topline > span:last-child',
  '.aitown-hub-sheet',
  '.aitown-watch-overlay'
];
const textContributorSelectors = [...new Set(topSelectors)];

function resolveViewportClampPaddingRoot(host: HTMLDivElement) {
  const panel = host.closest('.aitown-panel--game');
  const shell = host.closest('.aitown-shell');

  return shell instanceof HTMLElement ? shell : panel;
}

export function isViewportClampPaddingTextContributor(host: HTMLDivElement, node: Node | null) {
  const overlayRoot = resolveViewportClampPaddingRoot(host);
  const element = node instanceof Element ? node : node?.parentElement;

  if (!(overlayRoot instanceof HTMLElement) || !(element instanceof Element) || !overlayRoot.contains(element)) {
    return false;
  }

  return textContributorSelectors.some((selector) => {
    const contributor = element.closest(selector);

    return contributor instanceof Element && overlayRoot.contains(contributor);
  });
}

export function resolveViewportClampPadding(host: HTMLDivElement): ViewportClampPadding {
  const overlayRoot = resolveViewportClampPaddingRoot(host);

  if (!(overlayRoot instanceof HTMLElement)) {
    return {};
  }

  const hostRect = host.getBoundingClientRect();
  const maxNarrowOverlayWidth = hostRect.width * 0.75;
  const edgeTouchTolerance = 24;
  let top = 0;
  let right = 0;

  for (const selector of topSelectors) {
    for (const element of overlayRoot.querySelectorAll<HTMLElement>(selector)) {
      const rect = element.getBoundingClientRect();
      const intersectsHost =
        rect.right > hostRect.left &&
        rect.left < hostRect.right &&
        rect.bottom > hostRect.top &&
        rect.top < hostRect.bottom;
      const touchesLeft = rect.left <= hostRect.left + edgeTouchTolerance;
      const touchesRight = rect.right >= hostRect.right - edgeTouchTolerance;

      if (!intersectsHost || !touchesLeft || !touchesRight) {
        continue;
      }

      top = Math.max(top, Math.min(hostRect.height, Math.max(0, rect.bottom - hostRect.top)));
    }
  }

  for (const selector of rightSelectors) {
    const element = overlayRoot.querySelector<HTMLElement>(selector);

    if (!element) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    const intersectsHost =
      rect.right > hostRect.left &&
      rect.left < hostRect.right &&
      rect.bottom > hostRect.top &&
      rect.top < hostRect.bottom;
    const touchesRight = rect.right >= hostRect.right - edgeTouchTolerance;
    const allowWideOverlay = selector === '.aitown-hub-sheet';

    if (!intersectsHost || !touchesRight || (!allowWideOverlay && rect.width > maxNarrowOverlayWidth)) {
      continue;
    }

    right = Math.max(right, Math.min(hostRect.width, Math.max(0, hostRect.right - rect.left)));
  }

  return { right, top };
}
