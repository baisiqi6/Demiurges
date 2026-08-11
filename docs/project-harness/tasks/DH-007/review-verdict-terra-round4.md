# DH-007 Round 4 — GPT-5.6 Terra Max Closure Review

decision=changes_requested

## P0

无。

## P1

正常成功 turn 没有关闭 tool authority。当前 closure 只检查外来的 owning Request signal；正常 completed path 不会 abort 该 signal。fake port 可在 `turn.completed` 后保留 `world_write`，用 fresh signal 写入世界并触发 observer，使 `running:false` 的已终结 ProductSession 获得新的 world 与 event。

要求：每个 `OmpWorldAgent.run()` 必须拥有内部 terminal-close capability；外来 signal 只能触发关闭，不能定义 capability 的完整生命周期。内部 capability 必须在 success、failure、abort 全部 terminal path 永久关闭，并增加 normal-completion late-call regression。

## Evidence

- no-network API fake-port probe：`turn.started, turn.completed` 后 late write `succeeded`；projection 从 `world:null,lastSequence:2` 变成 `hasWorld:true,lastSequence:3`；
- product digest before/after：`678d6811d35dfcac1bdacda922c792b8772d1df21cec5fe7728360d307c8f17c`；
- targeted：30 pass / 0 fail / 152 assertions；现有 late-call regression 只覆盖 abort path；
- provider session affinity、pinned credential、compaction/context settings、returned `running:false` 已关闭。

## Limitations

严格只读；未读取 credential、未联网、未发送真实 provider/model prompt、未运行 smoke/build，也未读取 Sol Round 4 输出。
