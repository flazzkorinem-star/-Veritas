import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import VoiceInput from '../../components/VoiceInput'

function resetSpeechRecognition() {
  delete (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition
  delete (window as Window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
}

describe('VoiceInput', () => {
  beforeEach(() => {
    resetSpeechRecognition()
  })

  it('sends the final recognized transcript when recording ends', () => {
    let recognition: {
      onresult?: (event: unknown) => void
      onend?: () => void
      start: () => void
      stop: () => void
      lang?: string
      continuous?: boolean
      interimResults?: boolean
    } | null = null

    class MockSpeechRecognition {
      onresult?: (event: unknown) => void
      onend?: () => void
      start = vi.fn()
      stop = vi.fn()
      lang = ''
      continuous = false
      interimResults = false

      constructor() {
        recognition = this
      }
    }

    Object.defineProperty(window, 'webkitSpeechRecognition', {
      value: MockSpeechRecognition,
      configurable: true,
    })

    const onTranscript = vi.fn()
    render(<VoiceInput onTranscript={onTranscript} />)

    fireEvent.click(screen.getByRole('button', { name: '开始语音回答' }))

    act(() => {
      recognition?.onresult?.({
        results: [[{ transcript: '这是我的回答' }]],
      })
      recognition?.onend?.()
    })

    expect(onTranscript).toHaveBeenCalledWith('这是我的回答')
  })

  it('hides voice controls when speech recognition is unsupported', () => {
    render(<VoiceInput onTranscript={vi.fn()} />)

    expect(screen.queryByRole('button', { name: '开始语音回答' })).not.toBeInTheDocument()
  })

  it('disables voice input after microphone permission is denied', () => {
    let recognition: {
      onerror?: (event: { error: string }) => void
      start: () => void
      stop: () => void
    } | null = null

    class MockSpeechRecognition {
      onerror?: (event: { error: string }) => void
      start = vi.fn()
      stop = vi.fn()

      constructor() {
        recognition = this
      }
    }

    Object.defineProperty(window, 'webkitSpeechRecognition', {
      value: MockSpeechRecognition,
      configurable: true,
    })

    render(<VoiceInput onTranscript={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '开始语音回答' }))

    act(() => {
      recognition?.onerror?.({ error: 'not-allowed' })
    })

    expect(screen.getByText('麦克风权限未开启，请使用文字输入')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开始语音回答' })).toBeDisabled()
  })
})
