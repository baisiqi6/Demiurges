# DH-015 Plan Review — Round 1

## Frozen identity

- Branch：`agent/codex/DH-015`
- HEAD/base：`1805d73055a79a7e0506afafebaffd7b308706f9`
- Plan SHA-256：`d9db719985e847d7edc3655f80c9c19666b52665f361513d42864eef5741b5ca`
- Ordered 18-file aggregate：`db55efe0ed5f599d89b8049cb75c694ac316dfd85ad10da477e4be09236d0c25`
- 两位 reviewer 均确认起点与终点 branch、HEAD、plan、manifest 与 Git status 未漂移；均为只读审查。

## Independent reviewers

1. `gpt-5.6-sol`，max reasoning，Codex sub-agent：`/root/dh015_plan_review_sol`
2. OMP `deepseek/deepseek-v4-pro`，thinking `max`：session `01a00130-be7c-7000-b197-e775574fa027`

两位 reviewer 没有读取对方输出。第二位 reviewer 的 provider/model 由 OMP native session event 确认为 `deepseek/deepseek-v4-pro`；最终 verdict 只从 assistant `text` block 提取，没有使用或保留 private thinking。

## Combined decision

- `decision: changes_requested`
- `may_implement: no`
- P0：1
- P1：至少 4 个独立 contract family

## 必须回到 canonical plan 修订的问题

### 1. Composite authored-state closure 挡住核心 edit

当前 `requireMarbleHunyuanCompositeSnapshot()` 对所有非 `runtime-terminal` Snapshot 都要求 generated-object state 与 canonical fixture 完全相同。合法的 translation 或 world-Z yaw edit 会在 Repository insertion、Product codec admission 与 MuJoCo base admission 三处被拒绝。

计划必须把“registered artifact identity”与“authoritative authored state”分开：

- `source: write` 继续要求 exact canonical initial state；
- `source: edit` 只允许 `entity:generated-object` 的 finite translation 与 canonical pure world-Z yaw 改变，velocity 保持零；
- environment、floor、representations、physics、calibration、witness 与所有其他 entity state 保持 exact；
- `source: runtime-terminal` 继续走已有 Episode/runtime validator；
- Repository、codec、runtime 三个 seam 都必须有 RED 与回归，不能削弱 DH-013 的 representation/physics/witness family。

### 2. 现有 trusted projection decoder 不是 transition decoder

`decodeProductSessionProjectionTrusted(expectedWorld)` 只接受 world 与 prior exact 相等，不能证明 `null → root`、`parent → child`，真实 stale 后也不能用旧 prior 接纳新 current。

计划必须增加 package-owned、operation-aware 的 trusted transition decoder；Studio 不得复制 lineage 规则。write、edit、run（若仍有 direct run）分别有不同的 transition contract。stale response 不得假装是 prior 的合法 child，必须通过稳定 conflict + authoritative GET 重新建立 verified current。

### 3. Direct async run 的 deadline 不能只用 Promise.race

当前 `WorldToolSurface.run` 不接收 AbortSignal，Host 会在 await 后登记 Episode/Evaluation。若 HTTP deadline 先返回并提前释放 busy reservation，late run 会在旧操作已“结束”后改变 evidence/lastRun；若丢弃结果又可能留下不可见 Episode 或 duplicate runId。

Round 2 应采用更小的产品边界：DH-015 只增加 deterministic human `write/edit` route；`run` 继续由既有 Agent 四工具路径完成，并用现有 scripted/OMP canary 与 explicit adopt 回归证明。不要在本切片顺手发明可取消的 runtime transaction。

### 4. Semantic no-op 与 quaternion equivalence 未冻结

计划必须明确：draft 与 authoritative pose 在 canonical comparison 下相等时，UI 不发送 edit，不创建 child Snapshot，不清空 valid lastRun。比较必须把 `q`/`-q` 视为相同旋转，归一化 canonical sign 与 `-0 → 0`。

### 5. TransformControls 不能直接拥有 authoritative render root

draft 必须施加在独立 Presentation wrapper；alignment evidence、inspector、bounds 与 registered witness 继续读取 authoritative root/state。否则 gizmo change 可能被 reactive sync 覆盖，或反向污染 alignment truth。

### 6. 生命周期与 explicit adopt 要更精确

- toolbar click 导致的 canvas blur 不能等同于 window/document 外部 blur；正常 drag end 与 lost pointer capture 要分开；
- edited v2 → run → PASS/FAIL → explicit adopt 必须有回归；stale/wrong Evaluation 不能推进 Ref；
- structural diff gate 要覆盖本次确需修改的 artifact fixture 与 runtime admission seam，而不是把它们留在“默认不修改”盲区。

## Round 2 gate

先修订 canonical plan，重新冻结 plan/manifest digest，再由两个 fresh reviewer 独立复核。P0/P1 为 0 且 combined decision `approved` 前不得进入实现。
