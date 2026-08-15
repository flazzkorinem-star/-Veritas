import { describe, expect, it } from "vitest";

import {
  reportAgentInputSchema,
  reportAgentOutputSchema,
  validateReportEvidence,
} from "./contracts";

const input = reportAgentInputSchema.parse({
  materialTitle: "水循环.md",
  learningGoal: "理解水循环机制",
  completedNodes: [
    {
      nodeId: "node-1",
      title: "循环动力",
      canonicalUnderstanding: "太阳能驱动水蒸发。",
      commonMisconceptions: ["风是唯一动力"],
      score: 75,
      stages: {
        MEMORY: {
          status: "PASSED",
          mainQuestion: "水循环的动力是什么？",
          verificationQuestion: null,
          answerOrigin: "NONE",
          hintLevel: 0,
        },
        UNDERSTANDING: {
          status: "PASSED_WITH_HINT",
          mainQuestion: "太阳能为什么能推动水循环？",
          verificationQuestion: null,
          answerOrigin: "NONE",
          hintLevel: 1,
        },
        APPLICATION: {
          status: "PASSED_WITH_ANSWER",
          mainQuestion: "阴天时水循环是否会停止？",
          verificationQuestion: "没有直射阳光时，蒸发是否仍会发生？",
          answerOrigin: "AUTOMATIC",
          hintLevel: 0,
        },
        ANALYSIS: {
          status: "PASSED_WITH_ANSWER",
          mainQuestion: "温度下降会怎样影响循环？",
          verificationQuestion: null,
          answerOrigin: "REQUESTED",
          hintLevel: 0,
        },
      },
      messages: [
        { id: "assistant-1", role: "ASSISTANT", content: "水循环的动力是什么？" },
        { id: "message-1", role: "USER", content: "太阳能让水蒸发。" },
        { id: "message-2", role: "USER", content: "它为蒸发提供能量。" },
        { id: "message-3", role: "USER", content: "仍会，只是蒸发速度可能变化。" },
        { id: "message-4", role: "USER", content: "风是唯一动力。" },
      ],
      scaffoldEvents: [
        {
          id: "scaffold-1",
          stage: "UNDERSTANDING",
          type: "ANALOGY",
          reason: "帮助连接能量与蒸发",
        },
      ],
      sourceReferences: [{ label: "第 1 段", excerpt: "太阳驱动蒸发。" }],
    },
  ],
});

const output = reportAgentOutputSchema.parse({
  summary: "已经能解释水循环的主要动力，应用时仍需要独立判断。",
  nodeInsights: [
    {
      nodeId: "node-1",
      learningEvidence: [
        {
          stage: "MEMORY",
          category: "INDEPENDENT",
          statement: "能指出太阳能驱动蒸发。",
          userMessageId: "message-1",
        },
        {
          stage: "UNDERSTANDING",
          category: "AFTER_HINT",
          statement: "在提示后能解释太阳能提供能量。",
          userMessageId: "message-2",
        },
        {
          stage: "APPLICATION",
          category: "AFTER_TEACHING_VERIFIED",
          statement: "看过讲解后能在小题中判断阴天仍会蒸发。",
          userMessageId: "message-3",
        },
        {
          stage: "ANALYSIS",
          category: "EXPLAINED_NOT_VERIFIED",
          statement: "已经看过温度变化影响循环的答案，但没有再次验证。",
          userMessageId: null,
        },
      ],
      misconceptions: [
        { description: "仍把风当成唯一动力。", userMessageId: "message-4" },
      ],
      scaffoldNotes: [
        { scaffoldEventId: "scaffold-1", learningEffect: "建立了因果联系。" },
      ],
      nextSteps: ["用一个陌生天气情境重新判断水循环动力。"],
      sourceReferenceIndexes: [0],
    },
  ],
});

describe("Agent 3 报告契约", () => {
  it("只允许引用当前主题里真实存在的用户原话、支架和材料来源", () => {
    expect(validateReportEvidence(input, output)).toEqual(output);
  });

  it.each([
    [
      "伪造用户原话",
      {
        learningEvidence: output.nodeInsights[0]!.learningEvidence.map((item, index) =>
          index === 0 ? { ...item, userMessageId: "missing-message" } : item,
        ),
      },
    ],
    [
      "把助理消息当成用户证据",
      {
        learningEvidence: output.nodeInsights[0]!.learningEvidence.map((item, index) =>
          index === 0 ? { ...item, userMessageId: "assistant-1" } : item,
        ),
      },
    ],
    [
      "伪造支架",
      { scaffoldNotes: [{ scaffoldEventId: "missing", learningEffect: "无" }] },
    ],
    ["伪造来源", { sourceReferenceIndexes: [1] }],
  ])("拒绝%s", (_label, override) => {
    const invalid = structuredClone(output);
    Object.assign(invalid.nodeInsights[0]!, override);
    expect(() => validateReportEvidence(input, invalid)).toThrowError(
      "报告引用了不存在的本地证据。",
    );
  });

  it("拒绝重复或漏掉已完成主题", () => {
    const invalid = structuredClone(output);
    invalid.nodeInsights.push(structuredClone(invalid.nodeInsights[0]!));
    expect(() => validateReportEvidence(input, invalid)).toThrowError(
      "报告主题与已完成主题不匹配。",
    );
  });

  it("拒绝把主动查看答案写成已经学会", () => {
    const invalid = structuredClone(output);
    invalid.nodeInsights[0]!.learningEvidence[3] = {
      stage: "ANALYSIS",
      category: "AFTER_TEACHING_VERIFIED",
      statement: "已经学会。",
      userMessageId: "message-3",
    };

    expect(() => validateReportEvidence(input, invalid)).toThrowError(
      "报告结论与确定性诊断状态不匹配。",
    );
  });

  it("拒绝把内部阶段枚举写进用户可见报告", () => {
    const invalid = structuredClone(output);
    invalid.summary = "四个层级均为 PASSED_WITH_ANSWER。";

    expect(reportAgentOutputSchema.safeParse(invalid).success).toBe(false);
  });

  it("拒绝把实现术语写进用户可见报告", () => {
    const invalid = structuredClone(output);
    invalid.summary = "本报告采用确定性分数汇总学习情况。";

    expect(reportAgentOutputSchema.safeParse(invalid).success).toBe(false);
  });
});
