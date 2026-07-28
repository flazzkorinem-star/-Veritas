import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceSidebar } from '@/app/exam/_components/WorkspaceSidebar'
import type { MenuTarget } from '@/app/exam/_lib/examPageTypes'
import { createMaterialRecord } from '@/app/_lib/materialLibrary'

const record = createMaterialRecord({
  id: 'material-1',
  fileName: '产品说明.md',
  now: '2026-07-18T00:00:00.000Z',
  analysis: {
    documentContent: '内容',
    nodes: [{
      id: 'node-1',
      name: '证据链',
      context: '结论需要证据。',
      sourceExcerpt: '结论必须可追溯。',
      importance: 1,
    }],
  },
})

function WorkspaceSidebarHarness({
  onRecordRename = () => {},
}: {
  onRecordRename?: (target: typeof record, name: string) => void
}) {
  const [openMenu, setOpenMenu] = useState<MenuTarget | null>(null)

  return (
    <WorkspaceSidebar
      materialRecords={[record]}
      selectedRecordId={record.id}
      report={null}
      openMenu={openMenu}
      setOpenMenu={setOpenMenu}
      onBackShelf={() => {}}
      onNewDiagnosis={() => {}}
      onOpenReport={() => {}}
      onLoadRecord={() => {}}
      onRecordPin={() => {}}
      onRecordRename={onRecordRename}
      onRecordDelete={() => {}}
    />
  )
}

describe('WorkspaceSidebar', () => {
  it('returns to the shelf and presents records as switchable materials', () => {
    const onBackShelf = vi.fn()
    const onLoadRecord = vi.fn()

    render(
      <WorkspaceSidebar
        materialRecords={[record]}
        selectedRecordId={record.id}
        report={null}
        openMenu={null}
        setOpenMenu={() => {}}
        onBackShelf={onBackShelf}
        onNewDiagnosis={() => {}}
        onOpenReport={() => {}}
        onLoadRecord={onLoadRecord}
        onRecordPin={() => {}}
        onRecordRename={() => {}}
        onRecordDelete={() => {}}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '返回书架' }))
    expect(onBackShelf).toHaveBeenCalledOnce()
    expect(screen.getByText('材料')).toBeInTheDocument()
    expect(screen.queryByText('最近')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '切换材料：产品说明' }))
    expect(onLoadRecord).toHaveBeenCalledWith(record.id)
  })

  it('renames a workspace material through an in-page dialog', () => {
    const onRecordRename = vi.fn()
    render(<WorkspaceSidebarHarness onRecordRename={onRecordRename} />)

    fireEvent.click(screen.getByRole('button', { name: '产品说明的更多操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名' }))
    fireEvent.change(screen.getByRole('textbox', { name: '新名称' }), {
      target: { value: '  产品说明新版  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(onRecordRename).toHaveBeenCalledWith(record, '产品说明新版')
  })
})
