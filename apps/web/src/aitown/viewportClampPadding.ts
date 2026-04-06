import type { ViewportClampPadding } from './viewport';

const topSelectors = ['.aitown-shell__brand', '.aitown-shell__stats', '.aitown-panel__topline > span', '.aitown-panel__toolbar'];
const rightSelectors = [
  '.aitown-shell__stats',
  '.aitown-panel__toolbar',
  '.aitown-panel__topline > span:last-child',
  '.aitown-hub-sheet',
  '.aitown-watch-overlay'
];
const clampContributorSelectors = [...new Set([...topSelectors, ...rightSelectors])];
const subtreeMutationContributorSelectors = [
  '.aitown-shell__brand',
  '.aitown-shell__stats',
  '.aitown-panel__topline',
  '.aitown-panel__toolbar'
];
const fixedWidthContributorSelectors = ['.aitown-hub-sheet', '.aitown-watch-overlay'];
const textContributorSelectors = [...new Set(topSelectors)];
const clampContributorRootClasses = new Set([
  'aitown-shell__brand',
  'aitown-shell__stats',
  'aitown-panel__topline',
  'aitown-panel__toolbar',
  'aitown-hub-sheet',
  'aitown-watch-overlay'
]);

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

function containsViewportClampPaddingContributor(node: Node | null) {
  if (!(node instanceof Element)) {
    return false;
  }

  return clampContributorSelectors.some((selector) => node.matches(selector) || node.querySelector(selector));
}

function isWithinViewportClampPaddingRoot(overlayRoot: HTMLElement, node: Node | null) {
  const element = node instanceof Element ? node : node?.parentElement;

  return element instanceof Element && overlayRoot.contains(element);
}

function touchesViewportClampPaddingSubtreeContributor(overlayRoot: HTMLElement, node: Node | null) {
  const element = node instanceof Element ? node : node?.parentElement;

  if (!(element instanceof Element) || !overlayRoot.contains(element)) {
    return false;
  }

  return subtreeMutationContributorSelectors.some((selector) => {
    const contributor = element.closest(selector);

    return contributor instanceof Element && overlayRoot.contains(contributor);
  });
}

function isFixedWidthViewportClampContributorRoot(overlayRoot: HTMLElement, node: Node | null) {
  const element = node instanceof Element ? node : node?.parentElement;

  if (!(element instanceof Element) || !overlayRoot.contains(element)) {
    return false;
  }

  return fixedWidthContributorSelectors.some((selector) => element.matches(selector));
}

function mutationTargetHadClampContributorRootClass(overlayRoot: HTMLElement, mutation: MutationRecord) {
  if (mutation.type !== 'attributes' || mutation.attributeName !== 'class') {
    return false;
  }

  const element = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;

  if (!(element instanceof Element) || !overlayRoot.contains(element) || !mutation.oldValue) {
    return false;
  }

  return mutation.oldValue.split(/\s+/).some((className) => clampContributorRootClasses.has(className));
}

export function isViewportClampPaddingMutationContributor(host: HTMLDivElement, mutation: MutationRecord) {
  const overlayRoot = resolveViewportClampPaddingRoot(host);

  if (!(overlayRoot instanceof HTMLElement)) {
    return false;
  }

  if (mutation.type === 'characterData') {
    return isViewportClampPaddingTextContributor(host, mutation.target);
  }

  if (mutation.type === 'attributes') {
    return (
      touchesViewportClampPaddingSubtreeContributor(overlayRoot, mutation.target)
      || isFixedWidthViewportClampContributorRoot(overlayRoot, mutation.target)
      || mutationTargetHadClampContributorRootClass(overlayRoot, mutation)
    );
  }

  if (mutation.type !== 'childList' || !isWithinViewportClampPaddingRoot(overlayRoot, mutation.target)) {
    return false;
  }

  if (touchesViewportClampPaddingSubtreeContributor(overlayRoot, mutation.target)) {
    return true;
  }

  return Array.from(mutation.addedNodes).some(containsViewportClampPaddingContributor)
    || Array.from(mutation.removedNodes).some(containsViewportClampPaddingContributor);
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
