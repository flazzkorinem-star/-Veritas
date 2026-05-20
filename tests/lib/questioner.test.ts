// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { chat } from '../../lib/llm'
import { enforceQuestionPolicy, getNextQuestion, parseQuestionerResponse } from '../../lib/agents/questioner'
import { KnowledgeNode } from '../../lib/types'

vi.mock('../../lib/llm', () => ({
  chat: vi.fn(),
  MODEL_FAST: 'test-fast-model',
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('parseQuestionerResponse', () => {
  it('parses valid question response', () => {
    const raw = JSON.stringify({ question: '能解释一下RAG的工作原理吗？' })
    const result = parseQuestionerResponse(raw)
    expect(result.question).toBe('能解释一下RAG的工作原理吗？')
  })

  it('ignores legacy done=true signal', () => {
    const raw = JSON.stringify({ question: '', done: true })
    const result = parseQuestionerResponse(raw)
    expect(result.question).toBe('')
  })

  it('falls back to plain text when JSON fails', () => {
    // Tier 3: model returned plain text — treat as question
    const result = parseQuestionerResponse('你能说说RAG的核心思路吗？')
    expect(result.question).toBe('你能说说RAG的核心思路吗？')
  })

  it('throws on empty/unusable response', () => {
    expect(() => parseQuestionerResponse('   ')).toThrow()
  })
})

describe('enforceQuestionPolicy', () => {
  const node: KnowledgeNode = {
    id: 'node-1',
    name: 'RAG',
    context: '检索增强生成',
    sourceExcerpt: 'RAG 会先检索相关文档片段，再把片段作为上下文交给大模型生成回答。',
  }

  it('uses the required opening style for the first question fallback', () => {
    const result = enforceQuestionPolicy(
      { question: '' },
      node,
      []
    )

    expect(result.question).toContain('好，我们开始。先聊聊「RAG」')
  })

  it('adds the required opening style when the first LLM question omits it', () => {
    const result = enforceQuestionPolicy(
      { question: '你能说说 RAG 解决的核心问题吗？' },
      node,
      []
    )

    expect(result.question).toBe('好，我们开始。先聊聊「RAG」——你能说说 RAG 解决的核心问题吗？')
  })

  it('does not add a neutral confirmation before the first answer', () => {
    const result = enforceQuestionPolicy(
      { question: '好的，你能说说 RAG 是什么吗？' },
      node,
      []
    )

    expect(result.question).toBe('好，我们开始。先聊聊「RAG」——你能说说 RAG 是什么吗？')
    expect(result.question).not.toContain('——好的')
  })

  it('strips common neutral confirmations from the opening question', () => {
    const result = enforceQuestionPolicy(
      { question: 'OK，你能说说 RAG 解决的核心问题吗？' },
      node,
      []
    )

    expect(result.question).toBe('好，我们开始。先聊聊「RAG」——你能说说 RAG 解决的核心问题吗？')
    expect(result.question).not.toContain('——OK')
  })

  it('keeps empty-answer follow-up at the understanding layer', () => {
    const result = enforceQuestionPolicy(
      { question: '' },
      node,
      [
        { role: 'assistant', content: 'RAG 是什么？' },
        { role: 'user', content: '用户未能作答' },
      ]
    )

    expect(result.question).toContain('RAG')
    expect(result.question).not.toContain('刚才')
  })

  it('does not return a completion signal after three user answers', () => {
    const result = enforceQuestionPolicy(
      { question: '能再展开说说吗？' },
      node,
      [
        { role: 'assistant', content: 'RAG 是什么？' },
        { role: 'user', content: '回答 1' },
        { role: 'assistant', content: '为什么需要它？' },
        { role: 'user', content: '回答 2' },
        { role: 'assistant', content: '边界是什么？' },
        { role: 'user', content: '回答 3' },
      ]
    )

    expect(result).toEqual({ question: '能再展开说说吗？' })
  })
})

describe('getNextQuestion', () => {
  const node: KnowledgeNode = {
    id: 'node-1',
    name: 'RAG',
    context: '检索增强生成',
    sourceExcerpt: 'RAG 会先检索相关文档片段，再把片段作为上下文交给大模型生成回答。',
  }

  it('falls back to a local follow-up when the LLM returns an empty response before two answers', async () => {
    vi.mocked(chat).mockRejectedValueOnce(new Error('LLM returned empty response'))

    const result = await getNextQuestion(node, [
      { role: 'assistant', content: 'RAG 是什么？' },
      { role: 'user', content: 'RAG 是检索增强生成。' },
    ])

    expect(result.question).toContain('RAG')
  })

  it('retries once before using the local fallback', async () => {
    vi.mocked(chat)
      .mockRejectedValueOnce(new Error('LLM returned empty response'))
      .mockResolvedValueOnce(JSON.stringify({ question: '你能举一个 RAG 的使用场景吗？' }))

    const result = await getNextQuestion(node, [
      { role: 'assistant', content: 'RAG 是什么？' },
      { role: 'user', content: 'RAG 是检索增强生成。' },
    ])

    expect(chat).toHaveBeenCalledTimes(2)
    expect(result.question).toBe('你能举一个 RAG 的使用场景吗？')
  })

  it('does not call the LLM after three user answers', async () => {
    const result = await getNextQuestion(node, [
      { role: 'assistant', content: 'RAG 是什么？' },
      { role: 'user', content: '回答 1' },
      { role: 'assistant', content: '为什么需要它？' },
      { role: 'user', content: '回答 2' },
      { role: 'assistant', content: '边界是什么？' },
      { role: 'user', content: '回答 3' },
    ])

    expect(chat).not.toHaveBeenCalled()
    expect(result.question).toBe('')
  })
})
