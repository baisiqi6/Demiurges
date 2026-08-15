# DH-016 Plan Review Round 6 — Sub-agent

- decision: `changes_requested`
- may_implement: `false`
- P0: `0`
- P1: `1`
- P2: `0`

## P1 — same-binding 并发缺少唯一执行者

Global intent 能唯一绑定 `operationId`，但不能阻止同 key + 同 binding 的两个live request同时执行。两者都可验证exact intent/lock并进入candidate publish，违反same-key replay零二次mutation。

要求mandatory per-operation single-flight：leader是唯一live executor，follower只等待/重放；project lock exact binding不授予follower执行权；Artifact CAS必须atomic no-replace。

Frozen identity：

- branch `agent/codex/DH-016`
- HEAD `0efcef3a531c192410cdabcd62cf736e54404313`
- plan `fbf82a1a42fc631a1f38dcb1125474ca54a85eab0d5acd11d7ef29093b4bdff9`
- aggregate `e688c2195d3fec7302d59e3e0023ec9b55ff9b586908d5fd1c4ff3238387bee7`
- start/end无漂移；全程只读。

