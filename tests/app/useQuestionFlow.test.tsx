// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestQuestion } from '../../app/exam/_lib/questionApi'
import { useQuestionFlow } from '../../app/exam/_hooks/useQuestionFlow'
import { initialState, reducer } from '../../store/examStore'
import type { KnowledgeNode } from '../../lib/types'

vi.mock('../../app/exam/_lib/questionApi', () => ({
  requestQuestion: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

const nodes: KnowledgeNode[] = [
  {
    id: 'node-1',
    name: 'RAG',
    context: '检索增强生成用于降低幻觉。',
    sourceExcerpt: 'RAG 会先检索相关文档片段，再交给模型生成回答。',
    suitableLevels: ['memory', 'understanding', 'application'],
    priorityReason: '能考察定义、理解和应用。',
  },
]

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve
  })
  return { promise, resolve }
}

describe('useQuestionFlow', () => {
  it('先显示用户气泡，再请求 Agent 回复', async () => {
    const deferred = createDeferred({
      question: '你说得接近了。',
      reply: '你说得接近了。',
      currentLevel: 'memory' as const,
      passedCurrentLevel: true,
      nextAction: 'advance_next_level' as const,
      blindSpotSummary: '',
    })
    vi.mocked(requestQuestion).mockReturnValueOnce(deferred.promise)

    const state = {
      ...reducer(initialState, { type: 'SET_NODES', nodes }),
      nodeConversations: [
        {
          node: nodes[0],
          turns: [
            { role: 'assistant' as const, content: 'RAG 是什么？' },
          ],
        },
      ],
    }
    const dispatch = vi.fn()
    const setSubmitting = vi.fn()
    const setTextAnswer = vi.fn()

    const { result } = renderHook(() => useQuestionFlow({
      state,
      dispatch,
      isHydrated: true,
      submitting: false,
      setSubmitting,
      textAnswer: 'RAG 是先检索资料，再让模型回答。',
      setTextAnswer,
      hasActiveDiagnosis: true,
      isBusy: false,
      waitingForDeepDiveChoice: false,
      waitingForReportRetry: false,
      answerChoicePending: false,
      handlePastedMaterial: vi.fn(),
      runEvaluate: vi.fn(),
    }))

    let submitPromise!: Promise<void>
    await act(async () => {
      submitPromise = result.current.handleSubmit()
      await Promise.resolve()
    })

    const userTurnCallIndex = dispatch.mock.calls.findIndex(([action]) => (
      action.type === 'ADD_TURN' && action.turn.role === 'user'
    ))
    expect(userTurnCallIndex).toBeGreaterThanOrEqual(0)
    expect(dispatch.mock.calls[userTurnCallIndex][0]).toMatchObject({
      type: 'ADD_TURN',
      nodeId: 'node-1',
      turn: {
        role: 'user',
        content: 'RAG 是先检索资料，再让模型回答。',
      },
    })
    expect(setTextAnswer).toHaveBeenCalledWith('')
    expect(requestQuestion).toHaveBeenCalledWith(expect.objectContaining({
      conversationHistory: [
        {
          role: 'assistant',
          content: 'RAG 是什么？',
        },
        {
          role: 'user',
          content: 'RAG 是先检索资料，再让模型回答。',
        },
      ],
    }))
    expect(dispatch.mock.invocationCallOrder[userTurnCallIndex]).toBeLessThan(
      vi.mocked(requestQuestion).mock.invocationCallOrder[0]
    )

    deferred.resolve({
      question: '你说得接近了。',
      reply: '你说得接近了。',
      currentLevel: 'memory',
      passedCurrentLevel: true,
      nextAction: 'advance_next_level',
      blindSpotSummary: '',
    })
    await act(async () => {
      await submitPromise
    })
  })

  it('失败后重试不会重复插入用户气泡', async () => {
    vi.mocked(requestQuestion)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        question: '继续聊。',
        reply: '继续聊。',
        currentLevel: 'memory',
        passedCurrentLevel: false,
        nextAction: 'continue_current_level',
        blindSpotSummary: '',
      })

    let currentState = {
      ...reducer(initialState, { type: 'SET_NODES', nodes }),
      nodeConversations: [
        {
          node: nodes[0],
          turns: [
            { role: 'assistant' as const, content: 'RAG 是什么？' },
          ],
        },
      ],
    }
    const dispatch = vi.fn((action) => {
      currentState = reducer(currentState, action)
    })
    const setSubmitting = vi.fn()
    const setTextAnswer = vi.fn()

    const { result, rerender } = renderHook(
      ({ state }) => useQuestionFlow({
        state,
        dispatch,
        isHydrated: true,
        submitting: false,
        setSubmitting,
        textAnswer: 'RAG 是先检索资料，再让模型回答。',
        setTextAnswer,
        hasActiveDiagnosis: true,
        isBusy: false,
        waitingForDeepDiveChoice: false,
        waitingForReportRetry: false,
        answerChoicePending: false,
        handlePastedMaterial: vi.fn(),
        runEvaluate: vi.fn(),
      }),
      { initialProps: { state: currentState } }
    )

    await act(async () => {
      await result.current.handleSubmit()
    })
    rerender({ state: currentState })

    expect(result.current.retryQuestionRequest).toMatchObject({
      userAnswer: 'RAG 是先检索资料，再让模型回答。',
      requestType: 'normal',
      commitUserTurn: false,
    })
    expect(setTextAnswer).toHaveBeenCalledTimes(1)
    expect(setTextAnswer).toHaveBeenCalledWith('')
    expect(dispatch.mock.calls.filter(([action]) => (
      action.type === 'ADD_TURN' && action.turn.role === 'user'
    ))).toHaveLength(1)

    await act(async () => {
      await result.current.handleRetryQuestion()
    })

    expect(dispatch.mock.calls.filter(([action]) => (
      action.type === 'ADD_TURN' && action.turn.role === 'user'
    ))).toHaveLength(1)
    expect(requestQuestion).toHaveBeenLastCalledWith(expect.objectContaining({
      conversationHistory: [
        {
          role: 'assistant',
          content: 'RAG 是什么？',
        },
        {
          role: 'user',
          content: 'RAG 是先检索资料，再让模型回答。',
        },
      ],
    }))
  })

  it.each([
    ['handleHint', '给我提示', 'hint'],
    ['handleAnswer', '给我答案', 'answer'],
  ] as const)('%s 会先显示用户气泡，再请求 Agent 回复', async (handlerName, userText, requestType) => {
    const deferred = createDeferred({
      question: '继续聊。',
      reply: '继续聊。',
      currentLevel: 'memory' as const,
      passedCurrentLevel: false,
      nextAction: 'continue_current_level' as const,
      blindSpotSummary: '',
    })
    vi.mocked(requestQuestion).mockReturnValueOnce(deferred.promise)

    const state = {
      ...reducer(initialState, { type: 'SET_NODES', nodes }),
      nodeConversations: [
        {
          node: nodes[0],
          turns: [
            { role: 'assistant' as const, content: 'RAG 是什么？' },
          ],
        },
      ],
    }
    const dispatch = vi.fn()

    const { result } = renderHook(() => useQuestionFlow({
      state,
      dispatch,
      isHydrated: true,
      submitting: false,
      setSubmitting: vi.fn(),
      textAnswer: '',
      setTextAnswer: vi.fn(),
      hasActiveDiagnosis: true,
      isBusy: false,
      waitingForDeepDiveChoice: false,
      waitingForReportRetry: false,
      answerChoicePending: false,
      handlePastedMaterial: vi.fn(),
      runEvaluate: vi.fn(),
    }))

    let actionPromise!: Promise<void>
    await act(async () => {
      actionPromise = result.current[handlerName]()
      await Promise.resolve()
    })

    const userTurnCallIndex = dispatch.mock.calls.findIndex(([action]) => (
      action.type === 'ADD_TURN' && action.turn.role === 'user'
    ))
    expect(userTurnCallIndex).toBeGreaterThanOrEqual(0)
    expect(dispatch.mock.calls[userTurnCallIndex][0]).toMatchObject({
      type: 'ADD_TURN',
      nodeId: 'node-1',
      turn: {
        role: 'user',
        content: userText,
      },
    })
    expect(requestQuestion).toHaveBeenCalledWith(expect.objectContaining({
      requestType,
      conversationHistory: [
        {
          role: 'assistant',
          content: 'RAG 是什么？',
        },
        {
          role: 'user',
          content: userText,
        },
      ],
    }))
    expect(dispatch.mock.invocationCallOrder[userTurnCallIndex]).toBeLessThan(
      vi.mocked(requestQuestion).mock.invocationCallOrder[0]
    )

    deferred.resolve({
      question: '继续聊。',
      reply: '继续聊。',
      currentLevel: 'memory',
      passedCurrentLevel: false,
      nextAction: 'continue_current_level',
      blindSpotSummary: '',
    })
    await act(async () => {
      await actionPromise
    })
  })
})
