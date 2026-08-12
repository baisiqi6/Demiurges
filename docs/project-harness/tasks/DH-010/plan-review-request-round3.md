# DH-010 Plan-only Independent Cross-review Request — Round 3

## Frozen target

- Worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-010`；
- Branch：`agent/codex/DH-010`；
- Base/HEAD：`22e288690937834135584d023e4140e26696f761`；
- Canonical plan：`docs/project-harness/tasks/DH-010/plan.md`；
- Plan SHA-256：`2a34655b7e1f7ae18d075a03c5e6132a0cc03085dcb75fa87b711206cc762c65`；
- Context aggregate SHA-256：`d4af5a284999830d20633f9d107649b96aaea4e2661fe6d4d25a7af072a6e621`。

Aggregate 仍按 Round 2 所列 7 个 manifest files、同一顺序计算。digest 不匹配则 `blocked`。

## Authority and independence

- fresh independent、只读 plan reviewer；
- 不读取任何 `plan-review-verdict-*`、`plan-cross-review-verdict-*` 或 earlier review request；
- 可读 canonical plan、7-file context、`AGENTS.md` 与必要 current source/tests，可运行只读 hash/Git/validator/source probes；
- 禁止文件修改、build/install、Git mutation、联网/provider/credential/deploy；
- 只按当前 frozen plan 判断，不继承 earlier approval 或 changes_requested。

## Required review

判断 plan 现在是否足够简单、完备、可执行、可证伪，可成为 DH-010 implementation authority。除完整 P0/P1 扫描外，重点验证：

1. exact model-facing contract 是否已唯一冻结：三个 fixture、两个 Program、world-frame pose、scenario compatibility、string/number/array/plain-data admission、legacy deletion 与 Host/OMP parity；是否仍会让 primitive 或 imported GLB+3DGS 路径丢失；
2. exact 0.5s/16-sample tail contract 是否无内部矛盾，并客观拒绝 hovering、bounce apex、sidewall-only/transient support、duplicate/gapped timestamps；
3. per-sample semantic contact normal、EntityRef owner mapping 与 pair-attributed penetration 是否足够且没有把 MuJoCo identity 泄漏进 Kernel；
4. 16-wall functional cavity、completed closed proxy、task-local composed transform/off-axis yaw probe、closed AdoptPolicy registry 与 headless gate 是否仍闭合；
5. exact numeric tolerances 是否在当前 30Hz deterministic Runtime 下可实现，是否错误耦合 Presentation 或扩大成通用平台；
6. Repository/codec/OMP/3DGS/Spark/transport/lifecycle regressions 与 scope/non-goals 是否存在新的 P0/P1。

## Output contract

- 中文为主体，精确 English token 保留；
- 包含 Reviewer、Digest verification、Findings（P0/P1/P2）、Counterexamples checked（至少 5）、Verdict、`may_enter_implementation: yes|no`；
- `approved` 仅在无 P0/P1 时；至少一个可执行 P0/P1 就 `changes_requested`；authority 内缺事实才 `blocked`；
- 不输出 private chain-of-thought，只给可复核证据与简要推理。
