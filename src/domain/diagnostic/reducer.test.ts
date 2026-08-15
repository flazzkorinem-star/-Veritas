import { describe, expect, it } from "vitest";

import { STAGE_ORDER } from "../types";
import { createNodeSession, diagnosticReducer, InvalidTransitionError } from "./reducer";
import { getNodeScore } from "./selectors";

const correct = {
  classification: "CORRECT",
  isCorrect: true,
  progress: "ADVANCING",
} as const;

function startQuestion(state = createNodeSession("node-1")) {
  return diagnosticReducer(state, {
    type: "START_STAGE",
    question: "请说出这个概念的基本含义。",
  });
}

describe("diagnosticReducer", () => {
  it("以锁定的记忆层和 0 分创建主题会话", () => {
    const state = createNodeSession("node-1");

    expect(state.status).toBe("NOT_STARTED");
    expect(state.currentStage).toBe("MEMORY");
    expect(getNodeScore(state)).toBe(0);
    expect(state.stages.MEMORY.status).toBe("LOCKED");
  });

  it("只为当前层建立一个主问题", () => {
    const state = startQuestion();

    expect(state.status).toBe("IN_PROGRESS");
    expect(state.stages.MEMORY.status).toBe("ACTIVE");
    expect(state.stages.MEMORY.mainQuestion).toBe("请说出这个概念的基本含义。");
    expect(() =>
      diagnosticReducer(state, { type: "START_STAGE", question: "另一个问题" }),
    ).toThrow(InvalidTransitionError);
  });

  it("提示只因点击升级，最多三级", () => {
    let state = startQuestion();

    for (let count = 0; count < 4; count += 1) {
      state = diagnosticReducer(state, { type: "REQUEST_HINT" });
    }

    expect(state.stages.MEMORY.hasRequestedHint).toBe(true);
    expect(state.stages.MEMORY.hintLevel).toBe(3);
  });

  it("直接答对得 25 分并严格进入下一层", () => {
    const state = diagnosticReducer(startQuestion(), {
      type: "ANSWER_EVALUATED",
      outcome: correct,
    });

    expect(state.stages.MEMORY.status).toBe("PASSED");
    expect(getNodeScore(state)).toBe(25);
    expect(state.currentStage).toBe("UNDERSTANDING");
    expect(state.stages.UNDERSTANDING.status).toBe("LOCKED");
  });

  it("使用提示后答对仍得 25 分但保留提示状态", () => {
    const hinted = diagnosticReducer(startQuestion(), { type: "REQUEST_HINT" });
    const state = diagnosticReducer(hinted, {
      type: "ANSWER_EVALUATED",
      outcome: correct,
    });

    expect(state.stages.MEMORY.status).toBe("PASSED_WITH_HINT");
    expect(getNodeScore(state)).toBe(25);
  });

  it("查看答案以 0 分完成当前层", () => {
    const state = diagnosticReducer(startQuestion(), { type: "REVEAL_ANSWER" });

    expect(state.stages.MEMORY).toMatchObject({
      status: "PASSED_WITH_ANSWER",
      answerOrigin: "REQUESTED",
    });
    expect(getNodeScore(state)).toBe(0);
    expect(state.currentStage).toBe("UNDERSTANDING");
  });

  it("推进会清零停滞计数，偏题不计入停滞", () => {
    let state = startQuestion();
    state = diagnosticReducer(state, {
      type: "ANSWER_EVALUATED",
      outcome: { classification: "PARTIAL", isCorrect: false, progress: "STALLED" },
    });
    state = diagnosticReducer(state, {
      type: "ANSWER_EVALUATED",
      outcome: { classification: "OFF_TOPIC", isCorrect: false, progress: "STALLED" },
    });
    expect(state.stages.MEMORY.stalledCount).toBe(1);

    state = diagnosticReducer(state, {
      type: "ANSWER_EVALUATED",
      outcome: { classification: "PARTIAL", isCorrect: false, progress: "ADVANCING" },
    });

    expect(state.stages.MEMORY.stalledCount).toBe(0);
    expect(state.stages.MEMORY.mainQuestion).toBe("请说出这个概念的基本含义。");

    state = diagnosticReducer(state, {
      type: "ANSWER_EVALUATED",
      outcome: { classification: "NO_ANSWER", isCorrect: false, progress: "STALLED" },
    });
    state = diagnosticReducer(state, {
      type: "ANSWER_EVALUATED",
      outcome: { classification: "NO_ANSWER", isCorrect: false, progress: "STALLED" },
    });

    expect(state.stages.MEMORY).toMatchObject({ status: "ACTIVE", stalledCount: 2 });
  });

  it("连续三轮停滞后留在当前层，直到建立同目标验证题", () => {
    let state = startQuestion();
    const stalled = {
      type: "ANSWER_EVALUATED",
      outcome: { classification: "NO_ANSWER", isCorrect: false, progress: "STALLED" },
    } as const;

    state = diagnosticReducer(state, stalled);
    state = diagnosticReducer(state, stalled);
    state = diagnosticReducer(state, stalled);

    expect(state.stages.MEMORY).toMatchObject({
      status: "ACTIVE",
      stalledCount: 3,
      answerOrigin: "NONE",
      verificationQuestion: null,
    });
    expect(getNodeScore(state)).toBe(0);
    expect(state.currentStage).toBe("MEMORY");

    state = diagnosticReducer(state, {
      type: "START_ANSWER_VERIFICATION",
      question: "太阳能在水循环中提供了什么？",
    });

    expect(state.stages.MEMORY).toMatchObject({
      status: "ACTIVE",
      stalledCount: 0,
      mainQuestion: "请说出这个概念的基本含义。",
      verificationQuestion: "太阳能在水循环中提供了什么？",
      answerOrigin: "AUTOMATIC",
    });
  });

  it("自动答案后只有答对小验证题才以 0 分进入下一层", () => {
    let state = startQuestion();
    const stalled = {
      type: "ANSWER_EVALUATED",
      outcome: { classification: "NO_ANSWER", isCorrect: false, progress: "STALLED" },
    } as const;

    state = diagnosticReducer(state, stalled);
    state = diagnosticReducer(state, stalled);
    state = diagnosticReducer(state, stalled);
    state = diagnosticReducer(state, {
      type: "START_ANSWER_VERIFICATION",
      question: "太阳能在水循环中提供了什么？",
    });
    state = diagnosticReducer(state, {
      type: "ANSWER_EVALUATED",
      outcome: correct,
    });

    expect(state.stages.MEMORY).toMatchObject({
      status: "PASSED_WITH_ANSWER",
      answerOrigin: "AUTOMATIC",
      verificationQuestion: "太阳能在水循环中提供了什么？",
    });
    expect(getNodeScore(state)).toBe(0);
    expect(state.currentStage).toBe("UNDERSTANDING");
  });

  it("四层依次通过后完成主题并得到 100 分", () => {
    let state = createNodeSession("node-1");

    for (const stage of STAGE_ORDER) {
      expect(state.currentStage).toBe(stage);
      state = diagnosticReducer(state, {
        type: "START_STAGE",
        question: `${stage} 的问题`,
      });
      state = diagnosticReducer(state, {
        type: "ANSWER_EVALUATED",
        outcome: correct,
      });
    }

    expect(state.status).toBe("COMPLETED");
    expect(state.currentStage).toBe("ANALYSIS");
    expect(getNodeScore(state)).toBe(100);
  });

  it("四层全部查看答案后仍完成主题但保持 0 分", () => {
    let state = createNodeSession("node-1");

    for (const stage of STAGE_ORDER) {
      state = diagnosticReducer(state, {
        type: "START_STAGE",
        question: `${stage} 的问题`,
      });
      state = diagnosticReducer(state, { type: "REVEAL_ANSWER" });
    }

    expect(state.status).toBe("COMPLETED");
    expect(getNodeScore(state)).toBe(0);
  });

  it("拒绝未激活和空问题事件", () => {
    const initial = createNodeSession("node-1");
    expect(() => diagnosticReducer(initial, { type: "REQUEST_HINT" })).toThrow(
      InvalidTransitionError,
    );
    expect(() => diagnosticReducer(initial, { type: "REVEAL_ANSWER" })).toThrow(
      InvalidTransitionError,
    );
    expect(() =>
      diagnosticReducer(initial, {
        type: "ANSWER_EVALUATED",
        outcome: { classification: "PARTIAL", isCorrect: false, progress: "STALLED" },
      }),
    ).toThrow(InvalidTransitionError);
    expect(() =>
      diagnosticReducer(initial, { type: "START_STAGE", question: "   " }),
    ).toThrow(InvalidTransitionError);
  });

  it.each([
    { classification: "CORRECT", isCorrect: false, progress: "ADVANCING" },
    { classification: "CORRECT", isCorrect: true, progress: "STALLED" },
    { classification: "PARTIAL", isCorrect: true, progress: "ADVANCING" },
  ] as const)("拒绝矛盾评价 %#", (outcome) => {
    expect(() =>
      diagnosticReducer(startQuestion(), {
        type: "ANSWER_EVALUATED",
        outcome,
      }),
    ).toThrow(InvalidTransitionError);
  });

  it("拒绝完成后的任何事件", () => {
    const initial = createNodeSession("node-1");
    let completed = initial;
    for (const stage of STAGE_ORDER) {
      completed = diagnosticReducer(completed, {
        type: "START_STAGE",
        question: `${stage} 的问题`,
      });
      completed = diagnosticReducer(completed, {
        type: "ANSWER_EVALUATED",
        outcome: correct,
      });
    }
    const events = [
      { type: "START_STAGE", question: "重做" },
      { type: "REQUEST_HINT" },
      { type: "ANSWER_EVALUATED", outcome: correct },
      { type: "REVEAL_ANSWER" },
    ] as const;

    for (const event of events) {
      expect(() => diagnosticReducer(completed, event)).toThrow(InvalidTransitionError);
    }
  });
});
