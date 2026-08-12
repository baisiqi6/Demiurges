# DH-010 Phase 1 Contract RED Evidence

## Authority 与冻结输入

- Human authority：2026-08-11 明确授权进入 implementation；本 checkpoint 只执行 canonical plan 的 Phase 1 Contract RED，不进入 GREEN、geometry、Runtime 实现或 Studio UI；
- base：`22e288690937834135584d023e4140e26696f761`；
- branch：`agent/codex/DH-010`；
- canonical plan SHA-256：`2738b3135434507dd5b53aea74bb87e45af21912fa72789a7b1096ca33ffa21a`；
- approved context aggregate：`c52a8ddb38ee15692a828fce9fd3dacb9e9710915691f8822612286ce7769e0d`；
- Phase 1 test-spec digests：
  - `packages/world/src/world-tools/world-tool-contract.ts`：`94a04618edeacc2b5354690e335d9183560e450774ce9fa04ec365125c1efd0c`；
  - `packages/world/src/world-tools/world-tool-contract.test.ts`：`47cf1bf4015c78295a4788f26832b04791b9ce16b11af2d8e306fe3e832bbac6`；
  - `packages/world/src/dh010-ball-vessel-contract.test.ts`：`1745e554994523be9ad60bd4201a8588c52a1dafbfb6dc88bf597b6cefd5865b`。

## Baseline

安装前确认 `bun.lock` 与已批准 base 相同，随后只执行 `bun install --frozen-lockfile` 恢复该独立 worktree 的锁定依赖。变更前 targeted baseline：

```text
bun test packages/world/src/world-tools/world-tool-surface.test.ts apps/agent-gateway/src/omp-world-agent.test.ts
21 pass / 0 fail / 127 expect
```

## RED command 与结果

```text
bun test packages/world/src/world-tools/world-tool-contract.test.ts \
  packages/world/src/dh010-ball-vessel-contract.test.ts \
  apps/agent-gateway/src/omp-world-agent.test.ts

16 pass / 16 fail / 105 expect
```

全量复核：

```text
bun test
103 pass / 16 fail / 2649 expect
```

16 个 failure 全部来自本 Phase 新增的 RED contract；DH-009 的 102 个既有 regression tests 继续通过，另有 1 个新增 plain-data contract/parser test 已通过。失败不是 loader、syntax、dependency 或 build error，而是逐项击中当前 walking skeleton 的真实能力边界：

1. legacy `program:falling-cube` 尚未迁移到 `program:free-fall-rigid-v1`；
2. Host/Gateway/OMP 尚未共同消费唯一 `WORLD_TOOL_CONTRACT`；
3. `world_write` 仍要求 `cubeHeight`，`fixtureId` 仍 optional 且只有两个 fixture；
4. `world_edit` 仍固定 cube height，合法 nested pose 无法到达 Host；
5. scenario target/Program mismatch 与 floor penetration 尚无正确 fail-closed boundary；
6. ball-vessel fixture 仍退化为 `entity:cube`，不存在 exact floor/vessel/ball carrier；
7. Repository 只 deep-freeze，不验证 compound collision 的 duplicate `partKey`；
8. MuJoCo Runtime 固定旧 Program 与 floor+cube，不能产生 91-sample multi-entity Episode/contact evidence；
9. landing evaluator 不认识 stable-inside-vessel、0.5s/16-sample continuous support、timestamp/penetration controls；
10. Runtime 尚不能完成 closed-proxy negative run；
11. Repository authority 仍接纳 caller-supplied single alternate policy，而非 Host closed registry；
12. Product codec 仍只接纳旧 representation 与 floor/cube role closure。

## 非 RED gates

以下命令通过，证明 Phase 1 规格没有破坏当前可构建产品：

```text
bun run typecheck  # pass
bun run build      # pass
git diff --check   # pass
```

Vite 仍报告既有 large chunk warning；它不是本 Phase 新增 failure。未执行真实 provider prompt、外部资产下载、browser acceptance、commit、push、PR、merge、tag、deploy、closeout 或 mark-done。

## Phase 1 结论

Phase 1 RED 成立：第二个真实任务所需的 model-facing contract、representation、Runtime/Episode、Evaluation/adopt 与 codec 缺口已经被可执行测试精确暴露；下一阶段应从 deterministic vessel artifact 与 closed representation variants 开始逐步 GREEN，不应增加 `cupHeight`、legacy compatibility flag、第五工具或 renderer fallback。
