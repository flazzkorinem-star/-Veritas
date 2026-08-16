import { describe, expect, it } from "vitest";

import { combineKnowledgeMaps } from "./combine-knowledge-maps";
import type { KnowledgeMap } from "./contracts";

function map(part: number): KnowledgeMap {
  const moduleId = `s${part}-m1`;
  const itemId = `s${part}-i1`;
  return {
    modules: [{ id: moduleId, title: `模块 ${part}`, sourceRange: `第 ${part} 段` }],
    knowledgeItems: [
      {
        id: itemId,
        moduleId,
        title: `条目 ${part}`,
        summary: `摘要 ${part}`,
        kind: "CORE",
        diagnosticRationale: `条目 ${part} 是理解材料主线的基础。`,
        sourceReferences: [{ label: `第 ${part} 段`, excerpt: `正文 ${part}` }],
        commonMisconceptions: [],
      },
    ],
    nodes: [
      {
        id: "node-1",
        moduleId,
        title: `主题 ${part}`,
        objective: `理解主题 ${part}`,
        knowledgeItemIds: [itemId],
        sourceReferences: [{ label: `第 ${part} 段`, excerpt: `正文 ${part}` }],
        canonicalUnderstanding: `主题 ${part} 的规范理解。`,
        commonMisconceptions: [],
        bloomTargets: {
          memory: `识别主题 ${part} 的基本概念。`,
          understanding: `解释主题 ${part} 的核心机制。`,
          application: `在具体场景中使用主题 ${part}。`,
          analysis: `分析主题 ${part} 的条件与边界。`,
        },
        order: 1,
      },
    ],
    coverageAssignments: [
      {
        knowledgeItemId: itemId,
        disposition: "DIAGNOSED_IN_NODE",
        nodeId: "node-1",
      },
    ],
  };
}

describe("局部知识地图组合", () => {
  it("只重编号主题及其归属，不改写模型生成的语义字段", () => {
    const first = map(1);
    const second = map(2);

    const combined = combineKnowledgeMaps([first, second]);

    expect(combined.nodes.map(({ id, order }) => ({ id, order }))).toEqual([
      { id: "node-1", order: 1 },
      { id: "node-2", order: 2 },
    ]);
    expect(combined.coverageAssignments).toEqual([
      expect.objectContaining({ knowledgeItemId: "s1-i1", nodeId: "node-1" }),
      expect.objectContaining({ knowledgeItemId: "s2-i1", nodeId: "node-2" }),
    ]);
    expect(combined.nodes[1]!.bloomTargets).toEqual(second.nodes[0]!.bloomTargets);
    expect(combined.knowledgeItems[1]!.diagnosticRationale).toBe(
      second.knowledgeItems[0]!.diagnosticRationale,
    );
  });
});
