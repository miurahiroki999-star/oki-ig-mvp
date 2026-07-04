// ローカル保存レイヤー。将来 Supabase に差し替えやすいよう、
// 呼び出し側は必ずこのモジュール経由でデータを読み書きする。

import { AppSettings, BackgroundTemplate, GenerationBatch, HistoryEntry, PhotoAsset } from '../types'

const KEYS = {
  settings: 'oki_ig_settings_v1',
  templates: 'oki_ig_templates_v1',
  photos: 'oki_ig_photos_v1',
  history: 'oki_ig_history_v1',
  batches: 'oki_ig_batches_v1',
  printRunCounters: 'oki_ig_print_run_counters_v1'
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
export const defaultSettings: AppSettings = {
  displayName: '吉澤瑛',
  title: '人生の質向上コンサルタント',
  lineUrl: 'https://lin.ee/ybEF6h1',
  openaiModel: 'gpt-5.4-mini',
  brandColorFrom: '#eaf7ec',
  brandColorTo: '#bfe8c4',
  forbiddenWords: ['絶対に稼げます', 'これで治ります', '必ず変わります', '医療効果を保証'],
  baseHashtags: [
    '人生の質向上',
    'ウェルネスライフ',
    '健康とお金',
    '人間関係改善',
    '使命を生きる',
    '瞑想習慣',
    'ご縁を大切に',
    'ライフウェルネス',
    '自分を整える'
  ],
  usePhotosForTrustPosts: false
}

export function getSettings(): AppSettings {
  return readJson(KEYS.settings, defaultSettings)
}
export function saveSettings(s: AppSettings) {
  writeJson(KEYS.settings, s)
}

// ---------- 背景テンプレート ----------
function defaultTemplates(): BackgroundTemplate[] {
  const feedStyles: BackgroundTemplate['style'][] = ['gradient', 'blob', 'wave', 'frame', 'dot']
  const now = new Date().toISOString()
  const palette = [
    ['#f4fbf3', '#cdeed0'],
    ['#eefaf1', '#bfe8c4'],
    ['#f7fbf4', '#d7edd6'],
    ['#eef9f2', '#c8ecd6'],
    ['#f5faf0', '#d2e9c9']
  ]
  const templates: BackgroundTemplate[] = []
  ;(['フィード', 'ストーリーズ'] as const).forEach((kind) => {
    for (let i = 0; i < 10; i++) {
      const style = feedStyles[i % feedStyles.length]
      const [colorFrom, colorTo] = palette[i % palette.length]
      templates.push({
        id: `${kind}-tpl-${i + 1}`,
        kind,
        name: `${kind}テンプレート${i + 1}`,
        style,
        colorFrom,
        colorTo,
        accent: '#e7d9a8',
        createdAt: now
      })
    }
  })
  return templates
}

export function getTemplates(): BackgroundTemplate[] {
  const existing = readJson<BackgroundTemplate[] | null>(KEYS.templates, null)
  if (existing && existing.length > 0) return existing
  const seeded = defaultTemplates()
  writeJson(KEYS.templates, seeded)
  return seeded
}
export function saveTemplates(t: BackgroundTemplate[]) {
  writeJson(KEYS.templates, t)
}

// ---------- 写真素材集 ----------
export function getPhotos(): PhotoAsset[] {
  return readJson(KEYS.photos, [])
}
export function savePhotos(p: PhotoAsset[]) {
  writeJson(KEYS.photos, p)
}

// ---------- 履歴 ----------
// 仕様変更: 履歴は上書きせず、生成済み(generated)・再生成済み(regenerated)・編集済み(edited)を
// すべて追加保存する。過去案を画面上でメイン表示する必要はないが、履歴・重複回避チェックには
// 常に全件を残す。
export function getHistory(): HistoryEntry[] {
  return readJson(KEYS.history, [])
}
export function appendHistory(entries: HistoryEntry[]) {
  const cur = getHistory()
  writeJson(KEYS.history, [...cur, ...entries])
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
