# DH-013 Plan Review Request — Round 1

## 角色与决定门

你是 DH-013 的 fresh independent plan reviewer。只读审查，不修改文件，不 commit/push/merge，不联网，不读取任何将来生成的 reviewer verdict，也不调用 provider、Keychain、production 或 Discord。

输出结构化 verdict：

- `decision: approved | changes_requested | blocked`
- `may_implement: yes | no`
- `P0`、`P1`、`P2`
- 逐项说明 executable/architectural evidence、受影响 acceptance 与最小 remediation
- 列出实际读取文件与执行命令

只有无 P0/P1 且计划已经形成可执行、可失败、无双 authority 的 vertical slice 时，才可 `approved` / `may_implement: yes`。

## Frozen identity

- Branch：`agent/codex/DH-013`
- Base/HEAD：`97761d6b5dba899fcb73b93ba830ba78f2980766`
- Worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-013`
- Product source：相对 base 无修改；当前 diff 只应包含 DH-013 harness/plan artifacts。

固定文件 SHA-256：

```text
b1ad9330daff9a77d8478c4d8b7e43535a102c557507fe8daad5ccf44b95ec17  docs/project-harness/tasks/DH-013/plan.md
a335dafd9d996f7bf15346890d3056333f3a9efaec98df3820d69cd5360b20c4  docs/project-harness/scope.md
1701548340dec0dc4b7ed17d884e7418b76377850b4f7dc3d207e1259c510b70  docs/project-harness/architecture.md
b43bce3384171920fdd34175c9644413ab4840a98d4e597e9cf0fe73c7590b3b  docs/project-harness/domain-model.md
877f58e2876e2286d68ef4e414057b64e04660d12482c6e080e3f873cb218ec1  apps/studio/src/presentation-three/ThreeViewport.tsx
29ef224b60cbac7c549d9287806679aa67229cd579462f3ce2e87aceaddd383e  packages/world/src/artifacts/diagnostic-rigid-fixture.ts
8ee932113a956746ea687e88fa327a965b740a6855fb8825a4d39d72a3dcd724  packages/world/src/product-session-codec.ts
e0ae8c36891dbdad4188a8acbfc0abb9828e6cd461777d2ecc55195f2cf94b43  apps/agent-gateway/src/product-session-api.ts
```

审查前后复算上述 hash，并确认 HEAD、branch、status 没有 reviewer mutation。

## 已通过 baseline

- `bun test`：172 pass / 0 fail / 2958 assertions
- `bun run typecheck`：pass
- `bun run build`：pass，仅既有 MuJoCo browser-external 与 chunk-size warning
- `git diff --check`：pass
- `.artifacts/harness/harnessctl validate`：0 warnings

Reviewer 不必重复完整 build；可以执行 bounded、只读的 source/test/manifest inspection。不得访问 credential 或真实 provider。

## 必审问题

1. 是否保持 Artifact / Observation / Presentation / CollisionSource / PhysicsProxy / Snapshot authority 分离；
2. `CalibrationRecord` 是否足以阻止在缺 metric scale/ground plane 时凭视觉猜测；Frame/Units/axis/handedness/quaternion/bounds/tolerance 是否都有明确闭合点；
3. ignored verified cache + Git manifest + Gateway same-origin route 是否形成唯一 asset path，是否会出现 cache bytes 与 manifest/Projection 双 authority；
4. provider query/download 是否有 credential isolation、signed URL 非持久化、deadline、redirect/domain policy、size、magic、digest、temp cleanup、atomicity、error redaction 与 stale-cache 语义；
5. 实现 scope 是否过宽；若需要缩小，必须仍保留“真实 Marble SPZ + 真实 Hunyuan GLB + alignment + one MuJoCo Episode”的 vertical slice；
6. composite scenario 是否能复用既有四工具与 Runtime，而不是新增 provider/file fifth tool 或通用 Adapter SDK；
7. provider collider source 与 MuJoCo proxy 是否有可执行关系和可见证据，避免“同时显示但没有证明对齐”；
8. Spark/GLTF/OrbitControls lifecycle、rapid switch、abort、late completion、cache miss 与 disposal acceptance 是否足够具体；
9. browser acceptance 是否能证明没有直连 provider、没有 diagnostic fallback、四 toggle、真实 asset identity、Episode/Evaluation 和 ref authority；
10. 计划是否遗漏 licensing/provenance、large-asset portability、offline/cache-miss product state 或可复算 import receipt。

## Scope discipline

P1 应只用于会导致 authority 绕过、secret 暴露、不可执行验收、关键生命周期无界、现实上无法交付或与 stable architecture 冲突的问题。一般 polish、未来扩展和非阻断优化列为 P2，不得把本计划扩大成 provider platform。
