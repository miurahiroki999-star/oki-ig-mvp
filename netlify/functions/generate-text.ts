// Netlify Function: OpenAI Responses APIを使って、カルーセル1投稿分のコンテンツ(JSON)を生成する。
// APIキーはこの関数内(サーバー側環境変数)でのみ使用し、フロントには一切露出しない。
//
// 入力: { theme, memo?, avoidHeadlines, avoidLeads, brand:{displayName,title,lineUrl}, forbiddenWords, model }
// 出力: { postTitle, topSub, topHeadline, slides6:[{label,mainText,highlights,bullets}×6], captionLead, hashtags } の厳密なJSON
//
// 【4. カルーセル構成】に合わせ、TOP(1枚目)とCTA(8枚目)はアプリ側(contentPlan.ts)で組み立てるため、
// ここでは topSub/topHeadline と、問題提起〜行動提案の中ページ6枚分、投稿欄本文の冒頭のみを生成させる。

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
  const forbiddenWords: string[] = Array.isArray(payload.forbiddenWords) ? payload.forbiddenWords : []
  const avoidHeadlines: string[] = Array.isArray(payload.avoidHeadlines) ? payload.avoidHeadlines : []
  const avoidLeads: string[] = Array.isArray(payload.avoidLeads) ? payload.avoidLeads : []

  const displayName = brand.displayName || '吉澤瑛'
  const title = brand.title || '人生の質向上コンサルタント'

  const systemPrompt = [
    'あなたはウェルネス系Instagram運用のプロの日本語コピーライターです。1枚画像＋長文キャプション型ではなく、山添さん型のカルーセル投稿(スワイプ式の複数画像)を作るのが得意です。',
    `アカウント名義は「${displayName}｜${title}」です。`,
    '全体コンセプトは「健康・お金・人間関係・使命を整えることで人生の質を上げる」です。',
    'CBD、ユアパルス、ダイヤモンド覚醒セッション、Life Wellness Association等の商材・団体名は主語にせず、あくまで選択肢として自然に触れる程度にしてください。',
    '売り込み感、医療効果の断定、過度な収入保証、スピリチュアル感の出しすぎ、怪しい自己啓発感は禁止です。',
    forbiddenWords.length > 0 ? `次の表現・言い回しは絶対に使わないでください: ${forbiddenWords.join(' / ')}` : '',
    '',
    '【カルーセル構成】1投稿は次の8枚構成です。あなたが作るのはこのうち2〜7枚目の中身と、TOPの見出しです(CTAはアプリ側で固定文言を使うため作らなくてよい)。',
    '1枚目 TOP(見出しのみ) / 2枚目 問題提起 / 3枚目 相談(よくある相談) / 4枚目 見立て(原因) / 5枚目 具体例 / 6枚目 気づき・転換 / 7枚目 行動提案 / 8枚目 CTA(あなたは作らない)',
    '',
    '【topHeadlineのルール】',
    '- TOPページに大きく表示される「静かに刺す一言」です。短く強く、1行10〜14文字程度を目安に、意味のまとまりを壊さない位置で\\nを入れて2〜3行にしてください。',
    '- 助詞の直後だけで不自然に切ったり、単語の途中で切ったりしないでください。読点・句点は基本使わないでください。',
    '',
    '【slides6(2〜7枚目)の各mainTextのルール】',
    '- 1スライド1メッセージ。1スライドに詰め込みすぎないでください。短く、スワイプで読める分量(目安25〜75文字、改行込みで2〜5行)にしてください。',
    '- 3枚目(相談)には「よくある相談」として2〜4個のbulletsを必ず入れてください。5枚目(具体例)・7枚目(行動提案)にはbulletsを入れてもよいです。',
    '- 重要な語(『状態』『整えどころ』など)があればhighlightsにその部分文字列をそのまま入れてください(0〜2個程度)。',
    '- カルーセル内の文章と投稿欄本文を混同しないでください。ここで作るmainTextはカルーセル画像内の短い文章です。',
    '',
    '【captionLeadのルール】',
    '- 投稿欄本文の冒頭部分のみです(2〜4文程度、100〜200文字目安)。よくある相談・service・Present・profile・公式LINEリンク・ハッシュタグは含めないでください(これらはアプリ側で別途付与します)。',
    '',
    '出力は必ず指定されたJSONスキーマの形だけで返してください。前後の説明文やMarkdownのコードブロック記号(```)は付けないでください。'
  ]
    .filter(Boolean)
    .join('\n')

  const userPromptLines = [
    `テーマ: ${payload.theme}`,
    payload.memo ? `今回の自由メモ(参考程度・無理に反映しなくてよい): ${payload.memo}` : '',
    `避けるべきTOP見出し: ${avoidHeadlines.join(' / ') || 'なし'}`,
    `避けるべき投稿欄本文の冒頭: ${avoidLeads.join(' / ') || 'なし'}`,
    '',
    'postTitle(管理用の短いタイトル)、topSub(小見出し。基本は「心と現実が整い始めるヒント」のままでよい)、topHeadline、slides6(問題提起→相談→見立て→具体例→気づき→行動提案の順で6個。各要素はlabel・mainText・highlights・bullets)、captionLead、hashtags(8〜12個・#なし)をJSONで出力してください。'
  ].filter(Boolean)

  const userPrompt = userPromptLines.join('\n')

  const slideSchema = {
    type: 'object',
    properties: {
      label: { type: 'string' },
      mainText: { type: 'string' },
      highlights: { type: 'array', items: { type: 'string' } },
      bullets: { type: 'array', items: { type: 'string' } }
    },
    required: ['label', 'mainText', 'highlights', 'bullets'],
    additionalProperties: false
  }

  const schema = {
    type: 'object',
    properties: {
      postTitle: { type: 'string' },
      topSub: { type: 'string' },
      topHeadline: { type: 'string' },
      slides6: { type: 'array', items: slideSchema, minItems: 6, maxItems: 6 },
      captionLead: { type: 'string' },
      hashtags: { type: 'array', items: { type: 'string' } }
    },
    required: ['postTitle', 'topSub', 'topHeadline', 'slides6', 'captionLead', 'hashtags'],
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
            name: 'carousel_post_content',
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

    if (!parsed || typeof parsed.topHeadline !== 'string' || !Array.isArray(parsed.slides6) || parsed.slides6.length !== 6) {
      return { statusCode: 502, body: JSON.stringify({ error: 'incomplete JSON from OpenAI' }) }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postTitle: typeof parsed.postTitle === 'string' ? parsed.postTitle : '',
        topSub: typeof parsed.topSub === 'string' ? parsed.topSub : '',
        topHeadline: String(parsed.topHeadline),
        slides6: parsed.slides6.map((s: any) => ({
          label: typeof s.label === 'string' ? s.label : 'POINT',
          mainText: typeof s.mainText === 'string' ? s.mainText : '',
          highlights: Array.isArray(s.highlights) ? s.highlights.map((h: unknown) => String(h)) : [],
          bullets: Array.isArray(s.bullets) ? s.bullets.map((b: unknown) => String(b)) : []
        })),
        captionLead: typeof parsed.captionLead === 'string' ? parsed.captionLead : '',
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
