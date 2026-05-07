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

  it('renders Hub as a compact bottom deck that preserves the primary world drag lane', () => {
    expect(styles).toMatch(/\.aitown-hub-overlay\s*\{[\s\S]*?position:\s*fixed;/);
    expect(styles).toMatch(/\.aitown-hub-overlay\s*\{[\s\S]*?align-items:\s*flex-end;[\s\S]*?justify-content:\s*center;/);
    expect(styles).toMatch(
      /\.aitown-hub-sheet\s*\{[\s\S]*?width:\s*min\(1120px, calc\(100vw - 24px\)\);[\s\S]*?max-height:\s*min\(220px, 23dvh\);[\s\S]*?overflow:\s*hidden;/
    );
    expect(styles).toMatch(/\.aitown-hub-sheet__body\s*\{[\s\S]*?display:\s*grid;[\s\S]*?overflow:\s*hidden;/);
    expect(styles).toMatch(/\.aitown-hub-sheet \.aitown-panel--details\s*\{[\s\S]*?grid-auto-flow:\s*column;[\s\S]*?overflow-x:\s*auto;[\s\S]*?overflow-y:\s*hidden;/);
    expect(styles).toMatch(
      /\.aitown-hub-sheet \.aitown-details__section--active-queue\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;[\s\S]*?min-height:\s*0;/
    );
    expect(styles).toMatch(/\.aitown-hub-sheet \.aitown-details__section--active-queue > div\s*\{[\s\S]*?grid-template-columns:\s*auto minmax\(0, 1fr\);/);
    expect(styles).toMatch(/\.aitown-hub-sheet \.aitown-details__section--active-queue \.aitown-records\s*\{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?overflow-y:\s*auto;/);
    expect(styles).toMatch(/\.aitown-hub-sheet \.aitown-details__section--active-queue \.aitown-queue-record__meta\s*\{[\s\S]*?display:\s*block;[\s\S]*?text-overflow:\s*ellipsis;/);
    expect(styles).toMatch(/\.aitown-hub-sheet \.aitown-record\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  });

  it('keeps browser pinch zoom available on the fullscreen world host and canvas', () => {
    expect(styles).toMatch(/\.aitown-world__host\s*\{[\s\S]*?touch-action:\s*pinch-zoom;/);
    expect(styles).toMatch(/\.aitown-world__host canvas\s*\{[\s\S]*?touch-action:\s*pinch-zoom;/);
  });

  it('keeps header toolbar and HUD in one chrome flow instead of competing absolute offsets', () => {
    expect(styles).toMatch(
      /\.aitown-panel__chrome\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?grid-template-areas:\s*[\s\S]*?'header toolbar'[\s\S]*?'hud hud';[\s\S]*?pointer-events:\s*none;/
    );
    expect(styles).toMatch(/\.aitown-shell__header\s*\{[\s\S]*?grid-area:\s*header;/);
    expect(styles).toMatch(/\.aitown-panel__hud-top\s*\{[\s\S]*?grid-area:\s*hud;[\s\S]*?pointer-events:\s*none;/);
    expect(styles).toMatch(
      /\.aitown-panel__toolbar\s*\{[\s\S]*?grid-area:\s*toolbar;[\s\S]*?display:\s*flex;[\s\S]*?pointer-events:\s*auto;/
    );
    expect(styles).not.toMatch(/\.aitown-panel__toolbar\s*\{[^}]*position:\s*absolute;/);
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
    expect(styles).toMatch(/\.aitown-details__summary\s*\{[\s\S]*?max-height:\s*min\(22dvh, 180px\);[\s\S]*?overflow-y:\s*auto;/);
  });

  it('caps portrait chrome so mobile center drag remains a world lane', () => {
    expect(styles).toMatch(
      /@media \(max-width:\s*720px\)\s*\{[\s\S]*?\.aitown-panel__chrome\s*\{[\s\S]*?grid-template-areas:\s*[\s\S]*?'toolbar'[\s\S]*?'header'[\s\S]*?'hud';[\s\S]*?max-height:\s*min\(34dvh, 288px\);[\s\S]*?overflow-y:\s*auto;/
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
