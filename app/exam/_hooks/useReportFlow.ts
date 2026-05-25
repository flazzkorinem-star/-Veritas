'use client'

import { useState, type Dispatch } from 'react'
import type { Action } from '@/store/examStore'
import type { NodeConversation } from '@/lib/types'
import { requestReport } from '../_lib/reportApi'
import type { StoreExamState } from '@/store/examStore'

export function useReportFlow({
  state,
  dispatch,
  setSubmitting,
  isDiagnosisComplete,
}: {
  state: StoreExamState
  dispatch: Dispatch<Action>
  setSubmitting: (submitting: boolean) => void
  isDiagnosisComplete: boolean
}) {
  const [reportOpen, setReportOpen] = useState(false)
  const [retryReportConversations, setRetryReportConversations] = useState<NodeConversation[] | null>(null)

  async function runEvaluate(nodeConversations: NodeConversation[]) {
    setRetryReportConversations(null)
    dispatch({ type: 'START_REPORTING' })
    try {
      const report = await requestReport({
        nodeConversations,
        nodeLevelStates: state.nodeLevelStates,
      })
      dispatch({ type: 'SET_REPORT', report })
      setReportOpen(true)
    } catch {
      setRetryReportConversations(nodeConversations)
      dispatch({ type: 'REPORT_FAILED', error: '报告生成出现问题' })
    }
    setSubmitting(false)
  }

  function handleReportAction() {
    if (state.reportStatus === 'stale') runEvaluate(state.nodeConversations)
    else if (state.report) setReportOpen(true)
    else if (isDiagnosisComplete) runEvaluate(state.nodeConversations)
  }

  async function handleRetryReport() {
    if (retryReportConversations === null) return
    dispatch({ type: 'SET_ERROR', error: '' })
    setSubmitting(true)
    await runEvaluate(retryReportConversations)
  }

  return {
    reportOpen,
    setReportOpen,
    retryReportConversations,
    runEvaluate,
    handleReportAction,
    handleRetryReport,
  }
}
