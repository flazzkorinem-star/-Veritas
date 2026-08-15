import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { agentOperationRequestSchema } from "../src/domain/agents/contracts";
import { buildMaterialShards } from "../src/features/materials/build-material-shards";
import { parseDocx } from "../src/features/materials/docx-parser";

for (const fileName of ["AI Agent笔记.docx", "AI PM求职逐字稿.docx"]) {
  test(`${fileName} 的分片满足 Agent 请求契约`, async ({}, testInfo) => {
    test.skip(
      process.env.RUN_SIX_MATERIAL_JOURNEY !== "1" ||
        testInfo.project.name !== "desktop-edge",
      "仅在显式验收用户真实材料时读取测试文件。",
    );
    const bytes = new Uint8Array(
      readFileSync(path.join(process.cwd(), "测试文件", fileName)),
    );
    const parsed = await parseDocx(
      bytes,
      fileName,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    const shards = buildMaterialShards(parsed.sourceBlocks);
    const failures = shards.flatMap((shard) => {
      const result = agentOperationRequestSchema.safeParse({
        operation: "EXTRACT_COMPACT_KNOWLEDGE",
        input: { shardId: shard.shardId, sourceUnits: shard.sourceUnits },
      });
      return result.success
        ? []
        : [
            {
              shardId: shard.shardId,
              sourceUnits: shard.sourceUnits.length,
              issues: result.error.issues.map((issue) => ({
                path: issue.path.join("."),
                code: issue.code,
              })),
            },
          ];
    });
    console.log(
      `REAL_CONTRACT_RESULT ${JSON.stringify({ fileName, parsedCharacters: parsed.text.length, shardCount: shards.length, failures })}`,
    );
    expect(failures).toEqual([]);
  });
}
