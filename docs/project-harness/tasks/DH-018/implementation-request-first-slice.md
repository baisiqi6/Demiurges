# DH-018 Worker Request — registered ArtifactRef repair loop

你是本轮 coding Worker。模型路由已由 Operator 核验为 OMP `deepseek/deepseek-v4-flash`、`thinking=max`。

## 必须先做

1. `pwd` 必须是 `/Users/Admin/projects/WorkTrees/Demiurges-DH-017`，branch 必须是 `agent/codex/DH-017`。
2. 读取：
   - `docs/project-harness/tasks/DH-018/plan.md`
   - `docs/project-harness/scope.md`
   - `docs/project-harness/architecture.md`
   - `docs/project-harness/domain-model.md`
   - 相关现有实现与测试。
3. 在任何实现修改前输出 `ACCEPT`，并执行：

```bash
.artifacts/harness/harnessctl accept DH-018 omp-deepseek-v4-flash-max-worker dh018-first-slice-20260825 --branch agent/codex/DH-017
```

4. 不要调用 Coordinate assignment accept；生产 workspace 故意是 split-host readback-only，普通 assignment API 会尝试服务端 harnessctl。Operator 负责 Coordinate 收口。

## 任务

按 canonical plan 实现第一最小闭环：control-side 从 `GeneratedArtifactReader.list()` 消费恰好一个 verified `object-glb`，把它作为 session-bound composite binding 固定在 Host 侧；restricted Agent 仍只使用 `read/write/edit/run`，完成 deterministic `run fail → inspect → edit → run pass`。

你可以根据当前代码把计划进一步缩小；不要为了形式照抄方案。如果动态绑定需要修改 Project v1、静态 registry、provider 或大量通用抽象，停止并报告，而不是扩张。

## 关键边界

- 不修改 `MARBLE_HUNYUAN_REGISTRY`，不修改 `WorldProjectManifestV1`、Project Store、bundle、startup recovery。
- 不调用 provider，不读取 Keychain，不联网，不生成新世界资产。
- 不增加第五个 world tool，不增加通用 resolver/plugin/planner/workflow/retry/audit 框架。
- 不自动 adopt terminal Snapshot。
- source bounds、Y-up→Z-up 与 box proxy 必须明确保持 `authored-unverified` 语义。
- 零个或多个 eligible `object-glb` 时不猜测。
- 保留旧 composite 与 Project v1 regression。
- 当前 worktree 有大量 DH-017 未提交依赖；禁止 reset/checkout/clean/revert，禁止修改无关文件，禁止 commit/push。

## 优先允许范围

- `packages/world/src/artifacts/marble-hunyuan-composite-fixture.ts`
- `packages/world/src/artifacts/marble-hunyuan-composite-fixture.test.ts`
- `packages/world/src/world-tools/world-tool-surface.ts`
- `packages/world/src/world-tools/world-tool-surface.test.ts`
- `packages/world/src/world-tools/world-tool-contract.ts`
- `packages/world/src/world-tools/world-tool-contract.test.ts`
- `packages/world/src/index.ts`
- `apps/agent-gateway/src/product-session.ts`
- `apps/agent-gateway/src/product-session.test.ts`
- `apps/agent-gateway/src/product-session-api.ts`
- `apps/agent-gateway/src/product-session-api.test.ts`
- 必要时上述目录内一个职责单一的新 helper/test。
- `docs/project-harness/tasks/DH-018/worker-result-first-slice.md`

若必须超出，先停止并在 RESULT 说明，不得自行扩大。

## 验证

至少运行：

```bash
bun test packages/world/src/artifacts/marble-hunyuan-composite-fixture.test.ts packages/world/src/world-tools/world-tool-surface.test.ts packages/world/src/world-tools/world-tool-contract.test.ts apps/agent-gateway/src/product-session.test.ts apps/agent-gateway/src/product-session-api.test.ts
bun run typecheck
git diff --check
.artifacts/harness/harnessctl validate
```

测试必须直接断言：

- verified set/member → frozen binding，零/多候选拒绝；
- Agent tool name 集合恰好仍为四个；
- 第一次 Evaluation `passed=false`，第二次 `passed=true`；
- Ref version 单调，失败 evidence 没有被覆盖；
- 旧 composite 行为仍通过。

## RESULT

完成后写 `docs/project-harness/tasks/DH-018/worker-result-first-slice.md`，包含：

- `RESULT: COMPLETE | BLOCKED`
- `ACCEPT` 是否完成及 lifecycle receipt
- 设计如何保持最小、哪些诱人的扩张被拒绝
- 修改文件列表
- tests/typecheck/diff-check/harness validate 的 exact 结果
- 已知限制与 Reviewer 应重点检查的风险

不要 mark-done，不要自审批准，不要部署。
