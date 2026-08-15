# DH-016 Plan Review Request — Round 9 Final

## Role

Fresh independent final plan reviewer；只读。本文件是第一且唯一的仓库入口。禁止读取Round1-8 request/verdict、findings/progress、其他reviewer与current review/closeout packets；不得修改、build、install、联网/provider或Git mutation。P0/P1=0才可批准implementation。

## Frozen identity

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch：`agent/codex/DH-016`
- HEAD/base：`0efcef3a531c192410cdabcd62cf736e54404313`
- plan：`361b052daecbbefdddbfa4738a973d063a7b9ffa5ae1ca1e19aca71c708f06c4`
- ordered aggregate：`0dbf0672cc8143a74b17b62405d3ea33e0945e7d874649b31b176466cbe2743b`

Ordered 19 files：`AGENTS.md`，`docs/project-harness/scope.md`，`architecture.md`，`domain-model.md`，`tasks/DH-016/plan.md`，`packages/world/src/kernel/types.ts`，`canonical-json.ts`，`artifacts/marble-hunyuan-registry.ts`，`repository/world-repository.ts`，`host/runtime-mvp-host.ts`，`packages/world/src/index.ts`，`apps/agent-gateway/src/product-session.ts`，`product-session-api.ts`，`provider-asset-api.ts`，`main.ts`，`scripts/verified-cache-file.ts`，`provider-artifact-validation.ts`，`import-dh013-provider-assets.ts`，`package.json`。路径相对worktree root，顺序如上；起终用完整`shasum -a 256` text二次SHA-256复算identity/status。可读直接import/相邻test，不得broad-search harness docs。

Operator probes：kernel lease `{"port":58309,"second":"EADDRINUSE","handshake":"DHLEASE1","exitCode":137,"rebound":true,"attempts":1}`；hard-link no-replace `{"sameInode":true,"nlink":"2","second":"EEXIST","content":"{\"operationId\":\"op:test\"}"}`；均为repo外bounded临时probe并已cleanup。

## Mandatory final closure

1. Bundle Phase A在fixed bounded memory中完成ZIP table/bytes、bundle/Project codec、external-artifact completeness、registry/lineage、全部Artifact digest/format/bounds与目标冲突只读检查；任何失败时Data Root `mkdir/open-for-write/write/link/rename/fsync` count=0。
2. Phase A budgets exact为64 MiB body/total、32 MiB per entry、16 entries、64 KiB central directory、1 MiB per JSON；safe-integer pre-allocation checks且能承载当前三项registry assets。
3. Phase B才取mandatory `OperationSingleFlight`、replay/global admit、创建staging；已验证memory bytes写opened fd后重做identity/digest/format/bounds与fsync，逐Artifact CAS后Project publish。
4. Bundle内逐Artifact exact/absent/stable-conflict/identity-drift复用standalone matrix/common finalizer；中途失败有same-binding terminal result，已publish exact CAS bytes仅safe orphan，Project不可见。
5. legacy `imported-rigid-mesh`、legacy `gaussian-splat`、unknown unbacked external bundle都在Phase A返回`PROJECT_ARTIFACT_UNBACKED`并零Data Root write syscall；Save/Open的同类闭合不回归。
6. Save As project directory只在global admission后atomic non-recursive mkdir + parent fsync；terminal aborted只清理exact-owned empty dir，不递归。
7. `OperationSingleFlight`、global intent、project lock、Artifact no-replace、common terminal finalizer、startup recovery、`import:dh013` deterministic id、root/kernel lease与四Agent tools仍闭合。
8. manifest/repository restore/history、routes/UI/restart/cross-worktree/Chromium/fault tests与DH-017/018隔离仍可bounded实现。

必须给出legacy/unknown bundle零write-syscall、Phase A超预算、Phase B fd二次验证、bundle Artifact conflict、same-binding follower与live/restart replay的反例判定。找到P1后完成必要核验即hard stop。最终中文：`decision / may_implement / P0 / P1 / P2`，精确行号、反例、最小修订与start/end identity；不输出private chain-of-thought。Verdict不授予commit/push/merge/deploy。
