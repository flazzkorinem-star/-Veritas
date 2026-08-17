import { z } from "zod";

import {
  MAX_DIAGNOSTIC_NODES,
  MAX_KNOWLEDGE_ITEMS,
} from "@/config/knowledge-map-limits";

const idSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9_-]+$/);
const shortTextSchema = z.string().trim().min(1).max(300);

const mergeGroupSchema = z
  .object({
    id: idSchema,
    sourceKnowledgeItemIds: z.array(idSchema).min(1).max(120),
    diagnosticRationale: z.string().trim().min(1).max(800),
    canonical: z
      .object({
        title: shortTextSchema.optional(),
        summary: z.string().trim().min(1).max(1_200).optional(),
        commonMisconceptions: z.array(shortTextSchema).max(12).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const auditNodeSchema = z
  .object({
    id: idSchema,
    title: shortTextSchema,
    objective: z.string().trim().min(1).max(800),
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

const auditAssignmentSchema = z.discriminatedUnion("disposition", [
  z
    .object({
      groupId: idSchema,
      disposition: z.enum(["DIAGNOSED_IN_NODE", "SUPPORTING_IN_NODE"]),
      nodeId: idSchema,
    })
    .strict(),
  z
    .object({
      groupId: idSchema,
      disposition: z.literal("REFERENCE_ONLY"),
      reason: shortTextSchema,
    })
    .strict(),
]);

export const knowledgeAuditSchema = z
  .object({
    mergeGroups: z.array(mergeGroupSchema).min(1).max(MAX_KNOWLEDGE_ITEMS),
    nodes: z.array(auditNodeSchema).min(1).max(MAX_DIAGNOSTIC_NODES),
    assignments: z.array(auditAssignmentSchema).min(1).max(MAX_KNOWLEDGE_ITEMS),
  })
  .strict()
  .superRefine((value, context) => {
    const groupIds = new Set(value.mergeGroups.map((group) => group.id));
    const nodeIds = new Set(value.nodes.map((node) => node.id));
    const orders = new Set(value.nodes.map((node) => node.order));
    const assignedGroups = new Set(value.assignments.map((item) => item.groupId));
    if (groupIds.size !== value.mergeGroups.length) {
      context.addIssue({ code: "custom", message: "合并组 ID 重复。" });
    }
    if (nodeIds.size !== value.nodes.length || orders.size !== value.nodes.length) {
      context.addIssue({ code: "custom", message: "诊断主题 ID 或顺序重复。" });
    }
    if (
      assignedGroups.size !== value.assignments.length ||
      assignedGroups.size !== groupIds.size ||
      [...groupIds].some((id) => !assignedGroups.has(id))
    ) {
      context.addIssue({ code: "custom", message: "合并组归属缺失、重复或无效。" });
    }
    for (const assignment of value.assignments) {
      if (
        !groupIds.has(assignment.groupId) ||
        (assignment.disposition !== "REFERENCE_ONLY" && !nodeIds.has(assignment.nodeId))
      ) {
        context.addIssue({ code: "custom", message: "合并组归属引用无效。" });
      }
    }
  });

export type KnowledgeAudit = z.infer<typeof knowledgeAuditSchema>;
