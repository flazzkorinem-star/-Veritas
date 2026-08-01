import {
  evaluationDecisionSchema,
  hintResponseSchema,
  stageAnswerSchema,
  stageQuestionSchema,
  type ScaffoldType,
} from "@/domain/diagnostic/agent-contracts";
import type { AgentOperationRequest } from "@/domain/agents/contracts";
import type { NodeSession } from "@/domain/diagnostic/contracts";
import { diagnosticReducer } from "@/domain/diagnostic/reducer";
import type { DiagnosticNode, KnowledgeItem, Message, StageKey } from "@/domain/types";
import { callAgent } from "@/features/materials/agent-client";

type DiagnosticRequest = Extract<
  AgentOperationRequest,
  {
    operation:
      "CREATE_STAGE_QUESTION" | "EVALUATE_ANSWER" | "CREATE_HINT" | "CREATE_STAGE_ANSWER";
  }
>;

export type DiagnosticAgentCall = (
  request: DiagnosticRequest,
  dependencies: { signal?: AbortSignal },
) => Promise<unknown>;

interface TurnContext {
  node: DiagnosticNode;
  knowledgeItems: KnowledgeItem[];
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
}

const defaultAgentCall: DiagnosticAgentCall = (request, dependencies) =>
  callAgent(request, dependencies);

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
    recentMessages: context.recentMessages.slice(-12),
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

export async function submitDiagnosticAnswer(
  context: TurnContext & { userAnswer: string },
  agent: DiagnosticAgentCall = defaultAgentCall,
): Promise<DiagnosticTurnResult> {
  const current = activeQuestion(context.session);
  const decision = evaluationDecisionSchema.parse(
    await agent(
      {
        operation: "EVALUATE_ANSWER",
        input: {
          ...commonInput(context),
          stage: current.stage,
          mainQuestion: current.question,
          userAnswer: context.userAnswer,
        },
      },
      { signal: context.signal },
    ),
  );
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
    const next = await startNextStage(context, session, agent);
    session = next.session;
    if (next.question) assistantMessages.push(next.question);
  }

  return {
    session,
    assistantMessages,
    scaffold: decision.scaffold ? { stage: current.stage, ...decision.scaffold } : null,
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
  return { session, assistantMessages: [hint.assistantMessage], scaffold: null };
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
  return { session, assistantMessages, scaffold: null };
}
