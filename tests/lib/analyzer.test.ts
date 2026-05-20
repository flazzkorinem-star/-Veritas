// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { analyzeContent, parseAnalyzerResponse } from '../../lib/agents/analyzer'
import { chat } from '../../lib/llm'

vi.mock('../../lib/llm', () => ({
  MODEL_FAST: 'test-fast-model',
  chat: vi.fn(),
}))

function validNode(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `节点${id}`,
    context: `节点${id}能暴露理解和应用断点。`,
    sourceExcerpt: `材料证据${id}`,
    suitableLevels: ['记忆', '理解', '应用'],
    priorityReason: `优先理由${id}`,
    ...overrides,
  }
}

describe('parseAnalyzerResponse', () => {
  it('parses valid JSON into KnowledgeNode array', () => {
    const raw = JSON.stringify({
      nodes: [
        {
          id: '1',
          name: 'RAG',
          context: 'Mentioned as solution to hallucination',
          sourceExcerpt: 'RAG retrieves relevant passages before generation.',
          suitableLevels: ['记忆', '理解', '应用'],
          priorityReason: 'RAG 容易被误解为普通搜索，适合诊断流程理解。',
        },
        {
          id: '2',
          name: 'Embedding',
          context: 'Used to convert text to vectors',
          sourceExcerpt: 'Embeddings convert text into vectors for retrieval.',
          suitableLevels: ['记忆', '理解'],
          priorityReason: 'Embedding 是检索链路的基础概念。',
        },
      ]
    })
    const nodes = parseAnalyzerResponse(raw)
    expect(nodes).toHaveLength(2)
    expect(nodes[0].name).toBe('RAG')
    expect(nodes[0].context).toBe('Mentioned as solution to hallucination')
    expect(nodes[0].sourceExcerpt).toBe('RAG retrieves relevant passages before generation.')
    expect(nodes[0].suitableLevels).toEqual(['记忆', '理解', '应用'])
    expect(nodes[0].priorityReason).toBe('RAG 容易被误解为普通搜索，适合诊断流程理解。')
  })

  it('keeps at most the first eight returned nodes', () => {
    const raw = JSON.stringify({
      nodes: Array.from({ length: 10 }, (_, index) => validNode(String(index + 1))),
    })

    const nodes = parseAnalyzerResponse(raw)

    expect(nodes).toHaveLength(8)
    expect(nodes.map((node) => node.id)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8'])
  })

  it('allows fewer nodes when the material only supports one high-value node', () => {
    const nodes = parseAnalyzerResponse(JSON.stringify({
      nodes: [
        validNode('1', {
          name: 'RAG',
          context: '材料只围绕 RAG 的检索再生成流程展开。',
          sourceExcerpt: 'RAG 会先检索相关材料，再把材料交给模型生成回答。',
          priorityReason: '这个节点能诊断用户是否理解 RAG 和普通生成的边界。',
        }),
      ],
    }))

    expect(nodes).toHaveLength(1)
    expect(nodes[0].name).toBe('RAG')
  })

  it('drops nodes missing evidence or usable suitableLevels', () => {
    const nodes = parseAnalyzerResponse(JSON.stringify({
      nodes: [
        validNode('1', { sourceExcerpt: '' }),
        validNode('2', { evidence: '', sourceExcerpt: undefined }),
        validNode('3', { suitableLevels: undefined }),
        validNode('4', { suitableLevels: ['背诵', '联想'] }),
        validNode('5', {
          suitableLevels: ['记忆', '错误层级', '分析'],
          priorityReason: '这个节点能检查定义和机制拆解。',
        }),
      ],
    }))

    expect(nodes).toHaveLength(1)
    expect(nodes[0].id).toBe('5')
    expect(nodes[0].suitableLevels).toEqual(['记忆', '分析'])
  })

  it('keeps priorityReason from the analyzer response', () => {
    const nodes = parseAnalyzerResponse(JSON.stringify({
      nodes: [
        validNode('1', {
          priorityReason: '它连接定义、应用场景和常见误区，诊断价值高。',
        }),
      ],
    }))

    expect(nodes[0].priorityReason).toBe('它连接定义、应用场景和常见误区，诊断价值高。')
  })

  it('throws on invalid JSON', () => {
    expect(() => parseAnalyzerResponse('not json')).toThrow()
  })

  it('throws if nodes array is missing', () => {
    expect(() => parseAnalyzerResponse(JSON.stringify({ other: 'data' }))).toThrow()
  })

  it('throws if no usable knowledge nodes are returned', () => {
    expect(() => parseAnalyzerResponse(JSON.stringify({ nodes: [] }))).toThrow()
  })

  it('throws if a knowledge node is missing name or context', () => {
    expect(() => parseAnalyzerResponse(JSON.stringify({
      nodes: [validNode('1', { context: '' })],
    }))).toThrow()
  })

  it('throws if a knowledge node is missing sourceExcerpt', () => {
    expect(() => parseAnalyzerResponse(JSON.stringify({
      nodes: [validNode('1', { sourceExcerpt: '' })],
    }))).toThrow()
  })
})

describe('analyzeContent', () => {
  beforeEach(() => {
    vi.mocked(chat).mockReset()
  })

  it('retries once when the first analyzer response is malformed', async () => {
    vi.mocked(chat)
      .mockResolvedValueOnce('not json')
      .mockResolvedValueOnce(JSON.stringify({
        nodes: [
          {
            id: '1',
            name: '注意力机制',
            context: '材料解释了注意力机制如何分配权重。',
            sourceExcerpt: '注意力机制会根据查询和键的相关性分配权重。',
            suitableLevels: ['记忆', '理解', '应用', '分析'],
            priorityReason: '注意力机制容易暴露用户对权重分配机制的理解断点。',
          },
        ],
      }))

    const nodes = await analyzeContent('注意力机制'.repeat(50))

    expect(chat).toHaveBeenCalledTimes(2)
    expect(nodes).toHaveLength(1)
    expect(nodes[0].name).toBe('注意力机制')
  })
})
