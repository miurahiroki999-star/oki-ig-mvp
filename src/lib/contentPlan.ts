// 1日分の投稿(フィード3本+ストーリーズ5本)を組み立てるロジック。
//
// 生成フロー(各投稿ごと):
//   1. まずOpenAI API(Netlify Functions経由・Responses API)で title/body/approach/claim を生成する
//   2. 失敗時・未設定時・禁止表現ヒット時のみ、ローカルフレーズバンク(contentBank.ts)にフォールバックする
//   3. CTA文言・公式LINEのURL・ハッシュタグは、リンク誤りを防ぐため常にアプリ側で確定させる
//      (AIが生成したhashtagsは一定数以上の妥当な候補があれば採用し、そうでなければ設定の基本ハッシュタグを使う)
//
// 重複回避は「履歴内の直近使用タイトル/切り口/主張」を避けることで実現する。
// ここでの履歴(HistoryEntry[])には、一括生成分(generated)・再生成分(regenerated)・
// 手動編集分(edited)のすべてが上書きされずに追加保存されている前提で、常に全件を参照する。

import { ALL_THEMES, FeedRole, GeneratedPost, HistoryEntry, PostKind, StoryRole, Theme, AppSettings } from '../types'
import {
  ctaPhrasesDirect,
  ctaPhrasesProfile,
  closingLines,
  getFeedBank,
  getStoryBank,
  leadConnectors,
  FeedVariant,
  StoryVariant
} from './contentBank'
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

// 任意メモからテーマの重みづけを行う簡易ルールベース解析
const themeKeywords: Record<Theme, string[]> = {
  人間関係: ['人間関係', '人付き合い', '対人'],
  健康: ['健康', '体調', '身体'],
  お金: ['お金', '収入', '資金'],
  使命: ['使命', '天職', '役割'],
  ご縁: ['ご縁', '縁', '出会い'],
  瞑想: ['瞑想', 'マインドフルネス'],
  無料診断: ['診断', 'チェック', '無料診断']
}

export function planThemesForDays(days: number, memo: string, batchSeed: number): Theme[] {
  const weighted: Theme[] = []
  ALL_THEMES.forEach((t) => {
    const hit = themeKeywords[t].some((kw) => memo.includes(kw))
    weighted.push(t)
    if (hit) weighted.push(t, t) // メモで言及されたテーマは出現しやすくする
  })
  const rotation = shuffle(weighted, batchSeed)
  const themes: Theme[] = []
  let i = 0
  while (themes.length < days) {
    const candidate = rotation[i % rotation.length]
    // 直前と全く同じテーマが連続しすぎないよう軽く調整（メモ強調時は許容）
    if (themes.length === 0 || themes[themes.length - 1] !== candidate || days <= ALL_THEMES.length) {
      themes.push(candidate)
    }
    i++
    if (i > rotation.length * 5) {
      themes.push(candidate) // フォールバック
    }
  }
  return themes.slice(0, days)
}

function isUsed(history: HistoryEntry[], field: 'title' | 'approach' | 'claim', value: string, windowSize = 60): boolean {
  const recent = history.slice(-windowSize)
  return recent.some((h) => h[field] === value)
}

function pickUnusedVariant<T extends { title: string; approach: string; claim: string }>(
  variants: T[],
  history: HistoryEntry[],
  seed: number
): T {
  const shuffled = shuffle(variants, seed)
  // 重複回避では、生成済み・再生成済み・編集済みのすべてを含む履歴(history)全体を参照する
  const fresh = shuffled.find((v) => !isUsed(history, 'title', v.title) && !isUsed(history, 'approach', v.approach))
  return fresh ?? shuffled[0]
}

function buildHashtags(settings: AppSettings): string[] {
  const base = settings.baseHashtags.length > 0 ? settings.baseHashtags : []
  const count = Math.min(15, Math.max(8, base.length))
  return base.slice(0, count)
}

function containsForbidden(text: string, forbiddenWords: string[]): boolean {
  if (!text) return false
  return forbiddenWords.some((w) => w && text.includes(w))
}

// AIが返したハッシュタグ候補を軽くサニタイズする。妥当な候補が少なすぎる場合は
// 設定側の基本ハッシュタグセットにフォールバックし、タグの一貫性を保つ。
function sanitizeAiHashtags(tags: string[], settings: AppSettings): string[] {
  const cleaned = (tags || [])
    .map((t) => t.replace(/^#/, '').trim())
    .filter((t) => t.length > 0 && t.length <= 24 && !t.includes(' '))
  const unique = Array.from(new Set(cleaned))
  if (unique.length >= 5) return unique.slice(0, 15)
  return buildHashtags(settings)
}

type BankKey = 'feedProblem' | 'feedEducation' | 'feedTrust' | 'storyProblem' | 'storyEducation' | 'storyDaily' | 'storyTrust'

interface RoleDef {
  kind: PostKind
  role: FeedRole | StoryRole
  bankKey: BankKey | null // null = LINE診断誘導(固定文言ロール)
  ctaStyle: 'profileLink' | 'directLink' | 'lineLink' | 'none'
}

// 1日分の8投稿の並び順そのままの定義。buildDayPostsと個別再生成(regenerateSingleContent)の両方で共有する。
const ROLE_DEFS: RoleDef[] = [
  { kind: 'フィード', role: '問題提起', bankKey: 'feedProblem', ctaStyle: 'profileLink' },
  { kind: 'フィード', role: '教育気づき', bankKey: 'feedEducation', ctaStyle: 'profileLink' },
  { kind: 'フィード', role: '信頼形成導線', bankKey: 'feedTrust', ctaStyle: 'directLink' },
  { kind: 'ストーリーズ', role: '問題提起', bankKey: 'storyProblem', ctaStyle: 'none' },
  { kind: 'ストーリーズ', role: '教育気づき', bankKey: 'storyEducation', ctaStyle: 'none' },
  { kind: 'ストーリーズ', role: '日常人柄', bankKey: 'storyDaily', ctaStyle: 'none' },
  { kind: 'ストーリーズ', role: '信頼形成', bankKey: 'storyTrust', ctaStyle: 'none' },
  { kind: 'ストーリーズ', role: 'LINE診断誘導', bankKey: null, ctaStyle: 'lineLink' }
]

interface CoreContent {
  title: string
  approach: string
  claim: string
  message: string // CTA・ハッシュタグを含まない本文の中身のみ
}

export interface ContentResult {
  title: string
  body: string
  approach: string
  claim: string
  cta: string
  hashtags: string[]
  source: 'ai' | 'local'
}

// ローカルフレーズバンクから core content(本文の中身のみ)を組み立てる
// フィードは「冒頭→悩み描写→原因→接続→思想→安心→警鐘→自己認識の重要性」の
// 山添TTP長文構成になるよう、段落ごとに空行を入れて組み立てる(900〜1,600文字目安)。
function localCore(roleDef: RoleDef, theme: Theme, history: HistoryEntry[], seed: number): CoreContent {
  if (roleDef.bankKey === null) {
    return { title: '人生の質向上チェック', approach: 'LINE誘導固定', claim: 'LINE診断誘導', message: '' }
  }
  if (roleDef.kind === 'フィード') {
    const variant: FeedVariant = pickUnusedVariant(getFeedBank(theme, roleDef.bankKey as any), history, seed)
    const lead = leadConnectors[seed % leadConnectors.length]
    const message = [
      `${lead}${variant.lead}`,
      variant.worryScene,
      variant.whyItHappens,
      variant.connect,
      variant.philosophy,
      variant.reassurance,
      variant.warning,
      variant.selfAwareness
    ].join('\n\n')
    return { title: variant.title, approach: variant.approach, claim: variant.claim, message }
  }
  const variant: StoryVariant = pickUnusedVariant(getStoryBank(theme, roleDef.bankKey as any), history, seed)
  return { title: variant.title, approach: variant.approach, claim: variant.claim, message: variant.text }
}

// core content(AI由来 or ローカル由来)から、CTA・ハッシュタグ・締めの一文を付与して最終形にする。
// CTAとURLは常にこの関数がアプリ側で確定させるため、AIの出力ゆれによってリンクが壊れることはない。
function finalizeContent(
  roleDef: RoleDef,
  core: CoreContent,
  aiHashtags: string[] | null,
  settings: AppSettings,
  seed: number,
  source: 'ai' | 'local'
): ContentResult {
  if (roleDef.bankKey === null) {
    // LINE診断誘導は文言のブレを避けるため常にローカル固定文言を使う(URLの正確性を最優先)
    const variants = [
      `今の自分の整えどころを知りたい方へ。\n公式LINEから「人生の質向上チェック」ができます。\n${settings.lineUrl}`,
      `まずは自分の状態を知ることから。\n公式LINEはこちらです。\n${settings.lineUrl}`,
      `気になる方は、公式LINEの「人生の質向上チェック」をご覧ください。\n${settings.lineUrl}`
    ]
    const body = variants[seed % variants.length]
    return { title: '人生の質向上チェック', body, approach: 'LINE誘導固定', claim: 'LINE診断誘導', cta: settings.lineUrl, hashtags: [], source: 'local' }
  }

  let cta = ''
  if (roleDef.ctaStyle === 'profileLink') {
    cta = ctaPhrasesProfile[seed % ctaPhrasesProfile.length]
  } else if (roleDef.ctaStyle === 'directLink') {
    const list = ctaPhrasesDirect(settings.lineUrl)
    cta = list[seed % list.length]
  }

  if (roleDef.kind === 'ストーリーズ') {
    return { title: core.title, body: core.message, approach: core.approach, claim: core.claim, cta, hashtags: [], source }
  }

  const hashtags = aiHashtags ? sanitizeAiHashtags(aiHashtags, settings) : buildHashtags(settings)
  const bodyParts = [core.message, '']
  if (cta) bodyParts.push(cta)
  bodyParts.push(closingLines[seed % closingLines.length], '', hashtags.map((h) => `#${h}`).join(' '))
  const body = bodyParts.join('\n')
  return { title: core.title, body, approach: core.approach, claim: core.claim, cta, hashtags, source }
}

// 1投稿分のコンテンツ生成。AIをまず試し、失敗時のみローカルにフォールバックする。
async function generateRoleContent(
  roleDef: RoleDef,
  theme: Theme,
  history: HistoryEntry[],
  settings: AppSettings,
  seed: number,
  memo?: string
): Promise<ContentResult> {
  if (roleDef.bankKey === null) {
    // LINE診断誘導は常にローカル固定(前述の通りURL正確性を最優先するため)
    return finalizeContent(roleDef, localCore(roleDef, theme, history, seed), null, settings, seed, 'local')
  }

  // 重複回避用の避けたいリストは、生成済み・再生成済み・編集済みを含む履歴全体から作る
  const recent = history.slice(-80)
  const avoid = {
    titles: Array.from(new Set(recent.map((h) => h.title))).slice(-30),
    approaches: Array.from(new Set(recent.map((h) => h.approach))).slice(-30),
    claims: Array.from(new Set(recent.map((h) => h.claim))).slice(-30),
    ctas: Array.from(new Set(recent.map((h) => h.cta).filter(Boolean))).slice(-30)
  }

  const ai = await tryGenerateWithOpenAI({
    kind: roleDef.kind,
    role: roleDef.role,
    theme,
    memo,
    avoid,
    brand: { displayName: settings.displayName, title: settings.title, lineUrl: settings.lineUrl },
    forbiddenWords: settings.forbiddenWords,
    model: settings.openaiModel
  })

  const aiValid =
    !!ai &&
    ai.title.trim().length > 0 &&
    ai.body.trim().length > 0 &&
    !containsForbidden(ai.title, settings.forbiddenWords) &&
    !containsForbidden(ai.body, settings.forbiddenWords)

  if (aiValid && ai) {
    const core: CoreContent = {
      title: ai.title.trim(),
      approach: ai.approach.trim() || `${theme}_AI生成`,
      claim: ai.claim.trim() || ai.title.trim(),
      message: ai.body.trim()
    }
    return finalizeContent(roleDef, core, ai.hashtags, settings, seed, 'ai')
  }

  // OpenAI未設定・失敗・タイムアウト・禁止表現ヒットのいずれかの場合のみ、ローカルフレーズバンクへフォールバック
  const core = localCore(roleDef, theme, history, seed)
  return finalizeContent(roleDef, core, null, settings, seed, 'local')
}

export interface PlannedDay {
  dayIndex: number
  theme: Theme
  posts: Omit<GeneratedPost, 'id' | 'templateId' | 'imageDataUrl' | 'createdAt' | 'printDate' | 'printRun'>[]
}

// 個別再生成: 指定投稿と同じ役割で、AIをまず試し、失敗時のみローカルの未使用タイトル/切り口を選び直す
export async function regenerateSingleContent(
  kind: PostKind,
  role: FeedRole | StoryRole,
  theme: Theme,
  history: HistoryEntry[],
  settings: AppSettings,
  seed: number,
  memo?: string
): Promise<ContentResult> {
  const roleDef = ROLE_DEFS.find((r) => r.kind === kind && r.role === role)
  if (!roleDef) {
    // 想定外の役割が来た場合の保険(通常は発生しない)
    const fallbackDef: RoleDef = { kind, role, bankKey: kind === 'フィード' ? 'feedProblem' : 'storyProblem', ctaStyle: 'none' }
    return generateRoleContent(fallbackDef, theme, history, settings, seed, memo)
  }
  return generateRoleContent(roleDef, theme, history, settings, seed, memo)
}

export async function buildDayPosts(
  dayIndex: number,
  theme: Theme,
  history: HistoryEntry[],
  settings: AppSettings,
  seedBase: number,
  memo?: string
): Promise<PlannedDay> {
  const posts: PlannedDay['posts'] = []
  let feedOrder = 0
  let storyOrder = 0
  // 同一バッチ内で直後に生成する投稿同士も重複回避の対象にするため、生成のたびに仮履歴として積み増す
  const workingHistory: HistoryEntry[] = [...history]

  for (let i = 0; i < ROLE_DEFS.length; i++) {
    const roleDef = ROLE_DEFS[i]
    const seed = seedBase + i + 1
    const result = await generateRoleContent(roleDef, theme, workingHistory, settings, seed, memo)
    const orderIndex = roleDef.kind === 'フィード' ? ++feedOrder : ++storyOrder

    posts.push({
      dayIndex,
      orderIndex,
      kind: roleDef.kind,
      role: roleDef.role,
      theme,
      title: result.title,
      body: result.body,
      approach: result.approach,
      claim: result.claim,
      cta: result.cta,
      hashtags: result.hashtags,
      regenerationCount: 0,
      source: result.source
    } as Omit<GeneratedPost, 'id' | 'templateId' | 'imageDataUrl' | 'createdAt' | 'printDate' | 'printRun'>)

    workingHistory.push({
      id: `tmp-${dayIndex}-${orderIndex}-${roleDef.kind}`,
      createdAt: new Date().toISOString(),
      printDate: '',
      printRun: 0,
      dayIndex,
      orderIndex,
      kind: roleDef.kind,
      theme,
      role: roleDef.role,
      title: result.title,
      body: result.body,
      approach: result.approach,
      claim: result.claim,
      cta: result.cta,
      hashtags: result.hashtags,
      templateId: '',
      regenerationCount: 0,
      entryType: 'generated',
      source: result.source
    })
  }

  return { dayIndex, theme, posts }
}
