import { z } from "zod";

import { knowledgeMapSchema, type ChunkExtraction, type KnowledgeMap } from "./contracts";

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
    mergeGroups: z.array(mergeGroupSchema).min(1).max(2_000),
    nodes: z.array(auditNodeSchema).min(1).max(1_000),
    assignments: z.array(auditAssignmentSchema).min(1).max(2_000),
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

interface AuditChunk {
  chunkId: string;
  extraction: ChunkExtraction;
}

export class KnowledgeAuditAssemblyError extends Error {
  constructor(
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = "KnowledgeAuditAssemblyError";
  }
}

function uniqueBy<T>(values: T[], key: (value: T) => string) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const id = key(value);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function assembleKnowledgeAudit(
  chunks: AuditChunk[],
  audit: KnowledgeAudit,
): {
  knowledgeMap: KnowledgeMap;
  sourceCoverage: Array<{ chunkId: string; knowledgeItemIds: string[] }>;
} {
  const modules = chunks.flatMap((chunk) => chunk.extraction.modules);
  const sourceItems = chunks.flatMap((chunk) => chunk.extraction.knowledgeItems);
  const itemOrder = new Map(sourceItems.map((item, index) => [item.id, index]));
  const itemById = new Map(sourceItems.map((item) => [item.id, item]));
  const lineageIds = audit.mergeGroups.flatMap((group) => group.sourceKnowledgeItemIds);
  const lineageCounts = new Map<string, number>();
  for (const id of lineageIds) {
    lineageCounts.set(id, (lineageCounts.get(id) ?? 0) + 1);
  }
  const missingIds = sourceItems
    .map((item) => item.id)
    .filter((id) => !lineageCounts.has(id));
  const duplicateIds = [...lineageCounts]
    .filter(([, count]) => count > 1)
    .map(([id]) => id);
  const unknownIds = [...lineageCounts.keys()].filter((id) => !itemById.has(id));
  if (
    duplicateIds.length > 0 ||
    lineageIds.length !== sourceItems.length ||
    unknownIds.length > 0 ||
    missingIds.length > 0
  ) {
    throw new KnowledgeAuditAssemblyError("审计合并谱系没有完整覆盖原始知识条目。", [
      ...missingIds.map((id) => `AUDIT_KNOWLEDGE_MAP:lineage.missing.${id}:custom`),
      ...duplicateIds.map((id) => `AUDIT_KNOWLEDGE_MAP:lineage.duplicate.${id}:custom`),
      ...unknownIds.map((id) => `AUDIT_KNOWLEDGE_MAP:lineage.unknown.${id}:custom`),
    ]);
  }

  const assignments = new Map(
    audit.assignments.map((assignment) => [assignment.groupId, assignment]),
  );
  const orderedGroups = audit.mergeGroups.toSorted(
    (left, right) =>
      Math.min(...left.sourceKnowledgeItemIds.map((id) => itemOrder.get(id)!)) -
      Math.min(...right.sourceKnowledgeItemIds.map((id) => itemOrder.get(id)!)),
  );
  const finalItemByGroup = new Map<string, KnowledgeMap["knowledgeItems"][number]>();
  for (const group of orderedGroups) {
    const merged = group.sourceKnowledgeItemIds
      .map((id) => itemById.get(id)!)
      .toSorted((left, right) => itemOrder.get(left.id)! - itemOrder.get(right.id)!);
    const first = merged[0]!;
    const assignment = assignments.get(group.id)!;
    finalItemByGroup.set(group.id, {
      ...first,
      id: first.id,
      title: group.canonical?.title ?? first.title,
      summary: group.canonical?.summary ?? first.summary,
      kind: assignment.disposition === "DIAGNOSED_IN_NODE" ? "CORE" : "SUPPORTING",
      diagnosticRationale: group.diagnosticRationale,
      sourceReferences: uniqueBy(
        merged.flatMap((item) => item.sourceReferences),
        (reference) => `${reference.label}\u0000${reference.excerpt}`,
      ),
      commonMisconceptions: group.canonical?.commonMisconceptions ?? [
        ...new Set(merged.flatMap((item) => item.commonMisconceptions)),
      ],
    });
  }

  const orderedNodes = audit.nodes.toSorted((left, right) => left.order - right.order);
  const nodeIds = new Map(
    orderedNodes.map((node, index) => [node.id, `node-${index + 1}`]),
  );
  const knowledgeItems = orderedGroups.map((group) => finalItemByGroup.get(group.id)!);
  const nodes = orderedNodes.map((node, index) => {
    const nodeAssignments = audit.assignments.filter(
      (assignment) =>
        assignment.disposition !== "REFERENCE_ONLY" && assignment.nodeId === node.id,
    );
    if (
      !nodeAssignments.some(
        (assignment) => assignment.disposition === "DIAGNOSED_IN_NODE",
      )
    ) {
      throw new KnowledgeAuditAssemblyError("诊断主题没有主要诊断条目。");
    }
    const items = nodeAssignments
      .map((assignment) => finalItemByGroup.get(assignment.groupId)!)
      .toSorted(
        (left, right) =>
          knowledgeItems.findIndex((item) => item.id === left.id) -
          knowledgeItems.findIndex((item) => item.id === right.id),
      );
    return {
      ...node,
      id: `node-${index + 1}`,
      order: index + 1,
      moduleId: items[0]!.moduleId,
      knowledgeItemIds: items.map((item) => item.id),
      sourceReferences: uniqueBy(
        items.flatMap((item) => item.sourceReferences),
        (reference) => `${reference.label}\u0000${reference.excerpt}`,
      ),
    };
  });
  const coverageAssignments = orderedGroups.map((group) => {
    const assignment = assignments.get(group.id)!;
    const knowledgeItemId = finalItemByGroup.get(group.id)!.id;
    return assignment.disposition === "REFERENCE_ONLY"
      ? {
          knowledgeItemId,
          disposition: assignment.disposition,
          reason: assignment.reason,
        }
      : {
          knowledgeItemId,
          disposition: assignment.disposition,
          nodeId: nodeIds.get(assignment.nodeId)!,
        };
  });
  const knowledgeMap = knowledgeMapSchema.parse({
    modules,
    knowledgeItems,
    nodes,
    coverageAssignments,
  });
  const sourceCoverage = chunks.map((chunk) => {
    const chunkItems = new Set(chunk.extraction.knowledgeItems.map((item) => item.id));
    return {
      chunkId: chunk.chunkId,
      knowledgeItemIds: orderedGroups
        .filter((group) => group.sourceKnowledgeItemIds.some((id) => chunkItems.has(id)))
        .map((group) => finalItemByGroup.get(group.id)!.id),
    };
  });
  if (sourceCoverage.some((entry) => entry.knowledgeItemIds.length === 0)) {
    throw new KnowledgeAuditAssemblyError("来源分块没有最终知识条目覆盖。");
  }
  return { knowledgeMap, sourceCoverage };
}
