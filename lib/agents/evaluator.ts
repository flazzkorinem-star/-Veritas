import { chat, MODEL_FAST } from '../llm'
import {
  CognitiveLevel,
  ExamReport,
  KnowledgeNode,
  LevelStatus,
  NodeConversation,
  NodeEvaluation,
  NodeLevelState,
  SupportKind,
} from '../types'
import { calculateOverallScore, calculateQuickPathScore } from '../score'
import { extractJSON } from '../parseJSON'

const LEVELS: CognitiveLevel[] = [
  'memory',
  'understanding',
  'application',
  'analysis',
  'evaluation',
  'creation',
]

const SUPPORT_KINDS: SupportKind[] = ['hint', 'answer', 'analogy']
const NON_DIAGNOSTIC_USER_MESSAGES = new Set([
  '用户未能作答',
  '完成这个节点',
  '继续深入这个节点',
])

const SYSTEM_PROMPT = `你是 Veritas 的 Agent 3：个人化诊断报告生成器。
你只根据材料证据、用户真实对话、层级状态和支持记录生成报告。

任务：
- 说明每个知识节点的层级通过情况。
- 引用用户真实原话作为 evidenceQuotes；不能编造用户没说过的话。
- 指出具体盲点，不写泛泛学习鸡汤。
- 说明是否使用提示、答案、主动类比。
- 给出正确理解和下一步怎么补。
- 不把分数当作核心结论；即使你输出 score，也会被本地代码覆盖。
- 不主动扩展材料外的新知识点作为诊断对象。

只输出 JSON：
{
  "summary": "一句话主要盲点摘要",
  "nodes": [
    {
      "nodeId": "string",
      "nodeName": "string",
      "sourceExcerpt": "string",
      "levelStatus": {
        "memory": "not_started | in_progress | passed | failed | not_applicable",
        "understanding": "not_started | in_progress | passed | failed | not_applicable",
        "application": "not_started | in_progress | passed | failed | not_applicable",
        "analysis": "not_started | in_progress | passed | failed | not_applicable",
        "evaluation": "not_started | in_progress | passed | failed | not_applicable",
        "creation": "not_started | in_progress | passed | failed | not_applicable"
      },
      "evidenceQuotes": ["用户说过的原话"],
      "blindSpot": "具体盲点",
      "supportUsed": { "hint": false, "answer": false, "analogy": false },
      "correctUnderstanding": "正确理解",
      "nextStep": "下一步怎么补",
      "score": 0
    }
  ],
  "overallScore": 0
}`

export interface EvaluationInput {
  nodeConversations: NodeConversation[]
  nodeLevelStates?: Record<string, NodeLevelState[]>
}

function isLevelStatus(value: unknown): value is LevelStatus {
  return (
    value === 'not_started'
    || value === 'in_progress'
    || value === 'passed'
    || value === 'failed'
    || value === 'not_applicable'
  )
}

function emptySupportUsed(): Record<SupportKind, boolean> {
  return { hint: false, answer: false, analogy: false }
}

function getLevelStates(
  nodeId: string,
  nodeLevelStates?: Record<string, NodeLevelState[]>
): NodeLevelState[] {
  return nodeLevelStates?.[nodeId] ?? []
}

function buildLevelStatus(
  node: KnowledgeNode,
  states: NodeLevelState[],
  modelStatus?: unknown
): Record<CognitiveLevel, LevelStatus> {
  const status = Object.fromEntries(
    LEVELS.map((level) => [
      level,
      node.suitableLevels && !node.suitableLevels.includes(level)
        ? 'not_applicable'
        : 'not_started',
    ])
  ) as Record<CognitiveLevel, LevelStatus>

  if (states.length > 0) {
    states.forEach((state) => {
      status[state.level] = state.status
    })
    return status
  }

  if (modelStatus && typeof modelStatus === 'object') {
    const raw = modelStatus as Record<string, unknown>
    LEVELS.forEach((level) => {
      if (status[level] !== 'not_applicable' && isLevelStatus(raw[level])) {
        status[level] = raw[level]
      }
    })
  }

  return status
}

function buildSupportUsed(
  states: NodeLevelState[],
  modelSupport?: unknown
): Record<SupportKind, boolean> {
  const supportUsed = emptySupportUsed()

  states.forEach((state) => {
    state.supportRecords?.forEach((record) => {
      supportUsed[record.kind] = true
    })
  })

  if (states.length > 0) return supportUsed

  if (modelSupport && typeof modelSupport === 'object') {
    const raw = modelSupport as Record<string, unknown>
    SUPPORT_KINDS.forEach((kind) => {
      supportUsed[kind] = raw[kind] === true
    })
  }

  return supportUsed
}

function getUserTurns(conversation?: NodeConversation): string[] {
  return conversation?.turns
    .filter((turn) => turn.role === 'user')
    .map((turn) => turn.content.trim())
    .filter((turn) => Boolean(turn) && !NON_DIAGNOSTIC_USER_MESSAGES.has(turn)) ?? []
}

function getStateQuotes(states: NodeLevelState[]): string[] {
  return states
    .map((state) => state.userQuote?.trim())
    .filter((quote): quote is string => Boolean(quote))
}

function quoteExistsInUserTurns(quote: string, userTurns: string[]): boolean {
  return userTurns.some((turn) => turn.includes(quote))
}

function normalizeEvidenceQuotes(
  modelQuotes: unknown,
  userTurns: string[],
  states: NodeLevelState[]
): string[] {
  const candidates = [
    ...(Array.isArray(modelQuotes) ? modelQuotes : []),
    ...getStateQuotes(states),
  ]

  return Array.from(new Set(
    candidates
      .filter((quote): quote is string => typeof quote === 'string')
      .map((quote) => quote.trim())
      .filter((quote) => quote.length > 0 && quoteExistsInUserTurns(quote, userTurns))
  ))
}

function firstBlindSpot(states: NodeLevelState[]): string {
  return states
    .map((state) => state.blindSpotSummary?.trim())
    .find((summary) => Boolean(summary)) ?? ''
}

function makeNodeEvaluation({
  rawNode,
  conversation,
  states,
}: {
  rawNode: Record<string, unknown>
  conversation: NodeConversation
  states: NodeLevelState[]
}): NodeEvaluation {
  const userTurns = getUserTurns(conversation)
  const score = calculateQuickPathScore(states)
  const blindSpot = typeof rawNode.blindSpot === 'string' && rawNode.blindSpot.trim()
    ? rawNode.blindSpot.trim()
    : firstBlindSpot(states)
  const correctUnderstanding = typeof rawNode.correctUnderstanding === 'string' && rawNode.correctUnderstanding.trim()
    ? rawNode.correctUnderstanding.trim()
    : ''
  const nextStep = typeof rawNode.nextStep === 'string' && rawNode.nextStep.trim()
    ? rawNode.nextStep.trim()
    : ''

  return {
    nodeId: typeof rawNode.nodeId === 'string' && rawNode.nodeId ? rawNode.nodeId : conversation.node.id,
    nodeName: typeof rawNode.nodeName === 'string' && rawNode.nodeName ? rawNode.nodeName : conversation.node.name,
    sourceExcerpt: typeof rawNode.sourceExcerpt === 'string' && rawNode.sourceExcerpt
      ? rawNode.sourceExcerpt
      : conversation.node.sourceExcerpt,
    levelStatus: buildLevelStatus(conversation.node, states, rawNode.levelStatus),
    evidenceQuotes: normalizeEvidenceQuotes(rawNode.evidenceQuotes, userTurns, states),
    blindSpot,
    supportUsed: buildSupportUsed(states, rawNode.supportUsed),
    correctUnderstanding,
    nextStep,
    score,
  }
}

export function parseEvaluatorResponse(
  raw: string,
  input: EvaluationInput
): ExamReport {
  let parsed: unknown
  try {
    parsed = JSON.parse(extractJSON(raw))
  } catch {
    throw new Error(`Evaluator returned invalid JSON: ${raw.slice(0, 200)}`)
  }

  const obj = parsed as Record<string, unknown>
  if (!Array.isArray(obj.nodes)) throw new Error('Evaluator response missing nodes array')

  const rawNodes = obj.nodes as Array<Record<string, unknown>>
  const nodes = input.nodeConversations.map((conversation) => {
    const rawNode = rawNodes.find((item) => item.nodeId === conversation.node.id)
      ?? rawNodes.find((item) => item.nodeName === conversation.node.name)
      ?? {}
    return makeNodeEvaluation({
      rawNode,
      conversation,
      states: getLevelStates(conversation.node.id, input.nodeLevelStates),
    })
  })

  return {
    nodes,
    overallScore: calculateOverallScore(nodes),
    summary: typeof obj.summary === 'string' && obj.summary.trim()
      ? obj.summary.trim()
      : buildFallbackSummary(nodes),
  }
}

function buildFallbackSummary(nodes: NodeEvaluation[]): string {
  return nodes.find((node) => node.blindSpot)?.blindSpot ?? '模型报告暂时不可用。'
}

function buildFallbackReport(input: EvaluationInput): ExamReport {
  const nodes = input.nodeConversations.map((conversation) => {
    const states = getLevelStates(conversation.node.id, input.nodeLevelStates)
    const score = calculateQuickPathScore(states)
    const blindSpot = firstBlindSpot(states)
    return {
      nodeId: conversation.node.id,
      nodeName: conversation.node.name,
      sourceExcerpt: conversation.node.sourceExcerpt,
      levelStatus: buildLevelStatus(conversation.node, states),
      evidenceQuotes: [],
      blindSpot,
      supportUsed: buildSupportUsed(states),
      correctUnderstanding: '',
      nextStep: '',
      score,
    } satisfies NodeEvaluation
  })

  return {
    nodes,
    overallScore: calculateOverallScore(nodes),
    summary: buildFallbackSummary(nodes),
  }
}

function formatInputForPrompt(input: EvaluationInput): string {
  const nodeLevelStates = Object.fromEntries(
    Object.entries(input.nodeLevelStates ?? {}).map(([nodeId, states]) => [
      nodeId,
      states.map((state) => ({
        level: state.level,
        status: state.status,
        blindSpotSummary: state.blindSpotSummary,
        userQuote: state.userQuote,
        supportRecords: state.supportRecords?.map((record) => ({
          kind: record.kind,
          level: record.level,
        })),
      })),
    ])
  )

  return JSON.stringify({
    nodeConversations: input.nodeConversations,
    nodeLevelStates,
  }, null, 2)
}

export async function evaluateConversations(
  input: EvaluationInput
): Promise<ExamReport> {
  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    {
      role: 'user' as const,
      content: `请基于以下 v3.0 诊断数据生成报告。必须只引用用户真实原话。\n\n${formatInputForPrompt(input)}`,
    },
  ]
  const opts = { jsonMode: true, temperature: 0.2, model: MODEL_FAST, maxTokens: 2600, timeoutMs: 22_000 }

  const attempt = async () => {
    const raw = await chat(messages, opts)
    return parseEvaluatorResponse(raw, input)
  }

  try {
    return await attempt()
  } catch {
    try {
      return await attempt()
    } catch {
      return buildFallbackReport(input)
    }
  }
}
