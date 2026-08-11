# DH-007 Round 3 — GPT-5.6 Sol Max Executable Review

decision=changes_requested

## P0

无。

## P1

1. pinned resolver 自身稳定，但首次调用 `modelRegistry.getApiKey(model)` 没有传 sessionId；锁定 OMP 在进入 Agent 请求前已用 `modelRegistry.getApiKey(this.model, this.sessionId)` preflight。双 synthetic credential 反例证明 session-hash preflight 与无 sessionId round-robin resolver 可选中两个不同 sibling credential。
2. `Settings.isolated` 仍保留默认 `compaction.enabled=true / strategy=snapcompact`。锁定 OMP context maintenance 会枚举 role/大 context model，并直接使用 `modelRegistry.getApiKey(candidate, sessionId)` 与独立 resolver，绕过 product pinned `getApiKey`，达到阈值后可调用第二 model/credential。
3. tool wrapper 只检查 SDK `_signal`，没有绑定不可替换的 owning turn signal。fake port 在 turn aborted/settled 后用 fresh signal 调用 `world_write` 成功，造成 surface 实际状态与 ProductSession projection/running authority 分叉。

## P2

无。

## Evidence

- product digest before/after：`ea599a14af3cb1b1cae19cc5defb59329715b117853455af03090a26a73f402c`；
- base/HEAD：`a570064a7292821166fd65f074577a22b0390c14`；
- targeted tests：21 pass / 0 fail / 112 assertions；
- no-network synthetic credential、Settings 与 late-world-write probes 均复现上述 P1；
- Fireworks fast admission 已关闭，不是剩余 blocker。

## Limitations

严格只读；未读取真实 credential、未联网、未发送真实 prompt、未 build、未调用外部 agent，也未读取另一 Round 3 verdict。
