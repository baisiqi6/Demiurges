# DH-018 Worker 4 — generated session fixture only

你是 coding Worker 4。本轮只新增 session fixture 模块和测试，禁止修改任何既有文件。

## 立即 ACCEPT

在任何写入前输出 `ACCEPT` 并执行：

```bash
.artifacts/harness/harnessctl accept DH-018 omp-deepseek-v4-flash-max-worker-4 dh018-session-fixture-20260825 --branch agent/codex/DH-017
```

## 唯一目标

从最小 generated-object binding 构造一个 session-bound Marble/Hunyuan composite Snapshot。复用现有 environment、floor、generated-object 的 pose/physics；只替换 generated-object 的 visual identity、box collision proxy 与 authored semantic witness。

只允许新增：

- `packages/world/src/artifacts/marble-hunyuan-generated-session.ts`
- `packages/world/src/artifacts/marble-hunyuan-generated-session.test.ts`
- `docs/project-harness/tasks/DH-018/worker-result-session-fixture.md`

不得修改任何已有文件。用 OMP `write` 创建完整新文件；不要用 `edit`。不要接 `world-tool-surface`、validator、Product Session 或 package index。

## 固定接口

```ts
export interface GeneratedObjectWorldBinding {
  readonly assetId: `asset:${string}`;
  readonly artifactSetDigest: string;
  readonly sourceBounds: Bounds3;
}

export const GENERATED_SESSION_CALIBRATION_ID = "calibration:hunyuan-generated-session-v1" as const;
export const GENERATED_SESSION_WITNESS_ID = "witness:hunyuan-generated-session-box-proxy-v1" as const;
export const MARBLE_HUNYUAN_GENERATED_SESSION_SNAPSHOT_ID = "snapshot:marble-hunyuan-generated-session" as const;

export function deriveGeneratedObjectHalfExtents(sourceBounds: Bounds3): Vec3;
export function createMarbleHunyuanGeneratedSessionSnapshot(
  binding: GeneratedObjectWorldBinding,
): Snapshot;
```

## 极简行为

- `deriveGeneratedObjectHalfExtents` 只计算现有 authored-unverified axis map `(+source.x, -source.z, +source.y)` 做 AABB centering 后的三个 half extents：
  - x = `(max.x - min.x) / 2`
  - y = `(max.z - min.z) / 2`
  - z = `(max.y - min.y) / 2`
- 调用 `createMarbleHunyuanCompositeSnapshot()`，复用它的 environment/floor 与 generated-object 的 state/physics。
- 新 Snapshot 保持相同 `scenarioId`、`source: "write"`、`parentId: null`，只改成固定 session snapshot ID。
- generated visual：`kind="registered-rigid-mesh"`、`assetId=binding.assetId`、`manifestDigest="sha256:" + binding.artifactSetDigest`、calibration/witness 必须 exact 等于上面的固定 constants。
- collision：`kind="box"`、`halfExtents=deriveGeneratedObjectHalfExtents(binding.sourceBounds)`。
- observation 保持 `null`；semantic 使用 `{ kind: "authored-box-proxy", witnessId: GENERATED_SESSION_WITNESS_ID }`，明确不是 provider-verified physical truth。
- 最终 Snapshot 用既有 `deepFreeze` 递归冻结。
- 禁止 validator/codec/Error class/registry mutation/source bytes/general transform framework。产品代码目标 45–70 行。

## 测试

用 DH-017 真实 binding：

- `artifactSetDigest=5641bf040c5dc881a553332493957627c8557edc5d7aa7d4f65b42139259e69d`
- `assetId=asset:generated-sha256-65dc7eb3d71393e624925c6848e88b55cf0bd6fd8d1ca63b956743fddd55e05a`
- bounds 与 selector test 相同

直接断言：

- half extents exact 等于 `[0.4820699989795685, 0.27889457498998575, 0.28709508632631236]`
- session Snapshot 的 id/scenario/source/parent、environment/floor 与 canonical value 相同
- generated visual identity 与 fixed calibration/witness exact；collision exact；semantic 标注 authored proxy
- canonical static snapshot 的旧 Hunyuan asset/manifest 不变
- session Snapshot 递归冻结

运行：

```bash
bun test packages/world/src/artifacts/marble-hunyuan-generated-session.test.ts
bun run typecheck
git diff --check -- packages/world/src/artifacts/marble-hunyuan-generated-session.ts packages/world/src/artifacts/marble-hunyuan-generated-session.test.ts docs/project-harness/tasks/DH-018/worker-result-session-fixture.md
```

## RESULT

写 `worker-result-session-fixture.md`，含 `RESULT: COMPLETE|BLOCKED`、ACCEPT receipt、修改文件、测试摘要、产品 LOC、限制。不要 mark-done、commit、push 或修改 index/surface/validator。
