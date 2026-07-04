// Netlify Function: 写真素材の自動タグ付け（OpenAI Vision, 任意）
// APIキー未設定時は501を返し、フロント側は手動タグ入力にフォールバックする。

export async function handler(event: any) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return { statusCode: 501, body: JSON.stringify({ error: 'OPENAI_API_KEY not configured' }) }
  }
  try {
    const payload = JSON.parse(event.body || '{}')
    const model = payload.model || process.env.OPENAI_MODEL || 'gpt-5.4-mini'
    const imageDataUrl = payload.imageDataUrl

    const candidateTags = [
      '笑顔', '真剣', '瞑想', '講演風', '対談風', '経営者感', '爽やか',
      '信頼形成向き', '導線向き', 'セッション案内向き', 'Life Wellness Association向き'
    ]

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: `写真を見て、次の候補タグの中から当てはまるものだけをJSON配列で返してください。候補: ${candidateTags.join('、')}。出力はJSON配列のみ。`
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'この写真に合うタグを選んでください。' },
              { type: 'image_url', image_url: { url: imageDataUrl } }
            ]
          }
        ],
        temperature: 0.2
      })
    })

    if (!res.ok) {
      const errText = await res.text()
      return { statusCode: 502, body: JSON.stringify({ error: errText }) }
    }
    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content ?? '[]'
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const tags = JSON.parse(cleaned)
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tags }) }
  } catch (err: any) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) }
  }
}
