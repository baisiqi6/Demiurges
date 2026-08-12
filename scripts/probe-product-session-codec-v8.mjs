import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const studioRequire = createRequire(new URL("../apps/studio/package.json", import.meta.url));
const { createServer } = await import(pathToFileURL(studioRequire.resolve("vite")));

const MAX_STDIN_BYTES = 2_000_000;
const STEP_TIMEOUT_MS = 4_000;

function withDeadline(label, operation) {
  let timeoutHandle;
  return Promise.race([
    operation(),
    new Promise((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error(`${label} 超过 ${STEP_TIMEOUT_MS}ms deadline`)),
        STEP_TIMEOUT_MS,
      );
    }),
  ]).finally(() => clearTimeout(timeoutHandle));
}

async function readBoundedProjection() {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.from(chunk);
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_STDIN_BYTES) {
      throw new Error(`V8 probe stdin 不能超过 ${MAX_STDIN_BYTES} bytes`);
    }
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const codecPath = fileURLToPath(new URL(
  "../packages/world/src/product-session-codec.ts",
  import.meta.url,
));
let vite;
let result;

try {
  const projection = await withDeadline("V8 probe stdin", readBoundedProjection);
  vite = await withDeadline("Vite createServer", () => createServer({
    appType: "custom",
    configFile: false,
    logLevel: "silent",
    server: { middlewareMode: true },
  }));
  const { decodeProductSessionProjectionTrusted } = await withDeadline(
    "Vite ssrLoadModule",
    () => vite.ssrLoadModule(`/@fs${codecPath}`),
  );
  await decodeProductSessionProjectionTrusted(projection, projection.sessionId);
  result = { decoded: true };
} catch (error) {
  result = {
    decoded: false,
    error: error instanceof Error ? error.message : String(error),
  };
} finally {
  if (vite !== undefined) {
    try {
      await withDeadline("Vite close", () => vite.close());
    } catch (error) {
      result = {
        decoded: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

process.stdout.write(JSON.stringify(result));
process.exitCode = result.decoded ? 0 : 1;
