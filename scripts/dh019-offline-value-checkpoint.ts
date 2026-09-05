import {
  canonicalJsonBytes,
  deepFreeze,
  evaluateArticulatedReach,
  requireWorldRunInput,
  RuntimeMvpHost,
  TWO_JOINT_REACH_FIXTURE_ID,
  WorldToolSurface,
  sha256Hex,
  type WorldRunResult,
} from "../packages/world/src/index";
import type { EndEffectorReachEvaluationRecord } from "../packages/world/src/kernel/types";
import { deriveArticulatedReachRepair } from "../packages/world/src/authoring/derive-articulated-reach-repair";

export const DH019_TOOL_SEQUENCE = Object.freeze([
  "world_write", "world_read", "world_edit", "world_run", "world_read", "world_run",
] as const);
const ZERO_RUN_ID = "run:dh019-zero" as const;
const CORRECTED_RUN_ID = "run:dh019-corrected" as const;
const FIXTURE_ID = TWO_JOINT_REACH_FIXTURE_ID;
const SCENARIO_ID = "scenario:two-joint-planar-reach-v1" as const;
const EVIDENCE_FIELDS = Object.freeze([
  "supportSamples", "maxPositionErrorMeters", "maxJointSpeedRadiansPerSecond",
] as const);
const RUNTIME_PROFILE_ID = "runtime:mujoco-wasm-single-3.11.0" as const;
const RUNTIME_EVIDENCE = Object.freeze({
  provider: "MuJoCo WASM",
  version: "3.11.0",
  modelFormat: "MJCF" as const,
  modelCausalDigest: "sha256:c628cb3962efa2eeca87f75934814525f5084a972a95a274771f97c1024d001c" as const,
});
const EPISODE_CONTENT_DIGESTS = Object.freeze({
  zero: Object.freeze({
    samples: "cf1dc2037ed50fb63637cad527fc42647419e5599433bc0a732d05c7684205da",
    terminal: "9e3d1387091783e1dd9601c45cbd2f4302c0c86e6c2a29c2d707e53b45d0367d",
  }),
  corrected: Object.freeze({
    samples: "108cca86c359770650d3f97eec4e34239506dce41e1696e3230e194a053e6254",
    terminal: "d96c7bb7fa0b782321d504fd346bd113cc12251d261c0420c63e4799c1e97507",
  }),
});

function program(shoulder: number, elbow: number) {
  return deepFreeze({
    kind: "actuator-sequence" as const,
    targetRef: "entity:arm" as const,
    durationSeconds: 3,
    sampleRateHz: 30,
    steps: [{ timeSeconds: 0, commands: [
      { actuatorRef: "actuator:arm-shoulder-position" as const, valueRadians: shoulder },
      { actuatorRef: "actuator:arm-elbow-position" as const, valueRadians: elbow },
    ] }],
  });
}
export const DH019_ZERO_PROGRAM = program(0, 0);
const CORRECTED_PROGRAM = program(0.65, -1);
const ZERO_CANONICAL = requireWorldRunInput({ runId: ZERO_RUN_ID, program: DH019_ZERO_PROGRAM }).program;
const CORRECTED_CANONICAL = requireWorldRunInput({ runId: CORRECTED_RUN_ID, program: CORRECTED_PROGRAM }).program;
const ZERO_EPISODE_ID = `episode:10-dh019-zero-6-edit-1-${ZERO_CANONICAL.id.slice("program:sha256:".length)}`;
const CORRECTED_EPISODE_ID = `episode:15-dh019-corrected-6-edit-1-${CORRECTED_CANONICAL.id.slice("program:sha256:".length)}`;

export interface OfflineValueCheckpointReceiptV1 {
  readonly schemaVersion: 1;
  readonly status: "offline-proven";
  readonly fixtureId: typeof FIXTURE_ID;
  readonly scenarioId: typeof SCENARIO_ID;
  readonly runIds: readonly [typeof ZERO_RUN_ID, typeof CORRECTED_RUN_ID];
  readonly traceDigest: `trace:sha256:${string}`;
  readonly toolSequence: typeof DH019_TOOL_SEQUENCE;
  readonly episodeIds: readonly [string, string];
  readonly evaluationIds: readonly [string, string];
  readonly firstOutcome: "FAIL";
  readonly secondOutcome: "PASS";
  readonly repairCount: 1;
  readonly evidenceFieldsUsed: typeof EVIDENCE_FIELDS;
  readonly replayDigest: `replay:sha256:${string}`;
}

function domainDigest(domain: string, value: unknown): string {
  const prefix = new TextEncoder().encode(domain);
  const content = canonicalJsonBytes(value);
  const bytes = new Uint8Array(prefix.length + content.length);
  bytes.set(prefix);
  bytes.set(content, prefix.length);
  return sha256Hex(bytes);
}

function requireRunEvidence(result: WorldRunResult, corrected: boolean): EndEffectorReachEvaluationRecord {
  const episodeId = corrected ? CORRECTED_EPISODE_ID : ZERO_EPISODE_ID;
  const programId = corrected ? CORRECTED_CANONICAL.id : ZERO_CANONICAL.id;
  const evaluation = result.evaluation;
  const recomputed = evaluateArticulatedReach(result.episode);
  if (
    result.episode.id !== episodeId ||
    result.episode.scenarioId !== SCENARIO_ID ||
    result.episode.baseSnapshotId !== "snapshot:edit-1" ||
    result.episode.program.id !== programId ||
    result.episode.explicitInputs.runId !== (corrected ? CORRECTED_RUN_ID : ZERO_RUN_ID) ||
    result.episode.runtimeProfileId !== RUNTIME_PROFILE_ID ||
    JSON.stringify(result.episode.runtimeEvidence) !== JSON.stringify(RUNTIME_EVIDENCE) ||
    sha256Hex(canonicalJsonBytes(result.episode.samples)) !== (corrected ? EPISODE_CONTENT_DIGESTS.corrected.samples : EPISODE_CONTENT_DIGESTS.zero.samples) ||
    sha256Hex(canonicalJsonBytes(result.episode.terminalSnapshot)) !== (corrected ? EPISODE_CONTENT_DIGESTS.corrected.terminal : EPISODE_CONTENT_DIGESTS.zero.terminal) ||
    result.episode.samples.length !== 91 ||
    result.baseRef.snapshotId !== "snapshot:edit-1" || result.baseRef.version !== 2 ||
    evaluation.evaluatorId !== "evaluator:end-effector-reach-v1" ||
    evaluation.contractId !== "success:end-effector-reaches-frame" ||
    evaluation.episodeId !== episodeId ||
    evaluation.id !== `evaluation:${episodeId.slice("episode:".length)}:end-effector-reach-v1` ||
    new TextDecoder().decode(canonicalJsonBytes(evaluation)) !== new TextDecoder().decode(canonicalJsonBytes(recomputed))
  ) throw new Error("DH-019 Episode/Evaluation identity 不匹配");
  if (
    evaluation.passed !== corrected ||
    evaluation.metrics.requiredSupportSamples !== 16 ||
    evaluation.metrics.supportSamples !== (corrected ? 16 : 0) ||
    evaluation.metrics.maxPositionErrorMeters !== (corrected ? 0.00000179062757188384 : 0.226543641354435) ||
    evaluation.metrics.maxJointSpeedRadiansPerSecond !== (corrected ? 0.0000390513154170192 : 0)
  ) throw new Error("DH-019 Evaluation metrics 不匹配");
  return evaluation;
}

export function deriveCorrectedProgramFromEvidence(first: WorldRunResult, read: { ref: WorldRunResult["baseRef"]; snapshot: WorldRunResult["episode"]["terminalSnapshot"] }) {
  requireRunEvidence(first, false);
  const proposal = deriveArticulatedReachRepair(read, first, CORRECTED_RUN_ID);
  if (proposal.status !== "available") throw new Error("DH-019 evidence-derived repair unavailable");
  const { id: _id, ...content } = proposal.program;
  return content;
}

function tracePreimage() {
  const { id: zeroId, ...zeroContent } = ZERO_CANONICAL;
  const { id: correctedId, ...correctedContent } = CORRECTED_CANONICAL;
  return {
    fixtureId: FIXTURE_ID, scenarioId: SCENARIO_ID,
    runIds: [ZERO_RUN_ID, CORRECTED_RUN_ID],
    programs: [{ content: zeroContent, id: zeroId }, { content: correctedContent, id: correctedId }],
    toolSequence: DH019_TOOL_SEQUENCE,
  };
}

export async function runOfflineValueCheckpoint(): Promise<OfflineValueCheckpointReceiptV1> {
  const host = new RuntimeMvpHost();
  const tools = new WorldToolSurface(host);
  const written = tools.write({ fixtureId: FIXTURE_ID });
  const firstRead = tools.read();
  const edited = tools.edit({
    expected: firstRead.ref, targetRef: "entity:arm",
    change: { kind: "joint-state", joints: [
      { jointRef: "joint:arm-shoulder", positionRadians: 0, velocityRadiansPerSecond: 0 },
      { jointRef: "joint:arm-elbow", positionRadians: 0, velocityRadiansPerSecond: 0 },
    ] },
  });
  const first = await tools.run({ runId: ZERO_RUN_ID, program: DH019_ZERO_PROGRAM });
  const secondRead = tools.read();
  const corrected = deriveCorrectedProgramFromEvidence(first, secondRead);
  if (
    written.ref.version !== 1 || edited.update.status !== "updated" ||
    edited.update.ref.version !== 2 || secondRead.ref.version !== 2 ||
    secondRead.ref.snapshotId !== edited.update.snapshot.id
  ) throw new Error("DH-019 authored Ref transition 不匹配");
  const second = await tools.run({ runId: CORRECTED_RUN_ID, program: corrected });
  requireRunEvidence(second, true);
  if (host.readRefRecord() !== secondRead.ref) throw new Error("DH-019 run 改变了 Ref");

  const withoutDigests = {
    schemaVersion: 1 as const, status: "offline-proven" as const, fixtureId: FIXTURE_ID, scenarioId: SCENARIO_ID,
    runIds: [ZERO_RUN_ID, CORRECTED_RUN_ID] as const,
    toolSequence: DH019_TOOL_SEQUENCE,
    episodeIds: [first.episode.id, second.episode.id] as const,
    evaluationIds: [first.evaluation.id, second.evaluation.id] as const,
    firstOutcome: "FAIL" as const, secondOutcome: "PASS" as const, repairCount: 1 as const,
    evidenceFieldsUsed: EVIDENCE_FIELDS,
  };
  return deepFreeze({
    ...withoutDigests,
    traceDigest: `trace:sha256:${domainDigest("demiurges-dh019-trace-v1\0", tracePreimage())}`,
    replayDigest: `replay:sha256:${domainDigest("demiurges-dh019-replay-v1\0", withoutDigests)}`,
  }) as OfflineValueCheckpointReceiptV1;
}

export function receiptCanonicalBytes(receipt: OfflineValueCheckpointReceiptV1): Uint8Array {
  return canonicalJsonBytes(receipt);
}
