# DH-009 Progress

## 2026-08-10 — Planning and authority established

- `DH-008` 已 fast-forward 到 `main` commit `fdbbf680122c06810f58da37d9973d4f0aa2c984` 并推送，local/remote `main` 已回查一致；
- 从该 commit 创建 `agent/codex/DH-009` 与独立 worktree `/Users/Admin/projects/WorkTrees/Demiurges-DH-009`；
- EXharness 已通过正式 `add-item → assign → accept` transition 建立 `DH-009`，ASSIGN `evt-20260811T051708Z-8a7f6a93`、ACCEPT `evt-20260811T051708Z-f5b74ce8`，canonical plan 在实现前锁定 Goal、Non-goals、representation boundary 与九项 Acceptance；
- 当前 authority 不包含 DH-009 commit/push/PR/merge/tag/deploy、真实 provider prompt 或 credential 使用。

## 2026-08-10 — 3DGS Observation / Spark Presentation vertical slice implemented

- Kernel 增加唯一 bounded `GaussianSplatObservationRepresentation`，其 role 固定为 `observation`；它必须绑定登记的 imported GLB visual 与 collision proxy，不能附着到 primitive Entity，也不能替代 Snapshot pose、MuJoCo state 或 Evaluation authority；
- 新增 repo-owned deterministic binary PLY：2,048 splats、115,153 bytes、seed `3540605463`、CC0-1.0、SHA-256 `7654a8ef7282452ea75da7e1b6c1ec1e98dbd5333e32339a1911b827b5add754`。generator 重跑得到完全相同 digest；registry 固定 frame、units、local transform、source/expected/collision bounds 与 0.001 m tolerance；
- Product Session codec 对 observation exact keys、digest、frame、units、uniform scale、unit quaternion、fixture binding 及跨 base/sample/terminal representation closure fail closed；MuJoCo admission 验证 identity，但 MJCF 不含 3DGS asset/path，且有无 observation 的 trajectory 与 landing metrics 完全一致；
- Studio 在既有 Three.js renderer/scene 内接入单一 `SparkRenderer` 与 `SplatMesh`，repo bytes 先经 byte length 与 browser SHA-256 校验；稳定 Entity root 承载 GLB、3DGS 与 collision pick proxy，支持 `mesh / 3dgs / overlay`，不新增 model-facing tool；
- `AlignmentEvidence` 从 Spark 实际 bounds、frame/unit/local transform、collision bounds 和当前 Snapshot/Episode pose计算，递归冻结并显式给出 bounds/translation/angular errors、tolerance 与 PASS/FAIL；它只是 Presentation diagnostic，不能推进 Repository ref；
- cleanup 先停止新 render/sort scheduling，等待 Spark 当前异步 sort 退出后再 dispose，关闭了热更新/session lifecycle 中可复现的 `No target` rejection；新 Session 清除 observation/alignment dataset，late load 不能恢复旧 Entity object；
- 最终 operator gate 为 102 tests / 0 fail / 2,615 assertions，typecheck、production build、`git diff --check`、deterministic PLY 与 harness validation 全部通过；
- 真实 Chromium 已验证：空白 Session 无 observation/alignment；Agent turn 恰好产生四个 world tool events；3DGS `loaded`、alignment `PASS`（bounds error 0.000068 m、pose errors 0）、Evaluation `PASS`；逐帧与播放推进，reset 清空后第二个 Session 可重新加载。无 page error 或非 favicon HTTP/console error；
- 已知非阻断上游 warning：Spark 2.1.0 内部创建 deprecated `THREE.Clock`。当前公开 constructor/type 仍要求 `THREE.Clock`，本 slice 不 vendor patch dependency，也不为消除 warning 降级 Three.js。

## Review gate

- product digest 已冻结为 `e9d9b1eb1a51f04342cc3aff4ab7211714e705021a910117ccd6d75bb54a5053`；复算命令排除 harness/review 文档，但纳入所有 tracked/untracked product bytes；
- 执行两个互不读取对方输出的 fresh independent review；
- reviewer 未批准前不 closeout/mark-done；Human 未另行授权前不 commit 或 push DH-009。

## 2026-08-10 — Round 1 cross-review changes requested

- Sol/Terra 在 frozen digest `e9d9b1eb1a51f04342cc3aff4ab7211714e705021a910117ccd6d75bb54a5053` 上独立给出 `changes_requested`，P0 无；
- P1 覆盖：非单位 pose quaternion 被 AlignmentEvidence 误判 PASS、反向 bounds 被 corner transform 正规化后误判 PASS、diagnostic observation 可被整链搬到错误 EntityRef、`SplatMesh.initialized` rejection 无法 dispose；
- P2 为 observation error dataset 在 loading/reset 后残留；
- Round 1 verdict 已永久留存，当前先做根部 remediation；不会用补丁 flag 掩盖，也不会 closeout/commit/push。

## 2026-08-10 — Round 1 remediation completed

- Product codec 现在对每个 Entity pose quaternion 验证 finite + unit norm，并把 diagnostic observation 明确绑定 `CUBE_REF`；Runtime admission 同样独立执行 target binding；
- AlignmentEvidence 先验证 repo observation descriptor、ordered dense finite bounds 与双方 pose，非法 quaternion/reversed/sparse/non-finite bounds 均产生显式 FAIL/Infinity，不再被 clamp 或 corner enumeration 伪装成 PASS；
- `SplatMesh` 实例提升到 try/catch 共享作用域；任何 initialized/attach 后异常先从 observation root 移除、清掉 record reference 并 dispose，再检查 record active，stale reject 也不会泄漏；
- loading/error/no-observation reset 统一清理 observation error/entity/alignment dataset；Chromium 用 synthetic stale error 验证 blank Session 后四项均为 null，第二 Session 可重新加载；
- remediation gate 为 102 tests / 0 fail / 2,626 assertions，typecheck/build/diff-check、deterministic PLY、harness validation 与 Chromium 全通过；
- 新 product digest `03550f8693a990a20f5a4555c11635831dbf6c1653400590596a2fa3f328939b` 进入 fresh Round 2 focused cross-review。

## 2026-08-10 — Round 2 combined identity alias blocked

- Terra 批准 Round 1 全部 remediation；Sol 发现组合 Ref + representations swap 可让 observation 字符串仍位于 `entity:cube`，但 record 是 static Ground plane；combined verdict 为 `changes_requested`；
- 根因是 Product decoder 没有应用当前 falling-cube Runtime 的 fixed role contract；当前 remediation 将 trust boundary 收敛为精确 floor/cube、static/dynamic、mass/velocity/friction 与 positive geometry，而不是再增加 observation 特例；
- JSON round-trip 的组合 alias regression 已加入；Round 1/2 历史保留，下一步重跑 gates 并冻结 final candidate。

## 2026-08-10 — Fixed-role remediation frozen for Round 3

- Product snapshot decoder 现在与唯一 falling-cube Runtime admission 对齐：精确 floor/cube；static floor 必须 0 mass/velocity；dynamic cube 必须 positive mass；mass/friction non-negative、box extents positive；
- JSON round-trip 的 Ref + representations + samples + events 组合 alias 现在在 authored Snapshot role gate 即 fail closed；合法 primitive/imported producer、Episode terminal 与 Product Session 仍通过；
- final operator gate 为 102 tests / 0 fail / 2,627 assertions，typecheck/build/diff/harness 与 Chromium four-tools/3DGS/alignment/Evaluation 全通过；
- final product digest `79b9050ee69ea8c6869fb51521aa9b128da40d070b6ad27b0e27249fe2aebec5` 进入 Round 3 双审；未 closeout/commit/push。

## 2026-08-10 — Round 3 final cross-review approved

- Sol/Terra 在 digest `79b9050ee69ea8c6869fb51521aa9b128da40d070b6ad27b0e27249fe2aebec5` 上独立批准，P0/P1/P2 均无；
- combined alias 与完整 role matrix 在 Product/Runtime 两侧均 fail closed；合法 primitive/imported producer 继续通过；Round 1 lifecycle/alignment blockers 全部回归关闭；
- DH-009 已满足 reviewer gate，当前停在 Human closeout authority 前；未 closeout/mark-done/commit/push/真实 prompt。

## 2026-08-10 — Human closeout authority granted

- Human 已明确授权 closeout、mark-done、commit 与 push `agent/codex/DH-009`；
- authority 不包含 PR、merge `main`、tag、deploy 或真实 provider prompt；
- closeout 必须继续绑定 final digest `79b9050ee69ea8c6869fb51521aa9b128da40d070b6ad27b0e27249fe2aebec5`、102/0/2,627 与 Round 3 Sol/Terra 双审批准。

## 2026-08-10 — Fresh closeout audit approved

- fresh closeout auditor 对更新后的 packet、checklist、final verdict、digest 与发布 authority 给出 `approved`，P0/P1/P2 无；
- digest before/after 均为 `79b9050ee69ea8c6869fb51521aa9b128da40d070b6ad27b0e27249fe2aebec5`，diff-check 与 checklist validation 通过；
- 可以执行正常 mark-done；禁止 force、main merge、PR、tag、deploy 或真实 prompt。

## 2026-08-10 — Operator close completed

- closeout review event `evt-20260811T064924Z-c2d5a8f6` approved；正常 CLOSE event `evt-20260811T064924Z-55360c81`；
- DH-009 已为 `done/closed`，owner/session 清空，lease 于 `2026-08-11T06:49:24Z` 释放，未使用 force；
- 下一动作仅为 commit 与 push `agent/codex/DH-009`；不 merge main、不建 PR/tag、不 deploy、不发送真实 prompt。
