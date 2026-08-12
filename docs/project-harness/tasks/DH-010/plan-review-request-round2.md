# DH-010 Plan-only Independent Cross-review Request — Round 2

## Review identity

- Item：`DH-010`；
- Review type：canonical design/acceptance plan remediation fresh review，只读、实现前审查；
- Worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-010`；
- Branch：`agent/codex/DH-010`；
- Base/HEAD：`22e288690937834135584d023e4140e26696f761`；
- Canonical plan：`docs/project-harness/tasks/DH-010/plan.md`；
- Plan SHA-256：`017b24a2e235a18026282e268c1b20c0971952fe8ee4ab230b06ed2e017496a9`；
- Context manifest aggregate SHA-256：`ddf75a6253ac841d44f2d1a2779c435e28f537bf057610b88b511e613bf698d8`。

若 reviewer 独立重算不匹配，输出 `blocked`，不要继续审查移动目标。

Context aggregate 按以下文件、以下顺序的 `shasum -a 256` 行再次 SHA-256 得到：

1. `docs/project-harness/tasks/DH-010/plan.md`
2. `docs/project-harness/scope.md`
3. `docs/project-harness/architecture.md`
4. `docs/project-harness/domain-model.md`
5. `docs/project-harness/geometry-roadmap.md`
6. `docs/project-harness/technical-foundation.md`
7. `docs/project-harness/harness-checklist.json`

## Reviewer independence and authority

角色：fresh independent plan reviewer。

- 不读取 `plan-review-verdict-*-round1.md` 或 `plan-cross-review-verdict-round1.md`；
- 只读 canonical plan、上述 context、`AGENTS.md` 与必要 current source/tests；
- 可运行 `git status/diff`、`rg/sed/shasum`、JSON/checklist validation 等只读命令；
- 禁止修改文件、build/install、Git mutation、联网/provider/credential/deploy；
- 不根据 Round 1 预期答案调整 verdict。

## Round 2 focus

重新判断当前 plan 能否作为 implementation authority，并特别验证 remediation 是否真正关闭以下失败面，而非增加文字补丁：

1. `settleWindowSeconds + support + inner-floor distance` 是否同时拒绝 hover、bounce apex 与非支撑低速状态；
2. wall-sensitive trajectory、exact `base + N walls` 与 completed closed-proxy run 是否足以证明侧壁被编译并参与物理；
3. entity-local `partKey`、internal geom owner map、public EntityRef-pair contact 与 penetration evidence 是否闭合，且不会把 MuJoCo identity 写进 Kernel；
4. task-local fixture 与 `worldPose = entityPose ∘ localPose` 是否能在 translated/yaw-rotated probes 中证明 visual/collision/rim/inner-envelope 对齐，同时避免通用 frame graph；
5. closed AdoptPolicy registry 是否保持 DH-003 lexical closure，避免从 Agent/Evaluation/Presentation 选择 policy，并让两个合法 scenario 可 adopt；
6. headless gate 是否足以控制 slice 宽度，Studio 是否仍是 bounded second phase；
7. exact model-facing contract、Product codec、OMP four-tool surface、Repository identity/ref/adopt、3DGS/Spark lifecycle 与 transport regression 是否仍有遗漏的 P0/P1；
8. 是否出现新的过度泛化、互相矛盾、不可实现或不可客观验收的要求。

## Severity and required output

- `P0`：authority/方向根本错误；
- `P1`：会导致错误实现、假阳性、重大回归或范围失控，必须再修；
- `P2`：非阻断；
- verdict：`approved | changes_requested | blocked`；
- 必须包含 Reviewer、Digest verification、Findings、Counterexamples checked（至少 5 个）、Verdict、`may_enter_implementation: yes|no`；
- 中文为主体，保留精确 English tokens；不给 private chain-of-thought，只给可复核证据与简要推理。
