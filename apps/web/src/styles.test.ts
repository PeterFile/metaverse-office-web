import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

describe('operator shell responsive styles', () => {
  it('stacks the workflow shell before the desktop map would overflow while keeping the existing mobile collapse', () => {
    expect(styles).toContain('grid-template-columns: repeat(6, minmax(120px, 1fr));');
    expect(styles).toMatch(
      /@media \(max-width: 1175px\)\s*\{[\s\S]*?\.app-shell__content\s*\{\s*grid-template-columns:\s*1fr;\s*\}[\s\S]*?\.workflow-panel\s*\{\s*position:\s*static;\s*\}/
    );
    expect(styles).toMatch(
      /@media \(max-width: 840px\)\s*\{[\s\S]*?\.office-grid\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);\s*\}/
    );
  });

  it('wraps evidence metadata and action pills so long refs do not force horizontal overflow', () => {
    expect(styles).toMatch(/\.record-item__header\s*\{[\s\S]*?flex-wrap:\s*wrap;/);
    expect(styles).toMatch(/\.record-item__meta\s*\{[\s\S]*?overflow-wrap:\s*anywhere;/);
    expect(styles).toMatch(
      /\.token-pill,\s*\.correlation-chip,\s*\.correlation-chip--muted\s*\{[\s\S]*?max-width:\s*100%;[\s\S]*?white-space:\s*normal;[\s\S]*?overflow-wrap:\s*anywhere;/
    );
    expect(styles).toMatch(/\.detail-card \.record-list\s*\{[\s\S]*?gap:\s*0\.5rem;/);
    expect(styles).toMatch(/\.detail-card \.record-item\s*\{[\s\S]*?padding:\s*0\.65rem 0\.75rem;/);
  });

  it('defines explicit focus-visible rings for selectable workflow and correlation pills', () => {
    expect(styles).toMatch(
      /button\.token-pill--action:focus-visible,\s*button\.correlation-chip:focus-visible\s*\{[\s\S]*?box-shadow:\s*0 0 0 1px rgba\(125,\s*211,\s*252,\s*0\.35\);[\s\S]*?outline:\s*1px solid rgba\(125,\s*211,\s*252,\s*0\.55\);[\s\S]*?outline-offset:\s*1px;/
    );
  });

  it('styles the absent-from-overview workflow note as a visible warning surface', () => {
    expect(styles).toMatch(/\.surface-status\.surface-status--warning\s*\{[\s\S]*?border-left-color:\s*#7dd3fc;[\s\S]*?color:\s*#bae6fd;/);
  });
});
