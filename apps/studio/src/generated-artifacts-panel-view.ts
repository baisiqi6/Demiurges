import {
  generatedArtifactDownloadHref,
  type GeneratedArtifactSet,
} from "./generated-artifacts-client";

export type GeneratedArtifactsPanelState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly sets: readonly GeneratedArtifactSet[] }
  | { readonly kind: "error"; readonly message: string };

interface GeneratedArtifactMemberView {
  readonly role: string;
  readonly format: string;
  readonly byteLength: string;
  readonly elementCount: string;
  readonly assetId: string;
  readonly downloadHref: string;
  readonly downloadLabel: string;
}

interface GeneratedArtifactSetView {
  readonly providerLabel: string;
  readonly generationId: string;
  readonly badges: readonly ["VERIFIED", "CALIBRATION MISSING"];
  readonly members: readonly GeneratedArtifactMemberView[];
}

export type GeneratedArtifactsPanelView =
  | { readonly kind: "loading"; readonly refreshLabel: "刷新中…"; readonly refreshDisabled: true; readonly status: string }
  | { readonly kind: "empty"; readonly refreshLabel: "刷新"; readonly refreshDisabled: false; readonly status: string }
  | { readonly kind: "error"; readonly refreshLabel: "刷新"; readonly refreshDisabled: false; readonly message: string }
  | { readonly kind: "list"; readonly refreshLabel: "刷新"; readonly refreshDisabled: false; readonly sets: readonly GeneratedArtifactSetView[] };

function providerLabel(provider: GeneratedArtifactSet["provider"]): string {
  return provider === "worldlabs-marble-v1" ? "World Labs Marble" : "Tencent Hunyuan 3D";
}

function shortIdentity(value: string): string {
  return `${value.slice(0, 24)}…${value.slice(-8)}`;
}

function formatBytes(value: number): string {
  return value >= 1024 * 1024
    ? `${(value / (1024 * 1024)).toFixed(1)} MiB`
    : value >= 1024
      ? `${(value / 1024).toFixed(1)} KiB`
      : `${value} B`;
}

/** Pure presentation data: it creates links but never requests member bytes. */
export function generatedArtifactsPanelView(
  state: GeneratedArtifactsPanelState,
): GeneratedArtifactsPanelView {
  if (state.kind === "loading") {
    return { kind: "loading", refreshLabel: "刷新中…", refreshDisabled: true, status: "正在读取已验证资产…" };
  }
  if (state.kind === "error") {
    return { kind: "error", refreshLabel: "刷新", refreshDisabled: false, message: state.message };
  }
  if (state.sets.length === 0) {
    return { kind: "empty", refreshLabel: "刷新", refreshDisabled: false, status: "暂无已验证资产。" };
  }
  return {
    kind: "list",
    refreshLabel: "刷新",
    refreshDisabled: false,
    sets: state.sets.map((set) => ({
      providerLabel: providerLabel(set.provider),
      generationId: shortIdentity(set.generationId),
      badges: ["VERIFIED", "CALIBRATION MISSING"],
      members: set.members.map((member) => ({
        role: member.role,
        format: member.format,
        byteLength: formatBytes(member.byteLength),
        elementCount: member.elementCount.toLocaleString(),
        assetId: shortIdentity(member.assetId),
        downloadHref: generatedArtifactDownloadHref(set.generationId, member.assetId),
        downloadLabel: `下载 ${member.role} ${shortIdentity(member.assetId)}`,
      })),
    })),
  };
}
