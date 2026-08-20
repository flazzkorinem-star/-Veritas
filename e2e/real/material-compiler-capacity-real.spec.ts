import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { writeFileSync } from "node:fs";

const MIB = 1_024 * 1_024;

function chineseParagraph(index: number) {
  const topics = [
    "自然水循环与能量来源",
    "蒸发蒸腾与凝结条件",
    "降水下渗与地下水补给",
    "城市硬化地表与径流",
    "排水能力地形与内涝",
    "透水铺装和雨水花园",
    "绿色屋顶的截留边界",
    "极端降雨与设施容量",
    "洪峰削减和峰值延迟",
    "多种措施与管网协同",
    "常见误解和适用条件",
    "案例比较与方案权衡",
  ];
  const topic = topics[index % topics.length]!;
  const sentence = `${topic}：太阳能、重力、地表条件和设施容量共同影响水的状态变化与移动路径；判断具体方案时必须区分正常设计降雨和超过容量的极端情形。`;
  return `第 ${index + 1} 段。${sentence.repeat(14)}`;
}

async function largeTextNativeDocx() {
  const paragraphs: string[] = [];
  while (paragraphs.join("\n\n").length < 280_000) {
    paragraphs.push(chineseParagraph(paragraphs.length));
  }
  const parsedText = paragraphs.join("\n\n").slice(0, 280_000);
  const normalizedParagraphs = parsedText.split("\n\n");
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${normalizedParagraphs.map((paragraph) => `<w:p><w:r><w:t>${paragraph}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`,
  );
  zip.file("word/media/padding.bin", new Uint8Array(Math.floor(4.85 * MIB)), {
    compression: "STORE",
  });
  const buffer = Buffer.from(
    await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }),
  );
  return { buffer, parsedCharacters: parsedText.length };
}

test("约 5 MiB 文本型 DOCX 在三分钟内生成完整地图与首问", async ({ page }, testInfo) => {
  test.skip(
    process.env.VERITAS_REAL_DEEPSEEK !== "1" ||
      process.env.RUN_REAL_PERFORMANCE !== "1" ||
      testInfo.project.name !== "desktop-edge",
    "仅在显式容量验收时调用真实 DeepSeek。",
  );
  test.setTimeout(240_000);

  const { buffer, parsedCharacters } = await largeTextNativeDocx();
  expect(buffer.byteLength).toBeGreaterThanOrEqual(4.8 * MIB);
  expect(buffer.byteLength).toBeLessThanOrEqual(5 * MIB);
  expect(parsedCharacters).toBeGreaterThanOrEqual(275_000);
  expect(parsedCharacters).toBeLessThanOrEqual(300_000);
  const fixturePath = testInfo.outputPath("large-text-native.docx");
  writeFileSync(fixturePath, buffer);

  const requests: Array<{
    operation: string;
    requestUnit: string;
    status: number;
    bytes: number;
  }> = [];
  page.on("response", (response) => {
    if (!response.url().endsWith("/api/agents")) return;
    const request = response.request();
    const body = request.postDataJSON() as {
      operation?: string;
      input?: { shardId?: string; shards?: Array<{ shardId?: string }> };
    } | null;
    const operation = body?.operation ?? "UNKNOWN";
    requests.push({
      operation,
      requestUnit:
        body?.input?.shardId ??
        body?.input?.shards?.map(({ shardId }) => shardId).join(",") ??
        operation,
      status: response.status(),
      bytes: Buffer.byteLength(request.postData() ?? ""),
    });
  });

  await page.goto("/");
  const startedAt = Date.now();
  await page.locator("#workspace-upload").setInputFiles({
    name: "large-text-native.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer,
  });
  const assistantMessage = page.getByLabel("维塔的消息").first();
  const failed = page.getByText("这份材料暂时没能准备好");
  await Promise.race([
    assistantMessage.waitFor({ state: "visible", timeout: 180_000 }),
    failed.waitFor({ state: "visible", timeout: 180_000 }),
  ]);
  if (await failed.isVisible()) {
    const reason = await failed.locator("..").locator("p").innerText();
    throw new Error(`约 5 MiB 文本型 DOCX 处理失败：${reason}`);
  }
  const elapsedMs = Date.now() - startedAt;

  expect(elapsedMs).toBeLessThanOrEqual(180_000);
  expect(
    requests.filter(({ operation }) => operation === "EXTRACT_COMPACT_KNOWLEDGE").length,
  ).toBeGreaterThan(4);
  expect(
    requests.filter(
      ({ operation, status }) =>
        status !== 200 &&
        !(
          ["EXTRACT_COMPACT_KNOWLEDGE", "MERGE_COMPACT_CANDIDATES"].includes(operation) &&
          status === 502
        ),
    ),
  ).toEqual([]);
  expect(requests.at(-1)).toMatchObject({
    operation: "CREATE_FIRST_QUESTION",
    status: 200,
  });
  expect(await page.locator(".topic-item").count()).toBeGreaterThan(0);
  const stored = await page.evaluate(
    () =>
      new Promise<{
        parsedLength: number;
        allItemsHaveSources: boolean;
        coreItemsAssignedOnce: boolean;
        processingTrace: {
          compilePartitionCount: number;
          deterministicFallbackCount: number;
          finalCompileSource: string;
        } | null;
      }>((resolve, reject) => {
        const request = indexedDB.open("veritas");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("materials", "readonly");
          const getAll = transaction.objectStore("materials").getAll();
          getAll.onerror = () => reject(getAll.error);
          getAll.onsuccess = () => {
            const material = getAll.result[0];
            const items = material.knowledgeItems as Array<{
              id: string;
              kind: string;
              sourceReferences: unknown[];
            }>;
            const assignments = material.coverageAssignments as Array<{
              knowledgeItemId: string;
              disposition: string;
            }>;
            resolve({
              parsedLength: material.parsedText.length,
              allItemsHaveSources: items.every(
                ({ sourceReferences }) => sourceReferences.length > 0,
              ),
              coreItemsAssignedOnce: items
                .filter(({ kind }) => kind === "CORE")
                .every(
                  ({ id }) =>
                    assignments.filter(
                      (assignment) =>
                        assignment.knowledgeItemId === id &&
                        assignment.disposition === "DIAGNOSED_IN_NODE",
                    ).length === 1,
                ),
              processingTrace: material.processingTrace ?? null,
            });
            database.close();
          };
        };
      }),
  );
  expect(stored).toEqual({
    parsedLength: parsedCharacters,
    allItemsHaveSources: true,
    coreItemsAssignedOnce: true,
    processingTrace: expect.objectContaining({
      compilePartitionCount: expect.any(Number),
      deterministicFallbackCount: 0,
      finalCompileSource: "MODEL_VALIDATED",
    }),
  });
  expect(stored.processingTrace!.compilePartitionCount).toBeGreaterThan(1);
  console.log(
    `REAL_CAPACITY_RESULT ${JSON.stringify({ fileBytes: buffer.byteLength, parsedCharacters, elapsedMs, processingTrace: stored.processingTrace, requests })}`,
  );
});
