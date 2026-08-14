# DH-013 Final Implementation Cross-Review Request — Round 1

## Reviewer contract

- 只读、fresh、bounded review；不得修改文件、build artifact、Git、provider、Keychain 或运行中的产品状态。
- 不读取本目录中任何旧 `implementation-*-verdict*`、旧 `implementation-review-request*`、`plan-*-review*`、`docs/project-harness/current/review-packet.md` 或另一名 reviewer 输出。
- 唯一需求事实面：本文件与 `docs/project-harness/tasks/DH-013/plan.md`；实现事实面：下面冻结的 product files 及其直接依赖。
- 先复算 frozen identity；任一 product digest/HEAD/branch 漂移立即 `blocked`，不要审查移动目标。
- 只以可执行的 P0/P1 阻断批准；P2 必须明确不阻断。输出 `decision: approved|changes_requested|blocked` 与 `may_closeout: yes|no`。
- 不扩大到 DH-014、通用 provider SDK、云部署、编辑器重设计或性能平台。

## Frozen identity

- branch: `agent/codex/DH-013`
- HEAD/base: `97761d6b5dba899fcb73b93ba830ba78f2980766`
- product aggregate: `29e9415ffde8f0e6522d93223df55463e89c8f403ceebc76a908f6570f3b5979`
- aggregate algorithm: 对下列 40 个路径按本文顺序执行完整 `sha256sum`，保留标准输出中的 hash、两个空格、路径与换行，再对完整输出执行一次 `sha256sum`。

```text
apps/agent-gateway/src/main.ts
apps/agent-gateway/src/omp-world-agent.test.ts
apps/agent-gateway/src/product-session.test.ts
apps/agent-gateway/src/product-session.ts
apps/agent-gateway/src/provider-asset-api.test.ts
apps/agent-gateway/src/provider-asset-api.ts
apps/agent-gateway/src/scripted-fixture-main.ts
apps/studio/src/App.tsx
apps/studio/src/presentation-model.test.ts
apps/studio/src/presentation-model.ts
apps/studio/src/presentation-three/ThreeViewport.tsx
apps/studio/src/presentation-three/alignment-evidence.test.ts
apps/studio/src/presentation-three/alignment-evidence.ts
apps/studio/src/presentation-three/entity-presentation.ts
apps/studio/src/presentation-three/registered-presentation.test.ts
apps/studio/src/presentation-three/registered-presentation.ts
package.json
packages/world/src/artifacts/ball-vessel-fixture.ts
packages/world/src/artifacts/diagnostic-rigid-fixture.ts
packages/world/src/artifacts/marble-hunyuan-composite-fixture.test.ts
packages/world/src/artifacts/marble-hunyuan-composite-fixture.ts
packages/world/src/artifacts/marble-hunyuan-registry.test.ts
packages/world/src/artifacts/marble-hunyuan-registry.ts
packages/world/src/evaluation/evaluate-episode.ts
packages/world/src/host/runtime-mvp-adopt-policy.ts
packages/world/src/index.ts
packages/world/src/kernel/types.ts
packages/world/src/kernel/world.ts
packages/world/src/product-session-codec.ts
packages/world/src/repository/world-repository.ts
packages/world/src/runtime-mujoco/run-falling-cube.test.ts
packages/world/src/runtime-mujoco/run-falling-cube.ts
packages/world/src/world-tools/world-tool-contract.test.ts
packages/world/src/world-tools/world-tool-contract.ts
packages/world/src/world-tools/world-tool-surface.ts
scripts/dh013-provider-import.test.ts
scripts/dh013-provider-import.ts
scripts/import-dh013-provider-assets.ts
scripts/provider-artifact-validation.test.ts
scripts/provider-artifact-validation.ts
```

## Required review surface

1. Registry/codec/Repository/Runtime exact closure：registered representation、CalibrationRecord、witness、scenario/entity identity、plain-data descriptor admission、duplicate/foreign lineage、run/adopt authority。
2. Import boundary：Keychain-only secret handling、exact provider origin/host、manual redirect、deadline/byte budget、one refresh、URL/error redaction、`O_NOFOLLOW`/mode/stat/validator、atomic no-replace publish、failure cleanup 与 old-cache preservation。
3. Artifact validator：真实 SPZ v2 与 GLB 2.0 closure；finite decoded bounds、digest/size/magic；GLB external/data URI rejection；sparse/accessor/extra-key/proxy seam。
4. Asset route：closed `assetId`、same-origin-only product contract、query/range/traversal rejection、serve-time revalidation、abort/deadline/concurrency、FD cleanup、stable miss/identity/error semantics。
5. Product Session/Agent：model-facing tools 仍恰好四个；composite edit/run 可执行；Presentation 失败不改变 Snapshot/Episode/Evaluation/ref；run 不推进 ref。
6. Studio：browser-side response header + SHA-256 verification precedes parse；Spark/GLTF exact calibration；四独立 toggle 不 reload；integrity/calibration/witness truth level；generation token/abort/late disposal；scenario reset 无 stale resource；Episode 非闪现回放。
7. Credential/network：Git、bundle、log、argv、receipt/session/event 不含 key 或 signed URL；浏览器不含 provider origin，也不直接请求 provider/CDN/COS。

## Mandatory executable gates

```bash
bun test
bun run typecheck
bun run build
git diff --check
.artifacts/harness/harnessctl validate
bun run import:dh013
```

`bun run import:dh013` 必须是三项 `cache-hit`、`queryAttempts=0`、`downloadAttempts=0`；review 不得为了复测而删除 cache、访问 Keychain/provider 或发起 generation。

至少执行下列 adversarial probes（可用 repo 外临时脚本，不得写 product tree）：

- matching cache 的 symlink、非 `0600`、truncated/changed bytes、before/after stat drift；publish collision 保留已有 valid cache；失败不留 temp/secret/URL。
- asset route 的 unknown/query/range/traversal、aborted read、hung read deadline、并发上限、late rejection/FD cleanup；合法三项 route bytes 的 digest/length/media/header 全匹配。
- initial/terminal/event projection 的 provider/resource/digest/representation/calibration/witness/scenario/entity/ref drift；registered arrays/records 的 sparse/accessor/Symbol/extra key；Runtime direct malicious Snapshot 在 MJCF 前拒绝。
- composite 四工具成功、Evaluation 可复算为 `PASS`、76 samples、terminal object/floor proxy closure、`world_run` 不推进 current ref；Presentation load/error 不影响该结果。
- Studio loader 的 response header/bytes mismatch、late parse after abort/scenario switch、toggle 不 reload、reset 清空状态；`loading/not-imported/error` 绝不显示 `INTEGRITY VERIFIED`。

## Existing operator evidence to independently verify

- full tests: `461 pass / 0 fail / 3397 expect()`；typecheck/build/diff/harness 全通过。
- cache identities: SPZ `3fc704ff…8577cb5` / 5,163,264；Marble collider `6a5b26af…710e24` / 7,719,136；Hunyuan GLB `ad65fee5…08b7d5` / 21,383,672。
- imported Chromium：三项 loaded；四工具成功；Evaluation PASS；76 samples；四 toggle 可组合且不重新下载；provider-domain requests 0。
- empty-cache Chromium：三项 not-imported；无 diagnostic fallback/provider request；proxy physics 仍 PASS。

Reviewer 应把 worker/operator claims 当待验证输入，而不是批准证据。完成后复算终点 product aggregate、HEAD、branch 与 status，确认 review 期间没有漂移。
