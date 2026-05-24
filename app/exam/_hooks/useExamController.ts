'use client'

import { useEffect, useRef, useState } from 'react'
import { getDialogueStatus, useExam } from '@/store/examStore'
import { calculateQuickPathScore } from '@/lib/score'
import { hasSupportKind, levelLabels } from '../_lib/examPageHelpers'
import type { MenuTarget } from '../_lib/examPageTypes'
import { useLocalDiagnosisHistory } from './useLocalDiagnosisHistory'
import { useMaterialAnalysis } from './useMaterialAnalysis'
import { useQuestionFlow } from './useQuestionFlow'
import { useReportFlow } from './useReportFlow'

export function useExamController() {
  const { state, dispatch, isHydrated } = useExam()
  const [textAnswer, setTextAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [openMenu, setOpenMenu] = useState<MenuTarget | null>(null)
  const historyEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const currentNode = state.nodes[state.currentNodeIndex]
  const currentConversation = state.nodeConversations[state.currentNodeIndex]
  const turns = currentConversation?.turns ?? []
  const currentNodeId = currentNode?.id
  const currentLevelStates = currentNodeId ? state.nodeLevelStates[currentNodeId] ?? [] : []
  const currentLevelState = currentLevelStates.find((item) => item.level === state.currentLevel)
  const currentPathState = currentNodeId ? state.nodePathStates[currentNodeId] : undefined
  const dialogueStatus = getDialogueStatus(state.currentAgentResponse)
  const hasActiveDiagnosis = state.nodes.length > 0
  const completedNodeCount = state.nodes.filter((node) => (
    state.nodePathStates[node.id]?.completed
  )).length
  const isDiagnosisComplete = hasActiveDiagnosis && completedNodeCount === state.nodes.length
  const currentScore = currentNodeId ? calculateQuickPathScore(currentLevelStates) : 0
  const waitingForDeepDiveChoice = dialogueStatus === 'deep_dive_choice'
  const displayedTitle = state.materialTitle !== '当前诊断'
    ? state.materialTitle
    : currentNode?.name ?? '当前诊断'

  const material = useMaterialAnalysis({ dispatch, textAnswer, setTextAnswer })
  const isBusy = submitting || material.analyzing || state.phase === 'reporting'

  const report = useReportFlow({ state, dispatch, setSubmitting })
  const waitingForReportRetry = report.retryReportConversations !== null
  const answerChoicePending = Boolean(
    currentLevelState
    && hasSupportKind(currentLevelState, 'answer')
    && state.currentAgentResponse?.supportRecords?.some((record) => (
      record.kind === 'answer' && record.level === state.currentLevel
    ))
  )

  const question = useQuestionFlow({
    state,
    dispatch,
    isHydrated,
    submitting,
    setSubmitting,
    textAnswer,
    setTextAnswer,
    hasActiveDiagnosis,
    isBusy,
    waitingForDeepDiveChoice,
    waitingForReportRetry,
    answerChoicePending,
    handlePastedMaterial: material.handlePastedMaterial,
    runEvaluate: report.runEvaluate,
  })

  const history = useLocalDiagnosisHistory({
    state,
    dispatch,
    isHydrated,
    isBusy,
    setTextAnswer,
    setReportOpen: report.setReportOpen,
    setOpenMenu,
  })

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

  function handleBackHome() {
    if (hasActiveDiagnosis && !window.confirm('当前诊断会自动保存在本地历史。确定新建诊断吗？')) {
      return
    }
    dispatch({ type: 'RESET' })
    setTextAnswer('')
    report.setReportOpen(false)
    setOpenMenu(null)
  }

  function handleNodePin(nodeId: string) {
    dispatch({ type: 'TOGGLE_NODE_PIN', nodeId })
    setOpenMenu(null)
  }

  function handleNodeRename(nodeId: string, currentName: string) {
    const name = window.prompt('重命名', currentName)?.trim()
    if (!name) {
      setOpenMenu(null)
      return
    }
    dispatch({ type: 'UPDATE_NODE_NAME', nodeId, name })
    setOpenMenu(null)
  }

  function handleNodeDelete(nodeId: string, nodeName: string) {
    if (!window.confirm(`删除「${nodeName}」吗？这个知识点的对话也会移除。`)) return
    dispatch({ type: 'DELETE_NODE', nodeId })
    setOpenMenu(null)
  }

  const actionDisabled = (
    isBusy
    || waitingForReportRetry
    || waitingForDeepDiveChoice
    || answerChoicePending
    || !currentNode
    || state.phase !== 'examining'
  )

  return {
    state,
    dispatch,
    isHydrated,
    textAnswer,
    setTextAnswer,
    submitting,
    historyEndRef,
    fileInputRef,
    openMenu,
    setOpenMenu,
    currentNode,
    turns,
    currentLevelStates,
    currentPathState,
    hasActiveDiagnosis,
    completedNodeCount,
    isDiagnosisComplete,
    currentScore,
    isBusy,
    actionDisabled,
    displayedTitle,
    waitingForDeepDiveChoice,
    waitingForReportRetry,
    answerChoicePending,
    levelLabels,
    handleBackHome,
    handleNodePin,
    handleNodeRename,
    handleNodeDelete,
    ...material,
    ...report,
    ...question,
    ...history,
  }
}
