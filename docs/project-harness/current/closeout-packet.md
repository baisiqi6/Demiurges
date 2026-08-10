# Closeout Packet

## Subject

- Checklist item: `DH-004`
- Reviewer: `final-cross-review-kimi-k3-sol-max`
- Updated at: `2026-08-10`
- Canonical plan path: `docs/project-harness/tasks/DH-004/plan.md`

## Item Snapshot

- Title: 实现最小 World Tool Surface
- Status: doing
- Workflow status: closeout_requested
- Priority: p0
- Owner: codex
- Session: demiurges-dh004-world-tools-20260809
- Dependencies: DH-003

## Acceptance

提供 read、write、edit、run 四个 JSON-data model-facing tools；run 产生 Episode 与 deterministic Evaluation 但不推进 ref；adopt 保持 Harness control authority；scripted operator、input admission、tests/typecheck/build/checklist validation 通过。

## Verification

Final gate: 40 tests / 0 fail / 250 assertions; typecheck, build, git diff --check passed; product digest 9575362e701a6c980898ce448c6847522941c9cb102eaae28cedd0af7c4896db; Kimi Code K3 Max and GPT-5.6 Sol Max final verdicts approved with no P0/P1/P2.

## Handoff

Final verdict: docs/project-harness/tasks/DH-004/final-cross-review-verdict.md. Operator close and authorized commit + push only; do not merge main.

## Review Inputs

- Scope: `docs/project-harness/scope.md`
- Architecture: `docs/project-harness/architecture.md`
- Domain model: `docs/project-harness/domain-model.md`
- Progress: `docs/project-harness/progress.md`
- Review output target: `docs/project-harness/current/review.md`

## Canonical Plan Content

```md
# DH-004 计划：最小 World Tool Surface

## 目标

在已经完成的非 Agent 世界闭环上建立第一层模型可调用边界。模型只获得 `read`、`write`、`edit`、`run` 四个 JSON-data 工具；它不能获得 Repository、evidence writer、`advance` 或 `adopt` authority。`run` 返回 Episode 与 deterministic Evaluation，但不推进 authoritative ref；终态 adopt 继续由持有 `RuntimeMvpHost` 的 Harness control boundary 显式执行。

## 已授权范围

- 在 Studio 内增加一个极小的 `WorldToolSurface`，直接组合现有 `RuntimeMvpHost`；
- 定义 `read`、`write`、`edit`、`run` 的 plain-data input/output contract；
- 在工具边界把 JSON round-trip 后的输入复制、校验并冻结，再交给 Host；
- `write` 只创建当前 falling-cube root，`edit` 只修改 cube height 并以 fresh ref CAS 推进 authored child；
- `run` 只执行固定 Program/Profile，并返回 Episode、Evaluation 与运行时观察到的 base ref；
- 以 scripted operator test 证明模型侧只通过四个工具即可完成 write → read → edit → run → inspect evidence；
- 以 Harness control boundary 的现有 `adopt` 完成终态提交，并证明模型工具对象本身不暴露该能力；
- 更新必要的架构、progress、checklist 与 review 证据。

用户已授权：DH-003 fast-forward merge 并 push `main`；创建 `DH-004` branch/worktree；本 item 完成并通过既定 review/Operator close 后，commit 同步 push 当前 branch。未经另行授权不 merge `main`。

## Invariants

- 模型工具面恰好是 `read`、`write`、`edit`、`run`；工具数量不是把 authority boundary 藏进某个宽泛命令的理由；
- `run` 可以产生并登记 Episode/Evaluation evidence，但永远不推进 Repository ref；
- `edit` 只表达 authored world description change，不负责 adopt Runtime terminal；
- `adopt` 不进入 model-facing tool surface，只能由持有同一 Host 的 Harness control boundary 调用；
- 工具输入来自 JSON data，不能依赖调用方提前冻结对象，也不能信任 accessor、prototype 或 sparse data；
- 工具输出是递归冻结、JSON 可序列化的 plain data，不泄露 Three.js、MuJoCo handle、Repository implementation 或 provider SDK type；
- current ref CAS 与 DH-003 evidence provenance 不得弱化。

## Non-goals

- 接入真实 LLM/VLM、聊天 UI、prompt、provider SDK 或通用 tool registry；
- 让模型获得 `adopt`、Repository、evidence registration 或任意 Snapshot 注入能力；
- 支持任意 Entity/geometry/WorldProgram，或提前设计通用 Adapter SDK；
- imported mesh、Spark/3DGS、机器人、第二 Runtime provider 或 persistence；
- 改写 MuJoCo dynamics、Episode Player、视觉设计或现有 Evaluation predicate；
- merge `main`、deployment、release tag 或 package 发布。

## 验收标准

1. 一个 fresh Host 上，scripted operator 只通过四个 tools 完成 root write、current read、height edit 与 falling-cube run。
2. `read` 返回同一 `Snapshot + RefRecord`；`edit` 使用 expected ref，成功时 version 只增加 1，stale 输入不改变 current。
3. `run` 返回绑定同一 base Snapshot 的 Episode、通过的 Evaluation 与 base ref；run/evaluation 前后 current ref 完全不变。
4. model-facing surface 不具有 `adopt`；Harness control 使用同一 Host、同一 Episode/Evaluation 与 fresh base ref 后才可 adopt，version 再增加 1。
5. JSON round-trip 后的合法 input 可用；accessor-backed、错误 prototype、非有限数字、非法 ID 或额外字段 fail closed。
6. 所有 tool result 可 `JSON.stringify`，递归冻结，且 contract/source 中不暴露 Three.js、MuJoCo object handle 或 Repository authority。
7. `bun test`、`bun run typecheck`、`bun run build`、`git diff --check` 与 checklist validation 通过。

## 实现阶段

### Phase 1 — Harness 与 RED

Status: completed

- 登记并激活 `DH-004`；
- 记录 35 tests / 213 assertions、typecheck 通过的基线；
- 先写 scripted operator、authority separation 与 input admission tests，确认 surface 尚不存在。

基线为 35 tests / 213 assertions，typecheck 通过。新增 test 以 `Cannot find module './world-tool-surface'` 进入 RED，证明 model-facing surface 尚不存在。

### Phase 2 — 最小工具面

Status: completed

- 实现四个直接方法与最小 input admission；
- 复用 Host/Kernel 现有记录，不新增 provider abstraction 或通用 dispatcher；
- 保持 model tools 与 control authority 为两个对象引用边界。

实现为一个直接组合 `RuntimeMvpHost` 的 `WorldToolSurface`：prototype 只有四个 tool method；输入以 exact own data properties 复制为受信 primitives/ref，再冻结后调用 Host；`run` 在相同 Host 内登记 Episode 与固定 Evaluation 并返回 evidence。没有 tool registry、dispatcher、provider SDK 或新的 Kernel type。

### Phase 3 — 验证与文档

Status: completed

- 完成 tests/typecheck/build/diff-check；
- 把稳定边界写回 architecture/progress/checklist；
- 准备独立 reviewer packet，Coding agent 不自行审批或 mark-done。

初始 GREEN 为 39 tests / 0 fail / 245 assertions；typecheck、build、`git diff --check` 通过。Round 1 Kimi/K3 review 随后发现 stale edit 在 CAS 拒绝前已经插入 orphan Snapshot，Operator 已以 executable probe 独立复现。

修复没有在 tool surface 叠加 pre-read guard，而是把 `expected ref admission → authored child creation → ref advance` 内聚为 Repository 的单一同步 `editCurrentCubeHeight` operation。stale input 在任何 Snapshot/sequence mutation 前返回；回归测试同时断言 current 不变与 `snapshot:edit-2` 不存在。修复后 GREEN 为 39 tests / 0 fail / 246 assertions；typecheck、build、diff-check 通过，product source digest 为 `1d95045e...`。

Round 2 Kimi/K3 fresh review 在该 digest 上 approved，但 GPT-5.6 Sol Max 复现 same-realm prototype interception：model tool 动态调用可替换的 `RuntimeMvpHost.prototype`，拦截者可从 `this` 捕获 existing Host 并调用 `adopt`。Operator 独立 probe 复现。修复回到 authority class invariant，在模块初始化时冻结 Host prototype；不增加新 facade/registry/tool。回归证明 method replacement 被拒绝且 tool call 不泄露 Host。修复后 GREEN 为 40 tests / 0 fail / 250 assertions，typecheck、build、diff-check 通过，product digest 为 `9575362e701a6c980898ce448c6847522941c9cb102eaae28cedd0af7c4896db`，等待 final fresh cross-review。

### Phase 4 — 审查与发布

Status: in_progress

- independent reviewer 验证工具面、JSON admission、authority separation 与 scope；
- approved 后由 Operator close；
- 运行已授权的 commit + push gate并回查 remote branch SHA；不 merge `main`。

Final fresh cross-review 已在 product digest `9575362e701a6c980898ce448c6847522941c9cb102eaae28cedd0af7c4896db` 上完成：Kimi Code K3 Max 与 GPT-5.6 Sol Max 均为 `approved`，P0/P1/P2 none；两者均独立确认 prototype interception 已被阻止、stale edit 仍保持 atomic、run 不推进 ref，且 40/0/250 全绿。当前只剩 Operator close 与已授权的 commit + push gate。

## 错误记录

| 错误 | 尝试 | 处理 |
| --- | --- | --- |
| 新 worktree 没有 `node_modules`，首次 `bun test` 无法解析 `@mujoco/mujoco`、typecheck 找不到 `tsc` | DH-004 baseline | 依据现有 `bun.lock` 执行 `bun install --frozen-lockfile`；manifest/lockfile 未改变，随后基线恢复为 35/0/213 且 typecheck 通过。 |
| Round 1 reviewer 发现 stale tool edit 在 CAS 前插入 orphan Snapshot | 初始 digest `b6bbe45d...` | Operator 独立 probe 复现；把 admission 与 mutation 下沉合并为 Repository 同步 operation，补 orphan absence regression，修复后 39/0/246。 |
| Round 2 Sol reviewer 通过 Host prototype interception 捕获 existing control Host | digest `1d95045e...` | Operator 独立 probe 复现；冻结 authority class prototype，补 method replacement regression，修复后 40/0/250。 |
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
```

## Current Review Content

```md
# DH-004 Final Fresh Cross-review Verdict

当前状态：`approved`，P0/P1/P2 均无。

- Kimi Code K3 Max：`approved`；
- GPT-5.6 Sol Max：`approved`；
- 两位 reviewer 均在 product digest `9575362e701a6c980898ce448c6847522941c9cb102eaae28cedd0af7c4896db` 上完成验证；
- `bun test`：40 pass / 0 fail / 250 assertions；typecheck、build、`git diff --check` 通过；
- Round 1 stale edit atomicity 与 Round 2 Host prototype interception regressions 均保持通过。

Canonical verdict：`docs/project-harness/tasks/DH-004/final-cross-review-verdict.md`。

更正说明：生成 closeout packet 时 `current/review-packet.md` 仍指向历史 DH-001，导致本嵌入区块错误；Item Snapshot、Verification、Handoff 与正式 review event 均正确指向 DH-004。本区块在 commit 前依据 canonical verdict 更正，不改写 review decision 或事件记录。
```

## Closeout Questions

1. 当前实现是否已经覆盖 acceptance
2. verification 是否足以支持从 `doing` 进入 `done`
3. 还有没有阻止 closeout 的高优先级问题
4. 如果不能 done，最关键的剩余工作是什么
