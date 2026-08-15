import { resolve } from "node:path";

import { openDataRoot } from "./data-root";
import { acquireDataRootWriterLease } from "./data-root-lease";
import { importDh013ProviderCache } from "./import-dh013";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) return undefined;
  return value;
}

const dataRootPath = option("--data-root");
const cacheRoot = option("--cache-root") ?? resolve(
  import.meta.dir,
  "../../../../Demiurges-DH-013/.artifacts/provider-cache",
);
if (dataRootPath === undefined) {
  process.stderr.write(
    "用法：bun run import:dh013 -- --data-root /absolute/path [--cache-root /absolute/legacy-cache]\n",
  );
  process.exit(2);
}

const root = openDataRoot(dataRootPath);
const leaseResult = await acquireDataRootWriterLease(root);
if (leaseResult.status !== "acquired") {
  root.close();
  process.stderr.write(`DATA_ROOT_READ_ONLY: ${leaseResult.reason}\n`);
  process.exit(1);
}
try {
  const result = await importDh013ProviderCache(root, leaseResult.lease, cacheRoot);
  process.stdout.write(`${JSON.stringify({
    status: result.terminal.variant,
    replayed: result.replayed,
    operationId: result.terminal.operationId,
  })}\n`);
} catch (error) {
  const code =
    typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
      ? error.code
      : "IMPORT_FAILED";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
} finally {
  await leaseResult.lease.close().catch(() => undefined);
  root.close();
}
