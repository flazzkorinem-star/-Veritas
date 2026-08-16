import { expect, test } from "@playwright/test";
import { statSync, writeFileSync } from "node:fs";
import path from "node:path";

const FILE_NAMES = [
  "111泡泡玛特.pptx",
  "AI Agent笔记.docx",
  "AI PM求职逐字稿.docx",
  "COMP5339_07_TemporalDataEngineeering.pdf",
  "CS48_Safeguard_AI-_Portfolio_Risk_+_Scenario_Intelligence_Platform.pdf",
  "week2.pdf",
] as const;

interface AgentMetric {
  fileName: string;
  operation: string;
  requestUnit: string;
  status: number;
}

interface ProcessingTrace {
  extractionRequestCount: number;
  splitCount: number;
  mergeRequestCount: number;
  mergeBypassCount: number;
  compilePartitionCount: number;
  repairedRequestCount: number;
  deterministicFallbackCount: 0;
  finalCompileSource: "MODEL_VALIDATED";
}

interface JourneyResult {
  fileName: string;
  fileBytes: number;
  parsedCharacters: number;
  topicCount: number;
  uploadMs: number;
  reportMs: number;
  totalMs: number;
  messages: Array<{ role: "USER" | "ASSISTANT"; content: string }>;
  reportMarkdown: string;
  processingTrace: ProcessingTrace | null;
  metrics: AgentMetric[];
  error?: string;
}

function duration(milliseconds: number) {
  return `${(milliseconds / 1_000).toFixed(1)} 秒`;
}

function nestedReport(markdown: string) {
  return markdown.replace(
    /^(#{1,4}) /gm,
    (_, hashes: string) => `${"#".repeat(Math.min(6, hashes.length + 2))} `,
  );
}

function journeyMarkdown(results: JourneyResult[], browserProblems: string[]) {
  const generatedAt = new Date().toISOString();
  const passed = results.filter((result) => !result.error).length;
  const lines = [
    "# 六份材料真实链路验收记录",
    "",
    `- 验收时间：${generatedAt}`,
    "- 运行形态：Next.js 生产构建、Microsoft Edge、真实 deepseek-v4-flash",
    `- 验收范围：真实上传 → 知识地图与首问 → 用户对话 → 完成首个主题四层诊断 → 学习报告`,
    `- 总结果：${passed} / ${results.length} 份通过`,
    "",
    "## 汇总",
    "",
    "| 材料 | 原文件大小 | 解析后字符 | 主题数 | 上传至首问 | 报告生成 | 全链路 | 结果 |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...results.map(
      (result) =>
        `| ${result.fileName.replaceAll("|", "\\|")} | ${result.fileBytes.toLocaleString("zh-CN")} B | ${result.parsedCharacters.toLocaleString("zh-CN")} | ${result.topicCount} | ${duration(result.uploadMs)} | ${duration(result.reportMs)} | ${duration(result.totalMs)} | ${result.error ? `失败：${result.error.replaceAll("|", "\\|")}` : "通过"} |`,
    ),
    "",
    "## 浏览器与接口异常",
    "",
    browserProblems.length
      ? browserProblems.map((problem) => `- ${problem}`).join("\n")
      : "- 无未处理的浏览器错误或警告。",
    "",
  ];

  for (const [index, result] of results.entries()) {
    const non200 = result.metrics.filter(({ status }) => status !== 200);
    lines.push(
      `## ${index + 1}. ${result.fileName}`,
      "",
      `- 原文件：${result.fileBytes.toLocaleString("zh-CN")} 字节`,
      `- 解析正文：${result.parsedCharacters.toLocaleString("zh-CN")} 字符`,
      `- 生成主题：${result.topicCount} 个`,
      `- 上传到首问：${duration(result.uploadMs)}`,
      `- 首主题完成后生成报告：${duration(result.reportMs)}`,
      `- 全链路：${duration(result.totalMs)}`,
      `- 处理轨迹：${result.processingTrace ? `提取请求 ${result.processingTrace.extractionRequestCount}、结构二分 ${result.processingTrace.splitCount}、归并请求 ${result.processingTrace.mergeRequestCount}、归并绕过 ${result.processingTrace.mergeBypassCount}、编译分区 ${result.processingTrace.compilePartitionCount}、模型修复 ${result.processingTrace.repairedRequestCount}、确定性语义降级 ${result.processingTrace.deterministicFallbackCount}、最终来源 ${result.processingTrace.finalCompileSource}` : "未保存"}`,
      `- Agent 请求：${result.metrics.length} 次；${non200.length ? `其中 ${non200.length} 次经同一请求单元重试恢复（${non200.map(({ operation, requestUnit, status }) => `${operation}[${requestUnit}] ${status}`).join("、")}）` : "全部 200"}`,
      result.error ? `- 最终错误：${result.error}` : "- 最终结果：通过",
      "",
      "### 真实对话",
      "",
    );
    if (result.messages.length === 0) {
      lines.push("无可用对话记录。", "");
    } else {
      for (const message of result.messages) {
        lines.push(
          `#### ${message.role === "USER" ? "用户" : "维塔"}`,
          "",
          ...message.content.split("\n").map((line) => `> ${line}`),
          "",
        );
      }
    }
    lines.push("### 最终学习报告", "");
    if (result.reportMarkdown) {
      lines.push(nestedReport(result.reportMarkdown), "");
    } else {
      lines.push("未生成报告。", "");
    }
  }
  return `${lines.join("\n").trim()}\n`;
}

test("六份用户材料逐份跑通上传、对话和学习报告", async ({ page }, testInfo) => {
  test.skip(
    process.env.VERITAS_REAL_DEEPSEEK !== "1" ||
      process.env.RUN_SIX_MATERIAL_JOURNEY !== "1" ||
      testInfo.project.name !== "desktop-edge",
    "仅在显式验收六份用户材料时调用真实 DeepSeek。",
  );
  test.setTimeout(3_600_000);

  const results: JourneyResult[] = [];
  const browserProblems: string[] = [];
  const metrics: AgentMetric[] = [];
  let activeFileName = "尚未开始";
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      if (/Failed to load resource/.test(message.text())) return;
      browserProblems.push(`${activeFileName}｜${message.type()}：${message.text()}`);
    }
  });
  page.on("pageerror", (error) =>
    browserProblems.push(`${activeFileName}｜pageerror：${error.message}`),
  );
  page.on("response", (response) => {
    if (!response.url().endsWith("/api/agents")) return;
    const body = response.request().postDataJSON() as {
      operation?: string;
      input?: {
        shardId?: string;
        shards?: Array<{ shardId?: string }>;
        knowledgeItems?: Array<{ id?: string }>;
      };
    } | null;
    const operation = body?.operation ?? "UNKNOWN";
    const requestUnit =
      body?.input?.shardId ??
      body?.input?.shards?.map(({ shardId }) => shardId).join(",") ??
      body?.input?.knowledgeItems?.map(({ id }) => id).join(",") ??
      operation;
    metrics.push({
      fileName: activeFileName,
      operation,
      requestUnit,
      status: response.status(),
    });
  });

  await page.goto("/");
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
        { timeout: 180_000 },
      )
      .not.toBe("waiting");
    if ((await assistantMessages.count()) > before) return;
    await retry.click();
    await expect
      .poll(() => assistantMessages.count(), { timeout: 180_000 })
      .toBeGreaterThan(before);
  }

  async function readActiveTask() {
    return page.evaluate(
      () =>
        new Promise<{
          parsedCharacters: number;
          topicCount: number;
          messages: Array<{ role: "USER" | "ASSISTANT"; content: string }>;
          reportMarkdown: string;
          processingTrace: ProcessingTrace | null;
        }>((resolve, reject) => {
          const open = indexedDB.open("veritas");
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const database = open.result;
            const transaction = database.transaction(
              ["workspaceStates", "materials", "messages", "reports"],
              "readonly",
            );
            const workspace = transaction.objectStore("workspaceStates").get("workspace");
            workspace.onerror = () => reject(workspace.error);
            workspace.onsuccess = () => {
              const taskId = workspace.result?.activeTaskId as string | undefined;
              if (!taskId) {
                reject(new Error("当前没有活动任务。"));
                return;
              }
              const material = transaction.objectStore("materials").get(taskId);
              const allMessages = transaction.objectStore("messages").getAll();
              const report = transaction.objectStore("reports").get(taskId);
              transaction.oncomplete = () => {
                const storedMaterial = material.result as
                  | {
                      parsedText?: string;
                      nodes?: unknown[];
                      processingTrace?: ProcessingTrace | null;
                    }
                  | undefined;
                const storedMessages = (
                  allMessages.result as Array<{
                    taskId: string;
                    role: "USER" | "ASSISTANT";
                    content: string;
                    createdAt: string;
                  }>
                ).filter((message) => message.taskId === taskId);
                resolve({
                  parsedCharacters: storedMaterial?.parsedText?.length ?? 0,
                  topicCount: storedMaterial?.nodes?.length ?? 0,
                  processingTrace: storedMaterial?.processingTrace ?? null,
                  messages: storedMessages
                    .toSorted((left, right) =>
                      left.createdAt.localeCompare(right.createdAt),
                    )
                    .map(({ role, content }) => ({ role, content })),
                  reportMarkdown:
                    (report.result as { markdown?: string } | undefined)?.markdown ?? "",
                });
                database.close();
              };
              transaction.onerror = () => reject(transaction.error);
            };
          };
        }),
    );
  }

  for (const fileName of FILE_NAMES) {
    activeFileName = fileName;
    const filePath = path.join(process.cwd(), "测试文件", fileName);
    const fileBytes = statSync(filePath).size;
    const result: JourneyResult = {
      fileName,
      fileBytes,
      parsedCharacters: 0,
      topicCount: 0,
      uploadMs: 0,
      reportMs: 0,
      totalMs: 0,
      messages: [],
      reportMarkdown: "",
      processingTrace: null,
      metrics: [],
    };
    const journeyStartedAt = Date.now();
    const metricStart = metrics.length;

    try {
      const uploadStartedAt = Date.now();
      await page.locator("#workspace-upload").setInputFiles(filePath);
      await expect(page.locator(".chat-heading h1")).toHaveText(
        fileName.replace(/\.[^.]+$/, ""),
        { timeout: 10_000 },
      );
      await expect(page.getByRole("button", { name: "取消处理" })).toBeVisible({
        timeout: 10_000,
      });
      const failed = page.getByText("这份材料暂时没能准备好");
      for (let processingAttempt = 0; processingAttempt < 2; processingAttempt += 1) {
        await Promise.race([
          assistantMessages.first().waitFor({ state: "visible", timeout: 190_000 }),
          failed.waitFor({ state: "visible", timeout: 190_000 }),
        ]);
        if (!(await failed.isVisible())) break;
        if (processingAttempt === 1) {
          const reason = await failed.locator("..").locator("p").innerText();
          throw new Error(`上传处理失败：${reason}`);
        }
        await page.getByRole("button", { name: "重新处理" }).click();
        await expect(page.getByRole("button", { name: "取消处理" })).toBeVisible();
        await expect(failed).toBeHidden();
      }
      result.uploadMs = Date.now() - uploadStartedAt;

      let messageCount = await assistantMessages.count();
      await page
        .getByLabel("消息输入")
        .fill(
          "请先结合这份材料，用三句话告诉我它最重要的主线，以及学习时最容易忽略的边界。",
        );
      await page.getByRole("button", { name: "发送消息" }).click();
      await waitForAssistantAfter(messageCount);

      for (let stage = 0; stage < 4; stage += 1) {
        const reveal = page.getByRole("button", { name: "看答案" });
        if ((await reveal.count()) === 0 || !(await reveal.isEnabled())) break;
        messageCount = await assistantMessages.count();
        await reveal.click();
        await waitForAssistantAfter(messageCount);
      }
      await expect(page.locator(".current-topic .score-line span")).toHaveText("已完成", {
        timeout: 180_000,
      });

      const reportStartedAt = Date.now();
      await page.getByRole("button", { name: "进度", exact: true }).click();
      const retryReport = page.getByRole("button", { name: "重试报告" });
      await expect
        .poll(
          async () => {
            if (await page.getByRole("button", { name: "查看学习报告" }).isEnabled()) {
              return "ready";
            }
            if (await retryReport.isVisible()) return "retry";
            return "waiting";
          },
          { timeout: 180_000 },
        )
        .not.toBe("waiting");
      if (await retryReport.isVisible()) {
        await retryReport.click();
        await expect(page.getByRole("button", { name: "查看学习报告" })).toBeEnabled({
          timeout: 180_000,
        });
      }
      result.reportMs = Date.now() - reportStartedAt;
      await page.getByRole("button", { name: "查看学习报告" }).click();
      const reportDialog = page.getByRole("dialog", { name: "学习诊断报告" });
      await expect(reportDialog).toBeVisible();
      const stored = await readActiveTask();
      Object.assign(result, stored);
      expect(result.parsedCharacters).toBeGreaterThan(0);
      expect(result.topicCount).toBeGreaterThan(0);
      expect(result.reportMarkdown).not.toBe("");
      expect(result.processingTrace).toMatchObject({
        deterministicFallbackCount: 0,
        finalCompileSource: "MODEL_VALIDATED",
      });
      await page.screenshot({
        path: testInfo.outputPath(`${FILE_NAMES.indexOf(fileName) + 1}-report.png`),
        fullPage: false,
      });
      await page.getByRole("button", { name: "关闭报告" }).click();
      await expect
        .poll(() => page.evaluate(() => Boolean(window.history.state?.veritasOverlay)))
        .toBe(false);
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      try {
        Object.assign(result, await readActiveTask());
      } catch {
        // 当前任务连本地记录都未创建时保留已有诊断信息。
      }
    } finally {
      await expect(page.locator("#workspace-upload")).toBeEnabled({
        timeout: 190_000,
      });
      result.totalMs = Date.now() - journeyStartedAt;
      result.metrics = metrics.slice(metricStart);
      results.push(result);
      writeFileSync(
        path.join(process.cwd(), "docs", "acceptance", "六份材料真实链路验收.md"),
        journeyMarkdown(results, browserProblems),
        "utf8",
      );
      if (fileName !== FILE_NAMES.at(-1)) {
        await page.reload();
        await expect(page.locator("#workspace-upload")).toBeEnabled();
      }
    }
  }

  const unexpectedResponses = metrics.filter((metric, index) => {
    if (metric.status === 200) return false;
    return !metrics
      .slice(index + 1)
      .some(
        (candidate) =>
          candidate.fileName === metric.fileName &&
          candidate.operation === metric.operation &&
          candidate.requestUnit === metric.requestUnit &&
          candidate.status === 200,
      );
  });
  const failures = results.filter(({ error }) => error);
  expect(
    failures,
    `未跑通材料：${JSON.stringify(failures.map(({ fileName, error }) => ({ fileName, error })))}`,
  ).toEqual([]);
  expect(
    unexpectedResponses,
    `存在未处理的 Agent 响应：${JSON.stringify(unexpectedResponses)}`,
  ).toEqual([]);
  expect(browserProblems).toEqual([]);
});
