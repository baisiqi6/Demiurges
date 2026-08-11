# DH-007 Round 2 — GPT-5.6 Terra Max Executable Review

decision=changes_requested

## P0

无。

## P1

1. `Settings.isolated` 只关闭 OMP 的 turn recovery，未关闭 `pi-ai` provider driver 自有的 auth retry。默认 `ModelRegistry` resolver 在 auth/usage failure 时可以调用 `AuthStorage.rotateSessionCredential()`，从而把同一 logical operation 切换到 sibling credential；这违反本轮冻结 gate 中“不得使用第二 credential”的 authority。
2. Gateway absolute timeout 只传到了 `promptAndWait`。`OmpWorldAgent.run()` 对 `client.start()` 与 `client.stop()` 仍直接 await；若任一 lifecycle phase 不协作或永久悬挂，HTTP turn 不会 bounded settle，ProductSession 也无法在 `finally` 恢复 `running:false`。

要求：通过 OMP 的 `getApiKey` seam 将一次 turn 固定到初始 credential，并让 refresh/rotation fail closed；同时使同一 absolute abort authority 覆盖 `start/prompt/stop`，增加 ignoring-signal/hanging lifecycle executable regressions。

## P2

无。

## Evidence

- 锁定 OMP `config/api-key-resolver.ts:53-80` 在 last-chance auth failure 时旋转 sibling credential；
- 锁定 `pi-ai/src/stream.ts:1041-1144` 有独立于 OMP Settings 的 provider auth retry loop；
- 当前 `omp-world-agent.ts` 的 `start()` 与 `stop()` port 不接收 signal，`run()` 也未对这两段做 abort race；
- `bun test`：80 pass / 0 fail / 429 assertions；
- product digest before/after 均为 `def0c72e9ccfc88066bcee572fd8b0e973afd6470c8c61888290a9d32f239480`。

## Limitations

严格只读；未读取 credential、未发送真实 provider/model prompt、未联网、未写 product source 或 repo-local verdict。
