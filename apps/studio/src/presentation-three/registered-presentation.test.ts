import { describe, expect, test } from "bun:test";

import {
  MARBLE_HUNYUAN_MANIFEST_DIGEST,
  createMarbleHunyuanCompositeSnapshot,
  type RegisteredAssetObservationRepresentation,
  type RegisteredAssetVisualRepresentation,
  type Snapshot,
} from "@demiurges/world";
import {
  hasExactRegisteredPresentationScenario,
  registeredAssetUrl,
  resolveRegisteredObserverEntry,
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

  test("Marble entry pose stays Presentation-local with exact truth and provenance", () => {
    const snapshot = createMarbleHunyuanCompositeSnapshot();
    expect(hasExactRegisteredPresentationScenario(snapshot)).toBe(true);
    const entry = resolveRegisteredObserverEntry(snapshot);
    expect(entry).toEqual({
      bounds: {
        min: [-1.5006486177444458, -2.60593318939209, -0.10252785682678223],
        max: [1.5100935697555542, 2.58644962310791, 2.5881459712982178],
      },
      entryPose: {
        position: [0, -1.2, 1.15],
        target: [0, 0.2, 1.05],
      },
      truthLevel: "authored-unverified",
      provenance: "asset:marble-world-500k-spz-v1 · calibration:marble-spz-v1 · operator-authored-entry-v1",
      entityRef: "entity:environment",
      calibrationId: "calibration:marble-spz-v1",
    });
    expect(JSON.stringify(snapshot)).not.toContain("operator-authored-entry-v1");
  });

  test("foreign scenario has no registered entry and corrupt Marble identity fails closed", () => {
    const snapshot = createMarbleHunyuanCompositeSnapshot();
    expect(resolveRegisteredObserverEntry({
      ...snapshot,
      scenarioId: "scenario:primitive-box-free-fall-v1",
    })).toBeUndefined();
    expect(() => resolveRegisteredObserverEntry({
      ...snapshot,
      entities: [],
    } as unknown as Snapshot)).toThrow("scenario binding 不完整");
  });

  test("同场景任一 representation 漂移会让 entry 与 registry 整体 fail closed", () => {
    const snapshot = createMarbleHunyuanCompositeSnapshot();
    const entity = snapshot.entities.find(
      (candidate) => candidate.representations.visual.kind === "registered-rigid-mesh",
    )!;
    if (entity.representations.visual.kind !== "registered-rigid-mesh") {
      throw new Error("fixture 漂移");
    }
    const corrupt = {
      ...snapshot,
      entities: snapshot.entities.map((candidate) => candidate.ref === entity.ref
        ? {
            ...candidate,
            representations: {
              ...candidate.representations,
              visual: {
                ...entity.representations.visual,
                manifestDigest: `sha256:${"0".repeat(64)}`,
              },
            },
          }
        : candidate),
    } as Snapshot;
    expect(() => hasExactRegisteredPresentationScenario(corrupt)).toThrow("manifestDigest");
    expect(() => resolveRegisteredObserverEntry(corrupt)).toThrow("manifestDigest");
  });

  test("已存在但不匹配的 witness 与 entity/role swap 也 fail closed", () => {
    const snapshot = createMarbleHunyuanCompositeSnapshot();
    const environment = snapshot.entities.find((entity) => entity.ref === "entity:environment")!;
    const generated = snapshot.entities.find((entity) => entity.ref === "entity:generated-object")!;
    if (
      environment.representations.visual.kind !== "registered-rigid-mesh" ||
      generated.representations.visual.kind !== "registered-rigid-mesh"
    ) {
      throw new Error("fixture 漂移");
    }
    const wrongWitness = {
      ...snapshot,
      entities: snapshot.entities.map((entity) => entity.ref === generated.ref
        ? {
            ...entity,
            representations: {
              ...entity.representations,
              visual: {
                ...generated.representations.visual,
                witnessId: "witness:marble-spz-collider-bounds-v1",
              },
            },
          }
        : entity),
    } as Snapshot;
    expect(() => hasExactRegisteredPresentationScenario(wrongWitness)).toThrow("binding");
    expect(() => resolveRegisteredObserverEntry(wrongWitness)).toThrow("binding");

    const swappedEntities = {
      ...snapshot,
      entities: snapshot.entities.map((entity) => entity.ref === environment.ref
        ? {
            ...entity,
            representations: {
              ...entity.representations,
              visual: generated.representations.visual,
            },
          }
        : entity.ref === generated.ref
          ? {
              ...entity,
              representations: {
                ...entity.representations,
                visual: environment.representations.visual,
              },
            }
          : entity),
    } as Snapshot;
    expect(() => hasExactRegisteredPresentationScenario(swappedEntities)).toThrow("entity/role");
    expect(() => resolveRegisteredObserverEntry(swappedEntities)).toThrow("entity/role");
  });

  test("wrong-slot extra registered representation 不能绕过 scenario exactness", () => {
    const snapshot = createMarbleHunyuanCompositeSnapshot();
    const environment = snapshot.entities.find((entity) => entity.ref === "entity:environment")!;
    if (environment.representations.visual.kind !== "registered-rigid-mesh") {
      throw new Error("fixture 漂移");
    }
    const wrongSlot = {
      ...snapshot,
      entities: snapshot.entities.map((entity) => entity.ref === "entity:floor"
        ? {
            ...entity,
            representations: {
              ...entity.representations,
              observation: environment.representations.visual,
            },
          }
        : entity),
    } as unknown as Snapshot;
    expect(() => hasExactRegisteredPresentationScenario(wrongSlot)).toThrow("不完整");
    expect(() => resolveRegisteredObserverEntry(wrongSlot)).toThrow("不完整");
  });
});
