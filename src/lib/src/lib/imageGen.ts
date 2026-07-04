// カルーセルスライド(TOP / 中ページ / CTA)をCanvasで描画してPNGを生成する。
// v2 design-fix:
//   - 全体を明朝体ベースへ統一
//   - TOPタイトルは薄すぎない濃いグリーンで視認性を優先
//   - 中ページは「見立て」参考のように、濃い明朝本文＋淡いグリーンの語句ハイライト＋下部ピル型署名
//   - 背景は白を主役にし、ライトグリーンは装飾とアクセントに限定

import { Slide } from '../types'

export const SLIDE_SIZE = { w: 1080, h: 1350 } // Instagram 4:5

const HEADLINE_FONT = '"Kaisei Decol", "Shippori Mincho", "Noto Serif JP", serif'
const BODY_FONT = '"Shippori Mincho", "Noto Serif JP", serif'
const SERIF_FONT = '"Noto Serif JP", "Shippori Mincho", serif'

// 白ベース＋ライトグリーン基調。ただしTOP大見出しは視認性のため濃いグリーン。
const COLOR_BG = '#FFFFFF'
const COLOR_BG_SOFT = '#F8FFF6'
const COLOR_TOP_TITLE = '#245F2D'
const COLOR_TOP_TITLE_2 = '#2F7335'
const COLOR_TEXT_MAIN = '#202922'
const COLOR_TEXT_SUB = '#3E4B42'
const COLOR_LABEL = '#78C86E'
const COLOR_LIGHT_GREEN = '#9BEA92'
const COLOR_LIGHT_GREEN_2 = '#B6F3A8'
const COLOR_FRAME = '#B9EAB7'
const COLOR_ACCENT_GOLD = '#B79A5D'
const COLOR_HIGHLIGHT_BG = '#EAF7E4'
const COLOR_HIGHLIGHT_BORDER = '#D6EFD0'

const FONT_LOAD_SPECS = [
  `700 112px ${HEADLINE_FONT}`,
  `600 68px ${BODY_FONT}`,
  `500 46px ${BODY_FONT}`,
  `500 34px ${BODY_FONT}`,
  `400 28px ${SERIF_FONT}`,
  `500 26px ${BODY_FONT}`
]

let fontsLoadedPromise: Promise<void> | null = null

function ensureFontsLoaded(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return Promise.resolve()
  if (!fontsLoadedPromise) {
    fontsLoadedPromise = (async () => {
      try {
        await Promise.all(FONT_LOAD_SPECS.map((spec) => document.fonts.load(spec)))
        await document.fonts.ready
      } catch {
        // 代替フォントでも止めない
      }
    })()
  }
  return fontsLoadedPromise
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

// ---------- 背景・装飾 ----------
function fillBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = COLOR_BG
  ctx.fillRect(0, 0, w, h)

  // 角だけにごく淡い空気感。中央はほぼ白で視認性を確保。
  const gradients = [
    { x: 0.08, y: 0.06, r: 0.42, c: COLOR_BG_SOFT },
    { x: 0.95, y: 0.1, r: 0.38, c: '#F6FFF2' },
    { x: 0.05, y: 0.95, r: 0.46, c: '#F5FFF1' },
    { x: 0.92, y: 0.92, r: 0.42, c: '#F9FFF6' }
  ]
  gradients.forEach((g) => {
    const grad = ctx.createRadialGradient(w * g.x, h * g.y, 1, w * g.x, h * g.y, w * g.r)
    grad.addColorStop(0, g.c)
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
  })
}

function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save()
  ctx.strokeStyle = COLOR_FRAME
  ctx.globalAlpha = 0.75
  ctx.lineWidth = 1.2
  const pad = 32
  roundedRectPath(ctx, pad, pad, w - pad * 2, h - pad * 2, 26)
  ctx.stroke()

  // 右上・左下に細い曲線。枠の硬さを抜く。
  ctx.globalAlpha = 0.45
  ctx.strokeStyle = COLOR_LIGHT_GREEN
  ctx.lineWidth = 1.3
  ctx.beginPath()
  ctx.moveTo(w * 0.67, h * 0.04)
  ctx.bezierCurveTo(w * 0.80, h * 0.10, w * 0.86, h * 0.02, w * 0.98, h * 0.10)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(w * 0.02, h * 0.78)
  ctx.bezierCurveTo(w * 0.15, h * 0.88, w * 0.12, h * 0.98, w * 0.34, h * 0.94)
  ctx.stroke()
  ctx.restore()
}

function drawLeaf(ctx: CanvasRenderingContext2D, len: number, width: number, color: string, alpha: number) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.quadraticCurveTo(len * 0.32, -width, len, 0)
  ctx.quadraticCurveTo(len * 0.32, width, 0, 0)
  ctx.closePath()
  ctx.fill()
  ctx.globalAlpha = alpha * 0.35
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1, width * 0.055)
  ctx.beginPath()
  ctx.moveTo(len * 0.08, 0)
  ctx.lineTo(len * 0.92, 0)
  ctx.stroke()
  ctx.restore()
}

function drawLeafCluster(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, angleDeg: number, mirror: boolean) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(mirror ? -1 : 1, 1)
  ctx.rotate((angleDeg * Math.PI) / 180)

  ctx.save()
  ctx.strokeStyle = COLOR_ACCENT_GOLD
  ctx.globalAlpha = 0.28
  ctx.lineWidth = 2 * scale
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.quadraticCurveTo(55 * scale, 35 * scale, 148 * scale, 88 * scale)
  ctx.stroke()
  ctx.restore()

  const leafDefs = [
    { x: 20, y: 4, r: -48, len: 70, wid: 20, c: COLOR_LIGHT_GREEN, a: 0.72 },
    { x: 48, y: 22, r: -18, len: 90, wid: 24, c: COLOR_LIGHT_GREEN_2, a: 0.66 },
    { x: 80, y: 42, r: 12, len: 108, wid: 28, c: COLOR_LIGHT_GREEN, a: 0.62 },
    { x: 118, y: 62, r: 40, len: 92, wid: 24, c: COLOR_LIGHT_GREEN_2, a: 0.58 },
    { x: 145, y: 86, r: 68, len: 70, wid: 18, c: COLOR_LIGHT_GREEN, a: 0.54 }
  ]
  leafDefs.forEach((l) => {
    ctx.save()
    ctx.translate(l.x * scale, l.y * scale)
    ctx.rotate((l.r * Math.PI) / 180)
    drawLeaf(ctx, l.len * scale, l.wid * scale, l.c, l.a)
    ctx.restore()
  })

  // 金粒
  ctx.save()
  ctx.fillStyle = COLOR_ACCENT_GOLD
  ;[
    { x: 34, y: -18, r: 2.6 },
    { x: 70, y: 4, r: 2 },
    { x: 18, y: 44, r: 2.2 }
  ].forEach((p) => {
    ctx.globalAlpha = 0.42
    ctx.beginPath()
    ctx.arc(p.x * scale, p.y * scale, p.r * scale, 0, Math.PI * 2)
    ctx.fill()
  })
  ctx.restore()

  ctx.restore()
}

function drawCornerDecor(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // 装飾は十分に見せるが、文字領域には侵入させない。
  drawLeafCluster(ctx, -18, 24, 1.25, 12, false)
  drawLeafCluster(ctx, w + 10, 64, 0.88, 162, true)
  drawLeafCluster(ctx, -8, h - 260, 1.05, -28, false)
  drawLeafCluster(ctx, w + 18, h - 280, 1.06, 205, true)
}

function drawDivider(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, color = COLOR_LABEL) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.globalAlpha = 0.65
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(x - width / 2, y)
  ctx.lineTo(x - 16, y)
  ctx.moveTo(x + 16, y)
  ctx.lineTo(x + width / 2, y)
  ctx.stroke()
  ctx.fillStyle = color
  ctx.globalAlpha = 0.75
  ctx.beginPath()
  ctx.moveTo(x, y - 5)
  ctx.lineTo(x + 5, y)
  ctx.lineTo(x, y + 5)
  ctx.lineTo(x - 5, y)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

// ---------- 日本語の意味を壊しにくい改行 ----------
const NO_BREAK_AFTER_CHARS = new Set(['「', '『', '（', '(', '【', '［', '"'])
const NO_BREAK_BEFORE_CHARS = new Set(['、', '。', '！', '？', '」', '』', '）', ')', '】', '］', '"', 'ー', 'っ', 'ゃ', 'ゅ', 'ょ', 'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ'])

function isBadBreakPoint(before: string, after: string): boolean {
  return NO_BREAK_AFTER_CHARS.has(before) || NO_BREAK_BEFORE_CHARS.has(after)
}

function wrapParagraph(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (!text) return ['']
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
    for (let back = 0; back < 5 && breakAt > 1; back++) {
      if (!isBadBreakPoint(remaining[breakAt - 1], remaining[breakAt])) break
      breakAt--
    }
    lines.push(remaining.slice(0, breakAt))
    remaining = remaining.slice(breakAt)
  }
  return lines
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  ;(text || '').split('\n').forEach((raw) => {
    const para = raw.trim()
    if (!para) lines.push('')
    else lines.push(...wrapParagraph(ctx, para, maxWidth))
  })
  while (lines[0] === '') lines.shift()
  while (lines[lines.length - 1] === '') lines.pop()
  return lines.length ? lines : ['']
}

function drawHighlightedLine(ctx: CanvasRenderingContext2D, line: string, leftX: number, y: number, highlights: string[], fontSpec: string) {
  ctx.font = fontSpec
  const hit = highlights.find((h) => h && line.includes(h))
  if (!hit) {
    ctx.fillStyle = COLOR_TEXT_MAIN
    ctx.textAlign = 'left'
    ctx.fillText(line, leftX, y)
    return
  }

  const idx = line.indexOf(hit)
  const before = line.slice(0, idx)
  const after = line.slice(idx + hit.length)
  const beforeWidth = ctx.measureText(before).width
  const hitWidth = ctx.measureText(hit).width
  const metrics = ctx.measureText(hit)
  const ascent = metrics.actualBoundingBoxAscent || 36
  const descent = metrics.actualBoundingBoxDescent || 14
  const boxX = leftX + beforeWidth - 8
  const boxY = y - ascent - 7
  const boxH = ascent + descent + 14

  ctx.save()
  ctx.fillStyle = COLOR_HIGHLIGHT_BG
  ctx.strokeStyle = COLOR_HIGHLIGHT_BORDER
  ctx.globalAlpha = 0.96
  roundedRectPath(ctx, boxX, boxY, hitWidth + 16, boxH, 10)
  ctx.fill()
  ctx.stroke()
  ctx.restore()

  ctx.fillStyle = COLOR_TEXT_MAIN
  ctx.textAlign = 'left'
  ctx.fillText(before, leftX, y)
  ctx.fillText(hit, leftX + beforeWidth, y)
  ctx.fillText(after, leftX + beforeWidth + hitWidth, y)
}

function footerBadge(ctx: CanvasRenderingContext2D, w: number, h: number, displayName: string, title: string) {
  const nameFont = `500 27px ${BODY_FONT}`
  const titleFont = `400 22px ${SERIF_FONT}`
  const sep = '｜'
  ctx.font = nameFont
  const nameW = ctx.measureText(displayName).width
  ctx.font = titleFont
  const titleW = ctx.measureText(title).width
  const sepW = ctx.measureText(sep).width
  const textW = nameW + sepW + titleW
  const padX = 34
  const boxW = textW + padX * 2
  const boxH = 56
  const boxX = w / 2 - boxW / 2
  const boxY = h - 196

  ctx.save()
  ctx.fillStyle = '#FFFFFF'
  ctx.shadowColor = 'rgba(84,125,80,0.16)'
  ctx.shadowBlur = 16
  ctx.strokeStyle = COLOR_FRAME
  ctx.lineWidth = 1.3
  roundedRectPath(ctx, boxX, boxY, boxW, boxH, boxH / 2)
  ctx.fill()
  ctx.stroke()
  ctx.restore()

  const baseY = boxY + boxH / 2 + 1
  let x = w / 2 - textW / 2
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.font = nameFont
  ctx.fillStyle = COLOR_LABEL
  ctx.fillText(displayName, x, baseY)
  x += nameW
  ctx.font = titleFont
  ctx.fillStyle = COLOR_TEXT_SUB
  ctx.fillText(sep, x, baseY)
  x += sepW
  ctx.fillText(title, x, baseY)
}

function pageNumberFooter(ctx: CanvasRenderingContext2D, w: number, h: number, pageLabel: string) {
  ctx.save()
  ctx.font = `400 30px ${SERIF_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const y = h - 105
  ctx.fillStyle = COLOR_LABEL
  ctx.fillText(pageLabel, w / 2, y)
  drawDivider(ctx, w / 2, y + 1, 110, COLOR_LABEL)
  ctx.restore()
}

// ---------- TOP / CTA ----------
function renderCoverStyleSlide(ctx: CanvasRenderingContext2D, w: number, h: number, subheadline: string, headline: string, footerRight: string) {
  fillBackground(ctx, w, h)
  drawFrame(ctx, w, h)
  drawCornerDecor(ctx, w, h)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // 小見出し
  const subY = h * 0.245
  ctx.font = `500 31px ${BODY_FONT}`
  ctx.fillStyle = COLOR_ACCENT_GOLD
  ctx.fillText(subheadline, w / 2, subY)
  drawDivider(ctx, w / 2, subY + 38, Math.min(340, ctx.measureText(subheadline).width + 80), COLOR_ACCENT_GOLD)

  // TOPタイトル：薄いライトグリーンではなく、濃いグリーンで止める。
  const maxWidth = w * 0.80
  let fontSize = 122
  let lines: string[] = []
  do {
    ctx.font = `700 ${fontSize}px ${HEADLINE_FONT}`
    lines = wrapText(ctx, headline, maxWidth)
    fontSize -= 4
  } while ((lines.length * (fontSize + 34) > h * 0.50 || Math.max(...lines.map((l) => ctx.measureText(l).width)) > maxWidth) && fontSize > 68)

  const finalSize = fontSize + 4
  ctx.font = `700 ${finalSize}px ${HEADLINE_FONT}`
  const lineHeight = finalSize + 40
  const totalH = lines.length * lineHeight
  let y = h * 0.52 - totalH / 2 + lineHeight / 2

  const grad = ctx.createLinearGradient(0, y - totalH / 2, 0, y + totalH / 2)
  grad.addColorStop(0, COLOR_TOP_TITLE)
  grad.addColorStop(1, COLOR_TOP_TITLE_2)
  ctx.fillStyle = grad

  lines.forEach((line) => {
    ctx.fillText(line, w / 2, y)
    y += lineHeight
  })

  // 装飾曲線
  ctx.save()
  ctx.strokeStyle = COLOR_LIGHT_GREEN
  ctx.globalAlpha = 0.45
  ctx.lineWidth = 1.3
  ctx.beginPath()
  ctx.moveTo(w * 0.30, h * 0.72)
  ctx.bezierCurveTo(w * 0.46, h * 0.76, w * 0.62, h * 0.75, w * 0.74, h * 0.69)
  ctx.stroke()
  ctx.restore()

  // 右下導線。目立たせすぎないが読みやすく。
  ctx.font = `400 30px ${BODY_FONT}`
  ctx.fillStyle = COLOR_TEXT_MAIN
  ctx.textAlign = 'right'
  ctx.fillText(footerRight, w * 0.91, h * 0.88)
}

// ---------- 中ページ ----------
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
  drawFrame(ctx, w, h)
  drawCornerDecor(ctx, w, h)

  // 上部ラベル
  const labelY = h * 0.18
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `500 34px ${BODY_FONT}`
  ctx.fillStyle = COLOR_LABEL
  ctx.fillText(label === 'POINT' ? 'POINT' : label, w / 2, labelY)
  drawDivider(ctx, w / 2, labelY + 36, 150, COLOR_LABEL)

  // 本文：全明朝、濃い本文色、大きめ、中央左配置
  const maxWidth = w * 0.76
  let fontSize = 62
  let lines: string[] = []
  do {
    ctx.font = `500 ${fontSize}px ${BODY_FONT}`
    lines = wrapText(ctx, mainText, maxWidth)
    fontSize -= 2
  } while ((lines.length * (fontSize + 26) > h * 0.34 || Math.max(...lines.map((l) => ctx.measureText(l).width)) > maxWidth) && fontSize > 40)

  const finalSize = fontSize + 2
  const mainFont = `500 ${finalSize}px ${BODY_FONT}`
  ctx.font = mainFont
  const lineHeight = finalSize + 30
  const widths = lines.map((l) => ctx.measureText(l).width)
  const maxLineW = Math.max(...widths, 1)
  const leftX = w / 2 - maxLineW / 2
  let y = h * 0.38

  lines.forEach((line) => {
    if (line) drawHighlightedLine(ctx, line, leftX, y, highlights || [], mainFont)
    y += lineHeight
  })

  // 箇条書き：ある場合だけ、本文下に読みやすく。全部明朝体。
  if (bullets && bullets.length > 0) {
    const bulletFont = `400 29px ${BODY_FONT}`
    ctx.font = bulletFont
    ctx.textAlign = 'left'
    const bMaxW = Math.min(w * 0.68, 700)
    const bulletLeft = w / 2 - bMaxW / 2
    let by = Math.max(y + 48, h * 0.64)
    bullets.slice(0, 4).forEach((b) => {
      ctx.save()
      ctx.fillStyle = COLOR_LIGHT_GREEN
      ctx.globalAlpha = 0.9
      ctx.beginPath()
      ctx.ellipse(bulletLeft - 24, by - 11, 12, 7, -0.55, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      ctx.fillStyle = COLOR_TEXT_MAIN
      ctx.fillText(`・${b}`, bulletLeft, by)
      by += 52
    })
  }

  footerBadge(ctx, w, h, displayName, title)
  pageNumberFooter(ctx, w, h, pageLabel)
}

export async function renderSlideImage(slide: Slide, totalSlides: number, displayName: string, title: string): Promise<string> {
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
      String(slide.index).padStart(2, '0')
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
