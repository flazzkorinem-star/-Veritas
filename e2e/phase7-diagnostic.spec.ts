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
    input: { stage?: string; hintLevel?: number };
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
        opening: "先从循环的动力看。",
        question: "水循环的主要动力是什么？",
      });
    case "CREATE_HINT":
      return fulfill(route, {
        hintLevel: request.input.hintLevel,
        assistantMessage: "想想晒湿衣服时，哪一种能量让水离开衣服。",
      });
    case "EVALUATE_ANSWER":
      return fulfill(route, {
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
  await page.goto("/");
  await page.locator("#workspace-upload").setInputFiles({
    name: "water-cycle.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# 水循环\n\n太阳能驱动蒸发，水汽凝结后形成降水。"),
  });

  await expect(
    page.getByText("水循环的主要动力是什么？", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "给我提示" }).click();
  await expect(page.getByText("想想晒湿衣服时", { exact: false })).toBeVisible();
  await page.getByLabel("回答输入").fill("主要动力是太阳能。 ");
  await page.getByRole("button", { name: "发送回答" }).click();
  await expect(page.getByText("对，太阳能正是推动蒸发的关键动力。")).toBeVisible();
  await expect(page.getByText("太阳能怎样让液态水进入大气？")).toBeVisible();
  await expect(page.locator(".score-line strong")).toHaveText("25");
  await expect(page.getByLabel("回答输入")).toHaveValue("");

  await page.getByRole("button", { name: "给我提示" }).click();
  await page.getByLabel("回答输入").fill("液态水吸收太阳能后会蒸发。 ");
  await page.getByRole("button", { name: "发送回答" }).click();
  await expect(page.getByText("晒湿衣服时，水发生了什么变化？")).toBeVisible();
  await expect(page.locator(".score-line strong")).toHaveText("50");

  await page.getByRole("button", { name: "看答案" }).click();
  await expect(page.getByText("湿衣服里的液态水吸收能量后蒸发成水蒸气。")).toBeVisible();
  await expect(page.getByText("如果没有阳光，蒸发环节会怎样变化？")).toBeVisible();
  await expect(page.locator(".score-line strong")).toHaveText("50");

  await page.getByLabel("回答输入").fill("蒸发会明显变慢。 ");
  await page.getByRole("button", { name: "发送回答" }).click();
  await expect(page.locator(".score-line strong")).toHaveText("75");
  await expect(page.getByLabel("回答输入")).toBeDisabled();
  await expect(page.locator(".chat-heading .status-badge")).toHaveText("已完成");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath(`phase7-${testInfo.project.name}.png`),
    fullPage: false,
  });
  expect(problems).toEqual([]);
});
