# DH-010 Phase 2 Artifact / Representation Evidence

## Authority 与阶段边界

- Human authority：2026-08-11 明确授权继续实现；本 checkpoint 只执行 canonical plan 的 Phase 2；
- base：`22e288690937834135584d023e4140e26696f761`；
- branch：`agent/codex/DH-010`；
- canonical plan SHA-256：`2738b3135434507dd5b53aea74bb87e45af21912fa72789a7b1096ca33ffa21a`；
- 本阶段不进入 Phase 3 MuJoCo multi-entity Runtime、Phase 4 Evaluation/Product codec closure 或 Phase 5 Studio visible slice；
- 未调用真实 provider，未执行 commit、push、PR、merge、tag、deploy、closeout 或 mark-done。

## Deterministic vessel artifact

`scripts/generate-smooth-vessel-glb.mjs` 使用固定 profile-of-revolution 与 Three.js `LatheGeometry` 生成 repo-owned smooth vessel。连续两次运行均产生完全相同的 bytes：

```text
asset: packages/world/assets/smooth-vessel-v1.glb
bytes: 26256
sha256: 856788138ecc53d407827a0e67aa9977237dd914809316f8af992e8ee098cd92
generator sha256: 0b600eded75a33e42cbaa8623b5ed8c8b6428f1c731ef188543bee9565b94693
```

Artifact registry 同时冻结 provenance、source frame、units、local transform、bounds、64 radial segments、585 vertices 与 3,072 indices。digest、byte length、bounds 或 provenance drift 均 fail closed。

## Closed representations 与 canonical Snapshot

- `VisualRepresentation` 增加 bounded sphere；
- `CollisionRepresentation` 变为 closed `box | sphere | compound` union；
- compound vessel 固定为一个 base 与 16 个 wall parts，每个 part 只有 entity-local `partKey` 与 local pose，不获得 `EntityRef`；
- `SemanticRepresentation` 只增加 `null | vessel`，vessel carrier 冻结 `frame:vessel-rim-center`、inner envelope 与 local pose；
- canonical fixture 精确包含 `entity:floor`、`entity:vessel`、`entity:ball`，vessel 始终只有一个语义 Entity；
- task-local transform 统一为 `worldPose = entityPose ∘ localPose`，translated + yaw off-axis probe 已覆盖；
- Repository insertion 复用 representation integrity validator，拒绝 sparse/accessor/symbol/prototype/extra-key/non-finite pose、非单位 quaternion、duplicate/unknown part 与 artifact/semantic drift。

Phase 2 没有让 renderer 假装支持新 representation：Studio Presentation 对 sphere 与 compound imported Presentation 仍明确 fail closed，等待 Phase 5 正式实现。

## Verification

定向测试：

```text
bun test packages/world/src/artifacts/ball-vessel-fixture.test.ts \
  packages/world/src/artifacts/diagnostic-rigid-fixture.test.ts \
  packages/world/src/repository/world-repository.test.ts \
  packages/world/src/product-session-codec.test.ts

21 pass / 0 fail / 2197 assertions
```

全量测试：

```text
bun test
110 pass / 14 fail / 2705 assertions
```

相对 Phase 1，5 个新增 Phase 2 artifact/representation tests 与 2 个既有 RED contract 已转绿；剩余 14 个 failure 继续精确落在未进入的 Phase 3/4：MuJoCo ball Program/multi-entity/contact evidence、stable-inside-vessel Evaluation、closed-proxy completed negative、closed AdoptPolicy registry、ball-vessel Product codec，以及 Host/Gateway/OMP/tool contract migration。没有既有 DH-001～009 regression failure。

非测试门禁：

```text
bun run typecheck  # pass
bun run build      # pass（仅既有 Vite large chunk warning）
git diff --check   # pass
```

## Phase 2 结论

Phase 2 已完成且边界保持：真实曲面 visual artifact、sphere/compound/semantic closed representations、单一 vessel Entity、canonical floor/vessel/ball Snapshot 与 local-to-world transform 已形成可执行基础；下一阶段应进入 Phase 3，让同一受信 Snapshot 经显式 Program 编译为 MuJoCo multi-entity Episode。当前证据不宣称 Runtime、Evaluation、Product Session 或 visible slice 已完成。
