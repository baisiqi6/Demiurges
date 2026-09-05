# DH-020 进度

## 2026-09-05

- 计划收窄为 DH-019 golden first-fail 的 fixture-specific evidence→WorldProgram compiler，独立计划审查 P0/P1=0。
- 新增纯 planner `packages/world/src/authoring/derive-articulated-reach-repair.ts`：绑定 canonical read/run oracle、registered snapshot、Episode/Evaluation identity 与 runtime provenance，固定 elbow-down policy 和 15 位 rounding。
- candidate 只返回 frozen canonical Program；不写 Ref、不 adopt、不调用 OMP/provider/Keychain/network；第二次成功必须由既有 Runtime/Evaluation 证明。
- focused 联跑：8 pass / 0 fail / 35 assertions；全量 `bun test`：1176 pass / 0 fail / 9277 assertions（随后仅增加 assertion-only adversarial checks）；typecheck/build/Harness validate/diff-check 通过。
- proof 标记 `offline-derived`，DH-019 历史 receipt/hash 保持不变。
