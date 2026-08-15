import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import type { Server, Socket } from "node:net";
import { sha256Hex } from "@demiurges/world";
import {
  requireLiveOpenedDataRoot,
  type DataRootIdentity,
  type OpenedDataRoot,
} from "./data-root";

/**
 * Data Root 唯一 writer admission：`DataRootWriterLease`。
 *
 * - identity bytes 严格为 UTF-8 `demiurges-data-root-lease-v1\0<dev-decimal>\0<ino-decimal>`，
 *   dev/ino 来自 held root fd 的 BigInt fstat；同一 host directory object 的
 *   case/path alias 得到同一 dev/ino 与 port。
 * - `leaseDigest=SHA-256(identityBytes)`，`port=49152 + (readUInt16BE(leaseDigest,0) % 16384)`。
 * - kernel listen handle 是唯一 lifetime/fencing authority：node:net/Bun 兼容 backend
 *   以 `exclusive:true`、`reusePort:false` 独占监听 `127.0.0.1:<port>`；
 *   SO_REUSEADDR（libuv 默认开启，实测 close/SIGKILL 后立即可 rebind）与
 *   SO_REUSEPORT（未启用，实测 live 二绑 EADDRINUSE）语义由真实子进程 probe 证明。
 *   不 probe 备用端口；不读取 PID/TTL/mtime/connect 结果判断 ownership。
 * - 可选 bounded handshake 只返回 fixed protocol version、lease digest 与
 *   opaque instance token 供诊断，不影响 admission。
 */

export const DATA_ROOT_LEASE_IDENTITY_PREFIX = "demiurges-data-root-lease-v1";
export const DATA_ROOT_LEASE_PORT_BASE = 49152;
export const DATA_ROOT_LEASE_PORT_MODULUS = 16384;
export const DATA_ROOT_LEASE_HANDSHAKE_PROTOCOL_VERSION =
  "demiurges-data-root-lease-handshake-v1";
export const DATA_ROOT_LEASE_HANDSHAKE_DEADLINE_MS = 1_000;
export const DATA_ROOT_LEASE_CLOSE_DEADLINE_MS = 2_000;

const LEASE_HOST = "127.0.0.1";

export function dataRootLeaseIdentityBytes(
  identity: DataRootIdentity,
): Uint8Array {
  return new TextEncoder().encode(
    `${DATA_ROOT_LEASE_IDENTITY_PREFIX}\u0000${identity.dev.toString()}\u0000${identity.ino.toString()}`,
  );
}

export function dataRootLeaseDigest(identity: DataRootIdentity): string {
  return sha256Hex(dataRootLeaseIdentityBytes(identity));
}

/** 同一 v1 formula 的唯一实现：不同 code path 都调用这里，不留选择余地。 */
export function dataRootLeasePort(identity: DataRootIdentity): number {
  const digest = dataRootLeaseDigest(identity);
  // readUInt16BE(leaseDigest, 0)：digest 前两个 byte 的 big-endian u16 = 前 4 个 hex 字符。
  const firstTwoBytes = parseInt(digest.slice(0, 4), 16);
  return (
    DATA_ROOT_LEASE_PORT_BASE +
    (firstTwoBytes % DATA_ROOT_LEASE_PORT_MODULUS)
  );
}

export interface DataRootWriterLease {
  readonly identity: DataRootIdentity;
  readonly leaseDigest: string;
  readonly port: number;
  readonly instanceToken: string;
  readonly closed: boolean;
  close(): Promise<void>;
}

interface DataRootWriterLeaseState {
  readonly root: OpenedDataRoot;
  readonly server: Server;
  readonly identity: DataRootIdentity;
  readonly leaseDigest: string;
  readonly instanceToken: string;
  readonly port: number;
  closed: boolean;
}

const DATA_ROOT_WRITER_LEASE_STATES = new WeakMap<
  DataRootWriterLease,
  DataRootWriterLeaseState
>();

/** package-owned writer capability admission；拒绝 shape-compatible forged object。 */
export function requireLiveDataRootWriterLease(lease: DataRootWriterLease): {
  readonly root: OpenedDataRoot;
  readonly identity: DataRootIdentity;
  readonly leaseDigest: string;
  readonly instanceToken: string;
  readonly port: number;
} {
  const state = DATA_ROOT_WRITER_LEASE_STATES.get(lease);
  if (state === undefined || state.closed || !state.server.listening) {
    throw new Error("Data Root writer lease 非本包所有或已关闭");
  }
  const liveRoot = requireLiveOpenedDataRoot(state.root);
  if (
    liveRoot.identity.dev !== state.identity.dev ||
    liveRoot.identity.ino !== state.identity.ino
  ) {
    throw new Error("Data Root writer lease 与 live root identity 不一致");
  }
  return Object.freeze({
    root: state.root,
    identity: state.identity,
    leaseDigest: state.leaseDigest,
    instanceToken: state.instanceToken,
    port: state.port,
  });
}

export type AcquireDataRootWriterLeaseResult =
  | { readonly status: "acquired"; readonly lease: DataRootWriterLease }
  | {
      readonly status: "unavailable";
      readonly code: "DATA_ROOT_WRITER_LEASE_UNAVAILABLE";
      readonly port: number;
      readonly reason: string;
    };

/**
 * 独占监听 derived port；filesystem 未积极确认本地时 fail closed（reader mode），
 * `EADDRINUSE` 返回 `DATA_ROOT_WRITER_LEASE_UNAVAILABLE` 且绝不 probe 备用端口。
 */
export async function acquireDataRootWriterLease(
  root: OpenedDataRoot,
): Promise<AcquireDataRootWriterLeaseResult> {
  const liveRoot = requireLiveOpenedDataRoot(root);
  const port = dataRootLeasePort(liveRoot.identity);
  if (root.filesystemSupport !== "confirmed-local") {
    return {
      status: "unavailable",
      code: "DATA_ROOT_WRITER_LEASE_UNAVAILABLE",
      port,
      reason: "filesystem-not-confirmed-local",
    };
  }

  const leaseDigest = dataRootLeaseDigest(liveRoot.identity);
  const instanceToken = randomBytes(16).toString("hex");
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.setTimeout(DATA_ROOT_LEASE_HANDSHAKE_DEADLINE_MS, () =>
      socket.destroy(),
    );
    socket.on("error", () => socket.destroy());
    socket.on("close", () => sockets.delete(socket));
    // 不读取任何请求字节：只写一行 fixed protocol JSON 诊断并关闭。
    socket.end(
      JSON.stringify({
        protocol: DATA_ROOT_LEASE_HANDSHAKE_PROTOCOL_VERSION,
        leaseDigest,
        instanceToken,
      }) + "\n",
    );
  });

  const bound = await new Promise<boolean>((resolve) => {
    server.once("error", () => resolve(false));
    server.listen(
      { port, host: LEASE_HOST, exclusive: true, reusePort: false },
      () => resolve(true),
    );
  });
  if (!bound) {
    return {
      status: "unavailable",
      code: "DATA_ROOT_WRITER_LEASE_UNAVAILABLE",
      port,
      reason: "listen-failed",
    };
  }

  let closed = false;
  let closing: Promise<void> | undefined;
  const close = async (): Promise<void> => {
    if (closed) return;
    if (closing !== undefined) return closing;
    for (const socket of sockets) socket.destroy();
    closing = new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(
        () => reject(new Error("Data Root writer lease close deadline 超时")),
        DATA_ROOT_LEASE_CLOSE_DEADLINE_MS,
      );
      server.close((error) => {
        clearTimeout(deadline);
        if (error !== undefined) {
          reject(error);
          return;
        }
        closed = true;
        state.closed = true;
        resolve();
      });
    });
    return closing;
  };

  const state: DataRootWriterLeaseState = {
    root,
    server,
    identity: liveRoot.identity,
    leaseDigest,
    instanceToken,
    port,
    closed: false,
  };
  const lease: DataRootWriterLease = Object.freeze({
      identity: liveRoot.identity,
      leaseDigest,
      port,
      instanceToken,
      get closed() {
        return closed;
      },
      close,
    });
  DATA_ROOT_WRITER_LEASE_STATES.set(lease, state);
  return {
    status: "acquired",
    lease,
  };
}
