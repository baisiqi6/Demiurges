# DH-016 Plan Review Request — Round 4

## Fresh gate

只读fresh independent plan review。禁止读取Round1-3 request/verdict、findings/progress、其他reviewer、current packets；不得修改/install/联网/provider/Git mutation。可执行本request明确的repo外临时Bun lease probe，但必须bounded、kill/reap并清理临时目录。

结论必须为：`decision / may_implement / P0 / P1 / P2`；P0/P1=0才可批准。

## Frozen identity

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- plan：`aa5b1b6de8cef0d649e825a22b880d8b20116866531f0084536f44b4d228f060`
- ordered 19-file aggregate：`611a8963c7aa22fc9d91e578307231261afcee22fc0f493fddcb6656bc863777`

Ordered manifest（固定顺序）：

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

起终复算branch/HEAD/plan/aggregate/status；可读取manifest直接import/相邻test验证具体claim，不得broad-search harness docs。

## Operator runtime evidence（需判断是否足够，不得盲信）

在repo外`mkdtemp` Data Root按plan dev/ino公式派生port `58309`，真实Bun child：

```json
{"port":58309,"second":"EADDRINUSE","handshake":"DHLEASE1","exitCode":137,"rebound":true,"attempts":1}
```

含accepted handshake，holder被`SIGKILL`，3秒deadline内第一次rebind成功，临时root清理。Reviewer可构造等价repo外probe复核；不得因此写产品文件。

## Mandatory closure

1. root bootstrap是否只创建empty 0700 directory、并发幂等；Gateway missing root与invalid root是否零mutation。
2. held no-follow root fd的dev/ino versioned encoding、SHA-256、`readUInt16BE % 16384`公式是否对same directory aliases一致且不同实现无歧义。
3. kernel listener是否进程全生命周期排他、paused/backlog/handshake不丢lease、SIGKILL后可bounded rebind；SO_REUSEADDR/no-SO_REUSEPORT要求与Bun 1.3.14是否可验收。
4. local filesystem/same-host boundary是否明确fail closed，reader mode是否保留read/open/run且拒绝所有disk mutation。
5. success、published-without-receipt、aborted-before-publish三种same-key replay是否分别收敛同一terminal结果；binding drift统一冲突。
6. ambiguous intent、rename前后kill、project lock、receipt与cleanup是否只有lease holder可变更且不污染已发布Project。
7. Artifact publish与bundle import是否共享lease/idempotency；bundle project publish复用Save 4-9，没有partial authority。
8. listing、manifest、Artifact derivation、Repository restore/edit sequence、linear undo/redo与四Agent tools是否闭合。
9. UI/routes/real process/empty-root bundle/corrupt asset/Chromium acceptance是否可执行、bounded且未持久化Presentation/provider transient。
10. 方案是否保持极简：一个Project codec、一个Store、一个process-lifetime lease、一个publish状态机，而非通用SDK/数据库/分布式系统。

发现P1后完成直接相关核验即hard stop。输出中文、精确行号、反例与最小根层修订；不输出private chain-of-thought。本verdict不授予implementation/release authority。
