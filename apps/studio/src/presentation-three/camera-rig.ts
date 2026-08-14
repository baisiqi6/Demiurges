import {
  interpolatePose,
  isFinitePose,
  moveZUp,
  rotateZUp,
  type CameraEnvelope,
  type CameraPose,
  type MovementIntent,
  type ObserverMode,
  type Vec3,
} from "./observer-camera";

export interface CameraRigAdapter {
  getPose(): CameraPose;
  setPose(pose: CameraPose): void;
  setControlsEnabled(enabled: boolean): void;
  setEnvelope(envelope: CameraEnvelope): void;
}

export interface CameraRigResetPoses {
  readonly overview: CameraPose;
  readonly inspect: CameraPose;
  readonly explore: CameraPose;
}

interface Transition {
  readonly from: CameraPose;
  readonly to: CameraPose;
  elapsed: number;
  readonly duration: number;
}

const MOVEMENT_CODES = new Set([
  "KeyW", "KeyS", "KeyA", "KeyD", "KeyQ", "KeyE",
  "ShiftLeft", "ShiftRight",
]);

export class CameraRig {
  private modeValue: ObserverMode = "overview";
  private resetPoses: CameraRigResetPoses;
  private readonly pressed = new Set<string>();
  private transition?: Transition;
  private lastForward: Vec3 = [0, 1, 0];
  private speedValue = 1.2;

  constructor(
    private readonly adapter: CameraRigAdapter,
    resetPoses: CameraRigResetPoses,
    private readonly reducedMotion: () => boolean,
  ) {
    this.resetPoses = resetPoses;
    this.adapter.setControlsEnabled(true);
  }

  get mode(): ObserverMode {
    return this.modeValue;
  }

  get flySpeed(): number {
    return this.speedValue;
  }

  get pressedCount(): number {
    return this.pressed.size;
  }

  setResetPoses(poses: CameraRigResetPoses): void {
    this.resetPoses = poses;
  }

  setEnvelope(envelope: CameraEnvelope): void {
    this.adapter.setEnvelope(envelope);
  }

  setMode(mode: ObserverMode, reset = true): boolean {
    this.clearInput();
    this.modeValue = mode;
    this.adapter.setControlsEnabled(mode !== "explore");
    if (reset) this.moveTo(this.resetPoses[mode]);
    return true;
  }

  reset(): boolean {
    this.clearInput();
    this.moveTo(this.resetPoses[this.modeValue]);
    return true;
  }

  focus(pose: CameraPose): boolean {
    if (this.modeValue !== "inspect" || !isFinitePose(pose)) return false;
    this.clearInput();
    this.moveTo(pose);
    return true;
  }

  keyDown(code: string): boolean {
    if (this.modeValue !== "explore" || !MOVEMENT_CODES.has(code)) return false;
    this.pressed.add(code);
    return true;
  }

  keyUp(code: string): boolean {
    return this.pressed.delete(code);
  }

  clearInput(): void {
    this.pressed.clear();
  }

  adjustSpeed(deltaY: number): number {
    if (!Number.isFinite(deltaY)) return this.speedValue;
    const multiplier = Math.exp(-deltaY * 0.0015);
    this.speedValue = Math.min(Math.max(this.speedValue * multiplier, 0.15), 12);
    return this.speedValue;
  }

  look(deltaX: number, deltaY: number): boolean {
    if (this.modeValue !== "explore") return false;
    this.finishTransition();
    const next = rotateZUp(this.adapter.getPose(), -deltaX * 0.003, -deltaY * 0.003);
    this.adapter.setPose(next);
    return true;
  }

  update(deltaSeconds: number): { readonly cameraChanged: boolean; readonly needsNextFrame: boolean } {
    if (this.transition) {
      this.transition.elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05);
      const progress = this.transition.duration === 0
        ? 1
        : Math.min(this.transition.elapsed / this.transition.duration, 1);
      this.adapter.setPose(interpolatePose(this.transition.from, this.transition.to, progress));
      if (progress >= 1) this.transition = undefined;
      return { cameraChanged: true, needsNextFrame: this.needsNextFrame };
    }
    if (this.modeValue !== "explore" || !this.hasMovementIntent()) {
      return { cameraChanged: false, needsNextFrame: false };
    }
    const movement = moveZUp(
      this.adapter.getPose(),
      this.intent(),
      this.speedValue,
      deltaSeconds,
      this.lastForward,
    );
    this.lastForward = movement.forward;
    if (movement.changed) this.adapter.setPose(movement.pose);
    return { cameraChanged: movement.changed, needsNextFrame: this.needsNextFrame };
  }

  get needsNextFrame(): boolean {
    return this.transition !== undefined || (this.modeValue === "explore" && this.hasMovementIntent());
  }

  dispose(): void {
    this.clearInput();
    this.transition = undefined;
  }

  private moveTo(pose: CameraPose): void {
    if (!isFinitePose(pose)) return;
    if (this.reducedMotion()) {
      this.transition = undefined;
      this.adapter.setPose(pose);
      return;
    }
    this.transition = {
      from: this.adapter.getPose(),
      to: pose,
      elapsed: 0,
      duration: 0.22,
    };
  }

  private finishTransition(): void {
    if (!this.transition) return;
    this.adapter.setPose(this.transition.to);
    this.transition = undefined;
  }

  private intent(): MovementIntent {
    return {
      forward: Number(this.pressed.has("KeyW")) - Number(this.pressed.has("KeyS")),
      right: Number(this.pressed.has("KeyD")) - Number(this.pressed.has("KeyA")),
      up: Number(this.pressed.has("KeyE")) - Number(this.pressed.has("KeyQ")),
      accelerated: this.pressed.has("ShiftLeft") || this.pressed.has("ShiftRight"),
    };
  }

  private hasMovementIntent(): boolean {
    const intent = this.intent();
    return intent.forward !== 0 || intent.right !== 0 || intent.up !== 0;
  }
}
