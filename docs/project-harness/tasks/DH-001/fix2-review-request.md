# DH-001 第二轮修复后交叉审查请求

## 角色、cwd 与 authority

你是 Demiurges `DH-001` 第二轮 invariant 修复后的 fresh independent reviewer。唯一 cwd 为 `/Users/Admin/projects/Demiurges`。只读 source/tests/docs，可运行 `bun test` 与只读诊断；不得 Edit/Write product、install、build、commit、branch、remote、push、deploy、SSH、联网或调用 subagent。仓库无 commit，必须直接读文件，不能依赖 `git diff`。

不要读取 `review-verdict-*.md`、`fix-review-verdict-*.md`、`fix-cross-review-verdict.md` 或另一 reviewer 输出。按当前代码独立判断，不预设 approved。

## Baseline

Product aggregate SHA-256：

```text
8c1a4015990433dc196e2175f79a8700d351ab6e0ead60e2091d1cddffe14d21
```

覆盖 `apps/studio/`（排除 `node_modules/`、`dist/`、`*.tsbuildinfo`）与根 `package.json`、`bun.lock`。审查后必须不变。

## 必读

- `AGENTS.md`、`README.md`
- `docs/project-harness/{scope,architecture,domain-model,technical-foundation,progress}.md`
- `docs/project-harness/tasks/DH-001/{plan,findings,fix2-review-request}.md`
- `docs/project-harness/harness-checklist.json`
- `apps/studio/src/` 全部 source/tests
- 根与 Studio package/tsconfig/Vite 配置及 `bun.lock`

## 必须独立核验

1. Duplicate Snapshot identity 与 ref authority 是否继续 fail closed。
2. 固定 WorldProgram/RuntimeProfile identity 是否覆盖全部实际执行参数，能否以同 ID 运行不同 gravity/timestep/target/duration。
3. Snapshot/Program/Profile/ExplicitInputs 是否在第一个 await 前真正递归 immutable；能否在 WASM await 期间制造 execution/evidence split-brain。
4. Runtime 是否仅接受它完整演化的 Entity/state；static floor mass/velocity、extra Entity 或其他旁路状态是否 fail closed。
5. pose/quaternion/linear velocity/world angular velocity 的 MuJoCo mapping 是否正确；sample 1 的 quaternion oracle 是否足以避免 round-trip 同错相消。
6. 240/30 integer sampling、terminal sample 与 contact event 是否各自对应正确的 physics state/time；`mj_forward` placement 是否引入重复演化或新的 off-by-one。
7. malformed inputs 是否可能返回 completed，RuntimeEvidence 是否仍可伪造。
8. EvaluationRecord identity/immutability、record/adopt ownership、WASM live-view copy、Embind cleanup 与 dependency direction 是否保持。
9. 新实现是否仍是固定 slice 的最小闭包，还是出现补丁堆叠、未来抽象或隐性行为扩张。
10. tests 是否真正复现行为且 oracle 独立，是否仍有当前 slice 的可执行 P0/P1 反例。

Operator 报告：第二轮 RED 为 9 pass/4 fail；修复后 `bun test` 13/0/130，typecheck/build 与真实浏览器 edit/run/evaluate/adopt 通过。Reviewer 必须将其视为待独立核验报告。

## 输出

```text
DECISION: approved | changes_requested | blocked

P0
- 无 / [file:line] 发现、影响、证据

P1
- 无 / [file:line] 发现、影响、最小复现

P2
- 无 / [file:line] 改进

证据
- 实际文件、命令与结果

残余风险
- ...

关单建议
- ...
```

`approved` 要求无 P0/P1；任一当前 scope 可复现 P1 必须 `changes_requested`。不要输出 private chain-of-thought。
