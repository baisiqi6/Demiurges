export type {
  ArticulatedJointState,
  ArticulatedState,
  CollisionRepresentation,
  CompoundCollisionPart,
  CompoundCollisionRepresentation,
  Entity,
  Episode,
  EpisodeSample,
  EvaluationRecord,
  GaussianSplatObservationRepresentation,
  ImportedRigidMeshRepresentation,
  ObservationRepresentation,
  RegisteredAssetObservationRepresentation,
  RegisteredAssetVisualRepresentation,
  SemanticRepresentation,
  SemanticContactEvidence,
  SphereCollisionRepresentation,
  SphereRepresentation,
  RefRecord,
  RefUpdateResult,
  Snapshot,
  VisualRepresentation,
  VesselSemanticRepresentation,
} from "./kernel/types";
export { canonicalJsonBytes, sha256Hex } from "./kernel/canonical-json";
export {
  ACTUATOR_SEQUENCE_GOLDEN_DIGEST,
  FREE_FALL_GOLDEN_DIGEST,
} from "./world-tools/world-tool-contract";
export {
  ARM_REF,
  REACH_TARGET_POSITION,
  REACH_TARGET_REF,
  TWO_JOINT_REACH_FIXTURE_ID,
  TWO_JOINT_REACH_SCENARIO_ID,
  createTwoJointReachSnapshot,
} from "./artifacts/two-joint-reach-fixture";
export {
  BALL_REF,
  BALL_VESSEL_ASSET,
  BALL_VESSEL_FIXTURE,
  BALL_VESSEL_FIXTURE_ID,
  VESSEL_REF,
  createBallVesselSnapshot,
  requireBallVesselSnapshot,
  requireSnapshotRepresentationIntegrity,
  vesselLocalPointToWorld,
} from "./artifacts/ball-vessel-fixture";
export {
  DIAGNOSTIC_GAUSSIAN_SPLAT_ASSET,
  createDiagnosticGaussianSplatObservation,
  requireDiagnosticGaussianSplatObservation,
} from "./artifacts/diagnostic-gaussian-splat";
export {
  DIAGNOSTIC_RIGID_ASSET,
  DIAGNOSTIC_RIGID_FIXTURE_ID,
  PRIMITIVE_BOX_FIXTURE_ID,
  createFixtureSnapshot,
  requireDiagnosticRigidCollision,
  requireDiagnosticRigidVisual,
  requireRegisteredSnapshotIdentity,
  requireRigidFixtureId,
  type RigidFixtureId,
} from "./artifacts/diagnostic-rigid-fixture";
export {
  ENVIRONMENT_REF,
  FLOOR_PROXY,
  GENERATED_OBJECT_PROXY,
  GENERATED_OBJECT_REF,
  GENERATED_SESSION_CALIBRATION_ID,
  GENERATED_SESSION_WITNESS_ID,
  MARBLE_HUNYUAN_COMPOSITE_FIXTURE_ID,
  MARBLE_HUNYUAN_COMPOSITE_SCENARIO_ID,
  MARBLE_HUNYUAN_GENERATED_SESSION_SNAPSHOT_ID,
  createMarbleHunyuanCompositeSnapshot,
  requireMarbleHunyuanCompositeSnapshot,
} from "./artifacts/marble-hunyuan-composite-fixture";
export {
  createMarbleHunyuanGeneratedSessionSnapshot,
  deriveGeneratedObjectHalfExtents,
  type GeneratedObjectWorldBinding,
} from "./artifacts/marble-hunyuan-generated-session";
export {
  MARBLE_HUNYUAN_REGISTRY,
  MARBLE_HUNYUAN_MANIFEST_DIGEST,
  TRANSFORM_RECOMPUTE_EPSILON,
  requireMarbleHunyuanRegistryIntegrity,
  requireMarbleHunyuanRegistrySelfConsistency,
  type Bounds3,
  type CalibrationRecord,
  type FloorContactWitness,
  type HunyuanContainmentWitness,
  type ManifestAssetEntry,
  type MarbleBoundsWitness,
} from "./artifacts/marble-hunyuan-registry";
export {
  CUBE_REF,
  BALL_VESSEL_PROGRAM,
  CURRENT_WORLD_REF,
  FALLING_CUBE_PROGRAM,
  LANDING_SUCCESS_CONTRACT,
  MARBLE_HUNYUAN_COMPOSITE_PROGRAM,
  MUJOCO_PROFILE,
  createInitialSnapshot,
  deepFreeze,
  isDeepFrozen,
} from "./kernel/world";
export { RuntimeMvpHost } from "./host/runtime-mvp-host";
export {
  type RepositoryHistory,
} from "./repository/world-repository";
export {
  ARTICULATED_CANONICAL_MODEL_CAUSAL_DIGEST,
  ARTICULATED_MJCF,
  articulatedModelCausalDigest,
  articulatedForwardKinematics,
  canonicalTargetMatchesFk,
  requireArticulatedModelCausalDigest,
  runArticulatedReach,
} from "./runtime-mujoco/run-articulated-reach";
export {
  deriveLandingSuccessContract,
  evaluateEpisode,
} from "./evaluation/evaluate-episode";
export {
  END_EFFECTOR_REACH_CONTRACT,
  END_EFFECTOR_REACH_EVALUATOR_ID,
  evaluateArticulatedReach,
} from "./evaluation/evaluate-articulated-reach";
export {
  WorldToolSurface,
  type WorldEditResult,
  type WorldReadResult,
  type WorldRunResult,
  type WorldWriteResult,
} from "./world-tools/world-tool-surface";
export {
  WORLD_FIXTURE_IDS,
  WORLD_POSE_POSITION_ENVELOPE,
  WORLD_TOOL_CONTRACT,
  requireWorldEditInput,
  requireWorldRunInput,
  requireWorldProgramEvidence,
  requireWorldWriteInput,
  type WorldEditInput,
  type WorldFixtureId,
  type WorldRunInput,
  type WorldWriteInput,
} from "./world-tools/world-tool-contract";
export {
  admitMarbleHunyuanCompositeEdit,
  type CompositeAuthoringAdmission,
  type CompositeAuthoringRejectionCode,
  type CompositeWorldAuthority,
} from "./composite-authoring";
export {
  PRODUCT_WORLD_TOOL_NAMES,
  type ProductSessionEvent,
  type ProductSessionProjection,
  type ProductToolTrace,
  type ProductWorldEvidence,
  type ProductWorldToolName,
} from "./product-session-contract";
export {
  decodeProductSessionEvent,
  decodeProductSessionEventTrusted,
  decodeProductSessionAuthoringTransition,
  decodeProductSessionProjectHistoryTransition,
  decodeProductSessionProjection,
  decodeProductSessionProjectionTrusted,
  type ProductSessionAuthoringOperation,
} from "./product-session-codec";
export {
  BALL_VESSEL_TASK_LIMITS,
  admitBallVesselTaskEdit,
  requireBallVesselTaskWorld,
  requireBallVesselTaskRunInput,
} from "./authoring/ball-vessel-authoring";
export { deriveBallVesselPoseRepair, type BallVesselPoseRepairResult } from "./authoring/derive-ball-vessel-pose-repair";
export {
  decodeBallVesselTaskTransition,
  decodeBallVesselTaskPreview,
  type BallVesselTaskOperation,
  type BallVesselTaskPreview,
} from "./ball-vessel-task-contract";
