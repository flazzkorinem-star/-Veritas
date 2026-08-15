import {
  AGENT_MAX_BACKGROUND_REQUESTS,
  AGENT_MAX_CONCURRENT_REQUESTS,
  AGENT_MAX_NON_REALTIME_REQUESTS,
} from "@/config/agent-limits";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW: Record<AgentRequestCategory, number> = {
  REALTIME: 30,
  MATERIAL: 120,
  BACKGROUND: 6,
};

const requestTimes = new Map<string, number[]>();
let activeRequests = 0;
let activeNonRealtimeRequests = 0;
let activeBackgroundRequests = 0;

export type AgentRequestCategory = "REALTIME" | "MATERIAL" | "BACKGROUND";

export function agentRequestCategory(value: unknown): AgentRequestCategory {
  const operation =
    value && typeof value === "object" && "operation" in value
      ? (value as { operation?: unknown }).operation
      : null;
  if (
    operation === "EXTRACT_COMPACT_KNOWLEDGE" ||
    operation === "MERGE_COMPACT_CANDIDATES" ||
    operation === "COMPILE_KNOWLEDGE_MAP"
  ) {
    return "MATERIAL";
  }
  if (operation === "CREATE_REPORT") return "BACKGROUND";
  return "REALTIME";
}

export class AgentRequestGuardError extends Error {
  constructor(readonly code: "RATE_LIMITED" | "CONCURRENCY_LIMITED") {
    super("请求过于频繁。");
    this.name = "AgentRequestGuardError";
  }
}

export function acquireAgentRequest(
  clientId: string,
  category: AgentRequestCategory,
  now = Date.now(),
) {
  const rateLimitKey = `${clientId}:${category}`;
  const recent = (requestTimes.get(rateLimitKey) ?? []).filter(
    (timestamp) => now - timestamp < WINDOW_MS,
  );
  if (recent.length >= MAX_REQUESTS_PER_WINDOW[category]) {
    throw new AgentRequestGuardError("RATE_LIMITED");
  }
  if (activeRequests >= AGENT_MAX_CONCURRENT_REQUESTS) {
    throw new AgentRequestGuardError("CONCURRENCY_LIMITED");
  }
  if (
    category !== "REALTIME" &&
    activeNonRealtimeRequests >= AGENT_MAX_NON_REALTIME_REQUESTS
  ) {
    throw new AgentRequestGuardError("CONCURRENCY_LIMITED");
  }
  if (
    category === "BACKGROUND" &&
    activeBackgroundRequests >= AGENT_MAX_BACKGROUND_REQUESTS
  ) {
    throw new AgentRequestGuardError("CONCURRENCY_LIMITED");
  }
  recent.push(now);
  requestTimes.set(rateLimitKey, recent);
  activeRequests += 1;
  if (category !== "REALTIME") activeNonRealtimeRequests += 1;
  if (category === "BACKGROUND") activeBackgroundRequests += 1;
  let released = false;
  return () => {
    if (!released) {
      activeRequests -= 1;
      if (category !== "REALTIME") activeNonRealtimeRequests -= 1;
      if (category === "BACKGROUND") activeBackgroundRequests -= 1;
    }
    released = true;
  };
}

export function resetAgentRequestGuardForTests() {
  requestTimes.clear();
  activeRequests = 0;
  activeNonRealtimeRequests = 0;
  activeBackgroundRequests = 0;
}
