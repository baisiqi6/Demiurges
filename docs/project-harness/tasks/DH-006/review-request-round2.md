# DH-006 Round 2 — Fresh Focused Cross-review Request

## Role / Authority

Independent reviewer；cwd `/Users/Admin/projects/WorkTrees/Demiurges-DH-006`；严格只读。允许读取 diff/history 并运行 executable tests/probes；禁止编辑、repo-local verdict、commit、push、merge、reset、clean、PR/Issue、SSH、deploy、真实产品 provider prompt、credential 读取或输出。

Base：`7304410`。Round 1 verdict 永久保留于 `cross-review-verdict-round1.md`。

## Frozen candidate

Product digest：`af5167ef946d4190127e5bf70d2ad290dbb50377bbc549f0197bbf42b87a02db`

```bash
{ printf '%s\0' package.json bun.lock; find apps packages -type f \
  \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' -o -name '*.json' \) \
  -not -path '*/dist/*' -not -path '*/node_modules/*' -print0; } \
  | sort -z | xargs -0 shasum -a 256 | shasum -a 256
```

Operator gates：62 tests / 0 fail / 375 assertions；typecheck/build/diff/checklist 通过；真实 Chromium 已验证 success、sanitized failure+resync、fresh session success。

## 必须复测的 Round 1 blockers

1. 两个慢 body 并发同 session turn：只能一个 200/完整 terminal stream，另一个必须 bounded 409；不得空 200。
2. Studio 空 200、缺 terminal、partial disconnect、fetch/Abort failure：必须 reject，并至少执行一次权威 resync；App 必须用 resync projection 覆盖 partial world/lastRun。
3. parser/codec 必须拒绝 cross-session/turn identity、非正或漂移 trace sequence、tool/evidence mismatch、failed+evidence、malformed Snapshot/Ref/Episode/Evaluation、oversized projection 与伪装 media type；不得以 TypeScript cast 代替 runtime admission。
4. chunked UTF-8 request 按 bytes 而非 UTF-16 chars 限额；`application/jsonp`、invalid length/UTF-8/JSON/fields fail closed；读取过程不得先无界 materialize body。
5. synthetic internal/provider/tool error 中的 OMP、RuntimeMvpHost、path、stack、credential-like text 不得进入 product trace、event、HTTP error 或 Studio DOM；只允许稳定 public code。

同时检查新 codec 是否引入错误 identity 约束、当前合法 MuJoCo evidence 被拒、unbounded/高复杂度解析、prototype/accessor side effect、stream lifecycle 同错相消，或把 Presentation/OMP 带入共享 world package。

## Output

第一行严格 `decision=approved|changes_requested|blocked`；P0/P1/P2、精确文件行和 executable evidence、digest、命令结果、limitations。中文为主体，不输出 private chain-of-thought。
