import { knowledgeAuditSchema, type KnowledgeAudit } from "./knowledge-audit-contracts";
import type { CompactExtraction } from "./compact-contracts";

interface CompactShard {
  shardId: string;
  extraction: CompactExtraction;
}

function shortText(value: string): string {
  return value.slice(0, 300);
}

export function buildCompactFallbackAudit(shards: CompactShard[]): KnowledgeAudit {
  const modules = shards.flatMap(({ extraction }) => extraction.modules);
  const items = shards.flatMap(({ extraction }) => extraction.knowledgeItems);
  const itemsByModule = new Map(
    modules.map((module) => [
      module.id,
      items.filter((item) => item.moduleId === module.id),
    ]),
  );
  const nodeGroups = modules.flatMap((module) => {
    const moduleItems = itemsByModule.get(module.id) ?? [];
    const groups = [];
    for (let start = 0; start < moduleItems.length; start += 5) {
      groups.push({
        module,
        items: moduleItems.slice(start, start + 5),
        part: groups.length + 1,
      });
    }
    return groups;
  });
  const groupIdByItem = new Map(
    items.map((item, index) => [item.id, `fallback-group-${index + 1}`]),
  );

  return knowledgeAuditSchema.parse({
    mergeGroups: items.map((item) => ({
      id: groupIdByItem.get(item.id)!,
      sourceKnowledgeItemIds: [item.id],
      diagnosticRationale: `用于检验对“${item.title}”的理解及应用边界。`,
    })),
    nodes: nodeGroups.map(({ module, items: groupItems, part }, index) => {
      const summaries = groupItems.map(({ summary }) => summary).join("；");
      const title = shortText(
        part === 1 ? module.title : `${module.title.slice(0, 290)}（${part}）`,
      );
      return {
        id: `fallback-node-${index + 1}`,
        title,
        objective: `理解并能应用${title}的核心内容。`,
        canonicalUnderstanding: summaries.slice(0, 2_000),
        commonMisconceptions: [
          ...new Set(
            groupItems.flatMap(({ commonMisconceptions }) => commonMisconceptions),
          ),
        ].slice(0, 20),
        bloomTargets: {
          memory: shortText(`说出${title}的核心要点。`),
          understanding: shortText(`解释${title}中的关键关系。`),
          application: shortText(`把${title}用于一个具体情境。`),
          analysis: shortText(`分析${title}的条件、边界与影响。`),
        },
        order: index + 1,
      };
    }),
    assignments: nodeGroups.flatMap((group, nodeIndex) =>
      group.items.map((item, itemIndex) => ({
        groupId: groupIdByItem.get(item.id)!,
        disposition: itemIndex === 0 ? "DIAGNOSED_IN_NODE" : "SUPPORTING_IN_NODE",
        nodeId: `fallback-node-${nodeIndex + 1}`,
      })),
    ),
  });
}
