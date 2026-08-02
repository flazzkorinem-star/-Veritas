import { describe, expect, it, vi } from "vitest";

import { generateTaskReport } from "./generate-report";

describe("报告生成编排", () => {
  it("只把已完成主题的本地证据交给 Agent 3，并保存代码回填的报告", async () => {
    const getReportGenerationData = vi.fn().mockResolvedValue({
      task: { id: "11111111-1111-4111-8111-111111111111", fileName: "water.md" },
      material: {
        nodes: [
          {
            id: "node-1",
            title: "循环动力",
            canonicalUnderstanding: "太阳能驱动蒸发。",
            commonMisconceptions: [],
            sourceReferences: [{ label: "第 1 段", excerpt: "太阳驱动蒸发。" }],
            order: 1,
          },
          {
            id: "node-2",
            title: "降水回流",
            canonicalUnderstanding: "水返回地表。",
            commonMisconceptions: [],
            sourceReferences: [{ label: "第 2 段", excerpt: "水返回地表。" }],
            order: 2,
          },
        ],
        knowledgeItems: [],
        coverageAssignments: [],
      },
      sessions: [
        {
          taskId: "11111111-1111-4111-8111-111111111111",
          nodeId: "node-1",
          session: {
            status: "COMPLETED",
            stages: {
              MEMORY: { status: "PASSED" },
              UNDERSTANDING: { status: "PASSED_WITH_HINT" },
              APPLICATION: { status: "PASSED_WITH_ANSWER" },
              ANALYSIS: { status: "PASSED" },
            },
          },
          scaffoldEvents: [],
        },
      ],
      messages: [
        {
          id: "message-1",
          taskId: "11111111-1111-4111-8111-111111111111",
          nodeId: "node-1",
          role: "USER",
          content: "太阳能驱动蒸发。",
        },
        {
          id: "message-2",
          taskId: "11111111-1111-4111-8111-111111111111",
          nodeId: "node-1",
          role: "ASSISTANT",
          content: "家教完整答案不能成为用户证据。",
        },
      ],
    });
    const saveReport = vi.fn();
    const callAgent = vi.fn().mockResolvedValue({
      summary: "主题一已经完成。",
      nodeInsights: [
        {
          nodeId: "node-1",
          understood: [{ statement: "能指出主要动力。", userMessageId: "message-1" }],
          blindSpots: ["应用层依赖完整答案。"],
          userEvidenceMessageIds: ["message-1"],
          scaffoldNotes: [],
          learnedOrCorrected: [],
          nextSteps: ["独立完成新情境应用。"],
          sourceReferenceIndexes: [0],
        },
      ],
    });

    await generateTaskReport(
      "11111111-1111-4111-8111-111111111111",
      { getReportGenerationData, saveReport },
      callAgent,
      () => "2026-08-02T08:00:00.000Z",
    );

    const request = callAgent.mock.calls[0]![0];
    expect(request.operation).toBe("CREATE_REPORT");
    expect(JSON.stringify(request)).not.toContain("家教完整答案不能成为用户证据");
    expect(request.input.completedNodes).toHaveLength(1);
    expect(saveReport).toHaveBeenCalledWith(
      expect.objectContaining({
        progress: { completed: 1, total: 2 },
        nodes: [expect.objectContaining({ evidenceQuotes: ["太阳能驱动蒸发。"] })],
      }),
      expect.stringContaining("学习诊断报告"),
    );
  });
});
