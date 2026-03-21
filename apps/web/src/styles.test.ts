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

  it('renders Hub as a dismissible overlay instead of a permanent side rail', () => {
    expect(styles).toMatch(/\.aitown-hub-overlay\s*\{[\s\S]*?position:\s*fixed;/);
    expect(styles).toMatch(/\.aitown-hub-overlay\s*\{[\s\S]*?justify-content:\s*flex-end;/);
    expect(styles).toMatch(/\.aitown-hub-sheet\s*\{[\s\S]*?width:\s*min\(430px, 100vw\);[\s\S]*?height:\s*100dvh;/);
  });

  it('keeps browser pinch zoom available on the fullscreen world host and canvas', () => {
    expect(styles).toMatch(/\.aitown-world__host\s*\{[\s\S]*?touch-action:\s*pinch-zoom;/);
    expect(styles).toMatch(/\.aitown-world__host canvas\s*\{[\s\S]*?touch-action:\s*pinch-zoom;/);
  });
});
