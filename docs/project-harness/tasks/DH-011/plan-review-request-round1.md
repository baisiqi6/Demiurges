# DH-011 Round 1 独立计划审查请求

## 角色与隔离

你是 fresh independent plan reviewer。只读审查，不修改任何文件，不 commit、push、merge、安装依赖、发送 provider prompt、访问 credential、启动服务或做部署。不得读取另一位 reviewer 的输出、历史 DH-011 verdict（当前不存在）或 `/tmp` 中其他 agent transcript。

审查对象是“是否允许按本计划进入实现”，不是实现结果。不要把计划中尚未实现的能力写成当前事实。

## Frozen identity

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-011`
- branch：`agent/codex/DH-011`
- base/HEAD：`06a2c392bbc2a001d1b31b3cde15b2eb3f9f6cca`
- canonical plan：`docs/project-harness/tasks/DH-011/plan.md`
- 固定顺序十文件 `sha256sum` 文本的二次 SHA-256：`e367d977a46d799d6a252f9bff822f59342e347ebd87412ded3beefa40fb267f`

固定顺序与单文件 SHA-256：

```text
b03d20141e682bbe8120c676ff41504d48b9d825cf2e0cb3d721e8b882b61287  docs/project-harness/tasks/DH-011/plan.md
a335dafd9d996f7bf15346890d3056333f3a9efaec98df3820d69cd5360b20c4  docs/project-harness/scope.md
1701548340dec0dc4b7ed17d884e7418b76377850b4f7dc3d207e1259c510b70  docs/project-harness/architecture.md
b43bce3384171920fdd34175c9644413ab4840a98d4e597e9cf0fe73c7590b3b  docs/project-harness/domain-model.md
8e9d0b211dac419c6e1a7242c4c6b18c376db3440a669469103a2142e1c4ac9c  docs/project-harness/geometry-roadmap.md
1bb5448baa9badc0f33d3fce5b8370eecc461ac171223138a9790c212b7f8a24  packages/world/src/kernel/types.ts
33c19d094f94cf06e6bde104fc702e0a32f13f47b47d4a0fe080610fcf794e23  packages/world/src/world-tools/world-tool-contract.ts
48aae90ed2e1a1183d2940a40ad372a26b70618d2ef11643079126df55a8c97f  packages/world/src/world-tools/world-tool-surface.ts
8caf15938f0dcf6896616dad994b7d04cfa519378dcc0352ae5145098663ed1b  packages/world/src/host/runtime-mvp-host.ts
49b2ddaa76bf8ee70162bc0d64205aa0be3264409c13719abb825f32d12a094b  packages/world/src/product-session-codec.ts
```

请先复算 frozen identity。若任何列出的文件或 HEAD 漂移，停止并输出 `blocked`，不要审查 moving target。

## 已由 Operator 运行的 baseline gates

- `bun test`：`153 pass / 0 fail / 2866 assertions`；
- `bun run typecheck`：PASS；
- `bun run build`：PASS，仅现有 MuJoCo browser-external 与 chunk-size warning；
- `git diff --check`：PASS；
- `.artifacts/harness/harnessctl validate`：PASS，0 warnings。

这些只证明 DH-010.1 baseline 健康，不证明 DH-011 已实现。reviewer 可执行有界、只读的 source search 或小型分析命令，但本轮不要求重复 full build。

## 必须审查的问题

1. `WorldProgram` 从固定 `programId` 演进为 explicit `free-fall | actuator-sequence` plain data，是否是当前第二个真实 program consumer 所需的最小泛化？是否仍在用 catalog disguise，或反过来设计过度？
2. 一个顶层 `entity:arm` 加 stable link/joint/actuator/sensor/frame refs，是否保持 Kernel 的 Entity authority 与 G4 承诺？是否需要将某些 link 独立为 Entity 才能保证语义，或当前方案已经足够且更简洁？
3. `edit` 的 pose/joint-state discriminated migration 与 `run` 的 explicit Program migration，是否保持 static description / dynamic history 分离，并避免 legacy patch stack？
4. explicit action、Program identity、Episode samples、terminal、Evaluation、codec 与 adopt authority 是否形成可验证证据链？哪些 essential invariants 仍未冻结？
5. 计划是否错误地把 control、trajectory、forward kinematics、sensor evidence 或 target frame authority交给 Agent/Presentation？
6. canonical two-link reach task 是否真正证明 action-conditioned evolution，而不是固定动画或预注册答案？negative controls 是否足够？
7. scope 是否严格排除了 grasp、planner、IK solver、arbitrary importer、robotics SDK、真实设备、world model 与第五工具？
8. 迁移对现有 free-fall、ball-vessel、3DGS/Spark、OMP restricted surface、Product Session/codec 和 cross-engine Evaluation 是否有明确回归门禁？
9. Phase 顺序是否能在每一步得到明确 RED/GREEN evidence；Acceptance 是否客观、可执行且没有不可证伪措辞？

## 判定规则

- `P0`：方向或 authority 根本错误，按计划实现将破坏产品本质或造成不可恢复风险。
- `P1`：进入实现前必须修正的契约缺口、矛盾、不可执行 acceptance、范围蔓延或证据 fail-open。
- `P2`：不会阻止按计划开始实现的局部改进建议。
- 只有 `P0=0` 且 `P1=0` 才能 `decision=approved`、`may_implement=yes`。
- 不要因为命名、风格或未来机会阻断；每个 blocker 必须绑定计划段落或当前 source，并给出最小修订方向。

## 输出格式

```text
decision: approved | changes_requested | blocked
may_implement: yes | no
P0:
P1:
P2:
evidence:
minimal_required_changes:
frozen_identity_end:
```

以中文为主体，保留精确 English identifiers、paths、commands 和 hashes。输出最终 verdict 后停止，不修改 repo。
