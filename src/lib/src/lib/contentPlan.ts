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

// テーマ指定がある場合はその日の3投稿すべてを同テーマに、無指定の場合は自動配分する
export function planThemesForDay(dayIndex: number, userTheme: Theme | 'auto', postsPerDay: number, memo: string, seed: number): Theme[] {
  if (userTheme !== 'auto') {
    return new Array(postsPerDay).fill(userTheme)
  }
  const weighted: Theme[] = []
  ALL_THEMES.forEach((t) => {
    const hit = themeKeywords[t].some((kw) => memo.includes(kw))
    weighted.push(t)
    if (hit) weighted.push(t, t)
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
  const fresh = shuffled.find((v) => !isUsed(history, 'topHeadline', v.topHeadline))
  return fresh ?? shuffled[0]
}

function containsForbidden(text: string, forbiddenWords: string[]): boolean {
  if (!text) return false
  return forbiddenWords.some((w) => w && text.includes(w))
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
    ai.slides6.length === 6 &&
    ai.slides6.every((s) => (s.mainText || '').trim().length > 0) &&
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

// 投稿欄本文(caption)を組み立てる。service/Present/profile/よくある相談は
// 設定画面で管理する固定ブロックをそのまま使い、AIの出力ゆれで消えたり変わったりしないようにする。
function buildCaption(captionLead: string, settings: AppSettings, hashtags: string[], seed: number): string {
  const closing = captionClosingLines[seed % captionClosingLines.length]
  const parts = [
    captionLead,
    '',
    settings.testimonialBlock,
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
      label: s.label,
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
    const caption = buildCaption(core.captionLead, settings, hashtags, seed)

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
  const caption = buildCaption(core.captionLead, settings, hashtags, seed)
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
