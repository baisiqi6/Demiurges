import {
  CUBE_REF,
  DIAGNOSTIC_RIGID_ASSET,
  FALLING_CUBE_PROGRAM,
  MUJOCO_PROFILE,
  deepFreeze,
  type Entity,
  type ProductSessionEvent,
  type ProductSessionProjection,
  type WorldReadResult,
  type WorldRunResult,
} from "@demiurges/world";
import {
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";

import { EpisodePlayer } from "./presentation-episode/EpisodePlayer";
import { ThreeViewport } from "./presentation-three/ThreeViewport";
import {
  ProductSessionClient,
  ProductSessionTurnError,
} from "./product-session-client";

type RuntimeStatus = "connecting" | "ready" | "running" | "completed" | "error";
type ViewMode = "repository" | "episode";

const DEFAULT_PROMPT =
  "创建登记的 imported rigid wedge，把高度改到 2.8 米，然后让它落到地面并检查结果。";

function formatNumber(value: number, digits = 3): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

export default function App() {
  const client = new ProductSessionClient();
  const [projection, setProjection] = createSignal<ProductSessionProjection>();
  const [world, setWorld] = createSignal<WorldReadResult>();
  const [lastRun, setLastRun] = createSignal<WorldRunResult>();
  const [events, setEvents] = createSignal<readonly ProductSessionEvent[]>([]);
  const [prompt, setPrompt] = createSignal(DEFAULT_PROMPT);
  const [responseText, setResponseText] = createSignal("");
  const [timelineIndex, setTimelineIndex] = createSignal(0);
  const [viewMode, setViewMode] = createSignal<ViewMode>("repository");
  const [selectedRef, setSelectedRef] = createSignal<Entity["ref"]>(CUBE_REF);
  const [runtimeStatus, setRuntimeStatus] = createSignal<RuntimeStatus>("connecting");
  const [errorMessage, setErrorMessage] = createSignal<string>();
  let turnAbort: AbortController | undefined;

  const episode = createMemo(() => lastRun()?.episode);
  const evaluation = createMemo(() => lastRun()?.evaluation);
  const activeSample = createMemo(() => {
    if (viewMode() !== "episode") return undefined;
    return episode()?.samples[timelineIndex()];
  });
  const currentSnapshot = createMemo(() => world()?.snapshot);
  const currentRef = createMemo(() => world()?.ref);
  const selectedEntity = createMemo(() =>
    currentSnapshot()?.entities.find((entity) => entity.ref === selectedRef()),
  );
  const selectedState = createMemo(() => {
    const sample = activeSample();
    return sample ? sample.states[selectedRef()] : selectedEntity()?.state;
  });
  const importedVisual = createMemo(() => {
    const visual = selectedEntity()?.representations.visual;
    return visual?.kind === "imported-rigid-mesh" ? visual : undefined;
  });
  const displayedSource = createMemo(() => {
    if (viewMode() === "episode") {
      return activeSample()?.states[selectedRef()]
        ? "episode-frame"
        : "episode-state-unavailable";
    }
    return currentSnapshot()?.source ?? "awaiting-authority";
  });
  const toolEvents = createMemo(() =>
    events().filter(
      (event): event is Extract<ProductSessionEvent, { type: "tool.completed" }> =>
        event.type === "tool.completed",
    ),
  );

  const useProjection = (next: ProductSessionProjection) => {
    setProjection(next);
    setWorld(next.world ?? undefined);
    setLastRun(next.lastRun ?? undefined);
    if (next.lastRun) {
      setTimelineIndex(0);
      setViewMode("episode");
    }
  };

  const createSession = async () => {
    setRuntimeStatus("connecting");
    setErrorMessage(undefined);
    setEvents([]);
    setResponseText("");
    setTimelineIndex(0);
    setViewMode("repository");
    setSelectedRef(CUBE_REF);
    try {
      useProjection(await client.createSession());
      setRuntimeStatus("ready");
    } catch (error) {
      setRuntimeStatus("error");
      setErrorMessage(
        error instanceof Error ? error.message : "无法连接 Agent Gateway",
      );
    }
  };

  const applyEvent = (event: ProductSessionEvent) => {
    setEvents((previous) => [...previous, event]);
    if (event.type === "turn.failed") {
      setErrorMessage(event.error);
      return;
    }
    if (event.type === "turn.completed") {
      setResponseText(event.responseText);
      return;
    }
    if (event.type !== "tool.completed" || !event.evidence) return;

    switch (event.evidence.tool) {
      case "read":
        setWorld(event.evidence);
        break;
      case "write":
        setWorld(
          deepFreeze({
            tool: "read",
            ref: event.evidence.ref,
            snapshot: event.evidence.snapshot,
          }) as WorldReadResult,
        );
        break;
      case "edit":
        setWorld(
          deepFreeze({
            tool: "read",
            ref: event.evidence.update.ref,
            snapshot: event.evidence.update.snapshot,
          }) as WorldReadResult,
        );
        break;
      case "run":
        setLastRun(event.evidence);
        setTimelineIndex(0);
        setViewMode("episode");
        break;
    }
  };

  const runAgentTurn = async () => {
    const current = projection();
    if (!current || prompt().trim().length === 0) return;
    setRuntimeStatus("running");
    setErrorMessage(undefined);
    setEvents([]);
    setResponseText("");
    setLastRun(undefined);
    setTimelineIndex(0);
    setViewMode("repository");
    turnAbort = new AbortController();
    try {
      const next = await client.runTurn(
        current.sessionId,
        prompt(),
        current.lastSequence + 1,
        applyEvent,
        turnAbort.signal,
        current.world,
      );
      useProjection(next);
      setRuntimeStatus("completed");
    } catch (error) {
      setRuntimeStatus("error");
      if (error instanceof ProductSessionTurnError) {
        useProjection(error.projection);
      } else {
        setProjection(undefined);
        setWorld(undefined);
        setLastRun(undefined);
        setEvents([]);
        setTimelineIndex(0);
        setViewMode("repository");
      }
      setErrorMessage(error instanceof Error ? error.message : "Agent turn 失败");
    } finally {
      turnAbort = undefined;
    }
  };

  const selectTimelineFrame = (index: number) => {
    setTimelineIndex(index);
    setViewMode("episode");
  };

  onMount(() => void createSession());
  onCleanup(() => turnAbort?.abort());

  return (
    <main class="studio-shell">
      <header class="topbar">
        <div class="identity">
          <span class="identity-mark" aria-hidden="true">D</span>
          <div>
            <strong>Demiurges</strong>
            <span>World Agent Harness · Product Session 01</span>
          </div>
        </div>
        <div class="runtime-badge" data-status={runtimeStatus()}>
          <span class="status-dot" aria-hidden="true" />
          <span data-testid="runtime-status">
            {runtimeStatus() === "running"
              ? "Agent 正在改变并推演世界"
              : `Gateway ${projection()?.sessionId ?? "连接中"}`}
          </span>
        </div>
      </header>

      <section class="workspace" aria-label="世界工作区">
        <div class="viewport-panel">
          <div class="viewport-heading">
            <div>
              <span class="eyebrow">Authoritative observation</span>
              <h1>{selectedEntity()?.label ?? "Executable World"}</h1>
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
          <ThreeViewport
            snapshot={currentSnapshot()}
            sample={activeSample()}
            selectedRef={selectedRef()}
            onSelect={setSelectedRef}
          />
          <Show when={!currentSnapshot()}>
            <div class="viewport-empty" data-testid="viewport-empty">
              <span>等待 Gateway 创建第一个 Snapshot</span>
            </div>
          </Show>
          <div class="axis-key" aria-label="坐标轴图例">
            <span class="axis-x">X</span><span class="axis-y">Y</span><span class="axis-z">Z</span>
          </div>
        </div>

        <aside class="inspector" aria-label="Agent 与世界证据">
          <section class="inspector-section world-authority">
            <span class="eyebrow">World authority</span>
            <h2>Gateway Product Session</h2>
            <dl class="fact-list">
              <div><dt>session</dt><dd data-testid="session-id">{projection()?.sessionId ?? "—"}</dd></div>
              <div><dt>current ref</dt><dd data-testid="current-ref-id">{currentSnapshot()?.id ?? "—"}</dd></div>
              <div><dt>ref version</dt><dd data-testid="current-ref-version">{currentRef() ? `v${currentRef()?.version}` : "—"}</dd></div>
              <div><dt>frame</dt><dd>frame:world</dd></div>
              <div><dt>units</dt><dd>units:si</dd></div>
            </dl>
          </section>

          <section class="inspector-section agent-task">
            <div class="section-heading">
              <div>
                <span class="eyebrow">Natural-language task</span>
                <h2>让 Agent 操作世界</h2>
              </div>
              <span class="step-number">01</span>
            </div>
            <label class="field-label" for="agent-prompt">任务</label>
            <textarea
              id="agent-prompt"
              data-testid="agent-prompt"
              rows="4"
              value={prompt()}
              disabled={runtimeStatus() === "running"}
              onInput={(event) => setPrompt(event.currentTarget.value)}
            />
            <button
              class="button primary"
              data-testid="agent-run-button"
              disabled={
                runtimeStatus() === "connecting" ||
                runtimeStatus() === "running" ||
                projection()?.running === true ||
                !projection() ||
                prompt().trim().length === 0
              }
              onClick={() => void runAgentTurn()}
            >
              {runtimeStatus() === "running" ? "Agent 执行中…" : "运行 Agent turn"}
            </button>
            <button
              class="button ghost"
              disabled={runtimeStatus() === "running"}
              onClick={() => void createSession()}
            >
              新建空白 Session
            </button>
          </section>

          <section class="inspector-section trace-section" aria-live="polite">
            <div class="section-heading">
              <div>
                <span class="eyebrow">World tool trace</span>
                <h2>{toolEvents().length === 0 ? "等待 Agent" : `${toolEvents().length} 次调用`}</h2>
              </div>
              <span class="step-number">02</span>
            </div>
            <ol class="tool-trace" data-testid="tool-trace">
              <For each={toolEvents()}>
                {(event) => (
                  <li data-status={event.trace.status}>
                    <span>{event.trace.sequence.toString().padStart(2, "0")}</span>
                    <strong>{event.tool}</strong>
                    <em>{event.trace.status === "succeeded" ? "ok" : "failed"}</em>
                  </li>
                )}
              </For>
            </ol>
            <Show when={responseText()}>
              <p class="assistant-response">{responseText()}</p>
            </Show>
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
              <h2>{episode()?.id ?? "等待 world_run"}</h2>
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
          <h2 data-testid="selected-entity-ref">{selectedRef()}</h2>
          <dl class="vector-grid">
            <div><dt>position</dt><dd>{selectedState()?.pose.position.map((value) => formatNumber(value)).join("  ") ?? "—"}</dd></div>
            <div><dt>velocity</dt><dd>{selectedState()?.linearVelocity.map((value) => formatNumber(value)).join("  ") ?? "—"}</dd></div>
            <div>
              <dt>visual</dt>
              <dd data-testid="visual-kind">
                {importedVisual()?.assetId ?? selectedEntity()?.representations.visual.kind ?? "—"}
              </dd>
            </div>
            <Show when={importedVisual()}>
              {(visual) => (
                <>
                  <div><dt>digest</dt><dd data-testid="visual-digest">{visual().contentDigest}</dd></div>
                  <div><dt>source frame</dt><dd>{visual().sourceFrameRef}</dd></div>
                  <div><dt>source units</dt><dd>{formatNumber(visual().sourceUnitMeters)} m</dd></div>
                  <div>
                    <dt>alignment</dt>
                    <dd data-testid="visual-alignment">
                      pos {visual().localTransform.position.map((value) => formatNumber(value)).join(" ")}
                      {" · "}q {Object.values(visual().localTransform.rotation).map((value) => formatNumber(value)).join(" ")}
                      {" · "}tol {formatNumber(DIAGNOSTIC_RIGID_ASSET.alignment.toleranceMeters)} m
                    </dd>
                  </div>
                  <div><dt>provenance</dt><dd>{DIAGNOSTIC_RIGID_ASSET.provenance.origin} · {DIAGNOSTIC_RIGID_ASSET.provenance.license}</dd></div>
                </>
              )}
            </Show>
            <div>
              <dt>collision</dt>
              <dd data-testid="collision-kind">
                {selectedEntity()
                  ? `${selectedEntity()?.representations.collision.kind} proxy · ${selectedEntity()?.representations.collision.halfExtents.map((value) => formatNumber(value * 2)).join(" × ")} m`
                  : "—"}
              </dd>
            </div>
            <div><dt>mass</dt><dd>{selectedEntity() ? `${formatNumber(selectedEntity()!.physics.massKg)} kg` : "—"}</dd></div>
          </dl>
        </div>

        <div class="evaluation-block">
          <div class="dock-heading">
            <div>
              <span class="eyebrow">Deterministic evaluation</span>
              <h2 data-testid="evaluation-status">
                {evaluation() ? (evaluation()?.passed ? "PASS" : "FAIL") : "等待 evidence"}
              </h2>
            </div>
            <Show when={evaluation()}>
              {(record) => <span class="evaluation-mark" data-pass={record().passed}>{record().passed ? "✓" : "×"}</span>}
            </Show>
          </div>
          <Show when={evaluation()} fallback={<p class="muted">Agent narration 不构成成功证据</p>}>
            {(record) => (
              <dl class="metrics">
                <div><dt>height error</dt><dd>{formatNumber(record().metrics.heightError, 5)} m</dd></div>
                <div><dt>terminal speed</dt><dd>{formatNumber(record().metrics.terminalLinearSpeed, 5)} m/s</dd></div>
              </dl>
            )}
          </Show>
          <dl class="compact-contract control-boundary">
            <div><dt>program</dt><dd>{FALLING_CUBE_PROGRAM.id}</dd></div>
            <div><dt>runtime</dt><dd>MuJoCo {MUJOCO_PROFILE.version}</dd></div>
            <div><dt>adopt</dt><dd>withheld from Agent</dd></div>
          </dl>
        </div>
      </section>

      <footer class="statusbar">
        <span>Authority: Gateway Product Session</span>
        <span>Presentation: Three.js</span>
        <span>Runtime: @mujoco/mujoco · Agent: restricted four-tool session</span>
      </footer>
    </main>
  );
}
