# DH-021 计划：Ball-Vessel Evidence-Derived Pose Candidate

## 定位

这是第二个真实 authoring implementation，用来验证 evidence→candidate 边界是否需要抽象。它针对已登记 `fixture:ball-vessel-v1`，从失败的 stable-inside-vessel Evaluation 与同一 authored Snapshot 推导一个静态 ball pose edit；不做通用 planner、轨迹优化或自动 adopt。

## 目标

固定 golden trace：write ball-vessel → edit ball 到 `x=0.6,y=0,z=1.25` → free-fall run FAIL → 读取 `maxHorizontalOffsetMeters` 等 evidence → 生成 ball pose candidate `{x:0,y:0,z:0.7}` → 通过现有 edit/run/evaluate 得到 PASS。candidate 只返回 frozen edit proposal，不直接写 Host/Ref。

## 边界

- 输入绑定同一 `world_read` ref/snapshot 与 first `world_run` Episode/Evaluation golden digest（该 digest 绑定 runtime provenance/content，但不声称来源认证）；目标位置只来自 registered vessel rim frame 与 sphere radius。
- 只接受 `evaluator:stable-inside-vessel-v1`、`success:stable-inside-vessel` 的 `passed=false`；校验 golden run digest、Episode identity 与 runtime provenance。
- 输出 `WorldEditChange` pose proposal，复制 current ball rotation/frame，使用 registered vessel rim frame center 加 sphere radius/2 的 z offset；再由 `WorldToolSurface.edit` admission 产生 Snapshot。
- 不新增第五个 world tool、schema、public generic RepairStrategy/SDK、provider/OMP/Keychain/network；不自动 run/adopt。
- candidate 本身不代表成功，必须由第二次 free-fall Runtime/Evaluation 证明。

## 验收

1. golden FAIL evidence 推导唯一 frozen pose candidate，same bytes replay identical；
2. candidate 经既有 edit→run→evaluate 得到 PASS，Ref 仅按现有 authority 变化且未自动 adopt；
3. forged Evaluation/Episode/baseRef/snapshot、wrong scenario/contract、altered pose/goal digest 均 fail closed；
4. proof 记录输入 digest、candidate digest、second PASS metrics、Ref 状态、provider calls=0，并标记 `offline-derived`；
5. 与 DH-020 对照后，只在两个真实实现都需要时提取最小 candidate union boundary，不提前建立 registry/SDK；
6. focused/full tests、typecheck/build、Harness validate 通过。

## 非目标

不做通用 IK/运动规划、候选搜索、训练/记忆/benchmark、多候选 UI、live model 调度或自动 adopt。
