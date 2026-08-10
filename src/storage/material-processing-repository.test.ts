import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import { createVeritasDatabase } from "./database";
import { createTaskRepository } from "./task-repository";

const databaseNames: string[] = [];

function setup() {
  const name = `veritas-material-${crypto.randomUUID()}`;
  databaseNames.push(name);
  const database = createVeritasDatabase(name);
  return { database, repository: createTaskRepository(database) };
}

const source = { label: "第 1 段", excerpt: "太阳驱动蒸发。" };
const knowledgeMap = {
  modules: [{ id: "module-1", title: "自然水循环", sourceRange: "第 1 段" }],
  knowledgeItems: [
    {
      id: "item-1",
      moduleId: "module-1",
      title: "循环动力",
      summary: "太阳能驱动蒸发。",
      kind: "CORE" as const,
      diagnosticRationale: "基础机制",
      sourceReferences: [source],
      commonMisconceptions: [],
    },
  ],
  nodes: [
    {
      id: "node-1",
      moduleId: "module-1",
      title: "循环动力",
      objective: "解释循环动力。",
      knowledgeItemIds: ["item-1"],
      sourceReferences: [source],
      canonicalUnderstanding: "太阳能驱动蒸发。",
      commonMisconceptions: [],
      bloomTargets: {
        memory: "说出动力。",
        understanding: "解释作用。",
        application: "判断环节。",
        analysis: "分析关系。",
      },
      order: 1,
    },
  ],
  coverageAssignments: [
    {
      knowledgeItemId: "item-1",
      disposition: "DIAGNOSED_IN_NODE" as const,
      nodeId: "node-1",
    },
  ],
};

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)));
});

describe("材料处理仓储", () => {
  it("选择文件后立即原子创建处理中任务、原始材料和当前工作区", async () => {
    const { database, repository } = setup();
    const file = new File(["# 水循环"], "water-cycle.md", {
      type: "text/markdown",
    });

    const task = await repository.createProcessingTask(file);

    expect(task).toMatchObject({
      title: "water-cycle",
      fileName: "water-cycle.md",
      status: "PROCESSING",
      currentNodeId: null,
    });
    await expect(database.materials.get(task.id)).resolves.toMatchObject({
      taskId: task.id,
      materialId: task.materialId,
      parsedText: null,
      sizeBytes: file.size,
    });
    await expect(repository.getWorkspaceState()).resolves.toMatchObject({
      activeTaskId: task.id,
    });
    database.close();
  });

  it("一次事务保存知识地图、首问、活动诊断会话和选中主题", async () => {
    const { database, repository } = setup();
    const task = await repository.createProcessingTask(
      new File(["材料"], "notes.txt", { type: "text/plain" }),
    );

    await repository.completeTextProcessing(task.id, "材料", knowledgeMap, {
      opening: "这份材料真正值得抓的是循环动力。",
      question: "水循环最基本的动力来源是什么？",
    });
    const learning = await repository.getTaskLearningData(task.id);

    expect(learning.task).toMatchObject({
      status: "IN_PROGRESS",
      currentNodeId: "node-1",
    });
    expect(learning.material).toMatchObject({
      parsedText: "材料",
      nodes: knowledgeMap.nodes,
    });
    expect(learning.session?.session.stages.MEMORY).toMatchObject({
      status: "ACTIVE",
      mainQuestion: "水循环最基本的动力来源是什么？",
    });
    expect(learning.messages).toHaveLength(1);
    expect(learning.messages[0]).toMatchObject({
      role: "ASSISTANT",
      content: "这份材料真正值得抓的是循环动力。\n\n水循环最基本的动力来源是什么？",
    });
    await expect(database.uiStates.get(task.id)).resolves.toMatchObject({
      selectedNodeId: "node-1",
    });
    database.close();
  });

  it("处理失败后保留任务与原始文件并保存普通中文原因", async () => {
    const { database, repository } = setup();
    const task = await repository.createProcessingTask(
      new File(["材料"], "notes.txt", { type: "text/plain" }),
    );

    await repository.failTaskProcessing(task.id, "模型服务暂时不可用，请重试。");

    await expect(repository.listTasks()).resolves.toEqual([
      expect.objectContaining({
        id: task.id,
        status: "FAILED",
        failureReason: "模型服务暂时不可用，请重试。",
      }),
    ]);
    await expect(database.materials.get(task.id)).resolves.toBeDefined();
    database.close();
  });
});
