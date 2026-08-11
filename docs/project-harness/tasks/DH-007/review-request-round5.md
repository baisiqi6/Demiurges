# DH-007 Round 5 — Terminal Capability Closure Review

## Role / Authority

Independent final reviewer；cwd `/Users/Admin/projects/WorkTrees/Demiurges-DH-007`；严格只读。允许读取 Round 4 verdict、当前 delta、锁定本地 source，并运行 no-network fake/in-memory probes。禁止写文件、读取 credential、真实 prompt、联网、build、commit、push、merge、deploy 或外部 agent。不得读取另一 Round 5 reviewer 输出。

Base：`a570064a7292821166fd65f074577a22b0390c14`。Frozen product digest：`4b157dbb4c04946ce0a238aa9fbd71df1380ea37c07ac7d4ac5ff34a2023935b`。

## Single blocker to close

1. `OmpWorldAgent.run()` 创建 turn-owned internal capability controller；外部 Request signal 只触发该 controller abort。
2. 四工具 closure 只绑定 internal capability signal，不把外部/SDK signal 当成完整 lifetime authority。
3. internal capability 在 client factory failure、start/tool-surface/prompt/response failure、external abort、正常 prompt completion 与 cleanup 后全部永久关闭；normal completion 应在读取 response/stop 前就关闭 tool capability。
4. observer 在 internal capability closed 后不再产生 product event。
5. normal `turn.completed` 与 abort `turn.failed` 后，retained tool 即使用 fresh signal 也必须 fail closed；不得创建 Snapshot、world/lastRun、sequence/event 或下一 turn 污染。

回归 full model/credential/settings/lifecycle/product gates，不扩展新架构机会。Operator gates：87 pass / 0 fail / 459 assertions；typecheck、build、diff-check 通过；本轮无 presentation change。未读取 credential、未发送真实 provider/model prompt、未运行普通 SDK smoke。

## Output

首行严格 `decision=approved|changes_requested|blocked`；仅报告可执行 P0/P1/P2、精确证据、digest before/after、命令与 limitations。中文为主体，不写 repo-local verdict。
