# DH-017 Plan Review Request — Round 7

## Contract

- fresh independent read-only；`approved`仅当`P0=0 && P1=0`；
- 唯一repo入口为本文件；只可读取下列23 files与列出的official public docs；禁读Round1-6 request/verdict/reviewer outputs、current review packet、findings/progress review notes/future packet；
- 无repo write/install/Keychain/authenticated/provider request/Git mutation；P0/P1先即时报告，随后只完成request-scoped closure/end freeze；
- official docs：World Labs `https://docs.worldlabs.ai/api`、`/api/reference/worlds/generate`、`/api/reference/openapi`、`/api/models`；Tencent `https://cloud.tencent.com/document/product/1804/126189`、`120838`、`123447`、`123448`。

## Frozen identity

- worktree `/Users/Admin/projects/WorkTrees/Demiurges-DH-017`
- branch `agent/codex/DH-017`
- HEAD/base `13300788f2d40e525fec91befca78f3fc4849831`
- plan SHA-256 `d5bbab6a35cdd278c941b919085720bca065ccb8525601b1d1dd0fe46c8c0a68`
- ordered aggregate `2e64782505737bd6f1c61c57854617a760e1cfb7d58fe5df22f34314991c6233`

起终复算branch/HEAD/status/每个SHA/aggregate；aggregate为下列固定顺序完整`shasum -a 256`文本的SHA-256。

```text
353dba879a20c570e438fef3681f412a084456ab3b38b70f14ec2773fa1e2f42  AGENTS.md
a335dafd9d996f7bf15346890d3056333f3a9efaec98df3820d69cd5360b20c4  docs/project-harness/scope.md
fef6f9d56d30bd1e2b0d36340603a58b7fc6b8f630234f73bd4f6e9f23c57dcb  docs/project-harness/architecture.md
9102a3d16806873dca31a118340ddac030c2101e28bd5a27349e4fd5ce8e0acf  docs/project-harness/domain-model.md
6a6d851c490071480f10772f86877d968b0e8e1a22adb986d287aae304766038  docs/project-harness/progress.md
ad385e63de41fffba3dc1688fc73486fd0ec7fc8146c4f407edf00b410be4b7d  docs/project-harness/harness-checklist.json
41c55fcd34acc21bfd4c598f848c7f686b0e2bb70d7ae7fda56699eb3fa33f66  docs/project-harness/current/task_plan.md
932da22e96c9aedc678811530384b70ff658afa3832f02ee2bf89e9243ca2f52  docs/project-harness/tasks/DH-013/plan.md
b9afeb0ba52125fb30e2923d716f132b9716032c64bf0dad48a05170624503ed  docs/project-harness/tasks/DH-016/plan.md
d5bbab6a35cdd278c941b919085720bca065ccb8525601b1d1dd0fe46c8c0a68  docs/project-harness/tasks/DH-017/plan.md
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

1. first namespace是否由internal `generation.namespace.install`的durable intent覆盖全部candidate mkdir/marker/child/fsync/rename/result/cleanup窗口；partial evidence能否idempotent完成而不是terminal aborted/permanent block？
2. first composite capacity是否exact预留namespace operation 2 + final namespace entry 1 + future generated-set 2；crash完成namespace但未birth时是否provider=0且后续只需2？
3. private `downloads/`是否由Generation intent/head/attempt checkpoint授权；filename、entry/byte budget、file identity、orphan cleanup与referenced candidate restart是否闭合且无URL？
4. Marble完整2-member/Hunyuan 1-member private candidates是否在任何public Artifact CAS前完成candidate join→capacity→single-flight→internal Operation admission；CAS crash evidence是否全部被Operation binding覆盖？
5. phase-aware join、internal-kind generic admit rejection、full-root preflight/recovery ordering、birth staging、durable poll/download budget、provider-specific status/cost是否仍闭合？
6. 512 record cap、8192 record reservation、2048 receipt accounting在namespace install/private staging加入后是否仍数学可执行；private staging不应被错误计作public receipt entry但必须有自身严格cap。
7. acceptance、implementation surface与现有DH-016 Operation semantics是否足以实现上述两个internal kinds，而不建立generic provider/operation framework或破坏既有Project/Artifact/bundle recovery？
8. confirmation/idempotency/refresh discovery/safe path/set visibility/World authority/four tools边界是否保持？

## Required counterexamples

- namespace Operation intent后每个candidate mkdir/marker/child/fsync/rename/result/cleanup kill；restart到exact success或保留无partial mutation的recovery-required；
- legacy receipts 2044..2048，namespace absent/pending/present，mixed pending Operation/active generation；
- Marble first member complete后kill：public CAS仍absent，private candidate可exact恢复；第二member complete后才可admit/publish；
- private `.next/.bin` orphan、byte-identical replacement inode、digest/descriptor drift、extra entry、over-count/over-bytes；
- direct public admit两个internal kinds、伪/replayed/foreign capability；零mutation；
- publication在每个CAS/record/catalog/result边界kill；list/serve仍0-or-complete。

## Verdict

```text
decision: approved | changes_requested | blocked
may_implement: yes | no
P0/P1/P2: <counts + findings>
checks: <mandatory closure + counterexample evidence>
frozen_identity: <start/end>
boundary_attestation: <fresh/read-only/no-auth/no-forbidden-read>
```
