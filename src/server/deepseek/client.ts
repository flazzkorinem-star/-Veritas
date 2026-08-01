import { z } from "zod";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-v4-flash";
const MAX_RETRIES = 2;

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
  "UPSTREAM_REJECTED" | "UPSTREAM_UNAVAILABLE" | "INVALID_RESPONSE" | "REQUEST_ABORTED";

export class DeepSeekError extends Error {
  constructor(readonly code: DeepSeekErrorCode) {
    super(
      code === "REQUEST_ABORTED"
        ? "请求已取消。"
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
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
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

function shouldRetryStatus(status: number) {
  return status === 429 || status === 500 || status === 503;
}

export async function callDeepSeekJson(
  request: DeepSeekJsonRequest,
  dependencies: DeepSeekDependencies = {},
) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const sleep = dependencies.sleep ?? delay;
  const random = dependencies.random ?? Math.random;
  let finalError: DeepSeekError = new DeepSeekError("UPSTREAM_UNAVAILABLE");

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    if (request.signal?.aborted) throw new DeepSeekError("REQUEST_ABORTED");
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    request.signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? 90_000);
    try {
      const response = await fetchImpl(DEEPSEEK_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${request.apiKey}`,
          "Content-Type": "application/json",
        },
        body: bodyFor(request),
        signal: controller.signal,
      });
      if (!response.ok) {
        if (!shouldRetryStatus(response.status)) {
          throw new DeepSeekError("UPSTREAM_REJECTED");
        }
        finalError = new DeepSeekError("UPSTREAM_UNAVAILABLE");
      } else {
        try {
          return parseContent(await response.json());
        } catch (error) {
          if (!(error instanceof DeepSeekError)) {
            finalError = new DeepSeekError("INVALID_RESPONSE");
          } else {
            finalError = error;
          }
        }
      }
    } catch (error) {
      if (request.signal?.aborted) throw new DeepSeekError("REQUEST_ABORTED");
      if (error instanceof DeepSeekError && error.code === "UPSTREAM_REJECTED") {
        throw error;
      }
      finalError =
        error instanceof DeepSeekError
          ? error
          : new DeepSeekError("UPSTREAM_UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener("abort", abortFromCaller);
    }

    if (attempt < MAX_RETRIES) {
      await sleep(250 * 2 ** attempt + Math.floor(random() * 100));
    }
  }
  throw finalError;
}
