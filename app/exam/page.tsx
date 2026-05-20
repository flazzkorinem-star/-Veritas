'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useExam } from '@/store/examStore'
import { readApiJson } from '@/lib/apiResponse'
import {
  appendTranscript,
  appendTurnToNodeConversations,
  buildNodeTransition,
  getDisplayRound,
  hasReachedNodeAnswerLimit,
  shouldRequestInitialQuestion,
} from '@/lib/examFlow'
import { ExamReport, NodeConversation } from '@/lib/types'
import Mascot from '@/components/Mascot'
import ProgressBar from '@/components/ProgressBar'
import VoiceInput from '@/components/VoiceInput'

interface QuestionApiResponse {
  question?: string
  error?: string
}

interface EvaluateApiResponse extends ExamReport {
  error?: string
}

export default function ExamPage() {
  const { state, dispatch, isHydrated } = useExam()
  const router = useRouter()
  const [textAnswer, setTextAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [retryQuestionAnswer, setRetryQuestionAnswer] = useState<string | null>(null)
  const [retryReportConversations, setRetryReportConversations] = useState<NodeConversation[] | null>(null)
  const historyEndRef = useRef<HTMLDivElement>(null)
  const initialQuestionRequestedRef = useRef<string | null>(null)

  const currentNode = state.nodes[state.currentNodeIndex]
  const currentConversation = state.nodeConversations[state.currentNodeIndex]
  const turns = currentConversation?.turns ?? []
  const currentRound = getDisplayRound(turns)
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
      runFetch('')
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

  async function runFetch(userAnswer: string): Promise<void> {
    setRetryQuestionAnswer(null)
    try {
      const nextNodeConversations = userAnswer
        ? appendTurnToNodeConversations(state.nodeConversations, state.currentNodeIndex, {
            role: 'user',
            content: userAnswer,
          })
        : state.nodeConversations

      const conversationTurns = nextNodeConversations[state.currentNodeIndex]?.turns ?? turns

      if (userAnswer && hasReachedNodeAnswerLimit(conversationTurns)) {
        dispatch({ type: 'ADD_TURN', turn: { role: 'user', content: userAnswer } })
        const isLastNode = state.currentNodeIndex >= state.nodes.length - 1
        if (isLastNode) {
          await runEvaluate(nextNodeConversations)
        } else {
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
        setSubmitting(false)
        setTextAnswer('')
        return
      }

      const res = await fetch('/api/question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node: currentNode, conversationHistory: conversationTurns }),
      })
      const data = await readApiJson<QuestionApiResponse>(res)
      if (!res.ok) throw new Error(data.error || '请求失败')
      if (!data.question) throw new Error('服务器返回的数据不完整，请稍后重试')

      // Commit user turn only after a successful API response
      if (userAnswer) {
        dispatch({ type: 'ADD_TURN', turn: { role: 'user', content: userAnswer } })
      }

      dispatch({ type: 'ADD_TURN', turn: { role: 'assistant', content: data.question } })
      dispatch({ type: 'SET_QUESTION', question: data.question })

      setSubmitting(false)
      setTextAnswer('')
    } catch {
      if (!userAnswer) {
        initialQuestionRequestedRef.current = null
      }
      setSubmitting(false)
      setRetryQuestionAnswer(userAnswer)
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
    if (submitting) return
    dispatch({ type: 'SET_ERROR', error: '' })
    setSubmitting(true)
    await runFetch(answer)
  }

  const handleRetryQuestion = async () => {
    if (retryQuestionAnswer === null || submitting) return
    dispatch({ type: 'SET_ERROR', error: '' })
    setSubmitting(true)
    await runFetch(retryQuestionAnswer)
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
        <ProgressBar
          currentNode={state.currentNodeIndex}
          totalNodes={state.nodes.length}
          currentRound={currentRound}
          maxRounds={3}
        />

        {/* Node label */}
        <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4 shadow-sm">
          <p className="text-xs font-medium text-gray-400">当前节点</p>
          <p className="text-lg font-semibold text-gray-900">{currentNode.name}</p>
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
            {retryQuestionAnswer !== null && (
              <div className="flex gap-2">
                <button
                  onClick={handleRetryQuestion}
                  disabled={submitting}
                  className="rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                >
                  重试生成当前问题
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

        {/* Answer input */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm space-y-3">
          <VoiceInput
            onTranscript={(text) => setTextAnswer((current) => appendTranscript(current, text))}
            disabled={submitting || waitingForReportRetry}
          />
          <textarea
            value={textAnswer}
            onChange={(e) => setTextAnswer(e.target.value)}
            placeholder="在这里打字回答..."
            rows={3}
            className="w-full border border-gray-200 rounded-xl p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-300 bg-gray-50"
            disabled={submitting || waitingForReportRetry}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) handleSubmit() }}
          />
          <button
            onClick={handleSubmit}
            disabled={submitting || waitingForReportRetry}
            className="w-full bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-50"
          >
            {submitting ? '思考中...' : '提交回答 →'}
          </button>
        </div>
      </div>
    </main>
  )
}
