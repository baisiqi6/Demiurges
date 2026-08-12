# DH-010 Phase 6 Independent Cross-review Evidence

## Authority 与冻结目标

- Human authority：2026-08-11 授权进入 Phase 6 independent cross-review；
- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-010`；
- branch：`agent/codex/DH-010`；
- base / HEAD：`22e288690937834135584d023e4140e26696f761`；
- frozen Phase 1–5 product digest：`5e944de6896b697d30e4c58a1580bb7babae12fe41edf2d3c27dda3ebdb0a750`；
- generator digest：`0b600eded75a33e42cbaa8623b5ed8c8b6428f1c731ef188543bee9565b94693`；
- vessel GLB digest：`856788138ecc53d407827a0e67aa9977237dd914809316f8af992e8ee098cd92`；
- request：`docs/project-harness/tasks/DH-010/phase6-review-request.md`；
- reviewer 全程未获得 commit/push/PR/merge/tag/deploy authority；product source 在审查期间冻结。

## Operator full gate

Phase 6 开始后由 operator 在 frozen target 上重跑：

```text
bun test              139 pass / 0 fail / 2,826 assertions
bun run typecheck     pass
bun run build         pass; Vite large chunk warning only
git diff --check      pass
EXharness validation  pass; 0 warnings
```

上述三个 digest 在 full gate 前后均未漂移。

## Reviewer A — GPT-5.6 Sol Max

- session：`/root/dh010_phase6_fresh_sol_max`；
- requested model / effort：`gpt-5.6-sol / max`；
- fresh read-only，未读取历史 verdict/cross-review；
- 独立复算三个 digest before/after、运行 full/targeted gates；冻结目标未漂移；
- verdict：`changes_requested`；`P0=0, P1=4, P2=2, may_closeout=no`。

### P1-1 — Product codec 接受 same-ID/different-content Evaluation

`packages/world/src/product-session-codec.ts` 只做 Evaluation shape/identity 字段检查，没有闭合 `passed` 与 metrics/Success Contract 的因果关系。把合法 ball-vessel projection 改为 `passed=true`、`supportSamples=0`、`requiredSupportSamples=16`、`maxPenetrationMeters=999` 后，`decodeProductSessionProjection` 仍接受：

```json
{"accepted":true,"passed":true,"support":0,"penetration":999}
```

预期：拒绝不可能由 evaluator 产生的同 ID 内容漂移。

### P1-2 — Product codec 未闭合 canonical physics 与 Ref

对合法 projection 同时修改 world/terminal ball friction 为 `0.123`，codec 接受；canonical fixture 值为 `0.8`。把 `world.ref.name` 与 `lastRun.baseRef.name` 同时改为 `world:attacker`，codec 也接受：

```json
{"accepted":true,"worldFriction":0.123,"terminalFriction":0.123}
{"accepted":true,"worldRef":"world:attacker","baseRef":"world:attacker"}
```

预期：fixture physics 与唯一 `world:current` lexical authority exact closure。

### P1-3 — Host / Repository 接受 duplicate EntityRef Snapshot

把 `createInitialSnapshot()` 的第二个 Entity 改为 `entity:floor` 后，`RuntimeMvpHost.write()` 接受并初始化 Ref：

```json
{"accepted":true,"refs":["entity:floor","entity:floor"]}
```

预期：Snapshot admission 在进入 Repository authority 前拒绝 duplicate EntityRef。

### P1-4 — Studio imported asset registry 可被调用方永久污染

`resolveImportedVisualAsset()` 返回 mutable internal entry。调用方修改第一次返回值的 URL 后，第二次 resolve 返回同一已污染引用：

```json
{"frozen":false,"after":"https://attacker.invalid/poisoned.glb","sameReference":true}
```

预期：registry entry recursively frozen，或 resolver 返回不会污染 registry 的 immutable copy。

### P2

1. Gateway 把 `128 / 6 / 512` input budget 重复硬编码，而不是消费 `WORLD_TOOL_CONTRACT.inputBudget`；当前值一致，暂未形成运行时错误。
2. canonical plan 与 `current/task_plan.md` 状态陈旧；本次证据固化会更新 canonical 状态并重新 sync current pointer/summary。

## Reviewer B — CC Switch Kimi K3 Max

- failed bootstrap session：`f6242444-d042-4bf5-9e0c-62f62b3b2554`，因 Claude `plan` permission 连续拒绝复合 digest pipeline 后被 operator 中断；不作为 verdict；
- final fresh session：`d1df307c-fabb-4671-8e17-490174894582`；
- requested model / effort：Claude Code `claude-opus-4-8 / max`；
- CC Switch current-session proxy evidence：`request_model=claude-opus-4-8`, actual `model=k3`, `status_code=200`；
- fresh read-only source/test review 未发现产品 P0/P1；但因 `plan` permission 拒绝 `bun/shasum/build`，其 necessary gates 只能使用 operator external receipt；
- verdict：`changes_requested / may_closeout=no`，理由是独立执行能力不足，不是产品缺陷；
- reviewer 通过 Bash 越界写入 `~/.claude/plans/dh-010-phase-6-composed-swan.md`；仓库 status 未变。operator 已将该文件移动到废纸篓 `/Users/Admin/.Trash/dh-010-phase-6-composed-swan-20260811T1505.md`，可恢复；raw JSONL 只保留在 `/tmp` provider evidence，不进入产品 Git history。

## Operator reproduction

Operator 在 frozen target 上原样重放 Reviewer A 的四组反例；五个实际输出全部再次显示 `accepted=true` 或 registry mutation 成功。之后 product digest 仍为 frozen value，证明反例没有修改产品文件。

## Combined verdict

```text
P0: 0
P1: 4 executable, operator-reproduced
P2: 2
decision: changes_requested
may_closeout: no
```

Kimi 的静态“未发现产品 P1”不能覆盖 Sol 的 executable counterexamples；任一已复现 P1 都足以关闭 approval gate。DH-010 保持 `doing`，workflow 进入 `changes_requested`。本轮未修复产品代码，未 commit/push/PR/merge/tag/deploy，也未 closeout/mark-done。
