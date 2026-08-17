import { describe, expect, it } from "vitest";

import { buildReportDocument, reportToMarkdown } from "./build-report";
import type { ReportAgentInput, ReportAgentOutput } from "./contracts";

const input: ReportAgentInput = {
  materialTitle: "水循环.md",
  learningGoal: "理解水循环机制",
  completedNodes: [
    {
      nodeId: "node-1",
      title: "循环动力",
      canonicalUnderstanding: "太阳能驱动水蒸发。",
      commonMisconceptions: [],
      score: 75,
      stages: {
        MEMORY: {
          status: "PASSED",
          mainQuestion: "动力是什么？",
          verificationQuestion: null,
          answerOrigin: "NONE",
          hintLevel: 0,
        },
        UNDERSTANDING: {
          status: "PASSED_WITH_HINT",
          mainQuestion: "为什么？",
          verificationQuestion: null,
          answerOrigin: "NONE",
          hintLevel: 1,
        },
        APPLICATION: {
          status: "PASSED_WITH_ANSWER",
          mainQuestion: "如何应用？",
          verificationQuestion: "换个场景呢？",
          answerOrigin: "AUTOMATIC",
          hintLevel: 0,
        },
        ANALYSIS: {
          status: "PASSED_WITH_ANSWER",
          mainQuestion: "如何分析？",
          verificationQuestion: null,
          answerOrigin: "REQUESTED",
          hintLevel: 0,
        },
      },
      messages: [
        { id: "message-1", role: "USER", content: "太阳能让水蒸发。" },
        { id: "message-2", role: "USER", content: "它为蒸发提供能量。" },
        { id: "message-3", role: "USER", content: "换个场景仍然成立。" },
      ],
      scaffoldEvents: [],
      sourceReferences: [{ label: "第 1 段", excerpt: "太阳驱动蒸发。" }],
    },
  ],
};

const output: ReportAgentOutput = {
  summary: "已理解主要动力。",
  nodeInsights: [
    {
      nodeId: "node-1",
      learningEvidence: [
        {
          stage: "MEMORY",
          category: "INDEPENDENT",
          statement: "能指出主要动力。",
          userMessageId: "message-1",
        },
        {
          stage: "UNDERSTANDING",
          category: "AFTER_HINT",
          statement: "提示后能解释原因。",
          userMessageId: "message-2",
        },
        {
          stage: "APPLICATION",
          category: "AFTER_TEACHING_VERIFIED",
          statement: "讲解后通过了新场景验证。",
          userMessageId: "message-3",
        },
        {
          stage: "ANALYSIS",
          category: "EXPLAINED_NOT_VERIFIED",
          statement: "看过分析答案但没有验证。",
          userMessageId: null,
        },
      ],
      misconceptions: [],
      scaffoldNotes: [],
      nextSteps: ["更换情境练习。"],
      sourceReferenceIndexes: [0],
    },
  ],
};

describe("任务级报告构建", () => {
  it("由代码补齐总体进度、三种层级状态和真实原话", () => {
    const document = buildReportDocument({
      taskId: "11111111-1111-4111-8111-111111111111",
      generatedAt: "2026-08-02T08:00:00.000Z",
      totalNodeCount: 2,
      coverage: {
        diagnosed: ["循环动力"],
        undiagnosed: ["降水回流"],
        supporting: ["云的分类"],
        referenceOnly: ["历史背景"],
      },
      input,
      output,
    });

    expect(document.progress).toEqual({ completed: 1, total: 2 });
    expect(document.nodes[0]).toMatchObject({
      score: 75,
      stages: {
        MEMORY: "PASSED",
        UNDERSTANDING: "PASSED_WITH_HINT",
        APPLICATION: "PASSED_WITH_ANSWER",
        ANALYSIS: "PASSED_WITH_ANSWER",
      },
      learningEvidence: expect.arrayContaining([
        expect.objectContaining({
          category: "INDEPENDENT",
          evidenceQuote: "太阳能让水蒸发。",
        }),
        expect.objectContaining({
          category: "EXPLAINED_NOT_VERIFIED",
          evidenceQuote: null,
        }),
      ]),
    });
    expect(document.nodes[0]).not.toHaveProperty("evidenceQuotes");
    expect(document.nodes[0]).not.toHaveProperty("learnedOrCorrected");
    expect(document.nodes[0]).not.toHaveProperty("understood");
    expect(document.nodes[0]).not.toHaveProperty("blindSpots");
    expect(document.coverage.undiagnosed).toEqual(["降水回流"]);
  });

  it("生成不包含原始材料或完整聊天的 Markdown", () => {
    const document = buildReportDocument({
      taskId: "11111111-1111-4111-8111-111111111111",
      generatedAt: "2026-08-02T08:00:00.000Z",
      totalNodeCount: 1,
      coverage: {
        diagnosed: ["循环动力"],
        undiagnosed: [],
        supporting: [],
        referenceOnly: [],
      },
      input,
      output,
    });

    const markdown = reportToMarkdown(document);
    expect(markdown).toContain("# 水循环.md · 学习诊断报告");
    expect(markdown).toContain("- 理解：提示后通过");
    expect(markdown).toContain("> 太阳能让水蒸发。");
    expect(markdown).toContain("讲解后经过验证学会");
    expect(markdown).toContain("看过答案但未验证");
    expect(markdown).not.toContain("PASSED_WITH_ANSWER");
    expect(markdown).not.toContain("canonicalUnderstanding");
  });

  it("转义报告中的 HTML、链接和 Markdown 控制字符", () => {
    const hostileInput = structuredClone(input);
    hostileInput.materialTitle =
      "<img src=x onerror=alert(1)> [点我](javascript:alert(1))";
    hostileInput.completedNodes[0]!.title = "# <script>alert(1)</script>";
    hostileInput.completedNodes[0]!.messages[0]!.content =
      "> [危险链接](javascript:alert(1))";
    const hostileOutput = structuredClone(output);
    hostileOutput.summary = "<svg onload=alert(1)> [链接](javascript:alert(1))";
    const document = buildReportDocument({
      taskId: "11111111-1111-4111-8111-111111111111",
      generatedAt: "2026-08-02T08:00:00.000Z",
      totalNodeCount: 1,
      coverage: {
        diagnosed: ["主题"],
        undiagnosed: [],
        supporting: [],
        referenceOnly: [],
      },
      input: hostileInput,
      output: hostileOutput,
    });

    const markdown = reportToMarkdown(document);
    expect(markdown).not.toContain("<script>");
    expect(markdown).not.toContain("<img");
    expect(markdown).not.toContain("<svg");
    expect(markdown).not.toContain("[点我](javascript:");
    expect(markdown).not.toContain("[链接](javascript:");
    expect(markdown).toContain("&lt;script&gt;");
  });
});
