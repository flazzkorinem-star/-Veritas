import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import { buildReportDocument, reportToMarkdown } from "@/domain/report/build-report";
import { createNodeSession, diagnosticReducer } from "@/domain/diagnostic/reducer";

import { createVeritasDatabase } from "./database";
import { createTaskRepository } from "./task-repository";

const names: string[] = [];

function completeSession(nodeId: string) {
  let session = createNodeSession(nodeId);
  for (const stage of ["MEMORY", "UNDERSTANDING", "APPLICATION", "ANALYSIS"] as const) {
    session = diagnosticReducer(session, { type: "START_STAGE", question: `${stage}?` });
    session = diagnosticReducer(session, {
      type: "ANSWER_EVALUATED",
      outcome: { classification: "CORRECT", isCorrect: true, progress: "ADVANCING" },
    });
  }
  return session;
}

afterEach(async () => {
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)));
});

describe("报告仓储", () => {
  it("只接受与当前任务已完成主题完全匹配的报告，并在最终报告后完成任务", async () => {
    const name = `veritas-report-${crypto.randomUUID()}`;
    names.push(name);
    const database = createVeritasDatabase(name);
    const repository = createTaskRepository(database);
    const taskId = crypto.randomUUID();
    const materialId = crypto.randomUUID();
    const now = "2026-08-02T08:00:00.000Z";
    const node = {
      id: "node-1",
      moduleId: "module-1",
      title: "循环动力",
      objective: "解释循环动力。",
      knowledgeItemIds: ["item-1"],
      sourceReferences: [{ label: "第 1 段", excerpt: "太阳驱动蒸发。" }],
      canonicalUnderstanding: "太阳能驱动蒸发。",
      commonMisconceptions: [],
      bloomTargets: {
        memory: "说出动力。",
        understanding: "解释动力。",
        application: "应用动力。",
        analysis: "分析动力。",
      },
      order: 1,
    };
    await repository.saveTask({
      id: taskId,
      materialId,
      title: "水循环",
      fileName: "water.md",
      status: "IN_PROGRESS",
      currentNodeId: node.id,
      isPinned: false,
      createdAt: now,
      updatedAt: now,
    });
    await database.materials.put({
      taskId,
      materialId,
      fileName: "water.md",
      mimeType: "text/markdown",
      sizeBytes: 10,
      originalFile: new Blob(["材料"]),
      parsedText: "材料",
      processingTrace: null,
      modules: [{ id: "module-1", title: "水循环", sourceRange: "第 1 段" }],
      knowledgeItems: [
        {
          id: "item-1",
          moduleId: "module-1",
          title: "循环动力",
          summary: "太阳能驱动蒸发。",
          kind: "CORE",
          diagnosticRationale: "核心机制",
          sourceReferences: node.sourceReferences,
          commonMisconceptions: [],
        },
      ],
      nodes: [node],
      coverageAssignments: [
        { knowledgeItemId: "item-1", disposition: "DIAGNOSED_IN_NODE", nodeId: node.id },
      ],
    });
    await database.sessions.put({
      taskId,
      nodeId: node.id,
      session: completeSession(node.id),
      scaffoldEvents: [],
    });
    await database.messages.put({
      id: "message-1",
      taskId,
      nodeId: node.id,
      role: "USER",
      content: "太阳能驱动蒸发。",
      createdAt: now,
    });
    const input = {
      materialTitle: "water.md",
      learningGoal: null,
      completedNodes: [
        {
          nodeId: node.id,
          title: node.title,
          canonicalUnderstanding: node.canonicalUnderstanding,
          commonMisconceptions: [],
          score: 100,
          stages: {
            MEMORY: {
              status: "PASSED" as const,
              mainQuestion: "MEMORY?",
              verificationQuestion: null,
              answerOrigin: "NONE" as const,
              hintLevel: 0 as const,
            },
            UNDERSTANDING: {
              status: "PASSED" as const,
              mainQuestion: "UNDERSTANDING?",
              verificationQuestion: null,
              answerOrigin: "NONE" as const,
              hintLevel: 0 as const,
            },
            APPLICATION: {
              status: "PASSED" as const,
              mainQuestion: "APPLICATION?",
              verificationQuestion: null,
              answerOrigin: "NONE" as const,
              hintLevel: 0 as const,
            },
            ANALYSIS: {
              status: "PASSED" as const,
              mainQuestion: "ANALYSIS?",
              verificationQuestion: null,
              answerOrigin: "NONE" as const,
              hintLevel: 0 as const,
            },
          },
          messages: [
            { id: "message-1", role: "USER" as const, content: "太阳能驱动蒸发。" },
          ],
          scaffoldEvents: [],
          sourceReferences: node.sourceReferences,
        },
      ],
    };
    const output = {
      summary: "已完成诊断。",
      nodeInsights: [
        {
          nodeId: node.id,
          learningEvidence: [
            {
              stage: "MEMORY" as const,
              category: "INDEPENDENT" as const,
              statement: "能记住动力。",
              userMessageId: "message-1",
            },
            {
              stage: "UNDERSTANDING" as const,
              category: "INDEPENDENT" as const,
              statement: "能解释动力。",
              userMessageId: "message-1",
            },
            {
              stage: "APPLICATION" as const,
              category: "INDEPENDENT" as const,
              statement: "能应用动力。",
              userMessageId: "message-1",
            },
            {
              stage: "ANALYSIS" as const,
              category: "INDEPENDENT" as const,
              statement: "能分析动力。",
              userMessageId: "message-1",
            },
          ],
          misconceptions: [],
          scaffoldNotes: [],
          nextSteps: ["间隔一天后复述。"],
          sourceReferenceIndexes: [0],
        },
      ],
    };
    const document = buildReportDocument({
      taskId,
      generatedAt: now,
      totalNodeCount: 1,
      coverage: {
        diagnosed: [node.title],
        undiagnosed: [],
        supporting: [],
        referenceOnly: [],
      },
      input,
      output,
    });

    await repository.saveReport(document, reportToMarkdown(document));

    const learning = await repository.getTaskLearningData(taskId);
    expect(learning.report?.document).toEqual(document);
    expect(learning.task.status).toBe("COMPLETED");

    const invalid = structuredClone(document);
    invalid.progress.completed = 0;
    await expect(repository.saveReport(invalid, "# 坏报告")).rejects.toMatchObject({
      code: "RELATION_MISMATCH",
    });

    const falseScore = structuredClone(document);
    falseScore.nodes[0]!.score = 0;
    await expect(
      repository.saveReport(falseScore, reportToMarkdown(falseScore)),
    ).rejects.toMatchObject({ code: "RELATION_MISMATCH" });

    const falseEvidence = structuredClone(document);
    falseEvidence.nodes[0]!.learningEvidence[0]!.evidenceQuote = "并不存在的用户原话";
    await expect(
      repository.saveReport(falseEvidence, reportToMarkdown(falseEvidence)),
    ).rejects.toMatchObject({ code: "RELATION_MISMATCH" });

    await expect(repository.saveReport(document, "# 伪造报告")).rejects.toMatchObject({
      code: "RELATION_MISMATCH",
    });

    await database.reports.update(taskId, { id: "损坏-id", markdown: "" });
    await expect(repository.getReport(taskId)).rejects.toMatchObject({
      code: "CORRUPT_RECORD",
    });
    await expect(repository.getTaskLearningData(taskId)).resolves.toMatchObject({
      report: undefined,
      reportCorrupted: true,
    });
    await expect(repository.listReportTaskIds()).resolves.toEqual([]);

    await repository.saveReport(document, reportToMarkdown(document));
    await expect(repository.getReport(taskId)).resolves.toMatchObject({
      document,
      markdown: expect.stringContaining("学习诊断报告"),
    });
    database.close();
  });
});
