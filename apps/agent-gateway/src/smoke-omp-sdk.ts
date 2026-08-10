import { RuntimeMvpHost, WorldToolSurface } from "@demiurges/world";
import { smokeOmpSdk } from "./omp-world-agent";

const result = await smokeOmpSdk(
  new WorldToolSurface(new RuntimeMvpHost()),
);

console.log(JSON.stringify(result, null, 2));
