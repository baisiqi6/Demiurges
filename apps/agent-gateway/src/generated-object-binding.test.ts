import { describe, expect, test } from "bun:test";

import type { GeneratedArtifactSetSummaryV1 } from "@demiurges/world-project";

import {
  selectGeneratedObjectBinding,
  type GeneratedObjectBinding,
} from "./generated-object-binding";

const generationId: `generation:sha256:${string}` = `generation:sha256:${"a".repeat(64)}`;
const artifactSetDigest = "5641bf040c5dc881a553332493957627c8557edc5d7aa7d4f65b42139259e69d";
const contentDigest = "65dc7eb3d71393e624925c6848e88b55cf0bd6fd8d1ca63b956743fddd55e05a";
const assetId = `asset:generated-sha256-${contentDigest}`;
const min: readonly [number, number, number] = [
  -0.48395800590515137,
  -3.736129973702895e-8,
  -0.2797180492002527,
];
const max: readonly [number, number, number] = [
  0.4801819920539856,
  0.574190135291325,
  0.2780711007797188,
];

function objectMember(): GeneratedArtifactSetSummaryV1["members"][number] {
  return {
    assetId,
    role: "object-glb",
    format: "glb-2.0",
    contentDigest,
    byteLength: 1,
    elementCount: 1,
    sourceBounds: { min, max },
  };
}

function setOf(members: GeneratedArtifactSetSummaryV1["members"]): GeneratedArtifactSetSummaryV1 {
  return {
    generationId,
    provider: "worldlabs-marble-v1",
    artifactSetDigest,
    members,
  };
}

describe("selectGeneratedObjectBinding", () => {
  test("零个 object-glb 匹配时返回 null", () => {
    expect(selectGeneratedObjectBinding([])).toBeNull();
    expect(selectGeneratedObjectBinding([setOf([{
      assetId,
      role: "world-spz-500k",
      format: "spz-v2",
      contentDigest,
      byteLength: 1,
      elementCount: 1,
      sourceBounds: { min, max },
    }])])).toBeNull();
  });

  test("恰好一个匹配时返回精确 frozen binding", () => {
    const result = selectGeneratedObjectBinding([setOf([
      {
        assetId,
        role: "world-collider-glb",
        format: "glb-2.0",
        contentDigest,
        byteLength: 1,
        elementCount: 1,
        sourceBounds: { min, max },
      },
      objectMember(),
    ])]);
    const expected: GeneratedObjectBinding = {
      assetId,
      artifactSetDigest,
      sourceBounds: { min, max },
    };
    expect(result).not.toBeNull();
    expect(result).toEqual(expected);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result!.sourceBounds)).toBe(true);
    expect(Object.isFrozen(result!.sourceBounds.min)).toBe(true);
    expect(Object.isFrozen(result!.sourceBounds.max)).toBe(true);
  });

  test("多个匹配时返回 null", () => {
    const otherSet = { ...setOf([objectMember()]), artifactSetDigest: "d".repeat(64) };
    expect(selectGeneratedObjectBinding([setOf([objectMember()]), otherSet])).toBeNull();
  });
});
