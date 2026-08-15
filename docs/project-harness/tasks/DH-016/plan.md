# DH-016 — World Project 持久化与共享 Artifact Store

## Authority

- Item：`DH-016`
- Owner：`codex`
- Session：`codex-dh016-plan-20260814`
- Branch：`agent/codex/DH-016`
- Worktree：`/Users/Admin/projects/WorkTrees/Demiurges-DH-016`
- Base：`0efcef3a531c192410cdabcd62cf736e54404313`
- 模式：high-risk（持久 authority、schema、崩溃恢复、导入导出）
- 当前 authority：只允许完善稳定设计输入、canonical plan、验收设计与 independent cross-plan review。
- Implementation gate：只有相互隔离的 independent reviewers 对同一冻结输入共同达到 `approved / P0=0 / P1=0` 后才进入实现。
- Standing release authority 不跳过 plan/implementation review、closeout 或其他生命周期 gate。

## Goal 与路线位置

把一次性 Gateway 内存 Product Session 中的世界，提升为可长期保存、关闭后恢复、跨 worktree 共用大体积资产并可安全搬运的 `World Project`。

```text
World Project = 可持久化的世界事实与 current Ref
Artifact Store = 可复用、content-addressed 的大体积内容
Repository = 当前进程内的受信运行状态
Presentation = 可丢弃的界面状态
```

DH-016 不改变此前路线，只把第二步从功能名称具体化为长期 ownership 边界：

1. DH-015：真实资产可选择、可摆放、可推演；
2. **DH-016：World Project 持久化与共享 Artifact Store；**
3. DH-017：Marble/Hunyuan prompt → job → verified Artifact；
4. DH-018：Agent 编排已登记资产的生成、组合、运行与评测。

DH-017 是 Artifact Producer，DH-018 是受限的 Agent Consumer；两者都不得重新定义 DH-016 的 Store、Project manifest 或恢复语义。

## 当前事实与设计驱动

- DH-013 的 provider cache 已有 regular-file、symlink、size、mode、读取期 identity、digest、格式与 registry 校验；这些算法应复用。
- 现有路径仍是每个checkout的仓库根 `.artifacts/provider-cache/sha256/<digest>`，不能跨worktree成为唯一事实源。
- `WorldRepository` 只支持进程内 write/edit/run/adopt/read；没有受控枚举、完整重建、project history 或持久化接口。
- `RuntimeMvpHost` 自行私有创建 Repository；`ProductSession` 只保存当前 projection、`lastRun` 与 turn state，进程退出即消失。
- `MARBLE_HUNYUAN_MANIFEST_DIGEST` 已把三项 Artifact、三项 calibration 与三项 witness 绑定成静态 registry identity，可作为首版恢复闭合依据。
- `canonicalJsonBytes` 与 `sha256Hex` 已提供拒绝 sparse/accessor/non-finite/`-0` 的 canonical identity 基础。

## 不变量

1. **Project 不越过 Kernel：** 保存、打开、undo/redo 只能恢复或移动已经验证的 Snapshot/Ref，不修改 Snapshot 内容，也不增加第五个 Agent tool。
2. **候选世界先完整后可见：** open/import 在独立 candidate 中完成 schema、lineage、registry 与所有 Artifact 校验；成功后才整体替换/创建 Product Session。
3. **磁盘状态不自动成为 authority：** 文件存在、JSON 可解析或 HTTP 200 均不足以恢复世界。
4. **Artifact bytes 不携带世界语义：** digest/length/format 证明内容 identity；Frame、Units、calibration/witness 仍由受信 registry 与 Snapshot representation 共同解释。
5. **Presentation 可丢弃：** camera、Observer mode、selection、panel、debug layer、播放游标、`PoseDraft` 与未提交 Transform 不进入 Project。
6. **Runtime evidence 首版不恢复：** `Episode`、`Evaluation`、`lastRun`、正在运行的 turn 与 event sequence 不进入 v1 Project；打开后 `lastRun=null`、`lastSequence=0`、`running=false`。
7. **Credential 永不落盘：** API key、signed URL、Authorization/header、provider raw response、job/poll 临时状态不进入 Data Root、Project、bundle 或 receipt。
8. **安全失败优先：** 缺失、篡改、超预算、未知 schema/registry、锁冲突、staging 残留时 fail closed；不得恢复半个世界或静默 fallback 到旧 checkout cache。

## 目录与配置 contract

唯一 server-side 根为显式环境变量 `DEMIURGES_DATA_ROOT`：

```text
DEMIURGES_DATA_ROOT/
├── artifacts/
│   └── sha256/<64-lowercase-hex-digest>
├── projects/
│   └── <project-id>/
│       ├── project.json
│       └── .write-lock
├── receipts/
│   ├── <operation-id>.intent.json
│   └── <operation-id>.result.json
└── staging/
    └── <operation-id>-<attempt-token>/
```

冻结规则：

- Data Root由显式`bun run data:init -- /absolute/path` bootstrap创建。bootstrap要求parent已存在且受支持，只用atomic non-recursive `mkdir(mode=0700)`创建empty root；并发bootstrap最多一个mkdir成功，其他只验证同一empty regular directory identity。它不创建子目录、不导入Artifact、不启动Gateway，是“所有mutation先持lease”之外唯一且有界的root-birth operation。
- Gateway生产入口遇到root缺失、为空配置、相对路径、NUL、symlink/non-directory或无法打开时以稳定`DATA_ROOT_UNAVAILABLE`拒绝disk writer且零filesystem mutation；测试显式注入已bootstrap的临时绝对root。只有取得writer lease后才可创建/修复`artifacts/projects/receipts/staging`子目录。
- 不提供 repo-relative、cwd-relative、`$HOME` 或 `.artifacts/provider-cache` fallback。
- Gateway以`O_DIRECTORY|O_NOFOLLOW`打开root并持有directory fd，`fstat`要求directory、mode=0700与支持的本机filesystem；realpath只用于路径策略/诊断，不作为lease identity。所有内部路径只由受限ID/digest生成，不接收客户端相对/绝对filesystem path；每项I/O前后核对root fd dev/ino与已打开target identity。
- `staging` 与 `projects` 必须位于同一 Data Root，以保证 manifest publish 使用同 filesystem rename。
- v1 Data Root只允许一个active Gateway writer，但允许其他Gateway以reader mode读取同一Project/Artifact Store并在内存中运行世界；reader mode的Save/Save As/import/DH-013 publish稳定返回`DATA_ROOT_READ_ONLY`。
- 唯一writer admission是package-owned `DataRootWriterLease`。identity bytes严格为UTF-8 `demiurges-data-root-lease-v1\0<dev-decimal>\0<ino-decimal>`，其中dev/ino来自held root fd的BigInt fstat；`leaseDigest=SHA-256(identityBytes)`，`port=49152 + (readUInt16BE(leaseDigest,0) % 16384)`。同一host directory object的case/path alias得到同一dev/ino与port；公式与endianness不留给实现者选择。
- Gateway用`node:net`/Bun兼容backend以`exclusive:true`独占监听`127.0.0.1:<port>`并持有server handle直到进程退出。该backend必须启用`SO_REUSEADDR`但不得启用`SO_REUSEPORT`；实际Bun 1.3.14 probe若无法证明live listener排他、accepted handshake后SIGKILL可在bounded deadline内rebind，则implementation保持blocked，不试探备用port。
- kernel listen handle是唯一lifetime/fencing authority：paused process仍持有端口，crash/exit由OS释放；`owner.json`、Unix socket、PID、TTL、mtime、connect failure与filesystem rename都不得判断或夺取ownership。可选bounded handshake只返回fixed protocol version、lease digest与opaque instance token供诊断，不影响admission。
- Save、Save As、DH-013 Artifact publish、bundle import、project/receipt publish、startup intent recovery与cleanup从开始到最后一次filesystem mutation必须持有同一个live `DataRootWriterLease`对象；不能依赖“publish前再检查token”的TOCTOU。普通API与Studio不能伪造lease。
- v1采用**cooperative single-writer boundary**：所有守约的Demiurges writer都必须服从上述live lease，直接绕过package-owned入口修改Data Root的本机进程属于environment corruption，不是第二个受支持writer。Data Root不是针对同UID任意进程的安全沙箱。
- startup recovery在cleanup前全局冻结并重验全部evidence；每个destructive operation前仍须重验当前target的exact identity。若此后观察到out-of-band filesystem drift，立即停止本轮剩余cleanup，返回稳定`OPERATION_RECOVERY_REQUIRED`，并保留durable receipts及所有尚未完成cleanup的Project/lock/marker/attempt/Artifact evidence。
- 已在发现该越权drift之前完成并fsync的cleanup不回滚，也不重建原路径。DH-016不实现prepare/commit/rollback namespace、filesystem snapshot或专用Data Root daemon；若未来需要抵御不可信本机并发writer，必须建立独立切片重新设计transaction-grade cleanup。
- Network filesystem与跨主机并发writer不在v1支持范围；root-fd filesystem capability不能被package-owned local support check积极确认时只进入reader mode。v1真实验收使用同一host/network namespace与本机受支持volume。
- 新进程只有成功取得kernel lease后，才有authority在开放disk mutation route前收束旧global operation intent、project write lock与staging。
- Artifact route 从 `<dataRoot>/artifacts/sha256/<digest>` 读取；Studio 与浏览器永远只看到 `assetId`、digest 与受控 `/api/assets/:assetId`。
- DH-013 旧 cache 只允许通过一次显式 `import:dh013 --data-root ...` 迁入 Store；导入成功后 Gateway 不再读取旧 cache。

## Artifact Store contract

Artifact Store 是 immutable content-addressed bytes，不是通用 provider registry：

- key：严格 lowercase SHA-256，路径为 `artifacts/sha256/<digest>`；
- publish 输入必须先匹配受信 `ManifestAssetEntry` 的 `assetId/digest/byteLength/format/elementCount/sourceBounds`；
- 任何 Artifact publish 在 Store 产生首个业务副作用前，必须先完成下文 Data Root 全局 `operationId` durable admission；不能只依赖进程内 mutex、digest CAS 或 project-local lock；
- 写入 `staging/<operation-id>-<attempt-token>/artifact`，在已打开 fd 上校验 regular file、完整读取、读取前后 identity、digest、format、bounds，再 file `fsync/close` 与attempt-directory fsync；
- 只有live operation leader可以atomic no-replace `link(stagedArtifact, artifacts/sha256/<digest>)`发布完整inode并fsync Artifact directory；绝不使用会覆盖existing destination的ordinary rename。`EEXIST`只能重新验证exact bytes identity后幂等成功；存在但损坏、wrong type或验证期identity漂移时fail closed，不覆盖、不修补；
- standalone Artifact live publish的`EEXIST`处理必须走全局common terminal finalizer：destination exact candidate为`success`，destination稳定存在但bytes/type非candidate为`aborted-before-publish + ARTIFACT_DESTINATION_CONFLICT`，identity漂移或无法稳定读取为`OPERATION_RECOVERY_REQUIRED`。在result durable publish前不得向live caller返回terminal结果；
- publish 先于 project manifest 可留下未引用的安全 orphan；orphan 不可被 Project 自动采用，GC 延后；
- 从 Store read 时仍重复 regular-file、长度、稳定 identity、digest 与格式校验，不能因为 publish 曾成功而跳过；
- symlink、directory、FIFO/device/socket、hard-link count 漂移、读取期 inode/mtime/ctime/size/mode 漂移、oversize、trailing bytes、解压预算超限均拒绝；
- receipt 只记录稳定 code、operation id、assetId、digest、byteLength、结果；不记录来源 URL、credential 或任意本机绝对路径。

首版 Store 只需要登记当前静态 registry 中的 DH-013 三项真实 Artifact；不建立 provider adapter、任意 MIME 上传或通用 Artifact SDK。

`bun run import:dh013 -- --data-root <absolute>`不伪造HTTP header；它用`op:` + SHA-256(`demiurges-dh013-import-v1\0` + frozen registry manifest digest)作为deterministic `operationId`，并与`operationKind=artifact.import-dh013`与三项exact candidate digests绑定。因此同一Data Root重跑是同key/same-binding replay，registry改变则是新operation；CLI不从时间、随机数或本机路径派生identity。

## World Project manifest v1

`project.json` 使用 exact-key、dense-array、plain-data、canonical JSON；未知字段一律拒绝。冻结的逻辑形状为：

```ts
interface WorldProjectManifestV1 {
  readonly schemaVersion: 1;
  readonly projectId: `project:${string}`;
  readonly revision: `project-revision:sha256:${string}`;
  readonly metadata: { readonly displayName: string };
  readonly registry: {
    readonly id: "registry:marble-hunyuan-v1";
    readonly manifestDigest: typeof MARBLE_HUNYUAN_MANIFEST_DIGEST;
  };
  readonly snapshots: readonly Snapshot[];
  readonly history: {
    readonly snapshotIds: readonly Snapshot["id"][];
    readonly cursor: number;
  };
  readonly currentRef: RefRecord;
  readonly artifacts: readonly {
    readonly assetId: ManifestAssetEntry["assetId"];
    readonly digest: string;
    readonly byteLength: number;
    readonly format: ManifestAssetEntry["format"];
  }[];
}
```

语义闭合：

- `revision` 是除自身外其余 manifest 语义字段 canonical bytes 的 SHA-256；metadata 不含时间戳，因而同一语义内容得到同一 revision。
- `projectId` 只能是长度受限的 lowercase slug/UUID-like identifier；不得含 `/`、`\\`、`.` path segment、控制字符、百分号编码或 Unicode confusable。
- `displayName` 是长度受限、NFC 的可见文本，不成为 path；不得含控制字符。
- `snapshots` 与 `history.snapshotIds` 一一对应，按 root → tip 的单线顺序排列；首项 `source=write,parentId=null`，其余每项 `parentId` 必须等于前一项 ID。
- 同一 ID 只出现一次；每个 Snapshot 通过package-root re-export的 `requireSnapshotRepresentationIntegrity`（实现位于 `artifacts/ball-vessel-fixture.ts`）与 `requireRegisteredSnapshotIdentity`（实现位于 `artifacts/diagnostic-rigid-fixture.ts`），保持递归冻结、Frame=`frame:world`、Units=`units:si` 与 scenario exact identity。
- `cursor` 是 safe integer且落在history内；`currentRef.name=world:current`，`snapshotId=history.snapshotIds[cursor]`，version为正safe integer且不由cursor推导。
- `artifacts` 只从全部持久 Snapshot 中的`registered-rigid-mesh`与`registered-gaussian-splat` representations推导，形成精确、排序、无重复集合；每项必须exact匹配frozen registry，registry digest必须等于当前受信registry。legacy `imported-rigid-mesh`/`gaussian-splat`不被误解释为DH-013 provider Store entry。
- World Project v1只允许两类representation：不依赖外部bytes的procedural/primitive representation，以及已被上述registered kind + registry + Store exact支撑的external representation。任何持久Snapshot含legacy `imported-rigid-mesh`、`gaussian-splat`或其他引用external bytes但不能从manifest `artifacts`与Store闭合的representation，Project codec、Save/Save As、Open与bundle import必须以stable `PROJECT_ARTIFACT_UNBACKED` fail closed。Save/Save As与bundle全量验证在global operation admission前完成，因此该拒绝零Data Root mutation；Open在candidate session/repository对live可见前拒绝。
- primitive/no-external-artifact project 的 `artifacts=[]` 可用于codec/integration回归；首版产品Save/Open UI以Marble × Hunyuan composite为主场景。
- v1 不含 `Episode`、`Evaluation`、`lastRun`、events、turn/session ID、camera、selection、draft、provider transient或filesystem path。
- 未知 `schemaVersion` 不猜测迁移、不部分加载；返回稳定 `PROJECT_SCHEMA_UNSUPPORTED`。

## Repository 恢复边界

在 `@demiurges/world` 内增加 package-owned、非 Agent tool 的 project restoration seam：

- 输入只能是已经通过 World Project codec 的 `snapshots + currentRef`；
- 在新的隔离 `WorldRepositoryState` 中依序插入完整 lineage，验证 source/parent/ID/representation/fixture；
- 以受控 restore operation 设置 exact current Ref，并把 edit sequence 恢复为不会与已存 `snapshot:edit-N` 冲突的值；
- 返回新的 `RuntimeMvpHost`/authority；不得逐步修改现有 live Repository；
- malformed candidate 失败时，原 Product Session 的 Repository、projection、Ref、`lastRun` 与 running reservation byte-equivalent 不变；
- restore seam 不暴露到 `WORLD_TOOL_CONTRACT`，OMP 仍只有 `read/write/edit/run`。

`ProductSession` 增加可注入 Host/restore candidate 的 product control-plane seam。打开 Project 时创建一个新 settled session；不原地覆写正在运行或已有世界的 session。

## Save、Open 与 crash atomicity

### Save / Save As

每个外部可请求的磁盘mutation都必须携带stable `Idempotency-Key` header；Gateway把它规范化为opaque UUID-like `operationId`。root bootstrap是前述唯一root-birth例外；startup recovery/cleanup只能沿用已durable admit的operationId与binding，不创造新operation。Save/Save As另携带`expectedRevision`；bundle import与DH-013 publish也使用同一幂等键规则。同一Data Root内，同一operation只能绑定一个`operationKind + projectId|assetId + expectedRevision|null + candidateRevision|digest`；该唯一性由全局durable intent建立，不由project-local lock或进程内串行性推断。

每个writer进程必须实作package-owned `OperationSingleFlight`，以`operationId`为key，并在读取/创建staging或global intent前取得。它是live execution authority，不替代global intent的durable namespace authority：同一operationId只有leader可以写staging、发布intent、进入Project lock/Artifact CAS/bundle publish与发布result。same-binding follower必须在critical section外等待leader，leader结束后重读intent/result并replay；等待deadline/request abort时只返回transient `OPERATION_IN_PROGRESS`/`REQUEST_ABORTED`，follower零filesystem mutation且不取消leader。single-flight持有到terminal result、directory fsync与exact cleanup完成；若result无法durable publish，该entry在本进程内poison为`OPERATION_RECOVERY_REQUIRED`，不允许另一live request继续执行，只能由下次lease holder的startup recovery收束。

所有已global admit的mutation（Save/Save As、standalone Artifact publish、DH-013 import、bundle import）共用一个package-owned `OperationTerminalFinalizer`，不把terminalization藏在Save专属步骤。它只发布`success`或`aborted-before-publish + stable public code`，使用下文result no-replace/fsync协议；任何live可分类失败必须先finalize再响应，startup recovery必须根据同一intent与磁盘事实得到同一variant/code。无法稳定分类、intent/result漂移或result不可持久时是`OPERATION_RECOVERY_REQUIRED`，不伪造terminal result。

1. Gateway必须已持有并继续持有进程生命周期`DataRootWriterLease`；session reservation拒绝running、aborted request、空world与非法operationId。
2. 从受信Repository导出immutable linear history；不从Studio回传projection拼装manifest。服务端计算deterministic candidate revision并验证全部Artifact。
3. **Global replay/admission优先：** leader在任何Project lock、Artifact CAS publish或bundle business publish前，先读取`receipts/<operation-id>.intent.json`与`<operation-id>.result.json`。terminal result与binding exact时返回同一success/`aborted-before-publish`且零新mutation；任何kind/project/asset/expected/candidate binding drift在业务mutation前统一返回`OPERATION_BINDING_CONFLICT`。无global intent时，先在unique `staging/<operation-id>-<attempt-token>/operation-intent.json`完整写入canonical record，其持久字段exact只有`schemaVersion + operationId + operationKind + target(projectId|assetId) + expectedIdentity|null + candidateIdentity`；`attemptToken`只出现在staging路径，`writerInstanceToken`只出现非权威diagnostic，两者都不进入stable binding。file fsync/close、attempt-directory fsync后，再以atomic no-replace `link(stagedIntent, receipts/<operation-id>.intent.json)`发布同一inode并fsync receipts directory。`EEXIST`只重读已发布intent并比较exact binding；不覆盖。这个hard-link publish是全局durable admission point：它之前的staging只是可清理orphan，它之后同key不可再绑定其他operation。global intent只决定binding，不授予第二个live request执行权；该权限只属于当前single-flight leader或取得新kernel lease后的startup recovery。

`candidateIdentity`是operation-kind-specific canonical plain data：Project Save/Save As为`projectRevision`；standalone Artifact为`assetId + digest + byteLength + format + elementCount + sourceBounds`；DH-013 import为三项排序Artifact descriptors；bundle import为`projectRevision + ordered candidateArtifacts[] + artifactSetDigest`。`candidateArtifacts[]`每项与standalone descriptor同形，按digest排序、无重复、最多16项；`artifactSetDigest`是该canonical array bytes的SHA-256，并必须与Phase A验证的Project manifest `artifacts`集合exact一致。因此新lease holder不依赖未发布staging path/attempt token，仅从immutable global intent就能唯一定位并重验所有candidate Artifact destinations；intent中集合/hash/project revision任一不自洽即`OPERATION_RECOVERY_REQUIRED`。
4. Save/Save As leader在global admission后才确保目标project directory存在：existing Project重用已no-follow验证的directory；Save As `expectedIdentity=null`且pre-admission已证明path absent时，用atomic non-recursive `mkdir(mode=0700)`创建dir并fsync `projects/` parent，`EEXIST`重读不覆盖。然后以atomic no-replace `link(receipts/<operation-id>.intent.json, projects/<id>/.write-lock)`发布同一个已完成inode，并fsync project directory；`EEXIST`绝不覆盖任何existing file/type。project lock只负责project-local CAS/serialization，必须与global intent同inode或exact canonical bytes/binding；即使同inode/exact binding，也不授予follower继续执行权。不同binding返回`PROJECT_WRITE_LOCKED`/`OPERATION_BINDING_CONFLICT`。writer instance token只用于evidence，不替代kernel lease。
5. project lock成功后写入同一attempt staging下的`project.json`，完整validate、canonicalize、`fsync`文件并close。
6. 若目标已有`project.json`，其revision必须exact匹配intent.expectedRevision；Save As要求目标不存在，或same projectId/same candidate revision幂等。global admission后发现revision/project-id/abort/其他可分类的pre-publish失败时，leader必须先发布same-binding terminal `aborted-before-publish` result，其stable `code`为`PROJECT_REVISION_CONFLICT`、`PROJECT_ID_CONFLICT`、`REQUEST_ABORTED`或其他已登记public code，再返回该exact result；不得先返回一次性错误而把replay留给startup另行分类。
7. rename candidate到`projects/<id>/project.json`，随后`fsync` project directory；此刻candidate revision成为唯一可见Project事实。
8. 在attempt staging中完整写入与global intent binding exact的terminal result，其variant只能为`success`或`aborted-before-publish + stable public code`。file fsync/close、attempt-directory fsync后，以atomic no-replace hard-link发布为`receipts/<operation-id>.result.json`并fsync receipts directory；`EEXIST`必须重读并要求exact terminal result，否则`OPERATION_RECOVERY_REQUIRED`。result不含secret/path；intent作为永久幂等namespace evidence保留，不因success/aborted删除。
9. 仍持有kernel lease时，只释放与global intent、operationId、operationKind和candidateRevision exact匹配的project lock；失败不删除未知lock/staging。same key绑定不同operation kind/project/asset/expected/candidate统一返回`OPERATION_BINDING_CONFLICT`。

Data Root writer取得kernel lease后、对外提供disk mutation route前扫描bounded global intents/results与project write locks：

- global intent与result完整且binding exact：直接重放terminal result，不重做业务mutation；
- global intent完整、result缺失，但已发布`project.json`或standalone Artifact exact等于candidate：补齐必要directory fsync与success result，清理exact staging/project lock，结果收敛为success；
- standalone `artifact.publish`/`artifact.import-dh013` global intent完整、result缺失且destination不是exact candidate时：destination absent收敛为`aborted-before-publish + OPERATION_INTERRUPTED`；destination稳定存在但bytes/type非candidate收敛为`aborted-before-publish + ARTIFACT_DESTINATION_CONFLICT`；destination/intent读取期identity漂移、不可稳定打开或result binding不可证明时保留证据并`OPERATION_RECOVERY_REQUIRED`。live `EEXIST`与startup recovery必须使用这一个matrix；
- `bundle.import` global intent完整、result缺失时，在通用Project分支前先验证`candidateArtifacts[]/artifactSetDigest/projectRevision`自洽，再按digest顺序以no-follow opened-file validator重验每个destination：exact继续，absent记录为未发布但不是conflict，稳定noncandidate/wrong-type立即发布`aborted-before-publish + ARTIFACT_DESTINATION_CONFLICT`，任一identity drift/unreadable/集合不自洽保留证据并`OPERATION_RECOVERY_REQUIRED`。只有全部Artifact为exact/absent时才进入下一条Project分类；Project candidate未发布时最终`OPERATION_INTERRUPTED`，已publish exact Artifact只是safe orphan。该分支与live Phase B使用同一package-owned Artifact matrix；
- Project Save/Save As/bundle global intent完整、result缺失，且业务candidate未发布：若当前Project仍为expected/不存在，写入same-binding terminal `aborted-before-publish + OPERATION_INTERRUPTED`；若当前Project是另一个完整可验证revision，写入same-binding terminal `aborted-before-publish + PROJECT_REVISION_CONFLICT`。两者都清理exact attempt staging/project lock，已发布Project保持可用；Bundle已发布的unreferenced Artifact是可验证安全orphan，不使Project成为半恢复世界；
- published global intent malformed、result/lock binding冲突，或磁盘事实无法作为expected/candidate/另一完整可验证revision分类：保留证据，该operationId返回`OPERATION_RECOVERY_REQUIRED`；关联Project时同时标记`PROJECT_RECOVERY_REQUIRED`，Open仍可验证读取已发布Project，但相关Save拒绝；不得猜测删除；
- 没有任何published global intent/result/project lock通过exact operation/attempt binding引用的partial/complete attempt staging不构成durable admission；新lease holder可在验证regular-directory、path budget、opened-file identity与“不被任何intent/lock/result引用”后作为orphan清理，不生成aborted result。malformed/unknown published global intent或project lock永远不能被当作pre-admission orphan。
- Save As在运行前目标Project不存在且terminal aborted时，清理exact project lock后只有在该project directory仍为已打开、no-follow、empty regular directory且与operation exact关联时才删除它，并fsync `projects/` parent；任何未知entry/identity漂移都保留并fail closed，不递归删除。

因此global intent publish前kill收敛为可重试的not-admitted operation；global intent publish后到业务candidate publish前kill收敛为旧revision/无Project+terminal aborted；Project或standalone Artifact publish后任意kill收敛为同一candidate success。同key replay先于project lock、Artifact CAS与旧expected CAS。首版不以PID/TTL/socket探测夺锁，也不允许没有live kernel lease的“清锁按钮”。

### Open

1. 只按validated `projectId`定位exact `projects/<id>/project.json`，使用no-follow regular-file fd与读取前后identity校验。
2. 应用manifest byte/JSON/depth/entries数量budget，decode exact schema并重算revision。
3. 校验完整lineage/current Ref/registry/artifact set。
4. 对每个Artifact从Store重新执行byte identity与格式验证。
5. 在内存中构建candidate Repository与settled Product Session。
6. 全部成功后才在Session registry发布新session；失败不占用session、不改变已有session/project list state。

`staging/` 永远不参与 Open；`project.json` 是唯一已发布 revision pointer。

### Project listing

不新增第二份`recent index`。`GET /api/projects`对`projects/`做bounded、no-follow目录枚举，只返回完整验证过的`project.json`的`projectId/displayName/revision`；非法目录、symlink与超预算项不进入列表，并以bounded stable diagnostic count呈现，不能被Open。`project.json` mtime仅作为non-authoritative“最近修改”展示排序，不进入manifest、revision、receipt或Open admission。重启后仍可由同一Data Root发现Project。

## Linear undo / redo

undo/redo 是 Human/Harness control-plane operation，不是 Kernel action或 Agent tool：

- `undo`：`cursor > 0`时移动到父Snapshot，创建`world:current`新Ref record，`version + 1`；Snapshot不变。
- `redo`：`cursor < history.length - 1`时移动到唯一下一Snapshot，Ref `version + 1`；Snapshot不变。
- 边界无可移动项时返回明确`UNCHANGED`，不递增Ref version、不清空或伪造任何evidence。
- undo后发生新的accepted write/edit/adopt时，截断cursor之后的redo history，再附加新Snapshot；不建立分支。
- undo/redo后`lastRun=null`，因为当前世界已改变；operation不创建Episode/Evaluation。
- 每次移动后需要显式Save才成为持久revision；首版不做后台autosave。
- stale expected project revision/ref、running turn、aborted request均在mutation前拒绝，且history/ref/edit sequence不变。
- 未绑定Project的session调用undo/redo返回`PROJECT_NOT_BOUND`；历史边界返回`PROJECT_HISTORY_BOUNDARY`/`UNCHANGED`，均零mutation。

## World Project bundle v1

首版 bundle 是单文件、无压缩、确定性 ZIP，media type `application/vnd.demiurges.world-project+zip`，推荐扩展名 `.dworld`。只允许：

```text
bundle.json
project/project.json
artifacts/sha256/<digest>   # 仅 project 引用项
```

规则：

- `bundle.json`固定schema/version，绑定project revision、条目path、byteLength与SHA-256；canonical JSON。
- entry顺序、时间戳、权限与ZIP metadata固定；export同一project revision产生byte-identical bundle。
- 只允许ZIP store method；拒绝compression、encryption、data descriptor、ZIP64、extra field、duplicate name、unknown entry、absolute/backslash/`..`/NUL path、symlink/device mode、trailing data与CRC/digest不一致。
- v1 import固定内存budget：request body/total stored bytes `<=64 MiB`，单entry `<=32 MiB`，entry count `<=16`，central directory `<=64 KiB`，`bundle.json`/`project.json`各`<=1 MiB`；所有长度累加使用safe integer并在分配前检查。package-owned `BUNDLE_IMPORT_PHASE_A_MAX_OWNED_BYTES=224 MiB`同时统计raw body、entry copies/views需要的owned backing buffers、SPZ/GLB解码中间bytes与canonical JSON bytes；计划分配会超过上限时在分配前拒绝。JS plain object大小由entry/depth/key/string预算另行限定，不用“未计入byte buffer”绕过总预算。
- import明确分两阶段。**Phase A — zero Data Root mutation：** 在不创建Data Root staging、不open-for-write、不mkdir/link/rename/fsync的前提下，于上述bounded memory中完整验证ZIP table/全体bytes、bundle index、Project codec、external-artifact completeness、registry、Snapshot lineage、每个Artifact digest/length/format/bounds与目标Project的只读conflict状态，并计算exact operation binding。任一项失败（包括legacy/unknown unbacked external representation）立即返回，Data Root write-syscall计数为0。**Phase B — admitted publish：** 取得`OperationSingleFlight`，replay/发布global intent；只有leader在admission后才创建`staging/<operation-id>-<attempt-token>`，把已验证memory bytes写入opened fd，并重做opened-file identity、digest/length/format/bounds验证与file/directory fsync，随后逐个幂等publish Artifact，最后原子publish Project。
- bundle内逐Artifact的destination exact/absent/stable-conflict/identity-drift与standalone Artifact复用同一EEXIST/recovery matrix；因bundle candidate是Project，中途Artifact conflict通过common finalizer记录same-binding terminal result，已publish的exact CAS bytes只是安全unreferenced orphan。
- import从读取body到最后cleanup全程要求live`DataRootWriterLease`；Project publish明文复用Save步骤4–9，fresh target的`expectedRevision=null`，same projectId/same revision走same-key或same-binding幂等结果，并发different revision遵守同一lock/CAS/conflict语义。
- projectId已存在且revision相同：幂等成功；同projectId不同revision：返回`PROJECT_ID_CONFLICT`，绝不覆盖。用户若需新ID，使用显式“另存为/导入副本”后续动作，不静默改写identity。
- 导入空Data Root后project/world/artifact/calibration identity与export前exact相同；不调用provider。
- 实现允许引入一个直接、固定版本的最小ZIP codec dependency，但所有安全policy必须由Demiurges wrapper明确实施，不能把第三方parser默认行为当trust boundary。

## Gateway API 与 Studio 产品行为

新增 product control-plane routes，不加入 OMP model tools：

- `GET /api/projects`
- `POST /api/sessions/:sessionId/project/save-as`
- `POST /api/sessions/:sessionId/project/save`
- `POST /api/projects/:projectId/open`
- `POST /api/sessions/:sessionId/project/undo`
- `POST /api/sessions/:sessionId/project/redo`
- `GET /api/projects/:projectId/export`
- `POST /api/projects/import`

所有mutation使用bounded body、AbortSignal、stable public error code、no-store与同一session/project reservation；raw filesystem/provider错误不出现在响应。

Studio首版提供：

- 未保存状态与项目名/revision显示；
- “保存”“另存为”“打开项目（按非authoritative mtime展示最近修改）”“导出”“导入”“撤销”“重做”的可见按钮与禁用态；
- 新建项目仍是新的空Product Session，第一次完整world后通过Save As成为持久Project；
- Open成功后替换当前projection并重置Presentation transient state；失败保留原viewport/session并显示稳定错误；
- 不提供arbitrary server path输入，不在localStorage/URL暴露Data Root；
- 导入/导出使用浏览器File/Blob boundary；CameraRig与按需rAF语义不变，idle仍回到0无效帧。

## Expected implementation surface

计划允许的主要文件（fresh review可在不扩大语义的前提下调整测试文件名）：

- `packages/world/src/repository/world-repository.ts`：受控history export/restore/ref move seam；
- `packages/world/src/host/runtime-mvp-host.ts`：注入/恢复candidate authority；
- `packages/world/src/index.ts`与对应tests；
- 新建`packages/world-project/`：manifest codec、Data Root、`DataRootWriterLease`、Artifact Store、atomic project store、bundle codec与tests；
- `apps/agent-gateway/src/product-session.ts`：project-bound session/history control；
- `apps/agent-gateway/src/product-session-api.ts`：projects routes/reservation/error mapping；
- `apps/agent-gateway/src/provider-asset-api.ts`、`main.ts`、`scripted-fixture-main.ts`：共享Data Root；
- `apps/studio/src/product-session-client.ts`、`App.tsx`、`styles.css`与对应tests；
- `scripts/import-dh013-provider-assets.ts`与安全校验helper；
- `package.json`/workspace package manifests/`bun.lock`（仅在采用固定ZIP dependency时）；
- DH-016 canonical harness docs。

不允许修改MuJoCo、Evaluator、AdoptPolicy、四工具contract、OMP restricted tool policy或provider generation contract，除非fresh plan review明确重新授权。

## Acceptance 与 adversarial matrix

### A. Data Root / Artifact Store

- explicit absolute root跨main/worktree/Gateway读取同一三项DH-013 assets；旧cache不是fallback。
- relative/empty/NUL/symlink escape、wrong mode/type、digest/path case drift、partial/oversize/format-invalid/trailing bytes fail closed。
- concurrent same-digest publish幂等；different bytes/same target不覆盖；读取期stat漂移拒绝。
- standalone Artifact intent发布后、destination link前kill，以及destination exact/absent/corrupt/wrong-type/identity-drift的live `EEXIST`与restart replay逐项得到同一`success`、`OPERATION_INTERRUPTED`、`ARTIFACT_DESTINATION_CONFLICT`或`OPERATION_RECOVERY_REQUIRED`；非terminal时不清理证据。
- receipt无key、URL query、Authorization、绝对路径或provider raw message。

### B. Manifest / Repository restore

- canonical Marble × Hunyuan v1→Scene Composer v2→save→new process open，Snapshot IDs、parents、current Ref、Ref version、ArtifactRefs、Frame/Units、registry/calibration/witness exact。
- primitive empty-artifact project可round-trip；unsupported scenario/registry或extra/missing/reordered/duplicate Snapshot与artifact mapping拒绝。
- 含legacy `imported-rigid-mesh`/`gaussian-splat`外部引用的diagnostic/session在Save/Save As与bundle import中以`PROJECT_ARTIFACT_UNBACKED`且零Data Root mutation拒绝；伪造该Snapshot的Project Open在candidate对live可见前拒绝。Marble × Hunyuan registered composite与无external-artifact primitive不回归。
- forged currentRef/cursor/version、branching/cycle/orphan/duplicate ID、runtime-terminal without valid parent、Snapshot mutation、non-finite/`-0`/sparse/accessor input拒绝。
- open candidate任一步失败，existing session/repository/ref/lastRun/project list与session capacity不变。
- restore后首个合法edit ID不碰撞、不跳号；Agent `read/write/edit/run`行为与工具集合exact不变。

### C. Atomic save / crash

- fault injection覆盖single-flight leader/follower/poisoned release、attempt mkdir、global intent write/short write/file fsync/close/attempt-dir fsync、global hard-link no-replace publish/receipts-dir fsync、project hard-link no-replace publish/project-dir fsync、Artifact hard-link no-replace CAS/artifact-dir fsync/EEXIST revalidation、Project candidate write/validate/fsync/close、revision CAS、Project rename/directory fsync、result与unlock各边界。
- 对同一operationId逐点kill：global intent publish前没有durable admission，orphan staging可清理且same key重新开始；global intent publish后、business candidate publish前生成same-binding terminal aborted；Project/standalone Artifact publish后收敛为candidate success，旧expected replay不被误判conflict。
- 同key同时用于两个不同Project、Save与Artifact publish、Save与bundle import时，只有一个exact binding能发布global intent；败者在Project lock/Artifact CAS/bundle publish前返回`OPERATION_BINDING_CONFLICT`，并证明零业务副作用。该测试使用真实并发请求与逐点crash，不仅是单线程mock。
- 同key+同binding的Save、standalone Artifact publish与bundle import真实并发时，只有single-flight leader能产生filesystem/business mutation；follower只等待并replay exact terminal result，或在bounded deadline/abort时无写入返回transient结果。断言Project/Artifact publish计数exact=1、follower staging/lock/CAS/result write计数=0，leader不被follower abort取消，poisoned entry不可由另一live request接管。
- global admission后的live revision/project/abort/Artifact conflict先durable finalize再响应；立即same-key replay与重启startup recovery都返回byte-equivalent terminal variant/code。Save As terminal aborted后仅删除可证明由该operation创建且仍empty的exact project directory并fsync parent，不递归清理。
- stale staging不参与open；exact recoverable lock由exclusive新owner收束，malformed/ambiguous lock不删除并使Save返回`PROJECT_RECOVERY_REQUIRED`，Open仍可验证成功。
- 两个进程/两个worktree对同一project save：最多一个持锁成功，另一个无side effect返回locked/conflict。
- 两个Gateway争用同一Data Root：最多一个成功bind derived loopback port并开放disk-mutation routes；active/paused owner存在时第二个进入reader mode且仍能验证读取同一Project/Artifact，写入稳定拒绝；writer被SIGKILL后OS释放lease，新进程才能成为writer并恢复intent。
- deterministic port被无关进程或另一Data Root占用时安全进入reader mode并报告`DATA_ROOT_WRITER_LEASE_UNAVAILABLE`；不得probe备用端口或误认writer。
- 在Save最后一次admission后暂停writer、并发启动reader、再恢复writer：reader始终不能cleanup/publish，writer仍是唯一mutation holder；Artifact publish、bundle import、receipt与startup recovery逐项证明没有绕过lease。
- root缺失时Gateway零mutation；bootstrap并发只产生一个0700 empty root。对同一directory object使用case spelling/受支持path alias时dev/ino、lease digest与port exact相同；不同code path使用同一v1 formula。
- Bun 1.3.14真实子进程probe覆盖：无accepted connection与已有bounded handshake两种情况下，live/paused owner排他，SIGKILL后deadline内rebind；child有deadline、kill/reap且无残留listener。
- cooperative writer下，两个以上pending Project的startup recovery在没有越权外部mutation时必须全部收敛并完成exact cleanup；若测试seam在第一个Project已完成并fsync cleanup后篡改后续Project evidence，recovery必须在处理该Project前检测漂移、稳定返回`OPERATION_RECOVERY_REQUIRED`，保留该Project及所有尚未处理evidence与durable receipts。第一个Project已完成的cleanup保持完成，不要求事务性回滚。
- cleanup开始前或当前destructive operation前已经可观察到的foreign entry、missing/replaced lock/marker仍是产品correctness边界：必须在该次mutation前fail closed。只有在先前cleanup已经完成并fsync之后才发生的直接filesystem mutation，才适用上述environment-corruption无回滚规则。

### D. Undo / redo

- v1→v2→undo回v1→redo回v2，只移动Ref、version单调，Snapshot bytes/ID不变。
- undo后新edit截断redo；边界unchanged不推进version；save/restart后cursor与redo能力exact恢复。
- running/stale/aborted操作零mutation；`lastRun`清理规则闭合；不增加第五个Agent tool。

### E. Bundle

- 同revision export byte-identical；空Data Root import得到同project revision、world identity与Artifact digest，provider调用计数=0。
- missing/extra/duplicate/traversal/backslash/absolute/symlink/compressed/encrypted/ZIP64/oversize/CRC/digest/manifest drift全部拒绝且Data Root无partial project。
- instrumented syscall反例覆盖legacy `imported-rigid-mesh`、legacy `gaussian-splat`与unknown unbacked external representation：三者都在Phase A返回`PROJECT_ARTIFACT_UNBACKED`，并断言Data Root `mkdir/open-for-write/write/link/rename/fsync` count全为0；计数窗口从import request handler接收请求开始，到Phase A返回结束，不把Gateway启动时lease holder预先建立Data Root子目录的调用误计入该request。ZIP table/CRC/digest在该反例中本身合法，确保测到的是Project completeness边界。
- Phase B的逐Artifact exact/absent/corrupt/wrong-type/identity-drift复用standalone matrix；中途失败有same-binding terminal result，Project不可见，已publish exact bytes仅是safe orphan。
- fault injection在bundle Artifact stable conflict已检测、terminal result hard-link/fsync前kill；重启后从global intent的ordered candidate set先重跑Artifact matrix，same-key replay仍为`ARTIFACT_DESTINATION_CONFLICT`，Project不可见，exact CAS orphan保持可验证。对identity drift的同一kill point必须保持`OPERATION_RECOVERY_REQUIRED`而不改写为interrupted。
- same ID/same revision幂等；same ID/different revision稳定冲突；导入错误不回显本机路径或secret marker。

### F. Real process / Chromium

1. 使用现有DH-013 assets创建composite v1并编辑v2，Save As成功。
2. 真实停止Studio/Gateway，在DH-016 worktree以同一Data Root启动，通过bounded project listing发现并Open project。
3. viewport恢复同一world/current Ref与三项assets，不出现黑屏/page error/NaN；不调用Marble/Hunyuan。
4. Hunyuan GLB临时移走或篡改后Open明确失败，当前已打开world保持；恢复bytes后可再次打开。
5. UI undo/redo、save、export/import可见且状态正确；Presentation draft/camera/selection未从Project恢复。
6. 导入到全新临时Data Root后真实打开；idle rAF=0，Agent输入与Observer交互不回归。

## Verification commands

实现阶段至少执行：

```text
bun test <focused world-project/repository/gateway/studio tests>
bun test
bun run typecheck
bun run build
git diff --check
.artifacts/harness/harnessctl validate
.artifacts/harness/harnessctl doctor
```

另执行真实process restart、two-worktree shared-root、kill-point fault injection、empty-root bundle round-trip与真实Chromium acceptance。所有bounded subprocess必须有deadline/kill/reap，测试退出后不得遗留Gateway/Studio/lock/staging进程副作用。

## Phase plan

1. **Authority与独立worktree** — completed。
2. **Source/contract audit** — completed：确认旧cache、Repository/Host/ProductSession与registry seam。
3. **设计与验收冻结** — completed：本plan冻结Data Root、manifest、atomicity、bundle、history与产品surface。
4. **Independent cross-plan review** — completed：Round 10计划双审批准。
5. **Package-first implementation** — completed：World Project codec、Store、Repository restore与fault tests已落地。
6. **Gateway/Studio integration** — completed：routes、shared assets与产品UI已落地。
7. **Full verification与implementation cross-review** — in_progress：Human已选择cooperative single-writer Option A；冻结该边界并进入Round 22 fresh review。
8. **Closeout/release** — gated；遵守standing commit/push/ff-merge authority，但不得跳过review。

## Errors Encountered

| Error | Attempt | Resolution |
|---|---:|---|
| `accept`登记了`docs/project-harness/tasks/DH-016/plan.md` locator，但文件未自动scaffold | 1 | 不重复命令；按该唯一locator使用`apply_patch`创建canonical plan，并在创建后执行`sync/validate/doctor` |
| 按旧入口调用`.artifacts/harness/harnessctl.py`得到`No such file` | 1 | 检查实际bootstrap runtime，确认升级后的正常入口为可执行文件`.artifacts/harness/harnessctl`；不重复旧命令 |
