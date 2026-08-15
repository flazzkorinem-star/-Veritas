import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type StageKey = "MEMORY" | "UNDERSTANDING" | "APPLICATION" | "ANALYSIS";

type OperationEvidence = {
  operation: string;
  status?: number;
};

const stageOrder: StageKey[] = ["MEMORY", "UNDERSTANDING", "APPLICATION", "ANALYSIS"];
const evidenceDirectory = path.join(
  process.cwd(),
  "docs",
  "evaluation",
  "a0691c1",
  "regression",
  "agent2-single-question",
);

const cases = [
  {
    id: "S01",
    materialPath: path.join(
      process.cwd(),
      "docs",
      "evaluation",
      "a0691c1",
      "materials",
      "S01-ETF正常作答一.md",
    ),
    stage: "MEMORY" as const,
    question: "ETF 与 ETF 联接基金在交易渠道和申购赎回方式上有什么区别？",
    answer:
      "ETF 是在交易所上市、通常用证券账户盘中买卖的基金；ETF 联接基金主要投资目标 ETF，通常在基金销售平台按净值申购和赎回。",
  },
  {
    id: "S02",
    materialPath: path.join(
      process.cwd(),
      "docs",
      "evaluation",
      "a0691c1",
      "materials",
      "S02-ETF正常作答二.md",
    ),
    stage: "MEMORY" as const,
    question:
      "没有证券账户、只能使用基金销售平台时，应选择 ETF 还是 ETF 联接基金？请说明理由。",
    answer:
      "没有证券账户时我会选ETF联接基金，因为它能在基金销售平台按净值申购赎回；ETF通常要用证券账户盘中交易。",
  },
];

async function readStoredState(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("veritas");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const readAll = <T>(storeName: string) =>
      new Promise<T[]>((resolve, reject) => {
        const request = database
          .transaction(storeName, "readonly")
          .objectStore(storeName)
          .getAll();
        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(request.error);
      });
    const [tasks, sessions, messages] = await Promise.all([
      readAll<{ currentNodeId: string | null }>("tasks"),
      readAll<{ nodeId: string; session: Record<string, unknown> }>("sessions"),
      readAll<{ role: string; content: string; createdAt: string }>("messages"),
    ]);
    database.close();
    return {
      session:
        sessions.find(({ nodeId }) => nodeId === tasks[0]?.currentNodeId)?.session ??
        null,
      messages: messages
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .map(({ role, content }) => ({ role, content })),
    };
  });
}

async function captureState(page: Page) {
  return {
    score: await page.locator(".score-line strong").textContent(),
    visibleMessages: await page.locator(".message-bubble").allTextContents(),
    assistantMessages: await page
      .locator(".message-bubble-assistant:not(:has(.turn-pending))")
      .allTextContents(),
    stored: await readStoredState(page),
  };
}

async function setArtificialDiagnosticState(
  page: Page,
  stage: StageKey,
  question: string,
) {
  await page.evaluate(
    async ({ stage, question, stageOrder }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("veritas");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = database.transaction(["sessions", "messages"], "readwrite");
      const sessionsStore = transaction.objectStore("sessions");
      const messagesStore = transaction.objectStore("messages");
      const readAll = <T>(store: IDBObjectStore) =>
        new Promise<T[]>((resolve, reject) => {
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result as T[]);
          request.onerror = () => reject(request.error);
        });
      const [sessions, messages] = await Promise.all([
        readAll<Record<string, unknown>>(sessionsStore),
        readAll<Record<string, unknown>>(messagesStore),
      ]);
      const stored = sessions[0];
      if (!stored) throw new Error("未找到诊断会话。");
      const activeIndex = stageOrder.indexOf(stage);
      const stages = Object.fromEntries(
        stageOrder.map((key, index) => [
          key,
          {
            key,
            status:
              index < activeIndex
                ? "PASSED"
                : index === activeIndex
                  ? "ACTIVE"
                  : "LOCKED",
            mainQuestion: index === activeIndex ? question : null,
            verificationQuestion: null,
            answerOrigin: "NONE",
            hintLevel: 0,
            hasRequestedHint: false,
            stalledCount: 0,
          },
        ]),
      );
      stored.session = {
        nodeId: stored.nodeId,
        status: "IN_PROGRESS",
        currentStage: stage,
        stages,
      };
      sessionsStore.put(stored);
      const assistant = messages.find((message) => message.role === "ASSISTANT");
      if (!assistant) throw new Error("未找到可替换的首问消息。");
      assistant.content = question;
      messagesStore.put(assistant);
      for (const message of messages) {
        if (message !== assistant) messagesStore.delete(message.id as IDBValidKey);
      }
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
    },
    { stage, question, stageOrder },
  );
  await page.reload();
  await expect(page.getByLabel("消息输入")).toBeVisible();
  await expect(page.locator(".message-bubble-assistant").last()).toHaveText(question);
}

async function saveEvidence(testInfo: TestInfo, id: string, evidence: unknown) {
  await mkdir(evidenceDirectory, { recursive: true });
  const body = `${JSON.stringify(evidence, null, 2)}\n`;
  await writeFile(path.join(evidenceDirectory, `${id}.json`), body, "utf8");
  await testInfo.attach(`${id}-同轮唯一主问题`, {
    body: Buffer.from(body),
    contentType: "application/json",
  });
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    process.env.RUN_REAL_DEEPSEEK !== "1" || testInfo.project.name !== "desktop-edge",
    "仅在显式启用时用真实 DeepSeek 回归同轮唯一主问题。",
  );
  test.setTimeout(600_000);
});

for (const regressionCase of cases) {
  test(`${regressionCase.id} 正确推进后只有一道正式新问题`, async ({
    page,
  }, testInfo) => {
    const operations: OperationEvidence[] = [];
    const browserProblems: string[] = [];
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) {
        browserProblems.push(`${message.type()}: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => browserProblems.push(`pageerror: ${error.message}`));
    page.on("requestfailed", (request) =>
      browserProblems.push(
        `requestfailed: ${request.url()} ${request.failure()?.errorText ?? ""}`,
      ),
    );
    page.on("request", (request) => {
      if (!request.url().endsWith("/api/agents")) return;
      const operation = (request.postDataJSON() as { operation?: string } | null)
        ?.operation;
      if (operation) operations.push({ operation });
    });
    page.on("response", (response) => {
      if (!response.url().endsWith("/api/agents")) return;
      const operation = (
        response.request().postDataJSON() as { operation?: string } | null
      )?.operation;
      const pending = operations.findLast(
        (entry) => entry.operation === operation && entry.status === undefined,
      );
      if (pending) pending.status = response.status();
    });

    await page.goto("/");
    await page.locator("#workspace-upload").setInputFiles(regressionCase.materialPath);
    await page.locator(".message-bubble-assistant").first().waitFor({
      state: "visible",
      timeout: 240_000,
    });
    await setArtificialDiagnosticState(
      page,
      regressionCase.stage,
      regressionCase.question,
    );

    const before = await captureState(page);
    const beforeAssistantCount = before.assistantMessages.length;
    const turnOperationStart = operations.length;
    const decisionResponse = page.waitForResponse((response) => {
      if (!response.url().endsWith("/api/agents")) return false;
      return (
        (response.request().postDataJSON() as { operation?: string } | null)
          ?.operation === "RESPOND_TO_USER"
      );
    });
    await page.getByLabel("消息输入").fill(regressionCase.answer);
    await page.getByRole("button", { name: "发送消息" }).click();
    const response = await decisionResponse;
    expect(response.status()).toBe(200);
    const decision = ((await response.json()) as { result: Record<string, unknown> })
      .result;
    await expect(page.locator(".turn-pending")).toHaveCount(0, { timeout: 120_000 });
    await expect(page.getByLabel("消息输入")).toBeEnabled();
    const assistantMessages = page.locator(
      ".message-bubble-assistant:not(:has(.turn-pending))",
    );
    await expect(assistantMessages).toHaveCount(beforeAssistantCount + 2, {
      timeout: 120_000,
    });
    const after = await captureState(page);
    const addedMessages = after.assistantMessages.slice(beforeAssistantCount);
    const nextStage = stageOrder[stageOrder.indexOf(regressionCase.stage) + 1]!;
    const afterSession = after.stored.session as {
      currentStage: StageKey;
      stages: Record<StageKey, { status: string; mainQuestion: string | null }>;
    };
    const turnOperations = operations.slice(turnOperationStart);

    expect(decision).toMatchObject({
      responseMode: "EVALUATE_DIAGNOSTIC",
      classification: "CORRECT",
      isCorrect: true,
    });
    expect(decision).not.toHaveProperty("question");
    expect(addedMessages).toHaveLength(2);
    expect(addedMessages[0]).toBe(decision.assistantMessage);
    expect(addedMessages[0]).not.toMatch(/[?？]/);
    expect(addedMessages[1]).toBe(afterSession.stages[nextStage].mainQuestion);
    expect(Number(after.score)).toBe(Number(before.score) + 25);
    expect(afterSession.currentStage).toBe(nextStage);
    expect(afterSession.stages[regressionCase.stage].status).toBe("PASSED");
    expect(afterSession.stages[nextStage].status).toBe("ACTIVE");
    expect(
      after.stored.messages
        .filter(({ role }) => role === "ASSISTANT")
        .slice(-2)
        .map(({ content }) => content),
    ).toEqual(addedMessages);
    expect(turnOperations).toEqual([
      { operation: "RESPOND_TO_USER", status: 200 },
      { operation: "CREATE_STAGE_QUESTION", status: 200 },
    ]);
    expect(browserProblems).toEqual([]);

    await mkdir(evidenceDirectory, { recursive: true });
    await page.screenshot({
      path: path.join(evidenceDirectory, `${regressionCase.id}.png`),
      fullPage: false,
    });
    await saveEvidence(testInfo, regressionCase.id, {
      caseId: regressionCase.id,
      model: "deepseek-v4-flash",
      productionBuild: true,
      browser: "Edge 1440×900",
      artificialDiagnosticState: true,
      artificialStateDescription:
        "上传原始评测材料后，仅把当前层和主问题改为固定回归状态；回答仍从页面发送，并经过真实 /api/agents。",
      question: regressionCase.question,
      answer: regressionCase.answer,
      decision,
      feedback: addedMessages[0],
      formalQuestion: addedMessages[1],
      operations,
      turnOperations,
      before,
      after,
      browserProblems,
    });
  });
}
