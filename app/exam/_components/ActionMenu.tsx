'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

export interface ActionMenuItem {
  icon: 'importance' | 'pin' | 'rename' | 'share' | 'delete'
  label: string
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
}

export interface ActionMenuAnchor {
  right: number
  bottom: number
}

export function getActionMenuAnchor(element: HTMLElement): ActionMenuAnchor {
  const rect = element.getBoundingClientRect()
  return {
    right: rect.right,
    bottom: rect.bottom,
  }
}

function MenuIcon({ icon }: { icon: ActionMenuItem['icon'] }) {
  if (icon === 'importance') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
        <path d="m5 3 3 3-3 3-3-3 3-3Zm7 4 3 3-3 3-3-3 3-3Zm7 4 3 3-3 3-3-3 3-3Z" />
      </svg>
    )
  }
  if (icon === 'rename') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    )
  }
  if (icon === 'share') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M7 17 17 7" />
        <path d="M8 7h9v9" />
      </svg>
    )
  }
  if (icon === 'delete') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M6 6l1 14h10l1-14" />
        <path d="M10 11v5" />
        <path d="M14 11v5" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m12 3 2.4 5.2 5.6.6-4.1 3.8 1.1 5.5-5-2.8-5 2.8 1.1-5.5L4 8.8l5.6-.6Z" />
    </svg>
  )
}

export function ActionMenu({
  items,
  anchor,
  onClose,
}: {
  items: ActionMenuItem[]
  anchor: ActionMenuAnchor
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuHeight, setMenuHeight] = useState(0)
  const position = useMemo(() => {
    if (typeof window === 'undefined') return { left: anchor.right, top: anchor.bottom }
    const width = 136
    const margin = 8
    return {
      left: Math.max(margin, Math.min(anchor.right - width, window.innerWidth - width - margin)),
      top: Math.max(margin, Math.min(anchor.bottom + 6, window.innerHeight - menuHeight - margin)),
    }
  }, [anchor, menuHeight])

  useLayoutEffect(() => {
    const height = menuRef.current?.getBoundingClientRect().height ?? 0
    setMenuHeight(height)
  }, [items.length])

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (menuRef.current?.contains(event.target as Node)) return
      onClose()
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      onClick={(event) => event.stopPropagation()}
      role="menu"
      style={position}
      className="fixed z-50 w-[136px] rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-[0_12px_30px_rgba(15,23,42,0.16)]"
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={item.onClick}
          disabled={item.disabled}
          role="menuitem"
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${
            item.disabled
              ? 'cursor-not-allowed text-slate-300'
              : item.danger
                ? 'text-red-500 hover:bg-red-50'
                : 'text-slate-800 hover:bg-slate-100'
          }`}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center">
            <MenuIcon icon={item.icon} />
          </span>
          <span className="leading-none">{item.label}</span>
        </button>
      ))}
    </div>
  )
}
