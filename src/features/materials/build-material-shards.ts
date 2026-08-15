import type { ParsedSourceBlock } from "./parsed-material";
import type { MaterialSourceUnit } from "@/domain/knowledge-map/compact-contracts";

export const DEFAULT_SOURCE_UNIT_BYTES = 16 * 1_024;
export const DEFAULT_MATERIAL_SHARD_BYTES = 64 * 1_024;

export interface MaterialShard {
  shardId: string;
  sourceUnits: MaterialSourceUnit[];
  requestBytes: number;
}

interface ShardOptions {
  maxSourceUnitBytes?: number;
  maxShardBytes?: number;
}

const utf8 = new TextEncoder();

function utf8Bytes(value: string) {
  return utf8.encode(value).byteLength;
}

function codePointBytes(codePoint: number) {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

function splitByUtf8Bytes(text: string, maxBytes: number) {
  const parts: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start;
    let bytes = 0;
    let preferredBreak = -1;
    while (end < text.length) {
      const codePoint = text.codePointAt(end)!;
      const width = codePoint > 0xffff ? 2 : 1;
      const nextBytes = bytes + codePointBytes(codePoint);
      if (nextBytes > maxBytes) break;
      end += width;
      bytes = nextBytes;
      if (/\s|[。！？；.!?;]/u.test(text.slice(end - width, end))) {
        preferredBreak = end;
      }
    }
    if (end === start) throw new Error("来源单元字节预算过小，无法容纳一个字符。");
    const cut = preferredBreak > start + (end - start) / 2 ? preferredBreak : end;
    parts.push(text.slice(start, cut));
    start = cut;
  }

  return parts;
}

function requestBytes(sourceUnits: readonly MaterialSourceUnit[]) {
  return utf8Bytes(JSON.stringify({ sourceUnits }));
}

export function buildMaterialShards(
  blocks: readonly ParsedSourceBlock[],
  options: ShardOptions = {},
): MaterialShard[] {
  const maxSourceUnitBytes = options.maxSourceUnitBytes ?? DEFAULT_SOURCE_UNIT_BYTES;
  const maxShardBytes = options.maxShardBytes ?? DEFAULT_MATERIAL_SHARD_BYTES;
  if (maxSourceUnitBytes > maxShardBytes) {
    throw new Error("来源单元字节预算不能大于分片字节预算。");
  }

  let nextSourceId = 1;
  const sourceUnits = blocks.flatMap((block) => {
    const parts = splitByUtf8Bytes(block.text, maxSourceUnitBytes);
    return parts.map((text, index) => ({
      id: `source-${nextSourceId++}`,
      sourceLabel:
        parts.length === 1
          ? block.sourceLabel
          : `${block.sourceLabel}（第 ${index + 1} 部分）`,
      text,
    }));
  });

  const groups: MaterialSourceUnit[][] = [];
  for (const sourceUnit of sourceUnits) {
    const current = groups.at(-1);
    if (!current || requestBytes([...current, sourceUnit]) > maxShardBytes) {
      if (requestBytes([sourceUnit]) > maxShardBytes) {
        throw new Error("来源单元连同结构信息后超过分片字节预算。");
      }
      groups.push([sourceUnit]);
    } else {
      current.push(sourceUnit);
    }
  }

  return groups.map((sourceUnits, index) => ({
    shardId: `shard-${index + 1}`,
    sourceUnits,
    requestBytes: requestBytes(sourceUnits),
  }));
}
