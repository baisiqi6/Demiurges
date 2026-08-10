# DH-006 Round 3 — Independent Cross-review Combined Verdict

## Decision

`changes_requested`

Kimi Code K3 Max static verdict 为 `approved`，Sol Max executable verdict 为 `changes_requested`。Sol 在同一冻结 digest 上证明 nominal settled budget 不约束悬挂 GET，并以当前 pinned OMP producer 复现 recoverable tool failure 后合法 `turn.completed` 被 Studio 误拒。可执行的当前 product contradiction 优先于静态 reviewer 的“未来 P2”判断，因此不得 close、commit 或 push。

## Root-fix direction

1. settled resync 使用单一 wall-clock deadline；每次 GET 必须由同一剩余预算约束并可 abort，不能只限制 loop 次数。
2. terminal event 是 turn outcome authority。`tool.completed(status=failed)` 是可恢复中间 evidence；只有 `turn.failed` 表示 terminal failure，`turn.completed` 必须允许之前存在 failed tool。
3. 增加当前 producer 的 failure→correction→PASS regression，以及 130-event 正边界测试；保持 failed trace redaction、evidence association 与 final projection resync。
4. Proxy trap 作为 transport 外、进程内直接调用的 P2 明确记录；不引入 Node-only proxy detection，也不宣称 wire attacker 可构造 Proxy。

修复后重跑 full gates/Chromium，并在新 digest 上做 fresh Round 4 final review。Round 1–3 历史 verdict 永久保留。
