# DH-010 Phase 3 Authoring / MuJoCo Runtime Evidence

## Authority 与阶段边界

- Human authority：2026-08-11 明确授权进入 Phase 3；
- base：`22e288690937834135584d023e4140e26696f761`；
- branch：`agent/codex/DH-010`；
- 本阶段只实现唯一 model-facing contract 的 authoring migration、显式 Program、MuJoCo multi-entity compile/run 与 semantic contact evidence；
- 不实现 Phase 4 stable-inside Evaluation、closed AdoptPolicy registry、ball-vessel Product codec closure，也不进入 Phase 5 Studio visible slice；
- 未调用真实 provider，未执行 commit、push、PR、merge、tag、deploy、closeout 或 mark-done。

## RED → GREEN

Phase start focused RED：

```text
bun test packages/world/src/dh010-ball-vessel-contract.test.ts \
  --test-name-pattern 'MuJoCo Runtime|MuJoCo compiler|closed proxy'

0 pass / 3 fail
```

三个 failure 均来自 Runtime 只接纳 legacy `program:falling-cube`。Phase 3 完成后，独立的 Runtime/compiler/physical controls 为：

```text
bun test packages/world/src/dh010-ball-vessel-contract.test.ts \
  --test-name-pattern 'MuJoCo Runtime|MuJoCo compiler|wall-sensitive|Runtime-direct seam'

4 pass / 0 fail / 25 assertions
```

## Authoring 与 Program

- `program:free-fall-rigid-v1` 与 `program:free-fall-ball-vessel-v1` 成为两个 closed trusted Program；legacy `program:falling-cube` 已删除；
- `WorldToolSurface`、Host 与 OMP descriptors 共同消费唯一 `WORLD_TOOL_CONTRACT`：`write(fixtureId)`、`edit(expected,targetRef,frameRef,pose)`、`run(runId,programId)`；
- Repository 增加 task-neutral authored `editEntityPose`，旧 cube-height control method 只作为内部 DH-001～009 compatibility delegate，不再出现在 model-facing surface；
- wrong target、floor penetration、stale Ref 与 Program/scenario mismatch 均在 Runtime 前 fail closed；
- ball-vessel 经同一个 `write → read → edit` contract 到达 Host explicit Program run，产生 91-sample Episode；`run` 仍不推进 current ref。

## MuJoCo compiler 与 Episode

- falling-rigid 保持原 floor + dynamic box compiler、76-sample grid 与 landing regressions；
- ball-vessel compiler 生成一个 static vessel body，其中恰好包含 `base + 16 walls` geoms；ball 是一个 dynamic sphere；
- Snapshot 中 vessel 始终只有一个 `EntityRef`，compound `partKey` 只用于内部 compiler name，不进入 Episode；
- sample timestamp 来自受信 `sampleIndex / sampleRateHz` 网格，同时要求与 MuJoCo physics time 误差不超过 `1e-9`；3 秒 terminal sample 精确为 `3`；
- terminal Snapshot 只替换显式 Program target state，保持 visual/collision/semantic carrier 与 base lineage。

## Semantic contact evidence

Compiler 同时建立内部 geom-name → EntityRef owner map。每个 MuJoCo contact 按锁定 binding 的 `geom1/geom2/frame/dist` 折叠为 frozen public record：

```text
{ targetRef, otherRef, normalOnTargetWorld, penetrationMeters }
```

- public evidence 不包含 MuJoCo body/geom/contact ID 或 compound `partKey`；
- normal 是 finite dense unit world vector；方向按 `frame[0..2]` 从 geom1 指向 geom2 的 MuJoCo contract 转换为作用在 target 上的方向；
- penetration 使用 `max(0, -dist)`，必须 finite/non-negative；
- 每次 Embind `MjContact` accessor 都在读取后 `delete()`，model/data 继续在 `finally` 清理；
- canonical terminal sample 具有向上的 ball-vessel support normal；
- wall-sensitive control 从 `x=0.27m`、`vx=0.25m/s` 出发，真实产生 owner=`entity:vessel` 且水平分量 `>=0.8` 的 contact normal，证明 walls 参与物理；
- test-only top lid 只允许 Runtime-direct seam，Repository/write/fixture registry 均拒绝；它仍产生 completed 91-sample Episode、vessel contact 与高于 rim 的 terminal state，等待 Phase 4 Evaluation 明确判 FAIL。

## Full verification

```text
bun test
122 pass / 6 expected Phase 4 RED fail / 2751 assertions

bun run typecheck  # pass
bun run build      # pass，仅既有 Vite large chunk warning
git diff --check   # pass
```

剩余 6 个 failure 精确为：

1. stable-inside-vessel 0.5s/16-sample Evaluation happy path；
2. hovering / sidewall-only / transient support negatives；
3. duplicate/gapped timestamps 与 penetration bound；
4. completed closed-proxy Evaluation FAIL；
5. Host closed AdoptPolicy registry；
6. ball-vessel Product codec / contact evidence closure。

Smooth vessel artifact 未漂移：

```text
856788138ecc53d407827a0e67aa9977237dd914809316f8af992e8ee098cd92
```

## Phase 3 结论

Phase 3 已完成：第二个真实任务已经从同一四工具 authoring contract 进入显式 Program、真实 MuJoCo compound/sphere dynamics、multi-entity Episode 和 semantic contact/penetration evidence；walls 与 closed proxy 都由真实物理控制证明。下一阶段应只实现 Phase 4 的 Evaluation、AdoptPolicy registry 与 Product codec closure，不能用 Presentation 或 legacy parser 掩盖剩余 RED。
