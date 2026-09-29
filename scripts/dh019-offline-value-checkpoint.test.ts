import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
  DH019_TOOL_SEQUENCE,
  receiptCanonicalBytes,
  runOfflineValueCheckpoint,
  deriveCorrectedProgramFromEvidence,
  DH019_ZERO_PROGRAM,
} from "./dh019-offline-value-checkpoint";
import { RuntimeMvpHost, WorldToolSurface, TWO_JOINT_REACH_FIXTURE_ID } from "../packages/world/src/index";

describe("DH-019 offline value checkpoint", () => {
  test("fresh Host replay produces exact articulated FAIL→evidence→repair→PASS receipt", async () => {
    const receipt = await runOfflineValueCheckpoint();
    expect(receipt.fixtureId).toBe("fixture:two-joint-planar-reach-v1");
    expect(receipt.scenarioId).toBe("scenario:two-joint-planar-reach-v1");
    expect(receipt.runIds).toEqual(["run:dh019-zero", "run:dh019-corrected"]);
    expect(receipt.toolSequence).toEqual(DH019_TOOL_SEQUENCE);
    expect(receipt.firstOutcome).toBe("FAIL");
    expect(receipt.secondOutcome).toBe("PASS");
    expect(receipt.repairCount).toBe(1);
    expect(receipt.evidenceFieldsUsed).toEqual([
      "supportSamples",
      "maxPositionErrorMeters",
      "maxJointSpeedRadiansPerSecond",
    ]);
    expect(receipt.episodeIds).toHaveLength(2);
    expect(receipt.evaluationIds).toHaveLength(2);
    expect(receipt.traceDigest).toMatch(/^trace:sha256:[a-f0-9]{64}$/);
    expect(receipt.replayDigest).toMatch(/^replay:sha256:[a-f0-9]{64}$/);
    expect(receipt.traceDigest).toBe("trace:sha256:3f1c77b8b77ca62d8a830385bb9386f875d49880f734702e52cc360811984177");
    expect(receipt.replayDigest).toBe("replay:sha256:f806faeac3913384b5e09af502dac03af72826ae1ee50c8d6c5ff36eccfbff83");
  });

  test("two fresh Hosts produce byte-identical replay evidence", async () => {
    const left = await runOfflineValueCheckpoint();
    const right = await runOfflineValueCheckpoint();
    expect(left).toEqual(right);
    expect(Array.from(receiptCanonicalBytes(left))).toEqual(Array.from(receiptCanonicalBytes(right)));
  }, 15000);

  test("tampered first Evaluation cannot produce a corrected Program", () => {
    expect(() => deriveCorrectedProgramFromEvidence({
      episode: { id: "episode:forged", scenarioId: "scenario:two-joint-planar-reach-v1" },
      evaluation: { passed: true, metrics: { supportSamples: 16 } },
    } as never, undefined as never)).toThrow();
  });

  test("forged real Episode provenance cannot produce a corrected Program", async () => {
    const host = new RuntimeMvpHost();
    const tools = new WorldToolSurface(host);
    tools.write({ fixtureId: TWO_JOINT_REACH_FIXTURE_ID });
    const before = tools.read();
    tools.edit({ expected: before.ref, targetRef: "entity:arm", change: { kind: "joint-state", joints: [
      { jointRef: "joint:arm-shoulder", positionRadians: 0, velocityRadiansPerSecond: 0 },
      { jointRef: "joint:arm-elbow", positionRadians: 0, velocityRadiansPerSecond: 0 },
    ] } });
    const real = await tools.run({ runId: "run:dh019-zero", program: DH019_ZERO_PROGRAM });
    const forged = structuredClone(real) as any;
    forged.episode.explicitInputs.runId = "run:attacker";
    expect(() => deriveCorrectedProgramFromEvidence(forged, before)).toThrow();
  });

  test("runner structurally has no provider, Keychain, or OMP dependency", () => {
    const source = readFileSync(new URL("./dh019-offline-value-checkpoint.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/@oh-my-pi|keychain|fetch\s*\(|from\s+["'][^"']*provider/iu);
  });
});
