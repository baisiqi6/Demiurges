import { openDataRoot } from "./data-root";
import { acquireDataRootWriterLease, dataRootLeaseDigest } from "./data-root-lease";

// 测试专用子进程 fixture：打开 root → 取得 writer lease → 输出一行 ready JSON →
// 保持存活直到被 parent kill。任何 acquire 失败打印 failed 并 exit 3。
// 覆盖真实 Bun 子进程排他语义：live/paused 占用、SIGKILL 后 deadline 内 rebind。
const rootPath = process.argv[2];
if (typeof rootPath !== "string" || rootPath.length === 0) {
  console.error("lease-holder-probe 需要 Data Root 绝对路径");
  process.exit(2);
}

try {
  const root = openDataRoot(rootPath);
  const result = await acquireDataRootWriterLease(root);
  if (result.status !== "acquired") {
    process.stdout.write(
      JSON.stringify({ ready: false, code: result.code, reason: result.reason }) +
        "\n",
    );
    process.exit(3);
  }
  process.stdout.write(
    JSON.stringify({
      ready: true,
      port: result.lease.port,
      digest: dataRootLeaseDigest(root.identity),
      pid: process.pid,
    }) + "\n",
  );
  // 保持进程存活：server handle 是唯一 lifetime authority，parent 负责 kill/reap。
  setInterval(() => {}, 1_000);
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      ready: false,
      code: "PROBE_FAILED",
      reason: error instanceof Error ? error.message : String(error),
    }) + "\n",
  );
  process.exit(3);
}
