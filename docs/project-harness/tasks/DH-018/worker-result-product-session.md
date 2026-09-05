# DH-018 Worker Result — Product Session binding and repair loop

## RESULT: COMPLETE

- Worker: zcode-glm53-max-worker（requested model `GLM-5.3` reasoning `max`；actual model `UNVERIFIED`，runtime 无法证明）
- Accept receipt: `evt-20260825T013052Z-704070ab`（`harnessctl accept DH-018 zcode-glm53-max-worker dh018-product-session-20260825 --branch agent/codex/DH-017`，status=running）
- 前一轮 BLOCKED 的原因是本机 Bash permission 层不可用；Operator 恢复后已重发，本轮 accept 成功。

## 设计

1. **Session 创建固定 binding（list 一次）**：`ProductSessionRegistry.create()` 在创建时调用一次 `worldProjects.generatedArtifacts.list()`，用现有 `selectGeneratedObjectBinding` 选择恰好一个 `object-glb/glb-2.0` 候选，并把 frozen binding 传入 `ProductSession` → `WorldToolSurface(host, binding)`。此后 `list()` 变化不影响已建 session（binding 是创建时捕获的 frozen 值）。零个/多个候选或 reader 抛错（recovery）时保持无绑定，该 session 的 composite `write` 回退 static fixture——这是选择的最小产品语义："不猜、稳定保持无绑定"。
2. **`ProductSession` constructor** 增加 optional `GeneratedObjectWorldBinding`；`restoreProject` 不传 binding，Project v1 恢复行为不变。
3. **动态 write transition 不再错拒**：`decodeProductSessionAuthoringTransition` write 分支的 snapshot ID 检查从只认 `MARBLE_HUNYUAN_COMPOSITE_SNAPSHOT_ID` 放宽为恰好两个 exact ID（static composite 与 `MARBLE_HUNYUAN_GENERATED_SESSION_SNAPSHOT_ID`），并保持 ref/snapshot ID 一致、version=1、parentId=null 等全部 exact 约束；伪造 ID 仍被 fixture validator 拒绝。
4. **Codec composite semantic**：`entity:generated-object` 的 `semantic` 允许恰好 `authored-box-proxy` + `GENERATED_SESSION_WITNESS_ID`（session 固定的 authored-unverified box-proxy 边界），static composite 仍要求 null；observation 仍只允许 environment。
5. **Repair loop（deterministic scripted test）**：真实 DH-017 identity 的 binding 上，Agent 依次 `write → read → edit(x=3, floor half-x≈1.48 之外) → run(passed=false) → read 当前 Ref → edit(精确使用该 Ref, x=0) → run(passed=true)`。测试直接断言第一次 Evaluation `passed=false`、第二次 `passed=true`，中间 read 的 Ref 被第二次 edit 精确使用，edit 后 Ref version 单调（2、3），两次 run trace/evidence 都保留在 tool.completed 事件中，tool 名集合仍恰好四个。

## 修改文件

- `apps/agent-gateway/src/product-session.ts`：constructor 接受 optional binding 并传给 `WorldToolSurface`。
- `apps/agent-gateway/src/product-session-api.ts`：registry create() 一次 list + select；reader 异常时保持无绑定。
- `apps/agent-gateway/src/product-session.test.ts`：新增 generated-session repair loop 测试。
- `apps/agent-gateway/src/product-session-api.test.ts`：新增"创建时固定 binding、后续 list 变化不影响已建 session、多候选新 session 回退 static"测试。
- `packages/world/src/product-session-codec.ts`：write snapshot ID exact 集合 + generated-object session semantic 精确放行。
- `packages/world/src/product-session-codec.test.ts`：新增动态/static write transition codec 测试。
- `docs/project-harness/tasks/DH-018/worker-result-product-session.md`：本文件。

未修改：`generated-object-binding.ts`、`MARBLE_HUNYUAN_REGISTRY`、`WorldProjectManifestV1`、Project Store/bundle/startup recovery、provider/generation 路径、Studio。无第五个 tool。

## 验证结果（全部实跑）

- Focused: `bun test apps/agent-gateway/src/product-session.test.ts apps/agent-gateway/src/product-session-api.test.ts apps/agent-gateway/src/generated-object-binding.test.ts` — 30 pass / 0 fail / 182 assertions。
- Focused: `bun test packages/world/src/product-session-codec.test.ts` + `artifacts/marble-hunyuan-generated-session.test.ts`、`composite-authoring.test.ts`、`artifacts/marble-hunyuan-composite-fixture.test.ts` — 24 + 133 pass / 0 fail。
- Final focused 组合（typecheck 修正后复跑 codec + 两个 session 文件）：47 pass / 0 fail。
- Full package: `bun test packages/world` — 845 pass / 0 fail / 7500 assertions（含 registry regression 与 Project v1 tests，无漂移）。
- Full package: `bun test apps/agent-gateway` — 205 pass / 0 fail（含 import-boundary）。
- `bun test apps/studio` — 78 pass / 0 fail（codec 消费方）。
- `bun run typecheck` — pass（world-project、agent-gateway、studio）。
- Targeted `git diff --check`（全部 7 个改动路径）— clean（exit 0）。
- `.artifacts/harness/harnessctl validate` — "Checklist validation passed (0 warnings)"。

## 已知限制

- `ProductSessionRegistry.create()` 在 reader 处于 recovery（`list()` 抛错）时静默保持无绑定；session 创建仍成功并回退 static composite。产品语义是"不猜"，但 Operator 若希望 recovery 显式失败需另行决定。
- Binding 只投影 `assetId/artifactSetDigest/sourceBounds`；其余 verified summary 字段仍由 Reader 持有，未复制到 Snapshot 边界（与 plan 一致）。
- session validator 不重算 collision halfExtents（承袭 review P2，当前唯一写入点仍是受测 Host-pinned constructor，Agent edit 为 pose-only）。
- 未运行受限 OMP Agent canary——按 plan 那是 Operator 的独立验证步骤。
