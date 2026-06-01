import { chat, Message, MODEL_FAST } from '../llm'
import {
  CognitiveLevel,
  KnowledgeNode,
  ConversationTurn,
  NodeLevelState,
  QuestionNextAction,
  QuestionResponse,
  SupportKind,
  SupportRecord,
} from '../types'
import { extractJSON } from '../parseJSON'
import {
  COGNITIVE_LEVELS,
  getNextActionForLevelResult,
  getNextSuitableLevel,
} from '../examFlow'

export type QuestionRequestType = 'normal' | 'hint' | 'answer'
export type SupportUsed = 'none' | SupportKind

export interface QuestionerInput {
  node: KnowledgeNode
  conversationHistory: ConversationTurn[]
  currentLevel?: CognitiveLevel
  levelStates?: NodeLevelState[]
  requestType?: QuestionRequestType
}

export type DiagnosticQuestionResponse = Omit<QuestionResponse, 'levelPassed'> & {
  reply: string
  currentLevel: CognitiveLevel
  passedCurrentLevel: boolean
  nextAction: QuestionNextAction
  blindSpotSummary: string
  supportUsed: SupportUsed
}

const SYSTEM_PROMPT = `你是 Veritas 的 Agent 2：一个带着知识检验目标的家教。

你正在和学生确认他是否真的理解当前知识节点的当前层级。像朋友一样聊天，学生说什么都先回应他刚才那句话本身，再自然回到知识点。可见回复要站在学生体验上，不要替自己辩解，也不要为沟通问题编原因。不要把非知识回答改写成“没准备好回答”，不要套话术，不要播报状态。

只服务当前节点和当前层级，不扩展无关知识点。你可以构造场景和类比，但必须服务材料里的概念。

只有当学生真的在回答当前知识问题时，你才判断层级是否通过；闲聊、抱怨、骂人、求陪伴、元沟通都不能当作知识作答。

每个节点统一走四层：memory -> understanding -> application -> analysis。层级最低通过标准：
- memory：能识别概念或说出基本定义。
- understanding：能用自己的话解释，不只是复述材料原文。
- application：能放进具体场景，并说明怎么用。
- analysis：能拆出机制、因果、边界或对比关系。

内部推进规则：
- 只有通过当前层级，才能进入下一层。
- 没通过就继续追问或换角度。
- 不使用固定轮次判断是否完成。

请求类型：
- normal：判断用户最近回答是否通过当前层级，并继续对话。
- hint：给结构化线索，但不要给完整答案，passedCurrentLevel 必须是 false。
- answer：给当前问题答案，但该层不能视为独立通过，passedCurrentLevel 必须是 false。

只输出严格 JSON，不要输出任何额外文本：
{
  "reply": "展示给用户的自然语言回复",
  "currentLevel": "memory|understanding|application|analysis",
  "passedCurrentLevel": false,
  "blindSpotSummary": "当前暴露出的盲点摘要，没有则写空字符串"
}`

const MAX_LLM_ATTEMPTS = 2
const FLOW_CONTROL_MESSAGES = new Set([
  '给我提示',
  '给我答案',
])

function isCognitiveLevel(value: unknown): value is CognitiveLevel {
  return typeof value === 'string' && COGNITIVE_LEVELS.includes(value as CognitiveLevel)
}

function getEffectiveLevel(requestedLevel: CognitiveLevel | undefined): CognitiveLevel {
  if (requestedLevel && COGNITIVE_LEVELS.includes(requestedLevel)) return requestedLevel
  return 'memory'
}

function getLastAssistantQuestion(conversationHistory: ConversationTurn[]): string {
  return [...conversationHistory].reverse().find((turn) => turn.role === 'assistant')?.content ?? ''
}

function getLastUserMessage(conversationHistory: ConversationTurn[]): string {
  return [...conversationHistory].reverse().find((turn) => turn.role === 'user')?.content.trim() ?? ''
}

function hasRecentDiagnosticUserAnswer(conversationHistory: ConversationTurn[]): boolean {
  const lastUserAnswer = getLastUserMessage(conversationHistory)

  return Boolean(lastUserAnswer && !FLOW_CONTROL_MESSAGES.has(lastUserAnswer))
}

function buildFallbackReply({
  node,
  conversationHistory,
  requestType,
}: {
  node: KnowledgeNode
  conversationHistory: ConversationTurn[]
  requestType: QuestionRequestType
}): string {
  if (requestType === 'hint') {
    return `提示一下：先看材料里「${node.name}」对应的证据片段。`
  }

  if (requestType === 'answer') {
    return `材料里的说法是：${node.context} 证据片段：「${node.sourceExcerpt}」。`
  }

  if (conversationHistory.length === 0) {
    return `好，我们先从「${node.name}」开始。你按自己的理解说一句就行。`
  }

  return '我没太接住，能再说一下吗？'
}

function cleanReply(text: string): string {
  return text.replace(/[—–]+/g, '，')
}

function toSupportRecord(
  supportUsed: SupportUsed,
  response: DiagnosticQuestionResponse,
  conversationHistory: ConversationTurn[]
): SupportRecord | undefined {
  if (supportUsed === 'none') return undefined
  return {
    kind: supportUsed,
    level: response.currentLevel,
    question: getLastAssistantQuestion(conversationHistory),
    content: response.reply,
  }
}

function normalizeQuestionerResponse(
  parsed: Partial<DiagnosticQuestionResponse>,
  input: QuestionerInput
): DiagnosticQuestionResponse {
  const requestType = input.requestType ?? 'normal'
  const currentLevel = getEffectiveLevel(input.currentLevel ?? parsed.currentLevel)
  // 支持记录只来自「给我提示 / 给我答案」按钮点击；普通回合永远 none，
  // 不接受 LLM 自报，避免对话中主动给的类比/思路被算成提示使用。
  const supportUsed: SupportUsed = requestType === 'hint'
    ? 'hint'
    : requestType === 'answer'
      ? 'answer'
      : 'none'
  const passedCurrentLevel = requestType === 'normal'
    && hasRecentDiagnosticUserAnswer(input.conversationHistory)
    && parsed.passedCurrentLevel === true
  const nextAction: QuestionNextAction = requestType === 'normal'
    ? getNextActionForLevelResult({
        currentLevel,
        levelPassed: passedCurrentLevel,
      })
    : requestType === 'answer'
      // 看答案不算独立通过，但确定性推进到下一层；末层则完成节点。
      ? (getNextSuitableLevel(currentLevel) ? 'advance_next_level' : 'complete_node')
      : 'continue_current_level'
  const reply = cleanReply(typeof parsed.reply === 'string' && parsed.reply.trim()
    ? parsed.reply.trim()
    : buildFallbackReply({
        node: input.node,
        conversationHistory: input.conversationHistory,
        requestType,
      }))

  const response: DiagnosticQuestionResponse = {
    reply,
    currentLevel,
    passedCurrentLevel,
    nextAction,
    blindSpotSummary: typeof parsed.blindSpotSummary === 'string'
      ? parsed.blindSpotSummary.trim()
      : '',
    supportUsed,
  }
  const supportRecord = toSupportRecord(supportUsed, response, input.conversationHistory)
  return supportRecord ? { ...response, supportRecords: [supportRecord] } : response
}

export function parseQuestionerResponse(raw: string): Partial<DiagnosticQuestionResponse> {
  const parsed = JSON.parse(extractJSON(raw))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Questioner response must be a JSON object')
  }

  const obj = parsed as Record<string, unknown>
  return {
    reply: typeof obj.reply === 'string'
      ? obj.reply
      : typeof obj.question === 'string'
        ? obj.question
        : undefined,
    currentLevel: isCognitiveLevel(obj.currentLevel) ? obj.currentLevel : undefined,
    passedCurrentLevel: typeof obj.passedCurrentLevel === 'boolean'
      ? obj.passedCurrentLevel
      : undefined,
    blindSpotSummary: typeof obj.blindSpotSummary === 'string' ? obj.blindSpotSummary : undefined,
  }
}

function buildUserContext(input: QuestionerInput): string {
  const currentLevel = input.currentLevel ?? 'memory'
  const requestType = input.requestType ?? 'normal'
  const lastUserAnswer = [...input.conversationHistory].reverse()
    .find((turn) => turn.role === 'user')?.content ?? ''
  const askedQuestions = input.conversationHistory
    .filter((turn) => turn.role === 'assistant')
    .map((turn) => turn.content)
    .join('\n')

  return `当前知识节点：${input.node.name}
节点说明：${input.node.context}
材料证据片段：${input.node.sourceExcerpt}
优先级理由：${input.node.priorityReason ?? ''}
当前层级：${currentLevel}
请求类型：${requestType}
层级状态：${JSON.stringify(input.levelStates ?? [])}
用户最近回答：${lastUserAnswer}
已经问过的问题：${askedQuestions}`
}

export async function getNextQuestion(input: QuestionerInput): Promise<DiagnosticQuestionResponse> {
  const normalizedInput: QuestionerInput = {
    ...input,
    conversationHistory: input.conversationHistory ?? [],
    requestType: input.requestType ?? 'normal',
  }

  const historyMessages: Message[] = normalizedInput.conversationHistory.map((turn) => ({
    role: turn.role,
    content: turn.content,
  }))
  const userContext = buildUserContext(normalizedInput)

  for (let attempt = 0; attempt < MAX_LLM_ATTEMPTS; attempt++) {
    try {
      const raw = await chat(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContext },
          ...historyMessages,
        ],
        { jsonMode: true, temperature: 0.3, model: MODEL_FAST }
      )
      return normalizeQuestionerResponse(parseQuestionerResponse(raw), normalizedInput)
    } catch {
      if (attempt === MAX_LLM_ATTEMPTS - 1) {
        return normalizeQuestionerResponse({}, normalizedInput)
      }
    }
  }

  return normalizeQuestionerResponse({}, normalizedInput)
}
