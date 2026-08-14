# DH-015 Plan Review — Round 3

## Reviewers

1. `gpt-5.6-sol`，max reasoning，Codex sub-agent：`/root/dh015_plan_review_sol_r3`
2. OMP `deepseek/deepseek-v4-pro`，thinking `max`：session `01a0014c-3064-7000-b8dd-2ff414ab6d26`

两位 reviewer 均确认 frozen branch、HEAD、plan SHA、24-file aggregate 与 Git status 起终一致，且只读、互相隔离。

## Combined decision

- `decision: changes_requested`
- `may_implement: no`
- P0：0
- P1：1 个共同 finding

## P1 — human edit admission 太晚

human write 已限定 composite fixture，但 human edit 只经过 generic `WorldEditInput` parser 后直接进入 generic `WorldToolSurface.edit`。Agent 若已创建 primitive、ball-vessel、articulated 或 imported/diagnostic world，human route 仍能先推进服务端 Ref；Studio decoder 事后拒绝 response 不能撤销 mutation。

计划修订为：取得共享 reservation 后、mutation 前验证 current scenario、target、change kind/frame。只有 exact Marble/Hunyuan composite 的 generated-object world-frame pose edit 可进入 surface；empty 与所有非 composite/wrong target/change 稳定、零副作用 fail closed。transition decoder 同时要求 prior/returned 均为 composite，且 child pose 与 parsed input 精确一致。

## P2 absorbed before Round 4

- operation-aware decoder 的 closed operation record 明确携带 shared parser 的 parsed result；
- decoder tests 增加 child pose 与 parsed input 不一致反例；
- pose numeric envelope 从 `world-tool-contract.ts` 导出单一 helper，fixture 与 parser 共用，禁止复制范围。

## Round 4 gate

先完成 workflow mutation，再冻结新 manifest；两位 fresh reviewer P0/P1 为 0 才批准实现。
