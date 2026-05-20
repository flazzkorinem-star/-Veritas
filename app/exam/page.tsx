'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getDialogueStatus, useExam } from '@/store/examStore'
import { readApiJson } from '@/lib/apiResponse'
import {
  appendTranscript,
  appendTurnToNodeConversations,
  buildNodeTransition,
  createSupportRecord,
  getDeepDiveStartLevel,
  getLevelAfterNextAction,
  shouldRequestInitialQuestion,
} from '@/lib/examFlow'
import {
  CognitiveLevel,
  ExamReport,
  NodeConversation,
  QuestionNextAction,
  QuestionResponse,
  SupportKind,
  SupportRecord,
} from '@/lib/types'
import Mascot from '@/components/Mascot'
import VoiceInput from '@/components/VoiceInput'

type QuestionRequestType = 'normal' | 'hint' | 'answer'

type StructuredQuestionResponse = QuestionResponse & {
  reply: string
  currentLevel: CognitiveLevel
  passedCurrentLevel: boolean
  nextAction: QuestionNextAction
  blindSpotSummary: string
  supportUsed?: SupportKind | 'none'
  supportRecords?: SupportRecord[]
  nextLevel?: CognitiveLevel
}

type QuestionApiResponse = Partial<StructuredQuestionResponse> & {
  error?: string
}

interface EvaluateApiResponse extends ExamReport {
  error?: string
}

interface RetryQuestionRequest {
  userAnswer: string
  requestType: QuestionRequestType
  levelOverride?: CognitiveLevel
}

interface FetchQuestionOptions extends RetryQuestionRequest {
  baseConversations?: NodeConversation[]
}

const levelLabels: Record<CognitiveLevel, string> = {
  memory: '记忆',
  understanding: '理解',
  application: '应用',
  analysis: '分析',
  evaluation: '评价',
  creation: '创造',
}

function getLastAssistantQuestion(turns: { role: 'assistant' | 'user'; content: string }[]): string {
  return [...turns].reverse().find((turn) => turn.role === 'assistant')?.content ?? ''
}

export default function ExamPage() {
  const { state, dispatch, isHydrated } = useExam()
  const router = useRouter()
  const [textAnswer, setTextAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [retryQuestionRequest, setRetryQuestionRequest] = useState<RetryQuestionRequest | null>(null)
  const [retryReportConversations, setRetryReportConversations] = useState<NodeConversation[] | null>(null)
  const historyEndRef = useRef<HTMLDivElement>(null)
  const initialQuestionRequestedRef = useRef<string | null>(null)

  const currentNode = state.nodes[state.currentNodeIndex]
  const currentConversation = state.nodeConversations[state.currentNodeIndex]
  const turns = currentConversation?.turns ?? []
  const currentNodeId = currentNode?.id
  const currentLevelStates = currentNodeId ? state.nodeLevelStates[currentNodeId] ?? [] : []
  const currentPathState = currentNodeId ? state.nodePathStates[currentNodeId] : undefined
  const dialogueStatus = getDialogueStatus(state.currentAgentResponse)
  const waitingForDeepDiveChoice = dialogueStatus === 'deep_dive_choice'
  const waitingForReportRetry = retryReportConversations !== null

  // Wait for hydration before redirecting
  useEffect(() => {
    if (isHydrated && state.phase === 'idle') router.push('/')
  }, [state.phase, router, isHydrated])

  // Fetch first question when a new node starts
  useEffect(() => {
    if (shouldRequestInitialQuestion({
      isHydrated,
      phase: state.phase,
      currentNodeId: currentNode?.id,
      turnCount: turns.length,
      submitting,
      requestedNodeId: initialQuestionRequestedRef.current,
    })) {
      initialQuestionRequestedRef.current = currentNode.id
      runFetch({ userAnswer: '', requestType: 'normal' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentNodeIndex, state.phase, isHydrated])

  // Auto-scroll to bottom of history
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns.length])

  useEffect(() => {
    if (state.phase !== 'examining') return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [state.phase])

  function normalizeQuestionResponse(
    data: QuestionApiResponse,
    fallbackLevel: CognitiveLevel,
    conversationTurns: typeof turns
  ): StructuredQuestionResponse {
    const reply = (data.reply ?? data.question)?.trim()
    const passedCurrentLevel = data.passedCurrentLevel ?? data.levelPassed
    if (!reply || !data.nextAction || typeof passedCurrentLevel !== 'boolean') {
      throw new Error('服务器返回的数据不完整，请稍后重试')
    }

    const response: StructuredQuestionResponse = {
      ...data,
      question: data.question ?? reply,
      reply,
      currentLevel: data.currentLevel ?? fallbackLevel,
      passedCurrentLevel,
      nextAction: data.nextAction,
      blindSpotSummary: data.blindSpotSummary ?? '',
      supportRecords: data.supportRecords ?? [],
    }

    if (data.supportUsed && data.supportUsed !== 'none' && (response.supportRecords?.length ?? 0) === 0) {
      response.supportRecords = [
        createSupportRecord({
          kind: data.supportUsed,
          level: response.currentLevel,
          question: getLastAssistantQuestion(conversationTurns),
          content: response.reply,
        }),
      ]
    }

    return response
  }

  async function completeCurrentNode(nodeConversations: NodeConversation[]): Promise<void> {
    const isLastNode = state.currentNodeIndex >= state.nodes.length - 1
    if (isLastNode) {
      await runEvaluate(nodeConversations)
      return
    }

    const nextNode = state.nodes[state.currentNodeIndex + 1]
    dispatch({
      type: 'ADD_TURN',
      turn: {
        role: 'assistant',
        content: buildNodeTransition(currentNode.name, nextNode.name),
      },
    })
    dispatch({ type: 'NEXT_NODE' })
  }

  async function runFetch({
    userAnswer,
    requestType,
    levelOverride,
    baseConversations,
  }: FetchQuestionOptions): Promise<void> {
    if (!currentNode) return
    setRetryQuestionRequest(null)
    try {
      const shouldCommitUserTurn = requestType === 'normal' && Boolean(userAnswer)
      const startingConversations = baseConversations ?? state.nodeConversations
      const nextNodeConversations = shouldCommitUserTurn
        ? appendTurnToNodeConversations(startingConversations, state.currentNodeIndex, {
            role: 'user',
            content: userAnswer,
          })
        : startingConversations

      const conversationTurns = nextNodeConversations[state.currentNodeIndex]?.turns ?? turns
      const effectiveLevel = levelOverride ?? state.currentLevel

      const res = await fetch('/api/question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          node: currentNode,
          currentLevel: effectiveLevel,
          levelStates: currentLevelStates,
          conversationHistory: conversationTurns,
          requestType,
        }),
      })
      const data = await readApiJson<QuestionApiResponse>(res)
      if (!res.ok) throw new Error(data.error || '请求失败')
      const response = normalizeQuestionResponse(data, effectiveLevel, conversationTurns)
      const nextNodeConversationsWithAssistant = appendTurnToNodeConversations(
        nextNodeConversations,
        state.currentNodeIndex,
        { role: 'assistant', content: response.reply }
      )

      // Commit user turn only after a successful API response
      if (shouldCommitUserTurn) {
        dispatch({ type: 'ADD_TURN', turn: { role: 'user', content: userAnswer } })
      }

      dispatch({ type: 'ADD_TURN', turn: { role: 'assistant', content: response.reply } })
      dispatch({ type: 'SET_AGENT_RESPONSE', response })

      if (response.nextAction === 'advance_next_level') {
        dispatch({
          type: 'SET_CURRENT_LEVEL',
          level: response.nextLevel ?? getLevelAfterNextAction({
            currentLevel: response.currentLevel,
            nextAction: response.nextAction,
            suitableLevels: currentNode.suitableLevels,
          }),
        })
      }

      if (response.nextAction === 'offer_deep_dive') {
        dispatch({ type: 'COMPLETE_QUICK_PATH' })
      }

      if (response.nextAction === 'complete_node') {
        if (response.currentLevel === 'application' && response.passedCurrentLevel) {
          dispatch({ type: 'COMPLETE_QUICK_PATH' })
        }
        await completeCurrentNode(nextNodeConversationsWithAssistant)
      }

      setSubmitting(false)
      if (requestType === 'normal' && userAnswer) setTextAnswer('')
    } catch {
      if (!userAnswer && requestType === 'normal') {
        initialQuestionRequestedRef.current = null
      }
      setSubmitting(false)
      setRetryQuestionRequest({ userAnswer, requestType, levelOverride })
      dispatch({ type: 'SET_ERROR', error: '生成出现问题，请重试或回到首页' })
    }
  }

  async function runEvaluate(nodeConversations: NodeConversation[] = state.nodeConversations) {
    setRetryReportConversations(null)
    dispatch({ type: 'START_REPORTING' })
    try {
      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeConversations }),
      })
      const report = await readApiJson<EvaluateApiResponse>(res)
      if (!res.ok) throw new Error(report.error)
      if (!Array.isArray(report.nodes)) throw new Error('服务器返回的数据不完整，请稍后重试')
      dispatch({ type: 'SET_REPORT', report })
      router.push('/report')
    } catch {
      setRetryReportConversations(nodeConversations)
      dispatch({ type: 'REPORT_FAILED', error: '报告生成出现问题' })
    }
    setSubmitting(false)
  }

  const handleSubmit = async () => {
    const answer = textAnswer.trim() || '用户未能作答'
    if (submitting || waitingForDeepDiveChoice) return
    dispatch({ type: 'SET_ERROR', error: '' })
    setSubmitting(true)
    await runFetch({ userAnswer: answer, requestType: 'normal' })
  }

  const handleHint = async () => {
    if (submitting || waitingForDeepDiveChoice || waitingForReportRetry) return
    dispatch({ type: 'SET_ERROR', error: '' })
    setSubmitting(true)
    await runFetch({ userAnswer: '', requestType: 'hint' })
  }

  const handleAnswer = async () => {
    if (submitting || waitingForDeepDiveChoice || waitingForReportRetry) return
    dispatch({ type: 'SET_ERROR', error: '' })
    setSubmitting(true)
    await runFetch({ userAnswer: '', requestType: 'answer' })
  }

  const handleCompleteNode = async () => {
    if (submitting) return
    dispatch({ type: 'SET_ERROR', error: '' })
    const nextNodeConversations = appendTurnToNodeConversations(
      state.nodeConversations,
      state.currentNodeIndex,
      { role: 'user', content: '完成这个节点' }
    )
    dispatch({ type: 'ADD_TURN', turn: { role: 'user', content: '完成这个节点' } })
    setSubmitting(true)
    await completeCurrentNode(nextNodeConversations)
    setSubmitting(false)
  }

  const handleEnterDeepPath = async () => {
    if (submitting || !currentNode) return
    const deepLevel = getDeepDiveStartLevel(currentNode.suitableLevels)
    if (!deepLevel) {
      await handleCompleteNode()
      return
    }

    dispatch({ type: 'SET_ERROR', error: '' })
    const nextNodeConversations = appendTurnToNodeConversations(
      state.nodeConversations,
      state.currentNodeIndex,
      { role: 'user', content: '继续深入这个节点' }
    )
    dispatch({ type: 'ADD_TURN', turn: { role: 'user', content: '继续深入这个节点' } })
    dispatch({ type: 'ENTER_DEEP_PATH' })
    setSubmitting(true)
    await runFetch({
      userAnswer: '',
      requestType: 'normal',
      levelOverride: deepLevel,
      baseConversations: nextNodeConversations,
    })
  }

  const handleRetryQuestion = async () => {
    if (retryQuestionRequest === null || submitting) return
    dispatch({ type: 'SET_ERROR', error: '' })
    setSubmitting(true)
    await runFetch(retryQuestionRequest)
  }

  const handleRetryReport = async () => {
    if (retryReportConversations === null || submitting) return
    dispatch({ type: 'SET_ERROR', error: '' })
    setSubmitting(true)
    await runEvaluate(retryReportConversations)
  }

  const handleBackHome = () => {
    dispatch({ type: 'RESET' })
    router.push('/')
  }

  if (!isHydrated) return null

  if (state.phase === 'reporting') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Mascot mood="thinking" message="正在生成你的评估报告..." />
      </div>
    )
  }

  if (!currentNode) return null

  return (
    <main className="min-h-screen bg-[#f6f7fb]">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
        <div className="w-full space-y-2">
          <div className="flex justify-between text-sm text-gray-500">
            <span>知识节点 {state.currentNodeIndex + 1} / {state.nodes.length}</span>
            <span>当前层级：{levelLabels[state.currentLevel]}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${((state.currentNodeIndex + 1) / state.nodes.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Node label */}
        <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4 shadow-sm">
          <p className="text-xs font-medium text-gray-400">当前节点</p>
          <p className="text-lg font-semibold text-gray-900">{currentNode.name}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {currentLevelStates.map((levelState) => (
              <span
                key={levelState.level}
                className={`rounded-full px-2.5 py-1 ${
                  levelState.level === state.currentLevel
                    ? 'bg-blue-100 text-blue-700'
                    : levelState.status === 'passed'
                      ? 'bg-emerald-50 text-emerald-700'
                      : levelState.status === 'not_applicable'
                        ? 'bg-gray-100 text-gray-400'
                        : 'bg-gray-50 text-gray-600'
                }`}
              >
                {levelLabels[levelState.level]}：{levelState.status === 'passed' ? '通过' : levelState.status === 'not_applicable' ? '不适用' : '进行中'}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            快速路径：{currentPathState?.quickPath === 'completed' ? '已完成' : '进行中'}
            {' · '}
            深入路径：{currentPathState?.deepPath === 'not_applicable' ? '不适用' : currentPathState?.deepPath === 'in_progress' ? '进行中' : '未开始'}
          </p>
        </div>

        {/* Conversation history — all turns including current question */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          {turns.length === 0 ? (
            <div className="p-6 flex justify-center">
              <Mascot mood="thinking" message="正在思考第一个问题..." />
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto p-5 space-y-4">
              {turns.map((turn, i) => (
                <div key={i} className={`flex gap-3 ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {turn.role === 'assistant' && (
                    <span className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-lg shrink-0 mt-1">🧐</span>
                  )}
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed max-w-[82%] shadow-sm ${
                      turn.role === 'assistant'
                        ? 'bg-[#eef5ff] text-slate-900 rounded-tl-sm'
                        : 'bg-[#2563eb] text-white rounded-tr-sm'
                    }`}
                  >
                    {turn.content}
                  </div>
                </div>
              ))}
              {submitting && (
                <div className="flex justify-start gap-3">
                  <span className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-lg">🧐</span>
                  <div className="bg-[#eef5ff] text-blue-500 rounded-2xl rounded-tl-sm px-4 py-3 text-sm shadow-sm">
                    思考中...
                  </div>
                </div>
              )}
              <div ref={historyEndRef} />
            </div>
          )}
        </div>

        {state.error && (
          <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl p-4 text-sm space-y-3">
            <p>{state.error}</p>
            {retryQuestionRequest !== null && (
              <div className="flex gap-2">
                <button
                  onClick={handleRetryQuestion}
                  disabled={submitting}
                  className="rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                >
                  重试生成当前回复
                </button>
                <button
                  onClick={handleBackHome}
                  disabled={submitting}
                  className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 disabled:opacity-50"
                >
                  回到首页
                </button>
              </div>
            )}
            {retryReportConversations !== null && (
              <div className="flex gap-2">
                <button
                  onClick={handleRetryReport}
                  disabled={submitting}
                  className="rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                >
                  重试生成报告
                </button>
                <button
                  onClick={handleBackHome}
                  disabled={submitting}
                  className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 disabled:opacity-50"
                >
                  回到首页
                </button>
              </div>
            )}
          </div>
        )}

        {waitingForDeepDiveChoice && (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-sm text-amber-900 space-y-3">
            <p>快速路径已完成。你可以结束这个节点，也可以继续进入更高层级。</p>
            <div className="flex gap-2">
              <button
                onClick={handleCompleteNode}
                disabled={submitting || waitingForReportRetry}
                className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
              >
                完成这个节点
              </button>
              <button
                onClick={handleEnterDeepPath}
                disabled={submitting || waitingForReportRetry}
                className="rounded-lg border border-amber-200 bg-white px-4 py-2 text-xs font-medium text-amber-700 disabled:opacity-50"
              >
                继续深入
              </button>
            </div>
          </div>
        )}

        {/* Answer input */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm space-y-3">
          <VoiceInput
            onTranscript={(text) => setTextAnswer((current) => appendTranscript(current, text))}
            disabled={submitting || waitingForReportRetry || waitingForDeepDiveChoice}
          />
          <textarea
            value={textAnswer}
            onChange={(e) => setTextAnswer(e.target.value)}
            placeholder="在这里打字回答..."
            rows={3}
            className="w-full border border-gray-200 rounded-xl p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-300 bg-gray-50"
            disabled={submitting || waitingForReportRetry || waitingForDeepDiveChoice}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) handleSubmit() }}
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleHint}
              disabled={submitting || waitingForReportRetry || waitingForDeepDiveChoice}
              className="rounded-xl border border-blue-100 bg-blue-50 py-2.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50"
            >
              给我提示
            </button>
            <button
              onClick={handleAnswer}
              disabled={submitting || waitingForReportRetry || waitingForDeepDiveChoice}
              className="rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
            >
              给我答案
            </button>
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting || waitingForReportRetry || waitingForDeepDiveChoice}
            className="w-full bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-50"
          >
            {submitting ? '思考中...' : '提交回答 →'}
          </button>
        </div>
      </div>
    </main>
  )
}
