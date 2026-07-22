import { describe, expect, it, vi } from 'vitest'
import type { KnowledgeNode } from '@/lib/types'
import {
  createMaterialRecord,
  getMaterialProgress,
  importMaterialFiles,
  type MaterialAnalysis,
} from '@/app/_lib/materialLibrary'

const nodes: KnowledgeNode[] = [
  {
    id: 'node-1',
    name: '证据链',
    context: '结论需要证据。',
    sourceExcerpt: '结论必须可追溯。',
    importance: 1,
  },
  {
    id: 'node-2',
    name: '认知层级',
    context: '逐层检验理解。',
    sourceExcerpt: '从记忆推进到分析。',
    importance: 2,
  },
]

describe('materialLibrary', () => {
  it('uses completed node paths and user turns to derive shelf progress', () => {
    const record = createMaterialRecord({
      id: 'material-1',
      fileName: '产品说明.md',
      now: '2026-07-18T00:00:00.000Z',
      analysis: { documentContent: '内容', nodes },
    })

    expect(getMaterialProgress(record)).toEqual({
      status: 'idle',
      label: '未开始',
      completedCount: 0,
      totalCount: 2,
    })

    record.state.nodeConversations[0].turns.push({ role: 'user', content: '我的回答' })
    expect(getMaterialProgress(record).label).toBe('进行中 0/2')

    record.state.nodePathStates['node-1'].completed = true
    expect(getMaterialProgress(record).label).toBe('进行中 1/2')

    record.state.nodePathStates['node-2'].completed = true
    expect(getMaterialProgress(record)).toEqual({
      status: 'done',
      label: '已完成',
      completedCount: 2,
      totalCount: 2,
    })
  })

  it('imports files independently and keeps successful records when one fails', async () => {
    const files = [
      new File(['one'], '第一份.md', { type: 'text/markdown' }),
      new File(['bad'], '失败.md', { type: 'text/markdown' }),
      new File(['two'], '第二份.md', { type: 'text/markdown' }),
    ]
    const saved: string[] = []
    const progress = vi.fn()
    let id = 0
    const analyze = vi.fn(async (file: File): Promise<MaterialAnalysis> => {
      if (file.name === '失败.md') throw new Error('内容不足以生成检验')
      return {
        documentContent: file.name,
        nodes: [{ ...nodes[0], id: `node-${file.name}` }],
      }
    })

    const result = await importMaterialFiles(files, {
      analyze,
      save: async (record) => { saved.push(`${record.title}:${record.state.documentContent}`) },
      createId: () => `material-${++id}`,
      now: () => '2026-07-18T00:00:00.000Z',
      onProgress: progress,
    })

    expect(result.savedCount).toBe(2)
    expect(result.errors).toEqual(['失败.md：内容不足以生成检验'])
    expect(saved).toEqual(['第一份:第一份.md', '第二份:第二份.md'])
    expect(progress).toHaveBeenNthCalledWith(1, 1, 3, '第一份.md')
    expect(progress).toHaveBeenNthCalledWith(3, 3, 3, '第二份.md')
  })
})
