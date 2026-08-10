import { expect, test, type Route } from "@playwright/test";

const source = { label: "第 1 段", excerpt: "太阳能驱动蒸发。" };
const item = {
  id: "item-1",
  moduleId: "module-1",
  title: "循环动力",
  summary: "太阳能驱动蒸发。",
  kind: "CORE",
  diagnosticRationale: "这是理解循环的基础。",
  sourceReferences: [source],
  commonMisconceptions: [],
};
const node = {
  id: "node-1",
  moduleId: "module-1",
  title: "循环动力",
  objective: "解释太阳能怎样推动水循环。",
  knowledgeItemIds: [item.id],
  sourceReferences: [source],
  canonicalUnderstanding: "太阳能驱动水蒸发进入大气。",
  commonMisconceptions: [],
  bloomTargets: {
    memory: "说出主要动力。",
    understanding: "解释动力作用。",
    application: "判断具体环节。",
    analysis: "分析条件变化。",
  },
  order: 1,
};

function fulfill(route: Route, result: unknown) {
  return route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ result }),
  });
}

function mockAgent(route: Route) {
  const request = route.request().postDataJSON() as {
    operation: string;
    input: {
      stage?: string;
      hintLevel?: number;
      diagnostic?: { status: string };
      completedNodes?: Array<{
        nodeId: string;
        messages: Array<{ id: string; role: "USER" | "ASSISTANT"; content: string }>;
      }>;
    };
  };
  switch (request.operation) {
    case "EXTRACT_KNOWLEDGE":
      return fulfill(route, {
        modules: [{ id: "module-1", title: "水循环", sourceRange: "第 1 段" }],
        knowledgeItems: [item],
      });
    case "AUDIT_KNOWLEDGE_MAP":
      return fulfill(route, {
        modules: [{ id: "module-1", title: "水循环", sourceRange: "第 1 段" }],
        knowledgeItems: [item],
        nodes: [node],
        coverageAssignments: [
          {
            knowledgeItemId: item.id,
            disposition: "DIAGNOSED_IN_NODE",
            nodeId: node.id,
          },
        ],
      });
    case "CREATE_FIRST_QUESTION":
      return fulfill(route, {
        opening: "这份材料真正值得抓的是循环动力。",
        question: "水循环的主要动力是什么？",
      });
    case "CREATE_HINT":
      return fulfill(route, {
        hintLevel: request.input.hintLevel,
        assistantMessage: "想想晒湿衣服时，哪一种能量让水离开衣服。",
      });
    case "RESPOND_TO_USER":
      if (request.input.diagnostic?.status === "NOT_STARTED") {
        return fulfill(route, {
          responseMode: "START_DIAGNOSTIC",
          learningGoalUpdate: "检验水循环的理解",
          assistantMessage: "可以，先从主要动力开始。",
          question: "水循环的主要动力是什么？",
        });
      }
      return fulfill(route, {
        responseMode: "EVALUATE_DIAGNOSTIC",
        learningGoalUpdate: null,
        classification: "CORRECT",
        isCorrect: true,
        progress: "ADVANCING",
        correctEvidence: ["说出了太阳能"],
        missingPoints: [],
        misconceptions: [],
        teachingMove: "AFFIRM_AND_ADVANCE",
        scaffold: null,
        assistantMessage: "对，太阳能正是推动蒸发的关键动力。",
      });
    case "CREATE_STAGE_QUESTION":
      return fulfill(route, {
        question:
          request.input.stage === "UNDERSTANDING"
            ? "太阳能怎样让液态水进入大气？"
            : request.input.stage === "APPLICATION"
              ? "晒湿衣服时，水发生了什么变化？"
              : "如果没有阳光，蒸发环节会怎样变化？",
      });
    case "CREATE_STAGE_ANSWER":
      return fulfill(route, {
        assistantMessage: "湿衣服里的液态水吸收能量后蒸发成水蒸气。",
      });
    case "CREATE_REPORT":
      return fulfill(route, {
        summary: "已经能解释太阳能怎样推动水循环，应用环节仍依赖了完整答案。",
        nodeInsights: request.input.completedNodes!.map((completedNode) => {
          const evidence = completedNode.messages.find(
            (message) => message.role === "USER" && message.content.includes("太阳能"),
          )!;
          return {
            nodeId: completedNode.nodeId,
            understood: [
              {
                statement: "能指出太阳能是水循环的主要动力。",
                userMessageId: evidence.id,
              },
            ],
            blindSpots: ["应用到新情境时依赖了家教完整答案。"],
            userEvidenceMessageIds: [evidence.id],
            scaffoldNotes: [],
            learnedOrCorrected: [],
            nextSteps: ["换一个天气情境独立解释能量变化。"],
            sourceReferenceIndexes: [0],
          };
        }),
      });
    default:
      throw new Error(`未处理的 Agent 操作：${request.operation}`);
  }
}

test("桌面与移动端完成提示和回答回合", async ({ page }, testInfo) => {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("requestfailed", (request) =>
    problems.push(`请求失败 ${request.url()}：${request.failure()?.errorText ?? "未知"}`),
  );
  await page.route("**/api/agents", mockAgent);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText(value: string) {
          sessionStorage.setItem("copied-report", value);
          return Promise.resolve();
        },
      },
    });
  });
  await page.goto("/");
  await page.locator("#workspace-upload").setInputFiles({
    name: "water-cycle.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# 水循环\n\n太阳能驱动蒸发，水汽凝结后形成降水。"),
  });

  await expect(
    page.getByText("这份材料真正值得抓的是循环动力", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("水循环的主要动力是什么？")).toBeVisible();
  await page.getByRole("button", { name: "给我提示" }).click();
  await expect(page.getByText("想想晒湿衣服时", { exact: false })).toBeVisible();
  await page.getByLabel("消息输入").fill("主要动力是太阳能。 ");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.getByText("对，太阳能正是推动蒸发的关键动力。")).toBeVisible();
  await expect(page.getByText("太阳能怎样让液态水进入大气？")).toBeVisible();
  await expect(page.locator(".score-line strong")).toHaveText("25");
  await expect(page.getByLabel("消息输入")).toHaveValue("");

  await page.getByRole("button", { name: "给我提示" }).click();
  await page.getByLabel("消息输入").fill("液态水吸收太阳能后会蒸发。 ");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.getByText("晒湿衣服时，水发生了什么变化？")).toBeVisible();
  await expect(page.locator(".score-line strong")).toHaveText("50");

  await page.getByRole("button", { name: "看答案" }).click();
  await expect(page.getByText("湿衣服里的液态水吸收能量后蒸发成水蒸气。")).toBeVisible();
  await expect(page.getByText("如果没有阳光，蒸发环节会怎样变化？")).toBeVisible();
  await expect(page.locator(".score-line strong")).toHaveText("50");

  await page.getByLabel("消息输入").fill("蒸发会明显变慢。 ");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.locator(".score-line strong")).toHaveText("75");
  await expect(page.getByLabel("消息输入")).toBeEnabled();
  await expect(page.locator(".chat-heading .status-badge")).toHaveText("已完成");
  const composerBox = await page.locator(".composer-shell").boundingBox();
  const viewport = page.viewportSize();
  expect(composerBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(composerBox!.y + composerBox!.height).toBeLessThanOrEqual(viewport!.height + 1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath(`phase7-${testInfo.project.name}.png`),
    fullPage: false,
  });

  await page
    .getByRole("button", {
      name: testInfo.project.name === "mobile-edge" ? "打开进度" : "进度",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "查看学习报告" }).click();
  const report = page.getByRole("dialog", { name: "学习诊断报告" });
  await expect(report).toBeVisible();
  await expect(report.getByText("1 / 1 个主题")).toBeVisible();
  await expect(report.getByText("主要动力是太阳能。")).toBeVisible();
  await expect(report.getByText("第 1 段")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await report.getByRole("button", { name: "下载 Markdown" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("water-cycle-学习诊断报告.md");
  expect(await download.failure()).toBeNull();
  await report.getByRole("button", { name: "分享报告" }).click();
  await expect(page.getByRole("status")).toHaveText("报告摘要已复制");
  expect(await page.evaluate(() => sessionStorage.getItem("copied-report"))).toContain(
    "太阳能",
  );
  if (testInfo.project.name === "desktop-edge") {
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({
      format: "A4",
      path: testInfo.outputPath("phase9-report-print.pdf"),
      printBackground: true,
    });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(10_000);
    await page.emulateMedia({ media: "screen" });
  }
  await page.screenshot({
    path: testInfo.outputPath(`phase9-report-${testInfo.project.name}.png`),
    fullPage: false,
  });
  expect(problems).toEqual([]);
});

test("桌面端网络失败后保留输入并可重试当前回合", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-edge", "桌面精细交互只执行一次。");
  const problems: string[] = [];
  let evaluationAttempts = 0;
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().includes("status of 503 (Service Unavailable)")
    ) {
      problems.push(message.text());
    }
  });
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("requestfailed", (request) =>
    problems.push(`请求失败 ${request.url()}：${request.failure()?.errorText ?? "未知"}`),
  );
  await page.route("**/api/agents", (route) => {
    const request = route.request().postDataJSON() as {
      operation: string;
      input?: { diagnostic?: { status: string } };
    };
    if (
      request.operation === "RESPOND_TO_USER" &&
      request.input?.diagnostic?.status === "ACTIVE" &&
      evaluationAttempts++ === 0
    ) {
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "UPSTREAM_UNAVAILABLE",
            message: "模型服务暂时不可用，请重试。",
          },
        }),
      });
    }
    return mockAgent(route);
  });
  await page.goto("/");
  await page.locator("#workspace-upload").setInputFiles({
    name: "retry-water.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# 水循环\n\n太阳能驱动蒸发。"),
  });
  await expect(
    page.getByText("这份材料真正值得抓的是循环动力", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("水循环的主要动力是什么？")).toBeVisible();
  await page.getByLabel("消息输入").fill("主要动力是太阳能。");
  await page.getByRole("button", { name: "发送消息" }).click();

  await expect(page.getByRole("button", { name: "重试本轮" })).toBeVisible();
  await expect(page.getByLabel("消息输入")).toHaveValue("主要动力是太阳能。");
  await page.screenshot({ path: testInfo.outputPath("phase8-retry-error.png") });
  await page.getByRole("button", { name: "重试本轮" }).click();

  await expect(page.getByText("对，太阳能正是推动蒸发的关键动力。")).toBeVisible();
  await expect(page.getByLabel("消息输入")).toHaveValue("");
  await page.screenshot({ path: testInfo.outputPath("phase8-retry-recovered.png") });
  expect(evaluationAttempts).toBe(2);
  expect(problems).toEqual([]);
});
