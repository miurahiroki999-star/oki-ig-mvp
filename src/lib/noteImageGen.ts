// NOTE見出し画像の生成。プロンプトを記事テーマ・トーンに合わせて自動構築し、
// Netlify Functions経由でOpenAI画像生成API(gpt-image-1)を呼び出す。
// NOTEには画像アップロードAPIが無いため、生成画像はダウンロード可能な形でアプリ内に表示するだけに留める。
//
// v2仕様: 山添ともこ氏NOTEの見出し画像を再リサーチした結果、実写フリー素材風の自然物写真
// (空・海・雲・花・森など)がテイストとして共通していたため、イラスト調プロンプトを廃止し、
// 「テーマ→モチーフ→色調→質感」の順で実写調プロンプトを組み立てる方式に変更した。

import { Theme } from '../types'

interface MotifSpec {
  motif: string
  colorTone: string
}

// テーマ別の感情トーン分類(仕様書1.3のマッピング表)に基づくモチーフ・色調
const themeMotif: Record<Theme, MotifSpec> = {
  健康: {
    motif: 'a clear blue sky meeting the sea at a calm horizon, wide open composition with scattered clouds',
    colorTone: 'clean, saturated blue tones, bright and clear'
  },
  人間関係: {
    motif: 'a sunset over the sea with birds in silhouette, or a soft cloud sea glowing with warm light',
    colorTone: 'warm orange-to-pink gradient, emotional and gentle'
  },
  お金: {
    motif: 'soft sunlight breaking through a layer of clouds, gentle lens flare, airy open sky',
    colorTone: 'delicate white-to-pink gradient, soft and luminous'
  },
  使命: {
    motif: 'soft sunlight breaking through a layer of clouds, gentle lens flare, airy open sky',
    colorTone: 'delicate white-to-pink gradient, soft and luminous'
  },
  ご縁: {
    motif: 'a macro close-up photograph of flower petals, such as hydrangea, with soft shallow depth of field',
    colorTone: 'pastel purple-to-blue-to-pink tones, delicate and soft'
  },
  瞑想: {
    motif: 'a macro close-up photograph of flower petals, such as hydrangea, with soft shallow depth of field',
    colorTone: 'pastel purple-to-blue-to-pink tones, delicate and soft'
  },
  無料診断: {
    motif: 'soft sunlight breaking through a layer of clouds, gentle lens flare, airy open sky',
    colorTone: 'delicate white-to-pink gradient, soft and luminous'
  }
}

export function buildNoteImagePrompt(theme: Theme, noteTitle: string, displayName: string, title: string): string {
  const { motif, colorTone } = themeMotif[theme] || themeMotif.健康
  return [
    'A real photograph used as a header image for a Japanese wellness NOTE article, in the style of free stock nature photography (the kind found in note.com photo galleries).',
    'Style: photorealistic, real photography, natural documentary photo. This must look like an actual photograph, not an illustration.',
    `Motif: ${motif}.`,
    `Color and tone: ${colorTone}.`,
    'Texture: soft natural light, soft focus, gentle film-like desaturated grade, generous negative space, calm and understated composition, not overly vivid or artificial.',
    'Strictly no text, no letters, no logos, no watermarks, no illustration, no anime, no cartoon, no vector art, no icon-style graphics, no 3D render. Do not depict any human face or portrait.',
    '16:9 landscape composition suitable as a magazine/blog article header photo.'
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
