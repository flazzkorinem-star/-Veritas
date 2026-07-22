'use client'

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'

export function RenameDialog({
  title,
  initialValue,
  onCancel,
  onConfirm,
}: {
  title: string
  initialValue: string
  onCancel: () => void
  onConfirm: (name: string) => void
}) {
  const [name, setName] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    inputRef.current?.focus()
    inputRef.current?.select()
    return () => previousFocus?.focus()
  }, [])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = name.trim()
    if (trimmedName) onConfirm(trimmedName)
  }

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
        <h2 id={titleId} className="text-base font-semibold text-slate-900">{title}</h2>
        <form className="mt-4" onSubmit={handleSubmit}>
          <label htmlFor={`${titleId}-name`} className="text-sm font-medium text-slate-700">新名称</label>
          <input
            ref={inputRef}
            id={`${titleId}-name`}
            aria-label="新名称"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#5C6BC0] focus:ring-2 focus:ring-[#5C6BC0]/20"
          />
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="rounded-xl bg-[#5C6BC0] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#505eb0] disabled:cursor-not-allowed disabled:opacity-45"
            >
              保存
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
