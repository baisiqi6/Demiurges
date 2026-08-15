import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { connect } from "node:net";
import { bootstrapDataRoot, openDataRoot } from "./data-root";
import {
  acquireDataRootWriterLease,
  dataRootLeasePort,
} from "./data-root-lease";

/**
 * Bun 1.3.14 真实子进程 probe：
 * - live / SIGSTOP paused owner 均排他持有 kernel listen handle；
 * - accepted handshake 后 SIGKILL 可在 bounded deadline 内 rebind（SO_REUSEADDR 生效且无 SO_REUSEPORT）；
 * - child 有 deadline、kill/reap，测试退出不留残余 listener/进程。
 */

const READY_DEADLINE_MS = 10_000;
const REBIND_DEADLINE_MS = 5_000;

interface HolderLine {
  ready: boolean;
  port?: number;
  pid?: number;
  code?: string;
  reason?: string;
}

function spawnHolder(
  rootPath: string,
): { child: { stdout: ReadableStream<Uint8Array>; kill: (signal?: number | string) => void; exited: Promise<unknown>; pid: number } } {
  return { child: Bun.spawn({
    cmd: [process.execPath, "lease-holder-probe.ts", rootPath],
    cwd: import.meta.dir,
    stdout: "pipe",
    stderr: "inherit",
  }) };
}
async function readHolderLine(
  child: { stdout: ReadableStream<Uint8Array>; kill: (signal?: number | string) => void; exited: Promise<unknown> },
  deadlineMs: number,
): Promise<HolderLine> {
  const reader = child.stdout.getReader();
  const collected = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("holder ready deadline 超时")), deadlineMs);
    let buffer = "";
    const pump = async (): Promise<void> => {
      try {
        const { value, done } = await reader.read();
        if (done) {
          clearTimeout(timer);
          reject(new Error(`holder 提前退出：${buffer}`));
          return;
        }
        buffer += new TextDecoder().decode(value);
        if (buffer.includes("\n")) {
          clearTimeout(timer);
          resolve(buffer);
          return;
        }
        await pump();
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    };
    void pump();
  });
  try {
    const line = (await collected).split("\n")[0]!;
    return JSON.parse(line) as HolderLine;
  } finally {
    reader.releaseLock();
  }
}

describe("Bun 1.3.14 子进程 lease 排他 probe", () => {
  test("live/paused owner 排他，SIGKILL 后 deadline 内 rebind，child 被 reaped", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-lease-probe-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const derivedPort = dataRootLeasePort(root.identity);
    const holder = spawnHolder(rootPath);
    let killed = false;
    try {
      const line = await readHolderLine(holder.child, READY_DEADLINE_MS);
      if (!line.ready) {
        throw new Error(`holder 启动失败：${line.code} ${line.reason}`);
      }
      expect(line.port).toBe(derivedPort);

      // live owner 排他：父进程 acquire 必须失败
      const duringLive = await acquireDataRootWriterLease(root);
      expect(duringLive.status).toBe("unavailable");

      // SIGSTOP paused owner 仍持有 kernel listen handle
      process.kill(holder.child.pid, "SIGSTOP");
      const duringPause = await acquireDataRootWriterLease(root);
      expect(duringPause.status).toBe("unavailable");

      // paused owner 的 bounded handshake 在 deadline 内无响应（connection 排队但不回包）
      const handshakeTimedOut = await new Promise<boolean>((resolve) => {
        const socket = connect({ port: derivedPort, host: "127.0.0.1" });
        const timer = setTimeout(() => {
          socket.destroy();
          resolve(true);
        }, 1_000);
        socket.on("data", () => {
          clearTimeout(timer);
          socket.destroy();
          resolve(false);
        });
        socket.on("error", () => {
          clearTimeout(timer);
          resolve(true);
        });
      });
      expect(handshakeTimedOut).toBe(true);

      // SIGKILL 后 OS 释放 handle，bounded deadline 内 rebind
      process.kill(holder.child.pid, "SIGKILL");
      killed = true;
      const rebindStarted = Date.now();
      let acquired = false;
      while (Date.now() - rebindStarted < REBIND_DEADLINE_MS) {
        const result = await acquireDataRootWriterLease(root);
        if (result.status === "acquired") {
          acquired = true;
          expect(result.lease.port).toBe(derivedPort);
          await result.lease.close();
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(acquired).toBe(true);
    } finally {
      if (!killed) {
        process.kill(holder.child.pid, "SIGKILL");
      }
      await holder.child.exited;
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("deterministic port 被无关进程占用时 child 稳定失败并退出，不 probe 备用端口", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-lease-probe-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const root = openDataRoot(rootPath);
    const derivedPort = dataRootLeasePort(root.identity);

    // 父进程先占用 derived port（模拟无关进程）
    const squatter = await acquireDataRootWriterLease(root);
    expect(squatter.status).toBe("acquired");
    if (squatter.status !== "acquired") return;

    const holder = spawnHolder(rootPath);
    try {
      const line = await readHolderLine(holder.child, READY_DEADLINE_MS);
      expect(line.ready).toBe(false);
      expect(line.code).toBe("DATA_ROOT_WRITER_LEASE_UNAVAILABLE");
      await holder.child.exited;
    } finally {
      await squatter.lease.close();
      root.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
