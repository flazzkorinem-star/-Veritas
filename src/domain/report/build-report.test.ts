import { describe, expect, it } from "vitest";

import { buildReportDocument, reportToMarkdown } from "./build-report";
import type { ReportAgentInput, ReportAgentOutput } from "./contracts";

const input: ReportAgentInput = {
  materialTitle: "水循环.md",
  completedNodes: [
    {
      nodeId: "node-1",
      title: "循环动力",
      canonicalUnderstanding: "太阳能驱动水蒸发。",
      commonMisconceptions: [],
      score: 75,
      stages: {
        MEMORY: "PASSED",
        UNDERSTANDING: "PASSED_WITH_HINT",
        APPLICATION: "PASSED_WITH_ANSWER",
        ANALYSIS: "PASSED",
      },
      userMessages: [{ id: "message-1", content: "太阳能让水蒸发。" }],
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
      understood: [{ statement: "能指出主要动力。", userMessageId: "message-1" }],
      blindSpots: ["新情境应用仍需练习。"],
      userEvidenceMessageIds: ["message-1"],
      scaffoldNotes: [],
      learnedOrCorrected: [],
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
      evidenceQuotes: ["太阳能让水蒸发。"],
      stages: input.completedNodes[0]!.stages,
    });
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
    expect(markdown).toContain("> 太阳能让水蒸发。");
    expect(markdown).toContain("PASSED_WITH_ANSWER");
    expect(markdown).not.toContain("canonicalUnderstanding");
  });

  it("转义报告中的 HTML、链接和 Markdown 控制字符", () => {
    const hostileInput = structuredClone(input);
    hostileInput.materialTitle =
      "<img src=x onerror=alert(1)> [点我](javascript:alert(1))";
    hostileInput.completedNodes[0]!.title = "# <script>alert(1)</script>";
    hostileInput.completedNodes[0]!.userMessages[0]!.content =
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
