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
}: {
  state: StoreExamState
  dispatch: Dispatch<Action>
  setSubmitting: (submitting: boolean) => void
}) {
  const [reportOpen, setReportOpen] = useState(false)
  const [retryReportConversations, setRetryReportConversations] = useState<NodeConversation[] | null>(null)

  async function runEvaluate(nodeConversations: NodeConversation[] = state.nodeConversations) {
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
    handleRetryReport,
  }
}
