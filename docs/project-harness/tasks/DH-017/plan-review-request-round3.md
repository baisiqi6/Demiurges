# DH-017 Plan Review Request — Round 3

## Review contract

- Decision：`approved | changes_requested | blocked`；Gate：仅`P0=0 && P1=0`可`approved / may_implement=yes`；
- fresh、independent、read-only；不修改仓库、不安装、不读Keychain、不运行authenticated/provider request、不commit/push；
- 唯一仓库入口必须是本文件；不得读取Round 1/2 requests、旧verdict/reviewer outputs、`current/review-packet.md`、findings/progress review notes或future packet；
- allowed repo reads仅限下列23-file manifest；allowed public docs仅限：
  - `https://docs.worldlabs.ai/api`
  - `https://docs.worldlabs.ai/api/reference/worlds/generate`
  - `https://docs.worldlabs.ai/api/reference/openapi`
  - `https://docs.worldlabs.ai/api/models`
  - `https://cloud.tencent.com/document/product/1804/126189`
  - `https://cloud.tencent.com/document/product/1804/120838`
  - `https://cloud.tencent.com/document/product/1804/123447`
  - `https://cloud.tencent.com/document/product/1804/123448`
- 首个P0/P1先即时报告最小逐行/状态机反例；随后只完成request-scoped必要复核与终点freeze，不扩展机会型P2。

## Frozen identity

- Worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-017`
- Branch：`agent/codex/DH-017`
- HEAD/base：`13300788f2d40e525fec91befca78f3fc4849831`
- Plan SHA-256：`3c8c9e165fb2408e85c225ece5e8b28cab989b5cea0cebee07196ccffea30444`
- Ordered 23-file aggregate：`5f3aaddcce3228d1a1a586aabd2619bb0ed2272fa4c6cfb3f3b339eea998891e`

起终点复算branch、HEAD、status、23个单文件SHA与aggregate；任何drift必须报告。

## Ordered manifest

```text
353dba879a20c570e438fef3681f412a084456ab3b38b70f14ec2773fa1e2f42  AGENTS.md
a335dafd9d996f7bf15346890d3056333f3a9efaec98df3820d69cd5360b20c4  docs/project-harness/scope.md
fef6f9d56d30bd1e2b0d36340603a58b7fc6b8f630234f73bd4f6e9f23c57dcb  docs/project-harness/architecture.md
9102a3d16806873dca31a118340ddac030c2101e28bd5a27349e4fd5ce8e0acf  docs/project-harness/domain-model.md
6a6d851c490071480f10772f86877d968b0e8e1a22adb986d287aae304766038  docs/project-harness/progress.md
f0427dad4bd13e37e626eb6d348dab2ca3104121b6690e950cdeac4604d4d365  docs/project-harness/harness-checklist.json
76cfb49c659bf37afee9665d6377e878635262d34659917d16ae75f7362a726e  docs/project-harness/current/task_plan.md
932da22e96c9aedc678811530384b70ff658afa3832f02ee2bf89e9243ca2f52  docs/project-harness/tasks/DH-013/plan.md
b9afeb0ba52125fb30e2923d716f132b9716032c64bf0dad48a05170624503ed  docs/project-harness/tasks/DH-016/plan.md
3c8c9e165fb2408e85c225ece5e8b28cab989b5cea0cebee07196ccffea30444  docs/project-harness/tasks/DH-017/plan.md
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

Aggregate算法：固定顺序完整`shasum -a 256 <file>`的23行原样文本再做SHA-256。

## Mandatory closure

1. GenerationBindingBody/Intent的exact fields、request/provider projection、request/generation/binding digest是否无含混且跨进程可重算？
2. state record sequence/filename/head/payload与256/128/8192/8/5s bounds是否形成bounded startup；`admitted` crash、pre-submit blocked、documented rejection与ambiguous submit是否各有唯一可达后继且不会duplicate paid submit？
3. generated-set OperationBinding的target/candidate/publishedIdentity是否完整；publication binding、catalog body/digest是否无循环hash，reader/recovery能唯一重算？
4. content record是否完全不含provider/role/job；cross-provider byte-identical GLB是否复用content而保留distinct provenance/set？
5. Hunyuan default `[OBJ,GLB]`是否被合法接纳且只下载/登记唯一GLB，同时duplicate/unknown/missing GLB fail closed？
6. Marble operation/world IDs是否不能改变authenticated URL path/query，且没有假称provider只会返回UUID？
7. set-level 0-or-complete visibility、confirmation/cost gate、refresh discovery、provider budgets/host/redaction、zero-world-authority与Chromium tests是否仍闭合？
8. allowed implementation surface是否足够而没有修改Kernel/Repository/World Project v1/四工具或建立generic provider framework？

## Required verdict shape

```text
decision: approved | changes_requested | blocked
may_implement: yes | no
P0: <count + findings>
P1: <count + findings>
P2: <count + findings>
checks: <closure evidence>
frozen_identity: <start/end branch, HEAD, plan SHA, aggregate, status>
boundary_attestation: <read-only/no auth/no writes/no forbidden reads>
```
