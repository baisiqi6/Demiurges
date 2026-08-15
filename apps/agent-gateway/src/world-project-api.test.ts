import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  RuntimeMvpHost,
  createInitialSnapshot,
} from "@demiurges/world";
import {
  WORLD_PROJECT_BUNDLE_MEDIA_TYPE,
  bootstrapDataRoot,
  createWorldProjectManifest,
  encodeWorldProjectManifestV1,
  openWorldProjectRuntime,
} from "@demiurges/world-project";

import { createScriptedAgentClientFactory } from "./product-session";
import { createProductSessionApi } from "./product-session-api";

function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function neverEndingBody(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    pull() {
      return new Promise<void>(() => undefined);
    },
  });
}

describe("World Project Gateway API", () => {
  test("Open/Save/import 的无限 body 响应 abort/deadline 且零 Data Root mutation", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-project-api-body-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const runtime = await openWorldProjectRuntime(rootPath);
    try {
      const api = createProductSessionApi(createScriptedAgentClientFactory(), {
        worldProjects: runtime,
        bodyTimeoutMs: 30,
      });
      const sessionResponse = await api.fetch(new Request(
        "http://local/api/sessions",
        { method: "POST" },
      ));
      const session = await sessionResponse.json() as { sessionId: string };
      const before = await (await api.fetch(new Request(
        `http://local/api/sessions/${encodeURIComponent(session.sessionId)}`,
      ))).text();

      for (const [path, contentType, useAbort, headers] of [
        ["/api/projects/project%3Anever/open", "application/json", true, {}],
        [
          `/api/sessions/${encodeURIComponent(session.sessionId)}/project/save-as`,
          "application/json",
          false,
          { "idempotency-key": "never-save" },
        ],
        [
          `/api/sessions/${encodeURIComponent(session.sessionId)}/project/undo`,
          "application/json",
          false,
          {},
        ],
        [
          "/api/projects/import",
          WORLD_PROJECT_BUNDLE_MEDIA_TYPE,
          true,
          { "idempotency-key": "never-import" },
        ],
      ] as const) {
        const controller = new AbortController();
        const pending = api.fetch(new Request(`http://local${path}`, {
          method: "POST",
          headers: { "content-type": contentType, ...headers },
          body: neverEndingBody(),
          signal: controller.signal,
          duplex: "half",
        } as RequestInit));
        if (useAbort) setTimeout(() => controller.abort(), 5);
        const response = await Promise.race([
          pending,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Gateway body reader 未 bounded 收束")), 250)),
        ]);
        expect(response.status).toBe(408);
        expect(await response.json()).toEqual({
          error: useAbort ? "REQUEST_ABORTED" : "REQUEST_BODY_TIMEOUT",
        });
      }

      const after = await (await api.fetch(new Request(
        `http://local/api/sessions/${encodeURIComponent(session.sessionId)}`,
      ))).text();
      expect(after).toBe(before);
      expect(readdirSync(join(rootPath, "projects"))).toEqual([]);
      expect(readdirSync(join(rootPath, "receipts"))).toEqual([]);
      expect(readdirSync(join(rootPath, "staging"))).toEqual([]);
    } finally {
      await runtime.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("list/open/undo/save/export/import 形成 restart-safe 产品闭环", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-project-api-"));
    const sourcePath = join(parent, "source");
    const targetPath = join(parent, "target");
    bootstrapDataRoot(sourcePath);
    bootstrapDataRoot(targetPath);
    const source = await openWorldProjectRuntime(sourcePath);
    const target = await openWorldProjectRuntime(targetPath);
    try {
      const host = new RuntimeMvpHost();
      host.write(createInitialSnapshot());
      host.editCurrentCubeHeight(host.readRefRecord(), 3);
      const original = createWorldProjectManifest(
        "project:gateway",
        "Gateway World",
        host.exportProjectHistory(),
      );
      await source.writer!.save(original, "op:seed", null);

      const api = createProductSessionApi(createScriptedAgentClientFactory(), {
        worldProjects: source,
      });
      const listed = await api.fetch(new Request("http://local/api/projects"));
      expect(listed.status).toBe(200);
      expect(await listed.json()).toMatchObject({
        mode: "writer",
        projects: [{ projectId: original.projectId, revision: original.revision }],
      });
      expect(await (await api.fetch(new Request("http://local/api/projects"))).json())
        .not.toHaveProperty("projects.0.modifiedTimeMs");

      const opened = await api.fetch(new Request(
        `http://local/api/projects/${encodeURIComponent(original.projectId)}/open`,
        { method: "POST" },
      ));
      expect(opened.status).toBe(201);
      const openedBody = await opened.json() as {
        project: { revision: string };
        session: {
          sessionId: string;
          world: { ref: { name: "world:current"; snapshotId: string; version: number } };
        };
      };
      const sessionId = openedBody.session.sessionId;
      const undo = await api.fetch(jsonRequest(
        `http://local/api/sessions/${encodeURIComponent(sessionId)}/project/undo`,
        {
          projectRevision: openedBody.project.revision,
          ref: openedBody.session.world.ref,
        },
      ));
      expect(undo.status).toBe(200);
      expect(await undo.json()).toMatchObject({
        status: "updated",
        projection: {
          running: false,
          world: { ref: { snapshotId: "snapshot:base", version: 3 } },
        },
      });

      const staleUndo = await api.fetch(jsonRequest(
        `http://local/api/sessions/${encodeURIComponent(sessionId)}/project/undo`,
        {
          projectRevision: openedBody.project.revision,
          ref: openedBody.session.world.ref,
        },
      ));
      expect(staleUndo.status).toBe(409);
      expect(await staleUndo.json()).toEqual({ error: "PROJECT_REF_CONFLICT" });

      const saved = await api.fetch(jsonRequest(
        `http://local/api/sessions/${encodeURIComponent(sessionId)}/project/save`,
        {
          projectId: original.projectId,
          displayName: "Gateway World",
          expectedRevision: original.revision,
        },
        { "idempotency-key": "save-after-undo" },
      ));
      expect(saved.status).toBe(200);
      const savedBody = await saved.json() as {
        project: { revision: string };
      };
      expect(savedBody.project.revision).not.toBe(original.revision);
      expect(source.reader.open(original.projectId).history.cursor).toBe(0);

      const exported = await api.fetch(new Request(
        `http://local/api/projects/${encodeURIComponent(original.projectId)}/export`,
      ));
      expect(exported.status).toBe(200);
      expect(exported.headers.get("content-type")).toBe(WORLD_PROJECT_BUNDLE_MEDIA_TYPE);
      const bundle = new Uint8Array(await exported.arrayBuffer());

      const targetApi = createProductSessionApi(createScriptedAgentClientFactory(), {
        worldProjects: target,
      });
      const imported = await targetApi.fetch(new Request(
        "http://local/api/projects/import",
        {
          method: "POST",
          headers: {
            "content-type": WORLD_PROJECT_BUNDLE_MEDIA_TYPE,
            "idempotency-key": "portable-import",
          },
          body: bundle,
        },
      ));
      expect(imported.status).toBe(201);
      expect(await imported.json()).toMatchObject({
        projectId: original.projectId,
        revision: savedBody.project.revision,
        terminal: { variant: "success" },
      });
      expect(target.reader.open(original.projectId)).toEqual(
        source.reader.open(original.projectId),
      );
    } finally {
      await target.close();
      await source.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("Project control-plane 只暴露 canonical routes，旧 aliases fail closed", async () => {
    const parent = mkdtempSync(join(tmpdir(), "dh016-project-routes-"));
    const rootPath = join(parent, "root");
    bootstrapDataRoot(rootPath);
    const runtime = await openWorldProjectRuntime(rootPath);
    try {
      const api = createProductSessionApi(createScriptedAgentClientFactory(), {
        worldProjects: runtime,
      });
      const created = await api.fetch(new Request("http://local/api/sessions", {
        method: "POST",
      }));
      const session = await created.json() as { sessionId: string };
      for (const path of [
        "/api/projects/open",
        `/api/sessions/${encodeURIComponent(session.sessionId)}/history/undo`,
      ]) {
        expect((await api.fetch(new Request(`http://local${path}`, {
          method: "POST",
        }))).status).toBe(404);
      }
      const canonicalSaveAs = await api.fetch(jsonRequest(
        `http://local/api/sessions/${encodeURIComponent(session.sessionId)}/project/save-as`,
        {},
        { "idempotency-key": "route-save-as" },
      ));
      expect(canonicalSaveAs.status).toBe(400);
      expect(await canonicalSaveAs.json()).toEqual({ error: "INVALID_REQUEST" });
      expect((await api.fetch(new Request(
        `http://local/api/sessions/${encodeURIComponent(session.sessionId)}/project/redo`,
        { method: "POST" },
      ))).status).not.toBe(404);
      expect((await api.fetch(new Request(
        "http://local/api/projects/project%3Aabsent/open",
        { method: "POST" },
      ))).status).toBe(404);

      const outside = join(parent, "outside-project");
      mkdirSync(outside, { mode: 0o700 });
      const host = new RuntimeMvpHost();
      host.write(createInitialSnapshot());
      const outsideManifest = createWorldProjectManifest(
        "project:outside",
        "Outside",
        host.exportProjectHistory(),
      );
      writeFileSync(
        join(outside, "project.json"),
        encodeWorldProjectManifestV1(outsideManifest),
        { mode: 0o600 },
      );
      symlinkSync(outside, join(rootPath, "projects", outsideManifest.projectId));
      const escaped = await api.fetch(new Request(
        `http://local/api/projects/${encodeURIComponent(outsideManifest.projectId)}/open`,
        { method: "POST" },
      ));
      expect(escaped.status).toBe(409);
      expect(await escaped.json()).toEqual({ error: "PROJECT_RECOVERY_REQUIRED" });
    } finally {
      await runtime.close();
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
