import {
  linkSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmdirSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

import { canonicalJsonBytes, deepFreeze, sha256Hex } from "@demiurges/world";

import {
  dataRootReceiptIntentPath,
  dataRootReceiptResultPath,
  dataRootStagingPath,
  requireLiveOpenedDataRoot,
  type OpenedDataRoot,
} from "./data-root";
import {
  requireLiveDataRootWriterLease,
  type DataRootWriterLease,
} from "./data-root-lease";
import { ensureDataRootLayout } from "./data-root-layout";
import {
  readStableRegularFile,
  syncDirectory,
  writeNewSyncedFile,
} from "./safe-filesystem";

let syncReceiptsDirectory = syncDirectory;

export const WORLD_PROJECT_OPERATION_SCHEMA_VERSION = 1;
export const WORLD_PROJECT_OPERATION_RECORD_MAX_BYTES = 64 * 1024;
export const WORLD_PROJECT_OPERATION_MAX_RECEIPT_ENTRIES = 2048;

export type WorldProjectOperationKind =
  | "project.save"
  | "project.save-as"
  | "artifact.publish"
  | "artifact.import-dh013"
  | "bundle.import";

export interface ArtifactCandidateIdentity {
  readonly assetId: `asset:${string}`;
  readonly digest: string;
  readonly byteLength: number;
  readonly format: "spz-v2" | "glb-2.0";
  readonly elementCount: number;
  readonly sourceBounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
}

export type OperationCandidateIdentity =
  | { readonly projectRevision: string }
  | ArtifactCandidateIdentity
  | {
      readonly candidateArtifacts: readonly ArtifactCandidateIdentity[];
      readonly artifactSetDigest: string;
    }
  | {
      readonly projectRevision: string;
      readonly candidateArtifacts: readonly ArtifactCandidateIdentity[];
      readonly artifactSetDigest: string;
    };

export interface OperationBinding {
  readonly schemaVersion: 1;
  readonly operationId: string;
  readonly operationKind: WorldProjectOperationKind;
  readonly target: {
    readonly kind: "project" | "artifact" | "registry";
    readonly id: string;
  };
  readonly expectedIdentity: string | null;
  readonly candidateIdentity: OperationCandidateIdentity;
}

export type OperationTerminalResult =
  | {
      readonly schemaVersion: 1;
      readonly operationId: string;
      readonly bindingDigest: string;
      readonly variant: "success";
      readonly publishedIdentity: string;
    }
  | {
      readonly schemaVersion: 1;
      readonly operationId: string;
      readonly bindingDigest: string;
      readonly variant: "aborted-before-publish";
      readonly code: string;
    };

export type OperationJournalErrorCode =
  | "OPERATION_BINDING_CONFLICT"
  | "OPERATION_RECOVERY_REQUIRED"
  | "OPERATION_IN_PROGRESS"
  | "REQUEST_ABORTED";

export class OperationJournalError extends Error {
  readonly code: OperationJournalErrorCode;

  constructor(code: OperationJournalErrorCode) {
    super(code);
    this.name = "OperationJournalError";
    this.code = code;
  }
}

function plainRecord(value: unknown, _label: string): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
): void {
  const actual = Reflect.ownKeys(record);
  if (
    actual.some((key) => typeof key !== "string") ||
    actual.length !== keys.length ||
    !keys.every((key) => Object.prototype.hasOwnProperty.call(record, key))
  ) {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
}

function boundedString(value: unknown, pattern: RegExp, max: number): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > max ||
    !pattern.test(value)
  ) {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  return value;
}

const HEX_64 = /^[a-f0-9]{64}$/;
const PROJECT_REVISION = /^project-revision:sha256:[a-f0-9]{64}$/;
const OPERATION_ID = /^op:[A-Za-z0-9._-]{1,127}$/;
const TARGET_ID = /^(?:project|asset|registry):[A-Za-z0-9._:-]{1,160}$/;
const PUBLIC_CODE = /^[A-Z][A-Z0-9_]{1,95}$/;
const ASSET_ID = /^asset:[a-z0-9][a-z0-9-]{0,127}$/;

function finiteNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Object.is(value, -0)) {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  return value;
}

function denseVec3(value: unknown): readonly [number, number, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    Reflect.ownKeys(value).length !== 4 ||
    ![0, 1, 2].every((index) => Object.prototype.hasOwnProperty.call(value, index))
  ) {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  return [finiteNumber(value[0]), finiteNumber(value[1]), finiteNumber(value[2])];
}

function artifactCandidate(value: unknown): ArtifactCandidateIdentity {
  const record = plainRecord(value, "candidate artifact");
  exactKeys(record, [
    "assetId",
    "digest",
    "byteLength",
    "format",
    "elementCount",
    "sourceBounds",
  ]);
  const bounds = plainRecord(record.sourceBounds, "sourceBounds");
  exactKeys(bounds, ["min", "max"]);
  const min = denseVec3(bounds.min);
  const max = denseVec3(bounds.max);
  if (!min.every((component, index) => component < max[index]!)) {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  const byteLength = finiteNumber(record.byteLength);
  const elementCount = finiteNumber(record.elementCount);
  if (
    !Number.isSafeInteger(byteLength) ||
    byteLength < 1 ||
    !Number.isSafeInteger(elementCount) ||
    elementCount < 1
  ) {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  if (record.format !== "spz-v2" && record.format !== "glb-2.0") {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  return {
    assetId: boundedString(record.assetId, ASSET_ID, 134) as `asset:${string}`,
    digest: boundedString(record.digest, HEX_64, 64),
    byteLength,
    format: record.format,
    elementCount,
    sourceBounds: { min, max },
  };
}

function artifactSet(value: unknown): readonly ArtifactCandidateIdentity[] {
  if (
    !Array.isArray(value) ||
    value.length > 16 ||
    Reflect.ownKeys(value).length !== value.length + 1
  ) {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  const candidates = value.map(artifactCandidate);
  for (let index = 1; index < candidates.length; index += 1) {
    if (candidates[index]!.digest <= candidates[index - 1]!.digest) {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
  }
  return candidates;
}

export function artifactCandidateSetDigest(
  candidates: readonly ArtifactCandidateIdentity[],
): string {
  return sha256Hex(canonicalJsonBytes(candidates));
}

function candidateIdentity(
  kind: WorldProjectOperationKind,
  value: unknown,
): OperationCandidateIdentity {
  const record = plainRecord(value, "candidateIdentity");
  if (kind === "project.save" || kind === "project.save-as") {
    exactKeys(record, ["projectRevision"]);
    return {
      projectRevision: boundedString(record.projectRevision, PROJECT_REVISION, 88),
    };
  }
  if (kind === "artifact.publish") {
    return artifactCandidate(record);
  }
  if (kind === "artifact.import-dh013") {
    exactKeys(record, ["candidateArtifacts", "artifactSetDigest"]);
    const candidateArtifacts = artifactSet(record.candidateArtifacts);
    const digest = boundedString(record.artifactSetDigest, HEX_64, 64);
    if (artifactCandidateSetDigest(candidateArtifacts) !== digest) {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    return { candidateArtifacts, artifactSetDigest: digest };
  }
  exactKeys(record, ["projectRevision", "candidateArtifacts", "artifactSetDigest"]);
  const candidateArtifacts = artifactSet(record.candidateArtifacts);
  const digest = boundedString(record.artifactSetDigest, HEX_64, 64);
  if (artifactCandidateSetDigest(candidateArtifacts) !== digest) {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  return {
    projectRevision: boundedString(record.projectRevision, PROJECT_REVISION, 88),
    candidateArtifacts,
    artifactSetDigest: digest,
  };
}

export function requireOperationBinding(value: unknown): OperationBinding {
  const record = plainRecord(value, "operation binding");
  exactKeys(record, [
    "schemaVersion",
    "operationId",
    "operationKind",
    "target",
    "expectedIdentity",
    "candidateIdentity",
  ]);
  if (record.schemaVersion !== WORLD_PROJECT_OPERATION_SCHEMA_VERSION) {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  const kinds: readonly WorldProjectOperationKind[] = [
    "project.save",
    "project.save-as",
    "artifact.publish",
    "artifact.import-dh013",
    "bundle.import",
  ];
  if (!kinds.includes(record.operationKind as WorldProjectOperationKind)) {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  const operationKind = record.operationKind as WorldProjectOperationKind;
  const target = plainRecord(record.target, "target");
  exactKeys(target, ["kind", "id"]);
  if (!(["project", "artifact", "registry"] as const).includes(target.kind as never)) {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  if (
    record.expectedIdentity !== null &&
    (typeof record.expectedIdentity !== "string" ||
      !(HEX_64.test(record.expectedIdentity) || PROJECT_REVISION.test(record.expectedIdentity)))
  ) {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  const expectedIdentity = record.expectedIdentity as string | null;
  const canonicalTarget = {
    kind: target.kind as OperationBinding["target"]["kind"],
    id: boundedString(target.id, TARGET_ID, 170),
  };
  const canonicalCandidate = candidateIdentity(
    operationKind,
    record.candidateIdentity,
  );
  const validOperationBoundary = operationKind === "project.save"
    ? canonicalTarget.kind === "project" &&
      canonicalTarget.id.startsWith("project:") &&
      typeof expectedIdentity === "string" &&
      PROJECT_REVISION.test(expectedIdentity)
    : operationKind === "project.save-as"
      ? canonicalTarget.kind === "project" &&
        canonicalTarget.id.startsWith("project:") &&
        expectedIdentity === null
      : operationKind === "artifact.publish"
        ? canonicalTarget.kind === "artifact" &&
          "assetId" in canonicalCandidate &&
          canonicalTarget.id === canonicalCandidate.assetId &&
          expectedIdentity === null
        : operationKind === "artifact.import-dh013"
          ? canonicalTarget.kind === "registry" &&
            canonicalTarget.id === "registry:marble-hunyuan-v1" &&
            expectedIdentity === null
          : canonicalTarget.kind === "project" &&
            canonicalTarget.id.startsWith("project:") &&
            expectedIdentity === null;
  if (!validOperationBoundary) {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  return deepFreeze({
    schemaVersion: 1,
    operationId: boundedString(record.operationId, OPERATION_ID, 130),
    operationKind,
    target: canonicalTarget,
    expectedIdentity,
    candidateIdentity: canonicalCandidate,
  }) as OperationBinding;
}

export function operationBindingDigest(binding: OperationBinding): string {
  return sha256Hex(canonicalJsonBytes(requireOperationBinding(binding)));
}

export function requireOperationTerminalResult(
  value: unknown,
  binding: OperationBinding,
): OperationTerminalResult {
  const record = plainRecord(value, "operation result");
  const digest = operationBindingDigest(binding);
  if (record.variant === "success") {
    exactKeys(record, [
      "schemaVersion",
      "operationId",
      "bindingDigest",
      "variant",
      "publishedIdentity",
    ]);
    if (
      record.schemaVersion !== 1 ||
      record.operationId !== binding.operationId ||
      record.bindingDigest !== digest ||
      record.publishedIdentity !== candidatePublishedIdentity(binding)
    ) {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    return deepFreeze({ ...record }) as OperationTerminalResult;
  }
  exactKeys(record, [
    "schemaVersion",
    "operationId",
    "bindingDigest",
    "variant",
    "code",
  ]);
  if (
    record.schemaVersion !== 1 ||
    record.operationId !== binding.operationId ||
    record.bindingDigest !== digest ||
    record.variant !== "aborted-before-publish"
  ) {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  return deepFreeze({
    schemaVersion: 1,
    operationId: binding.operationId,
    bindingDigest: digest,
    variant: "aborted-before-publish",
    code: boundedString(record.code, PUBLIC_CODE, 96),
  }) as OperationTerminalResult;
}

function candidatePublishedIdentity(binding: OperationBinding): string {
  const candidate = binding.candidateIdentity;
  if ("projectRevision" in candidate) return candidate.projectRevision;
  if ("digest" in candidate) return candidate.digest;
  return candidate.artifactSetDigest;
}

function parseCanonicalJson(bytes: Uint8Array): unknown {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  if (!Buffer.from(canonicalJsonBytes(value)).equals(Buffer.from(bytes))) {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  return value;
}

function syscallCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return typeof error.code === "string" ? error.code : undefined;
  }
  return undefined;
}

export interface AdmittedOperation {
  readonly binding: OperationBinding;
  readonly bindingDigest: string;
  readonly attemptPath: string;
  readonly attemptToken: string;
  readonly intentPath: string;
}

interface AdmittedOperationAuthority {
  readonly journal: OperationJournal;
  readonly root: OpenedDataRoot;
  readonly lease: DataRootWriterLease;
  terminalized: boolean;
}

const admittedOperationAuthorities = new WeakMap<
  AdmittedOperation,
  AdmittedOperationAuthority
>();

/**
 * 只供 package 内 mutation primitive 验证 durable admission provenance。
 * AdmittedOperation 的字段是可序列化 evidence，不足以单独构成写权限；真正权限来自
 * 当前进程中由 OperationJournal 铸造的 object identity。
 */
export function requireLiveAdmittedOperation(
  operation: AdmittedOperation,
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  journal: OperationJournal,
): AdmittedOperation {
  const authority = admittedOperationAuthorities.get(operation);
  if (
    authority === undefined ||
    authority.root !== root ||
    authority.lease !== lease ||
    authority.journal !== journal ||
    authority.terminalized ||
    requireLiveDataRootWriterLease(lease).root !== root
  ) {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  return operation;
}

/** caller cleanup只能由同一journal在本进程已完成result fsync后执行。 */
export function requireDurablyFinalizedOperation(
  operation: AdmittedOperation,
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  journal: OperationJournal,
): AdmittedOperation {
  const authority = admittedOperationAuthorities.get(operation);
  if (
    authority === undefined ||
    authority.root !== root ||
    authority.lease !== lease ||
    authority.journal !== journal ||
    !authority.terminalized ||
    requireLiveDataRootWriterLease(lease).root !== root
  ) {
    throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
  }
  return operation;
}

export function isDurablyFinalizedOperation(
  operation: AdmittedOperation,
  root: OpenedDataRoot,
  lease: DataRootWriterLease,
  journal: OperationJournal,
): boolean {
  try {
    requireDurablyFinalizedOperation(operation, root, lease, journal);
    return true;
  } catch {
    return false;
  }
}

export type OperationAdmission =
  | { readonly status: "admitted"; readonly operation: AdmittedOperation }
  | { readonly status: "replay"; readonly result: OperationTerminalResult };

export class OperationJournal {
  readonly #root: OpenedDataRoot;
  readonly #lease: DataRootWriterLease;

  constructor(root: OpenedDataRoot, lease: DataRootWriterLease) {
    const liveLease = requireLiveDataRootWriterLease(lease);
    if (liveLease.root !== root) throw new Error("OperationJournal root/lease 不一致");
    this.#root = root;
    this.#lease = lease;
    ensureDataRootLayout(root, lease);
  }

  #path(relativePath: string): string {
    return join(requireLiveOpenedDataRoot(this.#root).absolutePath, relativePath);
  }

  #assertLive(): void {
    requireLiveDataRootWriterLease(this.#lease);
    requireLiveOpenedDataRoot(this.#root);
  }

  #mintOperation(
    binding: OperationBinding,
    attemptPath: string,
    attemptToken: string,
    intentPath: string,
  ): AdmittedOperation {
    const operation = deepFreeze({
      binding,
      bindingDigest: operationBindingDigest(binding),
      attemptPath,
      attemptToken,
      intentPath,
    }) as AdmittedOperation;
    admittedOperationAuthorities.set(operation, {
      journal: this,
      root: this.#root,
      lease: this.#lease,
      terminalized: false,
    });
    return operation;
  }

  #requireOwnedOperation(operation: AdmittedOperation): AdmittedOperation {
    const authority = admittedOperationAuthorities.get(operation);
    if (authority?.journal !== this) {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    this.#assertLive();
    return operation;
  }

  readIntent(operationId: string): OperationBinding | undefined {
    this.#assertLive();
    const path = this.#path(dataRootReceiptIntentPath(operationId));
    try {
      return requireOperationBinding(
        parseCanonicalJson(
          readStableRegularFile(path, WORLD_PROJECT_OPERATION_RECORD_MAX_BYTES),
        ),
      );
    } catch (error) {
      if (syscallCode(error) === "ENOENT") return undefined;
      throw error;
    }
  }

  readResult(
    operationId: string,
    binding: OperationBinding,
  ): OperationTerminalResult | undefined {
    this.#assertLive();
    const path = this.#path(dataRootReceiptResultPath(operationId));
    try {
      return requireOperationTerminalResult(
        parseCanonicalJson(
          readStableRegularFile(path, WORLD_PROJECT_OPERATION_RECORD_MAX_BYTES),
        ),
        binding,
      );
    } catch (error) {
      if (syscallCode(error) === "ENOENT") return undefined;
      throw error;
    }
  }

  listBindings(): readonly OperationBinding[] {
    this.#assertLive();
    const receiptsPath = this.#path("receipts");
    const names = readdirSync(receiptsPath);
    if (names.length > WORLD_PROJECT_OPERATION_MAX_RECEIPT_ENTRIES) {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    const intentIds = new Set<string>();
    const resultIds = new Set<string>();
    for (const name of names) {
      if (name.endsWith(".intent.json")) intentIds.add(name.slice(0, -".intent.json".length));
      else if (name.endsWith(".result.json")) resultIds.add(name.slice(0, -".result.json".length));
      else throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    for (const operationId of resultIds) {
      if (!intentIds.has(operationId)) {
        throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
      }
    }
    return [...intentIds]
      .sort()
      .map((operationId) => {
        const binding = this.readIntent(operationId);
        if (binding === undefined) throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
        // Existing result is decoded here too, so malformed terminal evidence blocks startup.
        this.readResult(operationId, binding);
        return binding;
      });
  }

  beginRecovery(bindingInput: OperationBinding): AdmittedOperation {
    this.#assertLive();
    const binding = requireOperationBinding(bindingInput);
    const published = this.readIntent(binding.operationId);
    if (
      published === undefined ||
      operationBindingDigest(published) !== operationBindingDigest(binding) ||
      this.readResult(binding.operationId, binding) !== undefined
    ) {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    const attemptToken = randomBytes(12).toString("hex");
    const attemptPath = this.#path(dataRootStagingPath(binding.operationId, attemptToken));
    mkdirSync(attemptPath, { mode: 0o700, recursive: false });
    syncDirectory(this.#path("staging"));
    return this.#mintOperation(
      binding,
      attemptPath,
      attemptToken,
      this.#path(dataRootReceiptIntentPath(binding.operationId)),
    );
  }

  /** 只读枚举并证明当前 durable intent 所拥有的全部既有 attempt。 */
  inspectExistingAttempts(
    bindingInput: OperationBinding,
  ): readonly AdmittedOperation[] {
    this.#assertLive();
    const binding = requireOperationBinding(bindingInput);
    const published = this.readIntent(binding.operationId);
    if (
      published === undefined ||
      operationBindingDigest(published) !== operationBindingDigest(binding)
    ) {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    const result = this.readResult(binding.operationId, binding);
    const stagingPath = this.#path("staging");
    const receiptIntent = this.#path(dataRootReceiptIntentPath(binding.operationId));
    const receiptResult = this.#path(dataRootReceiptResultPath(binding.operationId));
    const sameInode = (leftPath: string, rightPath: string): boolean => {
      try {
        const left = lstatSync(leftPath, { bigint: true });
        const right = lstatSync(rightPath, { bigint: true });
        return (left.mode & 0o170000n) === 0o100000n &&
          (right.mode & 0o170000n) === 0o100000n &&
          left.dev === right.dev && left.ino === right.ino;
      } catch (error) {
        if (syscallCode(error) === "ENOENT") return false;
        throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
      }
    };
    const attempts = readdirSync(stagingPath)
      .map((name) => {
        const separator = name.lastIndexOf("-");
        return {
          name,
          operationId: separator < 0 ? "" : name.slice(0, separator),
          token: separator < 0 ? "" : name.slice(separator + 1),
        };
      })
      .filter((entry) => entry.operationId === binding.operationId)
      .sort((left, right) => left.token.localeCompare(right.token))
      .map(({ token }) => {
        let expectedPath: string;
        try {
          expectedPath = this.#path(dataRootStagingPath(binding.operationId, token));
        } catch {
          throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
        }
        const stat = lstatSync(expectedPath, { bigint: true });
        if ((stat.mode & 0o170000n) !== 0o40000n || (stat.mode & 0o777n) !== 0o700n) {
          throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
        }
        const provenByIntent = sameInode(
          join(expectedPath, "operation-intent.json"),
          receiptIntent,
        );
        const provenByResult = sameInode(
          join(expectedPath, "operation-result.json"),
          receiptResult,
        ) && result !== undefined;
        if (!provenByIntent && !provenByResult) {
          throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
        }
        const attemptEntries = readdirSync(expectedPath);
        if (
          (attemptEntries.includes("operation-intent.json") && !provenByIntent) ||
          (attemptEntries.includes("operation-result.json") && !provenByResult)
        ) {
          throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
        }
        const attempt = this.#mintOperation(
          binding,
          expectedPath,
          token,
          receiptIntent,
        );
        return attempt;
      });
    return Object.freeze(attempts);
  }

  /**
   * Existing result 只有在当前 live lease 下重新完成 receipts directory fsync，
   * 才能被提升为 cleanup authority。仅可读 path 不是 durability proof。
   */
  confirmExistingTerminal(
    bindingInput: OperationBinding,
  ): {
    readonly operation: AdmittedOperation;
    readonly attempts: readonly AdmittedOperation[];
    readonly result: OperationTerminalResult;
  } {
    this.#assertLive();
    const binding = requireOperationBinding(bindingInput);
    const result = this.readResult(binding.operationId, binding);
    if (result === undefined) {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    try {
      syncReceiptsDirectory(this.#path("receipts"));
    } catch {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    this.#assertLive();
    const attempts = this.inspectExistingAttempts(binding);
    for (const attempt of attempts) {
      admittedOperationAuthorities.get(attempt)!.terminalized = true;
    }
    const receiptIntent = this.#path(dataRootReceiptIntentPath(binding.operationId));
    const operation = attempts[0] ?? this.#mintOperation(
      binding,
      "",
      "",
      receiptIntent,
    );
    admittedOperationAuthorities.get(operation)!.terminalized = true;
    return Object.freeze({
      operation,
      attempts: Object.freeze(attempts),
      result,
    });
  }

  admit(input: OperationBinding): OperationAdmission {
    this.#assertLive();
    const binding = requireOperationBinding(input);
    const existingIntent = this.readIntent(binding.operationId);
    if (existingIntent !== undefined) {
      if (operationBindingDigest(existingIntent) !== operationBindingDigest(binding)) {
        throw new OperationJournalError("OPERATION_BINDING_CONFLICT");
      }
      const result = this.readResult(binding.operationId, binding);
      if (result !== undefined) return { status: "replay", result };
      return {
        status: "admitted",
        operation: this.#mintOperation(
          binding,
          "",
          "",
          this.#path(dataRootReceiptIntentPath(binding.operationId)),
        ),
      };
    }

    const attemptToken = randomBytes(12).toString("hex");
    const attemptPath = this.#path(
      dataRootStagingPath(binding.operationId, attemptToken),
    );
    mkdirSync(attemptPath, { mode: 0o700, recursive: false });
    const stagedIntent = join(attemptPath, "operation-intent.json");
    writeNewSyncedFile(stagedIntent, canonicalJsonBytes(binding));
    syncDirectory(attemptPath);
    const intentPath = this.#path(dataRootReceiptIntentPath(binding.operationId));
    try {
      linkSync(stagedIntent, intentPath);
      syncDirectory(this.#path("receipts"));
    } catch (error) {
      if (syscallCode(error) !== "EEXIST") throw error;
      const winner = this.readIntent(binding.operationId);
      if (
        winner === undefined ||
        operationBindingDigest(winner) !== operationBindingDigest(binding)
      ) {
        throw new OperationJournalError("OPERATION_BINDING_CONFLICT");
      }
    }
    this.#assertLive();
    return {
      status: "admitted",
      operation: this.#mintOperation(
        binding,
        attemptPath,
        attemptToken,
        intentPath,
      ),
    };
  }

  finalizeSuccess(operation: AdmittedOperation): OperationTerminalResult {
    return this.#finalize(operation, {
      schemaVersion: 1,
      operationId: operation.binding.operationId,
      bindingDigest: operation.bindingDigest,
      variant: "success",
      publishedIdentity: candidatePublishedIdentity(operation.binding),
    });
  }

  finalizeAborted(
    operation: AdmittedOperation,
    code: string,
  ): OperationTerminalResult {
    return this.#finalize(operation, {
      schemaVersion: 1,
      operationId: operation.binding.operationId,
      bindingDigest: operation.bindingDigest,
      variant: "aborted-before-publish",
      code,
    });
  }

  #finalize(
    operation: AdmittedOperation,
    input: OperationTerminalResult,
  ): OperationTerminalResult {
    this.#requireOwnedOperation(operation);
    const authority = admittedOperationAuthorities.get(operation)!;
    const result = requireOperationTerminalResult(input, operation.binding);
    const publishedPath = this.#path(
      dataRootReceiptResultPath(operation.binding.operationId),
    );
    const existing = this.readResult(operation.binding.operationId, operation.binding);
    if (existing !== undefined) {
      if (!Buffer.from(canonicalJsonBytes(existing)).equals(Buffer.from(canonicalJsonBytes(result)))) {
        throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
      }
      // A previously visible link may come from an earlier receipts fsync ambiguity.
      // This live operation only gains cleanup authority after completing the directory fsync now.
      try {
        syncReceiptsDirectory(this.#path("receipts"));
      } catch {
        throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
      }
      authority.terminalized = true;
      return existing;
    }
    if (operation.attemptPath.length === 0) {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    const stagedResult = join(operation.attemptPath, "operation-result.json");
    writeNewSyncedFile(stagedResult, canonicalJsonBytes(result));
    syncDirectory(operation.attemptPath);
    try {
      linkSync(stagedResult, publishedPath);
      syncReceiptsDirectory(this.#path("receipts"));
    } catch (error) {
      if (syscallCode(error) !== "EEXIST") {
        throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
      }
      const winner = this.readResult(operation.binding.operationId, operation.binding);
      if (
        winner === undefined ||
        !Buffer.from(canonicalJsonBytes(winner)).equals(Buffer.from(canonicalJsonBytes(result)))
      ) {
        throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
      }
      try {
        syncReceiptsDirectory(this.#path("receipts"));
      } catch {
        throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
      }
      authority.terminalized = true;
      return winner;
    }
    this.#assertLive();
    authority.terminalized = true;
    return result;
  }

  cleanupAttempt(operation: AdmittedOperation): void {
    this.#requireOwnedOperation(operation);
    if (!admittedOperationAuthorities.get(operation)?.terminalized) {
      throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
    }
    if (operation.attemptPath.length === 0) return;
    for (const name of [
      "operation-result.json",
      "operation-intent.json",
      "project.json",
      "project-directory.json",
      "artifact",
    ]) {
      try {
        unlinkSync(join(operation.attemptPath, name));
      } catch (error) {
        if (syscallCode(error) !== "ENOENT") throw error;
      }
    }
    try {
      rmdirSync(operation.attemptPath);
      syncDirectory(this.#path("staging"));
    } catch (error) {
      if (syscallCode(error) !== "ENOENT") throw error;
    }
  }
}

/** 只供同目录 focused tests 注入 receipts fsync fault，不进入 package root export。 */
export const OPERATION_JOURNAL_TEST_SEAMS = Object.freeze({
  replaceReceiptsDirectorySync(
    replacement: (path: string) => void,
  ): () => void {
    const previous = syncReceiptsDirectory;
    syncReceiptsDirectory = replacement;
    return () => {
      if (syncReceiptsDirectory === replacement) {
        syncReceiptsDirectory = previous;
      }
    };
  },
});

interface SingleFlightEntry<T> {
  readonly bindingDigest: string;
  readonly promise: Promise<T>;
  poisoned: boolean;
}

export class OperationSingleFlight {
  readonly #entries = new Map<string, SingleFlightEntry<unknown>>();

  async run<T>(
    binding: OperationBinding,
    signal: AbortSignal | undefined,
    leader: () => Promise<T>,
  ): Promise<T> {
    const canonical = requireOperationBinding(binding);
    const digest = operationBindingDigest(canonical);
    const existing = this.#entries.get(canonical.operationId) as
      | SingleFlightEntry<T>
      | undefined;
    if (existing !== undefined) {
      if (existing.bindingDigest !== digest) {
        throw new OperationJournalError("OPERATION_BINDING_CONFLICT");
      }
      if (existing.poisoned) {
        throw new OperationJournalError("OPERATION_RECOVERY_REQUIRED");
      }
      return awaitWithAbort(existing.promise, signal);
    }
    if (signal?.aborted) throw new OperationJournalError("REQUEST_ABORTED");
    const entry: SingleFlightEntry<T> = {
      bindingDigest: digest,
      promise: Promise.resolve().then(leader),
      poisoned: false,
    };
    this.#entries.set(canonical.operationId, entry);
    try {
      return await entry.promise;
    } catch (error) {
      if (
        error instanceof OperationJournalError &&
        error.code === "OPERATION_RECOVERY_REQUIRED"
      ) {
        entry.poisoned = true;
      }
      throw error;
    } finally {
      if (!entry.poisoned) this.#entries.delete(canonical.operationId);
    }
  }
}

function awaitWithAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(new OperationJournalError("REQUEST_ABORTED"));
  if (signal === undefined) return promise;
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new OperationJournalError("REQUEST_ABORTED"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}
