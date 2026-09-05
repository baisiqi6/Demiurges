import { canonicalJsonBytes, deepFreeze } from "@demiurges/world";
import { fstatSync, lstatSync } from "node:fs";
import { join } from "node:path";

import {
  requireLiveOpenedDataRoot,
  type OpenedDataRoot,
} from "./data-root";
import { generationIdDigest } from "./generation-birth";
import {
  requireGeneratedSetCandidatePlanOrigin,
  type GeneratedSetCandidatePlanV1,
} from "./generated-set-candidate-plan";
import {
  createVerifiedArtifactContentByBytesPointer,
  deriveVerifiedArtifactContentRecord,
  GENERATED_ARTIFACT_RECORD_MAX_BYTES,
  requireGeneratedArtifactSetRecord,
  requireGenerationArtifactProvenanceRecord,
  requireVerifiedArtifactContentByBytesPointer,
  requireVerifiedArtifactContentRecord,
  type GeneratedArtifactSetRecordV1,
  type GenerationArtifactProvenanceRecordV1,
  type VerifiedArtifactContentByBytesPointerBodyV1,
  type VerifiedArtifactContentRecordV1,
} from "./generated-artifact-records";
import {
  generatedArtifactByBytesPointerPath,
  generatedArtifactBytesPath,
  generatedArtifactContentRecordPath,
  generatedArtifactProvenanceRecordPath,
  generatedArtifactSetRecordPath,
} from "./generated-artifact-layout";
import {
  GenerationCodecError,
  type GenerationProviderV1,
} from "./generation-contracts";
import { inspectDynamicArtifactBytes } from "./generation-artifact-inspector";
import {
  type ArtifactFileIdentityV1,
  type GeneratedArtifactOutputRole,
} from "./generation-output-contracts";
import {
  readStableRegularFileSnapshot,
} from "./safe-filesystem";

/**
 * 只读 storage preflight：把 origin-checked `GeneratedSetCandidatePlanV1` 绑定到当前
 * Data Root 的 storage 证据。本模块零 mutation（不 mkdir/write/link/unlink/rename/
 * fsync），不 inspect/derive publication Operation intent/result 或 public catalog。
 */

export interface GeneratedSetStorageDirectoryIdentityV1 {
  readonly dev: string;
  readonly ino: string;
  readonly mode: 0o700;
  readonly uid: number;
  readonly gid: number;
}

export interface GeneratedSetStorageFileIdentityV1 {
  readonly dev: string;
  readonly ino: string;
  readonly mode: 0o600;
  readonly uid: number;
  readonly gid: number;
  readonly size: number;
  readonly mtimeNs: string;
  readonly ctimeNs: string;
}

export type GeneratedSetStorageTargetStatusV1 =
  | {
      readonly kind: "absent";
      readonly deepestExistingAncestor: string;
      readonly ancestorIdentity: GeneratedSetStorageDirectoryIdentityV1;
      readonly missingSegments: readonly string[];
    }
  | {
      readonly kind: "existing";
      readonly fileIdentity: GeneratedSetStorageFileIdentityV1;
    };

export interface GeneratedSetStorageTargetObservationV1 {
  readonly relativePath: string;
  readonly status: GeneratedSetStorageTargetStatusV1;
}

export interface GeneratedSetStorageContentObservationV1 {
  readonly contentDigest: string;
  readonly contentRecord: VerifiedArtifactContentRecordV1;
  readonly byBytesPointer: VerifiedArtifactContentByBytesPointerBodyV1;
  readonly bytesCas: GeneratedSetStorageTargetObservationV1;
  readonly contentRecordTarget: GeneratedSetStorageTargetObservationV1;
  readonly byBytesPointerTarget: GeneratedSetStorageTargetObservationV1;
}

export interface GeneratedSetStorageMemberObservationV1 {
  readonly outputRole: GeneratedArtifactOutputRole;
  readonly candidateName: string;
  readonly expectedFileIdentity: ArtifactFileIdentityV1;
  readonly privateCandidate: GeneratedSetStorageTargetObservationV1;
  readonly provenanceRecord: GenerationArtifactProvenanceRecordV1;
  readonly provenanceTarget: GeneratedSetStorageTargetObservationV1;
  /** snapshot.content 下标（legal plan 内与 member 顺序 1:1）。 */
  readonly contentObservationIndex: number;
}

export interface GeneratedSetStoragePreflightSnapshotV1 {
  readonly schemaVersion: 1;
  readonly kind: "generated-set-storage-preflight-v1";
  readonly generationId: `generation:sha256:${string}`;
  readonly provider: GenerationProviderV1;
  readonly artifactSetDigest: string;
  readonly rootIdentity: { readonly dev: string; readonly ino: string };
  readonly content: readonly GeneratedSetStorageContentObservationV1[];
  readonly members: readonly GeneratedSetStorageMemberObservationV1[];
  readonly setRecord: GeneratedArtifactSetRecordV1;
  readonly setTarget: GeneratedSetStorageTargetObservationV1;
}

interface PreflightOrigin {
  readonly root: OpenedDataRoot;
  readonly rootIdentity: { readonly dev: bigint; readonly ino: bigint };
  readonly plan: GeneratedSetCandidatePlanV1;
}

const preflightOrigins = new WeakMap<object, PreflightOrigin>();

type BigIntStat = {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mode: bigint;
  readonly uid: bigint;
  readonly gid: bigint;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
};

type ObservedDirectoryIdentity = GeneratedSetStorageDirectoryIdentityV1;
type ObservedFileIdentity = GeneratedSetStorageFileIdentityV1;

type WalkOutcome =
  | {
      readonly kind: "full";
      readonly ancestorPath: string;
      readonly ancestorIdentity: ObservedDirectoryIdentity;
      readonly fileIdentity: ObservedFileIdentity;
    }
  | {
      readonly kind: "absent";
      readonly ancestorPath: string;
      readonly ancestorIdentity: ObservedDirectoryIdentity;
      readonly missingSegments: readonly string[];
    };

function invalid(): never {
  throw new GenerationCodecError("GENERATION_RECOVERY_REQUIRED");
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return Buffer.from(canonicalJsonBytes(left)).equals(
    Buffer.from(canonicalJsonBytes(right)),
  );
}

function decimal(value: bigint): string {
  return value.toString();
}

function directoryIdentityFromStat(stat: BigIntStat): ObservedDirectoryIdentity {
  // exact 0700：连同 setuid/setgid/sticky 等特殊位一起拒绝。
  if (
    (stat.mode & 0o170000n) !== 0o40000n ||
    (stat.mode & 0o7777n) !== 0o700n
  ) {
    return invalid();
  }
  return {
    dev: decimal(stat.dev),
    ino: decimal(stat.ino),
    mode: 0o700,
    uid: Number(stat.uid),
    gid: Number(stat.gid),
  };
}

function fileIdentityFromStat(stat: BigIntStat): ObservedFileIdentity {
  // exact 0600：连同 setuid/setgid/sticky 等特殊位一起拒绝。
  if (
    (stat.mode & 0o170000n) !== 0o100000n ||
    (stat.mode & 0o7777n) !== 0o600n ||
    stat.size < 0n ||
    stat.size > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    return invalid();
  }
  return {
    dev: decimal(stat.dev),
    ino: decimal(stat.ino),
    mode: 0o600,
    uid: Number(stat.uid),
    gid: Number(stat.gid),
    size: Number(stat.size),
    mtimeNs: decimal(stat.mtimeNs),
    ctimeNs: decimal(stat.ctimeNs),
  };
}

function sameDirectoryIdentity(
  left: ObservedDirectoryIdentity,
  right: ObservedDirectoryIdentity,
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.uid === right.uid &&
    left.gid === right.gid
  );
}

function sameFileIdentity(
  left: ObservedFileIdentity,
  right: ObservedFileIdentity,
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.uid === right.uid &&
    left.gid === right.gid &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function sameSegments(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function splitRelativePath(relativePath: string): readonly string[] {
  const segments = relativePath.split("/");
  if (
    segments.length === 0 ||
    segments.some((segment) =>
      segment.length === 0 || segment === "." || segment === "..")
  ) {
    return invalid();
  }
  return segments;
}

function isSafeCandidateName(name: string): boolean {
  return (
    name.length > 0 &&
    name !== "." &&
    name !== ".." &&
    !name.includes("/") &&
    !name.includes("\\")
  );
}

function lstatNoFollow(path: string): BigIntStat | null {
  try {
    return lstatSync(path, { bigint: true });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    return invalid();
  }
}

/**
 * 从 root 沿固定 segments 向下走。任何已存在 segment 必须是 exact 0700 directory；
 * 目标 segment 必须是 exact 0600 regular file。第一个缺失 segment 之后全部视为
 * missing descendants。wrong type / symlink / mode 漂移一律 fail closed。
 */
function walkTarget(
  rootPath: string,
  segments: readonly string[],
  rootDirectoryIdentity: ObservedDirectoryIdentity,
): WalkOutcome {
  let ancestorPath = "";
  let ancestorIdentity = rootDirectoryIdentity;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    const stat = lstatNoFollow(join(rootPath, ancestorPath, segment));
    if (stat === null) {
      return {
        kind: "absent",
        ancestorPath,
        ancestorIdentity,
        missingSegments: segments.slice(index),
      };
    }
    if (index < segments.length - 1) {
      ancestorPath = ancestorPath === "" ? segment : `${ancestorPath}/${segment}`;
      ancestorIdentity = directoryIdentityFromStat(stat);
      continue;
    }
    return {
      kind: "full",
      ancestorPath,
      ancestorIdentity,
      fileIdentity: fileIdentityFromStat(stat),
    };
  }
  return invalid();
}

function parseCanonicalJsonBytes(bytes: Uint8Array): unknown {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return invalid();
  }
  if (!Buffer.from(canonicalJsonBytes(value)).equals(Buffer.from(bytes))) {
    return invalid();
  }
  return value;
}

function readTargetFile(
  absolutePath: string,
  maxBytes: number,
  verify: (bytes: Uint8Array) => void,
): { readonly identity: ObservedFileIdentity; readonly bytes: Uint8Array } {
  let rawIdentity: BigIntStat;
  let bytes: Uint8Array;
  try {
    const result = readStableRegularFileSnapshot(absolutePath, maxBytes);
    rawIdentity = result.identity;
    bytes = result.bytes;
  } catch {
    return invalid();
  }
  const identity = fileIdentityFromStat(rawIdentity);
  verify(bytes);
  return { identity, bytes };
}

function observeExistingFile(
  rootPath: string,
  relativePath: string,
  rootDirectoryIdentity: ObservedDirectoryIdentity,
  maxBytes: number,
  verify: (bytes: Uint8Array) => void,
  firstWalk: WalkOutcome | undefined,
): GeneratedSetStorageTargetObservationV1 {
  const segments = splitRelativePath(relativePath);
  const first = firstWalk ?? walkTarget(rootPath, segments, rootDirectoryIdentity);
  if (first.kind !== "full") return invalid();
  const read = readTargetFile(join(rootPath, relativePath), maxBytes, verify);
  const second = walkTarget(rootPath, segments, rootDirectoryIdentity);
  if (
    second.kind !== "full" ||
    !sameDirectoryIdentity(first.ancestorIdentity, second.ancestorIdentity) ||
    !sameFileIdentity(read.identity, second.fileIdentity)
  ) {
    return invalid();
  }
  return {
    relativePath,
    status: { kind: "existing", fileIdentity: read.identity },
  };
}

function observePublicTarget(
  rootPath: string,
  relativePath: string,
  rootDirectoryIdentity: ObservedDirectoryIdentity,
  maxBytes: number,
  verify: (bytes: Uint8Array) => void,
): GeneratedSetStorageTargetObservationV1 {
  const segments = splitRelativePath(relativePath);
  const first = walkTarget(rootPath, segments, rootDirectoryIdentity);
  if (first.kind === "absent") {
    const second = walkTarget(rootPath, segments, rootDirectoryIdentity);
    if (
      second.kind !== "absent" ||
      !sameDirectoryIdentity(first.ancestorIdentity, second.ancestorIdentity) ||
      !sameSegments(first.missingSegments, second.missingSegments)
    ) {
      return invalid();
    }
    return {
      relativePath,
      status: {
        kind: "absent",
        deepestExistingAncestor: first.ancestorPath,
        ancestorIdentity: first.ancestorIdentity,
        missingSegments: first.missingSegments,
      },
    };
  }
  return observeExistingFile(
    rootPath,
    relativePath,
    rootDirectoryIdentity,
    maxBytes,
    verify,
    first,
  );
}

function verifyCanonicalRecordFile<T>(
  decode: (parsed: unknown) => T,
  expected: T,
): (bytes: Uint8Array) => void {
  return (bytes) => {
    const decoded = decode(parseCanonicalJsonBytes(bytes));
    if (!sameCanonical(decoded, expected)) invalid();
  };
}

function verifyBytesCas(
  contentRecord: VerifiedArtifactContentRecordV1,
): (bytes: Uint8Array) => void {
  return (bytes) => {
    if (bytes.byteLength !== contentRecord.byteLength) invalid();
    const contentRecordFromBytes = deriveVerifiedArtifactContentRecord(
      inspectDynamicArtifactBytes(contentRecord.format, bytes),
    );
    if (!sameCanonical(contentRecordFromBytes, contentRecord)) invalid();
  };
}

function observePrivateCandidate(
  rootPath: string,
  plan: GeneratedSetCandidatePlanV1,
  member: GeneratedSetCandidatePlanV1["orderedMembers"][number],
  rootDirectoryIdentity: ObservedDirectoryIdentity,
): GeneratedSetStorageTargetObservationV1 {
  if (!isSafeCandidateName(member.candidateName)) return invalid();
  const relativePath = `receipts/generations/data/${generationIdDigest(plan.generationId)}/downloads/${member.candidateName}`;
  const observation = observeExistingFile(
    rootPath,
    relativePath,
    rootDirectoryIdentity,
    member.contentRecord.byteLength,
    (bytes) => {
      if (bytes.byteLength !== member.contentRecord.byteLength) invalid();
      let contentRecord: VerifiedArtifactContentRecordV1;
      try {
        contentRecord = deriveVerifiedArtifactContentRecord(
          inspectDynamicArtifactBytes(member.contentRecord.format, bytes),
        );
      } catch {
        return invalid();
      }
      if (!sameCanonical(contentRecord, member.contentRecord)) invalid();
      if (
        !sameCanonical(
          createVerifiedArtifactContentByBytesPointer(contentRecord),
          member.byBytesPointer,
        )
      ) {
        invalid();
      }
    },
    undefined,
  );
  if (observation.status.kind !== "existing") return invalid();
  const identity = observation.status.fileIdentity;
  if (
    identity.dev !== member.fileIdentity.dev ||
    identity.ino !== member.fileIdentity.ino ||
    identity.mode !== member.fileIdentity.mode ||
    identity.uid !== member.fileIdentity.uid ||
    identity.gid !== member.fileIdentity.gid
  ) {
    return invalid();
  }
  return observation;
}

function observeContent(
  rootPath: string,
  member: GeneratedSetCandidatePlanV1["orderedMembers"][number],
  rootDirectoryIdentity: ObservedDirectoryIdentity,
): GeneratedSetStorageContentObservationV1 {
  const contentRecord = member.contentRecord;
  return {
    contentDigest: contentRecord.digest,
    contentRecord,
    byBytesPointer: member.byBytesPointer,
    bytesCas: observePublicTarget(
      rootPath,
      generatedArtifactBytesPath(contentRecord.digest),
      rootDirectoryIdentity,
      contentRecord.byteLength,
      verifyBytesCas(contentRecord),
    ),
    contentRecordTarget: observePublicTarget(
      rootPath,
      generatedArtifactContentRecordPath(contentRecord.recordDigest),
      rootDirectoryIdentity,
      GENERATED_ARTIFACT_RECORD_MAX_BYTES,
      verifyCanonicalRecordFile(requireVerifiedArtifactContentRecord, contentRecord),
    ),
    byBytesPointerTarget: observePublicTarget(
      rootPath,
      generatedArtifactByBytesPointerPath(contentRecord.digest),
      rootDirectoryIdentity,
      GENERATED_ARTIFACT_RECORD_MAX_BYTES,
      verifyCanonicalRecordFile(
        requireVerifiedArtifactContentByBytesPointer,
        member.byBytesPointer,
      ),
    ),
  };
}

/**
 * 重新 inspect 当前 Data Root 与 origin-checked plan，返回 deep-frozen snapshot。
 * 只读：不创建、不写入、不删除、不 fsync 任何路径。
 */
export function inspectGeneratedSetStoragePreflight(
  rootInput: OpenedDataRoot,
  planInput: unknown,
): GeneratedSetStoragePreflightSnapshotV1 {
  const plan = requireGeneratedSetCandidatePlanOrigin(planInput);
  const liveRoot = requireLiveOpenedDataRoot(rootInput);
  const rootPath = liveRoot.absolutePath;
  const rootDirectoryIdentity = directoryIdentityFromStat(
    fstatSync(liveRoot.fd, { bigint: true }),
  );

  const contentObservations: GeneratedSetStorageContentObservationV1[] = [];
  const members = plan.orderedMembers.map((member, index) => {
    // legal plan 的 member 内容互不相同（role/format 固定且至少不同 digest），
    // 因此 content observation 与 member 1:1；跨 plan 共享内容通过相同 digest
    // 派生的 target path 自然去重，不需要 plan 内 dedupe map。
    const contentObservationIndex = index;
    contentObservations.push(
      observeContent(rootPath, member, rootDirectoryIdentity),
    );
    return {
      outputRole: member.outputRole,
      candidateName: member.candidateName,
      expectedFileIdentity: member.fileIdentity,
      privateCandidate: observePrivateCandidate(
        rootPath,
        plan,
        member,
        rootDirectoryIdentity,
      ),
      provenanceRecord: member.provenanceRecord,
      provenanceTarget: observePublicTarget(
        rootPath,
        generatedArtifactProvenanceRecordPath(member.provenanceRecord.recordDigest),
        rootDirectoryIdentity,
        GENERATED_ARTIFACT_RECORD_MAX_BYTES,
        verifyCanonicalRecordFile(
          requireGenerationArtifactProvenanceRecord,
          member.provenanceRecord,
        ),
      ),
      contentObservationIndex,
    } satisfies GeneratedSetStorageMemberObservationV1;
  });

  const setTarget = observePublicTarget(
    rootPath,
    generatedArtifactSetRecordPath(plan.artifactSetRecord.artifactSetDigest),
    rootDirectoryIdentity,
    GENERATED_ARTIFACT_RECORD_MAX_BYTES,
    verifyCanonicalRecordFile(requireGeneratedArtifactSetRecord, plan.artifactSetRecord),
  );

  const liveRootAfter = requireLiveOpenedDataRoot(rootInput);
  if (
    liveRootAfter.identity.dev !== liveRoot.identity.dev ||
    liveRootAfter.identity.ino !== liveRoot.identity.ino
  ) {
    return invalid();
  }

  const snapshot = deepFreeze({
    schemaVersion: 1,
    kind: "generated-set-storage-preflight-v1",
    generationId: plan.generationId,
    provider: plan.provider,
    artifactSetDigest: plan.artifactSetRecord.artifactSetDigest,
    rootIdentity: {
      dev: decimal(liveRoot.identity.dev),
      ino: decimal(liveRoot.identity.ino),
    },
    content: contentObservations,
    members,
    setRecord: plan.artifactSetRecord,
    setTarget,
  }) as GeneratedSetStoragePreflightSnapshotV1;

  preflightOrigins.set(snapshot, {
    root: rootInput,
    rootIdentity: liveRoot.identity,
    plan,
  });
  return snapshot;
}

/**
 * 只读 near-revalidation：要求原始 snapshot origin、同一 live root 对象与同一
 * origin plan 对象，重跑完整 inspection 并拒绝任何 identity/status/body drift。
 * 可重复调用，不是 one-shot capability。
 */
export function revalidateGeneratedSetStoragePreflight(
  snapshotInput: unknown,
  rootInput: OpenedDataRoot,
  planInput: unknown,
): void {
  if (typeof snapshotInput !== "object" || snapshotInput === null) return invalid();
  const origin = preflightOrigins.get(snapshotInput);
  if (origin === undefined) return invalid();
  if (rootInput !== origin.root || planInput !== origin.plan) return invalid();
  requireGeneratedSetCandidatePlanOrigin(planInput);
  const liveRoot = requireLiveOpenedDataRoot(rootInput);
  if (
    liveRoot.identity.dev !== origin.rootIdentity.dev ||
    liveRoot.identity.ino !== origin.rootIdentity.ino
  ) {
    return invalid();
  }
  const fresh = inspectGeneratedSetStoragePreflight(rootInput, planInput);
  if (!sameCanonical(fresh, snapshotInput)) return invalid();
}
