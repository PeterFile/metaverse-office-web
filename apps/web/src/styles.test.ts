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
});
