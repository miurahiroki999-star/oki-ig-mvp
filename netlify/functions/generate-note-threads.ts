// Netlify Function: OpenAI Responses APIを使って、NOTE記事下書き＋Threads下書き(3パターン分)をまとめて生成する。
// APIキーはこの関数内(サーバー側環境変数)でのみ使用し、フロントには一切露出しない。
// 既存のgenerate-text.ts(カルーセル投稿生成)と同じ構成・同じ環境変数を流用する。
//
// 入力: {
//   theme, sourcePostTitle, sourceAngleLabel, sourceAngleInstruction, memo?,
//   avoidNoteTitles, avoidNoteLeads, avoidThreadsBodies,
//   brand:{displayName,title}, forbiddenWords, model
// }
// 出力: NOTE本文一式＋Threads3パターン分の文面をまとめた厳密なJSON。
// Threadsはどのパターンを使うかをアプリ側でランダム選択するため、3パターンぶんまとめて生成させる。

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
  const avoidNoteTitles: string[] = Array.isArray(payload.avoidNoteTitles) ? payload.avoidNoteTitles : []
  const avoidNoteLeads: string[] = Array.isArray(payload.avoidNoteLeads) ? payload.avoidNoteLeads : []
  const avoidThreadsBodies: string[] = Array.isArray(payload.avoidThreadsBodies) ? payload.avoidThreadsBodies : []

  const displayName = brand.displayName || '吉澤瑛'
  const title = brand.title || '人生の質向上コンサルタント'

  const systemPrompt = [
    'あなたはウェルネス系のNOTE記事とThreads投稿を作るプロの日本語コピーライターです。',
    `アカウント名義は「${displayName}｜${title}」です。`,
    '全体コンセプトは「健康・お金・人間関係・使命を整えることで人生の質を上げる」です。',
    'CBD、ユアパルス、ダイヤモンド覚醒セッション、Life Wellness Association等の商材・団体名は主語にせず、あくまで選択肢として自然に触れる程度にしてください。',
    '売り込み感、医療効果の断定、過度な収入保証、スピリチュアル感の出しすぎ、怪しい自己啓発感は禁止です。',
    forbiddenWords.length > 0 ? `次の表現・言い回しは絶対に使わないでください: ${forbiddenWords.join(' / ')}` : '',
    '',
    '今回のネタ元は、同日にInstagramで投稿した1テーマの深掘りです。Instagram投稿とまったく同じ文章の使い回しはせず、NOTE・Threadsそれぞれの文体に書き直してください。',
    '',
    '【NOTE記事のルール】',
    '- タイトルは断定・逆説型。常識を一度ひっくり返す言い切り文にしてください(体言止め、または「。」で終止)。読点は使ってもよいですが1文を長くしすぎないでください。',
    '- リード文(noteLead)は読者の内なる声を代弁する自問、または「そんなご相談が増えています」型の相談あるあるから入り、2〜4行にしてください。',
    '- noteSections(見出し3〜5個)は「問題提起→見立て(理論的裏付け)→具体例→気づき→行動提案」の流れで並べ、各見出しは`##`相当のテキストのみ(記号は付けない。headingフィールドに見出し文だけを入れる)。',
    `- 見立てのパートでは、${displayName}の専門性(${title})に沿った理論的な裏付けを、断定しすぎない範囲で示してください。`,
    '- 各セクションのbody内では、`- `で始まる箇条書きや`**太字**`を使って要点を整理してよいですが、ネストした箇条書き・表・コードブロック・脚注・見出し記号`#`単体(h1)は使わないでください(NOTEエディタが対応するMarkdown記法のみ)。',
    '- 記事全体(タイトル・リード・各セクション本文・まとめの合計)で1,500〜2,500字を目安にしてください。',
    '- noteSummaryは、まとめの箇条書き2〜3点、または「〇〇より、〇〇。」のような対比フレーズによる再定義にしてください。CTAやハッシュタグはここに含めないでください(アプリ側で別途付与します)。',
    '',
    '【Threads投稿のルール(3パターンぶん作る)】',
    '- Threadsでは教育的な構成(権威付け・箇条書き整理・まとめ+CTA)は使いません。ハッシュタグは一切付けません。',
    '- threadsLinkShareLine: NOTE記事のリンクシェア投稿に添える一言(1文以内、40字前後)。本文をほぼ書かず、記事への軽い一言にしてください。',
    '- threadsAssertiveBody: 断定意見・問題提起型。つかみ1文＋本文2〜4文＋最後に個人の立場を一言で言い切る締め、を自然につなげた1つの文章にしてください(深掘りせず投げっぱなしで反応を誘うトーン、CTAなし、上限500字・目安150〜400字)。',
    '- threadsMantraHeading: マントラ／アファーメーション列挙型の見出し。【〇〇】の形にしてください。',
    '- threadsMantraLines: 「私は〜を許可します」のような宣言文を4〜6行、説明やCTAなしで。各行は改行で区切って一つずつ配列に入れてください。',
    '',
    '【絶対重複禁止】',
    '- 過去に使ったNOTEタイトル・リード冒頭・Threads本文と同じ、または酷似した文章を出さないでください。',
    '',
    '出力は必ず指定されたJSONスキーマの形だけで返してください。前後の説明文やMarkdownのコードブロック記号(```)は付けないでください。'
  ]
    .filter(Boolean)
    .join('\n')

  const userPromptLines = [
    `テーマ: ${payload.theme}`,
    `ネタ元にする本日のInstagram投稿タイトル: ${payload.sourcePostTitle || ''}`,
    payload.sourceAngleLabel ? `ネタ元の切り口: ${payload.sourceAngleLabel} / ${payload.sourceAngleInstruction || ''}` : '',
    payload.memo ? `今回の自由メモ(参考程度・無理に反映しなくてよい): ${payload.memo}` : '',
    `避けるべきNOTEタイトル: ${avoidNoteTitles.join(' / ') || 'なし'}`,
    `避けるべきNOTEリード冒頭: ${avoidNoteLeads.join(' / ') || 'なし'}`,
    `避けるべきThreads本文: ${avoidThreadsBodies.slice(-60).join(' / ') || 'なし'}`,
    '',
    'noteTitle, noteLead, noteSections(3〜5個・各heading/body), noteSummary, threadsLinkShareLine, threadsAssertiveBody, threadsMantraHeading, threadsMantraLines(4〜6行の配列) をJSONで出力してください。'
  ].filter(Boolean)

  const userPrompt = userPromptLines.join('\n')

  const noteSectionSchema = {
    type: 'object',
    properties: {
      heading: { type: 'string' },
      body: { type: 'string' }
    },
    required: ['heading', 'body'],
    additionalProperties: false
  }

  const schema = {
    type: 'object',
    properties: {
      noteTitle: { type: 'string' },
      noteLead: { type: 'string' },
      noteSections: { type: 'array', items: noteSectionSchema, minItems: 3, maxItems: 5 },
      noteSummary: { type: 'string' },
      threadsLinkShareLine: { type: 'string' },
      threadsAssertiveBody: { type: 'string' },
      threadsMantraHeading: { type: 'string' },
      threadsMantraLines: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 6 }
    },
    required: [
      'noteTitle',
      'noteLead',
      'noteSections',
      'noteSummary',
      'threadsLinkShareLine',
      'threadsAssertiveBody',
      'threadsMantraHeading',
      'threadsMantraLines'
    ],
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
            name: 'note_threads_content',
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

    if (
      !parsed ||
      typeof parsed.noteTitle !== 'string' ||
      !Array.isArray(parsed.noteSections) ||
      parsed.noteSections.length < 3
    ) {
      return { statusCode: 502, body: JSON.stringify({ error: 'incomplete JSON from OpenAI' }) }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        noteTitle: String(parsed.noteTitle),
        noteLead: typeof parsed.noteLead === 'string' ? parsed.noteLead : '',
        noteSections: parsed.noteSections.map((s: any) => ({
          heading: typeof s.heading === 'string' ? s.heading : '',
          body: typeof s.body === 'string' ? s.body : ''
        })),
        noteSummary: typeof parsed.noteSummary === 'string' ? parsed.noteSummary : '',
        threadsLinkShareLine: typeof parsed.threadsLinkShareLine === 'string' ? parsed.threadsLinkShareLine : '',
        threadsAssertiveBody: typeof parsed.threadsAssertiveBody === 'string' ? parsed.threadsAssertiveBody : '',
        threadsMantraHeading: typeof parsed.threadsMantraHeading === 'string' ? parsed.threadsMantraHeading : '',
        threadsMantraLines: Array.isArray(parsed.threadsMantraLines) ? parsed.threadsMantraLines.map((l: unknown) => String(l)) : []
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
