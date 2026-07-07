// 1日分=5投稿(カルーセル)を組み立てるロジック。
//
// 生成フロー(投稿ごと):
//   1. まずOpenAI API(Netlify Functions経由・Responses API)で
//      TOP見出し／中ページ6枚分の中身／投稿欄本文の冒頭／ハッシュタグ候補 を生成する
//   2. 失敗時・未設定時・禁止表現ヒット時のみ、ローカルフレーズバンク(contentBank.ts)にフォールバックする
//   3. CTAスライドの文言・service/Present/profile/よくある相談ブロック・公式LINEのURL・
//      ハッシュタグの最終形は、リンク誤りや素材差し替えの反映漏れを防ぐため常にアプリ側(この
//      ファイル)で確定させる(【5. 投稿欄本文構成】の固定ブロックは設定画面の値をそのまま使う)。
//
// 重複回避はTOP見出し/投稿欄冒頭に加え、中ページ本文（特に問題提起）まで履歴照合して実現する。

import { ALL_THEMES, AppSettings, CarouselPost, HistoryEntry, Slide, Theme } from '../types'
import { captionClosingLines, getPostBank, PostVariant } from './contentBank'
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

// 1日5投稿は時間帯ごとにテーマを固定し、露出機会と内容の重複回避を両立させる。
// テーマ指定がある場合も、そのテーマを起点に関連テーマへ広げる（5本とも同テーマにはしない）。
export const dailyPostingSlots: { time: string; theme: Theme; intent: string }[] = [
  { time: '06:30', theme: '健康', intent: '朝の体調・状態を整える入口' },
  { time: '09:30', theme: '人間関係', intent: '人と会う前の心構え・関係性の見直し' },
  { time: '12:30', theme: 'お金', intent: '仕事・お金・現実面の整えどころ' },
  { time: '18:30', theme: 'ご縁', intent: '仕事終わりのご縁・コミュニティ・出会い' },
  { time: '21:00', theme: '使命', intent: '夜の内省・使命・覚醒・診断導線' }
]

const companionThemes: Record<Theme, Theme[]> = {
  健康: ['健康', '人間関係', 'お金', 'ご縁', '使命'],
  お金: ['お金', '健康', '人間関係', 'ご縁', '使命'],
  人間関係: ['人間関係', '健康', 'お金', 'ご縁', '使命'],
  使命: ['使命', '健康', '人間関係', 'お金', 'ご縁'],
  ご縁: ['ご縁', '人間関係', '健康', 'お金', '使命'],
  瞑想: ['瞑想', '健康', '人間関係', 'ご縁', '使命'],
  無料診断: ['健康', '人間関係', 'お金', 'ご縁', '無料診断']
}

const autoThemeRotations: Theme[][] = [
  ['健康', '人間関係', 'お金', 'ご縁', '使命'],
  ['健康', '人間関係', 'お金', 'ご縁', '瞑想'],
  ['健康', '人間関係', 'お金', 'ご縁', '無料診断']
]

export function planThemesForDay(dayIndex: number, userTheme: Theme | 'auto', postsPerDay: number, memo: string, seed: number): Theme[] {
  const normalizedPostsPerDay = Math.max(1, postsPerDay)

  if (userTheme !== 'auto') {
    const base = companionThemes[userTheme] || autoThemeRotations[0]
    return base.slice(0, normalizedPostsPerDay)
  }

  const hitTheme = ALL_THEMES.find((t) => themeKeywords[t].some((kw) => memo.includes(kw)))
  if (hitTheme) return companionThemes[hitTheme].slice(0, normalizedPostsPerDay)

  const rotationPreset = autoThemeRotations[(dayIndex - 1) % autoThemeRotations.length]
  if (normalizedPostsPerDay <= rotationPreset.length) return rotationPreset.slice(0, normalizedPostsPerDay)

  const rotation = shuffle(ALL_THEMES, seed + dayIndex * 97)
  const themes: Theme[] = [...rotationPreset]
  let i = 0
  while (themes.length < normalizedPostsPerDay) {
    const candidate = rotation[i % rotation.length]
    if (!themes.includes(candidate)) themes.push(candidate)
    i++
    if (i > rotation.length * 5) break
  }
  while (themes.length < normalizedPostsPerDay) themes.push(rotation[themes.length % rotation.length])
  return themes.slice(0, normalizedPostsPerDay)
}

function publishTimeForPost(postIndex: number): string {
  return dailyPostingSlots[postIndex - 1]?.time || ''
}

const MIDDLE_ROLES: Slide['role'][] = ['問題提起', '相談', '見立て', '具体例', '気づき', '行動提案']

function normalizeForFingerprint(text: string): string {
  return (text || '')
    .replace(/\s+/g, '')
    .replace(/[、。,.，．！？!?\-ー—―「」『』（）()【】［］\[\]・✔●○\u3000]/g, '')
    .trim()
}

function slideFingerprint(role: string | undefined, text: string): string {
  return `${role || '本文'}:${normalizeForFingerprint(text)}`
}

function fingerprintsFromSlides6(slides: Pick<Slide, 'label' | 'mainText' | 'highlights' | 'bullets'>[]): string[] {
  return slides.map((s, i) => slideFingerprint(MIDDLE_ROLES[i] || s.label || '本文', s.mainText || '')).filter((s) => s.length > 0)
}

function slideMainTextsFromSlides6(slides: Pick<Slide, 'label' | 'mainText' | 'highlights' | 'bullets'>[]): string[] {
  return slides.map((s) => (s.mainText || '').trim()).filter(Boolean)
}

function isSlideFingerprintUsed(history: HistoryEntry[], fingerprint: string): boolean {
  if (!fingerprint) return false
  return history.some((h) => {
    if (h.problemFingerprint === fingerprint) return true
    return Array.isArray(h.slideFingerprints) && h.slideFingerprints.includes(fingerprint)
  })
}

function hasUsedSlides(history: HistoryEntry[], slides: Pick<Slide, 'label' | 'mainText' | 'highlights' | 'bullets'>[]): boolean {
  return fingerprintsFromSlides6(slides).some((fp) => isSlideFingerprintUsed(history, fp))
}

function hasDuplicateSlideTextsWithinPost(slides: Pick<Slide, 'label' | 'mainText' | 'highlights' | 'bullets'>[]): boolean {
  const fps = fingerprintsFromSlides6(slides)
  return new Set(fps).size !== fps.length
}

function collectAvoidSlideTexts(history: HistoryEntry[]): string[] {
  const texts = history.flatMap((h) => Array.isArray(h.slideMainTexts) ? h.slideMainTexts : [])
  return Array.from(new Set(texts.filter(Boolean))).slice(-160)
}

const duplicateRewriteBank: Record<string, string[]> = {
  問題提起: [
    '今の違和感は、\n小さな整えどころを\n知らせているのかもしれません。',
    'うまくいかない時ほど、\n原因を一つに決めつけず\n全体を見直すことが大切です。',
    '同じ毎日の中にも、\n現実を軽くするヒントは\n静かに隠れています。',
    '頑張っているのに重い時は、\nやり方ではなく\n状態を見直すタイミングです。',
    '変えたい現実がある時ほど、\nまず今の自分の状態に\n目を向けてみてください。'
  ],
  相談: [
    'よくいただく\n相談です。',
    'こんな声を\nよく聞きます。',
    '一人で抱えやすい\n悩みです。',
    '実は多くの方が\nここで立ち止まります。'
  ],
  見立て: [
    '原因は一つではなく、\n心・体・現実のつながりに\n出ていることがあります。',
    '見えている問題の奥に、\nまだ整えられる場所が\n残っていることがあります。',
    '表面的な出来事より、\n今の状態の偏りを\n見ることが大切です。'
  ],
  具体例: [
    'たとえば、\n言葉の使い方や距離感が変わるだけで、\n受け取り方は変わります。',
    '小さな習慣を一つ変えるだけで、\n日々の感じ方が\n少し軽くなることがあります。',
    '見方が変わると、\n同じ出来事でも\n選べる行動が変わります。'
  ],
  気づき: [
    '大切なのは、\n無理に変えることではなく\n今の整えどころに気づくことです。',
    '答えを急がず、\nまずは今の状態を\n丁寧に見ていきましょう。',
    '変化は、\n自分を責めることではなく\n気づくことから始まります。'
  ],
  行動提案: [
    'まずは今日、\n気になった一つだけを\n静かに見直してみてください。',
    '今すぐ大きく変えなくて大丈夫です。\n小さな違和感を\n一つ拾うところから始めましょう。',
    '今日の内容を、\n自分の毎日に一つだけ\n当てはめてみてください。'
  ]
}

function makeDuplicateSlidesUnique(
  slides: Pick<Slide, 'label' | 'mainText' | 'highlights' | 'bullets'>[],
  history: HistoryEntry[],
  seed: number
): Pick<Slide, 'label' | 'mainText' | 'highlights' | 'bullets'>[] {
  const used = new Set<string>()
  history.forEach((h) => (h.slideFingerprints || []).forEach((fp) => used.add(fp)))

  return slides.map((s, i) => {
    const role = MIDDLE_ROLES[i] || s.label || '本文'
    let candidate = { ...s }
    let fp = slideFingerprint(role, candidate.mainText || '')
    if (!used.has(fp)) {
      used.add(fp)
      return candidate
    }

    const rewrites = duplicateRewriteBank[role] || duplicateRewriteBank.問題提起
    for (let offset = 0; offset < rewrites.length; offset++) {
      const text = rewrites[(seed + i + offset) % rewrites.length]
      const nextFp = slideFingerprint(role, text)
      if (!used.has(nextFp)) {
        used.add(nextFp)
        return { ...candidate, mainText: text, highlights: [], bullets: [] }
      }
    }

    // 最後の保険：完全一致だけは避ける。
    const fallback = `${candidate.mainText || ''}\n\n今回は、ここから見直してみてください。`
    used.add(slideFingerprint(role, fallback))
    return { ...candidate, mainText: fallback, highlights: [], bullets: [] }
  })
}


const themeCtaCopy: Record<Theme, { headline: string; subheadline: string }[]> = {
  健康: [
    { headline: '体だけでなく\n整えどころを\n見てみたい方へ', subheadline: 'ここまで読んだ上で、もう少し客観的に' },
    { headline: '今の不調を\n別の角度から\n見てみたい方へ', subheadline: '今日の内容を自分に置き換えるなら' }
  ],
  人間関係: [
    { headline: '人との関わりを\n一度整理したい方へ', subheadline: 'ここまで読んで、思い当たることがあれば' },
    { headline: '無理のない距離感を\n見つけたい方へ', subheadline: '自分の状態をもう少し丁寧に見るなら' }
  ],
  お金: [
    { headline: 'お金と現実の流れを\n整えたい方へ', subheadline: '焦る前に、今の整えどころを知る' },
    { headline: '不安の奥にある\n整えどころを\n見てみたい方へ', subheadline: '今日の内容を自分の現実に当てはめるなら' }
  ],
  ご縁: [
    { headline: 'ご縁の流れを\n整えたい方へ', subheadline: 'つながり方を一度見直したいなら' },
    { headline: '自然な出会い方を\n見つけたい方へ', subheadline: '今の自分の状態から整える' }
  ],
  使命: [
    { headline: '才能や使命のヒントを\n知りたい方へ', subheadline: '答えを急がず、今の状態を見てみる' },
    { headline: '自分の役割を\nもう少し知りたい方へ', subheadline: '今日の違和感を次の一歩に変えるなら' }
  ],
  瞑想: [
    { headline: '心の状態を\n静かに整えたい方へ', subheadline: 'ここまで読んで、少し立ち止まりたいなら' },
    { headline: '内側の声を\n見つめ直したい方へ', subheadline: '日々のざわつきを整える入口として' }
  ],
  無料診断: [
    { headline: '今の整えどころを\n客観的に\n見たい方へ', subheadline: '今日の内容を自分に当てはめるなら' },
    { headline: '何から整えるかを\n知りたい方へ', subheadline: 'まずは今の状態を確認するところから' }
  ]
}

function getThemeCta(theme: Theme, seed: number): { headline: string; subheadline: string } {
  const list = themeCtaCopy[theme] || themeCtaCopy.無料診断
  return list[seed % list.length]
}

function containsCtaCue(text: string): boolean {
  return /公式LINE|プロフィール|リンク|無料診断|人生の質向上チェック|登録|こちら/.test(text || '')
}

function completionActionSlide(theme: Theme): Pick<Slide, 'label' | 'mainText' | 'highlights' | 'bullets'> {
  const map: Record<Theme, Pick<Slide, 'label' | 'mainText' | 'highlights' | 'bullets'>> = {
    健康: {
      label: '今日の結論',
      mainText: '体の不調だけで\n判断せず、\n心や日々の選択も含めて\n見直してみてください。',
      highlights: ['見直して'],
      bullets: []
    },
    人間関係: {
      label: '今日の結論',
      mainText: '誰かを変える前に、\n自分がどこで無理をしているかを\n静かに見てみてください。',
      highlights: ['無理'],
      bullets: []
    },
    お金: {
      label: '今日の結論',
      mainText: '不安を消そうとする前に、\n今の現実の中で\n整えられる場所を\n見つけてみてください。',
      highlights: ['整えられる場所'],
      bullets: []
    },
    ご縁: {
      label: '今日の結論',
      mainText: 'ご縁は追いかけるより、\n自分の状態を整えた時に\n自然とつながりやすくなります。',
      highlights: ['自分の状態'],
      bullets: []
    },
    使命: {
      label: '今日の結論',
      mainText: '答えを急がなくても\n大丈夫です。\n違和感や惹かれる方向を\n丁寧に見てみてください。',
      highlights: ['惹かれる方向'],
      bullets: []
    },
    瞑想: {
      label: '今日の結論',
      mainText: '心を無理に静めようとせず、\n今の状態に気づくことから\n始めてみてください。',
      highlights: ['気づくこと'],
      bullets: []
    },
    無料診断: {
      label: '今日の結論',
      mainText: 'まずは自分を責めずに、\n今どこを整えると\n軽くなるのかを\n見てみてください。',
      highlights: ['どこを整える'],
      bullets: []
    }
  }
  return map[theme]
}

function sanitizeSlidesForSeparateCta(
  slides: Pick<Slide, 'label' | 'mainText' | 'highlights' | 'bullets'>[],
  theme: Theme
): Pick<Slide, 'label' | 'mainText' | 'highlights' | 'bullets'>[] {
  return slides.map((s, idx) => {
    const mainText = s.mainText || ''
    const bulletText = (s.bullets || []).join('\n')
    const mainAlreadyHasBullets = /(^|\n)\s*[・✔●①②③④⑤⑥⑦⑧⑨]|(^|\n)\s*\d+[\.．]/.test(mainText)

    if (idx === 5 && containsCtaCue(`${mainText}\n${bulletText}`)) {
      return completionActionSlide(theme)
    }

    return {
      ...s,
      bullets: mainAlreadyHasBullets ? [] : (s.bullets || []).slice(0, 3)
    }
  })
}


function isUsed(history: HistoryEntry[], field: 'topHeadline' | 'captionLead', value: string, windowSize = 60): boolean {
  const recent = history.slice(-windowSize)
  return recent.some((h) => h[field] === value)
}

function pickUnusedVariant(variants: PostVariant[], history: HistoryEntry[], seed: number): PostVariant {
  const shuffled = shuffle(variants, seed)
  const fresh = shuffled.find((v) => {
    const slides = sanitizeSlidesForSeparateCta(variantToSlides6(v), '健康')
    return !isUsed(history, 'topHeadline', v.topHeadline, Number.MAX_SAFE_INTEGER) &&
      !isUsed(history, 'captionLead', v.captionLead, Number.MAX_SAFE_INTEGER) &&
      !hasUsedSlides(history, slides)
  })
  return fresh ??
    shuffled.find((v) => !isUsed(history, 'topHeadline', v.topHeadline, Number.MAX_SAFE_INTEGER) && !hasUsedSlides(history, sanitizeSlidesForSeparateCta(variantToSlides6(v), '健康'))) ??
    shuffled[0]
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
  if (hasDuplicateSlideTextsWithinPost(slides)) return false
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
  const sanitized = sanitizeSlidesForSeparateCta(variantToSlides6(variant), theme)
  const uniqueSlides = makeDuplicateSlidesUnique(sanitized, history, seed)
  return {
    postTitle: variant.topHeadline.replace(/\n/g, ''),
    topSub: variant.topSub,
    topHeadline: variant.topHeadline,
    slides6: uniqueSlides,
    captionLead: variant.captionLead,
    hashtags: sanitizeHashtags(null, settings),
    source: 'local'
  }
}

async function generateCore(theme: Theme, history: HistoryEntry[], settings: AppSettings, seed: number, memo?: string): Promise<CoreResult> {
  const recent = history.slice(-120)
  const avoidHeadlines = Array.from(new Set(recent.map((h) => h.topHeadline))).slice(-40)
  const avoidLeads = Array.from(new Set(recent.map((h) => h.captionLead))).slice(-40)
  const avoidSlideTexts = collectAvoidSlideTexts(history)

  // AI生成は最大3回試す。過去スライド本文と一致したら採用しない。
  for (let attempt = 0; attempt < 3; attempt++) {
    const ai = await tryGenerateWithOpenAI({
      theme,
      memo,
      avoidHeadlines,
      avoidLeads,
      avoidSlideTexts,
      brand: { displayName: settings.displayName, title: settings.title, lineUrl: settings.lineUrl },
      forbiddenWords: settings.forbiddenWords,
      model: settings.openaiModel
    })

    const sanitizedSlides = ai ? sanitizeSlidesForSeparateCta(ai.slides6, theme) : []
    const aiValid =
      !!ai &&
      ai.topHeadline.trim().length > 0 &&
      isAcceptableTopHeadline(ai.topHeadline.trim()) &&
      !isUsed(history, 'topHeadline', ai.topHeadline.trim(), Number.MAX_SAFE_INTEGER) &&
      !isUsed(history, 'captionLead', (ai.captionLead || '').trim(), Number.MAX_SAFE_INTEGER) &&
      isAcceptableSlides(sanitizedSlides) &&
      !hasUsedSlides(history, sanitizedSlides) &&
      !containsForbidden(ai.topHeadline, settings.forbiddenWords) &&
      !sanitizedSlides.some((s) => containsForbidden(s.mainText || '', settings.forbiddenWords))

    if (aiValid && ai) {
      return {
        postTitle: ai.postTitle.trim() || ai.topHeadline.replace(/\n/g, ''),
        topSub: ai.topSub.trim() || '心と現実が整い始めるヒント',
        topHeadline: ai.topHeadline.trim(),
        slides6: sanitizedSlides,
        captionLead: ai.captionLead.trim(),
        hashtags: sanitizeHashtags(ai.hashtags, settings),
        source: 'ai'
      }
    }
  }

  // OpenAI未設定・失敗・重複ヒット時はローカルへフォールバック。
  // ローカル側でも完全一致は makeDuplicateSlidesUnique で強制的に避ける。
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

function buildSlides(core: CoreResult, seed: number, theme: Theme, postIndex: number): Slide[] {
  const cta = getThemeCta(theme, seed)
  const slides: Slide[] = []

  slides.push({ index: 1, role: 'TOP', headline: core.topHeadline, subheadline: core.topSub, themeLabel: theme, backgroundPostIndex: postIndex })

  core.slides6.forEach((s, i) => {
    slides.push({
      index: i + 2,
      role: MIDDLE_ROLES[i],
      label: MIDDLE_ROLES[i],
      mainText: s.mainText,
      highlights: s.highlights,
      bullets: s.bullets,
      themeLabel: theme, backgroundPostIndex: postIndex
    })
  })

  slides.push({ index: 8, role: 'CTA', headline: cta.headline, subheadline: cta.subheadline, themeLabel: theme, backgroundPostIndex: postIndex })
  return slides
}

export interface PlannedPost {
  dayIndex: number
  postIndex: number
  publishTime: string
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
    const slides = buildSlides(core, seed, theme, i + 1)
    const hashtags = core.hashtags
    const caption = buildCaption(core.captionLead, settings, hashtags, seed, theme)

    posts.push({
      dayIndex,
      postIndex: i + 1,
      publishTime: publishTimeForPost(i + 1),
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
      publishTime: publishTimeForPost(i + 1),
      theme,
      postTitle: core.postTitle,
      topHeadline: core.topHeadline,
      captionLead: core.captionLead,
      problemFingerprint: slideFingerprint('問題提起', core.slides6[0]?.mainText || ''),
      slideFingerprints: fingerprintsFromSlides6(core.slides6),
      slideMainTexts: slideMainTextsFromSlides6(core.slides6),
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
  const slides = buildSlides(core, seed, theme, 1)
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
    publishTime: planned.publishTime,
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
