import { describe, expect, it } from "bun:test";

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
});
