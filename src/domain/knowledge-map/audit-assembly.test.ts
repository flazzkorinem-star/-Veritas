import { describe, expect, it } from "vitest";

import { assembleKnowledgeAudit, knowledgeAuditSchema } from "./audit-assembly";

function extractedChunk(chunkNumber: number, text: string) {
  const prefix = `c${chunkNumber}`;
  return {
    chunkId: `chunk-${chunkNumber}`,
    extraction: {
      modules: [
        {
          id: `${prefix}-m1`,
          title: `模块 ${chunkNumber}`,
          sourceRange: `第 ${chunkNumber} 段`,
        },
      ],
      knowledgeItems: [
        {
          id: `${prefix}-i1`,
          moduleId: `${prefix}-m1`,
          title: "循环动力",
          summary: `${text}说明了循环动力。`,
          kind: "SUPPORTING" as const,
          diagnosticRationale: "原始理由",
          sourceReferences: [{ label: `第 ${chunkNumber} 段`, excerpt: text }],
          commonMisconceptions: [`误解 ${chunkNumber}`],
        },
      ],
    },
  };
}

const compactAudit = {
  mergeGroups: [
    {
      id: "group-1",
      sourceKnowledgeItemIds: ["c1-i1", "c2-i1"],
      diagnosticRationale: "这是理解循环机制的前提。",
      canonical: {
        title: "循环的共同动力",
        summary: "两个来源共同说明太阳能驱动循环。",
      },
    },
  ],
  nodes: [
    {
      id: "draft-node",
      title: "循环动力",
      objective: "解释太阳能如何驱动循环。",
      canonicalUnderstanding: "太阳能提供状态变化所需能量。",
      commonMisconceptions: [],
      bloomTargets: {
        memory: "说出动力。",
        understanding: "解释作用。",
        application: "判断场景。",
        analysis: "分析关系。",
      },
      order: 7,
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

describe("精简审计确定性组装", () => {
  it("从合并谱系恢复最终条目、来源、类型、节点和来源覆盖", () => {
    const chunks = [
      extractedChunk(1, "太阳驱动蒸发。"),
      extractedChunk(2, "热量推动状态变化。"),
    ];
    const result = assembleKnowledgeAudit(
      chunks,
      knowledgeAuditSchema.parse(compactAudit),
    );

    expect(result.knowledgeMap.modules).toHaveLength(2);
    expect(result.knowledgeMap.knowledgeItems).toEqual([
      expect.objectContaining({
        id: "c1-i1",
        moduleId: "c1-m1",
        title: "循环的共同动力",
        kind: "CORE",
        diagnosticRationale: "这是理解循环机制的前提。",
        sourceReferences: [
          { label: "第 1 段", excerpt: "太阳驱动蒸发。" },
          { label: "第 2 段", excerpt: "热量推动状态变化。" },
        ],
      }),
    ]);
    expect(result.knowledgeMap.nodes).toEqual([
      expect.objectContaining({
        id: "node-1",
        moduleId: "c1-m1",
        knowledgeItemIds: ["c1-i1"],
        order: 1,
      }),
    ]);
    expect(result.knowledgeMap.coverageAssignments).toEqual([
      {
        knowledgeItemId: "c1-i1",
        disposition: "DIAGNOSED_IN_NODE",
        nodeId: "node-1",
      },
    ]);
    expect(result.sourceCoverage).toEqual([
      { chunkId: "chunk-1", knowledgeItemIds: ["c1-i1"] },
      { chunkId: "chunk-2", knowledgeItemIds: ["c1-i1"] },
    ]);
  });

  it("拒绝合并谱系漏掉任何原始条目", () => {
    const chunks = [
      extractedChunk(1, "太阳驱动蒸发。"),
      extractedChunk(2, "热量推动状态变化。"),
    ];
    const audit = structuredClone(compactAudit);
    audit.mergeGroups[0]!.sourceKnowledgeItemIds = ["c1-i1"];

    expect(() =>
      assembleKnowledgeAudit(chunks, knowledgeAuditSchema.parse(audit)),
    ).toThrow("审计合并谱系没有完整覆盖原始知识条目。");

    try {
      assembleKnowledgeAudit(chunks, knowledgeAuditSchema.parse(audit));
    } catch (error) {
      expect(error).toMatchObject({
        details: ["AUDIT_KNOWLEDGE_MAP:lineage.missing.c2-i1:custom"],
      });
    }
  });

  it("要求每个合并组明确给出最终诊断理由", () => {
    const audit = structuredClone(compactAudit) as {
      mergeGroups: Array<Record<string, unknown>>;
    };
    delete audit.mergeGroups[0]!.diagnosticRationale;

    expect(knowledgeAuditSchema.safeParse(audit).success).toBe(false);
  });
});
