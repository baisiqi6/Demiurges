import type {
  Entity,
  EvaluationRecord,
  Snapshot,
  WorldRunResult,
} from "@demiurges/world";

export type PresentationMode = "mesh" | "3dgs" | "overlay";

export interface EvaluationMetricRow {
  readonly key: string;
  readonly label: string;
  readonly value: number | string;
  readonly unit: string;
}

export function preferredSelection(
  snapshot: Snapshot | undefined,
  current?: Entity["ref"],
): Entity["ref"] | undefined {
  if (!snapshot) return undefined;
  if (current && snapshot.entities.some((entity) => entity.ref === current)) {
    return current;
  }
  return snapshot.entities.find((entity) => entity.physics.bodyType === "dynamic")?.ref
    ?? snapshot.entities.find((entity) => entity.ref !== "entity:floor")?.ref
    ?? snapshot.entities[0]?.ref;
}

export function presentationModeFor(
  entity: Entity | undefined,
  requested: PresentationMode,
): PresentationMode {
  return requested === "3dgs" && !entity?.representations.observation
    ? "mesh"
    : requested;
}

export function defaultPresentationMode(
  entity: Entity | undefined,
): PresentationMode {
  return entity?.representations.observation ? "3dgs" : "mesh";
}

export function evaluationMetricRows(
  evaluation: EvaluationRecord | undefined,
): readonly EvaluationMetricRow[] {
  if (!evaluation) return [];
  if (evaluation.contractId === "success:stable-on-floor") {
    return [
      {
        key: "terminalCenterHeight",
        label: "terminal height",
        value: evaluation.metrics.terminalCenterHeight,
        unit: "m",
      },
      {
        key: "heightError",
        label: "height error",
        value: evaluation.metrics.heightError,
        unit: "m",
      },
      {
        key: "terminalLinearSpeed",
        label: "terminal speed",
        value: evaluation.metrics.terminalLinearSpeed,
        unit: "m/s",
      },
    ];
  }
  return [
    {
      key: "supportCoverage",
      label: "support",
      value: `${evaluation.metrics.supportSamples}/${evaluation.metrics.requiredSupportSamples}`,
      unit: "samples",
    },
    {
      key: "maxHorizontalOffsetMeters",
      label: "radial offset",
      value: evaluation.metrics.maxHorizontalOffsetMeters,
      unit: "m",
    },
    {
      key: "maxLinearSpeedMetersPerSecond",
      label: "max speed",
      value: evaluation.metrics.maxLinearSpeedMetersPerSecond,
      unit: "m/s",
    },
    {
      key: "maxFloorDistanceErrorMeters",
      label: "floor error",
      value: evaluation.metrics.maxFloorDistanceErrorMeters,
      unit: "m",
    },
    {
      key: "maxPenetrationMeters",
      label: "penetration",
      value: evaluation.metrics.maxPenetrationMeters,
      unit: "m",
    },
  ];
}

export function runContractSummary(run: WorldRunResult | undefined): {
  readonly programId: string;
  readonly runtimeProfileId: string;
} {
  return {
    programId: run?.episode.programId ?? "—",
    runtimeProfileId: run?.episode.runtimeProfileId ?? "—",
  };
}
