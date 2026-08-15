# DH-016 Plan Review Request — Round 5 Final

## Role

Fresh independent final plan reviewer；只读。禁止读取Round1-4 request/verdict、findings/progress、其他reviewer与current packets；不得修改/install/联网/provider/Git mutation。P0/P1=0才可批准implementation。

## Frozen identity

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- plan：`a5e9fe7da2983bf18bce0d887e11079f48bf4b09a203ae12755882b93cd5de73`
- ordered aggregate：`4c2c41ef5460bb2eb28934bcc4e816783824588bab6db8766d11d001642b4eb5`

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

起终复算branch/HEAD/plan/ordered aggregate/status；可读取直接import/相邻test验证claim，不得broad-search harness docs。

## Operator executable evidence

Kernel lease真实Bun probe：

```json
{"port":58309,"second":"EADDRINUSE","handshake":"DHLEASE1","exitCode":137,"rebound":true,"attempts":1}
```

Atomic intent admission真实filesystem probe：

```json
{"sameInode":true,"nlink":"2","second":"EEXIST","content":"{\"operationId\":\"op:test\"}"}
```

两者均使用repo外临时root并清理。Reviewer判断证据是否支撑plan；可做等价bounded临时probe，必须kill/reap/cleanup。

## Mandatory final closure

1. root bootstrap、fd-based identity与kernel lease没有first-mutation、alias、paused/crash或dual-writer漏洞。
2. staged intent完整fsync后，以hard-link no-replace发布`.write-lock`是否形成真正atomic durable admission；EEXIST、symlink/wrong type、nlink与kill/fsync边界不覆盖证据。
3. admission前crash可重试且orphan cleanup安全；admission后/Project前crash terminal aborted；Project后crash terminal success；三类same-key replay零二次mutation。
4. malformed/ambiguous lock保留证据并recovery-required；只有live lease holder能恢复/cleanup。
5. Save/Save As/Artifact publish/bundle import/receipt统一Idempotency-Key、binding conflict、lease与publish状态机。
6. project listing、manifest exact schema、Artifact/registry/calibration closure、Repository restore/edit sequence、linear undo/redo与四Agent tools闭合。
7. route/UI/process restart/cross-worktree/corrupt asset/empty-root bundle/Chromium/fault tests可bounded实现。
8. DH-017/018隔离、credential/Presentation/runtime evidence排除与极简架构保持。

找到P1后完成必要核验即hard stop。最终中文：`decision / may_implement / P0 / P1 / P2`，精确行号、反例、最小修订与start/end identity；不输出private chain-of-thought。Verdict不授予commit/push/merge/deploy。
