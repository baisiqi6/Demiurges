# DH-015 Findings

## 2026-08-14 — 起点事实

- `main`、`origin/main` 与 DH-015 base 均为 `1805d73055a79a7e0506afafebaffd7b308706f9`。
- DH-013 已登记 Marble environment、Marble collider source 与 Hunyuan object 三个真实 provider artifact，并把它们闭合为唯一 `fixture:marble-hunyuan-composite-v1`。
- DH-014 已提供 `overview | inspect | explore` 三种 Presentation-local observer mode；相机状态不属于 Snapshot authority。
- 当前 `WORLD_TOOL_CONTRACT.edit` 已支持 `targetRef=entity:generated-object` 的 world-frame pose edit，Repository 以 `expected Ref` CAS 创建 child Snapshot，并拒绝 dynamic Entity 穿透 floor。
- 当前 `WORLD_TOOL_CONTRACT.write` 仍是 fixture registry，不接受任意资产组合；当前真实 registry 只有一个 environment 与一个 generated object。DH-015 不应为单一实例伪造通用 asset-composition SDK。
- Marble/Hunyuan fixture 的 visual、observation、collision proxy、physics、calibration 与 witness 已有 exact integrity gate。DH-015 应复用这些边界，不能从 Three.js node 或缓存文件路径反推世界事实。

## 运行时装配发现

- 新 worktree 默认没有 ignored `.artifacts/harness`。首次相对调用因此没有产生变更。
- 从 main 的绝对路径调用 runtime 时，Python 以脚本目录而非当前 worktree 解析 project root，导致四个新节点暂时写入 main checklist。
- 已在未提交、未推送状态下精确撤回 main 的 69 行新增内容；随后把同一 ignored harness runtime 复制到 DH-015 worktree，并通过本地 `harnessctl` 正常登记节点。main 恢复干净。

## 设计约束

- 第一版 Scene Composer 面向当前真实 role-compatible pair：Marble environment + Hunyuan generated object。UI 可以把它们作为 registered asset cards 显示，但不能宣称已经具备任意资产组合能力。
- 交互拖拽阶段应维护 Presentation-local `PoseDraft`；只有显式提交才调用既有 `world_edit`。取消、mode change、ref drift、selection change 或 unmount 必须丢弃 draft。
- 不允许 arbitrary scale。当前 Hunyuan GLB 与 box proxy 的 witness 只证明现有 calibration；缩放必须留给将来独立的 re-calibration contract。
- Provider generation、project persistence 与 Agent orchestration 分别由 DH-017、DH-016、DH-018 承担，不得进入 DH-015。

## Product Session 与交互 seam

- Studio 当前只能通过自然语言 turn 驱动 Gateway，没有 deterministic 的 human authoring mutation endpoint。Scene Composer 不能把精确 pose 塞进 prompt 并期待 LLM 可靠复述；这会让 UI 操作依赖模型概率行为。
- Gateway 的唯一可写 `RuntimeMvpHost` 位于 `ProductSession`，因此 human authoring 也必须在这个进程内复用既有 `WorldToolSurface.write/edit`，不能在 Studio 创建第二个 Host。
- 计划应增加一个 closed、product-owned authoring route，只允许当前 `world_write` 与 `world_edit` 两种 exact input，并直接复用 `requireWorldWriteInput` / `requireWorldEditInput`；它不是通用 tool bridge，也不暴露 `read/run/adopt` 或 OMP internals。
- authoring request 必须与 Agent turn 共用 session mutation lease：只在 `running=false` 时原子接纳；并发 turn、stale Ref、malformed body 或 codec failure 必须零副作用 fail closed。
- authoring response 应返回受信 `ProductSessionProjection`，由 Studio 以 prior expected world 做 lineage admission；成功 edit 与既有 Agent edit 一样失效 stale `lastRun`。
- `ThreeViewport` 当前直接用 authoritative Snapshot/Episode state 同步 render roots。Transform gizmo 可以临时移动 Presentation root，但必须显式标记 draft，且不得把 draft transform 用作 alignment evidence、selected authoritative state 或 Snapshot 输入之外的事实来源。
- 第一版 gizmo 只支持 translate 与 world-Z yaw rotate；scale 永久隐藏。drag 期间暂停 Orbit/Explore 输入，结束后恢复；idle 不建立永久 rAF。

## Round 1 independent cross-review

- Sol Max 与 OMP DeepSeek V4 Pro Max 均独立确认：当前 composite fixture 的 authored-state exact closure 会拒绝 DH-015 的真实 pose edit；阻断同时存在于 Repository、Product codec 与 MuJoCo base admission。
- 现有 `decodeProductSessionProjectionTrusted(expectedWorld)` 证明的是 same-world continuity，不能直接作为 write/edit transition decoder。需要 package-owned operation-aware admission，不能把 lineage 逻辑复制到 Studio。
- 原计划的 direct human run 会把 HTTP deadline、不可中断 MuJoCo await、Episode/Evaluation registration 与 busy reservation 纠缠起来。Round 2 采用更小边界：human seam 只有 deterministic write/edit；run 继续使用既有 Agent 四工具路径。
- PoseDraft 还需冻结 q/-q 等价、canonical quaternion sign、`-0 → 0` 与 semantic no-op；no-op 不发 edit、不创建 Snapshot、不清空 valid lastRun。
- TransformControls 必须挂到独立 draft wrapper，不能直接让 authoritative render root 同时承担 draft 与 alignment evidence。
- Round 1 combined decision 为 `changes_requested`，未获得 implementation authority。

## Implementation findings

- `decodeProductSessionProjectionTrusted()` 会把传输 DTO 投射为 null-prototype records；UI 构造 direct command 时必须显式 re-encode `expected Ref` 为 plain wire record，不能把 trusted DTO object 原样交给 strict Agent parser。
- JSON lexical `-0` 可被 `JSON.parse` 保留为负零；测试不能用 `JSON.stringify(-0)`（会变成 `0`），必须以 raw JSON body 验证 `POSE_NOT_COMPOSABLE`。
- Three.js `TransformControls` 的正常 pointer lifecycle 也可能触发 `lostpointercapture`。可靠区分方式是以 `dragging-changed(false)` 取消 pending abnormal-loss timer；只有 timer 到期仍处于 dragging 才清除 draft。
- Gizmo 不能直接 attach authoritative Entity root，否则 Presentation draft 会污染 selection/alignment/bounds 读取。实现使用无 `EntityRef` 的独立 proxy wrapper；尺寸来自受信 collision representation，TransformControls helper 不进入 entity map/raycast/evidence。
- Chromium 验收时 worktree 与 main 都不存在 `.artifacts/provider-cache/sha256/*`；这是 external ignored runtime state，不是 Snapshot authority。产品必须显式显示 `NOT IMPORTED` 并禁止把缺失 Hunyuan visual 当作已验证的可编辑对象，不能静默联网或重新生成。

## Implementation review Round 1 findings

- Three.js 0.185.1 的 `TransformControls.detach()` 只清 object/axis/visibility，不会把 `dragging` 设回 false；异常 capture loss、mode/ref/asset-driven draft cleanup 不能只依赖 detach。可靠的 release primitive 是先调用 public `pointerUp(null)`，再 detach/cancel。
- Escape 同时承担 viewport input release 与 PoseDraft cancel。editable-target admission 只应阻断相机运动键，不能阻断 active draft 的 Escape cleanup；否则点击 toolbar 后焦点留在 button 会让 draft 无法退出。
- idle rAF 必须在 mode transition 与 Spark dirty settle 后测量。紧邻 Inspect transition 的短窗口仍会看到有限帧；等待 settle 后 400ms 真实 Chromium 窗口增量为 0。

## Implementation review Round 2 findings

- `request.signal` 在创建 Request 时已经 aborted，并不会自动阻止直接调用的 in-process `api.fetch()`；authoring API 必须在同步 reservation/mutation 前显式检查。对于 streamed body，还需在 body 完整读取后再次检查，覆盖读取期间发生的 abort。
- structural/domain 分界不能只检查 discriminant 与 outer array。shared structural decoder 必须闭合 nested record shape 与 primitive type；数值 envelope、joint registry order等才属于后续 domain parser。
- stable transport mapper 若以 `Error.message` 作为 code，会让内部 parser 文本偶然成为公共协议。typed error 的 `code` 才是 protocol authority；unknown Error 必须统一降级为 `INVALID_REQUEST`。
- operation-aware transition 不仅要验证 returned settled；prior 也必须 settled，否则 client 可从一个尚未结束的 authority state接纳同步 human child/root。

## Implementation review Round 3 findings

- 把 settled invariant 只放进 decoder 还不够；任何 local optimization（特别是 semantic no-op 不发 request）也必须经过同一个 decoder，否则优化分支会成为 authority bypass。
- HTTP JSON 无法保留 accessor 与真正 sparse array，因此 nested structural matrix需要两层证据：package direct admission证明 descriptor/dense-array fail closed，HTTP tests证明可传输的 null/extra/wrong primitive与 exact unsupported的 400/422 分界。

## Implementation review Round 4 findings

- operation-aware decoder 是 package-root trust boundary，不能假定 caller提供的 prior 已经 trusted。先通过既有 full projection codec重新接纳 prior，再做 operation transition，是比复制 session/ref/lineage小规则更完整的闭合。
- exact composite identity必须位于 edit outcome共同入口；只在 updated检查 scenario、或让 unchanged做 byte-equivalence，都可能把一致但错误的 foreign authority认证为合法。
- Three.js `Object3D.up` 默认Y-up。即使 TransformControls使用 world-space且隐藏非Z旋转 handle，Presentation draft wrapper也应显式Z-up，避免隐式默认值成为未来 lookAt/child helper语义。

## Implementation review Round 5 findings

- 捕获 commit 时的 canonical PoseDraft 只固定了发送内容；若 pending期间仍允许 gizmo拥有输入，本地 readout仍会漂移，造成用户看到的 draft与已提交 command分叉。
- `running` 不只是按钮 disabled 状态，也必须进入 Presentation input ownership。进入 busy 时应先 release active TransformControls drag，再 disable/detach；同时 mutation callback还要有独立 busy guard，覆盖迟到事件。
