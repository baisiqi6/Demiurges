# DH-010.1 Independent Review Request

## Authority

- 只读审查 `/Users/Admin/projects/WorkTrees/Demiurges-DH-010.1`；
- branch：`agent/codex/DH-010.1`；
- base `HEAD`：`4d37444f41e3db9164f3f614861ca971a489bfa3`；
- 不修改文件，不 commit/push/merge/tag/deploy，不调用真实 provider；
- 不把历史 DH-010 approval 当成当前修复的批准证据。

## Frozen product files

按此固定顺序执行：

```bash
shasum -a 256 \
  packages/world/src/evaluation/evaluate-episode.ts \
  packages/world/src/product-session-codec.test.ts \
  scripts/probe-product-session-codec-v8.mjs

shasum -a 256 \
  packages/world/src/evaluation/evaluate-episode.ts \
  packages/world/src/product-session-codec.test.ts \
  scripts/probe-product-session-codec-v8.mjs | shasum -a 256
```

Expected aggregate：`6bc13dfec1c33927105bfa29fbc47ac2f95dc3d47a60732ecb1ccc98ebb20465`。

## 必审问题

1. RED 是否真实跨 Bun producer → JSON → Node/V8 verifier，而不是手写预期或同引擎自证？
2. 15 位十进制 canonicalization 是否位于共享 evaluator evidence boundary，而非 UI/codec 绕过？
3. `passed` 是否依据 canonical continuous values，避免 evidence 与 predicate 分裂？
4. transport 中被篡改的 canonical metric、identity、passed、离散 count、physics/ref/representation drift 是否继续 fail closed？
5. `-0`、non-finite、threshold-near 值、landing 与 stable-inside-vessel 两个 evaluator 是否存在 P0/P1 反例？
6. 新 Node/V8 probe 是否 deterministic、bounded、无网络、会关闭 Vite server，并且失败信号不会被空 stdout 掩盖？
7. diff 是否严格限定在本缺陷与 EXharness 证据，没有引入 Runtime mode、browser fallback 或新 authority？

## Reviewer gates

```bash
bun test packages/world/src/product-session-codec.test.ts
bun test
bun run typecheck
bun run build
git diff --check
python3 /Users/Admin/projects/EXharness/skills/long-running-project-harness/scripts/validate-checklist.py \
  docs/project-harness/harness-checklist.json
```

输出结构：`decision`、`P0/P1/P2`、executed commands、counterexamples、digest before/after、`may_closeout`。任何 P0/P1 都必须 `changes_requested`。
