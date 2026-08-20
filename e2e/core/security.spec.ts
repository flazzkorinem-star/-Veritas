import { expect, test, type Page } from "@playwright/test";

const hostileTitle = "<img src=x onerror=alert(1)> [点我](javascript:alert(1))";

async function seedHostileTask(page: Page) {
  await page.evaluate(
    async (title) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("veritas");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(["tasks", "reports"], "readwrite");
          transaction.objectStore("tasks").put({
            id: "9fd88553-bf9c-4af4-8da9-0ec4afe8d4c2",
            title,
            fileName: "hostile.md",
            materialId: "a3ef2d02-f6b7-4937-af70-711c5c7dca90",
            status: "READY",
            currentNodeId: null,
            isPinned: false,
            createdAt: "2026-08-02T08:00:00.000Z",
            updatedAt: "2026-08-02T08:00:00.000Z",
          });
          transaction.objectStore("reports").put({
            id: "损坏-id",
            taskId: "9fd88553-bf9c-4af4-8da9-0ec4afe8d4c2",
            markdown: "",
          });
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    hostileTitle,
  );
}

test("生产响应头和客户端分块不暴露服务端秘密", async ({ page, request }) => {
  const response = await page.goto("/");
  const headers = response?.headers() ?? {};
  const policy = headers["content-security-policy"] ?? "";

  expect(policy).toContain("default-src 'self'");
  expect(policy).toContain("connect-src 'self'");
  expect(policy).toContain("object-src 'none'");
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).not.toContain("'unsafe-eval'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["permissions-policy"]).toContain("microphone=(self)");

  const scriptUrls = await page
    .locator("script[src]")
    .evaluateAll((scripts) => scripts.map((script) => (script as HTMLScriptElement).src));
  expect(scriptUrls.length).toBeGreaterThan(0);
  for (const url of scriptUrls) {
    const script = await request.get(url);
    const source = await script.text();
    expect(source).not.toContain("DEEPSEEK_API_KEY");
    expect(source).not.toContain("api.deepseek.com/chat/completions");
    expect(source).not.toContain("server-only-key");
    expect(source).not.toContain("你是 Veritas 的 Agent");
  }

  const unsupported = await request.get("/api/agents");
  const unsupportedBody = await unsupported.text();
  expect(unsupported.status()).toBe(405);
  expect(unsupportedBody).not.toMatch(
    /DEEPSEEK_API_KEY|server-only-key|api\.deepseek\.com/,
  );

  const rejected = await request.post("/api/agents", {
    data: {},
    headers: { Origin: "https://evil.example" },
  });
  const rejectedBody = await rejected.text();
  expect(rejected.status()).toBe(403);
  expect(rejected.headers()["cache-control"]).toBe("no-store");
  expect(rejectedBody).not.toMatch(
    /server-only-key|DEEPSEEK_API_KEY|node_modules|\\src\\/,
  );
});

test("恶意任务标题只作为文本显示", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('.veritas-shell[aria-busy="false"]')).toBeVisible();
  await seedHostileTask(page);
  await page.reload();

  await expect(page.getByRole("heading", { name: hostileTitle })).toBeVisible();
  await expect(page.locator(".error-toast")).toContainText("核心任务仍可继续");
  await expect(page.getByRole("button", { name: "重试报告" })).toBeVisible();
  expect(await page.locator("img[src='x']").count()).toBe(0);
  expect(await page.getByRole("link", { name: "点我" }).count()).toBe(0);
  await expect
    .poll(() => page.evaluate(() => (window as Window & { xss?: unknown }).xss))
    .toBeUndefined();
});
