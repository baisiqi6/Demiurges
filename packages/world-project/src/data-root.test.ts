import { describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  DATA_ROOT_DIR_MODE,
  DataRootError,
  bootstrapDataRoot,
  dataRootArtifactPath,
  dataRootProjectPath,
  dataRootReceiptIntentPath,
  dataRootReceiptResultPath,
  dataRootStagingPath,
  openDataRoot,
  requireLiveOpenedDataRoot,
  resolveDataRootConfig,
} from "./data-root";

function makeTempParent(): string {
  return mkdtempSync(join(tmpdir(), "dh016-data-root-"));
}

function cleanup(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

describe("resolveDataRootConfig", () => {
  test("缺失/空/相对/NUL 全部 fail closed，绝对路径 configure", () => {
    expect(resolveDataRootConfig({})).toMatchObject({
      status: "unavailable",
      code: "DATA_ROOT_UNAVAILABLE",
    });
    expect(resolveDataRootConfig({ DEMIURGES_DATA_ROOT: "" })).toMatchObject({
      status: "unavailable",
    });
    expect(
      resolveDataRootConfig({ DEMIURGES_DATA_ROOT: "relative/path" }),
    ).toMatchObject({ status: "unavailable" });
    expect(
      resolveDataRootConfig({ DEMIURGES_DATA_ROOT: "/tmp/a\u0000b" }),
    ).toMatchObject({ status: "unavailable" });
    expect(
      resolveDataRootConfig({ DEMIURGES_DATA_ROOT: "/tmp/example-root" }),
    ).toEqual({ status: "configured", absolutePath: "/tmp/example-root" });
  });
});

describe("bootstrapDataRoot", () => {
  test("在已存在 parent 下 atomic non-recursive 创建 0700 empty root", () => {
    const parent = makeTempParent();
    try {
      const root = join(parent, "root");
      expect(bootstrapDataRoot(root)).toBe("created");
      const stat = statSync(root);
      expect(stat.isDirectory()).toBe(true);
      expect(stat.mode & 0o777).toBe(DATA_ROOT_DIR_MODE);
      expect(readdirSync(root)).toEqual([]);
      // 幂等：第二次验证同一 identity
      expect(bootstrapDataRoot(root)).toBe("already-exists");
      expect(readdirSync(root)).toEqual([]);
    } finally {
      cleanup(parent);
    }
  });

  test("并发 bootstrap 最多一个 created，其余只验证同一 empty identity", async () => {
    const parent = makeTempParent();
    try {
      const root = join(parent, "root");
      const results = await Promise.all(
        Array.from({ length: 8 }, () => Promise.resolve().then(() => bootstrapDataRoot(root))),
      );
      expect(results.filter((result) => result === "created")).toEqual(["created"]);
      expect(results.filter((result) => result === "already-exists").length).toBe(7);
      expect(readdirSync(root)).toEqual([]);
      expect(statSync(root).mode & 0o777).toBe(DATA_ROOT_DIR_MODE);
    } finally {
      cleanup(parent);
    }
  });

  test("parent 缺失 / NUL / 相对路径 fail closed", () => {
    const parent = makeTempParent();
    try {
      expect(() => bootstrapDataRoot(join(parent, "missing-parent", "root"))).toThrow(
        DataRootError,
      );
      expect(() => bootstrapDataRoot("/tmp/a\u0000b")).toThrow(DataRootError);
      expect(() => bootstrapDataRoot("relative/root")).toThrow(DataRootError);
    } finally {
      cleanup(parent);
    }
  });

  test("已存在 symlink / 非空目录 / 错误 mode / 普通文件全部拒绝", () => {
    const parent = makeTempParent();
    try {
      const root = join(parent, "root");
      const real = join(parent, "real");
      mkdirSync(real, { mode: 0o700 });
      symlinkSync(real, root);
      expect(() => bootstrapDataRoot(root)).toThrow(
        expect.objectContaining({
          code: "DATA_ROOT_BOOTSTRAP_FAILED",
        }),
      );
      cleanup(root);
      cleanup(real);

      mkdirSync(root, { mode: 0o700 });
      writeFileSync(join(root, "stray.txt"), "x");
      expect(() => bootstrapDataRoot(root)).toThrow(
        expect.objectContaining({ code: "DATA_ROOT_BOOTSTRAP_FAILED" }),
      );
      cleanup(root);

      mkdirSync(root, { mode: 0o755 });
      expect(() => bootstrapDataRoot(root)).toThrow(
        expect.objectContaining({ code: "DATA_ROOT_BOOTSTRAP_FAILED" }),
      );
      cleanup(root);

      writeFileSync(root, "plain file");
      expect(() => bootstrapDataRoot(root)).toThrow(
        expect.objectContaining({ code: "DATA_ROOT_BOOTSTRAP_FAILED" }),
      );
    } finally {
      cleanup(parent);
    }
  });
});
describe("openDataRoot", () => {
  test("no-follow fd + BigInt fstat 建立稳定 dev/ino identity", () => {
    const parent = makeTempParent();
    try {
      const root = join(parent, "root");
      bootstrapDataRoot(root);
      const first = openDataRoot(root);
      const second = openDataRoot(root);
      expect(typeof first.identity.dev).toBe("bigint");
      expect(typeof first.identity.ino).toBe("bigint");
      expect(first.identity).toEqual(second.identity);
      expect(first.identity.dev).toBe(BigInt(statSync(root).dev));
      expect(first.identity.ino).toBe(BigInt(statSync(root).ino));
      // 本机卷积极确认为 local（临时目录与项目卷同为 APFS）
      expect(first.filesystemSupport).toBe("confirmed-local");
      expect(typeof first.rawFilesystemType).toBe("number");
      expect(first.closed).toBe(false);
      requireLiveOpenedDataRoot(first);
      first.close();
      second.close();
      expect(first.closed).toBe(true);
      expect(() => requireLiveOpenedDataRoot(first)).toThrow(DataRootError);
    } finally {
      cleanup(parent);
    }
  });

  test("held fd 不随路径替换漂移，配置路径 identity 改变时 fail closed", () => {
    const parent = makeTempParent();
    const rootPath = join(parent, "root");
    const displacedPath = join(parent, "displaced");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    try {
      const identity = root.identity;
      renameSync(rootPath, displacedPath);
      mkdirSync(rootPath, { mode: 0o700 });
      expect(root.identity).toEqual(identity);
      expect(() => requireLiveOpenedDataRoot(root)).toThrow(
        expect.objectContaining({
          code: "DATA_ROOT_UNAVAILABLE",
          message: "Data Root path identity 漂移",
        }),
      );
    } finally {
      root.close();
      cleanup(parent);
    }
  });

  test("missing/symlink/非目录/wrong mode 均 DATA_ROOT_UNAVAILABLE", () => {
    const parent = makeTempParent();
    try {
      const root = join(parent, "root");
      const expectUnavailable = (operation: () => unknown) => {
        expect(operation).toThrow(
          expect.objectContaining({ code: "DATA_ROOT_UNAVAILABLE" }),
        );
      };
      expectUnavailable(() => openDataRoot(root));

      mkdirSync(root, { mode: 0o755 });
      expectUnavailable(() => openDataRoot(root));
      cleanup(root);

      const real = join(parent, "real");
      mkdirSync(real, { mode: 0o700 });
      symlinkSync(real, root);
      expectUnavailable(() => openDataRoot(root));
      cleanup(root);
      cleanup(real);

      writeFileSync(root, "plain file");
      expectUnavailable(() => openDataRoot(root));
      cleanup(root);

      expectUnavailable(() => openDataRoot("relative/root"));
      expectUnavailable(() => openDataRoot("/tmp/a\u0000b"));
    } finally {
      cleanup(parent);
    }
  });

  test("case/path alias 指向同一 directory object 时 dev/ino 一致（大小写不敏感卷）", () => {
    const parent = makeTempParent();
    try {
      const root = join(parent, "CaseRoot");
      bootstrapDataRoot(root);
      const canonical = openDataRoot(root);
      const identity = canonical.identity;
      try {
        const alias = openDataRoot(join(parent, "caseroot"));
        try {
          expect(alias.identity).toEqual(identity);
        } finally {
          alias.close();
        }
      } catch (error) {
        // 大小写敏感卷上 alias 打开失败：本断言只在该卷上成立，跳过。
        if (error instanceof DataRootError && error.message.includes("ENOENT")) return;
        throw error;
      } finally {
        canonical.close();
      }
    } finally {
      cleanup(parent);
    }
  });
});

describe("固定 layout path builders", () => {
  test("只接受受限 digest/ID，拒绝路径注入", () => {
    expect(dataRootArtifactPath("a".repeat(64))).toBe(
      `artifacts/sha256/${"a".repeat(64)}`,
    );
    expect(dataRootProjectPath("project:dh-016")).toBe("projects/project:dh-016");
    expect(dataRootReceiptIntentPath("op:abc123")).toBe("receipts/op:abc123.intent.json");
    expect(dataRootReceiptResultPath("op:abc123")).toBe("receipts/op:abc123.result.json");
    expect(dataRootStagingPath("op:abc123", "tok")).toBe("staging/op:abc123-tok");

    expect(() => dataRootArtifactPath("A".repeat(64))).toThrow();
    expect(() => dataRootArtifactPath("short")).toThrow();
    expect(() => dataRootArtifactPath("../escape")).toThrow();
    expect(() => dataRootProjectPath("project:A/B")).toThrow();
    expect(() => dataRootProjectPath("project:a.b")).toThrow();
    expect(() => dataRootProjectPath("project:UPPER")).toThrow();
    expect(() => dataRootProjectPath("/etc/passwd")).toThrow();
    expect(() => dataRootReceiptIntentPath("op:../escape")).toThrow();
    expect(() => dataRootStagingPath("op:x", "bad/token")).toThrow();
  });
});
