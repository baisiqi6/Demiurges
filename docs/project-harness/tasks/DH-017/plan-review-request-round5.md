# DH-017 Plan Review Request — Round 5

## Contract

- fresh independent read-only；`approved`仅当`P0=0 && P1=0`；
- 唯一repo入口为本文件；只可读取下列23 files与列出的official public docs；禁读Round1-4 request/verdict/reviewer outputs、current review packet、findings/progress review notes/future packet；
- 无repo write/install/Keychain/authenticated/provider request/Git mutation；P0/P1先即时报告，随后只完成request-scoped closure/end freeze；
- official docs：World Labs `https://docs.worldlabs.ai/api`、`/api/reference/worlds/generate`、`/api/reference/openapi`、`/api/models`；Tencent `https://cloud.tencent.com/document/product/1804/126189`、`120838`、`123447`、`123448`。

## Frozen identity

- worktree `/Users/Admin/projects/WorkTrees/Demiurges-DH-017`
- branch `agent/codex/DH-017`
- HEAD/base `13300788f2d40e525fec91befca78f3fc4849831`
- plan SHA-256 `3a81c8950b4a675f148d117f0f64e42e248829d33a22eb73f35f4cbc555c4119`
- ordered aggregate `cd74a74bdea0f497cef2a83bf221634e5f3d064e3d19e89d2560805b4bc89d04`

起终复算branch/HEAD/status/每个SHA/aggregate。aggregate算法是对下列固定顺序完整`shasum -a 256`文本（含两个空格、relative path与换行）再次执行SHA-256。

```text
353dba879a20c570e438fef3681f412a084456ab3b38b70f14ec2773fa1e2f42  AGENTS.md
a335dafd9d996f7bf15346890d3056333f3a9efaec98df3820d69cd5360b20c4  docs/project-harness/scope.md
fef6f9d56d30bd1e2b0d36340603a58b7fc6b8f630234f73bd4f6e9f23c57dcb  docs/project-harness/architecture.md
9102a3d16806873dca31a118340ddac030c2101e28bd5a27349e4fd5ce8e0acf  docs/project-harness/domain-model.md
6a6d851c490071480f10772f86877d968b0e8e1a22adb986d287aae304766038  docs/project-harness/progress.md
1e74095d37de1467dce392cec76d44e9cb273c6e7bfb04296441d6f518b813c2  docs/project-harness/harness-checklist.json
5e5b4612d03319aa1bb06054678c96573bbcdcde5b7d2a0eccd56d45b546d1db  docs/project-harness/current/task_plan.md
932da22e96c9aedc678811530384b70ff658afa3832f02ee2bf89e9243ca2f52  docs/project-harness/tasks/DH-013/plan.md
b9afeb0ba52125fb30e2923d716f132b9716032c64bf0dad48a05170624503ed  docs/project-harness/tasks/DH-016/plan.md
3a81c8950b4a675f148d117f0f64e42e248829d33a22eb73f35f4cbc555c4119  docs/project-harness/tasks/DH-017/plan.md
2972f165299ffb00954d664034b3588a58afc35619852fd403b03705af0cc69a  package.json
bfc698d899667a26e7b0adca4b9467d8b690da2dd98f16a01eb0b0538050ab89  packages/world/src/artifacts/marble-hunyuan-registry.ts
5b923660e119ecab5efd299930495f87b5b31ddf88e39b359893981a3f9e1d67  packages/world-project/src/index.ts
7e80fef0843b8bdba9c027ed61c25115ad05eea5d7676b4c4e47979c822d78b5  packages/world-project/src/data-root-layout.ts
1e5be9a4a72dfbca1f2e43b253b5657c582b3727ed5aa50912913b949bffea9d  packages/world-project/src/operation-journal.ts
f0776419baf95390b9e5211254132fc4351289e933a3f431474b4a79d2b9572b  packages/world-project/src/artifact-store.ts
55bef2eb64f14ab3dda2638ac24672c73c69c90feaa6ab18c5cf6eda3518c893  packages/world-project/src/import-dh013.ts
62aa103da72b009212fe3c64e7e8d2383c23abb40c105bc834eaf8f9eba278a5  packages/world-project/src/startup-recovery.ts
3fca29b3c2606282c756b83adeaa62236442285df616f71dd88b0523716e3c45  scripts/dh013-provider-import.ts
a06acc5d341fcbb815ef48ec7f57d6a0f3300ea1f06b50eccbae582a9c16519a  scripts/provider-artifact-validation.ts
313b15ee28ac00d1948e7a4d8416c3737dd8e6210a373866d9553dcb96e30cba  apps/agent-gateway/src/provider-asset-api.ts
81069e2747a3946c564128846e1bd1fe0529f2aff6ea9a298584565a9345bc54  apps/agent-gateway/src/main.ts
96f4f7c0237cf5833e609ee2b4c0bfa6f750649ca6bee2feb01b06e6622d44dc  apps/studio/src/App.tsx
```

## Mandatory closure

1. `GenerationJournal` birth-staging namespace、catalog visibility、hidden orphan与intent/admitted/head fsync crash是否仍形成0-or-complete durable generation，且不与DH-016 root staging/recovery冲突？
2. poll budget是否由durable checkpoint唯一决定：每次query前消耗attempt、restart不刷新attempt/deadline、cycle最多2；absolute clock rollback、Marble/Hunyuan最大attempt与record cap是否数学上闭合？
3. `GenerationCapacityAuthority`的512-slot reservation与共享`DataRootCapacityAuthority`的2048 receipt reservation是否在concurrent confirm、pending operation、generated-set conversion、restart与near-cap下无double-count/under-count，并保证任何paid provider side effect前留足future evidence？
4. `requireGeneratedArtifactSetJoin`是否把intent、remote binding、content、provenance、set、role/format、bytes/pointer/catalog/result的全部跨记录等式关闭，并在publish/recovery/list/serve first mutation/visibility前使用？
5. provider poll/download矩阵是否唯一：400/401/403/404/422、429/5xx、malformed 2xx、transport/body/deadline、signed URL expiry各自进入确定state；一次metadata refresh+一次download retry不突破同一durable cycle？
6. Marble authenticated get-world route、safe worldId path、Operation/World contract digest与restart output recovery是否闭合；Hunyuan FAIL/DONE optional total cost、state-specific code subsets是否精确且不持久化raw fields/URL？
7. `executionPolicy:"wait-and-download"`与product confirmation是否真正绑定Human选择；refresh/discovery、set-level visibility、World authority与无generic provider framework边界是否保持？
8. implementation surface是否可行且足够简单；不得通过新增provider SDK、持久内存counter、第五工具或修改Kernel/Repository/World Project v1来逃避上述边界。

## Required counterexamples

- repeated crash after each poll fetch but before next normal status；restart后总query count仍不超过cycle durable remaining budget；
- record total 8190/8191与receipt total 2046/2047，夹带pending Operation和active generations并发confirm；要么完整reservation，要么provider call=0；
- individually valid但cross-generation/provider/job/request/role/content member漂移的set；必须first-mutation fail closed；
- Marble expired signed URL触发exact get-world refresh；unsafe worldId或第二次transient download失败不得无限刷新；
- terminal provider failure带合法cost、无cost、invalid cost三路；仅前两路可落对应closed state；
- executionPolicy/canonicalRequest/confirmation任一漂移；必须birth/provider-call前拒绝。

## Verdict

```text
decision: approved | changes_requested | blocked
may_implement: yes | no
P0/P1/P2: <counts + findings>
checks: <mandatory closure + counterexample evidence>
frozen_identity: <start/end>
boundary_attestation: <fresh/read-only/no-auth/no-forbidden-read>
```
