# DH-017 Plan Review Request — Round 2

## Review contract

- Decision：`approved | changes_requested | blocked`；
- Gate：只有 `P0=0` 且 `P1=0` 才可 `approved / may_implement=yes`；
- 模式：fresh、independent、read-only；
- 不修改仓库，不运行 provider/authenticated request，不读取 Keychain，不安装依赖，不 commit/push；
- 首个仓库入口必须是本文件；不得读取 Round 1 request、任何旧 verdict/reviewer output、`current/review-packet.md`、findings/progress review notes 或 future packet；
- 可以只读访问本 request 列出的 23 个文件，以及下列官方公开文档；不得扫描其他历史 review/verdict；
- 官方公开文档：
  - `https://docs.worldlabs.ai/api`
  - `https://docs.worldlabs.ai/api/reference/worlds/generate`
  - `https://docs.worldlabs.ai/api/reference/openapi`
  - `https://docs.worldlabs.ai/api/models`
  - `https://cloud.tencent.com/document/product/1804/126189`
  - `https://cloud.tencent.com/document/product/1804/120838`
  - `https://cloud.tencent.com/document/product/1804/123447`
  - `https://cloud.tencent.com/document/product/1804/123448`
- 若发现 P0/P1，先报告最小逐行或状态机反例，再完成必要的 request-scoped 复核并收口；不要扩展机会型 P2 scan。

## Frozen identity

- Worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-017`
- Branch：`agent/codex/DH-017`
- HEAD/base：`13300788f2d40e525fec91befca78f3fc4849831`
- Plan SHA-256：`b1d8306e8b31b7cbf693565be2dc79dc4a55d53b9273f58f5343445379b57b68`
- Ordered 23-file aggregate：`652dac8888033a9a8b5499932e64b29f940d300436e219bc8a4781785fcfdea9`

请在审查起点和终点复算 branch、HEAD、`git status --short`、23 个单文件 SHA 与 aggregate；任何 drift 都必须报告，不得审查移动目标。

## Ordered manifest

```text
353dba879a20c570e438fef3681f412a084456ab3b38b70f14ec2773fa1e2f42  AGENTS.md
a335dafd9d996f7bf15346890d3056333f3a9efaec98df3820d69cd5360b20c4  docs/project-harness/scope.md
fef6f9d56d30bd1e2b0d36340603a58b7fc6b8f630234f73bd4f6e9f23c57dcb  docs/project-harness/architecture.md
9102a3d16806873dca31a118340ddac030c2101e28bd5a27349e4fd5ce8e0acf  docs/project-harness/domain-model.md
6a6d851c490071480f10772f86877d968b0e8e1a22adb986d287aae304766038  docs/project-harness/progress.md
7cd3a19e28503f2b609e6e6ef4e190ee7983267248d44a712cfb7fad596a4943  docs/project-harness/harness-checklist.json
76cfb49c659bf37afee9665d6377e878635262d34659917d16ae75f7362a726e  docs/project-harness/current/task_plan.md
932da22e96c9aedc678811530384b70ff658afa3832f02ee2bf89e9243ca2f52  docs/project-harness/tasks/DH-013/plan.md
b9afeb0ba52125fb30e2923d716f132b9716032c64bf0dad48a05170624503ed  docs/project-harness/tasks/DH-016/plan.md
b1d8306e8b31b7cbf693565be2dc79dc4a55d53b9273f58f5343445379b57b68  docs/project-harness/tasks/DH-017/plan.md
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

Aggregate算法：按上述顺序运行完整`shasum -a 256 <file>`，把原样23行文本送入`shasum -a 256`。

## Round 2 mandatory review questions

1. `GenerationJournalV1` 与 existing terminal-only `OperationJournal` 是否形成两层明确 authority；receipt namespace、startup order、pending/ambiguous/resume与single-flight是否无冲突？
2. confirmation precedence是否同时满足single-use gate与same-binding durable replay，且leader/follower/响应丢失时都不会二次paid submit？
3. 无可信pre-submit quote时，v1只允许`costUnknownAccepted=true`是否诚实可执行，并阻止伪numeric cap？
4. `generationId/requestDigest`、state record/head、content/provenance/set/catalog/publication operation的domain-separated identity是否完整、无self-hash、跨进程确定？
5. Marble两个member是否通过catalog pointer + durable terminal result形成0-or-complete的set-level public visibility；每个link/fsync crash window能否恢复且不暴露半套资产？
6. 两个paid job产生相同bytes时，content identity复用而generation provenance/set保持独立，是否不存在same assetId conflicting record？
7. provider exact profile、ID、status/output schema、host/redirect、credential forwarding、body/prompt/JSON/download/time/attempt预算与stable error mapping是否已经客观可实现？计划是否诚实阻断尚未captured的Hunyuan compatibility profile？
8. refresh是否可只靠bounded `GET /api/generations`重新发现durable ID，而不依赖丢失的component memory？
9. allowed implementation surface是否明确授权最小journal/layout/recovery seam，又保持Kernel/Repository/World Project v1/四工具不变？
10. acceptance matrix是否覆盖GenerationJournal crash chain、set publication每一member边界、visibility/result mismatch、duplicate-content provenance、secret scan、zero-world-mutation与真实Chromium？

## Required verdict shape

```text
decision: approved | changes_requested | blocked
may_implement: yes | no
P0: <count + findings>
P1: <count + findings>
P2: <count + findings>
checks: <files/contracts/probes inspected>
frozen_identity: <start/end branch, HEAD, plan SHA, aggregate, status>
boundary_attestation: <read-only/no auth/no writes/no forbidden review reads>
```
