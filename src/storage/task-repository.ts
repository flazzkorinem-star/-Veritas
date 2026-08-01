import { z } from "zod";

import { TASK_STATUSES } from "@/domain/types";
import type { VeritasDatabase } from "@/storage/database";
import type { DeletedTaskSnapshot, StoredTask, StoredUiState } from "@/storage/types";

const storedTaskSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(80),
  fileName: z.string().trim().min(1).max(255),
  materialId: z.uuid(),
  status: z.enum(TASK_STATUSES),
  currentNodeId: z.string().min(1).nullable(),
  isPinned: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const uiStateSchema = z.object({
  taskId: z.uuid(),
  selectedNodeId: z.string().min(1).nullable(),
  mobilePanel: z.enum(["TASKS", "TOPICS", "DIAGNOSTIC"]).nullable(),
  updatedAt: z.string().datetime(),
});

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
          ],
          async () => {
            const snapshot: DeletedTaskSnapshot = {
              task: await getExistingTask(taskId),
              material: await database.materials.get(taskId),
              sessions: await database.sessions.where("taskId").equals(taskId).toArray(),
              messages: await database.messages.where("taskId").equals(taskId).toArray(),
              drafts: await database.drafts.where("taskId").equals(taskId).toArray(),
              report: await database.reports.get(taskId),
              uiState: await database.uiStates.get(taskId),
            };

            await database.tasks.delete(taskId);
            await database.materials.delete(taskId);
            await database.sessions.where("taskId").equals(taskId).delete();
            await database.messages.where("taskId").equals(taskId).delete();
            await database.drafts.where("taskId").equals(taskId).delete();
            await database.reports.delete(taskId);
            await database.uiStates.delete(taskId);
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
          },
        ),
      );
    },
  };
}
