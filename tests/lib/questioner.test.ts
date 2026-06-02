// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { chat } from '../../lib/llm'
import { getNextQuestion } from '../../lib/agents/questioner'
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

// 判官响应：只含语义判定字段
function assessorReply(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    passedCurrentLevel: false,
    blindSpotSummary: '',
    isAnsweringCurrentQuestion: true,
    ...overrides,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getNextQuestion · 两次调用协议', () => {
  it('normal 作答：先判官(jsonMode)后对话(纯文本)，通过则 advance_next_level', async () => {
    vi.mocked(chat)
      .mockResolvedValueOnce(assessorReply({ passedCurrentLevel: true, isAnsweringCurrentQuestion: true }))
      .mockResolvedValueOnce('那我们换到一个具体场景继续。')

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

    expect(chat).toHaveBeenCalledTimes(2)
    // 第一次是判官（结构化），第二次是对话（纯自然语言）
    expect(vi.mocked(chat).mock.calls[0][1]).toMatchObject({ jsonMode: true })
    expect(vi.mocked(chat).mock.calls[1][1]).toMatchObject({ jsonMode: false })
    expect(result.passedCurrentLevel).toBe(true)
    expect(result.nextAction).toBe('advance_next_level')
    expect(result.currentLevel).toBe('understanding')
    expect(result.reply).toBe('那我们换到一个具体场景继续。')
    expect(result.supportUsed).toBe('none')
    expect(result.supportRecords).toBeUndefined()
    expect(result.blindSpotSummary).toBe('')
    // 关键耦合点：对话调用必须收到判定结果——知道已通过、要进入下一层
    const dialogueMessages = JSON.stringify(vi.mocked(chat).mock.calls[1][0])
    expect(dialogueMessages).toContain('advance_next_level')
    expect(dialogueMessages).toContain('application')
  })

  it('normal 末层 analysis 通过：nextAction=complete_node，对话调用收到 complete_node', async () => {
    vi.mocked(chat)
      .mockResolvedValueOnce(assessorReply({ passedCurrentLevel: true, isAnsweringCurrentQuestion: true }))
      .mockResolvedValueOnce('很好，这个节点我们就到这里。')

    const result = await getNextQuestion({
      node,
      currentLevel: 'analysis',
      requestType: 'normal',
      conversationHistory: [
        { role: 'assistant', content: 'RAG 的机制和边界是什么？' },
        { role: 'user', content: '它靠检索缩小范围，但对检索质量敏感。' },
      ],
    })

    expect(chat).toHaveBeenCalledTimes(2)
    expect(vi.mocked(chat).mock.calls[0][1]).toMatchObject({ jsonMode: true })
    expect(vi.mocked(chat).mock.calls[1][1]).toMatchObject({ jsonMode: false })
    expect(result.passedCurrentLevel).toBe(true)
    expect(result.nextAction).toBe('complete_node')
    expect(result.supportUsed).toBe('none')
    expect(result.blindSpotSummary).toBe('')
    // 对话调用必须知道这是完成节点（但话术不在单测断言范围）
    const dialogueMessages = JSON.stringify(vi.mocked(chat).mock.calls[1][0])
    expect(dialogueMessages).toContain('complete_node')
  })

  it('normal 未通过：继续当前层，reply 来自对话调用', async () => {
    vi.mocked(chat)
      .mockResolvedValueOnce(assessorReply({ passedCurrentLevel: false, blindSpotSummary: '还没说清边界条件。' }))
      .mockResolvedValueOnce('再往深想一层，这里的边界条件是什么？')

    const result = await getNextQuestion({
      node,
      currentLevel: 'analysis',
      requestType: 'normal',
      conversationHistory: [
        { role: 'assistant', content: 'RAG 的应用边界是什么？' },
        { role: 'user', content: '复杂时会麻烦。' },
      ],
    })

    expect(chat).toHaveBeenCalledTimes(2)
    expect(vi.mocked(chat).mock.calls[0][1]).toMatchObject({ jsonMode: true })
    expect(vi.mocked(chat).mock.calls[1][1]).toMatchObject({ jsonMode: false })
    expect(result.passedCurrentLevel).toBe(false)
    expect(result.nextAction).toBe('continue_current_level')
    expect(result.supportUsed).toBe('none')
    expect(result.blindSpotSummary).toBe('还没说清边界条件。')
    expect(result.reply).toBe('再往深想一层，这里的边界条件是什么？')
  })

  it('清理对话回复里的破折号', async () => {
    vi.mocked(chat)
      .mockResolvedValueOnce(assessorReply({ passedCurrentLevel: true }))
      .mockResolvedValueOnce('这个方向对——接下来用一个具体场景说明。')

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

    expect(chat).toHaveBeenCalledTimes(2)
    expect(vi.mocked(chat).mock.calls[0][1]).toMatchObject({ jsonMode: true })
    expect(vi.mocked(chat).mock.calls[1][1]).toMatchObject({ jsonMode: false })
    expect(result.reply).toBe('这个方向对，接下来用一个具体场景说明。')
  })
})

describe('getNextQuestion · 闲聊不污染', () => {
  it('判官判定非作答：passed=false、盲点强制为空、继续当前层', async () => {
    vi.mocked(chat)
      // 判官即使越权说通过，只要 isAnsweringCurrentQuestion=false，结果也必须不通过且无盲点
      .mockResolvedValueOnce(assessorReply({
        passedCurrentLevel: true,
        blindSpotSummary: '用户在打招呼，没作答。',
        isAnsweringCurrentQuestion: false,
      }))
      .mockResolvedValueOnce('哈喽～我们先回到 RAG，你试着说说它是什么？')

    const result = await getNextQuestion({
      node,
      currentLevel: 'memory',
      requestType: 'normal',
      conversationHistory: [
        { role: 'assistant', content: '你能说说 RAG 是什么吗？' },
        { role: 'user', content: '下午好' },
      ],
    })

    expect(chat).toHaveBeenCalledTimes(2)
    expect(vi.mocked(chat).mock.calls[0][1]).toMatchObject({ jsonMode: true })
    expect(vi.mocked(chat).mock.calls[1][1]).toMatchObject({ jsonMode: false })
    expect(result.passedCurrentLevel).toBe(false)
    expect(result.blindSpotSummary).toBe('')
    expect(result.nextAction).toBe('continue_current_level')
    expect(result.supportUsed).toBe('none')
  })
})

describe('getNextQuestion · 确定性归代码', () => {
  it('判官越权多吐 supportUsed/nextAction/currentLevel 一律被忽略', async () => {
    vi.mocked(chat)
      .mockResolvedValueOnce(JSON.stringify({
        passedCurrentLevel: true,
        blindSpotSummary: '',
        isAnsweringCurrentQuestion: true,
        // 越权字段：必须被无视，确定性状态只认代码
        supportUsed: 'hint',
        nextAction: 'complete_node',
        currentLevel: 'analysis',
      }))
      .mockResolvedValueOnce('那我们进入应用层，看看具体场景。')

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

    expect(chat).toHaveBeenCalledTimes(2)
    expect(vi.mocked(chat).mock.calls[0][1]).toMatchObject({ jsonMode: true })
    expect(vi.mocked(chat).mock.calls[1][1]).toMatchObject({ jsonMode: false })
    expect(result.passedCurrentLevel).toBe(true)
    expect(result.supportUsed).toBe('none')
    expect(result.supportRecords).toBeUndefined()
    // 推进只认代码：understanding 顺序下一层是 application，不被越权的 complete_node 干扰
    expect(result.nextAction).toBe('advance_next_level')
    expect(result.currentLevel).toBe('understanding')
  })
})

describe('getNextQuestion · 跳过判官的分支', () => {
  it('初始 normal（无用户作答）：跳过判官，只跑一次对话', async () => {
    vi.mocked(chat).mockResolvedValueOnce('我们先从 RAG 开始，你按自己的理解说一句。')

    const result = await getNextQuestion({
      node,
      currentLevel: 'memory',
      requestType: 'normal',
      conversationHistory: [],
    })

    expect(chat).toHaveBeenCalledTimes(1)
    expect(vi.mocked(chat).mock.calls[0][1]).toMatchObject({ jsonMode: false })
    expect(result.passedCurrentLevel).toBe(false)
    expect(result.nextAction).toBe('continue_current_level')
    expect(result.supportUsed).toBe('none')
    expect(result.reply).toBe('我们先从 RAG 开始，你按自己的理解说一句。')
  })

  it.each(['给我提示', '给我答案'])('流程控制文本（%s）不触发判官，只跑对话', async (controlText) => {
    vi.mocked(chat).mockResolvedValueOnce('好，我们继续这一层。')

    const result = await getNextQuestion({
      node,
      currentLevel: 'analysis',
      requestType: 'normal',
      conversationHistory: [
        { role: 'assistant', content: '它的机制是什么？' },
        { role: 'user', content: controlText },
      ],
    })

    expect(chat).toHaveBeenCalledTimes(1)
    expect(vi.mocked(chat).mock.calls[0][1]).toMatchObject({ jsonMode: false })
    expect(result.passedCurrentLevel).toBe(false)
    expect(result.nextAction).toBe('continue_current_level')
    expect(result.supportUsed).toBe('none')
  })

  it('hint：跳过判官，不算通过，记录提示使用', async () => {
    vi.mocked(chat).mockResolvedValueOnce('先想两件事：检索负责什么，生成负责什么。')

    const result = await getNextQuestion({
      node,
      currentLevel: 'understanding',
      levelStates,
      requestType: 'hint',
      conversationHistory: [
        { role: 'assistant', content: '你能用自己的话解释 RAG 吗？' },
      ],
    })

    expect(chat).toHaveBeenCalledTimes(1)
    expect(vi.mocked(chat).mock.calls[0][1]).toMatchObject({ jsonMode: false })
    expect(result.passedCurrentLevel).toBe(false)
    expect(result.nextAction).toBe('continue_current_level')
    expect(result.supportUsed).toBe('hint')
    expect(result.supportRecords?.[0]).toMatchObject({ kind: 'hint', level: 'understanding' })
  })

  it('answer 非末层：跳过判官，nextAction=advance_next_level，记录答案使用', async () => {
    vi.mocked(chat).mockResolvedValueOnce('答案：RAG 先检索材料，再基于材料生成回答。')

    const result = await getNextQuestion({
      node,
      currentLevel: 'memory',
      requestType: 'answer',
      conversationHistory: [
        { role: 'assistant', content: 'RAG 的基本定义是什么？' },
      ],
    })

    expect(chat).toHaveBeenCalledTimes(1)
    expect(vi.mocked(chat).mock.calls[0][1]).toMatchObject({ jsonMode: false })
    expect(result.passedCurrentLevel).toBe(false)
    expect(result.nextAction).toBe('advance_next_level')
    expect(result.supportUsed).toBe('answer')
    expect(result.supportRecords?.[0]).toMatchObject({ kind: 'answer', level: 'memory' })
  })

  it('answer 末层 analysis：nextAction=complete_node', async () => {
    vi.mocked(chat).mockResolvedValueOnce('答案：注意力机制按相关性分配权重。')

    const result = await getNextQuestion({
      node,
      currentLevel: 'analysis',
      requestType: 'answer',
      conversationHistory: [
        { role: 'assistant', content: '它的机制是什么？' },
      ],
    })

    expect(chat).toHaveBeenCalledTimes(1)
    expect(vi.mocked(chat).mock.calls[0][1]).toMatchObject({ jsonMode: false })
    expect(result.passedCurrentLevel).toBe(false)
    expect(result.nextAction).toBe('complete_node')
    expect(result.supportUsed).toBe('answer')
    expect(result.supportRecords?.[0]).toMatchObject({ kind: 'answer', level: 'analysis' })
  })
})

describe('getNextQuestion · 安全降级（不暴露解析错误）', () => {
  it('判官返回纯空白：安全降级为未通过、盲点空，仍照常跑对话', async () => {
    vi.mocked(chat)
      .mockResolvedValueOnce('   ')          // 判官第 1 次：纯空白
      .mockResolvedValueOnce('   ')          // 判官第 2 次：纯空白
      .mockResolvedValueOnce('我们再聊聊这个点，你怎么理解？')   // 对话

    const result = await getNextQuestion({
      node,
      currentLevel: 'understanding',
      requestType: 'normal',
      conversationHistory: [
        { role: 'assistant', content: '你能用自己的话解释 RAG 吗？' },
        { role: 'user', content: '它把资料喂给模型。' },
      ],
    })

    // 锁死调用协议，杜绝「判官 retry + 对话 retry」套娃：判官最多 2 次 + 对话 1 次
    expect(chat).toHaveBeenCalledTimes(3)
    expect(vi.mocked(chat).mock.calls[0][1]).toMatchObject({ jsonMode: true })
    expect(vi.mocked(chat).mock.calls[1][1]).toMatchObject({ jsonMode: true })
    expect(vi.mocked(chat).mock.calls[2][1]).toMatchObject({ jsonMode: false })
    expect(result.passedCurrentLevel).toBe(false)
    expect(result.blindSpotSummary).toBe('')
    // 判官失败路径核心契约：不推进、不记支持、不污染状态
    expect(result.nextAction).toBe('continue_current_level')
    expect(result.supportUsed).toBe('none')
    expect(result.reply).toBe('我们再聊聊这个点，你怎么理解？')
  })

  it('对话返回纯空白：走场景 fallback，不复读用户原话、不标记通过', async () => {
    vi.mocked(chat)
      .mockResolvedValueOnce(assessorReply({ passedCurrentLevel: false }))
      .mockResolvedValueOnce('     ')        // 对话纯空白

    const result = await getNextQuestion({
      node,
      currentLevel: 'understanding',
      requestType: 'normal',
      conversationHistory: [
        { role: 'assistant', content: '你能用自己的话解释 RAG 吗？' },
        { role: 'user', content: '你为什么不回答我的问题。' },
      ],
    })

    expect(chat).toHaveBeenCalledTimes(2)
    expect(vi.mocked(chat).mock.calls[0][1]).toMatchObject({ jsonMode: true })
    expect(vi.mocked(chat).mock.calls[1][1]).toMatchObject({ jsonMode: false })
    expect(result.reply.trim().length).toBeGreaterThan(0)
    expect(result.reply).not.toContain('你为什么不回答我的问题')
    expect(result.passedCurrentLevel).toBe(false)
    expect(result.nextAction).toBe('continue_current_level')
    expect(result.supportUsed).toBe('none')
  })

  it('判官通过但对话空白：fallback 仍抛出下一层可回答的问题，不让用户卡住', async () => {
    vi.mocked(chat)
      .mockResolvedValueOnce(assessorReply({ passedCurrentLevel: true, isAnsweringCurrentQuestion: true }))
      .mockResolvedValueOnce('   ')   // 对话纯空白

    const result = await getNextQuestion({
      node,
      currentLevel: 'understanding',
      requestType: 'normal',
      conversationHistory: [
        { role: 'assistant', content: '你能用自己的话解释 RAG 吗？' },
        { role: 'user', content: '它先检索资料，再让模型结合资料回答。' },
      ],
    })

    expect(result.nextAction).toBe('advance_next_level')
    expect(result.reply.trim().length).toBeGreaterThan(0)
    // 必须像一个可继续回答的问题，否则层级推进了却没题可答
    expect(result.reply).toContain('？')
  })

  it('对话抛错：走场景 fallback', async () => {
    vi.mocked(chat)
      .mockResolvedValueOnce(assessorReply({ passedCurrentLevel: false }))
      .mockRejectedValueOnce(new Error('network'))

    const result = await getNextQuestion({
      node,
      currentLevel: 'understanding',
      requestType: 'normal',
      conversationHistory: [
        { role: 'assistant', content: '你能用自己的话解释 RAG 吗？' },
        { role: 'user', content: '不知道。' },
      ],
    })

    expect(chat).toHaveBeenCalledTimes(2)
    expect(vi.mocked(chat).mock.calls[0][1]).toMatchObject({ jsonMode: true })
    expect(vi.mocked(chat).mock.calls[1][1]).toMatchObject({ jsonMode: false })
    expect(result.reply.trim().length).toBeGreaterThan(0)
    expect(result.reply).not.toContain('不知道')
    expect(result.passedCurrentLevel).toBe(false)
    expect(result.nextAction).toBe('continue_current_level')
    expect(result.supportUsed).toBe('none')
  })

  it('answer 对话失败：fallback 给出材料信息', async () => {
    vi.mocked(chat).mockResolvedValueOnce('   ')   // answer 跳过判官，对话纯空白

    const result = await getNextQuestion({
      node,
      currentLevel: 'understanding',
      requestType: 'answer',
      conversationHistory: [
        { role: 'assistant', content: '你能用自己的话解释 RAG 吗？' },
        { role: 'user', content: '不知道，你解释一下。' },
      ],
    })

    expect(chat).toHaveBeenCalledTimes(1)
    expect(vi.mocked(chat).mock.calls[0][1]).toMatchObject({ jsonMode: false })
    expect(result.reply).toContain(node.context)
    expect(result.reply).toContain(node.sourceExcerpt)
    expect(result.passedCurrentLevel).toBe(false)
    expect(result.nextAction).toBe('advance_next_level')
    expect(result.supportUsed).toBe('answer')
  })
})
