import { describe, expect, test } from "bun:test";
import { connect } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { sha256Hex } from "@demiurges/world";
import {
  bootstrapDataRoot,
  openDataRoot,
  type OpenedDataRoot,
} from "./data-root";
import {
  DATA_ROOT_LEASE_HANDSHAKE_PROTOCOL_VERSION,
  DATA_ROOT_LEASE_IDENTITY_PREFIX,
  DATA_ROOT_LEASE_PORT_BASE,
  DATA_ROOT_LEASE_PORT_MODULUS,
  acquireDataRootWriterLease,
  dataRootLeaseDigest,
  dataRootLeaseIdentityBytes,
  dataRootLeasePort,
} from "./data-root-lease";

function makeRoot(): { root: OpenedDataRoot; path: string } {
  const parent = mkdtempSync(join(tmpdir(), "dh016-lease-"));
  const path = join(parent, "root");
  bootstrapDataRoot(path);
  return { root: openDataRoot(path), path };
}

function cleanup(path: string): void {
  rmSync(dirname(path), { recursive: true, force: true });
}

/** 测试内独立重算 v1 formula，不与实现共享 code path。 */
function expectV1Formula(identity: { dev: bigint; ino: bigint }): {
  digest: string;
  port: number;
} {
  const identityBytes = new TextEncoder().encode(
    `${DATA_ROOT_LEASE_IDENTITY_PREFIX}\u0000${identity.dev.toString()}\u0000${identity.ino.toString()}`,
  );
  const digest = sha256Hex(identityBytes);
  // readUInt16BE(digestBytes, 0) = digest 前两个 byte 的 BE u16
  const firstTwoBytes = parseInt(digest.slice(0, 4), 16);
  const port =
    DATA_ROOT_LEASE_PORT_BASE + (firstTwoBytes % DATA_ROOT_LEASE_PORT_MODULUS);
  return { digest, port };
}

describe("lease identity/port derivation", () => {
  test("identity bytes / digest / port 与 plan v1 formula exact", () => {
    const { root, path } = makeRoot();
    try {
      const identityBytes = dataRootLeaseIdentityBytes(root.identity);
      const expectedBytes = new TextEncoder().encode(
        `${DATA_ROOT_LEASE_IDENTITY_PREFIX}\u0000${root.identity.dev.toString()}\u0000${root.identity.ino.toString()}`,
      );
      expect(identityBytes).toEqual(expectedBytes);
      const { digest, port } = expectV1Formula(root.identity);
      expect(dataRootLeaseDigest(root.identity)).toBe(digest);
      expect(dataRootLeasePort(root.identity)).toBe(port);
      expect(port).toBeGreaterThanOrEqual(DATA_ROOT_LEASE_PORT_BASE);
      expect(port).toBeLessThan(65536);
      // deterministic：同一 identity 两次计算一致
      expect(dataRootLeasePort(root.identity)).toBe(port);
      expect(dataRootLeaseDigest(root.identity)).toBe(digest);
      expect(digest).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      root.close();
      cleanup(path);
    }
  });
});

describe("acquireDataRootWriterLease", () => {
  test("独占监听 derived port；bounded handshake 返回 fixed protocol/lease digest/token", async () => {
    const { root, path } = makeRoot();
    try {
      const result = await acquireDataRootWriterLease(root);
      expect(result.status).toBe("acquired");
      if (result.status !== "acquired") return;
      const lease = result.lease;
      expect(lease.port).toBe(dataRootLeasePort(root.identity));
      expect(lease.leaseDigest).toBe(dataRootLeaseDigest(root.identity));
      expect(lease.instanceToken).toMatch(/^[a-f0-9]{32}$/);
      expect(lease.closed).toBe(false);

      // 真实连接读取 bounded handshake 单行
      const line = await new Promise<string>((resolve, reject) => {
        const socket = connect({ port: lease.port, host: "127.0.0.1" });
        const deadline = setTimeout(() => {
          socket.destroy();
          reject(new Error("handshake deadline 超时"));
        }, 2_000);
        let buffer = "";
        socket.on("data", (chunk) => {
          buffer += String(chunk);
          if (buffer.includes("\n")) {
            clearTimeout(deadline);
            socket.destroy();
            resolve(buffer);
          }
        });
        socket.on("error", (error) => {
          clearTimeout(deadline);
          reject(error);
        });
      });
      const handshake = JSON.parse(line.split("\n")[0]!) as {
        protocol: string;
        leaseDigest: string;
        instanceToken: string;
      };
      expect(handshake.protocol).toBe(DATA_ROOT_LEASE_HANDSHAKE_PROTOCOL_VERSION);
      expect(handshake.leaseDigest).toBe(lease.leaseDigest);
      expect(handshake.instanceToken).toBe(lease.instanceToken);

      await lease.close();
      expect(lease.closed).toBe(true);
      // close 幂等
      await lease.close();
    } finally {
      root.close();
      cleanup(path);
    }
  });

  test("第二 writer EADDRINUSE → DATA_ROOT_WRITER_LEASE_UNAVAILABLE，不 probe 备用端口", async () => {
    const { root, path } = makeRoot();
    try {
      const first = await acquireDataRootWriterLease(root);
      expect(first.status).toBe("acquired");
      const second = await acquireDataRootWriterLease(root);
      expect(second).toMatchObject({
        status: "unavailable",
        code: "DATA_ROOT_WRITER_LEASE_UNAVAILABLE",
        port: dataRootLeasePort(root.identity),
      });
      // reader fallback：lease 不可得时 root 仍可只读打开
      const reader = openDataRoot(path);
      try {
        expect(reader.identity).toEqual(root.identity);
      } finally {
        reader.close();
      }
      if (first.status === "acquired") await first.lease.close();
    } finally {
      root.close();
      cleanup(path);
    }
  });

  test("release 后可 reacquire（close 为 bounded cleanup，无残留 listener）", async () => {
    const { root, path } = makeRoot();
    try {
      const first = await acquireDataRootWriterLease(root);
      expect(first.status).toBe("acquired");
      if (first.status !== "acquired") return;
      const started = Date.now();
      await first.lease.close();
      expect(Date.now() - started).toBeLessThan(2_000);
      const second = await acquireDataRootWriterLease(root);
      expect(second.status).toBe("acquired");
      if (second.status === "acquired") {
        expect(second.lease.port).toBe(first.lease.port);
        await second.lease.close();
      }
      // 再次关闭后端口完全释放，第三次仍可 reacquire
      const third = await acquireDataRootWriterLease(root);
      expect(third.status).toBe("acquired");
      if (third.status === "acquired") await third.lease.close();
    } finally {
      root.close();
      cleanup(path);
    }
  });

  test("伪造或已关闭的 root handle fail closed，不监听", async () => {
    const { root, path } = makeRoot();
    try {
      const forgedRoot = {
        absolutePath: path,
        identity: root.identity,
        filesystemSupport: "unknown",
        rawFilesystemType: null,
        closed: false,
        close() {},
      } as OpenedDataRoot;
      await expect(acquireDataRootWriterLease(forgedRoot)).rejects.toMatchObject({
        code: "DATA_ROOT_UNAVAILABLE",
      });

      root.close();
      await expect(acquireDataRootWriterLease(root)).rejects.toMatchObject({
        code: "DATA_ROOT_UNAVAILABLE",
      });
    } finally {
      root.close();
      cleanup(path);
    }
  });
});
