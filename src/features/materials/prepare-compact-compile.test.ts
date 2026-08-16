import { describe, expect, it, vi } from "vitest";

import { AgentClientError } from "./agent-client";
import { prepareCompactCompile } from "./prepare-compact-compile";

function shard(shardNumber: number, itemCount: number) {
  const moduleId = `s${shardNumber}-m1`;
  const sourceUnitIds = Array.from(
    { length: itemCount },
    (_, index) => `source-${(shardNumber - 1) * 10 + index + 1}`,
  );
  const knowledgeItems = sourceUnitIds.map((sourceUnitId, index) => ({
    id: `s${shardNumber}-i${index + 1}`,
    moduleId,
    title: `条目 ${shardNumber}-${index + 1}`,
    summary: "候选摘要。",
    sourceUnitIds: [sourceUnitId],
    commonMisconceptions: [],
  }));
  return {
    shardId: `shard-${shardNumber}`,
    extraction: {
      modules: [{ id: moduleId, title: `模块 ${shardNumber}`, sourceUnitIds }],
      knowledgeItems,
      topicDrafts: knowledgeItems.map((item, index) => ({
        id: `s${shardNumber}-t${index + 1}`,
        moduleId,
        title: item.title,
        objective: "理解候选。",
        knowledgeItemIds: [item.id],
      })),
      sourceCoverage: sourceUnitIds,
    },
  };
}

describe("最终编译前的分层紧凑归并", () => {
  it("候选规模已经可控时不增加模型调用", async () => {
    const callAgent = vi.fn();
    const input = [shard(1, 2)];

    await expect(
      prepareCompactCompile(input, {
        callAgent: callAgent as never,
        maxFinalItems: 2,
      }),
    ).resolves.toEqual(input);
    expect(callAgent).not.toHaveBeenCalled();
  });

  it("候选过多时按来源不重叠的分片组并行压缩后再编译", async () => {
    const callAgent = vi.fn(
      async (request: {
        input: {
          knowledgeItems: ReturnType<typeof shard>["extraction"]["knowledgeItems"];
        };
      }) => {
        const items = request.input.knowledgeItems;
        return [
          {
            ...items[0]!,
            title: `合并 ${items.length} 条`,
            sourceUnitIds: items.flatMap(({ sourceUnitIds }) => sourceUnitIds),
          },
        ];
      },
    );

    const result = await prepareCompactCompile([shard(1, 2), shard(2, 2), shard(3, 2)], {
      callAgent: callAgent as never,
      maxBatchItems: 4,
      maxFinalItems: 2,
    });

    expect(callAgent).toHaveBeenCalledTimes(2);
    expect(result.flatMap(({ extraction }) => extraction.knowledgeItems)).toHaveLength(2);
    expect(result.flatMap(({ extraction }) => extraction.sourceCoverage)).toEqual([
      "source-1",
      "source-2",
      "source-11",
      "source-12",
      "source-21",
      "source-22",
    ]);
    expect(
      result.every(
        ({ extraction }) =>
          new Set(extraction.sourceCoverage).size === extraction.sourceCoverage.length,
      ),
    ).toBe(true);
  });

  it("递归归并与批次竞争时仍不突破四路材料并发", async () => {
    let active = 0;
    let maxActive = 0;
    const callAgent = vi.fn(
      async (request: {
        input: {
          knowledgeItems: ReturnType<typeof shard>["extraction"]["knowledgeItems"];
        };
      }) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return [
          {
            ...request.input.knowledgeItems[0]!,
            sourceUnitIds: request.input.knowledgeItems.flatMap(
              ({ sourceUnitIds }) => sourceUnitIds,
            ),
          },
        ];
      },
    );

    await prepareCompactCompile(
      [shard(1, 2), shard(2, 2), shard(3, 2), shard(4, 2), shard(5, 2)],
      {
        callAgent: callAgent as never,
        maxBatchItems: 2,
        maxFinalItems: 1,
      },
    );

    expect(maxActive).toBe(4);
  });

  it("中间归并结构失败时二分分片组，单分片失败则保留原候选", async () => {
    const onBypass = vi.fn();
    const callAgent = vi.fn(
      async (request: {
        input: {
          knowledgeItems: ReturnType<typeof shard>["extraction"]["knowledgeItems"];
        };
      }) => {
        const items = request.input.knowledgeItems;
        if (items.length > 2 || items[0]!.id.startsWith("s3-")) {
          throw new AgentClientError("MODEL_OUTPUT_INVALID", "模型结果暂时无法使用。");
        }
        return [
          {
            ...items[0]!,
            sourceUnitIds: items.flatMap(({ sourceUnitIds }) => sourceUnitIds),
          },
        ];
      },
    );

    const result = await prepareCompactCompile([shard(1, 2), shard(2, 2), shard(3, 2)], {
      callAgent: callAgent as never,
      maxBatchItems: 6,
      maxFinalItems: 2,
      onBypass,
    });

    expect(result.flatMap(({ extraction }) => extraction.knowledgeItems)).toHaveLength(4);
    expect(result.flatMap(({ extraction }) => extraction.sourceCoverage)).toHaveLength(6);
    expect(onBypass).toHaveBeenCalledTimes(1);
  });

  it("可选归并上游失败时保留已验证候选并记录旁路", async () => {
    const input = [shard(1, 2), shard(2, 2)];
    const onBypass = vi.fn();
    const callAgent = vi
      .fn()
      .mockRejectedValue(
        new AgentClientError("UPSTREAM_UNAVAILABLE", "模型服务暂时不可用。"),
      );

    await expect(
      prepareCompactCompile(input, {
        callAgent: callAgent as never,
        maxBatchItems: 4,
        maxFinalItems: 2,
        onBypass,
      }),
    ).resolves.toEqual(input);
    expect(onBypass).toHaveBeenCalledTimes(1);
  });
});
