import { expect, test, type Page } from "@playwright/test";

function collectBrowserProblems(page: Page) {
  const problems: string[] = [];
  page.on("console", (message: { type(): string; text(): string }) => {
    if (["error", "warning"].includes(message.type())) {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error: Error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

test("页面具备键盘、语义与减少动效基线", async ({ page }) => {
  const browserProblems = collectBrowserProblems(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator('.veritas-shell[aria-busy="false"]')).toBeVisible();

  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByLabel("消息输入")).toHaveCount(0);
  await page.locator("#empty-state-upload").focus();
  await expect(page.locator("#empty-state-upload")).toBeFocused();

  const accessibilityProblems = await page.evaluate(() => {
    const ids = [...document.querySelectorAll<HTMLElement>("[id]")].map(
      (element) => element.id,
    );
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    const unnamedControls = [
      ...document.querySelectorAll<HTMLElement>("button, input, textarea"),
    ].filter((element) => {
      const labels = [
        ...((element as HTMLInputElement | HTMLTextAreaElement).labels ?? []),
      ];
      return !(
        element.getAttribute("aria-label")?.trim() ||
        element.getAttribute("title")?.trim() ||
        element.textContent?.trim() ||
        labels.some((label) => label.textContent?.trim())
      );
    });
    const imagesWithoutAlt = [...document.querySelectorAll("img")].filter(
      (image) => !image.hasAttribute("alt"),
    );
    return {
      duplicateIds: [...new Set(duplicates)],
      imagesWithoutAlt: imagesWithoutAlt.length,
      unnamedControls: unnamedControls.length,
    };
  });
  expect(accessibilityProblems).toEqual({
    duplicateIds: [],
    imagesWithoutAlt: 0,
    unnamedControls: 0,
  });

  const motion = await page
    .locator(".upload-button")
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        animationDuration: Number.parseFloat(style.animationDuration),
        transitionDuration: Number.parseFloat(style.transitionDuration),
      };
    });
  expect(motion.animationDuration).toBeLessThanOrEqual(0.01);
  expect(motion.transitionDuration).toBeLessThanOrEqual(0.01);
  expect(browserProblems).toEqual([]);
});

test("1024×768 平板布局无溢出且诊断抽屉可达", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-edge", "平板断点只需在一个 Edge 项目验收");
  const browserProblems = collectBrowserProblems(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/");

  await expect(page.locator(".workspace-sidebar")).toHaveCSS("width", "72px");
  await expect(page.locator(".topic-sidebar")).toBeHidden();
  await expect(page.locator(".diagnostic-panel")).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("tablet-workspace.png") });
  expect(browserProblems).toEqual([]);
});

test("首屏网络全同源且不预载材料解析资源", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-edge", "资源预算只需测量一次");
  const browserProblems = collectBrowserProblems(page);
  const requestedUrls: string[] = [];
  page.on("request", (resource) => requestedUrls.push(resource.url()));
  await page.goto("/", { waitUntil: "networkidle" });
  const currentOrigin = new URL(page.url()).origin;

  expect(requestedUrls.filter((url) => new URL(url).origin !== currentOrigin)).toEqual(
    [],
  );
  expect(requestedUrls.some((url) => /parser-assets|ocr-worker/iu.test(url))).toBe(false);

  const scriptUrls = await page
    .locator("script[src]")
    .evaluateAll((scripts) => scripts.map((script) => (script as HTMLScriptElement).src));
  let initialJavaScriptBytes = 0;
  for (const url of scriptUrls) {
    initialJavaScriptBytes += (await (await request.get(url)).body()).byteLength;
  }
  expect(initialJavaScriptBytes).toBeLessThan(1_400 * 1024);

  const domContentLoadedMs = await page.evaluate(() => {
    const navigation = performance.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming;
    return navigation.domContentLoadedEventEnd - navigation.startTime;
  });
  expect(domContentLoadedMs).toBeLessThan(5_000);
  expect(browserProblems).toEqual([]);
});
