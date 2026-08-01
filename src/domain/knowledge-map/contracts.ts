import { z } from "zod";

const idSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9_-]+$/);
const shortTextSchema = z.string().trim().min(1).max(300);
const sourceReferenceSchema = z
  .object({
    label: shortTextSchema,
    excerpt: z.string().trim().min(1).max(800),
  })
  .strict();

export const materialModuleSchema = z
  .object({ id: idSchema, title: shortTextSchema, sourceRange: shortTextSchema })
  .strict();

export const knowledgeItemSchema = z
  .object({
    id: idSchema,
    moduleId: idSchema,
    title: shortTextSchema,
    summary: z.string().trim().min(1).max(1_200),
    kind: z.enum(["CORE", "SUPPORTING"]),
    diagnosticRationale: z.string().trim().min(1).max(800),
    sourceReferences: z.array(sourceReferenceSchema).min(1).max(12),
    commonMisconceptions: z.array(shortTextSchema).max(12),
  })
  .strict();

export const diagnosticNodeSchema = z
  .object({
    id: idSchema,
    moduleId: idSchema,
    title: shortTextSchema,
    objective: z.string().trim().min(1).max(800),
    knowledgeItemIds: z.array(idSchema).min(1).max(20),
    sourceReferences: z.array(sourceReferenceSchema).min(1).max(20),
    canonicalUnderstanding: z.string().trim().min(1).max(2_000),
    commonMisconceptions: z.array(shortTextSchema).max(20),
    bloomTargets: z
      .object({
        memory: shortTextSchema,
        understanding: shortTextSchema,
        application: shortTextSchema,
        analysis: shortTextSchema,
      })
      .strict(),
    order: z.number().int().positive(),
  })
  .strict();

export const coverageAssignmentSchema = z.discriminatedUnion("disposition", [
  z
    .object({
      knowledgeItemId: idSchema,
      disposition: z.enum(["DIAGNOSED_IN_NODE", "SUPPORTING_IN_NODE"]),
      nodeId: idSchema,
    })
    .strict(),
  z
    .object({
      knowledgeItemId: idSchema,
      disposition: z.literal("REFERENCE_ONLY"),
      reason: shortTextSchema,
    })
    .strict(),
]);

export const chunkExtractionSchema = z
  .object({
    modules: z.array(materialModuleSchema).min(1).max(40),
    knowledgeItems: z.array(knowledgeItemSchema).min(1).max(120),
  })
  .strict()
  .superRefine((value, context) => {
    const moduleIds = new Set(value.modules.map((module) => module.id));
    for (const item of value.knowledgeItems) {
      if (!moduleIds.has(item.moduleId)) {
        context.addIssue({ code: "custom", message: "知识条目引用了不存在的模块。" });
      }
    }
  });

export const knowledgeMapSchema = z
  .object({
    modules: z.array(materialModuleSchema).min(1).max(500),
    knowledgeItems: z.array(knowledgeItemSchema).min(1).max(2_000),
    nodes: z.array(diagnosticNodeSchema).min(1).max(1_000),
    coverageAssignments: z.array(coverageAssignmentSchema).min(1).max(2_000),
  })
  .strict()
  .superRefine((value, context) => {
    const moduleIds = new Set(value.modules.map((module) => module.id));
    const itemIds = new Set(value.knowledgeItems.map((item) => item.id));
    const nodeIds = new Set(value.nodes.map((node) => node.id));
    const assignments = new Map<string, (typeof value.coverageAssignments)[number]>();

    if (
      moduleIds.size !== value.modules.length ||
      itemIds.size !== value.knowledgeItems.length
    ) {
      context.addIssue({ code: "custom", message: "模块或知识条目 ID 重复。" });
    }
    if (nodeIds.size !== value.nodes.length) {
      context.addIssue({ code: "custom", message: "诊断主题 ID 重复。" });
    }

    for (const item of value.knowledgeItems) {
      if (!moduleIds.has(item.moduleId)) {
        context.addIssue({ code: "custom", message: "知识条目引用了不存在的模块。" });
      }
    }
    for (const node of value.nodes) {
      if (
        !moduleIds.has(node.moduleId) ||
        node.knowledgeItemIds.some((id) => !itemIds.has(id))
      ) {
        context.addIssue({ code: "custom", message: "诊断主题包含无效引用。" });
      }
    }
    for (const assignment of value.coverageAssignments) {
      if (
        !itemIds.has(assignment.knowledgeItemId) ||
        assignments.has(assignment.knowledgeItemId)
      ) {
        context.addIssue({ code: "custom", message: "知识条目覆盖归属无效或重复。" });
      }
      if (
        assignment.disposition !== "REFERENCE_ONLY" &&
        !nodeIds.has(assignment.nodeId)
      ) {
        context.addIssue({ code: "custom", message: "覆盖归属引用了不存在的主题。" });
      }
      assignments.set(assignment.knowledgeItemId, assignment);
    }
    for (const item of value.knowledgeItems) {
      const assignment = assignments.get(item.id);
      if (!assignment) {
        context.addIssue({ code: "custom", message: "知识条目没有覆盖归属。" });
      } else if (item.kind === "CORE" && assignment.disposition !== "DIAGNOSED_IN_NODE") {
        context.addIssue({
          code: "custom",
          message: "核心知识条目必须进入主要诊断主题。",
        });
      }
    }
  });

export const firstQuestionSchema = z
  .object({
    opening: z
      .string()
      .trim()
      .min(1)
      .max(300)
      .refine((value) => !/[?？]/.test(value), "开场必须是陈述句。"),
    question: z.string().trim().min(1).max(600),
  })
  .strict();

export type KnowledgeMap = z.infer<typeof knowledgeMapSchema>;
export type ChunkExtraction = z.infer<typeof chunkExtractionSchema>;
export type FirstQuestion = z.infer<typeof firstQuestionSchema>;
