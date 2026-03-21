import { describe, expect, it } from 'vitest';

import { findStableSample, requireStableSample } from './stability';

describe('findStableSample', () => {
  it('returns the first sample whose predecessor settles within the provided predicate', () => {
    expect(
      findStableSample(
        [
          { x: 10, y: 10 },
          { x: 4, y: 5 },
          { x: 4.2, y: 5.1 },
          { x: 4.3, y: 5.2 }
        ],
        (previous, current) =>
          Math.abs(previous.x - current.x) <= 0.5 && Math.abs(previous.y - current.y) <= 0.5
      )
    ).toEqual({ x: 4.2, y: 5.1 });
  });

  it('returns null when no adjacent samples stabilize', () => {
    expect(
      findStableSample(
        [
          { x: 10, y: 10 },
          { x: 8, y: 7 },
          { x: 5, y: 3 },
          { x: 1, y: -2 }
        ],
        (previous, current) =>
          Math.abs(previous.x - current.x) <= 0.5 && Math.abs(previous.y - current.y) <= 0.5
      )
    ).toBeNull();
  });
});

describe('requireStableSample', () => {
  it('throws a useful error when no adjacent samples stabilize', () => {
    expect(() =>
      requireStableSample(
        [
          { x: 10, y: 10 },
          { x: 8, y: 7 },
          { x: 5, y: 3 },
          { x: 1, y: -2 }
        ],
        (previous, current) =>
          Math.abs(previous.x - current.x) <= 0.5 && Math.abs(previous.y - current.y) <= 0.5,
        'viewport did not settle'
      )
    ).toThrowError(
      'viewport did not settle: [{"x":10,"y":10},{"x":8,"y":7},{"x":5,"y":3},{"x":1,"y":-2}]'
    );
  });
});
