# DH-019 计划：Offline Value Checkpoint

## 定位

这是 DH-018 之后的产品决策 checkpoint，不再实现第二套 worldmaking runner。它复用 DH-018 已完成的 WorldToolSurface fail→repair→pass seam；本 checkpoint 有意保持 measurement-only direct surface，不启动 ProductSession/OMP turn，只负责独立重放、测量和生成 decision receipt，回答：在没有任何 live model/provider quota 时，Demiurges 是否能重复证明一个模型意图经过世界、证据和修复后得到确定性结果。

## Golden trace

固定使用 `fixture:two-joint-planar-reach-v1`：

1. `world_write` 创建 procedural articulated fixture；
2. `world_read` 读取结构化 joints、target 与 affordance；
3. `world_edit` 建立 zero-joint authored state；
4. `world_run` 使用 `run:dh019-zero` 与 one-step all-zero Program，Evaluation 为 `FAIL`；
5. 从受信 Evaluation 读取并校验 `supportSamples=0`、`maxPositionErrorMeters=0.226543641354435`、`maxJointSpeedRadiansPerSecond=0`；
6. 第二次 `world_read` 获取 authored Ref `version=2`；
7. `world_run` 使用 `run:dh019-corrected` 与 one-step `.65/-1` Program（`kind=actuator-sequence`、`targetRef=entity:arm`、`durationSeconds=3`、`sampleRateHz=30`、唯一 step 为 `timeSeconds=0`），Episode 为 91 samples，Evaluation 为 `PASS`，`supportSamples=16`、`maxPositionErrorMeters=0.00000179062757188384`、`maxJointSpeedRadiansPerSecond=0.0000390513154170192`。

首次 zero Program 同样固定为 `kind=actuator-sequence`、`targetRef=entity:arm`、`durationSeconds=3`、`sampleRateHz=30`、唯一 `timeSeconds=0` step，两个 command 均为 `0`。`evidenceFieldsUsed` 固定为字面有序数组 `["supportSamples","maxPositionErrorMeters","maxJointSpeedRadiansPerSecond"]`。

Repair 函数必须接收第一次受信 Evaluation，逐字段校验上述 metrics 与 episode/evaluator/contract identity 后才能生成 corrected Program；缺失、篡改或错配 evidence 必须拒绝。Repair 是下一次 `world_run` 的显式 `WorldProgram` 改写，不增加 `world_edit` 能力，也不调用 provider。两次 run/evaluate 都不推进 Ref；`adopt` 不属于 checkpoint。

## 实现边界

新增一个 repo-owned measurement runner 与 deterministic receipt。runner 只依赖现有 `RuntimeMvpHost`、`WorldToolSurface`、articulated fixture、Program parser 和 evaluator；每次 replay 使用 fresh Host；不得复制作第二套 world authority，也不重复实现 DH-018 的 orchestration。

Receipt 使用 canonical JSON bytes，固定字段：

```ts
interface OfflineValueCheckpointReceiptV1 {
  schemaVersion: 1;
  fixtureId: "fixture:two-joint-planar-reach-v1";
  scenarioId: "scenario:two-joint-planar-reach-v1";
  runIds: readonly ["run:dh019-zero", "run:dh019-corrected"];
  traceDigest: `trace:sha256:${string}`;
  toolSequence: readonly ["world_write", "world_read", "world_edit", "world_run", "world_read", "world_run"];
  episodeIds: readonly [string, string];
  evaluationIds: readonly [string, string];
  firstOutcome: "FAIL";
  secondOutcome: "PASS";
  repairCount: 1;
  evidenceFieldsUsed: readonly string[];
  replayDigest: `replay:sha256:${string}`;
}
```

`traceDigest` 的 preimage 是 domain string `demiurges-dh019-trace-v1\0` 加上 `canonicalJsonBytes` 的 `{fixtureId,scenarioId,runIds,programs,toolSequence}` 包装对象；programs 同时包含完整 canonical program content 与 derived `program.id`。`replayDigest` 的 preimage 是 domain string `demiurges-dh019-replay-v1\0` 加上 `canonicalJsonBytes` 的 receipt 字段（排除两个 digest 字段）。Receipt 不包含 credential、provider URL、raw response、绝对路径或大体积 Artifact bytes；receipt `status` 固定为 `offline-proven`。两次 fresh Host 执行必须生成 byte-identical receipt 与 replay digest。

## Non-goals

- 不接入 live OMP、Marble、Hunyuan 或任何 quota；
- 不增加 `generate`、`inspect`、`adopt` 或第五个 world tool；
- 不把 scripted replay 宣称为自然语言 Agent canary；
- 不实现通用 benchmark、任务市场、调度器或长期记忆；
- 不改变 Snapshot/Ref/Episode/Evaluation/Project authority。

## 允许修改范围

- `scripts/` 下单一 offline checkpoint runner 与对应测试；
- 必要时 `packages/world/src` 中已有 Program/evidence 的最小 re-export；
- `docs/project-harness/tasks/DH-019/` 的 plan、progress、receipt 与 review artifacts；
- 不修改 provider transport、Keychain、World Project manifest、Studio UI 或生产 Gateway。

## 验收

1. runner 在无网络、无 Keychain、无 live OMP 环境完成上述六次 world-tool 调用；源码结构检查不得 import provider transport、Keychain 或 OMP；
2. tool sequence、Episode/Evaluation identity、FAIL/PASS、`repairCount=1` 与 evidence fields exact；
3. runner 重放两次得到 byte-identical receipt/replay digest；
4. forged Evaluation 或真实 Episode provenance/content 被篡改时 fail closed；固定 tool sequence、Ref/Program/Evaluation identity 检查阻断额外 tool 或 terminal-only bypass；
5. 全量 tests、typecheck、build、diff-check 与 Harness validation 通过；
6. 结果明确记录为 `offline-proven`，不扩大解释为 live Agent 或 predictive world model 已验证。

## 已验证 receipt

当前 offline checkpoint receipt 见 `offline-value-checkpoint-receipt.json`，`status=offline-proven`。它固定 `traceDigest=trace:sha256:3f1c77b8b77ca62d8a830385bb9386f875d49880f734702e52cc360811984177` 与 `replayDigest=replay:sha256:f806faeac3913384b5e09af502dac03af72826ae1ee50c8d6c5ff36eccfbff83`，对应两次 fresh Host 的 byte-identical replay。

## 决策输出

Receipt 只用于决定下一步：

- 若 trace 成功且 evidence 足够定位失败，再设计最小 data-driven authoring；
- 若 trace 成功但 evidence 不足，先改 evidence projection；
- 若 trace 不稳定，暂停扩展 authoring，先修 Runtime/authority 根因。
