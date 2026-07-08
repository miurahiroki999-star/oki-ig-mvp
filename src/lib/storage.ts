// ローカル保存レイヤー。将来 Supabase 等に差し替えやすいよう、
// 呼び出し側は必ずこのモジュール経由でデータを読み書きする。

import { AppSettings, BackgroundTemplate, GenerationBatch, HistoryEntry, PhotoAsset } from '../types'

const KEYS = {
  settings: 'oki_ig_carousel_settings_v1',
  history: 'oki_ig_carousel_history_v1',
  batches: 'oki_ig_carousel_batches_v1',
  printRunCounters: 'oki_ig_carousel_print_run_counters_v1',
  legacyPhotos: 'oki_ig_legacy_photos_v1',
  legacyTemplates: 'oki_ig_legacy_templates_v1'
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value))
}

// ---------- 設定 ----------
// service / Present / profile / よくある相談 は応樹さんから素材回収中のため、
// 【5. 投稿欄本文構成】の仮置き例をそのまま初期値にしている。設定画面で差し替え可能。
export const defaultSettings: AppSettings = {
  displayName: '吉澤瑛',
  title: '人生の質向上コンサルタント',
  lineUrl: 'https://lin.ee/ybEF6h1',
  openaiModel: 'gpt-5.4-mini',
  forbiddenWords: ['絶対に稼げます', 'これで治ります', '必ず変わります', '医療効果を保証'],
  baseHashtags: [
    '人生の質向上',
    'ウェルネスライフ',
    '健康とお金',
    '人間関係改善',
    '使命を生きる',
    'ダイヤモンド覚醒セッション',
    'ご縁を大切に',
    '瞑想習慣',
    'ライフウェルネス'
  ],
  postsPerDay: 5,
  slidesPerPost: 8,
  testimonialBlock: [
    '―――🗣よくある相談―――',
    '',
    '✔ 人と会うと疲れてしまう',
    '✔ 頑張っているのに現実が軽くならない',
    '✔ 健康・お金・人間関係のどこから整えればいいか分からない',
    '✔ 使命やご縁の流れを感じにくい'
  ].join('\n'),
  serviceBlock: [
    '―――💎service―――',
    '',
    '💎 人生の質向上チェック',
    '健康・お金・人間関係・使命の整えどころを見つける入口',
    '',
    '💎 ダイヤモンド覚醒セッション',
    '本来の自分に戻るための個別セッション',
    '',
    '💎 瞑想会',
    '心と状態を整え、ご縁を深める時間'
  ].join('\n'),
  presentBlock: [
    '―――🎁Present―――',
    '',
    '公式LINE登録者限定で',
    '「人生の質向上チェック」をご案内しています。',
    '',
    'ご登録はプロフィールのリンクから'
  ].join('\n'),
  profileBlock: [
    '―――🌿profile―――',
    '',
    '吉澤瑛（よしざわ あきら）',
    '',
    '株式会社エル・クオリティ 代表取締役',
    'ライフウェルネス・アソシエーション 代表',
    '',
    '20年以上にわたり、',
    '健康・心・人生の質向上に関わる活動を継続。',
    '',
    '瞑想指導、個人コンサルティング、',
    'コミュニティ運営を通じて、',
    '身体・心・経済・人間関係・使命を',
    '総合的にサポートしています。',
    '',
    '「より心地よく、より豊かに、',
    '自分らしく生きる人を増やす」ことを使命に、',
    '人生の質向上をテーマに活動しています。',
    '',
    '32年間で2万人以上を鑑定してきた',
    'プロ鑑定士',
    '（手相・タロット・西洋占星術）としても活動。'
  ].join('\n')
}

export function getSettings(): AppSettings {
  // 旧バージョンのキーからの引き継ぎは行わず、常にカルーセル版の既定値を土台にする
  const saved = readJson<Partial<AppSettings> | null>(KEYS.settings, null)
  if (!saved) return defaultSettings

  const merged = { ...defaultSettings, ...saved }

  // v12 posting cadence migration:
  // 1日5回カルーセル投稿で確定したため、古い3投稿設定がlocalStorageに残っていても5に戻す。
  merged.postsPerDay = 5

  // v13 profile migration:
  // 旧profileBlockがブラウザのlocalStorageに残っている場合でも、
  // 1) 「\\n」が文字として表示される不具合
  // 2) 長すぎる旧プロフィール
  // を自動で短縮版プロフィールへ差し替える。
  const savedProfile = typeof saved.profileBlock === 'string' ? saved.profileBlock : ''
  const hasLiteralEscapedNewlines = savedProfile.includes('\\n')
  const hasOldLongProfile =
    savedProfile.includes('累計2万人以上｜鑑定実績') ||
    savedProfile.includes('才能・強み・使命を明確化し、人生を加速させるサポート')
  const hasOldShortProfileOrder = savedProfile.includes('32年間で2万人以上を鑑定してきた')

  if (hasLiteralEscapedNewlines || hasOldLongProfile || hasOldShortProfileOrder) {
    merged.profileBlock = defaultSettings.profileBlock
  }

  return merged
}
export function saveSettings(s: AppSettings) {
  writeJson(KEYS.settings, s)
}
export function resetSettingsToDefaults() {
  writeJson(KEYS.settings, defaultSettings)
  return defaultSettings
}


function normalizeHistoryText(text: string): string {
  return (text || '')
    .replace(/\s+/g, '')
    .replace(/[、。,.，．！？!?\-ー—―「」『』（）()【】［］\[\]・✔●○\u3000]/g, '')
    .trim()
}

function historySlideFingerprint(role: string | undefined, text: string): string {
  return `${role || '本文'}:${normalizeHistoryText(text)}`
}

function historyFromBatchPost(post: any): HistoryEntry | null {
  if (!post || !Array.isArray(post.slides)) return null
  const topSlide = post.slides.find((s: any) => s?.role === 'TOP')
  const middleSlides = post.slides.filter((s: any) => s?.role && s.role !== 'TOP' && s.role !== 'CTA')
  const slideFingerprints = middleSlides
    .map((s: any) => historySlideFingerprint(s.role, s.mainText || ''))
    .filter((s: string) => s.length > 0)
  const slideMainTexts = middleSlides
    .map((s: any) => String(s.mainText || '').trim())
    .filter((s: string) => s.length > 0)
  const problem = middleSlides.find((s: any) => s?.role === '問題提起')
  return {
    id: `batch-${post.id || `${post.printDate}-${post.dayIndex}-${post.postIndex}`}`,
    createdAt: post.createdAt || new Date().toISOString(),
    printDate: post.printDate || '',
    printRun: post.printRun || 0,
    dayIndex: post.dayIndex || 1,
    postIndex: post.postIndex || 1,
    publishTime: post.publishTime,
    theme: post.theme || '健康',
    postTitle: post.postTitle || topSlide?.headline || '',
    topHeadline: topSlide?.headline || post.postTitle || '',
    captionLead: post.captionLead || '',
    angleKey: post.angleKey,
    angleLabel: post.angleLabel,
    angleInstruction: post.angleInstruction,
    problemFingerprint: problem ? historySlideFingerprint('問題提起', problem.mainText || '') : undefined,
    slideFingerprints,
    slideMainTexts,
    entryType: 'generated',
    source: post.source || 'local'
  }
}

function dedupeHistory(entries: HistoryEntry[]): HistoryEntry[] {
  const seen = new Set<string>()
  const out: HistoryEntry[] = []
  entries.forEach((e) => {
    const key = e.id || `${e.printDate}-${e.printRun}-${e.dayIndex}-${e.postIndex}-${e.topHeadline}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(e)
  })
  return out
}

// ---------- 履歴(重複回避用) ----------
// 履歴は上書きせず、生成済み(generated)・再生成済み(regenerated)をすべて追加保存する。
export function getHistory(): HistoryEntry[] {
  const saved = readJson<HistoryEntry[]>(KEYS.history, [])
  const batches = readJson<GenerationBatch[]>(KEYS.batches, [])
  const derived = batches.flatMap((b: any) => Array.isArray(b.posts) ? b.posts.map(historyFromBatchPost).filter(Boolean) as HistoryEntry[] : [])
  return dedupeHistory([...saved, ...derived])
}
export function appendHistory(entries: HistoryEntry[]) {
  // 保存済みバッチから派生する履歴は書き込まず、明示履歴だけ保存する。
  const cur = readJson<HistoryEntry[]>(KEYS.history, [])
  writeJson(KEYS.history, dedupeHistory([...cur, ...entries]))
}
export function resetHistory() {
  writeJson(KEYS.history, [])
}

// ---------- 生成バッチ ----------
export function getBatches(): GenerationBatch[] {
  return readJson(KEYS.batches, [])
}
export function saveBatch(batch: GenerationBatch) {
  const cur = getBatches()
  const idx = cur.findIndex((b) => b.printDate === batch.printDate && b.printRun === batch.printRun)
  if (idx >= 0) cur[idx] = batch
  else cur.push(batch)
  writeJson(KEYS.batches, cur)
}

// ---------- 打ち出し回カウンター（日付ごと） ----------
export function getNextPrintRun(printDate: string): number {
  const counters = readJson<Record<string, number>>(KEYS.printRunCounters, {})
  const next = (counters[printDate] ?? 0) + 1
  counters[printDate] = next
  writeJson(KEYS.printRunCounters, counters)
  return next
}


// ---------- 旧MVP互換（旧ファイルがGitHubに残っていてもビルドを落とさないため） ----------
export function getPhotos(): PhotoAsset[] {
  return readJson<PhotoAsset[]>(KEYS.legacyPhotos, [])
}
export function savePhotos(photos: PhotoAsset[]) {
  writeJson(KEYS.legacyPhotos, photos)
}
export function getTemplates(): BackgroundTemplate[] {
  return readJson<BackgroundTemplate[]>(KEYS.legacyTemplates, [])
}
export function saveTemplates(templates: BackgroundTemplate[]) {
  writeJson(KEYS.legacyTemplates, templates)
}
