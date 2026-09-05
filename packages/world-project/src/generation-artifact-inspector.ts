import { inspectArtifactBytes } from "../../../scripts/provider-artifact-validation";

import {
  artifactInspectorDescriptorDigest,
  requireArtifactInspectorDescriptor,
  type ArtifactInspectorDescriptorV1,
} from "./generation-output-contracts";
import { GenerationCodecError } from "./generation-contracts";

export interface DynamicArtifactInspectionV1 {
  readonly descriptor: ArtifactInspectorDescriptorV1;
  readonly descriptorDigest: string;
}

const inspectedDynamicArtifacts = new WeakSet<object>();

/** Package-internal origin check for the dynamic byte inspector's immutable output. */
export function requireInspectedDynamicArtifact(
  value: unknown,
): DynamicArtifactInspectionV1 {
  if (
    typeof value !== "object" ||
    value === null ||
    !inspectedDynamicArtifacts.has(value)
  ) {
    throw new GenerationCodecError("GENERATION_RECOVERY_REQUIRED");
  }
  return value as DynamicArtifactInspectionV1;
}

function normalizeCoordinate(value: number): number {
  const withoutNegativeZero = Object.is(value, -0) ? 0 : value;
  const rounded = Number(withoutNegativeZero.toPrecision(15));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function normalizeSourceBounds(
  sourceBounds: ArtifactInspectorDescriptorV1["sourceBounds"],
): ArtifactInspectorDescriptorV1["sourceBounds"] {
  return {
    min: sourceBounds.min.map(normalizeCoordinate) as [number, number, number],
    max: sourceBounds.max.map(normalizeCoordinate) as [number, number, number],
  };
}

export function inspectDynamicArtifactBytes(
  format: ArtifactInspectorDescriptorV1["format"],
  bytes: Uint8Array,
): DynamicArtifactInspectionV1 {
  const inspected = inspectArtifactBytes(format, bytes);
  const descriptor = requireArtifactInspectorDescriptor({
    schemaVersion: 1,
    inspectorProfile: format === "spz-v2"
      ? "spz-v2-position-bounds-v1"
      : "glb-2.0-scene-bounds-v1",
    format,
    contentDigest: inspected.digest,
    byteLength: inspected.byteLength,
    elementCount: inspected.elementCount,
    sourceBounds: normalizeSourceBounds(inspected.sourceBounds),
  });
  const result = Object.freeze({
    descriptor,
    descriptorDigest: artifactInspectorDescriptorDigest(descriptor),
  });
  inspectedDynamicArtifacts.add(result);
  return result;
}
