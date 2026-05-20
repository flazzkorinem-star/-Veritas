// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readApiJson } from '../../lib/apiResponse'

describe('readApiJson', () => {
  it('parses valid JSON responses', async () => {
    const data = await readApiJson<{ ok: boolean }>(
      new Response(JSON.stringify({ ok: true }))
    )

    expect(data.ok).toBe(true)
  })

  it('turns empty responses into user-facing errors', async () => {
    await expect(readApiJson(new Response(''))).rejects.toThrow('空响应')
  })

  it('turns HTML responses into user-facing errors', async () => {
    await expect(readApiJson(new Response('<!DOCTYPE html>'))).rejects.toThrow('非 JSON 响应')
  })
})
