import { deepFreeze } from "@demiurges/world";

import {
  generationIntentDigest,
  requireGenerationIntent,
  type GenerationIntentV1,
} from "./generation-contracts";
import {
  generationStateRecordDigest,
  requireGenerationStateRecord,
  type GenerationStateRecordV1,
} from "./generation-state";

export const GENERATION_MAX_CATALOG_ENTRIES = 256;
export const GENERATION_MAX_BIRTH_STAGING_ENTRIES = 16;

export interface GenerationBirthPointerV1 {
  readonly generationId: `generation:sha256:${string}`;
  readonly bindingDigest: string;
  readonly intentDigest: string;
  readonly admittedRecordDigest: string;
}

export interface GenerationBirthHeadV1 {
  readonly generationId: `generation:sha256:${string}`;
  readonly sequence: 0;
  readonly recordDigest: string;
}

export class GenerationBirthError extends Error {
  readonly code = "GENERATION_RECOVERY_REQUIRED" as const;

  constructor() {
    super("GENERATION_RECOVERY_REQUIRED");
    this.name = "GenerationBirthError";
  }
}

const GENERATION_ID = /^generation:sha256:([a-f0-9]{64})$/;
const HEX_64 = /^[a-f0-9]{64}$/;
const BIRTH_TOKEN = /^[a-f0-9]{32}$/;

function recoveryRequired(): never {
  throw new GenerationBirthError();
}

function plainRecord(value: unknown): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return recoveryRequired();
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") return recoveryRequired();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      return recoveryRequired();
    }
  }
  return value as Record<string, unknown>;
}

function exactKeys(record: Record<string, unknown>, keys: readonly string[]): void {
  const actual = Reflect.ownKeys(record);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== "string") ||
    !keys.every((key) => Object.prototype.hasOwnProperty.call(record, key))
  ) {
    recoveryRequired();
  }
}

function requireHex64(value: unknown): string {
  if (typeof value !== "string" || !HEX_64.test(value)) {
    return recoveryRequired();
  }
  return value;
}

export function generationIdDigest(
  generationId: `generation:sha256:${string}`,
): string {
  const match = GENERATION_ID.exec(generationId);
  if (match === null) return recoveryRequired();
  return match[1]!;
}

export function generationCatalogFilename(
  generationId: `generation:sha256:${string}`,
): string {
  return `${generationIdDigest(generationId)}.json`;
}

export function requireGenerationBirthAttemptToken(value: unknown): string {
  if (typeof value !== "string" || !BIRTH_TOKEN.test(value)) {
    return recoveryRequired();
  }
  return value;
}

export function createGenerationBirthPointer(
  intentInput: GenerationIntentV1,
  admittedInput: GenerationStateRecordV1,
): GenerationBirthPointerV1 {
  const intent = requireGenerationIntent(intentInput);
  const admitted = requireGenerationStateRecord(admittedInput, intent, null);
  return deepFreeze({
    generationId: intent.generationId,
    bindingDigest: intent.bindingDigest,
    intentDigest: generationIntentDigest(intent),
    admittedRecordDigest: generationStateRecordDigest(admitted),
  }) as GenerationBirthPointerV1;
}

export function requireGenerationBirthPointer(
  value: unknown,
  intentInput: GenerationIntentV1,
  admittedInput: GenerationStateRecordV1,
): GenerationBirthPointerV1 {
  const expected = createGenerationBirthPointer(intentInput, admittedInput);
  const record = plainRecord(value);
  exactKeys(record, [
    "generationId",
    "bindingDigest",
    "intentDigest",
    "admittedRecordDigest",
  ]);
  if (
    record.generationId !== expected.generationId ||
    record.bindingDigest !== expected.bindingDigest ||
    record.intentDigest !== expected.intentDigest ||
    record.admittedRecordDigest !== expected.admittedRecordDigest
  ) {
    return recoveryRequired();
  }
  return expected;
}

export function createGenerationBirthHead(
  intentInput: GenerationIntentV1,
  admittedInput: GenerationStateRecordV1,
): GenerationBirthHeadV1 {
  const intent = requireGenerationIntent(intentInput);
  const admitted = requireGenerationStateRecord(admittedInput, intent, null);
  return deepFreeze({
    generationId: intent.generationId,
    sequence: 0,
    recordDigest: generationStateRecordDigest(admitted),
  }) as GenerationBirthHeadV1;
}

export function requireGenerationBirthHead(
  value: unknown,
  intentInput: GenerationIntentV1,
  admittedInput: GenerationStateRecordV1,
): GenerationBirthHeadV1 {
  const expected = createGenerationBirthHead(intentInput, admittedInput);
  const record = plainRecord(value);
  exactKeys(record, ["generationId", "sequence", "recordDigest"]);
  if (
    record.generationId !== expected.generationId ||
    record.sequence !== 0 ||
    requireHex64(record.recordDigest) !== expected.recordDigest
  ) {
    return recoveryRequired();
  }
  return expected;
}
