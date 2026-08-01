import { describe, expect, it } from "vitest";

import {
  evaluationDecisionSchema,
  hintResponseSchema,
  stageAnswerSchema,
  stageQuestionSchema,
} from "./agent-contracts";

describe("Agent 2 结构化输出契约", () => {
  it("接收具体证据、缺口、误解、教学动作与家教文本", () => {
    expect(
      evaluationDecisionSchema.parse({
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
      evaluationDecisionSchema.parse({
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

  it("拒绝模型越权返回分数、层级或状态", () => {
    expect(() =>
      evaluationDecisionSchema.parse({
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
});
