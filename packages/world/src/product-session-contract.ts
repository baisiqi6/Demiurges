import type {
  WorldEditResult,
  WorldReadResult,
  WorldRunResult,
  WorldWriteResult,
} from "./world-tools/world-tool-surface";

export const PRODUCT_WORLD_TOOL_NAMES = Object.freeze([
  "world_read",
  "world_write",
  "world_edit",
  "world_run",
] as const);

export type ProductWorldToolName = (typeof PRODUCT_WORLD_TOOL_NAMES)[number];
export type ProductWorldEvidence =
  | WorldReadResult
  | WorldWriteResult
  | WorldEditResult
  | WorldRunResult;

export interface ProductToolTrace {
  readonly sequence: number;
  readonly tool: ProductWorldToolName;
  readonly input: unknown;
  readonly status: "succeeded" | "failed";
  readonly result?: unknown;
  readonly error?: string;
}

export type ProductSessionEvent =
  | {
      readonly sequence: number;
      readonly sessionId: string;
      readonly turnId: string;
      readonly type: "turn.started";
    }
  | {
      readonly sequence: number;
      readonly sessionId: string;
      readonly turnId: string;
      readonly type: "tool.completed";
      readonly tool: ProductWorldToolName;
      readonly trace: ProductToolTrace;
      readonly evidence?: ProductWorldEvidence;
    }
  | {
      readonly sequence: number;
      readonly sessionId: string;
      readonly turnId: string;
      readonly type: "turn.completed";
      readonly responseText: string;
    }
  | {
      readonly sequence: number;
      readonly sessionId: string;
      readonly turnId: string;
      readonly type: "turn.failed";
      readonly error: string;
    };

export interface ProductSessionProjection {
  readonly sessionId: string;
  readonly world: WorldReadResult | null;
  readonly lastRun: WorldRunResult | null;
  readonly lastSequence: number;
  readonly running: boolean;
}
