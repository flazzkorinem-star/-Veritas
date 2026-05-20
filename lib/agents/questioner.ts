import { chat, Message, MODEL_FAST } from '../llm'
import { KnowledgeNode, ConversationTurn, QuestionResponse } from '../types'
import { extractJSON } from '../parseJSON'
import { countUserAnswers } from '../examFlow'

const SYSTEM_PROMPT = `你是一个苏格拉底式知识检验官。你的唯一任务是通过追问暴露用户对某个概念的真实理解程度，不是讲课。

严格规则：
- 绝对禁止解释概念
- 绝对禁止给出答案或提示
- 绝对禁止确认用户的回答是否正确
- 绝对禁止判断是否结束当前节点
- 每次只问一个问题
- 语气温和、口语化，像朋友在好奇地询问
- 默认用简体中文提问。材料是英文时也优先用中文提问，可保留必要英文术语。
- 问题必须基于用户上一轮回答动态生成，避免重复问“你怎么理解”或“有什么场景”。
- 第一问必须使用“好，我们开始。先聊聊 [节点名]——...”的开场。
- 从第二轮起可以使用“好的”“嗯”等中性确认语。

追问策略：
- 回答很短或空泛：要求用户把一个词具体化，或让用户给出判断依据
- 只背定义：追问背后的机制、因果链或关键条件
- 举例但不解释机制：追问为什么这个例子符合该概念
- 看似理解：给一个边界条件、反例或相邻概念比较
- 出现矛盾或误区：用反事实问题逼近，例如“如果条件 X 不成立，你的说法还成立吗？”
- 如果用户上一轮回答是“用户未能作答”，下一问必须留在理解层，用更简单的方式重新追问，不要引用“刚才提到”。

输出格式（严格JSON，不要输出任何其他内容）：
{ "question": "你的问题" }`

const MAX_LLM_ATTEMPTS = 2
const INITIAL_CONFIRMATION_PREFIX = /^(?:好的|好|嗯嗯|嗯|行|可以|ok)[，,、。\s!！]*/i

/**
 * Three-tier parsing strategy:
 * 1. Valid JSON object with a question field → use directly
 * 2. JSON string literal (model wrapped text in quotes) → use the string as question
 * 3. Plain text fallback (model ignored JSON format) → use raw text as question
 */
export function parseQuestionerResponse(raw: string): QuestionResponse {
  try {
    const parsed = JSON.parse(extractJSON(raw))

    // Tier 1: proper {"question": "..."}
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>
      return {
        question: typeof obj.question === 'string' ? obj.question : '',
      }
    }

    // Tier 2: model returned a JSON string literal e.g. "你的问题是..."
    if (typeof parsed === 'string' && parsed.trim().length > 0) {
      return { question: parsed.trim() }
    }
  } catch {
    // JSON parse failed — fall through to text fallback
  }

  // Tier 3: plain text — strip surrounding quotes and use as-is
  const text = raw.trim().replace(/^["'`]+|["'`]+$/g, '').trim()
  if (text.length > 0) {
    return { question: text }
  }

  throw new Error(`Questioner returned unusable response: ${raw.slice(0, 200)}`)
}

export function enforceQuestionPolicy(
  response: QuestionResponse,
  node: KnowledgeNode,
  conversationHistory: ConversationTurn[]
): QuestionResponse {
  const userAnswerCount = conversationHistory.filter((turn) => turn.role === 'user').length
  const question = response.question.trim()

  if (question) {
    if (userAnswerCount === 0 && !question.includes('好，我们开始。先聊聊')) {
      const openingQuestion = question.replace(INITIAL_CONFIRMATION_PREFIX, '')
      return { question: `好，我们开始。先聊聊「${node.name}」——${openingQuestion}` }
    }
    return { question }
  }

  const lastUserAnswer = [...conversationHistory].reverse().find((turn) => turn.role === 'user')?.content
  if (userAnswerCount === 0) {
    return { question: `好，我们开始。先聊聊「${node.name}」——你能用自己的话说说它解决的核心问题是什么吗？` }
  }

  if (lastUserAnswer === '用户未能作答') {
    return { question: `我们先放简单一点：你觉得「${node.name}」大概是在处理什么问题？` }
  }

  return { question: `好的，能再具体一点说说「${node.name}」在什么情况下会有用吗？` }
}

export async function getNextQuestion(
  node: KnowledgeNode,
  conversationHistory: ConversationTurn[]
): Promise<QuestionResponse> {
  if (countUserAnswers(conversationHistory) >= 3) {
    return { question: '' }
  }

  const historyMessages: Message[] = conversationHistory.map((turn) => ({
    role: turn.role,
    content: turn.content,
  }))

  const lastUserAnswer = [...conversationHistory].reverse().find((turn) => turn.role === 'user')?.content || ''
  const askedQuestions = conversationHistory
    .filter((turn) => turn.role === 'assistant')
    .map((turn) => turn.content)
    .join('\n')

  const userContext = `当前检验的知识节点：「${node.name}」
该概念在文档中的使用方式：${node.context}
材料依据片段：${node.sourceExcerpt}
已进行用户回答轮数：${conversationHistory.filter((turn) => turn.role === 'user').length}
用户上一轮回答：${lastUserAnswer}
已经问过的问题，避免重复：
${askedQuestions}`

  for (let attempt = 0; attempt < MAX_LLM_ATTEMPTS; attempt++) {
    try {
      const raw = await chat(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContext },
          ...historyMessages,
        ],
        { jsonMode: true, temperature: 0.4, model: MODEL_FAST }
      )
      return enforceQuestionPolicy(parseQuestionerResponse(raw), node, conversationHistory)
    } catch {
      if (attempt === MAX_LLM_ATTEMPTS - 1) {
        return enforceQuestionPolicy({ question: '' }, node, conversationHistory)
      }
    }
  }

  return enforceQuestionPolicy({ question: '' }, node, conversationHistory)
}
