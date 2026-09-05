# DH-017 implementation request — Studio 只读 Generated Artifact 面板

## Objective

在现有 Studio inspector 中增加一个很小的只读 `Generated Artifacts` 面板，消费已批准的 `GET /api/artifacts` 与 exact member download route，让用户看见完整 verified set，并明确区分：

- `VERIFIED`：bytes / format / immutable records / published join 已验证；
- `CALIBRATION MISSING`：尚未成为可执行 World 的 scale、frame、ground、collision、mass、navigation 等 calibration truth。

这个切片只解决“看见和下载已验证资产”。它不增加 generation form、prepare/confirm、polling、provider call、自动放置、Snapshot/Entity/World Project mutation 或第五个 Agent tool。

## First principles / simplicity

- Gateway safe DTO 是唯一网络输入；Studio 不解码 Data Root、catalog、record、digest lineage 或 provider raw state。
- 组件 mount 时请求一次，另提供显式刷新；不增加 timer、poller、cache、repository、store framework 或 background loop。
- 下载 URL 只由 safe `generationId + assetId` 经 `encodeURIComponent` 构造；不接受 raw path、URL、digest 或 caller format。
- 沿用 Studio 现有 SolidJS、CSS token、button/card/list 语言；不安装依赖、不初始化 shadcn、不重做布局、不增加动画。
- 不把 `VERIFIED` 误写成 alignment/physics/world-ready。`CALIBRATION MISSING` 必须与其同时、非仅靠颜色可见。

## Authorized surface

Expected minimal files:

- new `apps/studio/src/generated-artifacts-client.ts` and focused tests;
- new `apps/studio/src/GeneratedArtifactsPanel.tsx` or one equivalently narrow component;
- minimal integration in `apps/studio/src/App.tsx` and existing `apps/studio/src/styles.css`;
- only if required, one narrow source-boundary or composition test in `apps/studio/src`.

Report `BLOCK` before touching Gateway/package reader/writer/recovery/provider services, World/Snapshot/Repository/World Project schema, ThreeViewport placement, Scene Composer authority, four Agent tools, or adding a frontend state-management/network framework.

## Client contract

Implement a direct client for exact `GET /api/artifacts`:

- no query, body, credentials material or alternate route;
- accept only `200` exact safe list DTO `{schemaVersion:1,sets:[...]}`;
- runtime validate plain objects, exact keys, stable identifier/digest/format/provider/role shapes, finite canonical bounds, provider-specific ordered member cardinality, and a reasonable list cap matching the package catalog cap (256 sets);
- non-200 reads only the stable `{code}` shape when useful; UI receives a small local error category/message, never raw body/stack/provider/filesystem text;
- one in-flight request at a time; explicit refresh aborts/replaces the prior request, unmount aborts it, and a stale response cannot overwrite a newer refresh;
- no retry or timer.

The exact member download URL is:

```text
/api/artifacts/${encodeURIComponent(generationId)}/${encodeURIComponent(assetId)}
```

The panel may expose it as an ordinary download/open link. It must not fetch bytes merely to render the list and must not pass bytes into ThreeViewport or World authoring.

## UI states and content

Place one compact section in the existing inspector without redesigning the application:

- heading `Generated Artifacts` and a manual `刷新` button;
- loading state, empty state, stable error state with retry/refresh, and complete list state;
- each set shows provider label, short generation identity, `VERIFIED`, and `CALIBRATION MISSING`;
- each member shows role, format, byte length, element count, short asset identity, and a `下载`/`打开` link;
- explanatory copy states that verified artifacts are not automatically added to the viewport or World.

Accessibility:

- semantic heading/list/article or definition-list structure;
- loading/error status announced with suitable `aria-live`/`role=status|alert` without noisy repeated announcements;
- refresh is a real button with disabled/loading label; links have specific accessible names;
- badges include text and do not rely only on color; keyboard/focus follows existing button/link styles.

No new animation. Existing `prefers-reduced-motion` behavior remains sufficient.

## Required counterexamples

- legal empty, Marble two-member and Hunyuan one-member responses render correctly;
- malformed schema/version/unknown key/provider-role-format/cardinality/order/identifier/digest/bounds rejects without partial list;
- 409/503/other error exposes stable Studio copy, not raw response or exception text;
- refresh aborts the older request; late older response cannot replace current list; cleanup aborts in-flight work;
- download href percent-encodes exact safe IDs and does not accept server/caller URL;
- list rendering triggers zero member-byte request, zero provider route and zero World/viewport/Project mutation;
- `VERIFIED` always appears with `CALIBRATION MISSING`; no `alignment PASS`, `physics PASS`, `world ready` or auto-place action;
- existing Product Session, Scene Composer, static assets, viewport and four-tool source-boundary tests remain green;
- source scan confirms no import from provider service, generation writer/journal/recovery/CAS internals and no new dependency/animation.

## Verification gates

Focused Studio tests first, then:

- `bun test --max-concurrency 1 --reporter=dot`
- `bun run typecheck`
- `bun run build`
- scoped/global `git diff --check`, reporting unrelated shared dirt separately
- `.artifacts/harness/harnessctl validate`
- `.artifacts/harness/harnessctl doctor`

If the existing local scripted Gateway/Studio fixture can display an empty or fixture list without provider/network side effects, a local browser smoke may be used; do not fabricate a real verified Data Root or widen this slice solely to make a screenshot.

No network, Keychain, credential/provider call, real generation, Git mutation, commit/push/merge/deploy.

## RESULT format

Report exact files, client decode/cancellation behavior, UI states/content, proof that no World/viewport mutation exists, focused/full gates, branch/HEAD/status and deferred lifecycle/canary boundary. Worker RESULT is not approval.
