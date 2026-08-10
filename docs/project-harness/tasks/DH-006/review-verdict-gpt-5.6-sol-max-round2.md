# DH-006 Round 2 — GPT-5.6 Sol Max Executable Review

## Decision

`changes_requested`

Digest before/after 均为 `af5167ef946d4190127e5bf70d2ad290dbb50377bbc549f0197bbf42b87a02db`。Reviewer 严格只读，执行结果为 62 tests / 0 fail / 375 assertions，typecheck、build、diff-check 与 checklist JSON 均通过；以下 P1 仍阻断关单。

## P1

1. Abort/断流后的单次 resync 可能读到 `running: true` 的中间 projection。服务端仍继续 authoritative turn，而 Studio 接纳该中间态并永久禁用运行。可执行反例得到一次 GET 的 `{running:true,lastSequence:1}`，随后 Gateway 已变为 `{running:false,lastSequence:2}`，客户端仍停留在旧 projection。
2. codec 的 `MAX_ID_LENGTH=256` 拒绝当前合法 evidence。合法 304 字符 runId 产生 319 字符 Episode ID、329 字符 terminal Snapshot ID 与 377 字符 Evaluation ID，但 resync decode 失败。
3. codec 仍接纳非 plain-data 或不一致 evidence：`stale_ref` 的 ref/snapshot identity 可漂移；长度为 3 的 sparse Vec3 因 `forEach` 跳洞而通过；accessor-backed `type` 可在多次读取间漂移并被接纳。
4. ProductSession 只脱敏 `trace.error`，仍原样复制失败 `trace.input`。synthetic credential-like、path、OMP 与 RuntimeMvpHost marker 可进入 HTTP product event。

## Required root fixes

- 失败恢复必须 bounded follow-up resync，直到获得 settled projection，不能把一次中间 `running` 读数当成最终事实；
- codec 先做 descriptor-safe、side-effect-free 的 plain-data projection，再做语义 validation；拒绝 sparse array、accessor、symbol、non-enumerable 与额外字段；
- ID 预算必须与真实 producer contract 对齐，由整体 DTO budget 约束，不对派生 identity 施加错误的 256 字符上界；
- `world_edit` 的 updated/stale_ref 都必须保持 ref/snapshot identity，Agent-facing edit 只允许 advance；
- failed trace 的 input 必须使用稳定 product-owned redaction，不得复制原始 tool input。

P0/P2：无。未联网、未运行真实 provider prompt、未读取 credential、未编辑工作树。
