# Handoff Packet

## Subject

- Checklist item: `DH-017`
- From: `omp-deepseek-v4-flash-worker`
- To: `kimi-k3-resume-reviewer`
- Requested by: `operator`
- Updated at: `2026-08-24`
- Reason: Worker RESULT received for exact remote_bound resume; begin limited-fresh first-principles review before real download/publication.
- Canonical plan path: `docs/project-harness/tasks/DH-017/plan.md`

## Item Snapshot

- Title: Provider Generation Job 与 Verified Artifact 导入
- Status: doing
- Workflow status: running
- Priority: p1
- Current owner: omp-deepseek-v4-flash-worker
- Current session: omp-dh017-hunyuan-resume-existing-20260824

## Acceptance

保留 Marble 与 Hunyuan 两套 provider-specific implementation 与 fake tests；当前真实 MVP 以至少一个真实 provider 完成 prompt、job、poll、download、validation、receipt、verified Artifact registration、Gateway list/read 与 Studio display/download 为通过。Marble 真实 canary deferred，不阻断本阶段；credential 仅在 server-side，生成需显式用户确认且 bounded、idempotent；Artifact 不自动成为 Snapshot，不建立第三 provider 或通用 provider SDK。

## Current Handoff

DH-017 local MVP remains intact, but real Hunyuan closure is blocked at query codec compatibility. Next bounded slice: accept the observed live nonterminal placeholder shape with exact fake tests, no new framework; independent review; then Human/Operator-authorized poll continuation of the already remote-bound Job. Do not submit again.

## Canonical Plan Content

```md
# DH-017 — Provider Generation Job 与 Verified Artifact 导入

## 状态与 Authority

- Status：`planning`；
- Mode：`high-risk` provider generation + durable control plane；
- Branch：`agent/codex/DH-017`；
- Worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-017`；
- Base：`13300788f2d40e525fec91befca78f3fc4849831`；
- 依赖：`DH-016` 已 `done / closed`；
- Human 已授权建立 DH-017 的独立 worktree、EXharness authority、设计与验收计划，并在 independent cross-review 通过后进入实现；
- 设计、测试与 review 阶段不得调用真实 Marble/Hunyuan generation；第一次真实生成必须在实现与 independent implementation review 均通过后，由 Human 对 provider、model、prompt、数量与费用边界再次显式确认。

## 2026-08-24 真实 MVP 验收收敛（Human Authority）

Human 已确认停止继续尝试 Marble key，并将本阶段真实 MVP 收敛为“至少一个真实 provider 完成端到端 verified Artifact 闭环”。本节覆盖下文与之冲突的“双 provider 都必须真实成功”要求；两套 provider-specific implementation 与 fake tests 保留，Marble 真实 canary 标记为 deferred external dependency，不删除、不重构，也不再阻断本阶段。

当前只推进 Hunyuan，顺序固定为：

1. 对 2026-08-20 已存在的失败 Job 做恰好一次 no-generation query，只持久化/展示 `Status` 与稳定的 provider `ErrorCode`；不得输出 `ErrorMessage`、raw response、credential、JobId、RequestId、signed URL 或 prompt；
2. Worker 只离线准备最小诊断实现，不得读取 Keychain、联网或调用 provider；独立 Reviewer 只读审查；最终真实 query 只能由 Codex Operator 执行；
3. 诊断完成后只提出与 ErrorCode 直接对应的最小修正。新的 Hunyuan paid submit 不在本轮授权内，必须另行确认；
4. 若一次最小修正后的单次 Hunyuan canary 成功，则完成 poll → GLB download → inspect → durable verified Artifact → Gateway list/read → Studio display/download；若仍被外部服务阻断，DH-017 以“本地 MVP 完成、真实 provider 部分阻断”收口，不新增第三 provider 或通用 Provider SDK。

### 2026-08-24 terminal diagnostic stage-observability 修正

前一轮唯一获批的旧 Job 诊断入口只返回固定 `DH017_HUNYUAN_TERMINAL_DIAGNOSTIC_STOPPED`。该结果没有泄漏，但把 credential、HTTP、response/schema、status 与 ErrorCode 闸门合并，无法支持任何有证据的最小 provider 修正。Human 已授权继续完成以下纯离线切片：

1. 只修改 `.artifacts/canary/DH-017/20260824T1407Z/hunyuan-terminal-diagnostic/operator-diagnostic.ts`，并新增同目录一个 Worker RESULT；不得改产品代码。
2. stopped outcome 只增加一个闭集 stage token：`input | credential | http | response | status | error-code`。不得携带异常文本、HTTP body、HTTP URL/status number、provider scalar、JobId、RequestId、ErrorMessage、prompt 或 credential。
3. 仍然恰好最多一次 query `fetch`、零 submit、零 retry、零持久化 runtime log；既有 `FAIL + stable ErrorCode` 成功输出保持不变。
4. Worker 与 Reviewer 仅使用 injected fake credential/fetch 做离线验证，不读 Keychain、不联网、不调用真实 Job。Reviewer 从真实诊断可操作性、第一性原理和奥卡姆剃刀出发审查，不为单次脚本新增 logger、error framework、provider abstraction 或 product API。
5. 本切片不授权任何新的真实 query 或 paid submit。Operator 完成 diff/test/reviewer 验证后停在人类 authority gate。

## 2026-08-19 MVP 简化裁决（Human Authority）

当前优先级改为先完成 fake-provider 的最小闭环，再由真实使用证据决定是否追加健壮性与审计能力。本节覆盖下文与之冲突的早期高防御性要求；下文保留为设计历史与后续 hardening 备选，不再全部作为 MVP 阻断 gate。

MVP 只保留四条不可退让的约束：

1. 一次 generation 最多开始一次 paid submit；重启不能自动重提；
2. durable state transition 只有一个 successor，pending record 能按既有 journal protocol 收敛；
3. 不完整、冲突或未 verified 的 artifact 不进入公开 list/read；
4. credential 只留在 server/provider service 边界，不进入 DTO、日志、Studio 或持久化业务记录。

因此：

- early `admitted → submit_started → terminal submit disposition` 只在 mutation 前重验 live root/lease、exact durable intent、validated current chain/pending record 与 shared receipt capacity；
- birth pointer、完整 journal physical inode surface、generated-set publication/catalog/full reader join 由 admission、startup、publication、reader 各自的拥有者验证，不在每个早期状态转换中重复扫描；
- 内部 typed request 只校验状态转换真正消费的字段，不为 extra key、getter、prototype 等非外部攻击面复制通用 hostile-object decoder；
- 不再仅为 same-bytes inode replacement、cross-root/cross-lease 或全目录重复证明新增 coordinator-local 防御代码与测试；除非真实故障、明确安全边界或 canary 证据表明需要；
- 禁止以“简化”为名引入新的 repository、capability graph、evidence framework、generic transaction 或 recovery framework。

当前闭环顺序是：fake submit → durable outcome → fake poll/download → inspect → private publication → verified list/read → Studio 可见。闭环通过后，再单独评估 audit log、额外 inode provenance、全面 adversarial matrix 与多 generation 扩展。

### 当前实现切片：fake completion 纵向闭环

- 新增一个 package-internal 的 `FakeGenerationCompletionCoordinator`，只接受已经 durable `remote_bound` 的 generation、provider codec 已确认的 remote output identity，以及进程内注入的固定 SPZ/GLB bytes。
- 协调器按现有状态机的最短合法路径写入一次完成 poll、候选文件与 `validating`，随后直接复用既有 inspector、publication admission、hidden CAS、visible commit、`verified` transition 和 read-only reader。
- 仅支持 happy path、malformed bytes 在首个 mutation 前拒绝，以及 exact `verified` replay。任一中途残留状态由现有 startup recovery 能力处理或 fail closed；本切片不新增 retry engine、download transport、generic recovery、event bus、repository、registry 或 audit log。
- 本切片不接真实网络、Keychain、provider credential、生产 Gateway route 或付费 generation。完成标准是 fake Marble/Hunyuan 均能从 `remote_bound` 收敛为 `verified`，并被现有 `GeneratedArtifactReader`（从而现有 Gateway/Studio read path）列出和读取。
- 下一步只在 `scripted-fixture-main.ts` 组合一个显式 `POST /api/dev/fake-generation`：无 body/query、固定 Hunyuan intent 与 repo-owned GLB fixture，调用现有 admission/submit-result/fake-completion facade。生产 `main.ts`、Gateway package export 与 Studio UI 不新增生成入口；触发后仍由普通 `GET /api/artifacts` 面板读取。

## Goal

建立两条直接、可审计、可恢复的 provider-specific 生成路径：

```text
Human confirmation
  → durable local intent
  → provider-specific submit
  → durable remote job binding
  → bounded poll / restart resume
  → bounded download
  → format inspection + integrity verification
  → shared Artifact Store CAS
  → durable GeneratedArtifactSet
```

首版只覆盖：

1. Marble text prompt → world operation → `500k SPZ + collider GLB`；
2. Hunyuan 3D text prompt → JobId → `GLB`；
3. 生成结果成为 Data Root 中可枚举、可重启恢复、content-addressed 的 verified Artifact；
4. verified Artifact **不会自动成为 Snapshot、Entity、World Project revision 或 current Ref**。

本切片的本质是 provider control plane 与 Artifact registration，不是新的 world tool，也不是 Agent orchestration。DH-018 才允许 Agent 消费已登记 ArtifactRef 造世界。

## 已验证的官方 contract（2026-08-15 只读刷新）

### Marble / World Labs

- Base：`https://api.worldlabs.ai`；认证：`WLT-Api-Key`；
- text generation：`POST /marble/v1/worlds:generate`；
- poll：`GET /marble/v1/operations/{operation_id}`；
- latest world：`GET /marble/v1/worlds/{world_id}`；
- submit 返回 long-running Operation；完成后 World 至少可提供 SPZ 与 collider mesh；
- 官方当前 model names 包括 `marble-1.0-draft`、`marble-1.0`、`marble-1.1`、`marble-1.1-plus`；具体真实 canary model 不在本计划中预先替 Human 选择；
- 官方 generation 可能返回 credit cost，余额/usage 查询不是本切片的完成条件。

官方来源：

- <https://docs.worldlabs.ai/api>
- <https://docs.worldlabs.ai/api/reference/worlds/generate>
- <https://docs.worldlabs.ai/api/reference/openapi>
- <https://docs.worldlabs.ai/api/models>

### Hunyuan 3D

- OpenAI-compatible base：`https://api.ai3d.cloud.tencent.com`；
- submit：`POST /v1/ai3d/submit`；query：`POST /v1/ai3d/query`；
- API key 直接放入 `Authorization`，不增加 `Bearer `；
- 首版只支持 text prompt、专业版；官方 model values 当前包括 `3.0`、`3.1`，Prompt 上限为 1024 个 UTF-8 字符；真实 canary model 由 Human 在调用门选择；
- 腾讯 Cloud API 3.0 官方 schema 明确 submit `Response.JobId/RequestId`，query `Response.Status/ErrorCode/ErrorMessage/ResultFile3Ds/ResultCreditConsumed/RequestId`，状态为 `WAIT | RUN | FAIL | DONE`；
- OpenAI-compatible 页面只明确 endpoint、auth、request 字段与 model，没有公开完整 response envelope。因此计划把 Cloud API 3.0 `Response` envelope 作为受信 schema，把 DH-013 已有 query 可兼容的 top-level envelope 作为**明确标注的 product compatibility profile**，不把它伪称为官方事实；
- 实现可对两个 profile 写 exact codec 和 fake tests。2026-08-20 的 Human-authorized no-generation shape capture 已完成并冻结 live profile 为 `cloud-response-v1`；后续 canary 不得再次对旧 JobId 做 pre-submit capture。credential read/provider call前的本地profile或package-owned contract digest漂移稳定`PROVIDER_CONTRACT_MISMATCH`且零调用；paid submit已经发出后若2xx返回冻结profile以外的shape，因为不能证明上游没有建job，唯一durable结果是`submission_ambiguous(PROVIDER_SUBMISSION_AMBIGUOUS)`、不自动重提，并由Human决定是否修订；
- query 完成结果可包含多种文件，本切片只接纳唯一 GLB；query 可能返回实际积分消耗；余额查询不是本切片的完成条件。

官方来源：

- <https://cloud.tencent.com/document/product/1804/126189>
- <https://cloud.tencent.com/document/product/1804/120838>
- <https://cloud.tencent.com/document/product/1804/123447>
- <https://cloud.tencent.com/document/product/1804/123448>

现有 DH-013 canary 已独立证明上述两个 credential 形态、query 与 download 路径可用，但旧 canary 的固定 world/job/digest 不能冒充未来 generation 的 identity。

## 核心原则

### 1. 两个 implementation，不建立 Provider SDK

代码必须保留可见的 provider 语义：

```text
MarbleGenerationService
  submitMarbleWorld
  pollMarbleOperation
  resolveMarbleOutputs

HunyuanGenerationService
  submitHunyuanObject
  pollHunyuanJob
  resolveHunyuanGlb
```

允许共享的只有已经由两个真实调用方证明相同的基础设施：bounded body reader、deadline/abort、redaction、Data Root lease、OperationJournal、Artifact CAS 与 canonical JSON。不得创建 `ProviderAdapter`、plugin registry、capability discovery framework、通用 endpoint DSL 或 class hierarchy。

### 2. Generation truth、Artifact truth 与 World truth 分离

```text
GenerationJobRecord = provider control-plane evidence
VerifiedArtifactContentRecord = bytes + format + bounds 的内容事实
GenerationArtifactProvenance = provider job 与 content 的来源事实
GeneratedArtifactSet = 一次 generation 的完整输出集合与可见性事实
Snapshot / World Project = 被 Human 或未来 DH-018 显式组合后的世界事实
Presentation = 可丢弃 UI 状态
```

- prompt、provider job identity 与 sanitized cost 可以进入 generation receipt；credential、Authorization、signed URL、raw response/message 不得进入；
- provider `DONE` 只证明上游任务完成，不证明 Artifact 可用；
- download 完成只证明收到 bytes，不证明格式、bounds 或 identity；
- 只有 format inspection、finite bounds、budget、stable bytes、digest 与 durable registration 全部通过后，UI 才显示 `VERIFIED`；
- `VERIFIED` 不代表 metric scale、ground、collision、mass、calibration 或 navigation surface 已验证；这些仍需后续显式 authoring；
- Artifact registration 不调用 Repository，不创建 Snapshot，不推进 Ref，不改变 Episode/Evaluation/AdoptPolicy。

### 3. 显式 Human confirmation 是 server-side gate

Generation 使用两步协议：

1. `prepare`：严格解析 provider-specific request，生成 canonical request digest、显示 model/prompt/output/cost truth level，并创建短期、内存态、single-use confirmation；零 provider call、零 durable business mutation；
2. `confirm`：在同一server-trusted ProductSession route下提交 exact `generationId + confirmationId + requestDigest`。Gateway 先按 generation binding 进入 single-flight，然后依照下述固定 precedence决定是 replay、conflict，还是由唯一 leader 消费同session confirmation并建立 durable generation intent；只有最后一种情况允许一次 provider submit。

`prepare` 请求含 caller `idempotencyKey`，pattern 为 `[A-Za-z0-9._-]{1,96}`。Gateway 确定性生成：

```text
requestDigest = SHA-256("demiurges-generation-request-v1\0" + canonicalJson(requestBodyWithoutIdempotencyKey))
generationId  = "generation:sha256:" + SHA-256("demiurges-generation-id-v1\0" + idempotencyKey)
```

confirmation 的session authority只来自Gateway现有active ProductSession registry与route path `:sessionId`：canonical sessionId exact匹配`session:[A-Za-z0-9._-]{1,96}`，必须已存在且属于当前Gateway；body/header/cookie/query/localStorage都不能提供或覆盖session identity。prepare exact body仍只是provider-specific request + idempotencyKey，`requestDigest`继续排除idempotencyKey且不含sessionId，保证world/generation content binding与UI session解耦；server-created confirmation canonical payload则额外exact包含`sessionId/generationId/provider/model/canonicalRequest/requestDigest/expiresAt`。confirm exact body为`{confirmationId,requestDigest}`，generationId与sessionId只来自route；foreign session拿到同binding token也稳定`CONFIRMATION_REQUIRED`且不消费原token。TTL固定10分钟；confirmation不是durable job identity，刷新/重启后未消费confirmation失效。内存store hard cap为global 256项、每session 16项、单项canonical payload 16 KiB；每次prepare先按monotonic expiry清除expired entries，再在同一single-flight critical section检查per-session/global/byte cap，任一超限稳定返回`GENERATION_CAPACITY_REACHED`且不evict仍valid confirmation、provider call=0、Data Root mutation=0。consume/expiry/session teardown必须释放entry与byte accounting，counter由store exact entries重算而非caller维护。仅传 `confirmed: true`、仅靠前端 modal、快捷键或 hidden API 不满足 gate。

真实 canary 另需 Human 当轮明确给出：

- provider 与 model；
- exact prompt；
- 生成数量；
- v1 必须显式 `costUnknownAccepted=true`。因为两家现有 contract 都没有受信 pre-submit quote/provider cap，v1 不提供虚假的 numeric maximum；settled numeric cost 只在完成后展示与记录。未来只有在引入绑定 source/version/model/quantity 的可信 quote 或 worst-case price table 后，才可另立计划增加 numeric cap；
- 是否允许等待到完成并下载。

### 4. Idempotency 不伪装 upstream exactly-once

唯一 public durable identity 是上节确定性 `generationId`；不再另设含混的 client `operationId`。`generationId + requestDigest + provider + model` 形成唯一 durable binding：

- 同 key + 同 binding：replay 同一 durable state/result；
- 同 key + 不同 binding：`OPERATION_BINDING_CONFLICT`，零 provider call；
- 同一 binding 并发 confirm：只有 single-flight leader 可以 submit；follower 等待/replay 或 bounded abort，不能取消 leader；
- submit 前 durable 写入 `submit_started` evidence；收到合法 remote job identity 后先 durable publish binding，再开始 poll；
- 如果网络/进程在 provider 可能已接收、但 remote job identity 尚未 durable 的窗口失败，状态固定为 `PROVIDER_SUBMISSION_AMBIGUOUS`；不得自动重提、不得换 key、不得宣称失败或成功。首版由 Human/provider console 对账，未来若两家都提供可靠 request-id lookup 再另立切片自动 reconcile。

confirmation / replay precedence 冻结为：

1. 先按 `generationId` 进入 `GenerationSingleFlight`；
2. 若 durable binding 已存在：exact binding 返回 durable/in-flight state，confirmation 不再读取或消费；不同 binding 直接 conflict；
3. 只有 durable binding 不存在的 leader 才校验并原子消费 exact confirmation，然后 durable publish intent；
4. follower 永不二次消费 confirmation；
5. “replayed confirmation 拒绝”只适用于 durable/in-flight exact binding 均不存在、但 confirmation 已消费/过期/foreign 的请求。

因此 leader 响应丢失后的同 key/same binding retry 可以安全 replay，而另一个没有 durable binding 的旧 confirmation 仍会被拒绝。本切片保证“Demiurges 不自动重复付费提交”，不声称无法由 upstream contract 证明的 exactly-once。

exact durable binding 冻结为：

```ts
interface GenerationBindingBodyV1 {
  readonly schemaVersion: 1;
  readonly generationId: `generation:sha256:${string}`;
  readonly idempotencyKey: string;
  readonly provider: "worldlabs-marble-v1" | "hunyuan-ai3d-v1";
  readonly model: string;
  readonly contractProfile: string;
  readonly contractShapeDigest: string;
  readonly requestDigest: string;
  readonly canonicalRequest: Readonly<Record<string, unknown>>;
  readonly providerRequest: Readonly<Record<string, unknown>>;
  readonly costPolicy: "unknown-accepted";
  readonly executionPolicy: "wait-and-download";
}

interface GenerationIntentV1 extends GenerationBindingBodyV1 {
  readonly bindingDigest: string;
  readonly createdAt: string;
}
```

`idempotencyKey`必须重新通过`[A-Za-z0-9._-]{1,96}`。`contractProfile`对Marble exact为`worldlabs-openapi-2026-08-15-v1`，对Hunyuan exact为`cloud-response-v1 | compat-top-level-v1`；`contractShapeDigest`是对应package-owned exact schema descriptor（Hunyuan兼容profile来自获准capture）的64位lowercase SHA-256。prepare、restart、resume与每次provider call前，runtime configured profile/digest必须与durable binding byte-equal，否则`PROVIDER_CONTRACT_MISMATCH`且零provider call。`canonicalRequest`是去掉idempotencyKey后的product request：Marble exact为`{provider,model,prompt,seed?,costUnknownAccepted:true,waitForCompletionAndDownload:true}`，Hunyuan exact为`{provider,model,prompt,costUnknownAccepted:true,waitForCompletionAndDownload:true}`；`requestDigest`由它重算。`executionPolicy`必须与product request的literal `waitForCompletionAndDownload:true`互相derive并exact匹配；prepare可展示未勾选预览，但confirm必须拒绝false/缺失，不能把“只提交不等待”留成未持久化的UI选择。`providerRequest`是下文provider-specific pure projection的exact deep-frozen object，与实际上游发送对象byte-equivalent；decode必须重新derive并比较它，不能信任持久化副本。`createdAt`是UTC RFC3339 millisecond string，但不参与binding。公式为：

```text
bindingDigest = SHA-256("demiurges-generation-binding-v1\0" + canonicalJson(GenerationBindingBodyV1))
```

`intent.json` exact包含body全部字段、`bindingDigest`与`createdAt`；decode时重新计算`requestDigest/generationId/bindingDigest`。confirmation、single-flight、所有state records与replay都引用这一个binding，不复制规则。

### 5. Durable generation lifecycle

Generation 是长生命周期 control-plane state，不能伪装成 DH-016 `OperationJournal` 的单 intent/terminal operation。新增独立 `GenerationJournalV1`，位于：

```text
receipts/
  <existing DH-016 operation intent/result files>
  generations/
    namespace.json
    .namespace-install-intent.json
    data/<generation-id-digest>/
      intent.json
      records/<sequence>-<record-digest>.json
      head.json
      downloads/
    catalog/<generation-id-digest>.json
    birth-staging/<attempt-token>.json
```

- `<generation-id-digest>`是`generationId`中的64位lowercase digest；directory mode`0700`、files`0600`；Generation namespace exact entry set为`namespace.json/.namespace-install-intent.json/data/catalog/birth-staging`，每个generation data exact entry set为`intent.json/records/head.json/downloads`。`namespace.json`是exact canonical `{schemaVersion:1,namespace:"demiurges-generation-journal-v1",installOperationId,installBindingDigest,candidateDirectoryIdentity:{dev,ino,mode:448,uid,gid}}`，其中dev/ino/uid/gid均为canonical nonnegative decimal string、JSON mode 448即POSIX 0700；`.namespace-install-intent.json`必须是durable Operation intent receipt的same-inode hard-link，且两端canonical binding bytes exact。只有`catalog/<digest>.json`是generation birth visibility authority，`data/`与`downloads/`中的文件本身不使generation或Artifact可枚举/恢复/serve；
- Generation namespace首次安装不是裸`mkdir`序列，而是existing OperationJournal的package-internal短operation `generation.namespace.install`。identity推导必须严格无环并复用DH-016既有root authority：`dataRootIdentityDigest`逐字等于当前live `DataRootWriterLease.leaseDigest`，只能从held root fd的canonical decimal `dev/ino`按`SHA-256("demiurges-data-root-lease-v1\0<dev-decimal>\0<ino-decimal>")`重算，禁止从path、stored digest或caller input读取；同目录path alias必须相同，不同dev/ino必须不同。先冻结exact `NamespaceInstallSeedV1={schemaVersion:1,namespace:"demiurges-generation-journal-v1",entryNames:["namespace.json",".namespace-install-intent.json","data","catalog","birth-staging"]}`，`namespaceSeedDigest=SHA-256("demiurges-generation-namespace-seed-v1\0"+canonicalJson(seed))`；再以`operationId="op:generation-namespace-install-v1-"+SHA-256("demiurges-generation-namespace-operation-v1\0"+canonicalJson({dataRootIdentityDigest,namespaceSeedDigest}))`生成唯一ID，该ID逐字满足既有`^op:[A-Za-z0-9._-]{1,127}$`，不得放宽public grammar。Operation binding exact为`{schemaVersion:1,operationId,operationKind:"generation.namespace.install",target:{kind:"receipts-namespace",id:"receipts/generations"},expectedIdentity:null,candidateIdentity:{namespaceSeedDigest}}`，由既有`operationBindingDigest(requireOperationBinding(binding))`得到`installBindingDigest`；internal codec对该kind的success `publishedIdentity` exact为`namespaceSeedDigest`，terminal result仍使用既有exact result schema，package-root codec/facade继续拒绝internal kind。candidateIdentity不得包含`namespace.json`、`installBindingDigest`、marker、directory/file identity或任何由binding派生的digest；
- namespace internal Operation先durable admit exact intent并fsync receipts，再逐字沿用DH-016现有flat attempt grammar，在受控root `staging/<operationId>-<attemptToken>/generation-namespace/`以`mkdir 0700 + held O_DIRECTORY|O_NOFOLLOW fd`取得candidate directory stable identity；root Operation attempt token exact为`randomBytes(12).toString("hex")`产生的96-bit/24 lowercase hex，live admit与recovery/enumerator一致；独立Generation `birth-staging` token仍是128-bit/32 hex，两者不得混用。随后从durable `receipts/<operationId>.intent.json` no-replace hard-link为candidate内`.namespace-install-intent.json`，以open handles证明两名same dev/ino、nlink至少2、binding bytes exact并fsync candidate dir。然后才构造并write/fsync exact `namespaceBody`（其中`candidateDirectoryIdentity`必须等于held candidate dir fd），再mkdir/fsync `data/catalog/birth-staging`与candidate，完整重开验证五项entry set、directory identity、namespace body以及intent-marker hard-link。目录publish唯一允许package-owned `renameDirectoryNoReplace`：macOS实现必须调用`renameatx_np(AT_FDCWD=-2,source,AT_FDCWD=-2,destination,RENAME_EXCL=0x00000004)`并要求return 0；不得fallback为precheck+`renameSync`、覆盖rename、shell或copy。symbol/flags可用性先做零filesystem-mutation检查；语义probe只可在durable namespace install intent与exact flat attempt已建立后、global read-only preflight通过且namespace apply开始时，于该attempt内固定`.rename-probe/`子树运行，包含binding marker、bounded exact source/destination cases与stable identities。probe residue因此由同一Operation binding/attempt覆盖；crash后startup Phase A先验证exact probe shape/inodes，再由branded namespace plan继续或精确cleanup，foreign/extra/replacement residue保留并recovery-required。absent destination成功、destination existing empty dir/regular/symlink均不得替换且source identity保持；symbol/flags/semantics无法证明则writer保持blocked/reader-only、provider call=0。publish后fsync receipts；rename前后directory dev/ino必须相同，final marker仍须与durable intent receipt same inode。只有`publishedIdentity=namespaceSeedDigest`的durable success result发布并fsync receipts后才清理attempt中的probe与其余evidence；durable intent receipt与final `.namespace-install-intent.json`永久保留为外部inode anchor，不参与cleanup。live与recovery都必须从current live lease+seed重算operationId/binding/result identity，再验证final namespace body的candidate directory identity与intent hard-link，禁止信任stored derived digest。kill于intent、mkdir、intent hard-link、probe每个rename/cleanup、namespace write、每个child/fsync、publish rename、receipts fsync、result/cleanup均按同一binding/directory/marker inode收束；same marker bytes replacement inode、same body foreign binding、directory replacement或任一uncovered partial全部保留并`GENERATION_RECOVERY_REQUIRED`，零partial cleanup。generic public admit同样不能创建该internal kind；
- first generation admission在一个DataRoot capacity critical section内先为namespace install intent/result、final namespace entry与未来generated-set intent/result共预留5个root receipt slots；namespace已经exact installed时只需未来2 slots。若crash在namespace success后、generation birth前，三个actual entries保留，下一次birth只申请2；provider call始终为0直到generation birth完整且submit_started durable；
- `intent.json`是exact immutable binding；namespace已exact安装后，generation birth先在`data/<digest>`中构造完整`intent.json + records/0000000000000000-<digest>.json(admitted, recordedAt=intent.createdAt) + head.json + empty downloads/`，逐file与directory fsync并完整validate；再在`receipts/generations/birth-staging/<attempt-token>.json`写/fsync exact birth body`{generationId,bindingDigest,intentDigest,admittedRecordDigest}`，通过hard-link no-replace发布到`catalog/<digest>.json`并fsync catalog dir；随后必须以open handles重新证明staging与catalog为同dev/ino、same canonical body、link count符合预期，才unlink exact staging name并fsync birth-staging dir；`attempt-token`为128-bit lowercase hex且仅由journal生成；`intentDigest=SHA-256("demiurges-generation-intent-v1\0"+canonicalJson(intent))`；birth pointer staging不使用DH-016 root `staging/`；
- crash在birth catalog pointer前只留下hidden data/staging orphan，不形成durable generation且provider call count=0；same key可重新prepare/confirm并exact复用或清理hidden data。catalog pointer可见后，startup必须先验证pointer与完整三件套、head/record/binding exact并补fsync相关parents；若同binding staging candidate仍存在，必须先证明与catalog同inode/body，再unlink candidate并fsync birth-staging；candidate foreign inode/body、duplicate candidates或identity ambiguity保留全量证据并`GENERATION_RECOVERY_REQUIRED`。成功后才承认`admitted`。pointer指向intent-only、record/head缺失、partial birth或foreign inode一律recovery-required且绝不submit/cleanup；catalog absent的data不得被当作generation；
- 每个 state record 是 exact-key canonical JSON，包含 `schemaVersion/generationId/bindingDigest/sequence/previousRecordDigest/state/payload/recordedAt`；sequence从`0`开始，sequence 0必须是`admitted`且`previousRecordDigest=null`，其余严格+1；filename exact为16位零填充十进制sequence、`-`、64位lowercase digest、`.json`；
- `recordDigest = SHA-256("demiurges-generation-state-v1\0" + canonicalJson(recordBodyWithoutRecordDigest))`；
- birth之后publish state使用唯一deterministic pending-record authority，不允许任意ignored orphan。先从current head + requested closed transition在single-flight内确定一次`recordedAt`与exact next raw record/digest，以`O_CREAT|O_EXCL|O_NOFOLLOW`写`records/.record.next`、validate、file fsync/close，用held fd冻结`recordFileIdentity={dev,ino,mode:384,uid,gid}`；再以O_EXCL写/fsync exact `records/.record.next.witness = {schemaVersion:1,generationId,sequence,recordDigest,recordName:".record.next",recordFileIdentity}`，close并fsync records dir。dev/ino/uid/gid是canonical nonnegative decimal strings，mode 384即0600；witness bytes最大1 KiB、unknown key/type/range拒绝。只有witness name与directory fsync durable后，该pair才是可跨restart消费的pending authority；kill于`.record.next` create/write/file-fsync后但witness durable前，现场保留并`GENERATION_RECOVERY_REQUIRED`，不按bytes/path猜测铸造witness或cleanup。随后no-replace hard-link `.record.next`同inode到final `<sequence>-<digest>.json`，用witness + open handles证明same original inode/body/nlink后fsync records dir；再写`head.next`/fsync/close、atomic rename为`head.json`、fsync generation dir。new head exact引用final后，每次cleanup前都重验witness中original identity与final：先unlink same-inode `.record.next`并fsync records dir，再unlink exact witness并再fsync；kill于任一unlink/fsync可由head final + witness幂等继续。raw committed final record不含file identity，其canonical digest/golden vector不变。crash重启必须复用witness所冻结的原inode与`.record.next`中原recordedAt/digest，禁止重新取时间或生成第二filename。任何provider side effect只允许在相应new head已durable后发生；
- `head.json`只含exact `generationId/sequence/recordDigest`。records directory exact shape为head chain的final raw record files，加上至多一对`.record.next + .record.next.witness`与该next的至多一个same-inode pending final hard-link；不存在“忽略任意orphan”规则。head仍旧时，witness必须exact指向`.record.next`的current dev/ino与唯一sequence=head+1 digest，pending final name absent或same original inode；head已推进时，witness/next若存在必须与head final original inode exact并只可执行上述授权cleanup。witness durable后`.record.next`或pending final任一same-bytes replacement inode，两个data names同时替换为same new inode，witness缺失/替换为different bytes或wrong type，`.record.next` missing+未引用final、第二个unreferenced final、extra/symlink全部`GENERATION_RECOVERY_REQUIRED`且不cleanup。byte-identical witness replacement仍指向original record inode，不能为new record inode扩张authority。`head.next`只允许exact current pending digest，若未rename则按same transition继续而非盲删。head指向缺失/错误record、broken previous chain、sequence gap或binding drift同样fail closed；
- GenerationJournal 有独立 `GenerationSingleFlight`，不导出 raw writer；所有写入从开始到最后一次 fs mutation持有同一 live Data Root writer lease。

persisted lifecycle hard limits：Data Root最多256个birth catalog pointers、最多256个data directories、单generation最多512个committed records、全root最多8192个committed records、最多16个generation-birth staging candidates、最多2个poll cycles（initial + 一次Human resume）、同时active最多8个。每个state record canonical bytes最大64 KiB，pending witness最大1 KiB；单generation `records/` physical entry最多514（最多511个已commit final + `.record.next` + `.record.next.witness` + pending final，或512个已commit且无pending），按unique inode累计bytes最多32 MiB；全root physical record entries最多8704（8192 committed + 最多256 generations各2个pending auxiliary names），unique-inode bytes最多525 MiB。每个records directory与root aggregate都用directory-handle incremental scan在limit+1立即停止，先验证entry count/filename/type/inode与byte budget再decode chain，禁止`readdirSync`无界物化；重复kill不得生成第二pending digest。existing root `receipts/` enumerator也必须改为directory-handle incremental scan，在第2049项立即停止并`OPERATION_RECOVERY_REQUIRED`，不得先用`readdirSync`物化任意大array；exact一个real `generations/` directory按既有receipt cap计1，其余仍只接受closed intent/result filenames。每个generation `downloads/`按role串行fetch，Marble最多4个real regular entries/96 MiB、Hunyuan最多2 entries/128 MiB；entry只能是已经被state引用的`.bin`，或当前串行attempt的同inode hard-link pair `.owner + (.next | .bin)`。因此Marble在第一member已成为referenced `.bin`、第二member下载中时最多3个entry，Hunyuan下载中最多2个entry；预留的第四个Marble slot只作为`limit+1` fail-closed探针，不允许第二个并发attempt。`reserved`与`discarded` state要求该attempt零filesystem entry；`owned-next` state要求exact一个`.owner`与exact一个同inode`.next|.bin`；`discard-authorized` state允许该exact pair、只剩其中任一exact inode name或两者均absent，因为丢弃authority已经durable；`cleanup-authorized` state允许同inode `.owner + .bin`或仅exact `.bin`，因为candidate owner unlink authority已经durable；`candidate` state要求exact一个referenced `.bin`且owner absent。开始下一attempt前，旧attempt必须先从`owned-next`写入durable `discard-authorized`，按frozen dev/ino清掉exact pair、fsync并写入`discarded`；`owned-next`本身不是unlink authority，没有durable inode witness或对应cleanup authorization的同名文件永不自动删除。filename exact role/cycle/attempt/checkpoint digest，symlink/wrong type/extra/over-budget/foreign inode fail closed。startup用directory handle逐entry读取并在`limit+1`立即停止，不得用会先物化任意大array的无界`readdirSync`；先计数再进入chain decode，任一超限稳定`GENERATION_RECOVERY_REQUIRED`且不开mutation routes。startup generation scan总deadline固定5秒，超时同样fail closed。catalog absent的data/staging仅在exact self-consistent binding、无provider-side-effect state且无foreign entry时可清理；catalog存在时data/pointer必须exact，否则保留并recovery-required。verified或terminal artifact rejection state durable后，以same-path/dev/ino/digest proof删除其private download candidates并fsync；timed_out保留referenced candidates供cycle2 exact复用。v1不自动删除历史；达到256时新prepare返回`GENERATION_CAPACITY_REACHED`，未来归档/GC另立切片。

Generation record capacity不是“写到上限再报错”。`GenerationCapacityAuthority`在同一live writer lease与Data Root级single-flight内，从全部catalog pointer和exact chain重算：terminal generation贡献其actual committed record count；每个active/nonterminal generation固定占用512个slots（包含它已经写入的records）；新generation birth还需要一个512-slot reservation。只有`sum(terminalActual + activeReserved512) + requestedReservation <= 8192`时才能发布birth catalog；provider side effect前再次验证同一reservation仍成立。terminal transition把该generation的512 reservation转换为actual count并释放余量。reservation不另存可漂移counter，完全由durable chains重建；concurrent confirm、restart、8190/8191附近以及8个active并发必须用fake clock/process证明付费fetch前可闭合整个生命周期。

existing `OperationJournal`保持单intent/terminal语义，只增加两个closed internal kinds：`generation.namespace.install`与`artifact.publish-generated-set`。其receipt enumerator允许并验证exact real directory`receipts/generations`，仍拒绝任何其他未知entry；GenerationJournal的live/startup/pending/terminal enumerator全部要求该目录entry set exact为`namespace.json/.namespace-install-intent.json/data/catalog/birth-staging`，并逐次验证marker与durable root intent same inode/body；marker missing、symlink、wrong type、foreign/replacement inode或任何extra entry均fail closed。startup不再让一个会mutation的DH-016 recovery先于Generation truth；它拆成全局只读preflight与分阶段apply：

1. acquire Data Root writer lease；
2. 用package-owned read-only `inspectPendingOperations`冻结全部Operation receipts/bindings、Project/Artifact evidence与cleanup identities，但不finalize、不cleanup；同时完整validateGeneration namespace/catalog/intent/chain/capacity与generated artifact immutable evidence。namespace absent且无install intent是合法empty；namespace absent且存在exact pending install时只验证其Operation attempt/candidate并生成install plan，不能要求尚未published的Generation tree；其他partial/mismatch均全局零mutation；
3. 对每个`artifact.publish-generated-set`，用受信Generation chain、remote binding与观察到的artifact/catalog/result证据运行完整join preflight，生成不可伪造的recovery plan；普通DH-016 operations也生成原有exact recovery plan；直到所有bindings/joins都通过，不执行任何recovery mutation；
4. 在同一冻结证据和逐项near-mutation revalidation下，先apply namespace install（若有），再apply普通Project/Artifact/bundle recovery，再apply generated-set recovery；任何中途drift停止，保留尚未cleanup证据，沿用DH-016 Option A边界；
5. 根据generated-set result把Generation `publishing`收束为`verified`或`recovery_required`；随后对`admitted`注册一次安全submit continuation，对`pre_submit_blocked`等待Human，对`remote_bound|polling`注册只消费durable remaining budget的resume，对`submit_started`无remote binding写`submission_ambiguous`且绝不submit；
6. 所有preflight/recovery/reconciliation完成后才开放generation与既有business mutation routes。

现有`recoverPendingOperations`因此必须被最小拆分/包装成read-only inspection + apply plan，而不是在generated-set kind上补skip分支。原DH-016 crash、global preflight与near-cleanup identity tests必须继续通过；新增混合Project/Artifact/generated-set/Generation drift矩阵证明任何first mutation前已验证全root依赖。

`receipts/`的2048-entry上限由共享package-owned `DataRootCapacityAuthority`统一管理，不允许GenerationJournal与OperationJournal各算一套。under同一Data Root writer lease与global capacity single-flight，admission必须先按磁盘exact重算：

```text
used = receipts/ 当前实际entries（generations/本身计1）
pendingResultReservations = 每个已有Operation intent但无result预留1
generationPublicationReservations = 每个尚可能publish set、且没有exact matching generated-set intent/result的generation预留2
namespaceOutstandingReservation =
  absent且无install intent为3（future install intent + result + final namespace entry）；
  exact install intent pending且final namespace absent为1（used已含intent，pendingResultReservations已含result，只剩final entry）；
  final namespace已publish且install result pending为0（used已含intent+namespace，pendingResultReservations已含result）；
  exact terminal installed为0（used已含intent+result+namespace）
requested = 新普通Operation为2；新generation birth为2；其他为0
admit iff used + pendingResultReservations + generationPublicationReservations + namespaceOutstandingReservation + requested <= 2048
```

generation的2 slots覆盖未来`artifact.publish-generated-set` intent+result。首个generation composite admission在上述四种namespace状态下总占用都必须恰为5 slots：infrastructure actual+outstanding合计3，new generation future publication requested 2；intent/result/final entry一旦从reservation变actual，必须1:1转换且不double count。install operation从durable intent起对exact partial candidate执行idempotent local completion，安全缺失/partial只会继续并最终success，不产生`aborted-before-publish` terminal；foreign/identity/fsync ambiguity则保留并recovery-required。crash若只完成namespace而未birth，provider call仍为0，后续birth重新申请2 slots。read-only startup不会为了“看看有没有generation”创建namespace。

generated-set reservation handoff的live顺序唯一为**intent-first**：完整private candidate join→共享capacity/single-flight重验该generation的2-slot reservation→用module-private coordinator发布并fsync exact `artifact.publish-generated-set` intent（Generation head此时仍可为`validating`）→重算capacity确认actual intent 1 + pending result reservation 1已exact接管原2 slots→才append/fsync `publishing={operationId,artifactSetDigest}` state/head→才允许public CAS first mutation。同一critical section只保护并发，不被当作crash atomicity；跨重启的接管authority是durable exact Operation intent。“exact matching”必须由candidate join重算并逐字证明operation kind/id、generationId target、artifactSetDigest candidate、bindingDigest与Generation intent/remote-bound/candidates一致；同generation的conflicting/extra intent全局零mutation、保留并`GENERATION_RECOVERY_REQUIRED`。

receipt reservation分类必须穷尽：没有exact matching publication intent/result的`admitted/pre_submit_blocked/submit_started/remote_bound/polling/timed_out(cycle1)/outputs_ready/downloading/validating`各占2；`submission_ambiguous`与无matching intent/result的`recovery_required`在v1永久占2。一旦任意上述尚可publish state（包括`validating`）出现exact matching intent但无result，generation reservation立即计0，由`used`中intent 1 + `pendingResultReservations` 1接管；matching intent+result由`used`计2，generation reservation为0，即使Generation state尚未进入`publishing/verified`也不double count。`verified/provider_failed/artifact_rejected/timed_out(cycle2)`本身不再预留，但若观察到与其语义冲突的publication intent/result则recovery-required，不用capacity算法猜测释放。startup的`validating + exact intent + no result`必须在全局read-only preflight通过后先幂等append `publishing`，再进入generated-set recovery，此前public CAS=0；`publishing + no intent`是不可由live path生成的drift，保留2-slot reservation、保留全量evidence并`GENERATION_RECOVERY_REQUIRED`，不回退、不补猜测intent。matching result已durable但Generation state落后时，由published join决定收敛`verified|recovery_required`，actual slots仍exact 2。未来释放ambiguous/recovery-required必须另立有Human authority的durable terminal state，当前实现不得猜测。所有Project/Artifact/bundle/generated-set Operation admission都必须调用同一authority，不能让旧route绕过reservation。startup从durable Operation receipts与Generation chains重建，不信任内存counter；confirm与每次provider side effect前复验。legacy root在2044..2048 entries对namespace absent/no-intent、intent-pending、directory-published/result-pending、terminal-installed四态逐一做pending Operation、active generation、并发admission、crash/restart矩阵；另在`validating→intent durable→publishing head durable`的每个intent link/fsync与record/head/fsync边界kill，证明publication actual+reservation始终exact 2、public CAS=0，而人工构造的`publishing + no intent`稳定保留2并fail closed。

最终 Artifact set publish 是**另一条短生命周期** global operation：

```text
operationKind = artifact.publish-generated-set
operationId   = "op:" + SHA-256("demiurges-generated-set-publication-v1\0" + generationId + "\0" + artifactSetDigest)
```

它只在全部 outputs 已下载、inspect 并冻结 exact set candidate 后创建，使用既有 OperationJournal/OperationSingleFlight；GenerationJournal state 只引用其 binding/result identity，不取代它。

`artifact.publish-generated-set`对existing `OperationJournal`的exact扩展为：

```ts
{
  schemaVersion: 1,
  operationId,
  operationKind: "artifact.publish-generated-set",
  target: { kind: "registry", id: "registry:generated-artifact-sets-v1" },
  expectedIdentity: null,
  candidateIdentity: {
    generationId,
    artifactSetDigest,
    orderedContentRecordDigests,
    orderedProvenanceRecordDigests
  }
}
```

arrays必须与set descriptor ordered members逐项exact。先对上述不含catalog的binding调用现有`operationBindingDigest(requireOperationBinding(binding))`得到`publicationBindingDigest`，再构造exact `catalogBody={generationId,artifactSetDigest,publicationOperationId,publicationBindingDigest}`；`catalogDigest = SHA-256("demiurges-generated-artifact-catalog-v1\0" + canonicalJson(catalogBody))`仅用于catalog file identity，不反向进入binding，避免循环hash。success terminal的`publishedIdentity` exact为`artifactSetDigest`；target/candidate/catalog/terminal任一漂移在publish/recovery mutation前拒绝。

现有package-root `OperationJournal`不能成为internal-kind绕过面。package-root compatibility facade的**全部** authority-minting/mutation入口——至少包括`admit`、`beginRecovery`、`inspectExistingAttempts`、`confirmExistingTerminal`、`finalizeSuccess`、`finalizeAborted`与`cleanupAttempt`——都只能消费既有public Operation kinds；只要binding、durable intent、`AdmittedOperation`或replay evidence属于`generation.namespace.install | artifact.publish-generated-set`，必须在创建attempt、铸造authority、写receipt或cleanup前稳定拒绝且零mutation。不能只在`admit()`加guard，因为recovery/finalizer同样能铸造或消费live authority。

两个internal kinds共用同一个module-private Operation core，但不经过package-root facade：namespace installer在composite capacity authority下取得不可导出的`NamespaceInstallCapability`；generated-set由package-internal `GeneratedArtifactPublicationCoordinator`在完整candidate join后铸造WeakSet/WeakMap provenance的`GeneratedSetAdmissionCapability`。private core逐次验证capability、exact binding、root、live lease、single-flight与consumed状态后，才允许internal admit/recovery/finalize/cleanup；capability不能结构化伪造、序列化或从package root导出，且只可消费一次。startup coordinator只能接收全局preflight生成的branded recovery plan，不得把raw `OperationJournal`或internal `AdmittedOperation`返回给调用方。package root只导出safe facades，内部完成validate→capacity→single-flight→admit→publish，绝不暴露raw CAS、record writer、internal coordinator、private core或capability；既有public Operation kinds/API保持兼容。

Generation state machine：

```text
prepared (memory-only)
  → admitted
      ├─ local preflight failure → pre_submit_blocked ── Human resume → admitted
      └─ local preflight success → submit_started
          ├─ provider-specific proven non-creation rejection → provider_failed
          ├─ no trustworthy remote identity → submission_ambiguous
          └─ remote_bound(remoteJobId) → polling
                                      → provider_failed | timed_out | outputs_ready
  → downloading
  → validating
  → publishing
  → verified | artifact_rejected | submission_ambiguous | recovery_required
```

- `admitted`证明还没有执行provider fetch，可由startup continuation或same-binding confirm安全继续；credential unavailable、local request construction/abort在fetch前失败写`pre_submit_blocked(code,preSubmitResumeCount)`，Human resume可回到admitted continuation且不需要新confirmation；pre-submit resume同样最多8次且与poll cycle分开计数；
- `submit_started`必须在调用fetch前durable，submit classification是provider-specific closed matrix，绝不把一家的no-creation语义外推给另一家。World Labs only：current frozen OpenAPI明确描述的400 invalid/policy、402 insufficient credits、422 validation以及401 unauthorized，在response通过exact status/body budget与redaction mapping且不含成功Operation identity时，才可进入对应`provider_failed`；429、5xx、transport/deadline/body-stream error、malformed/profile-drift 2xx或任何含矛盾identity的response进入`submission_ambiguous`。Hunyuan OpenAI-compatible submit：fetch一旦开始，只要未得到通过frozen profile codec的trustworthy JobId/RequestId binding，无论HTTP status是400/401/402/422/429/5xx、其他status、malformed/profile-drift 2xx、transport/deadline/body-stream error，唯一durable state/code都是`submission_ambiguous(PROVIDER_SUBMISSION_AMBIGUOUS)`；只有未来另行Human-authorized、注明source/date/hash且能证明exact non-creation shape/status的contract capture，才可经fresh review增加Hunyuan non-creation分支。两家ambiguous都不得自动或resume重提。`PROVIDER_CONTRACT_MISMATCH`只用于provider call前本地profile drift，或已绑定remote identity后的poll/query codec drift；
- restart 只能从已 durable remote job binding 恢复 poll；`submit_started` 且无 remote identity 必须进入 ambiguous；
- `submission_ambiguous` 是terminal-for-automation、仅供Human线下对账的信息态：GET/list可见，但v1没有reconcile/abandon transition，confirm/resume都不发送provider request，receipt reservation永久保留；未来对账收束另立切片；
- 每次 upstream call 有独立 deadline；每次poll query前必须先durable append包含本cycle累计attempt的`polling` checkpoint，crash保守地消耗该attempt。startup只继承同一cycle剩余attempts与绝对`deadlineAt`，不得因为进程重启获得新budget；
- poll超时不会删除remote job binding。只允许一次Human显式resume开启cycle 2；cycle 2耗尽后仍保持`timed_out`且不能再resume。wall-clock rollback到早于最近`recordedAt`时`GENERATION_RECOVERY_REQUIRED`，单次transport timeout仍由monotonic clock执行；
- raw provider response 不落盘。只保留 provider、model、public remote identity、sanitized status、stable public code、时间、request digest、输出 record IDs 与 provider 返回的 numeric cost（若存在且 finite）。

所有record的`recordedAt` exact匹配`^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$`并要求`new Date(value).toISOString()===value`；`sequence`是`0..511`整数，`preSubmitResumeCount`是`0..8`整数，`cycleCount`只允许`1 | 2`，Marble `attemptCount`是`0..80`、Hunyuan是`0..120`，`submitAttempt`只允许literal `1`。`cycleStartedAt/deadlineAt`同为canonical UTC RFC3339 milliseconds且deadline必须严格晚于start。payload是以下closed discriminated schema，不是任意plain object：

```ts
type RemoteBoundPayloadV1 =
  | { readonly provider: "worldlabs-marble-v1"; readonly remoteJobId: string; readonly providerRequestId: null }
  | { readonly provider: "hunyuan-ai3d-v1"; readonly remoteJobId: string; readonly providerRequestId: string };

type RemoteOutputIdentityV1 =
  | { readonly kind: "marble-world"; readonly operationId: string; readonly worldId: string; readonly spzKey: "500k"; readonly colliderField: "collider_mesh_url" }
  | { readonly kind: "hunyuan-file-set"; readonly jobId: string; readonly glbCount: 1; readonly objCount: 0 | 1 };

type SanitizedCostV1 = {
  readonly unit: "worldlabs-credit" | "hunyuan-credit";
  readonly amount: string;
};

type PollBudgetV1 = {
  readonly cycleCount: 1 | 2;
  readonly attemptCount: number;
  readonly cycleStartedAt: string;
  readonly deadlineAt: string;
};

type ArtifactInspectorDescriptorV1 = {
  readonly schemaVersion: 1;
  readonly inspectorProfile: "spz-v2-position-bounds-v1" | "glb-2.0-scene-bounds-v1";
  readonly format: "spz-v2" | "glb-2.0";
  readonly contentDigest: string;
  readonly byteLength: number;
  readonly elementCount: number;
  readonly sourceBounds: { readonly min: Vec3; readonly max: Vec3 };
};

type DownloadCandidateV1 = {
  readonly candidateName: string;
  readonly attemptCheckpointRecordDigest: string;
  readonly fileIdentity: { readonly dev: string; readonly ino: string; readonly mode: 0o600; readonly uid: number; readonly gid: number };
  readonly digest: string;
  readonly byteLength: number;
  readonly format: "spz-v2" | "glb-2.0";
  readonly elementCount: number;
  readonly sourceBounds: { readonly min: Vec3; readonly max: Vec3 };
  readonly inspectorDescriptor: ArtifactInspectorDescriptorV1;
  readonly inspectorDescriptorDigest: string;
};

type DownloadDiscardDispositionV1 =
  | { readonly kind: "retry-transient" }
  | { readonly kind: "reject-artifact"; readonly code: "DOWNLOAD_REJECTED" | "ARTIFACT_VALIDATION_FAILED" };

type DownloadDiscardWitnessV1 = {
  readonly outputRole: GeneratedArtifactOutputRole;
  readonly cycleCount: 1 | 2;
  readonly downloadAttemptCount: 1 | 2;
  readonly attemptCheckpointRecordDigest: string;
  readonly dataName: string;
  readonly ownerName: string;
  readonly fileIdentity: { readonly dev: string; readonly ino: string; readonly mode: 0o600; readonly uid: number; readonly gid: number };
  readonly disposition: DownloadDiscardDispositionV1;
};

type ArtifactRejectedPayloadV1 = {
  readonly code: "DOWNLOAD_REJECTED" | "ARTIFACT_VALIDATION_FAILED";
  readonly discardWitness: DownloadDiscardWitnessV1;
};

type DownloadMemberBudgetV1 =
  | { readonly outputRole: GeneratedArtifactOutputRole; readonly downloadAttemptCount: 0; readonly stage: "idle"; readonly candidate: null }
  | { readonly outputRole: GeneratedArtifactOutputRole; readonly downloadAttemptCount: 1 | 2; readonly stage: "reserved"; readonly candidate: null }
  | {
      readonly outputRole: GeneratedArtifactOutputRole;
      readonly downloadAttemptCount: 1 | 2;
      readonly stage: "owned-next";
      readonly attemptCheckpointRecordDigest: string;
      readonly nextName: string;
      readonly ownerName: string;
      readonly fileIdentity: { readonly dev: string; readonly ino: string; readonly mode: 0o600; readonly uid: number; readonly gid: number };
      readonly candidate: null;
    }
  | {
      readonly outputRole: GeneratedArtifactOutputRole;
      readonly downloadAttemptCount: 1 | 2;
      readonly stage: "discard-authorized";
      readonly discardWitness: DownloadDiscardWitnessV1;
      readonly candidate: null;
    }
  | {
      readonly outputRole: GeneratedArtifactOutputRole;
      readonly downloadAttemptCount: 1 | 2;
      readonly stage: "discarded";
      readonly discardWitness: DownloadDiscardWitnessV1;
      readonly candidate: null;
    }
  | {
      readonly outputRole: GeneratedArtifactOutputRole;
      readonly downloadAttemptCount: 1 | 2;
      readonly stage: "cleanup-authorized";
      readonly ownerName: string;
      readonly candidate: DownloadCandidateV1;
    }
  | { readonly outputRole: GeneratedArtifactOutputRole; readonly downloadAttemptCount: 1 | 2; readonly stage: "candidate"; readonly candidate: DownloadCandidateV1 };

type DownloadBudgetV1 = {
  readonly pollBudget: PollBudgetV1;
  readonly metadataRefreshCount: 0 | 1;
  readonly orderedMembers: readonly DownloadMemberBudgetV1[];
};

type TimedOutPayloadV1 =
  | { readonly code: "POLL_DEADLINE_EXCEEDED"; readonly resumeStage: "poll"; readonly pollBudget: PollBudgetV1 }
  | { readonly code: "POLL_DEADLINE_EXCEEDED"; readonly resumeStage: "download"; readonly downloadBudget: DownloadBudgetV1 };
```

Marble IDs复用下文safe-ID pattern；Hunyuan `remoteJobId/providerRequestId`复用JobId/UUID pattern。`SanitizedCostV1.amount`由唯一total cost字段做15-significant-digit、`-0→0` canonicalization后转成non-exponent decimal，exact匹配`(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{0,5}[1-9])?`；不保存line items/details/raw label。unit必须与provider匹配。`RemoteOutputIdentityV1`从当前terminal response重新derive，必须绑定durable remote job且不含URL；drift在download/state append前拒绝。

state payload exact映射：`admitted={}`；`pre_submit_blocked={code,preSubmitResumeCount}`；`submit_started={submitAttempt:1}`；`remote_bound=RemoteBoundPayloadV1`；`polling=PollBudgetV1`；`timed_out=TimedOutPayloadV1`；`provider_failed={code,sanitizedCost?:SanitizedCostV1}`；`outputs_ready={remoteOutputIdentity,downloadBudget,sanitizedCost?:SanitizedCostV1}`；`downloading|validating={remoteOutputIdentity,downloadBudget}`；`publishing={operationId,artifactSetDigest}`；`verified={artifactSetDigest,publicationOperationId}`；`artifact_rejected=ArtifactRejectedPayloadV1`；`submission_ambiguous|recovery_required={code}`。`outputs_ready`从产生DONE/World结果的current `PollBudgetV1`继承cycle/attempt/deadline，原子初始化provider-exact ordered members、全部`downloadAttemptCount=0/stage="idle"/candidate=null`与`metadataRefreshCount=0`，不含URL。Hunyuan `provider_failed`可选合法sanitizedCost；Marble `provider_failed`禁止cost。terminal state之后不得append；`timed_out`仅当其内层cycleCount===1可由Human转入全新cycle 2，重新query remote metadata并生成cycle-2 DownloadBudget；`pre_submit_blocked`仅Human resume且`preSubmitResumeCount<8`可回到`admitted`。

restart state closure：`remote_bound`创建cycle 1 budget后poll；`polling`只消费durable remaining attempts/deadline；`outputs_ready|downloading|validating`只消费durable `DownloadBudgetV1`的remaining refresh/member attempts。`orderedMembers`的provider-required role/order/length从outputs_ready起固定；每条后继record至多改变一个active member（或只改变global poll/refresh fields），所有未变化member必须从immediate predecessor byte-exact carry-forward。candidate lineage使用“introduction + carry”规则：某member第一次从`cleanup-authorized`变为`candidate`时，immediate predecessor必须正是它自己的same-checkpoint/inode cleanup-authorized；以后其他member/global字段变化时，该candidate必须与immediate predecessor byte-exact unchanged，并且bounded chain scan必须追溯到唯一introduction record，途中不得出现第二次introduction、candidate drift或回退。cycle 1 `timed_out(resumeStage="download")`进入cycle 2时，已有candidate members连同其cycle-1 filename/checkpoint/inode/descriptor byte-exact retained且继续用同一introduction proof；仅未完成members在新cycle reset为idle并按cycle-2 filename开始。每个member fetch严格执行以下single-writer协议，且任何一步都不得写public Artifact CAS：

1. 先append `downloadAttemptCount+1 / stage="reserved" / candidate=null`；该committed state record的digest是本attempt唯一`attemptCheckpointRecordDigest`。`reserved`时downloads中该attempt必须零entry；
2. 以`O_CREAT|O_EXCL|O_NOFOLLOW`创建`<role>-c<cycle>-a<attempt>-<checkpointDigest>.next`，取得并冻结`dev/ino/mode/uid/gid`，再no-replace hard-link同一inode为同basename`.owner`并fsync downloads dir；随后append `stage="owned-next"`，exact记录checkpoint digest、两个filename与file identity。decoder必须证明`attemptCheckpointRecordDigest`指向chain中的immediate predecessor，且该predecessor正是同role/cycle/attempt的`reserved` record；candidate state再证明它沿用同一checkpoint与file identity。只有owned-next state durable后才允许写stream bytes；
3. 若crash发生在`.next`创建与owned-next state/head durable之间，任何现存`.next/.owner`都没有durable inode authority：startup必须保留现场并`GENERATION_RECOVERY_REQUIRED`，绝不按filename、bytes或同名owner猜测unlink。若owned-next已durable，则每次继续、清理、rename前必须证明`.next|.bin`与`.owner`仍为recorded同一`dev/ino`、regular `0600`、expected uid/gid；byte-identical replacement同样拒绝；
4. stream在累计budget内完成后fsync/close、pure inspect，再把recorded `.next` no-replace rename为同basename`.bin`并fsync downloads dir；`.owner`作为同inode hard-link保持。重开`.bin`并复验owner/file identity、bytes与descriptor，构造携带原checkpoint digest与同一file identity的`DownloadCandidateV1`，但此时尚未成为trusted candidate；
5. 成功分支先append `stage="cleanup-authorized"`，exact持久化`ownerName + DownloadCandidateV1`。decoder必须证明它的immediate predecessor是同checkpoint/inode的`owned-next`，且`.owner/.bin`在commit前仍为recorded同一inode。该record是成功candidate分支唯一的owner unlink authority；
6. cleanup-authorized durable后，重验`.bin`为recorded inode。若owner存在，必须与`.bin`同inode才可unlink并fsync downloads dir；若owner已absent，则视为前一进程已执行被durable授权的cleanup，可幂等继续，但`.bin`仍须exact。owner replaced/foreign或`.bin`missing/replaced一律保留并recovery-required；
7. owner absent与`.bin` exact均证明后，才append最终`stage="candidate"`。candidate首次引入decoder必须证明该member在immediate predecessor中是同一`cleanup-authorized` record；后续records按上文carry rule验证，不重复要求整条Generation record的immediate predecessor仍是旧cleanup-authorized。candidate state要求owner absent，owner重新出现视为foreign drift。只有这个最终state可参加set join。这样kill在authorization前的missing owner fail closed，kill在unlink/fsync后可由durable authorization安全收束，不把正常cleanup与未授权删除混为一谈。

失败/不完整attempt使用另一条closed branch，绝不把`owned-next`本身解释成删除权限：

1. partial stream、truncation、transient fetch failure或inspect确定的terminal artifact rejection发生后，先重验`.owner + (.next | .bin)`仍是`owned-next`记录的同一inode，再由package-owned pure constructor铸造唯一`DownloadDiscardWitnessV1`并append `stage="discard-authorized"`；witness exact携带immediate `owned-next` predecessor的role/cycle/attempt/checkpoint、当前data filename、owner filename、file identity与disposition，外层state的role/attempt必须与witness byte-exact。仍有retry allowance的transient只能写`{kind:"retry-transient"}`；URL/redirect/credential-boundary、media type或body-budget拒绝写`{kind:"reject-artifact",code:"DOWNLOAD_REJECTED"}`；格式、完整性或inspector拒绝写`{kind:"reject-artifact",code:"ARTIFACT_VALIDATION_FAILED"}`。code在删除bytes前由对应pure validator的closed outcome唯一derive；route/caller不得构造、覆盖或选择witness/disposition。初始URL/host等pre-fetch policy也在owned pair durable后、任何network fetch前由pure validator判定，因此所有`artifact_rejected`均有同一witness lineage且invalid URL的provider/download call count=0。commit前必须两名都存在、同inode且无额外entry；
2. 只有durable `discard-authorized`是失败分支的unlink authority。其后允许的现场仅为“两个exact names都存在且同recorded inode”“只剩任一exact recorded inode name”或“两者均absent”；逐个unlink前都用open handle重验remaining name的dev/ino/mode/uid/gid，删除全部remaining authorized names并fsync downloads dir。任何replacement/foreign inode、未授权第三名、或authorization前的任一missing name都保留并`GENERATION_RECOVERY_REQUIRED`；kill在任一次unlink或directory fsync边界均可按同一durable authorization幂等继续；
3. 两个authorized names都absent且downloads dir fsync完成后，才append `stage="discarded"`；decoder要求immediate predecessor为`discard-authorized`并把完整`DownloadDiscardWitnessV1` byte-exact复制到本record，外层role/attempt仍须与witness一致，且该attempt零entry。`discarded(witness.disposition.kind="retry-transient")`在attempt 1且仍有allowance时才可进入attempt 2的`reserved`，否则进入`timed_out`；`discarded(witness.disposition={kind:"reject-artifact",code})`只可进入`artifact_rejected={code,discardWitness:witness}`。terminal decoder必须证明immediate predecessor正是该`discarded` record，完整witness逐字段byte-exact且terminal code逐字等于`witness.disposition.code`；禁止重下载、重验已删bytes或重新分类。任何same-code但role/cycle/attempt/checkpoint/name/inode漂移、cross-code drift、unknown code或transient-with-code都在state append/cleanup/public mutation前拒绝并保留evidence。因完整witness贯穿三条record，kill于terminal record/head之前或之后仍能唯一恢复并验证`DOWNLOAD_REJECTED`或`ARTIFACT_VALIDATION_FAILED`。因此旧pair在下一attempt前必为零entry，Marble/Hunyuan峰值与exact-shape cap不靠隐式delete成立。

transient failure需要refresh时，先同时持久化`metadataRefreshCount=1`和递增后的poll query attempt，再调用authenticated metadata；refresh后identity必须仍exact，URL仍只在内存。crash把checkpoint的refresh/download视为已消费；`owned-next`的durable inode witness只允许继续验证或铸造exact `discard-authorized`，不直接允许unlink；`reserved`下任何同名文件都视为ambiguous。若无remaining allowance，也必须先经`discard-authorized → discarded`收束当前owned pair，再进入timed_out，绝不重新获得“一次”。只有所有provider-required members均为trusted `stage="candidate"`时才进入candidate join→capacity→single-flight→exact Operation intent admission/fsync→`publishing` state/head append/fsync→public CAS publication；任一cross-journal crash按上述intent-first handoff收束，`publishing`由generated-set recovery收束；`timed_out|pre_submit_blocked|submission_ambiguous`等待Human，其他terminal不运行后台工作。

### 6. Dynamic Verified Artifact registration

DH-016 的 static `MARBLE_HUNYUAN_REGISTRY` 继续是既有 registered scenario 的 exact authority；DH-017 不修改它来塞入运行时 digest，也不为每个新产物改 Git。

新增三种 Data Root 级 immutable record，分离 content identity 与 generation provenance：

```ts
type GeneratedArtifactOutputRole =
  | "world-spz-500k"
  | "world-collider-glb"
  | "object-glb";

interface VerifiedArtifactContentBodyV1 {
  readonly schemaVersion: 1;
  readonly assetId: `asset:generated-${string}`;
  readonly format: "spz-v2" | "glb-2.0";
  readonly digest: string;
  readonly byteLength: number;
  readonly elementCount: number;
  readonly sourceBounds: { readonly min: Vec3; readonly max: Vec3 };
  readonly inspectorDescriptor: ArtifactInspectorDescriptorV1;
  readonly inspectorDescriptorDigest: string;
  readonly integrityStatus: "verified";
  readonly calibrationStatus: "missing";
  readonly distributionPolicy: "unknown-restricted-local";
}

interface VerifiedArtifactContentRecordV1 extends VerifiedArtifactContentBodyV1 {
  readonly recordDigest: string;
}

interface GenerationArtifactProvenanceBodyV1 {
  readonly schemaVersion: 1;
  readonly generationId: string;
  readonly provider: "worldlabs-marble-v1" | "hunyuan-ai3d-v1";
  readonly providerJobId: string;
  readonly generationRequestDigest: string;
  readonly outputRole: GeneratedArtifactOutputRole;
  readonly contentRecordDigest: string;
}

interface GeneratedArtifactSetBodyV1 {
  readonly schemaVersion: 1;
  readonly generationId: string;
  readonly provider: "worldlabs-marble-v1" | "hunyuan-ai3d-v1";
  readonly orderedMembers: readonly {
    readonly outputRole: GeneratedArtifactOutputRole;
    readonly contentRecordDigest: string;
    readonly provenanceRecordDigest: string;
  }[];
}
```

- `assetId = "asset:generated-sha256-" + contentDigest`，其中digest为完整64位lowercase SHA-256；不接受caller自由命名；provider与role只存在于provenance/set，不进入content identity；
- `inspectorDescriptorDigest = SHA-256("demiurges-artifact-inspector-descriptor-v1\0" + canonicalJson(inspectorDescriptor))`。SPZ只允许profile `spz-v2-position-bounds-v1`，GLB只允许`glb-2.0-scene-bounds-v1`；descriptor的format/contentDigest/byteLength/elementCount/sourceBounds必须与candidate和content body逐字段exact，bounds每个数先finite与`-0→0`再15-significant-digit canonicalization，min必须逐轴严格小于max。package-owned inspector从O_NOFOLLOW held file重算bytes digest与descriptor，caller不得提供profile/descriptor/digest；
- `contentRecordDigest = SHA-256("demiurges-verified-artifact-content-v1\0" + canonicalJson(contentBody))`；
- `provenanceRecordDigest = SHA-256("demiurges-generation-artifact-provenance-v1\0" + canonicalJson(provenanceBody))`；
- `artifactSetDigest = SHA-256("demiurges-generated-artifact-set-v1\0" + canonicalJson(setBody))`；
- digest字段不进入自身 preimage；canonical JSON沿用`@demiurges/world`的exact UTF-8 encoder。所有body/record exact-key、plain-data、deep-frozen，max 64 KiB、depth 8、nodes 256、collection items 64、string 4096 chars；
- package-owned pure `requireGeneratedArtifactSetJoin(evidence)`是唯一跨记录join oracle，输入是closed discriminated union：`phase:"candidate"`必须携带trusted intent、remote-bound record、state-referenced Generation-private download candidates（O_NOFOLLOW重读bytes，使用candidate冻结的exact inspector profile重算`ArtifactInspectorDescriptorV1`与domain-separated digest并逐字段比较），以及对目标public CAS/by-bytes/content/provenance/set/catalog和publication intent/result路径的exact `absent | existing` observations；oracle从这些输入唯一derive全部desired records、pointers、set、OperationBinding与catalog body，不要求尚未publish的文件伪装成已存在；`phase:"published"`则携带candidate-derived publication plan与实际observed bytes/pointers/records/set/publication intent/result/catalog body/file digests及stable file identities，并从content record恢复同一inspector profile/digest重新验证。任何字段都不能从caller口头省略；
- candidate join逐项证明：`set.generationId/provider === intent.generationId/provider`；每个provenance的`generationId/provider/providerJobId/generationRequestDigest`分别等于intent与durable remote binding；每个`outputRole/contentRecordDigest/provenanceRecordDigest`与set ordered member及实际record digest exact；content的`assetId/digest/byteLength/format/elementCount/sourceBounds`与inspector、CAS bytes、by-bytes pointer exact；role→format exact为`world-spz-500k→spz-v2`、`world-collider-glb→glb-2.0`、`object-glb→glb-2.0`；derived OperationBinding target/candidate/operationId/bindingDigest与set exact。published join在此基础上再证明catalog的generation/set/operation/binding、terminal operation/binding/variant/publishedIdentity与observed files全部exact。Marble/Hunyuan ordered role cardinality同时关闭；
- candidate join返回deep-frozen exact `GeneratedSetPublicationPlan`与package-internal不可伪造/不可序列化的一次性`GeneratedSetAdmissionCapability`；plan列出每一步预期absent/existing identity，publisher在每个mutation前后按plan重新验证，不接受caller另给descriptor。published join返回deep-frozen `GeneratedSetVisibilityEvidence`，只含重新derive的safe identities。generated-set admission与first mutation前必须消费candidate capability；startup recovery、list与serve必须重建published join并只消费visibility evidence。individually valid但generation/provider/job/request/role/content/member/binding/catalog/result任一cross-record drift时零mutation、hidden或`GENERATION_RECOVERY_REQUIRED`，不能依靠单文件digest自洽通过；
- 任意provider/role的两个付费job产生byte-identical output时，content `assetId/contentRecordDigest`幂等复用；各自拥有不同provenance/set record。content identity不被provider、role或job-specific字段撕裂，provenance是many-to-one；同bytes若inspector导出不同format/bounds/elementCount则视为authority drift并拒绝，而不是生成第二content record；
- bytes进入`artifacts/sha256/<digest>`；content/provenance/set records分别进入`artifacts/records/content/sha256/<contentRecordDigest>`、`.../provenance/sha256/<provenanceRecordDigest>`、`artifacts/sets/sha256/<artifactSetDigest>`；这些都是不可覆盖的CAS，但**不是 public catalog**；
- 另建content-digest唯一映射`artifacts/records/content/by-bytes/sha256/<contentDigest>.json`，exact body为`{assetId,contentDigest,contentRecordDigest}`。publish任何content record前先读取该pointer：existing exact则幂等复用，existing drift则在新record/set/catalog mutation前fail closed；absent时先写/fsync content record，再以no-replace hard-link发布pointer并fsync其parent。pointer race若出现只允许exact replay，否则recovery-required，后写的record仅是hidden orphan；reader/recovery必须经pointer证明一个content digest只绑定一个descriptor；
- 唯一可见性入口是 `artifacts/catalog/<generation-id-digest>.json`，它是 hard-link/no-replace 发布的 exact set commit pointer，包含 `generationId/artifactSetDigest/publicationOperationId/publicationBindingDigest`；
- Artifact set publication顺序固定：全部bytes CAS并fsync → 全部content records与by-bytes unique pointers durable → 全部provenance records CAS并fsync → set descriptor CAS并fsync → catalog pointer no-replace link并fsync catalog dir → global OperationJournal success result hard-link并fsync receipts；
- reader/list/serve只有在 catalog pointer、set descriptor、全部member records/bytes和对应 durable success result **同时 exact** 时才承认整组可见；只有pointer而无result是hidden pending evidence，由startup recovery finalize或报 recovery-required；只有result而无pointer、member缺失或identity drift一律 recovery-required；
- Marble set的ordered roles必须exact为`[world-spz-500k, world-collider-glb]`，Hunyuan exact为`[object-glb]`。任一member缺失时整组不可list/serve；
- crash 在任意 bytes/record/set/pointer/result 边界只能留下hidden safe orphan或完整 visible set，不能出现半套public Artifact；
- public package不导出raw CAS、record writer、join capability、internal coordinator或private Operation core；package-root `OperationJournal`的全部mint/recovery/finalize/cleanup入口对两个internal kinds fail closed，只有module-private safe facade内部由full candidate join或namespace preflight铸造并消费的capability能进入publication/recovery；
- static DH-013 registry 与 dynamic generated records 在读取时保持两条清晰来源；不得放宽现有 static exact checks；
- v1 的 World Project manifest 仍只接受 DH-016 已支持的 world facts。让 generated Artifact 进入 Snapshot/Project 属于 DH-018 或单独 authoring slice，不在 DH-017 顺手完成。

### 7. Provider-specific output closure

Marble：

- generation request 首版只接受 text prompt、single explicit model、private permission、可选 deterministic seed；
- `done=false` 继续 poll；`done=true + error` 为 provider failure；`done=true + response` 必须具有与 durable operation 绑定的 exact world identity；
- 只取 `500k` SPZ 与 collider GLB；缺任一项则整个 Artifact set 不注册；
- signed asset URL 只允许 exact HTTPS `cdn.marble.worldlabs.ai`，manual redirect，download 不发送 `WLT-Api-Key`。

Hunyuan：

- generation request 首版只接受 text `Prompt` 与单一 explicit model；不支持 image/base64、LowPoly、Sketch、PBR/FaceCount 等附加计费选项；
- `WAIT/RUN`继续poll，`FAIL`终止；`DONE`的默认专业版output set允许exact一个`Type=GLB`与零或一个`Type=OBJ`（顺序不作authority），必须恰有一个GLB，OBJ只验证shape/URL后忽略且不下载/登记；其他Type、duplicate GLB/OBJ或无GLB fail closed；
- download URL 只允许 HTTPS，hostname 必须是 exact Tencent COS allowlist 或以 label boundary 匹配 `.cos.ap-guangzhou.tencentcos.cn`；manual redirect，download 不发送 `Authorization`；
- 任意多GLB、无GLB、非`GLB|OBJ` type、duplicate OBJ、cross-region/foreign host或响应shape drift fail closed。

两家共同：

- metadata body、prompt 与 public DTO 有明确 UTF-8 byte/node/depth/string budget；
- download streaming budget：Marble SPZ 16 MiB、Marble collider 32 MiB、Hunyuan GLB 64 MiB，若真实新模型超限必须重新 review 后调整，不能静默放宽；
- 每个 read 与整个 request 都受 AbortSignal + wall-clock deadline；底层 stream reject 映射为稳定 public code；
- status/body/header/URL query/absolute path/credential/raw error 不进入 HTTP、receipt、日志、DOM 或 review artifact；
- format inspector 必须从 bytes 重算 SPZ/GLB magic、完整结构、element count 与 finite non-degenerate bounds。动态 Artifact 不要求预知 digest，但 publish candidate 必须等于 inspector 产出的完整 descriptor；
- existing DH-013 exact validator 继续比较 frozen digest/bounds；不得用动态 inspector 降级静态 authority。

provider-bound poll/query失败矩阵固定，不由两个service自由发挥：

- authenticated poll/get-world/query 的`400/401/403/404/422`分别映射为closed stable rejection（401/403=`PROVIDER_UNAUTHORIZED`，其余=`PROVIDER_REJECTED`）并进入`provider_failed`；provider明确terminal FAIL/error同样进入`provider_failed`。Hunyuan FAIL若含合法settled total cost则必须写sanitizedCost；Marble error分支的cost必须absent/null，任何non-null cost均`PROVIDER_CONTRACT_MISMATCH`；
- malformed 2xx、remote identity/profile/shape drift进入`provider_failed(PROVIDER_CONTRACT_MISMATCH)`，不得重试；
- `429/5xx`、transport、response-body stream与per-call deadline只在当前durable poll cycle的remaining attempts与absolute deadline内按冻结backoff重试；每次fetch前先append attempt checkpoint。预算耗尽进入`timed_out(resumeStage="poll")`，不落raw status/body；
- signed download的`401/403/404/410/429/5xx`、transport、stream与deadline只允许在同一cycle内消费durable `DownloadBudgetV1`：每个member最多2个**logical download attempts**，一个logical attempt是从initial asset GET开始、最多手动2跳redirect的唯一redirect chain，因此单attempt最多3个raw asset GET、单member/cycle最多6个raw asset GET。在initial GET前必须先durable append该attempt的`reserved`与`owned-next` checkpoint；任一redirect hop、response body或stream后crash都消费整个logical attempt，restart不得在同attempt重放initial GET或剩余hop。redirect-hop count只是当前已消费attempt内的ephemeral transport state，不能成为可重置budget。整cycle另最多1次authenticated metadata refresh，该refresh必须durable checkpoint但不计入raw asset GET；Marble refresh使用durable worldId的get-world，Hunyuan refresh使用durable JobId的query。无remaining allowance或第二次transient failure进入`timed_out(resumeStage="download")`；host/origin/redirect/media/budget/format/integrity错误直接`artifact_rejected`且不刷新；
- asset GET成功只接受exact HTTP `200`；可跟随redirect status的closed set仅`301|302|303|307|308`。每个redirect response必须恰有一个nonempty `Location`（ASCII visible、1..2048 bytes），用WHATWG URL相对current URL解析后重新执行scheme/userinfo/port/hostname/path budget与foreign-origin credential检查，验证通过才发下一个GET。missing/duplicate/invalid `Location`、`300|304|305|306`、其他3xx、`204|206`或其他non-200 2xx、以及上述transient set之外的4xx都是`DOWNLOAD_REJECTED`、零metadata refresh且不发next-hop request；第三个可跟随redirect response也直接拒绝，因为其需要的第四个raw GET已超过本attempt预算；
- Human只可把cycle 1的`timed_out`推进到cycle 2，并从durable remote binding按resumeStage重新query/refresh/download；cycle 2失败不可再resume。submit阶段的429/5xx/transport仍按submission ambiguity规则，绝不套用poll retry。

### 8. 可执行 transport、codec 与 budget 表

以下数字是 Demiurges v1 的产品安全预算，不伪称 provider 上限；超出时 fail closed，若真实 contract 需要放宽必须重新 review。所有 JSON decoder 都要求 plain data、dense arrays、exact keys、finite number、无 accessor/symbol/prototype pollution，并先按 UTF-8 bytes 检查再分配/解析：

| 边界 | 固定值 |
|---|---:|
| public prepare/confirm/resume JSON body | 16 KiB |
| provider submit/query JSON response | 256 KiB |
| canonical generation intent/state/set/record | 每文件 64 KiB |
| JSON maximum depth / nodes / collection items | 8 / 256 / 128 |
| generic string | 4096 Unicode scalar values 且 16 KiB UTF-8 |
| prompt | NFC 后 1..1024 Unicode scalar values且 1..4096 UTF-8 bytes；NUL/C0/C1 control 拒绝，仅换行与制表符例外 |
| 单次 submit/query transport deadline | 30 秒 |
| 单次 download transport deadline | 90 秒 |
| download attempt / redirect raw request budget | 每member/cycle最多2个logical attempts；每attempt initial GET + 最多2跳redirect = 最多3个raw asset GET；合计最多6个 |
| stream chunk acceptance budget | 每次累计检查；实现不得先 `arrayBuffer()` 再验上限 |

canonical request 使用 NFC 后 prompt；digest 与实际上游发送的 bytes 必须来自同一 canonical object。unknown key、重复 JSON key、`-0`、NaN/Infinity、sparse array一律 admission 前拒绝。时间由 injected monotonic clock 计算，wall-clock budget优先于 attempts。

Marble exact profile：

- credential-bearing allowlist只有三个exact route：`POST https://api.worldlabs.ai/marble/v1/worlds:generate`、`GET https://api.worldlabs.ai/marble/v1/operations/{operationId}`、`GET https://api.worldlabs.ai/marble/v1/worlds/{worldId}`；三者都先验证safe segment，再构造URL并反向断言origin/pathname/search/hash exact，只有这三条request可携带`WLT-Api-Key`；
- request exact keys 为 `world_prompt/display_name/model/permission`，可选 `seed`；`world_prompt={type:"text",text_prompt:<canonical prompt>,disable_recaption:true}`；`display_name` 为 `Demiurges <generation-id 前12位digest>`，最多64 scalar；`permission={public:false,allow_id_access:false,allowed_readers:[],allowed_writers:[]}`；不发送 tags；seed 若有必须是整数 `0..4294967295`；model exact 属于官方四个 current names；
- submit/query response只接受官方OpenAPI exact top-level keys的受信subset：required `operation_id:string`且exact匹配`[A-Za-z0-9_-]{1,256}`、`done:boolean`，optional nullable `created_at/updated_at/expires_at/error/metadata/response/cost`；unknown top-level key拒绝。query的`operation_id`必须byte-equal durable remote binding；`done=false`时不得有response且cost只可absent/null；`done=true`必须error XOR response，error分支cost只可absent/null，success response分支才允许finite nonnegativecost；`world_id`使用同一safe pattern；`.`、`..`、slash、backslash、percent、query/hash chars均拒绝。URL construction后必须再断言origin/pathname/search/hash exact，且path segment只来自已验证ID；
- completed response 与get-world response必须通过同一个official World exact codec，并由`world_id`绑定durable `RemoteOutputIdentityV1`；首版只读取 `assets.splats.spz_urls["500k"]` 与 `assets.mesh.collider_mesh_url`，二者必须都是唯一非空string。字段来自 current official OpenAPI 的 `World → WorldAssets → SplatAssets.spz_urls / MeshAssets.collider_mesh_url`，`500k` map key由既有DH-013 sanitized successful response证明；任一字段/key漂移时稳定contract mismatch，不选择“最近似”的 splat；contractShapeDigest覆盖Operation与World两个exact schema descriptor；
- 每个poll cycle最长20分钟、最多80次query；delay schedule固定为前12次5秒、13..36次10秒、其后20秒；不加随机 jitter，便于恢复与测试；
- output download仅接受 `https`、无userinfo、无port、hostname lowercase exact `cdn.marble.worldlabs.ai`，每跳manual redirect重新执行同一检查，最多2跳；media type SPZ 为 `application/octet-stream`，GLB 为 `model/gltf-binary` 或 `application/octet-stream`。

Hunyuan exact profiles：

- product compatibility transport exact 为 `POST https://api.ai3d.cloud.tencent.com/v1/ai3d/submit|query`，raw key仅放 `Authorization`；request exact keys为 `Prompt/Model`，model exact `3.0 | 3.1`。Cloud API 3.0官方页面只作为 response语义/字段依据，不把其签名、host或 action 偷换成当前 key 的 transport；
- submit response profile `cloud-response-v1` exact为 `{Response:{JobId,RequestId}}`；`compat-top-level-v1` exact为 `{JobId,RequestId}`。query profile同理是 `{Response:<payload>}`或`<payload>`；真实启用前必须由无付费 authenticated query capture选定一个 profile并记录 dated sanitized shape digest，运行时不得自动在两 profile 间猜测；
- `JobId` exact匹配 `[0-9]{1,32}`；`RequestId` exact匹配 lowercase UUID `^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`；query request exact `{JobId:<durable binding>}`；
- query payload exact keys为 required `Status/RequestId`，optional nullable `ErrorCode/ErrorMessage/ResultFile3Ds/ResultCreditDetails/ResultCreditConsumed`；status exact `WAIT | RUN | FAIL | DONE`。`WAIT/RUN`不得含outputs/cost；`FAIL`不得含outputs但允许一个finite nonnegative `ResultCreditConsumed`并将其sanitized保留；`DONE`允许同一total cost并要求exact一个GLB与最多一个OBJ；任何invalid cost、unknown key/type/state drift均contract mismatch；
- 每个poll cycle最长15分钟、最多120次query，固定5秒间隔，无jitter；
- File3D exact keys为`Type/Url`，可选`PreviewImageUrl`；只接受`Type="GLB" | "OBJ"`并执行上一节cardinality。所有Url先执行同一COS allowlist；仅GLB download，OBJ URL不持久化、不请求。download URL必须`https`、无userinfo、无port、lowercase hostname，且hostname exact `cos.ap-guangzhou.tencentcos.cn`或按DNS label boundary匹配`^[a-z0-9-]+\.cos\.ap-guangzhou\.tencentcos\.cn$`；最多2次manual redirect且每跳复验；GLB media type `model/gltf-binary | application/octet-stream`。

`GenerationPublicCodeV1`是closed union：`INVALID_REQUEST`、`REQUEST_ABORTED`、`CONFIRMATION_REQUIRED`、`CONFIRMATION_EXPIRED`、`OPERATION_BINDING_CONFLICT`、`OPERATION_INTERRUPTED`、`GENERATION_CAPACITY_REACHED`、`CREDENTIAL_UNAVAILABLE`、`PROVIDER_UNAUTHORIZED`、`PROVIDER_PAYMENT_REQUIRED`、`PROVIDER_RATE_LIMITED`、`PROVIDER_REJECTED`、`PROVIDER_CONTRACT_MISMATCH`、`PROVIDER_SUBMISSION_AMBIGUOUS`、`POLL_DEADLINE_EXCEEDED`、`DOWNLOAD_REJECTED`、`ARTIFACT_VALIDATION_FAILED`、`GENERATION_RECOVERY_REQUIRED`。state-specific subsets exact为：`pre_submit_blocked`仅`CREDENTIAL_UNAVAILABLE | REQUEST_ABORTED | GENERATION_CAPACITY_REACHED | PROVIDER_CONTRACT_MISMATCH`；`provider_failed`仅`PROVIDER_UNAUTHORIZED | PROVIDER_PAYMENT_REQUIRED | PROVIDER_REJECTED | PROVIDER_CONTRACT_MISMATCH`；`timed_out`仅`POLL_DEADLINE_EXCEEDED`；`artifact_rejected`仅`DOWNLOAD_REJECTED | ARTIFACT_VALIDATION_FAILED`；`submission_ambiguous`仅`PROVIDER_SUBMISSION_AMBIGUOUS`；`recovery_required`仅`GENERATION_RECOVERY_REQUIRED`。`PROVIDER_RATE_LIMITED`只作为HTTP即时响应/telemetry分类，不可成为durable terminal state。HTTP body只输出code与固定中文message；provider/raw filesystem/network code、URL、response body与error message不得回显。

## Product API 与 UI

建议 product-owned routes：

```text
POST /api/sessions/:sessionId/generations/prepare
POST /api/sessions/:sessionId/generations/:generationId/confirm
GET  /api/generations?limit=<1..100>&cursor=<opaque-or-absent>
GET  /api/generations/:generationId
POST /api/generations/:generationId/resume
GET  /api/artifacts
```

- 所有 mutation 使用 strict DTO、bounded body、`application/json`、AbortSignal、no-store、stable public code 与 capacity reservation；
- `GET generation` 与 `GET artifacts` 只读本地 durable state，不在请求内隐式 poll provider；
- `GET generations` 是refresh后的唯一durable discovery入口：按`generationId`升序、默认20/最大100，cursor是server生成并校验的base64url canonical last-id，返回`items/nextCursor` exact DTO；不读取localStorage、URL hash或Presentation memory作为authority；
- background poller 只有 Data Root writer Gateway 可以运行；reader Gateway 只展示状态；
- resume只允许`pre_submit_blocked`的安全pre-submit continuation，或已有durable remote job identity的`timed_out` job；不能恢复ambiguous submit；
- Studio 增加可见 `生成资产` panel：provider-specific form、准备预览、显式确认、状态、sanitized cost、outputs 与 `VERIFIED / CALIBRATION MISSING`；
- 已验证 Artifact 只进入资产列表，不自动加入 viewport/world；不提供“生成并自动放置”；
- refresh/unmount/route abort 不丢 durable job，不形成永久 rAF/poll timer；UI 使用 bounded timer，仅在有 active job 时刷新本地 status。

## In scope

1. 两个 provider-specific request/status/output codec 与 service；
2. server-side Keychain credential source，复用现有 locators且不输出 secret；
3. two-step Human confirmation 与 exact request digest；
4. durable generation journal、restart resume 与 submission ambiguity；
5. bounded poll/download/redaction；
6. dynamic format inspection、content/provenance/set records 与 Artifact Store publish；
7. Gateway routes、Studio generation panel 与 artifact list；
8. fake-provider automated tests、real Chromium acceptance；
9. implementation cross-review 后，由 Human 另行授权的最多一次 Marble、一次 Hunyuan canary。

## Non-goals

- 通用 Provider Adapter/SDK、plugin system、marketplace、arbitrary baseURL/header/model；
- image/video/multi-image generation、Hunyuan附加计费选项、批量 generation、自动重试付费 submit；
- 自动余额充值、采购、auto-refill 或费用决策；
- 自动 calibration、ground/navigation/collision/mass/inertia 推断；
- 自动创建 Entity/Snapshot、写入 World Project、运行 MuJoCo 或 adopt；
- 第五个 Agent tool，或让 OMP/Agent直接调用 generation；
- 将 credential、signed URL、provider raw job state 持久化到 World Project；
- cloud object storage、database、multi-host writer、provider webhook framework；
- 修改 Lyaup 或复制其 provider/API/schema/source。

## Expected implementation surface

计划允许的主要范围（review 可在语义不扩大时调整测试文件名）：

- `packages/world-project/src/`：GenerationJournal codec、dynamic content/provenance/set record/catalog、journal operation kinds、admitted set publish/recovery；允许对`data-root-layout.ts`、`operation-journal.ts`与`startup-recovery.ts`做仅为`receipts/generations` closed namespace、`artifact.publish-generated-set`和startup ordering所需的最小修改；
- `scripts/provider-artifact-validation.ts`：提取不依赖预知 digest 的 pure inspector，同时保持现有 registered validator exact；
- `apps/agent-gateway/src/`：Marble service、Hunyuan service、generation manager/API、production composition；
- `apps/studio/src/`：generation client、panel、status/artifact list；
- root/package manifests 与 tests；
- DH-017 canonical harness docs。

不得修改 Kernel Snapshot semantics、Repository、Runtime、Episode、Evaluation、AdoptPolicy、World Project v1 schema、四工具 contract 或 OMP restricted policy。若实现发现必须修改其中任一 authority，应停止并回到 plan review，而不是补兼容分支。

## Acceptance 与 adversarial matrix

### A. Confirmation / credential / request admission

- prepare 零 provider call、零 Data Root mutation；expired/foreign/mismatched confirmation拒绝；已消费confirmation只有在不存在exact durable/in-flight binding时才拒绝，exact binding replay必须成功且不二次消费；
- direct confirm bypass、`confirmed:true`、non-JSON、wrong content type、oversize、sparse/accessor/symbol/duplicate key/non-finite/`-0` 拒绝；
- credential 只在 server-side读取，provider origin 精确隔离；redirect/foreign origin绝不携带 credential；
- Marble `operation_id/world_id` 对`.`、`..`、`/`、`\\`、`%2f`、`?`、`#`与Unicode separator逐项拒绝；合法ID构造后origin/pathname/search/hash必须exact，credential request count只落在冻结path；
- Git diff、built JS、argv、logs、HTTP、DOM、receipts 不含 secret或dummy secret marker；getter reads=0。
- `costUnknownAccepted`缺失/false或任意numeric max cost在v1均 admission拒绝；settled cost只能在terminal provider response后记录。
- Hunyuan captured profile/name/shape digest与Marble schema descriptor进入binding golden vector；runtime config/profile drift在credential read与provider call前拒绝。
- `waitForCompletionAndDownload:true`与`executionPolicy:"wait-and-download"`进入confirmation/binding golden vector；缺失/false/drift在durable birth与provider call前拒绝。

### B. Submit / idempotency / crash

- same key/same binding concurrent confirm：provider submit count exact=1；follower abort不取消leader；
- 两个server-trusted active ProductSession对same generation binding分别prepare；foreign session用另一session token稳定拒绝且不消费原token。confirmation store在expiry-before-insert下覆盖每session第17项、global第257项、单项UTF-8 16 KiB+1、consume/expiry/session teardown后释放与并发prepare；body/header/cookie/query伪sessionId均不能改变route/registry authority；超限只返回`GENERATION_CAPACITY_REACHED`，不evict valid entry且provider/Data Root mutation均为0；
- leader已消费confirmation并durable admit后响应丢失，same binding retry不带新confirmation亦replay；无durable/in-flight binding的已消费confirmation拒绝；
- same key/different prompt/model/provider：binding conflict且submit count=0；
- `DataRootWriterLease.leaseDigest → NamespaceInstallSeedV1 → valid operationId → OperationBinding/installBindingDigest → namespaceBody → publishedIdentity=namespaceSeedDigest`在两个独立process产生byte/digest exact golden vectors；same held-root alias一致、different dev/ino不可replay。candidateIdentity只能含seed digest，逐项注入binding-derived digest、自引用namespace body、marker/file identity或任一seed/target/root/body drift都在intent/candidate mutation前拒绝；package-root public grammar不扩张，internal exact ID却通过shared structural grammar。root internal Operation attempt token必须exact复用existing 96-bit/24 lowercase hex grammar，Generation `birth-staging` token独立为128-bit/32 lowercase hex；对两者长度交换、mixed enumerator与unknown name逐项fail closed。first namespace install的Operation intent、flat attempt directory、candidate mkdir、durable intent→`.namespace-install-intent.json` hard-link、namespace write、每个child mkdir/fsync、`renameatx_np(RENAME_EXCL)`、receipts fsync、exact success result与cleanup逐边界kill：只能安全继续到完整namespace success或保留recovery-required evidence；capability probe在global read-only preflight之后、namespace apply之内的当前exact attempt `.rename-probe/`运行，覆盖absent destination success与existing empty-dir/regular/symlink不替换；kill于probe每个create/link/rename/fsync/cleanup边界时，只可由该internal Operation binding重验同same-inode evidence后继续或清理，foreign/replacement/extra probe residue保留并recovery-required，probe失败writer不开启。same marker bytes replacement inode、same namespace body foreign binding、directory replacement必须在first cleanup前保留全量evidence。随后generation birth的intent/admitted0/head/downloads各file/dir fsync、birth catalog pointer hard-link与catalog fsync边界kill：public generation只能absent或pointer+完整四件套；pointer absent时data hidden且submit count=0，pointer存在但intent-only/headless/foreign data fail closed；
- kill points：birth后/submit前、request发出前、response前、job binding record/head/fsync；
- crash在confirmation consume/intent/admitted record/credential preflight/submit_started各边界：admitted安全continuation的最终submit count exact=1；pre_submit_blocked可resume；submit_started无remote binding只会ambiguous且submit count不再增加；
- remote job binding durable 后 restart 不重复 submit并可继续 poll；
- submit可能已接受但无 durable job binding时稳定 `PROVIDER_SUBMISSION_AMBIGUOUS`，重复 resume/confirm provider submit count仍为0；
- World Labs frozen documented 400/401/402/422 rejection逐项进入provider_failed，429/5xx/malformed/transport/body/deadline无identity进入ambiguous；Hunyuan submit fetch开始后，400/401/402/422/429/5xx/其他status/malformed/transport/body/deadline只要无trustworthy JobId全部进入同一`PROVIDER_SUBMISSION_AMBIGUOUS`，重复confirm/resume provider submit count=0。两家raw body/socket/credential-like error只映射稳定code且不回显；不得用World Labs test oracle通过Hunyuan case。
- GenerationJournal对`.record.next` create/write/file-fsync、`.record.next.witness` create/file-fsync/records-fsync、pending final hard-link/records fsync、`head.next`写/fsync、head rename/generation fsync、`.record.next` unlink/records fsync、witness unlink/records fsync的每个边界kill，必须有唯一结果：witness durable前的partial next保留并recovery-required、provider call=0；witness durable后才restart复用其冻结的原`recordedAt/digest/filename/inode`，new head durable前provider call count不增加。不存在“orphan record忽略”规则。witness缺失/错误、`.record.next` missing+未引用final、第二个pending final、next/final单独或同时same-bytes replacement inode、byte-identical witness + new record inode、foreign/extra/wrong-type/symlink全部在first cleanup前fail closed。单generation physical entries 513/514与unique-inode bytes 32 MiB/32 MiB+1、全root 8704/8705 physical entries与525 MiB/525 MiB+1用incremental limit+1 scan验证，witness 1 KiB/1 KiB+1单独验证，重复kill不得生成第二digest或突破5秒startup deadline；broken head/chain/sequence/binding同fail closed。existing OperationJournal只跳过exact `receipts/generations` directory并拒绝其他未知entry；startup必须先对Operation+Generation+generated-set join做全局只读preflight，再分阶段apply普通与generated recovery，最后才resume。
- GenerationBinding/Intent golden vectors跨两个process byte/digest一致；逐字段、filename、sequence、previous digest与generated-set OperationBinding target/candidate/publishedIdentity drift全部在mutation前拒绝。
- `receipts/`在2044..2048 entries、namespace absent/no-intent、install-intent-pending、directory-published/result-pending、terminal-installed四态，以及已有其他pending Operation与多个active generation下做并发admission/restart矩阵；first composite的infrastructure actual+outstanding恒为3，再加future set 2，共享capacity authority不double count且为每个付费generation保留未来generated-set intent/result，所有旧Project/Artifact/bundle route也不得越过reservation；ambiguous restart仍保留2 slots。在每个near-cap状态下另对validating→exact publication intent link/fsync→publishing record/head/fsync逐边界kill，证明intent durable立即以actual1+pending-result1接管原reservation2、不瞬时计4、public CAS仍为0；合成`validating+matching intent`能恢复先补publishing，`publishing+no intent`则保留2并fail closed，conflicting/extra intent零partial mutation。
- root `receipts/`用incremental directory-handle分别验证2048与2049项、unknown/symlink/wrong-type `generations`，在limit+1停止且不先物化全目录；保留DH-016 receipt classification与零mutation startup failure。
- package-root `OperationJournal` 对两个internal kinds的`admit/beginRecovery/inspectExistingAttempts/confirmExistingTerminal/finalizeSuccess/finalizeAborted/cleanupAttempt`逐入口证明receipt/staging/CAS零mutation；结构化伪capability、foreign root/lease/capability replay同样在first mutation前拒绝；只有module-private safe facade的exact candidate正常admit/recover/finalize。

### C. Poll / lifecycle

- Marble 与 Hunyuan legal state transitions逐项通过；unknown/backward/terminal-to-running/cross-job identity拒绝；
- poll attempt、backoff、wall clock、capacity、AbortSignal与restart resume均有确定性 fake clock/fetch测试；
- 每次query前durable checkpoint；在任意attempt fetch后crash/restart只消费剩余budget，不重置attempt/deadline。Marble cycle 1+2最多160次、Hunyuan最多240次，第三次resume稳定拒绝；clock rollback、deadline/attempt exhaustion逐项fail closed；
- 257 generations、513 committed records/chain、8193 committed records/root、17个birth candidates、private downloads entry/byte over-cap与startup 5秒deadline各自bounded fail closed且不开mutation routes；另以physical namespace单generation 513/514 entries、root 8704/8705 entries、state record 64 KiB/64 KiB+1、witness 1 KiB/1 KiB+1、unique-inode 32 MiB/32 MiB+1与525 MiB/525 MiB+1覆盖committed + pending names，limit+1时在chain decode/provider call前稳定fail closed；8190/8191 near-cap与8个active reservation并发证明provider call前已有512-slot完整reservation；
- 17个birth candidates、payload type/range/recordedAt/code/remote ID/output identity/cost unit/amount逐字段漂移均bounded拒绝；成功birth与catalog-present crash会在same-inode/body proof后unlink staging并fsync，连续17个正常birth不残留candidate；foreign/duplicate candidate保留并recovery-required；
- timed-out job保留remote identity与evidence，可显式resume；ambiguous不能resume；
- poll的400/401/403/404/422、429、5xx、malformed 2xx、transport/body/deadline逐项命中冻结transition；download的metadata refresh与每个member logical attempt均在side effect前durable checkpoint，任意边界反复crash仍整cycle最多1次refresh/每member最多2个logical attempts、每attempt最多3个raw asset GET、合计最多6个raw asset GET；从initial GET、redirect 1、redirect 2、body、stream各边界kill/restart均消费整个attempt且不重放同hop chain，redirect 3在request前拒绝；metadata refresh独立checkpoint且不计入asset GET；asset success只允许200，redirect只允许301/302/303/307/308 + exact单一valid Location，missing/duplicate/invalid Location、300/304/305/306/other 3xx、204/206/other 2xx与非transient 4xx全部`DOWNLOAD_REJECTED`且不发next request；security/format失败零refresh；Marble restart/refresh走exact get-world path且operation/world ID path-injection全部拒绝；
- paid submit malformed/profile-drift 2xx唯一进入`submission_ambiguous(PROVIDER_SUBMISSION_AMBIGUOUS)`；provider-call前profile drift才是`PROVIDER_CONTRACT_MISMATCH`；replay/resume不再次submit；
- Hunyuan FAIL的合法settled cost durable保留、无cost合法、invalid cost mismatch；Marble error的cost只可absent/null，non-null mismatch；每个state只接受其closed code subset；
- reader Gateway不poll、不publish；writer lease丢失立即停止后续mutation且不伪造terminal。

### D. Download / validation / publish

- exact output set、host、scheme、redirect、media type、body/byte budget、stream failure、truncation、trailing bytes、malformed/sparse GLB、truncated SPZ、NaN/degenerate bounds逐项fail closed；
- Hunyuan `DONE [OBJ,GLB]`与`[GLB]`均选中唯一GLB并成功，OBJ fetch count=0；duplicate GLB/OBJ、仅OBJ或第三种Type fail closed；
- credential/header不发送到CDN/COS；signed URL不落盘；
- download private staging只在durable Generation intent/head、single-flight与live lease下写入，filename/role/cycle/attempt/checkpoint digest/entry+byte budget/stream/inspect/state evidence逐项验证；第一member完成不会触碰public CAS。成功路径逐边界kill至少覆盖reserved checkpoint、`.next` create、owner hard-link、downloads fsync、owned-next record/head、stream fsync、`.bin` rename、cleanup-authorized record/head、owner unlink/fsync与final candidate record/head；失败路径另覆盖partial stream、truncation、transient fetch、terminal inspect rejection、discard-authorized record/head、data unlink、owner unlink、downloads fsync、discarded record/head、retry-2与timed_out/artifact_rejected transition。reserved下无文件可安全继续；reserved下出现任何文件、owner witness或owned-next commit前crash均保留并recovery-required；owned-next exact inode只可继续或铸造对应cleanup authorization，不能直接删除；成功cleanup-authorized前missing owner fail closed，authorization后owner present/absent均按exact bin inode幂等收束，final candidate必须owner absent；discard-authorized commit前要求owned pair两名exact同inode，commit后对both-present/data-only/owner-only/both-absent逐项幂等收束，任一byte-identical replacement/foreign inode均保留且零partial cleanup；discarded必须零entry且只有它可进入retry/timed_out/artifact_rejected。`DOWNLOAD_REJECTED`与`ARTIFACT_VALIDATION_FAILED`分别在discard-authorized、两次unlink/dir fsync、discarded record/head、terminal record/head之后逐kill重启，必须在三条records中携带byte-exact同一`DownloadDiscardWitnessV1`、原样继承同一durable code且provider/download call count不增加；opposite/unknown code、transient-with-code、cross-code以及same-code但role/cycle/attempt/checkpoint/name/inode drift逐项在first mutation前拒绝。Marble cap 4与Hunyuan cap 2下，attempt 1失败清到discarded后attempt 2才可reserved，limit+1在创建前fail closed；referenced candidate/owner的byte-identical replacement inode、extra/symlink/wrong type全部fail closed且零partial cleanup；
- `ArtifactInspectorDescriptorV1`与digest在两个process对同一SPZ/GLB产生exact golden vector；profile/format/contentDigest/byteLength/elementCount/bounds、candidate/content record/descriptor digest任一逐字段漂移，或code upgrade试图用不同profile重解释旧private candidate时，在generated-set Operation admission与public CAS mutation前拒绝；static DH-013 registry validator不改authority；
- Marble orderedMembers golden chain覆盖member1 `cleanup-authorized→candidate`首次引入、member2从idle到candidate期间member1 byte-exact carry、完整2-member set；任一后继candidate drift/second introduction/rollback拒绝。cycle1 timed_out到cycle2只保留已完成candidate的原filename/checkpoint/inode/descriptor与唯一introduction lineage，未完成member才reset idle；retained candidate drift或强制重下均拒绝且provider/public CAS count不增加；
- individually valid的intent/remote-bound/content/provenance/set/Operation binding/catalog/result逐字段做cross-record drift：generation/provider/job/request/role/format/member/publication identity任一漂移均在first mutation前拒绝；startup/list/serve使用同一phase-aware`requireGeneratedArtifactSetJoin`并只消费branded evidence；
- 完整private candidate set→candidate join→capacity/single-flight→generated-set Operation intent durable后，才允许public bytes CAS。其后bytes CAS/record/set/catalog/result各link/fsync边界kill只留该Operation覆盖的hidden evidence；Marble list/serve只能得到0或完整2-member set，Hunyuan只能0或完整1-member set；
- catalog pointer存在但terminal result缺失保持hidden并由recovery收束；result存在但pointer/member缺失必须recovery-required；
- existing exact bytes幂等，same assetId/content record不同内容冲突，不覆盖；Marble collider与Hunyuan object产生byte-identical GLB时也复用同一content record，同时保留两个provider/role provenance与set；symlink/wrong type/identity drift recovery-required；
- same content digest的`by-bytes` pointer exact replay成功；pointer指向第二descriptor、pointer/file symlink/wrong type、record缺失或content digest drift均在set/catalog publication前拒绝；pointer publish各link/fsync crash可恢复且不产生两个public content facts；
- dynamic publish不能通过package root raw API绕过journal/single-flight；
- DH-013三项static registry validators、DH-016 Store/Project/bundle全部回归。

### E. World authority

- generation prepare/confirm/poll/download/verify前后，现有 session 的 Snapshot/Ref/Episode/Evaluation byte-equivalent；
- verified Artifact list增加不会自动改变World Project revision、history/cursor、lastRun或viewport entities；
- model-facing tools仍exact四个，Agent无法看到 credential、confirmation或generation route；
- generated record的`calibrationStatus`固定为`missing`，UI不得显示 world/alignment/physics PASS。

### F. Real Chromium 与真实 canary gate

在 fake provider composition 下，Chromium 必须证明：

1. Marble/Hunyuan表单与显式二次确认可见；
2. confirm前Network无provider submit；
3. job状态可跨Studio刷新恢复；
4. success后显示verified outputs与`CALIBRATION MISSING`，world/viewport/ref不变；
5. failure/timeout/ambiguous状态可理解且不泄露raw error；
6. input/Observer/Scene Composer不回归，无page error、NaN、blank viewport、stuck timer或idle无效rAF。

refresh acceptance必须先清空组件内存，再仅通过分页`GET /api/generations`重新发现`generationId`并继续读取本地durable state；不得由测试把旧ID直接注入新组件。

真实 provider canary 仅在 implementation cross-review approved 后，由 Human 另行冻结参数；默认最多一条 Marble、一条 Hunyuan，不自动重跑。验收必须报告实际 provider/model、remote public identity、耗时、sanitized cost（若有）、Artifact IDs/digests与是否完成；不得报告或保存key、signed URL。

### 2026-08-20 Human-confirmed real canary authority

本次真实 canary 只授权以下两次 paid submit，不得改写、扩大或自动重跑：

- World Labs：`provider=worldlabs-marble-v1`，`model=marble-1.0-draft`，精确 prompt 为 `A small quiet stone courtyard with a single red wooden stool at the center, flat ground, daylight, no people, no text.`；最多 `1` 次 submit；预期费用 `230 credits`。
- Tencent Hunyuan：`provider=hunyuan-ai3d-v1`，`model=3.0`，默认 `Normal`，精确 prompt 为 `一张结构简单的红色木凳，四条腿，纯色材质，独立单体，无人物，无文字。`；最多 `1` 次 submit；预期费用 `20 credits`（按当前公开后付费参考约 `¥2.4`，免费或预付费优先时实际扣费可不同）。
- 两者都冻结 `costUnknownAccepted=true` 与 `waitForCompletionAndDownload=true`；任何 paid submit 出现 ambiguous outcome 时立即停止，不得再提交。
- Hunyuan paid submit 所需的 authenticated no-generation contract capture 已完成；脱敏证据冻结 `cloud-response-v1` 与 package-owned contract digest。后续 canary 不再接受旧 JobId 参数，也不得再次执行 pre-submit capture。
- credential 只能由本机 macOS Keychain 在 Operator 进程内读取；不得打印、写入文档/日志/配置，不得传给 Worker 或 Reviewer。
- 结束证据必须包含真实下载后的 durable Artifact publication、Gateway read 与 Studio 可见性；仍不授权 commit、push、merge、deploy 或 World/viewport auto-placement。
- 当前 MVP 不扩建 multi-generation Data Root：Marble 与 Hunyuan 各使用一个隔离的 fresh canary Data Root，每个 root 只接纳一条 first generation，并分别完成 Gateway/Studio 可见性证明。不得为了同屏展示两条结果而扩建 concurrent/sequential multi-generation capacity/recovery。
- 真实 canary 每 provider 只运行一个连续、有人监督的 Operator 进程。`waitForCompletionAndDownload=true` 要求正常进程持续等待 terminal/download/publication，但本 MVP 不实现 poll/download process-crash resume；若在 `verified` 前进程终止，必须保留 durable remote binding 并停止，不自动重运行、不继续 poll/download、不重提，除非 Human 另行授权新的 recovery slice。
- 任一官方 contract/model/profile 漂移、Keychain 缺失、无法证明唯一 submit、需要自动重试、或费用/参数超出上述冻结值，都必须在下一次 provider side effect 之前停止。

### 2026-08-20 Human-authorized Hunyuan shape-only diagnostic

首次获批的 Hunyuan no-generation capture 在 Generation admission 前 fail closed，且 durable evidence 证明 paid submit count 为 `0`。Human 随后选择方案 1，额外授权：

- 对 DH-013 已有 JobId 执行恰好 `1` 次 authenticated Hunyuan query；不调 submit，不创建 generation，不重试。
- raw response 只在 Operator 进程内按 256 KiB/30s 上限读取，随即转成 package-owned shape-only descriptor。
- 允许输出的信息只有 HTTP status、object/array/scalar/null 类型、sorted field names、array item shape、closed profile 候选与 descriptor SHA-256。
- 禁止输出或持久化 JobId、RequestId、URL/signed URL、credential/header、raw body、provider error text、prompt、费用数值或任何 scalar value。
- 诊断完成后必须先修订相关 canary tests 并通过 Reviewer；原 Hunyuan paid submit 与 Marble paid submit 授权不因本诊断自动恢复。

诊断最终通过 replacement query 完成：live shape 是 top-level `Response`，旧 JobId 当前返回标准 `Error + RequestId` error envelope。它足以冻结 `cloud-response-v1`，但不作为 successful-job payload 证据，也不要求放宽 successful query codec。canary runner 已删除旧 JobId pre-submit capture，并在 binding/service/runner 三处复用 `HUNYUAN_CONTRACT_SHAPE_DIGESTS["cloud-response-v1"]`。focused `44 pass / 0 fail / 310 expect()`、root typecheck通过；独立 Reviewer `approved / P0=P1=0 / may_advance=yes`。replacement query authorization 已完全消耗，paid submit仍为 `0`。

## 实现顺序

### Phase 0 — Plan gate

- 独立双路 cross-review 本计划与当前 code/context；
- 任一 P0/P1、`changes_requested` 或无法执行的验收都阻断实现；
- 计划 approved 后才开始产品代码。

### Phase 1 — RED：contracts 与 durable lifecycle

- 先写 provider exact codecs/budget表、confirmation precedence、GenerationJournal链、idempotency、submit ambiguity、poll state、redaction、content/provenance/set identity与zero-world-mutation RED；
- tests使用fake provider与repo外temp Data Root，不读取真实Keychain、不联网。

### Phase 2 — Provider-specific services

- 实现Marble与Hunyuan direct services；
- 共享helper只来自已经相同的transport/security/CAS事实，不抽象provider lifecycle。

### Phase 3 — Verified Artifact registration

- 实现dynamic inspector、content/provenance/set/catalog namespaces、admitted set-level publish、startup recovery、list/serve；
- static DH-013/DH-016 authority回归必须先通过。

### Phase 4 — Gateway / Studio product slice

- 完成prepare/confirm/status/resume/list routes与可见UI；
- fake provider真实Bun HTTP + Chromium closure。

### Phase 5 — Independent implementation cross-review

- 冻结product digest与allowlist，运行两路fresh review；
- P0/P1=0、approved后才可closeout候选；
- 真实provider canary仍是独立Human gate，不由review approval自动授权。

## Verification commands

实现阶段至少执行：

```text
bun test <focused generation/world-project/gateway/studio tests>
bun test
bun run typecheck
bun run build
git diff --check
.artifacts/harness/harnessctl validate
.artifacts/harness/harnessctl doctor
```

另需执行：

- fake provider真实HTTP submit/poll/download；
- crash/restart与same-key并发子进程probe，全部bounded、kill/reap、无残留；
- secret/signed URL scanner；
-真实 Chromium acceptance；
- implementation cross-review frozen start/end identity。

## 停止条件

出现以下任一情况立即停止并回到Human/plan gate：

- 官方contract与本计划不一致，或无法证明actual provider/model identity；
- 需要自动重试ambiguous paid submit；
- 需要放宽download host、format/budget或static registry authority；
- 需要修改Snapshot/Repository/World Project v1/四工具/Agent authority；
- provider要求credential进入URL、浏览器或不可脱敏日志；
- 真实调用参数或费用边界未获明确授权。
```

## Recent Progress

```md
able 返回 `provider_failed(PROVIDER_PAYMENT_REQUIRED)`；没有 401、remote operation、poll、download、Artifact 或自动 retry。candidate-1 的一次本地 inline quoting 错误发生在 credential/provider 前，空 root 证明未消耗 submit，修正后才执行其唯一真实调用。
- evidence 位于 `.artifacts/canary/DH-017/20260824T0704Z/marble-candidate-{1,2,3}`。结论是三个 key 对应的 World API 账户当前都没有足够 credits 支付冻结的 text draft 请求；不能由此推断具体余额或 Marble app 余额。
- 三个候选 authority 均已消费。DH-017 继续停在外部 API credits/新 key 与新的单次 Human authority，不继续扩代码或自动轮询 key。

## 2026-08-24 — DH-017 真实 MVP 收敛至 Hunyuan

- Human 明确确认停止继续尝试 Marble key；保留现有 Marble implementation/fake tests，但把 Marble live canary 标记为 deferred external dependency，不再阻断当前真实 MVP，也不接入第三 provider。
- 当前真实验收改为至少一个 provider 完成真实 prompt → job → poll → download → verified Artifact → Gateway → Studio 闭环。下一步先对 2026-08-20 已存在的失败 Hunyuan Job 做恰好一次 no-generation 脱敏查询，只保留 `Status` 与稳定 `ErrorCode`。
- Worker 只离线准备最小诊断，不得读取 Keychain、联网或调用 provider；独立 Reviewer 只读审查；真实 query 由 Codex Operator 执行。新的 Hunyuan paid submit 不在本轮授权内。

## 2026-08-24 — DH-017 Hunyuan terminal diagnostic 实跑结果

- Terra high Worker 按两文件 allowlist 产出 96 行一次性 Operator diagnostic；Operator 用 injected fake 验证仅一次 fetch，pending/malformed/abort 均固定 stopped。Kimi K3 `thinking=max` limited-fresh Reviewer 从真实 MVP、零 submit/retry/leak 与奥卡姆边界独立审查，`APPROVE / MAY_RUN_REAL_QUERY=yes / P0=P1=P2=P3=0`。
- Operator 随后执行 Human 授权的唯一一次旧 Job no-generation 诊断。Keychain locator 本地存在；入口以 exit `1` 返回唯一固定 sentinel `DH017_HUNYUAN_TERMINAL_DIAGNOSTIC_STOPPED`。没有 paid submit、retry、新 Job、download、Artifact、commit、push 或 deploy。
- stopped 输出把 credential/HTTP/schema/status/ErrorCode 等失败阶段合并，不能据此推断具体 provider 原因，也不能形成有证据的修正。授权按保守原则已消费，不自动重跑。
- 下一最小动作不是增加恢复/审计框架，而是离线让该一次性诊断额外返回一个闭集的脱敏 stop stage；独立 review 后，再由 Human 决定是否授权新的单次 query。新的 paid submit 仍是独立 authority gate。

## 2026-08-24 — DH-017 Hunyuan terminal diagnostic stage-observability 离线修正

- 本切片只修改一次性 Operator diagnostic 与对应 evidence：stopped 结果新增严格闭集 `input | credential | http | response | status | error-code`；不输出 exception、body、URL、HTTP status number、provider message、JobId、RequestId、prompt 或 credential。valid terminal `FAIL + stable ErrorCode` 的成功小 JSON 保持不变。
- 原定 OMP DeepSeek Worker 在两个监督观察周期内持续扩张设计且未写 allowlist artifact，Operator 在其触碰 Keychain、网络或 provider 前释放；随后 Terra high Worker 用 115 行完成最小改动，并根据 Operator 反馈补齐 invalid CLI 的 `:input` stage。没有新增 framework、logger、retry、submit path 或产品代码。
- Kimi K3 `thinking=max` limited-fresh Reviewer session `01a0343b-7940-70ad-9452-62bcdb5e9d82` 独立审查；首次在正式结论前触及 deadline，恢复同一 session 后给出 `APPROVE / MAY_REQUEST_NEW_QUERY_AUTHORITY=yes / P0=P1=P2=0`，仅保留两条无需修改的 P3。Reviewer 只写 `/tmp` 测试文件，repo 零 mutation。
- Operator 最终复跑 injected-fake matrix `28/28`、leak scan `CLEAN`、invalid CLI exact sentinel/exit 64、Bun bundle；脚本 115 行，SHA-256 `b58a75345517749ce50e58d035cd987ad7d06047365f9f829a0076bd38eb1d54`。本切片 Keychain read、network、query、submit、retry 均为 `0`。
- DH-017 整项仍未完成。本 APPROVE 只证明离线诊断可用于下一次最小查询，不构成真实 query authority；当前重新阻断在 Human 是否授权对既有 Job 执行恰好一次 no-generation query。任何 paid submit 仍需另行授权。
```

## Current Blocker

```md

```

## Expected Next Action

- Target agent should accept, decline, or raise a blocker explicitly.
- If accepted, target agent should run `.artifacts/harness/harnessctl accept DH-017 kimi-k3-resume-reviewer <session-id>`.
