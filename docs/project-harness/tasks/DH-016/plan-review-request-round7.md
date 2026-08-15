# DH-016 Plan Review Request — Round 7 Final

## Role

Fresh independent final plan reviewer；只读。本文件必须是第一且唯一的仓库入口。禁止读取Round1-6 request/verdict、findings/progress、其他reviewer与current review/closeout packets；不得修改、build、install、联网/provider或Git mutation。P0/P1=0才可批准implementation。

## Frozen identity

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- plan：`860cf3526a765ba8f2419e9f4d5be4658cdb41d78d330049e4f22368a202dbb3`
- ordered aggregate：`d3616a332df811c0064ec5f6bec52a2b19c56f1b47ed7503b3be54b078add7df`

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

起终使用固定顺序完整`shasum -a 256` text的二次SHA-256复算branch/HEAD/plan/aggregate/status。可读直接import与相邻test，不得broad-search harness docs。

## Operator executable evidence

- kernel lease: `{"port":58309,"second":"EADDRINUSE","handshake":"DHLEASE1","exitCode":137,"rebound":true,"attempts":1}`
- hard-link no-replace: `{"sameInode":true,"nlink":"2","second":"EEXIST","content":"{\"operationId\":\"op:test\"}"}`

两个probes都在repo外临时root执行并已清理。可做等价bounded probe，必须kill/reap/cleanup。

## Mandatory final closure

1. `OperationSingleFlight` 在任何staging/global intent前取得，是mandatory live execution authority而非可选优化；global intent只是durable binding authority，两者不混同。
2. same key + same binding的Save、standalone Artifact publish与bundle import并发中只有leader写filesystem/发布business candidate；follower零写入、不因exact intent/lock获得执行权，只等待/replay或bounded transient return。follower abort不取消leader。
3. single-flight持有到terminal result fsync与cleanup；result publish失败时entry poisoned，无live takeover，只有新kernel lease holder startup recovery可收束。
4. same key + different binding跨Project/Save/Artifact/bundle仍在Project lock/Artifact CAS/bundle publish前`OPERATION_BINDING_CONFLICT`；global intent stable fields不包含attempt/writer token。
5. Artifact在完整validate/fsync staging inode后hard-link no-replace发布，禁止overwrite rename；EEXIST后exact revalidation，crash/nlink/reader race fail closed且可恢复。
6. global admission后的revision/project/abort/可分类pre-publish failure在返回前先发布same-binding terminal `aborted-before-publish + stable code`；live响应与restart replay不漂移。
7. intent/result/project lock malformed或无法分类时保留证据并recovery-required；intent前staging orphan与已admit operation可严格区分。
8. root/bootstrap/kernel lease、project manifest/restore/history、bundle、UI/routes/restart/cross-worktree/Chromium/fault tests、四Agent tools与DH-017/018隔离仍闭合。

必须特别给出same-binding dual request、follower abort、poisoned leader、Artifact destination EEXIST与live conflict/restart replay的反例判定。找到P1后完成必要核验即hard stop。最终中文：`decision / may_implement / P0 / P1 / P2`，精确行号、反例、最小修订与start/end identity；不输出private chain-of-thought。Verdict不授予commit/push/merge/deploy。
