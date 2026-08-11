import { createProductSessionApi } from "./product-session-api";
import {
  createOmpAgentClientFactory,
  requireOmpModelSelector,
} from "./omp-world-agent";

const rawPort = process.env.DEMIURGES_GATEWAY_PORT ?? "8787";
const port = Number(rawPort);
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`DEMIURGES_GATEWAY_PORT 非法：${rawPort}`);
}

const modelSelector = requireOmpModelSelector(process.env.DEMIURGES_OMP_MODEL);
const api = createProductSessionApi(createOmpAgentClientFactory(modelSelector));
const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  fetch: api.fetch,
});

console.log(`Demiurges Agent Gateway listening on ${server.url}`);
