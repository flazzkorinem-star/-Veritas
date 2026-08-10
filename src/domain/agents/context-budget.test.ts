import { describe, expect, it } from "vitest";

import {
  buildBudgetedMaterialRequest,
  buildBudgetedRecentRequest,
  jsonBytes,
  type AgentMaterialContext,
  type AgentRecentMessage,
} from "./context-budget";

const source = { label: "第 1 段", excerpt: "来源摘录" };

function item(index: number) {
  return {
    id: `item-${index}`,
    moduleId: `module-${index}`,
    title: `知识条目 ${index}`,
    summary: `摘要 ${index}：${"长摘要".repeat(400)}`,
    kind: "CORE" as const,
    diagnosticRationale: "用于测试当前主题完整内容。",
    sourceReferences: [source],
    commonMisconceptions: [],
  };
}

describe("Agent 2 整体请求字节预算", () => {
  it("保留当前主题和最新消息，并按目录、摘要顺序确定性裁剪", () => {
    const modules = Array.from({ length: 80 }, (_, index) => ({
      id: `module-${index + 1}`,
      title: `材料模块 ${index + 1}`,
      sourceRange: `第 ${index + 1} 段`,
    }));
    const knowledgeItems = Array.from({ length: 80 }, (_, index) => item(index + 1));
    const recentMessages = Array.from({ length: 20 }, (_, index) => ({
      role: index % 2 === 0 ? ("USER" as const) : ("ASSISTANT" as const),
      content: `历史消息 ${index + 1}：${"内容".repeat(500)}`,
    }));
    const currentItem = knowledgeItems[0]!;
    const createRequest = (
      materialContext: AgentMaterialContext,
      messages: AgentRecentMessage[],
    ) => ({
      operation: "RESPOND_TO_USER",
      input: {
        node: { id: "current-node", objective: "当前主题完整内容不能被裁剪。" },
        knowledgeItems: [currentItem],
        userMessage: "这是本轮用户消息。",
        diagnostic: { status: "ACTIVE", mainQuestion: "当前主问题" },
        materialContext,
        recentMessages: messages,
      },
    });

    const request = buildBudgetedMaterialRequest({
      materialTitle: "大型材料",
      modules,
      knowledgeItems,
      currentKnowledgeItemIds: new Set([currentItem.id]),
      recentMessages,
      createRequest,
      maxRequestBytes: 60_000,
      maxRecentBytes: 12_000,
    });
    const repeated = buildBudgetedMaterialRequest({
      materialTitle: "大型材料",
      modules,
      knowledgeItems,
      currentKnowledgeItemIds: new Set([currentItem.id]),
      recentMessages,
      createRequest,
      maxRequestBytes: 60_000,
      maxRecentBytes: 12_000,
    });

    expect(jsonBytes(request)).toBeLessThanOrEqual(60_000);
    expect(request).toEqual(repeated);
    expect(request.input.node).toEqual(
      expect.objectContaining({ objective: "当前主题完整内容不能被裁剪。" }),
    );
    expect(request.input.knowledgeItems).toEqual([currentItem]);
    expect(request.input.recentMessages.at(-1)).toEqual(recentMessages.at(-1));
    expect(
      request.input.recentMessages.map((message) => recentMessages.indexOf(message)),
    ).toEqual(
      request.input.recentMessages
        .map((message) => recentMessages.indexOf(message))
        .toSorted((left, right) => left - right),
    );
    expect(request.input.materialContext.modules[0]).toEqual({
      id: "module-1",
      title: "材料模块 1",
    });
    expect(request.input.materialContext.itemIndex[0]).toEqual({
      id: "item-1",
      title: "知识条目 1",
      kind: "CORE",
    });
    if (request.input.materialContext.itemIndex.length < knowledgeItems.length) {
      expect(
        request.input.materialContext.itemIndex.every(
          (entry) => entry.summary === undefined,
        ),
      ).toBe(true);
    }
  });

  it("提示请求也从最新消息向前取舍，并计算整个请求的 JSON 字节", () => {
    const recentMessages = Array.from({ length: 10 }, (_, index) => ({
      role: index % 2 === 0 ? ("USER" as const) : ("ASSISTANT" as const),
      content: `消息 ${index + 1}：${"很长".repeat(300)}`,
    }));
    const request = buildBudgetedRecentRequest({
      recentMessages,
      maxRequestBytes: 8_000,
      maxRecentBytes: 4_000,
      createRequest: (messages) => ({
        operation: "CREATE_HINT",
        input: {
          node: { id: "node-1" },
          knowledgeItems: [item(1)],
          mainQuestion: "当前问题",
          recentMessages: messages,
        },
      }),
    });

    expect(jsonBytes(request)).toBeLessThanOrEqual(8_000);
    expect(request.input.recentMessages.at(-1)).toEqual(recentMessages.at(-1));
    expect(request.input.recentMessages[0]).not.toEqual(recentMessages[0]);
  });
});
