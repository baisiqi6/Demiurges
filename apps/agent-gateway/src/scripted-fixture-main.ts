import { createProductSessionApi } from "./product-session-api";
import { createScriptedAgentClientFactory } from "./product-session";
import { MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID } from "@demiurges/world";
import { createProviderAssetApi } from "./provider-asset-api";
import {
  openWorldProjectRuntime,
  resolveDataRootConfig,
} from "@demiurges/world-project";

const rawPort = process.env.DEMIURGES_GATEWAY_PORT ?? "8787";
const port = Number(rawPort);
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`DEMIURGES_GATEWAY_PORT 非法：${rawPort}`);
}

const dataRootConfig = resolveDataRootConfig(process.env);
const worldProjects = dataRootConfig.status === "configured"
  ? await openWorldProjectRuntime(dataRootConfig.absolutePath)
  : undefined;
const api = createProductSessionApi(
  createScriptedAgentClientFactory(MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID),
  { worldProjects },
);
const assets = createProviderAssetApi({
  readArtifact: async (entry) => {
    if (worldProjects === undefined) {
      const error = new Error("asset not imported") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    }
    return worldProjects.artifacts.read(entry);
  },
});
const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  fetch: async (request) => await assets.fetch(request) ?? api.fetch(request),
});

console.log(`Demiurges scripted test fixture listening on ${server.url}`);
if (worldProjects !== undefined) {
  console.log(`World Project Data Root mode: ${worldProjects.mode}`);
}

const shutdown = async () => {
  server.stop(true);
  await worldProjects?.close();
  process.exit(0);
};
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
