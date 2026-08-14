# DH-015 Plan Review Request — Round 4

## Role and isolation

Fresh independent、只读审查当前 DH-015 plan。不得实现、修改、build、install、联网、provider/Git mutation。不得读取任何 Round 1/2/3 request/verdict、`plan-review-round*.md`、另一 reviewer 输出、future verdict 或 `docs/project-harness/current/review-packet.md`。

本 request 在全部 EXharness workflow mutation、packet EOF 修复、validate/doctor/diff-check 后最后冻结；review 期间不会再修改 manifest/source。

## Frozen identity

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-015`
- branch：`agent/codex/DH-015`
- HEAD/base：`1805d73055a79a7e0506afafebaffd7b308706f9`
- plan SHA-256：`915712c4e6ef2e0905a2cc75223a9b1d513c640d3946446a1157a86b161dd7aa`
- ordered 24-file aggregate：`fc41a1030c8fb2fb931c9cd6b4e0b341b90c999a34df62a184f320ea9d81e180`
- algorithm：固定顺序完整 `shasum -a 256` 文本，再对该文本 `shasum -a 256`。

```text
353dba879a20c570e438fef3681f412a084456ab3b38b70f14ec2773fa1e2f42  AGENTS.md
a335dafd9d996f7bf15346890d3056333f3a9efaec98df3820d69cd5360b20c4  docs/project-harness/scope.md
fef6f9d56d30bd1e2b0d36340603a58b7fc6b8f630234f73bd4f6e9f23c57dcb  docs/project-harness/architecture.md
9102a3d16806873dca31a118340ddac030c2101e28bd5a27349e4fd5ce8e0acf  docs/project-harness/domain-model.md
c290ebcd70e8c3776cf808275c49528a2e6bb191c5b8944c0f2a80511cc55a4b  docs/project-harness/observer-embodiment.md
40eb9dcb9b19e39bcba59a616fd35f536ffe0a9e264af73865d5981651af0ede  docs/project-harness/harness-checklist.json
932da22e96c9aedc678811530384b70ff658afa3832f02ee2bf89e9243ca2f52  docs/project-harness/tasks/DH-013/plan.md
f9b93f7638160a3a5f6d968acaeb78f319b66109dadcf9c18df35f6a38f7d523  docs/project-harness/tasks/DH-014/plan.md
915712c4e6ef2e0905a2cc75223a9b1d513c640d3946446a1157a86b161dd7aa  docs/project-harness/tasks/DH-015/plan.md
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

先完整读取以上 24 文件，并逐项复算单文件与 aggregate；任何不一致都必须 `blocked`，不要猜测。

核验：

1. human write/edit 是否在 mutation 前只接纳 exact composite，empty/non-composite/wrong target/change stable zero-side-effect fail closed；decoder prior/returned 也只接纳 composite，child pose 必须等于 parsed input。
2. source-aware fixture closure、single-source numeric envelope、180° total hemisphere、q/-q/-0/no-op 是否唯一且不放宽 generic authority。
3. package-owned decoder、canonical root ID、direct child Ref+1、stale authoritative GET、lastRun/sequence/running 是否闭合。
4. 没有 direct human run/adopt；pre-authored Agent 仅 `read→run`；empty-session 原四步回归与 explicit adopt 仍在。
5. draft wrapper/TransformControls/input lifecycle/idle rAF/Chromium acceptance 与 DH-016～018 隔离是否可执行。
6. Expected Files 与 structural gates 是否足够。

优先 executable P0/P1。P0/P1=0 才 approved。

## Output

中文结构化输出 `decision`、`may_implement`、P0/P1/P2、commands/checks、起终 branch/HEAD/plan/24-file aggregate/Git status。发现 P1 后完成 request-scoped 必要检查即收口。
