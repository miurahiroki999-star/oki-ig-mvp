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

// テーマ別の感情トーン分類(仕様書1.3のマッピング表)に基づく4系統のモチーフ群・色調。
// 系統ごとに20パターンのモチーフを持たせ、同じテーマでも生成のたびに違う画像になるようにする。
const blueSkySeaGroup: MotifGroup = {
  motifs: [
    'a clear blue sky meeting a calm sea at the horizon, gentle waves catching sunlight',
    'a wide-open blue sky with a few scattered white clouds, seen from a cliff overlooking the ocean',
    'sunlight sparkling on the surface of calm turquoise sea water near the shoreline',
    'a deep blue sky with slow-moving cirrus clouds, vast and open, taken looking upward',
    'a coastal scene with blue sky, calm sea, and a solitary distant sailboat',
    'a lighthouse silhouette against a bright blue sky and calm sea',
    'gentle waves lapping on white sand under a clear blue sky',
    'a wide horizon line between deep blue sea and pale blue sky, minimal composition',
    'sunlight glinting off small ripples on a calm bay',
    'a rocky coastline with clear turquoise water and blue sky above',
    'seabirds gliding over calm blue water under a bright sky',
    'a distant island silhouette on a calm blue sea horizon',
    'clear sky reflected in a tide pool on a sandy beach',
    "a sailing boat's white sail against deep blue sky and sea",
    'a morning blue sky with a few soft clouds over open ocean',
    'sunlight breaking on gentle waves near a quiet pier',
    'a wide bay with clear blue water and a soft cloudless sky',
    'a pale blue sky over a calm lake reflecting the horizon',
    'a crisp blue sky above rolling ocean waves, seen from a boat deck',
    'a serene seascape with layered blue tones from sky to water'
  ],
  colorTone: 'clean, saturated blue tones, bright and clear'
}

const sunsetCloudSeaGroup: MotifGroup = {
  motifs: [
    'a warm sunset over the ocean, with a few birds flying in silhouette across the sky',
    'a golden-hour sky reflected on wet sand at low tide, warm orange and pink hues',
    'a sea of clouds glowing orange and pink at sunset, seen from a mountain ridge',
    'the sun setting behind distant hills, warm light spilling across a layer of clouds',
    'a twilight sky over calm water, soft gradient from deep pink to pale orange',
    'warm sunset light filtering through palm leaves silhouette',
    'a pair of birds perched on a wire against a pink sunset sky',
    'golden light glowing through autumn leaves at dusk',
    'a warm-toned sky reflected in a still lake at sunset',
    'clouds lit from below in soft orange during sunset',
    'a distant hot air balloon silhouette against a pink sky',
    'sunset light streaming through a gap in soft clouds',
    'warm dusk light over a quiet harbor with small boats',
    'pink and orange clouds layered over a calm horizon',
    'golden hour light on rolling hills under a warm sky',
    'two silhouetted birds flying together across a sunset sky',
    'soft peach-colored clouds drifting over a calm sea at dusk',
    'warm sunset glow behind a distant mountain range',
    'a gentle gradient sky from coral pink to soft gold at sunset',
    'warm evening light glowing on the underside of scattered clouds'
  ],
  colorTone: 'warm orange-to-pink gradient, emotional and gentle'
}

const softLightCloudsGroup: MotifGroup = {
  motifs: [
    'soft sunbeams breaking through a layer of clouds, gentle lens flare, seen from below',
    'a bright sky with clouds parting to reveal warm light, airy and open composition',
    'morning light filtering through thin clouds over a quiet open field, soft haze',
    'a pastel sky just after sunrise, thin clouds catching the first light',
    'sunlight diffusing through mist above a calm landscape, dreamlike softness',
    'soft rays of light breaking through clouds over open countryside',
    'a gentle glow behind a thin veil of clouds, pale pink sky',
    'morning mist rising over a quiet meadow under soft light',
    'sunlight piercing through a gap in pale clouds, soft flare',
    'a hazy pastel sky with clouds catching the first warm light',
    'soft diffused light through fog over a calm open field',
    'delicate cloud formations glowing softly at first light',
    'a wide sky with soft pink clouds parting to reveal light beams',
    'gentle morning light breaking through low clouds over hills',
    'a dreamy sky with soft light rays and thin drifting clouds',
    'pale golden light filtering through a thin layer of mist',
    'soft clouds catching pastel light just before sunrise',
    'a calm field under a sky with light breaking through clouds',
    'delicate light beams through clouds over a quiet valley',
    'soft glowing clouds with gentle light rays at dawn'
  ],
  colorTone: 'delicate white-to-pink gradient, soft and luminous'
}

const flowerMacroGroup: MotifGroup = {
  motifs: [
    'a macro photograph of hydrangea petals with soft bokeh in the background',
    'a close-up of dew drops on a flower petal in early morning light, shallow depth of field',
    'a macro shot of cherry blossom petals against a soft blurred background',
    'a close-up photograph of lavender stems swaying gently, soft blurred background',
    'a macro image of a single wildflower with soft natural light, blurred green backdrop',
    'a close-up of a purple iris petal with soft focus background',
    'a macro shot of morning glory flowers with delicate blue tones',
    'a close-up of wisteria blossoms hanging softly, pastel tones',
    'a macro photograph of a single rose petal catching soft light',
    'a close-up of forget-me-not flowers with shallow depth of field',
    "a macro shot of dew-covered clover leaves in soft morning light",
    'a close-up of pale pink cherry blossoms against a soft sky',
    'a macro image of a violet petal with delicate light and shadow',
    'a close-up of a blooming peony with soft pastel colors',
    'a macro shot of small blue hydrangea florets in soft focus',
    'a close-up of a single orchid petal with gentle bokeh',
    "a macro image of dewdrops on a spider's web at dawn",
    'a close-up of pale lilac blossoms with a blurred green backdrop',
    'a macro shot of a delicate pink cosmos flower swaying softly',
    'a close-up of soft purple thistle blooms in gentle light'
  ],
  colorTone: 'pastel purple-to-blue-to-pink tones, delicate and soft'
}

const themeMotifGroups: Record<Theme, MotifGroup> = {
  健康: blueSkySeaGroup,
  人間関係: sunsetCloudSeaGroup,
  お金: softLightCloudsGroup,
  使命: softLightCloudsGroup,
  ご縁: flowerMacroGroup,
  瞑想: flowerMacroGroup,
  無料診断: softLightCloudsGroup
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
