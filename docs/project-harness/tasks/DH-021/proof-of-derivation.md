# DH-021 推导证明

状态：`offline-derived`；整体 checkpoint 仍为 `offline-proven`。

- Golden first input（normalized deterministic digest，非来源认证）：球体先被编辑到 `[1,0,1]`，`run:dh021-outside` 产生 `FAIL`。
- Evidence：`supportSamples=0`、`maxHorizontalOffsetMeters=0.964012481714438`、`maxFloorDistanceErrorMeters=0.0802513306515611`。
- Candidate：从 registered vessel rim frame 与 sphere radius 推导 frozen pose `[0,0,0.7]`；candidate pose digest `2202043e08d2a6c77b72bdeeeecc516b3fa9a6f0fdd1a6ac9309faa8b6fa111e`。
- Verification：通过既有 `world_edit` 产生 v3 Snapshot，再以 `run:dh021-centered` 重放；Evaluation `PASS`，`supportSamples=16`、`maxHorizontalOffsetMeters=0.0317456944096586`、`maxFloorDistanceErrorMeters=0.000216440462752696`；两次 run 均不推进 Ref。
- provider calls：`0`。候选本身不代表成功，成功只来自第二次 Runtime/Evaluation。
