# DH-017 Plan Review Request — Round 15

## Contract

- fresh independent read-only；`approved`仅当`P0=0 && P1=0`；
- 唯一repo入口为本文件；只可读取下列22 files与列出的official public docs；禁读Round1-14 request/verdict/reviewer outputs、`harness-checklist.json`、current review packet、findings/progress review notes/future packet；
- 无repo write/install/Keychain/authenticated/provider request/Git mutation；P0/P1先即时报告，随后只完成request-scoped closure/end freeze；
- official docs：World Labs `https://docs.worldlabs.ai/api`、`/api/reference/worlds/generate`、`/api/reference/openapi`、`/api/models`；Tencent `https://cloud.tencent.com/document/product/1804/126189`、`120838`、`123447`、`123448`。

## Frozen identity

- worktree `/Users/Admin/projects/WorkTrees/Demiurges-DH-017`
- branch `agent/codex/DH-017`
- HEAD/base `13300788f2d40e525fec91befca78f3fc4849831`
- plan SHA-256 `d0722047db81f8c1ff25515d362932b058400f08d7f5fe081ee4678831f84c52`
- ordered aggregate `541dc29ec7d10a05f8f47155d3afef721f8fe46eed05471611905e39cab3dd07`

起终复算branch/HEAD/status/每个SHA/aggregate；aggregate为下列固定顺序完整`shasum -a 256`文本的SHA-256。`git status`只观察path/status，不得打开禁读文件。

```text
353dba879a20c570e438fef3681f412a084456ab3b38b70f14ec2773fa1e2f42  AGENTS.md
a335dafd9d996f7bf15346890d3056333f3a9efaec98df3820d69cd5360b20c4  docs/project-harness/scope.md
fef6f9d56d30bd1e2b0d36340603a58b7fc6b8f630234f73bd4f6e9f23c57dcb  docs/project-harness/architecture.md
9102a3d16806873dca31a118340ddac030c2101e28bd5a27349e4fd5ce8e0acf  docs/project-harness/domain-model.md
6a6d851c490071480f10772f86877d968b0e8e1a22adb986d287aae304766038  docs/project-harness/progress.md
afc5da3df5027c416c4ab90f98401832174e186ebdd89edfbae0cc3997253dfd  docs/project-harness/current/task_plan.md
932da22e96c9aedc678811530384b70ff658afa3832f02ee2bf89e9243ca2f52  docs/project-harness/tasks/DH-013/plan.md
b9afeb0ba52125fb30e2923d716f132b9716032c64bf0dad48a05170624503ed  docs/project-harness/tasks/DH-016/plan.md
d0722047db81f8c1ff25515d362932b058400f08d7f5fe081ee4678831f84c52  docs/project-harness/tasks/DH-017/plan.md
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

1. Namespace tree/seed/live/startup/pending/terminal exact set必须统一五项，并永久验证final marker与durable intent same inode/body；attempt cleanup后仍可拒绝replacement/missing/foreign binding/directory replacement。
2. Internal namespace Operation必须使用既有合法ID grammar、flat staging grammar与exact `publishedIdentity=namespaceSeedDigest`；package-root仍拒绝internal kind。`renameatx_np(RENAME_EXCL)` capability probe/stop gate不得有TOCTOU fallback。
3. Namespace capacity在absent/no-intent、intent-pending、directory-published/result-pending、terminal-installed四态actual+reservation不重复，总占用3；first generation再加future publication 2。
4. Confirmation session只来自active ProductSession route registry，request digest不含session而confirmation payload含session；foreign/body/header/cookie session不可消费token，16/session与global/byte cap可执行。
5. Multi-member candidate只在首次引入要求immediate cleanup-authorized；后续byte-exact carry并沿bounded chain证明唯一introduction。Marble第二member与cycle2 retained candidate必须可解码。
6. Provider-specific submit ambiguity、InspectorDescriptor、DownloadDiscardWitness、complete private set before public CAS、phase-aware join与World/four-tools boundary保持。

## Required counterexamples

- namespace five-entry所有enumerators；marker missing/wrong/replaced after attempt cleanup；合法/非法internal ID、flat/nested staging、success result drift；rename destination absent/existing dir/file/symlink capability probe；
- capacity四态在2044..2048与crash transitions不double count；
- 两active sessions same binding、foreign token、body/header/cookie spoof、第17/257/16KiB+1与consume/expiry/teardown并发；
- Marble member1 candidate carry through member2 lifecycle、candidate second introduction/drift/rollback；cycle1 timed_out→cycle2 retained candidate与unfinished reset；
- retain provider matrix、inspector drift、download witness two-code/full kill+drift、internal kinds七入口、receipts 2048/2049、first-member-public-CAS-absent/publication 0-or-complete probes。

## Verdict

```text
decision: approved | changes_requested | blocked
may_implement: yes | no
P0/P1/P2: <counts + findings>
checks: <mandatory closure + counterexample evidence>
frozen_identity: <start/end>
boundary_attestation: <fresh/read-only/no-auth/no-forbidden-read>
```
