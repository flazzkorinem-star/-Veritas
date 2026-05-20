'use client'

import { useState, useRef, useCallback } from 'react'

interface VoiceInputProps {
  onTranscript: (text: string) => void
  disabled?: boolean
}

function isVoiceSupported(): boolean {
  if (typeof window === 'undefined') return false
  return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
}

export default function VoiceInput({ onTranscript, disabled = false }: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [micError, setMicError] = useState('')
  const [micDisabled, setMicDisabled] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const transcriptRef = useRef('')

  const startListening = useCallback(() => {
    if (!isVoiceSupported()) return
    setMicError('')
    setTranscript('')
    transcriptRef.current = ''

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SpeechRecognitionAPI = w.SpeechRecognition || w.webkitSpeechRecognition

    if (!SpeechRecognitionAPI) return

    const recognition = new SpeechRecognitionAPI()
    recognition.lang = 'zh-CN'
    recognition.continuous = false
    recognition.interimResults = true

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const current = Array.from(event.results)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => r[0].transcript)
        .join('')
      setTranscript(current)
      transcriptRef.current = current
    }

    recognition.onend = () => {
      setIsListening(false)
      const finalTranscript = transcriptRef.current.trim()
      if (finalTranscript) {
        onTranscript(finalTranscript)
        setTranscript('')
        transcriptRef.current = ''
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      setIsListening(false)
      setTranscript('')
      if (event.error === 'not-allowed') {
        setMicDisabled(true)
        setMicError('麦克风权限未开启，请使用文字输入')
      } else if (event.error === 'no-speech') {
        setMicError('没有检测到语音，请重试')
      } else {
        setMicError(`语音识别错误：${event.error}`)
      }
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [onTranscript])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  if (!isVoiceSupported()) {
    return null
  }

  const buttonDisabled = disabled || micDisabled

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={isListening ? stopListening : startListening}
        disabled={buttonDisabled}
        className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl transition-all ${
          isListening
            ? 'bg-red-500 animate-pulse text-white'
            : micDisabled
              ? 'bg-gray-300 text-gray-500'
              : 'bg-blue-500 hover:bg-blue-600 text-white'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        aria-label={isListening ? '停止录音' : '开始语音回答'}
      >
        {isListening ? '⏹' : '🎤'}
      </button>
      {micError && (
        <p className="text-xs text-red-500 text-center max-w-xs">{micError}</p>
      )}
      {isListening && transcript && (
        <p className="text-sm text-gray-600 italic">"{transcript}"</p>
      )}
      {isListening && (
        <p className="text-xs text-gray-400">正在听...点击停止</p>
      )}
    </div>
  )
}
