import type {
  AnswerClassification,
  NodeStatus,
  Progress,
  StageKey,
  StageStatus,
} from "../types";

export type HintLevel = 0 | 1 | 2 | 3;
export type AnswerOrigin = "NONE" | "REQUESTED" | "AUTOMATIC";

export interface StageState {
  key: StageKey;
  status: StageStatus;
  mainQuestion: string | null;
  verificationQuestion: string | null;
  answerOrigin: AnswerOrigin;
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
  | { type: "START_ANSWER_VERIFICATION"; question: string }
  | { type: "REQUEST_HINT" }
  | { type: "ANSWER_EVALUATED"; outcome: EvaluationOutcome }
  | { type: "REVEAL_ANSWER" };
