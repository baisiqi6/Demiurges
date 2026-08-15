# DH-016 Plan Review Request — Round 1

## Role and decision gate

你是fresh independent plan reviewer。只读审查，不实现、不修改、不build/test/install、不联网、不调用provider，不做Git mutation。

最终必须输出唯一结构化结论：

```text
decision: approved | changes_requested | blocked
may_implement: yes | no
P0: <count>
P1: <count>
P2: <count>
```

只有P0=0且P1=0才可`approved / may_implement=yes`。P1必须是当前plan将导致authority破坏、数据丢失/污染、安全边界失败、不可执行验收或必须越权实现的问题；不要把未来优化升格。

## Frozen identity

- cwd: `/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- branch: `agent/codex/DH-016`
- HEAD/base: `0efcef3a531c192410cdabcd62cf736e54404313`
- plan SHA-256: `368d35a01267e24323138c6fc06bf55f514db75ac03c7732def012f7b5d3a05e`
- ordered 19-file aggregate: `c0ac69449fdf4be2c0d6457650eee6cad66a73c62453b48e98cfc110383c95c1`

按下列顺序复算完整`shasum -a 256`文本，再对该文本做一次SHA-256：

1. `AGENTS.md`
2. `docs/project-harness/scope.md`
3. `docs/project-harness/architecture.md`
4. `docs/project-harness/domain-model.md`
5. `docs/project-harness/tasks/DH-016/plan.md`
6. `packages/world/src/kernel/types.ts`
7. `packages/world/src/kernel/canonical-json.ts`
8. `packages/world/src/artifacts/marble-hunyuan-registry.ts`
9. `packages/world/src/repository/world-repository.ts`
10. `packages/world/src/host/runtime-mvp-host.ts`
11. `packages/world/src/index.ts`
12. `apps/agent-gateway/src/product-session.ts`
13. `apps/agent-gateway/src/product-session-api.ts`
14. `apps/agent-gateway/src/provider-asset-api.ts`
15. `apps/agent-gateway/src/main.ts`
16. `scripts/verified-cache-file.ts`
17. `scripts/provider-artifact-validation.ts`
18. `scripts/import-dh013-provider-assets.ts`
19. `package.json`

## Allowed reads

- 本request、canonical plan与上述19文件；
- 只在验证某个具体plan claim时读取它们的直接import或相邻现有test；
- Git branch/HEAD/status/diff只读metadata。

禁止读取：本任务findings/progress、其他review request/verdict、`docs/project-harness/current/review-packet.md`、future closeout packet、其他reviewer输出。不得broad-search整个harness docs。

## Mandatory review questions

1. Data Root是否真正消除worktree-local第二事实面，路径/symlink/权限与同filesystem atomicity是否可实现且没有隐式fallback？
2. manifest v1是否足以exact恢复Snapshot lineage、current Ref、artifact/Frame/Units/calibration identity；是否不必要复制authority或形成self-referential digest？
3. Repository restore/export与linear undo/redo能否保持Snapshot immutable、Ref version、edit sequence、runtime-terminal与四工具边界？
4. save的lock/staging/fsync/rename/CAS顺序是否在所有kill point保留旧完整revision；stale lock策略是否安全且产品可接受？
5. Open是否在publish新session前完成全部candidate验证，失败时是否能做到现有session/recent/capacity零副作用？
6. store-only deterministic ZIP规则是否足够闭合zip-slip、symlink、duplicate、compression bomb、ZIP64、CRC/digest与partial import；是否有更简单但同样满足“单文件可搬运”的方案？
7. routes与Studio行为是否能实际完成new/save/save-as/open recent/export/import/undo/redo，同时不把filesystem或Presentation状态变成world authority？
8. scope是否仍是一个可落地slice，而不是通用storage SDK、数据库或DH-017/018的越界实现？
9. acceptance是否包含真实cross-worktree/process restart、fault injection、empty-root import、corrupt asset与Chromium闭环，而且全部可bounded执行/清理？
10. 找出plan自身矛盾、当前source无法承接的调用顺序、缺失stable outcome或可能迫使实现者打补丁的根层问题。

## Hard stop and output

- 发现P1后仍完成与该P1直接相关的必要核验，然后停止扩展。
- 起点与终点复算branch/HEAD/plan/aggregate/status；任何漂移报告`blocked`。
- 输出中文为主体，列出精确plan/source行号、可执行/可构造反例、最小修订建议；不要给私有chain-of-thought。
- Reviewer verdict不授予implementation、commit、push、merge或deploy authority。
