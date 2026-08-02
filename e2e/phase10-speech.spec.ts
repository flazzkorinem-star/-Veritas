import { expect, test, type Route } from "@playwright/test";

const source = { label: "第 1 段", excerpt: "太阳能驱动蒸发。" };
const item = {
  id: "item-1",
  moduleId: "module-1",
  title: "循环动力",
  summary: "太阳能驱动蒸发。",
  kind: "CORE",
  diagnosticRationale: "核心机制",
  sourceReferences: [source],
  commonMisconceptions: [],
};
const node = {
  id: "node-1",
  moduleId: "module-1",
  title: "循环动力",
  objective: "解释循环动力。",
  knowledgeItemIds: [item.id],
  sourceReferences: [source],
  canonicalUnderstanding: "太阳能驱动蒸发。",
  commonMisconceptions: [],
  bloomTargets: {
    memory: "说出动力。",
    understanding: "解释作用。",
    application: "应用机制。",
    analysis: "分析变化。",
  },
  order: 1,
};

function reply(route: Route, result: unknown) {
  return route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ result }),
  });
}

function mockAgent(route: Route) {
  const request = route.request().postDataJSON() as {
    operation: string;
    input?: { userAnswer?: string };
  };
  switch (request.operation) {
    case "EXTRACT_KNOWLEDGE":
      return reply(route, {
        modules: [{ id: "module-1", title: "水循环", sourceRange: "第 1 段" }],
        knowledgeItems: [item],
      });
    case "AUDIT_KNOWLEDGE_MAP":
      return reply(route, {
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
      return reply(route, {
        opening: "先从循环的动力看。",
        question: "水循环的主要动力是什么？",
      });
    case "EVALUATE_ANSWER":
      expect(request.input?.userAnswer).toBe("太阳能驱动水蒸发并进入大气");
      return reply(route, {
        classification: "CORRECT",
        isCorrect: true,
        progress: "ADVANCING",
        correctEvidence: ["说出太阳能与蒸发"],
        missingPoints: [],
        misconceptions: [],
        teachingMove: "AFFIRM_AND_ADVANCE",
        scaffold: null,
        assistantMessage: "对，你已经把动力和蒸发联系起来了。",
      });
    case "CREATE_STAGE_QUESTION":
      return reply(route, { question: "太阳能怎样推动蒸发？" });
    default:
      throw new Error(`未处理的 Agent 操作：${request.operation}`);
  }
}

function installSpeechStub(permissionDenied = false) {
  class FakeSpeechRecognition {
    static active: FakeSpeechRecognition | null = null;
    lang = "";
    continuous = true;
    interimResults = false;
    maxAlternatives = 2;
    onstart: (() => void) | null = null;
    onresult: ((event: unknown) => void) | null = null;
    onerror: ((event: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;

    start() {
      FakeSpeechRecognition.active = this;
      queueMicrotask(() => {
        if (permissionDenied) {
          this.onerror?.({ error: "not-allowed" });
        } else {
          this.onstart?.();
        }
      });
    }

    stop() {
      queueMicrotask(() => this.onend?.());
    }

    abort() {
      FakeSpeechRecognition.active = null;
    }
  }

  Object.defineProperty(window, "SpeechRecognition", {
    configurable: true,
    value: FakeSpeechRecognition,
  });
  Object.defineProperty(window, "webkitSpeechRecognition", {
    configurable: true,
    value: FakeSpeechRecognition,
  });
  Object.defineProperty(window, "__emitSpeech", {
    configurable: true,
    value(text: string) {
      FakeSpeechRecognition.active?.onresult?.({
        results: {
          0: { 0: { transcript: text }, isFinal: true },
          length: 1,
        },
      });
    },
  });
}

test("桌面与移动 Edge 通过语音转写完成一次回答", async ({ page }, testInfo) => {
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
  expect(
    await page.evaluate(
      () => "SpeechRecognition" in window || "webkitSpeechRecognition" in window,
    ),
  ).toBe(true);
  await page.addInitScript(installSpeechStub);
  await page.reload();
  await page.locator("#workspace-upload").setInputFiles({
    name: "speech-water.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# 水循环\n\n太阳能驱动蒸发。"),
  });
  await expect(page.getByRole("button", { name: "开始语音输入" })).toBeEnabled();

  await page.getByRole("button", { name: "开始语音输入" }).click();
  await expect(page.getByRole("button", { name: "停止语音输入" })).toBeVisible();
  await page.evaluate(() => {
    (window as typeof window & { __emitSpeech(text: string): void }).__emitSpeech(
      "太阳能驱动水蒸发",
    );
  });
  await expect(page.getByLabel("回答输入")).toHaveValue("太阳能驱动水蒸发");
  await page.getByRole("button", { name: "停止语音输入" }).click();
  await expect(page.getByRole("button", { name: "开始语音输入" })).toBeVisible();
  await page.getByLabel("回答输入").fill("太阳能驱动水蒸发并进入大气");
  await page.getByRole("button", { name: "发送回答" }).click();
  await expect(page.getByText("对，你已经把动力和蒸发联系起来了。")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(`phase10-speech-${testInfo.project.name}.png`),
  });
  expect(problems).toEqual([]);
});

test("麦克风权限被拒绝时保留文字输入", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-edge", "异常路径只在桌面执行一次。");
  await page.route("**/api/agents", mockAgent);
  await page.addInitScript(installSpeechStub, true);
  await page.goto("/");
  await page.locator("#workspace-upload").setInputFiles({
    name: "denied-water.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# 水循环\n\n太阳能驱动蒸发。"),
  });
  await page.getByLabel("回答输入").fill("已经写好的回答");
  await page.getByRole("button", { name: "开始语音输入" }).click();
  await expect(page.locator(".speech-error")).toContainText("没有获得麦克风权限");
  await expect(page.getByLabel("回答输入")).toHaveValue("已经写好的回答");
});
