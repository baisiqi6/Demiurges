import { createProductSessionApi } from "./product-session-api";
import { createScriptedAgentClientFactory } from "./product-session";
import { BALL_VESSEL_FIXTURE_ID } from "@demiurges/world";

const rawPort = process.env.DEMIURGES_GATEWAY_PORT ?? "8787";
const port = Number(rawPort);
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`DEMIURGES_GATEWAY_PORT 非法：${rawPort}`);
}

const api = createProductSessionApi(
  createScriptedAgentClientFactory(BALL_VESSEL_FIXTURE_ID),
);
const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  fetch: api.fetch,
});

console.log(`Demiurges scripted test fixture listening on ${server.url}`);
