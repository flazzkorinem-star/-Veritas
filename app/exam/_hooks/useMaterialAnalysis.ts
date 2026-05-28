'use client'

import { useState, type Dispatch } from 'react'
import type { Action } from '@/store/examStore'
import { readApiJson } from '@/lib/apiResponse'
import { buildDiagnosisPlan, createRecordId, createRecordTitle } from '../_lib/examPageHelpers'
import { validateMaterialFile } from '../_lib/materialFile'
import type { AnalyzeResponse } from '../_lib/examPageTypes'

export function useMaterialAnalysis({
  dispatch,
  textAnswer,
  setTextAnswer,
}: {
  dispatch: Dispatch<Action>
  textAnswer: string
  setTextAnswer: (value: string) => void
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

  return {
    analyzing,
    analyzeMessage,
    analyzeWarning,
    handleMaterialFile,
    handlePastedMaterial,
  }
}
