'use client'

import type { Dispatch } from 'react'
import type { Action, StoreExamState } from '@/store/examStore'
import type { MenuTarget } from '../_lib/examPageTypes'
import { getNodeStageText, nodeBookColors } from '../_lib/examPageHelpers'
import { ActionMenu } from './ActionMenu'

export function KnowledgeNodeRail({
  state,
  displayedTitle,
  hasActiveDiagnosis,
  openMenu,
  setOpenMenu,
  dispatch,
  onNodePin,
  onNodeRename,
  onNodeDelete,
}: {
  state: StoreExamState
  displayedTitle: string
  hasActiveDiagnosis: boolean
  openMenu: MenuTarget | null
  setOpenMenu: (target: MenuTarget | null) => void
  dispatch: Dispatch<Action>
  onNodePin: (nodeId: string) => void
  onNodeRename: (nodeId: string, currentName: string) => void
  onNodeDelete: (nodeId: string, nodeName: string) => void
}) {
  return (
    <aside className="min-h-0 border-r border-slate-200 bg-[#f4f4ee]">
      <div className="border-b border-slate-200 px-3 py-4">
        <p className="text-xs text-slate-400">当前材料</p>
        <p className="mt-1 truncate text-sm font-semibold text-slate-900">{displayedTitle}</p>
      </div>
      <div className="h-[calc(100%-73px)] overflow-y-auto py-3">
        {hasActiveDiagnosis ? (
          state.nodes.map((node, index) => {
            const isSelected = index === state.currentNodeIndex
            const isStarted = isSelected || (state.nodeConversations[index]?.turns.length ?? 0) > 0
            const color = nodeBookColors[index % nodeBookColors.length]
            return (
              <div
                key={node.id}
                role="button"
                tabIndex={0}
                onClick={() => dispatch({ type: 'SELECT_NEXT_NODE', nodeIndex: index })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') dispatch({ type: 'SELECT_NEXT_NODE', nodeIndex: index })
                }}
                className={`group relative flex w-full items-center gap-2 px-3 py-3 text-left transition-[background] duration-150 hover:bg-black/5 ${
                  isSelected ? 'bg-black/[0.06]' : ''
                }`}
              >
                {isSelected && (
                  <span className="absolute left-0 top-2 h-12 w-[3px] rounded-r bg-[#5C6BC0]" />
                )}
                <span className="relative ml-1 h-12 w-11 shrink-0">
                  <span
                    className="absolute left-2 top-2 h-9 w-8 rounded-md border-2 border-black/15 opacity-60 shadow-sm"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    className="absolute left-0 top-0 h-10 w-8 rounded-md border-2 border-black/20 shadow-[2px_2px_0_rgba(0,0,0,0.12)]"
                    style={{ backgroundColor: color }}
                  />
                  <span className="absolute left-2 top-1 h-8 w-px bg-white/35" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{node.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">{getNodeStageText(state, node.id, index)}</span>
                </span>
                <span className={`h-2 w-2 shrink-0 rounded-full ${isStarted ? 'bg-[#5C6BC0]' : 'bg-slate-300'}`} />
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    setOpenMenu(openMenu?.type === 'node' && openMenu.id === node.id ? null : { type: 'node', id: node.id })
                  }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 opacity-0 transition-opacity hover:bg-black/5 hover:text-slate-700 group-hover:opacity-100"
                  aria-label="更多操作"
                >
                  ⋯
                </button>
                {openMenu?.type === 'node' && openMenu.id === node.id && (
                  <ActionMenu
                    items={[
                      { icon: '📌', label: node.pinned ? '取消置顶' : '置顶', onClick: () => onNodePin(node.id) },
                      { icon: '✎', label: '重命名', onClick: () => onNodeRename(node.id, node.name) },
                      { icon: '↗', label: '分享', disabled: true },
                      { icon: '🗑', label: '删除', danger: true, onClick: () => onNodeDelete(node.id, node.name) },
                    ]}
                  />
                )}
              </div>
            )
          })
        ) : (
          <p className="px-3 py-4 text-sm leading-6 text-slate-400">上传材料后自动生成</p>
        )}
      </div>
    </aside>
  )
}
