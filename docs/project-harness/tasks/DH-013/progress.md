# DH-013 Progress

## 2026-08-13 — Plan gate

- 已从 clean `main` 建立独立 branch/worktree；
- 已创建中文 canonical plan、findings 与 progress；
- 已登记并激活 EXharness `DH-013`，branch/worktree/plan locator 一致，validator 为 0 warning；
- dependency 安装后 baseline gates 通过：`172 pass / 0 fail / 2958 assertions`、typecheck、build、`git diff --check` 与 EXharness validation；build 只有既有 MuJoCo browser-external 与 chunk-size warning；
- 当前阶段：Round 5 双 reviewer 共同批准，进入 Phase 1 RED→GREEN；
- 尚未修改产品代码、依赖或 provider 状态；未发起付费生成；未 commit/push/merge。

## Errors

- 新 worktree 中 `.artifacts/` 按 `.gitignore` 不存在，因此不能直接运行 worktree-local `harnessctl`。需要按已关闭 DH-012 的可重建规则，在该 worktree 重新实例化 ignored harness runtime，不能让 main worktree 的 runtime 错写 main。
- 首次 baseline `bun test` 在新 worktree 因 `node_modules` 不存在而出现 workspace package、`three` 与 `@mujoco/mujoco` resolution error；测试没有形成有效产品结论。处理：只按现有 `bun.lock` 运行 `bun install --frozen-lockfile`，然后完整重跑同一 gate。
- Round 1 双审均为 `changes_requested`；尚未进入产品实现。已按共同 findings 修订 canonical plan，并用既有 provider job/world 的只读 candidate evidence 冻结 exact asset/calibration/proxy contract，等待 Round 2 fresh cross-review。
- 首次 GLB bounds probe 从 repo root `bun -e` 无法解析 app-scoped `three`；没有重复同一失败，改为 `bun --cwd apps/studio -e` 后成功解析两项 GLB bounds。
- Round 2 DeepSeek 给出 approved，但 Sol 给出两个可执行 P1；交叉审查不按多数投票，未进入产品实现。已拆分三条逐资产 CalibrationRecord、冻结三类 exact witness 与独立 tamper matrix，等待 Round 3 双审共同批准。
- Round 3 第一次启动后，Operator 依据腾讯官方 OpenAI-compatible 调用示例发现 Hunyuan 使用 raw-key `Authorization`，不是 Bearer scheme；立即中止两名 reviewer，修正 canonical plan/request 并重新冻结，旧 attempt 不产生 verdict。
- Round 3B DeepSeek approved、Sol changes_requested；已补 floor transform tamper、composite duplicate-ref/foreign-lineage exact RED rows，并采用独立 `1e-12` transform recompute epsilon。仍未修改产品源码。
- Round 4 DeepSeek approved、Sol changes_requested；已去除“任一/或”抽样空间，冻结每个 numeric/string leaf 的 mutation 和全部成员执行规则。仍未修改产品源码。
- Round 5 Sol 与 DeepSeek 均 approved，P0/P1/P2 全为 0；Phase 0 关闭，开始 artifact/calibration/witness/composite authority 实现。

## 2026-08-13 — Phase 1 core authority

- OMP DeepSeek V4 Pro Max worker 以 RED→GREEN 实现 provider registry、三条 CalibrationRecord、三类 witness、registered composite Snapshot 与 MuJoCo free-fall 闭环；worker 报告 RED 为 module missing，GREEN 为 433 tests 通过。
- Operator 没有直接接受 worker 结果。根审查发现两项底层问题：新 representation 通过 phantom `never` 字段冒充 legacy `imported-rigid-mesh/gaussian-splat`；`manifestDigest` 错用了单个 asset content digest。
- 已从 representation discriminant 修正为独立 `registered-rigid-mesh/registered-gaussian-splat`，删除 phantom 字段；`MARBLE_HUNYUAN_MANIFEST_DIGEST` 改为完整 canonical Git registry 的 SHA-256，并新增不等于任一 asset digest 的回归。
- Studio empty-cache 路径只显示 `not-imported`，不调用 legacy resolver、不回退 diagnostic wedge；真实资产加载仍留给后续 asset route/Presentation phase。
- 修正过程中聚焦 codec 曾出现 12 个旧场景回归，根因是 legacy 与 registered shape discriminator 被互换；恢复独立分派后 focused 为 `292 pass / 0 fail / 406 assertions`。
- 当前全量门禁：`434 pass / 0 fail / 3257 assertions`；typecheck、build、`git diff --check`、EXharness validation 全通过，build 只有既有 MuJoCo browser-external/chunk warning。
- 已冻结 Phase 1 产品文件 aggregate `4efe0e7f170f99e6c4f486f1bc47935641877e0d246d2a77eb830e573d80a50d`，进入实现级 independent cross-review；未联网、未访问 Keychain/provider、未 commit/push/merge。
- Phase 1 Round 1 cross-review 出现分歧：DeepSeek V4 Pro Max `approved`，Sol Max `changes_requested`。按严格 gate 采用后者，`may_enter_phase2=no`。
- 已独立复现三个同根 blocker：canonical composite projection 因 generated object 被错误交给 `boxVisual` 而拒绝；registry dense array 忽略 extra string/Symbol/accessor；registered observation accessor 可被 snapshot identity 读取并接受。现进入 exact plain-data admission 根修复，Round 1 不构成批准。
- Round 1 remediation 已完成：codec 按 environment/floor/generated exact EntityRef 分派；registry 与 Snapshot 共享边界均只接纳 indices + `length` 的 dense own-data arrays；registered observation 进入 exact-record admission。
- 原测试 `SESSION_ID=session:composite` 本身非法，会让 codec/stream 负例提前失败；现改为合法 `session:local-composite`，新增 canonical projection + event 正向门后，32 family 的 119 seam probes 才真正穿过 session/baseline admission。
- remediation gates：focused `295/0/415`，full `437/0/3266`，typecheck、build、diff、EXharness 全通过；新 frozen aggregate `6643485ff8622d4bf12dc774bb6d36b36c980c0cd8a3e37d9d2566821ad59818`，进入 fresh Round 2。
- Round 2 双 reviewer 均为 `changes_requested`：Repository 在 descriptor admission 前读取 Snapshot；physics nested record 未做 own-data 校验。self-materializing getter 可在 physics 比较时篡改已经比对过的 state/collision，再将自身改成普通字段，最终污染 current Ref。Phase 2 gate 继续关闭。
- Round 2 remediation：Repository `write/record/#insert` 在字段读取前先走 structural descriptor admission；physics nested record exact 校验；observation 先形成 descriptor-copy 再按 kind 分派；结构验证后才执行 test-only proxy scan 与 fixture semantic comparison。
- self-materializing root/entities/observation/physics getter regressions 均为 reads=0、Repository 不初始化 Ref；DH-010 Runtime-direct closed-proxy seam 保持。
- gates：focused `296/0/422`、full `438/0/3273`、typecheck/build/diff/EXharness 全通过；Round 3 frozen aggregate `848b821573415337f85c47c88bed8613c7771c088c2e68ec0e8c595803915116`。
- Round 3 结论分歧：DeepSeek approved，但 Sol 复现两个 P1；严格 gate 采用 `changes_requested`。一是 `semantic.kind` 在 descriptor admission 前读取并可 self-materialize 后污染 `schemaVersion`，二是 `runFallingCube` 在 Snapshot admission 前读取 `snapshot.id`。
- Round 3 remediation 已改为 descriptor-copy semantic dispatch，shared structural validator exact 校验 Snapshot 顶层身份；Runtime 先完成 Inputs deep-frozen 与 Snapshot structural admission，再派生 execution key。新增 semantic/schema/id getter 回归，getter reads=0、Ref 不初始化。
- remediation gates：focused `297/0/427`、full `440/0/3282`、typecheck/build/diff/EXharness 全通过；Round 4 frozen product aggregate `1cff9840fb08ac25c7d4a53415d5f802e8bde4000a0cee708aa6e5d95c93520e`，等待 fresh cross-review。
- Round 4 Sol Max 与 OMP DeepSeek V4 Pro Max 均 approved，P0/P1 为 0，frozen identity 起止一致；Phase 1 正式关闭，可进入 Phase 2 受控 importer。registered assets 在 Studio 仍显式 `not-imported`，没有被误报为已接入。

## 2026-08-14 — Phase 2–5 real provider slice

- 已实现 Keychain-only operator importer：只查询既有 Marble world 与 Hunyuan job，不发起新 generation；query/download 使用共享 deadline、exact HTTPS host、manual redirect、byte budget、一次 signed URL refresh、稳定脱敏错误与 `0600` content-addressed cache。
- 三项真实产物已通过独立格式与 identity 校验并进入 ignored local cache：Marble SPZ `5,163,264` bytes、Marble collider GLB `7,719,136` bytes、Hunyuan visual GLB `21,383,672` bytes；digest 与 Git registry 完全一致，receipt 不包含 credential、signed URL 或 provider response。
- matching cache 命中仍会执行 `O_NOFOLLOW`、regular-file/mode/size、before/after stat 与完整 SPZ/GLB validator；symlink、wide permission、magic/digest/bounds drift 与 publish race 均 fail closed，旧 valid digest 永不被失败 candidate 覆盖。
- Gateway 新增 closed same-origin asset route：只接纳 registry 中的三个 `assetId`，每次 serve 重验 exact cache bytes，拒绝 query/range/traversal；具备 10 秒 read deadline、最多 4 个并发读取、abort cleanup 与稳定 `404/408/409/503` 语义。
- registered composite Product Session 已闭合四工具：Hunyuan object 使用稳定 `entity:generated-object`，Marble SPZ/GLB 只作为 Presentation/source evidence，MuJoCo 只消费显式 floor/object proxy；Episode `PASS` 且 `world_run` 不推进 current ref。
- Studio 已通过 same-origin route 加载真实 Spark SPZ 与 Hunyuan GLB；浏览器先核验 `assetId/digest/size` response headers 和 SHA-256，再 parse；每次 load 有 generation token + AbortController，并释放 late/removed GLTF、textures、materials、Spark mesh/renderer 与 OrbitControls。
- `3DGS / Mesh / Collision / Alignment` 四个开关彼此独立且切换不重新下载；Inspector 分别呈现 transport integrity、authored-unverified calibration 和 proxy witness，只有真实 bytes 验证完成才显示 `INTEGRITY VERIFIED`。
- imported Chromium 验收：三个 registered asset 均为 `loaded`，四工具成功，Evaluation `PASS`，Episode 76 samples 可逐帧回放；四开关可组合且 network request count 不增加；浏览器只访问 loopback `/api/sessions`、`/api/assets` 与 Spark `blob:` worker，provider/CDN/COS request 为 0。
- empty-cache Chromium 验收：三项资产均显示 `not-imported`，不请求 provider、不回退 diagnostic wedge，物理 Episode/Evaluation 仍可由显式 proxy 独立完成。
- 最新 gates：`461 pass / 0 fail / 3397 expect()`；typecheck、build、`git diff --check`、EXharness validate（0 warning）与离线 `bun run import:dh013` 全通过。build 只有既有 MuJoCo browser-external/chunk warning；Git/build secret 与 browser provider-origin scan 无匹配。
- 已冻结 40 个 product files aggregate `29e9415ffde8f0e6522d93223df55463e89c8f403ceebc76a908f6570f3b5979`，进入 Phase 5 fresh independent cross-review；未 commit/push/merge，未请求 closeout/mark-done。
- Final Round 1 交叉审查出现分歧：DeepSeek approved，Sol changes_requested；严格 gate 采用后者，`may_closeout=no`。阻断项是 cache read identity/deadline/FIFO closure，以及 SPZ/GLB 完整容器与真实 POSITION closure；现进入底层修复，不以 DeepSeek 的单方批准放行。
- Round 2 remediation 已完成：新增共享 verified-cache-file invariant，统一 `O_NONBLOCK|O_NOFOLLOW` regular-file admission，before/after 比较 `dev/ino/mode/nlink/uid/gid/size/mtimeNs/ctimeNs`；FIFO bounded fail closed；asset route 只有底层 read promise settle 才释放并发 slot。
- SPZ v2 现在按 `shDegree` 要求 exact 19/28/43/64 bytes-per-element payload；GLB 完整遍历单一 JSON+BIN chunk table、拒绝 trailing/unknown/multiple BIN、拒绝 sparse POSITION，并从 embedded BIN 的 Float32 VEC3 按 bufferView/stride 真实重算 bounds，再与 accessor/manifest 双重闭合。
- Round 1 的 position-only SPZ、malformed sparse accessor、4-byte trailing GLB、stat drift、FIFO 与 late-read capacity 反例均已成为 regression tests。focused `18/0/82`，full `463/0/3409`；typecheck/build/diff/EXharness/import/secret scan 全通过，三项真实 provider bytes 在更严格 validator 下仍为 verified cache-hit。
- 最新 5173 Chromium 使用 remediation 后 Gateway：三项 asset status 全为 loaded，integrity/calibration/witness 分层正确，四工具成功，76 samples、Evaluation PASS、ref v2；resource requests 只有 loopback `/api`，Mesh+3DGS 同时开启；replay 在约 0.32s 仍为 frame 0、约 2.82s 为 frame 60，没有 terminal 闪现。
- 已冻结 42 个 product files aggregate `40aaa38eea0e178b24c607c78f48febfa810fa8776d976c9a0ce4e363a34d5f1`，进入 Final Round 2 fresh cross-review；未 commit/push/merge，仍不可 closeout。
- Final Round 2 再次出现 DeepSeek approved / Sol changes_requested；严格 gate 保持关闭。Sol 复现 query 与 download body stream rejection 会把 dummy signed-query marker 原样带到 CLI error.message；现进入共享 transport error boundary 修复。
- Round 3 remediation：新增共享 `readTransportChunk`，credential/query/download body 的所有非 `ProviderImportError` rejection 分别归一化为 `CREDENTIAL_UNAVAILABLE`、`QUERY_REJECTED`、`DOWNLOAD_REJECTED`；CLI 最外缘只允许 `ProviderImportError.message`，其他异常固定打印 `IMPORT_FAILED`。
- query/download 双 stream-error regression 注入 credential、dummy signature 与 signed path，均只返回稳定 code，marker 不可见且 temp 清空。focused `19/0/91`、full `464/0/3418`；typecheck/build/diff/EXharness/import/secret scan 全通过。
- 已冻结 42 个 product files aggregate `372630cfee4b50b5550d57425b97a7baec73e34e95e0b7d8bacd84bf3f7706f0`，进入 Final Round 3 fresh cross-review；仍未 commit/push/merge/closeout。
- Final Round 3 Sol approved（P0/P1/P2=0）；首个 DeepSeek attempt 仅返回 `.` 而作废，fresh Round 3B approved（P0/P1=0、非阻断 P2=1）。42-file aggregate 与 status 起止无漂移，implementation cross-review gate 正式通过，可请求 closeout。
- 尚未执行 closeout、mark-done、commit、push、merge；这些 authority 未从实现授权中推断。

## 2026-08-14 — Operator closeout

- Human 授权后生成 `docs/project-harness/current/closeout-packet.md`，并将 Final Round 3 的 Sol + fresh DeepSeek V4 Pro Max 批准重新登记为 closeout-phase `approved`；
- 正常 `mark-done` 已完成，CLOSE event 为 `evt-20260814T075536Z-c2f362f9`；DH-013 为 `done / closed`，owner/current pointer 已清空，lease 已释放，未使用 force override；
- 关单前最终复跑为 `464 pass / 0 fail / 3418 expect()`，typecheck、build、`git diff --check`、EXharness validate/doctor 全通过；42-file product aggregate 保持 `372630cfee4b50b5550d57425b97a7baec73e34e95e0b7d8bacd84bf3f7706f0`；
- 当前 authority 只覆盖 commit 与 push `agent/codex/DH-013`；不包含 merge `main`、tag、deploy、新 provider generation 或大资产入 Git。
