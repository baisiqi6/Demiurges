# Closeout Packet

## Subject

- Checklist item: `DH-009`
- Reviewer: `closeout-auditor`
- Updated at: `2026-08-11`
- Canonical plan path: `docs/project-harness/tasks/DH-009/plan.md`

## Item Snapshot

- Title: 3DGS Observation / Spark Presentation 对齐切片
- Status: doing
- Workflow status: closeout_requested
- Priority: p0
- Owner: codex
- Session: codex-dh009-20260810-1
- Dependencies: DH-008

## Acceptance

同一个 imported rigid Entity 以独立 3DGS observation、GLB visual、box collision proxy 与 MuJoCo state 形成可测量证据链；repo-owned artifact 的 digest/provenance/frame/units/alignment fail closed，Spark 只负责 Presentation，Episode playback 与 structured AlignmentEvidence 在明确 tolerance 内 PASS；四工具、Kernel 与 ref authority 不扩张；tests/typecheck/build/Chromium/diff/checklist 通过。

## Verification

Final product digest 79b9050ee69ea8c6869fb51521aa9b128da40d070b6ad27b0e27249fe2aebec5; 102 tests / 0 fail / 2,627 assertions; typecheck, production build, deterministic PLY SHA-256, git diff --check, harness validation and Chromium four-tools/3DGS/overlay/playback/reset acceptance passed; Round 3 Sol + Terra approved with P0/P1/P2 none.

## Handoff

Human authorized closeout, normal mark-done, commit and push agent/codex/DH-009. Do not create PR, merge main, tag, deploy or send a real provider prompt.

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

- Status：`implementation complete / independent review approved / Human closeout authorized`；
- Branch：`agent/codex/DH-009`；
- Worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-009`；
- Base：`fdbbf680122c06810f58da37d9973d4f0aa2c984`；
- Human 已授权把 `DH-008` fast-forward 到 `main` 并推送，创建本 item、独立 worktree/branch、EXharness 节点与 canonical design/acceptance plan，并要求计划完成后再进入实现；
- Human 已于 final Round 3 双审批准后授权 `closeout`、`mark-done`、commit 与 push `agent/codex/DH-009`；本次 authority 不包含 PR、merge `main`、tag、deploy、真实 provider prompt、credential 使用或外部资产上传。

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
- PR、merge、tag、deploy 或真实 provider prompt；本轮只按 Human 明确授权执行 closeout、mark-done、commit 与 push 当前 feature branch。

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

## Recent Progress Context

```md
# 进展

## 2026-08-09 — DH-000 bootstrap 已关闭

已完成：

- 接受产品身份 `Demiurges`；
- 在 `/Users/Admin/projects/Demiurges` 创建独立本地 Git 仓库；
- 建立 repo-local scope、architecture、domain model、technical foundation 与 geometry roadmap；
- 将 Lyaup 记录为只读技术捐赠者，而非源码母体；
- 定义 falling-cube walking skeleton；
- 创建一个 bootstrap checklist item 与 review packet；
- 将仓库文档统一为中文主体，并在 `AGENTS.md` 固化语言规则。

本地验证：

- EXharness checklist validation 以 0 warning 通过；
- `harness-checklist.json` 可解析，并只包含一个 active bootstrap item；
- `workflow.branch` 与 `artifacts.branch` 一致；
- 所有已登记 artifact path 均存在；
- 3 条本地 event record 均可独立解析为 JSON；
- 当时全部 Markdown 本地链接均可解析；
- `git diff --check` 通过；
- Git status 只包含已授权的 bootstrap 文件。

Independent review：

- Kimi Code `kimi-code/k3` 以 `max` effort 完成只读审查；
- Decision 为 `approved`，P0 与 P1 均为无；
- Operator 复核 reviewer 前后仓库 SHA-256 manifest 完全一致；
- 完整结论见 `tasks/DH-000/review-verdict.md`。

待完成：无。该段只描述 `DH-000` 关闭时的历史状态。

尚未创建 product code、dependency、remote、commit、deployment、Issue 或 PR。

## 2026-08-09 — Spark/3DGS 路线校准

- 第一条 `falling-cube` Runtime MVP 继续明确不接入 Spark/3DGS；
- 3DGS 被定位为带 provenance 与 alignment 的 appearance/observation representation，不定义 Kernel；
- Spark 被定位为 3DGS 的 Presentation 实现；
- 3DGS 验证阶段移动到 imported mesh 之后、articulated robot 之前；
- Product MVP 早期以 `EntityRef`、frame、units、collision proxy 与 MuJoCo state 的可检查 alignment 为验收目标。

## 2026-08-09 — DH-001 Falling Cube 已实现，等待独立审查

已完成：

- 创建 Bun workspace 与 SolidJS/Vite Studio；
- 建立最小 immutable Kernel records 与内存 `WorldRepository`；
- 用真实 `@mujoco/mujoco 3.11.0` 单线程 WASM 从 Snapshot 编译 MJCF 并生成 Episode；
- 生成 TerminalSnapshot 与独立 deterministic EvaluationRecord；
- 建立 Three.js Observation、结构化 inspector、Episode timeline、evaluate 与 explicit adopt；
- 证明 `run` 不推进 current ref，只有 `adopt` 才推进；
- 完成桌面与移动端真实 Chromium acceptance。

验证结果：

- `bun test`：4 pass、0 fail、22 assertions；
- `bun run typecheck`：通过；
- `bun run build`：通过，实际生成约 10.1 MB 的 `mujoco.wasm`；
- 浏览器：76 samples，terminal 高度约 `0.250 m`，高度误差 `0.00007 m`，末速度约 `0 m/s`，Evaluation 为 `PASS`；
- 浏览器：WebGL context 有效，无 page error/alert；桌面与 390px 移动布局均经截图检查。

当前状态：实现者已完成本切片并准备 reviewer packet；`DH-001` 等待 independent reviewer verdict，Coding agent 不自行标记 `done`。

## 当前风险

- MuJoCo WASM 首次加载成本与 Three.js 主 chunk 体积尚未做真实网络性能预算；当前证据只覆盖本地 Product slice 正确性。
- Repository 尚未 persistence，刷新页面会丢失 Snapshot/Episode；这是明确 non-goal，不用补丁伪装持久化。
- Spark/3DGS 仍不进入第一条 Runtime slice；它们在 imported mesh 之后进入 Product MVP 早期 alignment 验证。

## 下一步

先由独立 reviewer 审查 `DH-001`。只有 approved 后，Operator 才能关闭 item；后续实现必须从新的 checklist item 与用户 authority 出发，不能在本切片顺手扩展 Agent、3DGS、机器人或通用 Adapter SDK。

## 2026-08-09 — DH-001 启动重大变更交叉审查

- 用户授权对重大审查同时使用 `gpt-5.6-sol`（`max`）sub-agent 与 Kimi Code K3（`max`）进行交叉审查；
- 两位 reviewer 使用同一只读 authority、fresh session 和结构化 severity/decision contract，但分别侧重领域 authority 与实现 correctness；
- product artifact 审查前 aggregate SHA-256 为 `48d160ccdb1fdf86955d00f99f55069eddcda31fd1f8f82a42b6e8241ba929e9`；审查后必须复核不变；
- 任一 reviewer 提出 P0/P1，或两者在阻断问题上分歧，都不得自动 close；先由 Operator 对照 source 与测试复核。

## 2026-08-09 — DH-001 交叉审查结论为 changes_requested

- Kimi Code K3 Max：`approved`，无 P0/P1；
- GPT-5.6 Sol Max：`changes_requested`，报告 duplicate identity、Snapshot 初态映射、sample grid、Runtime validation/provenance 与 EvaluationRecord immutability P1；
- Operator 逐项独立复现 Sol 的反例，确认不是 reviewer 推测；
- Operator 重跑 `bun test`、typecheck、build 均通过，说明现有 happy-path checks 不足以覆盖这些 invariant；
- 审查后 product aggregate SHA-256 仍为 `48d160ccdb1fdf86955d00f99f55069eddcda31fd1f8f82a42b6e8241ba929e9`；reviewer 未改产品文件；
- `DH-001` 不关闭，进入 `changes_requested`。下一步从底层 invariant 修复并补 regression tests，不以 UI 文案、兼容 flag 或零散 guard 掩盖。

详细结论：`tasks/DH-001/cross-review-verdict.md`。

## 2026-08-09 — DH-001 开始 invariant 修复

- 用户明确授权修复交叉审查确认的 P1；
- 继续使用同一 `DH-001` item 与 canonical plan，不创建第二套任务事实；
- 实现纪律采用 regression-first：先让 duplicate identity、完整初态映射、exact sample grid、invalid Runtime/provenance 与 EvaluationRecord immutability 测试失败，再做最小实现；
- 不在本轮引入 persistence、provider abstraction、3DGS、Agent 或新的安全/权限层。
- Regression RED 已确认：旧实现运行新 tests 为 4 pass、5 fail、1 error；五类 P1 均有独立失败信号，原有 happy path 仍为 4 pass。

## 2026-08-09 — DH-001 invariant 修复完成本地验证

- Repository 不再允许相同 Snapshot ID 覆盖已有 immutable content，避免 ref 在未 adopt 时改变所指世界；
- Snapshot 的 floor rotation、cube rotation、linear velocity 与 world angular velocity 进入真实 MuJoCo；对 MuJoCo free-joint 的 local angular velocity 语义在 Runtime 边界显式转换；
- 240 Hz physics / 30 Hz observation 以 integer step modulo 采样，76 个 sample 对齐 `index / 30`；
- malformed program、伪造 RuntimeProfile、错误 frame/units 与不受支持状态 fail closed；RuntimeEvidence 只由实际 implementation 常量生成；
- EvaluationRecord 递归冻结，ID 同时编码 Episode、evaluator 与完整 success-contract identity；
- `bun test`：9 pass、0 fail、117 assertions；`bun run typecheck` 与 `bun run build` 通过；
- 真实浏览器 acceptance：edit 后 ref 为 `snapshot:edit-1`，run 得到 76 samples、terminal `0.250 m`，evaluate 为 `PASS`；run/evaluate 不推进 ref，explicit adopt 后才变为 `snapshot:terminal-studio-1`；控制台无 error；
- 修复后 product aggregate SHA-256 为 `a992f412f8b1ced1c8182f492c307f8c9f7b2af1a956ebc80f96451abfb496a7`。当前等待 fresh cross-review，Coding agent 不自行关闭 `DH-001`。

## 2026-08-09 — DH-001 第二次交叉审查仍为 changes_requested

- Kimi Code K3 Max：静态审查 `approved`，唯一 P2 是 world/local angular velocity 的 round-trip test 仍可能同错相消；其 plan-mode 无法独立执行 `bun`/hash/browser；
- GPT-5.6 Sol Max：`changes_requested`，并用只读反例复现四类 P1：固定 identity 未覆盖 program/profile 全参数；浅层 freeze 与 mutable ExplicitInputs 允许 await 期间证据漂移；未实现的 static/extra Entity state 被接受后旁路；contact event 与当前 MuJoCo state 晚 `1/240s`；
- Sol 独立运行 `bun test` 为 9 pass、0 fail、117 assertions，说明第一轮回归已修复原五类问题，但尚未覆盖这四类更深 invariant；
- 两位 reviewer 审查前后 product digest 均为 `a992f412f8b1ced1c8182f492c307f8c9f7b2af1a956ebc80f96451abfb496a7`，未修改产品；
- combined decision 按预设规则采用 `changes_requested`。继续同一 Phase 7，从 input identity/immutability、supported-world closure 与 observation timing 四个根因统一修复，不关闭 item。

## 2026-08-09 — DH-001 第二轮 invariant 修复完成本地验证

- 新回归在旧实现上得到 9 pass / 4 fail / 125 assertions，分别复现不完整 identity、浅层 freeze、旁路 Entity state 与 contact 晚 `1/240s`；
- 固定 `WorldProgram` / `RuntimeProfile` 现在完整约束 id、target、duration、sample rate、provider、version、equivalence、timestep 与 gravity；
- Snapshot、Program、Profile 与 ExplicitInputs 必须在 Runtime 第一个 await 前递归冻结，避免 execution 与 evidence 混合两个输入版本；
- falling-cube slice 的 supported-world set 闭合为恰好 `entity:floor + entity:cube`；静态地面必须使用 0 mass 与 0 velocity，额外未演化 Entity fail closed；
- Runtime 每个 `mj_step` 后执行 `mj_forward` 再观察 contact，使 `contact-began` 与当前 state/time 对齐；cleanup 改为 nested finally；
- angular velocity test 新增 sample 1 的独立数值 quaternion oracle，降低 round-trip 同错相消风险；
- 修复后 `bun test`：13 pass、0 fail、130 assertions；typecheck/build 通过；浏览器 edit/run/evaluate/adopt 再次通过，76 samples、PASS、ref 仅在 adopt 后推进，console 0 warning/error；
- 新 product aggregate SHA-256：`8c1a4015990433dc196e2175f79a8700d351ab6e0ead60e2091d1cddffe14d21`。等待 fresh cross-review，不自行关闭 item。

## 2026-08-09 — DH-001 第三次交叉审查为 changes_requested

- Kimi Code K3 Max fresh static review：`approved`，无 P0/P1；其首个本轮 session 因 transient repo write 越过 authority 被中止，Operator 复核无残留、digest 不变后，以禁用 Bash/Edit/Write 的新 session 重做；
- GPT-5.6 Sol Max：`changes_requested`，独立运行 13/0 tests 后复现 shallow-frozen Repository mutation、orphan lineage adopt、sparse Vec3 → NaN completed evidence、同 runId/不同 base 的派生 identity collision；
- 审查前后 product digest 均为 `8c1a4015990433dc196e2175f79a8700d351ab6e0ead60e2091d1cddffe14d21`；
- combined decision 采用 `changes_requested`。下一轮只修 admission invariant：递归冻结即使 root 已 frozen 也遍历 children；Repository parent 必须可解析；Vec3 显式检查 0/1/2 槽；Episode/Terminal identity 绑定 base Snapshot。

## 2026-08-09 — DH-001 第三轮 invariant 修复完成本地验证

- 新回归旧实现：13 pass / 4 fail / 134 assertions；四类 Sol 反例均有独立 RED；
- 修复后 `bun test`：17 pass、0 fail、140 assertions；typecheck/build 通过；
- `deepFreeze` 在 frozen root 上仍递归 children，并以 WeakSet 避免 cycle 重入；Repository current ref 不再可能因 shallow child 外部 mutation 改变；
- Repository 只接纳 parent 已登记的 Snapshot，orphan terminal 无法 record/adopt；
- Vec3/halfExtents 校验显式访问三个槽位，sparse array 不再绕过；Evaluator 对非 finite terminal evidence fail closed；
- Episode/Terminal/Evaluation identity 绑定 run 与 base Snapshot，不同 base 复用 runId 不再碰撞；
- 浏览器第三次完成 edit/run/evaluate/adopt：76 samples、PASS，ref 从 `snapshot:edit-1` 仅在 adopt 后变为 `snapshot:terminal-studio-1--edit-1`，console 0 warning/error；
- product digest：`52c26a6d7e3de7533a6b8307da52172b75c8be476ef23334662c1a52589c3fe1`。等待 final fresh cross-review，不自行关单。

## 2026-08-09 — DH-001 Final cross-review 仍为 changes_requested

- Kimi K3 Max static review：`approved`，无 P0/P1；
- GPT-5.6 Sol Max：`changes_requested`，复现 length-ambiguous derived ID、accessor-backed frozen Vec3 await mutation、null-parent runtime terminal、derived Evaluation metric overflow；
- Sol 独立运行 tests 为 17 pass / 0 fail / 140 assertions，digest before/after 均为 `52c26a6d7e3de7533a6b8307da52172b75c8be476ef23334662c1a52589c3fe1`；
- 继续最小修复：使用 length-prefixed identity；deep immutable 同时要求 plain own-data property；source-parent 关系一致；输出与派生 metric 均 finite。

## 2026-08-09 — DH-001 第四轮 invariant 修复完成本地验证

- RED：17 pass / 4 fail / 144 assertions；GREEN：21 pass / 0 fail / 146 assertions；
- length-prefixed execution key 消除 run/base segment 编码碰撞；
- immutable record 现在要求 frozen plain own-data graph，accessor-backed Array 在第一个 await 前被拒绝；
- runtime-terminal 必须具有 parent；Repository 不能采纳 null-parent terminal；
- MuJoCo observation 与 Evaluation 派生 metrics 均对 non-finite fail closed；
- typecheck/build 通过；Chromium 76 samples、PASS、ref 只在 adopt 后推进、console 0 warning/error；
- product digest：`528cbf328e469ec1f5b54cbc64aaefeeae46ab0a56ad5bbdbcdbaea0ef7784dc`。等待 approval gate。

## 2026-08-09 — DH-001 Approval gate 为 changes_requested

- Sol 独立确认 accessor Vec3、ambiguous segments、null-parent terminal、MAX_VALUE metric 四类反例已关闭，`bun test` 21/0/146；
- 新复现两项 P1：`write(runtime-terminal)` 可绕过 adopt；accessor Success Contract 可令 Evaluation ID 与 predicate 使用不同 tolerance；
- digest before/after 均为 `528cbf328e469ec1f5b54cbc64aaefeeae46ab0a56ad5bbdbcdbaea0ef7784dc`；
- 继续只收紧现有入口：write/record/adopt 按 source 分工；Evaluator 只消费 plain immutable Episode/Contract。

## 2026-08-09 — DH-001 Operation admission 修复完成

- RED：21 pass / 2 fail / 148 assertions；GREEN：23 pass / 0 fail / 153 assertions；
- `write` 只接纳 `source: write` root，`record` 与 `adopt` 只接纳 `runtime-terminal`，terminal 无法绕过 adopt 推进 ref；
- Evaluator 在读取任何 metric/contract 字段前要求 Episode 与 SuccessContract 都是递归冻结的 plain data record；
- typecheck/build 与 Chromium edit/run/evaluate/adopt 通过；76 samples、PASS、ref 仅 adopt 后推进，console 0 warning/error；
- product digest：`b05bcf70cd8e368cf573329cb733c72a3565241a2f172f2d7aaa03a951e0dec8`。等待聚焦 closure review。

## 2026-08-09 — DH-001 Focused closure review approved

- GPT-5.6 Sol Max 独立 verdict：`approved`，P0/P1/P2 均无；
- reviewer 独立运行 `bun test`：23 pass / 0 fail / 153 assertions；
- operation probe 证明 write/record/adopt 按 source 分工，只有 explicit adopt 推进 terminal ref；
- accessor SuccessContract probe 在读取任何 getter 前被 plain-data gate 拒绝，`reads=0`；
- reviewer digest before/after 均为 `b05bcf70cd8e368cf573329cb733c72a3565241a2f172f2d7aaa03a951e0dec8`，未修改产品；
- 实现者 typecheck/build/browser acceptance 继续有效。`DH-001` 已满足 reviewer gate，但 Coding agent 不自行 `mark-done`，等待 Operator 关单决定。

## 2026-08-09 — DH-002 Episode Player 已实现，等待独立审查

- Human/Operator 授权进入下一切片后，依据 `DH-001` 已存在的 focused approval 正式关闭 `DH-001`，并新建、激活 `DH-002`；
- Runtime 继续离线生成不可变 Episode；新增 `EpisodePlayer` 只在 Presentation 层以 `requestAnimationFrame` 将 wall time 映射到 `EpisodeSample.timeSeconds`；
- 新 Episode 默认从 sample 0 自动回放，支持播放/暂停、重播、前后逐帧、timeline seek 与 `0.5x / 1x / 2x`；reduced-motion 下不自动播放；
- 播放器只选择真实 sample，不插值、不修改 Episode，不调用 Repository；Repository view 失活时 clock 停止，explicit adopt 不会被残余 tick 抢回；
- regression-first 证据从缺少 clock module 的 RED，进入 26 tests / 166 assertions 全绿；typecheck/build 通过；
- 真实浏览器证明自动推进、暂停稳定、逐帧、倍速续播、seek、Evaluation PASS、run/evaluate 不推进 ref，以及播放中 adopt 后稳定进入 terminal authority；
- 当前 product aggregate SHA-256 为 `945b0a827397b44f4570f01891891a4269805b0d6bca8e9fe4d5ebe49e402f36`，准备 independent read-only review。

## 2026-08-09 — DH-002 Independent review approved

- fresh reviewer 未发现 P0/P1/P2，确认播放器只回传 sample index，Repository ref 仍只由 explicit adopt 推进；
- reviewer 确认 `active=false` 会 cancel rAF、清除 playing identity，旧 tick 也因 ID mismatch fail closed；pause、seek、rate change 统一停止并重锚，terminal 不再请求下一帧；
- reviewer 独立运行 `bun test`：26 pass / 0 fail / 166 assertions；
- reviewer digest before/after 均为 `945b0a827397b44f4570f01891891a4269805b0d6bca8e9fe4d5ebe49e402f36`；
- 最终 decision 为 `approved`。Coding agent 不自行 `mark-done`，等待 Operator 关闭 `DH-002`。

## 2026-08-09 — DH-002 获得 release authority

- 用户明确授权 commit、发布与 `mark-done`；
- 当前 Git `main` 尚无首个 commit，remote 与 deployment target 均不存在，根 package 为 `private`；
- 本轮 release boundary 为：Operator close → 首个本地 commit → annotated tag → `/Users/Admin/projects/my release/Demiurges/` 下的 committed source/build/checksum/receipt；
- 不创建未授权 remote，不伪称 GitHub、npm 或公网 deployment。

## 2026-08-09 — DH-002 Operator close 完成

- release gate：`bun test` 26 pass / 0 fail / 166 assertions，typecheck/build 通过，checklist validation 0 warning；
- Operator 运行 `mark-done`，事件为 `evt-20260810T023458Z-706fa171`；`DH-002` 已为 `done/closed`，lease 已释放；
- Git release locator 为 `release/dh-002-episode-player`；本地正式发布 locator 为 `/Users/Admin/projects/my release/Demiurges/dh-002-episode-player/`；
- 最终 commit SHA 与 artifact checksum 由 Git tag和外部 release receipt 自描述，repo 内不维护自引用 SHA。
- staged whitespace cleanup 仅删除 `episode-player-clock.ts` 末尾多余空行；release product digest 为 `899f2bba2090a6cffa839d8b33111eccca1b96f956b9a941deec10b8caa230f4`，targeted clock tests 为 3/0/13，gitleaks staged scan 无泄漏。

## 2026-08-09 — GitHub repository 建立并发布首个 release

- 用户明确授权：若 GitHub repository 尚不存在则使用 `gh` 创建，并要求以后在获得 commit authority 后同步 push；
- 已在 active `gh` account `baisiqi6` 下创建 private repository `https://github.com/baisiqi6/Demiurges`，配置为 canonical `origin`；
- `main` 已推送至 `526c5cf83901f68caad19e3ee911ef3740c1a2ad`；annotated tag `release/dh-002-episode-player` 的 remote dereferenced target 同为该 commit；
- 后续 commit + push 纪律已写入 `AGENTS.md` 与 `runbook.md`；该持续规则只规定已授权 commit 的交付方式，不扩大 commit、push 或 release authority；
- GitHub source publication 不代表 deployment；当前仍无 deployment target。

## 2026-08-09 — DH-003 World Ref 与安全 Adopt 实现完成，等待独立审查

- 新 item `DH-003` 已在独立 branch/worktree `agent/codex/DH-003` / `/Users/Admin/projects/WorkTrees/Demiurges-DH-003` 激活；
- 基线为 26 tests / 166 assertions；新增 authority test 在旧实现上因缺少 Host AdoptPolicy contract 明确进入 RED；
- Repository ref 现在是递归冻结的 `{ name, snapshotId, version }`，root write 初始化 v1，成功 advance/adopt 各自只递增一次；
- authored edit 只记录 child，explicit advance 才推进；Runtime Episode、Evaluation、record 与 Playback 均不推进 ref；
- AdoptPolicy 由 Host composition 显式注入；adopt 只接受已登记 Episode、同一 Episode 的已登记通过 Evaluation、匹配 evaluator/contract/policy、runtime terminal 与 fresh `expectedCurrent + expectedRefVersion`；
- stale CAS、相同 Snapshot 但旧 version、失败 Evaluation、错配 Episode/evaluator/contract/policy、未登记 evidence 与 terminal-only bypass 均有 executable regression；
- GREEN 为 32 tests / 0 fail / 200 assertions，typecheck/build 通过；build 仅保留既有 MuJoCo browser-external notice 与大 chunk warning；
- 真实浏览器证明 `v1 → edit/advance v2 → run/playback/evaluate 仍为 v2 → PASS adopt v3`，Evaluate 前 Adopt disabled，成功后再次 disabled；
- 当前 product source aggregate SHA-256 为 `2cd5edf7cdebaccd74851baa5cd65281f9d8f99bedb0397354626a3a0f174a7d`。下一步是 independent read-only review；Coding agent 不自行批准或关单。

## 2026-08-09 — DH-003 Round 1 审查缺口已从 Host 边界修复

- `gpt-5.6-sol/max` 在 digest `2cd5edf...` 上给出 `changes_requested`，并以可执行 probes 证明两个 P1：同名不同参数的 SuccessContract 可绕过 policy；伪造 frozen Episode/Evaluation 可把 height 99、`NaN` terminal 提升为 current；
- 新增回归先因缺少 `RuntimeMvpHost` 明确进入 RED（0 pass / 1 fail / 1 error）；
- 修复没有增加零散 provenance 字段：新增最小 `RuntimeMvpHost` effect boundary，私有持有 evidence capability，并只组合固定 MuJoCo Runtime、Program/Profile、Landing evaluator 与 canonical SuccessContract；
- Studio 只调用 `runCurrent`、`evaluateEpisode` 与 `adopt`，不再能提交任意 Episode/Evaluation；外部 capability 在任何 terminal Snapshot 入库前 fail closed；
- 修复后 34 tests / 0 fail / 210 assertions，typecheck/build 与 `git diff --check` 通过；build 仍只有既有 MuJoCo browser-external notice 与大 chunk warning；
- 真实浏览器复验仍为 `v1 → edit/advance v2 → run/evaluate 保持 v2 → PASS adopt v3`，Evaluate 前 disabled、Adopt 后再次 disabled；
- 修复后 product source digest 为 `d9ca6da0c6f1fd459ca786ae3d2d3545b84a12d3793ec6b75f94608f2c87411e`，进入 fresh cross-review。

## 2026-08-09 — DH-003 evidence authority 收束为 lexical closure

- Round 2 Kimi/K3 对 digest `d9ca6da...` 给出 approved；Sol/max 随后在同一 digest 上复现更强反例：在 Host 构造前替换导出的 `WorldRepository.prototype.recordEpisode`，可从 existing Host 截获 symbol capability 并 Adopt forged height 99 / `NaN` terminal；
- 实现者把该 executable probe 视为 changes requested；新增 regression 先证明旧 module 仍导出可拦截 class（expected false / received true）；
- 修复没有增加 token 隐藏层：Repository implementation 改为 module-private `WorldRepositoryState`，factory 只返回冻结 facade 与 evidence-writer lexical closures；`RuntimeMvpHost` 私有持有该 authority，admission 不再通过动态方法参数传递 symbol；
- 独立创建的另一 authority 只能影响它自己的 Repository，无法登记到 existing Host；
- 修复后 35 tests / 0 fail / 213 assertions，typecheck/build/diff-check 通过；真实浏览器第三次复验仍为 v1→explicit advance v2→run/evaluate 保持 v2→PASS adopt v3；
- product source digest 为 `495a6c95299e19bd3e714e381f2cb2b472a12b0aec45e7a8b647077fd96feec2`，等待 final fresh cross-review。

## 2026-08-09 — DH-003 Final cross-review approved

- Kimi/K3 与 GPT-5.6 Sol Max route 分别执行 fresh read-only review；两者都独立运行 35 tests / 0 fail / 213 assertions 与聚焦 `bun -e` probes；
- 两份 verdict 均为 `approved`，P0/P1/P2 none；digest before/after 都是 `495a6c95299e19bd3e714e381f2cb2b472a12b0aec45e7a8b647077fd96feec2`，工作树 status 前后不变；
- Final review 明确确认：Repository implementation 不导出；Host 私有持有 lexical repository/evidence closures；没有 symbol/token dynamic dispatch；foreign factory 只能影响自己的世界；forged evidence 与 alternate contract 无法进入 existing Host；
- `DH-003` 满足关单条件，进入 Operator close 与已授权 commit + push gate。

## 2026-08-09 — DH-003 Operator close 完成

- Closeout packet 经 final cross-review approval；`mark-done` 事件为 `evt-20260810T044915Z-946886aa`；
- `DH-003` 已为 `done/closed`，lease 于 `2026-08-10T04:49:15Z` 释放；checklist validation 0 warning；
- 发布边界为 commit + push `agent/codex/DH-003` 并回查 remote SHA；不 merge `main`，不伪称 deployment。

## 2026-08-09 — DH-003 已集成，DH-004 World Tool Surface 已实现

- Human 授权把已审查的 `agent/codex/DH-003` fast-forward merge 到 `main` 并 push；local `main`、`origin/main` 与 GitHub remote ref 均为 `15744fb3aeae2f995765047d657aef9821f653cb`；
- 新建 `agent/codex/DH-004` 与 `/Users/Admin/projects/WorkTrees/Demiurges-DH-004`，登记并激活 `DH-004`；
- 增加直接组合 `RuntimeMvpHost` 的 `WorldToolSurface`，model-facing prototype 恰好为 `read`、`write`、`edit`、`run`；
- `run` 返回同一 Host 产生的 Episode、deterministic Evaluation 与 base ref，但不推进 current；`adopt` 不进入模型工具面，只由持有同一 Host 的 Harness control boundary 执行；
- JSON round-trip input 会按 exact plain-data fields 复制、校验、冻结；accessor、错误 prototype、额外字段、非法 number/ID/ref version fail closed；
- scripted operator 证明四个工具可以完成 write → read → edit → run/evidence，随后 control side 才能显式 adopt；
- 当前验证为 39 tests / 0 fail / 245 assertions，typecheck、build、`git diff --check` 通过。下一步生成 review packet 并接受 independent read-only review；Coding agent 不自行审批或关单。

## 2026-08-09 — DH-004 Round 1 P1 已从 Repository transaction 修复

- Kimi Code K3 Max Round 1 给出 `changes_requested`：stale model edit 先插入 authored child、后 CAS 拒绝，导致 orphan Snapshot partial side effect；Sol reviewer 因 worktree 随后变化被标记 superseded，没有在混合 digest 上给 verdict；
- Operator 独立运行反例，确认 `stale_ref` 同时存在 `snapshot:edit-2` orphan；
- 修复从底层 authority transaction 出发：Repository 的同步 `editCurrentCubeHeight` 先检查 expected ref，fresh 时才创建 child 并推进；tool surface 不增加 guard、mode 或第五个工具；
- 回归现在证明 stale edit 后 current 不变且 orphan 不存在；修复后 39 tests / 0 fail / 246 assertions，typecheck、build、diff-check 通过；
- 当前 product source digest 为 `1d95045e02f39c676b2f362535a1846cd7b25747d6ab9f98b2e2545a7ed3076d`，下一步只在该 digest 上执行 fresh cross-review。

## 2026-08-09 — DH-004 Round 2 P1 已从 Host method-table invariant 修复

- Kimi Code K3 Max 在 digest `1d95045e...` 上 fresh approved；GPT-5.6 Sol Max 随后以 executable probe 证明可替换 `RuntimeMvpHost.prototype.readRefRecord`，从 tool dynamic dispatch 的 `this` 捕获 existing Host 并调用 `adopt`；combined verdict 为 `changes_requested`；
- Operator 独立复现 `captured === host`、adopt `updated`、ref v1 → v2，确认不是 reviewer 推测；
- 修复不增加 facade/registry/provider abstraction，而是在模块初始化时冻结作为 authority boundary 的 `RuntimeMvpHost.prototype`；
- regression 证明 `defineProperty`/assignment replacement 被拒绝、tool read 正常且 existing Host 未泄露；Round 1 atomic edit regression 同时保持；
- 当前 40 tests / 0 fail / 250 assertions，typecheck、build、diff-check 通过；product source digest 为 `9575362e701a6c980898ce448c6847522941c9cb102eaae28cedd0af7c4896db`，等待 final fresh cross-review。

## 2026-08-09 — DH-004 Final fresh cross-review approved

- Kimi Code K3 Max 与 GPT-5.6 Sol Max 在同一 product digest `9575362e701a6c980898ce448c6847522941c9cb102eaae28cedd0af7c4896db` 上完成 fresh/focused read-only review；
- 两份 verdict 均为 `approved`，P0/P1/P2 none；review 前后 digest 与 Git scope 不变；
- reviewer 独立验证 Host prototype 的 assignment/`defineProperty` interception 均被阻止，既有 capture probe 不再成立；
- Round 1 stale edit atomicity、四工具形状、run ref 不变、control-side adopt、JSON admission/output freeze 均保持；
- reviewer 独立运行 40 tests / 0 fail / 250 assertions。DH-004 已满足 reviewer gate，进入 Operator close 与已授权 commit + push；不 merge `main`。

## 2026-08-09 — DH-004 Operator close 完成

- Closeout request 事件：`evt-20260810T063932Z-9baaf80a`；final cross-review approval 事件：`evt-20260810T063932Z-5e55cf4c`；
- Operator `mark-done` 事件：`evt-20260810T063932Z-b294cfaf`；DH-004 已为 `done/closed`，lease 于 `2026-08-10T06:39:32Z` 释放；
- checklist validation 为 0 warning；最终 verification 绑定 40/0/250、typecheck/build/diff-check、完整 product digest 与双 reviewer approval；
- 当前发布边界为 commit + push `agent/codex/DH-004` 并回查 remote SHA；不 merge `main`，不代表 deployment。

## 2026-08-10 — DH-005 OMP Agent Runtime vertical slice 已实现

- Human 确认把所需能力内置到 Demiurges，但边界是不复制或 fork OMP 源码；OMP 作为锁定版本的可替换 Agent Runtime，Demiurges 保留 World Kernel 与 control authority；
- 新建 `agent/codex/DH-005` 与 `/Users/Admin/projects/WorkTrees/Demiurges-DH-005`，登记并激活 `DH-005`；
- 新增本地 Bun Agent Gateway，固定 `@oh-my-pi/pi-coding-agent@17.2.12`，只注册 `world_read`、`world_write`、`world_edit`、`world_run` 四个 host-owned tools；
- Round 1 executable cross-review 发现原 CLI/RPC composition 仍继承 ambient MCP，并处理 slash command 与 `@file` mention；combined verdict 为 `changes_requested`，原 digest `6bb22b193648b6f3d36d9176809409f10415d2f54d102fbd23393882da30f0d3` 未获批准；
- 修复没有继续叠加 CLI flags，而是从 composition 根部改为 OMP SDK restricted session：关闭 MCP、built-ins、extension discovery、skills/rules、IRC、LSP 与持久 session；任何 prompt 前核验 active/enabled 四工具与空 mounted surface；
- Gateway admission 拒绝 slash/control 与 `@file` preprocessing syntax；失败 turn 通过 `OmpAgentTurnError` 保留 frozen bounded trace，cleanup failure 不覆盖 primary failure；
- fake Agent walking skeleton 从自然语言请求出发，按 write → read → edit → run 完成 falling-cube task，Evaluation 为 PASS，run 后 ref 保持 authored version 2；Gateway boundary tests 当前为 6 pass / 0 fail / 32 assertions；
- 真实 OMP SDK boot smoke 在未发送 prompt、未发起 provider model call 的情况下成功：从 package manifest 读取 runtime `17.2.12`，effective tool surface 恰好为四工具，读取 state 后干净退出；
- Studio 尚未连接 Agent Gateway，真实 provider/model prompt 也未获授权、未执行。下一步是全量验证与 independent review，不自行 `mark-done`、commit 或 push。
- 修复后 full gate 已通过：46 tests / 0 fail / 282 assertions；Gateway + Studio typecheck、Gateway bundle + Studio Vite build、no-prompt SDK smoke、`git diff --check` 与 checklist validation 均通过；新 product source digest 为 `72675cebc90d57d45e33f1bb4c40199a6929b3609e79c0d098e1f65805237ff7`。现在对该冻结 snapshot 发起 fresh independent cross-review；在双审批准前不 `mark-done`、commit 或 push。
- Round 2 Kimi static review 为 `approved`，但 Sol executable review 发现 admission 晚于 SDK start、trace 仍无整体预算，combined verdict 再次为 `changes_requested`；
- 最终修复把 prompt admission 提到 client factory/start 前，并对 tool input、trace data 与单 turn tool-call count 建立明确预算；oversized input 与 129-call regression 证明 failure evidence 有界且超限 turn 失败；
- 新 full gate 为 47 tests / 0 fail / 291 assertions，typecheck/build/no-prompt SDK smoke/diff-check/checklist validation 通过；final candidate product digest 为 `fdbf25f25d81ff7028a56d3a71d5687ceace624ecdec9189b4341e6e3ce1b23a`，等待 final fresh cross-review。
- Round 3 Kimi static review 为 `approved`，Sol executable review 继续发现 descriptor admission 与 trace key budget 两个 P1，combined verdict 为 `changes_requested`；
- 最终修复使用 `Reflect.ownKeys + descriptor`，拒绝 hidden/symbol/accessor/array/`__proto__` input；trace key bounded 后写入 null-prototype projection，budget 整个 turn 共享；getter reads 与 surface calls 均为 0，1 MiB key trace 保持小于 8 KiB；
- 最新 full gate 为 48 tests / 0 fail / 304 assertions，typecheck/build/no-prompt SDK smoke/diff-check/checklist validation 通过；final candidate digest 为 `1b3b6496f1f27fe7bd89f0db105f60745e027108922507eb3301f7f1ca594dae`。
- Round 4 final cross-review 已双审批准：GPT-5.6 Sol Max executable review 与 Kimi Code K3 Max static review 均为 `approved`，P0/P1/P2 全无；允许进入 EXharness closeout 与 operator `mark-done`，但不包含真实 provider prompt、merge main、tag 或 deploy authority。

## 2026-08-10 — DH-006 本地 Agent—Studio 闭环已规划

- Human 确认下一条 vertical slice 是把已验证的 Agent Runtime 接成 Studio 可观察的本地产品闭环；
- `DH-006` 采用 Gateway-owned Product Session 单一事实面：connected Studio 只提交输入并呈现权威 `Snapshot`、`Episode` 与 `EvaluationRecord`，不维护第二个可写 Host；
- 当前 Gateway 对 `apps/studio/src` 的反向复用将在出现第二个真实调用方后提升为最小内部 world module，不用 transport patch 固化错误 ownership；
- 首个传输选择 bounded HTTP streaming NDJSON 加只读 resync，不提前引入 WebSocket 或通用 event bus；
- 首先使用 scripted/fake Agent 完成 `write → read → edit → run`，真实 provider/model prompt、credential 与费用仍需单独授权；
- 已创建独立 `agent/codex/DH-006` branch/worktree 与 canonical plan，随后获得 Human implementation authority 并完成 ASSIGN/ACCEPT 激活；当前 authority 仍不包含真实 provider prompt、commit、push、merge、tag 或 deploy。

## 2026-08-10 — DH-006 本地 Agent—Studio 闭环已实现，等待独立审查

- 在 Studio 与 Gateway 成为两个真实调用方后，把既有 Kernel、Repository、MuJoCo Runtime、Evaluation、Host 与 world tools 提取为内部 workspace package `@demiurges/world`；Gateway 不再反向 import `apps/studio/src`，Presentation 与 OMP 均未进入共享 package；
- 新增 Gateway-owned `ProductSession`：每个 session 私有持有唯一 `RuntimeMvpHost`，scripted Agent 按 `world_write → world_read → world_edit → world_run` 执行；`world_run` 返回 Episode、TerminalSnapshot 与 Evaluation，但 current ref 保持 authored edit version 2；
- 新增 product-owned `ProductSessionEvent`/`ProductSessionProjection` contract；OMP observer 在 Gateway 内转换为产品证据，OMP message/event shape 不穿透 transport；
- 新增本地 HTTP API：`POST /api/sessions`、只读 `GET /api/sessions/:id` resync，以及 bounded ordered `POST /api/sessions/:id/turns` NDJSON stream；未知 session、非法 route、oversized/非法输入 fail closed，未暴露 Agent-facing adopt route；
- Studio 删除 connected path 的本地 Host，改用 `ProductSessionClient`；自然语言输入、四工具 trace、3D Observation、EpisodePlayer 与 PASS/FAIL 全部由 Gateway authoritative evidence 驱动；
- TDD 增加 import boundary、single authority、Product Session、真实 Bun HTTP、NDJSON arbitrary-chunk parser 与 connected Studio source boundary tests；当前 full gate 为 56 tests / 0 fail / 340 assertions，`bun run typecheck`、`bun run build`、`git diff --check` 与 checklist validation 均通过；
- 真实 Chromium 验收通过：首个 session 从空世界提交任务后显示四工具 trace，Episode timeline 从约 frame 8/75 继续推进到 frame 75/75，而非终态闪现；Evaluation 为 PASS，current ref 始终是 `snapshot:edit-1` version 2，terminal Snapshot identity 与 current ref 不同；新建第二个 session 后全部呈现状态清空，再次执行同样通过，浏览器无 warning/error；
- 未发送真实 OMP/provider prompt，未读取 credential、未产生模型费用。现进入 Phase 4 independent cross-review；批准前不 `mark-done`、commit 或 push。
- Round 1 Kimi Code K3 Max static review 与 GPT-5.6 Sol Max executable review 均为 `changes_requested`。两者共同确认并发 HTTP admission TOCTOU 会让竞争失败请求返回空 `200 NDJSON`；Sol 另以真实 probes 复现空流误判成功、断流不 resync、DTO/lifecycle admission 过浅、chunked UTF-8 byte/content-type bound 绕过，以及 synthetic internal/credential-like error 泄露；
- Round 1 product digest 在 executable review 前后均为 `20ed24ff354f9ac178d8aef2560f959f44ef12bc984dcfc64f20503af28c755a`，56/0/340 与既有 gates 仍绿，但这些 green tests 未覆盖 transport adversarial boundary。Combined verdict 阻断 closeout，下一步从原子 reservation、严格 product admission、failure resync、真实 byte/media-type limit 与 public error code 五个根部修复，不 commit/push。
- Round 1 remediation 已从 transport contract 根部完成：`ProductSession.tryRunTurn` 在构造 200 stream 前同步原子取得 turn authority；HTTP request 逐 chunk 统计 UTF-8 bytes、精确匹配 `application/json`；`@demiurges/world` 新增 product codec，深验 event lifecycle、session/turn identity、trace sequence、tool/evidence association 与 Snapshot/Ref/Episode/Evaluation DTO；
- Studio 对空流、缺 terminal、断流、parse、fetch/abort error 都执行只读 resync，并通过 frozen `ProductSessionTurnError.projection` 覆盖 partial cache；Gateway failure trace/event 只暴露 `world_tool_failed`/`agent_turn_failed`，不转发 OMP、Host、path、credential-like internal message；import boundary regression 扩展为扫描全部非测试 source；
- 新 adversarial tests 直接覆盖并发慢 body、chunked 18KB UTF-8 body、`application/jsonp`、synthetic secret/internal error、空 200、partial stream disconnect、cross-turn identity、负 trace sequence、tool/evidence mismatch、2.5MB malformed projection 与伪装 response media type；full gate 为 62 tests / 0 fail / 375 assertions，typecheck/build/diff/check/checklist 全绿；
- 真实 Chromium Round 1 fix acceptance：session 1 首 turn 在约 120ms 显示 frame 7/75，最终 frame 75/75、PASS、current ref `snapshot:edit-1` v2；同 session 第二 turn 只显示 `agent_turn_failed` 与 failed `world_write`，经 resync 保留原权威 ref/Episode/Evaluation，DOM 与 console 无 internal 泄露；新建 session 2 后再次得到四工具、75-frame、PASS，console 无 warning/error。新 digest 为 `af5167ef946d4190127e5bf70d2ad290dbb50377bbc549f0197bbf42b87a02db`，等待 fresh focused cross-review；批准前不 close/commit/push。
- Round 2 combined verdict 为 `changes_requested`：Kimi K3 Max 静态 review 为 approved，但明确发现 runId producer 与 256 字符 codec identity budget 不一致；Sol Max 以 executable probes 证明合法长 identity 已被错误拒绝，并复现断流后一次 resync 可永久卡在 `running:true`、stale_ref ref/snapshot 漂移、sparse/accessor codec 绕过和 failed trace input 泄露；
- 由于可执行 P1 优先于静态 approved，本轮不关单、不提交。修复方向是 bounded settled resync、descriptor-safe plain-data projection、producer-aligned identity budget 与 failed trace input redaction；完成 RED regressions、full gates 和 Chromium 复验后再进行 Round 3 fresh cross-review。
- Round 2 remediation 从 contract 根部完成：Studio 在失败后 bounded follow-up resync 到 `running:false`，预算耗尽则清空 partial authority；codec 在任何语义读取前以 own descriptors 复制全新 plain-data graph，拒绝 sparse/accessor/non-enumerable/symbol/超预算输入，getter regression 保持 0 reads；
- 删除错误的 256 字符派生 identity 上界，合法 300 字符 runId 已通过真实 MuJoCo run、产生长 Episode/Evaluation identity 并被 projection codec 接纳；整体 2M char、100k node、64 depth 与 collection budget 继续 fail closed；
- `world_edit` 对 updated/stale_ref 都绑定 ref/snapshot 且 Agent 只允许 advance；failed product trace input 固定为 `[redacted]`；单 turn 最多接受 start + 128 tool events + terminal；
- 最新 full gate 为 68 tests / 0 fail / 395 assertions，typecheck/build/diff-check/checklist validation 通过。真实 Chromium 为 frame 7/75 → 75/75、PASS、ref v2；失败 turn 只显示 public code 并保留 resync evidence，DOM/console 无 internal marker；fresh session 再次成功。新 digest `b476912e93c8417e00e79c930597c6aa2a8711c2e3aa4e2a847f3f530cb5bff8` 进入 Round 3 fresh cross-review，批准前不 close/commit/push。
- Round 3 combined verdict 为 `changes_requested`：Kimi K3 Max static approved；Sol Max executable review 证明 attempt count 不约束悬挂 resync GET，并用当前 OMP producer 复现 failed tool 经模型纠正后合法 completed/PASS 被 Studio 误拒；
- 修复方向不是隐藏 failed tool，而是让 terminal event 成为 turn outcome authority，并用单一 wall-clock deadline 覆盖每个 resync GET。透明 Proxy traps 记录为 JSON wire 不可达的 P2，不引入 Node-only 复杂度。
- Round 3 remediation 已完成：`#readSettledSession` 的单一 wall-clock deadline 覆盖首个与后续 GET，每次真实 fetch 带 AbortSignal，Promise deadline 同时覆盖忽略 signal 的 port；30ms 悬挂 GET regression 在 100ms 外部 guard 前稳定拒绝；
- Studio 不再从历史 tool statuses 推导 turn outcome；failed tool 保持可见和脱敏，当前 OMP client 可纠正后继续四工具并以 `turn.completed`、Evaluation PASS 收口。130-event 正边界与 131-event 拒绝均有测试；
- 最新 gate 为 71 tests / 0 fail / 403 assertions，typecheck/build/diff/check/checklist 通过。Chromium 为 frame 9/75 → 75/75、PASS/ref-v2；失败 turn 显示 public code并保留 resync evidence，DOM 无 internal marker、console 为空。Final digest `f1d58ab9a72c88edb53a5ca56a1eedb3a94727198da3360628349c0ece7f4a64` 进入 Round 4 final review，批准前不 close/commit/push。
- Round 4 final cross-review 已双审批准：GPT-5.6 Sol Max executable review 与 Kimi Code K3 Max static review 均为 `approved`，无 P0/P1；Sol 独立复现悬挂 resync 的 wall-clock 拒绝、当前 OMP failure→correction→completed/PASS、130/131 event 边界与全部快速回归；
- Kimi 记录两项非阻断 P2：成功路径的最终 projection GET/turn POST timeout 纵深，以及 exact 512-char runId 正例尚未单独落测。Final product digest 保持 `f1d58ab9a72c88edb53a5ca56a1eedb3a94727198da3360628349c0ece7f4a64`；DH-006 已满足 reviewer gate，可生成 closeout packet，但 commit/push/merge/tag/deploy 与真实 provider prompt 仍未授权。

## 2026-08-10 — DH-006 Operator close 完成

- Human 明确授权 `mark-done`、commit、push，并授权把已批准分支合并到 `main`；
- Operator `mark-done` 事件为 `evt-20260810T153512Z-08901f39`；DH-006 已为 `done/closed`，lease 于 `2026-08-10T15:35:12Z` 释放；
- 发布候选仍绑定 product digest `f1d58ab9a72c88edb53a5ca56a1eedb3a94727198da3360628349c0ece7f4a64`、71/0/403、typecheck/build/diff/check/checklist、Chromium acceptance 与 Round 4 双审批准；
- Git 发布边界为先 push `agent/codex/DH-006` 并回查 remote SHA，再以 fast-forward 方式推进 `main` 并再次回查；不创建 tag，不代表 deployment，也不授权真实 provider prompt。

## 2026-08-10 — DH-007 离线实现与最终交叉审查通过

- production Gateway 已切换到显式 `DEMIURGES_OMP_MODEL=provider/model` 的 restricted OMP composition；scripted Agent 仅保留为显式 test/browser fixture；
- provider/model/credential session affinity、ambient/intrinsic fallback、ancillary inference、统一 deadline/cancellation 与 turn-owned tool capability 均经过五轮 adversarial review；
- Round 5 Sol Max 与 Terra Max 在 frozen product digest `4b157dbb4c04946ce0a238aa9fbd71df1380ea37c07ac7d4ac5ff34a2023935b` 上独立批准，P0/P1/P2 均无；full gate 为 87 tests / 0 fail / 459 assertions；
- 当前只证明 offline product composition 已准备好。下一 gate 是 Human 对唯一 provider/model、credential source、调用/时间/费用边界明确授权的一次真实 canary；未授权前不调用、不 closeout、不 commit/push。

## 2026-08-10 — DH-007 首次真实模型闭环成立

- Human 单独授权后，production Gateway 以 `kimi-code/k3` 和 OMP `17.2.12` 执行唯一一次 bounded canary；credential 仅经 OMP AuthStorage 使用，未读取或写入证据；
- 自然语言任务在 27,833 ms 内自主完成 `world_write → world_edit → world_run`，产生 76-sample Episode 与确定性 Evaluation PASS；current ref 保持 authored `snapshot:edit-1 / v2`，terminal Snapshot 未被 Agent adopt；
- 该结果首次证明 Demiurges 的真实模型路径不是 scripted fixture：模型只通过四工具改变/推演世界，产品仍以 Snapshot/Episode/Evaluation 为 authority；
- Gateway 已停止，没有第二个 turn。DH-007 的产品验收已满足，但 closeout、mark-done、commit、push、merge、tag 与 deploy 仍是独立 authority gate。

## 2026-08-10 — DH-007 Operator close 完成

- Human 在看到 Round 5 双审、完整本地 gates 与真实 canary receipt 后明确授权 closeout、mark-done、commit 和 push；
- closeout `evt-20260811T014025Z-f9f64fb3`、Human final acceptance `evt-20260811T014025Z-7d048edc`、CLOSE `evt-20260811T014025Z-ee79bfc5` 已顺序落盘，未使用 force override；
- `DH-007` 已为 `done/closed`，lease 已释放，checklist validation 为 0 warning；下一动作仅为发布 `agent/codex/DH-007` branch，不隐含 merge `main`、PR、tag 或 deploy。

## 2026-08-10 — DH-007 集成完成，DH-008 Imported Rigid Entity 已规划

- 修正 `architecture.md` 与 `runbook.md` 中“仍只有 scripted Agent / live canary 未执行”的过时事实，product digest 保持 `4b157dbb4c04946ce0a238aa9fbd71df1380ea37c07ac7d4ac5ff34a2023935b`；
- docs correction commit `ac293318c8a6b2fe7433146df7417cc3c83e2726` 已 push，随后 `main` 从 `a570064a7292821166fd65f074577a22b0390c14` fast-forward 到同一 SHA；GitHub `main` 与 `agent/codex/DH-007` refs 已回查一致；
- 从新 `main` 创建 `agent/codex/DH-008` 与 `/Users/Admin/projects/WorkTrees/Demiurges-DH-008`；canonical plan 将下一切片限定为一个 repo-owned imported GLB rigid fixture、独立 box collision proxy，以及跨 EntityRef/Frame/Units/Three.js/MuJoCo/Episode/Evaluation 的可检查 alignment；
- `DH-008` ASSIGN `evt-20260811T015218Z-debb1144`、ACCEPT `evt-20260811T015218Z-acc5ffed` 已落盘，checklist validation 0 warning。当前只授权规划，不开始产品实现、资产下载、真实模型调用或 Git 发布。

## 2026-08-10 — DH-008 Imported Rigid Entity 已实现，等待独立审查

- Kernel 已分离 imported visual mesh 与 box collision proxy；repo-owned asymmetric GLB 以固定 digest/provenance/frame/units/alignment 登记，MuJoCo 只消费 collision evidence，Three.js 以稳定 `EntityRef` 完成加载、选择、Episode playback 与 session reset；
- scripted Product Session 仍经 `read/write/edit/run` 四工具完成 imported wedge 推演，76-sample Episode 与 collision-derived Evaluation PASS；URL/path/file input 与 identity/alignment drift fail closed；
- 当前门禁为 96 tests / 0 fail / 516 assertions，typecheck/build/diff-check 与真实 Chromium acceptance 通过。未调用真实 provider，未 commit/push；进入 frozen-digest independent review gate。

## 2026-08-10 — DH-008 Round 1 reviewer blocker 已根部修复

- Sol/Terra executable cross-review 共同复现 Product codec 未绑定 authored Snapshot、Episode samples、terminal EntityRef/representation 的 P1；Kimi reviewer 通道因 CC Switch 无 token/tool event 连接失败而停止，未伪造 verdict；
- remediation 建立 exact EntityRef set、immutable representation/physics/frame/units、terminal-last-sample、base-ref 与 streamed-turn authored-world 证据闭环，并删除 Studio 缺帧回退；
- 修复后为 98 tests / 0 fail / 522 assertions，typecheck/build/diff-check/GLB digest/Chromium 通过；新 digest `f20e0fc96472615433778fdc0475cb59a0f9a7b17df1ccbf19af9a7edd268910`，进入 fresh Round 2 review。

## 2026-08-10 — DH-008 Round 2 terminal identity blocker 已修复

- Sol 批准原证据链 remediation；Terra 发现 terminal Snapshot ID 可与 base ID 相同的 lineage P1，combined verdict 继续阻断；
- codec 已拒绝 terminal/base identity 冲突，Studio episode source label 同步 fail-accurate；98 tests / 0 fail / 523 assertions 与 typecheck/build/diff-check 通过，新 digest `7879c0cf637ea64092daebc4c51fe4cb32422cfc160b52b9e11268dd39aec5f7` 等待 final focused review。

## 2026-08-10 — DH-008 final cross-review approved

- Round 3 Sol/Terra 在 digest `7879c0cf637ea64092daebc4c51fe4cb32422cfc160b52b9e11268dd39aec5f7` 上双审批准，P0/P1/P2 均无；
- final Chromium 复验 imported asset、逐帧 Episode、PASS 与 reset 清理；DH-008 已进入 Human closeout gate，未 commit/push/真实 prompt。

## 2026-08-10 — DH-008 Operator close 完成

- Human 授权后完成 closeout packet、fresh closeout approval 与正常 `mark-done`，未使用 force override；
- CLOSE event `evt-20260811T050106Z-c2088c45`，DH-008 为 `done/closed` 且 lease 已释放；
- 下一动作仅为提交并 push `agent/codex/DH-008`，不隐含 merge `main`、PR、tag、deploy 或真实 provider prompt。

## 2026-08-10 — DH-008 集成完成，DH-009 3DGS / Spark 切片已规划

- `main` 已从 `ac293318c8a6b2fe7433146df7417cc3c83e2726` fast-forward 到 `fdbbf680122c06810f58da37d9973d4f0aa2c984` 并推送，远端 `main` SHA 已回查一致；
- 从新 `main` 创建 `agent/codex/DH-009` 与 `/Users/Admin/projects/WorkTrees/Demiurges-DH-009`；
- canonical plan 把 3DGS 明确为同一 imported rigid Entity 的独立 `observation` representation：GLB visual、box collision proxy、MuJoCo state 与 Episode authority 保持不变，Spark 只在 Presentation 层消费经过 digest/frame/units/alignment 校验的 repo-owned bytes；
- 计划选择一个确定性生成的小型 PLY diagnostic fixture、单一 SparkRenderer、`mesh / 3dgs / overlay` Studio-local mode，以及来自真实 loaded bounds 与 Episode pose 的结构化 AlignmentEvidence；不建立通用 Artifact SDK、远程资产通道或第五个 world tool；
- 只读 dependency gate 确认候选 `@sparkjsdev/spark@2.1.0` 为 MIT、要求 `three >=0.180.0`，当前 `three 0.185.1` 满足。精确 dependency 只在实现阶段按 plan 锁定；
- 当前 Human authority 要求计划完成后再进入实现，但不包含 `DH-009` commit/push、真实 provider prompt、PR、merge、tag 或 deploy。

## 2026-08-10 — DH-009 3DGS Observation / Spark Presentation 已实现

- 同一 imported rigid Entity 现在同时持有 GLB visual、repo-owned 3DGS observation 与 box collision proxy；observation 不能绑定 primitive，Product codec、Runtime admission 与跨 Episode evidence closure 均 fail closed；
- Spark 在现有 Three.js scene 内呈现经过 digest 验证的 2,048-splat PLY，Studio 提供 GLB/3DGS/overlay 与 measured AlignmentEvidence；MuJoCo trajectory/Evaluation 不消费 3DGS；四工具 surface 未扩张；
- 最终 operator gate 为 102 tests / 0 fail / 2,615 assertions，typecheck/build/diff-check、deterministic asset、harness validation 与真实 Chromium playback/reset 通过；Spark disposal race 已从根部关闭；
- 下一步是冻结 product digest 并进行 fresh independent cross-review。批准前不 closeout/mark-done，Human 未授权前不 commit/push。

## 2026-08-10 — DH-009 product candidate frozen for Round 1 review

- 最终 product digest 为 `e9d9b1eb1a51f04342cc3aff4ab7211714e705021a910117ccd6d75bb54a5053`；digest 排除 harness/review 文档，纳入所有 tracked diff 与 untracked product bytes；
- final Chromium 重新验证 resize、GLB/3DGS/overlay、frame 12/75、alignment PASS、Evaluation PASS、reset 清空与第二 Session 重载；无 page error、非 favicon console/HTTP error，server log 只剩 Spark 的 `THREE.Clock` upstream warning；
- 现进入两个 fresh reviewer 互相隔离的 Round 1 gate，未 closeout/mark-done/commit/push。

## 2026-08-10 — DH-009 Round 1 cross-review blocked

- Sol/Terra 对 digest `e9d9b1eb1a51f04342cc3aff4ab7211714e705021a910117ccd6d75bb54a5053` 均给出 `changes_requested`；
- blockers 为 quaternion/bounds 可产生虚假 alignment PASS、observation 可绑定错误 EntityRef、Splat initialized rejection 资源泄漏；另有 stale error dataset P2；
- Round 1 历史已保留，进入根部 remediation 与新 digest gate，不 closeout/commit/push。

## 2026-08-10 — DH-009 Round 1 remediation frozen for Round 2

- codec/Runtime 已把 observation 锁到 `entity:cube`，并拒绝非单位 Entity pose；alignment 独立拒绝非法 pose、reversed/sparse/non-finite bounds 与 observation transform；
- Splat reject/stale 路径现在先释放实例，observation dataset 在 loading/error/reset 成组清理；
- remediation gate 为 102/0/2,626，typecheck/build/diff/artifact/harness/Chromium 通过；新 digest `03550f8693a990a20f5a4555c11635831dbf6c1653400590596a2fa3f328939b` 进入 fresh Round 2，仍未 closeout/commit/push。

## 2026-08-10 — DH-009 Round 2 combined alias blocked

- Terra approved，Sol `changes_requested`：同时交换 Ref 与 representations 可让 observation 位于名义 `entity:cube`、实际 static floor record；
- Product decoder 正与唯一 Runtime role contract 对齐，验证精确 floor/cube、static/dynamic、mass/velocity/friction 与 positive geometry，并加入 JSON round-trip 组合反例；
- Round 1/2 verdict 永久保留，未 closeout/commit/push。

## 2026-08-10 — DH-009 fixed-role final candidate

- Product decoder 已与 falling-cube Runtime role contract 对齐，组合 Ref/representation/state/event alias regression fail closed；
- final gate 102/0/2,627、typecheck/build/diff/harness/Chromium 通过；digest `79b9050ee69ea8c6869fb51521aa9b128da40d070b6ad27b0e27249fe2aebec5` 进入 Round 3 final cross-review；
- 仍未 closeout/mark-done/commit/push。

## 2026-08-10 — DH-009 Round 3 final cross-review approved

- Sol/Terra 在 final digest `79b9050ee69ea8c6869fb51521aa9b128da40d070b6ad27b0e27249fe2aebec5` 上双审批准，P0/P1/P2 无；
- fixed-role identity、Round 1 alignment/lifecycle、四工具、artifact、Runtime/Episode/Evaluation authority 全部闭合；
- item 进入 Human closeout gate，未 closeout/mark-done/commit/push。

## 2026-08-10 — DH-009 closeout authorized

- Human 已授权 closeout、mark-done、commit 与 push feature branch；不授权 merge `main`、PR、tag、deploy 或真实 prompt；
- closeout 继续绑定 final digest `79b9050ee69ea8c6869fb51521aa9b128da40d070b6ad27b0e27249fe2aebec5` 与 Round 3 双审证据。
```

## Current Review Content

```md
# DH-001 Review Verdict

当前状态：`changes_requested`。

- Kimi Code K3 Max：`approved`；
- GPT-5.6 Sol Max：`changes_requested`；
- Operator 已独立复现 P1，combined decision 为 `changes_requested`；
- product aggregate SHA-256 审查前后不变。

Canonical verdict：`docs/project-harness/tasks/DH-001/cross-review-verdict.md`。

本文件记录正式 review-result；实现者不得在此自我批准或 mark done。
```

## Closeout Questions

1. 当前实现是否已经覆盖 acceptance
2. verification 是否足以支持从 `doing` 进入 `done`
3. 还有没有阻止 closeout 的高优先级问题
4. 如果不能 done，最关键的剩余工作是什么
