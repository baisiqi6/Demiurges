import { describe, expect, test } from "bun:test";

import {
  GENERATION_NAMESPACE_ENTRY_NAMES,
  GENERATION_NAMESPACE_SEED,
  createGenerationNamespaceBody,
  createGenerationNamespaceInstallBindingFromLeaseDigest,
  generationNamespaceInstallBindingDigest,
  generationNamespaceOperationIdFromLeaseDigest,
  generationNamespaceSeedDigest,
  requireGenerationNamespaceBody,
  requireGenerationNamespaceInstallBinding,
  requireGenerationNamespaceInstallResult,
} from "./generation-namespace";

const ROOT_A = "0".repeat(64);
const ROOT_B = "f".repeat(64);

describe("Generation namespace identity", () => {
  test("freezes the seed and deterministic cross-process golden vector", () => {
    expect(GENERATION_NAMESPACE_SEED).toEqual({
      schemaVersion: 1,
      namespace: "demiurges-generation-journal-v1",
      entryNames: [
        "namespace.json",
        ".namespace-install-intent.json",
        "data",
        "catalog",
        "birth-staging",
      ],
    });
    expect(GENERATION_NAMESPACE_ENTRY_NAMES).toEqual(
      GENERATION_NAMESPACE_SEED.entryNames,
    );
    expect(generationNamespaceSeedDigest()).toBe(
      "bd57855b0e64733047e03a4de345f47b459b1a9195d4be898fdfb278e08730e2",
    );
    expect(generationNamespaceOperationIdFromLeaseDigest(ROOT_A)).toBe(
      "op:generation-namespace-install-v1-4146be9f6e56be78280b0525c63c4933ddc328dd89c96452bc6d176af7cc3535",
    );
    expect(generationNamespaceInstallBindingDigest(
      createGenerationNamespaceInstallBindingFromLeaseDigest(ROOT_A),
    )).toBe(
      "fa931c81f179033be735b471c248fe0e6a9d6ff43f7cee45bacc2f6d11cad5d7",
    );
  });

  test("different Data Root identities cannot replay the namespace operation", () => {
    const left = createGenerationNamespaceInstallBindingFromLeaseDigest(ROOT_A);
    const right = createGenerationNamespaceInstallBindingFromLeaseDigest(ROOT_B);
    expect(left.operationId).not.toBe(right.operationId);
    expect(generationNamespaceInstallBindingDigest(left)).not.toBe(
      generationNamespaceInstallBindingDigest(right),
    );
  });

  test("binding candidate remains acyclic and rejects successor injection", () => {
    const binding = createGenerationNamespaceInstallBindingFromLeaseDigest(ROOT_A);
    expect(requireGenerationNamespaceInstallBinding(binding)).toEqual(binding);
    expect(() => requireGenerationNamespaceInstallBinding({
      ...binding,
      candidateIdentity: {
        ...binding.candidateIdentity,
        installBindingDigest: generationNamespaceInstallBindingDigest(binding),
      },
    })).toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => requireGenerationNamespaceInstallBinding({
      ...binding,
      target: { ...binding.target, extra: "x" },
    })).toThrow("GENERATION_RECOVERY_REQUIRED");
  });

  test("namespace body binds the exact candidate directory identity", () => {
    const binding = createGenerationNamespaceInstallBindingFromLeaseDigest(ROOT_A);
    const body = createGenerationNamespaceBody(binding, {
      dev: 12n,
      ino: 34n,
      mode: 0o40700n,
      uid: 501n,
      gid: 20n,
    });
    expect(requireGenerationNamespaceBody(body, binding)).toEqual(body);
    expect(body.candidateDirectoryIdentity).toEqual({
      dev: "12",
      ino: "34",
      mode: 448,
      uid: "501",
      gid: "20",
    });
    expect(() => requireGenerationNamespaceBody({
      ...body,
      candidateDirectoryIdentity: {
        ...body.candidateDirectoryIdentity,
        ino: "35",
      },
    }, binding, body.candidateDirectoryIdentity)).toThrow(
      "GENERATION_RECOVERY_REQUIRED",
    );
  });

  test("terminal success publishes only the namespace seed identity", () => {
    const binding = createGenerationNamespaceInstallBindingFromLeaseDigest(ROOT_A);
    const result = {
      schemaVersion: 1 as const,
      operationId: binding.operationId,
      bindingDigest: generationNamespaceInstallBindingDigest(binding),
      variant: "success" as const,
      publishedIdentity: generationNamespaceSeedDigest(),
    };
    expect(requireGenerationNamespaceInstallResult(result, binding)).toEqual(result);
    expect(() => requireGenerationNamespaceInstallResult({
      ...result,
      publishedIdentity: ROOT_A,
    }, binding)).toThrow("GENERATION_RECOVERY_REQUIRED");
  });
});
