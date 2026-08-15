import {
  GENERATED_OBJECT_REF,
  MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID,
  MARBLE_HUNYUAN_REGISTRY,
  deepFreeze,
  type Entity,
  type ProductSessionEvent,
  type ProductSessionProjection,
  type WorldReadResult,
  type WorldRunResult,
} from "@demiurges/world";
import {
  createMemo,
  createEffect,
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
  registeredAuthoringReady,
  runContractSummary,
  type PresentationLayers,
  type RegisteredAssetLoadState,
} from "./presentation-model";
import {
  ProductSessionAuthoringError,
  ProductSessionClient,
  ProductSessionTurnError,
  type WorldProjectSummary,
} from "./product-session-client";
import {
  createPoseDraft,
  poseDraftWorldEditInput,
  updatePoseDraft,
  type PoseDraft,
  type PoseDraftMode,
} from "./scene-composer";
import {
  canExportBoundProject,
  hasWorldAuthorityTransition,
} from "./world-project-ui-state";
import type { ObserverMode } from "./presentation-three/observer-camera";

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
    grid: false,
    bounds: false,
    collision: false,
    alignment: false,
  });
  const [alignmentEvidence, setAlignmentEvidence] = createSignal<AlignmentEvidence>();
  const [registeredAssetStates, setRegisteredAssetStates] = createSignal<
    readonly RegisteredAssetLoadState[]
  >([]);
  const [runtimeStatus, setRuntimeStatus] = createSignal<RuntimeStatus>("connecting");
  const [busyLabel, setBusyLabel] = createSignal("Agent 正在改变并推演世界");
  const [errorMessage, setErrorMessage] = createSignal<string>();
  const [poseDraft, setPoseDraft] = createSignal<PoseDraft>();
  const [poseDraftMode, setPoseDraftMode] = createSignal<PoseDraftMode>("translate");
  const [observerMode, setObserverMode] = createSignal<ObserverMode>("overview");
  const [projects, setProjects] = createSignal<readonly WorldProjectSummary[]>([]);
  const [projectMode, setProjectMode] = createSignal<"writer" | "reader" | "unavailable">("unavailable");
  const [activeProject, setActiveProject] = createSignal<WorldProjectSummary>();
  const [projectDirty, setProjectDirty] = createSignal(false);
  const [projectIdDraft, setProjectIdDraft] = createSignal("project:untitled-world");
  const [projectNameDraft, setProjectNameDraft] = createSignal("未命名世界");
  const [projectSelection, setProjectSelection] = createSignal("");
  let turnAbort: AbortController | undefined;
  let importInput: HTMLInputElement | undefined;
  let pendingSaveKey: { fingerprint: string; key: string } | undefined;
  let pendingImportKey: { fingerprint: string; key: string } | undefined;

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
    if (!visual) return undefined;
    try {
      return resolveImportedVisualAsset(visual);
    } catch {
      return undefined;
    }
  });
  const registeredVisual = createMemo(() => {
    const visual = selectedEntity()?.representations.visual;
    return visual?.kind === "registered-rigid-mesh" ? visual : undefined;
  });
  const registeredAsset = createMemo(() => {
    const visual = registeredVisual();
    if (!visual) return undefined;
    try {
      return resolveRegisteredPresentationAsset(visual);
    } catch {
      return undefined;
    }
  });
  const selectedPresentationError = createMemo(() => {
    if (registeredVisual() && !registeredAsset()) return "REGISTERED PRESENTATION INTEGRITY FAILED";
    if (importedVisual() && !importedAsset()) return "IMPORTED PRESENTATION INTEGRITY FAILED";
    return undefined;
  });
  const registeredAssetStatus = createMemo(() => {
    const assetId = registeredAsset()?.asset.assetId;
    return assetId
      ? registeredAssetStates().find((state) => state.assetId === assetId)?.status
      : undefined;
  });
  const generatedVisualStatus = createMemo(() => {
    const assetId = MARBLE_HUNYUAN_REGISTRY.assets[2]!.assetId;
    return registeredAssetStates().find((state) => state.assetId === assetId)?.status;
  });
  const generatedVisualReady = createMemo(() => registeredAuthoringReady(
    registeredAssetStates(),
    MARBLE_HUNYUAN_REGISTRY.assets[2]!.assetId,
  ));
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
    if (poseDraft() && (
      !nextWorld ||
      poseDraft()!.baseRef.snapshotId !== nextWorld.ref.snapshotId ||
      poseDraft()!.baseRef.version !== nextWorld.ref.version
    )) setPoseDraft(undefined);
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

  const useMutationProjection = (
    prior: ProductSessionProjection,
    next: ProductSessionProjection,
    resetSelection = false,
  ) => {
    if (activeProject() && hasWorldAuthorityTransition(prior, next)) {
      setProjectDirty(true);
    }
    useProjection(next, resetSelection);
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
    setPoseDraft(undefined);
    setActiveProject(undefined);
    setProjectDirty(false);
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

  const refreshProjects = async () => {
    try {
      const result = await client.listProjects();
      setProjectMode(result.mode);
      setProjects(result.projects);
      setProjectSelection((current) =>
        result.projects.some((project) => project.projectId === current)
          ? current
          : result.projects[0]?.projectId ?? "",
      );
    } catch {
      setProjectMode("unavailable");
      setProjects([]);
      setProjectSelection("");
    }
  };

  const openSelectedProject = async () => {
    const projectId = projectSelection();
    if (!projectId || runtimeStatus() === "running") return;
    setRuntimeStatus("running");
    setBusyLabel("正在验证并打开 World Project");
    setErrorMessage(undefined);
    setPoseDraft(undefined);
    try {
      const opened = await client.openProject(projectId);
      useProjection(opened.session, true);
      setActiveProject(opened.project);
      setProjectDirty(false);
      setProjectIdDraft(opened.project.projectId);
      setProjectNameDraft(opened.project.displayName);
      setViewMode("repository");
      setRuntimeStatus("completed");
    } catch (error) {
      setRuntimeStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "打开 World Project 失败");
    }
  };

  const saveProject = async (saveAs: boolean) => {
    const current = projection();
    const active = activeProject();
    if (!current?.world || runtimeStatus() === "running" || projectMode() !== "writer") return;
    const input = {
      projectId: projectIdDraft().trim(),
      displayName: projectNameDraft().trim(),
      expectedRevision: saveAs ? null : active?.revision ?? null,
    };
    if (!saveAs && !active) return;
    const fingerprint = JSON.stringify({ sessionId: current.sessionId, ref: current.world.ref, input });
    const key = pendingSaveKey?.fingerprint === fingerprint
      ? pendingSaveKey.key
      : crypto.randomUUID();
    pendingSaveKey = { fingerprint, key };
    setRuntimeStatus("running");
    setBusyLabel(saveAs ? "正在另存为 World Project" : "正在保存 World Project");
    setErrorMessage(undefined);
    try {
      const saved = await client.saveProject(current.sessionId, input, key);
      pendingSaveKey = undefined;
      setActiveProject(saved);
      setProjectDirty(false);
      setProjectIdDraft(saved.projectId);
      setProjectNameDraft(saved.displayName);
      await refreshProjects();
      setProjectSelection(saved.projectId);
      setRuntimeStatus("completed");
    } catch (error) {
      setRuntimeStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "保存 World Project 失败");
    }
  };

  const moveProjectHistory = async (direction: "undo" | "redo") => {
    const current = projection();
    if (!current || !activeProject() || runtimeStatus() === "running") return;
    setRuntimeStatus("running");
    setBusyLabel(direction === "undo" ? "正在撤销到上一 Snapshot" : "正在重做到下一 Snapshot");
    setErrorMessage(undefined);
    setPoseDraft(undefined);
    try {
      const next = await client.moveProjectHistory(
        current.sessionId,
        current,
        direction,
        activeProject()!.revision,
      );
      useMutationProjection(current, next);
      setViewMode("repository");
      setRuntimeStatus("completed");
    } catch (error) {
      setRuntimeStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "World Project history 操作失败");
    }
  };

  const exportActiveProject = async () => {
    const active = activeProject();
    if (!active || !canExportBoundProject(true, projectDirty(), runtimeStatus() === "running")) return;
    setRuntimeStatus("running");
    setBusyLabel("正在导出确定性 World Project bundle");
    setErrorMessage(undefined);
    try {
      const bytes = await client.exportProject(active.projectId);
      const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], {
        type: "application/vnd.demiurges.world-project+zip",
      }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${active.projectId.slice("project:".length)}.dworld`;
      anchor.click();
      URL.revokeObjectURL(url);
      setRuntimeStatus("completed");
    } catch (error) {
      setRuntimeStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "导出 World Project 失败");
    }
  };

  const importProject = async (file: File) => {
    if (runtimeStatus() === "running" || projectMode() !== "writer") return;
    const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
    const key = pendingImportKey?.fingerprint === fingerprint
      ? pendingImportKey.key
      : crypto.randomUUID();
    pendingImportKey = { fingerprint, key };
    setRuntimeStatus("running");
    setBusyLabel("正在验证并导入 World Project bundle");
    setErrorMessage(undefined);
    try {
      const imported = await client.importProject(
        new Uint8Array(await file.arrayBuffer()),
        key,
      );
      pendingImportKey = undefined;
      await refreshProjects();
      setProjectSelection(imported.projectId);
      const opened = await client.openProject(imported.projectId);
      useProjection(opened.session, true);
      setActiveProject(opened.project);
      setProjectDirty(false);
      setProjectIdDraft(opened.project.projectId);
      setProjectNameDraft(opened.project.displayName);
      setRuntimeStatus("completed");
    } catch (error) {
      setRuntimeStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "导入 World Project 失败");
    } finally {
      if (importInput) importInput.value = "";
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
    setBusyLabel("Agent 正在改变并推演世界");
    setPoseDraft(undefined);
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
      useMutationProjection(current, next);
      setRuntimeStatus("completed");
    } catch (error) {
      setRuntimeStatus("error");
      if (error instanceof ProductSessionTurnError) {
        useMutationProjection(current, error.projection);
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
    setPoseDraft(undefined);
    setTimelineIndex(index);
    setViewMode("episode");
  };

  const selectEntity = (ref: Entity["ref"]) => {
    if (ref !== GENERATED_OBJECT_REF) setPoseDraft(undefined);
    setSelectedRef(ref);
    setPresentationLayers(presentationLayersFor(currentSnapshot(), presentationLayers()));
    setAlignmentEvidence(undefined);
  };

  const createRegisteredComposition = async () => {
    const current = projection();
    if (!current || current.world || runtimeStatus() === "running") return;
    setRuntimeStatus("running");
    setBusyLabel("正在创建已登记组合");
    setErrorMessage(undefined);
    try {
      const next = await client.writeWorld(current.sessionId, {
        fixtureId: MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID,
      }, current);
      useMutationProjection(current, next, true);
      setSelectedRef(GENERATED_OBJECT_REF);
      setViewMode("repository");
      setRuntimeStatus("completed");
    } catch (error) {
      if (error instanceof ProductSessionAuthoringError) {
        useMutationProjection(current, error.projection);
      }
      setRuntimeStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "创建已登记组合失败");
    }
  };

  const beginPoseDraft = (mode: PoseDraftMode) => {
    const entity = currentSnapshot()?.entities.find((candidate) => candidate.ref === GENERATED_OBJECT_REF);
    const ref = currentRef();
    if (!entity || !ref || !generatedVisualReady() || observerMode() !== "inspect" || viewMode() !== "repository") return;
    setSelectedRef(GENERATED_OBJECT_REF);
    setPoseDraftMode(mode);
    const current = poseDraft();
    setPoseDraft(current
      ? updatePoseDraft(
          current,
          current.pose.position,
          2 * Math.atan2(current.pose.rotation.z, current.pose.rotation.w),
          mode,
        )
      : createPoseDraft(ref, entity, mode));
  };

  createEffect(() => {
    const status = generatedVisualStatus();
    if (poseDraft() && status !== "loaded") setPoseDraft(undefined);
  });

  const updateDraftFromViewport = (
    position: readonly [number, number, number],
    yawRadians: number,
  ) => {
    if (runtimeStatus() === "running") return;
    const current = poseDraft();
    if (!current) return;
    try {
      setPoseDraft(updatePoseDraft(current, position, yawRadians, poseDraftMode()));
      setErrorMessage(undefined);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "变换超出可提交范围");
    }
  };

  const commitPoseDraft = async () => {
    const current = projection();
    const draft = poseDraft();
    if (!current || !draft || runtimeStatus() === "running") return;
    setRuntimeStatus("running");
    setBusyLabel("正在提交确定性 world_edit");
    setErrorMessage(undefined);
    try {
      const next = await client.editWorld(
        current.sessionId,
        poseDraftWorldEditInput(draft),
        current,
      );
      setPoseDraft(undefined);
      useMutationProjection(current, next);
      setViewMode("repository");
      setRuntimeStatus("completed");
    } catch (error) {
      setPoseDraft(undefined);
      if (error instanceof ProductSessionAuthoringError) {
        useMutationProjection(current, error.projection);
      }
      setRuntimeStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "提交 world_edit 失败");
    }
  };

  onMount(() => {
    void createSession();
    void refreshProjects();
  });
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
              ? busyLabel()
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
            poseDraft={poseDraft()}
            poseDraftMode={poseDraftMode()}
            poseDraftInputEnabled={runtimeStatus() !== "running"}
            onPoseDraftChange={updateDraftFromViewport}
            onPoseDraftCancel={() => setPoseDraft(undefined)}
            onObserverModeChange={setObserverMode}
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
              ["grid", "Grid"],
              ["bounds", "Bounds"],
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

          <section class="inspector-section project-control" data-testid="world-project-control">
            <div class="section-heading">
              <div>
                <span class="eyebrow">Persistent world fact</span>
                <h2>World Project</h2>
              </div>
              <span class="project-mode" data-mode={projectMode()}>{projectMode()}</span>
            </div>
            <label class="field-label" for="project-id">Project ID</label>
            <input
              id="project-id"
              data-testid="project-id-input"
              value={projectIdDraft()}
              disabled={runtimeStatus() === "running"}
              onInput={(event) => {
                pendingSaveKey = undefined;
                setProjectIdDraft(event.currentTarget.value);
              }}
            />
            <label class="field-label" for="project-name">名称</label>
            <input
              id="project-name"
              data-testid="project-name-input"
              value={projectNameDraft()}
              disabled={runtimeStatus() === "running"}
              onInput={(event) => {
                pendingSaveKey = undefined;
                setProjectNameDraft(event.currentTarget.value);
                if (
                  activeProject() &&
                  event.currentTarget.value !== activeProject()!.displayName
                ) setProjectDirty(true);
              }}
            />
            <div class="project-actions" role="group" aria-label="World Project save actions">
              <button class="button secondary" disabled={!activeProject() || !currentSnapshot() || projectMode() !== "writer" || runtimeStatus() === "running"} onClick={() => void saveProject(false)}>保存</button>
              <button class="button primary" data-testid="project-save-as" disabled={!currentSnapshot() || projectMode() !== "writer" || runtimeStatus() === "running"} onClick={() => void saveProject(true)}>另存为</button>
              <button class="button ghost" disabled={!activeProject() || runtimeStatus() === "running"} onClick={() => void moveProjectHistory("undo")}>撤销</button>
              <button class="button ghost" disabled={!activeProject() || runtimeStatus() === "running"} onClick={() => void moveProjectHistory("redo")}>重做</button>
            </div>
            <label class="field-label" for="recent-project">最近项目</label>
            <div class="project-open-row">
              <select
                id="recent-project"
                data-testid="recent-projects"
                value={projectSelection()}
                disabled={projects().length === 0 || runtimeStatus() === "running"}
                onChange={(event) => setProjectSelection(event.currentTarget.value)}
              >
                <Show when={projects().length === 0}>
                  <option value="">暂无已验证项目</option>
                </Show>
                <For each={projects()}>
                  {(project) => <option value={project.projectId}>{project.displayName} · {project.projectId}</option>}
                </For>
              </select>
              <button class="button secondary" disabled={!projectSelection() || runtimeStatus() === "running"} onClick={() => void openSelectedProject()}>打开</button>
            </div>
            <div class="project-actions">
              <button class="button ghost" disabled={!canExportBoundProject(Boolean(activeProject()), projectDirty(), runtimeStatus() === "running")} onClick={() => void exportActiveProject()}>导出 .dworld</button>
              <button class="button ghost" disabled={projectMode() !== "writer" || runtimeStatus() === "running"} onClick={() => importInput?.click()}>导入 .dworld</button>
              <input
                ref={importInput}
                class="visually-hidden"
                data-testid="project-import-input"
                type="file"
                accept=".dworld,application/vnd.demiurges.world-project+zip"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) void importProject(file);
                }}
              />
            </div>
            <p class="project-revision" data-testid="active-project-revision">
              {activeProject()
                ? projectDirty()
                  ? `${activeProject()!.projectId} · 未保存更改（保存后才能导出）`
                  : `${activeProject()!.projectId} · ${activeProject()!.revision.slice(0, 31)}…`
                : projectMode() === "unavailable"
                  ? "Data Root 未配置，当前仍是内存 Session"
                  : "尚未绑定 Project；相机、选择和 Draft 不会被保存"}
            </p>
          </section>

          <section class="inspector-section scene-composer" data-testid="scene-composer">
            <div class="section-heading">
              <div>
                <span class="eyebrow">Registered scene composer</span>
                <h2>Marble × Hunyuan 3D</h2>
              </div>
              <span class="step-number">00</span>
            </div>
            <div class="asset-role-grid">
              <article data-testid="composer-environment-card">
                <strong>Marble environment</strong>
                <span>{MARBLE_HUNYUAN_REGISTRY.assets[0]?.assetId}</span>
                <small>Observation · frame:world · units:si</small>
                <em>CALIBRATION AUTHORED / UNVERIFIED</em>
              </article>
              <article data-testid="composer-object-card">
                <strong>Hunyuan generated object</strong>
                <span>{MARBLE_HUNYUAN_REGISTRY.assets[2]?.assetId}</span>
                <small>Visual · frame:world · units:si</small>
                <em>PROXY WITNESS PASS</em>
              </article>
            </div>
            <Show when={!currentSnapshot()} fallback={
              <div class="composer-toolbar" role="group" aria-label="Generated object transform">
                <button
                  class="button ghost"
                  aria-pressed={poseDraftMode() === "translate" && !!poseDraft()}
                  disabled={!generatedVisualReady() || observerMode() !== "inspect" || viewMode() !== "repository" || runtimeStatus() === "running"}
                  onClick={() => beginPoseDraft("translate")}
                >移动</button>
                <button
                  class="button ghost"
                  aria-pressed={poseDraftMode() === "rotate-z" && !!poseDraft()}
                  disabled={!generatedVisualReady() || observerMode() !== "inspect" || viewMode() !== "repository" || runtimeStatus() === "running"}
                  onClick={() => beginPoseDraft("rotate-z")}
                >绕 Z 旋转</button>
                <button class="button ghost" disabled={!poseDraft()} onClick={() => setPoseDraft(undefined)}>取消变换</button>
                <button class="button primary" data-testid="composer-commit" disabled={!poseDraft() || runtimeStatus() === "running"} onClick={() => void commitPoseDraft()}>提交变换</button>
              </div>
            }>
              <button
                class="button primary"
                data-testid="create-registered-composition"
                disabled={!projection() || runtimeStatus() === "running"}
                onClick={() => void createRegisteredComposition()}
              >创建已登记组合</button>
            </Show>
            <Show when={poseDraft()}>
              {(draft) => (
                <dl class="draft-readout" data-testid="pose-draft-readout">
                  <div><dt>Draft</dt><dd>Presentation only</dd></div>
                  <div><dt>base</dt><dd>{draft().baseRef.snapshotId} · v{draft().baseRef.version}</dd></div>
                  <div><dt>position</dt><dd>{draft().pose.position.map((value) => formatNumber(value)).join(" ")}</dd></div>
                  <div><dt>authority</dt><dd>{currentSnapshot()?.id}（未改变）</dd></div>
                </dl>
              )}
            </Show>
            <Show when={currentSnapshot() && observerMode() !== "inspect"}>
              <p class="muted">切换到 Inspect 后可移动或绕 world-Z 旋转 generated object。</p>
            </Show>
            <Show when={currentSnapshot() && !generatedVisualReady()}>
              <p class="muted" role="status" data-testid="composer-visual-required">
                Hunyuan visual {registeredIntegrityLabel(generatedVisualStatus())}；可查看 Collision proxy，但验证通过前不开放 gizmo。
              </p>
            </Show>
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
              <h2 data-testid="episode-id">{episode()?.id ?? "等待 world_run"}</h2>
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
            <Show when={selectedPresentationError()}>
              {(message) => (
                <div><dt>integrity</dt><dd role="alert" data-testid="selected-presentation-error">{message()}</dd></div>
              )}
            </Show>
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
              <h2 data-testid="evaluation-status" data-evaluation-id={evaluation()?.id ?? ""}>
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
