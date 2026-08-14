# DH-015 Implementation Review Request — Round 4

## Fresh bounded review

- 只读 independent implementation review；不得修改/install/联网/provider/Git mutation。
- 入口仅本文件；不得读取 Round 1～3 request/verdict、plan-review verdict、其他 reviewer 输出、current review/closeout/future packet；不得对 harness docs 做 broad search。
- 只依据 canonical plan、下列 25-file frozen manifest及其直接依赖/tests。P0/P1 非零即 `changes_requested / may_closeout=no`；否则 `approved / may_closeout=yes`。
- 本轮重点是 Round 3 两个 remediation 与既有 closure 回归；完成 mandatory probes/gates后立即收口，不扩大机会扫描。

## Frozen identity

- cwd: `/Users/Admin/projects/WorkTrees/Demiurges-DH-015`
- branch: `agent/codex/DH-015`
- HEAD/base: `1805d73055a79a7e0506afafebaffd7b308706f9`
- ordered aggregate: `e52b6a7f1eb5741b31972f03a26731efbd8249f7c85c8eb39cb9985eecb2518b`
- algorithm: fixed-order 25 行 `shasum -a 256` 的完整 `<hash><two spaces><path>\n` 文本再做 SHA-256。

## Ordered product manifest

```text
3d0dd750d4341b12f1ebeb3cc7fb5e1f82fd4908c533af5fcdfc3e03e56d7d87  apps/agent-gateway/src/product-session-api.test.ts
f9901ecee809af748677eb52ae87438fa1b792f35ecbda4d4512678851010cf9  apps/agent-gateway/src/product-session-api.ts
e78609822f7027abdfbfa170da6b814d432f6e2c840486e64f45a814c7654d6f  apps/agent-gateway/src/product-session.test.ts
0515030f55573ad0f09893db3f5065a88aa0b55664c2daab4651375b4e8a6b9a  apps/agent-gateway/src/product-session.ts
7e7b9203b16c8dcd1af3b399fd2107aa656ec13b22f992b95a18bd68abebcd46  apps/studio/src/App.tsx
7b1f5c900ac589adecf64caebd53356a0dd18a2c574cb0bb51824634bb055aa5  apps/studio/src/presentation-model.test.ts
6c3b071dfe1bfac72195d101494a388141f13296fcc1ce821215c7fc1e7e31e5  apps/studio/src/presentation-model.ts
cd1c1229d9c3f5c63907217d3964a202a397c7881c2d6d6ca83f90008f10ea38  apps/studio/src/presentation-three/draft-input-lifecycle.test.ts
0bbf210fe8e3cb36d47898602ac650b71fbea8ce4b762516d8a92e988b446059  apps/studio/src/presentation-three/draft-input-lifecycle.ts
b42c6cbb62b51129990c2798a6fb9d57a7fda48b79af1a122af64e7d0d875f5e  apps/studio/src/presentation-three/ThreeViewport.tsx
e4604113ae51d561b2acdba1d3fdc1166af3307a61f237b059c02fc3dc71def1  apps/studio/src/product-session-client.test.ts
07c5f91ac275e29dd3414ccc95cac67d41ec433e787d3a356bc09fd0c08d6063  apps/studio/src/product-session-client.ts
c9f0a1891a4255ce1eef620aff547c8f3cf0f627cf32e8a39142ed7410356c86  apps/studio/src/scene-composer.test.ts
3ce21dd4e57451050b4c4887c44c75fd5945c26f12c9af8de66cacf1a40efa8a  apps/studio/src/scene-composer.ts
cc2c7ec351f850373609234baabb73ebf1233ecfee450779c30ced9253e10ffc  apps/studio/src/styles.css
2ea6e1d34fcda98b56e9b499dfd5fceba22857d8a80572d9945bb61873994171  packages/world/src/artifacts/marble-hunyuan-composite-fixture.ts
35c54bb2d3fd46cd80fd6c2a0dd1e97cfa4860ee01a2b22f93849b5d3fa778c1  packages/world/src/composite-authoring.test.ts
1ed8864c8eec4208ac16ecb89399a09f4753b9d8db8670645a7a12e3c5a81936  packages/world/src/composite-authoring.ts
eee8e1740c2edaf8ac7d3f3609d573f7e2046a5ca1f429085fb1b15b468e3256  packages/world/src/index.ts
8918a6ee7dc06dcac34cfa9de0d20d40aca9c9732ada170adcaaafecdc3437e7  packages/world/src/product-session-codec.ts
4f1655124b8aba4c80509781a093dfa4e8d1930d1be0a0d30aef1a0a6eb6fc75  packages/world/src/repository/pose-constraints.ts
69d8846fe8bf50bad018ac038a8f89f2cbaa9eed774a9094771f088587829c1f  packages/world/src/repository/world-repository.ts
2ba477b13b97251c55e62d8ffbed1d6c1ea38636d388c3bd061e3e068946b774  packages/world/src/world-tools/composite-pose.ts
e183f801c96e674b035487307cf61c9e670f0e8fba9a273b4cd52c5204a62153  packages/world/src/world-tools/pose-envelope.ts
5c165326652a8db753f1c94ec6b8a203c961d9e873dd213e7b1768dc57c9108a  packages/world/src/world-tools/world-tool-contract.ts
```

## Mandatory closure

1. semantic no-op：Studio不得发 HTTP，但必须调用 unchanged operation decoder；settled prior成功且返回 trusted frozen equivalent projection；`prior.running=true`、returned running/authority drift均 fail closed；不得直接 `return prior`。
2. nested joint matrix：package direct admission覆盖 null/sparse/accessor(getter reads=0)/extra/wrong primitive→`INVALID_REQUEST`，exact records→`FIXTURE_NOT_COMPOSABLE`；HTTP 可传输 matrix分别稳定 400/422，随后首个合法 child仍为 `snapshot:edit-1`。
3. Round 1/2 closure retained：TransformControls actual release/normal ordering/Escape/idle；abort before/during body zero mutation；typed mapper不读 raw message；prior/returned settled；single pipeline、no-op/sequence/fixture/decoder/Gateway/authority/fallback不退化。
4. 外置 provider cache缺失是 evidence limitation；不得调用provider或伪造 loaded acceptance。

## Executable gates

- focused suites/probes覆盖上述 1～3。
- `bun test` expected `507 pass / 0 fail / 3628 expect()`。
- `bun run typecheck`；`bun run build`（仅既有 MuJoCo/chunk warnings）；全仓 `git diff --check`。
- EXharness validate 0 warnings；doctor 0 errors（optional MISS允许）。
- 复算 start/end 25-file hashes/aggregate且无漂移。

## Output

结构化 `decision`、`may_closeout`、P0/P1/P2、commands、counterexamples、start/end identity、禁读合规披露。完成 request-scoped证据后立即停止。
