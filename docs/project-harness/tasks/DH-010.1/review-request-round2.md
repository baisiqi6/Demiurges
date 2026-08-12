# DH-010.1 Remediation Fresh Review Request — Round 2

## Authority 与隔离

- 只读审查 `/Users/Admin/projects/WorkTrees/Demiurges-DH-010.1`；
- branch：`agent/codex/DH-010.1`，base `HEAD`：`4d37444f41e3db9164f3f614861ca971a489bfa3`；
- 只读本文件、canonical plan、task progress、scope/architecture/domain-model、目标 source/tests/diff；
- 不读取 `review-verdict-round1.md`、旧 `review-request.md`、任何旧 reviewer 消息或 current review packet；
- 不修改文件，不 commit/push/merge/tag/deploy，不调用真实 provider。

## Frozen product identity

固定顺序：

1. `packages/world/src/evaluation/evaluate-episode.ts`：`ea2cca89fd6069151a4bf0f1dc6d18993356dbf525d377523eb855566273c75f`
2. `packages/world/src/product-session-codec.test.ts`：`8a55a73bd4216a191cc946e27a9ff07d0504b07c2ac2ee96959084822068567c`
3. `scripts/probe-product-session-codec-v8.mjs`：`d01abaf29ea7b99161a4a1327886329f5d53672f78a924604c1bb760d93c07fe`

Aggregate 命令与算法同 plan 中的固定文件 SHA 文本二次 SHA-256，expected：`299414f7a4c78b1979ff1e73468b4c822286a9bb5bf71276a128e377f7271676`。

## Mandatory review

1. 真实 Bun producer → bounded JSON stdin → Node/V8 verifier 的合法 projection 通过；transport metric 篡改仍拒绝。
2. `runNodeV8Probe` 在 5 秒总 deadline 后终止并等待 child 回收；hung child regression 必须实际通过而非 mock exit。
3. parent 与 probe 都拒绝超过 2,000,000 UTF-8 bytes；不能按字符数或 header 猜测。
4. probe 的 stdin、Vite `createServer`、`ssrLoadModule` 与 `close` 具有 4 秒 step deadline；外层总 deadline 形成最终回收边界。
5. 正常与错误路径都关闭 Vite；timeout/error 不被空 stdout 或 JSON parse 覆盖。
6. evaluator 15-digit canonicalization、threshold-near、`-0`、non-finite、identity/passed/discrete/physics/ref/representation authority 保持。
7. bounded fresh scan 只看 P0/P1，不扩展为 UI redesign、CI portability 或未来平台机会。

## Required gates

```bash
bun test packages/world/src/product-session-codec.test.ts
bun test
bun run typecheck
bun run build
git diff --check
python3 /Users/Admin/projects/EXharness/skills/long-running-project-harness/scripts/validate-checklist.py \
  docs/project-harness/harness-checklist.json
```

输出：`decision`、P0/P1/P2、executed commands、counterexamples、digest before/after、`may_closeout`。任一 P0/P1 必须 `changes_requested`。
