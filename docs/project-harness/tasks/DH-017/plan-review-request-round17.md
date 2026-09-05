# DH-017 Plan Review Request — Round 17

## Contract

- fresh independent read-only；`approved`仅当`P0=0 && P1=0`；
- 唯一repo入口为本文件；只可读取下列22 files与列出的official public docs；禁读Round1-16 request/verdict/reviewer outputs、`harness-checklist.json`、current review packet、findings/progress review notes/future packet；
- 无repo write/install/Keychain/authenticated/provider request/Git mutation；P0/P1先即时报告，随后只完成request-scoped closure/end freeze；
- official docs：World Labs `https://docs.worldlabs.ai/api`、`/api/reference/worlds/generate`、`/api/reference/openapi`、`/api/models`；Tencent `https://cloud.tencent.com/document/product/1804/126189`、`120838`、`123447`、`123448`。

## Frozen identity

- worktree `/Users/Admin/projects/WorkTrees/Demiurges-DH-017`
- branch `agent/codex/DH-017`
- HEAD/base `13300788f2d40e525fec91befca78f3fc4849831`
- plan SHA-256 `9b8a4b94b8a2b86abe8b39ec61a63bd321160420e6e06390e92942cf341b5b20`
- ordered aggregate `9613ae69cde1ac8419a11fc2374fd76f0cab1724af3bc513b7b305a70fbbb3f8`

起终复算branch/HEAD/status/每个SHA/aggregate；aggregate为下列固定顺序完整`shasum -a 256`文本的SHA-256。`git status`只观察path/status，不得打开禁读文件。

```text
353dba879a20c570e438fef3681f412a084456ab3b38b70f14ec2773fa1e2f42  AGENTS.md
a335dafd9d996f7bf15346890d3056333f3a9efaec98df3820d69cd5360b20c4  docs/project-harness/scope.md
fef6f9d56d30bd1e2b0d36340603a58b7fc6b8f630234f73bd4f6e9f23c57dcb  docs/project-harness/architecture.md
9102a3d16806873dca31a118340ddac030c2101e28bd5a27349e4fd5ce8e0acf  docs/project-harness/domain-model.md
6a6d851c490071480f10772f86877d968b0e8e1a22adb986d287aae304766038  docs/project-harness/progress.md
a3729670e87356c369392e3d810ad2cd50b87d4508156b4b1e02e6e23e07fd4a  docs/project-harness/current/task_plan.md
932da22e96c9aedc678811530384b70ff658afa3832f02ee2bf89e9243ca2f52  docs/project-harness/tasks/DH-013/plan.md
b9afeb0ba52125fb30e2923d716f132b9716032c64bf0dad48a05170624503ed  docs/project-harness/tasks/DH-016/plan.md
9b8a4b94b8a2b86abe8b39ec61a63bd321160420e6e06390e92942cf341b5b20  docs/project-harness/tasks/DH-017/plan.md
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

1. `.record.next.witness`必须是pending raw state record的durable external inode anchor；冻结exact generation/sequence/digest/name/dev/ino/mode/uid/gid，不改committed raw record digest/golden vector。witness durable前partial next保留/recovery-required，witness durable后才能continue/link/head/cleanup。
2. next/witness/pending-final/head的逐fsync kill matrix必须拒绝same-bytes next/final replacement（单名或两名同时替换）、byte-identical witness + new record inode、missing/wrong/extra；cleanup只在head final与witness重验后执行。physical caps exact为514/generation、8704/root，witness 1 KiB、record 64 KiB。
3. generated-set publication必须唯一intent-first：candidate join/capacity→exact Operation intent durable→capacity重算actual1+pending-result1接管reservation2→publishing head durable→public CAS。critical section不被当作crash atomicity。
4. Capacity/startup对`validating + matching intent`幂等补publishing且public CAS=0；`publishing + no intent`保留2并fail closed；matching result + lagging state经published join收敛；conflicting/extra intent零partial mutation。near-cap 2044..2048任一kill时publication actual+reservation始终exact2。
5. Asset HTTP matrix必须closed：成功只有200；redirect只有301/302/303/307/308 + exact单一ASCII visible `Location`；missing/duplicate/invalid Location、300/304/305/306/other3xx、204/206/other2xx、nontransient4xx均`DOWNLOAD_REJECTED`且不发next request。logical/raw counters仍为2 attempts、3 GET/attempt、6/member/cycle、refresh 1。
6. 保留namespace/token/probe、ProductSession confirmation、multi-member carry、provider ambiguity、InspectorDescriptor、DownloadDiscardWitness、complete private set before public CAS、phase-aware join与World/four-tools boundary。

## Required counterexamples

- kill after next create/write/fsync，before/after witness file fsync and records fsync，pending final link/fsync，head.next/head rename/fsync，next unlink/fsync，witness unlink/fsync；逐步断言provider call、same original inode或recovery-required、零猜测cleanup；
- next/final分别same-bytes replacement、两者同时hard-link到new inode、witness byte-identical replacement + new record inode、witness missing/different/wrong type；physical 513/514、8704/8705、64 KiB/+1、1 KiB/+1、32/525 MiB +1；
- validating→Operation intent link/fsync→publishing record/head/fsync每边界kill，在2044..2048重算始终exact2；合成validating+intent、publishing-no-intent、matching-result+lagging-state、conflicting/extra intent；public CAS在publishing durable前始终0；
- 200、五个allowed redirects、missing/duplicate/invalid/relative/foreign Location、300/304/305/306/other3xx、204/206/other2xx、transient/nontransient4xx，redirect 3下一request拒绝，raw GET/refresh exact counters和hop/body/stream crash；
- retain namespace five-entry/marker/replacement、24/32 token、probe residue、capacity four-state、two-session confirmation/caps、Marble candidate carry/cycle2、provider matrix、inspector drift、download witness two-code/full kill+drift、internal kinds七入口、receipts 2048/2049、first-member-public-CAS-absent/publication 0-or-complete probes。

## Verdict

```text
decision: approved | changes_requested | blocked
may_implement: yes | no
P0/P1/P2: <counts + findings>
checks: <mandatory closure + counterexample evidence>
frozen_identity: <start/end>
boundary_attestation: <fresh/read-only/no-auth/no-forbidden-read>
```
