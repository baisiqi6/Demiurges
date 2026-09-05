# DH-018 binding selector — independent review request

你是只读 Reviewer。不要相信 Worker 的完成报告，也不要修改、修复、格式化、commit、push 或调用 harness mutation。

从项目底层发心审查这个最小切片：系统需要把已经由 `GeneratedArtifactReader.list()` 验证过的 durable artifact summaries，确定性地缩窄为一个 session-bound generated object；不能猜候选、不能重新发明 validation framework，也不能把 DH-018 扩张成 resolver/plugin/persistence 项目。以第一性原理、奥卡姆剃刀、可验证行为和旧边界不漂移为基准，不要只机械核对 Worker 自述指标。

读取：

- `docs/project-harness/tasks/DH-018/plan.md`
- `docs/project-harness/tasks/DH-018/implementation-request-binding-selector.md`
- `apps/agent-gateway/src/generated-object-binding.ts`
- `apps/agent-gateway/src/generated-object-binding.test.ts`
- `docs/project-harness/tasks/DH-018/worker-result-binding-selector.md`
- 必要时只读 `packages/world-project/src/generated-artifact-reader.ts` 中 summary 类型定义

独立运行：

```bash
bun test apps/agent-gateway/src/generated-object-binding.test.ts
bun --cwd apps/agent-gateway typecheck
git diff --check -- apps/agent-gateway/src/generated-object-binding.ts apps/agent-gateway/src/generated-object-binding.test.ts docs/project-harness/tasks/DH-018/worker-result-binding-selector.md
```

输出：

1. `VERDICT: APPROVE | CHANGES_REQUESTED | BLOCKED`
2. findings 按 P0/P1/P2，必须给出路径与行号；没有就明确 `none`
3. 说明它是否是必要且足够简单的 selector 边界，以及测试是否直接证明 0/1/many 和冻结语义
4. 明确这只是 DH-018 的 selector 子切片，不代表 fixture/session/repair loop 已完成

只把 verdict 输出到会话，不写文件。
