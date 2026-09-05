# DH-018 Worker 3 — binding selector

- Worker: `omp-deepseek-v4-flash-max-worker-3`
- Session: `dh018-binding-selector-20260825`
- Task: `DH-018`（binding selector only，只新增文件，不修改既有文件）
- Result: `RESULT: COMPLETE`

## ACCEPT receipt

```
[ACCEPT] id=evt-20260825T000120Z-10bd56c7 task=DH-018 actor=omp-deepseek-v4-flash-max-worker-3 target=omp-deepseek-v4-flash-max-worker-3 status=running branch=agent/codex/DH-017
```

`pwd` = `/Users/Admin/projects/WorkTrees/Demiurges-DH-017`，branch = `agent/codex/DH-017`。

## 修改文件（全部为新增，未改动任何既有文件）

- `apps/agent-gateway/src/generated-object-binding.ts`
- `apps/agent-gateway/src/generated-object-binding.test.ts`
- 本文档 `docs/project-harness/tasks/DH-018/worker-result-binding-selector.md`

## 实现摘要

`selectGeneratedObjectBinding(sets)` 遍历 `sets`/`members`，仅匹配 `role === "object-glb" && format === "glb-2.0"`；全局恰好一个匹配时返回 `{ assetId, artifactSetDigest, sourceBounds }`，零个或多个返回 `null`。返回值的 `min`/`max` 数组从输入拷贝后 `Object.freeze`，`sourceBounds` 与外层对象分别 `Object.freeze`，两层直接冻结、无通用 deep-freeze helper。无 codec、schema validator、Error class、digest regex、排序、选最新、日志。

## 测试原文摘要

`bun test apps/agent-gateway/src/generated-object-binding.test.ts`：3 pass / 0 fail，9 expect calls。用例：

1. **零个匹配 → null**：空数组返回 `null`；仅含 `world-spz-500k`/`spz-v2` 成员的 set 返回 `null`（证明按 role+format 过滤，不误报）。
2. **恰好一个匹配 → 精确 frozen binding**：单候选 fixture 使用 DH-017 真实 identity/bounds —— `artifactSetDigest=5641bf040c5dc881a553332493957627c8557edc5d7aa7d4f65b42139259e69d`、`assetId=asset:generated-sha256-65dc7eb3d71393e624925c6848e88b55cf0bd6fd8d1ca63b956743fddd55e05a`、`sourceBounds.min=[-0.48395800590515137, -3.736129973702895e-8, -0.2797180492002527]`、`sourceBounds.max=[0.4801819920539856, 0.574190135291325, 0.2780711007797188]`；set 内另含一个 `world-collider-glb`/`glb-2.0` 干扰成员（不匹配 role，被跳过）。断言 `toEqual` 精确值，并断言 `Object.isFrozen` 对结果、`sourceBounds`、`min`、`max` 全部为 `true`。
3. **多个匹配 → null**：两个 set 各含一个 `object-glb` 候选，返回 `null`（跨 set 检测）。

## 产品 LOC

`generated-object-binding.ts` 共 39 行（含 import 与空行），有效代码约 33 行，在 25–40 行目标内。

## 验证命令

- `bun test apps/agent-gateway/src/generated-object-binding.test.ts` → 3 pass / 0 fail
- `bun --cwd apps/agent-gateway typecheck` → 无错误
- `git diff --check` → 本 worker 两个新文件无输出；唯一报错来自既有文件 `docs/project-harness/current/review-packet.md:933`（其他 worker 的未提交改动，new blank line at EOF）。按任务约束「禁止修改任何已有文件」，未处理。

## 限制

- 未接入 fixture、未连 Product Session、未 mark-done、未 commit/push（按任务要求）。
- 只交付 selector 模块本身；调用方接入由后续 worker 负责。
