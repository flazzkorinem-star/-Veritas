import {
  AGENT_TWO_BROWSER_REQUEST_MAX_BYTES,
  AGENT_TWO_RECENT_MESSAGES_MAX_BYTES,
} from "@/config/agent-limits";
import type { KnowledgeItem, MaterialModule } from "@/domain/types";

export interface AgentRecentMessage {
  role: "USER" | "ASSISTANT";
  content: string;
}

export interface AgentMaterialContext {
  title: string;
  modules: Array<Pick<MaterialModule, "id" | "title">>;
  itemIndex: Array<Pick<KnowledgeItem, "id" | "title" | "kind"> & { summary?: string }>;
}

export class AgentContextBudgetError extends Error {
  constructor() {
    super("当前主题内容超过模型请求预算，请拆分材料后重试。");
    this.name = "AgentContextBudgetError";
  }
}

export function jsonBytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function addRecentMessages<T>(
  recentMessages: AgentRecentMessage[],
  createRequest: (messages: AgentRecentMessage[]) => T,
  maxRequestBytes: number,
  maxRecentBytes: number,
) {
  let selected: AgentRecentMessage[] = [];
  for (let index = recentMessages.length - 1; index >= 0; index -= 1) {
    const candidate = [recentMessages[index]!, ...selected];
    if (
      jsonBytes(candidate) > maxRecentBytes ||
      jsonBytes(createRequest(candidate)) > maxRequestBytes
    ) {
      break;
    }
    selected = candidate;
  }
  return selected;
}

export function buildBudgetedRecentRequest<T>({
  recentMessages,
  createRequest,
  maxRequestBytes = AGENT_TWO_BROWSER_REQUEST_MAX_BYTES,
  maxRecentBytes = AGENT_TWO_RECENT_MESSAGES_MAX_BYTES,
}: {
  recentMessages: AgentRecentMessage[];
  createRequest: (messages: AgentRecentMessage[]) => T;
  maxRequestBytes?: number;
  maxRecentBytes?: number;
}) {
  const base = createRequest([]);
  if (jsonBytes(base) > maxRequestBytes) throw new AgentContextBudgetError();
  const selected = addRecentMessages(
    recentMessages,
    createRequest,
    maxRequestBytes,
    maxRecentBytes,
  );
  return createRequest(selected);
}

export function buildBudgetedMaterialRequest<T>({
  materialTitle,
  modules,
  knowledgeItems,
  currentKnowledgeItemIds,
  recentMessages,
  createRequest,
  maxRequestBytes = AGENT_TWO_BROWSER_REQUEST_MAX_BYTES,
  maxRecentBytes = AGENT_TWO_RECENT_MESSAGES_MAX_BYTES,
}: {
  materialTitle: string;
  modules: MaterialModule[];
  knowledgeItems: KnowledgeItem[];
  currentKnowledgeItemIds: ReadonlySet<string>;
  recentMessages: AgentRecentMessage[];
  createRequest: (
    materialContext: AgentMaterialContext,
    messages: AgentRecentMessage[],
  ) => T;
  maxRequestBytes?: number;
  maxRecentBytes?: number;
}) {
  const currentItems = knowledgeItems.filter((item) =>
    currentKnowledgeItemIds.has(item.id),
  );
  const currentModuleIds = new Set(currentItems.map((item) => item.moduleId));
  const context: AgentMaterialContext = {
    title: materialTitle,
    modules: modules
      .filter((module) => currentModuleIds.has(module.id))
      .map(({ id, title }) => ({ id, title })),
    itemIndex: currentItems.map(({ id, title, kind }) => ({ id, title, kind })),
  };
  if (context.modules.length === 0 || context.itemIndex.length === 0) {
    throw new AgentContextBudgetError();
  }
  const base = createRequest(context, []);
  if (jsonBytes(base) > maxRequestBytes) throw new AgentContextBudgetError();
  const selectedMessages = addRecentMessages(
    recentMessages,
    (messages) => createRequest(context, messages),
    maxRequestBytes,
    maxRecentBytes,
  );

  let allModulesIncluded = true;
  for (const materialModule of modules) {
    if (currentModuleIds.has(materialModule.id)) continue;
    const candidate = {
      ...context,
      modules: [
        ...context.modules,
        { id: materialModule.id, title: materialModule.title },
      ],
    };
    if (jsonBytes(createRequest(candidate, selectedMessages)) > maxRequestBytes) {
      allModulesIncluded = false;
      break;
    }
    context.modules = candidate.modules;
  }

  let allItemsIncluded = allModulesIncluded;
  if (allModulesIncluded) {
    for (const item of knowledgeItems) {
      if (currentKnowledgeItemIds.has(item.id)) continue;
      const candidate = {
        ...context,
        itemIndex: [
          ...context.itemIndex,
          { id: item.id, title: item.title, kind: item.kind },
        ],
      };
      if (jsonBytes(createRequest(candidate, selectedMessages)) > maxRequestBytes) {
        allItemsIncluded = false;
        break;
      }
      context.itemIndex = candidate.itemIndex;
    }
  }

  if (allItemsIncluded && context.itemIndex.length === knowledgeItems.length) {
    for (const item of knowledgeItems) {
      if (currentKnowledgeItemIds.has(item.id)) continue;
      const index = context.itemIndex.findIndex((entry) => entry.id === item.id);
      const itemIndex = context.itemIndex.with(index, {
        ...context.itemIndex[index]!,
        summary: item.summary,
      });
      const candidate = { ...context, itemIndex };
      if (jsonBytes(createRequest(candidate, selectedMessages)) > maxRequestBytes) break;
      context.itemIndex = itemIndex;
    }
  }
  return createRequest(context, selectedMessages);
}
