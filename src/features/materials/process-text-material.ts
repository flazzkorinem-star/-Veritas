import type { FirstQuestion, KnowledgeMap } from "@/domain/knowledge-map/contracts";
import { buildBudgetedMaterialRequest } from "@/domain/agents/context-budget";
import { combineKnowledgeMaps } from "@/domain/knowledge-map/combine-knowledge-maps";
import type { MaterialProcessingTrace } from "@/domain/materials/processing-trace";
import {
  MATERIAL_MODEL_CONCURRENCY,
  MATERIAL_PROCESSING_MAX_MS,
  MODEL_PROCESSING_MAX_MS,
} from "@/config/agent-limits";

import {
  AgentClientError,
  callAgent,
  type AgentClientDependencies,
} from "./agent-client";
import { buildMaterialShards } from "./build-material-shards";
import { extractMaterialShards } from "./extract-material-shards";
import { MaterialFileError } from "./material-file";
import { parseMaterial } from "./parse-material";
import type { ParsingProgress } from "./parsed-material";
import { prepareCompactCompile } from "./prepare-compact-compile";
import { createSemaphore } from "./concurrency";
import { splitCompactCompileShard } from "./split-compact-compile";

export type MaterialProcessingProgress =
  | { stage: "READING"; loadedBytes: number; totalBytes: number }
  | ParsingProgress
  | {
      stage: "EXTRACTING";
      currentChunk: number;
      totalChunks: number;
      startedAt: number;
    }
  | { stage: "AUDITING"; startedAt: number }
  | { stage: "PREPARING_CONTEXT"; startedAt: number };

export class TextProcessingError extends Error {
  constructor(
    readonly code:
      "NO_RELIABLE_NODE" | "MATERIAL_PROCESSING_TIMEOUT" | "MODEL_PROCESSING_TIMEOUT",
  ) {
    super(
      code === "NO_RELIABLE_NODE"
        ? "没有从材料中找到可靠的学习主题，请检查内容后重试。"
        : code === "MODEL_PROCESSING_TIMEOUT"
          ? "整理材料超过 170 秒，请重试或拆分材料。"
          : "整份材料处理超过 3 分钟，请重试或拆分材料。",
    );
    this.name = "TextProcessingError";
  }
}

export interface TextProcessingResult {
  parsedText: string;
  knowledgeMap: KnowledgeMap;
  firstQuestion: FirstQuestion;
  processingTrace: MaterialProcessingTrace;
}

interface ProcessingDependencies {
  callAgent?: typeof callAgent;
  now?: () => number;
  parseMaterial?: typeof parseMaterial;
  signal?: AbortSignal;
  modelTimeoutMs?: number;
  totalTimeoutMs?: number;
}

function deadline(milliseconds: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), milliseconds);
  return { signal: controller.signal, dispose: () => clearTimeout(timeout) };
}

function combineSignals(...signals: Array<AbortSignal | undefined>) {
  const active = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  return active.length === 1 ? active[0] : AbortSignal.any(active);
}

export async function processTextMaterial(
  file: File,
  onProgress: (progress: MaterialProcessingProgress) => void,
  dependencies: ProcessingDependencies = {},
): Promise<TextProcessingResult> {
  const runAgent = dependencies.callAgent ?? callAgent;
  const now = dependencies.now ?? Date.now;
  const totalDeadline = deadline(
    dependencies.totalTimeoutMs ?? MATERIAL_PROCESSING_MAX_MS,
  );
  const totalSignal = combineSignals(dependencies.signal, totalDeadline.signal);
  try {
    const material = await (dependencies.parseMaterial ?? parseMaterial)(
      file,
      onProgress,
      totalSignal,
    );
    const shards = buildMaterialShards(material.sourceBlocks);
    const sourceUnits = shards.flatMap(({ sourceUnits }) => sourceUnits);
    const startedAt = now();
    const modelDeadline = deadline(
      dependencies.modelTimeoutMs ?? MODEL_PROCESSING_MAX_MS,
    );
    const operationController = new AbortController();
    const modelSignal = combineSignals(
      totalSignal,
      modelDeadline.signal,
      operationController.signal,
    );
    const trace = {
      extractionRequestCount: 0,
      splitCount: 0,
      mergeRequestCount: 0,
      mergeBypassCount: 0,
      compilePartitionCount: 0,
      repairedRequestCount: 0,
    };
    const tracedAgent = ((request, options: AgentClientDependencies = {}) => {
      if (request.operation === "EXTRACT_COMPACT_KNOWLEDGE") {
        trace.extractionRequestCount += 1;
      } else if (request.operation === "MERGE_COMPACT_CANDIDATES") {
        trace.mergeRequestCount += 1;
      }
      return runAgent(request, {
        ...options,
        onMeta(meta) {
          if (meta.repaired) trace.repairedRequestCount += 1;
          options.onMeta?.(meta);
        },
      });
    }) as typeof callAgent;
    try {
      onProgress({
        stage: "EXTRACTING",
        currentChunk: 0,
        totalChunks: shards.length,
        startedAt,
      });
      if (modelSignal.aborted) {
        throw new MaterialFileError("CANCELLED", "已取消处理这份材料。 ");
      }
      const extractedShards = await extractMaterialShards(shards, {
        callAgent: tracedAgent,
        maxConcurrency: MATERIAL_MODEL_CONCURRENCY,
        onSplit: () => {
          trace.splitCount += 1;
        },
        signal: modelSignal,
        onProgress: (currentChunk, totalChunks) =>
          onProgress({
            stage: "EXTRACTING",
            currentChunk,
            totalChunks,
            startedAt,
          }),
      });

      onProgress({ stage: "AUDITING", startedAt });
      const compileShards = await prepareCompactCompile(extractedShards, {
        callAgent: tracedAgent,
        onBypass: () => {
          trace.mergeBypassCount += 1;
        },
        signal: modelSignal,
      });
      const acquireCompile = createSemaphore(MATERIAL_MODEL_CONCURRENCY);
      const compilePartition = async (
        shard: (typeof compileShards)[number],
        splitDepth = 0,
      ): Promise<KnowledgeMap[]> => {
        const release = await acquireCompile();
        try {
          const covered = new Set(shard.extraction.sourceCoverage);
          return [
            await tracedAgent(
              {
                operation: "COMPILE_KNOWLEDGE_MAP",
                input: {
                  sourceUnits: sourceUnits.filter(({ id }) => covered.has(id)),
                  shards: [shard],
                },
              },
              { signal: modelSignal },
            ),
          ];
        } catch (error) {
          const children =
            error instanceof AgentClientError &&
            error.code === "MODEL_OUTPUT_INVALID" &&
            splitDepth < 2
              ? splitCompactCompileShard(shard)
              : null;
          if (!children) throw error;
          trace.splitCount += 1;
          release();
          return (
            await Promise.all(
              children.map((child) => compilePartition(child, splitDepth + 1)),
            )
          ).flat();
        } finally {
          release();
        }
      };
      const localMaps = (await Promise.all(compileShards.map(compilePartition))).flat();
      trace.compilePartitionCount = localMaps.length;
      if (localMaps.every(({ nodes }) => nodes.length === 0)) {
        throw new TextProcessingError("NO_RELIABLE_NODE");
      }
      const knowledgeMap = combineKnowledgeMaps(localMaps);
      const firstNode = knowledgeMap.nodes.toSorted(
        (left, right) => left.order - right.order,
      )[0];
      if (!firstNode) throw new TextProcessingError("NO_RELIABLE_NODE");

      const nodeItemIds = new Set(firstNode.knowledgeItemIds);
      onProgress({ stage: "PREPARING_CONTEXT", startedAt });
      const firstQuestionRequest = buildBudgetedMaterialRequest({
        materialTitle: material.fileName,
        modules: knowledgeMap.modules,
        knowledgeItems: knowledgeMap.knowledgeItems,
        currentKnowledgeItemIds: nodeItemIds,
        recentMessages: [],
        createRequest: (materialContext) =>
          ({
            operation: "CREATE_FIRST_QUESTION",
            input: {
              stage: "MEMORY",
              materialContext,
              node: firstNode,
              knowledgeItems: knowledgeMap.knowledgeItems.filter((item) =>
                nodeItemIds.has(item.id),
              ),
              learningGoal: null,
            },
          }) as const,
      });
      const firstQuestion = await tracedAgent(firstQuestionRequest, {
        signal: modelSignal,
      });
      return {
        parsedText: material.text,
        knowledgeMap,
        firstQuestion,
        processingTrace: {
          ...trace,
          deterministicFallbackCount: 0,
          finalCompileSource: "MODEL_VALIDATED",
        },
      };
    } catch (error) {
      operationController.abort();
      if (dependencies.signal?.aborted) throw error;
      if (totalDeadline.signal.aborted) {
        throw new TextProcessingError("MATERIAL_PROCESSING_TIMEOUT");
      }
      if (modelDeadline.signal.aborted) {
        throw new TextProcessingError("MODEL_PROCESSING_TIMEOUT");
      }
      throw error;
    } finally {
      modelDeadline.dispose();
    }
  } catch (error) {
    if (dependencies.signal?.aborted) throw error;
    if (totalDeadline.signal.aborted && !(error instanceof TextProcessingError)) {
      throw new TextProcessingError("MATERIAL_PROCESSING_TIMEOUT");
    }
    throw error;
  } finally {
    totalDeadline.dispose();
  }
}
