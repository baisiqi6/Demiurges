import { describe, expect, test } from "bun:test";

describe("Agent Gateway production composition", () => {
  test("executable entry 显式选择真实 OMP factory，不引用 scripted fixture", async () => {
    const source = await Bun.file(new URL("./main.ts", import.meta.url)).text();

    expect(source).toContain("DEMIURGES_OMP_MODEL");
    expect(source).toContain(
      "createProductSessionApi(createOmpAgentClientFactory(modelSelector))",
    );
    expect(source).not.toContain("createScriptedAgentClientFactory");
  });
});
