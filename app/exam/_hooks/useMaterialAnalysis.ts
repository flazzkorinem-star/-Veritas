'use client'

import { useState, type Dispatch } from 'react'
import { validateMaterialFile } from '@/app/_lib/materialFile'
import { buildDiagnosisPlan, createRecordId, createRecordTitle } from '@/app/_lib/materialRecord'
import type { Action } from '@/store/examStore'
import { analyzeMaterialFile } from '@/app/_lib/materialApi'

export function useMaterialAnalysis({
  dispatch,
}: {
  dispatch: Dispatch<Action>
}) {
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeMessage, setAnalyzeMessage] = useState('')
  const [analyzeWarning, setAnalyzeWarning] = useState('')

  async function analyzeMaterial(file: File): Promise<void> {
    setAnalyzing(true)
    setAnalyzeMessage('正在读取材料...')
    setAnalyzeWarning('')
    dispatch({ type: 'SET_ERROR', error: '' })
    let analyzeMessageTimer: number | undefined

    try {
      analyzeMessageTimer = window.setTimeout(() => {
        setAnalyzeMessage('正在抽取高价值知识节点...')
      }, 600)

      const data = await analyzeMaterialFile(file)
      window.clearTimeout(analyzeMessageTimer)
      analyzeMessageTimer = undefined

      const now = new Date().toISOString()
      const materialTitle = createRecordTitle(file.name)
      dispatch({ type: 'START_ANALYZING', content: data.documentContent })
      dispatch({
        type: 'SET_RECORD_META',
        recordId: createRecordId(),
        materialTitle,
        recordPinned: false,
        createdAt: now,
        updatedAt: now,
      })
      dispatch({ type: 'SET_NODES', nodes: data.nodes })
      dispatch({
        type: 'ADD_TURN',
        turn: {
          role: 'assistant',
          kind: 'diagnosis_plan',
          content: buildDiagnosisPlan(materialTitle, data.nodes),
        },
      })
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

  async function handleMaterialFile(file: File | undefined): Promise<void> {
    if (!file || analyzing) return
    const validationError = validateMaterialFile(file)
    if (validationError) {
      dispatch({ type: 'SET_ERROR', error: validationError })
      return
    }
    await analyzeMaterial(file)
  }

  return {
    analyzing,
    analyzeMessage,
    analyzeWarning,
    handleMaterialFile,
  }
}
