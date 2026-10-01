import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from "solid-js";
import {
  BALL_REF, BALL_VESSEL_TASK_LIMITS,
  type BallVesselTaskPreview, type ProductSessionProjection, type WorldReadResult, type WorldRunResult,
} from "@demiurges/world";
import { ProductSessionAuthoringError, ProductSessionAuthorityUnavailableError, type ProductSessionClient } from "./product-session-client";

export interface BallVesselTaskRunEvidence {
  readonly world: WorldReadResult;
  readonly run: WorldRunResult;
}
interface Props {
  readonly client: ProductSessionClient;
  readonly projection?: ProductSessionProjection;
  readonly disabled: boolean;
  readonly onProjection: (projection: ProductSessionProjection) => void;
  readonly onAuthorityUnavailable: (sessionId: string, message: string) => void;
  readonly onNewSession: () => void;
  readonly onBusy: (label?: string) => void;
  readonly onShowRun: (evidence: BallVesselTaskRunEvidence) => void;
}
const AXES = ["x", "y", "z"] as const;
const METRICS = [
  ["水平偏移", "maxHorizontalOffsetMeters", "m"],
  ["容器底部距离误差", "maxFloorDistanceErrorMeters", "m"],
  ["容器支撑帧", "supportSamples", "帧"],
] as const;

export function BallVesselTaskPanel(props: Props) {
  const [coordinates, setCoordinates] = createSignal(["1", "0", "1"]);
  const [preview, setPreview] = createSignal<BallVesselTaskPreview["proposal"]>();
  const [records, setRecords] = createSignal<readonly BallVesselTaskRunEvidence[]>([]);
  const [message, setMessage] = createSignal("");
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  let generation = 0, disposed = false;
  let controller: AbortController | undefined;
  const supported = createMemo(() => props.projection?.world?.snapshot.scenarioId === "scenario:ball-vessel-free-fall-v1");
  const candidate = createMemo(() => { const value = preview(); return value?.status === "available" ? value : undefined; });
  const locked = () => busy() || props.disabled || !props.projection || props.projection.running;
  const metric = (record: BallVesselTaskRunEvidence, key: typeof METRICS[number][1]) => {
    const evaluation = record.run.evaluation;
    return evaluation.contractId === "success:stable-inside-vessel" ? evaluation.metrics[key] : NaN;
  };

  createEffect(on(() => props.projection, (next, previous) => {
    if (next?.sessionId !== previous?.sessionId) {
      generation += 1;
      controller?.abort();
      setBusy(false); setRecords([]); setPreview(undefined); setMessage(""); setError("");
    }
    const ball = next?.world?.snapshot.entities.find((entity) => entity.ref === BALL_REF);
    if (ball) setCoordinates(ball.state.pose.position.map(String));
    if (previous && (next?.world?.ref.snapshotId !== previous.world?.ref.snapshotId ||
        next?.world?.ref.version !== previous.world?.ref.version ||
        next?.lastRun?.episode.id !== previous.lastRun?.episode.id)) {
      if (preview()?.status === "available") setMessage("世界或运行已更新，旧修复预览已过期。重新运行后再预览。");
      setPreview(undefined);
    }
  }));
  onCleanup(() => { disposed = true; generation += 1; controller?.abort(); });

  async function command<T>(label: string, action: (prior: ProductSessionProjection, signal: AbortSignal) => Promise<T>, accept: (value: T) => void) {
    const prior = props.projection;
    if (!prior || locked()) return;
    const token = ++generation;
    controller = new AbortController();
    setBusy(true); setError(""); setMessage(""); props.onBusy(label);
    const current = () => !disposed && token === generation && props.projection === prior;
    try {
      const value = await action(prior, controller.signal);
      if (current()) accept(value);
    } catch (failure) {
      if (!current()) return;
      if (failure instanceof ProductSessionAuthorityUnavailableError) {
        setPreview(undefined); setRecords([]);
        props.onAuthorityUnavailable(failure.sessionId, failure.message);
        return;
      }
      if (failure instanceof ProductSessionAuthoringError) props.onProjection(failure.projection);
      const text = failure instanceof Error ? failure.message : "任务请求失败";
      setError(text.includes("STALE_REF") ? "世界已更新，旧修复预览已过期。请重新运行后再预览。" : text);
    } finally {
      if (!disposed && token === generation) { controller = undefined; setBusy(false); props.onBusy(); }
    }
  }
  const create = () => command("正在创建球与容器", (prior, signal) => props.client.createBallWorld(prior, signal), props.onProjection);
  const run = () => command("MuJoCo 正在推演", (prior, signal) => props.client.runBallWorld(prior, signal), (next) => {
    if (next.world && next.lastRun) setRecords((previous) => [...previous, { world: next.world!, run: next.lastRun! }].slice(-2));
    props.onProjection(next);
  });
  const repair = () => command("正在预览修复", (prior, signal) => props.client.previewBallRepair(prior, signal), (result) => {
    setPreview(result.proposal);
    if (result.proposal.status === "unavailable") setMessage(result.proposal.reason === "already_passed"
      ? "当前世界的最近一次评估已通过，无需修复。" : result.proposal.reason === "run_required"
        ? "先运行一次，再依据评估预览修复。" : "当前证据不足，无法生成修复预览。");
  });
  const apply = () => {
    const candidate = preview();
    if (candidate?.status !== "available") return;
    return command("正在应用修复坐标", (prior, signal) => props.client.editBallWorld(prior, candidate.edit, signal), (next) => {
      setPreview(undefined); props.onProjection(next); setMessage("修复坐标已应用。再次运行，检查评估是否通过。");
    });
  };
  const setInitial = () => {
    const values = coordinates().map((value) => value.trim() === "" ? NaN : Number(value));
    if (!values.every((value, index) => Number.isFinite(value) && value >= BALL_VESSEL_TASK_LIMITS[AXES[index]!][0] && value <= BALL_VESSEL_TASK_LIMITS[AXES[index]!][1])) {
      setError("请输入范围内的数值：x/y 为 −2 到 2 m，z 为 0.7 到 2 m。"); return;
    }
    return command("正在更新球的初态", (prior, signal) => props.client.editBallWorld(prior, {
      expected: { ...prior.world!.ref }, targetRef: BALL_REF,
      change: { kind: "pose", frameRef: "frame:world", pose: { position: { x: values[0], y: values[1], z: values[2] }, rotation: { x: 0, y: 0, z: 0, w: 1 } } },
    }, signal), props.onProjection);
  };

  return <section class="inspector-section ball-task" aria-label="离线球与容器任务" data-testid="ball-vessel-task">
    <div class="section-heading"><div><span class="eyebrow">离线物理任务</span><h2>把球稳定放进容器</h2></div><span class="task-local-badge">无需模型</span></div>
    <p class="muted">调整球的起点，运行并根据评估尝试修复。</p>
    <Show when={supported()} fallback={
      props.projection?.world ? <p class="muted">新建空白 Session 后，即可开始此任务。</p>
        : <button class="button primary" data-testid="ball-task-create" disabled={locked()} onClick={() => void create()}>开始球与容器任务</button>
    }>
      <form onSubmit={(event) => { event.preventDefault(); void setInitial(); }} noValidate>
        <fieldset disabled={locked()} class="task-position-fields"><legend>球的初始位置（m）</legend>
          <For each={AXES}>{(axis, index) => <label class="task-coordinate"><span>{axis.toUpperCase()}</span>
            <input type="number" min={BALL_VESSEL_TASK_LIMITS[axis][0]} max={BALL_VESSEL_TASK_LIMITS[axis][1]} step="0.01" aria-label={`球的 ${axis} 初始位置`} data-testid={`ball-task-${axis}`} value={coordinates()[index()]} onInput={(event) => setCoordinates((previous) => previous.map((value, offset) => offset === index() ? event.currentTarget.value : value))} />
          </label>}</For>
        </fieldset>
        <p class="task-range">x/y：−2 ～ 2 · z：0.7 ～ 2</p>
        <div class="action-row"><button class="button secondary" type="submit" data-testid="ball-task-edit" disabled={locked()}>应用初态</button><button class="button ghost" type="button" disabled={locked()} onClick={() => setCoordinates(["1", "0", "1"])}>容器外示例</button></div>
      </form>
      <div class="action-row"><button class="button primary" data-testid="ball-task-run" disabled={locked()} onClick={() => void run()}>运行并评估</button><button class="button secondary" data-testid="ball-task-preview" disabled={locked() || !props.projection?.lastRun} onClick={() => void repair()}>预览修复</button></div>
      <Show when={candidate()}>{(value) => <div class="task-repair-preview" data-testid="ball-task-candidate"><strong>修复预览</strong><p>建议起点：({value().edit.change.pose.position.x}, {value().edit.change.pose.position.y}, {value().edit.change.pose.position.z}) m</p><p class="muted">当前世界尚未改变。应用后需再次运行。</p><button class="button secondary" data-testid="ball-task-apply" disabled={locked()} onClick={() => void apply()}>应用修复坐标</button></div>}</Show>
      <Show when={records().length}><div class="task-comparison"><h3>最近两次运行</h3>
        <div class="task-run-list"><For each={records()}>{(record, index) => <article data-pass={record.run.evaluation.passed} data-testid="ball-task-run-record"><strong>运行 {index() + 1} · {record.run.evaluation.passed ? "PASS" : "FAIL"}</strong><span>初态 v{record.world.ref.version}</span><button class="button ghost" disabled={locked()} data-testid={`ball-task-replay-${index()}`} onClick={() => props.onShowRun(record)}>回放此运行</button></article>}</For></div>
        <table aria-label="运行指标比较"><thead><tr><th>指标</th><For each={records()}>{(_record, index) => <th>运行 {index() + 1}</th>}</For></tr></thead><tbody><For each={METRICS}>{([label, key, unit]) => <tr><th scope="row">{label}</th><For each={records()}>{(record) => <td>{metric(record, key).toFixed(unit === "帧" ? 0 : 3)} {unit}</td>}</For></tr>}</For></tbody></table>
      </div></Show>
      <p class="task-range">当前为内存会话，刷新后需重新开始。</p>
    </Show>
    <Show when={message()}><p class="task-message" role="status" data-testid="ball-task-message">{message()}</p></Show>
    <Show when={error()}><p class="task-error" role="alert" data-testid="ball-task-error">{error()}</p></Show>
    <Show when={!props.projection && !props.disabled}><button class="button secondary" data-testid="ball-task-reconnect" onClick={props.onNewSession}>新建 Session 重新开始</button></Show>
  </section>;
}
