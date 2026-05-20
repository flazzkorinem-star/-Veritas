'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useExam } from '@/store/examStore'
import { readApiJson } from '@/lib/apiResponse'
import { KnowledgeNode } from '@/lib/types'

interface AnalyzeResponse {
  nodes?: KnowledgeNode[]
  documentContent?: string
  contentWarning?: string
  error?: string
}

const MAX_FILE_BYTES = 10 * 1024 * 1024
const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.pptx', '.txt', '.md', '.markdown']
const EXPECTED_MIME: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
}

export default function InputForm() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const { dispatch } = useExam()

  const handleSubmit = async () => {
    if (!file) {
      setError('请先上传文件')
      return
    }

    setLoading(true)
    setLoadingMessage('正在读取内容…')
    setError('')
    setWarning('')
    let analyzeMessageTimer: number | undefined

    try {
      const formData = new FormData()
      formData.append('file', file)

      analyzeMessageTimer = window.setTimeout(() => {
        setLoadingMessage('正在分析知识点…')
      }, 600)
      const res = await fetch('/api/analyze', { method: 'POST', body: formData })
      window.clearTimeout(analyzeMessageTimer)
      analyzeMessageTimer = undefined
      setLoadingMessage('正在分析知识点…')
      const data = await readApiJson<AnalyzeResponse>(res)

      if (!res.ok) throw new Error(data.error || '分析失败')
      if (!data.documentContent || !Array.isArray(data.nodes)) {
        throw new Error('服务器返回的数据不完整，请稍后重试')
      }

      dispatch({ type: 'START_ANALYZING', content: data.documentContent })
      dispatch({ type: 'SET_NODES', nodes: data.nodes })
      if (data.contentWarning) {
        setWarning(data.contentWarning)
      }
      setLoadingMessage(`将围绕 ${data.nodes.length} 个知识节点开始检验`)
      await new Promise((resolve) => setTimeout(resolve, 1400))
      router.push('/exam')
    } catch (e) {
      setError(e instanceof Error ? e.message : '分析失败，请重试')
    } finally {
      if (analyzeMessageTimer) window.clearTimeout(analyzeMessageTimer)
      setLoading(false)
      setLoadingMessage('')
    }
  }

  const handleFileChange = (selectedFile: File | undefined) => {
    setError('')
    setWarning('')
    if (!selectedFile) {
      setFile(null)
      return
    }

    const lowerName = selectedFile.name.toLowerCase()
    const extension = SUPPORTED_EXTENSIONS.find((ext) => lowerName.endsWith(ext))
    if (!extension) {
      setFile(null)
      setError('文件读取失败，请检查文件格式是否正确')
      return
    }
    if (selectedFile.type && EXPECTED_MIME[extension] && !EXPECTED_MIME[extension].includes(selectedFile.type)) {
      setFile(null)
      setError('文件读取失败，请检查文件格式是否正确')
      return
    }
    if (selectedFile.type && ['.txt', '.md', '.markdown'].includes(extension) && !isTextLikeMime(selectedFile.type)) {
      setFile(null)
      setError('文件读取失败，请检查文件格式是否正确')
      return
    }
    if (selectedFile.size > MAX_FILE_BYTES) {
      setFile(null)
      setError('文件过大，请压缩后重新上传')
      return
    }
    setFile(selectedFile)
  }

  const isTextLikeMime = (mime: string) => (
    mime.startsWith('text/')
    || mime === 'application/octet-stream'
    || mime === 'application/markdown'
    || mime === 'application/x-markdown'
  )

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.pptx,.txt,.md,.markdown"
          className="hidden"
          onChange={(e) => handleFileChange(e.target.files?.[0])}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          className="w-full border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-blue-400 transition-colors disabled:opacity-50"
        >
          {file ? (
            <div className="text-blue-600 font-medium">📄 {file.name}</div>
          ) : (
            <div className="text-gray-400">
              <div className="text-2xl mb-1">📁</div>
              <div className="text-sm">点击上传 PDF、DOCX、PPTX、TXT 或 Markdown 文件</div>
              <div className="text-xs mt-1">最大 10MB</div>
            </div>
          )}
        </button>
      </div>

      {warning && <p className="text-amber-600 text-sm text-center">{warning}</p>}
      {loadingMessage && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-center text-sm text-blue-700">
          {loadingMessage}
        </div>
      )}
      {error && <p className="text-red-500 text-sm text-center">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={loading || !file}
        className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-4 rounded-xl text-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? '处理中...' : '开始检验 →'}
      </button>
    </div>
  )
}
