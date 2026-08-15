import { describe, expect, it, vi } from "vitest";

import { runAgentOperation } from "./service";

const request = {
  operation: "EXTRACT_COMPACT_KNOWLEDGE" as const,
  input: {
    shardId: "shard-1",
    sourceUnits: [
      { id: "source-1", sourceLabel: "第 1 页", text: "太阳驱动蒸发。" },
      { id: "source-2", sourceLabel: "第 2 页", text: "重力推动径流。" },
    ],
  },
};

const extraction = {
  modules: [
    {
      id: "module-1",
      title: "水循环",
      sourceUnitIds: ["source-1", "source-2"],
    },
  ],
  knowledgeItems: [
    {
      id: "item-1",
      moduleId: "module-1",
      title: "水循环动力",
      summary: "太阳能驱动蒸发，重力推动径流。",
      sourceUnitIds: ["source-1", "source-2"],
      commonMisconceptions: [],
    },
  ],
  topicDrafts: [
    {
      id: "topic-1",
      moduleId: "module-1",
      title: "区分循环动力",
      objective: "区分太阳能与重力的作用。",
      knowledgeItemIds: ["item-1"],
    },
  ],
  sourceCoverage: ["source-1", "source-2"],
};

describe("Agent 1 紧凑提取", () => {
  it("用非思考模式提取紧凑候选，并保留来源 ID 边界", async () => {
    const callModel = vi.fn().mockResolvedValue(extraction);

    await expect(
      runAgentOperation(request, "server-key", callModel),
    ).resolves.toEqual(extraction);

    expect(callModel).toHaveBeenCalledWith(
      expect.objectContaining({ thinking: false, maxTokens: 8_000 }),
    );
    const prompt = callModel.mock.calls[0]![0].user;
    expect(prompt).toContain('"source-1"');
    expect(prompt).toContain('"topicDrafts"');
    expect(prompt).not.toContain("diagnosticRationale");
    expect(prompt).not.toContain("bloomTargets");
  });

  it("拒绝遗漏请求来源单元的模型输出", async () => {
    const callModel = vi.fn().mockResolvedValue({
      ...extraction,
      modules: [
        { id: "module-1", title: "水循环", sourceUnitIds: ["source-1"] },
      ],
      knowledgeItems: [
        { ...extraction.knowledgeItems[0], sourceUnitIds: ["source-1"] },
      ],
      sourceCoverage: ["source-1"],
    });

    await expect(
      runAgentOperation(request, "server-key", callModel, undefined, {
        sleep: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toMatchObject({ code: "INVALID_MODEL_OUTPUT" });
    expect(callModel).toHaveBeenCalledTimes(2);
  });
});
