# DH-006 Round 3 — GPT-5.6 Sol Max Executable Review

## Decision

`changes_requested`

Digest before/after 均精确匹配 `b476912e93c8417e00e79c930597c6aa2a8711c2e3aa4e2a847f3f530cb5bff8`；68 tests / 0 fail / 395 assertions，typecheck/build/diff/checklist 均通过，但以下 P1 阻断关单。

## P1

1. settled resync 只有 attempt 数与间隔预算，单次 `readSession()` GET 没有 deadline。若 fetch 永不 resolve，2 秒 nominal budget 不会推进；2302ms 后 probe 仍为 pending，App 继续显示 `running`。
2. Gateway 与 Studio 对 recoverable tool failure 的 terminal 语义不一致。当前 pinned OMP agent-core 会把工具异常作为 `isError` result 交还模型，允许纠正后继续；Gateway 可合法发出 `failed tool → succeeded tools → turn.completed` 并产生 PASS projection，Studio 却因见过任一 failed tool 无条件拒绝 `turn.completed`。真实 API probe 已复现合法 producer evidence 被 client 误拒。

## P2

导出的 decoder 无法在浏览器标准 API 中无副作用识别透明 Proxy；对 Proxy 的 `getPrototypeOf`/`ownKeys`/descriptor traps 会执行。HTTP transport 经 `JSON.parse`，该输入不能从 wire 到达，故不阻断本地产品边界。

Reviewer 同时确认合法 512 字符 runId、plain-data descriptor admission、stale_ref identity/advance-only、failed trace redaction、130-event 正边界与 131-event 拒绝、Round 1 transport blockers、single Host、run/ref separation 均成立。未联网、未运行真实 provider prompt、未读取 credential、未编辑工作树。
