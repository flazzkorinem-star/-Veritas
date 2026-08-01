import { describe, expect, it, vi } from "vitest";

import { processTextMaterial } from "./process-text-material";

const source = { label: "第 1 段", excerpt: "太阳驱动蒸发。" };
const extraction = {
  modules: [{ id: "module-1", title: "模块", sourceRange: "第 1 段" }],
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
};
const map = {
  ...extraction,
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

describe("文本材料处理编排", () => {
  it("依次完成读取、分块提取、覆盖审计和首问生成", async () => {
    const callAgent = vi
      .fn()
      .mockResolvedValueOnce(extraction)
      .mockResolvedValueOnce(map)
      .mockResolvedValueOnce({ opening: "从水的去向看。", question: "动力是什么？" });
    const onProgress = vi.fn();
    const file = new File(["# 水循环\n\n太阳驱动蒸发。"], "water.md", {
      type: "text/markdown",
    });

    const result = await processTextMaterial(file, onProgress, {
      callAgent: callAgent as never,
      now: () => 100,
    });

    expect(result).toMatchObject({
      parsedText: "# 水循环\n\n太阳驱动蒸发。",
      knowledgeMap: map,
      firstQuestion: { opening: "从水的去向看。", question: "动力是什么？" },
    });
    expect(callAgent.mock.calls.map(([request]) => request.operation)).toEqual([
      "EXTRACT_KNOWLEDGE",
      "AUDIT_KNOWLEDGE_MAP",
      "CREATE_FIRST_QUESTION",
    ]);
    expect(onProgress.mock.calls.map(([progress]) => progress.stage)).toContain(
      "READING",
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "AUDITING", startedAt: 100 }),
    );
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ stage: "PREPARING_QUESTION", startedAt: 100 }),
    );
  });

  it("没有可靠主题时停止，不凭空生成问题", async () => {
    const callAgent = vi
      .fn()
      .mockResolvedValueOnce(extraction)
      .mockResolvedValueOnce({ ...map, nodes: [] });
    const file = new File(["材料"], "notes.txt", { type: "text/plain" });

    await expect(
      processTextMaterial(file, vi.fn(), { callAgent: callAgent as never }),
    ).rejects.toMatchObject({ code: "NO_RELIABLE_NODE" });
    expect(callAgent).toHaveBeenCalledTimes(2);
  });
});
