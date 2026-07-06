// カルーセルスライド(TOP / 中ページ / CTA)をCanvasで描画してPNGを生成する。
// v2 design-fix:
//   - 全体をNoto Serif JP優先の明朝体へ統一
//   - TOPタイトルは薄すぎない濃いグリーンで視認性を優先
//   - 中ページは「見立て」参考のように、濃い明朝本文＋淡いグリーンの語句ハイライト＋下部ピル型署名
//   - 背景は白を主役にし、ライトグリーンは装飾とアクセントに限定

import { Slide, SlideRole, Theme } from '../types'
import { POST2_APPROVED_BG_DATA_URL, POST3_APPROVED_BG_DATA_URL, POST5_APPROVED_BG_DATA_URL } from './fixedBackgroundData'

export const SLIDE_SIZE = { w: 1080, h: 1350 } // Instagram 4:5

const MINCHO_FONT = '"Noto Serif JP", "Shippori Mincho", "Zen Old Mincho", "Hiragino Mincho ProN", "Yu Mincho", "YuMincho", "MS PMincho", serif'
const HEADLINE_FONT = MINCHO_FONT
const BODY_FONT = MINCHO_FONT
const SERIF_FONT = MINCHO_FONT

// 白ベース＋ライトグリーン基調。文字は全ページで濃いチャコール明朝へ統一。
const COLOR_BG = '#FFFFFF'
const COLOR_BG_SOFT = '#F8FFF6'
const COLOR_TEXT_MAIN = '#2F3A34'
const COLOR_TOP_TITLE = COLOR_TEXT_MAIN
const COLOR_TOP_TITLE_2 = COLOR_TEXT_MAIN
const COLOR_TEXT_SUB = '#3E4B42'
const COLOR_LABEL = '#78C86E'
const COLOR_LIGHT_GREEN = '#9BEA92'
const COLOR_LIGHT_GREEN_2 = '#B6F3A8'
const COLOR_FRAME = '#B9EAB7'
const COLOR_ACCENT_GOLD = '#B79A5D'
const COLOR_HIGHLIGHT_BG = '#EAF7E4'
const COLOR_HIGHLIGHT_BORDER = '#D6EFD0'
const COLOR_BADGE_NAME = '#86C97C'
const COLOR_BADGE_FRAME = '#D7EFD2'



type BackgroundKind = 'top' | 'middle' | 'cta'

const THEME_LABELS: Record<Theme, { en: string; ja: string }> = {
  健康: { en: 'HEALTH', ja: '健康' },
  人間関係: { en: 'RELATIONSHIP', ja: '人間関係' },
  お金: { en: 'MONEY', ja: 'お金' },
  ご縁: { en: 'CONNECTION', ja: 'ご縁' },
  使命: { en: 'MISSION', ja: '使命' },
  瞑想: { en: 'MEDITATION', ja: '瞑想' },
  無料診断: { en: 'CHECK', ja: '無料診断' }
}

const BACKGROUND_ASSETS: Record<BackgroundKind, string> = {
  top: '/assets/design/bg-top.png',
  middle: '/assets/design/bg-middle.png',
  cta: '/assets/design/bg-cta.png'
}

// v20 final:
// 1投稿目・2投稿目は既存の葉っぱ系背景。
// 3投稿目・5投稿目は、ひろきさん確認済み背景をdataURLとしてコード内埋め込み。
// 4投稿目は背景PNGを使わず、丸モチーフをCanvasで描画。
const POST_FIXED_BACKGROUND_DATA_URLS: Partial<Record<number, string>> = {
  2: POST2_APPROVED_BG_DATA_URL,
  3: POST3_APPROVED_BG_DATA_URL,
  5: POST5_APPROVED_BG_DATA_URL
}

const backgroundCache = new Map<string, Promise<HTMLImageElement | null>>()

function loadImageAsset(src: string): Promise<HTMLImageElement | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function loadBackgroundAsset(kind: BackgroundKind, postIndex?: number): Promise<HTMLImageElement | null> {
  const motif = motifIndexFor(postIndex)
  const fixedDataUrl = POST_FIXED_BACKGROUND_DATA_URLS[motif]
  const src = fixedDataUrl || BACKGROUND_ASSETS[kind]
  const key = `${kind}:${motif}:${fixedDataUrl ? 'embedded-approved-bg' : src}`
  const cached = backgroundCache.get(key)
  if (cached) return cached
  const promise = loadImageAsset(src)
  backgroundCache.set(key, promise)
  return promise
}

function drawThemeLabel(ctx: CanvasRenderingContext2D, w: number, theme?: Theme) {
  if (!theme) return
  const info = THEME_LABELS[theme]
  if (!info) return
  const text = `${info.en}｜${info.ja}`

  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `500 27px ${SERIF_FONT}`
  const tw = ctx.measureText(text).width
  const pillW = Math.max(210, tw + 58)
  const pillH = 48
  const x = w / 2 - pillW / 2
  const y = 58

  ctx.shadowColor = 'rgba(84,125,80,0.08)'
  ctx.shadowBlur = 8
  ctx.fillStyle = 'rgba(255,255,255,0.76)'
  roundedRectPath(ctx, x, y, pillW, pillH, pillH / 2)
  ctx.fill()

  ctx.shadowBlur = 0
  ctx.strokeStyle = 'rgba(134,201,124,0.45)'
  ctx.lineWidth = 1.2
  roundedRectPath(ctx, x, y, pillW, pillH, pillH / 2)
  ctx.stroke()

  ctx.fillStyle = COLOR_TEXT_MAIN
  ctx.globalAlpha = 0.88
  ctx.fillText(text, w / 2, y + pillH / 2 + 1)
  ctx.restore()
}


// 投稿番号(1〜5)から背景モチーフ番号を決める。5投稿を超える場合は1〜5を循環させる。
// テーマ名(健康/人間関係/...)ではなく「その日の何投稿目か」でモチーフを決めることで、
// テーマの並び替え(ユーザーがテーマを指定した場合の companionThemes 並び替え)に関わらず
// 投稿番号ごとの背景固定ルールを確実に満たす。
//
// v20 最終固定ルール（投稿番号ベース／テーマに関係なく共通）：
//   1 ＝ 葉っぱA　　　（ブランド入口。bg-top/middle/cta.png ＋ drawCornerDecor）
//   2 ＝ 葉っぱA’　　（1投稿目と同じ既存水彩葉っぱ背景）
//   3 ＝ 葉っぱB　　　（承認済み背景をコード内dataURLで固定表示）
//   4 ＝ 丸モチーフ　（円・丸の重なり）
//   5 ＝ 葉っぱC　　　（承認済み背景をコード内dataURLで固定表示）
function motifIndexFor(postIndex?: number): number {
  const p = postIndex && postIndex > 0 ? Math.floor(postIndex) : 1
  return ((p - 1) % 5) + 1
}

function drawThemeAtmosphere(ctx: CanvasRenderingContext2D, w: number, h: number, postIndex?: number, role?: SlideRole) {
  const motif = motifIndexFor(postIndex)

  // v20 final:
  // 1・2・3・5投稿目は固定PNG背景だけを使う。
  // ここで追加装飾を乗せると、承認済み背景が崩れるため描画しない。
  if (motif !== 4) return

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const calm = role === '行動提案'
  const weaken = calm ? 0.62 : 1
  const green = (alpha: number) => `rgba(142, 218, 126, ${alpha * weaken})`
  const green2 = (alpha: number) => `rgba(182, 243, 168, ${alpha * weaken})`
  const gold = (alpha: number) => `rgba(183, 154, 93, ${alpha * weaken})`

  // 4投稿目＝丸モチーフ：円・丸の重なり。
  // これはv19でOKだった方向を維持する。
  const circleSets = [
    [w * 0.12, h * 0.18, 92],
    [w * 0.88, h * 0.22, 126],
    [w * 0.18, h * 0.82, 142],
    [w * 0.84, h * 0.80, 104]
  ]
  circleSets.forEach(([cx, cy, baseR], idx) => {
    ;[0, 38, 76].forEach((add, k) => {
      ctx.beginPath()
      ctx.strokeStyle = k === 1 ? gold(0.30) : green2(0.36 - k * 0.05)
      ctx.lineWidth = k === 1 ? 2.2 : 2.8
      const r = (baseR as number) + add
      ctx.arc(cx as number, cy as number, r, 0, Math.PI * 2)
      ctx.stroke()
    })
    ctx.fillStyle = idx % 2 === 0 ? green(0.26) : gold(0.24)
    ctx.beginPath()
    ctx.arc(cx as number, cy as number, 10, 0, Math.PI * 2)
    ctx.fill()
  })

  // 中央に影響しない範囲で、薄い水彩にじみだけ足す。
  drawWatercolorBlob(ctx, w * 0.08, h * 0.10, w * 0.18, h * 0.12, COLOR_LIGHT_GREEN, 0.08 * weaken, 42, 411)
  drawWatercolorBlob(ctx, w * 0.92, h * 0.88, w * 0.18, h * 0.12, COLOR_LIGHT_GREEN_2, 0.08 * weaken, 42, 413)

  ctx.restore()
}



function drawOliveBranch(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, angleDeg: number, mirror: boolean) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(mirror ? -1 : 1, 1)
  ctx.rotate((angleDeg * Math.PI) / 180)

  ctx.strokeStyle = COLOR_ACCENT_GOLD
  ctx.globalAlpha = 0.42
  ctx.lineWidth = 2 * scale
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.quadraticCurveTo(120 * scale, -92 * scale, 290 * scale, -130 * scale)
  ctx.stroke()

  const leaves = [
    [44, -18, -38, 76, 16],
    [84, -50, -12, 84, 17],
    [126, -72, 18, 76, 16],
    [172, -92, -26, 82, 17],
    [218, -110, 12, 74, 15],
    [262, -124, -18, 66, 14]
  ]

  leaves.forEach(([lx, ly, rot, len, wid], i) => {
    ctx.save()
    ctx.translate((lx as number) * scale, (ly as number) * scale)
    ctx.rotate(((rot as number) * Math.PI) / 180)
    drawLeaf(ctx, (len as number) * scale, (wid as number) * scale, i % 2 ? COLOR_LIGHT_GREEN_2 : COLOR_LIGHT_GREEN, 0.55)
    ctx.restore()
  })

  ctx.fillStyle = COLOR_LIGHT_GREEN
  ctx.globalAlpha = 0.52
  ;[
    [92, -35],
    [196, -98],
    [248, -118]
  ].forEach(([ox, oy]) => {
    ctx.beginPath()
    ctx.ellipse((ox as number) * scale, (oy as number) * scale, 10 * scale, 16 * scale, -0.25, 0, Math.PI * 2)
    ctx.fill()
  })

  ctx.restore()
}


function drawHardFixedFallbackBackground(ctx: CanvasRenderingContext2D, w: number, h: number, postIndex?: number) {
  const motif = motifIndexFor(postIndex)
  if (![2, 3, 5].includes(motif)) return

  // 読み込み失敗時の最後の保険。背景が消えるより、多少シンプルでも確実に差分を出す。
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const green = 'rgba(142, 218, 126, 0.34)'
  const greenSoft = 'rgba(182, 243, 168, 0.28)'
  const gold = 'rgba(183, 154, 93, 0.26)'

  if (motif === 2) {
    drawCornerDecor(ctx, w, h)
  }

  if (motif === 3) {
    // 承認済み背景3に寄せた、上下左右で明確な葉っぱB。
    drawBranchCluster(ctx, -24, h * 0.16, 1.25, 20, false, 1.0)
    drawBranchCluster(ctx, w + 20, h * 0.82, 1.12, 202, true, 1.0)
    ctx.strokeStyle = gold
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(w * 0.10, h * 0.18)
    ctx.bezierCurveTo(w * 0.34, h * 0.12, w * 0.55, h * 0.25, w * 0.82, h * 0.16)
    ctx.stroke()
  }

  if (motif === 5) {
    // 承認済み背景5に寄せた、対角オリーブ枝系。
    drawOliveBranch(ctx, w * 0.04, h * 0.72, 1.18, -32, false)
    drawOliveBranch(ctx, w * 0.94, h * 0.18, 1.02, 150, true)
    ctx.strokeStyle = gold
    ctx.lineWidth = 1.6
    ;[0.15, 0.83].forEach((yy) => {
      ctx.beginPath()
      ctx.moveTo(w * 0.04, h * yy)
      ctx.bezierCurveTo(w * 0.32, h * (yy + 0.06), w * 0.62, h * (yy - 0.06), w * 0.96, h * yy)
      ctx.stroke()
    })
  }

  ctx.restore()
}


function drawCtaFrame(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save()
  const x = 54
  const y = 92
  const fw = w - 108
  const fh = h - 176
  const r = 44

  ctx.strokeStyle = 'rgba(142,218,126,0.72)'
  ctx.lineWidth = 4.5
  roundedRectPath(ctx, x, y, fw, fh, r)
  ctx.stroke()

  ctx.strokeStyle = 'rgba(183,154,93,0.34)'
  ctx.lineWidth = 1.4
  roundedRectPath(ctx, x + 14, y + 14, fw - 28, fh - 28, r - 10)
  ctx.stroke()

  const label = 'GUIDE｜ご案内'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `500 25px ${SERIF_FONT}`
  const tw = ctx.measureText(label).width
  const pw = tw + 48
  const ph = 42
  const px = w / 2 - pw / 2
  const py = y + 26
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  roundedRectPath(ctx, px, py, pw, ph, ph / 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(142,218,126,0.55)'
  ctx.lineWidth = 1.2
  roundedRectPath(ctx, px, py, pw, ph, ph / 2)
  ctx.stroke()
  ctx.fillStyle = COLOR_TEXT_MAIN
  ctx.globalAlpha = 0.86
  ctx.fillText(label, w / 2, py + ph / 2 + 1)
  ctx.restore()
}


const FONT_LOAD_SPECS = [
  '400 28px "Noto Serif JP"',
  '500 34px "Noto Serif JP"',
  '500 56px "Noto Serif JP"',
  '600 86px "Noto Serif JP"',
  '700 96px "Noto Serif JP"',
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

// シード付き擬似乱数（量産しても再現性を保つ）
function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

// 紙のうっすらした質感。極小の粒を低アルファで散らしたタイルを敷き詰める。
let paperPatternCache: CanvasPattern | null = null
function getPaperPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (paperPatternCache) return paperPatternCache
  const size = 160
  const tile = document.createElement('canvas')
  tile.width = size
  tile.height = size
  const tctx = tile.getContext('2d')!
  const rng = makeRng(7)
  for (let i = 0; i < 900; i++) {
    const x = rng() * size
    const y = rng() * size
    const r = rng() * 0.7 + 0.2
    const tone = rng() > 0.5 ? '46,58,52' : '255,255,255'
    tctx.fillStyle = `rgba(${tone},${(rng() * 0.05 + 0.02).toFixed(3)})`
    tctx.beginPath()
    tctx.arc(x, y, r, 0, Math.PI * 2)
    tctx.fill()
  }
  paperPatternCache = ctx.createPattern(tile, 'repeat')
  return paperPatternCache
}

function drawPaperGrain(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const pattern = getPaperPattern(ctx)
  if (!pattern) return
  ctx.save()
  ctx.globalAlpha = 0.55
  ctx.fillStyle = pattern
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
}

// 不定形の水彩ブロブ（ゆらぎのある楕円）をぼかして滲ませる。
function drawWatercolorBlob(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
  alpha: number,
  blurPx: number,
  seed: number
) {
  const rng = makeRng(seed)
  const points = 10
  ctx.save()
  ctx.filter = `blur(${blurPx}px)`
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.beginPath()
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * Math.PI * 2
    const wobble = 0.78 + rng() * 0.4
    const x = cx + Math.cos(a) * rx * wobble
    const y = cy + Math.sin(a) * ry * wobble
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function fillBackground(ctx: CanvasRenderingContext2D, w: number, h: number, bgAsset?: CanvasImageSource | null, kind: BackgroundKind = 'middle', postIndex?: number) {
  // 葉っぱ・水彩植物の bg-*.png は「1投稿目」のブランド感専用。2〜5投稿目では使わない。
  const isFirstPost = !postIndex || postIndex === 1
  if (bgAsset && isFirstPost) {
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, w, h)

    const bgAlpha = kind === 'middle' ? 0.92 : kind === 'cta' ? 0.94 : 0.94
    ctx.save()
    ctx.globalAlpha = bgAlpha
    ctx.drawImage(bgAsset, 0, 0, w, h)
    ctx.restore()

    const center = ctx.createRadialGradient(w / 2, h * 0.48, 1, w / 2, h * 0.48, w * 0.58)
    center.addColorStop(0, 'rgba(255,255,255,0.45)')
    center.addColorStop(0.58, 'rgba(255,255,255,0.24)')
    center.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = center
    ctx.fillRect(0, 0, w, h)
    return
  }
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

  // 水彩のにじみ：角に不定形のライトグリーンの滲みを重ねる。
  // 「緑の画面」ではなく「白い紙にグリーンの空気が乗る」印象を狙う弱さに保つ。
  drawWatercolorBlob(ctx, w * 0.06, h * 0.05, w * 0.30, h * 0.20, COLOR_LIGHT_GREEN, 0.10, 46, 11)
  drawWatercolorBlob(ctx, w * 0.02, h * 0.10, w * 0.20, h * 0.14, COLOR_LIGHT_GREEN_2, 0.08, 30, 23)
  drawWatercolorBlob(ctx, w * 0.97, h * 0.06, w * 0.26, h * 0.18, COLOR_LIGHT_GREEN, 0.09, 44, 37)
  drawWatercolorBlob(ctx, w * 0.03, h * 0.96, w * 0.28, h * 0.20, COLOR_LIGHT_GREEN_2, 0.10, 48, 53)
  drawWatercolorBlob(ctx, w * 0.98, h * 0.95, w * 0.30, h * 0.20, COLOR_LIGHT_GREEN, 0.10, 46, 61)

  // 紙の質感をごく薄く重ねる（装飾・文字より下のレイヤー）。
  drawPaperGrain(ctx, w, h)
}

function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save()
  // 矩形の縁取りは置かず、右上・左下の細い一筆線だけを残す。
  // 「囲まれた感じ」を出さずに余白へ静かな動きを添える。
  ctx.globalAlpha = 0.4
  ctx.strokeStyle = COLOR_LIGHT_GREEN
  ctx.lineWidth = 1.2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(w * 0.67, h * 0.045)
  ctx.bezierCurveTo(w * 0.80, h * 0.105, w * 0.86, h * 0.025, w * 0.975, h * 0.10)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(w * 0.025, h * 0.78)
  ctx.bezierCurveTo(w * 0.15, h * 0.88, w * 0.12, h * 0.975, w * 0.34, h * 0.935)
  ctx.stroke()
  ctx.restore()
}

function drawLeaf(ctx: CanvasRenderingContext2D, len: number, width: number, color: string, alpha: number) {
  const leafPath = () => {
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(len * 0.32, -width, len, 0)
    ctx.quadraticCurveTo(len * 0.32, width, 0, 0)
    ctx.closePath()
  }

  // にじみ層：一回り大きく、ぼかしをかけて輪郭を溶かす。これで「貼った感」を消す。
  ctx.save()
  ctx.filter = 'blur(5px)'
  ctx.globalAlpha = alpha * 0.5
  ctx.fillStyle = color
  ctx.save()
  ctx.scale(1.1, 1.22)
  leafPath()
  ctx.restore()
  ctx.fill()
  ctx.restore()

  // くっきり層：本体。にじみ層より弱めのアルファで水彩の重なりを出す。
  ctx.save()
  ctx.globalAlpha = alpha * 0.82
  ctx.fillStyle = color
  leafPath()
  ctx.fill()
  ctx.globalAlpha = alpha * 0.3
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1, width * 0.055)
  ctx.beginPath()
  ctx.moveTo(len * 0.08, 0)
  ctx.lineTo(len * 0.92, 0)
  ctx.stroke()
  ctx.restore()
}

function drawLeafCluster(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  angleDeg: number,
  mirror: boolean,
  opts?: { alphaMult?: number; leafCount?: number }
) {
  const alphaMult = opts?.alphaMult ?? 1
  const leafCount = opts?.leafCount ?? 5

  ctx.save()
  ctx.translate(x, y)
  ctx.scale(mirror ? -1 : 1, 1)
  ctx.rotate((angleDeg * Math.PI) / 180)

  ctx.save()
  ctx.strokeStyle = COLOR_ACCENT_GOLD
  ctx.globalAlpha = 0.28 * alphaMult
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
  ].slice(0, leafCount)
  leafDefs.forEach((l) => {
    ctx.save()
    ctx.translate(l.x * scale, l.y * scale)
    ctx.rotate((l.r * Math.PI) / 180)
    drawLeaf(ctx, l.len * scale, l.wid * scale, l.c, l.a * alphaMult)
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
    ctx.globalAlpha = 0.42 * alphaMult
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

// 丸みのある楕円の葉。drawLeaf(先の尖った笹葉)とは輪郭が明確に違うため、
// 3投稿目「葉っぱB」に使うと1・2投稿目と一目で別柄だと分かる。
function drawRoundLeaf(ctx: CanvasRenderingContext2D, size: number, color: string, alpha: number) {
  ctx.save()
  ctx.filter = 'blur(4px)'
  ctx.globalAlpha = alpha * 0.45
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(0, 0, size * 1.12, size * 0.92, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.globalAlpha = alpha * 0.8
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.ellipse(0, 0, size, size * 0.8, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = alpha * 0.28
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1, size * 0.045)
  ctx.beginPath()
  ctx.moveTo(-size * 0.75, 0)
  ctx.lineTo(size * 0.75, 0)
  ctx.stroke()
  ctx.restore()
}

// 枝もの風の「葉っぱB」ブランチ。1本の枝から丸みの葉が交互に生えるシルエットで、
// 放射状クラスター（葉っぱA/A’）とは配置そのものが違って見える。
function drawBranchCluster(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, angleDeg: number, mirror: boolean, alphaMult = 1) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(mirror ? -1 : 1, 1)
  ctx.rotate((angleDeg * Math.PI) / 180)

  // 枝の芯
  ctx.save()
  ctx.strokeStyle = COLOR_ACCENT_GOLD
  ctx.globalAlpha = 0.34 * alphaMult
  ctx.lineWidth = 2.4 * scale
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.bezierCurveTo(40 * scale, 30 * scale, 90 * scale, 60 * scale, 168 * scale, 118 * scale)
  ctx.stroke()
  ctx.restore()

  const roundLeafDefs = [
    { x: 14, y: 6, r: -30, size: 26, c: COLOR_LIGHT_GREEN_2, a: 0.68 },
    { x: 40, y: 24, r: 20, size: 34, c: COLOR_LIGHT_GREEN, a: 0.62 },
    { x: 70, y: 44, r: -14, size: 40, c: COLOR_LIGHT_GREEN_2, a: 0.58 },
    { x: 104, y: 68, r: 26, size: 36, c: COLOR_LIGHT_GREEN, a: 0.54 },
    { x: 138, y: 92, r: -8, size: 30, c: COLOR_LIGHT_GREEN_2, a: 0.5 },
    { x: 165, y: 116, r: 16, size: 22, c: COLOR_LIGHT_GREEN, a: 0.46 }
  ]
  roundLeafDefs.forEach((l) => {
    ctx.save()
    ctx.translate(l.x * scale, l.y * scale)
    ctx.rotate((l.r * Math.PI) / 180)
    drawRoundLeaf(ctx, l.size * scale, l.c, l.a * alphaMult)
    ctx.restore()
  })

  ctx.save()
  ctx.fillStyle = COLOR_ACCENT_GOLD
  ;[
    { x: 26, y: -14, r: 2.4 },
    { x: 86, y: 30, r: 2 },
    { x: 128, y: 78, r: 2.2 }
  ].forEach((p) => {
    ctx.globalAlpha = 0.36 * alphaMult
    ctx.beginPath()
    ctx.arc(p.x * scale, p.y * scale, p.r * scale, 0, Math.PI * 2)
    ctx.fill()
  })
  ctx.restore()

  ctx.restore()
}

// 華やか＋粒感のある「葉っぱC」。葉は小さめ・上下配置にまとめ、
// 光の粒（きらめき）を添えることで3投稿目の枝ものとも明確に違う印象にする。
function drawSparkleLeafCluster(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, angleDeg: number, mirror: boolean, alphaMult = 1) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(mirror ? -1 : 1, 1)
  ctx.rotate((angleDeg * Math.PI) / 180)

  const smallLeafDefs = [
    { x: 10, y: 2, r: -40, len: 44, wid: 13, c: COLOR_LIGHT_GREEN, a: 0.6 },
    { x: 26, y: 16, r: -10, len: 52, wid: 15, c: COLOR_LIGHT_GREEN_2, a: 0.56 },
    { x: 44, y: 32, r: 22, len: 46, wid: 13, c: COLOR_LIGHT_GREEN, a: 0.5 }
  ]
  smallLeafDefs.forEach((l) => {
    ctx.save()
    ctx.translate(l.x * scale, l.y * scale)
    ctx.rotate((l.r * Math.PI) / 180)
    drawLeaf(ctx, l.len * scale, l.wid * scale, l.c, l.a * alphaMult)
    ctx.restore()
  })

  // きらめき（4方向の光の粒）
  function sparkle(cx: number, cy: number, r: number, alpha: number) {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.globalAlpha = alpha * alphaMult
    ctx.fillStyle = COLOR_ACCENT_GOLD
    ctx.beginPath()
    ctx.moveTo(0, -r)
    ctx.quadraticCurveTo(r * 0.22, -r * 0.22, r, 0)
    ctx.quadraticCurveTo(r * 0.22, r * 0.22, 0, r)
    ctx.quadraticCurveTo(-r * 0.22, r * 0.22, -r, 0)
    ctx.quadraticCurveTo(-r * 0.22, -r * 0.22, 0, -r)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
  sparkle(58 * scale, 4 * scale, 9 * scale, 0.46)
  sparkle(4 * scale, 50 * scale, 6.5 * scale, 0.4)
  sparkle(78 * scale, 46 * scale, 5.5 * scale, 0.36)

  ctx.save()
  ctx.fillStyle = COLOR_LIGHT_GREEN
  ;[
    { x: 20, y: 46, r: 2 },
    { x: 62, y: 26, r: 1.7 },
    { x: 90, y: 12, r: 1.6 }
  ].forEach((p) => {
    ctx.globalAlpha = 0.4 * alphaMult
    ctx.beginPath()
    ctx.arc(p.x * scale, p.y * scale, p.r * scale, 0, Math.PI * 2)
    ctx.fill()
  })
  ctx.restore()

  ctx.restore()
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

function footerBadge(ctx: CanvasRenderingContext2D, w: number, h: number, displayName: string, title: string, yOverride?: number) {
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
  const boxY = typeof yOverride === 'number' ? yOverride : h - 196

  ctx.save()
  ctx.fillStyle = '#FFFFFF'
  ctx.shadowColor = 'rgba(84,125,80,0.09)'
  ctx.shadowBlur = 10
  ctx.strokeStyle = COLOR_BADGE_FRAME
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
  ctx.fillStyle = COLOR_BADGE_NAME
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
function getHeadlineLines(ctx: CanvasRenderingContext2D, headline: string, maxWidth: number, initialFontSize: number): string[] {
  const explicit = (headline || '').split('\n').map((l) => l.trim()).filter(Boolean)
  if (explicit.length > 1) return explicit

  ctx.font = `600 ${initialFontSize}px ${HEADLINE_FONT}`
  const normalized = (headline || '').replace(/\n/g, '').trim()
  if (!normalized) return ['']
  if (ctx.measureText(normalized).width <= maxWidth) return [normalized]
  return wrapText(ctx, normalized, maxWidth)
}

// ---------- TOP / CTA ----------
function renderCoverStyleSlide(ctx: CanvasRenderingContext2D, w: number, h: number, subheadline: string, headline: string, footerRight: string, bgAsset?: CanvasImageSource | null, theme?: Theme, postIndex?: number) {
  fillBackground(ctx, w, h, bgAsset, 'top', postIndex)
  const isFirstPost = !postIndex || postIndex === 1
  if (!bgAsset) {
    drawFrame(ctx, w, h)
    if (isFirstPost) drawCornerDecor(ctx, w, h)
  } else if (!isFirstPost) {
    drawFrame(ctx, w, h)
  }
  if (!bgAsset) drawHardFixedFallbackBackground(ctx, w, h, postIndex)
  drawThemeAtmosphere(ctx, w, h, postIndex, 'TOP')
  drawThemeLabel(ctx, w, theme)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // 小見出し：落ち着いたゴールド。本文とは役割を分ける。
  const subY = h * 0.265
  ctx.font = `500 31px ${SERIF_FONT}`
  ctx.fillStyle = COLOR_ACCENT_GOLD
  ctx.fillText(subheadline, w / 2, subY)
  drawDivider(ctx, w / 2, subY + 38, Math.min(360, ctx.measureText(subheadline).width + 96), COLOR_LABEL)

  // TOPタイトル：中ページ本文と同じ濃いチャコール、同じ明朝系フォントへ統一。
  const maxWidth = w * 0.82
  let fontSize = 100
  let lines: string[] = []
  do {
    ctx.font = `500 ${fontSize}px ${HEADLINE_FONT}`
    lines = getHeadlineLines(ctx, headline, maxWidth, fontSize)
    const lineHeight = fontSize * 1.42
    const maxLineW = Math.max(...lines.map((l) => ctx.measureText(l).width), 1)
    if (maxLineW <= maxWidth && lines.length * lineHeight <= h * 0.42) break
    fontSize -= 3
  } while (fontSize > 64)

  const lineHeight = fontSize * 1.42
  const totalH = lines.length * lineHeight
  let y = h * 0.51 - totalH / 2 + lineHeight / 2

  ctx.font = `500 ${fontSize}px ${HEADLINE_FONT}`
  ctx.fillStyle = COLOR_TEXT_MAIN
  lines.forEach((line) => {
    ctx.fillText(line, w / 2, y)
    y += lineHeight
  })

  // 装飾曲線。文字より弱く。
  ctx.save()
  ctx.strokeStyle = COLOR_LIGHT_GREEN
  ctx.globalAlpha = 0.35
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(w * 0.30, h * 0.72)
  ctx.bezierCurveTo(w * 0.46, h * 0.76, w * 0.62, h * 0.75, w * 0.74, h * 0.69)
  ctx.stroke()
  ctx.restore()

  if (footerRight) {
    ctx.font = `400 30px ${SERIF_FONT}`
    ctx.fillStyle = COLOR_TEXT_MAIN
    ctx.textAlign = 'right'
    ctx.fillText(footerRight, w * 0.91, h * 0.88)
  }
}

function renderCtaSlide(ctx: CanvasRenderingContext2D, w: number, h: number, subheadline: string, headline: string, displayName: string, title: string, bgAsset?: CanvasImageSource | null, theme?: Theme, postIndex?: number) {
  fillBackground(ctx, w, h, bgAsset, 'cta', postIndex)
  const isFirstPost = !postIndex || postIndex === 1
  if (!bgAsset) {
    drawFrame(ctx, w, h)
    if (isFirstPost) drawCornerDecor(ctx, w, h)
  } else if (!isFirstPost) {
    drawFrame(ctx, w, h)
  }
  if (!bgAsset) drawHardFixedFallbackBackground(ctx, w, h, postIndex)
  drawThemeAtmosphere(ctx, w, h, postIndex, 'CTA')
  drawThemeLabel(ctx, w, theme)
  drawCtaFrame(ctx, w, h)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const subY = h * 0.29
  ctx.font = `500 30px ${SERIF_FONT}`
  ctx.fillStyle = COLOR_ACCENT_GOLD
  ctx.fillText(subheadline, w / 2, subY)
  drawDivider(ctx, w / 2, subY + 38, Math.min(450, ctx.measureText(subheadline).width + 96), COLOR_LABEL)

  const maxWidth = w * 0.80
  let fontSize = 88
  let lines: string[] = []
  do {
    ctx.font = `500 ${fontSize}px ${HEADLINE_FONT}`
    lines = getHeadlineLines(ctx, headline, maxWidth, fontSize)
    const lineHeight = fontSize * 1.45
    const maxLineW = Math.max(...lines.map((l) => ctx.measureText(l).width), 1)
    if (maxLineW <= maxWidth && lines.length * lineHeight <= h * 0.34) break
    fontSize -= 3
  } while (fontSize > 56)

  ctx.font = `500 ${fontSize}px ${HEADLINE_FONT}`
  ctx.fillStyle = COLOR_TEXT_MAIN
  const lineHeight = fontSize * 1.45
  const totalH = lines.length * lineHeight
  let y = h * 0.52 - totalH / 2 + lineHeight / 2
  lines.forEach((line) => {
    ctx.fillText(line, w / 2, y)
    y += lineHeight
  })

  // CTAは署名ピルと導線文言が被らないよう、通常ページより上に配置する。
  footerBadge(ctx, w, h, displayName, title, h - 285)

  ctx.font = `400 31px ${SERIF_FONT}`
  ctx.fillStyle = COLOR_TEXT_MAIN
  ctx.textAlign = 'center'
  ctx.fillText('人生の質向上チェックは', w / 2, h - 190)
  ctx.fillText('プロフィールのリンクから', w / 2, h - 150)
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
  pageLabel: string,
  bgAsset?: CanvasImageSource | null,
  theme?: Theme,
  postIndex?: number,
  role?: SlideRole
) {
  fillBackground(ctx, w, h, bgAsset, 'middle', postIndex)
  const isFirstPost = !postIndex || postIndex === 1
  if (!bgAsset) {
    drawFrame(ctx, w, h)
    if (isFirstPost) drawCornerDecor(ctx, w, h)
  } else if (!isFirstPost) {
    drawFrame(ctx, w, h)
  }
  if (!bgAsset) drawHardFixedFallbackBackground(ctx, w, h, postIndex)
  drawThemeAtmosphere(ctx, w, h, postIndex, role)
  drawThemeLabel(ctx, w, theme)

  // 上部ラベル：明朝体で統一。色はライトグリーンのアクセントのみ。
  const labelY = h * 0.18
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `500 34px ${SERIF_FONT}`
  ctx.fillStyle = COLOR_LABEL
  ctx.fillText(label === 'POINT' ? 'POINT' : label, w / 2, labelY)
  drawDivider(ctx, w / 2, labelY + 36, 150, COLOR_LABEL)

  // 本文：全て同じ明朝体、濃いチャコール。ゴシック混在を避ける。
  const maxWidth = w * 0.76
  const usableBullets = (bullets || []).slice(0, 3)
  const hasBullets = usableBullets.length > 0
  const footerTopY = h - 212
  let fontSize = hasBullets ? 48 : 58
  let lines: string[] = []
  let lineHeight = fontSize * 1.52
  let bulletFontSize = 29
  let bulletLineHeight = 48
  let mainStartY = hasBullets ? h * 0.36 : h * 0.40

  // 本文＋箇条書き＋フッターが絶対に重ならないよう、全体の高さでフィットさせる。
  do {
    ctx.font = `500 ${fontSize}px ${BODY_FONT}`
    lines = wrapText(ctx, mainText, maxWidth)
    lineHeight = fontSize * 1.52
    bulletFontSize = Math.max(25, Math.min(31, Math.round(fontSize * 0.58)))
    bulletLineHeight = Math.round(bulletFontSize * 1.55)
    const mainHeight = lines.length * lineHeight
    const bulletHeight = hasBullets ? 42 + usableBullets.length * bulletLineHeight : 0
    mainStartY = hasBullets ? h * 0.34 : h * 0.40
    const totalBottom = mainStartY + mainHeight + bulletHeight
    const maxLineW = Math.max(...lines.map((l) => ctx.measureText(l).width), 1)
    if (totalBottom <= footerTopY && maxLineW <= maxWidth) break
    fontSize -= 2
  } while (fontSize > 34)

  const mainFont = `500 ${fontSize}px ${BODY_FONT}`
  ctx.font = mainFont
  const widths = lines.map((l) => ctx.measureText(l).width)
  const maxLineW = Math.max(...widths, 1)
  const leftX = w / 2 - maxLineW / 2
  let y = mainStartY

  lines.forEach((line) => {
    if (line) drawHighlightedLine(ctx, line, leftX, y, highlights || [], mainFont)
    y += lineHeight
  })

  // 箇条書き：本文から離しすぎず、中央寄せの塊として自然に配置する。
  if (hasBullets) {
    const bulletFont = `400 ${bulletFontSize}px ${BODY_FONT}`
    ctx.font = bulletFont
    ctx.textAlign = 'left'

    const bulletWrapWidth = Math.min(w * 0.60, 620)
    const markerGap = 24
    const bulletGroups = usableBullets.map((b) => {
      const wrapped = wrapText(ctx, b, bulletWrapWidth)
      const width = Math.max(...wrapped.map((line) => ctx.measureText(`・${line}`).width), 1)
      return { text: b, wrapped, width }
    })

    const maxBulletWidth = Math.max(...bulletGroups.map((g) => g.width), 1)
    const bulletBlockWidth = Math.min(maxBulletWidth + markerGap, bulletWrapWidth + markerGap)
    const bulletBlockHeight = bulletGroups.reduce((sum, g) => sum + g.wrapped.length * bulletLineHeight, 0) + (bulletGroups.length - 1) * 8

    const centeredLeft = w / 2 - bulletBlockWidth / 2 + markerGap
    const mainAlignedLeft = leftX + Math.min(36, Math.max(0, maxLineW * 0.04))
    const bulletLeft = Math.max(150, Math.min(centeredLeft + 18, mainAlignedLeft + 70))

    let by = y + 14
    by = Math.max(by, h * 0.56)
    by = Math.min(by, footerTopY - bulletBlockHeight - 6)

    bulletGroups.forEach((group) => {
      const markerY = by + Math.max(14, bulletLineHeight * 0.38)
      ctx.save()
      ctx.fillStyle = COLOR_LIGHT_GREEN
      ctx.globalAlpha = 0.9
      ctx.beginPath()
      ctx.ellipse(bulletLeft - markerGap, markerY - 2, 12, 7, -0.55, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      group.wrapped.forEach((line, lineIndex) => {
        ctx.fillStyle = COLOR_TEXT_MAIN
        ctx.fillText(lineIndex === 0 ? `・${line}` : `　${line}`, bulletLeft, by + lineIndex * bulletLineHeight)
      })
      by += group.wrapped.length * bulletLineHeight + 8
    })
  }

  footerBadge(ctx, w, h, displayName, title)
  pageNumberFooter(ctx, w, h, pageLabel)
}

export async function renderSlideImage(slide: Slide, totalSlides: number, displayName: string, title: string, theme?: Theme, postIndex?: number): Promise<string> {
  await ensureFontsLoaded()

  const { w, h } = SLIDE_SIZE
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const effectivePostIndex = postIndex || slide.backgroundPostIndex
  const bgKind: BackgroundKind = slide.role === 'TOP' ? 'top' : slide.role === 'CTA' ? 'cta' : 'middle'
  const motif = motifIndexFor(effectivePostIndex)
  const bgAsset = motif === 4 ? null : await loadBackgroundAsset(bgKind, effectivePostIndex)

  if (slide.role === 'TOP') {
    renderCoverStyleSlide(ctx, w, h, slide.subheadline || '', slide.headline || '', '次のページへ　→', bgAsset, theme, effectivePostIndex)
  } else if (slide.role === 'CTA') {
    renderCtaSlide(ctx, w, h, slide.subheadline || '', slide.headline || '', displayName, title, bgAsset, theme, effectivePostIndex)
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
      String(slide.index).padStart(2, '0'),
      bgAsset,
      theme,
      effectivePostIndex,
      slide.role
    )
  }
  void totalSlides

  return canvas.toDataURL('image/png')
}

export async function renderAllSlides(slides: Slide[], displayName: string, title: string, theme?: Theme, postIndex?: number): Promise<Slide[]> {
  const rendered: Slide[] = []
  for (const s of slides) {
    const imageDataUrl = await renderSlideImage(s, slides.length, displayName, title, theme, postIndex)
    rendered.push({ ...s, imageDataUrl })
  }
  return rendered
}
