# DH-008 Round 2 Cross-review Verdict

## Decision

`changes_requested`

Sol Max 在 digest `f20e0fc96472615433778fdc0475cb59a0f9a7b17df1ccbf19af9a7edd268910` 上批准 Round 1 六项 remediation，P0/P1/P2 均无；Terra Max 独立确认原 blocker 已关闭，但发现一个邻近 Snapshot lineage P1：`terminalSnapshot.id` 可被伪造成与 base Snapshot 相同，导致同一 immutable identity 同时代表 authored base 与 runtime terminal record。

Terra 的 JSON round-trip executable probe `terminal-id-equals-base-id` 在修复前被接纳；因此 combined verdict 以可执行 P1 为准，不能因 Sol approved 关单。Terra 另记录 UI source-label P2：若 Episode state 缺失，viewport 会隐藏实体且 Inspector 不回退，但来源仍标记 `episode-frame`。

## Remediation

- Product codec 明确拒绝 `terminalSnapshot.id === baseSnapshot.id`；新增对应 regression；
- Studio 仅在当前 selected Entity 确有 active Episode state 时显示 `episode-frame`，否则显示 `episode-state-unavailable`；
- full gate 为 98 tests / 0 fail / 523 assertions，typecheck、production build 与 `git diff --check` 通过。

新 candidate digest 为 `7879c0cf637ea64092daebc4c51fe4cb32422cfc160b52b9e11268dd39aec5f7`，需要 fresh focused Round 3 review。Round 1/2 历史 verdict 均永久保留。
