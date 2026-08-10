# DH-001 Reviewer Verdict — GPT-5.6 Sol Max

## Reviewer metadata

- Decision：`changes_requested`
- Model：`gpt-5.6-sol`
- Reasoning effort：`max`
- Reviewer：`/root/dh001_review_sol`
- Observed session：`019fe759-f8e5-7380-a243-d5b577af19ca`
- Authority：strict read-only；未修改 product artifact

## P0

无。

## P1

1. Repository 对同一 Snapshot ID 无条件 `Map.set()`。复用 `runId` 后，已被 current ref 指向的 terminal Snapshot 可在 ref ID 不变且未再次 `adopt` 的情况下被替换为不同 parent/content，破坏 immutable identity 与 Ref authority。
2. Snapshot → MuJoCo 映射不完整：floor rotation 未进入 MJCF，dynamic entity 的 `linearVelocity`/`angularVelocity` 未写入 `MjData.qvel`。输入 `vz=-2` 时 Episode `t=0` sample 为 `vz=0`，Episode 并非从 authoritative Snapshot state 开始。
3. 30 Hz sampling 使用累计浮点时间与 `Number.EPSILON` 判阈值。固定 240 Hz / 30 Hz 场景中，76 个 samples 有 52 个错开一个 physics timestep，最大 timing error 为 `0.004166666666667762 s`。
4. Runtime boundary 未 fail closed：`durationSeconds=-1` 仍返回 `completion=completed` 的一帧 Episode；`runtimeEvidence.provider/version` 可由 caller profile 任意伪造，与实际 MuJoCo implementation provenance 脱钩。
5. `evaluateLanding()` 返回的 `EvaluationRecord` 未冻结，PASS/FAIL 与 metrics 可在不重新评测的情况下原地篡改；record ID 也未表达 evaluator/contract identity。

## P2

1. Runtime 首次加载期间仍可 edit，可能产生与 current ref 分离、但 UI 未显示 `episode.baseSnapshotId` 的 detached Episode。
2. canvas fallback/role、移动端 touch target 与 hover fine-pointer gating 仍可增强，但不阻断当前 correctness。
3. tests 仅覆盖 canonical happy path，缺少上述 identity、initial state、exact grid、invalid input、immutable evaluation 与 in-flight behavior regression。

## 执行证据

- `bun test`：4 pass、0 fail、22 assertions；现有 tests 不覆盖上述反例。
- duplicate ID 复现：同一 `snapshot:terminal-collision` 的 `parentId` 从 `snapshot:edit-1` 变为 `snapshot:other`，中间没有 `adopt`。
- initial velocity 复现：Snapshot input `vz=-2`，Episode sample 0 为 `vz=0`。
- sampling 复现：`76 52 0.004166666666667762`。
- invalid duration 复现：`completion=completed`、`samples=1`、terminal time `0`。
- EvaluationRecord 复现：`Object.isFrozen(record) === false`，`passed` 与 metrics 可写。
- 审查前后 product aggregate SHA-256 均为 `48d160ccdb1fdf86955d00f99f55069eddcda31fd1f8f82a42b6e8241ba929e9`。

## 关单建议

- `DH-001` 不得关闭，应进入 `changes_requested`。
- 修复应回到 invariant：content-addressable/冲突拒绝的 Snapshot identity、完整 Snapshot state mapping、integer-step sampling、fail-closed Runtime validation/provenance 与 immutable EvaluationRecord；不要以兼容 flag 或 UI 文案掩盖。
