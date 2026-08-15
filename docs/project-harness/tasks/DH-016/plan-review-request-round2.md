# DH-016 Plan Review Request — Round 2

## Role and gate

你是fresh independent plan reviewer。只读，不修改/build/test/install/联网/provider/Git mutation。最终输出：

```text
decision: approved | changes_requested | blocked
may_implement: yes | no
P0: <count>
P1: <count>
P2: <count>
```

P0/P1必须为0才可批准。不得读取Round 1 request/verdict、findings/progress、其他reviewer、current review/closeout packet。

## Frozen identity

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- plan SHA-256：`e7448b290e910b4db8ebba08d9c095ad7bc9541a3369939bb92d55f627732ab7`
- ordered 19-file aggregate：`00505904698a541e92f8ec5139c5ca875c6ba960b4ae8b2ec0cefb533e2f4643`

Ordered manifest与Round 1无关，完整列于本request：

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

允许读取本request、plan、上述manifest及验证具体claim所必需的直接import/相邻test；禁止broad-search harness docs。起终复算branch/HEAD/plan/ordered aggregate/status，漂移则blocked。

## Mandatory counterexample closure

1. **Discovery after restart：** 新Gateway没有任何内存recent state时，是否能bounded发现并Open已有project；project listing是否没有第二持久index，invalid/symlink/oversize entries不会成为authority。
2. **Rename-after replay：** R0 + operation K保存R1，在project rename/directory fsync后、receipt/解锁前kill；新writer owner启动与K重放是否唯一收敛到same success，而不是locked/conflict。
3. **Rename-before recovery：** intent或partial staging后kill；新owner是否保留R0、产生bounded aborted evidence、只清理exact-owned candidate/lock，且后续新save可继续。
4. **Ambiguous recovery：** malformed intent、revision既非expected也非candidate、owner token drift时不得删除证据/猜测恢复；Open完整published revision可用，Save稳定recovery-required。
5. **Owner race：** active writer + reader Gateway、两个stale-owner contenders、paused/active socket、winner尚未bind的窗口；必须保证最多一个disk writer，loser不能unlink winner socket。若plan描述不足以实现该不变量，登记P1。
6. **Reader semantics：** 其他worktree Gateway仍能读取/打开/运行同一Project与Artifacts，但所有disk mutation稳定`DATA_ROOT_READ_ONLY`。
7. **Idempotency binding：** 同key不同operation kind/project/asset/expected/candidate必须fail closed；Save、Save As、bundle import、DH-013 publish不能各发明一套key语义。
8. **Manifest/artifacts：** only registered representations派生Store artifacts；legacy imported kinds、primitive empty set、registry/calibration/witness closure无矛盾。
9. **Repository/history：** exact restore、edit sequence、Ref version、runtime-terminal、undo/redo/redo truncation与Project-bound error能由current source承接，且不增加Agent tool。
10. **Bundle与atomic import：** deterministic store-only ZIP与empty-root import仍受同一writer/idempotency/project publish状态机约束，没有绕过lock/receipt或partial Store/Project污染。
11. **Product acceptance：** routes/UI/restart/corrupt-asset/fault/Chromium测试均可bounded执行，未把filesystem/mtime/Presentation变成world authority。
12. **Scope：** 没有把DH-016扩成database/distributed lock/provider SDK或DH-017/018。

## Output boundary

- 找到P1后完成相关必要核验即停止扩展。
- 精确引用plan/source行号，给可构造反例和最小根层修订；不输出private chain-of-thought。
- Reviewer verdict不授予implementation/commit/push/merge/deploy authority。
