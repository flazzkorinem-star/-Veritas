import { STAGE_ORDER, type StageKey, type StageStatus } from "../types";
import type {
  DiagnosticEvent,
  EvaluationOutcome,
  HintLevel,
  NodeSession,
  StageState,
} from "./contracts";

export class InvalidTransitionError extends Error {
  override name = "InvalidTransitionError";
}

function createStage(key: StageKey): StageState {
  return {
    key,
    status: "LOCKED",
    mainQuestion: null,
    verificationQuestion: null,
    answerOrigin: "NONE",
    hintLevel: 0,
    hasRequestedHint: false,
    stalledCount: 0,
  };
}

export function createNodeSession(nodeId: string): NodeSession {
  return {
    nodeId,
    status: "NOT_STARTED",
    currentStage: "MEMORY",
    stages: Object.fromEntries(
      STAGE_ORDER.map((key) => [key, createStage(key)]),
    ) as Record<StageKey, StageState>,
  };
}

function currentActiveStage(state: NodeSession): StageState {
  const stage = state.stages[state.currentStage];
  if (state.status === "COMPLETED" || stage.status !== "ACTIVE") {
    throw new InvalidTransitionError("当前主题没有可操作的问题。");
  }
  return stage;
}

function replaceStage(state: NodeSession, stage: StageState): NodeSession {
  return { ...state, stages: { ...state.stages, [stage.key]: stage } };
}

function completeCurrentStage(
  state: NodeSession,
  status: Extract<StageStatus, "PASSED" | "PASSED_WITH_HINT" | "PASSED_WITH_ANSWER">,
): NodeSession {
  const stage = currentActiveStage(state);
  const stages = {
    ...state.stages,
    [stage.key]: { ...stage, status, stalledCount: 0 },
  };
  const index = STAGE_ORDER.indexOf(stage.key);

  if (index === STAGE_ORDER.length - 1) {
    return { ...state, status: "COMPLETED", stages };
  }

  return {
    ...state,
    currentStage: STAGE_ORDER[index + 1],
    stages,
  };
}

function validateOutcome(outcome: EvaluationOutcome) {
  const classificationIsCorrect = outcome.classification === "CORRECT";
  if (
    outcome.isCorrect !== classificationIsCorrect ||
    (outcome.isCorrect && outcome.progress !== "ADVANCING")
  ) {
    throw new InvalidTransitionError("回答评价包含相互矛盾的状态。");
  }
}

export function diagnosticReducer(
  state: NodeSession,
  event: DiagnosticEvent,
): NodeSession {
  if (state.status === "COMPLETED") {
    throw new InvalidTransitionError("已完成的主题不能再次修改。");
  }

  switch (event.type) {
    case "START_STAGE": {
      const question = event.question.trim();
      const stage = state.stages[state.currentStage];
      if (!question || stage.status !== "LOCKED") {
        throw new InvalidTransitionError("当前层不能建立新问题。");
      }
      return replaceStage(
        { ...state, status: "IN_PROGRESS" },
        { ...stage, status: "ACTIVE", mainQuestion: question },
      );
    }
    case "START_ANSWER_VERIFICATION": {
      const question = event.question.trim();
      const stage = currentActiveStage(state);
      if (!question || stage.stalledCount < 3) {
        throw new InvalidTransitionError("当前层不能建立答案验证题。");
      }
      return replaceStage(state, {
        ...stage,
        verificationQuestion: question,
        answerOrigin: "AUTOMATIC",
        stalledCount: 0,
      });
    }
    case "REQUEST_HINT": {
      const stage = currentActiveStage(state);
      const hintLevel = Math.min(3, stage.hintLevel + 1) as HintLevel;
      return replaceStage(state, {
        ...stage,
        hasRequestedHint: true,
        hintLevel,
      });
    }
    case "REVEAL_ANSWER": {
      const stage = currentActiveStage(state);
      return completeCurrentStage(
        replaceStage(state, { ...stage, answerOrigin: "REQUESTED" }),
        "PASSED_WITH_ANSWER",
      );
    }
    case "ANSWER_EVALUATED": {
      validateOutcome(event.outcome);
      const stage = currentActiveStage(state);
      if (event.outcome.isCorrect) {
        return completeCurrentStage(
          state,
          stage.answerOrigin !== "NONE"
            ? "PASSED_WITH_ANSWER"
            : stage.hasRequestedHint
              ? "PASSED_WITH_HINT"
              : "PASSED",
        );
      }
      if (event.outcome.classification === "OFF_TOPIC") return state;

      const stalledCount =
        event.outcome.progress === "ADVANCING" ? 0 : stage.stalledCount + 1;
      return replaceStage(state, { ...stage, stalledCount: Math.min(3, stalledCount) });
    }
  }
}
