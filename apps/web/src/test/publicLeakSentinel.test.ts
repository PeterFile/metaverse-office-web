import { describe, expect, it } from 'vitest';

import { expectNoForbiddenPublicUiText } from './publicLeakSentinel';

describe('expectNoForbiddenPublicUiText', () => {
  it('allows stable public evidence labels', () => {
    expect(() =>
      expectNoForbiddenPublicUiText([
        'Local evidence',
        'Runtime evidence',
        'Workspace evidence',
        'External evidence',
        'Linked evidence',
        'Unknown'
      ])
    ).not.toThrow();
  });

  it.each([
    ['tmux', 'Tmux observation'],
    ['Hermes', 'Hermes profile'],
    ['session', 'Runtime session'],
    ['profile', 'Runtime profile'],
    ['path', '/Users/cwp/private/outbox.md'],
    ['token', 'access_token=secret'],
    ['control-plane', 'control-plane dispatch route claim']
  ])('rejects %s-shaped public labels', (_label, text) => {
    expect(() => expectNoForbiddenPublicUiText(text)).toThrow();
  });
});
