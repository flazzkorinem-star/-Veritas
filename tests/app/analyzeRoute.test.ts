// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '../../app/api/analyze/route'
import { analyzeContent } from '@/lib/agents/analyzer'
import { extractUploadedFileText } from '@/lib/pdf'

vi.mock('@/lib/pdf', () => ({
  CONTENT_LENGTH_WARNING: '文件内容较长，当前版本可能无法覆盖全文重点',
  FileContentError: class FileContentError extends Error {
    status = 400
  },
  extractUploadedFileText: vi.fn(),
}))

vi.mock('@/lib/agents/analyzer', () => ({
  analyzeContent: vi.fn(),
}))

function makeRequest(formData: FormData) {
  return new NextRequest('http://localhost/api/analyze', {
    method: 'POST',
    body: formData,
  })
}

describe('POST /api/analyze', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects text-only submissions because V1 is file-upload-only', async () => {
    const formData = new FormData()
    formData.append('text', '这是一段粘贴文本')

    const response = await POST(makeRequest(formData))
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('请先上传文件')
    expect(extractUploadedFileText).not.toHaveBeenCalled()
  })

  it('returns parsed document content and nodes for uploaded files', async () => {
    vi.mocked(extractUploadedFileText).mockResolvedValueOnce({
      text: '知识点'.repeat(50),
      wasTrimmed: false,
    })
    vi.mocked(analyzeContent).mockResolvedValueOnce([
      {
        id: 'node-1',
        name: '知识点',
        context: '材料中的核心概念',
        sourceExcerpt: '知识点的原文片段',
      },
    ])

    const formData = new FormData()
    formData.append('file', new File(['知识点'.repeat(50)], 'notes.md', { type: 'text/markdown' }))

    const response = await POST(makeRequest(formData))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(extractUploadedFileText).toHaveBeenCalledTimes(1)
    expect(analyzeContent).toHaveBeenCalledWith('知识点'.repeat(50))
    expect(data.documentContent).toBe('知识点'.repeat(50))
    expect(data.nodes[0].sourceExcerpt).toBe('知识点的原文片段')
  })
})
