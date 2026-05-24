'use client'

export interface ActionMenuItem {
  icon: string
  label: string
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
}

export function ActionMenu({ items }: { items: ActionMenuItem[] }) {
  return (
    <div
      onClick={(event) => event.stopPropagation()}
      className="absolute right-2 top-10 z-30 w-32 rounded-2xl border border-slate-100 bg-white p-1.5 text-sm shadow-xl"
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={item.onClick}
          disabled={item.disabled}
          className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left ${
            item.disabled
              ? 'cursor-not-allowed text-slate-300'
              : item.danger
                ? 'text-red-500 hover:bg-red-50'
                : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <span>{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  )
}
