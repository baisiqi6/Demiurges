import type {
  Entity,
  EvaluationRecord,
  Snapshot,
  WorldRunResult,
} from "@demiurges/world";

export interface PresentationLayers {
  readonly mesh: boolean;
  readonly splat: boolean;
  readonly grid: boolean;
  readonly bounds: boolean;
  readonly collision: boolean;
  readonly alignment: boolean;
}

export type RegisteredAssetLoadStatus =
  | "loading"
  | "loaded"
  | "not-imported"
  | "error";

export interface RegisteredAssetLoadState {
  readonly assetId: string;
  readonly status: RegisteredAssetLoadStatus;
}

export function registeredIntegrityLabel(
  status: RegisteredAssetLoadStatus | undefined,
): string {
  if (status === "loaded") return "INTEGRITY VERIFIED";
  if (status === "loading") return "INTEGRITY VERIFYING";
  if (status === "not-imported") return "NOT IMPORTED";
  if (status === "error") return "INTEGRITY FAILED";
  return "AWAITING ASSET";
}

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

export function presentationLayersFor(
  snapshot: Snapshot | undefined,
  requested: PresentationLayers,
): PresentationLayers {
  const hasObservation = snapshot?.entities.some(
    (entity) => entity.representations.observation !== null,
  ) ?? false;
  return {
    ...requested,
    splat: requested.splat && hasObservation,
  };
}

export function defaultPresentationLayers(
  snapshot: Snapshot | undefined,
): PresentationLayers {
  return {
    mesh: true,
    splat: snapshot?.entities.some(
      (entity) => entity.representations.observation !== null,
    ) ?? false,
    grid: false,
    bounds: false,
    collision: false,
    alignment: false,
  };
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
  if (evaluation.contractId === "success:end-effector-reaches-frame") {
    return [
      { key: "supportCoverage", label: "settled", value: `${evaluation.metrics.supportSamples}/${evaluation.metrics.requiredSupportSamples}`, unit: "samples" },
      { key: "maxPositionErrorMeters", label: "tool error", value: evaluation.metrics.maxPositionErrorMeters, unit: "m" },
      { key: "maxJointSpeedRadiansPerSecond", label: "joint speed", value: evaluation.metrics.maxJointSpeedRadiansPerSecond, unit: "rad/s" },
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
  readonly programKind: string;
  readonly programSteps: readonly string[];
  readonly runtimeProfileId: string;
} {
  const program = run?.episode.program;
  return {
    programId: program?.id ?? "—",
    programKind: program?.kind ?? "—",
    programSteps: program?.kind === "actuator-sequence"
      ? program.steps.map((step) => `${step.timeSeconds}s · ${step.commands.map((command) => `${command.actuatorRef}=${command.valueRadians}rad`).join(" · ")}`)
      : program ? [`0s · ${program.targetRef} · ${program.durationSeconds}s @ ${program.sampleRateHz}Hz`] : [],
    runtimeProfileId: run?.episode.runtimeProfileId ?? "—",
  };
}
