'use client'

import { useEffect, useRef, useState, type Dispatch } from 'react'
import type { Action, StoreExamState } from '@/store/examStore'
import {
  deleteDiagnosisRecord,
  getDiagnosisRecord,
  listDiagnosisRecords,
  LOCAL_DIAGNOSIS_SCHEMA_VERSION,
  restorePersistedDiagnosisState,
  type LocalDiagnosisRecord,
  saveDiagnosisRecord,
  toPersistedDiagnosisState,
} from '@/lib/localHistory'
import type { MenuTarget } from '../_lib/examPageTypes'

export function useLocalDiagnosisHistory({
  state,
  dispatch,
  isHydrated,
  isBusy,
  setTextAnswer,
  setReportOpen,
  setOpenMenu,
}: {
  state: StoreExamState
  dispatch: Dispatch<Action>
  isHydrated: boolean
  isBusy: boolean
  setTextAnswer: (value: string) => void
  setReportOpen: (open: boolean) => void
  setOpenMenu: (target: MenuTarget | null) => void
}) {
  const [historyRecords, setHistoryRecords] = useState<LocalDiagnosisRecord[]>([])
  const saveTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!isHydrated) return
    listDiagnosisRecords()
      .then(setHistoryRecords)
      .catch(() => setHistoryRecords([]))
  }, [isHydrated])

  useEffect(() => {
    if (!isHydrated || !state.recordId || state.phase === 'idle' || state.phase === 'analyzing') return

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      const updatedAt = new Date().toISOString()
      const stateToPersist = { ...state, updatedAt }
      saveDiagnosisRecord({
        schemaVersion: LOCAL_DIAGNOSIS_SCHEMA_VERSION,
        id: state.recordId ?? updatedAt,
        title: state.materialTitle,
        createdAt: state.createdAt ?? updatedAt,
        updatedAt,
        pinned: state.recordPinned,
        state: toPersistedDiagnosisState(stateToPersist),
      })
        .then(() => listDiagnosisRecords())
        .then(setHistoryRecords)
        .catch(() => undefined)
    }, 400)

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    }
  }, [state, isHydrated])

  async function refreshHistoryRecords() {
    setHistoryRecords(await listDiagnosisRecords())
  }

  async function handleLoadRecord(recordId: string) {
    if (isBusy) return
    const record = await getDiagnosisRecord(recordId)
    if (!record) {
      dispatch({ type: 'SET_ERROR', error: '没有找到这条本地记录' })
      return
    }
    dispatch({ type: 'RESTORE', state: restorePersistedDiagnosisState(record.state) })
    setTextAnswer('')
    setReportOpen(false)
    setOpenMenu(null)
  }

  async function handleRecordPin(record: LocalDiagnosisRecord) {
    const pinned = !record.pinned
    const nextState = { ...record.state, recordPinned: pinned }
    await saveDiagnosisRecord({ ...record, pinned, state: nextState })
    if (record.id === state.recordId) {
      dispatch({ type: 'SET_RECORD_META', recordPinned: pinned })
    }
    await refreshHistoryRecords()
    setOpenMenu(null)
  }

  async function handleRecordRename(record: LocalDiagnosisRecord) {
    const title = window.prompt('重命名', record.title)?.trim()
    if (!title) {
      setOpenMenu(null)
      return
    }
    const nextState = { ...record.state, materialTitle: title }
    await saveDiagnosisRecord({ ...record, title, state: nextState })
    if (record.id === state.recordId) {
      dispatch({ type: 'SET_RECORD_META', materialTitle: title })
    }
    await refreshHistoryRecords()
    setOpenMenu(null)
  }

  async function handleRecordDelete(record: LocalDiagnosisRecord) {
    if (!window.confirm(`删除「${record.title}」吗？这会移除这条本地诊断记录。`)) return
    await deleteDiagnosisRecord(record.id)
    if (record.id === state.recordId) {
      dispatch({ type: 'RESET' })
      setTextAnswer('')
      setReportOpen(false)
    }
    await refreshHistoryRecords()
    setOpenMenu(null)
  }

  return {
    historyRecords,
    handleLoadRecord,
    handleRecordPin,
    handleRecordRename,
    handleRecordDelete,
  }
}
