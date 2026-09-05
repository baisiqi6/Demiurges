# DH-017 limited-fresh Reviewer request — Hunyuan error envelope

角色：independent read-only Reviewer。

## 底层目标

用最小、可证伪的 Operator-only 诊断，确认 2026-08-20 已存在的 Hunyuan failed Job 当前返回的稳定 provider error code。诊断必须保持一次 query、零 generation submit、零内部 retry；任何可见或持久化结果只能是闭集 stopped stage，或 `{kind, Status:"FAIL", ErrorCode}`。不得泄漏 `Error.Message`、`RequestId`、raw response、URL、JobId、prompt、credential/header。

当前唯一真实运行证据只有脱敏 token `DH017_HUNYUAN_TERMINAL_DIAGNOSTIC_STOPPED:response`；它证明 credential 与 HTTP 200 已通过、normal query codec 未收敛，但不证明 raw response 的具体形状。仓库已有冻结的 2026-08-20 shape descriptor/计划事实：同一旧 Job 曾表现为 cloud `Response={Error,RequestId}`、`Error={Code,Message}` 的类型/字段形状。请以当前磁盘事实独立核验，不相信任何 Worker 完成声明。

## cwd / worktree

`/Users/Admin/projects/WorkTrees/Demiurges-DH-017`

## 必须读取

- `.artifacts/canary/DH-017/20260824T1407Z/hunyuan-terminal-diagnostic/operator-diagnostic.ts`
- `apps/agent-gateway/src/generation-provider-codecs.ts` 中 Hunyuan query codec
- `apps/agent-gateway/src/hunyuan-shape-inspector.ts` 与相关 tests
- `docs/project-harness/tasks/DH-017/live-canary-receipt-20260820.md` 中 replacement shape capture 事实
- 当前 task plan 中 Hunyuan terminal diagnostic 边界

## Reviewer authority

- 允许：Read/Grep/Glob 和只读 Bash；可用 injected fake 执行离线测试。
- 修改：无。
- 禁止：Edit/Write/commit/reset/clean/push/merge/SSH/deploy；禁止 Keychain、网络、provider、合法 JobId CLI；禁止读取或推断 credential/raw response/provider scalar。

## 审查问题

1. 当前 120 行脚本是否严格匹配标准 `Response={Error,RequestId}` 与 `Error={Code,Message}`，且仅在 `Code` 通过稳定 token regex 时输出它？
2. 是否仍然只有一个 query fetch、零 submit、零 retry、零 runtime persistence？
3. 正常 `Response.Status=FAIL + ErrorCode` 路径是否仍保持？
4. 是否存在任何 Error.Message、RequestId、raw body、URL、JobId、credential 或异常文本泄漏路径？
5. 从第一性原理和奥卡姆剃刀看，这是否是值得用一次 Human-authorized retry 验证的最小修正？不要建议通用 error framework、provider abstraction、logger 或产品 codec 改造。

## 输出

中文为主，给出 `APPROVE` 或 `CHANGES_REQUESTED`、P0/P1/P2 数量、精确问题与证据、是否 `may_retry_once=yes|no`。若无法从当前磁盘核验，请停止并说明缺失证据。不得修改任何文件。
