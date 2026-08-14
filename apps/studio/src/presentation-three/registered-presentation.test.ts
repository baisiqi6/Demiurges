import { describe, expect, test } from "bun:test";

import {
  MARBLE_HUNYUAN_MANIFEST_DIGEST,
  createMarbleHunyuanCompositeSnapshot,
  type RegisteredAssetObservationRepresentation,
  type RegisteredAssetVisualRepresentation,
} from "@demiurges/world";
import {
  registeredAssetUrl,
  resolveRegisteredPresentationAsset,
} from "./registered-presentation";

describe("DH-013 registered Presentation binding", () => {
  test("Snapshot representation 只能解析到 manifest/calibration/witness 与 same-origin route", () => {
    const snapshot = createMarbleHunyuanCompositeSnapshot();
    const representations: Array<
      RegisteredAssetVisualRepresentation | RegisteredAssetObservationRepresentation
    > = [];
    for (const entity of snapshot.entities) {
      if (entity.representations.visual.kind === "registered-rigid-mesh") {
        representations.push(entity.representations.visual);
      }
      if (entity.representations.observation?.kind === "registered-gaussian-splat") {
        representations.push(entity.representations.observation);
      }
    }
    expect(representations).toHaveLength(3);
    for (const representation of representations) {
      const resolved = resolveRegisteredPresentationAsset(representation);
      expect(resolved.asset.assetId).toBe(representation.assetId);
      expect(resolved.calibration.id).toBe(representation.calibrationId);
      expect(resolved.witness.id).toBe(representation.witnessId);
      expect(resolved.url).toBe(`/api/assets/${encodeURIComponent(representation.assetId)}`);
      expect(resolved.url).not.toContain("http");
    }
  });

  test("foreign manifest 或 binding 漂移 fail closed", () => {
    const snapshot = createMarbleHunyuanCompositeSnapshot();
    const visual = snapshot.entities[2]!.representations.visual;
    if (visual.kind !== "registered-rigid-mesh") throw new Error("fixture 漂移");
    expect(() => resolveRegisteredPresentationAsset({
      ...visual,
      manifestDigest: `sha256:${"0".repeat(64)}`,
    })).toThrow("manifestDigest");
    expect(() => resolveRegisteredPresentationAsset({
      ...visual,
      calibrationId: "calibration:marble-spz-v1",
    })).toThrow("binding");
    expect(visual.manifestDigest).toBe(MARBLE_HUNYUAN_MANIFEST_DIGEST);
    expect(registeredAssetUrl("asset:a/b")).toBe("/api/assets/asset%3Aa%2Fb");
  });
});
