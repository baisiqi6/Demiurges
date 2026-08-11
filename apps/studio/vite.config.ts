import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

const gatewayUrl = process.env.DEMIURGES_GATEWAY_URL ?? "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [solid()],
  server: {
    proxy: {
      "/api": gatewayUrl,
    },
  },
  build: {
    target: "esnext",
  },
});
