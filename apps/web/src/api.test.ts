import { describe, expect, it } from 'vitest';

import { resolveApiUrl } from './api';

describe('resolveApiUrl', () => {
  it('keeps same-origin relative paths when no API base URL is configured', () => {
    expect(resolveApiUrl('/office/overview')).toBe('/office/overview');
    expect(resolveApiUrl('/agents/app-engineering/workflow?limit=10&window=60m')).toBe(
      '/agents/app-engineering/workflow?limit=10&window=60m'
    );
  });


  it('prefixes request paths with a relative API base URL', () => {
    expect(resolveApiUrl('/agents/app-engineering/workflow?limit=10&window=60m', '/api')).toBe(
      '/api/agents/app-engineering/workflow?limit=10&window=60m'
    );
  });

  it('prefixes request paths with the configured API base URL', () => {
    expect(resolveApiUrl('/office/overview', 'https://api.example.test')).toBe(
      'https://api.example.test/office/overview'
    );
    expect(resolveApiUrl('/office/overview', 'https://api.example.test/root/')).toBe(
      'https://api.example.test/root/office/overview'
    );
    expect(resolveApiUrl('/agents/app-engineering/workflow?limit=10&window=60m', '/api')).toBe(
      '/api/agents/app-engineering/workflow?limit=10&window=60m'
    );
  });
});
