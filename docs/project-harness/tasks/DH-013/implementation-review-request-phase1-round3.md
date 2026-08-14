# DH-013 Phase 1 Fresh Independent Review Request — Round 3

## Isolation / authority

只读审查 `/Users/Admin/projects/WorkTrees/Demiurges-DH-013`。唯一 review authority 是本文件；禁止读取 Round 1/2 request/verdict、其他 reviewer 输出、current review/closeout packet。不得修改、联网、访问 Keychain/provider、build/install 或 Git mutation。只判断 Phase 1 能否进入 Phase 2。

## Frozen target

- branch `agent/codex/DH-013`
- HEAD/base `97761d6b5dba899fcb73b93ba830ba78f2980766`
- fixed-order full `shasum -a 256` text：

```text
b2406f994432e57f1488f885d6f2a6b8f44ea6067b127d430ec02d3f6a4b0df9  apps/agent-gateway/src/omp-world-agent.test.ts
921b49c771f57fe452f0ec41378d05bc7a0b0b53075a571750dbe4b952ba5d48  apps/studio/src/presentation-three/ThreeViewport.tsx
7502ec3069b26f4a9acd56dd9b4dfe1b8d28812380f821c0b4153337f4ac0294  packages/world/src/artifacts/ball-vessel-fixture.ts
06dac5456f9c8455fb24b7dd61cfa84ebc49777cc5a714017e507b3b23599a45  packages/world/src/artifacts/diagnostic-rigid-fixture.ts
f423332d505cc105dbb032c35d83b0706c1684491f5b5e621320c89c09ef287d  packages/world/src/artifacts/marble-hunyuan-composite-fixture.test.ts
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
fec2f66860afec5efe1366b6cdb230c16049a35babfeb20953feff241aac84b5  packages/world/src/runtime-mujoco/run-falling-cube.ts
a987e071c1554d92cef7821372709415d5d2d43a45ff0191001bf61f833f1d1e  packages/world/src/world-tools/world-tool-contract.test.ts
6e4d2994954cab883818a82f599b5365c15f7b740bb891d01b898f2e6f54bf71  packages/world/src/world-tools/world-tool-contract.ts
5e55aa38fe005024307cd976e7f7998f96afba400eebd19b717ca5746dc56331  packages/world/src/world-tools/world-tool-surface.ts
```

- aggregate 是上述完整文本的 SHA-256：`848b821573415337f85c47c88bed8613c7771c088c2e68ec0e8c595803915116`
- 起止复算所有 identity 与 `git status --short`；漂移即 blocked。

## Mandatory probes

1. canonical composite projection/trusted projection/world_read event 必须正向通过，合法 session 后 identity mutations 才分别 fail closed。
2. 对 Snapshot root `source/id/entities`、entity/representations/collision/observation、state Vec3、physics `bodyType/massKg/friction` 构造 ordinary 与 self-materializing getter；getter 内篡改此前字段。Repository 必须 reads=0、拒绝、Ref 未初始化；Runtime 继续 reads=0。
3. structural admission 必须在 Repository 的任何 `source/id/entities.some/collision.parts` 访问之前；但 DH-010 `test-only-top-lid` 仍得到 `Runtime-direct` repository error，Runtime-direct seam 仍可执行。
4. registry arrays extra/Symbol/accessor、manifest digest、133 mutations、32 closure、76-sample deterministic run/adopt、旧 scenarios、四工具保持。
5. bounded fresh P0/P1 scan后立即收口，不扩展 Phase 2–4。

## Gates

```bash
bun test packages/world/src/artifacts/marble-hunyuan-registry.test.ts packages/world/src/artifacts/marble-hunyuan-composite-fixture.test.ts packages/world/src/product-session-codec.test.ts packages/world/src/world-tools/world-tool-contract.test.ts apps/studio/src/presentation-three/entity-presentation.test.ts apps/studio/src/presentation-model.test.ts
bun test
bun run typecheck
git diff --check
.artifacts/harness/harnessctl validate
```

Operator evidence：focused `296/0/422`，full `438/0/3273`，typecheck/build/diff/EXharness pass。无需重复 build。

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
