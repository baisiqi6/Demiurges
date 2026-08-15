# DH-016 Plan Review Round 5 — Sub-agent

- decision: `changes_requested`
- may_implement: `false`
- P0: `0`
- P1: `1`
- P2: `0`

## P1 — 全局 Idempotency-Key 缺少全局 durable admission

project-local `.write-lock` 无法阻止同一 `operationId` 同时绑定两个不同 Project，或跨 Save、Artifact publish 与 bundle import 重用。单个 writer 进程内部的并发请求可以各自在不同 Project durable admit 并产生两个业务副作用，而最终 result/receipt 只能表达一个 binding。

要求：在任何 Project lock、Artifact CAS 或 bundle publish 前，先以 `operationId` 在 Data Root 全局命名空间原子 no-replace 发布完整 durable intent；exact binding 才可 replay，不同 binding 必须在业务 mutation 前返回 `OPERATION_BINDING_CONFLICT`。进程内 keyed mutex 只能优化，不能成为 authority。

## Frozen identity

- branch: `agent/codex/DH-016`
- HEAD: `0efcef3a531c192410cdabcd62cf736e54404313`
- plan: `a5e9fe7da2983bf18bce0d887e11079f48bf4b09a203ae12755882b93cd5de73`
- ordered aggregate: `4c2c41ef5460bb2eb28934bcc4e816783824588bab6db8766d11d001642b4eb5`
- start/end 无漂移；全程只读，无 build/install/network/provider/Git mutation。
