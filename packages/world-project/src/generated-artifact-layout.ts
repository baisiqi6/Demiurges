import { dataRootArtifactPath } from "./data-root";
import { generationIdDigest } from "./generation-birth";

const SHA256 = /^[a-f0-9]{64}$/;

function requireSha256(value: unknown): string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new Error("artifact digest 必须是 64 位 lowercase hex");
  }
  return value;
}

/** Public bytes CAS 目标：`artifacts/sha256/<contentDigest>`。 */
export function generatedArtifactBytesPath(contentDigest: string): string {
  return dataRootArtifactPath(requireSha256(contentDigest));
}

/** Content record 目标：`artifacts/records/content/sha256/<contentRecordDigest>`。 */
export function generatedArtifactContentRecordPath(contentRecordDigest: string): string {
  return `artifacts/records/content/sha256/${requireSha256(contentRecordDigest)}`;
}

/** by-bytes pointer 目标：`artifacts/records/content/by-bytes/sha256/<contentDigest>.json`。 */
export function generatedArtifactByBytesPointerPath(contentDigest: string): string {
  return `artifacts/records/content/by-bytes/sha256/${requireSha256(contentDigest)}.json`;
}

/** Provenance record 目标：`artifacts/records/provenance/sha256/<provenanceRecordDigest>`。 */
export function generatedArtifactProvenanceRecordPath(provenanceRecordDigest: string): string {
  return `artifacts/records/provenance/sha256/${requireSha256(provenanceRecordDigest)}`;
}

/** Set record 目标：`artifacts/sets/sha256/<artifactSetDigest>`。 */
export function generatedArtifactSetRecordPath(artifactSetDigest: string): string {
  return `artifacts/sets/sha256/${requireSha256(artifactSetDigest)}`;
}

/** Catalog 目标：`artifacts/catalog/<generation-id-digest>.json`。 */
export function generatedArtifactCatalogPath(
  generationId: `generation:sha256:${string}`,
): string {
  return `artifacts/catalog/${generationIdDigest(generationId)}.json`;
}
