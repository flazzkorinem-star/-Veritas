import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createVeritasDatabase } from "@/storage/database";
import { createNodeSession } from "@/domain/diagnostic/reducer";
import { LocalStoreError, createTaskRepository } from "@/storage/task-repository";
import type { StoredTask } from "@/storage/types";

const databaseNames: string[] = [];

function databaseName() {
  const name = `veritas-test-${crypto.randomUUID()}`;
  databaseNames.push(name);
  return name;
}

function task(overrides: Partial<StoredTask> = {}): StoredTask {
  return {
    id: crypto.randomUUID(),
    title: "水循环诊断",
    fileName: "water-cycle.md",
    materialId: crypto.randomUUID(),
    status: "READY",
    currentNodeId: null,
    isPinned: false,
    createdAt: "2026-08-01T08:00:00.000Z",
    updatedAt: "2026-08-01T08:00:00.000Z",
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)));
});

describe("本地任务仓储", () => {
  it("从旧版 schema 升级时补齐置顶字段，并保留任务", async () => {
    const name = databaseName();
    const legacy = new Dexie(name);
    legacy.version(1).stores({
      tasks: "&id, title, fileName, updatedAt",
      materials: "&taskId",
      sessions: "[taskId+nodeId], taskId, nodeId",
      messages: "&id, taskId, nodeId, createdAt",
      reports: "&taskId",
    });
    const legacyTask = task();
    const withoutPinned = structuredClone(legacyTask);
    delete (withoutPinned as Partial<StoredTask>).isPinned;
    await legacy.table("tasks").put(withoutPinned);
    legacy.close();

    const database = createVeritasDatabase(name);
    const repository = createTaskRepository(database);

    await expect(repository.listTasks()).resolves.toEqual([
      { ...legacyTask, isPinned: false },
    ]);
    database.close();
  });

  it("按标题或文件名搜索，并把置顶任务排在最近任务前", async () => {
    const database = createVeritasDatabase(databaseName());
    const repository = createTaskRepository(database);
    const recent = task({
      title: "城市降雨",
      fileName: "rain.txt",
      updatedAt: "2026-08-02T08:00:00.000Z",
    });
    const pinned = task({
      title: "旧的水循环",
      fileName: "water.md",
      isPinned: true,
      updatedAt: "2026-08-01T08:00:00.000Z",
    });
    await repository.saveTask(recent);
    await repository.saveTask(pinned);

    await expect(repository.listTasks()).resolves.toEqual([pinned, recent]);
    await expect(repository.listTasks("rain")).resolves.toEqual([recent]);
    await expect(repository.listTasks("水循环")).resolves.toEqual([pinned]);
    database.close();
  });

  it("重命名和置顶后刷新仓储仍能恢复最新状态", async () => {
    const name = databaseName();
    const database = createVeritasDatabase(name);
    const repository = createTaskRepository(database);
    const original = task();
    await repository.saveTask(original);
    await repository.renameTask(original.id, "水循环复习");
    await repository.setTaskPinned(original.id, true);
    database.close();

    const reopened = createVeritasDatabase(name);
    const restored = await createTaskRepository(reopened).listTasks();

    expect(restored[0]).toMatchObject({
      id: original.id,
      title: "水循环复习",
      isPinned: true,
    });
    expect(restored[0]?.updatedAt).not.toBe(original.updatedAt);
    reopened.close();
  });

  it("刷新后恢复当前任务与工作区收起状态", async () => {
    const name = databaseName();
    const database = createVeritasDatabase(name);
    const repository = createTaskRepository(database);
    const storedTask = task();
    await repository.saveTask(storedTask);
    await repository.saveWorkspaceState({
      id: "workspace",
      activeTaskId: storedTask.id,
      workspaceCollapsed: true,
      updatedAt: new Date().toISOString(),
    });
    database.close();

    const reopened = createVeritasDatabase(name);
    await expect(
      createTaskRepository(reopened).getWorkspaceState(),
    ).resolves.toMatchObject({
      activeTaskId: storedTask.id,
      workspaceCollapsed: true,
    });
    reopened.close();
  });

  it("拒绝把不存在的任务设为当前任务", async () => {
    const database = createVeritasDatabase(databaseName());
    const repository = createTaskRepository(database);

    await expect(
      repository.saveWorkspaceState({
        id: "workspace",
        activeTaskId: crypto.randomUUID(),
        workspaceCollapsed: false,
        updatedAt: new Date().toISOString(),
      }),
    ).rejects.toMatchObject({ code: "RELATION_MISMATCH" });
    database.close();
  });

  it("删除任务时事务性删除全部关联数据，并可用短时快照恢复", async () => {
    const database = createVeritasDatabase(databaseName());
    const repository = createTaskRepository(database);
    const storedTask = task();
    await repository.saveTask(storedTask);
    await database.materials.put({
      taskId: storedTask.id,
      materialId: storedTask.materialId,
      fileName: storedTask.fileName,
      mimeType: "text/markdown",
      sizeBytes: 9,
      originalFile: new Blob(["水循环"]),
      parsedText: "水循环",
      modules: [],
      knowledgeItems: [],
      nodes: [],
      coverageAssignments: [],
    });
    await database.sessions.put({
      taskId: storedTask.id,
      nodeId: "node-1",
      session: createNodeSession("node-1"),
    });
    await database.messages.put({
      id: crypto.randomUUID(),
      taskId: storedTask.id,
      nodeId: "node-1",
      role: "USER",
      content: "我的回答",
      createdAt: storedTask.createdAt,
    });
    await database.drafts.put({
      taskId: storedTask.id,
      nodeId: "node-1",
      content: "未发送草稿",
      updatedAt: storedTask.updatedAt,
    });
    await database.reports.put({
      taskId: storedTask.id,
      id: crypto.randomUUID(),
      markdown: "# 报告",
      document: {
        taskId: storedTask.id,
        materialTitle: storedTask.fileName,
        generatedAt: storedTask.createdAt,
        progress: { completed: 1, total: 1 },
        coverage: {
          diagnosed: [],
          undiagnosed: [],
          supporting: [],
          referenceOnly: [],
        },
        summary: "报告摘要",
        nodes: [],
      },
      completedNodeIds: [],
      createdAt: storedTask.createdAt,
      updatedAt: storedTask.updatedAt,
    });
    await database.uiStates.put({
      taskId: storedTask.id,
      selectedNodeId: "node-1",
      mobilePanel: null,
      updatedAt: storedTask.updatedAt,
    });

    const snapshot = await repository.deleteTask(storedTask.id);

    await expect(repository.listTasks()).resolves.toEqual([]);
    await expect(database.materials.count()).resolves.toBe(0);
    await expect(database.sessions.count()).resolves.toBe(0);
    await expect(database.messages.count()).resolves.toBe(0);
    await expect(database.drafts.count()).resolves.toBe(0);
    await expect(database.reports.count()).resolves.toBe(0);
    await expect(database.uiStates.count()).resolves.toBe(0);

    await repository.restoreDeletedTask(snapshot);
    await expect(repository.listTasks()).resolves.toEqual([storedTask]);
    await expect(database.materials.count()).resolves.toBe(1);
    await expect(database.sessions.count()).resolves.toBe(1);
    await expect(database.messages.count()).resolves.toBe(1);
    await expect(database.drafts.count()).resolves.toBe(1);
    await expect(database.reports.count()).resolves.toBe(1);
    await expect(database.uiStates.count()).resolves.toBe(1);
    database.close();
  });

  it("拒绝为不存在的任务保存 UI 状态", async () => {
    const database = createVeritasDatabase(databaseName());
    const repository = createTaskRepository(database);

    await expect(
      repository.saveUiState({
        taskId: crypto.randomUUID(),
        selectedNodeId: null,
        mobilePanel: "TASKS",
        updatedAt: new Date().toISOString(),
      }),
    ).rejects.toMatchObject({ code: "RELATION_MISMATCH" });
    database.close();
  });

  it("把损坏记录转换为稳定的本地数据错误", async () => {
    const database = createVeritasDatabase(databaseName());
    await database.tasks.put({ ...task(), title: "" });
    const repository = createTaskRepository(database);

    await expect(repository.listTasks()).rejects.toEqual(
      expect.objectContaining<Partial<LocalStoreError>>({
        code: "CORRUPT_RECORD",
        message: "本地任务数据已损坏，请删除该任务后重新导入材料。",
      }),
    );
    database.close();
  });

  it("把存储配额耗尽转换为可恢复的稳定错误", async () => {
    const database = createVeritasDatabase(databaseName());
    const repository = createTaskRepository(database);
    vi.spyOn(database.tasks, "put").mockRejectedValueOnce(
      new DOMException("内部配额细节", "QuotaExceededError"),
    );

    await expect(repository.saveTask(task())).rejects.toEqual(
      expect.objectContaining<Partial<LocalStoreError>>({
        code: "QUOTA_EXCEEDED",
        message: "浏览器存储空间不足，请清理空间后重试。",
      }),
    );
    database.close();
  });
});
