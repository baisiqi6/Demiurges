import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Agent Gateway import boundary", () => {
  it("不从 Studio application 目录取得世界 authority", async () => {
    const paths = Array.from(
      new Bun.Glob("*.ts").scanSync({ cwd: import.meta.dir, absolute: true }),
    ).filter((path) => !path.endsWith(".test.ts"));
    const sources = await Promise.all(paths.map((path) => Bun.file(path).text()));

    expect(paths.length).toBeGreaterThanOrEqual(6);
    for (const source of sources) {
      expect(source).not.toContain("studio/src");
    }
  });

  it("provider submit orchestrator 不引入 production composition/route/credential/真实 fetch/World/Studio 面", () => {
    const source = readFileSync(
      join(import.meta.dir, "provider-submit-orchestrator.ts"),
      "utf8",
    );
    const specifiers = [...source.matchAll(/(?:from|import)\s*\(\s*["']([^"']+)["']/g)]
      .map((match) => match[1]);
    for (const specifier of specifiers) {
      expect(specifier.startsWith("node:")).toBe(false);
      expect(specifier).not.toMatch(
        /keychain|credential|studio|world-project\/src|agent-gateway\/src\/main|agent-gateway\/src\/index|admission-api|product-session-api|generated-artifact-api|smoke|omp/i,
      );
    }
    for (const token of [
      "fetch(",
      "process.env",
      "Keychain",
      "Bun.serve",
      "node:http",
      "WebSocket",
      "AbortSignal.timeout",
    ]) {
      expect(source).not.toContain(token);
    }
  });
});
