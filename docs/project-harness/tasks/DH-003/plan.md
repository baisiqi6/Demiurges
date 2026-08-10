# DH-003 计划：World Ref 与安全 Adopt

## 目标

把当前仅保存 `Snapshot ID` 的 Repository ref 提升为带单调 version 的 authority record，并把 authored Snapshot 的 `advance` 与 Runtime terminal 的 `adopt` 分离。任何成功 Adopt 都必须绑定同一个 Episode、通过的不可变 EvaluationRecord、固定 Host AdoptPolicy，以及调用开始时观察到的 `expectedCurrent + expectedRefVersion`。

## 已授权范围

- 为 Repository ref 增加可读取的 `snapshotId + version`；
- 让 authored Snapshot 先被记录，再由显式 `advance` 推进 current；
- 为 `advance` 与 `adopt` 共用一个最小 CAS 边界，但保留两种操作的不同准入条件；
- `adopt` 校验 Episode、TerminalSnapshot、EvaluationRecord 与固定 AdoptPolicy 的绑定关系；
- UI 显示 ref version，并且只有当前 Episode 的 Evaluation 通过后才允许 Adopt；
- 添加 authority、policy、stale ref 与 UI 组合所需的回归测试；
- 更新必要的 repo-local Harness 证据。

用户已持续授权：本 item 获得 reviewer approval 并由 Operator 关闭后，commit 同步 push 当前 branch；不自动 merge `main`。

## Invariants

- `run`、Episode playback、Evaluation 与 terminal `record` 都不推进 authoritative ref；
- Ref version 每次成功推进只增加 1，失败、拒绝或 stale CAS 不改变 ref；
- `advance` 只接纳当前 authored lineage 的直接 child；`adopt` 只接纳该 Episode 的已记录 Runtime terminal；
- `adopt` 必须引用同一 Episode 的通过 EvaluationRecord，并满足 Host 注册的固定 AdoptPolicy；
- `expectedCurrent` 与 `expectedRefVersion` 任一不匹配都返回 `stale_ref`，不得用“当前 Snapshot 又碰巧相同”绕过 version；
- 模型可见的世界工具面仍未引入；`advance/adopt` 保持 Host/Repository 内部事务。

## Non-goals

- LLM/VLM、Agent Shell 或 `world_read/write/edit/run` tool schema；
- imported mesh、Spark/3DGS、机器人或第二 Runtime provider；
- 通用权限平台、Policy registry、数据库、分布式锁或多人协作；
- 重写 Episode identity、MuJoCo dynamics、播放器时间映射或视觉设计；
- 合并到 `main`、deployment 或 package 发布。

## 验收标准

1. root write 初始化 `{ snapshotId, version: 1 }`；成功 advance/adopt 各自只递增一次 version。
2. authored `edit` 只产生 child，显式 `advance` 才推进 current；stale advance 不修改 ref。
3. 未 Evaluation、失败 Evaluation、错配 Episode、错配 evaluator/contract/policy 或未记录 terminal 均不能 Adopt。
4. 合法 Episode + 通过 Evaluation + 固定 Policy + fresh CAS 成功 Adopt；重复调用返回 `stale_ref`，不重复推进。
5. stale CAS 即使未来再次指向相同 Snapshot，也不能绕过 version。
6. UI 显示 current ref version；Evaluate 通过前 Adopt disabled，成功后 Adopt 并显示 terminal authority。
7. `bun test`、`bun run typecheck`、`bun run build`、checklist validation 与真实浏览器 acceptance 通过。

## 实现阶段

### Phase 1 — Authority 基线与 RED

Status: completed

- 登记并激活 `DH-003`；
- 保存当前 tests/typecheck 基线；
- 添加 Ref version、explicit advance、Evaluation/Policy-gated adopt 与 stale CAS 反例，确认旧实现失败。

基线为 26 tests / 166 assertions，typecheck 通过。新增 authority test 在旧实现上以 `Export named 'ADOPT_RUNTIME_MVP_POLICY' not found` 进入 RED（0 pass / 1 fail / 1 error），证明 Ref/Policy contract 与新 Repository operations 尚不存在。

### Phase 2 — 最小 Kernel/Repository 实现

Status: completed

- 增加最小 Ref、Policy 与 operation result records；
- Repository 内部保存 versioned ref，并以一个私有 CAS helper 实现 advance/adopt；
- 不增加 Provider registry、权限框架或通用事务层。

实现结果：Ref 以冻结 `{ name, snapshotId, version }` 保存；root write 初始化 version 1；`advance` 与 `adopt` 共享私有 CAS helper，但分别执行 authored lineage 与 Episode/Evaluation/Policy 准入。固定 policy 位于 Host composition 文件并显式注入 Repository，Kernel 不依赖 evaluator。Episode 与 Evaluation 必须先作为不可变 evidence 登记，单独 terminal record 不能进入 adopt。

### Phase 3 — Studio 组合与验收

Status: completed

- Studio 改为 explicit edit → advance，Evaluation pass → adopt；
- 显示 ref version 并验证 Episode Player 不影响 authority；
- 完成 tests/typecheck/build/browser acceptance。

GREEN：32 tests / 0 fail / 200 assertions；typecheck/build 通过。真实浏览器从 `snapshot:base v1` 经 explicit edit/advance 到 `snapshot:edit-1 v2`；Run 与 Playback 期间 ref 保持 v2，Evaluate 前 Adopt disabled；Evaluation `PASS` 后 Adopt 才开放，成功后 terminal 为 v3、显示源为 `adopted-terminal`，按钮再次 disabled。stale advance/adopt、相同 Snapshot 但旧 version、失败/错配/未登记 evidence 均由 executable tests 证明不改变 ref。

### Phase 4 — 证据、独立审查与发布

Status: completed

- 更新 progress、checklist verification 与 handoff；
- 生成只读 review packet，由 independent reviewer 给出结构化 verdict；
- approved 后由 Operator `mark-done`；
- 运行发布 gate，commit 当前 branch 并同步 push，回查 remote SHA。

Round 1 独立审查在 digest `2cd5edf...` 上给出 `changes_requested`：可伪造 frozen Episode/Evaluation，且同一 `contractId` 下可替换 contract 参数，两个反例都成功推进 ref。修复没有继续叠加字段校验，而是把证据产生与 admission 收束到新的 `RuntimeMvpHost` effect boundary：Host 私有持有 capability，只调用固定 MuJoCo Runtime、固定 Program/Profile、固定 Landing evaluator 与 canonical SuccessContract；Studio 不再暴露任意 evidence registration。外部 capability 在 terminal Snapshot 入库前即失败。

修复后 GREEN 为 34 tests / 0 fail / 210 assertions，typecheck/build 通过，`git diff --check` 通过；真实浏览器再次证明 `v1 → explicit advance v2 → run/evaluate 仍为 v2 → PASS adopt v3`。修复后 product digest 为 `d9ca6da0...`。

Round 2 Kimi/K3 在该 digest 上 approved，但 Sol/max 随后复现 same-realm interception：导出的 Repository class prototype 可在 Host 构造前被替换，从动态调用中截获 symbol 与 existing Repository。实现再次回到底层收束：`WorldRepositoryState` 不再导出，factory 只把冻结的 repository facade 与 evidence-writer closures 交给创建者；`RuntimeMvpHost` 私有持有整个 lexical authority，证据 admission 不再携带或传递可截获的 token。另一个 factory 调用只能写入它自己拥有的 Repository，不能影响 existing Host。

lexical authority 修复后 GREEN 为 35 tests / 0 fail / 213 assertions，typecheck/build/diff-check 通过；浏览器第三次复验仍为 v1→v2→v3。当前 product digest 为 `495a6c95299e19bd3e714e381f2cb2b472a12b0aec45e7a8b647077fd96feec2`，等待 fresh final cross-review。

Final fresh cross-review 已完成：Kimi/K3 与 GPT-5.6 Sol Max route 都在 digest `495a6c...` 上给出 `approved`，P0/P1/P2 均为 none；两者独立得到 35/0/213 并确认 digest/status 前后不变。DH-003 可以由 Operator 关闭并进入已授权的 commit + push gate。

## 错误记录

| 错误 | 尝试 | 处理 |
| --- | --- | --- |
| 临时 harness runtime 固定指向 `/Users/Admin/projects/Demiurges` | 在 DH-003 worktree 直接调用前审计脚本 | 未执行错误 mutation；复制 task-local 临时 runtime，并只把 project root 改为 DH-003 worktree。该副本不进入产品仓库。 |
| 浏览器 locator 不提供 `isDisabled()` | 首次读取 Adopt 状态 | 改为读取原生 `disabled` attribute；不修改产品以迎合测试工具。 |
| Round 1 reviewer 复现 forged evidence 与 same-ID contract bypass | digest `2cd5edf...` 的 independent `bun -e` probes | 从 evidence effect boundary 修正：新增私有 Host capability 与固定 Runtime/Evaluator 组合，不把 frozen plain data 当作 provenance。新增 RED 后回归为 34/0/210。 |
| Round 2 reviewer 通过 prototype interception 捕获 symbol capability | digest `d9ca6da...` 的 existing Host `bun -e` probe | 删除导出的 Repository implementation 与动态 token dispatch；改用 factory 创建的 lexical authority closure。新增 RED 后回归为 35/0/213。 |
