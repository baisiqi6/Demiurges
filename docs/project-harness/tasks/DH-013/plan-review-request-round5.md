# DH-013 Plan Review Request — Round 5 Final Gate

## Isolation and output

Fresh independent read-only review。只读本 request、current `plan.md` 与下列 frozen stable docs/source；禁止 earlier request/verdict/cross-review、findings/progress、OMP session、其他 reviewer 输出。禁止写入、联网、Keychain/provider、build/install、Git mutation。

输出 `decision`、`may_implement`、P0/P1/P2、A–D PASS/FAIL、命令、start/end identity。P0/P1=0 且 A–D 全 PASS 才批准。不要扩大为实现审查或未来平台设计。

## Frozen identity

- Worktree `/Users/Admin/projects/WorkTrees/Demiurges-DH-013`
- Branch `agent/codex/DH-013`
- HEAD/Base `97761d6b5dba899fcb73b93ba830ba78f2980766`
- Product source 相对 base 零修改；baseline `172/0/2958`。

```text
06a72595083005fdb7c70dd250d7a0ba7a870b10031865d634ae6e812edcb23e  docs/project-harness/tasks/DH-013/plan.md
a335dafd9d996f7bf15346890d3056333f3a9efaec98df3820d69cd5360b20c4  docs/project-harness/scope.md
1701548340dec0dc4b7ed17d884e7418b76377850b4f7dc3d207e1259c510b70  docs/project-harness/architecture.md
b43bce3384171920fdd34175c9644413ab4840a98d4e597e9cf0fe73c7590b3b  docs/project-harness/domain-model.md
877f58e2876e2286d68ef4e414057b64e04660d12482c6e080e3f873cb218ec1  apps/studio/src/presentation-three/ThreeViewport.tsx
29ef224b60cbac7c549d9287806679aa67229cd579462f3ce2e87aceaddd383e  packages/world/src/artifacts/diagnostic-rigid-fixture.ts
8ee932113a956746ea687e88fa327a965b740a6855fb8825a4d39d72a3dcd724  packages/world/src/product-session-codec.ts
e0ae8c36891dbdad4188a8acbfc0abb9828e6cd461777d2ecc55195f2cf94b43  apps/agent-gateway/src/product-session-api.ts
```

起止逐项复算 branch/HEAD/hash/status。

## Mandatory A — Exact all-member witness families

- mutation algorithm exact：numeric leaf `+0.001`；axis string exact tampered value；digest/id/ref/kind/pass/tolerance replacements exact；
- Marble left/right digest、calibration id、axisMap/rotation/translation/scale、sourceBounds min/max all axes、targetBounds min/max all axes、faceDeltas/measured/passed/tolerance 全部成员强制执行；
- Hunyuan digest/calibration/axisMap/rotation/translation/scale/sourceBounds/targetBounds/proxy/ref/kind/center/halfExtents/measured/passed/tolerance 全部成员；
- floor digest/calibration/axisMap/rotation/translation/scale/sourceBounds/targetBounds/proxy/ref/kind/center/halfExtents/topZ/calibratedMinZ/measured/passed/tolerance 全部成员；
- 每个成员在 Repository/Runtime/codec/stream 对应 seam fail closed，不能抽样或只降 UI。

## Mandatory B — Exact all-member composite closure families

- scenario relabel 四个 exact replacements 全部执行；
- 三个 exact duplicate-ref mutations 全部执行；
- base/edit parent lineage 两项；Episode base、terminal parent/scenario/ref、Evaluation episode 五项；current ref name/version/snapshot 三项；
- environment observation/visual、floor、generated visual/collision 列出的每个 representation field mutation 全部执行；
- 每项有确定 replacement 与适用 Repository/Runtime/result/codec/stream-client seam；generic guard 不能替代 fixture evidence。

## Mandatory C — No regression of authority plan

High-risk provider/secret boundary、raw Hunyuan Authorization、manifest-only authority、三条 literal CalibrationRecord、三类 exact witness、`1e-12` derived-transform epsilon、exact scenario/refs、run/adopt、四工具、Presentation non-authority 均保持。

## Mandatory D — Scope and deliverability

Phase 1 能据此直接写 RED tests；不引入 provider SDK/cloud/marketplace/auto-ground/mesh decomposition/Range/HQ framework；产品 source 仍冻结。
