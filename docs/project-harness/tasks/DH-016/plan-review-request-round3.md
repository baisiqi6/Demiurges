# DH-016 Plan Review Request — Round 3

## Fresh role

只读fresh independent plan reviewer。不得读取Round1/2 request/verdict、findings/progress、其他reviewer、current review/closeout；不得修改/build/test/install/联网/provider/Git mutation。P0/P1为0才可批准。

最终输出：

```text
decision: approved | changes_requested | blocked
may_implement: yes | no
P0: N
P1: N
P2: N
```

## Frozen identity

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- plan：`4cbbc710f7fc0ec050b889a59d2c4c0c1951de2434dc8425c827dc91e88878e9`
- ordered 19-file aggregate：`3cf352453927853aaf500dd87cfb4db15f09a57ab953aa7ea2cad1352569c9e3`

Ordered manifest：`AGENTS.md`、`docs/project-harness/scope.md`、`architecture.md`、`domain-model.md`、本task `plan.md`、`packages/world/src/kernel/types.ts`、`canonical-json.ts`、`artifacts/marble-hunyuan-registry.ts`、`repository/world-repository.ts`、`host/runtime-mvp-host.ts`、`index.ts`、Gateway `product-session.ts`、`product-session-api.ts`、`provider-asset-api.ts`、`main.ts`、`scripts/verified-cache-file.ts`、`provider-artifact-validation.ts`、`import-dh013-provider-assets.ts`、root `package.json`（顺序即此顺序）。可读取具体claim的直接import/相邻test，不得broad-search harness docs。

起终复算branch/HEAD/plan/ordered aggregate/status；漂移则blocked。

## Mandatory closure

1. `DataRootWriterLease`是否真正由kernel lifetime持有：paused writer、event-loop stall、reader connect/backlog、最后一次admission后暂停均不能失去lease或产生第二writer。
2. derived loopback port公式是否deterministic且所有同root进程一致；different-root hash collision、无关进程占端口、bind异常只造成safe reader/write denial，不能fallback备用端口。
3. SIGKILL/exit后OS lease release与新writer restart是否可bounded验证；若实际Node/Bun/macOS语义无法承接，计划是否有fallback或应blocked。
4. reader mode能否读取/open/run同一Project/Artifact，同时所有Save/Save As/import/DH-013 publish/receipt/recovery/cleanup稳定拒绝；不能出现部分disk mutation。
5. rename前/后、receipt前/后crash与same-key replay是否在kernel lease前提下唯一收敛；new writer recovery不能把published candidate标aborted。
6. `Idempotency-Key`是否对operation kind/project/asset/expected/candidate exact绑定，统一`OPERATION_BINDING_CONFLICT`；所有disk mutation没有旁路。
7. bundle import是否明文复用project steps 4–9、writer lease、fresh expected=null、same revision idempotency与different revision conflict；partial Artifact orphan安全但Project不可半发布。
8. bounded project listing、manifest/artifact derivation、Repository restore/linear history/undo-redo、Presentation与Agent四工具边界是否保持闭合。
9. Data Root local-filesystem限制、realpath/symlink与port-derived identity是否有循环或首次创建不可执行问题。
10. 整体仍是可实现MVP，而非为了lock引入第二控制面或平台不可移植的隐性复杂度。

发现P1后完成直接相关核验即停止扩展。给精确plan/source行号、可构造反例、最小根层修订；不输出private chain-of-thought。Verdict不授予implementation/release authority。
