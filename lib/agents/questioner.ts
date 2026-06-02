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

// 判官：只做语义判定，输出小 JSON。和对话分开，避免「既陪聊又套格式」导致 content 空白。
const ASSESSOR_PROMPT = `你是知识检验的判定器。依据对话历史和用户最近一条消息，判断用户在当前认知层级的表现。
先判断用户最近这条消息是不是在回答当前知识问题：闲聊、打招呼、元问题、答非所问都算「不是」。
只有确实在作答、且达到当前层级标准时，passedCurrentLevel 才为 true；否则为 false。
层级标准：memory=能识别概念或说出基本定义；understanding=能用自己的话解释；application=能放进具体场景说明怎么用；analysis=能拆出机制/因果/边界/对比。
只输出严格 JSON，不要输出额外文本：
{
  "isAnsweringCurrentQuestion": false,
  "passedCurrentLevel": false,
  "blindSpotSummary": "盲点摘要，没有则写空字符串"
}`

// 对话：纯自然语言，不套 JSON。给身份 + 目标，靠常识泛化，不枚举场景。
const CONVERSATION_PROMPT = `你是 Veritas 的知识检验家教。像真人家教一样和学生对话：他理解了就真诚鼓励，没理解就帮他，可以追问、反馈、换角度、给类比。
只服务当前节点和当前层级，不扩展无关知识点；可以构造场景和类比，但必须服务材料里的概念。
主线永远是知识检验。学生说题外话时，像朋友一样自然承接一两句，再把话题拉回当前知识点，既不无视也不扯远。
用自然的话表达，不要向学生播报层级名称、推进动作等内部状态。`

const MAX_LLM_ATTEMPTS = 2
// 仅用于识别「提示/答案」按钮的流程控制文本（UI 语义），与判官的「是否在作答」语义判断不同。
const FLOW_CONTROL_MESSAGES = new Set([
  '给我提示',
  '给我答案',
])

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

// 是否需要跑判官：只有 normal 且最后一条用户消息是真实文本（不是提示/答案按钮）。
// 「这条是不是在作答」的语义判断交给判官，这里只做按钮流程控制的过滤。
function hasRecentDiagnosticUserAnswer(conversationHistory: ConversationTurn[]): boolean {
  const lastUserAnswer = getLastUserMessage(conversationHistory)
  return Boolean(lastUserAnswer && !FLOW_CONTROL_MESSAGES.has(lastUserAnswer))
}

function cleanReply(text: string): string {
  return text.replace(/[—–]+/g, '，')
}

// 对话调用失败时的本地兜底：按场景生成，绝不复读用户原话、不暴露解析错误。
function nextLevelFallbackQuestion(node: KnowledgeNode, nextLevel: CognitiveLevel | null): string {
  switch (nextLevel) {
    case 'understanding':
      return `这个点你说清楚了。那你能用自己的话，解释一下「${node.name}」吗？`
    case 'application':
      return `掌握得不错。能不能举一个具体场景，说说「${node.name}」是怎么用的？`
    case 'analysis':
      return `很好。我们再深入一层：「${node.name}」的机制、因果或边界是什么？`
    default:
      return `这个点你说清楚了。关于「${node.name}」，你还能再补充些什么？`
  }
}

function buildFallbackReply({
  node,
  conversationHistory,
  requestType,
  currentLevel,
  nextAction,
}: {
  node: KnowledgeNode
  conversationHistory: ConversationTurn[]
  requestType: QuestionRequestType
  currentLevel: CognitiveLevel
  nextAction: QuestionNextAction
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
  if (nextAction === 'advance_next_level') {
    // 通过后必须抛出下一层问题：hook 只推进层级、不会自动补下一题，否则用户卡住。
    return nextLevelFallbackQuestion(node, getNextSuitableLevel(currentLevel))
  }
  if (nextAction === 'complete_node') {
    return `「${node.name}」这个点我们就聊到这里。`
  }
  return `我们再聊聊「${node.name}」这个点，你是怎么理解的？`
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

interface Assessment {
  passed: boolean
  blindSpot: string
}

function buildAssessorContext(
  node: KnowledgeNode,
  currentLevel: CognitiveLevel,
  levelStates: NodeLevelState[]
): string {
  return `当前知识节点：${node.name}
节点说明：${node.context}
材料证据片段：${node.sourceExcerpt}
当前层级：${currentLevel}
层级状态：${JSON.stringify(levelStates)}`
}

function parseAssessment(raw: string): { passed: boolean; blindSpot: string; isAnswering: boolean } {
  const parsed = JSON.parse(extractJSON(raw))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Assessor response must be a JSON object')
  }
  const obj = parsed as Record<string, unknown>
  return {
    passed: obj.passedCurrentLevel === true,
    blindSpot: typeof obj.blindSpotSummary === 'string' ? obj.blindSpotSummary.trim() : '',
    isAnswering: obj.isAnsweringCurrentQuestion === true,
  }
}

// 判官调用：判定失败（含纯空白）重试至多 MAX_LLM_ATTEMPTS 次，全失败则安全降级为「未通过、无盲点」。
// 非作答（isAnswering=false）强制未通过且盲点为空，避免闲聊污染报告。
async function assessAnswer(
  node: KnowledgeNode,
  currentLevel: CognitiveLevel,
  levelStates: NodeLevelState[],
  historyMessages: Message[]
): Promise<Assessment> {
  const messages: Message[] = [
    { role: 'system', content: ASSESSOR_PROMPT },
    { role: 'user', content: buildAssessorContext(node, currentLevel, levelStates) },
    ...historyMessages,
  ]
  for (let attempt = 0; attempt < MAX_LLM_ATTEMPTS; attempt++) {
    try {
      const raw = await chat(messages, { jsonMode: true, temperature: 0.2, model: MODEL_FAST })
      const parsed = parseAssessment(raw)
      if (!parsed.isAnswering) return { passed: false, blindSpot: '' }
      return { passed: parsed.passed, blindSpot: parsed.blindSpot }
    } catch {
      // 解析失败 / 空白，进入下一次尝试
    }
  }
  return { passed: false, blindSpot: '' }
}

function buildDialogueContext({
  node,
  currentLevel,
  requestType,
  nextAction,
  blindSpotSummary,
}: {
  node: KnowledgeNode
  currentLevel: CognitiveLevel
  requestType: QuestionRequestType
  nextAction: QuestionNextAction
  blindSpotSummary: string
}): string {
  const lines = [
    `当前知识节点：${node.name}`,
    `节点说明：${node.context}`,
    `材料证据片段：${node.sourceExcerpt}`,
    `当前层级：${currentLevel}`,
    `请求类型：${requestType}`,
    `推进动作：${nextAction}`,
  ]
  const nextLevel = getNextSuitableLevel(currentLevel)
  if (nextAction === 'advance_next_level' && nextLevel) {
    lines.push(`下一层级：${nextLevel}，先自然地肯定已通过，再抛出下一层级的问题。`)
  }
  if (nextAction === 'continue_current_level') {
    lines.push('继续围绕当前层级追问或引导，不要宣布通过。')
  }
  if (nextAction === 'complete_node') {
    lines.push('本节点已检验完成，自然收尾即可，不要宣布「节点完成/生成报告」。')
  }
  if (requestType === 'hint') {
    lines.push('给切入点、思路或类比，但不要直接给出完整答案。')
  }
  if (requestType === 'answer') {
    lines.push('直接给出当前问题的完整答案，不要追问下一层。')
  }
  if (blindSpotSummary) {
    lines.push(`当前盲点：${blindSpotSummary}`)
  }
  return lines.join('\n')
}

// 对话调用：纯文本。抛错或返回纯空白（chat 不会对空白抛错）都走场景 fallback。
async function generateReply({
  node,
  conversationHistory,
  historyMessages,
  currentLevel,
  requestType,
  nextAction,
  blindSpotSummary,
}: {
  node: KnowledgeNode
  conversationHistory: ConversationTurn[]
  historyMessages: Message[]
  currentLevel: CognitiveLevel
  requestType: QuestionRequestType
  nextAction: QuestionNextAction
  blindSpotSummary: string
}): Promise<string> {
  const messages: Message[] = [
    { role: 'system', content: CONVERSATION_PROMPT },
    { role: 'user', content: buildDialogueContext({ node, currentLevel, requestType, nextAction, blindSpotSummary }) },
    ...historyMessages,
  ]
  try {
    const raw = await chat(messages, { jsonMode: false, temperature: 0.7, model: MODEL_FAST })
    if (raw.trim()) return cleanReply(raw.trim())
  } catch {
    // 走下面的场景 fallback
  }
  return cleanReply(buildFallbackReply({ node, conversationHistory, requestType, currentLevel, nextAction }))
}

export async function getNextQuestion(input: QuestionerInput): Promise<DiagnosticQuestionResponse> {
  const conversationHistory = input.conversationHistory ?? []
  const requestType = input.requestType ?? 'normal'
  const currentLevel = getEffectiveLevel(input.currentLevel)
  const historyMessages: Message[] = conversationHistory.map((turn) => ({
    role: turn.role,
    content: turn.content,
  }))

  // 1. 判官（语义判断），只有 normal 且最后一条是真实作答才跑。
  let passedCurrentLevel = false
  let blindSpotSummary = ''
  if (requestType === 'normal' && hasRecentDiagnosticUserAnswer(conversationHistory)) {
    const assessment = await assessAnswer(input.node, currentLevel, input.levelStates ?? [], historyMessages)
    passedCurrentLevel = assessment.passed
    blindSpotSummary = assessment.blindSpot
  }

  // 2. 确定性：层级推进动作。hint 不推进；answer 看答案后顺序推进；normal 按判官结果。
  const nextAction: QuestionNextAction = requestType === 'answer'
    ? (getNextSuitableLevel(currentLevel) ? 'advance_next_level' : 'complete_node')
    : requestType === 'hint'
      ? 'continue_current_level'
      : getNextActionForLevelResult({ currentLevel, levelPassed: passedCurrentLevel })

  // 3. 确定性：支持记录只来自按钮点击，不由 LLM 自报。
  const supportUsed: SupportUsed = requestType === 'hint'
    ? 'hint'
    : requestType === 'answer'
      ? 'answer'
      : 'none'

  // 4. 对话（自然语言），收到判定结果 + 推进动作，生成与状态一致的回复。
  const reply = await generateReply({
    node: input.node,
    conversationHistory,
    historyMessages,
    currentLevel,
    requestType,
    nextAction,
    blindSpotSummary,
  })

  const response: DiagnosticQuestionResponse = {
    reply,
    currentLevel,
    passedCurrentLevel,
    nextAction,
    blindSpotSummary,
    supportUsed,
  }
  const supportRecord = toSupportRecord(supportUsed, response, conversationHistory)
  return supportRecord ? { ...response, supportRecords: [supportRecord] } : response
}
