import type { AgentPhase, PhaseSignals } from './types';

// ── Raw state → base phase (table-driven) ──
const BASE_PHASE_MAP: Record<string, AgentPhase> = {
  idle: 'idle',
  researching: 'active',
  planning: 'active',
  coding: 'active',
  blocked: 'blocked',
  reviewing: 'reviewing',
  sleeping: 'sleeping',
  rebooting: 'rebooting',
};

// ── Phase → zone (table-driven) ──
const PHASE_ZONE_OVERRIDE: Partial<Record<AgentPhase, string>> = {
  reviewing: 'review-zone',
  sleeping: 'rest-zone',
  rebooting: 'reboot-zone',
  handoff_active: 'meeting-zone',
  handoff_pending: 'meeting-zone',
};

/**
 * Derive AgentPhase from raw backend state + contextual signals.
 * Pure function, no side effects.
 *
 * Signal overlay priority (later wins):
 * 1. base map lookup
 * 2. reboot_recommended → 'reboot_recommended'
 * 3. has_recent_reboot_completed → 'recovered'
 * 4. has_pending_handoff → 'handoff_pending'
 * 5. has_open_handoff → 'handoff_active'
 * 6. has_recent_handoff_done → 'handoff_done'
 */
export function deriveAgentPhase(
  rawState: string,
  signals: PhaseSignals
): AgentPhase {
  const base = BASE_PHASE_MAP[rawState];
  if (base === undefined) {
    return 'unknown';
  }

  let phase: AgentPhase = base;

  // reboot signals
  if (signals.reboot_recommended && phase !== 'rebooting') {
    phase = 'reboot_recommended';
  }
  if (signals.has_recent_reboot_completed && phase !== 'rebooting') {
    phase = 'recovered';
  }

  // handoff signals
  if (signals.has_pending_handoff) {
    phase = 'handoff_pending';
  }
  if (signals.has_open_handoff) {
    phase = 'handoff_active';
  }
  if (
    signals.has_recent_handoff_done &&
    phase !== 'handoff_active' &&
    phase !== 'handoff_pending' &&
    phase !== 'rebooting'
  ) {
    phase = 'handoff_done';
  }

  return phase;
}

/**
 * Derive zone from phase + agent home zone.
 * If phase has an override, use it; otherwise fall back to homeZone.
 */
export function deriveAgentZone(
  phase: AgentPhase,
  homeZone: string
): string {
  return PHASE_ZONE_OVERRIDE[phase] ?? homeZone;
}

// Exported for testing
export { BASE_PHASE_MAP, PHASE_ZONE_OVERRIDE };
