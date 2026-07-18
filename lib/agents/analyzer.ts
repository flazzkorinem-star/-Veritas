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
- 单次提取 1–15 个节点，15 是上限而不是目标；宁少勿滥，材料少就少抽，不为了凑数降低质量
- 每个节点必须能撑起记忆、理解、应用、分析四层追问；撑不满四层的内容不要选
- 优先选择核心概念和定义、容易混淆的对比点、能迁移到场景应用的问题、容易暴露推理断点的机制/因果链/决策点
- 避免纯背景描述、孤立事实、过细或诊断价值低的内容
- 只围绕材料中出现或明确暗示的概念
- 不生成对话问题，不评价用户，不扩展成课程大纲
- 材料很大时也只保留最值得诊断的重点，不超过 15 个；材料不足以支撑高价值节点时可以少于 15 个，哪怕只有 1 个
- 为每个入选节点分配 importance：只能是数值 1、2、3，数值越小越优先；它只表达入选节点之间的三档相对高低，不使用中文等级值
- 先按 importance 从 1 到 3 排列，同档内按诊断价值从高到低排列

用JSON格式回复：
{
  "nodes": [
    {
      "name": "节点名称",
      "context": "一句话说明这个节点为什么值得诊断",
      "sourceExcerpt": "材料中能证明该节点的证据片段，直接引用1-3句话",
      "importance": 1,
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
    .slice(0, 15)
    .map((n): AnalyzerKnowledgeNode | null => {
      if (!isRecord(n)) {
        return null
      }

      const name = readString(n.name)
      const context = readString(n.context)
      const sourceExcerpt = readString(n.sourceExcerpt)
      const priorityReason = readString(n.priorityReason)
      const importance = n.importance

      if (!name || !context || !sourceExcerpt || !priorityReason || (importance !== 1 && importance !== 2 && importance !== 3)) {
        return null
      }

      return {
        // id 是确定性标识，唯一性归代码：不读 LLM 的 id，始终生成，杜绝重复 id 导致
        // nodeLevelStates 覆盖、按 id 写回对话串位。
        id: randomUUID(),
        name,
        context,
        sourceExcerpt,
        importance,
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
