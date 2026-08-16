import { compactExtractionSchema } from "@/domain/knowledge-map/compact-contracts";

import type { CompactCompileShard } from "./prepare-compact-compile";

function unique(values: string[]) {
  return [...new Set(values)];
}

export function splitCompactCompileShard(
  shard: CompactCompileShard,
): [CompactCompileShard, CompactCompileShard] | null {
  const { extraction } = shard;
  const items = extraction.knowledgeItems;
  if (items.length < 2) return null;

  const parents = items.map((_, index) => index);
  const find = (index: number): number => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]!]!;
      index = parents[index]!;
    }
    return index;
  };
  const join = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
  };
  const sourceOwner = new Map<string, number>();
  const moduleOwner = new Map<string, number>();
  items.forEach((item, index) => {
    const sameModule = moduleOwner.get(item.moduleId);
    if (sameModule === undefined) moduleOwner.set(item.moduleId, index);
    else join(index, sameModule);
    for (const sourceUnitId of item.sourceUnitIds) {
      const owner = sourceOwner.get(sourceUnitId);
      if (owner === undefined) sourceOwner.set(sourceUnitId, index);
      else join(index, owner);
    }
  });

  const components = new Map<number, typeof items>();
  items.forEach((item, index) => {
    const root = find(index);
    const component = components.get(root) ?? [];
    component.push(item);
    components.set(root, component);
  });
  const groups = [...components.values()];
  if (groups.length < 2) return null;
  let splitAt = 0;
  let leftSize = 0;
  const target = Math.ceil(items.length / 2);
  while (splitAt < groups.length - 1 && leftSize < target) {
    leftSize += groups[splitAt]!.length;
    splitAt += 1;
  }
  const halves = [groups.slice(0, splitAt).flat(), groups.slice(splitAt).flat()];

  const children = halves.map((knowledgeItems, index) => {
    const itemIds = new Set(knowledgeItems.map(({ id }) => id));
    const moduleIds = new Set(knowledgeItems.map(({ moduleId }) => moduleId));
    const modules = extraction.modules
      .filter(({ id }) => moduleIds.has(id))
      .map((materialModule) => ({
        ...materialModule,
        sourceUnitIds: unique(
          knowledgeItems
            .filter(({ moduleId }) => moduleId === materialModule.id)
            .flatMap(({ sourceUnitIds }) => sourceUnitIds),
        ),
      }));
    const topicDrafts = extraction.topicDrafts.flatMap((topic) => {
      const knowledgeItemIds = topic.knowledgeItemIds.filter((id) => itemIds.has(id));
      return knowledgeItemIds.length ? [{ ...topic, knowledgeItemIds }] : [];
    });
    if (topicDrafts.length === 0) return null;
    return {
      shardId: `${shard.shardId}-${index + 1}`,
      extraction: compactExtractionSchema.parse({
        modules,
        knowledgeItems,
        topicDrafts,
        sourceCoverage: unique(
          knowledgeItems.flatMap(({ sourceUnitIds }) => sourceUnitIds),
        ),
      }),
    };
  });
  return children.every(Boolean)
    ? (children as [CompactCompileShard, CompactCompileShard])
    : null;
}
