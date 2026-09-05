# DH-017 limited-fresh Review — Hunyuan terminal diagnostic

## Context mode

`limited-fresh`：这是架构方向收敛后的高风险真实调用前审查。不要继承或相信 Worker 的完成报告，也不要读取前两轮 OMP 的 transcript/思考。只依据底层目标、canonical plan、当前文件与可重复离线证据判断。

## 底层目标与用户约束

Demiurges 需要让至少一个真实 provider 完成可验证 Artifact 闭环。Marble live canary 已 deferred。当前唯一目的，是在任何新 paid submit 前，对 2026-08-20 已存在的失败 Hunyuan Job 做一次 no-generation query，得到稳定 `Status` 与 provider `ErrorCode`，从而选择最小修正。

用户明确要求第一性原理、奥卡姆剃刀、最小机制，不在小点上堆防御代码。此诊断是一次性 Operator evidence，不是产品 API，不得发展成框架。

## Authority 与 non-goals

- CWD：`/Users/Admin/projects/WorkTrees/Demiurges-DH-017`
- Reviewer 只读；禁止写文件、Keychain、联网、执行真实 Job、commit/push/merge/deploy/reset/clean/install。
- 不授权新 paid submit、第三 provider、通用 Provider SDK、retry/backoff、日志/审计框架或产品代码修改。
- 真实 query 只有 Codex Operator 在 Reviewer approval 后可以恰好执行一次。

## 必读事实

1. `docs/project-harness/tasks/DH-017/plan.md` 顶部的 `2026-08-24 真实 MVP 验收收敛`；
2. `.artifacts/canary/DH-017/20260824T1407Z/hunyuan-terminal-diagnostic/operator-diagnostic.ts`；
3. 必要时只读被它直接 import 的四个 primitives；
4. `git status --short` 与该文件的行数/静态 build；
5. Worker result 可作为 locator，但不是完成事实：`.artifacts/canary/DH-017/20260824T1407Z/hunyuan-terminal-diagnostic/worker-result.md`。

## Review questions

从真实需求而不是表面指标出发回答：

1. 是否确实最多一次 query、零 submit、零 retry？
2. 是否只有合法 terminal `FAIL` 才输出固定 kind、`Status`、稳定 `ErrorCode`？任何路径是否可能泄漏 ErrorMessage/raw response/RequestId/JobId/signed URL/prompt/credential？
3. 非 200、pending、malformed、abort/timeout 是否固定 stopped，且不需要为了假想风险再加机制？
4. 是否复用现有 parser/transport 边界，且 96 行的一次性脚本没有不必要抽象？哪些代码若删除仍不损害核心正确性？
5. 是否足以授权 Operator 执行一次真实 no-generation query？

## Output contract

中文为主，先给 `VERDICT: APPROVE | CHANGES_REQUESTED | BLOCKED` 与 `MAY_RUN_REAL_QUERY: yes | no`。只报告有实质影响、可执行的 finding；每项说明 Evidence、Impact、Minimal counterexample、Minimal correction。没有实质 finding 就明确 P0/P1/P2/P3 均为 0，不要为了显得严格制造问题。最后报告请求/观察到的 provider、model、session evidence；不得包含 private reasoning、credential 或真实 Job identity。
