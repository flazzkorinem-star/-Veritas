import { expect, test, type Page } from "@playwright/test";

const WATER_TASK = {
  id: "20576a54-f7ee-4f42-a3f6-d98bb7ee09ea",
  title: "水循环诊断",
  fileName: "water-cycle.md",
  materialId: "51d2cf3b-f614-4af4-97a3-2f2ef627b509",
  status: "READY",
  currentNodeId: null,
  isPinned: false,
  createdAt: "2026-08-01T08:00:00.000Z",
  updatedAt: "2026-08-01T08:00:00.000Z",
};

const RAIN_TASK = {
  ...WATER_TASK,
  id: "5eef5120-c824-4d15-9041-781222ad4522",
  title: "城市降雨",
  fileName: "urban-rain.txt",
  materialId: "b761f334-0cbb-49de-87df-ab0b32926d27",
  updatedAt: "2026-08-02T08:00:00.000Z",
};

async function seedTasks(page: Page) {
  await page.evaluate(
    async ([water, rain]) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("veritas");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("tasks", "readwrite");
          const store = transaction.objectStore("tasks");
          store.put(water);
          store.put(rain);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    [WATER_TASK, RAIN_TASK],
  );
}

test("基础工作区在真实浏览器中正确渲染", async ({ page }, testInfo) => {
  const browserProblems: string[] = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      browserProblems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => browserProblems.push(`pageerror: ${error.message}`));

  const response = await page.goto("/");

  await expect(page.getByRole("heading", { name: "从一份材料开始" })).toBeVisible();
  const vita = page.getByRole("img", { name: "维塔等你递来学习材料" });
  await expect(vita).toBeVisible();
  await expect(vita).toHaveJSProperty("complete", true);
  await expect(page.getByLabel("回答输入")).toBeDisabled();
  await expect(page).toHaveTitle("Veritas");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response?.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("workspace-empty.png") });

  if (testInfo.project.name === "desktop-edge") {
    const workspace = await page.locator(".workspace-sidebar").boundingBox();
    const topics = await page.locator(".topic-sidebar").boundingBox();
    const diagnostic = await page.locator(".diagnostic-panel").boundingBox();
    expect(workspace?.width).toBe(248);
    expect(topics?.width).toBe(240);
    expect(diagnostic?.width).toBe(304);
  } else {
    await page.getByRole("button", { name: "任务", exact: true }).click();
    await expect(
      page.locator('.workspace-sidebar[data-mobile-open="true"]'),
    ).toBeVisible();
    await page.getByRole("button", { name: "关闭任务抽屉" }).click();
    await expect(page.locator(".workspace-sidebar")).toBeHidden();
    await page.getByRole("button", { name: "主题", exact: true }).click();
    await expect(page.locator('.topic-sidebar[data-mobile-open="true"]')).toBeVisible();
    await page.getByRole("button", { name: "关闭主题抽屉" }).click();
    await expect(page.locator(".topic-sidebar")).toBeHidden();
    await page.getByRole("button", { name: "进度", exact: true }).click();
    await expect(
      page.locator('.diagnostic-panel[data-mobile-open="true"]'),
    ).toBeVisible();
  }

  expect(browserProblems).toEqual([]);
});

test("本地任务和当前选择在刷新后恢复", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.locator('.veritas-shell[aria-busy="false"]')).toBeVisible();
  await seedTasks(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "城市降雨" })).toBeVisible();

  if (testInfo.project.name === "mobile-edge") {
    await page.getByRole("button", { name: "任务", exact: true }).click();
  }
  await page.getByRole("button", { name: "打开任务 水循环诊断" }).click();
  await expect(page.getByRole("heading", { name: "水循环诊断" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "水循环诊断" })).toBeVisible();
});
