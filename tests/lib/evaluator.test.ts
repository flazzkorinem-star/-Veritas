// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chat } from '../../lib/llm'
import { evaluateConversations, parseEvaluatorResponse } from '../../lib/agents/evaluator'
import { NodeConversation, NodeLevelState } from '../../lib/types'

vi.mock('../../lib/llm', () => ({
  chat: vi.fn(),
  MODEL_FAST: 'test-fast-model',
}))

beforeEach(() => {
  vi.clearAllMocks()
})

const conversations: NodeConversation[] = [
  {
    node: {
      id: 'rag',
      name: 'RAG',
      context: 'RAG 用检索到的材料片段增强生成回答。',
      sourceExcerpt: 'RAG 会先检索相关材料，再把材料交给模型生成回答。',
      suitableLevels: ['memory', 'understanding', 'application', 'analysis'],
      priorityReason: '容易把 RAG 混同为普通搜索。',
    },
    turns: [
      { role: 'assistant', content: 'RAG 是什么？' },
      { role: 'user', content: 'RAG 是先找资料，再结合资料回答。' },
      { role: 'assistant', content: '放到客服场景里怎么用？' },
      { role: 'user', content: '客服先检索产品文档，再根据文档答用户。' },
    ],
  },
]

const levelStates: Record<string, NodeLevelState[]> = {
  rag: [
    { level: 'memory', status: 'passed' },
    {
      level: 'understanding',
      status: 'passed',
      supportRecords: [
        {
          kind: 'hint',
          level: 'understanding',
          question: 'RAG 为什么不是普通搜索？',
          content: '先区分检索和生成。',
        },
      ],
    },
    {
      level: 'application',
      status: 'passed',
      supportRecords: [
        {
          kind: 'answer',
          level: 'application',
          question: '客服场景怎么用？',
          content: '先检索产品文档，再组织回答。',
        },
      ],
    },
    { level: 'analysis', status: 'passed' },
    { level: 'evaluation', status: 'not_applicable' },
    { level: 'creation', status: 'not_applicable' },
  ],
}

const input = {
  nodeConversations: conversations,
  nodeLevelStates: levelStates,
}

function validRawReport(score = 999) {
  return JSON.stringify({
    summary: '主要盲点是能说出流程，但应用层需要答案辅助。',
    overallScore: score,
    nodes: [
      {
        nodeId: 'rag',
        nodeName: 'RAG',
        sourceExcerpt: '模型给的片段会被本地材料片段覆盖也可以。',
        levelStatus: {
          memory: 'failed',
          understanding: 'failed',
          application: 'failed',
          analysis: 'failed',
          evaluation: 'failed',
          creation: 'failed',
        },
        evidenceQuotes: [
          'RAG 是先找资料，再结合资料回答。',
          '这句话不是用户说的',
        ],
        blindSpot: '应用层需要答案辅助，不能独立说明怎么落地。',
        supportUsed: { hint: false, answer: false, analogy: false },
        correctUnderstanding: 'RAG 是检索材料后，把材料作为上下文交给模型生成。',
        nextStep: '重新用客服场景说清检索、引用材料和生成回答三步。',
        score,
      },
    ],
  })
}

describe('parseEvaluatorResponse', () => {
  it('解析 v3.0 报告结构并保留用户真实原话', () => {
    const report = parseEvaluatorResponse(validRawReport(), input)

    expect(report.summary).toContain('主要盲点')
    expect(report.nodes).toHaveLength(1)
    expect(report.nodes[0].nodeId).toBe('rag')
    expect(report.nodes[0].sourceExcerpt).toBe('模型给的片段会被本地材料片段覆盖也可以。')
    expect(report.nodes[0].levelStatus.memory).toBe('passed')
    expect(report.nodes[0].levelStatus.application).toBe('passed')
    expect(report.nodes[0].evidenceQuotes).toEqual(['RAG 是先找资料，再结合资料回答。'])
    expect(report.nodes[0].blindSpot).toContain('应用层')
    expect(report.nodes[0].correctUnderstanding).toContain('检索材料')
    expect(report.nodes[0].nextStep).toContain('客服场景')
  })

  it('没有真实用户原话时不保留伪造 evidenceQuotes', () => {
    const report = parseEvaluatorResponse(validRawReport(), {
      nodeConversations: [
        {
          ...conversations[0],
          turns: [{ role: 'user', content: '我不知道。' }],
        },
      ],
      nodeLevelStates: levelStates,
    })

    expect(report.nodes[0].evidenceQuotes).toEqual([])
  })

  it('不会把系统合成的未作答文本当成用户原话证据', () => {
    const report = parseEvaluatorResponse(JSON.stringify({
      summary: '空回答不能作为证据。',
      overallScore: 0,
      nodes: [
        {
          nodeId: 'rag',
          nodeName: 'RAG',
          evidenceQuotes: ['用户未能作答'],
          blindSpot: '用户没有真实作答。',
          supportUsed: { hint: false, answer: false, analogy: false },
          correctUnderstanding: '',
          nextStep: '',
          score: 0,
        },
      ],
    }), {
      nodeConversations: [
        {
          ...conversations[0],
          turns: [{ role: 'user', content: '用户未能作答' }],
        },
      ],
      nodeLevelStates: levelStates,
    })

    expect(report.nodes[0].evidenceQuotes).toEqual([])
  })

  it('用本地快速路径分数覆盖模型分数，并且深入层级不参与基础分', () => {
    const report = parseEvaluatorResponse(validRawReport(999), input)

    expect(report.nodes[0].score).toBe(66)
    expect(report.overallScore).toBe(66)
  })

  it('提示、答案、主动类比记录会进入报告', () => {
    const report = parseEvaluatorResponse(validRawReport(), {
      nodeConversations: conversations,
      nodeLevelStates: {
        rag: [
          {
            level: 'memory',
            status: 'passed',
            supportRecords: [
              { kind: 'hint', level: 'memory', question: 'q1', content: 'h' },
              { kind: 'answer', level: 'memory', question: 'q2', content: 'a' },
              { kind: 'analogy', level: 'memory', question: 'q3', content: 'x' },
            ],
          },
        ],
      },
    })

    expect(report.nodes[0].supportUsed).toEqual({
      hint: true,
      answer: true,
      analogy: true,
    })
  })

  it('缺少层级状态时使用模型结构和材料适用层级做稳定兜底', () => {
    const report = parseEvaluatorResponse(validRawReport(), {
      nodeConversations: conversations,
    })

    expect(report.nodes[0].levelStatus.memory).toBe('failed')
    expect(report.nodes[0].levelStatus.evaluation).toBe('not_applicable')
    expect(report.nodes[0].score).toBe(0)
  })

  it('模型缺字段时不编造盲点、正确理解或下一步', () => {
    const report = parseEvaluatorResponse(JSON.stringify({
      nodes: [{ nodeId: 'rag', nodeName: 'RAG', score: 999 }],
      overallScore: 999,
      summary: '',
    }), {
      nodeConversations: conversations,
    })

    expect(report.nodes[0].blindSpot).toBe('')
    expect(report.nodes[0].correctUnderstanding).toBe('')
    expect(report.nodes[0].nextStep).toBe('')
  })

  it('解析非法 JSON 时保留调试上下文，但不是原始 parse 错误', () => {
    expect(() => parseEvaluatorResponse('bad json from model', input))
      .toThrow('Evaluator returned invalid JSON: bad json from model')
  })
})

describe('evaluateConversations', () => {
  it('malformed 输出会重试，重试成功后返回本地计分报告，并且 prompt 不带 support content', async () => {
    vi.mocked(chat)
      .mockResolvedValueOnce('bad json')
      .mockResolvedValueOnce(validRawReport(999))

    const report = await evaluateConversations(input)
    const firstPrompt = vi.mocked(chat).mock.calls[0][0][1].content

    expect(chat).toHaveBeenCalledTimes(2)
    expect(report.nodes[0].score).toBe(66)
    expect(firstPrompt).not.toContain('先区分检索和生成。')
    expect(firstPrompt).not.toContain('先检索产品文档，再组织回答。')
  })

  it('连续 malformed 输出会返回稳定 fallback 报告', async () => {
    vi.mocked(chat)
      .mockResolvedValueOnce('bad json')
      .mockResolvedValueOnce('still bad')

    const report = await evaluateConversations(input)

    expect(chat).toHaveBeenCalledTimes(2)
    expect(report.nodes[0].nodeId).toBe('rag')
    expect(report.nodes[0].evidenceQuotes).toEqual([])
    expect(report.overallScore).toBe(66)
  })
})
