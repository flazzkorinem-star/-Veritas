import type { FirstQuestion, KnowledgeMap } from "@/domain/knowledge-map/contracts";

import { callAgent } from "./agent-client";
import { chunkSourceBlocks } from "./chunk-source-blocks";
import { MaterialFileError } from "./material-file";
import { parseMaterial } from "./parse-material";
import type { ParsingProgress } from "./parsed-material";

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
  | { stage: "PREPARING_QUESTION"; startedAt: number };

export class TextProcessingError extends Error {
  constructor(readonly code: "NO_RELIABLE_NODE") {
    super("没有从材料中找到可靠的学习主题，请检查内容后重试。");
    this.name = "TextProcessingError";
  }
}

export interface TextProcessingResult {
  parsedText: string;
  knowledgeMap: KnowledgeMap;
  firstQuestion: FirstQuestion;
}

interface ProcessingDependencies {
  callAgent?: typeof callAgent;
  now?: () => number;
  parseMaterial?: typeof parseMaterial;
  signal?: AbortSignal;
}

export async function processTextMaterial(
  file: File,
  onProgress: (progress: MaterialProcessingProgress) => void,
  dependencies: ProcessingDependencies = {},
): Promise<TextProcessingResult> {
  const runAgent = dependencies.callAgent ?? callAgent;
  const now = dependencies.now ?? Date.now;
  const material = await (dependencies.parseMaterial ?? parseMaterial)(
    file,
    onProgress,
    dependencies.signal,
  );
  const chunks = chunkSourceBlocks(material.sourceBlocks);
  const startedAt = now();
  const extractedChunks = [];

  for (const [index, chunk] of chunks.entries()) {
    if (dependencies.signal?.aborted) {
      throw new MaterialFileError("CANCELLED", "已取消处理这份材料。 ");
    }
    onProgress({
      stage: "EXTRACTING",
      currentChunk: index + 1,
      totalChunks: chunks.length,
      startedAt,
    });
    extractedChunks.push({
      chunkId: chunk.chunkId,
      extraction: await runAgent({ operation: "EXTRACT_KNOWLEDGE", input: chunk }),
    });
  }

  if (dependencies.signal?.aborted) {
    throw new MaterialFileError("CANCELLED", "已取消处理这份材料。 ");
  }
  onProgress({ stage: "AUDITING", startedAt });
  const knowledgeMap = await runAgent({
    operation: "AUDIT_KNOWLEDGE_MAP",
    input: { chunks: extractedChunks },
  });
  const firstNode = knowledgeMap.nodes.toSorted(
    (left, right) => left.order - right.order,
  )[0];
  if (!firstNode) throw new TextProcessingError("NO_RELIABLE_NODE");

  const nodeItemIds = new Set(firstNode.knowledgeItemIds);
  if (dependencies.signal?.aborted) {
    throw new MaterialFileError("CANCELLED", "已取消处理这份材料。 ");
  }
  onProgress({ stage: "PREPARING_QUESTION", startedAt });
  const firstQuestion = await runAgent({
    operation: "CREATE_FIRST_QUESTION",
    input: {
      materialTitle: material.fileName,
      node: firstNode,
      knowledgeItems: knowledgeMap.knowledgeItems.filter((item) =>
        nodeItemIds.has(item.id),
      ),
    },
  });

  return { parsedText: material.text, knowledgeMap, firstQuestion };
}
