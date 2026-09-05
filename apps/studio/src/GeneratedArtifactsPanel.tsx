import { For, Show, createSignal, onCleanup, onMount } from "solid-js";

import {
  GeneratedArtifactsClient,
  GeneratedArtifactsClientError,
} from "./generated-artifacts-client";
import {
  generatedArtifactsPanelView,
  type GeneratedArtifactsPanelState,
} from "./generated-artifacts-panel-view";

export function GeneratedArtifactsPanel() {
  const client = new GeneratedArtifactsClient();
  const [state, setState] = createSignal<GeneratedArtifactsPanelState>({ kind: "loading" });

  const refresh = async () => {
    setState({ kind: "loading" });
    try {
      const sets = await client.refresh();
      if (sets !== undefined) setState({ kind: "ready", sets });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof GeneratedArtifactsClientError
          ? error.message
          : "暂时无法加载已验证资产，请刷新重试。",
      });
    }
  };

  onMount(() => void refresh());
  onCleanup(() => client.dispose());

  const listContent = () => {
    const view = generatedArtifactsPanelView(state());
    if (view.kind === "empty") {
      return (
      <p class="muted" role="status" aria-live="polite">暂无已验证资产。</p>
      );
    }
    if (view.kind !== "list") return null;
    return (
      <ul class="generated-artifact-set-list" aria-label="已验证生成资产">
        <For each={view.sets}>
          {(set) => (
            <li>
              <article class="generated-artifact-set">
                <div class="generated-artifact-set-heading">
                  <strong>{set.providerLabel}</strong>
                  <span>{set.generationId}</span>
                </div>
                <div class="generated-artifact-badges" aria-label="资产验证状态">
                  <span class="generated-artifact-badge verified">{set.badges[0]}</span>
                  <span class="generated-artifact-badge calibration-missing">{set.badges[1]}</span>
                </div>
                <ul class="generated-artifact-member-list">
                  <For each={set.members}>
                    {(member) => (
                      <li>
                        <dl>
                          <div><dt>role</dt><dd>{member.role}</dd></div>
                          <div><dt>format</dt><dd>{member.format}</dd></div>
                          <div><dt>bytes</dt><dd>{member.byteLength}</dd></div>
                          <div><dt>elements</dt><dd>{member.elementCount}</dd></div>
                          <div><dt>asset</dt><dd>{member.assetId}</dd></div>
                        </dl>
                        <a
                          href={member.downloadHref}
                          download=""
                          aria-label={member.downloadLabel}
                        >下载</a>
                      </li>
                    )}
                  </For>
                </ul>
              </article>
            </li>
          )}
        </For>
      </ul>
    );
  };

  return (
    <section class="inspector-section generated-artifacts-panel" data-testid="generated-artifacts-panel">
      <div class="section-heading">
        <div>
          <span class="eyebrow">Read-only durable catalog</span>
          <h2>Generated Artifacts</h2>
        </div>
        <button
          class="button secondary generated-artifacts-refresh"
          type="button"
          disabled={generatedArtifactsPanelView(state()).refreshDisabled}
          onClick={() => void refresh()}
        >
          {generatedArtifactsPanelView(state()).refreshLabel}
        </button>
      </div>
      <p class="generated-artifacts-note">
        已验证资产仅供查看和下载；不会自动加入 viewport 或 World。
      </p>

      <Show when={generatedArtifactsPanelView(state()).kind === "loading"}>
        <p class="muted" role="status" aria-live="polite">{(generatedArtifactsPanelView(state()) as Extract<ReturnType<typeof generatedArtifactsPanelView>, { kind: "loading" }>).status}</p>
      </Show>
      <Show when={generatedArtifactsPanelView(state()).kind === "error"}>
        <p class="generated-artifacts-error" role="alert">{(generatedArtifactsPanelView(state()) as Extract<ReturnType<typeof generatedArtifactsPanelView>, { kind: "error" }>).message}</p>
      </Show>
      {listContent()}
    </section>
  );
}
