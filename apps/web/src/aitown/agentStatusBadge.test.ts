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
        rebootRecommended: false
      })
    ).toBeNull();
  });

  it('keeps the badge text compact and ordered by alerts, incidents, reboot', () => {
    expect(
      resolveSceneAgentStatusBadge({
        openAlertCount: 3,
        hasOpenIncidents: true,
        rebootRecommended: true
      })
    ).toMatchObject({
      text: '3 ! R',
      height: BADGE_HEIGHT,
      offsetX: BADGE_OFFSET_X,
      offsetY: BADGE_OFFSET_Y
    });
  });

  it('measures wider badges when the rendered alert count grows', () => {
    const singleDigit = resolveSceneAgentStatusBadge({
      openAlertCount: 7,
      hasOpenIncidents: true,
      rebootRecommended: false
    });
    const doubleDigit = resolveSceneAgentStatusBadge({
      openAlertCount: 12,
      hasOpenIncidents: true,
      rebootRecommended: false
    });

    expect(singleDigit).not.toBeNull();
    expect(doubleDigit).not.toBeNull();
    expect(doubleDigit!.width).toBeGreaterThan(singleDigit!.width);
  });

  it('counts rendered spaces when sizing multi-marker badges', () => {
    const badge = resolveSceneAgentStatusBadge({
      openAlertCount: 3,
      hasOpenIncidents: true,
      rebootRecommended: true
    });
    const alertAndIncident = resolveSceneAgentStatusBadge({
      openAlertCount: 3,
      hasOpenIncidents: true,
      rebootRecommended: false
    });

    expect(badge).not.toBeNull();
    expect(alertAndIncident).not.toBeNull();
    expect(badge).toMatchObject({
      text: '3 ! R'
    });
    expect(badge!.width).toBeGreaterThan(alertAndIncident!.width);
    expect(badge!.width - alertAndIncident!.width).toBeGreaterThan(0);
  });
});
