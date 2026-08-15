import {
  hintResponseSchema,
  stageAnswerSchema,
  stageQuestionSchema,
  userTurnDecisionSchema,
  type ScaffoldType,
} from "@/domain/diagnostic/agent-contracts";
import { firstQuestionSchema } from "@/domain/knowledge-map/contracts";
import {
  pendingNodeOrderSchema,
  type AgentOperationRequest,
} from "@/domain/agents/contracts";
import {
  buildBudgetedMaterialRequest,
  buildBudgetedRecentRequest,
} from "@/domain/agents/context-budget";
import type { NodeSession } from "@/domain/diagnostic/contracts";
import { diagnosticReducer } from "@/domain/diagnostic/reducer";
import type {
  DiagnosticNode,
  KnowledgeItem,
  MaterialModule,
  Message,
  StageKey,
} from "@/domain/types";
import { callAgent } from "@/features/materials/agent-client";

type DiagnosticRequest = Extract<
  AgentOperationRequest,
  {
    operation:
      | "CREATE_FIRST_QUESTION"
      | "CREATE_STAGE_QUESTION"
      | "CREATE_STAGE_VERIFICATION"
      | "RESPOND_TO_USER"
      | "CREATE_HINT"
      | "CREATE_STAGE_ANSWER"
      | "PRIORITIZE_PENDING_NODES";
  }
>;

export type DiagnosticAgentCall = (
  request: DiagnosticRequest,
  dependencies: { signal?: AbortSignal },
) => Promise<unknown>;

interface TurnContext {
  node: DiagnosticNode;
  knowledgeItems: KnowledgeItem[];
  materialContext: {
    title: string;
    modules: MaterialModule[];
    knowledgeItems: KnowledgeItem[];
  };
  learningGoal: string | null;
  session: NodeSession;
  recentMessages: Pick<Message, "role" | "content">[];
  signal?: AbortSignal;
}

export interface ScaffoldRecord {
  stage: StageKey;
  type: ScaffoldType;
  reason: string;
}

export interface DiagnosticTurnResult {
  session: NodeSession;
  assistantMessages: string[];
  scaffold: ScaffoldRecord | null;
  learningGoalUpdate: string | null;
}

const defaultAgentCall: DiagnosticAgentCall = (request, dependencies) =>
  callAgent(request, dependencies);

export async function prioritizePendingNodes(
  input: {
    learningGoal: string;
    pendingNodes: Pick<DiagnosticNode, "id" | "title" | "objective" | "order">[];
    signal?: AbortSignal;
  },
  agent: DiagnosticAgentCall = defaultAgentCall,
) {
  return pendingNodeOrderSchema.parse(
    await agent(
      {
        operation: "PRIORITIZE_PENDING_NODES",
        input: {
          learningGoal: input.learningGoal,
          pendingNodes: input.pendingNodes,
        },
      },
      { signal: input.signal },
    ),
  );
}

export async function createFirstQuestion(
  input: Pick<
    TurnContext,
    "node" | "knowledgeItems" | "materialContext" | "learningGoal" | "signal"
  >,
  agent: DiagnosticAgentCall = defaultAgentCall,
) {
  const request = buildBudgetedMaterialRequest({
    materialTitle: input.materialContext.title,
    modules: input.materialContext.modules,
    knowledgeItems: input.materialContext.knowledgeItems,
    currentKnowledgeItemIds: new Set(input.knowledgeItems.map((item) => item.id)),
    recentMessages: [],
    createRequest: (materialContext) => ({
      operation: "CREATE_FIRST_QUESTION" as const,
      input: {
        stage: "MEMORY" as const,
        node: input.node,
        knowledgeItems: input.knowledgeItems,
        materialContext,
        learningGoal: input.learningGoal,
      },
    }),
  });
  return firstQuestionSchema.parse(await agent(request, { signal: input.signal }));
}

function activeQuestion(session: NodeSession) {
  const stage = session.stages[session.currentStage];
  if (stage.status !== "ACTIVE" || !stage.mainQuestion) {
    throw new Error("当前主题没有可回答的问题。");
  }
  return {
    stage: session.currentStage,
    question: stage.verificationQuestion ?? stage.mainQuestion,
  };
}

function coreInput(context: TurnContext) {
  return {
    node: context.node,
    knowledgeItems: context.knowledgeItems,
    learningGoal: context.learningGoal,
  };
}

async function startNextStage(
  context: TurnContext,
  session: NodeSession,
  agent: DiagnosticAgentCall,
) {
  if (session.status === "COMPLETED") {
    return { session, question: null };
  }
  const output = stageQuestionSchema.parse(
    await agent(
      {
        operation: "CREATE_STAGE_QUESTION",
        input: {
          node: context.node,
          knowledgeItems: context.knowledgeItems,
          learningGoal: context.learningGoal,
          stage: session.currentStage,
        },
      },
      { signal: context.signal },
    ),
  );
  return {
    session: diagnosticReducer(session, {
      type: "START_STAGE",
      question: output.question,
    }),
    question: output.question,
  };
}

export async function respondToUser(
  context: TurnContext & { userMessage: string },
  agent: DiagnosticAgentCall = defaultAgentCall,
): Promise<DiagnosticTurnResult> {
  const currentStage = context.session.stages[context.session.currentStage];
  const diagnosticStatus: "NOT_STARTED" | "ACTIVE" | "COMPLETED" =
    context.session.status === "COMPLETED"
      ? "COMPLETED"
      : currentStage.status === "ACTIVE"
        ? "ACTIVE"
        : "NOT_STARTED";
  const isActive = diagnosticStatus === "ACTIVE";
  const mainQuestion = isActive ? currentStage.mainQuestion : null;
  const request = buildBudgetedMaterialRequest({
    materialTitle: context.materialContext.title,
    modules: context.materialContext.modules,
    knowledgeItems: context.materialContext.knowledgeItems,
    currentKnowledgeItemIds: new Set(context.knowledgeItems.map((item) => item.id)),
    recentMessages: context.recentMessages,
    createRequest: (materialContext, recentMessages) => ({
      operation: "RESPOND_TO_USER" as const,
      input: {
        ...coreInput(context),
        materialContext,
        recentMessages,
        diagnostic: {
          status: diagnosticStatus,
          stage: context.session.currentStage,
          mainQuestion,
          currentQuestion: isActive
            ? (currentStage.verificationQuestion ?? mainQuestion)
            : null,
          verificationQuestion: isActive ? currentStage.verificationQuestion : null,
          hintLevel: currentStage.hintLevel,
          hasRequestedHint: currentStage.hasRequestedHint,
          stalledCount: currentStage.stalledCount,
          answerOrigin: currentStage.answerOrigin,
          stageStatuses: {
            MEMORY: context.session.stages.MEMORY.status,
            UNDERSTANDING: context.session.stages.UNDERSTANDING.status,
            APPLICATION: context.session.stages.APPLICATION.status,
            ANALYSIS: context.session.stages.ANALYSIS.status,
          },
        },
        userMessage: context.userMessage,
      },
    }),
  });
  const decision = userTurnDecisionSchema.parse(
    await agent(request, { signal: context.signal }),
  );

  if (decision.responseMode === "CONVERSATION") {
    return {
      session: context.session,
      assistantMessages: [decision.assistantMessage],
      scaffold: null,
      learningGoalUpdate: decision.learningGoalUpdate,
    };
  }

  if (decision.responseMode === "START_DIAGNOSTIC") {
    return {
      session: diagnosticReducer(context.session, {
        type: "START_STAGE",
        question: decision.question,
      }),
      assistantMessages: [decision.assistantMessage, decision.question],
      scaffold: null,
      learningGoalUpdate: decision.learningGoalUpdate,
    };
  }

  if (decision.responseMode === "REQUEST_HINT") {
    return requestHint(context, agent);
  }

  if (decision.responseMode === "REVEAL_ANSWER") {
    return revealStageAnswer(context, agent);
  }

  const current = activeQuestion(context.session);
  let session = diagnosticReducer(context.session, {
    type: "ANSWER_EVALUATED",
    outcome: decision,
  });
  const assistantMessages = [decision.assistantMessage];
  const needsAutomaticAnswer =
    !decision.isCorrect &&
    decision.classification !== "OFF_TOPIC" &&
    session.stages[current.stage].status === "ACTIVE" &&
    session.stages[current.stage].stalledCount >= 3;

  if (needsAutomaticAnswer) {
    const answerRequest = buildBudgetedRecentRequest({
      recentMessages: context.recentMessages,
      createRequest: (recentMessages) => ({
        operation: "CREATE_STAGE_ANSWER" as const,
        input: {
          ...coreInput(context),
          recentMessages,
          stage: current.stage,
          mainQuestion: current.question,
        },
      }),
    });
    const answer = stageAnswerSchema.parse(
      await agent(answerRequest, { signal: context.signal }),
    );
    assistantMessages.push(answer.assistantMessage);
    const verification = stageQuestionSchema.parse(
      await agent(
        {
          operation: "CREATE_STAGE_VERIFICATION",
          input: {
            ...coreInput(context),
            stage: current.stage,
            mainQuestion: current.question,
          },
        },
        { signal: context.signal },
      ),
    );
    session = diagnosticReducer(session, {
      type: "START_ANSWER_VERIFICATION",
      question: verification.question,
    });
    assistantMessages.push(verification.question);
  }

  if (session.currentStage !== current.stage) {
    const next = await startNextStage(
      { ...context, learningGoal: decision.learningGoalUpdate ?? context.learningGoal },
      session,
      agent,
    );
    session = next.session;
    if (next.question) assistantMessages.push(next.question);
  }

  return {
    session,
    assistantMessages,
    scaffold: decision.scaffold ? { stage: current.stage, ...decision.scaffold } : null,
    learningGoalUpdate: decision.learningGoalUpdate,
  };
}

export async function requestHint(
  context: TurnContext,
  agent: DiagnosticAgentCall = defaultAgentCall,
): Promise<DiagnosticTurnResult> {
  const current = activeQuestion(context.session);
  const session = diagnosticReducer(context.session, { type: "REQUEST_HINT" });
  const hintLevel = session.stages[current.stage].hintLevel;
  if (hintLevel === 0) throw new Error("提示级别无效。");
  const request = buildBudgetedRecentRequest({
    recentMessages: context.recentMessages,
    createRequest: (recentMessages) => ({
      operation: "CREATE_HINT" as const,
      input: {
        ...coreInput(context),
        recentMessages,
        stage: current.stage,
        mainQuestion: current.question,
        hintLevel,
      },
    }),
  });
  const hint = hintResponseSchema.parse(await agent(request, { signal: context.signal }));
  if (hint.hintLevel !== hintLevel) throw new Error("模型返回了错误的提示级别。");
  return {
    session,
    assistantMessages: [hint.assistantMessage],
    scaffold: null,
    learningGoalUpdate: null,
  };
}

export async function revealStageAnswer(
  context: TurnContext,
  agent: DiagnosticAgentCall = defaultAgentCall,
): Promise<DiagnosticTurnResult> {
  const current = activeQuestion(context.session);
  const request = buildBudgetedRecentRequest({
    recentMessages: context.recentMessages,
    createRequest: (recentMessages) => ({
      operation: "CREATE_STAGE_ANSWER" as const,
      input: {
        ...coreInput(context),
        recentMessages,
        stage: current.stage,
        mainQuestion: current.question,
      },
    }),
  });
  const answer = stageAnswerSchema.parse(
    await agent(request, { signal: context.signal }),
  );
  let session = diagnosticReducer(context.session, { type: "REVEAL_ANSWER" });
  const assistantMessages = [answer.assistantMessage];
  const next = await startNextStage(context, session, agent);
  session = next.session;
  if (next.question) assistantMessages.push(next.question);
  return { session, assistantMessages, scaffold: null, learningGoalUpdate: null };
}
