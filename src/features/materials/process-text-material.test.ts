import { describe, expect, it, vi } from "vitest";

import { AgentClientError } from "./agent-client";
import { processTextMaterial } from "./process-text-material";

const source = { label: "第 1 段", excerpt: "太阳驱动蒸发。" };
function extractionFor(sourceUnits: Array<{ id: string }>) {
  const sourceUnitIds = sourceUnits.map(({ id }) => id);
  return {
    modules: [{ id: "module-1", title: "模块", sourceUnitIds }],
    knowledgeItems: [
      {
        id: "item-1",
        moduleId: "module-1",
        title: "循环动力",
        summary: "太阳能驱动蒸发。",
        sourceUnitIds,
        commonMisconceptions: [],
      },
    ],
    topicDrafts: [
      {
        id: "topic-1",
        moduleId: "module-1",
        title: "循环动力",
        objective: "解释循环动力。",
        knowledgeItemIds: ["item-1"],
      },
    ],
    sourceCoverage: sourceUnitIds,
  };
}
const extraction = extractionFor([{ id: "source-1" }]);
const map = {
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

function mapForCompile(request: {
  input: {
    sourceUnits: Array<{ sourceLabel: string; text: string }>;
    shards: Array<{ extraction: ReturnType<typeof extractionFor> }>;
  };
}) {
  const extraction = request.input.shards[0]!.extraction;
  const materialModule = extraction.modules[0]!;
  const item = extraction.knowledgeItems[0]!;
  const sourceUnit = request.input.sourceUnits[0]!;
  const reference = {
    label: sourceUnit.sourceLabel,
    excerpt: sourceUnit.text.slice(0, 800),
  };
  return {
    modules: [
      {
        id: materialModule.id,
        title: materialModule.title,
        sourceRange: reference.label,
      },
    ],
    knowledgeItems: [
      {
        id: item.id,
        moduleId: item.moduleId,
        title: item.title,
        summary: item.summary,
        kind: "CORE" as const,
        diagnosticRationale: `${item.title} 是理解材料主线的基础。`,
        sourceReferences: [reference],
        commonMisconceptions: [],
      },
    ],
    nodes: [
      {
        id: "node-1",
        moduleId: materialModule.id,
        title: item.title,
        objective: `理解${item.title}`,
        knowledgeItemIds: [item.id],
        sourceReferences: [reference],
        canonicalUnderstanding: item.summary,
        commonMisconceptions: [],
        bloomTargets: {
          memory: `识别${item.title}的基本概念。`,
          understanding: `解释${item.title}的核心机制。`,
          application: `在具体场景中使用${item.title}。`,
          analysis: `分析${item.title}的条件与边界。`,
        },
        order: 1,
      },
    ],
    coverageAssignments: [
      {
        knowledgeItemId: item.id,
        disposition: "DIAGNOSED_IN_NODE" as const,
        nodeId: "node-1",
      },
    ],
  };
}

describe("文本材料处理编排", () => {
  it("依次完成读取、紧凑提取、知识编译和有意义的首问生成", async () => {
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
      processingTrace: {
        extractionRequestCount: 1,
        splitCount: 0,
        mergeRequestCount: 0,
        mergeBypassCount: 0,
        compilePartitionCount: 1,
        repairedRequestCount: 0,
        deterministicFallbackCount: 0,
        finalCompileSource: "MODEL_VALIDATED",
      },
    });
    expect(callAgent.mock.calls.map(([request]) => request.operation)).toEqual([
      "EXTRACT_COMPACT_KNOWLEDGE",
      "COMPILE_KNOWLEDGE_MAP",
      "CREATE_FIRST_QUESTION",
    ]);
    expect(callAgent.mock.calls[2]![0].input.materialContext).toEqual({
      title: "water.md",
      modules: [{ id: "module-1", title: "模块" }],
      itemIndex: [{ id: "item-1", title: "循环动力", kind: "CORE" }],
    });
    expect(callAgent.mock.calls[2]![0].input).toMatchObject({
      stage: "MEMORY",
      node: {
        bloomTargets: {
          memory: "说出动力。",
          understanding: "解释作用。",
          application: "判断环节。",
          analysis: "分析关系。",
        },
      },
    });
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

  it("最多并行提取四个分片，并保持编译输入顺序", async () => {
    let activeExtractions = 0;
    let maxActiveExtractions = 0;
    const callAgent = vi.fn(
      async (request: {
        operation: string;
        input: { sourceUnits?: Array<{ id: string }> };
      }) => {
        if (request.operation === "EXTRACT_COMPACT_KNOWLEDGE") {
          activeExtractions += 1;
          maxActiveExtractions = Math.max(maxActiveExtractions, activeExtractions);
          await Promise.resolve();
          activeExtractions -= 1;
          return extractionFor(request.input.sourceUnits!);
        }
        if (request.operation === "COMPILE_KNOWLEDGE_MAP") {
          return mapForCompile(request as never);
        }
        return { opening: "材料重点清楚。", question: "主要动力是什么？" };
      },
    );
    const blocks = Array.from({ length: 4 }, (_, index) => ({
      sourceLabel: `第 ${index + 1} 部分`,
      text: ["水", "汽", "云", "雨"][index]!.repeat(20_000),
    }));

    const result = await processTextMaterial(new File(["材料"], "notes.txt"), vi.fn(), {
      callAgent: callAgent as never,
      parseMaterial: vi.fn().mockResolvedValue({
        fileName: "notes.txt",
        mimeType: "text/plain",
        text: blocks.map((block) => block.text).join("\n\n"),
        sourceBlocks: blocks,
      }) as never,
    });

    expect(maxActiveExtractions).toBe(4);
    const compileRequests = callAgent.mock.calls
      .filter(([request]) => request.operation === "COMPILE_KNOWLEDGE_MAP")
      .map(([request]) => request) as unknown as Array<{
      input: { shards: Array<{ shardId: string; extraction: typeof extraction }> };
    }>;
    expect(
      compileRequests.flatMap(({ input }) => input.shards.map(({ shardId }) => shardId)),
    ).toEqual(["shard-1", "shard-2", "shard-3", "shard-4"]);
    expect(
      compileRequests.flatMap(({ input }) =>
        input.shards.flatMap(({ extraction }) =>
          extraction.knowledgeItems.map((item) => item.id),
        ),
      ),
    ).toEqual(["s1-i1", "s2-i1", "s3-i1", "s4-i1"]);
    expect(result.knowledgeMap.nodes.map(({ id }) => id)).toEqual([
      "node-1",
      "node-2",
      "node-3",
      "node-4",
    ]);
    expect(result.processingTrace.compilePartitionCount).toBe(4);
  });

  it("只二分重试结构失败的编译分区并复用其他成功结果", async () => {
    const compileShardIds: string[] = [];
    const callAgent = vi.fn(
      async (request: {
        operation: string;
        input: {
          sourceUnits?: Array<{ id: string; sourceLabel: string; text: string }>;
          shards?: Array<{
            shardId: string;
            extraction: ReturnType<typeof extractionFor>;
          }>;
        };
      }) => {
        if (request.operation === "EXTRACT_COMPACT_KNOWLEDGE") {
          const units = request.input.sourceUnits!;
          return {
            modules: units.map((unit, index) => ({
              id: `m${index + 1}`,
              title: unit.sourceLabel,
              sourceUnitIds: [unit.id],
            })),
            knowledgeItems: units.map((unit, index) => ({
              id: `i${index + 1}`,
              moduleId: `m${index + 1}`,
              title: `条目 ${index + 1}`,
              summary: unit.text,
              sourceUnitIds: [unit.id],
              commonMisconceptions: [],
            })),
            topicDrafts: units.map((_unit, index) => ({
              id: `t${index + 1}`,
              moduleId: `m${index + 1}`,
              title: `主题 ${index + 1}`,
              objective: `理解条目 ${index + 1}`,
              knowledgeItemIds: [`i${index + 1}`],
            })),
            sourceCoverage: units.map(({ id }) => id),
          };
        }
        if (request.operation === "COMPILE_KNOWLEDGE_MAP") {
          const shardId = request.input.shards![0]!.shardId;
          compileShardIds.push(shardId);
          if (shardId === "shard-1") {
            throw new AgentClientError("MODEL_OUTPUT_INVALID", "模型结构无效。");
          }
          return mapForCompile(request as never);
        }
        return { opening: "材料重点清楚。", question: "最基本的概念是什么？" };
      },
    );

    const result = await processTextMaterial(new File(["材料"], "notes.txt"), vi.fn(), {
      callAgent: callAgent as never,
      parseMaterial: vi.fn().mockResolvedValue({
        fileName: "notes.txt",
        mimeType: "text/plain",
        text: "## 第一段\n正文一\n\n## 第二段\n正文二",
        sourceBlocks: [
          { sourceLabel: "第一段", text: "## 第一段\n正文一" },
          { sourceLabel: "第二段", text: "## 第二段\n正文二" },
        ],
      }) as never,
    });

    expect(compileShardIds).toEqual(["shard-1", "shard-1-1", "shard-1-2"]);
    expect(result.knowledgeMap.nodes).toHaveLength(2);
    expect(result.processingTrace).toMatchObject({
      splitCount: 1,
      compilePartitionCount: 2,
      deterministicFallbackCount: 0,
      finalCompileSource: "MODEL_VALIDATED",
    });
  });

  it("只按实际完成的分块数量上报提取进度", async () => {
    const pending = new Map<
      string,
      {
        sourceUnits: Array<{ id: string }>;
        resolve: (value: typeof extraction) => void;
      }
    >();
    const callAgent = vi.fn(
      (request: {
        operation: string;
        input: { shardId?: string; sourceUnits?: Array<{ id: string }> };
      }) => {
        if (request.operation === "EXTRACT_COMPACT_KNOWLEDGE") {
          return new Promise((resolve) => {
            pending.set(request.input.shardId!, {
              sourceUnits: request.input.sourceUnits!,
              resolve,
            });
          });
        }
        if (request.operation === "COMPILE_KNOWLEDGE_MAP") {
          return Promise.resolve(mapForCompile(request as never));
        }
        return Promise.resolve({
          opening: "材料重点清楚。",
          question: "主要动力是什么？",
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
          { sourceLabel: "第一部分", text: "一".repeat(20_000) },
          { sourceLabel: "第二部分", text: "二".repeat(20_000) },
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

    const second = pending.get("shard-2")!;
    second.resolve(extractionFor(second.sourceUnits));
    await vi.waitFor(() => expect(completedCounts()).toEqual([0, 1]));
    const first = pending.get("shard-1")!;
    first.resolve(extractionFor(first.sourceUnits));
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
