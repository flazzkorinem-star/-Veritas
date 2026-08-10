import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";

import { diagnosticReducer } from "@/domain/diagnostic/reducer";
import { STAGE_ORDER } from "@/domain/types";

import { createVeritasDatabase } from "./database";
import { createTaskRepository } from "./task-repository";

const names: string[] = [];
const source = { label: "第 1 段", excerpt: "太阳能驱动蒸发。" };
const item = {
  id: "item-1",
  moduleId: "module-1",
  title: "循环动力",
  summary: "太阳能驱动蒸发。",
  kind: "CORE" as const,
  diagnosticRationale: "基础机制",
  sourceReferences: [source],
  commonMisconceptions: [],
};
const node = {
  id: "node-1",
  moduleId: "module-1",
  title: "循环动力",
  objective: "解释循环动力。",
  knowledgeItemIds: [item.id],
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
};
const secondNode = {
  ...node,
  id: "node-2",
  title: "降水回流",
  objective: "解释降水回流。",
  order: 2,
};
const map = {
  modules: [{ id: "module-1", title: "水循环", sourceRange: "第 1 段" }],
  knowledgeItems: [item],
  nodes: [node, secondNode],
  coverageAssignments: [
    {
      knowledgeItemId: item.id,
      disposition: "DIAGNOSED_IN_NODE" as const,
      nodeId: node.id,
    },
  ],
};

async function setup() {
  const name = `veritas-diagnostic-${crypto.randomUUID()}`;
  names.push(name);
  const database = createVeritasDatabase(name);
  const repository = createTaskRepository(database);
  const task = await repository.createProcessingTask(
    new File(["材料"], "notes.txt", { type: "text/plain" }),
  );
  await repository.completeTextProcessing(task.id, "材料", map, {
    opening: "这份材料真正值得抓的是循环动力。",
    question: "主要动力是什么？",
  });
  const learning = await repository.getTaskLearningData(task.id);
  await repository.saveConversationTurn({
    taskId: task.id,
    nodeId: node.id,
    session: learning.session!.session,
    userMessage: "我的目标是检验自己是否真正理解水循环。",
    assistantMessages: ["明白，我会关注你能不能解释和使用这些概念。"],
    scaffold: null,
    learningGoalUpdate: "检验自己是否理解水循环",
  });
  return { database, repository, task };
}

afterEach(async () => {
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)));
});

describe("诊断会话仓储", () => {
  it("事务性保存用户回答、家教回复、会话和主动支架", async () => {
    const { database, repository, task } = await setup();
    const learning = await repository.getTaskLearningData(task.id);
    const session = diagnosticReducer(learning.session!.session, {
      type: "ANSWER_EVALUATED",
      outcome: { classification: "PARTIAL", isCorrect: false, progress: "ADVANCING" },
    });

    await repository.saveConversationTurn({
      taskId: task.id,
      nodeId: node.id,
      session,
      userMessage: "需要能量。",
      assistantMessages: ["方向对了，能量具体来自哪里？"],
      scaffold: { stage: "MEMORY", type: "CLARIFICATION", reason: "补足来源" },
      learningGoalUpdate: null,
    });

    const restored = await repository.getTaskLearningData(task.id);
    expect(restored.messages.map((message) => message.content)).toEqual([
      "这份材料真正值得抓的是循环动力。\n\n主要动力是什么？",
      "我的目标是检验自己是否真正理解水循环。",
      "明白，我会关注你能不能解释和使用这些概念。",
      "需要能量。",
      "方向对了，能量具体来自哪里？",
    ]);
    expect(restored.session?.session).toEqual(session);
    expect(restored.task.learningGoal).toBe("检验自己是否理解水循环");
    expect(restored.session?.scaffoldEvents).toEqual([
      expect.objectContaining({
        stage: "MEMORY",
        type: "CLARIFICATION",
        reason: "补足来源",
      }),
    ]);
    database.close();
  });

  it("切换节点时保存各自独立会话、消息和草稿", async () => {
    const { database, repository, task } = await setup();
    await repository.saveDraft(task.id, node.id, "第一个节点的草稿");
    await repository.openNode(task.id, secondNode.id, {
      opening: "这个主题真正值得抓的是降水回流。",
      question: "降水主要通过什么作用回到地表？",
    });
    await repository.saveDraft(task.id, secondNode.id, "第二个节点的草稿");

    let learning = await repository.getTaskLearningData(task.id);
    expect(learning.task.currentNodeId).toBe(secondNode.id);
    expect(learning.messages.map((message) => message.content)).toEqual([
      "这个主题真正值得抓的是降水回流。\n\n降水主要通过什么作用回到地表？",
    ]);
    expect(learning.draft?.content).toBe("第二个节点的草稿");

    await repository.openNode(task.id, node.id);
    learning = await repository.getTaskLearningData(task.id);
    expect(learning.session?.session.stages.MEMORY.mainQuestion).toBe("主要动力是什么？");
    expect(learning.draft?.content).toBe("第一个节点的草稿");
    expect(learning.sessions).toHaveLength(2);
    database.close();
  });

  it("拒绝把其他节点的会话写入当前节点", async () => {
    const { database, repository, task } = await setup();
    const learning = await repository.getTaskLearningData(task.id);

    await expect(
      repository.saveConversationTurn({
        taskId: task.id,
        nodeId: secondNode.id,
        session: learning.session!.session,
        userMessage: "回答",
        assistantMessages: ["反馈"],
        scaffold: null,
        learningGoalUpdate: null,
      }),
    ).rejects.toMatchObject({ code: "RELATION_MISMATCH" });
    database.close();
  });

  it("全部节点诊断完成后仍等待最终报告再完成任务", async () => {
    const { database, repository, task } = await setup();
    const complete = (initial: Awaited<ReturnType<typeof repository.openNode>>) => {
      let session = initial.session;
      for (const stage of STAGE_ORDER) {
        if (session.stages[stage].status === "LOCKED") {
          session = diagnosticReducer(session, {
            type: "START_STAGE",
            question: `${stage} 的问题`,
          });
        }
        session = diagnosticReducer(session, {
          type: "ANSWER_EVALUATED",
          outcome: { classification: "CORRECT", isCorrect: true, progress: "ADVANCING" },
        });
      }
      return session;
    };
    const first = await repository.openNode(task.id, node.id);
    await repository.saveConversationTurn({
      taskId: task.id,
      nodeId: node.id,
      session: complete(first),
      userMessage: "完成第一个主题",
      assistantMessages: ["第一个主题完成。"],
      scaffold: null,
      learningGoalUpdate: null,
    });
    expect((await repository.getTaskLearningData(task.id)).task.status).toBe(
      "IN_PROGRESS",
    );

    const second = await repository.openNode(
      task.id,
      secondNode.id,
      {
        opening: "接下来看看降水回流。",
        question: "降水怎样回到地表？",
      },
    );
    await repository.saveConversationTurn({
      taskId: task.id,
      nodeId: secondNode.id,
      session: complete(second),
      userMessage: "完成第二个主题",
      assistantMessages: ["全部主题完成。"],
      scaffold: null,
      learningGoalUpdate: null,
    });

    expect((await repository.getTaskLearningData(task.id)).task.status).toBe(
      "IN_PROGRESS",
    );
    database.close();
  });
});
