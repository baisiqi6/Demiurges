# DH-017 Plan Review Request — Round 13

## Contract

- fresh independent read-only；`approved`仅当`P0=0 && P1=0`；
- 唯一repo入口为本文件；只可读取下列22 files与列出的official public docs；禁读Round1-12 request/verdict/reviewer outputs、`harness-checklist.json`、current review packet、findings/progress review notes/future packet；
- 无repo write/install/Keychain/authenticated/provider request/Git mutation；P0/P1先即时报告，随后只完成request-scoped closure/end freeze；
- official docs：World Labs `https://docs.worldlabs.ai/api`、`/api/reference/worlds/generate`、`/api/reference/openapi`、`/api/models`；Tencent `https://cloud.tencent.com/document/product/1804/126189`、`120838`、`123447`、`123448`。

## Frozen identity

- worktree `/Users/Admin/projects/WorkTrees/Demiurges-DH-017`
- branch `agent/codex/DH-017`
- HEAD/base `13300788f2d40e525fec91befca78f3fc4849831`
- plan SHA-256 `2113e3bb4f3556bfa3b14ce060890264008f7d9d25b70ad1c59757895613bf5b`
- ordered aggregate `7b0c6b78eed5e311fa29a2296257c19ae86c0cf31224b7a2c7974a34dfdc52bd`

起终复算branch/HEAD/status/每个SHA/aggregate；aggregate为下列固定顺序完整`shasum -a 256`文本的SHA-256。`git status`只允许观察path/status，不得打开禁读文件。

```text
353dba879a20c570e438fef3681f412a084456ab3b38b70f14ec2773fa1e2f42  AGENTS.md
a335dafd9d996f7bf15346890d3056333f3a9efaec98df3820d69cd5360b20c4  docs/project-harness/scope.md
fef6f9d56d30bd1e2b0d36340603a58b7fc6b8f630234f73bd4f6e9f23c57dcb  docs/project-harness/architecture.md
9102a3d16806873dca31a118340ddac030c2101e28bd5a27349e4fd5ce8e0acf  docs/project-harness/domain-model.md
6a6d851c490071480f10772f86877d968b0e8e1a22adb986d287aae304766038  docs/project-harness/progress.md
3947d4158901518712ec22501ac899a36de8326ef2133b73150d1fd5533dcd08  docs/project-harness/current/task_plan.md
932da22e96c9aedc678811530384b70ff658afa3832f02ee2bf89e9243ca2f52  docs/project-harness/tasks/DH-013/plan.md
b9afeb0ba52125fb30e2923d716f132b9716032c64bf0dad48a05170624503ed  docs/project-harness/tasks/DH-016/plan.md
2113e3bb4f3556bfa3b14ce060890264008f7d9d25b70ad1c59757895613bf5b  docs/project-harness/tasks/DH-017/plan.md
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

1. namespace identity是否严格形成无环DAG：`NamespaceInstallSeedV1 → namespaceSeedDigest → operationId → OperationBinding/installBindingDigest → namespaceBody/bodyDigest → markerBody/markerDigest`，任一后继不得进入前驱preimage。
2. seed、operationId、binding、namespace body和marker的exact key/order/domain separators是否足以跨process产生唯一golden vectors；Data Root identity使用方式是否与existing root authority一致且不能跨root replay。
3. candidateIdentity是否只含`namespaceSeedDigest`；不得含namespace body、binding-derived digest或marker。live/recovery必须从seed+Data Root identity重算整链，不信任stored derived digest。
4. target/seed/root/operationId/binding/body/marker任一漂移、自引用candidate、same namespace body foreign binding、same marker foreign inode是否在intent/candidate/recovery mutation前fail closed并保留evidence。
5. namespace crash/capacity/package-root internal-kind closure是否保持；generic public facade不能创建或恢复internal kind，module-private capability与global preflight仍是唯一authority。
6. DownloadDiscardWitness三record non-lossy lineage、两code crash recovery、success candidate、complete private set before public CAS、phase-aware join、provider-specific contract与World/four-tools boundary保持闭合。

## Required counterexamples

- 两个独立process对same Data Root identity+seed产生所有六阶段byte/digest exact；different root或seed任一字段产生不同operation/binding/body/marker且不能replay；
- candidateIdentity注入installBindingDigest、namespace body/digest、marker body/digest或未知field全部structural fail before mutation；
- durable intent/candidate/namespace.json/marker逐字段drift，same body但foreign binding、same marker bytes但replacement inode，startup全局preflight fail closed且零partial cleanup；
- kill于namespace intent、candidate marker、namespace file/children fsync、rename、receipts fsync、result/cleanup，每次只可继续到complete namespace或保留recovery-required evidence；
- retain DownloadDiscardWitness two-code/full kill+drift、internal kinds七入口、capacity、first-member-public-CAS-absent/publication 0-or-complete probes。

## Verdict

```text
decision: approved | changes_requested | blocked
may_implement: yes | no
P0/P1/P2: <counts + findings>
checks: <mandatory closure + counterexample evidence>
frozen_identity: <start/end>
boundary_attestation: <fresh/read-only/no-auth/no-forbidden-read>
```
