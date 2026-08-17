import { z } from "zod";

import { AGENT_REQUEST_MAX_BYTES } from "@/config/agent-limits";
import {
  type AgentOperation,
  type AgentOperationRequest,
  agentOperationRequestSchema,
  type PendingNodeOrder,
  pendingNodeOrderSchema,
} from "@/domain/agents/contracts";
import {
  type AgentOperationMeta,
  agentOperationMetaSchema,
} from "@/domain/agents/operation-meta";
import {
  type KnowledgeMap,
  knowledgeMapSchema,
  type FirstQuestion,
  firstQuestionSchema,
} from "@/domain/knowledge-map/contracts";
import {
  type CompactExtraction,
  compactExtractionSchema,
} from "@/domain/knowledge-map/compact-contracts";
import {
  type CompactMergeResult,
  compactMergeResultSchema,
} from "@/domain/knowledge-map/compact-merge";
import {
  type HintResponse,
  hintResponseSchema,
  type StageAnswer,
  stageAnswerSchema,
  type StageQuestion,
  stageQuestionSchema,
  type UserTurnDecision,
  userTurnDecisionSchema,
} from "@/domain/diagnostic/agent-contracts";
import {
  type ReportAgentOutput,
  reportAgentOutputSchema,
} from "@/domain/report/contracts";
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

export interface AgentClientDependencies {
  fetchImpl?: typeof fetch;
  maxRequestBytes?: number;
  onMeta?: (meta: AgentOperationMeta) => void;
  signal?: AbortSignal;
}

type CompactExtractionRequest = Extract<
  AgentOperationRequest,
  { operation: "EXTRACT_COMPACT_KNOWLEDGE" }
>;
type CompileKnowledgeMapRequest = Extract<
  AgentOperationRequest,
  { operation: "COMPILE_KNOWLEDGE_MAP" }
>;
type MergeCompactCandidatesRequest = Extract<
  AgentOperationRequest,
  { operation: "MERGE_COMPACT_CANDIDATES" }
>;
type QuestionRequest = Extract<
  AgentOperationRequest,
  { operation: "CREATE_FIRST_QUESTION" }
>;
type StageQuestionRequest = Extract<
  AgentOperationRequest,
  { operation: "CREATE_STAGE_QUESTION" | "CREATE_STAGE_VERIFICATION" }
>;
type UserTurnRequest = Extract<AgentOperationRequest, { operation: "RESPOND_TO_USER" }>;
type HintRequest = Extract<AgentOperationRequest, { operation: "CREATE_HINT" }>;
type AnswerRequest = Extract<AgentOperationRequest, { operation: "CREATE_STAGE_ANSWER" }>;
type ReportRequest = Extract<AgentOperationRequest, { operation: "CREATE_REPORT" }>;
type PendingNodeOrderRequest = Extract<
  AgentOperationRequest,
  { operation: "PRIORITIZE_PENDING_NODES" }
>;

const RESULT_SCHEMA_BY_OPERATION = {
  EXTRACT_COMPACT_KNOWLEDGE: compactExtractionSchema,
  MERGE_COMPACT_CANDIDATES: compactMergeResultSchema,
  COMPILE_KNOWLEDGE_MAP: knowledgeMapSchema,
  CREATE_FIRST_QUESTION: firstQuestionSchema,
  CREATE_STAGE_QUESTION: stageQuestionSchema,
  CREATE_STAGE_VERIFICATION: stageQuestionSchema,
  RESPOND_TO_USER: userTurnDecisionSchema,
  CREATE_HINT: hintResponseSchema,
  CREATE_STAGE_ANSWER: stageAnswerSchema,
  PRIORITIZE_PENDING_NODES: pendingNodeOrderSchema,
  CREATE_REPORT: reportAgentOutputSchema,
} satisfies Record<AgentOperation, z.ZodType>;

export function callAgent(
  request: CompactExtractionRequest,
  dependencies?: AgentClientDependencies,
): Promise<CompactExtraction>;
export function callAgent(
  request: CompileKnowledgeMapRequest,
  dependencies?: AgentClientDependencies,
): Promise<KnowledgeMap>;
export function callAgent(
  request: MergeCompactCandidatesRequest,
  dependencies?: AgentClientDependencies,
): Promise<CompactMergeResult>;
export function callAgent(
  request: QuestionRequest,
  dependencies?: AgentClientDependencies,
): Promise<FirstQuestion>;
export function callAgent(
  request: StageQuestionRequest,
  dependencies?: AgentClientDependencies,
): Promise<StageQuestion>;
export function callAgent(
  request: UserTurnRequest,
  dependencies?: AgentClientDependencies,
): Promise<UserTurnDecision>;
export function callAgent(
  request: HintRequest,
  dependencies?: AgentClientDependencies,
): Promise<HintResponse>;
export function callAgent(
  request: AnswerRequest,
  dependencies?: AgentClientDependencies,
): Promise<StageAnswer>;
export function callAgent(
  request: ReportRequest,
  dependencies?: AgentClientDependencies,
): Promise<ReportAgentOutput>;
export function callAgent(
  request: PendingNodeOrderRequest,
  dependencies?: AgentClientDependencies,
): Promise<PendingNodeOrder>;
export function callAgent(
  request: AgentOperationRequest,
  dependencies?: AgentClientDependencies,
): Promise<
  | CompactExtraction
  | CompactMergeResult
  | KnowledgeMap
  | FirstQuestion
  | StageQuestion
  | UserTurnDecision
  | HintResponse
  | StageAnswer
  | PendingNodeOrder
  | ReportAgentOutput
>;
export async function callAgent(
  value: AgentOperationRequest,
  dependencies: AgentClientDependencies = {},
) {
  const request = agentOperationRequestSchema.safeParse(value);
  if (!request.success) {
    throw new AgentClientError("VALIDATION_ERROR", "提交的学习内容无效。");
  }
  const requestBody = JSON.stringify(request.data);
  if (
    new TextEncoder().encode(requestBody).byteLength >
    (dependencies.maxRequestBytes ?? AGENT_REQUEST_MAX_BYTES)
  ) {
    throw new AgentClientError(
      "VALIDATION_ERROR",
      "提交给模型的内容过大，请拆分材料后重试。",
    );
  }

  let response: Response;
  try {
    response = await (dependencies.fetchImpl ?? fetch)("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
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
    .object({
      result: RESULT_SCHEMA_BY_OPERATION[request.data.operation],
      meta: agentOperationMetaSchema.optional(),
    })
    .strict()
    .safeParse(body);
  if (!result.success) {
    throw new AgentClientError("INVALID_RESPONSE", "模型结果暂时无法使用，请重试。");
  }
  if (result.data.meta) dependencies.onMeta?.(result.data.meta);
  return result.data.result;
}
