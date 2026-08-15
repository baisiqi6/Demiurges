import { bootstrapDataRoot, DataRootError } from "./data-root";

// `bun run data:init -- /absolute/path`
// 唯一且有界的 root-birth operation：不创建子目录、不导入 Artifact、不启动 Gateway。
const args = process.argv.slice(2);
if (args.length !== 1) {
  console.error("用法：bun run data:init -- /absolute/path");
  process.exit(2);
}

try {
  const result = bootstrapDataRoot(args[0]!);
  console.log(result === "created" ? "created" : "already-exists");
} catch (error) {
  if (error instanceof DataRootError) {
    console.error(`data:init 失败：${error.code}: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
