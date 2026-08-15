import { describe, expect, it } from "vitest";

import { assembleCompactKnowledgeMap } from "./compact-assembly";
import { buildCompactFallbackAudit } from "./compact-fallback-audit";

const sourceUnits = [
  { id: "source-1", sourceLabel: "第 1 页", text: "定义与边界。" },
  { id: "source-2", sourceLabel: "第 2 页", text: "案例与应用。" },
] as const;
const shards = [
  {
    shardId: "shard-1",
    extraction: {
      modules: [
        { id: "s1-m1", title: "核心概念", sourceUnitIds: ["source-1"] },
        { id: "s1-m2", title: "实际应用", sourceUnitIds: ["source-2"] },
      ],
      knowledgeItems: [
        {
          id: "s1-i1",
          moduleId: "s1-m1",
          title: "概念边界",
          summary: "概念有明确适用边界。",
          sourceUnitIds: ["source-1"],
          commonMisconceptions: [],
        },
        {
          id: "s1-i2",
          moduleId: "s1-m2",
          title: "应用条件",
          summary: "应用必须结合具体条件。",
          sourceUnitIds: ["source-2"],
          commonMisconceptions: ["任何场景都能直接套用。"],
        },
      ],
      topicDrafts: [
        {
          id: "s1-t1",
          moduleId: "s1-m1",
          title: "概念边界",
          objective: "理解边界。",
          knowledgeItemIds: ["s1-i1"],
        },
      ],
      sourceCoverage: ["source-1", "source-2"],
    },
  },
];

describe("最终编译的确定性降级", () => {
  it("按模块生成可校验主题，并让每个候选恰好归属一次", () => {
    const audit = buildCompactFallbackAudit(shards);
    const result = assembleCompactKnowledgeMap(
      [...sourceUnits],
      shards,
      audit,
    ).knowledgeMap;

    expect(result.nodes).toHaveLength(2);
    expect(result.knowledgeItems).toHaveLength(2);
    expect(result.coverageAssignments).toEqual([
      expect.objectContaining({
        knowledgeItemId: "s1-i1",
        disposition: "DIAGNOSED_IN_NODE",
      }),
      expect.objectContaining({
        knowledgeItemId: "s1-i2",
        disposition: "DIAGNOSED_IN_NODE",
      }),
    ]);
    expect(result.nodes[1]).toMatchObject({
      title: "实际应用",
      commonMisconceptions: ["任何场景都能直接套用。"],
    });
  });

  it("同一模块候选很多时按五条拆分主题，守住首问上下文预算", () => {
    const manyItems = Array.from({ length: 12 }, (_, index) => ({
      id: `s1-i${index + 1}`,
      moduleId: "s1-m1",
      title: `条目 ${index + 1}`,
      summary: `摘要 ${index + 1}`,
      sourceUnitIds: ["source-1"],
      commonMisconceptions: [],
    }));
    const audit = buildCompactFallbackAudit([
      {
        shardId: "shard-1",
        extraction: {
          modules: [{ id: "s1-m1", title: "大型模块", sourceUnitIds: ["source-1"] }],
          knowledgeItems: manyItems,
          topicDrafts: [
            {
              id: "s1-t1",
              moduleId: "s1-m1",
              title: "大型模块",
              objective: "掌握模块。",
              knowledgeItemIds: manyItems.slice(0, 12).map(({ id }) => id),
            },
          ],
          sourceCoverage: ["source-1"],
        },
      },
    ]);

    expect(audit.nodes).toHaveLength(3);
    expect(
      audit.nodes.map(
        (node) =>
          audit.assignments.filter(
            (assignment) =>
              assignment.disposition !== "REFERENCE_ONLY" &&
              assignment.nodeId === node.id,
          ).length,
      ),
    ).toEqual([5, 5, 2]);
  });

  it("模块标题达到契约上限时仍能生成合法降级结果", () => {
    const longTitle = "长".repeat(300);
    const audit = buildCompactFallbackAudit([
      {
        shardId: "shard-1",
        extraction: {
          modules: [{ id: "s1-m1", title: longTitle, sourceUnitIds: ["source-1"] }],
          knowledgeItems: Array.from({ length: 6 }, (_, index) => ({
            id: `s1-i${index + 1}`,
            moduleId: "s1-m1",
            title: `条目 ${index + 1}`,
            summary: `摘要 ${index + 1}`,
            sourceUnitIds: ["source-1"],
            commonMisconceptions: [],
          })),
          topicDrafts: [],
          sourceCoverage: ["source-1"],
        },
      },
    ]);

    expect(audit.nodes).toHaveLength(2);
    expect(audit.nodes.every(({ title }) => title.length <= 300)).toBe(true);
    expect(
      audit.nodes.every(({ bloomTargets }) =>
        Object.values(bloomTargets).every((target) => target.length <= 300),
      ),
    ).toBe(true);
  });
});
