# DH-013 Phase 1 Fresh Independent Review Request — Round 2

## Authority and isolation

只读审查 `/Users/Admin/projects/WorkTrees/Demiurges-DH-013`。唯一 review authority 是本 request；不得读取 Round 1 request/verdict、其他 reviewer 输出或 current review/closeout packet。不得修改文件、联网、访问 Keychain/provider、build/install、commit/push/merge。可运行 request 指定测试、typecheck、diff、EXharness 与 repo 外 bounded probes。

本轮只判断 Phase 1 core authority 是否可以进入 Phase 2，不审查尚未实现的 importer/cache/asset route/真实 Presentation。

## Frozen identity

- branch：`agent/codex/DH-013`
- HEAD/base：`97761d6b5dba899fcb73b93ba830ba78f2980766`
- fixed product file order 与逐文件 SHA：

```text
b2406f994432e57f1488f885d6f2a6b8f44ea6067b127d430ec02d3f6a4b0df9  apps/agent-gateway/src/omp-world-agent.test.ts
921b49c771f57fe452f0ec41378d05bc7a0b0b53075a571750dbe4b952ba5d48  apps/studio/src/presentation-three/ThreeViewport.tsx
fbaaf2a01c220619c7445f23e52e4001e033ea794447186545be7e39211cdef5  packages/world/src/artifacts/ball-vessel-fixture.ts
06dac5456f9c8455fb24b7dd61cfa84ebc49777cc5a714017e507b3b23599a45  packages/world/src/artifacts/diagnostic-rigid-fixture.ts
3c3d48347705382e628b0d8f1e4d7d1d6da6049416e62ae7b831d693285b50a3  packages/world/src/artifacts/marble-hunyuan-composite-fixture.test.ts
78568981e6626b49a6be72cb49da19bfaafbb9ab8a1749286174a0a707b93328  packages/world/src/artifacts/marble-hunyuan-composite-fixture.ts
7e26098c0dc783a876a153ac02774dec9897d0af54612983dde7829656f0f664  packages/world/src/artifacts/marble-hunyuan-registry.test.ts
bfc698d899667a26e7b0adca4b9467d8b690da2dd98f16a01eb0b0538050ab89  packages/world/src/artifacts/marble-hunyuan-registry.ts
d42f1764d34a15049649e36cb83f76fef13465d9c91c6103233659305802e402  packages/world/src/evaluation/evaluate-episode.ts
7c0c39fc020998df64000da73ad605cdf735b305ff8c8627ea26869f4a01c1aa  packages/world/src/host/runtime-mvp-adopt-policy.ts
6cac7186c27ce0fb99325535b645f07ace36b8f1ea6d4b06ec8d4dadacfd8900  packages/world/src/index.ts
20f45e7d7a5348865d410e9e7924b4c827d3e2531e9a8e7495f4a30f28b02582  packages/world/src/kernel/types.ts
176057db6a338db71310e3469e780dfcddff5725067bb33b7001e4a87fe4f895  packages/world/src/kernel/world.ts
eacea30280bbee04211887e3024e8db05f7ceeead30769430f5fa81f7301b842  packages/world/src/product-session-codec.ts
fec2f66860afec5efe1366b6cdb230c16049a35babfeb20953feff241aac84b5  packages/world/src/runtime-mujoco/run-falling-cube.ts
a987e071c1554d92cef7821372709415d5d2d43a45ff0191001bf61f833f1d1e  packages/world/src/world-tools/world-tool-contract.test.ts
6e4d2994954cab883818a82f599b5365c15f7b740bb891d01b898f2e6f54bf71  packages/world/src/world-tools/world-tool-contract.ts
5e55aa38fe005024307cd976e7f7998f96afba400eebd19b717ca5746dc56331  packages/world/src/world-tools/world-tool-surface.ts
```

- aggregate algorithm：保持上述完整两列文本、固定顺序与换行，对 stdout 再执行 `shasum -a 256`。
- expected aggregate：`6643485ff8622d4bf12dc774bb6d36b36c980c0cd8a3e37d9d2566821ad59818`

起止复算 branch、HEAD、全部文件 SHA、aggregate 与 `git status --short`；任一漂移立即 `blocked`。

## Mandatory remediation probes

1. 用合法 `session:local-*` 创建 canonical composite projection 与 `world_read` event，二者必须成功；不得因 session、shape 或 generated visual 提前失败。
2. 分别只改 environment observation 与 generated visual 的 `assetId/manifestDigest/calibrationId/witnessId`，codec 与 stream 必须在 canonical baseline 之后 fail closed。
3. registry 的 top-level arrays、nested `axisMap/rotation/translation/bounds/faceDeltas/proxy` arrays 加 extra string、Symbol、extra accessor；必须拒绝且 getter read count 为 0。index accessor、sparse、non-finite 继续拒绝。
4. composite Snapshot 的 `entities`、state Vec3、collision halfExtents 与 registered observation 加 extra string/Symbol/accessor；Repository/Runtime 必须拒绝且 getter read count 为 0。
5. manifest digest、133 mutations、32 closure families、MuJoCo proxy-only、76 samples、deterministic PASS、run 不推进/ref adopt、旧 scenario codec 与 exact four tools 继续成立。
6. bounded fresh P0/P1 scan；不要扩展后续 phase。

## Gates

```bash
bun test packages/world/src/artifacts/marble-hunyuan-registry.test.ts packages/world/src/artifacts/marble-hunyuan-composite-fixture.test.ts packages/world/src/product-session-codec.test.ts packages/world/src/world-tools/world-tool-contract.test.ts apps/studio/src/presentation-three/entity-presentation.test.ts apps/studio/src/presentation-model.test.ts
bun test
bun run typecheck
git diff --check
.artifacts/harness/harnessctl validate
```

Operator evidence：focused `295/0/415`，full `437/0/3266`，typecheck/build/diff/EXharness pass。Reviewer 独立执行上列 gates；无需 build。

## Verdict

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

任何 P0/P1、target drift、canonical positive fail 或 accessor read 都必须 `may_enter_phase2=no`。
