import { lstatSync, opendirSync } from "node:fs";
import { join } from "node:path";

import { canonicalJsonBytes, deepFreeze, sha256Hex } from "@demiurges/world";

import {
  requireLiveOpenedDataRoot,
  type OpenedDataRoot,
} from "./data-root";
import {
  generatedArtifactByBytesPointerPath,
  generatedArtifactBytesPath,
  generatedArtifactContentRecordPath,
  generatedArtifactProvenanceRecordPath,
  generatedArtifactSetRecordPath,
} from "./generated-artifact-layout";
import {
  generatedSetCatalogDigest,
  generatedSetPublicationBindingDigest,
  requireGeneratedSetPublicationBinding,
  requireGeneratedSetPublicationResult,
  type GeneratedSetCatalogBodyV1,
  type GeneratedSetPublicationBindingV1,
} from "./generated-artifact-publication";
import {
  requireGeneratedArtifactSetRecord,
  requireGenerationArtifactProvenanceRecord,
  requireVerifiedArtifactContentByBytesPointer,
  requireVerifiedArtifactContentRecord,
} from "./generated-artifact-records";
import {
  generationCatalogFilename,
  generationIdDigest,
  requireGenerationBirthPointer,
} from "./generation-birth";
import {
  requireGenerationIntent,
  type GenerationIntentV1,
  type GenerationProviderV1,
} from "./generation-contracts";
import { inspectDynamicArtifactBytes } from "./generation-artifact-inspector";
import { inspectGenerationNamespaceReadOnly } from "./generation-namespace-inspection";
import { GenerationRecordJournal } from "./generation-record-journal";
import { requireRemoteBoundPayload } from "./generation-state";
import {
  readStableDirectoryIdentity,
  readStableRegularFileSnapshot,
  sameStableDirectoryIdentity,
  type StableDirectoryIdentity,
} from "./safe-filesystem";

const CATALOG_MAX_ENTRIES = 256;
const RECORD_MAX_BYTES = 64 * 1024;
const CATALOG_FILENAME = /^[a-f0-9]{64}\.json$/;
const STAGING_MAX_ENTRIES = 2048;

type ReaderStage = "after-directory-snapshot";
let stageHook: ((stage: ReaderStage) => void) | undefined;

/** Package-internal fault seam for reader race tests; never exported by the package root. */
export const GENERATED_ARTIFACT_READER_TEST_SEAMS = Object.freeze({
  replaceStageHook(replacement: (stage: ReaderStage) => void): () => void {
    const previous = stageHook;
    stageHook = replacement;
    return () => {
      if (stageHook === replacement) stageHook = previous;
    };
  },
});

export type GeneratedArtifactReaderErrorCode =
  | "GENERATION_RECOVERY_REQUIRED"
  | "GENERATED_ARTIFACT_NOT_FOUND";

export class GeneratedArtifactReaderError extends Error {
  readonly code: GeneratedArtifactReaderErrorCode;

  constructor(code: GeneratedArtifactReaderErrorCode) {
    super(code);
    this.name = "GeneratedArtifactReaderError";
    this.code = code;
  }
}

export interface GeneratedArtifactMemberSummaryV1 {
  readonly assetId: `asset:generated-sha256-${string}`;
  readonly role: "world-spz-500k" | "world-collider-glb" | "object-glb";
  readonly format: "spz-v2" | "glb-2.0";
  readonly contentDigest: string;
  readonly byteLength: number;
  readonly elementCount: number;
  readonly sourceBounds: ReturnType<typeof requireVerifiedArtifactContentRecord>["sourceBounds"];
}

export interface GeneratedArtifactSetSummaryV1 {
  readonly generationId: `generation:sha256:${string}`;
  readonly provider: GenerationProviderV1;
  readonly artifactSetDigest: string;
  readonly members: readonly GeneratedArtifactMemberSummaryV1[];
}

interface VisibleSet {
  readonly summary: GeneratedArtifactSetSummaryV1;
  readonly catalogIdentity: { readonly dev: bigint; readonly ino: bigint; readonly mtimeNs: bigint; readonly ctimeNs: bigint };
  readonly directories: ReadonlyMap<string, StableDirectoryIdentity>;
  readonly members: readonly {
    readonly assetId: `asset:generated-sha256-${string}`;
    readonly bytesPath: string;
    readonly contentDigest: string;
    readonly byteLength: number;
    readonly bytesIdentity: { readonly dev: bigint; readonly ino: bigint; readonly mtimeNs: bigint; readonly ctimeNs: bigint };
  }[];
}

function recovery(): never {
  throw new GeneratedArtifactReaderError("GENERATION_RECOVERY_REQUIRED");
}

function notFound(): never {
  throw new GeneratedArtifactReaderError("GENERATED_ARTIFACT_NOT_FOUND");
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return Buffer.from(canonicalJsonBytes(left)).equals(Buffer.from(canonicalJsonBytes(right)));
}

function readCanonical(path: string, maximum = RECORD_MAX_BYTES): unknown {
  try {
    const bytes = readStableRegularFileSnapshot(path, maximum).bytes;
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!Buffer.from(bytes).equals(Buffer.from(canonicalJsonBytes(value)))) return recovery();
    return value;
  } catch (error) {
    if (error instanceof GeneratedArtifactReaderError) throw error;
    return recovery();
  }
}

function absent(path: string): boolean {
  try {
    lstatSync(path, { bigint: true });
    return false;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return true;
    return recovery();
  }
}

function exactDirectory(path: string): void {
  try {
    const stat = lstatSync(path, { bigint: true });
    if ((stat.mode & 0o170000n) !== 0o40000n || (stat.mode & 0o7777n) !== 0o700n) {
      return recovery();
    }
  } catch {
    return recovery();
  }
}

function freezeDirectories(
  rootPath: string,
  relativePaths: readonly string[],
): Map<string, StableDirectoryIdentity> {
  const frozen = new Map<string, StableDirectoryIdentity>();
  for (const relative of relativePaths) {
    const path = relative === "." ? rootPath : join(rootPath, relative);
    try {
      frozen.set(relative, readStableDirectoryIdentity(path));
    } catch {
      return recovery();
    }
  }
  return frozen;
}

function requireFrozenDirectories(
  rootPath: string,
  frozen: ReadonlyMap<string, StableDirectoryIdentity>,
): void {
  for (const [relative, expected] of frozen) {
    try {
      const path = relative === "." ? rootPath : join(rootPath, relative);
      if (!sameStableDirectoryIdentity(expected, readStableDirectoryIdentity(path))) {
        return recovery();
      }
    } catch {
      return recovery();
    }
  }
}

function catalogNames(rootPath: string): readonly string[] {
  const catalog = join(rootPath, "artifacts", "catalog");
  if (absent(catalog)) return [];
  exactDirectory(catalog);
  const names: string[] = [];
  let directory: ReturnType<typeof opendirSync> | undefined;
  try {
    directory = opendirSync(catalog);
    while (true) {
      const entry = directory.readSync();
      if (entry === null) break;
      names.push(entry.name);
      if (names.length > CATALOG_MAX_ENTRIES) return recovery();
      if (!CATALOG_FILENAME.test(entry.name)) return recovery();
      const stat = lstatSync(join(catalog, entry.name), { bigint: true });
      if ((stat.mode & 0o170000n) !== 0o100000n || (stat.mode & 0o7777n) !== 0o600n) {
        return recovery();
      }
    }
  } catch (error) {
    if (error instanceof GeneratedArtifactReaderError) throw error;
    return recovery();
  } finally {
    directory?.closeSync();
  }
  return names.sort();
}

function catalogBody(value: unknown): GeneratedSetCatalogBodyV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return recovery();
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== 4 ||
    !["generationId", "artifactSetDigest", "publicationOperationId", "publicationBindingDigest"].every((key) => Object.hasOwn(record, key)) ||
    typeof record.generationId !== "string" ||
    !/^generation:sha256:[a-f0-9]{64}$/.test(record.generationId) ||
    typeof record.artifactSetDigest !== "string" || !/^[a-f0-9]{64}$/.test(record.artifactSetDigest) ||
    typeof record.publicationOperationId !== "string" || !/^op:[A-Za-z0-9._-]{1,127}$/.test(record.publicationOperationId) ||
    typeof record.publicationBindingDigest !== "string" || !/^[a-f0-9]{64}$/.test(record.publicationBindingDigest)
  ) return recovery();
  return deepFreeze({
    generationId: record.generationId as `generation:sha256:${string}`,
    artifactSetDigest: record.artifactSetDigest,
    publicationOperationId: record.publicationOperationId,
    publicationBindingDigest: record.publicationBindingDigest,
  }) as GeneratedSetCatalogBodyV1;
}

function publicationBinding(
  generationId: `generation:sha256:${string}`,
  set: ReturnType<typeof requireGeneratedArtifactSetRecord>,
): GeneratedSetPublicationBindingV1 {
  return requireGeneratedSetPublicationBinding({
    schemaVersion: 1,
    operationId: `op:${sha256Hex(new TextEncoder().encode(
      `demiurges-generated-set-publication-v1\0${generationId}\0${set.artifactSetDigest}`,
    ))}`,
    operationKind: "artifact.publish-generated-set",
    target: { kind: "registry", id: "registry:generated-artifact-sets-v1" },
    expectedIdentity: null,
    candidateIdentity: {
      generationId,
      artifactSetDigest: set.artifactSetDigest,
      orderedContentRecordDigests: set.orderedMembers.map((member) => member.contentRecordDigest),
      orderedProvenanceRecordDigests: set.orderedMembers.map((member) => member.provenanceRecordDigest),
    },
  });
}

function latestRemoteBound(chain: readonly { readonly state: string; readonly payload: unknown }[]) {
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    if (chain[index]!.state === "remote_bound") return chain[index]!;
  }
  return recovery();
}

/** Package-internal closed role/format rule shared by the durable reader join. */
export function requireGeneratedArtifactReaderRoleFormat(
  role: GeneratedArtifactMemberSummaryV1["role"],
  format: GeneratedArtifactMemberSummaryV1["format"],
): void {
  if (
    (role === "world-spz-500k" && format !== "spz-v2") ||
    (role !== "world-spz-500k" && format !== "glb-2.0")
  ) return recovery();
}

function fileIdentity(path: string): { readonly dev: bigint; readonly ino: bigint; readonly mtimeNs: bigint; readonly ctimeNs: bigint } {
  try {
    const stat = lstatSync(path, { bigint: true });
    if ((stat.mode & 0o170000n) !== 0o100000n || (stat.mode & 0o7777n) !== 0o600n) return recovery();
    return { dev: stat.dev, ino: stat.ino, mtimeNs: stat.mtimeNs, ctimeNs: stat.ctimeNs };
  } catch {
    return recovery();
  }
}

function sameFileIdentity(
  left: { readonly dev: bigint; readonly ino: bigint; readonly mtimeNs: bigint; readonly ctimeNs: bigint },
  right: { readonly dev: bigint; readonly ino: bigint; readonly mtimeNs: bigint; readonly ctimeNs: bigint },
): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function requirePublicationAttemptLinks(
  rootPath: string,
  operationId: string,
  catalogPath: string,
  catalog: GeneratedSetCatalogBodyV1,
  resultPath: string,
  result: unknown,
  binding: GeneratedSetPublicationBindingV1,
  frozenDirectories: ReadonlyMap<string, StableDirectoryIdentity>,
): ReadonlyMap<string, StableDirectoryIdentity> {
  const staging = join(rootPath, "staging");
  exactDirectory(staging);
  const candidates: string[] = [];
  let entryCount = 0;
  let directory: ReturnType<typeof opendirSync> | undefined;
  try {
    directory = opendirSync(staging);
    while (true) {
      const entry = directory.readSync();
      if (entry === null) break;
      entryCount += 1;
      if (entryCount > STAGING_MAX_ENTRIES) return recovery();
      if (entry.name.startsWith(`${operationId}-`)) candidates.push(entry.name);
      if (candidates.length > 1) return recovery();
    }
  } catch (error) {
    if (error instanceof GeneratedArtifactReaderError) throw error;
    return recovery();
  } finally {
    directory?.closeSync();
  }
  if (candidates.length !== 1 || !/^[0-9a-f]{24}$/.test(candidates[0]!.slice(operationId.length + 1))) return recovery();
  const attempt = join(staging, candidates[0]!);
  exactDirectory(attempt);
  const attemptRelative = `staging/${candidates[0]!}`;
  const allDirectories = new Map(frozenDirectories);
  allDirectories.set(attemptRelative, readStableDirectoryIdentity(attempt));
  for (const [stagedName, finalPath, expected] of [
    ["operation-intent.json", join(rootPath, "receipts", `${operationId}.intent.json`), canonicalJsonBytes(binding)],
    ["catalog.json", catalogPath, canonicalJsonBytes(catalog)],
    ["result.json", resultPath, canonicalJsonBytes(result)],
  ] as const) {
    try {
      const staged = readStableRegularFileSnapshot(join(attempt, stagedName), RECORD_MAX_BYTES);
      const final = readStableRegularFileSnapshot(finalPath, RECORD_MAX_BYTES);
      const stagedStat = lstatSync(join(attempt, stagedName), { bigint: true });
      const finalStat = lstatSync(finalPath, { bigint: true });
      if (
        !Buffer.from(staged.bytes).equals(Buffer.from(expected)) ||
        !Buffer.from(final.bytes).equals(Buffer.from(expected)) ||
        staged.identity.dev !== final.identity.dev ||
        staged.identity.ino !== final.identity.ino ||
        stagedStat.nlink < 2n ||
        finalStat.nlink < 2n
      ) return recovery();
    } catch {
      return recovery();
    }
  }
  requireFrozenDirectories(rootPath, allDirectories);
  return allDirectories;
}

function joinVisibleSet(root: OpenedDataRoot, catalogName: string): VisibleSet {
  const rootPath = requireLiveOpenedDataRoot(root).absolutePath;
  const directories = freezeDirectories(rootPath, [
    ".",
    "receipts",
    "receipts/generations",
    "receipts/generations/data",
    "receipts/generations/catalog",
    "artifacts",
    "artifacts/catalog",
    "staging",
  ]);
  stageHook?.("after-directory-snapshot");
  const catalogPath = join(rootPath, "artifacts", "catalog", catalogName);
  const catalog = catalogBody(readCanonical(catalogPath));
  const catalogIdentity = fileIdentity(catalogPath);
  if (`${generationIdDigest(catalog.generationId)}.json` !== catalogName) return recovery();
  const generationPath = join(rootPath, "receipts", "generations", "data", generationIdDigest(catalog.generationId));
  for (const relative of [
    `receipts/generations/data/${generationIdDigest(catalog.generationId)}`,
    `receipts/generations/data/${generationIdDigest(catalog.generationId)}/records`,
    "artifacts/sha256",
    "artifacts/records",
    "artifacts/records/content",
    "artifacts/records/content/sha256",
    "artifacts/records/content/by-bytes",
    "artifacts/records/content/by-bytes/sha256",
    "artifacts/records/provenance",
    "artifacts/records/provenance/sha256",
    "artifacts/sets",
    "artifacts/sets/sha256",
  ]) {
    try {
      directories.set(relative, readStableDirectoryIdentity(join(rootPath, relative)));
    } catch {
      return recovery();
    }
  }
  const intent = requireGenerationIntent(readCanonical(join(generationPath, "intent.json"))) as GenerationIntentV1;
  if (intent.generationId !== catalog.generationId) return recovery();
  const journal = new GenerationRecordJournal(root, intent);
  const chain = journal.readValidatedChain();
  const admitted = chain[0];
  const current = chain[chain.length - 1];
  if (admitted === undefined || current === undefined || admitted.state !== "admitted" || current.state !== "verified") return recovery();
  requireGenerationBirthPointer(
    readCanonical(join(rootPath, "receipts", "generations", "catalog", generationCatalogFilename(intent.generationId))),
    intent,
    admitted,
  );

  const set = requireGeneratedArtifactSetRecord(readCanonical(join(
    rootPath,
    generatedArtifactSetRecordPath(catalog.artifactSetDigest),
  )));
  if (set.generationId !== intent.generationId || set.provider !== intent.provider || set.artifactSetDigest !== catalog.artifactSetDigest) return recovery();
  const binding = publicationBinding(intent.generationId, set);
  const bindingDigest = generatedSetPublicationBindingDigest(binding);
  if (
    catalog.publicationOperationId !== binding.operationId ||
    catalog.publicationBindingDigest !== bindingDigest ||
    generatedSetCatalogDigest(catalog) !== generatedSetCatalogDigest({
      generationId: intent.generationId,
      artifactSetDigest: set.artifactSetDigest,
      publicationOperationId: binding.operationId,
      publicationBindingDigest: bindingDigest,
    }) ||
    current.payload.artifactSetDigest !== set.artifactSetDigest ||
    current.payload.publicationOperationId !== binding.operationId
  ) return recovery();
  const resultPath = join(rootPath, "receipts", `${binding.operationId}.result.json`);
  const resultValue = readCanonical(resultPath);
  const result = requireGeneratedSetPublicationResult(
    resultValue,
    binding,
  );
  if (result.variant !== "success") return recovery();
  const publicationDirectories = requirePublicationAttemptLinks(
    rootPath,
    binding.operationId,
    catalogPath,
    catalog,
    resultPath,
    resultValue,
    binding,
    directories,
  );
  const remote = requireRemoteBoundPayload(latestRemoteBound(chain).payload, intent.provider);

  const members = set.orderedMembers.map((member) => {
    const content = requireVerifiedArtifactContentRecord(readCanonical(join(
      rootPath, generatedArtifactContentRecordPath(member.contentRecordDigest),
    )));
    const provenance = requireGenerationArtifactProvenanceRecord(readCanonical(join(
      rootPath, generatedArtifactProvenanceRecordPath(member.provenanceRecordDigest),
    )));
    const pointer = requireVerifiedArtifactContentByBytesPointer(readCanonical(join(
      rootPath, generatedArtifactByBytesPointerPath(content.digest),
    )));
    if (
      content.recordDigest !== member.contentRecordDigest ||
      provenance.recordDigest !== member.provenanceRecordDigest ||
      provenance.generationId !== intent.generationId ||
      provenance.provider !== intent.provider ||
      provenance.providerJobId !== remote.remoteJobId ||
      provenance.generationRequestDigest !== intent.requestDigest ||
      provenance.outputRole !== member.outputRole ||
      provenance.contentRecordDigest !== content.recordDigest ||
      pointer.assetId !== content.assetId ||
      pointer.contentDigest !== content.digest ||
      pointer.contentRecordDigest !== content.recordDigest
    ) return recovery();
    requireGeneratedArtifactReaderRoleFormat(member.outputRole, content.format);
    const bytesPath = join(rootPath, generatedArtifactBytesPath(content.digest));
    let bytes: Uint8Array;
    let bytesIdentity: ReturnType<typeof fileIdentity>;
    try {
      const snapshot = readStableRegularFileSnapshot(bytesPath, content.byteLength);
      bytes = snapshot.bytes;
      bytesIdentity = {
        dev: snapshot.identity.dev,
        ino: snapshot.identity.ino,
        mtimeNs: snapshot.identity.mtimeNs,
        ctimeNs: snapshot.identity.ctimeNs,
      };
    } catch {
      return recovery();
    }
    if (bytes.byteLength !== content.byteLength || sha256Hex(bytes) !== content.digest) return recovery();
    const inspection = inspectDynamicArtifactBytes(content.format, bytes);
    if (!sameCanonical(inspection.descriptor, content.inspectorDescriptor) || inspection.descriptorDigest !== content.inspectorDescriptorDigest) return recovery();
    return {
      assetId: content.assetId,
      bytesPath,
      contentDigest: content.digest,
      byteLength: content.byteLength,
      bytesIdentity,
      summary: deepFreeze({
        assetId: content.assetId,
        role: member.outputRole,
        format: content.format,
        contentDigest: content.digest,
        byteLength: content.byteLength,
        elementCount: content.elementCount,
        sourceBounds: content.sourceBounds,
      }) as GeneratedArtifactMemberSummaryV1,
    };
  });
  const after = requireLiveOpenedDataRoot(root);
  if (after.identity.dev !== root.identity.dev || after.identity.ino !== root.identity.ino) return recovery();
  requireFrozenDirectories(rootPath, publicationDirectories);
  return deepFreeze({
    summary: {
      generationId: intent.generationId,
      provider: intent.provider,
      artifactSetDigest: set.artifactSetDigest,
      members: members.map((member) => member.summary),
    },
    catalogIdentity,
    directories: publicationDirectories,
    members: members.map(({ summary: _summary, ...member }) => member),
  }) as VisibleSet;
}

/** Read-only facade for complete, terminally verified dynamic generated sets. */
export class GeneratedArtifactReader {
  readonly #root: OpenedDataRoot;

  constructor(root: OpenedDataRoot) {
    requireLiveOpenedDataRoot(root);
    this.#root = root;
  }

  list(): readonly GeneratedArtifactSetSummaryV1[] {
    const namespace = inspectGenerationNamespaceReadOnly(this.#root);
    const rootPath = requireLiveOpenedDataRoot(this.#root).absolutePath;
    const names = catalogNames(rootPath);
    if (namespace.state === "absent-no-intent") {
      if (names.length !== 0) return recovery();
      return deepFreeze([]) as readonly GeneratedArtifactSetSummaryV1[];
    }
    if (namespace.state !== "terminal-installed") return recovery();
    return deepFreeze(names.map((name) => joinVisibleSet(this.#root, name).summary)) as readonly GeneratedArtifactSetSummaryV1[];
  }

  read(generationId: string, assetId: string): Uint8Array {
    if (!/^generation:sha256:[a-f0-9]{64}$/.test(generationId) || !/^asset:generated-sha256-[a-f0-9]{64}$/.test(assetId)) {
      return notFound();
    }
    const summary = this.list().find((entry) => entry.generationId === generationId);
    if (summary === undefined) return notFound();
    const catalogName = `${generationIdDigest(summary.generationId)}.json`;
    const phaseA = joinVisibleSet(this.#root, catalogName);
    const member = phaseA.members.find((entry) => entry.assetId === assetId);
    if (member === undefined) return notFound();
    const visible = joinVisibleSet(this.#root, catalogName);
    const stableMember = visible.members.find((entry) => entry.assetId === assetId);
    if (
      stableMember === undefined ||
      !sameFileIdentity(phaseA.catalogIdentity, visible.catalogIdentity) ||
      !sameFileIdentity(member.bytesIdentity, stableMember.bytesIdentity)
    ) return recovery();
    try {
      const snapshot = readStableRegularFileSnapshot(stableMember.bytesPath, stableMember.byteLength);
      if (
        !sameFileIdentity(stableMember.bytesIdentity, {
          dev: snapshot.identity.dev,
          ino: snapshot.identity.ino,
          mtimeNs: snapshot.identity.mtimeNs,
          ctimeNs: snapshot.identity.ctimeNs,
        }) ||
        snapshot.bytes.byteLength !== stableMember.byteLength ||
        sha256Hex(snapshot.bytes) !== stableMember.contentDigest
      ) return recovery();
      requireFrozenDirectories(
        requireLiveOpenedDataRoot(this.#root).absolutePath,
        visible.directories,
      );
      const bytes = snapshot.bytes;
      return new Uint8Array(bytes);
    } catch (error) {
      if (error instanceof GeneratedArtifactReaderError) throw error;
      return recovery();
    }
  }
}
