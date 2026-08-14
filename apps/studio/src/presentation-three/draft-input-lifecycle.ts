export interface TransformDragControl {
  readonly dragging: boolean;
  pointerUp(pointer: null): void;
}

export function releaseTransformDrag(control: TransformDragControl | undefined): boolean {
  if (!control?.dragging) return false;
  control.pointerUp(null);
  return true;
}

export function shouldReleaseDraftOnEscape(input: Readonly<{
  code: string;
  hasDraft: boolean;
  viewportOwnsKeyboard: boolean;
}>): boolean {
  return input.code === "Escape" && (input.hasDraft || input.viewportOwnsKeyboard);
}

export function shouldOwnDraftInput(input: Readonly<{
  hasDraft: boolean;
  observerMode: "overview" | "inspect" | "explore";
  hasSample: boolean;
  busy: boolean;
}>): boolean {
  return input.hasDraft && input.observerMode === "inspect" && !input.hasSample && !input.busy;
}
