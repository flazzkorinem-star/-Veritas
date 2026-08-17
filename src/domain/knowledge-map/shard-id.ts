export const MATERIAL_SHARD_ID_PATTERN = /^shard-[1-9][0-9]*(?:-[12])*$/;

export function getMaterialShardPath(shardId: string) {
  return MATERIAL_SHARD_ID_PATTERN.test(shardId) ? shardId.slice("shard-".length) : null;
}
