'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useExam } from '@/store/examStore'
import {
  deleteDiagnosisRecord,
  listDiagnosisRecords,
  restorePersistedDiagnosisState,
  saveDiagnosisRecord,
  type LocalDiagnosisRecord,
  updateDiagnosisRecordPin,
  updateDiagnosisRecordTitle,
} from '@/lib/localHistory'
import { analyzeMaterialFile } from '../_lib/materialApi'
import { importMaterialFiles, type MaterialImportProgress } from '../_lib/materialLibrary'

export function useMaterialLibrary() {
  const router = useRouter()
  const { state, dispatch, isHydrated } = useExam()
  const [records, setRecords] = useState<LocalDiagnosisRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<MaterialImportProgress | null>(null)
  const [uploadMessage, setUploadMessage] = useState('')
  const [error, setError] = useState('')

  async function refreshRecords() {
    setRecords(await listDiagnosisRecords())
  }

  useEffect(() => {
    if (!isHydrated) return
    refreshRecords()
      .catch(() => setError('材料库加载失败，请刷新后重试'))
      .finally(() => setLoading(false))
  }, [isHydrated])

  async function handleFiles(files: File[]) {
    if (uploading || files.length === 0) return
    setUploading(true)
    setError('')
    setUploadMessage('')

    try {
      const result = await importMaterialFiles(files, {
        analyze: analyzeMaterialFile,
        onProgress: (current, total, fileName) => {
          setUploadProgress({ current, processed: current - 1, total, fileName })
        },
      })
      await refreshRecords()
      setUploadMessage(result.savedCount > 0 ? `已导入 ${result.savedCount} 份材料` : '')
      setError(result.errors.join('\n'))
    } catch {
      setUploadMessage('')
      setError('材料导入失败，请重试')
    } finally {
      setUploading(false)
      setUploadProgress(null)
    }
  }

  function handleOpenRecord(record: LocalDiagnosisRecord) {
    dispatch({ type: 'RESTORE', state: restorePersistedDiagnosisState(record.state) })
    router.push('/exam')
  }

  async function handlePin(record: LocalDiagnosisRecord) {
    try {
      const pinned = !record.pinned
      await saveDiagnosisRecord(updateDiagnosisRecordPin(record, pinned))
      if (record.id === state.recordId) {
        dispatch({ type: 'SET_RECORD_META', recordPinned: pinned })
      }
      await refreshRecords()
    } catch {
      setError('置顶状态保存失败，请重试')
    }
  }

  async function handleRename(record: LocalDiagnosisRecord, title: string) {
    try {
      await saveDiagnosisRecord(updateDiagnosisRecordTitle(record, title))
      if (record.id === state.recordId) {
        dispatch({ type: 'SET_RECORD_META', materialTitle: title })
      }
      await refreshRecords()
    } catch {
      setError('重命名失败，请重试')
    }
  }

  async function handleDelete(record: LocalDiagnosisRecord) {
    if (!window.confirm(`删除「${record.title}」吗？这会移除材料及其诊断进度。`)) return
    try {
      await deleteDiagnosisRecord(record.id)
      if (record.id === state.recordId) dispatch({ type: 'RESET' })
      await refreshRecords()
    } catch {
      setError('删除失败，请重试')
    }
  }

  return {
    records,
    loading,
    uploading,
    uploadProgress,
    uploadMessage,
    error,
    handleFiles,
    handleOpenRecord,
    handlePin,
    handleRename,
    handleDelete,
  }
}
