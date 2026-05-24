'use client'

import type { ExamReport } from '@/lib/types'
import type { LocalDiagnosisRecord } from '@/lib/localHistory'
import type { MenuTarget } from '../_lib/examPageTypes'
import { ActionMenu } from './ActionMenu'

export function WorkspaceSidebar({
  historyRecords,
  selectedRecordId,
  report,
  openMenu,
  setOpenMenu,
  onNewDiagnosis,
  onOpenReport,
  onLoadRecord,
  onRecordPin,
  onRecordRename,
  onRecordDelete,
}: {
  historyRecords: LocalDiagnosisRecord[]
  selectedRecordId: string | null
  report: ExamReport | null
  openMenu: MenuTarget | null
  setOpenMenu: (target: MenuTarget | null) => void
  onNewDiagnosis: () => void
  onOpenReport: () => void
  onLoadRecord: (recordId: string) => void
  onRecordPin: (record: LocalDiagnosisRecord) => void
  onRecordRename: (record: LocalDiagnosisRecord) => void
  onRecordDelete: (record: LocalDiagnosisRecord) => void
}) {
  return (
    <aside className="flex min-h-0 flex-col border-r border-slate-200 bg-white/85">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#5C6BC0] text-lg font-bold text-white">
          V
        </div>
        <div>
          <div className="text-lg font-bold tracking-tight">Veritas</div>
          <div className="text-xs text-slate-400">AI 知识检验</div>
        </div>
      </div>

      <div className="px-3 pb-4">
        <button
          onClick={onNewDiagnosis}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#5C6BC0] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#505eb0]"
        >
          <span>+</span>
          新建诊断
        </button>
      </div>

      <nav className="space-y-1 px-3 text-sm">
        <button className="flex w-full items-center gap-3 rounded-xl bg-slate-100 px-3 py-2.5 font-medium text-slate-900 transition-colors hover:bg-slate-100">
          <span>🎯</span>
          诊断
        </button>
        <button
          onClick={onOpenReport}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
          disabled={!report}
        >
          <span>📄</span>
          报告
        </button>
      </nav>

      <div className="mt-5 border-t border-slate-200 px-3 pt-4">
        <div className="px-2 text-xs font-semibold text-slate-400">最近</div>
        <div className="mt-2 max-h-[34vh] space-y-1 overflow-y-auto">
          {historyRecords.length > 0 ? (
            historyRecords.map((record) => {
              const isSelected = record.id === selectedRecordId
              const nodeCount = record.state.nodes.length
              return (
                <div
                  key={record.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onLoadRecord(record.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') onLoadRecord(record.id)
                  }}
                  className={`group relative w-full rounded-xl px-4 py-3 text-left text-sm font-medium text-slate-900 transition-colors hover:bg-black/[0.08] ${
                    isSelected ? 'bg-black/[0.06]' : ''
                  }`}
                >
                  {isSelected && (
                    <span className="absolute left-0 top-3 h-8 w-[3px] rounded-r bg-[#5C6BC0]" />
                  )}
                  <span className="block truncate pl-1">{record.title}</span>
                  <span className="mt-1 block pl-1 text-xs font-normal text-slate-500">
                    {nodeCount} 个知识点
                  </span>
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      setOpenMenu(openMenu?.type === 'record' && openMenu.id === record.id ? null : { type: 'record', id: record.id })
                    }}
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 opacity-0 transition-opacity hover:bg-black/5 hover:text-slate-700 group-hover:opacity-100"
                    aria-label="更多操作"
                  >
                    ⋯
                  </button>
                  {openMenu?.type === 'record' && openMenu.id === record.id && (
                    <ActionMenu
                      items={[
                        { icon: '📌', label: record.pinned ? '取消置顶' : '置顶', onClick: () => onRecordPin(record) },
                        { icon: '✎', label: '重命名', onClick: () => onRecordRename(record) },
                        { icon: '↗', label: '分享', disabled: true },
                        { icon: '🗑', label: '删除', danger: true, onClick: () => onRecordDelete(record) },
                      ]}
                    />
                  )}
                </div>
              )
            })
          ) : (
            <p className="px-2 py-2 text-sm text-slate-400">暂无本地记录</p>
          )}
        </div>
      </div>

      <div className="mt-auto border-t border-slate-200 p-3">
        <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-100">
          <span>⚙️</span>
          设置
        </button>
      </div>
    </aside>
  )
}
