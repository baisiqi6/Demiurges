# DH-010 Phase 6 Canonical Representation Remediation — Independent Cross-review Evidence

## Frozen target 与 authority

- Human authority：2026-08-11 授权 fresh independent cross-review；
- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-010`；
- branch：`agent/codex/DH-010`；
- base / HEAD：`22e288690937834135584d023e4140e26696f761`；
- reviewed product digest：`88a5d1e787df9cc5b73ae5fb117bc079c64665f5976e4b8795b5b22d2e863150`；
- request：`docs/project-harness/tasks/DH-010/phase6-representation-remediation-review-request.md`；
- reviewers 未获得修改、commit、push、closeout 或 `mark-done` authority。

两条有效 review path 互相隔离，均禁止读取 earlier verdict/cross-review/evidence、progress 与另一 reviewer 输出。起止 product digest 与 Git product status 均未漂移。

## Invalid attempts（不计入 verdict）

- Sol attempt 1 在用带上下文的 `rg` 提取 checklist acceptance 时意外看到同一节点的旧 `review.summary`，立即 fail closed，未运行 gates 或形成产品 verdict；
- CC Switch attempt 1 使用 `permission-mode=plan`，required Bash gates 被反复拒绝并停止推进，未形成 verdict；
- CC Switch attempt 2 用 Python 提取 checklist acceptance 时打印了整个 DH-010 节点，旧 review metadata 泄漏，operator 立即中止；
- 最终两条有效 path 使用自包含 acceptance，并完全禁止读取 checklist/state/progress/events。失败 attempt append-only 记录，但不参与结论。

## Reviewer A — GPT-5.6 Sol Max Round 2

- session：`/root/dh010_representation_fresh_review_sol_r2`；
- requested model / effort：`gpt-5.6-sol / max`；
- observed model：subagent runtime 未提供可独立核验的 provider/model introspection；
- full gate：`145 pass / 0 fail`，typecheck/build/diff、EXharness 0 warnings、artifact digest 全通过；
- representation、Evaluation/physics/Ref、duplicate EntityRef atomicity、Presentation immutability、open/closed vessel mandatory probes 全部通过；
- verdict：`changes_requested`，`P0=0, P1=1, P2=0, may_closeout=no`。

### P1 — 合法后续 edit 保留 stale `lastRun`，使 Product projection 自相矛盾

位置：

- `apps/agent-gateway/src/product-session.ts:232`；
- `packages/world/src/product-session-codec.ts:845`；
- `apps/studio/src/product-session-client.ts:355`。

可执行序列：

1. Turn 1：`world_write → world_read → world_edit(z=2.8) → world_run`；
2. Turn 2：`world_read → world_edit(z=3.2)`，不产生新 Episode；
3. current world 前进到 `snapshot:edit-2 / version=3`，但 `lastRun.baseRef` 仍是 `snapshot:edit-1 / version=2`；
4. final projection 被 codec 以 `projection.lastRun base ref 证据链非法` 拒绝。

Expected：成功修改 authored world 后，旧 `lastRun` 应清除/失效，或 projection contract 明确支持 historical run。Actual：`#world` 更新而 `#lastRun` 保留，完全合法的多轮 four-tool workflow 使 Studio 无法解码 session。

## Reviewer B — CC Switch Kimi K3 Max Round 3

- Claude Code session：`9c3e83d5-3421-448e-8f61-6d2ba60d9be1`；
- requested model / effort：`claude-opus-4-8 / max`；
- provider-native assistant events 与 current-session CC Switch proxy 均确认实际 `model=k3`；proxy record 为 `request_model=claude-opus-4-8, model=k3, status_code=200`；
- full gate：`145 pass / 0 fail / 2,837 assertions`，typecheck/build/diff、EXharness 0 warnings、artifact digest 全通过；
- codec transport drift、合法 edit/run/decode、diagnostic imported representation、Evaluation/Ref/identity/immutability、closed proxy 等 mandatory probes 通过；
- verdict：`changes_requested`，`P0=1, P1=0, may_closeout=no`。

### P0 — Canonical representation closure 只在 Product codec，未进入 World authority 根部

位置：

- `packages/world/src/repository/world-repository.ts:51-77`；
- `packages/world/src/artifacts/ball-vessel-fixture.ts:461-496`；
- `packages/world/src/runtime-mujoco/run-falling-cube.ts:224-289`。

`WorldRepository.#insert()` 只执行 generic representation integrity；`requireBallVesselSnapshot()` 没有闭合 floor visual/collision extent 与 ball visual color；Runtime 又以该 validator 接受 authored Snapshot。

执行反例把 ball-vessel floor collision `halfExtents` 从 canonical `[3.2,3.2,0.05]` 漂移到 `[9.9,9.9,0.05]`：

```text
repository.write                 accepted
runFallingCube                   completed
evaluateEpisode                 passed=true
recordEpisode/recordEvaluation  accepted
repository.adopt                status=updated, version=2
```

falling-rigid floor extent 在 `write + Runtime` 路径也被接受；ball visual color 同样可漂移。Product codec 会拒绝相同 transport carrier，但底层 Repository/Runtime/Evaluation/Adopt authority 已经能够持有并推进非 registered world。

Reviewer 将其定为 P0，因为 canonical Ref 可由 in-process authority chain 实际推进；restricted OMP 四工具当前不能直接构造任意 Snapshot，是影响面的缓解事实，不足以关闭 authority acceptance。即使按较低 P1 解释，该 executable authority mutation 仍然阻断 closeout。

## Operator reproduction

Operator 在 reviewer 完成/报告后分别重放两个反例。

Stale `lastRun`：

```json
{"accepted":false,"current":{"name":"world:current","snapshotId":"snapshot:edit-2","version":3},"retainedBase":{"name":"world:current","snapshotId":"snapshot:edit-1","version":2},"error":"projection.lastRun base ref 证据链非法"}
```

Root authority representation drift：

```text
FAIL-OPEN(write admitted drifted floor snapshot)
evaluation.passed=true
FAIL-OPEN(adopt succeeded on floor-drifted world): status=updated, newVersion=2
```

重放后 product digest 仍为 `88a5d1e787df9cc5b73ae5fb117bc079c64665f5976e4b8795b5b22d2e863150`，Git status 未漂移。

## Combined verdict

```text
P0: 1 executable, operator-reproduced
P1: 1 executable, operator-reproduced
decision: changes_requested
may_closeout: no
```

交叉审查不以多数票决定；任一已复现 blocker 都足以关闭 approval gate。DH-010 保持 `doing/running`。下一步需要 Human 另行授权 bounded root-authority + stale-lastRun remediation；未修改产品代码，未 commit/push/PR/merge/tag/deploy/closeout/mark-done。
