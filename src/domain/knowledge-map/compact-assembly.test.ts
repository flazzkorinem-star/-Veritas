import { describe, expect, it } from "vitest";

import { knowledgeAuditSchema } from "./knowledge-audit-contracts";
import { assembleCompactKnowledgeMap } from "./compact-assembly";

const sourceUnits = [
  { id: "source-1", sourceLabel: "第 1 页", text: "太阳驱动蒸发。" },
  { id: "source-2", sourceLabel: "第 2 页", text: "热量推动状态变化。" },
];

const shards = [
  {
    shardId: "shard-1",
    extraction: {
      modules: [
        {
          id: "s1-m1",
          title: "自然水循环",
          sourceUnitIds: ["source-1", "source-2"],
        },
      ],
      knowledgeItems: [
        {
          id: "s1-i1",
          moduleId: "s1-m1",
          title: "循环动力",
          summary: "太阳能推动水循环。",
          sourceUnitIds: ["source-1"],
          commonMisconceptions: ["只有太阳能参与。"],
        },
        {
          id: "s1-i2",
          moduleId: "s1-m1",
          title: "状态变化能量",
          summary: "热量推动状态变化。",
          sourceUnitIds: ["source-2"],
          commonMisconceptions: [],
        },
      ],
      topicDrafts: [
        {
          id: "s1-t1",
          moduleId: "s1-m1",
          title: "循环动力",
          objective: "解释循环动力。",
          knowledgeItemIds: ["s1-i1", "s1-i2"],
        },
      ],
      sourceCoverage: ["source-1", "source-2"],
    },
  },
];

const audit = {
  mergeGroups: [
    {
      id: "group-1",
      sourceKnowledgeItemIds: ["s1-i1", "s1-i2"],
      diagnosticRationale: "两条内容共同解释循环的能量基础。",
      canonical: {
        title: "水循环能量",
        summary: "太阳能和热量共同支撑水的状态变化。",
      },
    },
  ],
  nodes: [
    {
      id: "draft-node",
      title: "水循环能量",
      objective: "解释能量如何推动状态变化。",
      canonicalUnderstanding: "太阳辐射提供水发生状态变化所需的能量。",
      commonMisconceptions: ["重力与循环无关。"],
      bloomTargets: {
        memory: "说出主要能量来源。",
        understanding: "解释能量的作用。",
        application: "判断具体变化环节。",
        analysis: "分析能量与运动的关系。",
      },
      order: 4,
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

describe("紧凑知识地图确定性装配", () => {
  it("从来源单元和候选谱系恢复最终地图与完整来源覆盖", () => {
    const result = assembleCompactKnowledgeMap(
      sourceUnits,
      shards,
      knowledgeAuditSchema.parse(audit),
    );

    expect(result.knowledgeMap.modules).toEqual([
      {
        id: "s1-m1",
        title: "自然水循环",
        sourceRange: "第 1 页 至 第 2 页",
      },
    ]);
    expect(result.knowledgeMap.knowledgeItems).toEqual([
      expect.objectContaining({
        id: "s1-i1",
        title: "水循环能量",
        kind: "CORE",
        diagnosticRationale: "两条内容共同解释循环的能量基础。",
        sourceReferences: [
          { label: "第 1 页", excerpt: "太阳驱动蒸发。" },
          { label: "第 2 页", excerpt: "热量推动状态变化。" },
        ],
      }),
    ]);
    expect(result.knowledgeMap.nodes).toEqual([
      expect.objectContaining({
        id: "node-1",
        moduleId: "s1-m1",
        knowledgeItemIds: ["s1-i1"],
        order: 1,
      }),
    ]);
    expect(result.sourceCoverage).toEqual([
      { sourceUnitId: "source-1", knowledgeItemIds: ["s1-i1"] },
      { sourceUnitId: "source-2", knowledgeItemIds: ["s1-i1"] },
    ]);
  });

  it("拒绝谱系遗漏候选条目，并只暴露稳定 ID 路径", () => {
    const invalidAudit = structuredClone(audit);
    invalidAudit.mergeGroups[0]!.sourceKnowledgeItemIds = ["s1-i1"];

    expect(() =>
      assembleCompactKnowledgeMap(
        sourceUnits,
        shards,
        knowledgeAuditSchema.parse(invalidAudit),
      ),
    ).toThrow("归并谱系没有完整覆盖候选知识条目");

    try {
      assembleCompactKnowledgeMap(
        sourceUnits,
        shards,
        knowledgeAuditSchema.parse(invalidAudit),
      );
    } catch (error) {
      expect(error).toMatchObject({
        details: ["COMPILE_KNOWLEDGE_MAP:lineage.missing.s1-i2:custom"],
      });
    }
  });

  it("拒绝分片遗漏任何来源单元", () => {
    const invalidSourceUnits = [
      ...sourceUnits,
      { id: "source-3", sourceLabel: "第 3 页", text: "未覆盖正文。" },
    ];

    expect(() =>
      assembleCompactKnowledgeMap(
        invalidSourceUnits,
        shards,
        knowledgeAuditSchema.parse(audit),
      ),
    ).toThrow("分片没有恰好覆盖全部来源单元");
  });
});
