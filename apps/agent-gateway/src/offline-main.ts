import { createProductSessionApi } from "./product-session-api";

const port = Number(process.env.DEMIURGES_GATEWAY_PORT ?? "8787");
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error("DEMIURGES_GATEWAY_PORT 非法");

// 独立离线入口；不读取 provider credential，不把 OMP production 配置降级为 scripted Agent。
const api = createProductSessionApi(() => { throw new Error("此 Gateway 只开放离线人类任务"); });
const server = Bun.serve({
  hostname: "127.0.0.1", port,
  fetch: api.fetch,
});
console.log(`Demiurges offline task Gateway listening on ${server.url}`);
const shutdown = () => { server.stop(true); process.exit(0); };
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
