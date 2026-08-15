import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("docs/evaluation/version-comparison-120");
const versions = ["pre", "post"];
const rounds = [1, 2, 3];
const expectedHeads = {
  pre: "f48d2b00e53954035bce27297a426a1ea20957f0",
  post: "7bc997f04f19eb5c9b9a22d308abfb999bb96d1d",
};
const harnessSha256 = "B808FC4B28688EE95836984C77F8FB8A099AC943187083F14CB41F95B86C2A13";
const manual = JSON.parse(
  await readFile(path.join(root, "manual-assessment.json"), "utf8"),
);

async function listFiles(directory, suffix) {
  return (await readdir(directory)).filter((name) => name.endsWith(suffix)).sort();
}

async function loadSessions() {
  const sessions = [];
  for (const version of versions) {
    for (const round of rounds) {
      const directory = path.join(root, version, `round-${round}`, "raw");
      for (const name of await listFiles(directory, ".json")) {
        const evidence = JSON.parse(await readFile(path.join(directory, name), "utf8"));
        sessions.push({ version, round, evidence });
      }
    }
  }
  return sessions;
}

function operation(traffic) {
  return traffic?.requestBody?.operation ?? null;
}

function result(traffic) {
  return traffic?.responseBody?.result ?? null;
}

function trafficForStep(evidence, step) {
  const [start, end] = step.trafficRange ?? [0, 0];
  return evidence.agentTraffic.slice(start, end);
}

function activeSession(snapshot) {
  const stored = snapshot?.stored;
  const sessions = stored?.sessions ?? [];
  const currentNodeId = stored?.task?.currentNodeId;
  return (
    sessions.find((item) => item.nodeId === currentNodeId)?.session ??
    sessions[0]?.session ??
    null
  );
}

function stageSnapshot(snapshot) {
  const session = activeSession(snapshot);
  if (!session) return null;
  const current = session.stages?.[session.currentStage];
  return {
    currentStage: session.currentStage,
    sessionStatus: session.status,
    stageStatus: current?.status ?? null,
    mainQuestion: current?.mainQuestion ?? null,
    stalledCount: current?.stalledCount ?? null,
    hintLevel: current?.hintLevel ?? null,
    score: snapshot?.visible?.score ?? null,
    hintVisible: snapshot?.visible?.hintVisible ?? null,
    answerVisible: snapshot?.visible?.answerVisible ?? null,
    stages: Object.fromEntries(
      Object.entries(session.stages ?? {}).map(([key, value]) => [
        key,
        {
          status: value.status,
          stalledCount: value.stalledCount,
          hintLevel: value.hintLevel,
        },
      ]),
    ),
  };
}

function sameDiagnosticState(before, after) {
  if (!before || !after) return false;
  return (
    before.currentStage === after.currentStage &&
    before.sessionStatus === after.sessionStatus &&
    before.score === after.score &&
    JSON.stringify(before.stages) === JSON.stringify(after.stages)
  );
}

function targetSendSteps(evidence) {
  return evidence.steps.filter(
    (step) => step.phase === "目标交互" && step.action?.kind === "SEND",
  );
}

function latestResponse(evidence, step) {
  return trafficForStep(evidence, step)
    .filter((item) => operation(item) === "RESPOND_TO_USER")
    .map(result)
    .filter(Boolean)
    .at(-1);
}

function firstQuestionRows(sessions) {
  return sessions.flatMap(({ version, round, evidence }) =>
    evidence.agentTraffic
      .filter(
        (item) =>
          operation(item) === "CREATE_FIRST_QUESTION" && item.responseStatus === 200,
      )
      .map((item, index) => ({
        version,
        round,
        caseId: evidence.id,
        occurrence: index + 1,
        memoryTarget: item.requestBody?.input?.node?.bloomTargets?.memory ?? "",
        question: result(item)?.question ?? "",
      }))
      .filter((item) => item.question),
  );
}

function s10Rows(sessions) {
  return sessions
    .filter(({ evidence }) => evidence.id === "S10")
    .map(({ version, round, evidence }) => {
      const steps = targetSendSteps(evidence);
      const first = steps[0];
      const second = steps[1];
      const firstBefore = stageSnapshot(first?.before);
      const firstAfter = stageSnapshot(first?.after);
      const secondBefore = stageSnapshot(second?.before);
      const secondAfter = stageSnapshot(second?.after);
      const firstResult = first ? latestResponse(evidence, first) : null;
      const secondResult = second ? latestResponse(evidence, second) : null;
      return {
        version,
        round,
        error: evidence.error ?? null,
        firstClassification: firstResult?.classification ?? null,
        firstProgress: firstResult?.progress ?? null,
        firstHeldQuestion:
          Boolean(firstBefore && firstAfter) &&
          firstBefore.currentStage === firstAfter.currentStage &&
          firstAfter.score === firstBefore.score,
        secondClassification: secondResult?.classification ?? null,
        secondProgress: secondResult?.progress ?? null,
        secondAdvanced:
          Boolean(secondBefore && secondAfter) &&
          secondBefore.currentStage !== secondAfter.currentStage,
        advancingFeedback: secondResult?.assistantMessage ?? null,
        advancingFeedbackHasQuestion: /[?？]/u.test(secondResult?.assistantMessage ?? ""),
      };
    });
}

function s12Rows(sessions) {
  return sessions
    .filter(({ evidence }) => evidence.id === "S12")
    .map(({ version, round, evidence }) => {
      const steps = targetSendSteps(evidence);
      const turns = steps.map((step) => {
        const response = latestResponse(evidence, step);
        return {
          input: step.action.content,
          mode: response?.responseMode ?? null,
          classification: response?.classification ?? null,
          progress: response?.progress ?? null,
          before: stageSnapshot(step.before),
          after: stageSnapshot(step.after),
          assistantMessage: response?.assistantMessage ?? null,
        };
      });
      const third = turns[2];
      return {
        version,
        round,
        error: evidence.error ?? null,
        turns,
        fullyCorrect:
          turns.length === 3 &&
          turns.every(
            (turn) => turn.classification === "NO_ANSWER" && turn.progress === "STALLED",
          ) &&
          turns[0].after?.stalledCount === 1 &&
          turns[1].after?.stalledCount === 2 &&
          third.after?.stages?.MEMORY?.status === "PASSED_WITH_ANSWER" &&
          third.after?.currentStage === "UNDERSTANDING",
      };
    });
}

function advancementRows(sessions) {
  const rows = [];
  for (const { version, round, evidence } of sessions) {
    for (const [turnIndex, step] of targetSendSteps(evidence).entries()) {
      const response = latestResponse(evidence, step);
      if (response?.classification !== "CORRECT" || response?.progress !== "ADVANCING")
        continue;
      rows.push({
        version,
        round,
        caseId: evidence.id,
        turn: turnIndex + 1,
        mainQuestion: stageSnapshot(step.before)?.mainQuestion ?? "",
        input: step.action.content,
        assistantMessage: response.assistantMessage ?? "",
        feedbackHasQuestion: /[?？]/u.test(response.assistantMessage ?? ""),
      });
    }
  }
  return rows;
}

function conversationStateRows(sessions) {
  const opportunities = {
    S04: [0],
    S05: [0],
    S06: [0],
    S15: [0],
    S18: [0],
    S19: [0],
    S20: [0],
  };
  return sessions.flatMap(({ version, round, evidence }) => {
    const wanted = opportunities[evidence.id];
    if (!wanted) return [];
    const steps = targetSendSteps(evidence);
    return wanted.flatMap((index) => {
      const step = steps[index];
      if (!step?.before || !step?.after) return [];
      const response = step ? latestResponse(evidence, step) : null;
      const before = stageSnapshot(step?.before);
      const after = stageSnapshot(step?.after);
      return [
        {
          version,
          round,
          caseId: evidence.id,
          input: step?.action?.content ?? null,
          responseMode: response?.responseMode ?? null,
          unchanged: sameDiagnosticState(before, after),
          buttonsPreserved: after?.hintVisible === true && after?.answerVisible === true,
          before,
          after,
        },
      ];
    });
  });
}

function targetOutcomeRows(sessions) {
  return sessions.map(({ version, round, evidence }) => {
    const targetSteps = evidence.steps.filter((step) => step.phase === "目标交互");
    const finalTarget = targetSteps.at(-1);
    const targetState = stageSnapshot(finalTarget?.after);
    const responses = targetSendSteps(evidence).map((step) => {
      const response = latestResponse(evidence, step);
      return {
        input: step.action.content,
        mode: response?.responseMode ?? null,
        classification: response?.classification ?? null,
        progress: response?.progress ?? null,
        assistantMessage: response?.assistantMessage ?? null,
        before: stageSnapshot(step.before),
        after: stageSnapshot(step.after),
      };
    });
    return {
      version,
      round,
      caseId: evidence.id,
      title: evidence.title,
      expected: evidence.expected,
      error: evidence.error ?? null,
      uiRetries: evidence.uiRetries.length,
      targetState,
      responses,
    };
  });
}

async function reportEnumRows() {
  const rows = [];
  for (const version of versions) {
    for (const round of rounds) {
      const directory = path.join(root, version, `round-${round}`, "reports");
      for (const name of await listFiles(directory, ".md")) {
        const markdown = await readFile(path.join(directory, name), "utf8");
        rows.push({
          version,
          round,
          caseId: path.basename(name, ".md"),
          leaksInternalEnum: /PASSED(?:_WITH_HINT|_WITH_ANSWER)?/u.test(markdown),
        });
      }
    }
  }
  return rows;
}

function auditRows(sessions) {
  return versions.flatMap((version) =>
    rounds.map((round) => {
      const batch = sessions.filter(
        (item) => item.version === version && item.round === round,
      );
      const traffic = batch.flatMap(({ evidence }) => evidence.agentTraffic);
      return {
        version,
        round,
        rawSessions: batch.length,
        completedSessions: batch.filter(
          ({ evidence }) => !evidence.error && evidence.reportText,
        ).length,
        failedSessions: batch
          .filter(({ evidence }) => evidence.error)
          .map(({ evidence }) => evidence.id),
        uiRetries: batch.flatMap(({ evidence }) => evidence.uiRetries).length,
        agentRequests: traffic.length,
        non200Requests: traffic.filter((item) => item.responseStatus !== 200).length,
        browserProblems: batch.flatMap(({ evidence }) => evidence.browserProblems).length,
        metadataMismatches: batch.filter(
          ({ evidence }) =>
            evidence.metadata.version !== version ||
            evidence.metadata.round !== `round-${round}` ||
            evidence.metadata.head !== expectedHeads[version] ||
            evidence.metadata.harnessSha256 !== harnessSha256 ||
            evidence.metadata.futureInputsVisibleToModel !== false,
        ).length,
      };
    }),
  );
}

function gradeSummary(version) {
  const byCase = Object.entries(manual.grades).map(([caseId, grade]) => ({
    caseId,
    rounds: grade[version],
  }));
  const all = byCase.flatMap((item) => item.rounds);
  const counts = Object.fromEntries(
    ["PASS", "PARTIAL", "FAIL"].map((status) => [
      status,
      all.filter((item) => item.status === status).length,
    ]),
  );
  const stability = {
    threePass: byCase.filter((item) =>
      item.rounds.every((round) => round.status === "PASS"),
    ).length,
    threePartial: byCase.filter((item) =>
      item.rounds.every((round) => round.status === "PARTIAL"),
    ).length,
    threeFail: byCase.filter((item) =>
      item.rounds.every((round) => round.status === "FAIL"),
    ).length,
    inconsistent: byCase.filter(
      (item) => new Set(item.rounds.map((round) => round.status)).size > 1,
    ).length,
  };
  return {
    counts,
    averagePerRound: Object.fromEntries(
      Object.entries(counts).map(([status, count]) => [
        status,
        Number((count / 3).toFixed(2)),
      ]),
    ),
    passRate: Number(((counts.PASS / all.length) * 100).toFixed(1)),
    nonFailRate: Number((((counts.PASS + counts.PARTIAL) / all.length) * 100).toFixed(1)),
    averageScore: Number(
      (all.reduce((sum, item) => sum + item.score, 0) / all.length).toFixed(2),
    ),
    stability,
    byCase,
  };
}

function firstQuestionSummary(firstQuestions, version) {
  const rows = firstQuestions.filter((item) => item.version === version);
  const matched = rows.filter((row) => {
    const setting = manual.firstQuestionMatches[version];
    if (setting === "ALL") return true;
    return setting[`round-${row.round}`].includes(`${row.caseId}#${row.occurrence}`);
  });
  return {
    matched: matched.length,
    opportunities: rows.length,
    rate: Number(((matched.length / rows.length) * 100).toFixed(1)),
  };
}

function operationalSummary(sessions, version) {
  const rows = sessions.filter((item) => item.version === version);
  const traffic = rows.flatMap(({ evidence }) => evidence.agentTraffic);
  const anomalySessions = rows.filter(
    ({ evidence }) =>
      evidence.error ||
      evidence.uiRetries.length > 0 ||
      evidence.browserProblems.length > 0,
  );
  return {
    sessions: rows.length,
    completed: rows.filter(({ evidence }) => !evidence.error && evidence.reportText)
      .length,
    failed: rows.filter(({ evidence }) => evidence.error).length,
    uiRetryEvents: rows.flatMap(({ evidence }) => evidence.uiRetries).length,
    uiRetrySessions: rows.filter(({ evidence }) => evidence.uiRetries.length > 0).length,
    agentRequests: traffic.length,
    non200Requests: traffic.filter((item) => item.responseStatus !== 200).length,
    browserProblemEntries: rows.flatMap(({ evidence }) => evidence.browserProblems)
      .length,
    anomalySessions: anomalySessions.length,
    anomalySessionRate: Number(((anomalySessions.length / rows.length) * 100).toFixed(1)),
  };
}

function productMetricSummary({
  sessions,
  firstQuestions,
  s10,
  s12,
  advancements,
  conversations,
  reportEnums,
}) {
  return Object.fromEntries(
    versions.map((version) => {
      const versionAdvancements = advancements.filter((item) => item.version === version);
      const incorrectAdvances = manual.incorrectAdvances.filter(
        (item) => item.version === version,
      );
      const versionS10 = s10.filter((item) => item.version === version && !item.error);
      const versionS12 = s12.filter((item) => item.version === version && !item.error);
      const versionConversations = conversations.filter(
        (item) => item.version === version,
      );
      const versionReports = reportEnums.filter((item) => item.version === version);
      return [
        version,
        {
          firstQuestion: firstQuestionSummary(firstQuestions, version),
          incompleteAnswerHeld: {
            passed: versionS10.filter(
              (item) =>
                item.firstHeldQuestion &&
                item.firstClassification !== "CORRECT" &&
                item.firstProgress !== "ADVANCING",
            ).length,
            opportunities: versionS10.length,
          },
          completeFollowupAdvanced: {
            passed: versionS10.filter(
              (item) => item.secondClassification === "CORRECT" && item.secondAdvanced,
            ).length,
            opportunities: versionS10.length,
          },
          incorrectAdvance: {
            count: incorrectAdvances.length,
            opportunities: versionAdvancements.length,
            rate: Number(
              ((incorrectAdvances.length / versionAdvancements.length) * 100).toFixed(1),
            ),
          },
          doubleQuestion: {
            count: versionAdvancements.filter((item) => item.feedbackHasQuestion).length,
            opportunities: versionAdvancements.length,
            rate: Number(
              (
                (versionAdvancements.filter((item) => item.feedbackHasQuestion).length /
                  versionAdvancements.length) *
                100
              ).toFixed(1),
            ),
          },
          consecutiveNoAnswer: {
            passed: versionS12.filter((item) => item.fullyCorrect).length,
            opportunities: versionS12.length,
          },
          nonAnswerStatePollution: {
            count: versionConversations.filter((item) => !item.unchanged).length,
            opportunities: versionConversations.length,
            rate: Number(
              (
                (versionConversations.filter((item) => !item.unchanged).length /
                  versionConversations.length) *
                100
              ).toFixed(1),
            ),
          },
          buttonsPreserved: {
            passed: versionConversations.filter((item) => item.buttonsPreserved).length,
            opportunities: versionConversations.length,
          },
          reportEnumLeak: {
            count: versionReports.filter((item) => item.leaksInternalEnum).length,
            opportunities: versionReports.length,
          },
          operations: operationalSummary(sessions, version),
          grades: gradeSummary(version),
        },
      ];
    }),
  );
}

function reviewPacket({ firstQuestions, s10, s12, advancements, conversations }) {
  const lines = [
    "# 120 Session 人工复核数据包",
    "",
    "> 本文件由原始证据确定性提取，不包含自动语义判分。",
    "",
    "## 首问与记忆目标",
    "",
    "| 版本 | 轮次 | Case | 次序 | 记忆目标 | 实际首问 |",
    "|---|---:|---|---:|---|---|",
    ...firstQuestions.map(
      (row) =>
        `| ${row.version} | ${row.round} | ${row.caseId} | ${row.occurrence} | ${row.memoryTarget.replaceAll("|", "\\|")} | ${row.question.replaceAll("|", "\\|")} |`,
    ),
    "",
    "## S10 不完整回答与唯一主问题",
    "",
    "```json",
    JSON.stringify(s10, null, 2),
    "```",
    "",
    "## S12 连续不会",
    "",
    "```json",
    JSON.stringify(s12, null, 2),
    "```",
    "",
    "## 正确推进反馈中的疑似第二问题",
    "",
    "| 版本 | 轮次 | Case | 疑似提问 | 反馈 |",
    "|---|---:|---|---|---|",
    ...advancements.map(
      (row) =>
        `| ${row.version} | ${row.round} | ${row.caseId} | ${row.feedbackHasQuestion ? "是" : "否"} | ${row.assistantMessage.replaceAll("\n", "<br>").replaceAll("|", "\\|")} |`,
    ),
    "",
    "## 非回答消息状态保持",
    "",
    "| 版本 | 轮次 | Case | 模式 | 状态不变 | 按钮保留 | 用户输入 |",
    "|---|---:|---|---|---|---|---|",
    ...conversations.map(
      (row) =>
        `| ${row.version} | ${row.round} | ${row.caseId} | ${row.responseMode ?? "无"} | ${row.unchanged ? "是" : "否"} | ${row.buttonsPreserved ? "是" : "否"} | ${(row.input ?? "").replaceAll("|", "\\|")} |`,
    ),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function caseResultsMarkdown(productMetrics) {
  const preCases = productMetrics.pre.grades.byCase;
  const postCases = productMetrics.post.grades.byCase;
  const label = (round) => `${round.status}(${round.score})`;
  const stability = (rounds) => {
    const unique = new Set(rounds.map((round) => round.status));
    return unique.size === 1 ? `3/3 ${rounds[0].status}` : "三轮不一致";
  };
  const lines = [
    "# 120 Session 逐 Case 评级",
    "",
    "> 括号内为 1—5 产品质量分，不是页面中的学习得分。逐轮理由见 `manual-assessment.json`。",
    "",
    "| Case | 旧版 R1 | 旧版 R2 | 旧版 R3 | 旧版稳定性 | 新版 R1 | 新版 R2 | 新版 R3 | 新版稳定性 |",
    "|---|---|---|---|---|---|---|---|---|",
  ];
  for (const preCase of preCases) {
    const postCase = postCases.find((item) => item.caseId === preCase.caseId);
    lines.push(
      `| ${preCase.caseId} | ${preCase.rounds.map(label).join(" | ")} | ${stability(preCase.rounds)} | ${postCase.rounds.map(label).join(" | ")} | ${stability(postCase.rounds)} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

const sessions = await loadSessions();
const firstQuestions = firstQuestionRows(sessions);
const s10 = s10Rows(sessions);
const s12 = s12Rows(sessions);
const advancements = advancementRows(sessions);
const conversations = conversationStateRows(sessions);
const targetOutcomes = targetOutcomeRows(sessions);
const reportEnums = await reportEnumRows();
const productMetrics = productMetricSummary({
  sessions,
  firstQuestions,
  s10,
  s12,
  advancements,
  conversations,
  reportEnums,
});
const computed = {
  generatedFrom: "120 个原始 Session JSON 与 118 份报告 Markdown",
  audit: auditRows(sessions),
  totals: {
    sessions: sessions.length,
    completed: sessions.filter(({ evidence }) => !evidence.error && evidence.reportText)
      .length,
    failed: sessions.filter(({ evidence }) => evidence.error).length,
    firstQuestionOpportunities: firstQuestions.length,
    advancementOpportunities: advancements.length,
    advancementFeedbackQuestionCandidates: advancements.filter(
      (row) => row.feedbackHasQuestion,
    ).length,
    conversationStateOpportunities: conversations.length,
    conversationStatePollution: conversations.filter((row) => !row.unchanged).length,
    conversationButtonsMissing: conversations.filter((row) => !row.buttonsPreserved)
      .length,
    reportMarkdowns: reportEnums.length,
    reportEnumLeaks: reportEnums.filter((row) => row.leaksInternalEnum).length,
  },
  firstQuestions,
  s10,
  s12,
  advancements,
  conversations,
  targetOutcomes,
  reportEnums,
  productMetrics,
};

await writeFile(
  path.join(root, "computed-evidence.json"),
  `${JSON.stringify(computed, null, 2)}\n`,
);
await writeFile(
  path.join(root, "metrics.json"),
  `${JSON.stringify(productMetrics, null, 2)}\n`,
);
await writeFile(
  path.join(root, "review-packet.md"),
  reviewPacket({ firstQuestions, s10, s12, advancements, conversations }),
);
await writeFile(path.join(root, "case-results.md"), caseResultsMarkdown(productMetrics));

console.log(JSON.stringify(computed.totals, null, 2));
