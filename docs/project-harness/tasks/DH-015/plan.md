# DH-015 — Registered Asset Scene Composer

## Item

- Checklist item：`DH-015`
- Owner：`codex`
- Session：`codex-dh015-plan-20260814`
- Branch：`agent/codex/DH-015`
- Base：`1805d73055a79a7e0506afafebaffd7b308706f9`
- Updated at：`2026-08-14`
- 当前 authority：只允许计划、验收设计与 independent cross-review；计划 approved 前不得实现产品代码。
- 未授权：commit、push、merge、PR、tag、deploy、新 provider generation、真实付费调用或清理历史 worktree/stash。

## Goal

把 DH-013 的 Marble environment 与 Hunyuan generated object 从“固定 canary 场景”提升为第一个可由用户直接创作、由 Agent 继续推演的真实资产世界：用户能够建立已登记组合，在 `Inspect Observer` 中移动或绕 world-Z 旋转 generated object，明确预览并提交一次 pose edit；之后既有 Agent 仍只用四个 world tools 运行 MuJoCo 并检查 deterministic Evaluation。

本切片证明的是：

```text
verified registered artifacts
        ↓ exact registered fixture
authoritative Snapshot v1
        ↓ Presentation-local PoseDraft
explicit world_edit + expected Ref
        ↓
authoritative child Snapshot v2
        ↓ existing Agent world_run
Episode + Evaluation
```

`PoseDraft` 永远不是 Snapshot、Observation、Episode 或 alignment truth；只有显式提交后的 `world_edit` 才改变 world authority。

## 起点事实与被违反的 invariant

1. 当前 Marble/Hunyuan 世界已经具备 exact asset/calibration/witness、collision proxy、MuJoCo Runtime、Episode 与 Evaluation，但初始组合只能由 Agent 或固定 fixture 创建。
2. Studio 没有 deterministic human mutation seam；把 gizmo 结果编码进 prompt 会把精确 authoring 降级为概率行为。
3. 唯一可写 `RuntimeMvpHost` 位于 Gateway `ProductSession`；Studio 不得建立第二个 Host，也不得从 Three.js node 反推 Snapshot。
4. 当前真实 registry 只有一个 environment 与一个 generated object。第一版可以展示 exact role cards，但不得宣称已经具备任意资产组合、通用 asset graph 或 provider Adapter SDK。
5. Hunyuan visual ↔ box proxy witness 只覆盖现有 calibration；arbitrary scale 会使 witness 失效，因此 scale 必须 fail closed / 不可见，而不是靠 UI warning 放行。
6. 当前 `requireMarbleHunyuanCompositeSnapshot()` 把 registered artifact identity 与 authored entity state 锁在同一个 exact comparison 中：所有非 `runtime-terminal` Snapshot 都要求 generated-object pose 等于 fixture 初始值。这会让合法 `world_edit` 在 Repository、Product codec 与 MuJoCo base admission 三处失败。DH-015 必须最小地拆开这两个概念，而不能绕过 validator 或在 UI 伪造成功。
7. 当前 `decodeProductSessionProjectionTrusted(expectedWorld)` 是 same-world decoder，不是 state-transition decoder；它不能证明 `null → root` 或 `parent → child`。DH-015 必须在 `@demiurges/world` 提供 operation-aware transition admission，Studio 不得复制 lineage 规则。

## 最小语义设计

### 1. Registered composition 不是新 Kernel record

第一版不增加 `Scene`、`Project`、`AssetInstance` 或 `CompositionGraph`。世界 authority 继续只有 Snapshot/Ref：

- 空 Product Session 通过现有 `world_write({fixtureId:"fixture:marble-hunyuan-composite-v1"})` 建立 root Snapshot；
- environment/object cards 只是对既有 frozen registry 的 Product Presentation，不拥有新的资产事实；
- 当前 exact pair 之外的组合不可达，等待 DH-017 产生第二批真实 registered artifacts 后再判断是否需要更一般的 composition contract。

### 2. Closed human authoring seam

Gateway 只增加两个显式、闭合的 Product Session authoring 路径：

```text
POST /api/sessions/:sessionId/world/write
POST /api/sessions/:sessionId/world/edit
```

约束：

- request body 的 JSON/media/budget 直接复用既有 bounded reader 与 `WORLD_TOOL_CONTRACT` budget；write 继续使用 `requireWorldWriteInput`。human edit 不先调用完整 `requireWorldEditInput`，而是把 raw plain JSON value交给下述 package-owned single admission pipeline；该 pipeline 与 generic parser 共用 structural decoder/types，不维护第二套 wire schema，generic Agent `requireWorldEditInput` 的既有 public semantics 不变。human write 在 shared schema parse 后还必须要求 `fixtureId === "fixture:marble-hunyuan-composite-v1"`；其他已登记 fixture 仍只由 Agent 四工具使用，human route 稳定 `422 FIXTURE_NOT_COMPOSABLE` 且零 mutation；
- human edit 在取得共享 reservation 后、调用 mutation surface 前，必须从 package root `@demiurges/world` 导入并调用 single pure composite authoring admission pipeline。package root 同时导出其 closed outcome/canonical result types；Gateway 不允许 deep import，Gateway/Studio 不复制这些规则。pipeline 先用与 generic parser 共用的 package-internal structural decoder检查 exact fields、plain JSON、expected ref shape、target/change/frame 与 numeric primitive types；structural failure 为 `400 INVALID_REQUEST`。随后才完成 composite domain classification：exact current fixture、numeric envelope、dense/finite、pure world-Z yaw、unit quaternion、完整半球、`-0`、q/-q canonicalization、registered collision proxy floor safety与 semantic no-op；这些 domain failure 为 `422 FIXTURE_NOT_COMPOSABLE` 或 `422 POSE_NOT_COMPOSABLE`；
- pipeline 只有三种 closed outcome：`accepted({ canonicalWireInput, parsedInput })`、`unchanged`、stable public rejection。`canonicalWireInput` 是 exact `WorldEditInput` wire object：position 为 `{x,y,z}` object、rotation 为 `{x,y,z,w}`，所有值已 canonical；它必须能被 `requireWorldEditInput` 再解析为与 `parsedInput` byte-equivalent 的 tuple-based `WorldEditInput`。Gateway 只把 `canonicalWireInput` 传给现有 `WorldToolSurface.edit`，不把 tuple parsed result误当 wire input，也不增加 `editParsed`/第五个 tool。empty Session 返回 `409 WORLD_REQUIRED`；非 composite world/target/change 返回 `422 FIXTURE_NOT_COMPOSABLE`；invalid yaw/hemisphere/envelope/floor pose（包括 structurally valid 的 `-0` 与 out-of-envelope number）返回 `422 POSE_NOT_COMPOSABLE`；所有 rejection 与 `unchanged` 均不得调用 surface、递增 Repository edit sequence、推进 Ref、改变 Snapshot/lastRun/sequence 或产生 partial evidence；
- transport parse/error table 固定为：non-JSON/invalid shared schema/extra field `400 INVALID_REQUEST`，unsupported media type `415 UNSUPPORTED_MEDIA_TYPE`，body over budget `413 REQUEST_TOO_LARGE`，session busy `409 SESSION_BUSY`，以及上述 domain codes；全部共用 stable redaction mapper，不输出 raw parser/Host error；
- route 是固定两项枚举，不接受 caller tool name、动态 mount、OMP message、slash/control syntax 或任意 method dispatch；
- `read` 继续由现有 Product Session GET projection承担；`run` 继续只走既有 Agent `world_run`；`adopt` 继续是未暴露给 Agent 的 Harness control authority。本切片不新增 direct human run、adopt transport/UI 或 runtime cancellation transaction；
- 两种 authoring command 与 Agent turn 共用同一个 `ProductSession.#running` reservation。body 解析完成后必须同步取得 reservation，再调用同一个 `WorldToolSurface`；并发 turn/command 返回稳定 `409`，不能产生第二次写入；
- write/edit 都是同步 mutation；request abort 只在 admission 前生效。任何 error 都只输出稳定 public code，不回显 input、path、provider URL、credential-like string、stack 或内部 Host error；
- success response 只返回受信 `ProductSessionProjection`，不创建第二套 evidence envelope，也不伪造 Agent event；
- `@demiurges/world` 在 `product-session-codec.ts` 内新增并从 package `index.ts` 显式导出一个小型 operation-aware transition decoder，输入为 `prior projection + parsed exact operation/outcome + returned projection`；其中 operation 是 closed discriminated record，并携带 `requireWorldWriteInput` / composite preflight 的 canonical result，不接受 caller 自述 tool name。它复用现有 projection/fixture validators，并分别证明：write 是 `null → registered root v1`，root Snapshot ID 必须精确等于 canonical fixture ID `snapshot:marble-hunyuan-composite-base`；updated edit 的 `input.expected` 必须等于 prior Ref，prior/returned 都是 exact composite，且为 `parent → direct child`、Ref version 精确 `+1`、target/change 与 canonical input 一致、child pose 精确等于 canonicalized input、除允许的 generated-object pose 外 authority exact；unchanged edit 则要求 returned projection 与 prior byte-equivalent、valid lastRun 保留、lastSequence 不变、settled `running:false`；Studio 只能调用这个 decoder，不得自行拼装 lineage checks；
- stale edit 返回稳定 `409 STALE_REF`，response 不携带被当成 child 的 projection；Studio 随后 bounded GET，并用不带旧 expectedWorld 的 trusted projection decoder重新建立当前 verified authority。网络错误也只能做同样的 bounded authoritative resync；
- successful write/edit 更新 `#world` 并清空 stale `#lastRun`；`stale_ref` 不推进 Ref、不清空合法 `lastRun`；Agent run 只设置 `#lastRun`，不得推进 current Ref；
- create 只在 empty Session 可接纳；世界已存在时重复 create 返回稳定 `409 WORLD_ALREADY_EXISTS` 且零 mutation，Studio 通过 GET 恢复。Studio 对 canonical semantic no-op 不发送 edit；即使 direct POST 绕过 Studio，Gateway preflight 也必须返回 `200` unchanged trusted projection，不创建 child、不清空 `lastRun`、不推进任何 sequence；
- human command 不伪造 Agent `ProductSessionEvent`、tool trace 或 sequence；world Ref/version 与 returned projection 是 command 的 authority evidence。

### 3. Composite registered identity 与 authored state

`requireMarbleHunyuanCompositeSnapshot()` 继续关闭 artifact/representation/physics truth，但按 Snapshot source 精确区分 state：

- `source: write`：environment、floor、generated object 的 state 必须与 canonical fixture 完全一致；
- `source: edit`：只允许 `entity:generated-object` 的 pose 改变；position 必须是 finite dense world-frame vector且满足现有 tool numeric envelope；该 envelope 由 `world-tool-contract.ts` 导出的只读常量/helper 单一定义，fixture validator 与 input parser 共用，禁止复制数值范围；rotation 必须是 normalized pure world-Z yaw quaternion，`x=y=0`、`-0 → 0`，并满足完整半球规则 `w > 0 || (w === 0 && z >= 0)`；linear/angular velocity 必须保持零；
- environment、floor、所有 EntityRef、representations、physics、calibration、witness 与非目标 state 在 edit 中保持 exact；scale 没有任何 authority 表达；
- `source: runtime-terminal`：继续使用现有 Episode/runtime closure，不套用 authored-state restriction；
- 其他 registered scenarios 与通用 pose edit 行为不因本切片放宽；不能把 composite 特例升级为任意 registered asset editor。

Repository insertion、Product projection codec、MuJoCo run base admission 与 explicit adopt 都调用同一个 fixture identity/state validator；不得在任一 seam 加 bypass。

### 4. Presentation-local `PoseDraft`

新增一个小型纯数据模块，概念形状为：

```text
PoseDraft
├── baseRef: exact RefRecord
├── targetRef: entity:generated-object
├── pose: finite world-frame Pose
└── mode: translate | rotate-z
```

规则：

- draft 从当前 authoritative entity pose 建立，保存 immutable copy；
- translate 使用 Z-up world axes；rotate 只允许 world-Z yaw，输出 normalized unit quaternion，并固定 `-0 → 0` 与完整半球规则 `w > 0 || (w === 0 && z >= 0)`；semantic equality 把 `q` 与 `-q` 视为同一旋转，包括 `w=0` 的 ±180° 边界；
- 不含 scale；来自 gizmo 的 scale mutation、sparse/non-finite vector、非单位 quaternion 或超出既有 tool numeric envelope 的 pose 不得成为可提交 draft；
- drag/change 只改变独立的 Presentation draft wrapper 和 draft readout；authoritative render root 仍由 Snapshot/Episode state 驱动，`evidenceFor`、inspector、bounds、alignment PASS 与 registered witness 只能读取 authoritative root/state，Snapshot/Ref/Episode/Evaluation bytes 保持不变；
- 用户必须点击“提交变换”才调用 `world_edit`。drag end 本身不提交；“取消变换”恢复 authoritative pose；
- selected entity change、observer mode 离开 Inspect、view 切到 Episode、session/ref/snapshot change、asset integrity failure、window blur、document hidden、Escape、stale response、unmount 都清除 draft 与 gizmo ownership；toolbar 获得焦点或 canvas 因点击 commit/cancel 失焦不等同于外部 blur，不能提前丢弃待提交 draft；
- commit 期间禁用 Agent turn、第二次 command 与 gizmo输入；成功后以 returned projection 重建 Presentation；失败后 resync authoritative projection，不保留无法证明 fresh 的 draft。

### 5. Three.js gizmo ownership

- 使用现有 Three.js `TransformControls`，不增加 dependency；仅在 `Inspect Observer + repository view + entity:generated-object` 时挂载；
- toolbar 提供可见的 `移动`、`绕 Z 旋转`、`取消变换`、`提交变换`，不能只靠快捷键；
- gizmo drag 期间禁用 OrbitControls、清空 CameraRig input 并阻止 selection raycast；正常 `dragging-changed(false)` 恢复 controller，`lostpointercapture`/window blur/visibility hidden 则取消 draft 并清理 ownership，两类 lifecycle 不混用；
- `TransformControls` 必须 `setSpace("world")`，目标 wrapper 的 up 为 `(0,0,1)`；translate 仅 X/Y/Z，rotate 仅 Z，scale mode/handle/keypath 均不可达；
- `TransformControls` helper 不拥有 `EntityRef`，不参与 entity raycast、bounds、alignment、collision 或 cleanup registry；
- gizmo `change` 事件只触发按需 render。没有 drag、camera transition、Episode playback 或 Spark dirty 时恢复 idle，禁止永久 rAF；
- `prefers-reduced-motion` 不给 gizmo 增加平滑惯性或补间。

### 6. 当前真实资产的诚实 UI

- Scene Composer 显示两个 exact role card：Marble environment 与 Hunyuan generated object；显示 ArtifactRef、role、Frame/Units、calibration truth 与 import/load status；
- 第一版只有一个合法 pair，因此不显示虚假的 dropdown 或“任意组合”文案；按钮使用“创建已登记组合”；
- 缺失 cache、3DGS/GLB load error 或 registry integrity failure 必须显式显示；不得静默联网、重新调用 provider、用 diagnostic wedge 冒充真实资产或把 failed Presentation 提升为 world authority；
- Presentation bytes 缺失不自动删除合法 Snapshot；但 gizmo 不得把不存在的 visual 当作验证成功，用户仍可通过明确的 collision/debug layer 诊断 proxy。

## In Scope

- exact Marble/Hunyuan registered role cards 与“创建已登记组合”入口；
- Gateway-owned closed human `write/edit` authoring seam；
- package-owned operation-aware transition admission、Studio bounded request 与 conflict resync；
- composite fixture 的最小 authored-state contract：write exact、edit 仅 generated-object translation/world-Z yaw、runtime-terminal 维持既有 closure；
- `entity:generated-object` 的 translate 与 world-Z rotate PoseDraft；
- Inspect-only TransformControls、draft/authority 双 readout、显式 cancel/commit；
- 使用既有 Agent `world_run` 执行 Marble/Hunyuan Program，并显示既有 Episode/Evaluation；
- authority、concurrency、lifecycle、input isolation、idle rAF、fallback 与真实 Chromium 验收；
- 保持 Agent 的四工具 restricted surface 与现有 OMP canary 回归。

## Out Of Scope

- DH-016：Repository persistence、World Project、刷新恢复、项目导入导出、undo/redo history；
- DH-017：新的 Marble/Hunyuan prompt、job、poll、下载、余额查询、付费调用或 provider adapter framework；
- DH-018：Agent 自动选择/generate assets、长期 repair loop、额外 Agent tools；
- arbitrary asset pairing、多个 environment/object、asset upload、asset marketplace、plugin SDK；
- scale、mesh editing、material editing、collision proxy editing、physics parameter editing、re-calibration；
- Walk、navigation mesh、角色碰撞、Embodied Observer、robot/vehicle/sensor action；
- 修改 Kernel record 语义、Episode/Evaluation/AdoptPolicy contract、Repository persistence 或现有 provider artifact bytes；
- 把 direct human command 写成 Agent event，或把 adopt 放入 model-facing surface；
- direct human run endpoint、可取消 MuJoCo transaction 或新的 runtime operation protocol；
- commit、push、merge、tag、deploy。

## Acceptance Mapping

| Checklist acceptance | 计划中的可执行闭环 |
|---|---|
| 已验证 ArtifactRef 组合 Marble + Hunyuan | exact registry role cards → existing registered fixture world_write；无任意组合宣称 |
| draft 不改变 authority | pure PoseDraft + viewport-only transform；Snapshot/Ref/Episode/Evaluation byte identity regression |
| 显式 world_edit + expected Ref | commit button → closed Gateway edit command → same WorldToolSurface → CAS child Snapshot |
| run / Evaluation | 提交 v2 后由既有 Agent 四工具路径执行 registered Program；run 不推进 Ref，返回 existing deterministic Evaluation |
| explicit adopt 保持 | edited v2 → Agent run → PASS/FAIL → Harness explicit adopt 回归；stale/wrong Evaluation 不推进 Ref；本切片不把 adopt 放入 Agent 或 human authoring route |
| 不做 scale/provider/SDK/persistence | UI 无 scale，route 无 provider，Out Of Scope tests/structural diff gate，DH-016～018 独立节点 |

## Boundary Review

- `scope.md`：仍以 `read/write/edit/run` 完成世界操作，不把视频/3DGS 当 world state。
- `architecture.md`：唯一 Host 继续位于 Gateway；Three.js 只拥有 Presentation；human 与 Agent 共用 WorldTool contract；adopt 独立。
- `domain-model.md`：draft 不是 Observation/Belief/Snapshot；edit 只创建静态 child Snapshot，run 才创建 Episode。
- `observer-embodiment.md`：gizmo 只属于 Inspect authoring，不扩展 Explore 为 Walk，也不实现 Embodied Observer。
- DH-016：不保存项目或恢复 Repository。
- DH-017：不发起 provider operation，不新增 artifact。
- DH-018：不改 OMP tool allowlist，不给 Agent 添加 generation/authoring旁路。

## Implementation Steps

### Phase 1 — Contract RED 与 frozen manifest

1. 冻结本计划、允许文件、base HEAD 与 product digest。
2. 先写 composite closure RED：write canonical、edit 仅 target pose、Repository/codec/runtime 三 seam、representation/physics/witness regressions、explicit adopt。
3. 写 RED：closed authoring route、same-Host mutation、write/edit semantics、stale/no-op、concurrent turn/command、body budget、stable redaction、operation-aware projection transition。
4. 写 pure PoseDraft RED：Z-up translate、world-Z yaw、q/-q equality、canonical sign/-0、no scale、cancel/lifecycle、authority byte identity。
5. 写 viewport/controller RED：Inspect-only、draft wrapper ownership、visible controls、idle rAF、input/editor isolation。

### Phase 2 — Gateway human world commands

1. 在 `ProductSession` 内增加单一 reservation helper，供 Agent turn 与 human command 共享；不能维护两个 busy flag。
2. 在 world package 实现 structural decoder + pure composite authoring single pipeline；ProductSession 只在 `accepted` 后把 `canonicalWireInput` 交给 `WorldToolSurface.edit`，并断言其再解析结果等于 pipeline `parsedInput`；`unchanged` 直接返回 unchanged projection，rejection fail closed；generic Agent parser public semantics 不变，不新增 `editParsed` 或 direct run。
3. 在 API 中增加 exact route parser、bounded JSON body reader与 stable public error mapping。
4. 在 world package 增加 operation-aware transition decoder；Studio client 增加 write/edit 两个显式方法，success 只接受该 decoder，failure 做 bounded authoritative resync。
5. 保留 empty-session scripted Agent 的既有四步回归；另增加 pre-authored-world deterministic Agent fixture，只通过同一四工具 surface 执行 `world_read → world_run`（fresh runId），证明 human-authored v2 可被 Agent 继续推演且不会再次 `world_write` 或偷偷 direct run。

### Phase 3 — PoseDraft 与 Scene Composer state

1. 新增小型 pure `scene-composer` module，负责 draft identity、translate/yaw conversion、validity 与 reset reasons。
2. App 增加 registered role cards、composer command state、authoritative/draft readout、create/cancel/commit action；run 继续通过现有 Agent 交互完成。
3. 所有 projection/selection/view lifecycle 统一清理 draft；Ref CAS/stale 逻辑不散落到按钮 handler。

### Phase 4 — Inspect gizmo Presentation

1. 在 ThreeViewport 组合 `TransformControls`，只挂载 generated object 的独立 draft wrapper；authoritative render root 与 evidence source 不转移，scale axis 永不可达。
2. 建立 drag ownership、Orbit/CameraRig/selection 协调、按需 render 与完整 cleanup。
3. 确保 draft transform 不进入 alignment evidence、bounds authority、Episode sample 或 Entity inspector authoritative fields。

### Phase 5 — Visible vertical slice 与 hardening

1. 完成 asset missing/error、primitive/imported/3DGS fallback 与 second Session 回归。
2. 从 registered composite write → draft → cancel → draft → commit → Agent run，证明 ref/version 与 lastRun lifecycle。
3. 运行 focused/full gates 与真实 Chromium；冻结 product digest，发起 independent implementation cross-review。

## Expected Product Files

计划允许修改的产品面优先限制为：

- `packages/world/src/artifacts/marble-hunyuan-composite-fixture.ts` 与测试：实现上述 source-aware closure 与 pure composite authoring preflight/canonicalization；
- `packages/world/src/world-tools/world-tool-contract.ts` 与测试：机械分离 package-internal structural decoder 与 generic semantic validator，并导出/复用既有 pose numeric envelope/helper；`requireWorldEditInput` 的 Agent-facing semantics 与返回 type 不变，不增加新 tool、public wire schema 或 `editParsed`；
- `packages/world/src/product-session-codec.ts` 与测试：增加 operation-aware transition admission，不把 approximate comparison 引入 evidence codec；
- `packages/world/src/index.ts`：显式 re-export operation-aware decoder，以及 pure composite authoring preflight 与 closed outcome/canonical result types；不得导出 Composer/UI state、Gateway route type 或第五个 tool；
- `packages/world/src/repository/pose-constraints.ts` 与 `world-repository.ts`：只把现有 collision-proxy/floor predicate 与 `1e-9` tolerance 机械提取为 pure single source，供 Repository 与 composite preflight 共用；不得改变既有 Repository acceptance/Ref/identity 语义；
- `apps/agent-gateway/src/product-session.ts` 与测试；
- `apps/agent-gateway/src/product-session-api.ts` 与测试；
- `apps/studio/src/product-session-client.ts` 与测试；
- `apps/studio/src/scene-composer.ts` 与测试（新，pure data/state）；
- `apps/studio/src/presentation-three/ThreeViewport.tsx`；必要时一个小型 `scene-gizmo.ts` adapter 与测试；
- `apps/studio/src/App.tsx`、`presentation-model.ts` 与对应测试；
- `apps/studio/src/styles.css`。

默认不修改：

- `packages/world/src/kernel/**`；
- Repository、Episode、Evaluation、AdoptPolicy 语义；Repository 只允许上述 floor predicate 无语义机械提取与 regression，runtime 只允许证明新 fixture contract 被正确调用的 regression，除非 RED 证明调用 seam 本身缺失；
- provider registry/manifest/calibration/witness bytes；
- OMP restricted tool allowlist/prompt；
- DH-013 provider importer/cache lifecycle。

若实现发现必须修改默认不修改的 authority 文件，立即停在 plan amendment + fresh review gate，不先补兼容分支。尤其不得通过放宽 generic Snapshot、跳过 fixture validator、修改 Evaluation tolerance 或把 Presentation transform写回 authority 来“修好”切片。

## Verification

### Focused executable tests

- `ProductSession` direct write/edit 与 Agent turn 共用 Host、busy reservation 和 lastRun lifecycle；不存在 direct run route；
- concurrent `turn ↔ command` 双方向 TOCTOU，只有一个操作被接纳，另一个稳定 409，零 partial side effect；
- malformed media type/content length/chunked UTF-8/over-budget/extra field/non-finite/stale Ref fail closed；human write 的非 composite fixture 稳定拒绝；Agent `world_run` 的 duplicate runId 既有回归保持；error 不回显 marker；
- human edit admission 表驱动覆盖 empty Session，以及 Agent-authored primitive、diagnostic/imported rigid、ball-vessel、articulated worlds 与 composite wrong target/change：全部在调用 surface 前稳定拒绝，Ref/Snapshot/lastRun/mutation count byte-identical；
- direct human edit 的 non-Z unit quaternion、negative-hemisphere 180°、non-canonical `-0`、out-of-envelope 与 collision-proxy floor penetration 全部得到 `POSE_NOT_COMPOSABLE`，surface call count、Repository edit sequence、Ref/Snapshot/lastRun/sequence bytes 不变；下一次合法 edit 仍生成首个预期 child ID，无跳号；
- error-classification table：missing/extra/wrong-type/non-plain/invalid expected/target/change/frame 为 `400 INVALID_REQUEST`；structurally valid numeric `-0`、out-of-envelope、non-unit/non-Z/non-canonical hemisphere/floor penetration 为 `422 POSE_NOT_COMPOSABLE`；不得按 raw error message 推断 code；
- accepted pipeline 的 `canonicalWireInput` 经现有 `requireWorldEditInput`/`WorldToolSurface.edit` 再解析成功，结果与 `parsedInput` byte-equivalent并只产生一个 child；tuple parsed result若误传 surface 必须在测试中暴露，不能成为实现路径；Agent 直接 `world_edit` 的既有 accept/reject矩阵不变；
- package-root import test 证明 Gateway 只能从 `@demiurges/world` 获得 preflight、closed outcome/canonical result 与 decoder；不存在 deep import、第五个 model-facing tool 或 Composer/UI type export；
- write-source translated/yawed object fail closed；edit-source只允许 generated-object translation/pure world-Z yaw，velocity 为零；environment/floor/representation/physics/witness drift fail closed；Repository/codec/runtime 三 seam均覆盖；
- successful edit 只推进一次 Ref；N 次 gizmo change 不产生 N 个 Snapshot；Studio canonical equal/q/-q no-op 不发 request；绕过 Studio 的 direct semantic no-op 返回 unchanged trusted projection，surface 未调用、Repository sequence/Ref/Snapshot/lastRun/lastSequence 不变；stale edit 保留 current authority并 resync；
- operation-aware decoder 接受且仅接受 null→canonical registered root v1、exact composite parent→direct child Ref+1 或 byte-equivalent unchanged；root 内容相同但 Snapshot ID 非 canonical、`input.expected !== prior.ref`、non-composite prior/returned、foreign root、跳版本、错 parent、child pose 与 parsed input 不一致、unchanged 中 lastRun/sequence/world 漂移、额外 state/representation drift、forged running fail closed；
- empty-session scripted Agent 保持既有 write→read→edit→run；pre-authored-world fixture 只执行 read→run，产生 Episode/Evaluation 但 Ref 不变；edited v2 的 PASS/FAIL、fresh explicit adopt、stale/wrong Evaluation no-advance、四工具 allowlist 与 Product codec regression 保持；
- PoseDraft translate/yaw/Z-up/unit quaternion/完整半球 canonical sign/q-equivalence/no-scale、cancel、mode/view/session/ref/selection/unmount reset；尤其覆盖 `w=0,z=±1` 两个 byte representation，证明 canonical bytes、request count、Ref 与 lastRun 不变；
- draft 期间 Snapshot/Ref/Episode/Evaluation 与 registered witness bytes byte-identical；
- editable target、Agent textarea、external blur/visibility/Escape/lost pointer capture 不泄漏 camera/gizmo input；toolbar focus transfer 不误清除待提交 draft；
- TransformControls drag 期间 Orbit/selection 禁用，结束恢复；idle rAF 回到 0；
- registered cache present/missing/error、Marble 3DGS、Hunyuan GLB、primitive/imported fallback 均无 NaN/blank viewport。

### Mandatory repository gates

```bash
bun test <focused files>
bun test
bun run typecheck
bun run build
git diff --check
.artifacts/harness/harnessctl validate
.artifacts/harness/harnessctl doctor
```

并要求：

- `git diff -- packages/world/src/kernel packages/world/src/evaluation packages/world/src/host/runtime-mvp-adopt-policy.ts packages/world/src/runtime-mujoco` 为空，或仅有本计划明确要求的 regression / 事先经 plan amendment 批准的最小 seam 变更；
- `git diff -- packages/world/src/repository` 只能包含 floor predicate/`1e-9` tolerance 的无语义 pure helper 提取、Repository 调用替换与对应 regression；Ref、Snapshot identity、CAS、edit sequence 与 transaction 语义不得变化；
- `git diff -- packages/world/src/artifacts` 只能包含 composite fixture source-aware state closure 与对应 tests；其他 fixture、registry、manifest、calibration、witness 不得变化；
- provider artifact hashes/cache hit 保持，不产生 query/download/generation；
- model-facing active/enabled tools 仍精确等于四个 world tools，mounted tools 为空。

### Real Chromium acceptance

真实 Chromium 使用 DH-013 已验证本地 cache，不调用 provider，证明：

1. 空 Session 显示 exact Marble environment / Hunyuan object cards，且诚实声明当前只有一个 registered pair；
2. 点击“创建已登记组合”得到 Snapshot v1，3DGS/GLB 按既有状态加载；
3. 三种 Observer mode 仍可切换；gizmo 只在 Inspect + generated object 可见；
4. translation 与 world-Z rotate 的 draft 在画面和 draft readout 可见，但 ref/version、authoritative inspector 与 alignment truth 不变；
5. cancel 恢复 authoritative pose；canonical no-op 不发请求；第二次有意义的 draft 点击 commit 后只得到一个 child Snapshot / Ref v2；
6. stale Ref、并发 Agent turn、asset error 都有可恢复状态，不出现 silent partial commit；
7. 通过现有 Agent 输入发起 run，从 v2 生成可回放 Episode 与 deterministic Evaluation，current Ref 仍为 v2；随后 Harness explicit adopt 的受控测试按 PASS/FAIL contract 行为；
8. Agent textarea/input/contenteditable 聚焦不移动相机或 gizmo；mode change、Escape、blur、visibility、pointer loss 无 stuck state；
9. Explore 默认 collision wireframe 规则、Marble entry pose、Inspect focus、Overview bounds 均保持；
10. 无 NaN pose、page error、credential/provider URL 泄漏或不可恢复空白 viewport；drag/transition/playback/Spark settle 后 idle rAF delta 为 0。

## Independent Review Gates

### Plan review

- reviewer 必须独立核验 scope/architecture/domain/observer、DH-013/DH-014 contracts、current source 与本计划；
- 至少覆盖 P0/P1：唯一 Host、command/turn atomicity、tool-contract single source、draft authority、TransformControls input/rAF lifecycle、scale/proxy alignment、stale/resync、provider non-call；
- combined decision 只有在 P0=0、P1=0 时才可 `approved`；计划批准不授权实现。

### Implementation review

- frozen ordered product manifest + aggregate；
- executable counterexamples 与真实 Chromium；
- reviewer 只读，不修改产品，不获得 commit/push/merge/deploy authority；
- P0/P1 为 0 且 approved 后才可请求 closeout。

## Exit Criteria

DH-015 只有同时满足以下条件才能请求 implementation closeout：

1. 用户能够以 exact registered pair 创建 world、预览/取消/提交 generated object pose，并通过现有 Agent 运行 Program；
2. draft 从未改变任何 world authority，commit 只通过同一 Gateway Host 与 existing world_edit；
3. direct write/edit 与 Agent turn atomic、bounded、redacted、可恢复；本切片没有 direct run；
4. scale/provider/persistence/generic SDK/Embodied 均未进入；
5. focused/full/typecheck/build/diff/EXharness/Chromium 全部通过；
6. independent implementation cross-review `approved` 且 P0/P1=0；
7. 没有新的明确 authority 时，停在未提交 worktree，不 commit、push、merge、tag 或 deploy。

## Handoff

- 当前只完成计划；下一步是 independent plan cross-review。
- reviewer changes requested 时，先修改本 canonical plan，再生成 fresh digest/request；不得在旧计划上开始实现。
- plan approved 后仍需 Human 明确授权 implementation。
