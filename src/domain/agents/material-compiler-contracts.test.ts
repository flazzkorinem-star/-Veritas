import { describe, expect, it } from "vitest";

import { agentOperationRequestSchema } from "./contracts";

describe("材料编译 Agent 请求契约", () => {
  it("接收带稳定来源单元的紧凑提取请求", () => {
    const request = {
      operation: "EXTRACT_COMPACT_KNOWLEDGE",
      input: {
        shardId: "shard-1",
        sourceUnits: [{ id: "source-1", sourceLabel: "第 1 页", text: "太阳驱动蒸发。" }],
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

  it("接收来源正文与紧凑候选分离的知识地图编译请求", () => {
    const extraction = {
      modules: [{ id: "s1-m1", title: "水循环", sourceUnitIds: ["source-1"] }],
      knowledgeItems: [
        {
          id: "s1-i1",
          moduleId: "s1-m1",
          title: "循环动力",
          summary: "太阳能驱动蒸发。",
          sourceUnitIds: ["source-1"],
          commonMisconceptions: [],
        },
      ],
      topicDrafts: [
        {
          id: "s1-t1",
          moduleId: "s1-m1",
          title: "循环动力",
          objective: "解释动力。",
          knowledgeItemIds: ["s1-i1"],
        },
      ],
      sourceCoverage: ["source-1"],
    };
    const request = {
      operation: "COMPILE_KNOWLEDGE_MAP",
      input: {
        sourceUnits: [{ id: "source-1", sourceLabel: "第 1 页", text: "太阳驱动蒸发。" }],
        shards: [{ shardId: "shard-1", extraction }],
      },
    };

    expect(agentOperationRequestSchema.parse(request)).toEqual(request);
  });

  it("接收不含来源正文的中间候选归并请求", () => {
    const request = {
      operation: "MERGE_COMPACT_CANDIDATES",
      input: {
        knowledgeItems: [
          {
            id: "s1-i1",
            moduleId: "s1-m1",
            title: "蒸发动力",
            summary: "太阳能驱动蒸发。",
            sourceUnitIds: ["source-1"],
            commonMisconceptions: [],
          },
          {
            id: "s2-i1",
            moduleId: "s2-m1",
            title: "蒸发能量",
            summary: "热量使水蒸发。",
            sourceUnitIds: ["source-2"],
            commonMisconceptions: [],
          },
        ],
      },
    };

    expect(agentOperationRequestSchema.parse(request)).toEqual(request);
  });
});
