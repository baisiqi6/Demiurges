# DH-010 Phase 3 Working Notes

## 2026-08-11 — Phase start

- Human authority：进入 Phase 3；不进入 Phase 4 Evaluation/Product codec closure、Phase 5 Studio，也不 commit/push。
- active item/lease：`DH-010`，owner `codex`，session `dh010-phase1-20260811`；开始检查时 lease 仍有效。
- Phase 2 已提供 canonical floor/vessel/ball Snapshot、sphere collision、`base + 16 walls` compound collision 与 vessel semantic carrier。
- 当前 Runtime 入口仍为 `runFallingCube`，Program admission 固定 falling-rigid，MJCF 与 observation 固定 floor + one dynamic box；Episode sample 只有 aggregate `contactCount`。
- 既有 Phase 1 RED 已冻结 ball-vessel Program、91-sample multi-entity Episode、semantic EntityRef-pair contact、finite penetration 与 closed-proxy completed run 的期望。
- Phase 3 最小根部改动：让同一 Runtime 根据受信 explicit Program/fixture role 编译两种 closed scenario；不建立 Runtime plugin、任意 MJCF authoring、第四 fixture 或第五工具。

## Source findings

- `WorldProgram` 已是 task-neutral `{id, kind, targetRef, durationSeconds, sampleRateHz}`；真正的偶然性集中在 Runtime 的单一 `PreparedRun.floor/cube`、固定 Program 常量、box-only compiler 与 qpos/qvel index 读取。
- 当前 Episode sample record 只有 `timeSeconds/states/contactCount`。Phase 3 需要增加 frozen public `contacts[]`，其中只含 `targetRef/otherRef/normalOnTargetWorld/penetrationMeters`；不能泄漏 MuJoCo geom ID 或 compound `partKey`。
- canonical fixture 的 vessel 是 static compound：base 在 local z=0.04，16 walls 位于半径 0.45、local yaw、中心 z=0.365；ball 是 dynamic sphere，初态 `[0.12,0,1.25]`，linear velocity `[-0.08,0.04,0]`。
- Phase 1 Runtime RED 要求 3 秒、30Hz、91 samples、每个 sample 精确包含 floor/vessel/ball；terminal sample 必须包含 ball-vessel semantic contact。
- 旧 Runtime tests 冻结 falling-rigid 的 76-sample grid、contact event timing、artifact/observation independence、input plain-data、identity encoding 与 cleanup，Phase 3 不能改变这些事实。
- MuJoCo dependency 固定为 `@mujoco/mujoco@3.11.0`，Bun workspace symlink 位于 `packages/world/node_modules/@mujoco/mujoco`；contact extraction 必须依据该锁定 binding 的公开 typed-array layout 实现并由真实 WASM test 验证。
- 3.11.0 binding 提供 `data.contact.get(index)` 的 `MjContact`（`geom1/geom2/frame/dist`）以及 `model.geom(id|string)`；因此 owner map 可在 compiler 同时登记稳定 geom name，再于模型加载后解析 geom ID，contact public evidence 使用 `max(0, -contact.dist)`，无需把内部 ID 写入 Episode。
- MuJoCo 官方 `mjContact` contract 明确：`frame[0..2]` 是 world-space normal，方向从 `geom1` 指向 `geom2`，`dist < 0` 表示 penetration。因此对 target geom 的法向为：target 是 geom1 时取负，target 是 geom2 时取正；随后重新校验 finite、unit norm。
- `WORLD_TOOL_CONTRACT` 的 frozen parser 已完成 exact write/edit/run input，但 `WorldToolSurface` 仍维护第二套 legacy parser，Host 仍固定旧 Program，Repository 仍只有 cube-height edit。Phase 3 应让 Surface 直接消费唯一 parser，并新增 generic pose edit；ball Evaluation 仍留给 Phase 4，不能以 landing evaluator 伪装完成。
- Phase 1 的 Product codec RED 仍使用 legacy surface 只为构造旧 projection；迁移 surface 后需要同步这个 seed 调用，否则它会因正确删除 legacy shape 而在 codec assertion 之前失败。
- Embind `MjContact` 是 `ClassHandle`，每次 `data.contact.get(index)` 返回的 accessor 必须在读取后 `delete()`；否则即使 model/data cleanup 正确，也会为逐 sample contact extraction 引入新的 WASM wrapper leak。
- Repository 的 immutable child/ref CAS 逻辑已足够；需要的根部泛化只是把 `editCubeHeight` 的 authored-child 核心提为 `editEntityPose`，legacy height 方法改为薄委托以保护 DH-001–009，而不是复制 ball 专用 edit path。

## Errors encountered

- First GREEN run：MuJoCo 累加 time 在 terminal 得到 `3.000000000000044`，与 contract 的 exact 30Hz sample grid 不一致。修复为 sample timestamp 由 `sampleIndex / sampleRateHz` 产生，同时要求与 `data.time` 误差不超过 `1e-9`；不修改 physics time 或 contact event time。
- closed-proxy focused test 已完成 Runtime run，但旧 landing evaluator 对 vessel contract 产生 non-finite height error；这是预期的 Phase 4 RED，不在 Phase 3 伪修复。
- Repository generic edit 首次机械 patch 因 import context 与实际文件不一致而未应用、未产生 partial write；改为按真实 source 分段 patch，不重复同一失败操作。
- OMP duplicate schema cleanup 首次 patch 假设 `toolSchema` 返回 readonly/frozen record，与实际旧 helper 签名不符，未产生 partial write；重新读取精确函数后按真实文本删除。
- OMP test migration 的一次 `rg` 检查命令因 zsh 将查询中的 backtick 解析为未闭合 command substitution 而失败；没有写入，改用不含 backtick 的单引号 pattern。
- Surface contract 第一次回归暴露 wrong-target edit 透出了 Repository 的“Entity 不存在”错误，而批准的边界要求在 Host 报 `scenario 不匹配`。修复为 Host 在 mutation 前以 current Snapshot 的 exact target set 做 scenario gate；随后 contract suite 5/0。
- First full suite：100 pass / 28 fail。6 个是明确留给 Phase 4 的 evaluator/adopt/codec RED；其余 22 个不是产品能力回退，而是 DH-001–009 tests、scripted ProductSession 与 OMP descriptor/fake turns 仍调用已删除的 legacy `cubeHeight`/run-only shape。Phase 3 必须迁移这些真实 consumers 到唯一 contract，不能恢复兼容 parser。
- ProductSession scripted client 与 OMP tool descriptors 已改为直接消费 `WORLD_TOOL_CONTRACT` 的 fixture/nested pose/explicit Program；旧 `toolSchema/refSchema` 副本已删除。world-surface 与 product-codec regression fixtures 正同步到同一输入，不增加 legacy fallback。
- Migrated consumer gate：56 pass / 1 fail；唯一 failure 是旧 Product codec test 仍期望 512-char runId，而 frozen model-facing contract 明确最大 68 chars（本 fixture 合法 runId 为 64）。更新 assertion 为 64，不放宽 parser。

## RED evidence

```text
bun test packages/world/src/dh010-ball-vessel-contract.test.ts \
  --test-name-pattern 'MuJoCo Runtime|MuJoCo compiler|closed proxy'

0 pass / 3 fail
```

三个 failure 均因 `prepareRun` 仍只接纳 `program:falling-cube`，不是 loader、type 或 fixture 错误；分别冻结 ball Program/multi-entity contacts、exact base+16 walls compiler 与 Runtime-direct closed proxy 三个 Phase 3 行为。

## First GREEN checkpoint

```text
ball-vessel Runtime + compiler: 2 pass / 0 fail / 18 assertions
existing MuJoCo falling-rigid suite: 16 pass / 0 fail / 138 assertions
WORLD_TOOL_CONTRACT migrated surface: 5 pass / 0 fail / 23 assertions
```

Runtime-direct closed proxy 已越过 compile/run 并产生 completed Episode；其最终 Evaluation FAIL 仍保持 RED，等待 Phase 4 evaluator。

## Physical controls

- authored ball-vessel world 已经同一个 `write/edit` contract 到达 Host 的显式 ball Program，91-sample Episode 成立；model-facing tool 数量未增加。
- test-owned wall-sensitive 初态从 `x=0.27m` 以 `vx=0.25m/s` 向外运动，Episode 中观察到 owner=`entity:vessel` 且水平分量 `>=0.8` 的 contact normal，证明 wall geoms 实际进入物理，而不仅是 XML 数量断言。
- test-only top lid 只经 Runtime-direct seam 运行，得到 91-sample completed Episode、ball-vessel semantic contact 且 terminal ball 高于 rim；Phase 4 将负责据此明确评测 FAIL。

## Final Phase 3 gate

```text
122 pass / 6 expected Phase 4 RED fail / 2751 assertions
typecheck: pass
build: pass
diff-check: pass
vessel GLB digest: 856788138ecc53d407827a0e67aa9977237dd914809316f8af992e8ee098cd92
```

Lease 以同一 owner/session 正常续租，事件 `evt-20260811T131447Z-cf23f5ad`；无 force/override。
