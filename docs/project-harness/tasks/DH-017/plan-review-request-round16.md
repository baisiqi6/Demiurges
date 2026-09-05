# DH-017 Plan Review Request — Round 16

## Contract

- fresh independent read-only；`approved`仅当`P0=0 && P1=0`；
- 唯一repo入口为本文件；只可读取下列22 files与列出的official public docs；禁读Round1-15 request/verdict/reviewer outputs、`harness-checklist.json`、current review packet、findings/progress review notes/future packet；
- 无repo write/install/Keychain/authenticated/provider request/Git mutation；P0/P1先即时报告，随后只完成request-scoped closure/end freeze；
- official docs：World Labs `https://docs.worldlabs.ai/api`、`/api/reference/worlds/generate`、`/api/reference/openapi`、`/api/models`；Tencent `https://cloud.tencent.com/document/product/1804/126189`、`120838`、`123447`、`123448`。

## Frozen identity

- worktree `/Users/Admin/projects/WorkTrees/Demiurges-DH-017`
- branch `agent/codex/DH-017`
- HEAD/base `13300788f2d40e525fec91befca78f3fc4849831`
- plan SHA-256 `a74d945c0579a12dac3afbbd6b052ac9941e6170f42698f89d5b5b1aa13b04d7`
- ordered aggregate `eeae3b44ea038da87d5f3beb1c5257bd4eeeb491c0ec36327e9d7ee893198e37`

起终复算branch/HEAD/status/每个SHA/aggregate；aggregate为下列固定顺序完整`shasum -a 256`文本的SHA-256。`git status`只观察path/status，不得打开禁读文件。

```text
353dba879a20c570e438fef3681f412a084456ab3b38b70f14ec2773fa1e2f42  AGENTS.md
a335dafd9d996f7bf15346890d3056333f3a9efaec98df3820d69cd5360b20c4  docs/project-harness/scope.md
fef6f9d56d30bd1e2b0d36340603a58b7fc6b8f630234f73bd4f6e9f23c57dcb  docs/project-harness/architecture.md
9102a3d16806873dca31a118340ddac030c2101e28bd5a27349e4fd5ce8e0acf  docs/project-harness/domain-model.md
6a6d851c490071480f10772f86877d968b0e8e1a22adb986d287aae304766038  docs/project-harness/progress.md
8cbcf8785a0d438021f12692623234d71c787c7424c0c91bcb92c1241e6e4e22  docs/project-harness/current/task_plan.md
932da22e96c9aedc678811530384b70ff658afa3832f02ee2bf89e9243ca2f52  docs/project-harness/tasks/DH-013/plan.md
b9afeb0ba52125fb30e2923d716f132b9716032c64bf0dad48a05170624503ed  docs/project-harness/tasks/DH-016/plan.md
a74d945c0579a12dac3afbbd6b052ac9941e6170f42698f89d5b5b1aa13b04d7  docs/project-harness/tasks/DH-017/plan.md
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

1. Generation state publish必须由唯一`.record.next`冻结exact `recordedAt/digest/filename/inode`；final hard-link、`head.next`、head rename与pending cleanup在任一kill后都不得产生第二digest，也不得靠忽略任意orphan恢复。
2. Physical record namespace必须bounded：单generation 513 entries/32 MiB unique-inode bytes、root 8208 entries/525 MiB、单record 64 KiB；incremental directory-handle `limit+1`先于chain decode/provider call，并与512/8192 committed caps共存。
3. Namespace root internal Operation exact复用existing 96-bit/24 lowercase-hex attempt token；Generation birth-staging仍为独立128-bit/32 hex，两者的enumerator与validation不得混用。
4. `renameatx_np(RENAME_EXCL)` semantics probe只可在global read-only preflight后、durable namespace install Operation的exact flat attempt `.rename-probe/`内运行；其residue由同Operation binding验证/清理，foreign/replacement/extra保留且writer不开启。
5. Download budget必须exact区分logical attempt与raw request：每member/cycle最多2个logical attempts；每个是initial GET + 最多2 manual redirects，所以最多3 raw asset GET/attempt、6/member/cycle。crash于任一hop/body/stream均消费整attempt，metadata refresh独立durable计数。
6. 保留既有五项namespace marker provenance、capacity四态、ProductSession confirmation、multi-member candidate carry、provider-specific ambiguity、InspectorDescriptor、DownloadDiscardWitness、complete private set before public CAS、phase-aware join与World/four-tools boundary。

## Required counterexamples

- state append在`.record.next` create/fsync、pending final link/records fsync、`head.next` create/fsync、head rename/generation fsync、`.record.next` unlink/records fsync的每边界kill/restart；必须复用同recordedAt/digest/inode，new head durable前provider call count不变；
- `.record.next` missing + unreferenced final、第二pending final、same-bytes replacement inode、extra/symlink/wrong type；physical 512/513、8208/8209、64 KiB/64 KiB+1、32 MiB/+1、525 MiB/+1，重复kill不突破5秒startup deadline；
- root attempt 24-hex与birth token 32-hex的exact/mixed/unknown-name matrix；probe create/link/rename/fsync/cleanup kill、same-inode continuation与foreign residue retention；
- initial GET、redirect 1、redirect 2、body/stream后kill；restart不重放同attempt，redirect 3在request前拒绝；单attempt raw GET=3、单member/cycle=6、metadata refresh=1的exact counters；
- retain namespace marker/replacement、capacity 2044..2048、two-session confirmation/caps、Marble candidate carry/cycle2、provider matrix、inspector drift、download witness two-code/full kill+drift、internal kinds七入口、receipts 2048/2049、first-member-public-CAS-absent/publication 0-or-complete probes。

## Verdict

```text
decision: approved | changes_requested | blocked
may_implement: yes | no
P0/P1/P2: <counts + findings>
checks: <mandatory closure + counterexample evidence>
frozen_identity: <start/end>
boundary_attestation: <fresh/read-only/no-auth/no-forbidden-read>
```
