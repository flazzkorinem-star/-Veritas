import { chunkText, type TextChunk } from "./chunk-text";
import type { ParsedSourceBlock } from "./parsed-material";

const MAX_CHUNK_CHARACTERS = 15_000;

function combinedLabel(first: string, last: string) {
  return first === last ? first : `${first} 至 ${last}`;
}

export function chunkSourceBlocks(blocks: readonly ParsedSourceBlock[]): TextChunk[] {
  const parts = blocks.flatMap((block) => {
    if (block.text.length <= MAX_CHUNK_CHARACTERS) return [block];
    return chunkText(block.text, MAX_CHUNK_CHARACTERS).map((part, index, all) => ({
      sourceLabel:
        all.length === 1
          ? block.sourceLabel
          : `${block.sourceLabel}（第 ${index + 1} 部分）`,
      text: part.text,
    }));
  });
  const groups: ParsedSourceBlock[][] = [];
  let currentLength = 0;
  for (const part of parts) {
    const current = groups.at(-1);
    if (!current || currentLength + part.text.length > MAX_CHUNK_CHARACTERS) {
      groups.push([part]);
      currentLength = part.text.length;
    } else {
      current.push(part);
      currentLength += part.text.length + 2;
    }
  }
  return groups.map((group, index) => ({
    chunkId: `chunk-${index + 1}`,
    sourceLabel: combinedLabel(group[0].sourceLabel, group.at(-1)?.sourceLabel ?? ""),
    text: group.map((part) => part.text).join("\n\n"),
  }));
}
