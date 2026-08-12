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
  readonly articulated?: ArticulatedState;
}

export interface ArticulatedJointState {
  readonly jointRef: "joint:arm-shoulder" | "joint:arm-elbow";
  readonly positionRadians: number;
  readonly velocityRadiansPerSecond: number;
}

export interface ArticulatedState {
  readonly joints: readonly ArticulatedJointState[];
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

export interface SphereRepresentation {
  readonly kind: "sphere";
  readonly radius: number;
  readonly color: string;
}

export interface SphereCollisionRepresentation {
  readonly kind: "sphere";
  readonly radius: number;
}

export interface NoCollisionRepresentation {
  readonly kind: "none";
}

export interface CompoundCollisionPart {
  readonly partKey: string;
  readonly localPose: Pose;
  readonly shape: BoxCollisionRepresentation;
}

export interface CompoundCollisionRepresentation {
  readonly kind: "compound";
  readonly parts: readonly CompoundCollisionPart[];
}

export type CollisionRepresentation =
  | BoxCollisionRepresentation
  | SphereCollisionRepresentation
  | CompoundCollisionRepresentation
  | NoCollisionRepresentation;

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
  | SphereRepresentation
  | ImportedRigidMeshRepresentation;

export interface VesselSemanticRepresentation {
  readonly kind: "vessel";
  readonly rimFrame: {
    readonly ref: "frame:vessel-rim-center";
    readonly localPose: Pose;
  };
  readonly innerEnvelope: {
    readonly radiusMeters: number;
    readonly innerFloorZMeters: number;
    readonly rimZMeters: number;
  };
}

export interface ArticulatedSemanticRepresentation {
  readonly kind: "articulated";
  readonly rootFrameRef: "frame:arm-base";
  readonly links: readonly {
    readonly linkRef: "link:arm-base" | "link:arm-upper" | "link:arm-forearm";
    readonly parentLinkRef: "link:arm-base" | "link:arm-upper" | null;
    readonly lengthMeters: number;
    readonly localPose: Pose;
    readonly visual: { readonly kind: "capsule" | "none"; readonly radiusMeters: number; readonly lengthMeters: number };
    readonly collision: { readonly kind: "none" };
  }[];
  readonly joints: readonly {
    readonly jointRef: "joint:arm-shoulder" | "joint:arm-elbow";
    readonly parentLinkRef: "link:arm-base" | "link:arm-upper";
    readonly childLinkRef: "link:arm-upper" | "link:arm-forearm";
    readonly axis: Vec3;
    readonly limitRadians: readonly [number, number];
    readonly type: "hinge";
    readonly positionUnit: "rad";
    readonly velocityUnit: "rad/s";
  }[];
  readonly actuators: readonly {
    readonly actuatorRef:
      | "actuator:arm-shoulder-position"
      | "actuator:arm-elbow-position";
    readonly jointRef: "joint:arm-shoulder" | "joint:arm-elbow";
    readonly controlRangeRadians: readonly [number, number];
    readonly controlMode: "position";
    readonly commandUnit: "rad";
  }[];
  readonly sensors: readonly {
    readonly sensorRef:
      | "sensor:arm-shoulder-position"
      | "sensor:arm-shoulder-velocity"
      | "sensor:arm-elbow-position"
      | "sensor:arm-elbow-velocity";
    readonly jointRef: "joint:arm-shoulder" | "joint:arm-elbow";
    readonly sourceRef: "joint:arm-shoulder" | "joint:arm-elbow";
    readonly measurement: "position" | "velocity";
    readonly unit: "rad" | "rad/s";
    readonly registryOrder: 0 | 1 | 2 | 3;
  }[];
  readonly frames: readonly {
    readonly frameRef: "frame:arm-base" | "frame:arm-elbow" | "frame:arm-tool";
    readonly parentLinkRef: "link:arm-base" | "link:arm-upper" | "link:arm-forearm";
    readonly localPose: Pose;
  }[];
}

export interface GoalFrameSemanticRepresentation {
  readonly kind: "goal-frame";
  readonly frameRef: "frame:reach-target";
  readonly localPose: Pose;
}

export type SemanticRepresentation =
  | VesselSemanticRepresentation
  | ArticulatedSemanticRepresentation
  | GoalFrameSemanticRepresentation
  | null;

export interface Entity {
  readonly ref: `entity:${string}`;
  readonly label: string;
  readonly frameRef: "frame:world";
  readonly unitSystemRef: "units:si";
  readonly state: EntityState;
  readonly representations: {
    readonly visual: VisualRepresentation;
    readonly collision: CollisionRepresentation;
    readonly observation: GaussianSplatObservationRepresentation | null;
    readonly semantic: SemanticRepresentation;
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
  readonly scenarioId:
    | "scenario:primitive-box-free-fall-v1"
    | "scenario:diagnostic-rigid-free-fall-v1"
    | "scenario:ball-vessel-free-fall-v1"
    | "scenario:two-joint-planar-reach-v1";
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

export interface FreeFallWorldProgram {
  readonly id: `program:sha256:${string}`;
  readonly kind: "free-fall";
  readonly targetRef: Entity["ref"];
  readonly durationSeconds: number;
  readonly sampleRateHz: number;
}

export interface ActuatorCommand {
  readonly actuatorRef:
    | "actuator:arm-shoulder-position"
    | "actuator:arm-elbow-position";
  readonly valueRadians: number;
}

export interface ActuatorSequenceWorldProgram {
  readonly id: `program:sha256:${string}`;
  readonly kind: "actuator-sequence";
  readonly targetRef: "entity:arm";
  readonly durationSeconds: number;
  readonly sampleRateHz: 30;
  readonly steps: readonly {
    readonly timeSeconds: number;
    readonly commands: readonly [ActuatorCommand, ActuatorCommand];
  }[];
}

export type WorldProgram = FreeFallWorldProgram | ActuatorSequenceWorldProgram;

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

export interface SemanticContactEvidence {
  readonly targetRef: Entity["ref"];
  readonly otherRef: Entity["ref"];
  readonly normalOnTargetWorld: Vec3;
  readonly penetrationMeters: number;
}

export interface EpisodeSample {
  readonly timeSeconds: number;
  readonly states: Readonly<Record<Entity["ref"], EntityState>>;
  readonly contactCount: number;
  readonly contacts?: readonly SemanticContactEvidence[];
  readonly articulated?: {
    readonly targetRef: "entity:arm";
    readonly joints: readonly ArticulatedJointState[];
    readonly sensors: readonly {
      readonly sensorRef: string;
      readonly value: number;
    }[];
    readonly activeCommands: readonly ActuatorCommand[];
  };
}

export interface EpisodeEvent {
  readonly type: "contact-began";
  readonly timeSeconds: number;
  readonly entities: readonly [Entity["ref"], Entity["ref"]];
}

export interface Episode {
  readonly id: `episode:${string}`;
  readonly baseSnapshotId: Snapshot["id"];
  readonly scenarioId: Snapshot["scenarioId"];
  readonly program: WorldProgram;
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
    readonly modelCausalDigest?: `sha256:${string}`;
  };
}

export interface LandingSuccessContract {
  readonly id: "success:stable-on-floor";
  readonly targetRef: Entity["ref"];
  readonly expectedCenterHeight: number;
  readonly heightTolerance: number;
  readonly maxLinearSpeed: number;
}

export interface StableInsideVesselSuccessContract {
  readonly id: "success:stable-inside-vessel";
  readonly targetRef: Entity["ref"];
  readonly containerRef: Entity["ref"];
  readonly rimFrameRef: "frame:vessel-rim-center";
  readonly settleWindowSeconds: number;
  readonly maxHorizontalOffsetMeters: number;
  readonly maxFloorDistanceErrorMeters: number;
  readonly maxLinearSpeedMetersPerSecond: number;
  readonly maxPenetrationMeters: number;
}

export interface EndEffectorReachSuccessContract {
  readonly id: "success:end-effector-reaches-frame";
  readonly targetRef: "entity:arm";
  readonly goalFrameRef: "frame:reach-target";
  readonly settleWindowSeconds: 0.5;
  readonly positionToleranceMeters: 0.02;
  readonly maxJointSpeedRadiansPerSecond: 0.02;
}

export type SuccessContract =
  | LandingSuccessContract
  | StableInsideVesselSuccessContract
  | EndEffectorReachSuccessContract;

export interface LandingEvaluationRecord {
  readonly id: `evaluation:${string}`;
  readonly evaluatorId: "evaluator:stable-landing-v1";
  readonly episodeId: Episode["id"];
  readonly contractId: LandingSuccessContract["id"];
  readonly passed: boolean;
  readonly metrics: {
    readonly terminalCenterHeight: number;
    readonly heightError: number;
    readonly terminalLinearSpeed: number;
  };
}

export interface StableInsideVesselEvaluationRecord {
  readonly id: `evaluation:${string}`;
  readonly evaluatorId: "evaluator:stable-inside-vessel-v1";
  readonly episodeId: Episode["id"];
  readonly contractId: StableInsideVesselSuccessContract["id"];
  readonly passed: boolean;
  readonly metrics: {
    readonly supportSamples: number;
    readonly requiredSupportSamples: number;
    readonly maxHorizontalOffsetMeters: number;
    readonly maxLinearSpeedMetersPerSecond: number;
    readonly maxFloorDistanceErrorMeters: number;
    readonly maxPenetrationMeters: number;
  };
}

export interface EndEffectorReachEvaluationRecord {
  readonly id: `evaluation:${string}`;
  readonly evaluatorId: "evaluator:end-effector-reach-v1";
  readonly episodeId: Episode["id"];
  readonly contractId: EndEffectorReachSuccessContract["id"];
  readonly passed: boolean;
  readonly metrics: {
    readonly supportSamples: number;
    readonly requiredSupportSamples: 16;
    readonly maxPositionErrorMeters: number;
    readonly maxJointSpeedRadiansPerSecond: number;
  };
}

export type EvaluationRecord =
  | LandingEvaluationRecord
  | StableInsideVesselEvaluationRecord
  | EndEffectorReachEvaluationRecord;

export interface AdoptPolicy {
  readonly id: `adopt-policy:${string}`;
  readonly evaluatorId: EvaluationRecord["evaluatorId"];
  readonly contractId: EvaluationRecord["contractId"];
  readonly requirePassed: true;
  readonly episodeCompletion: Episode["completion"];
  readonly terminalSource: "runtime-terminal";
}
