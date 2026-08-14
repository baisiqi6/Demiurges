# DH-014 Plan Review Request — Round 2

## Freshness and role

你是全新 independent plan reviewer。严格只读、fresh、bounded。不得读取 `plan-review-round1.md`、Round 1 request、任何 reviewer 输出或 `/tmp/dh014-plan-review-omp-*`；不得修改文件、安装依赖、运行 build/provider/browser 或执行 Git mutation。

## Frozen identity

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-014`
- branch：`agent/codex/DH-014`
- HEAD / base：`c655c544bb88010f42e0dd9e570f7f04923d9b6e`
- plan SHA-256：`f9b93f7638160a3a5f6d968acaeb78f319b66109dadcf9c18df35f6a38f7d523`
- ordered 16-file aggregate：`719d1c02465287173e9eb27db258f0443c988e1481ce02d6154f56a754a35bd2`

Manifest 与算法：按以下顺序执行完整 `sha256sum <paths> | sha256sum`，起止必须一致：

1. `docs/project-harness/tasks/DH-014/plan.md`
2. `docs/project-harness/scope.md`
3. `docs/project-harness/architecture.md`
4. `docs/project-harness/domain-model.md`
5. `docs/project-harness/observer-embodiment.md`
6. `docs/project-harness/progress.md`
7. `docs/project-harness/harness-checklist.json`
8. `docs/project-harness/current/task_plan.md`
9. `apps/studio/src/presentation-three/ThreeViewport.tsx`
10. `apps/studio/src/presentation-three/registered-presentation.ts`
11. `apps/studio/src/presentation-three/entity-presentation.ts`
12. `apps/studio/src/presentation-model.ts`
13. `apps/studio/src/App.tsx`
14. `apps/studio/src/styles.css`
15. `package.json`
16. `bun.lock`

## Objective

独立判断 plan 是否足够简单、闭合、可实施与可验收，尤其复核：

1. `authored-unverified` / `authored-fallback` exact mapping、UI provenance、registry drift/throw/entry-out-of-bounds 是否 fail-safe 且不建立第二 world truth；
2. calibration entity-local bounds 的 world transform、digest-verified loaded GLB bounds、primitive/collision/fallback provenance 是否可信且 finite；
3. Overview aspect-aware fit、degenerate/invalid bounds、resize、near/far/fog/Orbit envelope 是否保证完整 registered world 可见；
4. Inspect-only click-without-drag selection 与 Explore drag-look 是否互斥；
5. Explore `OrbitControls` disable、return target sync、pointer capture、defensive pointer-lock exit、listener dispose 是否闭合；
6. editable/interactive input ownership 和 blur/hidden/mode/pointercancel/lostcapture/unmount cleanup；
7. single rAF scheduler exact idle predicate 与 instrumentation 是否能证明不永久空转；
8. reduced motion、三 mode reset、fallback matrix、authority invariants 与真实 Chromium acceptance；
9. allowed file scope 是否足够且无需修改 `packages/world/**` / gateway / provider assets。

可读取 ordered manifest 和它们直接 import 的最小 Studio source/test；不得广搜旧 reviewer docs。Plan gate 不运行产品 tests。

## Verdict contract

中文结构化输出：

```text
decision: approved | changes_requested | blocked
may_implement: yes | no
P0: <count and findings>
P1: <count and findings>
P2: <count and findings>
evidence: ...
start_identity: ...
end_identity: ...
```

只有 P0=0、P1=0、identity 起止一致才可 `approved / may_implement=yes`。不得修改计划或用 reviewer 身份开始实现。
