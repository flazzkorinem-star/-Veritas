// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { chat } from '../../lib/llm'
import { evaluateConversations, parseEvaluatorResponse } from '../../lib/agents/evaluator'
import { NodeConversation } from '../../lib/types'

vi.mock('../../lib/llm', () => ({
  chat: vi.fn(),
  MODEL_FAST: 'test-fast-model',
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('parseEvaluatorResponse', () => {
  it('parses valid evaluation JSON', () => {
    const raw = JSON.stringify({
      nodes: [
        {
          nodeId: '1',
          nodeName: 'RAG',
          masteryLevel: 'developing',
          hasMisconception: true,
          misconceptionQuote: '我说RAG就是搜索引擎',
          misconceptionCorrection: 'RAG是检索增强生成，不是搜索引擎',
          explanation: 'RAG通过检索相关文档片段作为上下文来增强LLM的回答',
          isSupplementalExplanation: false,
          evidenceSummary: '用户能说出用途，但把 RAG 等同于搜索引擎。',
          score: 50,
        }
      ],
      overallScore: 50,
      summary: '基本理解了RAG的用途，但概念定义存在偏差'
    })
    const report = parseEvaluatorResponse(raw)
    expect(report.nodes).toHaveLength(1)
    expect(report.nodes[0].masteryLevel).toBe('developing')
    expect(report.nodes[0].evidenceSummary).toContain('搜索引擎')
    expect(report.nodes[0].isSupplementalExplanation).toBe(false)
    expect(report.overallScore).toBe(45)
  })

  it('throws on invalid JSON', () => {
    expect(() => parseEvaluatorResponse('bad json')).toThrow()
  })

  it('recalculates scores instead of trusting model-provided numbers', () => {
    const raw = JSON.stringify({
      nodes: [
        {
          nodeId: '1',
          nodeName: 'RAG',
          masteryLevel: 'mastered',
          hasMisconception: true,
          misconceptionQuote: 'RAG就是搜索引擎',
          misconceptionCorrection: 'RAG是检索增强生成，不等于搜索引擎',
          score: 100,
        },
        {
          nodeId: '2',
          nodeName: 'Embedding',
          masteryLevel: 'needs_work',
          hasMisconception: false,
          explanation: 'Embedding 是把文本映射到向量空间的表示。',
          score: 100,
        },
      ],
      overallScore: 100,
      summary: '模型给出的分数不可信',
    })

    const report = parseEvaluatorResponse(raw)

    expect(report.nodes[0].score).toBe(85)
    expect(report.nodes[1].score).toBe(40)
    expect(report.overallScore).toBe(63)
  })

  it('does not keep misconception flags without a precise user quote', () => {
    const raw = JSON.stringify({
      nodes: [
        {
          nodeId: '1',
          nodeName: '位置编码',
          masteryLevel: 'needs_work',
          hasMisconception: true,
          explanation: '位置编码用于让模型区分序列中不同位置的信息。',
          isSupplementalExplanation: true,
          evidenceSummary: '用户未能说出位置编码的作用。',
          score: 100,
        },
      ],
      overallScore: 100,
      summary: '位置编码需要重点复习',
    })

    const report = parseEvaluatorResponse(raw)

    expect(report.nodes[0].hasMisconception).toBe(false)
    expect(report.nodes[0].misconceptionQuote).toBeUndefined()
    expect(report.nodes[0].score).toBe(40)
    expect(report.nodes[0].isSupplementalExplanation).toBe(true)
  })

  it('attaches source excerpts from node conversations to report nodes', () => {
    const conversations: NodeConversation[] = [
      {
        node: {
          id: '1',
          name: 'RAG',
          context: '检索增强生成',
          sourceExcerpt: 'RAG 会先检索相关文档片段，再把片段作为上下文交给大模型生成回答。',
        },
        turns: [],
      },
    ]
    const raw = JSON.stringify({
      nodes: [
        {
          nodeId: '1',
          nodeName: 'RAG',
          masteryLevel: 'mastered',
          hasMisconception: false,
          score: 100,
        },
      ],
      overallScore: 100,
      summary: '已掌握',
    })

    const report = parseEvaluatorResponse(raw, conversations)

    expect(report.nodes[0].sourceExcerpt).toBe(
      'RAG 会先检索相关文档片段，再把片段作为上下文交给大模型生成回答。'
    )
  })
})

describe('evaluateConversations', () => {
  it('retries once when the evaluator output is malformed', async () => {
    vi.mocked(chat)
      .mockResolvedValueOnce('bad json')
      .mockResolvedValueOnce(JSON.stringify({
        nodes: [
          {
            nodeId: '1',
            nodeName: 'RAG',
            masteryLevel: 'mastered',
            hasMisconception: false,
            isSupplementalExplanation: false,
            evidenceSummary: '用户能说清楚 RAG 的核心流程。',
            score: 100,
          },
        ],
        overallScore: 100,
        summary: 'RAG 已掌握',
      }))

    const conversations: NodeConversation[] = [
      {
        node: {
          id: '1',
          name: 'RAG',
          context: '检索增强生成',
          sourceExcerpt: 'RAG 会先检索相关文档片段。',
        },
        turns: [
          { role: 'assistant', content: 'RAG 是什么？' },
          { role: 'user', content: 'RAG 是先检索资料，再生成回答。' },
        ],
      },
    ]

    const report = await evaluateConversations(conversations)

    expect(chat).toHaveBeenCalledTimes(2)
    expect(report.nodes[0].score).toBe(100)
  })
})
