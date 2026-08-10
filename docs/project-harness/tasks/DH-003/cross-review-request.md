# DH-003 Fresh Cross-Review Request

## 角色与目标

你是 independent read-only reviewer。目标是对 `DH-003` 的实际 branch diff 与 executable behavior 给出结构化 verdict，不延续实现者结论，也不把现有 tests green 当作 approval。

## Workspace

- cwd/worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-003`
- base：`main`
- implementation branch：`agent/codex/DH-003`
- canonical review packet：`docs/project-harness/current/review-packet.md`
- canonical plan：`docs/project-harness/tasks/DH-003/plan.md`
- expected fresh product digest：`495a6c95299e19bd3e714e381f2cb2b472a12b0aec45e7a8b647077fd96feec2`

这是 lexical authority 修复后的 final fresh review。不得把 Round 1/2 verdict 或 evidence 文件的旧结论当作当前 verdict；需要针对当前 source 独立复测。

## Authority

- 允许：只读 `AGENTS.md`、scope/architecture/domain-model/plan、Git diff、产品源码与 tests；运行不写 repo 的 `git`、`rg`、`sed`、`bun test`、`bun -e`、hash/probe 命令。
- 禁止：修改任何文件、运行 build、安装依赖、生成 artifact、commit、push、merge、联网、SSH、deploy、生产 mutation、`reset/clean/checkout`。
- 不读取既有 reviewer verdict 作为答案；不得 `mark-done`。
- 若动态 probe 需要写临时文件，只能使用进程内 `bun -e`；不要写 repo 或 `/tmp` 脚本。

## 必审不变量

1. RefRecord 的 `snapshotId + version` CAS 是否单调、不可由 stale/current-same-old-version 绕过。
2. `edit` 是否只记录 child；只有 explicit `advance` 推进 authored state；Run/Playback/Evaluation/record 是否都不推进 ref。
3. `adopt` 是否必须绑定 Host 注入的固定 policy、已登记 Episode、已登记且通过的 Evaluation、同一 evaluator/contract/episode、已登记 terminal 与 fresh expectation。
4. identity collision、重复 record、伪造 plain frozen record、getter、sparse/NaN、wrong source/lineage、wrong ref name/version、重复 adopt 是否 fail closed 且零 ref mutation。
5. Host policy ownership 是否保持 Kernel 不依赖具体 evaluator；是否出现不必要 registry、权限平台或未来 Provider abstraction。
6. UI 是否在 Evaluation pass 前禁用 Adopt；成功 Adopt 只推进一次并禁用；stale outcome 不伪称成功。
7. Tests 是否真正证明 acceptance，是否存在“实现与测试同错”的缺口。
8. Round 1 的两个 P1 是否真正关闭：`RuntimeMvpHost` 是否让任意 frozen Episode/Evaluation 与同 ID alternate contract 无法进入既有 Host authority；foreign capability 是否在任何 terminal record / ref mutation 前 fail closed。不要把“攻击者新建并完全拥有自己的 Repository”误报为修改既有 Host 世界。
9. module 是否仍导出可 monkey-patch 的 Repository implementation；existing Host 的 evidence admission 是否仍把 secret/token 作为可拦截的动态调用参数传递。另一个 factory authority 只能影响自己的世界不算 existing Host compromise。

## 独立证据

- 运行 `bun test`，记录 pass/fail/assertions。
- 审查前后运行：

```bash
find apps/studio/src -type f -print0 | sort -z | xargs -0 shasum -a 256 | shasum -a 256
```

- 可以运行聚焦 `bun -e` 反例，但不得修改 repo。

## 输出 contract

中文为主体，保留精确 identifier/command/path。

```text
Observed model/provider: ...
Digest before: ...
Findings:
- P0/P1/P2 ...（没有则明确 none）
Tests/probes: ...
Digest after: ...
Mutation check: clean/unchanged 或具体差异
Verdict: approved | changes_requested | blocked
Rationale: ...
```

任何可执行 P0/P1 都必须 `changes_requested`；只有 evidence 无法取得且不能判断时才 `blocked`。
