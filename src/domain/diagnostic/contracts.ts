import type {
  AnswerClassification,
  NodeStatus,
  Progress,
  StageKey,
  StageStatus,
} from "../types";

export type HintLevel = 0 | 1 | 2 | 3;

export interface StageState {
  key: StageKey;
  status: StageStatus;
  mainQuestion: string | null;
  hintLevel: HintLevel;
  hasRequestedHint: boolean;
  stalledCount: number;
}

export interface NodeSession {
  nodeId: string;
  status: NodeStatus;
  currentStage: StageKey;
  stages: Record<StageKey, StageState>;
}

export interface EvaluationOutcome {
  classification: AnswerClassification;
  isCorrect: boolean;
  progress: Progress;
}

export type DiagnosticEvent =
  | { type: "START_STAGE"; question: string }
  | { type: "REQUEST_HINT" }
  | { type: "ANSWER_EVALUATED"; outcome: EvaluationOutcome }
  | { type: "REVEAL_ANSWER" };
