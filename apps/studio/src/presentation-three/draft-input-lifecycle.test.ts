import { describe, expect, test } from "bun:test";

import {
  shouldOwnDraftInput,
  releaseTransformDrag,
  shouldReleaseDraftOnEscape,
} from "./draft-input-lifecycle";

describe("PoseDraft input lifecycle", () => {
  test("abnormal capture loss terminates TransformControls drag ownership", () => {
    const events: (null | string)[] = [];
    const control = {
      dragging: true,
      pointerUp(pointer: null) {
        events.push(pointer);
        this.dragging = false;
      },
    };

    expect(releaseTransformDrag(control)).toBe(true);
    expect(events).toEqual([null]);
    expect(control.dragging).toBe(false);
    expect(releaseTransformDrag(control)).toBe(false);
  });

  test("Escape releases an active draft even while a toolbar button owns focus", () => {
    expect(shouldReleaseDraftOnEscape({
      code: "Escape",
      hasDraft: true,
      viewportOwnsKeyboard: false,
    })).toBe(true);
    expect(shouldReleaseDraftOnEscape({
      code: "Escape",
      hasDraft: false,
      viewportOwnsKeyboard: false,
    })).toBe(false);
    expect(shouldReleaseDraftOnEscape({
      code: "KeyW",
      hasDraft: true,
      viewportOwnsKeyboard: true,
    })).toBe(false);
  });

  test("pending authoring revokes gizmo ownership until the command settles", () => {
    const base = {
      hasDraft: true,
      observerMode: "inspect" as const,
      hasSample: false,
    };

    expect(shouldOwnDraftInput({ ...base, busy: false })).toBe(true);
    expect(shouldOwnDraftInput({ ...base, busy: true })).toBe(false);
    expect(shouldOwnDraftInput({ ...base, busy: false, observerMode: "overview" })).toBe(false);
    expect(shouldOwnDraftInput({ ...base, busy: false, hasSample: true })).toBe(false);
  });
});
