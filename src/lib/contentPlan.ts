// 1日分=3投稿(カルーセル)を組み立てるロジック。
//
// 生成フロー(投稿ごと):
//   1. まずOpenAI API(Netlify Functions経由・Responses API)で
//      TOP見出し／中ページ6枚分の中身／投稿欄本文の冒頭／ハッシュタグ候補 を生成する
//   2. 失敗時・未設定時・禁止表現ヒット時のみ、ローカルフレーズバンク(contentBank.ts)にフォールバックする
//   3. CTAスライドの文言・service/Present/profile/よくある相談ブロック・公式LINEのURL・
//      ハッシュタグの最終形は、リンク誤りや素材差し替えの反映漏れを防ぐため常にアプリ側(この
//      ファイル)で確定させる(【5. 投稿欄本文構成】の固定ブロックは設定画面の値をそのまま使う)。
//
// 重複回避は「履歴内の直近使用TOP見出し/投稿欄冒頭」を避けることで実現する。

import { ALL_THEMES, AppSettings, CarouselPost, HistoryEntry, Slide, Theme } from '../types'
import { captionClosingLines, ctaHeadlines, getPostBank, PostVariant } from './contentBank'
import { tryGenerateWithOpenAI } from './openai'

function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr]
  let s = seed
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280
    const j = Math.floor((s / 233280) * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// 任意メモ／テーマ指定からその日のテーマ配分を決める
const themeKeywords: Record<Theme, string[]> = {
  人間関係: ['人間関係', '人付き合い', '対人'],
  健康: ['健康', '体調', '身体'],
  お金: ['お金', '収入', '資金'],
  使命: ['使命', '天職', '役割'],
  ご縁: ['ご縁', '縁', '出会い'],
  瞑想: ['瞑想', 'マインドフルネス'],
  無料診断: ['診断', 'チェック', '無料診断']
}

// 1日3投稿は同じテーマを連続させず、朝・昼・夜で見え方を分散させる。
// テーマ指定がある場合も、そのテーマを起点に関連テーマへ広げる（3本とも同テーマにはしない）。
const companionThemes: Record<Theme, Theme[]> = {
  健康: ['健康', '人間関係', '使命'],
  お金: ['お金', '健康', '使命'],
  人間関係: ['人間関係', '健康', 'ご縁'],
  使命: ['使命', '健康', 'お金'],
  ご縁: ['ご縁', '人間関係', '使命'],
  瞑想: ['瞑想', '健康', '使命'],
  無料診断: ['健康', '人間関係', '無料診断']
}

const autoThemeRotations: Theme[][] = [
  // 朝:健康 / 昼:お金・人間関係 / 夜:使命・ご縁・内省 の見え方を作る。
  ['健康', 'お金', '人間関係'],
  ['ご縁', '健康', '使命'],
  ['お金', '人間関係', '無料診断'],
  ['瞑想', '健康', '使命']
]

export function planThemesForDay(dayIndex: number, userTheme: Theme | 'auto', postsPerDay: number, memo: string, seed: number): Theme[] {
  if (userTheme !== 'auto') {
    return companionThemes[userTheme].slice(0, postsPerDay)
  }
  const hitTheme = ALL_THEMES.find((t) => themeKeywords[t].some((kw) => memo.includes(kw)))
  if (hitTheme) return companionThemes[hitTheme].slice(0, postsPerDay)

  const rotationPreset = autoThemeRotations[(dayIndex - 1) % autoThemeRotations.length]
  if (postsPerDay <= rotationPreset.length) return rotationPreset.slice(0, postsPerDay)

  const weighted: Theme[] = []
  ALL_THEMES.forEach((t) => {
    weighted.push(t)
  })
  const rotation = shuffle(weighted, seed + dayIndex * 97)
  const themes: Theme[] = []
  let i = 0
  while (themes.length < postsPerDay) {
    const candidate = rotation[i % rotation.length]
    if (themes.length === 0 || themes[themes.length - 1] !== candidate) themes.push(candidate)
    i++
    if (i > rotation.length * 5) themes.push(candidate)
  }
  return themes.slice(0, postsPerDay)
}

function isUsed(history: HistoryEntry[], field: 'topHeadline' | 'captionLead', value: string, windowSize = 60): boolean {
  const recent = history.slice(-windowSize)
  return recent.some((h) => h[field] === value)
}

function pickUnusedVariant(variants: PostVariant[], history: HistoryEntry[], seed: number): PostVariant {
  const shuffled = shuffle(variants, seed)
  const fresh = shuffled.find((v) => !isUsed(history, 'topHeadline', v.topHeadline) && !isUsed(history, 'captionLead', v.captionLead))
  return fresh ?? shuffled.find((v) => !isUsed(history, 'topHeadline', v.topHeadline)) ?? shuffled[0]
}

function containsForbidden(text: string, forbiddenWords: string[]): boolean {
  if (!text) return false
  return forbiddenWords.some((w) => w && text.includes(w))
}

function countJapaneseChars(text: string): number {
  return Array.from((text || '').replace(/\s/g, '')).length
}

function isAcceptableTopHeadline(headline: string): boolean {
  const lines = (headline || '').split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length < 1 || lines.length > 3) return false
  const joined = lines.join('')
  // TOPは“説明”ではなく“刺す一言”。長すぎる見出しは必ず中ページへ回す。
  if (countJapaneseChars(joined) > 18) return false
  if (lines.some((l) => countJapaneseChars(l) > 10)) return false
  const punctuationCount = (joined.match(/[、。]/g) || []).length
  if (punctuationCount > 0) return false
  return true
}

function isAcceptableSlides(slides: Pick<Slide, 'label' | 'mainText' | 'highlights' | 'bullets'>[]): boolean {
  if (slides.length !== 6) return false
  return slides.every((s) => {
    const len = countJapaneseChars(s.mainText || '')
    const lines = (s.mainText || '').split('\n').map((l) => l.trim()).filter(Boolean)
    const bullets = s.bullets || []
    return len > 0 && len <= 90 && lines.length <= 5 && bullets.length <= 3
  })
}

function sanitizeHashtags(tags: string[] | null | undefined, settings: AppSettings): string[] {
  const cleaned = (tags || [])
    .map((t) => t.replace(/^#/, '').trim())
    .filter((t) => t.length > 0 && t.length <= 24 && !t.includes(' '))
  const unique = Array.from(new Set(cleaned))
  if (unique.length >= 5) return unique.slice(0, 12)
  const base = settings.baseHashtags.length > 0 ? settings.baseHashtags : []
  return base.slice(0, Math.min(12, Math.max(8, base.length)))
}

export interface CoreResult {
  postTitle: string
  topSub: string
  topHeadline: string
  slides6: Pick<Slide, 'label' | 'mainText' | 'highlights' | 'bullets'>[] // 問題提起〜行動提案の6枚分
  captionLead: string
  hashtags: string[]
  source: 'ai' | 'local'
}

function variantToSlides6(v: PostVariant): Pick<Slide, 'label' | 'mainText' | 'highlights' | 'bullets'>[] {
  return [
    { label: 'POINT', mainText: v.problem.main, highlights: v.problem.highlights, bullets: v.problem.bullets },
    { label: 'よくある相談', mainText: v.consult.main, highlights: v.consult.highlights, bullets: v.consult.bullets },
    { label: 'POINT', mainText: v.cause.main, highlights: v.cause.highlights, bullets: v.cause.bullets },
    { label: 'POINT', mainText: v.example.main, highlights: v.example.highlights, bullets: v.example.bullets },
    { label: 'POINT', mainText: v.insight.main, highlights: v.insight.highlights, bullets: v.insight.bullets },
    { label: 'POINT', mainText: v.action.main, highlights: v.action.highlights, bullets: v.action.bullets }
  ]
}

function localCore(theme: Theme, history: HistoryEntry[], seed: number, settings: AppSettings): CoreResult {
  const variant = pickUnusedVariant(getPostBank(theme), history, seed)
  return {
    postTitle: variant.topHeadline.replace(/\n/g, ''),
    topSub: variant.topSub,
    topHeadline: variant.topHeadline,
    slides6: variantToSlides6(variant),
    captionLead: variant.captionLead,
    hashtags: sanitizeHashtags(null, settings),
    source: 'local'
  }
}

async function generateCore(theme: Theme, history: HistoryEntry[], settings: AppSettings, seed: number, memo?: string): Promise<CoreResult> {
  const recent = history.slice(-60)
  const avoidHeadlines = Array.from(new Set(recent.map((h) => h.topHeadline))).slice(-20)
  const avoidLeads = Array.from(new Set(recent.map((h) => h.captionLead))).slice(-20)

  const ai = await tryGenerateWithOpenAI({
    theme,
    memo,
    avoidHeadlines,
    avoidLeads,
    brand: { displayName: settings.displayName, title: settings.title, lineUrl: settings.lineUrl },
    forbiddenWords: settings.forbiddenWords,
    model: settings.openaiModel
  })

  const aiValid =
    !!ai &&
    ai.topHeadline.trim().length > 0 &&
    isAcceptableTopHeadline(ai.topHeadline.trim()) &&
    !isUsed(history, 'topHeadline', ai.topHeadline.trim(), 80) &&
    !isUsed(history, 'captionLead', (ai.captionLead || '').trim(), 80) &&
    isAcceptableSlides(ai.slides6) &&
    !containsForbidden(ai.topHeadline, settings.forbiddenWords) &&
    !ai.slides6.some((s) => containsForbidden(s.mainText || '', settings.forbiddenWords))

  if (aiValid && ai) {
    return {
      postTitle: ai.postTitle.trim() || ai.topHeadline.replace(/\n/g, ''),
      topSub: ai.topSub.trim() || '心と現実が整い始めるヒント',
      topHeadline: ai.topHeadline.trim(),
      slides6: ai.slides6,
      captionLead: ai.captionLead.trim(),
      hashtags: sanitizeHashtags(ai.hashtags, settings),
      source: 'ai'
    }
  }

  // OpenAI未設定・失敗・タイムアウト・禁止表現ヒットのいずれかの場合のみローカルへフォールバック
  return localCore(theme, history, seed, settings)
}


function buildThemeTestimonialBlock(theme: Theme): string {
  const blocks: Record<Theme, string[]> = {
    健康: [
      '―――🗣よくある相談―――',
      '',
      '✔ 睡眠は足りているのにだるい',
      '✔ 食事や運動を整えても続かない',
      '✔ 不調の原因がどこにあるか分からない'
    ],
    お金: [
      '―――🗣よくある相談―――',
      '',
      '✔ 収入を増やしても不安が消えない',
      '✔ お金のことを考えると焦る',
      '✔ 何から整えれば流れが変わるか分からない'
    ],
    人間関係: [
      '―――🗣よくある相談―――',
      '',
      '✔ 人と会うと疲れてしまう',
      '✔ 本音を言えずに合わせてしまう',
      '✔ 大切な人ほど距離感が分からない'
    ],
    使命: [
      '―――🗣よくある相談―――',
      '',
      '✔ 本当にやりたいことが分からない',
      '✔ 今の選択に自信が持てない',
      '✔ 使命や役割の感覚がつかめない'
    ],
    ご縁: [
      '―――🗣よくある相談―――',
      '',
      '✔ 良い出会いが続かない',
      '✔ 合う人とだけ深くつながりたい',
      '✔ 無理せず自然にご縁を育てたい'
    ],
    瞑想: [
      '―――🗣よくある相談―――',
      '',
      '✔ 瞑想しても頭が静まらない',
      '✔ 心がざわついて落ち着かない',
      '✔ 自分の状態を整える感覚が分からない'
    ],
    無料診断: [
      '―――🗣よくある相談―――',
      '',
      '✔ 何から整えればいいか分からない',
      '✔ 自分では整えどころに気づけない',
      '✔ 客観的に今の状態を見てほしい'
    ]
  }
  return blocks[theme].join('\n')
}

// 投稿欄本文(caption)を組み立てる。service/Present/profile/よくある相談は
// 設定画面で管理する固定ブロックをそのまま使い、AIの出力ゆれで消えたり変わったりしないようにする。
function buildCaption(captionLead: string, settings: AppSettings, hashtags: string[], seed: number, theme: Theme): string {
  const closing = captionClosingLines[seed % captionClosingLines.length]
  const parts = [
    captionLead,
    '',
    buildThemeTestimonialBlock(theme),
    '',
    settings.serviceBlock,
    '',
    settings.presentBlock,
    '',
    settings.profileBlock,
    '',
    `公式LINE：${settings.lineUrl}`,
    '',
    closing,
    '',
    hashtags.map((h) => `#${h}`).join(' ')
  ]
  return parts.join('\n')
}

function buildSlides(core: CoreResult, seed: number): Slide[] {
  const cta = ctaHeadlines[seed % ctaHeadlines.length]
  const roles: { label: string }[] = []
  const slides: Slide[] = []

  slides.push({ index: 1, role: 'TOP', headline: core.topHeadline, subheadline: core.topSub })

  const middleRoles: Slide['role'][] = ['問題提起', '相談', '見立て', '具体例', '気づき', '行動提案']
  core.slides6.forEach((s, i) => {
    slides.push({
      index: i + 2,
      role: middleRoles[i],
      label: middleRoles[i],
      mainText: s.mainText,
      highlights: s.highlights,
      bullets: s.bullets
    })
  })

  slides.push({ index: 8, role: 'CTA', headline: cta.headline, subheadline: cta.subheadline })
  return slides
}

export interface PlannedPost {
  dayIndex: number
  postIndex: number
  theme: Theme
  postTitle: string
  slides: Slide[]
  caption: string
  captionLead: string
  hashtags: string[]
  source: 'ai' | 'local'
}

export async function buildDayPosts(
  dayIndex: number,
  themes: Theme[],
  history: HistoryEntry[],
  settings: AppSettings,
  seedBase: number,
  memo?: string
): Promise<PlannedPost[]> {
  const posts: PlannedPost[] = []
  const workingHistory: HistoryEntry[] = [...history]

  for (let i = 0; i < themes.length; i++) {
    const theme = themes[i]
    const seed = seedBase + i + 1
    const core = await generateCore(theme, workingHistory, settings, seed, memo)
    const slides = buildSlides(core, seed)
    const hashtags = core.hashtags
    const caption = buildCaption(core.captionLead, settings, hashtags, seed, theme)

    posts.push({
      dayIndex,
      postIndex: i + 1,
      theme,
      postTitle: core.postTitle,
      slides,
      caption,
      captionLead: core.captionLead,
      hashtags,
      source: core.source
    })

    workingHistory.push({
      id: `tmp-${dayIndex}-${i + 1}`,
      createdAt: new Date().toISOString(),
      printDate: '',
      printRun: 0,
      dayIndex,
      postIndex: i + 1,
      theme,
      postTitle: core.postTitle,
      topHeadline: core.topHeadline,
      captionLead: core.captionLead,
      entryType: 'generated',
      source: core.source
    })
  }

  return posts
}

// 個別投稿の再生成: 同じテーマで、AIをまず試し、失敗時のみローカルの未使用パターンを選び直す
export async function regenerateSinglePost(
  theme: Theme,
  history: HistoryEntry[],
  settings: AppSettings,
  seed: number,
  memo?: string
): Promise<{ postTitle: string; slides: Slide[]; caption: string; captionLead: string; hashtags: string[]; source: 'ai' | 'local' }> {
  const core = await generateCore(theme, history, settings, seed, memo)
  const slides = buildSlides(core, seed)
  const hashtags = core.hashtags
  const caption = buildCaption(core.captionLead, settings, hashtags, seed, theme)
  return { postTitle: core.postTitle, slides, caption, captionLead: core.captionLead, hashtags, source: core.source }
}

export function toCarouselPost(
  planned: PlannedPost,
  extra: { id: string; printDate: string; printRun: number; createdAt: string; regenerationCount: number }
): CarouselPost {
  return {
    id: extra.id,
    dayIndex: planned.dayIndex,
    postIndex: planned.postIndex,
    theme: planned.theme,
    postTitle: planned.postTitle,
    slides: planned.slides,
    caption: planned.caption,
    captionLead: planned.captionLead,
    hashtags: planned.hashtags,
    regenerationCount: extra.regenerationCount,
    createdAt: extra.createdAt,
    printDate: extra.printDate,
    printRun: extra.printRun,
    source: planned.source
  }
}
