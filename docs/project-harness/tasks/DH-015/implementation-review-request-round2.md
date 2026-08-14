# DH-015 Implementation Review Request — Round 2

## Review mode

- fresh independent read-only implementation review；不得修改文件、build/install、联网、调用 provider 或执行 Git mutation。
- 不读取 Round 1 request/verdict、任何 plan-review verdict、其他 reviewer 输出、`docs/project-harness/current/review-packet.md` 或 future closeout packet。
- 只依据本 request、canonical plan、下列 25 个 product files、其直接依赖与 tests 给出 verdict。
- P0/P1 任一非零：`changes_requested` / `may_closeout=no`；否则 `approved` / `may_closeout=yes`。

## Frozen identity

- cwd: `/Users/Admin/projects/WorkTrees/Demiurges-DH-015`
- branch: `agent/codex/DH-015`
- HEAD/base: `1805d73055a79a7e0506afafebaffd7b308706f9`
- ordered product aggregate: `c30aae678b8ca6fd209f12503fbdee4e8a45e463ca18e1080b43583d819b6fdb`
- aggregate algorithm: 对下列 fixed-order 25 行执行 `shasum -a 256`，保留完整 `<hash><two spaces><path>\n` 文本，再对该完整文本执行 `shasum -a 256`。

## Ordered product manifest

```text
cb2aeec9716cfc95da128932b3001526f7d0d4ff6227fd79c70f9dced3c739d6  apps/agent-gateway/src/product-session-api.test.ts
984f8e5538be54a53bb904a2011d591930ec58e568988fef960ff8d5a7598fc2  apps/agent-gateway/src/product-session-api.ts
e78609822f7027abdfbfa170da6b814d432f6e2c840486e64f45a814c7654d6f  apps/agent-gateway/src/product-session.test.ts
80ace3afa826d8f7b6b3aef6ddb6ef74b87de70fe7de147c2ee751206fa4c921  apps/agent-gateway/src/product-session.ts
7e7b9203b16c8dcd1af3b399fd2107aa656ec13b22f992b95a18bd68abebcd46  apps/studio/src/App.tsx
7b1f5c900ac589adecf64caebd53356a0dd18a2c574cb0bb51824634bb055aa5  apps/studio/src/presentation-model.test.ts
6c3b071dfe1bfac72195d101494a388141f13296fcc1ce821215c7fc1e7e31e5  apps/studio/src/presentation-model.ts
cd1c1229d9c3f5c63907217d3964a202a397c7881c2d6d6ca83f90008f10ea38  apps/studio/src/presentation-three/draft-input-lifecycle.test.ts
0bbf210fe8e3cb36d47898602ac650b71fbea8ce4b762516d8a92e988b446059  apps/studio/src/presentation-three/draft-input-lifecycle.ts
b42c6cbb62b51129990c2798a6fb9d57a7fda48b79af1a122af64e7d0d875f5e  apps/studio/src/presentation-three/ThreeViewport.tsx
e0f9a8a62d95b07276c4ad6e193d5332238ddb93964598a092c0ddfe67d81304  apps/studio/src/product-session-client.test.ts
8abeb4a11fbb47e3d6ee6b2592692c0e3ea082a858124f81355884c5e137525a  apps/studio/src/product-session-client.ts
c9f0a1891a4255ce1eef620aff547c8f3cf0f627cf32e8a39142ed7410356c86  apps/studio/src/scene-composer.test.ts
3ce21dd4e57451050b4c4887c44c75fd5945c26f12c9af8de66cacf1a40efa8a  apps/studio/src/scene-composer.ts
cc2c7ec351f850373609234baabb73ebf1233ecfee450779c30ced9253e10ffc  apps/studio/src/styles.css
2ea6e1d34fcda98b56e9b499dfd5fceba22857d8a80572d9945bb61873994171  packages/world/src/artifacts/marble-hunyuan-composite-fixture.ts
0e070f99ac79633e01664a2da553dbf6f8e8d8df4132cc3e259aa2adc622ab9b  packages/world/src/composite-authoring.test.ts
1ed8864c8eec4208ac16ecb89399a09f4753b9d8db8670645a7a12e3c5a81936  packages/world/src/composite-authoring.ts
eee8e1740c2edaf8ac7d3f3609d573f7e2046a5ca1f429085fb1b15b468e3256  packages/world/src/index.ts
a4fe2710f51a67a00540ad278b6068d5cb9837d9a28cd56f4f699d4be5f74130  packages/world/src/product-session-codec.ts
4f1655124b8aba4c80509781a093dfa4e8d1930d1be0a0d30aef1a0a6eb6fc75  packages/world/src/repository/pose-constraints.ts
69d8846fe8bf50bad018ac038a8f89f2cbaa9eed774a9094771f088587829c1f  packages/world/src/repository/world-repository.ts
2ba477b13b97251c55e62d8ffbed1d6c1ea38636d388c3bd061e3e068946b774  packages/world/src/world-tools/composite-pose.ts
e183f801c96e674b035487307cf61c9e670f0e8fba9a273b4cd52c5204a62153  packages/world/src/world-tools/pose-envelope.ts
3af036025561864af96892ae9d404e6b1ce9b4f5d9b27d33426d539e63cbf55e  packages/world/src/world-tools/world-tool-contract.ts
```

## Mandatory Round 2 regression closure

1. abnormal `lostpointercapture`：若 TransformControls 仍 dragging，必须调用 actual public `pointerUp(null)`，使 `dragging=false`、axis 清空、Orbit/selection ownership 恢复，再取消 draft；只 `detach()` 不合格。
2. normal pointer-up / lost-capture ordering：正常 `dragging-changed(false)` 不得误取消 draft；pending abnormal timer 必须取消。
3. toolbar-focused Escape：active PoseDraft 时，即使 button/editable target 聚焦且 viewport 不拥有 keyboard，Escape 仍取消 draft并清输入；W/A/S/D/Q/E 等相机键仍不得穿透 editable target。
4. detach/mode/ref/asset/unmount：任一路径移除 active draft/gizmo 时，不得残留 `gizmoDragging=true`、disabled Orbit、stuck selection 或永久 rAF。
5. full repository diff-check：`git diff --check` 必须全仓 exit 0，不能只做 product-manifest scoped pass。

## Original P0/P1 closure retained

1. single admission pipeline、400/422 分界、canonical wire reparse 与 generic four-tool surface不退化。
2. rejection/unchanged/busy/stale zero mutation，no-op 保留 lastRun/sequence，accepted edit 才推进 child/清 evidence。
3. source-aware fixture exact closure、floor/envelope/world-Z canonical pose；transition decoder 对 forged lineage/world/running fail closed。
4. Gateway 仅固定 human write/edit、bounded/redacted body、same reservation；无 human run/adopt/dispatcher/fifth tool。
5. PoseDraft Presentation-only、independent wrapper、无 scale；truthful asset fallback；authority boundaries 不越界。

## Required executable gates

- focused lifecycle tests：`draft-input-lifecycle.test.ts`、`scene-composer.test.ts` 与相关 Gateway/client tests。
- `bun test` expected `504 pass / 0 fail / 3604 expect()`。
- `bun run typecheck`。
- `bun run build`（仅允许既有 MuJoCo browser-external/chunk warnings）。
- 全仓 `git diff --check`。
- `.artifacts/harness/harnessctl validate` 与 `doctor`，0 errors；validate 0 warnings。
- fresh actual Three.js probe：`TransformControls.dragging=true / axis!=null` 经 release seam 后必须 `false / null`。

## Chromium evidence boundary

- fresh Chromium 已使用浏览器内实际 Three.js 0.185.1 `TransformControls` 验证 release seam：`dragging=true → pointerUp(null) → dragging=false / axis=null`。
- settled 窗口 400ms 的 idle rAF 增量为 0；页面 error/unhandled rejection 为空。
- ignored external provider cache 仍不存在；真实产品 fallback 为合法 composite Snapshot v1、三项 `NOT IMPORTED`、Hunyuan gizmo disabled。不得伪造 loaded asset acceptance或重新调用 provider。
- 实现早期有 provider cache 时的 translate/rotate/commit evidence 属既有实现证据；本轮只能把 cache 缺失明确记为 external evidence limitation，不能冒充 fresh loaded-path acceptance。

## Output

结构化给出 `decision`、`may_closeout`、P0/P1/P2、executed commands、counterexamples、start/end frozen identity。发现 P1 后完成 request-scoped必要复核即停止扩展。
