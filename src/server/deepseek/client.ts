import { z } from "zod";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-v4-flash";

const responseSchema = z
  .object({
    choices: z
      .array(
        z.object({
          finish_reason: z.string(),
          message: z.object({ content: z.string().nullable() }),
        }),
      )
      .min(1),
  })
  .passthrough();

export type DeepSeekErrorCode =
  | "UPSTREAM_REJECTED"
  | "UPSTREAM_UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "REQUEST_ABORTED"
  | "REQUEST_TIMEOUT";

export class DeepSeekError extends Error {
  constructor(
    readonly code: DeepSeekErrorCode,
    readonly status?: number,
    readonly errorId?: string,
  ) {
    super(
      code === "REQUEST_ABORTED"
        ? "请求已取消。"
        : code === "REQUEST_TIMEOUT"
          ? "模型请求超时，请重试。"
        : code === "INVALID_RESPONSE"
          ? "模型返回的内容不完整，请重试。"
          : "模型服务暂时不可用，请稍后重试。",
    );
    this.name = "DeepSeekError";
  }
}

export interface DeepSeekJsonRequest {
  apiKey: string;
  system: string;
  user: string;
  thinking: boolean;
  reasoningEffort?: "low";
  maxTokens: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

interface DeepSeekDependencies {
  fetchImpl?: typeof fetch;
}

function bodyFor(request: DeepSeekJsonRequest) {
  return JSON.stringify({
    model: DEEPSEEK_MODEL,
    messages: [
      { role: "system", content: request.system },
      { role: "user", content: request.user },
    ],
    response_format: { type: "json_object" },
    thinking: { type: request.thinking ? "enabled" : "disabled" },
    ...(request.thinking && request.reasoningEffort
      ? { reasoning_effort: request.reasoningEffort }
      : {}),
    max_tokens: request.maxTokens,
    stream: false,
  });
}

export function deepSeekRequestBodyBytes(request: DeepSeekJsonRequest) {
  return new TextEncoder().encode(bodyFor(request)).byteLength;
}

function parseContent(value: unknown) {
  const response = responseSchema.safeParse(value);
  const choice = response.success ? response.data.choices[0] : undefined;
  if (!choice || choice.finish_reason !== "stop" || !choice.message.content?.trim()) {
    throw new DeepSeekError("INVALID_RESPONSE");
  }
  try {
    return JSON.parse(choice.message.content) as unknown;
  } catch {
    throw new DeepSeekError("INVALID_RESPONSE");
  }
}

function isRecoverableStatus(status: number) {
  return status === 429 || status === 500 || status === 503;
}

export async function callDeepSeekJson(
  request: DeepSeekJsonRequest,
  dependencies: DeepSeekDependencies = {},
) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  if (request.signal?.aborted) throw new DeepSeekError("REQUEST_ABORTED");

  try {
    const response = await fetchImpl(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${request.apiKey}`,
        "Content-Type": "application/json",
      },
      body: bodyFor(request),
      signal: request.signal,
    });
    if (!response.ok) {
      throw new DeepSeekError(
        isRecoverableStatus(response.status) ? "UPSTREAM_UNAVAILABLE" : "UPSTREAM_REJECTED",
        response.status,
      );
    }
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new DeepSeekError("INVALID_RESPONSE", response.status);
    }
    return parseContent(value);
  } catch (error) {
    if (request.signal?.aborted) throw new DeepSeekError("REQUEST_ABORTED");
    if (error instanceof DeepSeekError) throw error;
    throw new DeepSeekError("UPSTREAM_UNAVAILABLE");
  }
}
