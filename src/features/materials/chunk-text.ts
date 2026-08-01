export interface TextChunk {
  chunkId: string;
  sourceLabel: string;
  text: string;
}

const DEFAULT_CHUNK_SIZE = 15_000;
const MAX_CHUNKS = 40;

function readableBreak(text: string, start: number, proposedEnd: number) {
  if (proposedEnd === text.length) return proposedEnd;
  const minimum = start + Math.floor((proposedEnd - start) / 2);
  for (const marker of ["\n\n", "\n", "。", "！", "？"]) {
    const position = text.lastIndexOf(marker, proposedEnd);
    if (position >= minimum) return position + marker.length;
  }
  return proposedEnd;
}

export function chunkText(text: string, maxCharacters = DEFAULT_CHUNK_SIZE) {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) throw new Error("没有可分块的文字。");
  if (!Number.isInteger(maxCharacters) || maxCharacters < 1) {
    throw new Error("分块大小无效。");
  }

  const headingStarts = [...normalized.matchAll(/^#{1,6}[ \t]+.+$/gm)].map(
    (match) => match.index,
  );
  const semanticStarts = headingStarts.slice(1);
  if (semanticStarts[0] !== undefined && headingStarts[0] !== undefined) {
    const firstHeadingEnd = normalized.indexOf("\n", headingStarts[0]);
    if (normalized.slice(firstHeadingEnd, semanticStarts[0]).trim() === "") {
      semanticStarts.shift();
    }
  }
  const starts = [0, ...semanticStarts];

  function buildChunks(boundaries: number[], size: number) {
    const chunks: Omit<TextChunk, "chunkId">[] = [];
    for (const [index, rangeStart] of boundaries.entries()) {
      const rangeEnd = boundaries[index + 1] ?? normalized.length;
      let cursor = rangeStart;
      while (cursor < rangeEnd) {
        const proposedEnd = Math.min(cursor + size, rangeEnd);
        const end = readableBreak(normalized, cursor, proposedEnd);
        const raw = normalized.slice(cursor, end);
        const leadingWhitespace = raw.length - raw.trimStart().length;
        const content = raw.trim();
        if (content) {
          const sourceStart = cursor + leadingWhitespace + 1;
          chunks.push({
            sourceLabel: `字符 ${sourceStart}–${sourceStart + content.length - 1}`,
            text: content,
          });
        }
        cursor = end;
      }
    }
    return chunks;
  }

  let chunks = buildChunks(starts, maxCharacters);
  if (chunks.length > MAX_CHUNKS) {
    chunks = buildChunks(
      [0],
      Math.max(maxCharacters, Math.ceil(normalized.length / MAX_CHUNKS)),
    );
  }
  return chunks.map((chunk, index) => ({ chunkId: `chunk-${index + 1}`, ...chunk }));
}
