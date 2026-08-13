import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type StageKey = "MEMORY" | "UNDERSTANDING" | "APPLICATION" | "ANALYSIS";

type TurnEvidence = {
  input: string;
  output: string;
  decision: Record<string, unknown>;
  before: Awaited<ReturnType<typeof captureState>>;
  after: Awaited<ReturnType<typeof captureState>>;
  operations: string[];
};

const projectRoot = process.cwd();
const materialPath = path.join(
  projectRoot,
  "docs",
  "evaluation",
  "a0691c1",
  "materials",
  "S02-ETF正常作答二.md",
);
const evidenceDirectory = path.join(
  projectRoot,
  "docs",
  "evaluation",
  "a0691c1",
  "regression",
  "agent2-answer-coverage",
);

async function storedState(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("veritas");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction(["sessions", "messages"], "readonly");
    const sessionsRequest = transaction.objectStore("sessions").getAll();
    const messagesRequest = transaction.objectStore("messages").getAll();
    const [sessions, messages] = await Promise.all([
      new Promise<unknown[]>((resolve, reject) => {
        sessionsRequest.onsuccess = () => resolve(sessionsRequest.result);
        sessionsRequest.onerror = () => reject(sessionsRequest.error);
      }),
      new Promise<Array<{ role: string; content: string }>>((resolve, reject) => {
        messagesRequest.onsuccess = () => resolve(messagesRequest.result);
        messagesRequest.onerror = () => reject(messagesRequest.error);
      }),
    ]);
    database.close();
    return {
      session: (sessions[0] as { session?: unknown } | undefined)?.session ?? null,
      messages: messages.map(({ role, content }) => ({ role, content })),
    };
  });
}

async function captureState(page: Page) {
  return {
    score: await page.locator(".score-line strong").textContent(),
    visibleMessages: await page.locator(".message-bubble").allTextContents(),
    stored: await storedState(page),
  };
}

async function setTargetQuestion(page: Page, stage: StageKey, question: string) {
  await page.evaluate(
    async ({ stage, question }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("veritas");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = database.transaction(["sessions", "messages"], "readwrite");
      const sessionsStore = transaction.objectStore("sessions");
      const messagesStore = transaction.objectStore("messages");
      const sessionsRequest = sessionsStore.getAll();
      const messagesRequest = messagesStore.getAll();
      const [sessions, messages] = await Promise.all([
        new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
          sessionsRequest.onsuccess = () => resolve(sessionsRequest.result);
          sessionsRequest.onerror = () => reject(sessionsRequest.error);
        }),
        new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
          messagesRequest.onsuccess = () => resolve(messagesRequest.result);
          messagesRequest.onerror = () => reject(messagesRequest.error);
        }),
      ]);
      const stored = sessions[0];
      if (!stored) throw new Error("未找到诊断会话。");
      const stageState = (key: StageKey) => ({
        key,
        status:
          key === stage
            ? "ACTIVE"
            : stage === "UNDERSTANDING" && key === "MEMORY"
              ? "PASSED_WITH_ANSWER"
              : "LOCKED",
        mainQuestion: key === stage ? question : null,
        hintLevel: 0,
        hasRequestedHint: false,
        stalledCount: 0,
      });
      stored.session = {
        nodeId: stored.nodeId,
        status: "IN_PROGRESS",
        currentStage: stage,
        stages: {
          MEMORY: stageState("MEMORY"),
          UNDERSTANDING: stageState("UNDERSTANDING"),
          APPLICATION: stageState("APPLICATION"),
          ANALYSIS: stageState("ANALYSIS"),
        },
      };
      sessionsStore.put(stored);
      const assistant = messages.find((message) => message.role === "ASSISTANT");
      if (!assistant) throw new Error("未找到首问消息。");
      assistant.content = question;
      messagesStore.put(assistant);
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
    },
    { stage, question },
  );
  await page.reload();
  await expect(page.getByLabel("消息输入")).toBeVisible();
  await expect(page.locator(".message-bubble-assistant").last()).toHaveText(question);
}

async function sendTurn(page: Page, input: string): Promise<TurnEvidence> {
  const before = await captureState(page);
  const operations: string[] = [];
  const onRequest = (request: import("@playwright/test").Request) => {
    if (!request.url().endsWith("/api/agents")) return;
    const operation = (request.postDataJSON() as { operation?: string } | null)
      ?.operation;
    if (operation) operations.push(operation);
  };
  page.on("request", onRequest);
  const responsePromise = page.waitForResponse((response) => {
    if (!response.url().endsWith("/api/agents")) return false;
    return (
      (response.request().postDataJSON() as { operation?: string } | null)?.operation ===
      "RESPOND_TO_USER"
    );
  });
  const assistantCount = await page.locator(".message-bubble-assistant").count();
  await page.getByLabel("消息输入").fill(input);
  await page.getByRole("button", { name: "发送消息" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  await expect
    .poll(() => page.locator(".message-bubble-assistant").count(), { timeout: 120_000 })
    .toBeGreaterThan(assistantCount);
  await expect(page.locator(".turn-pending")).toHaveCount(0, { timeout: 120_000 });
  await expect(page.getByLabel("消息输入")).toBeEnabled();
  const body = (await response.json()) as { result: Record<string, unknown> };
  const after = await captureState(page);
  page.off("request", onRequest);
  return {
    input,
    output: await page
      .locator(".message-bubble-assistant")
      .nth(assistantCount)
      .innerText(),
    decision: body.result,
    before,
    after,
    operations,
  };
}

async function prepare(page: Page) {
  await page.goto("/");
  await page.locator("#workspace-upload").setInputFiles(materialPath);
  await page.locator(".message-bubble-assistant").first().waitFor({
    state: "visible",
    timeout: 240_000,
  });
}

async function saveEvidence(testInfo: TestInfo, name: string, value: unknown) {
  await mkdir(evidenceDirectory, { recursive: true });
  const body = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(path.join(evidenceDirectory, `${name}.json`), body, "utf8");
  await testInfo.attach(name, {
    body: Buffer.from(body),
    contentType: "application/json",
  });
}

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    process.env.RUN_REAL_DEEPSEEK !== "1" || testInfo.project.name !== "desktop-edge",
    "仅在显式启用时用真实 DeepSeek 回归 Agent 2 回答覆盖。",
  );
  test.setTimeout(600_000);
});

test("S15 单侧回答不推进，完整对照答案仍通过", async ({ page }, testInfo) => {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type()))
      problems.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  await prepare(page);
  const question = "请用一句话说明 ETF 与联接基金在交易方式和定价上的根本区别。";
  await setTargetQuestion(page, "MEMORY", question);

  const badcase = await sendTurn(
    page,
    "没有证券账户时我会选联接基金，因为它能通过普通基金平台按净值申赎。",
  );
  expect(badcase.decision).toMatchObject({ classification: "PARTIAL", isCorrect: false });
  expect(badcase.output).toContain("ETF");
  expect(badcase.after.score).toBe(badcase.before.score);
  expect(badcase.after.stored.session).toMatchObject({
    currentStage: "MEMORY",
    stages: { MEMORY: { status: "ACTIVE", mainQuestion: question } },
  });
  expect(badcase.operations).toEqual(["RESPOND_TO_USER"]);

  const control = await sendTurn(
    page,
    "ETF 在交易所盘中按市场供需撮合出的市价成交，联接基金通过普通基金平台按基金净值申赎。",
  );
  expect(control.decision).toMatchObject({ classification: "CORRECT", isCorrect: true });
  expect(control.after.score).toBe("25");
  expect(control.after.stored.session).toMatchObject({
    currentStage: "UNDERSTANDING",
    stages: { MEMORY: { status: "PASSED" }, UNDERSTANDING: { status: "ACTIVE" } },
  });
  expect(control.operations).toEqual(["RESPOND_TO_USER", "CREATE_STAGE_QUESTION"]);
  expect(problems).toEqual([]);
  await saveEvidence(testInfo, "S15", { question, badcase, control, problems });
});

test("S20 相关但回答另一问题时不推进", async ({ page }, testInfo) => {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type()))
      problems.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  await prepare(page);
  const question = "ETF 的交易价格为什么会偏离其净值？请用市场供需关系来解释这一现象。";
  await setTargetQuestion(page, "UNDERSTANDING", question);

  const badcase = await sendTurn(
    page,
    "在实际选择上，有证券账户且看重盘中成交选ETF；没有证券账户、习惯定投的人选联接基金。",
  );
  expect(badcase.decision).toMatchObject({
    classification: "OFF_TOPIC",
    isCorrect: false,
    teachingMove: "BRIDGE_BACK",
  });
  expect(badcase.output).toMatch(/价格|净值/);
  expect(badcase.output).not.toMatch(/回答得很到位|说得很准确|完全正确/);
  expect(badcase.after.score).toBe(badcase.before.score);
  expect(badcase.after.stored.session).toMatchObject({
    currentStage: "UNDERSTANDING",
    stages: { UNDERSTANDING: { status: "ACTIVE", mainQuestion: question } },
  });
  expect(badcase.operations).toEqual(["RESPOND_TO_USER"]);
  expect(problems).toEqual([]);
  await saveEvidence(testInfo, "S20", { question, badcase, problems });
});
