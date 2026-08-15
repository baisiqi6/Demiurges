# DH-016 Plan Review Request — Round 10 Final

## Role

Fresh independent final plan reviewer；只读。本文件是第一且唯一仓库入口。禁止读取Round1-9 request/verdict、findings/progress、其他reviewer与current review/closeout packets；不得修改、build、install、联网/provider或Git mutation。P0/P1=0才可批准implementation。

## Frozen identity

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- plan：`3bf7b3a4b26f7a290b24c936c095ce00db2a2e46b4c370e3c6c7a2a67095524c`
- ordered aggregate：`fc88249f475a71af775e05dee9213e50befbf99275bf8272c0a1bd145e11a118`

Ordered 19 files：

1. `AGENTS.md`
2. `docs/project-harness/scope.md`
3. `docs/project-harness/architecture.md`
4. `docs/project-harness/domain-model.md`
5. `docs/project-harness/tasks/DH-016/plan.md`
6. `packages/world/src/kernel/types.ts`
7. `packages/world/src/kernel/canonical-json.ts`
8. `packages/world/src/artifacts/marble-hunyuan-registry.ts`
9. `packages/world/src/repository/world-repository.ts`
10. `packages/world/src/host/runtime-mvp-host.ts`
11. `packages/world/src/index.ts`
12. `apps/agent-gateway/src/product-session.ts`
13. `apps/agent-gateway/src/product-session-api.ts`
14. `apps/agent-gateway/src/provider-asset-api.ts`
15. `apps/agent-gateway/src/main.ts`
16. `scripts/verified-cache-file.ts`
17. `scripts/provider-artifact-validation.ts`
18. `scripts/import-dh013-provider-assets.ts`
19. `package.json`

起终按上述固定顺序复算完整`shasum -a 256` text的二次SHA-256与branch/HEAD/status；可读直接import/相邻test，不得broad-search harness docs。

Operator probes：kernel lease `{"port":58309,"second":"EADDRINUSE","handshake":"DHLEASE1","exitCode":137,"rebound":true,"attempts":1}`；hard-link no-replace `{"sameInode":true,"nlink":"2","second":"EEXIST","content":"{\"operationId\":\"op:test\"}"}`；均为repo外bounded probe且已cleanup。

## Mandatory final closure

1. bundle durable `candidateIdentity`含`projectRevision + ordered candidateArtifacts[] + artifactSetDigest`；每个descriptor exact、排序、无重复、<=16，并与Phase A Project manifest artifacts/frozen registry exact一致。attempt/staging path不是recovery authority。
2. bundle startup recovery先于通用Project分支，按global intent逐Artifact重验：exact继续、absent继续、stable conflict→`ARTIFACT_DESTINATION_CONFLICT`、identity drift/unreadable/set不自洽→`OPERATION_RECOVERY_REQUIRED`；全exact/absent才按Project收敛。
3. 在live已检测Artifact conflict、terminal result hard-link/fsync前kill，restart仍从durable candidate set得到同一conflict code；identity drift不被降级为interrupted；Project不可见，exact CAS仅safe orphan。
4. Bundle Phase A仍在64 MiB body/total、32 MiB entry、16 entries、64 KiB central directory、1 MiB JSON与224 MiB package-owned peak bytes预算内零Data Root write syscall；Phase B才single-flight/admit/staging/fd二次验证。
5. legacy/unknown external completeness、standalone Artifact matrix、Artifact hard-link no-replace、same-binding follower、different-binding global intent、poisoned leader、common finalizer、Save As exact directory与`import:dh013` deterministic ID均不回归。
6. root/bootstrap/kernel lease、manifest/repository restore/history、bundle deterministic security、routes/UI/restart/cross-worktree/Chromium/fault tests、四Agent tools与DH-017/018隔离仍闭合。

必须给出bundle conflict pre-result kill、candidate set tamper/duplicate/reorder、absent+exact混合、identity drift、Phase A超预算/零write、same-binding follower与live/restart replay的反例判定。找到P1后完成必要核验即hard stop。最终中文：`decision / may_implement / P0 / P1 / P2`、精确行号、反例、最小修订与start/end identity；不输出private chain-of-thought。Verdict不授予commit/push/merge/deploy。

