import {
  hintResponseSchema,
  stageAnswerSchema,
  stageQuestionSchema,
  userTurnDecisionSchema,
  type ScaffoldType,
} from "@/domain/diagnostic/agent-contracts";
import { topicOpeningSchema } from "@/domain/knowledge-map/contracts";
import type { AgentOperationRequest } from "@/domain/agents/contracts";
import type { NodeSession } from "@/domain/diagnostic/contracts";
import { diagnosticReducer } from "@/domain/diagnostic/reducer";
import type { DiagnosticNode, KnowledgeItem, Message, StageKey } from "@/domain/types";
import { callAgent } from "@/features/materials/agent-client";

type DiagnosticRequest = Extract<
  AgentOperationRequest,
  {
    operation:
      | "CREATE_TOPIC_OPENING"
      | "CREATE_STAGE_QUESTION"
      | "RESPOND_TO_USER"
      | "CREATE_HINT"
      | "CREATE_STAGE_ANSWER";
  }
>;

export type DiagnosticAgentCall = (
  request: DiagnosticRequest,
  dependencies: { signal?: AbortSignal },
) => Promise<unknown>;

interface TurnContext {
  node: DiagnosticNode;
  knowledgeItems: KnowledgeItem[];
  materialContext: Extract<
    AgentOperationRequest,
    { operation: "RESPOND_TO_USER" }
  >["input"]["materialContext"];
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

export async function createTopicOpening(
  input: Pick<
    TurnContext,
    "node" | "knowledgeItems" | "materialContext" | "learningGoal" | "signal"
  >,
  agent: DiagnosticAgentCall = defaultAgentCall,
) {
  return topicOpeningSchema.parse(
    await agent(
      {
        operation: "CREATE_TOPIC_OPENING",
        input: {
          node: input.node,
          knowledgeItems: input.knowledgeItems,
          materialContext: input.materialContext,
          learningGoal: input.learningGoal,
        },
      },
      { signal: input.signal },
    ),
  );
}

function activeQuestion(session: NodeSession) {
  const stage = session.stages[session.currentStage];
  if (stage.status !== "ACTIVE" || !stage.mainQuestion) {
    throw new Error("当前主题没有可回答的问题。");
  }
  return { stage: session.currentStage, question: stage.mainQuestion };
}

function commonInput(context: TurnContext) {
  return {
    node: context.node,
    knowledgeItems: context.knowledgeItems,
    learningGoal: context.learningGoal,
    recentMessages: context.recentMessages.slice(-20),
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
  const diagnosticStatus =
    context.session.status === "COMPLETED"
      ? "COMPLETED"
      : currentStage.status === "ACTIVE"
        ? "ACTIVE"
        : "NOT_STARTED";
  const decision = userTurnDecisionSchema.parse(
    await agent(
      {
        operation: "RESPOND_TO_USER",
        input: {
          ...commonInput(context),
          materialContext: context.materialContext,
          diagnostic: {
            status: diagnosticStatus,
            stage: context.session.currentStage,
            mainQuestion:
              currentStage.status === "ACTIVE" ? currentStage.mainQuestion : null,
          },
          userMessage: context.userMessage,
        },
      },
      { signal: context.signal },
    ),
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

  const current = activeQuestion(context.session);
  let session = diagnosticReducer(context.session, {
    type: "ANSWER_EVALUATED",
    outcome: decision,
  });
  const assistantMessages = [decision.assistantMessage];
  const automaticallyRevealed =
    context.session.stages[current.stage].status === "ACTIVE" &&
    session.stages[current.stage].status === "PASSED_WITH_ANSWER";

  if (automaticallyRevealed) {
    const answer = stageAnswerSchema.parse(
      await agent(
        {
          operation: "CREATE_STAGE_ANSWER",
          input: {
            ...commonInput(context),
            stage: current.stage,
            mainQuestion: current.question,
          },
        },
        { signal: context.signal },
      ),
    );
    assistantMessages.push(answer.assistantMessage);
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
  const hint = hintResponseSchema.parse(
    await agent(
      {
        operation: "CREATE_HINT",
        input: {
          ...commonInput(context),
          stage: current.stage,
          mainQuestion: current.question,
          hintLevel,
        },
      },
      { signal: context.signal },
    ),
  );
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
  const answer = stageAnswerSchema.parse(
    await agent(
      {
        operation: "CREATE_STAGE_ANSWER",
        input: {
          ...commonInput(context),
          stage: current.stage,
          mainQuestion: current.question,
        },
      },
      { signal: context.signal },
    ),
  );
  let session = diagnosticReducer(context.session, { type: "REVEAL_ANSWER" });
  const assistantMessages = [answer.assistantMessage];
  const next = await startNextStage(context, session, agent);
  session = next.session;
  if (next.question) assistantMessages.push(next.question);
  return { session, assistantMessages, scaffold: null, learningGoalUpdate: null };
}
