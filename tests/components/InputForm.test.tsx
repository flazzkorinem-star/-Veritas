import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import InputForm from '../../components/InputForm'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('../../store/examStore', () => ({
  useExam: () => ({ dispatch: vi.fn() }),
}))

describe('InputForm', () => {
  it('uses file-upload-only input for supported V1 formats', () => {
    const { container } = render(<InputForm />)
    const input = container.querySelector('input[type="file"]')

    expect(screen.queryByPlaceholderText(/粘贴/)).not.toBeInTheDocument()
    expect(screen.queryByText('粘贴学习内容')).not.toBeInTheDocument()
    expect(input).toHaveAttribute('accept', '.pdf,.docx,.pptx,.txt,.md,.markdown')
  })

  it('rejects obvious MIME mismatches before submitting', () => {
    const { container } = render(<InputForm />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['not a docx'], 'notes.docx', { type: 'application/pdf' })

    fireEvent.change(input, { target: { files: [file] } })

    expect(screen.getByText('文件读取失败，请检查文件格式是否正确')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开始检验 →' })).toBeDisabled()
  })
})
