import { expect } from 'vitest';

const FORBIDDEN_PUBLIC_UI_TEXT_PATTERNS = [
  {
    label: 'local path',
    pattern: /(?:file:\/\/\/?|~\/|\b[A-Za-z]:[\\/]|\/(?:Users|Volumes|tmp|private|var|home)\/)[^\s"'`,;)]*/i
  },
  {
    label: 'runtime protocol',
    pattern: /\b(?:tmux|hermes|session|profile):\/\/[^\s"'`,;)]*/i
  },
  {
    label: 'runtime/company-model vocabulary',
    pattern: /\b(?:tmux|hermes|session|profile)\b/i
  },
  {
    label: 'session/profile ref',
    pattern: /\b(?:session|profile)(?:[_:/-][A-Za-z0-9][A-Za-z0-9._:/-]*)/i
  },
  {
    label: 'secret token',
    pattern:
      /\b(?:(?:sk|xox[baprs]|gh[pousr])-[A-Za-z0-9._-]{8,}|(?:access[_-]?token|api[_-]?key|secret|password|credential|bearer|token)(?:\b|[=:]))/i
  },
  {
    label: 'webhook',
    pattern: /\bwebhooks?\b|hooks\.slack\.com/i
  },
  {
    label: 'control-plane vocabulary',
    pattern: /\b(?:payload|control[-_ ]?plane|dispatch|route|claims?|complete|assign(?:ment)?)\b/i
  }
] as const;

export function expectNoForbiddenPublicUiText(value: unknown): void {
  const text = collectPublicText(value).join('\n');
  const leaks = FORBIDDEN_PUBLIC_UI_TEXT_PATTERNS.flatMap(({ label, pattern }) => {
    const match = pattern.exec(text);
    return match ? [`${label}: ${match[0]}`] : [];
  });

  expect(leaks).toEqual([]);
}

function collectPublicText(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectPublicText);
  }

  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(collectPublicText);
  }

  return [];
}
