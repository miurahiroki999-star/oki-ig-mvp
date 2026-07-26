// NOTE見出し画像の生成。プロンプトを記事テーマ・トーンに合わせて自動構築し、
// Netlify Functions経由でOpenAI画像生成API(gpt-image-1)を呼び出す。
// NOTEには画像アップロードAPIが無いため、生成画像はダウンロード可能な形でアプリ内に表示するだけに留める。

import { Theme } from '../types'

const themeMotif: Record<Theme, string> = {
  健康: 'soft morning light, gentle botanical leaves, a feeling of quiet vitality',
  人間関係: 'two delicate watercolor branches leaning toward each other, a sense of warm connection',
  お金: 'flowing golden light particles over pale green, a sense of calm abundance',
  ご縁: 'threads of light softly intertwining like watercolor ribbons, a sense of natural connection',
  使命: 'a single upward beam of soft light through leaves, a sense of quiet purpose',
  瞑想: 'still water ripples and soft mist, a sense of calm stillness',
  無料診断: 'a gentle compass-like circular motif in watercolor, a sense of clarity'
}

export function buildNoteImagePrompt(theme: Theme, noteTitle: string, displayName: string, title: string): string {
  const motif = themeMotif[theme] || themeMotif.健康
  return [
    'A refined, minimal editorial header illustration for a Japanese wellness note article.',
    'Style: elegant watercolor and botanical illustration, white/cream base background, bright light green and soft gold accents, generous negative space, sophisticated and calm mood.',
    `Theme: ${theme} (${title} / life-quality coaching context). ${motif}.`,
    'No text, no letters, no logos, no human faces or photographs of real people. Purely abstract/botanical illustration suitable as a magazine article header image.',
    '16:9 landscape composition, soft lighting, high-end wellness brand aesthetic.'
  ].join(' ')
}

export async function generateNoteHeadlineImage(prompt: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch('/.netlify/functions/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, size: '1536x1024' }),
      signal: controller.signal
    })
    if (!res.ok) return null
    const data = await res.json().catch(() => null)
    if (!data || typeof data.imageDataUrl !== 'string') return null
    return data.imageDataUrl
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
