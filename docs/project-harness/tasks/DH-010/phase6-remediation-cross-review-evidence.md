# DH-010 Phase 6 Remediation — Independent Cross-review Evidence

## Frozen target 与 authority

- Human authority：2026-08-11 授权 fresh independent cross-review；
- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-010`；
- branch：`agent/codex/DH-010`；
- base / HEAD：`22e288690937834135584d023e4140e26696f761`；
- reviewed product digest：`8687ad0dea2c675d8d04a61ebcacf4649bc41989d33d6163a3b5680619cacc6e`；
- request：`docs/project-harness/tasks/DH-010/phase6-remediation-review-request.md`；
- reviewers 未获得修改、commit、push、closeout 或 `mark-done` authority。

两条 review path 互相隔离，均禁止读取 earlier verdict/cross-review/remediation evidence、progress 与另一 reviewer 输出。审查前后 product digest 与 `git status --short` 文本 SHA-256 `485d76a6c3f5b85f0e74e368bd0b6ff852c623737146a6f71b520d3a9af053fe` 均未漂移。

## Reviewer A — GPT-5.6 Sol Max

- session：`/root/dh010_remediation_review_sol_max`；
- requested model / effort：`gpt-5.6-sol / max`；
- observed provider mapping：当前 subagent runtime 未提供独立 introspection，不把 requested model 冒充 observed model；
- full gate：`142 pass / 0 fail / 2,834 assertions`，typecheck/build/diff、EXharness 0 warnings、generator byte-identical 全通过；
- 原四类 remediation mandatory probe 全部通过；
- verdict：`changes_requested`，`P0=0, P1=1, P2=0, may_closeout=no`。

### P1 — Registered representation 可同步漂移

`packages/world/src/product-session-codec.ts` 已对 physics 做 canonical registry exact closure，但以下 representation 仍只做 generic shape validation：

- falling-rigid floor/cube box visual/collision；
- ball-vessel floor box visual/collision；
- ball sphere visual color。

同时修改 authored world 与 terminal Snapshot 后，`requireEpisodeEvidenceChain` 只能证明二者互相一致，不能证明它们与 registered fixture 一致；stable-inside-vessel evaluator 又不消费 floor representation，因此原 Evaluation ID/metrics/PASS 可以继续成立。

Reviewer 反例：把 ball-vessel authored 与 terminal floor visual/collision `halfExtents` 同时改为 `[30,30,0.5]`，decoder 仍接受；ball color 与 falling-rigid floor horizontal extent 同步漂移同样可接受。

Expected：registered fixture 的 visual/collision/semantic/physics 各自 exact closure，只允许合法 state/pose 演进。Actual：transport 可声明与受信 Runtime 输入不同的几何世界，同时携带原 PASS Evaluation。

## Reviewer B — CC Switch Kimi K3 Max

- failed bootstrap session：`b7f8c4aa-0e5d-4df4-a215-d1ea04583010`，`plan` permission 拒绝只读 `shasum` 后由 operator 中止，不作为 verdict；中止前后 product/status digest 未漂移；
- final fresh session：`8fb42db6-1bf6-4b07-94bb-68c13cd40785`；
- requested model / effort：Claude Code `claude-opus-4-8 / max`；
- operator 通过 current-session CC Switch proxy record 核验：`request_model=claude-opus-4-8`, actual `model=k3`, `status_code=200`；provider-native assistant events 也标记 `model=k3`；
- full gate：`142 pass / 0 fail / 2,834 assertions`，typecheck/build/diff、EXharness 0 warnings 全通过；
- 原四类 remediation mandatory probe 全部通过；
- verdict：`approved`，`P0=0, P1=0, P2=1, may_closeout=yes`。

Kimi 的 P2：孤立 `world_read` evidence 只绑定 `ref.name`、`snapshotId` 与 version shape，没有把 `ref.version` 与受信来源 cross-check；伪造 `version=999` 可被单 event decoder 接受。真实 `WorldToolSurface.edit` 仍返回 `stale_ref` 且 projection 中 `world.ref.version` 与 run `baseRef.version` 会交叉验证，因此 reviewer 定为无 authority mutation 的 P2。

Kimi 没有执行 Sol 的 authored+terminal floor extent 同步漂移变体，因此其 approval 不能反证该 P1。

## Operator reproduction

Operator 在 reviewer 均结束后独立重放 Sol 反例：

```json
{"accepted":true,"visualHalfExtents":[30,30,0.5],"evaluationPassed":true}
```

重放后 product digest 仍为 `8687ad0dea2c675d8d04a61ebcacf4649bc41989d33d6163a3b5680619cacc6e`，Git status 文本 digest 仍为 `485d76a6c3f5b85f0e74e368bd0b6ff852c623737146a6f71b520d3a9af053fe`。

## Combined verdict

```text
P0: 0
P1: 1 executable, operator-reproduced
P2: 1
decision: changes_requested
may_closeout: no
```

交叉审查不以多数票决定；一个已复现 P1 足以关闭 approval gate。历史 remediation candidate 与两份 reviewer 结论都保留，DH-010 继续 `doing/running`。下一步需要 Human 另行授权 bounded canonical representation remediation；未 commit/push/PR/merge/tag/deploy/closeout/mark-done。
