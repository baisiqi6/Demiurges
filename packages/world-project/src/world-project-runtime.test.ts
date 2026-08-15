import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { RuntimeMvpHost, createInitialSnapshot } from "@demiurges/world";

import { bootstrapDataRoot } from "./data-root";
import { createWorldProjectManifest } from "./project-store";
import { openWorldProjectRuntime } from "./world-project-runtime";

describe("WorldProjectRuntime", () => {
  test("同一 host/Data Root 最多一个 writer；reader 跨 runtime 读取同一 Project", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-runtime-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const first = await openWorldProjectRuntime(rootPath);
    const second = await openWorldProjectRuntime(rootPath);
    try {
      expect(first.mode).toBe("writer");
      expect(second.mode).toBe("reader");
      expect(second.writer).toBeNull();
      expect(second.writerUnavailableReason).toBe("listen-failed");

      const host = new RuntimeMvpHost();
      host.write(createInitialSnapshot());
      const manifest = createWorldProjectManifest(
        "project:shared",
        "Shared",
        host.exportProjectHistory(),
      );
      await first.writer!.save(manifest, "op:shared", null);
      expect(second.reader.open(manifest.projectId)).toEqual(manifest);
    } finally {
      await second.close();
      await first.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
