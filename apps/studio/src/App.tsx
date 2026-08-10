import { createMemo, createSignal, Show } from "solid-js";

import { evaluateLanding } from "./evaluation/evaluate-landing";
import type { Episode, EvaluationRecord } from "./kernel/types";
import {
  CUBE_REF,
  createInitialSnapshot,
  deepFreeze,
  FALLING_CUBE_PROGRAM,
  LANDING_SUCCESS_CONTRACT,
  MUJOCO_PROFILE,
} from "./kernel/world";
import { EpisodePlayer } from "./presentation-episode/EpisodePlayer";
import { ThreeViewport } from "./presentation-three/ThreeViewport";
import { WorldRepository } from "./repository/world-repository";
import { runFallingCube } from "./runtime-mujoco/run-falling-cube";

type RuntimeStatus = "ready" | "running" | "completed" | "error";
type ViewMode = "repository" | "episode";

function formatNumber(value: number, digits = 3): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

export default function App() {
  const repository = new WorldRepository();
  const baseSnapshot = repository.write(createInitialSnapshot());
  const [currentSnapshot, setCurrentSnapshot] = createSignal(baseSnapshot);
  const [height, setHeight] = createSignal(2.8);
  const [episode, setEpisode] = createSignal<Episode>();
  const [evaluation, setEvaluation] = createSignal<EvaluationRecord>();
  const [timelineIndex, setTimelineIndex] = createSignal(0);
  const [viewMode, setViewMode] = createSignal<ViewMode>("repository");
  const [runtimeStatus, setRuntimeStatus] = createSignal<RuntimeStatus>("ready");
  const [errorMessage, setErrorMessage] = createSignal<string>();
  let runSequence = 0;

  const activeSample = createMemo(() => {
    if (viewMode() !== "episode") return undefined;
    return episode()?.samples[timelineIndex()];
  });
  const cubeState = createMemo(() => {
    return (
      activeSample()?.states[CUBE_REF] ??
      currentSnapshot().entities.find((entity) => entity.ref === CUBE_REF)?.state
    );
  });
  const displayedSource = createMemo(() => {
    if (viewMode() === "episode") return "episode-frame";
    return currentSnapshot().source === "runtime-terminal" ? "adopted-terminal" : currentSnapshot().source;
  });

  const editWorld = () => {
    try {
      const edited = repository.editCubeHeight(repository.readRef().id, height());
      setCurrentSnapshot(edited);
      setEpisode(undefined);
      setEvaluation(undefined);
      setTimelineIndex(0);
      setViewMode("repository");
      setRuntimeStatus("ready");
      setErrorMessage(undefined);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "编辑失败");
    }
  };

  const runWorld = async () => {
    setRuntimeStatus("running");
    setErrorMessage(undefined);
    setEvaluation(undefined);
    try {
      runSequence += 1;
      const frozenBase = repository.readRef();
      const nextEpisode = await runFallingCube(
        frozenBase,
        FALLING_CUBE_PROGRAM,
        MUJOCO_PROFILE,
        deepFreeze({ runId: `run:studio-${runSequence}` }),
      );
      repository.record(nextEpisode.terminalSnapshot);
      setEpisode(nextEpisode);
      setTimelineIndex(0);
      setViewMode("episode");
      setRuntimeStatus("completed");
    } catch (error) {
      setRuntimeStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Runtime 推演失败");
    }
  };

  const evaluateEpisode = () => {
    const currentEpisode = episode();
    if (!currentEpisode) return;
    setEvaluation(evaluateLanding(currentEpisode, LANDING_SUCCESS_CONTRACT));
  };

  const adoptTerminal = () => {
    const currentEpisode = episode();
    if (!currentEpisode) return;
    const adopted = repository.adopt(currentEpisode.terminalSnapshot.id);
    setCurrentSnapshot(adopted);
    setTimelineIndex(currentEpisode.samples.length - 1);
    setViewMode("repository");
  };

  const selectTimelineFrame = (index: number) => {
    setTimelineIndex(index);
    setViewMode("episode");
  };

  return (
    <main class="studio-shell">
      <header class="topbar">
        <div class="identity">
          <span class="identity-mark" aria-hidden="true">D</span>
          <div>
            <strong>Demiurges</strong>
            <span>World Harness · Runtime Slice 01</span>
          </div>
        </div>
        <div class="runtime-badge" data-status={runtimeStatus()}>
          <span class="status-dot" aria-hidden="true" />
          <span data-testid="runtime-status">
            {runtimeStatus() === "running" ? "MuJoCo 推演中" : `MuJoCo ${MUJOCO_PROFILE.version}`}
          </span>
        </div>
      </header>

      <section class="workspace" aria-label="世界工作区">
        <div class="viewport-panel">
          <div class="viewport-heading">
            <div>
              <span class="eyebrow">Observation</span>
              <h1>Falling Cube</h1>
            </div>
            <dl class="view-readout">
              <div>
                <dt>显示源</dt>
                <dd data-testid="view-source">{displayedSource()}</dd>
              </div>
              <div>
                <dt>t</dt>
                <dd>{formatNumber(activeSample()?.timeSeconds ?? 0, 2)} s</dd>
              </div>
            </dl>
          </div>
          <ThreeViewport snapshot={currentSnapshot()} sample={activeSample()} />
          <div class="axis-key" aria-label="坐标轴图例">
            <span class="axis-x">X</span><span class="axis-y">Y</span><span class="axis-z">Z</span>
          </div>
        </div>

        <aside class="inspector" aria-label="世界控制与检查器">
          <section class="inspector-section world-authority">
            <span class="eyebrow">World authority</span>
            <h2>Repository</h2>
            <dl class="fact-list">
              <div><dt>current ref</dt><dd data-testid="current-ref-id">{currentSnapshot().id}</dd></div>
              <div><dt>parent</dt><dd>{currentSnapshot().parentId ?? "—"}</dd></div>
              <div><dt>frame</dt><dd>frame:world</dd></div>
              <div><dt>units</dt><dd>units:si</dd></div>
            </dl>
          </section>

          <section class="inspector-section">
            <div class="section-heading">
              <div>
                <span class="eyebrow">Edit</span>
                <h2>初始快照</h2>
              </div>
              <span class="step-number">01</span>
            </div>
            <label class="field-label" for="cube-height">方块中心高度</label>
            <div class="number-field">
              <input
                id="cube-height"
                data-testid="height-input"
                type="number"
                min="0.5"
                max="4"
                step="0.1"
                value={height()}
                onInput={(event) => setHeight(event.currentTarget.valueAsNumber)}
              />
              <span>m</span>
            </div>
            <button class="button secondary" data-testid="edit-button" onClick={editWorld}>创建 child Snapshot</button>
          </section>

          <section class="inspector-section">
            <div class="section-heading">
              <div>
                <span class="eyebrow">Run</span>
                <h2>改变世界的推演</h2>
              </div>
              <span class="step-number">02</span>
            </div>
            <dl class="compact-contract">
              <div><dt>program</dt><dd>{FALLING_CUBE_PROGRAM.id}</dd></div>
              <div><dt>step</dt><dd>{formatNumber(MUJOCO_PROFILE.timestepSeconds, 4)} s</dd></div>
              <div><dt>gravity</dt><dd>−9.81 m/s² Z</dd></div>
            </dl>
            <button
              class="button primary"
              data-testid="run-button"
              disabled={runtimeStatus() === "running"}
              onClick={() => void runWorld()}
            >
              {runtimeStatus() === "running" ? "正在推演…" : "运行 MuJoCo"}
            </button>
          </section>

          <Show when={errorMessage()}>
            {(message) => <p class="error-message" role="alert">{message()}</p>}
          </Show>
        </aside>
      </section>

      <section class="evidence-dock" aria-label="Episode 与评估证据">
        <div class="timeline-block">
          <div class="dock-heading">
            <div>
              <span class="eyebrow">Episode evidence</span>
              <h2>{episode()?.id ?? "等待第一次推演"}</h2>
            </div>
            <span class="sample-count">{episode()?.samples.length ?? 0} samples</span>
          </div>
          <EpisodePlayer
            episode={episode()}
            active={viewMode() === "episode"}
            index={timelineIndex()}
            onIndexChange={selectTimelineFrame}
          />
        </div>

        <div class="entity-evidence">
          <span class="eyebrow">Entity state</span>
          <h2>{CUBE_REF}</h2>
          <dl class="vector-grid">
            <div><dt>position</dt><dd>{cubeState()?.pose.position.map((value) => formatNumber(value)).join("  ") ?? "—"}</dd></div>
            <div><dt>velocity</dt><dd>{cubeState()?.linearVelocity.map((value) => formatNumber(value)).join("  ") ?? "—"}</dd></div>
            <div><dt>geometry</dt><dd>box · 0.5 × 0.5 × 0.5 m</dd></div>
            <div><dt>collision</dt><dd>box proxy · mass 1 kg</dd></div>
          </dl>
        </div>

        <div class="evaluation-block">
          <div class="dock-heading">
            <div>
              <span class="eyebrow">Deterministic evaluation</span>
              <h2 data-testid="evaluation-status">
                {evaluation() ? (evaluation()?.passed ? "PASS" : "FAIL") : "未评估"}
              </h2>
            </div>
            <Show when={evaluation()}>
              {(record) => <span class="evaluation-mark" data-pass={record().passed}>{record().passed ? "✓" : "×"}</span>}
            </Show>
          </div>
          <Show when={evaluation()} fallback={<p class="muted">高度误差 ≤ 0.015 m，末速度 ≤ 0.08 m/s</p>}>
            {(record) => (
              <dl class="metrics">
                <div><dt>height error</dt><dd>{formatNumber(record().metrics.heightError, 5)} m</dd></div>
                <div><dt>terminal speed</dt><dd>{formatNumber(record().metrics.terminalLinearSpeed, 5)} m/s</dd></div>
              </dl>
            )}
          </Show>
          <div class="action-row">
            <button class="button secondary" data-testid="evaluate-button" disabled={!episode()} onClick={evaluateEpisode}>Evaluate</button>
            <button class="button ghost" data-testid="adopt-button" disabled={!episode()} onClick={adoptTerminal}>Adopt terminal</button>
          </div>
        </div>
      </section>

      <footer class="statusbar">
        <span>Kernel records are authoritative</span>
        <span>Presentation: Three.js</span>
        <span>Runtime: @mujoco/mujoco · single-thread WASM</span>
      </footer>
    </main>
  );
}
