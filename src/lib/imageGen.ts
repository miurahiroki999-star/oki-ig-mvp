// 背景テンプレート＋テキスト合成でPNGを生成する（毎回AI画像生成はしない）
//
// デザイン正本(2026-07修正版):
//   - 白〜ごく淡いライトグリーンの余白多めレイアウト
//   - メインタイトルのフォントは1種類に統一(切り貼り感・脅迫状感の排除)
//   - 改行は「意味のまとまり」を壊さないことを最優先にする

import { BackgroundTemplate, PhotoAsset, PostKind } from '../types'

const FEED_SIZE = { w: 1080, h: 1080 }
const STORY_SIZE = { w: 1080, h: 1920 }

// メインタイトルは1フォントに統一する。切り貼り感・フォント混在(脅迫状感)を避けるため、
// 複数フォントのローテーションは廃止し、実出力で最も上品だったKlee One SemiBoldのみを使う。
const MAIN_FONT = '"Klee One"'
const MAIN_FONT_WEIGHT = 600
// 肩書き・フッターなど小さな補足のみに使う読みやすいゴシック
const SUB_FONT = '"Noto Sans JP"'

const FONT_LOAD_SPECS = [
  `${MAIN_FONT_WEIGHT} 80px ${MAIN_FONT}`,
  '400 26px "Noto Sans JP"',
  '500 24px "Noto Sans JP"'
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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// ---------- 背景描画 ----------
// 白場を活かした3種の上品なテンプレート。装飾は淡く小さく、面で敷きすぎない。

function fillBase(ctx: CanvasRenderingContext2D, w: number, h: number, tpl: BackgroundTemplate) {
  const grad = ctx.createLinearGradient(0, 0, w * 0.3, h)
  grad.addColorStop(0, tpl.colorFrom)
  grad.addColorStop(1, tpl.colorTo)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
}

// leafスタイル用: 一筆書きの細い枝＋葉を隅にそっと添える(塗りつぶしブロブは使わない)
function drawLeafMotif(ctx: CanvasRenderingContext2D, w: number, h: number, accent: string, corner: 'topLeft' | 'bottomRight') {
  ctx.save()
  ctx.strokeStyle = accent
  ctx.globalAlpha = 0.4
  ctx.lineWidth = Math.max(3, w * 0.003)
  ctx.lineCap = 'round'

  const flip = corner === 'bottomRight'
  ctx.translate(flip ? w : 0, flip ? h : 0)
  ctx.scale(flip ? -1 : 1, flip ? -1 : 1)

  // 枝の一筆書き
  ctx.beginPath()
  ctx.moveTo(w * 0.04, h * 0.02)
  ctx.quadraticCurveTo(w * 0.12, h * 0.08, w * 0.2, h * 0.18)
  ctx.stroke()

  // 葉を数枚、細い楕円で添える
  const leaves = [
    { x: w * 0.08, y: h * 0.05, r: w * 0.022, rot: 0.5 },
    { x: w * 0.13, y: h * 0.1, r: w * 0.026, rot: 0.9 },
    { x: w * 0.18, y: h * 0.16, r: w * 0.02, rot: 1.2 }
  ]
  ctx.globalAlpha = 0.3
  leaves.forEach((leaf) => {
    ctx.save()
    ctx.translate(leaf.x, leaf.y)
    ctx.rotate(leaf.rot)
    ctx.beginPath()
    ctx.ellipse(0, 0, leaf.r, leaf.r * 0.45, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  })
  ctx.restore()
}

// lineスタイル用: 余白をたっぷり取った細い二重罫線フレーム
function drawLineFrame(ctx: CanvasRenderingContext2D, w: number, h: number, accent: string) {
  ctx.save()
  ctx.strokeStyle = accent
  ctx.globalAlpha = 0.45
  ctx.lineWidth = 2
  const outer = Math.min(w, h) * 0.07
  ctx.strokeRect(outer, outer, w - outer * 2, h - outer * 2)
  ctx.globalAlpha = 0.25
  const inner = outer + 14
  ctx.strokeRect(inner, inner, w - inner * 2, h - inner * 2)
  ctx.restore()
}

// whitespaceスタイル用: 装飾はほぼ置かず、下部に一本だけ細いラインを添える
function drawWhitespaceAccent(ctx: CanvasRenderingContext2D, w: number, h: number, accent: string) {
  ctx.save()
  ctx.strokeStyle = accent
  ctx.globalAlpha = 0.5
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(w / 2 - w * 0.06, h * 0.82)
  ctx.lineTo(w / 2 + w * 0.06, h * 0.82)
  ctx.stroke()
  ctx.restore()
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, tpl: BackgroundTemplate) {
  fillBase(ctx, w, h, tpl)
  switch (tpl.style) {
    case 'leaf':
      drawLeafMotif(ctx, w, h, tpl.accent, 'topLeft')
      drawLeafMotif(ctx, w, h, tpl.accent, 'bottomRight')
      break
    case 'line':
      drawLineFrame(ctx, w, h, tpl.accent)
      break
    case 'whitespace':
    default:
      drawWhitespaceAccent(ctx, w, h, tpl.accent)
      break
  }
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

// ---------- 日本語の意味のまとまりを壊さない改行 ----------
// タイトルは生成段階(AI/ローカルバンク)で既に「10〜14文字/行・意味の切れ目で\n」を
// 入れた状態で渡ってくる想定。ここでの自動分割はあくまで、想定より長いタイトルが
// 来てしまった場合の安全網であり、できる限り不自然な位置では折り返さない。
const NO_BREAK_AFTER_CHARS = new Set(['「', '『', '（', '(', '【', '［', '"'])
const NO_BREAK_BEFORE_CHARS = new Set(['、', '。', '！', '？', '」', '』', '）', ')', '】', '］', '"', 'ー', 'っ', 'ゃ', 'ゅ', 'ょ', 'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ'])

function isBadBreakPoint(before: string, after: string): boolean {
  if (NO_BREAK_AFTER_CHARS.has(before)) return true
  if (NO_BREAK_BEFORE_CHARS.has(after)) return true
  return false
}

// 1つの改行済み行(パラグラフ)がmaxWidthに収まらない場合のみ、
// 幅に収まる最大位置を二分探索で求め、そこから不自然な位置を避けて微調整する。
function wrapParagraph(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (text.length === 0) return ['']
  if (ctx.measureText(text).width <= maxWidth) return [text]

  const lines: string[] = []
  let remaining = text
  while (remaining.length > 0) {
    if (ctx.measureText(remaining).width <= maxWidth) {
      lines.push(remaining)
      break
    }
    let lo = 1
    let hi = remaining.length
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      if (ctx.measureText(remaining.slice(0, mid)).width <= maxWidth) {
        lo = mid
      } else {
        hi = mid - 1
      }
    }
    let breakAt = Math.max(1, lo)
    // 不自然な位置(かぎ括弧の直後、句読点や小さい仮名で行が始まる等)を避けて数文字だけ手前に戻す
    for (let back = 0; back < 4 && breakAt > 1; back++) {
      const before = remaining[breakAt - 1]
      const after = remaining[breakAt]
      if (!isBadBreakPoint(before, after)) break
      breakAt--
    }
    lines.push(remaining.slice(0, breakAt))
    remaining = remaining.slice(breakAt)
  }
  return lines
}

function wrapTitle(ctx: CanvasRenderingContext2D, title: string, maxWidth: number): string[] {
  const paragraphs = title.split('\n').map((p) => p.trim()).filter((p) => p.length > 0)
  const lines: string[] = []
  paragraphs.forEach((para) => {
    lines.push(...wrapParagraph(ctx, para, maxWidth))
  })
  return lines.length > 0 ? lines : ['']
}

export async function renderPostImage(
  kind: PostKind,
  title: string,
  tpl: BackgroundTemplate,
  fontSeed: number,
  photo?: PhotoAsset | null,
  role?: string
): Promise<string> {
  // Google Fontsの読み込み完了を待ってからCanvasに描画する。
  // これを待たないと、初回描画時だけ代替フォントでPNGが書き出されることがある。
  await ensureFontsLoaded()
  void fontSeed // フォントは統一済みのためseedはローテーションに使わない(将来のA/Bテスト用に温存)

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

  // 余白を広く取るため、文字幅は横幅の72%まで(以前は78%)
  const maxWidth = size.w * 0.72
  let fontSize = kind === 'フィード' ? 76 : 82
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'

  let lines: string[] = []
  const minFontSize = kind === 'フィード' ? 44 : 48
  do {
    ctx.font = `${MAIN_FONT_WEIGHT} ${fontSize}px ${MAIN_FONT}`
    lines = wrapTitle(ctx, title, maxWidth)
    fontSize -= 4
  } while (lines.length * (fontSize + 22) > size.h * 0.46 && fontSize > minFontSize)

  ctx.font = `${MAIN_FONT_WEIGHT} ${fontSize + 4}px ${MAIN_FONT}`
  const lineHeight = fontSize + 30
  const totalHeight = lines.length * lineHeight
  // 写真背景時はタイトルを下寄りに配置し、人物の顔まわりを隠しすぎないようにする
  let y = usingPhoto ? size.h * 0.72 - totalHeight / 2 + lineHeight / 2 : size.h / 2 - totalHeight / 2 + lineHeight / 2

  // 上品な下地（読みやすさ確保のためのうっすら白）。写真背景時は下部グラデーションで代替済みのため省略する。
  if (!usingPhoto) {
    ctx.save()
    ctx.globalAlpha = 0.5
    ctx.fillStyle = '#ffffff'
    const pad = 44
    ctx.fillRect(size.w * 0.06, y - lineHeight / 2 - pad / 2, size.w * 0.88, totalHeight + pad)
    ctx.restore()
  }

  ctx.fillStyle = '#2F3A34'
  lines.forEach((line) => {
    ctx.fillText(line, size.w / 2, y)
    y += lineHeight
  })

  // ストーリーズ5回目(LINE診断誘導)のみ、控えめなLINE導線ラベルを添える(広告っぽくしない)
  if (kind === 'ストーリーズ' && role === 'LINE診断誘導') {
    const labelText = '公式LINEはプロフィールから'
    const labelY = size.h - 150
    ctx.font = `500 24px ${SUB_FONT}`
    const labelWidth = ctx.measureText(labelText).width
    const padX = 28
    const padY = 16
    const boxW = labelWidth + padX * 2
    const boxH = 24 + padY * 2
    const boxX = size.w / 2 - boxW / 2
    const boxY = labelY - boxH / 2
    ctx.save()
    ctx.strokeStyle = tpl.accent
    ctx.globalAlpha = 0.55
    ctx.lineWidth = 2
    const radius = boxH / 2
    ctx.beginPath()
    ctx.moveTo(boxX + radius, boxY)
    ctx.arcTo(boxX + boxW, boxY, boxX + boxW, boxY + boxH, radius)
    ctx.arcTo(boxX + boxW, boxY + boxH, boxX, boxY + boxH, radius)
    ctx.arcTo(boxX, boxY + boxH, boxX, boxY, radius)
    ctx.arcTo(boxX, boxY, boxX + boxW, boxY, radius)
    ctx.closePath()
    ctx.stroke()
    ctx.globalAlpha = 0.85
    ctx.fillStyle = '#2F3A34'
    ctx.fillText(labelText, size.w / 2, labelY + 1)
    ctx.restore()
  }

  // 小さなブランドフッター
  ctx.font = `400 26px ${SUB_FONT}`
  ctx.globalAlpha = 0.7
  ctx.fillStyle = '#2F3A34'
  ctx.fillText('人生の質向上コンサルタント', size.w / 2, size.h - 70)
  ctx.globalAlpha = 1

  return canvas.toDataURL('image/png')
}
