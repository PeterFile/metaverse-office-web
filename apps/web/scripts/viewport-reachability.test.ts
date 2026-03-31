import { describe, expect, it } from 'vitest';

import { resolveViewportEdgeDragDelta } from './viewport-reachability';

describe('resolveViewportEdgeDragDelta', () => {
  it('computes a single overshooting drag toward the bottom-right scene edge', () => {
    expect(
      resolveViewportEdgeDragDelta({
        scale: 0.5,
        left: 652,
        top: 672,
        right: 1800,
        bottom: 1500,
        worldWidth: 2048,
        worldHeight: 1536,
        clampPadding: {
          right: 64
        }
      })
    ).toEqual({
      deltaX: -284,
      deltaY: -114
    });
  });

  it('computes a single overshooting drag back to the top-left clamp edge', () => {
    expect(
      resolveViewportEdgeDragDelta(
        {
          scale: 0.75,
          left: 220,
          top: 160,
          right: 2048,
          bottom: 1536,
          worldWidth: 2048,
          worldHeight: 1536,
          clampPadding: {
            top: 96
          }
        },
        'top-left'
      )
    ).toEqual({
      deltaX: 261,
      deltaY: 312
    });
  });

  it('computes a single overshooting horizontal drag toward the right clamp edge', () => {
    expect(
      resolveViewportEdgeDragDelta(
        {
          scale: 0.5,
          left: 652,
          top: 480,
          right: 1800,
          bottom: 1308,
          worldWidth: 2048,
          worldHeight: 1536,
          clampPadding: {
            right: 64
          }
        },
        'right'
      )
    ).toEqual({
      deltaX: -284,
      deltaY: 0
    });
  });

  it('stops asking for drag movement once the edge is already within tolerance', () => {
    expect(
      resolveViewportEdgeDragDelta(
        {
          scale: 0.75,
          left: 0.3,
          top: -127.8,
          right: 2048,
          bottom: 1536,
          worldWidth: 2048,
          worldHeight: 1536,
          clampPadding: {
            top: 96
          }
        },
        'top-left'
      )
    ).toEqual({
      deltaX: 0,
      deltaY: 0
    });
  });
});
