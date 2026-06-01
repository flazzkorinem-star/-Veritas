// Shared file-upload rules for both the frontend pre-check (materialFile.ts) and
// the server-side authoritative check (pdf.ts). Keep this module dependency-free so
// importing it into the browser bundle never pulls in server-only code.

export const MAX_FILE_BYTES = 10 * 1024 * 1024

export const SUPPORTED_EXTENSIONS = ['pdf', 'docx', 'pptx', 'txt', 'md', 'markdown']

export const TEXT_EXTENSIONS = ['txt', 'md', 'markdown']

export const EXPECTED_MIME: Record<string, string[]> = {
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
}

export function getFileExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split('.')
  return parts.length > 1 ? parts[parts.length - 1] : ''
}

export function isTextMime(mime: string): boolean {
  return mime.startsWith('text/')
    || mime === 'application/octet-stream'
    || mime === 'application/markdown'
    || mime === 'application/x-markdown'
}
