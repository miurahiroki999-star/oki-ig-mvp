// 背景テンプレート＋テキスト合成でPNGを生成する（毎回AI画像生成はしない）

import { BackgroundTemplate, PhotoAsset, PostKind } from '../types'

const FEED_SIZE = { w: 1080, h: 1080 }
const STORY_SIZE = { w: 1080, h: 1920 }

const FONT_CANDIDATES = ['"Kaisei Decol"', '"Klee One"', '"Zen Kurenaido"', '"Kaisei Opti"']

// Canvasに描画する前に、実際に使うフォントを明示的にロードしておく必要がある。
// document.fonts.readyだけだと、まだ一度も使われていないフォントの読み込みが
// 開始されていないケースがあり、その場合PNGだけ代替フォントで書き出されてしまう。
const FONT_LOAD_SPECS = [
  '600 80px "Kaisei Decol"',
  '600 80px "Klee One"',
  '600 80px "Zen Kurenaido"',
  '600 80px "Kaisei Opti"',
  '400 26px "Noto Sans JP"'
]

let fontsLoadedPromise: Promise<void> | null = null

function ensureFontsLoaded(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) {
    return Promise.resolve()
  }
  if (!fontsLoadedPromise) {
    fontsLoadedPromise = (async () => {
      try {
        await Promise.all(FONT_LOAD_SPECS.map((spec) => document.fonts.load(spec)))
        await document.fonts.ready
      } catch {
        // フォント読み込みに失敗しても描画自体は止めない(代替フォントで表示される)
      }
    })()
  }
  return fontsLoadedPromise
}

function pickFont(seed: number) {
  return FONT_CANDIDATES[seed % FONT_CANDIDATES.length]
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, tpl: BackgroundTemplate) {
  const grad = ctx.createLinearGradient(0, 0, w, h)
  grad.addColorStop(0, tpl.colorFrom)
  grad.addColorStop(1, tpl.colorTo)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  ctx.save()
  ctx.globalAlpha = 0.35
  ctx.fillStyle = tpl.accent

  switch (tpl.style) {
    case 'blob': {
      ctx.beginPath()
      ctx.ellipse(w * 0.15, h * 0.12, w * 0.28, w * 0.2, 0.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(w * 0.85, h * 0.9, w * 0.3, w * 0.22, -0.3, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    case 'wave': {
      ctx.beginPath()
      ctx.moveTo(0, h * 0.75)
      ctx.quadraticCurveTo(w * 0.5, h * 0.65, w, h * 0.8)
      ctx.lineTo(w, h)
      ctx.lineTo(0, h)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'frame': {
      ctx.globalAlpha = 0.5
      ctx.lineWidth = 14
      ctx.strokeStyle = tpl.accent
      ctx.strokeRect(50, 50, w - 100, h - 100)
      break
    }
    case 'dot': {
      for (let y = 60; y < h; y += 90) {
        for (let x = 60; x < w; x += 90) {
          if ((x + y) % 3 === 0) {
            ctx.beginPath()
            ctx.arc(x, y, 5, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }
      break
    }
    default:
      // gradient のみ（追加装飾なし、余白を活かす）
      break
  }
  ctx.restore()
}

// 本人写真を背景として敷き、上に文字が読める程度の淡いグラデーションを重ねる。
// 信頼形成・導線系投稿限定のオプション(優先度B拡張)。通常投稿はこの関数を使わない。
function drawPhotoBackground(ctx: CanvasRenderingContext2D, w: number, h: number, img: HTMLImageElement, tpl: BackgroundTemplate) {
  const imgRatio = img.width / img.height
  const targetRatio = w / h
  let drawW = w
  let drawH = h
  let offsetX = 0
  let offsetY = 0
  if (imgRatio > targetRatio) {
    drawH = h
    drawW = h * imgRatio
    offsetX = (w - drawW) / 2
  } else {
    drawW = w
    drawH = w / imgRatio
    offsetY = (h - drawH) / 2
  }
  ctx.drawImage(img, offsetX, offsetY, drawW, drawH)

  // 文字を読みやすくするための下部グラデーション(ブランドカラーを淡く重ねる)
  const grad = ctx.createLinearGradient(0, h * 0.35, 0, h)
  grad.addColorStop(0, 'rgba(255,255,255,0)')
  grad.addColorStop(1, `${tpl.colorTo}e6`)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  const paragraphs = text.split('\n')
  paragraphs.forEach((para) => {
    let current = ''
    for (const ch of para) {
      const test = current + ch
      if (ctx.measureText(test).width > maxWidth && current.length > 0) {
        lines.push(current)
        current = ch
      } else {
        current = test
      }
    }
    lines.push(current)
  })
  return lines
}

export async function renderPostImage(
  kind: PostKind,
  title: string,
  tpl: BackgroundTemplate,
  fontSeed: number,
  photo?: PhotoAsset | null
): Promise<string> {
  // Google Fontsの読み込み完了を待ってからCanvasに描画する。
  // これを待たないと、初回描画時だけ代替フォントでPNGが書き出されることがある。
  await ensureFontsLoaded()

  const size = kind === 'フィード' ? FEED_SIZE : STORY_SIZE
  const canvas = document.createElement('canvas')
  canvas.width = size.w
  canvas.height = size.h
  const ctx = canvas.getContext('2d')!

  let usingPhoto = false
  if (photo) {
    try {
      const img = await loadImage(photo.dataUrl)
      drawPhotoBackground(ctx, size.w, size.h, img, tpl)
      usingPhoto = true
    } catch {
      // 写真の読み込みに失敗した場合は通常の背景テンプレートにフォールバックする
      usingPhoto = false
    }
  }
  if (!usingPhoto) {
    drawBackground(ctx, size.w, size.h, tpl)
  }

  const font = pickFont(fontSeed)
  const maxWidth = size.w * 0.78
  let fontSize = kind === 'フィード' ? 78 : 84
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#2f3b32'
  ctx.textAlign = 'center'

  let lines: string[] = []
  do {
    ctx.font = `600 ${fontSize}px ${font}`
    lines = wrapText(ctx, title, maxWidth)
    fontSize -= 4
  } while (lines.length * (fontSize + 20) > size.h * 0.5 && fontSize > 32)

  ctx.font = `600 ${fontSize + 4}px ${font}`
  const lineHeight = fontSize + 26
  const totalHeight = lines.length * lineHeight
  // 写真背景時はタイトルを下寄りに配置し、人物の顔まわりを隠しすぎないようにする
  let y = usingPhoto ? size.h * 0.72 - totalHeight / 2 + lineHeight / 2 : size.h / 2 - totalHeight / 2 + lineHeight / 2

  // 上品な下地（読みやすさ確保のためのうっすら白）。写真背景時は下部グラデーションで代替済みのため省略する。
  if (!usingPhoto) {
    ctx.save()
    ctx.globalAlpha = 0.55
    ctx.fillStyle = '#ffffff'
    const pad = 40
    ctx.fillRect(size.w * 0.08, y - lineHeight / 2 - pad / 2, size.w * 0.84, totalHeight + pad)
    ctx.restore()
  }

  ctx.fillStyle = '#2f3b32'
  lines.forEach((line) => {
    ctx.fillText(line, size.w / 2, y)
    y += lineHeight
  })

  // 小さなブランドフッター
  ctx.font = `400 26px "Noto Sans JP"`
  ctx.globalAlpha = 0.7
  ctx.fillText('人生の質向上コンサルタント', size.w / 2, size.h - 70)
  ctx.globalAlpha = 1

  return canvas.toDataURL('image/png')
}
