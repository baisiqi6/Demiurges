import { canonicalJsonBytes, sha256Hex } from "@demiurges/world";

import {
  decodeWorldProjectManifestV1,
  encodeWorldProjectManifestV1,
  type WorldProjectArtifactEntry,
  type WorldProjectManifestV1,
} from "./world-project-manifest";

export const WORLD_PROJECT_BUNDLE_MEDIA_TYPE =
  "application/vnd.demiurges.world-project+zip";
export const WORLD_PROJECT_BUNDLE_MAX_BYTES = 64 * 1024 * 1024;
export const WORLD_PROJECT_BUNDLE_MAX_ENTRY_BYTES = 32 * 1024 * 1024;
export const WORLD_PROJECT_BUNDLE_MAX_ENTRIES = 16;
export const WORLD_PROJECT_BUNDLE_MAX_CENTRAL_DIRECTORY_BYTES = 64 * 1024;
export const WORLD_PROJECT_BUNDLE_INDEX_MAX_BYTES = 1024 * 1024;
export const WORLD_PROJECT_BUNDLE_PROJECT_MAX_BYTES = 1024 * 1024;
export const BUNDLE_IMPORT_PHASE_A_MAX_OWNED_BYTES = 224 * 1024 * 1024;

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
const ZIP_VERSION = 20;
const DOS_DATE_1980_01_01 = 0x21;
const REGULAR_FILE_EXTERNAL_ATTRIBUTES = 0o100600 << 16;

export type WorldProjectBundleErrorCode =
  | "BUNDLE_INVALID"
  | "BUNDLE_BUDGET_EXCEEDED"
  | "BUNDLE_PROJECT_INVALID"
  | "BUNDLE_ARTIFACT_INVALID";

export class WorldProjectBundleError extends Error {
  readonly code: WorldProjectBundleErrorCode;

  constructor(code: WorldProjectBundleErrorCode, message: string) {
    super(message);
    this.name = "WorldProjectBundleError";
    this.code = code;
  }
}

export interface BundleArtifact {
  readonly entry: WorldProjectArtifactEntry;
  readonly bytes: Uint8Array;
}

export interface BundleArtifactValidator {
  validate(entry: WorldProjectArtifactEntry, bytes: Uint8Array): void;
}

export interface DecodedWorldProjectBundle {
  readonly manifest: WorldProjectManifestV1;
  readonly artifacts: readonly BundleArtifact[];
}

interface BundleIndexEntry {
  readonly path: string;
  readonly byteLength: number;
  readonly digest: string;
}

interface BundleIndexV1 {
  readonly schemaVersion: 1;
  readonly projectRevision: string;
  readonly entries: readonly BundleIndexEntry[];
}

interface ZipEntry {
  readonly name: string;
  readonly bytes: Uint8Array;
}

function fail(code: WorldProjectBundleErrorCode, message: string): never {
  throw new WorldProjectBundleError(code, message);
}

function addSafe(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) fail("BUNDLE_BUDGET_EXCEEDED", "ZIP size overflow");
  return result;
}

function requireBudget(value: number, max: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) {
    fail("BUNDLE_BUDGET_EXCEEDED", `${label} 超出 budget`);
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function writeU16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

function ascii(value: string): Uint8Array {
  if (!/^[\x20-\x7e]+$/.test(value)) fail("BUNDLE_INVALID", "ZIP path 必须是 ASCII");
  return new TextEncoder().encode(value);
}

function artifactPath(digest: string): string {
  if (!/^[a-f0-9]{64}$/.test(digest)) fail("BUNDLE_ARTIFACT_INVALID", "Artifact digest 非法");
  return `artifacts/sha256/${digest}`;
}

function requireAllowedPath(path: string): void {
  if (
    path.includes("\\") ||
    path.includes("\u0000") ||
    path.startsWith("/") ||
    path.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    fail("BUNDLE_INVALID", "ZIP path 非法");
  }
  if (
    path !== "bundle.json" &&
    path !== "project/project.json" &&
    !/^artifacts\/sha256\/[a-f0-9]{64}$/.test(path)
  ) {
    fail("BUNDLE_INVALID", "ZIP 含未知 entry");
  }
}

function encodeStoredZip(entries: readonly ZipEntry[]): Uint8Array {
  requireBudget(entries.length, WORLD_PROJECT_BUNDLE_MAX_ENTRIES, "ZIP entry count");
  const encoded = entries.map((entry) => {
    requireAllowedPath(entry.name);
    requireBudget(entry.bytes.byteLength, WORLD_PROJECT_BUNDLE_MAX_ENTRY_BYTES, entry.name);
    return { ...entry, nameBytes: ascii(entry.name), crc: crc32(entry.bytes) };
  });
  const names = new Set(encoded.map((entry) => entry.name));
  if (names.size !== encoded.length) fail("BUNDLE_INVALID", "ZIP entry 重复");

  let localBytes = 0;
  for (const entry of encoded) {
    localBytes = addSafe(localBytes, 30 + entry.nameBytes.byteLength + entry.bytes.byteLength);
  }
  let centralBytes = 0;
  for (const entry of encoded) centralBytes = addSafe(centralBytes, 46 + entry.nameBytes.byteLength);
  requireBudget(centralBytes, WORLD_PROJECT_BUNDLE_MAX_CENTRAL_DIRECTORY_BYTES, "central directory");
  const total = addSafe(addSafe(localBytes, centralBytes), 22);
  requireBudget(total, WORLD_PROJECT_BUNDLE_MAX_BYTES, "bundle");

  const output = new Uint8Array(total);
  const view = new DataView(output.buffer);
  let offset = 0;
  const localOffsets: number[] = [];
  encoded.forEach((entry) => {
    localOffsets.push(offset);
    writeU32(view, offset, LOCAL_SIGNATURE);
    writeU16(view, offset + 4, ZIP_VERSION);
    writeU16(view, offset + 6, 0);
    writeU16(view, offset + 8, 0);
    writeU16(view, offset + 10, 0);
    writeU16(view, offset + 12, DOS_DATE_1980_01_01);
    writeU32(view, offset + 14, entry.crc);
    writeU32(view, offset + 18, entry.bytes.byteLength);
    writeU32(view, offset + 22, entry.bytes.byteLength);
    writeU16(view, offset + 26, entry.nameBytes.byteLength);
    writeU16(view, offset + 28, 0);
    output.set(entry.nameBytes, offset + 30);
    output.set(entry.bytes, offset + 30 + entry.nameBytes.byteLength);
    offset += 30 + entry.nameBytes.byteLength + entry.bytes.byteLength;
  });
  const centralOffset = offset;
  encoded.forEach((entry, index) => {
    writeU32(view, offset, CENTRAL_SIGNATURE);
    writeU16(view, offset + 4, (3 << 8) | ZIP_VERSION);
    writeU16(view, offset + 6, ZIP_VERSION);
    writeU16(view, offset + 8, 0);
    writeU16(view, offset + 10, 0);
    writeU16(view, offset + 12, 0);
    writeU16(view, offset + 14, DOS_DATE_1980_01_01);
    writeU32(view, offset + 16, entry.crc);
    writeU32(view, offset + 20, entry.bytes.byteLength);
    writeU32(view, offset + 24, entry.bytes.byteLength);
    writeU16(view, offset + 28, entry.nameBytes.byteLength);
    writeU16(view, offset + 30, 0);
    writeU16(view, offset + 32, 0);
    writeU16(view, offset + 34, 0);
    writeU16(view, offset + 36, 0);
    writeU32(view, offset + 38, REGULAR_FILE_EXTERNAL_ATTRIBUTES);
    writeU32(view, offset + 42, localOffsets[index]!);
    output.set(entry.nameBytes, offset + 46);
    offset += 46 + entry.nameBytes.byteLength;
  });
  writeU32(view, offset, EOCD_SIGNATURE);
  writeU16(view, offset + 4, 0);
  writeU16(view, offset + 6, 0);
  writeU16(view, offset + 8, encoded.length);
  writeU16(view, offset + 10, encoded.length);
  writeU32(view, offset + 12, centralBytes);
  writeU32(view, offset + 16, centralOffset);
  writeU16(view, offset + 20, 0);
  return output;
}

function makeIndex(
  manifest: WorldProjectManifestV1,
  projectBytes: Uint8Array,
  artifacts: readonly BundleArtifact[],
): BundleIndexV1 {
  return {
    schemaVersion: 1,
    projectRevision: manifest.revision,
    entries: [
      {
        path: "project/project.json",
        byteLength: projectBytes.byteLength,
        digest: sha256Hex(projectBytes),
      },
      ...artifacts.map(({ entry, bytes }) => ({
        path: artifactPath(entry.digest),
        byteLength: bytes.byteLength,
        digest: sha256Hex(bytes),
      })),
    ],
  };
}

export function encodeWorldProjectBundle(
  manifestInput: WorldProjectManifestV1,
  artifactsInput: readonly BundleArtifact[],
  validator: BundleArtifactValidator,
): Uint8Array {
  const manifest = decodeWorldProjectManifestV1(encodeWorldProjectManifestV1(manifestInput));
  const artifacts = [...artifactsInput].sort((left, right) =>
    left.entry.digest.localeCompare(right.entry.digest),
  );
  if (
    artifacts.length !== manifest.artifacts.length ||
    !artifacts.every((artifact, index) =>
      artifact.entry.assetId === manifest.artifacts[index]!.assetId &&
      artifact.entry.digest === manifest.artifacts[index]!.digest &&
      artifact.entry.byteLength === manifest.artifacts[index]!.byteLength &&
      artifact.entry.format === manifest.artifacts[index]!.format)
  ) {
    fail("BUNDLE_ARTIFACT_INVALID", "bundle Artifact 集合与 Project 不一致");
  }
  for (const artifact of artifacts) {
    if (artifact.bytes.byteLength !== artifact.entry.byteLength) {
      fail("BUNDLE_ARTIFACT_INVALID", "bundle Artifact byteLength 不一致");
    }
    if (sha256Hex(artifact.bytes) !== artifact.entry.digest) {
      fail("BUNDLE_ARTIFACT_INVALID", "bundle Artifact digest 不一致");
    }
    validator.validate(artifact.entry, artifact.bytes);
  }
  const projectBytes = encodeWorldProjectManifestV1(manifest);
  const indexBytes = canonicalJsonBytes(makeIndex(manifest, projectBytes, artifacts));
  requireBudget(indexBytes.byteLength, WORLD_PROJECT_BUNDLE_INDEX_MAX_BYTES, "bundle.json");
  return encodeStoredZip([
    { name: "bundle.json", bytes: indexBytes },
    { name: "project/project.json", bytes: projectBytes },
    ...artifacts.map((artifact) => ({
      name: artifactPath(artifact.entry.digest),
      bytes: artifact.bytes,
    })),
  ]);
}

/** 只供同 package 的 exact-set decoder tests 构造恶意但自洽的 ZIP。 */
export const WORLD_PROJECT_BUNDLE_TEST_SEAMS = Object.freeze({
  encodeUncheckedJsonEntries(
    indexBytes: Uint8Array,
    projectBytes: Uint8Array,
  ): Uint8Array {
    return encodeStoredZip([
      { name: "bundle.json", bytes: indexBytes },
      { name: "project/project.json", bytes: projectBytes },
    ]);
  },
  encodeUncheckedArtifactSet(
    manifestInput: WorldProjectManifestV1,
    artifactsInput: readonly BundleArtifact[],
  ): Uint8Array {
    const manifest = decodeWorldProjectManifestV1(
      encodeWorldProjectManifestV1(manifestInput),
    );
    const artifacts = [...artifactsInput].sort((left, right) =>
      left.entry.digest.localeCompare(right.entry.digest),
    );
    const projectBytes = encodeWorldProjectManifestV1(manifest);
    const indexBytes = canonicalJsonBytes(makeIndex(manifest, projectBytes, artifacts));
    return encodeStoredZip([
      { name: "bundle.json", bytes: indexBytes },
      { name: "project/project.json", bytes: projectBytes },
      ...artifacts.map((artifact) => ({
        name: artifactPath(artifact.entry.digest),
        bytes: artifact.bytes,
      })),
    ]);
  },
});

function readU16(view: DataView, offset: number): number {
  if (offset < 0 || offset + 2 > view.byteLength) fail("BUNDLE_INVALID", "ZIP truncated");
  return view.getUint16(offset, true);
}

function readU32(view: DataView, offset: number): number {
  if (offset < 0 || offset + 4 > view.byteLength) fail("BUNDLE_INVALID", "ZIP truncated");
  return view.getUint32(offset, true);
}

function decodeAscii(bytes: Uint8Array): string {
  if (!bytes.every((byte) => byte >= 0x20 && byte <= 0x7e)) {
    fail("BUNDLE_INVALID", "ZIP path 必须是 ASCII");
  }
  return new TextDecoder().decode(bytes);
}

function parseStoredZip(input: Uint8Array): Map<string, Uint8Array> {
  requireBudget(input.byteLength, WORLD_PROJECT_BUNDLE_MAX_BYTES, "bundle");
  if (input.byteLength < 22) fail("BUNDLE_INVALID", "ZIP truncated");
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const eocd = input.byteLength - 22;
  if (readU32(view, eocd) !== EOCD_SIGNATURE || readU16(view, eocd + 20) !== 0) {
    fail("BUNDLE_INVALID", "ZIP EOCD/trailing data 非法");
  }
  const disk = readU16(view, eocd + 4);
  const centralDisk = readU16(view, eocd + 6);
  const diskCount = readU16(view, eocd + 8);
  const totalCount = readU16(view, eocd + 10);
  const centralBytes = readU32(view, eocd + 12);
  const centralOffset = readU32(view, eocd + 16);
  if (disk !== 0 || centralDisk !== 0 || diskCount !== totalCount) {
    fail("BUNDLE_INVALID", "multi-disk ZIP 不支持");
  }
  requireBudget(totalCount, WORLD_PROJECT_BUNDLE_MAX_ENTRIES, "ZIP entry count");
  requireBudget(centralBytes, WORLD_PROJECT_BUNDLE_MAX_CENTRAL_DIRECTORY_BYTES, "central directory");
  if (centralOffset + centralBytes !== eocd) fail("BUNDLE_INVALID", "central directory bounds 非法");

  const entries = new Map<string, Uint8Array>();
  let centralCursor = centralOffset;
  let ownedBytes = input.byteLength;
  let expectedLocalOffset = 0;
  for (let index = 0; index < totalCount; index += 1) {
    if (readU32(view, centralCursor) !== CENTRAL_SIGNATURE) fail("BUNDLE_INVALID", "central header 非法");
    const madeBy = readU16(view, centralCursor + 4);
    const needed = readU16(view, centralCursor + 6);
    const flags = readU16(view, centralCursor + 8);
    const method = readU16(view, centralCursor + 10);
    const modifiedTime = readU16(view, centralCursor + 12);
    const modifiedDate = readU16(view, centralCursor + 14);
    const crc = readU32(view, centralCursor + 16);
    const compressed = readU32(view, centralCursor + 20);
    const uncompressed = readU32(view, centralCursor + 24);
    const nameLength = readU16(view, centralCursor + 28);
    const extraLength = readU16(view, centralCursor + 30);
    const commentLength = readU16(view, centralCursor + 32);
    const startDisk = readU16(view, centralCursor + 34);
    const external = readU32(view, centralCursor + 38);
    const localOffset = readU32(view, centralCursor + 42);
    if (
      (madeBy >>> 8) !== 3 ||
      needed !== ZIP_VERSION ||
      flags !== 0 ||
      method !== 0 ||
      modifiedTime !== 0 ||
      modifiedDate !== DOS_DATE_1980_01_01 ||
      compressed !== uncompressed ||
      extraLength !== 0 ||
      commentLength !== 0 ||
      startDisk !== 0 ||
      external !== (REGULAR_FILE_EXTERNAL_ATTRIBUTES >>> 0)
    ) {
      fail("BUNDLE_INVALID", "ZIP feature/mode 非 v1 fixed subset");
    }
    if (localOffset !== expectedLocalOffset) {
      fail("BUNDLE_INVALID", "local entries 必须无重叠、无空洞且顺序固定");
    }
    requireBudget(uncompressed, WORLD_PROJECT_BUNDLE_MAX_ENTRY_BYTES, "ZIP entry");
    const centralEnd = centralCursor + 46 + nameLength;
    if (centralEnd > centralOffset + centralBytes) fail("BUNDLE_INVALID", "central entry bounds 非法");
    const name = decodeAscii(input.subarray(centralCursor + 46, centralEnd));
    requireAllowedPath(name);
    if (entries.has(name)) fail("BUNDLE_INVALID", "ZIP duplicate entry");
    if (name === "bundle.json") {
      requireBudget(uncompressed, WORLD_PROJECT_BUNDLE_INDEX_MAX_BYTES, "bundle.json");
    } else if (name === "project/project.json") {
      requireBudget(uncompressed, WORLD_PROJECT_BUNDLE_PROJECT_MAX_BYTES, "project.json");
    }

    if (
      readU32(view, localOffset) !== LOCAL_SIGNATURE ||
      readU16(view, localOffset + 4) !== ZIP_VERSION ||
      readU16(view, localOffset + 6) !== 0 ||
      readU16(view, localOffset + 8) !== 0 ||
      readU16(view, localOffset + 10) !== 0 ||
      readU16(view, localOffset + 12) !== DOS_DATE_1980_01_01 ||
      readU32(view, localOffset + 14) !== crc ||
      readU32(view, localOffset + 18) !== compressed ||
      readU32(view, localOffset + 22) !== uncompressed ||
      readU16(view, localOffset + 26) !== nameLength ||
      readU16(view, localOffset + 28) !== 0
    ) {
      fail("BUNDLE_INVALID", "local/central header 不一致");
    }
    const localNameStart = localOffset + 30;
    const dataStart = localNameStart + nameLength;
    const dataEnd = dataStart + uncompressed;
    if (dataEnd > centralOffset) fail("BUNDLE_INVALID", "local entry bounds 非法");
    if (decodeAscii(input.subarray(localNameStart, dataStart)) !== name) {
      fail("BUNDLE_INVALID", "local/central path 不一致");
    }
    const data = input.slice(dataStart, dataEnd);
    ownedBytes = addSafe(ownedBytes, data.byteLength);
    requireBudget(ownedBytes, BUNDLE_IMPORT_PHASE_A_MAX_OWNED_BYTES, "Phase A owned bytes");
    if (crc32(data) !== crc) fail("BUNDLE_INVALID", "ZIP CRC 不一致");
    entries.set(name, data);
    expectedLocalOffset = dataEnd;
    centralCursor = centralEnd;
  }
  if (expectedLocalOffset !== centralOffset) {
    fail("BUNDLE_INVALID", "local entries 与 central offset 不闭合");
  }
  if (centralCursor !== centralOffset + centralBytes) fail("BUNDLE_INVALID", "central directory trailing bytes");
  return entries;
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    fail("BUNDLE_INVALID", "bundle.json 必须是 plain record");
  }
  const record = value as Record<string, unknown>;
  if (
    Reflect.ownKeys(record).length !== keys.length ||
    !keys.every((key) => Object.prototype.hasOwnProperty.call(record, key))
  ) {
    fail("BUNDLE_INVALID", "bundle.json keys 非法");
  }
  return record;
}

function decodeIndex(bytes: Uint8Array): BundleIndexV1 {
  requireBudget(bytes.byteLength, WORLD_PROJECT_BUNDLE_INDEX_MAX_BYTES, "bundle.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    fail("BUNDLE_INVALID", "bundle.json 不是合法 UTF-8 JSON");
  }
  if (!byteEqual(bytes, canonicalJsonBytes(parsed))) fail("BUNDLE_INVALID", "bundle.json 非 canonical");
  const record = exactRecord(parsed, ["schemaVersion", "projectRevision", "entries"]);
  if (record.schemaVersion !== 1 || typeof record.projectRevision !== "string") {
    fail("BUNDLE_INVALID", "bundle index version/revision 非法");
  }
  if (!Array.isArray(record.entries) || Reflect.ownKeys(record.entries).length !== record.entries.length + 1) {
    fail("BUNDLE_INVALID", "bundle index entries 非 dense array");
  }
  const entries = record.entries.map((value) => {
    const entry = exactRecord(value, ["path", "byteLength", "digest"]);
    if (
      typeof entry.path !== "string" ||
      typeof entry.byteLength !== "number" ||
      !Number.isSafeInteger(entry.byteLength) ||
      entry.byteLength < 0 ||
      typeof entry.digest !== "string" ||
      !/^[a-f0-9]{64}$/.test(entry.digest)
    ) {
      fail("BUNDLE_INVALID", "bundle index entry 非法");
    }
    requireAllowedPath(entry.path);
    return {
      path: entry.path,
      byteLength: entry.byteLength,
      digest: entry.digest,
    };
  });
  if (new Set(entries.map((entry) => entry.path)).size !== entries.length) {
    fail("BUNDLE_INVALID", "bundle index entry 重复");
  }
  return { schemaVersion: 1, projectRevision: record.projectRevision, entries };
}

function byteEqual(left: Uint8Array, right: Uint8Array): boolean {
  return Buffer.from(left).equals(Buffer.from(right));
}

export function decodeWorldProjectBundle(
  input: Uint8Array,
  validator: BundleArtifactValidator,
): DecodedWorldProjectBundle {
  const zip = parseStoredZip(input);
  const indexBytes = zip.get("bundle.json");
  const projectBytes = zip.get("project/project.json");
  if (indexBytes === undefined || projectBytes === undefined) {
    fail("BUNDLE_INVALID", "bundle 缺少固定入口");
  }
  const index = decodeIndex(indexBytes);
  let manifest: WorldProjectManifestV1;
  try {
    manifest = decodeWorldProjectManifestV1(projectBytes);
  } catch (error) {
    fail("BUNDLE_PROJECT_INVALID", error instanceof Error ? error.message : "Project invalid");
  }
  if (!byteEqual(projectBytes, encodeWorldProjectManifestV1(manifest))) {
    fail("BUNDLE_PROJECT_INVALID", "project.json 非 canonical");
  }
  if (index.projectRevision !== manifest.revision) {
    fail("BUNDLE_PROJECT_INVALID", "bundle revision 与 Project 不一致");
  }

  const expectedPaths = [
    "bundle.json",
    "project/project.json",
    ...manifest.artifacts.map((entry) => artifactPath(entry.digest)),
  ];
  if (
    zip.size !== expectedPaths.length ||
    !expectedPaths.every((path) => zip.has(path))
  ) {
    fail("BUNDLE_INVALID", "ZIP entry 集合与 Project 不一致");
  }
  const expectedIndexPaths = expectedPaths.slice(1);
  if (
    index.entries.length !== expectedIndexPaths.length ||
    !index.entries.every((entry, position) => entry.path === expectedIndexPaths[position])
  ) {
    fail("BUNDLE_INVALID", "bundle index 顺序/集合不一致");
  }
  for (const entry of index.entries) {
    const bytes = zip.get(entry.path)!;
    if (bytes.byteLength !== entry.byteLength || sha256Hex(bytes) !== entry.digest) {
      fail("BUNDLE_INVALID", "bundle index digest/length 不一致");
    }
  }
  const artifacts = manifest.artifacts.map((entry) => {
    const bytes = zip.get(artifactPath(entry.digest))!;
    if (bytes.byteLength !== entry.byteLength || sha256Hex(bytes) !== entry.digest) {
      fail("BUNDLE_ARTIFACT_INVALID", "Artifact identity 不一致");
    }
    validator.validate(entry, bytes);
    return { entry, bytes };
  });
  return { manifest, artifacts };
}
