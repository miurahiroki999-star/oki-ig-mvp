// Netlify Function: OpenAI画像生成API(gpt-image-1)を呼び出し、NOTE見出し画像用のPNGを生成する。
// APIキーはこの関数内(サーバー側環境変数)でのみ使用し、フロントには一切露出しない。
//
// 入力: { prompt: string, size?: '1536x1024' | '1024x1536' | '1024x1024' }
// 出力: { imageDataUrl: string } (data:image/png;base64,... 形式)
//
// 注意: 画像生成はテキスト生成より時間がかかるため、Netlify Functionsの実行時間上限
// (プランにより10〜26秒程度)を超えてタイムアウトする場合がある。その場合はフロント側で
// エラー表示のみ行い、カルーセル投稿と同様にアプリ全体は止めない。

export async function handler(event: any) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return { statusCode: 501, body: JSON.stringify({ error: 'OPENAI_API_KEY not configured' }) }
  }

  let payload: any
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'invalid JSON body' }) }
  }

  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : ''
  if (!prompt) {
    return { statusCode: 400, body: JSON.stringify({ error: 'prompt is required' }) }
  }

  const allowedSizes = ['1536x1024', '1024x1536', '1024x1024']
  const size = allowedSizes.includes(payload.size) ? payload.size : '1536x1024'
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25000)

  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        prompt,
        size,
        quality: 'medium',
        n: 1
      })
    })

    if (!res.ok) {
      const errText = await res.text()
      return { statusCode: 502, body: JSON.stringify({ error: errText }) }
    }

    const data = await res.json()
    const b64 = data?.data?.[0]?.b64_json
    if (!b64 || typeof b64 !== 'string') {
      return { statusCode: 502, body: JSON.stringify({ error: 'empty image response from OpenAI' }) }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl: `data:image/png;base64,${b64}` })
    }
  } catch (err: any) {
    const isAbort = err?.name === 'AbortError'
    return { statusCode: isAbort ? 504 : 500, body: JSON.stringify({ error: isAbort ? 'OpenAI image request timed out' : String(err) }) }
  } finally {
    clearTimeout(timer)
  }
}
