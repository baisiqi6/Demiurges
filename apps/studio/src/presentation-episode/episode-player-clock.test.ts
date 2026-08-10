import { describe, expect, test } from "bun:test";

import {
  clampSampleIndex,
  episodeTimeAtWallTime,
  sampleIndexAtTime,
} from "./episode-player-clock";

const samples = [
  { timeSeconds: 0 },
  { timeSeconds: 1 / 30 },
  { timeSeconds: 2 / 30 },
  { timeSeconds: 2.5 },
];

describe("Episode Player clock", () => {
  test("按 sample time 选择不晚于当前播放时间的证据帧", () => {
    expect(sampleIndexAtTime(samples, -1)).toBe(0);
    expect(sampleIndexAtTime(samples, 0)).toBe(0);
    expect(sampleIndexAtTime(samples, 1 / 30)).toBe(1);
    expect(sampleIndexAtTime(samples, 0.05)).toBe(1);
    expect(sampleIndexAtTime(samples, 2.5)).toBe(3);
    expect(sampleIndexAtTime(samples, 9)).toBe(3);
  });

  test("wall clock 只通过显式倍速映射为 Episode time", () => {
    expect(episodeTimeAtWallTime(0.5, 1_000, 2_000, 0.5)).toBeCloseTo(1);
    expect(episodeTimeAtWallTime(0.5, 1_000, 2_000, 1)).toBeCloseTo(1.5);
    expect(episodeTimeAtWallTime(0.5, 1_000, 2_000, 2)).toBeCloseTo(2.5);
  });

  test("逐帧与 seek 始终停留在 Episode 边界内", () => {
    expect(clampSampleIndex(0, 12)).toBe(0);
    expect(clampSampleIndex(4, -1)).toBe(0);
    expect(clampSampleIndex(4, 1.8)).toBe(1);
    expect(clampSampleIndex(4, 99)).toBe(3);
  });
});
