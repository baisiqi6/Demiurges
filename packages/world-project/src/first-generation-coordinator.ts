import { lstatSync } from "node:fs";
import { join } from "node:path";

import { canonicalJsonBytes } from "@demiurges/world";

import {
  requireLiveOpenedDataRoot,
  type OpenedDataRoot,
} from "./data-root";
import {
  requireLiveDataRootWriterLease,
  type DataRootWriterLease,
} from "./data-root-lease";
import { generationCatalogFilename, generationIdDigest } from "./generation-birth";
import { GenerationBirthJournal } from "./generation-birth-journal";
import {
  requireGenerationIntent,
  type GenerationIntentV1,
} from "./generation-contracts";
import { GenerationNamespaceInstaller } from "./generation-namespace-installer";
import { inspectGenerationNamespace } from "./generation-namespace-inspection";
import {
  authorizeFirstGenerationCapacity,
  consumeFirstGenerationBirthAdmission,
  prepareFirstGenerationBirthAdmission,
} from "./first-generation-capacity";
import type { GenerationStateRecordV1 } from "./generation-state";
import { readStableRegularFile } from "./safe-filesystem";

let beforeBirthAdmissionHook: () => void = () => undefined;

export class FirstGenerationCoordinatorError extends Error {
  readonly code = "GENERATION_RECOVERY_REQUIRED" as const;

  constructor() {
    super("GENERATION_RECOVERY_REQUIRED");
    this.name = "FirstGenerationCoordinatorError";
  }
}

function recoveryRequired(): never {
  throw new FirstGenerationCoordinatorError();
}

const GENERATION_ID = /^generation:sha256:[a-f0-9]{64}$/;

function requireGenerationId(value: string): `generation:sha256:${string}` {
  if (typeof value !== "string" || !GENERATION_ID.test(value)) {
    return recoveryRequired();
  }
  return value as `generation:sha256:${string}`;
}

function syscallCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return typeof error.code === "string" ? error.code : undefined;
  }
  return undefined;
}

function pathExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (syscallCode(error) === "ENOENT") return false;
    return recoveryRequired();
  }
}

function parseCanonicalJson(path: string): unknown {
  const bytes = readStableRegularFile(path, 64 * 1024);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return recoveryRequired();
  }
  if (!Buffer.from(bytes).equals(Buffer.from(canonicalJsonBytes(value)))) {
    return recoveryRequired();
  }
  return value;
}

/** 只读 durable 第一代 inspect；无 mutation、不铸造 writer authority。 */
export type FirstGenerationInspectionV1 =
  | { readonly status: "absent" }
  | {
      readonly status: "admitted";
      readonly intent: GenerationIntentV1;
      readonly current: GenerationStateRecordV1;
    };

export type FirstGenerationAdmissionResultV1 =
  | { readonly status: "capacity-reached" }
  | {
      readonly status: "admitted";
      readonly namespaceStatus: "installed" | "replay";
      readonly birthStatus: "born" | "replay";
      readonly current: GenerationStateRecordV1;
    };

/**
 * Package-internal first admission boundary. It deliberately exposes only the
 * combined durable result, never a capacity capability or writer authority.
 */
export class FirstGenerationCoordinator {
  readonly #root: OpenedDataRoot;
  readonly #lease: DataRootWriterLease;
  readonly #rootPath: string;

  constructor(root: OpenedDataRoot, lease: DataRootWriterLease) {
    const liveRoot = requireLiveOpenedDataRoot(root);
    if (requireLiveDataRootWriterLease(lease).root !== root) {
      recoveryRequired();
    }
    this.#root = root;
    this.#lease = lease;
    this.#rootPath = liveRoot.absolutePath;
  }

  #assertLive(): void {
    if (
      requireLiveDataRootWriterLease(this.#lease).root !== this.#root ||
      requireLiveOpenedDataRoot(this.#root).absolutePath !== this.#rootPath
    ) {
      recoveryRequired();
    }
  }

  /**
   * 只读 durable inspect：namespace 未 terminal、data/catalog 均缺失或 birth
   * 尚未 publish 时返回 `absent`；catalog pointer 已发布且三件套 exact 时返回
   * `admitted` truth。任何 corruption 一律 GENERATION_RECOVERY_REQUIRED。
   */
  inspect(generationIdInput: string): FirstGenerationInspectionV1 {
    this.#assertLive();
    const generationId = requireGenerationId(generationIdInput);
    if (
      inspectGenerationNamespace(this.#root, this.#lease).state !==
        "terminal-installed"
    ) {
      return Object.freeze({ status: "absent" });
    }
    const digest = generationId.slice("generation:sha256:".length);
    const dataPath = join(
      this.#rootPath,
      "receipts",
      "generations",
      "data",
      digest,
    );
    const catalogPath = join(
      this.#rootPath,
      "receipts",
      "generations",
      "catalog",
      generationCatalogFilename(generationId),
    );
    if (!pathExists(dataPath)) {
      if (pathExists(catalogPath)) recoveryRequired();
      return Object.freeze({ status: "absent" });
    }
    const intent = requireGenerationIntent(
      parseCanonicalJson(join(dataPath, "intent.json")),
    );
    if (generationIdDigest(intent.generationId) !== digest) {
      recoveryRequired();
    }
    const birth = new GenerationBirthJournal(this.#root, this.#lease).inspect(
      intent,
    );
    if (birth.status !== "born") return Object.freeze({ status: "absent" });
    return Object.freeze({ status: "admitted", intent, current: birth.current });
  }

  admit(intentInput: GenerationIntentV1): FirstGenerationAdmissionResultV1 {
    this.#assertLive();
    const intent = requireGenerationIntent(intentInput);
    const capacity = authorizeFirstGenerationCapacity(
      this.#root,
      this.#lease,
      intent,
    );
    if (capacity.status === "capacity-reached") return Object.freeze(capacity);

    const namespace = new GenerationNamespaceInstaller(this.#root, this.#lease)
      .install(capacity.capability);
    const birthAdmission = prepareFirstGenerationBirthAdmission(
      capacity.capability,
      this.#root,
      this.#lease,
      intent,
    );
    beforeBirthAdmissionHook();
    const birth = new GenerationBirthJournal(this.#root, this.#lease).admit(
      intent,
      () => consumeFirstGenerationBirthAdmission(
        birthAdmission,
        this.#root,
        this.#lease,
        intent,
      ),
    );
    this.#assertLive();
    return Object.freeze({
      status: "admitted" as const,
      namespaceStatus: namespace.status,
      birthStatus: birth.status,
      current: birth.current,
    });
  }
}

/** Focused fault injection only; not exported by package root. */
export const FIRST_GENERATION_COORDINATOR_TEST_SEAMS = Object.freeze({
  replaceBeforeBirthAdmissionHook(replacement: () => void): () => void {
    const previous = beforeBirthAdmissionHook;
    beforeBirthAdmissionHook = replacement;
    return () => {
      if (beforeBirthAdmissionHook === replacement) {
        beforeBirthAdmissionHook = previous;
      }
    };
  },
});
