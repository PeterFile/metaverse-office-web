import { afterEach, describe, expect, it, vi } from 'vitest';

import { RequestError, fetchOfficeOverview, resolveApiUrl } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RequestError', () => {
  it('preserves status and code metadata for callers that need protocol-aware handling', () => {
    const error = new RequestError({
      message: 'unknown agent unknown-agent',
      status: 404,
      code: 'not_found'
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('RequestError');
    expect(error.message).toBe('unknown agent unknown-agent');
    expect(error.status).toBe(404);
    expect(error.code).toBe('not_found');
  });
});

describe('fetchOfficeOverview', () => {
  it('throws a RequestError with invalid_json_response when a JSON response body cannot be parsed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{', {
          status: 502,
          headers: {
            'content-type': 'application/json'
          }
        })
      )
    );

    await expect(fetchOfficeOverview()).rejects.toMatchObject({
      name: 'RequestError',
      status: 502,
      code: 'invalid_json_response',
      message: 'request_failed: invalid_json_response'
    });
  });

  it('throws a RequestError with non_json_response when the backend does not return JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('gateway unavailable', {
          status: 503,
          headers: {
            'content-type': 'text/plain'
          }
        })
      )
    );

    await expect(fetchOfficeOverview()).rejects.toMatchObject({
      name: 'RequestError',
      status: 503,
      code: 'non_json_response',
      message: 'request_failed: non_json_response'
    });
  });
});

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
