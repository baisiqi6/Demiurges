# DH-004 交叉审查请求

## 角色与目标

你是 independent read-only reviewer。审查 `DH-004` 的最小 World Tool Surface 是否满足 canonical plan、项目 invariant 与 authority boundary，并给出结构化 verdict。不要把实现者的测试摘要当作结论；请独立读取 source、diff，并运行必要的只读 tests/probes。

## 工作目录与基线

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-004`
- branch：`agent/codex/DH-004`
- base：`main` / `15744fb3aeae2f995765047d657aef9821f653cb`
- 当前未提交 product source aggregate SHA-256：`b6bbe45de352803a46959d8badd768484bb13d44a4ff4db85cd5cad73f9643ca`
- canonical plan：`docs/project-harness/tasks/DH-004/plan.md`

## 必读范围

- `AGENTS.md`
- `docs/project-harness/scope.md`
- `docs/project-harness/architecture.md`
- `docs/project-harness/domain-model.md`
- `docs/project-harness/tasks/DH-004/plan.md`
- `apps/studio/src/world-tools/world-tool-surface.ts`
- `apps/studio/src/world-tools/world-tool-surface.test.ts`
- `apps/studio/src/host/runtime-mvp-host.ts`
- `apps/studio/src/repository/world-repository.ts`
- `apps/studio/src/kernel/world.ts`
- `apps/studio/src/kernel/types.ts`

## 审查重点

1. model-facing prototype 是否真的只暴露 `read/write/edit/run`，有没有通过 property、closure、prototype、return value 或 constructor state 泄露 Host/Repository/evidence/adopt authority；
2. `run` 是否只产生 Episode/Evaluation evidence，任何成功或失败路径都不推进 current ref；
3. `edit` 是否仍是 authored Snapshot change，是否保持 expected ref CAS，stale input 是否可能改变 current；
4. model JSON data 经过 round-trip 后能否工作；accessor、prototype、额外字段、非 finite number、malformed ref/ID 是否 fail closed；
5. output 是否递归冻结且 JSON serializable，是否泄露 Three.js/MuJoCo handle 或 Runtime/Repository implementation；
6. 自动 Evaluation 与独立 control-side adopt 的组合是否仍绑定同一 Host evidence provenance；
7. 是否存在 ID collision、partial side effect、re-entrancy、same-realm interception 或可执行 authority bypass；
8. 是否违反 DH-004 non-goals，或为了未来 provider 引入了过早抽象。

## 允许与禁止

- 允许：只读文件/Git 检查；`bun test`、`bun run typecheck`、`bun run build`；不写 repo 的 `bun -e` adversarial probes。
- 禁止：Edit/Write/NotebookEdit、修改文件、安装依赖、commit、push、merge、reset、clean、联网、SSH、deploy、生产操作、调用其他 agent。
- 如果检查需要新 authority，停止并报告，不要自行扩大范围。

## 期望输出

中文为主体，English token 保持精确。输出：

```text
decision: approved | changes_requested | blocked
P0: ...
P1: ...
P2: ...
tests/probes: ...
authority/scope: ...
digest_before_after: ...
residual_risks: ...
```

每个 finding 必须给出路径/行号、可执行反例或严格推导，以及最小修复方向。没有 finding 时明确写 none。
