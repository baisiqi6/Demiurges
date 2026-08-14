# DH-015 Plan Review Request — Round 2

## Reviewer role

你是 fresh independent plan reviewer。只读审查当前 DH-015 canonical plan 是否足以成为 implementation authority；不要实现、修改文件、安装依赖、联网、调用 provider、commit、push、merge、tag、deploy、reset、clean 或操作其他 worktree。

不得读取任何 Round 1 request/verdict、`plan-review-round1.md`、另一位 reviewer 输出、未来 verdict 文件或 `docs/project-harness/current/review-packet.md`。只依据本 request 明列的 authority、current source 与你独立执行的只读检查给出结论。

## Frozen identity

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-015`
- branch：`agent/codex/DH-015`
- HEAD/base：`1805d73055a79a7e0506afafebaffd7b308706f9`
- plan SHA-256：`39d726b8190d6f9d622a4fb5b565e8fdadf7bde7d1e3606f3a4797095b7f6477`
- ordered 23-file manifest aggregate：`04116c6e702d321e2e47d302a05923b0bacc6215b6bd7936a34035f291e44d9a`
- aggregate 算法：对下列固定顺序执行完整 `shasum -a 256` 文本，再对该完整文本执行 `shasum -a 256`。

```text
353dba879a20c570e438fef3681f412a084456ab3b38b70f14ec2773fa1e2f42  AGENTS.md
a335dafd9d996f7bf15346890d3056333f3a9efaec98df3820d69cd5360b20c4  docs/project-harness/scope.md
fef6f9d56d30bd1e2b0d36340603a58b7fc6b8f630234f73bd4f6e9f23c57dcb  docs/project-harness/architecture.md
9102a3d16806873dca31a118340ddac030c2101e28bd5a27349e4fd5ce8e0acf  docs/project-harness/domain-model.md
c290ebcd70e8c3776cf808275c49528a2e6bb191c5b8944c0f2a80511cc55a4b  docs/project-harness/observer-embodiment.md
4af023386a1810146399ff6fc537257107ee7c2e21676652c8aa7874c9e50fd5  docs/project-harness/harness-checklist.json
932da22e96c9aedc678811530384b70ff658afa3832f02ee2bf89e9243ca2f52  docs/project-harness/tasks/DH-013/plan.md
f9b93f7638160a3a5f6d968acaeb78f319b66109dadcf9c18df35f6a38f7d523  docs/project-harness/tasks/DH-014/plan.md
39d726b8190d6f9d622a4fb5b565e8fdadf7bde7d1e3606f3a4797095b7f6477  docs/project-harness/tasks/DH-015/plan.md
8e323d989f82a5becfa7390ce4aad127dcd93903bda865b1e91d3509676fd8dc  packages/world/src/world-tools/world-tool-contract.ts
5e55aa38fe005024307cd976e7f7998f96afba400eebd19b717ca5746dc56331  packages/world/src/world-tools/world-tool-surface.ts
6059a2b88ae3b1a309d932a850e583c1e5a1eed3253852f5e9bb3002270332a6  packages/world/src/repository/world-repository.ts
78568981e6626b49a6be72cb49da19bfaafbb9ab8a1749286174a0a707b93328  packages/world/src/artifacts/marble-hunyuan-composite-fixture.ts
24bfeb2efed6158e196a69a5e8f1eadcf269b64e1bd398625e8e998750d78ccc  packages/world/src/artifacts/marble-hunyuan-composite-fixture.test.ts
eacea30280bbee04211887e3024e8db05f7ceeead30769430f5fa81f7301b842  packages/world/src/product-session-codec.ts
f564a9c9638b4bdd2d750d14d0a39b2447f1a7bfe164767b46b5d3a09c20c8a4  packages/world/src/product-session-codec.test.ts
d1cee03eafd83bb5dd740a20bbb1dae11ad6ecc8102c0e208d03d43f4e436535  packages/world/src/runtime-mujoco/run-falling-cube.ts
7c0c39fc020998df64000da73ad605cdf735b305ff8c8627ea26869f4a01c1aa  packages/world/src/host/runtime-mvp-adopt-policy.ts
3688df328eb3c7c1ed0fcc98a225a9d8aa1ae52b8715cece70368721d95e68c6  apps/agent-gateway/src/product-session.ts
e0ae8c36891dbdad4188a8acbfc0abb9828e6cd461777d2ecc55195f2cf94b43  apps/agent-gateway/src/product-session-api.ts
151a9c3f8398e5b30786015508f00a0fcf31c94eb560786473cbdf0a254cc46b  apps/studio/src/product-session-client.ts
84170d08fe7f5ca226eb7db677ae4e361c3d0b769c0f5505ff27c7a368b760b8  apps/studio/src/App.tsx
daa53252286c9989b4ff2317fcef493d3928fcc589b78fbf0136a42c87dec172  apps/studio/src/presentation-three/ThreeViewport.tsx
```

## Mandatory review

完整读取上述 23 个文件。可按需读取直接相关 current tests/package metadata，但不要读取任何旧 review artifact。允许执行只读 `rg`、`sed`、Git/hash、现有 tests 或 repo 外临时 probe；不要 build，因为 build 会产生 ignored artifacts。

必须独立核验：

1. source-aware composite closure 是否足够精确：write 保持 canonical；edit 只允许 generated-object finite translation 与 canonical pure world-Z yaw、zero velocity；runtime-terminal 保持既有 closure；representation/physics/calibration/witness 不可漂移；其他 scenario 不被放宽。
2. operation-aware transition decoder 是否是 package-owned single source，并能严密证明 write `null→root v1` 与 edit `parent→direct child Ref+1`；Studio 是否没有复制 authority logic；stale 是否通过 stable conflict + authoritative GET 重建，而不是错误地把 foreign current 当 prior child。
3. 删除 direct human run 后，DH-015 是否仍通过既有 Agent 四工具闭合 run/Evaluation/explicit adopt，且没有留下孤立 run UI/route、async deadline 或 duplicate runId 需求。
4. semantic no-op 是否冻结 q/-q、canonical sign、-0、Ref/lastRun invariant 与 repeated create recovery。
5. PoseDraft 是否严格位于独立 Presentation wrapper；authoritative root/evidence/bounds/inspector 不受 draft 影响；TransformControls Z-up/world-Z/no-scale、focus/blur/pointer lifecycle 与 idle rAF 是否可执行验证。
6. Expected Product Files、structural gates、Repository/codec/runtime/adopt regressions是否允许完成核心修复，同时防止 generic validator 放宽或 scope 吸入 DH-016～DH-018。
7. 真实 Chromium acceptance 是否能证明 exact registered pair、create/draft/cancel/commit/Agent run、stale recovery、input isolation 与无永久 rAF。

优先寻找可执行 P0/P1 反例。P2 只记录显著提高实现风险但不阻断 authority 的问题。

## Required output

以中文输出：

- `decision: approved | changes_requested | blocked`
- `may_implement: yes | no`
- P0 / P1 / P2；每项给出文件/行、反例与应修订计划位置；没有则写“无”
- 执行的命令/检查
- 起点/终点 branch、HEAD、plan SHA、23-file aggregate、Git status 是否一致

批准条件：P0=0、P1=0。发现 P1 后完成 request-scoped 必要核验即收口，不扩大到未来 provider 产品设计、UI 美学或无关历史问题。
