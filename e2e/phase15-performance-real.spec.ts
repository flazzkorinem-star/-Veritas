import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";

interface AgentRequestMetric {
  sizeKiB: number;
  operation: string;
  requestBytes: number;
  status: number;
}

const paragraph = `
## Water cycle mechanism
Solar energy heats surface water and drives evaporation. Water vapor rises, cools, and condenses into clouds. When droplets grow heavy enough, precipitation returns water to the surface. Some water infiltrates soil and some becomes runoff, so groundwater, rivers, oceans, and the atmosphere remain connected. Temperature, vegetation, terrain, and human land use can change the speed and path of this cycle. A common misconception is that clouds are made of invisible vapor; visible clouds are tiny liquid droplets or ice crystals.
`;

function materialText(sizeKiB: number) {
  const targetBytes = sizeKiB * 1024;
  const header = `# ${sizeKiB} KiB Water Cycle Study Material\n`;
  return (header + paragraph.repeat(Math.ceil(targetBytes / paragraph.length))).slice(
    0,
    targetBytes,
  );
}

test("真实 10、50、200 KiB 材料性能基线", async ({ page }, testInfo) => {
  test.skip(
    process.env.VERITAS_REAL_DEEPSEEK !== "1" ||
      process.env.RUN_REAL_PERFORMANCE !== "1" ||
      testInfo.project.name !== "desktop-edge",
    "仅在显式性能验收时串行调用真实 DeepSeek。",
  );
  test.setTimeout(1_200_000);

  const browserProblems: string[] = [];
  const requests: AgentRequestMetric[] = [];
  let activeSizeKiB = 0;
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      browserProblems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => browserProblems.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (!response.url().endsWith("/api/agents")) return;
    const request = response.request();
    const body = request.postData() ?? "";
    const operation = (request.postDataJSON() as { operation?: string } | null)
      ?.operation;
    requests.push({
      sizeKiB: activeSizeKiB,
      operation: operation ?? "UNKNOWN",
      requestBytes: Buffer.byteLength(body),
      status: response.status(),
    });
  });

  await page.goto("/");
  const results: Array<{
    sizeKiB: number;
    elapsedMs: number;
    topicCount: number;
    requestCount: number;
    requestBytes: number;
  }> = [];

  for (const sizeKiB of [10, 50, 200]) {
    activeSizeKiB = sizeKiB;
    const fixturePath = testInfo.outputPath(`material-${sizeKiB}kb.md`);
    const text = materialText(sizeKiB);
    expect(Buffer.byteLength(text)).toBe(sizeKiB * 1024);
    writeFileSync(fixturePath, text, "utf8");

    const startedAt = Date.now();
    await page.locator("#workspace-upload").setInputFiles(fixturePath);
    await expect(page.locator(".chat-heading h1")).toHaveText(
      `material-${sizeKiB}kb`,
      { timeout: 10_000 },
    );
    await expect(page.getByRole("button", { name: "取消处理" })).toBeVisible({
      timeout: 10_000,
    });
    const assistantMessage = page.getByLabel("维塔的消息").first();
    const failed = page.getByText("这份材料暂时没能准备好");
    await Promise.race([
      assistantMessage.waitFor({ state: "visible", timeout: 340_000 }),
      failed.waitFor({ state: "visible", timeout: 340_000 }),
    ]);
    if (await failed.isVisible()) {
      const reason = await failed.locator("..").locator("p").innerText();
      throw new Error(`${sizeKiB} KiB 真实材料处理失败：${reason}`);
    }

    const sampleRequests = requests.filter((metric) => metric.sizeKiB === sizeKiB);
    expect(sampleRequests.length).toBeGreaterThanOrEqual(3);
    expect(sampleRequests.every((metric) => metric.status === 200)).toBe(true);
    const topicCount = await page.locator(".topic-item").count();
    expect(topicCount).toBeGreaterThan(0);
    results.push({
      sizeKiB,
      elapsedMs: Date.now() - startedAt,
      topicCount,
      requestCount: sampleRequests.length,
      requestBytes: sampleRequests.reduce(
        (total, metric) => total + metric.requestBytes,
        0,
      ),
    });
    await page.screenshot({
      path: testInfo.outputPath(`material-${sizeKiB}kb-complete.png`),
    });
  }

  expect(browserProblems).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  console.log(`REAL_PERFORMANCE_RESULTS ${JSON.stringify({ results, requests })}`);
});
