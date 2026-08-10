# DH-001 Final Fresh Cross-review Request

你是 Demiurges `DH-001` 的 fresh independent reviewer。唯一 cwd：`/Users/Admin/projects/Demiurges`。直接读取当前 source/tests/canonical docs；仓库无 commit，不能依赖 `git diff`。不要读取任何 `*review-verdict*.md`、`*cross-review-verdict*.md` 或另一 reviewer 输出。

只读 authority：允许 Read/Grep/Glob、`bun test` 与不写 product 的诊断；禁止 Edit/Write/install/build/commit/branch/push/deploy/SSH/network/subagent。无法执行的事实列 residual risk，不扩大权限。

## Baseline

```text
52c26a6d7e3de7533a6b8307da52172b75c8be476ef23334662c1a52589c3fe1
```

覆盖 `apps/studio/`（排除 node_modules/dist/*.tsbuildinfo）和根 package.json/bun.lock。审查后必须不变。

## 必读

- `AGENTS.md`、`README.md`
- `docs/project-harness/{scope,architecture,domain-model,technical-foundation,progress}.md`
- `docs/project-harness/tasks/DH-001/{plan,findings,final-review-request}.md`
- `docs/project-harness/harness-checklist.json`
- `apps/studio/src/` 全部 source/tests
- package/tsconfig/Vite/bun.lock

## Final gate

独立寻找当前 slice 的可执行 P0/P1，至少核验：Snapshot identity/deep freeze/lineage/ref authority；fixed program/profile identity；pre-await immutable inputs；plain dense Vec3 与 finite evidence；supported floor+cube world；MuJoCo pose/velocity/frame mapping；integer sample/contact/terminal timing；run+base derived identity；Evaluation identity/immutability；real MuJoCo/live-view copy/cleanup/dependency direction；tests oracle 与 simplicity。

特别尝试复现：frozen-root mutable children、orphan parent、sparse arrays、same runId + different base、NaN/Infinity evidence，以及 run/record/evaluate 未 adopt 时改变 ref。不要扩展到 persistence、3DGS、Agent、通用 provider 或安全平台。

Operator 报告第三轮 RED 13/4、修复后 tests 17/0/140，typecheck/build/browser 通过；这些是待复核报告，不是 reviewer 结论。

输出：`DECISION: approved|changes_requested|blocked`，随后 P0/P1/P2、证据、残余风险、关单建议。`approved` 必须无 P0/P1。不要输出 private chain-of-thought。
