export type Vec3 = readonly [number, number, number];

export interface Quaternion {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

export interface Pose {
  readonly position: Vec3;
  readonly rotation: Quaternion;
}

export interface EntityState {
  readonly pose: Pose;
  readonly linearVelocity: Vec3;
  readonly angularVelocity: Vec3;
}

export interface BoxRepresentation {
  readonly kind: "box";
  readonly halfExtents: Vec3;
  readonly color: string;
}

export interface BoxCollisionRepresentation {
  readonly kind: "box";
  readonly halfExtents: Vec3;
}

export interface ImportedRigidMeshRepresentation {
  readonly kind: "imported-rigid-mesh";
  readonly assetId: `asset:${string}`;
  readonly contentDigest: `sha256:${string}`;
  readonly sourceFrameRef: "frame:gltf-y-up";
  readonly sourceUnitMeters: number;
  readonly localTransform: {
    readonly position: Vec3;
    readonly rotation: Quaternion;
    readonly scale: Vec3;
  };
}

export interface GaussianSplatObservationRepresentation {
  readonly kind: "gaussian-splat";
  readonly role: "observation";
  readonly assetId: `asset:${string}`;
  readonly contentDigest: `sha256:${string}`;
  readonly sourceFrameRef: "frame:gltf-y-up";
  readonly sourceUnitMeters: number;
  readonly localTransform: {
    readonly position: Vec3;
    readonly rotation: Quaternion;
    readonly scale: Vec3;
  };
}

export type VisualRepresentation =
  | BoxRepresentation
  | ImportedRigidMeshRepresentation;

export interface Entity {
  readonly ref: `entity:${string}`;
  readonly label: string;
  readonly frameRef: "frame:world";
  readonly unitSystemRef: "units:si";
  readonly state: EntityState;
  readonly representations: {
    readonly visual: VisualRepresentation;
    readonly collision: BoxCollisionRepresentation;
    readonly observation: GaussianSplatObservationRepresentation | null;
  };
  readonly physics: {
    readonly bodyType: "static" | "dynamic";
    readonly massKg: number;
    readonly friction: number;
  };
}

export interface Snapshot {
  readonly schemaVersion: 1;
  readonly id: `snapshot:${string}`;
  readonly parentId: Snapshot["id"] | null;
  readonly source: "write" | "edit" | "runtime-terminal";
  readonly entities: readonly Entity[];
}

export interface RefRecord {
  readonly name: `world:${string}`;
  readonly snapshotId: Snapshot["id"];
  readonly version: number;
}

export interface RefUpdateResult {
  readonly status: "updated" | "stale_ref";
  readonly operation: "advance" | "adopt";
  readonly ref: RefRecord;
  readonly snapshot: Snapshot;
}

export interface WorldProgram {
  readonly id: `program:${string}`;
  readonly kind: "free-fall";
  readonly targetRef: Entity["ref"];
  readonly durationSeconds: number;
  readonly sampleRateHz: number;
}

export interface RuntimeProfile {
  readonly id: `runtime:${string}`;
  readonly provider: string;
  readonly version: string;
  readonly equivalence: "numeric";
  readonly timestepSeconds: number;
  readonly gravity: Vec3;
}

export interface ExplicitInputs {
  readonly runId: `run:${string}`;
}

export interface EpisodeSample {
  readonly timeSeconds: number;
  readonly states: Readonly<Record<Entity["ref"], EntityState>>;
  readonly contactCount: number;
}

export interface EpisodeEvent {
  readonly type: "contact-began";
  readonly timeSeconds: number;
  readonly entities: readonly [Entity["ref"], Entity["ref"]];
}

export interface Episode {
  readonly id: `episode:${string}`;
  readonly baseSnapshotId: Snapshot["id"];
  readonly programId: WorldProgram["id"];
  readonly runtimeProfileId: RuntimeProfile["id"];
  readonly explicitInputs: ExplicitInputs;
  readonly completion: "completed";
  readonly samples: readonly EpisodeSample[];
  readonly events: readonly EpisodeEvent[];
  readonly terminalSnapshot: Snapshot;
  readonly runtimeEvidence: {
    readonly provider: string;
    readonly version: string;
    readonly modelFormat: "MJCF";
  };
}

export interface LandingSuccessContract {
  readonly id: "success:stable-on-floor";
  readonly targetRef: Entity["ref"];
  readonly expectedCenterHeight: number;
  readonly heightTolerance: number;
  readonly maxLinearSpeed: number;
}

export interface EvaluationRecord {
  readonly id: `evaluation:${string}`;
  readonly evaluatorId: `evaluator:${string}`;
  readonly episodeId: Episode["id"];
  readonly contractId: LandingSuccessContract["id"];
  readonly passed: boolean;
  readonly metrics: {
    readonly terminalCenterHeight: number;
    readonly heightError: number;
    readonly terminalLinearSpeed: number;
  };
}

export interface AdoptPolicy {
  readonly id: `adopt-policy:${string}`;
  readonly evaluatorId: EvaluationRecord["evaluatorId"];
  readonly contractId: EvaluationRecord["contractId"];
  readonly requirePassed: true;
  readonly episodeCompletion: Episode["completion"];
  readonly terminalSource: "runtime-terminal";
}
