import { describe, expect, it, vi } from "vitest";

import { generateTaskReport } from "./generate-report";

describe("报告生成编排", () => {
  it("把已完成主题的完整对话脉络交给 Agent 3，并保存代码回填的报告", async () => {
    const getReportGenerationData = vi.fn().mockResolvedValue({
      task: {
        id: "11111111-1111-4111-8111-111111111111",
        fileName: "water.md",
        learningGoal: "理解水循环机制",
      },
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
                mainQuestion: "阴天会怎样？",
                verificationQuestion: "阴天还会蒸发吗？",
                answerOrigin: "AUTOMATIC",
                hintLevel: 0,
              },
              ANALYSIS: {
                status: "PASSED_WITH_ANSWER",
                mainQuestion: "温度变化会怎样？",
                verificationQuestion: null,
                answerOrigin: "REQUESTED",
                hintLevel: 0,
              },
            },
          },
          scaffoldEvents: [],
        },
      ],
      messages: [
        {
          id: "message-0",
          taskId: "11111111-1111-4111-8111-111111111111",
          nodeId: "node-1",
          role: "ASSISTANT",
          content: "水循环的主要动力是什么？",
        },
        {
          id: "message-detour",
          taskId: "11111111-1111-4111-8111-111111111111",
          nodeId: "node-1",
          role: "USER",
          content: "先别考我，解释一下整体机制。",
        },
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
              statement: "提示后能解释动力。",
              userMessageId: "message-1",
            },
            {
              stage: "APPLICATION",
              category: "AFTER_TEACHING_VERIFIED",
              statement: "讲解后通过应用验证。",
              userMessageId: "message-1",
            },
            {
              stage: "ANALYSIS",
              category: "EXPLAINED_NOT_VERIFIED",
              statement: "看过答案但没有再次验证。",
              userMessageId: null,
            },
          ],
          misconceptions: [],
          scaffoldNotes: [],
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
    expect(request.input.learningGoal).toBe("理解水循环机制");
    expect(request.input.completedNodes[0].messages).toEqual([
      expect.objectContaining({ id: "message-0", role: "ASSISTANT" }),
      expect.objectContaining({ id: "message-detour", role: "USER" }),
      expect.objectContaining({ id: "message-1", role: "USER" }),
      expect.objectContaining({ id: "message-2", role: "ASSISTANT" }),
    ]);
    expect(request.input.completedNodes).toHaveLength(1);
    expect(request.input.completedNodes[0].stages.APPLICATION).toMatchObject({
      answerOrigin: "AUTOMATIC",
      verificationQuestion: "阴天还会蒸发吗？",
    });
    expect(saveReport).toHaveBeenCalledWith(
      expect.objectContaining({
        progress: { completed: 1, total: 2 },
        nodes: [
          expect.objectContaining({
            learningEvidence: expect.arrayContaining([
              expect.objectContaining({ category: "AFTER_TEACHING_VERIFIED" }),
              expect.objectContaining({ category: "EXPLAINED_NOT_VERIFIED" }),
            ]),
          }),
        ],
      }),
      expect.stringContaining("学习诊断报告"),
    );
  });
});
