import type { FirstQuestion, KnowledgeMap } from "@/domain/knowledge-map/contracts";

import { callAgent } from "./agent-client";
import { chunkText } from "./chunk-text";
import { readTextMaterial } from "./text-reader";

export type MaterialProcessingProgress =
  | { stage: "READING"; loadedBytes: number; totalBytes: number }
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
}

export async function processTextMaterial(
  file: File,
  onProgress: (progress: MaterialProcessingProgress) => void,
  dependencies: ProcessingDependencies = {},
): Promise<TextProcessingResult> {
  const runAgent = dependencies.callAgent ?? callAgent;
  const now = dependencies.now ?? Date.now;
  const material = await readTextMaterial(file, (progress) =>
    onProgress({ stage: "READING", ...progress }),
  );
  const chunks = chunkText(material.text);
  const startedAt = now();
  const extractedChunks = [];

  for (const [index, chunk] of chunks.entries()) {
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
