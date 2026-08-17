import { expect, test, type APIRequestContext } from "@playwright/test";

async function createReport(request: APIRequestContext) {
  return request.post("/api/agents", {
    data: {
      operation: "CREATE_REPORT",
      input: {
        materialTitle: "光合作用讲义.md",
        learningGoal: "理解光合作用的能量转化",
        completedNodes: [
          {
            nodeId: "node-1",
            title: "光合作用的能量转化",
            canonicalUnderstanding: "光合作用把光能转化为有机物中的化学能。",
            commonMisconceptions: ["植物把光能直接变成氧气"],
            score: 75,
            stages: {
              MEMORY: {
                status: "PASSED",
                mainQuestion: "光合作用储存什么能量？",
                verificationQuestion: null,
                answerOrigin: "NONE",
                hintLevel: 0,
              },
              UNDERSTANDING: {
                status: "PASSED_WITH_HINT",
                mainQuestion: "能量如何转化？",
                verificationQuestion: null,
                answerOrigin: "NONE",
                hintLevel: 1,
              },
              APPLICATION: {
                status: "PASSED_WITH_ANSWER",
                mainQuestion: "弱光下会怎样？",
                verificationQuestion: null,
                answerOrigin: "REQUESTED",
                hintLevel: 0,
              },
              ANALYSIS: {
                status: "PASSED",
                mainQuestion: "如何区分能量和产物？",
                verificationQuestion: null,
                answerOrigin: "NONE",
                hintLevel: 0,
              },
            },
            messages: [
              {
                id: "message-1",
                role: "USER",
                content: "植物把光能转成储存在葡萄糖里的化学能。",
              },
              { id: "message-2", role: "USER", content: "光能先被吸收，再转成化学能。" },
              { id: "message-3", role: "USER", content: "我想直接看弱光情境的答案。" },
              {
                id: "message-4",
                role: "USER",
                content: "氧气是产物，不是光能转化后的能量形式。",
              },
            ],
            scaffoldEvents: [
              {
                id: "scaffold-1",
                stage: "UNDERSTANDING",
                type: "ANALOGY",
                reason: "用充电类比能量储存",
              },
            ],
            sourceReferences: [
              { label: "第 1 段", excerpt: "光能转化为有机物中的化学能。" },
            ],
          },
        ],
      },
    },
  });
}

test("真实 Agent 3 生成忠实且不越权的报告结构", async ({ request }, testInfo) => {
  test.skip(
    process.env.VERITAS_REAL_DEEPSEEK !== "1" ||
      testInfo.project.name !== "desktop-edge",
    "仅在显式启用时调用本地服务端配置的真实 DeepSeek。",
  );
  test.setTimeout(180_000);

  const response = await createReport(request);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { result: Record<string, unknown> };
  const serialized = JSON.stringify(body.result);
  expect(body.result).toHaveProperty("summary");
  expect(body.result).toHaveProperty("nodeInsights");
  expect(serialized).toContain("message-1");
  expect(serialized).not.toContain("score");
  expect(serialized).not.toContain("taskStatus");
  expect(serialized).not.toContain("system");
});
