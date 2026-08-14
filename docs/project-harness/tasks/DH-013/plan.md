# DH-013 计划：真实世界模型产物接入与场景合成切片

## 状态与 Authority

- Status：`implementing_phase2`；
- Mode：`high-risk` provider import + product slice；
- Branch：`agent/codex/DH-013`；
- Worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-013`；
- Base：`97761d6b5dba899fcb73b93ba830ba78f2980766`；
- Human 已确认本计划的产品验收方向并授权开始 DH-013；
- 本轮允许创建独立 worktree、EXharness item、计划、产品代码、测试与本地可见验收，并只读刷新、下载既有 provider job/world 的已生成产物；
- 本轮不包含 commit、push、merge、PR、tag、deploy、Discord mutation 或新的付费模型生成；这些动作仍需独立 authority。

## Goal

把已经生成的一个 Marble 世界产物与一个 Hunyuan 3D 物体产物接入 Demiurges，使 Studio 第一次显示真实世界模型资产，并形成一条可执行的合成闭环：

```text
Marble SPZ observation
+ Marble collider mesh
+ Hunyuan GLB visual
+ explicit calibration
+ bounded MuJoCo collision proxy
→ one trusted Snapshot
→ visible composed scene
→ falling-object Episode
→ deterministic Evaluation
```

本切片不是通用 provider marketplace，也不是让 3DGS 定义 Kernel。它验证“世界模型产物如何经过下载、校验、标定和显式 adopt，成为可呈现、可运行、可检查的世界 representation”。

## 已验证的上游事实

### Marble

- Official API base：`https://api.worldlabs.ai`；认证 header 为 `WLT-Api-Key`；
- 既有 canary operation：`8ffcc9ec-8548-4d64-a5ee-eb7c736cef8b`；
- 既有 world id：`7ece758a-aea5-42a0-890d-303d6bbab9b0`；
- 已观察到产物至少包含 SPZ、collider mesh 与 thumbnail；
- 该 Draft 结果没有可作为 authority 的 metric scale、ground plane 或完整坐标标定元数据。

### Hunyuan 3D

- Official OpenAI-compatible API base：`https://api.ai3d.cloud.tencent.com`；
- 既有 canary JobId：`1479369951965601792`；
- 已观察到产物至少包含 GLB 与 OBJ ZIP；
- GLB 是外观/几何产物，不自带可信的 mass、inertia、collision semantics 或世界坐标。

Credential 只从 macOS Keychain 注入 operator-side importer；不得进入 Git、浏览器 bundle、URL、argv、日志、Snapshot、Product Session event 或 review artifact。Signed download URL 是短期传输能力，不是 artifact identity，也不得持久化为世界事实。

### Round 1 后冻结的 canary identity

以下值来自已授权的既有 canary，只读 query/download；没有发起新的 generation：

| assetId | provider resource | format | bytes | SHA-256 | decoded source bounds |
|---|---|---:|---:|---|---|
| `asset:marble-world-500k-spz-v1` | Marble world `7ece758a-aea5-42a0-890d-303d6bbab9b0`, resolution `500k` | SPZ v2 / 497,664 splats | 5,163,264 | `3fc704ff2b5a2f6cc6bf8f5efb179ac30904ba6af3ee2da6b5aa1e2148577cb5` | min `[-1.187255859375,-1.81494140625,-2.52490234375]`, max `[1.823486328125,0.875732421875,2.66748046875]` |
| `asset:marble-world-collider-v1` | same Marble world | GLB 2.0 / 1 primitive | 7,719,136 | `6a5b26afe07afb057ea8872281966c1605b3ae3f06b0418081586a393c710e24` | min `[-1.1668531894683838,-1.8059593439102173,-2.471714496612549]`, max `[1.7936387062072754,0.7732045650482178,2.6337761878967285]` |
| `asset:hunyuan-rounded-cube-v1` | Hunyuan JobId `1479369951965601792` | GLB 2.0 / 1 primitive | 21,383,672 | `ad65fee536bfaf3b3efc889b71302be1002d2688b423b3a292a1e72b0a08b7d5` | min `[-0.3981949985027313,-5.3308758703680866e-8,-0.3980010388589447]`, max `[0.39665499329566956,0.7941781692130095,0.39676417020457155]` |

Marble `semantics_metadata` 对该 Draft 实际为 `null`。官方 export specification 声明 Marble export 使用 OpenCV-style `+x left, +y down, +z forward`；Hunyuan GLB 遵循 glTF 2.0 的 right-handed Y-up basis。上述 source bounds 来自真实 SPZ centers / GLB POSITION accessors 与 node transform，不来自 UI 常量。

所有三个 manifest entry 的 distribution policy 固定为 `unknown-restricted-local`：DH-013 只允许本机 cache 与可见验收，不导出、上传、随 Git 分发或部署；未来确认 provider use-rights 后必须另立 authority 修改该字段。

## High-risk import authority

### 固定 credential locator

- Marble：macOS Keychain `service=demiurges-marble-probe`、`account=Admin`；
- Hunyuan：macOS Keychain `service=demiurges-hunyuan-probe`、`account=Admin`；
- Hunyuan authenticated query 的 exact header contract 为 `Authorization: <keychain value>`（没有 `Bearer ` 前缀）；该 header 只发送到 `https://api.ai3d.cloud.tencent.com`，不得发送给 COS download host；
- importer 直接捕获 `security find-generic-password -w` 的 stdout 到进程内存；不打印、不写文件、不拼入 shell argv、URL 或 child log；
- credential 只发送到对应 API origin，任何 CDN/COS download request 都不携带认证 header。

### 固定 query/download contract

- Marble query：`GET https://api.worldlabs.ai/marble/v1/worlds/7ece758a-aea5-42a0-890d-303d6bbab9b0`；只读取 exact world id、model、`spz_urls["500k"]` 与 `collider_mesh_url`；
- Marble download host allowlist：exact `https://cdn.marble.worldlabs.ai`；
- Hunyuan query：`POST https://api.ai3d.cloud.tencent.com/v1/ai3d/query`，JSON body 只有 exact `JobId`；只读取 `Status=DONE` 与唯一 `Type=GLB` URL；
- Hunyuan download host allowlist：exact `https://hunyuan-prod-1258344699.cos.ap-guangzhou.tencentcos.cn`；
- authenticated query 使用 `redirect: manual`；download 也使用 `redirect: manual`，只接受 exact HTTPS host、HTTP 200 与声明类型；绝不跨 host 转发 credential；
- 单次 import 共享 90 秒 wall-clock deadline；response metadata 上限 256 KiB；SPZ / Marble collider / Hunyuan GLB 最大分别为 16 / 32 / 64 MiB，按实际 streamed bytes 截止；
- signed URL 失效最多在同一总 deadline 内重新 query 一次；不更换 resource id，不回退 generation；
- provider status/body/header/URL/path 不进入公开 error；只输出稳定 code、assetId、阶段与脱敏 receipt；
- temp 位于 ignored cache 的私有 `0700` 目录、文件 mode `0600`，所有失败路径 `finally` 清理；完整 size/magic/decoded bounds/digest 验证后才能 atomic rename；
- 旧的 valid digest-keyed cache 永不被失败 import 覆盖；回滚就是删除新 candidate locator，保留旧 content-addressed bytes 与 Git manifest 不变。

## First-principles design

### 1. 三个事实面，不互相冒充

```text
Provider output                 Demiurges authority
---------------------------     ---------------------------------
SPZ appearance/observation  ->  ObservationArtifact
GLB appearance/geometry     ->  VisualArtifact
collider/derived geometry   ->  CollisionSourceArtifact
explicit operator values    ->  CalibrationRecord + PhysicsProxy
```

- Provider bytes 先是 untrusted input；只有通过 format、size、digest、finite bounds 与 manifest closure 后才成为 verified artifact；
- `CalibrationRecord` 显式声明 source frame、source units、axis mapping、uniform scale 与 local pose；缺失时 fail closed，不从“看起来差不多”反推；
- MuJoCo 只消费 Snapshot 中已登记的 bounded collision proxy 与 physics state，不直接消费 SPZ 或 Hunyuan render mesh；
- 3DGS/GLB Presentation failure 不修改 Snapshot、Episode、Evaluation 或 Repository ref。

`CalibrationRecord` 还必须显式区分：

- `integrityStatus = verified`：bytes/digest/format/bounds 与 Git manifest 一致；
- `calibrationStatus = authored-unverified`：坐标变换与 proxy 是本切片明确创作的工程约定，不冒充 provider metric truth；
- `proxyWitnessStatus = pass | fail`：只说明 source artifact、calibration 与 proxy 的数值关系是否满足 tolerance。

Studio 不显示一个含混的全局 `PASS`。它分别显示 `INTEGRITY VERIFIED`、`CALIBRATION AUTHORED / UNVERIFIED` 与 `PROXY WITNESS PASS|FAIL`。

### 2. 不把大资产提交进普通 Git history

DH-013 的真实 provider bytes 进入 ignored、可重建的 local artifact cache；Git 只保存：

- artifact manifest schema 与当前 canary 的 non-secret identity；
- digest、byte length、media type、provider resource id、provenance、calibration 与 expected bounds；
- importer/validator、fixture-sized tests 与产品代码。

Gateway 通过 bounded same-origin asset route 提供已经验证的本地 bytes。Studio 不直连 provider、不接触 key、不持久化 signed URL。缺少本地 cache 时，产品显示明确的 `not imported` 状态，不回退到 diagnostic wedge，也不静默联网。

唯一 authority 顺序固定为：

```text
Git registered manifest
  └── assetId + provider resource identity + format + size + digest
      + decoded source bounds + CalibrationRecord + proxy witness contract
          ↓ exact registry lookup
Snapshot / Product projection 只携带 assetId + manifestDigest
          ↓
ignored cache path = .artifacts/provider-cache/sha256/<digest>
          ↓ materialization only
Gateway GET /api/assets/<assetId>
  └── 每次打开/session load 前重算 size + SHA-256 + magic
```

- Runtime、Repository 与 Studio 都不读取 receipt；receipt 只是 operator attestation；
- cache path 只由 manifest digest 派生，不由 caller/path/URL 提供；
- route 只接受 closed `assetId`，查 Git registry 后定位 digest；不接受 path、query URL 或 arbitrary digest；
- mismatch/truncation 返回稳定 fail-closed error，绝不服务 bytes、绝不改 manifest、绝不删除旧 valid cache；
- cache miss 返回 `not imported`；matching cache 可离线复用；
- signed URL、provider response 和 receipt 都不是 Snapshot/Runtime authority。

### 3. 一个场景，一个稳定身份

新增且只新增一个 registered scenario，身份冻结为：

```text
scenarioId              = scenario:marble-hunyuan-composite-v1
environment EntityRef   = entity:environment
floor EntityRef         = entity:floor
generated object ref    = entity:generated-object
```

- environment Entity：稳定 `EntityRef`，持有 Marble SPZ observation 与 collider-source representation；
- generated object Entity：稳定 `EntityRef`，持有 Hunyuan GLB visual、显式 box collision proxy、mass 与 initial pose；
- floor/physics proxy：只在明确 calibration 下作为独立 collision/physics representation；
- Episode sample、terminal Snapshot、Evaluation target、Studio selection 与 overlay 都保持相同 EntityRef；
- world-model provider name、operation id 或 asset URL 都不能替代 EntityRef。

### Exact CalibrationRecord v1

`CalibrationRecord` 是 exact-key frozen plain data：

```text
id, status, method,
sourceFrameRef, targetFrameRef,
sourceHandedness, targetHandedness,
axisMap[3], determinant,
sourceUnitMeters, targetUnitMeters,
quaternionConvention, rotation[xyzw], translation[xyz], uniformScale,
sourceBounds, targetBounds,
integrityToleranceMeters,
evidence{artifactId, artifactDigest, method, truthLevel}
```

规则：axis map 是 target axis 对 source axis 的 signed permutation；`determinant` 必须为 `+1`；quaternion 固定 `xyzw`、active rotation、right-handed、unit norm 且 canonical sign `w >= 0`；matrix、quaternion 与 axisMap 必须互相重算一致。registry literal、asset identity 与 serialized record 使用 exact equality；由 float64 重算 matrix/bounds 的派生值使用唯一常量 `TRANSFORM_RECOMPUTE_EPSILON = 1e-12`，不得借用 proxy witness tolerance。任何 mirror、non-uniform scale、非有限值、sparse/accessor/extra key、bounds 或 digest drift 都 fail closed。

`proxy/alignment tolerance` 不属于 CalibrationRecord，也不得被它含混复用；它只存在于后述 exact witness。每个 source artifact 各有一条完整记录，禁止用一条“Marble calibration”隐式代表两个不同 bounds/evidence 的 artifact。

#### `calibration:marble-spz-v1`

```json
{
  "id": "calibration:marble-spz-v1",
  "status": "authored-unverified",
  "method": "operator-authored-axis-map-and-aabb-grounding-v1",
  "sourceFrameRef": "frame:worldlabs-opencv-x-left-y-down-z-forward",
  "targetFrameRef": "frame:world-z-up",
  "sourceHandedness": "right",
  "targetHandedness": "right",
  "axisMap": ["+source.x", "+source.z", "-source.y"],
  "determinant": 1,
  "sourceUnitMeters": 1,
  "targetUnitMeters": 1,
  "quaternionConvention": "xyzw-active-right-handed-w-nonnegative",
  "rotation": [-0.7071067811865475, 0, 0, 0.7071067811865476],
  "translation": [-0.3133927583694458, -0.08103084564208984, 0.7732045650482178],
  "uniformScale": 1,
  "sourceBounds": {"min": [-1.187255859375, -1.81494140625, -2.52490234375], "max": [1.823486328125, 0.875732421875, 2.66748046875]},
  "targetBounds": {"min": [-1.5006486177444458, -2.60593318939209, -0.10252785682678223], "max": [1.5100935697555542, 2.58644962310791, 2.5881459712982178]},
  "integrityToleranceMeters": 0.000001,
  "evidence": {
    "artifactId": "asset:marble-world-500k-spz-v1",
    "artifactDigest": "3fc704ff2b5a2f6cc6bf8f5efb179ac30904ba6af3ee2da6b5aa1e2148577cb5",
    "method": "decoded-spz-v2-centers-v1",
    "truthLevel": "artifact-derived-bounds-only"
  }
}
```

#### `calibration:marble-collider-v1`

```json
{
  "id": "calibration:marble-collider-v1",
  "status": "authored-unverified",
  "method": "operator-authored-axis-map-and-aabb-grounding-v1",
  "sourceFrameRef": "frame:worldlabs-opencv-x-left-y-down-z-forward",
  "targetFrameRef": "frame:world-z-up",
  "sourceHandedness": "right",
  "targetHandedness": "right",
  "axisMap": ["+source.x", "+source.z", "-source.y"],
  "determinant": 1,
  "sourceUnitMeters": 1,
  "targetUnitMeters": 1,
  "quaternionConvention": "xyzw-active-right-handed-w-nonnegative",
  "rotation": [-0.7071067811865475, 0, 0, 0.7071067811865476],
  "translation": [-0.3133927583694458, -0.08103084564208984, 0.7732045650482178],
  "uniformScale": 1,
  "sourceBounds": {"min": [-1.1668531894683838, -1.8059593439102173, -2.471714496612549], "max": [1.7936387062072754, 0.7732045650482178, 2.6337761878967285]},
  "targetBounds": {"min": [-1.4802459478378296, -2.5527453422546387, 0], "max": [1.4802459478378296, 2.5527453422546387, 2.579163908958435]},
  "integrityToleranceMeters": 0.000001,
  "evidence": {
    "artifactId": "asset:marble-world-collider-v1",
    "artifactDigest": "6a5b26afe07afb057ea8872281966c1605b3ae3f06b0418081586a393c710e24",
    "method": "decoded-glb-position-accessor-node-transform-v1",
    "truthLevel": "artifact-derived-bounds-only"
  }
}
```

#### `calibration:hunyuan-glb-v1`

```json
{
  "id": "calibration:hunyuan-glb-v1",
  "status": "authored-unverified",
  "method": "operator-authored-axis-map-and-aabb-centering-v1",
  "sourceFrameRef": "frame:gltf-right-handed-y-up",
  "targetFrameRef": "frame:world-z-up",
  "sourceHandedness": "right",
  "targetHandedness": "right",
  "axisMap": ["+source.x", "-source.z", "+source.y"],
  "determinant": 1,
  "sourceUnitMeters": 1,
  "targetUnitMeters": 1,
  "quaternionConvention": "xyzw-active-right-handed-w-nonnegative",
  "rotation": [0.7071067811865475, 0, 0, 0.7071067811865476],
  "translation": [0.0007700026035308838, -0.0006184343271865844, -0.3970890579521254],
  "uniformScale": 1,
  "sourceBounds": {"min": [-0.3981949985027313, -5.3308758703680866e-8, -0.3980010388589447], "max": [0.39665499329566956, 0.7941781692130095, 0.39676417020457155]},
  "targetBounds": {"min": [-0.39742499589920044, -0.3973826045317581, -0.3970891112608841], "max": [0.39742499589920044, 0.3973826045317581, 0.39708911126088414]},
  "integrityToleranceMeters": 0.000001,
  "evidence": {
    "artifactId": "asset:hunyuan-rounded-cube-v1",
    "artifactDigest": "ad65fee536bfaf3b3efc889b71302be1002d2688b423b3a292a1e72b0a08b7d5",
    "method": "decoded-glb-position-accessor-node-transform-v1",
    "truthLevel": "artifact-derived-bounds-only"
  }
}
```

Hunyuan physics 值另行冻结：box proxy half-extents `[0.39742499589920044,0.3973826045317581,0.39708911126088414]`；mass `1 kg`；initial entity-center pose `[0,0,1.2]`、identity world rotation。

Marble floor proxy 是独立 authored box：center `[0,0,-0.05]`、half-extents `[1.4802459478378296,2.5527453422546387,0.05]`，top surface `z=0`。它只以 calibrated collider AABB 的 `minZ=0` 作为 witness；由于 provider 没有 ground semantics，UI 必须显示 `AUTHORED AABB FLOOR / UNVERIFIED`，不得宣称它是 provider-verified ground plane。

### Exact Proxy/Alignment Witness v1

Witness 是从 manifest、CalibrationRecord 与 Snapshot proxy 重新计算的派生证据，不是可由 caller 自报的 authority。codec/importer/Studio 只接受 registry 重算出的 exact witness；serialized `measured/passed` 与重算结果不一致时 fail closed。

#### Marble SPZ ↔ collider bounds witness

```json
{
  "id": "witness:marble-spz-collider-bounds-v1",
  "kind": "artifact-bounds-alignment-v1",
  "left": {"assetId": "asset:marble-world-500k-spz-v1", "artifactDigest": "3fc704ff2b5a2f6cc6bf8f5efb179ac30904ba6af3ee2da6b5aa1e2148577cb5", "calibrationId": "calibration:marble-spz-v1"},
  "right": {"assetId": "asset:marble-world-collider-v1", "artifactDigest": "6a5b26afe07afb057ea8872281966c1605b3ae3f06b0418081586a393c710e24", "calibrationId": "calibration:marble-collider-v1"},
  "metric": "max-abs-aabb-face-delta-meters",
  "faceDeltas": [0.02040266990661621, 0.05318784713745117, 0.10252785682678223, 0.02984762191772461, 0.033704280853271484, 0.008982062339782715],
  "measured": 0.10252785682678223,
  "tolerance": 0.12,
  "passed": true,
  "truthLevel": "authored-unverified"
}
```

该 witness 还要求两条 calibration 的 frame、axisMap、rotation、translation、units 与 scale exact 相同；仅 bounds/evidence/record id 可因 artifact 不同而不同。

#### Hunyuan GLB ↔ box proxy witness

```json
{
  "id": "witness:hunyuan-glb-box-proxy-v1",
  "kind": "mesh-proxy-aabb-containment-v1",
  "source": {"assetId": "asset:hunyuan-rounded-cube-v1", "artifactDigest": "ad65fee536bfaf3b3efc889b71302be1002d2688b423b3a292a1e72b0a08b7d5", "calibrationId": "calibration:hunyuan-glb-v1"},
  "proxy": {"entityRef": "entity:generated-object", "kind": "box", "center": [0, 0, 0], "halfExtents": [0.39742499589920044, 0.3973826045317581, 0.39708911126088414]},
  "metric": "max-abs-aabb-containment-error-meters",
  "measured": 5.551115123125783e-17,
  "tolerance": 0.000001,
  "passed": true,
  "truthLevel": "authored-unverified"
}
```

#### Marble collider ↔ authored floor witness

```json
{
  "id": "witness:marble-collider-authored-floor-v1",
  "kind": "authored-floor-aabb-contact-v1",
  "source": {"assetId": "asset:marble-world-collider-v1", "artifactDigest": "6a5b26afe07afb057ea8872281966c1605b3ae3f06b0418081586a393c710e24", "calibrationId": "calibration:marble-collider-v1", "calibratedMinZ": 0},
  "proxy": {"entityRef": "entity:floor", "kind": "box", "center": [0, 0, -0.05], "halfExtents": [1.4802459478378296, 2.5527453422546387, 0.05], "topZ": 0},
  "metric": "abs-calibrated-min-z-minus-proxy-top-z-meters",
  "measured": 0,
  "tolerance": 0.000001,
  "passed": true,
  "truthLevel": "authored-aabb-floor-unverified"
}
```

Phase 1 使用 frozen parameterized RED family，而不是“任一/或”式抽样。`mutateNumericLeaf(path)` 恰好把指定 finite number 加 `0.001`；`mutateStringLeaf(path)` 使用下表给出的 exact replacement；每个 family 的 **全部成员** 都必须生成独立 test name 与 evidence，不能任选一个代表整个 family。

| family id | required members（全部执行） | required fail-closed seams |
|---|---|---|
| `marble-source-identity` | `left.artifactDigest`、`right.artifactDigest` 分别替换为 64 个 `0` | Repository、Runtime、codec、stream |
| `marble-calibration-id` | left/right `calibrationId` 分别替换为 `calibration:tampered-v1` | Repository、Runtime、codec、stream |
| `marble-transform-leaves` | left/right CalibrationRecord 的 `axisMap[0..2]`（replacement=`+source.tampered`）、`rotation[0..3]`、`translation[0..2]`、`uniformScale` 每个 leaf 分别变异 | Repository、Runtime、codec、stream |
| `marble-bounds-leaves` | left/right CalibrationRecord 的 `sourceBounds.min/max[0..2]` 与 `targetBounds.min/max[0..2]` 每个 numeric leaf 分别变异 | Repository、Runtime、codec、stream |
| `marble-derived-evidence` | `faceDeltas[0..5]`、`measured`、`passed`（true→false）分别变异 | Repository、Runtime、codec、stream |
| `marble-tolerance` | `0.12` → `0.121` | Repository、Runtime、codec、stream |
| `hunyuan-source-identity` | GLB digest 替换为 64 个 `0` | Repository、Runtime、codec、stream |
| `hunyuan-calibration` | `calibrationId`→`calibration:tampered-v1`；CalibrationRecord 的 `axisMap[0..2]`、`rotation[0..3]`、`translation[0..2]`、`uniformScale` 每个 leaf 分别变异 | Repository、Runtime、codec、stream |
| `hunyuan-bounds-leaves` | `sourceBounds.min/max[0..2]` 与 `targetBounds.min/max[0..2]` 每个 numeric leaf 分别变异 | Repository、Runtime、codec、stream |
| `hunyuan-proxy-leaves` | `entityRef`→`entity:tampered`、`kind`→`sphere`、`center[0..2]`、`halfExtents[0..2]` 每项分别变异 | Repository、Runtime、codec、stream |
| `hunyuan-derived-evidence` | `measured`、`passed`（true→false）、`tolerance`（`0.000001`→`0.001001`）分别变异 | Repository、Runtime、codec、stream |
| `floor-source-identity` | collider digest 替换为 64 个 `0` | Repository、Runtime、codec、stream |
| `floor-calibration` | `calibrationId`→`calibration:tampered-v1`；CalibrationRecord 的 `axisMap[0..2]`、`rotation[0..3]`、`translation[0..2]`、`uniformScale`、`sourceBounds.min/max[0..2]`、`targetBounds.min/max[0..2]` 每个 leaf 分别变异 | Repository、Runtime、codec、stream |
| `floor-proxy-leaves` | `entityRef`→`entity:tampered`、`kind`→`sphere`、`center[0..2]`、`halfExtents[0..2]`、`topZ` 每项分别变异 | Repository、Runtime、codec、stream |
| `floor-derived-evidence` | `calibratedMinZ`、`measured`、`passed`（true→false）、`tolerance`（`0.000001`→`0.001001`）分别变异 | Repository、Runtime、codec、stream |

任何成员都不得仅把 UI `passed` 改成 false 后继续接受世界。

Composite scenario 使用同样的“全部成员执行”规则；下列 family 中每个 bullet 都是独立 test name，不是析取选择：

| family id | exact members（全部执行） | required fail-closed seams |
|---|---|---|
| `composite-scenario-relabel` | scenarioId 分别替换为 `scenario:primitive-box-free-fall-v1`、`scenario:diagnostic-rigid-free-fall-v1`、`scenario:ball-vessel-free-fall-v1`、`scenario:two-joint-planar-reach-v1` | Repository、Runtime、codec、stream |
| `composite-duplicate-ref` | floor.ref→`entity:environment`；generated.ref→`entity:floor`；environment.ref→`entity:generated-object` | Repository、Runtime、codec、stream |
| `composite-authored-lineage` | base.parentId→`snapshot:foreign`；edit.parentId→`snapshot:foreign` | Repository、Runtime、codec、stream |
| `composite-runtime-lineage` | Episode.baseSnapshotId→`snapshot:foreign`；terminal.parentId→`snapshot:foreign`；terminal.scenarioId→`scenario:primitive-box-free-fall-v1`；terminal generated ref→`entity:foreign`；Evaluation.episodeId→`episode:foreign` | Runtime result validation、codec、stream |
| `composite-current-ref-lineage` | current.name→`world:foreign`；current.version→`current.version + 2`；current.snapshotId→`snapshot:foreign` | Repository adopt/update、codec、stream client admission |
| `composite-environment-representation` | observation/visual 的 `assetId`→`asset:tampered`、`manifestDigest`→`sha256:`+64个`0`、`calibrationId`→`calibration:tampered-v1`、`witnessId`→`witness:tampered-v1`，每个 path 分别变异 | Repository、Runtime、codec、stream |
| `composite-floor-representation` | `witnessId`→`witness:tampered-v1`；collision.halfExtents[0] 加 `0.001` | Repository、Runtime、codec、stream |
| `composite-generated-representation` | visual 的 `assetId`→`asset:tampered`、`manifestDigest`→`sha256:`+64个`0`、`calibrationId`→`calibration:tampered-v1`、`witnessId`→`witness:tampered-v1`；collision.halfExtents[0] 加 `0.001` | Repository、Runtime、codec、stream |

不得用“generic guard 已存在”替代 composite fixture 的可执行 evidence。

### 4. Presentation 是可检查的，而不是装饰

Studio 在同一 Three.js scene 内呈现：

- Spark `SplatMesh` 加载真实 SPZ；
- `GLTFLoader` 加载真实 Hunyuan GLB；
- collider source / MuJoCo proxy overlay；
- Frame/Units/alignment overlay 与结构化数值；
- `3DGS / Mesh / Collision / Alignment` 独立开关；
- antialias、ACESFilmic tone mapping、environment/key/fill lighting 与 OrbitControls。

渲染质量改动只服务本场景的可读性，不引入新的 design system、后处理框架或通用 scene editor。

## In scope

1. 增加 provider artifact manifest、cache locator 与 fail-closed validator；只覆盖 Marble SPZ/collider 与 Hunyuan GLB 三种当前真实产物。
2. 增加 operator-side import 命令：从 Keychain 取 credential，查询既有 operation/job、刷新 signed URL、bounded 下载到临时文件，校验后原子放入 ignored cache。
3. 不在实现或测试中提交、打印或 snapshot credential/signed URL；不再次发起生成任务。
4. 增加一个封闭的 composite scenario 与稳定 EntityRef；用显式 calibration 将 SPZ、GLB、collider source 与 physics proxy 映射到同一 `Frame` / `Units`。
5. 扩展 Snapshot/Product Session codec 的 exact registered-scenario closure，拒绝 provider identity、digest、representation、calibration、proxy 或 scenario relabel drift。
6. 让 Gateway 只读提供已验证 artifact bytes，并具有 media type/size/digest recheck、cache miss、abort 与 traversal 的 bounded 行为；本切片不实现 Range。
7. 让 Studio 通过 Spark 呈现真实 SPZ、通过 GLTFLoader 呈现真实 GLB，并增加四类 diagnostic visibility toggle。
8. 增加 product-level renderer quality：antialias、ACES、基础 environment/key/fill light 与 OrbitControls，同时保留 reduced-motion/cleanup 边界。
9. 运行一次 generated object 在 composite world 中的 MuJoCo falling-object Episode；物理使用显式 proxy，run 不推进 current ref，Evaluation 可复算。
10. 保持 Agent model-facing surface 恰好为 `world_read/world_write/world_edit/world_run`；不新增 provider/file/import/adopt 第五工具。

## Non-goals

- 新的 Marble/Hunyuan 付费生成、批量资产生产、余额查询、模型选择器或 prompt UI；
- 通用 world-model Adapter SDK、provider plugin system、asset marketplace、云对象存储或数据库；
- 自动从视觉猜测 metric scale、ground plane、质量、惯量或可行走区域；
- 让 SPZ、GLB render mesh 或 provider collider 自动成为 MuJoCo authority；
- mesh simplification、convex decomposition、NavMesh、机器人抓取、VLM loop 或运动规划；
- 动态 3DGS、编辑 splat、LoD/streaming 性能平台、WebGPU 或照片级后处理；
- 修改 Lyaup、复制 Lyaup 的源码/schema/UI 文案；
- commit、push、merge、PR、tag、deploy 或新的生产/Discord mutation。

## Acceptance

1. **真实资产可见**：本地 import 完成后，Studio 显示既有 Marble canary 的真实 SPZ 场景，且不再以 diagnostic wedge 冒充本场景；同屏显示既有 Hunyuan canary GLB。
2. **稳定身份**：Hunyuan 物体获得稳定 EntityRef；Snapshot、Studio selection、Episode samples、TerminalSnapshot 与 Evaluation target 始终解析到同一 ref。
3. **Artifact closure**：Git manifest 是唯一 identity authority；三类 bytes 的 provider resource identity、media type、byte length、SHA-256 与 decoded bounds 闭合；import 与 serve/session-open 都重验；篡改、截断、错误 magic、oversize、signed URL 过期、cache miss 与 path traversal 均 fail closed，且不污染旧 valid cache。
4. **Frame/Units 对齐**：SPZ、GLB、collider source 与 physics proxy 只通过上述 exact `CalibrationRecord v1` 进入共同坐标系；signed axis basis、handedness、determinant、quaternion convention、translation、uniform scale、bounds 与 tolerance 均 finite、可见、可测试；mirror 或任一字段漂移 fail closed；人工标定显示 `AUTHORED / UNVERIFIED`，不得显示 world-truth PASS。
5. **Authority 分离**：SPZ/GLB 是 Observation/Presentation，provider collider 是 collision source，MuJoCo 只消费显式 proxy；任何 Presentation/provider failure 都不推进 ref、不篡改 Episode/Evaluation。
6. **可诊断 UI**：真实 Chromium 中 `3DGS / Mesh / Collision / Alignment` 四个独立 boolean 开关可组合工作且不触发重新下载；overlay 与 Inspector 显示 EntityRef、assetId、digest prefix、Frame、Units、bounds error、`INTEGRITY VERIFIED`、`CALIBRATION AUTHORED / UNVERIFIED` 与 `PROXY WITNESS PASS|FAIL`。
7. **产品级可读性**：renderer 使用 antialias 与 ACES，具有可复现的基础照明和 OrbitControls；resize、rapid toggle、scenario switch、late load 与 cleanup 不泄漏旧 SplatMesh/GLTF/controls。
8. **物理闭环**：一个 Hunyuan object 在 composite world 的显式 floor/proxy 上运行可回放 Episode，并得到 deterministic Evaluation；`run` 不推进 current ref，只有既有 explicit adopt control 能推进。
9. **Credential isolation**：Git diff、built bundle、HTTP event、logs、argv 与 task artifacts 中均不存在 credential 或 signed URL；authenticated query 禁止 redirect，download 无 credential 且 pin exact HTTPS host；浏览器 network 只请求 loopback same-origin asset route，不请求 provider/CDN/COS domain。
10. **Regression gates**：既有 primitive/imported/3DGS/vessel/articulated scenarios、Product Session、四工具与 OMP restricted surface保持；focused/full tests、typecheck、build、artifact validator、真实 Chromium、`git diff --check` 与 EXharness validation 全部通过。

## 实现阶段

### Phase 0 — Plan review gate

- 冻结本计划、相关架构文件与允许变更面 digest；
- 独立 reviewer 检查 scope、authority、credential、artifact lifecycle、Frame/Units、physics proxy 与可执行验收；
- P0/P1 或 `changes_requested` 未清零前不进入产品实现。
- Round 1 双审提出的 risk mode、calibration truth level、manifest/cache authority、serve revalidation、redirect isolation 与 proxy witness 必须在 Round 2 重新批准。
- Round 2 出现分歧：DeepSeek 批准，但 Sol 发现 CalibrationRecord 仍是概念级复用、witness 未冻结 exact binding/tamper schema；按更严格结论修订后，Round 3 双审必须共同批准才进入 Phase 1。
- Round 3 DeepSeek 批准，但 Sol 要求 authored-floor transform drift 与 composite duplicate-ref/foreign-lineage 成为独立 RED rows；已补齐并进入 Round 4 双审。
- Round 4 DeepSeek 批准，但 Sol 指出“任一/或”仍允许抽样；已改为冻结 mutation algorithm、exact replacements 与全部成员强制执行的 parameterized families，进入 Round 5 最终审查。
- Round 5 Sol 与 DeepSeek 均 `approved / may_implement=yes / P0=P1=P2=0`；Phase 0 关闭，进入 Phase 1 RED。

### Phase 1 — RED：artifact 与 scenario contract

- 先写 manifest/cache validator、serve-time digest recheck、credential/redirect isolation、registered scenario closure、axis/handedness/mirror drift、calibration truth level、source artifact↔proxy witness 与 asset route 的失败测试；
- 复用 fixture-sized bytes 测试，不把真实大资产复制进 unit test output。

### Phase 2 — Operator import 与 verified cache

- 实现上述 Keychain-only exact query/download contract；测试共享 deadline、host/redirect、byte budget、0600 temp/finally cleanup、one refresh、redaction、old-cache preservation、digest/magic/bounds 校验与 atomic rename；
- 对既有 Marble operation/world 与 Hunyuan JobId 执行只读 refresh + download，不发起新生成；
- 写入 digest-keyed ignored cache 与 non-secret candidate/import receipt；Runtime 不读取 receipt；验证 secret/signed URL 不落盘到 Git-scoped artifacts。

### Phase 3 — Composite Snapshot 与 MuJoCo

- 增加单一 registered composite fixture、EntityRef、CalibrationRecord 与 bounded physics proxy；
- 扩展 Repository/Runtime/Product codec exact closure；
- 完成 falling-object Program、Episode 与 Evaluation，并证明 representation 不改变 physics semantics。

### Phase 4 — Gateway asset route 与 Studio Presentation

- 增加 bounded same-origin verified asset route；
- 让 Spark/GLTFLoader 使用 manifest-backed loopback route；Vite dev proxy 只服务本地 acceptance，production deployment 仍是 non-goal；
- 每个 async load 使用 generation token + AbortController；scenario switch/unmount 后 late completion 不写 scene/evidence；释放 GLTF geometry/material/texture、SplatMesh、SparkRenderer 与 OrbitControls；
- 实现四个独立 boolean toggle、分层 alignment evidence、renderer quality、OrbitControls 与完整 disposal。

### Phase 5 — Product acceptance 与 independent cross-review

- 运行 focused/full tests、typecheck、build、artifact/secret scans、diff 与 harness gates；
- 启动 scripted Gateway/Studio，分别验收 empty-cache `not imported`（无 diagnostic fallback）与 imported 场景；真实 Chromium 核对三项 digest/assetId、四开关组合、provider-domain network 为零、Episode/Evaluation/ref、scenario switch 后无 stale resource，并截图/核验 console；
- 冻结 product digest，执行 independent implementation review；重大 authority/credential/codec 变更采用交叉审查；
- reviewer 未批准前不 closeout/mark-done；无新 Human authority 不 commit/push/merge。

## Exit condition

只有当真实 Marble SPZ、Marble collider source、Hunyuan GLB 与 MuJoCo proxy 在同一 registered Snapshot 中以显式 Frame/Units/Calibration 对齐，Studio 可见且可诊断，Episode/Evaluation 可执行并保持 Repository authority，同时 credential 与 provider transport 完全隔离时，DH-013 才能请求 closeout。
