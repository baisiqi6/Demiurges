# DH-015 Plan Review Request — Round 3

## Reviewer role

你是 fresh independent plan reviewer。只读审查当前 DH-015 canonical plan 是否足以成为 implementation authority；不要实现、修改文件、安装依赖、联网、调用 provider、commit、push、merge、tag、deploy、reset、clean 或操作其他 worktree。

不得读取任何 Round 1/2 request/verdict、`plan-review-round1.md`、`plan-review-round2.md`、另一位 reviewer 输出、未来 verdict 文件或 `docs/project-harness/current/review-packet.md`。只依据本 request 明列的 authority、current source 与独立只读检查给出结论。

本 request 在 EXharness `review-result → sync/state → review → state/validate/doctor` 全部完成、packet EOF 修复、`git diff --check` 通过后最后冻结。审查结束前不会再执行 harness mutation 或修改 manifest/source。

## Frozen identity

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-015`
- branch：`agent/codex/DH-015`
- HEAD/base：`1805d73055a79a7e0506afafebaffd7b308706f9`
- plan SHA-256：`902a91d884648bc22db709d84eee3e74029690d01ff9671de5df5bb09697691b`
- ordered 24-file manifest aggregate：`b029a8dff68d6f05550a28e30fe59c0370fd39fd6ac7726788a14194e7957152`
- aggregate 算法：对下列固定顺序执行完整 `shasum -a 256` 文本，再对该完整文本执行 `shasum -a 256`。

```text
353dba879a20c570e438fef3681f412a084456ab3b38b70f14ec2773fa1e2f42  AGENTS.md
a335dafd9d996f7bf15346890d3056333f3a9efaec98df3820d69cd5360b20c4  docs/project-harness/scope.md
fef6f9d56d30bd1e2b0d36340603a58b7fc6b8f630234f73bd4f6e9f23c57dcb  docs/project-harness/architecture.md
9102a3d16806873dca31a118340ddac030c2101e28bd5a27349e4fd5ce8e0acf  docs/project-harness/domain-model.md
c290ebcd70e8c3776cf808275c49528a2e6bb191c5b8944c0f2a80511cc55a4b  docs/project-harness/observer-embodiment.md
809e7def70167a35c39f26c9da13b2d58fe097da25aaa313fccc56ce8e6d2634  docs/project-harness/harness-checklist.json
932da22e96c9aedc678811530384b70ff658afa3832f02ee2bf89e9243ca2f52  docs/project-harness/tasks/DH-013/plan.md
f9b93f7638160a3a5f6d968acaeb78f319b66109dadcf9c18df35f6a38f7d523  docs/project-harness/tasks/DH-014/plan.md
902a91d884648bc22db709d84eee3e74029690d01ff9671de5df5bb09697691b  docs/project-harness/tasks/DH-015/plan.md
8e323d989f82a5becfa7390ce4aad127dcd93903bda865b1e91d3509676fd8dc  packages/world/src/world-tools/world-tool-contract.ts
5e55aa38fe005024307cd976e7f7998f96afba400eebd19b717ca5746dc56331  packages/world/src/world-tools/world-tool-surface.ts
6059a2b88ae3b1a309d932a850e583c1e5a1eed3253852f5e9bb3002270332a6  packages/world/src/repository/world-repository.ts
78568981e6626b49a6be72cb49da19bfaafbb9ab8a1749286174a0a707b93328  packages/world/src/artifacts/marble-hunyuan-composite-fixture.ts
24bfeb2efed6158e196a69a5e8f1eadcf269b64e1bd398625e8e998750d78ccc  packages/world/src/artifacts/marble-hunyuan-composite-fixture.test.ts
eacea30280bbee04211887e3024e8db05f7ceeead30769430f5fa81f7301b842  packages/world/src/product-session-codec.ts
26132aad9b7caecef3056e8671f07371449bd0b07358c210868ad756f9448421  packages/world/src/index.ts
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

完整读取上述 24 个文件。可按需读取直接相关 current tests/package metadata，但不得读取任何旧 review artifact。允许只读 `rg`、`sed`、Git/hash、现有 tests 或 repo 外临时 probe；不要 build。

必须独立核验：

1. composite source-aware closure 是否精确区分 write/edit/runtime-terminal，且 edit 只允许 generated-object finite translation、zero velocity、canonical pure world-Z yaw；完整半球规则是否唯一覆盖 `w=0,z=±1`；representation/physics/calibration/witness 与其他 scenario 不被放宽。
2. package-owned operation-aware decoder 是否能唯一证明 human composite write `null→canonical root ID/v1` 与 edit `parent→direct child Ref+1`，并从 `index.ts` 导出；Studio 不复制 authority logic；stale 只用 stable conflict + authoritative GET 重建。
3. human route 是否只有 composite write/edit，其他 fixture fail closed；不存在 direct human run/adopt；pre-authored deterministic Agent fixture 是否能仅用四工具完成 `read→run`，同时保留 empty-session 原回归。
4. semantic no-op 是否冻结 q/-q、180° boundary、-0、request count、Ref/lastRun；repeated create 是否可恢复。
5. PoseDraft 是否严格位于独立 Presentation wrapper；authoritative root/evidence/bounds/inspector 不受 draft 影响；TransformControls Z-up/world-Z/no-scale、focus/blur/pointer lifecycle与 idle rAF 可执行验证。
6. Expected Product Files、structural gates、Repository/codec/runtime/adopt regressions是否既能完成核心修复，又防止 generic validator 放宽或吸入 DH-016～DH-018。
7. 真实 Chromium acceptance 是否闭合 exact pair、create/draft/cancel/commit/Agent run、stale recovery、input isolation 与无永久 rAF。

优先寻找可执行 P0/P1；P2 只记录显著风险。P0/P1 为 0 才能批准。

## Required output

- `decision: approved | changes_requested | blocked`
- `may_implement: yes | no`
- P0/P1/P2，含文件/行、反例与修订位置；没有写“无”
- 执行的命令/检查
- 起点/终点 branch、HEAD、plan SHA、24-file aggregate、Git status 是否一致

发现 P1 后完成 request-scoped 必要核验即收口，不扩大到未来 provider 设计、UI 美学或无关历史问题。
