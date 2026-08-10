# DH-006 Round 2 — Independent Cross-review Combined Verdict

## Decision

`changes_requested`

Kimi Code K3 Max 的静态 review 为 `approved`，但同时指出 runId producer 与 codec identity 上界不一致。GPT-5.6 Sol Max 在同一冻结 digest 上以 executable probes 证明该项会拒绝当前合法 MuJoCo evidence，并另外复现 settled-resync、plain-data admission、stale_ref identity 与 failed trace input 四类 P1。一个 approved 不能抵消可执行的 authority/transport 反例，因此 Phase 4 继续保持 `in_progress`，不得 `mark-done`、commit 或 push。

## Root-fix direction

本轮不增加 UI guard 或逐字段补丁，而是收紧三个根部契约：

1. **Settled authority recovery**：失败后 bounded follow-up resync，直到 Gateway 报告 `running: false`；若在预算内仍未 settled，则 fail closed，不把中间态伪装成最终完成态。
2. **Plain-data codec**：先用 property descriptors 投影为新建、无 accessor 的 JSON data graph，再验证业务语义；所有 array 必须 dense，拒绝 symbol、accessor、non-enumerable、extra property、非有限数值与预算超限。
3. **Producer-aligned identity and redaction**：移除错误的 256 字符派生 identity 上界，由整体 projection budget 限制；edit evidence 始终保持 ref/snapshot identity 且 Agent 只能 advance；failed product trace 不复制原始 input。

修复后必须新增对应 RED regressions，重跑 full gates与真实 Chromium acceptance，并在新 digest 上进行 fresh Round 3 cross-review。Round 1/2 verdict 永久保留。
