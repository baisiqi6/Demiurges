interface TimedSample {
  readonly timeSeconds: number;
}

export function clampSampleIndex(sampleCount: number, index: number): number {
  if (sampleCount <= 0) return 0;
  return Math.min(Math.max(Math.floor(index), 0), sampleCount - 1);
}

export function episodeTimeAtWallTime(
  anchorEpisodeSeconds: number,
  anchorWallMilliseconds: number,
  currentWallMilliseconds: number,
  playbackRate: number,
): number {
  const elapsedSeconds = Math.max(currentWallMilliseconds - anchorWallMilliseconds, 0) / 1_000;
  return anchorEpisodeSeconds + elapsedSeconds * playbackRate;
}

export function sampleIndexAtTime(samples: readonly TimedSample[], timeSeconds: number): number {
  if (samples.length === 0 || timeSeconds <= samples[0]!.timeSeconds) return 0;

  let lower = 0;
  let upper = samples.length - 1;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    if (samples[middle]!.timeSeconds <= timeSeconds) {
      lower = middle;
    } else {
      upper = middle - 1;
    }
  }
  return lower;
}
