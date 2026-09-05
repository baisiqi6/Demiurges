# DH-018 Worker 2 — core session binding only

你是新的 coding Worker。只实现 core binding，不接 Product Session repair loop。

## 立即 ACCEPT

先确认 `pwd` 与 branch，然后在任何写入前输出 `ACCEPT` 并执行：

```bash
.artifacts/harness/harnessctl accept DH-018 omp-deepseek-v4-flash-max-worker-2 dh018-core-binding-20260825 --branch agent/codex/DH-017
```

读取范围仅限 canonical plan 与下列待改文件/测试。不要再搜索整个 `$HOME`、Data Root、Project Store 或 provider 代码。

## 唯一目标

实现并测试：typed `GeneratedArtifactReader.list()` summary → 唯一 `object-glb` 的小 selector → session-bound composite Snapshot → `WorldToolSurface` 可选 Host binding。

本轮不修改、不读取实现细节：

- `apps/agent-gateway/src/product-session.ts`
- `apps/agent-gateway/src/product-session-api.ts`
- Project manifest/store/recovery
- provider/generation transport
- Studio

## 允许文件

- 新增 `apps/agent-gateway/src/generated-object-binding.ts`
- 新增 `apps/agent-gateway/src/generated-object-binding.test.ts`
- `packages/world/src/artifacts/marble-hunyuan-composite-fixture.ts`
- `packages/world/src/artifacts/marble-hunyuan-composite-fixture.test.ts`
- `packages/world/src/world-tools/world-tool-surface.ts`
- `packages/world/src/world-tools/world-tool-surface.test.ts`
- `packages/world/src/index.ts`
- `docs/project-harness/tasks/DH-018/worker-result-core-binding.md`

不得超出。

## 极简设计约束

- 上游 summary 已是 package-owned typed/frozen verified DTO；禁止再写 `unknown` codec、`exactRecord`、`denseArray`、digest parser 或第二套 validation framework。
- selector 用一个小函数遍历 typed sets，只在恰好一个 `role=object-glb && format=glb-2.0` 时返回 binding；0 或 >1 返回 unavailable/null，不需要 Error class。
- world binding 只保留 Snapshot 真正使用的最小字段：`assetId`、`artifactSetDigest`、`sourceBounds`。不要保留未使用的 provider/byteLength/elementCount/generationId。
- fixture 只做 Y-up→Z-up AABB half-extents 纯计算、构造 session snapshot、以及现有 validator 的一个小 exact 分支。
- calibration/witness 必须等于固定 session constants，不能只检查 prefix。
- 保留相同 fixtureId/scenario；Project v1 对新 asset 继续由现有 registry join fail closed。
- product code 总增量以约 120–180 行为上限（测试不计）；若超过，先自行删减。
- 使用 OMP 原生 `edit`/`write` 工具修改文件；bash 仅用于只读检查和运行测试，禁止 `sed -i`、`perl -pi`、重定向覆盖、git restore/reset/checkout。

## 验证

```bash
bun test apps/agent-gateway/src/generated-object-binding.test.ts packages/world/src/artifacts/marble-hunyuan-composite-fixture.test.ts packages/world/src/world-tools/world-tool-surface.test.ts
bun --cwd packages/world typecheck
bun --cwd apps/agent-gateway typecheck
git diff --check
.artifacts/harness/harnessctl validate
```

测试直接证明：selector 0/1/many；真实 DH-017 digest/bounds 投影；proxy exact；session visual 的 fixed calibration/witness；旧 static composite 不变；surface 无 binding 走旧 fixture、有 binding 走新 fixture。

## RESULT

写 `worker-result-core-binding.md`：`RESULT: COMPLETE|BLOCKED`、ACCEPT receipt、修改文件、exact tests、LOC、限制。不要接 Product Session，不要 mark-done、commit、push 或部署。
