import { z } from "zod";

import {
  type AgentOperationRequest,
  agentOperationRequestSchema,
} from "@/domain/agents/contracts";
import {
  type ChunkExtraction,
  chunkExtractionSchema,
  type FirstQuestion,
  firstQuestionSchema,
  type KnowledgeMap,
  knowledgeMapSchema,
} from "@/domain/knowledge-map/contracts";
import {
  type EvaluationDecision,
  evaluationDecisionSchema,
  type HintResponse,
  hintResponseSchema,
  type StageAnswer,
  stageAnswerSchema,
  type StageQuestion,
  stageQuestionSchema,
} from "@/domain/diagnostic/agent-contracts";
import { publicErrorCodeSchema, publicErrorSchema } from "@/lib/errors/public-error";

export type AgentClientErrorCode =
  z.infer<typeof publicErrorCodeSchema> | "INVALID_RESPONSE" | "REQUEST_ABORTED";

export class AgentClientError extends Error {
  constructor(
    readonly code: AgentClientErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AgentClientError";
  }
}

interface AgentClientDependencies {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

type ExtractionRequest = Extract<
  AgentOperationRequest,
  { operation: "EXTRACT_KNOWLEDGE" }
>;
type AuditRequest = Extract<AgentOperationRequest, { operation: "AUDIT_KNOWLEDGE_MAP" }>;
type QuestionRequest = Extract<
  AgentOperationRequest,
  { operation: "CREATE_FIRST_QUESTION" }
>;
type StageQuestionRequest = Extract<
  AgentOperationRequest,
  { operation: "CREATE_STAGE_QUESTION" }
>;
type EvaluationRequest = Extract<AgentOperationRequest, { operation: "EVALUATE_ANSWER" }>;
type HintRequest = Extract<AgentOperationRequest, { operation: "CREATE_HINT" }>;
type AnswerRequest = Extract<AgentOperationRequest, { operation: "CREATE_STAGE_ANSWER" }>;

function resultSchema(operation: AgentOperationRequest["operation"]) {
  switch (operation) {
    case "EXTRACT_KNOWLEDGE":
      return chunkExtractionSchema;
    case "AUDIT_KNOWLEDGE_MAP":
      return knowledgeMapSchema;
    case "CREATE_FIRST_QUESTION":
      return firstQuestionSchema;
    case "CREATE_STAGE_QUESTION":
      return stageQuestionSchema;
    case "EVALUATE_ANSWER":
      return evaluationDecisionSchema;
    case "CREATE_HINT":
      return hintResponseSchema;
    case "CREATE_STAGE_ANSWER":
      return stageAnswerSchema;
  }
}

export function callAgent(
  request: ExtractionRequest,
  dependencies?: AgentClientDependencies,
): Promise<ChunkExtraction>;
export function callAgent(
  request: AuditRequest,
  dependencies?: AgentClientDependencies,
): Promise<KnowledgeMap>;
export function callAgent(
  request: QuestionRequest,
  dependencies?: AgentClientDependencies,
): Promise<FirstQuestion>;
export function callAgent(
  request: StageQuestionRequest,
  dependencies?: AgentClientDependencies,
): Promise<StageQuestion>;
export function callAgent(
  request: EvaluationRequest,
  dependencies?: AgentClientDependencies,
): Promise<EvaluationDecision>;
export function callAgent(
  request: HintRequest,
  dependencies?: AgentClientDependencies,
): Promise<HintResponse>;
export function callAgent(
  request: AnswerRequest,
  dependencies?: AgentClientDependencies,
): Promise<StageAnswer>;
export function callAgent(
  request: AgentOperationRequest,
  dependencies?: AgentClientDependencies,
): Promise<
  | ChunkExtraction
  | KnowledgeMap
  | FirstQuestion
  | StageQuestion
  | EvaluationDecision
  | HintResponse
  | StageAnswer
>;
export async function callAgent(
  value: AgentOperationRequest,
  dependencies: AgentClientDependencies = {},
) {
  const request = agentOperationRequestSchema.safeParse(value);
  if (!request.success) {
    throw new AgentClientError("VALIDATION_ERROR", "提交的学习内容无效。");
  }

  let response: Response;
  try {
    response = await (dependencies.fetchImpl ?? fetch)("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request.data),
      signal: dependencies.signal,
    });
  } catch {
    if (dependencies.signal?.aborted) {
      throw new AgentClientError("REQUEST_ABORTED", "请求已取消。");
    }
    throw new AgentClientError("UPSTREAM_UNAVAILABLE", "模型服务暂时不可用，请重试。");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new AgentClientError("INVALID_RESPONSE", "服务返回的内容无法读取，请重试。");
  }

  if (!response.ok) {
    const error = publicErrorSchema.safeParse(body);
    if (!error.success) {
      throw new AgentClientError("INVALID_RESPONSE", "请求失败，请稍后重试。");
    }
    throw new AgentClientError(error.data.error.code, error.data.error.message);
  }

  const result = z
    .object({ result: resultSchema(request.data.operation) })
    .strict()
    .safeParse(body);
  if (!result.success) {
    throw new AgentClientError("INVALID_RESPONSE", "模型结果暂时无法使用，请重试。");
  }
  return result.data.result;
}
