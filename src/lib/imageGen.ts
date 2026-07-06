// カルーセルスライド(TOP / 中ページ / CTA)をCanvasで描画してPNGを生成する。
// v2 design-fix:
//   - 全体をNoto Serif JP優先の明朝体へ統一
//   - TOPタイトルは薄すぎない濃いグリーンで視認性を優先
//   - 中ページは「見立て」参考のように、濃い明朝本文＋淡いグリーンの語句ハイライト＋下部ピル型署名
//   - 背景は白を主役にし、ライトグリーンは装飾とアクセントに限定

import { Slide, SlideRole, Theme } from '../types'

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

function loadBackgroundAsset(kind: BackgroundKind): Promise<HTMLImageElement | null> {
  const src = BACKGROUND_ASSETS[kind]
  const key = `${kind}:${src}`
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
// 「1投稿目だけ葉っぱ、2投稿目と3投稿目は一目で違う」という要件を確実に満たす。
function motifIndexFor(postIndex?: number): number {
  const p = postIndex && postIndex > 0 ? Math.floor(postIndex) : 1
  return ((p - 1) % 5) + 1
}

function drawThemeAtmosphere(ctx: CanvasRenderingContext2D, w: number, h: number, postIndex?: number, role?: SlideRole) {
  const motif = motifIndexFor(postIndex)

  // 1投稿目(葉っぱ・水彩植物)は bg-*.png 側の柄が主役なので、ここでは何も足さない。
  if (motif === 1) return

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // 7枚目(行動提案=本編完結ページ)は静かな余白を優先し、装飾を弱める。
  const calm = role === '行動提案'
  const a = (v: number) => v * (calm ? 0.5 : 1)

  const green = `rgba(142, 218, 126, ${a(0.30)})`
  const greenSoft = `rgba(177, 239, 164, ${a(0.26)})`
  const gold = `rgba(183, 154, 93, ${a(0.30)})`

  if (motif === 2) {
    // 2投稿目: 水彩にじみ＋やさしい曲線。葉っぱ・円は使わない。
    drawWatercolorBlob(ctx, w * 0.08, h * 0.08, w * 0.24, h * 0.16, COLOR_LIGHT_GREEN, a(0.14), 46, 101)
    drawWatercolorBlob(ctx, w * 0.94, h * 0.14, w * 0.22, h * 0.15, COLOR_LIGHT_GREEN_2, a(0.12), 40, 113)
    drawWatercolorBlob(ctx, w * 0.10, h * 0.92, w * 0.24, h * 0.16, COLOR_LIGHT_GREEN_2, a(0.13), 42, 127)
    drawWatercolorBlob(ctx, w * 0.92, h * 0.90, w * 0.22, h * 0.15, COLOR_LIGHT_GREEN, a(0.12), 40, 139)

    ctx.strokeStyle = green
    ctx.lineWidth = 2.4
    ;[0.16, 0.20, 0.80, 0.84].forEach((yy) => {
      ctx.beginPath()
      ctx.moveTo(w * 0.06, h * yy)
      ctx.bezierCurveTo(w * 0.30, h * (yy + 0.05), w * 0.50, h * (yy - 0.05), w * 0.72, h * yy)
      ctx.bezierCurveTo(w * 0.84, h * (yy + 0.03), w * 0.92, h * (yy - 0.03), w * 0.98, h * yy)
      ctx.stroke()
    })
  }

  if (motif === 3) {
    // 3投稿目: 円・丸モチーフの重なり。2投稿目(曲線)とは形状が明確に異なる。
    ctx.strokeStyle = greenSoft
    ctx.lineWidth = 2.6
    ;[
      [w * 0.14, h * 0.16, 96],
      [w * 0.86, h * 0.20, 118],
      [w * 0.18, h * 0.84, 128],
      [w * 0.84, h * 0.82, 92]
    ].forEach(([cx, cy, r]) => {
      ctx.beginPath()
      ctx.arc(cx as number, cy as number, r as number, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(cx as number, cy as number, (r as number) * 0.62, 0, Math.PI * 2)
      ctx.stroke()
    })
    ctx.fillStyle = gold
    ;[
      [w * 0.20, h * 0.20],
      [w * 0.80, h * 0.24],
      [w * 0.22, h * 0.80],
      [w * 0.80, h * 0.78]
    ].forEach(([x, y]) => {
      ctx.beginPath()
      ctx.arc(x as number, y as number, 5, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  if (motif === 4) {
    // 4投稿目: 細いフレーム線・ガイド線。直線基調で円/波とはっきり区別する。
    ctx.strokeStyle = gold
    ctx.lineWidth = 1.6
    const insetX = w * 0.07
    const insetY = h * 0.10
    ctx.strokeRect(insetX, insetY, w - insetX * 2, h - insetY * 2)

    ctx.strokeStyle = green
    ctx.lineWidth = 1.4
    ;[0.12, 0.88].forEach((yy) => {
      ctx.beginPath()
      ctx.moveTo(w * 0.10, h * yy)
      ctx.lineTo(w * 0.32, h * yy)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(w * 0.68, h * yy)
      ctx.lineTo(w * 0.90, h * yy)
      ctx.stroke()
    })
    // 角のトンボ風ガイド交点
    ;[
      [w * 0.07, h * 0.10],
      [w * 0.93, h * 0.10],
      [w * 0.07, h * 0.90],
      [w * 0.93, h * 0.90]
    ].forEach(([x, y]) => {
      ctx.beginPath()
      ctx.moveTo((x as number) - 14, y as number)
      ctx.lineTo((x as number) + 14, y as number)
      ctx.moveTo(x as number, (y as number) - 14)
      ctx.lineTo(x as number, (y as number) + 14)
      ctx.stroke()
    })
  }

  if (motif === 5) {
    // 5投稿目: 点描・小粒ドット・淡い光。テキスト帯は避けて周辺に散らす。
    const rng = makeRng(2026)
    for (let i = 0; i < 46; i++) {
      const x = rng() * w
      const y = rng() * h
      if (x > w * 0.16 && x < w * 0.84 && y > h * 0.22 && y < h * 0.78) continue
      const r = 1.6 + rng() * 3.2
      ctx.fillStyle = rng() > 0.5 ? green : gold
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
    drawWatercolorBlob(ctx, w * 0.12, h * 0.14, w * 0.16, h * 0.10, COLOR_LIGHT_GREEN_2, a(0.10), 50, 211)
    drawWatercolorBlob(ctx, w * 0.90, h * 0.88, w * 0.18, h * 0.12, COLOR_LIGHT_GREEN, a(0.10), 50, 223)
  }

  // 6枚目(気づき)は転換感を出すため、淡い光の粒を少し足す。
  if (role === '気づき') {
    ctx.fillStyle = 'rgba(183,154,93,0.35)'
    ;[
      [w * 0.5, h * 0.10],
      [w * 0.5, h * 0.90]
    ].forEach(([x, y]) => {
      ctx.beginPath()
      ctx.arc(x as number, y as number, 3.4, 0, Math.PI * 2)
      ctx.fill()
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
  const bgKind: BackgroundKind = slide.role === 'TOP' ? 'top' : slide.role === 'CTA' ? 'cta' : 'middle'
  const bgAsset = await loadBackgroundAsset(bgKind)

  if (slide.role === 'TOP') {
    renderCoverStyleSlide(ctx, w, h, slide.subheadline || '', slide.headline || '', '次のページへ　→', bgAsset, theme, postIndex)
  } else if (slide.role === 'CTA') {
    renderCtaSlide(ctx, w, h, slide.subheadline || '', slide.headline || '', displayName, title, bgAsset, theme, postIndex)
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
      postIndex,
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
