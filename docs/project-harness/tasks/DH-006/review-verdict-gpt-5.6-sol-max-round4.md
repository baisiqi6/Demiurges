# DH-006 Round 4 — GPT-5.6 Sol Max Executable Review

## Decision

`approved`

Product digest before/after 均精确匹配 `f1d58ab9a72c88edb53a5ca56a1eedb3a94727198da3360628349c0ece7f4a64`。P0/P1/P2 均无。

## Executable evidence

- settled resync 使用一个 absolute deadline；首个 GET 永久悬挂、follow-up GET 永久悬挂且忽略 AbortSignal 的 probes 都在同一约 80ms wall-clock budget 内拒绝。App 随后清除 partial projection/world/run，不会永久停留 `running`。
- 当前锁定的 `@oh-my-pi/pi-coding-agent@17.2.12` 会把 tool failure 作为可纠正的中间 result 交还模型。Gateway API 到 Studio client 的端到端 probe 得到 `turn.started → failed → corrected succeeded tools → turn.completed`，最终 Evaluation PASS、ref v2；失败 input 为 `[redacted]`，wire 中无 synthetic credential/path marker。
- `start + 128 tools + terminal = 130` 完整接受；第 131 个 event 在 sink 前拒绝，无 off-by-one。
- 合法 512-char runId、descriptor-safe plain-data projection、`stale_ref` identity/advance-only、HTTP byte/media/atomic admission、single Gateway Host、run/ref separation 与 failure redaction 均通过聚焦 probes。

## Gates and limitations

- `bun test`：71 pass / 0 fail / 403 assertions；typecheck、build、`git diff --check` 与 checklist validation 均通过。
- 未联网、未发送真实 provider prompt、未读取 credential、未重跑 Chromium；本轮只审 transport/authority，并以本地锁定 OMP source 与 injected-client product path 验证 correction 语义。
- Reviewer 未编辑、commit、push、merge、reset 或 clean。
