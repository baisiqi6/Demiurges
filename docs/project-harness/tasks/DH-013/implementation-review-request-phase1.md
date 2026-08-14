# DH-013 Phase 1 Fresh Independent Review Request

## Authority

只读审查 `/Users/Admin/projects/WorkTrees/Demiurges-DH-013`。不得修改文件、联网、访问 Keychain/provider、build/install、commit/push/merge。可以运行现有测试、typecheck、`git diff --check`、EXharness validate，以及 repo 外 bounded read-only probes。

本轮只评审 Phase 1 core authority；operator importer、verified cache、Gateway asset route、Spark/GLTF Presentation 与真实 Chromium 尚未实现，不应因尚未完成后续 phase 而阻断本轮，但也不得把它们误报为已完成。

## Frozen identity

- branch：`agent/codex/DH-013`
- base/HEAD：`97761d6b5dba899fcb73b93ba830ba78f2980766`
- fixed product file order：
  1. `apps/agent-gateway/src/omp-world-agent.test.ts`
  2. `apps/studio/src/presentation-three/ThreeViewport.tsx`
  3. `packages/world/src/artifacts/ball-vessel-fixture.ts`
  4. `packages/world/src/artifacts/diagnostic-rigid-fixture.ts`
  5. `packages/world/src/artifacts/marble-hunyuan-composite-fixture.test.ts`
  6. `packages/world/src/artifacts/marble-hunyuan-composite-fixture.ts`
  7. `packages/world/src/artifacts/marble-hunyuan-registry.test.ts`
  8. `packages/world/src/artifacts/marble-hunyuan-registry.ts`
  9. `packages/world/src/evaluation/evaluate-episode.ts`
  10. `packages/world/src/host/runtime-mvp-adopt-policy.ts`
  11. `packages/world/src/index.ts`
  12. `packages/world/src/kernel/types.ts`
  13. `packages/world/src/kernel/world.ts`
  14. `packages/world/src/product-session-codec.ts`
  15. `packages/world/src/runtime-mujoco/run-falling-cube.ts`
  16. `packages/world/src/world-tools/world-tool-contract.test.ts`
  17. `packages/world/src/world-tools/world-tool-contract.ts`
  18. `packages/world/src/world-tools/world-tool-surface.ts`
- aggregate algorithm：对上述固定顺序逐文件执行完整 `shasum -a 256 <path>`，保持原始两列文本与换行，再对该完整 stdout 执行 `shasum -a 256`。
- expected aggregate：`4efe0e7f170f99e6c4f486f1bc47935641877e0d246d2a77eb830e573d80a50d`

起点和终点必须复算 branch、HEAD、18 个文件 SHA、aggregate 与 `git status --short`。若 target 漂移，停止并报告 blocked，不审查移动目标。

## Mandatory review questions

1. 新 representation 是否真实使用独立 `registered-rigid-mesh/registered-gaussian-splat`，没有 phantom `never`、legacy shape 冒充、URL/path/receipt/provider response 或可变共享对象？Studio empty-cache branch 是否不会调用 legacy resolver 或 crash？
2. `MARBLE_HUNYUAN_MANIFEST_DIGEST` 是否是完整 canonical registry 的 digest，而不是任一 asset content digest；Snapshot 中三项 registered representation 是否都绑定同一 exact manifest digest？
3. registry literal、CalibrationRecord、witness 是否 exact-key、deep frozen、finite、dense、无 accessor/extra/sparse；axis mapping、determinant、quaternion、bounds、derived evidence 是否用 `1e-12` 重算且 exact registry drift fail closed？参数化测试是否真正执行 133 个独立成员，而非只检查 count？
4. composite scenario refs/lineage/representation/calibration/witness/proxy/physics/scenario identity 是否在 Repository、Runtime、codec、stream 全 seam fail closed；32 个 closure family 是否真实执行而不是只计数？
5. MuJoCo 是否只消费显式 floor/object box proxy 与 physics，不消费 environment/registered representation；真实 run 是否 76 samples、deterministic PASS、run 不推进 Ref、explicit adopt 才推进？
6. Product Session codec 是否保持 primitive/imported/3DGS/vessel/articulated 全部旧 authority；registered 与 legacy discriminator 不互相误伤？
7. model-facing tools 是否仍恰好 `world_read/world_write/world_edit/world_run`，只新增 closed fixture id，没有第五工具或 provider/file authority？
8. bounded fresh adversarial scan：尤其 registry exactness、manifest digest drift、scenario relabel、duplicate refs、runtime callback/terminal evidence、mutable aliases、non-finite/sparse/accessor 与 Studio empty-cache path。只报告可执行 P0/P1/P2。

## Mandatory gates

```bash
bun test packages/world/src/artifacts/marble-hunyuan-registry.test.ts packages/world/src/artifacts/marble-hunyuan-composite-fixture.test.ts packages/world/src/product-session-codec.test.ts packages/world/src/world-tools/world-tool-contract.test.ts apps/studio/src/presentation-three/entity-presentation.test.ts apps/studio/src/presentation-model.test.ts
bun test
bun run typecheck
git diff --check
.artifacts/harness/harnessctl validate
```

Operator evidence：focused `292/0/406`，full `434/0/3257`，typecheck/build/diff/EXharness pass。Reviewer 必须独立执行 mandatory gates；无需重复 build。

## Verdict schema

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

任何 P0/P1、target drift 或无法复算 frozen identity 都必须 `may_enter_phase2=no`。不要读取历史 reviewer verdict；本 request 是唯一 review authority。
