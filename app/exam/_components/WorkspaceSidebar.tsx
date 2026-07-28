'use client'

import { useState } from 'react'
import type { ExamReport } from '@/lib/types'
import type { LocalDiagnosisRecord } from '@/lib/localHistory'
import type { MenuTarget } from '../_lib/examPageTypes'
import { ActionMenu, getActionMenuAnchor } from '@/components/ActionMenu'
import { RenameDialog } from '@/components/RenameDialog'

export function WorkspaceSidebar({
  materialRecords,
  selectedRecordId,
  report,
  openMenu,
  setOpenMenu,
  onBackShelf,
  onNewDiagnosis,
  onOpenReport,
  onLoadRecord,
  onRecordPin,
  onRecordRename,
  onRecordDelete,
}: {
  materialRecords: LocalDiagnosisRecord[]
  selectedRecordId: string | null
  report: ExamReport | null
  openMenu: MenuTarget | null
  setOpenMenu: (target: MenuTarget | null) => void
  onBackShelf: () => void
  onNewDiagnosis: () => void
  onOpenReport: () => void
  onLoadRecord: (recordId: string) => void
  onRecordPin: (record: LocalDiagnosisRecord) => void
  onRecordRename: (record: LocalDiagnosisRecord, name: string) => void
  onRecordDelete: (record: LocalDiagnosisRecord) => void
}) {
  const [renamingRecord, setRenamingRecord] = useState<LocalDiagnosisRecord | null>(null)

  return (
    <aside className="flex min-h-0 flex-col border-r border-slate-200 bg-white/85">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#5C6BC0] text-lg font-bold text-white">
          V
        </div>
        <div>
          <div className="text-lg font-bold tracking-tight">Veritas</div>
          <div className="text-xs text-slate-400">AI 知识检验</div>
        </div>
      </div>

      <div className="space-y-2 px-3 pb-4">
        <button
          type="button"
          onClick={onBackShelf}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
        >
          <span aria-hidden="true">←</span>
          返回书架
        </button>
        <button
          type="button"
          onClick={onNewDiagnosis}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#5C6BC0] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#505eb0]"
        >
          <span aria-hidden="true">+</span>
          新建诊断
        </button>
      </div>

      <nav className="space-y-1 px-3 text-sm" aria-label="工作区导航">
        <button type="button" className="flex w-full items-center gap-3 rounded-xl bg-slate-100 px-3 py-2.5 font-medium text-slate-900">
          <span aria-hidden="true">🎯</span>
          诊断
        </button>
        <button
          type="button"
          onClick={onOpenReport}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
          disabled={!report}
        >
          <span aria-hidden="true">📄</span>
          报告
        </button>
      </nav>

      <section className="mt-5 min-h-0 border-t border-slate-200 px-3 pt-4">
        <h2 className="px-2 text-xs font-semibold text-slate-400">材料</h2>
        <div className="mt-2 max-h-[34vh] space-y-1 overflow-y-auto">
          {materialRecords.length > 0 ? materialRecords.map((record) => {
            const isSelected = record.id === selectedRecordId
            return (
              <div key={record.id} className={`group relative rounded-xl ${isSelected ? 'bg-black/[0.06]' : ''}`}>
                {isSelected && <span className="absolute left-0 top-3 h-8 w-[3px] rounded-r bg-[#5C6BC0]" />}
                <button
                  type="button"
                  aria-label={`切换材料：${record.title}`}
                  onClick={() => onLoadRecord(record.id)}
                  className="w-full rounded-xl px-4 py-3 pr-10 text-left text-sm font-medium text-slate-900 outline-none transition-colors hover:bg-black/[0.08] focus-visible:ring-2 focus-visible:ring-[#5C6BC0]/35"
                >
                  <span className="block truncate pl-1">{record.title}</span>
                  <span className="mt-1 block pl-1 text-xs font-normal text-slate-500">
                    {record.state.nodes.length} 个知识点
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    setOpenMenu(openMenu?.type === 'record' && openMenu.id === record.id
                      ? null
                      : { type: 'record', id: record.id, anchor: getActionMenuAnchor(event.currentTarget) })
                  }}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 opacity-100 outline-none transition hover:bg-black/5 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-[#5C6BC0]/40 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                  aria-label={`${record.title}的更多操作`}
                >
                  ⋯
                </button>
                {openMenu?.type === 'record' && openMenu.id === record.id && (
                  <ActionMenu
                    anchor={openMenu.anchor}
                    onClose={() => setOpenMenu(null)}
                    items={[
                      { icon: 'pin', label: record.pinned ? '取消置顶' : '置顶', onClick: () => onRecordPin(record) },
                      {
                        icon: 'rename',
                        label: '重命名',
                        onClick: () => {
                          setOpenMenu(null)
                          setRenamingRecord(record)
                        },
                      },
                      { icon: 'share', label: '分享', disabled: true },
                      { icon: 'delete', label: '删除', danger: true, onClick: () => onRecordDelete(record) },
                    ]}
                  />
                )}
              </div>
            )
          }) : (
            <p className="px-2 py-2 text-sm text-slate-400">暂无材料</p>
          )}
        </div>
      </section>

      <div className="mt-auto border-t border-slate-200 p-3">
        <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-100">
          <span aria-hidden="true">⚙️</span>
          设置
        </button>
      </div>
      {renamingRecord && (
        <RenameDialog
          title="重命名材料"
          initialValue={renamingRecord.title}
          onCancel={() => setRenamingRecord(null)}
          onConfirm={(name) => {
            onRecordRename(renamingRecord, name)
            setRenamingRecord(null)
          }}
        />
      )}
    </aside>
  )
}
