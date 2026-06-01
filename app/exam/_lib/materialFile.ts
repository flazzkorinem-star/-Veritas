import {
  EXPECTED_MIME,
  getFileExtension,
  isTextMime,
  MAX_FILE_BYTES,
  SUPPORTED_EXTENSIONS,
  TEXT_EXTENSIONS,
} from '@/lib/fileRules'

export const MATERIAL_FILE_ACCEPT = SUPPORTED_EXTENSIONS.map((ext) => `.${ext}`).join(',')

export function validateMaterialFile(selectedFile: File): string | null {
  const extension = getFileExtension(selectedFile.name)
  if (!SUPPORTED_EXTENSIONS.includes(extension)) {
    return '文件读取失败，请检查文件格式是否正确'
  }
  if (selectedFile.type && EXPECTED_MIME[extension] && !EXPECTED_MIME[extension].includes(selectedFile.type)) {
    return '文件读取失败，请检查文件格式是否正确'
  }
  if (selectedFile.type && TEXT_EXTENSIONS.includes(extension) && !isTextMime(selectedFile.type)) {
    return '文件读取失败，请检查文件格式是否正确'
  }
  if (selectedFile.size > MAX_FILE_BYTES) {
    return '文件过大，请压缩后重新上传'
  }
  return null
}
