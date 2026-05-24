const MAX_FILE_BYTES = 10 * 1024 * 1024
export const MATERIAL_FILE_ACCEPT = '.pdf,.docx,.pptx,.txt,.md,.markdown'

const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.pptx', '.txt', '.md', '.markdown']
const EXPECTED_MIME: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
}

function isTextLikeMime(mime: string): boolean {
  return (
    mime.startsWith('text/')
    || mime === 'application/octet-stream'
    || mime === 'application/markdown'
    || mime === 'application/x-markdown'
  )
}

export function validateMaterialFile(selectedFile: File): string | null {
  const lowerName = selectedFile.name.toLowerCase()
  const extension = SUPPORTED_EXTENSIONS.find((ext) => lowerName.endsWith(ext))
  if (!extension) return '文件读取失败，请检查文件格式是否正确'
  if (selectedFile.type && EXPECTED_MIME[extension] && !EXPECTED_MIME[extension].includes(selectedFile.type)) {
    return '文件读取失败，请检查文件格式是否正确'
  }
  if (selectedFile.type && ['.txt', '.md', '.markdown'].includes(extension) && !isTextLikeMime(selectedFile.type)) {
    return '文件读取失败，请检查文件格式是否正确'
  }
  if (selectedFile.size > MAX_FILE_BYTES) return '文件过大，请压缩后重新上传'
  return null
}
