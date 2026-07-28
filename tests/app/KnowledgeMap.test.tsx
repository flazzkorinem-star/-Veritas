import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { KnowledgeMap } from '@/app/exam/_components/KnowledgeMap'
import type { MenuTarget } from '@/app/exam/_lib/examPageTypes'
import type { KnowledgeNode } from '@/lib/types'
import { initialState, reducer, type Action, type StoreExamState } from '@/store/examStore'

const nodes: KnowledgeNode[] = [
  {
    id: 'node-1',
    name: '检索增强生成',
    context: '检索后再生成。',
    sourceExcerpt: '先检索相关材料。',
    importance: 1,
  },
  {
    id: 'node-2',
    name: '向量嵌入',
    context: '文本向量化。',
    sourceExcerpt: '嵌入用于相似度检索。',
    importance: 2,
  },
  {
    id: 'node-3',
    name: '分块策略',
    context: '材料分块。',
    sourceExcerpt: '材料按语义切分。',
    importance: 3,
  },
]

function makeState(mapNodes = nodes): StoreExamState {
  return reducer(initialState, { type: 'SET_NODES', nodes: mapNodes })
}

function KnowledgeMapHarness({
  onNodeImportance = () => {},
  onNodeRename = () => {},
  mapNodes = nodes,
}: {
  onNodeImportance?: (nodeId: string, importance: KnowledgeNode['importance']) => void
  onNodeRename?: (nodeId: string, name: string) => void
  mapNodes?: KnowledgeNode[]
}) {
  const [openMenu, setOpenMenu] = useState<MenuTarget | null>(null)

  return (
    <KnowledgeMap
      state={makeState(mapNodes)}
      displayedTitle="RAG 学习材料"
      hasActiveDiagnosis
      openMenu={openMenu}
      setOpenMenu={setOpenMenu}
      dispatch={vi.fn<(action: Action) => void>()}
      onNodeImportance={onNodeImportance}
      onNodePin={() => {}}
      onNodeRename={onNodeRename}
      onNodeDelete={() => {}}
    />
  )
}

describe('KnowledgeMap', () => {
  it('groups nodes by importance and only expands the first tier by default', () => {
    render(<KnowledgeMapHarness />)

    expect(screen.getByText('知识地图')).toBeInTheDocument()
    expect(screen.getByText('检索增强生成')).toBeInTheDocument()
    expect(screen.queryByText('向量嵌入')).not.toBeInTheDocument()
    expect(screen.queryByText('分块策略')).not.toBeInTheDocument()
    expect(screen.queryByText('最重要')).not.toBeInTheDocument()
    expect(screen.queryByText('较重要')).not.toBeInTheDocument()

    expect(screen.getByRole('button', { name: '重要度 1，1 个知识点' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: '重要度 2，1 个知识点' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('expands the highest available tier when tier one is absent', () => {
    render(<KnowledgeMapHarness mapNodes={nodes.slice(1)} />)

    expect(screen.getByRole('button', { name: '重要度 2，1 个知识点' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('向量嵌入')).toBeInTheDocument()
    expect(screen.queryByText('分块策略')).not.toBeInTheDocument()
  })

  it('lets the user expand and collapse lower tiers', () => {
    render(<KnowledgeMapHarness />)

    const secondTier = screen.getByRole('button', { name: '重要度 2，1 个知识点' })
    fireEvent.click(secondTier)
    expect(screen.getByText('向量嵌入')).toBeInTheDocument()
    expect(secondTier).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(secondTier)
    expect(screen.queryByText('向量嵌入')).not.toBeInTheDocument()
  })

  it('lets the user select a specific importance tier', () => {
    const onNodeImportance = vi.fn()
    render(<KnowledgeMapHarness onNodeImportance={onNodeImportance} />)

    fireEvent.click(screen.getByRole('button', { name: '检索增强生成的更多操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '调整重要度' }))
    expect(onNodeImportance).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: '调整重要度' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '◆◆◆ 当前' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '◆◆' }))
    expect(onNodeImportance).toHaveBeenCalledWith('node-1', 2)
  })

  it('renames a knowledge node through an in-page dialog', () => {
    const onNodeRename = vi.fn()
    render(<KnowledgeMapHarness onNodeRename={onNodeRename} />)

    fireEvent.click(screen.getByRole('button', { name: '检索增强生成的更多操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名' }))
    fireEvent.change(screen.getByRole('textbox', { name: '新名称' }), {
      target: { value: '  RAG 工作流  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(onNodeRename).toHaveBeenCalledWith('node-1', 'RAG 工作流')
  })
})
