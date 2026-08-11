# DH-007 Round 2 — GPT-5.6 Sol Max Executable Review

decision=changes_requested

## P0

无。

## P1

单一 model authority 仍未真正 fail closed。虽然 production 已通过 isolated Settings 关闭三项 retry/fallback，但锁定 OMP `17.2.12` 把 Fireworks `*-fast → base model` 作为独立 safety net：它绕过 `retry.enabled=false` 与 `retry.modelFallback=false`，先切换到 base model，再继续 turn。prompt 完成后的 identity check 只能事后发现漂移，不能阻止第二个 model 已收到推理。

要求：在 provider credential/model-call boundary 拒绝任何非 Human 授权 identity，或在 admission 阶段拒绝所有会触发不可关闭 intrinsic fallback 的 selector，并增加 executable regression。

## P2

无。

## Evidence

- 锁定 OMP `agent-session.ts:2866` 在标准 retry gate 前进入 Fireworks Fast fallback；
- `turn-recovery.ts:1573` 允许它绕过 `retry.enabled=false`，`:1692` 说明它独立于 `retry.modelFallback`；
- `turn-recovery.ts:1434` 会取得 base model credential、调用 model switch，随后继续 turn；
- `bun test`：80 pass / 0 fail / 429 assertions；
- product digest before/after 均为 `def0c72e9ccfc88066bcee572fd8b0e973afd6470c8c61888290a9d32f239480`；
- `git diff --check` 通过；HEAD 与 base 均为 `a570064a7292821166fd65f074577a22b0390c14`。

## Limitations

严格只读；未读取其他 Round 2 verdict 或 credential，未联网、未发送 provider/model prompt，未运行 build、typecheck、`smoke:sdk` 或 Chromium，未写文件、commit、push、merge 或 deploy。
