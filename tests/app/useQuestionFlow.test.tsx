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
      isBusy: false,
      waitingForReportRetry: false,
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
        isBusy: false,
        waitingForReportRetry: false,
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
      isBusy: false,
      waitingForReportRetry: false,
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

  it('非末层 answer：标记 answer_assisted、推进下一层并再请求一次开场问题', async () => {
    vi.mocked(requestQuestion)
      .mockResolvedValueOnce({
        reply: '答案：RAG 先检索再生成。',
        currentLevel: 'memory',
        passedCurrentLevel: false,
        nextAction: 'advance_next_level',
        nextLevel: 'understanding',
        blindSpotSummary: '没说清检索与生成的分工',
        supportUsed: 'answer',
        supportRecords: [{ kind: 'answer', level: 'memory', question: 'RAG 是什么？', content: 'RAG 先检索再生成。' }],
      })
      .mockResolvedValueOnce({
        reply: '用自己的话说说 RAG 解决了什么问题？',
        currentLevel: 'understanding',
        passedCurrentLevel: false,
        nextAction: 'continue_current_level',
        blindSpotSummary: '',
      })

    const state = {
      ...reducer(initialState, { type: 'SET_NODES', nodes }),
      nodeConversations: [
        { node: nodes[0], turns: [{ role: 'assistant' as const, content: 'RAG 是什么？' }] },
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
      isBusy: false,
      waitingForReportRetry: false,
      runEvaluate: vi.fn(),
    }))

    await act(async () => {
      await result.current.handleAnswer()
    })

    expect(dispatch.mock.calls.map(([action]) => action)).toContainEqual({
      type: 'UPDATE_NODE_LEVEL_STATUS',
      nodeId: 'node-1',
      level: 'memory',
      status: 'answer_assisted',
      blindSpotSummary: '没说清检索与生成的分工',
    })
    expect(dispatch.mock.calls.map(([action]) => action)).toContainEqual({
      type: 'SET_CURRENT_LEVEL',
      nodeId: 'node-1',
      level: 'understanding',
    })
    expect(requestQuestion).toHaveBeenCalledTimes(2)
    expect(vi.mocked(requestQuestion).mock.calls[1][0]).toMatchObject({
      requestType: 'normal',
      currentLevel: 'understanding',
    })
  })

  it('末层 analysis answer：完成节点并用含 answer_assisted 的层级状态生成报告', async () => {
    vi.mocked(requestQuestion).mockResolvedValueOnce({
      reply: '答案：注意力按相关性分配权重。',
      currentLevel: 'analysis',
      passedCurrentLevel: false,
      nextAction: 'complete_node',
      blindSpotSummary: '没拆出权重分配的因果',
      supportUsed: 'answer',
      supportRecords: [{ kind: 'answer', level: 'analysis', question: '机制是什么？', content: '按相关性分配权重。' }],
    })

    const base = reducer(initialState, { type: 'SET_NODES', nodes })
    const state = {
      ...base,
      currentLevel: 'analysis' as const,
      nodeConversations: [
        { node: nodes[0], turns: [{ role: 'assistant' as const, content: '它的机制是什么？' }] },
      ],
      nodeLevelStates: {
        'node-1': [
          { level: 'memory' as const, status: 'passed' as const },
          { level: 'understanding' as const, status: 'passed' as const },
          { level: 'application' as const, status: 'passed' as const },
          { level: 'analysis' as const, status: 'in_progress' as const },
        ],
      },
    }
    const dispatch = vi.fn()
    const runEvaluate = vi.fn()

    const { result } = renderHook(() => useQuestionFlow({
      state,
      dispatch,
      isHydrated: true,
      submitting: false,
      setSubmitting: vi.fn(),
      textAnswer: '',
      setTextAnswer: vi.fn(),
      isBusy: false,
      waitingForReportRetry: false,
      runEvaluate,
    }))

    await act(async () => {
      await result.current.handleAnswer()
    })

    expect(dispatch.mock.calls.map(([action]) => action)).toContainEqual(
      expect.objectContaining({ type: 'COMPLETE_NODE', nodeId: 'node-1' })
    )
    expect(runEvaluate).toHaveBeenCalledTimes(1)
    const reportedLevelStates = runEvaluate.mock.calls[0][1]['node-1']
    expect(reportedLevelStates).toContainEqual(
      expect.objectContaining({
        level: 'analysis',
        status: 'answer_assisted',
        blindSpotSummary: '没拆出权重分配的因果',
      })
    )
  })
})
