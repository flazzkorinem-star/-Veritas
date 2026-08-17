import type { CompactExtraction } from "@/domain/knowledge-map/compact-contracts";
import { namespaceCompactExtraction } from "@/domain/knowledge-map/stable-compact-ids";

import { AgentClientError, callAgent } from "./agent-client";
import type { MaterialShard } from "./build-material-shards";
import { createSemaphore } from "./concurrency";

interface ExtractionResult {
  shardId: string;
  extraction: CompactExtraction;
}

interface ExtractionDependencies {
  callAgent?: typeof callAgent;
  maxConcurrency?: number;
  onProgress?: (completedLeafShards: number, totalLeafShards: number) => void;
  onSplit?: () => void;
  signal?: AbortSignal;
}

function splitShard(shard: MaterialShard): [MaterialShard, MaterialShard] | null {
  if (shard.sourceUnits.length < 2) return null;
  const middle = Math.ceil(shard.sourceUnits.length / 2);
  return [1, 2].map((part) => {
    const sourceUnits =
      part === 1 ? shard.sourceUnits.slice(0, middle) : shard.sourceUnits.slice(middle);
    return {
      shardId: `${shard.shardId}-${part}`,
      sourceUnits,
    };
  }) as [MaterialShard, MaterialShard];
}

export async function extractMaterialShards(
  shards: MaterialShard[],
  dependencies: ExtractionDependencies = {},
): Promise<ExtractionResult[]> {
  const invokeAgent = dependencies.callAgent ?? callAgent;
  const acquire = createSemaphore(dependencies.maxConcurrency ?? 4);
  let completed = 0;
  let total = shards.length;

  const extract = async (
    shard: MaterialShard,
    splitDepth = 0,
  ): Promise<ExtractionResult[]> => {
    const release = await acquire();
    let released = false;
    try {
      const extraction = await invokeAgent(
        {
          operation: "EXTRACT_COMPACT_KNOWLEDGE",
          input: { shardId: shard.shardId, sourceUnits: shard.sourceUnits },
        },
        { signal: dependencies.signal },
      );
      completed += 1;
      dependencies.onProgress?.(completed, total);
      return [
        {
          shardId: shard.shardId,
          extraction: namespaceCompactExtraction(shard.shardId, extraction),
        },
      ];
    } catch (error) {
      const isStructuralFailure =
        error instanceof AgentClientError && error.code === "MODEL_OUTPUT_INVALID";
      if (!isStructuralFailure) throw error;
      const children = splitShard(shard);
      if (splitDepth >= 1 || !children) {
        throw error;
      }
      release();
      released = true;
      dependencies.onSplit?.();
      total += 1;
      dependencies.onProgress?.(completed, total);
      return (
        await Promise.all(children.map((child) => extract(child, splitDepth + 1)))
      ).flat();
    } finally {
      if (!released) release();
    }
  };

  return (await Promise.all(shards.map(extract))).flat();
}
