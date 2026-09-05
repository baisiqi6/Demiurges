# DH-017 Limited-fresh Reviewer — Hunyuan diagnostic stage observability

## Context mode

`limited-fresh`：这是一次高风险外部调用前的局部诊断修正。只提供底层目标、Human 约束、canonical plan、当前脚本和必要离线证据；不要读取或依赖前一轮 reviewer verdict，也不要把 Worker RESULT 当作完成事实。

## 底层目标

旧 Job 的唯一诊断入口把所有失败压成 `STOPPED`，安全但不可操作。本轮只允许为一次性 Operator script 增加一个闭集脱敏 stage，使未来若 Human 另行授权一次 query，可以判断最小失败层；不能因此引入日志、error framework、provider abstraction 或产品 API。

## 必读

- `docs/project-harness/tasks/DH-017/plan.md` 中：
  - `2026-08-24 真实 MVP 验收收敛`
  - `terminal diagnostic stage-observability 修正`
- `.artifacts/canary/DH-017/20260824T1407Z/hunyuan-terminal-diagnostic/operator-diagnostic.ts`
- 必要时只读它直接 import 的既有 primitives。

## 禁止读取

- `.artifacts/canary/DH-017/20260824T1407Z/hunyuan-terminal-diagnostic/reviewer-verdict.md`
- 任何早先 reviewer verdict、旧审查叙事或 raw provider response。

## Reviewer authority

- 只读；不得修改任何 repo 文件。
- 可运行只读 Git/inspection、`wc`、`rg`、离线 `bun -e` injected-fake checks；静态 build 如需输出只能写 `/tmp`。
- 禁止 Keychain、network、provider query、真实 Job、submit、commit/push/merge/deploy。

## 必须回答

1. stopped stage 是否严格闭集 `input | credential | http | response | status | error-code`，且每个 stage 与真实失败层直接对应？
2. stdout/stderr 是否可能泄漏 exception、body、URL/status number、JobId、RequestId、ErrorMessage、prompt、credential 或 provider scalar？
3. 是否仍最多一处 query fetch、零 submit、零 retry；valid `FAIL + stable ErrorCode` 成功输出是否保持不变？
4. credential failure、HTTP non-200/reject、malformed response、WAIT/DONE、missing/invalid ErrorCode、valid FAIL、pre-abort、invalid CLI 是否能用 injected fake 离线复核？
5. 当前 115 行实现是否是解决真实问题的最小机制；哪些内容可以删除而不损正确性？不要为了显得严格制造 finding。

## 输出契约

先输出：

- `VERDICT: APPROVE | CHANGES_REQUESTED | BLOCKED`
- `MAY_REQUEST_NEW_QUERY_AUTHORITY: yes | no`

再按 P0-P3 给出有证据、影响、最小反例和最小修正的 findings；没有实质 finding 就明确全部为 0。最后报告实际 provider/model/session evidence、运行过的离线命令与零 mutation 核验。不要授权或执行真实 query。
