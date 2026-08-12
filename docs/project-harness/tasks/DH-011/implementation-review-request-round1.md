# DH-011 Round 1 Fresh 独立实现审查请求

## 角色与权限

你是 fresh independent implementation reviewer。只读审查，不修改任何文件，不 commit、push、merge、reset、clean、安装依赖、联网、发送真实 provider prompt、读取 credential、SSH、deploy 或访问真实设备。

- cwd：`/Users/Admin/projects/WorkTrees/Demiurges-DH-011`
- branch：`agent/codex/DH-011`
- frozen base/HEAD：`06a2c392bbc2a001d1b31b3cde15b2eb3f9f6cca`
- canonical plan：`docs/project-harness/tasks/DH-011/plan.md`
- product manifest：`/tmp/dh011-product-files.txt` 列出的 34 个 `apps/**` / `packages/**` changed or untracked files；reviewer 应自行用同一命令重建 manifest，不能依赖 `/tmp`。
- frozen product aggregate：对 manifest 按 `LC_ALL=C sort -u` 排序，逐文件执行 `shasum -a 256` 得到完整文本，再对该文本执行 `shasum -a 256`，预期 `03eb07891c06b20ac1fe4be859a3aaa60321c73c5f7ad4d092b533889d3c016f`。

禁止读取：任何 `docs/project-harness/tasks/DH-011/*implementation-review-verdict*`、`*implementation-cross-review*`、其他 reviewer transcript，以及 `docs/project-harness/current/review-packet.md` 中的 reviewer summary。可以读取 canonical plan、source、tests、Git diff 与本 request。不得把 plan review verdict 当作实现证据。

## 实现目标

审查 DH-011 是否以最小四工具建立了真实 articulated control vertical slice：

```text
read / write / edit / run
→ one entity:arm with stable sub-refs
→ exact joint-state edit
→ explicit canonical actuator-sequence WorldProgram
→ private MuJoCo run and action-conditioned Episode
→ trusted reach Evaluation
→ Product codec and visible Studio playback
```

不得因 demo 可见就批准；必须核验 authority、causal evidence、fail-closed transport、determinism 与旧能力回归。不得要求 DH-012/world model、IK、planner、grasp、robot SDK、arbitrary MJCF/URDF importer、第五工具或 UI redesign。

## Operator 已完成但 reviewer 必须独立复核的 gates

- `bun test`：`160 pass / 0 fail / 2904 expect()`。
- `bun run typecheck`：PASS。
- `bun run build`：PASS，仅既有 MuJoCo browser-external 与 large chunk warning。
- `git diff --check`：PASS。
- `.artifacts/harness/harnessctl validate`：PASS，0 warnings。
- Operator Chromium：91 frames；frame 0 joint `[0,0]`，frame 15 已响应，frame 90 `[0.65,-1.0]` 且 `16/16 PASS`；new Session 清空 selection/timeline/world。

## Mandatory executable checks

1. 复算 branch/HEAD/manifest/34 个文件 aggregate，结束时再次复算，确认零漂移。
2. 执行 focused DH-011 tests、full tests、typecheck、build、`git diff --check`、EXharness validate；不得 build/install 之外写 source/harness。
3. 核验四工具 exact：无 `move_arm/set_joint/reach` 第五工具；`edit` 只有 exact `pose|joint-state`，`run` 只有 explicit `free-fall|actuator-sequence`，legacy `programId` 拒绝；Gateway 的 nested array admission 仍拒绝 sparse/accessor/extra/symbol/non-finite 且使用 per-tool budget。
4. 运行反例验证 Program canonicalization：nested command 改变导致 digest 改变；伪造 `program.id`、17 steps、terminal-time step、off-grid/duplicate/unsorted step、swapped/missing/third actuator、越界、`-0`、lone surrogate、sparse/accessor 全部 fail closed。
5. 核验 scenario/adopt authority：Snapshot `scenarioId`/topology/representation/physics/fixed target/root state exact；run 不推进 ref；只有 recorded completed+passed `(scenarioId,program.kind,evaluatorId,contractId)` 可 explicit adopt；失败/伪造/unrecorded/mismatched evidence 拒绝。
6. 核验 action clock：canonical 3s run 恰好 `720 mj_step / 721 mj_forward / 91 samples / 16 settle samples`；command 在 0.5s sample 前应用；terminal 后无 extra step。若计数没有可执行 instrumentation，必须判明现有 source+tests 是否足以证明，不能从结果长度反推全部调用数。
7. 核验 causal Runtime：每 run private `MjModel` + fresh `MjData`，无 model/data leak/cache，critical section 内无 await/callback/reentry；callback surface fail closed；`modelCausalDigest` 覆盖真实动力学字段并在 boundary/terminal 重验；`qfrc_applied/xfrc_applied=0`、`ncon/nefc=0`、joint limits、model replacement/field mutation 能在 completed evidence 前拒绝。特别寻找 digest 漏字段、无法 introspect 却假装通过、共享 module/global mutable surface或同 inputs 两个合法 Episodes。
8. 核验 action-conditioned paired control：第二 step shoulder `0.65→0.55` 时 Program digest 改变；`t<0.5` trajectory numeric equivalent，`t>=0.5` 至少一个 shoulder qpos 与 terminal tool position差异 `>1e-6`；同 Program 重跑在声明 tolerance 内等价。
9. 核验 Episode/Evaluation：每 sample exact arm joint refs、四 sensor refs/order/value、active commands、完整 Entity states；terminal 与 last sample一致；FK 唯一来自 trusted registry+joint state；全部 terminal 前 0.5s/16 samples 同时满足 `<=0.02m` 与 `<=0.02rad/s` 才 PASS。单帧命中/高速、timestamp、qpos/qvel/sensor/command/target/frame/metric/passed 漂移全部拒绝或 FAIL。
10. 核验 Product codec JSON/Node/V8 closure：合法 articulated projection exact round-trip；同步篡改 authored+terminal+samples 的 fixed target/root/topology/representation/physics、Program/content/id、Evaluation、scenario/ref/lineage、runtime digest必须 fail closed；transport 不依赖 Three.js transform或 Agent narration。
11. 核验 Studio：arm 是单一 selectable Entity；link hierarchy 从 Episode joints逐帧驱动；显示 link/joint/actuator/sensor/frame refs、units、Program、Episode/Evaluation PASS/FAIL；Presentation transform 不进入 authority；reset/第二 Session 不保留 Three objects、selection、timeline或旧 evidence。允许只读 Chromium 验收。
12. 检查 DH-001～010.1 回归与 no patch stack：rigid/ball-vessel/3DGS/Spark/OMP/Product/Repository/adopt/cross-engine codec均保持；没有第二套 schema/parser、fixture-specific shortcut、renderer-to-state fallback或范围外平台化。

## 输出格式

中文为主体，精确输出：reviewer identity、executed commands、frozen identity before/after、P0/P1/P2（每项含文件行号、可执行反例与影响 acceptance）、Acceptance 1–12 coverage、未验证项、`decision=approved|changes_requested|blocked`、`may_closeout=yes|no`。

只有 `P0=0`、`P1=0` 且 mandatory checks 形成可复核证据时才能 `approved`。P2 可以不阻断，但必须明确。发现一个决定性 P1 后仍应完成 request-scoped mandatory checks；不要无限扩展到 DH-012 或非目标 UI polish。
