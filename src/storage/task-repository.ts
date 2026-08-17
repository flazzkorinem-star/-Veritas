import { z } from "zod";

import { MAX_DIAGNOSTIC_NODES } from "@/config/knowledge-map-limits";
import {
  firstQuestionSchema,
  knowledgeMapSchema,
} from "@/domain/knowledge-map/contracts";
import { createNodeSession, diagnosticReducer } from "@/domain/diagnostic/reducer";
import { getNodeScore } from "@/domain/diagnostic/selectors";
import { MAX_PARSED_TEXT_CHARACTERS } from "@/config/material-limits";
import { MAX_REPORT_MARKDOWN_CHARACTERS } from "@/config/report-limits";
import type { FirstQuestion } from "@/domain/knowledge-map/contracts";
import type { NodeSession } from "@/domain/diagnostic/contracts";
import type { ScaffoldType } from "@/domain/diagnostic/agent-contracts";
import type { StageKey } from "@/domain/types";
import { STAGE_ORDER, TASK_STATUSES } from "@/domain/types";
import {
  reportDocumentSchema,
  reportToMarkdown,
  type ReportDocument,
} from "@/domain/report/build-report";
import { expectedLearningEvidenceCategory } from "@/domain/report/contracts";
import { materialProcessingTraceSchema } from "@/domain/materials/processing-trace";
import type { VeritasDatabase } from "@/storage/database";
import type {
  DeletedTaskSnapshot,
  StoredTask,
  StoredUiState,
  StoredWorkspaceState,
} from "@/storage/types";

interface ConversationTurnWrite {
  taskId: string;
  nodeId: string;
  session: NodeSession;
  userMessage?: string;
  assistantMessages: string[];
  scaffold: { stage: StageKey; type: ScaffoldType; reason: string } | null;
  learningGoalUpdate: string | null;
}

const storedTaskSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(80),
  fileName: z.string().trim().min(1).max(255),
  materialId: z.uuid(),
  status: z.enum(TASK_STATUSES),
  currentNodeId: z.string().min(1).nullable(),
  isPinned: z.boolean(),
  learningGoal: z.string().trim().min(1).max(500).optional(),
  failureReason: z.string().trim().min(1).max(200).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const uiStateSchema = z.object({
  taskId: z.uuid(),
  selectedNodeId: z.string().min(1).nullable(),
  mobilePanel: z.enum(["TASKS", "TOPICS", "DIAGNOSTIC"]).nullable(),
  updatedAt: z.string().datetime(),
});

const workspaceStateSchema = z.object({
  id: z.literal("workspace"),
  activeTaskId: z.uuid().nullable(),
  workspaceCollapsed: z.boolean(),
  updatedAt: z.string().datetime(),
});

const storedReportSchema = z
  .object({
    id: z.uuid(),
    taskId: z.uuid(),
    markdown: z.string().trim().min(1).max(MAX_REPORT_MARKDOWN_CHARACTERS),
    document: reportDocumentSchema,
    completedNodeIds: z
      .array(z.string().trim().min(1).max(120))
      .max(MAX_DIAGNOSTIC_NODES),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((report, context) => {
    const documentNodeIds = report.document.nodes.map((node) => node.nodeId).toSorted();
    if (
      report.taskId !== report.document.taskId ||
      report.completedNodeIds.toSorted().join("\n") !== documentNodeIds.join("\n")
    ) {
      context.addIssue({
        code: "custom",
        message: "报告关联关系无效。",
      });
    }
  });

const EMPTY_WORKSPACE_STATE: StoredWorkspaceState = {
  id: "workspace",
  activeTaskId: null,
  workspaceCollapsed: false,
  updatedAt: "1970-01-01T00:00:00.000Z",
};

export type LocalStoreErrorCode =
  | "NOT_FOUND"
  | "RELATION_MISMATCH"
  | "CORRUPT_RECORD"
  | "QUOTA_EXCEEDED"
  | "STORAGE_UNAVAILABLE";

export class LocalStoreError extends Error {
  constructor(
    readonly code: LocalStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LocalStoreError";
  }
}

function toLocalStoreError(error: unknown) {
  if (error instanceof LocalStoreError) return error;
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return new LocalStoreError(
      "QUOTA_EXCEEDED",
      "浏览器存储空间不足，请清理空间后重试。",
    );
  }
  return new LocalStoreError(
    "STORAGE_UNAVAILABLE",
    "暂时无法访问本地任务，请刷新页面后重试。",
  );
}

function parseTask(value: unknown) {
  const result = storedTaskSchema.safeParse(value);
  if (!result.success) {
    throw new LocalStoreError(
      "CORRUPT_RECORD",
      "本地任务数据已损坏，请删除该任务后重新导入材料。",
    );
  }
  return result.data;
}

function parseReport(value: unknown) {
  const result = storedReportSchema.safeParse(value);
  if (!result.success) {
    throw new LocalStoreError("CORRUPT_RECORD", "本地报告数据已损坏，请重新生成报告。");
  }
  return result.data;
}

function readReport(value: unknown) {
  const result = storedReportSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

function sortTasks(tasks: StoredTask[]) {
  return tasks.toSorted((left, right) => {
    if (left.isPinned !== right.isPinned) return left.isPinned ? -1 : 1;
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

export function createTaskRepository(database: VeritasDatabase) {
  async function run<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      throw toLocalStoreError(error);
    }
  }

  async function getExistingTask(taskId: string) {
    const storedTask = await database.tasks.get(taskId);
    if (!storedTask) {
      throw new LocalStoreError("NOT_FOUND", "找不到这个本地任务。");
    }
    return parseTask(storedTask);
  }

  return {
    listTasks() {
      return run(async () => {
        const tasks = (await database.tasks.toArray()).map(parseTask);
        return sortTasks(tasks);
      });
    },

    createProcessingTask(file: File) {
      return run(async () => {
        const now = new Date().toISOString();
        const fileName = file.name.split(/[\\/]/).at(-1)?.trim() || "未命名材料";
        const title =
          fileName
            .replace(/\.[^.]+$/, "")
            .trim()
            .slice(0, 80) || "未命名材料";
        const task = parseTask({
          id: crypto.randomUUID(),
          title,
          fileName: fileName.slice(0, 255),
          materialId: crypto.randomUUID(),
          status: "PROCESSING",
          currentNodeId: null,
          isPinned: false,
          createdAt: now,
          updatedAt: now,
        });
        await database.transaction(
          "rw",
          database.tasks,
          database.materials,
          database.workspaceStates,
          async () => {
            await database.tasks.put(task);
            await database.materials.put({
              taskId: task.id,
              materialId: task.materialId,
              fileName: task.fileName,
              mimeType: file.type,
              sizeBytes: file.size,
              originalFile: file,
              parsedText: null,
              processingTrace: null,
              modules: [],
              knowledgeItems: [],
              nodes: [],
              coverageAssignments: [],
            });
            await database.workspaceStates.put({
              id: "workspace",
              activeTaskId: task.id,
              workspaceCollapsed: false,
              updatedAt: now,
            });
          },
        );
        return task;
      });
    },

    completeTextProcessing(
      taskId: string,
      parsedText: string,
      mapValue: unknown,
      questionValue: unknown,
      traceValue: unknown,
    ) {
      return run(async () => {
        const task = await getExistingTask(taskId);
        const material = await database.materials.get(taskId);
        const knowledgeMap = knowledgeMapSchema.safeParse(mapValue);
        const firstQuestion = firstQuestionSchema.safeParse(questionValue);
        const processingTrace = materialProcessingTraceSchema.safeParse(traceValue);
        if (
          task.status !== "PROCESSING" ||
          !material ||
          !parsedText.trim() ||
          parsedText.length > MAX_PARSED_TEXT_CHARACTERS ||
          !knowledgeMap.success ||
          !firstQuestion.success ||
          !processingTrace.success
        ) {
          throw new LocalStoreError(
            "RELATION_MISMATCH",
            "材料处理结果与本地任务不匹配，已拒绝保存。",
          );
        }
        const firstNode = knowledgeMap.data.nodes.toSorted(
          (left, right) => left.order - right.order,
        )[0];
        if (!firstNode) {
          throw new LocalStoreError("RELATION_MISMATCH", "材料中没有可保存的学习主题。");
        }
        const now = new Date().toISOString();
        const session = diagnosticReducer(createNodeSession(firstNode.id), {
          type: "START_STAGE",
          question: firstQuestion.data.question,
        });
        const updatedTask = parseTask({
          ...task,
          status: "IN_PROGRESS",
          currentNodeId: firstNode.id,
          failureReason: undefined,
          updatedAt: now,
        });

        await database.transaction(
          "rw",
          [
            database.tasks,
            database.materials,
            database.sessions,
            database.messages,
            database.uiStates,
            database.workspaceStates,
          ],
          async () => {
            await database.tasks.put(updatedTask);
            await database.materials.put({
              ...material,
              parsedText: parsedText.trim(),
              processingTrace: processingTrace.data,
              ...knowledgeMap.data,
            });
            await database.sessions.put({
              taskId,
              nodeId: firstNode.id,
              session,
              scaffoldEvents: [],
            });
            await database.messages.put({
              id: crypto.randomUUID(),
              taskId,
              nodeId: firstNode.id,
              role: "ASSISTANT",
              content: `${firstQuestion.data.opening}\n\n${firstQuestion.data.question}`,
              createdAt: now,
            });
            await database.uiStates.put({
              taskId,
              selectedNodeId: firstNode.id,
              mobilePanel: null,
              updatedAt: now,
            });
            const workspaceState = await database.workspaceStates.get("workspace");
            await database.workspaceStates.put({
              id: "workspace",
              activeTaskId: taskId,
              workspaceCollapsed: workspaceState?.workspaceCollapsed ?? false,
              updatedAt: now,
            });
          },
        );
        return updatedTask;
      });
    },

    failTaskProcessing(taskId: string, reason: string) {
      return run(async () => {
        const task = await getExistingTask(taskId);
        const failureReason = reason.trim().slice(0, 200);
        if (!failureReason) {
          throw new LocalStoreError("CORRUPT_RECORD", "任务失败原因不能为空。 ");
        }
        const failedTask = parseTask({
          ...task,
          status: "FAILED",
          failureReason,
          updatedAt: new Date().toISOString(),
        });
        await database.tasks.put(failedTask);
        return failedTask;
      });
    },

    restartTaskProcessing(taskId: string) {
      return run(async () => {
        const task = await getExistingTask(taskId);
        if (task.status !== "FAILED") {
          throw new LocalStoreError("RELATION_MISMATCH", "当前任务不需要重新处理。");
        }
        const restartedTask = parseTask({
          ...task,
          status: "PROCESSING",
          currentNodeId: null,
          failureReason: undefined,
          updatedAt: new Date().toISOString(),
        });
        await database.tasks.put(restartedTask);
        return restartedTask;
      });
    },

    getTaskLearningData(taskId: string) {
      return run(async () => {
        const task = await getExistingTask(taskId);
        const material = await database.materials.get(taskId);
        const sessions = await database.sessions.where("taskId").equals(taskId).toArray();
        const session = task.currentNodeId
          ? await database.sessions.get([taskId, task.currentNodeId])
          : undefined;
        const messages = task.currentNodeId
          ? await database.messages
              .where("taskId")
              .equals(taskId)
              .filter((message) => message.nodeId === task.currentNodeId)
              .sortBy("createdAt")
          : [];
        const draft = task.currentNodeId
          ? await database.drafts.get([taskId, task.currentNodeId])
          : undefined;
        const storedReport = await database.reports.get(taskId);
        const report = storedReport ? readReport(storedReport) : undefined;
        return {
          task,
          material,
          session,
          sessions,
          messages,
          draft,
          report,
          reportCorrupted: Boolean(storedReport && !report),
        };
      });
    },

    getReport(taskId: string) {
      return run(async () => {
        await getExistingTask(taskId);
        const report = await database.reports.get(taskId);
        return report ? parseReport(report) : undefined;
      });
    },

    listReportTaskIds() {
      return run(async () =>
        (await database.reports.toArray()).flatMap((report) => {
          const valid = readReport(report);
          return valid ? [valid.taskId] : [];
        }),
      );
    },

    getReportGenerationData(taskId: string) {
      return run(async () => {
        const task = await getExistingTask(taskId);
        const material = await database.materials.get(taskId);
        if (!material) {
          throw new LocalStoreError("NOT_FOUND", "找不到这份任务的材料。");
        }
        const [sessions, messages, storedReport] = await Promise.all([
          database.sessions.where("taskId").equals(taskId).toArray(),
          database.messages.where("taskId").equals(taskId).sortBy("createdAt"),
          database.reports.get(taskId),
        ]);
        return {
          task,
          material,
          sessions,
          messages,
          report: storedReport ? readReport(storedReport) : undefined,
        };
      });
    },

    saveReport(documentValue: ReportDocument, markdownValue: string) {
      return run(() =>
        database.transaction(
          "rw",
          [
            database.tasks,
            database.materials,
            database.sessions,
            database.messages,
            database.reports,
          ],
          async () => {
            const document = reportDocumentSchema.safeParse(documentValue);
            const markdown = markdownValue.trim();
            const task = await getExistingTask(documentValue.taskId);
            const material = await database.materials.get(task.id);
            const sessions = await database.sessions
              .where("taskId")
              .equals(task.id)
              .toArray();
            const messages = await database.messages
              .where("taskId")
              .equals(task.id)
              .toArray();
            const completedNodeIds = sessions
              .filter((stored) => stored.session.status === "COMPLETED")
              .map((stored) => stored.nodeId)
              .toSorted();
            const reportNodeIds = document.success
              ? document.data.nodes.map((node) => node.nodeId).toSorted()
              : [];
            const sessionByNode = new Map(
              sessions.map((stored) => [stored.nodeId, stored]),
            );
            const materialNodeById = new Map(
              material?.nodes.map((node) => [node.id, node]) ?? [],
            );
            const factsMatch =
              document.success &&
              document.data.nodes.every((reportNode) => {
                const stored = sessionByNode.get(reportNode.nodeId);
                const materialNode = materialNodeById.get(reportNode.nodeId);
                const userQuotes = new Set(
                  messages
                    .filter(
                      (message) =>
                        message.nodeId === reportNode.nodeId && message.role === "USER",
                    )
                    .map((message) => message.content),
                );
                if (
                  !stored ||
                  !materialNode ||
                  stored.session.status !== "COMPLETED" ||
                  reportNode.score !== getNodeScore(stored.session) ||
                  reportNode.learningEvidence.length !== STAGE_ORDER.length
                ) {
                  return false;
                }
                const stagesMatch = STAGE_ORDER.every((stage) => {
                  const state = stored.session.stages[stage];
                  const evidence = reportNode.learningEvidence.find(
                    (item) => item.stage === stage,
                  );
                  if (!evidence || reportNode.stages[stage] !== state.status) {
                    return false;
                  }
                  const expected = expectedLearningEvidenceCategory(
                    state as Parameters<typeof expectedLearningEvidenceCategory>[0],
                    (stored.scaffoldEvents ?? []).some((event) => event.stage === stage),
                  );
                  const quoteMatches =
                    expected === "EXPLAINED_NOT_VERIFIED"
                      ? evidence.evidenceQuote === null
                      : evidence.evidenceQuote !== null &&
                        userQuotes.has(evidence.evidenceQuote);
                  return evidence.category === expected && quoteMatches;
                });
                return (
                  stagesMatch &&
                  reportNode.misconceptions.every((item) =>
                    userQuotes.has(item.evidenceQuote),
                  ) &&
                  reportNode.scaffoldNotes.every((note) =>
                    (stored.scaffoldEvents ?? []).some(
                      (event) => event.type === note.type && event.reason === note.reason,
                    ),
                  ) &&
                  reportNode.sourceReferences.every((source) =>
                    materialNode.sourceReferences.some(
                      (candidate) =>
                        candidate.label === source.label &&
                        candidate.excerpt === source.excerpt,
                    ),
                  )
                );
              });
            if (
              !document.success ||
              !material ||
              !markdown ||
              markdown.length > MAX_REPORT_MARKDOWN_CHARACTERS ||
              markdown !== reportToMarkdown(document.data).trim() ||
              !factsMatch ||
              document.data.materialTitle !== task.fileName ||
              document.data.progress.completed !== completedNodeIds.length ||
              document.data.progress.total !== material.nodes.length ||
              completedNodeIds.join("\n") !== reportNodeIds.join("\n")
            ) {
              throw new LocalStoreError(
                "RELATION_MISMATCH",
                "报告与当前任务的诊断证据不匹配，已拒绝保存。",
              );
            }
            const now = document.data.generatedAt;
            const existing = await database.reports.get(task.id);
            const validExisting = existing ? readReport(existing) : undefined;
            const report = parseReport({
              id: validExisting?.id ?? crypto.randomUUID(),
              taskId: task.id,
              markdown,
              document: document.data,
              completedNodeIds,
              createdAt: validExisting?.createdAt ?? now,
              updatedAt: now,
            });
            await database.reports.put(report);
            const allCompleted = material.nodes.every((node) =>
              completedNodeIds.includes(node.id),
            );
            await database.tasks.put(
              parseTask({
                ...task,
                status: allCompleted ? "COMPLETED" : "IN_PROGRESS",
                updatedAt: now,
              }),
            );
            return report;
          },
        ),
      );
    },

    saveConversationTurn(value: ConversationTurnWrite) {
      return run(() =>
        database.transaction(
          "rw",
          [database.tasks, database.materials, database.sessions, database.messages],
          async () => {
            const task = await getExistingTask(value.taskId);
            const material = await database.materials.get(value.taskId);
            const existing = await database.sessions.get([value.taskId, value.nodeId]);
            const userMessage = value.userMessage?.trim();
            const assistantMessages = value.assistantMessages.map((message) =>
              message.trim(),
            );
            if (
              !material?.nodes.some((node) => node.id === value.nodeId) ||
              !existing ||
              value.session.nodeId !== value.nodeId ||
              (userMessage !== undefined &&
                (!userMessage || userMessage.length > 12_000)) ||
              assistantMessages.length === 0 ||
              assistantMessages.length > 4 ||
              assistantMessages.some((message) => !message || message.length > 8_000) ||
              (value.learningGoalUpdate !== null &&
                (!value.learningGoalUpdate.trim() ||
                  value.learningGoalUpdate.trim().length > 500))
            ) {
              throw new LocalStoreError(
                "RELATION_MISMATCH",
                "诊断回合与当前本地任务不匹配，已拒绝保存。",
              );
            }

            const previousMessages = await database.messages
              .where("taskId")
              .equals(value.taskId)
              .filter((message) => message.nodeId === value.nodeId)
              .sortBy("createdAt");
            const previousTime = Date.parse(
              previousMessages.at(-1)?.createdAt ?? "1970-01-01T00:00:00.000Z",
            );
            const baseTime = Math.max(Date.now(), previousTime + 1);
            const messages = [
              ...(userMessage ? [{ role: "USER" as const, content: userMessage }] : []),
              ...assistantMessages.map((content) => ({
                role: "ASSISTANT" as const,
                content,
              })),
            ].map((message, index) => ({
              ...message,
              id: crypto.randomUUID(),
              taskId: value.taskId,
              nodeId: value.nodeId,
              createdAt: new Date(baseTime + index).toISOString(),
            }));
            const scaffoldEvents = [
              ...(existing.scaffoldEvents ?? []),
              ...(value.scaffold
                ? [
                    {
                      id: crypto.randomUUID(),
                      ...value.scaffold,
                      createdAt: new Date(baseTime).toISOString(),
                    },
                  ]
                : []),
            ];
            await database.sessions.put({
              taskId: value.taskId,
              nodeId: value.nodeId,
              session: value.session,
              scaffoldEvents,
            });
            await database.messages.bulkPut(messages);
            const updatedTask = parseTask({
              ...task,
              status: task.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
              currentNodeId: value.nodeId,
              learningGoal: value.learningGoalUpdate?.trim() || task.learningGoal,
              updatedAt: new Date(baseTime).toISOString(),
            });
            await database.tasks.put(updatedTask);
          },
        ),
      );
    },

    reorderUnstartedNodes(taskId: string, nodeIds: string[]) {
      return run(() =>
        database.transaction(
          "rw",
          [database.tasks, database.materials, database.sessions],
          async () => {
            await getExistingTask(taskId);
            const material = await database.materials.get(taskId);
            const sessions = await database.sessions
              .where("taskId")
              .equals(taskId)
              .toArray();
            if (!material) {
              throw new LocalStoreError("NOT_FOUND", "找不到这份任务的材料。");
            }
            const startedIds = new Set(sessions.map((stored) => stored.nodeId));
            const pending = material.nodes
              .filter((node) => !startedIds.has(node.id))
              .toSorted((left, right) => left.order - right.order);
            const expectedIds = pending.map((node) => node.id).toSorted();
            if (
              nodeIds.length !== expectedIds.length ||
              new Set(nodeIds).size !== nodeIds.length ||
              nodeIds.toSorted().join("\n") !== expectedIds.join("\n")
            ) {
              throw new LocalStoreError(
                "RELATION_MISMATCH",
                "新的主题顺序与尚未开始的内容不匹配，已拒绝保存。",
              );
            }
            const orderSlots = pending.map((node) => node.order);
            const orderById = new Map(
              nodeIds.map((nodeId, index) => [nodeId, orderSlots[index]!]),
            );
            await database.materials.put({
              ...material,
              nodes: material.nodes.map((node) =>
                orderById.has(node.id)
                  ? { ...node, order: orderById.get(node.id)! }
                  : node,
              ),
            });
          },
        ),
      );
    },

    openNode(taskId: string, nodeId: string, firstQuestion?: FirstQuestion) {
      return run(() =>
        database.transaction(
          "rw",
          [
            database.tasks,
            database.materials,
            database.sessions,
            database.messages,
            database.uiStates,
          ],
          async () => {
            const task = await getExistingTask(taskId);
            const material = await database.materials.get(taskId);
            if (!material?.nodes.some((node) => node.id === nodeId)) {
              throw new LocalStoreError("RELATION_MISMATCH", "所选主题不属于当前任务。");
            }
            const now = new Date().toISOString();
            let session = await database.sessions.get([taskId, nodeId]);
            if (!session) {
              const parsedQuestion = firstQuestionSchema.safeParse(firstQuestion);
              if (!parsedQuestion.success) {
                throw new LocalStoreError(
                  "RELATION_MISMATCH",
                  "新主题需要一条有效的首问。",
                );
              }
              session = {
                taskId,
                nodeId,
                session: diagnosticReducer(createNodeSession(nodeId), {
                  type: "START_STAGE",
                  question: parsedQuestion.data.question,
                }),
                scaffoldEvents: [],
              };
              await database.sessions.put(session);
              await database.messages.put({
                id: crypto.randomUUID(),
                taskId,
                nodeId,
                role: "ASSISTANT",
                content: `${parsedQuestion.data.opening}\n\n${parsedQuestion.data.question}`,
                createdAt: now,
              });
            }
            await database.tasks.put(
              parseTask({ ...task, currentNodeId: nodeId, updatedAt: now }),
            );
            await database.uiStates.put({
              taskId,
              selectedNodeId: nodeId,
              mobilePanel: null,
              updatedAt: now,
            });
            return session;
          },
        ),
      );
    },

    saveDraft(taskId: string, nodeId: string, content: string) {
      return run(() =>
        database.transaction(
          "rw",
          [database.tasks, database.materials, database.drafts],
          async () => {
            await getExistingTask(taskId);
            const material = await database.materials.get(taskId);
            if (
              !material?.nodes.some((node) => node.id === nodeId) ||
              content.length > 4_000
            ) {
              throw new LocalStoreError(
                "RELATION_MISMATCH",
                "草稿与当前本地任务不匹配，已拒绝保存。",
              );
            }
            await database.drafts.put({
              taskId,
              nodeId,
              content,
              updatedAt: new Date().toISOString(),
            });
          },
        ),
      );
    },

    renameTask(taskId: string, title: string) {
      return run(async () => {
        const storedTask = await getExistingTask(taskId);
        const updated = parseTask({
          ...storedTask,
          title,
          updatedAt: new Date().toISOString(),
        });
        await database.tasks.put(updated);
        return updated;
      });
    },

    setTaskPinned(taskId: string, isPinned: boolean) {
      return run(async () => {
        const storedTask = await getExistingTask(taskId);
        const updated = parseTask({
          ...storedTask,
          isPinned,
          updatedAt: new Date().toISOString(),
        });
        await database.tasks.put(updated);
        return updated;
      });
    },

    saveUiState(uiState: StoredUiState) {
      return run(() =>
        database.transaction("rw", database.tasks, database.uiStates, async () => {
          const result = uiStateSchema.safeParse(uiState);
          if (!result.success) {
            throw new LocalStoreError("CORRUPT_RECORD", "本地界面状态无效，已无法保存。");
          }
          if (!(await database.tasks.get(uiState.taskId))) {
            throw new LocalStoreError(
              "RELATION_MISMATCH",
              "界面状态与任务不匹配，已拒绝保存。",
            );
          }
          await database.uiStates.put(result.data);
        }),
      );
    },

    getWorkspaceState() {
      return run(async () => {
        const stored = await database.workspaceStates.get("workspace");
        if (!stored) return EMPTY_WORKSPACE_STATE;
        const result = workspaceStateSchema.safeParse(stored);
        if (!result.success) {
          throw new LocalStoreError(
            "CORRUPT_RECORD",
            "本地工作区状态已损坏，请刷新页面后重试。",
          );
        }
        return result.data;
      });
    },

    saveWorkspaceState(workspaceState: StoredWorkspaceState) {
      return run(() =>
        database.transaction("rw", database.tasks, database.workspaceStates, async () => {
          const result = workspaceStateSchema.safeParse(workspaceState);
          if (!result.success) {
            throw new LocalStoreError(
              "CORRUPT_RECORD",
              "本地工作区状态无效，已无法保存。",
            );
          }
          if (
            workspaceState.activeTaskId &&
            !(await database.tasks.get(workspaceState.activeTaskId))
          ) {
            throw new LocalStoreError(
              "RELATION_MISMATCH",
              "当前任务与工作区不匹配，已拒绝保存。",
            );
          }
          await database.workspaceStates.put(result.data);
        }),
      );
    },

    deleteTask(taskId: string) {
      return run(() =>
        database.transaction(
          "rw",
          [
            database.tasks,
            database.materials,
            database.sessions,
            database.messages,
            database.drafts,
            database.reports,
            database.uiStates,
            database.workspaceStates,
          ],
          async () => {
            const workspaceState = await database.workspaceStates.get("workspace");
            const snapshot: DeletedTaskSnapshot = {
              task: await getExistingTask(taskId),
              material: await database.materials.get(taskId),
              sessions: await database.sessions.where("taskId").equals(taskId).toArray(),
              messages: await database.messages.where("taskId").equals(taskId).toArray(),
              drafts: await database.drafts.where("taskId").equals(taskId).toArray(),
              report: await database.reports.get(taskId),
              uiState: await database.uiStates.get(taskId),
              workspaceState:
                workspaceState?.activeTaskId === taskId ? workspaceState : undefined,
            };

            await database.tasks.delete(taskId);
            await database.materials.delete(taskId);
            await database.sessions.where("taskId").equals(taskId).delete();
            await database.messages.where("taskId").equals(taskId).delete();
            await database.drafts.where("taskId").equals(taskId).delete();
            await database.reports.delete(taskId);
            await database.uiStates.delete(taskId);
            if (snapshot.workspaceState) {
              await database.workspaceStates.put({
                ...snapshot.workspaceState,
                activeTaskId: null,
                updatedAt: new Date().toISOString(),
              });
            }
            return snapshot;
          },
        ),
      );
    },

    restoreDeletedTask(snapshot: DeletedTaskSnapshot) {
      return run(() =>
        database.transaction(
          "rw",
          [
            database.tasks,
            database.materials,
            database.sessions,
            database.messages,
            database.drafts,
            database.reports,
            database.uiStates,
            database.workspaceStates,
          ],
          async () => {
            const task = parseTask(snapshot.task);
            if (await database.tasks.get(task.id)) {
              throw new LocalStoreError(
                "RELATION_MISMATCH",
                "同名任务已经恢复，无法重复撤销删除。",
              );
            }
            await database.tasks.put(task);
            if (snapshot.material) await database.materials.put(snapshot.material);
            await database.sessions.bulkPut(snapshot.sessions);
            await database.messages.bulkPut(snapshot.messages);
            await database.drafts.bulkPut(snapshot.drafts);
            if (snapshot.report) await database.reports.put(snapshot.report);
            if (snapshot.uiState) await database.uiStates.put(snapshot.uiState);
            if (snapshot.workspaceState) {
              await database.workspaceStates.put(snapshot.workspaceState);
            }
          },
        ),
      );
    },
  };
}
