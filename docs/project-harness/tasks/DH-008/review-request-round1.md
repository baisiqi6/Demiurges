# DH-008 Round 1 — Imported Rigid Entity Independent Review

## Role / Authority

Independent reviewer；cwd `/Users/Admin/projects/WorkTrees/Demiurges-DH-008`；严格只读。允许读取 base diff、canonical plan、产品 source、repo-owned GLB bytes，并运行 no-network tests / in-memory executable probes。禁止编辑或创建文件、读取 credential、发送真实 provider/model prompt、联网、build、commit、push、merge、reset、clean、deploy 或调用外部 coding agent。不得读取另一 reviewer 的输出。

Base：`ac293318c8a6b2fe7433146df7417cc3c83e2726`。Frozen product digest：`66305bb2b078bb20f9181b63d263f35d0277ba61a20600cae94fada0a6a28281`。

```bash
{ printf '%s\0' package.json bun.lock; find apps packages scripts -type f \
  \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' -o -name '*.json' -o -name '*.glb' -o -name '*.mjs' \) \
  -not -path '*/dist/*' -not -path '*/node_modules/*' -print0; } \
  | sort -z | xargs -0 shasum -a 256 | shasum -a 256
```

## Review target

1. imported mesh 与 collision proxy 是否真正按 representation 分离；Kernel/Product codec 是否只接纳 bounded plain immutable evidence；
2. registry 是否把 GLB bytes、digest、provenance/license、source frame、units、local alignment、bounds 与 collision proxy 锁定为同一 source of truth，并在任何 identity/alignment drift 时 fail closed；
3. MuJoCo MJCF 是否只消费 collision/physics/state，visual asset/path/bytes 是否不会静默改变 physics；landing contract 是否只从 collision evidence 推导；
4. 同一 `EntityRef` 是否贯穿 authored Snapshot、Three.js mapping/selection、Episode samples/terminal Snapshot 与 Evaluation；异步 late load、disposal 与 session reset 是否会恢复 stale visual/state；
5. model-facing surface 是否仍恰好为 `world_read/world_write/world_edit/world_run`，任意 URL/path/file/unknown fixture 是否在 execution 前拒绝，Agent 是否仍不能 adopt；
6. primitive golden scenario 与 imported scripted Product Session 是否复用同一 Runtime/Host/transport，而不是复制第二套实现；
7. 用 executable probes 优先寻找会越过 artifact identity、authority、frame/units、alignment、JSON/descriptor、async lifecycle 或 evidence identity 的 P0/P1。只报告实证缺陷，不扩展 Spark/3DGS、robot、通用 asset platform 等 non-goal。

Operator gates：96 tests / 0 fail / 516 assertions；typecheck、production build、`git diff --check` 通过。GLB generator 重跑 byte-for-byte deterministic，asset SHA-256 为 `26e032d8ae8f4d3bea41e446a36087fba90afee58f583080830d2e70ee94590e`。

真实 Chromium 已验证 asset `loaded`、`entity:cube` binding、76 samples、Episode 1.60 s → 2.50 s 逐帧推进、Inspector digest/frame/units/alignment/provenance/proxy、Evaluation PASS，以及新 Session 后 asset/ref/Episode/Evaluation 清空；浏览器无已知 error。未读取 credential、未发送真实 provider prompt。

## Output

首行严格 `decision=approved|changes_requested|blocked`；随后给 P0/P1/P2、精确文件/行号或可执行反例、digest before/after、运行命令与 limitations。中文为主体；不写 repo-local verdict，不读取另一 reviewer 输出。
