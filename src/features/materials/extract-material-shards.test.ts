import { describe, expect, it, vi } from "vitest";

import { AgentClientError } from "./agent-client";
import { extractMaterialShards } from "./extract-material-shards";

function extractionFor(sourceUnits: Array<{ id: string }>) {
  const suffix = sourceUnits[0]!.id.replace("source-", "");
  const sourceUnitIds = sourceUnits.map(({ id }) => id);
  return {
    modules: [{ id: "module", title: `模块 ${suffix}`, sourceUnitIds }],
    knowledgeItems: [
      {
        id: "item",
        moduleId: "module",
        title: `条目 ${suffix}`,
        summary: "摘要",
        sourceUnitIds,
        commonMisconceptions: [],
      },
    ],
    topicDrafts: [
      {
        id: "topic",
        moduleId: "module",
        title: `主题 ${suffix}`,
        objective: "理解材料。",
        knowledgeItemIds: ["item"],
      },
    ],
    sourceCoverage: sourceUnitIds,
  };
}

function shards(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    shardId: `shard-${index + 1}`,
    requestBytes: 100,
    sourceUnits: [
      {
        id: `source-${index + 1}`,
        sourceLabel: `第 ${index + 1} 段`,
        text: `正文 ${index + 1}`,
      },
    ],
  }));
}

describe("紧凑分片提取编排", () => {
  it("最多并行四个请求，并按原始来源顺序返回结果", async () => {
    let active = 0;
    let maxActive = 0;
    const callAgent = vi.fn(async (request: { input: { sourceUnits: [] } }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return extractionFor(request.input.sourceUnits);
    });

    const results = await extractMaterialShards(shards(6), {
      callAgent: callAgent as never,
      maxConcurrency: 4,
    });

    expect(maxActive).toBe(4);
    expect(results.map(({ shardId }) => shardId)).toEqual([
      "shard-1",
      "shard-2",
      "shard-3",
      "shard-4",
      "shard-5",
      "shard-6",
    ]);
  });

  it("结构失败时二分失败分片，且不重跑已经成功的分片", async () => {
    const materialShards = shards(2);
    materialShards[0]!.sourceUnits = Array.from({ length: 4 }, (_, index) => ({
      id: `source-${index + 1}`,
      sourceLabel: `第 ${index + 1} 段`,
      text: `正文 ${index + 1}`,
    }));
    materialShards[1]!.sourceUnits = [
      { id: "source-5", sourceLabel: "第 5 段", text: "正文 5" },
    ];
    const calls = new Map<string, number>();
    const callAgent = vi.fn(
      async (request: { input: { shardId: string; sourceUnits: [] } }) => {
        const { shardId, sourceUnits } = request.input;
        calls.set(shardId, (calls.get(shardId) ?? 0) + 1);
        if (shardId === "shard-1") {
          throw new AgentClientError(
            "MODEL_OUTPUT_INVALID",
            "模型结果暂时无法使用，请重试。",
          );
        }
        return extractionFor(sourceUnits);
      },
    );

    const results = await extractMaterialShards(materialShards, {
      callAgent: callAgent as never,
      maxConcurrency: 4,
    });

    expect(results.map(({ shardId }) => shardId)).toEqual([
      "shard-1-1",
      "shard-1-2",
      "shard-2",
    ]);
    expect(calls.get("shard-1")).toBe(1);
    expect(calls.get("shard-2")).toBe(1);
    expect(results.flatMap(({ extraction }) => extraction.sourceCoverage)).toEqual([
      "source-1",
      "source-2",
      "source-3",
      "source-4",
      "source-5",
    ]);
  });

  it("二分后的子片仍结构失败时明确失败，不用模板候选伪装覆盖", async () => {
    const materialShards = shards(1);
    materialShards[0]!.sourceUnits = Array.from({ length: 4 }, (_, index) => ({
      id: `source-${index + 1}`,
      sourceLabel: `第 ${index + 1} 段`,
      text: `正文 ${index + 1}`,
    }));
    const callAgent = vi
      .fn()
      .mockRejectedValue(
        new AgentClientError("MODEL_OUTPUT_INVALID", "模型结果暂时无法使用。"),
      );

    await expect(
      extractMaterialShards(materialShards, { callAgent: callAgent as never }),
    ).rejects.toMatchObject({ code: "MODEL_OUTPUT_INVALID" });
    expect(callAgent).toHaveBeenCalledTimes(3);
  });

  it("单个提取请求上游不可用时明确失败，不把未提取正文标成成功", async () => {
    const callAgent = vi
      .fn()
      .mockRejectedValue(
        new AgentClientError("UPSTREAM_UNAVAILABLE", "模型服务暂时不可用。"),
      );

    await expect(
      extractMaterialShards(shards(1), { callAgent: callAgent as never }),
    ).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    expect(callAgent).toHaveBeenCalledTimes(1);
  });

  it("失败分片二分与原队列竞争时仍不突破四路并发", async () => {
    const materialShards = shards(5);
    materialShards[0]!.sourceUnits = Array.from({ length: 4 }, (_, index) => ({
      id: `source-${index + 10}`,
      sourceLabel: `补充分段 ${index + 1}`,
      text: `补充正文 ${index + 1}`,
    }));
    let active = 0;
    let maxActive = 0;
    const gate = new Promise<void>((resolve) => setTimeout(resolve, 10));
    const callAgent = vi.fn(
      async (request: { input: { shardId: string; sourceUnits: [] } }) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        if (request.input.shardId === "shard-1") {
          active -= 1;
          throw new AgentClientError("MODEL_OUTPUT_INVALID", "模型结果暂时无法使用。");
        }
        await gate;
        active -= 1;
        return extractionFor(request.input.sourceUnits);
      },
    );

    await extractMaterialShards(materialShards, {
      callAgent: callAgent as never,
      maxConcurrency: 4,
    });

    expect(maxActive).toBe(4);
  });
});
