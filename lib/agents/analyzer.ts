import { chat, MODEL_FAST } from '../llm'
import { CognitiveLevel, KnowledgeNode } from '../types'
import { randomUUID } from 'crypto'
import { extractJSON } from '../parseJSON'

const COGNITIVE_LEVELS: readonly CognitiveLevel[] = [
  'memory',
  'understanding',
  'application',
  'analysis',
  'evaluation',
  'creation',
] as const

export type AnalyzerKnowledgeNode = Omit<KnowledgeNode, 'suitableLevels' | 'priorityReason'> & {
  suitableLevels: CognitiveLevel[]
  priorityReason: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isCognitiveLevel(level: unknown): level is CognitiveLevel {
  return typeof level === 'string' && (COGNITIVE_LEVELS as readonly string[]).includes(level)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readSuitableLevels(value: unknown): CognitiveLevel[] {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(new Set(value.filter(isCognitiveLevel)))
}

const SYSTEM_PROMPT = `你是 Veritas 的 Agent 1：节点分析师。给定一段学习内容，只提取高诊断价值知识节点，不做泛泛总结。

选择标准：
- 单次最多 8 个节点；材料少就少抽，不为了凑数降低质量
- 优先选择核心概念和定义、容易混淆的对比点、能迁移到场景应用的问题、容易暴露推理断点的机制/因果链/决策点
- 避免纯背景描述、孤立事实、过细或诊断价值低的内容
- 只围绕材料中出现或明确暗示的概念
- 不生成对话问题，不评价用户，不扩展成课程大纲
- 每个节点必须有材料证据片段、适用层级和优先级理由；如果材料不足以支撑高价值节点，可以少于 8 个，哪怕只有 1 个

suitableLevels 必须使用以下英文标识，对应认知层级：
- memory（记忆）
- understanding（理解）
- application（应用）
- analysis（分析）
- evaluation（评价）
- creation（创造）

用JSON格式回复：
{
  "nodes": [
    {
      "id": "唯一id",
      "name": "节点名称",
      "context": "一句话说明这个节点为什么值得诊断",
      "sourceExcerpt": "材料中能证明该节点的证据片段，直接引用1-3句话",
      "suitableLevels": ["memory", "understanding", "application"],
      "priorityReason": "为什么优先诊断这个节点"
    }
  ]
}`

const MAX_ANALYZER_ATTEMPTS = 2

export function parseAnalyzerResponse(raw: string): AnalyzerKnowledgeNode[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(extractJSON(raw))
  } catch {
    throw new Error(`Analyzer returned invalid JSON: ${raw.slice(0, 200)}`)
  }

  const obj = parsed as Record<string, unknown>
  if (!Array.isArray(obj.nodes)) {
    throw new Error('Analyzer response missing "nodes" array')
  }

  if (obj.nodes.length === 0) {
    throw new Error('Analyzer response returned no knowledge nodes')
  }

  const nodes = obj.nodes
    .slice(0, 8)
    .map((n) => {
      if (!isRecord(n)) {
        return null
      }

      const name = readString(n.name)
      const context = readString(n.context)
      const sourceExcerpt = readString(n.sourceExcerpt) || readString(n.evidence)
      const suitableLevels = readSuitableLevels(n.suitableLevels)
      const priorityReason = readString(n.priorityReason)

      if (!name || !context || !sourceExcerpt || suitableLevels.length === 0 || !priorityReason) {
        return null
      }

      return {
        id: readString(n.id) || randomUUID(),
        name,
        context,
        sourceExcerpt,
        suitableLevels,
        priorityReason,
      }
    })
    .filter((node): node is AnalyzerKnowledgeNode => node !== null)

  if (nodes.length === 0) {
    throw new Error('Analyzer response returned no usable knowledge nodes')
  }

  return nodes
}

export async function analyzeContent(content: string): Promise<AnalyzerKnowledgeNode[]> {
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_ANALYZER_ATTEMPTS; attempt++) {
    try {
      const raw = await chat(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `请分析以下学习内容：\n\n${content}` },
        ],
        { jsonMode: true, temperature: 0.3, model: MODEL_FAST }
      )
      return parseAnalyzerResponse(raw)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError
}
