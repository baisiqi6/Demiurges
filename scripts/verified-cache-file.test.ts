import { describe, expect, test } from "bun:test";
import { mkdtemp, open, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  requireStableOpenedFileIdentity,
  VERIFIED_CACHE_OPEN_FLAGS,
} from "./verified-cache-file";

describe("DH-013 verified cache file identity", () => {
  test("同 fd 在读取期间发生 mtime/ctime 漂移即 fail closed", async () => {
    const directory = await mkdtemp(join(tmpdir(), "demiurges-cache-identity-"));
    const path = join(directory, "artifact");
    try {
      await writeFile(path, new Uint8Array(32), { mode: 0o600 });
      const handle = await open(path, VERIFIED_CACHE_OPEN_FLAGS);
      try {
        const before = await handle.stat({ bigint: true });
        await utimes(path, new Date(1_700_000_000_000), new Date(1_700_000_000_000));
        const after = await handle.stat({ bigint: true });
        expect(() => requireStableOpenedFileIdentity(before, after, 32, 0o600))
          .toThrow("漂移");
      } finally {
        await handle.close();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
