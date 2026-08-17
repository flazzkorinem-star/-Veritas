import { describe, expect, it } from "vitest";

import {
  hintResponseSchema,
  stageAnswerSchema,
  stageQuestionSchema,
  userTurnDecisionSchema,
} from "./agent-contracts";

describe("Agent 2 结构化输出契约", () => {
  it("接收具体证据、缺口、误解、教学动作与家教文本", () => {
    expect(
      userTurnDecisionSchema.parse({
        responseMode: "EVALUATE_DIAGNOSTIC",
        learningGoalUpdate: null,
        classification: "PARTIAL",
        isCorrect: false,
        progress: "ADVANCING",
        correctEvidence: ["用户说出了太阳能驱动蒸发。"],
        missingPoints: ["尚未说明重力如何推动水返回低处。"],
        misconceptions: [],
        teachingMove: "ASK_MISSING_POINT",
        scaffold: null,
        assistantMessage: "你已经抓住蒸发的动力了。再想一步：水为什么会从高处回到低处？",
      }),
    ).toMatchObject({ classification: "PARTIAL", progress: "ADVANCING" });
  });

  it.each([
    {
      classification: "CORRECT",
      isCorrect: false,
      progress: "ADVANCING",
    },
    {
      classification: "CORRECT",
      isCorrect: true,
      progress: "STALLED",
    },
  ])("拒绝互相矛盾的正确性与进展判断", (partial) => {
    expect(() =>
      userTurnDecisionSchema.parse({
        responseMode: "EVALUATE_DIAGNOSTIC",
        learningGoalUpdate: null,
        ...partial,
        correctEvidence: [],
        missingPoints: [],
        misconceptions: [],
        teachingMove: "AFFIRM_AND_ADVANCE",
        scaffold: null,
        assistantMessage: "具体反馈。",
      }),
    ).toThrow();
  });

  it("无法作答必须是未通过且停滞的诊断事件", () => {
    const noAnswer = {
      classification: "NO_ANSWER",
      isCorrect: false,
      correctEvidence: [],
      missingPoints: ["没有提供可评价的回答内容"],
      misconceptions: [],
      teachingMove: "PROVIDE_SCAFFOLD",
      scaffold: { type: "EXAMPLE", reason: "帮助用户开始思考" },
      assistantMessage: "先从一个具体例子开始想。",
    } as const;

    expect(
      userTurnDecisionSchema.safeParse({
        responseMode: "EVALUATE_DIAGNOSTIC",
        learningGoalUpdate: null,
        ...noAnswer,
        progress: "STALLED",
      }).success,
    ).toBe(true);
    expect(
      userTurnDecisionSchema.safeParse({
        responseMode: "EVALUATE_DIAGNOSTIC",
        learningGoalUpdate: null,
        ...noAnswer,
        progress: "ADVANCING",
      }).success,
    ).toBe(false);
  });

  it.each([
    { correctEvidence: [], missingPoints: [] },
    { correctEvidence: ["回答了一个相关点"], missingPoints: ["仍缺少主问题要求的因果"] },
  ])("拒绝没有通过证据或仍留有缺口的 CORRECT", (evidence) => {
    expect(() =>
      userTurnDecisionSchema.parse({
        responseMode: "EVALUATE_DIAGNOSTIC",
        learningGoalUpdate: null,
        classification: "CORRECT",
        isCorrect: true,
        progress: "ADVANCING",
        ...evidence,
        misconceptions: [],
        teachingMove: "AFFIRM_AND_ADVANCE",
        scaffold: null,
        assistantMessage: "回答正确。",
      }),
    ).toThrow();
  });

  it("拒绝模型越权返回分数、层级或状态", () => {
    expect(() =>
      userTurnDecisionSchema.parse({
        responseMode: "EVALUATE_DIAGNOSTIC",
        learningGoalUpdate: null,
        classification: "CORRECT",
        isCorrect: true,
        progress: "ADVANCING",
        correctEvidence: ["证据"],
        missingPoints: [],
        misconceptions: [],
        teachingMove: "AFFIRM_AND_ADVANCE",
        scaffold: null,
        assistantMessage: "回答准确。",
        score: 100,
        nextStage: "ANALYSIS",
      }),
    ).toThrow();
  });

  it("问题、三级提示和完整答案各自使用最小独立契约", () => {
    expect(stageQuestionSchema.parse({ question: "太阳在水循环中提供了什么？" })).toEqual(
      {
        question: "太阳在水循环中提供了什么？",
      },
    );
    expect(
      hintResponseSchema.parse({
        hintLevel: 2,
        assistantMessage: "想想晒湿衣服的情景。",
      }),
    ).toEqual({ hintLevel: 2, assistantMessage: "想想晒湿衣服的情景。" });
    expect(
      stageAnswerSchema.parse({
        assistantMessage: "太阳提供能量，使液态水蒸发为水蒸气。",
      }),
    ).toMatchObject({ assistantMessage: expect.stringContaining("太阳") });
  });

  it("普通对话只返回自然回复，不伪造回答分类", () => {
    expect(
      userTurnDecisionSchema.parse({
        responseMode: "CONVERSATION",
        learningGoalUpdate: "理解 ETF 与 ETF 联接基金的区别",
        assistantMessage:
          "这些代码不用背。这里真正值得弄清的是 ETF 在场内交易，而 ETF 联接基金主要通过场外渠道申购。",
      }),
    ).toMatchObject({ responseMode: "CONVERSATION" });
  });

  it("开始诊断时把自然过渡与唯一主问题分开", () => {
    expect(
      userTurnDecisionSchema.parse({
        responseMode: "START_DIAGNOSTIC",
        learningGoalUpdate: null,
        assistantMessage: "可以，先测最基础但确实有用的区别。",
        question: "ETF 和 ETF 联接基金在交易渠道上有什么不同？",
      }),
    ).toMatchObject({ responseMode: "START_DIAGNOSTIC" });
  });

  it("只有继续诊断时才接收评分所需的语义判断", () => {
    expect(
      userTurnDecisionSchema.parse({
        responseMode: "EVALUATE_DIAGNOSTIC",
        learningGoalUpdate: null,
        classification: "CORRECT",
        isCorrect: true,
        progress: "ADVANCING",
        correctEvidence: ["说明了场内与场外渠道的区别"],
        missingPoints: [],
        misconceptions: [],
        teachingMove: "AFFIRM_AND_ADVANCE",
        scaffold: null,
        assistantMessage: "对，交易渠道的区别你已经说清楚了。",
      }),
    ).toMatchObject({ responseMode: "EVALUATE_DIAGNOSTIC" });
  });

  it("正确评价不能用独立 question 字段夹带下一层问题", () => {
    expect(
      userTurnDecisionSchema.safeParse({
        responseMode: "EVALUATE_DIAGNOSTIC",
        learningGoalUpdate: null,
        classification: "CORRECT",
        isCorrect: true,
        progress: "ADVANCING",
        correctEvidence: ["说明了场内交易和场外申赎的区别"],
        missingPoints: [],
        misconceptions: [],
        teachingMove: "AFFIRM_AND_ADVANCE",
        scaffold: null,
        assistantMessage: "对，这个区别已经说清楚了。",
        question: "下一层请解释定价差异。",
      }).success,
    ).toBe(false);
  });

  it.each(["REQUEST_HINT", "REVEAL_ANSWER"] as const)(
    "接收由模型语义识别的 %s 操作",
    (responseMode) => {
      expect(userTurnDecisionSchema.parse({ responseMode })).toEqual({ responseMode });
    },
  );

  it.each(["REQUEST_HINT", "REVEAL_ANSWER"] as const)(
    "%s 可携带模型惯常返回的对话字段，由编排层忽略",
    (responseMode) => {
      expect(
        userTurnDecisionSchema.parse({
          responseMode,
          learningGoalUpdate: null,
          assistantMessage: "我按你的选择继续。",
        }),
      ).toMatchObject({ responseMode });
    },
  );

  it("拒绝普通对话夹带分数或层级状态", () => {
    expect(
      userTurnDecisionSchema.safeParse({
        responseMode: "CONVERSATION",
        learningGoalUpdate: null,
        assistantMessage: "先解释这个概念。",
        score: 100,
      }).success,
    ).toBe(false);
  });
});
