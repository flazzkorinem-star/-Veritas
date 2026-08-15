import { z } from "zod";

import { type KnowledgeAudit } from "./knowledge-audit-contracts";
import {
  compactExtractionSchema,
  materialSourceUnitSchema,
  type CompactExtraction,
  type MaterialSourceUnit,
} from "./compact-contracts";
import { knowledgeMapSchema, type KnowledgeMap } from "./contracts";

interface CompactShard {
  shardId: string;
  extraction: CompactExtraction;
}

export class CompactAssemblyError extends Error {
  constructor(
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = "CompactAssemblyError";
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

function validateSourceCoverage(
  sourceUnits: MaterialSourceUnit[],
  shards: CompactShard[],
) {
  const expectedIds = sourceUnits.map(({ id }) => id);
  const coverageIds = shards.flatMap(({ extraction }) => extraction.sourceCoverage);
  const counts = new Map<string, number>();
  for (const id of coverageIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const missing = expectedIds.filter((id) => !counts.has(id));
  const duplicate = [...counts].filter(([, count]) => count > 1).map(([id]) => id);
  const expected = new Set(expectedIds);
  const unknown = [...counts.keys()].filter((id) => !expected.has(id));
  if (missing.length || duplicate.length || unknown.length) {
    throw new CompactAssemblyError("分片没有恰好覆盖全部来源单元。", [
      ...missing.map((id) => `COMPILE_KNOWLEDGE_MAP:source.missing.${id}:custom`),
      ...duplicate.map((id) => `COMPILE_KNOWLEDGE_MAP:source.duplicate.${id}:custom`),
      ...unknown.map((id) => `COMPILE_KNOWLEDGE_MAP:source.unknown.${id}:custom`),
    ]);
  }
}

function validateLineage(
  sourceItems: CompactExtraction["knowledgeItems"],
  audit: KnowledgeAudit,
) {
  const itemIds = new Set(sourceItems.map(({ id }) => id));
  const lineage = audit.mergeGroups.flatMap(
    ({ sourceKnowledgeItemIds }) => sourceKnowledgeItemIds,
  );
  const counts = new Map<string, number>();
  for (const id of lineage) counts.set(id, (counts.get(id) ?? 0) + 1);
  const missing = sourceItems.map(({ id }) => id).filter((id) => !counts.has(id));
  const duplicate = [...counts].filter(([, count]) => count > 1).map(([id]) => id);
  const unknown = [...counts.keys()].filter((id) => !itemIds.has(id));
  if (missing.length || duplicate.length || unknown.length) {
    throw new CompactAssemblyError("归并谱系没有完整覆盖候选知识条目。", [
      ...missing.map((id) => `COMPILE_KNOWLEDGE_MAP:lineage.missing.${id}:custom`),
      ...duplicate.map((id) => `COMPILE_KNOWLEDGE_MAP:lineage.duplicate.${id}:custom`),
      ...unknown.map((id) => `COMPILE_KNOWLEDGE_MAP:lineage.unknown.${id}:custom`),
    ]);
  }
}

function combinedRange(labels: string[]) {
  const unique = [...new Set(labels)];
  const range = unique.length === 1 ? unique[0]! : `${unique[0]} 至 ${unique.at(-1)}`;
  return range.slice(0, 300);
}

export function assembleCompactKnowledgeMap(
  sourceUnitValues: MaterialSourceUnit[],
  shardValues: CompactShard[],
  audit: KnowledgeAudit,
): {
  knowledgeMap: KnowledgeMap;
  sourceCoverage: Array<{ sourceUnitId: string; knowledgeItemIds: string[] }>;
} {
  const sourceUnits = z.array(materialSourceUnitSchema).min(1).parse(sourceUnitValues);
  const sourceIds = new Set(sourceUnits.map(({ id }) => id));
  if (sourceIds.size !== sourceUnits.length) {
    throw new CompactAssemblyError("来源单元 ID 重复。");
  }
  const sourceById = new Map(sourceUnits.map((unit) => [unit.id, unit]));
  const shards = shardValues.map(({ shardId, extraction }) => ({
    shardId,
    extraction: compactExtractionSchema.parse(extraction),
  }));
  validateSourceCoverage(sourceUnits, shards);

  const modules = shards.flatMap(({ extraction }) => extraction.modules);
  const sourceItems = shards.flatMap(({ extraction }) => extraction.knowledgeItems);
  for (const sourceUnitId of [
    ...modules.flatMap(({ sourceUnitIds }) => sourceUnitIds),
    ...sourceItems.flatMap(({ sourceUnitIds }) => sourceUnitIds),
  ]) {
    if (!sourceIds.has(sourceUnitId)) {
      throw new CompactAssemblyError("候选内容引用了未知来源单元。", [
        `COMPILE_KNOWLEDGE_MAP:source.unknown.${sourceUnitId}:custom`,
      ]);
    }
  }
  validateLineage(sourceItems, audit);

  const itemOrder = new Map(sourceItems.map((item, index) => [item.id, index]));
  const itemById = new Map(sourceItems.map((item) => [item.id, item]));
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
    const references = uniqueBy(
      merged
        .flatMap(({ sourceUnitIds }) => sourceUnitIds)
        .map((id) => sourceById.get(id)!)
        .map(({ sourceLabel, text }) => ({
          label: sourceLabel,
          excerpt: text.slice(0, 800),
        })),
      ({ label, excerpt }) => `${label}\u0000${excerpt}`,
    ).slice(0, 12);
    finalItemByGroup.set(group.id, {
      id: first.id,
      moduleId: first.moduleId,
      title: group.canonical?.title ?? first.title,
      summary: group.canonical?.summary ?? first.summary,
      kind: assignment.disposition === "DIAGNOSED_IN_NODE" ? "CORE" : "SUPPORTING",
      diagnosticRationale: group.diagnosticRationale,
      sourceReferences: references,
      commonMisconceptions: (
        group.canonical?.commonMisconceptions ?? [
          ...new Set(merged.flatMap(({ commonMisconceptions }) => commonMisconceptions)),
        ]
      ).slice(0, 12),
    });
  }

  const materialModules = modules.map(({ id, title, sourceUnitIds }) => ({
    id,
    title,
    sourceRange: combinedRange(
      sourceUnitIds.map((sourceUnitId) => sourceById.get(sourceUnitId)!.sourceLabel),
    ),
  }));
  const knowledgeItems = orderedGroups.map((group) => finalItemByGroup.get(group.id)!);
  const orderedNodes = audit.nodes.toSorted((left, right) => left.order - right.order);
  const finalNodeIds = new Map(
    orderedNodes.map(({ id }, index) => [id, `node-${index + 1}`]),
  );
  const nodes = orderedNodes.map((node, index) => {
    const nodeAssignments = audit.assignments.filter(
      (assignment) =>
        assignment.disposition !== "REFERENCE_ONLY" && assignment.nodeId === node.id,
    );
    if (!nodeAssignments.some(({ disposition }) => disposition === "DIAGNOSED_IN_NODE")) {
      throw new CompactAssemblyError("诊断主题没有主要诊断条目。");
    }
    const items = nodeAssignments.map(({ groupId }) => finalItemByGroup.get(groupId)!);
    return {
      ...node,
      id: `node-${index + 1}`,
      moduleId: items[0]!.moduleId,
      knowledgeItemIds: items.map(({ id }) => id),
      sourceReferences: uniqueBy(
        items.flatMap(({ sourceReferences }) => sourceReferences),
        ({ label, excerpt }) => `${label}\u0000${excerpt}`,
      ).slice(0, 20),
      order: index + 1,
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
          nodeId: finalNodeIds.get(assignment.nodeId)!,
        };
  });
  const knowledgeMap = knowledgeMapSchema.parse({
    modules: materialModules,
    knowledgeItems,
    nodes,
    coverageAssignments,
  });
  const sourceCoverage = sourceUnits.map(({ id }) => ({
    sourceUnitId: id,
    knowledgeItemIds: orderedGroups
      .filter((group) =>
        group.sourceKnowledgeItemIds.some((itemId) =>
          itemById.get(itemId)!.sourceUnitIds.includes(id),
        ),
      )
      .map((group) => finalItemByGroup.get(group.id)!.id),
  }));
  if (sourceCoverage.some(({ knowledgeItemIds }) => knowledgeItemIds.length === 0)) {
    throw new CompactAssemblyError("来源单元没有最终知识条目覆盖。");
  }
  return { knowledgeMap, sourceCoverage };
}
