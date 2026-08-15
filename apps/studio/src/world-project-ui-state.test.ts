import { expect, test } from "bun:test";

import {
  hasWorldAuthorityTransition,
  canExportBoundProject,
} from "./world-project-ui-state";

const projection = (snapshotId: string, version: number) => ({
  sessionId: "session:dirty-state",
  world: {
    snapshot: { id: snapshotId },
    ref: { name: "world:current", snapshotId, version },
  },
  lastRun: null,
  lastSequence: 0,
  running: false,
}) as never;

test("Project dirty只由world authority transition触发，dirty时禁止导出", () => {
  const saved = projection("snapshot:base", 1);
  expect(hasWorldAuthorityTransition(saved, projection("snapshot:base", 1))).toBe(false);
  expect(hasWorldAuthorityTransition(saved, projection("snapshot:edit-1", 2))).toBe(true);
  expect(canExportBoundProject(true, false, false)).toBe(true);
  expect(canExportBoundProject(true, true, false)).toBe(false);
  expect(canExportBoundProject(true, false, true)).toBe(false);
  expect(canExportBoundProject(false, false, false)).toBe(false);
});
