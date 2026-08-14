# DH-013 Plan Review Request — Round 4

## Fresh isolation

你是 fresh independent DH-013 Round 4 reviewer。只读本 request、current `plan.md`、下列 frozen stable docs/source 与 bounded read-only probes。禁止读取任何 earlier request/verdict/cross-review、task `findings.md/progress.md`、OMP session 或其他 reviewer 输出。禁止写文件、联网、Keychain/provider、build/install、Git mutation。

输出 `decision`、`may_implement`、P0/P1/P2、A–G PASS/FAIL、命令和 start/end identity。只有 P0/P1=0 且 A–G 全 PASS 才能批准。

## Frozen identity

- Worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-013`
- Branch：`agent/codex/DH-013`
- HEAD/Base：`97761d6b5dba899fcb73b93ba830ba78f2980766`
- Product source 相对 base 零修改；baseline `172 pass / 0 fail / 2958 assertions`。

固定顺序 SHA-256：

```text
4211f3e9f17bfa936bacbffd7504ea8bfd0d652a0c040cd7d3462752d044405d  docs/project-harness/tasks/DH-013/plan.md
a335dafd9d996f7bf15346890d3056333f3a9efaec98df3820d69cd5360b20c4  docs/project-harness/scope.md
1701548340dec0dc4b7ed17d884e7418b76377850b4f7dc3d207e1259c510b70  docs/project-harness/architecture.md
b43bce3384171920fdd34175c9644413ab4840a98d4e597e9cf0fe73c7590b3b  docs/project-harness/domain-model.md
877f58e2876e2286d68ef4e414057b64e04660d12482c6e080e3f873cb218ec1  apps/studio/src/presentation-three/ThreeViewport.tsx
29ef224b60cbac7c549d9287806679aa67229cd579462f3ce2e87aceaddd383e  packages/world/src/artifacts/diagnostic-rigid-fixture.ts
8ee932113a956746ea687e88fa327a965b740a6855fb8825a4d39d72a3dcd724  packages/world/src/product-session-codec.ts
e0ae8c36891dbdad4188a8acbfc0abb9828e6cd461777d2ecc55195f2cf94b43  apps/agent-gateway/src/product-session-api.ts
```

起止逐项复算；不得通过读取 earlier review 材料补上下文。

## Mandatory checks

### A — Provider/secret boundary

High-risk；exact Keychain locators/resource/query/header/allowed fields/download hosts；Hunyuan raw-key `Authorization` 无 Bearer；API origin only；CDN/COS no credential；manual redirects；90s shared deadline、budgets、one refresh、private temp/finally/atomic/redaction/rollback；no generation。

### B — Artifact authority

Git manifest 唯一 authority；cache 仅 digest materialization；Snapshot/Projection 只含 assetId+manifestDigest；receipt/signed URL/provider response 不被 Runtime 读取；closed route serve/session-open revalidation；miss/mismatch/truncation fail closed；no arbitrary path/URL/digest/Range。

### C — Literal calibration closure

三项 asset 各有完整独立 literal CalibrationRecord；identity/evidence exact；Marble transform shared 而 bounds/evidence separated；axis/quaternion/determinant/units/transform/bounds 自洽；registry literals exact，derived float comparison 唯一使用 `TRANSFORM_RECOMPUTE_EPSILON=1e-12`，不得借 proxy tolerance；mirror/non-uniform/sparse/accessor/extra/non-finite drift拒绝。

### D — Exact witness closure

Marble pair、Hunyuan box、authored floor 三项 witness 都绑定 exact source digest/calibration/proxy-or-representation/metric/measured/tolerance/truth level；全部由 registry 重算，caller `passed/measured` 不可信。

### E — Witness tamper matrix remediation

每项 witness 独立覆盖 source digest、calibration id、transform、source/target bounds、proxy/representation 与 tolerance drift。尤其 authored-floor 必须分别覆盖 axisMap/rotation/translation/uniformScale、sourceBounds、targetBounds.minZ；在 Repository、Runtime、codec、stream 对应可达 seam fail closed，不只降级 UI。

### F — Composite scenario closure remediation

Phase 1 必须有 exact、独立 table rows：scenario relabel；三个 duplicate-ref 变体；authored parent lineage；Episode base/terminal/scenario/ref runtime lineage；accepted `world:current` ref continuity；environment/floor/generated-object representation drift。每行明确 Repository/Runtime/result validation/codec/stream client 中适用的 fail-closed seam，不能以 generic guard 存在替代 fixture evidence。

### G — Product acceptance/scope

exact scenario/refs；run/adopt separation；四工具无第五工具；四个 boolean toggles、empty/imported Chromium、zero provider-domain network、abort/generation token/disposal、三层 truth UI、Episode/Evaluation/ref authority；renderer 非 authority。不得扩大为 provider SDK/cloud/marketplace/auto-ground/mesh decomposition/Range/HQ framework。
