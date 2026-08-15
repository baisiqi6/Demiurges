import { ArtifactStoreReader } from "./artifact-store";
import { WorldProjectBundleStore } from "./bundle-store";
import { openDataRoot, type OpenedDataRoot } from "./data-root";
import {
  acquireDataRootWriterLease,
  type DataRootWriterLease,
} from "./data-root-lease";
import {
  WorldProjectReader,
  WorldProjectWriter,
} from "./project-store";
import { OperationSingleFlight } from "./operation-journal";
import { recoverPendingOperations } from "./startup-recovery";

export type WorldProjectRuntimeMode = "writer" | "reader";

export interface WorldProjectRuntime {
  readonly mode: WorldProjectRuntimeMode;
  readonly root: OpenedDataRoot;
  readonly artifacts: ArtifactStoreReader;
  readonly reader: WorldProjectReader;
  readonly writer: WorldProjectWriter | null;
  readonly bundles: WorldProjectBundleStore;
  readonly writerUnavailableReason: string | null;
  readonly closed: boolean;
  close(): Promise<void>;
}

export async function openWorldProjectRuntime(
  absolutePath: string,
): Promise<WorldProjectRuntime> {
  const root = openDataRoot(absolutePath);
  let lease: DataRootWriterLease | undefined;
  try {
    const acquired = await acquireDataRootWriterLease(root);
    if (acquired.status === "acquired") lease = acquired.lease;
    const artifacts = new ArtifactStoreReader(root);
    const reader = new WorldProjectReader(root, artifacts);
    const singleFlight = new OperationSingleFlight();
    const writer = lease === undefined
      ? null
      : new WorldProjectWriter(root, lease, artifacts, singleFlight);
    if (lease !== undefined) {
      // mutation routes 只能在 recovery 全部唯一收敛后对外可见。
      recoverPendingOperations(root, lease, reader);
    }
    const bundles = new WorldProjectBundleStore(root, lease, singleFlight);
    let closed = false;
    const runtime: WorldProjectRuntime = Object.freeze({
      mode: lease === undefined ? "reader" : "writer",
      root,
      artifacts,
      reader,
      writer,
      bundles,
      writerUnavailableReason:
        acquired.status === "unavailable" ? acquired.reason : null,
      get closed() {
        return closed;
      },
      async close() {
        if (closed) return;
        if (lease !== undefined) await lease.close();
        root.close();
        closed = true;
      },
    });
    return runtime;
  } catch (error) {
    if (lease !== undefined) await lease.close().catch(() => undefined);
    root.close();
    throw error;
  }
}
