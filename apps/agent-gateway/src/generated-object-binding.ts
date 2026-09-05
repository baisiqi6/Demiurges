import type { GeneratedArtifactSetSummaryV1 } from "@demiurges/world-project";

export interface GeneratedObjectBinding {
  readonly assetId: `asset:generated-sha256-${string}`;
  readonly artifactSetDigest: string;
  readonly sourceBounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
}

export function selectGeneratedObjectBinding(
  sets: readonly GeneratedArtifactSetSummaryV1[],
): GeneratedObjectBinding | null {
  let found: {
    assetId: `asset:generated-sha256-${string}`;
    artifactSetDigest: string;
    bounds: GeneratedObjectBinding["sourceBounds"];
  } | null = null;
  for (const set of sets) {
    for (const member of set.members) {
      if (member.role !== "object-glb" || member.format !== "glb-2.0") continue;
      if (found !== null) return null;
      found = {
        assetId: member.assetId,
        artifactSetDigest: set.artifactSetDigest,
        bounds: member.sourceBounds,
      };
    }
  }
  if (found === null) return null;
  const min = Object.freeze([...found.bounds.min]) as readonly [number, number, number];
  const max = Object.freeze([...found.bounds.max]) as readonly [number, number, number];
  return Object.freeze({
    assetId: found.assetId,
    artifactSetDigest: found.artifactSetDigest,
    sourceBounds: Object.freeze({ min, max }),
  });
}
