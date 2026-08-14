import {
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
import {
  ThreeViewport,
} from "./presentation-three/ThreeViewport";
import type { AlignmentEvidence } from "./presentation-three/alignment-evidence";
import { resolveImportedVisualAsset } from "./presentation-three/presentation-assets";
import { resolveRegisteredPresentationAsset } from "./presentation-three/registered-presentation";
import {
  defaultPresentationLayers,
  evaluationMetricRows,
  preferredSelection,
  presentationLayersFor,
  registeredIntegrityLabel,
  runContractSummary,
  type PresentationLayers,
  type RegisteredAssetLoadState,
} from "./presentation-model";
import {
  ProductSessionClient,
  ProductSessionTurnError,
} from "./product-session-client";

type RuntimeStatus = "connecting" | "ready" | "running" | "completed" | "error";
type ViewMode = "repository" | "episode";

const DEFAULT_PROMPT =
  "加载登记的 Marble 世界与混元 3D 物体，读取它们的 Frame、Units 与 physics proxy，让物体自由落体并验证稳定着陆。";

function formatNumber(value: number, digits = 3): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function collisionSummary(entity: Entity | undefined): string {
  if (!entity) return "—";
  const collision = entity.representations.collision;
  if (collision.kind === "box") {
    return `box proxy · ${collision.halfExtents
      .map((value) => formatNumber(value * 2))
      .join(" × ")} m`;
  }
  if (collision.kind === "sphere") {
    return `sphere proxy · Ø ${formatNumber(collision.radius * 2)} m`;
  }
  if (collision.kind === "none") return "no collision proxy";
  return `compound proxy · ${collision.parts.length} parts`;
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
  const [selectedRef, setSelectedRef] = createSignal<Entity["ref"]>();
  const [presentationLayers, setPresentationLayers] = createSignal<PresentationLayers>({
    mesh: true,
    splat: false,
    collision: false,
    alignment: false,
  });
  const [alignmentEvidence, setAlignmentEvidence] = createSignal<AlignmentEvidence>();
  const [registeredAssetStates, setRegisteredAssetStates] = createSignal<
    readonly RegisteredAssetLoadState[]
  >([]);
  const [runtimeStatus, setRuntimeStatus] = createSignal<RuntimeStatus>("connecting");
  const [errorMessage, setErrorMessage] = createSignal<string>();
  let turnAbort: AbortController | undefined;

  const episode = createMemo(() => lastRun()?.episode);
  const evaluation = createMemo(() => lastRun()?.evaluation);
  const metricRows = createMemo(() => evaluationMetricRows(evaluation()));
  const activeSample = createMemo(() => {
    if (viewMode() !== "episode") return undefined;
    return episode()?.samples[timelineIndex()];
  });
  const currentSnapshot = createMemo(() => world()?.snapshot);
  const currentRef = createMemo(() => world()?.ref);
  const selectedEntity = createMemo(() => {
    const ref = selectedRef();
    return ref
      ? currentSnapshot()?.entities.find((entity) => entity.ref === ref)
      : undefined;
  });
  const selectedState = createMemo(() => {
    const sample = activeSample();
    const ref = selectedRef();
    return sample && ref ? sample.states[ref] : selectedEntity()?.state;
  });
  const importedVisual = createMemo(() => {
    const visual = selectedEntity()?.representations.visual;
    return visual?.kind === "imported-rigid-mesh" ? visual : undefined;
  });
  const importedAsset = createMemo(() => {
    const visual = importedVisual();
    return visual ? resolveImportedVisualAsset(visual) : undefined;
  });
  const registeredVisual = createMemo(() => {
    const visual = selectedEntity()?.representations.visual;
    return visual?.kind === "registered-rigid-mesh" ? visual : undefined;
  });
  const registeredAsset = createMemo(() => {
    const visual = registeredVisual();
    return visual ? resolveRegisteredPresentationAsset(visual) : undefined;
  });
  const registeredAssetStatus = createMemo(() => {
    const assetId = registeredAsset()?.asset.assetId;
    return assetId
      ? registeredAssetStates().find((state) => state.assetId === assetId)?.status
      : undefined;
  });
  const vesselSemantic = createMemo(() => {
    const semantic = selectedEntity()?.representations.semantic;
    return semantic?.kind === "vessel" ? semantic : undefined;
  });
  const articulatedSemantic = createMemo(() => {
    const semantic = selectedEntity()?.representations.semantic;
    return semantic?.kind === "articulated" ? semantic : undefined;
  });
  const articulatedState = createMemo(() => selectedState()?.articulated);
  const contractSummary = createMemo(() => runContractSummary(lastRun()));
  const displayedSource = createMemo(() => {
    if (viewMode() === "episode") {
      const ref = selectedRef();
      return ref && activeSample()?.states[ref]
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

  const reconcilePresentation = (
    nextWorld: WorldReadResult | undefined,
    resetSelection = false,
  ) => {
    const snapshot = nextWorld?.snapshot;
    const previousRef = resetSelection ? undefined : selectedRef();
    const ref = preferredSelection(snapshot, previousRef);
    setSelectedRef(ref);
    setPresentationLayers(
      ref !== previousRef
        ? defaultPresentationLayers(snapshot)
        : presentationLayersFor(snapshot, presentationLayers()),
    );
    setAlignmentEvidence(undefined);
  };

  const setAuthoritativeWorld = (
    nextWorld: WorldReadResult | undefined,
    resetSelection = false,
  ) => {
    setWorld(nextWorld);
    reconcilePresentation(nextWorld, resetSelection);
  };

  const useProjection = (next: ProductSessionProjection, resetSelection = false) => {
    setProjection(next);
    setAuthoritativeWorld(next.world ?? undefined, resetSelection);
    setLastRun(next.lastRun ?? undefined);
    if (next.lastRun) {
      setTimelineIndex(0);
      setViewMode("episode");
    }
  };

  const createSession = async () => {
    setRuntimeStatus("connecting");
    setErrorMessage(undefined);
    setProjection(undefined);
    setAuthoritativeWorld(undefined, true);
    setLastRun(undefined);
    setEvents([]);
    setResponseText("");
    setTimelineIndex(0);
    setViewMode("repository");
    setRegisteredAssetStates([]);
    try {
      useProjection(await client.createSession(), true);
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
        setAuthoritativeWorld(event.evidence);
        break;
      case "write":
        setAuthoritativeWorld(
          deepFreeze({
            tool: "read",
            ref: event.evidence.ref,
            snapshot: event.evidence.snapshot,
          }) as WorldReadResult,
        );
        break;
      case "edit":
        setAuthoritativeWorld(
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
        setAuthoritativeWorld(undefined, true);
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

  const selectEntity = (ref: Entity["ref"]) => {
    setSelectedRef(ref);
    setPresentationLayers(presentationLayersFor(currentSnapshot(), presentationLayers()));
    setAlignmentEvidence(undefined);
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
            presentationLayers={presentationLayers()}
            onSelect={selectEntity}
            onAlignmentEvidence={setAlignmentEvidence}
            onRegisteredAssetStates={setRegisteredAssetStates}
          />
          <Show when={!currentSnapshot()}>
            <div class="viewport-empty" data-testid="viewport-empty">
              <span>等待 Gateway 创建第一个 Snapshot</span>
            </div>
          </Show>
          <div class="axis-key" aria-label="坐标轴图例">
            <span class="axis-x">X</span><span class="axis-y">Y</span><span class="axis-z">Z</span>
          </div>
          <div class="presentation-switch" role="group" aria-label="Presentation layers">
            <For each={([
              ["mesh", "Mesh"],
              ["splat", "3DGS"],
              ["collision", "Collision"],
              ["alignment", "Alignment"],
            ] as const)}>
              {([layer, label]) => (
                <button
                  type="button"
                  data-testid={`presentation-${layer === "splat" ? "3dgs" : layer}`}
                  aria-pressed={presentationLayers()[layer]}
                  disabled={layer === "splat" && !currentSnapshot()?.entities.some(
                    (entity) => entity.representations.observation !== null,
                  )}
                  title={
                    layer === "splat" && !currentSnapshot()?.entities.some(
                      (entity) => entity.representations.observation !== null,
                    )
                      ? "当前 Snapshot 没有 3DGS Observation"
                      : undefined
                  }
                  onClick={() => setPresentationLayers((current) => ({
                    ...current,
                    [layer]: !current[layer],
                  }))}
                >
                  {label}
                </button>
              )}
            </For>
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
          <h2 data-testid="selected-entity-ref">{selectedRef() ?? "—"}</h2>
          <dl class="vector-grid">
            <div><dt>position</dt><dd>{selectedState()?.pose.position.map((value) => formatNumber(value)).join("  ") ?? "—"}</dd></div>
            <div><dt>velocity</dt><dd>{selectedState()?.linearVelocity.map((value) => formatNumber(value)).join("  ") ?? "—"}</dd></div>
            <div>
              <dt>visual</dt>
              <dd data-testid="visual-kind">
                {importedVisual()?.assetId ?? registeredVisual()?.assetId ?? selectedEntity()?.representations.visual.kind ?? "—"}
              </dd>
            </div>
            <Show when={importedVisual()}>
              {(visual) => (
                <>
                  <div><dt>digest</dt><dd data-testid="visual-digest">{visual().contentDigest}</dd></div>
                  <div><dt>source frame</dt><dd>{visual().sourceFrameRef}</dd></div>
                  <div><dt>source units</dt><dd>{formatNumber(visual().sourceUnitMeters)} m</dd></div>
                  <div>
                    <dt>local transform</dt>
                    <dd data-testid="visual-alignment">
                      pos {visual().localTransform.position.map((value) => formatNumber(value)).join(" ")}
                      {" · "}q {Object.values(visual().localTransform.rotation).map((value) => formatNumber(value)).join(" ")}
                      <Show when={importedAsset()?.alignmentToleranceMeters !== undefined}>
                        {" · "}tol {formatNumber(importedAsset()!.alignmentToleranceMeters!)} m
                      </Show>
                    </dd>
                  </div>
                  <div>
                    <dt>artifact</dt>
                    <dd>
                      <a data-testid="visual-artifact-url" href={importedAsset()?.url}>
                        {importedAsset()?.repoPath}
                      </a>
                    </dd>
                  </div>
                  <div><dt>provenance</dt><dd>{importedAsset()?.provenance.origin} · {importedAsset()?.provenance.license}</dd></div>
                </>
              )}
            </Show>
            <Show when={registeredAsset()}>
              {(resolved) => (
                <>
                  <div><dt>assetId</dt><dd data-testid="registered-asset-id">{resolved().asset.assetId}</dd></div>
                  <div><dt>digest</dt><dd data-testid="registered-asset-digest">sha256:{resolved().asset.digest.slice(0, 16)}…</dd></div>
                  <div><dt>source frame</dt><dd>{resolved().calibration.sourceFrameRef}</dd></div>
                  <div><dt>target frame</dt><dd>{resolved().calibration.targetFrameRef}</dd></div>
                  <div><dt>units</dt><dd>{formatNumber(resolved().calibration.sourceUnitMeters)} m → {formatNumber(resolved().calibration.targetUnitMeters)} m</dd></div>
                  <div><dt>integrity</dt><dd data-testid="registered-integrity">{registeredIntegrityLabel(registeredAssetStatus())}</dd></div>
                  <div><dt>calibration</dt><dd data-testid="registered-calibration">CALIBRATION AUTHORED / UNVERIFIED</dd></div>
                  <div><dt>proxy witness</dt><dd data-testid="registered-witness">PROXY WITNESS {resolved().witness.passed ? "PASS" : "FAIL"}</dd></div>
                  <div>
                    <dt>artifact route</dt>
                    <dd><a href={resolved().url}>{resolved().url}</a></dd>
                  </div>
                </>
              )}
            </Show>
            <Show when={vesselSemantic()}>
              {(semantic) => (
                <>
                  <div><dt>rim frame</dt><dd data-testid="rim-frame-ref">{semantic().rimFrame.ref}</dd></div>
                  <div>
                    <dt>rim local pose</dt>
                    <dd>{semantic().rimFrame.localPose.position.map((value) => formatNumber(value)).join(" ")}</dd>
                  </div>
                  <div>
                    <dt>inner envelope</dt>
                    <dd>r {formatNumber(semantic().innerEnvelope.radiusMeters)} m · floor z {formatNumber(semantic().innerEnvelope.innerFloorZMeters)} m · rim z {formatNumber(semantic().innerEnvelope.rimZMeters)} m</dd>
                  </div>
                </>
              )}
            </Show>
            <Show when={articulatedSemantic()}>
              {(semantic) => (
                <>
                  <div><dt>links</dt><dd data-testid="arm-links">{semantic().links.map((link) => link.linkRef).join(" · ")}</dd></div>
                  <div><dt>joints</dt><dd data-testid="arm-joints">{semantic().joints.map((joint) => joint.jointRef).join(" · ")}</dd></div>
                  <div><dt>actuators</dt><dd data-testid="arm-actuators">{semantic().actuators.map((actuator) => actuator.actuatorRef).join(" · ")}</dd></div>
                  <div><dt>sensors</dt><dd data-testid="arm-sensors">{semantic().sensors.map((sensor) => `${sensor.sensorRef} [${sensor.unit}]`).join(" · ")}</dd></div>
                  <div><dt>frames</dt><dd data-testid="arm-frames">{semantic().frames.map((frame) => frame.frameRef).join(" · ")}</dd></div>
                </>
              )}
            </Show>
            <Show when={articulatedState()}>
              {(state) => (
                <div>
                  <dt>joint state</dt>
                  <dd data-testid="arm-joint-state">{state().joints.map((joint) => `${joint.jointRef} ${formatNumber(joint.positionRadians)} rad · ${formatNumber(joint.velocityRadiansPerSecond)} rad/s`).join(" | ")}</dd>
                </div>
              )}
            </Show>
            <Show when={selectedEntity()?.representations.observation}>
              {(observation) => (
                <>
                  <div><dt>observation</dt><dd data-testid="observation-asset">{observation().assetId}</dd></div>
                  <div><dt>role</dt><dd>{observation().role} · Spark Presentation</dd></div>
                  <div>
                    <dt>alignment</dt>
                    <dd
                      data-testid="alignment-status"
                      data-pass={alignmentEvidence()?.passed ?? false}
                    >
                      {alignmentEvidence()
                        ? `${alignmentEvidence()!.passed ? "PASS" : "FAIL"} · bounds ${formatNumber(alignmentEvidence()!.maxBoundsErrorMeters, 6)} m · pose ${formatNumber(alignmentEvidence()!.poseTranslationErrorMeters, 6)} m / ${formatNumber(alignmentEvidence()!.poseAngularErrorRadians, 6)} rad · tol ${formatNumber(alignmentEvidence()!.toleranceMeters, 4)} m`
                        : "等待 Spark observation"}
                    </dd>
                  </div>
                </>
              )}
            </Show>
            <Show when={alignmentEvidence()?.calibrationStatus}>
              <>
                <div><dt>world integrity</dt><dd data-testid="world-integrity">INTEGRITY {alignmentEvidence()?.integrityStatus?.toUpperCase()}</dd></div>
                <div><dt>world calibration</dt><dd>CALIBRATION AUTHORED / UNVERIFIED</dd></div>
                <div><dt>world proxy witness</dt><dd>PROXY WITNESS {alignmentEvidence()?.proxyWitnessStatus?.toUpperCase()}</dd></div>
                <div><dt>bounds error</dt><dd>{formatNumber(alignmentEvidence()?.maxBoundsErrorMeters ?? NaN, 6)} m</dd></div>
              </>
            </Show>
            <div>
              <dt>collision</dt>
              <dd data-testid="collision-kind">
                {collisionSummary(selectedEntity())}
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
          <Show when={metricRows().length > 0} fallback={<p class="muted">Agent narration 不构成成功证据</p>}>
            <dl class="metrics" data-testid="evaluation-metrics">
              <For each={metricRows()}>
                {(metric) => (
                  <div data-metric={metric.key}>
                    <dt>{metric.label}</dt>
                    <dd>
                      {typeof metric.value === "number"
                        ? formatNumber(metric.value, 5)
                        : metric.value} {metric.unit}
                    </dd>
                  </div>
                )}
              </For>
            </dl>
          </Show>
          <dl class="compact-contract control-boundary">
            <div><dt>program</dt><dd data-testid="program-id">{contractSummary().programId}</dd></div>
            <div><dt>kind</dt><dd data-testid="program-kind">{contractSummary().programKind}</dd></div>
            <div><dt>steps</dt><dd data-testid="program-steps">{contractSummary().programSteps.join(" | ") || "—"}</dd></div>
            <div><dt>runtime</dt><dd data-testid="runtime-profile-id">{contractSummary().runtimeProfileId}</dd></div>
            <div><dt>adopt</dt><dd>withheld from Agent</dd></div>
          </dl>
        </div>
      </section>

      <footer class="statusbar">
        <span>Authority: Gateway Product Session</span>
        <span>
          Presentation: Three.js + Spark · {Object.entries(presentationLayers()).filter(([, enabled]) => enabled).map(([layer]) => layer).join(" + ") || "none"}
        </span>
        <span>Runtime: @mujoco/mujoco · Agent: restricted four-tool session</span>
      </footer>
    </main>
  );
}
