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

Status: completed

- independent reviewer 验证工具面、JSON admission、authority separation 与 scope；
- approved 后由 Operator close；
- 运行已授权的 commit + push gate并回查 remote branch SHA；不 merge `main`。

Final fresh cross-review 已在 product digest `9575362e701a6c980898ce448c6847522941c9cb102eaae28cedd0af7c4896db` 上完成：Kimi Code K3 Max 与 GPT-5.6 Sol Max 均为 `approved`，P0/P1/P2 none；两者均独立确认 prototype interception 已被阻止、stale edit 仍保持 atomic、run 不推进 ref，且 40/0/250 全绿。Operator 已按 `closeout_requested → approved → mark-done` 顺序关闭 DH-004，lease 已释放；发布边界仍只包含已授权的 commit + push，不包含 merge `main`。

## 错误记录

| 错误 | 尝试 | 处理 |
| --- | --- | --- |
| 新 worktree 没有 `node_modules`，首次 `bun test` 无法解析 `@mujoco/mujoco`、typecheck 找不到 `tsc` | DH-004 baseline | 依据现有 `bun.lock` 执行 `bun install --frozen-lockfile`；manifest/lockfile 未改变，随后基线恢复为 35/0/213 且 typecheck 通过。 |
| Round 1 reviewer 发现 stale tool edit 在 CAS 前插入 orphan Snapshot | 初始 digest `b6bbe45d...` | Operator 独立 probe 复现；把 admission 与 mutation 下沉合并为 Repository 同步 operation，补 orphan absence regression，修复后 39/0/246。 |
| Round 2 Sol reviewer 通过 Host prototype interception 捕获 existing control Host | digest `1d95045e...` | Operator 独立 probe 复现；冻结 authority class prototype，补 method replacement regression，修复后 40/0/250。 |
