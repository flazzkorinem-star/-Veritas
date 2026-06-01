// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import {
  extractTextFromPPTX,
  extractUploadedFileText,
  FileContentError,
  MAX_CONTENT_CHARS,
  prepareContentForAnalysis,
  selectContentForAnalysis,
} from '../../lib/pdf'

vi.mock('mammoth', () => ({
  extractRawText: vi.fn(async () => ({ value: 'DOCX知识点'.repeat(30) })),
}))

function makeFile(name: string, content: string, type = 'text/plain') {
  const buffer = Buffer.from(content)
  return makeFileFromBuffer(name, buffer, type)
}

function makeFileFromBuffer(name: string, buffer: Buffer, type: string) {
  return {
    name,
    type,
    size: buffer.length,
    async arrayBuffer(): Promise<ArrayBuffer> {
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
    },
  }
}

describe('selectContentForAnalysis', () => {
  it('returns content unchanged if under limit', () => {
    const short = 'a'.repeat(120)
    expect(selectContentForAnalysis(short)).toEqual({ text: short, wasTrimmed: false })
  })

  it('extracts start, middle, and end when content exceeds limit', () => {
    const long = 'a'.repeat(MAX_CONTENT_CHARS + 1000)
    const result = selectContentForAnalysis(long)
    expect(result.wasTrimmed).toBe(true)
    expect(result.text.length).toBeLessThanOrEqual(MAX_CONTENT_CHARS)
    expect(result.text).toContain('[中间节选]')
  })
})

describe('prepareContentForAnalysis', () => {
  it('rejects empty extracted text', () => {
    expect(() => prepareContentForAnalysis('   ')).toThrow('未提取到文字内容')
  })

  it('rejects text shorter than 100 non-whitespace chars', () => {
    expect(() => prepareContentForAnalysis('短内容')).toThrow('内容太短')
  })
})

describe('extractUploadedFileText', () => {
  it('reads TXT files as UTF-8 text', async () => {
    const file = makeFile('notes.txt', '知识点'.repeat(50))
    const result = await extractUploadedFileText(file)
    expect(result.text).toContain('知识点')
    expect(result.wasTrimmed).toBe(false)
  })

  it('reads Markdown files as UTF-8 text', async () => {
    const file = makeFile('notes.md', '# 标题\n' + '内容'.repeat(60), 'text/markdown')
    const result = await extractUploadedFileText(file)
    expect(result.text).toContain('# 标题')
  })

  it('reads DOCX files with mammoth', async () => {
    const file = makeFile(
      'notes.docx',
      'placeholder',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
    const result = await extractUploadedFileText(file)
    expect(result.text).toContain('DOCX知识点')
  })

  it('reads PPTX slide text', async () => {
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    zip.file(
      'ppt/slides/slide1.xml',
      '<p:sld><p:cSld><p:spTree><a:t>第一张知识点</a:t><a:t>机制说明</a:t></p:spTree></p:cSld></p:sld>'
    )
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })

    const text = await extractTextFromPPTX(buffer)
    expect(text).toContain('第一张知识点')
    expect(text).toContain('机制说明')
  })

  it('rejects mismatched MIME types for DOCX', async () => {
    const file = makeFile('notes.docx', '知识点'.repeat(50), 'application/pdf')
    await expect(extractUploadedFileText(file)).rejects.toThrow('文件读取失败')
  })

  it('maps damaged PPTX files to the unified file-read error', async () => {
    const file = makeFile(
      'notes.pptx',
      'not a zip file',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    )
    await expect(extractUploadedFileText(file)).rejects.toThrow('文件读取失败')
  })

  it('rejects unsupported extensions', async () => {
    const file = makeFile('notes.xlsx', '知识点'.repeat(50))
    await expect(extractUploadedFileText(file)).rejects.toThrow(FileContentError)
  })
})
