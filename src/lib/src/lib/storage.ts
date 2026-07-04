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
  postsPerDay: 3,
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
    '吉澤瑛',
    '人生の質向上コンサルタント',
    '株式会社エル・クオリティ代表取締役',
    'Life Wellness Association代表'
  ].join('\n')
}

export function getSettings(): AppSettings {
  // 旧バージョンのキーからの引き継ぎは行わず、常にカルーセル版の既定値を土台にする
  const saved = readJson<Partial<AppSettings> | null>(KEYS.settings, null)
  if (!saved) return defaultSettings
  return { ...defaultSettings, ...saved }
}
export function saveSettings(s: AppSettings) {
  writeJson(KEYS.settings, s)
}
export function resetSettingsToDefaults() {
  writeJson(KEYS.settings, defaultSettings)
  return defaultSettings
}

// ---------- 履歴(重複回避用) ----------
// 履歴は上書きせず、生成済み(generated)・再生成済み(regenerated)をすべて追加保存する。
export function getHistory(): HistoryEntry[] {
  return readJson(KEYS.history, [])
}
export function appendHistory(entries: HistoryEntry[]) {
  const cur = getHistory()
  writeJson(KEYS.history, [...cur, ...entries])
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
