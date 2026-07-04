// Netlify Function: OpenAI Responses APIを使って投稿コンテンツ(JSON)を生成する。
// APIキーはこの関数内(サーバー側環境変数)でのみ使用し、フロントには一切露出しない。
//
// 入力: { kind, role, theme, memo?, avoid:{titles,approaches,claims,ctas}, brand:{displayName,title,lineUrl}, forbiddenWords, model }
// 出力: { title, body, approach, claim, cta, hashtags } の厳密なJSON

export async function handler(event: any) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    // キー未設定時はフロント側でローカル生成にフォールバックさせる
    return { statusCode: 501, body: JSON.stringify({ error: 'OPENAI_API_KEY not configured' }) }
  }

  let payload: any
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'invalid JSON body' }) }
  }

  const model = payload.model || process.env.OPENAI_MODEL || 'gpt-5.4-mini'
  const brand = payload.brand || {}
  const avoid = payload.avoid || {}
  const forbiddenWords: string[] = Array.isArray(payload.forbiddenWords) ? payload.forbiddenWords : []

  const displayName = brand.displayName || '吉澤瑛'
  const title = brand.title || '人生の質向上コンサルタント'

  const systemPrompt = [
    'あなたはウェルネス系Instagram運用の日本語コピーライターです。',
    `アカウント名義は「${displayName}｜${title}」です。`,
    '全体コンセプトは「健康・お金・人間関係・使命を整えることで人生の質を上げる」です。',
    'CBD、ユアパルス、ダイヤモンド覚醒セッション、Life Wellness Association等の商材・団体名は主語にせず、あくまで選択肢として自然に触れる程度にしてください。',
    '売り込み感、医療効果の断定、過度な収入保証、スピリチュアル感の出しすぎ、怪しい自己啓発感は禁止です。',
    forbiddenWords.length > 0 ? `次の表現・言い回しは絶対に使わないでください: ${forbiddenWords.join(' / ')}` : '',
    'bodyフィールドには本文の中身(冒頭の一文・共感・気づき・接続の流れ)のみを書き、CTA文やハッシュタグ、公式LINEのURLは含めないでください(これらは別フィールド・別処理で付与します)。',
    '出力は必ず指定されたJSONスキーマの形だけで返してください。前後の説明文やMarkdownのコードブロック記号(```)は付けないでください。'
  ]
    .filter(Boolean)
    .join('\n')

  const userPromptLines = [
    `種別: ${payload.kind}`,
    `テーマ: ${payload.theme}`,
    `役割: ${payload.role}`,
    payload.memo ? `今回の自由メモ(参考程度・無理に反映しなくてよい): ${payload.memo}` : '',
    `避けるべきタイトル: ${(avoid.titles || []).join(' / ') || 'なし'}`,
    `避けるべき切り口: ${(avoid.approaches || []).join(' / ') || 'なし'}`,
    `避けるべき主張: ${(avoid.claims || []).join(' / ') || 'なし'}`,
    `避けるべきCTAの言い回し: ${(avoid.ctas || []).join(' / ') || 'なし'}`,
    '',
    payload.kind === 'フィード'
      ? '画像内タイトル(短く強い一言)、本文(冒頭の強い一文→共感→気づき→健康・お金・人間関係・使命への接続、CTAとハッシュタグは含めない)、切り口ラベル、主張ラベル、CTAの方向性(短い一言でよい)、ハッシュタグ候補8〜15個(#なし)をJSONで出力してください。'
      : 'ストーリーズ添え文として、画像内タイトル(短く強い一言)、1〜2文の短い添え文、切り口ラベル、主張ラベル、CTAの方向性(不要なら空文字)、ハッシュタグは空配列でよい、をJSONで出力してください。'
  ].filter(Boolean)

  const userPrompt = userPromptLines.join('\n')

  const schema = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      body: { type: 'string' },
      approach: { type: 'string' },
      claim: { type: 'string' },
      cta: { type: 'string' },
      hashtags: { type: 'array', items: { type: 'string' } }
    },
    required: ['title', 'body', 'approach', 'claim', 'cta', 'hashtags'],
    additionalProperties: false
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 9000) // Netlify Functionsの実行時間制限内に収めるための保険

  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.9,
        text: {
          format: {
            type: 'json_schema',
            name: 'instagram_post_content',
            schema,
            strict: true
          }
        }
      })
    })

    if (!res.ok) {
      const errText = await res.text()
      return { statusCode: 502, body: JSON.stringify({ error: errText }) }
    }

    const data = await res.json()
    const raw = extractOutputText(data)
    if (!raw) {
      return { statusCode: 502, body: JSON.stringify({ error: 'empty response from OpenAI Responses API' }) }
    }

    const cleaned = raw.replace(/```json|```/g, '').trim()
    let parsed: any
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return { statusCode: 502, body: JSON.stringify({ error: 'failed to parse JSON from OpenAI response' }) }
    }

    if (!parsed || typeof parsed.title !== 'string' || typeof parsed.body !== 'string' || !parsed.title.trim() || !parsed.body.trim()) {
      return { statusCode: 502, body: JSON.stringify({ error: 'incomplete JSON from OpenAI' }) }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: String(parsed.title),
        body: String(parsed.body),
        approach: typeof parsed.approach === 'string' ? parsed.approach : '',
        claim: typeof parsed.claim === 'string' ? parsed.claim : '',
        cta: typeof parsed.cta === 'string' ? parsed.cta : '',
        hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map((h: unknown) => String(h)) : []
      })
    }
  } catch (err: any) {
    const isAbort = err?.name === 'AbortError'
    return { statusCode: isAbort ? 504 : 500, body: JSON.stringify({ error: isAbort ? 'OpenAI request timed out' : String(err) }) }
  } finally {
    clearTimeout(timer)
  }
}

// OpenAI Responses APIのレスポンスからテキストを取り出す。
// SDKの `response.output_text` 相当の抽出を、fetchベースの生レスポンスに対して再現する。
function extractOutputText(data: any): string | null {
  if (typeof data?.output_text === 'string' && data.output_text.length > 0) {
    return data.output_text
  }
  if (Array.isArray(data?.output)) {
    for (const item of data.output) {
      if (item?.type === 'message' && Array.isArray(item.content)) {
        for (const c of item.content) {
          if ((c?.type === 'output_text' || c?.type === 'text') && typeof c.text === 'string' && c.text.length > 0) {
            return c.text
          }
        }
      }
    }
  }
  return null
}
