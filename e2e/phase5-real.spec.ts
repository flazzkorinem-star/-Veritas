import { expect, test } from "@playwright/test";
import path from "node:path";

test.skip(
  process.env.VERITAS_REAL_DEEPSEEK !== "1",
  "仅在显式真实模型验收时调用 DeepSeek。",
);

test("真实 Markdown 经 DeepSeek 生成完整主题与首问", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const browserProblems: string[] = [];
  const agentStatuses: number[] = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      browserProblems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => browserProblems.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.url().endsWith("/api/agents")) agentStatuses.push(response.status());
  });

  await page.goto("/");
  await page
    .locator("#workspace-upload")
    .setInputFiles(
      path.join(process.cwd(), "tests", "fixtures", "end-to-end", "water-cycle.md"),
    );

  const firstMessageLocator = page.getByLabel("维塔的消息");
  const failed = page.getByText("这份材料暂时没能准备好");
  await Promise.race([
    firstMessageLocator.waitFor({ state: "visible", timeout: 220_000 }),
    failed.waitFor({ state: "visible", timeout: 220_000 }),
  ]);
  if (await failed.isVisible()) {
    const reason = await failed.locator("..").locator("p").innerText();
    throw new Error(
      `真实模型链路失败：${reason}；API 状态：${agentStatuses.join(",") || "无响应"}`,
    );
  }
  await expect(firstMessageLocator).toBeVisible();
  expect(await page.locator(".topic-module").count()).toBeGreaterThanOrEqual(3);
  expect(await page.locator(".topic-item").count()).toBeGreaterThan(0);
  expect(agentStatuses.length).toBeGreaterThanOrEqual(3);
  expect(agentStatuses.every((status) => status === 200)).toBe(true);

  const firstMessage = await page.getByLabel("维塔的消息").innerText();
  expect(firstMessage).not.toMatch(/我已经分析了你的材料|我们将全面覆盖|现在让我们开始/);
  expect(firstMessage.length).toBeGreaterThan(12);
  expect(firstMessage.match(/[?？]/g)?.length ?? 0).toBeLessThanOrEqual(1);
  const coverageChecks = await page.evaluate(
    () =>
      new Promise<{
        naturalCycle: boolean;
        urbanImpact: boolean;
        spongeBoundary: boolean;
        coreItemsAssignedOnce: boolean;
        allItemsHaveSources: boolean;
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
            const knowledgeItems = material.knowledgeItems as Array<{
              id: string;
              kind: string;
              title: string;
              summary: string;
              diagnosticRationale: string;
              sourceReferences: unknown[];
            }>;
            const assignments = material.coverageAssignments as Array<{
              knowledgeItemId: string;
              disposition: string;
            }>;
            const semanticText = knowledgeItems
              .map((item) => `${item.title} ${item.summary} ${item.diagnosticRationale}`)
              .join(" ");
            const coreItemsAssignedOnce = knowledgeItems
              .filter((item) => item.kind === "CORE")
              .every(
                (item) =>
                  assignments.filter(
                    (assignment) =>
                      assignment.knowledgeItemId === item.id &&
                      assignment.disposition === "DIAGNOSED_IN_NODE",
                  ).length === 1,
              );
            resolve({
              naturalCycle:
                /蒸发|蒸腾/.test(semanticText) && /太阳|重力/.test(semanticText),
              urbanImpact:
                /不透水|硬化/.test(semanticText) &&
                /径流/.test(semanticText) &&
                /内涝|洪峰/.test(semanticText),
              spongeBoundary:
                /透水|雨水花园|海绵/.test(semanticText) &&
                /容量|边界|极端/.test(semanticText),
              coreItemsAssignedOnce,
              allItemsHaveSources: knowledgeItems.every(
                (item) => item.sourceReferences.length > 0,
              ),
            });
            database.close();
          };
        };
      }),
  );
  expect(coverageChecks).toEqual({
    naturalCycle: true,
    urbanImpact: true,
    spongeBoundary: true,
    coreItemsAssignedOnce: true,
    allItemsHaveSources: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("phase5-first-question.png") });

  await page.reload();
  await expect(page.getByLabel("维塔的消息")).toContainText(firstMessage);
  expect(browserProblems).toEqual([]);
});
