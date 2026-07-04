// カルーセルスライド(TOP / 中ページ / CTA)をCanvasで描画してPNGを生成する。
//
// デザイン正本(【6〜10】に準拠):
//   - 純白〜ごく淡いライトグリーンの余白多めレイアウト、4:5(1080×1350)
//   - 上品な明朝系フォント(見出し: Kaisei Decol、本文: Shippori Mincho / Noto Serif JP)
//   - 隅にそっと添える水彩風の葉のモチーフ(procedural・塗りつぶしブロブは使わない)
//   - 重要語は淡いライトグリーンでハイライト、下部に補足箇条書き
//   - 暗い緑・灰緑・オリーブ・苔色は使わない(#9BEA92 系の明るいライトグリーンのみ)

import { Slide } from '../types'

export const SLIDE_SIZE = { w: 1080, h: 1350 } // 4:5

const HEADLINE_FONT = '"Kaisei Decol"'
const BODY_FONT = '"Shippori Mincho"'
const SERIF_FONT = '"Noto Serif JP"'
const SANS_FONT = '"Noto Sans JP"'

const COLOR_BG = '#FFFFFF'
const COLOR_BG_SOFT = '#F8FFF6'
const COLOR_HEADLINE_FROM = '#9BEA92'
const COLOR_HEADLINE_TO = '#7FDD72'
const COLOR_TEXT_MAIN = '#3A433D'
const COLOR_TEXT_SUB = '#465048'
const COLOR_ACCENT_GOLD = '#B79A5D'
const COLOR_HIGHLIGHT_BG = '#E9F7E4'
const COLOR_LEAF_1 = '#8FE883'
const COLOR_LEAF_2 = '#9BEA92'
const COLOR_LEAF_3 = '#B6F3A8'

const FONT_LOAD_SPECS = [
  `600 90px ${HEADLINE_FONT}`,
  `400 44px ${BODY_FONT}`,
  `600 44px ${BODY_FONT}`,
  `400 30px ${SERIF_FONT}`,
  `400 26px ${SANS_FONT}`,
  `500 26px ${SANS_FONT}`
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

// ---------- 葉のモチーフ(procedural・水彩風の近似) ----------
// 塗りつぶしブロブではなく、細い枝から数枚の葉が扇状に広がる一筆書き風の装飾。
function drawLeaf(ctx: CanvasRenderingContext2D, len: number, width: number, color: string, alpha: number) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.quadraticCurveTo(len * 0.3, -width, len, 0)
  ctx.quadraticCurveTo(len * 0.3, width, 0, 0)
  ctx.closePath()
  ctx.fill()
  // 葉脈
  ctx.globalAlpha = alpha * 0.5
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1, width * 0.06)
  ctx.beginPath()
  ctx.moveTo(len * 0.08, 0)
  ctx.lineTo(len * 0.92, 0)
  ctx.stroke()
  ctx.restore()
}

function drawLeafCluster(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, baseAngleDeg: number, mirror: boolean) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(mirror ? -1 : 1, 1)

  // 枝(細い一筆書きの曲線)
  ctx.save()
  ctx.strokeStyle = COLOR_ACCENT_GOLD
  ctx.globalAlpha = 0.35
  ctx.lineWidth = Math.max(2, 2.2 * scale)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.quadraticCurveTo(70 * scale, 40 * scale, 150 * scale, 90 * scale)
  ctx.stroke()
  ctx.restore()

  const leaves: { d: number; a: number; len: number; wid: number; color: string; alpha: number }[] = [
    { d: 20, a: baseAngleDeg - 55, len: 70, wid: 20, color: COLOR_LEAF_2, alpha: 0.85 },
    { d: 55, a: baseAngleDeg - 25, len: 95, wid: 26, color: COLOR_LEAF_1, alpha: 0.8 },
    { d: 95, a: baseAngleDeg + 5, len: 115, wid: 30, color: COLOR_LEAF_3, alpha: 0.75 },
    { d: 130, a: baseAngleDeg + 35, len: 100, wid: 26, color: COLOR_LEAF_1, alpha: 0.7 },
    { d: 155, a: baseAngleDeg + 62, len: 75, wid: 20, color: COLOR_LEAF_2, alpha: 0.65 }
  ]

  leaves.forEach((leaf) => {
    ctx.save()
    const rad = (leaf.a * Math.PI) / 180
    const px = Math.cos(rad) * leaf.d * scale
    const py = Math.sin(rad) * leaf.d * scale
    ctx.translate(px, py)
    ctx.rotate(rad)
    drawLeaf(ctx, leaf.len * scale, leaf.wid * scale, leaf.color, leaf.alpha)
    ctx.restore()
  })

  // ごく小さな金色の輝き粒(水彩イラストのアクセント)
  ctx.save()
  ctx.fillStyle = COLOR_ACCENT_GOLD
  ;[
    { x: 40 * scale, y: -20 * scale, r: 3.2 },
    { x: 90 * scale, y: 10 * scale, r: 2.4 },
    { x: 20 * scale, y: 45 * scale, r: 2.6 }
  ].forEach((p) => {
    ctx.globalAlpha = 0.5
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r * scale, 0, Math.PI * 2)
    ctx.fill()
  })
  ctx.restore()

  ctx.restore()
}

// 一筆書きの細い曲線(タイトル下・CTA導線などに添える上品なライン)
function drawFlowLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, cx: number, cy: number) {
  ctx.save()
  ctx.strokeStyle = COLOR_LEAF_1
  ctx.globalAlpha = 0.45
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.quadraticCurveTo(cx, cy, x2, y2)
  ctx.stroke()
  ctx.globalAlpha = 0.6
  ctx.fillStyle = COLOR_LEAF_1
  ctx.beginPath()
  ctx.arc(x2, y2, 3.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function fillBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = COLOR_BG
  ctx.fillRect(0, 0, w, h)
  // ごく淡いグリーンの空気感(隅に薄く)
  const grad = ctx.createRadialGradient(w * 0.15, h * 0.1, 10, w * 0.15, h * 0.1, w * 0.5)
  grad.addColorStop(0, COLOR_BG_SOFT)
  grad.addColorStop(1, 'rgba(248,255,246,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
  const grad2 = ctx.createRadialGradient(w * 0.9, h * 0.92, 10, w * 0.9, h * 0.92, w * 0.5)
  grad2.addColorStop(0, '#F2FAF0')
  grad2.addColorStop(1, 'rgba(242,250,240,0)')
  ctx.fillStyle = grad2
  ctx.fillRect(0, 0, w, h)
}

// ---------- 日本語の意味のまとまりを壊さない改行 ----------
const NO_BREAK_AFTER_CHARS = new Set(['「', '『', '（', '(', '【', '［', '"'])
const NO_BREAK_BEFORE_CHARS = new Set(['、', '。', '！', '？', '」', '』', '）', ')', '】', '］', '"', 'ー', 'っ', 'ゃ', 'ゅ', 'ょ', 'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ'])

function isBadBreakPoint(before: string, after: string): boolean {
  if (NO_BREAK_AFTER_CHARS.has(before)) return true
  if (NO_BREAK_BEFORE_CHARS.has(after)) return true
  return false
}

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
      if (ctx.measureText(remaining.slice(0, mid)).width <= maxWidth) lo = mid
      else hi = mid - 1
    }
    let breakAt = Math.max(1, lo)
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

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const paragraphs = (text || '').split('\n').map((p) => p.trim())
  const lines: string[] = []
  paragraphs.forEach((para) => {
    if (para.length === 0) {
      lines.push('')
    } else {
      lines.push(...wrapParagraph(ctx, para, maxWidth))
    }
  })
  // 先頭・末尾の空行だけ除去(段落間の意図的な空行は保持)
  while (lines.length > 0 && lines[0] === '') lines.shift()
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.length > 0 ? lines : ['']
}

// ハイライト語を含む行を、背景ボックス付きで描画する(左揃え・ブロックは中央寄せ配置)
function drawLineWithHighlight(
  ctx: CanvasRenderingContext2D,
  line: string,
  blockLeftX: number,
  y: number,
  highlights: string[],
  fontSpec: string
) {
  ctx.font = fontSpec
  const hit = highlights.find((h) => h && line.includes(h))
  if (!hit) {
    ctx.textAlign = 'left'
    ctx.fillStyle = COLOR_TEXT_MAIN
    ctx.fillText(line, blockLeftX, y)
    return
  }
  const idx = line.indexOf(hit)
  const before = line.slice(0, idx)
  const after = line.slice(idx + hit.length)
  ctx.textAlign = 'left'
  const beforeWidth = ctx.measureText(before).width
  const hitWidth = ctx.measureText(hit).width
  const metrics = ctx.measureText(line)
  const ascent = metrics.actualBoundingBoxAscent || 20
  const descent = metrics.actualBoundingBoxDescent || 10

  ctx.save()
  ctx.fillStyle = COLOR_HIGHLIGHT_BG
  const padX = 6
  ctx.fillRect(blockLeftX + beforeWidth - padX, y - ascent - 4, hitWidth + padX * 2, ascent + descent + 8)
  ctx.restore()

  ctx.fillStyle = COLOR_TEXT_MAIN
  ctx.fillText(before, blockLeftX, y)
  ctx.fillText(hit, blockLeftX + beforeWidth, y)
  ctx.fillText(after, blockLeftX + beforeWidth + hitWidth, y)
}

function footerBadge(ctx: CanvasRenderingContext2D, w: number, h: number, displayName: string, title: string) {
  const text = `${displayName}｜${title}`
  ctx.font = `500 26px ${SANS_FONT}`
  const textWidth = ctx.measureText(text).width
  const padX = 28
  const padY = 14
  const boxW = textWidth + padX * 2
  const boxH = 26 + padY * 2
  const boxX = w * 0.5 - boxW / 2
  const boxY = h - 190

  ctx.save()
  ctx.fillStyle = '#FFFFFF'
  ctx.globalAlpha = 0.92
  ctx.shadowColor = 'rgba(140,170,140,0.18)'
  ctx.shadowBlur = 14
  ctx.beginPath()
  const r = boxH / 2
  ctx.moveTo(boxX + r, boxY)
  ctx.arcTo(boxX + boxW, boxY, boxX + boxW, boxY + boxH, r)
  ctx.arcTo(boxX + boxW, boxY + boxH, boxX, boxY + boxH, r)
  ctx.arcTo(boxX, boxY + boxH, boxX, boxY, r)
  ctx.arcTo(boxX, boxY, boxX + boxW, boxY, r)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = COLOR_TEXT_SUB
  ctx.fillText(text, w / 2, boxY + boxH / 2 + 1)
  ctx.restore()
}

function pageNumberFooter(ctx: CanvasRenderingContext2D, w: number, h: number, pageLabel: string) {
  ctx.save()
  ctx.font = `400 26px ${SERIF_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const y = h - 100
  const numWidth = ctx.measureText(pageLabel).width
  ctx.fillStyle = COLOR_TEXT_SUB
  ctx.globalAlpha = 0.85
  ctx.fillText(pageLabel, w / 2, y)
  ctx.globalAlpha = 0.5
  ctx.strokeStyle = COLOR_LEAF_1
  ctx.lineWidth = 1.5
  const gap = 18
  ctx.beginPath()
  ctx.moveTo(w / 2 - numWidth / 2 - gap - 30, y)
  ctx.lineTo(w / 2 - numWidth / 2 - gap, y)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(w / 2 + numWidth / 2 + gap, y)
  ctx.lineTo(w / 2 + numWidth / 2 + gap + 30, y)
  ctx.stroke()
  ctx.restore()
}

// ---------- TOP / CTA スタイル(表紙・導線ページ) ----------
function renderCoverStyleSlide(ctx: CanvasRenderingContext2D, w: number, h: number, subheadline: string, headline: string, footerRight: string) {
  fillBackground(ctx, w, h)
  drawLeafCluster(ctx, w * 0.02, h * 0.0, 1.05, 35, false)
  drawLeafCluster(ctx, w * 0.98, h * 0.02, 0.85, 145, true)
  drawLeafCluster(ctx, w * 0.02, h * 0.98, 0.9, -35, false)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // 小見出し
  ctx.font = `400 30px ${SERIF_FONT}`
  ctx.fillStyle = COLOR_ACCENT_GOLD
  const subY = h * 0.245
  ctx.fillText(subheadline, w / 2, subY)
  const subWidth = ctx.measureText(subheadline).width
  drawFlowLine(ctx, w / 2 - subWidth / 2 - 10, subY + 32, w / 2 + subWidth / 2 + 10, subY + 32, w / 2, subY + 44)

  // 大見出し(改行込み・グラデーション)
  const maxWidth = w * 0.78
  let fontSize = 108
  let lines: string[] = []
  const minFontSize = 60
  do {
    ctx.font = `600 ${fontSize}px ${HEADLINE_FONT}`
    lines = wrapText(ctx, headline, maxWidth)
    fontSize -= 4
  } while (lines.length * (fontSize + 26) > h * 0.46 && fontSize > minFontSize)

  ctx.font = `600 ${fontSize + 4}px ${HEADLINE_FONT}`
  const lineHeight = fontSize + 34
  const totalHeight = lines.length * lineHeight
  let y = h * 0.5 - totalHeight / 2 + lineHeight / 2

  const grad = ctx.createLinearGradient(0, y - totalHeight / 2, 0, y + totalHeight / 2)
  grad.addColorStop(0, COLOR_HEADLINE_FROM)
  grad.addColorStop(1, COLOR_HEADLINE_TO)
  ctx.fillStyle = grad

  lines.forEach((line) => {
    ctx.fillText(line, w / 2, y)
    y += lineHeight
  })

  // 右下の導線テキスト
  ctx.font = `400 30px ${SERIF_FONT}`
  ctx.fillStyle = COLOR_TEXT_SUB
  ctx.textAlign = 'right'
  ctx.fillText(footerRight, w * 0.92, h * 0.88)
}

// ---------- 中ページスタイル(POINT型) ----------
function renderPointStyleSlide(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  label: string,
  mainText: string,
  highlights: string[],
  bullets: string[],
  displayName: string,
  title: string,
  pageLabel: string
) {
  fillBackground(ctx, w, h)
  drawLeafCluster(ctx, w * 0.0, h * 0.0, 0.95, 35, false)
  drawLeafCluster(ctx, w * 1.0, h * 1.0, 0.95, 35, true)

  // POINTバッジ
  const badgeY = h * 0.135
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `500 34px ${SERIF_FONT}`
  ctx.fillStyle = COLOR_LEAF_2
  ctx.save()
  ctx.letterSpacing = '4px'
  ctx.fillText(label.toUpperCase(), w / 2, badgeY)
  ctx.restore()
  const labelWidth = ctx.measureText(label.toUpperCase()).width + 60
  ctx.save()
  ctx.strokeStyle = COLOR_LEAF_1
  ctx.globalAlpha = 0.5
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(w / 2 - labelWidth / 2, badgeY + 34)
  ctx.lineTo(w / 2 + labelWidth / 2, badgeY + 34)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(w / 2, badgeY + 34, 3, 0, Math.PI * 2)
  ctx.fillStyle = COLOR_LEAF_1
  ctx.fill()
  ctx.restore()

  // 本文(ブロックは中央寄せ配置・各行は左揃え)
  const maxWidth = w * 0.72
  let fontSize = 58
  let lines: string[] = []
  const minFontSize = 36
  do {
    ctx.font = `600 ${fontSize}px ${BODY_FONT}`
    lines = wrapText(ctx, mainText, maxWidth)
    fontSize -= 2
  } while (lines.length * (fontSize + 24) > h * 0.42 && fontSize > minFontSize)

  ctx.font = `600 ${fontSize + 2}px ${BODY_FONT}`
  const lineHeight = fontSize + 26
  const totalHeight = lines.length * lineHeight
  const blockTop = h * 0.3
  let y = blockTop + lineHeight / 2

  let blockLeftX = w / 2
  lines.forEach((line) => {
    const lw = ctx.measureText(line).width
    blockLeftX = Math.min(blockLeftX, w / 2 - lw / 2)
  })
  // 空でない最長行基準に左端を揃え直す(見た目のガタつき防止)
  const widths = lines.map((l) => ctx.measureText(l).width)
  const maxLineWidth = Math.max(...widths, 1)
  blockLeftX = w / 2 - maxLineWidth / 2

  lines.forEach((line, i) => {
    if (line.length > 0) {
      drawLineWithHighlight(ctx, line, blockLeftX, y, highlights || [], `600 ${fontSize + 2}px ${BODY_FONT}`)
    }
    y += lineHeight
    void i
  })

  // 下部の補足箇条書き
  if (bullets && bullets.length > 0) {
    let by = blockTop + totalHeight + 70
    ctx.font = `400 32px ${SANS_FONT}`
    ctx.textAlign = 'left'
    const bulletLeftX = w * 0.14
    bullets.slice(0, 4).forEach((b) => {
      ctx.save()
      ctx.fillStyle = COLOR_LEAF_1
      ctx.globalAlpha = 0.9
      ctx.beginPath()
      ctx.ellipse(bulletLeftX - 22, by - 10, 11, 6, -0.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      ctx.fillStyle = COLOR_TEXT_MAIN
      ctx.fillText(`・${b}`, bulletLeftX, by)
      by += 56
    })
  }

  footerBadge(ctx, w, h, displayName, title)
  pageNumberFooter(ctx, w, h, pageLabel)
}

export async function renderSlideImage(
  slide: Slide,
  totalSlides: number,
  displayName: string,
  title: string
): Promise<string> {
  await ensureFontsLoaded()

  const { w, h } = SLIDE_SIZE
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  if (slide.role === 'TOP') {
    renderCoverStyleSlide(ctx, w, h, slide.subheadline || '', slide.headline || '', '次のページへ　→')
  } else if (slide.role === 'CTA') {
    renderCoverStyleSlide(ctx, w, h, slide.subheadline || '', slide.headline || '', 'プロフィールのリンクから')
    footerBadge(ctx, w, h, displayName, title)
  } else {
    const pageLabel = String(slide.index).padStart(2, '0')
    renderPointStyleSlide(
      ctx,
      w,
      h,
      slide.label || 'POINT',
      slide.mainText || '',
      slide.highlights || [],
      slide.bullets || [],
      displayName,
      title,
      pageLabel
    )
  }
  void totalSlides

  return canvas.toDataURL('image/png')
}

export async function renderAllSlides(slides: Slide[], displayName: string, title: string): Promise<Slide[]> {
  const rendered: Slide[] = []
  for (const s of slides) {
    const imageDataUrl = await renderSlideImage(s, slides.length, displayName, title)
    rendered.push({ ...s, imageDataUrl })
  }
  return rendered
}
