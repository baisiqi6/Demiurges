# DH-017 Plan Review Request — Round 8

## Contract

- fresh independent read-only；`approved`仅当`P0=0 && P1=0`；
- 唯一repo入口为本文件；只可读取下列23 files与列出的official public docs；禁读Round1-7 request/verdict/reviewer outputs、current review packet、findings/progress review notes/future packet；
- 无repo write/install/Keychain/authenticated/provider request/Git mutation；P0/P1先即时报告，随后只完成request-scoped closure/end freeze；
- official docs：World Labs `https://docs.worldlabs.ai/api`、`/api/reference/worlds/generate`、`/api/reference/openapi`、`/api/models`；Tencent `https://cloud.tencent.com/document/product/1804/126189`、`120838`、`123447`、`123448`。

## Frozen identity

- worktree `/Users/Admin/projects/WorkTrees/Demiurges-DH-017`
- branch `agent/codex/DH-017`
- HEAD/base `13300788f2d40e525fec91befca78f3fc4849831`
- plan SHA-256 `206cfb3c8dcd70db9a8925f3780c4883dd693069d7f1f542a1d0fb80bbb2e827`
- ordered aggregate `e343b4216ea0eb8cf3f4122d39a8b75850c28da80c09396633a2ab7f3e96d60c`

起终复算branch/HEAD/status/每个SHA/aggregate；aggregate为下列固定顺序完整`shasum -a 256`文本的SHA-256。

```text
353dba879a20c570e438fef3681f412a084456ab3b38b70f14ec2773fa1e2f42  AGENTS.md
a335dafd9d996f7bf15346890d3056333f3a9efaec98df3820d69cd5360b20c4  docs/project-harness/scope.md
fef6f9d56d30bd1e2b0d36340603a58b7fc6b8f630234f73bd4f6e9f23c57dcb  docs/project-harness/architecture.md
9102a3d16806873dca31a118340ddac030c2101e28bd5a27349e4fd5ce8e0acf  docs/project-harness/domain-model.md
6a6d851c490071480f10772f86877d968b0e8e1a22adb986d287aae304766038  docs/project-harness/progress.md
6acd629c1f6bb5bb9857d9c468d01ce59db55e8936b61c923b056a7981d4f00a  docs/project-harness/harness-checklist.json
8c8ca30290a85e09b9a389dc79ae5af78321b739b8292f9faa923d686e32b1ba  docs/project-harness/current/task_plan.md
932da22e96c9aedc678811530384b70ff658afa3832f02ee2bf89e9243ca2f52  docs/project-harness/tasks/DH-013/plan.md
b9afeb0ba52125fb30e2923d716f132b9716032c64bf0dad48a05170624503ed  docs/project-harness/tasks/DH-016/plan.md
206cfb3c8dcd70db9a8925f3780c4883dd693069d7f1f542a1d0fb80bbb2e827  docs/project-harness/tasks/DH-017/plan.md
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

1. private download是否以`reserved → owned-next → candidate`三阶段闭合真实filesystem object authority：checkpoint digest必须指向同member的immediate predecessor；owned-next必须持久化`.next/.owner`同inode的`dev/ino/mode/uid/gid`；candidate必须沿用同一checkpoint与inode。
2. crash在`.next`create、owner hard-link、downloads fsync、owned-next record/head之间时，计划是否明确区分“无durable inode witness则保留并recovery-required”与“witness已durable才可继续/cleanup”；不得凭filename或byte equality删除。
3. `.next → .bin` rename、candidate state/head与owner cleanup是否逐边界可恢复；byte-identical replacement、missing/replaced owner、extra/symlink/wrong type是否在任何unlink/public CAS前fail closed；Marble 4/Hunyuan 2 entry cap是否与串行member和owner pair数学一致。
4. package-root `OperationJournal`是否对两个internal kinds在所有authority-minting/mutation入口而非仅`admit()`前置拒绝；至少核验`beginRecovery/inspectExistingAttempts/confirmExistingTerminal/finalizeSuccess/finalizeAborted/cleanupAttempt`，并确认不会创建attempt、mint authority、写receipt或cleanup。
5. module-private Operation core、namespace/generated-set capability与startup branded recovery plan是否形成唯一internal path，同时保持既有public Operation API与DH-016 recovery兼容；不能通过raw class、durable internal intent或伪`AdmittedOperation`旁路。
6. first namespace、composite receipt capacity、Generation record reservation、full-root preflight、complete private set before public CAS、phase-aware join、set-level visibility与provider-specific lifecycle是否仍闭合。
7. acceptance/implementation surface是否足以用最小code实现上述authority，而不建立generic provider/transaction framework、不修改World/四工具/World Project v1。

## Required counterexamples

- reserved checkpoint后分别kill于`.next` create、owner hard-link、downloads fsync、owned-next record与head；无witness窗口必须保留全部证据且`GENERATION_RECOVERY_REQUIRED`，不能partial cleanup；
- owned-next durable后将`.next`或`.owner`替换为byte-identical新inode；必须fail closed并保留；exact same-inode path可安全继续或cleanup；
- kill于stream fsync、`.bin`rename、candidate record/head、owner unlink/fsync；candidate只能absent/owned pending/完整referenced，不能出现猜测提升；
- Marble第一member candidate + 第二member owner pair、Hunyuan单member owner pair与`limit+1`；entry cap可执行且无并发attempt；
- 对两个internal kinds逐一调用package-root `admit/beginRecovery/inspectExistingAttempts/confirmExistingTerminal/finalizeSuccess/finalizeAborted/cleanupAttempt`，以及伪/foreign/replayed capability；receipt/staging/CAS必须零mutation；
- module-private exact namespace install与generated-set safe facade能正常admit/recover/finalize，且public caller无法取得raw internal authority；
- retain namespace/capacity/first-member-public-CAS-absent/publication 0-or-complete crash probes。

## Verdict

```text
decision: approved | changes_requested | blocked
may_implement: yes | no
P0/P1/P2: <counts + findings>
checks: <mandatory closure + counterexample evidence>
frozen_identity: <start/end>
boundary_attestation: <fresh/read-only/no-auth/no-forbidden-read>
```
