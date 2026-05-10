import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

describe('AI Town shell styles', () => {
  it('loads the AI Town fonts and frame assets', () => {
    expect(styles).toContain("@font-face {\n  font-family: 'Upheaval Pro';");
    expect(styles).toContain("@font-face {\n  font-family: 'VCR OSD Mono';");
    expect(styles).toContain("url('/ai-town/assets/ui/frame.svg')");
    expect(styles).toContain("url('/ai-town/assets/background.webp')");
  });

  it('uses a framed full-screen shell while preserving responsive collapse rules', () => {
    expect(styles).toMatch(
      /html,[\s\S]*?body,[\s\S]*?#root\s*\{[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*100%;/
    );
    expect(styles).toMatch(/body\s*\{[\s\S]*?overflow:\s*hidden;/);
    expect(styles).toMatch(/\.aitown-shell\s*\{[\s\S]*?height:\s*100dvh;[\s\S]*?overflow:\s*hidden;/);
    expect(styles).toMatch(
      /\.aitown-shell__layout--fullscreen\s*\{[\s\S]*?display:\s*block;[\s\S]*?height:\s*100%;/
    );
    expect(styles).toMatch(
      /\.aitown-panel--game-fullscreen\s*\{[\s\S]*?width:\s*100%;[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;/
    );
    expect(styles).toMatch(
      /@media \(max-width:\s*1080px\)\s*\{[\s\S]*?\.aitown-shell__layout\s*\{[\s\S]*?display:\s*block;[\s\S]*?width:\s*100%;/
    );
  });

  it('keeps the game panel and details panel on the AI Town visual language', () => {
    expect(styles).toMatch(
      /\.aitown-panel--game\s*\{[\s\S]*?border-image-source:\s*url\('\/ai-town\/assets\/ui\/frame\.svg'\);/
    );
    expect(styles).toMatch(
      /\.aitown-button\s*\{[\s\S]*?border-image-source:\s*url\('\/ai-town\/assets\/ui\/button\.svg'\);/
    );
    expect(styles).toMatch(
      /\.aitown-details__summary\s*\{[\s\S]*?border-image-source:\s*url\('\/ai-town\/assets\/ui\/desc\.svg'\);/
    );
  });

  it('uses thin RimWorld-style chrome instead of coarse nested frames', () => {
    expect(styles).toMatch(/--aitown-frame-width:\s*clamp\(2px, 0\.35vw, 4px\);/);
    expect(styles).toMatch(/--aitown-box-border:\s*clamp\(1px, 0\.25vw, 3px\);/);
    expect(styles).toMatch(/--aitown-token-border:\s*1px;/);
    expect(styles).toMatch(/\.aitown-panel--details\s*\{[^}]*border-width:\s*var\(--aitown-box-border\);/);
    expect(styles).toMatch(/\.aitown-details__summary\s*\{[^}]*border-width:\s*var\(--aitown-box-border\);/);
    expect(styles).not.toContain('border-width: clamp(24px, 5vw, 46px);');
    expect(styles).not.toContain('border-width: clamp(10px, 1.4vw, 16px);');
  });

  it('renders Hub as a RimWorld-style readable bottom-left window with structured IA records', () => {
    expect(styles).toMatch(/\.aitown-hub-overlay\s*\{[\s\S]*?position:\s*fixed;/);
    expect(styles).toMatch(/\.aitown-hub-overlay\s*\{[\s\S]*?align-items:\s*flex-end;[\s\S]*?justify-content:\s*flex-start;/);
    expect(styles).toMatch(
      /\.aitown-hub-sheet\s*\{[\s\S]*?width:\s*min\(860px, calc\(100vw - 32px\)\);[\s\S]*?height:\s*clamp\(420px, 64dvh, 560px\);[\s\S]*?max-height:\s*calc\(100dvh - var\(--aitown-category-bar-reserve\) - \(var\(--aitown-edge\) \* 4\)\);[\s\S]*?font-family:\s*var\(--aitown-readable-font\);/
    );
    expect(styles).toMatch(/\.aitown-hub-drilldown__panel--crew\s*\{[\s\S]*?overflow-y:\s*auto;/);
    expect(styles).toMatch(/\.aitown-hub-sheet \.aitown-panel--details\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;[\s\S]*?overflow:\s*visible;/);
    expect(styles).toMatch(
      /\.aitown-hub-sheet \.aitown-panel--details-selected-agent\.aitown-panel--details-category-supervision\s*\{[\s\S]*?height:\s*100%;[\s\S]*?max-height:\s*100%;[\s\S]*?overflow-y:\s*auto;/
    );
    expect(styles).toMatch(/\.aitown-hub-sheet \.aitown-details__section--active-queue\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;/);
    expect(styles).toMatch(/\.aitown-hub-sheet \.aitown-details__section--active-queue \.aitown-queue-record__button\s*\{[\s\S]*?max-height:\s*none;[\s\S]*?overflow:\s*visible;/);
    expect(styles).toMatch(/\.aitown-hub-sheet \.aitown-record:not\(\.aitown-evidence-card\)\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(auto-fit, minmax\(160px, 1fr\)\);[\s\S]*?overflow:\s*visible;/);
    expect(styles).toMatch(/\.aitown-hub-sheet \.aitown-record:not\(\.aitown-evidence-card\) > strong,[\s\S]*?\.aitown-hub-sheet \.aitown-record:not\(\.aitown-evidence-card\) > header\s*\{[\s\S]*?grid-column:\s*1 \/ -1;/);
    expect(styles).toMatch(/\.aitown-hub-sheet \.aitown-record:not\(\.aitown-evidence-card\) > span:first-of-type\s*\{[\s\S]*?grid-column:\s*1 \/ -1;/);
    expect(styles).toMatch(/\.aitown-hub-sheet \.aitown-record:not\(\.aitown-evidence-card\) > span:not\(:first-of-type\)\s*\{[\s\S]*?border-left:\s*2px solid rgba\(139, 233, 213, 0\.26\);/);
    expect(styles).toMatch(/\.aitown-hub-sheet \.aitown-record span:not\(:first-child\)\s*\{[\s\S]*?white-space:\s*normal;/);
    expect(styles).toMatch(/\.aitown-hub-sheet \.aitown-details__section > h3\s*\{[\s\S]*?padding-bottom:\s*5px;[\s\S]*?border-bottom:\s*1px solid rgba\(245, 217, 141, 0\.22\);/);
    expect(styles).toMatch(/\.aitown-hub-sheet \.aitown-details__section--active-queue > div\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-wrap:\s*wrap;/);
    expect(styles).toMatch(/\.aitown-hub-sheet \.aitown-details__section--active-queue \.aitown-queue-record\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(auto-fit, minmax\(180px, 1fr\)\);/);
    expect(styles).toMatch(/\.aitown-hub-sheet \.aitown-details__section--active-queue \.aitown-queue-record__meta\s*\{[\s\S]*?border-left:\s*2px solid rgba\(139, 233, 213, 0\.26\);[\s\S]*?white-space:\s*normal;/);
    expect(styles).toMatch(/\.aitown-hub-sheet \.aitown-shared-memory-backlink-chips\s*\{[\s\S]*?max-height:\s*min\(24dvh, 184px\);[\s\S]*?overflow-y:\s*auto;/);
    expect(styles).toMatch(/data-active-hub-category='crew'[\s\S]*?aitown-details__section--hub-crew/);
    expect(styles).toMatch(/data-active-hub-category='queue'[\s\S]*?aitown-details__section--hub-queue/);
    expect(styles).toMatch(/data-active-hub-category='supervision'[\s\S]*?aitown-details__section--hub-supervision/);
    expect(styles).toMatch(/data-active-hub-category='evidence'[\s\S]*?aitown-details__section--hub-evidence/);
    expect(styles).toMatch(/data-active-hub-category='replay'[\s\S]*?aitown-details__section--hub-replay/);
    expect(styles).toMatch(/data-active-hub-category='memory'[\s\S]*?aitown-details__section--hub-memory/);
  });

  it('keeps browser pinch zoom available on the fullscreen world host and canvas', () => {
    expect(styles).toMatch(/\.aitown-world__host\s*\{[\s\S]*?touch-action:\s*pinch-zoom;/);
    expect(styles).toMatch(/\.aitown-world__host canvas\s*\{[\s\S]*?touch-action:\s*pinch-zoom;/);
  });

  it('keeps the category menu as a bottom game bar while top HUD stays in one chrome flow', () => {
    expect(styles).toMatch(
      /\.aitown-panel__chrome\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?grid-template-areas:\s*[\s\S]*?'header'[\s\S]*?'hud';[\s\S]*?pointer-events:\s*none;/
    );
    expect(styles).toMatch(/\.aitown-shell__header\s*\{[\s\S]*?grid-area:\s*header;/);
    expect(styles).toMatch(/\.aitown-panel__hud-top\s*\{[\s\S]*?grid-area:\s*hud;[\s\S]*?pointer-events:\s*none;/);
    expect(styles).toMatch(/\.aitown-shell\s*\{[\s\S]*?--aitown-category-bar-reserve:\s*58px;/);
    expect(styles).toMatch(
      /@media \(max-width:\s*1080px\)\s*\{[\s\S]*?\.aitown-shell\s*\{[\s\S]*?--aitown-category-bar-reserve:\s*140px;/
    );
    expect(styles).toMatch(
      /@media \(max-width:\s*720px\)\s*\{[\s\S]*?\.aitown-shell\s*\{[\s\S]*?--aitown-category-bar-reserve:\s*112px;/
    );
    expect(styles).toMatch(
      /\.aitown-hub-category-bar\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?bottom:\s*var\(--aitown-edge\);[\s\S]*?z-index:\s*30;[\s\S]*?display:\s*grid;[\s\S]*?pointer-events:\s*auto;/
    );
    expect(styles).toMatch(/\.aitown-hub-category-bar__button\.is-active\s*\{[\s\S]*?border-color:\s*#f3e4bf;/);
    expect(styles).not.toMatch(/\.aitown-panel__chrome\s*\{[\s\S]*?'header toolbar'/);
  });

  it('collects viewport, zones, and evidence into one passive HUD cluster', () => {
    expect(styles).toMatch(/\.aitown-panel__signal-cluster\s*\{[\s\S]*?display:\s*grid;[\s\S]*?pointer-events:\s*none;/);
    expect(styles).toMatch(/\.aitown-panel__signal-cluster\[open\]\s*\{[^}]*pointer-events:\s*none;/);
    expect(styles).toMatch(/\.aitown-panel__signal-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/);
    expect(styles).toMatch(/\.aitown-panel__hud-popover-summary\s*\{[^}]*pointer-events:\s*auto;/);
    expect(styles).toMatch(/\.aitown-focus-chip\s*\{[\s\S]*?pointer-events:\s*auto;/);
  });

  it('keeps the Live Focus reason line from expanding the draggable world safe lane', () => {
    expect(styles).toMatch(/\.aitown-panel__topline > span,[\s\S]*?\.aitown-panel__topline-popover\s*\{[\s\S]*?min-width:\s*0;/);
    expect(styles).toContain('.aitown-panel__topline > .aitown-panel__topline-card--live-focus {\n  max-width: min(42ch, 46%);\n}');
    expect(styles).toContain(
      '.aitown-panel__topline-copy--live-focus-summary {\n  display: block;\n  max-width: 100%;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}'
    );
  });

  it('bounds dense colony-sim HUD surfaces with wrapping and internal scroll instead of widening the viewport', () => {
    expect(styles).toMatch(/\.aitown-shell\s*\{[\s\S]*?max-width:\s*100vw;/);
    expect(styles).toMatch(/\.aitown-shell__stats\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(58px, 1fr\)\);[\s\S]*?min-width:\s*0;/);
    expect(styles).toMatch(/\.aitown-panel__focus-chips\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%;/);
    expect(styles).toMatch(/\.aitown-panel__signal-panel \.aitown-panel__focus-chips\s*\{[\s\S]*?max-height:\s*min\(18dvh, 156px\);[\s\S]*?overflow-y:\s*auto;[\s\S]*?overscroll-behavior:\s*contain;/);
    expect(styles).toMatch(/\.aitown-status-legend\s*\{[\s\S]*?overflow-y:\s*auto;[\s\S]*?scrollbar-gutter:\s*stable;/);
    expect(styles).toMatch(/\.aitown-selected-agent-peek\s*\{[\s\S]*?overflow-y:\s*auto;[\s\S]*?overscroll-behavior:\s*contain;/);
    expect(styles).toMatch(/\.aitown-selected-agent-peek__facts\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(auto-fit, minmax\(132px, 1fr\)\);[\s\S]*?max-height:\s*132px;[\s\S]*?overflow-y:\s*auto;/);
    expect(styles).toMatch(/\.aitown-hub-focus-ribbon__facts\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(auto-fit, minmax\(118px, 1fr\)\);[\s\S]*?max-height:\s*108px;[\s\S]*?overflow-y:\s*auto;/);
    expect(styles).toMatch(/\.aitown-details__summary\s*\{[\s\S]*?max-height:\s*min\(22dvh, 180px\);[\s\S]*?overflow-y:\s*auto;/);
  });

  it('caps portrait chrome so mobile center drag remains a world lane', () => {
    expect(styles).toMatch(
      /@media \(max-width:\s*720px\)\s*\{[\s\S]*?\.aitown-panel__chrome\s*\{[\s\S]*?grid-template-areas:\s*[\s\S]*?'header'[\s\S]*?'hud';[\s\S]*?max-height:\s*min\(34dvh, 288px\);[\s\S]*?overflow-y:\s*auto;/
    );
    expect(styles).toMatch(
      /@media \(max-width:\s*720px\)\s*\{[\s\S]*?\.aitown-shell__eyebrow,[\s\S]*?\.aitown-shell__brand p\s*\{[\s\S]*?display:\s*none;/
    );
    expect(styles).toMatch(
      /@media \(max-width:\s*720px\)\s*\{[\s\S]*?\.aitown-panel__signal-cluster\s*\{[\s\S]*?display:\s*none;/
    );
    expect(styles).toMatch(
      /@media \(max-width:\s*720px\)\s*\{[\s\S]*?\.aitown-panel__hot-zone-focus\s*\{[\s\S]*?display:\s*none;/
    );
    expect(styles).toMatch(
      /@media \(max-width:\s*720px\)\s*\{[\s\S]*?\.aitown-button\s*\{[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/
    );
  });
});
