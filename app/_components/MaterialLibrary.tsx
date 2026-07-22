'use client'

import { useRef, useState } from 'react'
import type { LocalDiagnosisRecord } from '@/lib/localHistory'
import { RenameDialog } from '@/components/RenameDialog'
import { MATERIAL_FILE_ACCEPT } from '../_lib/materialFile'
import { MaterialCard, type MaterialCardMenu } from './MaterialCard'

export function MaterialLibrary({
  records,
  loading,
  uploading,
  uploadMessage,
  error,
  onFiles,
  onOpenRecord,
  onPin,
  onRename,
  onDelete,
}: {
  records: LocalDiagnosisRecord[]
  loading: boolean
  uploading: boolean
  uploadMessage: string
  error: string
  onFiles: (files: File[]) => void
  onOpenRecord: (record: LocalDiagnosisRecord) => void
  onPin: (record: LocalDiagnosisRecord) => void
  onRename: (record: LocalDiagnosisRecord, name: string) => void
  onDelete: (record: LocalDiagnosisRecord) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [openMenu, setOpenMenu] = useState<MaterialCardMenu | null>(null)
  const [renamingRecord, setRenamingRecord] = useState<LocalDiagnosisRecord | null>(null)

  return (
    <main className="min-h-screen bg-[#f6f7f9] px-5 py-10 text-slate-900 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex items-start justify-between gap-5">
          <div>
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#5C6BC0] text-lg font-bold text-white">V</span>
              <span>
                <span className="block text-base font-bold">Veritas</span>
                <span className="block text-xs text-slate-400">AI 知识检验</span>
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">我的书架</h1>
            <p className="mt-2 text-sm text-slate-500">选择一份材料，继续诊断学习</p>
          </div>

          <div>
            <input
              ref={inputRef}
              aria-label="上传材料"
              type="file"
              multiple
              accept={MATERIAL_FILE_ACCEPT}
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? [])
                event.target.value = ''
                if (files.length > 0) onFiles(files)
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:shadow-sm disabled:cursor-wait disabled:opacity-60"
            >
              {uploading ? '正在导入…' : '+ 上传材料'}
            </button>
          </div>
        </header>

        {(uploadMessage || error) && (
          <div className="mb-5 space-y-2" aria-live="polite">
            {uploadMessage && <p className="text-sm font-medium text-[#5C6BC0]">{uploadMessage}</p>}
            {error && <p className="whitespace-pre-line text-sm text-red-600">{error}</p>}
          </div>
        )}

        <h2 className="mb-4 text-sm font-semibold text-slate-500">材料库 · {records.length} 份</h2>

        {loading ? (
          <p role="status" className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-400">
            正在加载材料库…
          </p>
        ) : records.length > 0 ? (
          <section aria-label="材料列表" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {records.map((record, index) => (
              <MaterialCard
                key={record.id}
                record={record}
                index={index}
                openMenu={openMenu}
                setOpenMenu={setOpenMenu}
                onOpen={onOpenRecord}
                onPin={onPin}
                onRename={setRenamingRecord}
                onDelete={onDelete}
              />
            ))}
          </section>
        ) : (
          <section className="rounded-2xl border border-dashed border-slate-300 bg-white/65 px-6 py-16 text-center">
            <div aria-hidden="true" className="mx-auto mb-4 flex h-14 w-16 items-end justify-center gap-1">
              <span className="h-9 w-3 rounded-t bg-[#8fa3d6]" />
              <span className="h-12 w-3 rounded-t bg-[#5C6BC0]" />
              <span className="h-8 w-3 rounded-t bg-[#c3cfe8]" />
            </div>
            <h2 className="text-base font-semibold">书架还是空的</h2>
            <p className="mt-2 text-sm text-slate-500">上传一份或多份材料，解析完成后会保存在这里。</p>
          </section>
        )}
      </div>
      {renamingRecord && (
        <RenameDialog
          title="重命名材料"
          initialValue={renamingRecord.title}
          onCancel={() => setRenamingRecord(null)}
          onConfirm={(name) => {
            onRename(renamingRecord, name)
            setRenamingRecord(null)
          }}
        />
      )}
    </main>
  )
}
