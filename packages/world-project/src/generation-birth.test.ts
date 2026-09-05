import { describe, expect, test } from "bun:test";

import {
  createGenerationBinding,
  createGenerationIntent,
  requireGenerationRequest,
} from "./generation-contracts";
import {
  createInitialGenerationStateRecord,
} from "./generation-state";
import {
  createGenerationBirthHead,
  createGenerationBirthPointer,
  generationCatalogFilename,
  generationIdDigest,
  requireGenerationBirthAttemptToken,
  requireGenerationBirthHead,
  requireGenerationBirthPointer,
} from "./generation-birth";

function fixture() {
  const prepared = requireGenerationRequest({
    provider: "worldlabs-marble-v1",
    model: "marble-1.1",
    prompt: "a mossy stone arch",
    costUnknownAccepted: true,
    waitForCompletionAndDownload: true,
    idempotencyKey: "birth-marble",
  });
  const intent = createGenerationIntent(createGenerationBinding(prepared, {
    contractProfile: "worldlabs-openapi-2026-08-15-v1",
    contractShapeDigest: "a".repeat(64),
  }), "2026-08-15T10:00:00.000Z");
  const admitted = createInitialGenerationStateRecord(intent);
  return { intent, admitted };
}

describe("Generation birth evidence", () => {
  test("pointer and head bind the immutable intent and admitted record", () => {
    const { intent, admitted } = fixture();
    const pointer = createGenerationBirthPointer(intent, admitted);
    const head = createGenerationBirthHead(intent, admitted);
    expect(requireGenerationBirthPointer(pointer, intent, admitted)).toEqual(pointer);
    expect(requireGenerationBirthHead(head, intent, admitted)).toEqual(head);
    expect(generationIdDigest(intent.generationId)).toHaveLength(64);
    expect(generationCatalogFilename(intent.generationId)).toBe(
      `${generationIdDigest(intent.generationId)}.json`,
    );
  });

  test("drift and unknown fields fail closed", () => {
    const { intent, admitted } = fixture();
    const pointer = createGenerationBirthPointer(intent, admitted);
    const head = createGenerationBirthHead(intent, admitted);
    expect(() => requireGenerationBirthPointer({
      ...pointer,
      intentDigest: "0".repeat(64),
    }, intent, admitted)).toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => requireGenerationBirthPointer({ ...pointer, extra: true }, intent, admitted))
      .toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => requireGenerationBirthHead({ ...head, sequence: 1 }, intent, admitted))
      .toThrow("GENERATION_RECOVERY_REQUIRED");
  });

  test("birth token is independent 128-bit lowercase hex", () => {
    expect(requireGenerationBirthAttemptToken("a".repeat(32))).toBe("a".repeat(32));
    for (const invalid of ["a".repeat(24), "A".repeat(32), "a".repeat(33), "../x"] as const) {
      expect(() => requireGenerationBirthAttemptToken(invalid)).toThrow(
        "GENERATION_RECOVERY_REQUIRED",
      );
    }
  });
});
