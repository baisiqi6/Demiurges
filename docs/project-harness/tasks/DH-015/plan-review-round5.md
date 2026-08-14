# DH-015 Plan Review — Round 5

## Reviewers

1. `gpt-5.6-sol`，max reasoning：`/root/dh015_plan_review_sol_r5`
2. OMP `deepseek/deepseek-v4-pro`，thinking `max`：session `01a00165-240e-7000-a9cd-c4684c8ae7c0`

两位 reviewer 均确认 frozen identity 起终一致并只读。DeepSeek approved；Sol 找到一个 plan authority 文件/export 缺口，combined gate 采用更严格结论。

## Combined decision

- `decision: changes_requested`
- `may_implement: no`
- P0：0
- P1：1

## P1 — preflight 缺少 package-root public seam authority

计划要求 Gateway 使用 `@demiurges/world` owned preflight并禁止复制规则，但 `index.ts` 只被授权导出 decoder。当前 Gateway 只从 package root import，因此实现者会被迫 deep import、修改未授权 surface、复制规则或临时扩 scope。

计划修订为：`packages/world/src/index.ts` 明确导出 pure preflight、closed outcome/canonical result types 与 decoder；Gateway reservation 后、surface 前只调用 package-root export。它不是第五个 tool，也不导出 Composer/UI/Gateway route 类型。增加 package-root import test。

同时吸收非阻塞 hardening：固定 transport parse codes；把 Repository floor predicate/`1e-9` tolerance 机械提取为 pure single source供 preflight 共用，明确无 Repository 语义变化。

## Round 6 gate

先完成 workflow mutation，再最后冻结 manifest；两位 fresh reviewer P0/P1 为 0 才批准。
