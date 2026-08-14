# DH-015 Implementation Review Request — Round 1

## Review mode

- fresh independent read-only implementation review；不得修改文件、build/install、联网、调用 provider 或执行 Git mutation。
- 不读取任何 plan-review verdict、旧 reviewer 输出、`docs/project-harness/current/review-packet.md` 或 future closeout packet。
- 只依据本 request、canonical plan、下列 23 个 product files、其直接依赖与 tests 给出 verdict。
- P0/P1 任一非零：`changes_requested` / `may_closeout=no`；否则 `approved` / `may_closeout=yes`。

## Frozen identity

- cwd: `/Users/Admin/projects/WorkTrees/Demiurges-DH-015`
- branch: `agent/codex/DH-015`
- HEAD/base: `1805d73055a79a7e0506afafebaffd7b308706f9`
- ordered product aggregate: `f117e7c5c0dcaa3bab1e4d0b4cfd5c6602dafd598872746da847c180e88e7dd9`
- aggregate algorithm: 对下列 fixed-order 23 行执行 `shasum -a 256`，保留完整 `<hash><two spaces><path>\n` 文本，再对该完整文本执行 `shasum -a 256`。

## Ordered product manifest

```text
cb2aeec9716cfc95da128932b3001526f7d0d4ff6227fd79c70f9dced3c739d6  apps/agent-gateway/src/product-session-api.test.ts
984f8e5538be54a53bb904a2011d591930ec58e568988fef960ff8d5a7598fc2  apps/agent-gateway/src/product-session-api.ts
e78609822f7027abdfbfa170da6b814d432f6e2c840486e64f45a814c7654d6f  apps/agent-gateway/src/product-session.test.ts
80ace3afa826d8f7b6b3aef6ddb6ef74b87de70fe7de147c2ee751206fa4c921  apps/agent-gateway/src/product-session.ts
7e7b9203b16c8dcd1af3b399fd2107aa656ec13b22f992b95a18bd68abebcd46  apps/studio/src/App.tsx
7b1f5c900ac589adecf64caebd53356a0dd18a2c574cb0bb51824634bb055aa5  apps/studio/src/presentation-model.test.ts
6c3b071dfe1bfac72195d101494a388141f13296fcc1ce821215c7fc1e7e31e5  apps/studio/src/presentation-model.ts
5d7794f7075722b3ab1e00e8acb8f70ea058960d6df085dcb38c7617fdc1fbbd  apps/studio/src/presentation-three/ThreeViewport.tsx
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

## Mandatory P0/P1 closure

1. single admission pipeline：structural 400 与 composite-domain 422 可执行；generic Agent parser/public four-tool surface 不变；canonical wire 可重解析为同一 parsed input。
2. zero mutation：structural/domain/stale/repeated-write/busy/no-op 均不调用 surface 或产生 edit-sequence gap；no-op 保留 Ref/Snapshot/lastRun/lastSequence；accepted edit 才清 lastRun。
3. exact source-aware fixture：write exact；edit 仅 generated-object finite dense envelope position + canonical unit world-Z yaw + zero velocity + floor safe；environment/floor/representation/physics/calibration/witness exact；runtime-terminal 既有 closure不退化。
4. transition decoder：write null→canonical root v1；edit parent→direct child Ref+1；unchanged byte-equivalent；forged world/lineage/lastRun/sequence/running fail closed；Studio 无规则复制。
5. Gateway：固定 write/edit routes、bounded JSON、stable redacted status/code、same reservation with Agent turn；没有 human run/adopt/dispatcher/fifth tool。
6. PoseDraft/UI：Presentation-only immutable draft；world-Z translate/rotate，q sign/-0/180° closed；no scale；independent proxy wrapper 不进入 EntityRef/raycast/evidence；normal drag end 与 abnormal lost-capture 区分；mode/selection/ref/episode/blur/hidden/Escape/unmount cleanup；no permanent rAF。
7. truthful fallback：Hunyuan visual 不是 `loaded` 时 gizmo disabled；3DGS/GLB missing 不删除 Snapshot、不静默联网、不 provider generation；collision debug 仍可用。
8. authority boundaries：Kernel/Episode/Evaluation/AdoptPolicy/Repository persistence/OMP allowlist/provider bytes 均无越界修改。

## Required executable gates

- `bun test` expected `502 pass / 0 fail / 3595 expect()`。
- `bun run typecheck`。
- `bun run build`（允许既有 MuJoCo browser-external/chunk warnings）。
- `git diff --check`。
- `.artifacts/harness/harnessctl validate` 与 `doctor`，0 warnings/errors。
- fresh bounded adversarial probes：至少包含 `-0` raw JSON、non-Z quaternion、180° negative hemisphere、floor penetration、no-op next child identity、busy turn/command、forged transition、normal vs abnormal lost-capture、missing visual disabled 与 idle rAF。

## Chromium evidence boundary

- 实现期间真实 Chromium 已证明 translate/rotate draft 与 explicit commit、input isolation、Explore movement/collision default、idle rAF；正常 drag 的 lost-capture bug 已修复并复验。
- 当前 ignored external `.artifacts/provider-cache` 不存在，最终 cache-missing path 已真实复验为三项 `NOT IMPORTED`、合法 Snapshot 保留、Hunyuan gizmo disabled、page error 为空、idle rAF 归零。
- 不得伪造 real asset-loaded acceptance，也不得重新调用 provider。请把缺少 external cache 与产品代码缺陷明确区分；如果代码对 loaded path 无可执行闭环可判 P1，否则作为 external evidence limitation 明示。

## Output

结构化给出 `decision`、`may_closeout`、P0/P1/P2、executed commands、counterexamples、start/end frozen identity。发现 P1 后完成 request-scoped必要复核即停止扩展。
