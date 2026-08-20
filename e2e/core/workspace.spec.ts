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

async function seedTaskRecords(page: Page, tasks: (typeof WATER_TASK)[]) {
  await page.evaluate(
    async (records) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("veritas");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("tasks", "readwrite");
          const store = transaction.objectStore("tasks");
          records.forEach((task) => store.put(task));
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    tasks,
  );
}

async function seedTasks(page: Page) {
  await seedTaskRecords(page, [WATER_TASK, RAIN_TASK]);
}

const SCROLLABLE_TASKS = Array.from({ length: 20 }, (_, index) => {
  const sequence = String(index + 1).padStart(12, "0");
  return {
    ...WATER_TASK,
    id: `00000000-0000-4000-8000-${sequence}`,
    materialId: `10000000-0000-4000-8000-${sequence}`,
    title: `任务 ${String(index + 1).padStart(2, "0")}`,
    updatedAt: new Date(Date.UTC(2026, 7, 1, 8, index)).toISOString(),
  };
});

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
  const vita = page.getByRole("img", { name: "维塔挥手欢迎你开始学习" });
  await expect(vita).toBeVisible();
  await expect(vita).toHaveJSProperty("complete", true);
  await expect(page.getByLabel("消息输入")).toHaveCount(0);
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
    expect(workspace?.width).toBe(258);
    await expect(page.locator(".topic-sidebar")).toBeHidden();
    await expect(page.locator(".diagnostic-panel")).toBeHidden();
  } else {
    await page.getByRole("button", { name: "打开任务", exact: true }).click();
    await expect(
      page.locator('.workspace-sidebar[data-mobile-open="true"]'),
    ).toBeVisible();
    await page.getByRole("button", { name: "关闭任务抽屉" }).click();
    await expect(page.locator(".workspace-sidebar")).toBeHidden();
    await page.getByRole("button", { name: "打开主题", exact: true }).click();
    await expect(page.locator('.topic-sidebar[data-mobile-open="true"]')).toBeVisible();
    await page.getByRole("button", { name: "关闭主题抽屉" }).click();
    await expect(page.locator(".topic-sidebar")).toBeHidden();
    await page.getByRole("button", { name: "打开进度", exact: true }).click();
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
    await page.getByRole("button", { name: "打开任务", exact: true }).click();
  }
  await page.getByRole("button", { name: "打开任务 水循环诊断" }).click();
  await expect(page.getByRole("heading", { name: "水循环诊断" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "水循环诊断" })).toBeVisible();
});

test("长任务列表中的菜单和重命名对话框保持完整键盘操作", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.locator('.veritas-shell[aria-busy="false"]')).toBeVisible();
  await seedTaskRecords(page, SCROLLABLE_TASKS);
  await page.reload();
  if (testInfo.project.name === "mobile-edge") {
    await page.getByRole("button", { name: "打开任务", exact: true }).click();
  }

  const taskList = page.locator(".task-list");
  await taskList.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const trigger = page.getByRole("button", { name: "打开“任务 01”的任务菜单" });
  await trigger.click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  for (const name of ["重命名", "置顶", "分享", "删除"]) {
    await expect(menu.getByRole("menuitem", { name })).toBeInViewport({ ratio: 1 });
  }
  await page.screenshot({ path: testInfo.outputPath("long-task-menu.png") });

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.getByLabel("搜索任务").click();
  await expect(menu).toBeHidden();

  await trigger.click();
  await menu.getByRole("menuitem", { name: "重命名" }).click();
  const dialog = page.getByRole("dialog", { name: "重命名任务" });
  const titleInput = page.getByLabel("任务名称");
  await expect(dialog).toBeVisible();
  await expect(titleInput).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "保存名称" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(titleInput).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("rename-dialog.png") });

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
