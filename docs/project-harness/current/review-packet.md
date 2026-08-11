# Review Packet

## Subject

- Checklist item: `DH-009`
- Reviewer: `review-team-round3`
- Updated at: `2026-08-11`
- Canonical plan path: `docs/project-harness/tasks/DH-009/plan.md`

## Item Snapshot

- Title: 3DGS Observation / Spark Presentation 对齐切片
- Status: doing
- Workflow status: changes_requested
- Priority: p0
- Owner: codex
- Session: codex-dh009-20260810-1
- Dependencies: DH-008

## Acceptance

同一个 imported rigid Entity 以独立 3DGS observation、GLB visual、box collision proxy 与 MuJoCo state 形成可测量证据链；repo-owned artifact 的 digest/provenance/frame/units/alignment fail closed，Spark 只负责 Presentation，Episode playback 与 structured AlignmentEvidence 在明确 tolerance 内 PASS；四工具、Kernel 与 ref authority 不扩张；tests/typecheck/build/Chromium/diff/checklist 通过。

## Verification



## Handoff

Canonical design/acceptance plan 已建立。按 Phase 1 先做 Spark 2.1.0 compatibility 与 RED；未经额外 Human authority 不 commit/push、调用真实 provider、PR/merge/tag/deploy。

## Review Inputs

- Scope: `docs/project-harness/scope.md`
- Architecture: `docs/project-harness/architecture.md`
- Domain model: `docs/project-harness/domain-model.md`
- Progress: `docs/project-harness/progress.md`
- Review output target: `docs/project-harness/current/review.md`

## Canonical Plan Content

```md
# DH-009 计划：3DGS Observation / Spark Presentation 对齐切片

## 状态与 Authority

- Status：`implementation complete / independent review pending`（EXharness workflow 仍为 `running / doing`）；
- Branch：`agent/codex/DH-009`；
- Worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-009`；
- Base：`fdbbf680122c06810f58da37d9973d4f0aa2c984`；
- Human 已授权把 `DH-008` fast-forward 到 `main` 并推送，创建本 item、独立 worktree/branch、EXharness 节点与 canonical design/acceptance plan，并要求计划完成后再进入实现；
- 当前 authority 不包含 `DH-009` 的 commit、push、PR、merge、tag、deploy、真实 provider prompt、credential 使用或外部资产上传。

## Goal

让 `DH-008` 的同一个 imported rigid Entity 第一次拥有独立的 3DGS Observation representation，并由 Spark 在现有 Three.js 场景中呈现；GLB visual、3DGS observation、box collision proxy、MuJoCo state、Episode 与 Evaluation 必须继续解析到同一个稳定 `EntityRef`，同时保持各自的 authority 边界。

本切片不是“在 Viewer 中加载一个 splat 文件”。它要证明真实感 representation 可以加入同一个可执行世界，却不会成为 Snapshot pose、collision geometry 或 Runtime state 的替代事实。

## 当前外部事实与版本 gate

只读核验日期：`2026-08-10`。

- Spark 官方当前文档与 release 示例使用 `@sparkjsdev/spark` `2.1.0`；npm manifest 声明 MIT license、`three >=0.180.0` peer dependency 和 `fflate ^0.8.2` dependency；
- 当前 Studio 锁定 `three 0.185.1`，满足该 peer range；实现时只新增精确锁定的 `@sparkjsdev/spark@2.1.0`，不升级 Three.js 或其他无关 dependency；
- 官方 API 允许 `SplatMesh` 从 `fileBytes` 加载 PLY/SPZ 等格式，提供 `initialized`、`getBoundingBox()` 与 `dispose()`；`SplatMesh` 是 `THREE.Object3D`，可以置于 Entity presentation root 下；
- `SplatMesh.scale` 在当前文档中只保证 uniform scale，因此本 slice 的 3DGS local scale 必须为等比缩放；需要非等比标定时应重新生成 artifact，而不是静默扭曲；
- 官方示例的远程 URL 只用于说明 API。本产品只使用 repo-owned bytes；Presentation 在 digest 验证通过后才把 bytes 交给 Spark。

实现开始时必须通过 `npm view @sparkjsdev/spark@2.1.0 ...` 与 lockfile diff 再确认一次上述 contract；若 package contract 已漂移，停止实现并先修订本计划，不用兼容 flag 掩盖。

参考：

- <https://sparkjs.dev/>
- <https://sparkjs.dev/docs/splat-mesh/>
- <https://sparkjs.dev/docs/spark-renderer/>
- <https://github.com/sparkjsdev/spark/tree/v2.1.0>

## First-principles design

```text
repo-owned 3DGS bytes
  ├── content digest + byte length + splat count
  ├── provenance/license + deterministic generator
  ├── source frame + source units
  ├── local alignment transform + expected bounds
  └── role = observation
                  │
                  ▼
EntityRef ── observation representation ──→ Spark / SplatMesh
   │
   ├──── visual representation ───────────→ existing GLB / Three.js
   ├──── collision representation ────────→ existing box proxy / MuJoCo
   ├──── authoritative state ─────────────→ Snapshot / Episode sample
   └──── diagnostic alignment evidence ──→ Studio inspector PASS / FAIL
```

### Representation decision

本 slice 选择最窄且最能暴露边界的语义：

- 现有 `representations.visual` 继续指向 `diagnostic-wedge-v1.glb`；
- `representations.observation` 新增为显式 `null | GaussianSplatObservationRepresentation`；
- 3DGS fixture 只声明 `role: "observation"`，不同时冒充 visual、collision 或 physics；
- Studio-local Presentation mode 可以显示 `mesh`、`3dgs` 或 `overlay`，但这个 mode 不进入 Snapshot、Product Session transport authority 或四工具输入；
- Spark/`SplatMesh` type、object、worker、URL 和 buffer 都不得进入 `@demiurges/world` Kernel records。

这里不建立通用 `Artifact SDK`。只增加当前真实 fixture 所需的一个 bounded plain-data observation record 和一个 repo-owned registry entry；第二个真实 representation/provider 出现前不抽象 loader factory 或 plugin system。

### Diagnostic fixture

增加一个由仓库脚本确定性生成的、小型非对称 wedge 3DGS PLY fixture：

- 使用固定 seed、固定 splat count 与固定 PLY schema；
- repo 保存生成脚本和生成结果；
- registry 固定 `assetId`、media type、SHA-256、byte length、splat count、provenance、license、source frame、source-unit meters、local transform、expected entity-local bounds 与 tolerance；
- fixture 只通过封闭 `assetId` 解析，不接受任意 URL、绝对路径、文件内容或 Agent-provided bytes；
- 实现 gate 对真实文件重算 digest、解析 header/count/bounds，并扫描 provenance/license；只信 registry 常量而不检查 bytes 不算通过。

PLY 是本 slice 的有意选择：它便于确定性生成、检查与失败注入。压缩 SPZ、远程 streaming、LoD tree 和格式转换属于后续性能任务，不进入当前 acceptance。

### Alignment evidence

Alignment 必须产生结构化诊断证据，而不是只画一个 overlay：

```text
AlignmentEvidence
  entityRef
  observationAssetId + contentDigest
  sourceFrameRef + sourceUnitMeters
  appliedLocalTransform
  observedEntityLocalBounds
  expectedEntityLocalBounds
  collisionProxyBounds
  maxBoundsErrorMeters
  poseTranslationErrorMeters
  poseAngularErrorRadians
  toleranceMeters
  passed
```

- `observedEntityLocalBounds` 必须来自已验证 bytes 经 Spark 初始化后的实际 bounds；
- bounds 经显式 frame/unit/local transform 映射后，与 registry expected bounds 比较；
- Episode 播放时另比较 splat presentation root 与 authoritative sample pose；
- Inspector 显示数值、tolerance 和 `PASS/FAIL`；缺失、未初始化、digest 失败或非有限数值一律不是 PASS；
- 此 evidence 是 Presentation diagnostic observation，不是 `EvaluationRecord`，也不能推进 Repository ref。

### Presentation lifecycle

- 现有 Three.js scene、camera 和 `WebGLRenderer` 保持唯一；SparkRenderer 作为同一 scene 的 Presentation component 接入，不创建第二个世界或第二个 renderer；
- 3DGS bytes 先从 repo-owned URL 读取并验证 digest，再通过 `fileBytes` 创建 `SplatMesh`；
- `EntityRef` 绑定在稳定 presentation root 上，Spark object 只是 child；Entity pose 只应用于 root，artifact local transform 只应用于 child；
- selection 使用与 EntityRef 绑定的已有 visual/collision pick proxy，不把百万 splat raycast 变成 identity authority；
- session reset、representation drift、mode switch、component cleanup 或 late async completion 必须取消旧 generation、移除 object 并调用 `dispose()`；旧 load 不得污染新 Product Session；
- 3DGS load/error/alignment 状态只影响 Presentation evidence，不修改 Snapshot、Episode、Evaluation 或 current ref。

## In scope

1. 增加一个显式、bounded、immutable 的 3DGS observation representation，并让 primitive fixture 使用 `observation: null`。
2. 增加单一 repo-owned diagnostic PLY artifact、确定性 generator 与 fixture registry；安装精确锁定的 Spark dependency。
3. 扩展 Product Session codec 与 evidence closure，使 observation identity/frame/units/alignment 在 base Snapshot、samples 与 terminal Snapshot 中不可漂移。
4. 证明 MuJoCo 与 landing evaluator 只消费 collision/physics/state；增加 observation 不改变 Runtime trajectory 或 Evaluation semantics。
5. 在现有 ThreeViewport 内接入一个 SparkRenderer 与按 EntityRef 管理的 SplatMesh lifecycle。
6. 增加 `mesh / 3dgs / overlay` Studio-local diagnostic mode、collision proxy overlay 与结构化 AlignmentEvidence inspector。
7. 在 repository view、Episode 中间 sample、terminal sample、mode switch 与 session reset 中验证同一 EntityRef 和 pose 对齐。
8. 保持 Agent model-facing surface 恰好为 `read/write/edit/run`，不新增 asset/file/observation tool。

## Non-goals

- 从照片、视频或模型 prompt 训练/生成 3DGS；world-model、VLM 或新的 Agent provider；
- 任意文件上传、远程 URL、CDN、asset marketplace、数据库或通用 Resource Library；
- 把 3DGS 作为 collision geometry、MuJoCo state、Snapshot pose 或 deterministic landing evaluator 输入；
- 替换 GLB visual、删除 primitive scenario，或让 `observation` 字段兼容任意未知格式；
- SPZ/SOG/KSPLAT/RAD、LoD、streaming、WebGPU、动态 splat 编辑、骨骼动画或 splat raycast 性能优化；
- articulated robot、曲面 collision、compound proxy、deformable world 或第二 Evolution Runtime；
- 通用 Presentation Adapter SDK、loader registry、plugin system 或第五个 model-facing tool；
- commit、push、PR、merge、tag、deploy 或真实 provider prompt，除非 Human 另行授权。

## Acceptance

1. **Authority separation**：同一 Entity 同时持有 GLB visual、3DGS observation 与独立 box collision proxy；Kernel plain records 不 import Spark/Three/MuJoCo，Spark object/URL/buffer 不穿透 Product Session contract。
2. **Artifact identity**：repo-owned PLY 的 deterministic generator、SHA-256、byte length、splat count、format、provenance/license、frame、units、local transform、expected bounds 与 tolerance 均有唯一 source of truth；bytes/header/count/digest/bounds 任一漂移时 fail closed。
3. **Identity closure**：base Snapshot、Studio selection、3DGS object mapping、每个 Episode sample、TerminalSnapshot 与 Evaluation target 保持同一 `EntityRef`；observation identity/frame/units/transform 在 serialized projection/stream 中不可伪造或漂移。
4. **Runtime independence**：在相同 base state、collision proxy、program/profile 与相应 run inputs 下，有无 3DGS observation 的 MuJoCo state trajectory 和 landing metrics 在声明的 numeric equivalence 内一致；`run` 不推进 current ref。
5. **Measured alignment**：实际加载 splat bounds 经显式 frame/unit/local transform 后生成 AlignmentEvidence；repository view、Episode 中间 sample 与 terminal sample 的 bounds/translation/angular error 均为 finite，处于明确 tolerance 内并显示 PASS；故意扰动 units、transform 或 bounds 的 regression 必须 FAIL。
6. **Visible Product slice**：真实 Chromium 中可切换 `mesh / 3dgs / overlay`；3DGS 确实由 Spark 呈现，collision proxy 可检查，Episode timeline 播放时 splat 与同一 Entity 同步运动，GLB 与 3DGS overlay 不出现可见轴向/尺度漂移。
7. **Lifecycle safety**：late load、load failure、rapid mode switch、representation replacement、session reset 与 component cleanup 不恢复旧 object、不泄漏 active Spark/Splat resources，也不把 Presentation failure 写回 authoritative records。
8. **Surface preservation**：restricted OMP active/enabled tools 仍恰好为 `world_read/world_write/world_edit/world_run`，mounted tools 为空；Agent input 仍不能提供 URL/path/file/bytes 或 Presentation mode。
9. **Regression gates**：primitive box、imported GLB、Product Session、Agent canary offline fixtures保持；`bun test`、`bun run typecheck`、`bun run build`、targeted artifact checks、真实 Chromium acceptance、`git diff --check` 与 harness validation 全部通过。

## 实现阶段

### Phase 1 — Dependency/format compatibility 与 RED

- 复核 `@sparkjsdev/spark@2.1.0` manifest、Three peer compatibility、license 与 lockfile scope；
- 用最小本地 PLY probe 确认 Spark `fileBytes → initialized → getBoundingBox → dispose` 在当前 Vite/Chromium 组合成立；probe 失败时先修订计划，不引入第二 renderer 或 CDN fallback；
- 先补 observation codec、artifact drift、Runtime independence、async lifecycle 与 alignment FAIL regressions。

### Phase 2 — Observation record 与 artifact authority

- 增加最小 3DGS observation plain-data record；
- 增加 deterministic PLY generator、生成资产与单 fixture registry；
- 扩展 Snapshot/Product codec 与 terminal closure，保持 exact-key、budget 与 deep-freeze invariant。

### Phase 3 — Spark Presentation lifecycle

- 在现有 ThreeViewport 内创建/销毁唯一 SparkRenderer；
- 校验 repo bytes 后创建 SplatMesh，并绑定同一 Entity presentation root；
- 完成 mode switch、selection proxy、Episode pose、late-load generation guard 与 disposal。

### Phase 4 — Alignment evidence 与 Product UI

- 从真实 SplatMesh bounds 计算 AlignmentEvidence；
- 增加 mesh/3dgs/overlay 控制和 Inspector 数值 PASS/FAIL；
- 保证 Presentation diagnostics 不进入 Agent tool input 或 authoritative Evaluation。

### Phase 5 — Full gates 与 independent review

- 运行 targeted/full tests、typecheck、build、artifact、browser、diff 与 harness gates；
- 冻结 product digest，执行 independent review；
- reviewer 未批准前不 close/mark-done；Human 未另行授权前不 commit/push。

当前 implementation checkpoint 与可执行验收证据记录在同目录 `progress.md`；本计划正文仍是设计与验收 authority，不把实现细节反向改写成目标。

## Exit condition

只有当 repo-owned 3DGS bytes 被 Spark 实际呈现，同一个 Entity 在 GLB visual、3DGS observation、collision proxy、MuJoCo Episode 与结构化 alignment evidence 中形成可执行、可测量、可失败的闭环，并且 Kernel、四工具和 Repository authority 均未扩张时，DH-009 才能请求 closeout。
```

## Review Focus

1. 当前计划或结果是否覆盖 acceptance
2. 是否越过 scope non-goals
3. 是否越过 architecture 模块边界
4. 是否偷偷吸收了未来 checklist item 的工作
5. 当前验证方式是否足以支持结束本轮
