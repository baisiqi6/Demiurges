# DH-018 Agent Worldmaking Orchestration — 第一最小闭环

## 发心

证明 Agent 已经能够消费 DH-017 产出的真实、已验证 `ArtifactRef` 来造世界，而不是再造一套 Agent 框架、provider SDK 或持久化协议。

这一步只回答一个产品问题：给 restricted Agent 一句自然语言任务后，它能否只通过既有 `read`、`write`、`edit`、`run`，把已登记物体放进 Marble 世界，看到确定性失败证据，并修正到 Evaluation 通过。

## 已确认事实

- DH-017 已产生一个 durable `verified` Hunyuan `object-glb`：
  - `artifactSetDigest=5641bf040c5dc881a553332493957627c8557edc5d7aa7d4f65b42139259e69d`
  - `assetId=asset:generated-sha256-65dc7eb3d71393e624925c6848e88b55cf0bd6fd8d1ca63b956743fddd55e05a`
  - `contentDigest=65dc7eb3d71393e624925c6848e88b55cf0bd6fd8d1ca63b956743fddd55e05a`
  - `byteLength=24189512`，`format=glb-2.0`，`elementCount=1`
- `GeneratedArtifactReader.list()` 已是 durable verified set 的只读 authority；它不暴露 credential、signed URL 或 provider handle。
- restricted OMP Agent 与四个 world tools 已存在；MuJoCo composite runtime、landing Evaluation、Ref/CAS edit 也已存在。
- `WorldProjectManifestV1` 固定要求现有 `registry:marble-hunyuan-v1` 及其完整 manifest digest。修改或扩展该 registry 会破坏旧项目恢复，因此本切片不得修改 Project v1 或声称新动态 world 已可落盘恢复。

## 最小实现

1. 在 control-side session 创建边界，从 `GeneratedArtifactReader.list()` 选择**恰好一个**合法 `object-glb` 候选；零个或多个时不猜测、不自动选最新。
2. 将该 verified set/member 投影为一个窄的、递归冻结的 generated-object binding：只保留后续 session Snapshot 实际消费的 `artifactSetDigest`、`assetId` 与 `sourceBounds`。其他已验证 summary 字段继续由 Reader 持有，不复制到 Snapshot 边界。
3. 用该 binding 构造 session-bound Marble composite fixture：
   - Marble environment/floor 继续复用现有受信静态 registry；
   - Hunyuan visual identity 使用 `(artifactSetDigest, assetId)`；
   - glTF Y-up → world Z-up、AABB centering 与 box proxy 明确标注为 `authored-unverified`，不得写成 provider-verified calibration；
   - 不读取或复制 24 MB GLB bytes 到 Snapshot。
4. Agent 仍只看到 `read`、`write`、`edit`、`run`。`write` 不增加 Artifact 参数，不增加第五个 tool；Artifact binding 在 Agent 启动前由 Host 固定。
5. 一次自然语言 turn 执行最短 repair loop：
   - `write` + `read`；
   - 首次 `edit` 把 generated object 放到 floor 支撑范围外，`run` 得到 deterministic `passed=false`；
   - Agent 检查 Evaluation 指标；
   - `read` 当前 Ref，再次 `edit` 到 floor 上方，第二次 `run` 得到 `passed=true`。
6. 保留两个 run 的 evidence/trace，使测试能证明失败不是异常吞掉、成功不是脚本口头宣称。

## 非目标

- 不调用 Marble/Hunyuan，不读取 Keychain，不新增付费或网络 side effect。
- 不修改 `MARBLE_HUNYUAN_REGISTRY`，不修改 `WorldProjectManifestV1`、Project Store、bundle 或 startup recovery。
- 不做通用 artifact resolver、插件系统、planner、workflow engine、retry/backoff、scheduler 或 audit framework。
- 不增加 `generate`、`inspect`、`adopt` 等第五个 world tool；不自动 adopt terminal Snapshot。
- 不支持多个 generated candidate 的排序/选择 UI；多候选歧义留给后续真实需求。
- 不把 source bounds 或 authored calibration 说成语义、尺度或物理形状的 provider 真值。

## Worker 允许修改范围

优先只在下列路径中做 surgical changes；若确有必要超出，Worker 必须先在 RESULT 中说明理由，不能自行扩张：

- `packages/world/src/artifacts/marble-hunyuan-composite-fixture.ts`
- `packages/world/src/artifacts/marble-hunyuan-composite-fixture.test.ts`
- `packages/world/src/world-tools/world-tool-surface.ts`
- `packages/world/src/world-tools/world-tool-surface.test.ts`
- `packages/world/src/world-tools/world-tool-contract.ts`
- `packages/world/src/world-tools/world-tool-contract.test.ts`
- `packages/world/src/index.ts`
- `apps/agent-gateway/src/product-session.ts`
- `apps/agent-gateway/src/product-session.test.ts`
- `apps/agent-gateway/src/product-session-api.ts`
- `apps/agent-gateway/src/product-session-api.test.ts`
- 必要时新增一个与上述边界同目录、职责单一的 DH-018 binding/helper 及对应 test。

禁止触碰 provider transport、generation journal/publication、Project Store/manifest、Studio、生产部署文件和 Keychain。

## 验收证据

1. Unit test：Reader summary 到 frozen binding 的 exact 投影；零候选/多候选均不猜测。
2. Fixture test：真实 DH-017 identity、source bounds、authored-unverified calibration 与派生 proxy 重算一致。
3. Product Session test：tool name 集合仍恰好为四个；trace 中首次 Evaluation fail、修复后 pass；Ref version 单调增长。
4. Regression：旧 `fixture:marble-hunyuan-composite-v1` 与既有 Project v1 tests 不漂移。
5. Operator 运行 focused tests、相关 package typecheck，以及一次受限 OMP Agent canary；canary 不调用世界模型 provider。

## 完成定义

- 真实 verified ArtifactRef 由 control side reader 消费并固定到 Agent session。
- restricted Agent 仅用四工具完成 `compose → run fail → inspect → edit → run pass`。
- deterministic Evaluation 是唯一成功判据。
- 无 Project v1 兼容性漂移、无 provider/credential side effect、无通用框架增量。
- Worker RESULT、Reviewer verdict 与 Operator 独立验证证据均落盘后，才可关闭 DH-018。
