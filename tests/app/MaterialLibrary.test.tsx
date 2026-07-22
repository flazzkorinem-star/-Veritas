import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MaterialLibrary } from '@/app/_components/MaterialLibrary'
import { createMaterialRecord } from '@/app/_lib/materialLibrary'
import type { KnowledgeNode } from '@/lib/types'

const node: KnowledgeNode = {
  id: 'node-1',
  name: '证据链',
  context: '结论需要证据。',
  sourceExcerpt: '结论必须可追溯。',
  importance: 1,
}

function makeRecord(id: string, title: string) {
  return createMaterialRecord({
    id,
    fileName: `${title}.md`,
    now: `2026-07-18T0${id.length}:00:00.000Z`,
    analysis: { documentContent: title, nodes: [{ ...node, id: `node-${id}` }] },
  })
}

describe('MaterialLibrary', () => {
  it('renders material cards and opens a selected record', () => {
    const records = [makeRecord('a', '产品说明'), makeRecord('bb', '统计学讲义')]
    const onOpenRecord = vi.fn()

    render(
      <MaterialLibrary
        records={records}
        loading={false}
        uploading={false}
        uploadMessage=""
        error=""
        onFiles={() => {}}
        onOpenRecord={onOpenRecord}
        onPin={() => {}}
        onRename={() => {}}
        onDelete={() => {}}
      />
    )

    expect(screen.getByRole('heading', { name: '我的书架' })).toBeInTheDocument()
    expect(screen.getByText('材料库 · 2 份')).toBeInTheDocument()
    expect(screen.getAllByText('1 个知识点')).toHaveLength(2)
    expect(screen.getAllByText('未开始')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: '打开材料：产品说明' }))
    expect(onOpenRecord).toHaveBeenCalledWith(records[0])
  })

  it('accepts multiple files and exposes all card actions', () => {
    const record = makeRecord('a', '产品说明')
    const onFiles = vi.fn()
    const onPin = vi.fn()

    render(
      <MaterialLibrary
        records={[record]}
        loading={false}
        uploading={false}
        uploadMessage=""
        error=""
        onFiles={onFiles}
        onOpenRecord={() => {}}
        onPin={onPin}
        onRename={() => {}}
        onDelete={() => {}}
      />
    )

    const first = new File(['one'], 'one.md', { type: 'text/markdown' })
    const second = new File(['two'], 'two.md', { type: 'text/markdown' })
    fireEvent.change(screen.getByLabelText('上传材料'), { target: { files: [first, second] } })
    expect(onFiles).toHaveBeenCalledWith([first, second])

    fireEvent.click(screen.getByRole('button', { name: '产品说明的更多操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '置顶' }))
    expect(onPin).toHaveBeenCalledWith(record)

    fireEvent.click(screen.getByRole('button', { name: '产品说明的更多操作' }))
    expect(screen.getByRole('menuitem', { name: '重命名' })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: '分享' })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: '删除' })).toBeEnabled()
  })
})
