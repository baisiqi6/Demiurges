# DH-013 Plan Review Request — Round 3

## 角色与隔离

你是 fresh independent DH-013 Round 3 plan reviewer。严格只读，不读取 Round 1/2 request、verdict、cross-review summary、OMP session、其他 reviewer 输出或当前 task 的 `findings.md/progress.md`；只依据本 request、current canonical plan、稳定 architecture/source 与可执行只读 probes。

不得修改文件、commit/push/merge、联网、访问 Keychain/provider/production/Discord。不得把计划扩大为 provider platform。

输出：

- `decision: approved | changes_requested | blocked`
- `may_implement: yes | no`
- `P0/P1/P2`
- mandatory checks A–F 逐项 PASS/FAIL
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
84b2768d1dd3b19b75b184650fb8d611ca1c2c4d4d959c74dd8d5a127ab5bcbf  docs/project-harness/tasks/DH-013/plan.md
a335dafd9d996f7bf15346890d3056333f3a9efaec98df3820d69cd5360b20c4  docs/project-harness/scope.md
1701548340dec0dc4b7ed17d884e7418b76377850b4f7dc3d207e1259c510b70  docs/project-harness/architecture.md
b43bce3384171920fdd34175c9644413ab4840a98d4e597e9cf0fe73c7590b3b  docs/project-harness/domain-model.md
877f58e2876e2286d68ef4e414057b64e04660d12482c6e080e3f873cb218ec1  apps/studio/src/presentation-three/ThreeViewport.tsx
29ef224b60cbac7c549d9287806679aa67229cd579462f3ce2e87aceaddd383e  packages/world/src/artifacts/diagnostic-rigid-fixture.ts
8ee932113a956746ea687e88fa327a965b740a6855fb8825a4d39d72a3dcd724  packages/world/src/product-session-codec.ts
e0ae8c36891dbdad4188a8acbfc0abb9828e6cd461777d2ecc55195f2cf94b43  apps/agent-gateway/src/product-session-api.ts
```

审查前后逐项复算并确认 branch/HEAD/status 不漂移。本 request 已自包含，不得读取 earlier request。

## Baseline

- Full：`172 pass / 0 fail / 2958 assertions`
- typecheck/build/diff/EXharness：pass
- product source 未改；本轮只判断计划能否安全进入 Phase 1 RED。

## Mandatory checks

### A — High-risk provider boundary

- Mode 为 high-risk；Marble/Hunyuan exact Keychain locator、existing resource、query method/endpoint/header、allowed fields、download host 与禁止 generation 都冻结；
- Marble `WLT-Api-Key`、Hunyuan raw-key `Authorization`（无 `Bearer ` 前缀）只发各自 API origin，CDN/COS download 无 credential；query/download 均 `redirect: manual`；
- shared 90s deadline、metadata/stream byte budgets、one refresh、0700/0600 temp、finally cleanup、atomic publish、error redaction 与 old valid cache rollback 可测试。

### B — Single artifact authority

- Git registered manifest 是唯一 identity/calibration authority；cache 只是由 manifest digest 派生的 materialization；
- Snapshot/Projection 只携带 assetId+manifestDigest；receipt/provider response/signed URL 不被 Runtime 读取；
- closed asset route 在 serve/session-open 重算 size/digest/magic；miss/mismatch/truncation 不服务、不污染旧 valid cache；不接受 arbitrary path/URL/digest，不实现 Range。

### C — Complete literal CalibrationRecord

- SPZ、Marble collider、Hunyuan GLB 各有一条独立 exact-key record；逐条含完整 id/status/method/frame/handedness/axis/determinant/units/quaternion/transform/bounds/integrity tolerance/evidence literal；
- evidence 的 assetId+digest 与 manifest canary identity exact 绑定；Marble 两条只共享 exact transform，不共享 singular bounds/evidence；
- matrix/quaternion/axisMap 可互相重算、determinant=+1；mirror/non-uniform/sparse/accessor/extra/non-finite/bounds/digest drift fail closed；
- proxy tolerance 只属于 witness，不在 CalibrationRecord 中含混复用；truth layers 不冒充 provider metric truth。

### D — Exact executable witnesses

- Marble pair witness 显式携带两项 assetId/digest/calibrationId、六面 delta、measured `0.10252785682678223`、tolerance `0.12`；
- Hunyuan witness 显式携带 GLB identity/calibration、`entity:generated-object` box proxy、measured `5.551115123125783e-17`、tolerance `1e-6`；
- floor witness 显式携带 collider identity/calibration、calibratedMinZ、`entity:floor` proxy/topZ、measured `0`、tolerance `1e-6`；
- witness 是 registry 重算派生 evidence，caller serialized measured/passed 不能成为 authority。

### E — Tamper matrix 与 scenario closure

- 三类 witness 分别覆盖 source digest、calibration id/transform/bounds、proxy/representation 与 tolerance 的独立 drift；每项在可达的 Repository/Runtime/codec/stream admission fail closed，不能只降级 UI；
- exact scenarioId=`scenario:marble-hunyuan-composite-v1`；refs=`entity:environment|entity:floor|entity:generated-object`；relabel、duplicate ref、foreign lineage 与 representation drift 拒绝；
- run 不推进 ref，仅既有 explicit adopt control 能推进；四工具保持 exact，不增加第五工具。

### F — Presentation/product acceptance

- 四个 boolean toggles 可组合且不重新下载；empty-cache/imported 两条 Chromium path；browser provider network 为零；
- generation token + AbortController + complete disposal 覆盖 rapid switch/late completion/unmount；
- UI 分开显示 integrity、authored-unverified calibration 与 proxy witness；renderer quality 不成为 state/alignment authority；
- 真实 Hunyuan object Episode/Evaluation/ref 保持 deterministic authority separation。

## Scope discipline

若 A–F 已闭合，provider SDK、cloud cache、license clearance、自动 ground estimation、mesh decomposition、Range/streaming 优化与更高级渲染均为 non-goal/P2，不得阻断本切片。P1 只用于 authority、secret、bounded lifecycle、现实不可交付或明确 acceptance 缺口。
