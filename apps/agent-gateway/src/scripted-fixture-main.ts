import { createProductSessionApi } from "./product-session-api";
import { createScriptedAgentClientFactory } from "./product-session";
import { MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID } from "@demiurges/world";
import { fileURLToPath } from "node:url";
import { createProviderAssetApi } from "./provider-asset-api";

const rawPort = process.env.DEMIURGES_GATEWAY_PORT ?? "8787";
const port = Number(rawPort);
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`DEMIURGES_GATEWAY_PORT 非法：${rawPort}`);
}

const api = createProductSessionApi(
  createScriptedAgentClientFactory(MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID),
);
const assets = createProviderAssetApi({
  cacheRoot: fileURLToPath(new URL("../../../.artifacts/provider-cache", import.meta.url)),
});
const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  fetch: async (request) => await assets.fetch(request) ?? api.fetch(request),
});

console.log(`Demiurges scripted test fixture listening on ${server.url}`);
