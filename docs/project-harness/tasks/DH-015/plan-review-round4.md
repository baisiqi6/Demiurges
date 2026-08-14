# DH-015 Plan Review — Round 4

## Reviewers

1. `gpt-5.6-sol`，max reasoning：`/root/dh015_plan_review_sol_r4`
2. OMP `deepseek/deepseek-v4-pro`，thinking `max`：session `01a00159-2a11-7000-9aba-783d39e59fa3`

两位 reviewer 均确认 frozen identity 起终一致并保持只读。DeepSeek verdict 为 approved；Sol 提供了一个可执行 P1，因此 combined gate 采用更严格结论。

## Combined decision

- `decision: changes_requested`
- `may_implement: no`
- P0：0
- P1：1

## P1 — composite pose/no-op 必须在 mutation surface 前闭合

generic parser 接受任意 unit quaternion，而 composite 只允许 pure world-Z yaw。若依赖 fixture insertion 最终拒绝，Repository 已在 validator 前递增 edit sequence，后续合法 Snapshot ID 会跳号。direct POST 的 semantic no-op 也会绕过 Studio optimization，创建 child、推进 Ref 并清空 lastRun。

计划修订为 package-owned pure composite authoring preflight：在共享 reservation 内、调用 surface 前完成 exact fixture/target、numeric envelope、pure yaw、total hemisphere、-0/q-equivalence、floor safety 与 no-op 判定。closed outcomes 为 accepted / unchanged / stable rejection；只有 accepted 可调用 surface。unchanged 返回 byte-equivalent trusted projection并保留所有 authority/sequence。

## Absorbed hardening

- `422 POSE_NOT_COMPOSABLE` 固定覆盖 invalid yaw/envelope/floor；
- decoder 显式验证 `input.expected === prior.ref` 与 unchanged outcome；
- tests 证明 invalid/no-op 不调用 surface、不递增 Repository edit sequence，下一合法 child ID 不跳号。

## Round 5 gate

先完成 workflow mutation，再最后冻结 manifest；两位 fresh reviewer P0/P1 为 0 才批准。
