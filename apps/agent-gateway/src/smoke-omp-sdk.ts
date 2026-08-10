import { RuntimeMvpHost } from "../../studio/src/host/runtime-mvp-host";
import { WorldToolSurface } from "../../studio/src/world-tools/world-tool-surface";
import { smokeOmpSdk } from "./omp-world-agent";

const result = await smokeOmpSdk(
  new WorldToolSurface(new RuntimeMvpHost()),
);

console.log(JSON.stringify(result, null, 2));
