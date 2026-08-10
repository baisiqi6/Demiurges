# DH-001 交叉审查请求

## 角色与目标

你是 Demiurges `DH-001` 的 fresh independent reviewer。目标是判断 Falling Cube Vertical Slice 是否满足 acceptance，并找出足以阻止 closeout 的 correctness、authority、determinism、resource lifecycle、testing 或 scope 问题。

你不是实现者，也不是 Operator。不要读取另一位 reviewer 的 verdict，不要迎合 worker 已写出的成功结论。

## 工作目录与只读 Authority

- 唯一 cwd：`/Users/Admin/projects/Demiurges`
- 允许读取：该仓库全部 product source、tests、lockfile 与 `docs/project-harness/`
- 允许执行：`git status`、`rg`、JSON parsing、`bun test` 及不会修改 product source 的只读诊断
- 允许修改：无
- 禁止：Edit/Write、安装 dependency、生成或覆盖 product/build artifact、commit、branch、remote、push、Issue/PR、deploy、SSH、修改 Lyaup、调用 subagent/Agent/Task、联网搜索
- hard stop：若关键事实无法只读核验，写为 residual risk 或 `blocked`，不要扩大 authority
- 输出：中文主体；command、path、identifier、model name 保留 English

当前仓库尚无 commit，全部实现是 untracked working-tree artifact；不能依赖 `git diff` 发现源码，必须直接读取文件。

## Product Baseline

审查开始前，product artifact aggregate SHA-256 为：

```text
48d160ccdb1fdf86955d00f99f55069eddcda31fd1f8f82a42b6e8241ba929e9
```

它覆盖 `apps/studio/`（排除 `node_modules/`、`dist/`、`*.tsbuildinfo`）以及根 `package.json`、`bun.lock`。Reviewer 不得使该 digest 变化。

## 必读材料

1. `AGENTS.md`
2. `README.md`
3. `docs/project-harness/scope.md`
4. `docs/project-harness/architecture.md`
5. `docs/project-harness/domain-model.md`
6. `docs/project-harness/technical-foundation.md`
7. `docs/project-harness/tasks/DH-001/plan.md`
8. `docs/project-harness/tasks/DH-001/findings.md`
9. `docs/project-harness/tasks/DH-001/review-packet.md`
10. `docs/project-harness/tasks/DH-001/reviewer-prompt.md`
11. `docs/project-harness/harness-checklist.json`
12. `docs/project-harness/progress.md`
13. `apps/studio/src/` 下全部 source 与 tests
14. 根与 Studio 的 `package.json`、`tsconfig*`、`vite.config.ts`、`bun.lock`

## 必须独立核验的问题

### Correctness 与 authority

1. Runtime 是否真实调用 MuJoCo，而非 Three.js animation、解析公式或 test mock？
2. Snapshot、Episode、TerminalSnapshot 与 current Ref 是否各自只有一个明确 owner？
3. `record`、timeline、evaluate 是否都不推进 ref，只有 explicit `adopt` 才推进？
4. Snapshot → MJCF 是否正确处理 pose、quaternion convention、collision representation、mass、friction、frame 与 SI units？
5. Episode samples 是否复制 WASM live view；所有 Embind handles 是否在成功与异常路径上恰好释放一次？
6. 采样时刻、terminal sample、contact event、duration/timestep 是否存在 off-by-one 或浮点阈值错误？
7. malformed/unsupported Snapshot、duplicate run ID、重复 edit/run/adopt、并发点击或 Runtime 异常时是否会破坏 Repository authority？只报告本 slice 的真实风险，不要求未来平台能力。

### Evaluation 与 tests

8. deterministic evaluator 是否真正独立读取 Episode metric，而非 UI 或 worker 文案？
9. tests 是否足以证明 advertised acceptance，是否存在只验证 happy path、假阳性 oracle、未证明 immutability 或未证明浏览器行为？
10. `bun test` 的真实结果是什么？若运行被 permission/环境阻止，明确记录，不得伪造。

### Architecture、scope 与 simplicity

11. Kernel 是否 import SolidJS、Three.js、MuJoCo 或泄漏 Presentation/Runtime object identity？
12. 是否已经为了未来 provider、3DGS、robot 或 safety 预建无真实 consumer 的 abstraction？
13. 是否有需要从底层修正的 invariant 违例，而不是可继续打补丁的局部问题？

### UI、a11y 与 motion

14. UI 是否能区分 repository state、episode frame 与 adopted terminal，loading/error/disabled state 是否可理解？
15. semantic control、label、keyboard focus、canvas fallback/accessible name、responsive overflow 与 `prefers-reduced-motion` 是否存在阻断产品验收的问题？
16. 视觉 craft 或偏好只列 P2；只有影响功能、可访问性或证据可信度时才升级 P1。

## Severity 与 decision

- P0：数据/authority 严重错误、虚假 Runtime proof、不可恢复破坏或根本无法验收。
- P1：当前 slice 的 correctness、determinism、资源安全、核心 acceptance 或可用性缺陷，关闭前必须修复。
- P2：不阻断当前 slice 的改进、性能预算、测试增强或视觉 craft。
- `approved`：无 P0/P1；P2 可以存在。
- `changes_requested`：至少一个可在当前 scope 内修复的 P0/P1。
- `blocked`：关键结论依赖缺失 authority 或无法取得的必要证据。

## 输出格式

```text
DECISION: approved | changes_requested | blocked

P0
- 无 / [file:line] 发现、影响、可复核证据

P1
- 无 / [file:line] 发现、影响、可复核证据

P2
- 无 / [file:line] 发现、影响、建议

证据
- 实际读取的关键文件
- 实际运行的命令与结果摘要
- Runtime/Repository/浏览器证据判断

残余风险
- ...

关单建议
- ...
```

只输出可核验结论，不输出 private chain-of-thought。
