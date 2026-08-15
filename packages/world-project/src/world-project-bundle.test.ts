import { describe, expect, test } from "bun:test";

import {
  RuntimeMvpHost,
  createInitialSnapshot,
  createMarbleHunyuanCompositeSnapshot,
} from "@demiurges/world";

import { createWorldProjectManifest } from "./project-store";
import {
  WorldProjectBundleError,
  WORLD_PROJECT_BUNDLE_TEST_SEAMS,
  decodeWorldProjectBundle,
  encodeWorldProjectBundle,
  type BundleArtifactValidator,
} from "./world-project-bundle";

const PRIMITIVE_VALIDATOR: BundleArtifactValidator = Object.freeze({
  validate() {
    throw new Error("primitive bundle 不应包含 Artifact");
  },
});

function manifest() {
  const host = new RuntimeMvpHost();
  host.write(createInitialSnapshot());
  host.editCurrentCubeHeight(host.readRefRecord(), 3);
  return createWorldProjectManifest(
    "project:bundle-demo",
    "Bundle Demo",
    host.exportProjectHistory(),
  );
}

describe("World Project bundle v1", () => {
  test("同一 revision 输出 byte-identical fixed ZIP，Phase A round-trip exact", () => {
    const project = manifest();
    const first = encodeWorldProjectBundle(project, [], PRIMITIVE_VALIDATOR);
    const second = encodeWorldProjectBundle(project, [], PRIMITIVE_VALIDATOR);
    expect(first).toEqual(second);
    const decoded = decodeWorldProjectBundle(first, PRIMITIVE_VALIDATOR);
    expect(decoded.manifest).toEqual(project);
    expect(decoded.artifacts).toEqual([]);
  });

  test("trailing data、flags、CRC/data drift、central/local gap 全部 fail closed", () => {
    const bundle = encodeWorldProjectBundle(manifest(), [], PRIMITIVE_VALIDATOR);
    const trailing = new Uint8Array(bundle.byteLength + 1);
    trailing.set(bundle);
    expect(() => decodeWorldProjectBundle(trailing, PRIMITIVE_VALIDATOR)).toThrow(
      WorldProjectBundleError,
    );

    const flags = bundle.slice();
    new DataView(flags.buffer).setUint16(6, 1, true);
    expect(() => decodeWorldProjectBundle(flags, PRIMITIVE_VALIDATOR)).toThrow();

    const dataDrift = bundle.slice();
    const firstNameLength = new DataView(dataDrift.buffer).getUint16(26, true);
    dataDrift[30 + firstNameLength] ^= 1;
    expect(() => decodeWorldProjectBundle(dataDrift, PRIMITIVE_VALIDATOR)).toThrow();

    const centralOffset = new DataView(bundle.buffer).getUint32(bundle.byteLength - 6, true);
    const gap = bundle.slice();
    new DataView(gap.buffer).setUint32(centralOffset + 42, 1, true);
    expect(() => decodeWorldProjectBundle(gap, PRIMITIVE_VALIDATOR)).toThrow();

    const localTimestamp = bundle.slice();
    new DataView(localTimestamp.buffer).setUint16(10, 0x1234, true);
    expect(() => decodeWorldProjectBundle(localTimestamp, PRIMITIVE_VALIDATOR)).toThrow();

    const centralTimestamp = bundle.slice();
    const centralTimestampOffset = new DataView(centralTimestamp.buffer)
      .getUint32(centralTimestamp.byteLength - 6, true);
    new DataView(centralTimestamp.buffer).setUint16(
      centralTimestampOffset + 14,
      0x5678,
      true,
    );
    expect(() => decodeWorldProjectBundle(centralTimestamp, PRIMITIVE_VALIDATOR)).toThrow();

    const synchronizedTimestamp = bundle.slice();
    const synchronizedView = new DataView(synchronizedTimestamp.buffer);
    const synchronizedCentral = synchronizedView.getUint32(
      synchronizedTimestamp.byteLength - 6,
      true,
    );
    synchronizedView.setUint16(10, 0x1234, true);
    synchronizedView.setUint16(12, 0x5678, true);
    synchronizedView.setUint16(synchronizedCentral + 12, 0x1234, true);
    synchronizedView.setUint16(synchronizedCentral + 14, 0x5678, true);
    expect(() => decodeWorldProjectBundle(synchronizedTimestamp, PRIMITIVE_VALIDATOR)).toThrow();
  });

  test("oversize 在分配/解析前拒绝", () => {
    const fake = new Uint8Array(64 * 1024 * 1024 + 1);
    expect(() => decodeWorldProjectBundle(fake, PRIMITIVE_VALIDATOR)).toThrow(
      expect.objectContaining({ code: "BUNDLE_BUDGET_EXCEEDED" }),
    );

    const oversizedJson = new Uint8Array(1024 * 1024 + 1);
    const smallJson = new TextEncoder().encode("{}");
    expect(() => decodeWorldProjectBundle(
      WORLD_PROJECT_BUNDLE_TEST_SEAMS.encodeUncheckedJsonEntries(
        oversizedJson,
        smallJson,
      ),
      PRIMITIVE_VALIDATOR,
    )).toThrow(expect.objectContaining({ code: "BUNDLE_BUDGET_EXCEEDED" }));
    expect(() => decodeWorldProjectBundle(
      WORLD_PROJECT_BUNDLE_TEST_SEAMS.encodeUncheckedJsonEntries(
        smallJson,
        oversizedJson,
      ),
      PRIMITIVE_VALIDATOR,
    )).toThrow(expect.objectContaining({ code: "BUNDLE_BUDGET_EXCEEDED" }));
  });

  test("canonical Project 引用 Artifact 时，缺少 exact ZIP entry 必须 fail closed", () => {
    const host = new RuntimeMvpHost();
    host.write(createMarbleHunyuanCompositeSnapshot());
    const composite = createWorldProjectManifest(
      "project:bundle-missing-artifact",
      "Missing Artifact",
      host.exportProjectHistory(),
    );
    expect(composite.artifacts.length).toBeGreaterThan(0);
    const malicious = WORLD_PROJECT_BUNDLE_TEST_SEAMS.encodeUncheckedArtifactSet(
      composite,
      [],
    );
    expect(() => decodeWorldProjectBundle(malicious, PRIMITIVE_VALIDATOR)).toThrow(
      expect.objectContaining({ code: "BUNDLE_INVALID" }),
    );
  });
});
