# DH-007 Round 1 — GPT-5.6 Terra Max Static Review

decision=changes_requested

## P0

无。

## P1

1. 与 Sol 一致：`DEMIURGES_OMP_MODEL` 只约束初始 session，未关闭 OMP global retry model fallback，失败路径仍可能转向另一 provider/model，违反唯一 selector、无自动 router/fallback 与费用授权边界。
2. Studio abort/deadline 只取消客户端读取；Gateway stream cancel 仅停止 enqueue，`ProductSession` 与 `OmpWorldAgent` 没有 abort port。页面离开或 timeout 后，真实模型请求、后续 world tool 与费用仍可能继续。要求把取消与 server absolute deadline 贯穿 HTTP → ProductSession → OmpWorldAgent/OMP，并回归证明 abort 后不再出现后续工具副作用/event。

## P2

`smoke:sdk` 使用 ambient default client；锁定 SDK 在 session construction 中可能执行 model-host `fetch.preconnect`。因此不得把它描述成“绝不触达 provider/network”，只能证明未发送 prompt/未完成 billed inference；应改成无 preconnect 的本地验证，或明确记录该 limitation。

## Evidence

- 指定本地 tests：34 pass / 0 fail；
- `git diff --check` 通过；
- product digest before/after 均为 `dc90a2482be303718554c13dba6b2ec2d923684bcf3f8fca2f04cc8aaf2a8867`；
- 未编辑文件、未读取 credential、未发送 provider prompt、未联网、未 build/typecheck/browser/commit/push/merge/deploy。
