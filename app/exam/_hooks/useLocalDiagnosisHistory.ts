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
  updateDiagnosisRecordPin,
  updateDiagnosisRecordTitle,
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
  const [materialRecords, setMaterialRecords] = useState<LocalDiagnosisRecord[]>([])
  const saveTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!isHydrated) return
    listDiagnosisRecords()
      .then(setMaterialRecords)
      .catch(() => setMaterialRecords([]))
  }, [isHydrated])

  async function persistCurrentState() {
    if (!state.recordId || state.phase === 'idle' || state.phase === 'analyzing') return
    const updatedAt = new Date().toISOString()
    await saveDiagnosisRecord({
      schemaVersion: LOCAL_DIAGNOSIS_SCHEMA_VERSION,
      id: state.recordId,
      title: state.materialTitle,
      createdAt: state.createdAt ?? updatedAt,
      updatedAt,
      pinned: state.recordPinned,
      state: toPersistedDiagnosisState({ ...state, updatedAt }),
    })
  }

  useEffect(() => {
    if (!isHydrated || !state.recordId || state.phase === 'idle' || state.phase === 'analyzing') return

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      persistCurrentState()
        .then(() => listDiagnosisRecords())
        .then(setMaterialRecords)
        .catch(() => undefined)
    }, 400)

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    }
  }, [state, isHydrated])

  async function refreshMaterialRecords() {
    setMaterialRecords(await listDiagnosisRecords())
  }

  async function handleLoadRecord(recordId: string) {
    if (isBusy) return
    await persistCurrentState()
    const record = await getDiagnosisRecord(recordId)
    if (!record) {
      dispatch({ type: 'SET_ERROR', error: '没有找到这份材料' })
      return
    }
    dispatch({ type: 'RESTORE', state: restorePersistedDiagnosisState(record.state) })
    setTextAnswer('')
    setReportOpen(false)
    setOpenMenu(null)
  }

  async function handleRecordPin(record: LocalDiagnosisRecord) {
    const pinned = !record.pinned
    await saveDiagnosisRecord(updateDiagnosisRecordPin(record, pinned))
    if (record.id === state.recordId) {
      dispatch({ type: 'SET_RECORD_META', recordPinned: pinned })
    }
    await refreshMaterialRecords()
    setOpenMenu(null)
  }

  async function handleRecordRename(record: LocalDiagnosisRecord, title: string) {
    await saveDiagnosisRecord(updateDiagnosisRecordTitle(record, title))
    if (record.id === state.recordId) {
      dispatch({ type: 'SET_RECORD_META', materialTitle: title })
    }
    await refreshMaterialRecords()
    setOpenMenu(null)
  }

  async function handleRecordDelete(record: LocalDiagnosisRecord) {
    if (!window.confirm(`删除「${record.title}」吗？这会从书架移除该材料及其诊断进度。`)) return
    await deleteDiagnosisRecord(record.id)
    if (record.id === state.recordId) {
      dispatch({ type: 'RESET' })
      setTextAnswer('')
      setReportOpen(false)
    }
    await refreshMaterialRecords()
    setOpenMenu(null)
  }

  return {
    materialRecords,
    saveCurrentRecord: persistCurrentState,
    handleLoadRecord,
    handleRecordPin,
    handleRecordRename,
    handleRecordDelete,
  }
}
