# DH-017 Plan Review Request — Round 1

## Review contract

- Decision：`approved | changes_requested | blocked`；
- Gate：只有 `P0=0` 且 `P1=0` 才可 `approved / may_implement=yes`；
- 模式：fresh、independent、read-only；
- 不修改仓库，不运行 provider/authenticated request，不读取 Keychain，不安装依赖，不 commit/push；
- 首个仓库入口必须是本文件；不要读取另一 reviewer 输出、未来 verdict、`current/review-packet.md` 或尚未列出的 DH-017 review artifact；
- 可以只读访问本 request 列出的 23 个文件，以及下列官方公开文档；不得扫描其他历史 review/verdict/findings；
- 官方公开文档：
  - `https://docs.worldlabs.ai/api`
  - `https://docs.worldlabs.ai/api/reference/worlds/generate`
  - `https://docs.worldlabs.ai/api/reference/openapi`
  - `https://docs.worldlabs.ai/api/models`
  - `https://cloud.tencent.com/document/product/1804/126189`
  - `https://cloud.tencent.com/document/product/1804/120838`
- 若发现 P0/P1，先报告最小可执行或逐行可证反例，再完成必要的 request-scoped 复核并收口；不要扩展机会型 P2 scan。

## Frozen identity

- Worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-017`
- Branch：`agent/codex/DH-017`
- HEAD/base：`13300788f2d40e525fec91befca78f3fc4849831`
- Plan SHA-256：`ed5fe1cf09b412588ed5d35b6169443b77d6c656d4198036d0f4f832c5b45d8a`
- Ordered 23-file aggregate：`d85f398b1ddf8edefc9e996a405d51f6ac2c522cfd7d9070c39ecc813bd7f5c5`

请在审查起点和终点复算 branch、HEAD、`git status --short`、23 个单文件 SHA 与 aggregate；任何 drift 都必须报告，不得审查移动目标。

## Ordered manifest

```text
353dba879a20c570e438fef3681f412a084456ab3b38b70f14ec2773fa1e2f42  AGENTS.md
a335dafd9d996f7bf15346890d3056333f3a9efaec98df3820d69cd5360b20c4  docs/project-harness/scope.md
fef6f9d56d30bd1e2b0d36340603a58b7fc6b8f630234f73bd4f6e9f23c57dcb  docs/project-harness/architecture.md
9102a3d16806873dca31a118340ddac030c2101e28bd5a27349e4fd5ce8e0acf  docs/project-harness/domain-model.md
6a6d851c490071480f10772f86877d968b0e8e1a22adb986d287aae304766038  docs/project-harness/progress.md
474797cdd970a4e8cb099ce3ee4cc9ab463a24d85c9a11553f9978c6cb6eee4a  docs/project-harness/harness-checklist.json
76cfb49c659bf37afee9665d6377e878635262d34659917d16ae75f7362a726e  docs/project-harness/current/task_plan.md
932da22e96c9aedc678811530384b70ff658afa3832f02ee2bf89e9243ca2f52  docs/project-harness/tasks/DH-013/plan.md
b9afeb0ba52125fb30e2923d716f132b9716032c64bf0dad48a05170624503ed  docs/project-harness/tasks/DH-016/plan.md
ed5fe1cf09b412588ed5d35b6169443b77d6c656d4198036d0f4f832c5b45d8a  docs/project-harness/tasks/DH-017/plan.md
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

Aggregate 算法：按上述顺序运行完整 `shasum -a 256 <file>`，把原样 23 行文本送入 `shasum -a 256`。

## Mandatory review questions

1. 计划是否真正保持两个 provider-specific implementation，而不是换名后的通用 Adapter/SDK？
2. two-step Human confirmation 是否在 server-side provider submit 前形成不可绕过的 exact request gate？
3. 无 upstream idempotency contract 时，`submit-started → remote binding` crash window 是否诚实 fail closed，避免自动重复付费？
4. generation lifecycle 能否在 Data Root writer lease、OperationJournal、single-flight 与 restart recovery 下形成单一 durable authority？
5. dynamic `VerifiedArtifactRecordV1` 是否能在不放宽 DH-013 static registry 与 DH-016 Project v1 的前提下，安全发布、枚举、serve 并跨重启复用？
6. bytes CAS、record publish 与 terminal receipt 的顺序是否保证不会出现“可见但未验证”或“terminal success 但 record/bytes 不 durable”？
7. provider output shape、download host、redirect、credential forwarding、budget、format/bounds 与 redaction closure 是否可执行？
8. `CALIBRATION MISSING` 与“Artifact 不自动成为 Snapshot/Project”是否在 API、UI、authority tests 中闭合？
9. allowed implementation surface 是否足以落地，不迫使实现者修改 Kernel/Repository/World Project v1/四工具或偷偷建立 generic framework？
10. acceptance 是否能通过 fake provider、crash/concurrency probes、Chromium 与后续单独授权的真实 canary客观证明？

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
