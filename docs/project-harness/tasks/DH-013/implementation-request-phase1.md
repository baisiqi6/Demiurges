# DH-013 Phase 1 Worker Request — Core Authority RED→GREEN

## Authority and scope

在 `/Users/Admin/projects/WorkTrees/Demiurges-DH-013` 工作。允许修改产品源码与测试，但只完成 Kernel/core slice；不得 commit/push/merge、联网、访问 Keychain/provider、下载/生成资产、修改 Discord/production。

必须先读 current `plan.md`，尤其 exact CalibrationRecord、Witness 与 parameterized RED families。先写 RED tests，实际看到预期失败，再写最小 GREEN 实现。

## Owned product scope

- `packages/world/src/kernel/types.ts`
- `packages/world/src/artifacts/` 下新建 provider registry/composite fixture 及 tests
- `packages/world/src/artifacts/diagnostic-rigid-fixture.ts` 与 tests，仅用于 registered scenario routing
- `packages/world/src/{index.ts,product-session-codec.ts,product-session-codec.test.ts}`
- `packages/world/src/{repository,host,runtime-mujoco,evaluation,world-tools}/` 中为 composite free-fall 必需的最小改动与 tests
- 如需要，`apps/agent-gateway/src/product-session*.test.ts` 只补 core projection/stream closure test；不要实现 asset route/importer

禁止修改 Studio Presentation、Gateway asset route、operator importer、依赖、真实资产 bytes、harness JSON/current docs。

## Required outcome

1. Git-registered manifest plain data，三项 canary identity/calibration 与三类 witness exact frozen；manifest 是唯一 authority。
2. 新 scenario `scenario:marble-hunyuan-composite-v1`，refs 顺序 exact：`entity:environment|entity:floor|entity:generated-object`。
3. Snapshot/Projection representation 只持有 closed `assetId + manifestDigest + calibrationId + witnessId`；不持 URL/path/receipt/provider response。
4. environment：Marble collider visual source + SPZ observation；floor：authored box proxy；generated object：Hunyuan visual + box collision，mass 1kg，center pose z=1.2。
5. `requireRegisteredSnapshotIdentity`、Repository、Runtime、codec/stream admission exact closure；representation/calibration/witness 不影响 Runtime physics authority。
6. free-fall Program 接受 `entity:generated-object`，duration/sample rate保持既有 contract；run 不推进 ref；landing Evaluation deterministic；explicit adopt 使用 closed policy。
7. 四工具仍 exact；write fixture 只增加 `fixture:marble-hunyuan-composite-v1`，不新增第五工具。
8. 使用 plan 的 `TRANSFORM_RECOMPUTE_EPSILON=1e-12` 仅比较派生 transform；registry literals exact。
9. 全部 133 witness mutations 与 32 composite closure mutations由 parameterized tests生成独立 case；适用 Repository/Runtime/codec/stream seam 均 fail closed，不只改 UI。

## Verification

- focused tests for new registry/fixture/repository/runtime/codec/tool surface
- `bun test`
- `bun run typecheck`
- `git diff --check`

若发现计划与当前 Kernel shape 无法无补丁栈地结合，停止并报告最小根因，不要用 `any`、fallback、generic provider abstraction 或第五工具绕过。

最终报告：改动文件、RED 证据、GREEN gates、未做事项、`git status --short`；不写 review verdict。
