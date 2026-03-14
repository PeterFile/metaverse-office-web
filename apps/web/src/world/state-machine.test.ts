import { describe, expect, it } from 'vitest';
import { BASE_PHASE_MAP, PHASE_ZONE_OVERRIDE, deriveAgentPhase, deriveAgentZone } from './state-machine';
import type { PhaseSignals } from './types';

const NO_SIGNALS: PhaseSignals = {
  reboot_recommended: false,
  has_open_handoff: false,
  has_pending_handoff: false,
  has_recent_handoff_done: false,
  has_recent_reboot_completed: false,
  has_open_incident: false,
};

describe('deriveAgentPhase', () => {
  it.each(Object.entries(BASE_PHASE_MAP))(
    'maps raw state "%s" to base phase "%s"',
    (raw, expected) => {
      expect(deriveAgentPhase(raw, NO_SIGNALS)).toBe(expected);
    }
  );

  it('returns "unknown" for unrecognised raw state', () => {
    expect(deriveAgentPhase('nonexistent', NO_SIGNALS)).toBe('unknown');
    expect(deriveAgentPhase('', NO_SIGNALS)).toBe('unknown');
  });

  it('overrides to reboot_recommended when signal is set and base is not rebooting', () => {
    expect(
      deriveAgentPhase('coding', { ...NO_SIGNALS, reboot_recommended: true })
    ).toBe('reboot_recommended');
  });

  it('keeps rebooting when reboot_recommended is set but raw state is already rebooting', () => {
    expect(
      deriveAgentPhase('rebooting', { ...NO_SIGNALS, reboot_recommended: true })
    ).toBe('rebooting');
  });

  it('overrides to recovered when has_recent_reboot_completed', () => {
    expect(
      deriveAgentPhase('idle', { ...NO_SIGNALS, has_recent_reboot_completed: true })
    ).toBe('recovered');
  });

  it('handoff_active overrides handoff_pending', () => {
    expect(
      deriveAgentPhase('planning', {
        ...NO_SIGNALS,
        has_pending_handoff: true,
        has_open_handoff: true,
      })
    ).toBe('handoff_active');
  });

  it('handoff_pending when only pending', () => {
    expect(
      deriveAgentPhase('planning', { ...NO_SIGNALS, has_pending_handoff: true })
    ).toBe('handoff_pending');
  });

  it('handoff_done when recent handoff is completed and no active/pending', () => {
    expect(
      deriveAgentPhase('coding', { ...NO_SIGNALS, has_recent_handoff_done: true })
    ).toBe('handoff_done');
  });

  it('handoff_done does not override handoff_active', () => {
    expect(
      deriveAgentPhase('coding', {
        ...NO_SIGNALS,
        has_open_handoff: true,
        has_recent_handoff_done: true,
      })
    ).toBe('handoff_active');
  });

  it('recovered overrides reboot_recommended', () => {
    // recovered is applied after reboot_recommended in the chain
    expect(
      deriveAgentPhase('idle', {
        ...NO_SIGNALS,
        reboot_recommended: true,
        has_recent_reboot_completed: true,
      })
    ).toBe('recovered');
  });
});

describe('deriveAgentZone', () => {
  it.each(Object.entries(PHASE_ZONE_OVERRIDE))(
    'phase "%s" maps to zone "%s"',
    (phase, expectedZone) => {
      expect(deriveAgentZone(phase as any, 'desk-test')).toBe(expectedZone);
    }
  );

  it('falls back to homeZone for phases without override', () => {
    expect(deriveAgentZone('active', 'desk-app-engineering')).toBe('desk-app-engineering');
    expect(deriveAgentZone('idle', 'desk-market-intel')).toBe('desk-market-intel');
    expect(deriveAgentZone('blocked', 'desk-tokenomics')).toBe('desk-tokenomics');
    expect(deriveAgentZone('unknown', 'desk-foo')).toBe('desk-foo');
  });
});
