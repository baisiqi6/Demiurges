# DH-016 Progress

## 2026-08-14 — Authority 与 planning 初始化

- 用户确认将DH-016明确为 `World Project 持久化与共享 Artifact Store`。
- 从clean `main@0efcef3`创建 `agent/codex/DH-016` 与独立worktree `/Users/Admin/projects/WorkTrees/Demiurges-DH-016`。
- 使用EXharness `update-item`更新title/acceptance/handoff，随后正常 `assign` 与 `accept`；未手改checklist JSON。
- 当前只进入设计与验收计划，不实现产品代码。
- `accept`未自动创建plan文件，已记录错误并按登记locator创建唯一canonical plan；下一步执行sync/validate/doctor，再审计当前source与DH-013 cache seam。

## 2026-08-14 — Design freeze candidate

- 完成旧provider cache、Artifact validator、Repository、Runtime Host、Product Session、Gateway API、registry与canonical JSON的只读source audit。
- canonical plan已冻结Data Root解析、content-addressed publish/read、World Project v1 schema、candidate Repository restore、crash-safe save/open、linear undo/redo、deterministic bundle与Studio/Gateway入口。
- 明确v1不持久化Episode/Evaluation/lastRun/Presentation/credential/provider transient；不增加Agent tool，不建立通用storage/provider SDK。
- 下一步：sync/validate/doctor并冻结review manifest，发起两个相互隔离的independent plan reviewers；批准前不实现。
- EXharness升级后的入口是`.artifacts/harness/harnessctl`，不是旧的`harnessctl.py`；已记录一次失败并改用实际正常入口。

## 2026-08-14 — Plan review Round 1

- 第一顺位fresh sub-agent：`changes_requested`，P1为rename后/receipt前crash无法由旧expectedRevision重放收敛。
- 第二顺位ZCode direct CLI：`changes_requested`，P1为recent-project list没有持久来源；actual model=`UNVERIFIED`，session=`sess_a66d8b0c-ca93-4f17-a7d5-51f3e6019522`，不是managed receipt。
- 另采纳三项闭合：registered representation artifact推导、lock owner/intent evidence、未绑定project history稳定结果。
- implementation gate保持关闭；下一步从Data Root单写者ownership、stable operation intent/replay和bounded project enumeration修订根层状态机，再发起fresh Round 2。

## 2026-08-14 — Round 1 remediation

- canonical plan已增加writer-owner/reader mode、stable Idempotency-Key、durable intent、replay-before-CAS与startup recovery状态机。
- recent route改为bounded validated `GET /api/projects`，没有新增recent index；mtime只用于非authority排序。
- 明确registered-only artifact derivation、`PROJECT_NOT_BOUND`与current EXharness executable入口。
- Round 1 findings已沉淀为独立verdict文件；下一步冻结Round 2输入并重新进行相互隔离的fresh cross-review。

## 2026-08-14 — Plan review Round 2

- fresh sub-agent与fresh ZCode session独立命中同一P1：directory/socket stale-owner protocol无法证明旧writer死亡，可产生dual writer。
- ZCode actual model仍为`UNVERIFIED`，session=`sess_63aa12aa-eb53-4eb7-b188-096baba89efc`；不是managed receipt。
- 决定删除filesystem owner/socket takeover，把唯一writer admission改为kernel-held process-lifetime lease；所有disk mutation与recovery必须持有同一lease。
- 同轮补齐统一operation binding conflict code与bundle import显式复用project publish状态机；implementation gate继续关闭。

## 2026-08-14 — Plan review Round 3

- sub-agent指出realpath string identity与missing-root bootstrap存在根层循环；ZCode指出aborted receipt同key replay缺口。
- 决定把root初始化改为显式、独立、原子且仅创建空root的bootstrap；Gateway missing root零mutation。
- lease identity改用no-follow opened directory的OS `(dev, ino)`版本化编码，并冻结big-endian digest→port公式与真实Bun SIGKILL/rebind gate。
- aborted receipt replay将返回同一aborted结果且零mutation；implementation gate继续关闭，修订后进入fresh Round 4。

## 2026-08-14 — Round 3 remediation and runtime probe

- plan已冻结explicit root bootstrap、missing-root zero mutation、fd-based dev/ino identity、big-endian port公式、SO_REUSEADDR/no-SO_REUSEPORT gate与aborted replay。
- repo外临时root上的真实Bun process probe通过：live holder排他、handshake后SIGKILL exit 137、3秒deadline内首轮rebind成功；临时目录已删除，无listener残留。
- 下一步：sync/validate、冻结Round 4 request，fresh cross-review必须同时核验设计与该原语的可实现性；P0/P1=0前仍不实现。

## 2026-08-14 — Plan review Round 4

- ZCode批准，P0/P1=0；fresh sub-agent发现write-lock intent非原子发布P1，因此整体gate仍关闭。
- 修订方向：staging内完整构造/fsync非空lock candidate，再atomic rename为`.write-lock`；该publish是durable admission point。
- admission前kill允许same-key重新开始；admission后且Project未publish才生成terminal aborted receipt；malformed已发布lock仍recovery-required。
- 修订后发起fresh Round 5，不借用ZCode Round4 approval覆盖新digest。
- Atomic admission最终冻结为staged canonical intent file + same-filesystem `link()` no-replace，而非缺少portable no-replace语义的directory rename。

## 2026-08-14 — Plan review Round 5

- ZCode direct CLI批准，P0/P1=0，session=`sess_b578d1d4-b02c-4187-9ed4-d32d71894110`；actual model identity仍为`UNVERIFIED`，不是managed receipt。
- fresh sub-agent发现全局幂等P1：project-local `.write-lock` 不能阻止同一operationId并发绑定两个Project或跨Save/Artifact/bundle复用。
- 修订为两级但单一事实链：`receipts/<operation-id>.intent.json`负责Data Root全局operation binding，`projects/<id>/.write-lock`只负责Project CAS；两者用完整staged canonical intent的atomic no-replace hard-link发布。
- terminal result独立发布为`<operation-id>.result.json`，global intent永久保留；startup recovery按global intent/result、business candidate与project lock共同收束。
- implementation gate继续关闭；fresh Round 6必须证明跨Project/跨kind同key并发败者在任何业务mutation前fail closed。

## 2026-08-14 — Plan review Round 6

- ZCode direct CLI批准，session=`sess_9682f1c9-602f-4a09-9b88-dc9b2760bc07`；actual model identity=`UNVERIFIED`，不是managed receipt。
- fresh sub-agent发现same-key + same-binding双执行P1：global durable intent只绑定namespace，没有唯一live executor。
- plan已增加mandatory `OperationSingleFlight`；leader唯一执行，follower只等待/replay或bounded transient return，不写filesystem，不取消leader。
- Artifact CAS改为完整staged inode的hard-link no-replace publish；global admission后所有可分类失败都必须先发布same-binding terminal result，避免live/restart语义漂移。
- implementation gate继续关闭；fresh Round 7必须专门验证same-binding双请求、follower abort、poisoned leader与Artifact no-replace。

## 2026-08-14 — Plan review Round 7

- ZCode与sub-agent分别找到两个互补P1：legacy external representation可恢复成无Store bytes半世界；standalone Artifact缺post-admission terminal/recovery matrix。
- Project v1现明确只持久procedural/primitive或registered+Store exact external representation；legacy external reference在Save/Save As/Open/bundle import以`PROJECT_ARTIFACT_UNBACKED` fail closed。
- `OperationTerminalFinalizer`提升为Save、Artifact、DH-013 import与bundle的共用边界；Artifact exact/absent/conflict/identity-drift分别收敛为success、interrupted、destination conflict或recovery required。
- 同步闭合Save As exact empty-dir cleanup和`import:dh013`基于frozen registry digest的deterministic operationId。
- implementation gate继续关闭；进入fresh Round 8。

## 2026-08-14 — Plan review Round 8

- ZCode direct CLI批准，session=`sess_382a5c9d-4ac7-4f0d-95b4-92cc0a8fba20`；actual model identity=`UNVERIFIED`，不是managed receipt。
- fresh sub-agent发现bundle的zero-mutation completeness与staging内全量验证顺序矛盾；legacy bundle会在拒绝前已写Data Root。
- bundle import已拆成bounded-memory Phase A与admitted Phase B：Phase A在零Data Root write syscall前验证ZIP/Project/registry/lineage/external completeness/所有Artifact；Phase B才取single-flight、global admit、写staging并fd二次校验。
- 固定v1 bundle budgets为64 MiB total/body、32 MiB per entry、16 entries、64 KiB central directory、1 MiB JSON；bundle逐Artifact明文复用standalone recovery matrix。
- Save As project directory创建也明确为global admission后atomic non-recursive mkdir + parent fsync。implementation gate仍关闭，进入fresh Round 9。

## 2026-08-14 — Plan review Round 9

- ZCode direct CLI批准，session=`sess_df70cfa7-c220-4289-ba61-2a2d95531b78`；actual model identity=`UNVERIFIED`，不是managed receipt。
- fresh sub-agent发现bundle conflict在result发布前kill时无法仅从projectRevision重建Artifact分类，startup会错改为interrupted。
- bundle global intent的candidate identity已增加排序exact Artifact descriptors与`artifactSetDigest`；new lease holder可不依赖staging/attempt token重验每个destination。
- startup recovery现在bundle先跑Artifact matrix：stable conflict→`ARTIFACT_DESTINATION_CONFLICT`，identity drift/unreadable/set drift→`OPERATION_RECOVERY_REQUIRED`，全exact/absent才进入Project分支。
- 同时固定`BUNDLE_IMPORT_PHASE_A_MAX_OWNED_BYTES=224 MiB`与request-scoped zero-write syscall计数窗口。implementation gate仍关闭，进入fresh Round 10。

## 2026-08-14 — Plan review Round 10 approved

- fresh sub-agent与ZCode direct CLI均批准，P0/P1=0；ZCode session=`sess_67283f94-0cef-44c4-a403-06600ac0a0ff`，actual model identity=`UNVERIFIED`，不是managed receipt。
- Operator shell复算通过：branch=`agent/codex/DH-016`，HEAD=`0efcef3a531c192410cdabcd62cf736e54404313`，plan=`3bf7b3a4b26f7a290b24c936c095ce00db2a2e46b4c370e3c6c7a2a67095524c`，ordered aggregate=`fc88249f475a71af775e05dee9213e50befbf99275bf8272c0a1bd145e11a118`；`git diff --check`通过。
- Plan gate开放，可进入package-first implementation。实施时固定吸收review P2：intent/candidate staging时序；bundle最多14个Artifact；candidate set恶意矩阵；reader-mode纯读export；DH-013旧cache/receipt surface整体替换而非并存。

## 2026-08-15 — Package-first implementation candidate

- 新增 `@demiurges/world-project`，闭合显式 `DEMIURGES_DATA_ROOT` bootstrap/open、package-owned live root/lease、固定0700 layout、共享 `OperationSingleFlight`、durable global operation journal与startup recovery。
- DH-013三项registered provider Artifact已通过显式迁移进入`artifacts/sha256/<digest>`；Store使用staging、opened-file完整校验、file/directory fsync与hard-link no-replace CAS，Gateway不再读取worktree-local provider cache。
- `WorldProjectManifestV1`只保存Snapshot lineage、current Ref、registry/calibration identity与ArtifactRef；不保存Episode/Evaluation/lastRun、credential、provider transient或Presentation state。Repository新增受控export/restore与linear undo/redo seam，不新增Agent tool。
- World Project Save/Save As/Open/list、deterministic `.dworld` bundle Phase A/Phase B、Gateway routes、Studio Project面板和strict client transition codec已形成首个产品闭环。
- 真实DH-013资产integration通过：Marble × Hunyuan base→`snapshot:edit-1`→save→关闭runtime→重开保持history/ref/artifacts exact；GLB移走时Open fail closed且既有内存authority不变；恢复后可打开；空Data Root bundle import与export byte-identical。
- 第一轮全量gate发现并修复两个真实产品裂缝：Gateway list泄露Store内部`modifiedTimeMs`导致strict Client把writer错判unavailable；undo/redo在reserve释放前生成`running=true` projection导致Client fail closed。两项均新增回归。
- 真实Chromium（专用5186/8796与临时Data Root）通过Save As、真实进程停止/重启、recent list/Open、registered 3DGS与GLB恢复、undo/redo、真实`.dworld`文件选择导入；最终`data-raf-count`空闲1秒delta=0、page error=0。专用进程已停止，临时root已移入Trash，可恢复；既有5173/8787未触碰。
- 当前pre-review gates：focused tests、`bun run typecheck`、`bun run build`、`git diff --check`、EXharness validate/doctor通过。修正后的最终`bun test`与implementation cross-review尚待执行；未commit、push、merge或closeout。

## 2026-08-15 — Implementation review Round 1 remediation

- 两位fresh independent sub-agent reviewer均为`changes_requested`：合计确认4个P1，分别是Save As abort残留operation-owned空目录、public raw Artifact CAS可绕过durable admission、Gateway body reader不响应abort/deadline、ambiguous startup recovery错误删除lock evidence。
- Project与bundle publish现记录本operation创建目录的opened identity；仅在durable terminal形成、exact intent hard-link已清理、目录仍为同一0700空目录时才`rmdir`并fsync parent。未知entry/identity drift保留现场并统一`OPERATION_RECOVERY_REQUIRED`。
- raw Artifact CAS已从package root移除，并要求`OperationJournal`通过进程内`WeakMap`铸造的live admitted-operation identity；伪造结构体在layout/staging/CAS mutation前拒绝，且admission candidate必须覆盖目标registered Artifact。
- Gateway JSON与bundle body共用bounded reader：每个read同时竞争AbortSignal与5秒总deadline，异常时cancel/release，Open/Save/import稳定返回`REQUEST_ABORTED`或`REQUEST_BODY_TIMEOUT`；无限流回归证明Session与Data Root零变化。
- startup recovery只在durable terminal成功发布后清理exact lock/staging；malformed Project导致分类不唯一时，intent/result/lock/staging与corrupt target均保持可诊断。
- remediation gates：focused 25 pass / 0 fail；全量`583 pass / 0 fail / 4025 expect()`；typecheck、build、`git diff --check`、EXharness validate（0 warnings）与doctor（0 errors，只有optional配置缺失）通过。下一步冻结Round 2 product manifest并进行fresh双重implementation review；未closeout、commit、push或merge。

## 2026-08-15 — Implementation review Round 2 remediation

- 两位fresh reviewer独立复现同一P1：durable Artifact candidate只绑定`assetId + digest`，descriptor其余字段可漂移；其中一位另确认DH-013 import在无durable terminal时无条件cleanup attempt evidence。
- Artifact publish现对admitted candidate与registry-derived `assetId/digest/byteLength/format/elementCount/sourceBounds`做canonical full equality，并闭合operation kind、target kind/id、live root/lease/journal object identity与terminalized capability；任一不匹配在新增candidate/CAS mutation前fail closed。
- `OperationJournal`铸造的capability现在是一次性execution authority：terminal result形成后立即失效，但仍允许owner journal完成exact attempt cleanup。
- DH-013 import与Project/bundle一致：只有read-back证明durable success/aborted result存在时才清理candidate/attempt；result publish或identity状态不唯一时保留intent、staging与candidate evidence。
- 新增完整descriptor逐字段漂移、wrong target、foreign journal/root/lease、Project operation、terminalized capability和foreign result/finalize故障回归。focused 41 pass / 0 fail，typecheck与diff-check通过；下一步重新跑full/build/harness gates，冻结Round 3并双审。未closeout、commit、push或merge。

## 2026-08-15 — Implementation review Round 3 remediation

- 两位fresh reviewer共确认5项P1：candidate cleanup按路径误删foreign evidence、可读result冒充已完成directory fsync、startup未重验Artifact完整descriptor/target、Save As重启后缺目录ownership evidence，以及Gateway/Studio route偏离canonical plan。
- `OperationJournal`现在只有在result hard-link与receipts directory fsync均完成后才将live operation标记为durably finalized；Project、DH-013与bundle cleanup不再从“result可读”推断durability，`cleanupAttempt()`也要求同一不可伪造finalization authority。
- Artifact candidate cleanup记录并重验原filesystem object的`dev/ino`，unlink前仍重新验证完整bytes/format；identity drift保留现场并`OPERATION_RECOVERY_REQUIRED`。
- startup recovery把每个Artifact candidate与frozen registry的完整`assetId/digest/byteLength/format/elementCount/sourceBounds`及operation target重新绑定；DH-013集合必须exact等于完整registry。
- 新建Project目录会发布canonical `.created-directory.json` marker，绑定operation digest与directory `dev/ino/mode/uid/gid`。live/startup只有在marker、lock、目录entry集合全部exact时才清理；未知entry连同marker保留。
- Gateway/Studio已收敛为canonical routes：`/project/save-as`、`/project/save`、`/project/undo|redo`、`/api/projects/:projectId/open`；旧Open/history aliases返回404。
- remediation focused gate：68 pass / 0 fail / 321 expect；typecheck与diff-check通过。下一步执行full/build/harness与真实产品acceptance，冻结Round 4并发起全新双路独立交叉审查；未closeout、commit、push或merge。
- Round 4前全量gate：`591 pass / 0 fail / 4072 expect()`；typecheck、build、diff-check、EXharness validate（0 warnings）与doctor（0 errors，只有optional配置缺失）通过。
- fresh真实Chromium使用专用`5186/8796`、临时Data Root和既有DH-013真实bytes，验证Save As→停止/重启Gateway→recent list/Open、三项registered assets全部loaded、alignment PASS，以及canonical Save/undo/redo实际HTTP routes；无alert/page error，loaded 3DGS场景空闲1.2秒`data-raf-count`增量为0。
- 浏览器acceptance中确认`agent-browser --allowed-domains`的Worker containment会阻断Spark blob worker；该受控浏览器限制产生明确`importScripts(blob:)`错误。fresh无该测试侧限制的隔离Chromium通过，故不将其计为产品failure。专用进程已停止，临时Data Root已移入Trash，可恢复；未调用provider、未触碰既有5173/8787。
- Round 4 reviewer启动后，Operator自审发现visible result retry仍可在不重新完成receipts directory fsync时取得cleanup authority；立即中止两路moving-target审查，未将其计为有效approval。`OperationJournal.#finalize`现在在existing-result与EEXIST-winner两条路径都必须重新fsync receipts directory后才标记durably finalized，并新增“可读不等于durable、显式retry完成fsync后才可cleanup”回归。
- 修复后focused为68 pass / 0 fail / 325 expect，全量为591 pass / 0 fail / 4074 expect；typecheck与diff-check通过。Round 4 request保留为被Operator主动invalidated的历史输入；重新冻结Round 5，fresh reviewers不得借用Round 4过程证据。

## 2026-08-15 — Round 5 invalidation 与 OperationBinding 根边界闭合

- Round 5两路reviewer启动后，Operator继续自审发现global durable intent仍只做各candidate结构校验，没有把`operationKind / target / expectedIdentity / candidateIdentity`闭合为唯一语义组合；moving target因此立即中止，Round 5不产生有效approval。
- `requireOperationBinding`现统一要求：Save绑定project与non-null revision、Save As绑定project与null、Artifact publish target exact等于candidate asset、DH-013 import exact绑定frozen registry且null、bundle import绑定project且null。错误组合在intent、attempt、layout或CAS mutation前稳定`OPERATION_RECOVERY_REQUIRED`。
- Artifact descriptor漂移仍由admitted publish边界在candidate/CAS mutation前拒绝；wrong target则更早在journal admission零副作用拒绝。新增五类合法binding与Save/Save As/Artifact/registry/bundle错误组合回归，并断言wrong Artifact target不改变receipts、staging或CAS。
- Round 6 producer gates：focused `69 pass / 0 fail / 338 expect()`；full `592 pass / 0 fail / 4087 expect()`；typecheck、build、`git diff --check`、EXharness validate（0 warnings）与doctor（0 errors，只有optional配置缺失）全部通过。
- frozen product set为56 files，aggregate=`e619ab7d190e2a1b427b1a4450ae94916d95c4a07635751e15f1fc64d86fe5a1`。下一步仅进行两路fresh independent Round 6 implementation cross-review；两路P0/P1=0前不closeout、commit、push或merge。

## 2026-08-15 — Implementation review Round 6 remediation

- 两路fresh independent sub-agent reviewer独立复现同一P1：startup仅凭terminal result path可读，就删除Project lock、marker与operation-owned目录；crash发生在result hard-link后、`fsync(receipts/)`前时会过早销毁恢复evidence。
- `OperationJournal.confirmExistingTerminal()`现重新校验published intent与exact terminal，在当前live lease下重新成功fsync receipts directory后才铸造durably-finalized operation capability。失败统一`OPERATION_RECOVERY_REQUIRED`，不清理任何evidence。
- `cleanupProjectEvidence`不再接受裸binding/result，必须消费同root/lease/journal的durably-finalized capability；新terminal与existing terminal走同一cleanup authority边界。
- 新增exact crash-point/fault test：result file与attempt directory已fsync且hard-link可读，但injected receipts fsync failure时result、lock、marker、Project、attempt全部保留；撤销故障后同一startup重试才分类`alreadyTerminal`并清理。
- remediation gates：focused `70 pass / 0 fail / 345 expect()`；full `593 pass / 0 fail / 4094 expect()`；typecheck、build、diff-check、EXharness validate（0 warnings）与doctor（0 errors，只有optional配置缺失）通过。下一步冻结Round 7并重新进行两路fresh review；未closeout、commit、push或merge。

## 2026-08-15 — Implementation review Round 7 remediation

- 第一位fresh reviewer复现P1：历史terminal receipt按operationId先处理时，会把同一Project较新pending operation的exact `.write-lock`误判为foreign，从而在owner intent收束前抛recovery-required。第二路reviewer被provider侧内容分类器中止，没有形成有效verdict，不能计为approval。
- startup现先完整验证全部durable OperationBinding，再进入mutation/recovery pass。Project lock若exact属于同一Project的另一durable binding，当前历史operation必须保留并跳过整组lock/marker/directory evidence，交由真实owner处理；无法归属的foreign lock仍fail closed。
- 新增两组顺序回归：历史successful Save As + 后续pending Save，以及历史aborted Save As + 后续带marker/operation-owned目录的pending Save As；两者均由owner收束并清理，历史receipt不再抢占evidence。
- remediation gates：focused `72 pass / 0 fail / 351 expect()`；full `595 pass / 0 fail / 4100 expect()`；typecheck、build、diff-check、EXharness validate（0 warnings）与doctor（0 errors，仅optional配置缺失）通过。下一步冻结Round 8并重新进行两路fresh review；未closeout、commit、push或merge。

## 2026-08-15 — Implementation review Round 8 remediation

- 两路fresh reviewer合计确认12项P1，集中在四条根边界：Data Root路径与目录durability、startup全量preflight与evidence ownership、Project history stale CAS、Studio持久化状态表达。
- Project Open/List现对中间project directory执行stable no-follow identity验证；`artifacts/sha256`创建与Artifact/Project exact-success/recovery均补齐直接parent directory fsync；Gateway public error使用固定allowlist，不再回显raw syscall code。
- startup在任何cleanup/terminalization前验证所有durable binding、registered Artifact descriptor、Project lock与marker owner；同Project历史operation不得抢占新owner，cross-Project/unknown evidence保留并fail closed；existing terminal由当前lease重新fsync receipts并找回hard-link证明的原attempt，成功后才清candidate/attempt。
- Undo/Redo改为strict bounded JSON DTO，携带expected Project revision与current Ref并在服务端mutation前CAS；stale replay稳定409且零mutation。Studio新增dirty状态，Project metadata或world Ref变化后明确显示“未保存更改”，保存前禁止导出旧revision。
- Operator最终自审补闭合一个同源原子性缝隙：existing terminal bundle attempt中的Artifact candidates会在任何Project lock/marker cleanup前整体只读验证；corrupt candidate反例证明Project evidence与attempt完整保留。
- fresh真实Chromium使用专用`5186/8796`与临时Data Root：创建registered Marble × Hunyuan、Save As、修改名称显示dirty并禁用export、Save后恢复export、停止并重启Gateway后recent/Open恢复同一Project与Hunyuan visual，proxy witness PASS；page error为0，空闲1秒`data-raf-count`保持`68→68`。专用进程已停止，临时Data Root已移入Trash；未调用provider、未触碰既有5173/8787。
- remediation producer gates：focused startup/artifact `24 pass / 0 fail / 129 expect()`；此前全量`600 pass / 0 fail / 4128 expect()`、typecheck、build、diff-check、EXharness validate（0 warnings）与doctor（0 errors，仅optional配置缺失）通过。最终补丁后将重新跑完整gate并冻结Round 9；未closeout、commit、push或merge。

## 2026-08-15 — Implementation review Round 9 remediation

- 第二路fresh reviewer确认1项P1：proven attempt内的`project.json`等generic entry仅按名称放行，malformed staged Project可在Project evidence cleanup后被吞掉；第一路reviewer在moving target前被Operator中止，不形成有效verdict。
- `confirmExistingTerminal`现要求attempt内存在的`operation-intent.json`与`operation-result.json`分别是durable receipt的exact hard-link；仅“另一个receipt文件证明attempt”不再替未验证entry背书。
- recovery新增operation-kind-aware staged Project preflight：`project.json`必须是canonical World Project manifest且projectId/revision exact绑定operation target/candidate；`project-directory.json`必须canonical绑定OperationBinding，并在Project directory存在时exact绑定其stable identity；废弃的裸`artifact`名与任何unknown entry直接fail closed。
- 所有confirmed attempts先整体完成Project/generic与registered Artifact candidate只读验证，随后才允许Project lock/marker/directory或attempt cleanup。新增malformed staged Project与corrupt Artifact candidate并存回归，均证明全部evidence保留。
- remediation focused gate：operation-journal/startup/artifact `32 pass / 0 fail / 174 expect()`；typecheck通过。下一步重新执行全量producer gates并冻结Round 10双审；未closeout、commit、push或merge。

## 2026-08-15 — Implementation review Round 10 remediation

- 第一位fresh reviewer确认1项P1：attempt验证仍在per-binding loop内，较晚terminal Artifact的corrupt candidate可在较早terminal Project已完成cleanup后才被发现。第二路reviewer发生manifest外读取污染并被中止，不能计为产品verdict或approval。
- startup现采用真正global two-phase：先闭合全部OperationBinding，再只读枚举并证明所有既有attempt，完整验证Project/generic/registered Artifact candidates与staging coverage；全体通过后才进入receipt fsync、candidate durability repair、terminalization与cleanup循环。
- `OperationJournal.inspectExistingAttempts()`不产生disk mutation；每个attempt必须由staged intent/result与durable receipt exact hard-link证明，且receipt entry各自exact。staging目录的每个entry必须被某一durable binding唯一覆盖，orphan entry在任何cleanup前fail closed。
- attempt owner按最后一个`-`分隔operationId与alphanumeric token，避免合法operationId前缀关系互相误认。新增较早terminal Project + 较晚corrupt Artifact与orphan staging两组回归，均断言较早Project、lock、attempt及later evidence完整保留。
- remediation focused gate：operation-journal/startup/artifact `34 pass / 0 fail / 185 expect()`；typecheck通过。下一步重新执行全量producer gates并冻结Round 11双审；未closeout、commit、push或merge。

## 2026-08-15 — Implementation review Round 11 remediation

- 第一位fresh reviewer确认1项P1：global attempt preflight尚未预先分类全部pending destination，较晚malformed Project会在较早terminal cleanup并创建new recovery attempt之后才失败；第二路reviewer在moving target前被Operator中止，不能计为approval。
- startup现分为三个明确阶段：Phase A全局只读闭合bindings、existing attempts、staging coverage、evidence owners、所有pending Artifact/Project/bundle destinations与唯一recovery action；Phase B在零cleanup前为全部operations建立durable terminal；Phase C重新把新recovery attempts纳入全局preflight，全体confirm成功后才统一cleanup。
- bundle recovery同时修正一个同源状态：Project revision已exact但任一required Artifact absent时不再铸success，而是`OPERATION_RECOVERY_REQUIRED`并保留evidence；Project未发布时的partial exact Artifact仍可作为safe orphan收束`OPERATION_INTERRUPTED`。
- 新增较早terminal Project + 较晚pending malformed destination回归，断言较早Project/attempt保持、较晚原attempt保持且staging没有新增recovery attempt。focused startup 15/0/62、typecheck通过。
- 下一步重新执行全量producer gates并冻结Round 12双审；未closeout、commit、push或merge。

## 2026-08-15 — Implementation review Round 12 remediation

- 第一位fresh reviewer确认1项P1：Reader验证了Project child与manifest，但没有验证上层`projects` layout directory；整层symlink可让Open/List读取Data Root外manifest。原第二路因provider分类器中断，替代路在moving target前被Operator中止，均不能计为approval。
- WorldProjectReader现对`projects` layout与`projects/<id>`两层分别使用`O_DIRECTORY|O_NOFOLLOW` stable identity，并在read/list前后比较；layout symlink/wrong type统一`PROJECT_RECOVERY_REQUIRED`，不进入recent list。
- 同源闭合Artifact reader：对`artifacts`与`artifacts/sha256`两层做前后stable identity验证；reader-mode即使外部symlink内存在digest/format完全合法bytes，也只能得到`OPERATION_RECOVERY_REQUIRED`，startup destination inspection同样fail closed。
- 新增整个`projects` layout symlink与`artifacts` layout symlink两组真实反例；focused project/artifact/startup 36/0/184、typecheck通过。下一步重新执行全量producer gates并冻结Round 13双审；未closeout、commit、push或merge。

## 2026-08-15 — Implementation review Round 13 remediation

- fresh reviewer确认parent-directory durability P1：Project/attempt目录项已经创建或删除、但parent `fsync`失败时，旧实现会留下不可恢复空目录，或在下轮把path absence误当作durability proof；同轮指出bundle missing Artifact、operationId prefix与parent-fsync fault probes缺失。
- Save As与bundle import现在先在新Project目录内发布并fsync exact ownership marker，再fsync `projects/` parent。若parent fsync失败，restart仍能通过binding digest + directory inode marker唯一分类并回收，不会永久占用Project ID。
- startup在完整Phase A只读preflight之后、任何terminalization/cleanup之前，统一重新fsync `projects/`与`staging/`。此前`rmdir`成功但parent fsync失败的重启路径，必须先补齐directory-entry durability，随后才可确认terminal并删除剩余evidence。
- marker cleanup在目标Project目录已消失时重新fsync `projects/`；目录仍存在但marker缺失时fail closed，不猜测删除unknown directory。
- 新增三类真实fault tests：Project create后`projects/` fsync失败并重启同ID重试；Project rmdir后`projects/` fsync失败并重启；attempt rmdir后`staging/` fsync失败并重启。另增加`op:a`/`op:a-b` complete coverage与canonical Project引用Artifact但bundle缺entry的exact probe。
- remediation focused 32/0/128；full 612/0/4180；typecheck与diff-check通过。下一步完成build/harness gates、冻结Round 14并进行两路fresh independent implementation cross-review；未closeout、commit、push或merge。

## 2026-08-15 — Implementation review Round 14 remediation

- 两路fresh reviewer各确认1项P1：final Project目录在`mkdir`与marker之间存在不可恢复的无ownership窗口；`.dworld` decoder漏验local/central fixed DOS timestamp，接受非确定性ZIP metadata。
- 新Project目录不再直接在final namespace内逐步构造。Save As与bundle import现在先在operation attempt中建立0700 `project-directory.candidate`，写入并fsync exact binding + inode marker，再以single-writer边界内的atomic rename发布；rename后同时fsync source attempt与destination `projects/` parent。
- startup Phase A把staged directory candidate纳入complete coverage：candidate目录、staged/published marker hard-link、binding digest、directory inode与entry set必须exact。Phase B在全量preflight后补fsync每个attempt parent；Phase C只在terminal authority形成后回收未发布candidate与attempt。
- 新增Save As与bundle import两条publish前中断→关闭root/lease→restart recovery→同ID新operation成功的真实回归。最终namespace从未出现无marker目录；candidate corrupt/unknown则保留并fail closed。
- ZIP decoder现在对local与central header都要求time=`0`、date=`0x21`，新增local-only、central-only与同步timestamp漂移三组拒绝测试。
- remediation focused 48/0/237；full 614/0/4196；typecheck与diff-check通过。下一步完成build/harness、冻结Round 15并进行两路fresh独立审查；未closeout、commit、push或merge。

## 2026-08-15 — Implementation review Round 15 remediation

- 两路fresh reviewer独立命中同一P1：candidate rename到final后，Phase A只比较marker bytes/directory identity，未继续证明final marker与staged marker为同一hard-link inode；missing或byte-identical replacement会在terminalize后才失败，甚至被破坏性清理。
- 新增共享`requirePublishedProjectDirectoryMarkerHardLink`：staged/final marker必须都是regular file，且`dev/ino` exact；candidate admission、final Phase A preflight与cleanup前复核共用同一validator。
- pending operation若final marker缺失、staged/final marker非同inode，必须在Phase A、任何result publish/cleanup前`OPERATION_RECOVERY_REQUIRED`。只有startup前已经存在terminal result时，才允许“marker已由既有cleanup删除”的retry，并仍以staged marker bytes绑定当前/已删除directory identity。
- 同Project历史terminal不能抢占较新owner的marker；cleanup会从confirmed attempts中唯一选择拥有exact staged/final marker的attempt，再执行marker/directory cleanup。若final marker存在却没有唯一hard-link owner，零mutation fail closed。
- Phase A额外闭合owner Project entry set；marker-owned final directory只允许marker、exact lock与`project.json`，foreign entry在terminalize前拒绝。
- 新增pending Save As missing marker、pending bundle byte-identical new-inode marker、final unknown entry三组零partial-cleanup回归。focused 37/0/159；typecheck与diff-check通过。下一步跑全量gate并冻结Round 16双审；未closeout、commit、push或merge。

## 2026-08-15 — Implementation review Round 16 remediation

- 两路fresh reviewer分别命中同一Phase A完整性边界的两端：pending Save As/bundle只有durable intent、尚无candidate/marker时会被错误terminalize；final directory/marker已发布但原staged marker丢失时，则会先发布result、到cleanup才失败。
- startup现要求每个尚无terminal result的`project.save-as`/`bundle.import`，在进入destination分类、durability repair或terminalization前，必须恰好存在一个携带`project-directory.json`的attempt。既有attempt全量preflight继续证明candidate或staged/final marker的canonical binding、regular-file与hard-link identity。
- “没有publication evidence”与“staged evidence丢失”均零mutation返回`OPERATION_RECOVERY_REQUIRED`，保留intent、attempt、Project与final marker；只有具备完整staged marker的未发布candidate才可安全收敛为`OPERATION_INTERRUPTED`。startup前已存在same-binding terminal result的cleanup retry仍保持既有例外。
- 新增Save As/bundle admit后marker创建前crash，以及final已发布但staged marker丢失三组回归；focused mandatory gate`102 pass / 0 fail / 484 expect()`，full`620 pass / 0 fail / 4221 expect()`；typecheck、build、diff-check、EXharness validate（0 warnings）与doctor（0 errors，仅optional misses）全部通过。
- frozen Round 17 product set为58 files，aggregate=`6b9ac3c7f2ac034504585432d27c0d78fd1810be5b695308a50ed77ef7fca2b9`。下一步仅进行两路fresh independent implementation review；未closeout、commit、push或merge。

## 2026-08-15 — Implementation review Round 17 remediation

- 第二路fresh reviewer确认P1：pending Project creation虽有完整staged candidate/marker，但final path若被无marker/lock的foreign目录占用，owner会被记为`undefined`并跳过entry-set检查；Phase B先发布result，cleanup才失败。第一路reviewer被provider内容分类器中止，未形成有效verdict，不能计为approval。
- Phase A现显式闭合pending Project destination ownership三态：final path只能不存在，或由当前binding的marker/lock exact拥有；任何ownerless、foreign或由另一binding拥有的existing directory都在destination classification、durability repair、beginRecovery与result publish前fail closed。
- 新增Save As与bundle import两条ownerless foreign final directory反例，均证明result receipt absent、foreign bytes不变、原attempt完整保留。空目录也由同一ownership invariant拒绝，不依赖entry内容偶然发现。
- producer gates：focused mandatory`104 pass / 0 fail / 492 expect()`；full`622 pass / 0 fail / 4229 expect()`；typecheck、build、diff-check、EXharness validate（0 warnings）与doctor（0 errors，仅optional misses）全部通过。
- frozen Round 18 product set为58 files，aggregate=`50c28ed035072a5f85c915fb41e9cd0ea0934ee931f58ed675a7ba5464355d68`。下一步仅进行两路fresh independent implementation review；未closeout、commit、push或merge。

## 2026-08-15 — Implementation review Round 18 remediation

- 两路fresh reviewer各确认1项P1：startup Phase C会让本轮刚terminalized的pending operation借用startup-existing terminal例外；live bundle import Phase A会把ownerless empty final directory误当成Project absent，先写receipt后才冲突。
- startup现在在Phase A入口冻结`initiallyTerminal`。existing-attempt preflight、pending publication/destination ownership、Phase C全量重验与confirmed cleanup全部显式消费该不可变集合；本轮pending即使Phase B已发布result，仍按strict pending marker provenance处理。
- 新增Phase B receipts fsync seam反例：Phase A后删除final marker，恢复必须`OPERATION_RECOVERY_REQUIRED`，保留Project与原attempt，不再cleanup；已发布result作为crash evidence保留。
- bundle import在decode后直接以no-follow stable directory identity检查final target path。ownerless empty target于零写入Phase A稳定`PROJECT_ID_CONFLICT`，不创建`receipts/`或`staging/`；高层Reader只负责验证已确认存在的Project内容。
- producer gates：focused mandatory`106 pass / 0 fail / 500 expect()`；full`624 pass / 0 fail / 4237 expect()`；typecheck、build、diff-check、EXharness validate（0 warnings）与doctor（0 errors，仅optional misses）通过。
- frozen Round 19 product set为58 files，aggregate=`916f20adf57d52b24483eeb76f2c8da51413cb1070e79c4714c97b4e3ce8ffb8`。下一步仅进行两路fresh independent implementation review；未closeout、commit、push或merge。

## 2026-08-15 — Implementation review Round 19 remediation

- 两路fresh reviewer各确认1项P1：bundle Phase A接受`exact project.json + foreign entry`并发布新replay receipts；startup Phase C把Phase A存在、Phase B后丢失的exact lock误当作既有cleanup。
- bundle import对existing target现在闭合整个final directory：Phase A前后stable no-follow identity必须一致，entry set必须恰好只有`project.json`，其间Reader再验证canonical manifest/revision。ownerless、foreign entry、lock/marker residue与目录漂移均在single-flight/admit前拒绝。
- startup evidence inspection现同时冻结effective owner与exact lock owner。cleanup只有在Phase A本就没有lock时允许`ENOENT`；若startup观察到当前binding的intent hard-link，则Phase C必须重新证明同一inode，缺失/漂移保留Project、marker、attempt与result evidence。
- 新增exact Project + foreign entry的bundle零新receipt回归，以及Phase B receipts fsync seam删除exact lock的恢复回归。focused mandatory`108 pass / 0 fail / 510 expect()`；full`626 pass / 0 fail / 4247 expect()`；typecheck、build、diff-check、validate（0 warnings）与doctor（0 errors，仅optional misses）通过。
- frozen Round 20 product set为58 files，aggregate=`480036b44f0e5b2e5e064d535579bf74a86333ff8a2618861b472981fb6b7bd8`。下一步仅进行两路fresh independent implementation review；未closeout、commit、push或merge。

## 2026-08-15 — Implementation review Round 20 remediation

- 两路fresh reviewer独立确认同一P1：Phase C缺少全局Project evidence re-preflight，导致较晚Project的foreign entry可在较早Project已cleanup后才暴露，单Project内也会先删lock再发现unknown entry。
- `ProjectEvidenceInspection`现冻结effective owner、lock owner与marker owner三组事实。Phase B完成、全部terminal confirmations形成后，Phase C在任何unlink/rmdir前重新全局采样；三组owner必须逐Project与startup exact相等，随后所有owned Project再次通过完整entry-set检查。
- per-operation cleanup在删除lock前也重跑owned entry-set只读验证，作为全局gate后的近端保护；unknown entry统一在该package边界转为`OPERATION_RECOVERY_REQUIRED`，不再由marker cleanup晚报普通Error。
- 新增双pending Save As反例：第二个Project在第二份result fsync时出现foreign entry，恢复必须保留两个Project、两个lock、两个marker与两个original attempts。focused mandatory`109 pass / 0 fail / 521 expect()`；full`627 pass / 0 fail / 4258 expect()`；typecheck、build、diff-check、validate（0 warnings）与doctor（0 errors，仅optional misses）通过。
- frozen Round 21 product set为58 files，aggregate=`a43333f6fb205f601812e5777e3d59ee7e9a44e8f963e5f5dc41696b837ebc63`。下一步仅进行两路fresh independent implementation review；未closeout、commit、push或merge。

## 2026-08-15 — Round 21 clear remediation 与 threat-model decision gate

- 第一位fresh reviewer确认bundle Project 1 MiB pre-allocation budget缺失；第二位确认Phase A target/multi-Project drift持久测试不完整，并把攻击模型扩展到“cleanup已开始后任意外部进程直接篡改Data Root，仍要求此前全部删除原路径回滚”。Round 21不能closeout。
- bundle parser现对`bundle.json`与`project/project.json`分别执行1 MiB central-header gate，均位于entry copy/CRC/JSON parse之前；新增两条`BUNDLE_BUDGET_EXCEEDED`回归。
- live bundle Phase A新增malformed、symlink、wrong-type target持久矩阵，均证明零receipt、零staging、零Artifact publish；既有ownerless与exact+foreign矩阵继续通过。
- pending operation在near-cleanup时若final Project仍存在而marker丢失，不再借用terminal retry例外；稳定`OPERATION_RECOVERY_REQUIRED`。未发布staged candidate仍可安全收敛interrupted。
- remediation gates：focused mandatory`110 pass / 0 fail / 535 expect()`；full`628 pass / 0 fail / 4272 expect()`；typecheck、build、diff-check、validate（0 warnings）与doctor（0 errors，仅optional misses）通过。当前product set 58 files，aggregate=`98f3e2d58cbd30ec9d63758dfe33cfd1490b8d648d427fb0a09b830073643bbb`。
- 新增`open-decision-cleanup-threat-model.md`。因“任意外部进程中途篡改仍全局回滚”需要事务型文件系统/回滚协议，属于重大方向边界；Round 22与closeout暂停，等待Human选择cooperative single-writer、transaction-grade cleanup或不自动cleanup。未commit、push、merge。

## 2026-08-15 — Human选择Option A：cooperative single-writer

- Human明确选择Option A。`DEMIURGES_DATA_ROOT`的v1 correctness boundary冻结为同一live lease下的cooperative single writer；直接绕过package-owned入口修改Data Root属于environment corruption，不是受支持的并发writer。
- startup recovery仍必须在cleanup前全局闭合evidence，并在每次destructive operation前重验当前target；观察到out-of-band drift后停止剩余cleanup、返回`OPERATION_RECOVERY_REQUIRED`并保留尚未清理的Project/lock/marker/attempt与durable receipts。
- 在越权drift被观察前已经完成并fsync的cleanup不回滚。DH-016不增加transaction rollback、filesystem snapshot或专用daemon；这些属于未来独立切片。
- 下一步补充对应的确定性回归：守约双Project recovery全部收敛；第一个Project完成cleanup后篡改第二个Project时，第一项保持已完成，第二项与后续evidence全部保留并fail closed。随后冻结Round 22并进行两路fresh independent review。

## 2026-08-15 — Option A实现与Round 22 producer gates

- canonical plan与decision artifact已把cooperative single-writer、environment corruption、停止剩余cleanup和不回滚已完成fsync cleanup写成唯一边界。
- `STARTUP_RECOVERY_TEST_SEAMS`增加仅供同模块测试使用的post-confirmed-cleanup hook，不进入package root或产品API；它只让回归能够确定性地把越权drift放在第一项完整cleanup之后。
- 新增两条对称回归：无越权mutation时两个pending Save As全部terminalize并cleanup；第一项完成后第二项出现foreign entry时稳定`OPERATION_RECOVERY_REQUIRED`，第一项保持已清理，第二项Project/lock/marker/original attempt与两项durable intent/result全部保留。
- producer gates：focused mandatory`112 pass / 0 fail / 555 expect()`；full`630 pass / 0 fail / 4292 expect()`；typecheck、build、diff-check、EXharness validate（0 warnings）与doctor（0 errors，仅optional misses）通过。
- 下一步冻结Round 22 product identity并进行两路fresh independent implementation review；未closeout、commit、push或merge。

## 2026-08-15 — Round 22 attempt near-cleanup remediation

- 两路fresh reviewer独立命中同一P1：第一项cleanup完成后，第二项original attempt新增foreign entry或把`operation-intent.json`替换为byte-identical新inode时，旧loop会先删除第二项Project evidence，之后才发现attempt drift，或按文件名盲删整个attempt。
- 修复保持Option A不变：每项cleanup开始前重新`confirmExistingTerminal`，将当前attempt path/token/binding与Phase C frozen confirmation exact比较，再重验allowed entry set、receipt hard-link/inode、Project marker/candidate与Artifact candidate；任一漂移在`cleanupProjectEvidence`前稳定`OPERATION_RECOVERY_REQUIRED`。
- 新增post-first-cleanup attempt foreign-entry与intent new-inode两组回归；两组都证明第一项保持已完成、第二项Project/lock/marker/original attempt和所有durable receipts保留。startup focused`32 pass / 0 fail / 175 expect()`。
- remediation producer gates：focused mandatory`113 pass / 0 fail / 581 expect()`；full`631 pass / 0 fail / 4318 expect()`；typecheck、build、diff-check、validate（0 warnings）与doctor（0 errors，仅optional misses）通过。
- Round 22为`changes_requested`，不得closeout。下一步冻结Round 23双审；未commit、push、merge。

## 2026-08-15 — Round 23 terminal-at-startup scoped evidence remediation

- Round 23第二路fresh cross-review为`approved / P0=P1=P2=0`；第一路主审确认1项P1，因此combined decision仍为`changes_requested`。
- P1根因是`wasTerminalAtStartup`只冻结operation分类，没有冻结该Project在startup时的具体evidence：第一项cleanup后删除第二项marker，旧实现会把新drift误认成historical cleanup residue并继续删除第二项。
- 修复在每项destructive cleanup前重新采样全部Project evidence，但只比较当前binding target的startup/current effective owner、lock owner与marker owner；前项已完成cleanup不触发回滚，当前项任一owner/presence drift立即`OPERATION_RECOVERY_REQUIRED`。
- 新增两个terminal-at-startup Save As的post-first-cleanup marker-loss回归；第一项保持完成，第二项Project/lock/original attempt与durable receipts保留。startup focused`33 pass / 0 fail / 187 expect()`。
- remediation producer gates：focused mandatory`114 pass / 0 fail / 593 expect()`；full`632 pass / 0 fail / 4330 expect()`；typecheck、build、diff-check、validate（0 warnings）与doctor（0 errors，仅optional misses）通过。
- 下一步冻结Round 24双审；未closeout、commit、push或merge。

## 2026-08-15 — Round 24 Project directory identity remediation

- 两路fresh reviewer独立命中同一P1：`ProjectEvidenceInspection`只冻结owner、lock owner与marker owner，无法区分ownerless Project目录仍存在、目录丢失或目录被换成新inode。
- 修复继续遵循Option A：inspection新增stable no-follow Project directory identity；全局pre-cleanup gate与逐项near-cleanup gate统一比较目录存在性及`dev/ino/mode/uid/gid`。前项已完成cleanup不回滚，当前项目录丢失/替换则在该项destructive cleanup前停止。
- 新增两个正常durable-success、历史cleanup已完成的Save As Project回归；第一项处理后分别删除或以byte-identical `project.json`的新目录替换第二项。两种情况下均保留durable receipts，replacement bytes保留且不会被recovery删除。
- startup focused`34 pass / 0 fail / 205 expect()`；mandatory focused`115 pass / 0 fail / 611 expect()`；full`633 pass / 0 fail / 4348 expect()`；typecheck、build、diff-check、validate（0 warnings）与doctor（0 errors，仅optional misses）全部通过。
- frozen Round 25 product set为58 files，aggregate=`4dca89b4b86de941c23c55d37e744bf71aee2ca51f094381891b4ac17204dc1a`。下一步仅进行两路fresh independent implementation review；未closeout、commit、push或merge。

## 2026-08-15 — Round 25 attempt directory identity remediation

- 第一位fresh reviewer批准；第二路确认1项P1，因此combined decision为`changes_requested`：confirmation只冻结attempt path/token/bindingDigest，未冻结attempt目录本身的inode。
- Phase C现于全体confirmations形成且全量attempt validation通过后，冻结所有attempt directory的stable no-follow identity。每个当前项在Project/attempt destructive cleanup前，除重验attempt set、entry与hard-link外，还必须比较目录`dev/ino/mode/uid/gid`。
- 新增post-first-cleanup attempt directory replacement反例：移除第二项attempt、同路径新建0700目录并重新hard-link durable intent/result/final marker。恢复必须保留第二项Project/lock/marker/replacement attempt与durable receipts，稳定`OPERATION_RECOVERY_REQUIRED`。
- startup focused`34 pass / 0 fail / 219 expect()`；mandatory focused`115 pass / 0 fail / 625 expect()`；full`633 pass / 0 fail / 4362 expect()`；typecheck、build、diff-check、validate（0 warnings）与doctor（0 errors，仅optional misses）全部通过。
- frozen Round 26 product set为58 files，aggregate=`08e45d64fefbc1663f9e67713db931f8b916feec1a353de6d2ddcd3da08df829`。下一步仅进行两路fresh independent implementation review；未closeout、commit、push或merge。

## 2026-08-15 — Round 26 双路批准

- 两路fresh independent implementation review均为`approved / may_closeout=true / P0=P1=P2=0`，起终branch、HEAD、plan、decision、58-file product aggregate与status均无漂移。
- 最终producer与reviewer共同证据：startup focused`34/0/219`、mandatory focused`115/0/625`、full`633/0/4362`；typecheck、build、diff-check、validate（0 warnings）与doctor（0 errors，仅optional misses）通过。
- DH-016满足Human-frozen Option A与canonical plan，可以进入EXharness closeout、mark-done及已授权的commit/push/fast-forward merge main。
