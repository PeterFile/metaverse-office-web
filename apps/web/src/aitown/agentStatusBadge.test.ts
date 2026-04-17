import { describe, expect, it } from 'vitest';

import {
  BADGE_HEIGHT,
  BADGE_OFFSET_X,
  BADGE_OFFSET_Y,
  resolveSceneAgentStatusBadge
} from './agentStatusBadge';

describe('resolveSceneAgentStatusBadge', () => {
  it('returns null when the agent has no scene status markers', () => {
    expect(
      resolveSceneAgentStatusBadge({
        openAlertCount: 0,
        hasOpenIncidents: false,
        rebootRecommended: false,
        runtimeFreshnessSeverity: null
      })
    ).toBeNull();
  });

  it('keeps the badge text unchanged when runtime freshness is normal', () => {
    expect(
      resolveSceneAgentStatusBadge({
        openAlertCount: 3,
        hasOpenIncidents: true,
        rebootRecommended: true,
        runtimeFreshnessSeverity: 'normal'
      })
    ).toMatchObject({
      text: '3 ! R',
      height: BADGE_HEIGHT,
      offsetX: BADGE_OFFSET_X,
      offsetY: BADGE_OFFSET_Y
    });
  });

  it('appends one stable runtime freshness token after existing badge markers', () => {
    expect(
      resolveSceneAgentStatusBadge({
        openAlertCount: 3,
        hasOpenIncidents: true,
        rebootRecommended: true,
        runtimeFreshnessSeverity: 'orange'
      })
    ).toMatchObject({
      text: '3 ! R S',
      height: BADGE_HEIGHT,
      offsetX: BADGE_OFFSET_X,
      offsetY: BADGE_OFFSET_Y
    });
  });

  it('measures wider badges when the rendered alert count grows', () => {
    const singleDigit = resolveSceneAgentStatusBadge({
      openAlertCount: 7,
      hasOpenIncidents: true,
      rebootRecommended: false,
      runtimeFreshnessSeverity: null
    });
    const doubleDigit = resolveSceneAgentStatusBadge({
      openAlertCount: 12,
      hasOpenIncidents: true,
      rebootRecommended: false,
      runtimeFreshnessSeverity: null
    });

    expect(singleDigit).not.toBeNull();
    expect(doubleDigit).not.toBeNull();
    expect(doubleDigit!.width).toBeGreaterThan(singleDigit!.width);
  });

  it('counts rendered spaces when sizing multi-marker badges', () => {
    const badge = resolveSceneAgentStatusBadge({
      openAlertCount: 3,
      hasOpenIncidents: true,
      rebootRecommended: true,
      runtimeFreshnessSeverity: 'orange'
    });
    const alertAndIncident = resolveSceneAgentStatusBadge({
      openAlertCount: 3,
      hasOpenIncidents: true,
      rebootRecommended: false,
      runtimeFreshnessSeverity: null
    });

    expect(badge).not.toBeNull();
    expect(alertAndIncident).not.toBeNull();
    expect(badge).toMatchObject({
      text: '3 ! R S'
    });
    expect(badge!.width).toBeGreaterThan(alertAndIncident!.width);
    expect(badge!.width - alertAndIncident!.width).toBeGreaterThan(0);
  });
});
