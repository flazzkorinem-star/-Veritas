import { chat, MODEL_FAST } from '../llm'
import { NodeConversation, ExamReport, NodeEvaluation } from '../types'
import { calculateNodeScore, calculateOverallScore } from '../score'
import { extractJSON } from '../parseJSON'

const SYSTEM_PROMPT = `你是一个诚实的知识评估专家。分析苏格拉底式对话记录，对每个知识节点给出准确评估。

掌握等级定义：
- "mastered"：用户能清晰解释、举例，追问时也能应对
- "developing"：核心方向对，但追问时说不深，有明显缺失
- "needs_work"：第一轮就答不到点上，或只能重复定义

误解标记规则：
- 只有用户说出明确错误的表述时，才允许设 hasMisconception: true
- 回答模糊、不完整、太浅、空回答、说“不知道”，都不得标记为误解，只能影响 masteryLevel
- hasMisconception 为 true 时，必须提供 misconceptionQuote，且必须精确引用用户原话
- misconceptionCorrection：正确的理解是什么

正确解释规则：
- developing 和 needs_work 的节点必须提供 explanation（正确理解）
- mastered 且无误解的节点不需要 explanation
- 如果 explanation 或 misconceptionCorrection 超出材料依据片段中的信息，必须设 isSupplementalExplanation: true；否则设 false

绝对禁止：
- 模糊的表扬（"理解得不错"、"基本正确"）
- 没有原话引用的误解标记
- 输出学习建议、练习动作、下一步行动

用JSON格式回复：
{
  "nodes": [
    {
      "nodeId": "string",
      "nodeName": "string",
      "masteryLevel": "mastered" | "developing" | "needs_work",
      "hasMisconception": boolean,
      "misconceptionQuote": "string（可选）",
      "misconceptionCorrection": "string（可选）",
      "explanation": "string（可选，developing/needs_work必填）",
      "isSupplementalExplanation": boolean,
      "score": number
    }
  ],
  "overallScore": number,
  "summary": "一段话总结整体表现和需要重点复习的节点，不要给具体练习动作"
}`

const REPORT_LANGUAGE_AND_CONTENT_RULES = `
补充规则，优先级高于前面的所有规则：
1. 所有面向用户展示的字段必须使用简体中文：summary、evidenceSummary、explanation、misconceptionCorrection。
2. 如果材料原文是英文，只能在 sourceExcerpt 证据中保留英文；你的分析和解释必须是中文。
3. 每个节点都必须输出 evidenceSummary：说明为什么这样判定，依据用户回答，不要只复制材料原文。
4. developing 和 needs_work 必须输出 explanation：用中文说明正确理解。
5. 每个节点都必须输出 isSupplementalExplanation；只有正确解释超出材料依据片段时才设为 true。
6. 不要输出学习建议、练习动作或行动计划字段；summary 只能概括哪些节点需要重点复习。
7. mastered 节点也要输出 evidenceSummary，不能只显示材料依据。
8. 不要输出空泛评价，例如“理解不错”“基本正确”。`

export function parseEvaluatorResponse(
  raw: string,
  nodeConversations: NodeConversation[] = []
): ExamReport {
  let parsed: unknown
  try {
    parsed = JSON.parse(extractJSON(raw))
  } catch {
    throw new Error(`Evaluator returned invalid JSON: ${raw.slice(0, 200)}`)
  }
  const obj = parsed as Record<string, unknown>
  if (!Array.isArray(obj.nodes)) throw new Error('Evaluator response missing nodes array')

  const sourceById = new Map(nodeConversations.map((nc) => [nc.node.id, nc.node.sourceExcerpt]))
  const sourceByName = new Map(nodeConversations.map((nc) => [nc.node.name, nc.node.sourceExcerpt]))

  const nodes = (obj.nodes as Array<Record<string, unknown>>).map((node) => {
    const nodeId = typeof node.nodeId === 'string' ? node.nodeId : ''
    const nodeName = typeof node.nodeName === 'string' ? node.nodeName : ''
    const misconceptionQuote = typeof node.misconceptionQuote === 'string'
      ? node.misconceptionQuote.trim()
      : ''
    const hasMisconception = node.hasMisconception === true && misconceptionQuote.length > 0
    const normalizedNode: NodeEvaluation = {
      nodeId,
      nodeName,
      sourceExcerpt: (typeof node.sourceExcerpt === 'string' && node.sourceExcerpt)
        || sourceById.get(nodeId)
        || sourceByName.get(nodeName),
      masteryLevel: node.masteryLevel as NodeEvaluation['masteryLevel'],
      hasMisconception,
      misconceptionQuote: hasMisconception ? misconceptionQuote : undefined,
      misconceptionCorrection: hasMisconception && typeof node.misconceptionCorrection === 'string'
        ? node.misconceptionCorrection
        : undefined,
      explanation: typeof node.explanation === 'string' ? node.explanation : undefined,
      isSupplementalExplanation: node.isSupplementalExplanation === true,
      evidenceSummary: typeof node.evidenceSummary === 'string' ? node.evidenceSummary : '',
      score: calculateNodeScore(node.masteryLevel as NodeEvaluation['masteryLevel'], hasMisconception),
    }
    return normalizedNode
  })
  return {
    nodes,
    overallScore: calculateOverallScore(nodes),
    summary: (obj.summary as string) || '',
  }
}

export async function evaluateConversations(
  nodeConversations: NodeConversation[]
): Promise<ExamReport> {
  const dialogueSummary = nodeConversations
    .map((nc) => {
      const turns = nc.turns
        .map((t) => `${t.role === 'assistant' ? 'AI提问' : '用户回答'}: ${t.content}`)
        .join('\n')
      return `【知识节点：${nc.node.name}（${nc.node.context}）】
材料依据片段：${nc.node.sourceExcerpt}
${turns}`
    })
    .join('\n\n---\n\n')

  const messages = [
    { role: 'system' as const, content: `${SYSTEM_PROMPT}\n\n${REPORT_LANGUAGE_AND_CONTENT_RULES}` },
    { role: 'user' as const, content: `请评估以下苏格拉底式对话记录。报告面向中文用户，即使材料片段是英文，也请用中文解释判断理由和正确理解。不要输出学习建议或具体练习动作。\n\n${dialogueSummary}` },
  ]
  const opts = { jsonMode: true, temperature: 0.2, model: MODEL_FAST, maxTokens: 2200, timeoutMs: 22_000 }

  const attempt = async () => {
    const raw = await chat(messages, opts)
    return parseEvaluatorResponse(raw, nodeConversations)
  }

  try {
    return await attempt()
  } catch {
    return attempt()
  }
}
