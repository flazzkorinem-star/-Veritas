import { describe, expect, it, vi } from "vitest";

import { createNodeSession, diagnosticReducer } from "@/domain/diagnostic/reducer";

import {
  createFirstQuestion,
  requestHint,
  respondToUser,
  revealStageAnswer,
} from "./diagnostic-turn";

const source = { label: "第 1 段", excerpt: "太阳能驱动蒸发。" };
const knowledgeItems = [
  {
    id: "item-1",
    moduleId: "module-1",
    title: "循环动力",
    summary: "太阳能驱动蒸发。",
    kind: "CORE" as const,
    diagnosticRationale: "基础机制",
    sourceReferences: [source],
    commonMisconceptions: [],
  },
];
const node = {
  id: "node-1",
  moduleId: "module-1",
  title: "循环动力",
  objective: "解释循环动力。",
  knowledgeItemIds: ["item-1"],
  sourceReferences: [source],
  canonicalUnderstanding: "太阳能驱动蒸发。",
  commonMisconceptions: [],
  bloomTargets: {
    memory: "说出动力。",
    understanding: "解释作用。",
    application: "判断环节。",
    analysis: "分析关系。",
  },
  order: 1,
};
const materialContext = {
  title: "水循环",
  modules: [{ id: "module-1", title: "自然水循环", sourceRange: "第 1 节" }],
  knowledgeItems,
  nodes: [node],
};

function turnContext(session = activeSession()) {
  return {
    node,
    knowledgeItems,
    materialContext,
    learningGoal: null,
    session,
    recentMessages: [],
  };
}

function activeSession() {
  return diagnosticReducer(createNodeSession(node.id), {
    type: "START_STAGE",
    question: "主要动力是什么？",
  });
}

const partial = {
  responseMode: "EVALUATE_DIAGNOSTIC" as const,
  learningGoalUpdate: null,
  classification: "PARTIAL" as const,
  isCorrect: false,
  progress: "ADVANCING" as const,
  correctEvidence: ["提到能量"],
  missingPoints: ["没有说出来源"],
  misconceptions: [],
  teachingMove: "ASK_MISSING_POINT" as const,
  scaffold: null,
  assistantMessage: "你已经提到能量了，它具体来自哪里？",
};

describe("诊断回合编排", () => {
  it("未初始化主题的首问请求显式进入 MEMORY", async () => {
    const agent = vi.fn().mockResolvedValue({
      opening: "这个主题值得先掌握循环动力。",
      question: "水循环的主要动力是什么？",
    });

    await createFirstQuestion(turnContext(), agent);

    expect(agent.mock.calls[0]![0].input).toMatchObject({
      stage: "MEMORY",
      node: { bloomTargets: { memory: "说出动力。" } },
    });
  });

  it("普通对话保持四层状态原样", async () => {
    const session = activeSession();
    const agent = vi.fn().mockResolvedValue({
      responseMode: "CONVERSATION",
      learningGoalUpdate: null,
      assistantMessage: "蒸发是液态水获得能量后变成水蒸气的过程。",
    });

    const result = await respondToUser(
      {
        ...turnContext(session),
        userMessage: "先别考我，解释一下蒸发。",
      },
      agent,
    );

    expect(result.session).toEqual(session);
    expect(result.assistantMessages).toEqual([
      "蒸发是液态水获得能量后变成水蒸气的过程。",
    ]);
    const request = agent.mock.calls[0]![0];
    expect(request.input.materialContext).toEqual({
      title: "水循环",
      modules: [{ id: "module-1", title: "自然水循环" }],
      itemIndex: [{ id: "item-1", title: "循环动力", kind: "CORE" }],
    });
    expect(request.input.materialContext).not.toHaveProperty("nodes");
    expect(request.input.materialContext).not.toHaveProperty("knowledgeItems");
    expect(request.input.diagnostic).toEqual({
      status: "ACTIVE",
      stage: "MEMORY",
      mainQuestion: "主要动力是什么？",
      currentQuestion: "主要动力是什么？",
      verificationQuestion: null,
      hintLevel: 0,
      hasRequestedHint: false,
      stalledCount: 0,
      answerOrigin: "NONE",
      stageStatuses: {
        MEMORY: "ACTIVE",
        UNDERSTANDING: "LOCKED",
        APPLICATION: "LOCKED",
        ANALYSIS: "LOCKED",
      },
    });
  });

  it("用户要求检验时才启动记忆层主问题", async () => {
    const agent = vi.fn().mockResolvedValue({
      responseMode: "START_DIAGNOSTIC",
      learningGoalUpdate: "检验自己是否理解水循环",
      assistantMessage: "可以，先看最基础的动力。",
      question: "自然水循环的主要动力是什么？",
    });

    const result = await respondToUser(
      {
        ...turnContext(createNodeSession(node.id)),
        userMessage: "出题考考我。",
      },
      agent,
    );

    expect(result.session.stages.MEMORY).toMatchObject({
      status: "ACTIVE",
      mainQuestion: "自然水循环的主要动力是什么？",
    });
    expect(result.learningGoalUpdate).toBe("检验自己是否理解水循环");
  });

  it("未通过时保留同一个主问题，只返回围绕它的反馈", async () => {
    const agent = vi.fn().mockResolvedValue(partial);

    const result = await respondToUser(
      {
        ...turnContext(),
        userMessage: "需要能量。",
      },
      agent,
    );

    expect(result.session.stages.MEMORY.mainQuestion).toBe("主要动力是什么？");
    expect(result.session.currentStage).toBe("MEMORY");
    expect(result.assistantMessages).toEqual([partial.assistantMessage]);
    expect(agent).toHaveBeenCalledTimes(1);
  });

  it("偏题时保留当前问题且不生成下一层问题", async () => {
    const agent = vi.fn().mockResolvedValue({
      ...partial,
      classification: "OFF_TOPIC",
      progress: "STALLED",
      correctEvidence: [],
      missingPoints: ["没有回答当前问题要求的动力来源"],
      teachingMove: "BRIDGE_BACK",
      assistantMessage: "这个例子和水循环有关，我们先回到原题：主要动力来自哪里？",
    });

    const result = await respondToUser(
      {
        ...turnContext(),
        userMessage: "河流最后会流进海洋。",
      },
      agent,
    );

    expect(result.session).toEqual(activeSession());
    expect(result.assistantMessages).toEqual([
      "这个例子和水循环有关，我们先回到原题：主要动力来自哪里？",
    ]);
    expect(agent.mock.calls.map(([request]) => request.operation)).toEqual([
      "RESPOND_TO_USER",
    ]);
  });

  it("答对后由代码进入下一层，再生成该层唯一主问题", async () => {
    const agent = vi
      .fn()
      .mockResolvedValueOnce({
        ...partial,
        classification: "CORRECT",
        isCorrect: true,
        progress: "ADVANCING",
        correctEvidence: ["说出太阳能是主要动力"],
        missingPoints: [],
        teachingMove: "AFFIRM_AND_ADVANCE",
        assistantMessage: "对，太阳能是关键动力。",
      })
      .mockResolvedValueOnce({ question: "太阳能怎样推动蒸发？" });

    const result = await respondToUser(
      {
        ...turnContext(),
        userMessage: "太阳能。",
      },
      agent,
    );

    expect(result.session.stages.MEMORY.status).toBe("PASSED");
    expect(result.session.currentStage).toBe("UNDERSTANDING");
    expect(result.session.stages.UNDERSTANDING.mainQuestion).toBe("太阳能怎样推动蒸发？");
    expect(result.assistantMessages).toEqual([
      "对，太阳能是关键动力。",
      "太阳能怎样推动蒸发？",
    ]);
    expect(result.assistantMessages[1]).toBe(
      result.session.stages.UNDERSTANDING.mainQuestion,
    );
    expect(agent.mock.calls.map(([request]) => request.operation)).toEqual([
      "RESPOND_TO_USER",
      "CREATE_STAGE_QUESTION",
    ]);
  });

  it("第三次连续停滞时自动给完整答案并建立同层小验证题", async () => {
    let session = activeSession();
    const stalled = {
      ...partial,
      classification: "NO_ANSWER" as const,
      progress: "STALLED" as const,
      assistantMessage: "我们还没有增加新的线索。",
    };
    session = diagnosticReducer(session, {
      type: "ANSWER_EVALUATED",
      outcome: stalled,
    });
    session = diagnosticReducer(session, {
      type: "ANSWER_EVALUATED",
      outcome: stalled,
    });
    const agent = vi
      .fn()
      .mockResolvedValueOnce(stalled)
      .mockResolvedValueOnce({ assistantMessage: "完整答案是太阳能驱动蒸发。" })
      .mockResolvedValueOnce({ question: "水循环需要的能量主要来自哪里？" });

    const result = await respondToUser(
      { ...turnContext(session), userMessage: "不知道。" },
      agent,
    );

    expect(result.session.stages.MEMORY).toMatchObject({
      status: "ACTIVE",
      mainQuestion: "主要动力是什么？",
      verificationQuestion: "水循环需要的能量主要来自哪里？",
      answerOrigin: "AUTOMATIC",
      stalledCount: 0,
    });
    expect(result.session.currentStage).toBe("MEMORY");
    expect(result.assistantMessages).toHaveLength(3);
    expect(result.assistantMessages.at(-1)).toBe("水循环需要的能量主要来自哪里？");
    expect(agent.mock.calls.map(([request]) => request.operation)).toEqual([
      "RESPOND_TO_USER",
      "CREATE_STAGE_ANSWER",
      "CREATE_STAGE_VERIFICATION",
    ]);
  });

  it("答对自动答案后的小验证题才以答案通过并进入下一层", async () => {
    let session = activeSession();
    const stalledOutcome = {
      classification: "NO_ANSWER" as const,
      isCorrect: false,
      progress: "STALLED" as const,
    };
    for (let count = 0; count < 3; count += 1) {
      session = diagnosticReducer(session, {
        type: "ANSWER_EVALUATED",
        outcome: stalledOutcome,
      });
    }
    session = diagnosticReducer(session, {
      type: "START_ANSWER_VERIFICATION",
      question: "水循环需要的能量主要来自哪里？",
    });
    const agent = vi
      .fn()
      .mockResolvedValueOnce({
        ...partial,
        classification: "CORRECT",
        isCorrect: true,
        progress: "ADVANCING",
        correctEvidence: ["说出太阳能"],
        missingPoints: [],
        teachingMove: "AFFIRM_AND_ADVANCE",
        assistantMessage: "对，主要来自太阳能。",
      })
      .mockResolvedValueOnce({ question: "太阳能怎样推动蒸发？" });

    const result = await respondToUser(
      { ...turnContext(session), userMessage: "主要来自太阳能。" },
      agent,
    );

    expect(result.session.stages.MEMORY).toMatchObject({
      status: "PASSED_WITH_ANSWER",
      answerOrigin: "AUTOMATIC",
    });
    expect(result.session.stages.UNDERSTANDING.status).toBe("ACTIVE");
    expect(result.assistantMessages).toEqual([
      "对，主要来自太阳能。",
      "太阳能怎样推动蒸发？",
    ]);
    expect(agent.mock.calls[0]![0].input.diagnostic).toMatchObject({
      mainQuestion: "主要动力是什么？",
      currentQuestion: "水循环需要的能量主要来自哪里？",
      verificationQuestion: "水循环需要的能量主要来自哪里？",
      answerOrigin: "AUTOMATIC",
    });
  });

  it.each([
    "我真的不知道该怎么回答这个问题。",
    "这题我不会，暂时答不出来。",
    "我脑子里一片空白，完全没有思路。",
    "想了半天还是不知道从哪里开始。",
    "这个我确实答不上来。",
    "我没法给出答案，能先帮我理一理吗？",
  ])("无法作答表达会把 STALLED 事件交给 reducer：%s", async (userMessage) => {
    const agent = vi.fn().mockResolvedValue({
      ...partial,
      classification: "NO_ANSWER",
      progress: "STALLED",
      correctEvidence: [],
      missingPoints: ["没有提供可评价的回答内容"],
      teachingMove: "PROVIDE_SCAFFOLD",
      scaffold: { type: "EXAMPLE", reason: "帮助用户开始思考" },
      assistantMessage: "先从一个具体场景开始拆解。",
    });

    const result = await respondToUser({ ...turnContext(), userMessage }, agent);

    expect(result.session.stages.MEMORY).toMatchObject({
      status: "ACTIVE",
      mainQuestion: "主要动力是什么？",
      stalledCount: 1,
    });
    expect(result.scaffold).toMatchObject({ stage: "MEMORY", type: "EXAMPLE" });
  });

  it("提示只因点击升级，并把升级后的级别交给模型", async () => {
    const agent = vi.fn().mockResolvedValue({
      hintLevel: 1,
      assistantMessage: "先想能量来源。",
    });

    const result = await requestHint(turnContext(), agent);

    expect(result.session.stages.MEMORY).toMatchObject({
      hintLevel: 1,
      hasRequestedHint: true,
    });
    expect(agent).toHaveBeenCalledWith(
      expect.objectContaining({ input: expect.objectContaining({ hintLevel: 1 }) }),
      expect.anything(),
    );
  });

  it("文字请求提示时复用与按钮相同的提示流程", async () => {
    const agent = vi
      .fn()
      .mockResolvedValueOnce({ responseMode: "REQUEST_HINT" })
      .mockResolvedValueOnce({
        hintLevel: 1,
        assistantMessage: "先想能量从哪里来。",
      });

    const result = await respondToUser(
      { ...turnContext(), userMessage: "给我一点提示，但先别说答案。" },
      agent,
    );

    expect(result.session.stages.MEMORY).toMatchObject({
      hintLevel: 1,
      hasRequestedHint: true,
    });
    expect(result.assistantMessages).toEqual(["先想能量从哪里来。"]);
    expect(agent.mock.calls.map(([request]) => request.operation)).toEqual([
      "RESPOND_TO_USER",
      "CREATE_HINT",
    ]);
  });

  it("主动查看答案立即记为答案通过，并生成下一层问题", async () => {
    const agent = vi
      .fn()
      .mockResolvedValueOnce({ assistantMessage: "完整答案是太阳能。" })
      .mockResolvedValueOnce({ question: "它如何产生作用？" });

    const result = await revealStageAnswer(turnContext(), agent);

    expect(result.session.stages.MEMORY.status).toBe("PASSED_WITH_ANSWER");
    expect(result.session.stages.UNDERSTANDING.status).toBe("ACTIVE");
    expect(result.assistantMessages).toEqual(["完整答案是太阳能。", "它如何产生作用？"]);
  });

  it("文字请求答案时复用与按钮相同的答案流程", async () => {
    const agent = vi
      .fn()
      .mockResolvedValueOnce({ responseMode: "REVEAL_ANSWER" })
      .mockResolvedValueOnce({ assistantMessage: "完整答案是太阳能。" })
      .mockResolvedValueOnce({ question: "它如何产生作用？" });

    const result = await respondToUser(
      { ...turnContext(), userMessage: "这题我不会，直接告诉我答案。" },
      agent,
    );

    expect(result.session.stages.MEMORY.status).toBe("PASSED_WITH_ANSWER");
    expect(result.session.stages.UNDERSTANDING.status).toBe("ACTIVE");
    expect(result.assistantMessages).toEqual(["完整答案是太阳能。", "它如何产生作用？"]);
    expect(agent.mock.calls.map(([request]) => request.operation)).toEqual([
      "RESPOND_TO_USER",
      "CREATE_STAGE_ANSWER",
      "CREATE_STAGE_QUESTION",
    ]);
  });
});
