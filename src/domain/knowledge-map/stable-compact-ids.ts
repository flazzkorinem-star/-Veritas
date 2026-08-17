import { compactExtractionSchema, type CompactExtraction } from "./compact-contracts";
import { getMaterialShardPath } from "./shard-id";

export function namespaceCompactExtraction(
  shardId: string,
  value: CompactExtraction,
): CompactExtraction {
  const shardPath = getMaterialShardPath(shardId);
  if (!shardPath) throw new Error("分片 ID 无效。");
  const namespace = shardPath.replaceAll("-", "_");
  const extraction = compactExtractionSchema.parse(value);

  const moduleIds = new Map(
    extraction.modules.map((module, index) => [module.id, `s${namespace}-m${index + 1}`]),
  );
  const itemIds = new Map(
    extraction.knowledgeItems.map((item, index) => [
      item.id,
      `s${namespace}-i${index + 1}`,
    ]),
  );

  return compactExtractionSchema.parse({
    modules: extraction.modules.map((module, index) => ({
      ...module,
      id: `s${namespace}-m${index + 1}`,
    })),
    knowledgeItems: extraction.knowledgeItems.map((item, index) => ({
      ...item,
      id: `s${namespace}-i${index + 1}`,
      moduleId: moduleIds.get(item.moduleId),
    })),
    topicDrafts: extraction.topicDrafts.map((topic, index) => ({
      ...topic,
      id: `s${namespace}-t${index + 1}`,
      moduleId: moduleIds.get(topic.moduleId),
      knowledgeItemIds: topic.knowledgeItemIds.map((id) => itemIds.get(id)),
    })),
    sourceCoverage: extraction.sourceCoverage,
  });
}
