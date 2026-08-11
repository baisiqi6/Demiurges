# DH-009 Round 1 Cross-review Verdict

## Combined decision

`changes_requested`

GPT-5.6 Sol 与 Terra 两位 fresh reviewer 在 frozen product digest `e9d9b1eb1a51f04342cc3aff4ab7211714e705021a910117ccd6d75bb54a5053` 上独立完成只读审查；两边 before/after digest 均精确一致，targeted tests 与 `git diff --check` 通过。P0 无，但存在以下阻断项。

## P1

1. Product codec 只验证 quaternion 分量 finite，未要求单位长度；AlignmentEvidence 又把未归一化 dot 上截到 1。将 authoritative/presentation quaternion 伪造成范数 2 可得到 angle 0 与 PASS。
2. 反向 bounds（`min > max`）经角点枚举会产生与合法 bounds 相同的包围盒，当前 evidence 可错误 PASS；non-finite 虽 FAIL，但没有覆盖 bounds ordering。
3. serialized projection 可以把 GLB/collision/observation 整组迁移到 `entity:floor`，甚至交换 floor/cube identity，并在 base/terminal 全链同步后被接受；Evaluation target 仍为 `entity:cube`，说明 representation 没有绑定 Product program 的目标 EntityRef。
4. `SplatMesh` 在局部变量内创建后 await `initialized`；若 promise reject，catch 无法访问该实例，因此无法 dispose，违反 load-failure lifecycle acceptance。

## P2

- `data-observation-error` 在失败后没有随 no-observation session/reset 清理，且下一次 loading 前也可能残留旧错误。

## Required remediation

- 在 Product plain-data trust boundary 拒绝非单位 Entity pose quaternion，并让 AlignmentEvidence 独立拒绝非法 pose；
- 在 alignment 输入层显式验证 finite ordered bounds，非法输入产生 FAIL，不能被 corner transform 正规化；
- 将 diagnostic observation 明确绑定 `CUBE_REF` 及登记 imported visual/collision；
- 让 `SplatMesh` instance 在 initialized rejection/catch 可达并释放，同时移除可能已 attach 的 stale object；
- loading/error/reset 对 observation dataset 执行成组清理；
- 新增对应 executable regressions，重跑 full/browser gates，冻结新 digest 后进入 fresh Round 2，Round 1 历史 verdict 永久保留。
