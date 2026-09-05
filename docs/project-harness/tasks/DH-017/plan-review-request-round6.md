# DH-017 Plan Review Request — Round 6

## Contract

- fresh independent read-only；`approved`仅当`P0=0 && P1=0`；
- 唯一repo入口为本文件；只可读取下列23 files与列出的official public docs；禁读Round1-5 request/verdict/reviewer outputs、current review packet、findings/progress review notes/future packet；
- 无repo write/install/Keychain/authenticated/provider request/Git mutation；P0/P1先即时报告，随后只完成request-scoped closure/end freeze；
- official docs：World Labs `https://docs.worldlabs.ai/api`、`/api/reference/worlds/generate`、`/api/reference/openapi`、`/api/models`；Tencent `https://cloud.tencent.com/document/product/1804/126189`、`120838`、`123447`、`123448`。

## Frozen identity

- worktree `/Users/Admin/projects/WorkTrees/Demiurges-DH-017`
- branch `agent/codex/DH-017`
- HEAD/base `13300788f2d40e525fec91befca78f3fc4849831`
- plan SHA-256 `ace3702a2f45375db1985552b8f86bb8a9a6005ae44b44ddc69d4e4d2eece5a6`
- ordered aggregate `4822bc71e52e9eb97c951e4a7967105b8ecc65583ba793046da63c9e97e59098`

起终复算branch/HEAD/status/每个SHA/aggregate。aggregate算法是对下列固定顺序完整`shasum -a 256`文本再次执行SHA-256。

```text
353dba879a20c570e438fef3681f412a084456ab3b38b70f14ec2773fa1e2f42  AGENTS.md
a335dafd9d996f7bf15346890d3056333f3a9efaec98df3820d69cd5360b20c4  docs/project-harness/scope.md
fef6f9d56d30bd1e2b0d36340603a58b7fc6b8f630234f73bd4f6e9f23c57dcb  docs/project-harness/architecture.md
9102a3d16806873dca31a118340ddac030c2101e28bd5a27349e4fd5ce8e0acf  docs/project-harness/domain-model.md
6a6d851c490071480f10772f86877d968b0e8e1a22adb986d287aae304766038  docs/project-harness/progress.md
e3f52e239ddd0091cb3d0304a3e6267914aded6764d565660cd6b444ed6b5e2b  docs/project-harness/harness-checklist.json
f2a4b2dd45daee3adbfcb66f5772b0ed30ef1f072969ad5af4e918bba7aaec4d  docs/project-harness/current/task_plan.md
932da22e96c9aedc678811530384b70ff658afa3832f02ee2bf89e9243ca2f52  docs/project-harness/tasks/DH-013/plan.md
b9afeb0ba52125fb30e2923d716f132b9716032c64bf0dad48a05170624503ed  docs/project-harness/tasks/DH-016/plan.md
ace3702a2f45375db1985552b8f86bb8a9a6005ae44b44ddc69d4e4d2eece5a6  docs/project-harness/tasks/DH-017/plan.md
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

1. birth-staging hard-link成功路径与catalog-present recovery是否都证明same inode/body后unlink+fsync，且连续正常birth不会撞16-candidate上限；foreign/duplicate candidate是否保留证据？
2. `DownloadBudgetV1`是否对每个member download与metadata refresh在side effect前durable checkpoint；restart/crash是否只消费remaining allowance且不持久化URL？Marble两member与Hunyuan一member的512-record上限是否足够？
3. 2048 capacity公式是否正确处理legacy namespace absent额外1 slot、pending result、active reservation、publishing 2→1+1转换、ambiguous/recovery-required保守占用，且无double/under-count？
4. phase-aware join是否在candidate阶段只依赖已下载bytes与absent/existing observations并唯一derivepublication plan，在published阶段关闭Operation intent/result+catalog；是否可在first mutation前执行且无循环依赖？
5. public `OperationJournal.admit(generatedKind)`、伪/重放/foreign capability是否确实被设计为不可达；safe facade如何在不破坏既有Operation API下完成join/capacity/single-flight/admission？
6. startup是否是全root只读preflight→ordinary recovery→generated-set recovery→generation reconciliation/resume；任一Generation/join漂移能否在任何DH-016/generated mutation前阻断？
7. paid submit malformed/profile-drift 2xx是否唯一submission_ambiguous；Marble error cost absent/null与Hunyuan FAIL optional cost是否provider-specific且closed；ambiguous reservation重启是否唯一？
8. 先前confirmation/profile/safe path/idempotency/set-level visibility/World authority/无generic provider framework等边界是否保持，implementation surface是否仍可执行且不扩张Kernel/Repository/World Project v1？

## Required counterexamples

- 每个download/refresh checkpoint之后反复kill/restart；每cycle仍最多1 refresh、每member最多2 download fetch；
- 17个连续成功birth、catalog fsync前后kill、staging inode replacement/duplicate；
- legacy receipts 2046/2047/2048 with generations absent/present，混合pending Operation、active/publishing/ambiguous generation；
- direct generic generated-kind admit与伪capability；zero receipt/staging/CAS mutation；
- individually valid但catalog/result/Generation cross-drift，混合普通Project pending；全局first mutation前fail closed；
- paid submit malformed 2xx、Marble error+non-null cost、Hunyuan FAIL valid/absent/invalid cost；state/code唯一。

## Verdict

```text
decision: approved | changes_requested | blocked
may_implement: yes | no
P0/P1/P2: <counts + findings>
checks: <mandatory closure + counterexample evidence>
frozen_identity: <start/end>
boundary_attestation: <fresh/read-only/no-auth/no-forbidden-read>
```
