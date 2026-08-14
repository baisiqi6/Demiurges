import { describe, expect, test } from "bun:test";

import { isDeepFrozen } from "../kernel/world";
import { canonicalJsonBytes, sha256Hex } from "../kernel/canonical-json";
import {
  MARBLE_HUNYUAN_MANIFEST_DIGEST,
  MARBLE_HUNYUAN_REGISTRY,
  TRANSFORM_RECOMPUTE_EPSILON,
  requireMarbleHunyuanRegistryIntegrity,
  requireMarbleHunyuanRegistrySelfConsistency,
} from "./marble-hunyuan-registry";

type Path = readonly (string | number)[];

interface TamperCase {
  readonly name: string;
  readonly tamper: (root: Record<string, unknown>) => void;
}

interface TamperFamily {
  readonly family: string;
  readonly cases: readonly TamperCase[];
}

function cloneRegistry(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(MARBLE_HUNYUAN_REGISTRY)) as Record<string, unknown>;
}

function numericLeaf(root: Record<string, unknown>, path: Path, delta = 0.001): void {
  let node: unknown = root;
  for (const segment of path.slice(0, -1)) {
    node = (node as Record<string | number, unknown>)[segment];
  }
  const holder = node as Record<string | number, unknown>;
  const leaf = path.at(-1)!;
  holder[leaf] = (holder[leaf] as number) + delta;
}

function stringLeaf(root: Record<string, unknown>, path: Path, replacement: string): void {
  let node: unknown = root;
  for (const segment of path.slice(0, -1)) {
    node = (node as Record<string | number, unknown>)[segment];
  }
  const holder = node as Record<string | number, unknown>;
  holder[path.at(-1)!] = replacement;
}

function booleanLeaf(root: Record<string, unknown>, path: Path): void {
  let node: unknown = root;
  for (const segment of path.slice(0, -1)) {
    node = (node as Record<string | number, unknown>)[segment];
  }
  const holder = node as Record<string | number, unknown>;
  const leaf = path.at(-1)!;
  holder[leaf] = !(holder[leaf] as boolean);
}

const ZERO_DIGEST = "0".repeat(64);
const TAMPERED_CALIBRATION_ID = "calibration:tampered-v1";

const MARBLE_WITNESS: Path = ["witnesses", 0];
const HUNYUAN_WITNESS: Path = ["witnesses", 1];
const FLOOR_WITNESS: Path = ["witnesses", 2];
const SPZ_CALIBRATION: Path = ["calibrations", 0];
const COLLIDER_CALIBRATION: Path = ["calibrations", 1];
const HUNYUAN_CALIBRATION: Path = ["calibrations", 2];

const transformLeaves = (calibration: Path): TamperCase[] => [
  { name: "axisMap[0]", tamper: (root) => stringLeaf(root, [...calibration, "axisMap", 0], "+source.tampered") },
  { name: "axisMap[1]", tamper: (root) => stringLeaf(root, [...calibration, "axisMap", 1], "+source.tampered") },
  { name: "axisMap[2]", tamper: (root) => stringLeaf(root, [...calibration, "axisMap", 2], "+source.tampered") },
  { name: "rotation[0]", tamper: (root) => numericLeaf(root, [...calibration, "rotation", 0]) },
  { name: "rotation[1]", tamper: (root) => numericLeaf(root, [...calibration, "rotation", 1]) },
  { name: "rotation[2]", tamper: (root) => numericLeaf(root, [...calibration, "rotation", 2]) },
  { name: "rotation[3]", tamper: (root) => numericLeaf(root, [...calibration, "rotation", 3]) },
  { name: "translation[0]", tamper: (root) => numericLeaf(root, [...calibration, "translation", 0]) },
  { name: "translation[1]", tamper: (root) => numericLeaf(root, [...calibration, "translation", 1]) },
  { name: "translation[2]", tamper: (root) => numericLeaf(root, [...calibration, "translation", 2]) },
  { name: "uniformScale", tamper: (root) => numericLeaf(root, [...calibration, "uniformScale"]) },
];

const boundsLeaves = (calibration: Path): TamperCase[] =>
  (["sourceBounds", "targetBounds"] as const).flatMap((bounds) =>
    (["min", "max"] as const).flatMap((face) =>
      ([0, 1, 2] as const).map((axis) => ({
        name: `${bounds}.${face}[${axis}]`,
        tamper: (root: Record<string, unknown>) =>
          numericLeaf(root, [...calibration, bounds, face, axis]),
      })),
    ),
  );

const proxyLeaves = (witness: Path): TamperCase[] => [
  { name: "proxy.entityRef", tamper: (root) => stringLeaf(root, [...witness, "proxy", "entityRef"], "entity:tampered") },
  { name: "proxy.kind", tamper: (root) => stringLeaf(root, [...witness, "proxy", "kind"], "sphere") },
  { name: "proxy.center[0]", tamper: (root) => numericLeaf(root, [...witness, "proxy", "center", 0]) },
  { name: "proxy.center[1]", tamper: (root) => numericLeaf(root, [...witness, "proxy", "center", 1]) },
  { name: "proxy.center[2]", tamper: (root) => numericLeaf(root, [...witness, "proxy", "center", 2]) },
  { name: "proxy.halfExtents[0]", tamper: (root) => numericLeaf(root, [...witness, "proxy", "halfExtents", 0]) },
  { name: "proxy.halfExtents[1]", tamper: (root) => numericLeaf(root, [...witness, "proxy", "halfExtents", 1]) },
  { name: "proxy.halfExtents[2]", tamper: (root) => numericLeaf(root, [...witness, "proxy", "halfExtents", 2]) },
];

const FAMILIES: readonly TamperFamily[] = [
  {
    family: "marble-source-identity",
    cases: [
      { name: "left.artifactDigest → 64 个 0", tamper: (root) => stringLeaf(root, [...MARBLE_WITNESS, "left", "artifactDigest"], ZERO_DIGEST) },
      { name: "right.artifactDigest → 64 个 0", tamper: (root) => stringLeaf(root, [...MARBLE_WITNESS, "right", "artifactDigest"], ZERO_DIGEST) },
    ],
  },
  {
    family: "marble-calibration-id",
    cases: [
      { name: "left.calibrationId → calibration:tampered-v1", tamper: (root) => stringLeaf(root, [...MARBLE_WITNESS, "left", "calibrationId"], TAMPERED_CALIBRATION_ID) },
      { name: "right.calibrationId → calibration:tampered-v1", tamper: (root) => stringLeaf(root, [...MARBLE_WITNESS, "right", "calibrationId"], TAMPERED_CALIBRATION_ID) },
    ],
  },
  {
    family: "marble-transform-leaves",
    cases: [
      ...transformLeaves(SPZ_CALIBRATION).map((member) => ({
        ...member,
        name: `left.CalibrationRecord.${member.name}`,
      })),
      ...transformLeaves(COLLIDER_CALIBRATION).map((member) => ({
        ...member,
        name: `right.CalibrationRecord.${member.name}`,
      })),
    ],
  },
  {
    family: "marble-bounds-leaves",
    cases: [
      ...boundsLeaves(SPZ_CALIBRATION).map((member) => ({
        ...member,
        name: `left.CalibrationRecord.${member.name}`,
      })),
      ...boundsLeaves(COLLIDER_CALIBRATION).map((member) => ({
        ...member,
        name: `right.CalibrationRecord.${member.name}`,
      })),
    ],
  },
  {
    family: "marble-derived-evidence",
    cases: [
      ...[0, 1, 2, 3, 4, 5].map((index) => ({
        name: `faceDeltas[${index}]`,
        tamper: (root: Record<string, unknown>) =>
          numericLeaf(root, [...MARBLE_WITNESS, "faceDeltas", index]),
      })),
      { name: "measured", tamper: (root) => numericLeaf(root, [...MARBLE_WITNESS, "measured"]) },
      { name: "passed true→false", tamper: (root) => booleanLeaf(root, [...MARBLE_WITNESS, "passed"]) },
    ],
  },
  {
    family: "marble-tolerance",
    cases: [
      { name: "tolerance 0.12 → 0.121", tamper: (root) => numericLeaf(root, [...MARBLE_WITNESS, "tolerance"]) },
    ],
  },
  {
    family: "hunyuan-source-identity",
    cases: [
      { name: "source.artifactDigest → 64 个 0", tamper: (root) => stringLeaf(root, [...HUNYUAN_WITNESS, "source", "artifactDigest"], ZERO_DIGEST) },
    ],
  },
  {
    family: "hunyuan-calibration",
    cases: [
      { name: "source.calibrationId → calibration:tampered-v1", tamper: (root) => stringLeaf(root, [...HUNYUAN_WITNESS, "source", "calibrationId"], TAMPERED_CALIBRATION_ID) },
      ...transformLeaves(HUNYUAN_CALIBRATION).map((member) => ({
        ...member,
        name: `CalibrationRecord.${member.name}`,
      })),
    ],
  },
  {
    family: "hunyuan-bounds-leaves",
    cases: boundsLeaves(HUNYUAN_CALIBRATION).map((member) => ({
      ...member,
      name: `CalibrationRecord.${member.name}`,
    })),
  },
  {
    family: "hunyuan-proxy-leaves",
    cases: proxyLeaves(HUNYUAN_WITNESS),
  },
  {
    family: "hunyuan-derived-evidence",
    cases: [
      { name: "measured", tamper: (root) => numericLeaf(root, [...HUNYUAN_WITNESS, "measured"]) },
      { name: "passed true→false", tamper: (root) => booleanLeaf(root, [...HUNYUAN_WITNESS, "passed"]) },
      { name: "tolerance 0.000001 → 0.001001", tamper: (root) => numericLeaf(root, [...HUNYUAN_WITNESS, "tolerance"]) },
    ],
  },
  {
    family: "floor-source-identity",
    cases: [
      { name: "source.artifactDigest → 64 个 0", tamper: (root) => stringLeaf(root, [...FLOOR_WITNESS, "source", "artifactDigest"], ZERO_DIGEST) },
    ],
  },
  {
    family: "floor-calibration",
    cases: [
      { name: "source.calibrationId → calibration:tampered-v1", tamper: (root) => stringLeaf(root, [...FLOOR_WITNESS, "source", "calibrationId"], TAMPERED_CALIBRATION_ID) },
      ...transformLeaves(COLLIDER_CALIBRATION).map((member) => ({
        ...member,
        name: `CalibrationRecord.${member.name}`,
      })),
      ...boundsLeaves(COLLIDER_CALIBRATION).map((member) => ({
        ...member,
        name: `CalibrationRecord.${member.name}`,
      })),
    ],
  },
  {
    family: "floor-proxy-leaves",
    cases: [
      ...proxyLeaves(FLOOR_WITNESS),
      { name: "proxy.topZ", tamper: (root) => numericLeaf(root, [...FLOOR_WITNESS, "proxy", "topZ"]) },
    ],
  },
  {
    family: "floor-derived-evidence",
    cases: [
      { name: "source.calibratedMinZ", tamper: (root) => numericLeaf(root, [...FLOOR_WITNESS, "source", "calibratedMinZ"]) },
      { name: "measured", tamper: (root) => numericLeaf(root, [...FLOOR_WITNESS, "measured"]) },
      { name: "passed true→false", tamper: (root) => booleanLeaf(root, [...FLOOR_WITNESS, "passed"]) },
      { name: "tolerance 0.000001 → 0.001001", tamper: (root) => numericLeaf(root, [...FLOOR_WITNESS, "tolerance"]) },
    ],
  },
];

const TOTAL_MEMBER_COUNT = FAMILIES.reduce(
  (count, family) => count + family.cases.length,
  0,
);

describe("Marble/Hunyuan provider registry integrity", () => {
  test("frozen canonical registry 通过自身完整性校验", () => {
    expect(isDeepFrozen(MARBLE_HUNYUAN_REGISTRY)).toBe(true);
    expect(() => requireMarbleHunyuanRegistryIntegrity(MARBLE_HUNYUAN_REGISTRY)).not.toThrow();
    expect(() => requireMarbleHunyuanRegistrySelfConsistency(MARBLE_HUNYUAN_REGISTRY)).not.toThrow();
  });

  test("manifestDigest 是完整 canonical registry 的 digest，不冒充任一 asset content digest", () => {
    expect(MARBLE_HUNYUAN_MANIFEST_DIGEST).toBe(
      `sha256:${sha256Hex(canonicalJsonBytes(MARBLE_HUNYUAN_REGISTRY))}`,
    );
    for (const asset of MARBLE_HUNYUAN_REGISTRY.assets) {
      expect(MARBLE_HUNYUAN_MANIFEST_DIGEST).not.toBe(`sha256:${asset.digest}`);
    }
  });

  test("registry arrays 只接受 exact dense own-data indices，不忽略 extra/Symbol/accessor", () => {
    const extra = cloneRegistry();
    (extra.assets as unknown as Record<string, unknown>).extra = "ignored";
    expect(() => requireMarbleHunyuanRegistryIntegrity(extra)).toThrow("dense indices");

    const symbol = cloneRegistry();
    Object.defineProperty(symbol.calibrations, Symbol("hidden"), {
      value: "ignored",
      enumerable: true,
    });
    expect(() => requireMarbleHunyuanRegistryIntegrity(symbol)).toThrow("dense indices");

    const accessor = cloneRegistry();
    const faceDeltas = (accessor.witnesses as unknown as Array<Record<string, unknown>>)[0]!
      .faceDeltas as number[];
    let getterReads = 0;
    Object.defineProperty(faceDeltas, "extra", {
      enumerable: true,
      get() {
        getterReads += 1;
        return 0;
      },
    });
    expect(() => requireMarbleHunyuanRegistryIntegrity(accessor)).toThrow("dense indices");
    expect(getterReads).toBe(0);
  });

  test("派生 transform 重算只使用 TRANSFORM_RECOMPUTE_EPSILON = 1e-12", () => {
    expect(TRANSFORM_RECOMPUTE_EPSILON).toBe(1e-12);
  });

  test("witness 的 derived evidence 由 manifest/calibration/proxy 重算，不能只改 passed", () => {
    const boundsDrift = cloneRegistry();
    numericLeaf(boundsDrift, [...SPZ_CALIBRATION, "targetBounds", "min", 0], 1e-9);
    expect(() => requireMarbleHunyuanRegistrySelfConsistency(boundsDrift)).toThrow();
    expect(() => requireMarbleHunyuanRegistryIntegrity(boundsDrift)).toThrow();
  });

  test("registry literal 漂移由 exact canonical 对比拦截，重算层不构成豁免", () => {
    const toleranceDrift = cloneRegistry();
    numericLeaf(toleranceDrift, [...MARBLE_WITNESS, "tolerance"]);
    expect(() => requireMarbleHunyuanRegistrySelfConsistency(toleranceDrift)).not.toThrow();
    expect(() => requireMarbleHunyuanRegistryIntegrity(toleranceDrift)).toThrow();
  });

  test(`parameterized mutation families 恰好覆盖 ${TOTAL_MEMBER_COUNT} 个 witness/calibration 成员`, () => {
    expect(TOTAL_MEMBER_COUNT).toBe(133);
  });

  for (const family of FAMILIES) {
    describe(`witness family ${family.family}`, () => {
      for (const member of family.cases) {
        test(`${family.family} :: ${member.name} fail closed`, () => {
          const tampered = cloneRegistry();
          member.tamper(tampered);
          expect(() => requireMarbleHunyuanRegistryIntegrity(tampered)).toThrow();
        });
      }
    });
  }
});
