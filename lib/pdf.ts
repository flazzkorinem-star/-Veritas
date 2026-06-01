
import {
  EXPECTED_MIME,
  getFileExtension,
  isTextMime,
  MAX_FILE_BYTES,
  SUPPORTED_EXTENSIONS,
  TEXT_EXTENSIONS,
} from './fileRules'

export const MAX_CONTENT_CHARS = 10_000
export const MIN_TEXT_CHARS = 100
export const CONTENT_LENGTH_WARNING = '文件内容较长，当前版本可能无法覆盖全文重点'

export class FileContentError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

export interface ExtractedDocument {
  text: string
  wasTrimmed: boolean
}

interface UploadedFileLike {
  name: string
  type: string
  size: number
  arrayBuffer(): Promise<ArrayBuffer>
}

export async function extractUploadedFileText(file: UploadedFileLike): Promise<ExtractedDocument> {
  const extension = validateUploadedFile(file)
  const buffer = Buffer.from(await file.arrayBuffer())
  let rawText: string
  try {
    rawText = await extractTextByExtension(buffer, extension)
  } catch (error) {
    if (error instanceof FileContentError) throw error
    throw new FileContentError('文件读取失败，请检查文件格式是否正确')
  }

  return prepareContentForAnalysis(rawText)
}

async function extractTextByExtension(buffer: Buffer, extension: string): Promise<string> {
  if (extension === 'pdf') return extractTextFromPDF(buffer)
  if (extension === 'docx') return extractTextFromDOCX(buffer)
  if (extension === 'pptx') return extractTextFromPPTX(buffer)
  return buffer.toString('utf8')
}

export function prepareContentForAnalysis(content: string): ExtractedDocument {
  const text = content.trim()
  if (!text) {
    throw new FileContentError('未提取到文字内容，请检查文件是否含有可读文字')
  }
  if (text.replace(/\s/g, '').length < MIN_TEXT_CHARS) {
    throw new FileContentError('内容太短，无法生成检验，请补充更多内容')
  }

  return selectContentForAnalysis(text)
}

export function selectContentForAnalysis(content: string): ExtractedDocument {
  if (content.length <= MAX_CONTENT_CHARS) {
    return { text: content, wasTrimmed: false }
  }

  const separator = '\n\n[中间节选]\n\n'
  const budget = MAX_CONTENT_CHARS - separator.length * 2
  const partLength = Math.floor(budget / 3)
  const start = content.slice(0, partLength)
  const middleStart = Math.floor((content.length - partLength) / 2)
  const middle = content.slice(middleStart, middleStart + partLength)
  const end = content.slice(content.length - partLength)

  return {
    text: `${start}${separator}${middle}${separator}${end}`,
    wasTrimmed: true,
  }
}

function validateUploadedFile(file: UploadedFileLike): string {
  if (file.size > MAX_FILE_BYTES) {
    throw new FileContentError('文件过大，请压缩后重新上传')
  }

  const extension = getFileExtension(file.name)
  if (!SUPPORTED_EXTENSIONS.includes(extension)) {
    throw new FileContentError('文件读取失败，请检查文件格式是否正确')
  }

  const mime = file.type.toLowerCase()
  if (EXPECTED_MIME[extension] && mime && !EXPECTED_MIME[extension].includes(mime)) {
    throw new FileContentError('文件读取失败，请检查文件格式是否正确')
  }
  if (TEXT_EXTENSIONS.includes(extension) && mime && !isTextMime(mime)) {
    throw new FileContentError('文件读取失败，请检查文件格式是否正确')
  }

  return extension
}

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  await ensurePdfPolyfills()
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: buffer })
  const result = await parser.getText()
  return result.text
}

export async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}

export async function extractTextFromPPTX(buffer: Buffer): Promise<string> {
  const { default: JSZip } = await import('jszip')
  const { XMLParser } = await import('fast-xml-parser')
  const zip = await JSZip.loadAsync(buffer)
  const parser = new XMLParser()
  const slides = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => getSlideNumber(a) - getSlideNumber(b))

  const slideTexts = await Promise.all(slides.map(async (name) => {
    const xml = await zip.files[name].async('text')
    const parsed = parser.parse(xml)
    const text: string[] = []
    collectPptxText(parsed, text)
    return text.join(' ')
  }))

  return slideTexts.filter(Boolean).join('\n\n')
}

function collectPptxText(node: unknown, output: string[]): void {
  if (!node || typeof node !== 'object') return

  for (const [key, value] of Object.entries(node)) {
    if (key === 'a:t' && typeof value === 'string') {
      output.push(value)
    } else if (key === 'a:t' && Array.isArray(value)) {
      value.forEach((item) => {
        if (typeof item === 'string') output.push(item)
      })
    } else if (Array.isArray(value)) {
      value.forEach((item) => collectPptxText(item, output))
    } else {
      collectPptxText(value, output)
    }
  }
}

function getSlideNumber(path: string): number {
  return Number(path.match(/slide(\d+)\.xml$/)?.[1] || 0)
}

async function ensurePdfPolyfills(): Promise<void> {
  const global = globalThis as Record<string, unknown>
  if (global.DOMMatrix && global.ImageData && global.Path2D) return

  const { DOMMatrix, ImageData, Path2D } = await import('@napi-rs/canvas')
  global.DOMMatrix ??= DOMMatrix
  global.ImageData ??= ImageData
  global.Path2D ??= Path2D

  if (!global.pdfjsWorker) {
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
    global.pdfjsWorker = { WorkerMessageHandler: worker.WorkerMessageHandler }
  }
}
