// NOTE記事下書き・Threads下書きの組み立てロジック。
//
// ネタ元は「同じ日のInstagram5投稿のうち1テーマ」(NOTE用の別ローテーションは組まない)。
// 生成フローはカルーセル投稿(contentPlan.ts)と同じ考え方:
//   1. まずOpenAI API(Netlify Functions経由)でNOTE本文＋Threads3パターン分をまとめて生成する
//   2. 失敗時・未設定時・重複時のみローカルフレーズバンク(noteThreadsBank.ts)にフォールバックする
//   3. CTA文・公式LINEのURL・ハッシュタグの最終形は、リンク誤りや素材差し替えの反映漏れを防ぐため
//      常にアプリ側(このファイル)で確定させる

import { AppSettings, CarouselPost, GenerationBatch, NoteDraft, NoteSection, NoteThreadsHistoryEntry, Theme, ThreadsDraft, ThreadsPatternKey } from '../types'
import { noteThreadsBank } from './noteThreadsBank'
import { tryGenerateNoteThreadsWithOpenAI } from './noteThreadsOpenai'

export interface SourceSelection {
  theme: Theme
  postTitle: string
  angleLabel?: string
  angleInstruction?: string
}

// その日のInstagram投稿バッチから、ネタ元候補(5投稿ぶん)を取り出す。
export function pickTodaySourceOptions(batches: GenerationBatch[], todayDate: string): SourceSelection[] {
  const todayBatches = batches.filter((b) => b.printDate === todayDate)
  if (todayBatches.length === 0) return []
  const latest = todayBatches.reduce((a, b) => (a.printRun > b.printRun ? a : b))
  return [...latest.posts]
    .sort((a, b) => a.postIndex - b.postIndex)
    .map((p: CarouselPost) => ({
      theme: p.theme,
      postTitle: p.postTitle,
      angleLabel: p.angleLabel,
      angleInstruction: p.angleInstruction
    }))
}

function normalizeForFingerprint(text: string): string {
  return (text || '')
    .replace(/\s+/g, '')
    .replace(/[、。,.，．！？!?\-ー—―「」『』（）()【】［］\[\]・✔●○　]/g, '')
    .trim()
}

function fingerprint(text: string): string {
  return normalizeForFingerprint(text)
}

function isExactUsed(history: NoteThreadsHistoryEntry[], field: 'noteTitle' | 'noteLead', value: string): boolean {
  if (!value) return false
  return history.some((h) => h[field] === value)
}

function isThreadsBodyUsed(history: NoteThreadsHistoryEntry[], body: string): boolean {
  const fp = fingerprint(body)
  if (!fp) return false
  return history.some((h) => h.threadsBodyFingerprint === fp)
}

export interface NoteThreadsCoreResult {
  noteTitle: string
  noteLead: string
  noteSections: NoteSection[]
  noteSummary: string
  threadsLinkShareLine: string
  threadsAssertiveBody: string
  threadsMantraHeading: string
  threadsMantraLines: string[]
  source: 'ai' | 'local'
}

function localCore(theme: Theme, history: NoteThreadsHistoryEntry[]): NoteThreadsCoreResult {
  const variant = noteThreadsBank[theme]
  const titleUsed = isExactUsed(history, 'noteTitle', variant.noteTitle)
  if (!titleUsed) {
    return { ...variant, source: 'local' }
  }
  // ローカルバンクはテーマごとに1バリエーションのみのため、同日再生成で重複した場合は
  // 差分が分かるよう軽い言い回しを足す(OpenAI未設定時の保険機能としての最低限の対応)。
  return {
    noteTitle: `${variant.noteTitle}（別の視点から）`,
    noteLead: `${variant.noteLead}\n\n今回は、少し違う角度から見てみます。`,
    noteSections: variant.noteSections,
    noteSummary: variant.noteSummary,
    threadsLinkShareLine: variant.threadsLinkShareLine,
    threadsAssertiveBody: variant.threadsAssertiveBody,
    threadsMantraHeading: variant.threadsMantraHeading,
    threadsMantraLines: variant.threadsMantraLines,
    source: 'local'
  }
}

export async function generateNoteThreadsCore(
  source: SourceSelection,
  settings: AppSettings,
  history: NoteThreadsHistoryEntry[],
  memo?: string
): Promise<NoteThreadsCoreResult> {
  const recent = history.slice(-80)
  const avoidNoteTitles = Array.from(new Set(recent.map((h) => h.noteTitle).filter(Boolean) as string[])).slice(-30)
  const avoidNoteLeads = Array.from(new Set(recent.map((h) => h.noteLead).filter(Boolean) as string[])).slice(-30)
  const avoidThreadsBodies = Array.from(new Set(recent.map((h) => h.threadsBody).filter(Boolean) as string[])).slice(-30)

  for (let attempt = 0; attempt < 3; attempt++) {
    const ai = await tryGenerateNoteThreadsWithOpenAI({
      theme: source.theme,
      sourcePostTitle: source.postTitle,
      sourceAngleLabel: source.angleLabel,
      sourceAngleInstruction: source.angleInstruction,
      memo,
      avoidNoteTitles,
      avoidNoteLeads,
      avoidThreadsBodies,
      brand: { displayName: settings.displayName, title: settings.title },
      forbiddenWords: settings.forbiddenWords,
      model: settings.openaiModel
    })

    if (!ai) continue

    const forbiddenHit =
      containsForbidden(ai.noteTitle, settings.forbiddenWords) ||
      ai.noteSections.some((s) => containsForbidden(s.body, settings.forbiddenWords)) ||
      containsForbidden(ai.threadsAssertiveBody, settings.forbiddenWords)

    const duplicated =
      isExactUsed(history, 'noteTitle', ai.noteTitle) ||
      isExactUsed(history, 'noteLead', ai.noteLead) ||
      isThreadsBodyUsed(history, ai.threadsAssertiveBody)

    if (!forbiddenHit && !duplicated && ai.noteTitle.trim() && ai.noteSections.length >= 3) {
      return { ...ai, source: 'ai' }
    }
  }

  // AIが未使用の内容を作れない場合だけローカルへ落とす。
  return localCore(source.theme, history)
}

function containsForbidden(text: string, forbiddenWords: string[]): boolean {
  if (!text) return false
  return forbiddenWords.some((w) => w && text.includes(w))
}

// ---------- NOTE組み立て ----------

function buildNoteHashtags(theme: Theme, settings: AppSettings): string[] {
  const fixed = settings.noteFixedHashtags.filter(Boolean)
  const themeTag = theme === '無料診断' ? '人生の質向上チェック' : theme
  const combined = Array.from(new Set([...fixed, themeTag]))
  return combined.slice(0, 4)
}

function buildNoteBodyMarkdown(
  core: NoteThreadsCoreResult,
  hashtags: string[],
  settings: AppSettings
): string {
  const sectionsMarkdown = core.noteSections
    .map((s) => `## ${s.heading}\n\n${s.body}`)
    .join('\n\n')

  const parts = [
    core.noteTitle,
    '',
    core.noteLead,
    '',
    sectionsMarkdown,
    '',
    '## まとめ',
    '',
    core.noteSummary,
    '',
    settings.noteCtaBlock,
    '',
    `▶ 公式LINE：${settings.lineUrl}`,
    '',
    hashtags.map((h) => `#${h}`).join(' ')
  ]
  return parts.join('\n')
}

export function buildNoteDraft(
  core: NoteThreadsCoreResult,
  source: SourceSelection,
  settings: AppSettings,
  extra: { id: string; printDate: string; regenerationCount: number }
): NoteDraft {
  const hashtags = buildNoteHashtags(source.theme, settings)
  const bodyMarkdown = buildNoteBodyMarkdown(core, hashtags, settings)
  return {
    id: extra.id,
    createdAt: new Date().toISOString(),
    printDate: extra.printDate,
    sourceTheme: source.theme,
    sourcePostTitle: source.postTitle,
    sourceAngleLabel: source.angleLabel,
    title: core.noteTitle,
    lead: core.noteLead,
    sections: core.noteSections,
    summary: core.noteSummary,
    ctaBlock: settings.noteCtaBlock,
    hashtags,
    bodyMarkdown,
    imagePrompt: '',
    regenerationCount: extra.regenerationCount,
    source: core.source
  }
}

// ---------- Threads組み立て ----------

function buildThreadsBody(core: NoteThreadsCoreResult, pattern: ThreadsPatternKey, noteUrl?: string): string {
  if (pattern === 'link_share') {
    const url = noteUrl && noteUrl.trim() ? noteUrl.trim() : '[ここに公開後のNOTE記事URLを貼り付けてください]'
    return [core.threadsLinkShareLine, '', url].join('\n')
  }
  if (pattern === 'assertive') {
    return core.threadsAssertiveBody
  }
  return [core.threadsMantraHeading, '', ...core.threadsMantraLines].join('\n')
}

export function buildThreadsDraft(
  core: NoteThreadsCoreResult,
  source: SourceSelection,
  pattern: ThreadsPatternKey,
  extra: { id: string; printDate: string; publishTime: string; regenerationCount: number; noteUrl?: string }
): ThreadsDraft {
  return {
    id: extra.id,
    createdAt: new Date().toISOString(),
    printDate: extra.printDate,
    sourceTheme: source.theme,
    sourcePostTitle: source.postTitle,
    sourceAngleLabel: source.angleLabel,
    pattern,
    publishTime: extra.publishTime,
    noteUrl: extra.noteUrl,
    bodyText: buildThreadsBody(core, pattern, extra.noteUrl),
    regenerationCount: extra.regenerationCount,
    source: core.source
  }
}

// 1日3本体制(v2仕様): 1回の生成操作でA/B/Cの3投稿をまとめて作る。
// 7:00=B(断定意見・問題提起型) / 12:30=A(NOTEリンクシェア型) / 21:30=C(マントラ列挙型)。
// 投稿間隔が4時間以上空くようにするThreadsのアルゴリズム推奨に合わせた時間割。
export const THREADS_DAILY_SLOTS: { time: string; pattern: ThreadsPatternKey }[] = [
  { time: '7:00', pattern: 'assertive' },
  { time: '12:30', pattern: 'link_share' },
  { time: '21:30', pattern: 'mantra' }
]

export function buildThreadsDraftsForDay(
  core: NoteThreadsCoreResult,
  source: SourceSelection,
  extra: { idPrefix: string; printDate: string; regenerationCount: number; noteUrl?: string }
): ThreadsDraft[] {
  return THREADS_DAILY_SLOTS.map((slot) =>
    buildThreadsDraft(core, source, slot.pattern, {
      id: `${extra.idPrefix}-${slot.pattern}`,
      printDate: extra.printDate,
      publishTime: slot.time,
      regenerationCount: extra.regenerationCount,
      // NOTE記事URLはA(12:30・リンクシェア型)でのみ使用する
      noteUrl: slot.pattern === 'link_share' ? extra.noteUrl : undefined
    })
  )
}

// ---------- 履歴エントリ変換 ----------

export function toNoteThreadsHistoryEntry(
  source: SourceSelection,
  core: NoteThreadsCoreResult,
  printDate: string,
  threadsInfo?: { pattern: ThreadsPatternKey; body: string }
): NoteThreadsHistoryEntry {
  return {
    id: `${printDate}-${source.theme}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    printDate,
    theme: source.theme,
    angleLabel: source.angleLabel,
    noteTitle: core.noteTitle,
    noteLead: core.noteLead,
    noteTitleFingerprint: fingerprint(core.noteTitle),
    threadsPattern: threadsInfo?.pattern,
    threadsBody: threadsInfo?.body,
    threadsBodyFingerprint: threadsInfo ? fingerprint(threadsInfo.body) : undefined
  }
}
