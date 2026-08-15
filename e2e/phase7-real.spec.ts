import { expect, test, type APIRequestContext } from "@playwright/test";

const source = { label: "第 1 段", excerpt: "光合作用把光能转化为化学能。" };
const knowledgeItems = [
  {
    id: "item-1",
    moduleId: "module-1",
    title: "光合作用的能量转化",
    summary: "植物通过光合作用把光能转化并储存在有机物的化学能中。",
    kind: "CORE",
    diagnosticRationale: "这是理解光合作用功能的核心。",
    sourceReferences: [source],
    commonMisconceptions: ["植物直接把光能变成氧气"],
  },
];
const node = {
  id: "node-1",
  moduleId: "module-1",
  title: "能量转化",
  objective: "解释光合作用中的能量转化。",
  knowledgeItemIds: ["item-1"],
  sourceReferences: [source],
  canonicalUnderstanding: "光合作用把光能转化为储存在有机物中的化学能。",
  commonMisconceptions: ["植物直接把光能变成氧气"],
  bloomTargets: {
    memory: "说出能量转化的起点和终点。",
    understanding: "解释能量怎样被储存。",
    application: "判断具体情境中的能量变化。",
    analysis: "分析条件变化对能量转化的影响。",
  },
  order: 1,
};

async function operation(request: APIRequestContext, value: unknown) {
  const response = await request.post("/api/agents", { data: value });
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { result: Record<string, unknown> };
  expect(body.result).not.toHaveProperty("score");
  expect(body.result).not.toHaveProperty("nextStage");
  return body.result;
}

test("真实 Agent 2 返回可用且不越权的教学结果", async ({ request }, testInfo) => {
  test.skip(
    process.env.RUN_REAL_DEEPSEEK !== "1" || testInfo.project.name !== "desktop-edge",
    "仅在显式启用时调用本地服务端配置的真实 DeepSeek。",
  );
  test.setTimeout(240_000);

  const turnContext = {
    node,
    knowledgeItems,
    materialContext: {
      title: "光合作用",
      modules: [{ id: "module-1", title: "光合作用" }],
      itemIndex: [{ id: "item-1", title: "光合作用的能量转化", kind: "CORE" }],
    },
    learningGoal: "检验对光合作用能量转化的理解",
    diagnostic: {
      status: "ACTIVE",
      stage: "MEMORY",
      mainQuestion: "光合作用把光能转化成了什么形式的能量？",
    },
    recentMessages: [],
  } as const;

  const conversation = await operation(request, {
    operation: "RESPOND_TO_USER",
    input: {
      ...turnContext,
      userMessage: "先不答题，解释一下为什么这里强调能量转化。",
    },
  });
  expect(conversation.responseMode).toBe("CONVERSATION");
  expect(String(conversation.assistantMessage).length).toBeGreaterThan(20);

  const semanticHint = await operation(request, {
    operation: "RESPOND_TO_USER",
    input: {
      ...turnContext,
      userMessage: "给我一点方向，但先别把答案说出来。",
    },
  });
  expect(semanticHint.responseMode).toBe("REQUEST_HINT");

  const semanticAnswer = await operation(request, {
    operation: "RESPOND_TO_USER",
    input: {
      ...turnContext,
      userMessage: "这题我想直接看完整答案。",
    },
  });
  expect(semanticAnswer.responseMode).toBe("REVEAL_ANSWER");

  const question = await operation(request, {
    operation: "CREATE_STAGE_QUESTION",
    input: { node, knowledgeItems, learningGoal: null, stage: "MEMORY" },
  });
  expect(question.question).toEqual(expect.any(String));

  const evaluation = await operation(request, {
    operation: "RESPOND_TO_USER",
    input: {
      ...turnContext,
      diagnostic: {
        status: "ACTIVE",
        stage: "MEMORY",
        mainQuestion: question.question,
      },
      userMessage: "光能会转化成储存在葡萄糖等有机物里的化学能。",
      recentMessages: [],
    },
  });
  expect(evaluation.classification).toBe("CORRECT");
  expect(evaluation.isCorrect).toBe(true);
  expect(evaluation.progress).toBe("ADVANCING");
  expect(evaluation.assistantMessage).toEqual(expect.any(String));

  const hint = await operation(request, {
    operation: "CREATE_HINT",
    input: {
      node,
      knowledgeItems,
      learningGoal: null,
      stage: "UNDERSTANDING",
      mainQuestion: "植物怎样把获得的光能保存下来？",
      hintLevel: 2,
      recentMessages: [],
    },
  });
  expect(hint.hintLevel).toBe(2);
  expect(String(hint.assistantMessage).length).toBeGreaterThan(8);

  const answer = await operation(request, {
    operation: "CREATE_STAGE_ANSWER",
    input: {
      node,
      knowledgeItems,
      learningGoal: null,
      stage: "UNDERSTANDING",
      mainQuestion: "植物怎样把获得的光能保存下来？",
      recentMessages: [],
    },
  });
  expect(String(answer.assistantMessage).length).toBeGreaterThan(20);
});
