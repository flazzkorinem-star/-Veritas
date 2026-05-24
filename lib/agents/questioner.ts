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
  DEEP_PATH_LEVELS,
  getFirstDeepLevel,
  getNextActionForLevelResult,
  getNextSuitableLevel,
  isLevelSuitable,
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
  nextLevel?: CognitiveLevel
}

const SYSTEM_PROMPT = `你是 Veritas 的 Agent 2：诊断对话者，不是考官。

你要围绕用户材料中的当前知识节点，按认知层级推进诊断。不要扩展无关知识点，不要讲成长课。

风格：
- 像对话者，简洁自然，不用标题和长 bullet point。
- 用户答对要有明确反馈，答错要指出问题。
- 每次回复只服务当前节点和当前层级。
- 可以构造场景和类比，但考察对象必须来自材料里的概念。
- 不使用破折号，用逗号或句号表达停顿。

层级最低通过标准：
- memory：能识别概念或说出基本定义。
- understanding：能用自己的话解释，不只是复述材料原文。
- application：能放进具体场景，并说明怎么用。
- analysis：能拆出机制、因果、边界或对比关系。
- evaluation：能做判断和取舍，并说出理由。
- creation：能提出新方案、变式或迁移用法，且和概念逻辑一致。

推进规则：
- 只有通过当前层级，才能进入下一层。
- 没通过就继续追问或换角度。
- 不使用固定轮次判断是否完成。
- 不能进入 suitableLevels 未允许的层级。
- 快速路径是 memory -> understanding -> application。
- 快速路径完成后，等待用户选择完成节点或继续深入。
- 深入路径优先 analysis、evaluation；creation 只在 suitableLevels 允许时进入。

请求类型：
- normal：判断用户最近回答是否通过当前层级，并继续对话。
- hint：给结构化线索，但不要给完整答案，passedCurrentLevel 必须是 false。
- answer：给当前问题答案，但该层不能视为独立通过，passedCurrentLevel 必须是 false。

错误处理：
- 事实性错误：先轻量纠正，再问一个对比问题。
- 逻辑错误：用反例或追问暴露断点。
- 应用错误：换一个更具体的场景，让用户重新判断。
- 用户持续卡住时，可以主动用类比。

只输出严格 JSON，不要输出任何额外文本：
{
  "reply": "展示给用户的自然语言回复",
  "currentLevel": "memory|understanding|application|analysis|evaluation|creation",
  "passedCurrentLevel": false,
  "blindSpotSummary": "当前暴露出的盲点摘要，没有则写空字符串",
  "supportUsed": "none|hint|answer|analogy",
  "nextLevel": "可选，下一层级"
}`

const MAX_LLM_ATTEMPTS = 2
const VALID_SUPPORT_USED: SupportUsed[] = ['none', 'hint', 'answer', 'analogy']
const NON_DIAGNOSTIC_USER_MESSAGES = new Set([
  '用户未能作答',
  '完成这个节点',
  '继续深入这个节点',
  '给我提示',
  '给我答案',
  '继续问我一个类似问题',
  '下一层级',
  '结束这个节点',
])

function isCognitiveLevel(value: unknown): value is CognitiveLevel {
  return typeof value === 'string' && COGNITIVE_LEVELS.includes(value as CognitiveLevel)
}

function isSupportUsed(value: unknown): value is SupportUsed {
  return typeof value === 'string' && VALID_SUPPORT_USED.includes(value as SupportUsed)
}

function getEffectiveLevel(
  requestedLevel: CognitiveLevel | undefined,
  suitableLevels: CognitiveLevel[] = COGNITIVE_LEVELS
): CognitiveLevel {
  if (requestedLevel && isLevelSuitable(requestedLevel, suitableLevels)) return requestedLevel
  return COGNITIVE_LEVELS.find((level) => isLevelSuitable(level, suitableLevels)) ?? 'memory'
}

function getDerivedNextLevel(
  currentLevel: CognitiveLevel,
  nextAction: QuestionNextAction,
  suitableLevels: CognitiveLevel[] = COGNITIVE_LEVELS
): CognitiveLevel | undefined {
  if (nextAction === 'advance_next_level') {
    return getNextSuitableLevel(currentLevel, suitableLevels) ?? undefined
  }
  if (nextAction === 'offer_deep_dive') {
    return getFirstDeepLevel(suitableLevels) ?? undefined
  }
  return undefined
}

function getLastAssistantQuestion(conversationHistory: ConversationTurn[]): string {
  return [...conversationHistory].reverse().find((turn) => turn.role === 'assistant')?.content ?? ''
}

function hasRecentDiagnosticUserAnswer(conversationHistory: ConversationTurn[]): boolean {
  const lastUserAnswer = [...conversationHistory].reverse()
    .find((turn) => turn.role === 'user')
    ?.content
    .trim()

  return Boolean(lastUserAnswer && !NON_DIAGNOSTIC_USER_MESSAGES.has(lastUserAnswer))
}

function buildFallbackReply({
  node,
  conversationHistory,
  currentLevel,
  passedCurrentLevel,
  nextAction,
  requestType,
}: {
  node: KnowledgeNode
  conversationHistory: ConversationTurn[]
  currentLevel: CognitiveLevel
  passedCurrentLevel: boolean
  nextAction: QuestionNextAction
  requestType: QuestionRequestType
}): string {
  if (requestType === 'hint') {
    return `可以先抓住两个线索：它在材料里解决的核心问题是什么，以及材料给出的证据片段里哪些词能支撑这个判断。你先不用答完整，先说你认为最关键的一点。`
  }

  if (requestType === 'answer') {
    return `这一层可以这样答：${node.name} 在材料里的重点是「${node.context}」，证据是「${node.sourceExcerpt}」。不过看过答案不算独立通过，接下来我会换个角度让你重新判断。`
  }

  if (conversationHistory.length === 0) {
    return `好，我们开始。先聊聊「${node.name}」：你能用自己的话说说它在这份材料里主要解决什么问题吗？`
  }

  if (passedCurrentLevel && nextAction === 'offer_deep_dive') {
    return `这一层可以，通过快速路径已经够稳了。这个节点可以先完成，也可以继续深入到分析和评价层；你想继续深入吗？`
  }

  if (passedCurrentLevel && nextAction === 'complete_node') {
    return `这一层可以，这个节点先到这里就够了。`
  }

  if (passedCurrentLevel) {
    return `这一层基本过了。我们往下一层走：你能把「${node.name}」换成一个更具体的场景，再说明它怎么发挥作用吗？`
  }

  if (currentLevel === 'application') {
    return `这里还没有真正落到场景里。换个具体情境：如果你正在处理材料里类似的问题，你会在哪一步用到「${node.name}」，为什么？`
  }

  if (DEEP_PATH_LEVELS.includes(currentLevel)) {
    return `这里的推理还不够清楚。你先拆一层：这个概念成立需要哪个关键条件？如果这个条件不存在，你的判断还成立吗？`
  }

  return `这里还不够稳。你先别复述材料原句，换成自己的话说说「${node.name}」到底在处理什么问题。`
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
  const suitableLevels = input.node.suitableLevels ?? COGNITIVE_LEVELS
  const currentLevel = getEffectiveLevel(input.currentLevel ?? parsed.currentLevel, suitableLevels)
  const supportUsed = requestType === 'hint'
    ? 'hint'
    : requestType === 'answer'
      ? 'answer'
      : isSupportUsed(parsed.supportUsed)
        ? parsed.supportUsed
        : 'none'
  const passedCurrentLevel = requestType === 'normal'
    && hasRecentDiagnosticUserAnswer(input.conversationHistory)
    && parsed.passedCurrentLevel === true
  const nextAction = requestType === 'normal'
    ? getNextActionForLevelResult({
        currentLevel,
        levelPassed: passedCurrentLevel,
        suitableLevels,
      })
    : 'continue_current_level'
  const nextLevel = getDerivedNextLevel(currentLevel, nextAction, suitableLevels)
  const reply = cleanReply(typeof parsed.reply === 'string' && parsed.reply.trim()
    ? parsed.reply.trim()
    : buildFallbackReply({
        node: input.node,
        conversationHistory: input.conversationHistory,
        currentLevel,
        passedCurrentLevel,
        nextAction,
        requestType,
      }))

  const response: DiagnosticQuestionResponse = {
    question: reply,
    reply,
    currentLevel,
    passedCurrentLevel,
    nextAction,
    blindSpotSummary: typeof parsed.blindSpotSummary === 'string'
      ? parsed.blindSpotSummary.trim()
      : '',
    supportUsed,
    ...(nextLevel ? { nextLevel } : {}),
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
    question: typeof obj.question === 'string' ? obj.question : undefined,
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
    supportUsed: isSupportUsed(obj.supportUsed) ? obj.supportUsed : undefined,
    nextLevel: isCognitiveLevel(obj.nextLevel) ? obj.nextLevel : undefined,
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
适用层级：${(input.node.suitableLevels ?? COGNITIVE_LEVELS).join(', ')}
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
