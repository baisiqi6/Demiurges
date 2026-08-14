# DH-015 Plan Review Request — Round 1

## Reviewer role

你是 independent plan reviewer。只读审查 DH-015 计划是否可以成为 implementation authority；不要实现、修改文件、写 review artifact、安装依赖、联网、调用 provider、commit、push、merge、tag、deploy、reset、clean 或操作其他 worktree。

不得读取另一位 reviewer 的输出、未来 verdict 文件或 `docs/project-harness/current/review-packet.md`。只依据本 request 列出的 authority、current source 与你独立执行的只读检查给出结论。

## Frozen identity

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-015`
- branch：`agent/codex/DH-015`
- HEAD/base：`1805d73055a79a7e0506afafebaffd7b308706f9`
- plan SHA-256：`d9db719985e847d7edc3655f80c9c19666b52665f361513d42864eef5741b5ca`
- ordered 18-file manifest aggregate：`db55efe0ed5f599d89b8049cb75c694ac316dfd85ad10da477e4be09236d0c25`
- aggregate 算法：对下列固定顺序执行完整 `shasum -a 256` 文本，再对该完整文本执行 `shasum -a 256`。

```text
353dba879a20c570e438fef3681f412a084456ab3b38b70f14ec2773fa1e2f42  AGENTS.md
a335dafd9d996f7bf15346890d3056333f3a9efaec98df3820d69cd5360b20c4  docs/project-harness/scope.md
fef6f9d56d30bd1e2b0d36340603a58b7fc6b8f630234f73bd4f6e9f23c57dcb  docs/project-harness/architecture.md
9102a3d16806873dca31a118340ddac030c2101e28bd5a27349e4fd5ce8e0acf  docs/project-harness/domain-model.md
c290ebcd70e8c3776cf808275c49528a2e6bb191c5b8944c0f2a80511cc55a4b  docs/project-harness/observer-embodiment.md
601e85f2e6794158cb94d33da31bb399a7e0272966d7d7b7180510cc1f816342  docs/project-harness/harness-checklist.json
932da22e96c9aedc678811530384b70ff658afa3832f02ee2bf89e9243ca2f52  docs/project-harness/tasks/DH-013/plan.md
f9b93f7638160a3a5f6d968acaeb78f319b66109dadcf9c18df35f6a38f7d523  docs/project-harness/tasks/DH-014/plan.md
d9db719985e847d7edc3655f80c9c19666b52665f361513d42864eef5741b5ca  docs/project-harness/tasks/DH-015/plan.md
8e323d989f82a5becfa7390ce4aad127dcd93903bda865b1e91d3509676fd8dc  packages/world/src/world-tools/world-tool-contract.ts
5e55aa38fe005024307cd976e7f7998f96afba400eebd19b717ca5746dc56331  packages/world/src/world-tools/world-tool-surface.ts
6059a2b88ae3b1a309d932a850e583c1e5a1eed3253852f5e9bb3002270332a6  packages/world/src/repository/world-repository.ts
78568981e6626b49a6be72cb49da19bfaafbb9ab8a1749286174a0a707b93328  packages/world/src/artifacts/marble-hunyuan-composite-fixture.ts
3688df328eb3c7c1ed0fcc98a225a9d8aa1ae52b8715cece70368721d95e68c6  apps/agent-gateway/src/product-session.ts
e0ae8c36891dbdad4188a8acbfc0abb9828e6cd461777d2ecc55195f2cf94b43  apps/agent-gateway/src/product-session-api.ts
151a9c3f8398e5b30786015508f00a0fcf31c94eb560786473cbdf0a254cc46b  apps/studio/src/product-session-client.ts
84170d08fe7f5ca226eb7db677ae4e361c3d0b769c0f5505ff27c7a368b760b8  apps/studio/src/App.tsx
daa53252286c9989b4ff2317fcef493d3928fcc589b78fbf0136a42c87dec172  apps/studio/src/presentation-three/ThreeViewport.tsx
```

## Required review

请完整读取上述 18 个文件。可以按需读取直接相关的 current tests 与 package metadata，但不要读取任何旧/并行 reviewer verdict。允许执行只读 `rg`、`sed`、`git diff/status`、hash、现有 tests 或 repo 外临时 probe；不要 build，因为 build 会产生 ignored artifacts。

必须独立回答：

1. `Registered Asset Scene Composer` 是否真正复用现有 exact registry/fixture，而没有为单一 pair 预建通用 asset graph/SDK？
2. closed human `write/edit/run` routes 是否仍保持唯一 Gateway Host、四工具 single source、adopt 独立与 Product Session authority？
3. 计划对 command/turn admission、body parse 后 reservation、async run abort/deadline、stale/no-op、lastRun、projection lineage 与 error redaction 是否足够闭合？
4. `PoseDraft`/TransformControls 是否严格 Presentation-local，且对 selection/mode/view/session/ref/blur/visibility/pointer/unmount 生命周期、input isolation 与 idle rAF 有可执行验收？
5. world-Z yaw/no-scale 是否与当前 calibration/proxy witness 一致；是否仍存在 Three.js transform 被提升为 alignment/Snapshot truth 的路径？
6. direct run、Episode/Evaluation 与 existing explicit adopt invariants 是否得到足够回归，而没有把 DH-016～DH-018 工作吸入本切片？
7. Expected Product Files、RED-first phases、Chromium acceptance 与 structural diff gates 是否足以让实现者不靠补丁扩展 scope？

优先寻找可执行 P0/P1 反例，而不是只做文案润色。P2 只记录会显著提高实现风险但不阻断 authority 的问题。

## Required output

以中文输出结构化结果：

- `decision: approved | changes_requested | blocked`
- `may_implement: yes | no`
- P0 / P1 / P2，每项包含具体文件/行、反例与应修订的计划位置；没有则写“无”
- 你执行的命令/检查
- 起点与终点 branch、HEAD、plan SHA、18-file aggregate、Git status 是否一致

批准条件：P0=0、P1=0。发现 P1 后可以完成 request-scoped 必要核验，但不要扩大到 UI 美学、未来 provider 产品设计或无关历史问题。
