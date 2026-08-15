import { readServerEnv } from "@/lib/env/server";
import { AGENT_REQUEST_MAX_BYTES } from "@/config/agent-limits";
import { createPublicError } from "@/lib/errors/public-error";
import { AgentServiceError, runAgentOperation } from "@/server/agents/service";
import {
  acquireAgentRequest,
  agentRequestCategory,
  AgentRequestGuardError,
} from "@/server/agents/request-guard";
import { DeepSeekError } from "@/server/deepseek/client";

function json(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function errorResponse(
  code: Parameters<typeof createPublicError>[0],
  message: string,
  status: number,
  errorId?: string,
) {
  return json(createPublicError(code, message, errorId), status);
}

function clientId(request: Request) {
  return (request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local")
    .trim()
    .slice(0, 64);
}

function hasValidOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const requestUrl = new URL(request.url);
    const originUrl = new URL(origin);
    const expectedHost =
      request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      requestUrl.host;
    const expectedProtocol =
      request.headers.get("x-forwarded-proto") ?? requestUrl.protocol.replace(":", "");
    return (
      originUrl.host === expectedHost && originUrl.protocol === `${expectedProtocol}:`
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) {
    return errorResponse("VALIDATION_ERROR", "请求来源无效。", 403);
  }
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    return errorResponse("VALIDATION_ERROR", "请求格式必须是 JSON。", 415);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > AGENT_REQUEST_MAX_BYTES) {
    return errorResponse("VALIDATION_ERROR", "请求内容过大。", 413);
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > AGENT_REQUEST_MAX_BYTES) {
    return errorResponse("VALIDATION_ERROR", "请求内容过大。", 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return errorResponse("VALIDATION_ERROR", "请求内容不是有效的 JSON。", 400);
  }

  let apiKey: string;
  try {
    apiKey = readServerEnv(process.env).deepseekApiKey;
  } catch {
    return errorResponse(
      "CONFIGURATION_ERROR",
      "本地模型服务尚未配置，请检查设置后重试。",
      503,
    );
  }

  let release: (() => void) | undefined;
  try {
    release = acquireAgentRequest(clientId(request), agentRequestCategory(body));
    return json(
      { result: await runAgentOperation(body, apiKey, undefined, request.signal) },
      200,
    );
  } catch (error) {
    if (error instanceof AgentRequestGuardError) {
      return errorResponse("RATE_LIMITED", "请求较多，请稍等片刻再试。", 429);
    }
    if (error instanceof AgentServiceError) {
      return error.code === "INVALID_REQUEST"
        ? errorResponse("VALIDATION_ERROR", "提交的学习内容无效。", 400)
        : errorResponse(
            "MODEL_OUTPUT_INVALID",
            "模型结果暂时无法使用，请重试。",
            502,
            error.errorId,
          );
    }
    if (error instanceof DeepSeekError) {
      return errorResponse(
        "UPSTREAM_UNAVAILABLE",
        "模型服务暂时不可用，请重试。",
        503,
        error.errorId,
      );
    }
    return errorResponse("INTERNAL_ERROR", "暂时无法处理材料，请重试。", 500);
  } finally {
    release?.();
  }
}
