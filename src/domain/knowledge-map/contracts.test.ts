import { describe, expect, it } from "vitest";

import {
  chunkExtractionSchema,
  firstQuestionSchema,
  knowledgeMapSchema,
  type KnowledgeMap,
} from "./contracts";

function validMap(): KnowledgeMap {
  const source = { label: "第 1 节，第 1 段", excerpt: "太阳提供能量。" };
  return {
    modules: [{ id: "module-1", title: "自然水循环", sourceRange: "第 1 节" }],
    knowledgeItems: [
      {
        id: "item-1",
        moduleId: "module-1",
        title: "水循环动力",
        summary: "太阳能驱动蒸发，重力推动水向低处移动。",
        kind: "CORE" as const,
        diagnosticRationale: "容易混淆两种动力的作用阶段。",
        sourceReferences: [source],
        commonMisconceptions: ["水循环完全由太阳能直接推动。"],
      },
    ],
    nodes: [
      {
        id: "node-1",
        moduleId: "module-1",
        title: "水循环动力",
        objective: "区分太阳能与重力的作用。",
        knowledgeItemIds: ["item-1"],
        sourceReferences: [source],
        canonicalUnderstanding: "太阳能主要驱动蒸发，重力影响降水和径流。",
        commonMisconceptions: ["重力与水循环无关。"],
        bloomTargets: {
          memory: "说出两种动力。",
          understanding: "解释各自作用。",
          application: "判断情境中的主要动力。",
          analysis: "拆解能量与运动的关系。",
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
}

describe("完整知识地图契约", () => {
  it("接受来源完整且核心条目唯一归属的知识地图", () => {
    expect(knowledgeMapSchema.parse(validMap())).toEqual(validMap());
  });

  it.each([
    [
      "不存在的模块",
      (map: ReturnType<typeof validMap>) => (map.knowledgeItems[0]!.moduleId = "missing"),
    ],
    [
      "不存在的条目",
      (map: ReturnType<typeof validMap>) =>
        map.nodes[0]!.knowledgeItemIds.push("missing"),
    ],
    [
      "重复覆盖",
      (map: ReturnType<typeof validMap>) =>
        map.coverageAssignments.push({ ...map.coverageAssignments[0]! }),
    ],
    [
      "核心条目只作参考",
      (map: ReturnType<typeof validMap>) => {
        map.coverageAssignments = [
          { knowledgeItemId: "item-1", disposition: "REFERENCE_ONLY", reason: "略过" },
        ];
      },
    ],
    [
      "节点没有来源",
      (map: ReturnType<typeof validMap>) => (map.nodes[0]!.sourceReferences = []),
    ],
  ])("拒绝%s", (_name, mutate) => {
    const map = validMap();
    mutate(map);
    expect(knowledgeMapSchema.safeParse(map).success).toBe(false);
  });

  it("要求辅助条目绑定主题或明确说明参考理由", () => {
    const map = validMap();
    map.knowledgeItems[0]!.kind = "SUPPORTING";
    map.coverageAssignments = [
      { knowledgeItemId: "item-1", disposition: "REFERENCE_ONLY", reason: "" },
    ];

    expect(knowledgeMapSchema.safeParse(map).success).toBe(false);
  });
});

describe("分块提取契约", () => {
  it.each([
    [
      "模块 ID",
      {
        modules: [
          { id: "module-1", title: "模块一", sourceRange: "第 1 段" },
          { id: "module-1", title: "模块二", sourceRange: "第 2 段" },
        ],
        knowledgeItems: [
          {
            id: "item-1",
            moduleId: "module-1",
            title: "条目",
            summary: "摘要",
            kind: "CORE",
            diagnosticRationale: "理解基础",
            sourceReferences: [{ label: "第 1 段", excerpt: "来源" }],
            commonMisconceptions: [],
          },
        ],
      },
    ],
    [
      "知识条目 ID",
      {
        modules: [{ id: "module-1", title: "模块", sourceRange: "第 1 段" }],
        knowledgeItems: [1, 2].map(() => ({
          id: "item-1",
          moduleId: "module-1",
          title: "条目",
          summary: "摘要",
          kind: "CORE",
          diagnosticRationale: "理解基础",
          sourceReferences: [{ label: "第 1 段", excerpt: "来源" }],
          commonMisconceptions: [],
        })),
      },
    ],
  ])("拒绝分块内重复的%s", (_name, extraction) => {
    expect(chunkExtractionSchema.safeParse(extraction).success).toBe(false);
  });
});

describe("首个问题契约", () => {
  it("同时接收材料判断和唯一主问题", () => {
    expect(
      firstQuestionSchema.parse({
        opening: "这份材料真正值得抓的是水循环的动力和回流机制。",
        question: "水循环最基本的动力来源是什么？",
      }),
    ).toEqual({
      opening: "这份材料真正值得抓的是水循环的动力和回流机制。",
      question: "水循环最基本的动力来源是什么？",
    });
  });

  it("拒绝缺少主问题的纯开场", () => {
    expect(
      firstQuestionSchema.safeParse({
        opening: "这份材料主要解释水循环。",
      }).success,
    ).toBe(false);
  });
});
