import { describe, expect, it, vi } from "vitest";

import { reportDocumentSchema } from "@/domain/report/build-report";

import { generateTaskReport, type ReportAgentCall } from "./generate-report";

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

  it("把超过单次上限的已完成主题分批交给 Agent 3，并保存完整报告", async () => {
    const taskId = "11111111-1111-4111-8111-111111111111";
    const now = "2026-08-02T08:00:00.000Z";
    const nodes = Array.from({ length: 41 }, (_, index) => ({
      id: `node-${index + 1}`,
      title: `主题 ${index + 1}`,
      canonicalUnderstanding: `主题 ${index + 1} 的规范理解。`,
      commonMisconceptions: [],
      sourceReferences: [{ label: `第 ${index + 1} 段`, excerpt: `来源 ${index + 1}` }],
      order: index + 1,
    }));
    const completedStages = {
      MEMORY: {
        status: "PASSED" as const,
        mainQuestion: "记忆题？",
        verificationQuestion: null,
        answerOrigin: "NONE" as const,
        hintLevel: 0,
      },
      UNDERSTANDING: {
        status: "PASSED" as const,
        mainQuestion: "理解题？",
        verificationQuestion: null,
        answerOrigin: "NONE" as const,
        hintLevel: 0,
      },
      APPLICATION: {
        status: "PASSED" as const,
        mainQuestion: "应用题？",
        verificationQuestion: null,
        answerOrigin: "NONE" as const,
        hintLevel: 0,
      },
      ANALYSIS: {
        status: "PASSED" as const,
        mainQuestion: "分析题？",
        verificationQuestion: null,
        answerOrigin: "NONE" as const,
        hintLevel: 0,
      },
    };
    const generationData = {
      task: { id: taskId, fileName: "large.md", learningGoal: null },
      material: { nodes, knowledgeItems: [], coverageAssignments: [] },
      sessions: nodes.map((node) => ({
        taskId,
        nodeId: node.id,
        session: { status: "COMPLETED", stages: completedStages },
        scaffoldEvents: [],
      })),
      messages: nodes.map((node) => ({
        id: `message-${node.id}`,
        taskId,
        nodeId: node.id,
        role: "USER",
        content: `我理解了${node.title}。`,
      })),
    };
    const getReportGenerationData = vi.fn().mockResolvedValue(generationData);
    const saveReport = vi.fn();
    let batch = 0;
    const callAgent = vi.fn(async (request: Parameters<ReportAgentCall>[0]) => {
      batch += 1;
      return {
        summary: `批次 ${batch} 总结。`,
        nodeInsights: request.input.completedNodes.map((node) => ({
          nodeId: node.nodeId,
          learningEvidence: ([
            "MEMORY",
            "UNDERSTANDING",
            "APPLICATION",
            "ANALYSIS",
          ] as const).map((stage) => ({
            stage,
            category: "INDEPENDENT" as const,
            statement: `${node.title} 的${stage}证据。`,
            userMessageId: `message-${node.nodeId}`,
          })),
          misconceptions: [],
          scaffoldNotes: [],
          nextSteps: ["继续复习。"],
          sourceReferenceIndexes: [0],
        })),
      };
    });

    const document = await generateTaskReport(
      taskId,
      { getReportGenerationData, saveReport },
      callAgent,
      () => now,
    );

    expect(callAgent).toHaveBeenCalledTimes(2);
    expect(callAgent.mock.calls.map(([request]) => request.input.completedNodes.length)).toEqual([
      40, 1,
    ]);
    expect(document).toMatchObject({
      progress: { completed: 41, total: 41 },
      summary: "批次 1 总结。\n\n批次 2 总结。",
    });
    expect(document?.nodes).toHaveLength(41);
    expect(reportDocumentSchema.parse(document).nodes).toHaveLength(41);
    expect(saveReport).toHaveBeenCalledOnce();

    const nextNode = {
      id: "node-42",
      title: "主题 42",
      canonicalUnderstanding: "主题 42 的规范理解。",
      commonMisconceptions: [],
      sourceReferences: [{ label: "第 42 段", excerpt: "来源 42" }],
      order: 42,
    };
    getReportGenerationData.mockResolvedValue({
      ...generationData,
      material: { ...generationData.material, nodes: [...nodes, nextNode] },
      sessions: [
        ...generationData.sessions,
        {
          taskId,
          nodeId: nextNode.id,
          session: { status: "COMPLETED", stages: completedStages },
          scaffoldEvents: [],
        },
      ],
      messages: [
        ...generationData.messages,
        {
          id: "message-node-42",
          taskId,
          nodeId: nextNode.id,
          role: "USER",
          content: "我理解了主题 42。",
        },
      ],
      report: { document },
    });

    const updated = await generateTaskReport(
      taskId,
      { getReportGenerationData, saveReport },
      callAgent,
      () => now,
    );

    expect(callAgent).toHaveBeenCalledTimes(3);
    expect(callAgent.mock.calls[2]![0].input.completedNodes).toHaveLength(1);
    expect(updated).toMatchObject({
      progress: { completed: 42, total: 42 },
      summary: "批次 1 总结。\n\n批次 2 总结。\n\n批次 3 总结。",
    });
    expect(updated?.nodes).toHaveLength(42);
  });
});
