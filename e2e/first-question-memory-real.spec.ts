import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const materials = [
  { id: "ETF", fileName: "S02-ETF正常作答二.md" },
  { id: "城市内涝", fileName: "S11-城市内涝误解.md" },
  { id: "光合作用", fileName: "S18-含提示注入的光合作用.md" },
  { id: "基金代码考试材料", fileName: "S14-基金代码考试目标.md" },
] as const;

type Operation = { operation: string; stage?: string; status?: number };

async function readFirstQuestionState(page: Page) {
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
    const tasks = await readAll<{
      id: string;
      currentNodeId: string;
    }>("tasks");
    const materials = await readAll<{
      taskId: string;
      nodes: Array<{
        id: string;
        order: number;
        bloomTargets: { memory: string };
      }>;
    }>("materials");
    const sessions = await readAll<{
      taskId: string;
      nodeId: string;
      session: {
        currentStage: string;
        stages: Record<string, { status: string; mainQuestion: string | null }>;
      };
    }>("sessions");
    const messages = await readAll<{
      taskId: string;
      nodeId: string;
      role: string;
      content: string;
      createdAt: string;
    }>("messages");
    const task = tasks[0]!;
    const material = materials.find((entry) => entry.taskId === task.id)!;
    const node = material.nodes.toSorted((left, right) => left.order - right.order)[0]!;
    const session = sessions.find(
      (entry) => entry.taskId === task.id && entry.nodeId === node.id,
    )!.session;
    const memory = session.stages.MEMORY!;
    const firstAssistantMessage = messages
      .filter(
        (message) =>
          message.taskId === task.id &&
          message.nodeId === node.id &&
          message.role === "ASSISTANT",
      )
      .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt))[0]!
      .content;
    database.close();
    return {
      memoryTarget: node.bloomTargets.memory,
      storedStage: session.currentStage,
      memoryStatus: memory.status,
      question: memory.mainQuestion,
      firstAssistantMessage,
    };
  });
}

test("四类材料的首问稳定绑定 MEMORY 目标", async ({ browser }, testInfo) => {
  test.skip(
    process.env.VERITAS_REAL_DEEPSEEK !== "1" || testInfo.project.name !== "desktop-edge",
    "仅在显式启用时执行真实首问回归。",
  );
  test.setTimeout(2_400_000);
  const results: Array<Record<string, unknown>> = [];
  const outputDirectory = path.join(
    process.cwd(),
    "docs",
    "evaluation",
    "first-question-memory",
  );
  const outputPath = path.join(outputDirectory, "real-regression-2026-08-13.json");
  await mkdir(outputDirectory, { recursive: true });

  for (const material of materials) {
    for (let run = 1; run <= 2; run += 1) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
      const page = await context.newPage();
      const operations: Operation[] = [];
      const browserProblems: string[] = [];
      page.on("console", (message) => {
        if (["error", "warning"].includes(message.type())) {
          browserProblems.push(`${message.type()}: ${message.text()}`);
        }
      });
      page.on("pageerror", (error) =>
        browserProblems.push(`pageerror: ${error.message}`),
      );
      page.on("request", (request) => {
        if (!request.url().endsWith("/api/agents")) return;
        const body = request.postDataJSON() as {
          operation?: string;
          input?: { stage?: string };
        } | null;
        if (body?.operation) {
          operations.push({ operation: body.operation, stage: body.input?.stage });
        }
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

      try {
        await page.goto("/");
        await page
          .locator("#workspace-upload")
          .setInputFiles(
            path.join(
              process.cwd(),
              "docs",
              "evaluation",
              "a0691c1",
              "materials",
              material.fileName,
            ),
          );
        const assistant = page.locator(
          ".message-bubble-assistant:not(:has(.turn-pending))",
        );
        const failed = page.getByText("这份材料暂时没能准备好");
        await Promise.race([
          assistant.first().waitFor({ state: "visible", timeout: 240_000 }),
          failed.waitFor({ state: "visible", timeout: 240_000 }),
        ]);
        if (await failed.isVisible()) {
          throw new Error(await failed.locator("..").locator("p").innerText());
        }

        const state = await readFirstQuestionState(page);
        const firstQuestionOperation = operations.find(
          (entry) => entry.operation === "CREATE_FIRST_QUESTION",
        );
        expect(firstQuestionOperation?.stage).toBe("MEMORY");
        expect(operations.every((entry) => entry.status === 200)).toBe(true);
        expect(state.storedStage).toBe("MEMORY");
        expect(state.memoryStatus).toBe("ACTIVE");
        expect(state.question).toBeTruthy();
        expect(state.firstAssistantMessage).toContain(state.question!);
        expect(browserProblems).toEqual([]);
        results.push({
          material: material.id,
          run,
          memoryTarget: state.memoryTarget,
          question: state.question,
          storedStage: state.storedStage,
          memoryStatus: state.memoryStatus,
          requestStage: firstQuestionOperation?.stage,
          operations,
          browserProblems,
        });
        await writeFile(
          outputPath,
          `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`,
          "utf8",
        );
      } finally {
        await context.close();
      }
    }
  }
});
