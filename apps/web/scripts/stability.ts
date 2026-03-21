export function findStableSample<T>(
  samples: readonly T[],
  isStable: (previous: T, current: T) => boolean
): T | null {
  for (let index = 1; index < samples.length; index += 1) {
    if (isStable(samples[index - 1], samples[index])) {
      return samples[index];
    }
  }

  return null;
}

export function requireStableSample<T>(
  samples: readonly T[],
  isStable: (previous: T, current: T) => boolean,
  errorMessage: string,
  describeSample: (sample: T) => unknown = (sample) => sample
): T {
  const stableSample = findStableSample(samples, isStable);

  if (stableSample) {
    return stableSample;
  }

  throw new Error(`${errorMessage}: ${JSON.stringify(samples.map((sample) => describeSample(sample)))}`);
}
