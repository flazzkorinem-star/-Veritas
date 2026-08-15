import {
  compactExtractionSchema,
  type CompactExtraction,
} from "./compact-contracts";

export function namespaceCompactExtraction(
  shardId: string,
  value: CompactExtraction,
): CompactExtraction {
  const shardNumber = /^shard-([1-9][0-9]*)$/.exec(shardId)?.[1];
  if (!shardNumber) throw new Error("分片 ID 无效。");
  const extraction = compactExtractionSchema.parse(value);

  const moduleIds = new Map(
    extraction.modules.map((module, index) => [
      module.id,
      `s${shardNumber}-m${index + 1}`,
    ]),
  );
  const itemIds = new Map(
    extraction.knowledgeItems.map((item, index) => [
      item.id,
      `s${shardNumber}-i${index + 1}`,
    ]),
  );

  return compactExtractionSchema.parse({
    modules: extraction.modules.map((module, index) => ({
      ...module,
      id: `s${shardNumber}-m${index + 1}`,
    })),
    knowledgeItems: extraction.knowledgeItems.map((item, index) => ({
      ...item,
      id: `s${shardNumber}-i${index + 1}`,
      moduleId: moduleIds.get(item.moduleId),
    })),
    topicDrafts: extraction.topicDrafts.map((topic, index) => ({
      ...topic,
      id: `s${shardNumber}-t${index + 1}`,
      moduleId: moduleIds.get(topic.moduleId),
      knowledgeItemIds: topic.knowledgeItemIds.map((id) => itemIds.get(id)),
    })),
    sourceCoverage: extraction.sourceCoverage,
  });
}
