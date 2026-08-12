# DH-010 Vessel Physics / stale-ref — Fresh Independent Cross-Review Evidence

## Frozen target 与 authority

- Human 于 2026-08-11 授权 fresh independent cross-review；
- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-010`；
- branch：`agent/codex/DH-010`；
- HEAD / base：`22e288690937834135584d023e4140e26696f761`；
- reviewed product digest：`85534951b9146283ffbceddec652a0440d0d38a7543ad4828a86eb42b5df1c57`；
- review request：`docs/project-harness/tasks/DH-010/phase6-vessel-physics-stale-ref-review-request.md`；
- 本轮未获得 closeout、`mark-done`、commit、push、PR、merge、tag 或 deploy authority。

两条有效 review path 只读取自包含 request 与 product source/tests，均禁止读取 earlier verdict、cross-review、remediation evidence、harness current/state/progress 或另一 reviewer 输出。审查起止 product digest、HEAD 与 Git status 均未漂移。

## Reviewer A — CC Switch / Kimi K3 Max

- Claude Code session：`674a3912-f0a6-48f2-885b-5deb49c0f0f2`；
- provider transcript：`/tmp/dh010-vessel-stale-review-kimi-k3.jsonl`；
- requested model label：`claude-opus-4-8`，effort=`max`；
- Claude init event 的 request label 仍为 `claude-opus-4-8`；CC Switch 当前 session 的 `proxy_request_logs` 多条成功记录均显示 actual downstream `model=k3`、`status_code=200`。因此本证据按实际模型记录为 Kimi K3，而不沿用 reviewer 自报的 Opus；
- tool surface：`Read/Grep/Glob/Bash`，无 MCP；禁止 Edit/Write/Notebook/Task/Agent/Web/WebSearch；所有临时 probes 写入 `/tmp`。

结果：

```text
bun test            149 pass / 0 fail / 2,857 assertions
bun run typecheck   pass
bun run build       pass; Vite warning only
git diff --check    pass
EXharness validate  pass; 0 warnings
extra probes        42 / 42 assertions pass
verdict             approved
may_closeout        yes
```

Reviewer A 独立确认：

- vessel `friction/bodyType/massKg` drift 在 Repository、Runtime 与 Product codec 三条 seam fail closed，Repository 写入失败 atomic，canonical run 仍合法；
- stale expected edit 返回 `stale_ref` 时 current Ref 不变、`lastRun` 保留且 projection 可 decode；fresh updated edit 清除 evidence，read/new run/write lifecycle 正确；
- registered identity 使用同一 root validator，无第二套 vessel physics constants；duplicate EntityRef、Ref alias、registered representation/physics drift 拒绝；
- forged Evaluation、presentation mutation、closed-proxy、run/adopt 与 exact four-tool regressions均通过。

## Reviewer B — GPT-5.6 Sol Max

- reviewer：`/root/dh010_vessel_stale_fresh_sol_max_r2`；
- requested model：`gpt-5.6-sol`，reasoning=`max`；
- fresh read-only replacement attempt；未读取 Kimi 输出或 earlier reviewer material；
- 第一条 Sol attempt `/root/dh010_vessel_stale_fresh_sol_max` 因完成主要检查后无法在合理时间内输出 final verdict，被 Operator 中止，不计作审查票，也未把其中未落地判断传给 replacement。

结果：

```text
bun test            149 pass / 0 fail
bun run typecheck   pass
bun run build       pass
git diff --check    pass
EXharness validate  pass; 0 warnings
artifact hashes     pass
verdict             approved
may_closeout        yes
end frozen identity pass
```

Reviewer B 独立执行 repo 外 probes，确认：

- vessel `friction/bodyType/massKg` 在 Repository atomic fail、Runtime pre-MJCF fail、codec authored+terminal synchronized drift fail；
- canonical ball-vessel run completed + Evaluation PASS，`run` 不推进 Ref，explicit adopt 才推进；
- duplicate EntityRef 与 non-canonical Ref alias 拒绝；
- bounded scan 未发现 P0/P1；终点 HEAD/product digest/status/hash 与起点一致。

## Deterministic artifact identity

两路均验证：

```text
generator SHA-256  0b600eded75a33e42cbaa8623b5ed8c8b6428f1c731ef188543bee9565b94693
vessel GLB SHA-256 856788138ecc53d407827a0e67aa9977237dd914809316f8af992e8ee098cd92
```

## Combined verdict

两条有效、互相隔离的 review path 对同一 frozen product digest 一致给出：

```text
P0: 0
P1: 0
decision: approved
may_closeout: yes
```

该结论只打开 DH-010 的 closeout gate，不自行授予 closeout、`mark-done`、commit、push 或 merge authority。下一步须由 Human 另行授权 closeout 与 Git mutation。
