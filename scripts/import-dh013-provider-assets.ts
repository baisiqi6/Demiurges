import { fileURLToPath } from "node:url";

import {
  ProviderImportError,
  importDh013ProviderArtifacts,
  writeSanitizedImportReceipt,
} from "./dh013-provider-import";

const repoRoot = fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/u, "");
const cacheRoot = fileURLToPath(new URL("../.artifacts/provider-cache/", import.meta.url));

if (process.cwd() !== repoRoot && !process.cwd().startsWith(`${repoRoot}/`)) {
  process.stderr.write("DH-013 importer 必须从 Demiurges worktree 内运行\n");
  process.exit(1);
}

try {
  const receipts = await importDh013ProviderArtifacts({ cacheRoot });
  await writeSanitizedImportReceipt(cacheRoot, receipts);
  process.stdout.write(`${JSON.stringify({ status: "verified", receipts }, null, 2)}\n`);
} catch (error) {
  const safe = error instanceof ProviderImportError ? error.message : "IMPORT_FAILED";
  process.stderr.write(`${safe}\n`);
  process.exitCode = 1;
}
