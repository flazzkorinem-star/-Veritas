import { expect, test, type Page, type Route } from "@playwright/test";

const longTitle = "城市极端降雨中从蒸发凝结到地表径流与地下渗透的完整循环链路";
const source = { label: "第 1 章，第 1 段", excerpt: "太阳能驱动水蒸发。" };
const item = {
  id: "item-1",
  moduleId: "module-1",
  title: "水循环动力",
  summary: "太阳能驱动蒸发。",
  kind: "CORE",
  diagnosticRationale: "核心机制",
  sourceReferences: [source],
  commonMisconceptions: [],
};
const nodes = [
  {
    id: "node-1",
    moduleId: "module-1",
    title: longTitle,
    objective: "解释水循环动力。",
    knowledgeItemIds: [item.id],
    sourceReferences: [source],
    canonicalUnderstanding: "太阳能驱动水蒸发进入大气。",
    commonMisconceptions: [],
    bloomTargets: {
      memory: "说出动力。",
      understanding: "解释动力。",
      application: "应用机制。",
      analysis: "分析变化。",
    },
    order: 1,
  },
  {
    id: "node-2",
    moduleId: "module-1",
    title: "降水回流与地表汇流",
    objective: "解释降水回流。",
    knowledgeItemIds: [item.id],
    sourceReferences: [source],
    canonicalUnderstanding: "重力推动降水返回地表。",
    commonMisconceptions: [],
    bloomTargets: {
      memory: "说出环节。",
      understanding: "解释回流。",
      application: "判断路径。",
      analysis: "分析差异。",
    },
    order: 2,
  },
];

const successMeta = {
  attempts: 1,
  repaired: false,
  validationSource: "MODEL_VALIDATED",
};

function reply(route: Route, result: unknown) {
  return route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ result, meta: successMeta }),
  });
}

function mockAgent(route: Route) {
  const request = route.request().postDataJSON() as {
    operation: string;
    input: {
      stage?: string;
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
    };
  };
  switch (request.operation) {
    case "EXTRACT_COMPACT_KNOWLEDGE": {
      const sourceUnitIds = request.input.sourceUnits!.map(({ id }) => id);
      return reply(route, {
        modules: [{ id: "module-1", title: "自然水循环", sourceUnitIds }],
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
            title: nodes[0]!.title,
            objective: nodes[0]!.objective,
            knowledgeItemIds: ["item-1"],
          },
        ],
        sourceCoverage: sourceUnitIds,
      });
    }
    case "COMPILE_KNOWLEDGE_MAP":
      return reply(route, {
        modules: [{ id: "s1-m1", title: "自然水循环", sourceRange: "第 1 章" }],
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
            nodeId: nodes[0]!.id,
          },
        ],
      });
    case "CREATE_FIRST_QUESTION":
      return reply(route, {
        opening: `这份材料的重点是水循环动力。${"移动端长文本".repeat(16)}。`,
        question: "水循环最基本的动力来源是什么？",
      });
    case "RESPOND_TO_USER":
      if (request.input.diagnostic?.status === "NOT_STARTED") {
        return reply(route, {
          responseMode: "START_DIAGNOSTIC",
          learningGoalUpdate: null,
          assistantMessage: "可以，先检验主要动力。",
          question: "水循环的主要动力是什么？",
        });
      }
      return reply(route, {
        responseMode: "EVALUATE_DIAGNOSTIC",
        learningGoalUpdate: null,
        classification: "CORRECT",
        isCorrect: true,
        progress: "ADVANCING",
        correctEvidence: ["指出太阳能"],
        missingPoints: [],
        misconceptions: [],
        teachingMove: "AFFIRM_AND_ADVANCE",
        scaffold: null,
        assistantMessage: `答得很清楚。${"LONGTOKEN".repeat(28)}`,
      });
    case "CREATE_STAGE_QUESTION":
      return reply(route, {
        question: `${request.input.stage}：请继续说明太阳能与蒸发的关系。`,
      });
    case "CREATE_REPORT":
      return reply(route, {
        summary: "已经完成第一个主题，能够说明太阳能与蒸发的关系。",
        nodeInsights: request.input.completedNodes!.map((completedNode) => {
          const evidence = completedNode.messages.filter(
            (message) =>
              message.role === "USER" && message.content.includes("太阳能"),
          );
          const stages = ["MEMORY", "UNDERSTANDING", "APPLICATION", "ANALYSIS"];
          return {
            nodeId: completedNode.nodeId,
            learningEvidence: stages.map((stage, index) => ({
              stage,
              category: "INDEPENDENT",
              statement: "能独立说明水循环的主要动力。",
              userMessageId: evidence[index]!.id,
            })),
            misconceptions: [],
            scaffoldNotes: [],
            nextSteps: ["继续学习降水回流。"],
            sourceReferenceIndexes: [0],
          };
        }),
      });
    default:
      throw new Error(`未处理的 Agent 操作：${request.operation}`);
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    ),
  ).toBe(false);
}

test("390×844 从上传走到报告并覆盖移动浮层、键盘与横屏", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-edge",
    "移动完整验收只执行移动项目。",
  );
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
  await page.goto("/");
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "打开任务", exact: true }).click();
  await expect(
    page.locator('.workspace-sidebar[data-mobile-open="true"]'),
  ).toBeVisible();
  await page.goBack();
  await expect(page.locator(".workspace-sidebar")).toBeHidden();

  await page.locator("#empty-state-upload").setInputFiles({
    name: "一份名称很长但仍应在移动端正确截断的水循环学习材料.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(
      "# 水循环\n\n太阳能驱动水蒸发，降水在重力作用下回到地表。",
    ),
  });
  await expect(
    page.getByText("这份材料的重点是水循环动力", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("水循环最基本的动力来源是什么？")).toBeVisible();

  await page.getByRole("button", { name: "打开主题" }).click();
  await expect(
    page.locator('.topic-sidebar[data-mobile-open="true"]'),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: new RegExp(longTitle) }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "关闭当前浮层" })
    .click({ position: { x: 380, y: 422 } });
  await expect(page.locator(".topic-sidebar")).toBeHidden();

  await page.setViewportSize({ width: 390, height: 500 });
  await page.getByLabel("消息输入").focus();
  const composer = await page.locator(".composer-shell").boundingBox();
  expect(composer).not.toBeNull();
  expect(composer!.y + composer!.height).toBeLessThanOrEqual(500);
  await expectNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 390, height: 844 });

  for (let index = 1; index <= 4; index += 1) {
    await page.getByLabel("消息输入").fill(`第 ${index} 层：太阳能驱动蒸发。`);
    await page.getByRole("button", { name: "发送消息" }).click();
    await expect(page.locator(".score-line strong")).toHaveText(
      String(index * 25),
    );
    await expectNoHorizontalOverflow(page);
  }
  await expect(
    page.getByRole("button", { name: "学习下一个主题：降水回流与地表汇流" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "打开进度", exact: true }).click();
  const diagnostic = page.locator('.diagnostic-panel[data-mobile-open="true"]');
  await expect(diagnostic).toBeVisible();
  const diagnosticBox = await diagnostic.boundingBox();
  expect(diagnosticBox?.width).toBe(390);
  await page.getByRole("button", { name: "查看学习报告" }).click();
  const report = page.getByRole("dialog", { name: "学习诊断报告" });
  await expect(report).toBeVisible();
  await expect(report.getByText("1 / 2 个主题")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("mobile-portrait.png") });
  await page.goBack();
  await expect(report).toBeHidden();

  await page
    .getByRole("button", { name: "学习下一个主题：降水回流与地表汇流" })
    .click();
  await expect(
    page.getByText("这份材料的重点是水循环动力", { exact: false }),
  ).toBeVisible();

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(
    page.getByRole("navigation", { name: "移动端工作区导航" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "打开进度", exact: true }).click();
  const landscapeDiagnostic = page.locator(
    '.diagnostic-panel[data-mobile-open="true"]',
  );
  await expect(landscapeDiagnostic).toBeVisible();
  await expect(landscapeDiagnostic).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 0, 0)",
  );
  expect((await landscapeDiagnostic.boundingBox())?.width).toBeLessThanOrEqual(
    421,
  );
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("mobile-landscape.png") });
  await page.keyboard.press("Escape");
  await expect(page.locator(".diagnostic-panel")).toBeHidden();
  expect(problems).toEqual([]);
});
