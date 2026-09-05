# DH-018 Worker Request — Product Session binding and repair loop

你是本轮 coding Worker。Operator 请求本机 ZCode 当前配置的 `GLM-5.3`、reasoning variant `max`；若 runtime 不能证明实际模型，把 actual model 写为 `UNVERIFIED`，不要猜。

## Bootstrap

1. 核对 `pwd` 为 `/Users/Admin/projects/WorkTrees/Demiurges-DH-017`、branch 为 `agent/codex/DH-017`。
2. 读取 `docs/project-harness/tasks/DH-018/plan.md`、`docs/project-harness/tasks/DH-018/review-core-binding-integration.md`、相关实现与测试。
3. 修改前明确输出 `ACCEPT`，并执行：

```bash
.artifacts/harness/harnessctl accept DH-018 zcode-glm53-max-worker dh018-product-session-20260825 --branch agent/codex/DH-017
```

不要调用 Coordinate assignment accept；Operator 负责服务端收口。

## 单一目标

完成 DH-018 剩余的最小闭环：创建新 Product Session 时，从 `worldProjects.generatedArtifacts.list()` 取得 durable verified summaries，用现有 `selectGeneratedObjectBinding` 选择恰好一个 `object-glb/glb-2.0`，把它固定到该 session 的 `WorldToolSurface`；然后用 deterministic scripted test 证明同一世界的 `run fail → read current ref → pose repair → run pass`，并保留两次 trace/evidence。

## 不可扩张边界

- 不调用 provider、不读 Keychain、不联网、不生成新资产。
- 不修改 `MARBLE_HUNYUAN_REGISTRY`、`WorldProjectManifestV1`、Project Store/bundle/startup recovery。
- 不增加第五个 tool；Agent 仍只有 `read/write/edit/run`。
- 不做通用 resolver、plugin、planner、workflow、retry、audit 或 persistence 框架。
- 零个或多个 eligible 候选时不猜；session 创建应稳定拒绝或保持无绑定，选择最小且测试清楚的产品语义。
- 旧无 data-root/static composite 与 Project v1 行为必须保持。
- 当前 worktree 有大量用户/DH-017 变更：禁止 reset/checkout/clean/revert，禁止 commit/push/deploy。

## 优先允许修改

- `apps/agent-gateway/src/product-session.ts`
- `apps/agent-gateway/src/product-session.test.ts`
- `apps/agent-gateway/src/product-session-api.ts`
- `apps/agent-gateway/src/product-session-api.test.ts`
- `apps/agent-gateway/src/generated-object-binding.ts`（仅必要的小调整）
- `packages/world/src/product-session-codec.ts`
- `packages/world/src/product-session-codec.test.ts`
- 必要 export
- `docs/project-harness/tasks/DH-018/worker-result-product-session.md`

如必须超出以上产品范围，先停止并在 RESULT 解释，不要自行扩大。

## 验收行为

- session 创建时只读取一次 summaries 并固定 binding；后续 list 变化不影响已建 session。
- 动态 write transition 不再被旧 static snapshot ID 错拒；static write 仍 exact。
- 测试直接断言第一次 Evaluation `passed=false`，第二次 `passed=true`；中间 `read` 的 Ref 被第二次 edit 精确使用；Ref version 单调；两次 run trace/evidence 都仍可辨认。
- tool 名集合仍恰好四个。

至少运行 focused tests、`bun run typecheck`、targeted `git diff --check`、`.artifacts/harness/harnessctl validate`。若全量 gateway test 太慢，先跑直接相关文件并如实报告。

## RESULT

写 `docs/project-harness/tasks/DH-018/worker-result-product-session.md`：`RESULT: COMPLETE | BLOCKED`、accept receipt、设计、修改文件、exact 验证结果、已知限制。不要 mark-done，不要自审批准。
