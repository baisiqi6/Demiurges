# DH-016 Findings

## 2026-08-14 — 起点事实

- `main`、`origin/main` 与 DH-016 base均为 `0efcef3a531c192410cdabcd62cf736e54404313`；main干净。
- DH-015已 `done/closed`，DH-016 dependency满足，创建前current item为空。
- 现有 checklist 已要求 versioned manifest、Snapshot lineage、current Ref、ArtifactRef、atomic save/load、corrupt/missing fail closed、排除credential与Presentation transient state、受控import/export。
- 新产品决策进一步显式化：共享 `DEMIURGES_DATA_ROOT`、content-addressed Artifact Store、跨worktree/重启、crash consistency、空Data Root bundle import与linear undo/redo。
- 这不是路线改变，而是把DH-016从功能标签提升为长期世界身份与资产ownership边界。
- 本任务属于high-risk，因为涉及持久authority、schema、崩溃恢复与数据搬运。

## 初始边界判断

- DH-016负责可复用Store与项目持久化；DH-017负责provider generation写入Store；DH-018负责Agent消费已登记资产。
- `receipts/` 首版只允许保存artifact publish、project save/open、bundle import/export的通用完整性证据；provider job/poll/费用receipt留在DH-017。
- Content-addressed artifact可在project manifest发布前先落Store；失败留下的未引用bytes可以是安全orphan，但不能让project revision半可见。GC不在首版。
- Studio不应直接拥有filesystem authority；Gateway或package-owned persistence boundary负责Data Root访问与admission。

## 2026-08-14 — Source audit

- `scripts/verified-cache-file.ts`已对opened fd的regular-file、size、mode、dev、ino、nlink、uid/gid、mtime/ctime读取期稳定性提供可复用检查；DH-016不应重写一套较弱版本。
- `scripts/provider-artifact-validation.ts`已能完整解析SPZ v2与GLB 2.0、重算bounds并闭合manifest identity；Artifact Store publish/read与bundle import均应复用同一validator。
- `apps/agent-gateway/src/provider-asset-api.ts`当前把`cacheRoot/sha256/<digest>`作为读取路径，并在每次GET重复校验；迁移后只需把root切到`<DEMIURGES_DATA_ROOT>/artifacts`，不能降低校验。
- `scripts/import-dh013-provider-assets.ts`、Gateway main与scripted fixture都仍引用repo-local `.artifacts/provider-cache`；它们是需要消除的第二事实面。
- `WorldRepositoryState`目前没有枚举lineage、恢复exact Ref、undo/redo或edit sequence重建入口；持久化不能通过伪造write/edit调用重播，否则会改变Snapshot/Ref identity。
- `RuntimeMvpHost`私有创建authority，`ProductSession`私有创建Host；Open需要package-owned candidate restore/injection seam，但该seam必须与Agent tool surface隔离。
- `ProductSession`的`lastRun`、event sequence与running均是进程态；v1 Project明确不持久化，Open产生settled新session。
- `MARBLE_HUNYUAN_MANIFEST_DIGEST`基于canonical registry，已同时绑定asset、calibration与witness；manifest只需保存这个registry identity和精确Artifact集合，不复制一套calibration事实。
- `canonicalJsonBytes`拒绝non-finite、negative zero、sparse array、accessor/non-plain data，可作为project revision与bundle index的唯一canonical identity函数。
- 项目保存的原子性与Artifact发布不同：Artifact可先发布成为安全orphan；`project.json`必须是唯一可见revision pointer，staging永不参与Open。
- 为避免首版引入不可靠分布式语义，project写入采用保守的同Data Root排他lock；crash遗留lock时允许Open、拒绝Save，不自动按TTL夺锁。
- bundle选择单文件、store-only deterministic ZIP；Demiurges wrapper负责allowlist、budget、path/type/method/CRC/digest policy，第三方codec不是trust boundary。

## 2026-08-14 — Round 1 review decisions

- 两位reviewer分别从不同角度证明初稿还未闭合：project discovery没有重启后的来源；save在rename后/receipt前crash时无法由旧expected revision重放收敛。
- 不新增`recent index`，避免第二个必须原子维护的事实面；使用bounded、validated project-directory enumeration，mtime只做Presentation排序。
- 所有disk mutation统一使用stable `Idempotency-Key`/operationId；write intent在candidate前durable，same-key replay优先于lock与CAS。
- 为安全收束rename前/后的stale intent，Data Root显式区分一个writer owner与多个reader Gateway。reader可跨worktree读取/运行同一项目与资产，但disk mutation fail closed。
- 新writer owner只能由exact stale owner的atomic rename winner取得；它在开放mutation route前收束可证明的intent：published candidate→success，未publish→aborted并保留旧project，ambiguous→recovery required。
- Artifact manifest集合只从registered representation推导；legacy imported representations不被误认成DH-013 Store entry。

## 2026-08-14 — Round 3 lease feasibility

- filesystem directory rename/socket liveness方案已整体删除，避免把诊断通道误当writer authority。
- v1 root-birth由显式`data:init`完成；Gateway missing root零mutation。held no-follow directory fd的`dev/ino`是同host directory-object identity，realpath只做policy/diagnostic。
- lease identity与port公式已冻结为versioned decimal dev/ino bytes、SHA-256与big-endian first-u16 modulo 16384。
- 真实Bun/macOS子进程probe通过：derived port `58309`；第二listener=`EADDRINUSE`；accepted handshake=`DHLEASE1`；holder `SIGKILL` exit 137后第一次尝试即rebind成功；临时root已清理。
- startup recovery生成的`aborted-before-publish` receipt现在是terminal idempotent result；same key replay零mutation返回同一aborted。

## 2026-08-14 — Atomic intent admission

- `.write-lock`不能先创建空壳再填intent，否则kill会留下无法分类的状态。
- 目录rename缺少portable no-replace保证；最终选择先在staging完整write/fsync canonical intent file，再以same-filesystem `link()` no-replace发布为`.write-lock`。
- `link()`成功是durable admission：destination已存在必为`EEXIST`且不覆盖；published lock与staged intent是同一完整inode。publish前orphan可重试，publish后才有aborted/success recovery语义。

## 2026-08-14 — Global operation namespace

- `DataRootWriterLease`只排斥第二个进程，不会自动串行化同一writer进程中的并发请求；project-local lock也无法协调不同Project或不同operation kind。
- 因而`Idempotency-Key`必须先在Data Root全局命名空间durable admit：完整staged canonical intent经hard-link no-replace发布为`receipts/<operation-id>.intent.json`，才允许Project lock、Artifact CAS或bundle publish。
- stable intent只含schema、operationId、kind、target、expected identity与candidate identity；attempt token和writer instance token不是binding，避免重启/replay时自冲突。
- `receipts/<operation-id>.result.json`是no-replace terminal result；intent永久保留为幂等namespace evidence。same key不同binding必须在任何业务副作用前`OPERATION_BINDING_CONFLICT`。
- Project `.write-lock`继续存在，但只负责单Project CAS；它必须与global intent为同inode或exact canonical binding，不能成为全局幂等事实面。

## 2026-08-14 — Live execution ownership

- Durable idempotency namespace与live execution ownership是两个不可混同的问题：global intent解决“这个key绑定什么”，`OperationSingleFlight`解决“当前进程中谁能执行”。
- same-binding follower看到exact global intent/project lock也不获得执行权；它只能等待leader完durable result后replay，或bounded无写入返回transient状态。
- single-flight一直持有到result fsync与cleanup；result无法持久时entry poisoned，禁止live takeover，由下次kernel lease holder恢复。
- Artifact publish也不能使用覆盖型rename；必须完整校验/fsync staging inode后hard-link no-replace，`EEXIST`后重新验证exact Artifact。
- global admission后的revision conflict、project conflict、abort等可分类失败必须先写terminal `aborted-before-publish + stable code`，使live响应与restart replay一致。

## 2026-08-14 — Persistent artifact completeness

- Snapshot representation合法不等于World Project可完整持久；legacy imported/splat kind可以在runtime中合法，但若没有Store/registry闭合，v1 Project必须拒绝而不是默默忽略。
- Project-specific codec必须把所有external representation分为registered+backed或unbacked；后者在Save/Open/bundle import统一`PROJECT_ARTIFACT_UNBACKED`。
- standalone Artifact不能套用Project revision recovery；其destination exact/absent/stable-conflict/identity-drift需要独立但与common finalizer共用的terminal matrix。
- 只有能稳定证明的失败才发布terminal result；identity漂移或无法稳定读取必须recovery-required并保留证据。

## 2026-08-14 — Bundle pre-admission validation

- “在global admission前拒绝”不等于“零Data Root mutation”；若校验本身依赖Data Root staging，失败时仍已有磁盘副作用。
- v1三项provider assets总量约34 MiB，因此可用64 MiB bounded memory在Phase A完成全量ZIP、Project与Artifact验证，避免为了streaming提前扩大临时文件权威。
- Phase B不盲信已验证memory bytes；它写入staging opened fd后重做identity/digest/format/bounds校验与fsync，再进入CAS/Project publish。
- Phase A的negative acceptance必须以syscall instrumentation证明Data Root `mkdir/open-for-write/write/link/rename/fsync` 计数全为0，不能只检查没有`project.json`。

## 2026-08-14 — Bundle durable candidate identity

- Project revision会在Project manifest内逻辑绑定Artifact集合，但若Project未发布且staging不可信，startup recovery不能只凭revision字符串重建逐Artifact分类。
- Bundle global intent因此必须直接携带bounded、sorted、exact candidate Artifact descriptors及其canonical digest，并与Project revision同时构成stable candidate identity。
- Startup recovery的bundle分支必须先于通用Project分支；否则Artifact conflict会被项目不存在粗暴地改写为interrupted。
- 这组durable descriptors只供完整性检查与recovery定位，不是第二provider registry；其每项仍必须匹配Project manifest与frozen registry。

## Approved implementation constraints

- Intent staging是global admission前唯一允许的Data Root staging write；Artifact/Project candidate bytes只能在admission后写入，命名和测试必须区分二者。
- Bundle总entry上限为16且包含两个固定JSON，因此v1 Artifact entries上限为14；intent codec的通用candidate descriptor上限仍可为16，但bundle admission必须取更严格的14。
- Candidate set recovery测试必须显式覆盖descriptor tamper、duplicate、reorder、`artifactSetDigest` drift、exact+absent混合和peak-budget pre-allocation拒绝。
- Export是可验证纯读操作，reader-mode Gateway可执行且不得写receipt/staging；import保持writer-only。
- DH-013 import必须整体切换到Data Root与新global intent/result namespace，不能保留旧cache receipt作为并行事实面。
