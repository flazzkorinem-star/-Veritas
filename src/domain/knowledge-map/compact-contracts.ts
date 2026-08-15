import { z } from "zod";

const idSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const sourceUnitIdSchema = z.string().regex(/^source-[1-9][0-9]*$/);
const shortTextSchema = z.string().trim().min(1).max(300);

export const materialSourceUnitSchema = z
  .object({
    id: sourceUnitIdSchema,
    sourceLabel: shortTextSchema,
    text: z.string().trim().min(1).max(20_000),
  })
  .strict();

const compactModuleSchema = z
  .object({
    id: idSchema,
    title: shortTextSchema,
    sourceUnitIds: z.array(sourceUnitIdSchema).min(1).max(120),
  })
  .strict();

const compactKnowledgeItemSchema = z
  .object({
    id: idSchema,
    moduleId: idSchema,
    title: shortTextSchema,
    summary: z.string().trim().min(1).max(500),
    sourceUnitIds: z.array(sourceUnitIdSchema).min(1).max(40),
    commonMisconceptions: z.array(shortTextSchema).max(4),
  })
  .strict();

const compactTopicDraftSchema = z
  .object({
    id: idSchema,
    moduleId: idSchema,
    title: shortTextSchema,
    objective: z.string().trim().min(1).max(500),
    knowledgeItemIds: z.array(idSchema).min(1).max(20),
  })
  .strict();

function hasDuplicates(values: readonly string[]) {
  return new Set(values).size !== values.length;
}

export const compactExtractionSchema = z
  .object({
    modules: z.array(compactModuleSchema).min(1).max(40),
    knowledgeItems: z.array(compactKnowledgeItemSchema).min(1).max(120),
    topicDrafts: z.array(compactTopicDraftSchema).min(1).max(80),
    sourceCoverage: z.array(sourceUnitIdSchema).min(1).max(400),
  })
  .strict()
  .superRefine((value, context) => {
    const moduleIds = value.modules.map(({ id }) => id);
    const itemIds = value.knowledgeItems.map(({ id }) => id);
    const topicIds = value.topicDrafts.map(({ id }) => id);
    if (
      hasDuplicates(moduleIds) ||
      hasDuplicates(itemIds) ||
      hasDuplicates(topicIds) ||
      hasDuplicates(value.sourceCoverage)
    ) {
      context.addIssue({ code: "custom", message: "紧凑提取包含重复 ID。" });
    }

    const moduleIdSet = new Set(moduleIds);
    const itemIdSet = new Set(itemIds);
    const coverage = new Set(value.sourceCoverage);
    const itemCoverage = new Set(
      value.knowledgeItems.flatMap(({ sourceUnitIds }) => sourceUnitIds),
    );
    if (
      coverage.size !== itemCoverage.size ||
      [...coverage].some((id) => !itemCoverage.has(id))
    ) {
      context.addIssue({ code: "custom", message: "来源单元没有被知识条目完整覆盖。" });
    }

    for (const materialModule of value.modules) {
      if (hasDuplicates(materialModule.sourceUnitIds)) {
        context.addIssue({ code: "custom", message: "模块重复引用来源单元。" });
      }
    }
    for (const item of value.knowledgeItems) {
      if (
        !moduleIdSet.has(item.moduleId) ||
        hasDuplicates(item.sourceUnitIds) ||
        item.sourceUnitIds.some((id) => !coverage.has(id))
      ) {
        context.addIssue({ code: "custom", message: "知识条目引用无效。" });
      }
    }
    for (const topic of value.topicDrafts) {
      if (
        !moduleIdSet.has(topic.moduleId) ||
        hasDuplicates(topic.knowledgeItemIds) ||
        topic.knowledgeItemIds.some((id) => !itemIdSet.has(id))
      ) {
        context.addIssue({ code: "custom", message: "主题草案引用无效。" });
      }
    }
  });

export type CompactExtraction = z.infer<typeof compactExtractionSchema>;
export type MaterialSourceUnit = z.infer<typeof materialSourceUnitSchema>;
