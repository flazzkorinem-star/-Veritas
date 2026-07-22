'use client'

import { useState, type Dispatch } from 'react'
import type { KnowledgeNode } from '@/lib/types'
import type { Action, StoreExamState } from '@/store/examStore'
import type { MenuTarget } from '../_lib/examPageTypes'
import { getNodeStageText, nodeBookColors } from '../_lib/examPageHelpers'
import { ActionMenu, getActionMenuAnchor } from '@/components/ActionMenu'
import { RenameDialog } from '@/components/RenameDialog'
import { ImportanceDialog } from '@/components/ImportanceDialog'

const importanceLevels: KnowledgeNode['importance'][] = [1, 2, 3]

const groupStyles = {
  1: {
    panel: 'border-[#4059ad]/25 bg-white',
    marker: 'text-[#4059ad]',
    count: 'text-[#4059ad]',
    rule: 'bg-[#4059ad]',
  },
  2: {
    panel: 'border-[#7d8db8]/20 bg-white/70',
    marker: 'text-[#7d8db8]',
    count: 'text-[#6f7fa9]',
    rule: 'bg-[#7d8db8]',
  },
  3: {
    panel: 'border-[#a9b1c4]/20 bg-white/40',
    marker: 'text-[#a9b1c4]',
    count: 'text-[#8f98ab]',
    rule: 'bg-[#a9b1c4]',
  },
} satisfies Record<KnowledgeNode['importance'], {
  panel: string
  marker: string
  count: string
  rule: string
}>

export function KnowledgeMap({
  state,
  displayedTitle,
  hasActiveDiagnosis,
  openMenu,
  setOpenMenu,
  dispatch,
  onNodeImportance,
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
  onNodeImportance: (nodeId: string, importance: KnowledgeNode['importance']) => void
  onNodePin: (nodeId: string) => void
  onNodeRename: (nodeId: string, name: string) => void
  onNodeDelete: (nodeId: string, nodeName: string) => void
}) {
  const defaultExpandedGroup = importanceLevels.find((importance) => (
    state.nodes.some((node) => node.importance === importance)
  ))
  const [expandedGroups, setExpandedGroups] = useState<Set<KnowledgeNode['importance']>>(
    () => new Set(defaultExpandedGroup ? [defaultExpandedGroup] : [])
  )
  const [renamingNode, setRenamingNode] = useState<KnowledgeNode | null>(null)
  const [adjustingNode, setAdjustingNode] = useState<KnowledgeNode | null>(null)
  const groups = importanceLevels
    .map((importance) => ({
      importance,
      items: state.nodes.flatMap((node, index) => (
        node.importance === importance ? [{ node, index }] : []
      )),
    }))
    .filter((group) => group.items.length > 0)

  function toggleGroup(importance: KnowledgeNode['importance']) {
    setExpandedGroups((current) => {
      const next = new Set(current)
      if (next.has(importance)) next.delete(importance)
      else next.add(importance)
      return next
    })
  }

  return (
    <aside aria-label="知识地图" className="min-h-0 border-r border-slate-200 bg-[#f4f4ee]">
      <header className="border-b border-slate-200 px-3 py-3.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold tracking-[0.16em] text-[#4059ad]">知识地图</h2>
          {hasActiveDiagnosis && (
            <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-slate-500">
              {state.nodes.length} 个
            </span>
          )}
        </div>
        <p className="mt-1.5 truncate text-sm font-semibold text-slate-900" title={displayedTitle}>
          {displayedTitle}
        </p>
        {hasActiveDiagnosis && (
          <p className="mt-1 text-[11px] leading-4 text-slate-500">建议从上往下，也可任选起点</p>
        )}
      </header>

      <nav aria-label="按重要度分组的知识点" className="h-[calc(100%-86px)] space-y-2 overflow-y-auto p-2.5">
        {hasActiveDiagnosis ? groups.map(({ importance, items }) => {
          const isExpanded = expandedGroups.has(importance)
          const styles = groupStyles[importance]
          const contentId = `knowledge-map-group-${importance}`

          return (
            <section key={importance} className={`overflow-hidden rounded-xl border ${styles.panel}`}>
              <h3>
                <button
                  type="button"
                  aria-label={`重要度 ${importance}，${items.length} 个知识点`}
                  aria-expanded={isExpanded}
                  aria-controls={contentId}
                  onClick={() => toggleGroup(importance)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left outline-none transition-colors hover:bg-black/[0.025] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4059ad]/45"
                >
                  <span aria-hidden="true" className={`flex items-center gap-0.5 text-[10px] ${styles.marker}`}>
                    {Array.from({ length: 4 - importance }, (_, index) => <span key={index}>◆</span>)}
                  </span>
                  <span className={`text-xs font-semibold ${styles.count}`}>{items.length} 个</span>
                  <span className={`h-px flex-1 opacity-20 ${styles.rule}`} />
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    className={`h-4 w-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path d="m5 7.5 5 5 5-5" />
                  </svg>
                </button>
              </h3>

              {isExpanded && (
                <div id={contentId} className="border-t border-black/[0.05] py-1">
                  {items.map(({ node, index }) => {
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
                          if (event.key !== 'Enter' && event.key !== ' ') return
                          event.preventDefault()
                          dispatch({ type: 'SELECT_NEXT_NODE', nodeIndex: index })
                        }}
                        className={`group relative flex w-full items-center gap-2 px-2.5 py-2.5 text-left outline-none transition-colors hover:bg-black/[0.035] focus-visible:bg-black/[0.035] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4059ad]/35 ${
                          isSelected ? 'bg-[#4059ad]/[0.07]' : ''
                        }`}
                      >
                        {isSelected && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-[#4059ad]" />}
                        <span className="relative ml-1 h-10 w-9 shrink-0" aria-hidden="true">
                          <span
                            className="absolute left-1.5 top-1.5 h-8 w-7 rounded-md border-2 border-black/15 opacity-55 shadow-sm"
                            style={{ backgroundColor: color }}
                          />
                          <span
                            className="absolute left-0 top-0 h-9 w-7 rounded-md border-2 border-black/20 shadow-[2px_2px_0_rgba(0,0,0,0.12)]"
                            style={{ backgroundColor: color }}
                          />
                          <span className="absolute left-1.5 top-1 h-7 w-px bg-white/40" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-900">{node.name}</span>
                          <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                            {getNodeStageText(state, node.id, index)}
                          </span>
                        </span>
                        <span className={`h-2 w-2 shrink-0 rounded-full ${isStarted ? 'bg-[#4059ad]' : 'bg-slate-300'}`} />
                        <button
                          type="button"
                          aria-label={`${node.name}的更多操作`}
                          onClick={(event) => {
                            event.stopPropagation()
                            setOpenMenu(openMenu?.type === 'node' && openMenu.id === node.id
                              ? null
                              : { type: 'node', id: node.id, anchor: getActionMenuAnchor(event.currentTarget) })
                          }}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 opacity-100 outline-none transition hover:bg-black/5 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-[#4059ad]/40 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                        >
                          ⋯
                        </button>
                        {openMenu?.type === 'node' && openMenu.id === node.id && (
                          <ActionMenu
                            anchor={openMenu.anchor}
                            onClose={() => setOpenMenu(null)}
                            items={[
                              {
                                icon: 'importance',
                                label: '调整重要度',
                                onClick: () => {
                                  setOpenMenu(null)
                                  setAdjustingNode(node)
                                },
                              },
                              { icon: 'pin', label: node.pinned ? '取消置顶' : '置顶', onClick: () => onNodePin(node.id) },
                              {
                                icon: 'rename',
                                label: '重命名',
                                onClick: () => {
                                  setOpenMenu(null)
                                  setRenamingNode(node)
                                },
                              },
                              { icon: 'share', label: '分享', disabled: true },
                              { icon: 'delete', label: '删除', danger: true, onClick: () => onNodeDelete(node.id, node.name) },
                            ]}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )
        }) : (
          <p className="rounded-xl border border-dashed border-slate-300 px-3 py-5 text-sm leading-6 text-slate-400">
            上传材料后自动生成
          </p>
        )}
      </nav>
      {renamingNode && (
        <RenameDialog
          title="重命名知识点"
          initialValue={renamingNode.name}
          onCancel={() => setRenamingNode(null)}
          onConfirm={(name) => {
            onNodeRename(renamingNode.id, name)
            setRenamingNode(null)
          }}
        />
      )}
      {adjustingNode && (
        <ImportanceDialog
          nodeName={adjustingNode.name}
          currentImportance={adjustingNode.importance}
          onCancel={() => setAdjustingNode(null)}
          onSelect={(importance) => {
            onNodeImportance(adjustingNode.id, importance)
            setAdjustingNode(null)
          }}
        />
      )}
    </aside>
  )
}
