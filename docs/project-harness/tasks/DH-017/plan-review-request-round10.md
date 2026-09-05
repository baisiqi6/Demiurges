# DH-017 Plan Review Request — Round 10

## Contract

- fresh independent read-only；`approved`仅当`P0=0 && P1=0`；
- 唯一repo入口为本文件；只可读取下列23 files与列出的official public docs；禁读Round1-9 request/verdict/reviewer outputs、current review packet、findings/progress review notes/future packet；
- 无repo write/install/Keychain/authenticated/provider request/Git mutation；P0/P1先即时报告，随后只完成request-scoped closure/end freeze；
- official docs：World Labs `https://docs.worldlabs.ai/api`、`/api/reference/worlds/generate`、`/api/reference/openapi`、`/api/models`；Tencent `https://cloud.tencent.com/document/product/1804/126189`、`120838`、`123447`、`123448`。

## Frozen identity

- worktree `/Users/Admin/projects/WorkTrees/Demiurges-DH-017`
- branch `agent/codex/DH-017`
- HEAD/base `13300788f2d40e525fec91befca78f3fc4849831`
- plan SHA-256 `eeef696cb7b6e4ce130262356321bd36fd65b67a6114fd43770f1e700fdfdd54`
- ordered aggregate `5662fc37574822d113f3f5966d0fd692666a857be3470348b7e6d375d3a6e11f`

起终复算branch/HEAD/status/每个SHA/aggregate；aggregate为下列固定顺序完整`shasum -a 256`文本的SHA-256。

```text
353dba879a20c570e438fef3681f412a084456ab3b38b70f14ec2773fa1e2f42  AGENTS.md
a335dafd9d996f7bf15346890d3056333f3a9efaec98df3820d69cd5360b20c4  docs/project-harness/scope.md
fef6f9d56d30bd1e2b0d36340603a58b7fc6b8f630234f73bd4f6e9f23c57dcb  docs/project-harness/architecture.md
9102a3d16806873dca31a118340ddac030c2101e28bd5a27349e4fd5ce8e0acf  docs/project-harness/domain-model.md
6a6d851c490071480f10772f86877d968b0e8e1a22adb986d287aae304766038  docs/project-harness/progress.md
367175c8d462a13c132fcea9371810d2a5116275cac3e9fc2ee07d0997c5f20c  docs/project-harness/harness-checklist.json
4d1a4637e2572bc8c2c75cbb8897cc5f195ddfda48dfe49cb3d87270a5f013b5  docs/project-harness/current/task_plan.md
932da22e96c9aedc678811530384b70ff658afa3832f02ee2bf89e9243ca2f52  docs/project-harness/tasks/DH-013/plan.md
b9afeb0ba52125fb30e2923d716f132b9716032c64bf0dad48a05170624503ed  docs/project-harness/tasks/DH-016/plan.md
eeef696cb7b6e4ce130262356321bd36fd65b67a6114fd43770f1e700fdfdd54  docs/project-harness/tasks/DH-017/plan.md
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

1. private download是否形成两个互不偷渡authority的closed branches：成功`owned-next → cleanup-authorized → candidate`，失败`owned-next → discard-authorized → discarded → retry | timed_out | artifact_rejected`。
2. `owned-next`是否只提供stable inode witness而不直接授权unlink；两种authorization是否都必须绑定同member/cycle/attempt/checkpoint、immediate predecessor与同一dev/ino，并且只允许各自冻结的删除集合。
3. `discard-authorized` commit前是否要求data+owner两名exact同inode；commit后both-present/data-only/owner-only/both-absent是否都有唯一幂等结果，replacement/foreign/missing-before-authorization是否保留并recovery-required。
4. `discarded`是否只在两名absent且directory fsync完成后durable；只有它能进入attempt 2、timed_out或artifact_rejected，并保持Marble 4/Hunyuan 2 entry cap与串行member数学成立。
5. 成功candidate branch原有owner/bin/kill/replacement/join closure是否保持；只有`candidate`可参加complete private set join与public CAS。
6. package-root `OperationJournal`全部mint/recovery/finalize/cleanup入口对两个internal kinds的零mutation拒绝、module-private core/capabilities与startup branded plan是否保持闭合并兼容DH-016。
7. namespace install、receipt/record capacity、global preflight、phase-aware join、set-level visibility、provider-specific request/poll/cost与World/four-tools boundary是否仍闭合；实现surface仍是最小provider-specific services + package-owned lifecycle authority。

## Required counterexamples

- partial stream、truncation、transient fetch与terminal inspect rejection分别从exact owned pair进入正确discard reason；owned-next下任一name missing/replaced不得铸造discard authorization；
- kill于discard-authorized record/head、first unlink、second unlink、downloads fsync、discarded record/head：重启只删除仍与recorded inode一致的authorized names，both-absent可完成，任一foreign/replacement保留且零额外cleanup；
- attempt 1 transient discard完成前attempt 2不能reserved；完成后Marble first candidate + second retry与Hunyuan retry均不超过4/2，limit+1创建前fail closed；attempt 2 exhausted只能timed_out，reject-artifact只能artifact_rejected；
- 成功路径继续覆盖`.bin`rename、cleanup-authorized、owner unlink/fsync、candidate head、owner/bin byte-identical replacement与candidate join；
- 两个internal kinds逐一走package-root `admit/beginRecovery/inspectExistingAttempts/confirmExistingTerminal/finalizeSuccess/finalizeAborted/cleanupAttempt`与伪/foreign/replayed capability，receipt/staging/CAS零mutation；module-private exact路径成功；
- retain namespace/capacity/first-member-public-CAS-absent/publication 0-or-complete probes。

## Verdict

```text
decision: approved | changes_requested | blocked
may_implement: yes | no
P0/P1/P2: <counts + findings>
checks: <mandatory closure + counterexample evidence>
frozen_identity: <start/end>
boundary_attestation: <fresh/read-only/no-auth/no-forbidden-read>
```
