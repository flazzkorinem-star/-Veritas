import { compactExtractionSchema, type MaterialSourceUnit } from "./compact-contracts";

export function buildCompactFallbackExtraction(sourceUnits: MaterialSourceUnit[]) {
  return compactExtractionSchema.parse({
    modules: sourceUnits.map((unit, index) => ({
      id: `module-${index + 1}`,
      title: unit.sourceLabel,
      sourceUnitIds: [unit.id],
    })),
    knowledgeItems: sourceUnits.map((unit, index) => ({
      id: `item-${index + 1}`,
      moduleId: `module-${index + 1}`,
      title: unit.sourceLabel,
      summary: unit.text.replace(/\s+/gu, " ").slice(0, 500),
      sourceUnitIds: [unit.id],
      commonMisconceptions: [],
    })),
    topicDrafts: sourceUnits.map((unit, index) => ({
      id: `topic-${index + 1}`,
      moduleId: `module-${index + 1}`,
      title: unit.sourceLabel,
      objective: `理解并能说明${unit.sourceLabel}的核心内容。`,
      knowledgeItemIds: [`item-${index + 1}`],
    })),
    sourceCoverage: sourceUnits.map(({ id }) => id),
  });
}
