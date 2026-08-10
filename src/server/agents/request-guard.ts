import { AGENT_MAX_CONCURRENT_REQUESTS } from "@/config/agent-limits";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;

const requestTimes = new Map<string, number[]>();
let activeRequests = 0;

export class AgentRequestGuardError extends Error {
  constructor(readonly code: "RATE_LIMITED" | "CONCURRENCY_LIMITED") {
    super("请求过于频繁。");
    this.name = "AgentRequestGuardError";
  }
}

export function acquireAgentRequest(clientId: string, now = Date.now()) {
  const recent = (requestTimes.get(clientId) ?? []).filter(
    (timestamp) => now - timestamp < WINDOW_MS,
  );
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    throw new AgentRequestGuardError("RATE_LIMITED");
  }
  if (activeRequests >= AGENT_MAX_CONCURRENT_REQUESTS) {
    throw new AgentRequestGuardError("CONCURRENCY_LIMITED");
  }
  recent.push(now);
  requestTimes.set(clientId, recent);
  activeRequests += 1;
  let released = false;
  return () => {
    if (!released) activeRequests -= 1;
    released = true;
  };
}

export function resetAgentRequestGuardForTests() {
  requestTimes.clear();
  activeRequests = 0;
}
