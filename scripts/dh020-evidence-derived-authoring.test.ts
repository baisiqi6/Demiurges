import { describe, expect, test } from "bun:test";
import { deriveArticulatedReachRepair } from "../packages/world/src/authoring/derive-articulated-reach-repair";
import { RuntimeMvpHost, WorldToolSurface, TWO_JOINT_REACH_FIXTURE_ID, canonicalJsonBytes, sha256Hex, deepFreeze } from "../packages/world/src/index";
import { DH019_ZERO_PROGRAM } from "./dh019-offline-value-checkpoint";

async function setup() {
  const host = new RuntimeMvpHost();
  const tools = new WorldToolSurface(host);
  tools.write({ fixtureId: TWO_JOINT_REACH_FIXTURE_ID });
  const initial = tools.read();
  tools.edit({ expected: initial.ref, targetRef: "entity:arm", change: { kind: "joint-state", joints: [
    { jointRef: "joint:arm-shoulder", positionRadians: 0, velocityRadiansPerSecond: 0 },
    { jointRef: "joint:arm-elbow", positionRadians: 0, velocityRadiansPerSecond: 0 },
  ] } });
  const read = tools.read();
  const run = await tools.run({ runId: "run:dh019-zero", program: DH019_ZERO_PROGRAM });
  return { host, tools, read, run };
}

describe("DH-020 evidence-derived authoring candidate", () => {
  test("golden FAIL evidence derives deterministic elbow-down candidate and rerun PASS", async () => {
    const { host, tools, read, run } = await setup();
    const proposal = deriveArticulatedReachRepair(read, run, "run:dh020-candidate");
    expect(proposal.status).toBe("available");
    if (proposal.status !== "available") return;
    expect(Object.isFrozen(proposal)).toBe(true);
    expect(Object.isFrozen(proposal.program)).toBe(true);
    expect(proposal.program.kind).toBe("actuator-sequence");
    expect(proposal.program.steps[0]!.commands[0]!.valueRadians).toBe(0.65);
    expect(proposal.program.steps[0]!.commands[1]!.valueRadians).toBe(-1);
    const { id: _id, ...content } = proposal.program;
    const second = await tools.run({ runId: "run:dh020-candidate", program: content });
    expect(second.evaluation.passed).toBe(true);
    expect(host.readRefRecord()).toEqual(read.ref);
    expect(sha256Hex(canonicalJsonBytes(proposal.program))).toBe("46fa1ae3381ae8cd45d894b0478dd9a24ca6e2328924e657b0a675594b06813a");
  });

  test("same input bytes replay to same proposal", async () => {
    const left = await setup();
    const right = await setup();
    const a = deriveArticulatedReachRepair(left.read, left.run, "run:dh020-candidate");
    const b = deriveArticulatedReachRepair(right.read, right.run, "run:dh020-candidate");
    expect(a).toEqual(b);
    expect(Array.from(canonicalJsonBytes(a))).toEqual(Array.from(canonicalJsonBytes(b)));
  });

  test("passed, forged provenance, and foreign scenario fail closed", async () => {
    const { read, run } = await setup();
    expect(deriveArticulatedReachRepair(read, { ...run, evaluation: { ...run.evaluation, passed: true } }, "run:dh020-candidate")).toMatchObject({ status: "unavailable", reason: "invalid_evidence" });
    const forged = structuredClone(run) as any;
    forged.episode.explicitInputs.runId = "run:attacker";
    expect(deriveArticulatedReachRepair(read, forged, "run:dh020-candidate")).toMatchObject({ status: "unavailable", reason: "invalid_evidence" });
    for (const mutate of [
      (value: any) => { value.episode.scenarioId = "scenario:primitive-box-free-fall-v1"; },
      (value: any) => { value.episode.program.durationSeconds = 2; },
      (value: any) => { value.baseRef.version = 1; },
    ]) {
      const altered = structuredClone(run) as any;
      mutate(altered);
      expect(deriveArticulatedReachRepair(read, deepFreeze(altered) as any, "run:dh020-candidate")).toMatchObject({ status: "unavailable", reason: "invalid_evidence" });
    }
  });
});
