# DH-013 Final Implementation Cross-Review Request — Round 3

## Freshness and authority

- 严格只读、bounded；不得写 repo/Git/cache/Keychain/provider/运行中产品，不得联网或 generation。
- 禁止读取任何旧 request/verdict/cross-review/progress/findings/current review packet/另一 reviewer 输出。
- 唯一 request 是本文件；需求事实面还可读 `docs/project-harness/tasks/DH-013/plan.md`。先复算 identity，漂移即 `blocked`。
- P0/P1 才阻断。输出 `decision`、`may_closeout`、P0/P1/P2、executed/counterexamples 与起止 identity；完成 mandatory scope 后立即收口，不扩展 DH-014。

## Frozen identity

- branch: `agent/codex/DH-013`
- HEAD/base: `97761d6b5dba899fcb73b93ba830ba78f2980766`
- 42-file product aggregate: `372630cfee4b50b5550d57425b97a7baec73e34e95e0b7d8bacd84bf3f7706f0`
- algorithm: 下列路径按顺序执行完整 `sha256sum`，再对其完整标准输出执行 `sha256sum`。

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
scripts/verified-cache-file.test.ts
scripts/verified-cache-file.ts
```

## Mandatory Round 3 probes

1. Query JSON body 与 download artifact body 分别在第一 chunk 前、至少一 chunk 后异步 reject，error.message 含 dummy credential、signed URL/query、provider body/header/path；direct seam 与 CLI boundary 均不得回显 marker，只能得到稳定 `QUERY_REJECTED` / `DOWNLOAD_REJECTED` 或顶层 `IMPORT_FAILED`。
2. Credential stream raw rejection 只能得到 `CREDENTIAL_UNAVAILABLE`；Abort/deadline 已形成的 `ProviderImportError` 不得被错误改写。
3. body oversize、invalid JSON、signed URL expired、wrong host/redirect、content type/digest/bounds failure仍保持原稳定 code；失败后 temp 清空、旧 valid cache不变。
4. 复跑已关闭的 SPZ exact layout、GLB JSON+BIN/trailing/sparse/actual POSITION、FIFO/stat tuple、deferred-read slot/FD probes，确认 remediation 没有回归。
5. Bounded full closure：四工具、registered codec/Repository/Runtime、76-sample Evaluation PASS、run 不推进 ref、Studio三资产/toggle/integrity/empty-cache/network隔离。现有 5173/8787 足够，禁止重复无界启动 server/browser。

## Mandatory gates

```bash
bun test
bun run typecheck
bun run build
git diff --check
.artifacts/harness/harnessctl validate
bun run import:dh013
```

Expected：`464 pass / 0 fail / 3418 expect()`；三项 `cache-hit/queryAttempts=0/downloadAttempts=0`。反例只用 repo 外 temp fixture，禁止修改真实 cache。结束前复算相同 aggregate、branch、HEAD 与 status 文件集。
