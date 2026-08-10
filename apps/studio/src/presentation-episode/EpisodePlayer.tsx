import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";

import type { Episode } from "@demiurges/world";
import {
  clampSampleIndex,
  episodeTimeAtWallTime,
  sampleIndexAtTime,
} from "./episode-player-clock";

interface EpisodePlayerProps {
  readonly episode?: Episode;
  readonly active: boolean;
  readonly index: number;
  readonly onIndexChange: (index: number) => void;
}

const PLAYBACK_RATES = [0.5, 1, 2] as const;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function formatTime(timeSeconds: number): string {
  return `${timeSeconds.toFixed(2)} s`;
}

export function EpisodePlayer(props: EpisodePlayerProps) {
  const [playing, setPlaying] = createSignal(false);
  const [playbackRate, setPlaybackRate] = createSignal<number>(1);
  let animationFrame: number | undefined;
  let playingEpisodeId: Episode["id"] | undefined;
  let loadedEpisodeId: Episode["id"] | undefined;
  let anchorEpisodeSeconds = 0;
  let anchorWallMilliseconds = 0;

  const sampleCount = createMemo(() => props.episode?.samples.length ?? 0);
  const currentIndex = createMemo(() => clampSampleIndex(sampleCount(), props.index));
  const lastIndex = createMemo(() => Math.max(sampleCount() - 1, 0));
  const currentTime = createMemo(
    () => props.episode?.samples[currentIndex()]?.timeSeconds ?? 0,
  );
  const duration = createMemo(
    () => props.episode?.samples[lastIndex()]?.timeSeconds ?? 0,
  );

  const stopClock = () => {
    if (animationFrame !== undefined) {
      cancelAnimationFrame(animationFrame);
      animationFrame = undefined;
    }
    playingEpisodeId = undefined;
    setPlaying(false);
  };

  const setFrame = (index: number) => {
    props.onIndexChange(clampSampleIndex(sampleCount(), index));
  };

  const tick = (wallMilliseconds: number) => {
    const currentEpisode = props.episode;
    if (!currentEpisode || currentEpisode.id !== playingEpisodeId) {
      stopClock();
      return;
    }

    const episodeTime = episodeTimeAtWallTime(
      anchorEpisodeSeconds,
      anchorWallMilliseconds,
      wallMilliseconds,
      playbackRate(),
    );
    const nextIndex = sampleIndexAtTime(currentEpisode.samples, episodeTime);
    if (nextIndex !== currentIndex()) setFrame(nextIndex);

    if (episodeTime >= duration()) {
      setFrame(lastIndex());
      animationFrame = undefined;
      playingEpisodeId = undefined;
      setPlaying(false);
      return;
    }
    animationFrame = requestAnimationFrame(tick);
  };

  const playFrom = (requestedIndex = currentIndex()) => {
    const currentEpisode = props.episode;
    if (!currentEpisode || currentEpisode.samples.length === 0) return;

    stopClock();
    const startIndex = clampSampleIndex(
      currentEpisode.samples.length,
      requestedIndex >= currentEpisode.samples.length - 1 ? 0 : requestedIndex,
    );
    setFrame(startIndex);
    anchorEpisodeSeconds = currentEpisode.samples[startIndex]!.timeSeconds;
    anchorWallMilliseconds = performance.now();
    playingEpisodeId = currentEpisode.id;
    setPlaying(true);
    animationFrame = requestAnimationFrame(tick);
  };

  const pause = () => stopClock();

  const seek = (index: number) => {
    stopClock();
    setFrame(index);
  };

  const step = (offset: number) => seek(currentIndex() + offset);

  const changePlaybackRate = (rate: number) => {
    const shouldResume = playing();
    const resumeIndex = currentIndex();
    stopClock();
    setPlaybackRate(rate);
    if (shouldResume) playFrom(resumeIndex);
  };

  createEffect(() => {
    const currentEpisode = props.episode;
    if (!props.active) {
      stopClock();
      return;
    }
    if (currentEpisode?.id === loadedEpisodeId) return;

    loadedEpisodeId = currentEpisode?.id;
    stopClock();
    if (!currentEpisode) return;
    setFrame(0);
    if (!prefersReducedMotion()) playFrom(0);
  });

  onCleanup(stopClock);

  return (
    <div class="episode-player" data-playing={playing()}>
      <div class="player-controls" role="group" aria-label="Episode 播放控制">
        <button
          class="button secondary player-button player-toggle"
          data-testid="playback-toggle"
          disabled={!props.episode}
          aria-pressed={playing()}
          onClick={() => (playing() ? pause() : playFrom())}
        >
          {!props.episode ? "播放" : playing() ? "暂停" : currentIndex() === lastIndex() ? "重播" : "播放"}
        </button>
        <button
          class="button ghost player-button"
          data-testid="previous-frame"
          disabled={!props.episode || currentIndex() === 0}
          aria-label="上一帧"
          onClick={() => step(-1)}
        >
          −1 帧
        </button>
        <button
          class="button ghost player-button"
          data-testid="next-frame"
          disabled={!props.episode || currentIndex() === lastIndex()}
          aria-label="下一帧"
          onClick={() => step(1)}
        >
          +1 帧
        </button>
        <button
          class="button ghost player-button"
          data-testid="replay-button"
          disabled={!props.episode}
          onClick={() => playFrom(0)}
        >
          从头重播
        </button>
        <label class="playback-rate">
          <span>速度</span>
          <select
            data-testid="playback-rate"
            aria-label="Episode 播放速度"
            value={playbackRate()}
            disabled={!props.episode}
            onChange={(event) => changePlaybackRate(Number(event.currentTarget.value))}
          >
            {PLAYBACK_RATES.map((rate) => <option value={rate}>{rate}×</option>)}
          </select>
        </label>
      </div>

      <input
        class="timeline"
        data-testid="timeline"
        aria-label="Episode 时间轴"
        type="range"
        min="0"
        max={lastIndex()}
        value={currentIndex()}
        disabled={!props.episode}
        onInput={(event) => seek(event.currentTarget.valueAsNumber)}
      />
      <div class="timeline-readout" aria-live="off">
        <output data-testid="episode-time">{formatTime(currentTime())}</output>
        <span data-testid="episode-frame">frame {currentIndex()} / {lastIndex()}</span>
      </div>
      <div class="timeline-labels"><span>Snapshot</span><span>contact</span><span>Terminal</span></div>
    </div>
  );
}
