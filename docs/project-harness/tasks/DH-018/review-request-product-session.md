# DH-018 Independent Review — complete MVP closure

你是独立只读 Reviewer。不要相信 Worker RESULT，也不要修改、修复、commit、push、deploy、调用 provider、读取 Keychain 或联网。只从当前磁盘、代码、测试和 Operator 证据判断。

## 底层需求

DH-017 已经产生并持久化一个 verified Hunyuan `object-glb/glb-2.0`。DH-018 的发心不是建立新框架，而是让受限 Agent 在 Host 固定的真实生成物上只用 `read/write/edit/run`，经 deterministic Evaluation 完成可观察的 fail → inspect/read → repair → pass。provider generation 仍在 control plane；禁止第五工具、通用 resolver、Project v1/persistence 扩张、registry 扩张。

请以第一性原理和奥卡姆剃刀审查整个 selector → fixture → WorldToolSurface → Product Session → codec → trace 闭环，而非机械核对指标。重点问：

1. session 是否真的只在创建时消费一次 durable reader，并稳定固定唯一候选；后续状态变化不会偷偷换物体。
2. 零/多候选或 reader recovery 时静默回退 static composite，是否符合用户真实意图，还是应显式拒绝以避免“看起来成功但没用生成物”。这项请给出 P 级别和最小修正建议。
3. codec 为 generated session 增加的 semantic/write ID 接受面是否足够精确，是否意外放宽普通 projection 或 static authority。
4. repair loop 是否在同一 repository/world authority 上真实地产生第一次 `passed=false`、失败后的 read、用 fresh Ref repair、第二次 `passed=true`，且失败 evidence 未被覆盖。
5. 旧 static composite、Project v1、DH-017 generation admission 是否保持；是否出现重复逻辑、重型防御或不必要抽象。

## 本轮主要实现文件

- `apps/agent-gateway/src/generated-object-binding.ts`
- `packages/world/src/artifacts/marble-hunyuan-generated-session.ts`
- `packages/world/src/artifacts/marble-hunyuan-composite-fixture.ts`
- `packages/world/src/world-tools/world-tool-surface.ts`
- `apps/agent-gateway/src/product-session.ts`
- `apps/agent-gateway/src/product-session-api.ts`
- `packages/world/src/product-session-codec.ts`
- 对应 tests

注意：`product-session-api.ts/test.ts` 中 generation admission 的既有 DH-017 改动早于本轮，不要把整份相对 HEAD diff 都误算成 Worker 新增。

## Operator 独立证据

- focused 7 files: 183 pass / 0 fail / 444 assertions
- root `bun run typecheck`: world-project、agent-gateway、studio 均 pass
- targeted `git diff --check`: clean
- `.artifacts/harness/harnessctl validate`: 0 warnings
- ZCode native runtime model event: `GLM-5.3`; WebFetch/WebSearch usage: 0

## 输出格式

- Findings 按 P0/P1/P2/P3；没有则写 none。
- 明确判断“静默 static fallback”是否阻断 DH-018 完成。
- 给唯一 `VERDICT: APPROVE | CHANGES_REQUESTED | BLOCKED`。
- Verdict 只针对 DH-018 MVP，不扩大到未来 persistence/audit/retry。
