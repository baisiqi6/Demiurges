# DH-002 Independent Review Request

## Authority

只读审查 `/Users/Admin/projects/Demiurges` 的 `DH-002 Episode Player`。允许读取 source、tests、Harness 文档并运行 `bun test`；不得编辑文件、build、commit、push、安装 dependency、启动外部服务或执行 `mark-done`。

不要读取或沿用尚未生成的 DH-002 verdict。以代码、可执行 tests 与本 request 为事实来源。

## Product digest

审查前 aggregate SHA-256：

```text
945b0a827397b44f4570f01891891a4269805b0d6bca8e9fe4d5ebe49e402f36
```

文件集合：`apps/studio/**`（排除 `node_modules`、`dist`、`*.tsbuildinfo`）以及根 `package.json`、`bun.lock`。

## Review focus

1. `EpisodePlayer` 是否只拥有 transient Presentation state，未修改 Episode、Runtime 或 Repository authority；
2. rAF clock、pause/resume anchor、rate change、terminal stop、seek 与逐帧是否存在 off-by-one、跳帧、重复 loop 或 stale callback；
3. `active=false` 是否可靠停止播放，尤其是播放中 explicit adopt 后不会抢回 Episode view；
4. 新 Episode 是否从 sample 0 自动播放，reduced-motion 是否 fail safe；
5. pure clock tests 是否拥有有效 oracle，是否遗漏可执行的 P0/P1 边界；
6. UI controls 的 disabled/label/keyboard/a11y/motion 是否合理；
7. 改动是否保持 `DH-002` scope，没有引入 streaming Runtime、插值 authority、通用 player framework 或额外 dependency。

## 已有证据

- `bun test`: 26 pass / 0 fail / 166 assertions；
- `bun run typecheck`: pass；
- `bun run build`: pass，只有既有 Vite warnings；
- browser: autoplay `frame 12 @ 0.40s`，pause frame 稳定，step +1，2x resume，seek，PASS evaluation；
- browser: 播放中 frame 18 时 ref 仍是 edited Snapshot，adopt 后稳定为 terminal ref、terminal frame 与 Repository view；
- current browser 隔离层无法注入历史 console collector，也不暴露原生 canvas `getContext()`；不要把这两项误写为已验证或产品失败。

## Output contract

以中文输出：

```text
DECISION: approved | changes_requested | blocked

P0
- ... 或 无

P1
- ... 或 无

P2
- ... 或 无

验证证据
- 命令、结果、可执行反例

边界结论
- authority、scope、残余风险
```

任一 P0/P1 必须包含可执行反例或精确 `file:line` 路径；不要只给推测性建议。
