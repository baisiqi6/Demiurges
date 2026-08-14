# DH-013 Plan Review Request — Round 2

## 角色与隔离

你是 fresh independent DH-013 Round 2 plan reviewer。严格只读，不读取 Round 1 verdict、cross-review summary、OMP session、其他 reviewer 输出或当前 task 的 `findings.md/progress.md`；只依据本 request、current canonical plan、稳定 architecture/source 与可执行只读 probes。

不得修改文件、commit/push/merge、联网、访问 Keychain/provider/production/Discord。不得把计划扩大为 provider platform。

输出：

- `decision: approved | changes_requested | blocked`
- `may_implement: yes | no`
- `P0/P1/P2`
- mandatory remediation checks 逐项 PASS/FAIL
- 实际读取/执行命令
- start/end frozen identity

只有 P0/P1=0 且所有 mandatory checks PASS 才能 approved。

## Frozen identity

- Branch：`agent/codex/DH-013`
- HEAD/Base：`97761d6b5dba899fcb73b93ba830ba78f2980766`
- Worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-013`
- Product source 相对 base 无修改。

固定顺序 SHA-256：

```text
f044574ec5eeac0086648871819765b82fd169b0cca4c5403f6e1800103f61db  docs/project-harness/tasks/DH-013/plan.md
a335dafd9d996f7bf15346890d3056333f3a9efaec98df3820d69cd5360b20c4  docs/project-harness/scope.md
1701548340dec0dc4b7ed17d884e7418b76377850b4f7dc3d207e1259c510b70  docs/project-harness/architecture.md
b43bce3384171920fdd34175c9644413ab4840a98d4e597e9cf0fe73c7590b3b  docs/project-harness/domain-model.md
877f58e2876e2286d68ef4e414057b64e04660d12482c6e080e3f873cb218ec1  apps/studio/src/presentation-three/ThreeViewport.tsx
29ef224b60cbac7c549d9287806679aa67229cd579462f3ce2e87aceaddd383e  packages/world/src/artifacts/diagnostic-rigid-fixture.ts
8ee932113a956746ea687e88fa327a965b740a6855fb8825a4d39d72a3dcd724  packages/world/src/product-session-codec.ts
e0ae8c36891dbdad4188a8acbfc0abb9828e6cd461777d2ecc55195f2cf94b43  apps/agent-gateway/src/product-session-api.ts
```

审查前后逐项复算并确认 branch/HEAD/status 不漂移。不要读取 Round 1 request，因为本 request 已自包含。

## Baseline

- Full：`172 pass / 0 fail / 2958 assertions`
- typecheck/build/diff/EXharness：pass
- product source 未改；本轮审查重点是计划能否安全进入 Phase 1 RED。

## Mandatory remediation checks

### A — High-risk provider boundary

- Mode 必须是 high-risk；
- exact Keychain service/account、existing world/job、query method/endpoint、allowed response fields、download host、禁止 generation 全部冻结；
- API credential 只发 API origin，CDN/COS 无 credential；query/download `redirect: manual`；
- shared deadline、metadata/stream byte budgets、one refresh、private temp/finally cleanup、atomic publish、error redaction、old valid cache rollback 全部可测试。

### B — Single artifact authority

- Git registered manifest 是唯一 identity/calibration authority；
- cache path 只由 manifest digest 派生且只是 materialization；
- Snapshot/Projection 只携带 exact assetId+manifestDigest；receipt 不被 Runtime 读取；
- route 只收 closed assetId，并在 serve/session-open 重算 size/digest/magic；cache miss/mismatch/stale 不服务、不覆盖旧 valid cache；
- 不实现 arbitrary path/URL/digest 或 Range fallback。

### C — Calibration truth 与 mirror closure

- exact schema 同时有 source/target frame、handedness、signed axisMap、determinant、units、quaternion convention、rotation/translation/uniform scale、bounds/tolerance/evidence；
- matrix/quaternion/axisMap 可互相重算，determinant 必须 +1，mirror/non-uniform/sparse/accessor/extra/non-finite drift fail closed；
- actual Marble/Hunyuan canary values、bounds、proxy dimensions/mass/pose 已冻结；
- integrity / authored-unverified calibration / proxy witness 分层显示，不把人工标定冒充 provider/world truth PASS；
- Marble floor 明确是 authored AABB floor，不称 provider ground plane。

### D — Source↔proxy executable witness

- SPZ↔collider bounds witness 绑定两项 digest、同一 calibration 与 `0.12 m` tolerance；
- Hunyuan decoded GLB AABB↔box proxy 绑定 digest/calibration/proxy 与 `1e-6 m` tolerance；
- floor proxy top `z=0` 只绑定 calibrated collider AABB minZ，并显示 authored-unverified；
- 独立篡改 source digest、calibration、proxy 或 tolerance 任一项都必须 FAIL。

### E — Presentation/product acceptance

- 四个独立 boolean toggle 可组合且不重新下载；
- empty-cache 与 imported 两条 Chromium path，UI 暴露 assetId/digest/truth level；
- browser provider/CDN/COS network 为零；
- generation token + AbortController + resource disposal 覆盖 rapid switch/late completion/unmount；
-真实 Hunyuan object 的 Episode/Evaluation/ref authority 保持既有 run/adopt separation；
- renderer quality 不成为 state/alignment authority。

## Scope discipline

若以上 contract 已闭合，未来 provider SDK、cloud cache、license clearance、HQ rendering、自动 ground estimation、mesh decomposition、Range/streaming optimization 都是 non-goal/P2，不能阻断本 vertical slice。P1 只用于 authority、secret、bounded lifecycle、现实不可交付或明确 acceptance 缺口。
