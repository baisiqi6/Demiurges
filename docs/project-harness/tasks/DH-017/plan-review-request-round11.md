# DH-017 Plan Review Request — Round 11

## Contract

- fresh independent read-only；`approved`仅当`P0=0 && P1=0`；
- 唯一repo入口为本文件；只可读取下列23 files与列出的official public docs；禁读Round1-10 request/verdict/reviewer outputs、current review packet、findings/progress review notes/future packet；
- 无repo write/install/Keychain/authenticated/provider request/Git mutation；P0/P1先即时报告，随后只完成request-scoped closure/end freeze；
- official docs：World Labs `https://docs.worldlabs.ai/api`、`/api/reference/worlds/generate`、`/api/reference/openapi`、`/api/models`；Tencent `https://cloud.tencent.com/document/product/1804/126189`、`120838`、`123447`、`123448`。

## Frozen identity

- worktree `/Users/Admin/projects/WorkTrees/Demiurges-DH-017`
- branch `agent/codex/DH-017`
- HEAD/base `13300788f2d40e525fec91befca78f3fc4849831`
- plan SHA-256 `8e198bc02d99277ded54c763eedae629e01bc9a3d3ce2fc9ad3fdc1395818853`
- ordered aggregate `a9c912d602fea0d9365acf0731e1a376b42df3e7e655c7226c5ba3838ced50b6`

起终复算branch/HEAD/status/每个SHA/aggregate；aggregate为下列固定顺序完整`shasum -a 256`文本的SHA-256。

```text
353dba879a20c570e438fef3681f412a084456ab3b38b70f14ec2773fa1e2f42  AGENTS.md
a335dafd9d996f7bf15346890d3056333f3a9efaec98df3820d69cd5360b20c4  docs/project-harness/scope.md
fef6f9d56d30bd1e2b0d36340603a58b7fc6b8f630234f73bd4f6e9f23c57dcb  docs/project-harness/architecture.md
9102a3d16806873dca31a118340ddac030c2101e28bd5a27349e4fd5ce8e0acf  docs/project-harness/domain-model.md
6a6d851c490071480f10772f86877d968b0e8e1a22adb986d287aae304766038  docs/project-harness/progress.md
9f9a55ac3144824e69aed2f0af9bcfb0d78986f4fe23194dce0536675dcaf095  docs/project-harness/harness-checklist.json
cc252ee242a2f29cb63945fe7dccb829986f8462a3088ce9af95d794ed174f34  docs/project-harness/current/task_plan.md
932da22e96c9aedc678811530384b70ff658afa3832f02ee2bf89e9243ca2f52  docs/project-harness/tasks/DH-013/plan.md
b9afeb0ba52125fb30e2923d716f132b9716032c64bf0dad48a05170624503ed  docs/project-harness/tasks/DH-016/plan.md
8e198bc02d99277ded54c763eedae629e01bc9a3d3ce2fc9ad3fdc1395818853  docs/project-harness/tasks/DH-017/plan.md
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

1. `DownloadDiscardDispositionV1`是否是closed、non-lossy durable truth：transient与两个exact artifact rejection codes互斥，code只能由删除bytes前的package-owned pure outcome derive，不能由route/caller自由选择。
2. `discard-authorized → discarded → artifact_rejected`是否逐record保持same exact disposition、immediate predecessor、member/cycle/attempt/checkpoint与inode；terminal必须逐字继承code，不能重下载、重验已删bytes或重新分类。
3. 两个 rejection code分别在authorization head、data/owner unlink、directory fsync、discarded head后crash时是否唯一恢复，并保持provider/download call count不增加；wrong-code/cross-code drift在任何cleanup/public state mutation前拒绝。
4. retry-transient不得携带code且只可进入retry/timed_out；reject-artifact必须携带closed code且只可进入artifact_rejected；失败branch的both-present/data-only/owner-only/both-absent、foreign/replacement与Marble 4/Hunyuan 2 cap closure保持成立。
5. 成功candidate branch、complete private set before public CAS、phase-aware join、set visibility保持；只有candidate可join。
6. package-root `OperationJournal`七入口对两个internal kinds、private capabilities/startup plan、namespace/capacity/global preflight、provider-specific contract与World/four-tools boundaries保持闭合。

## Required counterexamples

- URL/redirect/credential-boundary/media/body-budget rejection只能derive `DOWNLOAD_REJECTED`；format/integrity/inspector rejection只能derive `ARTIFACT_VALIDATION_FAILED`；caller传相反code、未知code或给transient附code均在discard authorization前零mutation拒绝；
- 两个exact rejection codes分别kill于discard-authorized record/head、first unlink、second unlink、downloads fsync、discarded record/head、terminal record/head，重启terminal code exact且fetch/query/provider call count不增加；
- durable discard-authorized与discarded之间cross-code drift、terminal code drift、same code但member/checkpoint/inode drift全部fail closed并保留evidence；
- partial/transient retry与attempt2/timed_out、both-present/data-only/owner-only/both-absent、replacement/foreign、Marble/Hunyuan cap仍闭合；
- retain成功candidate kill matrix、两个internal kinds七入口、namespace/capacity/first-member-public-CAS-absent/publication 0-or-complete probes。

## Verdict

```text
decision: approved | changes_requested | blocked
may_implement: yes | no
P0/P1/P2: <counts + findings>
checks: <mandatory closure + counterexample evidence>
frozen_identity: <start/end>
boundary_attestation: <fresh/read-only/no-auth/no-forbidden-read>
```
