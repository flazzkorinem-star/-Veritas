// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createMock = vi.hoisted(() => vi.fn())

vi.mock('openai', () => ({
  default: vi.fn(function OpenAIMock() {
    return {
      chat: {
        completions: {
          create: createMock,
        },
      },
    }
  }),
}))

describe('chat', () => {
  beforeEach(() => {
    vi.resetModules()
    createMock.mockReset()
    process.env.DEEPSEEK_API_KEY = 'test-key'
  })

  it('does not pass an undefined timeout request option', async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: 'ok' } }],
    })

    const { chat } = await import('../../lib/llm')

    await chat([{ role: 'user', content: 'hello' }])

    expect(createMock).toHaveBeenCalledTimes(1)
    expect(createMock.mock.calls[0][1]).toBeUndefined()
  })

  it('passes timeout only when timeoutMs is provided', async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: 'ok' } }],
    })

    const { chat } = await import('../../lib/llm')

    await chat([{ role: 'user', content: 'hello' }], { timeoutMs: 22_000 })

    expect(createMock.mock.calls[0][1]).toEqual({ timeout: 22_000 })
  })

  it('disables thinking mode in the request body', async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: 'ok' } }],
    })

    const { chat } = await import('../../lib/llm')

    await chat([{ role: 'user', content: 'hello' }])

    expect(createMock.mock.calls[0][0]).toMatchObject({ thinking: { type: 'disabled' } })
  })
})
