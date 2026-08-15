# DH-016 Plan Review Request — Round 8 Final

## Role

Fresh independent final plan reviewer；只读。本文件是第一且唯一的仓库入口。禁止读取Round1-7 request/verdict、findings/progress、其他reviewer与current review/closeout packets；不得修改、build、install、联网/provider或Git mutation。P0/P1=0才可批准implementation。

## Frozen identity

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- plan：`d08d86db9631acac970f05e973d4464b71f76dc551a6e8f0b1b9886a5d802217`
- ordered aggregate：`1aba06ef0c01359546be60639ba4a1f99ab2aea19360fe711c575480cad4e7cb`

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

起终使用固定顺序完整`shasum -a 256` text的二次SHA-256复算branch/HEAD/plan/aggregate/status。可读直接import/相邻test，不得broad-search harness docs。

## Operator probes

- kernel lease: `{"port":58309,"second":"EADDRINUSE","handshake":"DHLEASE1","exitCode":137,"rebound":true,"attempts":1}`
- hard-link no-replace: `{"sameInode":true,"nlink":"2","second":"EEXIST","content":"{\"operationId\":\"op:test\"}"}`

均为repo外bounded临时probe，已cleanup。

## Mandatory final closure

1. Project v1 external-artifact completeness：只允许procedural/primitive或registered+registry+Store exact representation；legacy `imported-rigid-mesh`/`gaussian-splat`与其他unbacked external reference在Save/Save As/Open/bundle import中`PROJECT_ARTIFACT_UNBACKED`。Save/bundle在global admission前拒绝且零Data Root mutation；Open在candidate可见前拒绝。
2. `OperationTerminalFinalizer`是Save、standalone Artifact、DH-013 import、bundle公用边界，不是Save-only helper；只有stable-classifiable failure可发布terminal result，否则recovery-required并保留证据。
3. standalone Artifact recovery matrix：destination exact→success；absent→`aborted-before-publish + OPERATION_INTERRUPTED`；stable noncandidate/wrong type→`ARTIFACT_DESTINATION_CONFLICT`；identity drift/unreadable/intent-result drift→`OPERATION_RECOVERY_REQUIRED`。live `EEXIST`与restart使用同matrix/result。
4. Artifact publish仍为staged full validation/fsync + hard-link no-replace + directory fsync，ordinary overwrite rename禁止；reader/nlink/crash race fail closed。
5. mandatory `OperationSingleFlight`、same-binding leader/follower、follower abort、poisoned leader、same-key different-binding global intent、project lock两级权威仍闭合。
6. global admission后live project/artifact failure先durable terminal result再响应；startup recovery返回同variant/code。Save As只清理可证明由该operation创建的exact empty directory，不递归删除。
7. `import:dh013` deterministic operationId由frozen registry digest派生，不依赖header/random/time/path，与exact kind/candidates binding。
8. root/bootstrap/kernel lease、manifest/repository restore/history、bundle、routes/UI/restart/cross-worktree/Chromium/fault tests、四Agent tools和DH-017/018隔离仍闭合。

必须给出legacy external Save/Open/bundle、Artifact intent后-link前kill、exact/absent/corrupt/wrong-type/identity-drift `EEXIST`、same-binding follower与live/restart replay的反例判定。找到P1后完成必要核验即hard stop。最终中文：`decision / may_implement / P0 / P1 / P2`，精确行号、反例、最小修订与start/end identity；不输出private chain-of-thought。Verdict不授予commit/push/merge/deploy。
