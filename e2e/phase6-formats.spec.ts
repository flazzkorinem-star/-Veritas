import { expect, test, type Browser, type Page, type Route } from "@playwright/test";
import JSZip from "jszip";

const successMeta = {
  attempts: 1,
  repaired: false,
  validationSource: "MODEL_VALIDATED",
};

function mockAgentResult(route: Route) {
  const request = route.request().postDataJSON() as {
    operation: string;
    input: {
      sourceLabel?: unknown;
      text?: unknown;
      sourceUnits?: Array<{ id: string; sourceLabel: string; text: string }>;
    };
  };
  if (request.operation === "EXTRACT_COMPACT_KNOWLEDGE") {
    const sourceUnitIds = request.input.sourceUnits!.map(({ id }) => id);
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        result: {
          modules: [{ id: "module-1", title: "水循环", sourceUnitIds }],
          knowledgeItems: [
            {
              id: "item-1",
              moduleId: "module-1",
              title: "水循环过程",
              summary: "水在太阳能作用下循环。",
              sourceUnitIds,
              commonMisconceptions: [],
            },
          ],
          topicDrafts: [
            {
              id: "topic-1",
              moduleId: "module-1",
              title: "水循环过程",
              objective: "解释水循环的主要过程。",
              knowledgeItemIds: ["item-1"],
            },
          ],
          sourceCoverage: sourceUnitIds,
        },
        meta: successMeta,
      }),
    });
  }
  if (request.operation === "COMPILE_KNOWLEDGE_MAP") {
    const sourceReferences = request.input.sourceUnits!.map((unit) => ({
      label: unit.sourceLabel,
      excerpt: unit.text.slice(0, 120),
    }));
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        result: {
          modules: [
            { id: "s1-m1", title: "水循环", sourceRange: sourceReferences[0]!.label },
          ],
          knowledgeItems: [
            {
              id: "s1-i1",
              moduleId: "s1-m1",
              title: "水循环过程",
              summary: "水在太阳能作用下循环。",
              kind: "CORE",
              diagnosticRationale: "这是理解材料的基础。",
              sourceReferences,
              commonMisconceptions: [],
            },
          ],
          nodes: [
            {
              id: "node-1",
              moduleId: "s1-m1",
              title: "水循环过程",
              objective: "解释水循环的主要过程。",
              knowledgeItemIds: ["s1-i1"],
              sourceReferences,
              canonicalUnderstanding: "水在太阳能作用下发生蒸发、凝结和降水。",
              commonMisconceptions: [],
              bloomTargets: {
                memory: "说出主要过程。",
                understanding: "解释过程联系。",
                application: "判断生活中的现象。",
                analysis: "分析条件变化的影响。",
              },
              order: 1,
            },
          ],
          coverageAssignments: [
            {
              knowledgeItemId: "s1-i1",
              disposition: "DIAGNOSED_IN_NODE",
              nodeId: "node-1",
            },
          ],
        },
        meta: successMeta,
      }),
    });
  }
  return route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      result: {
        opening: "这份材料主要讲水循环中的关键过程。",
        question: "太阳能在水循环中起什么作用？",
      },
      meta: successMeta,
    }),
  });
}

async function docxBuffer() {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/document.xml",
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DOCX WATER CYCLE</w:t></w:r></w:p><w:p><w:r><w:t>Solar energy drives evaporation.</w:t></w:r></w:p></w:body></w:document>',
  );
  return Buffer.from(await zip.generateAsync({ type: "uint8array" }));
}

async function pptxBuffer() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file("_rels/.rels", "<Relationships/>");
  zip.file(
    "ppt/presentation.xml",
    '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId r:id="rId2"/><p:sldId r:id="rId1"/></p:sldIdLst></p:presentation>',
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>',
  );
  zip.file(
    "ppt/slides/slide1.xml",
    '<p:sld xmlns:p="p" xmlns:a="a"><a:t>FIRST SLIDE</a:t></p:sld>',
  );
  zip.file(
    "ppt/slides/slide2.xml",
    '<p:sld xmlns:p="p" xmlns:a="a"><a:t>SECOND SLIDE</a:t></p:sld>',
  );
  return Buffer.from(await zip.generateAsync({ type: "uint8array" }));
}

async function makeVisualBuffer(browser: Browser, mimeType: string) {
  const producer = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  await producer.setContent('<canvas id="source" width="1200" height="700"></canvas>');
  const dataUrl = await producer.evaluate((type) => {
    const canvas = document.querySelector("canvas")!;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "black";
    context.font = "bold 110px Arial";
    context.fillText("WATER CYCLE", 170, 300);
    context.font = "64px Arial";
    context.fillText("EVAPORATION AND RAIN", 120, 440);
    return canvas.toDataURL(type, 0.95);
  }, mimeType);
  await producer.close();
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

async function makePdf(browser: Browser, scanned: boolean) {
  const producer = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  if (scanned) {
    await producer.setContent('<canvas id="source" width="1000" height="700"></canvas>');
    await producer.evaluate(() => {
      const canvas = document.querySelector("canvas")!;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "black";
      context.font = "bold 92px Arial";
      context.fillText("SCANNED WATER CYCLE", 30, 300);
      context.font = "58px Arial";
      context.fillText("EVAPORATION RAIN", 180, 430);
    });
  } else {
    await producer.setContent(
      '<main style="font: 48px Arial"><h1>TEXT PDF WATER CYCLE</h1><p>Solar energy drives evaporation and rain.</p></main>',
    );
  }
  const buffer = await producer.pdf({ format: "A4", printBackground: true });
  await producer.close();
  return buffer;
}

async function storedMaterial(page: Page, fileName: string) {
  return page.evaluate(
    (name) =>
      new Promise<{ parsedText: string; sourceLabel: string }>((resolve, reject) => {
        const request = indexedDB.open("veritas");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const all = database
            .transaction("materials", "readonly")
            .objectStore("materials")
            .getAll();
          all.onerror = () => reject(all.error);
          all.onsuccess = () => {
            const material = all.result.find((value) => value.fileName === name);
            resolve({
              parsedText: material?.parsedText ?? "",
              sourceLabel:
                material?.knowledgeItems?.[0]?.sourceReferences?.[0]?.label ?? "",
            });
            database.close();
          };
        };
      }),
    fileName,
  );
}

async function uploadAndWait(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
  problems: string[] = [],
) {
  await page.locator("#workspace-upload").setInputFiles(file);
  await expect(
    page.getByRole("heading", { name: file.name.replace(/\.[^.]+$/u, "") }),
  ).toBeVisible();
  const message = page.getByLabel("维塔的消息");
  const failed = page.getByText("这份材料暂时没能准备好");
  await Promise.race([
    message.waitFor({ state: "visible", timeout: 120_000 }),
    failed.waitFor({ state: "visible", timeout: 120_000 }),
  ]);
  if (await failed.isVisible()) {
    const reason = await failed.locator("..").locator("p").innerText();
    throw new Error(
      `${file.name} 处理失败：${reason}；浏览器问题：${problems.join(" | ") || "无"}`,
    );
  }
}

test("桌面端全部支持格式都能生成可追溯文字", async ({ page, browser }, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-edge",
    "全格式矩阵仅在桌面 Edge 执行一次。 ",
  );
  test.setTimeout(360_000);
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("requestfailed", (request) =>
    problems.push(`请求失败 ${request.url()}：${request.failure()?.errorText ?? "未知"}`),
  );
  await page.route("**/api/agents", mockAgentResult);
  await page.goto("/");

  const files = [
    {
      name: "format-md.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# WATER CYCLE\nSolar energy drives evaporation."),
    },
    {
      name: "format-txt.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("WATER CYCLE\nEvaporation creates water vapor."),
    },
    {
      name: "format-docx.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: await docxBuffer(),
    },
    {
      name: "format-pptx.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      buffer: await pptxBuffer(),
    },
    {
      name: "format-pdf.pdf",
      mimeType: "application/pdf",
      buffer: await makePdf(browser, false),
    },
    {
      name: "format-scan.pdf",
      mimeType: "application/pdf",
      buffer: await makePdf(browser, true),
    },
    {
      name: "format-png.png",
      mimeType: "image/png",
      buffer: await makeVisualBuffer(browser, "image/png"),
    },
    {
      name: "format-jpeg.jpeg",
      mimeType: "image/jpeg",
      buffer: await makeVisualBuffer(browser, "image/jpeg"),
    },
    {
      name: "format-webp.webp",
      mimeType: "image/webp",
      buffer: await makeVisualBuffer(browser, "image/webp"),
    },
  ];

  for (const file of files) {
    await uploadAndWait(page, file, problems);
    const stored = await storedMaterial(page, file.name);
    expect(stored.parsedText.length, file.name).toBeGreaterThan(8);
    expect(stored.sourceLabel.length, file.name).toBeGreaterThan(1);
  }
  expect((await storedMaterial(page, "format-docx.docx")).sourceLabel).toContain("段");
  expect((await storedMaterial(page, "format-pptx.pptx")).sourceLabel).toContain(
    "幻灯片",
  );
  expect((await storedMaterial(page, "format-pdf.pdf")).sourceLabel).toContain("页");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("phase6-all-formats.png") });
  expect(problems).toEqual([]);
});

test("移动端图片 OCR 后仍保持完整主流程布局", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-edge", "移动布局只在移动 Edge 执行。 ");
  test.setTimeout(180_000);
  await page.route("**/api/agents", mockAgentResult);
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("requestfailed", (request) =>
    problems.push(`请求失败 ${request.url()}：${request.failure()?.errorText ?? "未知"}`),
  );
  await page.goto("/");
  await uploadAndWait(
    page,
    {
      name: "mobile-ocr.png",
      mimeType: "image/png",
      buffer: await makeVisualBuffer(browser, "image/png"),
    },
    problems,
  );
  await expect(page.getByLabel("维塔的消息")).toContainText(
    "这份材料主要讲水循环中的关键过程",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("phase6-mobile-ocr.png") });
  expect(problems).toEqual([]);
});
