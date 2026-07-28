'use client'

import { useEffect, useRef, useState } from 'react'
import { useExam } from '@/store/examStore'
import type { KnowledgeNode } from '@/lib/types'
import { calculateNodeScore } from '@/lib/score'
import { levelLabels } from '../_lib/examPageHelpers'
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
  const hasActiveDiagnosis = state.nodes.length > 0
  const completedNodeCount = state.nodes.filter((node) => (
    state.nodePathStates[node.id]?.completed
  )).length
  const isDiagnosisComplete = hasActiveDiagnosis && completedNodeCount === state.nodes.length
  const currentScore = currentNodeId ? calculateNodeScore(currentLevelStates) : 0
  const displayedTitle = state.materialTitle !== '当前诊断'
    ? state.materialTitle
    : currentNode?.name ?? '当前诊断'

  const material = useMaterialAnalysis({ dispatch })
  const isBusy = submitting || material.analyzing || state.phase === 'reporting'
  const canContinueDialogue = state.phase === 'examining' || state.phase === 'reviewing'

  const report = useReportFlow({ state, dispatch, setSubmitting, isDiagnosisComplete })
  const waitingForReportRetry = report.retryReportConversations !== null

  const question = useQuestionFlow({
    state,
    dispatch,
    isHydrated,
    submitting,
    setSubmitting,
    textAnswer,
    setTextAnswer,
    isBusy,
    waitingForReportRetry,
    runEvaluate: report.runEvaluate,
  })

  const materials = useLocalDiagnosisHistory({
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
    if (!canContinueDialogue) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [canContinueDialogue])

  async function handleBackHome() {
    if (hasActiveDiagnosis && !window.confirm('当前诊断会保存在书架。确定新建诊断吗？')) {
      return
    }
    await materials.saveCurrentRecord()
    dispatch({ type: 'RESET' })
    setTextAnswer('')
    report.setReportOpen(false)
    setOpenMenu(null)
  }

  function handleNodeImportance(nodeId: string, importance: KnowledgeNode['importance']) {
    dispatch({ type: 'SET_NODE_IMPORTANCE', nodeId, importance })
    setOpenMenu(null)
  }

  function handleNodePin(nodeId: string) {
    dispatch({ type: 'TOGGLE_NODE_PIN', nodeId })
    setOpenMenu(null)
  }

  function handleNodeRename(nodeId: string, name: string) {
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
    || !currentNode
    || !canContinueDialogue
  )

  return {
    state,
    dispatch,
    isHydrated,
    textAnswer,
    setTextAnswer,
    historyEndRef,
    fileInputRef,
    openMenu,
    setOpenMenu,
    currentNode,
    turns,
    currentLevelStates,
    hasActiveDiagnosis,
    completedNodeCount,
    isDiagnosisComplete,
    currentScore,
    isBusy,
    actionDisabled,
    displayedTitle,
    waitingForReportRetry,
    levelLabels,
    handleBackHome,
    handleNodeImportance,
    handleNodePin,
    handleNodeRename,
    handleNodeDelete,
    analyzeMessage: material.analyzeMessage,
    analyzeWarning: material.analyzeWarning,
    handleMaterialFile: material.handleMaterialFile,
    reportOpen: report.reportOpen,
    setReportOpen: report.setReportOpen,
    retryReportConversations: report.retryReportConversations,
    handleReportAction: report.handleReportAction,
    handleRetryReport: report.handleRetryReport,
    retryQuestionRequest: question.retryQuestionRequest,
    handleSubmit: question.handleSubmit,
    handleHint: question.handleHint,
    handleAnswer: question.handleAnswer,
    handleRetryQuestion: question.handleRetryQuestion,
    materialRecords: materials.materialRecords,
    saveCurrentRecord: materials.saveCurrentRecord,
    handleLoadRecord: materials.handleLoadRecord,
    handleRecordPin: materials.handleRecordPin,
    handleRecordRename: materials.handleRecordRename,
    handleRecordDelete: materials.handleRecordDelete,
  }
}
