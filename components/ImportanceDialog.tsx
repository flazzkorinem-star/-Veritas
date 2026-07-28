'use client'

import { useEffect, useId, useRef } from 'react'
import type { KnowledgeNode } from '@/lib/types'

const importanceLevels: KnowledgeNode['importance'][] = [1, 2, 3]

export function ImportanceDialog({
  nodeName,
  currentImportance,
  onCancel,
  onSelect,
}: {
  nodeName: string
  currentImportance: KnowledgeNode['importance']
  onCancel: () => void
  onSelect: (importance: KnowledgeNode['importance']) => void
}) {
  const titleId = useId()
  const currentButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    currentButtonRef.current?.focus()
    return () => previousFocus?.focus()
  }, [])

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/25 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.22)]"
      >
        <h2 id={titleId} className="text-base font-semibold text-slate-900">调整重要度</h2>
        <p className="mt-1 text-sm text-slate-500">为「{nodeName}」选择重要度</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {importanceLevels.map((importance) => {
            const label = '◆'.repeat(4 - importance)
            const isCurrent = importance === currentImportance
            return (
              <button
                key={importance}
                ref={isCurrent ? currentButtonRef : undefined}
                type="button"
                aria-label={`${label}${isCurrent ? ' 当前' : ''}`}
                onClick={() => onSelect(importance)}
                className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                  isCurrent
                    ? 'border-[#5C6BC0] bg-[#5C6BC0]/10 text-[#4059ad]'
                    : 'border-slate-200 text-slate-600 hover:border-[#5C6BC0]/45 hover:bg-slate-50'
                }`}
              >
                {label}
                {isCurrent && <span className="mt-1 block text-[11px] font-medium">当前</span>}
              </button>
            )
          })}
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
          >
            取消
          </button>
        </div>
      </section>
    </div>
  )
}
