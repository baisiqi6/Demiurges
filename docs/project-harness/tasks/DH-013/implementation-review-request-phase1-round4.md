# DH-013 Phase 1 Fresh Independent Review Request — Round 4

## Isolation / authority

只读审查 `/Users/Admin/projects/WorkTrees/Demiurges-DH-013`。唯一 review authority 是本文件；禁止读取任何 earlier review request/verdict、其他 reviewer 输出、current review/closeout packet。不得修改、联网、访问 Keychain/provider、install 或 Git mutation。只判断 Phase 1 能否进入 Phase 2。

## Frozen target

- branch `agent/codex/DH-013`
- HEAD/base `97761d6b5dba899fcb73b93ba830ba78f2980766`
- fixed-order full `shasum -a 256` text：

```text
b2406f994432e57f1488f885d6f2a6b8f44ea6067b127d430ec02d3f6a4b0df9  apps/agent-gateway/src/omp-world-agent.test.ts
921b49c771f57fe452f0ec41378d05bc7a0b0b53075a571750dbe4b952ba5d48  apps/studio/src/presentation-three/ThreeViewport.tsx
762ab8a93e2e3c5216317ca9f1b8f7abdf2cddf0a354b7e550022f96bf089283  packages/world/src/artifacts/ball-vessel-fixture.ts
06dac5456f9c8455fb24b7dd61cfa84ebc49777cc5a714017e507b3b23599a45  packages/world/src/artifacts/diagnostic-rigid-fixture.ts
24bfeb2efed6158e196a69a5e8f1eadcf269b64e1bd398625e8e998750d78ccc  packages/world/src/artifacts/marble-hunyuan-composite-fixture.test.ts
78568981e6626b49a6be72cb49da19bfaafbb9ab8a1749286174a0a707b93328  packages/world/src/artifacts/marble-hunyuan-composite-fixture.ts
7e26098c0dc783a876a153ac02774dec9897d0af54612983dde7829656f0f664  packages/world/src/artifacts/marble-hunyuan-registry.test.ts
bfc698d899667a26e7b0adca4b9467d8b690da2dd98f16a01eb0b0538050ab89  packages/world/src/artifacts/marble-hunyuan-registry.ts
d42f1764d34a15049649e36cb83f76fef13465d9c91c6103233659305802e402  packages/world/src/evaluation/evaluate-episode.ts
7c0c39fc020998df64000da73ad605cdf735b305ff8c8627ea26869f4a01c1aa  packages/world/src/host/runtime-mvp-adopt-policy.ts
6cac7186c27ce0fb99325535b645f07ace36b8f1ea6d4b06ec8d4dadacfd8900  packages/world/src/index.ts
20f45e7d7a5348865d410e9e7924b4c827d3e2531e9a8e7495f4a30f28b02582  packages/world/src/kernel/types.ts
176057db6a338db71310e3469e780dfcddff5725067bb33b7001e4a87fe4f895  packages/world/src/kernel/world.ts
eacea30280bbee04211887e3024e8db05f7ceeead30769430f5fa81f7301b842  packages/world/src/product-session-codec.ts
6059a2b88ae3b1a309d932a850e583c1e5a1eed3253852f5e9bb3002270332a6  packages/world/src/repository/world-repository.ts
7d6388f2131d0b8c99a8164a65d377c074f1ea96c40b25f2d68b19f5734e7f90  packages/world/src/runtime-mujoco/run-falling-cube.test.ts
d1cee03eafd83bb5dd740a20bbb1dae11ad6ecc8102c0e208d03d43f4e436535  packages/world/src/runtime-mujoco/run-falling-cube.ts
a987e071c1554d92cef7821372709415d5d2d43a45ff0191001bf61f833f1d1e  packages/world/src/world-tools/world-tool-contract.test.ts
6e4d2994954cab883818a82f599b5365c15f7b740bb891d01b898f2e6f54bf71  packages/world/src/world-tools/world-tool-contract.ts
5e55aa38fe005024307cd976e7f7998f96afba400eebd19b717ca5746dc56331  packages/world/src/world-tools/world-tool-surface.ts
```

- aggregate 是上述完整文本（含每行换行）的 SHA-256：`1cff9840fb08ac25c7d4a53415d5f802e8bde4000a0cee708aa6e5d95c93520e`
- 起止复算所有 identity 与 `git status --short`；漂移即 `blocked`。

## Mandatory probes

1. 对 composite floor `semantic.kind` 构造 ordinary 与 self-materializing getter；self getter 同步改写 root `schemaVersion` 并重定义自身。Repository 必须 getter reads=0、拒绝、Ref 未初始化。直接 `schemaVersion=999`、非法 root id/parent/source/scenario 也必须 fail closed。
2. 对 `runFallingCube` root Snapshot `id` 构造 ordinary 与 self-materializing getter；在读取任何 getter 前必须因 deep-frozen/plain-data admission 拒绝，reads=0。另验证 mutable/accessor Program/Profile/ExplicitInputs 同样不能在 admission 前被读取。
3. canonical composite Repository → MuJoCo deterministic Episode → Evaluation PASS → explicit adopt 仍通过；compiler seam 与 Runtime-direct `test-only-top-lid` 保持。
4. canonical projection/trusted projection/world_read event 正向通过；registry 133 mutations、composite 32 closure、manifest digest、旧 scenarios、四工具保持。
5. bounded fresh P0/P1 scan 后立即收口；不把 legacy Presentation P2 扩大成 Phase 2–4 工作。

## Gates

```bash
bun test packages/world/src/artifacts/marble-hunyuan-registry.test.ts packages/world/src/artifacts/marble-hunyuan-composite-fixture.test.ts packages/world/src/product-session-codec.test.ts packages/world/src/world-tools/world-tool-contract.test.ts apps/studio/src/presentation-three/entity-presentation.test.ts apps/studio/src/presentation-model.test.ts
bun test
bun run typecheck
bun run build
git diff --check
.artifacts/harness/harnessctl validate
```

Operator evidence：focused `297/0/427`，full `440/0/3282`，typecheck/build/diff/EXharness pass；build 只有既有 browser-external/chunk warnings。

```text
decision: approved | changes_requested | blocked
may_enter_phase2: yes | no
P0: ...
P1: ...
P2: ...
executed: ...
counterexamples: ...
frozen_identity_start_end: pass | fail
```
