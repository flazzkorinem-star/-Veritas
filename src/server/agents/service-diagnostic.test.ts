import { describe, expect, it, vi } from "vitest";

import { runAgentOperation } from "./service";

const source = { label: "第 1 节，第 1 段", excerpt: "太阳驱动蒸发。" };
const knowledgeItems = [
  {
    id: "item-1",
    moduleId: "module-1",
    title: "循环动力",
    summary: "太阳能驱动蒸发。",
    kind: "CORE" as const,
    diagnosticRationale: "这是理解循环机制的基础。",
    sourceReferences: [source],
    commonMisconceptions: [],
  },
];
const node = {
  id: "node-1",
  moduleId: "module-1",
  title: "循环动力",
  objective: "解释太阳能怎样推动循环。",
  knowledgeItemIds: ["item-1"],
  sourceReferences: [source],
  canonicalUnderstanding: "太阳能驱动水蒸发进入大气。",
  commonMisconceptions: [],
  bloomTargets: {
    memory: "说出主要动力。",
    understanding: "解释动力作用。",
    application: "判断具体环节。",
    analysis: "拆解能量与运动关系。",
  },
  order: 1,
};

describe("Agent 2 服务", () => {
  it.each([
    [
      "CREATE_STAGE_QUESTION",
      { stage: "UNDERSTANDING" },
      { question: "这个机制为什么能持续运转？" },
    ],
    [
      "EVALUATE_ANSWER",
      {
        stage: "MEMORY",
        mainQuestion: "主要动力是什么？",
        userAnswer: "太阳能。",
        recentMessages: [],
      },
      {
        classification: "CORRECT",
        isCorrect: true,
        progress: "ADVANCING",
        correctEvidence: ["识别到太阳能"],
        missingPoints: [],
        misconceptions: [],
        teachingMove: "AFFIRM_AND_ADVANCE",
        scaffold: null,
        assistantMessage: "对，你抓住了这个关键驱动力。",
      },
    ],
    [
      "CREATE_HINT",
      {
        stage: "MEMORY",
        mainQuestion: "主要动力是什么？",
        hintLevel: 1,
        recentMessages: [],
      },
      { hintLevel: 1, assistantMessage: "想想水蒸发时需要什么能量来源。" },
    ],
    [
      "CREATE_STAGE_ANSWER",
      {
        stage: "MEMORY",
        mainQuestion: "主要动力是什么？",
        recentMessages: [],
      },
      { assistantMessage: "完整答案是太阳能驱动了水的蒸发。" },
    ],
  ])("%s 关闭思考模式并使用短超时", async (operation, extra, output) => {
    const callModel = vi.fn().mockResolvedValue(output);

    await expect(
      runAgentOperation(
        { operation, input: { node, knowledgeItems, ...extra } },
        "server-key",
        callModel,
      ),
    ).resolves.toEqual(output);

    expect(callModel).toHaveBeenCalledWith(
      expect.objectContaining({ thinking: false, timeoutMs: 30_000 }),
    );
  });

  it("拒绝浏览器夹带分数或下一层", async () => {
    const callModel = vi.fn();

    await expect(
      runAgentOperation(
        {
          operation: "EVALUATE_ANSWER",
          input: {
            node,
            knowledgeItems,
            stage: "MEMORY",
            mainQuestion: "主要动力是什么？",
            userAnswer: "太阳能。",
            recentMessages: [],
            score: 100,
            nextStage: "ANALYSIS",
          },
        },
        "server-key",
        callModel,
      ),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(callModel).not.toHaveBeenCalled();
  });
});
