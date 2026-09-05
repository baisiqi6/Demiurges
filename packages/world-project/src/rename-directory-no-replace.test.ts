import { describe, expect, test } from "bun:test";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  hasRenameDirectoryNoReplaceSymbol,
  renameDirectoryNoReplace,
} from "./rename-directory-no-replace";

function withDirectory(run: (parent: string) => void): void {
  const parent = mkdtempSync(join(tmpdir(), "dh017-rename-excl-"));
  try {
    run(parent);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

const darwinTest = test.skipIf(process.platform !== "darwin");

describe("atomic directory no-replace publication", () => {
  darwinTest("loads the exact macOS symbol without touching the filesystem", () => {
    withDirectory((parent) => {
      expect(hasRenameDirectoryNoReplaceSymbol()).toBe(true);
      expect(readdirSync(parent)).toEqual([]);
    });
  });

  darwinTest("publishes an absent destination without changing directory identity", () => {
    withDirectory((parent) => {
      const source = join(parent, "source");
      const destination = join(parent, "destination");
      mkdirSync(source, { mode: 0o700 });
      const before = lstatSync(source, { bigint: true });
      renameDirectoryNoReplace(source, destination);
      const after = lstatSync(destination, { bigint: true });
      expect(readdirSync(parent)).toEqual(["destination"]);
      expect([after.dev, after.ino, after.mode]).toEqual([
        before.dev,
        before.ino,
        before.mode,
      ]);
    });
  });

  for (const destinationKind of ["directory", "file", "symlink"] as const) {
    darwinTest(`never replaces an existing ${destinationKind}`, () => {
      withDirectory((parent) => {
        const source = join(parent, "source");
        const destination = join(parent, "destination");
        mkdirSync(source, { mode: 0o700 });
        if (destinationKind === "directory") {
          mkdirSync(destination, { mode: 0o700 });
        } else if (destinationKind === "file") {
          writeFileSync(destination, "foreign");
        } else {
          symlinkSync(join(parent, "missing"), destination);
        }
        const sourceBefore = lstatSync(source, { bigint: true });
        const destinationBefore = lstatSync(destination, { bigint: true });
        expect(() => renameDirectoryNoReplace(source, destination)).toThrow(
          "GENERATION_RECOVERY_REQUIRED",
        );
        const sourceAfter = lstatSync(source, { bigint: true });
        const destinationAfter = lstatSync(destination, { bigint: true });
        expect([sourceAfter.dev, sourceAfter.ino, sourceAfter.mode]).toEqual([
          sourceBefore.dev,
          sourceBefore.ino,
          sourceBefore.mode,
        ]);
        expect([
          destinationAfter.dev,
          destinationAfter.ino,
          destinationAfter.mode,
        ]).toEqual([
          destinationBefore.dev,
          destinationBefore.ino,
          destinationBefore.mode,
        ]);
      });
    });
  }

  test("rejects caller path ambiguity before invoking the native primitive", () => {
    expect(() => renameDirectoryNoReplace("relative", "/tmp/destination")).toThrow(
      "GENERATION_RECOVERY_REQUIRED",
    );
    expect(() =>
      renameDirectoryNoReplace("/tmp/source\0suffix", "/tmp/destination")
    ).toThrow("GENERATION_RECOVERY_REQUIRED");
    expect(() => renameDirectoryNoReplace("/tmp/same", "/tmp/same")).toThrow(
      "GENERATION_RECOVERY_REQUIRED",
    );
  });
});
