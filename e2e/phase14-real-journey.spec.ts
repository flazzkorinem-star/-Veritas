import { expect, test } from "@playwright/test";
import path from "node:path";

test("同一真实任务走完材料、家教诊断、未检验范围和报告", async ({ page }, testInfo) => {
  test.skip(
    process.env.VERITAS_REAL_DEEPSEEK !== "1" ||
      process.env.RUN_REAL_DEEPSEEK !== "1" ||
      testInfo.project.name !== "desktop-edge",
    "仅在显式启用时用本地服务端配置的真实 DeepSeek 跑完整链路。",
  );
  test.setTimeout(900_000);

  const browserProblems: string[] = [];
  const operations: string[] = [];
  const agentStatuses: number[] = [];
  const agentResponses: Array<{ operation: string; status: number }> = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      browserProblems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => browserProblems.push(`pageerror: ${error.message}`));
  page.on("request", (request) => {
    if (!request.url().endsWith("/api/agents")) return;
    const operation = (request.postDataJSON() as { operation?: string } | null)
      ?.operation;
    if (operation) operations.push(operation);
  });
  page.on("response", (response) => {
    if (!response.url().endsWith("/api/agents")) return;
    const operation = (response.request().postDataJSON() as { operation?: string } | null)
      ?.operation;
    agentStatuses.push(response.status());
    agentResponses.push({ operation: operation ?? "UNKNOWN", status: response.status() });
  });

  await page.goto("/");
  await page
    .locator("#workspace-upload")
    .setInputFiles(
      path.join(process.cwd(), "tests", "fixtures", "end-to-end", "water-cycle.md"),
    );

  const assistantMessages = page.locator(
    ".message-bubble-assistant:not(:has(.turn-pending))",
  );
  async function waitForAssistantAfter(before: number) {
    const retry = page.getByRole("button", { name: "重试本轮" });
    await expect
      .poll(
        async () => {
          if ((await assistantMessages.count()) > before) return "message";
          if (await retry.isVisible()) return "retry";
          return "waiting";
        },
        { timeout: 120_000 },
      )
      .not.toBe("waiting");
    if ((await assistantMessages.count()) > before) return;
    await retry.click();
    await expect
      .poll(() => assistantMessages.count(), { timeout: 120_000 })
      .toBeGreaterThan(before);
  }
  const processingFailed = page.getByText("这份材料暂时没能准备好");
  await Promise.race([
    assistantMessages.first().waitFor({ state: "visible", timeout: 240_000 }),
    processingFailed.waitFor({ state: "visible", timeout: 240_000 }),
  ]);
  if (await processingFailed.isVisible()) {
    const reason = await processingFailed.locator("..").locator("p").innerText();
    throw new Error(`真实材料处理失败：${reason}；API 状态：${agentStatuses.join(",")}`);
  }

  const totalTopics = await page.locator(".topic-item").count();
  expect(totalTopics).toBeGreaterThan(1);
  await expect(page.locator(".score-line strong")).toHaveText("0");
  await expect(page.getByRole("button", { name: "给我提示" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "看答案" })).toBeEnabled();

  let messageCount = await assistantMessages.count();
  await page
    .getByLabel("消息输入")
    .fill("先别考我。请用两三句话解释这份材料真正想说明的整体机制。");
  await page.getByRole("button", { name: "发送消息" }).click();
  await waitForAssistantAfter(messageCount);
  expect((await assistantMessages.last().innerText()).length).toBeGreaterThan(20);
  await expect(page.locator(".score-line strong")).toHaveText("0");
  await expect(page.getByRole("button", { name: "给我提示" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "看答案" })).toBeEnabled();

  messageCount = await assistantMessages.count();
  const hintOperationsBefore = operations.filter(
    (operation) => operation === "CREATE_HINT",
  ).length;
  await page.getByLabel("消息输入").fill("这道题先给我一点方向，不要直接揭晓答案。");
  await page.getByRole("button", { name: "发送消息" }).click();
  await waitForAssistantAfter(messageCount);
  expect(operations.filter((operation) => operation === "CREATE_HINT")).toHaveLength(
    hintOperationsBefore + 1,
  );
  messageCount = await assistantMessages.count();
  expect((await assistantMessages.last().innerText()).length).toBeGreaterThan(12);

  await page
    .getByLabel("消息输入")
    .fill(
      "材料里太阳能驱动蒸发和蒸腾，水汽凝结后降水，重力再推动径流和地下水回流；城市硬化会减少下渗并增大径流，海绵设施只能在设计容量内缓解。",
    );
  await page.getByRole("button", { name: "发送消息" }).click();
  await waitForAssistantAfter(messageCount);
  await expect(page.getByRole("button", { name: "看答案" })).toBeEnabled({
    timeout: 120_000,
  });

  messageCount = await assistantMessages.count();
  const answerOperationsBefore = operations.filter(
    (operation) => operation === "CREATE_STAGE_ANSWER",
  ).length;
  await page
    .getByLabel("消息输入")
    .fill("当前这一题我想直接看完整答案，然后继续下一层。");
  await page.getByRole("button", { name: "发送消息" }).click();
  await waitForAssistantAfter(messageCount);
  expect(
    operations.filter((operation) => operation === "CREATE_STAGE_ANSWER"),
  ).toHaveLength(answerOperationsBefore + 1);

  for (let stage = 0; stage < 4; stage += 1) {
    if ((await page.getByRole("button", { name: "看答案" }).count()) === 0) break;
    if (!(await page.getByRole("button", { name: "看答案" }).isEnabled())) break;
    const beforeReveal = await assistantMessages.count();
    await page.getByRole("button", { name: "看答案" }).click({ timeout: 10_000 });
    await waitForAssistantAfter(beforeReveal);
  }

  await expect(page.getByLabel("消息输入")).toBeEnabled();
  await expect(page.locator(".current-topic .score-line span")).toHaveText("已完成");
  await page.getByRole("button", { name: "进度", exact: true }).click();
  await expect(page.getByRole("button", { name: "查看学习报告" })).toBeEnabled({
    timeout: 180_000,
  });
  await page.getByRole("button", { name: "查看学习报告" }).click();

  const report = page.getByRole("dialog", { name: "学习诊断报告" });
  await expect(report).toBeVisible();
  const progress = await report.locator(".report-progress-card strong").innerText();
  const match = progress.match(/(\d+)\s*\/\s*(\d+)/);
  expect(match).not.toBeNull();
  expect(Number(match?.[1])).toBe(1);
  expect(Number(match?.[2])).toBe(totalTopics);
  expect(Number(match?.[2])).toBeGreaterThan(1);
  const undiagnosed = report.getByRole("heading", { name: "尚未诊断" }).locator("..");
  await expect(undiagnosed).not.toContainText("暂无");
  expect(await report.innerText()).not.toMatch(
    /PASSED(?:_WITH_(?:HINT|ANSWER))?|确定性分数/,
  );

  for (const operation of [
    "EXTRACT_KNOWLEDGE",
    "AUDIT_KNOWLEDGE_MAP",
    "CREATE_FIRST_QUESTION",
    "RESPOND_TO_USER",
    "CREATE_HINT",
    "CREATE_STAGE_ANSWER",
    "CREATE_STAGE_QUESTION",
    "CREATE_REPORT",
  ]) {
    expect(operations).toContain(operation);
  }
  expect(agentStatuses.length).toBeGreaterThanOrEqual(10);
  expect(
    agentResponses.filter((response) => response.status !== 200),
    `真实 Agent 非 200 响应：${JSON.stringify(agentResponses)}`,
  ).toEqual([]);
  expect(browserProblems).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("real-complete-journey-report.png"),
    fullPage: false,
  });
});
