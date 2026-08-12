# DH-011 计划：Articulated Entity 与显式动作程序 Vertical Slice

## 状态与 Authority

- Status：`plan_review`；两路 independent plan review 均批准前，不进入产品实现。
- Branch：`agent/codex/DH-011`。
- Worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-011`。
- Base：`06a2c392bbc2a001d1b31b3cde15b2eb3f9f6cca`（已合并 DH-010.1 的 `main`）。
- Human 已授权：创建独立 worktree/branch、登记 EXharness 节点、编写并交叉审查本计划；双审批准后，在本 worktree 内实现、验证并进行结果交叉审查。
- 当前未授权：真实 provider prompt、credential 使用、commit、push DH-011、PR、merge `main`、tag、deploy、发布 package 或访问真实设备。

## Goal

用一个可见、确定性、可评测的“两关节平面机械臂触达目标 Frame”任务，证明 Demiurges 的四工具不依赖机器人专用函数，也不只是固定 `fixtureId/programId` 菜单：

```text
read articulated topology, frames, limits and actuator ranges
+ edit initial joint state
+ run an explicit bounded actuator sequence
→ immutable action-conditioned Episode
+ terminal Snapshot
+ deterministic reach EvaluationRecord
```

本切片的本质不是“增加一个机械臂模型”，而是建立第一条真正的控制语义：Agent 读取世界中已有的稳定引用，提交一段显式 `WorldProgram`，Runtime 展开动作与时间，Episode 留下动作、关节状态和终态证据。

## 第一性原则与最小边界

### 1. 四工具数量保持不变

model-facing surface 仍然只有：

```text
read / write / edit / run
```

不得新增 `move_arm`、`set_joint`、`reach_target`、`grasp` 或其他机器人专用第五工具。机器人能力必须来自四工具参数与世界中可读取的结构，而不是来自工具名称。

### 2. Articulated Entity 是一个 Entity，不是一袋 MuJoCo objects

机械臂在 Snapshot、Repository ref、Product Session、selection、Episode 与 Evaluation 中只有一个 authoritative `EntityRef`：`entity:arm`。link、joint、actuator、sensor 与 frame 是这个 Entity 内可寻址的 articulated representation/state component，不自动升级为顶层 Entity。

稳定引用使用 Harness-owned namespace，例如：

- `link:arm-base`、`link:arm-upper`、`link:arm-forearm`；
- `joint:arm-shoulder`、`joint:arm-elbow`；
- `actuator:arm-shoulder-position`、`actuator:arm-elbow-position`；
- `sensor:arm-shoulder-position`、`sensor:arm-shoulder-velocity`、`sensor:arm-elbow-position`、`sensor:arm-elbow-velocity`；
- `frame:arm-base`、`frame:arm-elbow`、`frame:arm-tool`、`frame:reach-target`。

MuJoCo `body id`、`joint id`、`actuator id`、`sensor id`、array index、name table offset 与 raw `mjData` memory offset 始终是 Runtime 内部实现细节，不得成为上述稳定引用，也不得进入 Product Session、Agent trace 或 Presentation authority。

### 3. 不改变不可约记录集合，只增加第二个真实任务所需的 closed variants

`Snapshot`、`Entity`、`WorldProgram`、`Episode`、`EvaluationRecord`、`Artifact` 与 `Ref` 仍是不可约记录。允许为 articulated topology/state、actuator program 和 reach evaluation 增加有界 discriminated variants；禁止引入通用 robotics SDK、任意 component graph、plugin registry 或开放 MJCF authoring。

Geometry roadmap 中“导入 articulated fixture 不需要修改 Kernel record”的含义冻结为：不增加 `RobotSnapshot`、`JointEntity`、`ActuatorEntity` 等平行不可约记录，不改变 Entity 的 authority/identity 规则；允许在既有 Entity representation 与 Entity state 内增加 articulated closed variant。

### 4. `edit` 继续只改变静态描述

`edit` model-facing input 的 exact shape 固定为 `{expected,targetRef,change}`；`change` 只能是以下两个 closed variant，不接受顶层 legacy `frameRef/pose`：

```ts
type PoseEditChange = {
  kind: "pose";
  frameRef: "frame:world";
  pose: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
  };
};

type JointStateEditChange = {
  kind: "joint-state";
  joints: [
    {
      jointRef: "joint:arm-shoulder";
      positionRadians: number;
      velocityRadiansPerSecond: number;
    },
    {
      jointRef: "joint:arm-elbow";
      positionRadians: number;
      velocityRadiansPerSecond: number;
    },
  ];
};
```

`pose` 保留现有 rigid Entity pose 编辑；`joint-state` 只修改 `entity:arm` 的初始 joint position/velocity，并产生 child Snapshot。joint array 必须恰好两项且按 fixture joint registry 顺序；position 必须在对应 semantic joint limit 内，`velocityRadiansPerSecond` 在 DH-011 必须逐字为 `0`。这仍允许 Agent 选择任意合法初始关节构型，但不把高速 limit-impact/constraint solver 偷渡进第一个 control slice；非零初速度是后续独立能力。所有 object 都要求 exact enumerable own data properties、plain prototype、无 symbol/accessor/extra field；array 必须 dense、exact length，不能 sparse。

`joint-state` edit 不能产生 Episode、虚构控制历史或直接修改 Runtime terminal。旧的 pose-only input 一次性迁移到 discriminated shape，不保留第二条 legacy parser 或 compatibility flag。

Host-owned scenario admission matrix 是单一事实面，`world_write`、`edit`、`run`、Repository 与 codec 都从它消费：

| fixtureId | scenarioId | 允许 edit | 允许 Program |
|---|---|---|---|
| `fixture:primitive-box` | `scenario:primitive-box-free-fall-v1` | `entity:cube + pose` | `free-fall(entity:cube,2.5s,30Hz)` |
| `fixture:diagnostic-wedge-v1` | `scenario:diagnostic-rigid-free-fall-v1` | `entity:cube + pose` | `free-fall(entity:cube,2.5s,30Hz)` |
| `fixture:ball-vessel-v1` | `scenario:ball-vessel-free-fall-v1` | `entity:ball + pose` | `free-fall(entity:ball,3s,30Hz)` |
| `fixture:two-joint-planar-reach-v1` | `scenario:two-joint-planar-reach-v1` | `entity:arm + joint-state` | `actuator-sequence(entity:arm,0.5..5s,30Hz)` |

矩阵之外的 targetRef/change.kind/program.kind/duration/sample rate 组合全部拒绝。`entity:target` 是固定 goal marker，不能被 pose edit；articulated scenario 不接受 free-fall，前三个 rigid scenario 不接受 actuator-sequence。`fixtureId` 只用于 `world_write` admission，不作为 Snapshot 中可伪造的 scenario authority；写入后由 exact registry 验证的 `scenarioId` 接续 lineage。

### 5. `run` 接收显式 WorldProgram，而不是机器人专用预制程序

`run` 的 model-facing input 从 `{runId, programId}` 演进为 `{runId, program}`。本切片只支持两个 closed program variants：

1. `free-fall`：exact plain-data shape 为
   `{kind:"free-fall",targetRef,durationSeconds,sampleRateHz}`，其中 `targetRef` 是 scenario registry 指定的 dynamic EntityRef，seconds/Hz 均为 SI；
2. `actuator-sequence`：exact plain-data shape 固定为：

```ts
type ActuatorSequenceProgramContent = {
  kind: "actuator-sequence";
  targetRef: "entity:arm";
  durationSeconds: number;
  sampleRateHz: 30;
  steps: Array<{
    timeSeconds: number;
    commands: [
      {
        actuatorRef: "actuator:arm-shoulder-position";
        valueRadians: number;
      },
      {
        actuatorRef: "actuator:arm-elbow-position";
        valueRadians: number;
      },
    ];
  }>;
};
```

Program、step、command 的 object 都使用 exact plain-data 规则；`steps` 与 `commands` 都是 dense array。每个 step 必须恰好两个 command，并按 actuator registry 的 shoulder/elbow 顺序；`valueRadians` 是 position actuator 的 SI radian target，不允许无单位 `value`、torque、velocity 或 alias 字段。`free-fall` 与 `actuator-sequence` 都至少一个真实 scenario consumer；不新增第三个开放 variant。

两个 variant 必须进入同一个 admission/canonicalization 路径。`free-fall` 不得在 Host 内保留按旧 `programId` 选择常量的第二条暗路；Host 只根据 current fixture/scenario 验证其 target、duration 与 sample rate 是否属于该 scenario 的受信 closed contract。

Program admission 固定为：descriptor-safe plain-data projection → exact discriminated validation → recursively frozen canonical content → `canonicalJsonBytes` → SHA-256。`canonicalJsonBytes` 是 repo-owned 单一函数：array 保持已验证顺序；object key 在每一层按 UTF-16 code unit 升序排列；不输出 whitespace；string/finite IEEE-754 number/null/boolean 使用 ECMAScript `JSON.stringify` token encoding；拒绝 `-0`、非 finite、lone surrogate 与 schema 外 value，且不得预先 round number。UTF-8 使用无 BOM 的 `TextEncoder`。同一函数由 Host、Repository、codec 与 Node/V8 probe 消费，禁止各写一份 stringify helper。

digest 输入只包含不带 `id` 的 admitted content，避免自引用；Host 再附加固定 ID `program:sha256:<64 lowercase hex>`。Agent 不提供 ID。Kernel `Episode` 用完整 frozen `program` 替换 detached `programId` 字段，`program.id` 必须与 canonical content digest 一致，Episode identity 同时绑定 base Snapshot、ExplicitInputs 与 Program digest。Product transport、Repository record 与 codec 都保留并复算完整 Program evidence，不能只留下一个无法复核的字符串。

跨引擎 golden vectors 固定为：

```text
{"durationSeconds":2.5,"kind":"free-fall","sampleRateHz":30,"targetRef":"entity:cube"}
sha256:b69c174f5e7e2c3e2da941cb21fc0a7437d64314eaa70250d22e4512fd6c0caf

{"durationSeconds":3,"kind":"actuator-sequence","sampleRateHz":30,"steps":[{"commands":[{"actuatorRef":"actuator:arm-shoulder-position","valueRadians":0.35},{"actuatorRef":"actuator:arm-elbow-position","valueRadians":-0.35}],"timeSeconds":0},{"commands":[{"actuatorRef":"actuator:arm-shoulder-position","valueRadians":0.65},{"actuatorRef":"actuator:arm-elbow-position","valueRadians":-1}],"timeSeconds":0.5}],"targetRef":"entity:arm"}
sha256:a8544a063f5993e976a80d10448890c7a57579d2824ae73ea74bdcf38ab53b55
```

“registered Program”不表示预注册整段 command sequence。Host-owned scenario registry 的稳定 ID 固定为 `scenario:primitive-box-free-fall-v1`、`scenario:diagnostic-rigid-free-fall-v1`、`scenario:ball-vessel-free-fall-v1` 与 `scenario:two-joint-planar-reach-v1`。`world_write` 从 exact fixture registry 创建 Snapshot 时写入 `snapshot.scenarioId`；Agent 不能提供或修改它。`edit` child 与 Runtime terminal 必须逐字继承同一个 `scenarioId`，Repository/codec 同时验证该 ID 与对应 scenario 的不可编辑 topology/representation/physics invariant，不能只信字符串；允许变化的字段仅限该 scenario 明列的 pose 或 joint-state edit surface。因此 scenario identity 可跨 child Snapshot 保持，却不能由 EntityRef 猜测或 detached fixture alias 伪造。

Program kind 与 base Snapshot 的受信 `scenarioId` 相容、经 Host admission 得到 canonical digest，并与 completed Episode 一起由同一 Runtime evidence authority 记录时，才是 registered。Episode 必须 exact 保存 `scenarioId`，Repository 记录键绑定 `scenarioId + baseSnapshotId + program.id + runId`；codec 复核 base/terminal/current lineage 中 scenarioId 一致。AdoptPolicy registry 按受信 `(scenarioId, program.kind, evaluatorId, contractId)` 选择，而不是按 content-derived Program ID 建白名单；任意合法 actuator sequence 只要产生 completed + passed 的受信 Episode都能使用同一 reach policy。未被 Repository evidence authority 记录的 Episode/Program、digest/content 不一致、unknown kind、scenario mismatch 或 evaluator/contract mismatch 都是“unregistered”，不能 adopt。

#### Action clock（唯一时序语义）

- articulated profile 固定 `timestepSeconds = 1/240`，Program 固定 `sampleRateHz = 30`；`durationSeconds × 240` 与 `durationSeconds × 30` 都必须是安全整数；
- `steps[0].timeSeconds` 必须为 `0`，其余 step 严格递增；每个 step 必须落在 30Hz sample grid，且 `0 <= timeSeconds < durationSeconds`，terminal time 不接受新 step；
- 每个 step 必须恰好包含 fixture 中两个 actuatorRef 各一次；缺失、额外、重复或不同顺序产生 alias 的输入都拒绝。command array canonical order 固定按 fixture actuator registry 顺序；
- command 采用 zero-order hold。唯一 execution loop 使用整数 `physicsTick`，不得另写 sample loop：

```text
durationTicks = durationSeconds * 240
sampleStrideTicks = 240 / 30  // 8
heldCommands = none
for physicsTick = 0 .. durationTicks inclusive:
  if a step is scheduled at physicsTick:
    atomically replace heldCommands with that exact two-command set
  write heldCommands to mjData.ctrl
  mj_forward(model, data)
  if physicsTick % sampleStrideTicks == 0:
    record exactly one sample at physicsTick / 240
  if physicsTick == durationTicks:
    break
  mj_step(model, data)
```

canonical 3-second run 因而恰好调用 `mj_step` 720 次、`mj_forward` 721 次并记录 91 个 sample；terminal sample 记录后立即 break，绝不执行第 721 次 `mj_step`。step 只可能落在 8-tick sample boundary，所以 command 先应用、再 forward、再被同 timestamp sample 观察；其后到下一 step 前保持不变；
- sample grid 是闭区间 `[0,durationSeconds]`，sample count 固定为 `durationSeconds × 30 + 1`。terminal sample 位于 duration，携带最后一组 held commands；Episode terminal Snapshot 必须与 terminal sample articulated state 一致；
- step/physics/sample timestamp 全部从整数 tick 派生，不能累计浮点时间，也不能用 epsilon 猜测边界。

`actuator-sequence` admission 还要求 `0.5 <= durationSeconds <= 5`，因此 reach evaluator 总有完整 16-sample settle window；不足 0.5 秒在 run admission 阶段直接拒绝，不产生 completed Episode。最多 `16` steps、每 step 恰好 `2` commands。`WORLD_TOOL_CONTRACT` 改为 per-tool budget 单一事实面：read/write/edit 保持既有 `maxNodes=128,maxDepth=6,maxStringLength=512`，仅 run 为 `maxNodes=256,maxDepth=8,maxStringLength=512`；Gateway 根据被调用工具读取对应 budget，不能把 run 上限变成全局放宽。UTF-8 body 仍服从 Gateway 既有 `16,384 bytes` 上限。Phase 1 的 RED 必须覆盖第 `17` step、第三 command、缺失 command、非 sample-grid 时间、terminal-time step、少于 0.5 秒、terminal 后 extra `mj_step` 与以上 action-clock tamper。

Runtime 在仿真前验证每个 actuatorRef 属于 target Entity、command 落在声明 control range、step 无重复 actuatorRef、时间闭合且 fixture/program kind 匹配。任何未知 ref、alias、越界、乱序、重复、sparse/accessor/non-finite 或额外字段都 fail closed，不做 clamp、normalize 或 best effort。

### 6. Evaluation authority 仍由 Host 派生

Agent 只能提交动作，不能提交 evaluator、Success Contract、target Frame、tolerance 或 AdoptPolicy。Host 根据受信 articulated fixture/scenario 派生：

- `success:end-effector-reaches-frame`；
- target Entity/Frame；
- position tolerance；
- settle window、最大关节速度或 tool-frame speed；
- 对应 evaluator 与 AdoptPolicy。

`run` 仍不推进 current ref；只有已登记 policy、completed Episode 和 passed Evaluation 才能由独立 Harness control 执行 adopt。

Reach evaluator 的唯一证据路径固定如下：

1. base Snapshot 的 `entity:arm` articulated registry 提供 immutable topology、root frame 与 link local geometry；base Snapshot 的 `entity:target` state + semantic local frame 提供唯一 `frame:reach-target` world pose；
2. Runtime sample 从 MuJoCo `qpos/qvel` 经 private mapping 还原 exact `jointRef → {positionRadians, velocityRadiansPerSecond}`。sensor inventory 固定恰好四个 scalar observation，registry 顺序为 shoulder-position、shoulder-velocity、elbow-position、elbow-velocity；每个 sample 按该顺序记录 `{sensorRef,value}`，position 单位 `rad`、velocity 单位 `rad/s`。每个 sensor value 必须在 `1e-9` 内等于对应 mapped joint state；sensor 只闭合 loaded-model observation，不提升为 evaluator authority；
3. evaluator 使用 repo-owned articulated registry 与 sample joint state执行唯一 deterministic forward kinematics，重算 `frame:arm-tool` world position；Episode 不存第二份 authoritative tool-frame pose；
4. position error 只使用三维 Euclidean norm；stability 只使用两个 joint velocity 的最大绝对值。settle window 固定为 terminal 前 `0.5s`、30Hz 闭区间共 `16` samples；每个 sample 都必须满足 error `<= 0.02m` 且 max joint speed `<= 0.02rad/s`；
5. base Snapshot、全部 samples 与 TerminalSnapshot 中 `entity:arm` fixed root pose、`entity:target` pose、goal frame local pose及 articulated topology/physics 必须 exact 不变；任何漂移由 Runtime/codec fail closed。

## Diagnostic world

使用 repo-owned、确定性的最小 fixture：

- `entity:floor`：static floor；
- `entity:arm`：固定基座的两转动关节平面机械臂；
- `entity:target`：无动力、可见、可寻址的目标标记，拥有 `frame:reach-target`；
- exact owner table：arm owns `link:arm-base|arm-upper|arm-forearm`、两个 joint、两个 actuator、四个 sensor 及 `frame:arm-base|arm-elbow|arm-tool`；target owns `frame:reach-target`；floor 不拥有 articulated sub-ref；
- arm root world pose 固定为 position `[0,0,0.75]m`、identity quaternion `[0,0,0,1]`。`link:arm-base` fixed body local pose 是 identity；活动平面为 world XY，两个 hinge axis 在各 joint local frame 都是 `[0,0,1]`；zero configuration 时 upper 与 forearm 都沿 parent local `+X`；
- shoulder joint anchor 是 base local `[0,0,0]m`；upper body local pose 是该 anchor 上的 identity。elbow joint anchor 是 upper local `[0.55,0,0]m`；forearm body local pose 是该 anchor 上的 identity。`frame:arm-elbow` 位于 upper local `[0.55,0,0]m`，`frame:arm-tool` 位于 forearm local `[0.45,0,0]m`，两者 local rotation 都是 identity；
- upper/forearm 的 joint-center link lengths 固定 `0.55m / 0.45m`，capsule radius 均为 `0.05m`。capsule 使用 local `fromto` medial endpoints：upper `[0.05,0,0]→[0.50,0,0]`、forearm `[0.05,0,0]→[0.40,0,0]`，所以含半球端帽的总长恰好为 link length，不允许把 `fromto` segment length 误当总长；每个 moving link 恰好一个 collision/visual capsule；
- upper/forearm mass 固定 `1.2kg / 0.8kg`。explicit inertial local pose 分别为 position `[0.275,0,0]m / [0.225,0,0]m`、identity rotation；diagonal inertia 固定 `[0.003,0.035,0.035]kg·m² / [0.002,0.015,0.015]kg·m²`，products of inertia 全为 `0`；不得依赖 geometry inference、balanceinertia 或 inertia defaults；
- shoulder/elbow semantic joint limits 固定 `[-1.57,1.57]rad / [-2.2,2.2]rad`，initial position/velocity 都是 `0`。Host 在 edit/run admission 检查 initial position 与 command，Runtime 在每个 physics tick 检查 qpos；任何越界立即 fail closed，不产生 completed Episode。为使本 slice 的 accepted trajectory 保持无 constraint 的 deterministic piecewise-smooth dynamics，MJCF joint 固定 `limited=false`，不创建 joint-limit constraint；damping 固定 `1.2 / 0.9 N·m·s/rad`，`frictionloss=0`、armature=`0`、stiffness=`0`、ref/springref=`0`。semantic limit 仍由 Harness authority 真实执行，不能 clamp 或依赖 MuJoCo limit softness；compiler `autolimits=false`；
- 两个 position actuator 都是 joint transmission，`gear=[1,0,0,0,0,0]`，actuator `group=0`，`ctrllimited=true`、`forcelimited=true`、`dyntype=none`、`gaintype=fixed`、`biastype=affine`。shoulder/elbow 的 effective `gainprm[0]=kp` 固定 `40 / 32`，`biasprm=[0,-kp,-kv]` 且 `kv` 固定 `4 / 3.2 N·m·s/rad`，其余 gain/bias params 为 `0`；control range 与 joint limit 相同，force range固定 `[-30,30]N·m / [-20,20]N·m`。因此 `valueRadians` 通过 gear=1 唯一解释为 joint position target，force range 唯一解释为 joint torque；loaded readback 要求两个 actuator group 都 exact 为 0；
- sensor inventory 恰好四个：`jointpos(shoulder)`、`jointvel(shoulder)`、`jointpos(elbow)`、`jointvel(elbow)`，分别映射四个 frozen sensorRef，scalar dimension 均为 1，registry/load order 与前述顺序一致；
- `entity:target` world pose 固定为 canonical target position 与 identity rotation，physics bodyType=`static`、massKg=`0`；visual 是 radius `0.04m` sphere，collision 使用显式 closed representation `{kind:"none"}`，semantic goal frame local pose是 identity。它是可见、可寻址但不参与物理接触的目标，不允许把 visual sphere 偷编译为 MuJoCo collision geom，也不允许依赖 contact penetration 达到 `0.02m` tolerance。floor 保持既有 canonical static representation/physics；
- articulated MJCF 的 contact policy 显式关闭 arm 自碰撞：两个 arm capsule 都固定 `contype=0,conaffinity=0,condim=1,friction="0 0 0",margin=0,gap=0`；target 没有 geom；floor 保持独立 static geom但与 arm 不形成 contact pair。因本 task 无接触，禁止通过 `solref/solimp` 或软穿透影响 canonical trajectory。compiled model 必须 exact readback geom contact masks 且没有 explicit contact pair；Runtime 在全部 `721` 次 `mj_forward` 后逐次断言 `mjData.ncon === 0` 且 constraint row count `mjData.nefc === 0`。`nconmax` 只是容量，不作为零接触证据；
- articulated RuntimeProfile/MJCF option 固定为 MuJoCo `3.11.0`、`timestep=1/240`、`gravity="0 0 -9.81"`、`wind="0 0 0"`、`density=0`、`viscosity=0`、`integrator="RK4"`、`solver="Newton"`、`iterations=100`、`tolerance=1e-12`、`jacobian="dense"`、`cone="pyramidal"`、`impratio=1`；compiler 固定 `angle="radian"`、`autolimits="false"`、`balanceinertia="false"`、`alignfree="false"`。loaded `disableflags=0`、`enableflags=0` 与 `disableactuator=0` 是 exact expected values；两个 `group=0` actuator 都不能被 mask 关闭。actuation、passive damping、gravity 与 sensors enabled，所有 optional enable flags disabled。由于 `limited=false`、`frictionloss=0`、contact masks 为零且 Runtime 要求 `ncon=0`，accepted run 不产生 joint-limit、frictionloss 或 contact constraint；ZOH command 切换与 finite actuator force limits 使 dynamics 准确描述为 deterministic piecewise-smooth，而非全程 smooth。若任何 constraint 数量/active constraint 非零，Runtime fail closed，不产生 completed Episode。证据分两层：repo-owned canonical MJCF generator 的 exact output/golden hash 与 parser/source assertions证明 compile-time directives；loaded `mjModel` readback 证明可观测的 compiled options/flags（包括 `disableactuator`）、actuator groups、arrays、mapping、contact masks 与 counts；Runtime 逐 tick 证明无 constraint/contact、actuation未被禁用与 semantic limits未越界。不得声称从 compiled model 唯一反推出 compiler source，也不能继承全局 MuJoCo defaults；
- entire loaded canonical MJCF exact counts 固定为：`nbody=5`（含 world、arm-base、upper、forearm、target；target body 只承载 site）、`njnt=2`、`nq=2`、`nv=2`、`nu=2`、`na=0`、`nmocap=0`、`nuserdata=0`、`nplugin=0`、`nsensor=4`、`nsensordata=4`、`ngeom=3`（floor、两个 non-contact capsule）、`nsite=4`（arm-base、arm-elbow、arm-tool、reach-target）。不得出现 activation/mocap/userdata/plugin state、free joint、target geom、额外 body/geom/site、hidden actuator、contact pair 或 plugin sensor。

canonical target 由 frozen final joint target `shoulder=0.65rad, elbow=-1.0rad` 的同一 forward kinematics 得到，world pose 固定为 position `[0.8605638099833013,0.17854850979986867,0.75]m`、identity rotation。canonical Program 固定 `durationSeconds=3`，共 `91` samples，含两个 step：`t=0` command `[0.35,-0.35]rad`，`t=0.5` command `[0.65,-1.0]rad`。这确保非零双关节与真实 multi-step action clock 都参与 PASS；若第一次实现证据表明上述显式动力学无法在 frozen tolerance 内 settle，必须把失败当作计划事实重新审查，不允许 silent tuning。

Runtime admission 必须分别验证 canonical MJCF source/generator hash 与 loaded-model readback。loaded readback exact 覆盖 option/flags/disableactuator、root/body/joint/inertial/geom/site transform、mass/inertia、joint flags/axis/limits/damping/friction/armature/stiffness、actuator group/transmission/gear/dyn/gain/bias/control/force、contact-disable attributes、sensor owner/type/order/dimension与 entire-model exact counts；source gate exact 覆盖 compiler directives和所有 emitted attributes。对每一个会改变动力学或 FK 的 frozen 参数族至少有单参数 drift negative；gear、actuator group/disable mask、COM pose、capsule endpoint、target hidden geom/contact、integrator/timestep、sensor count/order、terminal extra step 必须各有独立 executable negative。

每次 `run` 必须在 validated compiled model 上构造全新的 `MjData`，禁止跨 run 复用。初始化顺序固定为：fresh data → `mj_resetData` → `time=0` → 从 base Snapshot 写 exact qpos 与 zero qvel → 写 current held ctrl → `mj_forward`。模型已保证 `na=nmocap=nuserdata=nplugin=0`；在首次 forward 前以及全部 721 个 forward/step boundary，Runtime exact 断言 `qfrc_applied[0..nv)=0` 与每个 body 的 `xfrc_applied[0..6*nbody)=0`，并断言 `disableactuator=0`。任何非零 applied force、残留 time/qvel/ctrl、复用污染 data 或 actuator mask 漂移都在产生 sample/completed Episode 前 fail closed。negative tests 必须注入单个非零 qfrc、xfrc、disableactuator bit 与 reused-data time/qvel，证明拒绝而非产生第二条 trajectory。

Runtime ownership 同样是 contract：每个 articulated run 从 canonical MJCF 在 Runtime-private critical section 中构造 private `MjModel` + fresh `MjData`；两者引用不进入 Host callback、Repository、Agent、Presentation 或全局 cache，也不与并发 run 共享。从 model compile/readback validation 开始到 final causal-field revalidation、Episode freeze 和 native object disposal 结束之间，不执行 `await`、event dispatch、user callback 或任何可重入 hook。MuJoCo 允许影响 dynamics 的全局 callback surface（至少 `mjcb_control`、`mjcb_passive`、`mjcb_act_dyn`、`mjcb_act_gain`、`mjcb_act_bias`）在进入 critical section 前必须由 Runtime adapter exact 验证为 null/disabled，并在每次 forward/step 前后与退出时重复验证；本 slice 不注册任何 MuJoCo callback。若当前 WASM binding 无法 introspect/独占这些 callback，就不执行 articulated run，而不是假定安全。

loaded model causal fields 在首次 sample 前生成 repo-owned exact `modelCausalDigest`，覆盖前述所有 option/flag/body/joint/inertial/geom/actuator/sensor/mapping/count fields；每次 forward/step boundary 至少重验 callback-null、model identity 与 immutable adapter ownership，terminal sample 后在产生 Episode 前重新计算完整 digest并要求 exact 相等。validation 后修改 mass/inertia/damping/option/gain/bias/gear/range/actuator group 或替换 model reference 都 fail closed。negative tests 必须在 validation 后注入 `mjcb_control`、`mjcb_passive`、一个 actuator callback、一个 model causal field mutation 与 shared-model replacement，证明全部在第一个 sample或completed Episode前拒绝。

第一条 articulated task 只要求触达，不抓取、不推动物体。这样可以先验证 action-conditioned evolution、关节状态和 frame evidence，而不把 grasp/contact/planning 的多个问题揉进同一切片。

## Kernel 与 Runtime evidence

### Articulated representation

新增 closed articulated representation/state 至少表达：

- root frame；
- links 的 stable ref、parent relation、local transform 与 visual/collision mapping；
- joints 的 stable ref、parent/child link、type、axis、limits 与 units；
- actuators 的 stable ref、jointRef、control mode、range 与 units；
- 四个 sensors 的 stable ref、sourceRef、measurement kind、registry order 与 units；
- joint position/velocity 的 initial、sample 与 terminal state。

不要建立任意 scene graph DSL；fixture 的 exact topology 由 repo-owned registry/compiler 验证。现有 rigid Entity 必须继续使用原有轻量 representation/state，不为它们制造空 links/joints arrays。

### Episode evidence

每个 articulated Episode sample 至少闭合：

- timestamp；
- root Entity state；
- exact joint position/velocity set；
- 当时生效的 exact actuator command evidence；
- exact 四项 joint position/velocity sensor measurements，顺序与 registry 一致；
- 不存 authoritative tool-frame pose；Evaluator 与 codec 必须用受信 topology + joint state 走同一 forward-kinematics function 重算。

Product codec 必须复核 Program digest/content、action clock、base Snapshot、sample joint/sensor/command、fixed arm/target state、terminal Snapshot、forward kinematics 与 Evaluation 之间的 exact ref/topology/units/command closure。Presentation 计算出来的 link transform 不能反向成为 Episode 或 Snapshot state。

### MuJoCo mapping

MuJoCo compiler 建立 Runtime-private stable-ref mapping，并验证模型中 exact body/joint/actuator/sensor 数量与 owner。缺失、重复、调换、axis/limit/control-range 漂移、错误 owner 或额外隐藏 actuator 都 fail closed。Runtime 输出必须从 mapping 还原 Harness refs，不能输出 raw MuJoCo IDs。

## Evaluation contract

新增 `success:end-effector-reaches-frame`，冻结：

- `targetRef = entity:arm`；
- `toolFrameRef = frame:arm-tool`；
- `goalFrameRef = frame:reach-target`；
- terminal 前连续 `0.5s / 16 samples` settle window；
- 每个 window sample 的三维 Euclidean tool-frame position error，threshold `0.02m`；
- 每个 window sample 的两个 joint speed 最大绝对值，threshold `0.02rad/s`；
- finite state、完整 sample grid 与明确 numeric tolerance。

PASS 必须来自 Episode articulated state 与受信 forward kinematics/Runtime evidence，不能来自 Three.js transform、canvas pixels、Agent narration 或“命令值看起来正确”。

至少有以下 adversarial controls：

1. 只改 Evaluation `passed/metrics`、只改 target/tool FrameRef 或只改 Program command 后，Product codec 拒绝；
2. terminal 单帧碰巧在 tolerance 内、但 settle window 内仍高速运动时 FAIL；
3. actuatorRef 交换、未知/重复、control 越界、step 乱序/重复/缺失、Program 与 fixture 错配时 fail closed；
4. joint state 缺失/额外/alias、joint limit 越界、sensor owner 错误、MuJoCo ID 泄漏时 fail closed；
5. Presentation link transform 被篡改不能改变 Snapshot/Episode/Evaluation authority；
6. `run` 完成后 current ref 不变，explicit adopt 后才推进；failed Evaluation、错误 policy 或未登记 Program 不能 adopt。
7. 同一 base/Runtime/Program 重跑必须达到 RuntimeProfile 声明的 numeric equivalence；只改变第二个 step 的一个 command 时 Program digest 必须改变，并在 `t>=0.5` 后产生对应 joint trajectory 与 terminal 差异，`t<0.5` 的 samples 保持 numeric equivalent。

`runtime:mujoco-wasm-single-3.11.0` 的 articulated numeric equivalence 固定为逐 sample、同 index/ref/order 比较：两次 run 的 timestamp 与 discrete refs/commands 必须 exact 相等；两个 joint 的 qpos、qvel、四个 sensor value 以及 TerminalSnapshot articulated qpos/qvel 使用 `abs(a-b) <= 1e-12 + 1e-12 * max(abs(a),abs(b))`。比较前仍要求 finite，`-0` canonicalize 为 `0`；不允许以 Evaluation threshold 代替 trajectory equivalence。跨 Bun/Node transport 对已 canonicalized Episode/Evaluation 使用 exact plain-data equality。

paired causal control 固定把 canonical 第二 step 的 shoulder command 从 `0.65` 改为 `0.55rad`，其余输入 exact 不变；`t<0.5` samples 必须满足上述 equivalence，`t>=0.5` 至少一个 shoulder qpos sample 差异 `>1e-6rad` 且 terminal tool-position Euclidean difference `>1e-6m`。negative tests 分别把 qpos、qvel、sensor 与 terminal 值改为刚好超过 `1e-12 + 1e-12*scale` 并要求 verifier 拒绝。

## In scope

1. 增加 repo-owned 两关节 articulated fixture 与精确 topology/units/frame registry。
2. 为 Entity representation/state 增加最小 articulated closed variant，不新增平行 Kernel record。
3. 将 `edit` 演进为 pose/joint-state discriminated change，保持静态/动态分离。
4. 将 `run` 演进为显式 `WorldProgram` input；保留 free-fall 与 actuator-sequence 两个真实 program variants，不保留 `programId` legacy parser。
5. MuJoCo Runtime 编译并执行固定基座、两个 hinge joints、两个 position actuators 与 joint sensors。
6. Episode 记录 action-conditioned joint/command/frame evidence，TerminalSnapshot 闭合 articulated state。
7. 增加 end-effector reach Success Contract、Evaluation 与受信 AdoptPolicy。
8. 扩展 `WORLD_TOOL_CONTRACT`、Host parser、OMP schema、Gateway pre-admission、Product Session codec 与 JSON-safe budgets 的单一事实面。
9. Studio 呈现 link hierarchy、joint/actuator/sensor refs、tool/target frames、Episode playback 与 PASS/FAIL；Three.js 仍只是 Presentation。
10. 增加 deterministic scripted four-tool flow，证明 read 后提交显式 actuator sequence 可以完成任务；不发送真实模型 prompt。
11. 保持 DH-001～010.1 的 rigid/vessel/3DGS/Spark/Agent/Repository/adopt/transport regressions。

## Non-goals

- 抓取、夹爪、接触操纵、逆运动学求解器、OMPL/Mink、轨迹优化或自动 task planner；
- 任意 URDF/MJCF/USD/SDF 上传、网络 URL、asset marketplace 或通用机器人 importer；
- 通用 robotics Adapter SDK、hardware abstraction、ROS、真实设备或控制频率/安全认证；
- arbitrary torque/force controller、闭环 policy callback、在线 VLM loop 或模型生成代码；
- world-model provider、视频预测、latent state、shadow Runtime 或 branching rollout；
- 任意 frame graph、任意 component schema、plugin system、第五个 world tool；
- 3DGS 新能力或 UI redesign；只保持既有 Observation/Presentation 不回归；
- 真实 provider prompt、commit/push、PR、merge、tag、deploy 或 package release，除非 Human 后续单独授权。

## Acceptance

1. **Stable articulated identity**：机械臂在 Snapshot、Repository、Product Session、selection、Episode、TerminalSnapshot 与 Evaluation 中始终只有一个顶层 `EntityRef`；link/joint/actuator/sensor/frame refs 稳定且 exact，MuJoCo/Three object identity 不泄漏。
2. **Readable control affordance**：`world_read` 返回足以构造合法动作的 topology、joint axis/limits、actuator range/units、initial state、tool frame 与 target frame；Agent 不需要预先硬编码机器人专用函数。
3. **Static/dynamic separation**：`world_edit(change.kind=joint-state)` 只产生 child Snapshot；`world_run` 才产生带时间与 command evidence 的 Episode；二者不能互相伪装。
4. **Explicit action program**：`world_run` 消费有界 plain-data `WorldProgram`，Program identity/content 与 Episode 闭合；不再接受裸 `programId`，未知/alias/extra/sparse/accessor/non-finite/越界/乱序/重复输入 fail closed。
5. **Four-tool breadth**：同一 restricted OMP surface 仍恰好暴露四工具，并可表达原 free-fall、ball-vessel 与新 articulated reach；不得出现 robot-specific fifth tool 或 ambient tool。
6. **Real articulated physics**：MuJoCo 模型真实包含并驱动 exact 两个 hinge joint、两个 actuator 与 sensors；错误 mapping/axis/limit/range/owner 在执行前或 codec admission 时 fail closed。
7. **Action-conditioned evidence**：Episode samples 的 joint state、active commands、sample grid、terminal state 与 Program 一致；改变 command 必须产生可观测的 trajectory/terminal 差异，不能由固定动画伪造。
8. **Deterministic evaluation**：canonical action sequence 稳定 PASS；错误单关节、交换 actuator、单帧命中但未 settle、错误 frame 与 evaluation forgery 均 FAIL 或被拒绝；Evaluation 不读取 Presentation 或 Agent narration。
9. **Authority closure**：`run` 不推进 current ref；只有 registered reach contract 的 completed+passed Episode 能由独立 control adopt，failed/forged/mismatched evidence 拒绝。
10. **Visible Product slice**：真实 Chromium 中可检查 arm hierarchy/refs/frames、逐帧播放两 link 运动并看到结构化 Program/Episode/Evaluation；reset 与第二 Session 不继承旧 selection、timeline 或 Three objects。
11. **No patch stack**：不增加 `moveArm` shortcut、`robotMode` flag、legacy/modern 双 run parser、renderer-to-state fallback、第二份 tool schema 或 fixture-specific codec copy；新增抽象只服务已有 free-fall 与新 actuator sequence 的两个真实 program variants。
12. **Regression gates**：targeted RED/adversarial tests、`bun test`、`bun run typecheck`、`bun run build`、真实 Chromium acceptance、`git diff --check` 与 EXharness validation 全部通过。

## 实现阶段

### Phase 1 — Contract RED 与 frozen fixture design

- 先写 tool input、articulated identity/topology、edit/run separation、Program content identity、codec drift 与 adopt authority 的失败测试；
- 冻结两关节 fixture 的 link lengths、axes、limits、actuator ranges、frames、units、target pose、duration、sample rate、settle window 与 tolerances；
- 用旧实现上的明确 RED 证明 `programId` 菜单无法表达 action sequence，且 articulated refs/state 尚不存在。

### Phase 2 — Kernel closed variants 与 tool contract migration

- 增加最小 articulated representation/state、actuator-sequence Program 与 reach Evaluation variants；
- `WORLD_TOOL_CONTRACT` 作为 Host、Gateway pre-admission 与 OMP schema 的唯一输入事实面；
- 一次性迁移 pose edit 与 free-fall run 调用，不保留 legacy parser。
- Phase 1 的 tool/action-clock/Program digest RED 在本阶段转 GREEN；Runtime trajectory 与 reach evaluator RED 保持到 Phase 3。

### Phase 3 — Repository、MuJoCo 与 Evaluation vertical slice

- repo-owned fixture、joint-state edit、MuJoCo private mappings、action execution、Episode/Terminal 与 evaluator 形成非 UI 闭环；
- canonical run PASS，adversarial commands/refs/mappings FAIL；
- `run`/adopt authority 与 existing scenarios 回归。

### Phase 4 — Product Session、codec 与 restricted Agent closure

- Product projection/event/trace 对 articulated Program 与 evidence exact admission；
- scripted restricted four-tool turn 先 `read`，再提交显式 action Program；
- 证明 active/enabled tools 恰好四个，mounted tools 为空且无 ambient capability。

### Phase 5 — Studio 可见切片

- Three.js 根据 Snapshot/Episode state 渲染 link poses；
- inspector 显示 hierarchy、joint/actuator/sensor refs、frames、units 与 Program；
- timeline 从 sample 0 逐帧播放到 settled reach，PASS/FAIL 来自 Product evidence。

### Phase 6 — Full gate 与 fresh independent cross-review

- 运行全部 acceptance gates，冻结 product digest 与 Git status；
- 两位 fresh reviewer 相互隔离，分别执行 source/contract review 与可执行 adversarial review；
- 任一 reviewer 给出 P0/P1 或 `changes_requested`，只修根因并发起 fresh round；
- 双审批准前不 closeout/mark-done；Human 未另行授权前不 commit/push/merge。

### Targeted regression matrix

| 能力 | 必须保持的 targeted gate |
|---|---|
| primitive/imported rigid free-fall | explicit `free-fall` Program 经统一 admission，landing Evaluation 与 adopt authority PASS |
| ball-vessel | 91-sample containment、16/16 support、contact/representation/physics drift fail closed |
| 3DGS/Spark | Observation/Presentation alignment 与 lifecycle 不因 articulated rendering 回归 |
| restricted OMP | active/enabled tools 恰好四个、mounted/ambient 为空，nested explicit Program 经真实 `tool.execute` 到达 Host |
| Product Session/codec | Program digest、articulated refs/action clock/samples/Evaluation 重算闭合，transport tamper fail closed |
| Repository/adopt | run 不推进 ref；registered scenario-kind-contract PASS 才能 adopt；forged/unrecorded evidence拒绝 |
| cross-engine Evaluation | Bun producer → JSON → Node/V8 verifier 合法通过，canonical metric/Program tamper 拒绝，bounded probe lifecycle 保持 |

## Plan review focus

在实现前，reviewer 必须重点回答：

1. 显式 `WorldProgram` 是否是四工具摆脱固定动作菜单所需的最小抽象，还是仍有更小的真实方案？
2. articulated topology/state 是否保持一个 Entity authority，而没有把 Kernel 变成机器人本体库？
3. `edit` 与 `run` 的迁移是否避免 legacy patch stack，并保持旧场景可表达？
4. Program/Episode/Evaluation/codec/adopt 的证据闭包是否足以拒绝模型自报成功与 transport forgery？
5. 是否把抓取、规划、world model、通用 importer 或 robotics SDK 偷渡进 DH-011？
6. Acceptance 是否可执行、可观察，并足以证明“控制语义”而非固定动画？
