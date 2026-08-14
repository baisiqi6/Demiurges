# DH-013 Final Implementation Cross-Review Request — Round 2

## Fresh reviewer contract

- 严格只读、bounded；不得修改 repo/Git/cache/Keychain/provider/运行中产品，不得联网或 generation。
- 不得读取任何旧 `*review-request*`、`*review-verdict*`、`*cross-review*`、`progress.md`、`findings.md`、`docs/project-harness/current/review-packet.md` 或另一 reviewer 输出。
- 唯一需求事实面是本文件与 `docs/project-harness/tasks/DH-013/plan.md`；实现事实面是下列 frozen product files 及直接依赖。
- 先复算 branch/HEAD/aggregate；任一漂移立即 `blocked`。P0/P1 才阻断，P2 明确列出但不冒充 blocker。
- 输出 `decision`、`may_closeout`、P0/P1/P2、executed、counterexamples、起止 frozen identity；完成本轮 mandatory scope 后立即收口。

## Frozen identity

- branch: `agent/codex/DH-013`
- HEAD/base: `97761d6b5dba899fcb73b93ba830ba78f2980766`
- product aggregate: `40aaa38eea0e178b24c607c78f48febfa810fa8776d976c9a0ce4e363a34d5f1`
- algorithm: 对下列 42 个路径按顺序执行完整 `sha256sum`，保留标准的 hash、两个空格、路径和换行，再对完整输出执行一次 `sha256sum`。

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

## Round 2 mandatory closure

1. 复现并确认拒绝：SPZ v2 只有 header+centers、按 `shDegree` 截断或多余 bytes；GLB JSON 后 1–7 bytes trailing、缺失/重复/unknown/BIN 越界；POSITION sparse、无 bufferView、越界 count/stride/offset、accessor min/max 与真实 BIN floats 漂移、NaN/Infinity。
2. 使用真实三项 cache 重算完整 validator identity；真实 SPZ 的 decoded payload 必须是 497,664 × 19 + 16，两个 GLB 必须从 BIN POSITION 重算 manifest bounds，不得只读 accessor min/max。
3. 复现并确认 importer/route 拒绝：FIFO、symlink、非 regular、非 0600（importer）、同尺寸 stat drift；before/after tuple 任一字段漂移 fail closed。
4. Asset route 用忽略 AbortSignal 的 deferred read：deadline 返回 408 后并发 slot 必须继续占用，第三请求为 503；只有 deferred promise settle 后才恢复 200，late reject 不产生 unhandled rejection。连续真实读取不得泄漏 FD。
5. importer matching-cache read 必须消费共享 signal/deadline；publish collision、old valid cache、temp cleanup、credential/URL redaction保持。
6. 重新扫 full DH-013 authority：registered codec/Repository/Runtime、四工具、composite 76-sample PASS、run 不推进 ref、Presentation failure 与 physics evidence 分离。
7. Studio/浏览器只需 bounded verification：三项 loaded、四 toggle 不 reload、header/bytes tamper fail、empty-cache not-imported、replay 非闪现、provider-domain request 0；不要重复无界启动多套 dev server。

## Mandatory gates

```bash
bun test
bun run typecheck
bun run build
git diff --check
.artifacts/harness/harnessctl validate
bun run import:dh013
```

Expected current evidence：`463 pass / 0 fail / 3409 expect()`；import 三项均 `cache-hit/queryAttempts=0/downloadAttempts=0`。不得删除或修改真实 cache 来制造反例，repo 外 temp fixture 足够。

结束前复算同一 42-file aggregate、branch、HEAD 与 status 文件集；不得读取旧 reviewer 对本轮形成锚定。
