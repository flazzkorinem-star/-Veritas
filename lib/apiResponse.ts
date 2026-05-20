export async function readApiJson<T>(response: Response): Promise<T> {
  const text = await response.text()

  if (!text.trim()) {
    throw new Error('服务器返回了空响应，请稍后重试')
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error('服务器返回了非 JSON 响应，请稍后重试或联系开发者')
  }
}
