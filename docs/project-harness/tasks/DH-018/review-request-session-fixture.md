# DH-018 generated session fixture — independent review request

你是只读 Reviewer。不要相信 Operator result，也不要修改、修复、格式化、commit、push 或调用 harness mutation。

从底层目标审查：这个子切片只需把 verified binding 投影为同一个 Marble composite 场景中的 session Snapshot；必须复用可信 environment/floor，动态替换 generated-object identity，并把 source bounds 经过既有 authored-unverified Y-up→Z-up AABB centering 转成 box proxy。优先第一性原理和奥卡姆剃刀，不要求此切片提前实现 validator/surface/session loop。

读取：

- `docs/project-harness/tasks/DH-018/plan.md`
- `docs/project-harness/tasks/DH-018/implementation-request-session-fixture.md`
- `packages/world/src/artifacts/marble-hunyuan-generated-session.ts`
- `packages/world/src/artifacts/marble-hunyuan-generated-session.test.ts`
- `packages/world/src/artifacts/marble-hunyuan-composite-fixture.ts`
- `packages/world/src/artifacts/marble-hunyuan-registry.ts` 中 Hunyuan calibration/proxy 定义
- `docs/project-harness/tasks/DH-018/operator-result-session-fixture.md`

独立运行：

```bash
bun test packages/world/src/artifacts/marble-hunyuan-generated-session.test.ts
bun run typecheck
git diff --check -- packages/world/src/artifacts/marble-hunyuan-generated-session.ts packages/world/src/artifacts/marble-hunyuan-generated-session.test.ts
```

输出 `VERDICT: APPROVE|CHANGES_REQUESTED|BLOCKED`，P0/P1/P2 findings 必须含路径与行号（没有则写 none），并回答：axis mapping/half extents 是否正确；动态 identity、固定 authored calibration/witness、旧 canonical 不变和 recursive freeze 是否被直接证明；是否存在不必要抽象或虚假 provider-truth 声称。明确本 verdict 不覆盖后续 validator/surface/session repair loop。

只输出到会话，不写文件。
