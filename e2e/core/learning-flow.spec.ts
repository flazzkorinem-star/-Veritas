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
const secondNode = {
  ...node,
  id: "node-2",
  title: "降水回流",
  objective: "解释降水怎样回到地表。",
  canonicalUnderstanding: "降水在重力作用下回到地表。",
  order: 2,
};

const successMeta = {
  attempts: 1,
  repaired: false,
  validationSource: "MODEL_VALIDATED",
};

function fulfill(route: Route, result: unknown) {
  return route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ result, meta: successMeta }),
  });
}

function compiledKnowledgeMap(nodes = [node]) {
  return {
    modules: [{ id: "s1-m1", title: "水循环", sourceRange: "第 1 段" }],
    knowledgeItems: [{ ...item, id: "s1-i1", moduleId: "s1-m1" }],
    nodes: nodes.map((candidate) => ({
      ...candidate,
      moduleId: "s1-m1",
      knowledgeItemIds: ["s1-i1"],
    })),
    coverageAssignments: [
      {
        knowledgeItemId: "s1-i1",
        disposition: "DIAGNOSED_IN_NODE",
        nodeId: node.id,
      },
    ],
  };
}

function mockAgent(route: Route) {
  const request = route.request().postDataJSON() as {
    operation: string;
    input: {
      stage?: string;
      hintLevel?: number;
      diagnostic?: { status: string };
      sourceUnits?: Array<{ id: string; sourceLabel: string; text: string }>;
      completedNodes?: Array<{
        nodeId: string;
        messages: Array<{
          id: string;
          role: "USER" | "ASSISTANT";
          content: string;
        }>;
      }>;
      node?: { id: string };
    };
  };
  switch (request.operation) {
    case "EXTRACT_COMPACT_KNOWLEDGE": {
      const sourceUnitIds = request.input.sourceUnits!.map(({ id }) => id);
      return fulfill(route, {
        modules: [{ id: "module-1", title: "水循环", sourceUnitIds }],
        knowledgeItems: [
          {
            id: "item-1",
            moduleId: "module-1",
            title: item.title,
            summary: item.summary,
            sourceUnitIds,
            commonMisconceptions: [],
          },
        ],
        topicDrafts: [
          {
            id: "topic-1",
            moduleId: "module-1",
            title: node.title,
            objective: node.objective,
            knowledgeItemIds: ["item-1"],
          },
        ],
        sourceCoverage: sourceUnitIds,
      });
    }
    case "COMPILE_KNOWLEDGE_MAP":
      return fulfill(route, compiledKnowledgeMap());
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
          const evidence = completedNode.messages.filter(
            (message) => message.role === "USER",
          );
          return {
            nodeId: completedNode.nodeId,
            learningEvidence: [
              {
                stage: "MEMORY",
                category: "AFTER_HINT",
                statement: "提示后能指出太阳能是主要动力。",
                userMessageId: evidence[0]!.id,
              },
              {
                stage: "UNDERSTANDING",
                category: "AFTER_HINT",
                statement: "提示后能解释太阳能与蒸发。",
                userMessageId: evidence[1]!.id,
              },
              {
                stage: "APPLICATION",
                category: "EXPLAINED_NOT_VERIFIED",
                statement: "看过应用题答案，但没有再次验证。",
                userMessageId: null,
              },
              {
                stage: "ANALYSIS",
                category: "INDEPENDENT",
                statement: "能独立分析阳光变化的影响。",
                userMessageId: evidence[2]!.id,
              },
            ],
            misconceptions: [],
            scaffoldNotes: [],
            nextSteps: ["换一个天气情境独立解释能量变化。"],
            sourceReferenceIndexes: [0],
          };
        }),
      });
    default:
      throw new Error(`未处理的 Agent 操作：${request.operation}`);
  }
}

test("桌面与移动端完成提示和回答回合", async ({ page, context }, testInfo) => {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("requestfailed", (request) =>
    problems.push(
      `请求失败 ${request.url()}：${request.failure()?.errorText ?? "未知"}`,
    ),
  );
  await page.route("**/api/agents", mockAgent);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
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
  await expect(
    page.getByText("想想晒湿衣服时", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("消息输入").fill("主要动力是太阳能。 ");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(
    page.getByText("对，太阳能正是推动蒸发的关键动力。"),
  ).toBeVisible();
  await expect(page.getByText("太阳能怎样让液态水进入大气？")).toBeVisible();
  await expect(page.locator(".score-line strong")).toHaveText("25");
  await expect(page.getByLabel("消息输入")).toHaveValue("");

  await page.getByRole("button", { name: "给我提示" }).click();
  await page.getByLabel("消息输入").fill("液态水吸收太阳能后会蒸发。 ");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.getByText("晒湿衣服时，水发生了什么变化？")).toBeVisible();
  await expect(page.locator(".score-line strong")).toHaveText("50");

  await page.getByRole("button", { name: "看答案" }).click();
  await expect(
    page.getByText("湿衣服里的液态水吸收能量后蒸发成水蒸气。"),
  ).toBeVisible();
  await expect(
    page.getByText("如果没有阳光，蒸发环节会怎样变化？"),
  ).toBeVisible();
  await expect(page.locator(".score-line strong")).toHaveText("50");

  await page.getByLabel("消息输入").fill("蒸发会明显变慢。 ");
  await page.getByRole("button", { name: "发送消息" }).click();
  await expect(page.locator(".score-line strong")).toHaveText("75");
  await expect(page.getByLabel("消息输入")).toBeEnabled();
  await expect(page.locator(".chat-heading .status-badge")).toHaveText(
    "已完成",
  );
  const composerBox = await page.locator(".composer-shell").boundingBox();
  const viewport = page.viewportSize();
  expect(composerBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(composerBox!.y + composerBox!.height).toBeLessThanOrEqual(
    viewport!.height + 1,
  );
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath(`learning-flow-${testInfo.project.name}.png`),
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
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "太阳能",
  );
  if (testInfo.project.name === "desktop-edge") {
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({
      format: "A4",
      path: testInfo.outputPath("report-print.pdf"),
      printBackground: true,
    });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(10_000);
    await page.emulateMedia({ media: "screen" });
  }
  await page.screenshot({
    path: testInfo.outputPath(`report-${testInfo.project.name}.png`),
    fullPage: false,
  });
  expect(problems).toEqual([]);
});

test("未开始主题生成首问时立即显示准备状态", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-edge",
    "桌面精细交互只执行一次。",
  );
  let releaseQuestion!: () => void;
  const questionGate = new Promise<void>((resolve) => {
    releaseQuestion = resolve;
  });
  await page.route("**/api/agents", async (route) => {
    const request = route.request().postDataJSON() as {
      operation: string;
      input?: { node?: { id?: string } };
    };
    if (request.operation === "COMPILE_KNOWLEDGE_MAP") {
      return fulfill(route, compiledKnowledgeMap([node, secondNode]));
    }
    if (
      request.operation === "CREATE_FIRST_QUESTION" &&
      request.input?.node?.id === secondNode.id
    ) {
      await questionGate;
      return fulfill(route, {
        opening: "这个主题真正值得抓的是降水回流。",
        question: "降水主要通过什么作用回到地表？",
      });
    }
    return mockAgent(route);
  });
  await page.goto("/");
  await page.locator("#workspace-upload").setInputFiles({
    name: "water-cycle.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(
      "# 水循环\n\n太阳能驱动蒸发，降水在重力作用下回到地表。",
    ),
  });
  await expect(page.getByText("水循环的主要动力是什么？")).toBeVisible();

  await page.getByRole("button", { name: "主题", exact: true }).click();
  const topic = page.getByRole("button", { name: /降水回流/ });
  await topic.click();
  try {
    await expect(topic.getByText("正在准备…")).toBeVisible();
    await expect(topic).toBeDisabled();
    await page.screenshot({
      path: testInfo.outputPath("topic-switch-preparing.png"),
      fullPage: false,
    });
  } finally {
    releaseQuestion();
  }
  await expect(page.getByText("降水主要通过什么作用回到地表？")).toBeVisible();
  await expect(topic).toHaveAttribute("data-active", "true");
});

test("桌面端网络失败后保留输入并可重试当前回合", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-edge",
    "桌面精细交互只执行一次。",
  );
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
    problems.push(
      `请求失败 ${request.url()}：${request.failure()?.errorText ?? "未知"}`,
    ),
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
  await page.screenshot({ path: testInfo.outputPath("retry-error.png") });
  await page.getByRole("button", { name: "重试本轮" }).click();

  await expect(
    page.getByText("对，太阳能正是推动蒸发的关键动力。"),
  ).toBeVisible();
  await expect(page.getByLabel("消息输入")).toHaveValue("");
  await page.screenshot({ path: testInfo.outputPath("retry-recovered.png") });
  expect(evaluationAttempts).toBe(2);
  expect(problems).toEqual([]);
});
