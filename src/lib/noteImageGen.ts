// NOTE見出し画像の生成。プロンプトを記事テーマ・トーンに合わせて自動構築し、
// Netlify Functions経由でOpenAI画像生成API(gpt-image-1)を呼び出す。
// NOTEには画像アップロードAPIが無いため、生成画像はダウンロード可能な形でアプリ内に表示するだけに留める。
//
// v2仕様: 山添ともこ氏NOTEの見出し画像を再リサーチした結果、実写フリー素材風の自然物写真
// (空・海・雲・花・森など)がテイストとして共通していたため、イラスト調プロンプトを廃止し、
// 「テーマ→モチーフ→色調→質感」の順で実写調プロンプトを組み立てる方式に変更した。

import { Theme } from '../types'

interface MotifGroup {
  motifs: string[]
  colorTone: string
}

// テーマ別の感情トーン分類(仕様書1.3のマッピング表)に基づくモチーフ群・色調。
// 同じテーマでも生成のたびに違う画像になるよう、モチーフは複数バリエーションから毎回ランダムに選ぶ。
const themeMotifGroups: Record<Theme, MotifGroup> = {
  健康: {
    motifs: [
      'a clear blue sky meeting a calm sea at the horizon, gentle waves catching sunlight',
      'a wide-open blue sky with a few scattered white clouds, seen from a cliff overlooking the ocean',
      'sunlight sparkling on the surface of calm turquoise sea water near the shoreline',
      'a deep blue sky with slow-moving cirrus clouds, vast and open, taken looking upward',
      'a coastal scene with blue sky, calm sea, and a solitary distant sailboat'
    ],
    colorTone: 'clean, saturated blue tones, bright and clear'
  },
  人間関係: {
    motifs: [
      'a warm sunset over the ocean, with a few birds flying in silhouette across the sky',
      'a golden-hour sky reflected on wet sand at low tide, warm orange and pink hues',
      'a sea of clouds glowing orange and pink at sunset, seen from a mountain ridge',
      'the sun setting behind distant hills, warm light spilling across a layer of clouds',
      'a twilight sky over calm water, soft gradient from deep pink to pale orange'
    ],
    colorTone: 'warm orange-to-pink gradient, emotional and gentle'
  },
  お金: {
    motifs: [
      'soft sunbeams breaking through a layer of clouds, gentle lens flare, seen from below',
      'a bright sky with clouds parting to reveal warm light, airy and open composition',
      'morning light filtering through thin clouds over a quiet open field, soft haze',
      'a pastel sky just after sunrise, thin clouds catching the first light',
      'sunlight diffusing through mist above a calm landscape, dreamlike softness'
    ],
    colorTone: 'delicate white-to-pink gradient, soft and luminous'
  },
  使命: {
    motifs: [
      'soft sunbeams breaking through a layer of clouds, gentle lens flare, seen from below',
      'a bright sky with clouds parting to reveal warm light, airy and open composition',
      'morning light filtering through thin clouds over a quiet open field, soft haze',
      'a pastel sky just after sunrise, thin clouds catching the first light',
      'sunlight diffusing through mist above a calm landscape, dreamlike softness'
    ],
    colorTone: 'delicate white-to-pink gradient, soft and luminous'
  },
  ご縁: {
    motifs: [
      'a macro photograph of hydrangea petals with soft bokeh in the background',
      'a close-up of dew drops on a flower petal in early morning light, shallow depth of field',
      'a macro shot of cherry blossom petals against a soft blurred background',
      'a close-up photograph of lavender stems swaying gently, soft blurred background',
      'a macro image of a single wildflower with soft natural light, blurred green backdrop'
    ],
    colorTone: 'pastel purple-to-blue-to-pink tones, delicate and soft'
  },
  瞑想: {
    motifs: [
      'a macro photograph of hydrangea petals with soft bokeh in the background',
      'a close-up of dew drops on a flower petal in early morning light, shallow depth of field',
      'a macro shot of cherry blossom petals against a soft blurred background',
      'a close-up photograph of lavender stems swaying gently, soft blurred background',
      'a macro image of a single wildflower with soft natural light, blurred green backdrop'
    ],
    colorTone: 'pastel purple-to-blue-to-pink tones, delicate and soft'
  },
  無料診断: {
    motifs: [
      'soft sunbeams breaking through a layer of clouds, gentle lens flare, seen from below',
      'a bright sky with clouds parting to reveal warm light, airy and open composition',
      'morning light filtering through thin clouds over a quiet open field, soft haze',
      'a pastel sky just after sunrise, thin clouds catching the first light',
      'sunlight diffusing through mist above a calm landscape, dreamlike softness'
    ],
    colorTone: 'delicate white-to-pink gradient, soft and luminous'
  }
}

// 光の当たり方・構図もランダムに組み合わせ、モチーフが同じでも見え方が変わるようにする
const lightingVariations = [
  'early morning light',
  'late afternoon light',
  'soft overcast diffused light',
  'golden hour light',
  'gentle midday haze'
]

const compositionVariations = [
  'wide open composition with generous negative space on one side',
  'centered symmetrical composition',
  'off-center rule-of-thirds composition',
  'close crop with shallow depth of field',
  'a slightly elevated vantage point looking down'
]

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function buildNoteImagePrompt(theme: Theme, noteTitle: string, displayName: string, title: string): string {
  const group = themeMotifGroups[theme] || themeMotifGroups.健康
  const motif = pickRandom(group.motifs)
  const lighting = pickRandom(lightingVariations)
  const composition = pickRandom(compositionVariations)
  return [
    'A real photograph used as a header image for a Japanese wellness NOTE article, in the style of free stock nature photography (the kind found in note.com photo galleries).',
    'Style: photorealistic, real photography, natural documentary photo. This must look like an actual photograph, not an illustration.',
    `Motif: ${motif}.`,
    `Lighting: ${lighting}.`,
    `Composition: ${composition}.`,
    `Color and tone: ${group.colorTone}.`,
    'Texture: soft focus, gentle film-like desaturated grade, calm and understated mood, not overly vivid or artificial.',
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
