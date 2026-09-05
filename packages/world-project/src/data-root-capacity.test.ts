import { describe, expect, test } from "bun:test";

import {
  calculateDataRootCapacity,
  type DataRootCapacityInputV1,
} from "./data-root-capacity";

function input(
  override: Partial<DataRootCapacityInputV1> = {},
): DataRootCapacityInputV1 {
  return {
    usedReceiptEntries: 0,
    pendingResultReservations: 0,
    namespaceState: "absent-no-intent",
    generations: [],
    request: "none",
    ...override,
  };
}

describe("Data Root shared capacity authority", () => {
  test("first generation composite admission costs exactly five in every namespace phase", () => {
    const cases: readonly DataRootCapacityInputV1[] = [
      input({ request: "generation-birth" }),
      input({
        usedReceiptEntries: 1,
        pendingResultReservations: 1,
        namespaceState: "install-intent-pending",
        request: "generation-birth",
      }),
      input({
        usedReceiptEntries: 2,
        pendingResultReservations: 1,
        namespaceState: "directory-published-result-pending",
        request: "generation-birth",
      }),
      input({
        usedReceiptEntries: 3,
        namespaceState: "terminal-installed",
        request: "generation-birth",
      }),
    ];
    expect(cases.map((value) => calculateDataRootCapacity(value).effectiveEntries))
      .toEqual([5, 5, 5, 5]);
  });

  test("matching publication intent takes over the same two reserved slots", () => {
    const before = calculateDataRootCapacity(input({
      usedReceiptEntries: 100,
      namespaceState: "terminal-installed",
      generations: [{ state: "validating", publicationEvidence: "none" }],
    }));
    const intentDurable = calculateDataRootCapacity(input({
      usedReceiptEntries: 101,
      pendingResultReservations: 1,
      namespaceState: "terminal-installed",
      generations: [{
        state: "validating",
        publicationEvidence: "matching-intent-no-result",
      }],
    }));
    const resultDurable = calculateDataRootCapacity(input({
      usedReceiptEntries: 102,
      namespaceState: "terminal-installed",
      generations: [{
        state: "validating",
        publicationEvidence: "matching-intent-result",
      }],
    }));
    expect([
      before.effectiveEntries,
      intentDurable.effectiveEntries,
      resultDurable.effectiveEntries,
    ]).toEqual([102, 102, 102]);
    expect([
      before.generationPublicationReservations,
      intentDurable.generationPublicationReservations,
      resultDurable.generationPublicationReservations,
    ]).toEqual([2, 0, 0]);
  });

  test("capacity edge rejects before a new two-slot admission", () => {
    for (const used of [2044, 2045, 2046]) {
      expect(calculateDataRootCapacity(input({
        usedReceiptEntries: used,
        namespaceState: "terminal-installed",
        request: "operation",
      })).canAdmit).toBe(true);
    }
    for (const used of [2047, 2048]) {
      const result = calculateDataRootCapacity(input({
        usedReceiptEntries: used,
        namespaceState: "terminal-installed",
        request: "operation",
      }));
      expect(result.canAdmit).toBe(false);
      expect(result.status).toBe("capacity-reached");
    }
  });

  test("durable validating publication intent keeps its exact one pending slot at the near-cap boundary", () => {
    for (const used of [2044, 2045, 2046, 2047, 2048]) {
      const result = calculateDataRootCapacity(input({
        usedReceiptEntries: used,
        pendingResultReservations: 1,
        namespaceState: "terminal-installed",
        generations: [{
          state: "validating",
          publicationEvidence: "matching-intent-no-result",
        }],
      }));
      expect(result.generationPublicationReservations).toBe(0);
      expect(result.requestedEntries).toBe(0);
      expect(result.effectiveEntries).toBe(used + 1);
      expect(result.status).toBe(used === 2048 ? "capacity-reached" : "ready");
    }
  });

  test("durable validating publication result occupies its exact two receipts with no generation reservation near capacity", () => {
    for (const used of [2044, 2045, 2046, 2047, 2048]) {
      const result = calculateDataRootCapacity(input({
        usedReceiptEntries: used,
        pendingResultReservations: 0,
        namespaceState: "terminal-installed",
        generations: [{
          state: "validating",
          publicationEvidence: "matching-intent-result",
        }],
      }));
      expect(result.generationPublicationReservations).toBe(0);
      expect(result.requestedEntries).toBe(0);
      expect(result.effectiveEntries).toBe(used);
      expect(result.status).toBe("ready");
    }
  });

  test("ambiguous automation state retains two slots permanently in v1", () => {
    const result = calculateDataRootCapacity(input({
      usedReceiptEntries: 20,
      namespaceState: "terminal-installed",
      generations: [
        { state: "submission_ambiguous", publicationEvidence: "none" },
        { state: "recovery_required", publicationEvidence: "none" },
      ],
    }));
    expect(result.generationPublicationReservations).toBe(4);
    expect(result.status).toBe("ready");
  });

  test("publishing without intent and terminal/publication contradictions fail closed", () => {
    for (const generations of [
      [{ state: "publishing", publicationEvidence: "none" }],
      [{ state: "provider_failed", publicationEvidence: "matching-intent-no-result" }],
      [{ state: "verified", publicationEvidence: "none" }],
    ] as const) {
      const result = calculateDataRootCapacity(input({
        usedReceiptEntries: 20,
        namespaceState: "terminal-installed",
        generations,
      }));
      expect(result.status).toBe("recovery-required");
      expect(result.canAdmit).toBe(false);
    }
  });

  test("invalid counters and unknown fields never become capacity authority", () => {
    expect(() => calculateDataRootCapacity({
      ...input(),
      usedReceiptEntries: -1,
    })).toThrow("OPERATION_RECOVERY_REQUIRED");
    expect(() => calculateDataRootCapacity({
      ...input(),
      extra: true,
    })).toThrow("OPERATION_RECOVERY_REQUIRED");
  });
});
