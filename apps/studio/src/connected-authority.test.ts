import { describe, expect, test } from "bun:test";

describe("Studio connected authority boundary", () => {
  test("connected App 不创建浏览器侧 RuntimeMvpHost 或初始 Snapshot", async () => {
    const paths = Array.from(
      new Bun.Glob("**/*.{ts,tsx}").scanSync({ cwd: import.meta.dir, absolute: true }),
    ).filter((path) => !path.includes(".test."));
    const sources = await Promise.all(paths.map((path) => Bun.file(path).text()));
    const app = await Bun.file(new URL("./App.tsx", import.meta.url)).text();

    expect(paths.length).toBeGreaterThanOrEqual(5);
    for (const source of sources) {
      expect(source).not.toContain("RuntimeMvpHost");
      expect(source).not.toContain("createInitialSnapshot");
    }
    expect(app).toContain("ProductSessionClient");
    expect(app).not.toContain("CUBE_REF");
    expect(app).not.toContain("FALLING_CUBE_PROGRAM");
    expect(app).not.toContain("DIAGNOSTIC_RIGID_ASSET");
  });
});
