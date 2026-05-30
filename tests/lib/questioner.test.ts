// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { chat } from '../../lib/llm'
import { getNextQuestion, parseQuestionerResponse } from '../../lib/agents/questioner'
import { KnowledgeNode, NodeLevelState } from '../../lib/types'

vi.mock('../../lib/llm', () => ({
  chat: vi.fn(),
  MODEL_FAST: 'test-fast-model',
}))

const node: KnowledgeNode = {
  id: 'node-1',
  name: 'RAG',
  context: '检索增强生成会先找相关资料，再把资料交给模型回答。',
  sourceExcerpt: 'RAG 会先检索相关文档片段，再把片段作为上下文交给大模型生成回答。',
  priorityReason: '容易混淆检索和生成的职责。',
}

const levelStates: NodeLevelState[] = [
  { level: 'memory', status: 'passed' },
  { level: 'understanding', status: 'in_progress' },
  { level: 'application', status: 'not_started' },
  { level: 'analysis', status: 'not_started' },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('parseQuestionerResponse', () => {
  it('解析 Agent 2 的结构化响应', () => {
    const raw = JSON.stringify({
      reply: '这个理解基本对。接下来换到应用层。',
      currentLevel: 'understanding',
      passedCurrentLevel: true,
      blindSpotSummary: '',
      supportUsed: 'none',
      nextLevel: 'application',
    })

    const result = parseQuestionerResponse(raw)

    expect(result.reply).toBe('这个理解基本对。接下来换到应用层。')
    expect(result.currentLevel).toBe('understanding')
    expect(result.passedCurrentLevel).toBe(true)
    expect(result.supportUsed).toBe('none')
  })

  it('拒绝非对象输出，让调用方走稳定 fallback', () => {
    expect(() => parseQuestionerResponse('不是 JSON')).toThrow()
  })
})

describe('getNextQuestion', () => {
  it('system prompt 使用知识检验家教原则，并避免场景话术表', async () => {
    vi.mocked(chat).mockResolvedValueOnce(JSON.stringify({
      reply: '我听到了。我们先把这个点换成更好接的话法，你说说 RAG 里检索负责什么就行。',
      currentLevel: 'understanding',
      passedCurrentLevel: false,
      blindSpotSummary: '',
      supportUsed: 'none',
    }))

    await getNextQuestion({
      node,
      currentLevel: 'understanding',
      levelStates,
      requestType: 'normal',
      conversationHistory: [
        { role: 'assistant', content: '你能用自己的话解释 RAG 吗？' },
        { role: 'user', content: '你为什么不回答我的问题。' },
      ],
    })

    const messages = vi.mocked(chat).mock.calls[0][0]
    const systemPrompt = messages[0].content
    expect(systemPrompt).toContain('带着知识检验目标的家教')
    expect(systemPrompt).toContain('像朋友一样聊天')
    expect(systemPrompt).toContain('先回应他刚才那句话本身')
    expect(systemPrompt).toContain('不要替自己辩解')
    expect(systemPrompt).toContain('不要为沟通问题编原因')
    expect(systemPrompt).toContain('只有当学生真的在回答当前知识问题时')
    expect(systemPrompt).not.toContain('错误处理')
    expect(systemPrompt).not.toContain('事实性错误')
    expect(systemPrompt).not.toContain('逻辑错误')
    expect(systemPrompt).not.toContain('应用错误')
    expect(systemPrompt).not.toContain('主动类比触发条件')
    expect(systemPrompt).not.toContain('用户骂你时')
  })

  it('normal 请求返回 reply、currentLevel 和 nextAction', async () => {
    vi.mocked(chat).mockResolvedValueOnce(JSON.stringify({
      reply: '这个说法能抓到重点。下一步你试着放到一个具体使用场景里。',
      currentLevel: 'understanding',
      passedCurrentLevel: true,
      blindSpotSummary: '',
      supportUsed: 'none',
    }))

    const result = await getNextQuestion({
      node,
      currentLevel: 'understanding',
      levelStates,
      requestType: 'normal',
      conversationHistory: [
        { role: 'assistant', content: '你能用自己的话解释 RAG 吗？' },
        { role: 'user', content: '它先检索资料，再让模型结合资料回答。' },
      ],
    })

    expect(result.reply).toContain('具体使用场景')
    expect(result.currentLevel).toBe('understanding')
    expect(result.passedCurrentLevel).toBe(true)
    expect(result.nextAction).toBe('advance_next_level')
    expect(result.nextLevel).toBe('application')
  })

  it('在 Agent 2 parse 层清理回复里的破折号', async () => {
    vi.mocked(chat).mockResolvedValueOnce(JSON.stringify({
      reply: '这个方向对——接下来用一个具体场景说明。',
      currentLevel: 'understanding',
      passedCurrentLevel: true,
      blindSpotSummary: '',
      supportUsed: 'none',
    }))

    const result = await getNextQuestion({
      node,
      currentLevel: 'understanding',
      levelStates,
      requestType: 'normal',
      conversationHistory: [
        { role: 'assistant', content: '你能用自己的话解释 RAG 吗？' },
        { role: 'user', content: '它先检索资料，再让模型结合资料回答。' },
      ],
    })

    expect(result.reply).toBe('这个方向对，接下来用一个具体场景说明。')
  })

  it('hint 请求不会标记独立通过，并记录提示使用', async () => {
    vi.mocked(chat).mockResolvedValueOnce(JSON.stringify({
      reply: '先想两件事：检索负责什么，生成负责什么。',
      currentLevel: 'understanding',
      passedCurrentLevel: true,
      blindSpotSummary: '需要提示才能区分检索和生成。',
      supportUsed: 'none',
    }))

    const result = await getNextQuestion({
      node,
      currentLevel: 'understanding',
      levelStates,
      requestType: 'hint',
      conversationHistory: [
        { role: 'assistant', content: '你能用自己的话解释 RAG 吗？' },
      ],
    })

    expect(result.passedCurrentLevel).toBe(false)
    expect(result.nextAction).toBe('continue_current_level')
    expect(result.supportUsed).toBe('hint')
    expect(result.supportRecords?.[0]).toMatchObject({
      kind: 'hint',
      level: 'understanding',
    })
  })

  it('answer 请求不会标记独立通过，并记录答案使用', async () => {
    vi.mocked(chat).mockResolvedValueOnce(JSON.stringify({
      reply: '可以答：RAG 先检索材料，再基于材料生成回答。',
      currentLevel: 'memory',
      passedCurrentLevel: true,
      blindSpotSummary: '需要答案辅助。',
      supportUsed: 'none',
    }))

    const result = await getNextQuestion({
      node,
      currentLevel: 'memory',
      requestType: 'answer',
      conversationHistory: [
        { role: 'assistant', content: 'RAG 的基本定义是什么？' },
      ],
    })

    expect(result.passedCurrentLevel).toBe(false)
    expect(result.nextAction).toBe('advance_next_level')
    expect(result.nextLevel).toBe('understanding')
    expect(result.supportUsed).toBe('answer')
    expect(result.supportRecords?.[0]).toMatchObject({
      kind: 'answer',
      level: 'memory',
    })
  })

  it('answer 请求在末层 analysis 完成节点', async () => {
    vi.mocked(chat).mockResolvedValueOnce(JSON.stringify({
      reply: '可以答：注意力机制按相关性分配权重。',
      currentLevel: 'analysis',
      passedCurrentLevel: true,
      blindSpotSummary: '',
      supportUsed: 'none',
    }))

    const result = await getNextQuestion({
      node,
      currentLevel: 'analysis',
      requestType: 'answer',
      conversationHistory: [
        { role: 'assistant', content: '它的机制是什么？' },
      ],
    })

    expect(result.passedCurrentLevel).toBe(false)
    expect(result.nextAction).toBe('complete_node')
    expect(result.supportUsed).toBe('answer')
  })

  it('没有真实用户作答时不会接受模型给出的通过判断', async () => {
    vi.mocked(chat).mockResolvedValueOnce(JSON.stringify({
      reply: '这一层可以。',
      currentLevel: 'memory',
      passedCurrentLevel: true,
      blindSpotSummary: '',
      supportUsed: 'none',
    }))

    const result = await getNextQuestion({
      node,
      currentLevel: 'memory',
      requestType: 'normal',
      conversationHistory: [],
    })

    expect(result.passedCurrentLevel).toBe(false)
    expect(result.nextAction).toBe('continue_current_level')
  })

  it('流程控制文本不会被当成真实作答', async () => {
    vi.mocked(chat).mockResolvedValueOnce(JSON.stringify({
      reply: '分析层也通过了。',
      currentLevel: 'analysis',
      passedCurrentLevel: true,
      blindSpotSummary: '',
      supportUsed: 'none',
    }))

    const result = await getNextQuestion({
      node,
      currentLevel: 'analysis',
      requestType: 'normal',
      conversationHistory: [
        { role: 'user', content: '给我答案' },
      ],
    })

    expect(result.passedCurrentLevel).toBe(false)
    expect(result.nextAction).toBe('continue_current_level')
  })

  it('忽略模型返回的非法层级，回退到 memory', async () => {
    vi.mocked(chat).mockResolvedValueOnce(JSON.stringify({
      reply: '我们先停在适合这个节点的层级。',
      currentLevel: 'creation',
      passedCurrentLevel: true,
      blindSpotSummary: '',
      supportUsed: 'none',
      nextLevel: 'creation',
    }))

    const result = await getNextQuestion({
      node,
      requestType: 'normal',
      conversationHistory: [
        { role: 'assistant', content: '你能设计一个新方案吗？' },
        { role: 'user', content: '可以。' },
      ],
    })

    expect(result.currentLevel).toBe('memory')
    expect(result.nextLevel).toBe('understanding')
  })

  it('malformed LLM 输出会 retry 一次，然后返回本地 fallback', async () => {
    vi.mocked(chat)
      .mockResolvedValueOnce('不是 JSON')
      .mockResolvedValueOnce('还是不是 JSON')

    const result = await getNextQuestion({
      node,
      currentLevel: 'application',
      requestType: 'normal',
      conversationHistory: [
        { role: 'assistant', content: '给一个 RAG 的应用场景。' },
        { role: 'user', content: '不知道。' },
      ],
    })

    expect(chat).toHaveBeenCalledTimes(2)
    expect(result.reply.trim().length).toBeGreaterThan(0)
    expect(result.reply).not.toContain('不知道')
    expect(result.currentLevel).toBe('application')
    expect(result.passedCurrentLevel).toBe(false)
    expect(result.nextAction).toBe('continue_current_level')
  })

  it('fallback 不复读固定追问，也不把异常路径标记通过', async () => {
    vi.mocked(chat)
      .mockResolvedValueOnce('不是 JSON')
      .mockResolvedValueOnce('还是不是 JSON')

    const result = await getNextQuestion({
      node,
      currentLevel: 'understanding',
      requestType: 'normal',
      conversationHistory: [
        { role: 'assistant', content: '你能用自己的话解释 RAG 吗？' },
        { role: 'user', content: '你为什么不回答我的问题。' },
      ],
    })

    expect(result.reply.trim().length).toBeGreaterThan(0)
    expect(result.reply).not.toContain('你为什么不回答我的问题')
    expect(result.reply).not.toContain('你已经提到了一部分')
    expect(result.passedCurrentLevel).toBe(false)
  })

  it('answer fallback 只返回材料信息，不追加诊断话术', async () => {
    vi.mocked(chat)
      .mockResolvedValueOnce('不是 JSON')
      .mockResolvedValueOnce('还是不是 JSON')

    const result = await getNextQuestion({
      node,
      currentLevel: 'understanding',
      requestType: 'answer',
      conversationHistory: [
        { role: 'assistant', content: '你能用自己的话解释 RAG 吗？' },
        { role: 'user', content: '不知道，你解释一下。' },
      ],
    })

    expect(result.reply).toContain(node.context)
    expect(result.reply).toContain(node.sourceExcerpt)
    expect(result.reply).not.toContain('消化一下')
    expect(result.reply).not.toContain('复述一遍')
    expect(result.passedCurrentLevel).toBe(false)
  })

  it('fallback 不用关键词分类打断正常作答', async () => {
    vi.mocked(chat)
      .mockResolvedValueOnce('不是 JSON')
      .mockResolvedValueOnce('还是不是 JSON')

    const result = await getNextQuestion({
      node,
      currentLevel: 'analysis',
      requestType: 'normal',
      conversationHistory: [
        { role: 'assistant', content: 'RAG 的应用边界是什么？' },
        { role: 'user', content: '我说过，操作流程复杂时会比较麻烦。' },
      ],
    })

    expect(result.reply.trim().length).toBeGreaterThan(0)
    expect(result.reply).not.toContain('我说过')
    expect(result.reply).not.toContain('我先不继续追问')
    expect(result.reply).not.toContain('我可能误解')
  })

  it('三次用户回答后仍继续按层级诊断，不再固定停止', async () => {
    vi.mocked(chat).mockResolvedValueOnce(JSON.stringify({
      reply: '这里还需要再拆一下边界条件。',
      currentLevel: 'analysis',
      passedCurrentLevel: false,
      blindSpotSummary: '还没有说清楚边界条件。',
      supportUsed: 'none',
    }))

    const result = await getNextQuestion({
      node,
      currentLevel: 'analysis',
      requestType: 'normal',
      conversationHistory: [
        { role: 'assistant', content: 'RAG 是什么？' },
        { role: 'user', content: '回答 1' },
        { role: 'assistant', content: '它解决什么问题？' },
        { role: 'user', content: '回答 2' },
        { role: 'assistant', content: '给一个场景。' },
        { role: 'user', content: '回答 3' },
      ],
    })

    expect(chat).toHaveBeenCalledTimes(1)
    expect(result.nextAction).toBe('continue_current_level')
    expect(result.reply).toContain('边界条件')
  })
})
