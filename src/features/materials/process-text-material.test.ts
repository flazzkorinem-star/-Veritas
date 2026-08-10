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
  it("依次完成读取、分块提取、覆盖审计和有意义的首问生成", async () => {
    const callAgent = vi
      .fn()
      .mockResolvedValueOnce(extraction)
      .mockResolvedValueOnce(map)
      .mockResolvedValueOnce({
        opening: "这份材料真正值得抓的是水循环的动力机制。",
        question: "水循环最基本的动力来源是什么？",
      });
    const onProgress = vi.fn();
    const controller = new AbortController();
    const file = new File(["# 水循环\n\n太阳驱动蒸发。"], "water.md", {
      type: "text/markdown",
    });

    const result = await processTextMaterial(file, onProgress, {
      callAgent: callAgent as never,
      now: () => 100,
      signal: controller.signal,
    });

    expect(result).toMatchObject({
      parsedText: "# 水循环\n\n太阳驱动蒸发。",
      knowledgeMap: map,
      firstQuestion: {
        opening: "这份材料真正值得抓的是水循环的动力机制。",
        question: "水循环最基本的动力来源是什么？",
      },
    });
    expect(callAgent.mock.calls.map(([request]) => request.operation)).toEqual([
      "EXTRACT_KNOWLEDGE",
      "AUDIT_KNOWLEDGE_MAP",
      "CREATE_FIRST_QUESTION",
    ]);
    const agentSignals = callAgent.mock.calls.map(
      ([, dependencies]) => dependencies?.signal,
    );
    controller.abort();
    expect(agentSignals.every((signal) => signal?.aborted)).toBe(true);
    expect(onProgress.mock.calls.map(([progress]) => progress.stage)).toContain(
      "READING",
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "AUDITING", startedAt: 100 }),
    );
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ stage: "PREPARING_CONTEXT", startedAt: 100 }),
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

  it("最多并行提取两个分块，并保持审计输入顺序", async () => {
    let activeExtractions = 0;
    let maxActiveExtractions = 0;
    const callAgent = vi.fn(async (request: { operation: string; input: unknown }) => {
      if (request.operation === "EXTRACT_KNOWLEDGE") {
        activeExtractions += 1;
        maxActiveExtractions = Math.max(maxActiveExtractions, activeExtractions);
        await Promise.resolve();
        activeExtractions -= 1;
        return extraction;
      }
      if (request.operation === "AUDIT_KNOWLEDGE_MAP") return map;
      return { assistantMessage: "这份材料有一个核心主题。" };
    });
    const blocks = Array.from({ length: 4 }, (_, index) => ({
      sourceLabel: `第 ${index + 1} 部分`,
      text: String(index + 1).repeat(15_000),
    }));

    await processTextMaterial(new File(["材料"], "notes.txt"), vi.fn(), {
      callAgent: callAgent as never,
      parseMaterial: vi.fn().mockResolvedValue({
        fileName: "notes.txt",
        mimeType: "text/plain",
        text: blocks.map((block) => block.text).join("\n\n"),
        sourceBlocks: blocks,
      }) as never,
    });

    expect(maxActiveExtractions).toBe(2);
    const auditRequest = callAgent.mock.calls.find(
      ([request]) => request.operation === "AUDIT_KNOWLEDGE_MAP",
    )?.[0] as { input: { chunks: Array<{ chunkId: string }> } } | undefined;
    expect(auditRequest?.input.chunks.map(({ chunkId }) => chunkId)).toEqual([
      "chunk-1",
      "chunk-2",
      "chunk-3",
      "chunk-4",
    ]);
  });

  it("只按实际完成的分块数量上报提取进度", async () => {
    const pending = new Map<string, (value: typeof extraction) => void>();
    const callAgent = vi.fn(
      (request: { operation: string; input: { chunkId?: string } }) => {
        if (request.operation === "EXTRACT_KNOWLEDGE") {
          return new Promise((resolve) => {
            pending.set(request.input.chunkId!, resolve);
          });
        }
        if (request.operation === "AUDIT_KNOWLEDGE_MAP") return Promise.resolve(map);
        return Promise.resolve({
          assistantMessage: "这份材料有一个核心主题。",
        });
      },
    );
    const onProgress = vi.fn();
    const processing = processTextMaterial(new File(["材料"], "notes.txt"), onProgress, {
      callAgent: callAgent as never,
      parseMaterial: vi.fn().mockResolvedValue({
        fileName: "notes.txt",
        mimeType: "text/plain",
        text: "第一部分\n\n第二部分",
        sourceBlocks: [
          { sourceLabel: "第一部分", text: "一".repeat(15_000) },
          { sourceLabel: "第二部分", text: "二".repeat(15_000) },
        ],
      }) as never,
    });

    await vi.waitFor(() => expect(pending.size).toBe(2));
    const completedCounts = () =>
      onProgress.mock.calls
        .map(([progress]) => progress)
        .filter((progress) => progress.stage === "EXTRACTING")
        .map((progress) => progress.currentChunk);
    expect(completedCounts()).toEqual([0]);

    pending.get("chunk-2")!(extraction);
    await vi.waitFor(() => expect(completedCounts()).toEqual([0, 1]));
    pending.get("chunk-1")!(extraction);
    await processing;

    expect(completedCounts()).toEqual([0, 1, 2]);
  });

  it("模型处理超过总预算后中止当前请求", async () => {
    const callAgent = vi.fn(
      (_request, dependencies) =>
        new Promise((_, reject) => {
          dependencies?.signal?.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true },
          );
        }),
    );
    const processing = processTextMaterial(
      new File(["材料"], "notes.txt", { type: "text/plain" }),
      vi.fn(),
      { callAgent: callAgent as never, modelTimeoutMs: 5 },
    );

    await expect(
      Promise.race([
        processing,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("测试等待超时")), 100),
        ),
      ]),
    ).rejects.toMatchObject({ code: "MODEL_PROCESSING_TIMEOUT" });
  });

  it("整份材料超过总预算后中止解析", async () => {
    const parseMaterial = vi.fn(
      (_file, _onProgress, signal: AbortSignal) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
    );
    const processing = processTextMaterial(new File(["材料"], "notes.txt"), vi.fn(), {
      parseMaterial: parseMaterial as never,
      totalTimeoutMs: 5,
    });

    await expect(
      Promise.race([
        processing,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("测试等待超时")), 100),
        ),
      ]),
    ).rejects.toMatchObject({ code: "MATERIAL_PROCESSING_TIMEOUT" });
  });
});
