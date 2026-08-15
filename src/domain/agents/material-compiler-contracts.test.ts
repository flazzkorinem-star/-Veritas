import { describe, expect, it } from "vitest";

import { agentOperationRequestSchema } from "./contracts";

describe("材料编译 Agent 请求契约", () => {
  it("接收带稳定来源单元的紧凑提取请求", () => {
    const request = {
      operation: "EXTRACT_COMPACT_KNOWLEDGE",
      input: {
        shardId: "shard-1",
        sourceUnits: [
          { id: "source-1", sourceLabel: "第 1 页", text: "太阳驱动蒸发。" },
        ],
      },
    };

    expect(agentOperationRequestSchema.parse(request)).toEqual(request);
  });

  it("拒绝重复来源 ID，避免覆盖关系歧义", () => {
    const result = agentOperationRequestSchema.safeParse({
      operation: "EXTRACT_COMPACT_KNOWLEDGE",
      input: {
        shardId: "shard-1",
        sourceUnits: [
          { id: "source-1", sourceLabel: "第 1 页", text: "蒸发。" },
          { id: "source-1", sourceLabel: "第 2 页", text: "凝结。" },
        ],
      },
    });

    expect(result.success).toBe(false);
  });
});
