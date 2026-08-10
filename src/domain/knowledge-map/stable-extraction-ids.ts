import { chunkExtractionSchema, type ChunkExtraction } from "./contracts";

export function namespaceChunkExtraction(
  chunkId: string,
  value: ChunkExtraction,
): ChunkExtraction {
  const extraction = chunkExtractionSchema.parse(value);
  const chunkNumber = /^chunk-([1-9][0-9]*)$/.exec(chunkId)?.[1];
  if (!chunkNumber) throw new Error("分块 ID 无效。");

  const moduleIds = new Map(
    extraction.modules.map((module, index) => [
      module.id,
      `c${chunkNumber}-m${index + 1}`,
    ]),
  );
  return chunkExtractionSchema.parse({
    modules: extraction.modules.map((module, index) => ({
      ...module,
      id: `c${chunkNumber}-m${index + 1}`,
    })),
    knowledgeItems: extraction.knowledgeItems.map((item, index) => ({
      ...item,
      id: `c${chunkNumber}-i${index + 1}`,
      moduleId: moduleIds.get(item.moduleId),
    })),
  });
}
