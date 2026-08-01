import { z } from "zod";

import {
  firstQuestionSchema,
  knowledgeMapSchema,
} from "@/domain/knowledge-map/contracts";
import { diagnosticReducer, createNodeSession } from "@/domain/diagnostic/reducer";
import { TASK_STATUSES } from "@/domain/types";
import type { VeritasDatabase } from "@/storage/database";
import type {
  DeletedTaskSnapshot,
  StoredTask,
  StoredUiState,
  StoredWorkspaceState,
} from "@/storage/types";

const storedTaskSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(80),
  fileName: z.string().trim().min(1).max(255),
  materialId: z.uuid(),
  status: z.enum(TASK_STATUSES),
  currentNodeId: z.string().min(1).nullable(),
  isPinned: z.boolean(),
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
    listTasks(query = "") {
      return run(async () => {
        const tasks = (await database.tasks.toArray()).map(parseTask);
        const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
        const matches = normalizedQuery
          ? tasks.filter((task) =>
              `${task.title}\n${task.fileName}`
                .toLocaleLowerCase("zh-CN")
                .includes(normalizedQuery),
            )
          : tasks;
        return sortTasks(matches);
      });
    },

    saveTask(task: StoredTask) {
      return run(async () => {
        const validTask = parseTask(task);
        await database.tasks.put(validTask);
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
    ) {
      return run(async () => {
        const task = await getExistingTask(taskId);
        const material = await database.materials.get(taskId);
        const knowledgeMap = knowledgeMapSchema.safeParse(mapValue);
        const firstQuestion = firstQuestionSchema.safeParse(questionValue);
        if (
          task.status !== "PROCESSING" ||
          !material ||
          !parsedText.trim() ||
          parsedText.length > 300_000 ||
          !knowledgeMap.success ||
          !firstQuestion.success
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
              ...knowledgeMap.data,
            });
            await database.sessions.put({
              taskId,
              nodeId: firstNode.id,
              session,
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
        return { task, material, session, messages };
      });
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
