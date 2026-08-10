# DH-001 Cross-review Verdict

## Combined decision

`changes_requested`

两位 reviewer 对 Runtime 真实性、dependency direction、WASM live-view copy 与 Embind lifecycle 的判断一致；对 duplicate identity 等边界的严重度发生实质分歧。Kimi K3 Max 给出 `approved` 且无 P0/P1，GPT-5.6 Sol Max 给出 `changes_requested` 与 5 类 P1。按照预先声明的交叉审查规则，存在 P1 分歧时不得自动批准。

## Operator 独立复核

Operator 没有直接接受任一模型判断，而是用一次性 `bun -e` 诊断逐项复现：

```text
DUPLICATE_ID {"sameId":true,"beforeParent":"snapshot:edit-1","afterParent":"snapshot:other","changedWithoutAdopt":true}
INITIAL_VELOCITY {"input":[0,0,-2],"sample0":[0,0,0]}
FLOOR_ROTATION floor MJCF tag 中没有 quaternion
NEGATIVE_DURATION {"completion":"completed","samples":1,"time":0}
SAMPLING {"count":76,"lateCount":52,"maxDelay":0.004166666666667762}
EVALUATION_MUTABLE {"frozen":false,"passed/metrics 可写":true}
```

Operator 同时重新运行：

- `bun test`：4 pass、0 fail、22 assertions；
- `bun run typecheck`：通过；
- `bun run build`：通过，保留 Vite browser-external 与 chunk-size warning；
- product aggregate SHA-256：`48d160ccdb1fdf86955d00f99f55069eddcda31fd1f8f82a42b6e8241ba929e9`，与审查前一致。

这些证据说明现有 happy-path tests 真实通过，但不足以证明 invariant；Sol 的反例成立。combined decision 采用 `changes_requested`。

## Blocking invariants

1. Snapshot ID 必须稳定标识不可变内容；Repository 不得用同 ID 静默替换不同 bytes，尤其不能让 current ref 在未 adopt 时改变所指内容。
2. Runtime 必须从 authoritative Snapshot 的完整受支持状态开始；若某个 state/frame/unit/profile 不受支持，应 fail closed，而不是忽略。
3. Episode sampling evidence 必须落在声明的确定性网格上；固定比率 slice 应由 integer physics step 决定采样，而非累计浮点阈值。
4. malformed program/profile 不得产出 `completed`，Runtime provenance 不得由 caller 任意声明。
5. EvaluationRecord 是证据记录，必须与 Episode 一样 immutable，并拥有足以区分 contract/evaluator identity 的稳定语义 ID。

## Non-blocking follow-up

- 明确 in-flight edit policy 或呈现 detached Episode lineage；
- 增加上述反例的 regression tests；
- UI/a11y craft 与 development-only transitive dependency 不在本轮作为阻断修复扩张。

## Authority

本次只记录 review evidence 与 workflow decision，没有修改 product implementation，没有 commit、remote、Issue、PR、deployment 或 release。
