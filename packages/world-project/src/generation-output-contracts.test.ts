import { describe, expect, test } from "bun:test";

import {
  createGenerationBinding,
  createGenerationIntent,
  requireGenerationRequest,
} from "./generation-contracts";
import {
  artifactInspectorDescriptorDigest,
  createInitialDownloadBudget,
  requireActiveDownloadPayload,
  requireArtifactRejectedPayload,
  requireArtifactInspectorDescriptor,
  requireDownloadCandidate,
  requireDownloadBudgetTransition,
  requireDownloadDiscardWitness,
  requireInitialDownloadBudget,
  requireOutputsReadyPayload,
  requireRemoteOutputIdentity,
  requireSanitizedCost,
} from "./generation-output-contracts";

function intent(provider: "worldlabs-marble-v1" | "hunyuan-ai3d-v1") {
  const prepared = requireGenerationRequest(provider === "worldlabs-marble-v1"
    ? {
        provider,
        model: "marble-1.1",
        prompt: "a mossy stone arch",
        costUnknownAccepted: true,
        waitForCompletionAndDownload: true,
        idempotencyKey: "output-marble",
      }
    : {
        provider,
        model: "3.1",
        prompt: "a mossy stone arch",
        costUnknownAccepted: true,
        waitForCompletionAndDownload: true,
        idempotencyKey: "output-hunyuan",
      });
  return createGenerationIntent(createGenerationBinding(prepared, {
    contractProfile: provider === "worldlabs-marble-v1"
      ? "worldlabs-openapi-2026-08-15-v1"
      : "cloud-response-v1",
    contractShapeDigest: "a".repeat(64),
  }), "2026-08-15T10:00:00.000Z");
}

describe("Generation output durable contracts", () => {
  test("Marble output identity binds the durable operation and exact set roles", () => {
    const durableIntent = intent("worldlabs-marble-v1");
    const remoteBound = {
      provider: "worldlabs-marble-v1" as const,
      remoteJobId: "operation_1",
      providerRequestId: null,
    };
    expect(requireRemoteOutputIdentity({
      kind: "marble-world",
      operationId: "operation_1",
      worldId: "world_1",
      spzKey: "500k",
      colliderField: "collider_mesh_url",
    }, durableIntent, remoteBound).worldId).toBe("world_1");
    expect(() => requireRemoteOutputIdentity({
      kind: "marble-world",
      operationId: "operation_2",
      worldId: "world_1",
      spzKey: "500k",
      colliderField: "collider_mesh_url",
    }, durableIntent, remoteBound)).toThrow("GENERATION_RECOVERY_REQUIRED");
  });

  test("Hunyuan output identity binds JobId and exact GLB/OBJ cardinality", () => {
    const durableIntent = intent("hunyuan-ai3d-v1");
    const remoteBound = {
      provider: "hunyuan-ai3d-v1" as const,
      remoteJobId: "12345",
      providerRequestId: "123e4567-e89b-12d3-a456-426614174000",
    };
    expect(requireRemoteOutputIdentity({
      kind: "hunyuan-file-set",
      jobId: "12345",
      glbCount: 1,
      objCount: 1,
    }, durableIntent, remoteBound).kind).toBe("hunyuan-file-set");
    expect(() => requireRemoteOutputIdentity({
      kind: "hunyuan-file-set",
      jobId: "12345",
      glbCount: 2,
      objCount: 0,
    }, durableIntent, remoteBound)).toThrow("GENERATION_RECOVERY_REQUIRED");
    for (const providerRequestId of [
      "forged",
      "123E4567-E89B-12D3-A456-426614174000",
    ]) {
      expect(() => requireRemoteOutputIdentity({
        kind: "hunyuan-file-set",
        jobId: "12345",
        glbCount: 1,
        objCount: 0,
      }, durableIntent, { ...remoteBound, providerRequestId }))
        .toThrow("GENERATION_RECOVERY_REQUIRED");
    }
  });

  test("sanitized cost is provider-matched and non-exponent decimal", () => {
    expect(requireSanitizedCost({
      unit: "worldlabs-credit",
      amount: "12.5",
    }, "worldlabs-marble-v1")).toEqual({
      unit: "worldlabs-credit",
      amount: "12.5",
    });
    for (const value of [
      { unit: "hunyuan-credit", amount: "12.5" },
      { unit: "worldlabs-credit", amount: "1e3" },
      { unit: "worldlabs-credit", amount: "01" },
    ]) {
      expect(() => requireSanitizedCost(value, "worldlabs-marble-v1"))
        .toThrow("GENERATION_RECOVERY_REQUIRED");
    }
  });

  test("initial download budget freezes provider exact member order", () => {
    const marble = intent("worldlabs-marble-v1");
    const budget = createInitialDownloadBudget(marble, {
      cycleCount: 1,
      attemptCount: 4,
      cycleStartedAt: "2026-08-15T10:00:00.000Z",
      deadlineAt: "2026-08-15T10:20:00.000Z",
    });
    expect(budget.orderedMembers.map((member) => member.outputRole)).toEqual([
      "world-spz-500k",
      "world-collider-glb",
    ]);
    expect(requireInitialDownloadBudget(budget, marble)).toEqual(budget);
    expect(() => requireInitialDownloadBudget({
      ...budget,
      orderedMembers: [...budget.orderedMembers].reverse(),
    }, marble)).toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => requireDownloadBudgetTransition({
      ...budget,
      orderedMembers: [budget.orderedMembers[0], {
        outputRole: "world-collider-glb",
        downloadAttemptCount: 1,
        stage: "reserved",
        candidate: null,
      }],
    }, budget, marble, "0".repeat(64)))
      .toThrow("GENERATION_RECOVERY_REQUIRED");
  });

  test("inspector descriptor has a domain-separated exact digest", () => {
    const descriptor = requireArtifactInspectorDescriptor({
      schemaVersion: 1,
      inspectorProfile: "spz-v2-position-bounds-v1",
      format: "spz-v2",
      contentDigest: "b".repeat(64),
      byteLength: 1024,
      elementCount: 8,
      sourceBounds: { min: [-1, -2, -3], max: [1, 2, 3] },
    });
    expect(artifactInspectorDescriptorDigest(descriptor)).toMatch(/^[0-9a-f]{64}$/);
    expect(() => requireArtifactInspectorDescriptor({
      ...descriptor,
      inspectorProfile: "glb-2.0-scene-bounds-v1",
    })).toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => requireArtifactInspectorDescriptor({
      ...descriptor,
      sourceBounds: { min: [-1, -2, -3], max: [1, 2, -3] },
    })).toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => requireArtifactInspectorDescriptor({
      ...descriptor,
      sourceBounds: {
        min: [0.12345678901234567, -2, -3],
        max: [1, 2, 3],
      },
    })).toThrow("GENERATION_RECOVERY_REQUIRED");
  });

  test("download candidate binds role, checkpoint, filename and inspector", () => {
    const checkpoint = "c".repeat(64);
    const descriptor = requireArtifactInspectorDescriptor({
      schemaVersion: 1,
      inspectorProfile: "glb-2.0-scene-bounds-v1",
      format: "glb-2.0",
      contentDigest: "d".repeat(64),
      byteLength: 4096,
      elementCount: 12,
      sourceBounds: { min: [0, 0, 0], max: [1, 2, 3] },
    });
    const candidate = {
      candidateName: `object-glb-c1-a1-${checkpoint}.bin`,
      attemptCheckpointRecordDigest: checkpoint,
      fileIdentity: { dev: "1", ino: "2", mode: 0o600, uid: 501, gid: 20 },
      digest: descriptor.contentDigest,
      byteLength: descriptor.byteLength,
      format: descriptor.format,
      elementCount: descriptor.elementCount,
      sourceBounds: descriptor.sourceBounds,
      inspectorDescriptor: descriptor,
      inspectorDescriptorDigest: artifactInspectorDescriptorDigest(descriptor),
    };
    expect(requireDownloadCandidate(candidate, "object-glb", 1, 1, checkpoint))
      .toEqual(candidate);
    expect(() => requireDownloadCandidate({
      ...candidate,
      candidateName: `world-collider-glb-c1-a1-${checkpoint}.bin`,
    }, "object-glb", 1, 1, checkpoint)).toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => requireDownloadCandidate({
      ...candidate,
      inspectorDescriptorDigest: "e".repeat(64),
    }, "object-glb", 1, 1, checkpoint)).toThrow("GENERATION_RECOVERY_REQUIRED");
  });

  test("discard witness is a closed filename and disposition union", () => {
    const checkpoint = "f".repeat(64);
    const basename = `world-spz-500k-c2-a1-${checkpoint}`;
    const witness = {
      outputRole: "world-spz-500k" as const,
      cycleCount: 2 as const,
      downloadAttemptCount: 1 as const,
      attemptCheckpointRecordDigest: checkpoint,
      dataName: `${basename}.next`,
      ownerName: `${basename}.owner`,
      fileIdentity: { dev: "1", ino: "9", mode: 0o600, uid: 501, gid: 20 },
      disposition: {
        kind: "reject-artifact" as const,
        code: "DOWNLOAD_REJECTED" as const,
      },
    };
    expect(requireDownloadDiscardWitness(witness)).toEqual(witness);
    expect(() => requireDownloadDiscardWitness({
      ...witness,
      disposition: { kind: "reject-artifact", code: "PROVIDER_FAILED" },
    })).toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => requireDownloadDiscardWitness({
      ...witness,
      ownerName: `${basename}.owner-copy`,
    })).toThrow("GENERATION_RECOVERY_REQUIRED");
  });

  test("download member transitions bind the reserved record digest", () => {
    const durableIntent = intent("hunyuan-ai3d-v1");
    const initial = createInitialDownloadBudget(durableIntent, {
      cycleCount: 1,
      attemptCount: 3,
      cycleStartedAt: "2026-08-15T10:00:00.000Z",
      deadlineAt: "2026-08-15T10:15:00.000Z",
    });
    const reservePredecessorDigest = "1".repeat(64);
    const reserved = {
      ...initial,
      orderedMembers: [{
        outputRole: "object-glb",
        downloadAttemptCount: 1,
        stage: "reserved",
        candidate: null,
      }],
    };
    expect(requireDownloadBudgetTransition(
      reserved,
      initial,
      durableIntent,
      "0".repeat(64),
    )).toEqual(reserved);
    const basename = `object-glb-c1-a1-${reservePredecessorDigest}`;
    const owned = {
      ...reserved,
      orderedMembers: [{
        outputRole: "object-glb",
        downloadAttemptCount: 1,
        stage: "owned-next",
        attemptCheckpointRecordDigest: reservePredecessorDigest,
        nextName: `${basename}.next`,
        ownerName: `${basename}.owner`,
        fileIdentity: { dev: "1", ino: "2", mode: 0o600, uid: 501, gid: 20 },
        candidate: null,
      }],
    };
    expect(requireDownloadBudgetTransition(
      owned,
      reserved,
      durableIntent,
      reservePredecessorDigest,
    )).toEqual(owned);
    expect(() => requireDownloadBudgetTransition(
      owned,
      reserved,
      durableIntent,
      "2".repeat(64),
    )).toThrow("GENERATION_RECOVERY_REQUIRED");
  });

  test("discard retry and metadata refresh are independently durable", () => {
    const durableIntent = intent("hunyuan-ai3d-v1");
    const checkpoint = "3".repeat(64);
    const basename = `object-glb-c1-a1-${checkpoint}`;
    const base = createInitialDownloadBudget(durableIntent, {
      cycleCount: 1,
      attemptCount: 3,
      cycleStartedAt: "2026-08-15T10:00:00.000Z",
      deadlineAt: "2026-08-15T10:15:00.000Z",
    });
    const owned = {
      ...base,
      orderedMembers: [{
        outputRole: "object-glb",
        downloadAttemptCount: 1,
        stage: "owned-next",
        attemptCheckpointRecordDigest: checkpoint,
        nextName: `${basename}.next`,
        ownerName: `${basename}.owner`,
        fileIdentity: { dev: "1", ino: "2", mode: 0o600, uid: 501, gid: 20 },
        candidate: null,
      }],
    };
    const witness = {
      outputRole: "object-glb",
      cycleCount: 1,
      downloadAttemptCount: 1,
      attemptCheckpointRecordDigest: checkpoint,
      dataName: `${basename}.next`,
      ownerName: `${basename}.owner`,
      fileIdentity: { dev: "1", ino: "2", mode: 0o600, uid: 501, gid: 20 },
      disposition: { kind: "retry-transient" },
    };
    const authorized = {
      ...base,
      orderedMembers: [{
        outputRole: "object-glb",
        downloadAttemptCount: 1,
        stage: "discard-authorized",
        discardWitness: witness,
        candidate: null,
      }],
    };
    expect(requireDownloadBudgetTransition(
      authorized,
      owned,
      durableIntent,
      "4".repeat(64),
    )).toEqual(authorized);
    const discarded = {
      ...base,
      orderedMembers: [{ ...authorized.orderedMembers[0], stage: "discarded" }],
    };
    expect(requireDownloadBudgetTransition(
      discarded,
      authorized,
      durableIntent,
      "5".repeat(64),
    )).toEqual(discarded);
    const retry = {
      ...base,
      orderedMembers: [{
        outputRole: "object-glb",
        downloadAttemptCount: 2,
        stage: "reserved",
        candidate: null,
      }],
    };
    expect(requireDownloadBudgetTransition(
      retry,
      discarded,
      durableIntent,
      "6".repeat(64),
    )).toEqual(retry);
    const refreshed = {
      ...base,
      metadataRefreshCount: 1,
      pollBudget: { ...base.pollBudget, attemptCount: 4 },
    };
    expect(requireDownloadBudgetTransition(
      refreshed,
      base,
      durableIntent,
      "7".repeat(64),
    )).toEqual(refreshed);
  });

  test("successful candidate is introduced once and carried across Marble members", () => {
    const durableIntent = intent("worldlabs-marble-v1");
    const checkpoint = "8".repeat(64);
    const basename = `world-spz-500k-c1-a1-${checkpoint}`;
    const base = createInitialDownloadBudget(durableIntent, {
      cycleCount: 1,
      attemptCount: 5,
      cycleStartedAt: "2026-08-15T10:00:00.000Z",
      deadlineAt: "2026-08-15T10:20:00.000Z",
    });
    const identity = { dev: "1", ino: "4", mode: 0o600, uid: 501, gid: 20 };
    const descriptor = requireArtifactInspectorDescriptor({
      schemaVersion: 1,
      inspectorProfile: "spz-v2-position-bounds-v1",
      format: "spz-v2",
      contentDigest: "9".repeat(64),
      byteLength: 8192,
      elementCount: 24,
      sourceBounds: { min: [-1, -1, -1], max: [1, 1, 1] },
    });
    const candidate = {
      candidateName: `${basename}.bin`,
      attemptCheckpointRecordDigest: checkpoint,
      fileIdentity: identity,
      digest: descriptor.contentDigest,
      byteLength: descriptor.byteLength,
      format: descriptor.format,
      elementCount: descriptor.elementCount,
      sourceBounds: descriptor.sourceBounds,
      inspectorDescriptor: descriptor,
      inspectorDescriptorDigest: artifactInspectorDescriptorDigest(descriptor),
    };
    const owned = {
      ...base,
      orderedMembers: [{
        outputRole: "world-spz-500k",
        downloadAttemptCount: 1,
        stage: "owned-next",
        attemptCheckpointRecordDigest: checkpoint,
        nextName: `${basename}.next`,
        ownerName: `${basename}.owner`,
        fileIdentity: identity,
        candidate: null,
      }, base.orderedMembers[1]],
    };
    const cleanup = {
      ...base,
      orderedMembers: [{
        outputRole: "world-spz-500k",
        downloadAttemptCount: 1,
        stage: "cleanup-authorized",
        ownerName: `${basename}.owner`,
        candidate,
      }, base.orderedMembers[1]],
    };
    expect(requireDownloadBudgetTransition(
      cleanup,
      owned,
      durableIntent,
      "a".repeat(64),
    )).toEqual(cleanup);
    const completed = {
      ...base,
      orderedMembers: [{
        outputRole: "world-spz-500k",
        downloadAttemptCount: 1,
        stage: "candidate",
        candidate,
      }, base.orderedMembers[1]],
    };
    expect(requireDownloadBudgetTransition(
      completed,
      cleanup,
      durableIntent,
      "b".repeat(64),
    )).toEqual(completed);
    const secondReserved = {
      ...completed,
      orderedMembers: [completed.orderedMembers[0], {
        outputRole: "world-collider-glb",
        downloadAttemptCount: 1,
        stage: "reserved",
        candidate: null,
      }],
    };
    expect(requireDownloadBudgetTransition(
      secondReserved,
      completed,
      durableIntent,
      "c".repeat(64),
    )).toEqual(secondReserved);
    expect(() => requireDownloadBudgetTransition({
      ...secondReserved,
      orderedMembers: [{
        ...secondReserved.orderedMembers[0],
        candidate: { ...candidate, digest: "a".repeat(64) },
      }, secondReserved.orderedMembers[1]],
    }, completed, durableIntent, "c".repeat(64)))
      .toThrow("GENERATION_RECOVERY_REQUIRED");
  });

  test("outputs-ready binds remote identity to the current poll budget", () => {
    const durableIntent = intent("worldlabs-marble-v1");
    const remoteBound = {
      provider: "worldlabs-marble-v1" as const,
      remoteJobId: "operation_1",
      providerRequestId: null,
    };
    const pollBudget = {
      cycleCount: 1 as const,
      attemptCount: 6,
      cycleStartedAt: "2026-08-15T10:00:00.000Z",
      deadlineAt: "2026-08-15T10:20:00.000Z",
    };
    const payload = {
      remoteOutputIdentity: {
        kind: "marble-world",
        operationId: "operation_1",
        worldId: "world_1",
        spzKey: "500k",
        colliderField: "collider_mesh_url",
      },
      downloadBudget: createInitialDownloadBudget(durableIntent, pollBudget),
      sanitizedCost: { unit: "worldlabs-credit", amount: "3.5" },
    };
    expect(requireOutputsReadyPayload(
      payload,
      durableIntent,
      remoteBound,
      pollBudget,
    )).toEqual(payload);
    expect(() => requireOutputsReadyPayload({
      ...payload,
      downloadBudget: {
        ...payload.downloadBudget,
        pollBudget: { ...pollBudget, attemptCount: 5 },
      },
    }, durableIntent, remoteBound, pollBudget))
      .toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(requireActiveDownloadPayload({
      remoteOutputIdentity: payload.remoteOutputIdentity,
      downloadBudget: payload.downloadBudget,
    }, durableIntent, remoteBound).downloadBudget).toEqual(payload.downloadBudget);
  });

  test("artifact rejection code must be inherited from its exact witness", () => {
    const checkpoint = "d".repeat(64);
    const basename = `object-glb-c1-a1-${checkpoint}`;
    const witness = {
      outputRole: "object-glb",
      cycleCount: 1,
      downloadAttemptCount: 1,
      attemptCheckpointRecordDigest: checkpoint,
      dataName: `${basename}.bin`,
      ownerName: `${basename}.owner`,
      fileIdentity: { dev: "1", ino: "2", mode: 0o600, uid: 501, gid: 20 },
      disposition: {
        kind: "reject-artifact",
        code: "ARTIFACT_VALIDATION_FAILED",
      },
    };
    expect(requireArtifactRejectedPayload({
      code: "ARTIFACT_VALIDATION_FAILED",
      discardWitness: witness,
    }).code).toBe("ARTIFACT_VALIDATION_FAILED");
    expect(() => requireArtifactRejectedPayload({
      code: "DOWNLOAD_REJECTED",
      discardWitness: witness,
    })).toThrow("GENERATION_RECOVERY_REQUIRED");
  });
});
