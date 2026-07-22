'use client'

import type { LocalDiagnosisRecord } from '@/lib/localHistory'
import { getMaterialProgress } from '../_lib/materialLibrary'
import { ActionMenu, type ActionMenuAnchor, getActionMenuAnchor } from '@/components/ActionMenu'

const spinePalettes = [
  ['#6b85c9', '#8fa3d6', '#c3cfe8', '#5070b8'],
  ['#4f9e5e', '#7bbd86', '#b9ddbf'],
  ['#e0a23a', '#eab95f', '#f1d39a', '#d2872a'],
  ['#d4564e', '#e58a84', '#f1c0bc'],
]

export interface MaterialCardMenu {
  id: string
  anchor: ActionMenuAnchor
}

export function MaterialCard({
  record,
  index,
  openMenu,
  setOpenMenu,
  onOpen,
  onPin,
  onRename,
  onDelete,
}: {
  record: LocalDiagnosisRecord
  index: number
  openMenu: MaterialCardMenu | null
  setOpenMenu: (menu: MaterialCardMenu | null) => void
  onOpen: (record: LocalDiagnosisRecord) => void
  onPin: (record: LocalDiagnosisRecord) => void
  onRename: (record: LocalDiagnosisRecord) => void
  onDelete: (record: LocalDiagnosisRecord) => void
}) {
  const progress = getMaterialProgress(record)
  const palette = spinePalettes[index % spinePalettes.length]
  const dotClass = progress.status === 'done'
    ? 'bg-[#58a66a]'
    : progress.status === 'active'
      ? 'bg-[#5C6BC0]'
      : 'bg-slate-300'

  function closeThen(action: (record: LocalDiagnosisRecord) => void) {
    setOpenMenu(null)
    action(record)
  }

  return (
    <article className="group relative overflow-visible rounded-2xl border border-slate-200 bg-white transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_10px_28px_rgba(15,23,42,0.08)]">
      <button
        type="button"
        aria-label={`打开材料：${record.title}`}
        onClick={() => onOpen(record)}
        className="block w-full rounded-2xl p-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#5C6BC0]/50"
      >
        <span aria-hidden="true" className="mb-4 flex h-13 items-end gap-1">
          {palette.map((color, spineIndex) => (
            <span
              key={color}
              className="w-3 rounded-t-[3px] rounded-b-sm"
              style={{ backgroundColor: color, height: `${32 + ((spineIndex * 7 + index * 3) % 18)}px` }}
            />
          ))}
        </span>
        <span className="block truncate pr-7 text-[15px] font-semibold leading-6 text-slate-900" title={record.title}>
          {record.title}
        </span>
        <span className="mt-1 block text-xs text-slate-500">{record.state.nodes.length} 个知识点</span>
        <span className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-600">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dotClass}`} />
          {progress.label}
        </span>
      </button>

      {record.pinned && (
        <span className="absolute right-12 top-4 text-xs text-[#5C6BC0]" aria-label="已置顶">◆</span>
      )}
      <button
        type="button"
        aria-label={`${record.title}的更多操作`}
        onClick={(event) => {
          setOpenMenu(openMenu?.id === record.id
            ? null
            : { id: record.id, anchor: getActionMenuAnchor(event.currentTarget) })
        }}
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 opacity-100 outline-none transition hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-[#5C6BC0]/40 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
      >
        ⋯
      </button>

      {openMenu?.id === record.id && (
        <ActionMenu
          anchor={openMenu.anchor}
          onClose={() => setOpenMenu(null)}
          items={[
            { icon: 'pin', label: record.pinned ? '取消置顶' : '置顶', onClick: () => closeThen(onPin) },
            { icon: 'rename', label: '重命名', onClick: () => closeThen(onRename) },
            { icon: 'share', label: '分享', disabled: true },
            { icon: 'delete', label: '删除', danger: true, onClick: () => closeThen(onDelete) },
          ]}
        />
      )}
    </article>
  )
}
