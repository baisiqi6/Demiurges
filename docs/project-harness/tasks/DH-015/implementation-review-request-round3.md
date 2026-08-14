# DH-015 Implementation Review Request — Round 3

## Review mode

- fresh independent read-only implementation review；不得修改文件、build/install、联网、调用 provider 或执行 Git mutation。
- 不读取 Round 1/2 request 或 verdict、任何 plan-review verdict、其他 reviewer 输出、`docs/project-harness/current/review-packet.md`、`docs/project-harness/current/closeout-packet.md` 或 future packet。
- 搜索时必须显式排除上述禁读文件与整个旧 reviewer/request 集；若误触，立即披露且不得作为 clean approval。
- 只依据本 request、canonical plan、下列 25 个 product files、其直接依赖与 tests 给出 verdict。
- P0/P1 任一非零：`changes_requested` / `may_closeout=no`；否则 `approved` / `may_closeout=yes`。

## Frozen identity

- cwd: `/Users/Admin/projects/WorkTrees/Demiurges-DH-015`
- branch: `agent/codex/DH-015`
- HEAD/base: `1805d73055a79a7e0506afafebaffd7b308706f9`
- ordered product aggregate: `296742d1a3220453d85486d389fe8bf5b5ad6a07b1296902335394d575d852ab`
- aggregate algorithm: 对下列 fixed-order 25 行执行 `shasum -a 256`，保留完整 `<hash><two spaces><path>\n` 文本，再对该完整文本执行 `shasum -a 256`。

## Ordered product manifest

```text
9d9283ece5ef7e15fd5571001581b7ba604f594cc866b1a1834d3daefc3d58c0  apps/agent-gateway/src/product-session-api.test.ts
f9901ecee809af748677eb52ae87438fa1b792f35ecbda4d4512678851010cf9  apps/agent-gateway/src/product-session-api.ts
e78609822f7027abdfbfa170da6b814d432f6e2c840486e64f45a814c7654d6f  apps/agent-gateway/src/product-session.test.ts
0515030f55573ad0f09893db3f5065a88aa0b55664c2daab4651375b4e8a6b9a  apps/agent-gateway/src/product-session.ts
7e7b9203b16c8dcd1af3b399fd2107aa656ec13b22f992b95a18bd68abebcd46  apps/studio/src/App.tsx
7b1f5c900ac589adecf64caebd53356a0dd18a2c574cb0bb51824634bb055aa5  apps/studio/src/presentation-model.test.ts
6c3b071dfe1bfac72195d101494a388141f13296fcc1ce821215c7fc1e7e31e5  apps/studio/src/presentation-model.ts
cd1c1229d9c3f5c63907217d3964a202a397c7881c2d6d6ca83f90008f10ea38  apps/studio/src/presentation-three/draft-input-lifecycle.test.ts
0bbf210fe8e3cb36d47898602ac650b71fbea8ce4b762516d8a92e988b446059  apps/studio/src/presentation-three/draft-input-lifecycle.ts
b42c6cbb62b51129990c2798a6fb9d57a7fda48b79af1a122af64e7d0d875f5e  apps/studio/src/presentation-three/ThreeViewport.tsx
839e976677b91cc494a3fce355689495d5246d5bafb53ef7d7c8f8078ee2a059  apps/studio/src/product-session-client.test.ts
8abeb4a11fbb47e3d6ee6b2592692c0e3ea082a858124f81355884c5e137525a  apps/studio/src/product-session-client.ts
c9f0a1891a4255ce1eef620aff547c8f3cf0f627cf32e8a39142ed7410356c86  apps/studio/src/scene-composer.test.ts
3ce21dd4e57451050b4c4887c44c75fd5945c26f12c9af8de66cacf1a40efa8a  apps/studio/src/scene-composer.ts
cc2c7ec351f850373609234baabb73ebf1233ecfee450779c30ced9253e10ffc  apps/studio/src/styles.css
2ea6e1d34fcda98b56e9b499dfd5fceba22857d8a80572d9945bb61873994171  packages/world/src/artifacts/marble-hunyuan-composite-fixture.ts
af924ddb63da513c97647845838b21d843b5f4f68ebda4800c03ad2dc83abee1  packages/world/src/composite-authoring.test.ts
1ed8864c8eec4208ac16ecb89399a09f4753b9d8db8670645a7a12e3c5a81936  packages/world/src/composite-authoring.ts
eee8e1740c2edaf8ac7d3f3609d573f7e2046a5ca1f429085fb1b15b468e3256  packages/world/src/index.ts
8918a6ee7dc06dcac34cfa9de0d20d40aca9c9732ada170adcaaafecdc3437e7  packages/world/src/product-session-codec.ts
4f1655124b8aba4c80509781a093dfa4e8d1930d1be0a0d30aef1a0a6eb6fc75  packages/world/src/repository/pose-constraints.ts
69d8846fe8bf50bad018ac038a8f89f2cbaa9eed774a9094771f088587829c1f  packages/world/src/repository/world-repository.ts
2ba477b13b97251c55e62d8ffbed1d6c1ea38636d388c3bd061e3e068946b774  packages/world/src/world-tools/composite-pose.ts
e183f801c96e674b035487307cf61c9e670f0e8fba9a273b4cd52c5204a62153  packages/world/src/world-tools/pose-envelope.ts
5c165326652a8db753f1c94ec6b8a203c961d9e873dd213e7b1768dc57c9108a  packages/world/src/world-tools/world-tool-contract.ts
```

## Mandatory Round 3 regression closure

1. pre-admission abort：pre-aborted write/edit 与 streamed body read期间发生的 abort 均稳定 `400 INVALID_REQUEST`；不得取得 reservation、调用 surface、推进 Ref/Snapshot/edit sequence、清 lastRun、改变 lastSequence/running。随后首个合法 mutation child ID不得跳号。
2. stable mapper：authoring transport/domain code 只能来自 typed closed error/outcome，不得读取或比较 raw `Error.message`；unknown parser/Host error统一 `400 INVALID_REQUEST`，不得回显 marker/stack/path/input。
3. structural/domain：nested joint-state null/sparse/extra/accessor/wrong primitive type为 structural `400 INVALID_REQUEST`；完整 exact records但 composite 不支持的 joint-state为 `422 FIXTURE_NOT_COMPOSABLE`；generic Agent `requireWorldEditInput` semantics不退化。
4. transition settled invariant：write/edit/unchanged 均要求 prior 与 returned `running=false`；`prior.running=true` 或 returned running/lineage/world/evidence drift fail closed。
5. Round 2 UI closure保持：actual TransformControls abnormal release、normal ordering、toolbar-focused Escape、detach/mode/ref/asset/unmount ownership、idle rAF与 truthful missing-cache fallback不得回归。
6. 全仓 `git diff --check` exit 0；不得只运行 product-scoped diff-check。

## Original closure retained

- single composite admission pipeline、400/422、canonical wire reparse、zero mutation/no-op、source-aware fixture、operation decoder、fixed human write/edit、same reservation、Presentation-only PoseDraft、no scale/fifth tool/provider generation、authority boundaries全部保持。
- external provider cache仍缺失；不得伪造 fresh loaded-asset acceptance或调用 provider。

## Required executable gates

- focused Gateway/world/client/lifecycle suites。
- `bun test` expected `506 pass / 0 fail / 3615 expect()`。
- `bun run typecheck`。
- `bun run build`（仅允许既有 MuJoCo browser-external/chunk warnings）。
- 全仓 `git diff --check`。
- `.artifacts/harness/harnessctl validate` 与 `doctor`；validate 0 warnings、doctor 0 errors。
- fresh bounded probes覆盖 abort before/during body、typed mapper、nested structural matrix、running prior/returned、actual Three.js release。

## Output

结构化给出 `decision`、`may_closeout`、P0/P1/P2、executed commands、counterexamples、start/end frozen identity与禁读合规披露。发现 P1 后完成 request-scoped必要复核即停止扩展。
