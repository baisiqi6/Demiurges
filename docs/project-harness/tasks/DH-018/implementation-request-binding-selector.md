# DH-018 Worker 3 — binding selector only

你是 coding Worker 3。本轮只新增一个纯 selector 模块和测试，禁止修改任何既有文件。

## 立即 ACCEPT

先确认 `pwd` 与 branch，然后在任何写入前输出 `ACCEPT` 并执行：

```bash
.artifacts/harness/harnessctl accept DH-018 omp-deepseek-v4-flash-max-worker-3 dh018-binding-selector-20260825 --branch agent/codex/DH-017
```

## 唯一目标

把 typed `readonly GeneratedArtifactSetSummaryV1[]` 投影为最小 session binding。

只允许新增：

- `apps/agent-gateway/src/generated-object-binding.ts`
- `apps/agent-gateway/src/generated-object-binding.test.ts`
- `docs/project-harness/tasks/DH-018/worker-result-binding-selector.md`

不得修改任何已有文件。使用 OMP `write` 创建完整新文件；不要用 `edit`，bash 只读或运行测试。

## 固定接口与行为

```ts
import type { GeneratedArtifactSetSummaryV1 } from "@demiurges/world-project";

export interface GeneratedObjectBinding {
  readonly assetId: `asset:generated-sha256-${string}`;
  readonly artifactSetDigest: string;
  readonly sourceBounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
}

export function selectGeneratedObjectBinding(
  sets: readonly GeneratedArtifactSetSummaryV1[],
): GeneratedObjectBinding | null;
```

- 遍历 `sets`/`members`，仅匹配 `role === "object-glb" && format === "glb-2.0"`。
- 全局恰好一个匹配时返回 `assetId`、所属 set 的 `artifactSetDigest`、member 的 `sourceBounds`；零个或多个返回 `null`。
- 返回值及嵌套 bounds 必须递归冻结。直接 `Object.freeze` 两层即可，不写通用 deep-freeze helper。
- 输入已经由 package reader 验证；禁止 `unknown` codec、schema validator、Error class、digest regex、排序、选最新、日志。
- 产品代码目标 25–40 行。

## 测试

用最小 typed fixtures 直接证明：0 → null、1 → exact frozen binding、2 → null。单候选 fixture 使用 DH-017 的真实 identity/bounds：

- `artifactSetDigest=5641bf040c5dc881a553332493957627c8557edc5d7aa7d4f65b42139259e69d`
- `assetId=asset:generated-sha256-65dc7eb3d71393e624925c6848e88b55cf0bd6fd8d1ca63b956743fddd55e05a`
- `sourceBounds.min=[-0.48395800590515137, -3.736129973702895e-8, -0.2797180492002527]`
- `sourceBounds.max=[0.4801819920539856, 0.574190135291325, 0.2780711007797188]`

运行：

```bash
bun test apps/agent-gateway/src/generated-object-binding.test.ts
bun --cwd apps/agent-gateway typecheck
git diff --check
```

## RESULT

写 `worker-result-binding-selector.md`，包含 `RESULT: COMPLETE|BLOCKED`、ACCEPT receipt、修改文件、测试原文摘要、产品 LOC、限制。不要 mark-done、commit、push、接 fixture 或 Product Session。
