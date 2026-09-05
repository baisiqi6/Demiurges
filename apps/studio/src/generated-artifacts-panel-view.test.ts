import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { generatedArtifactsPanelView } from "./generated-artifacts-panel-view";

const generationId = `generation:sha256:${"a".repeat(64)}`;
const assetId = `asset:generated-sha256-${"b".repeat(64)}`;
const set = {
  generationId,
  provider: "hunyuan-ai3d-v1" as const,
  artifactSetDigest: "c".repeat(64),
  members: [{
    assetId,
    role: "object-glb" as const,
    format: "glb-2.0" as const,
    contentDigest: "b".repeat(64),
    byteLength: 1536,
    elementCount: 7,
    sourceBounds: { min: [0, 0, 0] as const, max: [1, 1, 1] as const },
  }],
};

function importSpecifiers(source: string): readonly string[] {
  return [...source.matchAll(/^import\s*(?:[\s\S]*?\bfrom\s+)?["']([^"']+)["'];?$/gm)].map(
    (match) => match[1]!,
  );
}

describe("Generated Artifacts panel view", () => {
  test("纯 view 覆盖 loading、empty、error 与 complete list；VERIFIED 必与 CALIBRATION MISSING 同显", () => {
    expect(generatedArtifactsPanelView({ kind: "loading" })).toMatchObject({
      kind: "loading", refreshDisabled: true, status: "正在读取已验证资产…",
    });
    expect(generatedArtifactsPanelView({ kind: "ready", sets: [] })).toMatchObject({
      kind: "empty", refreshDisabled: false, status: "暂无已验证资产。",
    });
    expect(generatedArtifactsPanelView({ kind: "error", message: "稳定错误" })).toMatchObject({
      kind: "error", refreshDisabled: false, message: "稳定错误",
    });
    const view = generatedArtifactsPanelView({ kind: "ready", sets: [set] });
    expect(view).toMatchObject({ kind: "list" });
    if (view.kind !== "list") throw new Error("expected list");
    expect(view.sets[0]?.badges).toEqual(["VERIFIED", "CALIBRATION MISSING"]);
    expect(view.sets[0]?.members[0]).toMatchObject({
      byteLength: "1.5 KiB",
      elementCount: "7",
      downloadHref: `/api/artifacts/${encodeURIComponent(generationId)}/${encodeURIComponent(assetId)}`,
    });
  });

  test("panel/client source 不接触 World、viewport、provider/writer/journal/CAS 或 member-byte route", () => {
    const panel = readFileSync(new URL("./GeneratedArtifactsPanel.tsx", import.meta.url), "utf8");
    const view = readFileSync(new URL("./generated-artifacts-panel-view.ts", import.meta.url), "utf8");
    const client = readFileSync(new URL("./generated-artifacts-client.ts", import.meta.url), "utf8");
    expect(importSpecifiers('import "./marble-provider-service";')).toEqual(["./marble-provider-service"]);
    expect(importSpecifiers(client)).toEqual([]);
    expect(importSpecifiers(view)).toEqual(["./generated-artifacts-client"]);
    expect(importSpecifiers(panel)).toEqual([
      "solid-js",
      "./generated-artifacts-client",
      "./generated-artifacts-panel-view",
    ]);
    for (const source of [panel, view, client]) {
      expect(source).not.toMatch(/from ["'](?:@demiurges\/(?:world|world-project)|\.\/presentation-three|\.\/scene-composer)["']/);
      expect(source).not.toMatch(/(?:Generation(?:Writer|Journal)|CAS|auto-place)/);
    }
    expect(panel).not.toContain("fetch(");
    expect(view).not.toContain("fetch(");
    expect(client.match(/#fetch\(/g)).toHaveLength(1);
    expect(client).toContain('this.#fetch("/api/artifacts", { signal: controller.signal })');
    expect(client).not.toContain('this.#fetch("/api/artifacts/');
  });
});
