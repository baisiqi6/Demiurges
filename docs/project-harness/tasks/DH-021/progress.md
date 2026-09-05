# DH-021 进度

## 2026-09-05

- 第二个真实 implementation 采用 registered `fixture:ball-vessel-v1` 的 static pose repair，与 DH-020 actuator candidate 不同；计划与独立审查均确认 P0/P1=0。
- Golden FAIL trace：ball pose `[1,0,1]`，`run:dh021-outside`；evidence `supportSamples=0`、`maxHorizontalOffsetMeters=0.964012481714438`、`maxFloorDistanceErrorMeters=0.0802513306515611`。
- planner 从 registered vessel rim frame 与 sphere radius 推导 frozen pose `[0,0,0.7]`；经既有 `world_edit → world_run → evaluate` 得 PASS，Ref 不由 run 推进。
- focused：3 tests / 10 assertions；全量回归首轮 `1178 pass / 1 transient fail`，失败用例 isolated rerun `1 pass`；typecheck/build/Harness validate 通过。
- proof 标记 `offline-derived`；不新增 generic registry、provider 依赖或自动 adopt。
