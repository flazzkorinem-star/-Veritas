import { z } from "zod";

import { compactKnowledgeItemSchema, type CompactExtraction } from "./compact-contracts";
import { analyzeExactCoverage } from "./exact-coverage";

const idSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9_-]+$/);
const shortTextSchema = z.string().trim().min(1).max(300);

export const compactMergeSchema = z
  .object({
    mergeGroups: z
      .array(
        z
          .object({
            id: idSchema,
            sourceKnowledgeItemIds: z.array(idSchema).min(1).max(120),
            canonical: z
              .object({
                title: shortTextSchema,
                summary: z.string().trim().min(1).max(500),
                commonMisconceptions: z.array(shortTextSchema).max(4),
              })
              .strict(),
          })
          .strict(),
      )
      .min(1)
      .max(120),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      new Set(value.mergeGroups.map(({ id }) => id)).size !== value.mergeGroups.length
    ) {
      context.addIssue({ code: "custom", message: "紧凑合并组 ID 重复。" });
    }
  });

export type CompactMerge = z.infer<typeof compactMergeSchema>;
export const compactMergeResultSchema = z
  .object({
    knowledgeItems: z.array(compactKnowledgeItemSchema).min(1).max(120),
    itemLineage: z
      .array(
        z
          .object({
            knowledgeItemId: idSchema,
            sourceKnowledgeItemIds: z.array(idSchema).min(1).max(120),
          })
          .strict(),
      )
      .min(1)
      .max(120),
  })
  .strict()
  .superRefine((value, context) => {
    const resultIds = value.knowledgeItems.map(({ id }) => id);
    const lineageResultIds = value.itemLineage.map(({ knowledgeItemId }) => knowledgeItemId);
    const sourceIds = value.itemLineage.flatMap(
      ({ sourceKnowledgeItemIds }) => sourceKnowledgeItemIds,
    );
    const resultCoverage = analyzeExactCoverage(resultIds, lineageResultIds);
    if (
      resultCoverage.missing.length ||
      resultCoverage.duplicate.length ||
      resultCoverage.unknown.length ||
      new Set(sourceIds).size !== sourceIds.length
    ) {
      context.addIssue({ code: "custom", message: "紧凑归并结果谱系无效。" });
    }
  });

export type CompactMergeResult = z.infer<typeof compactMergeResultSchema>;

export class CompactMergeError extends Error {
  constructor(readonly details: string[]) {
    super("紧凑归并谱系没有完整覆盖候选知识条目。");
    this.name = "CompactMergeError";
  }
}

export function assembleCompactMerge(
  itemValues: CompactExtraction["knowledgeItems"],
  mergeValue: CompactMerge,
) {
  const items = z.array(compactKnowledgeItemSchema).min(1).max(120).parse(itemValues);
  const merge = compactMergeSchema.parse(mergeValue);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const itemOrder = new Map(items.map(({ id }, index) => [id, index]));
  const lineage = merge.mergeGroups.flatMap(
    ({ sourceKnowledgeItemIds }) => sourceKnowledgeItemIds,
  );
  const { missing, duplicate, unknown } = analyzeExactCoverage(
    items.map(({ id }) => id),
    lineage,
  );
  if (missing.length || duplicate.length || unknown.length) {
    throw new CompactMergeError([
      ...missing.map((id) => `MERGE_COMPACT_CANDIDATES:lineage.missing.${id}:custom`),
      ...duplicate.map((id) => `MERGE_COMPACT_CANDIDATES:lineage.duplicate.${id}:custom`),
      ...unknown.map((id) => `MERGE_COMPACT_CANDIDATES:lineage.unknown.${id}:custom`),
    ]);
  }

  const orderedGroups = merge.mergeGroups.toSorted(
    (left, right) =>
      Math.min(...left.sourceKnowledgeItemIds.map((id) => itemOrder.get(id)!)) -
      Math.min(...right.sourceKnowledgeItemIds.map((id) => itemOrder.get(id)!)),
  );
  const knowledgeItems = orderedGroups.map((group) => {
    const merged = group.sourceKnowledgeItemIds.map((id) => itemById.get(id)!);
    const first = merged[0]!;
    return compactKnowledgeItemSchema.parse({
      ...first,
      title: group.canonical.title,
      summary: group.canonical.summary,
      sourceUnitIds: [...new Set(merged.flatMap(({ sourceUnitIds }) => sourceUnitIds))],
      commonMisconceptions: group.canonical.commonMisconceptions,
    });
  });
  return compactMergeResultSchema.parse({
    knowledgeItems,
    itemLineage: orderedGroups.map((group, index) => ({
      knowledgeItemId: knowledgeItems[index]!.id,
      sourceKnowledgeItemIds: group.sourceKnowledgeItemIds,
    })),
  });
}
