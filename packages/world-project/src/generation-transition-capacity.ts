import {
  requireLiveOpenedDataRoot,
  type OpenedDataRoot,
} from "./data-root";
import {
  requireLiveDataRootWriterLease,
  type DataRootWriterLease,
} from "./data-root-lease";
import {
  calculateDataRootCapacity,
  type CapacityGenerationStateV1,
  type DataRootCapacityResultV1,
} from "./data-root-capacity";
import { inspectDataRootCapacity } from "./data-root-capacity-inspection";
import type { GenerationStateV1 } from "./generation-state";

export class GenerationTransitionCapacityError extends Error {
  readonly code = "GENERATION_RECOVERY_REQUIRED" as const;

  constructor() {
    super("GENERATION_RECOVERY_REQUIRED");
    this.name = "GenerationTransitionCapacityError";
  }
}

function recoveryRequired(): never {
  throw new GenerationTransitionCapacityError();
}

/** Receipt-derived capacity check shared by the two early state transitions. */
export function inspectGenerationTransitionCapacity(
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  state: GenerationStateV1,
): DataRootCapacityResultV1 {
  requireLiveOpenedDataRoot(root);
  if (requireLiveDataRootWriterLease(lease).root !== root) recoveryRequired();
  const inspection = inspectDataRootCapacity(root, lease);
  if (
    inspection.namespaceState !== "terminal-installed" ||
    inspection.internalOperationCount !== 1
  ) {
    recoveryRequired();
  }
  const capacity = calculateDataRootCapacity({
    usedReceiptEntries: inspection.usedReceiptEntries,
    pendingResultReservations: inspection.pendingResultReservations,
    namespaceState: inspection.namespaceState,
    generations: [{
      state: state as CapacityGenerationStateV1,
      publicationEvidence: "none",
    }],
    request: "none",
  });
  if (capacity.status === "recovery-required") recoveryRequired();
  return capacity;
}
