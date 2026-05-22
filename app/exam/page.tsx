'use client'

import { useEffect, useRef, useState } from 'react'
import { getDialogueStatus, useExam } from '@/store/examStore'
import { readApiJson } from '@/lib/apiResponse'
import { calculateQuickPathScore } from '@/lib/score'
import {
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
  KnowledgeNode,
  NodeConversation,
  QuestionNextAction,
  QuestionResponse,
  SupportKind,
  SupportRecord,
} from '@/lib/types'
import ReportCard from '@/components/ReportCard'

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

interface AnalyzeResponse {
  nodes?: KnowledgeNode[]
  documentContent?: string
  contentWarning?: string
  error?: string
}

const MAX_FILE_BYTES = 10 * 1024 * 1024
const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.pptx', '.txt', '.md', '.markdown']
const EXPECTED_MIME: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
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

function isTextLikeMime(mime: string): boolean {
  return (
    mime.startsWith('text/')
    || mime === 'application/octet-stream'
    || mime === 'application/markdown'
    || mime === 'application/x-markdown'
  )
}

function formatPathProgress(progress: string | undefined): string {
  if (progress === 'completed') return '已完成'
  if (progress === 'in_progress') return '进行中'
  if (progress === 'not_applicable') return '不适用'
  return '未开始'
}

function getLevelStatusLabel(status: string | undefined): string {
  if (status === 'passed') return '✓'
  if (status === 'in_progress') return '当前'
  if (status === 'not_applicable') return '不适用'
  if (status === 'failed') return '未通过'
  return '未开始'
}

function createRecordTitle(fileName: string): string {
  const withoutExtension = fileName.replace(/\.(pdf|docx|pptx|txt|md|markdown)$/i, '')
  return withoutExtension
    .replace(/[_-]+/g, ' ')
    .replace(/\bweek\s*([0-9]+)\b/gi, 'WEEK$1')
    .replace(/\s*[:：]\s*/g, ': ')
    .replace(/\s+/g, ' ')
    .trim() || '当前诊断'
}

const nodeBookColors = ['#5C6BC0', '#58CC02', '#FFA726', '#EC407A', '#26C6DA', '#7E57C2', '#66BB6A', '#FF7043']

export default function ExamPage() {
  const { state, dispatch, isHydrated } = useExam()
  const [textAnswer, setTextAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeMessage, setAnalyzeMessage] = useState('')
  const [analyzeWarning, setAnalyzeWarning] = useState('')
  const [materialTitle, setMaterialTitle] = useState('当前诊断')
  const [reportOpen, setReportOpen] = useState(false)
  const [retryQuestionRequest, setRetryQuestionRequest] = useState<RetryQuestionRequest | null>(null)
  const [retryReportConversations, setRetryReportConversations] = useState<NodeConversation[] | null>(null)
  const historyEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
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
  const hasActiveDiagnosis = state.nodes.length > 0
  const currentScore = currentNodeId ? calculateQuickPathScore(currentLevelStates) : 0
  const isBusy = submitting || analyzing || state.phase === 'reporting'
  const actionDisabled = isBusy || waitingForReportRetry || waitingForDeepDiveChoice || !currentNode || state.phase !== 'examining'
  const displayedTitle = materialTitle !== '当前诊断'
    ? materialTitle
    : currentNode?.name ?? '当前诊断'

  const getNodeStageText = (nodeId: string, index: number): string => {
    if (index === state.currentNodeIndex) return levelLabels[state.currentLevel]
    const levelStates = state.nodeLevelStates[nodeId] ?? []
    const inProgress = levelStates.find((levelState) => levelState.status === 'in_progress')
    if (inProgress) return levelLabels[inProgress.level]
    if (levelStates.some((levelState) => levelState.status === 'passed')) return '已开始'
    return '未开始'
  }

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

  async function analyzeMaterial(file: File): Promise<void> {
    setAnalyzing(true)
    setAnalyzeMessage('正在读取材料...')
    setAnalyzeWarning('')
    dispatch({ type: 'SET_ERROR', error: '' })
    let analyzeMessageTimer: number | undefined

    try {
      const formData = new FormData()
      formData.append('file', file)
      analyzeMessageTimer = window.setTimeout(() => {
        setAnalyzeMessage('正在抽取高价值知识节点...')
      }, 600)

      const res = await fetch('/api/analyze', { method: 'POST', body: formData })
      window.clearTimeout(analyzeMessageTimer)
      analyzeMessageTimer = undefined
      const data = await readApiJson<AnalyzeResponse>(res)

      if (!res.ok) throw new Error(data.error || '分析失败')
      if (!data.documentContent || !Array.isArray(data.nodes)) {
        throw new Error('服务器返回的数据不完整，请稍后重试')
      }

      dispatch({ type: 'START_ANALYZING', content: data.documentContent })
      dispatch({ type: 'SET_NODES', nodes: data.nodes })
      setMaterialTitle(createRecordTitle(file.name))
      setAnalyzeWarning(data.contentWarning ?? '')
      setAnalyzeMessage(`识别到 ${data.nodes.length} 个核心节点`)
      window.setTimeout(() => setAnalyzeMessage(''), 1400)
    } catch (error) {
      dispatch({
        type: 'SET_ERROR',
        error: error instanceof Error ? error.message : '分析失败，请重试',
      })
      setAnalyzeMessage('')
    } finally {
      if (analyzeMessageTimer) window.clearTimeout(analyzeMessageTimer)
      setAnalyzing(false)
    }
  }

  function validateMaterialFile(selectedFile: File): string | null {
    const lowerName = selectedFile.name.toLowerCase()
    const extension = SUPPORTED_EXTENSIONS.find((ext) => lowerName.endsWith(ext))
    if (!extension) return '文件读取失败，请检查文件格式是否正确'
    if (selectedFile.type && EXPECTED_MIME[extension] && !EXPECTED_MIME[extension].includes(selectedFile.type)) {
      return '文件读取失败，请检查文件格式是否正确'
    }
    if (selectedFile.type && ['.txt', '.md', '.markdown'].includes(extension) && !isTextLikeMime(selectedFile.type)) {
      return '文件读取失败，请检查文件格式是否正确'
    }
    if (selectedFile.size > MAX_FILE_BYTES) return '文件过大，请压缩后重新上传'
    return null
  }

  async function handleMaterialFile(file: File | undefined): Promise<void> {
    if (!file || analyzing) return
    const validationError = validateMaterialFile(file)
    if (validationError) {
      dispatch({ type: 'SET_ERROR', error: validationError })
      return
    }
    await analyzeMaterial(file)
  }

  async function handlePastedMaterial(): Promise<void> {
    const content = textAnswer.trim()
    if (!content) {
      dispatch({ type: 'SET_ERROR', error: '请先上传文件或粘贴一段材料' })
      return
    }
    if (content.length < 80) {
      dispatch({ type: 'SET_ERROR', error: '材料太短，请粘贴更完整的内容' })
      return
    }
    const file = new File([content], 'veritas-material.txt', { type: 'text/plain' })
    await analyzeMaterial(file)
    setTextAnswer('')
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
        body: JSON.stringify({
          nodeConversations,
          nodeLevelStates: state.nodeLevelStates,
        }),
      })
      const report = await readApiJson<EvaluateApiResponse>(res)
      if (!res.ok) throw new Error(report.error)
      if (!Array.isArray(report.nodes)) throw new Error('服务器返回的数据不完整，请稍后重试')
      dispatch({ type: 'SET_REPORT', report })
      setReportOpen(true)
    } catch {
      setRetryReportConversations(nodeConversations)
      dispatch({ type: 'REPORT_FAILED', error: '报告生成出现问题' })
    }
    setSubmitting(false)
  }

  const handleSubmit = async () => {
    const answer = textAnswer.trim()
    if (isBusy || waitingForDeepDiveChoice) return
    if (!hasActiveDiagnosis) {
      await handlePastedMaterial()
      return
    }
    if (state.phase !== 'examining') return
    if (!answer) {
      dispatch({ type: 'SET_ERROR', error: '请先输入你的回答' })
      return
    }
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
    if (hasActiveDiagnosis && !window.confirm('当前诊断还没有保存到本地历史。新建诊断会清空当前内容，确定继续吗？')) {
      return
    }
    dispatch({ type: 'RESET' })
    setTextAnswer('')
    setReportOpen(false)
    setMaterialTitle('当前诊断')
  }

  if (!isHydrated) return null

  return (
    <main className="h-screen overflow-hidden bg-[#F8F9FA] text-slate-900">
      <div className="grid h-full grid-cols-[260px_minmax(0,1fr)_360px]">
        <aside className="flex min-h-0 flex-col border-r border-slate-200 bg-white/85">
          <div className="flex items-center gap-3 px-5 py-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#5C6BC0] text-lg font-bold text-white">
              V
            </div>
            <div>
              <div className="text-lg font-bold tracking-tight">Veritas</div>
              <div className="text-xs text-slate-400">AI 知识检验</div>
            </div>
          </div>

          <div className="px-3 pb-4">
            <button
              onClick={handleBackHome}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#5C6BC0] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#505eb0]"
            >
              <span>+</span>
              新建诊断
            </button>
          </div>

          <nav className="space-y-1 px-3 text-sm">
            <button className="flex w-full items-center gap-3 rounded-xl bg-slate-100 px-3 py-2.5 font-medium text-slate-900 transition-colors hover:bg-slate-100">
              <span>🎯</span>
              诊断
            </button>
            <button
              onClick={() => state.report && setReportOpen(true)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
              disabled={!state.report}
            >
              <span>📄</span>
              报告
            </button>
          </nav>

          <div className="mt-5 border-t border-slate-200 px-3 pt-4">
            <div className="px-2 text-xs font-semibold text-slate-400">最近</div>
            <div className="mt-2 max-h-[34vh] space-y-1 overflow-y-auto">
              {hasActiveDiagnosis ? (
                <button className="relative w-full rounded-xl bg-black/[0.06] px-4 py-3 text-left text-sm font-medium text-slate-900 transition-colors hover:bg-black/[0.08]">
                  <span className="absolute left-0 top-3 h-8 w-[3px] rounded-r bg-[#5C6BC0]" />
                  <span className="block truncate pl-1">{displayedTitle}</span>
                  <span className="mt-1 block pl-1 text-xs font-normal text-slate-500">
                    {state.nodes.length} 个知识点
                  </span>
                </button>
              ) : (
                <p className="px-2 py-2 text-sm text-slate-400">当前 session 暂无记录</p>
              )}
            </div>
          </div>

          <div className="mt-auto border-t border-slate-200 p-3">
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-100">
              <span>⚙️</span>
              设置
            </button>
          </div>
        </aside>

        <section className="min-h-0 bg-[#F8F9FA]">
          <div className="grid h-full grid-cols-[220px_minmax(0,1fr)]">
            <aside className="min-h-0 border-r border-slate-200 bg-[#f4f4ee]">
              <div className="border-b border-slate-200 px-3 py-4">
                <p className="text-xs text-slate-400">当前材料</p>
                <p className="mt-1 truncate text-sm font-semibold text-slate-900">{displayedTitle}</p>
              </div>
              <div className="h-[calc(100%-73px)] overflow-y-auto py-3">
                {hasActiveDiagnosis ? (
                  state.nodes.map((node, index) => {
                    const isSelected = index === state.currentNodeIndex
                    const isStarted = isSelected || (state.nodeConversations[index]?.turns.length ?? 0) > 0
                    const color = nodeBookColors[index % nodeBookColors.length]
                    return (
                      <button
                        key={node.id}
                        onClick={() => dispatch({ type: 'SELECT_NEXT_NODE', nodeIndex: index })}
                        className={`relative flex w-full items-center gap-2 px-3 py-3 text-left transition-[background] duration-150 hover:bg-black/5 ${
                          isSelected ? 'bg-black/[0.06]' : ''
                        }`}
                      >
                        {isSelected && (
                          <span className="absolute left-0 top-2 h-12 w-[3px] rounded-r bg-[#5C6BC0]" />
                        )}
                        <span className="relative ml-1 h-12 w-11 shrink-0">
                          <span
                            className="absolute left-2 top-2 h-9 w-8 rounded-md border-2 border-black/15 opacity-60 shadow-sm"
                            style={{ backgroundColor: color }}
                          />
                          <span
                            className="absolute left-0 top-0 h-10 w-8 rounded-md border-2 border-black/20 shadow-[2px_2px_0_rgba(0,0,0,0.12)]"
                            style={{ backgroundColor: color }}
                          />
                          <span className="absolute left-2 top-1 h-8 w-px bg-white/35" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-900">{node.name}</span>
                          <span className="mt-0.5 block truncate text-xs text-slate-500">{getNodeStageText(node.id, index)}</span>
                        </span>
                        <span className={`h-2 w-2 shrink-0 rounded-full ${isStarted ? 'bg-[#5C6BC0]' : 'bg-slate-300'}`} />
                      </button>
                    )
                  })
                ) : (
                  <p className="px-3 py-4 text-sm leading-6 text-slate-400">上传材料后自动生成</p>
                )}
              </div>
            </aside>

            <div className="flex min-h-0 flex-col">
              <header className="border-b border-slate-200 bg-white/80 px-6 py-3 text-sm text-slate-500">
                {displayedTitle} · {currentNode ? levelLabels[state.currentLevel] : '等待材料'}
              </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
            {!hasActiveDiagnosis && (
              <div className="mx-auto mt-16 max-w-2xl text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-[#5C6BC0]/10 text-3xl">
                  🤖
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">把材料给我，我们开始检验</h1>
                <p className="mt-3 text-sm leading-6 text-slate-500">
                  Veritas 只基于你上传或粘贴的材料诊断理解，不做无材料的通用问答。
                </p>
              </div>
            )}

            {hasActiveDiagnosis && turns.length === 0 && (
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">🤖</div>
                <div className="chat-bubble chat-bubble-ai bg-[#F0F0F0] px-4 py-3 text-sm text-slate-700 shadow-sm">
                  正在根据材料组织第一个问题...
                </div>
              </div>
            )}

            {hasActiveDiagnosis && (
              <div className="mx-auto max-w-4xl space-y-5">
                {turns.map((turn, index) => (
                  <div
                    key={`${turn.role}-${index}`}
                    className={`flex items-end gap-3 ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {turn.role === 'assistant' && (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">🤖</div>
                    )}
                    <div
                      className={`chat-bubble max-w-[72%] px-4 py-3 text-sm leading-7 shadow-sm ${
                        turn.role === 'assistant'
                          ? 'chat-bubble-ai bg-[#F0F0F0] text-slate-800'
                          : 'chat-bubble-user bg-[#5C6BC0] text-white'
                      }`}
                    >
                      {turn.content}
                    </div>
                    {turn.role === 'user' && (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500 shadow-sm">人</div>
                    )}
                  </div>
                ))}

                {isBusy && state.phase !== 'reporting' && (
                  <div className="flex items-end gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">🤖</div>
                    <div className="chat-bubble chat-bubble-ai bg-[#F0F0F0] px-4 py-3 shadow-sm">
                      <span className="typing-dot" />
                      <span className="typing-dot delay-150" />
                      <span className="typing-dot delay-300" />
                    </div>
                  </div>
                )}
                <div ref={historyEndRef} />
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 bg-white/90 px-6 py-4">
            <div className="mx-auto max-w-4xl">
              {state.error && (
                <div className="mb-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                  <p>{state.error}</p>
                  <div className="mt-2 flex gap-2">
                    {retryQuestionRequest !== null && (
                      <button
                        onClick={handleRetryQuestion}
                        disabled={isBusy}
                        className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      >
                        重试当前回复
                      </button>
                    )}
                    {retryReportConversations !== null && (
                      <button
                        onClick={handleRetryReport}
                        disabled={isBusy}
                        className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      >
                        重试生成报告
                      </button>
                    )}
                  </div>
                </div>
              )}

              {analyzeWarning && (
                <div className="mb-3 rounded-2xl border border-[#FFA726]/25 bg-[#FFA726]/10 px-4 py-3 text-sm text-amber-700">
                  {analyzeWarning}
                </div>
              )}

              {waitingForDeepDiveChoice && (
                <div className="mb-3 rounded-2xl border border-[#FFA726]/25 bg-[#FFA726]/10 px-4 py-3 text-sm text-amber-800">
                  <p>快速路径已完成。可以结束这个节点，也可以继续深入。</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={handleCompleteNode}
                      disabled={isBusy || waitingForReportRetry}
                      className="rounded-full bg-[#5C6BC0] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      完成这个节点
                    </button>
                    <button
                      onClick={handleEnterDeepPath}
                      disabled={isBusy || waitingForReportRetry}
                      className="rounded-full border border-[#5C6BC0]/30 bg-white px-4 py-2 text-xs font-semibold text-[#5C6BC0] disabled:opacity-50"
                    >
                      继续深入
                    </button>
                  </div>
                </div>
              )}

              <div className="mb-2 flex gap-2">
                <button
                  onClick={handleHint}
                  disabled={actionDisabled}
                  className="rounded-full border border-[#FFA726] bg-white px-4 py-2 text-sm font-semibold text-amber-700 transition-colors hover:bg-[#FFA726]/10 disabled:opacity-40"
                >
                  💡 给我提示
                </button>
                <button
                  onClick={handleAnswer}
                  disabled={actionDisabled}
                  className="rounded-full border border-[#58CC02] bg-white px-4 py-2 text-sm font-semibold text-green-700 transition-colors hover:bg-[#58CC02]/10 disabled:opacity-40"
                >
                  📖 给我答案
                </button>
              </div>

              <div
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  handleMaterialFile(event.dataTransfer.files?.[0])
                }}
                className={`rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm transition-all ${
                  hasActiveDiagnosis ? '' : 'border-dashed border-[#5C6BC0]/35 p-5'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.pptx,.txt,.md,.markdown"
                  className="hidden"
                  onChange={(event) => handleMaterialFile(event.target.files?.[0])}
                />
                <textarea
                  value={textAnswer}
                  onChange={(event) => setTextAnswer(event.target.value)}
                  placeholder={hasActiveDiagnosis ? '像聊天一样回答这个问题...' : '粘贴一段材料，或点击下方上传 PDF / DOCX / PPTX / TXT / Markdown'}
                  rows={hasActiveDiagnosis ? 3 : 5}
                  className="w-full resize-none rounded-2xl bg-transparent px-2 py-2 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400"
                  disabled={isBusy || waitingForReportRetry || waitingForDeepDiveChoice || state.phase === 'done'}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      handleSubmit()
                    }
                  }}
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isBusy}
                    className={`rounded-full border border-[#5C6BC0]/40 bg-white text-sm font-semibold text-[#5C6BC0] transition-colors hover:bg-[#5C6BC0]/10 disabled:opacity-50 ${
                      hasActiveDiagnosis ? 'px-3 py-2' : 'px-5 py-3'
                    }`}
                  >
                    📎 上传材料
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => dispatch({ type: 'SET_ERROR', error: '语音输入第一版先保留入口，后续接入' })}
                      disabled={isBusy}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 disabled:opacity-50"
                      aria-label="语音输入"
                    >
                      🎤
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={isBusy || waitingForReportRetry || waitingForDeepDiveChoice || !textAnswer.trim()}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-[#5C6BC0] text-white transition-colors hover:bg-[#505eb0] disabled:opacity-40"
                      aria-label={hasActiveDiagnosis ? '发送回答' : '分析材料'}
                    >
                      →
                    </button>
                  </div>
                </div>
              </div>

              {analyzeMessage && (
                <p className="mt-2 text-center text-xs font-medium text-[#5C6BC0]">{analyzeMessage}</p>
              )}
              </div>
            </div>
          </div>
        </div>
        </section>

        <aside className="flex min-h-0 flex-col border-l border-slate-200 bg-white/90">
          <div className="border-b border-slate-200 px-5 py-5">
            <p className="text-xs font-semibold text-slate-400">诊断旁注</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">{currentNode?.name ?? '等待材料'}</h2>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
            <section>
              <p className="mb-3 text-xs font-semibold text-slate-400">学习阶段进度</p>
              <div className="space-y-2">
                {(Object.keys(levelLabels) as CognitiveLevel[]).map((level) => {
                  const levelState = currentLevelStates.find((item) => item.level === level)
                  const isCurrent = currentNode && state.currentLevel === level
                  return (
                    <div
                      key={level}
                      className={`flex items-center justify-between rounded-2xl px-3 py-2 text-sm ${
                        isCurrent
                          ? 'bg-[#5C6BC0]/10 font-semibold text-[#5C6BC0]'
                          : levelState?.status === 'passed'
                            ? 'bg-[#58CC02]/10 text-green-700'
                            : 'bg-slate-50 text-slate-400'
                      }`}
                    >
                      <span>{levelLabels[level]}</span>
                      <span className="text-xs">{getLevelStatusLabel(levelState?.status)}</span>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="grid grid-cols-2 gap-3">
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-400">当前得分</p>
                <p className="mt-1 text-3xl font-bold text-[#58CC02]">{currentScore}</p>
              </div>
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-400">节点进度</p>
                <p className="mt-2 text-lg font-bold text-slate-900">
                  {hasActiveDiagnosis ? `${state.currentNodeIndex + 1}/${state.nodes.length}` : '0/0'}
                </p>
              </div>
            </section>

            <section className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-400">当前目标</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {currentNode
                  ? `围绕“${currentNode.name}”完成 ${levelLabels[state.currentLevel]} 层级判断。`
                  : '上传或粘贴材料后，系统会先抽取知识节点。'}
              </p>
            </section>

            <section className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-400">路径状态</p>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <div className="flex justify-between">
                  <span>快速路径</span>
                  <span>{formatPathProgress(currentPathState?.quickPath)}</span>
                </div>
                <div className="flex justify-between">
                  <span>深入路径</span>
                  <span>{formatPathProgress(currentPathState?.deepPath)}</span>
                </div>
              </div>
            </section>

            <details className="rounded-3xl bg-slate-50 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-600">盲点摘要</summary>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {state.currentAgentResponse?.blindSpotSummary || '暂未暴露稳定盲点。'}
              </p>
            </details>

            <details className="rounded-3xl bg-slate-50 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-600">本次节点列表</summary>
              <div className="mt-3 space-y-2">
                {state.nodes.length > 0 ? state.nodes.map((node, index) => (
                  <button
                    key={node.id}
                    onClick={() => dispatch({ type: 'SELECT_NEXT_NODE', nodeIndex: index })}
                    className="block w-full rounded-xl px-3 py-2 text-left text-sm text-slate-600 transition-colors hover:bg-white"
                  >
                    {index + 1}. {node.name}
                  </button>
                )) : (
                  <p className="text-sm text-slate-400">暂无节点</p>
                )}
              </div>
            </details>
          </div>

          <div className="border-t border-slate-200 p-5">
            <button
              onClick={() => state.report ? setReportOpen(true) : runEvaluate()}
              disabled={!hasActiveDiagnosis || isBusy}
              className="w-full rounded-2xl bg-[#5C6BC0] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#505eb0] disabled:opacity-40"
            >
              {state.phase === 'reporting' ? '报告生成中...' : state.report ? '查看报告' : '生成报告'}
            </button>
          </div>
        </aside>
      </div>

      {reportOpen && state.report && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-6 py-8">
          <div className="max-h-full w-full max-w-4xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-xs font-semibold text-slate-400">诊断报告</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-900">{state.report.overallScore} / 100</h2>
                <p className="mt-2 text-sm text-slate-500">{state.report.summary}</p>
              </div>
              <button
                onClick={() => setReportOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
                aria-label="关闭报告"
              >
                ×
              </button>
            </div>
            <div className="max-h-[72vh] space-y-4 overflow-y-auto p-6">
              {state.report.nodes.map((evaluation) => (
                <ReportCard key={evaluation.nodeId} evaluation={evaluation} />
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
