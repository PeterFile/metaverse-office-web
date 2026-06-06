const FORBIDDEN_VISIBLE_TEXT_PATTERN =
  /(?:\b(?:file|https?|tmux|hermes|task|session|profile):\/\/|(?:^|[\s("'`])(?:~|\/(?:Users|Volumes|private|var|tmp|home|workspace|mnt)\b)[^\s"'`)]*|[A-Za-z]:\\|access[_-]?token|token=|secret|webhook|metadata|payload|degraded_reasons|control-plane|session_ref|profile_id|evidence_refs?|tmux_session|hermes_(?:profile|session)|source_(?:kind|status)|\b\d+-web3-[a-z0-9-]+\b|profile-[a-z0-9-]+|session\/[a-z0-9-]+)/i;

export function safeVisibleText(value: string | null | undefined, fallback: string): string {
  const normalized = value?.trim() ?? '';
  if (!normalized || FORBIDDEN_VISIBLE_TEXT_PATTERN.test(normalized)) {
    return fallback;
  }

  return normalized;
}
