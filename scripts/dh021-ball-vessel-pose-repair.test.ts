import { describe, expect, test } from "bun:test";
import { deriveBallVesselPoseRepair } from "../packages/world/src/authoring/derive-ball-vessel-pose-repair";
import { BALL_VESSEL_FIXTURE_ID, RuntimeMvpHost, WorldToolSurface, canonicalJsonBytes, sha256Hex, deepFreeze } from "../packages/world/src/index";

async function setup() {
  const host = new RuntimeMvpHost();
  const tools = new WorldToolSurface(host);
  tools.write({ fixtureId: BALL_VESSEL_FIXTURE_ID });
  const initial = tools.read();
  tools.edit({ expected: initial.ref, targetRef: "entity:ball", change: { kind: "pose", frameRef: "frame:world", pose: { position: { x: 1, y: 0, z: 1 }, rotation: { x: 0, y: 0, z: 0, w: 1 } } } });
  const read = tools.read();
  const run = await tools.run({ runId: "run:dh021-outside", program: { kind: "free-fall", targetRef: "entity:ball", durationSeconds: 3, sampleRateHz: 30 } });
  return { host, tools, read, run };
}

describe("DH-021 ball-vessel pose repair", () => {
  test("FAIL evidence derives frozen center pose, then edit/run proves PASS", async () => {
    const { host, tools, read, run } = await setup();
    const proposal = deriveBallVesselPoseRepair(read, run);
    expect(proposal.status).toBe("available");
    if (proposal.status !== "available") return;
    expect(Object.isFrozen(proposal)).toBe(true);
    expect(proposal.pose.position).toEqual([0, 0, 0.7]);
    const edited = tools.edit({ expected: read.ref, targetRef: "entity:ball", change: { kind: "pose", frameRef: "frame:world", pose: { position: { x: proposal.pose.position[0], y: proposal.pose.position[1], z: proposal.pose.position[2] }, rotation: proposal.pose.rotation } } });
    const second = await tools.run({ runId: "run:dh021-centered", program: { kind: "free-fall", targetRef: "entity:ball", durationSeconds: 3, sampleRateHz: 30 } });
    expect(edited.update.status).toBe("updated");
    expect(second.evaluation.passed).toBe(true);
    expect(host.readRefRecord()).toEqual(edited.update.ref);
    expect(sha256Hex(canonicalJsonBytes(proposal.pose))).toBe("2202043e08d2a6c77b72bdeeeecc516b3fa9a6f0fdd1a6ac9309faa8b6fa111e");
  });

  test("same golden input replays identical candidate", async () => {
    const left = await setup(); const right = await setup();
    expect(deriveBallVesselPoseRepair(left.read, left.run)).toEqual(deriveBallVesselPoseRepair(right.read, right.run));
  });

  test("forged run and already passed evidence fail closed", async () => {
    const { read, run } = await setup();
    const forged = structuredClone(run) as any; forged.episode.explicitInputs.runId = "run:attacker";
    expect(deriveBallVesselPoseRepair(read, deepFreeze(forged) as any)).toMatchObject({ status: "unavailable", reason: "invalid_evidence" });
    const passed = structuredClone(run) as any; passed.evaluation.passed = true;
    expect(deriveBallVesselPoseRepair(read, deepFreeze(passed) as any)).toMatchObject({ status: "unavailable", reason: "invalid_evidence" });
  });
});
