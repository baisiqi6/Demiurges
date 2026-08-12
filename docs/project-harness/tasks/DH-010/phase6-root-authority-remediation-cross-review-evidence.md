# DH-010 Root Authority / stale `lastRun` — Fresh Cross-review Evidence

## Frozen target 与 authority

- Human 于 2026-08-11 授权 fresh independent cross-review；
- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-010`；
- branch：`agent/codex/DH-010`；
- base / HEAD：`22e288690937834135584d023e4140e26696f761`；
- reviewed product digest：`8be5fadc4393a69b70ffeaef602368e9d9fa4cf8e91a1cf0ab482d918c06b9a8`；
- request：`docs/project-harness/tasks/DH-010/phase6-root-authority-remediation-review-request.md`；
- reviewers 未获得修改、commit、push、closeout 或 `mark-done` authority。

两条 path 均使用只读 product inspection/probes。起止 product digest 与 Git product status 未漂移。

## Reviewer A — GPT-5.6 Sol Max

- session：`/root/dh010_root_remediation_fresh_sol_max`；
- requested / routed model：`gpt-5.6-sol / max`；运行环境无第二独立 model introspection；
- full gate：`149 pass / 0 fail`，typecheck/build、EXharness 0 warnings、artifact digest 通过；
- product-only diff-check 通过；由 `harnessctl review` 生成的 `current/review-packet.md` 末尾多一个空行，使全 repo `git diff --check` 当时失败；operator 在 review 结束后只修正该 harness artifact；
- verdict：`changes_requested`，`P0=1, P1=2, P2=0, may_closeout=no`。其中一个 P1 是上述 harness whitespace gate；当前仍有 1 个产品 P0 与 1 个产品 P1。

### P0 — vessel physics 未纳入 registered Snapshot identity

位置：

- `packages/world/src/artifacts/ball-vessel-fixture.ts:429`；
- `packages/world/src/artifacts/ball-vessel-fixture.ts:531`；
- `packages/world/src/runtime-mujoco/run-falling-cube.ts:459`；
- `packages/world/src/product-session-codec.ts:481`。

`requireRegisteredVessel()` 闭合 visual、compound collision 与 semantic，却没有闭合 static vessel 的 `physics.bodyType/massKg/friction`。将 canonical vessel friction 从 `0.8` 改为 `0.01` 后：

```text
RuntimeMvpHost.write            accepted; world:current@1
createFallingCubeMjcf           accepted; MJCF consumes friction=0.01
Product codec synchronized drift accepted（reviewer probe）
```

Expected：registered vessel physics 任一漂移必须在 Ref 初始化、MJCF compile 与 transport admission 前 fail closed。Actual：漂移进入 canonical authority 并改变实际物理执行语义。

### P1 — `stale_ref` no-op edit 错误清除有效 `lastRun`

位置：

- `apps/agent-gateway/src/product-session.ts:232`；
- `apps/agent-gateway/src/product-session.ts:236`。

`#observeTool()` 只要看到 succeeded `world_edit` trace 就无条件清除 `lastRun`，没有检查 `WorldEditResult.update.status`。但 stale CAS 被工具正常表示为 `update.status="stale_ref"`，不会推进 current Ref。

```text
before current   snapshot:edit-1@v2
before lastRun   present
stale edit       update.status=stale_ref
after current    snapshot:edit-1@v2 (unchanged)
after lastRun    null
```

Expected：只有 `updated` 的 authored mutation 才失效旧 run evidence；`stale_ref` no-op 应保留仍与 current world 一致的 `lastRun`。Actual：未发生 authority 变化也删除有效 evidence。

## Reviewer B — CC Switch Kimi K3 Max

- Claude Code session：`c7d1ba43-cf5a-42e3-a2f4-711ce8586bfb`；
- requested model：`claude-opus-4-8 / effort max`；
- provider-native init 仅显示 request label `claude-opus-4-8`；current-session CC Switch proxy records 明确显示 `request_model=claude-opus-4-8, model=k3, status_code=200`，因此 observed downstream model 为 `k3`；
- full gate：`149 pass / 0 fail / 2,849 assertions`，typecheck/build、EXharness、artifact digest 通过；六组 requested mandatory probes 被其判定通过，verdict 为 `approved / may_closeout=yes`；
- reviewer 自报其 Grep 输出曾顺带暴露一个禁止历史 artifact 的路径与单行文本。因此按本 request 的 strict fresh-isolation 规则，该 approval 不作为独立关单票；即使将其计入，cross-review 也不以多数票覆盖 Reviewer A 的 executable P0/P1。

## Operator reproduction

Operator 在 reviewer 报告之后、未修改产品代码的前提下独立重放两个产品反例。

```json
{
  "vesselFriction": {
    "authorityResult": {
      "accepted": true,
      "ref": {
        "name": "world:current",
        "snapshotId": "snapshot:operator-vessel-friction-drift",
        "version": 1
      }
    },
    "runtimeResult": {
      "accepted": true,
      "consumesDrift": true
    }
  },
  "staleRef": {
    "updateStatus": "stale_ref",
    "beforeRef": {
      "snapshotId": "snapshot:edit-1",
      "version": 2
    },
    "afterRef": {
      "snapshotId": "snapshot:edit-1",
      "version": 2
    },
    "beforeHadLastRun": true,
    "afterHadLastRun": false
  }
}
```

重放使用 repo 外 `/tmp/dh010-operator-repro.ts`，不产生 product mutation。review 后 product digest 仍为 `8be5fadc4393a69b70ffeaef602368e9d9fa4cf8e91a1cf0ab482d918c06b9a8`。

## Combined verdict

```text
product P0: 1 executable, operator-reproduced
product P1: 1 executable, operator-reproduced
decision: changes_requested
may_closeout: no
```

Reviewer A 的 blocker 已足以关闭 approval gate；Reviewer B 的相反结论不覆盖可执行反例。DH-010 保持 `doing / changes_requested`。下一步需要 Human 另行授权 bounded vessel-physics identity + stale-ref lifecycle remediation；未修改产品代码，未 commit/push/PR/merge/tag/deploy/closeout/mark-done。
