import { describe, expect, it } from "vitest";

import { knowledgeMapSchema, topicOpeningSchema, type KnowledgeMap } from "./contracts";

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

describe("主题开场契约", () => {
  it("接收材料判断与自然对话，不要求诊断问题", () => {
    expect(
      topicOpeningSchema.parse({
        assistantMessage:
          "这份材料把水循环分成自然过程和城市影响两部分。你如果是为了复习考试，我会先抓动力和径流这两个容易混的点。",
      }),
    ).toEqual({
      assistantMessage:
        "这份材料把水循环分成自然过程和城市影响两部分。你如果是为了复习考试，我会先抓动力和径流这两个容易混的点。",
    });
  });

  it("拒绝旧的强制首题结构", () => {
    expect(
      topicOpeningSchema.safeParse({
        opening: "我们从水循环开始。",
        question: "主要动力是什么？",
      }).success,
    ).toBe(false);
  });
});
