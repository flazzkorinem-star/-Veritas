import {
  compactExtractionSchema,
  type CompactExtraction,
} from "@/domain/knowledge-map/compact-contracts";

import { AgentClientError, callAgent } from "./agent-client";
import { createSemaphore } from "./concurrency";

export interface CompactCompileShard {
  shardId: string;
  extraction: CompactExtraction;
}

interface PrepareDependencies {
  callAgent?: typeof callAgent;
  maxBatchItems?: number;
  maxConcurrency?: number;
  maxFinalItems?: number;
  onBypass?: () => void;
  signal?: AbortSignal;
}

function itemCount(shards: CompactCompileShard[]) {
  return shards.reduce(
    (total, { extraction }) => total + extraction.knowledgeItems.length,
    0,
  );
}

function groupShards(shards: CompactCompileShard[], maxItems: number) {
  const groups: CompactCompileShard[][] = [];
  for (const shard of shards) {
    const current = groups.at(-1);
    if (!current || itemCount(current) + itemCount([shard]) > maxItems) {
      groups.push([shard]);
    } else {
      current.push(shard);
    }
  }
  return groups;
}

function rebuildPartition(
  group: CompactCompileShard[],
  knowledgeItems: CompactExtraction["knowledgeItems"],
  index: number,
) {
  const allModules = group.flatMap(({ extraction }) => extraction.modules);
  const moduleById = new Map(
    allModules.map((materialModule) => [materialModule.id, materialModule]),
  );
  const modules = [
    ...new Map(
      knowledgeItems.map((item) => [item.moduleId, moduleById.get(item.moduleId)!]),
    ).values(),
  ];
  const sourceCoverage = [
    ...new Set(group.flatMap(({ extraction }) => extraction.sourceCoverage)),
  ];
  return {
    shardId: `shard-${index + 1}`,
    extraction: compactExtractionSchema.parse({
      modules,
      knowledgeItems,
      topicDrafts: knowledgeItems.map((item, itemIndex) => ({
        id: `merge${index + 1}-t${itemIndex + 1}`,
        moduleId: item.moduleId,
        title: item.title,
        objective: `掌握${item.title}`,
        knowledgeItemIds: [item.id],
      })),
      sourceCoverage,
    }),
  };
}

export async function prepareCompactCompile(
  shards: CompactCompileShard[],
  dependencies: PrepareDependencies = {},
): Promise<CompactCompileShard[]> {
  const maxBatchItems = dependencies.maxBatchItems ?? 60;
  const maxFinalItems = dependencies.maxFinalItems ?? 80;
  if (itemCount(shards) <= maxFinalItems) return shards;

  const invokeAgent = dependencies.callAgent ?? callAgent;
  const acquire = createSemaphore(dependencies.maxConcurrency ?? 4);
  let usedBypass = false;
  async function mergeGroup(
    group: CompactCompileShard[],
    index: number,
  ): Promise<CompactCompileShard[]> {
    const knowledgeItems = group.flatMap(({ extraction }) => extraction.knowledgeItems);
    if (knowledgeItems.length < 2) return group;

    try {
      const release = await acquire();
      let canonicalItems: CompactExtraction["knowledgeItems"];
      try {
        canonicalItems = await invokeAgent(
          {
            operation: "MERGE_COMPACT_CANDIDATES",
            input: { knowledgeItems },
          },
          { signal: dependencies.signal },
        );
      } finally {
        release();
      }
      return [rebuildPartition(group, canonicalItems, index)];
    } catch (error) {
      if (error instanceof AgentClientError && error.code === "UPSTREAM_UNAVAILABLE") {
        usedBypass = true;
        dependencies.onBypass?.();
        return group;
      }
      if (!(error instanceof AgentClientError) || error.code !== "MODEL_OUTPUT_INVALID") {
        throw error;
      }
      if (group.length === 1) {
        usedBypass = true;
        dependencies.onBypass?.();
        return group;
      }

      const middle = Math.ceil(group.length / 2);
      const [left, right] = await Promise.all([
        mergeGroup(group.slice(0, middle), index * 2),
        mergeGroup(group.slice(middle), index * 2 + 1),
      ]);
      return [...left, ...right];
    }
  }

  let partitions = shards;
  for (let round = 0; round < 3; round += 1) {
    const before = itemCount(partitions);
    const groups = groupShards(partitions, maxBatchItems);
    const merged = await Promise.all(
      groups.map((group, index) => mergeGroup(group, index)),
    );
    partitions = merged.flat();
    const after = itemCount(partitions);
    if (after <= maxFinalItems || after >= before || usedBypass) break;
  }
  return partitions.map((partition, index) => ({
    ...partition,
    shardId: `shard-${index + 1}`,
  }));
}
