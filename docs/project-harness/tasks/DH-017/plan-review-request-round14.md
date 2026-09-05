# DH-017 Plan Review Request — Round 14

## Contract

- fresh independent read-only；`approved`仅当`P0=0 && P1=0`；
- 唯一repo入口为本文件；只可读取下列22 files与列出的official public docs；禁读Round1-13 request/verdict/reviewer outputs、`harness-checklist.json`、current review packet、findings/progress review notes/future packet；
- 无repo write/install/Keychain/authenticated/provider request/Git mutation；P0/P1先即时报告，随后只完成request-scoped closure/end freeze；
- official docs：World Labs `https://docs.worldlabs.ai/api`、`/api/reference/worlds/generate`、`/api/reference/openapi`、`/api/models`；Tencent `https://cloud.tencent.com/document/product/1804/126189`、`120838`、`123447`、`123448`。

## Frozen identity

- worktree `/Users/Admin/projects/WorkTrees/Demiurges-DH-017`
- branch `agent/codex/DH-017`
- HEAD/base `13300788f2d40e525fec91befca78f3fc4849831`
- plan SHA-256 `456aa600d292b05e926ee9c974078279e86ccc0296ee4c3831d078cec35168dc`
- ordered aggregate `cb54418e7723f279d825ba76dc486d855c69ca0afd79fdbe5285b0a417b9ec9e`

起终复算branch/HEAD/status/每个SHA/aggregate；aggregate为下列固定顺序完整`shasum -a 256`文本的SHA-256。`git status`只观察path/status，不得打开禁读文件。

```text
353dba879a20c570e438fef3681f412a084456ab3b38b70f14ec2773fa1e2f42  AGENTS.md
a335dafd9d996f7bf15346890d3056333f3a9efaec98df3820d69cd5360b20c4  docs/project-harness/scope.md
fef6f9d56d30bd1e2b0d36340603a58b7fc6b8f630234f73bd4f6e9f23c57dcb  docs/project-harness/architecture.md
9102a3d16806873dca31a118340ddac030c2101e28bd5a27349e4fd5ce8e0acf  docs/project-harness/domain-model.md
6a6d851c490071480f10772f86877d968b0e8e1a22adb986d287aae304766038  docs/project-harness/progress.md
3a2af98659061b4730724411fa5b312b3a96295b7e685df4bab5780395c95a4a  docs/project-harness/current/task_plan.md
932da22e96c9aedc678811530384b70ff658afa3832f02ee2bf89e9243ca2f52  docs/project-harness/tasks/DH-013/plan.md
b9afeb0ba52125fb30e2923d716f132b9716032c64bf0dad48a05170624503ed  docs/project-harness/tasks/DH-016/plan.md
456aa600d292b05e926ee9c974078279e86ccc0296ee4c3831d078cec35168dc  docs/project-harness/tasks/DH-017/plan.md
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

1. Namespace root identity必须byte-exact复用live DH-016 lease digest；same held-root aliases一致、different dev/ino不可replay。identity DAG与candidateIdentity仍无环。
2. Final namespace exact五项entry set、candidate directory identity与durable intent hard-link marker是否形成持久provenance；pending与terminal recovery能否拒绝same marker bytes replacement inode、same body foreign binding与directory replacement，且不依赖已cleanup attempt。
3. Namespace intent→mkdir→intent hard-link→namespace write→children fsync→rename→receipts fsync→result→cleanup是否每个kill point唯一；durable intent/final marker永久保留，package-root internal-kind与global preflight/capacity保持。
4. Submit classification必须provider-specific：World Labs只有frozen documented no-creation rejections可provider_failed；Hunyuan fetch开始后无trustworthy JobId的一切response/error均submission_ambiguous，不能自动重提。
5. `ArtifactInspectorDescriptorV1` exact profile/schema/digest必须绑定candidate、content record与publication identity；restart/recovery按frozen profile重算，code/profile/field drift在public mutation前拒绝，static DH-013 authority不变。
6. Confirmation store 256 global/16 session/16KiB与expiry-before-insert，以及root receipts incremental 2049 stop是否有界、并发可执行且保持既有classification。
7. DownloadDiscardWitness、success candidate、complete private set before public CAS、phase-aware join、set visibility与World/four-tools boundary保持闭合。

## Required counterexamples

- same-root alias/different-root golden vectors；candidate注入successor或caller root digest；namespace body/marker/directory逐字段与inode drift；
- namespace每个link/fsync/rename/result/cleanup kill；final marker与intent receipt hard-link被byte-identical新inode替换；attempt已cleanup后仍能fail closed；
- World Labs documented 4xx matrix与Hunyuan 400/401/402/422/429/5xx/malformed/transport无JobId矩阵，restart/reconfirm submit count不增加；
- SPZ/GLB inspector descriptor两个process golden vectors；profile、digest、bounds、elementCount、format、byteLength/content digest逐项drift；
- confirmation第17/257项、16KiB+1、expiry/consume释放、并发；receipts 2048/2049、generations symlink/wrong-type/unknown entry；
- retain download witness two-code/full kill+drift、internal kinds七入口、capacity、first-member-public-CAS-absent/publication 0-or-complete probes。

## Verdict

```text
decision: approved | changes_requested | blocked
may_implement: yes | no
P0/P1/P2: <counts + findings>
checks: <mandatory closure + counterexample evidence>
frozen_identity: <start/end>
boundary_attestation: <fresh/read-only/no-auth/no-forbidden-read>
```
