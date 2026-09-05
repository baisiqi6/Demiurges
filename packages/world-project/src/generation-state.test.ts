import { describe, expect, test } from "bun:test";

import { canonicalJsonBytes, sha256Hex } from "@demiurges/world";

import {
  GenerationCodecError,
  createGenerationBinding,
  createGenerationIntent,
  requireGenerationRequest,
} from "./generation-contracts";
import {
  createInitialGenerationStateRecord,
  createNextChainedGenerationStateRecord,
  createNextGenerationStateRecord,
  generationStateRecordDigest,
  generationStateRecordFilename,
  requireGenerationStateRecord,
  requireGenerationStateRecordChain,
  type GenerationStateRecordV1,
} from "./generation-state";
import {
  artifactInspectorDescriptorDigest,
  createInitialDownloadBudget,
  requireArtifactInspectorDescriptor,
  type DownloadBudgetV1,
  type DownloadMemberBudgetV1,
} from "./generation-output-contracts";

function intent(provider: "worldlabs-marble-v1" | "hunyuan-ai3d-v1") {
  const prepared = requireGenerationRequest(provider === "worldlabs-marble-v1"
    ? {
        provider,
        model: "marble-1.1",
        prompt: "a mossy stone arch",
        costUnknownAccepted: true,
        waitForCompletionAndDownload: true,
        idempotencyKey: "state-marble",
      }
    : {
        provider,
        model: "3.1",
        prompt: "a mossy stone arch",
        costUnknownAccepted: true,
        waitForCompletionAndDownload: true,
        idempotencyKey: "state-hunyuan",
      });
  const binding = createGenerationBinding(prepared, {
    contractProfile: provider === "worldlabs-marble-v1"
      ? "worldlabs-openapi-2026-08-15-v1"
      : "cloud-response-v1",
    contractShapeDigest: "a".repeat(64),
  });
  return createGenerationIntent(binding, "2026-08-15T10:00:00.000Z");
}

function expectInvalid(action: () => unknown): void {
  expect(action).toThrow(GenerationCodecError);
}

describe("Generation state record codec", () => {
  test("sequence zero is exact admitted and follows the domain-separated digest", () => {
    const durableIntent = intent("worldlabs-marble-v1");
    const record = createInitialGenerationStateRecord(durableIntent);
    expect(record).toEqual({
      schemaVersion: 1,
      generationId: durableIntent.generationId,
      bindingDigest: durableIntent.bindingDigest,
      sequence: 0,
      previousRecordDigest: null,
      state: "admitted",
      payload: {},
      recordedAt: durableIntent.createdAt,
    });
    const expected = sha256Hex(new Uint8Array([
      ...new TextEncoder().encode("demiurges-generation-state-v1\u0000"),
      ...canonicalJsonBytes(record),
    ]));
    expect(generationStateRecordDigest(record)).toBe(expected);
    expect(generationStateRecordFilename(record)).toBe(
      `0000000000000000-${expected}.json`,
    );
    expect(requireGenerationStateRecord(record, durableIntent, null)).toEqual(record);
  });

  test("accepts the legal submit and poll prefix with exact provider binding", () => {
    const durableIntent = intent("hunyuan-ai3d-v1");
    const admitted = createInitialGenerationStateRecord(durableIntent);
    const submit = createNextGenerationStateRecord(
      durableIntent,
      admitted,
      "submit_started",
      { submitAttempt: 1 },
      "2026-08-15T10:00:01.000Z",
    );
    const remote = createNextGenerationStateRecord(
      durableIntent,
      submit,
      "remote_bound",
      {
        provider: "hunyuan-ai3d-v1",
        remoteJobId: "123456",
        providerRequestId: "123e4567-e89b-12d3-a456-426614174000",
      },
      "2026-08-15T10:00:02.000Z",
    );
    const polling = createNextGenerationStateRecord(
      durableIntent,
      remote,
      "polling",
      {
        cycleCount: 1,
        attemptCount: 1,
        cycleStartedAt: "2026-08-15T10:00:02.000Z",
        deadlineAt: "2026-08-15T10:15:02.000Z",
      },
      "2026-08-15T10:00:03.000Z",
    );

    expect(submit.sequence).toBe(1);
    expect(remote.previousRecordDigest).toBe(generationStateRecordDigest(submit));
    expect(polling.sequence).toBe(3);
    expect(requireGenerationStateRecord(polling, durableIntent, remote)).toEqual(polling);
  });

  test("pre-submit blocked can resume to admitted but is bounded", () => {
    const durableIntent = intent("worldlabs-marble-v1");
    const admitted = createInitialGenerationStateRecord(durableIntent);
    const blocked = createNextGenerationStateRecord(
      durableIntent,
      admitted,
      "pre_submit_blocked",
      { code: "CREDENTIAL_UNAVAILABLE", preSubmitResumeCount: 0 },
      "2026-08-15T10:00:01.000Z",
    );
    const resumed = createNextGenerationStateRecord(
      durableIntent,
      blocked,
      "admitted",
      {},
      "2026-08-15T10:00:02.000Z",
    );
    expect(resumed.state).toBe("admitted");
    expectInvalid(() => createNextGenerationStateRecord(
      durableIntent,
      admitted,
      "pre_submit_blocked",
      { code: "PROVIDER_RATE_LIMITED", preSubmitResumeCount: 0 },
      "2026-08-15T10:00:01.000Z",
    ));
  });

  test("submission ambiguity is terminal for automation", () => {
    const durableIntent = intent("hunyuan-ai3d-v1");
    const admitted = createInitialGenerationStateRecord(durableIntent);
    const submit = createNextGenerationStateRecord(
      durableIntent,
      admitted,
      "submit_started",
      { submitAttempt: 1 },
      "2026-08-15T10:00:01.000Z",
    );
    const ambiguous = createNextGenerationStateRecord(
      durableIntent,
      submit,
      "submission_ambiguous",
      { code: "PROVIDER_SUBMISSION_AMBIGUOUS" },
      "2026-08-15T10:00:02.000Z",
    );
    expectInvalid(() => createNextGenerationStateRecord(
      durableIntent,
      ambiguous,
      "submit_started",
      { submitAttempt: 1 },
      "2026-08-15T10:00:03.000Z",
    ));
  });

  test("terminal provider failure keeps only provider-matched settled cost", () => {
    const durableIntent = intent("hunyuan-ai3d-v1");
    const admitted = createInitialGenerationStateRecord(durableIntent);
    const submit = createNextGenerationStateRecord(
      durableIntent,
      admitted,
      "submit_started",
      { submitAttempt: 1 },
      "2026-08-15T10:00:01.000Z",
    );
    expect(createNextGenerationStateRecord(
      durableIntent,
      submit,
      "provider_failed",
      {
        code: "PROVIDER_REJECTED",
        sanitizedCost: { unit: "hunyuan-credit", amount: "3.5" },
      },
      "2026-08-15T10:00:02.000Z",
    ).payload).toEqual({
      code: "PROVIDER_REJECTED",
      sanitizedCost: { unit: "hunyuan-credit", amount: "3.5" },
    });

    const marbleIntent = intent("worldlabs-marble-v1");
    const marbleSubmit = createNextGenerationStateRecord(
      marbleIntent,
      createInitialGenerationStateRecord(marbleIntent),
      "submit_started",
      { submitAttempt: 1 },
      "2026-08-15T10:00:01.000Z",
    );
    expectInvalid(() => createNextGenerationStateRecord(
      marbleIntent,
      marbleSubmit,
      "provider_failed",
      {
        code: "PROVIDER_REJECTED",
        sanitizedCost: { unit: "worldlabs-credit", amount: "3" },
      },
      "2026-08-15T10:00:02.000Z",
    ));
  });

  test("rejects sequence, previous digest, binding and clock drift", () => {
    const durableIntent = intent("worldlabs-marble-v1");
    const admitted = createInitialGenerationStateRecord(durableIntent);
    const submit = createNextGenerationStateRecord(
      durableIntent,
      admitted,
      "submit_started",
      { submitAttempt: 1 },
      "2026-08-15T10:00:01.000Z",
    );
    expectInvalid(() => requireGenerationStateRecord(
      { ...submit, sequence: 9 },
      durableIntent,
      admitted,
    ));
    expectInvalid(() => requireGenerationStateRecord(
      { ...submit, previousRecordDigest: "0".repeat(64) },
      durableIntent,
      admitted,
    ));
    expectInvalid(() => requireGenerationStateRecord(
      { ...submit, bindingDigest: "0".repeat(64) },
      durableIntent,
      admitted,
    ));
    expectInvalid(() => createNextGenerationStateRecord(
      durableIntent,
      submit,
      "remote_bound",
      {
        provider: "worldlabs-marble-v1",
        remoteJobId: "op_123",
        providerRequestId: null,
      },
      "2026-08-15T09:59:59.000Z",
    ));
  });

  test("rejects provider-crossed remote binding and poll budgets", () => {
    const durableIntent = intent("worldlabs-marble-v1");
    const admitted = createInitialGenerationStateRecord(durableIntent);
    const submit = createNextGenerationStateRecord(
      durableIntent,
      admitted,
      "submit_started",
      { submitAttempt: 1 },
      "2026-08-15T10:00:01.000Z",
    );
    expectInvalid(() => createNextGenerationStateRecord(
      durableIntent,
      submit,
      "remote_bound",
      {
        provider: "hunyuan-ai3d-v1",
        remoteJobId: "123",
        providerRequestId: "123e4567-e89b-12d3-a456-426614174000",
      },
      "2026-08-15T10:00:02.000Z",
    ));
    const remote = createNextGenerationStateRecord(
      durableIntent,
      submit,
      "remote_bound",
      {
        provider: "worldlabs-marble-v1",
        remoteJobId: "operation_123",
        providerRequestId: null,
      },
      "2026-08-15T10:00:02.000Z",
    );
    expectInvalid(() => createNextGenerationStateRecord(
      durableIntent,
      remote,
      "polling",
      {
        cycleCount: 1,
        attemptCount: 81,
        cycleStartedAt: "2026-08-15T10:00:02.000Z",
        deadlineAt: "2026-08-15T10:20:02.000Z",
      },
      "2026-08-15T10:00:03.000Z",
    ));
  });
});

const POLL_BUDGET = {
  cycleCount: 1 as const,
  attemptCount: 6,
  cycleStartedAt: "2026-08-15T10:00:02.000Z",
  deadlineAt: "2026-08-15T10:20:02.000Z",
};

function timestamp(second: number): string {
  return `2026-08-15T10:00:${String(second).padStart(2, "0")}.000Z`;
}

interface OutputChainFixture {
  readonly intent: ReturnType<typeof intent>;
  readonly chain: GenerationStateRecordV1[];
  readonly identity: Record<string, unknown>;
  budget: DownloadBudgetV1;
}

function startOutputChain(
  provider: "worldlabs-marble-v1" | "hunyuan-ai3d-v1",
  remoteJobId: string,
  identity: Record<string, unknown>,
  pollBudgetOverride?: typeof POLL_BUDGET,
): OutputChainFixture {
  const durableIntent = intent(provider);
  const admitted = createInitialGenerationStateRecord(durableIntent);
  const submit = createNextGenerationStateRecord(
    durableIntent,
    admitted,
    "submit_started",
    { submitAttempt: 1 },
    timestamp(1),
  );
  const remoteBoundPayload = provider === "worldlabs-marble-v1"
    ? { provider, remoteJobId, providerRequestId: null }
    : { provider, remoteJobId, providerRequestId: "123e4567-e89b-12d3-a456-426614174000" };
  const remote = createNextGenerationStateRecord(
    durableIntent,
    submit,
    "remote_bound",
    remoteBoundPayload,
    timestamp(2),
  );
  const pollingPayload = pollBudgetOverride ?? POLL_BUDGET;
  const polling = createNextGenerationStateRecord(
    durableIntent,
    remote,
    "polling",
    pollingPayload,
    timestamp(3),
  );
  const downloadBudget = createInitialDownloadBudget(durableIntent, pollingPayload);
  const outputsReadyPayload = {
    remoteOutputIdentity: identity,
    downloadBudget,
    ...(provider === "hunyuan-ai3d-v1"
      ? { sanitizedCost: { unit: "hunyuan-credit", amount: "3.5" } }
      : {}),
  };
  const outputsReady = createNextChainedGenerationStateRecord(
    durableIntent,
    [admitted, submit, remote, polling],
    "outputs_ready",
    outputsReadyPayload,
    timestamp(4),
  );
  return {
    intent: durableIntent,
    chain: [admitted, submit, remote, polling, outputsReady],
    identity,
    budget: downloadBudget as unknown as DownloadBudgetV1,
  };
}

function withMember(
  budget: DownloadBudgetV1,
  index: number,
  member: DownloadMemberBudgetV1,
): DownloadBudgetV1 {
  return {
    ...budget,
    orderedMembers: budget.orderedMembers.map((existing, position) =>
      position === index ? member : existing),
  };
}

function reservedMember(role: string): Record<string, unknown> {
  return { outputRole: role, downloadAttemptCount: 1, stage: "reserved", candidate: null };
}

function ownedMember(
  role: string,
  checkpoint: string,
  ino: number,
): Record<string, unknown> {
  const basename = `${role}-c1-a1-${checkpoint}`;
  return {
    outputRole: role,
    downloadAttemptCount: 1,
    stage: "owned-next",
    attemptCheckpointRecordDigest: checkpoint,
    nextName: `${basename}.next`,
    ownerName: `${basename}.owner`,
    fileIdentity: { dev: "1", ino: String(ino), mode: 0o600, uid: 501, gid: 20 },
    candidate: null,
  };
}

function candidateFixture(
  role: "world-spz-500k" | "world-collider-glb" | "object-glb",
  checkpoint: string,
  seed: string,
  ino: number,
): Record<string, unknown> {
  const descriptor = requireArtifactInspectorDescriptor({
    schemaVersion: 1,
    inspectorProfile: role === "world-spz-500k"
      ? "spz-v2-position-bounds-v1"
      : "glb-2.0-scene-bounds-v1",
    format: role === "world-spz-500k" ? "spz-v2" : "glb-2.0",
    contentDigest: seed.repeat(64),
    byteLength: 8192,
    elementCount: 24,
    sourceBounds: { min: [-1, -1, -1], max: [1, 1, 1] },
  });
  return {
    candidateName: `${role}-c1-a1-${checkpoint}.bin`,
    attemptCheckpointRecordDigest: checkpoint,
    fileIdentity: { dev: "1", ino: String(ino), mode: 0o600, uid: 501, gid: 20 },
    digest: descriptor.contentDigest,
    byteLength: descriptor.byteLength,
    format: descriptor.format,
    elementCount: descriptor.elementCount,
    sourceBounds: descriptor.sourceBounds,
    inspectorDescriptor: descriptor,
    inspectorDescriptorDigest: artifactInspectorDescriptorDigest(descriptor),
  };
}

function cleanupMember(
  role: string,
  checkpoint: string,
  candidate: Record<string, unknown>,
): Record<string, unknown> {
  return {
    outputRole: role,
    downloadAttemptCount: 1,
    stage: "cleanup-authorized",
    ownerName: `${role}-c1-a1-${checkpoint}.owner`,
    candidate,
  };
}

function candidateMember(
  role: string,
  candidate: Record<string, unknown>,
): Record<string, unknown> {
  return { outputRole: role, downloadAttemptCount: 1, stage: "candidate", candidate };
}

function appendDownloadRecord(
  fixture: OutputChainFixture,
  budget: DownloadBudgetV1,
  second: number,
): GenerationStateRecordV1 {
  const record = createNextChainedGenerationStateRecord(
    fixture.intent,
    fixture.chain,
    "downloading",
    { remoteOutputIdentity: fixture.identity, downloadBudget: budget },
    timestamp(second),
  );
  fixture.chain.push(record);
  fixture.budget = budget;
  return record;
}

/** Marble 成功路径：两个 provider-required member 全部走完 candidate。 */
function marbleCandidateFixture(): {
  fixture: OutputChainFixture;
  validating: GenerationStateRecordV1;
} {
  const identity = {
    kind: "marble-world",
    operationId: "operation_1",
    worldId: "world_1",
    spzKey: "500k",
    colliderField: "collider_mesh_url",
  };
  const fixture = startOutputChain("worldlabs-marble-v1", "operation_1", identity);
  appendDownloadRecord(fixture, fixture.budget, 5);
  appendDownloadRecord(fixture, withMember(fixture.budget, 0, reservedMember("world-spz-500k")), 6);
  const spzCheckpoint = generationStateRecordDigest(fixture.chain[fixture.chain.length - 1]!);
  const spzCandidate = candidateFixture("world-spz-500k", spzCheckpoint, "9", 4);
  appendDownloadRecord(fixture, withMember(fixture.budget, 0, ownedMember("world-spz-500k", spzCheckpoint, 4)), 7);
  appendDownloadRecord(fixture, withMember(fixture.budget, 0, cleanupMember("world-spz-500k", spzCheckpoint, spzCandidate)), 8);
  appendDownloadRecord(fixture, withMember(fixture.budget, 0, candidateMember("world-spz-500k", spzCandidate)), 9);
  appendDownloadRecord(fixture, withMember(fixture.budget, 1, reservedMember("world-collider-glb")), 10);
  const glbCheckpoint = generationStateRecordDigest(fixture.chain[fixture.chain.length - 1]!);
  const glbCandidate = candidateFixture("world-collider-glb", glbCheckpoint, "e", 5);
  appendDownloadRecord(fixture, withMember(fixture.budget, 1, ownedMember("world-collider-glb", glbCheckpoint, 5)), 11);
  appendDownloadRecord(fixture, withMember(fixture.budget, 1, cleanupMember("world-collider-glb", glbCheckpoint, glbCandidate)), 12);
  appendDownloadRecord(fixture, withMember(fixture.budget, 1, candidateMember("world-collider-glb", glbCandidate)), 13);
  const validating = createNextChainedGenerationStateRecord(
    fixture.intent,
    fixture.chain,
    "validating",
    { remoteOutputIdentity: fixture.identity, downloadBudget: fixture.budget },
    timestamp(14),
  );
  return { fixture, validating };
}

describe("Generation output state chain through validating", () => {
  test("valid Marble chain reaches an all-candidate validating head with exact digests", () => {
    const { fixture, validating } = marbleCandidateFixture();
    expect(validating.sequence).toBe(14);
    expect(validating.state).toBe("validating");
    const decoded = requireGenerationStateRecordChain(
      [...fixture.chain, validating],
      fixture.intent,
    );
    expect(decoded).toHaveLength(15);
    expect(decoded[decoded.length - 1]).toEqual(validating);
    const digest = generationStateRecordDigest(validating);
    expect(generationStateRecordFilename(validating)).toBe(
      `${"0".repeat(14)}14-${digest}.json`,
    );
    const outputsReady = fixture.chain[4]!;
    expect(outputsReady.state).toBe("outputs_ready");
    expect(generationStateRecordFilename(outputsReady)).toBe(
      `${"0".repeat(15)}4-${generationStateRecordDigest(outputsReady)}.json`,
    );
    const budget = validating.payload.downloadBudget as DownloadBudgetV1;
    expect(budget.orderedMembers.map((member) => member.stage)).toEqual([
      "candidate",
      "candidate",
    ]);
  });

  test("valid Hunyuan chain reaches validating with a single object-glb candidate", () => {
    const identity = {
      kind: "hunyuan-file-set",
      jobId: "123456",
      glbCount: 1,
      objCount: 0,
    };
    const fixture = startOutputChain("hunyuan-ai3d-v1", "123456", identity);
    appendDownloadRecord(fixture, fixture.budget, 5);
    appendDownloadRecord(fixture, withMember(fixture.budget, 0, reservedMember("object-glb")), 6);
    const checkpoint = generationStateRecordDigest(fixture.chain[fixture.chain.length - 1]!);
    const candidate = candidateFixture("object-glb", checkpoint, "6", 2);
    appendDownloadRecord(fixture, withMember(fixture.budget, 0, ownedMember("object-glb", checkpoint, 2)), 7);
    appendDownloadRecord(fixture, withMember(fixture.budget, 0, cleanupMember("object-glb", checkpoint, candidate)), 8);
    appendDownloadRecord(fixture, withMember(fixture.budget, 0, candidateMember("object-glb", candidate)), 9);
    const validating = createNextChainedGenerationStateRecord(
      fixture.intent,
      fixture.chain,
      "validating",
      { remoteOutputIdentity: fixture.identity, downloadBudget: fixture.budget },
      timestamp(10),
    );
    expect(validating.sequence).toBe(10);
    expect(requireGenerationStateRecordChain([...fixture.chain, validating], fixture.intent))
      .toHaveLength(11);
  });

  test("outputs_ready requires a durable remote-bound ancestor and exact poll binding", () => {
    const identity = {
      kind: "marble-world",
      operationId: "operation_1",
      worldId: "world_1",
      spzKey: "500k",
      colliderField: "collider_mesh_url",
    };
    const fixture = startOutputChain("worldlabs-marble-v1", "operation_1", identity);
    const outputsReady = fixture.chain[4]!;
    // pairwise decoder 没有 chain 上下文，必须拒绝新状态 record。
    expectInvalid(() => requireGenerationStateRecord(
      outputsReady,
      fixture.intent,
      fixture.chain[3]!,
    ));
    // 缺少 durable remote_bound/polling ancestor 的伪造链。
    const forged = {
      schemaVersion: 1,
      generationId: fixture.intent.generationId,
      bindingDigest: fixture.intent.bindingDigest,
      sequence: 2,
      previousRecordDigest: generationStateRecordDigest(fixture.chain[1]!),
      state: "outputs_ready",
      payload: outputsReady.payload,
      recordedAt: timestamp(2),
    };
    expectInvalid(() => requireGenerationStateRecordChain(
      [fixture.chain[0], fixture.chain[1], forged],
      fixture.intent,
    ));
    // job identity 漂移。
    expectInvalid(() => startOutputChain(
      "worldlabs-marble-v1",
      "operation_1",
      { ...identity, operationId: "operation_2" },
    ));
    // provider 漂移：Marble binding 不能携带 hunyuan-file-set identity。
    expectInvalid(() => startOutputChain("worldlabs-marble-v1", "123456", {
      kind: "hunyuan-file-set",
      jobId: "123456",
      glbCount: 1,
      objCount: 0,
    }));
    // poll-budget 漂移：outputs_ready 的 downloadBudget 不继承 immediate polling payload。
    expectInvalid(() => createNextChainedGenerationStateRecord(
      fixture.intent,
      fixture.chain.slice(0, 4),
      "outputs_ready",
      {
        remoteOutputIdentity: identity,
        downloadBudget: createInitialDownloadBudget(
          fixture.intent,
          { ...POLL_BUDGET, attemptCount: 5 },
        ),
      },
      timestamp(4),
    ));
  });

  test("outputs_ready -> downloading only carries the unchanged initial budget", () => {
    const identity = {
      kind: "marble-world",
      operationId: "operation_1",
      worldId: "world_1",
      spzKey: "500k",
      colliderField: "collider_mesh_url",
    };
    const fixture = startOutputChain("worldlabs-marble-v1", "operation_1", identity);
    const bothReserved = withMember(
      withMember(fixture.budget, 0, reservedMember("world-spz-500k")),
      1,
      reservedMember("world-collider-glb"),
    );
    expectInvalid(() => createNextChainedGenerationStateRecord(
      fixture.intent,
      fixture.chain,
      "downloading",
      { remoteOutputIdentity: fixture.identity, downloadBudget: bothReserved },
      timestamp(5),
    ));
    expectInvalid(() => createNextChainedGenerationStateRecord(
      fixture.intent,
      fixture.chain,
      "downloading",
      {
        remoteOutputIdentity: fixture.identity,
        downloadBudget: withMember(fixture.budget, 0, reservedMember("world-spz-500k")),
      },
      timestamp(5),
    ));
  });

  test("downloading -> downloading enforces one exact member transition", () => {
    const identity = {
      kind: "marble-world",
      operationId: "operation_1",
      worldId: "world_1",
      spzKey: "500k",
      colliderField: "collider_mesh_url",
    };
    const fixture = startOutputChain("worldlabs-marble-v1", "operation_1", identity);
    appendDownloadRecord(fixture, fixture.budget, 5);
    // remote-output identity 漂移。
    expectInvalid(() => createNextChainedGenerationStateRecord(
      fixture.intent,
      fixture.chain,
      "downloading",
      {
        remoteOutputIdentity: { ...identity, worldId: "world_2" },
        downloadBudget: withMember(fixture.budget, 0, reservedMember("world-spz-500k")),
      },
      timestamp(6),
    ));
    // 两个 member 同时变化。
    const bothReserved = withMember(
      withMember(fixture.budget, 0, reservedMember("world-spz-500k")),
      1,
      reservedMember("world-collider-glb"),
    );
    expectInvalid(() => createNextChainedGenerationStateRecord(
      fixture.intent,
      fixture.chain,
      "downloading",
      { remoteOutputIdentity: fixture.identity, downloadBudget: bothReserved },
      timestamp(6),
    ));
    // 非法 stage 跳变：idle 直接 owned-next。
    expectInvalid(() => createNextChainedGenerationStateRecord(
      fixture.intent,
      fixture.chain,
      "downloading",
      {
        remoteOutputIdentity: fixture.identity,
        downloadBudget: withMember(
          fixture.budget,
          0,
          ownedMember("world-spz-500k", generationStateRecordDigest(fixture.chain[fixture.chain.length - 1]!), 4),
        ),
      },
      timestamp(6),
    ));
    // 错误 checkpoint digest：owned-next 未指向 immediate reserved record。
    appendDownloadRecord(fixture, withMember(fixture.budget, 0, reservedMember("world-spz-500k")), 6);
    expectInvalid(() => createNextChainedGenerationStateRecord(
      fixture.intent,
      fixture.chain,
      "downloading",
      {
        remoteOutputIdentity: fixture.identity,
        downloadBudget: withMember(fixture.budget, 0, ownedMember("world-spz-500k", "0".repeat(64), 4)),
      },
      timestamp(7),
    ));
    // candidate 漂移：candidate stage 的 member bytes 改变不是合法 transition。
    const reservedRecord = fixture.chain[fixture.chain.length - 1]!;
    const checkpoint = generationStateRecordDigest(reservedRecord);
    const spzCandidate = candidateFixture("world-spz-500k", checkpoint, "9", 4);
    appendDownloadRecord(fixture, withMember(fixture.budget, 0, ownedMember("world-spz-500k", checkpoint, 4)), 7);
    appendDownloadRecord(fixture, withMember(fixture.budget, 0, cleanupMember("world-spz-500k", checkpoint, spzCandidate)), 8);
    appendDownloadRecord(fixture, withMember(fixture.budget, 0, candidateMember("world-spz-500k", spzCandidate)), 9);
    expectInvalid(() => createNextChainedGenerationStateRecord(
      fixture.intent,
      fixture.chain,
      "downloading",
      {
        remoteOutputIdentity: fixture.identity,
        downloadBudget: withMember(fixture.budget, 0, candidateMember(
          "world-spz-500k",
          { ...spzCandidate, digest: "a".repeat(64) },
        )),
      },
      timestamp(10),
    ));
    // candidate 回滚：candidate -> cleanup-authorized 不存在。
    expectInvalid(() => createNextChainedGenerationStateRecord(
      fixture.intent,
      fixture.chain,
      "downloading",
      {
        remoteOutputIdentity: fixture.identity,
        downloadBudget: withMember(
          fixture.budget,
          0,
          cleanupMember("world-spz-500k", checkpoint, spzCandidate),
        ),
      },
      timestamp(10),
    ));
  });

  test("downloading -> validating requires the byte-exact all-candidate payload", () => {
    const { fixture, validating } = marbleCandidateFixture();
    const budget = validating.payload.downloadBudget as DownloadBudgetV1;
    // 非 candidate member（回到 m1 reserved）不可进入 validating。
    expectInvalid(() => createNextChainedGenerationStateRecord(
      fixture.intent,
      fixture.chain.slice(0, -1),
      "validating",
      {
        remoteOutputIdentity: fixture.identity,
        downloadBudget: withMember(budget, 1, reservedMember("world-collider-glb")),
      },
      timestamp(13),
    ));
    // payload 改变（candidate digest 漂移）不可进入 validating。
    expectInvalid(() => createNextChainedGenerationStateRecord(
      fixture.intent,
      fixture.chain,
      "validating",
      {
        remoteOutputIdentity: fixture.identity,
        downloadBudget: withMember(budget, 1, candidateMember(
          "world-collider-glb",
          { ...(budget.orderedMembers[1]!.candidate as Record<string, unknown>), digest: "b".repeat(64) },
        )),
      },
      timestamp(14),
    ));
    // payload 改变（remote output identity 漂移）不可进入 validating。
    expectInvalid(() => createNextChainedGenerationStateRecord(
      fixture.intent,
      fixture.chain,
      "validating",
      {
        remoteOutputIdentity: { ...fixture.identity, worldId: "world_2" },
        downloadBudget: budget,
      },
      timestamp(14),
    ));
  });

  test("forged self-consistent later records cannot bypass the durable chain", () => {
    const { fixture, validating } = marbleCandidateFixture();
    // 直接把 all-candidate validating record 伪接到 outputs_ready 之后。
    const forged = {
      schemaVersion: 1,
      generationId: fixture.intent.generationId,
      bindingDigest: fixture.intent.bindingDigest,
      sequence: 5,
      previousRecordDigest: generationStateRecordDigest(fixture.chain[4]!),
      state: "validating",
      payload: validating.payload,
      recordedAt: timestamp(5),
    };
    expectInvalid(() => requireGenerationStateRecordChain(
      [...fixture.chain.slice(0, 5), forged],
      fixture.intent,
    ));
    // validating 不可回到 downloading。
    expectInvalid(() => createNextChainedGenerationStateRecord(
      fixture.intent,
      [...fixture.chain, validating],
      "downloading",
      { remoteOutputIdentity: fixture.identity, downloadBudget: fixture.budget },
      timestamp(15),
    ));
  });
});

describe("Generation publishing state after validating", () => {
  const PUBLISHING_OPERATION_ID = `op:${"a".repeat(64)}`;
  const PUBLISHING_PAYLOAD = {
    operationId: PUBLISHING_OPERATION_ID,
    artifactSetDigest: "b".repeat(64),
  };

  test("validating -> publishing carries the exact plan-derived payload", () => {
    const { fixture, validating } = marbleCandidateFixture();
    const publishing = createNextChainedGenerationStateRecord(
      fixture.intent,
      [...fixture.chain, validating],
      "publishing",
      PUBLISHING_PAYLOAD,
      timestamp(15),
    );
    expect(publishing.sequence).toBe(15);
    expect(publishing.state).toBe("publishing");
    expect(publishing.payload).toEqual(PUBLISHING_PAYLOAD);
    expect(publishing.previousRecordDigest).toBe(
      generationStateRecordDigest(validating),
    );
    const decoded = requireGenerationStateRecordChain(
      [...fixture.chain, validating, publishing],
      fixture.intent,
    );
    expect(decoded[decoded.length - 1]).toEqual(publishing);
  });

  test("publishing payload rejects unknown keys and malformed identities", () => {
    const { fixture, validating } = marbleCandidateFixture();
    const chain = [...fixture.chain, validating];
    expectInvalid(() => createNextChainedGenerationStateRecord(
      fixture.intent,
      chain,
      "publishing",
      { ...PUBLISHING_PAYLOAD, extra: 1 },
      timestamp(15),
    ));
    expectInvalid(() => createNextChainedGenerationStateRecord(
      fixture.intent,
      chain,
      "publishing",
      { ...PUBLISHING_PAYLOAD, artifactSetDigest: "B".repeat(64) },
      timestamp(15),
    ));
    expectInvalid(() => createNextChainedGenerationStateRecord(
      fixture.intent,
      chain,
      "publishing",
      {
        ...PUBLISHING_PAYLOAD,
        artifactSetDigest: "b".repeat(63),
      },
      timestamp(15),
    ));
    for (const operationId of ["not-op-prefixed", "op:", `op:${"a".repeat(128)}`]) {
      expectInvalid(() => createNextChainedGenerationStateRecord(
        fixture.intent,
        chain,
        "publishing",
        { operationId, artifactSetDigest: "b".repeat(64) },
        timestamp(15),
      ));
    }
  });

  test("publishing only advances to exact terminal verified", () => {
    const { fixture, validating } = marbleCandidateFixture();
    const chain = [...fixture.chain, validating];
    const publishing = createNextChainedGenerationStateRecord(
      fixture.intent,
      chain,
      "publishing",
      PUBLISHING_PAYLOAD,
      timestamp(15),
    );
    // 非 validating 前驱（如 downloading）不可直接进入 publishing。
    expectInvalid(() => createNextChainedGenerationStateRecord(
      fixture.intent,
      fixture.chain,
      "publishing",
      PUBLISHING_PAYLOAD,
      timestamp(14),
    ));
    const verifiedPayload = {
      artifactSetDigest: PUBLISHING_PAYLOAD.artifactSetDigest,
      publicationOperationId: PUBLISHING_OPERATION_ID,
    };
    const verified = createNextChainedGenerationStateRecord(
      fixture.intent,
      [...chain, publishing],
      "verified",
      verifiedPayload,
      timestamp(16),
    );
    expect(verified.payload).toEqual(verifiedPayload);
    // 非 publishing 前驱不可直接进入 verified。
    expectInvalid(() => createNextChainedGenerationStateRecord(
      fixture.intent,
      chain,
      "verified",
      verifiedPayload,
      timestamp(16),
    ));
    // `verified` terminal，且 payload exact/lowercase。
    for (const payload of [
      { ...verifiedPayload, extra: 1 },
      { ...verifiedPayload, artifactSetDigest: "B".repeat(64) },
      { ...verifiedPayload, artifactSetDigest: "b".repeat(63) },
      { ...verifiedPayload, publicationOperationId: `op:${"A".repeat(64)}` },
      { ...verifiedPayload, publicationOperationId: "not-an-operation" },
    ]) {
      expectInvalid(() => createNextChainedGenerationStateRecord(
        fixture.intent,
        [...chain, publishing],
        "verified",
        payload,
        timestamp(16),
      ));
    }
    for (const state of [
      "publishing",
      "verified",
      "downloading",
      "validating",
      "recovery_required",
    ] as const) {
      expectInvalid(() => createNextChainedGenerationStateRecord(
        fixture.intent,
        [...chain, publishing, verified],
        state,
        state === "recovery_required"
          ? { code: "GENERATION_RECOVERY_REQUIRED" }
          : verifiedPayload,
        timestamp(17),
      ));
    }
  });
});
