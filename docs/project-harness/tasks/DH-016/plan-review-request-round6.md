# DH-016 Plan Review Request — Round 6 Final

## Role

Fresh independent final plan reviewer；只读。本文件必须是第一且唯一的仓库入口。禁止读取Round1-5 request/verdict、findings/progress、其他reviewer与current review/closeout packets；不得修改、build、install、联网/provider或Git mutation。P0/P1=0才可批准implementation。

## Frozen identity

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- plan：`fbf82a1a42fc631a1f38dcb1125474ca54a85eab0d5acd11d7ef29093b4bdff9`
- ordered aggregate：`e688c2195d3fec7302d59e3e0023ec9b55ff9b586908d5fd1c4ff3238387bee7`

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

起终使用上述固定顺序的完整`shasum -a 256` text二次SHA-256，复算branch/HEAD/plan/aggregate/status。可读取manifest文件的直接import与相邻test验证claim；不得broad-search harness docs。

## Operator executable evidence

Kernel lease真实Bun probe：

```json
{"port":58309,"second":"EADDRINUSE","handshake":"DHLEASE1","exitCode":137,"rebound":true,"attempts":1}
```

Atomic no-replace hard-link probe：

```json
{"sameInode":true,"nlink":"2","second":"EEXIST","content":"{\"operationId\":\"op:test\"}"}
```

两者均使用repo外临时root并已清理。Reviewer应判断它们是否支撑plan；若做等价bounded临时probe，必须kill/reap/cleanup。

## Mandatory final closure

1. root bootstrap、held root fd dev/ino identity、deterministic loopback kernel lease没有first-mutation、alias、paused/crash或dual-writer漏洞。
2. 全局stable binding只由`schemaVersion + operationId + kind + target + expectedIdentity|null + candidateIdentity`组成；attempt/writer token不污染replay identity。
3. 完整staged global intent经fsync/close/directory fsync后，以hard-link no-replace发布为`receipts/<operation-id>.intent.json`是全局durable admission；EEXIST、wrong type/symlink、nlink、kill/fsync边界不覆盖证据。
4. 同key并发用于两个Project、Save vs Artifact publish、Save vs bundle import时，只有一个exact binding能admit；败者在Project lock/Artifact CAS/bundle business publish前`OPERATION_BINDING_CONFLICT`且零业务副作用。DataRoot lease或进程内mutex不被误当这个全局namespace authority。
5. Project `.write-lock`只负责project CAS，必须与global intent同inode或exact binding；global intent后到candidate前crash terminal aborted，candidate后crash terminal success，result no-replace、same-key replay零二次mutation。
6. malformed/ambiguous global intent/result/project lock保留证据并recovery-required；只有live lease holder能恢复/cleanup；pre-admission staging orphan与已admit operation可严格区分。
7. Artifact publish、bundle import、Project publish共用一条global idempotency/recovery state machine；bundle在global admit前已全量验证，中途失败只留安全unreferenced CAS orphan，不出现半Project。
8. project listing、manifest exact schema、Artifact/registry/calibration closure、Repository candidate restore/edit sequence、linear undo/redo与四Agent tools闭合。
9. route/UI/process restart/cross-worktree/corrupt asset/empty-root bundle/Chromium/fault tests可bounded实现；DH-017/018、credential/Presentation/runtime evidence隔离与极简架构保持。

找到P1后完成必要核验即hard stop。最终中文输出：`decision / may_implement / P0 / P1 / P2`，精确行号、反例、最小修订与start/end identity；不输出private chain-of-thought。Verdict不授予commit/push/merge/deploy。
