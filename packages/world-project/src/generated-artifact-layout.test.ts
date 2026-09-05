import { describe, expect, test } from "bun:test";

import {
  generatedArtifactByBytesPointerPath,
  generatedArtifactBytesPath,
  generatedArtifactCatalogPath,
  generatedArtifactContentRecordPath,
  generatedArtifactProvenanceRecordPath,
  generatedArtifactSetRecordPath,
} from "./generated-artifact-layout";

describe("DH-017 generated artifact layout", () => {
  test("builds the exact fixed public target paths from lowercase SHA-256 digests", () => {
    const digest = "a".repeat(64);
    const other = "b".repeat(64);
    expect(generatedArtifactBytesPath(digest)).toBe(`artifacts/sha256/${digest}`);
    expect(generatedArtifactContentRecordPath(digest)).toBe(
      `artifacts/records/content/sha256/${digest}`,
    );
    expect(generatedArtifactByBytesPointerPath(digest)).toBe(
      `artifacts/records/content/by-bytes/sha256/${digest}.json`,
    );
    expect(generatedArtifactProvenanceRecordPath(digest)).toBe(
      `artifacts/records/provenance/sha256/${digest}`,
    );
    expect(generatedArtifactSetRecordPath(other)).toBe(
      `artifacts/sets/sha256/${other}`,
    );
    const generationId = `generation:sha256:${digest}`;
    expect(generatedArtifactCatalogPath(generationId)).toBe(
      `artifacts/catalog/${digest}.json`,
    );
  });

  test("rejects any invalid generation id for the catalog path", () => {
    for (const invalid of [
      "",
      "generation:sha256:a".repeat(63),
      "generation:sha256:A".repeat(64),
      "generation:sha1:" + "a".repeat(64),
      "project:sha256:" + "a".repeat(64),
      "generation:sha256:" + "a".repeat(64) + "/x",
      "generation:sha256:" + "a".repeat(64) + ":extra",
    ] as const) {
      expect(() =>
        generatedArtifactCatalogPath(invalid as `generation:sha256:${string}`),
      ).toThrow("GENERATION_RECOVERY_REQUIRED");
    }
  });

  test("rejects any non-exact lowercase SHA-256 input", () => {
    for (const invalid of [
      "",
      "a".repeat(63),
      "a".repeat(65),
      "A".repeat(64),
      "g".repeat(64),
      "a".repeat(32),
      "../../etc/passwd",
      "a".repeat(64) + "/x",
    ] as const) {
      expect(() => generatedArtifactBytesPath(invalid)).toThrow(
        "64 位 lowercase hex",
      );
      expect(() => generatedArtifactContentRecordPath(invalid)).toThrow(
        "64 位 lowercase hex",
      );
      expect(() => generatedArtifactByBytesPointerPath(invalid)).toThrow(
        "64 位 lowercase hex",
      );
      expect(() => generatedArtifactProvenanceRecordPath(invalid)).toThrow(
        "64 位 lowercase hex",
      );
      expect(() => generatedArtifactSetRecordPath(invalid)).toThrow(
        "64 位 lowercase hex",
      );
    }
  });
});
