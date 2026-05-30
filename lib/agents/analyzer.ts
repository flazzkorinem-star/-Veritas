import { chat, MODEL_FAST } from '../llm'
import { KnowledgeNode } from '../types'
import { randomUUID } from 'crypto'
import { extractJSON } from '../parseJSON'

export type AnalyzerKnowledgeNode = Omit<KnowledgeNode, 'priorityReason'> & {
  priorityReason: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

const SYSTEM_PROMPT = `你是 Veritas 的 Agent 1：节点分析师。给定一段学习内容，只提取高诊断价值知识节点，不做泛泛总结。

每个节点都会被统一按四层诊断：记忆→理解→应用→分析。所以只选能完整支撑这四层追问的概念。

选择标准：
- 单次最多 8 个节点，宁少勿滥；材料少就少抽，不为了凑数降低质量
- 每个节点必须能撑起记忆、理解、应用、分析四层追问；撑不满四层的内容不要选
- 优先选择核心概念和定义、容易混淆的对比点、能迁移到场景应用的问题、容易暴露推理断点的机制/因果链/决策点
- 避免纯背景描述、孤立事实、过细或诊断价值低的内容
- 只围绕材料中出现或明确暗示的概念
- 不生成对话问题，不评价用户，不扩展成课程大纲
- 材料很大时也只保留最值得诊断的重点，不超过 8 个；材料不足以支撑高价值节点时可以少于 8 个，哪怕只有 1 个

用JSON格式回复：
{
  "nodes": [
    {
      "id": "唯一id",
      "name": "节点名称",
      "context": "一句话说明这个节点为什么值得诊断",
      "sourceExcerpt": "材料中能证明该节点的证据片段，直接引用1-3句话",
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
      const priorityReason = readString(n.priorityReason)

      if (!name || !context || !sourceExcerpt || !priorityReason) {
        return null
      }

      return {
        id: readString(n.id) || randomUUID(),
        name,
        context,
        sourceExcerpt,
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
