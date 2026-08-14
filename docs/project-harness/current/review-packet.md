# Review Packet

## Subject

- Checklist item: `DH-014`
- Reviewer: `sol-max+deepseek-v4-pro-round4`
- Updated at: `2026-08-14`
- Canonical plan path: `docs/project-harness/tasks/DH-014/plan.md`

## Item Snapshot

- Title: Observer Modes 与 Enter World 交互
- Status: doing
- Workflow status: review_requested
- Priority: p0
- Owner: codex
- Session: codex-dh014-observer-20260814
- Dependencies: DH-013

## Acceptance

实现 Overview、Inspect、Explore 三种可见 Observer；Marble 可从 registered authored entry pose 进入；Z-up Fly、Inspect focus、Overview fit bounds、输入生命周期与按需 rAF 满足计划；相机不改变 Snapshot/Ref/Episode/Evaluation authority；focused/full/typecheck/build/diff/EXharness/Chromium 与 independent implementation cross-review 全部通过

## Verification



## Handoff

先完成 independent plan cross-review；P0/P1=0 且 approved 后方可实现。实现后必须再次 independent implementation cross-review；未经新授权不得 commit/push/merge/tag/deploy。

## Review Inputs

- Scope: `docs/project-harness/scope.md`
- Architecture: `docs/project-harness/architecture.md`
- Domain model: `docs/project-harness/domain-model.md`
- Progress: `docs/project-harness/progress.md`
- Review output target: `docs/project-harness/current/review.md`

## Canonical Plan Content

```md
# DH-014 计划：Observer Modes 与 Enter World 交互

## 状态与 Authority

- Status：`planning`；
- Mode：`high-risk` Presentation interaction slice；
- Branch：`agent/codex/DH-014`；
- Worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-014`；
- Base / main：`c655c544bb88010f42e0dd9e570f7f04923d9b6e`；
- Human 已授权创建 DH-014、设计、独立交叉审查、通过后实现、验证与 implementation cross-review；
- 未授权 commit、push、merge `main`、tag、deploy、新 provider generation 或重新调用 Marble / Hunyuan 生成；
- Plan gate：只有 independent cross-review 的 P0/P1 均为 0 且结论为 `approved`，才进入产品实现；
- Closeout gate：实现完成后仍需 independent implementation cross-review 批准，本轮不自行 closeout。

## 已接管的稳定设计输入

main worktree 中原有的四份 doc-only changes 已逐字复制到本 worktree；main 原改动保持不变。接管时 SHA-256：

| 文件 | SHA-256 |
|---|---|
| `docs/project-harness/observer-embodiment.md` | `c290ebcd70e8c3776cf808275c49528a2e6bb191c5b8944c0f2a80511cc55a4b` |
| `docs/project-harness/README.md` | `2be98ae14e49cd2cfc32b162f56cd3e4e8c60c8bf8fd540ff7cbb1bbbcc517c6` |
| `docs/project-harness/architecture.md` | `fef6f9d56d30bd1e2b0d36340603a58b7fc6b8f630234f73bd4f6e9f23c57dcb` |
| `docs/project-harness/domain-model.md` | `9102a3d16806873dca31a118340ddac030c2101e28bd5a27349e4fd5ce8e0acf` |

这些文档是 DH-014 的设计输入，不因被复制而获得独立 commit authority。后续若 reviewer 要求修改正文，必须留下 plan review 证据，不能静默改写最初输入。

## Goal

在不扩大 Kernel 或 Agent authority 的前提下，把现有单一 Orbit viewport 收敛为三个显式、可见、可恢复的 Presentation Observer：

```text
Overview Observer
  └── 世界外部概览 / fit registered world bounds / debug layers

Inspect Observer
  └── Orbit / Entity selection / trusted bounds focus

Explore Observer
  └── registered entry pose / Z-up Fly / bounded input ownership
```

用户相机始终是 Presentation-local state。任何模式切换、键鼠移动、reset、focus 或转场都不得修改 `Snapshot`、`Ref`、`Episode`、`EvaluationRecord`、`AdoptPolicy` 或四工具 contract。

## 当前实现事实

- `ThreeViewport.tsx` 当前持有 `Scene`、Z-up `PerspectiveCamera`、`OrbitControls`、`SparkRenderer`、Entity render records、selection raycast 与单一按需 `scheduleRender()`；
- 当前没有永久 animation loop：Orbit change、Spark `onDirty`、resize、asset completion 与 reactive state change 才触发 render；
- 当前固定 camera pose `[4.4,-5.4,3.4]` 位于 Marble registered bounds 外，无法表达“进入世界”；
- `registered-presentation.ts` 已是 Studio 内将 registered representation 解析为 asset/calibration/witness/same-origin URL 的受信 Presentation registry seam；
- Marble environment 的 registered SPZ calibration target bounds 已存在；provider 未提供 navigation surface 或 validated camera pose；
- `App.tsx` 已有可见 Presentation layer 开关与 Agent `textarea`，因此输入隔离必须覆盖真实相邻交互；
- 项目是 SolidJS + Three.js，不引入 React/shadcn/Motion/GSAP。

## Non-goals

- 不修改 `packages/world` Kernel、Repository、Runtime、Episode、Evaluation、AdoptPolicy、codec 或四工具语义；
- 不实现 `Embodied Observer`、角色/机器人/车辆/sensor runtime；
- 不实现 Walk、导航网格、重力相机、角色碰撞、跳跃、蹲伏、minimap、VR/AR、gamepad、移动端双摇杆；
- 不建立 plugin SDK、provider adapter framework、controller inheritance tree 或通用 camera ecosystem；
- 不从 Lyaup 复制源码、控制器、prompt、测试、UI 文案或假设 Y-up 的运动数学；
- 不新增 provider 请求，不下载或生成新资产；只复用 DH-013 ignored local cache。

## 最小设计

### 1. Presentation-local data

新增最小纯数据面，文件建议为 `apps/studio/src/presentation-three/observer-camera.ts`：

```ts
type ObserverMode = "overview" | "inspect" | "explore";

type CameraPose = {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
};

type ObserverWorldContext = {
  worldBounds: Bounds3;
  worldBoundsTruth: "registered" | "derived-from-loaded-digest" | "authored-fallback";
  overviewReset: CameraPose;
  inspectReset: CameraPose;
  exploreReset: CameraPose;
  entryTruth: "authored-unverified" | "authored-fallback";
  entryProvenance: string;
};
```

该模块只负责：finite/dense 数据校验、world/entity bounds、Z-up movement、fit bounds、fallback pose、boundary proximity、editable target/input admission 与 continuous-frame predicate。它不持有 DOM、Three Scene、Snapshot ref 或 Repository。truth literal 全链路只使用上述两个 exact 值，不再引入 `registered-authored-unverified` 之类的第三种别名。

### 2. Presentation registry 中的 Marble entry pose

只扩展 Studio `registered-presentation.ts`，不修改 world registry / Snapshot schema：

- key：`scenario:marble-hunyuan-composite-v1`；
- registered world bounds：从 Marble registered observation 的 calibration `targetBounds` 解析，不复制第二份 bounds literal；
- entry pose：本切片 authored 的 finite Z-up pose，必须位于 registered bounds 内；初始候选为 `position=[0,-1.2,1.15]`、`target=[0,0.2,1.05]`；
- truth level：`authored-unverified`；
- provenance：绑定 `asset:marble-world-500k-spz-v1`、`calibration:marble-spz-v1` 与 DH-014 operator-authored method；
- 该记录只被 Presentation resolver 消费，不进入 Snapshot、Product Session projection 或 Agent tool evidence。

只有 `resolveRegisteredPresentationAsset()` 完整校验 scenario 中的 registered representation、manifest、asset、calibration、witness 后，Observer resolver 才返回 `entryTruth="authored-unverified"`。同 scenario 的 manifest/binding 漂移、resolver throw、non-finite/degenerate bounds 或 entry pose 不在 registered bounds 内，均不得部分采用 registry 数据：改用 finite deterministic fit-bounds fallback，标记 `entryTruth="authored-fallback"`、`worldBoundsTruth="authored-fallback"`，并让原本的 asset error 继续可见。fallback 不能被命名或显示为 registered/provider-verified。

若 implementation probe 证明候选 entry pose 位于 splat 空洞或朝向错误，应只在 plan 中记录可见证据后调整该 authored literal；不得声称 provider-verified。

### 3. 一个组合式 CameraRig

新增 `camera-rig.ts`，允许一个小型 class 或等价 closure；禁止 controller subclass：

```text
CameraRig
├── camera + OrbitControls
├── active ObserverMode
├── reset pose per mode
├── pressed keys + pointer ownership
├── overview/inspect/explore direct strategy functions
└── update(deltaSeconds) -> { cameraChanged, needsNextFrame }
```

职责：

- `setMode`：先清按键/拖拽/pointer state，再切换 controller；
- `reset`：使用当前 mode 的独立 reset pose；
- `focusSelection`：只接受由受信 representation resolver 得到的 target/bounds；
- `update`：仅 Explore active movement 或短转场改变 camera；
- `dispose`：移除所有监听、清 pressed state、dispose OrbitControls；
- 不持有 `Snapshot`，只接收已经解析的 Presentation context 与 selection target。

第一版 mouse look 使用 pointer capture + drag，不主动请求 Pointer Lock。仍注册防御性的 `pointerlockchange`：只要 lock owner 从本 viewport canvas 消失就 `clearInput()`；Chromium 通过用户手势临时请求/退出 lock 验证该 cleanup。Explore 必须 `controls.enabled=false`；回到 Overview/Inspect 时先把 `controls.target` 同步到 CameraRig 当前 target，再 enable/update。所有 canvas listener 只有 CameraRig 一个 owner，按 register 的逆序 dispose。

### 4. 三种行为

#### Overview

- 以 registered world bounds 或 deterministic fallback bounds 计算 fit pose。calibration `targetBounds` 是 entity-local：将 8 个角点经 entity pose 变换到 world-local 后再 union；不得把 asset-local bounds 直接当 world bounds；
- viewport 显示 `Overview · 世界外部概览`；
- Orbit 可用于外部检查，但 reset 始终回到 fit-bounds pose；
- grid、bounds、alignment、collision 仍由显式 UI 开关控制。

fit 使用 bounds center + bounding-sphere radius，并以当前 aspect 同时计算 vertical/horizontal FOV 所需距离，加入固定 margin。任一轴退化时使用最小 extent epsilon；全体 bounds invalid/missing 时使用固定 finite fallback bounds。resize、representation resolution 或 world bounds 改变后重算 Overview reset。`camera.near/far`、fog near/far、Orbit `minDistance/maxDistance` 从 radius 与 fit distance 派生，保证完整 bounds 位于 frustum/control envelope；不得继续依赖现有 `far=40`、fog `8/15`、`maxDistance=16` 常量。所有投影值必须 finite、`near>0`、`far>near`。

#### Inspect

- 保留 `OrbitControls`；
- selection 仅属于 Inspect：pointerup 相对 pointerdown 位移不超过 4 CSS px 才 raycast，且只返回既有 `EntityRef`；Overview 与 Explore 不触发 selection，Explore drag-look 起点也不触发 `onSelect`；
- `F` 或双击聚焦选中 Entity；
- target/bounds 解析优先级：registered calibration `targetBounds`（8 角经 entity pose 转 world）→ digest-verified GLB 成功 parse 后从 loaded Object3D 计算 world `Box3` → primitive visual/collision bounds → stable entity-pose fallback。普通 `imported-rigid-mesh` registry 本身没有 bounds，绝不虚构 “registered imported bounds”；
- loaded GLB bounds 只有在既有 digest/same-origin import contract 成功且 Box3 finite/non-empty 后才标记 `derived-from-loaded-digest`；asset 未完成、缺失、解析失败或 Box3 异常时立即使用 collision/primitive/fallback，并显示对应 provenance；
- 无 representation 时不得产生 NaN，fallback 仍必须 finite。

registered resolver throw 属于可见 representation error；Observer 只把 focus/reset 降级为 finite fallback，不吞掉或改写原 asset error。

#### Explore

- 只有用户点击可见 `进入世界` 或显式切换 Explore 才进入；
- Marble 使用 registered authored entry pose；其他场景使用可标识的 authored fallback；
- `W/S` 沿当前水平 forward，`A/D` 沿水平 right，`Q/E` 沿 world Z，全部基于 `worldUp=[0,0,1]`；
- 同时按键向量归一化，避免斜向超速；`Shift` 使用固定倍率；delta time clamp，防止后台恢复后跃迁；
- wheel 只在 viewport 拥有输入时调整有限范围 fly speed；
- mouse drag 可控制 yaw/pitch；pointer lock 作为可选增强，不是唯一入口；`Esc` 释放输入并清键；
- 接近或越过 registered bounds 时显示 `当前世界边界 / 未知区域`；这只是 Presentation warning，不阻止 Fly；
- Explore 的 effective collision visibility 固定为 false，但保留 App 中用户的 collision toggle preference；离开 Explore 后恢复该 preference，不用相机模式改写用户设置；
- viewport 内始终显示 entry truth/provenance：registered Marble 为 `ENTRY POSE · AUTHORED / UNVERIFIED`，fallback 为 `ENTRY POSE · AUTHORED FALLBACK`，并提供稳定 `data-testid`/dataset 供 Chromium 断言；
- 显示可见操作提示：`W/A/S/D` 平移、`Q/E` 升降、`Shift` 加速、滚轮调速、拖拽视线、`Esc` 释放；Inspect 显示 `F / 双击聚焦`。

### 5. 输入 ownership 与 lifecycle

- canvas/container 具有 `tabindex=0` 和可见 focus ring；
- 键盘只在 viewport focus 或 pointer capture/lock 属于当前 viewport 时进入 CameraRig；
- keyboard event 只有 target 为本 viewport container/canvas，或当前 pointer capture/lock owner 为本 viewport 时才接管；mode/reset/layer 等按钮获得焦点时不取得 Fly keyboard ownership；模式按钮点击后可显式把 focus 交给 viewport；
- 若 event target 是 `input`、`textarea`、`select`、`button`、`a`、`contenteditable` 或其后代，立即拒绝；
- `window.blur`、`document.visibilitychange(hidden)`、mode change、pointer-lock exit、`pointercancel`、`lostpointercapture`、canvas/container blur 与 unmount 全部调用同一 `clearInput()`；
- pointer/mouse listener 只在 active component 生命周期内注册；
- Agent textarea 聚焦时全局按键不能被 CameraRig 接收。

### 6. 按需 render scheduler

沿用 `ThreeViewport` 当前单一 rAF seam，不另建 timer/loop：

```text
scheduleRender(reason)
  -> at most one queued rAF
  -> CameraRig.update(delta)
  -> renderer.render
  -> only when movement/transition remains active, queue next rAF
```

连续帧只允许：

- Explore 有 active movement；
- mode/reset/focus transition 未结束；
- Episode playback 通过现有 reactive sample 触发；
- Spark `onDirty` 请求帧。

无按键、无转场且 Spark 不 dirty 时，完成当前帧后不得再排队。增加 instrumentation/test seam，证明 idle 不自调度。

idle 的 exact 判据是：Episode playback inactive、无 active movement、无转场、Spark 未 dirty。进入 idle 后允许消费至多一个已排队帧，随后 rAF counter 必须稳定；movement 时 counter 增长，keyup/blur/mode clear 后再次稳定。EpisodePlayer 保持既有 clock owner，sample reactive update 只向 viewport 的同一个 scheduler 请求单帧，不建立第二个 viewport loop。

### 7. reduced motion

- 使用 `matchMedia("(prefers-reduced-motion: reduce)")`；
- reduce 下 mode/reset/focus 直接设置最终 pose，或转场时间为 0；
- 功能、键盘操作和 reset 不得因 reduced motion 被禁用。

## 预计修改面

允许修改：

- `apps/studio/src/presentation-three/observer-camera.ts`（新，纯数学/策略）；
- `apps/studio/src/presentation-three/observer-camera.test.ts`（新）；
- `apps/studio/src/presentation-three/camera-rig.ts`（新，DOM/Three adapter）；
- `apps/studio/src/presentation-three/camera-rig.test.ts`（新，状态机/调度 seam）；
- `apps/studio/src/presentation-three/registered-presentation.ts/.test.ts`；
- `apps/studio/src/presentation-three/ThreeViewport.tsx`；
- `apps/studio/src/App.tsx`、`styles.css`；
- 必要的 Studio Presentation tests；
- DH-014 task docs 与既有四份设计输入。

默认禁止修改 `packages/world/**` 与 `apps/agent-gateway/**`。若实现发现必须修改，视为 plan boundary 失败：停止并回到 reviewer/Human，而不是顺手扩展。

## 测试与验收矩阵

### Pure/unit

1. Z-up movement：W/S/A/D 在水平相机 basis，Q/E 仅改变 Z；斜向归一化、Shift、delta clamp、finite pose；
2. mode/reset/transition：三 mode 各有 reset；切换可中断；reduced motion 直接结束；
3. focus：registered/imported/primitive bounds 产生 finite target 与 fit distance；missing 3DGS 使用 fallback；
4. input admission：viewport focus/capture 才接管；input/textarea/select/contenteditable 拒绝；
5. stuck key：blur、hidden、mode change、pointer-lock exit、unmount 后 pressed set 为空且不再请求帧；
6. registered entry：scenario exact 命中，pose 位于 registered bounds，provenance/truth level exact；foreign scenario 只能 authored fallback；
7. Overview fit：Marble world bounds、primitive、imported mesh 与 missing asset 都 finite、可复现；
8. authority：相机操作前后同一 frozen `Snapshot/Ref/Episode/Evaluation` object/serialized bytes 不变；CameraRig 没有 authority import/callback；
9. scheduler：movement/transition 才返回 `needsNextFrame=true`；idle、blur、mode clear 后为 false；
10. fallback：primitive、imported mesh、3DGS absent/not-imported/error、Marble loaded 均有确定 reset/context。

补充 mandatory cases：registry manifest/binding drift 与 resolver throw；entry pose 越界；degenerate/invalid bounds；resize/aspect 后重新 fit；near/far/fog/control envelope；近垂直凝视时水平 forward 退化使用最后一次有效 yaw；Explore/Orbit controls handoff；click-vs-drag selection；`pointercancel`/`lostpointercapture`；listener 逆序 dispose。`camera-rig.test.ts` 使用注入的 fake controls、event owner、rAF clock，不引入 jsdom/happy-dom，也不直接实例化真实 DOM `OrbitControls`。

### Existing regression

- existing selection、Orbit、Spark load/dispose、alignment、layer toggles、Episode playback 与 Product Session tests 全部保持；
- `bun test`、typecheck、build、diff-check、EXharness validate/doctor 全通过；
- product authority files在实现前后用固定 path SHA aggregate 证明未修改。

### Chromium acceptance

使用 DH-013 的真实 local provider cache；不联网 provider，不 generation。至少证明：

1. Marble 场景点击 `进入世界` 后 camera 位于 registered entry bounds 内，画面不再是 AABB 外部黑色外壳；
2. `Overview / Inspect / Explore` 三个可见控件可切换，当前模式、操作提示、entry truth/provenance 与 bounds provenance 始终显示；
3. Explore 的 W/S/A/D/Q/E、Shift、wheel speed、mouse look、Esc/reset 正确且 pose finite；
4. Agent textarea 聚焦输入同样按键时 camera pose 不变；
5. Inspect 单击选择，`F` 与双击 frame 同一 Entity；
6. Overview reset 查看完整 registered bounds，可显式打开 grid/bounds/alignment/collision；
7. Explore 初始与切回时 dense collision wireframe不可见；
8. blur、切 tab、mode change、pointer-lock exit 后无 stuck movement；
9. 3DGS missing/error fallback 不产生 blank viewport，三模式仍可恢复；
10. console 无 page error，camera dataset/pose 无 NaN/Infinity；
11. 通过 `data-testid`/container dataset 暴露 camera pose、active mode、rAF counter、entry/bounds provenance 与 boundary warning；idle（playback inactive + 无输入 + 无转场 + Spark clean）消费至多一个 pending frame 后至少 1 秒计数稳定，active movement 时增长，keyup/blur 后再次稳定；
12. Snapshot id/ref version/Episode id/Evaluation id 在纯相机交互前后相同。

## Phases

### Phase 0 — Plan gate

- 冻结 plan 与当前代码/context manifest；
- 发起两路 independent plan cross-review；
- 任一路 P0/P1 或 reviewer disagreement 都进入 `changes_requested`；修订后必须 fresh review。

### Phase 1 — RED / pure model

- 先创建 Z-up math、entry/bounds、input lifecycle、scheduler 与 authority regressions；
- 确认旧实现缺少相应 module/behavior 的 RED；
- 实现最小纯函数与 CameraRig state seam。

### Phase 2 — ThreeViewport wiring

- 将 CameraRig 接到现有 single-rAF scheduler；
- 接入 mode/reset/focus/selection/pointer/input lifecycle；
- 保持 Spark/asset/selection/disposal boundary。

### Phase 3 — Visible UI

- 增加 visible mode switch、进入世界、reset、Fly speed/controls、boundary warning 与 focus ring；
- Explore 自动清 collision layer；Overview/Inspect 保留显式 debug layers；
- reduced motion 与 responsive layout。

### Phase 4 — Gates and Chromium

- focused → full → typecheck → build → diff → EXharness；
- 启动 bounded local Studio/Gateway，执行真实 cache Chromium acceptance；
- 停止本轮额外 server，保留用户原有进程不受影响。

### Phase 5 — Implementation cross-review

- 冻结 product files aggregate、branch、HEAD/base 与 status；
- 两路 independent reviewer 只读复核测试、authority、input/rAF lifecycle 与 Chromium evidence；
- P0/P1=0 且共同 approved 后只打开 closeout gate；不自行 closeout/commit/push/merge。

## Exit criteria

完成但不关单的条件：

- 所有产品行为与测试矩阵闭合；
- 无 Kernel/Repository/Runtime/Agent authority diff；
- final independent implementation cross-review `approved`，P0/P1=0；
- EXharness 为 `doing / review_approved`；
- 工作树保留可审计未提交 diff，等待 Human 后续 closeout/commit authority。
```

## Review Focus

1. 当前计划或结果是否覆盖 acceptance
2. 是否越过 scope non-goals
3. 是否越过 architecture 模块边界
4. 是否偷偷吸收了未来 checklist item 的工作
5. 当前验证方式是否足以支持结束本轮
