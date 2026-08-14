# DH-013 Phase 1 Cross-review Verdict — Round 2

## Decision

```text
decision: changes_requested
may_enter_phase2: no
P0: 0
P1: 1
P2: 0
```

两位 fresh reviewer 对 aggregate `6643485ff8622d4bf12dc774bb6d36b36c980c0cd8a3e37d9d2566821ad59818` 共同拒绝批准：

- GPT-5.6 Sol Max：Repository/observation accessor boundary 未闭合；
- OMP DeepSeek V4 Pro Max（session `019ffe97-655c-7000-94ec-8dba378fd258`）：复现 physics accessor TOCTOU 与实际 current Ref 污染。

## Executable blocker

Repository 在完整 descriptor admission 前访问 `snapshot.source/id/entities` 并扫描 collision；`requireSnapshotRepresentationIntegrity` 又只确认 entity 顶层 `physics` 是 data property，未验证 `bodyType/massKg/friction` nested descriptors。攻击 getter 可：

1. 在 physics 比较发生时被读取一次；
2. 改写此前已经比对过的 floor state、floor collision 或 generated collision；
3. 把 getter 自身重定义成 canonical plain data property；
4. 通过后续 `deepFreeze/isDeepFrozen`，使漂移 Snapshot 成为 `world:current`。

已复现 collision halfExtents `999`/`888` 与 floor z `-5` 被 Repository 接纳；Runtime/codec 后续拒绝不能撤销 Repository authority 已污染的事实。

## Retained passing evidence

Round 1 三项 blocker 已闭合：canonical projection/event 正向通过；合法 local session 后 32 family seam probes 真正命中；registry 与 Snapshot 指定数组/accessor regression 通过。focused `295/0/415`、full `437/0/3266`、typecheck、diff、EXharness 通过。

## Required root remediation

- Repository `write/record/#insert` 的第一道操作必须是完整 descriptor-only registered Snapshot admission，禁止任何字段访问或 collection traversal 先行；
- `requireSnapshotRepresentationIntegrity` 必须 exact 验证 physics nested record 与 registered observation，分派只能使用 descriptor 副本，不能先读 caller object 的 `kind`；
- 增加 self-materializing getters：root/entities/observation/physics，getter 必须 reads=0、Repository 不初始化 Ref；getter 内篡改 state/collision 也不得成功；
- 重新冻结并 fresh Round 3。

本 verdict 不授权 Phase 2、provider/Keychain、commit/push/merge/PR/tag/deploy。
