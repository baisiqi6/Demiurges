# DH-014 Progress

## 2026-08-14 — Bootstrap 与设计接管

- 已只读确认 main 为 `c655c544bb88010f42e0dd9e570f7f04923d9b6e`，DH-013 `done / closed / approved`，current item 为空；GitHub `main` read-back 同一 SHA；
- main 原有 4 份 doc-only changes 已按 SHA-256 原样复制到独立 worktree `/Users/Admin/projects/WorkTrees/Demiurges-DH-014`；main 仍保留相同 dirty changes，没有 stash/reset/checkout 覆盖；
- 已审计现有 ThreeViewport：单一按需 rAF、OrbitControls、Spark dirty、selection 与 asset lifecycle 是本切片必须复用的真实 seam；
- 当前处于 plan gate；未修改产品代码、未安装新 dependency、未调用 provider、未 commit/push/merge/tag/deploy。

## 2026-08-14 — Plan gate 与实现

- Round 1 两路 reviewer 均为 `changes_requested`；修订 selection ownership、truth/provenance、trusted bounds、Overview frustum、input lifecycle 与 idle rAF 后，Round 2 的 Sol Max 和 OMP DeepSeek V4 Pro Max 均给出 `approved / P0=0 / P1=0`；
- 新增 Presentation-only `observer-camera.ts` 与组合式 `CameraRig`：三 mode 独立 reset、Z-up Fly、短点按 nudge、Shift、wheel speed、mouse look、finite fit/fallback、reduced motion 与按需连续帧；
- `registered-presentation.ts` 登记 Marble entry pose，exact truth 为 `authored-unverified`，provenance 可见且不进入 Snapshot/Product Projection；registry drift、越界或 invalid bounds 退回 `authored-fallback`；
- `ThreeViewport` 接入 Overview / Inspect / Explore、Inspect-only click-without-drag selection、F/double-click focus、input ownership、blur/hidden/mode/pointer cleanup、single-rAF counter 与 camera/authority acceptance datasets；
- Presentation debug layers 扩展为 Mesh / 3DGS / Grid / Bounds / Collision / Alignment；Explore 只覆盖 collision 的 effective visibility，不改写用户 toggle preference；
- 使用 DH-013 ignored cache 的只读 symlink 完成 Chromium acceptance；没有下载、生成、修改或重新调用 provider。
# 2026-08-14 — Implementation review Round 1 remediation

- Sol Max found three executable P1s: zero-net-input rAF continuation, partial Marble registry admission, and resolver throws outside loader error boundaries.
- DeepSeek V4 Pro Max independently observed the zero-net-input behavior but graded it P2; cross-review adopted the stricter performance acceptance and remained `changes_requested`.
- Remediated all three at the Presentation layer and added deterministic regressions.
- Post-remediation gates: focused 27/27, full 484/484 (3500 assertions), typecheck/build/diff-check/EXharness pass; Chromium Shift-held probe shows no continuous rAF.
# 2026-08-14 — Implementation review Round 2 remediation

- Sol Max found four executable P1s: event-nudge cancellation drift, loose witness/entity binding, sparse Vec3 admission, and non-visible resolver errors/App inspector throw.
- DeepSeek approved but documented the first two semantic gaps as P2; the combined gate again adopted the stricter executable contract.
- Removed event-level movement, froze exact representation tuples and ownership, made Vec3 dense, and added visible fail-closed Presentation errors.
- Post-remediation gates: focused 29/29 (139 assertions), full 486/486 (3519 assertions), typecheck/build/diff-check/EXharness pass.
# 2026-08-14 — Implementation review Round 3 remediation

- Sol Max found three executable P1s: input-triggered transition snap, wrong-slot registered extras, and degenerate registered provenance.
- DeepSeek approved the same frozen version; combined review retained the stricter executable failures.
- Separated input from transition progress, scanned runtime registered values independent of declared slot types, and split strict bounds admission from point transforms.
- Focused remediation suite: 31/31, 148 assertions; typecheck and global diff-check pass.
# 2026-08-14 — Implementation review Round 4 approved

- Sol Max final verdict: approved, P0/P1/P2=0.
- The first DeepSeek session found no P0/P1 but blocked on reviewer-owned Chromium timeouts; it was not counted as approval.
- A fresh source-and-evidence DeepSeek replacement completed all bounded gates and approved with P0/P1=0, P2=3.
- Combined implementation gate is approved for product aggregate `bf66aa8d6e9ac20ad0b465d9267109487c1cdf01264c4c0e1c9e327174f6664e`.
- No commit, push, merge, tag, deploy, provider generation, or world/gateway authority change has been performed.
