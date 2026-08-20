import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import path from "node:path";

type AgentOperation = { operation: string; status?: number };

type StoredSession = {
  status: string;
  currentStage: "MEMORY" | "UNDERSTANDING" | "APPLICATION" | "ANALYSIS";
  stages: Record<
    "MEMORY" | "UNDERSTANDING" | "APPLICATION" | "ANALYSIS",
    {
      status: string;
      mainQuestion: string | null;
      verificationQuestion: string | null;
      answerOrigin: "NONE" | "REQUESTED" | "AUTOMATIC";
      stalledCount: number;
    }
  >;
};

const inabilityMessages = [
  "我真的不知道该怎么回答这个问题。",
  "这题我不会，暂时答不出来。",
  "我脑子里一片空白，完全没有思路。",
  "想了半天还是不知道从哪里开始。",
  "这个我确实答不上来。",
  "我没法给出答案，能先帮我理一理吗？",
];

const source = { label: "第 1 段", excerpt: "ETF 在交易所交易，联接基金场外申赎。" };
const knowledgeItems = [
  {
    id: "item-1",
    moduleId: "module-1",
    title: "ETF 与联接基金",
    summary: "ETF 在交易所盘中交易，联接基金通常在基金平台按净值申赎。",
    kind: "CORE" as const,
    diagnosticRationale: "这是理解两类产品差异的基础。",
    sourceReferences: [source],
    commonMisconceptions: [],
  },
];
const node = {
  id: "node-1",
  moduleId: "module-1",
  title: "ETF 与联接基金",
  objective: "区分 ETF 与联接基金。",
  knowledgeItemIds: ["item-1"],
  sourceReferences: [source],
  canonicalUnderstanding: "ETF 在场内交易，联接基金通常在场外按净值申赎。",
  commonMisconceptions: [],
  bloomTargets: {
    memory: "说出交易渠道差异。",
    understanding: "解释定价差异。",
    application: "根据账户条件选择。",
    analysis: "分析价格偏离机制。",
  },
  order: 1,
};
const mainQuestion = "ETF 与 ETF 联接基金在交易渠道和申购赎回方式上有什么区别？";
const materialPath = path.join(
  process.cwd(),
  "docs",
  "evaluation",
  "a0691c1",
  "materials",
  "S11-城市内涝误解.md",
);

async function requestDecision(
  request: APIRequestContext,
  userMessage: string,
  options: {
    recentMessages?: { role: "USER" | "ASSISTANT"; content: string }[];
    stalledCount?: number;
  } = {},
) {
  const response = await request.post("/api/agents", {
    data: {
      operation: "RESPOND_TO_USER",
      input: {
        node,
        knowledgeItems,
        learningGoal: null,
        materialContext: {
          title: "ETF 基础材料",
          modules: [{ id: "module-1", title: "基金产品" }],
          itemIndex: knowledgeItems.map(({ id, title, kind }) => ({ id, title, kind })),
        },
        recentMessages: options.recentMessages ?? [],
        diagnostic: {
          status: "ACTIVE",
          stage: "MEMORY",
          mainQuestion,
          stalledCount: options.stalledCount ?? 0,
        },
        userMessage,
      },
    },
  });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { result: Record<string, unknown> }).result;
}

async function storedState(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const openRequest = indexedDB.open("veritas");
      openRequest.onsuccess = () => resolve(openRequest.result);
      openRequest.onerror = () => reject(openRequest.error);
    });
    const readAll = <T>(storeName: string) =>
      new Promise<T[]>((resolve, reject) => {
        const readRequest = database
          .transaction(storeName, "readonly")
          .objectStore(storeName)
          .getAll();
        readRequest.onsuccess = () => resolve(readRequest.result as T[]);
        readRequest.onerror = () => reject(readRequest.error);
      });
    const [sessions, messages] = await Promise.all([
      readAll<{ session: StoredSession; scaffoldEvents?: unknown[] }>("sessions"),
      readAll<{ role: string; content: string; createdAt: string }>("messages"),
    ]);
    database.close();
    return {
      session: sessions[0]?.session ?? null,
      scaffoldCount: sessions[0]?.scaffoldEvents?.length ?? 0,
      messages: messages
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .map(({ role, content }) => ({ role, content })),
    };
  });
}

async function captureState(page: Page) {
  return {
    score: await page.locator(".score-line strong").textContent(),
    assistantMessages: await page
      .locator(".message-bubble-assistant:not(:has(.turn-pending))")
      .allTextContents(),
    stored: await storedState(page),
  };
}

async function sendTurn(page: Page, input: string, operations: AgentOperation[]) {
  const operationStart = operations.length;
  const responsePromise = page.waitForResponse((response) => {
    if (!response.url().endsWith("/api/agents")) return false;
    return (
      (response.request().postDataJSON() as { operation?: string } | null)?.operation ===
      "RESPOND_TO_USER"
    );
  });
  await page.getByLabel("消息输入").fill(input);
  await page.getByRole("button", { name: "发送消息" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  await expect(page.locator(".turn-pending")).toHaveCount(0, { timeout: 120_000 });
  await expect(page.getByLabel("消息输入")).toBeEnabled();
  return {
    input,
    decision: ((await response.json()) as { result: Record<string, unknown> }).result,
    state: await captureState(page),
    operations: operations.slice(operationStart),
  };
}

async function attachJson(testInfo: TestInfo, name: string, value: unknown) {
  await testInfo.attach(name, {
    body: Buffer.from(`${JSON.stringify(value, null, 2)}\n`),
    contentType: "application/json",
  });
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    process.env.VERITAS_REAL_DEEPSEEK !== "1" || testInfo.project.name !== "desktop-edge",
    "仅在显式启用时用真实 DeepSeek 回归无法作答语义。",
  );
  test.setTimeout(600_000);
});

test("六种无法作答表达与三个边界对照由真实 Agent 2 正确区分", async ({
  request,
}, testInfo) => {
  const results = [];
  for (const input of inabilityMessages) {
    const decision = await requestDecision(request, input);
    expect(decision).toMatchObject({
      responseMode: "EVALUATE_DIAGNOSTIC",
      classification: "NO_ANSWER",
      isCorrect: false,
      progress: "STALLED",
    });
    results.push({ input, decision });
  }

  const question = await requestDecision(request, "什么叫场内交易？");
  expect(question).toMatchObject({ responseMode: "CONVERSATION" });

  const pause = await requestDecision(request, "先别考我，我想暂停一下。");
  expect(pause).toMatchObject({ responseMode: "CONVERSATION" });

  const tentative = await requestDecision(
    request,
    "我不确定，但我猜 ETF 是在交易所盘中成交，ETF 联接基金是在基金平台按净值申购赎回。",
  );
  expect(tentative).toMatchObject({
    responseMode: "EVALUATE_DIAGNOSTIC",
    classification: "CORRECT",
    isCorrect: true,
    progress: "ADVANCING",
  });

  const correct = await requestDecision(
    request,
    "ETF 在交易所盘中成交，ETF 联接基金在基金平台按净值申购赎回。",
  );
  expect(correct).toMatchObject({
    responseMode: "EVALUATE_DIAGNOSTIC",
    classification: "CORRECT",
    isCorrect: true,
    progress: "ADVANCING",
  });

  await attachJson(testInfo, "真实语义矩阵", {
    model: "deepseek-v4-flash",
    productionBuild: true,
    artificialActiveContext: true,
    results,
    controls: { question, pause, tentative, correct },
  });
});

test("诊断反馈不会累计补齐答案，旧版泄露内容也不能换词后独立通过", async ({
  request,
}, testInfo) => {
  const first = await requestDecision(request, "我完全不知道。", {
    stalledCount: 0,
  });
  expect(first).toMatchObject({
    responseMode: "EVALUATE_DIAGNOSTIC",
    classification: "NO_ANSWER",
    isCorrect: false,
    progress: "STALLED",
  });
  expect(first.scaffold).not.toBeNull();

  const firstMessage = String(first.assistantMessage);
  const secondHistory = [
    { role: "USER" as const, content: "我完全不知道。" },
    { role: "ASSISTANT" as const, content: firstMessage },
  ];
  const second = await requestDecision(request, "还是不知道。", {
    recentMessages: secondHistory,
    stalledCount: 1,
  });
  expect(second).toMatchObject({
    responseMode: "EVALUATE_DIAGNOSTIC",
    classification: "NO_ANSWER",
    isCorrect: false,
    progress: "STALLED",
  });

  const secondMessage = String(second.assistantMessage);
  const third = await requestDecision(request, "仍然答不上来。", {
    recentMessages: [
      ...secondHistory,
      { role: "USER" as const, content: "还是不知道。" },
      { role: "ASSISTANT" as const, content: secondMessage },
    ],
    stalledCount: 2,
  });
  expect(third).toMatchObject({
    responseMode: "EVALUATE_DIAGNOSTIC",
    classification: "NO_ANSWER",
    isCorrect: false,
    progress: "STALLED",
  });

  const cumulativeFeedback = `${firstMessage}\n${secondMessage}\n${String(third.assistantMessage)}`;
  const cumulativeEvaluation = await requestDecision(request, cumulativeFeedback);
  expect(cumulativeEvaluation).toMatchObject({
    responseMode: "EVALUATE_DIAGNOSTIC",
    isCorrect: false,
  });

  const partialUser = "联接基金在基金平台按净值申购赎回。";
  const partial = await requestDecision(request, partialUser);
  expect(partial).toMatchObject({
    responseMode: "EVALUATE_DIAGNOSTIC",
    classification: "PARTIAL",
    isCorrect: false,
  });
  const partialEvaluation = await requestDecision(
    request,
    `${partialUser}\n${String(partial.assistantMessage)}`,
  );
  expect(partialEvaluation).toMatchObject({
    responseMode: "EVALUATE_DIAGNOSTIC",
    isCorrect: false,
  });

  const leakedAnswer =
    "ETF 在交易所盘中按市价成交，ETF 联接基金在基金平台按净值申购赎回。";
  const replay = await requestDecision(
    request,
    "前者需要证券账户，交易时按当时的市场价格成交；后者走普通基金销售渠道，以每日基金净值办理份额进出。",
    {
      recentMessages: [{ role: "ASSISTANT", content: leakedAnswer }],
      stalledCount: 1,
    },
  );
  expect(replay).toMatchObject({
    responseMode: "EVALUATE_DIAGNOSTIC",
    classification: "COPIED",
    isCorrect: false,
    progress: "STALLED",
  });

  const userPartial = "联接基金在基金平台按净值申购赎回。";
  const normalCompletion = await requestDecision(
    request,
    "ETF 在交易所盘中成交，联接基金在基金平台按净值申购赎回。",
    {
      recentMessages: [
        { role: "USER", content: userPartial },
        {
          role: "ASSISTANT",
          content: "联接基金这一侧是你已经说出的内容。请自行补充 ETF 一侧。",
        },
      ],
    },
  );
  expect(normalCompletion).toMatchObject({
    responseMode: "EVALUATE_DIAGNOSTIC",
    classification: "CORRECT",
    isCorrect: true,
  });

  await attachJson(testInfo, "诊断答案泄露回归", {
    model: "deepseek-v4-flash",
    first,
    second,
    third,
    cumulativeEvaluation,
    partial,
    partialEvaluation,
    replay,
    normalCompletion,
  });
});

test("真实页面连续三轮无法作答后先做同层小验证，再进入下一层", async ({
  page,
}, testInfo) => {
  const operations: AgentOperation[] = [];
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
    const operation = (response.request().postDataJSON() as { operation?: string } | null)
      ?.operation;
    const pending = operations.findLast(
      (entry) => entry.operation === operation && entry.status === undefined,
    );
    if (pending) pending.status = response.status();
  });

  await page.goto("/");
  await page.locator("#workspace-upload").setInputFiles(materialPath);
  await page.locator(".message-bubble-assistant").first().waitFor({
    state: "visible",
    timeout: 240_000,
  });
  await expect(page.getByLabel("消息输入")).toBeEnabled();
  const before = await captureState(page);
  const originalQuestion = before.stored.session?.stages.MEMORY.mainQuestion;
  expect(originalQuestion).toBeTruthy();
  const turns = [];

  for (const [index, input] of inabilityMessages.slice(0, 3).entries()) {
    const turn = await sendTurn(page, input, operations);
    expect(turn.decision).toMatchObject({
      responseMode: "EVALUATE_DIAGNOSTIC",
      classification: "NO_ANSWER",
      isCorrect: false,
      progress: "STALLED",
    });
    if (index < 2) {
      expect(turn.state.score).toBe(before.score);
      expect(turn.state.stored.session).toMatchObject({
        currentStage: "MEMORY",
        stages: {
          MEMORY: {
            status: "ACTIVE",
            mainQuestion: originalQuestion,
            stalledCount: index + 1,
          },
        },
      });
      expect(turn.operations).toEqual([{ operation: "RESPOND_TO_USER", status: 200 }]);
    }
    turns.push(turn);
  }

  const after = turns.at(-1)!.state;
  const afterSession = after.stored.session!;
  expect(after.score).toBe("0");
  expect(afterSession).toMatchObject({
    status: "IN_PROGRESS",
    currentStage: "MEMORY",
    stages: {
      MEMORY: {
        status: "ACTIVE",
        mainQuestion: originalQuestion,
        answerOrigin: "AUTOMATIC",
        stalledCount: 0,
      },
      UNDERSTANDING: { status: "LOCKED", stalledCount: 0 },
      APPLICATION: { status: "LOCKED", stalledCount: 0 },
      ANALYSIS: { status: "LOCKED", stalledCount: 0 },
    },
  });
  expect(afterSession.stages.MEMORY.verificationQuestion).toBeTruthy();
  expect(after.assistantMessages.at(-1)).toBe(
    afterSession.stages.MEMORY.verificationQuestion,
  );
  expect(turns.at(-1)!.operations).toEqual([
    { operation: "RESPOND_TO_USER", status: 200 },
    { operation: "CREATE_STAGE_ANSWER", status: 200 },
    { operation: "CREATE_STAGE_VERIFICATION", status: 200 },
  ]);

  const verification = await sendTurn(
    page,
    "降雨越强、持续越久，到达地面的水越多；与草地泥土相比，硬化地表让雨水更难下渗，形成的径流更多也更快；排水能力决定积水能否及时排走；低洼地形更容易汇集积水。",
    operations,
  );
  expect(verification.decision).toMatchObject({
    responseMode: "EVALUATE_DIAGNOSTIC",
    classification: "CORRECT",
    isCorrect: true,
    progress: "ADVANCING",
  });
  expect(verification.state.stored.session).toMatchObject({
    currentStage: "UNDERSTANDING",
    stages: {
      MEMORY: { status: "PASSED_WITH_ANSWER", answerOrigin: "AUTOMATIC" },
      UNDERSTANDING: { status: "ACTIVE" },
    },
  });
  expect(verification.operations).toEqual([
    { operation: "RESPOND_TO_USER", status: 200 },
    { operation: "CREATE_STAGE_QUESTION", status: 200 },
  ]);
  expect(browserProblems).toEqual([]);

  await testInfo.attach("真实页面截图", {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });
  await attachJson(testInfo, "真实连续停滞", {
    model: "deepseek-v4-flash",
    productionBuild: true,
    browser: "Edge 1440×900",
    artificialDiagnosticState: false,
    originalQuestion,
    before,
    turns,
    operations,
    browserProblems,
  });
});
