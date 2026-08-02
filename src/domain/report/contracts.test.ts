import { describe, expect, it } from "vitest";

import {
  reportAgentInputSchema,
  reportAgentOutputSchema,
  validateReportEvidence,
} from "./contracts";

const input = reportAgentInputSchema.parse({
  materialTitle: "水循环.md",
  completedNodes: [
    {
      nodeId: "node-1",
      title: "循环动力",
      canonicalUnderstanding: "太阳能驱动水蒸发。",
      commonMisconceptions: ["风是唯一动力"],
      score: 75,
      stages: {
        MEMORY: "PASSED",
        UNDERSTANDING: "PASSED_WITH_HINT",
        APPLICATION: "PASSED_WITH_ANSWER",
        ANALYSIS: "PASSED",
      },
      userMessages: [{ id: "message-1", content: "太阳能让水蒸发。" }],
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
      understood: [{ statement: "能指出太阳能驱动蒸发。", userMessageId: "message-1" }],
      blindSpots: ["应用到新情境时依赖了完整答案。"],
      userEvidenceMessageIds: ["message-1"],
      scaffoldNotes: [
        { scaffoldEventId: "scaffold-1", learningEffect: "建立了因果联系。" },
      ],
      learnedOrCorrected: [
        {
          description: "明确了能量与蒸发的关系。",
          basis: "USER_RESPONSE",
          evidenceId: "message-1",
        },
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
    ["伪造用户原话", { userEvidenceMessageIds: ["missing-message"] }],
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
});
