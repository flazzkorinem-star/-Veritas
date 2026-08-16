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

const namespacedExtraction = {
  ...extraction,
  modules: extraction.modules.map((materialModule) => ({
    ...materialModule,
    id: "s1-m1",
  })),
  knowledgeItems: extraction.knowledgeItems.map((item) => ({
    ...item,
    id: "s1-i1",
    moduleId: "s1-m1",
  })),
  topicDrafts: extraction.topicDrafts.map((topic) => ({
    ...topic,
    id: "s1-t1",
    moduleId: "s1-m1",
    knowledgeItemIds: ["s1-i1"],
  })),
};

const compiledAudit = {
  mergeGroups: [
    {
      id: "group-1",
      sourceKnowledgeItemIds: ["s1-i1"],
      diagnosticRationale: "这是理解循环机制的基础。",
    },
  ],
  nodes: [
    {
      id: "draft-node",
      title: "循环动力",
      objective: "解释太阳能怎样推动循环。",
      canonicalUnderstanding: "太阳能驱动水蒸发进入大气。",
      commonMisconceptions: [],
      bloomTargets: {
        memory: "说出主要动力。",
        understanding: "解释动力作用。",
        application: "判断具体环节。",
        analysis: "拆解能量与运动关系。",
      },
      order: 1,
    },
  ],
  assignments: [
    {
      groupId: "group-1",
      disposition: "DIAGNOSED_IN_NODE" as const,
      nodeId: "draft-node",
    },
  ],
};

describe("Agent 1 紧凑提取", () => {
  it("用非思考模式提取紧凑候选，并保留来源 ID 边界", async () => {
    const callModel = vi.fn().mockResolvedValue(extraction);

    await expect(runAgentOperation(request, "server-key", callModel)).resolves.toEqual(
      extraction,
    );

    expect(callModel).toHaveBeenCalledWith(
      expect.objectContaining({ thinking: false, maxTokens: 8_000 }),
    );
    const prompt = callModel.mock.calls[0]![0].user;
    expect(prompt).toContain('"source-1"');
    expect(prompt).toContain('"topicDrafts"');
    expect(prompt).toContain("Markdown 标题");
    expect(prompt).not.toContain("diagnosticRationale");
    expect(prompt).not.toContain("bloomTargets");
  });

  it("拒绝遗漏请求来源单元的模型输出", async () => {
    const callModel = vi.fn().mockResolvedValue({
      ...extraction,
      modules: [{ id: "module-1", title: "水循环", sourceUnitIds: ["source-1"] }],
      knowledgeItems: [{ ...extraction.knowledgeItems[0], sourceUnitIds: ["source-1"] }],
      sourceCoverage: ["source-1"],
    });

    await expect(
      runAgentOperation(request, "server-key", callModel, undefined, {
        sleep: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toMatchObject({ code: "INVALID_MODEL_OUTPUT" });
    expect(callModel).toHaveBeenCalledTimes(2);
    const repairSystem = callModel.mock.calls[1]![0].system;
    expect(repairSystem).toContain('"sourceCoverage":["source-1"]');
    expect(repairSystem).not.toContain("太阳驱动蒸发");
  });

  it("拒绝把不同 Markdown 二级标题合并为同一模块", async () => {
    const headingRequest = {
      operation: "EXTRACT_COMPACT_KNOWLEDGE" as const,
      input: {
        shardId: "shard-1",
        sourceUnits: [
          {
            id: "source-1",
            sourceLabel: "第一章",
            text: "## 第一章\n蒸发与凝结。",
          },
          {
            id: "source-2",
            sourceLabel: "第二章",
            text: "## 第二章\n城市径流。",
          },
        ],
      },
    };
    const repaired = {
      modules: [
        { id: "module-1", title: "第一章", sourceUnitIds: ["source-1"] },
        { id: "module-2", title: "第二章", sourceUnitIds: ["source-2"] },
      ],
      knowledgeItems: [
        {
          id: "item-1",
          moduleId: "module-1",
          title: "状态变化",
          summary: "蒸发与凝结。",
          sourceUnitIds: ["source-1"],
          commonMisconceptions: [],
        },
        {
          id: "item-2",
          moduleId: "module-2",
          title: "城市径流",
          summary: "城市地表改变径流。",
          sourceUnitIds: ["source-2"],
          commonMisconceptions: [],
        },
      ],
      topicDrafts: [
        {
          id: "topic-1",
          moduleId: "module-1",
          title: "状态变化",
          objective: "理解状态变化。",
          knowledgeItemIds: ["item-1"],
        },
        {
          id: "topic-2",
          moduleId: "module-2",
          title: "城市径流",
          objective: "理解径流变化。",
          knowledgeItemIds: ["item-2"],
        },
      ],
      sourceCoverage: ["source-1", "source-2"],
    };
    const callModel = vi
      .fn()
      .mockResolvedValueOnce(extraction)
      .mockResolvedValueOnce(repaired);

    await expect(
      runAgentOperation(headingRequest, "server-key", callModel, undefined, {
        sleep: vi.fn().mockResolvedValue(undefined),
      }),
    ).resolves.toEqual(repaired);
    expect(callModel).toHaveBeenCalledTimes(2);
  });

  it("允许同名 Markdown 标题的多个来源单元归入同一模块", async () => {
    const repeatedHeadingRequest = {
      operation: "EXTRACT_COMPACT_KNOWLEDGE" as const,
      input: {
        shardId: "shard-1",
        sourceUnits: [
          {
            id: "source-1",
            sourceLabel: "Water cycle mechanism",
            text: "## Water cycle mechanism\nEvaporation.",
          },
          {
            id: "source-2",
            sourceLabel: "Water cycle mechanism",
            text: "## Water cycle mechanism\nCondensation.",
          },
        ],
      },
    };
    const callModel = vi.fn().mockResolvedValue(extraction);

    await expect(
      runAgentOperation(repeatedHeadingRequest, "server-key", callModel),
    ).resolves.toEqual(extraction);
    expect(callModel).toHaveBeenCalledTimes(1);
  });
});

describe("Agent 1 紧凑归并", () => {
  it("在最终编译前合并一批候选，并由代码校验完整谱系", async () => {
    const knowledgeItems = [
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
    ];
    const callModel = vi.fn().mockResolvedValue({
      mergeGroups: [
        {
          id: "group-1",
          sourceKnowledgeItemIds: ["s1-i1", "s2-i1"],
          canonical: {
            title: "蒸发能量",
            summary: "太阳提供水蒸发所需能量。",
            commonMisconceptions: [],
          },
        },
      ],
    });

    await expect(
      runAgentOperation(
        { operation: "MERGE_COMPACT_CANDIDATES", input: { knowledgeItems } },
        "server-key",
        callModel,
      ),
    ).resolves.toEqual([
      {
        ...knowledgeItems[0],
        title: "蒸发能量",
        summary: "太阳提供水蒸发所需能量。",
        sourceUnitIds: ["source-1", "source-2"],
      },
    ]);
    expect(callModel).toHaveBeenCalledWith(
      expect.objectContaining({ thinking: false, maxTokens: 8_000 }),
    );
  });

  it("只把紧凑候选交给模型，并由代码恢复来源和最终地图", async () => {
    const callModel = vi.fn().mockResolvedValue(compiledAudit);

    const result = await runAgentOperation(
      {
        operation: "COMPILE_KNOWLEDGE_MAP",
        input: {
          sourceUnits: [
            {
              id: "source-1",
              sourceLabel: "第 1 页",
              text: "逐字正文不应发给归并模型。",
            },
            {
              id: "source-2",
              sourceLabel: "第 2 页",
              text: "另一段逐字正文也不应发送。",
            },
          ],
          shards: [{ shardId: "shard-1", extraction: namespacedExtraction }],
        },
      },
      "server-key",
      callModel,
    );

    expect(result).toMatchObject({
      knowledgeItems: [
        {
          id: "s1-i1",
          kind: "CORE",
          sourceReferences: [
            { label: "第 1 页", excerpt: "逐字正文不应发给归并模型。" },
            { label: "第 2 页", excerpt: "另一段逐字正文也不应发送。" },
          ],
        },
      ],
      nodes: [{ id: "node-1", knowledgeItemIds: ["s1-i1"] }],
    });
    expect(callModel).toHaveBeenCalledWith(
      expect.objectContaining({ thinking: false, maxTokens: 24_000 }),
    );
    const prompt = callModel.mock.calls[0]![0].user;
    expect(prompt).toContain('"sourceKnowledgeItemIds"');
    expect(prompt).toContain('"topicDrafts"');
    expect(prompt).not.toContain("逐字正文不应发给归并模型");
    expect(prompt).not.toContain("另一段逐字正文也不应发送");
  });

  it("最终编译连续返回坏结构时明确失败，不生成模板化教学内容", async () => {
    const callModel = vi.fn().mockResolvedValue({ invalid: true });

    await expect(
      runAgentOperation(
        {
          operation: "COMPILE_KNOWLEDGE_MAP",
          input: {
            sourceUnits: request.input.sourceUnits,
            shards: [{ shardId: "shard-1", extraction: namespacedExtraction }],
          },
        },
        "server-key",
        callModel,
        undefined,
        { sleep: vi.fn().mockResolvedValue(undefined) },
      ),
    ).rejects.toMatchObject({ code: "INVALID_MODEL_OUTPUT" });
    expect(callModel).toHaveBeenCalledTimes(2);
  });
});
